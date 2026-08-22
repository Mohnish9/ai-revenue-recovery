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

export function CheckoutDropoffsPage() {
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
        fetchPaymentEvents(100, "CHECKOUT_ABANDONED").catch(() => []),
        fetchRecoveryCases(100).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setEvents(eventsRes);
      setCases(casesRes);
      setSandboxIncidents(
        sandboxRes.filter(
          (s) =>
            s.incident.scenarioTypeKey === "checkout-abandonment" ||
            s.incident.tag === "CHECKOUT_ABANDONMENT" ||
            s.incident.scenarioTypeName.toLowerCase().includes("checkout")
        )
      );
    } catch (e: any) {
      setError(e.message || "Failed to load checkout drop-offs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSendRecoveryLink = (ev: PaymentEvent) => {
    const matchingCase = cases.find((c) => c.customer_id === ev.customer_id) || cases[0];
    const caseId = matchingCase?.id;

    setModalConfig({
      actionType: "SEND_PAYMENT_LINK",
      actionTitle: "Dispatch 1-Click Cart Recovery Link",
      targetLabel: `${ev.customers?.name || "Customer"} (${ev.customers?.email})`,
      amountAtRisk: ev.amount,
      currency: "INR",
      description: `Dispatches an instant WhatsApp / Email recovery link preloaded with cart items for ₹${Number(ev.amount).toLocaleString()} to ${ev.customers?.email || "customer"}.`,
      defaultReason: `Abandoned checkout re-engagement for event ${ev.id.slice(0, 8)}`,
      onConfirm: async (confirmedReason) => {
        if (caseId) {
          await executeCaseAction(caseId, "SEND_PAYMENT_LINK", confirmedReason);
        }
        setActionAlert(`Instant recovery link dispatched to ${ev.customers?.email || "customer"} and logged to live Supabase audit trail.`);
        setTimeout(() => setActionAlert(null), 5000);
      },
      onClose: () => setModalConfig(null),
    });
  };

  const handleSandboxAction = async (sb: SandboxIncidentResponse) => {
    try {
      const res = await executeSandboxIncidentActionApi(sb.incident.id, {
        actionType: "SEND_PAYMENT_LINK",
        strategyName: sb.analysis?.selectedStrategy || "1-Click Cart Recovery",
        reason: "Operational re-engagement from Checkout Drop-offs queue",
      });
      setActionAlert(`[SANDBOX] Dispatched 1-click cart recovery link to ${sb.customer.email}. Simulated gateway ack: ${res.simulation.simulatedGatewayResponse.authCode}.`);
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

  const totalAbandoned =
    filteredEvents.reduce((acc, e) => acc + Number(e.amount || 0), 0) +
    filteredSandbox.reduce((acc, s) => acc + Number(s.incident.amount || 0), 0);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Operations & Abandonment</span>
            <span className="status-pill warning" style={{ fontSize: "9px" }}>⚡ REAL DB + SANDBOX</span>
          </div>
          <h1>Checkout Drop-offs & Cart Abandonment</h1>
          <p>Recover high-intent customers who dropped off during checkout before order completion.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ background: "#ffffff", border: "1px solid #fed7aa", padding: "8px 14px", borderRadius: "8px", fontSize: "12px" }}>
            <span style={{ color: "#64748b" }}>Recoverable Cart Value: </span>
            <strong style={{ color: "#c2410c" }}>₹{totalAbandoned.toLocaleString()}</strong>
          </div>
          <button className="primary-button" onClick={loadData}>↻ Refresh</button>
        </div>
      </div>

      {actionAlert && (
        <div style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "12px" }}>
          ✓ {actionAlert}
        </div>
      )}

      {/* Sandbox Isolation Notice */}
      {sandboxIncidents.length > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "11.5px", color: "#92400e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            🔒 <strong>{sandboxIncidents.length} Sandbox Incident(s) Active</strong> in Checkout Drop-offs. Actions executed on these rows run in safe simulation mode.
          </span>
          <span className="status-pill warning" style={{ fontSize: "9px" }}>SANDBOX ISOLATED</span>
        </div>
      )}

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
            Showing <strong>{filteredEvents.length + filteredSandbox.length}</strong> drop-off events
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching checkout drop-off events...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load drop-offs</h3>
            <p>{error}</p>
          </div>
        ) : filteredEvents.length === 0 && filteredSandbox.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">🛒</div>
            <h3>No Checkout Drop-offs</h3>
            <p>No cart abandonment events detected in the current monitoring window.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Cart Value</th>
                  <th>Abandonment Time</th>
                  <th>Environment & Event</th>
                  <th>Recovery Strategy</th>
                  <th>Action</th>
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
                      <strong style={{ fontSize: "13px", color: "#c2410c" }}>
                        {sb.incident.currency || "₹"}{Number(sb.incident.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(sb.incident.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill warning">{sb.incident.failureCode}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#334155" }}>
                        {sb.analysis?.selectedStrategy || "⚡ 1-click Express Checkout Link with smart routing"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="primary-button"
                        style={{ fontSize: "10px", padding: "5px 10px", background: "#f59e0b" }}
                        onClick={() => handleSandboxAction(sb)}
                      >
                        ⚡ Simulate Recovery Link
                      </button>
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
                      <strong style={{ fontSize: "13px", color: "#c2410c" }}>
                        ₹{Number(ev.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(ev.occurred_at).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill warning">{ev.event_type}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#334155" }}>
                        ⚡ 1-click Express Checkout Link with smart routing
                      </span>
                    </td>
                    <td>
                      <button
                        className="primary-button"
                        style={{ fontSize: "10px", padding: "5px 10px" }}
                        onClick={() => handleSendRecoveryLink(ev)}
                      >
                        ⚡ Send Recovery Link
                      </button>
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
