# this is backend/app/market/pipeline.py
import numpy as np
import pandas as pd
import yfinance as yf

BENCHMARK_TICKER = "^GSPC"


class YahooFinancePipeline:
    """
    Market data pipeline built on yfinance.
    Converted from pipeline.ipynb — all original methods preserved,
    extended with beta calculation and error handling.
    """

    # ─────────────────────────────────────────
    # Stock info
    # ─────────────────────────────────────────

    @staticmethod
    def get_stock_info(ticker: str) -> dict:
        """Return company metadata: name, sector, industry, beta, market cap."""
        try:
            stock = yf.Ticker(ticker)
            info  = stock.info
            return {
                "ticker":       ticker.upper(),
                "company_name": info.get("longName"),
                "sector":       info.get("sector"),
                "industry":     info.get("industry"),
                "exchange":     info.get("exchange"),
                "country":      info.get("country"),
                "currency":     info.get("currency", "USD"),
                "description":  info.get("longBusinessSummary"),
                "beta":         info.get("beta"),
                "market_cap":   info.get("marketCap"),
                "open":         info.get("open"),
                "previous_close": info.get("previousClose"),
                "day_high":     info.get("dayHigh"),
                "day_low":      info.get("dayLow"),
                "volume":       info.get("volume"),
                "average_volume": info.get("averageVolume"),
                "pe_ratio":     info.get("trailingPE"),
                "eps":           info.get("trailingEps"),
                "dividend_yield": info.get("dividendYield"),
                "week52_high":  info.get("fiftyTwoWeekHigh"),
                "week52_low":   info.get("fiftyTwoWeekLow"),
            }
        except Exception:
            return {
                "ticker":       ticker.upper(),
                "company_name": None,
                "sector":       None,
                "industry":     None,
                "exchange":     None,
                "country":      None,
                "currency":     "USD",
                "description":  None,
                "beta":         None,
                "market_cap":   None,
                "open":         None,
                "previous_close": None,
                "day_high":     None,
                "day_low":      None,
                "volume":       None,
                "average_volume": None,
                "pe_ratio":     None,
                "eps":          None,
                "dividend_yield": None,
                "week52_high":  None,
                "week52_low":   None,
            }

    # ─────────────────────────────────────────
    # Price history
    # ─────────────────────────────────────────

    @staticmethod
    def get_price_history(
        ticker:     str,
        start_date: str,
        end_date:   str,
    ) -> pd.DataFrame:
        """Download OHLCV history for a ticker."""
        df = yf.download(
            ticker,
            start=start_date,
            end=end_date,
            progress=False,
            auto_adjust=True,
        )
        df.reset_index(inplace=True)

        # Flatten multi-level columns yfinance sometimes returns
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if col[1] == "" else col[0] for col in df.columns]

        return df

    # ─────────────────────────────────────────
    # Benchmark data (S&P 500)
    # ─────────────────────────────────────────

    @staticmethod
    def get_benchmark_data(
        start_date: str,
        end_date:   str,
    ) -> pd.DataFrame:
        """Download S&P 500 (^GSPC) history."""
        benchmark = yf.download(
            BENCHMARK_TICKER,
            start=start_date,
            end=end_date,
            progress=False,
            auto_adjust=True,
        )
        benchmark.reset_index(inplace=True)

        if isinstance(benchmark.columns, pd.MultiIndex):
            benchmark.columns = [col[0] if col[1] == "" else col[0] for col in benchmark.columns]

        return benchmark

    # ─────────────────────────────────────────
    # Data cleaning
    # ─────────────────────────────────────────

    @staticmethod
    def clean_data(df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df.dropna(inplace=True)
        df.drop_duplicates(inplace=True)
        return df

    # ─────────────────────────────────────────
    # Daily returns
    # ─────────────────────────────────────────

    @staticmethod
    def calculate_returns(df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["Daily_Return"] = df["Close"].pct_change()
        df.dropna(inplace=True)
        return df

    # ─────────────────────────────────────────
    # Analytics helpers
    # ─────────────────────────────────────────

    @staticmethod
    def calculate_sharpe(returns: pd.Series, risk_free_rate: float = 0.0) -> float:
        """Annualised Sharpe ratio (252 trading days)."""
        excess = returns - risk_free_rate / 252
        if excess.std() == 0:
            return 0.0
        sharpe = (excess.mean() / excess.std()) * np.sqrt(252)
        return round(float(sharpe), 4)

    @staticmethod
    def calculate_beta(
        stock_returns:     pd.Series,
        benchmark_returns: pd.Series,
    ) -> float:
        """Compute beta vs benchmark using covariance / variance."""
        aligned = pd.concat(
            [stock_returns, benchmark_returns], axis=1
        ).dropna()

        if aligned.shape[0] < 2:
            return 1.0

        cov_matrix = np.cov(
            aligned.iloc[:, 0],
            aligned.iloc[:, 1],
        )
        bench_var = cov_matrix[1, 1]
        if bench_var == 0:
            return 1.0

        beta = cov_matrix[0, 1] / bench_var
        return round(float(beta), 4)

    @staticmethod
    def calculate_volatility(returns: pd.Series) -> float:
        """Annualised volatility."""
        vol = returns.std() * np.sqrt(252)
        return round(float(vol), 4)

    @staticmethod
    def calculate_max_drawdown(prices: pd.Series) -> float:
        """Maximum drawdown as a positive percentage (e.g. 12.5 = 12.5%)."""
        roll_max = prices.cummax()
        drawdown = (prices - roll_max) / roll_max
        max_dd   = drawdown.min()
        return round(float(abs(max_dd)) * 100, 4)

    # ─────────────────────────────────────────
    # Full dataset builder (original notebook method)
    # ─────────────────────────────────────────

    @classmethod
    def build_dataset(
        cls,
        ticker:     str,
        start_date: str,
        end_date:   str,
    ) -> dict:
        """
        Build a complete dataset for a ticker.
        Returns metadata, cleaned stock history with returns,
        and benchmark history with returns.
        """
        stock_info = cls.get_stock_info(ticker)

        history = cls.get_price_history(ticker, start_date, end_date)
        history = cls.clean_data(history)
        history = cls.calculate_returns(history)

        benchmark = cls.get_benchmark_data(start_date, end_date)
        benchmark = cls.clean_data(benchmark)
        benchmark = cls.calculate_returns(benchmark)

        return {
            "metadata":          stock_info,
            "stock_history":     history,
            "benchmark_history": benchmark,
        }

    # ─────────────────────────────────────────
    # Current price (single value)
    # ─────────────────────────────────────────

    @staticmethod
    def get_current_price(ticker: str) -> float | None:
        """Fetch the latest closing price for a ticker."""
        stock = yf.Ticker(ticker)
        hist  = stock.history(period="1d")
        if hist.empty:
            return None
        return round(float(hist["Close"].iloc[-1]), 4)
