# This is backend/run_test 10.4.py
import time
import requests
from unittest.mock import patch

BASE = "http://localhost:5000"

USER_DATA = {
    "email": "price_test_user@example.com",
    "password": "password123",
    "full_name": "Price Resilience User"
}

# Authenticate
login_res = requests.post(f"{BASE}/auth/login", json=USER_DATA)
if login_res.status_code != 200:
    requests.post(f"{BASE}/auth/register", json=USER_DATA)
    login_res = requests.post(f"{BASE}/auth/login", json=USER_DATA)

if login_res.status_code == 200:
    data = login_res.json()
    TOKEN = data.get("access_token") or data.get("token")
    USER_ID = (
        data.get("user_id") 
        or data.get("id") 
        or (data.get("user") or {}).get("user_id") 
        or (data.get("user") or {}).get("id")
    )
    print("✅ Successfully authenticated for §10.4 tests!")
    print(f"   USER_ID: {USER_ID}\n")
else:
    print(f"❌ Auth failed ({login_res.status_code}): {login_res.text}")
    exit(1)

HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def log_header(title):
    print(f"\n==========================================\n {title}\n==========================================")

def test_unit_fallback_logic():
    log_header("TEST GROUP 1: Unit Level Price Service Fallback Logic")
    from app.services.market_service import get_price_with_staleness
    from app.cache import _memory_cache

    # B1: Live fetch fails, no prior cached price -> unavailable
    with patch("app.market.pipeline.YahooFinancePipeline.get_current_price", side_effect=Exception("API down")):
        res1 = get_price_with_staleness("FAIL_TICKER_999")
        print(f"B1 Outage with no fallback: {res1}")
        assert res1["source"] == "unavailable"
        assert res1["is_stale"] is True
        assert res1["price"] is None

    # B2: Live fetch succeeds -> populates fresh & fallback cache
    with patch("app.market.pipeline.YahooFinancePipeline.get_current_price", return_value=175.50):
        res2 = get_price_with_staleness("AAPL")
        print(f"B2 Live fetch success: {res2}")
        assert res2["source"] == "live"
        assert res2["is_stale"] is False
        assert res2["price"] == 175.50

    # Expire fresh cache manually, simulate API outage -> fallback used
    _memory_cache.pop("price:fresh:AAPL", None)
    with patch("app.market.pipeline.YahooFinancePipeline.get_current_price", side_effect=Exception("API down")):
        res3 = get_price_with_staleness("AAPL")
        print(f"B2 Outage with fallback cache present: {res3}")
        assert res3["source"] == "cache"
        assert res3["is_stale"] is True
        assert res3["price"] == 175.50

    print("✅ Unit Level Fallback Assertions Passed!")

def test_integration_endpoints():
    log_header("TEST GROUP 2: Portfolio & Analytics Endpoints Under Normal & Outage Conditions")

    # A1 & A2: Live API response checks
    res_summary = requests.get(f"{BASE}/portfolio/summary/{USER_ID}", headers=HEADERS)
    print(f"A1 Portfolio Summary Response: Code {res_summary.status_code} | Payload: {res_summary.json()}")
    
    res_holdings = requests.get(f"{BASE}/portfolio/holdings/{USER_ID}", headers=HEADERS)
    print(f"A2 Portfolio Holdings Response: Code {res_holdings.status_code} | Payload: {res_holdings.json()}")

    # C3: Analytics compute endpoint integrity check
    res_analytics = requests.post(f"{BASE}/analytics/compute/{USER_ID}?week=30", headers=HEADERS)
    print(f"C3 Analytics Compute Response: Code {res_analytics.status_code}")
    assert res_analytics.status_code == 200

    print("✅ Integration Endpoints Operating Gracefully!")

if __name__ == "__main__":
    test_unit_fallback_logic()
    test_integration_endpoints()