import { useState, useEffect } from "react";
import type { RecoveryCase } from "../lib/types";
import { fetchRecoveryCases, executeCaseAction } from "../lib/api";

interface RecoveryCasesPageProps {
  onSelectCase: (caseId: string) => void;
}

export function RecoveryCasesPage({ onSelectCase }: RecoveryCasesPageProps) {
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchRecoveryCases(
        100,
        statusFilter !== "ALL" ? statusFilter : undefined,
        priorityFilter !== "ALL" ? priorityFilter : undefined
      );
      setCases(res);
    } catch (e: any) {
      setError(e.message || "Failed to load recovery cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter]);

  const handleQuickAction = async (e: React.MouseEvent, caseId: string, actionType: string) => {
    e.stopPropagation();
    try {
      setActionLoadingId(caseId);
      await executeCaseAction(caseId, actionType, `Quick action trigger: ${actionType}`);
      await loadData();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.reason?.toLowerCase().includes(q) ||
      c.customers?.name?.toLowerCase().includes(q) ||
      c.customers?.email?.toLowerCase().includes(q) ||
      c.case_type?.toLowerCase().includes(q)
    );
  });

  const totalAtRisk = filteredCases
    .filter((c) => c.status !== "RECOVERED" && c.status !== "CLOSED")
    .reduce((sum, c) => sum + Number(c.amount_at_risk || 0), 0);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Operations</div>
          <h1>Recovery Cases Queue</h1>
          <p>Active queue for managing revenue at risk, automated smart retries, and customer dunning.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: "8px", fontSize: "12px" }}>
            <span style={{ color: "#64748b" }}>Queue At Risk: </span>
            <strong style={{ color: "#dc2626" }}>₹{totalAtRisk.toLocaleString()}</strong>
          </div>
          <button className="primary-button" onClick={loadData}>↻ Refresh</button>
        </div>
      </div>

      <div className="panel">
        {/* Filter and Search Bar */}
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by customer, reason, or case type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="PROMISE_TO_PAY">PROMISE_TO_PAY</option>
            <option value="RECOVERED">RECOVERED</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="CLOSED">CLOSED</option>
          </select>

          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filteredCases.length}</strong> cases
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching recovery cases from database...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load cases</h3>
            <p>{error}</p>
            <button className="outline-button" onClick={loadData}>Try again</button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">✓</div>
            <h3>No recovery cases match your filters</h3>
            <p>Try resetting search terms or status filters to view historical cases.</p>
            <button className="outline-button" onClick={() => { setSearchTerm(""); setStatusFilter("ALL"); setPriorityFilter("ALL"); }}>
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type & Reason</th>
                  <th>Amount at Risk</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Probability</th>
                  <th>Quick Actions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onSelectCase(c.id)}>
                    <td>
                      <strong>{c.customers?.name || "Customer Account"}</strong>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{c.customers?.email}</div>
                    </td>
                    <td style={{ maxWidth: "240px" }}>
                      <span style={{ fontSize: "10px", color: "#64748b", display: "block", fontWeight: 600 }}>{c.case_type}</span>
                      <div style={{ fontSize: "11px", color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.reason}
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>₹{Number(c.amount_at_risk).toLocaleString()}</strong>
                      <span style={{ fontSize: "9px", color: "#94a3b8", display: "block" }}>{c.currency}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${c.priority === "CRITICAL" ? "danger" : c.priority === "HIGH" ? "warning" : "info"}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${c.status === "RECOVERED" ? "success" : c.status === "OPEN" ? "danger" : c.status === "PROMISE_TO_PAY" ? "purple" : "warning"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "40px", height: "5px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.round((c.recovery_probability || 0.75) * 100)}%`,
                              height: "100%",
                              background: (c.recovery_probability || 0.75) > 0.7 ? "#22c55e" : "#f59e0b",
                            }}
                          ></div>
                        </div>
                        <span style={{ fontSize: "10.5px", fontFamily: "DM Mono" }}>
                          {Math.round((c.recovery_probability || 0.75) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="outline-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          disabled={actionLoadingId === c.id}
                          onClick={(e) => handleQuickAction(e, c.id, "SEND_PAYMENT_LINK")}
                          title="Generate & send smart payment link"
                        >
                          🔗 Send Link
                        </button>
                        <button
                          className="outline-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          disabled={actionLoadingId === c.id}
                          onClick={(e) => handleQuickAction(e, c.id, "RETRY_PAYMENT")}
                          title="Trigger instant smart retry"
                        >
                          ⚡ Retry
                        </button>
                      </div>
                    </td>
                    <td>
                      <button className="dark-button" style={{ fontSize: "10px", padding: "5px 10px" }} onClick={() => onSelectCase(c.id)}>
                        Inspect 360 <span>→</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
