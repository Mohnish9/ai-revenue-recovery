import React, { useState, useEffect, useRef } from "react";
import type {
  RecoveryCase,
  AICaseAnalysis,
  FullRecoveryCaseDetails,
  SandboxIncidentResponse,
  AutonomousStepResult,
  HumanEscalationDossier,
  RecoveryDossier,
  PageKey,
} from "../lib/types";
import {
  fetchRecoveryCases,
  fetchRecoveryCase,
  analyzeCaseWithAI,
  chatWithAI,
  executeCaseAction,
  fetchSandboxIncidentsApi,
  fetchSandboxIncidentApi,
  analyzeSandboxIncidentApi,
  executeAutonomousStepApi,
  runFullAutonomousLoopApi,
  escalateSandboxIncidentApi,
} from "../lib/api";

type AgentWorkflowStep = "DETECT" | "ANALYZE" | "DECIDE" | "ACT_SIMULATE" | "OBSERVE" | "AUDIT";

type AutonomyStatus =
  | "IDLE_READY"
  | "ANALYZING"
  | "RUNNING_LOOP"
  | "PAUSED"
  | "RECOVERED"
  | "ESCALATED_TO_HUMAN";

interface AIAgentPageProps {
  onNavigate?: (page: PageKey) => void;
  onSelectCustomer?: (customerId: string) => void;
}

export function AIAgentPage({ onNavigate, onSelectCustomer }: AIAgentPageProps) {
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [sandboxIncidents, setSandboxIncidents] = useState<SandboxIncidentResponse[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [caseDetails, setCaseDetails] = useState<FullRecoveryCaseDetails | null>(null);
  const [sandboxDetail, setSandboxDetail] = useState<SandboxIncidentResponse | null>(null);
  const [analysis, setAnalysis] = useState<AICaseAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingCase, setLoadingCase] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<AgentWorkflowStep>("DETECT");

  // Autonomous Bounded Engine State
  const [autonomyStatus, setAutonomyStatus] = useState<AutonomyStatus>("IDLE_READY");
  const [currentIteration, setCurrentIteration] = useState<number>(1);
  const [maxAttempts, setMaxAttempts] = useState<number>(4);
  const [executionTrace, setExecutionTrace] = useState<AutonomousStepResult[]>([]);
  const [isLoopPacing, setIsLoopPacing] = useState<boolean>(false);
  const isLoopRunningRef = useRef<boolean>(false);
  const [stepNotice, setStepNotice] = useState<string | null>(null);

  // Terminal Dossiers
  const [escalationDossier, setEscalationDossier] = useState<HumanEscalationDossier | null>(null);
  const [recoveryDossier, setRecoveryDossier] = useState<RecoveryDossier | null>(null);

  // Operator prompt guidance & policy config
  const [customInstruction, setCustomInstruction] = useState("");
  const [showPolicyConfig, setShowPolicyConfig] = useState(false);
  const [allowedChannels, setAllowedChannels] = useState<{
    whatsapp: boolean;
    sms: boolean;
    email: boolean;
    gatewayRetry: boolean;
    cardUpdate: boolean;
    mandateReauth: boolean;
    retentionOffer: boolean;
  }>({
    whatsapp: true,
    sms: true,
    email: true,
    gatewayRetry: true,
    cardUpdate: true,
    mandateReauth: true,
    retentionOffer: true,
  });

  // Protected Real Action Modal (for Supabase production cases)
  const [pendingRealAction, setPendingRealAction] = useState<string | null>(null);
  const [executingRealAction, setExecutingRealAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string; time: string }>>([
    {
      sender: "ai",
      text: "I am your Autonomous Revenue Recovery AI Agent. I evaluate real-time payment telemetry, formulate dynamic recovery cascades without static sequences, execute bounded multi-channel interventions, and automatically halt at safety boundaries or recover 100% of disrupted revenue.",
      time: "Ready",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  // Check if current target is sandbox
  const isSandboxTarget =
    selectedCaseId.startsWith("SB-") ||
    selectedCaseId.startsWith("sb_") ||
    selectedCaseId.startsWith("inc_") ||
    sandboxIncidents.some((s) => s.incident.id === selectedCaseId);

  // Load cases and sandbox queue
  const loadCasesList = async () => {
    try {
      setLoadingCases(true);
      const [resCases, resSandbox] = await Promise.all([
        fetchRecoveryCases(50).catch(() => []),
        fetchSandboxIncidentsApi().catch(() => []),
      ]);
      setCases(resCases);
      setSandboxIncidents(resSandbox);

      if (!selectedCaseId) {
        if (resSandbox.length > 0) {
          setSelectedCaseId(resSandbox[0].incident.id);
        } else if (resCases.length > 0) {
          setSelectedCaseId(resCases[0].id);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch recovery cases:", e);
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    loadCasesList();
  }, []);

  // Load context on selectedCaseId change
  useEffect(() => {
    async function loadTargetData() {
      if (!selectedCaseId) return;
      try {
        setLoadingCase(true);
        setAnalysis(null);
        setAnalysisError(null);
        setEscalationDossier(null);
        setRecoveryDossier(null);
        setExecutionTrace([]);
        setAutonomyStatus("IDLE_READY");
        isLoopRunningRef.current = false;
        setActiveWorkflowStep("DETECT");

        if (isSandboxTarget) {
          const sbItem = await fetchSandboxIncidentApi(selectedCaseId);
          setSandboxDetail(sbItem);
          setCaseDetails(null);

          // Check if incident is already terminal or has trace
          if (sbItem.incident.status === "RECOVERED") {
            setAutonomyStatus("RECOVERED");
            if ((sbItem as any).record?.recoveryDossier) {
              setRecoveryDossier((sbItem as any).record.recoveryDossier);
            }
            setActiveWorkflowStep("AUDIT");
          } else if (
            sbItem.incident.status === "ESCALATED_TO_HUMAN" ||
            sbItem.incident.status === "ESCALATED"
          ) {
            setAutonomyStatus("ESCALATED_TO_HUMAN");
            if ((sbItem as any).record?.escalationDossier) {
              setEscalationDossier((sbItem as any).record.escalationDossier);
            }
            setActiveWorkflowStep("AUDIT");
          } else if (sbItem.analysis) {
            setAnalysis({
              detectedRisk: sbItem.analysis.detectedRisk,
              summary: sbItem.analysis.detectedRisk,
              rootCauseAnalysis: sbItem.analysis.rootCause,
              recommendedAction: sbItem.analysis.recommendedAction,
              selectedStrategy: sbItem.analysis.selectedStrategy,
              strategyJustification: sbItem.analysis.aiReasoning,
              recoveryProbabilityScore: sbItem.analysis.recoveryProbability,
              expectedRecoverableRevenue:
                sbItem.analysis.expectedRecoverableRevenue ||
                sbItem.analysis.expectedRecoveryAmount,
              optimalTiming: sbItem.analysis.recommendedTiming,
              relevantEvidence:
                sbItem.analysis.evidence || sbItem.analysis.relevantEvidence || [],
              keyRiskFactors: sbItem.analysis.keyRiskFactors || [],
              tailoredMessageDraft:
                sbItem.analysis.tailoredMessageDraft ||
                sbItem.analysis.customerMessage?.whatsapp ||
                "",
            });
            setActiveWorkflowStep("DECIDE");
          }
        } else {
          setSandboxDetail(null);
          const details = await fetchRecoveryCase(selectedCaseId);
          setCaseDetails(details);
        }
      } catch (e: any) {
        console.warn("Failed to load target details:", e);
      } finally {
        setLoadingCase(false);
      }
    }
    loadTargetData();
  }, [selectedCaseId, isSandboxTarget]);

  // Initial Diagnostic Run
  const handleRunInitialDiagnosis = async () => {
    if (!selectedCaseId) return;
    try {
      setAnalyzing(true);
      setAnalysisError(null);
      setActiveWorkflowStep("ANALYZE");

      if (isSandboxTarget) {
        const res = await analyzeSandboxIncidentApi(selectedCaseId, customInstruction);
        setSandboxDetail(res);
        if (res.analysis) {
          setAnalysis({
            detectedRisk: res.analysis.detectedRisk,
            summary: res.analysis.detectedRisk,
            rootCauseAnalysis: res.analysis.rootCause,
            recommendedAction: res.analysis.recommendedAction,
            selectedStrategy: res.analysis.selectedStrategy,
            strategyJustification: res.analysis.aiReasoning,
            recoveryProbabilityScore: res.analysis.recoveryProbability,
            expectedRecoverableRevenue:
              res.analysis.expectedRecoverableRevenue || res.analysis.expectedRecoveryAmount,
            optimalTiming: res.analysis.recommendedTiming,
            relevantEvidence:
              res.analysis.evidence || res.analysis.relevantEvidence || [],
            keyRiskFactors: res.analysis.keyRiskFactors || [],
            tailoredMessageDraft:
              res.analysis.tailoredMessageDraft ||
              res.analysis.customerMessage?.whatsapp ||
              "",
          });
        }
        setActiveWorkflowStep("DECIDE");
      } else {
        const res = await analyzeCaseWithAI(selectedCaseId, customInstruction);
        setAnalysis(res);
        setActiveWorkflowStep("DECIDE");
      }
    } catch (e: any) {
      setAnalysisError(e.message || "Failed to complete AI agent analysis");
      setActiveWorkflowStep("DETECT");
    } finally {
      setAnalyzing(false);
    }
  };

  // ONE-CLICK START: Autonomous Closed Loop Execution
  const handleStartAutonomousRecovery = async () => {
    if (!selectedCaseId || !isSandboxTarget) {
      // For Supabase case, run initial diagnosis and step
      handleRunInitialDiagnosis();
      return;
    }

    try {
      setAutonomyStatus("RUNNING_LOOP");
      setIsLoopPacing(true);
      isLoopRunningRef.current = true;
      setStepNotice(null);
      setEscalationDossier(null);
      setRecoveryDossier(null);

      // Run automated paced loop
      let stepCount = 0;
      let isTerminal = false;

      while (isLoopRunningRef.current && !isTerminal && stepCount < maxAttempts) {
        stepCount++;
        setCurrentIteration(stepCount);
        setActiveWorkflowStep("ANALYZE");

        // Small delay for UI visual feedback on step transition
        await new Promise((r) => setTimeout(r, 450));
        if (!isLoopRunningRef.current) break;

        setActiveWorkflowStep("DECIDE");
        const res = await executeAutonomousStepApi(selectedCaseId, {
          policyConfig: {
            maxAttempts,
          },
          operatorInstruction: customInstruction || undefined,
        });

        setActiveWorkflowStep("ACT_SIMULATE");
        setSandboxDetail(res.incident);
        setExecutionTrace((prev) => [...prev, res.stepResult]);

        if (res.incident.analysis) {
          setAnalysis({
            detectedRisk: res.incident.analysis.detectedRisk,
            summary: res.incident.analysis.detectedRisk,
            rootCauseAnalysis: res.incident.analysis.rootCause,
            recommendedAction: res.incident.analysis.recommendedAction,
            selectedStrategy: res.incident.analysis.selectedStrategy,
            strategyJustification: res.incident.analysis.aiReasoning,
            recoveryProbabilityScore: res.incident.analysis.recoveryProbability,
            expectedRecoverableRevenue:
              res.incident.analysis.expectedRecoverableRevenue ||
              res.incident.analysis.expectedRecoveryAmount,
            optimalTiming: res.incident.analysis.recommendedTiming,
            relevantEvidence:
              res.incident.analysis.evidence ||
              res.incident.analysis.relevantEvidence ||
              [],
            keyRiskFactors: res.incident.analysis.keyRiskFactors || [],
            tailoredMessageDraft:
              res.incident.analysis.tailoredMessageDraft ||
              res.incident.analysis.customerMessage?.whatsapp ||
              "",
          });
        }

        await new Promise((r) => setTimeout(r, 600));
        setActiveWorkflowStep("OBSERVE");

        if (res.stepResult.isTerminal) {
          isTerminal = true;
          isLoopRunningRef.current = false;
          setActiveWorkflowStep("AUDIT");

          if (res.stepResult.terminalReason === "RECOVERED") {
            setAutonomyStatus("RECOVERED");
            if (res.stepResult.recoveryDossier) {
              setRecoveryDossier(res.stepResult.recoveryDossier);
            }
          } else {
            setAutonomyStatus("ESCALATED_TO_HUMAN");
            if (res.stepResult.escalationDossier) {
              setEscalationDossier(res.stepResult.escalationDossier);
            }
          }
          break;
        }

        // Pacing pause between loop iterations so operator can observe each step
        setStepNotice(`Iteration #${stepCount} executed • Observing telemetry before next cascade...`);
        await new Promise((r) => setTimeout(r, 1400));
      }
    } catch (e: any) {
      console.warn("Autonomous loop execution note:", e);
      setAutonomyStatus("PAUSED");
      setAnalysisError(e.message || "Autonomous loop encountered an error");
    } finally {
      setIsLoopPacing(false);
    }
  };

  // Instant Run Full Loop (No pacing delay)
  const handleRunFullLoopInstant = async () => {
    if (!selectedCaseId || !isSandboxTarget) return;
    try {
      setAutonomyStatus("RUNNING_LOOP");
      setIsLoopPacing(true);
      setActiveWorkflowStep("ACT_SIMULATE");

      const res = await runFullAutonomousLoopApi(selectedCaseId, {
        policyConfig: {
          maxAttempts,
        },
        operatorInstruction: customInstruction || undefined,
      });

      setSandboxDetail(res.incident);
      setExecutionTrace(res.trace);
      setActiveWorkflowStep("AUDIT");

      if (res.finalState === "RECOVERED") {
        setAutonomyStatus("RECOVERED");
        if ((res.incident as any).record?.recoveryDossier) {
          setRecoveryDossier((res.incident as any).record.recoveryDossier);
        }
      } else {
        setAutonomyStatus("ESCALATED_TO_HUMAN");
        if ((res.incident as any).record?.escalationDossier) {
          setEscalationDossier((res.incident as any).record.escalationDossier);
        }
      }
    } catch (e: any) {
      setAnalysisError(e.message || "Failed to execute loop");
      setAutonomyStatus("PAUSED");
    } finally {
      setIsLoopPacing(false);
    }
  };

  // Pause / Resume
  const handlePauseLoop = () => {
    isLoopRunningRef.current = false;
    setAutonomyStatus("PAUSED");
    setIsLoopPacing(false);
  };

  // Force Manual Human Escalation
  const handleForceHumanEscalate = async () => {
    if (!selectedCaseId || !isSandboxTarget) return;
    try {
      isLoopRunningRef.current = false;
      const res = await escalateSandboxIncidentApi(selectedCaseId, {
        reason: "Operator manually triggered human escalation handoff from AI Command Center",
        operatorName: "Revenue Operations Specialist",
      });
      setSandboxDetail(res);
      setAutonomyStatus("ESCALATED_TO_HUMAN");
      if ((res as any).record?.escalationDossier) {
        setEscalationDossier((res as any).record.escalationDossier);
      }
      setActiveWorkflowStep("AUDIT");
    } catch (e: any) {
      alert(`Escalation failed: ${e.message}`);
    }
  };

  // Supabase Case Protected Action Execution
  const handleConfirmRealAction = async () => {
    if (!selectedCaseId || !pendingRealAction) return;
    try {
      setExecutingRealAction(true);
      setActiveWorkflowStep("ACT_SIMULATE");

      await executeCaseAction(
        selectedCaseId,
        pendingRealAction,
        `AI Agent Authorized Action: ${analysis?.strategyJustification || pendingRealAction}`
      );
      setActionSuccess(
        `Successfully dispatched real action: ${pendingRealAction}. Immutable audit log written to Supabase.`
      );
      const updated = await fetchRecoveryCase(selectedCaseId);
      setCaseDetails(updated);

      setPendingRealAction(null);
      setActiveWorkflowStep("AUDIT");
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (e: any) {
      alert(`Action failed: ${e.message}`);
    } finally {
      setExecutingRealAction(false);
    }
  };

  // Contextual Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setChatMessages((prev) => [...prev, { sender: "user", text: userMsg, time: now }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await chatWithAI(userMsg, selectedCaseId || undefined);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: res.reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: `AI Agent interaction note: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Derive active context
  const selectedCase = cases.find((c) => c.id === selectedCaseId);
  const currentCase =
    isSandboxTarget && sandboxDetail
      ? {
          id: sandboxDetail.incident.id,
          amount_at_risk: sandboxDetail.incident.amount,
          currency: sandboxDetail.incident.currency || "INR",
          reason: `${sandboxDetail.incident.failureCode} — ${sandboxDetail.incident.scenarioTypeName}`,
          case_type: sandboxDetail.incident.scenarioTypeName,
          priority: sandboxDetail.incident.amount > 5000 ? "CRITICAL" : "HIGH",
          status: sandboxDetail.incident.status || "OPEN",
          customers: {
            id: sandboxDetail.customer.id,
            name: sandboxDetail.customer.name,
            email: sandboxDetail.customer.email,
            customer_type: sandboxDetail.customer.customer_type,
          },
        }
      : caseDetails?.case || selectedCase;

  const workflowSteps: Array<{
    key: AgentWorkflowStep;
    label: string;
    number: string;
    icon: string;
    desc: string;
  }> = [
    { key: "DETECT", label: "Detect", number: "01", icon: "🔍", desc: "Telemetry Anomaly" },
    { key: "ANALYZE", label: "Analyze", number: "02", icon: "🧠", desc: "Root-Cause Reason" },
    { key: "DECIDE", label: "Decide", number: "03", icon: "🎯", desc: "Dynamic Cascade" },
    { key: "ACT_SIMULATE", label: "Act / Simulate", number: "04", icon: "⚡", desc: "Multi-Rail Dispatch" },
    { key: "OBSERVE", label: "Observe", number: "05", icon: "📊", desc: "Signal Feedback" },
    { key: "AUDIT", label: "Audit", number: "06", icon: "🛡", desc: "Ledger Ledger" },
  ];

  const getStepStatus = (stepKey: AgentWorkflowStep) => {
    const order: AgentWorkflowStep[] = [
      "DETECT",
      "ANALYZE",
      "DECIDE",
      "ACT_SIMULATE",
      "OBSERVE",
      "AUDIT",
    ];
    const currentIndex = order.indexOf(activeWorkflowStep);
    const stepIndex = order.indexOf(stepKey);
    if (activeWorkflowStep === stepKey) return "active";
    if (stepIndex < currentIndex || autonomyStatus === "RECOVERED" || autonomyStatus === "ESCALATED_TO_HUMAN") {
      return "completed";
    }
    return "pending";
  };

  const suggestedQuestions = [
    "Why was this specific channel selected for the first attempt?",
    "What safety guardrails prevent infinite retries on this account?",
    "How does the AI adapt if the customer clicks but doesn't complete payment?",
    "Show root cause and customer telemetry history",
  ];

  return (
    <div className="page">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">Autonomous Revenue Intelligence</div>
          <h1>Autonomous AI Agent Command Center</h1>
          <p>
            One-time human approval launches a closed-loop recovery agent that autonomously adapts,
            dispatches, observes telemetry, and escalates at safety boundaries.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="agent-badge-pulse">
            <span className="pulse-dot"></span>
            <span>GEMINI AUTONOMOUS CORE ACTIVE</span>
          </div>
          {onNavigate && (
            <button
              className="outline-button"
              style={{ fontSize: "11px" }}
              onClick={() => onNavigate("recovery-demo")}
            >
              + Create Problem in Studio
            </button>
          )}
          <button className="outline-button" onClick={loadCasesList} disabled={loadingCases}>
            ↻ Refresh Queue
          </button>
        </div>
      </div>

      {/* Case Selector Header Bar */}
      <div className="agent-command-header">
        <div className="agent-command-title">
          <div
            style={{
              width: "38px",
              height: "38px",
              background: "#d6f36b",
              color: "#10212b",
              borderRadius: "8px",
              display: "grid",
              placeItems: "center",
              fontSize: "18px",
              fontWeight: 800,
            }}
          >
            ✦
          </div>
          <div>
            <strong style={{ fontSize: "14px", display: "block", color: "#f8fafc" }}>
              Active Autonomous Recovery Queue
            </strong>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
              Select a runtime sandbox incident or live Supabase case for autonomous recovery
            </span>
          </div>
        </div>

        <div className="agent-case-selector-bar">
          <label
            style={{
              fontSize: "11px",
              color: "#94a3b8",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Target Incident:
          </label>
          <select
            className="agent-select"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={loadingCases || (cases.length === 0 && sandboxIncidents.length === 0)}
          >
            {sandboxIncidents.length > 0 && (
              <optgroup label="── 🔒 Sandbox Revenue Incidents ──">
                {sandboxIncidents.map((sb) => (
                  <option key={sb.incident.id} value={sb.incident.id}>
                    [SANDBOX] {sb.customer.name} — {sb.incident.currency || "₹"}
                    {Number(sb.incident.amount).toLocaleString()} ({sb.incident.failureCode} /{" "}
                    {sb.incident.scenarioTypeName})
                  </option>
                ))}
              </optgroup>
            )}

            {cases.length > 0 && (
              <optgroup label="── ⚡ Supabase Production Cases ──">
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    [PROD] {c.customers?.name || "Customer"} — ₹
                    {Number(c.amount_at_risk).toLocaleString()} ({c.reason || c.case_type})
                  </option>
                ))}
              </optgroup>
            )}

            {cases.length === 0 && sandboxIncidents.length === 0 && (
              <option value="">No incidents or cases found</option>
            )}
          </select>
        </div>
      </div>

      {/* Selected Case Summary Bar */}
      {currentCase && (
        <div className="case-summary-card">
          <div className="case-summary-item">
            <label>Customer Account</label>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <strong>{currentCase.customers?.name || "Verified Customer"}</strong>
              {onSelectCustomer && currentCase.customers?.id && (
                <button
                  className="outline-button"
                  style={{ fontSize: "9.5px", padding: "2px 6px" }}
                  onClick={() => onSelectCustomer(currentCase.customers!.id)}
                >
                  360 Profile
                </button>
              )}
            </div>
            <span>{currentCase.customers?.email || "No email on record"}</span>
          </div>
          <div className="case-summary-item">
            <label>Failure Trigger</label>
            <strong>{currentCase.reason || "Payment Disruption"}</strong>
            <span>Type: {currentCase.case_type}</span>
          </div>
          <div className="case-summary-item">
            <label>Amount At Risk</label>
            <strong style={{ color: "#b91c1c" }}>
              {currentCase.currency || "₹"}{Number(currentCase.amount_at_risk || 0).toLocaleString()}
            </strong>
            <span>Bounded Limit: {maxAttempts} attempts</span>
          </div>
          <div className="case-summary-item">
            <label>Environment & Autonomy State</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
              {isSandboxTarget ? (
                <span className="status-pill warning" style={{ fontSize: "10px" }}>
                  🔒 SANDBOX
                </span>
              ) : (
                <span className="status-pill success" style={{ fontSize: "10px" }}>
                  ⚡ SUPABASE PROD
                </span>
              )}
              <span
                className={`status-pill ${
                  autonomyStatus === "RECOVERED"
                    ? "success"
                    : autonomyStatus === "ESCALATED_TO_HUMAN"
                    ? "danger"
                    : autonomyStatus === "RUNNING_LOOP"
                    ? "purple"
                    : "info"
                }`}
                style={{ fontSize: "10px" }}
              >
                {autonomyStatus === "RUNNING_LOOP"
                  ? `⚡ RUNNING (ITERATION #${currentIteration})`
                  : autonomyStatus}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6-Stage Autonomous Stepper */}
      <div className="agent-stepper">
        {workflowSteps.map((step) => {
          const status = getStepStatus(step.key);
          return (
            <div
              key={step.key}
              className={`agent-step-item ${status}`}
              onClick={() => setActiveWorkflowStep(step.key)}
            >
              <div className="agent-step-icon">{step.icon}</div>
              <div className="agent-step-text">
                <span className="agent-step-name">
                  {step.number}. {step.label}
                </span>
                <span className="agent-step-desc">{step.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ONE-TIME HUMAN APPROVAL BANNER (When ready to start) */}
      {isSandboxTarget && autonomyStatus === "IDLE_READY" && currentCase && (
        <div
          style={{
            background: "linear-gradient(135deg, #0d1e2a 0%, #152b3c 100%)",
            border: "2px solid #22c55e",
            borderRadius: "12px",
            padding: "22px 24px",
            marginBottom: "20px",
            color: "#f8fafc",
            boxShadow: "0 10px 25px -5px rgba(34, 197, 94, 0.15)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div style={{ flex: 1, minWidth: "280px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span
                  style={{
                    background: "#22c55e",
                    color: "#052e16",
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    letterSpacing: "0.5px",
                  }}
                >
                  AUTONOMOUS RECOVERY READY
                </span>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  One-time human authorization required to engage closed loop
                </span>
              </div>
              <h2 style={{ fontSize: "20px", margin: "4px 0 8px", color: "#ffffff", fontWeight: 700 }}>
                Ready to Authorize Autonomous Recovery Loop
              </h2>
              <p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: "20px", margin: "0 0 14px" }}>
                The operator gives approval <strong>only once</strong>. After launch, the AI agent
                will autonomously diagnose, select optimal channels (WhatsApp UPI, SMS link, network retry),
                observe telemetry feedback, and continue until full recovery or safe human escalation handoff.
              </p>

              {/* Scope & Bounds Checklist */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "10px",
                  background: "rgba(0,0,0,0.25)",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              >
                <div>
                  <span style={{ color: "#94a3b8", display: "block", fontSize: "10px" }}>Target Customer:</span>
                  <strong>{currentCase.customers?.name}</strong>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", display: "block", fontSize: "10px" }}>Amount At Risk:</span>
                  <strong style={{ color: "#d6f36b" }}>
                    {currentCase.currency || "₹"}{Number(currentCase.amount_at_risk).toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", display: "block", fontSize: "10px" }}>Safety Limits:</span>
                  <strong>Bounded Max {maxAttempts} Attempts</strong>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", display: "block", fontSize: "10px" }}>Multi-Channel Rails:</span>
                  <strong style={{ color: "#38bdf8" }}>WhatsApp, SMS, Gateway, Mandate</strong>
                </div>
              </div>
            </div>

            {/* Big Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "220px" }}>
              <button
                className="primary-button"
                style={{
                  background: "#22c55e",
                  color: "#052e16",
                  fontWeight: 800,
                  fontSize: "14px",
                  padding: "14px 20px",
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 14px rgba(34, 197, 94, 0.4)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
                onClick={handleStartAutonomousRecovery}
              >
                <span>🟢</span>
                <span>START AUTONOMOUS RECOVERY</span>
              </button>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className="outline-button"
                  style={{
                    flex: 1,
                    fontSize: "11px",
                    background: "transparent",
                    color: "#cbd5e1",
                    borderColor: "#334155",
                  }}
                  onClick={handleRunFullLoopInstant}
                >
                  ⚡ Fast-Run (Instant)
                </button>
                <button
                  className="outline-button"
                  style={{
                    fontSize: "11px",
                    background: "transparent",
                    color: "#cbd5e1",
                    borderColor: "#334155",
                  }}
                  onClick={() => setShowPolicyConfig(!showPolicyConfig)}
                >
                  ⚙ Limits
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RUNNING / ACTIVE LOOP BANNER */}
      {isSandboxTarget && autonomyStatus === "RUNNING_LOOP" && (
        <div
          style={{
            background: "#0c1b26",
            border: "1px solid #38bdf8",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "16px",
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
                  Autonomous Closed Loop in Progress
                </strong>
                <span className="status-pill purple" style={{ fontSize: "10px" }}>
                  Iteration #{currentIteration} of {maxAttempts}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {stepNotice || "Evaluating payment telemetry, formulating next optimal recovery intervention..."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button className="outline-button" style={{ fontSize: "11px" }} onClick={handlePauseLoop}>
              ⏸ Pause Automation
            </button>
            <button
              className="outline-button danger"
              style={{ fontSize: "11px" }}
              onClick={handleForceHumanEscalate}
            >
              🛡 Escalate to Human
            </button>
          </div>
        </div>
      )}

      {/* TERMINAL STATE 1: RECOVERY SUCCESS DOSSIER */}
      {autonomyStatus === "RECOVERED" && recoveryDossier && (
        <div
          style={{
            background: "linear-gradient(135deg, #052e16 0%, #064e3b 100%)",
            border: "2px solid #22c55e",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
            color: "#f8fafc",
            boxShadow: "0 10px 25px -5px rgba(34, 197, 94, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px" }}>
            <div>
              <span
                style={{
                  background: "#22c55e",
                  color: "#052e16",
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  letterSpacing: "0.5px",
                }}
              >
                ✅ AUTONOMOUS RECOVERY CONFIRMED
              </span>
              <h2 style={{ fontSize: "22px", margin: "6px 0 4px", color: "#ffffff", fontWeight: 700 }}>
                100% Revenue Recovered • {recoveryDossier.currency} {recoveryDossier.recoveredAmount.toLocaleString()}
              </h2>
              <p style={{ fontSize: "13px", color: "#86efac", margin: "0 0 14px" }}>
                Recovered in <strong>{recoveryDossier.attemptsCount} iteration(s)</strong> via{" "}
                <strong>{recoveryDossier.winningAction}</strong>. Payment settled and reconciled with auth code{" "}
                <code>{recoveryDossier.gatewayAuthCode}</code>.
              </p>
            </div>

            <button
              className="outline-button"
              style={{ background: "#ffffff", color: "#064e3b", fontWeight: 700, border: "none" }}
              onClick={handleStartAutonomousRecovery}
            >
              ↺ Re-run Simulation
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              background: "rgba(0,0,0,0.3)",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          >
            <div>
              <span style={{ color: "#86efac", display: "block", fontSize: "10px" }}>Winning Capability</span>
              <strong>{recoveryDossier.winningCapability}</strong>
            </div>
            <div>
              <span style={{ color: "#86efac", display: "block", fontSize: "10px" }}>Total Iterations</span>
              <strong>{recoveryDossier.attemptsCount} Attempts ({recoveryDossier.elapsedTime})</strong>
            </div>
            <div>
              <span style={{ color: "#86efac", display: "block", fontSize: "10px" }}>Initial Probability</span>
              <strong>{Math.round(recoveryDossier.initialProbability * 100)}% → 100% Settled</strong>
            </div>
            <div>
              <span style={{ color: "#86efac", display: "block", fontSize: "10px" }}>Audit Ledger Status</span>
              <strong style={{ color: "#22c55e" }}>IMMUTABLE_RECONCILED</strong>
            </div>
          </div>
        </div>
      )}

      {/* TERMINAL STATE 2: HUMAN ESCALATION DOSSIER */}
      {autonomyStatus === "ESCALATED_TO_HUMAN" && escalationDossier && (
        <div
          style={{
            background: "linear-gradient(135deg, #2a0808 0%, #3f1212 100%)",
            border: "2px solid #ef4444",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
            color: "#f8fafc",
            boxShadow: "0 10px 25px -5px rgba(239, 68, 68, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px" }}>
            <div>
              <span
                style={{
                  background: "#ef4444",
                  color: "#450a0a",
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  letterSpacing: "0.5px",
                }}
              >
                🔴 HUMAN ESCALATION HANDOFF PACKAGE
              </span>
              <h2 style={{ fontSize: "20px", margin: "6px 0 4px", color: "#ffffff", fontWeight: 700 }}>
                Bounded Safety Limit Reached • Handed Off to Operations
              </h2>
              <p style={{ fontSize: "13px", color: "#fca5a5", margin: "0 0 14px" }}>
                {escalationDossier.whyStopped}
              </p>
            </div>

            <button
              className="outline-button"
              style={{ background: "#ffffff", color: "#7f1d1d", fontWeight: 700, border: "none" }}
              onClick={handleStartAutonomousRecovery}
            >
              ↺ Reset & Re-run
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px",
              background: "rgba(0,0,0,0.3)",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "12px",
              marginBottom: "14px",
            }}
          >
            <div>
              <span style={{ color: "#fca5a5", display: "block", fontSize: "10px" }}>Recommended Operator Action</span>
              <strong style={{ color: "#ffffff", fontSize: "12.5px" }}>{escalationDossier.recommendedHumanAction}</strong>
            </div>
            <div>
              <span style={{ color: "#fca5a5", display: "block", fontSize: "10px" }}>Assigned Escalation Tier</span>
              <strong style={{ color: "#ffffff", fontSize: "12.5px" }}>{escalationDossier.assignedTier}</strong>
            </div>
          </div>

          {/* Chronological Timeline of Attempts Tried */}
          {escalationDossier.attemptsTimeline && escalationDossier.attemptsTimeline.length > 0 && (
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px 14px", borderRadius: "8px" }}>
              <span style={{ fontSize: "11px", color: "#fca5a5", fontWeight: 600, display: "block", marginBottom: "8px" }}>
                Chronological Interventions Executed Before Halt:
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {escalationDossier.attemptsTimeline.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <strong>Attempt #{item.attemptNumber}:</strong> {item.actionTitle} [{item.pspResponseCode}]
                    </span>
                    <span style={{ color: "#fca5a5", fontSize: "10px" }}>{item.observation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="agent-grid-layout">
        {/* Left Column: Autonomous Intelligence & Dynamic Execution Trace */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Operator Guidance Box */}
          <div className="panel" style={{ padding: "18px 20px" }}>
            <div className="section-heading" style={{ marginBottom: "10px" }}>
              <div>
                <h2>Operator AI Directives & Prompt Injection</h2>
                <p>Provide high-level policy instructions to guide the autonomous cascade</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                className="search-input"
                style={{ flex: 1 }}
                placeholder="E.g., Prioritize retention with dynamic 10% rescue discount on attempt 2..."
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
              />
              <button
                className="primary-button"
                onClick={handleStartAutonomousRecovery}
                disabled={isLoopPacing || analyzing}
              >
                {isLoopPacing ? "Loop Active..." : "Run Autonomous Loop"}
              </button>
            </div>
          </div>

          {/* Autonomous Intelligence Diagnosis & Decision Box */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Autonomous Decision Engine & Evidence</h2>
                <p>Telemetry-grounded reasoning, root-cause diagnosis, and dynamically selected actions</p>
              </div>
              {analysis && <span className="status-pill success">Gemini AI Grounded</span>}
            </div>

            <div style={{ padding: "20px" }}>
              {analyzing ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <strong style={{ color: "#1e293b", fontSize: "13px" }}>
                    Synthesizing Telemetry & Formulating Cascade...
                  </strong>
                  <span style={{ color: "#64748b", fontSize: "11.5px" }}>
                    Analyzing payment disruption patterns via Gemini 2.5 Pro...
                  </span>
                </div>
              ) : analysisError ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "10px",
                    padding: "16px",
                    color: "#991b1b",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "18px" }}>⚠</span>
                    <div>
                      <strong style={{ fontSize: "12.5px", display: "block" }}>AI Notice</strong>
                      <p style={{ fontSize: "11.5px", margin: "4px 0 0", color: "#b91c1c" }}>{analysisError}</p>
                    </div>
                  </div>
                  <button className="danger-button" onClick={handleRunInitialDiagnosis}>
                    ⟳ Retry Analysis
                  </button>
                </div>
              ) : !analysis ? (
                <div className="empty-state" style={{ padding: "36px 20px" }}>
                  <div className="empty-illustration">✦</div>
                  <h3>Ready for Autonomous Recovery</h3>
                  <p>
                    Click "START AUTONOMOUS RECOVERY" above to launch root-cause reasoning, evidence
                    extraction, and closed-loop execution.
                  </p>
                  <button className="primary-button" onClick={handleStartAutonomousRecovery}>
                    🟢 Start Autonomous Recovery
                  </button>
                </div>
              ) : (
                <div>
                  {/* Detected Risk */}
                  <div className="ai-section-box">
                    <div className="ai-section-title">
                      <span>1. Telemetry Anomaly & Risk</span>
                      <span className="status-pill warning">Anomaly Flagged</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#1e293b", lineHeight: "18px", margin: "4px 0 8px" }}>
                      {analysis.summary}
                    </p>
                    {analysis.keyRiskFactors && analysis.keyRiskFactors.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                        {analysis.keyRiskFactors.map((rf, i) => (
                          <span key={i} className="status-pill danger" style={{ fontSize: "9.5px" }}>
                            {rf}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Evidence Synthesis */}
                  <div className="ai-section-box">
                    <div className="ai-section-title">
                      <span>2. Synthesized Telemetry Evidence</span>
                      <span style={{ fontSize: "9.5px", color: "#64748b" }}>Ground Truth</span>
                    </div>
                    <div className="evidence-tag-list">
                      {(analysis.relevantEvidence && analysis.relevantEvidence.length > 0
                        ? analysis.relevantEvidence
                        : [
                            `Decline reason: "${currentCase?.reason}" registered at payment rail`,
                            `Amount at risk: ₹${Number(currentCase?.amount_at_risk).toLocaleString()}`,
                            `Customer category: ${currentCase?.case_type}`,
                          ]
                      ).map((ev, i) => (
                        <div key={i} className="evidence-tag-item">
                          <span className="bullet">▸</span>
                          <span>{ev}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Root-Cause Reasoning */}
                  <div className="ai-section-box">
                    <div className="ai-section-title">
                      <span>3. Root-Cause Analysis</span>
                      <span style={{ fontSize: "9.5px", color: "#64748b" }}>Gemini Core</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#334155", lineHeight: "18px", margin: "4px 0" }}>
                      {analysis.rootCauseAnalysis}
                    </p>
                  </div>

                  {/* Strategy Selection */}
                  <div className="strategy-callout">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: "10px",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        4. Autonomous Strategy Selection
                      </span>
                      <span
                        style={{
                          background: "#223746",
                          color: "#d6f36b",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "9.5px",
                          fontFamily: "'DM Mono', monospace",
                          fontWeight: 700,
                        }}
                      >
                        {analysis.optimalTiming || "Immediate"}
                      </span>
                    </div>
                    <div className="strategy-highlight">
                      <span>⚡</span>
                      <span>{analysis.selectedStrategy || analysis.recommendedAction}</span>
                    </div>
                    <p style={{ fontSize: "11.5px", color: "#cbd5e1", lineHeight: "17px", margin: "0 0 12px" }}>
                      {analysis.strategyJustification ||
                        "Strategy tailored to maximize recovery conversion while preserving customer trust."}
                    </p>

                    {/* Confidence Meter */}
                    <div className="confidence-bar-container">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          marginBottom: "4px",
                        }}
                      >
                        <span style={{ color: "#94a3b8" }}>Recovery Probability Score</span>
                        <strong style={{ color: "#34d399" }}>
                          {Math.round(analysis.recoveryProbabilityScore * 100)}%
                        </strong>
                      </div>
                      <div className="confidence-track">
                        <div
                          className="confidence-fill"
                          style={{ width: `${Math.round(analysis.recoveryProbabilityScore * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Message Draft */}
                  {analysis.tailoredMessageDraft && (
                    <div className="ai-section-box">
                      <div className="ai-section-title">
                        <span>Customer Communication Draft</span>
                        <span className="status-pill info">Multi-Rail</span>
                      </div>
                      <div
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "10px 12px",
                          fontSize: "11.5px",
                          color: "#334155",
                          lineHeight: "17px",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {analysis.tailoredMessageDraft}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Bar for Supabase Cases */}
            {!isSandboxTarget && analysis && (
              <div className="agent-action-bar">
                <button
                  className="primary-button"
                  onClick={() => setPendingRealAction(analysis.recommendedAction || "SMART_RETRY")}
                  disabled={executingRealAction}
                >
                  🔒 Authorize Real Action
                </button>
                <button
                  className="outline-button"
                  style={{ marginLeft: "auto" }}
                  onClick={handleRunInitialDiagnosis}
                  disabled={analyzing}
                >
                  ⟳ Re-analyze
                </button>
              </div>
            )}
          </div>

          {/* Autonomous Execution Trace Log */}
          {executionTrace.length > 0 && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Autonomous Closed-Loop Execution Trace ({executionTrace.length} Steps)</h2>
                  <p>Step-by-step trace of decisions, simulated executions, and observed feedback</p>
                </div>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {executionTrace.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong>
                        Iteration #{step.iteration}: {step.decidedAction?.actionTitle || "Autonomous Intervention"}
                      </strong>
                      <span
                        className={`status-pill ${
                          step.simulatedOutcome?.isSettled
                            ? "success"
                            : step.isTerminal
                            ? "danger"
                            : "purple"
                        }`}
                        style={{ fontSize: "9.5px" }}
                      >
                        {step.simulatedOutcome?.pspResponseCode || step.agentState}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 6px" }}>
                      <strong>AI Decision:</strong> {step.decidedAction?.decisionRationale}
                    </div>
                    <div
                      style={{
                        background: "#ffffff",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        border: "1px solid #e2e8f0",
                        fontSize: "10.5px",
                        color: "#334155",
                      }}
                    >
                      📊 <strong>Observed:</strong> {step.simulatedOutcome?.observation} (Latency:{" "}
                      {step.simulatedOutcome?.latency})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Timeline & Contextual AI Chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Recovery Audit & Activity Ledger */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recovery Audit & Activity Ledger</h2>
                <p>Immutable operational timeline of events and actions</p>
              </div>
            </div>

            <div className="agent-timeline" style={{ maxHeight: "300px", overflowY: "auto" }}>
              {loadingCase ? (
                <div className="loading-container" style={{ padding: "20px" }}>
                  <div className="spinner"></div>
                  <span>Loading ledger...</span>
                </div>
              ) : isSandboxTarget && sandboxDetail ? (
                <>
                  {sandboxDetail.lifecycle &&
                    sandboxDetail.lifecycle.map((lc, idx) => (
                      <div key={idx} className="timeline-entry">
                        <div
                          className={`timeline-dot ${
                            lc.status === "COMPLETED" ? "success" : "active"
                          }`}
                        >
                          {lc.step === "DETECT"
                            ? "🚨"
                            : lc.step === "ANALYZE"
                            ? "🧠"
                            : lc.step === "DECIDE"
                            ? "🎯"
                            : lc.step === "ACT_SIMULATE"
                            ? "⚡"
                            : lc.step === "OBSERVE"
                            ? "📊"
                            : "🛡"}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-header">
                            <span className="timeline-title">{lc.title}</span>
                            <span className="timeline-time">{lc.timestamp}</span>
                          </div>
                          <div className="timeline-body">{lc.detail}</div>
                          <span
                            className={`status-pill ${
                              lc.status === "COMPLETED" ? "success" : "purple"
                            }`}
                            style={{ marginTop: "4px", fontSize: "9px" }}
                          >
                            {lc.step}
                          </span>
                        </div>
                      </div>
                    ))}
                </>
              ) : !caseDetails ||
                (caseDetails.paymentEvents.length === 0 &&
                  caseDetails.actions.length === 0 &&
                  caseDetails.auditLogs.length === 0) ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontSize: "11px" }}>
                  No historical ledger events recorded yet.
                </div>
              ) : (
                <>
                  {caseDetails.actions.map((act) => (
                    <div key={act.id} className="timeline-entry">
                      <div className="timeline-dot active">⚡</div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">{act.action_type}</span>
                          <span className="timeline-time">
                            {new Date(act.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="timeline-body">{act.reason || "Action triggered"}</div>
                        <span
                          className={`status-pill ${
                            act.status === "EXECUTED" ? "success" : "warning"
                          }`}
                          style={{ marginTop: "6px" }}
                        >
                          {act.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {caseDetails.auditLogs.map((log) => (
                    <div key={log.id} className="timeline-entry">
                      <div className="timeline-dot success">🛡</div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">{log.event}</span>
                          <span className="timeline-time">
                            {new Date(log.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="timeline-body">Actor: {log.actor_type}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Contextual Case AI Chat */}
          <div className="panel agent-chat-card">
            <div className="panel-heading">
              <div>
                <h2>Contextual Incident AI Chat</h2>
                <p>Ground questions directly on active telemetry and customer context</p>
              </div>
              <span className="status-pill neutral">Active Grounding</span>
            </div>

            {/* Quick Suggestion Chips */}
            <div
              style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                padding: "10px 14px 6px",
                background: "#f8fafc",
                borderBottom: "1px solid #edf1f4",
              }}
            >
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  className="outline-button"
                  style={{ fontSize: "10px", padding: "4px 8px", whiteSpace: "nowrap" }}
                  onClick={() => setChatInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Messages Log */}
            <div className="agent-chat-messages">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.sender}`}>
                  <div style={{ whiteSpace: "pre-line" }}>{msg.text}</div>
                  <span className="chat-bubble-meta">{msg.time}</span>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-bubble ai" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }}></div>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>AI Agent is thinking...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="chat-input-bar">
              <input
                type="text"
                className="chat-input-field"
                placeholder="Ask about decline codes, customer history, or recovery logic..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button
                type="submit"
                className="primary-button"
                style={{ padding: "8px 14px" }}
                disabled={chatLoading || !chatInput.trim()}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Protected Real Supabase Action */}
      {pendingRealAction && (
        <div className="modal-backdrop" onClick={() => setPendingRealAction(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔒 Protected Operational Action</h2>
              <button className="icon-button" onClick={() => setPendingRealAction(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  background: "#fef3c7",
                  border: "1px solid #fde68a",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  color: "#92400e",
                  fontSize: "12px",
                }}
              >
                <strong>Operational Safeguard Active:</strong> You are about to authorize a real operational
                action on Supabase case {currentCase?.id}.
              </div>

              <div style={{ fontSize: "12px", color: "#334155", lineHeight: "20px" }}>
                <div>
                  <strong>Target Case:</strong> {currentCase?.id}
                </div>
                <div>
                  <strong>Customer:</strong> {currentCase?.customers?.name} ({currentCase?.customers?.email})
                </div>
                <div>
                  <strong>Action:</strong> <span className="status-pill purple">{pendingRealAction}</span>
                </div>
                <div>
                  <strong>Amount At Risk:</strong> ₹{Number(currentCase?.amount_at_risk).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="outline-button"
                onClick={() => setPendingRealAction(null)}
                disabled={executingRealAction}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={handleConfirmRealAction}
                disabled={executingRealAction}
              >
                {executingRealAction ? "Executing..." : "Confirm & Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
