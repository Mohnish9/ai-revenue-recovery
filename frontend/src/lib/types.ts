export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
}

export type PageKey =
  | "dashboard"
  | "recovery"
  | "failed-payments"
  | "transactions"
  | "invoices"
  | "subscriptions"
  | "checkout-dropoffs"
  | "mandates"
  | "customers"
  | "policy-rules"
  | "health"
  | "agent"
  | "scenarios"
  | "recovery-demo"
  | "analytics"
  | "audit";

export type NavItem = {
  key: PageKey;
  label: string;
  icon: string;
  section?: string;
  badge?: number | string;
};

export type MetricTone = "blue" | "orange" | "green" | "purple";

export interface HealthResponse {
  ok: boolean;
  service: string;
  environment: string;
  database?: {
    connected: boolean;
    mock?: boolean;
    tables?: Array<{ table: string; available: boolean; error?: string }>;
    error?: string;
  };
}

export interface DashboardSummary {
  revenueAtRisk: number;
  openRecoveryCases: number;
  recoveredThisMonth: number;
  recoveryRate: number;
  totalRecoveryCases: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  customer_type: "INDIVIDUAL" | "BUSINESS";
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "REFUNDED";
  failure_reason: string | null;
  transaction_reference: string;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Subscription {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  billing_cycle: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "PAUSED";
  next_payment_date: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Invoice {
  id: string;
  customer_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  issue_date: string;
  due_date: string;
  status: "DRAFT" | "OPEN" | "PAID" | "OVERDUE" | "VOID";
  promise_date: string | null;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface RecoveryCase {
  id: string;
  customer_id: string;
  case_type:
    | "PAYMENT_FAILED"
    | "CHECKOUT_ABANDONED"
    | "SUBSCRIPTION_FAILED"
    | "INVOICE_OVERDUE"
    | "MANDATE_FAILED"
    | "PAYMENT_METHOD_ISSUE"
    | "PAYMENT_DEGRADATION"
    | string;
  source_event_id: string | null;
  amount_at_risk: number;
  currency: string;
  reason: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "PROMISE_TO_PAY" | "RECOVERED" | "ESCALATED" | "CLOSED";
  recovery_probability: number | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  customers?: Customer;
}

export interface RecoveryAction {
  id: string;
  recovery_case_id: string;
  action_type:
    | "RETRY_PAYMENT"
    | "SEND_PAYMENT_LINK"
    | "SEND_REMINDER"
    | "REQUEST_PAYMENT_METHOD_UPDATE"
    | "SCHEDULE_RETRY"
    | "RECORD_PROMISE_TO_PAY"
    | "ESCALATE"
    | "CLOSE_CASE"
    | string;
  reason: string;
  status: "PENDING" | "EXECUTED" | "FAILED" | "CANCELLED";
  result: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface PromiseToPay {
  id: string;
  recovery_case_id: string;
  customer_id: string;
  amount: number;
  promise_date: string;
  status: "OPEN" | "KEPT" | "BROKEN" | "CANCELLED";
  created_at: string;
  updated_at: string;
}

export interface PaymentEvent {
  id: string;
  customer_id: string;
  transaction_id: string | null;
  event_type:
    | "PAYMENT_FAILED"
    | "PAYMENT_SUCCESS"
    | "CHECKOUT_ABANDONED"
    | "SUBSCRIPTION_PAYMENT_FAILED"
    | "INVOICE_OVERDUE"
    | "MANDATE_FAILED"
    | "PAYMENT_METHOD_FAILED"
    | string;
  amount: number;
  metadata: Record<string, any>;
  occurred_at: string;
  created_at: string;
  customers?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AuditLog {
  id: string;
  recovery_case_id: string | null;
  actor_type: "SYSTEM" | "AGENT" | "HUMAN" | "CUSTOMER";
  event: string;
  details: Record<string, any>;
  created_at: string;
  recovery_cases?: {
    id: string;
    case_type: string;
    amount_at_risk: number;
    status: string;
    customer_id: string;
    customers?: {
      name: string;
      email: string;
    };
  };
}

export interface AgentLog {
  id: string;
  recovery_case_id: string | null;
  event_type: string;
  message: string;
  action_type: string | null;
  timestamp: string;
  recovery_cases?: {
    id: string;
    case_type: string;
    amount_at_risk: number;
    status: string;
    customers?: {
      name: string;
      email: string;
    };
  };
}

export interface CustomerOperationsOverview {
  customer: Customer;
  transactions: Transaction[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  recoveryCases: RecoveryCase[];
  paymentEvents: PaymentEvent[];
}

export interface FullRecoveryCaseDetails {
  case: RecoveryCase;
  transactionContext: Transaction | null;
  invoiceContext: Invoice | null;
  actions: RecoveryAction[];
  promiseToPay: PromiseToPay | null;
  paymentEvents: PaymentEvent[];
  auditLogs: AuditLog[];
  agentLogs?: AgentLog[];
}

export interface AICaseAnalysis {
  summary: string;
  rootCauseAnalysis: string;
  recommendedAction: string;
  optimalTiming: string;
  recoveryProbabilityScore: number;
  expectedRecoverableRevenue?: number;
  tailoredMessageDraft: string;
  keyRiskFactors: string[];
  // Bounded Agentic Workflow Fields
  detectedRisk?: string;
  relevantEvidence?: string[];
  aiReasoning?: string;
  selectedStrategy?: string;
  strategyJustification?: string;
  auditSummary?: string;
}

export interface ScenarioSimulationResult {
  parameters: {
    retryCadence: "conservative" | "balanced" | "aggressive";
    discountIncentivePct: number;
    omnichannelEnabled: boolean;
    gracePeriodDays: number;
    openCasesCount: number;
    totalAtRisk: number;
  };
  projectedRecoveryRate: number;
  estimatedRecoveredAmount: number;
  estimatedLostAmount: number;
  discountIncentiveCost: number;
  netRecoveredRevenue: number;
  customerRetentionScore: number;
  churnRisk: string;
  comparisonAgainstBaseline: {
    baselineRecovered: number;
    revenueLift: number;
    percentageLift: number;
  };
}

export interface DemoScenarioItem {
  id: string;
  key: string;
  name: string;
  tag: string;
  category: "CARD" | "UPI" | "INVOICE" | "SUBSCRIPTION" | "CHECKOUT" | "CHURN";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  problemDetected: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  failureCode: string;
  customerLookupEmail: string;
  defaultChannel: "WHATSAPP" | "SMS" | "EMAIL";
  baselineSummary: string;
  customer?: Customer | null;
}

export interface DemoScenarioAIResult {
  problemDetected: string;
  rootCause: string;
  aiAssessment: string;
  recommendedStrategy: string;
  recommendedTiming: string;
  recoveryProbability: number;
  expectedRecoverableRevenue: number;
  reasoning: string;
  keyRiskFactors: string[];
  messages: {
    whatsapp: string;
    sms: string;
    email: {
      subject: string;
      body: string;
    };
  };
  simulatedActionOutcome?: {
    actionType: string;
    status: string;
    details: string;
  };
}

export interface DemoScenarioFullResponse {
  scenario: DemoScenarioItem;
  customer: Customer | null;
  context: {
    transactions: Transaction[];
    invoices: Invoice[];
    subscriptions: Subscription[];
    recoveryCases: RecoveryCase[];
    paymentEvents: PaymentEvent[];
  };
  analysis: DemoScenarioAIResult;
}

