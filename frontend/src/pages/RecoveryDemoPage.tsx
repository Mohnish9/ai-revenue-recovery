import React, { useState, useEffect } from "react";
import type {
  ScenarioTypeConfig,
  SandboxIncidentResponse,
  SandboxSimulationResult,
  Customer,
  PageKey,
  AutonomousStepResult,
} from "../lib/types";
import {
  fetchScenarioTypesApi,
  fetchSandboxIncidentsApi,
  fetchSandboxIncidentApi,
  createSandboxIncidentApi,
  analyzeSandboxIncidentApi,
  executeSandboxIncidentActionApi,
  reassessSandboxIncidentApi,
  escalateSandboxIncidentApi,
  deleteSandboxIncidentApi,
  executeAutonomousStepApi,
  runFullAutonomousLoopApi,
  fetchCustomers,
} from "../lib/api";

type ActiveTab = "INTELLIGENCE" | "MESSAGES" | "SUPABASE_CONTEXT" | "AUDIT_TRAIL";
type MessageChannel = "WHATSAPP" | "SMS" | "EMAIL";

interface RecoveryDemoPageProps {
  onNavigate?: (page: PageKey) => void;
}

export function RecoveryDemoPage({ onNavigate }: RecoveryDemoPageProps) {
  // Navigation helper
  const navigateTo = (page: PageKey) => {
    if (onNavigate) {
      onNavigate(page);
    } else {
      window.history.pushState({}, "", `/${page}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  // Scenario types, Supabase customers, and persisted sandbox incidents
  const [scenarioTypes, setScenarioTypes] = useState<ScenarioTypeConfig[]>([]);
  const [supabaseCustomers, setSupabaseCustomers] = useState<Customer[]>([]);
  const [sandboxIncidentsList, setSandboxIncidentsList] = useState<SandboxIncidentResponse[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  // Active Incident Workspace & Inspection
  const [activeIncident, setActiveIncident] = useState<SandboxIncidentResponse | null>(null);
  const [analyzingIncident, setAnalyzingIncident] = useState<boolean>(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SandboxSimulationResult | null>(null);
  const [reanalyzing, setReanalyzing] = useState<boolean>(false);
  const [reanalysisPrompt, setReanalysisPrompt] = useState<string>("");

  // Autonomous Recovery Loop State
  const [runningAutonomousLoop, setRunningAutonomousLoop] = useState<boolean>(false);
  const [loopNotice, setLoopNotice] = useState<string | null>(null);
  const [loopTrace, setLoopTrace] = useState<AutonomousStepResult[]>([]);

  // Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
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
    "Primary card rejected with ERR_INSUFFICIENT_FUNDS during 04:00 AM automated batch billing. Customer has high historical LTV and active product engagement."
  );
  const [customInstruction, setCustomInstruction] = useState<string>("");

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

  // Open creation modal pre-configured for a specific capability lab
  const handleOpenCreateModal = (typeKey?: string) => {
    const chosenKey = typeKey || selectedTypeKey || "insufficient-funds";
    setSelectedTypeKey(chosenKey);

    const chosenType = scenarioTypes.find((t) => t.key === chosenKey);
    if (chosenType) {
      setAmount(chosenType.suggestedAmount);
      setPaymentMethod(chosenType.defaultPaymentMethod);
      setFailureCode(chosenType.defaultFailureCode);
      setSeverity(chosenType.defaultSeverity);
      setBillingContext(chosenType.sampleBillingContext);
    }
    setCustomInstruction("");
    setShowCreateModal(true);
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
              name: customName.trim() || "Sandbox Enterprise Customer",
              email: customEmail.trim() || "billing@enterprise.test",
              customer_type: customType,
            }
          : undefined,
        amount: Number(amount) || 5000,
        currency,
        paymentMethod: paymentMethod.trim() || "Standard Payment Rail",
        failureCode: failureCode.trim() || "ERR_PAYMENT_DECLINE",
        severity,
        billingContext: billingContext.trim() || "Sandbox revenue incident created by operator.",
        customInstruction: customInstruction.trim() || undefined,
      };

      const result = await createSandboxIncidentApi(input);
      setActiveIncident(result);
      setActiveTab("INTELLIGENCE");
      setShowCreateModal(false);
      await refreshIncidentsList();

      // Scroll smoothly to the workspace
      const el = document.getElementById("active-incident-workspace");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err: any) {
      console.error("Failed to create and analyze sandbox incident:", err);
      setIncidentError(err?.message || "Failed to create sandbox incident with AI analysis");
    } finally {
      setAnalyzingIncident(false);
    }
  };

  // Select an existing incident to inspect
  const handleSelectIncident = async (id: string) => {
    try {
      setAnalyzingIncident(true);
      setIncidentError(null);
      setSimulationResult(null);
      const inc = await fetchSandboxIncidentApi(id);
      setActiveIncident(inc);
      setActiveTab("INTELLIGENCE");

      const el = document.getElementById("active-incident-workspace");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err: any) {
      setIncidentError(err?.message || "Failed to load incident details");
    } finally {
      setAnalyzingIncident(false);
    }
  };

  // Re-run AI analysis on current incident
  const handleTriggerAnalysis = async () => {
    if (!activeIncident) return;
    try {
      setReanalyzing(true);
      setIncidentError(null);
      const res = await analyzeSandboxIncidentApi(activeIncident.incident.id, reanalysisPrompt.trim() || undefined);
      setActiveIncident(res);
      await refreshIncidentsList();
    } catch (err: any) {
      setIncidentError(err?.message || "AI Analysis failed");
    } finally {
      setReanalyzing(false);
    }
  };

  // ONE-CLICK START: Autonomous Closed-Loop Recovery
  const handleStartAutonomousRecovery = async () => {
    if (!activeIncident) return;
    try {
      setRunningAutonomousLoop(true);
      setIncidentError(null);
      setSimulationResult(null);
      setLoopTrace([]);

      let isTerminal = false;
      let stepCount = activeIncident.actions?.length || 0;
      const maxSteps = 3;

      while (!isTerminal && stepCount < maxSteps) {
        stepCount++;
        setLoopNotice(`Executing autonomous iteration #${stepCount} with Gemini AI reasoning...`);

        const res = await executeAutonomousStepApi(activeIncident.incident.id, {
          policyConfig: { maxAttempts: maxSteps },
        });

        setActiveIncident(res.incident);
        setLoopTrace((prev) => [...prev, res.stepResult]);

        if (res.stepResult.simulatedOutcome) {
          setSimulationResult({
            incidentId: activeIncident.incident.id,
            actionName: res.stepResult.decidedAction?.actionTitle || res.stepResult.decidedAction?.selectedCapability || "SMART_RETRY",
            status: res.stepResult.simulatedOutcome.isSettled ? "SIMULATION_SUCCESS" : "GATEWAY_DISPATCHED",
            timestamp: new Date().toISOString(),
            executedAt: new Date().toISOString(),
            pspResponseCode: res.stepResult.simulatedOutcome.pspResponseCode || "AUTH_SUCCESS_200",
            gatewayLatency: res.stepResult.simulatedOutcome.latency || "420ms",
            telemetryNotes: res.stepResult.simulatedOutcome.observation || "Observed telemetry feedback.",
            lifecycleUpdates: res.incident.lifecycle || [],
            simulatedGatewayResponse: {
              gatewayName: "Sandbox Simulated Rail (HDFC/Razorpay/UPI)",
              authCode: res.stepResult.simulatedOutcome.isSettled ? "AUTH_RECOVERED_01" : "ACK_PENDING",
              latencyMs: res.stepResult.simulatedOutcome.latency || "420ms",
            },
            projectedRecovery: activeIncident.incident.amount,
            projectedRecoveredAmount: activeIncident.incident.amount,
          });
        }

        if (res.stepResult.isTerminal) {
          isTerminal = true;
          break;
        }

        setLoopNotice(`Iteration #${stepCount} complete • Evaluating gateway telemetry before next cascade...`);
        await new Promise((r) => setTimeout(r, 1200));
      }

      await refreshIncidentsList();
    } catch (err: any) {
      console.warn("Autonomous loop execution note:", err);
      setIncidentError(err?.message || "Autonomous recovery loop failed");
    } finally {
      setRunningAutonomousLoop(false);
      setLoopNotice(null);
    }
  };

  // Instant Run Full Autonomous Loop
  const handleRunFullLoopInstant = async () => {
    if (!activeIncident) return;
    try {
      setRunningAutonomousLoop(true);
      setIncidentError(null);
      setSimulationResult(null);

      const res = await runFullAutonomousLoopApi(activeIncident.incident.id, {
        policyConfig: { maxAttempts: 3 },
      });

      setActiveIncident(res.incident);
      setLoopTrace(res.trace);
      await refreshIncidentsList();
    } catch (err: any) {
      setIncidentError(err?.message || "Failed to execute full loop");
    } finally {
      setRunningAutonomousLoop(false);
    }
  };

  // Simulate Recommended or Selected Action
  const handleSimulateAction = async (actionType?: string, strategyName?: string) => {
    if (!activeIncident) return;
    const targetAction = actionType || activeIncident.analysis?.recommendedAction || "SEND_PAYMENT_LINK";
    const targetStrategy = strategyName || activeIncident.analysis?.selectedStrategy || "Autonomous Strategy";

    try {
      setExecutingAction(targetAction);
      const res = await executeSandboxIncidentActionApi(activeIncident.incident.id, {
        actionType: targetAction,
        strategyName: targetStrategy,
        reason: `Operator dispatched ${targetAction} in sandbox execution loop.`,
        operatorInfo: { name: "Current Operator", email: "operator@recoverly.test" },
      });

      setSimulationResult(res.simulation);
      setActiveIncident(res.updatedIncident);
      await refreshIncidentsList();
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setExecutingAction(null);
    }
  };

  // Closed Loop Next Iteration: Reassess Telemetry with AI
  const handleReassessLoop = async () => {
    if (!activeIncident) return;
    try {
      setReanalyzing(true);
      setIncidentError(null);
      const res = await reassessSandboxIncidentApi(activeIncident.incident.id, {
        customInstruction: reanalysisPrompt.trim() || undefined,
      });
      setActiveIncident(res);
      await refreshIncidentsList();
    } catch (err: any) {
      setIncidentError(err?.message || "Reassessment failed");
    } finally {
      setReanalyzing(false);
    }
  };

  // Escalate incident to human operations handoff
  const handleEscalateToHuman = async () => {
    if (!activeIncident) return;
    const reason = prompt("Enter human escalation reason / directive:", "Operator requested manual VIP concierge handling");
    if (reason === null) return;

    try {
      setAnalyzingIncident(true);
      const res = await escalateSandboxIncidentApi(activeIncident.incident.id, {
        reason: reason || "Operator manual escalation",
        operatorName: "Revenue Operations Specialist",
      });
      setActiveIncident(res);
      await refreshIncidentsList();
    } catch (err: any) {
      alert(`Escalation failed: ${err.message}`);
    } finally {
      setAnalyzingIncident(false);
    }
  };

  // Delete an incident
  const handleDeleteIncident = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Delete sandbox incident ${id}?`)) return;
    try {
      await deleteSandboxIncidentApi(id);
      if (activeIncident?.incident.id === id) {
        setActiveIncident(null);
      }
      await refreshIncidentsList();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Route to the corresponding operational page
  const handleRouteToOperations = (scenarioKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (scenarioKey.includes("checkout") || scenarioKey === "checkout-abandonment") {
      navigateTo("checkout-dropoffs");
    } else if (scenarioKey.includes("subscription") || scenarioKey === "subscription-renewal-failure") {
      navigateTo("subscriptions");
    } else if (scenarioKey.includes("mandate") || scenarioKey === "upi-mandate-failure") {
      navigateTo("mandates");
    } else if (scenarioKey.includes("invoice") || scenarioKey === "overdue-invoice") {
      navigateTo("invoices");
    } else {
      navigateTo("failed-payments");
    }
  };

  // Route directly to AI Agent with incident pre-selected
  const handleRouteToAIAgent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.history.pushState({}, "", `/agent?caseId=${id}`);
    navigateTo("agent");
  };

  // Dynamic global totals
  const totalIncidentsCount = sandboxIncidentsList.length;
  const totalRevenueAtRisk = sandboxIncidentsList.reduce(
    (acc, item) => acc + Number(item.incident.amount || 0),
    0
  );
  const totalRecoveredCount = sandboxIncidentsList.filter(
    (i) => i.incident.status === "RECOVERED"
  ).length;

  return (
    <div className="page" style={{ maxWidth: "1600px", margin: "0 auto", paddingBottom: "80px" }}>
      {/* Top Banner & Quick Overview */}
      <div className="page-heading" style={{ marginBottom: "20px" }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>REVENUE RECOVERY LABS</span>
            <span className="status-pill purple" style={{ fontSize: "10px", padding: "2px 8px" }}>
              🧪 100% READ-ONLY SANDBOX • ZERO PROD IMPACT
            </span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#0f172a" }}>
            Recovery Capability Labs
          </h1>
          <p style={{ color: "#64748b", fontSize: "13.5px", marginTop: "4px", maxWidth: "880px" }}>
            Explore 9 isolated payment disruption capabilities. Create real runtime incidents, trigger autonomous Gemini AI reasoning, simulate multi-step recovery loops, and observe live telemetry with full cross-page synchronization.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => handleOpenCreateModal()}
            className="btn btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
            }}
          >
            <span style={{ fontSize: "16px" }}>⚡</span>
            <span>Create Sandbox Incident</span>
          </button>
        </div>
      </div>

      {/* Global Lab Metric Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
          marginBottom: "28px",
        }}
      >
        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "16px 20px" }}>
          <div className="stat-label" style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
            SANDBOX INCIDENTS CREATED
          </div>
          <div className="stat-value" style={{ fontSize: "26px", fontWeight: 800, color: "#1e293b", marginTop: "4px" }}>
            {totalIncidentsCount}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            Across 9 capability labs
          </div>
        </div>

        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "16px 20px" }}>
          <div className="stat-label" style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
            TOTAL REVENUE AT RISK (SANDBOX)
          </div>
          <div className="stat-value" style={{ fontSize: "26px", fontWeight: 800, color: "#0ea5e9", marginTop: "4px" }}>
            ₹{totalRevenueAtRisk.toLocaleString()}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            100% safe read-only simulation
          </div>
        </div>

        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "16px 20px" }}>
          <div className="stat-label" style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
            RECOVERED / SETTLED (SIMULATED)
          </div>
          <div className="stat-value" style={{ fontSize: "26px", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>
            {totalRecoveredCount} / {totalIncidentsCount}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            Closed-loop autonomous settlements
          </div>
        </div>

        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "16px 20px" }}>
          <div className="stat-label" style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>
            AI AGENT STATUS
          </div>
          <div className="stat-value" style={{ fontSize: "20px", fontWeight: 800, color: "#8b5cf6", marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#10b981" }}></span>
            Bounded Agentic Active
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            Max 3 Loops • Guardrail Protected
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 9 DISTINCT PROBLEM CAPABILITY LABS SECTION */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: "36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Autonomous Problem Labs
            </h2>
            <p style={{ fontSize: "12.5px", color: "#64748b", margin: "2px 0 0" }}>
              Each section represents a specialized recovery capability. Create a runtime incident to test the end-to-end autonomous flow.
            </p>
          </div>
        </div>

        {loadingInitial ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            Loading capability labs...
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
              gap: "20px",
            }}
          >
            {scenarioTypes.map((type, index) => {
              const labIncidents = sandboxIncidentsList.filter(
                (item) => item.incident.scenarioTypeKey === type.key
              );
              const labRiskSum = labIncidents.reduce(
                (sum, item) => sum + Number(item.incident.amount || 0),
                0
              );
              const hasIncidents = labIncidents.length > 0;

              return (
                <div
                  key={type.key}
                  style={{
                    background: "#ffffff",
                    border: hasIncidents ? "1.5px solid #cbd5e1" : "1px dashed #cbd5e1",
                    borderRadius: "12px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: hasIncidents ? "0 2px 8px rgba(0,0,0,0.03)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    {/* Lab Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: "#f1f5f9",
                            fontSize: "14px",
                            fontWeight: 800,
                            color: "#475569",
                          }}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                            {type.name}
                          </h3>
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            Category: <strong style={{ color: "#334155" }}>{type.category}</strong> • Default Rail: {type.defaultPaymentMethod.split(" ")[0]}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`status-pill ${
                          type.category === "CARD"
                            ? "blue"
                            : type.category === "UPI"
                            ? "purple"
                            : type.category === "INVOICE"
                            ? "amber"
                            : "info"
                        }`}
                        style={{ fontSize: "9.5px", padding: "2px 7px" }}
                      >
                        {type.tag}
                      </span>
                    </div>

                    {/* Explanation */}
                    <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.45", margin: "8px 0 14px" }}>
                      {type.description}
                    </p>

                    {/* Dynamic Lab Counters */}
                    <div
                      style={{
                        display: "flex",
                        gap: "16px",
                        padding: "8px 12px",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        marginBottom: "14px",
                        border: "1px solid #f1f5f9",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                          Incidents
                        </div>
                        <div style={{ fontSize: "13.5px", fontWeight: 800, color: hasIncidents ? "#0f172a" : "#94a3b8" }}>
                          {labIncidents.length} Active
                        </div>
                      </div>
                      <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "14px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                          Revenue at Risk
                        </div>
                        <div style={{ fontSize: "13.5px", fontWeight: 800, color: hasIncidents ? "#0284c7" : "#94a3b8" }}>
                          ₹{labRiskSum.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Incident List or Empty State */}
                    {!hasIncidents ? (
                      <div
                        style={{
                          padding: "20px 14px",
                          textAlign: "center",
                          background: "#fafafa",
                          borderRadius: "8px",
                          border: "1px dashed #e2e8f0",
                          marginBottom: "14px",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
                          No sandbox incidents created yet.
                        </div>
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                          Click below to instantiate a runtime test incident for this capability.
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px", maxHeight: "240px", overflowY: "auto" }}>
                        {labIncidents.map((sb) => {
                          const isSelected = activeIncident?.incident.id === sb.incident.id;
                          return (
                            <div
                              key={sb.incident.id}
                              onClick={() => handleSelectIncident(sb.incident.id)}
                              style={{
                                padding: "10px 12px",
                                borderRadius: "8px",
                                background: isSelected ? "#eff6ff" : "#ffffff",
                                border: isSelected ? "1.5px solid #3b82f6" : "1px solid #e2e8f0",
                                cursor: "pointer",
                                transition: "all 0.1s ease",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e293b" }}>
                                    {sb.incident.id}
                                  </span>
                                  <span
                                    className={`status-pill ${
                                      sb.incident.status === "RECOVERED"
                                        ? "success"
                                        : sb.incident.status === "ESCALATED_TO_HUMAN"
                                        ? "danger"
                                        : sb.incident.status === "ACTION_SIMULATED"
                                        ? "purple"
                                        : "info"
                                    }`}
                                    style={{ fontSize: "9px", padding: "1px 6px" }}
                                  >
                                    {sb.incident.status || "OPEN"}
                                  </span>
                                </div>
                                <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>
                                  ₹{Number(sb.incident.amount).toLocaleString()}
                                </span>
                              </div>

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                                <div style={{ fontSize: "11px", color: "#475569" }}>
                                  <strong>{sb.customer.name}</strong> ({sb.customer.email})
                                </div>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button
                                    onClick={(e) => handleRouteToAIAgent(sb.incident.id, e)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: "9.5px", padding: "2px 6px" }}
                                    title="Open in AI Agent Studio"
                                  >
                                    AI Agent ↗
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteIncident(sb.incident.id, e)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: "9.5px", padding: "2px 6px", color: "#ef4444" }}
                                    title="Delete incident"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Lab Footer Actions */}
                  <div style={{ display: "flex", gap: "8px", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                    <button
                      onClick={() => handleOpenCreateModal(type.key)}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", fontWeight: 600 }}
                    >
                      <span>+</span>
                      <span>{hasIncidents ? "Create Another Incident" : "Create Incident"}</span>
                    </button>
                    <button
                      onClick={(e) => handleRouteToOperations(type.key, e)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "11px", padding: "6px 10px" }}
                      title="Open dedicated operational queue"
                    >
                      Operations ↗
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* ACTIVE INCIDENT WORKSPACE & CLOSED-LOOP AI AGENT STUDIO */}
      {/* ------------------------------------------------------------- */}
      {activeIncident && (
        <div
          id="active-incident-workspace"
          style={{
            background: "#ffffff",
            border: "1.5px solid #cbd5e1",
            borderRadius: "14px",
            padding: "24px",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.05)",
            marginBottom: "36px",
          }}
        >
          {/* Header Banner */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "16px",
              marginBottom: "20px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                  Active Incident: {activeIncident.incident.id}
                </span>
                <span className="status-pill purple" style={{ fontSize: "10px", padding: "2px 8px" }}>
                  🧪 SANDBOX INCIDENT
                </span>
                <span
                  className={`status-pill ${
                    activeIncident.incident.status === "RECOVERED"
                      ? "success"
                      : activeIncident.incident.status === "ESCALATED_TO_HUMAN"
                      ? "danger"
                      : activeIncident.incident.status === "ACTION_SIMULATED"
                      ? "purple"
                      : "info"
                  }`}
                  style={{ fontSize: "10px", padding: "2px 8px" }}
                >
                  {activeIncident.incident.status || "OPEN"}
                </span>
              </div>

              <div style={{ fontSize: "12.5px", color: "#475569", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <strong>Capability:</strong> {activeIncident.incident.scenarioTypeName}
                </div>
                <div>
                  <strong>Customer:</strong> {activeIncident.customer.name} ({activeIncident.customer.email})
                </div>
                <div>
                  <strong>Amount at Risk:</strong> <span style={{ color: "#0284c7", fontWeight: 700 }}>₹{Number(activeIncident.incident.amount).toLocaleString()} {activeIncident.incident.currency}</span>
                </div>
                <div>
                  <strong>Disruption Code:</strong> <code>{activeIncident.incident.failureCode}</code>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={(e) => handleRouteToAIAgent(activeIncident.incident.id, e)}
                className="btn btn-secondary btn-sm"
                style={{ fontWeight: 600 }}
              >
                Inspect in AI Agent Page ↗
              </button>
              <button
                onClick={(e) => handleRouteToOperations(activeIncident.incident.scenarioTypeKey, e)}
                className="btn btn-secondary btn-sm"
                style={{ fontWeight: 600 }}
              >
                Open in Operations ↗
              </button>
            </div>
          </div>

          {/* Bounded Agentic Loop Stepper */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "16px 20px",
              marginBottom: "22px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Bounded Autonomous Agent Lifecycle (Loop Iteration: {activeIncident.actions?.length || 0} / 3)
              </div>
              <div style={{ fontSize: "11px", color: "#475569" }}>
                Safety Guardrail: <strong style={{ color: "#10b981" }}>Auto-escalates if &gt;3 attempts</strong>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "10px",
              }}
            >
              {[
                { key: "DETECT", label: "1. Detect & Anomaly", icon: "🔍" },
                { key: "ANALYZE", label: "2. Grounded Telemetry", icon: "🧠" },
                { key: "DECIDE", label: "3. Gemini Strategy", icon: "⚡" },
                { key: "ACT_SIMULATE", label: "4. Simulate Action", icon: "🚀" },
                { key: "OBSERVE", label: "5. Gateway Feedback", icon: "📡" },
                { key: "AUDIT", label: "6. Immutable Audit", icon: "🔒" },
              ].map((step) => {
                const isCompleted = activeIncident.lifecycle?.some((l) => l.step === step.key && l.status === "COMPLETED");
                const isActive = activeIncident.lifecycle?.some((l) => l.step === step.key && l.status === "ACTIVE");

                return (
                  <div
                    key={step.key}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: isCompleted ? "#f0fdf4" : isActive ? "#eff6ff" : "#ffffff",
                      border: isCompleted ? "1.5px solid #86efac" : isActive ? "1.5px solid #93c5fd" : "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: isCompleted ? "#166534" : isActive ? "#1e40af" : "#64748b" }}>
                      <span>{step.icon}</span>
                      <span>{step.label}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: isCompleted ? "#15803d" : isActive ? "#2563eb" : "#94a3b8", marginTop: "2px" }}>
                      {isCompleted ? "✓ Verified" : isActive ? "● In Progress" : "Pending"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Human Escalation Alert Panel (if escalated) */}
          {activeIncident.incident.status === "ESCALATED_TO_HUMAN" && (
            <div
              style={{
                background: "#fef2f2",
                border: "1.5px solid #f87171",
                borderRadius: "10px",
                padding: "18px 20px",
                marginBottom: "22px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span style={{ fontSize: "18px" }}>🛑</span>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#991b1b", margin: 0 }}>
                  Autonomous Agent Halted • Human Handoff Active
                </h3>
              </div>
              <p style={{ fontSize: "12.5px", color: "#7f1d1d", margin: "0 0 10px", lineHeight: "1.4" }}>
                <strong>Reason Agent Stopped:</strong> {(activeIncident as any).escalationDossier?.whyStopped || "Bounded autonomy limit reached after multiple simulated attempts."}
              </p>
              <div style={{ fontSize: "12px", color: "#991b1b", background: "#fee2e2", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px" }}>
                <strong>Recommended Human Next Steps:</strong> {(activeIncident as any).escalationDossier?.recommendedOperatorAction || "Initiate high-touch concierge phone call or apply custom payment restructuring."}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => alert("Assigned to Senior Revenue Specialist")}
                  className="btn btn-primary btn-sm"
                  style={{ background: "#dc2626", borderColor: "#dc2626" }}
                >
                  Assign to Specialist
                </button>
                <button
                  onClick={() => handleSimulateAction("RECORD_PROMISE_TO_PAY", "Lock Promise to Pay")}
                  className="btn btn-secondary btn-sm"
                >
                  Record Operator Promise-to-Pay
                </button>
              </div>
            </div>
          )}

          {/* Action Simulation Quick Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              background: "#faf5ff",
              border: "1px solid #e9d5ff",
              borderRadius: "10px",
              padding: "14px 18px",
              marginBottom: "22px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b21a8", textTransform: "uppercase" }}>
                Recommended Action: {activeIncident.analysis?.recommendedAction || "SMART_RETRY"}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#3b0764", marginTop: "2px" }}>
                {activeIncident.analysis?.selectedStrategy || "Autonomous Omnichannel Strategy"}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                disabled={runningAutonomousLoop || activeIncident.incident.status === "RECOVERED"}
                onClick={handleStartAutonomousRecovery}
                className="btn btn-primary"
                style={{
                  background: activeIncident.incident.status === "RECOVERED" ? "#15803d" : "#16a34a",
                  borderColor: activeIncident.incident.status === "RECOVERED" ? "#15803d" : "#16a34a",
                  fontWeight: 800,
                  fontSize: "13px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(22, 163, 74, 0.3)",
                }}
              >
                <span>{runningAutonomousLoop ? "⏳" : "🟢"}</span>
                <span>{runningAutonomousLoop ? "Running Autonomous Loop..." : activeIncident.incident.status === "RECOVERED" ? "✓ Recovered Successfully" : "START AUTONOMOUS RECOVERY"}</span>
              </button>

              <button
                disabled={runningAutonomousLoop || executingAction !== null}
                onClick={() => handleSimulateAction(activeIncident.analysis?.recommendedAction, activeIncident.analysis?.selectedStrategy)}
                className="btn btn-secondary"
                style={{
                  fontWeight: 600,
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🚀</span>
                <span>{executingAction ? "Simulating..." : `Simulate Step: ${activeIncident.analysis?.recommendedAction || "Action"}`}</span>
              </button>

              <button
                disabled={runningAutonomousLoop || reanalyzing}
                onClick={handleReassessLoop}
                className="btn btn-secondary"
                style={{ fontWeight: 600, fontSize: "12px" }}
                title="Evaluate gateway telemetry and formulate next cascade action"
              >
                {reanalyzing ? "Reassessing..." : "⚡ Next Loop Step"}
              </button>

              <button
                onClick={(e) => handleRouteToAIAgent(activeIncident.incident.id, e)}
                className="btn btn-secondary"
                style={{ fontWeight: 600, fontSize: "12px" }}
              >
                Inspect in AI Agent Page ↗
              </button>

              <button
                onClick={handleEscalateToHuman}
                className="btn btn-secondary"
                style={{ fontWeight: 600, fontSize: "12px", color: "#b91c1c" }}
              >
                🛑 Escalate to Human
              </button>
            </div>
          </div>

          {/* Running Autonomous Loop Status Banner */}
          {runningAutonomousLoop && (
            <div
              style={{
                background: "#0c1b26",
                border: "1.5px solid #38bdf8",
                borderRadius: "10px",
                padding: "16px 20px",
                marginBottom: "22px",
                color: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  className="spinner"
                  style={{ width: "20px", height: "20px", borderWidth: "2px", borderColor: "#38bdf8", borderTopColor: "transparent" }}
                ></div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "14px", color: "#38bdf8" }}>
                      Gemini Autonomous Recovery Loop in Progress
                    </strong>
                    <span className="status-pill purple" style={{ fontSize: "10px" }}>
                      Bounded Autonomy • Max 3 Attempts
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                    {loopNotice || "Evaluating payment telemetry, formulating next optimal recovery intervention..."}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Autonomous Execution Trace List */}
          {loopTrace.length > 0 && (
            <div
              style={{
                background: "#f8fafc",
                border: "1.5px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px 20px",
                marginBottom: "22px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>
                  Autonomous Closed-Loop Execution Trace ({loopTrace.length} Step{loopTrace.length > 1 ? "s" : ""})
                </div>
                <span className="status-pill purple" style={{ fontSize: "10px" }}>
                  Gemini 2.5 Flash Autonomous Engine
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {loopTrace.map((st, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong>
                        Step {st.iteration}: {st.decidedAction?.actionTitle || st.decidedAction?.selectedCapability || "Autonomous Action"}
                      </strong>
                      <span
                        className={`status-pill ${st.simulatedOutcome?.isSettled ? "success" : st.isTerminal ? "danger" : "purple"}`}
                        style={{ fontSize: "9.5px" }}
                      >
                        {st.simulatedOutcome?.pspResponseCode || st.agentState}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#475569", marginBottom: "4px" }}>
                      <strong>Decision:</strong> {st.decidedAction?.decisionRationale}
                    </div>
                    <div style={{ fontSize: "11px", color: "#15803d", background: "#f0fdf4", padding: "6px 8px", borderRadius: "4px" }}>
                      📊 <strong>Observed Feedback:</strong> {st.simulatedOutcome?.observation} (Latency: {st.simulatedOutcome?.latency})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Simulation Result Notification */}
          {simulationResult && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1.5px solid #86efac",
                borderRadius: "10px",
                padding: "16px 20px",
                marginBottom: "22px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>✅</span>
                  <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#166534", margin: 0 }}>
                    Sandbox Simulation Completed Successfully
                  </h4>
                </div>
                <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 700 }}>
                  Latency: {simulationResult.gatewayLatency} • Response: {simulationResult.pspResponseCode}
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "#14532d", margin: "0 0 8px" }}>
                {simulationResult.telemetryNotes}
              </p>
              <div style={{ fontSize: "11px", color: "#166534" }}>
                <strong>Simulated Gateway Ack:</strong> <code>{simulationResult.simulatedGatewayResponse.authCode}</code> | <strong>Projected Recovery:</strong> ₹{simulationResult.projectedRecovery.toLocaleString()}
              </div>
            </div>
          )}

          {/* Workspace Tabs Navigation */}
          <div className="tabs" style={{ marginBottom: "18px" }}>
            <button
              className={`tab-btn ${activeTab === "INTELLIGENCE" ? "active" : ""}`}
              onClick={() => setActiveTab("INTELLIGENCE")}
            >
              🧠 AI Intelligence & Strategy
            </button>
            <button
              className={`tab-btn ${activeTab === "MESSAGES" ? "active" : ""}`}
              onClick={() => setActiveTab("MESSAGES")}
            >
              💬 Omnichannel Messages
            </button>
            <button
              className={`tab-btn ${activeTab === "SUPABASE_CONTEXT" ? "active" : ""}`}
              onClick={() => setActiveTab("SUPABASE_CONTEXT")}
            >
              📊 Telemetry & Context
            </button>
            <button
              className={`tab-btn ${activeTab === "AUDIT_TRAIL" ? "active" : ""}`}
              onClick={() => setActiveTab("AUDIT_TRAIL")}
            >
              🔒 Sandbox Audit Ledger
            </button>
          </div>

          {/* TAB 1: INTELLIGENCE & STRATEGY */}
          {activeTab === "INTELLIGENCE" && (
            <div>
              {/* If AI Unavailable error */}
              {activeIncident.analysis?.unavailable && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1.5px solid #fcd34d",
                    borderRadius: "8px",
                    padding: "14px 18px",
                    marginBottom: "18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>
                      AI Reasoning Unavailable
                    </div>
                    <div style={{ fontSize: "12px", color: "#b45309", marginTop: "2px" }}>
                      {activeIncident.analysis.aiError || "Gemini API key is not configured in settings."}
                    </div>
                  </div>
                  <button onClick={handleTriggerAnalysis} className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }}>
                    Retry Live AI Analysis
                  </button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
                {/* Left: AI Diagnosis & Evidence */}
                <div>
                  <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "18px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                      Root Cause Diagnosis
                    </div>
                    <p style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.5", margin: 0, fontWeight: 500 }}>
                      {activeIncident.analysis?.rootCause || "Analyzing payment disruption root cause..."}
                    </p>
                  </div>

                  <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "18px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>
                      Telemetry Evidence & Customer Grounding
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "#334155", lineHeight: "1.6" }}>
                      {activeIncident.analysis?.relevantEvidence?.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      )) || <li>Ingested telemetry grounded from Supabase profile.</li>}
                    </ul>
                  </div>
                </div>

                {/* Right: Strategy & Metrics */}
                <div>
                  <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "18px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                        Selected Strategy Policy
                      </div>
                      <span className="status-pill success" style={{ fontSize: "9px" }}>
                        Score: {Math.round((activeIncident.analysis?.recoveryProbability || 0.8) * 100)}%
                      </span>
                    </div>

                    <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
                      {activeIncident.analysis?.selectedStrategy || "Autonomous Smart Recovery"}
                    </h4>
                    <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.45", margin: 0 }}>
                      {activeIncident.analysis?.strategyJustification || "Formulating optimal recovery timing and channel mix."}
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                        Expected Recovery
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#059669", marginTop: "2px" }}>
                        ₹{Number(activeIncident.analysis?.expectedRecoveryAmount || 0).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                        Recommended Timing
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginTop: "4px" }}>
                        {activeIncident.analysis?.recommendedTiming || "Immediate T+3m"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MESSAGES */}
          {activeTab === "MESSAGES" && (
            <div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button
                  onClick={() => setMessageChannel("WHATSAPP")}
                  className={`btn btn-sm ${messageChannel === "WHATSAPP" ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontWeight: 600 }}
                >
                  💬 WhatsApp (1-Click Intent)
                </button>
                <button
                  onClick={() => setMessageChannel("SMS")}
                  className={`btn btn-sm ${messageChannel === "SMS" ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontWeight: 600 }}
                >
                  📱 SMS (Shortlink)
                </button>
                <button
                  onClick={() => setMessageChannel("EMAIL")}
                  className={`btn btn-sm ${messageChannel === "EMAIL" ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontWeight: 600 }}
                >
                  ✉️ Email (Invoice Notification)
                </button>
              </div>

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
                {messageChannel === "WHATSAPP" && (
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", textTransform: "uppercase", marginBottom: "8px" }}>
                      WhatsApp Message Preview (90%+ Open Rate)
                    </div>
                    <div
                      style={{
                        background: "#dcf8c6",
                        color: "#075e54",
                        padding: "16px 20px",
                        borderRadius: "10px",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        maxWidth: "600px",
                        whiteSpace: "pre-wrap",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                      }}
                    >
                      {activeIncident.analysis?.customerMessage?.whatsapp ||
                        `Hi ${activeIncident.customer.name}, your payment of ₹${Number(activeIncident.incident.amount).toLocaleString()} for ${activeIncident.incident.scenarioTypeName} encountered a temporary issue. Tap below to complete securely in 1 click:\nhttps://pay.recoverly.test/intent/${activeIncident.incident.id}`}
                    </div>
                  </div>
                )}

                {messageChannel === "SMS" && (
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", marginBottom: "8px" }}>
                      Concise 160-Character SMS Format
                    </div>
                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        padding: "14px 18px",
                        borderRadius: "8px",
                        fontSize: "12.5px",
                        maxWidth: "480px",
                        color: "#1e293b",
                      }}
                    >
                      {activeIncident.analysis?.customerMessage?.sms ||
                        `Recoverly: Complete your ₹${Number(activeIncident.incident.amount).toLocaleString()} payment securely: https://rcvr.ly/${activeIncident.incident.id.slice(-6)}`}
                    </div>
                  </div>
                )}

                {messageChannel === "EMAIL" && (
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: "8px" }}>
                      Subject: {activeIncident.analysis?.customerMessage?.email?.subject || `Action Required: Resolving payment for ${activeIncident.incident.scenarioTypeName}`}
                    </div>
                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        padding: "20px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        color: "#1e293b",
                        lineHeight: "1.6",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {activeIncident.analysis?.customerMessage?.email?.body ||
                        `Dear ${activeIncident.customer.name},\n\nWe noticed an issue processing your scheduled payment of ₹${Number(activeIncident.incident.amount).toLocaleString()}.\n\nPlease click the button below to review and resolve:\nhttps://pay.recoverly.test/resolve/${activeIncident.incident.id}\n\nBest regards,\nRecoverly Operations`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CONTEXT */}
          {activeTab === "SUPABASE_CONTEXT" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                  Customer Profile
                </div>
                <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.6" }}>
                  <div><strong>Name:</strong> {activeIncident.customer.name}</div>
                  <div><strong>Email:</strong> {activeIncident.customer.email}</div>
                  <div><strong>Type:</strong> {activeIncident.customer.customer_type}</div>
                </div>
              </div>

              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                  Telemetry Counts
                </div>
                <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.6" }}>
                  <div><strong>Past Invoices:</strong> {activeIncident.context?.invoicesCount || 0}</div>
                  <div><strong>Past Transactions:</strong> {activeIncident.context?.transactionsCount || 0}</div>
                  <div><strong>Active Subscriptions:</strong> {activeIncident.context?.subscriptionsCount || 0}</div>
                </div>
              </div>

              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                  Disruption Details
                </div>
                <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.6" }}>
                  <div><strong>Payment Method:</strong> {activeIncident.incident.paymentMethod}</div>
                  <div><strong>Severity:</strong> {activeIncident.incident.severity}</div>
                  <div><strong>Created:</strong> {new Date(activeIncident.incident.createdAt).toLocaleTimeString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL */}
          {activeTab === "AUDIT_TRAIL" && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "12px" }}>
                Immutable Sandbox Execution Ledger
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {activeIncident.lifecycle?.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "6px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                        [{step.step}] {step.title}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "#475569", marginTop: "2px" }}>
                        {step.detail}
                      </div>
                    </div>
                    <span style={{ fontSize: "10.5px", color: "#94a3b8", fontWeight: 600 }}>
                      {step.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CREATION MODAL: CREATE RUNTIME SANDBOX INCIDENT */}
      {/* ------------------------------------------------------------- */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "28px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", borderBottom: "1px solid #edf2f7", paddingBottom: "12px" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Create Sandbox Revenue Incident
                </h3>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                  Instantiate a real runtime payment disruption incident for testing.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "14px", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIncident} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Problem Type Selector */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "6px" }}>
                  Capability Lab / Scenario Type
                </label>
                <select
                  value={selectedTypeKey}
                  onChange={(e) => {
                    const chosenKey = e.target.value;
                    setSelectedTypeKey(chosenKey);
                    const chosenType = scenarioTypes.find((t) => t.key === chosenKey);
                    if (chosenType) {
                      setAmount(chosenType.suggestedAmount);
                      setPaymentMethod(chosenType.defaultPaymentMethod);
                      setFailureCode(chosenType.defaultFailureCode);
                      setSeverity(chosenType.defaultSeverity);
                      setBillingContext(chosenType.sampleBillingContext);
                    }
                  }}
                  className="input"
                  style={{ width: "100%", fontWeight: 600 }}
                >
                  {scenarioTypes.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer Grounding */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b" }}>
                    Customer Account
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomCustomer(!isCustomCustomer)}
                    style={{ background: "none", border: "none", color: "#4f46e5", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                  >
                    {isCustomCustomer ? "← Choose Supabase Customer" : "+ Create Custom Customer Profile"}
                  </button>
                </div>

                {!isCustomCustomer ? (
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="input"
                    style={{ width: "100%" }}
                  >
                    {supabaseCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email}) • {c.customer_type}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <input
                      type="text"
                      placeholder="Customer Name (e.g. Enterprise Client)"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="input"
                    />
                    <input
                      type="email"
                      placeholder="Customer Email (e.g. billing@client.test)"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="input"
                    />
                  </div>
                )}
              </div>

              {/* Amount & Currency */}
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                    Amount at Risk
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="input"
                    style={{ width: "100%", fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="input"
                    style={{ width: "100%" }}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                    Severity
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="input"
                    style={{ width: "100%" }}
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              {/* Payment Method & Failure Code */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                    Payment Rail / Method
                  </label>
                  <input
                    type="text"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="input"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                    Disruption Code
                  </label>
                  <input
                    type="text"
                    value={failureCode}
                    onChange={(e) => setFailureCode(e.target.value)}
                    className="input"
                    style={{ width: "100%", fontFamily: "monospace" }}
                  />
                </div>
              </div>

              {/* Operational Context */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                  Operational / Billing Context
                </label>
                <textarea
                  rows={2}
                  value={billingContext}
                  onChange={(e) => setBillingContext(e.target.value)}
                  className="input"
                  style={{ width: "100%", fontSize: "12px", resize: "vertical" }}
                />
              </div>

              {/* Optional Operator Directive */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                  Optional AI Directive / Operator Guidance
                </label>
                <input
                  type="text"
                  placeholder="e.g., Prioritize WhatsApp 1-Click recovery with 5% discount incentive"
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  className="input"
                  style={{ width: "100%", fontSize: "12px" }}
                />
              </div>

              {/* Error if creation fails */}
              {incidentError && (
                <div style={{ color: "#ef4444", fontSize: "12px", background: "#fef2f2", padding: "8px 12px", borderRadius: "6px" }}>
                  {incidentError}
                </div>
              )}

              {/* Modal Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px", borderTop: "1px solid #edf2f7", paddingTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={analyzingIncident}
                  className="btn btn-primary"
                  style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span>⚡</span>
                  <span>{analyzingIncident ? "Instantiating & Running AI..." : "Create & Run AI Analysis"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
