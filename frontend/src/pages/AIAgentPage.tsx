import React, { useState, useEffect } from "react";
import type { RecoveryCase, AICaseAnalysis, FullRecoveryCaseDetails, SandboxIncidentResponse } from "../lib/types";
import {
  fetchRecoveryCases,
  fetchRecoveryCase,
  analyzeCaseWithAI,
  chatWithAI,
  executeCaseAction,
  fetchSandboxIncidentsApi,
  fetchSandboxIncidentApi,
  analyzeSandboxIncidentApi,
  executeSandboxIncidentActionApi,
} from "../lib/api";

type AgentWorkflowStep = "DETECT" | "ANALYZE" | "DECIDE" | "ACT_SIMULATE" | "OBSERVE" | "AUDIT";

export function AIAgentPage() {
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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<AgentWorkflowStep>("DETECT");

  // Execution modal/confirmation for Real Protected Actions
  const [pendingRealAction, setPendingRealAction] = useState<string | null>(null);
  const [executingRealAction, setExecutingRealAction] = useState(false);

  // Safe Simulation Output
  const [simulatingAction, setSimulatingAction] = useState<string | null>(null);
  const [simulatedResult, setSimulatedResult] = useState<{
    actionName: string;
    status: string;
    timestamp: string;
    telemetry: string;
    projectedOutcome: string;
  } | null>(null);

  // Operator prompt guidance
  const [customInstruction, setCustomInstruction] = useState("");

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string; time: string }>>([
    {
      sender: "ai",
      text: "I am your Autonomous Revenue Recovery AI Agent. I evaluate real-time payment telemetry, identify leakage patterns, execute bounded agentic loops (DETECT → ANALYZE → DECIDE → ACT/SIMULATE → OBSERVE → AUDIT), and orchestrate safe recovery strategies. Select any case or sandbox incident to begin inspection.",
      time: "Ready",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  // Check if current selected is a sandbox incident
  const isSandboxTarget = selectedCaseId.startsWith("sandbox_") || selectedCaseId.startsWith("sb_") || selectedCaseId.startsWith("inc_") || sandboxIncidents.some(s => s.incident.id === selectedCaseId);

  // Load recovery cases and sandbox incidents list
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

  // Load detailed case / sandbox context when selectedCaseId changes
  useEffect(() => {
    async function loadTargetData() {
      if (!selectedCaseId) return;
      try {
        setLoadingCase(true);
        setAnalysis(null);
        setAnalysisError(null);
        setSimulatedResult(null);
        setActiveWorkflowStep("DETECT");

        if (isSandboxTarget) {
          const sbItem = await fetchSandboxIncidentApi(selectedCaseId);
          setSandboxDetail(sbItem);
          setCaseDetails(null);
          if (sbItem.analysis) {
            setAnalysis({
              detectedRisk: sbItem.analysis.detectedRisk,
              summary: sbItem.analysis.detectedRisk,
              rootCauseAnalysis: sbItem.analysis.rootCause,
              recommendedAction: sbItem.analysis.recommendedAction,
              selectedStrategy: sbItem.analysis.selectedStrategy,
              strategyJustification: sbItem.analysis.aiReasoning,
              recoveryProbabilityScore: sbItem.analysis.recoveryProbability,
              expectedRecoverableRevenue: sbItem.analysis.expectedRecoverableRevenue || sbItem.analysis.expectedRecoveryAmount,
              optimalTiming: sbItem.analysis.recommendedTiming,
              relevantEvidence: sbItem.analysis.evidence || sbItem.analysis.relevantEvidence || [],
              keyRiskFactors: sbItem.analysis.keyRiskFactors || [],
              tailoredMessageDraft: sbItem.analysis.tailoredMessageDraft,
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

  const handleRunAgentWorkflow = async () => {
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
            expectedRecoverableRevenue: res.analysis.expectedRecoverableRevenue || res.analysis.expectedRecoveryAmount,
            optimalTiming: res.analysis.recommendedTiming,
            relevantEvidence: res.analysis.evidence || res.analysis.relevantEvidence || [],
            keyRiskFactors: res.analysis.keyRiskFactors || [],
            tailoredMessageDraft: res.analysis.tailoredMessageDraft,
          });
        }
        setActiveWorkflowStep("DECIDE");
      } else {
        const res = await analyzeCaseWithAI(selectedCaseId, customInstruction);
        setAnalysis(res);
        setActiveWorkflowStep("DECIDE");
      }
    } catch (e: any) {
      console.warn("AI agent analysis notice:", e?.message);
      setAnalysisError(e.message || "Failed to complete AI agent analysis");
      setActiveWorkflowStep("DETECT");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSimulateAction = (actionName: string) => {
    setSimulatingAction(actionName);
    setActiveWorkflowStep("ACT_SIMULATE");

    if (isSandboxTarget && sandboxDetail) {
      executeSandboxIncidentActionApi(sandboxDetail.incident.id, {
        actionType: actionName,
        strategyName: analysis?.selectedStrategy || "Autonomous Safe Strategy",
        reason: "Simulated execution from AI Agent Command Center",
      }).then(({ simulation, updatedIncident }) => {
        setSimulatingAction(null);
        setSandboxDetail(updatedIncident);
        setSimulatedResult({
          actionName,
          status: `${simulation.status} (Isolated Sandbox)`,
          timestamp: new Date(simulation.executedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          telemetry: `${simulation.simulatedGatewayResponse.gatewayName}: ${simulation.simulatedGatewayResponse.authCode} in ${simulation.simulatedGatewayResponse.latencyMs}ms.`,
          projectedOutcome: `Estimated recovery: ${updatedIncident.incident.currency || "₹"}${simulation.projectedRecoveredAmount.toLocaleString()} (${Math.round((analysis?.recoveryProbabilityScore || 0.8) * 100)}% confidence).`,
        });
        setActiveWorkflowStep("OBSERVE");
      }).catch(() => {
        setSimulatingAction(null);
        setActiveWorkflowStep("OBSERVE");
      });
      return;
    }

    setTimeout(() => {
      setSimulatingAction(null);
      const prob = analysis?.recoveryProbabilityScore || 0.82;
      const expectedRecovery =
        analysis?.expectedRecoverableRevenue ||
        Math.round(Number(currentCase?.amount_at_risk || 5000) * prob);
      setSimulatedResult({
        actionName,
        status: "SIMULATED_SUCCESS (Read-Only Sandbox)",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        telemetry: `Simulated via autonomous sandbox router. Acquirer ACK in 118ms. 0 database mutations applied.`,
        projectedOutcome: `Estimated recovery: ₹${expectedRecovery.toLocaleString()} (${Math.round(prob * 100)}% confidence score).`,
      });
      setActiveWorkflowStep("OBSERVE");
    }, 650);
  };

  const handleConfirmRealAction = async () => {
    if (!selectedCaseId || !pendingRealAction) return;
    try {
      setExecutingRealAction(true);
      setActiveWorkflowStep("ACT_SIMULATE");

      if (isSandboxTarget) {
        const res = await executeSandboxIncidentActionApi(selectedCaseId, {
          actionType: pendingRealAction,
          strategyName: analysis?.selectedStrategy,
          reason: `AI Agent Authorized Action: ${analysis?.strategyJustification || pendingRealAction}`,
        });
        setSandboxDetail(res.updatedIncident);
        setActionSuccess(`Successfully executed sandbox action: ${pendingRealAction}. Telemetry logged to sandbox ledger.`);
      } else {
        await executeCaseAction(
          selectedCaseId,
          pendingRealAction,
          `AI Agent Authorized Action: ${analysis?.strategyJustification || pendingRealAction}`
        );
        setActionSuccess(`Successfully dispatched real action: ${pendingRealAction}. Audit log recorded in Supabase.`);
        const updated = await fetchRecoveryCase(selectedCaseId);
        setCaseDetails(updated);
      }

      setPendingRealAction(null);
      setActiveWorkflowStep("AUDIT");
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (e: any) {
      alert(`Action failed: ${e.message}`);
    } finally {
      setExecutingRealAction(false);
    }
  };

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

  // Derive active context for display
  const selectedCase = cases.find((c) => c.id === selectedCaseId);
  const currentCase = isSandboxTarget && sandboxDetail
    ? {
        id: sandboxDetail.incident.id,
        amount_at_risk: sandboxDetail.incident.amount,
        currency: sandboxDetail.incident.currency || "INR",
        reason: `${sandboxDetail.incident.failureCode} — ${sandboxDetail.incident.description || sandboxDetail.incident.scenarioTypeName}`,
        case_type: sandboxDetail.incident.scenarioTypeName,
        priority: sandboxDetail.incident.amount > 5000 ? "CRITICAL" : "HIGH",
        status: sandboxDetail.incident.status || "OPEN",
        customers: {
          name: sandboxDetail.customer.name,
          email: sandboxDetail.customer.email,
        },
      }
    : caseDetails?.case || selectedCase;

  const workflowSteps: Array<{ key: AgentWorkflowStep; label: string; number: string; icon: string; desc: string }> = [
    { key: "DETECT", label: "Detect", number: "01", icon: "🔍", desc: "Telemetry Anomaly" },
    { key: "ANALYZE", label: "Analyze", number: "02", icon: "🧠", desc: "Root-Cause Reason" },
    { key: "DECIDE", label: "Decide", number: "03", icon: "🎯", desc: "Optimal Strategy" },
    { key: "ACT_SIMULATE", label: "Act / Simulate", number: "04", icon: "⚡", desc: "Safe Execution" },
    { key: "OBSERVE", label: "Observe", number: "05", icon: "📊", desc: "Signal Feedback" },
    { key: "AUDIT", label: "Audit", number: "06", icon: "🛡", desc: "Ledger Log" },
  ];

  const getStepStatus = (stepKey: AgentWorkflowStep) => {
    const order: AgentWorkflowStep[] = ["DETECT", "ANALYZE", "DECIDE", "ACT_SIMULATE", "OBSERVE", "AUDIT"];
    const currentIndex = order.indexOf(activeWorkflowStep);
    const stepIndex = order.indexOf(stepKey);
    if (activeWorkflowStep === stepKey) return "active";
    if (stepIndex < currentIndex || (analysis && stepIndex <= 2) || (simulatedResult && stepIndex <= 4)) return "completed";
    return "pending";
  };

  const suggestedQuestions = [
    "What is the root cause of this decline?",
    "When is the optimal time to retry this payment?",
    "Draft a high-conversion WhatsApp reminder",
    "Compare instant retry vs 48-hour dunning delay",
  ];

  return (
    <div className="page">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">Autonomous Intelligence</div>
          <h1>AI Agent Command Center</h1>
          <p>Bounded agentic loops with telemetry grounding, safety guardrails, and real-time audit ledger.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="agent-badge-pulse">
            <span className="pulse-dot"></span>
            <span>GEMINI 2.5 / 1.5 PRO ACTIVE</span>
          </div>
          <button className="outline-button" onClick={loadCasesList} disabled={loadingCases}>
            ↻ Refresh Cases
          </button>
        </div>
      </div>

      {/* Case Selector Header Bar */}
      <div className="agent-command-header">
        <div className="agent-command-title">
          <div style={{ width: "36px", height: "36px", background: "#d6f36b", color: "#10212b", borderRadius: "8px", display: "grid", placeItems: "center", fontSize: "18px", fontWeight: 800 }}>
            ✦
          </div>
          <div>
            <strong style={{ fontSize: "14px", display: "block", color: "#f8fafc" }}>Active Recovery Inspection Queue</strong>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>Select a live Supabase recovery case to run AI root-cause reasoning and bounded execution</span>
          </div>
        </div>

        <div className="agent-case-selector-bar">
          <label style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Target Incident / Case:
          </label>
          <select
            className="agent-select"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={loadingCases || (cases.length === 0 && sandboxIncidents.length === 0)}
          >
            {sandboxIncidents.length > 0 && (
              <optgroup label="── 🔒 Sandbox Incidents (Dynamic Studio) ──">
                {sandboxIncidents.map((sb) => (
                  <option key={sb.incident.id} value={sb.incident.id}>
                    [SANDBOX] {sb.customer.name} — {sb.incident.currency || "₹"}{Number(sb.incident.amount).toLocaleString()} ({sb.incident.failureCode} / {sb.incident.scenarioTypeName})
                  </option>
                ))}
              </optgroup>
            )}

            {cases.length > 0 && (
              <optgroup label="── ⚡ Live Supabase Recovery Cases ──">
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    [PROD] {c.customers?.name || "Customer"} — ₹{Number(c.amount_at_risk).toLocaleString()} ({c.reason || c.case_type})
                  </option>
                ))}
              </optgroup>
            )}

            {cases.length === 0 && sandboxIncidents.length === 0 && (
              <option value="">No cases or sandbox incidents available</option>
            )}
          </select>
        </div>
      </div>

      {/* Selected Case Summary Card */}
      {currentCase && (
        <div className="case-summary-card">
          <div className="case-summary-item">
            <label>Customer Account</label>
            <strong>{currentCase.customers?.name || "Verified Customer"}</strong>
            <span>{currentCase.customers?.email || "No email on record"}</span>
          </div>
          <div className="case-summary-item">
            <label>Failure Trigger</label>
            <strong>{currentCase.reason || "Payment Disruption"}</strong>
            <span>Type: {currentCase.case_type}</span>
          </div>
          <div className="case-summary-item">
            <label>Amount At Risk</label>
            <strong style={{ color: "#b91c1c" }}>₹{Number(currentCase.amount_at_risk || 0).toLocaleString()}</strong>
            <span>Currency: {currentCase.currency || "INR"}</span>
          </div>
          <div className="case-summary-item">
            <label>Environment & Status</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
              {isSandboxTarget ? (
                <span className="status-pill warning" style={{ fontSize: "10px" }}>
                  🔒 SANDBOX ISOLATED
                </span>
              ) : (
                <span className="status-pill success" style={{ fontSize: "10px" }}>
                  ⚡ SUPABASE PROD
                </span>
              )}
              <span className={`status-pill ${currentCase.priority === "CRITICAL" ? "danger" : currentCase.priority === "HIGH" ? "warning" : "info"}`}>
                {currentCase.priority || "MEDIUM"}
              </span>
              <span className={`status-pill ${currentCase.status === "RECOVERED" ? "success" : currentCase.status === "OPEN" ? "danger" : "neutral"}`}>
                {currentCase.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6-Stage Lifecycle Stepper */}
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
                <span className="agent-step-name">{step.number}. {step.label}</span>
                <span className="agent-step-desc">{step.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", color: "#15803d", fontSize: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px" }}>✓</span>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Command Center Two-Column Grid */}
      <div className="agent-grid-layout">
        {/* Left Column: AI Reasoning Engine & Action Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Operator Guidance Box */}
          <div className="panel" style={{ padding: "18px 20px" }}>
            <div className="section-heading" style={{ marginBottom: "10px" }}>
              <div>
                <h2>Operator AI Guidance & Prompt Context</h2>
                <p>Provide contextual directives to influence strategy generation and dunning tone</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                className="search-input"
                style={{ flex: 1 }}
                placeholder="E.g., Prioritize customer retention with a zero-friction UPI link and 5-day grace period..."
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
              />
              <button
                className="primary-button"
                onClick={handleRunAgentWorkflow}
                disabled={analyzing || !selectedCaseId}
              >
                {analyzing ? (
                  <>
                    <span className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }}></span>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>✦</span>
                    <span>Run Agent</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Intelligence Output Card */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Autonomous Intelligence Synthesis</h2>
                <p>Telemetry-grounded reasoning, evidence extraction, and probability scoring</p>
              </div>
              {analysis && (
                <span className="status-pill success">Gemini Grounded</span>
              )}
            </div>

            <div style={{ padding: "20px" }}>
              {analyzing ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <strong style={{ color: "#1e293b", fontSize: "13px" }}>Running 6-Stage Agentic Reasoning...</strong>
                  <span style={{ color: "#64748b", fontSize: "11.5px" }}>
                    Synthesizing Supabase events, evaluating decline telemetry, and selecting bounded strategy via Gemini...
                  </span>
                </div>
              ) : analysisError ? (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "16px", color: "#991b1b" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "18px" }}>⚠</span>
                    <div>
                      <strong style={{ fontSize: "12.5px", display: "block" }}>Gemini AI Analysis Notice</strong>
                      <p style={{ fontSize: "11.5px", margin: "4px 0 0", color: "#b91c1c" }}>{analysisError}</p>
                    </div>
                  </div>
                  <button
                    className="danger-button"
                    onClick={handleRunAgentWorkflow}
                    disabled={analyzing}
                  >
                    ⟳ Retry Analysis with Gemini
                  </button>
                </div>
              ) : !analysis ? (
                <div className="empty-state" style={{ padding: "36px 20px" }}>
                  <div className="empty-illustration">✦</div>
                  <h3>Ready for Agent Execution</h3>
                  <p>Click "Run Agent" above to initiate root-cause discovery, evidence synthesis, and recovery strategy generation for this case.</p>
                  <button
                    className="primary-button"
                    onClick={handleRunAgentWorkflow}
                    disabled={analyzing || !selectedCaseId}
                  >
                    ✦ Run Agent Workflow Now
                  </button>
                </div>
              ) : (
                <div>
                  {/* Executive Assessment */}
                  <div className="ai-section-box">
                    <div className="ai-section-title">
                      <span>1. Detected Risk & Assessment</span>
                      <span className="status-pill warning">{analysis.detectedRisk ? "Risk Flagged" : "Evaluated"}</span>
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
                      <span style={{ fontSize: "9.5px", color: "#64748b" }}>Supabase Logs Grounded</span>
                    </div>
                    <div className="evidence-tag-list">
                      {(analysis.relevantEvidence && analysis.relevantEvidence.length > 0
                        ? analysis.relevantEvidence
                        : [
                            `Decline reason: "${currentCase?.reason}" registered at gateway`,
                            `Historical customer volume: ₹${Number(currentCase?.amount_at_risk).toLocaleString()} at risk`,
                            `Associated trigger event: ${currentCase?.case_type}`,
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
                      <span style={{ fontSize: "9.5px", color: "#64748b" }}>Reasoning Core</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#334155", lineHeight: "18px", margin: "4px 0" }}>
                      {analysis.rootCauseAnalysis}
                    </p>
                  </div>

                  {/* Selected Strategy Callout */}
                  <div className="strategy-callout">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>
                        4. Autonomous Strategy Selection
                      </span>
                      <span style={{ background: "#223746", color: "#d6f36b", padding: "2px 8px", borderRadius: "4px", fontSize: "9.5px", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {analysis.optimalTiming || "Immediate"}
                      </span>
                    </div>
                    <div className="strategy-highlight">
                      <span>⚡</span>
                      <span>{analysis.selectedStrategy || analysis.recommendedAction}</span>
                    </div>
                    <p style={{ fontSize: "11.5px", color: "#cbd5e1", lineHeight: "17px", margin: "0 0 12px" }}>
                      {analysis.strategyJustification || "Strategy tailored to maximize recovery conversion while preserving customer trust."}
                    </p>

                    {/* Confidence Meter & Expected Recovery */}
                    <div className="confidence-bar-container">
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
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

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #223746", fontSize: "11.5px" }}>
                      <span style={{ color: "#94a3b8" }}>Expected Recoverable Revenue:</span>
                      <strong style={{ color: "#d6f36b", fontSize: "13px", fontFamily: "'DM Mono', monospace" }}>
                        ₹{(analysis.expectedRecoverableRevenue || Math.round(Number(currentCase?.amount_at_risk || 0) * analysis.recoveryProbabilityScore)).toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Tailored Communication Draft */}
                  {analysis.tailoredMessageDraft && (
                    <div className="ai-section-box">
                      <div className="ai-section-title">
                        <span>Tailored Recovery Message Draft</span>
                        <span className="status-pill info">Multi-Channel</span>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px 12px", fontSize: "11.5px", color: "#334155", lineHeight: "17px", whiteSpace: "pre-line" }}>
                        {analysis.tailoredMessageDraft}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Simulated Result Callout */}
            {simulatedResult && (
              <div style={{ padding: "0 20px 16px" }}>
                <div className="simulation-banner">
                  <span className="simulation-badge">SIMULATION FEEDBACK</span>
                  <div style={{ fontSize: "11.5px", color: "#1e3a8a", lineHeight: "17px" }}>
                    <strong>{simulatedResult.actionName}</strong> • {simulatedResult.timestamp}
                    <div style={{ marginTop: "2px", color: "#2563eb" }}>{simulatedResult.telemetry}</div>
                    <div style={{ marginTop: "2px", fontWeight: 700 }}>{simulatedResult.projectedOutcome}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Bar */}
            {analysis && (
              <div className="agent-action-bar">
                <button
                  className="outline-button"
                  onClick={() => handleSimulateAction(analysis.recommendedAction || "SMART_RETRY")}
                  disabled={!!simulatingAction || executingRealAction}
                >
                  {simulatingAction ? "Simulating Sandbox..." : "⚡ Simulate Action (Sandbox)"}
                </button>

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
                  onClick={handleRunAgentWorkflow}
                  disabled={analyzing}
                >
                  ⟳ Re-analyze
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Audit Activity Timeline & Contextual AI Chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Audit & Activity Timeline */}
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
                  <span>Loading timeline...</span>
                </div>
              ) : isSandboxTarget && sandboxDetail ? (
                <>
                  <div className="timeline-entry">
                    <div className="timeline-dot active">🚨</div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="timeline-title">SANDBOX_INCIDENT_SPAWNED</span>
                        <span className="timeline-time">
                          {new Date(sandboxDetail.incident.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="timeline-body">
                        {sandboxDetail.incident.scenarioTypeName} • Code: {sandboxDetail.incident.failureCode} • Rail: {sandboxDetail.incident.paymentMethod}
                      </div>
                      <span className="status-pill warning" style={{ marginTop: "6px" }}>
                        SANDBOX_ISOLATED
                      </span>
                    </div>
                  </div>

                  {sandboxDetail.auditLog && sandboxDetail.auditLog.map((log: any) => (
                    <div key={log.id} className="timeline-entry">
                      <div className="timeline-dot success">🛡</div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">{log.actionType || log.event || "AUDIT_LOG"}</span>
                          <span className="timeline-time">
                            {new Date(log.timestamp || log.created_at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="timeline-body">{log.details || log.reason || "Autonomous action recorded"}</div>
                        <span className="status-pill purple" style={{ marginTop: "6px" }}>
                          {log.actor || "AI_AGENT"}
                        </span>
                      </div>
                    </div>
                  ))}

                  {sandboxDetail.simulation && (
                    <div className="timeline-entry">
                      <div className="timeline-dot active">⚡</div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">SIMULATED_DISPATCH</span>
                          <span className="timeline-time">
                            {new Date(sandboxDetail.simulation.executedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="timeline-body">
                          Simulated gateway response: {sandboxDetail.simulation.simulatedGatewayResponse.authCode} ({sandboxDetail.simulation.simulatedGatewayResponse.latencyMs}ms)
                        </div>
                        <span className="status-pill success" style={{ marginTop: "6px" }}>
                          {sandboxDetail.simulation.status}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : !caseDetails || (caseDetails.paymentEvents.length === 0 && caseDetails.actions.length === 0 && caseDetails.auditLogs.length === 0) ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontSize: "11px" }}>
                  No historical ledger events for this recovery case yet.
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
                            {new Date(act.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="timeline-body">{act.reason || "Action triggered"}</div>
                        <span className={`status-pill ${act.status === "EXECUTED" ? "success" : "warning"}`} style={{ marginTop: "6px" }}>
                          {act.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {caseDetails.paymentEvents.map((ev) => (
                    <div key={ev.id} className="timeline-entry">
                      <div className="timeline-dot">💳</div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">{ev.event_type}</span>
                          <span className="timeline-time">
                            {new Date(ev.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="timeline-body">
                          Amount: ₹{Number(ev.amount).toLocaleString()}
                        </div>
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
                            {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

          {/* Contextual AI Chat Panel */}
          <div className="panel agent-chat-card">
            <div className="panel-heading">
              <div>
                <h2>Contextual Case AI Chat</h2>
                <p>Ask questions regarding case telemetry and recovery strategy</p>
              </div>
              <span className="status-pill neutral">Active Case Grounded</span>
            </div>

            {/* Quick Suggestion Chips */}
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "10px 14px 6px", background: "#f8fafc", borderBottom: "1px solid #edf1f4" }}>
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
                placeholder="Ask about decline reasons, customer risk, or dunning..."
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

      {/* Confirmation Modal for Protected Real Action */}
      {pendingRealAction && (
        <div className="modal-backdrop" onClick={() => setPendingRealAction(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔒 Protected Action Confirmation</h2>
              <button className="icon-button" onClick={() => setPendingRealAction(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", padding: "12px 14px", color: "#92400e", fontSize: "12px", marginBottom: "14px" }}>
                <strong>Operational Safeguard Active:</strong> You are about to authorize a real operational recovery action. An immutable audit record will be written to Supabase.
              </div>

              <div style={{ fontSize: "12px", color: "#334155", lineHeight: "20px" }}>
                <div><strong>Target Case:</strong> {currentCase?.id}</div>
                <div><strong>Customer:</strong> {currentCase?.customers?.name} ({currentCase?.customers?.email})</div>
                <div><strong>Action to Execute:</strong> <span className="status-pill purple">{pendingRealAction}</span></div>
                <div><strong>Amount at Stake:</strong> ₹{Number(currentCase?.amount_at_risk).toLocaleString()}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="outline-button" onClick={() => setPendingRealAction(null)} disabled={executingRealAction}>
                Cancel
              </button>
              <button className="primary-button" onClick={handleConfirmRealAction} disabled={executingRealAction}>
                {executingRealAction ? "Executing..." : "Confirm & Execute Action"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
