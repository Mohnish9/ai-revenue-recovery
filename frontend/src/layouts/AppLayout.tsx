import type { PageKey } from "../lib/types";
import { TopNav } from "../components/TopNav";

interface AppLayoutProps {
  page: PageKey;
  menuOpen?: boolean;
  onNavigate: (page: PageKey) => void;
  onOpenMenu?: () => void;
  onCloseMenu?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  openCasesCount?: number;
  openEscalatedCount?: number;
  children: React.ReactNode;
}

export function AppLayout({
  page,
  onNavigate,
  onRefresh,
  refreshing,
  openCasesCount = 0,
  openEscalatedCount = 0,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-shell">
      <TopNav
        page={page}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
        refreshing={refreshing}
        openCasesCount={openCasesCount}
        openEscalatedCount={openEscalatedCount}
      />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
