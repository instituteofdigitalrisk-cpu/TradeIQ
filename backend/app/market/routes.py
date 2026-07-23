from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import limiter
from app.services.market_service import (
    stock_info as service_stock_info,
    price_history as service_price_history,
    benchmark as service_benchmark,
    current_price as service_current_price,
    batch_prices as service_batch_prices,
    indices as service_indices,
    search as service_search,
    MarketError,
)

market_bp = Blueprint("market", __name__, url_prefix="/market")


@market_bp.errorhandler(MarketError)
def handle_market_error(e: MarketError):
    """Centralized handler that intercepts MarketError exceptions and returns 
    structured JSON error responses with proper HTTP status codes."""
    return jsonify({"error": e.message}), e.status_code


@market_bp.get("/stock/<string:ticker>")
@limiter.limit("60 per minute")
@jwt_required()
def get_stock_info(ticker):
    info = service_stock_info(ticker)
    return jsonify(info), 200


@market_bp.get("/history/<string:ticker>")
@limiter.limit("60 per minute")
@jwt_required()
def get_price_history(ticker):
    start = request.args.get("start")
    end = request.args.get("end")
    result = service_price_history(ticker, start, end)
    return jsonify(result), 200


@market_bp.get("/benchmark")
@limiter.limit("60 per minute")
@jwt_required()
def get_benchmark():
    start = request.args.get("start")
    end = request.args.get("end")
    result = service_benchmark(start, end)
    return jsonify(result), 200


@market_bp.get("/price/<string:ticker>")
@limiter.limit("60 per minute")
@jwt_required()
def get_current_price(ticker):
    result = service_current_price(ticker)
    return jsonify(result), 200


@market_bp.get("/prices")
@limiter.limit("60 per minute")
@jwt_required()
def get_batch_prices():
    tickers_raw = request.args.get("tickers", "")
    tickers = [ticker.strip() for ticker in tickers_raw.split(",") if ticker.strip()]
    return jsonify(service_batch_prices(tickers)), 200


@market_bp.get("/indices")
@limiter.limit("60 per minute")
@jwt_required()
def get_indices():
    return jsonify({"indices": service_indices()}), 200


@market_bp.get("/search")
@limiter.limit("30 per minute")
@jwt_required()
def search_stocks():
    q = request.args.get("q", "")
    return jsonify(service_search(q)), 200
