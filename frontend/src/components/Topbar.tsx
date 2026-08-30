import { useState } from "react";
import type { PageKey } from "../lib/types";
import { useAuth } from "../lib/authContext";

interface TopbarProps {
  page: PageKey;
  onToggleMenu: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const pageTitles: Record<PageKey, string> = {
  dashboard: "Overview",
  "telemetry-queue": "Telemetry Queue",
  recovery: "Recovery Cases",
  "human-escalations": "Human Escalations",
  "failed-payments": "Failed Payments",
  transactions: "Transactions",
  invoices: "Invoices",
  subscriptions: "Subscriptions",
  "checkout-dropoffs": "Checkout Drop-offs",
  mandates: "Mandates",
  customers: "Customers",
  "policy-rules": "Policy Rules",
  health: "System Health",
  agent: "AI Agent",
  scenarios: "Scenario Center",
  "recovery-demo": "Recovery Demo",
  analytics: "Analytics",
  audit: "Audit Logs",
};

export function Topbar({ page, onToggleMenu, onRefresh, refreshing }: TopbarProps) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim().length > 0) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "OP";
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      setShowUserMenu(false);
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onToggleMenu} aria-label="Toggle navigation">
        ☰
      </button>

      <div className="breadcrumbs">
        <span>Workspaces</span>
        <b>/</b>
        <span>Acme Corp</span>
        <b>/</b>
        <strong>{pageTitles[page] || "Overview"}</strong>
      </div>

      <div className="top-actions">
        {onRefresh && (
          <button
            className="icon-button"
            onClick={onRefresh}
            title="Refresh live data"
            disabled={refreshing}
          >
            {refreshing ? "⟳" : "↻"}
          </button>
        )}
        {/* User Profile Pill & Logout Button */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#0d1b24",
              border: "1px solid #1e3342",
              padding: "4px 10px 4px 6px",
              borderRadius: "20px",
              color: "#f8fafc",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            <div className="user-avatar" style={{ width: "26px", height: "26px", fontSize: "11px", margin: 0 }}>
              {getInitials(user?.name, user?.email)}
            </div>
            <div style={{ textAlign: "left", lineHeight: "1.2" }}>
              <strong style={{ fontSize: "11.5px", color: "#f8fafc", display: "block" }}>
                {user?.name || "Operator"}
              </strong>
              <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>
                {user?.role === "REVENUE_ADMIN" ? "Admin" : "Operator"}
              </span>
            </div>
            <span style={{ fontSize: "9px", color: "#64748b" }}>⌄</span>
          </button>

          {showUserMenu && (
            <div
              style={{
                position: "absolute",
                top: "115%",
                right: 0,
                width: "220px",
                background: "#0d1b24",
                border: "1px solid #1e3342",
                borderRadius: "8px",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
                padding: "10px",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ borderBottom: "1px solid #1e3342", paddingBottom: "8px" }}>
                <strong style={{ fontSize: "12px", color: "#ffffff", display: "block" }}>
                  {user?.name || "Operator"}
                </strong>
                <span style={{ fontSize: "10.5px", color: "#94a3b8", display: "block", wordBreak: "break-all" }}>
                  {user?.email}
                </span>
                <span className="status-pill success" style={{ fontSize: "9px", marginTop: "4px", display: "inline-block" }}>
                  {user?.role || "REVENUE_ADMIN"}
                </span>
              </div>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  background: "#b91c1c",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {loggingOut ? "Signing out..." : "Sign Out ➔"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
