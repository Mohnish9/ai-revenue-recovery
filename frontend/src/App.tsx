import { useEffect, useMemo, useState } from "react";
import type { PageKey } from "./lib/types";
import { fetchDashboardSummary, fetchHealth } from "./lib/api";
import type { DashboardSummary } from "./lib/types";
import { navItems } from "./components/Sidebar";
import { AppLayout } from "./layouts/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { PlaceholderPage } from "./pages/PlaceholderPage";

function getInitialPage(): PageKey {
  const value = window.location.pathname.slice(1) as PageKey;
  return navItems.some((item) => item.key === value) ? value : "dashboard";
}

export default function App() {
  const [page, setPage] = useState<PageKey>(getInitialPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>();

  useEffect(() => {
    fetchHealth().then(() => setApiReady(true)).catch(() => setApiReady(false));
    fetchDashboardSummary().then(setDashboardSummary).catch(() => setDashboardSummary(undefined));
  }, []);

  const activeItem = useMemo(() => navItems.find((item) => item.key === page)!, [page]);
  const navigate = (nextPage: PageKey) => {
    setPage(nextPage);
    window.history.pushState({}, "", nextPage === "dashboard" ? "/" : `/${nextPage}`);
    setMenuOpen(false);
  };

  return <AppLayout page={page} menuOpen={menuOpen} onNavigate={navigate} onOpenMenu={() => setMenuOpen(true)} onCloseMenu={() => setMenuOpen(false)}>
    {page === "dashboard" ? <Dashboard apiReady={apiReady} summary={dashboardSummary} navigate={navigate} /> : <PlaceholderPage page={page} />}
  </AppLayout>;
}