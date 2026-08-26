import { useState, useEffect } from "react";
import type { DashboardSummary, RecoveryCase, PaymentEvent } from "../lib/types";
import { fetchDashboardSummary, fetchRecoveryCases, fetchPaymentEvents } from "../lib/api";

interface DashboardProps {
  onNavigate: (page: any) => void;
  onSelectCase: (caseId: string) => void;
}

export function Dashboard({ onNavigate, onSelectCase }: DashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentCases, setRecentCases] = useState<RecoveryCase[]>([]);
  const [recentEvents, setRecentEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sumRes, casesRes, eventsRes] = await Promise.all([
        fetchDashboardSummary(),
        fetchRecoveryCases(5),
        fetchPaymentEvents(5),
      ]);
      setSummary(sumRes);
      setRecentCases(casesRes);
      setRecentEvents(eventsRes);
    } catch (e: any) {
      setError(e.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const recoveryRateFormatted = summary ? `${Math.round(summary.recoveryRate * 100)}%` : "0%";

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Revenue Recovery Command Center</h1>
          <p>Real-time autonomous intelligence for failed payments, subscriptions, and invoice recovery.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="primary-button" style={{ background: "#d6f36b", color: "#081016", fontWeight: 700 }} onClick={() => onNavigate("recovery-demo")}>
            ✨ 9-Scenario Recovery Demo
          </button>
          <button className="outline-button" onClick={() => onNavigate("scenarios")}>
            ⊞ Scenario Center
          </button>
          <button className="primary-button" onClick={() => onNavigate("agent")}>
            ✦ Launch AI Agent
          </button>
        </div>
      </div>

      {/* Onboarding / Alert Banner */}
      <div className="onboarding-banner">
        <div className="banner-icon">✦</div>
        <div className="banner-copy">
          <h2>Supabase Live Connection Verified</h2>
          <p>Connected to remote revenue operations database. Dynamic smart retry policies and AI agent active.</p>
        </div>
        <button className="dark-button" onClick={() => onNavigate("recovery")}>
          View Active Queue <span>→</span>
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading live revenue recovery metrics...</span>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-illustration">⚠</div>
          <h3>Unable to load dashboard</h3>
          <p>{error}</p>
          <button className="outline-button" onClick={loadData}>Retry</button>
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="metric-card">
              <div className="metric-icon orange">↗</div>
              <span className="metric-label">Revenue at Risk</span>
              <strong>₹{summary ? Number(summary.revenueAtRisk).toLocaleString() : "0"}</strong>
              <small>Across {summary?.openRecoveryCases || 0} active recovery queues</small>
            </div>

            <div className="metric-card">
              <div className="metric-icon blue">⚡</div>
              <span className="metric-label">Open Recovery Cases</span>
              <strong>{summary?.openRecoveryCases || 0}</strong>
              <small>Requires smart retry or dunning action</small>
            </div>

            <div
              className="metric-card"
              style={{ cursor: "pointer", border: (summary?.totalEscalated || 0) > 0 ? "1px solid #fecdd3" : undefined }}
              onClick={() => onNavigate("human-escalations")}
            >
              <div className="metric-icon" style={{ background: "#ffe4e6", color: "#e11d48" }}>👤</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="metric-label">Human Escalations</span>
                {(summary?.totalEscalated || 0) > 0 && (
                  <span style={{ fontSize: "10px", background: "#ffe4e6", color: "#e11d48", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>
                    ACTION REQUIRED
                  </span>
                )}
              </div>
              <strong style={{ color: (summary?.totalEscalated || 0) > 0 ? "#e11d48" : undefined }}>
                {summary?.totalEscalated || 0}
              </strong>
              <small>Handoff after bounded 3 AI retries →</small>
            </div>

            <div className="metric-card">
              <div className="metric-icon green">✓</div>
              <span className="metric-label">Recovered This Month</span>
              <strong>₹{summary ? Number(summary.recoveredThisMonth).toLocaleString() : "0"}</strong>
              <small>Protected from involuntary churn</small>
            </div>

            <div className="metric-card">
              <div className="metric-icon purple">✦</div>
              <span className="metric-label">Recovery Success Rate</span>
              <strong>{recoveryRateFormatted}</strong>
              <small>Out of {summary?.totalRecoveryCases || 0} total lifetime cases</small>
            </div>
          </div>

          {/* Visual Insights Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "22px" }}>
            {/* Visual Risk Breakdown */}
            <div className="panel" style={{ padding: "20px" }}>
              <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
                <div>
                  <h2>Recovery Channel Efficiency</h2>
                  <p>Dynamic execution metrics aggregated across active channels</p>
                </div>
                <span className="status-pill success">Live Database Sync</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
                {(summary?.channelEfficiency && summary.channelEfficiency.length > 0) ? (
                  summary.channelEfficiency.map((ch, idx) => {
                    const colors = ["#22c55e", "#3b82f6", "#f97316", "#8b5cf6"];
                    const color = colors[idx % colors.length];
                    const rate = ch.successRate !== null ? ch.successRate : (ch.attemptsCount > 0 ? Math.round((ch.successCount / ch.attemptsCount) * 100) : 0);
                    return (
                      <div key={ch.channel}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "5px" }}>
                          <span>{ch.label} ({ch.attemptsCount} dispatched)</span>
                          <strong>{ch.attemptsCount > 0 ? `${rate}% recovery (${ch.successCount} paid)` : "Ready for dispatch"}</strong>
                        </div>
                        <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.max(ch.attemptsCount > 0 ? rate : 0, 3)}%`, height: "100%", background: color, borderRadius: "4px", transition: "width 0.3s ease" }}></div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: "12px", color: "#64748b", padding: "12px 0" }}>
                    No channel dispatches logged in this cycle yet. Autonomous agent will update live.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Dispatch Center */}
            <div className="panel" style={{ padding: "20px" }}>
              <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
                <div>
                  <h2>Operational Actions</h2>
                  <p>Direct routes to specialized recovery workspaces</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "16px" }}>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}
                  onClick={() => onNavigate("failed-payments")}
                >
                  <strong style={{ fontSize: "12px", color: "#b91c1c" }}>⚠ Failed Payments Triage</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Inspect card declines & insufficient funds</span>
                </button>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}
                  onClick={() => onNavigate("invoices")}
                >
                  <strong style={{ fontSize: "12px", color: "#b45309" }}>📄 Overdue Invoices</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Capture payment commitments</span>
                </button>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}
                  onClick={() => onNavigate("checkout-dropoffs")}
                >
                  <strong style={{ fontSize: "12px", color: "#0369a1" }}>🛒 Checkout Drop-offs</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Re-engage abandoned orders</span>
                </button>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}
                  onClick={() => onNavigate("policy-rules")}
                >
                  <strong style={{ fontSize: "12px", color: "#7e22ce" }}>⚙ Policy Rules</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Configure automated dunning</span>
                </button>
              </div>
            </div>
          </div>

          {/* 9-Scenario Recovery Distribution Table */}
          <div className="panel" style={{ marginBottom: "22px" }}>
            <div className="panel-heading">
              <div>
                <h2>Scenario Recovery Overview</h2>
                <p>Complete status across all 9 payment and lifecycle failure archetypes</p>
              </div>
              <button className="outline-button" style={{ fontSize: "11px" }} onClick={() => onNavigate("recovery-demo")}>
                Launch Scenario Lab <span>→</span>
              </button>
            </div>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scenario Archetype</th>
                    <th>Category</th>
                    <th>Incidents</th>
                    <th>Active</th>
                    <th>Recovered</th>
                    <th>Escalated</th>
                    <th>Revenue at Risk</th>
                    <th>Recovered Revenue</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.scenarioBreakdown || []).map((sc) => (
                    <tr key={sc.key}>
                      <td>
                        <strong>{sc.name}</strong>
                      </td>
                      <td>
                        <span className="status-pill blue" style={{ fontSize: "10px" }}>{sc.category}</span>
                      </td>
                      <td>
                        <strong>{sc.incidentsCount}</strong>
                      </td>
                      <td>
                        {sc.activeCount > 0 ? (
                          <span className="status-pill warning" style={{ fontSize: "10.5px" }}>{sc.activeCount} open</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        )}
                      </td>
                      <td>
                        {sc.recoveredCount > 0 ? (
                          <span className="status-pill success" style={{ fontSize: "10.5px" }}>{sc.recoveredCount} paid</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        )}
                      </td>
                      <td>
                        {sc.escalatedCount > 0 ? (
                          <span className="status-pill danger" style={{ fontSize: "10.5px" }}>{sc.escalatedCount} escalated</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: sc.amountAtRisk > 0 ? "#b91c1c" : "#64748b" }}>
                          ₹{Number(sc.amountAtRisk).toLocaleString()}
                        </strong>
                      </td>
                      <td>
                        <strong style={{ color: sc.amountRecovered > 0 ? "#15803d" : "#64748b" }}>
                          ₹{Number(sc.amountRecovered).toLocaleString()}
                        </strong>
                      </td>
                      <td>
                        <button
                          className="table-action-button"
                          onClick={() => onNavigate("recovery")}
                        >
                          View Cases
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lower Grid: High Priority Queue & Live Events */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "16px" }}>
            {/* Priority Cases */}
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>High Priority Recovery Queue</h2>
                  <p>Cases requiring immediate operational resolution</p>
                </div>
                <button className="outline-button" style={{ fontSize: "10.5px" }} onClick={() => onNavigate("recovery")}>
                  View All ({summary?.totalRecoveryCases || 0})
                </button>
              </div>

              {recentCases.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-illustration">✓</div>
                  <h3>Queue Clean</h3>
                  <p>No open recovery cases at this moment.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCases.map((rc) => (
                        <tr key={rc.id}>
                          <td>
                            <strong>{rc.customers?.name || "Customer"}</strong>
                            <div style={{ fontSize: "10px", color: "#94a3b8" }}>{rc.customers?.email}</div>
                          </td>
                          <td>
                            <strong>₹{Number(rc.amount_at_risk).toLocaleString()}</strong>
                          </td>
                          <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rc.reason}
                          </td>
                          <td>
                            <span className={`status-pill ${rc.status === "RECOVERED" ? "success" : rc.status === "OPEN" ? "danger" : "warning"}`}>
                              {rc.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="dark-button"
                              style={{ fontSize: "10px", padding: "5px 10px" }}
                              onClick={() => onSelectCase(rc.id)}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Live Payment Stream */}
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Live Payment Events</h2>
                  <p>Real-time events from payment gateway</p>
                </div>
              </div>
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {recentEvents.length === 0 ? (
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>No recent events recorded.</div>
                ) : (
                  recentEvents.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        background: "#f8fafc",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "11.5px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <strong style={{ color: "#1e293b" }}>{ev.event_type}</strong>
                        <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                          {new Date(ev.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div style={{ color: "#64748b", fontSize: "10.5px" }}>
                        Customer: {ev.customers?.name || "User"} • ₹{Number(ev.amount).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
