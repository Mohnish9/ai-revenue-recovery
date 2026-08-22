import { useState, useEffect } from "react";
import type { DashboardSummary, ScenarioSimulationResult } from "../lib/types";
import { fetchDashboardSummary, simulateRecoveryScenario } from "../lib/api";

export function ScenarioCenterPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [retryCadence, setRetryCadence] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [discountIncentivePct, setDiscountIncentivePct] = useState<number>(5);
  const [omnichannelEnabled, setOmnichannelEnabled] = useState<boolean>(true);
  const [gracePeriodDays, setGracePeriodDays] = useState<number>(5);
  
  const [simulation, setSimulation] = useState<ScenarioSimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const sum = await fetchDashboardSummary();
        setSummary(sum);
        // Initial simulation
        const sim = await simulateRecoveryScenario({
          retryCadence: "balanced",
          discountIncentivePct: 5,
          omnichannelEnabled: true,
          gracePeriodDays: 5,
          openCasesCount: sum.openRecoveryCases || 5,
          totalAtRisk: sum.revenueAtRisk || 25000,
        });
        setSimulation(sim);
      } catch (e) {
        console.error(e);
      }
    }
    init();
  }, []);

  const runSimulation = async () => {
    try {
      setSimulating(true);
      const sim = await simulateRecoveryScenario({
        retryCadence,
        discountIncentivePct,
        omnichannelEnabled,
        gracePeriodDays,
        openCasesCount: summary?.openRecoveryCases || 5,
        totalAtRisk: summary?.revenueAtRisk || 25000,
      });
      setSimulation(sim);
    } catch (e: any) {
      alert(`Simulation failed: ${e.message}`);
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    if (summary) {
      runSimulation();
    }
  }, [retryCadence, discountIncentivePct, omnichannelEnabled, gracePeriodDays]);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Intelligence & Modeling</span>
            <span className="status-pill purple" style={{ fontSize: "9px" }}>🧪 SIMULATION ONLY - NO DB IMPACT</span>
          </div>
          <h1>Revenue Recovery Scenario Center</h1>
          <p>Simulate policy adjustments, test incentive discount elasticity, and project recovered ARR lift before rolling out changes.</p>
        </div>
      </div>

      {/* Simulation Sandbox Notice */}
      <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "16px" }}>🧪</span>
        <div style={{ fontSize: "11.5px", color: "#5b21b6", lineHeight: "1.4" }}>
          <strong>Safe Simulation Environment: </strong>
          All adjustments below are strictly mathematical what-if simulations. Changing sliders or parameters will never modify live Supabase cases, trigger real payment charges, or dispatch customer outreach.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "18px" }}>
        {/* Left: Interactive Controls */}
        <div className="panel" style={{ padding: "20px" }}>
          <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
            <div>
              <h2>Scenario Parameters</h2>
              <p>Tune recovery parameters to model outcome</p>
            </div>
            <span className="status-pill info" style={{ fontSize: "9px" }}>Sandbox Mode</span>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Retry Cadence */}
            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "6px" }}>
                Smart Retry Strategy
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {(["conservative", "balanced", "aggressive"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`outline-button ${retryCadence === mode ? "active" : ""}`}
                    style={{
                      textTransform: "capitalize",
                      justifyContent: "center",
                      fontSize: "11px",
                      background: retryCadence === mode ? "#142732" : "#ffffff",
                      color: retryCadence === mode ? "#ffffff" : "#1e293b",
                    }}
                    onClick={() => setRetryCadence(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: "10px", color: "#64748b", display: "block", marginTop: "4px" }}>
                {retryCadence === "conservative" && "2 retries spaced 48h apart. Protects customer goodwill."}
                {retryCadence === "balanced" && "4 retries (Immediate, +6h, +24h, +72h). Optimal for India UPI & cards."}
                {retryCadence === "aggressive" && "6 rapid retries across multiple acquirers within 36 hours."}
              </span>
            </div>

            {/* Incentive Discount Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b" }}>
                  Prompt Payment Discount Offer
                </label>
                <strong style={{ fontSize: "12px", color: "#15803d" }}>{discountIncentivePct}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                value={discountIncentivePct}
                onChange={(e) => setDiscountIncentivePct(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#142732" }}
              />
              <span style={{ fontSize: "10px", color: "#64748b" }}>
                Offer time-limited credit to incentivize immediate resolution for overdue invoices.
              </span>
            </div>

            {/* Grace Period */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b" }}>
                  Subscription Grace Period (Days)
                </label>
                <strong style={{ fontSize: "12px" }}>{gracePeriodDays} days</strong>
              </div>
              <input
                type="range"
                min="1"
                max="14"
                step="1"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#142732" }}
              />
              <span style={{ fontSize: "10px", color: "#64748b" }}>
                Number of days access is retained while automated dunning retries execute.
              </span>
            </div>

            {/* Omnichannel Toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #edf1f4" }}>
              <div>
                <strong style={{ fontSize: "11.5px", color: "#1e293b", display: "block" }}>Omnichannel Fallback (WhatsApp + SMS + Email)</strong>
                <span style={{ fontSize: "10px", color: "#64748b" }}>Trigger WhatsApp conversational pay-links when email bounces.</span>
              </div>
              <input
                type="checkbox"
                checked={omnichannelEnabled}
                onChange={(e) => setOmnichannelEnabled(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "#142732" }}
              />
            </div>
          </div>
        </div>

        {/* Right: Projected Lift Results */}
        <div className="panel" style={{ padding: "20px" }}>
          <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
            <div>
              <h2>Projected Revenue & Lift</h2>
              <p>Simulated outcome against current baseline queue</p>
            </div>
            {simulating && <span className="status-pill warning">Simulating...</span>}
          </div>

          {simulation ? (
            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Primary Projected Metric Card */}
              <div style={{ background: "#0b1720", color: "#ffffff", padding: "18px", borderRadius: "8px" }}>
                <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Simulated Net Recovered Revenue
                </span>
                <div style={{ fontSize: "28px", fontWeight: 800, color: "#d6f36b", marginTop: "4px", marginBottom: "6px" }}>
                  ₹{simulation.netRecoveredRevenue.toLocaleString()}
                </div>
                <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
                  Projected Recovery Rate: <strong style={{ color: "#ffffff" }}>{(simulation.projectedRecoveryRate * 100).toFixed(1)}%</strong>
                  {" "}(Baseline: {((simulation.comparisonAgainstBaseline.baselineRecovered / (summary?.revenueAtRisk || 1)) * 100).toFixed(1)}%)
                </div>
              </div>

              {/* Lift Breakdown Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px" }}>
                  <span style={{ fontSize: "10px", color: "#166534", textTransform: "uppercase", fontWeight: 700 }}>Incremental ARR Lift</span>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#15803d", marginTop: "2px" }}>
                    +₹{simulation.comparisonAgainstBaseline.revenueLift.toLocaleString()}
                  </div>
                  <span style={{ fontSize: "10px", color: "#166534" }}>
                    +{(simulation.comparisonAgainstBaseline.percentageLift).toFixed(1)}% vs baseline
                  </span>
                </div>

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px", borderRadius: "8px" }}>
                  <span style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Customer Retention Score</span>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {simulation.customerRetentionScore}/100
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>
                    Estimated churn risk: <strong>{simulation.churnRisk}</strong>
                  </span>
                </div>
              </div>

              {/* Detailed Economics Breakdown */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ background: "#f8fafc", padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "#334155", borderBottom: "1px solid #e2e8f0" }}>
                  Simulated Unit Economics
                </div>
                <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "11.5px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Total Revenue at Risk (Active Cases):</span>
                    <strong>₹{simulation.parameters.totalAtRisk.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Estimated Gross Recovered:</span>
                    <strong style={{ color: "#15803d" }}>₹{simulation.estimatedRecoveredAmount.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Incentive Discount Cost ({discountIncentivePct}%):</span>
                    <strong style={{ color: "#b91c1c" }}>-₹{simulation.discountIncentiveCost.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid #edf1f4" }}>
                    <span style={{ color: "#0f172a", fontWeight: 700 }}>Net Recovered Revenue:</span>
                    <strong style={{ color: "#0f172a" }}>₹{simulation.netRecoveredRevenue.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>Simulating economics...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
