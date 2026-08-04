# this is backend\tests\conftest.py
import sys
import os
import pytest

# Ensure the backend directory is in Python's path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# The backend/.env file re-injects a remote REDIS_URL (loaded with override=True
# inside app/__init__.py), which makes the rate limiter contact external Redis and
# hang on network I/O. Disable .env loading for the whole test session.
import dotenv
dotenv.load_dotenv = lambda *a, **k: False

# Provide the env vars create_app() requires, without touching the real DB.
os.environ["TRADEIQ_SKIP_STARTUP_DDL"] = "true"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["JWT_SECRET_KEY"] = "test-jwt"
os.environ["DB_HOST"] = "127.0.0.1"
os.environ["DB_PORT"] = "3306"
os.environ["DB_NAME"] = "tradeiq"
os.environ["DB_USER"] = "root"
os.environ["DB_PASSWORD"] = "test-password"
os.environ["FLASK_ENV"] = "test"

# flask-sqlalchemy 3.x builds the engine EAGERLY inside create_app() (db.init_app),
# so changing SQLALCHEMY_DATABASE_URI after create_app() has no effect. Override the
# URI/engine-options builders so tests run on an in-memory sqlite DB, never the
# real (hosted) database.
from sqlalchemy.pool import StaticPool
import app as app_module

app_module._build_database_uri = lambda: "sqlite:///:memory:"
app_module._build_engine_options = lambda: {
    "connect_args": {"check_same_thread": False},
    "poolclass": StaticPool,
}

from app import create_app, db


@pytest.fixture
def app():
    app = create_app()
    app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
    })

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()
