"""Tests for the admin blueprint (role-gated user management + stats)."""
from datetime import datetime
import pytest
from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models import (
    User,
    PortfolioSetup,
    TradeLog,
    Holding,
    WeeklyScore,
    RiskMetrics,
    PaymentRecord,
    ActivityLog,
)


@pytest.fixture
def admin_app(app):
    """Standard test app with rate limiting disabled for admin endpoints."""
    app.config["RATELIMIT_ENABLED"] = False
    return app


@pytest.fixture
def seeded(admin_app):
    admin = User(
        user_id="ADM001", full_name="Admin User", email="admin@test.com",
        role="admin", password_hash="h", university="Admin University", year_of_study=3,
    )
    student = User(
        user_id="STU001", full_name="Student One", email="s1@test.com",
        role="student", password_hash="h", university="Alpha University", year_of_study=2,
    )
    other = User(
        user_id="STU002", full_name="Student Two", email="s2@test.com",
        role="student", password_hash="h", university="Beta University",
    )

    db.session.add_all([admin, student, other])
    db.session.flush()

    db.session.add(
        PortfolioSetup(user_id="STU001", total_capital=10000.00, cash_balance=6000.00)
    )
    db.session.add(
        Holding(
            user_id="STU001", stock_ticker="AAPL", stock_name="Apple",
            quantity=10, avg_buy_price=400, current_price=200,
            market_value=2000, profit_loss=-2000,
        )
    )
    db.session.add(
        PaymentRecord(
            user_id="STU001",
            amount=499.99,
            currency="USD",
            status="completed",
            payment_method="stripe",
            reference="CHARGE-001",
            notes="Initial course fee",
            processed_at=datetime.utcnow(),
        )
    )
    db.session.add(
        ActivityLog(
            user_id="STU001",
            event_type="login",
            description="User logged in successfully",
            metadata="{\"ip\": \"127.0.0.1\"}",
        )
    )
    db.session.add(
        TradeLog(
            trade_id="TRD0001", user_id="STU001", stock_ticker="AAPL",
            stock_name="Apple", sector="Technology", trade_type="BUY",
            amount_invested=4000, quantity=10, buy_price=400,
            current_sell_price=200, allocation_percent=40,
            thesis="This thesis came from the trade record.",
        )
    )
    db.session.add(
        WeeklyScore(
            user_id="STU001", week_number=1, portfolio_score=30, risk_score=18,
            thesis_score=20, execution_score=10, strategy_score=10, final_score=88,
        )
    )
    db.session.add(
        RiskMetrics(
            user_id="STU001", sharpe_ratio=1.2, beta=1.1, volatility=0.2,
            max_drawdown=0.1, var_value=0.05,
        )
    )
    db.session.commit()

    return {
        "admin_token": create_access_token(identity="ADM001"),
        "student_token": create_access_token(identity="STU001"),
    }


# ─────────────────────────────────────────
# Authorization
# ─────────────────────────────────────────

def test_admin_routes_require_admin(client, seeded):
    student_headers = {"Authorization": f"Bearer {seeded['student_token']}"}

    for method, path in [
        ("GET", "/admin/stats/overview"),
        ("GET", "/admin/users"),
        ("GET", "/admin/users/STU002"),
        ("PUT", "/admin/users/STU002"),
        ("DELETE", "/admin/users/STU002"),
    ]:
        res = client.open(path, method=method, headers=student_headers)
        assert res.status_code == 403, f"{method} {path} should be 403"


def test_admin_routes_require_auth(client):
    res = client.get("/admin/users")
    assert res.status_code == 401


# ─────────────────────────────────────────
# User listing
# ─────────────────────────────────────────

def test_list_users(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}
    res = client.get("/admin/users", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert data["total"] == 3
    assert len(data["users"]) == 3

    by_id = {u["user_id"]: u for u in data["users"]}
    stu = by_id["STU001"]
    assert stu["portfolio_value"] == 8000.0
    assert stu["return_pct"] == -20.0
    assert stu["cash_balance"] == 6000.0
    assert stu["holdings_count"] == 1
    assert stu["trade_count"] == 1
    assert stu["latest_final_score"] == 88.0
    assert stu["latest_week_number"] == 1
    assert stu["is_paid"] is False
    assert stu["registration_status"] == "pending"
    assert "password_hash" not in stu


def test_list_users_search_and_filters(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}

    res = client.get("/admin/users?q=Student%20One", headers=headers)
    assert res.get_json()["total"] == 1

    res = client.get("/admin/users?role=admin", headers=headers)
    assert res.get_json()["total"] == 1
    assert res.get_json()["users"][0]["role"] == "admin"

    res = client.get("/admin/users?university=Beta", headers=headers)
    assert res.get_json()["total"] == 1
    assert res.get_json()["users"][0]["user_id"] == "STU002"

    res = client.get("/admin/users?page=2&per_page=2", headers=headers)
    assert res.get_json()["page"] == 2
    assert len(res.get_json()["users"]) == 1

    res = client.get("/admin/users?role=bogus", headers=headers)
    assert res.status_code == 400


# ─────────────────────────────────────────
# User drill-down
# ─────────────────────────────────────────

def test_user_detail(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}

    res = client.get("/admin/users/STU001", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert data["profile"]["full_name"] == "Student One"
    assert data["profile"]["is_paid"] is False
    assert data["profile"]["registration_status"] == "pending"
    assert data["portfolio"]["cash_balance"] == 6000.0
    assert len(data["holdings"]) == 1
    assert len(data["trades"]) == 1
    assert len(data["weekly_scores"]) == 1
    assert data["risk_metrics"]["sharpe_ratio"] == 1.2
    assert len(data["theses"]) == 1
    assert data["theses"][0]["reason_text"] == "This thesis came from the trade record."
    assert len(data["payments"]) == 1
    assert data["payments"][0]["status"] == "completed"
    assert len(data["activity_logs"]) == 1
    assert data["activity_logs"][0]["event_type"] == "login"

    res = client.get("/admin/users/NOPE", headers=headers)
    assert res.status_code == 404


# ─────────────────────────────────────────
# Manage users
# ─────────────────────────────────────────

def test_update_user_role(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}

    res = client.put("/admin/users/STU002", json={"role": "admin"}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["role"] == "admin"

    res = client.put("/admin/users/STU002", json={"role": "student", "university": "Gamma University"}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["role"] == "student"
    assert res.get_json()["university"] == "Gamma University"

    res = client.put("/admin/users/STU002", json={"is_paid": True, "registration_status": "completed"}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["is_paid"] is True
    assert res.get_json()["registration_status"] == "completed"

    res = client.put("/admin/users/STU002", json={"role": "superuser"}, headers=headers)
    assert res.status_code == 400

    res = client.put("/admin/users/MISSING", json={"role": "student"}, headers=headers)
    assert res.status_code == 404

    res = client.put("/admin/users/STU002", json={"role": "superuser"}, headers=headers)
    assert res.status_code == 400

    res = client.put("/admin/users/MISSING", json={"role": "student"}, headers=headers)
    assert res.status_code == 404


def test_update_user_ignores_unknown_fields(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}
    res = client.put("/admin/users/STU002", json={"password_hash": "hacked"}, headers=headers)
    assert res.status_code == 400


def test_delete_user(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}

    res = client.delete("/admin/users/STU002", headers=headers)
    assert res.status_code == 200

    res = client.get("/admin/users", headers=headers)
    assert res.get_json()["total"] == 2

    res = client.delete("/admin/users/MISSING", headers=headers)
    assert res.status_code == 404


def test_delete_self_blocked(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}
    res = client.delete("/admin/users/ADM001", headers=headers)
    assert res.status_code == 400


def test_delete_last_admin_blocked(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}

    # Demote the only other admin's peers; ADM001 becomes the last admin.
    res = client.delete("/admin/users/ADM001", headers=headers)
    assert res.status_code == 400


# ─────────────────────────────────────────
# Stats overview
# ─────────────────────────────────────────

def test_stats_overview(client, seeded):
    headers = {"Authorization": f"Bearer {seeded['admin_token']}"}
    res = client.get("/admin/stats/overview", headers=headers)
    assert res.status_code == 200
    data = res.get_json()

    assert data["totals"]["total_users"] == 3
    assert data["totals"]["student_users"] == 2
    assert data["totals"]["admin_users"] == 1
    assert data["totals"]["total_trades"] == 1
    assert data["totals"]["buy_volume"] == 4000.0
    assert data["totals"]["active_holdings"] == 1
    assert data["averages"]["avg_portfolio_value"] == 8000.0
    assert data["averages"]["avg_return_pct"] == -20.0
    assert data["registrations_by_day"] == [{"count": 3, "date": str(datetime.utcnow().date())}]
    assert any(b["university"] == "Alpha University" for b in data["university_breakdown"])
    assert len(data["top_performers"]) == 1
    assert data["top_performers"][0]["final_score"] == 88.0
    # CRM/payments/enrollment aggregates
    assert data["totals"]["total_payments"] == 1
    assert data["totals"]["payments_amount"] == 499.99
    assert data["totals"]["payments_completed"] == 1
    assert data["totals"]["payments_pending"] == 0
    assert data["totals"]["total_enrollments"] == 0
