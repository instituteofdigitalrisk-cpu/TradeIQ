"""
Analytics Repository Layer
Isolated database access for leaderboard, weekly scores, risk metrics, portfolio data
"""
from app.extensions import db
from sqlalchemy.exc import IntegrityError
from app.models import WeeklyScore, Leaderboard, InvestmentThesis, ThesisScore
from app.models import (
    User, PortfolioSetup, TradeLog, Holding, WeeklyScore, Leaderboard, RiskMetrics
)


# ─────────────────────────────────────────
# Portfolio & Holdings
# ─────────────────────────────────────────

def find_portfolio_by_user(user_id: str) -> PortfolioSetup | None:
    """Get portfolio setup for a user."""
    return PortfolioSetup.query.filter_by(user_id=user_id).first()


def find_trades_by_user(user_id: str) -> list:
    """Get all trades for a user."""
    return TradeLog.query.filter_by(user_id=user_id).all()


def find_holdings_by_user(user_id: str) -> list:
    """Get all holdings for a user."""
    return Holding.query.filter_by(user_id=user_id).all()


# ─────────────────────────────────────────
# Risk Metrics
# ─────────────────────────────────────────

def find_risk_metrics_by_user(user_id: str) -> RiskMetrics | None:
    """Get latest risk metrics for a user."""
    return RiskMetrics.query.filter_by(user_id=user_id).first()


# ─────────────────────────────────────────
# Weekly Scores
# ─────────────────────────────────────────

def find_weekly_scores_by_user(user_id: str) -> list:
    """Get all weekly scores for a user, newest first."""
    return WeeklyScore.query\
        .filter_by(user_id=user_id)\
        .order_by(WeeklyScore.week_number.desc())\
        .all()


def find_weekly_score(user_id: str, week_number: int) -> WeeklyScore | None:
    """Get a specific weekly score."""
    return WeeklyScore.query.filter_by(user_id=user_id, week_number=week_number).first()


def find_weekly_scores_by_week(week_number: int) -> list:
    """Get all weekly scores for a week, ranked by final score (best first)."""
    return WeeklyScore.query\
        .filter_by(week_number=week_number)\
        .order_by(WeeklyScore.final_score.desc(), WeeklyScore.created_at.asc())\
        .all()

def upsert_weekly_score(user_id: str, week_number: int, scores_dict: dict) -> WeeklyScore:
    """Create or update a weekly score record. Race-safe under concurrent calls."""
    weekly = WeeklyScore.query.filter_by(user_id=user_id, week_number=week_number).first()

    if not weekly:
        weekly = WeeklyScore(user_id=user_id, week_number=week_number)
        db.session.add(weekly)
        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            weekly = WeeklyScore.query.filter_by(user_id=user_id, week_number=week_number).first()

    weekly.portfolio_score = scores_dict.get("portfolio_score", 0.0)
    weekly.risk_score = scores_dict.get("risk_score", 0.0)
    weekly.thesis_score = scores_dict.get("thesis_score", 0.0)
    weekly.execution_score = scores_dict.get("execution_score", 0.0)
    weekly.strategy_score = scores_dict.get("strategy_score", 0.0)
    weekly.final_score = scores_dict.get("final_score", 0.0)

    return weekly


def upsert_thesis_score(
    trade: TradeLog,
    component_scores: dict,
    total_score: float,
    feedback: str,
) -> ThesisScore:
    """Persist the normalized thesis and its per-thesis evaluation."""
    thesis = InvestmentThesis.query.filter_by(trade_id=trade.trade_id).first()
    if thesis is None:
        thesis = InvestmentThesis(
            trade_id=trade.trade_id,
            user_id=trade.user_id,
        )
        db.session.add(thesis)

    thesis.reason_text = trade.thesis
    db.session.flush()

    score = ThesisScore.query.filter_by(thesis_id=thesis.thesis_id).first()
    if score is None:
        score = ThesisScore(thesis_id=thesis.thesis_id)
        db.session.add(score)

    score.clarity_score = component_scores.get("clarity", 0.0)
    score.reasoning_score = component_scores.get("financial_logic", 0.0)
    score.risk_awareness_score = component_scores.get("risk_awareness", 0.0)
    score.market_understanding_score = component_scores.get("market_understanding", 0.0)
    score.total_score = total_score
    score.feedback = feedback
    return score



# ─────────────────────────────────────────
# Leaderboard
# ─────────────────────────────────────────

def find_leaderboard_entries_by_week(week_number: int) -> list:
    """Get all leaderboard entries for a week, ranked."""
    return Leaderboard.query\
        .filter_by(week_number=week_number)\
        .order_by(Leaderboard.rank_position.asc())\
        .all()


def find_leaderboard_entry(user_id: str, week_number: int) -> Leaderboard | None:
    """Get a specific leaderboard entry."""
    return Leaderboard.query.filter_by(user_id=user_id, week_number=week_number).first()


def upsert_leaderboard_entry(user_id: str, week_number: int, scores_dict: dict, rank: int) -> Leaderboard:
    """Create or update a leaderboard entry. Race-safe under concurrent calls."""
    entry = Leaderboard.query.filter_by(user_id=user_id, week_number=week_number).first()

    if not entry:
        entry = Leaderboard(user_id=user_id, week_number=week_number)
        db.session.add(entry)
        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            entry = Leaderboard.query.filter_by(user_id=user_id, week_number=week_number).first()

    entry.portfolio_score = scores_dict.get("portfolio_score", 0.0)
    entry.risk_score = scores_dict.get("risk_score", 0.0)
    entry.thesis_score = scores_dict.get("thesis_score", 0.0)
    entry.execution_score = scores_dict.get("execution_score", 0.0)
    entry.strategy_score = scores_dict.get("strategy_score", 0.0)
    entry.final_score = scores_dict.get("final_score", 0.0)
    entry.rank_position = rank

    return entry

# ─────────────────────────────────────────
# Users
# ─────────────────────────────────────────

def find_all_non_admin_users() -> list:
    """Get all users except admins, ordered by creation date."""
    return User.query.filter(
        (User.role.is_(None)) | (User.role != "admin")
    ).order_by(User.created_at.asc()).all()


def find_user(user_id: str) -> User | None:
    """Get a user by ID."""
    return User.query.get(user_id)


# ─────────────────────────────────────────
# Session Management
# ─────────────────────────────────────────

def save() -> None:
    """Commit all pending database changes."""
    db.session.commit()


def flush() -> None:
    """Flush pending changes without committing (for mid-transaction refresh)."""
    db.session.flush()
