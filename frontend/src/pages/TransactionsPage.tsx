import { useState, useEffect } from "react";
import type { Transaction } from "../lib/types";
import { fetchTransactions } from "../lib/api";

interface TransactionsPageProps {
  onSelectCustomer?: (customerId: string) => void;
}

export function TransactionsPage({ onSelectCustomer }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchTransactions(
        100,
        statusFilter !== "ALL" ? statusFilter : undefined,
        methodFilter !== "ALL" ? methodFilter : undefined
      );
      setTransactions(res);
    } catch (e: any) {
      setError(e.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, methodFilter]);

  const filtered = transactions.filter((t) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.transaction_reference.toLowerCase().includes(q) ||
      t.payment_method.toLowerCase().includes(q) ||
      t.customers?.name?.toLowerCase().includes(q) ||
      t.customers?.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Operations</div>
          <h1>Transaction Ledger</h1>
          <p>Complete audit trail of all payment attempts across card networks, UPI, and bank transfers.</p>
        </div>
        <button className="primary-button" onClick={loadData}>↻ Refresh</button>
      </div>

      <div className="panel">
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search by reference, customer name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="PENDING">PENDING</option>
            <option value="REFUNDED">REFUNDED</option>
          </select>

          <select
            className="filter-select"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
          >
            <option value="ALL">All Methods</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
            <option value="NETBANKING">Netbanking</option>
            <option value="MANDATE">Mandate</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filtered.length}</strong> transactions
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Querying transaction records from database...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load transactions</h3>
            <p>{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">⇄</div>
            <h3>No Transactions Found</h3>
            <p>No transaction rows match your current search and filter criteria.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Timestamp</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.customers?.name || "Customer"}</strong>
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{t.customers?.email}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                        ₹{Number(t.amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span className="status-pill neutral">{t.payment_method}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${t.status === "SUCCESS" ? "success" : t.status === "FAILED" ? "danger" : "warning"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: "DM Mono", fontSize: "11px", color: "#475569" }}>
                        {t.transaction_reference}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(t.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <button
                        className="outline-button"
                        style={{ fontSize: "10px", padding: "4px 8px" }}
                        onClick={() => setSelectedTx(t)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="modal-backdrop" onClick={() => setSelectedTx(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Transaction Details</h2>
              <button className="icon-button" onClick={() => setSelectedTx(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>Transaction Reference</span>
                <div style={{ fontFamily: "DM Mono", fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>{selectedTx.transaction_reference}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <span style={{ color: "#64748b", fontSize: "10px" }}>Amount</span>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>₹{Number(selectedTx.amount).toLocaleString()} {selectedTx.currency}</div>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontSize: "10px" }}>Status</span>
                  <div><span className={`status-pill ${selectedTx.status === "SUCCESS" ? "success" : "danger"}`}>{selectedTx.status}</span></div>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontSize: "10px" }}>Payment Method</span>
                  <div>{selectedTx.payment_method}</div>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontSize: "10px" }}>Created At</span>
                  <div>{new Date(selectedTx.created_at).toLocaleString()}</div>
                </div>
              </div>

              {selectedTx.failure_reason && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px", borderRadius: "6px", color: "#991b1b" }}>
                  <strong>Failure Reason: </strong> {selectedTx.failure_reason}
                </div>
              )}

              {selectedTx.customers && (
                <div style={{ borderTop: "1px solid #edf1f4", paddingTop: "10px" }}>
                  <span style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>Customer</span>
                  <div style={{ fontWeight: 700 }}>{selectedTx.customers.name}</div>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>{selectedTx.customers.email}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="outline-button" onClick={() => setSelectedTx(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
