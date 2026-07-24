import logging
import os
import ssl
import time
import uuid
import psutil
from flask import Flask, g, jsonify, request
from dotenv import load_dotenv

# Load environment variables before running config checks
load_dotenv(override=True)

import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from flask_jwt_extended import decode_token

from app.extensions import db, jwt, cors, limiter
from app.cache import cache_backend
from app.logger import setup_central_logger

logger = logging.getLogger(__name__)

sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0,
    )


class ContextFilter(logging.Filter):
    """
    Ensures that custom log format variables (user_id, request_id, session_id, etc.)
    are ALWAYS present in log records, preventing KeyError crashes during startup
    or outside request contexts.
    """
    def filter(self, record):
        # Default fallbacks if attributes are not present on the LogRecord
        defaults = {
            "user_id": getattr(g, "user_id", "SYSTEM") if g else "SYSTEM",
            "request_id": getattr(g, "request_id", "N/A") if g else "N/A",
            "session_id": getattr(g, "session_id", "N/A") if g else "N/A",
            "ip_address": getattr(g, "ip_address", "127.0.0.1") if g else "127.0.0.1",
        }

        for attr, default_value in defaults.items():
            if not hasattr(record, attr):
                setattr(record, attr, default_value)

        return True


def _build_database_uri() -> str:
    host = os.getenv("DB_HOST", "127.0.0.1")
    port = int(os.getenv("DB_PORT", "3306"))
    database = os.getenv("DB_NAME", "tradeiq")
    username = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "yamuna")

    return f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"


def _check_required_config() -> None:
    """Fail loudly and clearly if required settings are missing."""
    required = ["SECRET_KEY", "JWT_SECRET_KEY", "DB_HOST", "DB_NAME", "DB_USER"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "Backend cannot start — missing required environment variable(s): "
            f"{', '.join(missing)}. Check your backend/.env file."
        )

    known_weak_values = {
        "mysecretkey123",
        "jwtkey456",
        "change-me-to-a-long-random-string",
        "change-me-to-another-long-random-string",
        "dev-secret",
        "dev-jwt-secret",
    }
    if (
        os.getenv("SECRET_KEY") in known_weak_values
        or os.getenv("JWT_SECRET_KEY") in known_weak_values
    ):
        print(
            "⚠️ WARNING: SECRET_KEY or JWT_SECRET_KEY is still a placeholder value. "
            "Generate a real random value before using this anywhere other than local dev."
        )


def _build_engine_options() -> dict:
    options = {"pool_pre_ping": True, "pool_recycle": 280}

    if os.getenv("DB_SSL", "false").lower() == "true":
        ca_path = os.getenv(
            "DB_SSL_CA",
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "tidb-ca.pem"),
        )
        ctx = ssl.create_default_context(cafile=ca_path)
        options["connect_args"] = {"ssl": ctx}

    return options


def create_app() -> Flask:
    _check_required_config()
    app = Flask(__name__)

    # Setup Structured Logging
    setup_central_logger(app)

    # Attach ContextFilter to app logger AND root logger handlers
    context_filter = ContextFilter()
    app.logger.addFilter(context_filter)
    logging.getLogger().addFilter(context_filter)
    
    for handler in app.logger.handlers:
        handler.addFilter(context_filter)
    for handler in logging.getLogger().handlers:
        handler.addFilter(context_filter)

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_DATABASE_URI"] = _build_database_uri()
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = _build_engine_options()

    app.logger.info(
        f"[TradeIQ] Starting up — DB host: {os.getenv('DB_HOST')} | "
        f"DB name: {os.getenv('DB_NAME')} | "
        f"SSL: {os.getenv('DB_SSL', 'false')} | "
        f"Env: {os.getenv('FLASK_ENV', 'development')}"
    )

    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    # CORS configuration
    default_origins = "http://localhost:8081,http://localhost:8082"
    allowed_origins = [
        origin.strip()
        for origin in os.getenv("ALLOWED_CORS_ORIGINS", default_origins).split(",")
        if origin.strip()
    ]
    cors.init_app(app, resources={r"/*": {"origins": allowed_origins}})

    # ------------------------------------------------------------------
    # Request-ID & Logging Context Middleware
    # ------------------------------------------------------------------
    @app.before_request
    def set_request_context():
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:8]
        g.request_id = request_id
        g.session_id = request.headers.get("X-Session-ID", "N/A")
        g.ip_address = request.remote_addr or "127.0.0.1"

        # Extract JWT Identity into Logging Context
        g.user_id = "ANONYMOUS"
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                raw_token = auth_header.split(" ")[1]
                decoded = decode_token(raw_token)
                g.user_id = decoded.get("sub", "ANONYMOUS")
            except Exception:
                # Token is missing, expired, or malformed — keep as ANONYMOUS
                pass

    @app.after_request
    def add_request_id_header(response):
        if hasattr(g, "request_id"):
            response.headers["X-Request-ID"] = g.request_id
        return response

    # ------------------------------------------------------------------
    # Blueprints
    # ------------------------------------------------------------------
    from app.auth.routes import auth_bp
    from app.market.routes import market_bp
    from app.portfolio.routes import portfolio_bp
    from app.analytics.routes import analytics_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(analytics_bp)

    # ------------------------------------------------------------------
    # Health Check Endpoints
    # ------------------------------------------------------------------
    @app.get("/health/live")
    def health_live():
        return jsonify({"status": "ok"}), 200

    @app.get("/health/ready")
    def health_ready():
        checks = {}
        overall_ok = True

        # 1. Database Latency Check
        start_time = time.time()
        try:
            db.session.execute(db.text("SELECT 1")).scalar()
            latency_ms = round((time.time() - start_time) * 1000, 2)
            checks["database"] = {"status": "connected", "latency_ms": latency_ms}
        except Exception as exc:
            checks["database"] = {"status": f"unreachable: {str(exc)}"}
            overall_ok = False

        # 2. System Resource Telemetry
        try:
            memory = psutil.virtual_memory()
            checks["system"] = {
                "memory_usage_percent": memory.percent,
                "cpu_usage_percent": psutil.cpu_percent(interval=None),
            }
            if memory.percent > 90:
                overall_ok = False
        except Exception:
            checks["system"] = "telemetry_unavailable"

        # 3. Cache & Limiter Checks
        redis_url = os.getenv("REDIS_URL", "").strip()
        if callable(cache_backend):
            checks["cache_backend"] = cache_backend()
        else:
            checks["cache_backend"] = "redis" if redis_url else "memory"

        checks["rate_limiter_backend"] = "redis" if redis_url else "memory"

        status_code = 200 if overall_ok else 503
        return jsonify({
            "status": "ok" if overall_ok else "unhealthy",
            "app": "TradeIQ Academy",
            "checks": checks
        }), status_code

    @app.get("/health")
    def health_legacy():
        return health_ready()

    return app