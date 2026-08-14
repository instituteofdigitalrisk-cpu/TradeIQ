import { useCallback, useEffect, useState } from "react";
import { admin } from "../api";
import type { UserDetail } from "../types";

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

// helper for formatting numbers if needed

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

function NoteList({ notes }: { notes: { note_id: number; content: string | null; created_at: string | null }[] }) {
  if (!notes || notes.length === 0) return <div>No notes</div>;
  return (
    <ul>
      {notes.map((n) => (
        <li key={n.note_id}>{n.created_at ? n.created_at.slice(0, 19) : ""} — {n.content}</li>
      ))}
    </ul>
  );
}

function AddNoteForm({ onAdd }: { onAdd: (content: string, note_type?: string) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} style={{ width: "100%" }} />
      <div style={{ marginTop: 6 }}>
        <button
          onClick={async () => {
            if (!content.trim()) return;
            setSubmitting(true);
            try {
              await onAdd(content.trim());
              setContent("");
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
        >
          Add Note
        </button>
      </div>
    </div>
  );
}


export default function UserDetailPage({ userId, onBack }: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [tab, setTab] = useState<"overview" | "account" | "competition" | "trading" | "thesis" | "activity">("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Note: profile edit, trade expansion, and delete actions removed from simplified view

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await admin.userDetail(userId);
      setDetail(d);
      // load basic detail into state (no editable profile in simplified view)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);


  // Removed edit/promote/delete handlers for now

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

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab("overview")} className={tab === "overview" ? "active" : ""}>Overview</button>
        <button onClick={() => setTab("account")} className={tab === "account" ? "active" : ""}>Account</button>
        <button onClick={() => setTab("competition")} className={tab === "competition" ? "active" : ""}>Competition</button>
        <button onClick={() => setTab("trading")} className={tab === "trading" ? "active" : ""}>Trading</button>
        <button onClick={() => setTab("thesis")} className={tab === "thesis" ? "active" : ""}>Thesis & Scores</button>
        <button onClick={() => setTab("activity")} className={tab === "activity" ? "active" : ""}>Activity</button>
      </div>

      <div className="panel">
        {tab === "overview" ? (
          <div>
            <h2>Profile</h2>
            <DetailGrid
              items={[
                { k: "Email", v: p.email },
                { k: "Phone", v: p.phone_number },
                { k: "University", v: p.university },
                { k: "Year of study", v: p.year_of_study },
                { k: "Paid", v: p.is_paid ? "Yes" : "No" },
                { k: "Status", v: p.registration_status ?? "—" },
                { k: "Account status", v: p.account_status ?? "—" },
                { k: "Age", v: p.age },
                { k: "Date of birth", v: p.date_of_birth },
                { k: "Joined", v: p.created_at ? p.created_at.slice(0, 10) : "—" },
              ]}
            />
            <div style={{ marginTop: 16 }} />

            <div style={{ marginTop: 20 }}>
              <h3>Payments</h3>
              {(detail.payments || []).length === 0 ? (
                <div className="empty">No payment history.</div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Date</th><th>Amount</th><th>Status</th><th>Method</th><th>Reference</th></tr>
                  </thead>
                  <tbody>
                    {(detail.payments || []).map((payment) => (
                      <tr key={payment.payment_id}>
                        <td>{payment.created_at ? payment.created_at.slice(0,10) : ""}</td>
                        <td>{fmtMoney(payment.amount)}</td>
                        <td>{payment.status}</td>
                        <td>{payment.payment_method || ""}</td>
                        <td>{payment.reference || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : tab === "account" ? (
          <div>
            <h2>Account & Payments</h2>
            <div style={{ marginBottom: 12 }}>
              <strong>Account status:</strong> {p.account_status ?? "—"}
            </div>
            <div>
              <h3>Payments</h3>
              {detail.payments && detail.payments.length > 0 ? (
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Method</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((pp) => (
                      <tr key={pp.payment_id}>
                        <td>{pp.created_at ? pp.created_at.slice(0, 19) : "—"}</td>
                        <td>{fmtMoney(pp.amount)}</td>
                        <td>{pp.status}</td>
                        <td>{pp.payment_method}</td>
                        <td>{pp.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div>No payments found.</div>
              )}
            </div>
          </div>
        ) : tab === "competition" ? (
          <div>
            <h2>Competition enrollments</h2>
            <ul>
              {(detail.competition_enrollments || []).map((e) => (
                <li key={e.enrollment_id}>{e.competition_round || ""} — {e.status}</li>
              ))}
            </ul>
          </div>
        ) : tab === "activity" ? (
          <div>
            <h2>Activity & CRM Notes</h2>
            <NoteList notes={detail.crm_notes ?? []} />
            <AddNoteForm
              onAdd={async (content, note_type) => {
                try {
                  await admin.createActivity(userId, { content, note_type });
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to add note.");
                }
              }}
            />
            <div style={{ marginTop: 16 }}>
              <h3>Activity Log</h3>
              {detail.activity_logs && detail.activity_logs.length > 0 ? (
                <ul>
                  {detail.activity_logs.map((a) => (
                    <li key={a.activity_id}>{a.event_type}: {a.description} — {a.created_at}</li>
                  ))}
                </ul>
              ) : (
                <div>No activity</div>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
      </div>
    );
  }
