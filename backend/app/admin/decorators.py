from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.repositories.user_repository import is_admin


def admin_required(fn):
    """JWT-protected decorator that only permits users with role='admin'."""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if not is_admin(get_jwt_identity()):
            return jsonify({"error": "Admin privileges required"}), 403
        return fn(*args, **kwargs)
    return wrapper
