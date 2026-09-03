import { useState, useEffect } from "react";
import type { FullRecoveryCaseDetails, AICaseAnalysis } from "../lib/types";
import {
  fetchRecoveryCase,
  updateCaseStatus,
  executeCaseAction,
  recordPromiseToPay,
  analyzeCaseWithAI,
} from "../lib/api";
import { ActionConfirmModal, type ActionModalConfig } from "./ActionConfirmModal";

interface CaseDetailDrawerProps {
  caseId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function CaseDetailDrawer({ caseId, onClose, onUpdated }: CaseDetailDrawerProps) {
  const [details, setDetails] = useState<FullRecoveryCaseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState<AICaseAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Manual action state
  const [actionType, setActionType] = useState("SEND_PAYMENT_LINK");
  const [actionReason, setActionReason] = useState("");

  // Promise to pay form
  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState("");

  // Live action modal confirmation
  const [modalConfig, setModalConfig] = useState<ActionModalConfig | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchRecoveryCase(caseId);
      setDetails(res);
      if (res.case) {
        setPromiseAmount(String(res.case.amount_at_risk));
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 3);
        setPromiseDate(defaultDate.toISOString().split("T")[0]);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load case details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [caseId]);

  const handleRunAI = async () => {
    try {
      setAnalyzing(true);
      const result = await analyzeCaseWithAI(caseId);
      setAiAnalysis(result);
    } catch (e: any) {
      alert(`AI Copilot analysis failed: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecuteActionForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!details?.case) return;

    setModalConfig({
      actionType,
      actionTitle: `Dispatch ${actionType}`,
      targetLabel: `${details.case.customers?.name || "Customer"} (${details.case.customers?.email})`,
      amountAtRisk: details.case.amount_at_risk,
      currency: details.case.currency,
      description: `Dispatches the dunning workflow for ${actionType} and records state change in Supabase.`,
      defaultReason: actionReason || `Manual dispatch of ${actionType} by operator`,
      onConfirm: async (confirmedReason) => {
        await executeCaseAction(caseId, actionType, confirmedReason);
        setActionReason("");
        await loadData();
        onUpdated();
      },
      onClose: () => setModalConfig(null),
    });
  };

  const handleSavePromiseForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!details?.case) return;

    setModalConfig({
      actionType: "RECORD_PROMISE_TO_PAY",
      actionTitle: "Record Formal Customer Promise to Pay",
      targetLabel: `${details.case.customers?.name || "Customer"} (${details.case.customers?.email})`,
      amountAtRisk: promiseAmount,
      currency: details.case.currency,
      description: `Records a commitment from customer to pay ${details.case.currency} ${promiseAmount} by ${promiseDate}. Case status will be changed to PROMISE_TO_PAY.`,
      defaultReason: `Customer agreed to settle payment by ${promiseDate}`,
      onConfirm: async () => {
        await recordPromiseToPay(caseId, details.case.customer_id, Number(promiseAmount), promiseDate);
        setShowPromiseForm(false);
        await loadData();
        onUpdated();
      },
      onClose: () => setModalConfig(null),
    });
  };

  const handleStatusChangeRequest = (newStatus: string) => {
    if (!details?.case) return;

    setModalConfig({
      actionType: `UPDATE_STATUS_${newStatus}`,
      actionTitle: `Change Case Status to ${newStatus}`,
      targetLabel: `${details.case.customers?.name || "Customer"} (Case #${details.case.id.slice(0, 8)})`,
      amountAtRisk: details.case.amount_at_risk,
      currency: details.case.currency,
      description: `Mutates recovery case lifecycle state to "${newStatus}" in PostgreSQL database and writes to audit logs.`,
      defaultReason: `Operator transitioned state to ${newStatus}`,
      onConfirm: async () => {
        await updateCaseStatus(caseId, newStatus);
        await loadData();
        onUpdated();
      },
      onClose: () => setModalConfig(null),
    });
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span>Recovery Case 360</span>
              <span className="status-pill info" style={{ fontSize: "9px" }}>⚡ Live Database Record</span>
            </div>
            <h2>{details?.case ? `${details.case.currency} ${Number(details.case.amount_at_risk).toLocaleString()} at Risk` : "Loading Case..."}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {loading && (
            <div className="loading-container">
              <div className="spinner"></div>
              <span>Fetching case record from Supabase...</span>
            </div>
          )}

          {error && (
            <div className="empty-state">
              <div className="empty-illustration">⚠</div>
              <h3>Unable to load case</h3>
              <p>{error}</p>
              <button className="outline-button" onClick={loadData}>Retry</button>
            </div>
          )}

          {details && details.case && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {/* Top Overview Card */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <strong style={{ fontSize: "14px", color: "#1e293b", display: "block" }}>{details.case.customers?.name || "Customer Account"}</strong>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>{details.case.customers?.email} • {details.case.customers?.customer_type}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <span className={`status-pill ${details.case.priority === "CRITICAL" ? "danger" : details.case.priority === "HIGH" ? "warning" : "info"}`}>
                      {details.case.priority}
                    </span>
                    <span className={`status-pill ${details.case.status === "RECOVERED" ? "success" : details.case.status === "OPEN" ? "danger" : "purple"}`}>
                      {details.case.status}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "#334155", lineHeight: "1.5", marginBottom: "10px" }}>
                  <strong>Failure Reason: </strong> {details.case.reason}
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #edf2f7", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Update Lifecycle Status:</span>
                  <button
                    className="outline-button"
                    style={{ fontSize: "10px", padding: "3px 8px" }}
                    onClick={() => handleStatusChangeRequest("IN_PROGRESS")}
                    disabled={details.case.status === "IN_PROGRESS"}
                  >
                    Set In Progress
                  </button>
                  <button
                    className="outline-button"
                    style={{ fontSize: "10px", padding: "3px 8px", color: "#15803d" }}
                    onClick={() => handleStatusChangeRequest("RECOVERED")}
                    disabled={details.case.status === "RECOVERED"}
                  >
                    ✓ Mark Recovered
                  </button>
                  <button
                    className="outline-button"
                    style={{ fontSize: "10px", padding: "3px 8px", color: "#b91c1c" }}
                    onClick={() => handleStatusChangeRequest("ESCALATED")}
                    disabled={details.case.status === "ESCALATED"}
                  >
                    ⚡ Escalate Case
                  </button>
                </div>
              </div>

              {/* Promise to Pay Section */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "12.5px", color: "#1e293b" }}>Promise to Pay Commitment</strong>
                  <button
                    className="outline-button"
                    style={{ fontSize: "10.5px", padding: "3px 8px" }}
                    onClick={() => setShowPromiseForm(!showPromiseForm)}
                  >
                    {showPromiseForm ? "Cancel" : "+ Record Promise"}
                  </button>
                </div>

                {details.promiseToPay ? (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 12px", borderRadius: "6px", fontSize: "11.5px" }}>
                    <div style={{ color: "#166534", fontWeight: 700, marginBottom: "2px" }}>
                      Active Promise: {details.case.currency} {Number(details.promiseToPay.amount).toLocaleString()}
                    </div>
                    <div style={{ color: "#15803d", fontSize: "11px" }}>
                      Target Commitment Date: <strong>{new Date(details.promiseToPay.promise_date).toLocaleDateString()}</strong> • Status: {details.promiseToPay.status}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>No active customer promise to pay registered.</div>
                )}

                {showPromiseForm && (
                  <form onSubmit={handleSavePromiseForm} style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #edf2f7", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div>
                        <label style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Committed Amount ({details.case.currency})</label>
                        <input
                          type="number"
                          className="search-input"
                          style={{ width: "100%" }}
                          required
                          value={promiseAmount}
                          onChange={(e) => setPromiseAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Promised Payment Date</label>
                        <input
                          type="date"
                          className="search-input"
                          style={{ width: "100%" }}
                          required
                          value={promiseDate}
                          onChange={(e) => setPromiseDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                      <button type="submit" className="primary-button" style={{ fontSize: "11px", padding: "5px 12px" }}>
                        ⚡ Save Promise (Live DB)
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* AI Recovery Copilot Analysis */}
              <div style={{ background: "#0d1b24", color: "#ffffff", border: "1px solid #1a2c38", padding: "16px", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#d8ee9b" }}>✦</span>
                    <strong style={{ fontSize: "13px", color: "#ffffff" }}>Gemini AI Agentic Copilot</strong>
                  </div>
                  <button
                    className="primary-button"
                    style={{ background: "#d8ee9b", color: "#0b1720", fontSize: "10.5px", padding: "4px 10px" }}
                    onClick={handleRunAI}
                    disabled={analyzing}
                  >
                    {analyzing ? "Running Agent Loop..." : aiAnalysis ? "Re-run Agent Loop" : "Execute Agent Loop"}
                  </button>
                </div>

                {aiAnalysis ? (
                  <div style={{ fontSize: "11.5px", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ background: "#11222e", padding: "8px 10px", borderRadius: "6px", border: "1px solid #1b3548" }}>
                      <div style={{ color: "#38bdf8", fontSize: "10px", textTransform: "uppercase", fontWeight: 700 }}>1. Detected Risk & Evidence</div>
                      <div style={{ color: "#ffffff", fontWeight: 600, marginTop: "2px" }}>{aiAnalysis.detectedRisk || details.case.reason}</div>
                      {aiAnalysis.relevantEvidence && aiAnalysis.relevantEvidence.length > 0 && (
                        <div style={{ color: "#94a3b8", fontSize: "10.5px", marginTop: "4px" }}>
                          Evidence: {aiAnalysis.relevantEvidence.join(" • ")}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ color: "#d8ee9b", fontSize: "10px", textTransform: "uppercase", fontWeight: 700 }}>2. AI Reasoning</div>
                      <div style={{ color: "#cbd5e1", marginTop: "2px" }}>{aiAnalysis.aiReasoning || aiAnalysis.rootCauseAnalysis}</div>
                    </div>

                    <div style={{ background: "#192e38", padding: "8px 10px", borderRadius: "6px" }}>
                      <div style={{ color: "#86efac", fontSize: "10px", textTransform: "uppercase", fontWeight: 700 }}>3. Selected Strategy & Justification</div>
                      <div style={{ color: "#ffffff", fontWeight: 700, marginTop: "2px" }}>
                        {aiAnalysis.selectedStrategy || aiAnalysis.recommendedAction} ({aiAnalysis.optimalTiming}) • Prob: <strong>{(aiAnalysis.recoveryProbabilityScore * 100).toFixed(0)}%</strong>
                      </div>
                      <div style={{ color: "#cbd5e1", fontSize: "10.5px", marginTop: "3px" }}>
                        {aiAnalysis.strategyJustification || "Selected to maximize recovery likelihood while preserving customer experience."}
                      </div>
                    </div>

                    {aiAnalysis.tailoredMessageDraft && (
                      <div style={{ background: "#0b171e", padding: "10px", borderRadius: "6px", borderLeft: "3px solid #d8ee9b" }}>
                        <div style={{ color: "#94a3b8", fontSize: "9.5px", marginBottom: "4px", textTransform: "uppercase" }}>Generated Outreach Copy (SMS / Voice Script)</div>
                        <div style={{ color: "#e2e8f0", fontSize: "11px", fontStyle: "italic" }}>"{aiAnalysis.tailoredMessageDraft}"</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>
                    Click "Execute Agent Loop" to run the bounded agentic pipeline (DETECT → ANALYZE → DECIDE → ACT/SIMULATE → OBSERVE → AUDIT) for this case with Gemini AI.
                  </p>
                )}
              </div>

              {/* Action Dispatch Form */}
              <form onSubmit={handleExecuteActionForm} style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "16px", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <strong style={{ fontSize: "13px", color: "#1e293b" }}>Dispatch Recovery Action</strong>
                  <span className="status-pill warning" style={{ fontSize: "9px" }}>⚡ REAL DB ACTION</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "10px", color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Action Type</label>
                    <select
                      className="filter-select"
                      style={{ width: "100%" }}
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value)}
                    >
                      <option value="SEND_PAYMENT_LINK">SEND_PAYMENT_LINK (Generate 48h smart checkout link)</option>
                      <option value="RETRY_PAYMENT">RETRY_PAYMENT (Trigger auto-retry cascade)</option>
                      <option value="SEND_REMINDER">SEND_REMINDER (Email + SMS reminder)</option>
                      <option value="REQUEST_PAYMENT_METHOD_UPDATE">REQUEST_PAYMENT_METHOD_UPDATE (Card/UPI prompt)</option>
                      <option value="SCHEDULE_RETRY">SCHEDULE_RETRY (Schedule for optimal salary window)</option>
                      <option value="ESCALATE">ESCALATE (Escalate to operations lead)</option>
                      <option value="CLOSE_CASE">CLOSE_CASE (Mark closed)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "10px", color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Reason / Notes</label>
                    <input
                      type="text"
                      className="search-input"
                      style={{ width: "100%" }}
                      placeholder="e.g. Dispatched recovery outreach with payment link"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                    <button type="submit" className="dark-button">
                      ⚡ Execute Action (Live DB)
                    </button>
                  </div>
                </div>
              </form>

              {/* Action History Timeline */}
              <div>
                <strong style={{ fontSize: "13px", color: "#1e293b", display: "block", marginBottom: "10px" }}>Action History & Audit Logs</strong>
                {details.actions.length === 0 ? (
                  <div style={{ fontSize: "11px", color: "#94a3b8", padding: "12px", background: "#f8fafc", borderRadius: "6px" }}>No recovery actions taken yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {details.actions.map((act) => (
                      <div key={act.id} style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", borderLeft: "3px solid #3b82f6", fontSize: "11.5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                          <strong style={{ color: "#1e293b" }}>{act.action_type}</strong>
                          <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{new Date(act.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ color: "#475569", fontSize: "11px" }}>{act.result || act.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button className="outline-button" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {modalConfig && <ActionConfirmModal {...modalConfig} />}
    </div>
  );
}
