import { useState, useEffect, useRef, useCallback } from "react";
import type { DashboardSummary, RecoveryCase, PaymentEvent } from "../lib/types";
import {
  fetchDashboardSummary,
  fetchRecoveryCases,
  fetchPaymentEvents,
  createSandboxIncidentApi,
} from "../lib/api";

interface DashboardProps {
  onNavigate: (page: any) => void;
  onSelectCase: (caseId: string) => void;
  onSummaryUpdate?: (summary: DashboardSummary) => void;
}

const SAMPLE_TEST_CASES = [
  {
    name: "Rohan Verma",
    email: "rohan.verma@example.test",
    phone: "+919876543210",
    scenarioTypeKey: "UPI_MANDATE_FAILURE",
    amount: 4999,
    paymentMethod: "UPI AutoPay (Google Pay / HDFC)",
    failureReason: "UPI Mandate pre-debit authorization expired by issuer bank",
    billingContext: "Monthly SaaS Pro Plan",
    severity: "HIGH" as const,
  },
  {
    name: "Pooja Singhania",
    email: "pooja.s@example.test",
    phone: "+919811223344",
    scenarioTypeKey: "CARD_EXPIRED",
    amount: 12500,
    paymentMethod: "Corporate Visa Platinum Debit",
    failureReason: "Card validity expired; automated recurring charge declined",
    billingContext: "Quarterly Cloud Infrastructure Tier",
    severity: "CRITICAL" as const,
  },
  {
    name: "Aditya Roy",
    email: "aditya.roy@example.test",
    phone: "+919712345678",
    scenarioTypeKey: "INSUFFICIENT_FUNDS",
    amount: 3200,
    paymentMethod: "ICICI NetBanking",
    failureReason: "Payment gateway bank network timeout during 2FA step",
    billingContext: "Annual Digital Commerce License",
    severity: "MEDIUM" as const,
  },
];

export function Dashboard({ onNavigate, onSelectCase, onSummaryUpdate }: DashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentCases, setRecentCases] = useState<RecoveryCase[]>([]);
  const [recentEvents, setRecentEvents] = useState<PaymentEvent[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time synchronization state
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [syncCycles, setSyncCycles] = useState(0);
  const [liveBannerMessage, setLiveBannerMessage] = useState<string | null>(null);
  const [injectingSimulation, setInjectingSimulation] = useState(false);

  // Filter states
  const [eventFilter, setEventFilter] = useState<"ALL" | "FAILED" | "PAID" | "OUTREACH">("ALL");
  const [caseFilter, setCaseFilter] = useState<"ALL" | "HIGH_RISK" | "ESCALATED">("ALL");

  // Track previous values for change highlighting
  const prevMetricsRef = useRef<{ atRisk: number; openCases: number; recovered: number }>({
    atRisk: 0,
    openCases: 0,
    recovered: 0,
  });

  // Core data fetcher (silent background refresh supported)
  const performSync = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setIsSyncing(true);
      }
      setError(null);

      const [sumRes, casesRes, eventsRes] = await Promise.all([
        fetchDashboardSummary(),
        fetchRecoveryCases(8),
        fetchPaymentEvents(8),
      ]);

      // Check if metrics shifted significantly in real-time
      const activeAtRisk = Number(sumRes.revenueAtRisk ?? sumRes.amountAtRisk ?? 0);
      if (!isInitial && summary) {
        const atRiskDiff = activeAtRisk - prevMetricsRef.current.atRisk;
        const openDiff = sumRes.openRecoveryCases - prevMetricsRef.current.openCases;

        if (atRiskDiff > 0 || openDiff > 0) {
          setLiveBannerMessage(
            `⚡ Real-time update: ${openDiff > 0 ? `+${openDiff} new recovery case(s)` : ""} ${atRiskDiff > 0 ? `(₹${atRiskDiff.toLocaleString()} at risk)` : ""} detected live.`
          );
          setTimeout(() => setLiveBannerMessage(null), 6000);
        }
      }

      prevMetricsRef.current = {
        atRisk: activeAtRisk,
        openCases: sumRes.openRecoveryCases || 0,
        recovered: Number(sumRes.recoveredThisMonth || 0),
      };

      setSummary(sumRes);
      setRecentCases(casesRes);
      setRecentEvents(eventsRes);
      setLastSyncTime(new Date());
      setSecondsAgo(0);
      setSyncCycles((prev) => prev + 1);

      if (onSummaryUpdate) {
        onSummaryUpdate(sumRes);
      }
    } catch (e: any) {
      if (isInitial) {
        setError(e.message || "Failed to load dashboard data");
      } else {
        console.warn("[Dashboard Live Sync] Transient sync notice:", e?.message || e);
      }
    } finally {
      setInitialLoading(false);
      setIsSyncing(false);
    }
  }, [summary, onSummaryUpdate]);

  // Initial mount
  useEffect(() => {
    performSync(true);
  }, []);

  // Real-time polling loop (runs every 4 seconds when isLiveActive is true and tab is visible)
  useEffect(() => {
    if (!isLiveActive) return;

    const intervalId = setInterval(() => {
      if (document.hidden) return; // Save bandwidth if tab is hidden
      performSync(false);
    }, 4000);

    return () => clearInterval(intervalId);
  }, [isLiveActive, performSync]);

  // Second-counter ticker for "Last updated X seconds ago"
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastSyncTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastSyncTime]);

  // Trigger test simulation event in 1 click
  const handleInjectTestIncident = async () => {
    try {
      setInjectingSimulation(true);
      const randomSample = SAMPLE_TEST_CASES[Math.floor(Math.random() * SAMPLE_TEST_CASES.length)];

      await createSandboxIncidentApi({
        scenarioTypeKey: randomSample.scenarioTypeKey,
        customerCustom: {
          name: randomSample.name,
          email: randomSample.email,
          phone: randomSample.phone,
          customer_type: "INDIVIDUAL",
        },
        amount: randomSample.amount,
        currency: "INR",
        paymentMethod: randomSample.paymentMethod,
        failureReason: randomSample.failureReason,
        severity: randomSample.severity,
        billingContext: randomSample.billingContext,
      });

      setLiveBannerMessage(
        `⚡ Simulated ${randomSample.scenarioTypeKey} for ${randomSample.name} (₹${randomSample.amount.toLocaleString()}) injected! Updating live view...`
      );

      // Trigger instant sync
      await performSync(false);
      setTimeout(() => setLiveBannerMessage(null), 7000);
    } catch (err: any) {
      alert(`Simulation notice: ${err?.message || "Could not inject test event"}`);
    } finally {
      setInjectingSimulation(false);
    }
  };

  const recoveryRateFormatted = summary ? `${Math.round(summary.recoveryRate * 100)}%` : "0%";

  // Filtered payment events
  const filteredEvents = recentEvents.filter((ev) => {
    if (eventFilter === "ALL") return true;
    const typeUpper = (ev.event_type || "").toUpperCase();
    if (eventFilter === "FAILED") return typeUpper.includes("FAIL") || typeUpper.includes("DECLINE") || typeUpper.includes("DROP");
    if (eventFilter === "PAID") return typeUpper.includes("PAID") || typeUpper.includes("RECOVER") || typeUpper.includes("SUCCESS");
    if (eventFilter === "OUTREACH") return typeUpper.includes("VOICE") || typeUpper.includes("SMS") || typeUpper.includes("WHATSAPP") || typeUpper.includes("EMAIL");
    return true;
  });

  // Filtered cases
  const filteredCases = recentCases.filter((rc) => {
    if (caseFilter === "ALL") return true;
    if (caseFilter === "HIGH_RISK") return rc.priority === "HIGH" || rc.priority === "CRITICAL" || rc.amount_at_risk >= 10000;
    if (caseFilter === "ESCALATED") return rc.status === "ESCALATED" || (rc.status as string) === "HUMAN_REVIEW";
    return true;
  });

  return (
    <div className="page" style={{ position: "relative" }}>
      {/* Real-time Toast Banner */}
      {liveBannerMessage && (
        <div
          style={{
            position: "sticky",
            top: "76px",
            zIndex: 900,
            background: "#081016",
            border: "1px solid #d8ee9b",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: "10px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: "fadeIn 0.3s ease-in-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px" }}>
            <span style={{ color: "#d8ee9b", fontSize: "16px" }}>⚡</span>
            <span>{liveBannerMessage}</span>
          </div>
          <button
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: 0,
              fontSize: "14px",
              cursor: "pointer",
              padding: "2px 6px",
            }}
            onClick={() => setLiveBannerMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Page Heading with Live Controls */}
      <div className="page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div className="eyebrow" style={{ margin: 0 }}>Overview</div>
            {/* Live Status Pill */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: isLiveActive ? "#064e3b" : "#374151",
                color: isLiveActive ? "#6ee7b7" : "#d1d5db",
                border: isLiveActive ? "1px solid #059669" : "1px solid #4b5563",
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              {isLiveActive ? (
                <>
                  <div className="pulse-dot" style={{ width: "6px", height: "6px" }} />
                  <span>LIVE REAL-TIME</span>
                </>
              ) : (
                <>
                  <span>⏸</span>
                  <span>SYNC PAUSED</span>
                </>
              )}
            </div>

            {/* Syncing Activity Indicator */}
            {isSyncing && (
              <span
                style={{
                  fontSize: "10px",
                  color: "#0369a1",
                  background: "#e0f2fe",
                  padding: "1px 7px",
                  borderRadius: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontWeight: 600,
                }}
              >
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                updating...
              </span>
            )}
          </div>

          <h1>Revenue Recovery Command Center</h1>
          <p style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span>Real-time autonomous intelligence for failed payments, subscriptions, and invoices.</span>
            <span style={{ color: "#94a3b8", fontSize: "11px" }}>•</span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Synced {secondsAgo === 0 ? "just now" : `${secondsAgo}s ago`} (Cycle #{syncCycles})
            </span>
          </p>
        </div>

        {/* Real-time Control Toolbar */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Pause / Resume Live Polling */}
          <button
            className="outline-button"
            style={{
              fontSize: "11px",
              padding: "6px 12px",
              background: isLiveActive ? "#ffffff" : "#f1f5f9",
            }}
            onClick={() => setIsLiveActive(!isLiveActive)}
            title={isLiveActive ? "Pause real-time auto-sync" : "Resume real-time auto-sync"}
          >
            {isLiveActive ? "⏸ Pause Live" : "▶ Resume Live"}
          </button>

          {/* Force Manual Sync */}
          <button
            className="outline-button"
            style={{ fontSize: "11px", padding: "6px 12px" }}
            onClick={() => performSync(false)}
            disabled={isSyncing}
            title="Force immediate refresh now"
          >
            <span style={{ display: "inline-block", transform: isSyncing ? "rotate(180deg)" : "none", transition: "transform 0.4s ease" }}>
              ⟳
            </span>
            <span>Sync Now</span>
          </button>

          {/* Test Real-time Inflow Button */}
          <button
            className="primary-button"
            style={{
              background: "#d6f36b",
              color: "#081016",
              fontWeight: 700,
              fontSize: "11px",
              padding: "6px 14px",
            }}
            onClick={handleInjectTestIncident}
            disabled={injectingSimulation}
            title="Inject a realistic payment failure to test real-time dashboard reaction"
          >
            {injectingSimulation ? "Injecting..." : "⚡ Inject Live Failure (Test Real-time)"}
          </button>

          <button className="primary-button" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={() => onNavigate("agent")}>
            ✦ Launch AI Agent
          </button>
        </div>
      </div>

      {/* Live System Status Banner */}
      <div className="onboarding-banner" style={{ background: "#0b151e", border: "1px solid #1c2e3d", padding: "14px 20px" }}>
        <div className="banner-icon" style={{ background: "#182a38", color: "#d8ee9b" }}>✦</div>
        <div className="banner-copy">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ fontSize: "13.5px", color: "#ffffff", margin: 0 }}>Autonomous Recovery Engine Online</h2>
            <span style={{ fontSize: "10px", background: "#064e3b", color: "#6ee7b7", padding: "2px 8px", borderRadius: "10px", fontWeight: 700 }}>
              AUTO-STREAMING (4s)
            </span>
          </div>
          <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: "2px 0 0" }}>
            Telemetry stream continuously ingested. Smart retry policies, natural Hinglish AI voice calls, and bounded human escalations active.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button className="dark-button" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={() => onNavigate("recovery")}>
            Open Queue ({summary?.openRecoveryCases || 0}) <span>→</span>
          </button>
          <button
            className="dark-button"
            style={{ fontSize: "11px", padding: "6px 12px", background: "#1e293b" }}
            onClick={() => onNavigate("recovery-demo")}
          >
            9-Scenario Lab <span>→</span>
          </button>
        </div>
      </div>

      {initialLoading ? (
        <div className="loading-container" style={{ padding: "60px 0" }}>
          <div className="spinner"></div>
          <span style={{ fontSize: "12.5px", color: "#64748b" }}>Establishing real-time connection to Supabase database...</span>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-illustration">⚠</div>
          <h3>Unable to load live dashboard</h3>
          <p>{error}</p>
          <button className="outline-button" onClick={() => performSync(true)}>Retry Connection</button>
        </div>
      ) : (
        <>
          {/* Key Metrics Grid - Live Dynamic Values */}
          <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: "14px" }}>
            <div className="metric-card" style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="metric-icon orange">↗</div>
                <span style={{ fontSize: "9.5px", color: "#f97316", background: "#fff7ed", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>
                  LIVE
                </span>
              </div>
              <span className="metric-label">Revenue at Risk</span>
              <strong style={{ fontSize: "22px", color: "#0f172a" }}>
                ₹{summary ? Number(summary.revenueAtRisk ?? summary.amountAtRisk ?? 0).toLocaleString() : "0"}
              </strong>
              <small>Across {summary?.openRecoveryCases || 0} active recovery queues</small>
            </div>

            <div className="metric-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="metric-icon blue">⚡</div>
                <span style={{ fontSize: "9.5px", color: "#0284c7", background: "#f0f9ff", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>
                  ACTIVE
                </span>
              </div>
              <span className="metric-label">Open Recovery Cases</span>
              <strong style={{ fontSize: "22px", color: "#0f172a" }}>
                {summary?.openRecoveryCases || 0}
              </strong>
              <small>Requiring smart retry or AI dunning</small>
            </div>

            <div
              className="metric-card"
              style={{
                cursor: "pointer",
                border: (summary?.totalEscalated || 0) > 0 ? "1px solid #fecdd3" : undefined,
                background: (summary?.totalEscalated || 0) > 0 ? "#fff1f2" : undefined,
                transition: "all 0.2s ease",
              }}
              onClick={() => onNavigate("human-escalations")}
              title="Click to view Human Escalations workspace"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="metric-icon" style={{ background: "#ffe4e6", color: "#e11d48" }}>👤</div>
                {(summary?.totalEscalated || 0) > 0 ? (
                  <span style={{ fontSize: "9.5px", background: "#e11d48", color: "#ffffff", padding: "2px 6px", borderRadius: "10px", fontWeight: 700 }}>
                    ACTION REQUIRED
                  </span>
                ) : (
                  <span style={{ fontSize: "9.5px", color: "#15803d", background: "#dcfce7", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>
                    CLEAN
                  </span>
                )}
              </div>
              <span className="metric-label">Human Escalations</span>
              <strong style={{ fontSize: "22px", color: (summary?.totalEscalated || 0) > 0 ? "#e11d48" : "#0f172a" }}>
                {summary?.totalEscalated || 0}
              </strong>
              <small>Handoff after bounded 3 AI retries →</small>
            </div>

            <div className="metric-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="metric-icon green">✓</div>
                <span style={{ fontSize: "9.5px", color: "#15803d", background: "#dcfce7", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>
                  PROTECTED
                </span>
              </div>
              <span className="metric-label">Recovered This Month</span>
              <strong style={{ fontSize: "22px", color: "#15803d" }}>
                ₹{summary ? Number(summary.recoveredThisMonth).toLocaleString() : "0"}
              </strong>
              <small>Protected from involuntary churn</small>
            </div>

            <div className="metric-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="metric-icon purple">✦</div>
                <span style={{ fontSize: "9.5px", color: "#7e22ce", background: "#f3e8ff", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>
                  EFFICIENCY
                </span>
              </div>
              <span className="metric-label">Recovery Success Rate</span>
              <strong style={{ fontSize: "22px", color: "#0f172a" }}>
                {recoveryRateFormatted}
              </strong>
              <small>Out of {summary?.totalRecoveryCases || 0} total cases</small>
            </div>
          </div>

          {/* Visual Insights Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "16px", marginBottom: "22px", marginTop: "16px" }}>
            {/* Recovery Channel Efficiency */}
            <div className="panel" style={{ padding: "20px" }}>
              <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2 style={{ margin: 0 }}>Recovery Channel Efficiency</h2>
                    <span style={{ fontSize: "9.5px", background: "#dcfce7", color: "#15803d", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>
                      REAL-TIME
                    </span>
                  </div>
                  <p>Dynamic execution metrics aggregated across active channels</p>
                </div>
                <span className="status-pill success" style={{ fontSize: "10px" }}>Live Sync</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
                {(summary?.channelEfficiency && summary.channelEfficiency.length > 0) ? (
                  summary.channelEfficiency.map((ch, idx) => {
                    const colors = ["#22c55e", "#3b82f6", "#f97316", "#8b5cf6"];
                    const color = colors[idx % colors.length];
                    const rate = ch.successRate !== null ? ch.successRate : (ch.attemptsCount > 0 ? Math.round((ch.successCount / ch.attemptsCount) * 100) : 0);
                    return (
                      <div key={ch.channel}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "5px" }}>
                          <span style={{ fontWeight: 600 }}>{ch.label} ({ch.attemptsCount} dispatched)</span>
                          <strong style={{ color: ch.attemptsCount > 0 ? "#0f172a" : "#94a3b8" }}>
                            {ch.attemptsCount > 0 ? `${rate}% recovery (${ch.successCount} recovered)` : "Ready for dispatch"}
                          </strong>
                        </div>
                        <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.max(ch.attemptsCount > 0 ? rate : 0, 4)}%`,
                              height: "100%",
                              background: color,
                              borderRadius: "4px",
                              transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: "12px", color: "#64748b", padding: "16px 0", textAlign: "center" }}>
                    No channel dispatches logged in this cycle yet. Autonomous agent will stream updates live.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Navigation */}
            <div className="panel" style={{ padding: "20px" }}>
              <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Operational Control Deck</h2>
                  <p>Specialized workspaces for revenue recovery operations</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "16px" }}>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px", textAlign: "left" }}
                  onClick={() => onNavigate("failed-payments")}
                >
                  <strong style={{ fontSize: "12px", color: "#b91c1c" }}>⚠ Failed Payments Triage</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Inspect card declines & insufficient funds</span>
                </button>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px", textAlign: "left" }}
                  onClick={() => onNavigate("invoices")}
                >
                  <strong style={{ fontSize: "12px", color: "#b45309" }}>📄 Overdue Invoices</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Capture payment commitments</span>
                </button>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px", textAlign: "left" }}
                  onClick={() => onNavigate("checkout-dropoffs")}
                >
                  <strong style={{ fontSize: "12px", color: "#0369a1" }}>🛒 Checkout Drop-offs</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Re-engage abandoned orders</span>
                </button>
                <button
                  className="outline-button"
                  style={{ padding: "14px", flexDirection: "column", alignItems: "flex-start", gap: "6px", textAlign: "left" }}
                  onClick={() => onNavigate("policy-rules")}
                >
                  <strong style={{ fontSize: "12px", color: "#7e22ce" }}>⚙ Policy Rules</strong>
                  <span style={{ fontSize: "10.5px", color: "#64748b" }}>Configure automated dunning</span>
                </button>
              </div>
            </div>
          </div>

          {/* Lower Grid: High Priority Queue & Live Payment Stream */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "16px", marginBottom: "22px" }}>
            {/* High Priority Recovery Queue */}
            <div className="panel">
              <div className="panel-heading" style={{ flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2 style={{ margin: 0 }}>High Priority Recovery Queue</h2>
                    <span style={{ fontSize: "10px", background: "#f1f5f9", padding: "2px 8px", borderRadius: "10px", fontWeight: 700, color: "#475569" }}>
                      {filteredCases.length} Cases
                    </span>
                  </div>
                  <p>Cases requiring immediate operational resolution</p>
                </div>

                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {/* Case filter buttons */}
                  <button
                    style={{
                      fontSize: "10px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: caseFilter === "ALL" ? "#081016" : "#f1f5f9",
                      color: caseFilter === "ALL" ? "#ffffff" : "#475569",
                      fontWeight: 600,
                    }}
                    onClick={() => setCaseFilter("ALL")}
                  >
                    All
                  </button>
                  <button
                    style={{
                      fontSize: "10px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: caseFilter === "HIGH_RISK" ? "#b91c1c" : "#f1f5f9",
                      color: caseFilter === "HIGH_RISK" ? "#ffffff" : "#475569",
                      fontWeight: 600,
                    }}
                    onClick={() => setCaseFilter("HIGH_RISK")}
                  >
                    High Risk
                  </button>
                  <button
                    style={{
                      fontSize: "10px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: caseFilter === "ESCALATED" ? "#e11d48" : "#f1f5f9",
                      color: caseFilter === "ESCALATED" ? "#ffffff" : "#475569",
                      fontWeight: 600,
                    }}
                    onClick={() => setCaseFilter("ESCALATED")}
                  >
                    Escalated
                  </button>
                  <button className="outline-button" style={{ fontSize: "10px", padding: "3px 8px" }} onClick={() => onNavigate("recovery")}>
                    View All →
                  </button>
                </div>
              </div>

              {filteredCases.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px 16px" }}>
                  <div className="empty-illustration">✓</div>
                  <h3>Queue Clear</h3>
                  <p style={{ fontSize: "11.5px" }}>No recovery cases matching the selected filter at this moment.</p>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Failure Reason</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((rc) => (
                        <tr key={rc.id}>
                          <td>
                            <strong style={{ fontSize: "12px" }}>{rc.customers?.name || "Customer"}</strong>
                            <div style={{ fontSize: "10px", color: "#94a3b8" }}>{rc.customers?.email}</div>
                          </td>
                          <td>
                            <strong style={{ color: "#0f172a" }}>₹{Number(rc.amount_at_risk).toLocaleString()}</strong>
                          </td>
                          <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px" }}>
                            {rc.reason}
                          </td>
                          <td>
                            <span className={`status-pill ${rc.status === "RECOVERED" ? "success" : rc.status === "OPEN" ? "danger" : rc.status === "ESCALATED" ? "danger" : "warning"}`}>
                              {rc.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="dark-button"
                              style={{ fontSize: "10px", padding: "4px 10px", background: "#081016" }}
                              onClick={() => onSelectCase(rc.id)}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Live Payment Stream Feed */}
            <div className="panel">
              <div className="panel-heading" style={{ flexWrap: "wrap", gap: "6px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <h2 style={{ margin: 0 }}>Live Payment Stream</h2>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "9px",
                        background: "#dcfce7",
                        color: "#15803d",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 700,
                      }}
                    >
                      <span className="pulse-dot" style={{ width: "5px", height: "5px" }} />
                      STREAMING
                    </span>
                  </div>
                  <p>Real-time gateway & telemetry events</p>
                </div>

                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    style={{
                      fontSize: "9.5px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: eventFilter === "ALL" ? "#081016" : "#f1f5f9",
                      color: eventFilter === "ALL" ? "#ffffff" : "#64748b",
                      fontWeight: 600,
                    }}
                    onClick={() => setEventFilter("ALL")}
                  >
                    All
                  </button>
                  <button
                    style={{
                      fontSize: "9.5px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: eventFilter === "FAILED" ? "#b91c1c" : "#f1f5f9",
                      color: eventFilter === "FAILED" ? "#ffffff" : "#64748b",
                      fontWeight: 600,
                    }}
                    onClick={() => setEventFilter("FAILED")}
                  >
                    Fails
                  </button>
                  <button
                    style={{
                      fontSize: "9.5px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: eventFilter === "PAID" ? "#15803d" : "#f1f5f9",
                      color: eventFilter === "PAID" ? "#ffffff" : "#64748b",
                      fontWeight: 600,
                    }}
                    onClick={() => setEventFilter("PAID")}
                  >
                    Paid
                  </button>
                </div>
              </div>

              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "380px", overflowY: "auto" }}>
                {filteredEvents.length === 0 ? (
                  <div style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>
                    No events matching filter. Listening for incoming gateway webhooks...
                  </div>
                ) : (
                  filteredEvents.map((ev) => {
                    const eventDate = new Date(ev.occurred_at);
                    const isVeryRecent = Date.now() - eventDate.getTime() < 180000; // within 3 minutes
                    const isFailure = ev.event_type.includes("FAIL") || ev.event_type.includes("DECLINE");
                    const isSuccess = ev.event_type.includes("PAID") || ev.event_type.includes("RECOVER");

                    return (
                      <div
                        key={ev.id}
                        style={{
                          background: isVeryRecent ? "#f0fdf4" : "#f8fafc",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          border: isVeryRecent ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                          fontSize: "11.5px",
                          transition: "background 0.3s ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <strong style={{ color: isFailure ? "#b91c1c" : isSuccess ? "#15803d" : "#1e293b", fontSize: "11px" }}>
                              {ev.event_type}
                            </strong>
                            {isVeryRecent && (
                              <span style={{ fontSize: "8.5px", background: "#dcfce7", color: "#15803d", padding: "1px 5px", borderRadius: "6px", fontWeight: 700 }}>
                                NEW
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                            {eventDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                        <div style={{ color: "#64748b", fontSize: "10.5px", display: "flex", justifyContent: "space-between" }}>
                          <span>{ev.customers?.name || "Customer"}</span>
                          <strong style={{ color: "#0f172a" }}>₹{Number(ev.amount).toLocaleString()}</strong>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 9-Scenario Recovery Distribution Table */}
          <div className="panel" style={{ marginBottom: "24px" }}>
            <div className="panel-heading">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2 style={{ margin: 0 }}>Scenario Archetype Distribution Matrix</h2>
                  <span style={{ fontSize: "9.5px", background: "#f3e8ff", color: "#7e22ce", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>
                    9 ARCHETYPES
                  </span>
                </div>
                <p>Real-time status aggregated across all 9 payment and customer lifecycle archetypes</p>
              </div>
              <button className="outline-button" style={{ fontSize: "11px" }} onClick={() => onNavigate("recovery-demo")}>
                Launch Scenario Lab <span>→</span>
              </button>
            </div>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scenario Archetype</th>
                    <th>Category</th>
                    <th>Incidents</th>
                    <th>Active</th>
                    <th>Recovered</th>
                    <th>Escalated</th>
                    <th>Revenue at Risk</th>
                    <th>Recovered Revenue</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.scenarioBreakdown || []).map((sc) => (
                    <tr key={sc.key}>
                      <td>
                        <strong style={{ fontSize: "12px" }}>{sc.name}</strong>
                      </td>
                      <td>
                        <span className="status-pill blue" style={{ fontSize: "10px" }}>{sc.category}</span>
                      </td>
                      <td>
                        <strong>{sc.incidentsCount}</strong>
                      </td>
                      <td>
                        {sc.activeCount > 0 ? (
                          <span className="status-pill warning" style={{ fontSize: "10.5px" }}>{sc.activeCount} open</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        )}
                      </td>
                      <td>
                        {sc.recoveredCount > 0 ? (
                          <span className="status-pill success" style={{ fontSize: "10.5px" }}>{sc.recoveredCount} paid</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        )}
                      </td>
                      <td>
                        {sc.escalatedCount > 0 ? (
                          <span className="status-pill danger" style={{ fontSize: "10.5px" }}>{sc.escalatedCount} escalated</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>0</span>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: sc.amountAtRisk > 0 ? "#b91c1c" : "#64748b" }}>
                          ₹{Number(sc.amountAtRisk).toLocaleString()}
                        </strong>
                      </td>
                      <td>
                        <strong style={{ color: sc.amountRecovered > 0 ? "#15803d" : "#64748b" }}>
                          ₹{Number(sc.amountRecovered).toLocaleString()}
                        </strong>
                      </td>
                      <td>
                        <button
                          className="table-action-button"
                          onClick={() => onNavigate("recovery")}
                        >
                          View Cases
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
