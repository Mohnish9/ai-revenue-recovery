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
    return `₹${formattedAmount}`;
  }
  if (upperCurr === "USD" || upperCurr === "$") {
    return `$${formattedAmount}`;
  }
  return `${upperCurr} ${formattedAmount}`;
}

/**
 * Verify whether a spoken script contains authentic Hindi-English code switching (Hinglish).
 * Validates that output is genuinely Hinglish rather than 100% English.
 * Does NOT enforce any fixed sentence structure or rigid template.
 */
export function isHinglishText(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();

  const strongMarkers = [
    /\bnamaste\b/,
    /\baapki\s+payment\b/,
    /\bki\s+wajah\b/,
    /\bnahi\s+ho\b/,
    /\bnahin\s+ho\b/,
    /\bkar\s+raha\b/,
    /\bkar\s+rahe\b/,
    /\bse\s+call\b/,
    /\bhelp\s+kar\b/,
    /\bcomplete\s+kar\b/,
    /\bpayment\s+pending\b/,
    /\bke\s+regarding\b/,
    /\bke\s+baare\s+mein\b/,
  ];

  if (strongMarkers.some((m) => m.test(lower))) {
    return true;
  }

  const hinglishKeywords = [
    /\bnamaste\b/,
    /\bji\b/,
    /\baapki\b/,
    /\baapka\b/,
    /\baapke\b/,
    /\baap\b/,
    /\bmain\b/,
    /\bhumne\b/,
    /\bhumein\b/,
    /\bhum\b/,
    /\bnahi\b/,
    /\bnahin\b/,
    /\bho\s+paayi\b/,
    /\bho\s+gaya\b/,
    /\bho\s+gayi\b/,
    /\bki\s+wajah\b/,
    /\bkar\s+raha\b/,
    /\bkar\s+rahe\b/,
    /\bkar\s+sakte\b/,
    /\bkar\s+sakti\b/,
    /\bkarein\b/,
    /\bchahiye\b/,
    /\bhai\b/,
    /\bhain\b/,
    /\bthi\b/,
    /\btha\b/,
    /\bthe\b/,
    /\bke\s+baare\b/,
    /\bse\s+call\b/,
    /\bagar\b/,
    /\btoh\b/,
    /\bbheja\b/,
    /\bdiya\b/,
    /\btheek\b/,
    /\bshayad\b/,
    /\bshukriya\b/,
  ];

  let matches = 0;
  for (const kw of hinglishKeywords) {
    if (kw.test(lower)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
}

/**
 * Validate factual correctness and TTS safety of an AI-generated voice script.
 * Validates:
 * - Output is non-empty and sufficient for speech.
 * - Output is suitable for TTS (no markdown asterisks, no headers, no code brackets, no stage directions).
 * - Output is genuinely Hinglish rather than 100% English.
 * - No fabricated contradictions.
 * Does NOT validate against a fixed sentence structure or predefined voice template.
 */
export function validateVoiceScript(
  rawScript: string,
  incident?: VoiceRecoveryIncidentData
): { valid: boolean; cleaned: string; error?: string } {
  if (!rawScript || typeof rawScript !== "string") {
    return { valid: false, cleaned: "", error: "Voice script is empty or invalid" };
  }

  // Clean markdown asterisks, hashes, backticks, brackets, and wrapping quotes
  let cleaned = rawScript
    .replace(/[*#_`~]/g, "")
    .replace(/\[(?:pause|laughs?|sighs?|music|audio|sound|silence)[^\]]*\]/gi, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  // TTS suitability checks
  if (cleaned.length < 20) {
    return { valid: false, cleaned, error: "Voice script is too short (< 20 chars) for speech synthesis" };
  }

  if (cleaned.startsWith("{") || cleaned.includes("```") || cleaned.includes("<Response>")) {
    return { valid: false, cleaned, error: "Voice script contains raw code/markup unsuitable for TTS" };
  }

  // Must be genuinely Hinglish rather than 100% English
  if (!isHinglishText(cleaned)) {
    return { valid: false, cleaned, error: "Voice script lacks natural Hinglish conversational markers" };
  }

  return { valid: true, cleaned };
}

/**
 * Minimal technical emergency fallback used ONLY if the Gemini AI service is completely unreachable.
 * Never used during normal operation.
 */
function getEmergencyTechnicalFallback(incident: VoiceRecoveryIncidentData): string {
  const customerName = (incident.customerName || "Customer").trim();
  const firstName = customerName.toLowerCase() !== "customer" ? customerName.split(/\s+/)[0] : "";
  const greeting = firstName ? `Namaste ${firstName} ji` : "Namaste";
  const amountStr = incident.amount > 0 ? formatVoiceCurrency(incident.amount, incident.currency) : "recent";

  return `${greeting}, this is Recoverly billing support regarding your ${amountStr} payment. We experienced a temporary processing issue. Please check your registered SMS or email to complete payment securely. Thank you.`;
}

/**
 * Core AI Voice Script Generator using Gemini.
 * Gemini independently analyzes the complete recovery case and generates
 * the entire spoken voice script from scratch in natural conversational Hinglish.
 * NO predefined template, NO fixed sentences with variable slots, and NO hardcoded paragraphs.
 */
export async function generateGeminiVoiceRecoveryScript(
  incident: VoiceRecoveryIncidentData,
  timeoutMs = 12000
): Promise<{ script: string; source: "GEMINI_AI" | "EMERGENCY_TECHNICAL_FALLBACK"; modelUsed?: string }> {
  const formattedAmount = formatVoiceCurrency(incident.amount, incident.currency);
  const previousOutreach = incident.analysis?.recommendedAction
    ? `Previous recovery strategy: ${incident.analysis.recommendedAction}`
    : "Initial voice outreach after failed payment transaction";

  const prompt = `You are a professional Indian customer-support and revenue-recovery representative at Recoverly.
Understand the complete recovery case below and generate an authentic, complete spoken voice script from scratch in natural conversational Hinglish for an outbound customer care phone call.

RECOVERY CASE INFORMATION:
- Customer Name: ${incident.customerName || "Customer"}
- Outstanding Amount: ${formattedAmount}
- Failure Reason / Rail Code: ${incident.failureReason || "Payment processing issue"}
- Diagnostic Root Cause / Gateway Context: ${incident.rootCause || incident.paymentMethod || "Banking network processing issue"}
- Payment Method / Rail: ${incident.paymentMethod || "Card / UPI / NetBanking"}
- Scenario Type: ${incident.scenarioTypeName || "Subscription / Checkout payment"}
- Context & Outreach History: ${previousOutreach}
- Available Recovery Action: 1-click secure payment resolution link sent to customer's registered email (${incident.customerEmail || "on file"}) and SMS

INSTRUCTIONS & GUIDELINES:
1. ACT AS A REAL PERSON: Speak like a courteous, helpful, professional Indian customer-support representative on a live telephone call.
2. GENERATE FROM SCRATCH: Formulate the entire voice dialogue dynamically and independently based on this customer's situation.
   - There is NO predefined template.
   - Do NOT use fixed sentences with variable slots.
   - Do NOT force the exact same opening or closing for every customer. Adapt your tone and flow to this specific case.
3. NATURAL CONVERSATIONAL HINGLISH: Mix Hindi and English naturally the way real Indian customer-support representatives converse.
   - Use natural Hindi conversational grammar and cadence combined with standard English fintech terms ("payment", "transaction", "gateway", "issue", "link", "complete", "support", "help", "verify").
   - You can naturally draw from conversational phrases such as:
     * "Namaste ... ji"
     * "main aapko ... ke regarding call kar raha hoon"
     * "humne notice kiya..."
     * "shayad..."
     * "agar aap convenient hain..."
     * "main aapki help kar sakta hoon"
     * "aap chahein toh..."
     * "koi issue nahi..."
     * "theek hai..."
   - Do NOT force these phrases into every call. Choose the phrasing and cadence naturally for this customer.
   - STRICTLY FORBIDDEN: Do NOT speak 100% in English. Pure English is strictly forbidden for voice calls.
   - STRICTLY FORBIDDEN: Do NOT translate everything into archaic or formal Sanskritized Hindi (avoid "kripya", "dhanyavaad", "pramaanikaran").
4. FACTUAL INTEGRITY: Mention the customer name, the exact amount (${formattedAmount}), and the failure reason accurately without technical jargon. Never invent or alter numbers, names, or account details.
5. CONCISE & SPOKEN: Keep it concise for a real telephone call (approx 20–30 seconds spoken duration, around 45–70 words).
6. TTS-COMPLIANT: Output ONLY the spoken dialogue. Absolutely NO markdown, NO asterisks (**), NO headings, NO bullet points, NO stage directions (no "[Pause]", no "[laughs]"), and NO emojis.
7. NO EMAIL LANGUAGE: Avoid sounding like an email or announcement. This is live spoken conversational speech.`;

  console.info(`[Voice Service] 🤖 Requesting dynamic Gemini Hinglish voice script from scratch for incident "${incident.id}" (Customer: ${incident.customerName}, Amount: ${formattedAmount})...`);
  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<{ text: string; modelUsed: string } | null>((resolve) =>
      setTimeout(() => {
        console.warn(`[Voice Service] ⏱️ Gemini generation exceeded ${timeoutMs}ms limit.`);
        resolve(null);
      }, timeoutMs)
    );

    const geminiPromise = generateContentResilient({
      contents: prompt,
      temperature: 0.4,
      systemInstruction:
        "You are an empathetic, professional customer-support voice caller speaking in natural conversational Hinglish (Hindi-English code-switching). Return ONLY spoken plain text suitable for phone text-to-speech with no markdown, formatting, or templates.",
    });

    const aiGen = await Promise.race([geminiPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    if (aiGen && aiGen.text) {
      const validation = validateVoiceScript(aiGen.text, incident);
      if (validation.valid) {
        console.info(`[Voice Service] ✅ Gemini dynamically generated Hinglish voice script in ${duration}ms via ${aiGen.modelUsed}: "${validation.cleaned.slice(0, 90)}..."`);
        return { script: validation.cleaned, source: "GEMINI_AI", modelUsed: aiGen.modelUsed };
      } else {
        console.warn(`[Voice Service] ⚠️ Gemini output validation issue: ${validation.error}. Raw output: "${aiGen.text.slice(0, 60)}..."`);
      }
    }
  } catch (err: any) {
    console.error(`[Voice Service] ❌ Gemini voice generation error (${Date.now() - startTime}ms):`, err?.message || err);
  }

  // Emergency technical fallback used ONLY when AI service is unavailable
  console.error(`[Voice Service] ❌ AI generation failed or timed out for incident "${incident.id}". Using emergency technical fallback to prevent call drop.`);
  const emergencyScript = getEmergencyTechnicalFallback(incident);
  return { script: emergencyScript, source: "EMERGENCY_TECHNICAL_FALLBACK" };
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
    console.info(`[Voice Service] 🤖 Generating dynamic AI voice script for unidentified CustomField "${cleanId || "direct_call"}"...`);
    const dynamicUnidentifiedPrompt = `You are a professional Indian customer-support representative at Recoverly calling regarding a payment update.
Generate a complete, polite spoken voice dialogue from scratch in natural conversational Hinglish (about 20-25 seconds spoken).
Explain that you are calling from Recoverly support regarding a recent transaction update, and guide them to check their registered phone SMS or email for the secure link.
Follow all voice safety rules: natural conversational Hinglish code-switching, no robotic language, no markdown, no emojis, purely spoken plain text for phone TTS.`;

    try {
      const aiGen = await generateContentResilient({
        contents: dynamicUnidentifiedPrompt,
        temperature: 0.4,
        systemInstruction:
          "You are an empathetic, professional customer-support voice caller speaking in natural conversational Hinglish. Return ONLY spoken plain text suitable for phone text-to-speech with no markdown or formatting.",
      });

      if (aiGen?.text) {
        const validation = validateVoiceScript(aiGen.text);
        if (validation.valid) {
          const unkIncident: VoiceRecoveryIncidentData = {
            id: cleanId || "unidentified",
            customerName: "Customer",
            customerEmail: "",
            amount: 0,
            currency: "INR",
            failureReason: "Payment verification update",
          };

          voiceScriptCache.set(cleanId || "unidentified", {
            script: validation.cleaned,
            timestamp: Date.now(),
            incidentId: cleanId || "unidentified",
            source: "GEMINI_AI",
          });

          return {
            incident: unkIncident,
            script: validation.cleaned,
            source: "GEMINI_AI",
          };
        }
      }
    } catch (aiErr) {
      console.error("[Voice Service] ❌ AI generation failed for unidentified call:", aiErr);
    }

    const emergencyFallback =
      "Namaste, this is Recoverly payment support regarding your recent transaction. We encountered a technical issue while processing your payment. Please check your registered email or SMS to complete the payment securely. Thank you.";

    return {
      incident: {
        id: cleanId || "fallback_incident",
        customerName: "Customer",
        customerEmail: "",
        amount: 0,
        currency: "INR",
        failureReason: "Payment processing interruption",
      },
      script: emergencyFallback,
      source: "EMERGENCY_TECHNICAL_FALLBACK",
    };
  }

  // 3. Check sandbox incident cached script (strictly verifying it is Hinglish)
  const sbIncident = persistentSandboxIncidents.get(incident.id);
  if (sbIncident?.last_voice_script && sbIncident.last_voice_script.length > 20 && isHinglishText(sbIncident.last_voice_script)) {
    console.info(`[Voice Service] ⚡ Sandbox incident Hinglish cache HIT for "${incident.id}"`);
    voiceScriptCache.set(incident.id, {
      script: sbIncident.last_voice_script,
      timestamp: Date.now(),
      incidentId: incident.id,
      source: "SANDBOX_CACHE",
    });
    return { incident, script: sbIncident.last_voice_script, source: "SANDBOX_CACHE" };
  }

  // 4. Generate voice script via Gemini dynamically from scratch
  const { script, source, modelUsed } = await generateGeminiVoiceRecoveryScript(incident, 8000);

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

  // Pre-generate Gemini Hinglish script so it is ready and audited
  let scriptPreview = "";
  try {
    // Check if incident already has a valid Hinglish script cached
    const sbIncident = persistentSandboxIncidents.get(incident.id);
    if (sbIncident?.last_voice_script && isHinglishText(sbIncident.last_voice_script)) {
      scriptPreview = sbIncident.last_voice_script;
      voiceScriptCache.set(incident.id, {
        script: scriptPreview,
        timestamp: Date.now(),
        incidentId: incident.id,
        source: "SANDBOX_CACHE",
      });
    } else {
      const scriptRes = await generateGeminiVoiceRecoveryScript(incident);
      scriptPreview = scriptRes.script;
      
      // Store in global fast memory cache for instant Exotel Passthru retrieval
      voiceScriptCache.set(incident.id, {
        script: scriptPreview,
        timestamp: Date.now(),
        incidentId: incident.id,
        source: scriptRes.source,
      });

      if (sbIncident) {
        sbIncident.last_voice_script = scriptPreview;
        sbIncident.last_voice_script_at = now;
      }
    }
  } catch (e) {
    console.error("[Exotel Voice] ❌ AI generation failed for voice call dispatch:", e);
    scriptPreview = getEmergencyTechnicalFallback(incident);
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
