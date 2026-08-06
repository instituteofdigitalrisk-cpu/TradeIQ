# TradeIQ — Admin Portal Handoff / Context

> Purpose: capture full context so a fresh agent/session can continue the
> "admin portal" work without re-reading the whole repo.

## 1. Goal

Build an **admin portal** for TradeIQ Academy (Flask backend + Expo RN frontend)
so admins can view all users' details. Decisions made with the user:

- UI: **separate React web app** (NOT inside the existing Expo app).
- Features: **stats dashboard, view-all-users list, per-user drill-down, manage users** (promote/demote admin role, delete user). NO CSV export.
- `is_paid` / `registration_status`: **dropped from the admin portal** by user decision (fields exist in hosted DB but are not meaningful yet).
- Admin bootstrap: **manual DB update** (`UPDATE users SET role='admin' WHERE email='...'`). No auto-promote code requested.

## 2. Repo layout (relevant)

```
TradeIQ/
├── backend/                 # Flask REST API (Python)
│   ├── run.py               # entry: python run.py (port 5000)
│   ├── app/
│   │   ├── __init__.py      # create_app() factory; registers blueprints; CORS; startup migration
│   │   ├── extensions.py    # db, jwt, cors, limiter (redis/memory)
│   │   ├── models.py        # SQLAlchemy models: User, PortfolioSetup, TradeLog, Holding, Watchlist,
│   │   │                    #   InvestmentThesis, ThesisScore, RiskMetrics, WeeklyScore, Leaderboard, Report
│   │   ├── auth/routes.py   # /auth/* (register/login/google/reset). NOTE: sets is_paid/registration_status
│   │   ├── market/, portfolio/, analytics/   # other blueprints
│   │   ├── admin/           # NEW admin blueprint (added by this task)
│   │   │   ├── __init__.py
│   │   │   ├── decorators.py
│   │   │   ├── admin_repository.py
│   │   │   └── routes.py
│   │   ├── repositories/    # user_repository.py has is_admin(user_id) -> user.role == "admin"
│   │   └── services/        # analytics_service.py etc.
│   └── tests/               # pytest; conftest.py uses in-memory sqlite
├── frontend/
│   └── DRA App/             # Expo RN app (renders on web too). NO admin UI.
└── docs/                    # project docs (technical docs, ERDs)
```

## 3. Key facts learned while exploring

- Auth: JWT via `flask_jwt_extended`. Most endpoints require `Authorization: Bearer <token>`.
- `User.role` default `"student"`; `"admin"` is the admin role. `app/repositories/user_repository.py:20` has `is_admin()`.
- `/analytics/*` routes already gate cross-user access via `is_admin`.
- Hosted DB (TiDB, checked live via `SHOW COLUMNS FROM users`): **columns `is_paid` and `registration_status` DO exist** (added by the startup migration in `app/__init__.py`). 15 users, all `role='student'`, 0 admins.
- Hosted DB is TiDB Cloud; `.env` in `backend/` holds connection (DB_SSL=true, tidb-ca.pem). Backend deploys on Render (https://tradeiq-gtkc.onrender.com per `frontend/DRA App/src/native/api.ts`; README also mentions tradeiq-frontend-kl94.onrender.com).
- Tests run with `backend/tests/conftest.py` -> in-memory sqlite via `db.create_all()`.
  - ⚠️ CRITICAL fix (2026-08-04): flask-sqlalchemy 3.x builds the engine EAGERLY inside `create_app()` (`db.init_app(app)`). Overriding `SQLALCHEMY_DATABASE_URI` AFTER `create_app()` is a no-op — so the old conftest was silently running `db.create_all()`/`db.drop_all()` and all queries against the REAL hosted TiDB (explaining ~16s/test and the network hangs). Fixed by patching `app_module._build_database_uri = lambda: "sqlite:///:memory:"` and `_build_engine_options` (StaticPool + check_same_thread) BEFORE importing `create_app`. Also disabled `.env` loading (`dotenv.load_dotenv = lambda *a, **k: False`) so the remote `REDIS_URL` in `.env` no longer makes the limiter hit external Redis. Full suite: **37 passed in ~3s** on sqlite.
- Frontend API client pattern lives in `frontend/DRA App/src/native/api.ts` (base URL fallback, token in localStorage `dra.jwtToken`, `setUnauthorizedHandler`).
- Existing frontend theme constants: `frontend/DRA App/src/native/constants.ts` (`C` palette: bg0 #050812, cyan #31e6ff, green #1ee6a3, gold #ffd166, red #ff5f7e, purple #8d7cff).

## 4. Work already completed (backend)

New files:

1. `backend/app/admin/__init__.py` — empty.
2. `backend/app/admin/decorators.py` — `admin_required` decorator: `@jwt_required()` + `is_admin(get_jwt_identity())` else 403.
3. `backend/app/admin/admin_repository.py` — DB access only (no live-price calls; uses stored `holdings.market_value`):
   - `list_users(search, role, university, sort, order, page, per_page)` -> (total, users)
   - `portfolio_setups`, `holdings_value_map`, `holdings_count_map`, `trade_count_map`, `latest_weekly_scores`
   - `build_user_row(user, portfolio, holdings_value, holdings_count, trade_count, weekly)`
   - `find_user`, `update_user(user_id, **fields)`, `delete_user(user_id)` (bulk delete, FK cascade), `count_admins()`
   - `user_detail(user_id)` -> profile + portfolio + holdings + trades + watchlist + weekly_scores + risk_metrics + theses
   - `stats_overview()` -> totals/averages/registrations_by_day/university_breakdown/top_performers
4. `backend/app/admin/routes.py` — `admin_bp` prefix `/admin`, all endpoints `@limiter.limit(...)` + `@admin_required`:
   - `GET /admin/stats/overview`
   - `GET /admin/users` (params: page, per_page<=100, q, role[student|admin], university, sort, order)
   - `GET /admin/users/<user_id>`
   - `PUT /admin/users/<user_id>` (editable: role[student|admin], full_name, university, year_of_study, phone_number)
   - `DELETE /admin/users/<user_id>` (blocks self-delete + deleting last admin)
5. `backend/tests/test_admin.py` — pytest coverage for authz (403/401), list/search/filter/paginate, drill-down, update role/fields, invalid role, delete, self-delete blocked, last-admin blocked, stats shape.

Modified files:

- `backend/app/__init__.py`:
  - imported + registered `admin_bp`
  - added `http://localhost:5173` and `http://localhost:5174` to default `ALLOWED_CORS_ORIGINS`
- `backend/tests/conftest.py`: dotenv load disabled; env vars set before import; `_build_database_uri`/`_build_engine_options` patched so every `create_app()` builds a sqlite in-memory engine (never the hosted DB).
- `backend/tests/test_admin.py`: `registrations_by_day` assertion now expects the 3 seeded users grouped under today's date (was `[]`).

## 5. Work completed (frontend)

New app: `frontend/admin-portal/` (Vite + React + TS), **builds clean** (`npm run build` → dist/). Structure as planned:

```
frontend/admin-portal/
├── index.html
├── package.json            # react, react-dom, vite, @vitejs/plugin-react, typescript only
├── tsconfig.json
├── vite.config.ts          # dev port 5173
├── .env.example            # VITE_API_URL=http://localhost:5000
└── src/
    ├── main.tsx
    ├── App.tsx             # auth guard + sidebar layout + view switch (state-based, no router)
    ├── api.ts              # token in localStorage (tradeiq.adminToken) + typed admin/auth calls
    ├── types.ts
    ├── styles.css          # dark theme using the C palette
    └── pages/
        ├── LoginPage.tsx       # POST /auth/login; rejects non-admin roles
        ├── DashboardPage.tsx   # stat cards + 7/30-day SVG bar chart + top performers + uni breakdown
        ├── UsersPage.tsx       # table, search/role/uni filters, sort, pagination, inline promote/demote
        └── UserDetailPage.tsx  # profile edit, promote/demote, holdings/trades/watchlist/scores/risk/theses, delete w/ confirm
```

Implementation notes:
- API base resolution mirrors `DRA App/src/native/api.ts`: on `localhost` with no `VITE_API_URL`, it uses `http://localhost:5000`; otherwise `https://tradeiq-gtkc.onrender.com`.
- Token key `tradeiq.adminToken`; logged-in user object stored in `tradeiq.adminUser` (role checked on login).
- `apiFetch` auto-clears the token + surfaces the backend error message on 401/422 token expiry.

## 6. Environment / how to run tests

- Global Python is **3.14** (`C:\Python314\python.exe`). The pinned `backend/requirements.txt` may NOT install cleanly on 3.14 (old pandas/scipy pins). Use the venv created for this task:
  - `C:\Users\Dev Arora\AppData\Local\Temp\opencode\tradeiq-venv\Scripts\python.exe`
  - It has latest compatible versions of: flask, flask-sqlalchemy, flask-jwt-extended, flask-cors, flask-limiter, flask-caching, python-dotenv, PyJWT, psutil, PyMySQL, sentry-sdk, groq, resend, numpy, pandas, yfinance, pytest.
  - NOTE: firebase-admin was NOT yet installed in that venv (auth/routes.py imports firebase_admin; install `firebase-admin` if tests fail on import).
- Run admin tests (all green as of 2026-08-04):
  - `cd backend`
  - `& "C:\Users\Dev Arora\AppData\Local\Temp\opencode\tradeiq-venv\Scripts\python.exe" -m pytest tests/test_admin.py -q`   → 11 passed, ~2.6s
  - Full suite: `-m pytest tests/ -q` → 37 passed, ~3.2s
- Important: tests must run with CWD=backend (conftest inserts backend dir into sys.path).
- DB schema check script (already ran successfully): `C:\Users\DEVARO~1\AppData\Local\Temp\opencode\check_users_cols.py`

## 7. Things still to verify / watch out for

- **Firebase import**: if `firebase-admin` is missing in the venv, `from app.auth.routes import auth_bp` (triggered by `create_app()`) will fail. Install it or mock.
- **Register endpoint bug (out of scope)**: `backend/app/auth/routes.py:317-318` writes `is_paid`/`registration_status`; those columns exist in hosted DB so it works there, but a fresh DB without the startup migration would break. Flag to user only if relevant.
- **Admin endpoints performance**: `build_user_row` aggregates are per-page (batched) — good. `user_detail` uses stored values (no yfinance).
- **CORS**: admin web app origin must be added to `ALLOWED_CORS_ORIGINS` (env or default list) before prod use.
- **Deploy**: admin portal build output is static; can be hosted on Firebase Hosting/App Hosting or Render. Backend already deployed on Render.

## 8. Todos remaining (from task tracker)

1. ~~Verify hosted DB users columns~~ (done: is_paid + registration_status exist)
2. ~~Create backend/app/admin/ (decorators, repository, routes)~~ (done)
3. ~~Register admin blueprint + CORS origins in __init__.py~~ (done)
4. ~~Create tests/test_admin.py~~ (done)
5. ~~Run pytest for admin tests + full suite~~ (done — 11/11 admin, 37/37 full, fast, on sqlite)
6. ~~Scaffold frontend/admin-portal (Vite + React + TS)~~ (done)
7. ~~Implement api.ts + types in admin-portal~~ (done)
8. ~~Implement Login, Dashboard, Users, UserDetail pages + App + styles~~ (done)
9. ~~Build admin-portal (npm install + build)~~ (done — `npm run build` clean, dev server serves 200)

Remaining (optional / out of task scope):
- Point an admin's `role` to `'admin'` in the hosted DB (`UPDATE users SET role='admin' WHERE email='...'`) and log in.
- Deploy `frontend/admin-portal/dist/` (Firebase Hosting/App Hosting or Render); ensure the app origin is in `ALLOWED_CORS_ORIGINS` on the backend.
