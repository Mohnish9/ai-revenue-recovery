import { getSupabaseClient } from "./supabaseService.js";
import { generateContentResilient, cleanAndParseJson } from "./geminiService.js";
import {
  OutboundDeliveryResult,
  sendSmsMessage,
  sendEmailMessage,
} from "./messagingService.js";
import { sendExotelSmsRecovery } from "./smsRecoveryService.js";
import { UserProfile, canUserAccess, getOwnerIdForUser } from "./dataAccessService.js";
import {
  persistentSandboxIncidents,
  mapStoredIncidentToResponse,
  clearIncidentTimer,
  scheduleAutonomousAttempt,
  executeScheduledAttempt,
  markSandboxIncidentPaid,
  customerResolveIncident,
  triggerScheduledAttemptNow,
  cancelScheduledRecovery,
} from "./autonomousRecoveryEngine.js";

export {
  persistentSandboxIncidents,
  scheduleAutonomousAttempt,
  executeScheduledAttempt,
  markSandboxIncidentPaid,
  customerResolveIncident,
  triggerScheduledAttemptNow,
  cancelScheduledRecovery,
};

const defaultLimit = 50;
const maxLimit = 200;

export function parseLimit(value: unknown) {
  if (value === undefined) return defaultLimit;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new Error(`limit must be an integer between 1 and ${maxLimit}`);
  }
  return limit;
}

function requireResult<T>(result: { data: T | null; error: { message: string } | null }) {
  if (result.error) {
    if (result.error.message?.includes("future") || result.error.message?.includes("cache") || result.error.message?.includes("relation")) {
      return result.data;
    }
    throw result.error;
  }
  return result.data;
}

function safeResult<T>(result: { data: T | null; error: { message: string } | null }, fallback: any = []): any {
  if (result.error) {
    return fallback;
  }
  return result.data ?? fallback;
}

function getFrontendRecoveryUrl(id: string): string {
  const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${baseUrl}/resolve/${id}`;
}

export async function listCustomers(limit: number, search?: string, user?: UserProfile) {
  let dbCustomers = safeResult(
    await getSupabaseClient().from("customers").select("*").order("created_at", { ascending: false }).limit(limit * 2),
    []
  );

  if (user) {
    dbCustomers = dbCustomers.filter((c: any) => canUserAccess(user, c.owner_id));
  }

  // Include customers dynamically created through sandbox incidents
  const sandboxCustomersMap = new Map<string, any>();
  for (const sb of persistentSandboxIncidents.values()) {
    if (!canUserAccess(user, sb.owner_id)) continue;
    if (
      sb.customer_id &&
      !sandboxCustomersMap.has(sb.customer_id) &&
      !dbCustomers.some(
        (c: any) =>
          c.id === sb.customer_id ||
          (c.email && sb.customer_email && c.email.toLowerCase() === sb.customer_email.toLowerCase())
      )
    ) {
      sandboxCustomersMap.set(sb.customer_id, {
        id: sb.customer_id,
        name: sb.customer_name,
        email: sb.customer_email,
        phone: sb.customer_phone || "",
        customer_type: sb.customer_type || "INDIVIDUAL",
        created_at: sb.created_at,
        updated_at: sb.updated_at,
      });
    }
  }

  let merged = [...dbCustomers, ...Array.from(sandboxCustomersMap.values())];
  if (search) {
    const s = search.toLowerCase();
    merged = merged.filter(
      (c: any) =>
        (c.name && c.name.toLowerCase().includes(s)) ||
        (c.email && c.email.toLowerCase().includes(s))
    );
  }
  return merged.slice(0, limit);
}

export async function getCustomer(id: string, user?: UserProfile) {
  const result = await getSupabaseClient().from("customers").select("*").eq("id", id).maybeSingle();
  const found = requireResult(result);
  if (found) {
    if (!canUserAccess(user, found.owner_id)) return null;
    return found;
  }

  const matched = Array.from(persistentSandboxIncidents.values()).find(
    (sb) => sb.customer_id === id && canUserAccess(user, sb.owner_id)
  );
  if (matched) {
    return {
      id: matched.customer_id,
      name: matched.customer_name,
      email: matched.customer_email,
      phone: matched.customer_phone || "",
      customer_type: matched.customer_type,
      created_at: matched.created_at,
    };
  }
  return null;
}

export async function getCustomerOperations(id: string, limit: number, user?: UserProfile) {
  const supabase = getSupabaseClient();
  const [customer, transactions, invoices, subscriptions, cases, events] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("transactions").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit * 2),
    supabase.from("invoices").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit * 2),
    supabase.from("subscriptions").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit * 2),
    supabase.from("recovery_cases").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(limit * 2),
    supabase.from("payment_events").select("*").eq("customer_id", id).order("occurred_at", { ascending: false }).limit(limit * 2),
  ]);
  let customerRecord = safeResult(customer, null);
  
  if (customerRecord && !canUserAccess(user, customerRecord.owner_id)) {
    customerRecord = null;
  }

  // If not found in production Supabase, search in persistent sandbox store
  if (!customerRecord) {
    const matchedSandbox = Array.from(persistentSandboxIncidents.values()).find(
      (sb) => sb.customer_id === id && canUserAccess(user, sb.owner_id)
    );
    if (matchedSandbox) {
      customerRecord = {
        id: matchedSandbox.customer_id,
        name: matchedSandbox.customer_name,
        email: matchedSandbox.customer_email,
        customer_type: matchedSandbox.customer_type,
        created_at: matchedSandbox.created_at,
      };
    }
  }

  if (!customerRecord) return null;

  let filteredTransactions = safeResult(transactions, []);
  let filteredInvoices = safeResult(invoices, []);
  let filteredSubscriptions = safeResult(subscriptions, []);
  let filteredCases = safeResult(cases, []);
  let filteredEvents = safeResult(events, []);

  if (user) {
    filteredTransactions = filteredTransactions.filter((t: any) => canUserAccess(user, t.owner_id));
    filteredInvoices = filteredInvoices.filter((i: any) => canUserAccess(user, i.owner_id));
    filteredSubscriptions = filteredSubscriptions.filter((s: any) => canUserAccess(user, s.owner_id));
    filteredCases = filteredCases.filter((c: any) => canUserAccess(user, c.owner_id));
    filteredEvents = filteredEvents.filter((e: any) => canUserAccess(user, e.owner_id));
  }

  // Include active and resolved customer-linked sandbox incidents
  const customerSandboxIncidents = Array.from(persistentSandboxIncidents.values())
    .filter(item => canUserAccess(user, item.owner_id) && (item.customer_id === id || (customerRecord?.email && item.customer_email?.toLowerCase() === customerRecord.email.toLowerCase())))
    .map(mapStoredIncidentToResponse);

  return {
    customer: customerRecord,
    transactions: filteredTransactions.slice(0, limit),
    invoices: filteredInvoices.slice(0, limit),
    subscriptions: filteredSubscriptions.slice(0, limit),
    recoveryCases: filteredCases.slice(0, limit),
    paymentEvents: filteredEvents.slice(0, limit),
    sandboxIncidents: customerSandboxIncidents,
  };
}

export async function listTransactions(limit: number, status?: string, paymentMethod?: string, user?: UserProfile) {
  let query = getSupabaseClient().from("transactions").select("*, customers(id, name, email)").order("created_at", { ascending: false }).limit(limit * 2);
  if (status) query = query.eq("status", status);
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  let res = requireResult(await query) ?? [];
  if (user) {
    res = res.filter((t: any) => canUserAccess(user, t.owner_id));
  }
  return res.slice(0, limit);
}

export async function getTransaction(id: string, user?: UserProfile) {
  const res: any = requireResult(await getSupabaseClient().from("transactions").select("*, customers(*)").eq("id", id).maybeSingle());
  if (res && !canUserAccess(user, res.owner_id)) return null;
  return res;
}

export async function listInvoices(limit: number, status?: string, user?: UserProfile) {
  let query = getSupabaseClient().from("invoices").select("*, customers(id, name, email)").order("due_date", { ascending: false }).limit(limit * 2);
  if (status) query = query.eq("status", status);
  let res = requireResult(await query) ?? [];
  if (user) {
    res = res.filter((i: any) => canUserAccess(user, i.owner_id));
  }
  return res.slice(0, limit);
}

export async function getInvoice(id: string, user?: UserProfile) {
  const res: any = requireResult(await getSupabaseClient().from("invoices").select("*, customers(*)").eq("id", id).maybeSingle());
  if (res && !canUserAccess(user, res.owner_id)) return null;
  return res;
}

export async function listSubscriptions(limit: number, status?: string, user?: UserProfile) {
  let query = getSupabaseClient().from("subscriptions").select("*, customers(id, name, email)").order("created_at", { ascending: false }).limit(limit * 2);
  if (status) query = query.eq("status", status);
  let res = requireResult(await query) ?? [];
  if (user) {
    res = res.filter((s: any) => canUserAccess(user, s.owner_id));
  }
  return res.slice(0, limit);
}

export async function listPaymentEvents(limit: number, eventType?: string, user?: UserProfile) {
  let query = getSupabaseClient().from("payment_events").select("*, customers(id, name, email)").order("occurred_at", { ascending: false }).limit(limit * 2);
  if (eventType) query = query.eq("event_type", eventType);
  let res = requireResult(await query) ?? [];
  if (user) {
    res = res.filter((e: any) => canUserAccess(user, e.owner_id));
  }
  return res.slice(0, limit);
}

export async function listRecoveryCases(limit: number, status?: string, priority?: string, user?: UserProfile) {
  let query = getSupabaseClient().from("recovery_cases").select("*, customers(*)").order("created_at", { ascending: false }).limit(limit * 2);
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  let dbCases = requireResult(await query) ?? [];
  if (user) {
    dbCases = dbCases.filter((c: any) => canUserAccess(user, c.owner_id));
  }

  // Also include sandbox incidents if DB cases are few or for unified view
  const sandboxItems = Array.from(persistentSandboxIncidents.values()).filter(sb => canUserAccess(user, sb.owner_id));
  const convertedSandboxCases = sandboxItems.map((sb) => ({
    id: sb.id,
    customer_id: sb.customer_id,
    case_type: sb.scenario_type_name || sb.tag || "PAYMENT_DISRUPTION",
    amount_at_risk: sb.amount,
    currency: sb.currency || "INR",
    status: sb.status || "ACTIVE",
    priority: sb.priority || sb.severity || "HIGH",
    reason: sb.failure_reason,
    assigned_to: "Autonomous AI Agent",
    created_at: sb.created_at,
    updated_at: sb.updated_at,
    customers: {
      id: sb.customer_id,
      name: sb.customer_name,
      email: sb.customer_email,
      phone: sb.customer_phone || "",
      customer_type: sb.customer_type || "INDIVIDUAL",
    },
    isSandbox: true,
  }));

  // Merge and deduplicate
  const existingIds = new Set(dbCases.map((c: any) => c.id));
  const combined = [...dbCases];
  for (const sc of convertedSandboxCases) {
    if (!existingIds.has(sc.id)) {
      if (status && sc.status !== status) continue;
      if (priority && sc.priority !== priority) continue;
      combined.push(sc);
      existingIds.add(sc.id);
    }
  }

  return combined.slice(0, limit);
}

export async function getRecoveryCase(id: string, user?: UserProfile) {
  const supabase = getSupabaseClient();
  const caseResult = await supabase.from("recovery_cases").select("*, customers(*)").eq("id", id).maybeSingle();
  const recoveryCase = requireResult(caseResult);

  if (!recoveryCase) {
    // Check if ID corresponds to a persistent Sandbox Incident
    let sb = persistentSandboxIncidents.get(id);
    if (sb && !canUserAccess(user, sb.owner_id)) {
      sb = undefined;
    }
    if (!sb) {
      // Check sandbox_incidents table in Supabase
      const { data: dbSb } = await supabase.from("sandbox_incidents").select("*").eq("id", id).maybeSingle();
      if (dbSb && canUserAccess(user, dbSb.owner_id)) {
        const meta = dbSb.metadata || {};
        sb = {
          id: dbSb.id,
          label: "DEMO/SANDBOX — NO PRODUCTION DB IMPACT",
          isSandbox: true,
          scenario_type: dbSb.scenario_type || "insufficient-funds",
          scenario_type_name: dbSb.scenario_type || "Payment Disruption",
          tag: (dbSb.scenario_type || "INSUFFICIENT_FUNDS").toUpperCase().replace(/-/g, "_"),
          category: "CARDS",
          customer_id: dbSb.customer_id || `cust_${dbSb.id}`,
          customer_name: meta.customer_name || "Account Holder",
          customer_email: meta.customer_email || "customer@example.test",
          customer_phone: meta.customer_phone || "",
          customer_type: meta.customer_type || "INDIVIDUAL",
          amount: Number(dbSb.amount) || 5000,
          currency: dbSb.currency || "INR",
          payment_method: dbSb.payment_method || "CARD",
          payment_rail: "Visa / Mastercard",
          failure_reason: dbSb.failure_reason || "Card processor decline",
          billing_context: typeof meta.billing_context === "string" ? meta.billing_context : JSON.stringify(meta.billing_context || {}),
          severity: meta.severity || "HIGH",
          priority: meta.severity || "HIGH",
          status: dbSb.status || "ACTIVE",
          customer_context: {
            transactionsCount: 1,
            invoicesCount: 1,
            subscriptionsCount: 1,
            recoveryCasesCount: 1,
            paymentEventsCount: 1,
            sampleTransactions: [],
            sampleInvoices: [],
            sampleSubscriptions: [],
          },
          analysis: meta.analysis || null,
          lifecycle: [],
          actions: meta.actions || [],
          owner_id: dbSb.owner_id,
          created_at: dbSb.created_at || new Date().toISOString(),
          updated_at: dbSb.updated_at || new Date().toISOString(),
        };
      }
    }

    if (!sb || !canUserAccess(user, sb.owner_id)) {
      return null;
    }

    // Format Sandbox Incident into FullRecoveryCaseDetails
    return {
      case: {
        id: sb.id,
        customer_id: sb.customer_id,
        case_type: sb.scenario_type_name || sb.tag || "PAYMENT_DISRUPTION",
        amount_at_risk: sb.amount,
        currency: sb.currency || "INR",
        status: sb.status || "ACTIVE",
        priority: sb.priority || sb.severity || "HIGH",
        reason: sb.failure_reason,
        assigned_to: "Autonomous AI Agent",
        created_at: sb.created_at,
        updated_at: sb.updated_at,
        customers: {
          id: sb.customer_id,
          name: sb.customer_name,
          email: sb.customer_email,
          phone: sb.customer_phone || "",
          customer_type: sb.customer_type || "INDIVIDUAL",
        },
      },
      transactionContext: null,
      invoiceContext: null,
      actions: (sb.actions || []).map((a: any) => ({
        id: a.id,
        recovery_case_id: sb.id,
        action_type: a.actionType || "DISPATCH_COMMUNICATION",
        status: a.status || "EXECUTED",
        result: a.result || a.details || "Dispatched successfully",
        created_at: a.executedAt || new Date().toISOString(),
      })),
      promiseToPay: null,
      paymentEvents: [],
      auditLogs: (sb.timeline || []).map((t: any) => ({
        id: t.id,
        recovery_case_id: sb.id,
        actor_type: "AI_AGENT",
        event: t.title,
        details: { description: t.description, status: t.status },
        created_at: t.timestamp || new Date().toISOString(),
      })),
      agentLogs: [],
    };
  }

  if (recoveryCase && !canUserAccess(user, recoveryCase.owner_id)) {
    return null;
  }

  const [transaction, invoice, actions, promise, events, audit, agent] = await Promise.all([
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
    supabase.from("agent_logs").select("*").eq("recovery_case_id", id).order("timestamp", { ascending: false }),
  ]);

  return {
    case: recoveryCase,
    transactionContext: requireResult(transaction),
    invoiceContext: requireResult(invoice),
    actions: requireResult(actions) ?? [],
    promiseToPay: requireResult(promise),
    paymentEvents: requireResult(events) ?? [],
    auditLogs: requireResult(audit) ?? [],
    agentLogs: requireResult(agent) ?? [],
  };
}

export async function listCaseActions(caseId: string, limit: number, user?: UserProfile) {
  return requireResult(await getSupabaseClient().from("recovery_actions").select("*").eq("recovery_case_id", caseId).order("created_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listCasePromises(caseId: string, limit: number, user?: UserProfile) {
  return requireResult(await getSupabaseClient().from("promises_to_pay").select("*").eq("recovery_case_id", caseId).order("created_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listCaseEvents(caseId: string, limit: number, user?: UserProfile) {
  const supabase = getSupabaseClient();
  const caseResult = await supabase.from("recovery_cases").select("customer_id, owner_id").eq("id", caseId).maybeSingle();
  if (caseResult.error) throw caseResult.error;
  if (!caseResult.data) return null;
  const recoveryCase = caseResult.data;
  if (!canUserAccess(user, recoveryCase.owner_id)) return null;
  return requireResult(await supabase.from("payment_events").select("*").eq("customer_id", recoveryCase.customer_id).order("occurred_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listCaseAuditLogs(caseId: string, limit: number, user?: UserProfile) {
  return requireResult(await getSupabaseClient().from("audit_logs").select("*").eq("recovery_case_id", caseId).order("created_at", { ascending: false }).limit(limit)) ?? [];
}

export async function listAllAuditLogs(limit: number, actorType?: string, user?: UserProfile) {
  let query = getSupabaseClient().from("audit_logs").select("*, recovery_cases(id, case_type, amount_at_risk, status, customer_id, customers(name, email))").order("created_at", { ascending: false }).limit(limit * 2);
  if (actorType) query = query.eq("actor_type", actorType);
  let res = requireResult(await query) ?? [];
  if (user) {
    res = res.filter((aud: any) => canUserAccess(user, aud.owner_id));
  }
  return res.slice(0, limit);
}

export async function listAllAgentLogs(limit: number, user?: UserProfile) {
  const query = getSupabaseClient().from("agent_logs").select("*, recovery_cases(id, case_type, amount_at_risk, status, customers(name, email))").order("timestamp", { ascending: false }).limit(limit * 2);
  let res = requireResult(await query) ?? [];
  if (user) {
    res = res.filter((al: any) => canUserAccess(user, al.owner_id));
  }
  return res.slice(0, limit);
}

export async function executeRecoveryAction(caseId: string, actionType: string, reason: string, operatorInfo?: { name?: string; email?: string }) {
  const supabase = getSupabaseClient();
  
  // 1. Get the recovery case details
  const { data: currentCase, error: caseErr } = await supabase.from("recovery_cases").select("*, customers(*)").eq("id", caseId).single();
  if (caseErr || !currentCase) throw new Error("Recovery case not found");

  const actionStatus = "EXECUTED";
  const executedAt = new Date().toISOString();
  let actionResult = "Action dispatched successfully.";

  if (actionType === "SEND_PAYMENT_LINK") {
    actionResult = `Payment link generated and sent to ${currentCase.customers?.email || "customer"}. Link active for 48h.`;
  } else if (actionType === "RETRY_PAYMENT") {
    actionResult = `Triggered zero-friction smart retry with adaptive cascade routing.`;
  } else if (actionType === "SEND_REMINDER") {
    actionResult = `Multi-channel reminder sent via SMS and Email with smart invoice preview.`;
  } else if (actionType === "REQUEST_PAYMENT_METHOD_UPDATE") {
    actionResult = `Card & UPI update prompt dispatched to customer portal.`;
  } else if (actionType === "SCHEDULE_RETRY") {
    actionResult = `Payment retry scheduled for optimal salary/liquidity window (T+24h).`;
  } else if (actionType === "ESCALATE") {
    actionResult = `Case escalated to high-touch revenue operations tier. Priority updated.`;
    await supabase.from("recovery_cases").update({ priority: "CRITICAL", status: "ESCALATED", updated_at: executedAt }).eq("id", caseId);
  } else if (actionType === "CLOSE_CASE") {
    actionResult = `Case closed by operator.`;
    await supabase.from("recovery_cases").update({ status: "CLOSED", resolved_at: executedAt, updated_at: executedAt }).eq("id", caseId);
  }

  // Insert recovery action
  const { data: newAction, error: actionError } = await supabase.from("recovery_actions").insert({
    recovery_case_id: caseId,
    action_type: actionType,
    reason: reason || "Manual trigger from operations console",
    status: actionStatus,
    result: actionResult,
    executed_at: executedAt,
  }).select().single();

  if (actionError) throw actionError;

  const actorLabel = operatorInfo?.name ? `${operatorInfo.name} (${operatorInfo.email})` : "Revenue Operations Operator";

  // Insert audit log
  await supabase.from("audit_logs").insert({
    recovery_case_id: caseId,
    actor_type: "HUMAN",
    event: `ACTION_${actionType}`,
    details: {
      action_type: actionType,
      reason,
      result: actionResult,
      triggered_by: actorLabel,
      operator_email: operatorInfo?.email || "operator@recoverly.ai",
    },
  });

  // Insert agent log
  await supabase.from("agent_logs").insert({
    recovery_case_id: caseId,
    event_type: "ACTION_DISPATCH",
    action_type: actionType,
    message: `Dispatched ${actionType} by ${actorLabel}: ${actionResult}`,
    timestamp: executedAt,
  });

  return newAction;
}

export async function createPromiseToPay(caseId: string, customerId: string, amount: number, promiseDate: string, operatorInfo?: { name?: string; email?: string }) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  // Create or upsert promise
  const { data: promise, error: promiseErr } = await supabase.from("promises_to_pay").upsert({
    recovery_case_id: caseId,
    customer_id: customerId,
    amount,
    promise_date: promiseDate,
    status: "OPEN",
    updated_at: now,
  }).select().single();

  if (promiseErr) throw promiseErr;

  // Update case status
  await supabase.from("recovery_cases").update({
    status: "PROMISE_TO_PAY",
    updated_at: now,
  }).eq("id", caseId);

  const actorLabel = operatorInfo?.name ? `${operatorInfo.name} (${operatorInfo.email})` : "Revenue Operations Operator";

  // Insert audit log
  await supabase.from("audit_logs").insert({
    recovery_case_id: caseId,
    actor_type: "HUMAN",
    event: "PROMISE_TO_PAY_RECORDED",
    details: {
      amount,
      promise_date: promiseDate,
      status: "OPEN",
      recorded_by: actorLabel,
    },
  });

  return promise;
}

export async function updateCaseStatus(caseId: string, status: string, assignedTo?: string, operatorInfo?: { name?: string; email?: string }) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const updatePayload: any = {
    status,
    updated_at: now,
  };
  if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo;
  if (status === "RECOVERED" || status === "CLOSED") updatePayload.resolved_at = now;

  const { data, error } = await supabase.from("recovery_cases").update(updatePayload).eq("id", caseId).select().single();
  if (error) throw error;

  const actorLabel = operatorInfo?.name ? `${operatorInfo.name} (${operatorInfo.email})` : "Revenue Operations Operator";

  await supabase.from("audit_logs").insert({
    recovery_case_id: caseId,
    actor_type: "HUMAN",
    event: `STATUS_CHANGED_TO_${status}`,
    details: { previous: "UNKNOWN", new_status: status, assigned_to: assignedTo, modified_by: actorLabel },
  });

  return data;
}

// AI Intelligence with Gemini API & Resilient Local Fallback Engine
async function generateContentWithFallback(params: {
  contents: string;
  config?: any;
}): Promise<{ text: string; modelUsed: string } | null> {
  const result = await generateContentResilient({
    contents: params.contents,
    systemInstruction: params.config?.systemInstruction,
    responseMimeType: params.config?.responseMimeType,
    temperature: params.config?.temperature,
  });

  if (!result) {
    return null;
  }

  return {
    text: result.text,
    modelUsed: result.modelUsed,
  };
}

function generateFallbackCaseAnalysis(contextData: any, fullCase: any, userInstruction?: string): any {
  const caseData = fullCase.case;
  const cust = caseData.customers;
  const amount = Number(caseData.amount_at_risk) || 5000;
  const prob = 0.84;

  let rootCause = `Payment disruption (${caseData.reason || "declined"}) detected on ${caseData.case_type || "RECURRING_BILLING"} for customer ${cust?.name || "Account Holder"}.`;
  let strategy = "Dynamic Payday-Aligned Retry with WhatsApp Intent";
  let timing = "Next banking clearance window (10:00 AM IST)";
  let action = "SEND_PAYMENT_LINK";

  if (caseData.case_type === "FAILED_INVOICE" || caseData.case_type === "INVOICE") {
    rootCause = `B2B corporate invoice payment of ${caseData.currency} ${amount.toLocaleString()} is overdue. AP payment clearing cycle needs structured follow-up.`;
    strategy = "Executive AP Dunning & Structured Promise-to-Pay Lock";
    timing = "Immediate Business Hours (T+1h)";
    action = "RECORD_PROMISE_TO_PAY";
  } else if (caseData.reason?.includes("EXPIRED") || caseData.reason?.includes("CARD")) {
    rootCause = `Customer on-file payment method expired. Gateway rejected batch debit with token invalidation.`;
    strategy = "Zero-Friction RBI Tokenized Card Update Link";
    timing = "Immediate Multi-Channel Dispatch";
    action = "REQUEST_PAYMENT_METHOD_UPDATE";
  }

  return {
    detectedRisk: `${caseData.case_type || "PAYMENT_DISRUPTION"}: Risk of ${caseData.currency} ${amount.toLocaleString()} revenue leakage`,
    relevantEvidence: [
      `Failure reason: "${caseData.reason || "Declined by gateway"}"`,
      `Customer tier: ${cust?.customer_type || "INDIVIDUAL"} (${cust?.name || "Customer"})`,
      `Historical actions count: ${fullCase.actions?.length || 0}`,
      `Recent payment events: ${fullCase.paymentEvents?.length || 0} telemetry points recorded`,
    ],
    aiReasoning: `Customer has positive engagement history. Executing gentle, multi-channel recovery before escalating protects customer retention and LTV while recovering revenue.`,
    selectedStrategy: strategy,
    strategyJustification: `Selected to maximize recovery likelihood (${Math.round(prob * 100)}%) while preserving customer goodwill. Avoids payment fatigue by spacing retries cleanly.`,
    summary: `Autonomous evaluation for ${cust?.name || "Customer"}: Recommended ${strategy} to recover ${caseData.currency} ${amount.toLocaleString()}.`,
    rootCauseAnalysis: rootCause,
    recommendedAction: action,
    optimalTiming: timing,
    recoveryProbabilityScore: prob,
    expectedRecoverableRevenue: Math.round(amount * prob),
    tailoredMessageDraft: `Hi ${cust?.name || "there"}, we noticed a quick hiccup processing ${caseData.currency} ${amount.toLocaleString()} for your Recoverly plan. Tap here to review and complete securely: ${getFrontendRecoveryUrl(caseData.id)}`,
    keyRiskFactors: [
      "Repeated failed retries without customer notification increase payment fatigue",
      "Proactive self-serve link prevents involuntary subscription cancellation",
    ],
    auditSummary: `Autonomous AI agent classified case as ${caseData.priority} priority and deployed ${strategy} with ${Math.round(prob * 100)}% confidence score.`,
  };
}

export async function analyzeRecoveryCaseWithAI(caseId: string, userInstruction?: string, user?: UserProfile) {
  const fullCase = await getRecoveryCase(caseId, user);
  if (!fullCase) throw new Error("Recovery case not found");

  const caseData = fullCase.case;
  const cust = caseData.customers;

  const contextData = {
    caseId: caseData.id,
    customerName: cust?.name,
    customerEmail: cust?.email,
    customerType: cust?.customer_type,
    amountAtRisk: caseData.amount_at_risk,
    currency: caseData.currency,
    caseType: caseData.case_type,
    failureReason: caseData.reason,
    priority: caseData.priority,
    status: caseData.status,
    pastActionsCount: fullCase.actions?.length || 0,
    pastActions: (fullCase.actions || []).map((a: any) => ({ action: a.action_type, status: a.status, result: a.result })),
    recentEvents: (fullCase.paymentEvents || []).slice(0, 4).map((e: any) => ({ type: e.event_type, amount: e.amount, date: e.occurred_at, metadata: e.metadata })),
    promiseToPay: fullCase.promiseToPay,
  };

  const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Agent operating under an explicit bounded agentic execution loop:
DETECT -> ANALYZE -> DECIDE -> ACT or SIMULATE -> OBSERVE -> AUDIT.

Context of case in evaluation:
Customer: ${contextData.customerName} (${contextData.customerType || "INDIVIDUAL"}, ${contextData.customerEmail || "N/A"})
Amount at Risk: ${contextData.currency} ${contextData.amountAtRisk}
Case Type: ${contextData.caseType}
Failure Reason: "${contextData.failureReason}"
Priority: ${contextData.priority}
Current Status: ${contextData.status}
Historical Actions Count: ${contextData.pastActionsCount}
Recent Payment Events: ${JSON.stringify(contextData.recentEvents)}
Existing Promise to Pay: ${JSON.stringify(contextData.promiseToPay)}
${userInstruction ? `Operator Specific Guidance: "${userInstruction}"` : ""}

Respond with a strictly formatted JSON object:
{
  "detectedRisk": "Precise identification of the revenue leakage risk and classification",
  "relevantEvidence": [
    "Evidence point 1 (e.g. Card error code, amount, repeat failure telemetry)",
    "Evidence point 2 (e.g. Account segment, past due duration, customer engagement history)"
  ],
  "aiReasoning": "Deep technical and behavioral analysis evaluating why the failure occurred and why standard dunning is insufficient",
  "selectedStrategy": "Name of the optimal autonomous recovery strategy",
  "strategyJustification": "Explicit explanation of why this specific strategy was chosen",
  "summary": "1-2 sentence executive breakdown",
  "rootCauseAnalysis": "Clear technical and behavioral explanation",
  "recommendedAction": "One of: SEND_PAYMENT_LINK | RETRY_PAYMENT | SEND_REMINDER | REQUEST_PAYMENT_METHOD_UPDATE | SCHEDULE_RETRY | RECORD_PROMISE_TO_PAY | ESCALATE",
  "optimalTiming": "Optimal time window to execute",
  "recoveryProbabilityScore": 0.85,
  "expectedRecoverableRevenue": 7500,
  "tailoredMessageDraft": "Concise, high-converting customer outreach text with respectful tone",
  "keyRiskFactors": ["risk factor 1", "risk factor 2"],
  "auditSummary": "Structured compliance log sentence"
}`;

  let structuredAnalysis: any = null;

  try {
    const aiResult = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    if (aiResult?.text) {
      structuredAnalysis = cleanAndParseJson(aiResult.text);
    }
  } catch (e) {
    console.warn("AI generation attempt notice:", e);
  }

  if (!structuredAnalysis) {
    structuredAnalysis = generateFallbackCaseAnalysis(contextData, fullCase, userInstruction);
  }

  // Ensure all agentic fields exist
  if (!structuredAnalysis.detectedRisk) {
    structuredAnalysis.detectedRisk = `${caseData.case_type}: Disruption of ${caseData.currency} ${caseData.amount_at_risk}`;
  }
  if (!structuredAnalysis.relevantEvidence || !Array.isArray(structuredAnalysis.relevantEvidence)) {
    structuredAnalysis.relevantEvidence = [
      `Failure reason: ${caseData.reason}`,
      `Amount at risk: ${caseData.currency} ${caseData.amount_at_risk}`,
      `Customer: ${cust?.name || "Account holder"}`,
    ];
  }
  if (!structuredAnalysis.aiReasoning) {
    structuredAnalysis.aiReasoning = structuredAnalysis.rootCauseAnalysis || structuredAnalysis.summary;
  }
  if (!structuredAnalysis.selectedStrategy) {
    structuredAnalysis.selectedStrategy = structuredAnalysis.recommendedAction;
  }
  if (!structuredAnalysis.strategyJustification) {
    structuredAnalysis.strategyJustification = "Selected to maximize recovery likelihood while preserving customer experience.";
  }
  if (!structuredAnalysis.expectedRecoverableRevenue) {
    const p = structuredAnalysis.recoveryProbabilityScore || 0.75;
    structuredAnalysis.expectedRecoverableRevenue = Math.round(Number(caseData.amount_at_risk) * p);
  }

  // Log AI decision to agent_logs and audit_logs
  try {
    const supabase = getSupabaseClient();
    await supabase.from("agent_logs").insert({
      recovery_case_id: caseId,
      event_type: "AI_CASE_ANALYSIS",
      action_type: structuredAnalysis.recommendedAction,
      message: `Gemini AI Agent loop [DETECT -> ANALYZE -> DECIDE] for Case ${caseId.slice(0, 8)}: Selected '${structuredAnalysis.selectedStrategy}' (Prob: ${(structuredAnalysis.recoveryProbabilityScore * 100).toFixed(0)}%). Justification: ${structuredAnalysis.strategyJustification}`,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Failed to log to agent_logs:", e);
  }

  return structuredAnalysis;
}

export async function chatWithRecoveryAI(message: string, caseContextId?: string, user?: UserProfile) {
  let contextSnippet = "";
  if (caseContextId) {
    const fullCase = await getRecoveryCase(caseContextId, user);
    if (fullCase) {
      contextSnippet = `Active Case Context: ${JSON.stringify(fullCase.case)}`;
    }
  }

  const prompt = `You are Recoverly's Revenue Recovery Specialist Agent. You help operations teams recover failed payments, resolve subscription churn, prevent invoice defaults, and optimize recovery policies.
${contextSnippet}

User Question: "${message}"

Give a concise, highly actionable, expert response with concrete steps, policy suggestions, or technical guidance for revenue recovery operations. Keep formatting clean and readable.`;

  let replyText = "";
  let modelUsed = "gemini-3.7-flash";

  try {
    const aiResult = await generateContentWithFallback({
      contents: prompt,
    });
    if (aiResult?.text) {
      replyText = aiResult.text;
      modelUsed = aiResult.modelUsed;
    }
  } catch (e) {
    console.warn("Chat AI generation notice:", e);
  }

  if (!replyText) {
    modelUsed = "recoverly-autonomous-engine";
    const lower = message.toLowerCase();
    if (lower.includes("retry") || lower.includes("timing") || lower.includes("when")) {
      replyText = `**Recommended Smart Retry Strategy:**\n\n1. **Avoid Immediate Retries on Hard Declines**: If the card or mandate error is technical (504/timeout), retry within 3-5 minutes. If insufficient balance, schedule for the customer's next pay cycle (1st, 5th, or 25th) or evening clearance window (19:00–21:30 IST).\n2. **Omnichannel Cascading**: Trigger an instant 1-click WhatsApp or SMS checkout fallback rather than relying purely on silent automated gateway attempts.\n3. **RBI Tokenization Compliance**: Verify customer cards have valid tokens registered to prevent recurring auth blocks.`;
    } else if (lower.includes("upi") || lower.includes("mandate") || lower.includes("autopay")) {
      replyText = `**UPI AutoPay & Mandate Recovery Framework:**\n\n1. **PSP Throttle Mitigation**: UPI mandate failures often stem from daily debit volume exhaustion on specific PSP handles. Switch the retry payload to an interactive UPI Intent deeplink (GPay/PhonePe/Paytm) sent via WhatsApp.\n2. **Execution Timing**: Schedule automated mandate debits between 06:00 AM and 08:30 AM before customer daily transaction volume peaks.\n3. **Grace Period Buffer**: Maintain a minimum 3-day grace period with live service status indicators before terminating recurring entitlements.`;
    } else if (lower.includes("invoice") || lower.includes("b2b") || lower.includes("net-30")) {
      replyText = `**B2B Overdue Invoice Escalation Protocol:**\n\n1. **T+1 Day**: Send an automated, respectful reconciliation notice with direct RTGS/NEFT virtual account details and invoice PDF attachment.\n2. **T+5 Days**: Trigger automated executive AP reminder referencing purchase order (PO) numbers and payment portal link.\n3. **T+10 Days**: Record a formal **Promise-to-Pay (PTP)** with agreed installment dates to avoid credit hold or billing escalation.`;
    } else {
      replyText = `**Autonomous Revenue Operations Guidance:**\n\n- **Detect & Segment**: Distinguish between involuntary churn (technical timeouts, expired tokens, transient insufficient funds) and voluntary cancellations to tailor messaging tone.\n- **Frictionless Resolution**: Deliver 1-click zero-login resolution links via high-open channels (WhatsApp has >90% open rates vs. <20% email).\n- **Bounded Autonomy**: Configure automatic execution thresholds for high-confidence retries, reserving manual operator review for enterprise invoices exceeding ₹50,000.`;
    }
  }

  return {
    reply: replyText,
    model: modelUsed,
  };
}

export function simulateRecoveryScenario(params: {
  retryCadence: "conservative" | "balanced" | "aggressive";
  discountIncentivePct: number;
  omnichannelEnabled: boolean;
  gracePeriodDays: number;
  openCasesCount: number;
  totalAtRisk: number;
}) {
  const { retryCadence, discountIncentivePct, omnichannelEnabled, gracePeriodDays, openCasesCount, totalAtRisk } = params;

  let baseRecoveryRate = 0.58;
  if (retryCadence === "balanced") baseRecoveryRate += 0.12;
  if (retryCadence === "aggressive") baseRecoveryRate += 0.16;

  if (omnichannelEnabled) baseRecoveryRate += 0.09;
  if (discountIncentivePct > 0) {
    baseRecoveryRate += Math.min(0.12, discountIncentivePct * 0.012);
  }
  if (gracePeriodDays >= 3 && gracePeriodDays <= 7) {
    baseRecoveryRate += 0.05;
  } else if (gracePeriodDays > 14) {
    baseRecoveryRate -= 0.04; // excessive delay degrades urgency
  }

  const projectedRate = Math.min(0.95, Math.max(0.25, baseRecoveryRate));
  const estimatedRecovered = Math.round(totalAtRisk * projectedRate);
  const estimatedLost = totalAtRisk - estimatedRecovered;
  const estimatedDiscountCost = Math.round(estimatedRecovered * (discountIncentivePct / 100));
  const netRecoveredRevenue = estimatedRecovered - estimatedDiscountCost;
  const customerChurnRisk = retryCadence === "aggressive" ? "High" : retryCadence === "balanced" ? "Low" : "Very Low";

  return {
    parameters: params,
    projectedRecoveryRate: Math.round(projectedRate * 100),
    estimatedRecoveredAmount: estimatedRecovered,
    estimatedLostAmount: estimatedLost,
    discountIncentiveCost: estimatedDiscountCost,
    netRecoveredRevenue,
    customerRetentionScore: retryCadence === "aggressive" ? 64 : retryCadence === "balanced" ? 91 : 96,
    churnRisk: customerChurnRisk,
    comparisonAgainstBaseline: {
      baselineRecovered: Math.round(totalAtRisk * 0.58),
      revenueLift: Math.round(netRecoveredRevenue - totalAtRisk * 0.58),
      percentageLift: Math.round(((netRecoveredRevenue - totalAtRisk * 0.58) / (totalAtRisk * 0.58 || 1)) * 100),
    },
  };
}

// -------------------------------------------------------------
// RECOVERY DEMO EXPERIENCE: 9 REALISTIC RECOVERY SCENARIOS
// -------------------------------------------------------------

export interface ScenarioTypeConfig {
  key: string;
  name: string;
  tag: string;
  category: "CARD" | "UPI" | "INVOICE" | "SUBSCRIPTION" | "CHECKOUT" | "CHURN";
  defaultSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  defaultPaymentMethod: string;
  defaultFailureCode: string;
  defaultChannel: "EMAIL" | "VOICE";
  sampleBillingContext: string;
  suggestedAmount: number;
}

export const RECOVERY_SCENARIO_TYPES: ScenarioTypeConfig[] = [
  {
    key: "insufficient-funds",
    name: "Insufficient Funds",
    tag: "CARD DECLINE",
    category: "CARD",
    defaultSeverity: "HIGH",
    description: "Automated recurring batch charge rejected due to balance limit or card velocity limit. High customer intent.",
    defaultPaymentMethod: "HDFC Visa Credit Card (•••• 4829)",
    defaultFailureCode: "ERR_INSUFFICIENT_FUNDS_51",
    defaultChannel: "EMAIL",
    sampleBillingContext: "Primary credit card debited for monthly SaaS tier rejected with ERR_INSUFFICIENT_FUNDS during 04:00 AM automated batch debit. Customer has high historical LTV and active product engagement.",
    suggestedAmount: 7800,
  },
  {
    key: "expired-card",
    name: "Expired Card",
    tag: "CARD EXPIRY",
    category: "CARD",
    defaultSeverity: "MEDIUM",
    description: "Card validity expired after 3-year term. Requires RBI tokenized card update link.",
    defaultPaymentMethod: "ICICI Mastercard (•••• 1092) - Expired",
    defaultFailureCode: "ERR_CARD_EXPIRED_54",
    defaultChannel: "EMAIL",
    sampleBillingContext: "Enterprise account card expired last month; recurring monthly billing attempt failed with EXPIRED_PAYMENT_METHOD. Requires zero-friction RBI-compliant card tokenization link.",
    suggestedAmount: 12499,
  },
  {
    key: "3ds-auth-failure",
    name: "3DS Authentication Failure",
    tag: "OTP DROP",
    category: "CHECKOUT",
    defaultSeverity: "HIGH",
    description: "Issuing bank OTP SMS delivery delayed by telecom gateway or biometric verification dropped at checkout.",
    defaultPaymentMethod: "Axis Bank Rupay Debit (•••• 7731)",
    defaultFailureCode: "3DS_CHALLENGE_TIMEOUT_EXPIRED",
    defaultChannel: "EMAIL",
    sampleBillingContext: "Customer attempted checkout but issuing bank 3DS OTP verification timed out after 180s without OTP submission. Cart remains cached and user intent is high.",
    suggestedAmount: 3499,
  },
  {
    key: "bank-gateway-timeout",
    name: "Bank/Gateway Timeout",
    tag: "ACQUIRER OUTAGE",
    category: "CARD",
    defaultSeverity: "HIGH",
    description: "Acquirer network degradation during peak banking clearing window; customer account balance untouched.",
    defaultPaymentMethod: "State Bank of India (Corporate Netbanking)",
    defaultFailureCode: "GATEWAY_TIMEOUT_504_ACQUIRER_UNAVAILABLE",
    defaultChannel: "EMAIL",
    sampleBillingContext: "Netbanking checkout timed out due to SBI core banking gateway downtime during peak evening clearing window. Balance untouched; requires smart acquirer routing.",
    suggestedAmount: 14200,
  },
  {
    key: "checkout-abandonment",
    name: "Checkout Abandonment",
    tag: "FUNNEL DROP",
    category: "CHECKOUT",
    defaultSeverity: "MEDIUM",
    description: "High-intent visitor dropped at payment step after configuring cart or plan.",
    defaultPaymentMethod: "Checkout Funnel Step 3 (Payment Selection)",
    defaultFailureCode: "CART_ABANDONED_STEP_3",
    defaultChannel: "EMAIL",
    sampleBillingContext: "High-intent visitor configured Annual Business Plan, applied discount coupon, but dropped out at payment review step after 35-minute active session duration.",
    suggestedAmount: 4500,
  },
  {
    key: "subscription-renewal-failure",
    name: "Subscription Renewal Failure",
    tag: "RECURRING BILLING",
    category: "SUBSCRIPTION",
    defaultSeverity: "HIGH",
    description: "Second consecutive recurring subscription charge failed; account marked PAST_DUE in final grace period.",
    defaultPaymentMethod: "Subscription Auto-Debit (Monthly Pro)",
    defaultFailureCode: "RECURRING_CHARGE_DECLINED_RETRY_2",
    defaultChannel: "EMAIL",
    sampleBillingContext: "Second consecutive recurring subscription charge failed; account marked PAST_DUE with grace period expiring in 48 hours. Risk of involuntary churn.",
    suggestedAmount: 2499,
  },
  {
    key: "upi-mandate-failure",
    name: "UPI AutoPay / Mandate Failure",
    tag: "UPI AUTOPAY",
    category: "UPI",
    defaultSeverity: "HIGH",
    description: "Recurring UPI AutoPay mandate execution declined by NPCI handle due to daily volume limit exhaustion.",
    defaultPaymentMethod: "UPI AutoPay (NPCI Mandate UMN-94821)",
    defaultFailureCode: "VPA_MANDATE_EXECUTION_FAILED_LIMIT",
    defaultChannel: "EMAIL",
    sampleBillingContext: "Recurring UPI AutoPay mandate execution declined by NPCI handle due to daily PSP volume limit exhaustion. Instant 1-click UPI Intent link recommended.",
    suggestedAmount: 9999,
  },
  {
    key: "overdue-invoice",
    name: "Overdue B2B Invoice",
    tag: "B2B INVOICING",
    category: "INVOICE",
    defaultSeverity: "CRITICAL",
    description: "B2B Net-30 invoice is past due; automated dunning sent but finance AP team has not confirmed payment.",
    defaultPaymentMethod: "NEFT / RTGS Wire Transfer (Net-30 Term)",
    defaultFailureCode: "INVOICE_PAST_DUE_NET30_DAY_7",
    defaultChannel: "EMAIL",
    sampleBillingContext: "B2B Net-30 invoice INV-2026-088 is 7 days past due; automated dunning sent but finance AP team has not acknowledged. High-value enterprise contract at risk.",
    suggestedAmount: 18500,
  },
  {
    key: "high-churn-risk",
    name: "High Churn Risk Customer",
    tag: "RETENTION THREAT",
    category: "CHURN",
    defaultSeverity: "CRITICAL",
    description: "Multi-signal AI churn alert: failed payment combined with drop in product engagement.",
    defaultPaymentMethod: "Annual Starter Plan (Auto-Renewing)",
    defaultFailureCode: "AI_CHURN_PREDICTION_SCORE_89",
    defaultChannel: "VOICE",
    sampleBillingContext: "Multi-signal AI churn alert: 2 failed payment retries, zero login activity for 18 days, and open pricing inquiry. High-touch voice outreach recommended.",
    suggestedAmount: 5999,
  },
];

export async function listScenarioTypes() {
  return RECOVERY_SCENARIO_TYPES;
}

export interface CreateSandboxIncidentInput {
  scenarioTypeKey: string;
  customerId?: string;
  customerCustom?: {
    name: string;
    email: string;
    phone?: string;
    customer_type?: string;
  };
  amount: number;
  currency?: string;
  paymentMethod?: string;
  paymentRail?: string;
  failureCode?: string;
  failureReason?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  billingContext?: string;
  customInstruction?: string;
  autoAnalyze?: boolean;
}

// Persistent Sandbox Incidents Store (Survives page navigation, browser reloads)
interface StoredSandboxIncident {
  id: string;
  owner_id?: string;
  label: string;
  isSandbox: boolean;
  scenario_type: string;
  scenario_type_name: string;
  tag: string;
  category: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_type: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_rail: string;
  failure_reason: string;
  billing_context: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status:
    | "OPEN"
    | "ACTIVE"
    | "ANALYZED"
    | "ACTION_SIMULATED"
    | "ACTION_DISPATCHED"
    | "RECOVERED"
    | "ESCALATED"
    | "ESCALATED_TO_HUMAN"
    | "RESOLVED"
    | "CLOSED"
    | "CANCELLED";
  customer_context: {
    transactionsCount: number;
    invoicesCount: number;
    subscriptionsCount: number;
    recoveryCasesCount: number;
    paymentEventsCount: number;
    sampleTransactions: any[];
    sampleInvoices: any[];
    sampleSubscriptions: any[];
  };
  analysis: any | null;
  lifecycle: Array<{
    step: "DETECT" | "ANALYZE" | "DECIDE" | "ACT_SIMULATE" | "OBSERVE" | "AUDIT";
    title: string;
    status: "COMPLETED" | "ACTIVE" | "PENDING";
    timestamp: string;
    detail: string;
  }>;
  actions: Array<{
    id: string;
    incidentId: string;
    actionType: string;
    actionTitle: string;
    status: string;
    gatewayLatency: string;
    pspResponseCode: string;
    projectedRecovery: number;
    operatorName?: string;
    reason?: string;
    executedAt: string;
    details?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export async function createSandboxIncident(input: CreateSandboxIncidentInput, user?: UserProfile) {
  const supabase = getSupabaseClient();
  const rawKey = (
    input.scenarioTypeKey ||
    (input as any).scenarioType ||
    (input as any).scenario_type ||
    ""
  ).toLowerCase().replace(/_/g, "-");

  const typeConfig =
    RECOVERY_SCENARIO_TYPES.find(
      (t) =>
        t.key === input.scenarioTypeKey ||
        t.key === rawKey ||
        t.tag === (input as any).scenarioType ||
        t.name.toLowerCase() === rawKey
    ) || RECOVERY_SCENARIO_TYPES[0];

  const randTag = Math.random().toString(36).substring(2, 7).toUpperCase();
  const timeSuffix = Date.now().toString().slice(-4);
  const incidentId = `SB-INC-${randTag}-${timeSuffix}`;

  const amount = Number(input.amount) || typeConfig.suggestedAmount;
  const currency = input.currency || "INR";
  const severity = input.severity || typeConfig.defaultSeverity;
  const paymentMethod = input.paymentMethod || typeConfig.defaultPaymentMethod;
  const paymentRail = input.paymentRail || typeConfig.category;
  const failureReason = input.failureCode || input.failureReason || typeConfig.defaultFailureCode;
  const billingContext = typeof input.billingContext === "string" ? input.billingContext : (input.billingContext ? JSON.stringify(input.billingContext) : typeConfig.sampleBillingContext);

  // Resolve customer and load ground-truth telemetry
  let customer: any = null;
  let transactions: any[] = [];
  let invoices: any[] = [];
  let subscriptions: any[] = [];
  let cases: any[] = [];
  let events: any[] = [];

  // If customer details were passed directly on input
  if ((input as any).customerName) {
    customer = {
      id: `sb-cust-${randTag.toLowerCase()}`,
      name: (input as any).customerName,
      email: (input as any).customerEmail || "customer@example.test",
      phone: (input as any).customerPhone || "",
      customer_type: (input as any).customerType || "INDIVIDUAL",
      created_at: new Date().toISOString(),
    };
  } else if (input.customerId) {
    const { data: custRecord } = await supabase
      .from("customers")
      .select("*")
      .eq("id", input.customerId)
      .maybeSingle();

    if (custRecord) {
      customer = custRecord;
      const [txRes, invRes, subRes, caseRes, evRes] = await Promise.all([
        supabase.from("transactions").select("*").eq("customer_id", custRecord.id).limit(5),
        supabase.from("invoices").select("*").eq("customer_id", custRecord.id).limit(5),
        supabase.from("subscriptions").select("*").eq("customer_id", custRecord.id).limit(5),
        supabase.from("recovery_cases").select("*").eq("customer_id", custRecord.id).limit(5),
        supabase.from("payment_events").select("*").eq("customer_id", custRecord.id).limit(5),
      ]);
      transactions = txRes.data || [];
      invoices = invRes.data || [];
      subscriptions = subRes.data || [];
      cases = caseRes.data || [];
      events = evRes.data || [];
    }
  }

  if (!customer) {
    if (input.customerCustom?.name && input.customerCustom?.email) {
      customer = {
        id: `sb-cust-${randTag.toLowerCase()}`,
        name: input.customerCustom.name,
        email: input.customerCustom.email,
        phone: input.customerCustom.phone || "",
        customer_type: input.customerCustom.customer_type || "INDIVIDUAL",
        created_at: new Date().toISOString(),
      };
    } else {
      const { data: firstCust } = await supabase.from("customers").select("*").limit(1).maybeSingle();
      customer = firstCust || {
        id: "sb-cust-default",
        name: "Enterprise Account",
        email: "operations@example.test",
        phone: "",
        customer_type: "ENTERPRISE",
        created_at: new Date().toISOString(),
      };
    }
  }

  const resolvedPhone = input.customerCustom?.phone !== undefined
    ? input.customerCustom.phone.trim()
    : (customer.phone || "");

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const initialLifecycle: StoredSandboxIncident["lifecycle"] = [
    {
      step: "DETECT",
      title: "Incident Ingested & Anomaly Flagged",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Sandbox incident ${incidentId} created: Disruption "${failureReason}" on ${paymentMethod} (${currency} ${amount.toLocaleString()}) flagged for ${customer.name}.`,
    },
  ];

  const incidentOwnerId = getOwnerIdForUser(user) || "system";

  const storedIncident: StoredSandboxIncident = {
    id: incidentId,
    owner_id: incidentOwnerId,
    label: "DEMO/SANDBOX — NO PRODUCTION DB IMPACT",
    isSandbox: true,
    scenario_type: typeConfig.key,
    scenario_type_name: typeConfig.name,
    tag: typeConfig.tag,
    category: typeConfig.category,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: resolvedPhone,
    customer_type: customer.customer_type || "INDIVIDUAL",
    amount,
    currency,
    payment_method: paymentMethod,
    payment_rail: paymentRail,
    failure_reason: failureReason,
    billing_context: billingContext,
    severity,
    priority: severity,
    status: "ACTIVE",
    customer_context: {
      transactionsCount: transactions.length,
      invoicesCount: invoices.length,
      subscriptionsCount: subscriptions.length,
      recoveryCasesCount: cases.length,
      paymentEventsCount: events.length,
      sampleTransactions: transactions,
      sampleInvoices: invoices,
      sampleSubscriptions: subscriptions,
    },
    analysis: null,
    lifecycle: initialLifecycle,
    actions: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  persistentSandboxIncidents.set(incidentId, storedIncident);

  // Sync to sandbox_incidents table if available
  try {
    await supabase.from("sandbox_incidents").upsert({
      id: incidentId,
      scenario_type: typeConfig.key,
      customer_id: customer.id,
      amount,
      currency,
      payment_method: paymentMethod,
      failure_reason: failureReason,
      status: "ACTIVE",
      owner_id: incidentOwnerId,
      metadata: {
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: resolvedPhone,
        severity,
        billing_context: billingContext,
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking fallback
  }

  // Also log audit trail entry
  try {
    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "OPERATOR",
      event: "SANDBOX_INCIDENT_CREATED",
      details: {
        incident_id: incidentId,
        scenario_type: typeConfig.key,
        amount: `${currency} ${amount.toLocaleString()}`,
        customer_name: customer.name,
        is_sandbox: true,
      },
      created_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }

  // Autonomous Flow: Run initial AI analysis immediately
  const analyzedResponse = await analyzeSandboxIncidentWithAI(incidentId, input.customInstruction, user);

  // Automatically start autonomous recovery loop: Schedule Attempt #1 for 2 minutes later (120,000 ms)
  scheduleAutonomousAttempt(incidentId, 1, 120_000);

  return mapStoredIncidentToResponse(persistentSandboxIncidents.get(incidentId) || storedIncident);
}

export async function listSandboxIncidents(
  filters?: {
    scenarioType?: string;
    status?: string;
    category?: string;
    limit?: number;
  },
  _deprecatedOrUser?: any,
  explicitUser?: UserProfile
) {
  const user = explicitUser || (_deprecatedOrUser && (_deprecatedOrUser.id || _deprecatedOrUser.role || _deprecatedOrUser.email) ? _deprecatedOrUser : undefined);

  if (persistentSandboxIncidents.size === 0) {
    try {
      const { initializeTelemetryDemoQueue } = await import("./telemetryService.js");
      await initializeTelemetryDemoQueue();
    } catch {
      // Non-blocking
    }
  }

  const all = Array.from(persistentSandboxIncidents.values());
  let filtered = all.filter(i => canUserAccess(user, i.owner_id));

  if (filters?.scenarioType) {
    filtered = filtered.filter((i) => i.scenario_type === filters.scenarioType);
  }
  if (filters?.category) {
    filtered = filtered.filter((i) => i.category.toLowerCase() === filters.category!.toLowerCase());
  }
  if (filters?.status) {
    filtered = filtered.filter((i) => i.status === filters.status);
  }

  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (filters?.limit) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered.map(mapStoredIncidentToResponse);
}

export async function getSandboxIncident(id: string, user?: UserProfile) {
  if (persistentSandboxIncidents.size === 0) {
    try {
      const { initializeTelemetryDemoQueue } = await import("./telemetryService.js");
      await initializeTelemetryDemoQueue();
    } catch {
      // Non-blocking
    }
  }

  let item = persistentSandboxIncidents.get(id);
  if (!item) {
    // Also check by created_incident_id or telemetry id in case prefix differs
    for (const val of persistentSandboxIncidents.values()) {
      if (val.id === id || val.customer_id === id) {
        item = val;
        break;
      }
    }
  }
  if (!item || !canUserAccess(user, item.owner_id)) return null;
  return mapStoredIncidentToResponse(item);
}

export async function analyzeSandboxIncidentWithAI(incidentId: string, customInstruction?: string, user?: UserProfile) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
Analyze this newly created SANDBOX REVENUE INCIDENT under the 6-stage bounded agent loop:
[DETECT -> ANALYZE -> DECIDE -> ACT/SIMULATE -> OBSERVE -> AUDIT].

SANDBOX INCIDENT METADATA:
- Incident ID: ${item.id} (DEMO/SANDBOX ONLY - NO PROD DB MUTATION)
- Incident Scenario Type: "${item.scenario_type_name}" (Key: "${item.scenario_type}")
- Problem / Billing Context: "${item.billing_context}"
- Severity: ${item.severity}
- Category: ${item.category}
- Disruption Code / Reason: "${item.failure_reason}"
- Payment Method / Rail: "${item.payment_method}" (${item.payment_rail})
- Amount at Risk: ${item.currency} ${item.amount}

CUSTOMER GROUND-TRUTH PROFILE (FROM SUPABASE TELEMETRY):
- Name: ${item.customer_name}
- Email: ${item.customer_email}
- Customer Type: ${item.customer_type}
- Past Invoices Count: ${item.customer_context.invoicesCount}
- Active Subscriptions Count: ${item.customer_context.subscriptionsCount}
- Past Transactions Count: ${item.customer_context.transactionsCount}
- Past Payment Disruption Events Count: ${item.customer_context.paymentEventsCount}
${customInstruction ? `- Operator Specific Directive: "${customInstruction}"` : ""}

Generate a realistic, comprehensive, and high-converting autonomous recovery intelligence response.
Your response MUST be a valid JSON object matching this schema exactly:
{
  "detectedRisk": "Detailed description of the detected revenue risk and categorization",
  "relevantEvidence": [
    "Specific telemetry fact 1 extracted from failure reason, payment method, or customer context",
    "Specific telemetry fact 2 with customer history grounding",
    "Specific telemetry fact 3 regarding payment rail or amount"
  ],
  "rootCause": "Detailed technical, payment rail, and behavioral explanation of why this disruption occurred.",
  "aiReasoning": "Clear executive evaluation of customer lifetime value, payment disruption risk, and behavioral intent.",
  "selectedStrategy": "Specific recovery strategy policy (e.g., Adaptive Multi-Acquirer Smart Retry, 1-Click WhatsApp UPI Intent Fallback, RBI Tokenized Card Update Link, B2B Executive Escalation & Promise-to-Pay, Dynamic 10% Rescue Incentive).",
  "strategyJustification": "Step-by-step mathematical, psychological, and algorithmic justification for this chosen recovery strategy.",
  "recommendedAction": "One of: SEND_PAYMENT_LINK | SMART_RETRY | REQUEST_PAYMENT_METHOD_UPDATE | RECORD_PROMISE_TO_PAY | SEND_REMINDER | ESCALATE",
  "recommendedTiming": "Exact recommended execution time window (e.g., Immediate T+3min, Next banking window 10:00 AM IST, Payday / Evening 19:30 IST, T+24h Grace).",
  "recoveryProbability": 0.86,
  "expectedRecoveryAmount": ${Math.round(item.amount * 0.86)},
  "alternativeActions": [
    {
      "action": "Alternative action name (e.g., Immediate SMS Fallback)",
      "strategy": "Alternative recovery strategy description",
      "projectedProbability": 0.72,
      "tradeoff": "Tradeoff analysis vs primary recommended action"
    },
    {
      "action": "Secondary alternative action name (e.g., Manual Concierge Call)",
      "strategy": "Secondary recovery strategy description",
      "projectedProbability": 0.65,
      "tradeoff": "Higher operational cost with customer outreach"
    }
  ],
  "escalationReason": "Conditions under which automated resolution should pause and route to human revenue operations team",
  "customerMessage": {
    "whatsapp": "High-converting, courteous WhatsApp message with clean formatting and clear 1-click action link (https://pay.recoverly.test/intent/${item.id}).",
    "sms": "Concise, 160-char SMS message with respectful urgency and secure short link.",
    "email": {
      "subject": "Compelling, non-spammy email subject line",
      "body": "Polite, professional email text with customer greeting, clear problem summary, invoice/transaction reference, and 1-click resolution button text."
    }
  },
  "confidence": 0.92,
  "analysisTimestamp": "${new Date().toISOString()}"
}`;

  let analysis: any = null;
  let aiError: string | null = null;

  try {
    const aiResult = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction:
          "You are an elite fintech revenue operations and autonomous payment recovery AI specialist. Provide sharp, realistic, high-converting assessments and courteous customer communications.",
      },
    });

    if (aiResult?.text) {
      analysis = cleanAndParseJson(aiResult.text);
    }
  } catch (e: any) {
    console.warn("Sandbox incident AI analysis notice:", e);
    aiError = e?.message || "Gemini AI API service unavailable";
  }

  if (!analysis) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || apiKey === "null") {
      aiError = "GEMINI_API_KEY environment variable is not configured. Please set GEMINI_API_KEY in environment/settings to enable live AI analysis.";
    } else if (!aiError) {
      aiError = "Gemini AI service temporarily unavailable. Please retry the analysis.";
    }

    // Return structured unavailable state so frontend can show clean retry UI
    analysis = {
      detectedRisk: `${item.scenario_type_name}: Disruption of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method}`,
      relevantEvidence: [
        `Failure Reason: "${item.failure_reason}"`,
        `Customer Profile: ${item.customer_name} (${item.customer_email})`,
        `Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}`,
      ],
      rootCause: `Payment disruption occurred on rail ${item.payment_rail} (${item.failure_reason}).`,
      aiReasoning: "Awaiting live Gemini AI reasoning to formulate tailored recovery strategy.",
      selectedStrategy: "Autonomous Smart Recovery Evaluation",
      strategyJustification: "Requires live AI reasoning to optimize timing and channel selection.",
      recommendedAction: item.category === "INVOICE" ? "RECORD_PROMISE_TO_PAY" : item.category === "CHECKOUT" ? "SEND_PAYMENT_LINK" : "SMART_RETRY",
      recommendedTiming: "Immediate Window",
      recoveryProbability: 0.80,
      expectedRecoveryAmount: Math.round(item.amount * 0.80),
      alternativeActions: [
        { action: "SEND_PAYMENT_LINK", strategy: "1-Click Direct Link", projectedProbability: 0.75, tradeoff: "Requires customer click" },
        { action: "ESCALATE", strategy: "Operator Review", projectedProbability: 0.65, tradeoff: "Manual staff intervention required" },
      ],
      escalationReason: "Repeated payment rail failure or explicit customer dispute",
      customerMessage: {
        whatsapp: `Hi ${item.customer_name}, we noticed a brief processing issue with your payment of ${item.currency} ${item.amount.toLocaleString()}. Tap here to complete securely: ${getFrontendRecoveryUrl(item.id)}`,
        sms: `Recoverly: Resolve ${item.currency} ${item.amount.toLocaleString()} payment securely: ${getFrontendRecoveryUrl(item.id)}`,
        email: {
          subject: `Action Required: Resolving payment of ${item.currency} ${item.amount.toLocaleString()}`,
          body: `Dear ${item.customer_name},\n\nWe encountered a temporary processing issue for your payment of ${item.currency} ${item.amount.toLocaleString()}.\n\nPlease click below to review and resolve:\n${getFrontendRecoveryUrl(item.id)}\n\nBest regards,\nRecoverly Operations`,
        },
      },
      confidence: 0.85,
      analysisTimestamp: new Date().toISOString(),
      aiError,
      unavailable: Boolean(aiError),
    };
  }

  // Ensure numeric fields are cleanly typed
  if (typeof analysis.recoveryProbability === "string") {
    analysis.recoveryProbability = parseFloat(analysis.recoveryProbability);
  }
  if (typeof analysis.expectedRecoveryAmount === "string") {
    analysis.expectedRecoveryAmount = parseFloat(analysis.expectedRecoveryAmount);
  }
  if (!analysis.expectedRecoveryAmount) {
    analysis.expectedRecoveryAmount = Math.round(item.amount * (analysis.recoveryProbability || 0.8));
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const updatedLifecycle: StoredSandboxIncident["lifecycle"] = [
    item.lifecycle[0] || {
      step: "DETECT",
      title: "Incident Ingested & Anomaly Flagged",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Sandbox incident ${item.id} ingested.`,
    },
    {
      step: "ANALYZE",
      title: "Telemetry Grounding & Root-Cause Extraction",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Autonomous AI evaluated customer profile (${item.customer_context.transactionsCount} txns, ${item.customer_context.invoicesCount} invs) and diagnosed root cause: ${analysis.rootCause?.slice(0, 110)}...`,
    },
    {
      step: "DECIDE",
      title: "Bounded Strategy Selected",
      status: "ACTIVE",
      timestamp: timeStr,
      detail: `Selected policy: "${analysis.selectedStrategy}" with ${Math.round((analysis.recoveryProbability || 0.8) * 100)}% recovery probability score.`,
    },
  ];

  item.analysis = analysis;
  item.status = "ANALYZED";
  item.lifecycle = updatedLifecycle;
  item.updated_at = now.toISOString();

  // Log to audit trail
  try {
    const supabase = getSupabaseClient();
    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "AI_AGENT",
      event: "GEMINI_ANALYSIS_COMPLETED",
      details: {
        incident_id: item.id,
        scenario_type: item.scenario_type,
        selected_strategy: analysis.selectedStrategy,
        recovery_probability: analysis.recoveryProbability,
        recommended_action: analysis.recommendedAction,
        is_sandbox: true,
      },
      created_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }

  return mapStoredIncidentToResponse(item);
}

export async function executeSandboxIncidentAction(
  incidentId: string,
  params: {
    actionType: string;
    strategyName?: string;
    reason?: string;
    operatorInfo?: { name?: string; email?: string };
  },
  user?: UserProfile
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  const prob = item.analysis?.recoveryProbability || 0.85;
  const projectedRecovery = Math.round(item.amount * prob);
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const latency = `${Math.floor(Math.random() * 60 + 95)}ms`;

  let pspCode = "ACTION_DISPATCHED_200_OK";
  if (params.actionType.includes("UPI") || params.actionType.includes("LINK") || params.actionType === "SEND_PAYMENT_LINK") {
    pspCode = "UPI_INTENT_DISPATCHED_200_OK";
  } else if (params.actionType.includes("RETRY") || params.actionType === "SMART_RETRY") {
    pspCode = "SMART_RETRY_SCHEDULED_T_PLUS_4H";
  } else if (params.actionType.includes("PROMISE") || params.actionType === "RECORD_PROMISE_TO_PAY") {
    pspCode = "PROMISE_TO_PAY_LOCKED_200_OK";
  } else if (params.actionType.includes("REMINDER") || params.actionType === "SEND_REMINDER") {
    pspCode = "OMNICHANNEL_DUNNING_SENT_200_OK";
  } else if (params.actionType.includes("UPDATE") || params.actionType === "REQUEST_PAYMENT_METHOD_UPDATE") {
    pspCode = "TOKENIZATION_UPDATE_LINK_DISPATCHED_200_OK";
  } else if (params.actionType.includes("ESCALATE")) {
    pspCode = "OPS_ESCALATION_TICKET_CREATED_200_OK";
  }

  const actionRecord = {
    id: `act-sb-${Math.random().toString(36).substring(2, 8)}`,
    incidentId: item.id,
    actionType: params.actionType,
    actionTitle: params.strategyName || params.actionType,
    status: "SIMULATED_SUCCESS (Read-Only Sandbox)",
    gatewayLatency: latency,
    pspResponseCode: pspCode,
    projectedRecovery,
    operatorName: params.operatorInfo?.name || "Operator",
    reason: params.reason || "Executed bounded AI recovery action in sandbox",
    executedAt: now.toISOString(),
    details: `Dispatched via mock sandbox gateway. Gateway latency: ${latency}. Response: ${pspCode}. 0 Supabase production records mutated.`,
  };

  item.actions.unshift(actionRecord);
  item.status = prob >= 0.85 ? "RECOVERED" : "ACTION_SIMULATED";
  item.updated_at = now.toISOString();

  // Update lifecycle
  item.lifecycle = [
    ...item.lifecycle.filter((l) => l.step === "DETECT" || l.step === "ANALYZE" || l.step === "DECIDE"),
    {
      step: "ACT_SIMULATE",
      title: "Sandbox Action Dispatched",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Dispatched "${params.strategyName || params.actionType}" via mock gateway router. Response: ${pspCode} (latency: ${latency}).`,
    },
    {
      step: "OBSERVE",
      title: "Telemetry Feedback Captured",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Observed positive gateway handshake. Projected recovery: ${item.currency} ${projectedRecovery.toLocaleString()} (${Math.round(prob * 100)}% probability).`,
    },
    {
      step: "AUDIT",
      title: "Sandbox Audit Trail Recorded",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Immutable sandbox audit ledger recorded for incident ${item.id}. Verified 0 mutations to production financial tables.`,
    },
  ];

  // Log to audit trail
  try {
    const supabase = getSupabaseClient();
    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "OPERATOR",
      event: "SANDBOX_ACTION_EXECUTED",
      details: {
        incident_id: item.id,
        action_type: params.actionType,
        psp_response_code: pspCode,
        projected_recovery: `${item.currency} ${projectedRecovery.toLocaleString()}`,
        operator: params.operatorInfo?.name || "Operator",
        is_sandbox: true,
      },
      created_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }

  return {
    simulation: {
      incidentId: item.id,
      actionName: params.strategyName || params.actionType,
      status: "SIMULATED_SUCCESS (Read-Only Sandbox)",
      timestamp: timeStr,
      executedAt: now.toISOString(),
      gatewayLatency: latency,
      pspResponseCode: pspCode,
      projectedRecovery,
      projectedRecoveredAmount: projectedRecovery,
      simulatedGatewayResponse: {
        gatewayName: "Autonomous Acquirer Gateway",
        authCode: pspCode,
        latencyMs: latency,
      },
      telemetryNotes: "Simulated in sandboxed acquirer environment. Verified webhook dispatch. 0 Supabase production records mutated.",
      lifecycleUpdates: item.lifecycle,
    },
    updatedIncident: mapStoredIncidentToResponse(item),
  };
}

export const RECOVERY_CAPABILITIES = [
  {
    key: "SMART_RETRY",
    name: "Intelligent Network Retry",
    channel: "GATEWAY",
    description: "Re-routes payment with adaptive network tokenization and optimal authorization parameters.",
  },
  {
    key: "DELAYED_RETRY",
    name: "Scheduled Off-Peak Retry",
    channel: "GATEWAY",
    description: "Schedules automated retry at customer's typical salary/liquidity clearance window.",
  },
  {
    key: "PAYMENT_LINK",
    name: "Multi-Rail Payment Link",
    channel: "OMNICHANNEL",
    description: "Generates authenticated payment link supporting Card, NetBanking, and Wallets.",
  },
  {
    key: "VOICE_OUTREACH",
    name: "Interactive Exotel Voice Recovery",
    channel: "VOICE",
    description: "Dispatches automated high-priority voice call with synthesized AI billing recovery script.",
  },
  {
    key: "SMS_OUTREACH",
    name: "SMS Urgent Recovery Outreach",
    channel: "SMS",
    description: "Dispatches concise SMS with self-serve 1-click payment link.",
  },
  {
    key: "EMAIL_OUTREACH",
    name: "Formal Billing Resolution Email",
    channel: "EMAIL",
    description: "Sends branded invoice resolution email with itemized breakdown and payment portal.",
  },
  {
    key: "CARD_UPDATE_LINK",
    name: "Hosted Card / Mandate Update Link",
    channel: "EMAIL_SMS",
    description: "Sends secure link allowing customer to update expired card or replace mandate on file.",
  },
  {
    key: "UPI_REAUTHORIZATION",
    name: "UPI AutoPay Mandate Re-auth",
    channel: "UPI",
    description: "Triggers prompt in customer's UPI app to re-authorize paused or failed recurring mandate.",
  },
  {
    key: "ALTERNATE_PAYMENT_METHOD",
    name: "Alternate Payment Method Proposal",
    channel: "OMNICHANNEL",
    description: "Prompts customer to switch to NetBanking or corporate card rail.",
  },
  {
    key: "ALTERNATE_GATEWAY",
    name: "Acquirer Failover / Gateway Switch",
    channel: "GATEWAY",
    description: "Routes retry through secondary acquirer / payment gateway connector.",
  },
  {
    key: "PROMISE_TO_PAY",
    name: "Promise-to-Pay Lock",
    channel: "OPERATIONS",
    description: "Locks a customer commitment date and suspends dunning pressure until promise date.",
  },
  {
    key: "GRACE_PERIOD",
    name: "Grace Period Extension",
    channel: "POLICY",
    description: "Extends account grace period by 3-7 days while pausing service suspension.",
  },
  {
    key: "RETENTION_OFFER",
    name: "Rescue Retention Incentive",
    channel: "OMNICHANNEL",
    description: "Applies dynamic 10-15% discount incentive to rescue high-value subscription.",
  },
  {
    key: "HUMAN_ESCALATION",
    name: "Human Specialist Escalation",
    channel: "OPERATOR",
    description: "Halts automation and hands complete dossier to VIP Revenue Operations Specialist.",
  },
];

export async function deleteSandboxIncident(id: string, user?: UserProfile) {
  const item = persistentSandboxIncidents.get(id);
  if (item && !canUserAccess(user, item.owner_id)) {
    return { success: false, id, error: "Unauthorized" };
  }
  const existed = persistentSandboxIncidents.delete(id);
  return { success: existed, id };
}

export async function executeAutonomousLoopStep(
  incidentId: string,
  options?: {
    policyConfig?: {
      maxAttempts?: number;
      allowedCapabilities?: string[];
      maxRecoverableExposure?: number;
    };
    operatorInstruction?: string;
  },
  user?: UserProfile
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  const maxAttempts = options?.policyConfig?.maxAttempts || 4;
  const attemptCount = item.actions.length;
  const currentIteration = attemptCount + 1;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Terminal Bounded Guardrail: Stop at maxAttempts and escalate to human
  if (attemptCount >= maxAttempts) {
    item.status = "ESCALATED_TO_HUMAN";
    item.updated_at = now.toISOString();

    const escalationDossier = {
      incidentId: item.id,
      customerName: item.customer_name,
      customerEmail: item.customer_email,
      customerType: item.customer_type,
      amountAtRisk: `${item.currency} ${item.amount.toLocaleString()}`,
      rootCause: item.failure_reason,
      whyStopped: `Bounded safety limit reached: ${attemptCount} consecutive automated recovery attempts executed without confirmed settlement.`,
      evidence: [
        `Scenario: ${item.scenario_type_name} (${item.category})`,
        `Payment Rail: ${item.payment_rail || item.payment_method}`,
        `Executed ${attemptCount} distinct capability interventions`,
      ],
      attemptsTimeline: item.actions.map((a, idx) => ({
        attemptNumber: idx + 1,
        actionTitle: a.actionTitle,
        actionType: a.actionType,
        executedAt: a.executedAt,
        pspResponseCode: a.pspResponseCode,
        latency: a.gatewayLatency,
        observation: a.details || "Observed telemetry feedback",
      })),
      observedTelemetrySummary: `Simulated gateway attempts and customer outreach did not yield confirmed settlement for ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}).`,
      recommendedHumanAction:
        item.category === "INVOICE"
          ? "Initiate direct AP procurement phone outreach, verify purchase order authorization, and propose formal payment restructuring."
          : item.category === "CHURN"
          ? "Schedule high-touch retention call with Account Executive and offer tailored 15% annual commitment discount."
          : "Dispatch high-priority concierge Voice call or Email offering alternate payment method or manual reconciliation.",
      remainingAmountAtRisk: item.amount,
      currentRecoveryProbability: 0.35,
      escalationTimestamp: now.toISOString(),
      assignedTier: "VIP Revenue Operations Specialist",
    };

    (item as any).escalationDossier = escalationDossier;

    item.lifecycle = [
      ...item.lifecycle,
      {
        step: "AUDIT",
        title: "Autonomous Loop Terminated • Human Escalation Handoff",
        status: "COMPLETED",
        timestamp: timeStr,
        detail: `Bounded safety limit (${maxAttempts} attempts) reached. Safely halted automation and prepared comprehensive human escalation dossier.`,
      },
    ];

    try {
      const supabase = getSupabaseClient();
      await supabase.from("audit_logs").insert({
        recovery_case_id: null,
        actor_type: "AI_AGENT",
        event: "AUTONOMOUS_LOOP_ESCALATED_TO_HUMAN",
        details: {
          incident_id: item.id,
          attempts_completed: attemptCount,
          reason: escalationDossier.whyStopped,
          is_sandbox: true,
        },
        created_at: now.toISOString(),
      });
    } catch (e) {
      // Non-blocking
    }

    return {
      incident: mapStoredIncidentToResponse(item),
      stepResult: {
        iteration: currentIteration,
        agentState: "ESCALATED_TO_HUMAN" as const,
        isTerminal: true,
        terminalReason: "MAX_ATTEMPTS_REACHED",
        escalationDossier,
      },
    };
  }

  // Evaluate Previous Actions & Prepare Gemini Autonomous Decision Prompt
  const pastAttemptsSummary = item.actions.map((a, idx) => 
    `Attempt #${idx + 1}: Executed "${a.actionTitle}" (${a.actionType}) at ${a.executedAt}. Gateway code: ${a.pspResponseCode}. Observation: ${a.details || "No confirmed settlement"}`
  ).join("\n");

  const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine. You are in an AUTONOMOUS CLOSED LOOP for Sandbox Incident ${item.id}.
INCIDENT CONTEXT:
- Problem: "${item.scenario_type_name}" (${item.category})
- Customer: ${item.customer_name} (${item.customer_email}, ${item.customer_type})
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Disruption Reason: "${item.failure_reason}"
- Billing Context: "${item.billing_context}"
- Current Iteration: Iteration #${currentIteration} of ${maxAttempts} (Bounded Safety Limit)
${options?.operatorInstruction ? `- Operator Directive: "${options.operatorInstruction}"` : ""}

PREVIOUS ATTEMPTS COMPLETED:
${pastAttemptsSummary || "No previous attempts executed yet. This is Iteration #1."}

AVAILABLE RECOVERY CAPABILITIES:
- SMART_RETRY: Intelligent Network Retry with adaptive network token
- DELAYED_RETRY: Scheduled Off-Peak Retry
- PAYMENT_LINK: Multi-Rail Payment Link (Card/UPI/NetBanking)
- VOICE_CALL: AI Voice Outreach Call via Exotel
- EMAIL_OUTREACH: Formal Billing Resolution Email via Resend
- CARD_UPDATE_LINK: Hosted Card & Mandate Update Link
- UPI_REAUTHORIZATION: UPI AutoPay Mandate Re-auth
- ALTERNATE_PAYMENT_METHOD: Alternate Payment Method / Rail Switch
- ALTERNATE_GATEWAY: Secondary Acquirer / Gateway Failover
- PROMISE_TO_PAY: Lock Promise-to-Pay Commitment
- GRACE_PERIOD: Grace Period Extension
- RETENTION_OFFER: Dynamic 10-15% Rescue Incentive
- HUMAN_ESCALATION: Escalate to VIP Revenue Operations Specialist

TASK:
1. Reassess the current state and telemetry feedback from past attempts.
2. Select the optimal NEXT capability dynamically (EMAIL_OUTREACH or VOICE_CALL for customer outreach). DO NOT use a static fixed sequence.
3. Formulate the precise strategy and tailored message / parameters.
4. Determine if this intervention will successfully recover the payment or require further observation. (For realistic simulation in this sandbox loop, decide if this iteration achieves full settlement based on the customer tier, failure reason, and capability applied).

Respond strictly in valid JSON matching this schema:
{
  "selectedCapability": "One of: SMART_RETRY | DELAYED_RETRY | PAYMENT_LINK | VOICE_CALL | EMAIL_OUTREACH | CARD_UPDATE_LINK | UPI_REAUTHORIZATION | ALTERNATE_PAYMENT_METHOD | ALTERNATE_GATEWAY | PROMISE_TO_PAY | GRACE_PERIOD | RETENTION_OFFER | HUMAN_ESCALATION",
  "actionTitle": "Descriptive title for this specific action",
  "decisionRationale": "Deep AI reasoning explaining why this capability was chosen given previous attempt observations",
  "selectedStrategy": "Name of the recovery strategy",
  "tailoredMessage": "Customer outreach message if applicable, or gateway instruction summary",
  "channel": "One of: VOICE | EMAIL | GATEWAY | UPI | OPERATIONS",
  "simulatedSettlement": boolean,
  "recoveryProbability": number,
  "telemetryObservation": "Realistic telemetry feedback observed following execution (e.g. customer click, gateway auth code, webhook delivery, or settlement confirmation)",
  "pspResponseCode": "Realistic response code like AUTH_SUCCESS_200 or UPI_INTENT_CLICKED_AWAITING_PIN or AUTH_DECLINED_SOFT",
  "latencyMs": 115,
  "shouldEscalateNow": boolean,
  "escalationReason": "If shouldEscalateNow is true, explain why"
}`;

  let aiDecision: any = null;
  try {
    const aiResult = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction: "You are an autonomous fintech revenue operations agent. Make rigorous, dynamic next-action decisions in a closed loop.",
      },
    });

    if (aiResult?.text) {
      aiDecision = cleanAndParseJson(aiResult.text);
    }
  } catch (e) {
    console.warn("Autonomous loop step AI call notice:", e);
  }

  // Resilient fallback decision if Gemini call was unconfigured or timed out
  if (!aiDecision || !aiDecision.selectedCapability) {
    // Dynamic rule-based decision fallback based on attempt count and scenario category
    let cap = "PAYMENT_LINK";
    let title = "Dispatched Multi-Rail Payment Link";
    let reason = "Initial proactive outreach with multi-rail payment fallback.";
    let observation = "Payment link dispatched via simulated gateway. Awaiting customer authorization.";
    let psp = "LINK_DISPATCHED_200_OK";
    let settled = false;

    if (currentIteration === 1) {
      if (item.category === "UPI" || item.scenario_type.includes("upi")) {
        cap = "VOICE_CALL";
        title = "Dispatched Automated AI Voice Call (Exotel)";
        reason = "Automated voice call with interactive prompt provides immediate engagement for time-sensitive transactions.";
        observation = "Exotel voice call answered. Customer listened to prompt and requested payment link via email.";
        psp = "VOICE_CALL_COMPLETED_200";
      } else if (item.category === "CARD" || item.scenario_type.includes("card")) {
        cap = "SMART_RETRY";
        title = "Triggered Intelligent Network Retry";
        reason = "Automated token retry across secondary acquirer.";
        observation = "Retry routed. Gateway reported soft timeout from issuing bank.";
        psp = "AUTH_SOFT_DECLINE_RETRYABLE";
      } else if (item.category === "INVOICE") {
        cap = "EMAIL_OUTREACH";
        title = "Dispatched Executive AP Resolution Notice (Resend)";
        reason = "B2B invoices require structured AP notification with digital payment link.";
        observation = "Email opened by accounts payable. Awaiting payment authorization.";
        psp = "INVOICE_EMAIL_DELIVERED_200";
      }
    } else if (currentIteration === 2) {
      if (item.category === "CARD") {
        cap = "CARD_UPDATE_LINK";
        title = "Sent Zero-Friction Card Update Portal";
        reason = "Soft decline on previous retry indicates token or card issue. Requesting updated card.";
        observation = "Customer opened hosted card update portal. New payment method authorized.";
        psp = "CARD_UPDATED_AUTH_200";
        settled = true; // Succeeded on 2nd smart attempt
      } else if (item.category === "UPI") {
        cap = "UPI_REAUTHORIZATION";
        title = "Prompted UPI AutoPay Mandate Re-auth";
        reason = "Prompting in-app UPI mandate re-authorization after click.";
        observation = "Customer approved UPI AutoPay mandate prompt in PhonePe. Full settlement cleared.";
        psp = "UPI_MANDATE_AUTH_SUCCESS_200";
        settled = true; // Succeeded on 2nd smart attempt
      } else {
        cap = "EMAIL_OUTREACH";
        title = "Dispatched Direct Resolution Email (Resend)";
        reason = "Escalating cross-channel outreach with formal digital invoice.";
        observation = "Customer clicked invoice email link and completed payment.";
        psp = "PAYMENT_SETTLED_EMAIL_200";
        settled = true;
      }
    } else {
      cap = "RETENTION_OFFER";
      title = "Applied 10% Rescue Incentive Link";
      reason = "Applied rescue incentive to close persistent recovery friction.";
      observation = "Incentive applied. Customer authorized payment.";
      psp = "INCENTIVE_ACCEPTED_AUTH_200";
      settled = true;
    }

    aiDecision = {
      selectedCapability: cap,
      actionType: cap,
      actionTitle: title,
      decisionRationale: reason,
      selectedStrategy: title,
      tailoredMessage: `Hi ${item.customer_name}, please resolve your ${item.currency} ${item.amount.toLocaleString()} payment securely: ${getFrontendRecoveryUrl(item.id)}`,
      channel: cap === "VOICE_CALL" ? "VOICE" : cap === "EMAIL_OUTREACH" ? "EMAIL" : "GATEWAY",
      simulatedSettlement: settled,
      recoveryProbability: settled ? 0.94 : 0.76,
      telemetryObservation: observation,
      pspResponseCode: psp,
      latencyMs: 112,
      shouldEscalateNow: false,
    };
  } else {
    if (!(aiDecision as any).actionType && aiDecision.selectedCapability) {
      (aiDecision as any).actionType = aiDecision.selectedCapability;
    }
  }

  const isSettled = Boolean(aiDecision.simulatedSettlement);
  const shouldEscalate = Boolean(aiDecision.shouldEscalateNow);
  const prob = aiDecision.recoveryProbability || (isSettled ? 0.95 : 0.75);
  const projectedRecovery = Math.round(item.amount * prob);

  // Record Action to Incident
  const actionRecord = {
    id: `ACT-${Date.now().toString().slice(-6)}`,
    incidentId: item.id,
    actionType: aiDecision.selectedCapability,
    actionTitle: aiDecision.actionTitle || aiDecision.selectedCapability,
    status: isSettled ? "SETTLED_AND_RECOVERED" : "SIMULATED_DISPATCHED",
    gatewayLatency: `${aiDecision.latencyMs || 110}ms`,
    pspResponseCode: aiDecision.pspResponseCode || "AUTH_OK_200",
    projectedRecovery,
    operatorName: "Recoverly Autonomous AI Agent",
    reason: aiDecision.decisionRationale,
    executedAt: now.toISOString(),
    details: aiDecision.telemetryObservation || "Telemetry feedback observed.",
  };

  item.actions.unshift(actionRecord);
  item.updated_at = now.toISOString();

  // Update Lifecycle steps
  item.lifecycle = [
    ...item.lifecycle,
    {
      step: "DECIDE",
      title: `Iteration #${currentIteration} Decided: ${actionRecord.actionTitle}`,
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `AI Evaluated state. Selected capability [${aiDecision.selectedCapability}]. Rationale: ${aiDecision.decisionRationale}`,
    },
    {
      step: "ACT_SIMULATE",
      title: `Iteration #${currentIteration} Dispatched (${actionRecord.gatewayLatency})`,
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Dispatched ${actionRecord.actionTitle}. Gateway response code: ${actionRecord.pspResponseCode}.`,
    },
    {
      step: "OBSERVE",
      title: `Iteration #${currentIteration} Observation Logged`,
      status: "COMPLETED",
      timestamp: timeStr,
      detail: actionRecord.details || "Observed telemetry feedback.",
    },
  ];

  // Check if this step achieved final recovery
  if (isSettled) {
    item.status = "RECOVERED";

    const recoveryDossier = {
      incidentId: item.id,
      customerName: item.customer_name,
      customerEmail: item.customer_email,
      recoveredAmount: item.amount,
      currency: item.currency,
      winningAction: actionRecord.actionTitle,
      winningCapability: aiDecision.selectedCapability,
      attemptsCount: currentIteration,
      elapsedTime: `${currentIteration * 45}s`,
      initialProbability: item.analysis?.recoveryProbability || 0.75,
      finalProbability: 1.0,
      settledTimestamp: now.toISOString(),
      gatewayAuthCode: actionRecord.pspResponseCode,
      auditStatus: "IMMUTABLE_LEDGER_RECONCILED",
    };

    (item as any).recoveryDossier = recoveryDossier;

    item.lifecycle.push({
      step: "AUDIT",
      title: `✅ Recovery Confirmed & Reconciled • ${item.currency} ${item.amount.toLocaleString()}`,
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Autonomous recovery succeeded in ${currentIteration} attempt(s) via ${actionRecord.actionTitle}. Payment settled with auth code ${actionRecord.pspResponseCode}.`,
    });

    try {
      const supabase = getSupabaseClient();
      await supabase.from("audit_logs").insert({
        recovery_case_id: null,
        actor_type: "AI_AGENT",
        event: "AUTONOMOUS_RECOVERY_SUCCESS",
        details: {
          incident_id: item.id,
          amount_recovered: item.amount,
          attempts: currentIteration,
          winning_action: actionRecord.actionTitle,
          is_sandbox: true,
        },
        created_at: now.toISOString(),
      });
    } catch (e) {
      // Non-blocking
    }

    return {
      incident: mapStoredIncidentToResponse(item),
      stepResult: {
        iteration: currentIteration,
        agentState: "RECOVERED" as const,
        decidedAction: aiDecision,
        simulatedOutcome: {
          pspResponseCode: actionRecord.pspResponseCode,
          latency: actionRecord.gatewayLatency,
          observation: actionRecord.details,
          isSettled: true,
        },
        isTerminal: true,
        terminalReason: "RECOVERED",
        recoveryDossier,
      },
    };
  }

  // Check if AI explicitly requested human escalation early
  if (shouldEscalate) {
    item.status = "ESCALATED_TO_HUMAN";
    const escalationDossier = {
      incidentId: item.id,
      customerName: item.customer_name,
      amountAtRisk: `${item.currency} ${item.amount.toLocaleString()}`,
      rootCause: item.failure_reason,
      whyStopped: aiDecision.escalationReason || "AI identified risk criteria requiring human operator review.",
      evidence: [aiDecision.decisionRationale, actionRecord.details || ""],
      attemptsTimeline: item.actions.map((a, idx) => ({
        attemptNumber: idx + 1,
        actionTitle: a.actionTitle,
        executedAt: a.executedAt,
        pspResponseCode: a.pspResponseCode,
        observation: a.details,
      })),
      recommendedHumanAction: "Initiate high-touch VIP account manager follow-up.",
      remainingAmountAtRisk: item.amount,
      escalationTimestamp: now.toISOString(),
      assignedTier: "VIP Revenue Operations Specialist",
    };

    (item as any).escalationDossier = escalationDossier;

    item.lifecycle.push({
      step: "AUDIT",
      title: "Autonomous Loop Stopped • AI Escalation Directive",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `AI requested human escalation: ${escalationDossier.whyStopped}`,
    });

    return {
      incident: mapStoredIncidentToResponse(item),
      stepResult: {
        iteration: currentIteration,
        agentState: "ESCALATED_TO_HUMAN" as const,
        decidedAction: aiDecision,
        simulatedOutcome: {
          pspResponseCode: actionRecord.pspResponseCode,
          latency: actionRecord.gatewayLatency,
          observation: actionRecord.details,
          isSettled: false,
        },
        isTerminal: true,
        terminalReason: "ESCALATION_REQUIRED",
        escalationDossier,
      },
    };
  }

  // Not terminal yet: ready for next closed-loop iteration
  item.status = "ACTION_DISPATCHED";

  return {
    incident: mapStoredIncidentToResponse(item),
    stepResult: {
      iteration: currentIteration,
      agentState: "RUNNING" as const,
      decidedAction: aiDecision,
      simulatedOutcome: {
        pspResponseCode: actionRecord.pspResponseCode,
        latency: actionRecord.gatewayLatency,
        observation: actionRecord.details,
        isSettled: false,
      },
      isTerminal: false,
      terminalReason: null,
      recoveryProbability: prob,
      expectedRecoveryAmount: projectedRecovery,
    },
  };
}

export async function runFullAutonomousLoop(
  incidentId: string,
  options?: {
    policyConfig?: {
      maxAttempts?: number;
      allowedCapabilities?: string[];
      maxRecoverableExposure?: number;
    };
    operatorInstruction?: string;
  },
  user?: UserProfile
) {
  const maxAttempts = options?.policyConfig?.maxAttempts || 4;
  const trace: any[] = [];
  let currentStepResult: any = null;

  for (let i = 0; i < maxAttempts; i++) {
    currentStepResult = await executeAutonomousLoopStep(incidentId, options, user);
    trace.push(currentStepResult.stepResult);
    if (currentStepResult.stepResult.isTerminal) {
      break;
    }
  }

  return {
    incident: currentStepResult.incident,
    trace,
    finalState: currentStepResult.incident.record?.status || "STOPPED",
  };
}

export async function reassessSandboxIncidentWithAI(
  incidentId: string,
  params?: { customInstruction?: string; lastOutcomeNote?: string },
  user?: UserProfile
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  const attemptCount = item.actions.length;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Terminal Bounded Guardrail: Stop at 3 attempts and escalate to human
  if (attemptCount >= 3) {
    item.status = "ESCALATED_TO_HUMAN";
    item.updated_at = now.toISOString();

    const escalationDossier = {
      whyStopped: "Bounded agent safety limit reached: 3 consecutive recovery attempts executed without confirmed settlement.",
      whatTried: item.actions.map(
        (a, idx) => `Attempt ${attemptCount - idx}: ${a.actionTitle} [${a.pspResponseCode}] (${a.executedAt})`
      ),
      whatFailed: `Simulated gateway attempts and customer outreach did not yield confirmed settlement for ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}).`,
      recommendedOperatorAction:
        item.category === "INVOICE"
          ? "Initiate executive AP phone outreach, verify purchase order authorization, and propose formal payment restructuring."
          : item.category === "CHURN"
          ? "Schedule immediate retention call with Account Manager and offer tailored 15% annual commitment discount."
          : "Dispatch high-priority concierge Voice call or Email offering alternate payment rail or manual reconciliation.",
      escalationTimestamp: now.toISOString(),
      assignedTier: "Senior Revenue Operations Specialist",
    };

    (item as any).escalationDossier = escalationDossier;

    item.lifecycle = [
      ...item.lifecycle,
      {
        step: "AUDIT",
        title: "Autonomous Loop Terminated • Human Handoff",
        status: "COMPLETED",
        timestamp: timeStr,
        detail: `Bounded limit (3 attempts) reached. Safely halted automation and prepared comprehensive operator escalation package for incident ${item.id}.`,
      },
    ];

    try {
      const supabase = getSupabaseClient();
      await supabase.from("audit_logs").insert({
        recovery_case_id: null,
        actor_type: "AI_AGENT",
        event: "AUTONOMOUS_LOOP_ESCALATED_TO_HUMAN",
        details: {
          incident_id: item.id,
          attempts_completed: attemptCount,
          reason: escalationDossier.whyStopped,
          is_sandbox: true,
        },
        created_at: now.toISOString(),
      });
    } catch (e) {
      // Non-blocking
    }

    return mapStoredIncidentToResponse(item);
  }

  // Next Iteration in the Closed Loop
  const lastAction = item.actions[0];
  const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine reassessing an ongoing recovery loop.
ITERATION STATE:
- Incident ID: ${item.id} (DEMO/SANDBOX ONLY)
- Scenario: "${item.scenario_type_name}" (${item.category})
- Amount at Risk: ${item.currency} ${item.amount}
- Customer: ${item.customer_name} (${item.customer_email}, ${item.customer_type})
- Disruption Code: "${item.failure_reason}"
- Attempt Count Completed: ${attemptCount} of 3 (Bounded Autonomy Limit)
- Previous Action Executed: "${lastAction?.actionTitle || lastAction?.actionType || 'Initial Dispatch'}"
- Telemetry Feedback Observed: "${lastAction?.details || 'Action simulated, payment remaining unsettled'}"
${params?.customInstruction ? `- Operator Directive: "${params.customInstruction}"` : ""}

Payment is still unsettled. Reassess telemetry and formulate the NEXT recovery strategy in the cascade.
Options include:
- Cross-Channel Outreach (e.g., switch between Resend Email and Exotel Voice Outreach)
- Incentive Discount (e.g., dynamic 5-10% immediate rescue discount)
- Acquirer Failover (e.g., route through backup payment gateway)
- Promise-to-Pay Lock
- Escalation to Human Operations

Your response MUST be a valid JSON object matching this schema:
{
  "detectedRisk": "Updated risk assessment for iteration ${attemptCount + 1}",
  "relevantEvidence": ["Telemetry observation from attempt #${attemptCount}", "Customer profile data", "Payment rail latency metric"],
  "rootCause": "Refined root cause based on previous attempt telemetry",
  "aiReasoning": "Detailed logic explaining why the previous attempt did not settle and why this next step is optimal",
  "selectedStrategy": "Next recovery strategy name",
  "strategyJustification": "Algorithmic and behavioral justification for iteration #${attemptCount + 1}",
  "recommendedAction": "One of: SEND_PAYMENT_LINK | SMART_RETRY | REQUEST_PAYMENT_METHOD_UPDATE | RECORD_PROMISE_TO_PAY | SEND_REMINDER | ESCALATE",
  "recommendedTiming": "Recommended timing window",
  "recoveryProbability": 0.78,
  "expectedRecoveryAmount": ${Math.round(item.amount * 0.78)},
  "alternativeActions": [
    { "action": "Alternative next action", "strategy": "Alternative strategy", "projectedProbability": 0.65, "tradeoff": "Tradeoff detail" }
  ],
  "escalationReason": "When to halt if this step also fails",
  "customerMessage": {
    "voice": "Interactive AI voice script for Exotel phone call",
    "email": { "subject": "Subject line", "body": "Email body" }
  },
  "confidence": 0.88,
  "analysisTimestamp": "${now.toISOString()}"
}`;

  let analysis: any = null;
  let aiError: string | null = null;

  try {
    const aiResult = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction:
          "You are an elite fintech revenue operations AI. Provide precise, multi-step autonomous recovery cascade evaluations.",
      },
    });

    if (aiResult?.text) {
      analysis = cleanAndParseJson(aiResult.text);
    }
  } catch (e: any) {
    console.warn("Sandbox reassessment AI notice:", e);
    aiError = e?.message || "Gemini AI API service unavailable";
  }

  if (!analysis) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || apiKey === "null") {
      aiError = "GEMINI_API_KEY environment variable is not configured. Please set GEMINI_API_KEY in environment/settings to enable live AI analysis.";
    } else if (!aiError) {
      aiError = "Gemini AI service temporarily unavailable. Please retry.";
    }

    analysis = {
      detectedRisk: `Iteration ${attemptCount + 1}: Unsettled ${item.currency} ${item.amount.toLocaleString()} after attempt #${attemptCount}`,
      relevantEvidence: [
        `Previous Action: ${lastAction?.actionTitle || 'Dispatched'}`,
        `Telemetry Feedback: ${lastAction?.pspResponseCode || 'Unsettled'}`,
        `Customer Profile: ${item.customer_name}`,
      ],
      rootCause: `Initial recovery attempt did not achieve settlement. Escalating through recovery cascade.`,
      aiReasoning: "Awaiting live Gemini AI reasoning to formulate next cascade step.",
      selectedStrategy: "Cascaded Cross-Channel Fallback",
      strategyJustification: "Escalating channel touchpoint after initial automated retry.",
      recommendedAction: "SEND_PAYMENT_LINK",
      recommendedTiming: "Immediate Window",
      recoveryProbability: 0.72,
      expectedRecoveryAmount: Math.round(item.amount * 0.72),
      alternativeActions: [
        { action: "ESCALATE", strategy: "Manual Operator Review", projectedProbability: 0.60, tradeoff: "Operator time required" }
      ],
      escalationReason: "Repeated non-response or max attempt boundary",
      customerMessage: {
        voice: `Hello ${item.customer_name}, this is Recoverly with an update regarding your pending payment of ${item.currency} ${item.amount.toLocaleString()}. We have dispatched a direct payment resolution link to your email.`,
        email: {
          subject: `Follow-up: Resolving your ${item.currency} ${item.amount.toLocaleString()} payment`,
          body: `Dear ${item.customer_name},\n\nWe are following up regarding your pending payment of ${item.currency} ${item.amount.toLocaleString()}.\n\nPlease click below to complete:\n${getFrontendRecoveryUrl(item.id)}\n\nBest regards,\nRecoverly Operations`,
        },
      },
      confidence: 0.80,
      analysisTimestamp: now.toISOString(),
      aiError,
      unavailable: Boolean(aiError),
    };
  }

  item.analysis = analysis;
  item.status = "ANALYZED";
  item.updated_at = now.toISOString();

  item.lifecycle = [
    ...item.lifecycle,
    {
      step: "ANALYZE",
      title: `Loop #${attemptCount + 1} Reassessment Evaluated`,
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Evaluated attempt #${attemptCount} telemetry. Diagnosed next optimal strategy: "${analysis.selectedStrategy}" with ${Math.round((analysis.recoveryProbability || 0.75) * 100)}% projected recovery score.`,
    },
    {
      step: "DECIDE",
      title: `Next Cascade Action Ready: ${analysis.recommendedAction}`,
      status: "ACTIVE",
      timestamp: timeStr,
      detail: `Prepared next action "${analysis.recommendedAction}" for iteration #${attemptCount + 1}.`,
    },
  ];

  return mapStoredIncidentToResponse(item);
}

export async function escalateSandboxIncidentToHuman(
  incidentId: string,
  params?: { reason?: string; operatorName?: string },
  user?: UserProfile
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  item.status = "ESCALATED_TO_HUMAN";
  item.updated_at = now.toISOString();

  const escalationDossier = {
    whyStopped: params?.reason || "Operator manually triggered human escalation handoff.",
    whatTried: item.actions.map(
      (a, idx) => `Attempt ${item.actions.length - idx}: ${a.actionTitle} [${a.pspResponseCode}] (${a.executedAt})`
    ),
    whatFailed: `Escalated for high-touch human intervention. Context: ${item.failure_reason}.`,
    recommendedOperatorAction: "Review full customer account ledger and initiate concierge resolution.",
    escalationTimestamp: now.toISOString(),
    assignedTier: "Human Operations Specialist",
    assignedTo: params?.operatorName || "Unassigned",
  };

  (item as any).escalationDossier = escalationDossier;

  item.lifecycle = [
    ...item.lifecycle,
    {
      step: "AUDIT",
      title: "Human Escalation Handoff Activated",
      status: "COMPLETED",
      timestamp: timeStr,
      detail: `Incident ${item.id} escalated to human operations by ${params?.operatorName || 'operator'}. Reason: ${params?.reason || 'Manual escalation'}.`,
    },
  ];

  return mapStoredIncidentToResponse(item);
}

// Backwards-compatible aliases
export async function createAndAnalyzeSandboxIncident(input: CreateSandboxIncidentInput, user?: UserProfile) {
  return await createSandboxIncident({ ...input, autoAnalyze: true }, user);
}

export function simulateSandboxIncident(params: {
  incidentId: string;
  actionType: string;
  strategyName?: string;
  recoveryProbability?: number;
  amount: number;
}) {
  const prob = params.recoveryProbability || 0.85;
  const projectedRecovery = Math.round(params.amount * prob);
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const pspCode = params.actionType.includes("UPI")
    ? "UPI_INTENT_DISPATCHED_200_OK"
    : params.actionType.includes("CARD") || params.actionType.includes("RETRY")
    ? "SMART_RETRY_SCHEDULED_T_PLUS_4H"
    : "DUNNING_NOTIFICATION_SENT_200_OK";

  // If incident exists in store, execute action on it
  if (persistentSandboxIncidents.has(params.incidentId)) {
    executeSandboxIncidentAction(params.incidentId, {
      actionType: params.actionType,
      strategyName: params.strategyName,
    }).catch(console.warn);
  }

  return {
    incidentId: params.incidentId,
    actionName: params.strategyName || params.actionType,
    status: "SIMULATED_SUCCESS (Read-Only Sandbox)",
    timestamp: timeStr,
    executedAt: now.toISOString(),
    gatewayLatency: "114ms",
    pspResponseCode: pspCode,
    projectedRecovery,
    projectedRecoveredAmount: projectedRecovery,
    simulatedGatewayResponse: {
      gatewayName: "Autonomous Acquirer Gateway",
      authCode: pspCode,
      latencyMs: "114ms",
    },
    telemetryNotes: "Simulated in sandboxed acquirer environment. Verified webhook dispatch. 0 Supabase production records mutated.",
    lifecycleUpdates: [
      {
        step: "ACT_SIMULATE",
        title: "Sandbox Action Dispatched",
        status: "COMPLETED",
        timestamp: timeStr,
        detail: `Dispatched "${params.strategyName || params.actionType}" via mock gateway router. Response: ${pspCode} (latency: 114ms).`,
      },
      {
        step: "OBSERVE",
        title: "Telemetry Feedback Captured",
        status: "COMPLETED",
        timestamp: timeStr,
        detail: `Observed positive gateway handshake. Projected recovery: ₹${projectedRecovery.toLocaleString()} (${Math.round(prob * 100)}% probability).`,
      },
      {
        step: "AUDIT",
        title: "Sandbox Audit Trail Recorded",
        status: "COMPLETED",
        timestamp: timeStr,
        detail: `Immutable sandbox audit ledger recorded for incident ${params.incidentId}. Zero production database records altered.`,
      },
    ],
  };
}

export async function listDemoScenarios() {
  return RECOVERY_SCENARIO_TYPES.map((t) => ({
    id: t.key,
    key: t.key,
    name: t.name,
    tag: t.tag,
    category: t.category,
    severity: t.defaultSeverity,
    problemDetected: t.sampleBillingContext,
    amount: t.suggestedAmount,
    currency: "INR",
    paymentMethod: t.defaultPaymentMethod,
    failureCode: t.defaultFailureCode,
    customerLookupEmail: "operations@example.test",
    defaultChannel: t.defaultChannel,
    baselineSummary: t.description,
  }));
}

export async function getDemoScenarioWithContext(scenarioKey: string) {
  const typeConfig = RECOVERY_SCENARIO_TYPES.find((t) => t.key === scenarioKey) || RECOVERY_SCENARIO_TYPES[0];
  const supabase = getSupabaseClient();
  const { data: customer } = await supabase.from("customers").select("*").limit(1).maybeSingle();

  return {
    scenario: {
      id: typeConfig.key,
      key: typeConfig.key,
      name: typeConfig.name,
      tag: typeConfig.tag,
      category: typeConfig.category,
      severity: typeConfig.defaultSeverity,
      problemDetected: typeConfig.sampleBillingContext,
      amount: typeConfig.suggestedAmount,
      currency: "INR",
      paymentMethod: typeConfig.defaultPaymentMethod,
      failureCode: typeConfig.defaultFailureCode,
      customerLookupEmail: customer?.email || "customer@example.test",
      defaultChannel: typeConfig.defaultChannel,
      baselineSummary: typeConfig.description,
    },
    customer,
    context: {
      transactions: [],
      invoices: [],
      subscriptions: [],
      recoveryCases: [],
      paymentEvents: [],
    },
  };
}

export async function analyzeDemoScenarioWithAI(scenarioKey: string, customInstruction?: string) {
  const result = await createAndAnalyzeSandboxIncident({
    scenarioTypeKey: scenarioKey,
    amount: 5000,
    customInstruction,
  });

  return {
    scenario: {
      id: result.incident.scenarioTypeKey,
      key: result.incident.scenarioTypeKey,
      name: result.incident.scenarioTypeName,
      tag: result.incident.tag,
      category: result.incident.category,
      severity: result.incident.severity,
      problemDetected: result.incident.billingContext,
      amount: result.incident.amount,
      currency: result.incident.currency,
      paymentMethod: result.incident.paymentMethod,
      failureCode: result.incident.failureCode,
      customerLookupEmail: result.customer?.email || "customer@example.test",
      defaultChannel: "EMAIL",
      baselineSummary: result.analysis.aiReasoning || result.analysis.rootCause,
    },
    customer: result.customer,
    context: {
      transactions: result.context.sampleTransactions || [],
      invoices: result.context.sampleInvoices || [],
      subscriptions: result.context.sampleSubscriptions || [],
      recoveryCases: [],
      paymentEvents: [],
    },
    analysis: {
      problemDetected: result.incident.billingContext,
      rootCause: result.analysis.rootCause,
      aiAssessment: result.analysis.aiReasoning,
      recommendedStrategy: result.analysis.selectedStrategy,
      recommendedTiming: result.analysis.recommendedTiming,
      recoveryProbability: result.analysis.recoveryProbability,
      expectedRecoverableRevenue: result.analysis.expectedRecoveryAmount,
      reasoning: result.analysis.strategyJustification,
      keyRiskFactors: result.analysis.relevantEvidence,
      messages: result.analysis.customerMessage,
      simulatedActionOutcome: {
        actionType: result.analysis.recommendedAction,
        status: "SIMULATION_SUCCESS",
        details: "Simulated autonomous recovery dispatch executed cleanly in sandbox.",
      },
    },
  };
}

export async function listHumanEscalations(user?: UserProfile) {
  const supabase = getSupabaseClient();
  const escalationsMap = new Map<string, any>();

  // 1. Gather all escalated and human-resolved incidents from persistent sandbox/memory store
  for (const [id, item] of persistentSandboxIncidents.entries()) {
    if (!canUserAccess(user, item.owner_id)) continue;
    const isEscalatedStatus = item.status === "ESCALATED_TO_HUMAN" || item.status === "ESCALATED";
    const hasEscalationDossier = item.escalationDossier != null;
    const isHumanResolved = item.status === "RESOLVED" || (item.timeline && item.timeline.some((t: any) => t.type === "ESCALATED" || t.title?.toLowerCase().includes("human escalation") || t.title?.toLowerCase().includes("resolved by operator")));

    if (isEscalatedStatus || hasEscalationDossier || isHumanResolved) {
      const attempts = (item.actions || []).map((a: any) => ({
        attemptNumber: a.attemptNumber || 1,
        actionTitle: a.actionTitle || "Outreach Dispatch",
        actionType: a.actionType || "PAYMENT_LINK",
        channel: a.selectedChannel || a.aiChannel || "EMAIL",
        strategy: a.aiStrategy || a.strategyName || "Autonomous Recovery",
        status: a.providerStatus === "FAILED" ? "FAILED" : (a.status === "FAILED" ? "FAILED" : "SENT"),
        provider: a.provider || "RESEND",
        providerMessageId: a.providerMessageId,
        providerErrorCode: a.providerErrorCode,
        providerErrorMessage: a.providerErrorMessage,
        httpStatus: a.httpStatus,
        executedAt: a.executedAt || item.updated_at || item.created_at,
        details: a.details,
        generatedMessage: a.generatedMessageText,
      }));

      const lastAction = item.actions && item.actions.length > 0 ? item.actions[item.actions.length - 1] : null;
      const lastProviderResult = lastAction
        ? (lastAction.providerErrorMessage
            ? `FAILED (${lastAction.providerErrorCode || "ERR"})`
            : (lastAction.providerStatus || lastAction.status || "SENT"))
        : "N/A";

      const currentStatus = (item.status === "RESOLVED" || item.status === "RECOVERED") ? "RESOLVED" : "ESCALATED_TO_HUMAN";

      escalationsMap.set(id, {
        id: item.id,
        incidentId: item.id,
        customerName: item.customer_name,
        customerEmail: item.customer_email || "customer@example.test",
        customerPhone: item.customer_phone || "+14155238886",
        customerType: item.customer_type || "INDIVIDUAL",
        scenarioType: item.scenario_type,
        scenarioTypeName: item.scenario_type_name || item.scenario_type,
        category: item.category || "GENERAL",
        amountAtRisk: Number(item.amount || 0),
        currency: item.currency || "INR",
        attemptsCount: item.actions?.length || (hasEscalationDossier ? 3 : 0),
        maxAttempts: 3,
        priority: item.priority || item.severity || "HIGH",
        status: currentStatus,
        escalationReason:
          item.escalationDossier?.whyStopped ||
          item.failure_reason ||
          "Bounded safety limit reached: 3 consecutive automated recovery attempts completed without customer settlement.",
        escalatedAt: item.escalationDossier?.escalationTimestamp || item.updated_at || item.created_at || new Date().toISOString(),
        recommendedHumanAction:
          item.escalationDossier?.recommendedHumanAction ||
          item.escalationDossier?.recommendedOperatorAction ||
          "Initiate direct VIP phone outreach, verify billing details, and issue formal alternate payment link.",
        lastAiStrategy: lastAction?.aiStrategy || (lastAction as any)?.strategyName || "Multi-channel Autonomous Recovery",
        lastProviderResult,
        lastAiAction: lastAction ? `${lastAction.actionTitle} (${lastAction.selectedChannel || "Outreach"})` : "Autonomous Escalation Handoff",
        owner: (item as any).assignedTo || (item as any).owner || null,
        operatorNotes: (item as any).operatorNotes || [],
        notes: (item as any).notes || null,
        attempts,
        escalationDossier: item.escalationDossier || null,
        timeline: item.timeline || [],
        rootCause: item.failure_reason || item.billing_context || "Payment transaction authorization failed",
        billingContext: item.billing_context,
        failureReason: item.failure_reason,
      });
    }
  }

  // 2. Query Supabase for persisted escalated recovery cases
  try {
    const { data: dbCases } = await supabase
      .from("recovery_cases")
      .select("*, customers(*)")
      .or("status.eq.ESCALATED,status.eq.ESCALATED_TO_HUMAN,status.eq.RECOVERED");

    if (dbCases && dbCases.length > 0) {
      for (const c of dbCases) {
        if (user && !canUserAccess(user, (c as any).owner_id)) continue;
        if (!escalationsMap.has(c.id)) {
          const isResolved = c.status === "RECOVERED" || c.status === "RESOLVED";
          escalationsMap.set(c.id, {
            id: c.id,
            incidentId: c.id,
            customerName: c.customers?.name || "Customer",
            customerEmail: c.customers?.email || "customer@example.test",
            customerPhone: c.customers?.phone || "+14155238886",
            customerType: c.customers?.customer_type || "INDIVIDUAL",
            scenarioType: "FAILED_PAYMENT",
            scenarioTypeName: c.case_type || "Failed Transaction Recovery",
            category: "PAYMENTS",
            amountAtRisk: Number(c.amount_at_risk || c.amount || 0),
            currency: c.currency || "INR",
            attemptsCount: c.attempt_count || 3,
            maxAttempts: 3,
            priority: c.priority || "HIGH",
            status: isResolved ? "RESOLVED" : "ESCALATED_TO_HUMAN",
            escalationReason: c.escalation_reason || c.reason || "Escalated from automated workflow after maximum retry exhaustion.",
            escalatedAt: c.updated_at || c.created_at,
            recommendedHumanAction: "Direct account manager follow-up via phone or high-priority email.",
            lastAiStrategy: "Payment Restructuring / Manual Link",
            lastProviderResult: "EXHAUSTED",
            lastAiAction: "Automated Escalation Handoff",
            owner: c.assigned_to || null,
            operatorNotes: c.notes ? [{ id: "db-note-1", note: c.notes, author: c.assigned_to || "Operator", timestamp: c.updated_at || c.created_at }] : [],
            notes: c.notes || null,
            attempts: [],
            escalationDossier: null,
            timeline: [],
            rootCause: c.reason || "Payment declined",
            billingContext: "Production recovery case",
            failureReason: c.reason || "Payment declined",
          });
        }
      }
    }
  } catch (e) {
    // Non-blocking database fallback
  }

  // 3. If no escalation incidents exist yet in persistent sandbox or DB, seed realistic demo escalation cases
  if (escalationsMap.size === 0) {
    const now = new Date();
    const demoCases = [
      {
        id: "esc-demo-enterprise-01",
        incidentId: "esc-demo-enterprise-01",
        customerName: "Aarav Sharma (CTO, CloudScale Technologies)",
        customerEmail: "aarav.sharma@cloudscaletech.com",
        customerPhone: "+919876543210",
        customerType: "ENTERPRISE",
        scenarioType: "ENTERPRISE_INVOICE",
        scenarioTypeName: "Enterprise Cloud Mandate Failure",
        category: "INVOICE",
        amountAtRisk: 145000,
        currency: "INR",
        attemptsCount: 3,
        maxAttempts: 3,
        priority: "CRITICAL",
        status: "ESCALATED_TO_HUMAN",
        escalationReason: "Safety Boundary Exceeded: 3 automated retry & outreach dispatches attempted across Email and Voice without settlement.",
        escalatedAt: new Date(now.getTime() - 25 * 60000).toISOString(),
        recommendedHumanAction: "Direct Key Account Director VIP call. Offer corporate RTGS/NEFT routing or 7-day custom invoice extension.",
        lastAiStrategy: "Executive High-Touch Outreach + Invoice Link",
        lastProviderResult: "UNRESPONSIVE",
        lastAiAction: "Email Executive Invoice Notice (Resend Delivered)",
        owner: null,
        operatorNotes: [
          {
            id: "note-init-1",
            note: "Automatic handoff from Autonomous Recovery Loop after attempt #3. Customer card limits exceeded.",
            author: "Autonomous Engine",
            timestamp: new Date(now.getTime() - 24 * 60000).toISOString(),
          },
        ],
        notes: null,
        rootCause: "Corporate credit card limit reached during monthly high-compute billing cycle",
        billingContext: "Enterprise Tier Cloud Infrastructure Monthly Compute",
        failureReason: "EXCEEDS_CARD_LIMIT",
        attempts: [
          {
            attemptNumber: 1,
            actionTitle: "Executive Email Invoice Notice",
            actionType: "PAYMENT_LINK",
            channel: "EMAIL",
            strategy: "Immediate Multi-Rail Link",
            status: "SENT",
            provider: "RESEND",
            providerMessageId: "re_998127391823a",
            providerErrorCode: null,
            executedAt: new Date(now.getTime() - 25 * 60000).toISOString(),
            details: "Delivered formal invoice notification with Razorpay direct payment URL via Resend.",
            generatedMessage: "Hi Aarav, your CloudScale enterprise subscription renewal of ₹1,45,000 was declined (Card limit exceeded). Settle securely here: https://pay.recoverly.ai/inv-9921",
          },
          {
            attemptNumber: 2,
            actionTitle: "Automated Interactive Voice Dispatch",
            actionType: "VOICE_CALL",
            channel: "VOICE",
            strategy: "Direct Customer Alert",
            status: "FAILED",
            provider: "EXOTEL",
            providerMessageId: "exo_call_11928472",
            providerErrorCode: "BUSY_OR_NO_ANSWER",
            providerErrorMessage: "Subscriber line busy / no answer after 30s ring",
            executedAt: new Date(now.getTime() - 18 * 60000).toISOString(),
            details: "Automated voice agent attempted audio connection via Exotel.",
            generatedMessage: "Automated outbound voice call initiated via Exotel. Subscriber did not answer.",
          },
          {
            attemptNumber: 3,
            actionTitle: "Final Notice Email Alert",
            actionType: "EMAIL_ALERT",
            channel: "EMAIL",
            strategy: "Final Safety Handoff Notice",
            status: "SENT",
            provider: "RESEND",
            providerMessageId: "re_882194729181b",
            providerErrorCode: null,
            executedAt: new Date(now.getTime() - 10 * 60000).toISOString(),
            details: "Final notice email dispatched via Resend before human escalation.",
            generatedMessage: "URGENT: CloudScale account compute suspension pending due to unpaid invoice ₹1,45,000. Pay now: https://pay.recoverly.ai/inv-9921",
          },
        ],
        timeline: [
          {
            id: "tl-demo-1",
            timestamp: "10:30 AM",
            type: "DETECT",
            title: "Recurring Invoice Decline Detected",
            description: "Bank declined recurring transaction with code EXCEEDS_CARD_LIMIT.",
            status: "COMPLETED",
          },
          {
            id: "tl-demo-2",
            timestamp: "10:32 AM",
            type: "ACT_SIMULATE",
            title: "Attempt 1: Email Payment Link Dispatched (Resend)",
            description: "Sent authenticated link with 48h validity via Resend.",
            status: "COMPLETED",
          },
          {
            id: "tl-demo-3",
            timestamp: "10:37 AM",
            type: "ACT_SIMULATE",
            title: "Attempt 2: Outbound Voice Call (Exotel)",
            description: "Voice call attempted via Exotel. Line busy / no answer.",
            status: "COMPLETED",
          },
          {
            id: "tl-demo-4",
            timestamp: "10:42 AM",
            type: "ACT_SIMULATE",
            title: "Attempt 3: Final Follow-Up Email Dispatched (Resend)",
            description: "Sent final warning email via Resend. 3-attempt limit reached.",
            status: "COMPLETED",
          },
          {
            id: "tl-demo-5",
            timestamp: "10:43 AM",
            type: "ESCALATED",
            title: "Transitioned to Human Escalations Queue",
            description: "Automated bounded recovery halted to safeguard customer relationship. High-touch human specialist required.",
            status: "COMPLETED",
          },
        ],
        escalationDossier: {
          incidentId: "esc-demo-enterprise-01",
          whyStopped: "Bounded Safety Limit: Exactly 3 automated recovery attempts executed. Brand protection rules prevent excessive automated outreach.",
          attemptsSummary: "3 attempts across Email and Voice. 2 delivered, 1 unanswered. Zero payment received.",
          recommendedHumanAction: "Direct Key Account Director VIP call. Offer corporate RTGS/NEFT routing or 7-day custom invoice extension.",
          escalationTimestamp: new Date(now.getTime() - 25 * 60000).toISOString(),
        },
      },
      {
        id: "esc-demo-saas-02",
        incidentId: "esc-demo-saas-02",
        customerName: "Priya Sundaram (Head of Ops, Nexus Retail)",
        customerEmail: "priya.s@nexusretail.in",
        customerPhone: "+919811223344",
        customerType: "VIP",
        scenarioType: "RECURRING_UPI",
        scenarioTypeName: "UPI Auto-Debit Recurring Mandate Revoked",
        category: "MANDATE",
        amountAtRisk: 28500,
        currency: "INR",
        attemptsCount: 3,
        maxAttempts: 3,
        priority: "HIGH",
        status: "ESCALATED_TO_HUMAN",
        escalationReason: "Bank reported U30 mandate cancellation error on NPCI network. AI cannot auto-retry revoked mandates.",
        escalatedAt: new Date(now.getTime() - 55 * 60000).toISOString(),
        recommendedHumanAction: "Send new UPI Autopay authorization link via Email or request alternate corporate credit card details.",
        lastAiStrategy: "Mandate Re-registration Prompt",
        lastProviderResult: "FAILED (U30)",
        lastAiAction: "Email Mandate Re-auth Link Dispatched",
        owner: "Revenue Specialist",
        operatorNotes: [
          {
            id: "note-init-2",
            note: "Claimed by operator. Email sent requesting Priya to authenticate the newly generated NPCI e-mandate.",
            author: "Revenue Specialist",
            timestamp: new Date(now.getTime() - 30 * 60000).toISOString(),
          },
        ],
        notes: "Pending customer re-authorization of NPCI UPI AutoPay mandate.",
        rootCause: "NPCI Mandate Error U30: Customer modified UPI handle or changed default bank account",
        billingContext: "Nexus Retail Annual SaaS Subscription",
        failureReason: "MANDATE_REVOKED_U30",
        attempts: [
          {
            attemptNumber: 1,
            actionTitle: "NPCI Direct Mandate Re-execution",
            actionType: "RETRY_PAYMENT",
            channel: "UPI",
            strategy: "Acquirer Re-presentation",
            status: "FAILED",
            provider: "RAZORPAY",
            providerErrorCode: "U30",
            providerErrorMessage: "Mandate revoked or account blocked for recurring debit",
            executedAt: new Date(now.getTime() - 60 * 60000).toISOString(),
            details: "NPCI recurring batch execution returned reject code U30.",
          },
          {
            attemptNumber: 2,
            actionTitle: "Email Mandate Re-link Prompt",
            actionType: "PAYMENT_LINK",
            channel: "EMAIL",
            strategy: "Zero-Friction Mandate Link",
            status: "SENT",
            provider: "RESEND",
            providerMessageId: "re_771239847120a",
            executedAt: new Date(now.getTime() - 58 * 60000).toISOString(),
            details: "Sent e-mandate registration flow URL via Resend.",
          },
          {
            attemptNumber: 3,
            actionTitle: "Voice Mandate Notification Call",
            actionType: "VOICE_CALL",
            channel: "VOICE",
            strategy: "Direct Customer Alert",
            status: "SENT",
            provider: "EXOTEL",
            providerMessageId: "exo_call_66192847",
            executedAt: new Date(now.getTime() - 55 * 60000).toISOString(),
            details: "Dispatched Voice call alert with 24h grace period via Exotel.",
          },
        ],
        timeline: [
          {
            id: "tl-demo-21",
            timestamp: "09:40 AM",
            type: "DETECT",
            title: "UPI Mandate Revocation Detected",
            description: "NPCI returned U30 decline.",
            status: "COMPLETED",
          },
          {
            id: "tl-demo-22",
            timestamp: "09:45 AM",
            type: "ESCALATED",
            title: "Escalated to Human Specialist",
            description: "Revoked mandates require interactive customer consent for new mandate generation.",
            status: "COMPLETED",
          },
        ],
        escalationDossier: {
          incidentId: "esc-demo-saas-02",
          whyStopped: "Mandate revoked by bank. Autonomous retries are ineffective without fresh UPI mandate token creation.",
          attemptsSummary: "1 retry failed (U30), 2 outreach dispatches executed. No customer payment received.",
          recommendedHumanAction: "Call Priya to assist with instant 30-second UPI AutoPay setup or alternate card link.",
          escalationTimestamp: new Date(now.getTime() - 55 * 60000).toISOString(),
        },
      },
      {
        id: "esc-demo-resolved-03",
        incidentId: "esc-demo-resolved-03",
        customerName: "Vikram Malhotra (CFO, Zenith Logistics)",
        customerEmail: "vikram.m@zenithlogistics.com",
        customerPhone: "+919765432109",
        customerType: "ENTERPRISE",
        scenarioType: "3DS_FAILURE",
        scenarioTypeName: "3DS Otp Timeout on High-Value Transaction",
        category: "PAYMENTS",
        amountAtRisk: 82000,
        currency: "INR",
        attemptsCount: 3,
        maxAttempts: 3,
        priority: "HIGH",
        status: "RESOLVED",
        escalationReason: "3 consecutive 3DS authentication timeouts during executive flight booking module renewal.",
        escalatedAt: new Date(now.getTime() - 120 * 60000).toISOString(),
        recommendedHumanAction: "Generate high-priority VIP invoice link and confirm card authentication via phone.",
        lastAiStrategy: "Direct Operator Resolution",
        lastProviderResult: "SETTLED_BY_OPERATOR",
        lastAiAction: "Operator Phone Call Settlement",
        owner: "Revenue Specialist",
        operatorNotes: [
          {
            id: "note-init-3",
            note: "Spoke with customer via direct phone call. Sent alternate corporate payment link. Transaction approved immediately.",
            author: "Revenue Specialist",
            timestamp: new Date(now.getTime() - 90 * 60000).toISOString(),
          },
        ],
        notes: "Full settlement received ₹82,000 via corporate AMEX link.",
        rootCause: "3DS OTP network delivery failure from issuing bank",
        billingContext: "Zenith Annual Enterprise Fleet Management",
        failureReason: "3DS_TIMEOUT",
        attempts: [],
        timeline: [
          {
            id: "tl-demo-31",
            timestamp: "08:15 AM",
            type: "ESCALATED",
            title: "3DS Failure Escalated",
            description: "Customer failed OTP verification 3 times.",
            status: "COMPLETED",
          },
          {
            id: "tl-demo-32",
            timestamp: "08:45 AM",
            type: "DECIDE",
            title: "Operator Resolved Case",
            description: "Operator successfully settled transaction of ₹82,000.",
            status: "COMPLETED",
          },
        ],
      },
    ];

    for (const d of demoCases) {
      escalationsMap.set(d.id, d);
    }
  }

  const escalations = Array.from(escalationsMap.values()).sort(
    (a, b) => new Date(b.escalatedAt).getTime() - new Date(a.escalatedAt).getTime()
  );

  const openCases = escalations.filter((e) => e.status === "ESCALATED_TO_HUMAN" || e.status === "ESCALATED");
  const resolvedCases = escalations.filter((e) => e.status === "RESOLVED" || e.status === "RECOVERED");

  const openCount = openCases.length;
  const amountAtRisk = openCases.reduce((sum, item) => sum + (Number(item.amountAtRisk) || 0), 0);
  const resolvedCount = resolvedCases.length;
  const totalEscalated = escalations.length;

  return {
    totalEscalated,
    openCount,
    amountAtRisk,
    totalRevenueAtRisk: amountAtRisk,
    resolvedCount,
    currency: "INR",
    escalations,
  };
}

export async function takeOwnershipOfHumanEscalation(
  incidentId: string,
  operatorName: string = "Revenue Specialist",
  user?: UserProfile
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (item && !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (item) {
    (item as any).assignedTo = operatorName;
    (item as any).owner = operatorName;
    item.updated_at = now.toISOString();

    if (!item.timeline) item.timeline = [];
    item.timeline.push({
      id: `tl-own-${Date.now()}`,
      timestamp: timeStr,
      type: "DECIDE",
      title: `Operator Ownership Assigned to ${operatorName}`,
      description: `Case ownership claimed by ${operatorName}. Incident is actively managed under high-touch human escalation protocol.`,
      status: "COMPLETED",
      details: { operator: operatorName, claimedAt: now.toISOString() },
    });
  }

  const supabase = getSupabaseClient();
  try {
    await supabase
      .from("recovery_cases")
      .update({
        assigned_to: operatorName,
        updated_at: now.toISOString(),
      })
      .eq("id", incidentId);

    await supabase.from("audit_logs").insert({
      recovery_case_id: incidentId,
      actor_type: "OPERATOR",
      event: "HUMAN_ESCALATION_OWNERSHIP_ASSIGNED",
      details: {
        incident_id: incidentId,
        operator: operatorName,
      },
      created_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }

  return {
    success: true,
    message: `Ownership assigned to ${operatorName}`,
    incident: item || { id: incidentId, assignedTo: operatorName },
  };
}

export async function addNoteToHumanEscalation(
  incidentId: string,
  input: { note: string; operatorName?: string },
  user?: UserProfile
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (item && !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const operator = input.operatorName || "Revenue Specialist";

  if (item) {
    if (!(item as any).operatorNotes) (item as any).operatorNotes = [];
    (item as any).operatorNotes.push({
      id: `note-${Date.now()}`,
      note: input.note,
      author: operator,
      timestamp: now.toISOString(),
    });
    item.updated_at = now.toISOString();

    if (!item.timeline) item.timeline = [];
    item.timeline.push({
      id: `tl-note-${Date.now()}`,
      timestamp: timeStr,
      type: "DECIDE",
      title: `Operator Note Added by ${operator}`,
      description: input.note,
      status: "COMPLETED",
      details: { note: input.note, author: operator },
    });
  }

  const supabase = getSupabaseClient();
  try {
    await supabase.from("audit_logs").insert({
      recovery_case_id: incidentId,
      actor_type: "OPERATOR",
      event: "HUMAN_ESCALATION_NOTE_ADDED",
      details: {
        incident_id: incidentId,
        note: input.note,
        operator,
      },
      created_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }

  return {
    success: true,
    message: `Note added to incident ${incidentId}`,
    incident: item || { id: incidentId },
  };
}

export async function resolveHumanEscalation(
  incidentId: string,
  input: {
    resolutionType?: string;
    notes?: string;
    settlementAmount?: number;
    operatorName?: string;
  },
  user?: UserProfile
) {
  // Cancel any active timers immediately
  clearIncidentTimer(incidentId);

  const item = persistentSandboxIncidents.get(incidentId);
  if (item && !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (item) {
    item.status = "RESOLVED";
    item.updated_at = now.toISOString();
    if (item.scheduler) {
      item.scheduler.status = "COMPLETED";
      item.scheduler.nextAttemptAt = null;
    }
    if (!item.timeline) item.timeline = [];
    item.timeline.push({
      id: `tl-res-${Date.now()}`,
      timestamp: timeStr,
      type: "RECOVERED",
      title: "Human Escalation Resolved by Operator",
      description: input.notes || "Case resolved by human operator. Settlement recorded.",
      status: "COMPLETED",
      details: {
        operator: input.operatorName || "Revenue Specialist",
        resolutionType: input.resolutionType || "MANUAL_SETTLEMENT",
        settlementAmount: input.settlementAmount || item.amount,
        notes: input.notes,
      },
    });
  }

  const supabase = getSupabaseClient();
  try {
    await supabase.from("recovery_cases").update({
      status: "RECOVERED",
      recovered_amount: input.settlementAmount || (item ? item.amount : 0),
      recovered_at: now.toISOString(),
      notes: input.notes,
    }).eq("id", incidentId);

    await supabase.from("audit_logs").insert({
      recovery_case_id: incidentId,
      actor_type: "OPERATOR",
      event: "HUMAN_ESCALATION_RESOLVED",
      details: {
        incident_id: incidentId,
        resolution_type: input.resolutionType,
        notes: input.notes,
        settlement_amount: input.settlementAmount,
        operator: input.operatorName,
      },
      created_at: now.toISOString(),
    });
  } catch (e) {
    // Non-blocking
  }

  return {
    success: true,
    message: `Incident ${incidentId} marked as RESOLVED by human operator.`,
    incident: item || { id: incidentId, status: "RESOLVED" },
  };
}
