import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any
from flask_caching import Cache

# Standard Python logger
logger = logging.getLogger(__name__)

# Flask-Caching extension instance so app/__init__.py can import it
cache_backend = Cache()

try:
    import redis
except Exception:  # pragma: no cover
    redis = None


@dataclass
class CacheItem:
    value: Any
    expires_at: float


_memory_cache: dict[str, CacheItem] = {}
_redis_client = None


def get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client if _redis_client is not False else None

    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url or redis is None:
        _redis_client = False
        return None

    # Local development commonly has no Redis service. Do not spend the
    # connection timeout trying localhost before falling back to memory cache.
    flask_env = os.getenv("FLASK_ENV", "development").lower()
    if flask_env != "production" and any(host in redis_url.lower() for host in ("localhost", "127.0.0.1")):
        _redis_client = False
        return None

    try:
        client = redis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        client.ping()
        _redis_client = client
        logger.info("[Cache] Connected to Redis successfully.")
    except Exception as e:
        logger.warning(f"[Cache] REDIS_URL set but connection failed ({e}). Falling back to memory cache.")
        _redis_client = False
        return None

    return _redis_client


def get_cache_backend_type() -> str:
    """Returns 'redis' if Redis is available and reachable, otherwise 'memory'."""
    client = get_redis_client()
    return "redis" if client is not None else "memory"


def cache_get(key: str):
    client = get_redis_client()
    if client:
        try:
            raw_value = client.get(key)
            if raw_value is None:
                logger.debug(f"[Cache] Miss for key '{key}'")
                return None
            logger.debug(f"[Cache] Hit for key '{key}'")
            return json.loads(raw_value)
        except Exception as e:
            logger.error(f"[Cache] Redis get error on key '{key}': {e}")
            return None

    item = _memory_cache.get(key)
    if not item:
        return None
    if item.expires_at < time.time():
        _memory_cache.pop(key, None)
        return None
    return item.value


def cache_set(key: str, value: Any, ttl_seconds: int):
    client = get_redis_client()
    if client:
        try:
            client.setex(key, ttl_seconds, json.dumps(value))
            logger.debug(f"[Cache] Redis set key '{key}' with TTL {ttl_seconds}s")
            return
        except Exception as e:
            logger.error(f"[Cache] Redis set error on key '{key}': {e}")

    _memory_cache[key] = CacheItem(value=value, expires_at=time.time() + ttl_seconds)
    logger.debug(f"[Cache] Memory set key '{key}' with TTL {ttl_seconds}s")


def cache_delete(key: str):
    """Remove a cached value after a write changes its source data."""
    client = get_redis_client()
    if client:
        try:
            client.delete(key)
        except Exception as e:
            logger.warning(f"[Cache] Redis delete error on key '{key}': {e}")
    _memory_cache.pop(key, None)
