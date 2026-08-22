import type { DashboardSummary, MetricTone, PageKey, PlaceholderMetric } from "../lib/types";
import { Readiness } from "../components/Readiness";

const formatInr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

export function Dashboard({ apiReady, summary, navigate }: { apiReady: boolean; summary?: DashboardSummary; navigate: (page: PageKey) => void }) {
  const metrics: PlaceholderMetric[] = [
    { label: "Revenue at risk", value: summary ? formatInr(summary.revenueAtRisk) : "—", detail: summary ? "Across active recovery cases" : "Loading live data", tone: "blue" },
    { label: "Open recovery cases", value: summary ? String(summary.openRecoveryCases) : "—", detail: summary ? `${summary.totalRecoveryCases} total cases tracked` : "Loading live data", tone: "orange" },
    { label: "Recovered this month", value: summary ? formatInr(summary.recoveredThisMonth) : "—", detail: summary ? "From recovered cases" : "Loading live data", tone: "green" },
    { label: "Recovery rate", value: summary ? `${Math.round(summary.recoveryRate * 100)}%` : "—", detail: summary ? "Based on resolved case value" : "Loading live data", tone: "purple" },
  ];
  return <div className="page">
    <div className="page-heading"><div><div className="eyebrow">FRIDAY, AUGUST 21, 2026</div><h1>Good morning, Mohnish <span className="wave">✦</span></h1><p>Here’s your revenue recovery command center.</p></div><button className="outline-button" onClick={() => navigate("scenarios")}>＋ Explore scenarios</button></div>
    <section className="onboarding-banner"><div className="banner-icon">↗</div><div className="banner-copy"><h2>Connect your payment data</h2><p>Recoverly is ready for your first signal. Connect a source to turn payment events into actionable recovery cases.</p></div><button className="dark-button">Connect data source <span>→</span></button><button className="close-button" aria-label="Dismiss">×</button></section>
    <div className="section-heading"><div><h2>At a glance</h2><p>Live metrics will populate once a payment source is connected.</p></div><span className={`api-status ${apiReady ? "ready" : ""}`}><i></i>{apiReady ? "API connected" : "Connecting to API"}</span></div>
    <div className="metrics-grid">{metrics.map((metric) => <div className="metric-card" key={metric.label}><div className={`metric-icon ${metric.tone}`}>{metric.tone === "blue" ? "◈" : metric.tone === "orange" ? "↗" : metric.tone === "green" ? "✓" : "◒"}</div><span className="metric-label">{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div>
    <div className="lower-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Recovery activity</h2><p>Your recovery timeline will appear here.</p></div><button className="text-button" onClick={() => navigate("recovery")}>View cases →</button></div><div className="empty-state"><div className="empty-illustration"><span>↗</span></div><h3>No activity yet</h3><p>Once you connect your payment data, Recoverly will surface signals and recovery opportunities here.</p></div></section><section className="panel readiness-panel"><div className="panel-heading"><div><h2>Workspace readiness</h2><p>Set up your foundation.</p></div></div><div className="readiness-list"><Readiness label="Payment data source" status="Not connected" /><Readiness label="Recovery policies" status="Not configured" /><Readiness label="Team members" status="1 member" done /></div><button className="full-button">Open workspace settings <span>→</span></button></section></div>
  </div>;
}