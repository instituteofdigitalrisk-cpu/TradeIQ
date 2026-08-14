"""
Admin Repository Layer
Isolated database access for admin views: user listing, drill-downs, and stats.
Aggregations use stored values only (no live market fetches) for speed/consistency.
"""
from datetime import datetime, timedelta

from app.extensions import db
from app.models import (
    User,
    PortfolioSetup,
    TradeLog,
    Holding,
    Watchlist,
    WeeklyScore,
    Leaderboard,
    RiskMetrics,
    InvestmentThesis,
    ThesisScore,
    PaymentRecord,
    ActivityLog,
    CompetitionEnrollment,
    CRMNote,
)
from app.cache import cache_get, cache_set, cache_delete


# ─────────────────────────────────────────
# User listing (paginated + search + filters)
# ─────────────────────────────────────────

SORTABLE_COLUMNS = {
    "created_at": User.created_at,
    "full_name": User.full_name,
    "user_id": User.user_id,
    "email": User.email,
}


def list_users(search=None, role=None, university=None, sort="created_at", order="desc", page=1, per_page=50):
    """Return (total_count, page_of_users)."""
    query = User.query

    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            db.or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                User.user_id.ilike(like),
            )
        )

    if role:
        query = query.filter(User.role == role)

    if university:
        query = query.filter(User.university.ilike(f"%{university.strip()}%"))

    total = query.count()

    column = SORTABLE_COLUMNS.get(sort, User.created_at)
    query = query.order_by(column.desc() if order == "desc" else column.asc())

    users = query.offset((page - 1) * per_page).limit(per_page).all()
    return total, users


def portfolio_setups(user_ids):
    if not user_ids:
        return {}
    rows = PortfolioSetup.query.filter(PortfolioSetup.user_id.in_(user_ids)).all()
    return {p.user_id: p for p in rows}


def holdings_value_map(user_ids):
    """user_id -> sum of market_value across active holdings (quantity > 0)."""
    if not user_ids:
        return {}
    rows = (
        db.session.query(
            Holding.user_id,
            db.func.coalesce(db.func.sum(Holding.market_value), 0).label("mv"),
        )
        .filter(Holding.user_id.in_(user_ids), Holding.quantity > 0)
        .group_by(Holding.user_id)
        .all()
    )
    return {user_id: float(mv or 0) for user_id, mv in rows}


def holdings_count_map(user_ids):
    """user_id -> count of active holdings (quantity > 0)."""
    if not user_ids:
        return {}
    rows = (
        db.session.query(Holding.user_id, db.func.count(Holding.holding_id).label("n"))
        .filter(Holding.user_id.in_(user_ids), Holding.quantity > 0)
        .group_by(Holding.user_id)
        .all()
    )
    return {user_id: int(n or 0) for user_id, n in rows}


def trade_count_map(user_ids):
    if not user_ids:
        return {}
    rows = (
        db.session.query(TradeLog.user_id, db.func.count(TradeLog.trade_id).label("n"))
        .filter(TradeLog.user_id.in_(user_ids))
        .group_by(TradeLog.user_id)
        .all()
    )
    return {user_id: int(n or 0) for user_id, n in rows}


def latest_weekly_scores(user_ids):
    """user_id -> WeeklyScore row for their highest week_number."""
    if not user_ids:
        return {}
    sub = (
        db.session.query(
            WeeklyScore.user_id,
            db.func.max(WeeklyScore.week_number).label("max_week"),
        )
        .filter(WeeklyScore.user_id.in_(user_ids))
        .group_by(WeeklyScore.user_id)
        .subquery()
    )
    rows = (
        db.session.query(WeeklyScore)
        .join(
            sub,
            (WeeklyScore.user_id == sub.c.user_id)
            & (WeeklyScore.week_number == sub.c.max_week),
        )
        .all()
    )
    return {r.user_id: r for r in rows}


def build_user_row(user, portfolio, holdings_value, holdings_count, trade_count, weekly):
    """Combine a user with lightweight aggregated metrics for list/detail payloads."""
    cash = float(portfolio.cash_balance) if portfolio else 0.0
    total_capital = float(portfolio.total_capital) if portfolio else 0.0
    portfolio_value = cash + holdings_value

    return {
        "user_id": user.user_id,
        "full_name": user.full_name,
        "email": user.email,
        "age": user.age,
        "date_of_birth": str(user.date_of_birth) if user.date_of_birth else None,
        "phone_number": user.phone_number,
        "university": user.university,
        "year_of_study": user.year_of_study,
        "role": user.role,
        "account_status": getattr(user, "account_status", None),
        "competition_status": getattr(user, "competition_status", None),
        "mt5_account_id": getattr(user, "mt5_account_id", None),
        "is_paid": bool(user.is_paid),
        "registration_status": user.registration_status,
        "created_at": str(user.created_at) if user.created_at else None,
        "total_capital": total_capital,
        "cash_balance": cash,
        "portfolio_value": round(portfolio_value, 2),
        "return_pct": round(((portfolio_value - total_capital) / total_capital) * 100, 2)
        if total_capital > 0
        else 0.0,
        "holdings_value": round(holdings_value, 2),
        "holdings_count": holdings_count,
        "trade_count": trade_count,
        "latest_week_number": weekly.week_number if weekly else None,
        "latest_final_score": float(weekly.final_score or 0) if weekly else None,
    }


# ─────────────────────────────────────────
# Single-user operations
# ─────────────────────────────────────────

def find_user(user_id):
    return User.query.filter_by(user_id=user_id).first()


def update_user(user_id, **fields):
    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return None
    for key, value in fields.items():
        setattr(user, key, value)
    db.session.commit()
    return user


def delete_user(user_id):
    """Hard-delete a user; child rows are removed by FK ON DELETE CASCADE."""
    db.session.execute(db.delete(User).where(User.user_id == user_id))
    db.session.commit()


def count_admins():
    return User.query.filter_by(role="admin").count()


# ─────────────────────────────────────────
# User drill-down
# ─────────────────────────────────────────

def payment_records(user_id, limit=20):
    return (
        PaymentRecord.query.filter_by(user_id=user_id)
        .order_by(PaymentRecord.created_at.desc())
        .limit(limit)
        .all()
    )


def activity_logs(user_id, limit=50):
    return (
        ActivityLog.query.filter_by(user_id=user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )


def competition_enrollments(user_id, limit=20):
    return (
        CompetitionEnrollment.query.filter_by(user_id=user_id)
        .order_by(CompetitionEnrollment.enrolled_at.desc())
        .limit(limit)
        .all()
    )


def crm_notes(user_id, limit=50):
    return (
        CRMNote.query.filter_by(user_id=user_id)
        .order_by(CRMNote.created_at.desc())
        .limit(limit)
        .all()
    )


def list_competition_enrollments(search=None, page=1, per_page=50):
    query = CompetitionEnrollment.query
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            db.or_(CompetitionEnrollment.user_id.ilike(like), CompetitionEnrollment.competition_round.ilike(like))
        )
    total = query.count()
    rows = query.order_by(CompetitionEnrollment.enrolled_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return total, rows


def user_detail(user_id):
    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return None

    portfolio = PortfolioSetup.query.filter_by(user_id=user_id).first()
    holdings = Holding.query.filter_by(user_id=user_id).all()
    trades = TradeLog.query.filter_by(user_id=user_id).order_by(TradeLog.created_at.desc()).all()
    watchlist = Watchlist.query.filter_by(user_id=user_id).order_by(Watchlist.created_at.desc()).all()
    weekly_scores = WeeklyScore.query.filter_by(user_id=user_id).order_by(WeeklyScore.week_number.desc()).all()
    risk = RiskMetrics.query.filter_by(user_id=user_id).first()
    thesis_rows = (
        InvestmentThesis.query.filter_by(user_id=user_id)
        .order_by(InvestmentThesis.created_at.desc())
        .all()
    )
    payments = payment_records(user_id)
    activities = activity_logs(user_id)
    enrollments = competition_enrollments(user_id)
    notes = crm_notes(user_id)
    trade_theses = [
        {
            "thesis_id": f"trade-{trade.trade_id}",
            "trade_id": trade.trade_id,
            "investment_style": None,
            "risk_level": None,
            "confidence_score": None,
            "reason_text": trade.thesis,
            "created_at": str(trade.created_at) if trade.created_at else None,
            "scores": None,
        }
        for trade in trades
        if (trade.thesis or "").strip()
    ]
    thesis_payloads = [
        {
            "thesis_id": t.thesis_id,
            "trade_id": t.trade_id,
            "investment_style": t.investment_style,
            "risk_level": t.risk_level,
            "confidence_score": t.confidence_score,
            "reason_text": t.reason_text,
            "created_at": str(t.created_at) if t.created_at else None,
            "scores": t.scores.to_dict() if t.scores else None,
        }
        for t in thesis_rows
    ]
    thesis_payloads.extend(trade_theses)

    holdings_value = sum(
        float(h.market_value or 0) for h in holdings if float(h.quantity or 0) > 0
    )
    holdings_count = sum(1 for h in holdings if float(h.quantity or 0) > 0)

    return {
        "profile": build_user_row(user, portfolio, holdings_value, holdings_count, len(trades), None),
        "portfolio": portfolio.to_dict() if portfolio else None,
        "holdings": [h.to_dict() for h in holdings],
        "trades": [t.to_dict() for t in trades],
        "watchlist": [w.to_dict() for w in watchlist],
        "weekly_scores": [s.to_dict() for s in weekly_scores],
        "risk_metrics": risk.to_dict() if risk else None,
        "theses": thesis_payloads,
        "payments": [p.to_dict() for p in payments],
        "activity_logs": [a.to_dict() for a in activities],
        "competition_enrollments": [e.to_dict() for e in enrollments],
        "crm_notes": [n.to_dict() for n in notes],
    }


# ─────────────────────────────────────────
# Platform stats
# ─────────────────────────────────────────

def stats_overview():
    cached = cache_get("admin:stats:overview")
    if cached is not None:
        return cached
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_users = User.query.count()
    users_this_week = User.query.filter(User.created_at >= week_ago).count()
    users_this_month = User.query.filter(User.created_at >= month_ago).count()
    admin_count = User.query.filter_by(role="admin").count()
    student_count = User.query.filter(User.role != "admin").count()

    # Additional CRM counts
    paid_students = User.query.filter(User.is_paid == True).count()
    suspended_accounts = User.query.filter(User.account_status == "suspended").count()
    active_students = User.query.filter(User.account_status == "active").count()

    total_trades = TradeLog.query.count()
    buy_volume = (
        TradeLog.query.filter_by(trade_type="BUY")
        .with_entities(db.func.coalesce(db.func.sum(TradeLog.amount_invested), 0))
        .scalar()
    )
    sell_volume = (
        TradeLog.query.filter_by(trade_type="SELL")
        .with_entities(db.func.coalesce(db.func.sum(TradeLog.amount_invested), 0))
        .scalar()
    )

    active_holdings = Holding.query.filter(Holding.quantity > 0).count()
    portfolios = PortfolioSetup.query.count()

    registrations_by_day = [
        {"date": str(day), "count": int(count)}
        for day, count in (
            db.session.query(
                db.func.date(User.created_at).label("day"),
                db.func.count(User.user_id).label("c"),
            )
            .filter(User.created_at >= month_ago)
            .group_by("day")
            .order_by("day")
            .all()
        )
    ]

    university_breakdown = [
        {"university": uni, "count": int(count)}
        for uni, count in (
            db.session.query(User.university, db.func.count(User.user_id))
            .filter(User.university.isnot(None), User.university != "")
            .group_by(User.university)
            .order_by(db.func.count(User.user_id).desc())
            .limit(10)
            .all()
        )
    ]

    top_performers = _top_performers(10)

    total_capital = (
        PortfolioSetup.query.with_entities(
            db.func.coalesce(db.func.sum(PortfolioSetup.total_capital), 0)
        ).scalar()
    )
    cash = (
        PortfolioSetup.query.with_entities(
            db.func.coalesce(db.func.sum(PortfolioSetup.cash_balance), 0)
        ).scalar()
    )
    holdings_mv = (
        Holding.query.filter(Holding.quantity > 0)
        .with_entities(db.func.coalesce(db.func.sum(Holding.market_value), 0))
        .scalar()
    )
    avg_portfolio_value = (float(cash) + float(holdings_mv)) / portfolios if portfolios else 0.0
    avg_total_capital = float(total_capital) / portfolios if portfolios else 0.0
    avg_return_pct = (
        ((avg_portfolio_value - avg_total_capital) / avg_total_capital) * 100
        if avg_total_capital > 0
        else 0.0
    )
    # Payment aggregates
    payment_record_count = PaymentRecord.query.count()
    payments_amount = (
        PaymentRecord.query.with_entities(db.func.coalesce(db.func.sum(PaymentRecord.amount), 0)).scalar()
    )
    normalized_status = db.func.lower(db.func.trim(PaymentRecord.status))
    payments_completed = PaymentRecord.query.filter(normalized_status.in_(["paid", "completed", "complete", "success", "succeeded"])).count()
    payment_records_pending = PaymentRecord.query.filter(normalized_status.in_(["pending", "created", "processing", "in progress"])).count()
    pending_users = User.query.filter(User.is_paid == False).count()
    payments_pending = max(payment_records_pending, pending_users)
    payments_failed = PaymentRecord.query.filter(normalized_status.in_(["failed", "failure", "declined", "cancelled", "canceled"])).count()
    payments_refunded = PaymentRecord.query.filter(normalized_status.in_(["refunded", "refund"])).count()
    payments_pending_amount = PaymentRecord.query.filter(normalized_status.in_(["pending", "created", "processing", "in progress"])).with_entities(db.func.coalesce(db.func.sum(PaymentRecord.amount), 0)).scalar() or 0

    # Enrollment aggregates
    total_enrollments = CompetitionEnrollment.query.count()
    enrollment_breakdown = [
        {"competition_round": r or "", "count": int(c)}
        for r, c in (
            db.session.query(CompetitionEnrollment.competition_round, db.func.count(CompetitionEnrollment.enrollment_id))
            .group_by(CompetitionEnrollment.competition_round)
            .all()
        )
    ]

    result = {
        "totals": {
            "total_users": total_users,
            "users_this_week": users_this_week,
            "users_this_month": users_this_month,
            "admin_users": admin_count,
            "student_users": student_count,
            "paid_students": int(paid_students),
            "suspended_accounts": int(suspended_accounts),
            "active_students": int(active_students),
            "total_trades": total_trades,
            "buy_volume": round(float(buy_volume or 0), 2),
            "sell_volume": round(float(sell_volume or 0), 2),
            "total_payments": int(max(payment_record_count, payments_completed + payments_pending)),
            "payments_amount": round(float(payments_amount or 0), 2),
            "payments_completed": int(payments_completed),
            "payments_pending": int(payments_pending),
            "payments_pending_amount": round(float(payments_pending_amount), 2),
            "payments_failed": int(payments_failed),
            "payments_refunded": int(payments_refunded),
            "total_enrollments": int(total_enrollments),
            "active_holdings": active_holdings,
            "portfolios": portfolios,
        },
        "averages": {
            "avg_portfolio_value": round(avg_portfolio_value, 2),
            "avg_return_pct": round(avg_return_pct, 2),
        },
        "registrations_by_day": registrations_by_day,
        "university_breakdown": university_breakdown,
        "top_performers": top_performers,
    }
    # Dashboard aggregates span several remote database queries. Keep them briefly
    # cached so every dashboard navigation does not repeat the full aggregation.
    cache_set("admin:stats:overview", result, 120)
    return result


def _top_performers(limit=10):
    sub = (
        db.session.query(
            WeeklyScore.user_id,
            db.func.max(WeeklyScore.week_number).label("max_week"),
        )
        .group_by(WeeklyScore.user_id)
        .subquery()
    )
    rows = (
        db.session.query(WeeklyScore, User)
        .join(User, User.user_id == WeeklyScore.user_id)
        .join(
            sub,
            (WeeklyScore.user_id == sub.c.user_id)
            & (WeeklyScore.week_number == sub.c.max_week),
        )
        .order_by(WeeklyScore.final_score.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "user_id": score.user_id,
            "full_name": user.full_name,
            "email": user.email,
            "university": user.university,
            "week_number": score.week_number,
            "final_score": float(score.final_score or 0),
            "portfolio_score": float(score.portfolio_score or 0),
            "risk_score": float(score.risk_score or 0),
            "thesis_score": float(score.thesis_score or 0),
            "execution_score": float(score.execution_score or 0),
            "strategy_score": float(score.strategy_score or 0),
        }
        for score, user in rows
    ]
