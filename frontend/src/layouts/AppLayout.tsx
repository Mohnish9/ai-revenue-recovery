import type { PageKey } from "../lib/types";
import { Sidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";

interface AppLayoutProps {
  page: PageKey;
  menuOpen: boolean;
  onNavigate: (page: PageKey) => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  openCasesCount?: number;
  openEscalatedCount?: number;
  children: React.ReactNode;
}

export function AppLayout({
  page,
  menuOpen,
  onNavigate,
  onOpenMenu,
  onCloseMenu,
  onRefresh,
  refreshing,
  openCasesCount = 0,
  openEscalatedCount = 0,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        menuOpen={menuOpen}
        onNavigate={onNavigate}
        openCasesCount={openCasesCount}
        openEscalatedCount={openEscalatedCount}
      />
      {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={onCloseMenu} />}
      <main className="main-content">
        <Topbar
          page={page}
          onToggleMenu={menuOpen ? onCloseMenu : onOpenMenu}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
        {children}
      </main>
    </div>
  );
}
