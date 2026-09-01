import type {
  AICaseAnalysis,
  AgentLog,
  AuditLog,
  AuthResponse,
  AutonomousStepResult,
  CreateSandboxIncidentInput,
  Customer,
  CustomerOperationsOverview,
  DashboardSummary,
  DemoScenarioItem,
  DemoScenarioFullResponse,
  FullRecoveryCaseDetails,
  HealthResponse,
  Invoice,
  PaymentEvent,
  PromiseToPay,
  RecoveryAction,
  RecoveryCase,
  SandboxIncidentResponse,
  SandboxSimulationResult,
  ScenarioSimulationResult,
  ScenarioTypeConfig,
  Subscription,
  SyntheticTelemetryRecord,
  TelemetryAIAnalysis,
  TelemetryQueueSummary,
  DetectionEvaluation,
  Transaction,
  UserProfile,
  HumanEscalationsSummaryResponse,
  ChannelReadinessResponse,
} from "./types";

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
  
  // Default to same-origin relative /api
  if (!envUrl) {
    return "/api";
  }

  // If in browser and envUrl points to localhost, 0.0.0.0, relative path, or current preview host
  if (typeof window !== "undefined") {
    if (
      envUrl === "/api" ||
      envUrl === "/" ||
      envUrl.includes("localhost") ||
      envUrl.includes("0.0.0.0") ||
      envUrl.includes("127.0.0.1") ||
      envUrl.startsWith("/") ||
      (window.location.hostname && envUrl.includes(window.location.hostname))
    ) {
      return "/api";
    }
  }

  // Normalize: remove trailing slashes and ensure /api is present at the end
  const normalized = envUrl.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

export function resolveApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // Ensure apiPath begins with /api
  let apiPath = cleanPath;
  if (!cleanPath.startsWith("/api/") && cleanPath !== "/api") {
    apiPath = `/api${cleanPath}`;
  }

  // If baseUrl is the relative /api prefix
  if (baseUrl === "/api" || baseUrl === "") {
    return apiPath;
  }

  // If baseUrl is an absolute URL ending with /api
  if (baseUrl.endsWith("/api")) {
    return `${baseUrl}${apiPath.substring(4)}`;
  }

  return `${baseUrl}${apiPath}`;
}

const AUTH_TOKEN_KEY = "recoverly_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    // Also remove any possible legacy keys
    localStorage.removeItem("sb-access-token");
    localStorage.removeItem("sb-refresh-token");
    sessionStorage.clear();
  }
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = resolveApiUrl(path);
  let response: Response | undefined;
  const maxRetries = options?.method && options.method !== "GET" ? 1 : 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
      break;
    } catch (netErr: any) {
      if (attempt < maxRetries) {
        // Transient network glitch or server restart: wait and retry
        await new Promise((r) => setTimeout(r, (attempt + 1) * 300));
        continue;
      }
      const message = netErr?.message || "Network request failed";
      console.error(`[API Network Error] ${options?.method || "GET"} ${url}:`, message);
      throw new Error(`Unable to reach backend API (${message}). Check server status.`);
    }
  }

  if (!response) {
    throw new Error("Unable to reach backend API. Check server status.");
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json") || contentType.includes("+json");

  if (!response.ok) {
    let errorDetail = `Request failed (Status ${response.status} ${response.statusText || ""})`.trim();

    if (isJson) {
      try {
        const errJson = await response.json();
        if (errJson?.error) {
          errorDetail = errJson.error;
        } else if (errJson?.message) {
          errorDetail = errJson.message;
        }
      } catch {
        // Failed to parse error JSON
      }
    } else {
      try {
        const text = await response.text();
        if (text && text.length < 300 && !text.includes("<!DOCTYPE") && !text.includes("<html") && !text.includes("<!doctype")) {
          errorDetail = text.trim();
        } else {
          errorDetail = `Server returned HTTP ${response.status} (${response.statusText || "Non-JSON response"})`;
        }
      } catch {
        // Failed reading text
      }
    }

    if (response.status === 401 && !path.includes("/auth/login") && !path.includes("/auth/signup")) {
      // Session expired or invalid
      setStoredToken(null);
      window.dispatchEvent(new Event("recoverly_auth_unauthorized"));
    }

    throw new Error(errorDetail);
  }

  if (!isJson) {
    let preview = "";
    try {
      preview = await response.text();
    } catch {
      // ignore
    }
    if (preview.includes("<!DOCTYPE") || preview.includes("<html") || preview.includes("<!doctype")) {
      throw new Error(`Received HTML page instead of JSON API response from ${url}. Check server route registration.`);
    }
    throw new Error(`Server returned non-JSON response (Content-Type: ${contentType || "none"})`);
  }

  return (await response.json()) as T;
}

// Authentication APIs (Supabase Auth via backend proxy)
export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const res = await fetchJson<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function signupApi(
  email: string,
  password: string,
  name: string,
  role = "REVENUE_OPERATOR"
): Promise<AuthResponse> {
  const res = await fetchJson<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name, role }),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function fetchMeApi(): Promise<{ user: UserProfile }> {
  return fetchJson<{ user: UserProfile }>("/auth/me");
}

export async function logoutApi(): Promise<{ success: boolean }> {
  try {
    await fetchJson<{ success: boolean }>("/auth/logout", { method: "POST" });
  } finally {
    setStoredToken(null);
  }
  return { success: true };
}

// Health & Dashboard
export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/health");
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return fetchJson<DashboardSummary>("/dashboard");
}

// Customers
export async function fetchCustomers(limit = 100, search?: string): Promise<Customer[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (search) query.append("search", search);
  return fetchJson<Customer[]>(`/customers?${query.toString()}`);
}

export async function fetchCustomer(id: string): Promise<Customer> {
  return fetchJson<Customer>(`/customers/${id}`);
}

export async function fetchCustomerOperations(id: string, limit = 100): Promise<CustomerOperationsOverview> {
  return fetchJson<CustomerOperationsOverview>(`/customers/${id}/operations?limit=${limit}`);
}

// Transactions
export async function fetchTransactions(limit = 100, status?: string, paymentMethod?: string): Promise<Transaction[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.append("status", status);
  if (paymentMethod) query.append("payment_method", paymentMethod);
  return fetchJson<Transaction[]>(`/transactions?${query.toString()}`);
}

export async function fetchTransaction(id: string): Promise<Transaction> {
  return fetchJson<Transaction>(`/transactions/${id}`);
}

// Invoices
export async function fetchInvoices(limit = 100, status?: string): Promise<Invoice[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.append("status", status);
  return fetchJson<Invoice[]>(`/invoices?${query.toString()}`);
}

export async function fetchInvoice(id: string): Promise<Invoice> {
  return fetchJson<Invoice>(`/invoices/${id}`);
}

// Subscriptions
export async function fetchSubscriptions(limit = 100, status?: string): Promise<Subscription[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.append("status", status);
  return fetchJson<Subscription[]>(`/subscriptions?${query.toString()}`);
}

// Payment Events (Failed payments, checkout drop-offs, mandates)
export async function fetchPaymentEvents(limit = 100, eventType?: string): Promise<PaymentEvent[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (eventType) query.append("event_type", eventType);
  return fetchJson<PaymentEvent[]>(`/payment-events?${query.toString()}`);
}

// Recovery Cases
export async function fetchRecoveryCases(limit = 100, status?: string, priority?: string): Promise<RecoveryCase[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (status) query.append("status", status);
  if (priority) query.append("priority", priority);
  return fetchJson<RecoveryCase[]>(`/recovery-cases?${query.toString()}`);
}

export async function fetchRecoveryCase(id: string): Promise<FullRecoveryCaseDetails> {
  return fetchJson<FullRecoveryCaseDetails>(`/recovery-cases/${id}`);
}

export async function updateCaseStatus(id: string, status: string, assignedTo?: string): Promise<RecoveryCase> {
  return fetchJson<RecoveryCase>(`/recovery-cases/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, assigned_to: assignedTo }),
  });
}

export async function executeCaseAction(caseId: string, actionType: string, reason: string): Promise<RecoveryAction> {
  return fetchJson<RecoveryAction>(`/recovery-cases/${caseId}/actions`, {
    method: "POST",
    body: JSON.stringify({ action_type: actionType, reason }),
  });
}

export async function recordPromiseToPay(
  caseId: string,
  customerId: string,
  amount: number,
  promiseDate: string
): Promise<PromiseToPay> {
  return fetchJson<PromiseToPay>(`/recovery-cases/${caseId}/promises-to-pay`, {
    method: "POST",
    body: JSON.stringify({ customer_id: customerId, amount, promise_date: promiseDate }),
  });
}

// Audit & Agent Logs
export async function fetchAllAuditLogs(limit = 100, actorType?: string): Promise<AuditLog[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (actorType) query.append("actor_type", actorType);
  return fetchJson<AuditLog[]>(`/audit-logs?${query.toString()}`);
}

export async function fetchAllAgentLogs(limit = 100): Promise<AgentLog[]> {
  return fetchJson<AgentLog[]>(`/agent-logs?limit=${limit}`);
}

// AI Agent & Intelligence
export async function analyzeCaseWithAI(caseId: string, userInstruction?: string): Promise<AICaseAnalysis> {
  return fetchJson<AICaseAnalysis>(`/ai/analyze-case/${caseId}`, {
    method: "POST",
    body: JSON.stringify({ user_instruction: userInstruction }),
  });
}

export async function chatWithAI(message: string, caseId?: string): Promise<{ reply: string; model: string }> {
  return fetchJson<{ reply: string; model: string }>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, case_id: caseId }),
  });
}

// Scenario Center Simulation (Simulation only)
export async function simulateRecoveryScenario(params: {
  retryCadence: "conservative" | "balanced" | "aggressive";
  discountIncentivePct: number;
  omnichannelEnabled: boolean;
  gracePeriodDays: number;
  openCasesCount: number;
  totalAtRisk: number;
}): Promise<ScenarioSimulationResult> {
  return fetchJson<ScenarioSimulationResult>("/scenarios/simulate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Dynamic Sandbox Revenue Incident Creation & Autonomous Agent
export async function fetchScenarioTypesApi(): Promise<ScenarioTypeConfig[]> {
  return fetchJson<ScenarioTypeConfig[]>("/demo/scenario-types");
}

export async function fetchSandboxIncidentsApi(params?: {
  scenarioType?: string;
  status?: string;
  category?: string;
  limit?: number;
}): Promise<SandboxIncidentResponse[]> {
  const query = new URLSearchParams();
  if (params?.scenarioType) query.append("scenarioType", params.scenarioType);
  if (params?.status) query.append("status", params.status);
  if (params?.category) query.append("category", params.category);
  if (params?.limit) query.append("limit", String(params.limit));
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<SandboxIncidentResponse[]>(`/sandbox/incidents${queryString}`);
}

export async function fetchSandboxIncidentApi(id: string): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}`);
}

export async function createSandboxIncidentApi(
  input: CreateSandboxIncidentInput
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>("/sandbox/incidents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function analyzeSandboxIncidentApi(
  id: string,
  customInstruction?: string
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/analyze`, {
    method: "POST",
    body: JSON.stringify({ customInstruction }),
  });
}

export async function executeSandboxIncidentActionApi(
  id: string,
  params: {
    actionType: string;
    strategyName?: string;
    reason?: string;
    operatorInfo?: { name?: string; email?: string };
  }
): Promise<{ simulation: SandboxSimulationResult; updatedIncident: SandboxIncidentResponse }> {
  return fetchJson<{ simulation: SandboxSimulationResult; updatedIncident: SandboxIncidentResponse }>(
    `/sandbox/incidents/${id}/actions`,
    {
      method: "POST",
      body: JSON.stringify(params),
    }
  );
}

export async function reassessSandboxIncidentApi(
  id: string,
  params?: { customInstruction?: string; lastOutcomeNote?: string }
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/reassess`, {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
}

export async function escalateSandboxIncidentApi(
  id: string,
  params?: { reason?: string; operatorName?: string }
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/escalate`, {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
}

export async function executeAutonomousStepApi(
  id: string,
  params?: {
    policyConfig?: {
      maxAttempts?: number;
      allowedCapabilities?: string[];
      maxRecoverableExposure?: number;
    };
    operatorInstruction?: string;
  }
): Promise<{ incident: SandboxIncidentResponse; stepResult: AutonomousStepResult }> {
  return fetchJson<{ incident: SandboxIncidentResponse; stepResult: AutonomousStepResult }>(
    `/sandbox/incidents/${id}/autonomous-step`,
    {
      method: "POST",
      body: JSON.stringify(params || {}),
    }
  );
}

export async function runFullAutonomousLoopApi(
  id: string,
  params?: {
    policyConfig?: {
      maxAttempts?: number;
      allowedCapabilities?: string[];
      maxRecoverableExposure?: number;
    };
    operatorInstruction?: string;
  }
): Promise<{ incident: SandboxIncidentResponse; trace: AutonomousStepResult[]; finalState: string }> {
  return fetchJson<{ incident: SandboxIncidentResponse; trace: AutonomousStepResult[]; finalState: string }>(
    `/sandbox/incidents/${id}/run-loop`,
    {
      method: "POST",
      body: JSON.stringify(params || {}),
    }
  );
}

export async function markSandboxIncidentPaidApi(
  id: string,
  operatorName = "Operations Specialist"
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/mark-paid`, {
    method: "POST",
    body: JSON.stringify({ operatorName }),
  });
}

export async function customerResolveSandboxIncidentApi(
  id: string,
  paymentDetails?: { method?: string; notes?: string }
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/customer-resolve`, {
    method: "POST",
    body: JSON.stringify(paymentDetails || {}),
  });
}

export async function triggerScheduledAttemptNowApi(id: string): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/trigger-now`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelScheduledRecoveryApi(id: string, reason?: string): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>(`/sandbox/incidents/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function deleteSandboxIncidentApi(id: string): Promise<{ success: boolean; id: string }> {
  return fetchJson<{ success: boolean; id: string }>(`/sandbox/incidents/${id}`, {
    method: "DELETE",
  });
}

export async function createAndAnalyzeSandboxIncidentApi(
  input: CreateSandboxIncidentInput
): Promise<SandboxIncidentResponse> {
  return fetchJson<SandboxIncidentResponse>("/demo/incidents/create-and-analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function simulateSandboxIncidentApi(params: {
  incidentId: string;
  actionType: string;
  strategyName?: string;
  recoveryProbability?: number;
  amount: number;
}): Promise<SandboxSimulationResult> {
  return fetchJson<SandboxSimulationResult>("/demo/incidents/simulate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Recovery Demo Experience (9 Scenarios with Gemini AI & Supabase Data - Legacy compatibility)
export async function fetchDemoScenariosApi(): Promise<DemoScenarioItem[]> {
  return fetchJson<DemoScenarioItem[]>("/demo/scenarios");
}

export async function fetchDemoScenarioContextApi(
  scenarioKey: string
): Promise<{ scenario: DemoScenarioItem; customer: any; context: any }> {
  return fetchJson<{ scenario: DemoScenarioItem; customer: any; context: any }>(
    `/demo/scenarios/${scenarioKey}`
  );
}

export async function analyzeDemoScenarioApi(
  scenarioKey: string,
  customInstruction?: string
): Promise<DemoScenarioFullResponse> {
  return fetchJson<DemoScenarioFullResponse>(`/demo/scenarios/${scenarioKey}/analyze`, {
    method: "POST",
    body: JSON.stringify({ custom_instruction: customInstruction }),
  });
}

// Synthetic Telemetry Demonstration Queue APIs
export async function fetchTelemetryQueueApi(): Promise<{
  data: SyntheticTelemetryRecord[];
  summary: TelemetryQueueSummary;
}> {
  return fetchJson<{ data: SyntheticTelemetryRecord[]; summary: TelemetryQueueSummary }>("/telemetry/demo-queue");
}

export async function fetchTelemetryRecordApi(id: string): Promise<SyntheticTelemetryRecord> {
  const res = await fetchJson<{ success: boolean; data: SyntheticTelemetryRecord }>(`/telemetry/${id}`);
  return res.data;
}

export async function updateTelemetryContactApi(
  id: string,
  contact: { email?: string; phone?: string }
): Promise<SyntheticTelemetryRecord> {
  const res = await fetchJson<{ success: boolean; message: string; data: SyntheticTelemetryRecord }>(
    `/telemetry/${id}/contact`,
    {
      method: "PATCH",
      body: JSON.stringify(contact),
    }
  );
  return res.data;
}

export async function createCustomTelemetryApi(input: {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerType?: "INDIVIDUAL" | "BUSINESS";
  amount: number;
  currency?: string;
  paymentMethod: string;
  paymentRail?: string;
  events?: any[];
  sessionContext?: Record<string, any>;
  historicalContext?: Record<string, any>;
  notes?: string;
}): Promise<SyntheticTelemetryRecord> {
  const res = await fetchJson<{ success: boolean; data: SyntheticTelemetryRecord }>("/telemetry", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function analyzeTelemetryApi(id: string): Promise<{
  success: boolean;
  message: string;
  data: {
    telemetry: SyntheticTelemetryRecord;
    analysis: TelemetryAIAnalysis;
    evaluation: DetectionEvaluation;
    createdIncident: any;
  };
}> {
  return fetchJson<{
    success: boolean;
    message: string;
    data: {
      telemetry: SyntheticTelemetryRecord;
      analysis: TelemetryAIAnalysis;
      evaluation: DetectionEvaluation;
      createdIncident: any;
    };
  }>(`/telemetry/${id}/analyze`, {
    method: "POST",
  });
}

export async function resetTelemetryQueueApi(): Promise<{ success: boolean; message: string }> {
  return fetchJson<{ success: boolean; message: string }>("/telemetry/reset-queue", {
    method: "POST",
  });
}

// ----------------------------------------------------
// Human Escalations APIs
// ----------------------------------------------------

export async function fetchHumanEscalationsApi(): Promise<HumanEscalationsSummaryResponse> {
  return fetchJson<HumanEscalationsSummaryResponse>("/human-escalations");
}

export async function resolveHumanEscalationApi(
  incidentId: string,
  data: {
    resolutionType?: string;
    notes?: string;
    settlementAmount?: number;
    operatorName?: string;
  }
): Promise<{ success: boolean; message: string; incident: any }> {
  return fetchJson<{ success: boolean; message: string; incident: any }>(`/human-escalations/${incidentId}/resolve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function takeOwnershipOfHumanEscalationApi(
  incidentId: string,
  operatorName?: string
): Promise<{ success: boolean; message: string; incident: any }> {
  return fetchJson<{ success: boolean; message: string; incident: any }>(`/human-escalations/${incidentId}/take-ownership`, {
    method: "POST",
    body: JSON.stringify({ operatorName }),
  });
}

export async function addNoteToHumanEscalationApi(
  incidentId: string,
  data: {
    note: string;
    operatorName?: string;
  }
): Promise<{ success: boolean; message: string; incident: any }> {
  return fetchJson<{ success: boolean; message: string; incident: any }>(`/human-escalations/${incidentId}/notes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ----------------------------------------------------
// Channel Readiness & Diagnostics API
// ----------------------------------------------------

export async function fetchChannelReadinessApi(): Promise<{ success: boolean; data: ChannelReadinessResponse }> {
  return fetchJson<{ success: boolean; data: ChannelReadinessResponse }>("/telemetry/channel-readiness");
}

export interface DemoTestContactConfig {
  enabled: boolean;
  testEmail: string;
  testPhone: string;
  autoFormatPhone: boolean;
  notes?: string;
  updatedAt: string;
}

export async function fetchDemoTestContactApi(): Promise<{ success: boolean; data: DemoTestContactConfig }> {
  return fetchJson<{ success: boolean; data: DemoTestContactConfig }>("/provider/demo-test-contact");
}

export async function updateDemoTestContactApi(
  config: Partial<DemoTestContactConfig>
): Promise<{ success: boolean; message: string; data: DemoTestContactConfig }> {
  return fetchJson<{ success: boolean; message: string; data: DemoTestContactConfig }>("/provider/demo-test-contact", {
    method: "POST",
    body: JSON.stringify(config),
  });
}



