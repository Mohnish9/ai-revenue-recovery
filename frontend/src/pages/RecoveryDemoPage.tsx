import React, { useState, useEffect } from "react";
import type {
  ScenarioTypeConfig,
  SandboxIncidentResponse,
  Customer,
  PageKey,
} from "../lib/types";
import {
  fetchScenarioTypesApi,
  fetchSandboxIncidentsApi,
  createSandboxIncidentApi,
  fetchCustomers,
} from "../lib/api";

interface RecoveryDemoPageProps {
  onNavigate?: (page: PageKey) => void;
}

export function RecoveryDemoPage({ onNavigate }: RecoveryDemoPageProps) {
  const navigateTo = (page: PageKey) => {
    if (onNavigate) {
      onNavigate(page);
    } else {
      window.history.pushState({}, "", `/${page}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  // State
  const [scenarioTypes, setScenarioTypes] = useState<ScenarioTypeConfig[]>([]);
  const [supabaseCustomers, setSupabaseCustomers] = useState<Customer[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<SandboxIncidentResponse[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  // Newly created incident confirmation
  const [createdIncident, setCreatedIncident] = useState<SandboxIncidentResponse | null>(null);

  // Creation Form State
  const [selectedTypeKey, setSelectedTypeKey] = useState<string>("insufficient-funds");
  const [customerMode, setCustomerMode] = useState<"SELECT" | "CUSTOM">("CUSTOM");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  
  // Custom customer fields - no hardcoded fallbacks
  const [customName, setCustomName] = useState<string>("Vikramaditya Singhania");
  const [customEmail, setCustomEmail] = useState<string>("vikram.singhania@vertexholdings.in");
  const [customPhone, setCustomPhone] = useState<string>("+91 94176 75967");
  const [customType, setCustomType] = useState<string>("INDIVIDUAL");

  const [amount, setAmount] = useState<number>(7800);
  const [currency, setCurrency] = useState<string>("INR");
  const [paymentMethod, setPaymentMethod] = useState<string>("HDFC Visa Credit Card (•••• 4829)");
  const [failureCode, setFailureCode] = useState<string>("ERR_INSUFFICIENT_FUNDS_51");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [billingContext, setBillingContext] = useState<string>(
    "Primary card rejected with ERR_INSUFFICIENT_FUNDS during 04:00 AM automated batch billing. High historical LTV customer."
  );
  const [customInstruction, setCustomInstruction] = useState<string>("");

  const loadData = async () => {
    try {
      setLoadingInitial(true);
      const [types, customers, incidents] = await Promise.all([
        fetchScenarioTypesApi().catch(() => []),
        fetchCustomers(50).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setScenarioTypes(types);
      setSupabaseCustomers(customers);
      setRecentIncidents(incidents);

      if (customers.length > 0) {
        setSelectedCustomerId(customers[0].id);
      }
    } catch (err) {
      console.warn("Failed to load scenario initialization data:", err);
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update scenario form fields on preset selection
  const handleSelectPreset = (key: string) => {
    setSelectedTypeKey(key);
    const chosenType = scenarioTypes.find((t) => t.key === key);
    if (chosenType) {
      setAmount(chosenType.suggestedAmount);
      setPaymentMethod(chosenType.defaultPaymentMethod);
      setFailureCode(chosenType.defaultFailureCode);
      setSeverity(chosenType.defaultSeverity);
      setBillingContext(chosenType.sampleBillingContext);
    }
  };

  // Submit and create problem
  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      setCreationError(null);

      const input = {
        scenarioTypeKey: selectedTypeKey,
        customerId: customerMode === "SELECT" ? selectedCustomerId : undefined,
        customerCustom:
          customerMode === "CUSTOM"
            ? {
                name: customName.trim() || "Sandbox Customer",
                email: customEmail.trim() || "customer@example.test",
                phone: customPhone.trim() || undefined,
                customer_type: customType,
              }
            : undefined,
        amount: Number(amount) || 5000,
        currency,
        paymentMethod: paymentMethod.trim() || "Primary Payment Rail",
        paymentRail: paymentMethod.trim() || "Primary Payment Rail",
        failureCode: failureCode.trim() || "ERR_PAYMENT_DECLINE",
        severity,
        billingContext: billingContext.trim() || "Sandbox revenue problem created by operator.",
        customInstruction: customInstruction.trim() || undefined,
      };

      const result = await createSandboxIncidentApi(input);
      setCreatedIncident(result);

      // Refresh recent list
      const updatedList = await fetchSandboxIncidentsApi().catch(() => []);
      setRecentIncidents(updatedList);

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error("Failed to create recovery problem:", err);
      setCreationError(err?.message || "Failed to create recovery problem");
    } finally {
      setCreating(false);
    }
  };

  // Get operational page mapping for a scenario
  const getOperationalPage = (scenarioKey?: string): { page: PageKey; label: string } => {
    switch (scenarioKey) {
      case "insufficient-funds":
      case "expired-card":
      case "3ds-failure":
      case "gateway-timeout":
        return { page: "failed-payments", label: "Failed Payments View" };
      case "checkout-abandonment":
        return { page: "checkout-dropoffs", label: "Checkout Drop-offs View" };
      case "subscription-renewal-failure":
        return { page: "subscriptions", label: "Subscriptions View" };
      case "upi-mandate-failure":
        return { page: "mandates", label: "UPI Mandates View" };
      case "overdue-invoice":
        return { page: "invoices", label: "Invoices View" };
      case "high-churn-risk":
        return { page: "customers", label: "Customer 360 View" };
      default:
        return { page: "failed-payments", label: "Operational View" };
    }
  };

  return (
    <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "80px" }}>
      {/* Page Heading */}
      <div className="page-heading" style={{ marginBottom: "24px" }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>PROBLEM CREATION CENTER</span>
            <span className="status-pill purple" style={{ fontSize: "10px", padding: "2px 8px" }}>
              ⚡ SCENARIO ENTRY POINT
            </span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#0f172a" }}>
            Create Sandbox Recovery Problem
          </h1>
          <p style={{ color: "#64748b", fontSize: "13.5px", marginTop: "4px", maxWidth: "800px" }}>
            Define and inject a simulated payment disruption or customer revenue problem. Upon creation, the autonomous recovery workflow initializes automatically. Monitor active progress and live countdown timers in <strong>Recovery Cases</strong>, and inspect Gemini AI decision traces in the <strong>AI Agent</strong>.
          </p>
        </div>
      </div>

      {/* SUCCESS CONFIRMATION CARD (Shown immediately after problem creation) */}
      {createdIncident && (
        <div
          style={{
            background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
            border: "1px solid #86efac",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "32px",
            boxShadow: "0 10px 25px -5px rgba(22, 163, 74, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#16a34a",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: 800,
                }}
              >
                ✓
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Problem Created Successfully
                  </span>
                  <span className="status-pill success" style={{ fontSize: "10px" }}>
                    {createdIncident.incident.status || "ACTIVE"}
                  </span>
                </div>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#14532d", margin: "2px 0 0" }}>
                  {createdIncident.incident.scenarioTypeName}
                </h2>
              </div>
            </div>

            <button
              onClick={() => setCreatedIncident(null)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "11px", padding: "4px 10px", background: "#ffffff" }}
            >
              + Create Another Problem
            </button>
          </div>

          {/* Persisted Source-of-Truth Metadata */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "10px",
              border: "1px solid #bbf7d0",
              padding: "16px 20px",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>PROBLEM ID</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", fontFamily: "DM Mono", marginTop: "2px" }}>
                {createdIncident.incident.id}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>CUSTOMER</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                {createdIncident.customer.name}
              </div>
              <div style={{ fontSize: "11px", color: "#475569" }}>{createdIncident.customer.email}</div>
              {((createdIncident.customer as any).phone || createdIncident.incident.customer_phone) && (
                <div style={{ fontSize: "11px", color: "#166534", fontWeight: 600, marginTop: "1px" }}>
                  📱 {(createdIncident.customer as any).phone || createdIncident.incident.customer_phone}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>AMOUNT AT RISK</div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                {createdIncident.incident.currency} {createdIncident.incident.amount.toLocaleString()}
              </div>
              <div style={{ fontSize: "10.5px", color: "#64748b" }}>{createdIncident.incident.paymentMethod}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>FAILURE CODE</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#b91c1c", marginTop: "2px", fontFamily: "DM Mono" }}>
                {createdIncident.incident.failureCode}
              </div>
              <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "1px" }}>
                ⚡ Auto-recovery scheduled
              </div>
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <button
              onClick={() => navigateTo("recovery")}
              className="btn btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 700,
                padding: "10px 18px",
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
              }}
            >
              <span>⏱</span>
              <span>Open in Recovery Cases (Watch Live Timer) →</span>
            </button>

            <button
              onClick={() => navigateTo("agent")}
              className="btn"
              style={{
                background: "#0f172a",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 700,
                padding: "10px 18px",
              }}
            >
              <span>🧠</span>
              <span>Inspect in AI Agent (Decision Loop) →</span>
            </button>

            {(() => {
              const op = getOperationalPage(createdIncident.incident.scenarioTypeKey);
              return (
                <button
                  onClick={() => navigateTo(op.page)}
                  className="btn btn-secondary"
                  style={{
                    background: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 600,
                    padding: "10px 16px",
                  }}
                >
                  <span>📂</span>
                  <span>View in {op.label} →</span>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Error Message if any */}
      {creationError && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "14px 18px",
            borderRadius: "10px",
            marginBottom: "20px",
            fontSize: "13px",
          }}
        >
          <strong>Error creating problem:</strong> {creationError}
        </div>
      )}

      {/* 2-Column Layout: Left = Creation Form, Right = Preset Scenarios & Recent Log */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "28px", alignItems: "flex-start" }}>
        
        {/* LEFT: Incident Creation Form */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Problem Details
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Fill in the details of the revenue disruption you want to test.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateProblem} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Scenario Type Selection */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Scenario Type
              </label>
              <select
                className="input"
                value={selectedTypeKey}
                onChange={(e) => handleSelectPreset(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", fontWeight: 600, fontSize: "13px" }}
              >
                {scenarioTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} ({t.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Identification */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                  Customer Contact & Identity
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("CUSTOM")}
                    style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "5px",
                      border: "1px solid",
                      borderColor: customerMode === "CUSTOM" ? "#4f46e5" : "#cbd5e1",
                      background: customerMode === "CUSTOM" ? "#4f46e5" : "#ffffff",
                      color: customerMode === "CUSTOM" ? "#ffffff" : "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Custom Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("SELECT")}
                    style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "5px",
                      border: "1px solid",
                      borderColor: customerMode === "SELECT" ? "#4f46e5" : "#cbd5e1",
                      background: customerMode === "SELECT" ? "#4f46e5" : "#ffffff",
                      color: customerMode === "SELECT" ? "#ffffff" : "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Pick Existing
                  </button>
                </div>
              </div>

              {customerMode === "CUSTOM" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>
                      Customer Full Name
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Vikramaditya Singhania"
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        className="input"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        placeholder="e.g. customer@example.com"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>
                        Phone Number (WhatsApp / SMS)
                      </label>
                      <input
                        type="text"
                        className="input"
                        value={customPhone}
                        onChange={(e) => setCustomPhone(e.target.value)}
                        placeholder="+91 94176 75967"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>
                    Select Supabase Customer Profile
                  </label>
                  <select
                    className="input"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    {supabaseCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email}) {c.phone ? `• ${c.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Amount & Currency */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Amount at Risk
                </label>
                <input
                  type="number"
                  className="input"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={1}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Currency
                </label>
                <select
                  className="input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            {/* Payment Method & Failure Code */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Payment Method / Rail
                </label>
                <input
                  type="text"
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="e.g. HDFC Visa Credit Card"
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Failure Code / Reason
                </label>
                <input
                  type="text"
                  className="input"
                  value={failureCode}
                  onChange={(e) => setFailureCode(e.target.value)}
                  placeholder="e.g. ERR_INSUFFICIENT_FUNDS_51"
                  required
                />
              </div>
            </div>

            {/* Severity & Operational Context */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  Operational Billing Context
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(sev)}
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: 700,
                        border: "1px solid",
                        borderColor: severity === sev ? "#0f172a" : "#cbd5e1",
                        background: severity === sev ? "#0f172a" : "#ffffff",
                        color: severity === sev ? "#ffffff" : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="input"
                rows={2}
                value={billingContext}
                onChange={(e) => setBillingContext(e.target.value)}
                placeholder="Explain the background context of this disruption..."
              />
            </div>

            {/* Optional AI Directive */}
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                Optional AI Directive / Operator Guidance
              </label>
              <input
                type="text"
                className="input"
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="e.g. Prioritize WhatsApp 1-click payment link and apply 5% rescue discount"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={creating}
              className="btn btn-primary"
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
              }}
            >
              {creating ? (
                <>
                  <span className="spinner" style={{ width: "16px", height: "16px" }} />
                  <span>Initializing Problem & AI Workflow...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Create Problem & Start Autonomous Recovery</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT: Scenario Capabilities & Recent Scenarios */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Quick Scenario Templates */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              padding: "20px",
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "0 0 12px" }}>
              Pre-Configured Scenario Labs (9 Archetypes)
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "380px", overflowY: "auto" }}>
              {scenarioTypes.map((st) => (
                <div
                  key={st.key}
                  onClick={() => handleSelectPreset(st.key)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid",
                    borderColor: selectedTypeKey === st.key ? "#4f46e5" : "#e2e8f0",
                    background: selectedTypeKey === st.key ? "#f5f3ff" : "#f8fafc",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a" }}>
                      {st.name}
                    </span>
                    <span className="status-pill info" style={{ fontSize: "9.5px", padding: "1px 6px" }}>
                      {st.category}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    ₹{st.suggestedAmount.toLocaleString()} • {st.defaultFailureCode}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Created Problems Log */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              padding: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Recent Sandbox Problems ({recentIncidents.length})
              </h3>
              <button
                onClick={loadData}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "11px", padding: "2px 8px" }}
              >
                ↻ Refresh
              </button>
            </div>

            {recentIncidents.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                No problems created yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
                {recentIncidents.slice(0, 8).map((inc) => (
                  <div
                    key={inc.incident.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                        {inc.customer.name}
                      </div>
                      <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                        {inc.incident.scenarioTypeName} • ₹{inc.incident.amount.toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => navigateTo("recovery")}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "10.5px", padding: "3px 7px" }}
                        title="View in Recovery Cases"
                      >
                        ⏱ Cases
                      </button>
                      <button
                        onClick={() => navigateTo("agent")}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: "10.5px", padding: "3px 7px" }}
                        title="Inspect in AI Agent"
                      >
                        🧠 Agent
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
