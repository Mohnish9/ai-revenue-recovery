import { useState, useEffect } from "react";
import type { DashboardSummary } from "../lib/types";
import { fetchDashboardSummary } from "../lib/api";

export function AnalyticsPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetchDashboardSummary();
        setSummary(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Insights</div>
          <h1>Recovery Analytics & Yield Insights</h1>
          <p>Holistic performance metrics across payment recovery funnels, retry channels, and involuntary churn prevention.</p>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon green">✓</div>
          <span className="metric-label">Recovered Revenue</span>
          <strong>₹{summary ? Number(summary.recoveredThisMonth).toLocaleString() : "0"}</strong>
          <small>Protected from involuntary churn</small>
        </div>

        <div className="metric-card">
          <div className="metric-icon orange">↗</div>
          <span className="metric-label">Outstanding at Risk</span>
          <strong>₹{summary ? Number(summary.revenueAtRisk).toLocaleString() : "0"}</strong>
          <small>Active in operational queue</small>
        </div>

        <div className="metric-card">
          <div className="metric-icon purple">✦</div>
          <span className="metric-label">Recovery Conversion Rate</span>
          <strong>{summary ? `${Math.round(summary.recoveryRate * 100)}%` : "0%"}</strong>
          <small>Industry benchmark: ~42%</small>
        </div>

        <div className="metric-card">
          <div className="metric-icon blue">⚡</div>
          <span className="metric-label">Mean Time to Recovery</span>
          <strong>14.2 hrs</strong>
          <small>From first decline to successful capture</small>
        </div>
      </div>

      {/* Recovery Funnel */}
      <div className="panel" style={{ padding: "20px", marginBottom: "20px" }}>
        <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
          <div>
            <h2>Autonomous Recovery Funnel Conversion</h2>
            <p>Step-by-step conversion from transaction decline to revenue realization</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span>1. Failed Payment Event Detected</span>
              <strong>100% (100 events)</strong>
            </div>
            <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", background: "#64748b" }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span>2. Autonomous Smart Retry / Action Dispatched</span>
              <strong>96% (96 actions triggered)</strong>
            </div>
            <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ width: "96%", height: "100%", background: "#3b82f6" }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span>3. Payment Link Opened / UPI Intent Received</span>
              <strong>82% (82 engagements)</strong>
            </div>
            <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ width: "82%", height: "100%", background: "#8b5cf6" }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span>4. Final Payment Successful & Revenue Recovered</span>
              <strong>74% (74 successfully collected)</strong>
            </div>
            <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ width: "74%", height: "100%", background: "#22c55e" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method Yield Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="panel" style={{ padding: "20px" }}>
          <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
            <div>
              <h2>Recovery Yield by Payment Method</h2>
              <p>Resolution rate by rail</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px", fontSize: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>UPI Intent & QR</span>
              <strong style={{ color: "#15803d" }}>88.4% success</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>Credit & Debit Cards (3DS)</span>
              <strong style={{ color: "#15803d" }}>71.2% success</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>Netbanking Corporate</span>
              <strong style={{ color: "#b45309" }}>64.0% success</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span>UPI AutoPay / e-NACH</span>
              <strong style={{ color: "#15803d" }}>79.5% success</strong>
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: "20px" }}>
          <div className="panel-heading" style={{ padding: "0 0 14px", borderBottom: "1px solid #edf1f4" }}>
            <div>
              <h2>Failure Cause Distribution</h2>
              <p>Top underlying error reasons</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px", fontSize: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>Insufficient Funds / Balance</span>
              <strong style={{ color: "#dc2626" }}>52%</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>Card Expired / Issuer Decline</span>
              <strong style={{ color: "#ea580c" }}>26%</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>Bank Gateway Downtime / Timeout</span>
              <strong style={{ color: "#eab308" }}>14%</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span>Customer Cancelled 3DS OTP</span>
              <strong style={{ color: "#64748b" }}>8%</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
