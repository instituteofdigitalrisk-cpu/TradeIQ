from datetime import datetime

from flask import Blueprint, jsonify, request

from app.admin.decorators import admin_required
from app.admin import admin_repository as repo
from app.extensions import limiter

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

ALLOWED_ROLES = {"student", "admin"}
EDITABLE_FIELDS = {
    "full_name",
    "university",
    "year_of_study",
    "phone_number",
}


def _parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return None


@admin_bp.get("/stats/overview")
@limiter.limit("60 per minute")
@admin_required
def stats_overview():
    return jsonify(repo.stats_overview()), 200


@admin_bp.get("/users")
@limiter.limit("120 per minute")
@admin_required
def list_users():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", default=50, type=int)))

    role = (request.args.get("role") or "").strip() or None
    university = (request.args.get("university") or "").strip() or None
    q = (request.args.get("q") or "").strip() or None
    sort = (request.args.get("sort") or "created_at").strip()
    order = (request.args.get("order") or "desc").strip().lower()

    if role and role not in ALLOWED_ROLES:
        return jsonify({"error": "role must be one of: student, admin"}), 400

    total, users = repo.list_users(
        search=q,
        role=role,
        university=university,
        sort=sort,
        order=order,
        page=page,
        per_page=per_page,
    )

    user_ids = [u.user_id for u in users]
    portfolios = repo.portfolio_setups(user_ids)
    holdings_values = repo.holdings_value_map(user_ids)
    holdings_counts = repo.holdings_count_map(user_ids)
    trade_counts = repo.trade_count_map(user_ids)
    weekly_scores = repo.latest_weekly_scores(user_ids)

    rows = [
        repo.build_user_row(
            user=user,
            portfolio=portfolios.get(user.user_id),
            holdings_value=holdings_values.get(user.user_id, 0.0),
            holdings_count=holdings_counts.get(user.user_id, 0),
            trade_count=trade_counts.get(user.user_id, 0),
            weekly=weekly_scores.get(user.user_id),
        )
        for user in users
    ]

    return jsonify({
        "total": total,
        "page": page,
        "per_page": per_page,
        "users": rows,
    }), 200


@admin_bp.get("/users/<string:user_id>")
@limiter.limit("120 per minute")
@admin_required
def user_detail(user_id):
    detail = repo.user_detail(user_id)
    if not detail:
        return jsonify({"error": "User not found"}), 404
    return jsonify(detail), 200


@admin_bp.put("/users/<string:user_id>")
@limiter.limit("60 per minute")
@admin_required
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    fields = {}

    if "role" in data:
        role = str(data.get("role") or "").strip()
        if role not in ALLOWED_ROLES:
            return jsonify({"error": "role must be one of: student, admin"}), 400
        fields["role"] = role

    for field in EDITABLE_FIELDS:
        if field in data:
            fields[field] = data[field]

    if "year_of_study" in fields and fields["year_of_study"] is not None:
        try:
            fields["year_of_study"] = int(fields["year_of_study"])
        except (TypeError, ValueError):
            return jsonify({"error": "year_of_study must be an integer"}), 400

    if not fields:
        return jsonify({"error": "No editable fields provided"}), 400

    user = repo.update_user(user_id, **fields)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Keep role changes reflected in the response immediately.
    portfolio = repo.portfolio_setups([user_id]).get(user_id)
    return jsonify(
        repo.build_user_row(
            user=user,
            portfolio=portfolio,
            holdings_value=repo.holdings_value_map([user_id]).get(user_id, 0.0),
            holdings_count=repo.holdings_count_map([user_id]).get(user_id, 0),
            trade_count=repo.trade_count_map([user_id]).get(user_id, 0),
            weekly=repo.latest_weekly_scores([user_id]).get(user_id),
        )
    ), 200


@admin_bp.delete("/users/<string:user_id>")
@limiter.limit("30 per minute")
@admin_required
def delete_user(user_id):
    from flask_jwt_extended import get_jwt_identity

    if user_id == get_jwt_identity():
        return jsonify({"error": "You cannot delete your own account"}), 400

    user = repo.find_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role == "admin" and repo.count_admins() <= 1:
        return jsonify({"error": "Cannot delete the last admin account"}), 400

    repo.delete_user(user_id)
    return jsonify({"message": "User deleted", "user_id": user_id}), 200
