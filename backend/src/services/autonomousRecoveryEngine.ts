import { getSupabaseClient } from "./supabaseService.js";
import { GoogleGenAI } from "@google/genai";
import {
  OutboundDeliveryResult,
  sendWhatsAppMessage,
  sendSmsMessage,
  sendEmailMessage,
} from "./messagingService.js";

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
            return `[Attempt #${a.attemptNumber || idx + 1}]
- Strategy Executed: ${a.aiStrategy || a.actionType} (${a.actionTitle})
- Channel Selected by AI: ${a.selectedChannel || primaryDispatch?.channel || "SMS"}
- Provider Used: ${a.provider || (primaryDispatch?.channel === "EMAIL" ? "Resend" : "Twilio")}
- Delivery Status: ${primaryDispatch?.status || a.status}
- Provider ID / SID: ${primaryDispatch?.providerMessageId || "None"}
- Delivery Label / Error: ${primaryDispatch?.error || primaryDispatch?.deliveryLabel || a.details || "None"}
- Time Executed: ${a.executedAt}
- Customer Resolution Status: UNRESOLVED (Payment pending)`;
          })
          .join("\n\n")
      : "No previous attempts executed. This is Attempt #1 (Initial Dynamic Intervention).";

    // Reassess with Gemini dynamically for EVERY single attempt (Attempt 1, 2, 3)
    const prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
You are dynamically formulating and executing Attempt #${attemptNumber} of 3 (Bounded Autonomy Limit) for Incident ${item.id}.

CURRENT INCIDENT STATE:
- Problem: "${item.scenario_type_name}" (Category: ${item.category})
- Customer Name: "${item.customer_name}"
- Customer Email: "${item.customer_email}" (${item.customer_email ? "Available" : "Missing"})
- Customer Phone: "${item.customer_phone || "Not provided"}" (${item.customer_phone ? "Available" : "Missing"})
- Customer Type: ${item.customer_type}
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Payment Rail & Method: ${item.payment_rail} • ${item.payment_method}
- Failure Reason / Code: "${item.failure_reason}"
- Billing Context: "${item.billing_context}"
- Current Settlement Status: UNRESOLVED
- Customer Resolution Link: ${paymentUrl}

PREVIOUS ATTEMPT HISTORY & PROVIDER OUTCOMES:
${pastAttemptsHistoryText}

CRITICAL ARCHITECTURAL RULES:
1. CHANNEL MUST NOT BE FIXED:
   You must dynamically select the single best channel ("EMAIL", "WHATSAPP", or "SMS") for Attempt #${attemptNumber}.
   - If Attempt #1 used SMS or WhatsApp and is still unrecovered or failed, evaluate switching to EMAIL or WHATSAPP for Attempt #2.
   - If a provider had a delivery error in past attempts (e.g., WhatsApp template restrictions), switch to a different reliable channel (e.g., EMAIL or SMS).
   - Tailor the channel choice to the incident category:
     * High-value B2B Invoices: EMAIL is often best for formal invoice reconciliation.
     * Failed Subscriptions / Cards: WHATSAPP or SMS with 1-click update link.
     * Checkout Abandonment / UPI: WHATSAPP with 1-click UPI intent or SMS.
2. DYNAMIC FRESH MESSAGE GENERATION:
   You MUST generate fresh, non-repetitive copy for Attempt #${attemptNumber}. Never reuse a previous attempt's message.
   - For Attempt 1: Courteous first notification with direct 1-click resolution link.
   - For Attempt 2: Helpful follow-up explaining the issue and offering alternative payment or assistance.
   - For Attempt 3: Urgent final notice before account suspension or executive human handoff.
   - Every generated message MUST include the real customer name (${item.customer_name}), amount (${item.currency} ${item.amount.toLocaleString()}), and resolution link (${paymentUrl}).

Respond strictly in valid JSON matching this schema:
{
  "recommendedAction": "One of: PAYMENT_LINK | CARD_UPDATE | SMART_RETRY | MANDATE_REAUTHORIZE | CHECKOUT_RECOVERY | INVOICE_REMINDER | RETENTION_OUTREACH | ESCALATION",
  "recommendedChannel": "EMAIL" | "WHATSAPP" | "SMS",
  "reason": "Clear AI reasoning explaining why this channel and strategy was chosen for Attempt #${attemptNumber} based on past attempt feedback.",
  "messageGoal": "Tactical objective of this specific attempt",
  "urgency": "LOW" | "MEDIUM" | "HIGH" | "FINAL_NOTICE",
  "customerContext": "Key takeaway about customer profile and contact strategy",
  "nextAttemptMinutes": 5,
  "fallbackChannel": "EMAIL" | "WHATSAPP" | "SMS",
  "shouldEscalate": false,
  "generatedMessage": {
    "channel": "EMAIL" | "WHATSAPP" | "SMS",
    "smsText": "Concise SMS text containing ${item.customer_name}, ${item.currency} ${item.amount.toLocaleString()}, and ${paymentUrl}",
    "whatsappText": "Courteous WhatsApp message containing ${item.customer_name}, ${item.currency} ${item.amount.toLocaleString()}, failure reason, and ${paymentUrl}",
    "emailSubject": "High-converting email subject line",
    "emailBody": "Professional personalized email body containing customer greeting, clear summary of ${item.currency} ${item.amount.toLocaleString()} for ${item.payment_method}, failure reason ${item.failure_reason}, resolution link ${paymentUrl}, and formal signature."
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
                  "You are an elite autonomous fintech revenue operations and multi-channel payment recovery AI specialist. Make intelligent, distinct, and non-repeating channel and strategy selections for each attempt.",
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

    // Algorithmic dynamic fallback if Gemini fails, ensuring distinct channel selection across attempts
    if (!aiDecision || !aiDecision.recommendedChannel) {
      const prevChannels = item.actions.map((a) => a.selectedChannel).filter(Boolean);
      let selectedChannel: "EMAIL" | "WHATSAPP" | "SMS" = "WHATSAPP";
      let recommendedAction = "PAYMENT_LINK";
      let reason = `Attempt #${attemptNumber}: Autonomous dynamic recovery cascade.`;
      let urgency: "LOW" | "MEDIUM" | "HIGH" | "FINAL_NOTICE" = "MEDIUM";

      if (attemptNumber === 1) {
        selectedChannel = item.customer_phone ? "WHATSAPP" : "EMAIL";
        recommendedAction = "PAYMENT_LINK";
        reason = `Attempt #1: Immediate 1-click notification on primary mobile channel.`;
        urgency = "LOW";
      } else if (attemptNumber === 2) {
        // Switch channel if Attempt 1 was WhatsApp/SMS, try Email
        selectedChannel = prevChannels.includes("EMAIL") ? "SMS" : "EMAIL";
        recommendedAction = "INVOICE_REMINDER";
        reason = `Attempt #2: Dynamic omnichannel shift to ${selectedChannel} for enhanced deliverability.`;
        urgency = "MEDIUM";
      } else {
        selectedChannel = "SMS";
        recommendedAction = "RETENTION_OUTREACH";
        reason = `Attempt #3: Final urgent notice with retention grace period prior to human escalation.`;
        urgency = "FINAL_NOTICE";
      }

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
          whatsapp: `Hi ${item.customer_name}, we noticed an issue with your payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}). Tap here to resolve securely: ${paymentUrl}`,
          whatsappText: `Hi ${item.customer_name}, we noticed an issue with your payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}). Tap here to resolve securely: ${paymentUrl}`,
          sms: `Recoverly: Resolve your ${item.currency} ${item.amount.toLocaleString()} payment securely: ${paymentUrl}`,
          smsText: `Recoverly: Resolve your ${item.currency} ${item.amount.toLocaleString()} payment securely: ${paymentUrl}`,
          emailSubject: `Action Required: Payment Resolution for ${item.customer_name} (${item.currency} ${item.amount.toLocaleString()})`,
          emailBody: `Dear ${item.customer_name},\n\nWe encountered a temporary processing issue for your payment of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease complete payment securely via our portal:\n${paymentUrl}\n\nBest regards,\nRecoverly Autonomous Operations`,
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
      `Hi ${item.customer_name}, we noticed an issue with your payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}). Tap here to resolve securely: ${paymentUrl}`;
    const smsBody =
      genMsg.smsText ||
      genMsg.sms ||
      `Recoverly: Resolve your ${item.currency} ${item.amount.toLocaleString()} payment securely: ${paymentUrl}`;
    const emailSubject =
      genMsg.emailSubject ||
      (genMsg.email && genMsg.email.subject) ||
      `Action Required: Resolving payment of ${item.currency} ${item.amount.toLocaleString()}`;
    const emailBody =
      genMsg.emailBody ||
      (genMsg.email && genMsg.email.body) ||
      `Dear ${item.customer_name},\n\nWe encountered an issue processing your payment of ${item.currency} ${item.amount.toLocaleString()} for ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease click below to complete your payment:\n${paymentUrl}\n\nThank you,\nRecoverly Operations`;

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
      });
    } else {
      primaryDispatch = await sendSmsMessage({
        toPhone: item.customer_phone,
        customerName: item.customer_name,
        messageBody: smsBody,
        incidentId: item.id,
        paymentUrl,
      });
    }

    const channelDispatches = [primaryDispatch];
    const prob = aiDecision.recoveryProbability || 0.8;
    const projectedRecovery = Math.round(item.amount * prob);

    const generatedMessageText =
      chosenChannel === "EMAIL"
        ? `Subject: ${emailSubject}\n\n${emailBody}`
        : chosenChannel === "WHATSAPP"
        ? waBody
        : smsBody;

    const isSuccess = primaryDispatch.status === "SENT" || primaryDispatch.status === "DELIVERED" || primaryDispatch.status === "SIMULATED";
    const providerStatus = primaryDispatch.status;
    const providerName = primaryDispatch.channel === "EMAIL" ? "Resend" : "Twilio";
    const providerId = primaryDispatch.providerMessageId || undefined;

    const actionRecord: StoredActionRecord = {
      id: `act-att-${attemptNumber}-${Date.now().toString().slice(-4)}`,
      incidentId: item.id,
      attemptNumber,
      actionType: aiDecision.recommendedAction || "PAYMENT_LINK",
      actionTitle: `Attempt #${attemptNumber}: ${aiDecision.recommendedAction || "Outreach"} via ${chosenChannel}`,
      aiStrategy: aiDecision.recommendedAction || "Autonomous Outreach",
      aiChannel: chosenChannel,
      selectedChannel: chosenChannel,
      status: isSuccess ? "EXECUTED" : "CHANNEL_EXECUTION_FAILED",
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
      executedAt: now.toISOString(),
      channelDispatches,
      details: isSuccess
        ? `Dispatched ${chosenChannel} via ${providerName} (${primaryDispatch.deliveryLabel}). ID: ${providerId || "Simulated"}. Awaiting customer resolution.`
        : `Channel execution failed: ${primaryDispatch.error || primaryDispatch.deliveryLabel}. Provider feedback recorded for Gemini Attempt #${attemptNumber + 1}.`,
      result: "Customer unrecovered — awaiting resolution or next cadence trigger",
      nextDecision:
        attemptNumber < 3
          ? `Schedule Attempt #${attemptNumber + 1} at T+5m for Gemini dynamic channel reassessment`
          : "Autonomous limit reached — Escalate to VIP Revenue Operations Specialist",
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
      status: isSuccess ? "COMPLETED" : "FAILED",
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
