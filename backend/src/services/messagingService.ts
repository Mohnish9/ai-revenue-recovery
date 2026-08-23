// Server-side Outreach Messaging Adapter
// Performs real API calls to Twilio (WhatsApp & SMS) and Resend (Email)
// Provides complete transparency on provider dispatch status (SENT / FAILED)

export interface OutboundDeliveryResult {
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  provider: "TWILIO" | "RESEND" | "SIMULATION_ENGINE";
  status: "DELIVERED" | "SENT" | "FAILED" | "SIMULATED";
  deliveryLabel: string;
  isRealDispatch: boolean;
  providerMessageId?: string;
  providerStatus?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  httpStatus?: number;
  destination: string;
  content: {
    subject?: string;
    body: string;
    resolvedPaymentUrl?: string;
  };
  error?: string;
  dispatchedAt: string;
}

export async function sendWhatsAppMessage(params: {
  toPhone?: string;
  customerName: string;
  messageBody: string;
  incidentId: string;
  paymentUrl?: string;
}): Promise<OutboundDeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const configuredFromWhatsApp = process.env.TWILIO_WHATSAPP_FROM?.trim() || "+14155238886";
  const rawDestination = params.toPhone?.trim() || "";
  const now = new Date().toISOString();

  // If real Twilio credentials are configured
  if (accountSid && authToken) {
    if (!rawDestination) {
      return {
        channel: "WHATSAPP",
        provider: "TWILIO",
        status: "FAILED",
        deliveryLabel: "WhatsApp Failed (No Phone)",
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
      const cleanTo = rawDestination.replace(/[^\d+]/g, "");
      const formattedTo = cleanTo.startsWith("+") ? cleanTo : `+${cleanTo}`;
      const toWhatsApp = formattedTo.startsWith("whatsapp:") ? formattedTo : `whatsapp:${formattedTo}`;

      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
      const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim() || process.env.TWILIO_CONTENT_SID?.trim();

      const cleanFrom = configuredFromWhatsApp.replace(/^whatsapp:/, "");
      const fromWhatsAppFull = `whatsapp:${cleanFrom.startsWith("+") ? cleanFrom : `+${cleanFrom}`}`;

      const formData = new URLSearchParams();
      formData.append("To", toWhatsApp);
      formData.append("From", fromWhatsAppFull);

      if (contentSid) {
        formData.append("ContentSid", contentSid);
        formData.append("ContentVariables", JSON.stringify({
          "1": params.customerName || "Customer",
          "2": params.paymentUrl || "https://recoverly.ai",
          "3": "Payment Resolution"
        }));
      } else {
        formData.append("Body", params.messageBody);
      }

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

      // If initial sender fails with sender error and wasn't the sandbox default +14155238886, retry with sandbox number
      if (!response.ok && (data.code === 572002 || data.code === 21211 || data.code === 63007) && cleanFrom !== "+14155238886") {
        const retryFormData = new URLSearchParams();
        retryFormData.append("To", toWhatsApp);
        retryFormData.append("From", "whatsapp:+14155238886");
        if (contentSid) {
          retryFormData.append("ContentSid", contentSid);
          retryFormData.append("ContentVariables", JSON.stringify({
            "1": params.customerName || "Customer",
            "2": params.paymentUrl || "https://recoverly.ai",
            "3": "Payment Resolution"
          }));
        } else {
          retryFormData.append("Body", params.messageBody);
        }

        response = await fetch(
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
        data = await response.json().catch(() => ({}));
      }

      if (response.ok && data.sid) {
        return {
          channel: "WHATSAPP",
          provider: "TWILIO",
          status: "SENT",
          deliveryLabel: "WhatsApp Sent (Twilio)",
          isRealDispatch: true,
          providerMessageId: data.sid,
          providerStatus: data.status || "queued",
          httpStatus: response.status,
          destination: formattedTo,
          content: {
            body: params.messageBody,
            resolvedPaymentUrl: params.paymentUrl,
          },
          dispatchedAt: now,
        };
      } else {
        const isContentSidRequired = data.code === 21654;
        const deliveryLabel = isContentSidRequired
          ? "WhatsApp Template Required (ContentSid)"
          : `WhatsApp Failed (${data.code || response.status})`;
        const errorMsg = isContentSidRequired
          ? "Twilio WhatsApp trial accounts require pre-approved Content Templates (ContentSid). Custom text bodies require an upgraded account or an active 24-hour inbound WhatsApp conversation session."
          : data.message || `Twilio WhatsApp HTTP ${response.status} (Code: ${data.code || "UNKNOWN"})`;

        console.info(`[WhatsApp Adapter] ${deliveryLabel}: ${errorMsg}`);

        return {
          channel: "WHATSAPP",
          provider: "TWILIO",
          status: "FAILED",
          deliveryLabel,
          isRealDispatch: true,
          providerMessageId: data.sid || undefined,
          providerStatus: data.status || `HTTP_${response.status}`,
          providerErrorCode: String(data.code || response.status),
          providerErrorMessage: errorMsg,
          httpStatus: response.status,
          destination: formattedTo,
          error: errorMsg,
          content: {
            body: params.messageBody,
            resolvedPaymentUrl: params.paymentUrl,
          },
          dispatchedAt: now,
        };
      }
    } catch (err: any) {
      console.warn("[WhatsApp Adapter] Exception calling Twilio:", err);
      return {
        channel: "WHATSAPP",
        provider: "TWILIO",
        status: "FAILED",
        deliveryLabel: "WhatsApp Network Error",
        isRealDispatch: true,
        destination: rawDestination,
        providerErrorCode: "NETWORK_EXCEPTION",
        providerErrorMessage: err?.message || "Failed to reach Twilio API",
        error: err?.message || "Failed to reach Twilio API",
        content: {
          body: params.messageBody,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }
  }

  // Twilio credentials not configured in environment
  return {
    channel: "WHATSAPP",
    provider: "SIMULATION_ENGINE",
    status: "SIMULATED",
    deliveryLabel: "WhatsApp Simulated (No Twilio Credentials)",
    isRealDispatch: false,
    destination: rawDestination || "[No Phone Provided]",
    content: {
      body: params.messageBody,
      resolvedPaymentUrl: params.paymentUrl,
    },
    dispatchedAt: now,
  };
}

export async function sendSmsMessage(params: {
  toPhone?: string;
  customerName: string;
  messageBody: string;
  incidentId: string;
  paymentUrl?: string;
}): Promise<OutboundDeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromSms = process.env.TWILIO_SMS_FROM?.trim();
  const rawDestination = params.toPhone?.trim() || "";
  const now = new Date().toISOString();

  // If real Twilio credentials are configured
  if (accountSid && authToken) {
    if (!fromSms) {
      return {
        channel: "SMS",
        provider: "TWILIO",
        status: "FAILED",
        deliveryLabel: "SMS Failed (Missing TWILIO_SMS_FROM)",
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

    if (!rawDestination) {
      return {
        channel: "SMS",
        provider: "TWILIO",
        status: "FAILED",
        deliveryLabel: "SMS Failed (No Phone)",
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
      const cleanTo = rawDestination.replace(/[^\d+]/g, "");
      const formattedTo = cleanTo.startsWith("+") ? cleanTo : `+${cleanTo}`;
      const cleanFrom = fromSms.replace(/[^\d+]/g, "");
      const formattedFrom = cleanFrom.startsWith("+") ? cleanFrom : `+${cleanFrom}`;

      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

      // Dispatch exact dynamic message generated by Gemini
      const formData = new URLSearchParams();
      formData.append("To", formattedTo);
      formData.append("From", formattedFrom);
      formData.append("Body", params.messageBody);

      const response = await fetch(
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

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.sid) {
        return {
          channel: "SMS",
          provider: "TWILIO",
          status: "SENT",
          deliveryLabel: "SMS Sent (Twilio)",
          isRealDispatch: true,
          providerMessageId: data.sid,
          providerStatus: data.status || "queued",
          httpStatus: response.status,
          destination: formattedTo,
          content: {
            body: params.messageBody,
            resolvedPaymentUrl: params.paymentUrl,
          },
          dispatchedAt: now,
        };
      } else {
        const errorMsg = data.message || `Twilio SMS HTTP ${response.status} (Code: ${data.code || "UNKNOWN"})`;
        console.warn("[SMS Adapter] Twilio SMS call returned error:", errorMsg);

        return {
          channel: "SMS",
          provider: "TWILIO",
          status: "FAILED",
          deliveryLabel: `SMS Failed (Twilio ${data.code || response.status})`,
          isRealDispatch: true,
          providerMessageId: data.sid || undefined,
          providerStatus: data.status || `HTTP_${response.status}`,
          providerErrorCode: String(data.code || response.status),
          providerErrorMessage: errorMsg,
          httpStatus: response.status,
          destination: formattedTo,
          error: errorMsg,
          content: {
            body: params.messageBody,
            resolvedPaymentUrl: params.paymentUrl,
          },
          dispatchedAt: now,
        };
      }
    } catch (err: any) {
      console.warn("[SMS Adapter] Exception calling Twilio SMS:", err);
      return {
        channel: "SMS",
        provider: "TWILIO",
        status: "FAILED",
        deliveryLabel: "SMS Network Error",
        isRealDispatch: true,
        destination: rawDestination,
        providerErrorCode: "NETWORK_EXCEPTION",
        providerErrorMessage: err?.message || "Failed to reach Twilio SMS API",
        error: err?.message || "Failed to reach Twilio SMS API",
        content: {
          body: params.messageBody,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }
  }

  // Twilio credentials not configured in environment
  return {
    channel: "SMS",
    provider: "SIMULATION_ENGINE",
    status: "SIMULATED",
    deliveryLabel: "SMS Simulated (No Twilio Credentials)",
    isRealDispatch: false,
    destination: rawDestination || "[No Phone Provided]",
    content: {
      body: params.messageBody,
      resolvedPaymentUrl: params.paymentUrl,
    },
    dispatchedAt: now,
  };
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
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";
  const rawDestination = params.toEmail?.trim() || "";
  const now = new Date().toISOString();

  // If Resend API Key is configured
  if (resendApiKey) {
    if (!rawDestination) {
      return {
        channel: "EMAIL",
        provider: "RESEND",
        status: "FAILED",
        deliveryLabel: "Email Failed (No Email)",
        isRealDispatch: true,
        destination: "[Missing Email Address]",
        providerErrorCode: "MISSING_EMAIL",
        providerErrorMessage: "Recipient email address was not provided on the incident.",
        error: "Recipient email address was not provided on the incident.",
        content: {
          subject: params.subject,
          body: params.bodyText,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }

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

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [rawDestination],
          subject: params.subject || "Action Required: Resolving Your Payment",
          html: htmlPayload,
          text: params.bodyText,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.id) {
        return {
          channel: "EMAIL",
          provider: "RESEND",
          status: "SENT",
          deliveryLabel: "Email Sent (Resend)",
          isRealDispatch: true,
          providerMessageId: data.id,
          providerStatus: "delivered",
          httpStatus: response.status,
          destination: rawDestination,
          content: {
            subject: params.subject,
            body: params.bodyText,
            resolvedPaymentUrl: params.paymentUrl,
          },
          dispatchedAt: now,
        };
      } else {
        const errorMsg = data.message || `Resend error HTTP ${response.status} (${data.name || "API_ERROR"})`;
        console.warn("[Email Adapter] Resend call returned error:", errorMsg);

        return {
          channel: "EMAIL",
          provider: "RESEND",
          status: "FAILED",
          deliveryLabel: `Email Failed (Resend ${response.status})`,
          isRealDispatch: true,
          providerMessageId: data.id || undefined,
          providerStatus: `HTTP_${response.status}`,
          providerErrorCode: String(data.name || data.statusCode || response.status),
          providerErrorMessage: errorMsg,
          httpStatus: response.status,
          destination: rawDestination,
          error: errorMsg,
          content: {
            subject: params.subject,
            body: params.bodyText,
            resolvedPaymentUrl: params.paymentUrl,
          },
          dispatchedAt: now,
        };
      }
    } catch (err: any) {
      console.warn("[Email Adapter] Exception calling Resend:", err);
      return {
        channel: "EMAIL",
        provider: "RESEND",
        status: "FAILED",
        deliveryLabel: "Email Network Error",
        isRealDispatch: true,
        destination: rawDestination,
        providerErrorCode: "NETWORK_EXCEPTION",
        providerErrorMessage: err?.message || "Failed to reach Resend API",
        error: err?.message || "Failed to reach Resend API",
        content: {
          subject: params.subject,
          body: params.bodyText,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }
  }

  // Resend not configured
  return {
    channel: "EMAIL",
    provider: "SIMULATION_ENGINE",
    status: "SIMULATED",
    deliveryLabel: "Email Simulated (No Resend API Key)",
    isRealDispatch: false,
    destination: rawDestination || "[No Email Provided]",
    content: {
      subject: params.subject,
      body: params.bodyText,
      resolvedPaymentUrl: params.paymentUrl,
    },
    dispatchedAt: now,
  };
}
        provider: "RESEND",
        status: "FAILED",
        deliveryLabel: "Email Network Error",
        isRealDispatch: true,
        destination: rawDestination,
        error: err?.message || "Failed to reach Resend API",
        content: {
          subject: params.subject,
          body: params.bodyText,
          resolvedPaymentUrl: params.paymentUrl,
        },
        dispatchedAt: now,
      };
    }
  }

  // Resend credentials not configured in environment
  return {
    channel: "EMAIL",
    provider: "SIMULATION_ENGINE",
    status: "SIMULATED",
    deliveryLabel: "Email Simulated (No Resend API Key)",
    isRealDispatch: false,
    destination: rawDestination || "[No Email Provided]",
    content: {
      subject: params.subject,
      body: params.bodyText,
      resolvedPaymentUrl: params.paymentUrl,
    },
    dispatchedAt: now,
  };
}


