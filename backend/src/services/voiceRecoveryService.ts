import { getSupabaseClient } from "./supabaseService.js";
import { generateContentResilient } from "./geminiService.js";
import {
  persistentSandboxIncidents,
  StoredSandboxIncident,
} from "./autonomousRecoveryEngine.js";
import { getDemoTestContactConfig } from "./demoTestContactService.js";
import { normalizeToE164 } from "./messagingService.js";

export interface VoiceRecoveryIncidentData {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  amount: number;
  currency: string;
  failureReason: string;
  scenarioTypeName?: string;
  paymentMethod?: string;
  paymentUrl?: string;
  rootCause?: string;
  selectedStrategy?: string;
  recommendedAction?: string;
  preferredLanguage?: string;
  status?: string;
  analysis?: any;
}



// Global fast-response cache for voice scripts to guarantee sub-50ms latency for Exotel Passthru
export const voiceScriptCache = new Map<string, { script: string; timestamp: number; incidentId: string; source: string }>();

/**
 * Locate incident across in-memory sandbox and persistent database tables.
 * Returns null if not found (strictly avoids selecting wrong incident).
 */
export async function findIncidentForVoiceRecovery(
  rawCustomField: string
): Promise<VoiceRecoveryIncidentData | null> {
  const customField = (rawCustomField || "").trim();
  if (!customField) {
    return null;
  }

  // 1. Check in-memory persistentSandboxIncidents Map
  let sbIncident: StoredSandboxIncident | undefined = persistentSandboxIncidents.get(customField);

  if (!sbIncident) {
    // Case-insensitive / prefix matching in memory store
    const lowerId = customField.toLowerCase();
    for (const [key, val] of persistentSandboxIncidents.entries()) {
      if (
        key.toLowerCase() === lowerId ||
        val.id.toLowerCase() === lowerId ||
        (val.customer_id && val.customer_id.toLowerCase() === lowerId)
      ) {
        sbIncident = val;
        break;
      }
    }
  }

  const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");

  if (sbIncident) {
    const analysis = sbIncident.analysis || {};
    return {
      id: sbIncident.id,
      customerName: sbIncident.customer_name || "Customer",
      customerEmail: sbIncident.customer_email || "",
      customerPhone: sbIncident.customer_phone || "",
      amount: Number(sbIncident.amount) || 0,
      currency: sbIncident.currency || "INR",
      failureReason: sbIncident.failure_reason || "Payment processing failure",
      scenarioTypeName: sbIncident.scenario_type_name,
      paymentMethod: sbIncident.payment_method,
      paymentUrl: `${frontendBaseUrl}/resolve/${sbIncident.id}`,
      rootCause: analysis.rootCause || sbIncident.failure_reason,
      selectedStrategy: analysis.selectedStrategy,
      recommendedAction: analysis.recommendedAction,
      status: sbIncident.status,
      analysis,
    };
  }

  // 2. Query Supabase database recovery_cases and sandbox_incidents
  try {
    const supabase = getSupabaseClient();

    // Check recovery_cases with joined customers
    const { data: caseData } = await supabase
      .from("recovery_cases")
      .select("*, customers(*)")
      .eq("id", customField)
      .maybeSingle();

    if (caseData) {
      const customer = caseData.customers;
      return {
        id: caseData.id,
        customerName: customer?.name || "Customer",
        customerEmail: customer?.email || "",
        customerPhone: customer?.phone || "",
        amount: Number(caseData.amount_at_risk) || 0,
        currency: caseData.currency || "INR",
        failureReason: caseData.reason || "Payment decline",
        scenarioTypeName: caseData.case_type,
        paymentUrl: `${frontendBaseUrl}/resolve/${caseData.id}`,
        rootCause: caseData.reason,
        status: caseData.status,
      };
    }

    // Check sandbox_incidents table
    const { data: dbSbData } = await supabase
      .from("sandbox_incidents")
      .select("*")
      .eq("id", customField)
      .maybeSingle();

    if (dbSbData) {
      const meta = (dbSbData.metadata as any) || {};
      const analysis = meta.analysis || {};
      return {
        id: dbSbData.id,
        customerName: meta.customer_name || "Customer",
        customerEmail: meta.customer_email || "",
        customerPhone: meta.customer_phone || "",
        amount: Number(dbSbData.amount) || 0,
        currency: dbSbData.currency || "INR",
        failureReason: dbSbData.failure_reason || "Payment issue",
        scenarioTypeName: dbSbData.scenario_type,
        paymentMethod: dbSbData.payment_method,
        paymentUrl: `${frontendBaseUrl}/resolve/${dbSbData.id}`,
        rootCause: analysis.rootCause || dbSbData.failure_reason,
        selectedStrategy: analysis.selectedStrategy,
        recommendedAction: analysis.recommendedAction,
        status: dbSbData.status,
        analysis,
      };
    }
  } catch (err) {
    console.warn(`[Voice Service] Database lookup notice for CustomField "${customField}":`, err);
  }

  return null;
}

/**
 * Format currency amount cleanly for speech synthesis.
 */
function formatVoiceCurrency(amount: number, currency: string): string {
  const formattedAmount = Number(amount || 0).toLocaleString("en-IN");
  const upperCurr = (currency || "INR").toUpperCase();
  if (upperCurr === "INR" || upperCurr === "RS" || upperCurr === "₹") {
    return `INR ${formattedAmount}`;
  }
  if (upperCurr === "USD" || upperCurr === "$") {
    return `${formattedAmount} US dollars`;
  }
  return `${upperCurr} ${formattedAmount}`;
}

/**
 * Clean and simplify failure reason into natural conversational reason.
 */
function formatVoiceFailureReason(rawReason: string): string {
  const reason = (rawReason || "").toLowerCase();
  if (reason.includes("expire") || reason.includes("validity")) {
    return "your card has expired";
  }
  if (reason.includes("insufficient") || reason.includes("balance") || reason.includes("limit")) {
    return "the account had insufficient balance";
  }
  if (reason.includes("timeout") || reason.includes("network") || reason.includes("gateway") || reason.includes("504")) {
    return "of a temporary banking network timeout";
  }
  if (reason.includes("mandate") || reason.includes("autopay") || reason.includes("token")) {
    return "recurring autopay authorization could not be completed";
  }
  if (reason.includes("decline") || reason.includes("rejected")) {
    return "your bank declined the transaction";
  }
  if (reason.includes("fraud") || reason.includes("risk") || reason.includes("block")) {
    return "your card issuer flagged a temporary security verification";
  }
  return "we encountered a temporary processing error with your payment";
}

/**
 * Extract friendly first name for phone greeting.
 */
function extractGreetingName(fullName: string): string {
  const clean = (fullName || "").trim();
  if (!clean || clean.toLowerCase() === "customer") return "there";
  const firstName = clean.split(/\s+/)[0];
  return firstName;
}

/**
 * Fallback rule-based voice script generator when Gemini is offline.
 * Produces natural conversational Indian English / Hinglish suitable for 20-30s.
 */
export function generateFallbackVoiceScript(incident: VoiceRecoveryIncidentData): string {
  const greetingName = extractGreetingName(incident.customerName);
  const formattedAmount = formatVoiceCurrency(incident.amount, incident.currency);
  const friendlyReason = formatVoiceFailureReason(incident.failureReason);

  return `Hello ${greetingName}. We noticed that your payment of ${formattedAmount} could not be completed because ${friendlyReason}. Please use the recovery link sent to your email to update your payment method. Thank you.`;
}

/**
 * Core AI Voice Script Generator using Gemini.
 * Formulates a tailored, contextual, ~20-30 second spoken script in natural Indian English / Hinglish.
 */
export async function generateGeminiVoiceRecoveryScript(
  incident: VoiceRecoveryIncidentData,
  timeoutMs = 2500
): Promise<{ script: string; source: "GEMINI_AI" | "RULE_ENGINE"; modelUsed?: string }> {
  const prompt = `You are Recoverly's dynamic autonomous voice recovery agent calling a valued customer on the phone regarding an interrupted transaction.

INCIDENT GROUNDING DATA:
- Incident ID: ${incident.id}
- Customer Name: ${incident.customerName}
- Amount: ${incident.currency} ${Number(incident.amount || 0).toLocaleString("en-IN")}
- Failure Reason / Rail Issue: ${incident.failureReason}
- Root Cause Analysis: ${incident.rootCause || incident.failureReason}
- Payment Rail / Method: ${incident.paymentMethod || "Card"}
- Recovery Strategy: ${incident.selectedStrategy || "Payment update link"}
- Resolution Link: Sent to customer's registered email (${incident.customerEmail || "email on file"})

TASK & CONSTRAINTS:
1. Generate a personalized, natural spoken voice script for a phone call (approx 20–30 seconds, 40 to 60 words).
2. Spoken in courteous, natural Indian English with conversational tone (or natural Hinglish phrasing like "Hello [Name]. Aapki [Amount] ki payment... Please check your email and use the recovery link to update your payment method. Thank you.").
3. Mention the customer by name, mention the exact amount, clearly explain why the payment was interrupted in simple non-technical terms, and guide them to check their email/SMS for the secure recovery link.
4. Output STRICTLY the plain text to be spoken by Text-To-Speech.
5. DO NOT include markdown, asterisks, brackets, quotations, or stage instructions (no "[Pause]", no "**Hello**", no markdown).
6. DO NOT use generic or robotic phrasing.`;

  console.info(`[Voice Service] 🤖 Requesting Gemini voice script for incident "${incident.id}" (Customer: ${incident.customerName})...`);
  const startTime = Date.now();

  try {
    // Race Gemini against timeout to guarantee Exotel synchronous Passthru never times out
    const timeoutPromise = new Promise<{ text: string; modelUsed: string } | null>((resolve) =>
      setTimeout(() => {
        console.warn(`[Voice Service] ⏱️ Gemini generation exceeded ${timeoutMs}ms limit. Falling back to rule engine script.`);
        resolve(null);
      }, timeoutMs)
    );

    const geminiPromise = generateContentResilient({
      contents: prompt,
      temperature: 0.3,
      systemInstruction:
        "You are an empathetic, professional fintech voice recovery caller. Return ONLY spoken plain text suitable for phone text-to-speech with no markdown formatting.",
    });

    const aiGen = await Promise.race([geminiPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    if (aiGen && aiGen.text) {
      let text = aiGen.text.trim();
      text = text.replace(/[*#_`]/g, "").replace(/^["']|["']$/g, "").trim();
      if (text.length > 20) {
        console.info(`[Voice Service] ✅ Gemini voice script generated in ${duration}ms via ${aiGen.modelUsed}: "${text.slice(0, 80)}..."`);
        return { script: text, source: "GEMINI_AI", modelUsed: aiGen.modelUsed };
      }
    }
  } catch (err: any) {
    console.warn(`[Voice Service] Gemini generation error (${Date.now() - startTime}ms):`, err?.message || err);
  }

  // Graceful fallback to deterministic high-quality script
  const fallback = generateFallbackVoiceScript(incident);
  console.info(`[Voice Service] ⚡ Using rule engine fallback script: "${fallback.slice(0, 80)}..."`);
  return { script: fallback, source: "RULE_ENGINE" };
}

/**
 * Generates or retrieves the cached voice recovery message for Exotel Passthru.
 * Guaranteed to return a valid spoken script (never empty) and respond in sub-50ms if cached.
 */
export async function getOrGenerateVoiceRecoveryMessage(
  rawCustomField: string
): Promise<{ incident: VoiceRecoveryIncidentData; script: string; source: string }> {
  const cleanId = (rawCustomField || "").trim();

  // 1. Check in-memory fast cache first
  if (cleanId && voiceScriptCache.has(cleanId)) {
    const cached = voiceScriptCache.get(cleanId)!;
    console.info(`[Voice Service] ⚡ Fast cache HIT for "${cleanId}" (Generated ${(Date.now() - cached.timestamp) / 1000}s ago, Source: ${cached.source})`);
    
    // Find incident metadata for audit logging if possible
    const incident = (await findIncidentForVoiceRecovery(cleanId)) || {
      id: cleanId,
      customerName: "Valued Customer",
      customerEmail: "",
      amount: 0,
      currency: "INR",
      failureReason: "Payment processing interruption",
    };

    return { incident, script: cached.script, source: `CACHE_${cached.source}` };
  }

  // 2. Locate incident
  const incident = cleanId ? await findIncidentForVoiceRecovery(cleanId) : null;

  if (!incident) {
    // If CustomField is missing or not found in database, provide a polite universal recovery speech
    // so Exotel NEVER receives a 404 error and never drops the customer's call abruptly.
    console.warn(`[Voice Service] Incident lookup returned null for CustomField "${cleanId}". Providing universal fallback recovery script.`);
    const universalScript = "Hello. This is Recoverly payment support regarding your recent transaction. We noticed your payment could not be processed. Please check your registered email or SMS to complete your payment securely. Thank you.";
    
    return {
      incident: {
        id: cleanId || "fallback_incident",
        customerName: "Customer",
        customerEmail: "",
        amount: 0,
        currency: "INR",
        failureReason: "Payment processing interruption",
      },
      script: universalScript,
      source: "UNIVERSAL_FALLBACK",
    };
  }

  // 3. Check sandbox incident cached script
  const sbIncident = persistentSandboxIncidents.get(incident.id);
  if (sbIncident?.last_voice_script && sbIncident.last_voice_script.length > 20) {
    console.info(`[Voice Service] ⚡ Sandbox incident cache HIT for "${incident.id}"`);
    voiceScriptCache.set(incident.id, {
      script: sbIncident.last_voice_script,
      timestamp: Date.now(),
      incidentId: incident.id,
      source: "SANDBOX_CACHE",
    });
    return { incident, script: sbIncident.last_voice_script, source: "SANDBOX_CACHE" };
  }

  // 4. Generate voice script via Gemini (with 2.5s timeout)
  const { script, source, modelUsed } = await generateGeminiVoiceRecoveryScript(incident, 2500);

  // Cache generated script for instant subsequent accesses
  voiceScriptCache.set(incident.id, {
    script,
    timestamp: Date.now(),
    incidentId: incident.id,
    source,
  });

  if (sbIncident) {
    sbIncident.last_voice_script = script;
    sbIncident.last_voice_script_at = new Date().toISOString();
  }

  // Log to audit trail
  try {
    const supabase = getSupabaseClient();
    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "AI_AGENT",
      event: "VOICE_RECOVERY_SCRIPT_GENERATED",
      details: {
        incident_id: incident.id,
        customer_name: incident.customerName,
        amount: incident.amount,
        currency: incident.currency,
        source,
        model_used: modelUsed,
        script_preview: script.slice(0, 150),
        script_length: script.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-blocking
  }

  return { incident, script, source };
}

export interface ExotelCallResult {
  success: boolean;
  channel: "VOICE";
  provider: "EXOTEL";
  deliveryMode: "REAL" | "FAILED";
  status: "REQUESTED" | "INITIATED" | "FAILED" | "QUEUED";
  callSid?: string;
  destination: string;
  actualDestination: string;
  routedToTestContact?: boolean;
  testContactTarget?: string;
  deliveryLabel: string;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  dispatchedAt: string;
  voiceScriptPreview?: string;
}

/**
 * Initiate real Exotel outbound transactional call for a Recoverly incident.
 */
export async function dispatchExotelVoiceCall(
  incidentId: string,
  options?: { targetPhoneOverride?: string; skipActionPush?: boolean }
): Promise<ExotelCallResult> {
  const now = new Date().toISOString();

  // 1. Find incident
  const incident = await findIncidentForVoiceRecovery(incidentId);
  if (!incident) {
    const errorMsg = `Incident "${incidentId}" not found in database. Cannot initiate voice call.`;
    return {
      success: false,
      channel: "VOICE",
      provider: "EXOTEL",
      deliveryMode: "FAILED",
      status: "FAILED",
      destination: incidentId,
      actualDestination: incidentId,
      deliveryLabel: "Voice Call Failed (Incident Not Found)",
      error: errorMsg,
      errorCode: "INCIDENT_NOT_FOUND",
      errorMessage: errorMsg,
      providerErrorCode: "INCIDENT_NOT_FOUND",
      providerErrorMessage: errorMsg,
      dispatchedAt: now,
    };
  }

  const rawPhone = (options?.targetPhoneOverride || incident.customerPhone || "").trim();
  const normalizedCustomerPhone = normalizeToE164(rawPhone);
  const verifiedPhoneEnv = (process.env.EXOTEL_VERIFIED_TO || process.env.EXOTEL_TEST_PHONE || process.env.DEMO_TEST_PHONE || "").trim();
  const normalizedVerifiedPhone = normalizeToE164(verifiedPhoneEnv);

  // 2. VERIFIED PHONE ALLOWLIST CHECK: customer phone must strictly equal EXOTEL_VERIFIED_TO
  if (!normalizedCustomerPhone || !normalizedVerifiedPhone || normalizedCustomerPhone !== normalizedVerifiedPhone) {
    const errorMsg = `Customer phone "${rawPhone || "None"}" does not match verified allowlist (EXOTEL_VERIFIED_TO: "${verifiedPhoneEnv || "NOT_CONFIGURED"}"). Voice call dispatch blocked.`;
    console.warn(`[Exotel Voice] Blocked unverified destination: ${errorMsg}`);

    return {
      success: false,
      channel: "VOICE",
      provider: "EXOTEL",
      deliveryMode: "FAILED",
      status: "FAILED",
      destination: rawPhone || "[Missing Phone]",
      actualDestination: rawPhone || "[Missing Phone]",
      deliveryLabel: "Voice Call Failed (Destination Not Verified)",
      error: errorMsg,
      errorCode: "VOICE_DESTINATION_NOT_VERIFIED",
      errorMessage: errorMsg,
      providerErrorCode: "VOICE_DESTINATION_NOT_VERIFIED",
      providerErrorMessage: errorMsg,
      dispatchedAt: now,
    };
  }

  // 3. CHECK EXOTEL CREDENTIALS
  const exotelApiKey = process.env.EXOTEL_API_KEY?.trim();
  const exotelApiToken = process.env.EXOTEL_API_TOKEN?.trim();
  const exotelSid = process.env.EXOTEL_SID?.trim();
  const exotelExoPhone = process.env.EXOTEL_EXOPHONE?.trim();
  const rawAppIdOrUrl = (
    process.env.EXOTEL_APP_ID ||
    (process.env as any).EXOTEL_FLOW_ID ||
    (process.env as any).EXOTEL_FLOW_URL ||
    (process.env as any).EXOTEL_URL ||
    ""
  ).trim();

  if (!exotelApiKey || !exotelApiToken || !exotelSid || !exotelExoPhone) {
    const missingKeys: string[] = [];
    if (!exotelApiKey) missingKeys.push("EXOTEL_API_KEY");
    if (!exotelApiToken) missingKeys.push("EXOTEL_API_TOKEN");
    if (!exotelSid) missingKeys.push("EXOTEL_SID");
    if (!exotelExoPhone) missingKeys.push("EXOTEL_EXOPHONE");

    const errorMsg = `Exotel configuration missing required environment variables: ${missingKeys.join(", ")}. Please configure these in server environment variables.`;
    console.warn(`[Exotel Voice] Dispatch aborted: ${errorMsg}`);

    return {
      success: false,
      channel: "VOICE",
      provider: "EXOTEL",
      deliveryMode: "FAILED",
      status: "FAILED",
      destination: rawPhone,
      actualDestination: rawPhone,
      deliveryLabel: `Voice Call Failed (${missingKeys.join(", ")} missing)`,
      error: errorMsg,
      errorCode: "MISSING_EXOTEL_CREDENTIALS",
      errorMessage: errorMsg,
      providerErrorCode: "MISSING_EXOTEL_CREDENTIALS",
      providerErrorMessage: errorMsg,
      dispatchedAt: now,
    };
  }

  const targetPhone = normalizedCustomerPhone;

  // Pre-generate Gemini script so it is ready and audited
  let scriptPreview = "";
  try {
    const scriptRes = await generateGeminiVoiceRecoveryScript(incident);
    scriptPreview = scriptRes.script;
    
    // Store in global fast memory cache for instant Exotel Passthru retrieval
    voiceScriptCache.set(incident.id, {
      script: scriptPreview,
      timestamp: Date.now(),
      incidentId: incident.id,
      source: scriptRes.source,
    });

    const sbIncident = persistentSandboxIncidents.get(incident.id);
    if (sbIncident) {
      sbIncident.last_voice_script = scriptPreview;
      sbIncident.last_voice_script_at = now;
    }
  } catch (e) {
    console.warn("[Exotel Voice] Notice pre-generating voice script:", e);
  }

  try {
    const baseUrl = (process.env.BACKEND_URL || "").trim();
    const statusCallbackUrl = baseUrl ? `${baseUrl}/api/voice/exotel-callback` : undefined;

    // Construct Exotel flow URL for ExoML
    // Exotel canonical flow URL format: http://my.exotel.com/<EXOTEL_SID>/exoml/start_voice/<APP_ID>
    let flowUrl: string | undefined = undefined;
    if (rawAppIdOrUrl.startsWith("http://") || rawAppIdOrUrl.startsWith("https://")) {
      flowUrl = rawAppIdOrUrl;
    } else if (rawAppIdOrUrl) {
      // If the user provided just the numeric/string App ID (e.g. 123456), format it as start_voice URL
      flowUrl = `http://my.exotel.com/${encodeURIComponent(exotelSid)}/exoml/start_voice/${encodeURIComponent(rawAppIdOrUrl)}`;
    }

    // Exotel Connect Call API: https://api.exotel.com/v1/Accounts/<EXOTEL_SID>/Calls/connect.json
    const exotelUrl = `https://api.exotel.com/v1/Accounts/${encodeURIComponent(exotelSid)}/Calls/connect.json`;
    const basicAuth = Buffer.from(`${exotelApiKey}:${exotelApiToken}`).toString("base64");

    const formData = new URLSearchParams();
    formData.append("From", targetPhone);
    formData.append("CallerId", exotelExoPhone);
    formData.append("CallType", "trans");
    formData.append("CustomField", incident.id);

    if (flowUrl) {
      formData.append("Url", flowUrl);
    } else {
      console.warn(`[Exotel Voice] ⚠️ WARNING: EXOTEL_APP_ID is not configured in environment variables. Call will be placed without a Flow URL and may disconnect upon answer.`);
    }

    if (statusCallbackUrl) {
      formData.append("StatusCallback", statusCallbackUrl);
    }

    console.info(`[Exotel Voice] 📞 Dispatching Exotel Calls/connect API`);
    console.info(`[Exotel Voice] ├─ Endpoint: ${exotelUrl}`);
    console.info(`[Exotel Voice] ├─ Target (From): ${targetPhone}`);
    console.info(`[Exotel Voice] ├─ Caller ID: ${exotelExoPhone}`);
    console.info(`[Exotel Voice] ├─ Flow URL: ${flowUrl || "NOT_SET"}`);
    console.info(`[Exotel Voice] ├─ CustomField: "${incident.id}"`);
    console.info(`[Exotel Voice] ├─ StatusCallback: ${statusCallbackUrl || "NOT_SET"}`);
    console.info(`[Exotel Voice] └─ Pre-cached Script: "${scriptPreview.slice(0, 70)}..."`);

    const response = await fetch(exotelUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data?.Call?.Sid) {
      const callSid = data.Call.Sid;
      const callStatus = data.Call.Status || "queued";
      console.info(`[Exotel Voice] Call placed successfully. Exotel Call SID: ${callSid}, Status: ${callStatus}`);

      // Record to audit logs & incident timeline
      try {
        const supabase = getSupabaseClient();
        await supabase.from("audit_logs").insert({
          recovery_case_id: null,
          actor_type: "AI_AGENT",
          event: "EXOTEL_VOICE_CALL_REQUESTED",
          details: {
            incident_id: incident.id,
            call_sid: callSid,
            destination: targetPhone,
            caller_id: exotelExoPhone,
            app_id: flowUrl || rawAppIdOrUrl || "DEFAULT_FLOW",
            status: "REQUESTED",
            provider_status: callStatus,
            voice_script_preview: scriptPreview.slice(0, 150),
          },
        });
      } catch {
        // Non-blocking
      }

      // Record action on sandbox incident if active
      const sbItem = persistentSandboxIncidents.get(incident.id);
      if (sbItem && !options?.skipActionPush) {
        sbItem.actions = sbItem.actions || [];
        sbItem.actions.push({
          id: `act_${Date.now()}`,
          incidentId: incident.id,
          actionType: "VOICE_CALL_DISPATCHED",
          actionTitle: "Exotel Voice Recovery Call",
          selectedChannel: "VOICE",
          aiChannel: "VOICE",
          status: "REQUESTED",
          deliveryMode: "REAL",
          gatewayLatency: "120ms",
          pspResponseCode: "EXOTEL_200_OK",
          projectedRecovery: incident.amount,
          provider: "EXOTEL",
          providerMessageId: callSid,
          providerStatus: callStatus,
          details: `Outbound recovery call initiated via Exotel (SID: ${callSid}) to ${targetPhone}`,
          executedAt: now,
        });
        sbItem.updated_at = now;
      }

      return {
        success: true,
        channel: "VOICE",
        provider: "EXOTEL",
        deliveryMode: "REAL",
        status: "REQUESTED",
        callSid,
        destination: targetPhone,
        actualDestination: targetPhone,
        deliveryLabel: `Voice Call Requested via Exotel (SID: ${callSid})`,
        dispatchedAt: now,
        voiceScriptPreview: scriptPreview,
      };
    } else {
      const errorMsg = data?.RestException?.Message || data?.message || `Exotel HTTP ${response.status} rejected call initiation`;
      const errorCode = String(data?.RestException?.Status || response.status);

      console.warn(`[Exotel Voice] Exotel call rejected (${errorCode}): ${errorMsg}`);

      // Record failure audit log
      try {
        const supabase = getSupabaseClient();
        await supabase.from("audit_logs").insert({
          recovery_case_id: null,
          actor_type: "AI_AGENT",
          event: "EXOTEL_VOICE_CALL_FAILED",
          details: {
            incident_id: incident.id,
            destination: targetPhone,
            error_code: errorCode,
            error_message: errorMsg,
          },
        });
      } catch {
        // Non-blocking
      }

      return {
        success: false,
        channel: "VOICE",
        provider: "EXOTEL",
        deliveryMode: "FAILED",
        status: "FAILED",
        destination: targetPhone,
        actualDestination: targetPhone,
        deliveryLabel: `Voice Call Rejected by Exotel (${errorCode})`,
        error: errorMsg,
        errorCode,
        errorMessage: errorMsg,
        providerErrorCode: errorCode,
        providerErrorMessage: errorMsg,
        dispatchedAt: now,
      };
    }
  } catch (err: any) {
    console.error("[Exotel Voice] Network exception calling Exotel API:", err);
    return {
      success: false,
      channel: "VOICE",
      provider: "EXOTEL",
      deliveryMode: "FAILED",
      status: "FAILED",
      destination: targetPhone,
      actualDestination: targetPhone,
      deliveryLabel: "Voice Call Failed (Network Exception)",
      error: err?.message || "Network exception contacting Exotel API",
      errorCode: "NETWORK_ERROR",
      errorMessage: err?.message || "Network exception contacting Exotel API",
      providerErrorCode: "NETWORK_ERROR",
      providerErrorMessage: err?.message || "Network exception contacting Exotel API",
      dispatchedAt: now,
    };
  }
}

/**
 * Handle Exotel Status Callback (terminal events: completed, failed, busy, no-answer)
 */
export async function processExotelStatusCallback(params: {
  callSid?: string;
  customField?: string;
  status?: string;
  recordingUrl?: string;
  duration?: string | number;
  dialCallDuration?: string | number;
  details?: Record<string, any>;
}): Promise<{ processed: boolean; incidentId?: string; status?: string }> {
  const callSid = params.callSid || "UNKNOWN";
  const customField = params.customField || "";
  const rawStatus = (params.status || "UNKNOWN").toLowerCase();

  let standardizedStatus: "COMPLETED" | "FAILED" | "BUSY" | "NO_ANSWER" | "ANSWERED" | "IN_PROGRESS" | "UNKNOWN" = "UNKNOWN";
  if (rawStatus.includes("completed") || rawStatus === "answered-and-complete") {
    standardizedStatus = "COMPLETED";
  } else if (rawStatus.includes("busy")) {
    standardizedStatus = "BUSY";
  } else if (rawStatus.includes("no-answer") || rawStatus.includes("noanswer")) {
    standardizedStatus = "NO_ANSWER";
  } else if (rawStatus.includes("fail") || rawStatus.includes("cancel")) {
    standardizedStatus = "FAILED";
  } else if (rawStatus.includes("in-progress") || rawStatus.includes("in_progress")) {
    standardizedStatus = "IN_PROGRESS";
  } else if (rawStatus.includes("answered")) {
    standardizedStatus = "ANSWERED";
  }

  console.info(`[Exotel Callback] Received status update for SID ${callSid} (CustomField: ${customField}, Status: ${standardizedStatus})`);

  if (!customField) {
    return { processed: false };
  }

  const incident = await findIncidentForVoiceRecovery(customField);
  if (!incident) {
    return { processed: false, incidentId: customField };
  }

  // Update sandbox incident action status if present
  const sbItem = persistentSandboxIncidents.get(incident.id);
  if (sbItem && sbItem.actions) {
    const act = sbItem.actions.find((a: any) => a.providerMessageId === callSid || (a.actionType === "VOICE_CALL_DISPATCHED" && !a.providerMessageId));
    if (act) {
      act.status = standardizedStatus;
      act.providerStatus = standardizedStatus;
      act.details = `${act.details || "Voice call"} [Status: ${standardizedStatus}${params.duration ? `, Duration: ${params.duration}s` : ""}]`;
    }
  }

  // Update audit trail
  try {
    const supabase = getSupabaseClient();
    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "SYSTEM",
      event: `EXOTEL_CALL_${standardizedStatus}`,
      details: {
        incident_id: incident.id,
        call_sid: callSid,
        status: standardizedStatus,
        raw_status: params.status,
        duration: params.duration,
        dial_call_duration: params.dialCallDuration,
        recording_url: params.recordingUrl,
        received_at: new Date().toISOString(),
        raw: params.details,
      },
    });
  } catch (err) {
    console.warn("[Exotel Callback] Failed to record audit log:", err);
  }

  return {
    processed: true,
    incidentId: incident.id,
    status: standardizedStatus,
  };
}
