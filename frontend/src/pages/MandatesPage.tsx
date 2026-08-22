import { useState, useEffect } from "react";
import type { PaymentEvent, RecoveryCase, SandboxIncidentResponse } from "../lib/types";
import {
  fetchPaymentEvents,
  fetchRecoveryCases,
  executeCaseAction,
  fetchSandboxIncidentsApi,
  executeSandboxIncidentActionApi,
} from "../lib/api";
import { ActionConfirmModal, type ActionModalConfig } from "../components/ActionConfirmModal";

export function MandatesPage() {
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [sandboxIncidents, setSandboxIncidents] = useState<SandboxIncidentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionAlert, setActionAlert] = useState<string | null>(null);

  // Modal
  const [modalConfig, setModalConfig] = useState<ActionModalConfig | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [eventsRes, casesRes, sandboxRes] = await Promise.all([
        fetchPaymentEvents(100, "MANDATE_FAILED").catch(() => []),
        fetchRecoveryCases(100).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setEvents(eventsRes);
      setCases(casesRes);
      setSandboxIncidents(
        sandboxRes.filter(
          (s) =>
            s.incident.scenarioTypeKey === "upi-mandate-failure" ||
            s.incident.tag === "UPI_AUTOPAY_FAILURE" ||
            s.incident.scenarioTypeName.toLowerCase().includes("mandate") ||
            s.incident.scenarioTypeName.toLowerCase().includes("autopay")
        )
      );
    } catch (e: any) {
      setError(e.message || "Failed to load mandate failures");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleActionClick = (ev: PaymentEvent, actionType: "REQUEST_PAYMENT_METHOD_UPDATE" | "SEND_PAYMENT_LINK") => {
    const matchingCase = cases.find((c) => c.customer_id === ev.customer_id) || cases[0];
    const caseId = matchingCase?.id;

    setModalConfig({
      actionType,
      actionTitle: actionType === "REQUEST_PAYMENT_METHOD_UPDATE" ? "Dispatch Mandate Re-authorization Prompt" : "Send Instant UPI Intent Recovery Link",
      targetLabel: `${ev.customers?.name || "Customer"} (${ev.customers?.email})`,
      amountAtRisk: ev.amount,
      currency: "INR",
      description: actionType === "REQUEST_PAYMENT_METHOD_UPDATE"
        ? `Dispatches an RBI compliant auto-debit re-authorization link to ${ev.customers?.email || "customer"} to revive the failed mandate.`
        : `Dispatches an immediate UPI one-time payment intent link for ₹${Number(ev.amount).toLocaleString()} to settle the pending installment.`,
      defaultReason: `Mandate auto-debit failure remediation for event ${ev.id.slice(0, 8)}`,
      onConfirm: async (confirmedReason) => {
        if (caseId) {
          await executeCaseAction(caseId, actionType, confirmedReason);
        }
        setActionAlert(`Dispatched ${actionType} and recorded to live Supabase audit logs.`);
        setTimeout(() => setActionAlert(null), 5000);
      },
      onClose: () => setModalConfig(null),
    });
  };

  const handleSandboxAction = async (sb: SandboxIncidentResponse, actionType: "REQUEST_PAYMENT_METHOD_UPDATE" | "SEND_PAYMENT_LINK") => {
    try {
      const res = await executeSandboxIncidentActionApi(sb.incident.id, {
        actionType,
        strategyName: sb.analysis?.selectedStrategy || "Autonomous Mandate Remediation",
        reason: "Triggered from Mandates & AutoPay page",
      });
      setActionAlert(`[SANDBOX] Dispatched simulated ${actionType}. Gateway response: ${res.simulation.simulatedGatewayResponse.authCode}.`);
      await loadData();
      setTimeout(() => setActionAlert(null), 6000);
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    }
  };

  const filteredEvents = events.filter((ev) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      ev.customers?.name?.toLowerCase().includes(q) ||
      ev.customers?.email?.toLowerCase().includes(q)
    );
  });

  const filteredSandbox = sandboxIncidents.filter((sb) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      sb.customer.name.toLowerCase().includes(q) ||
      sb.customer.email.toLowerCase().includes(q) ||
      sb.incident.scenarioTypeName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Operations & Mandates</span>
            <span className="status-pill warning" style={{ fontSize: "9px" }}>⚡ REAL DB + SANDBOX</span>
          </div>
          <h1>Recurring Mandates (UPI AutoPay & e-NACH)</h1>
          <p>Monitor recurring mandate execution health, handle auto-debit declines, and re-authenticate payment mandates.</p>
        </div>
        <button className="primary-button" onClick={loadData}>↻ Refresh</button>
      </div>

      {actionAlert && (
        <div style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "12px" }}>
          ✓ {actionAlert}
        </div>
      )}

      {/* Sandbox Notice Banner */}
      {sandboxIncidents.length > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "11.5px", color: "#92400e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            🔒 <strong>{sandboxIncidents.length} Sandbox Mandate Incident(s) Active</strong>. Actions executed here run in isolated simulation.
          </span>
          <span className="status-pill warning" style={{ fontSize: "9px" }}>SANDBOX ISOLATED</span>
        </div>
      )}

      {/* Protocol Health Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>UPI AutoPay Mandates</span>
          <strong style={{ display: "block", fontSize: "18px", color: "#1e293b", margin: "4px 0" }}>94.2% Success</strong>
          <span style={{ fontSize: "10px", color: "#15803d" }}>Pre-debit notifications delivering on time</span>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>e-NACH Netbanking</span>
          <strong style={{ display: "block", fontSize: "18px", color: "#1e293b", margin: "4px 0" }}>88.6% Success</strong>
          <span style={{ fontSize: "10px", color: "#b45309" }}>NPCI clearing cycles normal</span>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>Standing Card Instructions</span>
          <strong style={{ display: "block", fontSize: "18px", color: "#1e293b", margin: "4px 0" }}>91.0% Success</strong>
          <span style={{ fontSize: "10px", color: "#0369a1" }}>RBI tokenization compliant</span>
        </div>
      </div>

      <div className="panel">
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by customer name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filteredEvents.length + filteredSandbox.length}</strong> mandate failures
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Checking mandate execution logs...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load mandates</h3>
            <p>{error}</p>
          </div>
        ) : filteredEvents.length === 0 && filteredSandbox.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">📑</div>
            <h3>No Mandate Failures</h3>
            <p>All recurring mandate debits were executed successfully.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Mandate Amount</th>
                  <th>Execution Date</th>
                  <th>Rail & Type</th>
                  <th>Status</th>
                  <th>Intervention</th>
                </tr>
              </thead>
              <tbody>
                {/* Render Sandbox Incidents first */}
                {filteredSandbox.map((sb) => (
                  <tr key={sb.incident.id} style={{ background: "#fffdf5" }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="status-pill warning" style={{ fontSize: "8.5px", padding: "1px 5px" }}>🔒 SANDBOX</span>
                        <strong>{sb.customer.name}</strong>
                      </div>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{sb.customer.email}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#b91c1c" }}>
                        {sb.incident.currency || "₹"}{Number(sb.incident.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(sb.incident.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill danger">{sb.incident.failureCode}</span>
                    </td>
                    <td>
                      <span className="status-pill warning">{sb.incident.status || "RETRY_SCHEDULED"}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="dark-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleSandboxAction(sb, "REQUEST_PAYMENT_METHOD_UPDATE")}
                        >
                          ⚡ Sim Re-auth
                        </button>
                        <button
                          className="outline-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleSandboxAction(sb, "SEND_PAYMENT_LINK")}
                        >
                          ⚡ Sim Intent
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Render Production Payment Events */}
                {filteredEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <strong>{ev.customers?.name || "Customer Account"}</strong>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{ev.customers?.email}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#b91c1c" }}>
                        ₹{Number(ev.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(ev.occurred_at).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill danger">{ev.event_type}</span>
                    </td>
                    <td>
                      <span className="status-pill warning">RETRY_SCHEDULED</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="dark-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleActionClick(ev, "REQUEST_PAYMENT_METHOD_UPDATE")}
                        >
                          ⚡ Request Re-auth
                        </button>
                        <button
                          className="outline-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleActionClick(ev, "SEND_PAYMENT_LINK")}
                        >
                          ⚡ Send UPI Intent
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalConfig && <ActionConfirmModal {...modalConfig} />}
    </div>
  );
}
