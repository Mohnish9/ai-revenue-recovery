import { useState } from "react";
import { ActionConfirmModal, type ActionModalConfig } from "../components/ActionConfirmModal";

export function PolicyRulesPage() {
  const [policies, setPolicies] = useState([
    {
      id: "pol-1",
      name: "Dynamic Multi-Acquirer Smart Retry",
      type: "RETRY_CASCADE",
      enabled: true,
      description: "Automatically reroutes failed card transactions through backup acquirer gateways based on real-time bank health.",
      params: "Intervals: 0h, 6h, 24h, 72h • Max attempts: 4",
      riskTier: "LOW_TO_MEDIUM",
    },
    {
      id: "pol-2",
      name: "High-Ticket Invoice Grace & Escalate",
      type: "ESCALATION",
      enabled: true,
      description: "When invoice > ₹15,000 goes overdue > 3 days, pause automated dunning and assign to Revenue Operations lead.",
      params: "Threshold: ₹15,000 • Grace window: 3 days",
      riskTier: "HIGH",
    },
    {
      id: "pol-3",
      name: "Instant WhatsApp UPI Intent Fallback",
      type: "COMMUNICATION",
      enabled: true,
      description: "When UPI AutoPay mandate fails, trigger personalized WhatsApp message with instant 1-click UPI Intent pay link.",
      params: "Delay: +15 mins • Expiry: 48h",
      riskTier: "ALL",
    },
    {
      id: "pol-4",
      name: "Card Expiry Proactive Update Prompt",
      type: "CHURN_PREVENTION",
      enabled: true,
      description: "Detect recurring subscription cards expiring within 15 days and send zero-friction payment method update link.",
      params: "Trigger: 15 days before billing • Channels: Email + SMS",
      riskTier: "MEDIUM",
    },
  ]);

  const [savedAlert, setSavedAlert] = useState(false);
  const [modalConfig, setModalConfig] = useState<ActionModalConfig | null>(null);

  const togglePolicy = (pol: typeof policies[0]) => {
    const nextState = !pol.enabled;
    setModalConfig({
      actionType: nextState ? "ENABLE_POLICY_RULE" : "DISABLE_POLICY_RULE",
      actionTitle: `${nextState ? "Enable" : "Disable"} Policy: ${pol.name}`,
      targetLabel: `Policy Engine (Rule ID: ${pol.id})`,
      description: `Updates the automated recovery rules engine to ${nextState ? "activate" : "deactivate"} "${pol.name}". Live payment events will immediately adhere to this configuration.`,
      defaultReason: `Operational update to recovery policy ${pol.id}`,
      onConfirm: async () => {
        setPolicies(policies.map((p) => (p.id === pol.id ? { ...p, enabled: nextState } : p)));
        setSavedAlert(true);
        setTimeout(() => setSavedAlert(false), 4000);
      },
      onClose: () => setModalConfig(null),
    });
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Intelligence & Governance</span>
            <span className="status-pill success" style={{ fontSize: "9px" }}>⚡ ACTIVE ENFORCEMENT</span>
          </div>
          <h1>Autonomous Policy Rules Engine</h1>
          <p>Configure dunning cascades, smart retry intervals, multi-channel failovers, and auto-escalation thresholds.</p>
        </div>
      </div>

      {savedAlert && (
        <div style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "12px" }}>
          ✓ Policy configurations synced and enforced by real-time recovery engine.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {policies.map((pol) => (
          <div key={pol.id} className="panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <strong style={{ fontSize: "14px", color: "#1e293b" }}>{pol.name}</strong>
                  <span className={`status-pill ${pol.enabled ? "success" : "neutral"}`}>
                    {pol.enabled ? "ACTIVE" : "PAUSED"}
                  </span>
                  <span className="status-pill info">{pol.type}</span>
                </div>
                <p style={{ margin: 0, color: "#64748b", fontSize: "12px", maxWidth: "700px" }}>
                  {pol.description}
                </p>
              </div>

              <button
                className={`outline-button ${pol.enabled ? "danger" : "primary"}`}
                style={{ fontSize: "11px", padding: "6px 12px" }}
                onClick={() => togglePolicy(pol)}
              >
                {pol.enabled ? "Disable Rule" : "Enable Rule"}
              </button>
            </div>

            <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "6px", fontSize: "11px", color: "#475569", marginTop: "12px", display: "flex", justifyContent: "space-between" }}>
              <span>⚙ <strong>Config: </strong> {pol.params}</span>
              <span>Target Tier: <strong>{pol.riskTier}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {modalConfig && <ActionConfirmModal {...modalConfig} />}
    </div>
  );
}
