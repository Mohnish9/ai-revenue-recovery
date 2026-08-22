import { useState, useEffect } from "react";
import type { Subscription, RecoveryCase, SandboxIncidentResponse } from "../lib/types";
import {
  fetchSubscriptions,
  fetchRecoveryCases,
  executeCaseAction,
  fetchSandboxIncidentsApi,
  executeSandboxIncidentActionApi,
} from "../lib/api";
import { ActionConfirmModal, type ActionModalConfig } from "../components/ActionConfirmModal";

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [sandboxIncidents, setSandboxIncidents] = useState<SandboxIncidentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionAlert, setActionAlert] = useState<string | null>(null);

  // Modal
  const [modalConfig, setModalConfig] = useState<ActionModalConfig | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [subRes, casesRes, sandboxRes] = await Promise.all([
        fetchSubscriptions(100, statusFilter !== "ALL" ? statusFilter : undefined).catch(() => []),
        fetchRecoveryCases(100).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setSubscriptions(subRes);
      setCases(casesRes);
      setSandboxIncidents(
        sandboxRes.filter(
          (s) =>
            s.incident.scenarioTypeKey === "subscription-renewal-failure" ||
            s.incident.tag === "SUBSCRIPTION_RENEWAL_FAILURE" ||
            s.incident.scenarioTypeName.toLowerCase().includes("subscription")
        )
      );
    } catch (e: any) {
      setError(e.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleActionClick = (sub: Subscription, actionType: "REQUEST_PAYMENT_METHOD_UPDATE" | "RETRY_PAYMENT") => {
    const matchingCase = cases.find((c) => c.customer_id === sub.customer_id) || cases[0];
    const caseId = matchingCase?.id;

    setModalConfig({
      actionType,
      actionTitle: actionType === "REQUEST_PAYMENT_METHOD_UPDATE" ? "Dispatch Card & Payment Method Update Prompt" : "Trigger Recurring Subscription Auto-Retry",
      targetLabel: `${sub.customers?.name || "Customer"} (${sub.customers?.email})`,
      amountAtRisk: sub.amount,
      currency: sub.currency || "INR",
      description: actionType === "REQUEST_PAYMENT_METHOD_UPDATE"
        ? `Sends zero-friction mandate/card update portal link to ${sub.customers?.email || "customer"} to replace failing payment credentials.`
        : `Dispatches an instant smart retry attempt across payment gateways for subscription #${sub.id.slice(0, 8)}.`,
      defaultReason: `Subscription dunning action for status ${sub.status}`,
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

  const handleSandboxAction = async (sb: SandboxIncidentResponse, actionType: "REQUEST_PAYMENT_METHOD_UPDATE" | "RETRY_PAYMENT") => {
    try {
      const res = await executeSandboxIncidentActionApi(sb.incident.id, {
        actionType,
        strategyName: sb.analysis?.selectedStrategy || "Autonomous Churn Defense",
        reason: "Triggered from Subscriptions Churn Defense page",
      });
      setActionAlert(`[SANDBOX] Dispatched simulated ${actionType}. Auth code: ${res.simulation.simulatedGatewayResponse.authCode}.`);
      await loadData();
      setTimeout(() => setActionAlert(null), 6000);
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    }
  };

  const filteredSubscriptions = subscriptions.filter((s) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.customers?.name?.toLowerCase().includes(q) ||
      s.customers?.email?.toLowerCase().includes(q) ||
      s.billing_cycle.toLowerCase().includes(q)
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

  const pastDueCount =
    filteredSubscriptions.filter((s) => s.status === "PAST_DUE").length +
    filteredSandbox.length;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Operations & Churn Defense</span>
            <span className="status-pill warning" style={{ fontSize: "9px" }}>⚡ REAL DB + SANDBOX</span>
          </div>
          <h1>Subscriptions & Involuntary Churn Defense</h1>
          <p>Prevent revenue leakage from recurring billing failures, expired mandates, and card churn.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ background: "#ffffff", border: "1px solid #fed7aa", padding: "8px 14px", borderRadius: "8px", fontSize: "12px" }}>
            <span style={{ color: "#64748b" }}>Past Due / At Risk: </span>
            <strong style={{ color: "#c2410c" }}>{pastDueCount}</strong>
          </div>
          <button className="primary-button" onClick={loadData}>↻ Refresh</button>
        </div>
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
            🔒 <strong>{sandboxIncidents.length} Sandbox Subscription Incident(s) Active</strong>. Actions on these rows run in isolated simulation mode.
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

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PAST_DUE">PAST_DUE</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="PAUSED">PAUSED</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filteredSubscriptions.length + filteredSandbox.length}</strong> subscriptions
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching subscription records...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load subscriptions</h3>
            <p>{error}</p>
          </div>
        ) : filteredSubscriptions.length === 0 && filteredSandbox.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">🔄</div>
            <h3>No Subscriptions Found</h3>
            <p>No subscription records match the selected filter.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan Amount</th>
                  <th>Billing Cycle</th>
                  <th>Status</th>
                  <th>Failure Context</th>
                  <th>Next Payment</th>
                  <th>Churn Prevention</th>
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
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                        {sb.incident.currency || "₹"}{Number(sb.incident.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span className="status-pill neutral">{sb.incident.paymentMethod}</span>
                    </td>
                    <td>
                      <span className="status-pill danger">{sb.incident.status || "PAST_DUE"}</span>
                    </td>
                    <td>
                      <span className="status-pill warning" style={{ fontSize: "10px" }}>
                        {sb.incident.failureCode}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        Simulated auto-retry
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="outline-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleSandboxAction(sb, "REQUEST_PAYMENT_METHOD_UPDATE")}
                        >
                          ⚡ Update Prompt
                        </button>
                        <button
                          className="primary-button"
                          style={{ fontSize: "10px", padding: "4px 8px", background: "#f59e0b" }}
                          onClick={() => handleSandboxAction(sb, "RETRY_PAYMENT")}
                        >
                          ⚡ Sim Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Render Production Subscriptions */}
                {filteredSubscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.customers?.name || "Customer Account"}</strong>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{s.customers?.email}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                        ₹{Number(s.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span className="status-pill neutral">{s.billing_cycle}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${s.status === "ACTIVE" ? "success" : s.status === "PAST_DUE" ? "danger" : "warning"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{
                          background: s.failure_count > 0 ? "#fee2e2" : "#f1f5f9",
                          color: s.failure_count > 0 ? "#b91c1c" : "#475569",
                        }}
                      >
                        {s.failure_count} {s.failure_count === 1 ? "failure" : "failures"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {s.next_payment_date || "Pending retry"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="outline-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleActionClick(s, "REQUEST_PAYMENT_METHOD_UPDATE")}
                        >
                          ⚡ Update Card
                        </button>
                        {s.status === "PAST_DUE" && (
                          <button
                            className="dark-button"
                            style={{ fontSize: "10px", padding: "4px 8px" }}
                            onClick={() => handleActionClick(s, "RETRY_PAYMENT")}
                          >
                            ⚡ Trigger Retry
                          </button>
                        )}
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
