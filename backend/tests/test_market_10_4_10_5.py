import time
import pytest
from unittest.mock import patch, MagicMock


def test_unit_fallback_logic():
    from app.services.market_service import get_price_with_staleness
    from app.cache import _memory_cache, CacheItem, get_redis_client

    # 1. Clear both memory and Redis caches prior to test run
    _memory_cache.clear()
    redis_client = get_redis_client()
    if redis_client:
        redis_client.flushdb()

    # Test 1: Outage with no prior cache -> source = unavailable
    with patch("yfinance.Tickers", side_effect=Exception("API down")), \
         patch("app.services.market_service.yf.Tickers", side_effect=Exception("API down")):
        res1 = get_price_with_staleness("FAIL999")
        assert res1["source"] == "unavailable"
        assert res1["is_stale"] is True
        assert res1["price"] is None

    # Test 2: Live fetch success -> setup mock yf.Tickers
    mock_stock = MagicMock()
    mock_stock.fast_info = {"lastPrice": 175.50}

    mock_batch = MagicMock()
    mock_batch.tickers = {"AAPL": mock_stock}

    with patch("yfinance.Tickers", return_value=mock_batch), \
         patch("app.services.market_service.yf.Tickers", return_value=mock_batch):
        res2 = get_price_with_staleness("AAPL")
        assert res2["price"] == 175.50
        assert res2["is_stale"] is False
        assert res2["source"] in ["live", "cache"]

    # Clear fresh cache across both Memory and Redis
    _memory_cache.pop("price:fresh:AAPL", None)
    if redis_client:
        redis_client.delete("price:fresh:AAPL")

    # Seed fallback cache with a timestamp from 10 minutes ago (so is_stale evaluates to True)
    stale_timestamp = time.time() - 600
    payload = {"price": 175.50, "fetched_at": stale_timestamp}
    
    _memory_cache["price:last_known:AAPL"] = CacheItem(
        value=payload,
        expires_at=time.time() + 86400
    )

    # Test 3: Outage with fallback cache present -> return stale cached price
    with patch("yfinance.Tickers", side_effect=Exception("API down")), \
         patch("app.services.market_service.yf.Tickers", side_effect=Exception("API down")):
        res3 = get_price_with_staleness("AAPL")
        assert res3["price"] == 175.50
        assert res3["is_stale"] is True