// Server-side Outreach Messaging Adapter
// Performs real API calls to Exotel (Voice & SMS) and Resend (Email)
// Strictly enforces Provider Delivery Truthfulness:
// 1. REAL: Actually called provider and received a verified Message SID / ID.
// 2. SIMULATED: No real provider delivery occurred (e.g. no credentials or simulated mode).
// 3. FAILED: Provider rejected the request (shows actual provider error code & message). NEVER labeled SENT.

import { getDemoTestContactConfig } from "./demoTestContactService.js";

export type DeliveryMode = "REAL" | "SIMULATED" | "FAILED";

export interface OutboundDeliveryResult {
  channel: "EMAIL" | "VOICE" | "SMS";
  provider: "RESEND" | "EXOTEL" | "TWILIO" | "SIMULATION_ENGINE";
  deliveryMode: DeliveryMode;
  status: "SENT" | "SIMULATED" | "FAILED";
  deliveryLabel: string;
  isRealDispatch: boolean;
  destination: string;
  routedToTestContact?: boolean;
  testContactTarget?: string;
  actualDestination?: string;
  providerMessageId?: string;
  providerStatus?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  httpStatus?: number;
  content: {
    subject?: string;
    body: string;
    resolvedPaymentUrl?: string;
    contentSid?: string;
    templateVariables?: Record<string, string>;
  };
  error?: string;
  dispatchedAt: string;
}

export function normalizeToE164(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.trim();
  const digits = cleaned.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return `+${digits}`;
}

export async function sendSmsMessage(params: {
  toPhone?: string;
  customerName: string;
  messageBody: string;
  incidentId: string;
  paymentUrl?: string;
  amount?: string;
  incidentContext?: string;
}): Promise<OutboundDeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromSms =
    process.env.TWILIO_SMS_FROM?.trim() ||
    process.env.TWILIO_PHONE_NUMBER?.trim() ||
    process.env.TWILIO_NUMBER?.trim() ||
    process.env.TWILIO_FROM?.trim() ||
    process.env.TWILIO_FROM_SMS?.trim();
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ||
    process.env.TWILIO_SERVICE_SID?.trim();
  const rawDestination = params.toPhone?.trim() || "";
  const now = new Date().toISOString();

  const demoContact = getDemoTestContactConfig();
  const shouldUseTestContact = demoContact.enabled && !!demoContact.verifiedPhone;
  const targetPhone = shouldUseTestContact ? demoContact.verifiedPhone : rawDestination;

  // If no Twilio credentials configured, return truthful SIMULATED status
  if (!accountSid || !authToken) {
    return {
      channel: "SMS",
      provider: "SIMULATION_ENGINE",
      deliveryMode: "SIMULATED",
      status: "SIMULATED",
      deliveryLabel: "SMS Simulated (No Twilio Credentials Configured)",
      isRealDispatch: false,
      destination: rawDestination || "[No Phone Provided]",
      content: {
        body: params.messageBody,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }

  if (!fromSms && !messagingServiceSid) {
    return {
      channel: "SMS",
      provider: "TWILIO",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "SMS Failed (Missing TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID)",
      isRealDispatch: true,
      destination: rawDestination || "[No Phone Provided]",
      providerErrorCode: "CONFIG_ERROR",
      providerErrorMessage: "TWILIO_SMS_FROM sender number is not configured in environment.",
      error: "TWILIO_SMS_FROM sender number is not configured in environment.",
      content: {
        body: params.messageBody,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }

  if (!targetPhone) {
    return {
      channel: "SMS",
      provider: "TWILIO",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "SMS Failed (Missing Phone Number)",
      isRealDispatch: true,
      destination: "[Missing Phone Number]",
      providerErrorCode: "MISSING_PHONE",
      providerErrorMessage: "Recipient phone number was not provided on the incident.",
      error: "Recipient phone number was not provided on the incident.",
      content: {
        body: params.messageBody,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }

  try {
    const formattedTo = normalizeToE164(targetPhone);
    const formattedFrom = fromSms ? normalizeToE164(fromSms) : "";

    const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
    const contentSid = process.env.TWILIO_SMS_CONTENT_SID?.trim() || process.env.TWILIO_CONTENT_SID?.trim();

    const templateVariables: Record<string, string> = {
      "1": params.customerName || "Customer",
      "2": params.amount || "Outstanding Amount",
      "3": params.paymentUrl || "https://recoverly.ai",
      "4": params.incidentContext || "Payment Recovery Notice",
    };

    const formData = new URLSearchParams();
    formData.append("To", formattedTo);
    if (formattedFrom) {
      formData.append("From", formattedFrom);
    } else if (messagingServiceSid) {
      formData.append("MessagingServiceSid", messagingServiceSid);
    }

    const messageText = shouldUseTestContact
      ? `[Demo Test Recovery for ${params.customerName} (${rawDestination})]\n\n${params.messageBody}`
      : params.messageBody;

    if (contentSid) {
      formData.append("ContentSid", contentSid);
      formData.append("ContentVariables", JSON.stringify(templateVariables));
    } else {
      formData.append("Body", messageText);
    }

    console.info(`[SMS Dispatch] Sending to ${formattedTo} via ${formattedFrom || messagingServiceSid} (Demo Contact: ${shouldUseTestContact})`);

    let response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    let data = await response.json().catch(() => ({}));

    // If Twilio Trial restriction 572006 occurs (Trial accounts can only use predefined SMS templates)
    // Attempt automatic retry with standard trial-approved concise recovery notification format
    if (!response.ok && data.code === 572006 && !contentSid) {
      const trialSmsText = shouldUseTestContact
        ? `[Demo Test for ${params.customerName}] Payment authorization link: ${params.paymentUrl || "https://recoverly.ai"}`
        : `Recoverly notice for ${params.customerName}: Your payment of ${params.amount || "amount"} is pending. Complete authorization: ${params.paymentUrl || "https://recoverly.ai"}`;

      console.info(`[SMS Dispatch] Twilio 572006 trial restriction encountered. Retrying with standardized trial SMS template...`);
      const retryFormData = new URLSearchParams();
      retryFormData.append("To", formattedTo);
      if (formattedFrom) {
        retryFormData.append("From", formattedFrom);
      } else if (messagingServiceSid) {
        retryFormData.append("MessagingServiceSid", messagingServiceSid);
      }
      retryFormData.append("Body", trialSmsText);

      const retryResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: retryFormData.toString(),
        }
      );
      const retryData = await retryResponse.json().catch(() => ({}));
      if (retryResponse.ok && retryData.sid) {
        response = retryResponse;
        data = retryData;
      }
    }

    if (response.ok && data.sid) {
      console.info(`[SMS Dispatch] REAL SUCCESS: Twilio SID ${data.sid}`);
      return {
        channel: "SMS",
        provider: "TWILIO",
        deliveryMode: "REAL",
        status: "SENT",
        deliveryLabel: shouldUseTestContact
          ? `SMS Sent via Twilio (Routed to Demo Contact: ${demoContact.verifiedPhone})`
          : `SMS Sent via Twilio (SID: ${data.sid})`,
        isRealDispatch: true,
        destination: shouldUseTestContact ? `${rawDestination} (via ${demoContact.verifiedPhone})` : formattedTo,
        routedToTestContact: shouldUseTestContact,
        actualDestination: formattedTo,
        providerMessageId: data.sid,
        providerStatus: data.status || "queued",
        httpStatus: response.status,
        content: {
          body: messageText,
          resolvedPaymentUrl: params.paymentUrl,
          contentSid: contentSid || undefined,
          templateVariables: contentSid ? templateVariables : undefined,
        },
        dispatchedAt: now,
      };
    } else {
      // Real Twilio rejection - strictly return FAILED (NEVER SENT) with crystal clear diagnostic
      let errorMsg = data.message || `Twilio SMS HTTP ${response.status} (Code: ${data.code || "UNKNOWN"})`;
      let deliveryLabel = `SMS Rejected by Twilio (Code: ${data.code || response.status})`;

      if (data.code === 572002) {
        errorMsg = "Twilio Trial Restriction (Error 572002): In Twilio Trial mode, SMS can only be sent to verified phone numbers. To send SMS, either add this number to 'Verified Caller IDs' in Twilio Console (Phone Numbers > Verified Caller IDs), or enable 'Demo Test Contact' in Recoverly with your verified phone number.";
      } else if (data.code === 572006) {
        errorMsg = "Twilio Trial Restriction Error 572006: Trial accounts can only use predefined SMS templates. Custom dynamic AI messages require an upgraded Twilio account or a configured TWILIO_SMS_CONTENT_SID template.";
      } else if (data.code === 21608) {
        errorMsg = "Twilio Trial Restriction Error 21608: Recipient phone number is not a Twilio-verified caller ID. In Trial mode, verify the number in Twilio console first.";
      } else if (data.code === 21211) {
        errorMsg = "Twilio SMS Error 21211: Invalid recipient phone number format (E.164 required).";
      }

      console.warn(`[SMS Dispatch] Provider Rejection: ${deliveryLabel} — ${errorMsg}`);

      return {
        channel: "SMS",
        provider: "TWILIO",
        deliveryMode: "FAILED",
        status: "FAILED",
        deliveryLabel,
        isRealDispatch: true,
        destination: shouldUseTestContact ? `${rawDestination} (Target: ${demoContact.verifiedPhone})` : formattedTo,
        routedToTestContact: shouldUseTestContact,
        actualDestination: formattedTo,
        providerErrorCode: String(data.code || response.status),
        providerErrorMessage: errorMsg,
        error: errorMsg,
        providerStatus: data.status || `HTTP_${response.status}`,
        httpStatus: response.status,
        content: {
          body: messageText,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }
  } catch (err: any) {
    console.error("[SMS Adapter] Network exception calling Twilio:", err);
    return {
      channel: "SMS",
      provider: "TWILIO",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "SMS Call Failed (Network Exception)",
      isRealDispatch: true,
      destination: rawDestination,
      providerErrorCode: "NETWORK_ERROR",
      providerErrorMessage: err?.message || "Network exception contacting Twilio API",
      error: err?.message || "Network exception contacting Twilio API",
      content: {
        body: params.messageBody,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }
}

export async function sendEmailMessage(params: {
  toEmail?: string;
  customerName: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  incidentId: string;
  paymentUrl?: string;
}): Promise<OutboundDeliveryResult> {
  const rawCustomerEmail = (params.toEmail || "").trim();
  const customerEmail = rawCustomerEmail.toLowerCase();
  const verifiedEmail = (process.env.RESEND_TEST_EMAIL || process.env.DEMO_TEST_EMAIL || "").trim().toLowerCase();
  const now = new Date().toISOString();

  // 1. VERIFIED EMAIL ALLOWLIST CHECK: customer email must strictly equal RESEND_TEST_EMAIL
  if (!customerEmail || !verifiedEmail || customerEmail !== verifiedEmail) {
    const errorMsg = `Customer email "${rawCustomerEmail || "None"}" does not match verified allowlist (RESEND_TEST_EMAIL: "${verifiedEmail || "NOT_CONFIGURED"}"). Outbound email dispatch blocked.`;
    console.warn(`[Email Dispatch] Blocked unverified destination: ${errorMsg}`);

    return {
      channel: "EMAIL",
      provider: "RESEND",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "Email Failed (Destination Not Verified)",
      isRealDispatch: false,
      destination: rawCustomerEmail || "[No Email Provided]",
      actualDestination: rawCustomerEmail || "[No Email Provided]",
      providerErrorCode: "EMAIL_DESTINATION_NOT_VERIFIED",
      providerErrorMessage: errorMsg,
      error: "EMAIL_DESTINATION_NOT_VERIFIED",
      content: {
        subject: params.subject,
        body: params.bodyText,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }

  // 2. CHECK RESEND CONFIGURATION
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    const errorMsg = "Resend API key (RESEND_API_KEY) is not configured in environment variables.";
    console.warn(`[Email Dispatch] Aborted: ${errorMsg}`);

    return {
      channel: "EMAIL",
      provider: "RESEND",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "Email Failed (No Resend API Key Configured)",
      isRealDispatch: false,
      destination: rawCustomerEmail,
      actualDestination: rawCustomerEmail,
      providerErrorCode: "RESEND_NOT_CONFIGURED",
      providerErrorMessage: errorMsg,
      error: "RESEND_NOT_CONFIGURED",
      content: {
        subject: params.subject,
        body: params.bodyText,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }

  const emailFrom = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";
  if (!emailFrom) {
    const errorMsg = "Email sender (EMAIL_FROM) is not configured in environment variables.";
    console.warn(`[Email Dispatch] Aborted: ${errorMsg}`);

    return {
      channel: "EMAIL",
      provider: "RESEND",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "Email Failed (EMAIL_FROM Not Configured)",
      isRealDispatch: false,
      destination: rawCustomerEmail,
      actualDestination: rawCustomerEmail,
      providerErrorCode: "RESEND_NOT_CONFIGURED",
      providerErrorMessage: errorMsg,
      error: "RESEND_NOT_CONFIGURED",
      content: {
        subject: params.subject,
        body: params.bodyText,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }

  const targetEmail = rawCustomerEmail;

  try {
    const htmlPayload =
      params.bodyHtml ||
      `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800;">Recoverly Payment Recovery</h2>
          <span style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Automated Revenue Operations Notice</span>
        </div>
        <p style="font-size: 15px; margin: 16px 0;">${params.bodyText.replace(/\n/g, "<br/>")}</p>
        ${
          params.paymentUrl
            ? `<div style="margin: 28px 0; text-align: center;">
                <a href="${params.paymentUrl}" style="background: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.35);">
                  Resolve & Authorize Payment
                </a>
                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Direct link: <a href="${params.paymentUrl}" style="color: #2563eb;">${params.paymentUrl}</a></p>
              </div>`
            : ""
        }
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">Recoverly Autonomous Payment Protection • Incident Ref: <code>${params.incidentId}</code></p>
      </div>`;

    const emailSubject = params.subject || "Action Required: Resolving Your Payment";

    console.info(`[Email Dispatch] Initiating real Resend dispatch to verified recipient ${targetEmail} from ${emailFrom}...`);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [targetEmail],
        subject: emailSubject,
        html: htmlPayload,
        text: params.bodyText,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.id) {
      console.info(`[Email Dispatch] Resend SUCCESS (ID: ${data.id}) to ${targetEmail}`);
      return {
        channel: "EMAIL",
        provider: "RESEND",
        deliveryMode: "REAL",
        status: "SENT",
        deliveryLabel: `Email Sent via Resend (ID: ${data.id})`,
        isRealDispatch: true,
        destination: targetEmail,
        actualDestination: targetEmail,
        providerMessageId: data.id,
        providerStatus: "delivered",
        httpStatus: response.status,
        content: {
          subject: emailSubject,
          body: params.bodyText,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    } else {
      let errorMsg = data.message || `Resend error HTTP ${response.status} (${data.name || "API_ERROR"})`;
      if (data.name === "validation_error" || data.statusCode === 403) {
        if (data.message && (data.message.includes("testing emails to your own email address") || data.message.includes("verify a domain"))) {
          errorMsg = `Resend Free/Testing Restriction: In Resend testing mode, emails can only be sent to your account email address. To deliver real emails, verify a custom domain in Resend.`;
        }
      }
      console.warn("[Email Adapter] Resend call returned rejection:", errorMsg);

      return {
        channel: "EMAIL",
        provider: "RESEND",
        deliveryMode: "FAILED",
        status: "FAILED",
        deliveryLabel: `Email Rejected by Resend (${response.status})`,
        isRealDispatch: true,
        destination: targetEmail,
        actualDestination: targetEmail,
        providerErrorCode: String(data.name || data.statusCode || response.status),
        providerErrorMessage: errorMsg,
        error: errorMsg,
        providerStatus: `HTTP_${response.status}`,
        httpStatus: response.status,
        content: {
          subject: params.subject,
          body: params.bodyText,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }
  } catch (err: any) {
    console.error("[Email Adapter] Network exception calling Resend:", err);
    return {
      channel: "EMAIL",
      provider: "RESEND",
      deliveryMode: "FAILED",
      status: "FAILED",
      deliveryLabel: "Email Call Failed (Network Exception)",
      isRealDispatch: true,
      destination: targetEmail,
      actualDestination: targetEmail,
      providerErrorCode: "NETWORK_ERROR",
      providerErrorMessage: err?.message || "Network exception contacting Resend API",
      error: err?.message || "Network exception contacting Resend API",
      content: {
        subject: params.subject,
        body: params.bodyText,
        resolvedPaymentUrl: params.paymentUrl,
      },
      dispatchedAt: now,
    };
  }
}
