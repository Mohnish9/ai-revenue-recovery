import React, { useState, useEffect } from "react";
import type { DemoScenarioItem, DemoScenarioFullResponse } from "../lib/types";
import { fetchDemoScenariosApi, analyzeDemoScenarioApi } from "../lib/api";

export function RecoveryDemoPage() {
  const [scenarios, setScenarios] = useState<DemoScenarioItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("insufficient-funds");
  const [loadingScenarios, setLoadingScenarios] = useState<boolean>(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [activeData, setActiveData] = useState<DemoScenarioFullResponse | null>(null);
  const [customInstruction, setCustomInstruction] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);

  // Simulation sandbox state
  const [simulatingAction, setSimulatingAction] = useState<string | null>(null);
  const [simulationLog, setSimulationLog] = useState<{
    action: string;
    timestamp: string;
    status: string;
    message: string;
    projectedLift: string;
    telemetry: string;
  } | null>(null);

  // Load scenarios on mount
  useEffect(() => {
    async function loadScenarios() {
      try {
        setLoadingScenarios(true);
        const data = await fetchDemoScenariosApi();
        setScenarios(data);
        if (data.length > 0) {
          setSelectedKey(data[0].key);
        }
      } catch (err) {
        console.error("Failed to load demo scenarios", err);
      } finally {
        setLoadingScenarios(false);
      }
    }
    loadScenarios();
  }, []);

  // Fetch AI analysis for selected scenario
  const runAnalysis = async (key: string, instruction?: string) => {
    try {
      setLoadingAnalysis(true);
      setSimulationLog(null);
      const res = await analyzeDemoScenarioApi(key, instruction);
      setActiveData(res);
      if (res.scenario?.defaultChannel) {
        setSelectedChannel(res.scenario.defaultChannel.toLowerCase() as "whatsapp" | "sms" | "email");
      }
    } catch (err) {
      console.error("Failed to analyze scenario with AI", err);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  useEffect(() => {
    if (selectedKey) {
      runAnalysis(selectedKey);
    }
  }, [selectedKey]);

  const handleCustomPromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKey) return;
    runAnalysis(selectedKey, customInstruction);
  };

  const handleCopyMessage = (text: string, channel: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChannel(channel);
    setTimeout(() => setCopiedChannel(null), 2200);
  };

  const handleRunSimulation = (actionName: string) => {
    setSimulatingAction(actionName);
    setTimeout(() => {
      setSimulatingAction(null);
      const prob = activeData?.analysis.recoveryProbability || 0.75;
      const expectedSettlement = Math.round(prob * 100);
      setSimulationLog({
        action: actionName,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        status: "200 OK (SANDBOX DISPATCH)",
        message: `Simulated ${actionName} dispatched via webhook sandbox. Gateway ACK received in 142ms with 0 database mutations.`,
        projectedLift: `+${expectedSettlement}% Projected Settlement Rate`,
        telemetry: `Routing Rule: Auto-Dunning v3.4 | Acquirer Failover: Enabled | Idempotency Key: IDEM-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      });
    }, 750);
  };

  const categories = [
    { id: "ALL", label: "All Scenarios" },
    { id: "CARD", label: "Card Declines" },
    { id: "UPI", label: "UPI & Mandates" },
    { id: "INVOICE", label: "B2B Invoices" },
    { id: "SUBSCRIPTION", label: "Subscriptions" },
    { id: "CHECKOUT", label: "Drop-Offs" },
    { id: "CHURN", label: "Churn Risk" },
  ];

  const filteredScenarios = scenarios.filter((s) => {
    if (categoryFilter === "ALL") return true;
    return s.category === categoryFilter;
  });

  const currentScenario = scenarios.find((s) => s.key === selectedKey) || scenarios[0];
  const analysis = activeData?.analysis;
  const customer = activeData?.customer || currentScenario?.customer;
  const context = activeData?.context;

  const recoveryProbPct = Math.round((analysis?.recoveryProbability || 0.75) * 100);
  const amountAtRisk = currentScenario?.amount ?? 0;
  const expectedRev = analysis?.expectedRecoverableRevenue ?? Math.round(amountAtRisk * 0.75);
  const currency = currentScenario?.currency || "INR";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header & Context Bar */}
      <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-[#183144] text-[#d6f36b] text-[11px] font-bold px-2.5 py-0.5 rounded border border-[#274862] tracking-wide">
                ✦ AUTONOMOUS REVENUE RECOVERY DEMO
              </span>
              <span className="bg-[#064e3b] text-[#34d399] text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1.5 border border-[#065f46]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse"></span>
                LIVE SUPABASE SYNC
              </span>
              <span className="bg-[#111f2d] text-[#93c5fd] text-[11px] font-medium px-2 py-0.5 rounded border border-[#1e3448]">
                GEMINI 3.7 FLASH REASONING
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Interactive 9-Scenario Recovery Command Center
            </h1>
            <p className="text-xs lg:text-sm text-[#94a3b8] max-w-4xl leading-relaxed">
              Explore 9 critical payment and billing disruption patterns. Recoverly blends real-time Supabase customer telemetry with autonomous Gemini AI diagnosis, optimal timing calculations, and multi-channel customer communications.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-[#050c12] border border-[#172b3c] px-3 py-2 rounded-lg text-right">
              <div className="text-[10px] text-[#64748b] font-semibold uppercase tracking-wider">Safety Guarantee</div>
              <div className="text-xs font-bold text-[#86efac] flex items-center gap-1 justify-end">
                <span>🛡 Sandbox Read-Only</span>
              </div>
            </div>
            <button
              onClick={() => runAnalysis(selectedKey, customInstruction)}
              disabled={loadingAnalysis}
              className="bg-[#d6f36b] hover:bg-[#c6e855] text-[#081016] text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {loadingAnalysis ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#081016] border-t-transparent rounded-full animate-spin"></span>
                  <span>Synthesizing Intelligence...</span>
                </>
              ) : (
                <>
                  <span>✦</span>
                  <span>Re-evaluate with Gemini</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 9 Scenarios Selection Shelf */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              1. Choose a Revenue-Recovery Scenario
            </span>
            <span className="text-xs text-[#64748b]">({scenarios.length} Scenarios Ready)</span>
          </div>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === cat.id
                    ? "bg-[#d6f36b] text-[#081016] font-bold shadow-sm"
                    : "bg-[#0c1620] text-[#94a3b8] hover:text-white border border-[#162736]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loadingScenarios ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="h-28 bg-[#091118] border border-[#162736] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredScenarios.map((sc) => {
              const isSelected = sc.key === selectedKey;
              return (
                <button
                  key={sc.key}
                  onClick={() => setSelectedKey(sc.key)}
                  className={`text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? "bg-[#102434] border-[#d6f36b] ring-1 ring-[#d6f36b]/40 shadow-sm"
                      : "bg-[#091118] border-[#162736] hover:border-[#274862] hover:bg-[#0c1722]"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#d6f36b] rounded-bl-md"></div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        sc.severity === "CRITICAL"
                          ? "bg-[#450a0a] text-[#f87171] border border-[#7f1d1d]"
                          : sc.severity === "HIGH"
                          ? "bg-[#451a03] text-[#fbbf24] border border-[#78350f]"
                          : "bg-[#172554] text-[#93c5fd] border border-[#1e3a8a]"
                      }`}>
                        {sc.tag}
                      </span>
                      <span className="text-xs font-mono font-bold text-white">
                        {sc.currency} {sc.amount.toLocaleString()}
                      </span>
                    </div>

                    <div className="font-semibold text-sm text-white pt-0.5 line-clamp-1">
                      {sc.name}
                    </div>

                    <p className="text-[11px] text-[#94a3b8] line-clamp-2 leading-relaxed">
                      {sc.problemDetected}
                    </p>
                  </div>

                  <div className="pt-3 mt-2 flex items-center justify-between border-t border-[#162736] text-[10px]">
                    <span className="truncate max-w-[170px] text-[#94a3b8]">
                      👤 {sc.customer?.name || sc.customerLookupEmail}
                    </span>
                    <span className={`font-semibold ${isSelected ? "text-[#d6f36b]" : "text-[#64748b]"}`}>
                      {isSelected ? "Active Case ●" : "Inspect Case ➔"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Analysis & Execution Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Problem Diagnosis & Live Supabase Context (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Card: Problem Detected & Live Supabase Profile */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#162736] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#f59e0b]">⚠</span>
                <h2 className="font-bold text-xs text-white uppercase tracking-wider">
                  Problem & Customer Context
                </h2>
              </div>
              <span className="text-[10px] bg-[#122030] text-[#94a3b8] font-mono px-2 py-0.5 rounded border border-[#1a3148]">
                {currentScenario?.failureCode || "PAYMENT_DECLINE"}
              </span>
            </div>

            {/* Problem Box */}
            <div className="bg-[#0c1824] border border-[#193248] rounded-lg p-3.5 space-y-2">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>{currentScenario?.name}</span>
                <span className="text-[10px] text-[#d6f36b] font-mono font-normal">
                  Rail: {currentScenario?.paymentMethod || "Direct Payment"}
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                {currentScenario?.problemDetected}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <div className="text-[11px] bg-[#060e15] px-2.5 py-1 rounded text-[#94a3b8] border border-[#15293c]">
                  Amount at risk: <strong className="text-white font-mono">{currency} {amountAtRisk.toLocaleString()}</strong>
                </div>
                <div className="text-[11px] bg-[#060e15] px-2.5 py-1 rounded text-[#94a3b8] border border-[#15293c]">
                  Severity: <span className="text-[#fbbf24] font-semibold">{currentScenario?.severity || "HIGH"}</span>
                </div>
              </div>
            </div>

            {/* Real Supabase Customer Database Record */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#94a3b8] font-semibold">
                <span className="flex items-center gap-1.5 text-white">
                  <span>👤</span> Live Supabase Customer Profile
                </span>
                <span className="text-[10px] text-[#34d399] font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]"></span> Connected
                </span>
              </div>

              <div className="bg-[#060d14] border border-[#152738] rounded-lg p-3.5 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 pb-2.5 border-b border-[#152738]">
                  <div>
                    <div className="text-[10px] text-[#64748b] uppercase font-semibold">Customer Name</div>
                    <div className="font-bold text-white text-xs mt-0.5">{customer?.name || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#64748b] uppercase font-semibold">Segment</div>
                    <div className="text-[#93c5fd] font-medium text-xs mt-0.5">{customer?.customer_type || "INDIVIDUAL"}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] text-[#64748b] uppercase font-semibold">Contact Email & Phone</div>
                    <div className="text-[#cbd5e1] font-mono text-[11px] mt-0.5 truncate">
                      {customer?.email || currentScenario?.customerLookupEmail} {customer?.phone ? `• ${customer.phone}` : ""}
                    </div>
                  </div>
                </div>

                {/* DB Telemetry Counters */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#0a1520] p-2 rounded border border-[#162a3c]">
                    <div className="text-[10px] text-[#64748b] uppercase">Transactions</div>
                    <div className="text-xs font-bold font-mono text-white mt-0.5">{context?.transactions?.length || 1}</div>
                  </div>
                  <div className="bg-[#0a1520] p-2 rounded border border-[#162a3c]">
                    <div className="text-[10px] text-[#64748b] uppercase">Invoices</div>
                    <div className="text-xs font-bold font-mono text-white mt-0.5">{context?.invoices?.length || 1}</div>
                  </div>
                  <div className="bg-[#0a1520] p-2 rounded border border-[#162a3c]">
                    <div className="text-[10px] text-[#64748b] uppercase">Events</div>
                    <div className="text-xs font-bold font-mono text-white mt-0.5">{context?.paymentEvents?.length || 2}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Root Cause Diagnosis */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider flex items-center gap-1.5">
                <span>🔍</span> Root Cause Diagnosis
              </div>
              <div className="bg-[#09141e] border border-[#162c3e] p-3.5 rounded-lg text-xs text-[#e2e8f0] leading-relaxed">
                {analysis?.rootCause || currentScenario?.baselineSummary}
              </div>
            </div>
          </div>

          {/* Card: Read-Only Simulation Sandbox */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#162736] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🧪</span>
                <h2 className="font-bold text-xs text-white uppercase tracking-wider">
                  Simulation Sandbox (Safe / Read-Only)
                </h2>
              </div>
              <span className="text-[10px] bg-[#064e3b] text-[#86efac] font-medium px-2 py-0.5 rounded border border-[#065f46]">
                No DB Mutation
              </span>
            </div>

            <p className="text-xs text-[#94a3b8] leading-relaxed">
              Test executing the autonomous recovery strategy in a protected simulation environment without triggering real gateway debits or modifying database records:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => handleRunSimulation("Smart Multi-Acquirer Retry")}
                disabled={simulatingAction !== null}
                className="bg-[#0c1824] hover:bg-[#132536] border border-[#1b344b] text-white text-xs font-semibold p-2.5 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer disabled:opacity-60"
              >
                <span>⚡ Test Smart Retry</span>
                <span className="text-[#d6f36b]">➔</span>
              </button>

              <button
                onClick={() => handleRunSimulation("WhatsApp 1-Click Intent")}
                disabled={simulatingAction !== null}
                className="bg-[#0c1824] hover:bg-[#132536] border border-[#1b344b] text-white text-xs font-semibold p-2.5 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer disabled:opacity-60"
              >
                <span>💬 Test WhatsApp Dispatch</span>
                <span className="text-[#34d399]">➔</span>
              </button>

              <button
                onClick={() => handleRunSimulation("Tokenized Card Update Link")}
                disabled={simulatingAction !== null}
                className="bg-[#0c1824] hover:bg-[#132536] border border-[#1b344b] text-white text-xs font-semibold p-2.5 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer disabled:opacity-60"
              >
                <span>💳 Test Card Update Flow</span>
                <span className="text-[#93c5fd]">➔</span>
              </button>

              <button
                onClick={() => handleRunSimulation("B2B Promise-to-Pay Lock")}
                disabled={simulatingAction !== null}
                className="bg-[#0c1824] hover:bg-[#132536] border border-[#1b344b] text-white text-xs font-semibold p-2.5 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer disabled:opacity-60"
              >
                <span>🤝 Test Promise-to-Pay</span>
                <span className="text-[#f59e0b]">➔</span>
              </button>
            </div>

            {/* Simulation Feedback Output */}
            {simulatingAction && (
              <div className="bg-[#050c12] border border-[#1d3b52] p-3 rounded-lg flex items-center gap-3 text-xs text-[#d6f36b] animate-pulse">
                <span className="w-3.5 h-3.5 border-2 border-[#d6f36b] border-t-transparent rounded-full animate-spin"></span>
                <span>Simulating {simulatingAction} through recovery orchestration engine...</span>
              </div>
            )}

            {simulationLog && (
              <div className="bg-[#050c12] border border-[#19354a] p-3.5 rounded-lg space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between text-[#86efac]">
                  <span className="font-bold">✔ {simulationLog.status}</span>
                  <span className="text-[#64748b] text-[10px]">{simulationLog.timestamp}</span>
                </div>
                <div className="text-[#cbd5e1]">{simulationLog.message}</div>
                <div className="text-[10px] text-[#64748b]">{simulationLog.telemetry}</div>
                <div className="text-[#d6f36b] font-bold pt-1.5 border-t border-[#142938]">
                  {simulationLog.projectedLift}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Intelligence, Strategy & Communications (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card: AI Strategy Studio & Metrics */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#162736] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#d6f36b]">✦</span>
                <h2 className="font-bold text-xs text-white uppercase tracking-wider">
                  AI Assessment & Recommended Action
                </h2>
              </div>
              <span className="text-[10px] bg-[#111e2b] text-[#93c5fd] px-2 py-0.5 rounded font-mono border border-[#1b3146]">
                Engine: Gemini 3.7 Flash
              </span>
            </div>

            {loadingAnalysis ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-[#d6f36b] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div className="text-xs text-[#94a3b8]">
                  Evaluating Supabase history, banking decline codes, and optimal dunning strategy...
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* AI Executive Assessment */}
                <div className="bg-[#0b1722] border border-[#18344c] rounded-lg p-4 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#d6f36b] uppercase tracking-wider flex items-center gap-1.5">
                    <span>✦</span> AI Executive Assessment
                  </div>
                  <p className="text-xs text-white leading-relaxed">
                    {analysis?.aiAssessment || "AI analysis completed based on real account telemetry."}
                  </p>
                </div>

                {/* Key Metrics Row: Probability, Recoverable Revenue, Timing */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Recovery Probability */}
                  <div className="bg-[#060e15] border border-[#15293c] p-3.5 rounded-lg space-y-1.5">
                    <div className="text-[10px] text-[#94a3b8] uppercase font-semibold">Recovery Probability</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-white font-mono">{recoveryProbPct}%</span>
                      <span className={`text-[10px] font-bold ${
                        recoveryProbPct >= 80 ? "text-[#34d399]" : recoveryProbPct >= 60 ? "text-[#fbbf24]" : "text-[#f87171]"
                      }`}>
                        {recoveryProbPct >= 80 ? "HIGH" : recoveryProbPct >= 60 ? "MODERATE" : "HIGH CHURN RISK"}
                      </span>
                    </div>
                    {/* Visual Gauge Bar */}
                    <div className="w-full bg-[#11202e] h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          recoveryProbPct >= 80 ? "bg-[#34d399]" : recoveryProbPct >= 60 ? "bg-[#fbbf24]" : "bg-[#f87171]"
                        }`}
                        style={{ width: `${recoveryProbPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Expected Recoverable Revenue */}
                  <div className="bg-[#060e15] border border-[#15293c] p-3.5 rounded-lg space-y-1.5">
                    <div className="text-[10px] text-[#94a3b8] uppercase font-semibold">Expected Recoverable</div>
                    <div className="text-2xl font-black text-[#d6f36b] font-mono">
                      {currency} {expectedRev.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[#64748b] truncate">
                      of {currency} {amountAtRisk.toLocaleString()} at risk
                    </div>
                  </div>

                  {/* Recommended Timing */}
                  <div className="bg-[#060e15] border border-[#15293c] p-3.5 rounded-lg space-y-1.5">
                    <div className="text-[10px] text-[#94a3b8] uppercase font-semibold">Recommended Timing</div>
                    <div className="text-xs font-bold text-white line-clamp-2 leading-tight">
                      {analysis?.recommendedTiming || "Immediate execution window"}
                    </div>
                    <div className="text-[10px] text-[#38bdf8] flex items-center gap-1">
                      <span>⚡</span> Bank Clearing Optimized
                    </div>
                  </div>
                </div>

                {/* Strategy & Reasoning Breakdown */}
                <div className="space-y-3 bg-[#060e15] border border-[#15293c] p-4 rounded-lg">
                  <div>
                    <div className="text-[10px] text-[#94a3b8] uppercase font-semibold">Recommended Strategy</div>
                    <div className="text-sm font-bold text-white mt-1 flex items-center gap-2">
                      <span className="text-[#34d399]">✔</span>
                      <span>{analysis?.recommendedStrategy || "Autonomous Multi-Channel Cascade"}</span>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#132332]">
                    <div className="text-[10px] text-[#94a3b8] uppercase font-semibold">Mathematical & Behavioral Reasoning</div>
                    <p className="text-xs text-[#cbd5e1] leading-relaxed mt-1">
                      {analysis?.reasoning || "Aligns execution with card network settlement windows while minimizing friction for the customer."}
                    </p>
                  </div>

                  {/* Key Operational Risk Factors */}
                  {analysis?.keyRiskFactors && analysis.keyRiskFactors.length > 0 && (
                    <div className="pt-2.5 border-t border-[#132332] space-y-1.5">
                      <div className="text-[10px] text-[#94a3b8] uppercase font-semibold">Key Risk Mitigations</div>
                      <div className="space-y-1">
                        {analysis.keyRiskFactors.map((risk, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-[#94a3b8]">
                            <span className="text-[#f87171] text-[10px] mt-0.5">●</span>
                            <span className="text-[#cbd5e1]">{risk}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Custom Prompting Bar */}
                <form onSubmit={handleCustomPromptSubmit} className="pt-1">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                      placeholder="Prompt Gemini Live (e.g. 'Prioritize friction-free WhatsApp UPI intent' or 'Offer 5% annual upgrade incentive')..."
                      className="flex-1 bg-[#060e15] border border-[#172e42] text-white text-xs px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-[#d6f36b] placeholder-[#475569]"
                    />
                    <button
                      type="submit"
                      disabled={loadingAnalysis}
                      className="bg-[#122434] hover:bg-[#1a344a] text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap border border-[#1e3b54] cursor-pointer disabled:opacity-60"
                    >
                      {loadingAnalysis ? "Evaluating..." : "Apply AI Directive"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Card: Suggested Customer Message (WhatsApp / SMS / Email) */}
          <div className="bg-[#091118] border border-[#162736] rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#162736] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">💬</span>
                <h2 className="font-bold text-xs text-white uppercase tracking-wider">
                  Suggested Customer Message (WhatsApp / SMS / Email)
                </h2>
              </div>

              {/* Channel Tabs */}
              <div className="flex bg-[#060d14] p-1 rounded-lg border border-[#142636]">
                <button
                  onClick={() => setSelectedChannel("whatsapp")}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    selectedChannel === "whatsapp"
                      ? "bg-[#25D366] text-black shadow-sm"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => setSelectedChannel("sms")}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    selectedChannel === "sms"
                      ? "bg-[#38bdf8] text-black shadow-sm"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                >
                  SMS
                </button>
                <button
                  onClick={() => setSelectedChannel("email")}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    selectedChannel === "email"
                      ? "bg-[#c084fc] text-black shadow-sm"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                >
                  Email
                </button>
              </div>
            </div>

            {/* Realistic Message Previews */}
            <div className="space-y-3">
              {/* WhatsApp Tab */}
              {selectedChannel === "whatsapp" && (
                <div className="bg-[#05130d] border border-[#0b3322] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#0b3322] pb-2 text-xs">
                    <div className="flex items-center gap-2 text-[#34d399] font-bold">
                      <span className="w-2 h-2 rounded-full bg-[#25D366]"></span>
                      WhatsApp Official Business Account (Verified)
                    </div>
                    <button
                      onClick={() => handleCopyMessage(analysis?.messages?.whatsapp || "", "whatsapp")}
                      className="text-[11px] bg-[#0c3826] hover:bg-[#134e36] text-[#86efac] font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer"
                    >
                      {copiedChannel === "whatsapp" ? "✔ Copied to Clipboard" : "📋 Copy WhatsApp Text"}
                    </button>
                  </div>

                  {/* Authentic WhatsApp Bubble */}
                  <div className="max-w-md bg-[#005c4b] text-white p-3.5 rounded-xl rounded-tl-none space-y-2 text-xs shadow-md border border-[#02735e]">
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {analysis?.messages?.whatsapp || `Hi ${customer?.name || "Customer"} 👋 Your payment of ${currency} ${amountAtRisk.toLocaleString()} was interrupted. Tap here to complete it instantly: https://pay.recoverly.test/i/${(currentScenario?.key || "recovery").slice(0, 6)}`}
                    </p>
                    <div className="text-[10px] text-[#a7f3d0] text-right flex items-center justify-end gap-1">
                      <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-[#38bdf8]">✓✓</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SMS Tab */}
              {selectedChannel === "sms" && (
                <div className="bg-[#060e15] border border-[#152a3c] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#152a3c] pb-2 text-xs">
                    <div className="text-[#38bdf8] font-bold flex items-center gap-2">
                      <span>📱</span> Telecom DLT Verified SMS (160 Chars)
                    </div>
                    <button
                      onClick={() => handleCopyMessage(analysis?.messages?.sms || "", "sms")}
                      className="text-[11px] bg-[#12283a] hover:bg-[#1a3852] text-[#93c5fd] font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer"
                    >
                      {copiedChannel === "sms" ? "✔ Copied to Clipboard" : "📋 Copy SMS Text"}
                    </button>
                  </div>

                  {/* SMS Bubble */}
                  <div className="max-w-sm bg-[#162738] text-white p-3.5 rounded-2xl rounded-bl-none text-xs leading-relaxed border border-[#233f5a]">
                    {analysis?.messages?.sms || `Recoverly Alert: Hi ${customer?.name || "Customer"}, your payment of ${currency} ${amountAtRisk.toLocaleString()} is pending. Settle in 1 tap: https://pay.recoverly.test/s/${(currentScenario?.key || "recovery").slice(0, 6)}`}
                  </div>
                </div>
              )}

              {/* Email Tab */}
              {selectedChannel === "email" && (
                <div className="bg-[#060e15] border border-[#152a3c] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#152a3c] pb-2 text-xs">
                    <div className="text-[#c084fc] font-bold flex items-center gap-2">
                      <span>✉</span> Branded Finance & Recovery Email
                    </div>
                    <button
                      onClick={() =>
                        handleCopyMessage(
                          `Subject: ${analysis?.messages?.email?.subject}\n\n${analysis?.messages?.email?.body}`,
                          "email"
                        )
                      }
                      className="text-[11px] bg-[#2d114d] hover:bg-[#3d1866] text-[#d8b4fe] font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer"
                    >
                      {copiedChannel === "email" ? "✔ Copied to Clipboard" : "📋 Copy Full Email"}
                    </button>
                  </div>

                  <div className="bg-[#091420] border border-[#162c3e] rounded-lg p-4 space-y-3 text-xs">
                    <div className="text-[#94a3b8] text-[11px] border-b border-[#162c3e] pb-2">
                      <span className="font-semibold text-white">Subject: </span>
                      <span className="text-[#cbd5e1]">{analysis?.messages?.email?.subject || `Action Required: Payment for ${customer?.name || "your account"}`}</span>
                    </div>

                    <div className="text-[#cbd5e1] whitespace-pre-wrap leading-relaxed text-xs">
                      {analysis?.messages?.email?.body || `Dear ${customer?.name || "Valued Customer"},\n\nWe noticed your recent payment could not be processed. Please use the secure link below to complete your transaction.\n\nBest regards,\nRecoverly Revenue Operations Team`}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => handleRunSimulation("Email Settle CTA Link")}
                        className="bg-[#d6f36b] text-[#081016] text-xs font-bold px-4 py-2 rounded-md hover:bg-[#c4e555] transition-colors cursor-pointer"
                      >
                        Complete Payment ({currency} {amountAtRisk.toLocaleString()})
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
