import { getSupabaseClient } from "./supabaseService.js";

const defaultLimit = 50;
const maxLimit = 100;

export function parseLimit(value: unknown) {
  if (value === undefined) return defaultLimit;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new Error(`limit must be an integer between 1 and ${maxLimit}`);
  }
  return limit;
}

function requireResult<T>(result: { data: T | null; error: { message: string } | null }) {
  if (result.error) throw result.error;
  return result.data;
}

export async function listCustomers(limit: number) {
  const result = await getSupabaseClient().from("customers").select("*").order("created_at", { ascending: false }).limit(limit);
  return requireResult(result) ?? [];
}

export async function getCustomer(id: string) {
  const result = await getSupabaseClient().from("customers").select("*").eq("id", id).maybeSingle();
  return requireResult(result);
}

export async function getCustomerOperations(id: string, limit: number) {
  const supabase = getSupabaseClient();
  const [customer, transactions, invoices, subscriptions, cases, events] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("transactions").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("invoices").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("subscriptions").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("recovery_cases").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("payment_events").select("*").eq("customer_id", id).order("occurred_at", { ascending: false }).limit(limit),
  ]);
  const customerRecord = requireResult(customer);
  if (!customerRecord) return null;
  return {
    customer: customerRecord,
    transactions: requireResult(transactions) ?? [],
    invoices: requireResult(invoices) ?? [],
    subscriptions: requireResult(subscriptions) ?? [],
    recoveryCases: requireResult(cases) ?? [],
    paymentEvents: requireResult(events) ?? [],
  };
}

export async function listTransactions(limit: number, status?: string) {
  let query = getSupabaseClient().from("transactions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (status) query = query.eq("status", status);
  return requireResult(await query) ?? [];
}

export async function getTransaction(id: string) {
  return requireResult(await getSupabaseClient().from("transactions").select("*").eq("id", id).maybeSingle());
}

export async function listInvoices(limit: number, status?: string) {
  let query = getSupabaseClient().from("invoices").select("*").order("due_date", { ascending: false }).limit(limit);
  if (status) query = query.eq("status", status);
  return requireResult(await query) ?? [];
}

export async function getInvoice(id: string) {
  return requireResult(await getSupabaseClient().from("invoices").select("*").eq("id", id).maybeSingle());
}

export async function listRecoveryCases(limit: number, status?: string) {
  let query = getSupabaseClient().from("recovery_cases").select("*, customers(*)").order("created_at", { ascending: false }).limit(limit);
  if (status) query = query.eq("status", status);
  return requireResult(await query) ?? [];
}

export async function getRecoveryCase(id: string) {
  const supabase = getSupabaseClient();
  const caseResult = await supabase.from("recovery_cases").select("*, customers(*)").eq("id", id).maybeSingle();
  const recoveryCase = requireResult(caseResult);
  if (!recoveryCase) return null;

  const [transaction, invoice, actions, promise, events, audit] = await Promise.all([
    recoveryCase.source_event_id
      ? supabase.from("transactions").select("*").eq("id", recoveryCase.source_event_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    recoveryCase.source_event_id
      ? supabase.from("invoices").select("*").eq("id", recoveryCase.source_event_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("recovery_actions").select("*").eq("recovery_case_id", id).order("created_at", { ascending: false }),
    supabase.from("promises_to_pay").select("*").eq("recovery_case_id", id).maybeSingle(),
    supabase.from("payment_events").select("*").eq("customer_id", recoveryCase.customer_id).order("occurred_at", { ascending: false }),
    supabase.from("audit_logs").select("*").eq("recovery_case_id", id).order("created_at", { ascending: false }),
  ]);

  return {
    case: recoveryCase,
    transactionContext: requireResult(transaction),
    invoiceContext: requireResult(invoice),
    actions: requireResult(actions) ?? [],
    promiseToPay: requireResult(promise),
    paymentEvents: requireResult(events) ?? [],
    auditLogs: requireResult(audit) ?? [],
  };
}

export async function listCaseActions(caseId: string, limit: number) {
  return requireResult(await getSupabaseClient().from("recovery_actions").select("*").eq("recovery_case_id", caseId).order("created_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listCasePromises(caseId: string, limit: number) {
  return requireResult(await getSupabaseClient().from("promises_to_pay").select("*").eq("recovery_case_id", caseId).order("created_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listCaseEvents(caseId: string, limit: number) {
  const supabase = getSupabaseClient();
  const caseResult = await supabase.from("recovery_cases").select("customer_id").eq("id", caseId).maybeSingle();
  if (caseResult.error) throw caseResult.error;
  if (!caseResult.data) return null;
  const recoveryCase = caseResult.data;
  return requireResult(await supabase.from("payment_events").select("*").eq("customer_id", recoveryCase.customer_id).order("occurred_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listCaseAuditLogs(caseId: string, limit: number) {
  return requireResult(await getSupabaseClient().from("audit_logs").select("*").eq("recovery_case_id", caseId).order("created_at", { ascending: false }).limit(limit)) ?? [];
}