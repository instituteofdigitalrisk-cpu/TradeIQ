from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
import yfinance as yf

from app.cache import cache_get, cache_set
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


@market_bp.get("/quote/<string:symbol>")
@limiter.limit("60 per minute")
def get_stock_quote(symbol: str):
    """Priority 1: Market Data Proxy Route with Redis Caching (60s TTL)."""
    symbol = symbol.upper().strip()
    cache_key = f"market_quote:{symbol}"
    
    # 1. Check cache first
    cached_data = cache_get(cache_key)
    if cached_data:
        return jsonify({"source": "cache", "data": cached_data}), 200

    # 2. Fetch from market provider (yfinance)
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        
        # Guard against invalid or empty tickers returned by yfinance
        price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        if not info or price is None:
            return jsonify({"error": f"Symbol '{symbol}' not found or no price data available"}), 404

        quote_data = {
            "symbol": symbol,
            "price": price,
            "currency": info.get("currency", "USD"),
            "companyName": info.get("shortName") or info.get("longName") or symbol,
        }
        
        # 3. Cache result for 60 seconds
        cache_set(cache_key, quote_data, ttl_seconds=60)
        return jsonify({"source": "live", "data": quote_data}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch market data: {str(e)}"}), 500


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