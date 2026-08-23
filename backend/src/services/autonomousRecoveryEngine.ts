import { getSupabaseClient } from "./supabaseService.js";
import { GoogleGenAI } from "@google/genai";
import {
  OutboundDeliveryResult,
  sendWhatsAppMessage,
  sendSmsMessage,
  sendEmailMessage,
} from "./messagingService.js";

export interface StoredTimelineEvent {
  id: string;
  timestamp: string;
  type:
    | "DETECT"
    | "ANALYZE"
    | "DECIDE"
    | "ATTEMPT"
    | "TIMER_SCHEDULED"
    | "REASSESS"
    | "RECOVERED"
    | "ESCALATED";
  title: string;
  description: string;
  status: "COMPLETED" | "ACTIVE" | "PENDING" | "FAILED";
  attemptNumber?: number;
  channelDispatches?: OutboundDeliveryResult[];
  details?: any;
}

export interface StoredIncidentScheduler {
  nextAttemptNumber: number; // 1 | 2 | 3
  nextAttemptAt: string | null; // ISO timestamp
  status: "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED" | "ESCALATED";
  scheduledIntervalSec?: number;
}

export interface StoredSandboxIncident {
  id: string;
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
  scheduler?: StoredIncidentScheduler;
  timeline?: StoredTimelineEvent[];
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
    attemptNumber?: number;
    actionType: string;
    actionTitle: string;
    status: string;
    gatewayLatency: string;
    pspResponseCode: string;
    projectedRecovery: number;
    operatorName?: string;
    reason?: string;
    executedAt: string;
    channelDispatches?: OutboundDeliveryResult[];
    details?: string;
  }>;
  escalationDossier?: any;
  recoveryDossier?: any;
  created_at: string;
  updated_at: string;
}

// Global persistent store - starts with ZERO incidents by default
export const persistentSandboxIncidents = new Map<string, StoredSandboxIncident>();

// In-memory active timer handles
const activeTimers = new Map<string, NodeJS.Timeout>();
const executingSet = new Set<string>();

// Gemini Helper
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "null") return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function cleanAndParseJson(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```$/, "").trim();
  }
  return JSON.parse(cleaned);
}

export function mapStoredIncidentToResponse(item: StoredSandboxIncident) {
  return {
    incident: {
      id: item.id,
      label: item.label,
      isSandbox: item.isSandbox,
      scenarioTypeKey: item.scenario_type,
      scenarioTypeName: item.scenario_type_name,
      tag: item.tag,
      category: item.category as any,
      severity: item.severity,
      amount: item.amount,
      currency: item.currency,
      paymentMethod: item.payment_method,
      failureCode: item.failure_reason,
      billingContext: item.billing_context,
      status: item.status || "OPEN",
      scheduler: item.scheduler,
      nextAttemptAt: item.scheduler?.nextAttemptAt || null,
      nextAttemptNumber: item.scheduler?.nextAttemptNumber || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    },
    customer: {
      id: item.customer_id,
      name: item.customer_name,
      email: item.customer_email,
      phone: item.customer_phone || "",
      customer_type: item.customer_type,
      created_at: item.created_at,
    },
    context: item.customer_context,
    analysis: item.analysis,
    lifecycle: item.lifecycle,
    timeline: item.timeline || [],
    actions: item.actions,
    scheduler: item.scheduler,
    escalationDossier: item.escalationDossier,
    recoveryDossier: item.recoveryDossier,
    record: item,
  };
}

// ----------------------------------------------------
// SCHEDULER & AUTONOMOUS RECOVERY LIFECYCLE
// ----------------------------------------------------

export function scheduleAutonomousAttempt(
  incidentId: string,
  attemptNumber: number,
  delayMs: number
) {
  // Clear any existing timer for this incident
  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }

  const item = persistentSandboxIncidents.get(incidentId);
  if (!item) return;

  // Never schedule if terminal
  if (
    item.status === "RECOVERED" ||
    item.status === "RESOLVED" ||
    item.status === "ESCALATED_TO_HUMAN" ||
    item.status === "CANCELLED" ||
    item.status === "CLOSED"
  ) {
    return;
  }

  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  item.scheduler = {
    nextAttemptNumber: attemptNumber,
    nextAttemptAt,
    scheduledIntervalSec: Math.round(delayMs / 1000),
    status: "SCHEDULED",
  };
  item.updated_at = new Date().toISOString();

  // Add timeline entry
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (!item.timeline) item.timeline = [];
  item.timeline.push({
    id: `tl-sched-${attemptNumber}-${Date.now().toString().slice(-4)}`,
    timestamp: timeStr,
    type: "TIMER_SCHEDULED",
    title: `Next Recovery Action Scheduled • Attempt #${attemptNumber}`,
    description: `Countdown active (${Math.round(delayMs / 60000)}m window). Autonomous trigger set for ${new Date(nextAttemptAt).toLocaleTimeString()}.`,
    status: "ACTIVE",
    attemptNumber,
  });

  const timer = setTimeout(() => {
    activeTimers.delete(incidentId);
    executeScheduledAttempt(incidentId, attemptNumber).catch((err) => {
      console.error(`[AutonomousEngine] Error executing Attempt #${attemptNumber} for ${incidentId}:`, err);
    });
  }, delayMs);

  activeTimers.set(incidentId, timer);
}

export async function executeScheduledAttempt(incidentId: string, attemptNumber: number) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item) return null;

  // Idempotency check: Never proceed if terminal or already executing
  if (
    item.status === "RECOVERED" ||
    item.status === "RESOLVED" ||
    item.status === "ESCALATED_TO_HUMAN" ||
    item.status === "CANCELLED" ||
    item.status === "CLOSED"
  ) {
    return mapStoredIncidentToResponse(item);
  }

  const lockKey = `${incidentId}-${attemptNumber}`;
  if (executingSet.has(lockKey)) return mapStoredIncidentToResponse(item);
  executingSet.add(lockKey);

  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // Update scheduler status
    if (item.scheduler) {
      item.scheduler.status = "RUNNING";
    }

    // Determine strategy, messaging, and channels dynamically with Gemini
    let aiDecision: any = null;

    if (attemptNumber === 1 && item.analysis && !item.analysis.unavailable) {
      // Use initial Gemini decision for Attempt 1
      aiDecision = {
        selectedCapability: item.analysis.recommendedAction || "WHATSAPP_OUTREACH",
        actionTitle: item.analysis.selectedStrategy || "Autonomous Omnichannel Outreach",
        decisionRationale: item.analysis.strategyJustification || item.analysis.aiReasoning,
        selectedStrategy: item.analysis.selectedStrategy,
        customerMessage: item.analysis.customerMessage,
        recoveryProbability: item.analysis.recoveryProbability || 0.82,
        pspResponseCode: "OUTREACH_DISPATCHED_200_OK",
        latencyMs: 118,
      };
    } else {
      // Reassess with Gemini using full runtime telemetry from previous attempts
      const pastAttemptsSummary = item.actions
        .map(
          (a, idx) =>
            `Attempt #${a.attemptNumber || idx + 1}: Executed "${a.actionTitle}" (${a.actionType}) at ${a.executedAt}. Status: ${a.status}. Channels: ${a.channelDispatches?.map((c) => `${c.channel} [${c.deliveryLabel}]`).join(", ") || "Simulated"}. Result: ${a.details || "Payment remaining unsettled"}`
        )
        .join("\n");

      const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
You are executing Attempt #${attemptNumber} of 3 (Bounded Autonomy Limit) for Incident ${item.id}.

INCIDENT CONTEXT:
- Problem: "${item.scenario_type_name}" (${item.category})
- Customer: ${item.customer_name} (${item.customer_email}${item.customer_phone ? `, Phone: ${item.customer_phone}` : ""})
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Failure Reason: "${item.failure_reason}"
- Billing Context: "${item.billing_context}"
- Past Attempts Executed:
${pastAttemptsSummary || "No previous attempts executed."}

TASK:
1. Evaluate why previous attempts did not settle and formulate the NEXT optimal recovery strategy.
2. Formulate courteous, high-converting messages tailored with real incident values.
3. Select appropriate channels (e.g. WHATSAPP, SMS, EMAIL).

Respond strictly in valid JSON matching this schema:
{
  "selectedCapability": "One of: WHATSAPP_OUTREACH | SMS_OUTREACH | EMAIL_OUTREACH | SMART_RETRY | CARD_UPDATE_LINK | UPI_REAUTHORIZATION | ALTERNATE_PAYMENT_METHOD | PROMISE_TO_PAY | RETENTION_OFFER",
  "actionTitle": "Descriptive title for this attempt",
  "decisionRationale": "Clear AI reasoning explaining why this intervention was selected",
  "selectedStrategy": "Recovery Strategy Name",
  "channelsToDispatch": ["WHATSAPP", "SMS", "EMAIL"],
  "customerMessage": {
    "whatsapp": "High-converting WhatsApp message body with real name ${item.customer_name} and link https://pay.recoverly.test/resolve/${item.id}",
    "sms": "Concise SMS message with real name and short link",
    "email": {
      "subject": "Email subject line",
      "body": "Detailed professional email body"
    }
  },
  "recoveryProbability": 0.85,
  "telemetryObservation": "Realistic telemetry feedback observed after dispatch",
  "pspResponseCode": "AUTH_OK_200"
}`;

      try {
        const ai = getGeminiClient();
        if (ai) {
          let text: string | undefined;
          const modelsToTry = ["gemini-3.7-flash", "gemini-flash-latest"];
          for (const model of modelsToTry) {
            try {
              const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                  responseMimeType: "application/json",
                  systemInstruction: "You are an elite autonomous fintech revenue operations specialist.",
                },
              });
              if (response.text) {
                text = response.text;
                break;
              }
            } catch (mErr) {
              // Try next valid model
            }
          }
          if (text) {
            aiDecision = cleanAndParseJson(text);
          }
        }
      } catch (err) {
        console.warn("[AutonomousEngine] Gemini reassessment fallback:", err);
      }

      if (!aiDecision || !aiDecision.selectedCapability) {
        // Fallback decision
        aiDecision = {
          selectedCapability: attemptNumber === 2 ? "WHATSAPP_OUTREACH" : "RETENTION_OFFER",
          actionTitle: attemptNumber === 2 ? "Omnichannel Fallback & UPI Intent" : "Dynamic 10% Rescue Incentive",
          decisionRationale: `Attempt #${attemptNumber}: Escalating dunning cadence with omnichannel reminder.`,
          selectedStrategy: attemptNumber === 2 ? "1-Click UPI & WhatsApp Dunning" : "Rescue Incentive Offer",
          channelsToDispatch: ["WHATSAPP", "SMS", "EMAIL"],
          customerMessage: {
            whatsapp: `Hi ${item.customer_name}, following up regarding your pending payment of ${item.currency} ${item.amount.toLocaleString()}. Tap here to resolve securely in 1 click: https://pay.recoverly.test/resolve/${item.id}`,
            sms: `Recoverly: Follow-up on your ${item.currency} ${item.amount.toLocaleString()} payment: https://rcvr.ly/${item.id.slice(-6)}`,
            email: {
              subject: `Reminder: Resolving payment of ${item.currency} ${item.amount.toLocaleString()}`,
              body: `Dear ${item.customer_name},\n\nPlease review and resolve your pending payment of ${item.currency} ${item.amount.toLocaleString()}.\n\nResolve securely: https://pay.recoverly.test/resolve/${item.id}`,
            },
          },
          recoveryProbability: 0.78,
          telemetryObservation: "Dispatched omnichannel notifications. Awaiting customer confirmation.",
          pspResponseCode: "OUTREACH_BATCH_DISPATCHED_200",
        };
      }
    }

    // Prepare outbound messages using actual runtime values (never hardcoded)
    const paymentUrl = `https://pay.recoverly.test/resolve/${item.id}`;
    const waBody =
      aiDecision.customerMessage?.whatsapp ||
      `Hi ${item.customer_name}, we noticed a temporary issue with your payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}). Tap here to resolve securely: ${paymentUrl}`;
    const smsBody =
      aiDecision.customerMessage?.sms ||
      `Recoverly: Resolve your ${item.currency} ${item.amount.toLocaleString()} payment securely: https://rcvr.ly/${item.id.slice(-6)}`;
    const emailSubject =
      aiDecision.customerMessage?.email?.subject ||
      `Action Required: Resolving payment of ${item.currency} ${item.amount.toLocaleString()}`;
    const emailBody =
      aiDecision.customerMessage?.email?.body ||
      `Dear ${item.customer_name},\n\nWe encountered an issue processing your payment of ${item.currency} ${item.amount.toLocaleString()} for ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease click below to complete your payment:\n${paymentUrl}\n\nThank you,\nRecoverly Operations`;

    // Execute Outbound Communications through Real Adapters (Twilio / Resend) with Simulation Fallback
    const channelDispatches: OutboundDeliveryResult[] = await Promise.all([
      sendWhatsAppMessage({
        toPhone: item.customer_phone,
        customerName: item.customer_name,
        messageBody: waBody,
        incidentId: item.id,
        paymentUrl,
      }),
      sendSmsMessage({
        toPhone: item.customer_phone,
        customerName: item.customer_name,
        messageBody: smsBody,
        incidentId: item.id,
        paymentUrl,
      }),
      sendEmailMessage({
        toEmail: item.customer_email,
        customerName: item.customer_name,
        subject: emailSubject,
        bodyText: emailBody,
        incidentId: item.id,
        paymentUrl,
      }),
    ]);

    const prob = aiDecision.recoveryProbability || 0.8;
    const projectedRecovery = Math.round(item.amount * prob);

    const actionRecord = {
      id: `act-att-${attemptNumber}-${Date.now().toString().slice(-4)}`,
      incidentId: item.id,
      attemptNumber,
      actionType: aiDecision.selectedCapability,
      actionTitle: aiDecision.actionTitle || `Autonomous Attempt #${attemptNumber}`,
      status: "EXECUTED",
      gatewayLatency: `${Math.floor(Math.random() * 40 + 95)}ms`,
      pspResponseCode: aiDecision.pspResponseCode || "DISPATCHED_200",
      projectedRecovery,
      operatorName: "Recoverly Autonomous AI Engine",
      reason: aiDecision.decisionRationale,
      executedAt: now.toISOString(),
      channelDispatches,
      details:
        aiDecision.telemetryObservation ||
        `Executed Attempt #${attemptNumber} via ${channelDispatches.map((c) => c.deliveryLabel).join(", ")}.`,
    };

    item.actions.unshift(actionRecord);
    item.status = "ACTION_DISPATCHED";
    item.updated_at = now.toISOString();

    // Add Attempt to Timeline
    if (!item.timeline) item.timeline = [];
    item.timeline.push({
      id: `tl-att-${attemptNumber}-${Date.now().toString().slice(-4)}`,
      timestamp: timeStr,
      type: "ATTEMPT",
      title: `Attempt #${attemptNumber} Executed • ${actionRecord.actionTitle}`,
      description: actionRecord.details || "",
      status: "COMPLETED",
      attemptNumber,
      channelDispatches,
      details: {
        actionType: actionRecord.actionType,
        reason: actionRecord.reason,
      },
    });

    // Check next cadence step based on bounded 3-attempt policy:
    // Attempt 1 -> Schedule Attempt 2 (T+5 minutes, 300_000 ms)
    // Attempt 2 -> Schedule Attempt 3 (T+5 minutes, 300_000 ms)
    // Attempt 3 -> Bounded limit reached -> Escalate to Human
    if (attemptNumber < 3) {
      const nextAttemptNumber = attemptNumber + 1;
      const delayMs = 300_000; // 5 minutes
      scheduleAutonomousAttempt(item.id, nextAttemptNumber, delayMs);
    } else {
      // 3 attempts completed without settlement -> Escalate to human automatically
      item.status = "ESCALATED_TO_HUMAN";
      item.scheduler = {
        nextAttemptNumber: 3,
        nextAttemptAt: null,
        status: "ESCALATED",
      };

      const escalationDossier = {
        incidentId: item.id,
        customerName: item.customer_name,
        customerEmail: item.customer_email,
        customerPhone: item.customer_phone,
        customerType: item.customer_type,
        amountAtRisk: `${item.currency} ${item.amount.toLocaleString()}`,
        originalProblem: item.scenario_type_name,
        rootCause: item.failure_reason,
        whyStopped: `Bounded safety limit reached: 3 consecutive automated recovery attempts executed without confirmed customer settlement.`,
        evidence: [
          `Scenario: ${item.scenario_type_name} (${item.category})`,
          `Amount: ${item.currency} ${item.amount.toLocaleString()}`,
          `Customer Profile: ${item.customer_name} (${item.customer_context.transactionsCount} txns, ${item.customer_context.invoicesCount} invs)`,
        ],
        attemptsTimeline: item.actions.map((a) => ({
          attemptNumber: a.attemptNumber,
          actionTitle: a.actionTitle,
          actionType: a.actionType,
          executedAt: a.executedAt,
          channels: a.channelDispatches?.map((c) => ({
            channel: c.channel,
            status: c.status,
            deliveryLabel: c.deliveryLabel,
            isReal: c.isRealDispatch,
            providerId: c.providerMessageId,
          })),
          observation: a.details,
        })),
        aiReasoning: "Customer did not complete payment across WhatsApp, SMS, and Email outreach windows.",
        recommendedHumanAction:
          item.category === "INVOICE"
            ? "Initiate executive AP phone outreach, verify purchase order authorization, and propose formal payment restructuring."
            : item.category === "CHURN"
            ? "Schedule high-touch retention call with Account Executive and offer tailored 15% annual commitment discount."
            : "Dispatch VIP concierge WhatsApp message offering alternate UPI/NetBanking rail or manual reconciliation.",
        remainingAmountAtRisk: item.amount,
        currentRecoveryProbability: 0.35,
        escalationTimestamp: now.toISOString(),
        assignedTier: "VIP Revenue Operations Specialist",
      };

      item.escalationDossier = escalationDossier;

      item.timeline.push({
        id: `tl-esc-${Date.now().toString().slice(-4)}`,
        timestamp: timeStr,
        type: "ESCALATED",
        title: `🚨 Human Escalation Required • 3 Attempts Completed`,
        description: `Bounded safety limit reached without payment confirmation. Prepared comprehensive escalation package for VIP Revenue Operations team.`,
        status: "COMPLETED",
        details: escalationDossier,
      });

      // Log to Supabase audit trail
      try {
        const supabase = getSupabaseClient();
        await supabase.from("audit_logs").insert({
          recovery_case_id: null,
          actor_type: "AI_AGENT",
          event: "AUTONOMOUS_RECOVERY_ESCALATED_TO_HUMAN",
          details: {
            incident_id: item.id,
            attempts: 3,
            reason: escalationDossier.whyStopped,
            is_sandbox: true,
          },
          created_at: now.toISOString(),
        });
      } catch (e) {
        // Non-blocking
      }
    }

    return mapStoredIncidentToResponse(item);
  } finally {
    executingSet.delete(lockKey);
  }
}

export function markSandboxIncidentPaid(incidentId: string, operatorName = "Operator") {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  // Cancel any pending timers
  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  item.status = "RECOVERED";
  item.scheduler = {
    nextAttemptNumber: item.scheduler?.nextAttemptNumber || 1,
    nextAttemptAt: null,
    status: "COMPLETED",
  };

  const recoveryDossier = {
    incidentId: item.id,
    customerName: item.customer_name,
    customerEmail: item.customer_email,
    recoveredAmount: item.amount,
    currency: item.currency,
    winningAction: "Manual Payment Confirmation & Ledger Settlement",
    attemptsCount: item.actions.length,
    settledTimestamp: now.toISOString(),
    confirmedBy: operatorName,
    auditStatus: "IMMUTABLE_LEDGER_RECONCILED",
  };

  item.recoveryDossier = recoveryDossier;
  item.updated_at = now.toISOString();

  if (!item.timeline) item.timeline = [];
  item.timeline.push({
    id: `tl-rec-${Date.now().toString().slice(-4)}`,
    timestamp: timeStr,
    type: "RECOVERED",
    title: `✅ Payment Confirmed & Reconciled • ${item.currency} ${item.amount.toLocaleString()}`,
    description: `Payment marked as paid by ${operatorName}. Autonomous workflow successfully stopped; ledger updated.`,
    status: "COMPLETED",
    details: recoveryDossier,
  });

  // Log to audit trail
  try {
    const supabase = getSupabaseClient();
    supabase
      .from("audit_logs")
      .insert({
        recovery_case_id: null,
        actor_type: "OPERATOR",
        event: "SANDBOX_INCIDENT_MARKED_PAID",
        details: {
          incident_id: item.id,
          amount_recovered: item.amount,
          confirmed_by: operatorName,
          is_sandbox: true,
        },
        created_at: now.toISOString(),
      })
      .then();
  } catch (e) {
    // Non-blocking
  }

  return mapStoredIncidentToResponse(item);
}

export function customerResolveIncident(
  incidentId: string,
  paymentDetails?: { method?: string; notes?: string }
) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  // Cancel any pending timers immediately
  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  item.status = "RECOVERED";
  item.scheduler = {
    nextAttemptNumber: item.scheduler?.nextAttemptNumber || 1,
    nextAttemptAt: null,
    status: "COMPLETED",
  };

  const recoveryDossier = {
    incidentId: item.id,
    customerName: item.customer_name,
    customerEmail: item.customer_email,
    customerPhone: item.customer_phone,
    recoveredAmount: item.amount,
    currency: item.currency,
    winningAction: "Customer Self-Service Payment & Re-authorization",
    attemptsCount: item.actions.length,
    settledTimestamp: now.toISOString(),
    confirmedBy: "Customer via Sandbox Payment Link",
    paymentMethod: paymentDetails?.method || item.payment_method || "UPI / Card",
    auditStatus: "IMMUTABLE_LEDGER_RECONCILED",
  };

  item.recoveryDossier = recoveryDossier;
  item.updated_at = now.toISOString();

  if (!item.timeline) item.timeline = [];
  item.timeline.push({
    id: `tl-rec-${Date.now().toString().slice(-4)}`,
    timestamp: timeStr,
    type: "RECOVERED",
    title: `✅ Payment Recovered by Customer • ${item.currency} ${item.amount.toLocaleString()}`,
    description: `Customer authenticated via self-serve link and authorized payment via ${paymentDetails?.method || "UPI / Card"}. Autonomous workflow halted; ledger reconciled.`,
    status: "COMPLETED",
    details: recoveryDossier,
  });

  // Log to Supabase audit trail
  try {
    const supabase = getSupabaseClient();
    supabase
      .from("audit_logs")
      .insert({
        recovery_case_id: null,
        actor_type: "CUSTOMER",
        event: "CUSTOMER_RESOLVED_PAYMENT",
        details: {
          incident_id: item.id,
          customer_email: item.customer_email,
          customer_phone: item.customer_phone,
          amount_recovered: item.amount,
          settled_timestamp: now.toISOString(),
          payment_method: paymentDetails?.method || item.payment_method,
          is_sandbox: true,
        },
        created_at: now.toISOString(),
      })
      .then();
  } catch (e) {
    // Non-blocking
  }

  return mapStoredIncidentToResponse(item);
}

export async function triggerScheduledAttemptNow(incidentId: string) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }

  const attemptNumber = item.scheduler?.nextAttemptNumber || 1;
  return await executeScheduledAttempt(incidentId, attemptNumber);
}

export function cancelScheduledRecovery(incidentId: string, reason = "Cancelled by operator") {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  item.status = "CANCELLED";
  item.scheduler = {
    nextAttemptNumber: item.scheduler?.nextAttemptNumber || 1,
    nextAttemptAt: null,
    status: "CANCELLED",
  };
  item.updated_at = now.toISOString();

  if (!item.timeline) item.timeline = [];
  item.timeline.push({
    id: `tl-cancel-${Date.now().toString().slice(-4)}`,
    timestamp: timeStr,
    type: "ESCALATED",
    title: `Autonomous Recovery Workflow Cancelled`,
    description: `Workflow halted. Reason: ${reason}`,
    status: "COMPLETED",
  });

  return mapStoredIncidentToResponse(item);
}

// Background Tick Worker (Guarantees execution even if clock drifts)
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of persistentSandboxIncidents.entries()) {
    if (
      (item.status === "ACTIVE" || item.status === "ANALYZED" || item.status === "ACTION_DISPATCHED") &&
      item.scheduler?.nextAttemptAt &&
      item.scheduler.status === "SCHEDULED"
    ) {
      const scheduledTime = new Date(item.scheduler.nextAttemptAt).getTime();
      if (scheduledTime <= now) {
        const attemptNum = item.scheduler.nextAttemptNumber || 1;
        executeScheduledAttempt(id, attemptNum).catch(console.error);
      }
    }
  }
}, 5000);
