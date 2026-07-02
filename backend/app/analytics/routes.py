import json
import os
import urllib.error
import urllib.request
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import (
    User, Leaderboard, WeeklyScore, RiskMetrics,
    TradeLog, Holding, PortfolioSetup,
)
from app.market.pipeline import YahooFinancePipeline
from app.scoring.final_scoring_engine import TradeIQScoringEngine
import time

analytics_bp = Blueprint("analytics", __name__, url_prefix="/analytics")
pipeline     = YahooFinancePipeline()
_leaderboard_cache = {}
REFRESH_INTERVAL_SECONDS = 300

OPENAI_SCORE_MODEL = os.getenv("OPENAI_SCORE_MODEL", "gpt-4.1-mini")


def _score_thesis_texts(trades):
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


def _benchmark_return(trades):
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


def _local_scorecard(data, metrics):
    portfolio_component = TradeIQScoringEngine.roi_score(
        data["portfolio_return_pct"],
        data["benchmark_return_pct"],
        data["net_profit"],
        data.get("total_capital", 10000.0),
    )
    risk_component = TradeIQScoringEngine.risk_score(
        data["sharpe"],
        data["drawdown_percent"],
        data["beta"],
    )
    strategy_component = TradeIQScoringEngine.strategy_score(
        data["sectors"],
        data["max_allocation"],
        data["weeks_active"],
        data["correct_direction"],
        data["total_trades"],
    )
    execution_component = TradeIQScoringEngine.execution_score(
        data["unique_tags"],
        data["trades_with_thesis"],
        data["total_trades"],
    )
    thesis_component = TradeIQScoringEngine.thesis_score(
        data["clarity"],
        data["financial_logic"],
        data["risk_awareness"],
        data["market_understanding"],
    )

    portfolio_score = round(min(40, (portfolio_component / 50) * 40), 2)
    risk_score = round(min(20, risk_component), 2)
    thesis_score = round(min(20, (thesis_component / 5) * 20), 2)
    execution_score = round(min(10, execution_component), 2)
    strategy_score = round(min(10, (strategy_component / 15) * 10), 2)
    final_score = round(portfolio_score + risk_score + thesis_score + execution_score + strategy_score, 2)

    return {
        "portfolio_score": portfolio_score,
        "risk_score": risk_score,
        "thesis_score": thesis_score,
        "execution_score": execution_score,
        "strategy_score": strategy_score,
        "final_score": final_score,
        "feedback": "Scored from portfolio performance, risk discipline, thesis content, execution completeness, and strategy diversification.",
        "source": "local-rubric",
    }


def _extract_response_text(response_payload):
    if isinstance(response_payload.get("output_text"), str):
        return response_payload["output_text"]

    chunks = []
    for item in response_payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in ("output_text", "text") and content.get("text"):
                chunks.append(content["text"])
    return "\n".join(chunks)


def _openai_scorecard(data, metrics, trades):
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


def _latest_trade_by_ticker(trades):
    latest = {}
    for trade in sorted(trades, key=lambda t: t.created_at or datetime.min):
        if trade.stock_ticker:
            latest[trade.stock_ticker.upper()] = trade
    return latest


def _active_trades(active_holdings, trades):
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


def _refresh_active_holdings(holdings):
    active_holdings = [h for h in holdings if float(h.quantity or 0) > 0]
    for holding in active_holdings:
        live_price = None
        try:
            live_price = pipeline.get_current_price(holding.stock_ticker)
        except Exception:
            live_price = None

        current_price = float(live_price or holding.current_price or holding.avg_buy_price or 0)
        quantity = float(holding.quantity or 0)
        avg_buy = float(holding.avg_buy_price or 0)
        holding.current_price = round(current_price, 4)
        holding.market_value = round(quantity * current_price, 4)
        holding.profit_loss = round((current_price - avg_buy) * quantity, 4)
    return active_holdings


def _local_thesis_points(thesis_texts):
    """
    Thesis Score Rules

    - No thesis submitted = 0
    - Thesis submitted but AI unavailable = baseline 15
    - AI available = AI score out of 20
    """

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


def _openai_thesis_points(trades):
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


def _challenge_scorecard(
    portfolio_setup,
    active_holdings,
    trades,
    total_portfolio,
):
    """
    TradeIQ Challenge Scoring

    Portfolio Score      = 40
    Risk Score           = 20
    Thesis Score         = 20
    Execution Score      = 10
    Strategy Score       = 10

    Total                = 100
    """

    # --------------------------------------------------
    # CLEAN SLATE
    # --------------------------------------------------
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

    total_capital = float(
        portfolio_setup.total_capital or 10000
    )

    # --------------------------------------------------
    # PORTFOLIO SCORE (40)
    # --------------------------------------------------
    return_on_capital = (
        ((total_portfolio - total_capital) / total_capital) * 100
        if total_capital > 0
        else 0
    )

    portfolio_score = round(
        max(
            0,
            min(
                40,
                20 + return_on_capital
            )
        ),
        2,
    )

    # --------------------------------------------------
    # RISK SCORE (20)
    # --------------------------------------------------
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

    # --------------------------------------------------
    # THESIS SCORE (20)
    # --------------------------------------------------
    thesis_texts = [
        t.thesis.strip()
        for t in active_trade_rows
        if t.thesis and t.thesis.strip()
    ]

    if not thesis_texts:
        thesis_score = 0

    else:
        ai_score = _openai_thesis_points(active_trade_rows)

        if ai_score is not None:
            thesis_score = ai_score
        else:
            thesis_score = _local_thesis_points(thesis_texts)

    thesis_score = round(
        max(0, min(20, thesis_score)),
        2,
    )

    # --------------------------------------------------
    # EXECUTION SCORE (10)
    # --------------------------------------------------
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

    # --------------------------------------------------
    # STRATEGY SCORE (10)
    # --------------------------------------------------
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

    # --------------------------------------------------
    # FINAL SCORE
    # --------------------------------------------------
    final_score = round(
        portfolio_score
        + risk_score
        + thesis_score
        + execution_score
        + strategy_score,
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
            "Thesis score based on AI evaluation or local thesis rubric. "
            "Execution score based on trade tags and thesis coverage. "
            "Strategy score rewards portfolio expansion."
        ),
        "source": "tradeiq-rubric",
    }


def _score_status(score, baseline=False):
    if score is None:
        return "pending"
    if score <= 0:
        return "pending"
    return "baseline" if baseline else "scored"


def _score_breakdown(payload):
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

def _zero_scorecard():
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


def _score_payload(user_id):
    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
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

    trades = TradeLog.query.filter_by(user_id=user_id).all()
    holdings = Holding.query.filter_by(user_id=user_id).all()
    active_holdings = _refresh_active_holdings(holdings)
    db.session.flush()

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
    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
    if not portfolio:
        return {
            "portfolio_value": 10000.0,
            "desk_return_expansion": 0.0,
            "available_cash_depot": 10000.0,
            "holdings_value": 0.0,
            "net_profit": 0.0,
        }
    holdings = Holding.query.filter_by(user_id=user_id).all()
    active_holdings = _refresh_active_holdings(holdings)
    db.session.flush()
    total_capital = float(portfolio.total_capital)
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


def _upsert_week_score(user_id, week_number, result):
    weekly = WeeklyScore.query.filter_by(user_id=user_id, week_number=week_number).first()
    if not weekly:
        weekly = WeeklyScore(user_id=user_id, week_number=week_number)
        db.session.add(weekly)

    weekly.portfolio_score = result["portfolio_score"]
    weekly.risk_score = result["risk_score"]
    weekly.thesis_score = result["thesis_score"]
    weekly.execution_score = result["execution_score"]
    weekly.strategy_score = result["strategy_score"]
    weekly.final_score = result["final_score"]
    return weekly


def _rerank_week(week_number):
    scores = WeeklyScore.query.filter_by(week_number=week_number).order_by(
        WeeklyScore.final_score.desc(),
        WeeklyScore.created_at.asc(),
    ).all()

    for index, score in enumerate(scores, start=1):
        score.rank_position = index

        entry = Leaderboard.query.filter_by(user_id=score.user_id, week_number=week_number).first()
        if not entry:
            entry = Leaderboard(user_id=score.user_id, week_number=week_number)
            db.session.add(entry)
        entry.portfolio_score = score.portfolio_score
        entry.risk_score = score.risk_score
        entry.thesis_score = score.thesis_score
        entry.execution_score = score.execution_score
        entry.strategy_score = score.strategy_score
        entry.final_score = score.final_score
        entry.rank_position = index


def _refresh_leaderboard_week(week_number):
    users = User.query.filter(
        (User.role.is_(None)) | (User.role != "admin")
    ).order_by(User.created_at.asc()).all()
    for user in users:
        payload, error = _score_payload(user.user_id)
        if error:
            continue
        _upsert_week_score(user.user_id, week_number, payload["scores"])
    _rerank_week(week_number)


def _leaderboard_entry_payload(entry):
    data = entry.to_dict()
    metrics = _portfolio_metrics(entry.user_id) or {}
    data["portfolio_value"] = metrics.get("portfolio_value", 10000.0)
    data["team_name"] = getattr(entry.user, "team_name", None) if entry.user else None
    return data


# ─────────────────────────────────────────
# GET /analytics/leaderboard?week=<n>
# Returns ranked leaderboard for a given week (defaults to latest)
# ─────────────────────────────────────────

@analytics_bp.get("/leaderboard")
@jwt_required()
def get_leaderboard():
    week = request.args.get("week", default=date.today().isocalendar()[1], type=int)

    now = time.time()
    last_refresh = _leaderboard_cache.get(week)

    if last_refresh is None or (now - last_refresh) > REFRESH_INTERVAL_SECONDS:
        _refresh_leaderboard_week(week)
        db.session.commit()
        _leaderboard_cache[week] = now

    entries = Leaderboard.query.filter_by(week_number=week).order_by(
        Leaderboard.rank_position.asc()
    ).all()

    return jsonify({
        "week":    week,
        "count":   len(entries),
        "entries": [_leaderboard_entry_payload(e) for e in entries],
    }), 200

# ─────────────────────────────────────────
# GET /analytics/scores/<user_id>
# Full score breakdown for a student
# ─────────────────────────────────────────

@analytics_bp.get("/scores/<string:user_id>")
@jwt_required()
def get_scores(user_id):
    current_user_id = get_jwt_identity()
    if current_user_id != user_id:
        current_user = User.query.get(current_user_id)
        if not current_user or current_user.role != "admin":
            return jsonify({"error": "Not authorized to view scores for this user"}), 403

    scores = WeeklyScore.query\
        .filter_by(user_id=user_id)\
        .order_by(WeeklyScore.week_number.desc())\
        .all()
    payload, error = _score_payload(user_id)
    if error:
        return error

    return jsonify({
        "user_id": user_id,
        "scores":  [s.to_dict() for s in scores],
        "latest_metrics": payload["metrics"],
        "current_score": payload["scores"],
        "score_inputs": payload["inputs"],
        "score_breakdown": _score_breakdown(payload),
    }), 200


# ─────────────────────────────────────────
# GET /analytics/risk/<user_id>
# Latest risk metrics for a student
# ─────────────────────────────────────────

@analytics_bp.get("/risk/<string:user_id>")
@jwt_required()
def get_risk(user_id):
    risk = RiskMetrics.query.filter_by(user_id=user_id).first()
    if not risk:
        return jsonify({"error": "No risk metrics found"}), 404
    return jsonify({"user_id": user_id, "risk": risk.to_dict()}), 200


# ─────────────────────────────────────────
# POST /analytics/compute/<user_id>
# Recalculate scores for a student on demand
# (for testing / manual trigger before weekly batch)
# ─────────────────────────────────────────

@analytics_bp.post("/compute-legacy/<string:user_id>")
@jwt_required()
def compute_scores(user_id):
    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
    if not portfolio:
        return jsonify({"error": "Portfolio not found"}), 404

    trades   = TradeLog.query.filter_by(user_id=user_id).all()
    holdings = Holding.query.filter_by(user_id=user_id).all()
    risk     = RiskMetrics.query.filter_by(user_id=user_id).first()

    if not trades:
        return jsonify({"error": "No trades found — cannot score"}), 400

    # ── Portfolio return ──────────────────
    total_capital     = float(portfolio.total_capital)
    cash_balance      = float(portfolio.cash_balance)
    holdings_value    = sum(float(h.market_value or 0) for h in holdings)
    total_portfolio   = cash_balance + holdings_value
    portfolio_return  = ((total_portfolio - total_capital) / total_capital) * 100
    net_profit        = total_portfolio - total_capital

    # ── Benchmark return (YTD S&P 500) ───
    # Approximation — weekly batch will use exact date-matched returns
    benchmark_return = 10.0  # placeholder; replaced by pipeline in batch job

    # ── Risk metrics ─────────────────────
    sharpe   = float(risk.sharpe_ratio or 0) if risk else 0.0
    drawdown = float(risk.max_drawdown or 0) if risk else 0.0
    beta     = float(risk.beta or 1.0)       if risk else 1.0

    # ── Strategy inputs ───────────────────
    sectors     = len(set(t.sector for t in trades if t.sector))
    alloc_vals  = [float(t.allocation_percent or 0) for t in trades]
    max_alloc   = max(alloc_vals) if alloc_vals else 0.0
    weeks_active= len(set(t.trade_date.isocalendar()[1] for t in trades if t.trade_date))

    buy_trades  = [t for t in trades if t.trade_type == "BUY"]
    correct_dir = sum(
        1 for t in buy_trades
        if t.current_sell_price and t.buy_price
        and float(t.current_sell_price) > float(t.buy_price)
    )

    # ── Execution inputs ──────────────────
    tagged_trades  = [t for t in trades if any([t.tag1, t.tag2, t.tag3])]
    all_tags       = []
    for t in trades:
        all_tags += [x for x in [t.tag1, t.tag2, t.tag3] if x]
    unique_tags    = len(set(all_tags))
    with_thesis    = sum(1 for t in trades if t.thesis)

    # ── Thesis ────────────────────────────
    # Pulled from latest thesis_scores row; defaults to 0 if none scored yet
    clarity = financial_logic = risk_awareness = market_understanding = 0.0

    data = {
        "portfolio_return_pct": round(portfolio_return, 4),
        "benchmark_return_pct": benchmark_return,
        "net_profit":           round(net_profit, 4),
        "total_capital":        total_capital,
        "sharpe":               sharpe,
        "drawdown_percent":     drawdown,
        "beta":                 beta,
        "sectors":              sectors,
        "max_allocation":       max_alloc,
        "weeks_active":         weeks_active,
        "correct_direction":    correct_dir,
        "total_trades":         len(trades),
        "unique_tags":          unique_tags,
        "trades_with_thesis":   with_thesis,
        "clarity":              clarity,
        "financial_logic":      financial_logic,
        "risk_awareness":       risk_awareness,
        "market_understanding": market_understanding,
    }

    result = TradeIQScoringEngine.score_student(data)

    return jsonify({
        "user_id": user_id,
        "inputs":  data,
        "scores":  result,
    }), 200


@analytics_bp.post("/compute/<string:user_id>")
@jwt_required()
def compute_and_persist_scores(user_id):
    current_user_id = get_jwt_identity()
    if current_user_id != user_id:
        current_user = User.query.get(current_user_id)
        if not current_user or current_user.role != "admin":
            return jsonify({"error": "Not authorized to compute scores for this user"}), 403

    payload, error = _score_payload(user_id)
    if error:
        return error

    week_number = request.args.get("week", default=date.today().isocalendar()[1], type=int)
    _upsert_week_score(user_id, week_number, payload["scores"])
    _rerank_week(week_number)
    db.session.commit()

    weekly = WeeklyScore.query.filter_by(user_id=user_id, week_number=week_number).first()

    return jsonify({
        "user_id": user_id,
        "week_number": week_number,
        "inputs": payload["inputs"],
        "metrics": payload["metrics"],
        "scores": payload["scores"],
        "weekly_score": weekly.to_dict() if weekly else None,
    }), 200
