import { useState, useRef, useEffect } from "react";
import type { PageKey } from "../lib/types";
import { useAuth } from "../lib/authContext";

interface TopNavProps {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  openCasesCount?: number;
  openEscalatedCount?: number;
}

export type PrimaryNavKey =
  | "overview"
  | "telemetry-q"
  | "recovery-demo"
  | "operations"
  | "intelligence"
  | "insights";

export function TopNav({
  page,
  onNavigate,
  onRefresh,
  refreshing,
  openCasesCount = 0,
  openEscalatedCount = 0,
}: TopNavProps) {
  const { user, logout } = useAuth();
  const [openDropdown, setOpenDropdown] = useState<"operations" | "intelligence" | "insights" | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Determine which of the 6 primary nav items is active based on current page
  const getActivePrimaryNav = (): PrimaryNavKey => {
    if (page === "dashboard") return "overview";
    if (page === "telemetry-queue") return "telemetry-q";
    if (page === "recovery-demo") return "recovery-demo";
    if (
      [
        "recovery",
        "human-escalations",
        "customers",
        "failed-payments",
        "transactions",
        "invoices",
        "subscriptions",
        "checkout-dropoffs",
        "mandates",
        "scenarios",
      ].includes(page)
    ) {
      return "operations";
    }
    if (["policy-rules", "agent"].includes(page)) return "intelligence";
    if (["analytics", "audit"].includes(page)) return "insights";
    return "overview";
  };

  const activePrimary = getActivePrimaryNav();

  const handleNavClick = (primaryKey: PrimaryNavKey, targetPage?: PageKey) => {
    if (primaryKey === "overview") {
      setOpenDropdown(null);
      setMobileMenuOpen(false);
      onNavigate("dashboard");
    } else if (primaryKey === "telemetry-q") {
      setOpenDropdown(null);
      setMobileMenuOpen(false);
      onNavigate("telemetry-queue");
    } else if (primaryKey === "recovery-demo") {
      setOpenDropdown(null);
      setMobileMenuOpen(false);
      onNavigate("recovery-demo");
    } else if (primaryKey === "operations" || primaryKey === "intelligence" || primaryKey === "insights") {
      if (targetPage) {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
        onNavigate(targetPage);
      } else {
        setOpenDropdown((prev) => (prev === primaryKey ? null : primaryKey));
      }
    }
  };

  const handleItemSelect = (targetPage: PageKey) => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
    onNavigate(targetPage);
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

  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim().length > 0) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "OP";
  };

  return (
    <header className="aww-top-nav" ref={navRef}>
      <div className="aww-nav-container">
        {/* Left Side: Brand Logo */}
        <div className="aww-brand" onClick={() => handleNavClick("overview")}>
          <div className="aww-brand-mark">
            <span>R</span>
          </div>
          <span className="aww-brand-title">RECOVERLY</span>
        </div>

        {/* Center: The Exact Six Primary Navigation Items */}
        <nav className="aww-nav-links">
          {/* 1. Overview */}
          <button
            className={`aww-nav-btn ${activePrimary === "overview" ? "active" : ""}`}
            onClick={() => handleNavClick("overview")}
          >
            <span>Overview</span>
          </button>

          {/* 2. Telemetry Q */}
          <button
            className={`aww-nav-btn ${activePrimary === "telemetry-q" ? "active" : ""}`}
            onClick={() => handleNavClick("telemetry-q")}
          >
            <span>Telemetry Q</span>
          </button>

          {/* 3. Recovery Demo */}
          <button
            className={`aww-nav-btn ${activePrimary === "recovery-demo" ? "active" : ""}`}
            onClick={() => handleNavClick("recovery-demo")}
          >
            <span>Recovery Demo</span>
          </button>

          {/* 4. Operations (Grouped Dropdown) */}
          <div className="aww-dropdown-wrapper">
            <button
              className={`aww-nav-btn aww-nav-dropdown-btn ${activePrimary === "operations" ? "active" : ""} ${
                openDropdown === "operations" ? "open" : ""
              }`}
              onClick={() => handleNavClick("operations")}
            >
              <span>Operations</span>
              <span className="aww-caret">▾</span>
            </button>

            {openDropdown === "operations" && (
              <div className="aww-mega-dropdown aww-mega-dropdown-wide">
                <div className="aww-mega-columns">
                  {/* Column 1: Core Operations */}
                  <div className="aww-mega-col">
                    <div className="aww-mega-col-heading">Core Hubs</div>
                    <button
                      className={`aww-dropdown-item ${page === "recovery" ? "active" : ""}`}
                      onClick={() => handleItemSelect("recovery")}
                    >
                      <div className="aww-item-icon">↗</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">
                          Recovery Cases
                          {openCasesCount > 0 && (
                            <span className="aww-item-badge">{openCasesCount}</span>
                          )}
                        </div>
                        <div className="aww-item-desc">Active & scheduled autonomous recovery cases</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "human-escalations" ? "active" : ""}`}
                      onClick={() => handleItemSelect("human-escalations")}
                    >
                      <div className="aww-item-icon">👤</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">
                          Human Escalations
                          {openEscalatedCount > 0 && (
                            <span className="aww-item-badge danger">{openEscalatedCount}</span>
                          )}
                        </div>
                        <div className="aww-item-desc">Cases paused for human operator review</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "customers" ? "active" : ""}`}
                      onClick={() => handleItemSelect("customers")}
                    >
                      <div className="aww-item-icon">👥</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Customers</div>
                        <div className="aww-item-desc">Customer 360 risk profiles & ledger history</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "transactions" ? "active" : ""}`}
                      onClick={() => handleItemSelect("transactions")}
                    >
                      <div className="aww-item-icon">⇄</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Transactions</div>
                        <div className="aww-item-desc">Global multi-rail payment transactions</div>
                      </div>
                    </button>
                  </div>

                  {/* Column 2: Recovery / Problem Types (Part 1) */}
                  <div className="aww-mega-col">
                    <div className="aww-mega-col-heading">Payment Problem Types</div>
                    <button
                      className={`aww-dropdown-item ${page === "failed-payments" ? "active" : ""}`}
                      onClick={() => handleItemSelect("failed-payments")}
                    >
                      <div className="aww-item-icon">⚠</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Failed Payments</div>
                        <div className="aww-item-desc">Card declines & retry orchestration</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "failed-payments" ? "active" : ""}`}
                      onClick={() => handleItemSelect("failed-payments")}
                    >
                      <div className="aww-item-icon">💳</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Insufficient Funds</div>
                        <div className="aww-item-desc">Decline code 51 batch smart retries</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "failed-payments" ? "active" : ""}`}
                      onClick={() => handleItemSelect("failed-payments")}
                    >
                      <div className="aww-item-icon">📅</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Expired Card</div>
                        <div className="aww-item-desc">RBI tokenization card update flows</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "failed-payments" ? "active" : ""}`}
                      onClick={() => handleItemSelect("failed-payments")}
                    >
                      <div className="aww-item-icon">🔐</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">3DS Authentication Failure</div>
                        <div className="aww-item-desc">OTP timeouts & friction-free checkout links</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "failed-payments" ? "active" : ""}`}
                      onClick={() => handleItemSelect("failed-payments")}
                    >
                      <div className="aww-item-icon">⚡</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Bank / Gateway Timeout</div>
                        <div className="aww-item-desc">Acquirer downtime retry routing</div>
                      </div>
                    </button>
                  </div>

                  {/* Column 3: Recovery / Problem Types (Part 2) */}
                  <div className="aww-mega-col">
                    <div className="aww-mega-col-heading">Recurring & Channel Types</div>
                    <button
                      className={`aww-dropdown-item ${page === "checkout-dropoffs" ? "active" : ""}`}
                      onClick={() => handleItemSelect("checkout-dropoffs")}
                    >
                      <div className="aww-item-icon">🛒</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Checkout Abandonment</div>
                        <div className="aww-item-desc">High-intent funnel cart drop-off recovery</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "subscriptions" ? "active" : ""}`}
                      onClick={() => handleItemSelect("subscriptions")}
                    >
                      <div className="aww-item-icon">🔄</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Subscription Renewal Failure</div>
                        <div className="aww-item-desc">Past-due recurring plan dunning & grace periods</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "mandates" ? "active" : ""}`}
                      onClick={() => handleItemSelect("mandates")}
                    >
                      <div className="aww-item-icon">📑</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">UPI AutoPay / Mandates</div>
                        <div className="aww-item-desc">NPCI mandate limits & instant UPI intent</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "invoices" ? "active" : ""}`}
                      onClick={() => handleItemSelect("invoices")}
                    >
                      <div className="aww-item-icon">📄</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Overdue B2B Invoices</div>
                        <div className="aww-item-desc">Net-30 enterprise accounts receivable dunning</div>
                      </div>
                    </button>

                    <button
                      className={`aww-dropdown-item ${page === "scenarios" ? "active" : ""}`}
                      onClick={() => handleItemSelect("scenarios")}
                    >
                      <div className="aww-item-icon">⊞</div>
                      <div className="aww-item-text">
                        <div className="aww-item-title">Scenario Center</div>
                        <div className="aww-item-desc">Simulate recovery cadences & discount ROI</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Intelligence (Grouped Dropdown) */}
          <div className="aww-dropdown-wrapper">
            <button
              className={`aww-nav-btn aww-nav-dropdown-btn ${activePrimary === "intelligence" ? "active" : ""} ${
                openDropdown === "intelligence" ? "open" : ""
              }`}
              onClick={() => handleNavClick("intelligence")}
            >
              <span>Intelligence</span>
              <span className="aww-caret">▾</span>
            </button>

            {openDropdown === "intelligence" && (
              <div className="aww-mega-dropdown aww-dropdown-compact">
                <button
                  className={`aww-dropdown-item ${page === "policy-rules" ? "active" : ""}`}
                  onClick={() => handleItemSelect("policy-rules")}
                >
                  <div className="aww-item-icon">⚙</div>
                  <div className="aww-item-text">
                    <div className="aww-item-title">Policy Rules</div>
                    <div className="aww-item-desc">Governance thresholds & automated guardrails</div>
                  </div>
                </button>

                <button
                  className={`aww-dropdown-item ${page === "agent" ? "active" : ""}`}
                  onClick={() => handleItemSelect("agent")}
                >
                  <div className="aww-item-icon">✦</div>
                  <div className="aww-item-text">
                    <div className="aww-item-title">AI Agent</div>
                    <div className="aww-item-desc">Autonomous reasoning & multi-step execution loop</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 6. Insights (Grouped Dropdown) */}
          <div className="aww-dropdown-wrapper">
            <button
              className={`aww-nav-btn aww-nav-dropdown-btn ${activePrimary === "insights" ? "active" : ""} ${
                openDropdown === "insights" ? "open" : ""
              }`}
              onClick={() => handleNavClick("insights")}
            >
              <span>Insights</span>
              <span className="aww-caret">▾</span>
            </button>

            {openDropdown === "insights" && (
              <div className="aww-mega-dropdown aww-dropdown-compact">
                <button
                  className={`aww-dropdown-item ${page === "analytics" ? "active" : ""}`}
                  onClick={() => handleItemSelect("analytics")}
                >
                  <div className="aww-item-icon">▥</div>
                  <div className="aww-item-text">
                    <div className="aww-item-title">Analytics</div>
                    <div className="aww-item-desc">Recovery velocity, channel efficiency & cohorts</div>
                  </div>
                </button>

                <button
                  className={`aww-dropdown-item ${page === "audit" ? "active" : ""}`}
                  onClick={() => handleItemSelect("audit")}
                >
                  <div className="aww-item-icon">☷</div>
                  <div className="aww-item-text">
                    <div className="aww-item-title">Audit Logs</div>
                    <div className="aww-item-desc">Immutable compliance ledger & provider trace trail</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Right Side: Utilities, Status & User Menu */}
        <div className="aww-nav-actions">
          {onRefresh && (
            <button
              className="aww-icon-btn"
              onClick={onRefresh}
              title="Refresh operational data"
              disabled={refreshing}
            >
              <span className={refreshing ? "spin-icon" : ""}>{refreshing ? "⟳" : "↻"}</span>
            </button>
          )}

          <div className="aww-status-indicator">
            <span className="aww-status-dot"></span>
            <span className="aww-status-label">Supabase Live</span>
          </div>

          {/* User Profile Pill & Dropdown */}
          <div className="aww-user-wrapper">
            <button
              className="aww-user-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="User profile menu"
            >
              <div className="aww-user-avatar">
                {getInitials(user?.name, user?.email)}
              </div>
              <div className="aww-user-meta">
                <span className="aww-user-name">{user?.name || "Operator"}</span>
                <span className="aww-user-role">{user?.role === "REVENUE_ADMIN" ? "Admin" : "Operator"}</span>
              </div>
              <span className="aww-user-caret">⌄</span>
            </button>

            {showUserMenu && (
              <div className="aww-user-menu">
                <div className="aww-user-menu-header">
                  <strong>{user?.name || "Operator"}</strong>
                  <span className="aww-user-email">{user?.email}</span>
                  <span className="aww-role-badge">{user?.role || "REVENUE_ADMIN"}</span>
                </div>
                <button
                  className="aww-logout-btn"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
                  <span>➔</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            className="aww-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile Responsive Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="aww-mobile-drawer">
          <div className="aww-mobile-nav-group">
            <div className="aww-mobile-heading">Main Navigation</div>
            <button
              className={`aww-mobile-link ${activePrimary === "overview" ? "active" : ""}`}
              onClick={() => handleNavClick("overview")}
            >
              ⌂ Overview
            </button>
            <button
              className={`aww-mobile-link ${activePrimary === "telemetry-q" ? "active" : ""}`}
              onClick={() => handleNavClick("telemetry-q")}
            >
              📡 Telemetry Q
            </button>
            <button
              className={`aww-mobile-link ${activePrimary === "recovery-demo" ? "active" : ""}`}
              onClick={() => handleNavClick("recovery-demo")}
            >
              ✨ Recovery Demo
            </button>
          </div>

          <div className="aww-mobile-nav-group">
            <div className="aww-mobile-heading">Operations</div>
            <button
              className={`aww-mobile-link ${page === "recovery" ? "active" : ""}`}
              onClick={() => handleItemSelect("recovery")}
            >
              ↗ Recovery Cases {openCasesCount > 0 && `(${openCasesCount})`}
            </button>
            <button
              className={`aww-mobile-link ${page === "human-escalations" ? "active" : ""}`}
              onClick={() => handleItemSelect("human-escalations")}
            >
              👤 Human Escalations {openEscalatedCount > 0 && `(${openEscalatedCount})`}
            </button>
            <button
              className={`aww-mobile-link ${page === "customers" ? "active" : ""}`}
              onClick={() => handleItemSelect("customers")}
            >
              👥 Customers
            </button>
            <button
              className={`aww-mobile-link ${page === "transactions" ? "active" : ""}`}
              onClick={() => handleItemSelect("transactions")}
            >
              ⇄ Transactions
            </button>
            <button
              className={`aww-mobile-link ${page === "failed-payments" ? "active" : ""}`}
              onClick={() => handleItemSelect("failed-payments")}
            >
              ⚠ Failed Payments
            </button>
            <button
              className={`aww-mobile-link ${page === "checkout-dropoffs" ? "active" : ""}`}
              onClick={() => handleItemSelect("checkout-dropoffs")}
            >
              🛒 Checkout Drop-offs
            </button>
            <button
              className={`aww-mobile-link ${page === "subscriptions" ? "active" : ""}`}
              onClick={() => handleItemSelect("subscriptions")}
            >
              🔄 Subscriptions
            </button>
            <button
              className={`aww-mobile-link ${page === "mandates" ? "active" : ""}`}
              onClick={() => handleItemSelect("mandates")}
            >
              📑 Mandates / UPI
            </button>
            <button
              className={`aww-mobile-link ${page === "invoices" ? "active" : ""}`}
              onClick={() => handleItemSelect("invoices")}
            >
              📄 Invoices
            </button>
            <button
              className={`aww-mobile-link ${page === "scenarios" ? "active" : ""}`}
              onClick={() => handleItemSelect("scenarios")}
            >
              ⊞ Scenario Center
            </button>
          </div>

          <div className="aww-mobile-nav-group">
            <div className="aww-mobile-heading">Intelligence</div>
            <button
              className={`aww-mobile-link ${page === "policy-rules" ? "active" : ""}`}
              onClick={() => handleItemSelect("policy-rules")}
            >
              ⚙ Policy Rules
            </button>
            <button
              className={`aww-mobile-link ${page === "agent" ? "active" : ""}`}
              onClick={() => handleItemSelect("agent")}
            >
              ✦ AI Agent
            </button>
          </div>

          <div className="aww-mobile-nav-group">
            <div className="aww-mobile-heading">Insights</div>
            <button
              className={`aww-mobile-link ${page === "analytics" ? "active" : ""}`}
              onClick={() => handleItemSelect("analytics")}
            >
              ▥ Analytics
            </button>
            <button
              className={`aww-mobile-link ${page === "audit" ? "active" : ""}`}
              onClick={() => handleItemSelect("audit")}
            >
              ☷ Audit Logs
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
