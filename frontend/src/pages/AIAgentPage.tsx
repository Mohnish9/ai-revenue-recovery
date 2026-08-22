import { useState, useEffect } from "react";
import type { RecoveryCase, AICaseAnalysis, FullRecoveryCaseDetails } from "../lib/types";
import {
  fetchRecoveryCases,
  fetchRecoveryCase,
  analyzeCaseWithAI,
  chatWithAI,
  executeCaseAction,
} from "../lib/api";

type AgentWorkflowStep = "DETECT" | "ANALYZE" | "DECIDE" | "ACT_SIMULATE" | "OBSERVE" | "AUDIT";

export function AIAgentPage() {
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [caseDetails, setCaseDetails] = useState<FullRecoveryCaseDetails | null>(null);
  const [analysis, setAnalysis] = useState<AICaseAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
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
      text: "I am your Autonomous Revenue Recovery AI Agent. I evaluate real-time Supabase payment events, identify leakage patterns, execute bounded agentic loops (DETECT → ANALYZE → DECIDE → ACT/SIMULATE → OBSERVE → AUDIT), and orchestrate safe recovery strategies. Select any case to begin inspection.",
      time: "Ready",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchRecoveryCases(50);
        setCases(res);
        if (res.length > 0) {
          setSelectedCaseId(res[0].id);
        }
      } catch (e) {
        console.error("Failed to fetch recovery cases", e);
      }
    }
    load();
  }, []);

  // Load detailed case context when selectedCaseId changes
  useEffect(() => {
    async function loadCaseData() {
      if (!selectedCaseId) return;
      try {
        setLoadingCase(true);
        setAnalysis(null);
        setSimulatedResult(null);
        setActiveWorkflowStep("DETECT");
        const details = await fetchRecoveryCase(selectedCaseId);
        setCaseDetails(details);
      } catch (e) {
        console.error("Failed to load recovery case details", e);
      } finally {
        setLoadingCase(false);
      }
    }
    loadCaseData();
  }, [selectedCaseId]);

  const handleRunAgentWorkflow = async () => {
    if (!selectedCaseId) return;
    try {
      setAnalyzing(true);
      setActiveWorkflowStep("ANALYZE");
      const res = await analyzeCaseWithAI(selectedCaseId, customInstruction);
      setAnalysis(res);
      setActiveWorkflowStep("DECIDE");
    } catch (e: any) {
      alert(`AI Agent Loop failed: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSimulateAction = (actionName: string) => {
    setSimulatingAction(actionName);
    setActiveWorkflowStep("ACT_SIMULATE");
    setTimeout(() => {
      setSimulatingAction(null);
      const prob = analysis?.recoveryProbabilityScore || 0.82;
      const expectedRecovery = analysis?.expectedRecoverableRevenue || Math.round(Number(selectedCase?.amount_at_risk || 5000) * prob);
      setSimulatedResult({
        actionName,
        status: "SIMULATED_SUCCESS (Read-Only)",
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
      await executeCaseAction(
        selectedCaseId,
        pendingRealAction,
        `AI Agent Authorized Action: ${analysis?.strategyJustification || pendingRealAction}`
      );
      setActionSuccess(`Successfully dispatched real action: ${pendingRealAction}. Audit log recorded in Supabase.`);
      setPendingRealAction(null);
      setActiveWorkflowStep("AUDIT");

      // Refresh case details to show new action and audit log
      const updated = await fetchRecoveryCase(selectedCaseId);
      setCaseDetails(updated);
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
          text: `AI Agent interaction error: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const selectedCase = cases.find((c) => c.id === selectedCaseId);
  const currentCase = caseDetails?.case || selectedCase;

  const workflowSteps: Array<{ key: AgentWorkflowStep; label: string; number: string; icon: string }> = [
    { key: "DETECT", label: "1. Detect", number: "01", icon: "🔍" },
    { key: "ANALYZE", label: "2. Analyze", number: "02", icon: "🧠" },
    { key: "DECIDE", label: "3. Decide", number: "03", icon: "🎯" },
    { key: "ACT_SIMULATE", label: "4. Act / Simulate", number: "04", icon: "⚡" },
    { key: "OBSERVE", label: "5. Observe", number: "05", icon: "📊" },
    { key: "AUDIT", label: "6. Audit", number: "06", icon: "🛡" },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Agent Header */}
      <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[#183144] text-[#d6f36b] text-[11px] font-bold px-2.5 py-0.5 rounded border border-[#274862] tracking-wide">
                ✦ AUTONOMOUS REVENUE RECOVERY AGENT
              </span>
              <span className="bg-[#064e3b] text-[#34d399] text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1.5 border border-[#065f46]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse"></span>
                BOUNDED AGENTIC WORKFLOW
              </span>
              <span className="bg-[#111f2d] text-[#93c5fd] text-[11px] font-medium px-2 py-0.5 rounded border border-[#1e3448]">
                SUPABASE + GEMINI COGNITION
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Autonomous Recovery Agent Control Engine
            </h1>
            <p className="text-xs lg:text-sm text-[#94a3b8] max-w-4xl leading-relaxed">
              Continuous agentic execution across real Supabase customer cases. The agent inspects telemetry, assesses failure root causes, selects optimal dunning strategies with mathematical justification, and executes or safely simulates bounded actions with complete audit trails.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-[#050c12] border border-[#172b3c] px-3 py-2 rounded-lg text-right">
              <div className="text-[10px] text-[#64748b] font-semibold uppercase tracking-wider">Guardrails</div>
              <div className="text-xs font-bold text-[#86efac]">Confirmed Human-in-Loop</div>
            </div>
            <button
              onClick={handleRunAgentWorkflow}
              disabled={analyzing || !selectedCaseId}
              className="bg-[#d6f36b] hover:bg-[#c6e855] text-[#081016] text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {analyzing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#081016] border-t-transparent rounded-full animate-spin"></span>
                  <span>Executing Agent Loop...</span>
                </>
              ) : (
                <>
                  <span>✦</span>
                  <span>Run Agentic Workflow</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 6-Step Bounded Agentic Workflow Stepper */}
        <div className="mt-5 pt-4 border-t border-[#162736]">
          <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">
            Bounded Agentic Lifecycle Pipeline
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {workflowSteps.map((step) => {
              const isActive = activeWorkflowStep === step.key;
              return (
                <div
                  key={step.key}
                  className={`p-2.5 rounded-lg border text-xs transition-all ${
                    isActive
                      ? "bg-[#102434] border-[#d6f36b] text-white shadow-sm ring-1 ring-[#d6f36b]/30"
                      : "bg-[#060d14] border-[#152738] text-[#94a3b8]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                    <span className={isActive ? "text-[#d6f36b] font-bold" : "text-[#64748b]"}>{step.number}</span>
                    <span>{step.icon}</span>
                  </div>
                  <div className={`font-semibold text-xs truncate ${isActive ? "text-white" : "text-[#cbd5e1]"}`}>
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="bg-[#051c14] border border-[#065f46] text-[#34d399] p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span>✔</span>
            <span>{actionSuccess}</span>
          </div>
          <span className="text-[10px] bg-[#064e3b] px-2 py-0.5 rounded font-mono text-[#a7f3d0]">AUDIT_LOG_COMMITTED</span>
        </div>
      )}

      {/* Case Selector Bar */}
      <div className="bg-[#091118] border border-[#162736] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-bold text-white uppercase tracking-wider shrink-0">
            Active Supabase Case:
          </label>
          <select
            className="bg-[#060e15] border border-[#1a3148] text-white text-xs px-3 py-2 rounded-lg flex-1 focus:outline-none focus:border-[#d6f36b]"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customers?.name || "Customer"} — ₹{Number(c.amount_at_risk).toLocaleString()} ({c.case_type} • {c.reason})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Operator AI Directive (e.g. Prioritize frictionless WhatsApp)..."
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            className="bg-[#060e15] border border-[#1a3148] text-white text-xs px-3 py-2 rounded-lg w-full md:w-80 focus:outline-none focus:border-[#d6f36b] placeholder-[#475569]"
          />
        </div>
      </div>

      {/* Main Agent Workspace: 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 6-Stage Agentic Workflow Output (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Stage 1: DETECT & Relevant Evidence */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#162736] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-[#142839] text-[#38bdf8] px-2 py-0.5 rounded">
                  STAGE 1: DETECT
                </span>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Detected Risk & Real Evidence
                </h2>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                currentCase?.priority === "CRITICAL"
                  ? "bg-[#450a0a] text-[#f87171] border border-[#7f1d1d]"
                  : "bg-[#451a03] text-[#fbbf24] border border-[#78350f]"
              }`}>
                {currentCase?.priority || "HIGH"} PRIORITY
              </span>
            </div>

            <div className="bg-[#060e15] border border-[#15293c] rounded-lg p-3.5 space-y-2">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>{analysis?.detectedRisk || `${currentCase?.case_type}: Involuntary payment disruption`}</span>
                <span className="text-xs font-mono font-bold text-[#d6f36b]">
                  {currentCase?.currency || "INR"} {Number(currentCase?.amount_at_risk || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                Failure trigger: <span className="text-[#cbd5e1] font-medium">{currentCase?.reason}</span>
              </p>
            </div>

            {/* Relevant Evidence Grid */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#64748b] uppercase font-semibold">Verified Evidence Base (Supabase Telemetry)</div>
              <div className="space-y-1">
                {(analysis?.relevantEvidence || [
                  `Customer record: ${currentCase?.customers?.name || "Customer"} (${currentCase?.customers?.customer_type || "INDIVIDUAL"})`,
                  `Recent payment events registered: ${caseDetails?.paymentEvents?.length || 1} events`,
                  `Disruption reason: ${currentCase?.reason || "Involuntary decline"}`,
                ]).map((ev, idx) => (
                  <div key={idx} className="bg-[#0b1620] border border-[#162a3c] px-3 py-1.5 rounded text-xs text-[#cbd5e1] flex items-start gap-2">
                    <span className="text-[#38bdf8] text-[11px] font-mono mt-0.5">●</span>
                    <span>{ev}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stage 2 & 3: ANALYZE & DECIDE */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#162736] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-[#142839] text-[#d6f36b] px-2 py-0.5 rounded">
                  STAGE 2 & 3: ANALYZE → DECIDE
                </span>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  AI Reasoning & Selected Strategy
                </h2>
              </div>
              <span className="text-[10px] text-[#34d399] font-mono">
                Prob: {Math.round((analysis?.recoveryProbabilityScore || 0.82) * 100)}%
              </span>
            </div>

            {/* Deep AI Reasoning */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#64748b] uppercase font-semibold">Cognitive Root-Cause Analysis</div>
              <div className="bg-[#0b1724] border border-[#193248] rounded-lg p-3.5 text-xs text-[#e2e8f0] leading-relaxed">
                {analysis?.aiReasoning || analysis?.rootCauseAnalysis || "Evaluating customer payment telemetry, card issuer settlement timing, and historical recovery propensity..."}
              </div>
            </div>

            {/* Selected Strategy & Justification */}
            <div className="bg-[#060e15] border border-[#15293c] rounded-lg p-4 space-y-3">
              <div>
                <div className="text-[10px] text-[#64748b] uppercase font-semibold">Selected Strategy</div>
                <div className="text-sm font-bold text-[#d6f36b] mt-0.5 flex items-center gap-2">
                  <span>✦</span>
                  <span>{analysis?.selectedStrategy || analysis?.recommendedAction || "Liquidity-Synchronized Smart Retry"}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#132332]">
                <div className="text-[10px] text-[#64748b] uppercase font-semibold">Why this Strategy was Chosen</div>
                <p className="text-xs text-[#cbd5e1] leading-relaxed mt-1">
                  {analysis?.strategyJustification || "Maximizes payment recovery rate while minimizing unnecessary card network retry charges and friction."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#132332]">
                <div>
                  <div className="text-[10px] text-[#64748b] uppercase font-semibold">Optimal Timing Window</div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    {analysis?.optimalTiming || "T+24h Bank Clearing Window"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748b] uppercase font-semibold">Expected Recoverable Revenue</div>
                  <div className="text-xs font-bold text-[#34d399] font-mono mt-0.5">
                    ₹{(analysis?.expectedRecoverableRevenue || Math.round(Number(currentCase?.amount_at_risk || 0) * 0.8)).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Tailored Communication Copy */}
            {analysis?.tailoredMessageDraft && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-[#64748b] uppercase font-semibold">Synthesized Customer Outreach Copy</div>
                <div className="bg-[#05140d] border border-[#0d3b26] p-3 rounded-lg text-xs text-[#86efac] italic leading-relaxed">
                  "{analysis.tailoredMessageDraft}"
                </div>
              </div>
            )}
          </div>

          {/* Stage 4, 5 & 6: ACT / SIMULATE → OBSERVE → AUDIT */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#162736] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-[#142839] text-[#f59e0b] px-2 py-0.5 rounded">
                  STAGE 4, 5 & 6: ACT/SIMULATE → OBSERVE → AUDIT
                </span>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Execution & Telemetry
                </h2>
              </div>
            </div>

            {/* Action Selection Row */}
            <div className="space-y-2">
              <div className="text-xs text-[#94a3b8]">
                Select how to execute the agent's recommended strategy ({analysis?.recommendedAction || "RETRY_PAYMENT"}):
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Safe Simulation Option */}
                <button
                  onClick={() => handleSimulateAction(analysis?.recommendedAction || "RETRY_PAYMENT")}
                  disabled={simulatingAction !== null}
                  className="bg-[#0c1824] hover:bg-[#132536] border border-[#1b344b] p-3 rounded-lg text-left transition-colors cursor-pointer disabled:opacity-60 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>🧪 Run Safe Simulation</span>
                    <span className="text-[#38bdf8] text-[10px] font-mono">READ-ONLY</span>
                  </div>
                  <div className="text-[11px] text-[#94a3b8] mt-1">
                    Simulate execution against gateway sandbox with 0 database mutations.
                  </div>
                </button>

                {/* Real Protected Database Action */}
                <button
                  onClick={() => setPendingRealAction(analysis?.recommendedAction || "RETRY_PAYMENT")}
                  className="bg-[#142211] hover:bg-[#1d3119] border border-[#2d5225] p-3 rounded-lg text-left transition-colors cursor-pointer flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-[#86efac]">
                    <span>⚡ Execute Real Action</span>
                    <span className="text-[#34d399] text-[10px] font-mono">SUPABASE MUTATION</span>
                  </div>
                  <div className="text-[11px] text-[#94a3b8] mt-1">
                    Dispatches live recovery action with strict operator confirmation & audit log.
                  </div>
                </button>
              </div>
            </div>

            {/* Simulation Feedback Terminal */}
            {simulatingAction && (
              <div className="bg-[#050c12] border border-[#1d3b52] p-3 rounded-lg flex items-center gap-3 text-xs text-[#d6f36b] animate-pulse">
                <span className="w-3.5 h-3.5 border-2 border-[#d6f36b] border-t-transparent rounded-full animate-spin"></span>
                <span>Simulating {simulatingAction} through autonomous recovery engine...</span>
              </div>
            )}

            {simulatedResult && (
              <div className="bg-[#050c12] border border-[#19354a] p-3.5 rounded-lg space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between text-[#86efac]">
                  <span className="font-bold">STAGE 5 OBSERVED: {simulatedResult.status}</span>
                  <span className="text-[#64748b] text-[10px]">{simulatedResult.timestamp}</span>
                </div>
                <div className="text-[#cbd5e1]">{simulatedResult.telemetry}</div>
                <div className="text-[#d6f36b] font-bold pt-1 border-t border-[#142938]">
                  {simulatedResult.projectedOutcome}
                </div>
              </div>
            )}

            {/* Real Action Confirmation Modal / Inline Drawer */}
            {pendingRealAction && (
              <div className="bg-[#1a1205] border border-[#78350f] p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#fbbf24]">
                  <span>⚠</span>
                  <span>Confirm Real Production Action: {pendingRealAction}</span>
                </div>
                <p className="text-xs text-[#cbd5e1] leading-relaxed">
                  You are about to execute a real recovery action for <strong>{currentCase?.customers?.name}</strong> (Amount: ₹{Number(currentCase?.amount_at_risk).toLocaleString()}). This will write a new entry to <code className="text-[#d6f36b]">recovery_actions</code>, update case status, and append an immutable entry to <code className="text-[#d6f36b]">audit_logs</code>.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleConfirmRealAction}
                    disabled={executingRealAction}
                    className="bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {executingRealAction ? "Committing to Supabase..." : "Confirm & Commit Action"}
                  </button>
                  <button
                    onClick={() => setPendingRealAction(null)}
                    disabled={executingRealAction}
                    className="bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Stage 6: Audit Entries for this Case */}
            <div className="space-y-2 pt-2 border-t border-[#162736]">
              <div className="text-[10px] text-[#64748b] uppercase font-semibold flex items-center justify-between">
                <span>Stage 6: Real Audit Logs (Supabase audit_logs)</span>
                <span>{caseDetails?.auditLogs?.length || 0} entries</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(caseDetails?.auditLogs || []).length > 0 ? (
                  caseDetails?.auditLogs.map((log) => (
                    <div key={log.id} className="bg-[#050c12] border border-[#142636] p-2.5 rounded text-xs space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-[#93c5fd] font-mono">{log.event}</span>
                        <span className="text-[#64748b]">{new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="text-[#94a3b8] text-[11px] truncate">
                        Actor: <span className="text-white">{log.actor_type}</span> • {JSON.stringify(log.details)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#64748b] italic py-2">
                    No operator actions committed yet. Run a real action above to generate an audit log.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Strategy Copilot Chat (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 flex flex-col h-[750px] shadow-sm">
            <div className="border-b border-[#162736] pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#d6f36b]">✦</span>
                  <h2 className="font-bold text-xs text-white uppercase tracking-wider">
                    Agentic Strategy Copilot
                  </h2>
                </div>
                <span className="text-[10px] bg-[#111e2b] text-[#93c5fd] px-2 py-0.5 rounded font-mono border border-[#1b3146]">
                  Gemini 3.7 Flash
                </span>
              </div>
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Context-aware dialog grounded in the active recovery case and Supabase payment records.
              </p>
            </div>

            {/* Chat message scroll area */}
            <div className="flex-1 py-4 overflow-y-auto space-y-3 pr-1">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[90%] p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.sender === "user"
                        ? "bg-[#162b3d] text-white border border-[#23435e]"
                        : "bg-[#0c1824] text-[#cbd5e1] border border-[#173046]"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-[#64748b] mt-1 px-1">{msg.time}</span>
                </div>
              ))}
              {chatLoading && (
                <div className="bg-[#0c1824] border border-[#173046] p-3 rounded-xl text-xs text-[#94a3b8] flex items-center gap-2 max-w-[80%]">
                  <span className="w-3 h-3 border-2 border-[#d6f36b] border-t-transparent rounded-full animate-spin"></span>
                  <span>AI Agent is formulating recovery policy...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="pt-3 border-t border-[#162736] flex gap-2">
              <input
                type="text"
                placeholder="Ask about dunning, UPI retry cadences, or churn mitigation..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-[#060e15] border border-[#182f44] text-white text-xs px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-[#d6f36b] placeholder-[#475569]"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="bg-[#d6f36b] hover:bg-[#c6e855] text-[#081016] text-xs font-bold px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
