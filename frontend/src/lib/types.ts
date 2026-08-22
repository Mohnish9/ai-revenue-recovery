export type PageKey =
  | "dashboard"
  | "recovery"
  | "transactions"
  | "customers"
  | "agent"
  | "scenarios"
  | "analytics"
  | "audit";

export type NavItem = { key: PageKey; label: string; icon: string; section?: string };
export type MetricTone = "blue" | "orange" | "green" | "purple";
export type PlaceholderMetric = { label: string; value: string; detail: string; tone: MetricTone };

export interface HealthResponse {
  ok: boolean;
  service: string;
  environment: string;
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
}

export interface RecoveryCase {
  id: string;
  customer_id: string;
  case_type: string;
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
}

export interface RecoveryAction {
  id: string;
  recovery_case_id: string;
  action_type: string;
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
  event_type: string;
  amount: number;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  recovery_case_id: string | null;
  actor_type: "SYSTEM" | "AGENT" | "HUMAN" | "CUSTOMER";
  event: string;
  details: Record<string, unknown>;
  created_at: string;
}