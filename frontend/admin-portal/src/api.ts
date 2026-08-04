import type {
  ApiError,
  LoginResponse,
  StatsOverview,
  UserDetail,
  UserRow,
  UsersResponse,
} from "./types";

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

  for (const base of API_BASES) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, { ...options, headers });
      const text = await res.text();

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

  updateUser(
    userId: string,
    fields: Partial<{
      role: "student" | "admin";
      full_name: string;
      university: string;
      year_of_study: number;
      phone_number: string;
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
