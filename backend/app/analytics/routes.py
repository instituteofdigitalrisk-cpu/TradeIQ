# this is backend\app\analytics\routes.py
import os
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db, limiter
from app.models import User
from app.repositories.user_repository import is_admin
from app.services import analytics_service as service
from app.services.analytics_service import AnalyticsError

analytics_bp = Blueprint("analytics", __name__, url_prefix="/analytics")


def _competition_start_date() -> date:
    """Return the configured competition start, or the first registration date."""
    configured = os.getenv("COMPETITION_START_DATE", "").strip()
    if configured:
        try:
            return date.fromisoformat(configured)
        except ValueError:
            raise ValueError("COMPETITION_START_DATE must use YYYY-MM-DD format")

    first_registration = db.session.query(db.func.min(User.created_at)).scalar()
    if first_registration:
        return first_registration.date() if isinstance(first_registration, datetime) else first_registration
    return date.today()


def _competition_week(as_of: date | None = None) -> int:
    start = _competition_start_date()
    current = as_of or date.today()
    return max(1, ((current - start).days // 7) + 1)


def _user_competition_start_date(user_id: str) -> date:
    configured = os.getenv("COMPETITION_START_DATE", "").strip()
    if configured:
        return _competition_start_date()

    user = db.session.get(User, user_id)
    if user and user.created_at:
        return user.created_at.date() if isinstance(user.created_at, datetime) else user.created_at
    return date.today()


def _user_competition_week(user_id: str, as_of: date | None = None) -> int:
    start = _user_competition_start_date(user_id)
    current = as_of or date.today()
    return max(1, ((current - start).days // 7) + 1)


def _add_relative_week_labels(result: dict, user_id: str) -> dict:
    """Expose human-friendly relative weeks while retaining stored history."""
    start = _user_competition_start_date(user_id)
    for score in result.get("scores", []):
        recorded_at = score.get("created_at")
        try:
            recorded_date = datetime.fromisoformat(recorded_at).date() if recorded_at else date.today()
        except (TypeError, ValueError):
            recorded_date = date.today()
        relative_week = max(1, ((recorded_date - start).days // 7) + 1)
        score["stored_week_number"] = score.get("week_number")
        score["week_number"] = relative_week
        score["week_label"] = f"Week {relative_week}"
    result["competition_week"] = _user_competition_week(user_id)
    result["competition_start_date"] = start.isoformat()
    return result


@analytics_bp.errorhandler(AnalyticsError)
def handle_analytics_error(e: AnalyticsError):
    return jsonify({"error": e.message}), e.status_code


@analytics_bp.get("/leaderboard")
@limiter.limit("60 per minute")
@jwt_required()
def get_leaderboard():
    week = request.args.get("week", default=_competition_week(), type=int)
    result = service.get_leaderboard_service(week)
    return jsonify(result), 200


@analytics_bp.get("/scores/<string:user_id>")
@limiter.limit("60 per minute")
@jwt_required()
def get_scores(user_id):
    current_user_id = get_jwt_identity()
    if current_user_id != user_id and not is_admin(current_user_id):
        return jsonify({"error": "Not authorized to view scores for this user"}), 403

    result = service.get_scores_service(user_id)
    return jsonify(_add_relative_week_labels(result, user_id)), 200


@analytics_bp.get("/risk/<string:user_id>")
@limiter.limit("60 per minute")
@jwt_required()
def get_risk(user_id):
    current_user_id = get_jwt_identity()
    if current_user_id != user_id and not is_admin(current_user_id):
        return jsonify({"error": "Not authorized to view risk metrics for this user"}), 403

    result = service.get_risk_service(user_id)
    return jsonify(result), 200


@analytics_bp.post("/compute-legacy/<string:user_id>")
@limiter.limit("20 per minute")
@jwt_required()
def compute_scores(user_id):
    current_user_id = get_jwt_identity()
    if current_user_id != user_id and not is_admin(current_user_id):
        return jsonify({"error": "Not authorized to compute legacy scores for this user"}), 403

    result = service.compute_legacy_scores_service(user_id)
    return jsonify({"message": "Legacy scores computed", **result}), 200


@analytics_bp.post("/compute/<string:user_id>")
@limiter.limit("20 per minute")
@jwt_required()
def compute_and_persist_scores(user_id):
    current_user_id = get_jwt_identity()
    if current_user_id != user_id and not is_admin(current_user_id):
        return jsonify({"error": "Not authorized to compute scores for this user"}), 403

    week_number = request.args.get("week", default=_user_competition_week(user_id), type=int)
    result = service.compute_and_persist_scores_service(user_id, week_number)
    return jsonify({"message": "Scores computed", **result}), 200
