import React, { useState, useEffect } from "react";
import type { RecoveryCase, SandboxIncidentResponse } from "../lib/types";
import {
  fetchRecoveryCases,
  executeCaseAction,
  fetchSandboxIncidentsApi,
  triggerScheduledAttemptNowApi,
  cancelScheduledRecoveryApi,
} from "../lib/api";
import { CustomerPaymentModal } from "../components/CustomerPaymentModal";

interface RecoveryCasesPageProps {
  onSelectCase: (caseId: string) => void;
  onNavigateToAgent?: (incidentId?: string) => void;
}

export function RecoveryCasesPage({ onSelectCase, onNavigateToAgent }: RecoveryCasesPageProps) {
  // Production cases state
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [loadingCases, setLoadingCases] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Autonomous Sandbox Incidents queue
  const [sandboxIncidents, setSandboxIncidents] = useState<SandboxIncidentResponse[]>([]);
  const [resolvingIncident, setResolvingIncident] = useState<SandboxIncidentResponse | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Live timer tick state (forces re-render every second)
  const [, setTick] = useState<number>(Date.now());

  const loadData = async () => {
    try {
      setLoadingCases(true);
      setError(null);
      const [resCases, resSandbox] = await Promise.all([
        fetchRecoveryCases(
          100,
          statusFilter !== "ALL" ? statusFilter : undefined,
          priorityFilter !== "ALL" ? priorityFilter : undefined
        ).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setCases(resCases);
      setSandboxIncidents(resSandbox);
    } catch (e: any) {
      setError(e.message || "Failed to load recovery cases");
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter]);

  // Periodic polling for sandbox state & 1-second countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 1000);

    // Refresh sandbox incidents every 5 seconds to sync AI background executions
    const poller = setInterval(async () => {
      try {
        const res = await fetchSandboxIncidentsApi();
        setSandboxIncidents(res);
      } catch (e) {
        // Non-blocking
      }
    }, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(poller);
    };
  }, []);

  const handleTriggerNow = async (incidentId: string) => {
    try {
      setTriggeringId(incidentId);
      const updated = await triggerScheduledAttemptNowApi(incidentId);
      setSandboxIncidents((prev) =>
        prev.map((item) => (item.incident.id === incidentId ? updated : item))
      );
    } catch (err: any) {
      alert(`Trigger failed: ${err.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleCancelRecovery = async (incidentId: string) => {
    if (!confirm("Cancel autonomous recovery for this incident?")) return;
    try {
      const updated = await cancelScheduledRecoveryApi(incidentId, "Operator cancelled from Cases view");
      setSandboxIncidents((prev) =>
        prev.map((item) => (item.incident.id === incidentId ? updated : item))
      );
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  };

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

  // Helper to format countdown timer
  const formatCountdown = (targetTimeMs?: number) => {
    if (!targetTimeMs) return null;
    const diff = targetTimeMs - Date.now();
    if (diff <= 0) return "00:00 (Executing...)";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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
    <div className="page" style={{ maxWidth: "1500px", margin: "0 auto", paddingBottom: "80px" }}>
      {/* Customer Self-Serve Resolution Modal */}
      {resolvingIncident && (
        <CustomerPaymentModal
          incident={resolvingIncident}
          onClose={() => setResolvingIncident(null)}
          onResolved={(updated) => {
            setSandboxIncidents((prev) =>
              prev.map((item) => (item.incident.id === updated.incident.id ? updated : item))
            );
          }}
        />
      )}

      {/* Header */}
      <div className="page-heading" style={{ marginBottom: "24px" }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>RECOVERY OPERATIONS</span>
            <span className="status-pill purple" style={{ fontSize: "10px", padding: "2px 8px" }}>
              ⚡ LIVE CADENCE & COUNTDOWN
            </span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#0f172a" }}>
            Recovery Cases & Live Autonomous Queue
          </h1>
          <p style={{ color: "#64748b", fontSize: "13.5px", marginTop: "4px", maxWidth: "880px" }}>
            Real-time tracking of autonomous recovery workflows, scheduled outreach countdown timers, AI strategy decisions, and unified customer recovery cases.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="btn btn-secondary" onClick={loadData}>
            ↻ Refresh All Queues
          </button>
        </div>
      </div>

      {/* SECTION 1: LIVE AUTONOMOUS RECOVERY QUEUE (With Live Countdown Timers) */}
      <div style={{ marginBottom: "36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              ⚡ Autonomous Recovery Queue (Active Incidents)
            </h2>
            <span className="status-pill purple" style={{ fontSize: "11px", fontWeight: 700 }}>
              {sandboxIncidents.length} Live Incidents
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            Cadence: <strong>T+2m / T+5m / T+5m</strong> • Max 3 Bounded Attempts
          </span>
        </div>

        {sandboxIncidents.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px dashed #cbd5e1",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚡</div>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#334155", margin: "0 0 6px" }}>
              No Active Autonomous Incidents Running
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
              Go to <strong>Recovery Demo</strong> to create a new problem and launch the autonomous workflow.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {sandboxIncidents.map((sb) => {
              const targetTime = sb.scheduledRecovery?.scheduledFor
                ? new Date(sb.scheduledRecovery.scheduledFor).getTime()
                : sb.scheduler?.nextAttemptAt
                ? new Date(sb.scheduler.nextAttemptAt).getTime()
                : (sb as any).scheduledRecovery?.targetExecutionTime || 0;
              const schedStatus = sb.scheduledRecovery?.status || sb.scheduler?.status || "SCHEDULED";
              const nextAttemptNum = sb.scheduledRecovery?.attemptNumber || sb.scheduler?.nextAttemptNumber || (sb.actions?.length ? sb.actions.length + 1 : 1);
              const hasTimer = Boolean(targetTime && schedStatus === "SCHEDULED" && sb.incident.status !== "RECOVERED" && sb.incident.status !== "ESCALATED_TO_HUMAN" && sb.incident.status !== "CANCELLED");
              const countdownStr = formatCountdown(targetTime);
              const isRecovered = sb.incident.status === "RECOVERED";
              const isEscalated =
                sb.incident.status === "ESCALATED" ||
                sb.incident.status === "ESCALATED_TO_HUMAN" ||
                schedStatus === "ESCALATED_TO_HUMAN";
              const phoneVal = (sb.customer as any).phone || sb.incident.customer_phone;
              const executedActions = (sb.actions || []).slice().sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));

              return (
                <div
                  key={sb.incident.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    borderLeft: `5px solid ${isRecovered ? "#16a34a" : isEscalated ? "#dc2626" : "#4f46e5"}`,
                    padding: "20px 24px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.3fr 0.9fr 1.8fr 1fr",
                      gap: "20px",
                      alignItems: "start",
                    }}
                  >
                    {/* Col 1: Problem & Customer */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", fontFamily: "DM Mono", color: "#64748b", fontWeight: 700 }}>
                          {sb.incident.id}
                        </span>
                        <span
                          className={`status-pill ${
                            isRecovered ? "success" : isEscalated ? "danger" : "purple"
                          }`}
                          style={{ fontSize: "10px" }}
                        >
                          {sb.incident.status || "ACTIVE"}
                        </span>
                      </div>
                      <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
                        {sb.incident.scenarioTypeName}
                      </h3>
                      <div style={{ fontSize: "12.5px", color: "#334155", fontWeight: 600 }}>
                        {sb.customer.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        {sb.customer.email} {phoneVal ? `• 📞 ${phoneVal}` : ""}
                      </div>
                    </div>

                    {/* Col 2: Financial Amount & Disruption */}
                    <div>
                      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>AMOUNT AT RISK</div>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                        {sb.incident.currency} {sb.incident.amount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: "11px", color: "#b91c1c", fontWeight: 600, marginTop: "2px", fontFamily: "DM Mono" }}>
                        {sb.incident.failureCode}
                      </div>
                      <div style={{ fontSize: "10.5px", color: "#64748b" }}>{sb.incident.paymentMethod}</div>
                    </div>

                    {/* Col 3: REAL EXECUTION TRACE & Countdown */}
                    <div
                      style={{
                        background: isRecovered ? "#f0fdf4" : isEscalated ? "#fef2f2" : "#f8fafc",
                        borderRadius: "10px",
                        border: `1px solid ${isRecovered ? "#bbf7d0" : isEscalated ? "#fecaca" : "#e2e8f0"}`,
                        padding: "12px 16px",
                      }}
                    >
                      {isRecovered ? (
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
                            ✓ 100% RECOVERED & SETTLED
                          </div>
                          <div style={{ fontSize: "12px", color: "#14532d", marginTop: "2px" }}>
                            Payment resolved successfully. Autonomous recovery closed.
                          </div>
                        </div>
                      ) : isEscalated ? (
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>
                            🚨 ESCALATED TO HUMAN OPS
                          </div>
                          <div style={{ fontSize: "12px", color: "#7f1d1d", marginTop: "2px" }}>
                            All 3 autonomous attempts completed without payment. Full VIP dossier generated.
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, color: "#4f46e5", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                              {hasTimer ? "NEXT RECOVERY ACTION COUNTDOWN" : "AUTONOMOUS RECOVERY STATUS"}
                            </span>
                            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b" }}>
                              {executedActions.length} of 3 Attempts Completed
                            </span>
                          </div>

                          {hasTimer && (
                            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "4px", marginBottom: "8px" }}>
                              <div
                                style={{
                                  fontSize: "22px",
                                  fontWeight: 900,
                                  fontFamily: "DM Mono",
                                  color: "#4f46e5",
                                  letterSpacing: "-0.5px",
                                }}
                              >
                                ⏱ {countdownStr}
                              </div>
                              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                                (Attempt #{nextAttemptNum} scheduled)
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Real Attempts Breakdown */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                        {[1, 2, 3].map((num) => {
                          const act = executedActions.find((a) => a.attemptNumber === num);
                          const isExecuting = triggeringId === sb.incident.id && num === nextAttemptNum;

                          // Only reveal channel if executed or currently executing
                          let channelLabel: string | null = null;
                          if (act) {
                            const rawCh = (act.selectedChannel || act.aiChannel || (num === 2 ? "CALL" : "EMAIL")).toUpperCase();
                            channelLabel = rawCh === "VOICE" || rawCh === "CALL" || rawCh.includes("VOICE") || rawCh.includes("CALL") ? "CALL" : "EMAIL";
                          } else if (isExecuting) {
                            channelLabel = num === 2 ? "CALL" : "EMAIL";
                          }

                          let statusText = "—";
                          if (isExecuting) {
                            statusText = "PROCESSING";
                          } else if (act) {
                            const primaryDisp = act?.channelDispatches?.[0];
                            const isRealSuccess =
                              (primaryDisp?.deliveryMode === "REAL" || act.deliveryMode === "REAL") &&
                              (primaryDisp?.status === "SENT" || primaryDisp?.status === "DELIVERED" || act.providerStatus === "SENT" || act.status === "EXECUTED");
                            
                            if (isRealSuccess) {
                              statusText = channelLabel === "CALL" ? "COMPLETED" : "SENT";
                            } else {
                              statusText = "FAILED";
                            }
                          }

                          return (
                            <div
                              key={num}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: act
                                  ? statusText === "FAILED"
                                    ? "#fef2f2"
                                    : "#f0fdf4"
                                  : isExecuting
                                  ? "#eef2ff"
                                  : "#f8fafc",
                                border: `1px solid ${
                                  act
                                    ? statusText === "FAILED"
                                      ? "#fecaca"
                                      : "#bbf7d0"
                                    : isExecuting
                                    ? "#c7d2fe"
                                    : "#e2e8f0"
                                }`,
                                fontSize: "11px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ color: "#334155" }}>Attempt #{num}:</strong>
                                {channelLabel ? (
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      color: statusText === "FAILED" ? "#991b1b" : isExecuting ? "#4f46e5" : "#166534",
                                    }}
                                  >
                                    {channelLabel}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                                    NOT EXECUTED
                                  </span>
                                )}
                              </div>

                              <div>
                                {isExecuting ? (
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 800,
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      background: "#4f46e5",
                                      color: "#ffffff",
                                      letterSpacing: "0.4px",
                                    }}
                                  >
                                    PROCESSING
                                  </span>
                                ) : act ? (
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 800,
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      background: statusText === "FAILED" ? "#dc2626" : "#16a34a",
                                      color: "#ffffff",
                                      letterSpacing: "0.4px",
                                    }}
                                  >
                                    {statusText}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Latest Attempt Provider Details if executed */}
                      {executedActions.length > 0 && (
                        <div style={{ marginTop: "8px", fontSize: "10.5px", color: "#475569", background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          <strong>Latest Dispatch Feedback:</strong>{" "}
                          {executedActions[executedActions.length - 1].details || executedActions[executedActions.length - 1].reason}
                        </div>
                      )}
                    </div>

                    {/* Col 4: Action Controls */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "stretch" }}>
                      {!isRecovered && !isEscalated && (
                        <>
                          <button
                            onClick={() => handleTriggerNow(sb.incident.id)}
                            disabled={triggeringId === sb.incident.id}
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: "11.5px",
                              fontWeight: 700,
                              padding: "7px 10px",
                              background: "#4f46e5",
                              color: "#ffffff",
                              border: "none",
                              boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)",
                            }}
                            title="Run the next scheduled attempt immediately with live AI evaluation"
                          >
                            {triggeringId === sb.incident.id ? "Executing AI Attempt..." : `⚡ Run Attempt #${nextAttemptNum} Now`}
                          </button>

                          <button
                            onClick={() => setResolvingIncident(sb)}
                            className="btn btn-outline btn-sm"
                            style={{
                              fontWeight: 600,
                              fontSize: "11px",
                              padding: "6px 10px",
                            }}
                          >
                            🔗 Customer Payment Link
                          </button>

                          <button
                            onClick={() => handleCancelRecovery(sb.incident.id)}
                            className="btn btn-sm"
                            style={{
                              fontSize: "10.5px",
                              padding: "3px 8px",
                              color: "#64748b",
                              background: "transparent",
                              border: "none",
                              textAlign: "center",
                            }}
                          >
                            ✕ Cancel Workflow
                          </button>
                        </>
                      )}

                      {isRecovered && (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "8px",
                            background: "#dcfce7",
                            color: "#166534",
                            borderRadius: "6px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                          }}
                        >
                          ✓ Reconciled
                        </div>
                      )}

                      {isEscalated && (
                        <button
                          onClick={() => setResolvingIncident(sb)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "11px", padding: "6px 10px", fontWeight: 600 }}
                        >
                          🔗 Customer Portal Link
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: PRODUCTION RECOVERY CASES DATABASE */}
      <div className="panel" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Production Database Recovery Cases ({filteredCases.length})
            </h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
              Permanent Supabase records with customer dunning history and multi-channel audit logs.
            </p>
          </div>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "6px 12px", borderRadius: "8px", fontSize: "12px" }}>
            <span style={{ color: "#64748b" }}>Queue At Risk: </span>
            <strong style={{ color: "#dc2626" }}>₹{totalAtRisk.toLocaleString()}</strong>
          </div>
        </div>

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
        {loadingCases ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching recovery cases from database...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load cases</h3>
            <p>{error}</p>
            <button className="outline-button" onClick={loadData}>
              Try again
            </button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">✓</div>
            <h3>No recovery cases match your filters</h3>
            <p>Try resetting search terms or status filters to view historical cases.</p>
            <button
              className="outline-button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("ALL");
                setPriorityFilter("ALL");
              }}
            >
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
                      <span style={{ fontSize: "10px", color: "#64748b", display: "block", fontWeight: 600 }}>
                        {c.case_type}
                      </span>
                      <div style={{ fontSize: "11px", color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.reason}
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                        ₹{Number(c.amount_at_risk).toLocaleString()}
                      </strong>
                      <span style={{ fontSize: "9px", color: "#94a3b8", display: "block" }}>{c.currency}</span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          c.priority === "CRITICAL" ? "danger" : c.priority === "HIGH" ? "warning" : "info"
                        }`}
                      >
                        {c.priority}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          c.status === "RECOVERED"
                            ? "success"
                            : c.status === "OPEN"
                            ? "danger"
                            : c.status === "PROMISE_TO_PAY"
                            ? "purple"
                            : "warning"
                        }`}
                      >
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
                          🔗 Link
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
