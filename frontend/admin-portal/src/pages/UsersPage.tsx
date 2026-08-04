import { useCallback, useEffect, useState } from "react";
import { admin } from "../api";
import type { Role, UserRow } from "../types";

type Props = {
  onOpenUser: (userId: string) => void;
};

type SortKey = "created_at" | "full_name" | "user_id" | "email";

const SORT_LABELS: Record<SortKey, string> = {
  created_at: "Joined",
  full_name: "Name",
  user_id: "ID",
  email: "Email",
};

const fmtMoney = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export default function UsersPage({ onOpenUser }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);

  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [university, setUniversity] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await admin.listUsers({
        page,
        per_page: perPage,
        q: q.trim() || undefined,
        role: role || undefined,
        university: university.trim() || undefined,
        sort,
        order,
      });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, q, role, university, sort, order]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  };

  const toggleRole = async (u: UserRow) => {
    setBusyId(u.user_id);
    setError(null);
    try {
      const nextRole: Role = u.role === "admin" ? "student" : "admin";
      await admin.updateUser(u.user_id, { role: nextRole });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <span className="muted">
          {total} user{total === 1 ? "" : "s"}
        </span>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name, email, or ID…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="admin">Admin</option>
        </select>
        <input
          placeholder="University…"
          value={university}
          onChange={(e) => {
            setUniversity(e.target.value);
            setPage(1);
          }}
        />
        <button
          onClick={() => {
            setPage(1);
            void load();
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <span className="spinner" />
      ) : (
        <table>
          <thead>
            <tr>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <th
                  key={key}
                  className={sort === key ? "sorted" : ""}
                  onClick={() => toggleSort(key)}
                >
                  {SORT_LABELS[key]} {sort === key ? (order === "asc" ? "▲" : "▼") : ""}
                </th>
              ))}
              <th>Uni</th>
              <th>Role</th>
              <th>Portfolio</th>
              <th>Return</th>
              <th>Holdings</th>
              <th>Trades</th>
              <th>Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td>
                  <span className="row-link" onClick={() => onOpenUser(u.user_id)}>
                    {u.full_name || u.email}
                  </span>
                </td>
                <td className="muted">{u.email}</td>
                <td className="mono">{u.user_id}</td>
                <td className="muted">{u.created_at ? u.created_at.slice(0, 10) : "—"}</td>
                <td>{u.university ?? "—"}</td>
                <td>
                  <span className={`role-badge ${u.role}`}>{u.role}</span>
                </td>
                <td>{fmtMoney(u.portfolio_value)}</td>
                <td
                  style={{
                    color: u.return_pct >= 0 ? "var(--green)" : "var(--red)",
                  }}
                >
                  {u.return_pct >= 0 ? "+" : ""}
                  {u.return_pct.toFixed(2)}%
                </td>
                <td>{u.holdings_count}</td>
                <td>{u.trade_count}</td>
                <td>{u.latest_final_score ?? "—"}</td>
                <td>
                  <button
                    disabled={busyId === u.user_id}
                    onClick={() => void toggleRole(u)}
                    title={u.role === "admin" ? "Demote to student" : "Promote to admin"}
                  >
                    {busyId === u.user_id ? "…" : u.role === "admin" ? "Demote" : "Promote"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && users.length === 0 && (
        <div className="empty">No users match the current filters.</div>
      )}

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Prev
        </button>
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
