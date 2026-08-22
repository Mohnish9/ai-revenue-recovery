import { useState, useEffect } from "react";
import type { AuditLog } from "../lib/types";
import { fetchAllAuditLogs } from "../lib/api";

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAllAuditLogs(100, actorFilter !== "ALL" ? actorFilter : undefined);
      setLogs(res);
    } catch (e: any) {
      setError(e.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [actorFilter]);

  const filtered = logs.filter((l) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      l.event.toLowerCase().includes(q) ||
      l.actor_type.toLowerCase().includes(q) ||
      l.recovery_cases?.customers?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Insights</div>
          <h1>System & Operational Audit Trail</h1>
          <p>Immutable audit records of all autonomous AI decisions, system retry triggers, and manual staff actions.</p>
        </div>
        <button className="primary-button" onClick={loadData}>↻ Refresh</button>
      </div>

      <div className="panel">
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by event or actor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="filter-select"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          >
            <option value="ALL">All Actors</option>
            <option value="SYSTEM">SYSTEM</option>
            <option value="AGENT">AGENT (AI)</option>
            <option value="HUMAN">HUMAN</option>
            <option value="CUSTOMER">CUSTOMER</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filtered.length}</strong> audit events
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching audit logs from database...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load audit logs</h3>
            <p>{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">☷</div>
            <h3>No Audit Logs Found</h3>
            <p>No audit events match the selected criteria.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Case Reference</th>
                  <th>Customer Context</th>
                  <th>Timestamp</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong style={{ fontSize: "12px", color: "#1e293b" }}>{l.event}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          l.actor_type === "AGENT"
                            ? "purple"
                            : l.actor_type === "SYSTEM"
                            ? "info"
                            : l.actor_type === "HUMAN"
                            ? "neutral"
                            : "success"
                        }`}
                      >
                        {l.actor_type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: "DM Mono", fontSize: "11px", color: "#475569" }}>
                        {l.recovery_case_id ? `case-${l.recovery_case_id.slice(0, 8)}` : "GLOBAL"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11.5px", color: "#334155" }}>
                        {l.recovery_cases?.customers?.name || "System wide"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(l.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <button
                        className="outline-button"
                        style={{ fontSize: "10px", padding: "4px 8px" }}
                        onClick={() => setSelectedLog(l)}
                      >
                        Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Payload Inspector Modal */}
      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ width: "600px" }}>
            <div className="modal-header">
              <h2>Audit Event: {selectedLog.event}</h2>
              <button className="icon-button" onClick={() => setSelectedLog(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: "12px" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <span className="status-pill neutral">Actor: {selectedLog.actor_type}</span>
                <span className="status-pill info">{new Date(selectedLog.created_at).toLocaleString()}</span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Payload Details (JSON):</span>
              <pre
                style={{
                  background: "#0f172a",
                  color: "#f8fafc",
                  padding: "14px",
                  borderRadius: "8px",
                  overflowX: "auto",
                  fontFamily: "DM Mono",
                  fontSize: "11px",
                  lineHeight: "1.4",
                  maxHeight: "300px",
                }}
              >
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="outline-button" onClick={() => setSelectedLog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
