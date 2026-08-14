import os
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
jwt = JWTManager()
cors = CORS()

# Pull REDIS_URL from .env for shared rate-limiting
_redis_url = os.getenv("REDIS_URL", "").strip()
_is_local_redis = any(host in _redis_url.lower() for host in ("localhost", "127.0.0.1"))

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=("memory://" if not _redis_url or _is_local_redis else _redis_url),
    in_memory_fallback_enabled=True,                 # Fallback to RAM if Redis drops/fails
)
  
