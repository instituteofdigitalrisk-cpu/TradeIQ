import uuid
import logging
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import User, PortfolioSetup, TradeLog, Holding, Watchlist, InvestmentThesis
from app.market.pipeline import YahooFinancePipeline

logger = logging.getLogger(__name__)

portfolio_bp = Blueprint("portfolio", __name__, url_prefix="/portfolio")
pipeline     = YahooFinancePipeline()


def _make_trade_id() -> str:
    return "TRD-" + uuid.uuid4().hex[:6].upper()


def _latest_trade_for_holding(user_id: str, ticker: str):
    return TradeLog.query.filter_by(
        user_id=user_id,
        stock_ticker=ticker.upper(),
    ).order_by(TradeLog.created_at.desc()).first()


def _latest_thesis_trade_for_holding(user_id: str, ticker: str):
    return TradeLog.query.filter_by(
        user_id=user_id,
        stock_ticker=ticker.upper(),
    ).filter(
        TradeLog.thesis.isnot(None),
        TradeLog.thesis != "",
    ).order_by(TradeLog.created_at.desc()).first()


def _active_allocation_percent(user_id: str) -> float:
    """Sum the latest BUY allocation for each active holding."""
    total = 0.0
    for holding in Holding.query.filter_by(user_id=user_id).all():
        if float(holding.quantity or 0) <= 0:
            continue
        latest_trade = _latest_trade_for_holding(user_id, holding.stock_ticker)
        if latest_trade and latest_trade.trade_type == "BUY":
            total += float(latest_trade.allocation_percent or 0)
    return round(total, 2)


def _holding_payload(holding: Holding):
    latest_trade = _latest_trade_for_holding(holding.user_id, holding.stock_ticker)
    thesis_trade = _latest_thesis_trade_for_holding(holding.user_id, holding.stock_ticker)
    payload = holding.to_dict()
    payload.update({
        "sector": latest_trade.sector if latest_trade else None,
        "allocation_percent": float(latest_trade.allocation_percent or 0) if latest_trade else 0,
        "amount_invested": float(latest_trade.amount_invested or 0) if latest_trade else 0,
        "thesis": thesis_trade.thesis if thesis_trade else None,
        "latest_trade_id": latest_trade.trade_id if latest_trade else None,
    })
    return payload


def _update_holding(user_id: str, trade: TradeLog):
    """
    Upsert holdings table after a BUY or SELL trade.
    BUY  → increase quantity, recalculate avg_buy_price
    SELL → decrease quantity, remove holding if qty reaches 0
    """
    holding = Holding.query.filter_by(
        user_id=user_id,
        stock_ticker=trade.stock_ticker,
    ).first()

    try:
        live_price = pipeline.get_current_price(trade.stock_ticker)
    except Exception as exc:
        logger.warning(f"Failed to fetch live price for {trade.stock_ticker} during holding update: {exc}")
        live_price = None

    current_price = float(live_price or trade.current_sell_price or trade.buy_price or 1)

    if trade.trade_type == "BUY":
        if holding:
            total_qty   = float(holding.quantity) + trade.quantity
            total_cost  = (float(holding.avg_buy_price) * float(holding.quantity)) + float(trade.amount_invested)
            holding.avg_buy_price = round(total_cost / total_qty, 4)
            holding.quantity      = total_qty
        else:
            holding = Holding(
                user_id       = user_id,
                stock_ticker  = trade.stock_ticker,
                stock_name    = trade.stock_name,
                quantity      = trade.quantity,
                avg_buy_price = round(float(trade.amount_invested or 0) / float(trade.quantity or 1), 4),
            )
            db.session.add(holding)

        holding.current_price = current_price
        holding.market_value = round(float(holding.quantity or 0) * current_price, 4)
        holding.profit_loss = round(
            float(holding.market_value or 0) - (float(holding.avg_buy_price) * float(holding.quantity or 0)),
            4,
        )

    elif trade.trade_type == "SELL" and holding:
        holding.quantity -= trade.quantity
        if holding.quantity <= 0:
            db.session.delete(holding)
        else:
            holding.current_price = current_price
            holding.market_value  = round(current_price * holding.quantity, 4)
            holding.profit_loss   = round(
                (current_price - float(holding.avg_buy_price)) * holding.quantity, 4
            )


# ─────────────────────────────────────────
# POST /portfolio/trade
# Body: { stock_ticker, trade_type, quantity, tag1?, tag2?, tag3?, thesis? }
# ─────────────────────────────────────────

@portfolio_bp.post("/trade")
@jwt_required()
def execute_trade():
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    required = ["stock_ticker", "trade_type", "quantity"]
    missing  = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    trade_type = data["trade_type"].upper()
    if trade_type not in ("BUY", "SELL"):
        return jsonify({"error": "trade_type must be BUY or SELL"}), 400

    ticker = data["stock_ticker"].upper()
    try:
        quantity = int(data["quantity"])
    except (TypeError, ValueError):
        return jsonify({"error": "quantity must be a whole number"}), 400
    if quantity <= 0:
        return jsonify({"error": "quantity must be greater than 0"}), 400

    try:
        submitted_buy_price = float(data.get("buy_price") or 0)
    except (TypeError, ValueError):
        submitted_buy_price = 0.0

    try:
        submitted_sell_price = float(data.get("current_sell_price") or submitted_buy_price or 0)
    except (TypeError, ValueError):
        submitted_sell_price = submitted_buy_price

    # Fetch live price + metadata, falling back to the user's saved draft values.
    try:
        stock_info = pipeline.get_stock_info(ticker) or {}
    except Exception as exc:
        logger.warning(f"Error fetching stock info for {ticker}: {exc}")
        stock_info = {}

    try:
        live_price = pipeline.get_current_price(ticker)
    except Exception as exc:
        logger.warning(f"Error fetching live price for {ticker}: {exc}")
        live_price = None

    current_price = live_price or submitted_sell_price or submitted_buy_price

    if current_price is None:
        return jsonify({"error": f"Could not fetch price for '{ticker}'"}), 404
    current_price = float(current_price)
    if current_price <= 0:
        current_price = 1.0

    requested_amount = data.get("amount_invested")
    try:
        submitted_amount = float(requested_amount) if requested_amount is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "amount_invested must be numeric"}), 400

    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
    if not portfolio:
        return jsonify({"error": "Portfolio not found"}), 404

    total_capital = float(portfolio.total_capital or 0)
    cash_balance = float(portfolio.cash_balance or 0)
    if total_capital <= 0:
        return jsonify({"error": "Portfolio total capital must be greater than 0"}), 400

    if trade_type == "BUY":
        amount_invested = round(
            submitted_amount if submitted_amount and submitted_amount > 0 else current_price * quantity,
            4,
        )
        if amount_invested <= 0:
            return jsonify({"error": "BUY amount must be greater than 0"}), 400

        allocation_pct = round((amount_invested / total_capital) * 100, 2)
        if allocation_pct > 30:
            return jsonify({"error": "A single BUY position cannot exceed 30% of total capital"}), 400
        if _active_allocation_percent(user_id) + allocation_pct > 100:
            return jsonify({
                "error": "Your portfolio allocation exceeded 100%. You cannot add further."
            }), 400
        if amount_invested > cash_balance:
            return jsonify({"error": "Insufficient cash balance for this BUY trade"}), 400

        portfolio.cash_balance = round(float(portfolio.cash_balance) - amount_invested, 4)

    elif trade_type == "SELL":
        holding = Holding.query.filter_by(user_id=user_id, stock_ticker=ticker).first()
        if not holding or float(holding.quantity or 0) <= 0:
            return jsonify({"error": f"No active holding found for '{ticker}'"}), 400
        if quantity > float(holding.quantity or 0):
            return jsonify({"error": "SELL quantity exceeds active holding quantity"}), 400

        amount_invested = round(
            current_price * quantity,
            4,
        )
        portfolio.cash_balance = round(float(portfolio.cash_balance) + amount_invested, 4)

    # Build trade_log record
    allocation_pct = round((amount_invested / total_capital) * 100, 2)

    trade = TradeLog(
        trade_id           = _make_trade_id(),
        user_id            = user_id,
        trade_date         = date.today(),
        stock_ticker       = ticker,
        stock_name         = data.get("stock_name") or stock_info.get("company_name", ticker),
        sector             = data.get("sector") or stock_info.get("sector"),
        allocation_percent = allocation_pct,
        amount_invested    = amount_invested,
        quantity           = quantity,
        buy_price          = current_price,
        current_sell_price = current_price,
        trade_type         = trade_type,
        tag1               = data.get("tag1"),
        tag2               = data.get("tag2"),
        tag3               = data.get("tag3"),
        thesis             = data.get("thesis"),
    )

    try:
        db.session.add(trade)
        # Keep the normalized investment_thesis table in sync with the
        # denormalized thesis field used by the portfolio/scoring flows.
        if trade.thesis and trade.thesis.strip():
            db.session.add(InvestmentThesis(
                trade_id=trade.trade_id,
                user_id=user_id,
                reason_text=trade.thesis.strip(),
            ))
        _update_holding(user_id, trade)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error(f"Failed to execute trade transaction for user {user_id}, ticker {ticker}: {exc}")
        return jsonify({"error": "Database error while executing trade. Please try again."}), 500

    return jsonify({
        "message":       "Trade executed",
        "trade":         trade.to_dict(),
        "cash_balance":  float(portfolio.cash_balance),
    }), 201


# ─────────────────────────────────────────
# GET /portfolio/holdings/<user_id>
# ─────────────────────────────────────────

@portfolio_bp.get("/holdings/<string:user_id>")
@jwt_required()
def get_holdings(user_id):
    holdings = [
        holding
        for holding in Holding.query.filter_by(user_id=user_id).all()
        if float(holding.quantity or 0) > 0
    ]
    return jsonify({
        "user_id":  user_id,
        "holdings": [_holding_payload(h) for h in holdings],
        "count":    len(holdings),
    }), 200


@portfolio_bp.delete("/holding/<path:ticker>")
@portfolio_bp.delete("/holdings/<path:ticker>")
@jwt_required()
def delete_holding(ticker):
    user_id = get_jwt_identity()
    normalized_ticker = ticker.upper()
    holding = Holding.query.filter_by(user_id=user_id, stock_ticker=normalized_ticker).first()
    if not holding:
        return jsonify({"error": f"No active holding found for '{normalized_ticker}'"}), 404

    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
    if not portfolio:
        return jsonify({"error": "Portfolio not found"}), 404

    try:
        live_price = pipeline.get_current_price(normalized_ticker)
    except Exception as exc:
        logger.warning(f"Error fetching live price for {normalized_ticker} on deletion: {exc}")
        live_price = None

    current_price = float(live_price or holding.current_price or holding.avg_buy_price or 0)
    cash_credit = round(float(holding.quantity or 0) * current_price, 4)

    try:
        portfolio.cash_balance = round(float(portfolio.cash_balance or 0) + cash_credit, 4)
        db.session.delete(holding)
        TradeLog.query.filter_by(user_id=user_id, stock_ticker=normalized_ticker).delete(synchronize_session=False)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error(f"Failed to delete holding for user {user_id}, ticker {normalized_ticker}: {exc}")
        return jsonify({"error": "Failed to delete holding from database"}), 500

    return jsonify({
        "message": "Holding deleted",
        "stock_ticker": normalized_ticker,
        "cash_balance": float(portfolio.cash_balance),
        "cash_credit": cash_credit,
    }), 200


# ─────────────────────────────────────────
# GET /portfolio/summary/<user_id>
# Returns: portfolio value, P&L, cash, allocation breakdown
# ─────────────────────────────────────────

@portfolio_bp.get("/summary/<string:user_id>")
@jwt_required()
def get_summary(user_id):
    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
    if not portfolio:
        return jsonify({"error": "Portfolio not found"}), 404

    holdings = Holding.query.filter_by(user_id=user_id).all()
    for holding in holdings:
        if float(holding.quantity or 0) <= 0:
            continue
        try:
            live_price = pipeline.get_current_price(holding.stock_ticker)
        except Exception as exc:
            logger.warning(f"Error fetching live price for summary on ticker {holding.stock_ticker}: {exc}")
            live_price = None

        current_price = float(live_price or holding.current_price or holding.avg_buy_price or 0)
        holding.current_price = round(current_price, 4)
        holding.market_value = round(float(holding.quantity or 0) * current_price, 4)
        holding.profit_loss = round(
            (current_price - float(holding.avg_buy_price or 0)) * float(holding.quantity or 0),
            4,
        )

    try:
        db.session.flush()
    except Exception as exc:
        db.session.rollback()
        logger.error(f"Failed to flush holding updates for user {user_id} summary: {exc}")

    total_market_value = sum(float(h.market_value or 0) for h in holdings)
    allocated_percent = _active_allocation_percent(user_id)
    total_pnl          = sum(float(h.profit_loss  or 0) for h in holdings)
    total_portfolio    = round(total_market_value + float(portfolio.cash_balance), 4)
    total_return_pct   = round(
        ((total_portfolio - float(portfolio.total_capital)) / float(portfolio.total_capital)) * 100, 4
    )

    return jsonify({
        "user_id":           user_id,
        "total_capital":     float(portfolio.total_capital),
        "cash_balance":      float(portfolio.cash_balance),
        "holdings_value":    round(total_market_value, 4),
        "allocated_percent": allocated_percent,
        "total_portfolio":   total_portfolio,
        "total_pnl":         round(total_pnl, 4),
        "total_return_pct":  total_return_pct,
        "holdings_count":    len(holdings),
    }), 200


# ─────────────────────────────────────────
# GET /portfolio/trades/<user_id>
# ─────────────────────────────────────────

@portfolio_bp.get("/trades/<string:user_id>")
@jwt_required()
def get_trades(user_id):
    trades = TradeLog.query.filter_by(user_id=user_id)\
                           .order_by(TradeLog.created_at.desc())\
                           .all()
    return jsonify({
        "user_id": user_id,
        "trades":  [t.to_dict() for t in trades],
        "count":   len(trades),
    }), 200


# ─────────────────────────────────────────
# GET /portfolio/watchlist/<user_id>
# Stocks the user is tracking but hasn't submitted as a real trade yet.
# ─────────────────────────────────────────

@portfolio_bp.get("/watchlist/<string:user_id>")
@jwt_required()
def get_watchlist(user_id):
    try:
        items = Watchlist.query.filter_by(user_id=user_id)\
                                 .order_by(Watchlist.created_at.desc())\
                                 .all()
        return jsonify({
            "user_id":   user_id,
            "watchlist": [w.to_dict() for w in items],
            "count":     len(items),
        }), 200
    except Exception as exc:
        db.session.rollback()
        logger.exception("Failed to load watchlist for user %s", user_id)
        return jsonify({"watchlist": [], "error": str(exc)}), 500


# ─────────────────────────────────────────
# POST /portfolio/watchlist
# Body: { stock_ticker, stock_name?, sector?, allocation_percent?,
#         amount_invested?, quantity?, buy_price?, current_sell_price?,
#         trade_type?, tag1?, tag2?, tag3?, thesis? }
# ─────────────────────────────────────────

@portfolio_bp.post("/watchlist")
@jwt_required()
def add_watchlist_item():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not data or not data.get("stock_ticker"):
        return jsonify({"error": "stock_ticker required"}), 400

    ticker = data["stock_ticker"].upper()

    try:
        # Idempotent per user's portfolio: submitting the same ticker again
        # updates the existing watchlist row instead of creating another one.
        item = Watchlist.query.filter_by(
            user_id=user_id,
            stock_ticker=ticker,
        ).first()
        created = item is None
        if item is None:
            item = Watchlist(user_id=user_id, stock_ticker=ticker)
            db.session.add(item)

        item.stock_name = data.get("stock_name") or ticker
        item.sector = data.get("sector")
        item.allocation_percent = data.get("allocation_percent") or 0
        item.amount_invested = data.get("amount_invested") or 0
        item.quantity = data.get("quantity") or 0
        item.buy_price = data.get("buy_price") or 0
        item.current_sell_price = data.get("current_sell_price") or data.get("buy_price") or 0
        item.trade_type = (data.get("trade_type") or "BUY").upper()
        item.tag1 = data.get("tag1")
        item.tag2 = data.get("tag2")
        item.tag3 = data.get("tag3")
        item.thesis = data.get("thesis")

        db.session.add(item)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error(f"Failed to add item to watchlist for user {user_id}: {exc}")
        if isinstance(exc, IntegrityError):
            existing = Watchlist.query.filter_by(
                user_id=user_id,
                stock_ticker=ticker,
            ).first()
            if existing:
                return jsonify({
                    "message": "Watchlist item already existed",
                    "item": existing.to_dict(),
                }), 200
        return jsonify({"error": "Failed to add watchlist item"}), 500

    return jsonify({
        "message": "Added to watchlist" if created else "Watchlist item already existed; updated it",
        "item": item.to_dict(),
    }), 201 if created else 200


# ─────────────────────────────────────────
# PUT /portfolio/watchlist/<watchlist_id>
# Partial update — quantity/thesis are the fields the UI edits inline, but
# any field can be sent.
# ─────────────────────────────────────────

@portfolio_bp.put("/watchlist/<int:watchlist_id>")
@jwt_required()
def update_watchlist_item(watchlist_id):
    user_id = get_jwt_identity()
    item = Watchlist.query.filter_by(watchlist_id=watchlist_id, user_id=user_id).first()
    if not item:
        return jsonify({"error": "Watchlist item not found"}), 404

    data = request.get_json(silent=True) or {}
    for field in ("stock_name", "sector", "buy_price", "current_sell_price", "trade_type", "tag1", "tag2", "tag3", "thesis"):
        if field in data:
            setattr(item, field, data[field])
    if "allocation_percent" in data:
        item.allocation_percent = data["allocation_percent"]
    if "amount_invested" in data:
        item.amount_invested = data["amount_invested"]
    if "quantity" in data:
        item.quantity = data["quantity"]

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error(f"Failed to update watchlist item {watchlist_id} for user {user_id}: {exc}")
        return jsonify({"error": "Failed to update watchlist item"}), 500

    return jsonify({"message": "Watchlist item updated", "item": item.to_dict()}), 200


# ─────────────────────────────────────────
# DELETE /portfolio/watchlist/<watchlist_id>
# ─────────────────────────────────────────

@portfolio_bp.delete("/watchlist/<int:watchlist_id>")
@jwt_required()
def delete_watchlist_item(watchlist_id):
    user_id = get_jwt_identity()
    item = Watchlist.query.filter_by(watchlist_id=watchlist_id, user_id=user_id).first()
    if not item:
        return jsonify({"error": "Watchlist item not found"}), 404

    try:
        db.session.delete(item)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error(f"Failed to delete watchlist item {watchlist_id} for user {user_id}: {exc}")
        return jsonify({"error": "Failed to delete watchlist item"}), 500

    return jsonify({"message": "Removed from watchlist", "watchlist_id": watchlist_id}), 200
