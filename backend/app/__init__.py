import os
from flask import Flask, make_response, request
from app.extensions import db, jwt, cors

def _build_database_uri() -> str:
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "3306")
    name = os.getenv("DB_NAME", "tradeiq")
    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "")

    if user and password:
        auth = f"{user}:{password}"
    elif user:
        auth = user
    else:
        auth = ""

    return f"mysql+pymysql://{auth}@{host}:{port}/{name}"


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["SECRET_KEY"] = "dev-secret"
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    # app.config["SQLALCHEMY_DATABASE_URI"] = (
    #     "mysql+pymysql://YdgqymojqpaKqJk.root:fRJ2LBHIjVMxsQL8"
    #     "@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/tradeiq"
    #     "?ssl_verify_cert=false&ssl_verify_identity=false"
    # )
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", _build_database_uri())
    # app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    #     "connect_args": {"ssl": {"check_hostname": False}}
    # }
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    @app.before_request
    def handle_options_preflight():
        if request.method == "OPTIONS":
            return make_response("", 204)

    @app.after_request
    def add_cors_headers(response):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        return response

    from app.auth.routes      import auth_bp
    from app.market.routes    import market_bp
    from app.portfolio.routes import portfolio_bp
    from app.analytics.routes import analytics_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(analytics_bp)

    @app.get("/health")
    def health():
        return {"status": "ok", "app": "TradeIQ Academy"}, 200

    return app
