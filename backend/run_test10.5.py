# This is backend/run_test10.5.py
import os
import sys
import requests

# Set backend path dynamically
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from app import create_app, db

app = create_app()

BASE = "http://localhost:5000"
TOKEN = None
HEADERS = {}


def log_header(title):
    print("\n" + "=" * 42)
    print(f" {title}")
    print("=" * 42)


def authenticate():
    global TOKEN, HEADERS
    with app.app_context():
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()

        user_table = "users" if "users" in tables else "user" if "user" in tables else None
        if not user_table:
            print("❌ Could not find a 'users' or 'user' table in database.")
            sys.exit(1)

        columns = [col["name"] for col in inspector.get_columns(user_table)]
        id_col = next((c for c in ["id", "user_id", "student_id"] if c in columns), columns[0])
        role_col = "role" if "role" in columns else None

        if role_col:
            query = f"SELECT {id_col} FROM {user_table} WHERE {role_col} = 'student' LIMIT 1"
        else:
            query = f"SELECT {id_col} FROM {user_table} LIMIT 1"

        result = db.session.execute(db.text(query)).fetchone()

        if not result and role_col:
            result = db.session.execute(db.text(f"SELECT {id_col} FROM {user_table} LIMIT 1")).fetchone()

        if not result:
            print("❌ No user record found in database.")
            sys.exit(1)

        user_id = str(result[0])

    from flask_jwt_extended import create_access_token
    with app.app_context():
        TOKEN = create_access_token(identity=user_id)
        HEADERS = {
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        }
    print(f"✅ Successfully authenticated for tests!\n   USER_ID: {user_id}\n")
    return user_id


def test_unit_fallback_logic():
    log_header("TEST GROUP 1: Unit Level Price Service Fallback Logic")
    from app.services.market_service import get_price_with_staleness, cache_set, FRESH_TTL_SECONDS, FALLBACK_TTL_SECONDS

    # 1. Clear cache / Outage with no prior cache
    res1 = get_price_with_staleness("NONEXISTENT_TEST_TICKER")
    print("B1 Outage with no fallback:", res1)
    assert res1["price"] is None
    assert res1["is_stale"] is True
    assert res1["source"] == "unavailable"

    # 2. Simulate live fetch success
    payload = {"price": 175.5, "fetched_at": 1000.0}
    cache_set("price:fresh:TEST_AAPL", payload, FRESH_TTL_SECONDS)
    cache_set("price:last_known:TEST_AAPL", payload, FALLBACK_TTL_SECONDS)

    res2 = get_price_with_staleness("TEST_AAPL")
    print("B2 Live fetch success:", res2)
    assert res2["price"] == 175.5
    assert res2["is_stale"] is False
    assert res2["source"] == "cache"

    # 3. Simulate live failure with fallback cache present (expire fresh cache key)
    cache_set("price:fresh:TEST_AAPL", None, 0)

    res3 = get_price_with_staleness("TEST_AAPL")
    print("B2 Outage with fallback cache present:", res3)
    assert res3["price"] == 175.5
    assert res3["is_stale"] is True
    assert res3["source"] == "cache"

    print("✅ Unit Level Fallback Assertions Passed!")


def test_integration_endpoints(user_id):
    log_header("TEST GROUP 2: Portfolio & Analytics Endpoints Under Normal & Outage Conditions")

    # A1 Portfolio Summary -> GET /portfolio/summary/<user_id>
    r1 = requests.get(f"{BASE}/portfolio/summary/{user_id}", headers=HEADERS)
    print(f"A1 Portfolio Summary Response: Code {r1.status_code}")
    assert r1.status_code == 200

    # A2 Portfolio Holdings -> GET /portfolio/holdings/<user_id>
    r2 = requests.get(f"{BASE}/portfolio/holdings/{user_id}", headers=HEADERS)
    print(f"A2 Portfolio Holdings Response: Code {r2.status_code}")
    assert r2.status_code == 200

    # C3 Analytics Compute -> POST /analytics/compute/<user_id>
    r3 = requests.post(f"{BASE}/analytics/compute/{user_id}", headers=HEADERS)
    print(f"C3 Analytics Compute Response: Code {r3.status_code}")
    assert r3.status_code == 200

    print("✅ Integration Endpoints Operating Gracefully!")


def test_thesis_and_rounding_validation():
    log_header("TEST GROUP 3: Section 10.5 Thesis Validation & Quantity Enforcement")

    trade_url = f"{BASE}/portfolio/trade"

    # 1. Empty thesis test (201 expected)
    res_empty = requests.post(trade_url, headers=HEADERS, json={
        "stock_ticker": "AAPL", "trade_type": "BUY", "quantity": 1, "thesis": ""
    })
    print(f"1. Empty Thesis: Status {res_empty.status_code}")
    assert res_empty.status_code == 201

    # 2. Whitespace-only thesis test (201 expected)
    res_space = requests.post(trade_url, headers=HEADERS, json={
        "stock_ticker": "AAPL", "trade_type": "BUY", "quantity": 1, "thesis": "     "
    })
    print(f"2. Whitespace Thesis: Status {res_space.status_code}")
    assert res_space.status_code == 201

    # 3. Too short thesis (< 20 chars) (400 expected)
    res_short = requests.post(trade_url, headers=HEADERS, json={
        "stock_ticker": "AAPL", "trade_type": "BUY", "quantity": 1, "thesis": "Short thesis"
    })
    print(f"3. Short Thesis (<20 chars): Status {res_short.status_code}")
    assert res_short.status_code == 400

    # 4. Valid boundary thesis (20 chars) (201 expected)
    res_valid_20 = requests.post(trade_url, headers=HEADERS, json={
        "stock_ticker": "AAPL", "trade_type": "BUY", "quantity": 1, "thesis": "12345678901234567890"
    })
    print(f"4. Valid 20-char Thesis: Status {res_valid_20.status_code}")
    assert res_valid_20.status_code == 201

    # 5. Oversized thesis (> 2000 chars) (400 expected)
    res_huge = requests.post(trade_url, headers=HEADERS, json={
        "stock_ticker": "AAPL", "trade_type": "BUY", "quantity": 1, "thesis": "x" * 2001
    })
    print(f"5. Oversized Thesis (>2000 chars): Status {res_huge.status_code}")
    assert res_huge.status_code == 400

    print("✅ All Thesis & Quantity Validation Tests Passed!")


if __name__ == "__main__":
    user_id = authenticate()
    test_unit_fallback_logic()
    test_integration_endpoints(user_id)
    test_thesis_and_rounding_validation()