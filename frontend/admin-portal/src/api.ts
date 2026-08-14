import type {
  ApiError,
  LoginResponse,
  StatsOverview,
  UserDetail,
  UserRow,
  UsersResponse,
  Report,
  ReportsResponse,
  CompetitionEnrollment,
  PaymentRecord,
  ActivityLog,
  ReportsResponse as _RR,
} from "./types";

// Re-export competition rounds response type from types to satisfy local usage
export type CompetitionRoundsResponse = import("./types").CompetitionRoundsResponse;

const DEFAULT_API_BASE = "https://tradeiq-gtkc.onrender.com";
const configuredApiBase = import.meta.env.VITE_API_URL as string | undefined;
const ENV_API_BASE = (configuredApiBase || DEFAULT_API_BASE).replace(/\/+$/, "");

// Local dev server -> talk to the local Flask backend; otherwise the hosted one.
const browserHostname =
  typeof window !== "undefined" && typeof window.location?.hostname === "string"
    ? window.location.hostname
    : "";
const isLocalWeb = ["localhost", "127.0.0.1"].includes(browserHostname);
const API_BASES =
  isLocalWeb && !configuredApiBase ? ["http://localhost:5000"] : [ENV_API_BASE];

// ── Token storage ──────────────────────────────────────────────────────────────
const TOKEN_KEY = "tradeiq.adminToken";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

function isInvalidTokenResponse(status: number, body: string): boolean {
  if (status !== 401 && status !== 422) return false;
  try {
    const parsed = JSON.parse(body) as { msg?: string };
    return [
      "Token has expired",
      "Signature verification failed",
      "Not enough segments",
    ].includes(parsed.msg ?? "");
  } catch {
    return (
      body.includes("Token has expired") ||
      body.includes("Signature verification failed") ||
      body.includes("Not enough segments")
    );
  }
}

function extractErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as ApiError;
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (typeof parsed.msg === "string" && parsed.msg) return parsed.msg;
    if (typeof parsed.details === "string" && parsed.details) return parsed.details;
  } catch {
    /* not JSON */
  }
  return `Request failed with status ${status}`;
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

  const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  for (const base of API_BASES) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, { ...options, headers });
      const text = await res.text();
      const end = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const dur = Math.round(end - start);
      // Lightweight client-side timing for debugging perf issues
      // Check browser console for lines prefixed with [api]
      /* eslint-disable no-console */
      console.debug(`[api] ${url} ${res.status} ${dur}ms`);
      /* eslint-enable no-console */

      if (!res.ok) {
        if (isInvalidTokenResponse(res.status, text)) {
          clearToken();
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error(extractErrorMessage(text, res.status));
      }

      return (text ? JSON.parse(text) : {}) as T;
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Could not connect to the TradeIQ backend. Tried: ${API_BASES.join(", ")}.`
  );
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export const auth = {
  login(email: string, password: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
};

// ── Admin ──────────────────────────────────────────────────────────────────────
export type UsersQuery = {
  page?: number;
  per_page?: number;
  q?: string;
  role?: string;
  university?: string;
  sort?: string;
  order?: string;
};

export const admin = {
  statsOverview(): Promise<StatsOverview> {
    return apiFetch<StatsOverview>("/admin/stats/overview");
  },

  listUsers(query: UsersQuery = {}): Promise<UsersResponse> {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    if (query.q) params.set("q", query.q);
    if (query.role) params.set("role", query.role);
    if (query.university) params.set("university", query.university);
    if (query.sort) params.set("sort", query.sort);
    if (query.order) params.set("order", query.order);
    const qs = params.toString();
    return apiFetch<UsersResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
  },

  userDetail(userId: string): Promise<UserDetail> {
    return apiFetch<UserDetail>(`/admin/users/${encodeURIComponent(userId)}`);
  },

  userAccount(userId: string): Promise<any> {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/account`);
  },

  updateUserAccount(userId: string, fields: Record<string, any>): Promise<any> {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/account`, {
      method: "PUT",
      body: JSON.stringify(fields),
    });
  },

  createPayment(userId: string, payload: { amount: number; status?: string; payment_method?: string; reference?: string; notes?: string }) {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/payment`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listPayments(query: { page?: number; per_page?: number; q?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    if (query.q) params.set("q", query.q);
    const qs = params.toString();
    return apiFetch<{
      payments: PaymentRecord[];
      total: number;
      total_amount?: number;
      totals_by_status?: Record<string, number>;
    }>(`/admin/payments${qs ? `?${qs}` : ""}`);
  },

  listCompetitions(query: { page?: number; per_page?: number; q?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    if (query.q) params.set("q", query.q);
    const qs = params.toString();
    return apiFetch<{ enrollments: CompetitionEnrollment[]; total: number }>(
      `/admin/competitions${qs ? `?${qs}` : ""}`,
    );
  },

  listCompetitionRounds(query: { page?: number; per_page?: number } = {}) {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    const qs = params.toString();
    return apiFetch<CompetitionRoundsResponse>(`/admin/competitions/rounds${qs ? `?${qs}` : ""}`);
  },

  createCompetitionRound(payload: { name: string; slug?: string; description?: string; start_date?: string; end_date?: string; active?: boolean }) {
    return apiFetch(`/admin/competitions/rounds`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateCompetitionRound(id: number, payload: Record<string, any>) {
    return apiFetch(`/admin/competitions/rounds/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deleteCompetitionRound(id: number) {
    return apiFetch(`/admin/competitions/rounds/${id}`, {
      method: "DELETE",
    });
  },

  exportPayments(q?: string) {
    const base = API_BASES[0];
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return `${base}/admin/payments/export${qs}`;
  },

  listActivity(query: { page?: number; per_page?: number; user_id?: string; event_type?: string; start?: string; end?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    if (query.user_id) params.set("user_id", query.user_id);
    if (query.event_type) params.set("event_type", query.event_type);
    if (query.start) params.set("start", query.start);
    if (query.end) params.set("end", query.end);
    const qs = params.toString();
    return apiFetch<{ total: number; page: number; per_page: number; activity_logs: ActivityLog[] }>(`/admin/activity${qs ? `?${qs}` : ""}`);
  },

  listSettings(query: { page?: number; per_page?: number; q?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    if (query.q) params.set("q", query.q);
    const qs = params.toString();
    return apiFetch<{ settings: any[]; total: number }>(`/admin/settings${qs ? `?${qs}` : ""}`);
  },

  putSettings(payload: Record<string, any>) {
    return apiFetch(`/admin/settings`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  listReports(query: { page?: number; per_page?: number } = {}): Promise<ReportsResponse> {
    const params = new URLSearchParams();
    if (query.page != null) params.set("page", String(query.page));
    if (query.per_page != null) params.set("per_page", String(query.per_page));
    const qs = params.toString();
    return apiFetch<ReportsResponse>(`/admin/reports${qs ? `?${qs}` : ""}`);
  },

  createReport(payload: { type?: string } = { type: "users_summary" }): Promise<Report> {
    return apiFetch<Report>(`/admin/reports`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  downloadReport(reportId: number) {
    // Return the absolute URL for download so the frontend can use it in anchors.
    const base = API_BASES[0];
    return `${base}/admin/reports/${reportId}/download`;
  },

  userCompetition(userId: string) {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/competition`);
  },

  updateUserCompetition(userId: string, fields: Record<string, any>) {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/competition`, {
      method: "PUT",
      body: JSON.stringify(fields),
    });
  },

  userActivity(userId: string) {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/activity`);
  },

  createActivity(userId: string, payload: { note_type?: string; content: string }) {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}/activity`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateUser(
    userId: string,
    fields: Partial<{
      role: "student" | "admin";
      full_name: string;
      university: string;
      year_of_study: number;
      phone_number: string;
      is_paid: boolean;
      registration_status: string;
    }>
  ): Promise<UserRow> {
    return apiFetch<UserRow>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    });
  },

  deleteUser(userId: string): Promise<{ message: string; user_id: string }> {
    return apiFetch(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },
};
