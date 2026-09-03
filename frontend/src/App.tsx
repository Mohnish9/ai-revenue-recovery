import { useState, useEffect } from "react";
import type { PageKey, DashboardSummary } from "./lib/types";
import { fetchDashboardSummary } from "./lib/api";
import { AppLayout } from "./layouts/AppLayout";
import { AuthProvider, useAuth } from "./lib/authContext";
import { LoginPage } from "./pages/LoginPage";

// Modals & Drawers
import { CaseDetailDrawer } from "./components/CaseDetailDrawer";
import { CustomerDetailDrawer } from "./components/CustomerDetailDrawer";

// Functional Operational Pages
import { Dashboard } from "./pages/Dashboard";
import { RecoveryCasesPage } from "./pages/RecoveryCasesPage";
import { HumanEscalationsPage } from "./pages/HumanEscalationsPage";
import { FailedPaymentsPage } from "./pages/FailedPaymentsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { CheckoutDropoffsPage } from "./pages/CheckoutDropoffsPage";
import { MandatesPage } from "./pages/MandatesPage";
import { CustomersPage } from "./pages/CustomersPage";
import { PolicyRulesPage } from "./pages/PolicyRulesPage";
import { SystemHealthPage } from "./pages/SystemHealthPage";
import { AIAgentPage } from "./pages/AIAgentPage";
import { ScenarioCenterPage } from "./pages/ScenarioCenterPage";
import { RecoveryDemoPage } from "./pages/RecoveryDemoPage";
import { TelemetryQueuePage } from "./pages/TelemetryQueuePage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { CustomerResolvePage } from "./pages/CustomerResolvePage";

function getResolveIncidentId(): string | null {
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/(?:resolve|pay|intent)\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("resolve") || searchParams.get("incidentId") || null;
}

const VALID_PAGE_KEYS: PageKey[] = [
  "dashboard",
  "telemetry-queue",
  "recovery",
  "human-escalations",
  "failed-payments",
  "transactions",
  "invoices",
  "subscriptions",
  "checkout-dropoffs",
  "mandates",
  "customers",
  "policy-rules",
  "health",
  "agent",
  "scenarios",
  "recovery-demo",
  "analytics",
  "audit",
];

function getInitialPage(): PageKey {
  const rawPath = window.location.pathname.replace(/^\/+/, "").toLowerCase();
  const segments = rawPath.split("/").filter(Boolean);
  const root = segments[0] || "";
  const sub = segments[1] || "";

  if (root === "overview" || root === "dashboard" || root === "") {
    return "dashboard";
  }
  if (root === "telemetry" || root === "telemetry-queue") {
    return "telemetry-queue";
  }
  if (root === "recovery-demo") {
    return "recovery-demo";
  }
  if (root === "operations") {
    const validOperationsSub: Record<string, PageKey> = {
      recovery: "recovery",
      "human-escalations": "human-escalations",
      "failed-payments": "failed-payments",
      transactions: "transactions",
      invoices: "invoices",
      subscriptions: "subscriptions",
      "checkout-dropoffs": "checkout-dropoffs",
      mandates: "mandates",
      customers: "customers",
      scenarios: "scenarios",
    };
    return (sub && validOperationsSub[sub]) ? validOperationsSub[sub] : "recovery";
  }
  if (root === "intelligence") {
    const validIntelligenceSub: Record<string, PageKey> = {
      agent: "agent",
      "policy-rules": "policy-rules",
      health: "health",
    };
    return (sub && validIntelligenceSub[sub]) ? validIntelligenceSub[sub] : "agent";
  }
  if (root === "insights") {
    const validInsightsSub: Record<string, PageKey> = {
      analytics: "analytics",
      audit: "audit",
    };
    return (sub && validInsightsSub[sub]) ? validInsightsSub[sub] : "analytics";
  }
  return VALID_PAGE_KEYS.includes(root as PageKey) ? (root as PageKey) : "dashboard";
}

function getRouteForPage(pageKey: PageKey): string {
  if (pageKey === "dashboard") return "/overview";
  if (pageKey === "telemetry-queue") return "/telemetry";
  if (pageKey === "recovery-demo") return "/recovery-demo";
  if (
    [
      "recovery",
      "human-escalations",
      "failed-payments",
      "transactions",
      "invoices",
      "subscriptions",
      "checkout-dropoffs",
      "mandates",
      "customers",
      "scenarios",
    ].includes(pageKey)
  ) {
    return `/operations/${pageKey}`;
  }
  if (["agent", "policy-rules", "health"].includes(pageKey)) {
    return `/intelligence/${pageKey}`;
  }
  if (["analytics", "audit"].includes(pageKey)) {
    return `/insights/${pageKey}`;
  }
  return `/${pageKey}`;
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<PageKey>(getInitialPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Active drawers
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const loadSummary = async () => {
    if (!user) return;
    try {
      setRefreshing(true);
      const res = await fetchDashboardSummary();
      setSummary(res);
    } catch (e: any) {
      console.warn("Dashboard summary fetch warning:", e?.message || e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadSummary();
    } else {
      setSummary(null);
      setSelectedCaseId(null);
      setSelectedCustomerId(null);
    }
  }, [user, refreshKey]);

  useEffect(() => {
    const handlePopState = () => {
      if (!user) {
        if (window.location.pathname !== "/login") {
          window.history.replaceState({}, "", "/login");
        }
      } else {
        setPage(getInitialPage());
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [user]);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        if (window.location.pathname !== "/login") {
          window.history.replaceState({}, "", "/login");
        }
      } else {
        if (window.location.pathname === "/login" || window.location.pathname === "/") {
          window.history.replaceState({}, "", "/overview");
        }
      }
    }
  }, [user, loading]);

  const navigate = (nextPage: PageKey, caseId?: string) => {
    setPage(nextPage);
    const route = getRouteForPage(nextPage);
    window.history.pushState({}, "", route);
    setMenuOpen(false);
    if (caseId) {
      setSelectedCaseId(caseId);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGlobalRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#081016",
          color: "#94a3b8",
          fontFamily: "var(--font-sans)",
          gap: "12px",
        }}
      >
        <div style={{ width: "32px", height: "32px", border: "2px solid #1e3342", borderTopColor: "#d8ee9b", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: "12px", letterSpacing: "0.5px" }}>Verifying Supabase authentication session...</span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppLayout
      page={page}
      menuOpen={menuOpen}
      onNavigate={navigate}
      onOpenMenu={() => setMenuOpen(true)}
      onCloseMenu={() => setMenuOpen(false)}
      onRefresh={handleGlobalRefresh}
      refreshing={refreshing}
      openCasesCount={summary?.openRecoveryCases || 0}
      openEscalatedCount={summary?.totalEscalated || 0}
    >
      <div key={`${page}-${refreshKey}`}>
        {page === "dashboard" && (
          <Dashboard
            onNavigate={navigate}
            onSelectCase={(id) => setSelectedCaseId(id)}
          />
        )}
        {page === "telemetry-queue" && (
          <TelemetryQueuePage onNavigate={navigate} />
        )}
        {page === "recovery" && (
          <RecoveryCasesPage
            onSelectCase={(id) => setSelectedCaseId(id)}
          />
        )}
        {page === "human-escalations" && (
          <HumanEscalationsPage
            onNavigate={navigate}
            onSelectCase={(id) => setSelectedCaseId(id)}
          />
        )}
        {page === "failed-payments" && (
          <FailedPaymentsPage
            onSelectCase={(id) => setSelectedCaseId(id)}
          />
        )}
        {page === "transactions" && (
          <TransactionsPage
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
          />
        )}
        {page === "invoices" && (
          <InvoicesPage
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
          />
        )}
        {page === "subscriptions" && (
          <SubscriptionsPage />
        )}
        {page === "checkout-dropoffs" && (
          <CheckoutDropoffsPage />
        )}
        {page === "mandates" && (
          <MandatesPage />
        )}
        {page === "customers" && (
          <CustomersPage
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
          />
        )}
        {page === "policy-rules" && (
          <PolicyRulesPage />
        )}
        {page === "health" && (
          <SystemHealthPage />
        )}
        {page === "agent" && (
          <AIAgentPage
            onNavigate={navigate}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
          />
        )}
        {page === "scenarios" && (
          <ScenarioCenterPage />
        )}
        {page === "recovery-demo" && (
          <RecoveryDemoPage onNavigate={navigate} />
        )}
        {page === "analytics" && (
          <AnalyticsPage />
        )}
        {page === "audit" && (
          <AuditLogsPage />
        )}
      </div>

      {/* Case 360 Detail Drawer */}
      {selectedCaseId && (
        <CaseDetailDrawer
          caseId={selectedCaseId}
          onClose={() => setSelectedCaseId(null)}
          onUpdated={handleGlobalRefresh}
        />
      )}

      {/* Customer 360 Detail Drawer */}
      {selectedCustomerId && (
        <CustomerDetailDrawer
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  const resolveId = getResolveIncidentId();
  if (resolveId) {
    return <CustomerResolvePage incidentId={resolveId} />;
  }

  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
