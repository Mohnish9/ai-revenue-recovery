import type { NavItem, PageKey } from "../lib/types";

export const navItems: NavItem[] = [
  { key: "dashboard", label: "Overview", icon: "⌂" },
  { key: "recovery", label: "Recovery cases", icon: "↗", section: "OPERATIONS" },
  { key: "transactions", label: "Transactions", icon: "⇄" },
  { key: "customers", label: "Customers", icon: "◌" },
  { key: "agent", label: "AI agent", icon: "✦", section: "INTELLIGENCE" },
  { key: "scenarios", label: "Scenario center", icon: "⊞" },
  { key: "analytics", label: "Analytics", icon: "▥", section: "INSIGHTS" },
  { key: "audit", label: "Audit logs", icon: "☷" },
];

interface SidebarProps {
  page: PageKey;
  menuOpen: boolean;
  onNavigate: (page: PageKey) => void;
}

export function Sidebar({ page, menuOpen, onNavigate }: SidebarProps) {
  return (
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span>R</span></div><div><strong>recoverly</strong><small>REVENUE OPERATIONS</small></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">AC</div><div><b>Acme Corporation</b><span>Production workspace</span></div><span className="chevron">⌄</span></div>
      <nav>
        {navItems.map((item, index) => <div key={item.key}>
          {item.section && <div className="nav-section">{item.section}</div>}
          {!item.section && index === 0 && <div className="nav-section">WORKSPACE</div>}
          <button className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => onNavigate(item.key)}>
            <span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.key === "recovery" && <i>0</i>}
          </button>
        </div>)}
      </nav>
      <div className="sidebar-bottom"><div className="status-dot"></div><div><b>Systems operational</b><span>All services are healthy</span></div><button className="settings">⚙</button></div>
    </aside>
  );
}