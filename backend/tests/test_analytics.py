# This is backend/test.py
from datetime import datetime
from unittest.mock import MagicMock, patch
import pytest
from flask import Flask

from app.services.analytics_service import (
    AnalyticsError,
    MarketError,
    _challenge_scorecard,
    _local_thesis_points,
    analyze_portfolio,
    get_leaderboard_service,
)

# ─────────────────────────────────────────
# 1. Portfolio Analysis Tests
# ─────────────────────────────────────────

def test_analyze_portfolio_empty_payload():
    """Should raise MarketError if no holdings are provided."""
    with pytest.raises(MarketError) as exc_info:
        analyze_portfolio([])
    assert exc_info.value.status_code == 400
    assert "at least one holding" in str(exc_info.value)


def test_analyze_portfolio_invalid_input():
    """Should raise MarketError for invalid shares or price."""
    invalid_holdings = [{"ticker": "AAPL", "shares": -5, "buy_price": 150}]
    with pytest.raises(MarketError) as exc_info:
        analyze_portfolio(invalid_holdings)
    assert exc_info.value.status_code == 400


@patch("app.services.analytics_service.enqueue_job")
def test_analyze_portfolio_success(mock_enqueue):
    """Should accurately calculate PnL and weight distribution."""
    # Mock concurrent price job responses
    mock_future = MagicMock()
    mock_future.result.return_value = {"price": 150.0, "is_stale": False, "source": "live"}
    mock_enqueue.return_value = mock_future

    holdings_input = [
        {"ticker": "AAPL", "shares": 10, "buy_price": 100.0}
    ]

    result = analyze_portfolio(holdings_input)

    assert result["summary"]["total_cost_basis"] == 1000.0
    assert result["summary"]["total_current_value"] == 1500.0
    assert result["summary"]["total_pnl"] == 500.0
    assert result["summary"]["total_pnl_pct"] == 50.0
    assert result["holdings"][0]["weight"] == 100.0


# ─────────────────────────────────────────
# 2. Local Rubric & Scoring Engine Tests
# ─────────────────────────────────────────

def test_local_thesis_points_empty():
    """Should return 0 for empty thesis list."""
    assert _local_thesis_points([]) == 0.0


def test_local_thesis_points_valid_text():
    """Should compute a non-zero thesis score based on financial keywords."""
    theses = [
        "Buying NVDA due to strong AI revenue growth, solid margins, and high cash flow generation."
    ]
    score = _local_thesis_points(theses)
    assert score > 0.0
    assert score <= 20.0


def test_challenge_scorecard_zero_holdings():
    """Should return zeroed scorecard when no active holdings exist."""
    portfolio_setup = MagicMock(total_capital=10000)
    result = _challenge_scorecard(
        portfolio_setup=portfolio_setup,
        active_holdings=[],
        trades=[],
        total_portfolio=10000.0
    )
    assert result["final_score"] == 0.0
    assert result["portfolio_score"] == 0.0


def test_challenge_scorecard_diversified_portfolio():
    """Should grant maximum risk diversification points for 3+ distinct sectors."""
    portfolio_setup = MagicMock(total_capital=10000)
    
    # Mock 3 active holdings in distinct sectors
    h1, h2, h3 = MagicMock(stock_ticker="AAPL"), MagicMock(stock_ticker="JPM"), MagicMock(stock_ticker="XOM")
    
    # Explicit created_at attributes allow sorting without TypeError
    t1 = MagicMock(stock_ticker="AAPL", sector="Technology", tag1="Tech", thesis="Growth play", created_at=datetime(2026, 1, 1))
    t2 = MagicMock(stock_ticker="JPM", sector="Financials", tag1="Value", thesis="Rate expansion", created_at=datetime(2026, 1, 2))
    t3 = MagicMock(stock_ticker="XOM", sector="Energy", tag1="Dividend", thesis="Commodity cycle", created_at=datetime(2026, 1, 3))

    with patch("app.services.analytics_service._openai_thesis_points", return_value=18.0):
        result = _challenge_scorecard(
            portfolio_setup=portfolio_setup,
            active_holdings=[h1, h2, h3],
            trades=[t1, t2, t3],
            total_portfolio=11000.0  # +10% return on capital
        )

    assert result["risk_score"] == 20.0  # 3 distinct sectors
    assert result["portfolio_score"] == 30.0  # 20 base + 10 return
    assert result["thesis_score"] == 18.0
    assert result["strategy_score"] == 8.0  # 3 positions = 8 points


# ─────────────────────────────────────────
# 3. Leaderboard Caching & Threading Tests
# ─────────────────────────────────────────

@patch("app.services.analytics_service.cache_get")
def test_get_leaderboard_fresh_cache_hit(mock_cache_get):
    """Should instantly return cached data without DB work if cache is fresh."""
    mock_payload = {"week": 1, "count": 2, "entries": [{"user_id": "u1"}]}
    
    # Mock fresh cache state: last_refresh is current timestamp
    import time
    mock_cache_get.side_effect = lambda key: (
        time.time() if "last_refresh" in key else mock_payload
    )

    result = get_leaderboard_service(week=1)
    assert result == mock_payload


@patch("app.services.analytics_service.cache_get")
@patch("app.services.analytics_service.repo")
def test_get_leaderboard_cold_start_fallback(mock_repo, mock_cache_get):
    """Should fallback to fetching DB entries directly on cold start."""
    # Mock no cache available
    mock_cache_get.return_value = None
    
    # Mock repository entries
    mock_entry = MagicMock()
    mock_entry.to_dict.return_value = {"user_id": "user123", "rank_position": 1}
    mock_repo.find_leaderboard_entries_by_week.return_value = [mock_entry]

    # Bare Flask instance gives valid app context without checking .env
    app = Flask("test_app")

    with app.app_context():
        with patch("app.services.analytics_service._portfolio_metrics", return_value={"portfolio_value": 10500.0}):
            result = get_leaderboard_service(week=1)

    assert result["week"] == 1
    assert result["count"] == 1
    assert result["entries"][0]["user_id"] == "user123"
    assert result["entries"][0]["portfolio_value"] == 10500.0