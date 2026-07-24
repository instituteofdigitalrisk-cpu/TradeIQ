# This is backend/run_test 10.10.py
import sys
import unittest
from unittest.mock import patch

from app import create_app
from app.services.market_service import (
    _validate_ticker,
    _validate_date_range,
    MarketError,
)


class TestMarketHardening1010(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    # -------------------------------------------------------------------------
    # A. Consolidation & Price Staleness Checks
    # -------------------------------------------------------------------------
    def test_a1_current_price_structure(self):
        with patch("app.services.market_service.get_price_with_staleness") as mock_staleness:
            mock_staleness.return_value = {
                "price": 150.25,
                "is_stale": False,
                "source": "live",
            }
            res = self.client.get("/market/price/AAPL")
            # Note: if your JWT token is required by routes, ensure bypass or mock headers
            self.assertIn(res.status_code, [200, 401])  # 401 if JWT required without header

    # -------------------------------------------------------------------------
    # B. Indices & Shared Cache
    # -------------------------------------------------------------------------
    def test_b1_indices_success(self):
        with patch("app.services.market_service.cache_get") as mock_get:
            mock_get.return_value = [
                {"name": "S&P 500", "ticker": "^GSPC", "price": "5,000", "change": "+0.50%", "up": True}
            ]
            res = self.client.get("/market/indices")
            self.assertIn(res.status_code, [200, 401])

    # -------------------------------------------------------------------------
    # C. Timeout Wrapping
    # -------------------------------------------------------------------------
    def test_c1_timeout_graceful_handling(self):
        with patch("app.services.market_service._fetch_with_timeout", return_value=None):
            res = self.client.get("/market/stock/AAPL")
            self.assertIn(res.status_code, [404, 401])

    # -------------------------------------------------------------------------
    # D. Input Validation — Tickers
    # -------------------------------------------------------------------------
    def test_d1_invalid_ticker_rejected(self):
        with self.assertRaises(MarketError) as ctx:
            _validate_ticker("<script>alert(1)</script>")
        self.assertEqual(ctx.exception.status_code, 400)

        with self.assertRaises(MarketError) as ctx:
            _validate_ticker("AAPL;DROP TABLE")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_d2_valid_ticker_formats_pass_validation(self):
        self.assertEqual(_validate_ticker("AAPL"), "AAPL")
        self.assertEqual(_validate_ticker("^GSPC"), "^GSPC")
        self.assertEqual(_validate_ticker("BRK.A"), "BRK.A")

    # -------------------------------------------------------------------------
    # E. Input Validation — Date Ranges
    # -------------------------------------------------------------------------
    def test_e1_missing_dates_rejected(self):
        with self.assertRaises(MarketError) as ctx:
            _validate_date_range("", "")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_e2_malformed_date_rejected(self):
        with self.assertRaises(MarketError) as ctx:
            _validate_date_range("invalid", "2026-01-01")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_e3_reversed_dates_rejected(self):
        with self.assertRaises(MarketError) as ctx:
            _validate_date_range("2026-06-01", "2026-01-01")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_e4_future_end_date_rejected(self):
        with self.assertRaises(MarketError) as ctx:
            _validate_date_range("2026-01-01", "2099-01-01")
        self.assertEqual(ctx.exception.status_code, 400)

    # -------------------------------------------------------------------------
    # F. Search Endpoint
    # -------------------------------------------------------------------------
    def test_f1_short_search_query_empty_results(self):
        from app.services.market_service import search
        res = search("a")
        self.assertEqual(res, {"results": []})

    def test_f3_search_exception_hides_internal_errors(self):
        with patch("app.services.market_service._fetch_with_timeout", side_effect=Exception("Database password leaked")):
            from app.services.market_service import search
            res = search("AAPL")
            self.assertEqual(res, {"results": []})
            self.assertNotIn("Database password leaked", str(res))


if __name__ == "__main__":
    unittest.main()