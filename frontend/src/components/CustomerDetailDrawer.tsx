import { useState, useEffect } from "react";
import type { CustomerOperationsOverview } from "../lib/types";
import { fetchCustomerOperations } from "../lib/api";

interface CustomerDetailDrawerProps {
  customerId: string;
  onClose: () => void;
}

export function CustomerDetailDrawer({ customerId, onClose }: CustomerDetailDrawerProps) {
  const [data, setData] = useState<CustomerOperationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "transactions" | "invoices" | "subscriptions" | "cases">("overview");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchCustomerOperations(customerId);
        setData(res);
      } catch (e: any) {
        setError(e.message || "Failed to load customer operations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customerId]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="eyebrow">Customer 360 Profile</div>
            <h2>{data?.customer ? data.customer.name : "Loading..."}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {loading && (
            <div className="loading-container">
              <div className="spinner"></div>
              <span>Loading customer payment operations...</span>
            </div>
          )}

          {error && (
            <div className="empty-state">
              <div className="empty-illustration">⚠</div>
              <h3>Error loading customer</h3>
              <p>{error}</p>
            </div>
          )}

          {data && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {/* Identity Banner */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <strong style={{ fontSize: "15px", color: "#1e293b", display: "block" }}>{data.customer.name}</strong>
                    <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "3px" }}>
                      ✉ {data.customer.email} {data.customer.phone ? `• ☎ ${data.customer.phone}` : ""}
                    </div>
                  </div>
                  <span className="status-pill neutral">{data.customer.customer_type}</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                <button
                  className={`outline-button ${tab === "overview" ? "active" : ""}`}
                  style={{ fontSize: "10.5px", padding: "5px 10px", background: tab === "overview" ? "#142732" : "#fff", color: tab === "overview" ? "#fff" : "#17232d" }}
                  onClick={() => setTab("overview")}
                >
                  Overview
                </button>
                <button
                  className={`outline-button ${tab === "cases" ? "active" : ""}`}
                  style={{ fontSize: "10.5px", padding: "5px 10px", background: tab === "cases" ? "#142732" : "#fff", color: tab === "cases" ? "#fff" : "#17232d" }}
                  onClick={() => setTab("cases")}
                >
                  Cases ({data.recoveryCases.length})
                </button>
                <button
                  className={`outline-button ${tab === "transactions" ? "active" : ""}`}
                  style={{ fontSize: "10.5px", padding: "5px 10px", background: tab === "transactions" ? "#142732" : "#fff", color: tab === "transactions" ? "#fff" : "#17232d" }}
                  onClick={() => setTab("transactions")}
                >
                  Transactions ({data.transactions.length})
                </button>
                <button
                  className={`outline-button ${tab === "invoices" ? "active" : ""}`}
                  style={{ fontSize: "10.5px", padding: "5px 10px", background: tab === "invoices" ? "#142732" : "#fff", color: tab === "invoices" ? "#fff" : "#17232d" }}
                  onClick={() => setTab("invoices")}
                >
                  Invoices ({data.invoices.length})
                </button>
              </div>

              {/* Tab Contents */}
              {tab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px" }}>
                      <span className="metric-label">Active Recovery Cases</span>
                      <strong style={{ fontSize: "20px", color: "#1e293b" }}>{data.recoveryCases.filter(c => c.status !== 'RECOVERED' && c.status !== 'CLOSED').length}</strong>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px" }}>
                      <span className="metric-label">Total Subscriptions</span>
                      <strong style={{ fontSize: "20px", color: "#1e293b" }}>{data.subscriptions.length}</strong>
                    </div>
                  </div>

                  {data.sandboxIncidents && data.sandboxIncidents.length > 0 && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <strong style={{ fontSize: "12px", color: "#166534" }}>🔒 Active Sandbox Incidents ({data.sandboxIncidents.length})</strong>
                        <span className="status-pill success" style={{ fontSize: "9.5px" }}>Autonomous Agent</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {data.sandboxIncidents.map(sb => (
                          <div key={sb.incident.id} style={{ background: "#ffffff", border: "1px solid #dcfce7", padding: "8px 10px", borderRadius: "6px", fontSize: "11px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <strong>{sb.incident.scenarioTypeName}</strong>
                              <div style={{ color: "#64748b", fontSize: "10px" }}>{sb.incident.currency || "₹"}{Number(sb.incident.amount).toLocaleString()} • {sb.incident.failureCode}</div>
                            </div>
                            <span className={`status-pill ${sb.incident.status === "RECOVERED" ? "success" : sb.incident.status === "ESCALATED_TO_HUMAN" ? "danger" : "warning"}`} style={{ fontSize: "10px" }}>
                              {sb.incident.status || "OPEN"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <strong style={{ fontSize: "12px", color: "#1e293b", display: "block", marginBottom: "8px" }}>Recent Activity</strong>
                    {data.paymentEvents.length === 0 ? (
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>No recent payment events recorded.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {data.paymentEvents.slice(0, 5).map(ev => (
                          <div key={ev.id} style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                            <span><strong>{ev.event_type}</strong> (₹{Number(ev.amount).toLocaleString()})</span>
                            <span style={{ color: "#94a3b8" }}>{new Date(ev.occurred_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "cases" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data.recoveryCases.length === 0 ? (
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>No recovery cases on file for this customer.</div>
                  ) : (
                    data.recoveryCases.map(c => (
                      <div key={c.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <strong style={{ fontSize: "12px" }}>₹{Number(c.amount_at_risk).toLocaleString()} at risk</strong>
                          <span className={`status-pill ${c.status === "RECOVERED" ? "success" : "danger"}`}>{c.status}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{c.reason}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "transactions" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data.transactions.length === 0 ? (
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>No transactions found.</div>
                  ) : (
                    data.transactions.map(tx => (
                      <div key={tx.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px", fontSize: "11.5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>₹{Number(tx.amount).toLocaleString()} • {tx.payment_method}</strong>
                          <span className={`status-pill ${tx.status === "SUCCESS" ? "success" : "danger"}`}>{tx.status}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>Ref: {tx.transaction_reference} • {new Date(tx.created_at).toLocaleDateString()}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "invoices" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data.invoices.length === 0 ? (
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>No invoices found.</div>
                  ) : (
                    data.invoices.map(inv => (
                      <div key={inv.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px", fontSize: "11.5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>{inv.invoice_number} (₹{Number(inv.amount).toLocaleString()})</strong>
                          <span className={`status-pill ${inv.status === "PAID" ? "success" : "warning"}`}>{inv.status}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>Due: {inv.due_date} {inv.promise_date ? `• Promise: ${inv.promise_date}` : ""}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button className="outline-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
