import { useState, useEffect } from "react";
import type { Customer } from "../lib/types";
import { fetchCustomers } from "../lib/api";

interface CustomersPageProps {
  onSelectCustomer: (customerId: string) => void;
}

export function CustomersPage({ onSelectCustomer }: CustomersPageProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchCustomers(100, searchTerm || undefined);
      setCustomers(res);
    } catch (e: any) {
      setError(e.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchTerm]);

  const filtered = customers.filter((c) => {
    if (typeFilter !== "ALL" && c.customer_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Operations</div>
          <h1>Customer 360 Directory</h1>
          <p>Inspect payment history, recovery case records, subscriptions, and active risk across your customer base.</p>
        </div>
        <button className="primary-button" onClick={loadData}>↻ Refresh</button>
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

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All Account Types</option>
            <option value="INDIVIDUAL">INDIVIDUAL</option>
            <option value="BUSINESS">BUSINESS</option>
          </select>

          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
            Showing <strong>{filtered.length}</strong> customers
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Fetching customer profiles...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-illustration">⚠</div>
            <h3>Unable to load customers</h3>
            <p>{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">👥</div>
            <h3>No Customers Found</h3>
            <p>No customer records match your query.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Account Type</th>
                  <th>Customer Since</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onSelectCustomer(c.id)}>
                    <td>
                      <strong style={{ fontSize: "13px", color: "#1e293b" }}>{c.name}</strong>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "#475569" }}>{c.email}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>{c.phone || "—"}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${c.customer_type === "BUSINESS" ? "info" : "neutral"}`}>
                        {c.customer_type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      <button
                        className="dark-button"
                        style={{ fontSize: "10px", padding: "5px 10px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCustomer(c.id);
                        }}
                      >
                        Inspect 360 <span>→</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
