import React, { useEffect, useState } from "react";
import type { PageKey, SyntheticTelemetryRecord, TelemetryQueueSummary, ChannelReadinessResponse } from "../lib/types";
import {
  fetchTelemetryQueueApi,
  analyzeTelemetryApi,
  resetTelemetryQueueApi,
  createCustomTelemetryApi,
  updateTelemetryContactApi,
  fetchChannelReadinessApi,
} from "../lib/api";

interface TelemetryQueuePageProps {
  onNavigate: (page: PageKey, caseId?: string) => void;
}

export function TelemetryQueuePage({ onNavigate }: TelemetryQueuePageProps) {
  const [queue, setQueue] = useState<SyntheticTelemetryRecord[]>([]);
  const [summary, setSummary] = useState<TelemetryQueueSummary>({
    totalSignals: 40,
    waitingCount: 40,
    analyzedCount: 0,
    activeCount: 0,
    recoveredCount: 0,
    escalatedCount: 0,
    evaluatedCount: 0,
    correctDetections: 0,
    accuracyPercentage: 100,
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "WAITING" | "AI_DETECTED" | "RECOVERED" | "ESCALATED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<SyntheticTelemetryRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContactRecord, setEditingContactRecord] = useState<SyntheticTelemetryRecord | null>(null);
  const [editContactForm, setEditContactForm] = useState({ email: "", phone: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [customForm, setCustomForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerType: "INDIVIDUAL" as "INDIVIDUAL" | "BUSINESS",
    amount: 3500,
    currency: "INR",
    paymentMethod: "UPI",
    paymentRail: "UPI AutoPay / Web",
    notes: "",
  });
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Channel Readiness & Modal States
  const [channelReadiness, setChannelReadiness] = useState<ChannelReadinessResponse | null>(null);
  const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(false);
  const [showVerifyPhoneModal, setShowVerifyPhoneModal] = useState(false);
  const [showJoinWhatsAppModal, setShowJoinWhatsAppModal] = useState(false);

  const loadQueue = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [res, readiness] = await Promise.all([
        fetchTelemetryQueueApi(),
        fetchChannelReadinessApi().catch(() => null),
      ]);
      setQueue(res.data || []);
      if (res.summary) {
        setSummary(res.summary);
      }
      if (readiness?.data) {
        setChannelReadiness(readiness.data);
      }
    } catch (err: any) {
      console.error("Failed to load telemetry queue:", err);
      setErrorMsg(err.message || "Failed to load telemetry queue. Please check connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleStartAnalysis = async (recordId: string) => {
    try {
      setAnalyzingId(recordId);
      setActionSuccessMsg(null);
      const res = await analyzeTelemetryApi(recordId);
      if (res.success && res.data) {
        setActionSuccessMsg(`Gemini AI diagnosed ${recordId} as ${res.data.analysis.detectedScenarioType} (${res.data.analysis.confidence}% confidence)`);
        await loadQueue();
        // Automatically open the detailed inspection modal for the newly analyzed record
        const updated = queue.find((r) => r.id === recordId) || res.data.telemetry;
        setSelectedRecord({
          ...updated,
          aiAnalysis: res.data.analysis,
          evaluation: res.data.evaluation,
          createdIncident: res.data.createdIncident,
        });
      }
    } catch (err: any) {
      alert(`AI Analysis failed: ${err.message || "Unknown error"}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleOpenEditContact = (record: SyntheticTelemetryRecord) => {
    if (record.status !== "WAITING") {
      alert("Contact is locked: Autonomous workflow is already in progress.");
      return;
    }
    setEditingContactRecord(record);
    setEditContactForm({
      email: record.demoOutreachContact?.email || record.customerEmail || "",
      phone: record.demoOutreachContact?.phone || record.customerPhone || "",
    });
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContactRecord) return;
    try {
      setSavingContact(true);
      const updated = await updateTelemetryContactApi(editingContactRecord.id, editContactForm);
      setQueue((prev) => prev.map((item) => (item.id === updated.id ? { ...item, demoOutreachContact: updated.demoOutreachContact } : item)));
      setActionSuccessMsg(`Outreach destination saved for Record #${editingContactRecord.batchNumber.toString().padStart(2, "0")} (${editingContactRecord.customerName}): ${editContactForm.email || "No Email"} / ${editContactForm.phone || "No Phone"}`);
      setEditingContactRecord(null);
    } catch (err: any) {
      alert(`Failed to update outreach contact: ${err.message || "Unknown error"}`);
    } finally {
      setSavingContact(false);
    }
  };

  const handleResetQueue = async () => {
    if (!window.confirm("Are you sure you want to reset all 40 demo telemetry records to initial WAITING state?")) {
      return;
    }
    try {
      setLoading(true);
      await resetTelemetryQueueApi();
      setSelectedRecord(null);
      await loadQueue();
      setActionSuccessMsg("Telemetry demonstration queue has been reset to initial WAITING state.");
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customForm.customerName || !customForm.amount) {
      alert("Please provide customer name and transaction amount.");
      return;
    }
    try {
      setCreatingCustom(true);
      const created = await createCustomTelemetryApi({
        customerName: customForm.customerName,
        customerEmail: customForm.customerEmail,
        customerPhone: customForm.customerPhone,
        customerType: customForm.customerType,
        amount: Number(customForm.amount),
        currency: customForm.currency,
        paymentMethod: customForm.paymentMethod,
        paymentRail: customForm.paymentRail,
        notes: customForm.notes,
        events: [
          {
            eventId: `ev-${Date.now()}-1`,
            timestamp: new Date().toISOString(),
            eventType: "CUSTOM_TELEMETRY_SIGNAL_RECORDED",
            source: "operator_ingestion",
            payload: { notes: customForm.notes || "Operator submitted custom observable dataset." },
          },
        ],
      });
      setShowCreateModal(false);
      setCustomForm({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        customerType: "INDIVIDUAL",
        amount: 3500,
        currency: "INR",
        paymentMethod: "UPI",
        paymentRail: "UPI AutoPay / Web",
        notes: "",
      });
      await loadQueue();
      setActionSuccessMsg(`Created custom telemetry record ${created.id}`);
    } catch (err: any) {
      alert(`Creation failed: ${err.message}`);
    } finally {
      setCreatingCustom(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    if (filter === "WAITING" && item.status !== "WAITING") return false;
    if (filter === "AI_DETECTED" && item.status !== "AI_DETECTED" && item.status !== "RECOVERY_ACTIVE") return false;
    if (filter === "RECOVERED" && item.status !== "RECOVERED") return false;
    if (filter === "ESCALATED" && item.status !== "ESCALATED") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.customerName.toLowerCase().includes(q);
      const matchBatch = item.title.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      const matchEmail = (item.customerEmail || "").toLowerCase().includes(q);
      const matchScenario = (item.aiAnalysis?.detectedScenarioType || "").toLowerCase().includes(q);
      const matchRail = item.paymentRail.toLowerCase().includes(q);
      if (!matchName && !matchBatch && !matchEmail && !matchScenario && !matchRail) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="page-container" style={{ paddingBottom: "60px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
              Synthetic Telemetry Queue
            </h1>
            <span
              style={{
                background: "rgba(214, 243, 107, 0.15)",
                color: "#d6f36b",
                border: "1px solid rgba(214, 243, 107, 0.3)",
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              40 DEMO SIGNALS
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8", maxWidth: "800px" }}>
            Real-time observable telemetry pipeline. Start AI diagnosis one by one to verify Gemini's ability to classify revenue risk from raw event streams, gateway codes, and session signals.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#e2e8f0",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>+</span> Custom Signal
          </button>
          <button
            onClick={handleResetQueue}
            title="Reset demo queue back to 40 unanalyzed WAITING items"
            style={{
              background: "transparent",
              border: "1px solid #334155",
              color: "#94a3b8",
              padding: "7px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ↻ Reset Queue
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div
          style={{
            background: "rgba(22, 101, 52, 0.2)",
            border: "1px solid rgba(34, 197, 94, 0.4)",
            color: "#4ade80",
            padding: "10px 14px",
            borderRadius: "6px",
            fontSize: "13px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✓ {actionSuccessMsg}</span>
          <button
            onClick={() => setActionSuccessMsg(null)}
            style={{ background: "transparent", border: "none", color: "#4ade80", cursor: "pointer", fontSize: "14px" }}
          >
            ✕
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            background: "rgba(220, 38, 38, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#fca5a5",
            padding: "12px 16px",
            borderRadius: "6px",
            fontSize: "13px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠️ {errorMsg}</span>
          <button
            onClick={loadQueue}
            style={{
              background: "#dc2626",
              border: "none",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Metrics Dashboard Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "14px 16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Signals
          </span>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
            {summary.totalSignals}
          </div>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Raw telemetry records</span>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "14px 16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Awaiting AI
          </span>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#e2e8f0", marginTop: "4px" }}>
            {summary.waitingCount}
          </div>
          <span style={{ fontSize: "11px", color: "#eab308" }}>Ready for operator start</span>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "14px 16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            AI Diagnosed
          </span>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
            {summary.analyzedCount}
          </div>
          <span style={{ fontSize: "11px", color: "#38bdf8" }}>Classified by Gemini</span>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "14px 16px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Recovered / Resolved
          </span>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#4ade80", marginTop: "4px" }}>
            {summary.recoveredCount}
          </div>
          <span style={{ fontSize: "11px", color: "#4ade80" }}>Revenue recovered</span>
        </div>

        <div
          style={{
            background: "rgba(214, 243, 107, 0.05)",
            border: "1px solid rgba(214, 243, 107, 0.3)",
            padding: "14px 16px",
            borderRadius: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#d6f36b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              AI Detection Accuracy
            </span>
            <span
              style={{
                background: "#d6f36b",
                color: "#0f172a",
                fontSize: "10px",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: "4px",
              }}
            >
              {summary.accuracyPercentage}%
            </span>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#d6f36b", marginTop: "4px" }}>
            {summary.correctDetections} / {summary.evaluatedCount}
          </div>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>Ground Truth Matches</span>
        </div>
      </div>

      {/* CHANNEL READINESS & VERIFICATION PANEL */}
      <div
        id="channel-readiness-panel"
        style={{
          background: "#08101a",
          border: "1px solid #1e293b",
          borderRadius: "10px",
          padding: "16px 20px",
          marginBottom: "20px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px" }}>📡</span>
              <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Outreach Channel Readiness & Provider State
              </h2>
              <span style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 600 }}>
                REAL DISPATCH ADAPTERS
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8" }}>
              Recoverly executes real API calls to Resend and Twilio. Review carrier restrictions and open provider configuration below:
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <a
              id="btn-open-resend-settings-top"
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "#0f172a",
                border: "1px solid #1e3a5f",
                color: "#38bdf8",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
              }}
            >
              <span>✉️ OPEN RESEND SETTINGS ↗</span>
            </a>
            <a
              id="btn-verify-phone-top"
              href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "#0f172a",
                border: "1px solid #7c2d12",
                color: "#fb923c",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
              }}
            >
              <span>📱 VERIFY PHONE IN TWILIO ↗</span>
            </a>
            <a
              id="btn-join-whatsapp-top"
              href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "#0f172a",
                border: "1px solid #064e3b",
                color: "#4ade80",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
              }}
            >
              <span>💬 OPEN TWILIO WHATSAPP SANDBOX ↗</span>
            </a>
          </div>
        </div>

        {/* 3 Channels Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
          {/* EMAIL */}
          <div
            id="channel-card-email"
            style={{
              background: "#0b1322",
              border: "1px solid #1e3a5f",
              borderRadius: "8px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#93c5fd", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>📧</span> EMAIL (Resend)
                </span>
                <span style={{ background: "rgba(251, 146, 60, 0.15)", color: "#fb923c", border: "1px solid rgba(251, 146, 60, 0.3)", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>
                  RESTRICTED — TEST SENDER
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
                Current Resend testing sender is not configured for arbitrary recipient addresses.
              </p>
            </div>
            <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10.5px", color: "#64748b" }}>Provider: Resend</span>
              <a
                id="link-open-resend-settings"
                href="https://resend.com/domains"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  color: "#38bdf8",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "5px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                OPEN RESEND SETTINGS →
              </a>
            </div>
          </div>

          {/* SMS */}
          <div
            id="channel-card-sms"
            style={{
              background: "#0b1322",
              border: "1px solid #451a03",
              borderRadius: "8px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#fdba74", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>📱</span> SMS (Twilio Trial)
                </span>
                <span style={{ background: "rgba(251, 146, 60, 0.15)", color: "#fb923c", border: "1px solid rgba(251, 146, 60, 0.3)", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>
                  TRIAL RESTRICTED
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
                Twilio trial delivers to pre-verified Caller IDs only. Unverified numbers return Twilio code 21608.
              </p>
            </div>
            <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10.5px", color: "#fb923c" }}>Code 21608 guardrail</span>
              <a
                id="link-verify-phone-twilio"
                href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(251, 146, 60, 0.12)",
                  border: "1px solid rgba(251, 146, 60, 0.3)",
                  color: "#fb923c",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "5px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                VERIFY PHONE IN TWILIO →
              </a>
            </div>
          </div>

          {/* WHATSAPP */}
          <div
            id="channel-card-whatsapp"
            style={{
              background: "#0b1322",
              border: "1px solid #064e3b",
              borderRadius: "8px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#86efac", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>💬</span> WHATSAPP (Twilio Sandbox)
                </span>
                <span style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)", padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>
                  SANDBOX RESTRICTED
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
                Join this WhatsApp Sandbox with the test phone number before starting WhatsApp recovery.
              </p>
            </div>
            <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10.5px", color: "#4ade80" }}>Sandbox keyword join</span>
              <a
                id="link-open-whatsapp-sandbox"
                href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(74, 222, 128, 0.12)",
                  border: "1px solid rgba(74, 222, 128, 0.3)",
                  color: "#4ade80",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "5px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                OPEN TWILIO WHATSAPP SANDBOX →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Filter */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
          background: "#0f172a",
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { key: "ALL", label: "All Signals", count: summary.totalSignals },
            { key: "WAITING", label: "Waiting for AI", count: summary.waitingCount },
            { key: "AI_DETECTED", label: "AI Diagnosed", count: summary.analyzedCount },
            { key: "RECOVERED", label: "Recovered", count: summary.recoveredCount },
            { key: "ESCALATED", label: "Escalated", count: summary.escalatedCount },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              style={{
                background: filter === tab.key ? "#1e293b" : "transparent",
                border: filter === tab.key ? "1px solid #334155" : "1px solid transparent",
                color: filter === tab.key ? "#f8fafc" : "#94a3b8",
                padding: "5px 10px",
                borderRadius: "5px",
                fontSize: "12px",
                fontWeight: filter === tab.key ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  background: filter === tab.key ? "#334155" : "#1e293b",
                  padding: "1px 5px",
                  borderRadius: "10px",
                  fontSize: "10px",
                  color: filter === tab.key ? "#d6f36b" : "#64748b",
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ minWidth: "260px" }}>
          <input
            type="text"
            placeholder="Search signals, customers, rails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: "#020617",
              border: "1px solid #1e293b",
              color: "#f8fafc",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Telemetry Queue List / Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>
          <div style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid #334155", borderTopColor: "#d6f36b", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "12px" }}></div>
          <div>Loading synthetic telemetry queue...</div>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "50px 20px",
            background: "#0f172a",
            borderRadius: "8px",
            border: "1px solid #1e293b",
            color: "#94a3b8",
          }}
        >
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>📡</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0" }}>No telemetry records match filter</div>
          <p style={{ fontSize: "12px", marginTop: "4px" }}>Try changing your status filter or clearing the search query.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredQueue.map((item) => {
            const isAnalyzing = analyzingId === item.id;
            const isWaiting = item.status === "WAITING";
            const isDetected = item.status !== "WAITING";
            const analysis = item.aiAnalysis;
            const evaluation = item.evaluation;

            return (
              <div
                key={item.id}
                style={{
                  background: "#0f172a",
                  border: isDetected ? "1px solid #1e3a5f" : "1px solid #1e293b",
                  borderRadius: "8px",
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  transition: "border-color 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                  {/* Left Metadata */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", minWidth: "260px", flex: 1 }}>
                    <div
                      style={{
                        background: "#1e293b",
                        border: "1px solid #334155",
                        color: "#d6f36b",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        fontWeight: 700,
                        padding: "4px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      #{item.batchNumber.toString().padStart(2, "0")}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <strong style={{ fontSize: "14px", color: "#f8fafc" }}>{item.title}</strong>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: 600,
                            background:
                              item.status === "RECOVERED"
                                ? "rgba(34, 197, 94, 0.2)"
                                : item.status === "ESCALATED"
                                ? "rgba(239, 68, 68, 0.2)"
                                : item.status === "AI_DETECTED" || item.status === "RECOVERY_ACTIVE"
                                ? "rgba(56, 189, 248, 0.2)"
                                : "rgba(148, 163, 184, 0.15)",
                            color:
                              item.status === "RECOVERED"
                                ? "#4ade80"
                                : item.status === "ESCALATED"
                                ? "#f87171"
                                : item.status === "AI_DETECTED" || item.status === "RECOVERY_ACTIVE"
                                ? "#38bdf8"
                                : "#94a3b8",
                          }}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                        Customer: <span style={{ color: "#cbd5e1" }}>{item.customerName}</span> ({item.customerType}) • {item.currency} {item.amount.toLocaleString()} ({item.paymentRail})
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        {item.events.length} Telemetry Events • Last: {item.events[item.events.length - 1]?.eventType || "INGESTED"}
                      </div>
                    </div>
                  </div>

                  {/* Outbound Recovery Outreach Destination Box */}
                  <div
                    style={{
                      background: item.demoOutreachContact?.customized ? "rgba(56, 189, 248, 0.08)" : "#0b1329",
                      border: item.demoOutreachContact?.customized ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid #1e293b",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                      minWidth: "230px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "10px", color: item.demoOutreachContact?.customized ? "#38bdf8" : "#94a3b8", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.4px" }}>
                        {item.demoOutreachContact?.customized ? "🎯 Custom Outreach Target" : "👤 Default Synthetic Contact"}
                      </span>
                      {isWaiting ? (
                        <button
                          onClick={() => handleOpenEditContact(item)}
                          style={{
                            background: "transparent",
                            border: "1px solid #334155",
                            color: "#38bdf8",
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "1px 5px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          ✎ Edit
                        </button>
                      ) : (
                        <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>🔒 Locked</span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
                      📧 {item.demoOutreachContact?.email || item.customerEmail || "No email set"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
                      📱 {item.demoOutreachContact?.phone || item.customerPhone || "No phone set"}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {isWaiting ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          onClick={() => handleOpenEditContact(item)}
                          style={{
                            background: "#1e293b",
                            border: "1px solid #334155",
                            color: "#e2e8f0",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          [EDIT CONTACT]
                        </button>
                        <button
                          disabled={isAnalyzing}
                          onClick={() => handleStartAnalysis(item.id)}
                          style={{
                            background: "#d6f36b",
                            border: "none",
                            color: "#0f172a",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: isAnalyzing ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            boxShadow: "0 2px 8px rgba(214, 243, 107, 0.2)",
                          }}
                        >
                          {isAnalyzing ? (
                            <>
                              <span style={{ display: "inline-block", width: "12px", height: "12px", border: "2px solid #0f172a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></span>
                              <span>Diagnosing...</span>
                            </>
                          ) : (
                            <>
                              <span>⚡</span>
                              <span>START AI ANALYSIS</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => setSelectedRecord(item)}
                          style={{
                            background: "#1e293b",
                            border: "1px solid #334155",
                            color: "#e2e8f0",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          View AI Analysis
                        </button>
                        {item.createdIncidentId && (
                          <button
                            onClick={() => onNavigate("recovery", item.createdIncidentId)}
                            style={{
                              background: "rgba(56, 189, 248, 0.15)",
                              border: "1px solid rgba(56, 189, 248, 0.3)",
                              color: "#38bdf8",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Open Case ↗
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Diagnostic Output Banner (if diagnosed) */}
                {isDetected && analysis && (
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid #1e3342",
                      borderRadius: "6px",
                      padding: "10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                          AI DIAGNOSED RISK:
                        </span>
                        <span
                          style={{
                            background: "rgba(214, 243, 107, 0.15)",
                            color: "#d6f36b",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {analysis.detectedScenarioType}
                        </span>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                          ({analysis.confidence}% confidence • {analysis.modelName})
                        </span>
                      </div>

                      {evaluation && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "10.5px", color: "#64748b" }}>Ground Truth:</span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: evaluation.match ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              color: evaluation.match ? "#4ade80" : "#f87171",
                              border: evaluation.match ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                            }}
                          >
                            {evaluation.match ? "✓ MATCH" : `≠ MISMATCH (${evaluation.groundTruth})`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                      <strong>Root Cause:</strong> {analysis.rootCause}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", paddingTop: "6px", borderTop: "1px solid #1e293b" }}>
                      <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                        <strong>Strategy:</strong> {analysis.recommendedStrategy} (Channel: {analysis.recommendedChannel})
                      </div>
                      {item.routeMapping && (
                        <button
                          onClick={() => onNavigate(item.routeMapping!.pageKey as PageKey, item.createdIncidentId)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#d6f36b",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: "0 4px",
                            textDecoration: "underline",
                          }}
                        >
                          Go to {item.routeMapping.pageTitle} →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI Diagnostic Detail Modal */}
      {selectedRecord && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0b1329",
              border: "1px solid #1e3a5f",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "840px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                    Telemetry Risk Diagnosis: {selectedRecord.title}
                  </h2>
                  <span
                    style={{
                      background: "rgba(214, 243, 107, 0.15)",
                      color: "#d6f36b",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    #{selectedRecord.batchNumber.toString().padStart(2, "0")}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                  Raw Customer & Payment Telemetry Stream Ingestion
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* AI Diagnosis Result Summary */}
            {selectedRecord.aiAnalysis ? (
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid #1e3a5f",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                      Gemini AI Classification:
                    </span>
                    <span
                      style={{
                        background: "#d6f36b",
                        color: "#0f172a",
                        padding: "3px 10px",
                        borderRadius: "4px",
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {selectedRecord.aiAnalysis.detectedScenarioType}
                    </span>
                    <span style={{ fontSize: "12px", color: "#38bdf8" }}>
                      {selectedRecord.aiAnalysis.confidence}% Confidence
                    </span>
                  </div>

                  {selectedRecord.evaluation && (
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: selectedRecord.evaluation.match ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                        color: selectedRecord.evaluation.match ? "#4ade80" : "#f87171",
                        border: selectedRecord.evaluation.match ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(239, 68, 68, 0.4)",
                      }}
                    >
                      Ground Truth: {selectedRecord.evaluation.match ? "✓ MATCH" : `MISMATCH (${selectedRecord.evaluation.groundTruth})`}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: "13px", color: "#e2e8f0" }}>
                  <strong style={{ color: "#d6f36b" }}>Root Cause Diagnosis:</strong> {selectedRecord.aiAnalysis.rootCause}
                </div>

                <div>
                  <strong style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                    Empirical Observable Evidence:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {selectedRecord.aiAnalysis.evidence.map((ev, idx) => (
                      <li key={idx}>{ev}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                  <strong style={{ color: "#cbd5e1" }}>AI Reasoning Trace:</strong> {selectedRecord.aiAnalysis.reasoning}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>RECOMMENDED INITIAL STRATEGY</span>
                    <strong style={{ fontSize: "12px", color: "#f8fafc" }}>{selectedRecord.aiAnalysis.recommendedStrategy}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>RECOMMENDED CHANNEL</span>
                    <strong style={{ fontSize: "12px", color: "#38bdf8" }}>{selectedRecord.aiAnalysis.recommendedChannel}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "16px", background: "#0f172a", borderRadius: "8px", textAlign: "center" }}>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>This record has not yet been analyzed by AI.</p>
                <button
                  onClick={() => {
                    handleStartAnalysis(selectedRecord.id);
                  }}
                  style={{
                    marginTop: "12px",
                    background: "#d6f36b",
                    border: "none",
                    color: "#0f172a",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ⚡ Run Gemini Detection Now
                </button>
              </div>
            )}

            {/* Observable Telemetry Raw Event Stream */}
            <div>
              <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Raw Observable Telemetry Event Stream ({selectedRecord.events.length} Events)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
                {selectedRecord.events.map((ev, idx) => (
                  <div
                    key={ev.eventId || idx}
                    style={{
                      background: "#020617",
                      border: "1px solid #1e293b",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontFamily: "monospace",
                      fontSize: "11.5px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", marginBottom: "4px" }}>
                      <span style={{ color: "#d6f36b", fontWeight: 600 }}>{ev.eventType}</span>
                      <span>{ev.timestamp} • Source: {ev.source}</span>
                    </div>
                    <pre style={{ margin: 0, color: "#cbd5e1", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #1e293b" }}>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>

              {selectedRecord.createdIncidentId && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      const id = selectedRecord.createdIncidentId;
                      setSelectedRecord(null);
                      onNavigate("agent", id);
                    }}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#d6f36b",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✦ Open in AI Agent
                  </button>
                  <button
                    onClick={() => {
                      const id = selectedRecord.createdIncidentId;
                      setSelectedRecord(null);
                      onNavigate("recovery", id);
                    }}
                    style={{
                      background: "#38bdf8",
                      border: "none",
                      color: "#0f172a",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Open Recovery Incident ↗
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Telemetry Creator Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <form
            onSubmit={handleCreateCustom}
            style={{
              background: "#0b1329",
              border: "1px solid #1e3a5f",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "540px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                Create Custom Telemetry Signal
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
              Submit raw customer telemetry into the demo queue. Do NOT select a scenario class—Gemini AI will discover it autonomously!
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customForm.customerName}
                  onChange={(e) => setCustomForm({ ...customForm, customerName: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Customer Type</label>
                <select
                  value={customForm.customerType}
                  onChange={(e) => setCustomForm({ ...customForm, customerType: e.target.value as any })}
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px" }}
                >
                  <option value="INDIVIDUAL">INDIVIDUAL</option>
                  <option value="BUSINESS">BUSINESS</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Email</label>
                <input
                  type="email"
                  value={customForm.customerEmail}
                  onChange={(e) => setCustomForm({ ...customForm, customerEmail: e.target.value })}
                  placeholder="ramesh@example.com"
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Phone</label>
                <input
                  type="text"
                  value={customForm.customerPhone}
                  onChange={(e) => setCustomForm({ ...customForm, customerPhone: e.target.value })}
                  placeholder="+91 98000 00000"
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={customForm.amount}
                  onChange={(e) => setCustomForm({ ...customForm, amount: Number(e.target.value) })}
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Payment Method</label>
                <select
                  value={customForm.paymentMethod}
                  onChange={(e) => setCustomForm({ ...customForm, paymentMethod: e.target.value })}
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px" }}
                >
                  <option value="UPI">UPI</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="NETBANKING">NetBanking</option>
                  <option value="BANK_TRANSFER">Bank Transfer (Invoice)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Observable Context / Notes</label>
              <textarea
                rows={2}
                value={customForm.notes}
                onChange={(e) => setCustomForm({ ...customForm, notes: e.target.value })}
                placeholder="e.g. Card decline code 51 returned during subscription renew"
                style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", color: "#f8fafc", padding: "7px 10px", borderRadius: "5px", fontSize: "12px", outline: "none" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", padding: "7px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingCustom}
                style={{ background: "#d6f36b", border: "none", color: "#0f172a", padding: "7px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
              >
                {creatingCustom ? "Creating..." : "Add to Queue"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Outreach Contact Modal */}
      {editingContactRecord && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(3px)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <form
            onSubmit={handleSaveContact}
            style={{
              background: "#0b1329",
              border: "1px solid #1e3a5f",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "520px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      color: "#d6f36b",
                      fontFamily: "monospace",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    RECORD #{editingContactRecord.batchNumber.toString().padStart(2, "0")}
                  </span>
                  <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                    Edit Outreach Contact
                  </h2>
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                  Signal: <strong style={{ color: "#e2e8f0" }}>{editingContactRecord.title}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingContactRecord(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: "rgba(56, 189, 248, 0.08)",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "11.5px",
                color: "#94a3b8",
                lineHeight: "1.5",
              }}
            >
              <strong style={{ color: "#38bdf8", display: "block", marginBottom: "2px" }}>
                🔒 Telemetry Ground Truth Isolation
              </strong>
              This modifies ONLY the destination for outbound recovery communication (SMS, WhatsApp, Email). Raw telemetry events, financial context, and AI detection classification remain strictly untouched.
            </div>

            <div>
              <label style={{ fontSize: "11.5px", color: "#e2e8f0", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                Outbound Destination Email
              </label>
              <input
                type="email"
                value={editContactForm.email}
                onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })}
                placeholder="e.g. your-verified-email@company.com"
                style={{
                  width: "100%",
                  background: "#020617",
                  border: "1px solid #1e293b",
                  color: "#f8fafc",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "10.5px", color: "#64748b", display: "block", marginTop: "4px" }}>
                Target address for automated recovery and payment link emails.
              </span>
            </div>

            <div>
              <label style={{ fontSize: "11.5px", color: "#e2e8f0", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                Outbound Destination Phone (SMS & WhatsApp)
              </label>
              <input
                type="text"
                value={editContactForm.phone}
                onChange={(e) => setEditContactForm({ ...editContactForm, phone: e.target.value })}
                placeholder="e.g. +91 9876543210 (include country code)"
                style={{
                  width: "100%",
                  background: "#020617",
                  border: "1px solid #1e293b",
                  color: "#f8fafc",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "10.5px", color: "#64748b", display: "block", marginTop: "4px" }}>
                Target phone number for Twilio SMS and WhatsApp notifications.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setEditingContactRecord(null)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingContact}
                style={{
                  background: "#38bdf8",
                  border: "none",
                  color: "#0f172a",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: savingContact ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {savingContact ? (
                  <>
                    <span style={{ display: "inline-block", width: "12px", height: "12px", border: "2px solid #0f172a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Outreach Contact</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 1: Resend Email Status & Info */}
      {showVerifyEmailModal && (
        <div
          id="modal-verify-email"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0b1329",
              border: "1px solid #1e3a5f",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "540px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>📧</span>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc", fontWeight: 700 }}>
                  Resend Email Channel Status
                </h3>
              </div>
              <button
                onClick={() => setShowVerifyEmailModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "rgba(251, 146, 60, 0.1)", border: "1px solid rgba(251, 146, 60, 0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ color: "#fb923c", fontWeight: 700 }}>⚠️ Test Sender Restriction</span>
                <span style={{ fontSize: "11px", background: "#7c2d12", color: "#ffedd5", padding: "1px 6px", borderRadius: "10px" }}>RESTRICTED</span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>
                Current Resend testing sender is not configured for arbitrary recipient addresses. Outbound deliveries via <code>onboarding@resend.dev</code> can only reach account-verified destination addresses in Resend.
              </p>
            </div>

            <div style={{ fontSize: "12.5px", color: "#94a3b8", lineHeight: 1.6, marginBottom: "20px" }}>
              <strong style={{ color: "#e2e8f0", display: "block", marginBottom: "6px" }}>
                Sender Configuration:
              </strong>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
                To deliver to arbitrary destination domains, configure and verify a custom domain in your Resend account dashboard.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <a
                href="https://resend.com/domains"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#0f172a",
                  border: "1px solid #1e3a5f",
                  color: "#38bdf8",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                OPEN RESEND SETTINGS ↗
              </a>
              <button
                onClick={() => setShowVerifyEmailModal(false)}
                style={{
                  background: "#38bdf8",
                  border: "none",
                  color: "#0f172a",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Twilio SMS Verification Guidance */}
      {showVerifyPhoneModal && (
        <div
          id="modal-verify-phone"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0b1329",
              border: "1px solid #1e3a5f",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "560px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>📱</span>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc", fontWeight: 700 }}>
                  Twilio SMS Trial Mode Requirements
                </h3>
              </div>
              <button
                onClick={() => setShowVerifyPhoneModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "rgba(251, 146, 60, 0.1)", border: "1px solid rgba(251, 146, 60, 0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ color: "#fb923c", fontWeight: 700 }}>⚠️ Carrier Guardrail Active</span>
                <span style={{ fontSize: "11px", background: "#7c2d12", color: "#ffedd5", padding: "1px 6px", borderRadius: "10px" }}>CODE 21608</span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>
                Twilio Free Trial accounts prohibit sending SMS to random unverified numbers. Sending SMS to an unverified phone returns error:
                <code style={{ display: "block", background: "#020617", padding: "4px 8px", borderRadius: "4px", color: "#fca5a5", marginTop: "6px", fontFamily: "monospace", fontSize: "11px" }}>
                  Twilio Error 21608: The number +91... is unverified. Trial accounts cannot send messages to unverified numbers.
                </code>
              </p>
            </div>

            <div style={{ fontSize: "12.5px", color: "#94a3b8", lineHeight: 1.6, marginBottom: "20px" }}>
              <strong style={{ color: "#e2e8f0", display: "block", marginBottom: "6px" }}>
                How Recoverly truthfully handles this:
              </strong>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <li>Recoverly makes a <strong>real Twilio API call</strong> for every SMS recovery attempt.</li>
                <li>If the phone is unverified, Twilio rejects the call with code 21608.</li>
                <li>Recoverly records <strong>FAILED</strong> with the exact Twilio provider error and feeds it to Gemini to decide fallback channels (e.g. Email or Human Escalation).</li>
                <li>If your phone is verified in the Twilio Console (under <em>Verified Caller IDs</em>), you will receive the real SMS!</li>
              </ul>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <a
                href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#0f172a",
                  border: "1px solid #7c2d12",
                  color: "#fb923c",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                VERIFY PHONE IN TWILIO ↗
              </a>
              <button
                onClick={() => setShowVerifyPhoneModal(false)}
                style={{
                  background: "#38bdf8",
                  border: "none",
                  color: "#0f172a",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Twilio WhatsApp Sandbox Setup */}
      {showJoinWhatsAppModal && (
        <div
          id="modal-join-whatsapp"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#0b1329",
              border: "1px solid #1e3a5f",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "560px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>💬</span>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc", fontWeight: 700 }}>
                  Twilio WhatsApp Sandbox Setup
                </h3>
              </div>
              <button
                onClick={() => setShowJoinWhatsAppModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>WhatsApp Sandbox Rule</span>
                <span style={{ fontSize: "11px", background: "#166534", color: "#dcfce7", padding: "1px 6px", borderRadius: "10px" }}>CODE 63015</span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>
                Meta & Twilio Sandbox require inbound opt-in before allowing outbound template/freeform messages. If the recipient has not joined the sandbox, Twilio returns:
                <code style={{ display: "block", background: "#020617", padding: "4px 8px", borderRadius: "4px", color: "#fca5a5", marginTop: "6px", fontFamily: "monospace", fontSize: "11px" }}>
                  Twilio Error 63015: Channel could not find a To address. Recipient has not joined the sandbox.
                </code>
              </p>
            </div>

            <div style={{ fontSize: "12.5px", color: "#94a3b8", lineHeight: 1.6, marginBottom: "20px" }}>
              <strong style={{ color: "#e2e8f0", display: "block", marginBottom: "6px" }}>
                To receive real WhatsApp messages on your phone:
              </strong>
              <ol style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <li>Open WhatsApp on your phone and start a chat with <strong>+1 415 523 8886</strong>.</li>
                <li>Send your Twilio Sandbox join keyword (e.g. <code>join &lt;your-sandbox-word&gt;</code>).</li>
                <li>Twilio will reply: <em>"You are all set! The sandbox is now connected."</em></li>
                <li>Click <strong>✏️ (pencil icon)</strong> on any waiting signal row, enter your phone number, and start AI analysis!</li>
              </ol>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <a
                href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#0f172a",
                  border: "1px solid #064e3b",
                  color: "#4ade80",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                OPEN TWILIO WHATSAPP SANDBOX ↗
              </a>
              <button
                onClick={() => setShowJoinWhatsAppModal(false)}
                style={{
                  background: "#38bdf8",
                  border: "none",
                  color: "#0f172a",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
