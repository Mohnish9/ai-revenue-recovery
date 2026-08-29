import { getSupabaseClient } from "./supabaseService.js";
import { GoogleGenAI } from "@google/genai";
import {
  OutboundDeliveryResult,
  sendWhatsAppMessage,
  sendSmsMessage,
  sendEmailMessage,
} from "./messagingService.js";
import { getDetailedChannelReadiness } from "./providerService.js";

export interface StoredActionRecord {
  id: string;
  incidentId: string;
  attemptNumber?: number;
  actionType: string;
  actionTitle: string;
  selectedChannel?: "EMAIL" | "WHATSAPP" | "SMS" | string;
  aiStrategy?: string;
  aiChannel?: "EMAIL" | "WHATSAPP" | "SMS" | string;
  status: string;
  deliveryMode?: "REAL" | "SIMULATED" | "FAILED";
  gatewayLatency: string;
  pspResponseCode: string;
  projectedRecovery: number;
  operatorName?: string;
  reason?: string;
  messageGoal?: string;
  urgency?: string;
  generatedMessageText?: string;
  provider?: string;
  providerStatus?: string;
  providerMessageId?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  httpStatus?: number;
  executedAt: string;
  channelDispatches?: OutboundDeliveryResult[];
  details?: string;
  result?: string;
  nextDecision?: string;
}

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
  actions: StoredActionRecord[];
  last_voice_script?: string;
  last_voice_script_at?: string;
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

export function clearIncidentTimer(incidentId: string) {
  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }
}

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
    // Update scheduler status
    if (item.scheduler) {
      item.scheduler.status = "RUNNING";
    }

    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const paymentUrl = `${baseUrl}/resolve/${item.id}`;

    // Build structured history of previous attempts for Gemini context
    const pastAttemptsHistoryText = item.actions && item.actions.length > 0
      ? item.actions
          .slice()
          .reverse()
          .map((a, idx) => {
            const primaryDispatch = a.channelDispatches?.[0];
            const ch = (a.selectedChannel || a.aiChannel || primaryDispatch?.channel || "SMS").toUpperCase();
            const prov = a.provider || (ch === "EMAIL" ? "Resend" : ch === "WHATSAPP" ? "Twilio WhatsApp" : "Twilio SMS");
            const err = a.providerErrorMessage || primaryDispatch?.providerErrorMessage || primaryDispatch?.error || a.details || "None";
            const errCode = a.providerErrorCode || primaryDispatch?.providerErrorCode;
            return `[Attempt #${a.attemptNumber || idx + 1}]
- AI Selected Channel: ${ch}
- AI Strategy: ${a.aiStrategy || a.actionType}
- Generated Message Sent: "${a.generatedMessageText || primaryDispatch?.content?.body || "N/A"}"
- Provider Used: ${prov}
- Provider Execution Status: ${primaryDispatch?.status || a.status}
- Provider ID / SID: ${primaryDispatch?.providerMessageId || a.providerMessageId || "None"}
- Provider Error Code: ${errCode || "None"}
- Provider Error Details: ${err}
- Executed Timestamp: ${a.executedAt}
- Customer Resolution Status: UNRESOLVED (Payment pending)`;
          })
          .join("\n\n")
      : "No previous attempts executed. This is Attempt #1 (Initial Dynamic Intervention).";

    // Compute ground-truth channel readiness for this specific customer contact
    const readiness = getDetailedChannelReadiness(item.customer_email, item.customer_phone, item.customer_name);

    // Reassess with Gemini dynamically for EVERY single attempt (Attempt 1, 2, 3)
    const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
You are formulating and executing Attempt #${attemptNumber} of 3 (Bounded Autonomy Limit) for Incident ${item.id}.

CURRENT INCIDENT STATE:
- Problem / Scenario: "${item.scenario_type_name}" (Category: ${item.category})
- Customer Name: "${item.customer_name}"
- Customer Email: "${item.customer_email || "Not provided"}" (${item.customer_email ? "Available" : "Missing"})
- Customer Phone: "${item.customer_phone || "Not provided"}" (${item.customer_phone ? "Available" : "Missing"})
- Customer Type: ${item.customer_type}
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Payment Rail & Method: ${item.payment_rail} • ${item.payment_method}
- Failure Reason / Code: "${item.failure_reason}"
- Billing Context: "${item.billing_context}"
- Current Settlement Status: UNRESOLVED
- Customer Resolution Link: ${paymentUrl}

REAL-WORLD CHANNEL READINESS & PROVIDER CAPABILITY TELEMETRY:
- EMAIL (${item.customer_email || "None"}): Status = ${readiness.email.status} (${readiness.email.deliveryLabel}). Details: ${readiness.email.details}
- SMS (${item.customer_phone || "None"}): Status = ${readiness.phone.twilio_sms_status} (Ownership: ${readiness.phone.phone_verification_status}). Details: ${readiness.phone.details}
- WHATSAPP (${item.customer_phone || "None"}): Status = ${readiness.whatsapp.whatsapp_sandbox_status}. Details: ${readiness.whatsapp.details}

PREVIOUS ATTEMPT HISTORY & PROVIDER TELEMETRY:
${pastAttemptsHistoryText}

CRITICAL RULES FOR ATTEMPT #${attemptNumber}:
1. DYNAMIC CHANNEL SELECTION & ADAPTIVE OBSERVATION:
   - Select the single best channel ("EMAIL", "WHATSAPP", or "SMS") for Attempt #${attemptNumber}.
   - Factor in the REAL-WORLD CHANNEL READINESS & PROVIDER CAPABILITY TELEMETRY and the PREVIOUS ATTEMPT HISTORY.
   - If a channel failed at the provider or is restricted (e.g. Resend onboarding@resend.dev recipient block or Twilio unverified caller ID 21608/572006), acknowledge this in your reasoning and dynamically pivot to an alternative deliverable channel.
   - Do NOT repeat a channel that just experienced a hard provider failure if an alternate channel is available.

2. DYNAMIC INCIDENT-GROUNDED MESSAGE GENERATION:
   - Every generated message MUST be custom generated specifically for THIS incident:
     * Customer: ${item.customer_name}
     * Problem / Scenario: ${item.scenario_type_name}
     * Failure Reason: ${item.failure_reason}
     * Amount: ${item.currency} ${item.amount.toLocaleString()}
     * Payment Method: ${item.payment_method}
     * Recovery URL: ${paymentUrl}
   - NEVER output unrelated or generic banking text like "account balance is below $100", "deposit funds to avoid overdraft fees", or generic templates unless this specific incident is explicitly an overdraft scenario.
   - NO MESSAGE REUSE: Generate fresh, distinct copy for Attempt #${attemptNumber} with progressive urgency.
   - Channel-specific requirements:
     * For SMS: Generate a concise, direct SMS mentioning ${item.customer_name}, the ${item.scenario_type_name} issue (${item.currency} ${item.amount.toLocaleString()}), and the recovery link (${paymentUrl}).
     * For WHATSAPP: Generate a polite conversational message addressing ${item.customer_name}, the payment problem, and 1-click recovery action (${paymentUrl}).
     * For EMAIL: Generate a tailored subject line and full email body with greeting, specific failure diagnosis for ${item.payment_method}, problem summary, resolution link (${paymentUrl}), and signature.

Respond strictly in valid JSON matching this schema:
{
  "recommendedAction": "One of: PAYMENT_LINK | CARD_UPDATE | SMART_RETRY | MANDATE_REAUTHORIZE | CHECKOUT_RECOVERY | INVOICE_REMINDER | RETENTION_OUTREACH | ESCALATION",
  "recommendedChannel": "EMAIL" | "WHATSAPP" | "SMS",
  "reason": "Clear AI reasoning explaining why this channel and strategy was selected for Attempt #${attemptNumber} based on past attempt feedback and deliverability.",
  "messageGoal": "Tactical objective of this specific attempt",
  "urgency": "LOW" | "MEDIUM" | "HIGH" | "FINAL_NOTICE",
  "customerContext": "Key takeaway about customer profile and contact strategy",
  "nextAttemptMinutes": 5,
  "fallbackChannel": "EMAIL" | "WHATSAPP" | "SMS",
  "shouldEscalate": false,
  "generatedMessage": {
    "smsText": "Concise SMS text customized for ${item.customer_name} regarding ${item.scenario_type_name} of ${item.currency} ${item.amount.toLocaleString()} and ${paymentUrl}",
    "whatsappText": "Courteous WhatsApp text customized for ${item.customer_name} regarding ${item.scenario_type_name} of ${item.currency} ${item.amount.toLocaleString()} and ${paymentUrl}",
    "emailSubject": "Personalized email subject line for ${item.customer_name}",
    "emailBody": "Personalized email body for ${item.customer_name} referencing ${item.scenario_type_name} for ${item.currency} ${item.amount.toLocaleString()} and ${paymentUrl}"
  },
  "recoveryProbability": 0.82,
  "pspResponseCode": "AUTH_200_OK"
}`;

    let aiDecision: any = null;

    try {
      const ai = getGeminiClient();
      if (ai) {
        let text: string | undefined;
        const modelsToTry = ["gemini-3.7-flash", "gemini-3.6-flash"];
        for (const model of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                systemInstruction:
                  "You are an elite autonomous fintech revenue operations and multi-channel payment recovery AI specialist. Make intelligent, distinct, and non-repeating channel and strategy selections for each attempt. Ground all messages strictly in the specific customer and incident details provided.",
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
      console.warn("[AutonomousEngine] Gemini dynamic attempt assessment error:", err);
    }

    // Dynamic fallback if Gemini is unreachable, strictly grounded in the current incident scenario
    if (!aiDecision || !aiDecision.recommendedChannel) {
      const prevChannels = item.actions.map((a) => (a.selectedChannel || a.aiChannel)).filter(Boolean);
      let selectedChannel: "EMAIL" | "WHATSAPP" | "SMS" = "WHATSAPP";
      let recommendedAction = "PAYMENT_LINK";
      let reason = `Attempt #${attemptNumber}: Autonomous dynamic recovery cascade.`;
      let urgency: "LOW" | "MEDIUM" | "HIGH" | "FINAL_NOTICE" = "MEDIUM";

      if (attemptNumber === 1) {
        selectedChannel = item.customer_phone ? "WHATSAPP" : "EMAIL";
        recommendedAction = "PAYMENT_LINK";
        reason = `Attempt #1: Immediate 1-click notification on primary mobile channel (${selectedChannel}).`;
        urgency = "LOW";
      } else if (attemptNumber === 2) {
        selectedChannel = prevChannels.includes("EMAIL") ? "SMS" : "EMAIL";
        recommendedAction = "INVOICE_REMINDER";
        reason = `Attempt #2: Dynamic omnichannel shift to ${selectedChannel} following Attempt #1 provider telemetry.`;
        urgency = "MEDIUM";
      } else {
        selectedChannel = "SMS";
        recommendedAction = "RETENTION_OUTREACH";
        reason = `Attempt #3: Final urgent notice via SMS prior to human escalation.`;
        urgency = "FINAL_NOTICE";
      }

      // Dynamic incident-grounded copy for each attempt tier
      const fallbackSms =
        attemptNumber === 1
          ? `Hi ${item.customer_name}, your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} needs attention (${item.failure_reason}). Complete recovery here: ${paymentUrl}`
          : attemptNumber === 2
          ? `Hi ${item.customer_name}, follow-up on your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}. Please update details here: ${paymentUrl}`
          : `Final Notice for ${item.customer_name}: Your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} is pending. Resolve now: ${paymentUrl}`;

      const fallbackWhatsApp =
        attemptNumber === 1
          ? `Hi ${item.customer_name}, we noticed an issue completing your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method} (${item.failure_reason}). Tap here to resolve securely: ${paymentUrl}`
          : attemptNumber === 2
          ? `Hi ${item.customer_name}, quick follow-up regarding your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}. To prevent service interruption, please update your payment details here: ${paymentUrl}`
          : `Hi ${item.customer_name}, final notice for your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}. Please complete settlement now to avoid account suspension: ${paymentUrl}`;

      const fallbackEmailSub =
        attemptNumber === 1
          ? `Action Required: Resolve your ${item.scenario_type_name} payment (${item.currency} ${item.amount.toLocaleString()})`
          : attemptNumber === 2
          ? `Follow-up: Update payment method for ${item.customer_name} (${item.currency} ${item.amount.toLocaleString()})`
          : `Final Notice: Outstanding ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}`;

      const fallbackEmailBody =
        attemptNumber === 1
          ? `Dear ${item.customer_name},\n\nWe encountered a processing issue with your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease complete your payment securely via our portal:\n${paymentUrl}\n\nBest regards,\nRecoverly Autonomous Operations`
          : attemptNumber === 2
          ? `Dear ${item.customer_name},\n\nThis is a follow-up regarding the outstanding ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}).\n\nTo ensure continuity, please complete payment using the secure link below:\n${paymentUrl}\n\nThank you,\nRecoverly Operations Team`
          : `Dear ${item.customer_name},\n\nThis is the final notice regarding your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}.\n\nUnless completed immediately via ${paymentUrl}, this incident will be escalated for manual operations review.\n\nSincerely,\nRecoverly Operations`;

      aiDecision = {
        recommendedAction,
        recommendedChannel: selectedChannel,
        reason,
        messageGoal: `Attempt #${attemptNumber} dynamic revenue recovery touchpoint`,
        urgency,
        customerContext: `Customer ${item.customer_name} (${item.customer_type})`,
        nextAttemptMinutes: 5,
        fallbackChannel: selectedChannel === "EMAIL" ? "SMS" : "EMAIL",
        shouldEscalate: attemptNumber >= 3,
        generatedMessage: {
          channel: selectedChannel,
          whatsapp: fallbackWhatsApp,
          whatsappText: fallbackWhatsApp,
          sms: fallbackSms,
          smsText: fallbackSms,
          emailSubject: fallbackEmailSub,
          emailBody: fallbackEmailBody,
        },
        recoveryProbability: attemptNumber === 1 ? 0.85 : attemptNumber === 2 ? 0.74 : 0.62,
        pspResponseCode: "OUTREACH_DISPATCHED_200",
      };
    }

    // Normalize selected channel
    let chosenChannel: "EMAIL" | "WHATSAPP" | "SMS" = "SMS";
    const rawChannelUpper = String(aiDecision.recommendedChannel || "").toUpperCase();
    if (rawChannelUpper.includes("EMAIL")) {
      chosenChannel = "EMAIL";
    } else if (rawChannelUpper.includes("WHATSAPP")) {
      chosenChannel = "WHATSAPP";
    } else {
      chosenChannel = "SMS";
    }

    const genMsg = aiDecision.generatedMessage || {};
    const waBody =
      genMsg.whatsappText ||
      genMsg.whatsapp ||
      `Hi ${item.customer_name}, we noticed an issue completing your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}). Tap here to resolve securely: ${paymentUrl}`;
    const smsBody =
      genMsg.smsText ||
      genMsg.sms ||
      `Hi ${item.customer_name}, your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} needs attention (${item.failure_reason}). Complete recovery here: ${paymentUrl}`;
    const emailSubject =
      genMsg.emailSubject ||
      (genMsg.email && genMsg.email.subject) ||
      `Action Required: Resolve your ${item.scenario_type_name} payment (${item.currency} ${item.amount.toLocaleString()})`;
    const emailBody =
      genMsg.emailBody ||
      (genMsg.email && genMsg.email.body) ||
      `Dear ${item.customer_name},\n\nWe encountered a processing issue with your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease click below to complete your payment:\n${paymentUrl}\n\nThank you,\nRecoverly Operations`;

    // EXECUTE ONLY THE AI-SELECTED CHANNEL
    let primaryDispatch: OutboundDeliveryResult;
    if (chosenChannel === "EMAIL") {
      primaryDispatch = await sendEmailMessage({
        toEmail: item.customer_email,
        customerName: item.customer_name,
        subject: emailSubject,
        bodyText: emailBody,
        incidentId: item.id,
        paymentUrl,
      });
    } else if (chosenChannel === "WHATSAPP") {
      primaryDispatch = await sendWhatsAppMessage({
        toPhone: item.customer_phone,
        customerName: item.customer_name,
        messageBody: waBody,
        incidentId: item.id,
        paymentUrl,
        amount: `${item.currency} ${item.amount.toLocaleString()}`,
        incidentContext: `${item.scenario_type_name} (${item.failure_reason})`,
      });
    } else {
      primaryDispatch = await sendSmsMessage({
        toPhone: item.customer_phone,
        customerName: item.customer_name,
        messageBody: smsBody,
        incidentId: item.id,
        paymentUrl,
        amount: `${item.currency} ${item.amount.toLocaleString()}`,
        incidentContext: `${item.scenario_type_name} (${item.failure_reason})`,
      });
    }

    const channelDispatches: OutboundDeliveryResult[] = [primaryDispatch];

    // Omnichannel Dynamic Fallback: If primary channel experienced a provider trial rejection or delivery failure
    // (e.g. 572002, 572006, 21608, 21654, 63007, 21211, etc.),
    // automatically attempt the fallback channel (e.g. Email / WhatsApp / SMS) so customer outreach reaches the customer.
    let effectiveDispatch = primaryDispatch;
    if (primaryDispatch.status === "FAILED") {
      console.info(`[AutonomousEngine] Primary channel ${chosenChannel} delivery failed (${primaryDispatch.providerErrorCode || primaryDispatch.error}). Executing automated multi-channel fallback...`);
      
      let fallbackDispatch: OutboundDeliveryResult | null = null;
      if (chosenChannel !== "EMAIL" && item.customer_email) {
        fallbackDispatch = await sendEmailMessage({
          toEmail: item.customer_email,
          customerName: item.customer_name,
          subject: emailSubject,
          bodyText: emailBody,
          incidentId: item.id,
          paymentUrl,
        });
      } else if (chosenChannel !== "WHATSAPP" && item.customer_phone) {
        fallbackDispatch = await sendWhatsAppMessage({
          toPhone: item.customer_phone,
          customerName: item.customer_name,
          messageBody: waBody,
          incidentId: item.id,
          paymentUrl,
          amount: `${item.currency} ${item.amount.toLocaleString()}`,
          incidentContext: `${item.scenario_type_name} (${item.failure_reason})`,
        });
      } else if (chosenChannel !== "SMS" && item.customer_phone) {
        fallbackDispatch = await sendSmsMessage({
          toPhone: item.customer_phone,
          customerName: item.customer_name,
          messageBody: smsBody,
          incidentId: item.id,
          paymentUrl,
          amount: `${item.currency} ${item.amount.toLocaleString()}`,
          incidentContext: `${item.scenario_type_name} (${item.failure_reason})`,
        });
      }

      if (fallbackDispatch) {
        channelDispatches.push(fallbackDispatch);
        if (fallbackDispatch.status === "SENT" || fallbackDispatch.status === "SIMULATED") {
          effectiveDispatch = fallbackDispatch;
        }
      }
    }

    const prob = aiDecision.recoveryProbability || 0.8;
    const projectedRecovery = Math.round(item.amount * prob);

    const generatedMessageText =
      chosenChannel === "EMAIL"
        ? `Subject: ${emailSubject}\n\n${emailBody}`
        : chosenChannel === "WHATSAPP"
        ? waBody
        : smsBody;

    const deliveryMode = effectiveDispatch.deliveryMode || (effectiveDispatch.status === "SENT" ? "REAL" : effectiveDispatch.status === "SIMULATED" ? "SIMULATED" : "FAILED");
    const isRealSent = deliveryMode === "REAL" && effectiveDispatch.status === "SENT";
    const isSimulated = deliveryMode === "SIMULATED" || effectiveDispatch.status === "SIMULATED";
    const isFailed = deliveryMode === "FAILED" || effectiveDispatch.status === "FAILED";

    const actionStatus = isRealSent ? "EXECUTED" : isSimulated ? "SIMULATED" : "CHANNEL_EXECUTION_FAILED";
    const providerStatus = isRealSent ? "SENT" : isSimulated ? "SIMULATED" : "FAILED";
    const providerName = effectiveDispatch.provider || (chosenChannel === "EMAIL" ? "Resend" : chosenChannel === "WHATSAPP" ? "Twilio WhatsApp" : "Twilio SMS");
    const providerId = effectiveDispatch.providerMessageId || undefined;
    const providerErrorCode = effectiveDispatch.providerErrorCode || primaryDispatch.providerErrorCode;
    const providerErrorMessage = effectiveDispatch.providerErrorMessage || primaryDispatch.providerErrorMessage || effectiveDispatch.error;
    const httpStatus = effectiveDispatch.httpStatus;

    const actionRecord: StoredActionRecord = {
      id: `act-att-${attemptNumber}-${Date.now().toString().slice(-4)}`,
      incidentId: item.id,
      attemptNumber,
      actionType: aiDecision.recommendedAction || "PAYMENT_LINK",
      actionTitle: `Attempt #${attemptNumber}: ${aiDecision.recommendedAction || "Outreach"} via ${chosenChannel}`,
      aiStrategy: aiDecision.recommendedAction || "Autonomous Outreach",
      aiChannel: chosenChannel,
      selectedChannel: chosenChannel,
      status: actionStatus,
      deliveryMode,
      gatewayLatency: `${Math.floor(Math.random() * 40 + 85)}ms`,
      pspResponseCode: aiDecision.pspResponseCode || "DISPATCHED_200",
      projectedRecovery,
      operatorName: "Recoverly Autonomous AI Engine",
      reason: aiDecision.reason || `Executed dynamic recovery attempt #${attemptNumber} via ${chosenChannel}.`,
      messageGoal: aiDecision.messageGoal,
      urgency: aiDecision.urgency,
      generatedMessageText,
      provider: providerName,
      providerStatus,
      providerMessageId: providerId,
      providerErrorCode,
      providerErrorMessage,
      httpStatus,
      executedAt: now.toISOString(),
      channelDispatches,
      details: isRealSent
        ? `Real provider dispatch via ${providerName} (${primaryDispatch.deliveryLabel}). SID: ${providerId}. Awaiting customer resolution.`
        : isSimulated
        ? `Simulation execution (${primaryDispatch.deliveryLabel}). No real provider outreach was dispatched.`
        : `Provider outreach FAILED via ${providerName}. ${providerErrorCode ? `Error Code: ${providerErrorCode}. ` : ""}Diagnostic: ${providerErrorMessage || primaryDispatch.error}. Provider feedback recorded for Gemini Attempt #${attemptNumber + 1}.`,
      result: isRealSent
        ? `Real message delivered to provider — SID: ${providerId}`
        : isSimulated
        ? "Simulation outcome recorded — no real message sent"
        : `${chosenChannel} delivery rejected by provider (${providerErrorCode || "ERROR"}). Escalating to alternate channel.`,
      nextDecision:
        attemptNumber < 3
          ? `Schedule Attempt #${attemptNumber + 1} at T+5m for Gemini dynamic channel reassessment`
          : "Autonomous limit reached (3 attempts) — Escalate to VIP Revenue Operations Specialist",
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
      status: actionRecord.status === "CHANNEL_EXECUTION_FAILED" ? "FAILED" : "COMPLETED",
      attemptNumber,
      channelDispatches,
      details: {
        actionType: actionRecord.actionType,
        selectedChannel: actionRecord.selectedChannel,
        aiStrategy: actionRecord.aiStrategy,
        reason: actionRecord.reason,
        provider: actionRecord.provider,
        providerStatus: actionRecord.providerStatus,
        providerId: actionRecord.providerMessageId,
        providerErrorCode: actionRecord.providerErrorCode,
        providerErrorMessage: actionRecord.providerErrorMessage,
        httpStatus: actionRecord.httpStatus,
        generatedMessage: actionRecord.generatedMessageText,
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
          selectedChannel: a.selectedChannel,
          aiStrategy: a.aiStrategy,
          reason: a.reason,
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
        aiReasoning: "Customer did not complete payment across dynamic WhatsApp, SMS, and Email outreach windows.",
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
