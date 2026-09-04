import { getSupabaseClient } from "./supabaseService.js";
import { GoogleGenAI } from "@google/genai";
import {
  OutboundDeliveryResult,
  sendEmailMessage,
} from "./messagingService.js";
import { getDetailedChannelReadiness } from "./providerService.js";
import {
  dispatchExotelVoiceCall,
  getOrGenerateVoiceRecoveryMessage,
  isHinglishText,
  generateGeminiVoiceRecoveryScript,
  validateVoiceScript,
} from "./voiceRecoveryService.js";
import { sendExotelSmsRecovery } from "./smsRecoveryService.js";
import { UserProfile, canUserAccess } from "./dataAccessService.js";

export interface StoredActionRecord {
  id: string;
  incidentId: string;
  attemptNumber?: number;
  actionType: string;
  actionTitle: string;
  selectedChannel?: "EMAIL" | "VOICE" | string;
  aiStrategy?: string;
  aiChannel?: "EMAIL" | "VOICE" | string;
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
  owner_id?: string;
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
    if (item.scheduler) {
      item.scheduler.status = "RUNNING";
    }

    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const paymentUrl = `${baseUrl}/resolve/${item.id}`;

    // DETERMINISTIC 3-ATTEMPT POLICY ENFORCEMENT:
    // Attempt #1 → EMAIL (Resend)
    // Attempt #2 → VOICE (Exotel)
    // Attempt #3 → EMAIL (Resend follow-up)
    const chosenChannel = (
      attemptNumber === 1 ? "EMAIL" :
      attemptNumber === 2 ? "VOICE" :
      "EMAIL"
    ) as "EMAIL" | "VOICE" | "SMS";

    const expectedProvider = chosenChannel === "EMAIL" ? "RESEND" : "EXOTEL";

    // Build structured history of previous attempts for Gemini context
    const pastAttemptsHistoryText = item.actions && item.actions.length > 0
      ? item.actions
          .slice()
          .reverse()
          .map((a, idx) => {
            const primaryDispatch = a.channelDispatches?.[0];
            const ch = (a.selectedChannel || a.aiChannel || primaryDispatch?.channel || (a.attemptNumber === 2 ? "VOICE" : "EMAIL")).toUpperCase();
            const prov = a.provider || (ch === "EMAIL" ? "Resend" : "Exotel");
            const err = a.providerErrorMessage || primaryDispatch?.providerErrorMessage || primaryDispatch?.error || a.details || "None";
            const errCode = a.providerErrorCode || primaryDispatch?.providerErrorCode;
            return `[Attempt #${a.attemptNumber || idx + 1}]
- Channel: ${ch} (${prov})
- AI Strategy: ${a.aiStrategy || a.actionType}
- Generated Content / Script: "${a.generatedMessageText || primaryDispatch?.content?.body || "N/A"}"
- Provider Execution Status: ${primaryDispatch?.status || a.status}
- Provider ID / SID: ${primaryDispatch?.providerMessageId || a.providerMessageId || "None"}
- Provider Error Code: ${errCode || "None"}
- Provider Error Details: ${err}
- Executed Timestamp: ${a.executedAt}
- Customer Resolution Status: UNRESOLVED (Payment pending)`;
          })
          .join("\n\n")
      : "No previous attempts executed. This is Attempt #1 (Initial Outreach).";

    // Compute ground-truth channel readiness for this specific customer contact (Email & Voice only)
    const readiness = getDetailedChannelReadiness(item.customer_email, item.customer_phone, item.customer_name);

    // Build targeted Gemini prompt based on the predetermined fixed channel for this attempt
    let prompt = "";

    if (chosenChannel === "EMAIL" && attemptNumber === 1) {
      prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
You are generating the recovery strategy and personalized email message for Attempt #1 of 3 for Incident ${item.id}.

FIXED OUTREACH POLICY:
- Channel for Attempt #1 is FIXED: EMAIL via Resend.
- Do not change or choose the channel.

INCIDENT STATE:
- Problem / Scenario: "${item.scenario_type_name}" (Category: ${item.category})
- Customer Name: "${item.customer_name}"
- Customer Email: "${item.customer_email || "billing@" + item.customer_name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com"}"
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Payment Method & Rail: ${item.payment_method} (${item.payment_rail})
- Failure Reason: "${item.failure_reason}"
- Billing Context: "${item.billing_context}"
- Customer Resolution Portal Link: ${paymentUrl}

GENERATE:
1. "reason": Professional AI reasoning for this Attempt #1 Email recovery approach.
2. "recommendedAction": "PAYMENT_LINK" or "EMAIL_OUTREACH"
3. "messageGoal": "Initial resolution touchpoint via Email"
4. "urgency": "LOW" or "MEDIUM"
5. "generatedMessage": {
     "emailSubject": "Clear, professional, high-converting subject line for ${item.customer_name}",
     "emailBody": "Personalized email body for ${item.customer_name} explaining the ${item.scenario_type_name} issue on ${item.payment_method} for ${item.currency} ${item.amount.toLocaleString()} with direct link ${paymentUrl} and polite call to action."
   }

Respond strictly in valid JSON matching this schema:
{
  "recommendedAction": "PAYMENT_LINK",
  "reason": "AI reasoning explaining the Attempt #1 Email recovery strategy",
  "messageGoal": "Initial resolution touchpoint via Email",
  "urgency": "MEDIUM",
  "customerContext": "Key insight on customer profile",
  "generatedMessage": {
    "emailSubject": "Action Required: Complete your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}",
    "emailBody": "Dear ${item.customer_name}, ..."
  },
  "recoveryProbability": 0.85,
  "pspResponseCode": "OUTREACH_200_OK"
}`;
    } else if (chosenChannel === "VOICE" && attemptNumber === 2) {
      prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
You are generating the recovery strategy and personalized voice call script for Attempt #2 of 3 for Incident ${item.id}.

FIXED OUTREACH POLICY:
- Channel for Attempt #2 is FIXED: VOICE (Outbound Call via Exotel).
- Do not change or choose the channel.

INCIDENT STATE:
- Problem / Scenario: "${item.scenario_type_name}" (Category: ${item.category})
- Customer Name: "${item.customer_name}"
- Customer Phone: "${item.customer_phone || "+91 98111 20001"}"
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Payment Method: ${item.payment_method}
- Failure Reason: "${item.failure_reason}"
- Customer Resolution Link: ${paymentUrl}

PREVIOUS ATTEMPTS HISTORY:
${pastAttemptsHistoryText}

GENERATE:
1. "reason": Professional AI reasoning for this Attempt #2 Voice Call follow-up.
2. "recommendedAction": "VOICE_CALL"
3. "messageGoal": "Direct voice engagement follow-up after Attempt #1 email"
4. "urgency": "MEDIUM" or "HIGH"
5. "generatedMessage": {
     "voiceScript": "Generate the COMPLETE spoken voice script from scratch in natural conversational Hinglish (realistic Hindi-English code-switching as spoken by an Indian customer-support representative) for ${item.customer_name}. Do NOT use any fixed template or hardcoded sentences. Adapt tone naturally to customer situation, accurately mention the amount (${item.currency} ${item.amount.toLocaleString()}), and output ONLY spoken plain text suitable for phone TTS with NO markdown or emojis."
   }

Respond strictly in valid JSON matching this schema:
{
  "recommendedAction": "VOICE_CALL",
  "reason": "AI reasoning explaining why Attempt #2 Voice Call was formulated as a direct follow-up after Attempt #1 email",
  "messageGoal": "Direct voice engagement follow-up after Attempt #1 email",
  "urgency": "HIGH",
  "customerContext": "Key insight on voice call reachability",
  "generatedMessage": {
    "voiceScript": "[Complete dynamic conversational Hinglish dialogue generated from scratch for this customer and case, with no fixed template]"
  },
  "recoveryProbability": 0.74,
  "pspResponseCode": "OUTREACH_200_OK"
}`;
    } else {
      // Attempt #3 (or follow-up EMAIL)
      prompt = `You are Recoverly's Autonomous Revenue Recovery AI Engine.
You are generating the recovery strategy and a FRESH, NEW follow-up email for Attempt #3 of 3 (Final Autonomous Attempt) for Incident ${item.id}.

FIXED OUTREACH POLICY:
- Channel for Attempt #3 is FIXED: EMAIL via Resend.
- This is the final autonomous attempt prior to human operations handoff.
- Do NOT repeat the exact text from Attempt #1; generate a fresh, tailored follow-up that acknowledges previous outreach.

INCIDENT STATE:
- Problem / Scenario: "${item.scenario_type_name}" (Category: ${item.category})
- Customer Name: "${item.customer_name}"
- Customer Email: "${item.customer_email || "billing@" + item.customer_name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com"}"
- Amount at Risk: ${item.currency} ${item.amount.toLocaleString()}
- Failure Reason: "${item.failure_reason}"
- Customer Resolution Link: ${paymentUrl}

PREVIOUS ATTEMPTS HISTORY (Attempt 1 was Email, Attempt 2 was Voice Call):
${pastAttemptsHistoryText}

GENERATE:
1. "reason": Professional AI reasoning for this Attempt #3 final follow-up notice before escalation.
2. "recommendedAction": "RETENTION_OUTREACH" or "INVOICE_REMINDER"
3. "messageGoal": "Final follow-up notice prior to manual escalation"
4. "urgency": "FINAL_NOTICE"
5. "generatedMessage": {
     "emailSubject": "Fresh, distinct subject line indicating final follow-up regarding ${item.scenario_type_name}",
     "emailBody": "A fresh, new personalized follow-up email body referencing previous attempts (email and phone call), reiterating the ${item.currency} ${item.amount.toLocaleString()} balance, providing the secure link ${paymentUrl}, and respectfully noting that this account will be transferred to human operations if unaddressed."
   }

Respond strictly in valid JSON matching this schema:
{
  "recommendedAction": "RETENTION_OUTREACH",
  "reason": "AI reasoning explaining the Attempt #3 final follow-up email strategy",
  "messageGoal": "Final follow-up notice prior to manual escalation",
  "urgency": "FINAL_NOTICE",
  "customerContext": "Past attempts unresolved; final notice before VIP desk handoff",
  "generatedMessage": {
    "emailSubject": "Final Notice: Resolving your outstanding ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}",
    "emailBody": "Dear ${item.customer_name}, ..."
  },
  "recoveryProbability": 0.62,
  "pspResponseCode": "OUTREACH_200_OK"
}`;
    }

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
                  "You are an elite autonomous fintech revenue operations and recovery AI specialist. Generate sharp, high-converting recovery copy and reasoning for the predetermined outreach channel.",
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

    // Dynamic fallback if Gemini is unreachable
    if (!aiDecision) {
      const fallbackEmailSub =
        attemptNumber === 1
          ? `Action Required: Resolve your ${item.scenario_type_name} payment (${item.currency} ${item.amount.toLocaleString()})`
          : `Final Notice: Outstanding ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}`;

      const fallbackEmailBody =
        attemptNumber === 1
          ? `Dear ${item.customer_name},\n\nWe encountered a processing issue with your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease complete your payment securely via our portal:\n${paymentUrl}\n\nBest regards,\nRecoverly Autonomous Operations`
          : `Dear ${item.customer_name},\n\nThis is a final follow-up regarding the outstanding ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} (${item.failure_reason}). Following our previous email and phone notification, please settle the outstanding balance via ${paymentUrl} to avoid service disruption.\n\nSincerely,\nRecoverly Operations Team`;

      const emergencyVoiceScript = `Namaste, this is Recoverly billing support regarding your pending payment of ${item.currency} ${Number(item.amount || 0).toLocaleString("en-IN")}. A secure resolution link has been delivered to your registered contact. Thank you.`;

      aiDecision = {
        recommendedAction: chosenChannel === "VOICE" ? "VOICE_CALL" : (attemptNumber === 1 ? "PAYMENT_LINK" : "RETENTION_OUTREACH"),
        recommendedChannel: chosenChannel,
        reason:
          attemptNumber === 1
            ? "Attempt #1: Initial recovery outreach via Email (Resend) with dynamic 1-click resolution link."
            : attemptNumber === 2
            ? "Attempt #2: Direct voice engagement follow-up via Exotel Outbound Call after Attempt #1 email."
            : "Attempt #3: Final follow-up email notice prior to manual human operations escalation.",
        messageGoal: `Attempt #${attemptNumber} deterministic revenue recovery touchpoint (${chosenChannel})`,
        urgency: attemptNumber === 1 ? "MEDIUM" : attemptNumber === 2 ? "HIGH" : "FINAL_NOTICE",
        customerContext: `Customer ${item.customer_name} (${item.customer_type})`,
        nextAttemptMinutes: 5,
        shouldEscalate: attemptNumber >= 3,
        generatedMessage: {
          emailSubject: fallbackEmailSub,
          emailBody: fallbackEmailBody,
          voiceScript: emergencyVoiceScript,
        },
        recoveryProbability: attemptNumber === 1 ? 0.85 : attemptNumber === 2 ? 0.74 : 0.62,
        pspResponseCode: "OUTREACH_DISPATCHED_200",
      };
    }

    const genMsg = aiDecision.generatedMessage || {};
    const emailSubject =
      genMsg.emailSubject ||
      (genMsg.email && genMsg.email.subject) ||
      (attemptNumber === 1
        ? `Action Required: Resolve your ${item.scenario_type_name} payment (${item.currency} ${item.amount.toLocaleString()})`
        : `Final Notice: Outstanding ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}`);

    const emailBody =
      genMsg.emailBody ||
      (genMsg.email && genMsg.email.body) ||
      (attemptNumber === 1
        ? `Dear ${item.customer_name},\n\nWe encountered a processing issue with your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()} on ${item.payment_method}.\n\nReason: ${item.failure_reason}\n\nPlease click below to complete your payment:\n${paymentUrl}\n\nThank you,\nRecoverly Operations`
        : `Dear ${item.customer_name},\n\nFollowing our previous email and phone outreach regarding your ${item.scenario_type_name} payment of ${item.currency} ${item.amount.toLocaleString()}, this balance remains pending.\n\nPlease complete payment securely via ${paymentUrl}.\n\nBest regards,\nRecoverly Operations`);

    let voiceScript = "";
    if (genMsg.voiceScript) {
      const val = validateVoiceScript(genMsg.voiceScript, {
        id: item.id,
        customerName: item.customer_name,
        customerEmail: item.customer_email,
        amount: item.amount,
        currency: item.currency,
        failureReason: item.failure_reason,
      });
      if (val.valid) {
        voiceScript = val.cleaned;
      }
    }

    // If voice script was not provided or failed validation, dynamically generate it from scratch with Gemini
    if (!voiceScript && (chosenChannel === "VOICE" || item.analysis?.recommendedAction === "VOICE_CALL")) {
      console.info(`[AutonomousEngine] 🤖 Generating dynamic Gemini voice script for Attempt #${attemptNumber} (Incident: ${item.id})...`);
      const dynamicVoiceRes = await generateGeminiVoiceRecoveryScript({
        id: item.id,
        customerName: item.customer_name,
        customerEmail: item.customer_email,
        amount: item.amount,
        currency: item.currency,
        failureReason: item.failure_reason,
        paymentMethod: item.payment_method,
        scenarioTypeName: item.scenario_type_name,
        recommendedAction: `Attempt #${attemptNumber} Voice Call outreach`,
      });
      voiceScript = dynamicVoiceRes.script;
    }

    // Persist last voice script for Exotel dynamic script webhook
    item.last_voice_script = voiceScript;
    item.last_voice_script_at = now.toISOString();

    // EXECUTE CHOSEN CHANNEL (Attempt 1: EMAIL, Attempt 2: VOICE, Attempt 3: EMAIL)
    // CRITICAL: DO NOT SUBSTITUTE OR AUTO-SWAP CHANNELS ON FAILURE!
    let primaryDispatch: OutboundDeliveryResult;
    const channelDispatches: OutboundDeliveryResult[] = [];

    if (chosenChannel === "EMAIL") {
      primaryDispatch = await sendEmailMessage({
        toEmail: item.customer_email,
        customerName: item.customer_name,
        subject: emailSubject,
        bodyText: emailBody,
        incidentId: item.id,
        paymentUrl,
      });
      channelDispatches.push(primaryDispatch);
    } else if (chosenChannel === "SMS") {
      // SMS (Exotel SMS)
      const smsRes = await sendExotelSmsRecovery({
        incidentId: item.id,
        toPhone: item.customer_phone,
      });
      primaryDispatch = {
        channel: "SMS",
        provider: "EXOTEL",
        deliveryMode: smsRes.isRealDispatch ? (smsRes.status === "SENT" ? "REAL" : "FAILED") : "SIMULATED",
        status: smsRes.status === "SENT" ? "SENT" : "FAILED",
        deliveryLabel: smsRes.deliveryLabel,
        isRealDispatch: smsRes.isRealDispatch,
        destination: smsRes.destination,
        actualDestination: smsRes.actualDestination,
        routedToTestContact: smsRes.routedToTestContact,
        providerMessageId: smsRes.messageSid,
        providerStatus: smsRes.providerStatus,
        providerErrorCode: smsRes.error ? "EXOTEL_SMS_REJECTED" : undefined,
        providerErrorMessage: smsRes.error,
        content: {
          body: smsRes.body,
        },
        dispatchedAt: smsRes.dispatchedAt,
      };
      channelDispatches.push(primaryDispatch);
    } else {
      // VOICE (Exotel)
      const voiceRes = await dispatchExotelVoiceCall(item.id, { skipActionPush: true });
      primaryDispatch = {
        channel: "VOICE",
        provider: "EXOTEL",
        deliveryMode: voiceRes.deliveryMode || "REAL",
        status: voiceRes.status === "REQUESTED" || voiceRes.status === "INITIATED" ? "SENT" : "FAILED",
        deliveryLabel: voiceRes.deliveryLabel,
        isRealDispatch: voiceRes.deliveryMode === "REAL",
        destination: voiceRes.destination,
        actualDestination: voiceRes.actualDestination,
        routedToTestContact: voiceRes.routedToTestContact,
        testContactTarget: voiceRes.testContactTarget,
        providerMessageId: voiceRes.callSid,
        providerStatus: voiceRes.status,
        providerErrorCode: voiceRes.providerErrorCode || voiceRes.errorCode,
        providerErrorMessage: voiceRes.providerErrorMessage || voiceRes.errorMessage || voiceRes.error,
        content: {
          body: voiceRes.voiceScriptPreview || voiceScript,
        },
        dispatchedAt: voiceRes.dispatchedAt,
      };
      channelDispatches.push(primaryDispatch);
    }

    // Effective dispatch is strictly the designated primary dispatch for this attempt
    const effectiveDispatch = primaryDispatch;

    const prob = aiDecision.recoveryProbability || 0.8;
    const projectedRecovery = Math.round(item.amount * prob);

    const generatedMessageText =
      chosenChannel === "EMAIL"
        ? `Subject: ${emailSubject}\n\n${emailBody}`
        : `[AI Spoken Voice Script - Exotel]\n\n"${voiceScript}"`;

    const isRealSent = effectiveDispatch.deliveryMode === "REAL" && effectiveDispatch.status === "SENT";
    const deliveryMode = isRealSent ? "REAL" : "FAILED";
    const actionStatus = isRealSent ? "EXECUTED" : "CHANNEL_EXECUTION_FAILED";
    const providerStatus = isRealSent ? "SENT" : "FAILED";
    const providerName = effectiveDispatch.provider || (chosenChannel === "EMAIL" ? "Resend" : "Exotel");
    const providerId = effectiveDispatch.providerMessageId || undefined;
    const providerErrorCode = effectiveDispatch.providerErrorCode || primaryDispatch.providerErrorCode;
    const providerErrorMessage = effectiveDispatch.providerErrorMessage || primaryDispatch.providerErrorMessage || effectiveDispatch.error;
    const httpStatus = effectiveDispatch.httpStatus;

    const actionRecord: StoredActionRecord = {
      id: `act-att-${attemptNumber}-${Date.now().toString().slice(-4)}`,
      incidentId: item.id,
      attemptNumber,
      actionType: aiDecision.recommendedAction || (chosenChannel === "VOICE" ? "VOICE_CALL" : "PAYMENT_LINK"),
      actionTitle: `Attempt #${attemptNumber}: ${aiDecision.recommendedAction || "Outreach"} via ${chosenChannel}`,
      aiStrategy: aiDecision.recommendedAction || "Autonomous Outreach",
      aiChannel: chosenChannel,
      selectedChannel: chosenChannel,
      status: actionStatus,
      deliveryMode,
      gatewayLatency: `${Math.floor(Math.random() * 40 + 85)}ms`,
      pspResponseCode: isRealSent ? (aiDecision.pspResponseCode || "DISPATCHED_200") : (providerErrorCode || "DISPATCH_FAILED"),
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
        : `Provider outreach FAILED via ${providerName}. ${providerErrorCode ? `Error Code: ${providerErrorCode}. ` : ""}Diagnostic: ${providerErrorMessage || primaryDispatch.error || "Outreach failed"}. Recorded for Attempt #${attemptNumber + 1}.`,
      result: isRealSent
        ? `Real message delivered to provider — SID: ${providerId}`
        : `${chosenChannel} delivery failed (${providerErrorCode || "ERROR"}). Sequence remains deterministic.`,
      nextDecision:
        attemptNumber === 1
          ? "Schedule Attempt #2 (VOICE via Exotel) at +5 minutes"
          : attemptNumber === 2
          ? "Schedule Attempt #3 (EMAIL via Resend Follow-up) at +5 minutes"
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
      title: `Attempt #${attemptNumber} ${isRealSent ? "Executed" : "Failed"} • ${actionRecord.actionTitle}`,
      description: actionRecord.details || "",
      status: isRealSent ? "COMPLETED" : "FAILED",
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
        whyStopped: `Bounded safety limit reached: 3 consecutive automated recovery attempts executed across Email (Resend) and Voice (Exotel) without confirmed customer settlement.`,
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
        aiReasoning: "Customer did not complete payment across dynamic Email and Voice outreach windows.",
        recommendedHumanAction:
          item.category === "INVOICE"
            ? "Initiate executive AP phone outreach, verify purchase order authorization, and propose formal payment restructuring."
            : item.category === "CHURN"
            ? "Schedule high-touch retention call with Account Executive and offer tailored 15% annual commitment discount."
            : "Dispatch VIP concierge outreach offering alternate UPI/NetBanking rail or manual reconciliation.",
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

export function markSandboxIncidentPaid(incidentId: string, operatorName = "Operator", user?: UserProfile) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
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

export async function triggerScheduledAttemptNow(incidentId: string, user?: UserProfile) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
    throw new Error(`Sandbox incident ${incidentId} not found`);
  }

  if (activeTimers.has(incidentId)) {
    clearTimeout(activeTimers.get(incidentId)!);
    activeTimers.delete(incidentId);
  }

  const attemptNumber = item.scheduler?.nextAttemptNumber || 1;
  return await executeScheduledAttempt(incidentId, attemptNumber);
}

export function cancelScheduledRecovery(incidentId: string, reason = "Cancelled by operator", user?: UserProfile) {
  const item = persistentSandboxIncidents.get(incidentId);
  if (!item || !canUserAccess(user, item.owner_id)) {
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
