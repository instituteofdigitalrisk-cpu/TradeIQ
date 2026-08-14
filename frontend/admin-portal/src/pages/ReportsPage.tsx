import { useCallback, useEffect, useMemo, useState } from "react";
import { admin, getToken } from "../api";
import type { Report } from "../types";

const reportTypes = [
  ["User Performance Report", "Overall performance of all students", "users_summary", "blue"],
  ["Trading Activity Report", "Trades, activities and holdings summary", "trading_activity", "green"],
  ["Payment Summary Report", "Payment collections and status report", "unsupported", "yellow"],
  ["Competition Report", "Competition enrollment and performance", "unsupported", "green"],
  ["Leaderboard Report", "Top performers and rankings", "leaderboard", "purple"],
] as const;
const date = (value?: string | null) => value ? value.slice(0, 16).replace("T", " ") : "-";
const reportName = (report: Report) => {
  const filename = report.report_path.split(/[\\/]/).pop() || "";
  if (filename.includes("users_summary") || filename.startsWith("user_performance_report_")) return `User Performance Report - ${date(report.generated_at)}`;
  if (filename.startsWith("trading_activity_report_")) return `Trading Activity Report - ${date(report.generated_at)}`;
  if (filename.startsWith("leaderboard_report_")) return `Leaderboard Report - ${date(report.generated_at)}`;
  return filename || `Report ${report.report_id}`;
};
const downloadName = (report: Report) => {
  const filename = report.report_path.split(/[\\/]/).pop() || "";
  const prefix = filename.startsWith("trading_activity_report_") ? "trading_activity_report" : filename.startsWith("leaderboard_report_") ? "leaderboard_report" : "user_performance_report";
  return `${prefix}_${report.generated_at?.replace(/[-:T]/g, "").slice(0, 15) || report.report_id}.csv`;
};

async function downloadReportFile(reportId: number, filename: string, onError: (message: string) => void) {
  try {
    const response = await fetch(admin.downloadReport(reportId), { headers: { Authorization: `Bearer ${getToken() || ""}` } });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  } catch (error) { onError(error instanceof Error ? error.message : "Failed to download report."); }
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false); const [deletingId, setDeletingId] = useState<number | null>(null); const [error, setError] = useState<string | null>(null); const [query, setQuery] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const result = await admin.listReports({ page: 1, per_page: 100 }); setReports(result.reports); setTotal(result.total); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load reports."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const generatedThisMonth = useMemo(() => reports.filter((r) => r.generated_at?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length, [reports]);
  const visible = reports.filter((r) => !query || reportName(r).toLowerCase().includes(query.toLowerCase()) || r.report_path.toLowerCase().includes(query.toLowerCase()));
  const generate = async (type: string) => { if (type === "unsupported") return; setGenerating(true); setError(null); try { await admin.createReport({ type }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to generate report."); } finally { setGenerating(false); } };
  const download = (report: Report) => void downloadReportFile(report.report_id, downloadName(report), setError);
  const deleteReport = async (report: Report) => { if (!window.confirm(`Delete ${reportName(report)}?`)) return; setDeletingId(report.report_id); setError(null); try { await admin.deleteReport(report.report_id); setReports((current) => current.filter((item) => item.report_id !== report.report_id)); setTotal((current) => Math.max(0, current - 1)); } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete report."); } finally { setDeletingId(null); } };
  return <div className="reports-page">
    <div className="page-header reports-heading"><h1>Reports</h1><button className="generate-report-button" disabled={generating} onClick={() => void generate("users_summary")}>+ Generate Report</button></div>
    {error && <div className="error-banner">{error}</div>}
    <section className="report-overview"><h2>Report Overview</h2><div className="report-summary"><Summary label="Total Reports" value={total} /><Summary label="Generated This Month" value={generatedThisMonth} /><Summary label="Scheduled Reports" value={0} /><Summary label="Last Generated" value={reports[0]?.generated_at ? date(reports[0].generated_at).slice(0, 10) : "-"} /></div></section>
    <div className="reports-two-col"><section className="popular-reports"><h2>Popular Reports</h2>{reportTypes.map(([name, description, type, tone]) => <div className="popular-report" key={name}><i className={`report-icon ${tone}`}>R</i><div><strong>{name}</strong><small>{description}</small></div><button disabled={type === "unsupported" || generating} onClick={() => void generate(type)}>{type === "unsupported" ? "Unavailable" : "Generate"}</button></div>)}</section><section className="recent-reports"><h2>Recent Reports</h2>{loading ? <span className="spinner" /> : visible.slice(0, 6).map((report) => <div className="recent-report" key={report.report_id}><i className="report-icon blue">R</i><div><strong>{reportName(report)}</strong><small>{date(report.generated_at)}</small></div><div className="report-actions"><button className="report-download-button" onClick={() => download(report)}>Download</button><button className="report-delete-button" onClick={() => void deleteReport(report)} disabled={deletingId === report.report_id}>Delete</button></div></div>)}{!loading && !visible.length && <div className="empty">No reports generated yet.</div>}<button className="view-all-reports" onClick={() => document.getElementById("all-reports")?.scrollIntoView({ behavior: "smooth" })}>View all reports</button></section></div>
    <section id="all-reports" className="all-reports"><div className="all-reports-heading"><h2>All Reports</h2><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports..." /></div>{loading ? <span className="spinner" /> : <table className="reports-table"><thead><tr><th>Report</th><th>Generated Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((report) => <tr key={report.report_id}><td>{reportName(report)}</td><td>{date(report.generated_at)}</td><td><span className="report-ready">Ready</span></td><td><button className="report-download-link" onClick={() => download(report)}>Download</button><button className="report-delete-link" onClick={() => void deleteReport(report)} disabled={deletingId === report.report_id}>Delete</button></td></tr>)}</tbody></table>}</section>
  </div>;
}
function Summary({ label, value }: { label: string; value: React.ReactNode }) { return <div className="report-summary-card"><span>{label}</span><strong>{value}</strong></div>; }
