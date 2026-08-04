import { useCallback, useEffect, useMemo, useState } from "react";
import { admin } from "../api";
import type { StatsOverview } from "../types";

type Props = {
  onOpenUser: (userId: string) => void;
};

const fmt = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const fmtMoney = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function BarsChart({
  data,
  days,
}: {
  data: { date: string; count: number }[];
  days: number;
}) {
  const [w, h] = [520, 160];
  const chart = useMemo(() => {
    const total = data.reduce((acc, d) => acc + d.count, 0);
    const max = Math.max(1, ...data.map((d) => d.count));
    const bw = w / Math.max(1, data.length);
    const bars = data.map((d, i) => {
      const bh = d.count === 0 ? 2 : (d.count / max) * (h - 20);
      return {
        x: i * bw,
        y: h - bh,
        w: bw * 0.72,
        h: bh,
        label: d.date.slice(5),
        count: d.count,
      };
    });
    return { bars, total };
  }, [data, w, h]);

  return (
    <div>
      {data.length === 0 ? (
        <div className="empty">No registrations in the last {days} days.</div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            {chart.total} new user{chart.total === 1 ? "" : "s"} in the last {days} days
          </div>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            role="img"
            aria-label="Registrations per day"
          >
            {chart.bars.map((b, i) => (
              <g key={i}>
                <title>{`${b.label}: ${b.count}`}</title>
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={2}
                  fill="url(#barGrad)"
                />
              </g>
            ))}
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#31e6ff" />
                <stop offset="100%" stopColor="#8d7cff" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ display: "flex", gap: 4, fontSize: 10, color: "var(--text2)" }}>
            {chart.bars.map((b, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", overflow: "hidden" }}>
                {b.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage({ onOpenUser }: Props) {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await admin.statsOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1>Dashboard</h1>
        </div>
        <div className="error-banner">{error}</div>
        <button onClick={() => void load()} style={{ marginTop: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <div className="page-header">
          <h1>Dashboard</h1>
        </div>
        <span className="spinner" /> Loading…
      </div>
    );
  }

  const cutoff = new Date(Date.now() - days * 86400000);
  const recent = stats.registrations_by_day.filter(
    (d) => new Date(d.date) >= cutoff
  );

  const newInRange =
    days === 7
      ? stats.totals.users_this_week
      : stats.totals.users_this_month;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="muted">Live from the TradeIQ database</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total users</div>
          <div className="stat-value">{fmt(stats.totals.total_users)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">New (last {days} days)</div>
          <div className="stat-value accent">{fmt(newInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total trades</div>
          <div className="stat-value">{fmt(stats.totals.total_trades)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active holdings</div>
          <div className="stat-value">{fmt(stats.totals.active_holdings)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg portfolio value</div>
          <div className="stat-value accent">{fmtMoney(stats.averages.avg_portfolio_value)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg return</div>
          <div className={`stat-value ${stats.averages.avg_return_pct >= 0 ? "positive" : "negative"}`}>
            {stats.averages.avg_return_pct >= 0 ? "+" : ""}
            {fmt(stats.averages.avg_return_pct)}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Buy volume</div>
          <div className="stat-value">{fmtMoney(stats.totals.buy_volume)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sell volume</div>
          <div className="stat-value">{fmtMoney(stats.totals.sell_volume)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Registrations</h2>
          <div className="chart-toolbar">
            {[7, 30].map((d) => (
              <button
                key={d}
                className={days === d ? "primary" : ""}
                onClick={() => setDays(d)}
              >
                Last {d} days
              </button>
            ))}
          </div>
          <BarsChart data={recent} days={days} />
        </div>

        <div className="panel">
          <h2>Top performers</h2>
          {stats.top_performers.length === 0 ? (
            <div className="empty">No scores computed yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Uni</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_performers.map((p, i) => (
                  <tr key={p.user_id}>
                    <td>{i + 1}</td>
                    <td>
                      <span
                        className="row-link"
                        onClick={() => onOpenUser(p.user_id)}
                      >
                        {p.full_name || p.email}
                      </span>
                    </td>
                    <td>{p.university ?? "—"}</td>
                    <td>{fmt(p.final_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>University breakdown</h2>
        {stats.university_breakdown.length === 0 ? (
          <div className="empty">No university data.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>University</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {stats.university_breakdown.map((u) => (
                <tr key={u.university ?? "unknown"}>
                  <td>{u.university ?? "Unknown"}</td>
                  <td>{fmt(u.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
