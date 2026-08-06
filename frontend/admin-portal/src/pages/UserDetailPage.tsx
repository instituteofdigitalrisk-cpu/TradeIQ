import { Fragment, useCallback, useEffect, useState } from "react";
import { admin } from "../api";
import { saveLoggedInUser } from "../App";
import type { Role, UserDetail } from "../types";

type Props = {
  userId: string;
  onBack: () => void;
};

const fmtMoney = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function DetailGrid({ items }: { items: { k: string; v: string | number | null }[] }) {
  return (
    <div className="detail-grid">
      {items.map((it) => (
        <div className="detail-item" key={it.k}>
          <div className="k">{it.k}</div>
          <div className="v">{it.v ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

export default function UserDetailPage({ userId, onBack }: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  // Edit state (profile fields only)
  const [edit, setEdit] = useState(false);
  const [fullName, setFullName] = useState("");
  const [university, setUniversity] = useState("");
  const [year, setYear] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await admin.userDetail(userId);
      setDetail(d);
      setFullName(d.profile.full_name ?? "");
      setUniversity(d.profile.university ?? "");
      setYear(d.profile.year_of_study != null ? String(d.profile.year_of_study) : "");
      setPhone(d.profile.phone_number ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveEdits = async () => {
    setSaving(true);
    setError(null);
    try {
      const fields: Partial<{
        full_name: string;
        university: string;
        year_of_study: number;
        phone_number: string;
      }> = {};
      if (fullName.trim()) fields.full_name = fullName.trim();
      if (university.trim()) fields.university = university.trim();
      if (year.trim()) fields.year_of_study = parseInt(year, 10);
      if (phone.trim()) fields.phone_number = phone.trim();

      await admin.updateUser(userId, fields);
      const d = await admin.userDetail(userId);
      setDetail(d);
      setEdit(false);
      // Keep the sidebar identity fresh in case the edited user is the admin.
      const stored = window.localStorage.getItem("tradeiq.adminUser");
      if (stored) {
        try {
          const me = JSON.parse(stored) as { user_id?: string };
          if (me.user_id === userId) {
            const next: {
              user_id: string;
              full_name: string;
              email: string;
              university: string | null;
              year_of_study: number | null;
              role: Role;
              created_at: string;
            } = {
              ...(JSON.parse(stored) as {
                user_id: string;
                full_name: string;
                email: string;
                university: string | null;
                year_of_study: number | null;
                role: Role;
                created_at: string;
              }),
              full_name: d.profile.full_name,
              university: d.profile.university,
              year_of_study: d.profile.year_of_study,
              role: d.profile.role as Role,
            };
            saveLoggedInUser(next);
          }
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const promoteDemote = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const nextRole: Role = detail.profile.role === "admin" ? "student" : "admin";
      await admin.updateUser(userId, { role: nextRole });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await admin.deleteUser(userId);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
      setDeleting(false);
    }
  };

  if (error && !detail) {
    return (
      <div>
        <div className="page-header">
          <button onClick={onBack}>← Back</button>
        </div>
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div>
        <div className="page-header">
          <button onClick={onBack}>← Back</button>
          <h1>User</h1>
        </div>
        <span className="spinner" /> Loading…
      </div>
    );
  }

  const p = detail.profile;

  return (
    <div>
      <div className="page-header">
        <button onClick={onBack}>← Back</button>
        <div>
          <h1 style={{ marginBottom: 2 }}>{p.full_name || p.email}</h1>
          <span className="muted mono">{p.user_id}</span>
        </div>
        <span className={`role-badge ${p.role}`}>{p.role}</span>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="panel">
        <h2>Profile</h2>
        {!edit ? (
          <>
            <DetailGrid
              items={[
                { k: "Email", v: p.email },
                { k: "Phone", v: p.phone_number },
                { k: "University", v: p.university },
                { k: "Year of study", v: p.year_of_study },
                { k: "Age", v: p.age },
                { k: "Date of birth", v: p.date_of_birth },
                { k: "Joined", v: p.created_at ? p.created_at.slice(0, 10) : "—" },
              ]}
            />
            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button onClick={() => setEdit(true)}>Edit</button>
              <button onClick={() => void promoteDemote()} disabled={saving}>
                {p.role === "admin" ? "Demote to student" : "Promote to admin"}
              </button>
            </div>
          </>
        ) : (
          <div className="inline-form">
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label>University</label>
              <input value={university} onChange={(e) => setUniversity(e.target.value)} />
            </div>
            <div className="field">
              <label>Year of study</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <button className="primary" onClick={() => void saveEdits()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEdit(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Portfolio</h2>
          {detail.portfolio ? (
            <DetailGrid
              items={[
                { k: "Total capital", v: fmtMoney(detail.portfolio.total_capital) },
                { k: "Cash balance", v: fmtMoney(detail.portfolio.cash_balance) },
                {
                  k: "Portfolio value",
                  v: fmtMoney(p.portfolio_value),
                },
                {
                  k: "Return",
                  v: `${p.return_pct >= 0 ? "+" : ""}${p.return_pct.toFixed(2)}%`,
                },
                { k: "Risk appetite", v: detail.portfolio.risk_appetite },
                { k: "Horizon", v: detail.portfolio.investment_horizon },
                { k: "Round", v: detail.portfolio.competition_round },
              ]}
            />
          ) : (
            <div className="empty">No portfolio setup.</div>
          )}
        </div>

        <div className="panel">
          <h2>Risk metrics</h2>
          {detail.risk_metrics ? (
            <DetailGrid
              items={[
                { k: "Sharpe", v: fmtNum(detail.risk_metrics.sharpe_ratio) },
                { k: "Beta", v: fmtNum(detail.risk_metrics.beta) },
                { k: "Volatility", v: fmtNum(detail.risk_metrics.volatility) },
                { k: "Max drawdown", v: fmtNum(detail.risk_metrics.max_drawdown) },
                { k: "VaR", v: fmtNum(detail.risk_metrics.var_value) },
              ]}
            />
          ) : (
            <div className="empty">No risk metrics.</div>
          )}
        </div>
      </div>

      <div className="section-label">Holdings ({detail.holdings.length})</div>
      {detail.holdings.length === 0 ? (
        <div className="empty">No holdings.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th>Qty</th>
              <th>Avg buy</th>
              <th>Price</th>
              <th>Value</th>
              <th>P/L</th>
            </tr>
          </thead>
          <tbody>
            {detail.holdings.map((h) => (
              <tr key={h.holding_id}>
                <td className="mono">{h.stock_ticker}</td>
                <td>{h.stock_name ?? "—"}</td>
                <td>{h.quantity}</td>
                <td>{fmtMoney(h.avg_buy_price)}</td>
                <td>{fmtMoney(h.current_price)}</td>
                <td>{fmtMoney(h.market_value)}</td>
                <td style={{ color: h.profit_loss >= 0 ? "var(--green)" : "var(--red)" }}>
                  {h.profit_loss >= 0 ? "+" : ""}
                  {fmtMoney(h.profit_loss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-label">Trades ({detail.trades.length})</div>
      {detail.trades.length === 0 ? (
        <div className="empty">No trades.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Thesis</th>
              <th>Date</th>
              <th>Ticker</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
              <th>Sector</th>
              <th>Alloc %</th>
            </tr>
          </thead>
          <tbody>
            {detail.trades.map((t) => (
              <Fragment key={t.trade_id}>
                <tr>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTradeId((current) =>
                          current === t.trade_id ? null : t.trade_id,
                        )
                      }
                      style={{ padding: "4px 10px", minWidth: 96 }}
                    >
                      {expandedTradeId === t.trade_id ? "Hide" : "View"}
                    </button>
                  </td>
                  <td>{t.created_at ? t.created_at.slice(0, 10) : "—"}</td>
                  <td className="mono">{t.stock_ticker ?? "—"}</td>
                  <td>
                    <span style={{ color: t.trade_type === "BUY" ? "var(--green)" : "var(--red)" }}>
                      {t.trade_type}
                    </span>
                  </td>
                  <td>{t.quantity ?? "—"}</td>
                  <td>{fmtMoney(t.buy_price)}</td>
                  <td>{fmtMoney(t.amount_invested)}</td>
                  <td>{t.sector ?? "—"}</td>
                  <td>{fmtNum(t.allocation_percent)}</td>
                </tr>
                {expandedTradeId === t.trade_id && (
                  <tr>
                    <td colSpan={9} style={{ paddingTop: 0 }}>
                      <div
                        style={{
                          padding: "12px 14px",
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          color: "var(--text)",
                          lineHeight: 1.55,
                        }}
                      >
                        <div
                          style={{
                            marginBottom: 6,
                            color: "var(--muted)",
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: 0.08,
                          }}
                        >
                          Thesis
                        </div>
                        <div style={{ whiteSpace: "normal" }}>{t.thesis || "No thesis recorded."}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-label">Weekly scores</div>
      {detail.weekly_scores.length === 0 ? (
        <div className="empty">No scores.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Portfolio</th>
              <th>Risk</th>
              <th>Thesis</th>
              <th>Execution</th>
              <th>Strategy</th>
              <th>Final</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            {detail.weekly_scores.map((s) => (
              <tr key={s.week_number}>
                <td>{s.week_number}</td>
                <td>{fmtNum(s.portfolio_score)}</td>
                <td>{fmtNum(s.risk_score)}</td>
                <td>{fmtNum(s.thesis_score)}</td>
                <td>{fmtNum(s.execution_score)}</td>
                <td>{fmtNum(s.strategy_score)}</td>
                <td>{fmtNum(s.final_score)}</td>
                <td>{s.rank_position ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="panel" style={{ marginTop: 24 }}>
        <h2 style={{ color: "var(--red)" }}>Danger zone</h2>
        {!confirmDelete ? (
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            Delete user
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>
              Permanently delete <strong>{p.full_name || p.email}</strong> and all their data?
            </span>
            <button className="danger" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
