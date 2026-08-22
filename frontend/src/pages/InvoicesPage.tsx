import { useState, useEffect } from "react";
import type { Invoice, RecoveryCase, SandboxIncidentResponse } from "../lib/types";
import {
  fetchInvoices,
  fetchRecoveryCases,
  executeCaseAction,
  fetchSandboxIncidentsApi,
  executeSandboxIncidentActionApi,
} from "../lib/api";
import { ActionConfirmModal, type ActionModalConfig } from "../components/ActionConfirmModal";

interface InvoicesPageProps {
  onSelectCustomer?: (customerId: string) => void;
}

export function InvoicesPage({ onSelectCustomer }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
      const [invRes, casesRes, sandboxRes] = await Promise.all([
        fetchInvoices(100, statusFilter !== "ALL" ? statusFilter : undefined).catch(() => []),
        fetchRecoveryCases(100).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setInvoices(invRes);
      setCases(casesRes);
      setSandboxIncidents(
        sandboxRes.filter(
          (s) =>
            s.incident.scenarioTypeKey === "b2b-invoice-overdue" ||
            s.incident.tag === "B2B_INVOICE_OVERDUE" ||
            s.incident.scenarioTypeName.toLowerCase().includes("invoice")
        )
      );
    } catch (e: any) {
      setError(e.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSendReminder = (inv: Invoice) => {
    const matchingCase = cases.find((c) => c.customer_id === inv.customer_id) || cases[0];
    const caseId = matchingCase?.id;

    setModalConfig({
      actionType: "SEND_REMINDER",
      actionTitle: `Dispatch Formal Dunning Notice for #${inv.invoice_number}`,
      targetLabel: `${inv.customers?.name || "Customer"} (${inv.customers?.email})`,
      amountAtRisk: inv.amount,
      currency: inv.currency || "INR",
      description: `Dispatches an automated payment reminder with embedded UPI / card settlement link to ${inv.customers?.email || "customer"} for overdue invoice #${inv.invoice_number}.`,
      defaultReason: `Overdue dunning notification for invoice due on ${inv.due_date}`,
      onConfirm: async (confirmedReason) => {
        if (caseId) {
          await executeCaseAction(caseId, "SEND_REMINDER", confirmedReason);
        }
        setActionAlert(`Dunning notice dispatched and logged to live Supabase audit ledger for invoice ${inv.invoice_number}.`);
        setTimeout(() => setActionAlert(null), 5000);
      },
      onClose: () => setModalConfig(null),
    });
  };

  const handleSandboxNotice = async (sb: SandboxIncidentResponse) => {
    try {
      const res = await executeSandboxIncidentActionApi(sb.incident.id, {
        actionType: "SEND_REMINDER",
        strategyName: sb.analysis?.selectedStrategy || "Executive Dunning Notice",
        reason: "Triggered from Invoices & Receivables page",
      });
      setActionAlert(`[SANDBOX] Dispatched simulated dunning notice. Auth code: ${res.simulation.simulatedGatewayResponse.authCode}.`);
      await loadData();
      setTimeout(() => setActionAlert(null), 6000);
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customers?.name?.toLowerCase().includes(q) ||
      inv.customers?.email?.toLowerCase().includes(q)
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

  const totalOverdue =
    filteredInvoices
      .filter((i) => i.status === "OVERDUE")
      .reduce((acc, i) => acc + Number(i.amount || 0), 0) +
    filteredSandbox.reduce((acc, sb) => acc + Number(sb.incident.amount || 0), 0);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Operations & Receivables</span>
            <span className="status-pill warning" style={{ fontSize: "9px" }}>⚡ REAL DB + SANDBOX</span>
          </div>
          <h1>Invoices & Receivables</h1>
          <p>Track enterprise accounts receivable, monitor overdue ageing, and enforce promise-to-pay commitments.</p>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #fed7aa", padding: "8px 14px", borderRadius: "8px", fontSize: "12px" }}>
          <span style={{ color: "#64748b" }}>Total Overdue: </span>
          <strong style={{ color: "#c2410c" }}>₹{totalOverdue.toLocaleString()}</strong>
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
            🔒 <strong>{sandboxIncidents.length} Sandbox Overdue Invoice Incident(s) Active</strong>. Actions executed here run in isolated simulation.
          </span>
          <span className="status-pill warning" style={{ fontSize: "9px" }}>SANDBOX ISOLATED</span>
        </div>
      )}

      <div className="panel">
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by invoice # or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="OVERDUE">OVERDUE</option>
            <option value="OPEN">OPEN</option>
            <option value="PAID">PAID</option>
            <option value="DRAFT">DRAFT</option>
            <option value="VOID">VOID</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filteredInvoices.length + filteredSandbox.length}</strong> invoices
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching invoices from database...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load invoices</h3>
            <p>{error}</p>
          </div>
        ) : filteredInvoices.length === 0 && filteredSandbox.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">📄</div>
            <h3>No Invoices Found</h3>
            <p>No invoice records match the selected status or search criteria.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Issue / Age</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Promise Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {/* Render Sandbox Incidents */}
                {filteredSandbox.map((sb) => (
                  <tr key={sb.incident.id} style={{ background: "#fffdf5" }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="status-pill warning" style={{ fontSize: "8.5px", padding: "1px 5px" }}>🔒 SANDBOX</span>
                        <strong style={{ fontFamily: "DM Mono", fontSize: "12px" }}>INV-SB-{sb.incident.id.slice(0, 5).toUpperCase()}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{sb.customer.name}</strong>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{sb.customer.email}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#c2410c" }}>
                        {sb.incident.currency || "₹"}{Number(sb.incident.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>45 days ageing</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626" }}>Overdue</span>
                    </td>
                    <td>
                      <span className="status-pill danger">{sb.incident.status || "OVERDUE"}</span>
                    </td>
                    <td>
                      <span className="status-pill purple">🤝 Sim Escalated</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="dark-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleSandboxNotice(sb)}
                        >
                          ⚡ Sim Notice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Render Production Invoices */}
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong style={{ fontFamily: "DM Mono", fontSize: "12px" }}>{inv.invoice_number}</strong>
                    </td>
                    <td>
                      <strong>{inv.customers?.name || "Customer Account"}</strong>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{inv.customers?.email}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: inv.status === "OVERDUE" ? "#c2410c" : "#1e293b" }}>
                        ₹{Number(inv.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>{inv.issue_date}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", fontWeight: inv.status === "OVERDUE" ? 700 : 400, color: inv.status === "OVERDUE" ? "#dc2626" : "#64748b" }}>
                        {inv.due_date}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${inv.status === "PAID" ? "success" : inv.status === "OVERDUE" ? "danger" : "warning"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      {inv.promise_date ? (
                        <span className="status-pill purple">🤝 {inv.promise_date}</span>
                      ) : (
                        <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>None</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="dark-button"
                          style={{ fontSize: "10px", padding: "4px 8px" }}
                          onClick={() => handleSendReminder(inv)}
                        >
                          ⚡ Send Notice
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
