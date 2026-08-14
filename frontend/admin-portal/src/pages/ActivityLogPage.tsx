import { useCallback, useEffect, useState } from "react";
import { admin } from "../api";
import type { ActivityLog } from "../types";

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userIdFilter, setUserIdFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await admin.listActivity({ page, per_page: perPage, user_id: userIdFilter || undefined, event_type: eventFilter || undefined });
      setLogs(res.activity_logs);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, userIdFilter, eventFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <h1>Activity Log</h1>
        <div>
          <button onClick={() => void load()} className="primary">Refresh</button>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="User ID filter" value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} />
        <input placeholder="Event type" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} />
        <button onClick={() => { setPage(1); void load(); }}>Apply</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <span className="spinner" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.activity_id}>
                <td>{l.created_at ?? "-"}</td>
                <td>{l.user_id}</td>
                <td>{l.event_type}</td>
                <td>{l.description ?? l.metadata ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
        <span>Page {page} ({total} total)</span>
        <button disabled={page * perPage >= total} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
}
