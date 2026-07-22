import uuid
import hashlib
import os
from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.extensions import db
from app.models import User, PortfolioSetup

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

_google_request = google_requests.Request()


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _make_user_id() -> str:
    """Generate a short unique user ID like TIQ-A3F9."""
    return "TIQ-" + uuid.uuid4().hex[:4].upper()


def _get_firebase_project_id() -> str:
    return os.getenv("FIREBASE_PROJECT_ID", "tradeiq-26")


def _get_google_web_client_id() -> str:
    # The OAuth "web" client id from google-services.json (oauth_client entry
    # with client_type 3) — only relevant if a native Google Sign-In SDK is
    # ever wired up; the current web app uses Firebase's signInWithPopup
    # instead, which is verified separately below.
    return os.getenv(
        "GOOGLE_WEB_CLIENT_ID",
        "1013397127798-nb34o20mn4qd26opc8etp7mth7aqqe7i.apps.googleusercontent.com",
    )


def _verify_firebase_id_token(id_token: str) -> dict:
    """Verify a token issued by the Firebase Auth SDK (issuer securetoken.google.com/<project>).

    This is what the web app's signInWithPopup()/getIdToken() flow sends.

    Deliberately uses google-auth's own verifier instead of manually fetching
    Firebase's x509 certs and calling PyJWT's jwt.decode() with the resulting
    key object: PyJWT's RSAAlgorithm.prepare_key() rejects the key unless it
    passes `isinstance(key, RSAPublicKey)` against the `cryptography`
    package's classes, and that check can fail across certain PyJWT/
    cryptography version combinations even for a perfectly valid key —
    surfacing as "Could not parse the provided public key." google-auth does
    its own RSA verification and never goes through that code path.
    """
    project_id = _get_firebase_project_id()
    payload = google_id_token.verify_firebase_token(id_token, _google_request, audience=project_id)
    if not payload:
        raise ValueError("Could not verify Firebase ID token.")
    expected_issuer = f"https://securetoken.google.com/{project_id}"
    if payload.get("iss") != expected_issuer:
        raise ValueError("Wrong issuer for Firebase ID token.")
    return payload


def _verify_google_oauth_id_token(id_token: str) -> dict:
    """Verify a raw Google Sign-In ID token (issuer accounts.google.com).

    This is what native "Sign in with Google" SDKs (e.g.
    @react-native-google-signin/google-signin) hand back when configured
    with a webClientId/serverClientId — not currently used by this app's web
    flow, but kept so a native client can plug in later without more
    backend changes.
    """
    client_id = _get_google_web_client_id()
    payload = google_id_token.verify_oauth2_token(id_token, _google_request, client_id)
    if payload.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Wrong issuer for Google ID token.")
    return payload


def _verify_google_sign_in_token(id_token: str) -> dict:
    """Accept either a Firebase ID token (current web signInWithPopup flow) or
    a raw Google OAuth2 ID token (future native Google Sign-In), whichever
    the client actually sent. Firebase is tried first since that's what this
    app currently produces.
    """
    errors = []
    try:
        return _verify_firebase_id_token(id_token)
    except Exception as exc:
        errors.append(f"firebase: {exc}")

    try:
        return _verify_google_oauth_id_token(id_token)
    except Exception as exc:
        errors.append(f"google-oauth2: {exc}")

    raise ValueError(" / ".join(errors))


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
# POST /auth/register
# ─────────────────────────────────────────

@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    required = ["full_name", "email", "password"]
    missing  = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(
        user_id            = _make_user_id(),
        full_name          = data["full_name"],
        email              = data["email"],
        password_hash      = _hash_password(data["password"]),
        age                = data.get("age"),
        date_of_birth      = data.get("date_of_birth"),
        phone_number       = data.get("phone_number"),
        university         = data.get("university"),
        year_of_study      = data.get("year_of_study"),
        role               = data.get("role", "student"),
    )
    db.session.add(user)

    # Auto-create portfolio with default £10,000 capital
    portfolio = PortfolioSetup(
        user_id            = user.user_id,
        total_capital      = data.get("total_capital", 10000.00),
        cash_balance       = data.get("total_capital", 10000.00),
        risk_appetite      = data.get("risk_appetite"),
        investment_horizon = data.get("investment_horizon"),
        competition_round  = data.get("competition_round"),
    )
    db.session.add(portfolio)
    db.session.commit()

    token = create_access_token(identity=user.user_id)
    return jsonify({
        "message": "Registration successful",
        "user":    user.to_dict(),
        "token":   token,
    }), 201


# ─────────────────────────────────────────
# POST /auth/login
# ─────────────────────────────────────────

@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    email    = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or user.password_hash != _hash_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(identity=user.user_id)
    return jsonify({
        "message": "Login successful",
        "user":    user.to_dict(),
        "token":   token,
    }), 200


@auth_bp.post("/google")
def google_auth():
    data = request.get_json(silent=True)
    if not data or not data.get("id_token"):
        return jsonify({"error": "Firebase ID token required"}), 400

    try:
        firebase_user = _verify_firebase_id_token(data["id_token"])
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
