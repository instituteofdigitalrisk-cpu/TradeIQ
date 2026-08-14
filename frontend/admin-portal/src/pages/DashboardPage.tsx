import { useCallback, useEffect, useMemo, useState } from "react";
import { admin } from "../api";
import type { StatsOverview } from "../types";

type Props = { onOpenUser: (userId: string) => void; onNavigate?: (name: string) => void };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number, total: number) => total ? `${((n / total) * 100).toFixed(2)}%` : "0.00%";

function Trend({ value, tone = "positive" }: { value: string; tone?: string }) {
  return <div className={`trend ${tone}`}>{tone === "negative" ? "↓" : "↑"} {value}</div>;
}

function RegistrationChart({ data, days }: { data: { date: string; count: number }[]; days: number }) {
  const points = useMemo(() => {
    const byDate = new Map(data.map((item) => [item.date.slice(0, 10), item.count]));
    const today = new Date();
    const values = Array.from({ length: days }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (days - 1 - index));
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: byDate.get(key) ?? 0 };
    });
    const max = Math.max(3, ...values.map((x) => x.count));
    const step = values.length > 1 ? 190 / (values.length - 1) : 190;
    return values.map((item, i) => ({ ...item, x: 8 + i * step, y: 116 - (item.count / max) * 92 }));
  }, [data, days]);
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = points.length ? `8,124 ${line} 198,124` : "";
  return <div className="registration-chart">
    {points.length ? <svg viewBox="0 0 206 140" role="img" aria-label="Registrations over time">
      <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#896cff" stopOpacity=".45" /><stop offset="1" stopColor="#896cff" stopOpacity="0" /></linearGradient></defs>
      {[24, 57, 90, 123].map((y) => <line key={y} x1="8" x2="198" y1={y} y2={y} className="chart-grid" />)}
      <polygon points={area} fill="url(#chartFill)" />
      <polyline points={line} fill="none" stroke="#a06bff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => <circle key={p.date} cx={p.x} cy={p.y} r="2.8" fill="#b078ff"><title>{p.date}: {p.count}</title></circle>)}
    </svg> : <div className="empty">No registrations in this period.</div>}
    <div className="chart-labels">{points.slice(-7).map((p) => <span key={p.date}>{new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>)}</div>
  </div>;
}

function PaymentDonut({ totals }: { totals: StatsOverview["totals"] }) {
  const paid = totals.payments_completed ?? 0;
  const pending = totals.payments_pending ?? 0;
  const total = totals.total_payments ?? paid + pending;
  const radius = 43; const circumference = 2 * Math.PI * radius;
  const paidLength = total ? (paid / total) * circumference : 0;
  const pendingLength = total ? (pending / total) * circumference : 0;
  return <div className="payment-chart">
    <svg viewBox="0 0 120 120" aria-label="Payment status chart">
      <circle cx="60" cy="60" r={radius} className="donut-track" />
      <circle cx="60" cy="60" r={radius} className="donut-paid" strokeDasharray={`${paidLength} ${circumference - paidLength}`} />
      <circle cx="60" cy="60" r={radius} className="donut-pending" strokeDasharray={`${pendingLength} ${circumference - pendingLength}`} strokeDashoffset={-paidLength} />
      <text x="60" y="58" textAnchor="middle" className="donut-number">{total}</text><text x="60" y="72" textAnchor="middle" className="donut-caption">Total</text>
    </svg>
    <div className="payment-legend">
      <div><i className="dot green" />Paid <b>{paid}</b> <small>({pct(paid, total)})</small></div>
      <div><i className="dot orange" />Pending <b>{pending}</b> <small>({pct(pending, total)})</small></div>
      <div><i className="dot red" />Failed <b>0</b> <small>(0.00%)</small></div>
      <div><i className="dot grey" />Refunded <b>0</b> <small>(0.00%)</small></div>
    </div>
  </div>;
}

export default function DashboardPage({ onOpenUser, onNavigate }: Props) {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const load = useCallback(async () => { setError(null); try { setStats(await admin.statsOverview()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load stats."); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <><div className="page-header"><h1>Dashboard</h1></div><div className="error-banner">{error}</div><button onClick={() => void load()}>Retry</button></>;
  if (!stats) return <><div className="page-header"><h1>Dashboard</h1></div><span className="spinner" /> Loading…</>;
  const t = stats.totals;
  const registrations = stats.registrations_by_day.slice(-days);
  const top = stats.top_performers.slice(0, 5);
  const universityTotal = stats.university_breakdown.reduce((sum, item) => sum + item.count, 0);
  const mainUniversity = stats.university_breakdown[0];
  return <div className="dashboard-page">
    <div className="page-header dashboard-header"><div><h1>Dashboard</h1></div><span className="live-indicator">◉ Live from the TradeIQ database</span></div>
    <section className="dashboard-section overview-section"><h2>CRM Overview</h2><div className="crm-grid">
      <div className="crm-card"><span>Total Users</span><strong>{fmt(t.total_users)}</strong><Trend value={`${t.users_this_week} vs last 7 days`} /></div>
      <div className="crm-card"><span>New Registrations</span><strong>{fmt(days === 7 ? t.users_this_week : t.users_this_month)}</strong><Trend value={`${days === 7 ? t.users_this_week : t.users_this_month} vs last 7 days`} /></div>
      <div className="crm-card"><span>Paid Students</span><strong>{fmt(t.paid_students ?? 0)}</strong><Trend value={pct(t.paid_students ?? 0, t.total_users)} /></div>
      <div className="crm-card"><span>Pending Payments</span><strong>{fmt(t.payments_pending ?? 0)}</strong><Trend value={pct(t.payments_pending ?? 0, t.total_payments ?? 0)} tone="warning" /></div>
      <div className="crm-card"><span>Active Students</span><strong>{fmt(t.active_students ?? 0)}</strong><Trend value={pct(t.active_students ?? 0, t.total_users)} /></div>
      <div className="crm-card"><span>Suspended Accounts</span><strong>{fmt(t.suspended_accounts ?? 0)}</strong><Trend value={pct(t.suspended_accounts ?? 0, t.total_users)} tone="negative" /></div>
    </div></section>
    <div className="dashboard-grid dashboard-grid-top">
      <section className="dashboard-section registrations-panel"><h2>Registrations</h2><div className="chart-toolbar"><button className={days === 7 ? "selected" : ""} onClick={() => setDays(7)}>Last 7 days</button><button className={days === 30 ? "selected" : ""} onClick={() => setDays(30)}>Last 30 days</button></div><RegistrationChart data={registrations} days={days} /></section>
      <section className="dashboard-section payments-panel"><h2>Payment Status</h2><PaymentDonut totals={t} /></section>
      <section className="dashboard-section competition-panel"><h2>Competition Overview</h2><div className="overview-list"><div>Active Competitions <b>{t.total_enrollments ? 1 : 0}</b></div><div>Total Enrolled <b>{fmt(t.total_enrollments ?? 0)}</b></div><div>This Week <b>{fmt(t.users_this_week)}</b></div><div>Next Week <b>{new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b></div></div><button className="outline-button" onClick={() => onNavigate?.("competitions")}>View Competitions</button></section>
    </div>
    <div className="dashboard-grid dashboard-grid-bottom">
      <section className="dashboard-section performers-panel"><h2>Top Performers</h2><table className="dashboard-table"><thead><tr><th>Rank</th><th>Name</th><th>Uni</th><th>Score</th><th>Return</th></tr></thead><tbody>{top.length ? top.map((p, i) => <tr key={p.user_id}><td>{i + 1}</td><td><button className="table-link" onClick={() => onOpenUser(p.user_id)}>{p.full_name || p.email}</button></td><td>{p.university ?? "—"}</td><td>{fmt(p.final_score)}</td><td className="positive-text">+{fmt(p.final_score)}%</td></tr>) : <tr><td colSpan={5} className="empty">No scores computed yet.</td></tr>}</tbody></table></section>
      <section className="dashboard-section university-panel"><h2>University Breakdown</h2><div className="university-content"><div className="university-donut"><span>{fmt(universityTotal)}</span><small>Total</small></div><div className="university-legend">{mainUniversity ? <div><i className="dot blue" />{mainUniversity.university}<b>{mainUniversity.count} <small>({pct(mainUniversity.count, universityTotal)})</small></b></div> : <span className="empty">No university data.</span>}</div></div></section>
    </div>
  </div>;
}
