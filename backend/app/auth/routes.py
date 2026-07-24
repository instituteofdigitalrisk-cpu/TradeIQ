import json
import uuid
import hashlib
import logging
import os
import random
from datetime import date, datetime, timezone, timedelta
from functools import lru_cache
from html import escape

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, decode_token
import jwt
import resend

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.extensions import db
from app.models import User, PortfolioSetup, PasswordReset

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
logger = logging.getLogger(__name__)
resend.api_key = os.environ.get("RESEND_API_KEY")


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _make_user_id() -> str:
    """Generate a short unique user ID like TIQ-A3F9."""
    return "TIQ-" + uuid.uuid4().hex[:4].upper()


def _get_firebase_project_id() -> str:
    return os.getenv("FIREBASE_PROJECT_ID", "tradeiq-26")


def _ensure_firebase_admin_initialized() -> None:
    if firebase_admin._apps:
        return

    project_id = _get_firebase_project_id()
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    if service_account_json:
        cred = credentials.Certificate(json.loads(service_account_json))
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    elif credentials_path and os.path.exists(credentials_path):
        cred = credentials.Certificate(credentials_path)
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    else:
        firebase_admin.initialize_app(options={"projectId": project_id})


def _verify_google_sign_in_token(id_token_str: str) -> dict:
    """Verify the Firebase ID token issued by the frontend.

    The frontend sends result.user.getIdToken(). Firebase Admin validates the
    signature, issuer, audience, expiry, and token revocation state. We must
    not accept an unsigned or merely decoded JWT payload here.
    """
    project_id = _get_firebase_project_id()

    try:
        _ensure_firebase_admin_initialized()
        payload = firebase_auth.verify_id_token(id_token_str, check_revoked=True)
        if payload.get("aud") != project_id:
            raise ValueError("Firebase token belongs to a different project.")
        return payload
    except Exception as exc:
        raise ValueError(f"Invalid Firebase authentication token: {exc}") from exc


def _ensure_default_portfolio(user_id: str) -> None:
    if PortfolioSetup.query.filter_by(user_id=user_id).first():
        return
    db.session.add(
        PortfolioSetup(
            user_id=user_id,
            total_capital=10000.00,
            cash_balance=10000.00,
        )
    )

# ─────────────────────────────────────────
# Forgot password — OTP via email
# ─────────────────────────────────────────

RESET_CODE_TTL_MINUTES = 10
RESET_CODE_MAX_ATTEMPTS = 5


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _send_reset_email(to_email: str, code: str):
    """Send a password-reset OTP through Resend."""
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY is not configured on the server.")

    params = {
        "from": "TradeIQ <onboarding@resend.dev>",
        "to": [to_email],
        "subject": "TradeIQ - Password Reset Code",
        "html": f"<p>Your TradeIQ password reset code is: <strong>{code}</strong></p>",
    }

    try:
        result = resend.Emails.send(params)
        logger.info("Password reset email sent through Resend to %s", to_email)
        return result
    except Exception as exc:
        logger.exception("Resend password reset email failed for %s: %s", to_email, exc)
        raise RuntimeError("Could not send password reset email through Resend.") from exc


def _send_reset_link_email(to_email: str, reset_link: str):
    """Send the Firebase-generated reset link through Resend."""
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY is not configured on the server.")

    params = {
            "from": "TradeIQ <onboarding@resend.dev>",
            "to": [to_email],
            "subject": "TradeIQ - Password Reset",
            "html": (
                "<p>Click the link below to reset your TradeIQ password.</p>"
            f'<p><a href="{escape(reset_link, quote=True)}">Reset your password</a></p>'
        ),
    }
    try:
        result = resend.Emails.send(params)
        logger.info("Password reset link sent through Resend to %s", to_email)
        return result
    except Exception as exc:
        logger.exception("Resend password reset link failed for %s: %s", to_email, exc)
        raise RuntimeError("Could not send password reset email through Resend.") from exc


@auth_bp.post("/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    user = User.query.filter_by(email=email).first()
    payment_error = (
        "This email is not registered or payment is pending. "
        "Please complete registration first."
    )
    if not user or not (user.is_paid is True or user.registration_status == "completed"):
        return jsonify({"error": payment_error}), 403

    try:
        _ensure_firebase_admin_initialized()
        reset_link = firebase_auth.generate_password_reset_link(email)
        _send_reset_link_email(email, reset_link)
    except Exception as exc:
        logger.exception("Failed to generate/send password reset link for %s: %s", email, exc)
        return jsonify({"error": "Could not send the password reset email. Please try again shortly."}), 502

    return jsonify({"message": "Password reset link generated."}), 200


@auth_bp.post("/verify-reset-code")
def verify_reset_code():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    if not email or not code:
        return jsonify({"error": "Email and code are required"}), 400

    reset = (
        PasswordReset.query.filter_by(email=email, used=False)
        .order_by(PasswordReset.created_at.desc())
        .first()
    )
    if not reset or reset.expires_at < datetime.utcnow():
        return jsonify({"error": "Code expired or invalid. Please request a new one."}), 400

    if reset.attempts >= RESET_CODE_MAX_ATTEMPTS:
        return jsonify({"error": "Too many attempts. Please request a new code."}), 429

    reset.attempts += 1
    if reset.code_hash != _hash_code(code):
        db.session.commit()
        return jsonify({"error": "Invalid code."}), 400

    reset.verified = True
    db.session.commit()

    reset_token = create_access_token(
        identity=reset.user_id,
        additional_claims={"purpose": "password_reset", "reset_id": reset.id},
        expires_delta=timedelta(minutes=10),
    )
    return jsonify({"message": "Code verified", "reset_token": reset_token}), 200


@auth_bp.post("/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    reset_token = data.get("reset_token")
    new_password = data.get("new_password")
    if not reset_token or not new_password:
        return jsonify({"error": "reset_token and new_password are required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    try:
        claims = decode_token(reset_token)
    except Exception:
        return jsonify({"error": "Reset session expired. Please verify your code again."}), 401

    if claims.get("purpose") != "password_reset":
        return jsonify({"error": "Invalid reset session."}), 401

    reset = db.session.get(PasswordReset, claims.get("reset_id"))
    if not reset or reset.used or not reset.verified:
        return jsonify({"error": "Reset session expired. Please verify your code again."}), 401

    user = User.query.filter_by(user_id=claims.get("sub")).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    user.password_hash = _hash_password(new_password)
    reset.used = True
    db.session.commit()

    return jsonify({"message": "Password reset successful. You can now log in with your new password."}), 200


# ─────────────────────────────────────────
# POST /auth/register
# ─────────────────────────────────────────

@auth_bp.post("/register")
def register():
    """Priority 2: Idempotent Registration & Duplicate Safeguards."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    required = ["full_name", "email", "password"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    email = data["email"].strip().lower()
    requested_user_id = (data.get("student_id") or "").strip()
    user_id = requested_user_id or _make_user_id()
    if len(user_id) > 20:
        return jsonify({"error": "student_id must be 20 characters or fewer"}), 400

    # Idempotent Check: Safely handle duplicate/double-tap registration requests
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({
            "error": "Email already registered",
            "message": "User account already exists with this email address.",
            "user_id": existing_user.user_id
        }), 409

    if User.query.filter_by(user_id=user_id).first():
        return jsonify({
            "error": "Student ID already registered",
            "user_id": user_id,
        }), 409

    try:
        user = User(
            user_id=user_id,
            full_name=data["full_name"].strip(),
            email=email,
            password_hash=_hash_password(data["password"]),
            age=data.get("age"),
            date_of_birth=data.get("date_of_birth"),
            phone_number=data.get("phone") or data.get("phone_number"),
            university=data.get("college") or data.get("university"),
            year_of_study=data.get("year_of_study"),
            role=data.get("role", "student"),
        )
        db.session.add(user)

        # Auto-create portfolio with default £10,000 capital
        portfolio = PortfolioSetup(
            user_id=user.user_id,
            total_capital=data.get("total_capital", 10000.00),
            cash_balance=data.get("total_capital", 10000.00),
            risk_appetite=data.get("risk_appetite"),
            investment_horizon=data.get("investment_horizon"),
            competition_round=data.get("competition_round"),
        )
        db.session.add(portfolio)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to complete registration: {str(exc)}"}), 500

    token = create_access_token(identity=user.user_id)
    return jsonify({
        "message": "Registration successful",
        "user": user.to_dict(),
        "token": token,
    }), 201


# ─────────────────────────────────────────
# POST /auth/login
# ─────────────────────────────────────────

@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or user.password_hash != _hash_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(identity=user.user_id)
    return jsonify({
        "message": "Login successful",
        "user": user.to_dict(),
        "token": token,
    }), 200


@auth_bp.post("/google")
def google_auth():
    data = request.get_json(silent=True)
    if not data or not data.get("id_token"):
        return jsonify({"error": "Firebase or Google ID token required"}), 400

    try:
        firebase_user = _verify_google_sign_in_token(data["id_token"])
    except Exception as exc:
        return jsonify({"error": f"Invalid Google sign-in token: {exc}"}), 401

    email = (firebase_user.get("email") or "").strip().lower()
    full_name = (firebase_user.get("name") or email.split("@")[0] or "Google User").strip()
    firebase_uid = firebase_user.get("sub")

    if not email:
        return jsonify({"error": "Google account did not provide an email address"}), 400

    user = User.query.filter_by(email=email).first()
    is_new_user = user is None

    if is_new_user:
        user = User(
            user_id=_make_user_id(),
            full_name=full_name,
            email=email,
            password_hash=_hash_password(f"firebase:{firebase_uid}"),
            role="student",
        )
        db.session.add(user)
        db.session.flush()
    elif full_name and not user.full_name:
        user.full_name = full_name

    _ensure_default_portfolio(user.user_id)
    db.session.commit()

    token = create_access_token(identity=user.user_id)
    return jsonify({
        "message": "Google authentication successful",
        "user": user.to_dict(),
        "token": token,
        "is_new_user": is_new_user,
    }), 200 if not is_new_user else 201
