# This is backend/app/services/market_service.py
import re
import time as _time
from datetime import date, datetime
from concurrent.futures import TimeoutError as FutureTimeoutError

import yfinance as yf

from app.cache import cache_get, cache_set
from app.jobs import enqueue_job
from app.market.pipeline import YahooFinancePipeline

pipeline = YahooFinancePipeline()

FRESH_TTL_SECONDS = 900         # 15 minute fresh cache window
FALLBACK_TTL_SECONDS = 86400    # 24 hour last-known-good fallback window

INDICES_CACHE_KEY = "market:indices"
_INDICES_TTL = 300            # 5 minutes
_INDICES_FALLBACK_TTL = 30    # Retry sooner if zero results returned

_TICKER_RE = re.compile(r"^[A-Za-z0-9\.\^=\-]{1,15}$")

INDICES = [
    {"name": "S&P 500",       "ticker": "^GSPC"},
    {"name": "NASDAQ",        "ticker": "^IXIC"},
    {"name": "DOW",           "ticker": "^DJI"},
    {"name": "AAPL",          "ticker": "AAPL"},
    {"name": "MSFT",          "ticker": "MSFT"},
    {"name": "NVDA",          "ticker": "NVDA"},
    {"name": "AMZN",          "ticker": "AMZN"},
    {"name": "TSLA",          "ticker": "TSLA"},
    {"name": "USD/INR",       "ticker": "INR=X"},
    {"name": "GOLD",          "ticker": "GC=F"},
    {"name": "NIFTY 50",      "ticker": "^NSEI"},
    {"name": "SENSEX",        "ticker": "^BSESN"},
    {"name": "NIFTY IT",      "ticker": "^CNXIT"},
    {"name": "NIFTY PHARMA",  "ticker": "^CNXPHARMA"},
]

MARKET_UNIVERSE = [
    ("TCS.NS", "TCS", "Technology"),
    ("INFY.NS", "INFY", "Technology"),
    ("HDFCBANK.NS", "HDFC BANK", "Banking"),
    ("ICICIBANK.NS", "ICICI BANK", "Banking"),
    ("BHARTIARTL.NS", "BHARTI AIRTEL", "Telecom"),
    ("RELIANCE.NS", "RELIANCE", "Energy"),
    ("BEL.NS", "BEL", "Industrials"),
    ("ADANIENT.NS", "ADANIENT", "Industrials"),
    ("TATAMOTORS.NS", "TATA MOTORS", "Automobile"),
    ("ONGC.NS", "ONGC", "Energy"),
    ("WIPRO.NS", "WIPRO", "Technology"),
    ("AAPL", "AAPL", "Technology"),
    ("MSFT", "MSFT", "Technology"),
    ("NVDA", "NVDA", "Technology"),
    ("AMZN", "AMZN", "Consumer"),
]
MARKET_OVERVIEW_CACHE_KEY = "market:overview"


class MarketError(Exception):
    """Raised when a market data request can't be fulfilled.
    Carries the HTTP status code the route should respond with."""
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# -----------------------------------------------------------------------------
# Helpers: Timeout Wrapping & Input Validation
# -----------------------------------------------------------------------------

def _fetch_with_timeout(func, timeout: float = 10):
    """Executes a blocking function using the job pool with a hard timeout."""
    future = enqueue_job(func)
    try:
        return future.result(timeout=timeout)
    except (FutureTimeoutError, Exception):
        return None


def _validate_ticker(ticker: str) -> str:
    """Validates ticker format to prevent malformed queries."""
    if not ticker or not _TICKER_RE.match(ticker):
        raise MarketError(f"Invalid ticker format: '{ticker}'", 400)
    return ticker.upper()


def _validate_date_range(start: str, end: str) -> tuple[str, str]:
    """Validates date formats, chronological ordering, and prevents future dates."""
    if not start or not end:
        raise MarketError("Query params 'start' and 'end' are required (YYYY-MM-DD)", 400)

    try:
        start_date = datetime.strptime(start, "%Y-%m-%d").date()
        end_date = datetime.strptime(end, "%Y-%m-%d").date()
    except ValueError:
        raise MarketError("'start' and 'end' must be valid dates in YYYY-MM-DD format", 400)

    if start_date >= end_date:
        raise MarketError("'start' must be earlier than 'end'", 400)

    if end_date > date.today():
        raise MarketError("'end' cannot be in the future", 400)

    return start, end


# -----------------------------------------------------------------------------
# Core Market Services
# -----------------------------------------------------------------------------

def get_price_with_staleness(ticker: str) -> dict:
    """
    Returns {"price": float | None, "is_stale": bool, "source": "live" | "cache" | "unavailable"}.
    Never raises. On live-fetch failure, falls back to the last known good price
    (if any) and marks it stale.
    """
    if not ticker:
        return {"price": None, "is_stale": True, "source": "unavailable"}

    return get_prices_with_staleness([ticker]).get(
        ticker.upper(),
        {"price": None, "is_stale": True, "source": "unavailable"},
    )


def _fetch_batch_live_prices(tickers: list[str]) -> dict[str, float | None]:
    """Fetch multiple tickers in one network round-trip when possible."""
    unique_tickers = list(dict.fromkeys(ticker.upper() for ticker in tickers if ticker))
    if not unique_tickers:
        return {}

    prices: dict[str, float | None] = {ticker: None for ticker in unique_tickers}

    try:
        batch = yf.Tickers(" ".join(unique_tickers))
    except Exception:
        return prices

    for ticker in unique_tickers:
        try:
            stock = batch.tickers.get(ticker)
            if stock is None:
                continue

            last_price = None
            try:
                fast_info = getattr(stock, "fast_info", None)
                if fast_info is not None:
                    last_price = fast_info.get("lastPrice")
            except Exception:
                last_price = None

            if last_price is None:
                hist = stock.history(period="1d")
                if hist is not None and not hist.empty:
                    last_price = float(hist["Close"].iloc[-1])

            if last_price is not None and float(last_price) > 0:
                prices[ticker] = float(last_price)
        except Exception:
            continue

    return prices


def get_prices_with_staleness(tickers: list[str]) -> dict[str, dict]:
    """Bulk lookup for current prices with cache + stale fallback semantics."""
    results: dict[str, dict] = {}
    pending: list[str] = []

    for raw_ticker in tickers:
        if not raw_ticker:
            continue

        ticker = _validate_ticker(raw_ticker)
        fresh_key = f"price:fresh:{ticker}"
        fallback_key = f"price:last_known:{ticker}"

        cached_fresh = cache_get(fresh_key)
        if cached_fresh is not None:
            results[ticker] = {"price": cached_fresh["price"], "is_stale": False, "source": "cache"}
            continue

        pending.append(ticker)

    live_prices = _fetch_batch_live_prices(pending) if pending else {}
    for ticker in pending:
        live_price = live_prices.get(ticker)
        fresh_key = f"price:fresh:{ticker}"
        fallback_key = f"price:last_known:{ticker}"

        if live_price is not None and live_price > 0:
            payload = {"price": float(live_price), "fetched_at": _time.time()}
            cache_set(fresh_key, payload, FRESH_TTL_SECONDS)
            cache_set(fallback_key, payload, FALLBACK_TTL_SECONDS)
            results[ticker] = {"price": float(live_price), "is_stale": False, "source": "live"}
            continue

        cached_fallback = cache_get(fallback_key)
        if cached_fallback is not None:
            results[ticker] = {"price": cached_fallback["price"], "is_stale": True, "source": "cache"}
        else:
            results[ticker] = {"price": None, "is_stale": True, "source": "unavailable"}

    return results


def batch_prices(tickers: list[str]) -> dict:
    return {"prices": get_prices_with_staleness(tickers)}


def current_price(ticker: str) -> dict:
    """
    Updated route handler for market API that uses resilient lookup
    and surfaces staleness metadata to the caller.
    """
    ticker = _validate_ticker(ticker)
    info = get_price_with_staleness(ticker)
    if info["price"] is None:
        raise MarketError(f"Could not fetch price for '{ticker}'", 404)
    return {
        "ticker": ticker,
        "price": info["price"],
        "is_stale": info["is_stale"],
        "source": info["source"],
    }


def stock_info(ticker: str) -> dict:
    ticker = _validate_ticker(ticker)
    info = _fetch_with_timeout(lambda: pipeline.get_stock_info(ticker), timeout=10)
    if info is None or not info.get("company_name"):
        raise MarketError(f"Ticker '{ticker}' not found or provider unavailable", 404)
    return info


def price_history(ticker: str, start: str, end: str) -> dict:
    ticker = _validate_ticker(ticker)
    start, end = _validate_date_range(start, end)

    range_days = (datetime.strptime(end, "%Y-%m-%d").date() - datetime.strptime(start, "%Y-%m-%d").date()).days
    if range_days <= 3:
        def fetch_intraday():
            # ``1d`` is empty outside the current trading session for many
            # symbols. Fetch a few sessions, then use the most recent one so
            # the 1D chart still works after market close/weekends.
            data = yf.Ticker(ticker).history(period="5d", interval="5m", auto_adjust=False)
            if data is None or data.empty:
                return None
            data = data.reset_index()
            data = data.rename(columns={"Datetime": "Date"})
            if "Date" not in data.columns:
                return None
            latest_day = data["Date"].dt.date.max()
            data = data[data["Date"].dt.date == latest_day]
            if len(data) < 2:
                return None
            return data

        dataset = _fetch_with_timeout(fetch_intraday, timeout=20)
        if dataset is not None:
            try:
                records = dataset[["Date", "Open", "High", "Low", "Close", "Volume"]].copy()
                records["Date"] = records["Date"].astype(str)
                return {
                    "ticker": ticker,
                    "start": start,
                    "end": end,
                    "rows": len(records),
                    "history": records.to_dict(orient="records"),
                }
            except Exception:
                pass

    dataset = _fetch_with_timeout(lambda: pipeline.build_dataset(ticker, start, end), timeout=20)
    if dataset is None:
        raise MarketError("Market data provider unavailable, please try again", 503)

    try:
        history = dataset["stock_history"]
        records = history[["Date", "Open", "High", "Low", "Close", "Volume", "Daily_Return"]].copy()
        records["Date"] = records["Date"].astype(str)
    except Exception:
        raise MarketError(f"No price history available for '{ticker}' in this range", 404)

    return {
        "ticker": ticker,
        "start": start,
        "end": end,
        "rows": len(records),
        "history": records.to_dict(orient="records"),
    }


def benchmark(start: str, end: str) -> dict:
    start, end = _validate_date_range(start, end)

    data = _fetch_with_timeout(lambda: pipeline.get_benchmark_data(start, end), timeout=20)
    if data is None:
        raise MarketError("Market data provider unavailable, please try again", 503)

    try:
        data = pipeline.clean_data(data)
        data = pipeline.calculate_returns(data)
        records = data[["Date", "Close", "Daily_Return"]].copy()
        records["Date"] = records["Date"].astype(str)
    except Exception:
        raise MarketError("No benchmark data available for this range", 404)

    return {
        "ticker": "^GSPC",
        "start": start,
        "end": end,
        "rows": len(records),
        "benchmark": records.to_dict(orient="records"),
    }


def _fetch_single_index(entry: dict) -> dict | None:
    """Helper worker to fetch history and price metrics for a single index or ticker."""
    try:
        hist = yf.Ticker(entry["ticker"]).history(period="5d")
        if hist is None or hist.empty or len(hist) < 2:
            return None

        today_close = float(hist["Close"].iloc[-1])
        prev_close = float(hist["Close"].iloc[-2])
        if prev_close == 0.0:
            return None

        change_pct = (today_close - prev_close) / prev_close * 100
        price_str = f"{today_close:,.2f}"
        change_str = f"{'+' if change_pct >= 0 else ''}{change_pct:.2f}%"

        return {
            "name": entry["name"],
            "ticker": entry["ticker"],
            "price": price_str,
            "change": change_str,
            "up": change_pct >= 0,
        }
    except Exception:
        return None


def indices() -> list:
    """Price + % change for tracked indices using shared Redis cache with parallelized fetching."""
    cached = cache_get(INDICES_CACHE_KEY)
    if cached is not None:
        return cached

    # Enqueue tasks concurrently across job pool
    futures = [enqueue_job(_fetch_single_index, entry) for entry in INDICES]

    results = []
    for fut in futures:
        try:
            res = fut.result(timeout=6)
            if res:
                results.append(res)
        except Exception:
            continue

    ttl = _INDICES_TTL if results else _INDICES_FALLBACK_TTL
    cache_set(INDICES_CACHE_KEY, results, ttl)
    return results


def search(q: str) -> dict:
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}

    try:
        result = _fetch_with_timeout(lambda: yf.Search(q, max_results=10), timeout=5)
        if not result or not getattr(result, "quotes", None):
            return {"results": []}

        quotes = result.quotes or []
        formatted = [
            {
                "ticker": r.get("symbol"),
                "name": r.get("longname") or r.get("shortname"),
                "exchange": r.get("exchDisp"),
                "sector": r.get("sectorDisp"),
                "type": r.get("typeDisp"),
            }
            for r in quotes
            if r.get("symbol") and r.get("quoteType") == "EQUITY"
        ]
        return {"results": formatted[:8]}
    except Exception:
        return {"results": []}


def _build_market_overview() -> dict:
    """Build the Market tab data from one yfinance batch download."""
    symbols = [symbol for symbol, _, _ in MARKET_UNIVERSE]
    frame = yf.download(
        symbols,
        period="5d",
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
    )

    rows = []
    for symbol, display, sector in MARKET_UNIVERSE:
        try:
            data = frame[symbol] if len(symbols) > 1 else frame
            data = data.dropna(subset=["Close"])
            if len(data) < 2:
                continue
            current = float(data["Close"].iloc[-1])
            previous = float(data["Close"].iloc[-2])
            change = current - previous
            change_pct = (change / previous * 100) if previous else 0
            volume = float(data["Volume"].iloc[-1]) if "Volume" in data else 0
            rows.append({
                "ticker": symbol,
                "symbol": display,
                "sector": sector,
                "price": round(current, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "volume": int(volume),
            })
        except Exception:
            continue

    rows.sort(key=lambda row: row["change_pct"], reverse=True)
    return {
        "gainers": rows[:5],
        "losers": sorted(rows, key=lambda row: row["change_pct"])[:5],
        "active": sorted(rows, key=lambda row: row["volume"], reverse=True)[:5],
        "sectors": [
            {
                "sector": sector,
                "change_pct": round(sum(row["change_pct"] for row in rows if row["sector"] == sector) / max(1, len([row for row in rows if row["sector"] == sector])), 2),
            }
            for sector in sorted({row["sector"] for row in rows})
        ],
        "updated_at": datetime.utcnow().isoformat(),
    }


def market_overview() -> dict:
    cached = cache_get(MARKET_OVERVIEW_CACHE_KEY)
    if cached is not None:
        return cached
    result = _fetch_with_timeout(_build_market_overview, timeout=20)
    if result is None:
        raise MarketError("Market data provider unavailable, please try again", 503)
    cache_set(MARKET_OVERVIEW_CACHE_KEY, result, 300)
    return result

