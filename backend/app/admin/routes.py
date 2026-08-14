from datetime import datetime
import json

from flask import Blueprint, jsonify, request, current_app
import time

from app.admin.decorators import admin_required
from app.admin import admin_repository as repo
from app.extensions import limiter
from app.models import PaymentRecord, CompetitionEnrollment, CRMNote, Report, ActivityLog, Competition, Setting, User, TradeLog, Leaderboard
import os
import uuid
import csv
from flask import send_file
from app.extensions import db
from app.cache import cache_delete
from flask_jwt_extended import get_jwt_identity

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

ALLOWED_ROLES = {"student", "admin"}
ALLOWED_REGISTRATION_STATUSES = {"pending", "completed", "cancelled", "declined", "refunded"}
EDITABLE_FIELDS = {
    "full_name",
    "university",
    "year_of_study",
    "phone_number",
    "is_paid",
    "registration_status",
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
    t0 = time.time()
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
    t_after_list = time.time()
    user_ids = [u.user_id for u in users]
    portfolios = repo.portfolio_setups(user_ids)
    holdings_values = repo.holdings_value_map(user_ids)
    holdings_counts = repo.holdings_count_map(user_ids)
    trade_counts = repo.trade_count_map(user_ids)
    weekly_scores = repo.latest_weekly_scores(user_ids)
    t_after_aggs = time.time()

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

    t_after_build = time.time()
    try:
        total_ms = int((t_after_build - t0) * 1000)
        list_ms = int((t_after_list - t0) * 1000)
        aggs_ms = int((t_after_aggs - t_after_list) * 1000)
        build_ms = int((t_after_build - t_after_aggs) * 1000)
        current_app.logger.info(
            f"[admin] /admin/users page={page} per_page={per_page} q={q} total={total} returned={len(rows)} timings_ms=list={list_ms} aggs={aggs_ms} build={build_ms} total={total_ms}"
        )
    except Exception:
        pass

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

    if "is_paid" in fields:
        bool_value = _parse_bool(fields["is_paid"])
        if bool_value is None:
            return jsonify({"error": "is_paid must be a boolean"}), 400
        fields["is_paid"] = bool_value

    if "registration_status" in fields:
        status = str(fields["registration_status"] or "").strip().lower()
        if status not in ALLOWED_REGISTRATION_STATUSES:
            return jsonify({"error": "registration_status must be one of: pending, completed, cancelled, declined, refunded"}), 400
        fields["registration_status"] = status

    if not fields:
        return jsonify({"error": "No editable fields provided"}), 400

    user = repo.update_user(user_id, **fields)
    if not user:
        return jsonify({"error": "User not found"}), 404
    cache_delete("admin:stats:overview")

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



@admin_bp.get("/users/<string:user_id>/account")
@limiter.limit("60 per minute")
@admin_required
def user_account(user_id):
    user = repo.find_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    payments = repo.payment_records(user_id)
    enrollments = repo.competition_enrollments(user_id)
    notes = repo.crm_notes(user_id)

    return jsonify({
        "user": repo.build_user_row(
            user=user,
            portfolio=repo.portfolio_setups([user_id]).get(user_id),
            holdings_value=repo.holdings_value_map([user_id]).get(user_id, 0.0),
            holdings_count=repo.holdings_count_map([user_id]).get(user_id, 0),
            trade_count=repo.trade_count_map([user_id]).get(user_id, 0),
            weekly=repo.latest_weekly_scores([user_id]).get(user_id),
        ),
        "payments": [p.to_dict() for p in payments],
        "competition_enrollments": [e.to_dict() for e in enrollments],
        "crm_notes": [n.to_dict() for n in notes],
    }), 200


@admin_bp.put("/users/<string:user_id>/account")
@limiter.limit("30 per minute")
@admin_required
def update_user_account(user_id):
    data = request.get_json(silent=True) or {}
    mutable = {}
    for key in ("account_status", "competition_status", "mt5_account_id", "is_paid", "registration_status"):
        if key in data:
            mutable[key] = data[key]

    if not mutable:
        return jsonify({"error": "No account fields provided"}), 400

    # Validate boolean
    if "is_paid" in mutable:
        v = mutable["is_paid"]
        if isinstance(v, bool):
            pass
        elif isinstance(v, str):
            mutable["is_paid"] = v.strip().lower() in ("1", "true", "yes", "on")
        else:
            return jsonify({"error": "is_paid must be a boolean"}), 400

    user = repo.update_user(user_id, **mutable)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Keep the user's payment flag and the payment ledger synchronized. When an
    # admin marks a user paid, the latest payment record must also become paid.
    if "is_paid" in mutable:
        latest_payment = PaymentRecord.query.filter_by(user_id=user_id).order_by(PaymentRecord.created_at.desc()).first()
        if latest_payment:
            latest_payment.status = "paid" if mutable["is_paid"] else "pending"
            latest_payment.processed_at = datetime.utcnow() if mutable["is_paid"] else None
        elif mutable["is_paid"]:
            db.session.add(PaymentRecord(
                user_id=user_id,
                amount=0,
                status="paid",
                payment_method="Manual",
                reference=f"admin_marked_paid_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
                notes="Payment marked as paid by admin",
                processed_at=datetime.utcnow(),
            ))
        db.session.commit()
        cache_delete("admin:stats:overview")

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


@admin_bp.post("/users/<string:user_id>/payment")
@limiter.limit("30 per minute")
@admin_required
def create_payment(user_id):
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount"))
    except Exception:
        return jsonify({"error": "amount is required"}), 400
    status = str(data.get("status") or "pending")
    method = data.get("payment_method")
    reference = data.get("reference")
    notes = data.get("notes")

    pr = PaymentRecord(
        user_id=user_id,
        amount=amount,
        status=status,
        payment_method=method,
        reference=reference,
        notes=notes,
    )
    db.session.add(pr)
    db.session.commit()
    cache_delete("admin:stats:overview")
    return jsonify(pr.to_dict()), 201


@admin_bp.get("/payments")
@limiter.limit("60 per minute")
@admin_required
def list_payments():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(200, max(1, request.args.get("per_page", default=50, type=int)))
    q = (request.args.get("q") or "").strip() or None

    query = PaymentRecord.query
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(PaymentRecord.reference.ilike(like), PaymentRecord.notes.ilike(like))
        )

    total = query.count()
    # totals
    total_amount = query.with_entities(db.func.coalesce(db.func.sum(PaymentRecord.amount), 0)).scalar() or 0
    status_totals = {"succeeded": {"count": 0, "amount": 0.0}, "pending": {"count": 0, "amount": 0.0}, "failed": {"count": 0, "amount": 0.0}, "refunded": {"count": 0, "amount": 0.0}}
    for raw_status, amount_sum, count in query.with_entities(PaymentRecord.status, db.func.sum(PaymentRecord.amount), db.func.count(PaymentRecord.payment_id)).group_by(PaymentRecord.status).all():
        normalized = str(raw_status or "").strip().lower()
        key = "succeeded" if any(value in normalized for value in ("paid", "complete", "success")) else "pending" if any(value in normalized for value in ("pending", "process", "created")) else "failed" if any(value in normalized for value in ("fail", "declin", "cancel")) else "refunded" if "refund" in normalized else None
        if key:
            status_totals[key]["count"] += int(count or 0)
            status_totals[key]["amount"] += float(amount_sum or 0)

    rows = query.order_by(PaymentRecord.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_amount": float(total_amount),
        "status_totals": status_totals,
        "payments": [r.to_dict() for r in rows],
    }), 200



@admin_bp.get("/payments/export")
@limiter.limit("10 per minute")
@admin_required
def export_payments():
    q = (request.args.get("q") or "").strip() or None
    query = PaymentRecord.query
    if q:
        like = f"%{q}%"
        query = query.filter(db.or_(PaymentRecord.reference.ilike(like), PaymentRecord.notes.ilike(like)))

    rows = query.order_by(PaymentRecord.created_at.desc()).all()

    # Create CSV
    out_path = os.path.join(os.getcwd(), "backend", "reports")
    os.makedirs(out_path, exist_ok=True)
    fname = f"payments_export_{uuid.uuid4().hex}.csv"
    full = os.path.join(out_path, fname)
    try:
        with open(full, "w", newline='', encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(["payment_id", "user_id", "amount", "status", "method", "reference", "notes", "processed_at", "created_at"])
            for r in rows:
                writer.writerow([
                    r.payment_id,
                    r.user_id,
                    float(r.amount or 0),
                    r.status,
                    r.payment_method,
                    r.reference,
                    r.notes,
                    r.processed_at.isoformat() if r.processed_at else None,
                    r.created_at.isoformat() if r.created_at else None,
                ])
    except Exception as e:
        return jsonify({"error": f"Failed to export payments: {e}"}), 500

    return send_file(full, as_attachment=True, download_name=fname)


@admin_bp.get("/settings")
@limiter.limit("60 per minute")
@admin_required
def list_settings():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(200, max(1, request.args.get("per_page", default=50, type=int)))
    q = (request.args.get("q") or "").strip() or None

    query = Setting.query
    if q:
        like = f"%{q}%"
        query = query.filter(Setting.key.ilike(like))

    total = query.count()
    rows = query.order_by(Setting.key).offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({"total": total, "page": page, "per_page": per_page, "settings": [r.to_dict() for r in rows]}), 200


@admin_bp.put("/settings")
@limiter.limit("30 per minute")
@admin_required
def put_settings():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object of key->value pairs required"}), 400

    updated = []
    for k, v in data.items():
        s = Setting.query.get(k)
        if s:
            s.value = v
        else:
            s = Setting(key=k, value=v)
            db.session.add(s)
        updated.append(s.to_dict())

    db.session.commit()
    return jsonify({"updated": updated}), 200


@admin_bp.get("/reports")
@limiter.limit("30 per minute")
@admin_required
def list_reports():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(200, max(1, request.args.get("per_page", default=50, type=int)))

    query = Report.query
    total = query.count()
    rows = query.order_by(Report.generated_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    def _r_to_dict(r: Report):
        return {
            "report_id": r.report_id,
            "user_id": r.user_id,
            "week_number": r.week_number,
            "report_path": r.report_path,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
        }

    return jsonify({"total": total, "page": page, "per_page": per_page, "reports": [_r_to_dict(r) for r in rows]}), 200


@admin_bp.post("/reports")
@limiter.limit("10 per minute")
@admin_required
def create_report():
    data = request.get_json(silent=True) or {}
    rtype = str(data.get("type") or "users_summary")

    if rtype not in {"users_summary", "trading_activity", "leaderboard"}:
        return jsonify({"error": "Unsupported report type"}), 400

    # Create reports dir
    reports_dir = os.path.join(os.getcwd(), "backend", "reports")
    os.makedirs(reports_dir, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report_prefix = {"users_summary": "user_performance_report", "trading_activity": "trading_activity_report", "leaderboard": "leaderboard_report"}[rtype]
    filename = f"{report_prefix}_{timestamp}_{uuid.uuid4().hex[:6]}.csv"
    fullpath = os.path.join(reports_dir, filename)

    if rtype in {"trading_activity", "leaderboard"}:
        try:
            with open(fullpath, "w", newline="", encoding="utf-8") as fh:
                writer = csv.writer(fh)
                if rtype == "trading_activity":
                    writer.writerow(["trade_id", "user_id", "student", "trade_date", "ticker", "stock_name", "type", "quantity", "buy_price", "amount_invested", "sector"])
                    rows = TradeLog.query.order_by(TradeLog.created_at.desc()).all()
                    for row in rows:
                        writer.writerow([row.trade_id, row.user_id, row.user.full_name if row.user else "", row.trade_date, row.stock_ticker, row.stock_name, row.trade_type, row.quantity, row.buy_price, row.amount_invested, row.sector])
                else:
                    writer.writerow(["rank", "user_id", "student", "university", "week", "portfolio_score", "risk_score", "thesis_score", "execution_score", "strategy_score", "final_score"])
                    rows = Leaderboard.query.order_by(Leaderboard.rank_position.asc(), Leaderboard.final_score.desc()).all()
                    for row in rows:
                        writer.writerow([row.rank_position, row.user_id, row.user.full_name if row.user else "", row.user.university if row.user else "", row.week_number, row.portfolio_score, row.risk_score, row.thesis_score, row.execution_score, row.strategy_score, row.final_score])
        except Exception as e:
            return jsonify({"error": f"Failed to generate report: {e}"}), 500
        rel_path = os.path.join("reports", filename)
        rpt = Report(user_id=None, week_number=None, report_path=rel_path)
        db.session.add(rpt)
        db.session.commit()
        return jsonify({"report_id": rpt.report_id, "report_path": rel_path, "generated_at": rpt.generated_at.isoformat()}), 201

    # Build user summary rows (single-page, large per_page)
    total, users = repo.list_users(page=1, per_page=10000)
    user_ids = [u.user_id for u in users]
    portfolios = repo.portfolio_setups(user_ids)
    holdings_values = repo.holdings_value_map(user_ids)
    holdings_counts = repo.holdings_count_map(user_ids)
    trade_counts = repo.trade_count_map(user_ids)
    weekly_scores = repo.latest_weekly_scores(user_ids)

    header = [
        "user_id",
        "full_name",
        "email",
        "university",
        "created_at",
        "account_status",
        "competition_status",
        "is_paid",
        "portfolio_value",
        "return_pct",
        "holdings_value",
        "holdings_count",
        "trade_count",
        "latest_final_score",
    ]

    try:
        with open(fullpath, "w", newline='', encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(header)
            for u in users:
                profile = repo.build_user_row(
                    user=u,
                    portfolio=portfolios.get(u.user_id),
                    holdings_value=holdings_values.get(u.user_id, 0.0),
                    holdings_count=holdings_counts.get(u.user_id, 0),
                    trade_count=trade_counts.get(u.user_id, 0),
                    weekly=weekly_scores.get(u.user_id),
                )
                writer.writerow([
                    profile.get("user_id"),
                    profile.get("full_name"),
                    profile.get("email"),
                    profile.get("university"),
                    profile.get("created_at"),
                    profile.get("account_status"),
                    profile.get("competition_status"),
                    profile.get("is_paid"),
                    profile.get("portfolio_value"),
                    profile.get("return_pct"),
                    profile.get("holdings_value"),
                    profile.get("holdings_count"),
                    profile.get("trade_count"),
                    profile.get("latest_final_score"),
                ])
    except Exception as e:
        return jsonify({"error": f"Failed to generate report: {e}"}), 500

    # Persist metadata
    rel_path = os.path.join("reports", filename)
    rpt = Report(user_id=None, week_number=None, report_path=rel_path)
    db.session.add(rpt)
    db.session.commit()

    return jsonify({"report_id": rpt.report_id, "report_path": rel_path, "generated_at": rpt.generated_at.isoformat()}), 201


@admin_bp.get("/reports/<int:report_id>/download")
@limiter.limit("30 per minute")
@admin_required
def download_report(report_id):
    rpt = Report.query.get(report_id)
    if not rpt:
        return jsonify({"error": "Report not found"}), 404

    # Resolve path
    report_path = rpt.report_path
    if not os.path.isabs(report_path):
        fullpath = os.path.join(os.getcwd(), "backend", report_path)
    else:
        fullpath = report_path

    if not os.path.exists(fullpath):
        return jsonify({"error": "Report file missing"}), 404

    return send_file(fullpath, as_attachment=True, download_name=os.path.basename(fullpath))


@admin_bp.delete("/reports/<int:report_id>")
@limiter.limit("20 per minute")
@admin_required
def delete_report(report_id):
    rpt = Report.query.get(report_id)
    if not rpt:
        return jsonify({"error": "Report not found"}), 404

    reports_root = os.path.abspath(os.path.join(os.getcwd(), "backend", "reports"))
    report_path = rpt.report_path
    fullpath = report_path if os.path.isabs(report_path) else os.path.join(os.getcwd(), "backend", report_path)
    fullpath = os.path.abspath(fullpath)
    if not (fullpath == reports_root or fullpath.startswith(reports_root + os.sep)):
        return jsonify({"error": "Invalid report path"}), 400

    if os.path.exists(fullpath):
        os.remove(fullpath)
    db.session.delete(rpt)
    db.session.commit()
    return jsonify({"message": "Report deleted", "report_id": report_id}), 200


@admin_bp.get("/competitions")
@limiter.limit("60 per minute")
@admin_required
def list_competitions():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(200, max(1, request.args.get("per_page", default=50, type=int)))
    q = (request.args.get("q") or "").strip() or None

    total, rows = repo.list_competition_enrollments(search=q, page=page, per_page=per_page)
    return jsonify({"total": total, "page": page, "per_page": per_page, "enrollments": [r.to_dict() for r in rows]}), 200


@admin_bp.get("/competitions/rounds")
@limiter.limit("60 per minute")
@admin_required
def list_competition_rounds():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(200, max(1, request.args.get("per_page", default=50, type=int)))

    query = Competition.query
    total = query.count()
    # Avoid Postgres-specific NULLS LAST which TiDB/MySQL do not support.
    # Order by whether start_date is NULL first, then by start_date desc.
    nulls_last_order = db.case((Competition.start_date == None, 1), else_=0)
    rows = query.order_by(nulls_last_order, Competition.start_date.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({"total": total, "page": page, "per_page": per_page, "rounds": [r.to_dict() for r in rows]}), 200


@admin_bp.post("/competitions/rounds")
@limiter.limit("20 per minute")
@admin_required
def create_competition_round():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if not name:
        return jsonify({"error": "name required"}), 400
    slug = data.get("slug")
    description = data.get("description")
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    active = bool(data.get("active", True))

    c = Competition(name=name, slug=slug, description=description, active=active)
    try:
        if start_date:
            c.start_date = datetime.fromisoformat(start_date).date()
        if end_date:
            c.end_date = datetime.fromisoformat(end_date).date()
    except Exception:
        return jsonify({"error": "Invalid date format; use YYYY-MM-DD"}), 400

    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


@admin_bp.get("/competitions/rounds/<int:round_id>")
@limiter.limit("60 per minute")
@admin_required
def get_competition_round(round_id):
    c = Competition.query.get(round_id)
    if not c:
        return jsonify({"error": "Not found"}), 404
    return jsonify(c.to_dict()), 200


@admin_bp.put("/competitions/rounds/<int:round_id>")
@limiter.limit("20 per minute")
@admin_required
def update_competition_round(round_id):
    c = Competition.query.get(round_id)
    if not c:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    for k in ("name", "slug", "description"):
        if k in data:
            setattr(c, k, data.get(k))
    if "active" in data:
        c.active = bool(data.get("active"))
    try:
        if "start_date" in data and data.get("start_date"):
            c.start_date = datetime.fromisoformat(data.get("start_date")).date()
        if "end_date" in data and data.get("end_date"):
            c.end_date = datetime.fromisoformat(data.get("end_date")).date()
    except Exception:
        return jsonify({"error": "Invalid date format; use YYYY-MM-DD"}), 400
    db.session.commit()
    return jsonify(c.to_dict()), 200


@admin_bp.delete("/competitions/rounds/<int:round_id>")
@limiter.limit("20 per minute")
@admin_required
def delete_competition_round(round_id):
    c = Competition.query.get(round_id)
    if not c:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify({"message": "deleted", "competition_id": round_id}), 200


@admin_bp.get("/users/<string:user_id>/competition")
@limiter.limit("60 per minute")
@admin_required
def user_competition(user_id):
    enrolls = repo.competition_enrollments(user_id)
    return jsonify({"competition_enrollments": [e.to_dict() for e in enrolls]}), 200


@admin_bp.put("/users/<string:user_id>/competition")
@limiter.limit("30 per minute")
@admin_required
def update_user_competition(user_id):
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "").strip().lower()
    round_name = data.get("competition_round")

    if action not in ("enroll", "withdraw", "update"):
        return jsonify({"error": "action must be enroll, withdraw or update"}), 400

    if action == "enroll":
        e = CompetitionEnrollment(user_id=user_id, competition_round=round_name or None, status="enrolled")
        db.session.add(e)
        db.session.commit()
        return jsonify(e.to_dict()), 201

    # withdraw or update: try to find latest enrollment
    e = CompetitionEnrollment.query.filter_by(user_id=user_id).order_by(CompetitionEnrollment.enrolled_at.desc()).first()
    if not e:
        return jsonify({"error": "No enrollment found to update/withdraw"}), 404
    if action == "withdraw":
        e.status = "withdrawn"
    elif action == "update":
        if round_name:
            e.competition_round = round_name
        if "status" in data:
            e.status = data.get("status")
    db.session.commit()
    return jsonify(e.to_dict()), 200


@admin_bp.get("/users/<string:user_id>/activity")
@limiter.limit("60 per minute")
@admin_required
def user_activity(user_id):
    activities = repo.activity_logs(user_id)
    notes = repo.crm_notes(user_id)
    return jsonify({"activity_logs": [a.to_dict() for a in activities], "crm_notes": [n.to_dict() for n in notes]}), 200


@admin_bp.get("/activity")
@limiter.limit("60 per minute")
@admin_required
def list_activity():
    page = max(1, request.args.get("page", default=1, type=int))
    per_page = min(200, max(1, request.args.get("per_page", default=50, type=int)))
    user_id = (request.args.get("user_id") or "").strip() or None
    event_type = (request.args.get("event_type") or "").strip() or None
    search = (request.args.get("q") or "").strip() or None
    module = (request.args.get("module") or "").strip() or None
    action = (request.args.get("action") or "").strip() or None
    start = (request.args.get("start") or "").strip() or None
    end = (request.args.get("end") or "").strip() or None

    query = ActivityLog.query
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)
    if event_type:
        query = query.filter(ActivityLog.event_type.ilike(f"%{event_type}%"))
    if search:
        term = f"%{search}%"
        query = query.filter(db.or_(ActivityLog.event_type.ilike(term), ActivityLog.description.ilike(term), ActivityLog.user_id.ilike(term), ActivityLog.event_metadata.ilike(term)))
    if module:
        query = query.filter(db.or_(ActivityLog.event_type.ilike(f"%{module}%"), ActivityLog.description.ilike(f"%{module}%")))
    if action:
        query = query.filter(db.or_(ActivityLog.event_type.ilike(f"%{action}%"), ActivityLog.description.ilike(f"%{action}%")))
    if start:
        try:
            from datetime import datetime

            sdt = datetime.fromisoformat(start)
            query = query.filter(ActivityLog.created_at >= sdt)
        except Exception:
            pass
    if end:
        try:
            from datetime import datetime

            edt = datetime.fromisoformat(end)
            query = query.filter(ActivityLog.created_at <= edt)
        except Exception:
            pass

    total = query.count()
    rows = query.order_by(ActivityLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    target_ids = {row.user_id for row in rows}
    target_users = {u.user_id: u for u in User.query.filter(User.user_id.in_(target_ids)).all()} if target_ids else {}

    def audit_row(row):
        item = row.to_dict()
        event = (row.event_type or "").replace("_", " ").strip().title()
        text = f"{row.event_type} {row.description or ''}".lower()
        module_name = "Thesis & Scores" if "thesis" in text or "score" in text else "Payments" if "payment" in text else "Competition" if "competition" in text or "enroll" in text else "Trading" if "trade" in text else "Users"
        target = target_users.get(row.user_id)
        try:
            metadata = json.loads(row.event_metadata or "{}")
        except (TypeError, ValueError):
            metadata = {}
        actor = metadata.get("actor") or ("System" if any(word in text for word in ("thesis", "score", "enroll", "trade executed")) else "Admin")
        item.update({"actor": actor, "action": event, "module": module_name, "target_name": target.full_name if target else row.user_id, "status": "Success", "details": row.description or row.event_metadata or "Activity recorded."})
        return item

    return jsonify({"total": total, "page": page, "per_page": per_page, "activity_logs": [audit_row(r) for r in rows]}), 200


@admin_bp.post("/users/<string:user_id>/activity")
@limiter.limit("30 per minute")
@admin_required
def create_activity_note(user_id):
    data = request.get_json(silent=True) or {}
    content = data.get("content")
    note_type = data.get("note_type")
    if not content:
        return jsonify({"error": "content required"}), 400
    created_by = get_jwt_identity()
    note = CRMNote(user_id=user_id, created_by=created_by, note_type=note_type, content=content)
    db.session.add(note)
    db.session.commit()
    return jsonify(note.to_dict()), 201


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
