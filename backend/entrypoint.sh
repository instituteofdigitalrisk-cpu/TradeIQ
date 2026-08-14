#!/bin/sh
set -e

echo "Waiting for MySQL at ${DB_HOST:-localhost}:${DB_PORT:-3306}..."
python - <<'PYEOF'
import pymysql, os, time, sys
from pathlib import Path
from tempfile import gettempdir

host     = os.getenv("DB_HOST", "localhost")
port     = int(os.getenv("DB_PORT", "3306"))
user     = os.getenv("DB_USER", "root")
password = os.getenv("DB_PASSWORD", "")
use_ssl  = os.getenv("DB_SSL", "false").lower() == "true"
ssl_ca   = os.getenv("DB_SSL_CA")
ssl_ca_pem = os.getenv("DB_SSL_CA_PEM")
verify   = os.getenv("DB_SSL_VERIFY", "true").lower() == "true"

connect_kwargs = {
    "host": host,
    "port": port,
    "user": user,
    "password": password,
    "connect_timeout": 2,
}

if use_ssl:
    ssl_kwargs = {"check_hostname": verify}
    if ssl_ca_pem:
        ssl_path = Path(gettempdir()) / "tradeiq-db-ca.pem"
        ssl_path.write_text(ssl_ca_pem, encoding="utf-8")
        ssl_kwargs["ca"] = str(ssl_path)
    elif ssl_ca:
        ssl_kwargs["ca"] = ssl_ca
    connect_kwargs["ssl"] = ssl_kwargs

for attempt in range(30):
    try:
        conn = pymysql.connect(**connect_kwargs)
        conn.close()
        print(f"MySQL is ready at {host}:{port}")
        sys.exit(0)
    except Exception as e:
        print(f"Attempt {attempt + 1}/30: MySQL not ready ({e}), retrying in 2s...")
        time.sleep(2)

print("ERROR: MySQL did not start within 60s.", file=sys.stderr)
sys.exit(1)
PYEOF

echo "Starting backend on port ${PORT:-5000}..."
# Render's small instances are I/O-bound rather than CPU-bound. One process
# with threads avoids duplicating the SQLAlchemy pool and in-memory caches
# across workers, while still serving concurrent API requests.
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --worker-class gthread --threads 8 --timeout 60 run:app
