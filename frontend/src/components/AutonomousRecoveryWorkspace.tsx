import React, { useState, useEffect } from "react";
import type { SandboxIncidentResponse, OutboundDeliveryResult, PageKey } from "../lib/types";
import {
  fetchSandboxIncidentApi,
  triggerScheduledAttemptNowApi,
  cancelScheduledRecoveryApi,
  deleteSandboxIncidentApi,
  fetchDemoTestContactApi,
  type DemoTestContactConfig,
} from "../lib/api";
import { DemoTestContactModal } from "./DemoTestContactModal";

interface AutonomousRecoveryWorkspaceProps {
  incident: SandboxIncidentResponse;
  onIncidentUpdate: (updated: SandboxIncidentResponse) => void;
  onNavigate?: (page: PageKey) => void;
  onDelete?: () => void;
}

export function AutonomousRecoveryWorkspace({
  incident,
  onIncidentUpdate,
  onNavigate,
  onDelete,
}: AutonomousRecoveryWorkspaceProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"DECISION_TRACE" | "OUTREACH" | "PROVIDER_DEBUG" | "TIMELINE" | "AI_REASONING" | "CONTEXT">("DECISION_TRACE");
  const [selectedChannel, setSelectedChannel] = useState<"EMAIL" | "VOICE">("EMAIL");
  const [copiedLink, setCopiedLink] = useState(false);
  const [testContactModalOpen, setTestContactModalOpen] = useState(false);
  const [testContactConfig, setTestContactConfig] = useState<DemoTestContactConfig | null>(null);

  useEffect(() => {
    fetchDemoTestContactApi()
      .then((res) => {
        if (res.data) setTestContactConfig(res.data);
      })
      .catch(console.warn);
  }, []);

  const record = incident.record || (incident as any);
  const scheduler = record?.scheduler || (incident.incident as any)?.scheduler;
  const status = incident.incident.status || record?.status || "ACTIVE";
  const nextAttemptAt = scheduler?.nextAttemptAt || (incident.incident as any)?.nextAttemptAt;
  const nextAttemptNumber = scheduler?.nextAttemptNumber || 1;

  // Real-time second-by-second countdown timer
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Collect all actions
  const allActions = incident.actions || record?.actions || [];
  const latestAction = allActions[0];
  const latestChannelDispatches: OutboundDeliveryResult[] = latestAction?.channelDispatches || [];

  // Update selected channel if latest action specified one
  useEffect(() => {
    if (latestAction?.selectedChannel) {
      const ch = String(latestAction.selectedChannel).toUpperCase();
      if (ch.includes("VOICE")) setSelectedChannel("VOICE");
      else if (ch.includes("EMAIL")) setSelectedChannel("EMAIL");
    }
  }, [latestAction?.selectedChannel]);

  useEffect(() => {
    if (
      !nextAttemptAt ||
      status === "RECOVERED" ||
      status === "RESOLVED" ||
      status === "ESCALATED_TO_HUMAN" ||
      status === "CANCELLED" ||
      status === "CLOSED"
    ) {
      setSecondsRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const targetTime = new Date(nextAttemptAt).getTime();
      const diffMs = targetTime - Date.now();
      const secs = Math.max(0, Math.ceil(diffMs / 1000));
      setSecondsRemaining(secs);
      return secs;
    };

    calculateRemaining();
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      if (remaining === 0) {
        // Time expired, refetch incident to show executing/updated state
        fetchSandboxIncidentApi(incident.incident.id)
          .then((fresh) => {
            if (fresh) onIncidentUpdate(fresh);
          })
          .catch(console.warn);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [nextAttemptAt, status, incident.incident.id]);

  // Periodic background polling (every 3s) while the incident is actively recovering
  useEffect(() => {
    const isOngoing =
      status === "ACTIVE" ||
      status === "ANALYZED" ||
      status === "ACTION_DISPATCHED" ||
      scheduler?.status === "SCHEDULED" ||
      scheduler?.status === "RUNNING";

    if (!isOngoing) return;

    const pollInterval = setInterval(() => {
      fetchSandboxIncidentApi(incident.incident.id)
        .then((fresh) => {
          if (fresh) onIncidentUpdate(fresh);
        })
        .catch(console.warn);
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [incident.incident.id, status, scheduler?.status]);

  // Format countdown mm:ss
  const formatCountdown = (totalSec: number | null) => {
    if (totalSec === null || totalSec < 0) return "--:--";
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const resolveUrl = `${window.location.origin}/resolve/${incident.incident.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(resolveUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenCustomerLink = () => {
    window.open(`/resolve/${incident.incident.id}`, "_blank");
  };

  const handleTriggerNow = async () => {
    try {
      setLoadingAction("TRIGGER");
      setActionNotice(`Triggering Attempt #${nextAttemptNumber} immediately via external providers...`);
      const res = await triggerScheduledAttemptNowApi(incident.incident.id);
      onIncidentUpdate(res);
      setActionNotice(`⚡ Attempt #${nextAttemptNumber} dispatched. Inspect Provider Delivery tab for raw API response.`);
    } catch (err: any) {
      alert(`Trigger failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelRecovery = async () => {
    const reason = prompt("Enter cancellation reason:", "Operator cancelled recovery workflow");
    if (!reason) return;
    try {
      setLoadingAction("CANCEL");
      const res = await cancelScheduledRecoveryApi(incident.incident.id, reason);
      onIncidentUpdate(res);
    } catch (err: any) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete incident ${incident.incident.id}?`)) return;
    try {
      await deleteSandboxIncidentApi(incident.incident.id);
      if (onDelete) onDelete();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Get channel dispatches from latest action
  const voiceDispatch = latestChannelDispatches.find((c) => c.channel === "VOICE");
  const emailDispatch = latestChannelDispatches.find((c) => c.channel === "EMAIL");

  const customerName = incident.customer.name;
  const customerEmail = incident.customer.email;
  const customerPhone = (incident.customer as any).phone || incident.incident.customer_phone || "+91 94176 75967";
  const analysis = incident.analysis;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ------------------------------------------------------------- */}
      {/* 1. AUTONOMOUS RECOVERY STATUS & COUNTDOWN HERO BAR */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          background:
            status === "RECOVERED"
              ? "linear-gradient(135deg, #064e3b 0%, #065f46 100%)"
              : status === "ESCALATED_TO_HUMAN"
              ? "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)"
              : "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          borderRadius: "14px",
          padding: "24px",
          color: "#ffffff",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
          border:
            status === "RECOVERED"
              ? "1px solid #10b981"
              : status === "ESCALATED_TO_HUMAN"
              ? "1px solid #ef4444"
              : "1px solid #38bdf8",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background:
                    status === "RECOVERED"
                      ? "rgba(16, 185, 129, 0.2)"
                      : status === "ESCALATED_TO_HUMAN"
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(56, 189, 248, 0.2)",
                  color:
                    status === "RECOVERED"
                      ? "#34d399"
                      : status === "ESCALATED_TO_HUMAN"
                      ? "#fca5a5"
                      : "#38bdf8",
                  border: "1px solid currentColor",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    display: "inline-block",
                    animation: status === "ACTIVE" || status === "ACTION_DISPATCHED" ? "pulse 1.5s infinite" : "none",
                  }}
                />
                {status === "RECOVERED"
                  ? "Workflow Completed • Recovered"
                  : status === "ESCALATED_TO_HUMAN"
                  ? "Autonomous Limit Reached • Escalated"
                  : status === "CANCELLED"
                  ? "Workflow Cancelled"
                  : `Autonomous Recovery Active • Attempt ${latestAction?.attemptNumber ? `${latestAction.attemptNumber} of 3 Dispatched` : "1 of 3 Scheduled"}`}
              </span>

              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                ID: <strong>{incident.incident.id}</strong>
              </span>
            </div>

            <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "4px 0 6px", color: "#ffffff" }}>
              {incident.incident.scenarioTypeName} • {incident.incident.currency} {incident.incident.amount.toLocaleString()}
            </h2>

            <p style={{ fontSize: "13px", color: "#cbd5e1", margin: 0, maxWidth: "700px", lineHeight: "1.4" }}>
              Customer: <strong>{customerName}</strong> ({customerEmail}, {customerPhone}) • Disruption: <code>{incident.incident.failureCode}</code>
            </p>
          </div>

          {/* Right: Live Countdown Card or Terminal Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {status !== "RECOVERED" && status !== "ESCALATED_TO_HUMAN" && status !== "CANCELLED" && (
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  border: "1.5px solid rgba(56, 189, 248, 0.4)",
                  borderRadius: "12px",
                  padding: "12px 20px",
                  textAlign: "center",
                  minWidth: "190px",
                }}
              >
                <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Next Recovery Trigger In
                </div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 900,
                    fontFamily: "monospace",
                    color: secondsRemaining !== null && secondsRemaining <= 30 ? "#f87171" : "#38bdf8",
                    margin: "2px 0",
                  }}
                >
                  {formatCountdown(secondsRemaining)}
                </div>
                <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
                  Scheduled: <strong>Attempt #{nextAttemptNumber} of 3</strong>
                </div>
              </div>
            )}

            {status === "RECOVERED" && (
              <div
                style={{
                  background: "rgba(6, 78, 59, 0.7)",
                  border: "1.5px solid #34d399",
                  borderRadius: "12px",
                  padding: "14px 22px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "24px" }}>🎉</div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#34d399" }}>
                  100% RECOVERED
                </div>
                <div style={{ fontSize: "11px", color: "#a7f3d0" }}>
                  {incident.incident.currency} {incident.incident.amount.toLocaleString()} Reconciled
                </div>
              </div>
            )}

            {status === "ESCALATED_TO_HUMAN" && (
              <div
                style={{
                  background: "rgba(127, 29, 29, 0.7)",
                  border: "1.5px solid #f87171",
                  borderRadius: "12px",
                  padding: "14px 22px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "24px" }}>🚨</div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#fca5a5" }}>
                  HUMAN HANDOFF
                </div>
                <div style={{ fontSize: "11px", color: "#fecaca" }}>
                  3 Attempts Executed
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls Bar */}
        <div
          style={{
            marginTop: "18px",
            paddingTop: "16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Customer Self-Service Link */}
            <button
              onClick={handleOpenCustomerLink}
              className="btn btn-primary"
              style={{
                background: "#10b981",
                borderColor: "#059669",
                fontWeight: 800,
                fontSize: "13px",
                padding: "8px 18px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
              }}
              title="Open the customer resolution portal link sent via WhatsApp / Email / SMS"
            >
              <span>🔗</span>
              <span>Open Customer Payment Link ↗</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="btn btn-secondary"
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                borderColor: "rgba(255, 255, 255, 0.25)",
                color: "#ffffff",
                fontSize: "12px",
                padding: "8px 14px",
              }}
            >
              {copiedLink ? "✓ Copied Link" : "📋 Copy Link"}
            </button>

            {/* Fast-Forward Trigger Now Action */}
            {status !== "RECOVERED" && status !== "ESCALATED_TO_HUMAN" && status !== "CANCELLED" && (
              <button
                disabled={loadingAction !== null}
                onClick={handleTriggerNow}
                className="btn btn-secondary"
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  borderColor: "rgba(255, 255, 255, 0.3)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "12.5px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Fast-forward timer and execute the next attempt immediately without waiting"
              >
                <span>⚡</span>
                <span>{loadingAction === "TRIGGER" ? "Executing..." : `Trigger Attempt #${nextAttemptNumber} Now`}</span>
              </button>
            )}

            {/* Cancel Workflow */}
            {status !== "RECOVERED" && status !== "ESCALATED_TO_HUMAN" && status !== "CANCELLED" && (
              <button
                disabled={loadingAction !== null}
                onClick={handleCancelRecovery}
                className="btn btn-secondary"
                style={{
                  background: "transparent",
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  color: "#e2e8f0",
                  fontSize: "12px",
                }}
              >
                Cancel Workflow
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setTestContactModalOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{
                background: testContactConfig?.enabled ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.12)",
                borderColor: testContactConfig?.enabled ? "#10b981" : "rgba(255, 255, 255, 0.3)",
                color: testContactConfig?.enabled ? "#6ee7b7" : "#ffffff",
                fontSize: "11.5px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              title="Configure real Twilio & Resend test destination while keeping synthetic customer telemetry preserved"
            >
              <span>🧪</span>
              <span>Test Contact Router {testContactConfig?.enabled ? "(Active)" : "(Config)"}</span>
            </button>
            {onNavigate && (
              <button
                onClick={() => {
                  window.history.pushState({}, "", `/agent?caseId=${incident.incident.id}`);
                  onNavigate("agent");
                }}
                className="btn btn-secondary btn-sm"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  borderColor: "rgba(255, 255, 255, 0.25)",
                  color: "#ffffff",
                  fontSize: "11.5px",
                }}
              >
                Inspect in AI Agent ↗
              </button>
            )}
            <button
              onClick={handleDelete}
              className="btn btn-secondary btn-sm"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                color: "#fca5a5",
                fontSize: "11.5px",
              }}
            >
              Delete Incident
            </button>
          </div>
        </div>

        {actionNotice && (
          <div
            style={{
              marginTop: "12px",
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(255, 255, 255, 0.12)",
              fontSize: "12px",
              color: "#e0f2fe",
            }}
          >
            {actionNotice}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. RECOVERY CADENCE PROGRESS BAR (T+2m, T+5m, T+5m) */}
      {/* ------------------------------------------------------------- */}
      <div style={{ background: "#ffffff", borderRadius: "12px", padding: "18px 22px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Autonomous 3-Stage Recovery Cascade
            </h3>
            <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
              Bounded real-time schedule (T+2m, T+5m, T+5m) with automatic human escalation safety limit.
            </p>
          </div>
          <span className="status-pill purple" style={{ fontSize: "10px" }}>
            3 Bounded Max Attempts
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[
            {
              stepNum: 1,
              title: "Attempt 1: EMAIL",
              channel: "EMAIL",
              provider: "Resend",
              timing: "T+2 min",
              desc: "Personalized billing recovery email via Resend with dynamic 1-click resolution link",
            },
            {
              stepNum: 2,
              title: "Attempt 2: VOICE",
              channel: "VOICE",
              provider: "Exotel",
              timing: "T+5 min later",
              desc: "Outbound AI voice recovery call via Exotel with conversational audio guidance",
            },
            {
              stepNum: 3,
              title: "Attempt 3: EMAIL",
              channel: "EMAIL",
              provider: "Resend",
              timing: "T+5 min later",
              desc: "Fresh follow-up email incorporating past attempt state prior to VIP human escalation",
            },
          ].map((step) => {
            const hasExecuted = (incident.actions || []).some((a) => a.attemptNumber === step.stepNum);
            const isNext = nextAttemptNumber === step.stepNum && status !== "RECOVERED" && status !== "ESCALATED_TO_HUMAN";
            const isEscalated = status === "ESCALATED_TO_HUMAN" && step.stepNum === 3;

            return (
              <div
                key={step.stepNum}
                style={{
                  borderRadius: "10px",
                  padding: "14px 16px",
                  border: hasExecuted
                    ? "1.5px solid #86efac"
                    : isNext
                    ? "1.5px solid #38bdf8"
                    : "1px solid #e2e8f0",
                  background: hasExecuted
                    ? "#f0fdf4"
                    : isNext
                    ? "#f0f9ff"
                    : "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      color: hasExecuted ? "#166534" : isNext ? "#0369a1" : "#64748b",
                    }}
                  >
                    STAGE {step.stepNum} • {step.channel} • {step.timing}
                  </span>
                  <span
                    className={`status-pill ${hasExecuted ? "success" : isNext ? "info" : isEscalated ? "danger" : ""}`}
                    style={{ fontSize: "9px" }}
                  >
                    {hasExecuted ? "✓ Executed" : isNext ? "⏳ Scheduled" : isEscalated ? "🛑 Escalated" : "Pending"}
                  </span>
                </div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#1e293b" }}>{step.title} ({step.provider})</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", lineHeight: "1.3" }}>
                  {step.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. WORKSPACE TABS */}
      {/* ------------------------------------------------------------- */}
      <div className="tabs" style={{ marginBottom: "0" }}>
        <button
          className={`tab-btn ${activeTab === "DECISION_TRACE" ? "active" : ""}`}
          onClick={() => setActiveTab("DECISION_TRACE")}
        >
          🧠 Autonomous Decision Trace ({allActions.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "OUTREACH" ? "active" : ""}`}
          onClick={() => setActiveTab("OUTREACH")}
        >
          💬 Channel Outreach Preview
        </button>
        <button
          className={`tab-btn ${activeTab === "PROVIDER_DEBUG" ? "active" : ""}`}
          onClick={() => setActiveTab("PROVIDER_DEBUG")}
        >
          ⚡ Technical Delivery & Provider Logs ({latestChannelDispatches.length > 0 ? "Active" : "Pending"})
        </button>
        <button
          className={`tab-btn ${activeTab === "TIMELINE" ? "active" : ""}`}
          onClick={() => setActiveTab("TIMELINE")}
        >
          📜 Autonomous Activity Timeline ({incident.record?.timeline?.length || incident.actions?.length || 0})
        </button>
        <button
          className={`tab-btn ${activeTab === "AI_REASONING" ? "active" : ""}`}
          onClick={() => setActiveTab("AI_REASONING")}
        >
          🔍 AI Telemetry & Diagnosis
        </button>
        <button
          className={`tab-btn ${activeTab === "CONTEXT" ? "active" : ""}`}
          onClick={() => setActiveTab("CONTEXT")}
        >
          📊 Customer Profile & Telemetry
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 0: AUTONOMOUS DECISION TRACE */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "DECISION_TRACE" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Live Autonomous Decision & Reasoning Trace
                </h3>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "3px 0 0" }}>
                  Deterministic sequence (EMAIL → VOICE → EMAIL) with Gemini generating personalized messaging, reasoning, and provider execution outcomes per attempt.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span className="status-pill purple" style={{ fontSize: "10.5px" }}>
                  EMAIL → VOICE → EMAIL
                </span>
                <span className="status-pill info" style={{ fontSize: "10.5px" }}>
                  3 Bounded Attempts
                </span>
              </div>
            </div>
          </div>

          {allActions.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>⏳</div>
              <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
                Attempt #1 (EMAIL) Scheduled • Awaiting Execution
              </h4>
              <p style={{ fontSize: "13px", color: "#64748b", maxWidth: "560px", margin: "0 auto 16px" }}>
                Gemini will generate personalized billing recovery email copy for Attempt #1 via Resend, referencing the failure root cause and customer context.
              </p>
              {status !== "RECOVERED" && status !== "ESCALATED_TO_HUMAN" && (
                <button
                  disabled={loadingAction !== null}
                  onClick={handleTriggerNow}
                  className="btn btn-primary"
                  style={{ background: "#38bdf8", color: "#0f172a", fontWeight: 800, fontSize: "12.5px" }}
                >
                  ⚡ Trigger Attempt #1 (EMAIL) Now
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {allActions.map((act: any, actIdx: number) => {
                const primaryDispatch: OutboundDeliveryResult | undefined = (act.channelDispatches || [])[0];
                const channel = (act.selectedChannel || act.aiChannel || primaryDispatch?.channel || ((act.attemptNumber === 2) ? "VOICE" : "EMAIL")).toUpperCase();
                const deliveryMode = primaryDispatch?.deliveryMode || act.deliveryMode || (primaryDispatch?.status === "SENT" ? "REAL" : primaryDispatch?.status === "SIMULATED" ? "SIMULATED" : primaryDispatch?.status === "FAILED" ? "FAILED" : "SIMULATED");
                const isRealSent = deliveryMode === "REAL" && (act.providerStatus === "SENT" || primaryDispatch?.status === "SENT");
                const isSimulated = deliveryMode === "SIMULATED" || act.status === "SIMULATED" || primaryDispatch?.status === "SIMULATED";
                const isFailed = deliveryMode === "FAILED" || act.status === "CHANNEL_EXECUTION_FAILED" || primaryDispatch?.status === "FAILED";
                const provider = act.provider || (channel === "EMAIL" ? "Resend" : "Exotel");
                const providerId = act.providerMessageId || primaryDispatch?.providerMessageId;

                const channelIcon = channel === "EMAIL" ? "✉️" : "📞";
                const channelColor = channel === "EMAIL" ? "#7c3aed" : "#2563eb";
                const channelBg = channel === "EMAIL" ? "#f5f3ff" : "#eff6ff";

                return (
                  <div
                    key={act.id || actIdx}
                    style={{
                      background: "#ffffff",
                      borderRadius: "12px",
                      border: `1.5px solid ${isFailed ? "#fca5a5" : isRealSent ? "#86efac" : "#e2e8f0"}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        background: "#0f172a",
                        color: "#ffffff",
                        padding: "12px 20px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            background: "#38bdf8",
                            color: "#0f172a",
                            fontWeight: 900,
                            padding: "3px 9px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            letterSpacing: "0.05em",
                          }}
                        >
                          ATTEMPT #{act.attemptNumber || allActions.length - actIdx} OF 3
                        </span>
                        <strong style={{ fontSize: "14px", color: "#f8fafc" }}>
                          {act.aiStrategy || act.actionType || "Autonomous Intervention"}
                        </strong>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            background: channelBg,
                            color: channelColor,
                            border: `1px solid ${channelColor}`,
                            padding: "2px 10px",
                            borderRadius: "16px",
                            fontWeight: 800,
                            fontSize: "11px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span>{channelIcon}</span>
                          <span>Channel: {channel} ({provider})</span>
                        </span>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                          {act.executedAt ? new Date(act.executedAt).toLocaleTimeString() : "Executed"}
                        </span>
                      </div>
                    </div>

                    {/* Trace Body Grid */}
                    <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
                      {/* Left: AI Reasoning & Generated Copy */}
                      <div>
                        {/* Why (Reasoning) */}
                        <div style={{ marginBottom: "14px" }}>
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                            🧠 Why This Channel & Strategy Was Selected (AI Reasoning)
                          </div>
                          <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12.5px", color: "#1e293b", lineHeight: "1.5" }}>
                            {act.reason || act.details || "AI formulated multi-channel recovery intervention tailored to customer profile."}
                          </div>
                        </div>

                        {/* Generated Message Content */}
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                            📝 Generated Message Content ({channel})
                          </div>
                          <div
                            style={{
                              background: "#f1f5f9",
                              padding: "14px 16px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                              color: "#0f172a",
                              lineHeight: "1.55",
                              whiteSpace: "pre-wrap",
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            {act.generatedMessageText ||
                              primaryDispatch?.content?.body ||
                              act.details ||
                              `Recoverly: Resolve payment of ${incident.incident.currency} ${incident.incident.amount.toLocaleString()} securely: ${resolveUrl}`}
                          </div>
                        </div>
                      </div>

                      {/* Right: Provider Telemetry & Next Decision */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {/* Provider Execution Outcome */}
                        <div style={{ background: "#fafafa", borderRadius: "8px", padding: "14px", border: `1px solid ${isFailed ? "#fecaca" : isRealSent ? "#bbf7d0" : "#e2e8f0"}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                              ⚡ Provider Execution Telemetry
                            </div>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: isRealSent ? "#16a34a" : isSimulated ? "#0284c7" : "#dc2626",
                                color: "#ffffff",
                              }}
                            >
                              {isRealSent ? "REAL DISPATCH" : isSimulated ? "SIMULATED" : "FAILED"}
                            </span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                            <div>
                              <span style={{ color: "#64748b" }}>Provider:</span>{" "}
                              <strong>{provider}</strong>
                            </div>
                            <div>
                              <span style={{ color: "#64748b" }}>Delivery State:</span>{" "}
                              <strong style={{ color: isRealSent ? "#16a34a" : isSimulated ? "#0284c7" : "#dc2626" }}>
                                {primaryDispatch?.status || act.providerStatus || (isRealSent ? "SENT" : isSimulated ? "SIMULATED" : "FAILED")}
                              </strong>
                            </div>

                            <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ color: "#64748b" }}>Recipient:</span>
                              <code style={{ fontSize: "11.5px", fontWeight: 700, color: "#0f172a" }}>
                                {primaryDispatch?.actualDestination || primaryDispatch?.destination || (act.selectedChannel === "EMAIL" ? customerEmail : customerPhone)}
                              </code>
                              {primaryDispatch?.routedToTestContact ? (
                                <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                                  DEMO CONTACT
                                </span>
                              ) : (
                                <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
                                  REAL CUSTOMER
                                </span>
                              )}
                            </div>

                            {primaryDispatch?.routedToTestContact && (
                              <div style={{ gridColumn: "span 2", background: "#fefce8", border: "1px solid #fef08a", padding: "6px 8px", borderRadius: "6px", fontSize: "11px", color: "#854d0e" }}>
                                🧪 Demo Contact Override: Routed to <strong>{primaryDispatch.testContactTarget || primaryDispatch.actualDestination}</strong> (Customer: {customerName})
                              </div>
                            )}

                            <div style={{ gridColumn: "span 2" }}>
                              <span style={{ color: "#64748b" }}>Provider SID / ID:</span>{" "}
                              <code style={{ fontSize: "11px", color: providerId ? "#0f172a" : "#64748b", fontWeight: providerId ? 700 : 400 }}>
                                {providerId ? providerId : isSimulated ? "None (Simulated Outcome)" : "Rejected by Provider"}
                              </code>
                            </div>

                            {(primaryDispatch?.providerErrorCode || act.providerErrorCode) && (
                              <div style={{ gridColumn: "span 2" }}>
                                <span style={{ color: "#64748b" }}>Twilio / Provider Error Code:</span>{" "}
                                <code style={{ fontSize: "11px", color: "#dc2626", background: "#fef2f2", padding: "2px 6px", borderRadius: "4px" }}>
                                  {primaryDispatch?.providerErrorCode || act.providerErrorCode}
                                </code>
                              </div>
                            )}

                            {(primaryDispatch?.providerErrorMessage || primaryDispatch?.error || act.providerErrorMessage) && (
                              <div style={{ gridColumn: "span 2", color: "#dc2626", fontSize: "11px", background: "#fef2f2", padding: "8px 10px", borderRadius: "6px", border: "1px solid #fca5a5", lineHeight: "1.4" }}>
                                <strong>Provider Rejection Diagnostic:</strong> {primaryDispatch?.providerErrorMessage || primaryDispatch?.error || act.providerErrorMessage}
                              </div>
                            )}

                            {isSimulated && !providerId && !primaryDispatch?.error && (
                              <div style={{ gridColumn: "span 2", color: "#0369a1", fontSize: "11px", background: "#f0f9ff", padding: "6px 8px", borderRadius: "6px", border: "1px solid #bae6fd" }}>
                                ℹ️ Simulation fallback active — configure real Twilio credentials or verified test recipient to send real provider dispatches.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Result */}
                        <div style={{ background: "#fafafa", borderRadius: "8px", padding: "14px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                            📊 Recovery Settlement Result
                          </div>
                          <div style={{ fontSize: "12.5px", color: status === "RECOVERED" ? "#15803d" : "#475569", fontWeight: 600 }}>
                            {status === "RECOVERED" ? "✅ 100% RECOVERED & SETTLED" : act.result || "Customer unrecovered — awaiting settlement"}
                          </div>
                        </div>

                        {/* Next Decision */}
                        <div style={{ background: "#f0f9ff", borderRadius: "8px", padding: "14px", border: "1px solid #bae6fd" }}>
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase", marginBottom: "4px" }}>
                            🔄 Next Autonomous Decision
                          </div>
                          <div style={{ fontSize: "12px", color: "#0c4a6e", lineHeight: "1.4" }}>
                            {act.nextDecision || (actIdx === 0 && (act.attemptNumber || 1) < 3 ? `Schedule Attempt #${(act.attemptNumber || 1) + 1} for Gemini dynamic reassessment` : "Cascade complete")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: OMNICHANNEL OUTBOUND DELIVERY PREVIEWS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "OUTREACH" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Channel Selector Pills */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => setSelectedChannel("EMAIL")}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: "10px",
                border: selectedChannel === "EMAIL" ? "2px solid #8b5cf6" : "1px solid #e2e8f0",
                background: selectedChannel === "EMAIL" ? "#f5f3ff" : "#ffffff",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: "22px" }}>✉️</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>Email Outreach (Resend)</div>
                <div style={{ fontSize: "11px", color: emailDispatch?.status === "SENT" ? "#7c3aed" : emailDispatch?.status === "FAILED" ? "#dc2626" : "#64748b", fontWeight: 600 }}>
                  {emailDispatch?.deliveryLabel || "Direct Invoice & Settlement Link"}
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedChannel("VOICE")}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: "10px",
                border: selectedChannel === "VOICE" ? "2px solid #2563eb" : "1px solid #e2e8f0",
                background: selectedChannel === "VOICE" ? "#eff6ff" : "#ffffff",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: "22px" }}>📞</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>Voice Call (Exotel)</div>
                <div style={{ fontSize: "11px", color: voiceDispatch?.status === "SENT" ? "#2563eb" : voiceDispatch?.status === "FAILED" ? "#dc2626" : "#64748b", fontWeight: 600 }}>
                  {voiceDispatch?.deliveryLabel || "Automated AI Voice Call with Audio Prompt"}
                </div>
              </div>
            </button>
          </div>

          {/* Detailed Message Preview for Selected Channel */}
          {selectedChannel === "EMAIL" && (
            <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    Email Preview • To: {customerEmail}
                  </h4>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    Subject: <strong>{analysis?.customerMessage?.email?.subject || `Action Required: Payment Resolution for ${customerName}`}</strong>
                  </div>
                </div>
                <span
                  className={`status-pill ${emailDispatch?.status === "SENT" ? "success" : emailDispatch?.status === "FAILED" ? "danger" : "purple"}`}
                  style={{ fontSize: "9.5px" }}
                >
                  {emailDispatch?.deliveryLabel || "Resend Email Adapter"}
                </span>
              </div>

              <div
                style={{
                  background: "#fafafa",
                  borderRadius: "10px",
                  padding: "20px",
                  border: "1px solid #e2e8f0",
                  fontSize: "13px",
                  color: "#334155",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                }}
              >
                {analysis?.customerMessage?.email?.body ||
                  `Dear ${customerName},\n\nWe encountered a temporary processing issue for your payment of ${incident.incident.currency} ${incident.incident.amount.toLocaleString()}.\n\nPlease review and resolve via the secure link:\n${resolveUrl}\n\nBest regards,\nRecoverly Operations Team`}
              </div>
            </div>
          )}

          {selectedChannel === "VOICE" && (
            <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    Automated Voice Call Script • To: {customerPhone}
                  </h4>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    Recipient: {customerName} | Provider: Exotel Voice Gateway | Status:{" "}
                    <strong style={{ color: voiceDispatch?.status === "SENT" ? "#2563eb" : voiceDispatch?.status === "FAILED" ? "#dc2626" : "#475569" }}>
                      {voiceDispatch?.deliveryLabel || "Pending Call Dispatch"}
                    </strong>
                  </div>
                </div>
                {voiceDispatch?.providerMessageId && (
                  <span style={{ fontSize: "10.5px", fontFamily: "monospace", color: "#64748b" }}>
                    Call SID: {voiceDispatch.providerMessageId}
                  </span>
                )}
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  color: "#0f172a",
                  lineHeight: "1.6",
                  fontFamily: "sans-serif",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase", marginBottom: "6px" }}>
                  🎙️ AI Voice Spoken Text (Generated Script ~25s)
                </div>
                <div style={{ whiteSpace: "pre-wrap", color: "#1e293b" }}>
                  {voiceDispatch?.messagePreview ||
                    voiceDispatch?.content?.body ||
                    (analysis?.customerMessage as any)?.voice ||
                    `Hello ${customerName}, this is an automated priority payment notification from Recoverly. Your recent payment of ${incident.incident.currency} ${incident.incident.amount.toLocaleString()} could not be processed due to ${incident.incident.failureCode}. A direct resolution link has been delivered to your email. Thank you.`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: TECHNICAL DELIVERY & PROVIDER LOGS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "PROVIDER_DEBUG" && (
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Technical Delivery & Provider API Responses
              </h4>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Real-time provider trace showing Twilio (WhatsApp & SMS) and Resend (Email) status, IDs, and raw gateway telemetry.
              </p>
            </div>
            <span className="status-pill purple" style={{ fontSize: "10px" }}>
              Live Provider Trace
            </span>
          </div>

          {allActions.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", background: "#f8fafc", borderRadius: "8px" }}>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                No recovery attempts executed yet. Attempt #1 is scheduled or can be triggered via <strong>Trigger Attempt Now</strong>.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {allActions.map((act: any, actIdx: number) => {
                const dispatches: OutboundDeliveryResult[] = act.channelDispatches || [];
                return (
                  <div
                    key={actIdx}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Attempt Header */}
                    <div
                      style={{
                        background: "#0f172a",
                        color: "#ffffff",
                        padding: "12px 18px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            background: "#38bdf8",
                            color: "#0f172a",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                          }}
                        >
                          ATTEMPT #{act.attemptNumber || 1}
                        </span>
                        <strong style={{ fontSize: "13px" }}>{act.actionTitle || "Autonomous Outreach"}</strong>
                      </div>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                        Executed: {act.executedAt ? new Date(act.executedAt).toLocaleTimeString() : "Recent"}
                      </span>
                    </div>

                    {/* Attempt Detail Container */}
                    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      {/* AI Decision & Message Row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "14px" }}>
                        <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                            AI Decision & Strategy
                          </div>
                          <div style={{ fontSize: "12px", color: "#1e293b", marginBottom: "6px" }}>
                            <strong>Strategy:</strong> {act.aiStrategy || act.actionType} • <strong>Channel:</strong> {act.selectedChannel || act.aiChannel || "EMAIL"}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#64748b", lineHeight: "1.4" }}>
                            {act.reason || "Autonomous recovery touchpoint formulated based on incident state."}
                          </div>
                        </div>

                        <div style={{ background: "#f1f5f9", padding: "12px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                          <div style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                            Dispatched Message Copy ({act.selectedChannel || act.aiChannel || "EMAIL"})
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#0f172a", whiteSpace: "pre-wrap", maxHeight: "110px", overflowY: "auto", fontFamily: "monospace" }}>
                            {act.generatedMessageText || act.details || "No message content recorded"}
                          </div>
                        </div>
                      </div>

                      {/* Provider Gateway Table */}
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                            <th style={{ padding: "8px 10px" }}>Channel</th>
                            <th style={{ padding: "8px 10px" }}>Provider Adapter</th>
                            <th style={{ padding: "8px 10px" }}>Destination Target</th>
                            <th style={{ padding: "8px 10px" }}>Delivery Status</th>
                            <th style={{ padding: "8px 10px" }}>Provider ID / Diagnostic</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dispatches.map((cd, cdIdx) => {
                            const deliveryMode = cd.deliveryMode || (cd.status === "SENT" ? "REAL" : cd.status === "SIMULATED" ? "SIMULATED" : cd.status === "FAILED" ? "FAILED" : "SIMULATED");
                            const isRealSent = deliveryMode === "REAL" && cd.status === "SENT";
                            const isFailed = deliveryMode === "FAILED" || cd.status === "FAILED";
                            const isSim = deliveryMode === "SIMULATED" || cd.status === "SIMULATED";

                            return (
                              <tr key={cdIdx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "10px", fontWeight: 700 }}>
                                  {cd.channel === "VOICE" ? "📞 Voice Call" : "✉️ Email"}
                                </td>
                                <td style={{ padding: "10px", color: "#334155" }}>
                                  {cd.channel === "VOICE" ? "Exotel Voice Gateway" : "Resend API"}
                                </td>
                                <td style={{ padding: "10px", fontFamily: "monospace", color: "#475569" }}>
                                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                                    {cd.actualDestination || cd.destination || cd.recipient || cd.to || "—"}
                                  </div>
                                  <div style={{ marginTop: "4px" }}>
                                    {cd.routedToTestContact ? (
                                      <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                                        DEMO CONTACT
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
                                        REAL CUSTOMER
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: "10px" }}>
                                  <span
                                    className={`status-pill ${isRealSent ? "success" : isFailed ? "danger" : isSim ? "info" : "purple"}`}
                                    style={{ fontSize: "10px", padding: "2px 8px", fontWeight: 800 }}
                                  >
                                    {isRealSent ? "REAL (SENT)" : isSim ? "SIMULATED" : "FAILED"}
                                  </span>
                                </td>
                                <td style={{ padding: "10px" }}>
                                  {cd.providerMessageId && (
                                    <div style={{ fontFamily: "monospace", color: "#0f172a", fontSize: "11px" }}>
                                      SID/ID: <strong>{cd.providerMessageId}</strong>
                                    </div>
                                  )}
                                  {cd.providerErrorCode && (
                                    <div style={{ color: "#dc2626", fontSize: "11px", marginTop: "2px" }}>
                                      Code: <strong>{cd.providerErrorCode}</strong>
                                    </div>
                                  )}
                                  {(cd.providerErrorMessage || cd.error) && (
                                    <div style={{ color: "#dc2626", fontSize: "11px", marginTop: "2px", maxWidth: "350px", lineHeight: "1.3" }}>
                                      {cd.providerErrorMessage || cd.error}
                                    </div>
                                  )}
                                  {!cd.providerMessageId && !cd.error && !cd.providerErrorMessage && (
                                    <div style={{ color: "#64748b", fontSize: "11px" }}>
                                      {cd.deliveryLabel}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: AUTONOMOUS ACTIVITY TIMELINE */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "TIMELINE" && (
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "22px" }}>
          <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginBottom: "16px" }}>
            Complete Lifecycle Activity Stream
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {(incident.record?.timeline && incident.record.timeline.length > 0
              ? incident.record.timeline
              : incident.lifecycle || []
            ).map((item: any, idx: number) => {
              const isDone = item.status === "COMPLETED";
              const isSched = item.type === "TIMER_SCHEDULED";
              const isAtt = item.type === "ATTEMPT";
              const isEsc = item.type === "ESCALATED";
              const isRec = item.type === "RECOVERED";

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                    paddingBottom: "14px",
                    borderBottom: idx === (incident.record?.timeline?.length || incident.lifecycle?.length || 1) - 1 ? "none" : "1px solid #f1f5f9",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: isRec
                        ? "#dcfce7"
                        : isEsc
                        ? "#fee2e2"
                        : isSched
                        ? "#e0f2fe"
                        : isAtt
                        ? "#f3e8ff"
                        : "#f1f5f9",
                      color: isRec
                        ? "#15803d"
                        : isEsc
                        ? "#b91c1c"
                        : isSched
                        ? "#0284c7"
                        : isAtt
                        ? "#7e22ce"
                        : "#475569",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: "14px",
                      flexShrink: 0,
                    }}
                  >
                    {isRec ? "✓" : isEsc ? "🛑" : isSched ? "⏳" : isAtt ? "⚡" : "•"}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>{item.title}</strong>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>{item.timestamp}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "3px 0 0", lineHeight: "1.4" }}>
                      {item.description || item.detail}
                    </p>
                    {item.channelDispatches && item.channelDispatches.length > 0 && (
                      <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {item.channelDispatches.map((cd: OutboundDeliveryResult, cIdx: number) => (
                          <span
                            key={cIdx}
                            className={`status-pill ${cd.status === "SENT" ? "success" : cd.status === "FAILED" ? "danger" : "info"}`}
                            style={{ fontSize: "9px", padding: "1px 6px" }}
                          >
                            {cd.channel}: {cd.status} ({cd.providerMessageId || cd.deliveryLabel})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: GEMINI AI REASONING */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "AI_REASONING" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
          <div>
            <div style={{ background: "#ffffff", borderRadius: "12px", padding: "20px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                Root Cause Diagnosis
              </div>
              <p style={{ fontSize: "13.5px", color: "#0f172a", lineHeight: "1.5", margin: 0, fontWeight: 600 }}>
                {analysis?.rootCause || "Diagnosing payment disruption root cause..."}
              </p>
            </div>

            <div style={{ background: "#ffffff", borderRadius: "12px", padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>
                Grounded Telemetry Evidence
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "#334155", lineHeight: "1.6" }}>
                {analysis?.relevantEvidence?.map((ev, i) => (
                  <li key={i}>{ev}</li>
                )) || <li>Ingested telemetry grounded from runtime profile.</li>}
              </ul>
            </div>
          </div>

          <div>
            <div style={{ background: "#ffffff", borderRadius: "12px", padding: "20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>
                Cascade Strategy & Probability Score
              </div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#059669", marginBottom: "4px" }}>
                {Math.round((analysis?.recoveryProbability || 0.82) * 100)}% Projected Recovery
              </div>
              <p style={{ fontSize: "12.5px", color: "#475569", margin: "0 0 12px", lineHeight: "1.4" }}>
                Strategy: <strong>{analysis?.selectedStrategy || "Autonomous Cascade"}</strong>
              </p>
              <div style={{ fontSize: "11.5px", color: "#64748b", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                {analysis?.strategyJustification || analysis?.aiReasoning || "Formulated multi-channel cascade based on customer historical LTV and failure code characteristics."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: CUSTOMER PROFILE & CONTEXT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "CONTEXT" && (
        <div style={{ background: "#ffffff", borderRadius: "12px", padding: "22px", border: "1px solid #e2e8f0" }}>
          <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            Customer Historical Telemetry
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "18px" }}>
            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Past Invoices</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                {incident.context.invoicesCount}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Past Transactions</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                {incident.context.transactionsCount}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Active Subscriptions</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                {incident.context.subscriptionsCount}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Customer Type</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                {(incident.customer as any).customer_type || "INDIVIDUAL"}
              </div>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "#64748b" }}>
            Billing Context: <em>{incident.incident.billingContext}</em>
          </div>
        </div>
      )}

      {/* Demo Test Contact Configuration Modal */}
      <DemoTestContactModal
        isOpen={testContactModalOpen}
        onClose={() => setTestContactModalOpen(false)}
        onConfigSaved={(updatedCfg) => setTestContactConfig(updatedCfg)}
      />
    </div>
  );
}
