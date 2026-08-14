"""Tests for admin CRM endpoints: account updates, payments, competition enrollments, activity notes."""
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
    CompetitionEnrollment,
    CRMNote,
)


@pytest.fixture
def seeded(app):
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
            metadata='{"ip": "127.0.0.1"}',
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


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_account_get_and_update(client, seeded):
    headers = auth_headers(seeded["admin_token"])

    # GET account payload
    res = client.get("/admin/users/STU001/account", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert "user" in data
    assert "payments" in data
    assert isinstance(data["payments"], list)

    # Update account fields
    res2 = client.put(
        "/admin/users/STU001/account",
        json={"is_paid": True, "account_status": "suspended", "mt5_account_id": "MT123"},
        headers=headers,
    )
    assert res2.status_code == 200
    updated = res2.get_json()
    assert updated["is_paid"] is True
    assert updated["account_status"] == "suspended"


def test_create_payment_and_list(client, seeded):
    headers = auth_headers(seeded["admin_token"])

    payload = {"amount": 123.45, "status": "completed", "payment_method": "stripe", "reference": "TEST-CRM-001", "notes": "CRM test"}
    res = client.post("/admin/users/STU001/payment", json=payload, headers=headers)
    assert res.status_code == 201
    p = res.get_json()
    assert p["amount"] == 123.45
    assert p["reference"] == "TEST-CRM-001"

    # list payments with query
    res2 = client.get("/admin/payments?q=TEST-CRM-001", headers=headers)
    assert res2.status_code == 200
    j = res2.get_json()
    assert j["total"] >= 1
    assert any(r["reference"] == "TEST-CRM-001" for r in j["payments"])


def test_competition_enroll_update_withdraw(client, seeded):
    headers = auth_headers(seeded["admin_token"])

    # Enroll
    res = client.put("/admin/users/STU001/competition", json={"action": "enroll", "competition_round": "RoundA"}, headers=headers)
    assert res.status_code == 201
    e = res.get_json()
    assert e["status"] == "enrolled"
    assert e["competition_round"] == "RoundA"

    # Update
    res2 = client.put("/admin/users/STU001/competition", json={"action": "update", "competition_round": "RoundB", "status": "active"}, headers=headers)
    assert res2.status_code == 200
    u = res2.get_json()
    assert u["competition_round"] == "RoundB"

    # Withdraw
    res3 = client.put("/admin/users/STU001/competition", json={"action": "withdraw"}, headers=headers)
    assert res3.status_code == 200
    w = res3.get_json()
    assert w["status"] == "withdrawn"


def test_activity_create_and_get(client, seeded):
    headers = auth_headers(seeded["admin_token"])

    res = client.post("/admin/users/STU001/activity", json={"content": "Called student, left voicemail", "note_type": "call"}, headers=headers)
    assert res.status_code == 201
    note = res.get_json()
    assert note["content"] == "Called student, left voicemail"

    # Get activity
    res2 = client.get("/admin/users/STU001/activity", headers=headers)
    assert res2.status_code == 200
    j = res2.get_json()
    assert "crm_notes" in j
    assert any(n["content"] == "Called student, left voicemail" for n in j["crm_notes"])
