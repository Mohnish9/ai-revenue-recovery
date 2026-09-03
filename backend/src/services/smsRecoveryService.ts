import { findIncidentForVoiceRecovery, VoiceRecoveryIncidentData } from "./voiceRecoveryService.js";
import { getDemoTestContactConfig } from "./demoTestContactService.js";
import { normalizeToE164 } from "./messagingService.js";
import { UserProfile, canUserAccess } from "./dataAccessService.js";

export interface SmsDeliveryResult {
  channel: "SMS";
  provider: "EXOTEL";
  status: "SENT" | "FAILED" | "UNCONFIGURED";
  deliveryLabel: string;
  isRealDispatch: boolean;
  destination: string;
  actualDestination: string;
  routedToTestContact?: boolean;
  messageSid?: string;
  accountSid?: string;
  fromSender?: string;
  dltTemplateId?: string;
  dltEntityId?: string;
  body: string;
  httpStatus?: number;
  providerStatus?: string;
  error?: string;
  dispatchedAt: string;
  incident?: {
    id: string;
    customerName: string;
    amount: number;
    currency: string;
  };
}

/**
 * Normalizes Indian and International phone numbers for Exotel SMS API.
 * Exotel accepts E.164 (e.g. +919876543210), 10-digit Indian (e.g. 9876543210),
 * or with leading 0 (e.g. 09876543210).
 */
export function formatExotelSmsDestination(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  // If starts with +, keep clean
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // 10-digit Indian mobile number -> prefix with +91 or 0
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // 12-digit Indian number starting with 91
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return cleaned;
}

/**
 * Generates a concise, high-converting recovery SMS text.
 */
export function generateSmsRecoveryText(
  incident: VoiceRecoveryIncidentData,
  customBody?: string
): string {
  if (customBody && customBody.trim().length > 0) {
    return customBody.trim();
  }

  const name = incident.customerName || "Customer";
  const amountStr = incident.amount > 0
    ? `${incident.currency || "INR"} ${incident.amount.toLocaleString()}`
    : "pending amount";
  const link = incident.paymentUrl || `https://recoverly.ai/resolve/${incident.id}`;

  return `Hello ${name}, your payment of ${amountStr} could not be completed. Please tap the secure link to complete authorization: ${link} - Recoverly Support Ref: ${incident.id.slice(0, 8)}`;
}

/**
 * Dispatches an automated Payment Recovery SMS via Exotel's official SMS API.
 */
export async function sendExotelSmsRecovery(params: {
  incidentId: string;
  toPhone?: string;
  customMessage?: string;
  senderId?: string;
  dltTemplateId?: string;
  dltEntityId?: string;
}, user?: UserProfile): Promise<SmsDeliveryResult> {
  const now = new Date().toISOString();
  const rawIncidentId = (params.incidentId || "").trim();

  // 1. Locate Incident Data
  const incident = await findIncidentForVoiceRecovery(rawIncidentId);
  const rawPhone = (params.toPhone || incident?.customerPhone || "").trim();

  const demoContact = getDemoTestContactConfig();
  const shouldUseTestContact = demoContact.enabled && !!demoContact.verifiedPhone;
  const destinationPhone = shouldUseTestContact ? demoContact.verifiedPhone : rawPhone;

  // 2. Validate Exotel Credentials
  const exotelApiKey = process.env.EXOTEL_API_KEY?.trim();
  const exotelApiToken = process.env.EXOTEL_API_TOKEN?.trim();
  const exotelSid = process.env.EXOTEL_SID?.trim();
  const exotelExoPhone = process.env.EXOTEL_EXOPHONE?.trim();
  const configuredSenderId =
    params.senderId?.trim() ||
    process.env.EXOTEL_SMS_SENDER_ID?.trim() ||
    (process.env as any).EXOTEL_SENDER_ID?.trim() ||
    exotelExoPhone ||
    "";

  const dltEntityId =
    params.dltEntityId?.trim() ||
    process.env.EXOTEL_SMS_ENTITY_ID?.trim() ||
    (process.env as any).EXOTEL_DLT_ENTITY_ID?.trim() ||
    "";

  const dltTemplateId =
    params.dltTemplateId?.trim() ||
    process.env.EXOTEL_SMS_DLT_TEMPLATE_ID?.trim() ||
    (process.env as any).EXOTEL_DLT_TEMPLATE_ID?.trim() ||
    "";

  // Build SMS content
  const smsBody = incident
    ? generateSmsRecoveryText(incident, params.customMessage)
    : params.customMessage || `Hello, your pending payment of INR could not be processed. Please visit https://recoverly.ai to resolve securely. Ref: ${rawIncidentId}`;

  // Check if credentials exist
  if (!exotelApiKey || !exotelApiToken || !exotelSid) {
    const missing = [];
    if (!exotelApiKey) missing.push("EXOTEL_API_KEY");
    if (!exotelApiToken) missing.push("EXOTEL_API_TOKEN");
    if (!exotelSid) missing.push("EXOTEL_SID");

    const errorMsg = `Exotel SMS requires ${missing.join(", ")} environment variables in Render.`;
    console.warn(`[Exotel SMS] ⚠️ Unconfigured: ${errorMsg}`);

    return {
      channel: "SMS",
      provider: "EXOTEL",
      status: "UNCONFIGURED",
      deliveryLabel: "Exotel SMS Unconfigured (Missing API Credentials)",
      isRealDispatch: false,
      destination: rawPhone || "[No Phone]",
      actualDestination: destinationPhone || "[No Phone]",
      body: smsBody,
      error: errorMsg,
      dispatchedAt: now,
      incident: incident ? {
        id: incident.id,
        customerName: incident.customerName,
        amount: incident.amount,
        currency: incident.currency,
      } : undefined,
    };
  }

  if (!destinationPhone) {
    const errorMsg = `Recipient destination phone number is missing on incident "${rawIncidentId}".`;
    console.warn(`[Exotel SMS] ⚠️ Dispatch aborted: ${errorMsg}`);

    return {
      channel: "SMS",
      provider: "EXOTEL",
      status: "FAILED",
      deliveryLabel: "SMS Failed (Missing Recipient Phone Number)",
      isRealDispatch: true,
      destination: "[Missing Phone]",
      actualDestination: "[Missing Phone]",
      body: smsBody,
      error: errorMsg,
      dispatchedAt: now,
      incident: incident ? {
        id: incident.id,
        customerName: incident.customerName,
        amount: incident.amount,
        currency: incident.currency,
      } : undefined,
    };
  }

  if (!configuredSenderId) {
    const errorMsg = `Exotel SMS requires EXOTEL_SMS_SENDER_ID or EXOTEL_EXOPHONE in environment variables.`;
    console.warn(`[Exotel SMS] ⚠️ Dispatch aborted: ${errorMsg}`);

    return {
      channel: "SMS",
      provider: "EXOTEL",
      status: "FAILED",
      deliveryLabel: "SMS Failed (No Sender ID / ExoPhone Configured)",
      isRealDispatch: true,
      destination: rawPhone,
      actualDestination: destinationPhone,
      body: smsBody,
      error: errorMsg,
      dispatchedAt: now,
      incident: incident ? {
        id: incident.id,
        customerName: incident.customerName,
        amount: incident.amount,
        currency: incident.currency,
      } : undefined,
    };
  }

  // 3. Prepare Exotel SMS API Dispatch
  const formattedDestination = formatExotelSmsDestination(destinationPhone);
  const exotelSmsUrl = `https://api.exotel.com/v1/Accounts/${encodeURIComponent(exotelSid)}/Sms/send.json`;
  const basicAuth = Buffer.from(`${exotelApiKey}:${exotelApiToken}`).toString("base64");

  const formData = new URLSearchParams();
  formData.append("From", configuredSenderId);
  formData.append("To", formattedDestination);
  formData.append("Body", smsBody);

  if (dltEntityId) {
    formData.append("DltEntityId", dltEntityId);
  }
  if (dltTemplateId) {
    formData.append("DltTemplateId", dltTemplateId);
  }

  const baseUrl = (process.env.BACKEND_URL || "").trim();
  if (baseUrl) {
    formData.append("StatusCallback", `${baseUrl}/api/voice/exotel-callback`);
  }

  const maskedPhone = formattedDestination.length > 5
    ? `${formattedDestination.slice(0, 4)}****${formattedDestination.slice(-2)}`
    : formattedDestination;

  console.info(`[Exotel SMS] 📱 Dispatching Exotel SMS API`);
  console.info(`[Exotel SMS] ├─ Endpoint: ${exotelSmsUrl}`);
  console.info(`[Exotel SMS] ├─ Incident: ${rawIncidentId} (${incident?.customerName || "Customer"})`);
  console.info(`[Exotel SMS] ├─ Destination (To): ${maskedPhone} (Demo Contact: ${shouldUseTestContact})`);
  console.info(`[Exotel SMS] ├─ Sender ID (From): ${configuredSenderId}`);
  if (dltEntityId) console.info(`[Exotel SMS] ├─ DLT Entity ID: ${dltEntityId}`);
  if (dltTemplateId) console.info(`[Exotel SMS] ├─ DLT Template ID: ${dltTemplateId}`);
  console.info(`[Exotel SMS] └─ Body Preview: "${smsBody.slice(0, 80)}..."`);

  try {
    const response = await fetch(exotelSmsUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await response.json().catch(() => ({}));

    // Exotel SMS response format:
    // Success: { "SMSMessage": { "Sid": "...", "Status": "queued", "DateCreated": "...", "From": "...", "To": "..." } }
    // Failure: { "RestException": { "Status": 400, "Message": "...", "Code": 400 } }
    const smsMessage = data.SMSMessage;
    const restException = data.RestException;

    if (response.ok && smsMessage && smsMessage.Sid) {
      console.info(`[Exotel SMS] ✅ SMS Accepted by Exotel. SID: ${smsMessage.Sid}, Status: ${smsMessage.Status || "queued"}`);

      return {
        channel: "SMS",
        provider: "EXOTEL",
        status: "SENT",
        deliveryLabel: shouldUseTestContact
          ? `SMS Sent via Exotel (Routed to Demo Contact: ${demoContact.verifiedPhone})`
          : `SMS Sent via Exotel (SID: ${smsMessage.Sid})`,
        isRealDispatch: true,
        destination: shouldUseTestContact ? `${rawPhone} (via ${demoContact.verifiedPhone})` : rawPhone,
        actualDestination: formattedDestination,
        routedToTestContact: shouldUseTestContact,
        messageSid: smsMessage.Sid,
        accountSid: smsMessage.AccountSid || exotelSid,
        fromSender: smsMessage.From || configuredSenderId,
        dltTemplateId: dltTemplateId || undefined,
        dltEntityId: dltEntityId || undefined,
        body: smsBody,
        httpStatus: response.status,
        providerStatus: smsMessage.Status || "queued",
        dispatchedAt: now,
        incident: incident ? {
          id: incident.id,
          customerName: incident.customerName,
          amount: incident.amount,
          currency: incident.currency,
        } : undefined,
      };
    } else {
      let errorMsg = restException?.Message || data.message || `Exotel SMS HTTP ${response.status}`;
      const errorCode = restException?.Code || restException?.Status || response.status;

      // Provide human-friendly DLT guidance if relevant
      if (
        String(errorMsg).toLowerCase().includes("dlt") ||
        String(errorMsg).toLowerCase().includes("template") ||
        errorCode === 400
      ) {
        errorMsg = `${errorMsg}. For Indian destinations, ensure EXOTEL_SMS_SENDER_ID matches your DLT-approved header and EXOTEL_SMS_DLT_TEMPLATE_ID / EXOTEL_SMS_ENTITY_ID are registered on your Exotel dashboard.`;
      }

      console.warn(`[Exotel SMS] ⚠️ Exotel SMS Rejection: HTTP ${response.status} (Code ${errorCode}) — ${errorMsg}`);

      return {
        channel: "SMS",
        provider: "EXOTEL",
        status: "FAILED",
        deliveryLabel: `SMS Rejected by Exotel (Code: ${errorCode})`,
        isRealDispatch: true,
        destination: shouldUseTestContact ? `${rawPhone} (Target: ${demoContact.verifiedPhone})` : rawPhone,
        actualDestination: formattedDestination,
        routedToTestContact: shouldUseTestContact,
        fromSender: configuredSenderId,
        dltTemplateId: dltTemplateId || undefined,
        dltEntityId: dltEntityId || undefined,
        body: smsBody,
        httpStatus: response.status,
        providerStatus: `HTTP_${response.status}`,
        error: errorMsg,
        dispatchedAt: now,
        incident: incident ? {
          id: incident.id,
          customerName: incident.customerName,
          amount: incident.amount,
          currency: incident.currency,
        } : undefined,
      };
    }
  } catch (err: any) {
    const errorMsg = err?.message || "Network exception contacting Exotel SMS API";
    console.error("[Exotel SMS] ❌ Network exception calling Exotel SMS API:", err);

    return {
      channel: "SMS",
      provider: "EXOTEL",
      status: "FAILED",
      deliveryLabel: "SMS Dispatch Failed (Network Exception)",
      isRealDispatch: true,
      destination: rawPhone,
      actualDestination: formattedDestination,
      fromSender: configuredSenderId,
      body: smsBody,
      error: errorMsg,
      dispatchedAt: now,
      incident: incident ? {
        id: incident.id,
        customerName: incident.customerName,
        amount: incident.amount,
        currency: incident.currency,
      } : undefined,
    };
  }
}
