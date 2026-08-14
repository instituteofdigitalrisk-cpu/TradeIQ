import { useEffect, useState } from "react";
import { auth, clearToken } from "./api";
import type { LoginUser } from "./types";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import UserDetailPage from "./pages/UserDetailPage";
import PaymentsPage from "./pages/PaymentsPage";
import CompetitionPage from "./pages/CompetitionPage";
import ReportsPage from "./pages/ReportsPage";
import ActivityLogPage from "./pages/ActivityLogPage";
import SettingsPage from "./pages/SettingsPage";

type View =
  | { name: "dashboard" }
  | { name: "users" }
  | { name: "detail"; userId: string }
  | { name: "payments" }
  | { name: "competitions" }
  | { name: "reports" }
  | { name: "activity" }
  | { name: "settings" };

const USER_KEY = "tradeiq.adminUser";

function readStoredUser(): LoginUser | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as LoginUser) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<LoginUser | null>(readStoredUser);
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const res = await auth.login(email, password);
    if (res.user.role !== "admin") {
      clearToken();
      throw new Error("This account does not have admin access.");
    }
    setTokenAndUser(res.token, res.user);
  };

  const setTokenAndUser = (token: string, u: LoginUser) => {
    window.localStorage.setItem("tradeiq.adminToken", token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    setView({ name: "dashboard" });
  };

  const handleLogout = () => {
    clearToken();
    window.localStorage.removeItem(USER_KEY);
    setUser(null);
    setView({ name: "dashboard" });
  };

  if (loading) {
    return (
      <div className="login-wrap">
        <span className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const navToDetail = (userId: string) => setView({ name: "detail", userId });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-name">TradeIQ</div>
            <div className="brand-sub">Admin Portal</div>
          </div>
        </div>

        <button
          className={`nav-item ${view.name === "dashboard" ? "active" : ""}`}
          onClick={() => setView({ name: "dashboard" })}
        >
          <span aria-hidden>◈</span>
          <span className="label">Dashboard</span>
        </button>
        <button
          className={`nav-item ${view.name === "users" ? "active" : ""}`}
          onClick={() => setView({ name: "users" })}
        >
          <span aria-hidden>☰</span>
          <span className="label">Users</span>
        </button>
        <button
          className={`nav-item ${view.name === "payments" ? "active" : ""}`}
          onClick={() => setView({ name: "payments" })}
        >
          <span aria-hidden>💳</span>
          <span className="label">Payments</span>
        </button>
        <button
          className={`nav-item ${view.name === "competitions" ? "active" : ""}`}
          onClick={() => setView({ name: "competitions" })}
        >
          <span aria-hidden>🏆</span>
          <span className="label">Competitions</span>
        </button>
        <button
          className={`nav-item ${view.name === "reports" ? "active" : ""}`}
          onClick={() => setView({ name: "reports" })}
        >
          <span aria-hidden>📄</span>
          <span className="label">Reports</span>
        </button>
        <button
          className={`nav-item ${view.name === "settings" ? "active" : ""}`}
          onClick={() => setView({ name: "settings" })}
        >
          <span aria-hidden>⚙️</span>
          <span className="label">Settings</span>
        </button>
        <button
          className={`nav-item ${view.name === "activity" ? "active" : ""}`}
          onClick={() => setView({ name: "activity" })}
        >
          <span aria-hidden>🕘</span>
          <span className="label">Activity Log</span>
        </button>

        <div className="nav-spacer" />

        <div className="muted" style={{ fontSize: 12 }}>
          Signed in as
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {user.full_name}
        </div>
        <button className="nav-item" onClick={handleLogout}>
          <span aria-hidden>↪</span>
          <span className="label">Sign out</span>
        </button>
      </aside>

      <main className="content">
        {view.name === "dashboard" && (
          <DashboardPage onOpenUser={navToDetail} />
        )}
        {view.name === "users" && (
          <UsersPage onOpenUser={navToDetail} />
        )}
        {view.name === "payments" && <PaymentsPage />}
        {view.name === "competitions" && <CompetitionPage />}
        {view.name === "reports" && <ReportsPage />}
        {view.name === "settings" && <SettingsPage />}
        {view.name === "activity" && <ActivityLogPage />}
        {view.name === "detail" && (
          <UserDetailPage
            userId={view.userId}
            onBack={() => setView({ name: "users" })}
          />
        )}
      </main>
    </div>
  );
}

// Re-exported helper so pages can update the stored user after edits.
export function saveLoggedInUser(u: LoginUser): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(u));
}
