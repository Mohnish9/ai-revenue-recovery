import React, { useState, useEffect } from "react";
import type {
  ScenarioTypeConfig,
  SandboxIncidentResponse,
  SandboxSimulationResult,
  Customer,
} from "../lib/types";
import {
  fetchScenarioTypesApi,
  fetchSandboxIncidentsApi,
  fetchSandboxIncidentApi,
  createSandboxIncidentApi,
  analyzeSandboxIncidentApi,
  executeSandboxIncidentActionApi,
  deleteSandboxIncidentApi,
  fetchCustomers,
} from "../lib/api";

type ActiveTab = "INTELLIGENCE" | "MESSAGES" | "SUPABASE_CONTEXT" | "AUDIT_TRAIL";
type MessageChannel = "WHATSAPP" | "SMS" | "EMAIL";

export function RecoveryDemoPage() {
  // Scenario types, Supabase customers, and persisted sandbox incidents
  const [scenarioTypes, setScenarioTypes] = useState<ScenarioTypeConfig[]>([]);
  const [supabaseCustomers, setSupabaseCustomers] = useState<Customer[]>([]);
  const [sandboxIncidentsList, setSandboxIncidentsList] = useState<SandboxIncidentResponse[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [showIncidentsDrawer, setShowIncidentsDrawer] = useState<boolean>(false);

  // Creation Form State
  const [selectedTypeKey, setSelectedTypeKey] = useState<string>("insufficient-funds");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [isCustomCustomer, setIsCustomCustomer] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");
  const [customEmail, setCustomEmail] = useState<string>("");
  const [customType, setCustomType] = useState<string>("INDIVIDUAL");

  const [amount, setAmount] = useState<number>(7800);
  const [currency, setCurrency] = useState<string>("INR");
  const [paymentMethod, setPaymentMethod] = useState<string>("HDFC Visa Credit Card (•••• 4829)");
  const [failureCode, setFailureCode] = useState<string>("ERR_INSUFFICIENT_FUNDS_51");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [billingContext, setBillingContext] = useState<string>(
    "Primary credit card debited for monthly SaaS tier rejected with ERR_INSUFFICIENT_FUNDS during 04:00 AM automated batch debit. Customer has high historical LTV and active product engagement."
  );
  const [customInstruction, setCustomInstruction] = useState<string>("");

  // Incident & Agent Execution State
  const [activeIncident, setActiveIncident] = useState<SandboxIncidentResponse | null>(null);
  const [analyzingIncident, setAnalyzingIncident] = useState<boolean>(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);

  // Simulation & Action Execution State
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SandboxSimulationResult | null>(null);

  // Re-analysis state
  const [reanalyzing, setReanalyzing] = useState<boolean>(false);
  const [reanalysisPrompt, setReanalysisPrompt] = useState<string>("");

  // Workspace UI Tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>("INTELLIGENCE");
  const [messageChannel, setMessageChannel] = useState<MessageChannel>("WHATSAPP");

  // Load initial scenario types, Supabase customers, and persisted sandbox incidents
  const refreshIncidentsList = async () => {
    try {
      const list = await fetchSandboxIncidentsApi();
      setSandboxIncidentsList(list);
      return list;
    } catch (err) {
      console.warn("Failed to fetch sandbox incidents list:", err);
      return [];
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoadingInitial(true);
        const [types, customers, incidents] = await Promise.all([
          fetchScenarioTypesApi().catch(() => []),
          fetchCustomers(50).catch(() => []),
          fetchSandboxIncidentsApi().catch(() => []),
        ]);
        setScenarioTypes(types);
        setSupabaseCustomers(customers);
        setSandboxIncidentsList(incidents);

        if (customers.length > 0) {
          setSelectedCustomerId(customers[0].id);
        }

        // If there is already a persisted incident, load the most recent one
        if (incidents.length > 0) {
          setActiveIncident(incidents[0]);
        }
      } catch (err) {
        console.warn("Failed to load initial sandbox data:", err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadInitialData();
  }, []);

  // When scenario type selection changes, populate smart defaults
  const handleScenarioTypeSelect = (typeKey: string) => {
    setSelectedTypeKey(typeKey);
    const chosenType = scenarioTypes.find((t) => t.key === typeKey);
    if (chosenType) {
      setAmount(chosenType.suggestedAmount);
      setPaymentMethod(chosenType.defaultPaymentMethod);
      setFailureCode(chosenType.defaultFailureCode);
      setSeverity(chosenType.defaultSeverity);
      setBillingContext(chosenType.sampleBillingContext);
    }
  };

  // Submit and create dynamic sandbox incident
  const handleCreateIncident = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setAnalyzingIncident(true);
      setIncidentError(null);
      setSimulationResult(null);

      const input = {
        scenarioTypeKey: selectedTypeKey,
        customerId: isCustomCustomer ? undefined : selectedCustomerId,
        customerCustom: isCustomCustomer
          ? {
              name: customName.trim() || "Sandbox Customer",
              email: customEmail.trim() || "sandbox.customer@example.test",
              customer_type: customType,
            }
          : undefined,
        amount: Number(amount) || 5000,
        currency,
        paymentMethod: paymentMethod.trim() || "Standard Card / Rail",
        failureCode: failureCode.trim() || "ERR_PAYMENT_DECLINE",
        severity,
        billingContext: billingContext.trim() || "Sandbox revenue incident created by operator.",
        customInstruction: customInstruction.trim() || undefined,
      };

      const result = await createSandboxIncidentApi(input);
      setActiveIncident(result);
      setActiveTab("INTELLIGENCE");
      await refreshIncidentsList();
    } catch (err: any) {
      console.error("Failed to create and analyze sandbox incident:", err);
      setIncidentError(err?.message || "Failed to create sandbox incident with AI analysis");
    } finally {
      setAnalyzingIncident(false);
    }
  };

  // Select an existing incident from the persisted store
  const handleSelectIncident = async (id: string) => {
    try {
      const inc = await fetchSandboxIncidentApi(id);
      setActiveIncident(inc);
      setSimulationResult(null);
      setShowIncidentsDrawer(false);
      setActiveTab("INTELLIGENCE");
    } catch (err: any) {
      console.error("Failed to fetch selected incident:", err);
    }
  };

  // Delete an incident from the persisted store
  const handleDeleteIncident = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteSandboxIncidentApi(id);
      if (activeIncident?.incident.id === id) {
        setActiveIncident(null);
        setSimulationResult(null);
      }
      await refreshIncidentsList();
    } catch (err) {
      console.warn("Failed to delete incident:", err);
    }
  };

  // Re-run AI analysis on the active incident (e.g. if key was just added or with new directive)
  const handleReanalyzeWithAI = async () => {
    if (!activeIncident) return;
    try {
      setReanalyzing(true);
      setIncidentError(null);
      const updated = await analyzeSandboxIncidentApi(
        activeIncident.incident.id,
        reanalysisPrompt.trim() || undefined
      );
      setActiveIncident(updated);
      await refreshIncidentsList();
    } catch (err: any) {
      console.error("Re-analysis failed:", err);
      setIncidentError(err?.message || "AI Analysis failed to complete.");
    } finally {
      setReanalyzing(false);
    }
  };

  // Execute a sandbox recovery action
  const handleExecuteAction = async (actionType: string, strategyName?: string) => {
    if (!activeIncident) return;
    try {
      setExecutingAction(actionType);
      const result = await executeSandboxIncidentActionApi(activeIncident.incident.id, {
        actionType,
        strategyName: strategyName || activeIncident.analysis.selectedStrategy,
        reason: `Operator triggered action ${actionType} via Sandbox Recovery Studio`,
        operatorInfo: { name: "Sandbox Operator", email: "operator@recoverly.test" },
      });

      setSimulationResult(result.simulation);
      setActiveIncident(result.updatedIncident);
      await refreshIncidentsList();
    } catch (err: any) {
      console.error("Failed to execute action:", err);
      setIncidentError(err?.message || "Failed to execute recovery action");
    } finally {
      setExecutingAction(null);
    }
  };

  // Reset to create a brand new incident
  const handleResetToNewIncident = () => {
    setActiveIncident(null);
    setSimulationResult(null);
    setIncidentError(null);
  };

  const selectedCustomerObj = isCustomCustomer
    ? null
    : supabaseCustomers.find((c) => c.id === selectedCustomerId) || supabaseCustomers[0];

  const currentTypeConfig = scenarioTypes.find((t) => t.key === selectedTypeKey) || scenarioTypes[0];

  const amountPresets = [2499, 4500, 7800, 14200, 25000, 50000];

  return (
    <div className="page" id="recovery-demo-page">
      {/* Page Header */}
      <div className="page-heading" id="demo-page-heading">
        <div>
          <div className="eyebrow">Autonomous Revenue Ops • Sandbox Studio</div>
          <h1>Dynamic Revenue Incident Sandbox</h1>
          <p>
            Create, persist, and resolve dynamic sandbox revenue incidents across 9 payment disruption rails.
            Grounded in real Supabase customer telemetry, analyzed by Gemini AI, and safely simulated with 0 production database mutations.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="sandbox-tag-pill" id="sandbox-isolation-badge">
            <span style={{ fontSize: "12px" }}>🔒</span>
            <span>SANDBOX ISOLATION ACTIVE • NO PROD IMPACT</span>
          </div>

          <button
            className="outline-button"
            id="toggle-incidents-list-btn"
            onClick={() => setShowIncidentsDrawer(!showIncidentsDrawer)}
            style={{ background: "#ffffff", borderColor: "#cbd5e1", fontSize: "12.5px" }}
          >
            📋 Incidents List ({sandboxIncidentsList.length})
          </button>

          {activeIncident ? (
            <button
              className="action-button"
              id="new-incident-top-btn"
              onClick={handleResetToNewIncident}
              style={{ fontSize: "12.5px" }}
            >
              + Create New Incident
            </button>
          ) : null}
        </div>
      </div>

      {/* Persisted Incidents List Drawer / Bar */}
      {showIncidentsDrawer && (
        <div
          className="panel"
          style={{ padding: "18px 22px", background: "#f8fafc", borderColor: "#cbd5e1", marginBottom: "20px" }}
          id="persisted-incidents-drawer"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 800, color: "#172a34" }}>
                Active Sandbox Incidents Store ({sandboxIncidentsList.length})
              </h3>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Persisted in sandbox storage across page navigation and tabs.
              </p>
            </div>
            <button
              className="preset-chip-btn"
              onClick={() => setShowIncidentsDrawer(false)}
              style={{ fontSize: "11px" }}
            >
              ✕ Close List
            </button>
          </div>

          {sandboxIncidentsList.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
              No sandbox incidents created yet. Use the form below to create your first dynamic incident!
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "10px",
                maxHeight: "220px",
                overflowY: "auto",
              }}
            >
              {sandboxIncidentsList.map((inc) => {
                const isSelected = activeIncident?.incident.id === inc.incident.id;
                return (
                  <div
                    key={inc.incident.id}
                    onClick={() => handleSelectIncident(inc.incident.id)}
                    style={{
                      padding: "10px 14px",
                      background: isSelected ? "#eff6ff" : "#ffffff",
                      border: isSelected ? "2px solid #0284c7" : "1px solid #e2e8f0",
                      borderRadius: "8px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", fontWeight: 700, color: "#0284c7" }}>
                        {inc.incident.id}
                      </span>
                      <span
                        className={`status-pill ${
                          inc.incident.status === "ACTION_SIMULATED" || inc.incident.status === "RECOVERED"
                            ? "success"
                            : inc.incident.status === "ANALYZED"
                            ? "info"
                            : "warning"
                        }`}
                        style={{ fontSize: "9.5px", padding: "1px 6px" }}
                      >
                        {inc.incident.status}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#1e293b" }}>
                      {inc.customer.name} • ₹{inc.incident.amount.toLocaleString()} {inc.incident.currency}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#64748b" }}>
                      <span>{inc.incident.scenarioTypeName}</span>
                      <button
                        onClick={(e) => handleDeleteIncident(e, inc.incident.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "11px",
                          padding: "2px 4px",
                        }}
                        title="Delete Incident"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loadingInitial ? (
        <div className="loading-container" id="sandbox-initial-loading">
          <div className="spinner"></div>
          <span>Initializing dynamic sandbox engine and grounding Supabase customer context...</span>
        </div>
      ) : !activeIncident ? (
        /* ========================================================================= */
        /* STATE A: CREATE REVENUE INCIDENT FORM                                     */
        /* ========================================================================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} id="incident-creation-workspace">
          {/* Step 1: Select Scenario Type (9 Types) */}
          <div className="panel" style={{ padding: "20px 24px" }} id="scenario-type-selection-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <h2 style={{ fontSize: "15px", margin: 0, color: "#172a34", fontWeight: 800 }}>
                  1. Choose Revenue Disruption Scenario Type (9 Rails)
                </h2>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                  Select the failure archetype. Smart parameters will auto-fill below for instant customization or launch.
                </p>
              </div>
              <span className="status-pill info">9 Supported Types</span>
            </div>

            <div className="sandbox-type-grid" id="scenario-types-grid">
              {scenarioTypes.map((type) => {
                const isSelected = type.key === selectedTypeKey;
                return (
                  <div
                    key={type.key}
                    id={`type-card-${type.key}`}
                    className={`sandbox-type-card ${isSelected ? "selected" : ""}`}
                    onClick={() => handleScenarioTypeSelect(type.key)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <span className={`status-pill ${type.defaultSeverity === "CRITICAL" ? "danger" : type.defaultSeverity === "HIGH" ? "warning" : "info"}`}>
                        {type.defaultSeverity}
                      </span>
                      <span className="status-pill purple" style={{ fontSize: "9px" }}>{type.category}</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: "#172a34", marginBottom: "4px" }}>
                      {type.name}
                    </div>
                    <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 10px", lineHeight: "15px" }}>
                      {type.description}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: "8px", fontSize: "10.5px" }}>
                      <span style={{ color: "#0284c7", fontWeight: 600 }}>{type.defaultChannel}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#475569" }}>
                        ₹{type.suggestedAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2 & 3: Customer Context & Incident Parameters */}
          <form onSubmit={handleCreateIncident} id="incident-parameters-form">
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr", gap: "20px" }}>
              {/* Left Column: Customer Grounding */}
              <div className="panel" style={{ padding: "20px 24px" }} id="customer-grounding-panel">
                <div style={{ marginBottom: "16px" }}>
                  <h2 style={{ fontSize: "15px", margin: 0, color: "#172a34", fontWeight: 800 }}>
                    2. Select Customer (Supabase Ground Truth)
                  </h2>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                    Gemini AI will fetch this customer's actual historical invoices, subscriptions, and transaction ledger.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                  <button
                    type="button"
                    className={`preset-chip-btn ${!isCustomCustomer ? "active" : ""}`}
                    onClick={() => setIsCustomCustomer(false)}
                    id="select-existing-customer-btn"
                  >
                    Select Supabase Account
                  </button>
                  <button
                    type="button"
                    className={`preset-chip-btn ${isCustomCustomer ? "active" : ""}`}
                    onClick={() => setIsCustomCustomer(true)}
                    id="enter-custom-customer-btn"
                  >
                    + Custom Customer Input
                  </button>
                </div>

                {!isCustomCustomer ? (
                  <div>
                    <label className="field-label" htmlFor="customer-select">
                      Customer Profile:
                    </label>
                    <select
                      id="customer-select"
                      className="text-input"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      style={{ marginBottom: "16px" }}
                    >
                      {supabaseCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.email}) — {c.customer_type || "INDIVIDUAL"}
                        </option>
                      ))}
                    </select>

                    {selectedCustomerObj && (
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          padding: "14px",
                          fontSize: "12px",
                        }}
                        id="selected-customer-preview-box"
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <strong style={{ color: "#1e293b" }}>{selectedCustomerObj.name}</strong>
                          <span className="status-pill neutral">{selectedCustomerObj.customer_type || "INDIVIDUAL"}</span>
                        </div>
                        <div style={{ color: "#64748b", fontSize: "11.5px", marginBottom: "4px" }}>
                          Email: {selectedCustomerObj.email}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "11.5px" }}>
                          Supabase ID: <span style={{ fontFamily: "'DM Mono', monospace" }}>{selectedCustomerObj.id}</span>
                        </div>
                        <div
                          style={{
                            marginTop: "10px",
                            paddingTop: "8px",
                            borderTop: "1px dashed #cbd5e1",
                            fontSize: "11px",
                            color: "#0284c7",
                            fontWeight: 600,
                          }}
                        >
                          ✓ Connected to live Supabase ledger & payment telemetry
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label className="field-label" htmlFor="custom-customer-name">
                        Customer Full Name:
                      </label>
                      <input
                        id="custom-customer-name"
                        type="text"
                        className="text-input"
                        placeholder="e.g. Priya Sharma"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="custom-customer-email">
                        Customer Email Address:
                      </label>
                      <input
                        id="custom-customer-email"
                        type="email"
                        className="text-input"
                        placeholder="e.g. priya.sharma@example.test"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="custom-customer-type">
                        Account Tier:
                      </label>
                      <select
                        id="custom-customer-type"
                        className="text-input"
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                      >
                        <option value="INDIVIDUAL">INDIVIDUAL (B2C)</option>
                        <option value="BUSINESS">BUSINESS (SMB)</option>
                        <option value="ENTERPRISE">ENTERPRISE (B2B)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Financial & Technical Parameters */}
              <div className="panel" style={{ padding: "20px 24px" }} id="incident-parameters-panel">
                <div style={{ marginBottom: "16px" }}>
                  <h2 style={{ fontSize: "15px", margin: 0, color: "#172a34", fontWeight: 800 }}>
                    3. Incident Parameters & Disruption Rail
                  </h2>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                    Tune the amount at risk, payment method, failure code, and situational notes.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Amount at Risk & Currency */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <label className="field-label" htmlFor="incident-amount" style={{ margin: 0 }}>
                          Amount at Risk:
                        </label>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {amountPresets.slice(0, 3).map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`preset-chip-btn ${amount === p ? "active" : ""}`}
                              onClick={() => setAmount(p)}
                              style={{ padding: "1px 5px", fontSize: "9.5px" }}
                            >
                              ₹{p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        id="incident-amount"
                        type="number"
                        className="text-input"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        min="10"
                        step="1"
                        required
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="incident-currency">
                        Currency:
                      </label>
                      <select
                        id="incident-currency"
                        className="text-input"
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

                  {/* Payment Method & Severity */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "12px" }}>
                    <div>
                      <label className="field-label" htmlFor="incident-payment-method">
                        Payment Method / Rail:
                      </label>
                      <input
                        id="incident-payment-method"
                        type="text"
                        className="text-input"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="incident-severity">
                        Severity:
                      </label>
                      <select
                        id="incident-severity"
                        className="text-input"
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as any)}
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="CRITICAL">CRITICAL</option>
                      </select>
                    </div>
                  </div>

                  {/* Failure Code */}
                  <div>
                    <label className="field-label" htmlFor="incident-failure-code">
                      Gateway Disruption / Decline Code:
                    </label>
                    <input
                      id="incident-failure-code"
                      type="text"
                      className="text-input"
                      style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }}
                      value={failureCode}
                      onChange={(e) => setFailureCode(e.target.value)}
                      required
                    />
                  </div>

                  {/* Billing Context */}
                  <div>
                    <label className="field-label" htmlFor="incident-billing-context">
                      Operational & Billing Context:
                    </label>
                    <textarea
                      id="incident-billing-context"
                      className="text-input"
                      rows={2}
                      value={billingContext}
                      onChange={(e) => setBillingContext(e.target.value)}
                      placeholder="Describe the failure context..."
                      required
                    />
                  </div>

                  {/* Operator AI Directive */}
                  <div>
                    <label className="field-label" htmlFor="incident-operator-prompt">
                      Operator Directive for Gemini AI (Optional):
                    </label>
                    <input
                      id="incident-operator-prompt"
                      type="text"
                      className="text-input"
                      placeholder="e.g. Recommend an instant WhatsApp UPI intent fallback with polite urgency..."
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Launch Action Bar */}
            <div
              style={{
                marginTop: "20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px 24px",
              }}
              id="create-incident-action-bar"
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: "14px", color: "#172a34" }}>
                  Ready to Ingest Sandbox Incident
                </div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  Generates unique ID • Bounded Agent Lifecycle • Real Supabase Grounding • Read-Only
                </div>
              </div>

              <button
                type="submit"
                className="action-button"
                id="submit-create-incident-btn"
                disabled={analyzingIncident}
                style={{ minWidth: "260px", padding: "12px 24px", fontSize: "13px" }}
              >
                {analyzingIncident ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <span className="spinner" style={{ width: "14px", height: "14px" }}></span>
                    Synthesizing with Gemini AI...
                  </span>
                ) : (
                  "✦ Create Incident & Run Autonomous Agent"
                )}
              </button>
            </div>
          </form>

          {incidentError && (
            <div className="error-banner" id="incident-creation-error">
              <strong>Notice:</strong> {incidentError}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* STATE B: LIVE INCIDENT WORKSPACE & BOUNDED AGENT EXECUTION HUB           */
        /* ========================================================================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }} id="active-incident-workspace">
          {/* Prominent Sandbox Isolation Banner */}
          <div className="sandbox-hero-banner" id="sandbox-active-banner">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                <span className="sandbox-tag-pill">{activeIncident.incident.label}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#94a3b8" }}>
                  ID: {activeIncident.incident.id}
                </span>
                <span className={`status-pill ${activeIncident.incident.severity === "CRITICAL" ? "danger" : "warning"}`}>
                  {activeIncident.incident.severity} SEVERITY
                </span>
                <span
                  className={`status-pill ${
                    activeIncident.incident.status === "ACTION_SIMULATED" || activeIncident.incident.status === "RECOVERED"
                      ? "success"
                      : "info"
                  }`}
                >
                  STATUS: {activeIncident.incident.status}
                </span>
              </div>
              <h2 style={{ fontSize: "18px", margin: "2px 0 4px", color: "#ffffff", fontWeight: 800 }}>
                {activeIncident.incident.scenarioTypeName} • {activeIncident.customer.name}
              </h2>
              <p style={{ fontSize: "12px", color: "#cbd5e1", margin: 0 }}>
                Rail: <strong style={{ color: "#ffffff" }}>{activeIncident.incident.paymentMethod}</strong> • Decline:{" "}
                <code style={{ color: "#fca5a5" }}>{activeIncident.incident.failureCode}</code> • Amount:{" "}
                <strong style={{ color: "#d6f36b" }}>₹{activeIncident.incident.amount.toLocaleString()} {activeIncident.incident.currency}</strong>
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="outline-button"
                id="reset-incident-top-btn"
                onClick={handleResetToNewIncident}
                style={{ color: "#ffffff", borderColor: "#475569", background: "rgba(255,255,255,0.06)", fontSize: "12px" }}
              >
                + New Incident
              </button>
              <button
                className="action-button"
                id="simulate-recovery-action-btn"
                onClick={() =>
                  handleExecuteAction(
                    activeIncident.analysis.recommendedAction || "SMART_RETRY",
                    activeIncident.analysis.selectedStrategy
                  )
                }
                disabled={executingAction !== null}
                style={{
                  background: simulationResult ? "#059669" : "#0284c7",
                  borderColor: simulationResult ? "#059669" : "#0284c7",
                  color: "#ffffff",
                  fontSize: "12px",
                }}
              >
                {executingAction ? (
                  <span>⚡ Dispatching Acquirer Simulation...</span>
                ) : simulationResult ? (
                  "✓ Simulation Dispatched (Re-run)"
                ) : (
                  "⚡ Run Sandbox Recovery Simulation"
                )}
              </button>
            </div>
          </div>

          {/* 6-Stage Bounded Agent Lifecycle Stepper */}
          <div className="panel" style={{ padding: "18px 20px" }} id="agent-lifecycle-stepper-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "13px", margin: 0, fontWeight: 800, color: "#1e293b" }}>
                Bounded Agent Execution Loop (6-Stage Pipeline)
              </h3>
              <span className="api-status ready">
                <i></i>
                <span>SANDBOX RUNTIME ACTIVE</span>
              </span>
            </div>

            <div className="agent-stepper" id="six-stage-stepper">
              {activeIncident.lifecycle.map((stepItem, idx) => {
                const isDone = stepItem.status === "COMPLETED";
                const isActive = stepItem.status === "ACTIVE";
                return (
                  <div
                    key={stepItem.step}
                    id={`lifecycle-step-${stepItem.step.toLowerCase()}`}
                    className={`stepper-step ${isDone ? "completed" : isActive ? "active" : "pending"}`}
                  >
                    <div className="stepper-step-header">
                      <div className="stepper-circle">
                        {isDone ? "✓" : idx + 1}
                      </div>
                      <span className="stepper-name">{stepItem.step}</span>
                    </div>
                    <div className="stepper-title">{stepItem.title}</div>
                    <div className="stepper-desc">{stepItem.detail}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Workspace Tabs Bar */}
          <div className="panel" id="incident-workspace-panel">
            <div className="demo-tabs-bar" id="workspace-tabs-bar">
              <button
                className={`demo-tab-item ${activeTab === "INTELLIGENCE" ? "active" : ""}`}
                onClick={() => setActiveTab("INTELLIGENCE")}
                id="tab-intelligence-btn"
              >
                <span>🧠</span>
                <span>AI Recovery Intelligence & Evidence</span>
              </button>

              <button
                className={`demo-tab-item ${activeTab === "MESSAGES" ? "active" : ""}`}
                onClick={() => setActiveTab("MESSAGES")}
                id="tab-messages-btn"
              >
                <span>💬</span>
                <span>Multi-Channel Communication Previews</span>
              </button>

              <button
                className={`demo-tab-item ${activeTab === "SUPABASE_CONTEXT" ? "active" : ""}`}
                onClick={() => setActiveTab("SUPABASE_CONTEXT")}
                id="tab-supabase-context-btn"
              >
                <span>🗄️</span>
                <span>Supabase Ground Truth Telemetry ({activeIncident.context.transactionsCount} Txns)</span>
              </button>

              <button
                className={`demo-tab-item ${activeTab === "AUDIT_TRAIL" ? "active" : ""}`}
                onClick={() => setActiveTab("AUDIT_TRAIL")}
                id="tab-audit-trail-btn"
              >
                <span>📜</span>
                <span>Sandbox Audit Ledger ({activeIncident.lifecycle.length} Events)</span>
              </button>
            </div>

            {/* TAB 1: AI RECOVERY INTELLIGENCE */}
            {activeTab === "INTELLIGENCE" && (
              <div style={{ padding: "20px 24px" }} id="tab-content-intelligence">
                {/* AI Unavailable State or Live Analysis Banner */}
                {(activeIncident.analysis as any).unavailable || (activeIncident.analysis as any).aiError ? (
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: "8px",
                      padding: "16px",
                      marginBottom: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                    id="ai-unavailable-alert"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#92400e", fontWeight: 700, fontSize: "13px" }}>
                      <span>⚠️</span>
                      <span>Gemini AI Engine Offline / Key Required</span>
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "#78350f" }}>
                      {(activeIncident.analysis as any).aiError ||
                        "GEMINI_API_KEY environment variable is not configured. Configure GEMINI_API_KEY in environment/settings to enable live AI reasoning."}
                    </p>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                      <input
                        type="text"
                        className="text-input"
                        placeholder="Optional: Enter custom directive and retry..."
                        value={reanalysisPrompt}
                        onChange={(e) => setReanalysisPrompt(e.target.value)}
                        style={{ maxWidth: "400px", fontSize: "12px", padding: "6px 10px" }}
                      />
                      <button
                        className="action-button"
                        onClick={handleReanalyzeWithAI}
                        disabled={reanalyzing}
                        style={{ fontSize: "12px", padding: "6px 14px" }}
                      >
                        {reanalyzing ? "Synthesizing..." : "↻ Retry AI Analysis"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Top Metrics Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "20px" }}>
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#166534", fontWeight: 700 }}>RECOVERY PROBABILITY</div>
                    <div style={{ fontSize: "24px", fontWeight: 800, color: "#15803d", margin: "4px 0 2px" }}>
                      {Math.round((activeIncident.analysis.recoveryProbability || 0.85) * 100)}%
                    </div>
                    <div style={{ fontSize: "11px", color: "#166534" }}>Confidence score via Gemini reasoning</div>
                  </div>

                  <div
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: "8px",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#1e40af", fontWeight: 700 }}>EXPECTED RECOVERABLE</div>
                    <div style={{ fontSize: "24px", fontWeight: 800, color: "#1d4ed8", margin: "4px 0 2px" }}>
                      ₹{Number(activeIncident.analysis.expectedRecoverableRevenue || 0).toLocaleString()} {activeIncident.incident.currency}
                    </div>
                    <div style={{ fontSize: "11px", color: "#1e40af" }}>
                      Out of ₹{activeIncident.incident.amount.toLocaleString()} at risk
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#faf5ff",
                      border: "1px solid #e9d5ff",
                      borderRadius: "8px",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#6b21a8", fontWeight: 700 }}>RECOMMENDED TIMING</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#7e22ce", margin: "8px 0 4px" }}>
                      {activeIncident.analysis.recommendedTiming || "Immediate T+3min"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b21a8" }}>Optimized execution window</div>
                  </div>
                </div>

                {/* Grounded Evidence Tags */}
                <div style={{ marginBottom: "18px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "8px" }}>
                    GROUNDED TELEMETRY EVIDENCE EXTRACTED BY AGENT:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} id="evidence-chips-list">
                    {(activeIncident.analysis.evidence || activeIncident.analysis.relevantEvidence || [
                      `Decline code: ${activeIncident.incident.failureCode}`,
                      `Customer: ${activeIncident.customer.name}`,
                      `Payment rail: ${activeIncident.incident.paymentMethod}`,
                    ]).map((ev: string, i: number) => (
                      <span key={i} className="evidence-tag-chip">
                        <i>✓</i>
                        <span>{ev}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Strategy Callout */}
                <div className="strategy-callout-box" id="strategy-callout-panel">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <div>
                      <span className="status-pill purple" style={{ marginBottom: "4px" }}>
                        AUTONOMOUS STRATEGY SELECTED
                      </span>
                      <h4 style={{ fontSize: "15px", margin: "4px 0", color: "#172a34", fontWeight: 800 }}>
                        {activeIncident.analysis.selectedStrategy}
                      </h4>
                    </div>
                    <span className="status-pill info">{activeIncident.analysis.recommendedTiming}</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "#334155", lineHeight: "18px", margin: "8px 0" }}>
                    <strong>Mathematical & Algorithmic Justification:</strong>{" "}
                    {activeIncident.analysis.strategyJustification}
                  </p>
                </div>

                {/* Root Cause & Risk Assessment */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
                    <h4 style={{ fontSize: "13px", margin: "0 0 8px", color: "#172a34", fontWeight: 800 }}>
                      🔍 Root-Cause Diagnosis
                    </h4>
                    <p style={{ fontSize: "12px", color: "#475569", lineHeight: "18px", margin: 0 }}>
                      {activeIncident.analysis.rootCause}
                    </p>
                  </div>

                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
                    <h4 style={{ fontSize: "13px", margin: "0 0 8px", color: "#172a34", fontWeight: 800 }}>
                      ⚠️ Key Risk Factors & Mitigation
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "#475569", lineHeight: "18px" }}>
                      {(activeIncident.analysis.keyRiskFactors || [
                        "Repeated batch debits may trigger bank anti-fraud locks",
                        "High customer LTV justifies courteous multi-channel engagement",
                      ]).map((risk: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: "4px" }}>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Alternative Strategies & Escalation */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
                    <h4 style={{ fontSize: "13px", margin: "0 0 8px", color: "#172a34", fontWeight: 800 }}>
                      ⚖️ Alternative Strategies Considered
                    </h4>
                    <p style={{ fontSize: "12px", color: "#475569", lineHeight: "18px", margin: 0 }}>
                      {activeIncident.analysis.alternativeStrategiesConsidered ||
                        "Fallback: Manual phone outreach considered but deprioritized due to high touchpoint cost and slower resolution time."}
                    </p>
                  </div>

                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
                    <h4 style={{ fontSize: "13px", margin: "0 0 8px", color: "#172a34", fontWeight: 800 }}>
                      🚨 Escalation Criteria
                    </h4>
                    <p style={{ fontSize: "12px", color: "#475569", lineHeight: "18px", margin: 0 }}>
                      {activeIncident.analysis.escalationCriteria ||
                        "Escalate to human billing team if payment fails after 2 smart retries or if customer disputes debit."}
                    </p>
                  </div>
                </div>

                {/* Action Execution Dispatcher */}
                <div
                  style={{
                    marginTop: "20px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                  id="action-dispatch-panel"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div>
                      <h4 style={{ fontSize: "13px", margin: 0, fontWeight: 800, color: "#172a34" }}>
                        Sandbox Recovery Actions Dispatch Center
                      </h4>
                      <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
                        Simulate acquirer and gateway recovery actions without modifying production databases.
                      </p>
                    </div>
                    <span className="status-pill success">100% Sandbox Safe</span>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      className="action-button"
                      onClick={() =>
                        handleExecuteAction(
                          activeIncident.analysis.recommendedAction || "SMART_RETRY",
                          activeIncident.analysis.selectedStrategy
                        )
                      }
                      disabled={executingAction !== null}
                      style={{ fontSize: "12px", padding: "8px 16px" }}
                    >
                      {executingAction ? "Dispatching..." : `⚡ Dispatch Recommended (${activeIncident.analysis.recommendedAction || "SMART_RETRY"})`}
                    </button>

                    <button
                      className="outline-button"
                      onClick={() => handleExecuteAction("WHATSAPP_FALLBACK", "1-Click WhatsApp Instant UPI Fallback")}
                      disabled={executingAction !== null}
                      style={{ fontSize: "12px", padding: "8px 16px" }}
                    >
                      💬 Dispatch WhatsApp UPI Fallback
                    </button>

                    <button
                      className="outline-button"
                      onClick={() => handleExecuteAction("TOKEN_UPDATE_REQUEST", "RBI Card Tokenization Update Request")}
                      disabled={executingAction !== null}
                      style={{ fontSize: "12px", padding: "8px 16px" }}
                    >
                      💳 Request Tokenization Update
                    </button>

                    <button
                      className="outline-button"
                      onClick={() => handleExecuteAction("LOCK_PROMISE_TO_PAY", "Lock 72h Grace Period Promise-to-Pay")}
                      disabled={executingAction !== null}
                      style={{ fontSize: "12px", padding: "8px 16px" }}
                    >
                      🤝 Lock Promise-to-Pay
                    </button>
                  </div>
                </div>

                {/* Simulation Output Box if simulated */}
                {simulationResult && (
                  <div className="sandbox-simulation-box" style={{ marginTop: "20px" }} id="simulation-output-telemetry">
                    <div className="sim-header">
                      <span style={{ color: "#4ade80", fontWeight: 800 }}>
                        ⚡ SIMULATION OUTCOME: {simulationResult.status}
                      </span>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>{simulationResult.timestamp}</span>
                    </div>
                    <div>
                      [SIMULATED-ACK] Dispatched: <strong>{simulationResult.actionName}</strong>
                    </div>
                    <div>
                      [GATEWAY-METRICS] Latency: <strong>{simulationResult.gatewayLatency}</strong> | PSP Response:{" "}
                      <code>{simulationResult.pspResponseCode}</code>
                    </div>
                    <div>
                      [PROJECTED-REVENUE] Projected Recovery:{" "}
                      <strong style={{ color: "#d6f36b" }}>₹{simulationResult.projectedRecovery.toLocaleString()}</strong>
                    </div>
                    <div style={{ color: "#94a3b8", marginTop: "6px" }}>
                      ✓ {simulationResult.telemetryNotes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: MULTI-CHANNEL PREVIEWS */}
            {activeTab === "MESSAGES" && (
              <div className="message-preview-container" id="tab-content-messages">
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "20px" }}>
                  <button
                    className={`preset-chip-btn ${messageChannel === "WHATSAPP" ? "active" : ""}`}
                    onClick={() => setMessageChannel("WHATSAPP")}
                    id="channel-whatsapp-btn"
                  >
                    💬 WhatsApp Preview
                  </button>
                  <button
                    className={`preset-chip-btn ${messageChannel === "SMS" ? "active" : ""}`}
                    onClick={() => setMessageChannel("SMS")}
                    id="channel-sms-btn"
                  >
                    📱 SMS Preview
                  </button>
                  <button
                    className={`preset-chip-btn ${messageChannel === "EMAIL" ? "active" : ""}`}
                    onClick={() => setMessageChannel("EMAIL")}
                    id="channel-email-btn"
                  >
                    ✉️ Email Draft
                  </button>
                </div>

                {messageChannel === "WHATSAPP" && (
                  <div className="whatsapp-mockup" id="whatsapp-preview-card">
                    <div
                      style={{
                        background: "#075e54",
                        color: "#ffffff",
                        padding: "10px 14px",
                        borderRadius: "8px 8px 0 0",
                        fontSize: "12px",
                        fontWeight: 700,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>Recoverly Verified Billing Bot</span>
                      <span style={{ fontSize: "10px" }}>Active Now</span>
                    </div>
                    <div className="whatsapp-bubble" style={{ marginTop: "12px" }}>
                      <div>{activeIncident.analysis.customerMessage?.whatsapp}</div>
                      <a href="#simulated" className="whatsapp-action-btn" onClick={(e) => e.preventDefault()}>
                        ⚡ Complete Payment in 1-Click
                      </a>
                      <span className="msg-time">Just now • Read</span>
                    </div>
                  </div>
                )}

                {messageChannel === "SMS" && (
                  <div className="sms-mockup" id="sms-preview-card">
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#64748b",
                        textAlign: "center",
                        marginBottom: "10px",
                        fontWeight: 600,
                      }}
                    >
                      SMS from RECOVR (Sender: VM-RCVRLY)
                    </div>
                    <div className="sms-bubble">
                      {activeIncident.analysis.customerMessage?.sms}
                    </div>
                  </div>
                )}

                {messageChannel === "EMAIL" && (
                  <div className="email-mockup" id="email-preview-card">
                    <div className="email-header-row">
                      <strong>To:</strong> {activeIncident.customer.name} &lt;{activeIncident.customer.email}&gt;
                    </div>
                    <div className="email-header-row">
                      <strong>From:</strong> Recoverly Billing Concierge &lt;billing@recoverly.test&gt;
                    </div>
                    <div className="email-subject">
                      Subject: {activeIncident.analysis.customerMessage?.email?.subject}
                    </div>
                    <div className="email-body-text">
                      {activeIncident.analysis.customerMessage?.email?.body}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SUPABASE CUSTOMER GROUND TRUTH */}
            {activeTab === "SUPABASE_CONTEXT" && (
              <div style={{ padding: "20px 24px" }} id="tab-content-supabase-context">
                <div style={{ marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 800, color: "#172a34" }}>
                    Live Supabase Telemetry Feeding Gemini Reasoning
                  </h3>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                    The AI engine ingested these specific database records to formulate its bounded strategy.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Past Invoices</span>
                    <strong style={{ display: "block", fontSize: "20px", color: "#172a34", marginTop: "2px" }}>
                      {activeIncident.context.invoicesCount}
                    </strong>
                  </div>

                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Active Subscriptions</span>
                    <strong style={{ display: "block", fontSize: "20px", color: "#172a34", marginTop: "2px" }}>
                      {activeIncident.context.subscriptionsCount}
                    </strong>
                  </div>

                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Past Transactions</span>
                    <strong style={{ display: "block", fontSize: "20px", color: "#172a34", marginTop: "2px" }}>
                      {activeIncident.context.transactionsCount}
                    </strong>
                  </div>

                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Historical Cases</span>
                    <strong style={{ display: "block", fontSize: "20px", color: "#172a34", marginTop: "2px" }}>
                      {activeIncident.context.recoveryCasesCount}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    background: "#0f172a",
                    color: "#e2e8f0",
                    borderRadius: "8px",
                    padding: "16px",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "11px",
                    lineHeight: "17px",
                    maxHeight: "280px",
                    overflowY: "auto",
                  }}
                >
                  <div style={{ color: "#38bdf8", marginBottom: "8px" }}>
                    // Supabase Grounded Customer Payload:
                  </div>
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(
                      {
                        customer: activeIncident.customer,
                        contextSummary: {
                          invoicesCount: activeIncident.context.invoicesCount,
                          subscriptionsCount: activeIncident.context.subscriptionsCount,
                          transactionsCount: activeIncident.context.transactionsCount,
                          paymentEventsCount: activeIncident.context.paymentEventsCount,
                        },
                        sampleInvoices: activeIncident.context.sampleInvoices,
                        sampleSubscriptions: activeIncident.context.sampleSubscriptions,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            )}

            {/* TAB 4: SANDBOX AUDIT TRAIL */}
            {activeTab === "AUDIT_TRAIL" && (
              <div style={{ padding: "20px 24px" }} id="tab-content-audit-trail">
                <div style={{ marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "14px", margin: 0, fontWeight: 800, color: "#172a34" }}>
                    Immutable Sandbox Audit Trail
                  </h3>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                    Chronological lifecycle events for Incident {activeIncident.incident.id}. Verified 0 mutations to production database.
                  </p>
                </div>

                <div className="activity-timeline" id="sandbox-audit-timeline">
                  {activeIncident.lifecycle.map((entry, idx) => (
                    <div key={idx} className="timeline-item" style={{ paddingBottom: "16px" }}>
                      <div className="timeline-dot" style={{ background: entry.status === "COMPLETED" ? "#22c55e" : "#0284c7" }}></div>
                      <div className="timeline-content">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 800, fontSize: "12.5px", color: "#172a34" }}>
                            [{entry.step}] {entry.title}
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10.5px", color: "#64748b" }}>
                            {entry.timestamp}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px", lineHeight: "17px" }}>
                          {entry.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
