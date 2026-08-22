import type { NavItem, PageKey } from "../lib/types";
import { useAuth } from "../lib/authContext";

export const navItems: NavItem[] = [
  { key: "dashboard", label: "Overview", icon: "⌂", section: "WORKSPACE" },
  { key: "recovery-demo", label: "Recovery Demo", icon: "✨", badge: "9 CASES" },
  { key: "recovery", label: "Recovery Cases", icon: "↗", section: "OPERATIONS" },
  { key: "failed-payments", label: "Failed Payments", icon: "⚠" },
  { key: "transactions", label: "Transactions", icon: "⇄" },
  { key: "invoices", label: "Invoices", icon: "📄" },
  { key: "subscriptions", label: "Subscriptions", icon: "🔄" },
  { key: "checkout-dropoffs", label: "Checkout Drop-offs", icon: "🛒" },
  { key: "mandates", label: "Mandates", icon: "📑" },
  { key: "customers", label: "Customers", icon: "👥" },
  { key: "policy-rules", label: "Policy Rules", icon: "⚙", section: "INTELLIGENCE" },
  { key: "agent", label: "AI Agent", icon: "✦" },
  { key: "scenarios", label: "Scenario Center", icon: "⊞" },
  { key: "analytics", label: "Analytics", icon: "▥", section: "INSIGHTS" },
  { key: "audit", label: "Audit Logs", icon: "☷" },
  { key: "health", label: "System Health", icon: "♥", section: "SYSTEM" },
];

interface SidebarProps {
  page: PageKey;
  menuOpen: boolean;
  onNavigate: (page: PageKey) => void;
  openCasesCount?: number;
}

export function Sidebar({ page, menuOpen, onNavigate, openCasesCount = 0 }: SidebarProps) {
  const { user, logout } = useAuth();
  let lastSection = "";

  const handleLogout = async () => {
    await logout();
  };

  return (
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand" onClick={() => onNavigate("dashboard")}>
        <div className="brand-mark"><span>R</span></div>
        <div>
          <strong>recoverly</strong>
          <small>REVENUE OPERATIONS</small>
        </div>
      </div>

      <div className="workspace-switcher">
        <div className="workspace-avatar">AC</div>
        <div>
          <b>Acme Corporation</b>
          <span>{user?.name || "Production workspace"}</span>
        </div>
        <span className="chevron">⌄</span>
      </div>

      <nav>
        {navItems.map((item) => {
          const showSection = item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;

          return (
            <div key={item.key}>
              {showSection && <div className="nav-section">{item.section}</div>}
              <button
                className={`nav-item ${page === item.key ? "active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.key === "recovery" && openCasesCount > 0 && (
                  <span className="nav-badge">{openCasesCount}</span>
                )}
                {item.key === "agent" && (
                  <span className="nav-badge" style={{ color: "#d6f36b" }}>AI</span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-bottom" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="status-dot"></div>
            <div>
              <b style={{ fontSize: "11px", color: "#f8fafc" }}>{user?.email ? user.email.split("@")[0] : "Operator"}</b>
              <span style={{ fontSize: "9.5px", color: "#94a3b8", display: "block" }}>{user?.role || "REVENUE_ADMIN"}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            style={{
              background: "transparent",
              border: "1px solid #1e3342",
              color: "#f87171",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "10px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Exit ➔
          </button>
        </div>
      </div>
    </aside>
  );
}
