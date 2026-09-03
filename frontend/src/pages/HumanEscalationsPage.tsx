import React, { useState, useEffect } from "react";
import type { PageKey, HumanEscalationItem, HumanEscalationsSummaryResponse } from "../lib/types";
import { useAuth } from "../lib/authContext";
import {
  fetchHumanEscalationsApi,
  resolveHumanEscalationApi,
  takeOwnershipOfHumanEscalationApi,
  addNoteToHumanEscalationApi,
  createAndAnalyzeSandboxIncidentApi,
} from "../lib/api";

interface HumanEscalationsPageProps {
  onNavigate?: (page: PageKey, caseId?: string) => void;
  onSelectCase?: (caseId: string) => void;
}

export function HumanEscalationsPage({ onNavigate, onSelectCase }: HumanEscalationsPageProps) {
  const { user } = useAuth();
  const defaultOperatorName = user?.name || "Revenue Specialist";
  const [data, setData] = useState<HumanEscalationsSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Inspection dossier modal state
  const [selectedEscalation, setSelectedEscalation] = useState<HumanEscalationItem | null>(null);
  const [dossierTab, setDossierTab] = useState<"OVERVIEW" | "ATTEMPTS" | "TIMELINE" | "COMMUNICATION">("OVERVIEW");

  // Take Ownership modal state
  const [claimingItem, setClaimingItem] = useState<HumanEscalationItem | null>(null);
  const [claimOperatorName, setClaimOperatorName] = useState<string>(defaultOperatorName);
  const [submittingClaim, setSubmittingClaim] = useState<boolean>(false);

  // Add Note modal state
  const [notingItem, setNotingItem] = useState<HumanEscalationItem | null>(null);
  const [noteContent, setNoteContent] = useState<string>("");
  const [noteAuthor, setNoteAuthor] = useState<string>(defaultOperatorName);
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);

  // Resolve modal state
  const [resolvingItem, setResolvingItem] = useState<HumanEscalationItem | null>(null);
  const [resolutionType, setResolutionType] = useState<string>("VIP_PHONE_SETTLEMENT");
  const [operatorNotes, setOperatorNotes] = useState<string>("");
  const [settlementAmount, setSettlementAmount] = useState<string>("");
  const [operatorName, setOperatorName] = useState<string>(defaultOperatorName);
  const [submittingResolution, setSubmittingResolution] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) {
      setClaimOperatorName(user.name);
      setNoteAuthor(user.name);
      setOperatorName(user.name);
    }
  }, [user?.name]);

  // Simulation loader
  const [simulating, setSimulating] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchHumanEscalationsApi();
      setData(res);
      if (selectedEscalation) {
        const found = res.escalations.find((e) => e.incidentId === selectedEscalation.incidentId);
        if (found) setSelectedEscalation(found);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load human escalations queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const res = await fetchHumanEscalationsApi();
        setData(res);
      } catch (e) {
        // Non-blocking
      }
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenResolveModal = (item: HumanEscalationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setResolvingItem(item);
    setSettlementAmount(item.amountAtRisk.toString());
    setOperatorNotes(`Spoke directly with customer ${item.customerName}. Settled outstanding amount via priority recovery channel.`);
  };

  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingItem) return;
    try {
      setSubmittingResolution(true);
      await resolveHumanEscalationApi(resolvingItem.incidentId, {
        resolutionType,
        notes: operatorNotes,
        settlementAmount: settlementAmount ? Number(settlementAmount) : resolvingItem.amountAtRisk,
        operatorName,
      });
      setActionNotice(`✓ Incident ${resolvingItem.incidentId} successfully marked as RESOLVED by ${operatorName}.`);
      setResolvingItem(null);
      if (selectedEscalation?.incidentId === resolvingItem.incidentId) {
        setSelectedEscalation(null);
      }
      await loadData();
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      alert(`Resolution failed: ${err.message}`);
    } finally {
      setSubmittingResolution(false);
    }
  };

  const handleClaimOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimingItem) return;
    try {
      setSubmittingClaim(true);
      await takeOwnershipOfHumanEscalationApi(claimingItem.incidentId, claimOperatorName);
      setActionNotice(`✓ Case ${claimingItem.incidentId} assigned to ${claimOperatorName}.`);
      setClaimingItem(null);
      if (selectedEscalation?.incidentId === claimingItem.incidentId) {
        setSelectedEscalation((prev) => prev ? { ...prev, owner: claimOperatorName } : null);
      }
      await loadData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Failed to claim ownership: ${err.message}`);
    } finally {
      setSubmittingClaim(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notingItem || !noteContent.trim()) return;
    try {
      setSubmittingNote(true);
      await addNoteToHumanEscalationApi(notingItem.incidentId, {
        note: noteContent.trim(),
        operatorName: noteAuthor,
      });
      setActionNotice(`✓ Note recorded by ${noteAuthor} for ${notingItem.incidentId}.`);
      setNotingItem(null);
      setNoteContent("");
      await loadData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Failed to add note: ${err.message}`);
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleSimulateNewEscalation = async () => {
    try {
      setSimulating(true);
      const randomScenarios = ["insufficient-funds", "expired-card", "3ds-failure", "gateway-timeout"];
      const chosenScenario = randomScenarios[Math.floor(Math.random() * randomScenarios.length)];
      await createAndAnalyzeSandboxIncidentApi({
        scenarioTypeKey: chosenScenario,
        customerCustom: {
          name: "Rohan Varma (Head of Tech, Zenith)",
          email: "rohan.v@zenith.io",
          customer_type: "VIP",
        },
        amount: Math.floor(Math.random() * 45000) + 12000,
        currency: "INR",
      });
      setActionNotice("✓ New recovery incident generated and queued for autonomous cadence.");
      await loadData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const escalations = data?.escalations || [];

  const filtered = escalations.filter((item) => {
    const term = search.toLowerCase();
    const matchesSearch =
      !term ||
      item.customerName.toLowerCase().includes(term) ||
      item.customerEmail.toLowerCase().includes(term) ||
      item.customerPhone.includes(term) ||
      item.incidentId.toLowerCase().includes(term) ||
      item.scenarioTypeName.toLowerCase().includes(term) ||
      item.escalationReason.toLowerCase().includes(term) ||
      (item.owner && item.owner.toLowerCase().includes(term)) ||
      (item.priority && item.priority.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === "ALL"
        ? true
        : statusFilter === "OPEN"
        ? item.status === "ESCALATED_TO_HUMAN" || item.status === "ESCALATED"
        : item.status === "RESOLVED" || item.status === "RECOVERED";

    const matchesPriority =
      priorityFilter === "ALL"
        ? true
        : item.priority?.toUpperCase() === priorityFilter.toUpperCase();

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const openCases = escalations.filter(
    (e) => e.status === "ESCALATED_TO_HUMAN" || e.status === "ESCALATED"
  );
  const resolvedCases = escalations.filter(
    (e) => e.status === "RESOLVED" || e.status === "RECOVERED"
  );

  const openCount = data?.openCount ?? openCases.length;
  const resolvedCount = data?.resolvedCount ?? resolvedCases.length;
  const totalCount = data?.totalEscalated ?? escalations.length;
  const totalAmountAtRisk =
    data?.amountAtRisk ??
    openCases.reduce((sum, e) => sum + (Number(e.amountAtRisk) || 0), 0);

  return (
    <div className="page" id="human-escalations-page" style={{ maxWidth: "1500px", margin: "0 auto", paddingBottom: "80px" }}>
      {/* Action Notification Toast */}
      {actionNotice && (
        <div
          style={{
            background: "#dcfce7",
            border: "1px solid #86efac",
            color: "#166534",
            padding: "12px 18px",
            borderRadius: "8px",
            marginBottom: "18px",
            fontSize: "12.5px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 5px rgba(0,0,0,0.04)",
          }}
        >
          <span>{actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: "transparent", color: "#166534", fontSize: "14px", fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Heading */}
      <div className="page-heading" style={{ marginBottom: "24px" }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>HUMAN ESCALATION OPERATIONS</span>
            <span className="status-pill danger" style={{ fontSize: "10px", padding: "2px 8px" }}>
              🛡️ 3-ATTEMPT SAFETY BOUNDARY
            </span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#0f172a" }}>
            Human Escalations Queue
          </h1>
          <p style={{ color: "#64748b", fontSize: "13.5px", marginTop: "4px", maxWidth: "880px" }}>
            High-touch intervention queue for payment failures that exhausted automated AI recovery attempts or require VIP operator settlement.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            className="outline-button"
            id="refresh-escalations-btn"
            onClick={loadData}
            disabled={loading}
          >
            ↻ {loading ? "Refreshing..." : "Refresh Queue"}
          </button>
          <button
            className="primary-button"
            id="simulate-escalation-btn"
            onClick={handleSimulateNewEscalation}
            disabled={simulating}
          >
            ⚡ {simulating ? "Simulating..." : "+ New Test Incident"}
          </button>
          {onNavigate && (
            <button
              className="outline-button"
              id="goto-recovery-cases-btn"
              onClick={() => onNavigate("recovery")}
            >
              Recovery Cases →
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="metrics-grid" style={{ marginBottom: "24px" }} id="escalations-kpi-grid">
        {/* KPI 1: Open Escalations */}
        <div className="metric-card" id="kpi-open-escalations" style={{ borderLeft: "4px solid #ef4444" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="metric-label">Open Escalations</span>
            <div className="metric-icon orange" style={{ margin: 0 }}>⚠️</div>
          </div>
          <strong style={{ color: openCount > 0 ? "#b91c1c" : "#172a34" }}>{openCount}</strong>
          <small style={{ color: "#ef4444", fontWeight: 600 }}>Requires Operator Outreach</small>
        </div>

        {/* KPI 2: Amount at Risk */}
        <div className="metric-card" id="kpi-escalated-exposure" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="metric-label">Amount at Risk</span>
            <div className="metric-icon purple" style={{ margin: 0 }}>₹</div>
          </div>
          <strong style={{ color: "#b45309" }}>₹{totalAmountAtRisk.toLocaleString()}</strong>
          <small style={{ color: "#78716c" }}>Unsettled exposure in queue</small>
        </div>

        {/* KPI 3: Resolved by Human */}
        <div className="metric-card" id="kpi-resolved-escalations" style={{ borderLeft: "4px solid #10b981" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="metric-label">Resolved by Human</span>
            <div className="metric-icon green" style={{ margin: 0 }}>✓</div>
          </div>
          <strong style={{ color: "#15803d" }}>{resolvedCount}</strong>
          <small style={{ color: "#16a34a", fontWeight: 600 }}>Settled via phone / direct link</small>
        </div>

        {/* KPI 4: Total Escalations */}
        <div className="metric-card" id="kpi-total-escalations" style={{ borderLeft: "4px solid #3b82f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="metric-label">Total Escalations</span>
            <div className="metric-icon blue" style={{ margin: 0 }}>📋</div>
          </div>
          <strong>{totalCount}</strong>
          <small style={{ color: "#64748b" }}>Bounded lifecycle lifetime</small>
        </div>
      </div>

      {/* Safety Boundary Policy Banner */}
      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #fef3c7",
          borderRadius: "10px",
          padding: "16px 20px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            background: "#fef3c7",
            color: "#b45309",
            display: "grid",
            placeItems: "center",
            fontSize: "18px",
            flexShrink: 0,
          }}
        >
          🛡️
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: "0 0 4px", fontSize: "13.5px", fontWeight: 700, color: "#92400e" }}>
            Autonomous Safety Boundary: Strict 3-Attempt Maximum
          </h4>
          <p style={{ margin: 0, fontSize: "12px", color: "#78350f", lineHeight: "18px" }}>
            To safeguard customer experience and prevent brand fatigue, Recoverly caps automated outreach at <strong>3 bounded attempts</strong> (T+0s → T+2m → T+5m). Once exhausted, cases transition immediately to this queue with full forensic diagnostics for direct account director or specialist intervention.
          </p>
        </div>
      </div>

      {/* Main Panel & Table */}
      <div className="panel">
        {/* Filter Bar */}
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by customer, phone, failure code, or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "320px" }}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses ({escalations.length})</option>
            <option value="OPEN">Open Escalations ({openCount})</option>
            <option value="RESOLVED">Resolved by Human ({resolvedCount})</option>
          </select>

          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
            Showing <strong>{filtered.length}</strong> of <strong>{escalations.length}</strong> escalations
          </div>
        </div>

        {/* Loading / Error / Empty / Table */}
        {loading && escalations.length === 0 ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Loading human escalations queue...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load escalations</h3>
            <p>{error}</p>
            <button className="primary-button" onClick={loadData}>
              Retry Connection
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">🎉</div>
            <h3>No Escalations Match Your Filters</h3>
            <p>
              {search || statusFilter !== "ALL" || priorityFilter !== "ALL"
                ? "Try clearing your search or filter parameters to view all cases."
                : "All payment incidents are currently running inside automated recovery or have been settled."}
            </p>
            <button
              className="primary-button"
              onClick={handleSimulateNewEscalation}
              disabled={simulating}
            >
              + Create Simulated Escalation Case
            </button>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "240px" }}>Customer & Account</th>
                  <th style={{ width: "220px" }}>Scenario & Root Cause</th>
                  <th style={{ width: "120px" }}>Amount</th>
                  <th style={{ width: "220px" }}>Attempts & Channels</th>
                  <th style={{ width: "200px" }}>Escalation Reason</th>
                  <th style={{ width: "140px" }}>Owner</th>
                  <th style={{ width: "120px" }}>Status</th>
                  <th style={{ width: "220px", textAlign: "right" }}>Operator Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isOpen = item.status === "ESCALATED_TO_HUMAN" || item.status === "ESCALATED";
                  const isResolved = item.status === "RESOLVED" || item.status === "RECOVERED";
                  const formattedTime = new Date(item.escalatedAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr
                      key={item.id}
                      style={{
                        background: isOpen ? "#ffffff" : "#fcfdfd",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onClick={() => setSelectedEscalation(item)}
                    >
                      {/* Customer & Account */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <strong style={{ color: "#0f172a", fontSize: "12.5px" }}>{item.customerName}</strong>
                            {item.customerType && (
                              <span
                                className={`status-pill ${item.customerType === "ENTERPRISE" ? "purple" : item.customerType === "VIP" ? "warning" : "neutral"}`}
                                style={{ fontSize: "9px", padding: "1px 5px" }}
                              >
                                {item.customerType}
                              </span>
                            )}
                          </div>
                          <span style={{ color: "#64748b", fontSize: "11px" }}>{item.customerEmail}</span>
                          <span style={{ color: "#475569", fontSize: "10.5px", fontFamily: "monospace" }}>
                            📞 {item.customerPhone || "N/A"}
                          </span>
                        </div>
                      </td>

                      {/* Scenario & Root Cause */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "12px" }}>
                            {item.scenarioTypeName || item.scenarioType}
                          </span>
                          <span style={{ color: "#dc2626", fontSize: "10.5px", fontWeight: 600 }}>
                            {item.failureReason || item.rootCause || "Payment Authorization Declined"}
                          </span>
                        </div>
                      </td>

                      {/* Amount at Risk */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "14px", color: isOpen ? "#b91c1c" : "#15803d" }}>
                            ₹{Number(item.amountAtRisk || 0).toLocaleString()}
                          </strong>
                          <span style={{ fontSize: "10px", color: "#64748b" }}>{item.currency || "INR"}</span>
                        </div>
                      </td>

                      {/* Attempts & Channels */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {item.attempts && item.attempts.length > 0 ? (
                              item.attempts.map((att, idx) => (
                                <span
                                  key={idx}
                                  className={`status-pill ${att.status === "FAILED" ? "danger" : "info"}`}
                                  style={{ fontSize: "9.5px", padding: "1px 6px" }}
                                  title={`${att.actionTitle} via ${att.channel} - ${att.providerErrorCode || att.status}`}
                                >
                                  #{att.attemptNumber} {att.channel === "WHATSAPP" ? "💬" : att.channel === "SMS" ? "📱" : att.channel === "VOICE" ? "📞" : "💳"} {att.channel}
                                </span>
                              ))
                            ) : (
                              <span className="status-pill danger" style={{ fontSize: "9.5px" }}>
                                3/3 Bounded Attempts
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "10px", color: "#64748b" }}>
                            Last: <strong>{item.lastProviderResult || "UNRESPONSIVE"}</strong>
                          </span>
                        </div>
                      </td>

                      {/* Escalation Reason */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "11px", color: "#334155", lineHeight: "15px" }}>
                            {item.escalationReason}
                          </span>
                          <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>
                            {formattedTime}
                          </span>
                        </div>
                      </td>

                      {/* Owner */}
                      <td>
                        {item.owner ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span className="status-pill purple" style={{ fontSize: "10px" }}>
                              👤 {item.owner}
                            </span>
                          </div>
                        ) : (
                          <span className="status-pill neutral" style={{ fontSize: "10px", color: "#94a3b8" }}>
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {isOpen ? (
                          <span className="status-pill danger" style={{ fontSize: "10px", fontWeight: 700 }}>
                            ⚠️ OPEN
                          </span>
                        ) : (
                          <span className="status-pill success" style={{ fontSize: "10px", fontWeight: 700 }}>
                            ✓ RESOLVED
                          </span>
                        )}
                      </td>

                      {/* Operator Actions */}
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                          <button
                            className="outline-button"
                            style={{ padding: "5px 9px", fontSize: "10.5px" }}
                            onClick={() => setSelectedEscalation(item)}
                            title="Inspect complete case dossier"
                          >
                            🔍 Inspect
                          </button>

                          {isOpen && !item.owner && (
                            <button
                              className="dark-button"
                              style={{ padding: "5px 9px", fontSize: "10.5px" }}
                              onClick={() => setClaimingItem(item)}
                              title="Claim case ownership"
                            >
                              Claim
                            </button>
                          )}

                          <button
                            className="outline-button"
                            style={{ padding: "5px 9px", fontSize: "10.5px" }}
                            onClick={() => {
                              setNotingItem(item);
                              setNoteContent("");
                            }}
                            title="Add operator note"
                          >
                            📝 Note
                          </button>

                          {isOpen && (
                            <button
                              className="primary-button"
                              style={{ padding: "5px 10px", fontSize: "10.5px" }}
                              onClick={(e) => handleOpenResolveModal(item, e)}
                              title="Mark incident resolved"
                            >
                              ✓ Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SLIDE-OVER INSPECTION DOSSIER DRAWER */}
      {selectedEscalation && (
        <div className="drawer-backdrop" onClick={() => setSelectedEscalation(null)}>
          <div className="drawer" style={{ width: "680px" }} onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="drawer-header" style={{ background: "#10212b", color: "#ffffff" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="status-pill danger" style={{ fontSize: "10px" }}>
                    {selectedEscalation.status}
                  </span>
                  <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>
                    ID: {selectedEscalation.incidentId}
                  </span>
                </div>
                <h2 style={{ color: "#ffffff", marginTop: "4px", fontSize: "17px" }}>
                  {selectedEscalation.customerName}
                </h2>
              </div>
              <button
                onClick={() => setSelectedEscalation(null)}
                style={{ background: "transparent", color: "#94a3b8", fontSize: "20px", fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            {/* Dossier Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: "0 22px",
              }}
            >
              <button
                onClick={() => setDossierTab("OVERVIEW")}
                style={{
                  padding: "12px 16px",
                  fontSize: "12px",
                  fontWeight: dossierTab === "OVERVIEW" ? 700 : 500,
                  color: dossierTab === "OVERVIEW" ? "#0f172a" : "#64748b",
                  borderBottom: dossierTab === "OVERVIEW" ? "2px solid #0f172a" : "none",
                  background: "transparent",
                }}
              >
                Overview & Diagnosis
              </button>
              <button
                onClick={() => setDossierTab("ATTEMPTS")}
                style={{
                  padding: "12px 16px",
                  fontSize: "12px",
                  fontWeight: dossierTab === "ATTEMPTS" ? 700 : 500,
                  color: dossierTab === "ATTEMPTS" ? "#0f172a" : "#64748b",
                  borderBottom: dossierTab === "ATTEMPTS" ? "2px solid #0f172a" : "none",
                  background: "transparent",
                }}
              >
                Attempt History ({selectedEscalation.attempts?.length || 3})
              </button>
              <button
                onClick={() => setDossierTab("TIMELINE")}
                style={{
                  padding: "12px 16px",
                  fontSize: "12px",
                  fontWeight: dossierTab === "TIMELINE" ? 700 : 500,
                  color: dossierTab === "TIMELINE" ? "#0f172a" : "#64748b",
                  borderBottom: dossierTab === "TIMELINE" ? "2px solid #0f172a" : "none",
                  background: "transparent",
                }}
              >
                Operator Notes & Audit
              </button>
            </div>

            {/* Drawer Body */}
            <div className="drawer-body" style={{ padding: "24px" }}>
              {dossierTab === "OVERVIEW" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Amount at risk card */}
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "10px",
                      padding: "16px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "11px", color: "#991b1b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                        UNRECOVERED EXPOSURE
                      </span>
                      <div style={{ fontSize: "24px", fontWeight: 800, color: "#991b1b", marginTop: "2px" }}>
                        ₹{Number(selectedEscalation.amountAtRisk || 0).toLocaleString()} {selectedEscalation.currency}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="status-pill danger" style={{ fontSize: "10px" }}>
                        {selectedEscalation.priority || "HIGH"} PRIORITY
                      </span>
                      <div style={{ fontSize: "11px", color: "#7f1d1d", marginTop: "4px" }}>
                        Assigned: <strong>{selectedEscalation.owner || "Unassigned"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Why Automation Stopped */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#0f172a", fontWeight: 700 }}>
                      ⚡ Why Autonomous Recovery Halted
                    </h4>
                    <p style={{ margin: 0, fontSize: "12.5px", color: "#334155", lineHeight: "19px" }}>
                      {selectedEscalation.escalationDossier?.whyStopped || selectedEscalation.escalationReason}
                    </p>
                  </div>

                  {/* Recommended Operator Action */}
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "18px" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#1e40af", fontWeight: 700 }}>
                      🎯 AI Recommended Operator Playbook
                    </h4>
                    <p style={{ margin: 0, fontSize: "12.5px", color: "#1e3a8a", lineHeight: "19px" }}>
                      {selectedEscalation.recommendedHumanAction || "Conduct direct VIP outreach via direct phone call. Offer alternate corporate card or customized RTGS link."}
                    </p>
                  </div>

                  {/* Customer Information Card */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px" }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: "13px", color: "#0f172a", fontWeight: 700 }}>
                      👤 Customer & Contact Record
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
                      <div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Full Name</span>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>
                          {selectedEscalation.customerName}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Account Type</span>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", marginTop: "2px" }}>
                          {selectedEscalation.customerType || "INDIVIDUAL"}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Email Address</span>
                        <div style={{ fontSize: "12.5px", color: "#2563eb", marginTop: "2px" }}>
                          {selectedEscalation.customerEmail}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Direct Phone (Twilio Verified)</span>
                        <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#0f172a", marginTop: "2px" }}>
                          {selectedEscalation.customerPhone}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {dossierTab === "ATTEMPTS" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontSize: "12.5px", color: "#64748b", marginBottom: "4px" }}>
                    Review the complete sequence of automated outreach actions executed before escalation:
                  </div>

                  {selectedEscalation.attempts && selectedEscalation.attempts.length > 0 ? (
                    selectedEscalation.attempts.map((att, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "16px",
                          borderLeft: `4px solid ${att.status === "FAILED" ? "#ef4444" : "#10b981"}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                              Attempt #{att.attemptNumber}: {att.actionTitle}
                            </strong>
                            <span className="status-pill purple" style={{ fontSize: "9px" }}>
                              {att.channel}
                            </span>
                          </div>
                          <span className={`status-pill ${att.status === "FAILED" ? "danger" : "success"}`} style={{ fontSize: "9.5px" }}>
                            {att.status}
                          </span>
                        </div>

                        {att.generatedMessage && (
                          <div
                            style={{
                              background: "#f8fafc",
                              border: "1px solid #f1f5f9",
                              borderRadius: "6px",
                              padding: "10px 12px",
                              fontSize: "11.5px",
                              color: "#334155",
                              fontFamily: "monospace",
                              marginBottom: "8px",
                            }}
                          >
                            "{att.generatedMessage}"
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
                          <span>Strategy: <strong>{att.strategy}</strong></span>
                          <span>Provider: <strong>{att.provider} {att.providerErrorCode ? `(${att.providerErrorCode})` : ""}</strong></span>
                          <span>Executed: <strong>{new Date(att.executedAt).toLocaleTimeString()}</strong></span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "30px", color: "#64748b", fontSize: "13px" }}>
                      No detailed attempts logged for this legacy incident.
                    </div>
                  )}
                </div>
              )}

              {dossierTab === "TIMELINE" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Operator Notes List */}
                  <div>
                    <h4 style={{ margin: "0 0 10px", fontSize: "13px", color: "#0f172a", fontWeight: 700 }}>
                      📝 Internal Team Notes
                    </h4>
                    {selectedEscalation.operatorNotes && selectedEscalation.operatorNotes.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {selectedEscalation.operatorNotes.map((n: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              padding: "12px",
                            }}
                          >
                            <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#1e293b" }}>{n.note}</p>
                            <div style={{ fontSize: "10px", color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                              <span>Author: <strong>{n.author}</strong></span>
                              <span>{new Date(n.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                        No operator notes added yet.
                      </div>
                    )}
                  </div>

                  {/* Audit Timeline */}
                  {selectedEscalation.timeline && selectedEscalation.timeline.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: "13px", color: "#0f172a", fontWeight: 700 }}>
                        ⏱️ Complete Activity Audit Log
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {selectedEscalation.timeline.map((tl: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              borderLeft: "2px solid #cbd5e1",
                              paddingLeft: "12px",
                              paddingBottom: "8px",
                            }}
                          >
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
                              {tl.title}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                              {tl.description}
                            </div>
                            <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{tl.timestamp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="drawer-footer" style={{ background: "#f8fafc", justifyContent: "space-between" }}>
              <button
                className="outline-button"
                onClick={() => {
                  setNotingItem(selectedEscalation);
                  setNoteContent("");
                }}
              >
                📝 Add Note
              </button>

              <div style={{ display: "flex", gap: "10px" }}>
                {!selectedEscalation.owner && selectedEscalation.status !== "RESOLVED" && (
                  <button
                    className="dark-button"
                    onClick={() => setClaimingItem(selectedEscalation)}
                  >
                    👤 Claim Case
                  </button>
                )}

                {selectedEscalation.status !== "RESOLVED" && (
                  <button
                    className="primary-button"
                    onClick={() => handleOpenResolveModal(selectedEscalation)}
                  >
                    ✓ Mark Resolved
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: TAKE OWNERSHIP */}
      {claimingItem && (
        <div className="modal-backdrop" onClick={() => setClaimingItem(null)}>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "480px",
              maxWidth: "90vw",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Claim Escalation Ownership
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "12.5px", color: "#64748b" }}>
              Assign incident <strong>{claimingItem.incidentId}</strong> ({claimingItem.customerName}) to your operator profile.
            </p>

            <form onSubmit={handleClaimOwnership}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Operator Name / Role
              </label>
              <input
                type="text"
                className="search-input"
                style={{ width: "100%", padding: "9px 12px", marginBottom: "18px" }}
                value={claimOperatorName}
                onChange={(e) => setClaimOperatorName(e.target.value)}
                required
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setClaimingItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingClaim}
                >
                  {submittingClaim ? "Assigning..." : "Confirm Ownership"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD OPERATOR NOTE */}
      {notingItem && (
        <div className="modal-backdrop" onClick={() => setNotingItem(null)}>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "520px",
              maxWidth: "90vw",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Record Operator Note
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "12.5px", color: "#64748b" }}>
              Add forensic notes, call outcome details, or billing observations for <strong>{notingItem.customerName}</strong>.
            </p>

            <form onSubmit={handleAddNote}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Operator Name
                </label>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: "100%", padding: "8px 12px" }}
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Internal Case Notes
                </label>
                <textarea
                  style={{
                    width: "100%",
                    minHeight: "100px",
                    padding: "10px 12px",
                    border: "1px solid #d4dce2",
                    borderRadius: "7px",
                    fontSize: "12px",
                    outline: "none",
                  }}
                  placeholder="e.g., Spoke with customer assistant. New corporate purchase order being generated for payment next Tuesday."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setNotingItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingNote || !noteContent.trim()}
                >
                  {submittingNote ? "Saving..." : "Save Note to Audit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RESOLVE ESCALATION */}
      {resolvingItem && (
        <div className="modal-backdrop" onClick={() => setResolvingItem(null)}>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "560px",
              maxWidth: "90vw",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "20px" }}>✓</span>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
                Mark Human Escalation as Resolved
              </h3>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: "12.5px", color: "#64748b" }}>
              Record final resolution and settlement for <strong>{resolvingItem.customerName}</strong> (₹{Number(resolvingItem.amountAtRisk).toLocaleString()}).
            </p>

            <form onSubmit={handleSubmitResolution}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Resolution Method
                  </label>
                  <select
                    className="filter-select"
                    style={{ width: "100%", padding: "8px 10px" }}
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value)}
                  >
                    <option value="VIP_PHONE_SETTLEMENT">VIP Phone Call Settlement</option>
                    <option value="MANUAL_ALTERNATE_LINK">Manual Alternate Payment Link</option>
                    <option value="BANK_WIRE_RTGS">Bank Wire / RTGS Transfer</option>
                    <option value="INVOICE_TERMS_RESTRUCTURED">Invoice Terms Restructured</option>
                    <option value="MANUAL_ACCOUNT_CREDIT">Manual Account Settlement</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Settled Amount (₹)
                  </label>
                  <input
                    type="number"
                    className="search-input"
                    style={{ width: "100%", padding: "8px 12px" }}
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Resolving Operator
                </label>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: "100%", padding: "8px 12px" }}
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Resolution Notes & Confirmation Details
                </label>
                <textarea
                  style={{
                    width: "100%",
                    minHeight: "80px",
                    padding: "10px 12px",
                    border: "1px solid #d4dce2",
                    borderRadius: "7px",
                    fontSize: "12px",
                    outline: "none",
                  }}
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setResolvingItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingResolution}
                >
                  {submittingResolution ? "Resolving..." : "Confirm Settlement & Close Escalation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
