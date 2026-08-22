import type { AuditLog, Customer, DashboardSummary, Invoice, PaymentEvent, PromiseToPay, RecoveryAction, RecoveryCase, Transaction, HealthResponse } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export async function fetchHealth(): Promise<HealthResponse> {
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }
  const response = await fetch(`${apiBaseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }
  const response = await fetch(`${apiBaseUrl}/dashboard`);
  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`);
  }
  return response.json() as Promise<DashboardSummary>;
}

async function fetchJson<T>(path: string): Promise<T> {
  if (!apiBaseUrl) throw new Error("VITE_API_BASE_URL is not configured");
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
  return response.json() as Promise<T>;
}

export const fetchCustomers = (limit = 50) => fetchJson<Customer[]>(`/customers?limit=${limit}`);
export const fetchCustomer = (id: string) => fetchJson<Customer>(`/customers/${id}`);
export const fetchCustomerOperations = (id: string, limit = 50) => fetchJson<{
  customer: Customer;
  transactions: Transaction[];
  invoices: Invoice[];
  subscriptions: unknown[];
  recoveryCases: RecoveryCase[];
  paymentEvents: PaymentEvent[];
}>(`/customers/${id}/operations?limit=${limit}`);
export const fetchTransactions = (limit = 50, status?: string) => fetchJson<Transaction[]>(`/transactions?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`);
export const fetchTransaction = (id: string) => fetchJson<Transaction>(`/transactions/${id}`);
export const fetchInvoices = (limit = 50, status?: string) => fetchJson<Invoice[]>(`/invoices?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`);
export const fetchInvoice = (id: string) => fetchJson<Invoice>(`/invoices/${id}`);
export const fetchRecoveryCases = (limit = 50, status?: string) => fetchJson<RecoveryCase[]>(`/recovery-cases?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`);
export const fetchRecoveryCase = (id: string) => fetchJson<{
  case: RecoveryCase;
  transactionContext: Transaction | null;
  invoiceContext: Invoice | null;
  actions: RecoveryAction[];
  promiseToPay: PromiseToPay | null;
  paymentEvents: PaymentEvent[];
  auditLogs: AuditLog[];
}>(`/recovery-cases/${id}`);
export const fetchRecoveryCaseActions = (id: string, limit = 50) => fetchJson<RecoveryAction[]>(`/recovery-cases/${id}/actions?limit=${limit}`);
export const fetchRecoveryCasePromises = (id: string, limit = 50) => fetchJson<PromiseToPay[]>(`/recovery-cases/${id}/promises-to-pay?limit=${limit}`);
export const fetchRecoveryCasePaymentEvents = (id: string, limit = 50) => fetchJson<PaymentEvent[]>(`/recovery-cases/${id}/payment-events?limit=${limit}`);
export const fetchRecoveryCaseAuditLogs = (id: string, limit = 50) => fetchJson<AuditLog[]>(`/recovery-cases/${id}/audit-logs?limit=${limit}`);