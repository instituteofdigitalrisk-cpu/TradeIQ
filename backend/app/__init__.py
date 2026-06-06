from flask import Flask
from config.settings import get_config
from app.extensions import db, jwt, cors


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(get_config())

    # Extensions
    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/*": {"origins": "*"}})

    # Blueprints
    from app.auth.routes      import auth_bp
    from app.market.routes    import market_bp
    from app.portfolio.routes import portfolio_bp
    from app.analytics.routes import analytics_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(analytics_bp)

    with app.app_context():
        db.create_all()

    @app.get("/health")
    def health():
        return {"status": "ok", "app": "TradeIQ Academy"}, 200

    return app
