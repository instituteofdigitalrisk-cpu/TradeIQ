import { useEffect, useState } from "react";
import { admin } from "../api";
import type { PaymentRecord } from "../types";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [totalsByStatus, setTotalsByStatus] = useState<Record<string, number> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await admin.listPayments({ page, per_page: 50, q: q.trim() || undefined });
      setPayments(res.payments);
      setTotal(res.total);
      setTotalAmount(res.total_amount ?? null);
      setTotalsByStatus(res.totals_by_status ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  return (
    <div>
      <div className="page-header">
        <h1>Payments</h1>
        <span className="muted">{total} payments</span>
      </div>
      <div className="toolbar">
        <input placeholder="Search reference or notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => { setPage(1); void load(); }}>Search</button>
        <button onClick={() => { setPage(1); setQ(""); void load(); }}>Clear</button>
        <div style={{ marginLeft: 8 }}>
          <button onClick={() => { window.location.href = admin.exportPayments(q.trim() || undefined); }}>
            Export CSV
          </button>
        </div>
      </div>
      {totalAmount != null && (
        <div style={{ marginBottom: 8 }}>
          <strong>Total amount:</strong> ${totalAmount.toFixed(2)}
          {totalsByStatus && (
            <span style={{ marginLeft: 12 }}>
              {Object.entries(totalsByStatus).map(([k, v]) => (
                <span key={k} style={{ marginLeft: 8 }}>{k}: ${v.toFixed(2)}</span>
              ))}
            </span>
          )}
        </div>
      )}
      {loading ? <span className="spinner" /> : (
        <table>
          <thead>
            <tr><th>When</th><th>User</th><th>Amount</th><th>Status</th><th>Method</th><th>Reference</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.payment_id}>
                <td>{p.created_at ? p.created_at.slice(0,19) : ""}</td>
                <td>{p.user_id}</td>
                <td>{p.amount.toFixed(2)}</td>
                <td>{p.status}</td>
                <td>{p.payment_method}</td>
                <td>{p.reference}</td>
                <td>{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
