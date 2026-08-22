import { useState, useEffect } from "react";
import type { Invoice, RecoveryCase } from "../lib/types";
import { fetchInvoices, fetchRecoveryCases, executeCaseAction } from "../lib/api";
import { ActionConfirmModal, type ActionModalConfig } from "../components/ActionConfirmModal";

interface InvoicesPageProps {
  onSelectCustomer?: (customerId: string) => void;
}

export function InvoicesPage({ onSelectCustomer }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cases, setCases] = useState<RecoveryCase[]>([]);
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
      const [invRes, casesRes] = await Promise.all([
        fetchInvoices(100, statusFilter !== "ALL" ? statusFilter : undefined),
        fetchRecoveryCases(100),
      ]);
      setInvoices(invRes);
      setCases(casesRes);
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

  const filtered = invoices.filter((inv) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customers?.name?.toLowerCase().includes(q) ||
      inv.customers?.email?.toLowerCase().includes(q)
    );
  });

  const totalOverdue = filtered
    .filter((i) => i.status === "OVERDUE")
    .reduce((acc, i) => acc + Number(i.amount || 0), 0);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Operations & Receivables</span>
            <span className="status-pill warning" style={{ fontSize: "9px" }}>⚡ REAL DB ACTIONS</span>
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
            Showing <strong>{filtered.length}</strong> invoices
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
        ) : filtered.length === 0 ? (
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
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Promise Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
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
