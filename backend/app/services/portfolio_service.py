# backend/app/services/portfolio_service.py
import uuid
import re
from datetime import date
from sqlalchemy.exc import IntegrityError

from app.services.market_service import get_price_with_staleness, get_prices_with_staleness
from app.repositories import portfolio_repository
from app.market.pipeline import YahooFinancePipeline

pipeline = YahooFinancePipeline()


class PortfolioError(Exception):
    """Raised when a portfolio/trade request is invalid.
    Carries the HTTP status code the route should respond with."""
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _make_trade_id() -> str:
    return "TRD-" + uuid.uuid4().hex[:6].upper()


def _get_price_info(ticker: str) -> dict:
    return get_price_with_staleness(ticker)


def _get_live_price(ticker: str):
    info = _get_price_info(ticker)
    return info["price"]


def _get_price_info_map(tickers: list[str]) -> dict[str, dict]:
    if not tickers:
        return {}
    return get_prices_with_staleness(tickers)


def _holding_payload(holding) -> dict:
    latest_trade = portfolio_repository.find_latest_trade(holding.user_id, holding.stock_ticker)
    thesis_trade = portfolio_repository.find_latest_thesis_trade(holding.user_id, holding.stock_ticker)
    payload = holding.to_dict()
    payload.update({
        "sector": latest_trade.sector if latest_trade else None,
        "allocation_percent": float(latest_trade.allocation_percent or 0) if latest_trade else 0,
        "amount_invested": float(latest_trade.amount_invested or 0) if latest_trade else 0,
        "thesis": thesis_trade.thesis if thesis_trade else None,
        "latest_trade_id": latest_trade.trade_id if latest_trade else None,
    })
    return payload


def _active_allocation_percent(user_id: str) -> float:
    """Sum the latest BUY allocation for each active holding."""
    total = 0.0
    for holding in portfolio_repository.find_active_holdings(user_id):
        if float(holding.quantity or 0) <= 0:
            continue
        latest_trade = portfolio_repository.find_latest_trade(user_id, holding.stock_ticker)
        if latest_trade and latest_trade.trade_type == "BUY":
            total += float(latest_trade.allocation_percent or 0)
    return round(total, 2)


def _sync_holding_after_trade(user_id: str, trade, holding=None) -> None:
    """
    Upsert holdings table after a BUY or SELL trade.
    BUY  → increase quantity, recalculate avg_buy_price
    SELL → decrease quantity, remove holding if qty reaches 0
    """
    if holding is None:
        holding = portfolio_repository.find_holding_for_update(user_id, trade.stock_ticker)

    live_price = _get_live_price(trade.stock_ticker)
    current_price = float(live_price or trade.current_sell_price or trade.buy_price or 1)

    if trade.trade_type == "BUY":
        if holding:
            total_qty = float(holding.quantity) + trade.quantity
            total_cost = (float(holding.avg_buy_price) * float(holding.quantity)) + float(trade.amount_invested)
            holding.avg_buy_price = round(total_cost / total_qty, 4)
            holding.quantity = total_qty
        else:
            holding = portfolio_repository.create_holding(
                user_id=user_id,
                stock_ticker=trade.stock_ticker,
                stock_name=trade.stock_name,
                quantity=trade.quantity,
                avg_buy_price=round(float(trade.amount_invested or 0) / float(trade.quantity or 1), 4),
            )

        holding.current_price = current_price
        holding.market_value = round(float(holding.quantity or 0) * current_price, 4)
        holding.profit_loss = round(
            float(holding.market_value or 0) - (float(holding.avg_buy_price) * float(holding.quantity or 0)),
            4,
        )

    elif trade.trade_type == "SELL" and holding:
        holding.quantity -= trade.quantity
        if holding.quantity <= 0:
            portfolio_repository.delete_holding(holding)
        else:
            holding.current_price = current_price
            holding.market_value = round(current_price * holding.quantity, 4)
            holding.profit_loss = round(
                (current_price - float(holding.avg_buy_price)) * holding.quantity, 4
            )


def execute_trade(user_id: str, data: dict) -> dict:
    """Returns {trade_id, trade, cash_balance}. Raises PortfolioError if the request is invalid."""
    if not data:
        raise PortfolioError("JSON body required", 400)

    # ─────────────────────────────────────────
    # IDEMPOTENCY CHECK
    # ─────────────────────────────────────────
    idempotency_key = data.get("idempotency_key")
    if idempotency_key:
        existing_trade = portfolio_repository.find_trade_by_idempotency_key(idempotency_key)
        if existing_trade:
            portfolio = portfolio_repository.find_portfolio(user_id)
            return {
                "trade_id": getattr(existing_trade, "trade_id", getattr(existing_trade, "id", None)),
                "trade": existing_trade.to_dict(),
                "cash_balance": float(portfolio.cash_balance) if portfolio else 0.0,
                "message": "Duplicate request ignored."
            }

    required = ["stock_ticker", "trade_type", "quantity"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise PortfolioError(f"Missing fields: {', '.join(missing)}", 400)

    trade_type = data["trade_type"].upper()
    if trade_type not in ("BUY", "SELL"):
        raise PortfolioError("trade_type must be BUY or SELL", 400)

    ticker = data["stock_ticker"].upper()
    try:
        quantity = int(data["quantity"])
    except (TypeError, ValueError):
        raise PortfolioError("quantity must be a whole number", 400)
    if quantity <= 0:
        raise PortfolioError("quantity must be greater than 0", 400)

    # ─────────────────────────────────────────
    # §10.5 THESIS VALIDATION & SANITIZATION
    # ─────────────────────────────────────────
    thesis_raw = data.get("thesis")
    if thesis_raw is not None:
        # Strip non-printable / control characters while preserving standard text & whitespace
        thesis_clean = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', str(thesis_raw)).strip()
        if len(thesis_clean) == 0:
            thesis = None
        elif len(thesis_clean) < 20:
            raise PortfolioError("Thesis must be at least 20 characters, or left blank.", 400)
        elif len(thesis_clean) > 2000:
            raise PortfolioError("Thesis must be under 2000 characters.", 400)
        else:
            thesis = thesis_clean
    else:
        thesis = None

    try:
        submitted_buy_price = float(data.get("buy_price") or 0)
    except (TypeError, ValueError):
        submitted_buy_price = 0.0

    try:
        submitted_sell_price = float(data.get("current_sell_price") or submitted_buy_price or 0)
    except (TypeError, ValueError):
        submitted_sell_price = submitted_buy_price

    # Fetch live price + metadata, falling back to draft values
    try:
        stock_info = pipeline.get_stock_info(ticker) or {}
    except Exception:
        stock_info = {}

    live_price = _get_live_price(ticker)
    current_price = live_price or submitted_sell_price or submitted_buy_price

    if current_price is None:
        raise PortfolioError(f"Could not fetch price for '{ticker}'", 404)
    current_price = float(current_price)
    if current_price <= 0:
        current_price = 1.0

    # SERVER-VERIFIED amount_invested: ignore client-supplied amount_invested for calculation
    amount_invested = round(current_price * quantity, 4)

    # 1. Row lock on Portfolio
    portfolio = portfolio_repository.find_portfolio_for_update(user_id)
    if not portfolio:
        raise PortfolioError("Portfolio not found", 404)

    total_capital = float(portfolio.total_capital or 0)
    cash_balance = float(portfolio.cash_balance or 0)
    if total_capital <= 0:
        raise PortfolioError("Portfolio total capital must be greater than 0", 400)

    # 2. Row lock on Holding
    holding = portfolio_repository.find_holding_for_update(user_id, ticker)

    if trade_type == "BUY":
        if amount_invested <= 0:
            raise PortfolioError("BUY amount must be greater than 0", 400)

        allocation_pct = round((amount_invested / total_capital) * 100, 2)
        if allocation_pct > 30:
            raise PortfolioError("A single BUY position cannot exceed 30% of total capital", 400)
        if _active_allocation_percent(user_id) + allocation_pct > 100:
            raise PortfolioError(
                "Your portfolio allocation exceeded 100%. You cannot add further.",
                400,
            )
        if amount_invested > cash_balance:
            raise PortfolioError("Insufficient cash balance for this BUY trade", 400)

        portfolio.cash_balance = round(float(portfolio.cash_balance) - amount_invested, 4)

    else:  # SELL
        if not holding or float(holding.quantity or 0) <= 0:
            raise PortfolioError(f"No active holding found for '{ticker}'", 400)
        if quantity > float(holding.quantity or 0):
            raise PortfolioError("SELL quantity exceeds active holding quantity", 400)

        portfolio.cash_balance = round(float(portfolio.cash_balance) + amount_invested, 4)

    allocation_pct = round((amount_invested / total_capital) * 100, 2)

    new_trade_id = _make_trade_id()

    trade = portfolio_repository.create_trade(
        trade_id=new_trade_id,
        user_id=user_id,
        trade_date=date.today(),
        stock_ticker=ticker,
        stock_name=data.get("stock_name") or stock_info.get("company_name", ticker),
        sector=data.get("sector") or stock_info.get("sector"),
        allocation_percent=allocation_pct,
        amount_invested=amount_invested,
        quantity=quantity,
        buy_price=current_price,
        current_sell_price=current_price,
        trade_type=trade_type,
        tag1=data.get("tag1"),
        tag2=data.get("tag2"),
        tag3=data.get("tag3"),
        thesis=thesis,  # Cleaned and validated thesis
        idempotency_key=idempotency_key,
    )

    # Pass pre-locked holding into sync
    _sync_holding_after_trade(user_id, trade, holding=holding)

    try:
        portfolio_repository.save()
    except IntegrityError:
        # Handle parallel database insert collisions gracefully
        if idempotency_key:
            existing_trade = portfolio_repository.find_trade_by_idempotency_key(idempotency_key)
            if existing_trade:
                return {
                    "trade_id": getattr(existing_trade, "trade_id", getattr(existing_trade, "id", None)),
                    "trade": existing_trade.to_dict(),
                    "cash_balance": float(portfolio.cash_balance),
                    "message": "Duplicate request ignored."
                }
        raise PortfolioError("Concurrent transaction collision", 409)

    return {
        "trade_id": new_trade_id,
        "trade": trade.to_dict(),
        "cash_balance": float(portfolio.cash_balance),
    }


def get_holdings(user_id: str) -> dict:
    holdings = [
        h for h in portfolio_repository.find_active_holdings(user_id)
        if float(h.quantity or 0) > 0
    ]
    price_info_map = _get_price_info_map([h.stock_ticker for h in holdings])
    payloads = []
    for h in holdings:
        price_info = price_info_map.get(h.stock_ticker.upper()) or _get_price_info(h.stock_ticker)
        payload = _holding_payload(h)
        payload["price_stale"] = price_info["is_stale"]  # Surface per-holding staleness
        payloads.append(payload)

    return {
        "user_id": user_id,
        "holdings": payloads,
        "count": len(holdings),
    }


def delete_holding(user_id: str, ticker: str) -> dict:
    normalized_ticker = ticker.upper()
    holding = portfolio_repository.find_holding_for_update(user_id, normalized_ticker)
    if not holding:
        raise PortfolioError(f"No active holding found for '{normalized_ticker}'", 404)

    portfolio = portfolio_repository.find_portfolio_for_update(user_id)
    if not portfolio:
        raise PortfolioError("Portfolio not found", 404)

    live_price = _get_live_price(normalized_ticker)
    current_price = float(live_price or holding.current_price or holding.avg_buy_price or 0)
    cash_credit = round(float(holding.quantity or 0) * current_price, 4)

    portfolio.cash_balance = round(float(portfolio.cash_balance or 0) + cash_credit, 4)
    portfolio_repository.delete_holding(holding)

    portfolio_repository.save()

    return {
        "stock_ticker": normalized_ticker,
        "cash_balance": float(portfolio.cash_balance),
        "cash_credit": cash_credit,
    }


def get_summary(user_id: str) -> dict:
    portfolio = portfolio_repository.find_portfolio(user_id)
    if not portfolio:
        raise PortfolioError("Portfolio not found", 404)

    holdings = portfolio_repository.find_active_holdings(user_id)
    any_stale = False
    price_info_map = _get_price_info_map([holding.stock_ticker for holding in holdings if float(holding.quantity or 0) > 0])

    for holding in holdings:
        if float(holding.quantity or 0) <= 0:
            continue

        price_info = price_info_map.get(holding.stock_ticker.upper()) or _get_price_info(holding.stock_ticker)
        current_price = float(price_info["price"] or holding.current_price or holding.avg_buy_price or 0)

        if price_info["is_stale"]:
            any_stale = True

        holding.current_price = round(current_price, 4)
        holding.market_value = round(float(holding.quantity or 0) * current_price, 4)
        holding.profit_loss = round(
            (current_price - float(holding.avg_buy_price or 0)) * float(holding.quantity or 0),
            4,
        )

    portfolio_repository.flush()

    total_market_value = sum(float(h.market_value or 0) for h in holdings)
    allocated_percent = _active_allocation_percent(user_id)
    total_pnl = sum(float(h.profit_loss or 0) for h in holdings)
    total_portfolio = round(total_market_value + float(portfolio.cash_balance), 4)
    total_return_pct = round(
        ((total_portfolio - float(portfolio.total_capital)) / float(portfolio.total_capital)) * 100, 4
    )

    return {
        "user_id": user_id,
        "total_capital": float(portfolio.total_capital),
        "cash_balance": float(portfolio.cash_balance),
        "holdings_value": round(total_market_value, 4),
        "allocated_percent": allocated_percent,
        "total_portfolio": total_portfolio,
        "total_pnl": round(total_pnl, 4),
        "total_return_pct": total_return_pct,
        "holdings_count": len(holdings),
        "prices_stale": any_stale,  # Surface overall portfolio price staleness
    }


def get_trades(user_id: str) -> dict:
    trades = portfolio_repository.find_trades_for_user(user_id)
    return {
        "user_id": user_id,
        "trades": [t.to_dict() for t in trades],
        "count": len(trades),
    }
