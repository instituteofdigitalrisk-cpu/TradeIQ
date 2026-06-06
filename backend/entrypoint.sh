#!/bin/sh
set -e

echo "Waiting for MySQL at ${DB_HOST:-localhost}:${DB_PORT:-3306}..."
python - <<'PYEOF'
import pymysql, os, time, sys

host     = os.getenv("DB_HOST", "localhost")
port     = int(os.getenv("DB_PORT", "3306"))
user     = os.getenv("DB_USER", "root")
password = os.getenv("DB_PASSWORD", "")

for attempt in range(30):
    try:
        conn = pymysql.connect(host=host, port=port, user=user, password=password, connect_timeout=2)
        conn.close()
        print(f"MySQL is ready at {host}:{port}")
        sys.exit(0)
    except Exception as e:
        print(f"Attempt {attempt + 1}/30: MySQL not ready ({e}), retrying in 2s...")
        time.sleep(2)

print("ERROR: MySQL did not start within 60s.", file=sys.stderr)
sys.exit(1)
PYEOF

echo "Applying database schema..."
python - <<'PYEOF'
import pymysql, os, sys

host     = os.getenv("DB_HOST", "localhost")
port     = int(os.getenv("DB_PORT", "3306"))
user     = os.getenv("DB_USER", "root")
password = os.getenv("DB_PASSWORD", "")

try:
    conn = pymysql.connect(host=host, port=port, user=user, password=password)
    cursor = conn.cursor()
    with open("/app/migrations/schema.sql") as f:
        sql = f.read()
    for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
        cursor.execute(stmt)
    conn.commit()
    conn.close()
    print("Schema applied successfully.")
except Exception as e:
    print(f"ERROR applying schema: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF

exec flask run --host=0.0.0.0 --port=5000
