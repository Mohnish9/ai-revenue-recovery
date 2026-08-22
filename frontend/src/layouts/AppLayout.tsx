import type { PageKey } from "../lib/types";
import { Sidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";

interface AppLayoutProps {
  page: PageKey;
  menuOpen: boolean;
  onNavigate: (page: PageKey) => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  children: React.ReactNode;
}

export function AppLayout({ page, menuOpen, onNavigate, onOpenMenu, onCloseMenu, children }: AppLayoutProps) {
  const label = page === "dashboard" ? "Overview" : page.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <div className="app-shell">
    <Sidebar page={page} menuOpen={menuOpen} onNavigate={onNavigate} />
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={onCloseMenu} />}
    <main className="main-content"><Topbar label={label} onOpenMenu={onOpenMenu} />{children}</main>
  </div>;
}