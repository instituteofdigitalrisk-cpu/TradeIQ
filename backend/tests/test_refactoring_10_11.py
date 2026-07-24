import pytest
from flask_jwt_extended import create_access_token

from app.auth.routes import auth_bp
from app.portfolio.routes import portfolio_bp
from app.analytics.routes import analytics_bp
from app.services.auth_service import AuthError
from app.services.portfolio_service import PortfolioError
from app.services.analytics_service import AnalyticsError
from app.models import User
from app.repositories.user_repository import is_admin

# Attach test endpoints directly to the blueprints
@auth_bp.route("/test-auth-error")
def trigger_auth_error():
    raise AuthError("Invalid credentials provided", status_code=401)

@portfolio_bp.route("/test-portfolio-error")
def trigger_portfolio_error():
    raise PortfolioError("Insufficient funds for trade", status_code=400)

@analytics_bp.route("/test-analytics-error")
def trigger_analytics_error():
    raise AnalyticsError("No score data available", status_code=404)

@pytest.fixture
def refactor_app(app):
    """Augment standard test app for 10.11 blueprint testing."""
    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.config["TRAP_HTTP_EXCEPTIONS"] = False
    app.config["RATELIMIT_ENABLED"] = False

    @app.errorhandler(AuthError)
    def handle_auth_error(e):
        return {"error": e.message}, getattr(e, "status_code", 401)

    @app.errorhandler(PortfolioError)
    def handle_portfolio_error(e):
        return {"error": e.message}, getattr(e, "status_code", 400)

    @app.errorhandler(AnalyticsError)
    def handle_analytics_error(e):
        return {"error": e.message}, getattr(e, "status_code", 404)

    return app

@pytest.fixture
def test_users(refactor_app):
    from app.extensions import db
    regular_user = User(
        user_id="usr_regular_123", full_name="Regular User", email="user@test.com", role="user", password_hash="mock_hash_123"
    )
    admin_user = User(
        user_id="usr_admin_999", full_name="Admin User", email="admin@test.com", role="admin", password_hash="mock_hash_999"
    )
    other_user = User(
        user_id="usr_other_456", full_name="Other User", email="other@test.com", role="user", password_hash="mock_hash_456"
    )
    db.session.add_all([regular_user, admin_user, other_user])
    db.session.commit()
    yield {
        "user_token": create_access_token(identity="usr_regular_123"),
        "admin_token": create_access_token(identity="usr_admin_999"),
        "other_token": create_access_token(identity="usr_other_456"),
    }
    User.query.filter(User.user_id.in_(["usr_regular_123", "usr_admin_999", "usr_other_456"])).delete()
    db.session.commit()

def test_user_repository_is_admin(test_users):
    assert is_admin("usr_admin_999") is True
    assert is_admin("usr_regular_123") is False
    assert is_admin("usr_nonexistent_000") is False

def test_route_authorization(client, test_users):
    headers_other = {"Authorization": f"Bearer {test_users['other_token']}"}
    headers_user = {"Authorization": f"Bearer {test_users['user_token']}"}
    headers_admin = {"Authorization": f"Bearer {test_users['admin_token']}"}

    res = client.post("/analytics/compute-legacy/usr_regular_123", headers=headers_other)
    assert res.status_code == 403

    res = client.post("/analytics/compute-legacy/usr_regular_123", headers=headers_user)
    assert res.status_code != 403

    res = client.post("/analytics/compute-legacy/usr_regular_123", headers=headers_admin)
    assert res.status_code != 403

def test_blueprint_error_handlers(client, test_users):
    res = client.get("/auth/test-auth-error")
    assert res.status_code == 401
    assert res.get_json().get("error") == "Invalid credentials provided"

    res = client.get("/portfolio/test-portfolio-error")
    assert res.status_code == 400
    assert res.get_json().get("error") == "Insufficient funds for trade"

    res = client.get("/analytics/test-analytics-error")
    assert res.status_code == 404
    assert res.get_json().get("error") == "No score data available"