// frontend/DRA App/src/native/api.ts

const LOCAL_API_BASE = process.env.EXPO_PUBLIC_API_URL || "https://trade-iq-deploy.onrender.com";
const API_BASES = [LOCAL_API_BASE];

// ── Token storage ──────────────────────────────────────────────────────────────
const TOKEN_KEY = "dra.jwtToken";

// In-memory fallback for React Native (no window.localStorage)
let _memToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function getToken(): string | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage.getItem(TOKEN_KEY);
  }
  return _memToken;
}

export function setToken(token: string): void {
  _memToken = token;
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearToken(): void {
  _memToken = null;
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.removeItem(TOKEN_KEY);
  }
}

function isInvalidTokenResponse(status: number, body: string): boolean {
  if (status !== 401 && status !== 422) return false;

  // Safely check JSON body or string contents
  try {
    const parsed = JSON.parse(body) as { msg?: string; detail?: string; message?: string };
    const msg = parsed.msg || parsed.detail || parsed.message || "";
    return [
      "Token has expired",
      "Signature verification failed",
      "Not enough segments",
      "Invalid token",
      "Could not validate credentials",
      "unauthorized"
    ].some((term) => msg.toLowerCase().includes(term.toLowerCase()));
  } catch {
    const lowerBody = body.toLowerCase();
    return (
      lowerBody.includes("token has expired") ||
      lowerBody.includes("signature verification failed") ||
      lowerBody.includes("not enough segments") ||
      lowerBody.includes("invalid token")
    );
  }
}

// ── Base fetch ─────────────────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let lastNetworkError: unknown = null;

  for (const base of API_BASES) {
    const url = `${base}${path}`;

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      const text = await res.text();

      if (!res.ok) {
        if (isInvalidTokenResponse(res.status, text)) {
          clearToken();
          unauthorizedHandler?.();
          throw new Error("Your session has expired. Please sign in again.");
        }

        // Try extracting formatted error message from backend JSON
        let errorMessage = text;
        try {
          const parsedErr = JSON.parse(text);
          errorMessage = parsedErr.error || parsedErr.message || parsedErr.msg || parsedErr.detail || text;
        } catch {
          /* Raw text fallback if backend returned HTML or 502/504 gateway error */
        }

        throw new Error(errorMessage || `Request failed with status ${res.status}`);
      }

      // Handle 204 / empty responses safely
      if (!text || text.trim() === "") {
        return {} as T;
      }

      // Safe JSON parsing
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("Received invalid JSON response from server.");
      }

    } catch (err) {
      // Check for generic network/fetch failures across platforms (iOS, Android, Web)
      lastNetworkError = err;

      // Rethrow auth failure immediately
      if (err instanceof Error && err.message.includes("session has expired")) {
        throw err;
      }

      // Retry next URL in API_BASES loop for network connection issues
      continue;
    }
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error(
        `Could not connect to the TradeIQ backend. Tried: ${API_BASES.join(", ")}.`
      );
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export type BackendUser = {
  user_id: string;
  full_name: string;
  email: string;
  university: string | null;
  year_of_study: number | null;
  role: string;
};

type AuthResponse = { message: string; user: BackendUser; token: string };

export const auth = {
  register(payload: {
    full_name: string;
    email: string;
    password: string;
    age?: number;
    date_of_birth?: string;
    phone_number?: string;
    university?: string;
    year_of_study?: number;
  }): Promise<AuthResponse> {
    return apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  login(email: string, password: string): Promise<AuthResponse> {
    return apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
};

// ── Portfolio ──────────────────────────────────────────────────────────────────
export type PortfolioSummary = {
  user_id: string;
  total_capital: number;
  cash_balance: number;
  holdings_value: number;
  total_portfolio: number;
  total_pnl: number;
  total_return_pct: number;
  holdings_count: number;
  prices_stale?: boolean; // True when any price was served from fallback
};

export type BackendTrade = {
  trade_id: string;
  user_id: string;
  trade_date: string;
  stock_ticker: string;
  stock_name: string;
  sector: string | null;
  allocation_percent: number;
  amount_invested: number;
  quantity: number;
  buy_price: number;
  current_sell_price: number;
  trade_type: "BUY" | "SELL";
  tag1: string | null;
  tag2: string | null;
  tag3: string | null;
  thesis: string | null;
};

export const portfolio = {
  getSummary(userId: string): Promise<PortfolioSummary> {
    return apiFetch<PortfolioSummary>(`/portfolio/summary/${userId}`);
  },

  getTrades(userId: string): Promise<{ user_id: string; trades: BackendTrade[]; count: number }> {
    return apiFetch(`/portfolio/trades/${userId}`);
  },

  getHoldings(userId: string): Promise<{ user_id: string; holdings: BackendHolding[]; count: number }> {
    return apiFetch(`/portfolio/holdings/${userId}`);
  },

  deleteHolding(ticker: string): Promise<{ message: string; stock_ticker: string; cash_balance: number; cash_credit?: number }> {
    return apiFetch(`/portfolio/holding/${encodeURIComponent(ticker)}`, { method: "DELETE" });
  },

  executeTrade(payload: {
    stock_ticker: string;
    stock_name?: string;
    sector?: string;
    trade_type: "BUY" | "SELL";
    quantity: number;
    buy_price?: number;
    current_sell_price?: number;
    tag1?: string;
    tag2?: string;
    tag3?: string;
    thesis?: string;
    amount_invested?: number;
  }): Promise<{ message: string; trade_id?: string; trade: BackendTrade; cash_balance: number }> {
    return apiFetch("/portfolio/trade", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ── Market ─────────────────────────────────────────────────────────────────────
export type MarketPrice = { ticker: string; price: number; is_stale?: boolean; source?: string };

export type StockSearchResult = {
  ticker: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  type: string | null;
};

export type MarketIndex = {
  name: string;
  ticker: string;
  price: string;
  change: string;
  up: boolean;
};

export const market = {
  getPrice(ticker: string): Promise<MarketPrice> {
    return apiFetch<MarketPrice>(`/market/price/${encodeURIComponent(ticker)}`);
  },

  getBatchPrices(tickers: string[]): Promise<{ prices: Record<string, MarketPrice> }> {
    const qs = tickers.map((ticker) => encodeURIComponent(ticker)).join(",");
    return apiFetch<{ prices: Record<string, MarketPrice> }>(`/market/prices?tickers=${qs}`);
  },

  search(query: string): Promise<{ results: StockSearchResult[] }> {
    return apiFetch(`/market/search?q=${encodeURIComponent(query)}`);
  },

  getIndices(): Promise<{ indices: MarketIndex[] }> {
    return apiFetch<{ indices: MarketIndex[] }>("/market/indices");
  },

  getBenchmark(start: string, end: string): Promise<{ benchmark: { Date: string; Close: number; Daily_Return?: number }[] }> {
    return apiFetch<{ benchmark: { Date: string; Close: number; Daily_Return?: number }[] }>(
      `/market/benchmark?start=${start}&end=${end}`
    );
  },
};

// ── Analytics ──────────────────────────────────────────────────────────────────
export type BackendLeaderboardEntry = {
  user_id: string;
  full_name: string | null;
  university: string | null;
  week_number: number | null;
  portfolio_score: number;
  risk_score: number;
  thesis_score: number;
  execution_score: number;
  strategy_score: number;
  final_score: number;
  rank_position: number | null;
  portfolio_value?: number;
};

export type BackendWeeklyScore = {
  week_number: number;
  portfolio_score: number;
  risk_score: number;
  thesis_score: number;
  execution_score: number;
  strategy_score: number;
  final_score: number;
  rank_position: number | null;
};

export type BackendScoreCard = {
  portfolio_score: number;
  risk_score: number;
  thesis_score: number;
  execution_score: number;
  strategy_score: number;
  final_score: number;
  feedback?: string;
  source?: string;
};

export type BackendScoreMetrics = {
  portfolio_value: number;
  desk_return_expansion: number;
  available_cash_depot: number;
  holdings_value: number;
  net_profit: number;
};

export type BackendScoreBreakdown = {
  key: string;
  label: string;
  score: number | null;
  max: number;
  status: string;
  detail: string;
};

export type BackendScoreInputs = {
  portfolio_return_pct: number;
  return_on_capital_pct: number;
  benchmark_growth_pct: number;
  net_profit: number;
  total_capital: number;
  cash_balance: number;
  holdings_value: number;
  active_holdings: number;
  unique_sectors: number;
  max_allocation: number;
  total_trades: number;
  trades_with_thesis: number;
  unique_tags: number;
};

export type BackendHolding = {
  holding_id: number;
  stock_ticker: string;
  stock_name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  market_value: number;
  profit_loss: number;
  sector?: string | null;
  allocation_percent?: number;
  amount_invested?: number;
  thesis?: string | null;
  latest_trade_id?: string | null;
  price_stale?: boolean; // True if this holding's price is stale
};

export const analytics = {
  getLeaderboard(week?: number): Promise<{
    week: number | null;
    count: number;
    entries: BackendLeaderboardEntry[];
    last_refreshed?: number | null;
  }> {
    const qs = week != null ? `?week=${week}` : "";
    return apiFetch(`/analytics/leaderboard${qs}`);
  },

  getScores(userId: string): Promise<{
    user_id: string;
    scores: BackendWeeklyScore[];
    latest_metrics: BackendScoreMetrics | null;
    current_score: BackendScoreCard | null;
    score_inputs: BackendScoreInputs | null;
    score_breakdown: BackendScoreBreakdown[];
  }> {
    return apiFetch(`/analytics/scores/${userId}`);
  },

  computeScores(userId: string): Promise<{ message: string; user_id: string; week_number: number; metrics: BackendScoreMetrics; weekly_score: BackendWeeklyScore | null }> {
    return apiFetch(`/analytics/compute/${userId}`, { method: "POST" });
  },
};
