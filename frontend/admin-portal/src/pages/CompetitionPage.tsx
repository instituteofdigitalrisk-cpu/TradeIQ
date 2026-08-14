import { useEffect, useState } from "react";
import { admin } from "../api";

export default function CompetitionPage() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"enrollments" | "rounds">("enrollments");
  const [rounds, setRounds] = useState<any[]>([]);
  const roundsPage = 1;
  const [roundName, setRoundName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await admin.listCompetitions({ page, per_page: 50, q: q.trim() || undefined });
      setEnrollments(res.enrollments);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRounds = async () => {
    try {
      const res = await admin.listCompetitionRounds({ page: roundsPage, per_page: 50 });
      setRounds(res.rounds);
      // total is available as res.total if needed later
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { void load(); }, [page]);
  useEffect(() => { void loadRounds(); }, []);

  const createRound = async () => {
    if (!roundName) return;
    try {
      await admin.createCompetitionRound({ name: roundName });
      setRoundName("");
      void loadRounds();
    } catch (err) {
      console.error(err);
    }
  };
  let bodyContent: any = null;
  if (tab === "enrollments") {
    bodyContent = loading ? (
      <span className="spinner" />
    ) : (
      <table>
        <thead>
          <tr><th>Enrolled</th><th>User</th><th>Round</th><th>Status</th><th>Start</th><th>End</th></tr>
        </thead>
        <tbody>
          {enrollments.map((e) => (
            <tr key={e.enrollment_id}>
              <td>{e.enrolled_at ? e.enrolled_at.slice(0,19) : ""}</td>
              <td>{e.user_id}</td>
              <td>{e.competition_round}</td>
              <td>{e.status}</td>
              <td>{e.start_date || ""}</td>
              <td>{e.end_date || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else {
    bodyContent = (
      <div>
        <div className="toolbar">
          <input placeholder="Round name" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
          <button className="primary" onClick={createRound}>Create Round</button>
        </div>

        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Start</th><th>End</th><th>Active</th></tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.competition_id}>
                <td>{r.competition_id}</td>
                <td>{r.name}</td>
                <td>{r.start_date || ""}</td>
                <td>{r.end_date || ""}</td>
                <td>{r.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Competitions</h1>
        <span className="muted">{total} enrollments</span>
      </div>
      <div className="toolbar">
        <input placeholder="Search user or round…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => { setPage(1); void load(); }}>Search</button>
        <button onClick={() => { setPage(1); setQ(""); void load(); }}>Clear</button>
      </div>
      <div className="tabs">
        <button className={tab === "enrollments" ? "primary" : ""} onClick={() => setTab("enrollments")}>Enrollments</button>
        <button className={tab === "rounds" ? "primary" : ""} onClick={() => setTab("rounds")}>Rounds</button>
      </div>

      {bodyContent}
    </div>
  );
}
