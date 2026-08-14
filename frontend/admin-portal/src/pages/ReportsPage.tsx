import { useCallback, useEffect, useState } from "react";
import { admin } from "../api";
import type { Report, ReportsResponse } from "../types";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await admin.listReports({ page, per_page: perPage });
      setReports(res.reports);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setError(null);
    try {
      await admin.createReport({ type: "users_summary" });
      // reload
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create report");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
        <div>
          <button onClick={create} disabled={loading} className="primary">
            Generate Users Summary
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <span className="spinner" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Type / Path</th>
              <th>Generated At</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.report_id}>
                <td>{r.report_id}</td>
                <td>{r.report_path}</td>
                <td>{r.generated_at ?? "-"}</td>
                <td>
                  <a href={admin.downloadReport(r.report_id)} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Prev
        </button>
        <span>
          Page {page} ({total} total)
        </span>
        <button disabled={page * perPage >= total} onClick={() => setPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
