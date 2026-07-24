"""
Analytics Service Layer
Scoring logic, leaderboard operations, portfolio metrics calculation
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import date, datetime
from flask import current_app
from groq import Groq
from app.scoring.thesis_engine import thesis_score  # Fallback helper

from app.cache import cache_get, cache_set
from app.jobs import enqueue_job
from app.market.pipeline import YahooFinancePipeline
from app.repositories import analytics_repository as repo
from app.scoring.final_scoring_engine import TradeIQScoringEngine
from app.services.market_service import (
    MarketError,
    _validate_ticker,
    _validate_date_range,
    get_price_with_staleness,
)

# ─────────────────────────────────────────
# Configuration & Caching
# ─────────────────────────────────────────

OPENAI_SCORE_MODEL = os.getenv("OPENAI_SCORE_MODEL", "gpt-4.1-mini")
GROQ_SCORE_MODEL = os.getenv("GROQ_SCORE_MODEL", "llama-3.3-70b-versatile")
REFRESH_INTERVAL_SECONDS = 300  # 5 minutes
REFRESH_LOCK_SECONDS = 30     # 30-second claim window to avoid duplicate triggers

pipeline = YahooFinancePipeline()

_groq_client = None


def _get_groq_client():
    """Lazily construct the Groq client so import doesn't fail without a key."""
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return None
        _groq_client = Groq(api_key=api_key)
    return _groq_client


# ─────────────────────────────────────────
# Error Handling
# ─────────────────────────────────────────

class AnalyticsError(Exception):
    """Raised when analytics/scoring request fails.
    Carries the HTTP status code the route should respond with."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ─────────────────────────────────────────
# Technical & Stock Analytics Entry Points
# ─────────────────────────────────────────

def analyze_stock(ticker: str, start: str, end: str) -> dict:
    """Computes technical indicators and summary metrics for a stock over a date range."""
    ticker = _validate_ticker(ticker)
    start, end = _validate_date_range(start, end)

    try:
        dataset = pipeline.build_dataset(ticker, start, end)
        metrics = pipeline.calculate_summary_metrics(dataset)
        stock_info = pipeline.get_stock_info(ticker)
    except Exception as e:
        raise MarketError(f"Failed to generate analytics for '{ticker}': {str(e)}", 500)

    # Convert DataFrames to dict lists safely
    history = dataset["stock_history"].copy()
    history["Date"] = history["Date"].astype(str)

    benchmark = dataset["benchmark_history"].copy()
    benchmark["Date"] = benchmark["Date"].astype(str)

    return {
        "ticker": ticker,
        "company_name": stock_info.get("company_name", ticker),
        "sector": stock_info.get("sector", "N/A"),
        "industry": stock_info.get("industry", "N/A"),
        "start": start,
        "end": end,
        "summary": metrics,
        "history": history.to_dict(orient="records"),
        "benchmark": benchmark.to_dict(orient="records")
    }


def analyze_portfolio(holdings: list[dict]) -> dict:
    """
    Analyzes portfolio value, weightings, total profit/loss, and staleness flags.
    Concurrently fetches price data to keep response latency minimal.
    """
    if not holdings:
        raise MarketError("Portfolio payload must contain at least one holding", 400)

    futures = []
    holding_metadata = []

    for item in holdings:
        ticker = _validate_ticker(item.get("ticker", ""))
        try:
            shares = float(item.get("shares", 0))
            buy_price = float(item.get("buy_price", 0))
        except (ValueError, TypeError):
            raise MarketError(f"Invalid shares or buy_price for ticker '{ticker}'", 400)

        if shares <= 0 or buy_price < 0:
            raise MarketError(f"Shares must be positive and buy_price non-negative for '{ticker}'", 400)

        fut = enqueue_job(get_price_with_staleness, ticker)
        futures.append(fut)
        holding_metadata.append({
            "ticker": ticker,
            "shares": shares,
            "buy_price": buy_price
        })

    processed_holdings = []
    total_cost_basis = 0.0
    total_current_value = 0.0
    has_stale_data = False

    for meta, fut in zip(holding_metadata, futures):
        ticker = meta["ticker"]
        shares = meta["shares"]
        buy_price = meta["buy_price"]

        try:
            price_info = fut.result(timeout=8)
        except Exception:
            price_info = {"price": None, "is_stale": True, "source": "unavailable"}

        current_price = price_info.get("price")
        is_stale = price_info.get("is_stale", True)

        if is_stale or price_info.get("source") == "unavailable":
            has_stale_data = True

        cost_basis = shares * buy_price

        if current_price is not None:
            current_value = shares * current_price
            pnl = current_value - cost_basis
            pnl_pct = (pnl / cost_basis * 100) if cost_basis > 0 else 0.0
        else:
            current_value = cost_basis
            pnl = 0.0
            pnl_pct = 0.0

        total_cost_basis += cost_basis
        total_current_value += current_value

        processed_holdings.append({
            "ticker": ticker,
            "shares": shares,
            "buy_price": buy_price,
            "current_price": current_price,
            "cost_basis": cost_basis,
            "current_value": current_value,
            "pnl": round(pnl, 4),
            "pnl_pct": round(pnl_pct, 4),
            "is_stale": is_stale,
            "source": price_info.get("source", "unavailable")
        })

    for holding in processed_holdings:
        holding["weight"] = round((holding["current_value"] / total_current_value * 100), 2) if total_current_value > 0 else 0.0

    total_pnl = total_current_value - total_cost_basis
    total_pnl_pct = (total_pnl / total_cost_basis * 100) if total_cost_basis > 0 else 0.0

    return {
        "summary": {
            "total_cost_basis": round(total_cost_basis, 2),
            "total_current_value": round(total_current_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "has_stale_data": has_stale_data,
            "holding_count": len(processed_holdings)
        },
        "holdings": processed_holdings
    }


# ─────────────────────────────────────────
# Thesis Scoring Helpers
# ─────────────────────────────────────────

def _score_thesis_texts(trades):
    """Local rubric: score thesis texts on clarity, logic, risk awareness, market understanding."""
    texts = [t.thesis.strip() for t in trades if t.thesis and t.thesis.strip()]
    if not texts:
        return {
            "clarity": 0.0,
            "financial_logic": 0.0,
            "risk_awareness": 0.0,
            "market_understanding": 0.0,
        }

    combined = " ".join(texts).lower()
    words = [w.strip(".,;:!?()[]{}") for w in combined.split()]
    unique_ratio = len(set(words)) / max(len(words), 1)

    finance_terms = {
        "revenue", "earnings", "margin", "valuation", "cash", "profit",
        "growth", "multiple", "pe", "ebitda", "dividend", "yield", "fcf",
    }
    risk_terms = {
        "risk", "downside", "drawdown", "volatility", "beta", "hedge",
        "stop", "loss", "rate", "inflation", "competition", "regulation",
    }
    market_terms = {
        "sector", "market", "macro", "cycle", "demand", "supply",
        "benchmark", "index", "trend", "catalyst", "sentiment", "rates",
    }

    avg_words = sum(len(text.split()) for text in texts) / len(texts)
    clarity = min(1.25, 0.35 + (0.45 if 12 <= avg_words <= 50 else 0.18) + min(unique_ratio, 0.45))
    financial_logic = min(1.25, 0.25 + 0.25 * min(sum(1 for w in words if w in finance_terms), 4))
    risk_awareness = min(1.25, 0.25 + 0.25 * min(sum(1 for w in words if w in risk_terms), 4))
    market_understanding = min(1.25, 0.25 + 0.25 * min(sum(1 for w in words if w in market_terms), 4))

    return {
        "clarity": round(clarity, 2),
        "financial_logic": round(financial_logic, 2),
        "risk_awareness": round(risk_awareness, 2),
        "market_understanding": round(market_understanding, 2),
    }


def _extract_response_text(response_payload):
    """Extract text from OpenAI API response."""
    if isinstance(response_payload.get("output_text"), str):
        return response_payload["output_text"]

    chunks = []
    for item in response_payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in ("output_text", "text") and content.get("text"):
                chunks.append(content["text"])
    return "\n".join(chunks)


# ─────────────────────────────────────────
# Benchmark & Market Data
# ─────────────────────────────────────────

def _benchmark_return(trades):
    """Calculate S&P 500 return from first trade date to today."""
    trade_dates = [t.trade_date for t in trades if t.trade_date]
    if not trade_dates:
        return 0.0

    start_date = min(trade_dates).isoformat()
    end_date = date.today().isoformat()
    try:
        benchmark = pipeline.get_benchmark_data(start_date, end_date)
        if benchmark.empty or len(benchmark) < 2:
            return 0.0
        first_close = float(benchmark["Close"].iloc[0])
        last_close = float(benchmark["Close"].iloc[-1])
        if first_close == 0:
            return 0.0
        return round(((last_close - first_close) / first_close) * 100, 4)
    except Exception:
        return 0.0


# ─────────────────────────────────────────
# Holdings & Trade Processing
# ─────────────────────────────────────────

def _refresh_active_holdings(holdings):
    """
    Concurrently update market values and profit/loss for active holdings
    using resilient price lookups to prevent blocking overhead.
    """
    active_holdings = [h for h in holdings if float(h.quantity or 0) > 0]
    if not active_holdings:
        return []

    # Enqueue concurrent tasks for price fetching
    futures = [enqueue_job(get_price_with_staleness, holding.stock_ticker) for holding in active_holdings]

    for holding, fut in zip(active_holdings, futures):
        try:
            price_info = fut.result(timeout=6)
        except Exception:
            price_info = {"price": None}

        current_price = float(price_info.get("price") or holding.current_price or holding.avg_buy_price or 0)
        quantity = float(holding.quantity or 0)
        avg_buy = float(holding.avg_buy_price or 0)

        holding.current_price = round(current_price, 4)
        holding.market_value = round(quantity * current_price, 4)
        holding.profit_loss = round((current_price - avg_buy) * quantity, 4)

    return active_holdings


def _latest_trade_by_ticker(trades):
    """Index trades by ticker, keeping only the latest for each."""
    latest = {}
    for trade in sorted(trades, key=lambda t: t.created_at or datetime.min):
        if trade.stock_ticker:
            latest[trade.stock_ticker.upper()] = trade
    return latest


def _active_trades(active_holdings, trades):
    """Get the most recent trade for each active holding."""
    latest_trade_lookup = _latest_trade_by_ticker(trades)
    active_tickers = {
        (holding.stock_ticker or "").upper()
        for holding in active_holdings
        if float(holding.quantity or 0) > 0
    }
    return [
        latest_trade_lookup[ticker]
        for ticker in active_tickers
        if latest_trade_lookup.get(ticker)
    ]


# ─────────────────────────────────────────
# AI Scoring: OpenAI (primary) → Groq (fallback) → Local rubric (last resort)
# ─────────────────────────────────────────

def _openai_scorecard(data, metrics, trades):
    """Call OpenAI API for full scorecard (returns None if API unavailable)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    trade_payload = [
        {
            "ticker": t.stock_ticker,
            "stock_name": t.stock_name,
            "sector": t.sector,
            "allocation_percent": float(t.allocation_percent or 0),
            "amount_invested": float(t.amount_invested or 0),
            "trade_type": t.trade_type,
            "tag1": t.tag1,
            "tag2": t.tag2,
            "tag3": t.tag3,
            "thesis": t.thesis,
        }
        for t in trades
    ]

    prompt = {
        "rubric": {
            "portfolio_score": "0-40: portfolio performance, benchmark-relative return, net profit, and capital deployment.",
            "risk_score": "0-20: risk governance, drawdown control, beta discipline, diversification limits, and cash prudence.",
            "thesis_score": "0-20: thesis quality, financial reasoning, market awareness, clarity, and explicit risk awareness.",
            "execution_score": "0-10: complete stock selection, sensible tags, thesis coverage, and trade documentation.",
            "strategy_score": "0-10: sector spread, allocation discipline, consistency, and stock-picking logic.",
        },
        "constraints": "Return only valid JSON with numeric scores. Scores must sum to final_score out of 100.",
        "portfolio_inputs": data,
        "portfolio_metrics": metrics,
        "trades": trade_payload,
    }

    body = json.dumps({
        "model": OPENAI_SCORE_MODEL,
        "input": [
            {
                "role": "system",
                "content": (
                    "You are the TradeIQ scoring evaluator for an educational investment banking sales "
                    "and trading risk challenge. Score only from the supplied portfolio data and theses. "
                    "Do not invent trades or users. Be strict, consistent, and return JSON only."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(prompt),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "tradeiq_scorecard",
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "portfolio_score": {"type": "number", "minimum": 0, "maximum": 40},
                        "risk_score": {"type": "number", "minimum": 0, "maximum": 20},
                        "thesis_score": {"type": "number", "minimum": 0, "maximum": 20},
                        "execution_score": {"type": "number", "minimum": 0, "maximum": 10},
                        "strategy_score": {"type": "number", "minimum": 0, "maximum": 10},
                        "final_score": {"type": "number", "minimum": 0, "maximum": 100},
                        "feedback": {"type": "string"},
                    },
                    "required": [
                        "portfolio_score",
                        "risk_score",
                        "thesis_score",
                        "execution_score",
                        "strategy_score",
                        "final_score",
                        "feedback",
                    ],
                },
            },
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            parsed = json.loads(response.read().decode("utf-8"))
        result = json.loads(_extract_response_text(parsed))
        result["portfolio_score"] = round(max(0, min(40, float(result["portfolio_score"]))), 2)
        result["risk_score"] = round(max(0, min(20, float(result["risk_score"]))), 2)
        result["thesis_score"] = round(max(0, min(20, float(result["thesis_score"]))), 2)
        result["execution_score"] = round(max(0, min(10, float(result["execution_score"]))), 2)
        result["strategy_score"] = round(max(0, min(10, float(result["strategy_score"]))), 2)
        result["final_score"] = round(
            result["portfolio_score"]
            + result["risk_score"]
            + result["thesis_score"]
            + result["execution_score"]
            + result["strategy_score"],
            2,
        )
        result["source"] = f"openai:{OPENAI_SCORE_MODEL}"
        return result
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        return None


def _groq_scorecard(data, metrics, trades):
    """Call Groq API for full scorecard (returns None if API unavailable). Same shape/rubric as _openai_scorecard."""
    client = _get_groq_client()
    if not client:
        return None

    trade_payload = [
        {
            "ticker": t.stock_ticker,
            "stock_name": t.stock_name,
            "sector": t.sector,
            "allocation_percent": float(t.allocation_percent or 0),
            "amount_invested": float(t.amount_invested or 0),
            "trade_type": t.trade_type,
            "tag1": t.tag1,
            "tag2": t.tag2,
            "tag3": t.tag3,
            "thesis": t.thesis,
        }
        for t in trades
    ]

    prompt = {
        "rubric": {
            "portfolio_score": "0-40: portfolio performance, benchmark-relative return, net profit, and capital deployment.",
            "risk_score": "0-20: risk governance, drawdown control, beta discipline, diversification limits, and cash prudence.",
            "thesis_score": "0-20: thesis quality, financial reasoning, market awareness, clarity, and explicit risk awareness.",
            "execution_score": "0-10: complete stock selection, sensible tags, thesis coverage, and trade documentation.",
            "strategy_score": "0-10: sector spread, allocation discipline, consistency, and stock-picking logic.",
        },
        "constraints": (
            "Return only valid JSON with numeric scores and keys: portfolio_score, risk_score, "
            "thesis_score, execution_score, strategy_score, final_score, feedback. "
            "Scores must sum to final_score out of 100."
        ),
        "portfolio_inputs": data,
        "portfolio_metrics": metrics,
        "trades": trade_payload,
    }

    try:
        response = client.chat.completions.create(
            model=GROQ_SCORE_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are the TradeIQ scoring evaluator for an educational investment banking sales "
                        "and trading risk challenge. Score only from the supplied portfolio data and theses. "
                        "Do not invent trades or users. Be strict, consistent, and return JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            timeout=30,
        )
        result = json.loads(response.choices[0].message.content)
        result["portfolio_score"] = round(max(0, min(40, float(result["portfolio_score"]))), 2)
        result["risk_score"] = round(max(0, min(20, float(result["risk_score"]))), 2)
        result["thesis_score"] = round(max(0, min(20, float(result["thesis_score"]))), 2)
        result["execution_score"] = round(max(0, min(10, float(result["execution_score"]))), 2)
        result["strategy_score"] = round(max(0, min(10, float(result["strategy_score"]))), 2)
        result["final_score"] = round(
            result["portfolio_score"]
            + result["risk_score"]
            + result["thesis_score"]
            + result["execution_score"]
            + result["strategy_score"],
            2,
        )
        result["source"] = f"groq:{GROQ_SCORE_MODEL}"
        return result
    except Exception as e:
        print(f"[Analytics] Groq scorecard error: {e}")
        return None


def _openai_thesis_points(trades):
    """Call OpenAI API for thesis score only (returns None if API unavailable)."""
    api_key = os.getenv("OPENAI_API_KEY")
    thesis_texts = [t.thesis.strip() for t in trades if t.thesis and t.thesis.strip()]
    if not api_key or not thesis_texts:
        return None

    body = json.dumps({
        "model": OPENAI_SCORE_MODEL,
        "input": [
            {
                "role": "system",
                "content": (
                    "You grade investment thesis quality for TradeIQ. Score clarity, financial logic, "
                    "and risk awareness from the provided thesis text only. Return JSON only."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "score_range": "0 to 20",
                    "baseline_rule": "Only use this dynamic score because thesis text has been submitted.",
                    "theses": thesis_texts,
                }),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "tradeiq_thesis_score",
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "thesis_score": {"type": "number", "minimum": 0, "maximum": 20},
                        "feedback": {"type": "string"},
                    },
                    "required": ["thesis_score", "feedback"],
                },
            },
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            parsed = json.loads(response.read().decode("utf-8"))
        result = json.loads(_extract_response_text(parsed))
        return round(max(0, min(20, float(result["thesis_score"]))), 2)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        return None


def _groq_thesis_points(trades):
    """Call Groq API for thesis score only (returns None if API unavailable)."""
    client = _get_groq_client()
    thesis_texts = [t.thesis.strip() for t in trades if t.thesis and t.thesis.strip()]
    if not client or not thesis_texts:
        return None

    try:
        response = client.chat.completions.create(
            model=GROQ_SCORE_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You grade investment thesis quality for TradeIQ. Score clarity, financial logic, "
                        "and risk awareness from the provided thesis text only. Return JSON only with keys "
                        "'thesis_score' (number 0-20) and 'feedback' (string)."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "score_range": "0 to 20",
                        "baseline_rule": "Only use this dynamic score because thesis text has been submitted.",
                        "theses": thesis_texts,
                    }),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            timeout=30,
        )
        result = json.loads(response.choices[0].message.content)
        return round(max(0, min(20, float(result["thesis_score"]))), 2)
    except Exception as e:
        print(f"[Analytics] Groq thesis scoring error: {e}")
        return None


def _local_thesis_points(thesis_texts):
    """Local rubric: score thesis texts without AI."""
    if not thesis_texts:
        return 0.0

    thesis_inputs = _score_thesis_texts([
        type("ThesisTrade", (), {"thesis": text})()
        for text in thesis_texts
    ])

    raw_score = (
        thesis_inputs["clarity"]
        + thesis_inputs["financial_logic"]
        + thesis_inputs["risk_awareness"]
        + thesis_inputs["market_understanding"]
    )

    return round(
        max(0, min(20, (raw_score / 5) * 20)),
        2
    )


# ─────────────────────────────────────────
# Scoring Rubrics
# ─────────────────────────────────────────

def _challenge_scorecard(portfolio_setup, active_holdings, trades, total_portfolio):
    """
    TradeIQ Challenge Scorecard (local rubric).

    Portfolio Score (40): Return on capital
    Risk Score (20): Sector diversification
    Thesis Score (20): AI (OpenAI, then Groq) or local rubric evaluation
    Execution Score (10): Tags + thesis coverage
    Strategy Score (10): Position count expansion
    """

    if not active_holdings:
        return {
            "portfolio_score": 0.0,
            "risk_score": 0.0,
            "thesis_score": 0.0,
            "execution_score": 0.0,
            "strategy_score": 0.0,
            "final_score": 0.0,
            "feedback": (
                "No active holdings. "
                "Scores remain 0 until positions are opened."
            ),
            "source": "tradeiq-rubric",
        }

    total_capital = float(portfolio_setup.total_capital or 10000)

    # ── Portfolio Score (40) ──
    return_on_capital = (
        ((total_portfolio - total_capital) / total_capital) * 100
        if total_capital > 0
        else 0
    )
    portfolio_score = round(max(0, min(40, 20 + return_on_capital)), 2)

    # ── Risk Score (20) ──
    active_trade_rows = _active_trades(active_holdings, trades)
    sectors = {trade.sector for trade in active_trade_rows if trade.sector}
    sector_count = len(sectors)

    if sector_count >= 3:
        risk_score = 20
    elif sector_count == 2:
        risk_score = 14
    elif sector_count == 1:
        risk_score = 8
    else:
        risk_score = 0

    # ── Thesis Score (20) ──
    # Fallback chain: OpenAI -> Groq -> local rubric
    thesis_texts = [
        t.thesis.strip()
        for t in active_trade_rows
        if t.thesis and t.thesis.strip()
    ]

    if not thesis_texts:
        thesis_score = 0
    else:
        ai_score = _openai_thesis_points(active_trade_rows)
        if ai_score is None:
            ai_score = _groq_thesis_points(active_trade_rows)
        if ai_score is not None:
            thesis_score = ai_score
        else:
            thesis_score = _local_thesis_points(thesis_texts)

    thesis_score = round(max(0, min(20, thesis_score)), 2)

    # ── Execution Score (10) ──
    total_active_trades = len(active_trade_rows)
    all_tags = []
    for trade in active_trade_rows:
        all_tags.extend([tag for tag in [trade.tag1, trade.tag2, trade.tag3] if tag])

    unique_tags = len(set(all_tags))
    trades_with_thesis = sum(1 for trade in active_trade_rows if trade.thesis and trade.thesis.strip())

    classification_points = (
        min(5, (unique_tags / total_active_trades) * 5)
        if total_active_trades > 0
        else 0
    )
    documentation_points = (
        min(5, (trades_with_thesis / total_active_trades) * 5)
        if total_active_trades > 0
        else 0
    )
    execution_score = round(classification_points + documentation_points, 2)

    # ── Strategy Score (10) ──
    position_count = len(active_holdings)

    if position_count >= 5:
        strategy_score = 10
    elif position_count >= 3:
        strategy_score = 8
    elif position_count >= 2:
        strategy_score = 6
    elif position_count == 1:
        strategy_score = 4
    else:
        strategy_score = 0

    # ── Final Score ──
    final_score = round(
        portfolio_score + risk_score + thesis_score + execution_score + strategy_score,
        2,
    )

    return {
        "portfolio_score": float(portfolio_score),
        "risk_score": float(risk_score),
        "thesis_score": float(thesis_score),
        "execution_score": float(execution_score),
        "strategy_score": float(strategy_score),
        "final_score": float(final_score),
        "feedback": (
            "Portfolio score based on Return on Capital. "
            "Risk score based on sector diversification. "
            "Thesis score based on AI evaluation (OpenAI, then Groq) or local thesis rubric. "
            "Execution score based on trade tags and thesis coverage. "
            "Strategy score rewards portfolio expansion."
        ),
        "source": "tradeiq-rubric",
    }


def _zero_scorecard():
    """Return a blank scorecard (all zeros)."""
    return {
        "portfolio_score": 0.0,
        "risk_score": 0.0,
        "thesis_score": 0.0,
        "execution_score": 0.0,
        "strategy_score": 0.0,
        "final_score": 0.0,
        "feedback": "No active holdings yet. Scores stay at 0 until the first trade creates an active position.",
        "source": "tradeiq-rubric",
    }


# ─────────────────────────────────────────
# Score Payload Construction
# ─────────────────────────────────────────

def _score_payload(user_id):
    """
    Orchestrate all data gathering and scoring for a user.
    Returns (payload_dict, error) where error is None on success.
    """
    portfolio = repo.find_portfolio_by_user(user_id)
    if not portfolio:
        return {
            "inputs": {
                "portfolio_return_pct": 0.0,
                "return_on_capital_pct": 0.0,
                "benchmark_growth_pct": 2.0,
                "net_profit": 0.0,
                "total_capital": 10000.0,
                "cash_balance": 10000.0,
                "holdings_value": 0.0,
                "active_holdings": 0,
                "unique_sectors": 0,
                "max_allocation": 0.0,
                "total_trades": 0,
                "trades_with_thesis": 0,
                "unique_tags": 0,
            },
            "scores": _zero_scorecard(),
            "metrics": {
                "portfolio_value": 10000.0,
                "desk_return_expansion": 0.0,
                "available_cash_depot": 10000.0,
                "holdings_value": 0.0,
                "net_profit": 0.0,
            },
        }, None

    trades = repo.find_trades_by_user(user_id)
    holdings = repo.find_holdings_by_user(user_id)
    active_holdings = _refresh_active_holdings(holdings)
    repo.flush()

    total_capital = float(portfolio.total_capital or 10000)
    cash_balance = float(portfolio.cash_balance)
    holdings_value = sum(float(h.market_value or 0) for h in active_holdings)
    total_portfolio = cash_balance + holdings_value
    portfolio_return = ((total_portfolio - total_capital) / total_capital) * 100 if total_capital else 0.0
    net_profit = total_portfolio - total_capital

    trades_by_ticker = _latest_trade_by_ticker(trades)
    active_trade_rows = _active_trades(active_holdings, trades)
    active_sectors = {
        trades_by_ticker.get((h.stock_ticker or "").upper()).sector
        for h in active_holdings
        if trades_by_ticker.get((h.stock_ticker or "").upper())
        and trades_by_ticker.get((h.stock_ticker or "").upper()).sector
    }
    active_allocations = [
        float(trades_by_ticker.get((h.stock_ticker or "").upper()).allocation_percent or 0)
        for h in active_holdings
        if trades_by_ticker.get((h.stock_ticker or "").upper())
    ]
    active_tags = [
        tag
        for trade in active_trade_rows
        for tag in [trade.tag1, trade.tag2, trade.tag3]
        if tag
    ]

    data = {
        "portfolio_return_pct": round(portfolio_return, 4),
        "return_on_capital_pct": round(portfolio_return, 4),
        "benchmark_growth_pct": 2.0,
        "net_profit": round(net_profit, 4),
        "total_capital": total_capital,
        "cash_balance": round(cash_balance, 4),
        "holdings_value": round(holdings_value, 4),
        "active_holdings": len(active_holdings),
        "unique_sectors": len(active_sectors),
        "max_allocation": max(active_allocations) if active_allocations else 0.0,
        "total_trades": len(active_trade_rows),
        "trades_with_thesis": sum(1 for t in active_trade_rows if t.thesis and t.thesis.strip()),
        "unique_tags": len(set(active_tags)),
    }

    metrics = {
        "portfolio_value": round(total_portfolio, 2),
        "desk_return_expansion": round(portfolio_return, 2),
        "available_cash_depot": round(cash_balance, 2),
        "holdings_value": round(holdings_value, 2),
        "net_profit": round(net_profit, 2),
    }

    result = _challenge_scorecard(portfolio, active_holdings, trades, total_portfolio)
    return {"inputs": data, "scores": result, "metrics": metrics}, None


def _portfolio_metrics(user_id):
    """Get current portfolio metrics (value, return, holdings value, etc)."""
    portfolio = repo.find_portfolio_by_user(user_id)
    if not portfolio:
        return {
            "portfolio_value": 10000.0,
            "desk_return_expansion": 0.0,
            "available_cash_depot": 10000.0,
            "holdings_value": 0.0,
            "net_profit": 0.0,
        }

    holdings = repo.find_holdings_by_user(user_id)
    active_holdings = _refresh_active_holdings(holdings)
    repo.flush()

    total_capital = float(portfolio.total_capital or 10000)
    cash_balance = float(portfolio.cash_balance)
    holdings_value = sum(float(h.market_value or 0) for h in active_holdings)
    total_portfolio = cash_balance + holdings_value
    portfolio_return = ((total_portfolio - total_capital) / total_capital) * 100 if total_capital else 0.0

    return {
        "portfolio_value": round(total_portfolio, 2),
        "desk_return_expansion": round(portfolio_return, 2),
        "available_cash_depot": round(cash_balance, 2),
        "holdings_value": round(holdings_value, 2),
        "net_profit": round(total_portfolio - total_capital, 2),
    }


# ─────────────────────────────────────────
# Score Breakdown (Display)
# ─────────────────────────────────────────

def _score_status(score, baseline=False):
    """Determine display status of a score."""
    if score is None or score <= 0:
        return "pending"
    return "baseline" if baseline else "scored"


def _score_breakdown(payload):
    """Format score details for display in response."""
    inputs = payload["inputs"]
    scores = payload["scores"]
    metrics = payload["metrics"]
    active_holdings = int(inputs.get("active_holdings") or 0)
    total_capital = float(inputs.get("total_capital") or 10000)
    return_on_capital = float(inputs.get("return_on_capital_pct") or 0)
    thesis_count = int(inputs.get("trades_with_thesis") or 0)
    unique_tags = int(inputs.get("unique_tags") or 0)
    total_trades = int(inputs.get("total_trades") or 0)

    if active_holdings == 0:
        return [
            {
                "key": "clean_slate",
                "label": "Clean Slate Baseline",
                "score": 0.0,
                "max": 100,
                "status": "active",
                "detail": "No active holdings yet. Scores remain 0 until at least one position is opened.",
            }
        ]

    return [
        {
            "key": "portfolio_score",
            "label": "Portfolio Score",
            "score": scores["portfolio_score"],
            "max": 40,
            "status": _score_status(scores["portfolio_score"]),
            "detail": (
                f"Portfolio value ${metrics['portfolio_value']:,.2f} versus starting capital "
                f"${total_capital:,.2f}; return on capital {return_on_capital:.2f}%."
            ),
        },
        {
            "key": "risk_score",
            "label": "Risk Management Score",
            "score": scores["risk_score"],
            "max": 20,
            "status": _score_status(scores["risk_score"]),
            "detail": (
                f"{inputs['unique_sectors']} distinct active sector"
                f"{'' if inputs['unique_sectors'] == 1 else 's'} represented. "
                "Three or more earns full diversification points."
            ),
        },
        {
            "key": "thesis_score",
            "label": "Thesis Score",
            "score": scores["thesis_score"],
            "max": 20,
            "status": _score_status(scores["thesis_score"]),
            "detail": (
                f"{thesis_count} submitted thesis "
                f"{'entry' if thesis_count == 1 else 'entries'} scored from clarity, financial logic, "
                "risk awareness, and market understanding."
            )
            if thesis_count > 0
            else "No submitted thesis text found for active trades yet.",
        },
        {
            "key": "execution_score",
            "label": "Execution Quality Score",
            "score": scores["execution_score"],
            "max": 10,
            "status": _score_status(scores["execution_score"]),
            "detail": (
                f"{unique_tags} unique trade tag"
                f"{'' if unique_tags == 1 else 's'} and {thesis_count}/{total_trades} active trade"
                f"{'' if total_trades == 1 else 's'} with thesis text. "
                "Tags contribute up to 5 points and thesis coverage contributes up to 5 points."
            ),
        },
        {
            "key": "strategy_score",
            "label": "Strategy Score",
            "score": scores["strategy_score"],
            "max": 10,
            "status": _score_status(scores["strategy_score"]),
            "detail": (
                f"{active_holdings} active position"
                f"{'' if active_holdings == 1 else 's'} measured. "
                "More well-spread active holdings improve this component."
            ),
        },
    ]


# ─────────────────────────────────────────
# Leaderboard Operations
# ─────────────────────────────────────────

def _leaderboard_entry_payload(entry):
    """Format a leaderboard entry for JSON response."""
    data = entry.to_dict()
    metrics = _portfolio_metrics(entry.user_id) or {}
    data["portfolio_value"] = metrics.get("portfolio_value", 10000.0)
    return data


def _refresh_leaderboard_week(week_number):
    """Recalculate and rerank all users for a given week."""
    users = repo.find_all_non_admin_users()
    for user in users:
        payload, error = _score_payload(user.user_id)
        if error:
            continue
        repo.upsert_weekly_score(user.user_id, week_number, payload["scores"])
        repo.save()  # Incremental commit per user

    _rerank_week(week_number)


def _rerank_week(week_number):
    """Rerank all weekly scores for a week and sync to leaderboard."""
    scores = repo.find_weekly_scores_by_week(week_number)

    for index, score in enumerate(scores, start=1):
        score.rank_position = index
        scores_dict = {
            "portfolio_score": score.portfolio_score,
            "risk_score": score.risk_score,
            "thesis_score": score.thesis_score,
            "execution_score": score.execution_score,
            "strategy_score": score.strategy_score,
            "final_score": score.final_score,
        }
        repo.upsert_leaderboard_entry(score.user_id, week_number, scores_dict, index)
        repo.save()  # Incremental commit per entry


# ─────────────────────────────────────────
# Service Entry Points (called by routes)
# ─────────────────────────────────────────

def get_leaderboard_service(week: int):
    cache_key = f"leaderboard:data:{week}"
    last_refresh_key = f"leaderboard:last_refresh:{week}"
    lock_key = f"leaderboard:refresh_lock:{week}"

    now = time.time()
    last_refresh = cache_get(last_refresh_key)
    cached_payload = cache_get(cache_key)

    is_stale = last_refresh is None or (now - float(last_refresh)) > REFRESH_INTERVAL_SECONDS

    # 1. Immediate Return: If fresh cache exists, return instantly (< 10ms)
    if cached_payload and not is_stale:
        return cached_payload

    # 2. Acquire lock so ONLY ONE thread triggers calculation/DB work
    if cache_get(lock_key) is None:
        cache_set(lock_key, True, REFRESH_LOCK_SECONDS)

        app = current_app._get_current_object()

        def _async_worker():
            with app.app_context():
                try:
                    _refresh_leaderboard_week(week)
                    entries = repo.find_leaderboard_entries_by_week(week)

                    payload = {
                        "week": week,
                        "count": len(entries),
                        "entries": [_leaderboard_entry_payload(e) for e in entries],
                        "last_refreshed": time.time(),
                    }
                    cache_set(cache_key, payload, REFRESH_INTERVAL_SECONDS * 10)
                    cache_set(last_refresh_key, time.time(), REFRESH_INTERVAL_SECONDS * 10)
                except Exception as err:
                    print(f"[Async Refresh Error]: {err}")

        thread = threading.Thread(target=_async_worker, daemon=True)
        thread.start()

    # 3. If cached payload exists (even if stale), serve it immediately
    if cached_payload:
        return cached_payload

    # 4. Cold Start Fallback: Fetch fast DB snapshot directly once
    entries = repo.find_leaderboard_entries_by_week(week)
    payload = {
        "week": week,
        "count": len(entries),
        "entries": [_leaderboard_entry_payload(e) for e in entries],
        "last_refreshed": last_refresh,
    }
    cache_set(cache_key, payload, REFRESH_INTERVAL_SECONDS * 10)
    return payload


def get_scores_service(user_id: str):
    """Service function: get detailed scores for a user."""
    scores = repo.find_weekly_scores_by_user(user_id)
    payload, error = _score_payload(user_id)

    if error:
        raise AnalyticsError("Failed to compute scores", 500)

    return {
        "user_id": user_id,
        "scores": [s.to_dict() for s in scores],
        "latest_metrics": payload["metrics"],
        "current_score": payload["scores"],
        "score_inputs": payload["inputs"],
        "score_breakdown": _score_breakdown(payload),
    }


def get_risk_service(user_id: str):
    """Service function: get risk metrics for a user."""
    payload, error = _score_payload(user_id)

    if error:
        raise AnalyticsError("Failed to calculate risk metrics", 500)

    inputs = payload["inputs"]
    scores = payload["scores"]

    return {
        "user_id": user_id,
        "risk_score": scores["risk_score"],
        "max_risk_score": 20,
        "unique_sectors": inputs["unique_sectors"],
        "max_allocation": inputs["max_allocation"],
        "portfolio_return_pct": inputs["portfolio_return_pct"],
        "return_on_capital_pct": inputs["return_on_capital_pct"],
        "net_profit": inputs["net_profit"],
    }


def compute_legacy_scores_service(user_id: str):
    """Legacy endpoint service: compute scores without persisting."""
    payload, error = _score_payload(user_id)

    if error:
        raise AnalyticsError("Failed to compute scores", 500)

    return {
        "user_id": user_id,
        "metrics": payload["metrics"],
        "current_score": payload["scores"],
        "score_inputs": payload["inputs"],
        "score_breakdown": _score_breakdown(payload),
    }


def compute_and_persist_scores_service(user_id: str, week_number: int):
    """Compute scores for a user and persist them to database."""
    payload, error = _score_payload(user_id)

    if error:
        raise AnalyticsError("Failed to compute scores", 500)

    repo.upsert_weekly_score(user_id, week_number, payload["scores"])
    repo.save()

    _rerank_week(week_number)

    scores = repo.find_weekly_scores_by_user(user_id)

    return {
        "user_id": user_id,
        "scores": [s.to_dict() for s in scores],
        "latest_metrics": payload["metrics"],
        "current_score": payload["scores"],
        "score_inputs": payload["inputs"],
        "score_breakdown": _score_breakdown(payload),
    }