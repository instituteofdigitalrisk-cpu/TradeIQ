
# this is backend\tests\test_auth_and_trading.py
import pytest
from werkzeug.security import generate_password_hash, check_password_hash

def test_health_check(client):
    """Test telemetry health probe."""
    res = client.get("/health/ready")
    assert res.status_code in [200, 503]
    assert "checks" in res.json
    assert "database" in res.json["checks"]

def test_password_hashing(app):
    """Test password hashing integrity."""
    password = "SecurePassword123!"
    hashed = generate_password_hash(password)

    assert hashed != password
    assert check_password_hash(hashed, password) is True
    assert check_password_hash(hashed, "WrongPassword") is False