import { normalizeToE164, sendSmsMessage } from "./messagingService.js";
import { persistentSandboxIncidents } from "./autonomousRecoveryEngine.js";
import { getSupabaseClient } from "./supabaseService.js";

// Stores verified phones and WhatsApp sandbox connections in memory & database
const phoneVerificationStore = new Map<string, {
  phone: string;
  verifiedAt: string;
  status: "VERIFIED" | "NOT_VERIFIED";
  otpCode?: string;
  otpExpiresAt?: number;
}>();

const whatsAppSandboxStore = new Map<string, {
  phone: string;
  connectedAt: string;
  status: "CONNECTED" | "NOT_CONNECTED";
}>();

export interface DetailedChannelReadiness {
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  email: {
    status: "READY" | "RESTRICTED" | "FAILED" | "UNCONFIGURED";
    deliveryLabel: string;
    configuredSender: string;
    isResendTestingDomain: boolean;
    isDeliverableToRecipient: boolean;
    details: string;
    actionLabel: string;
    actionUrl: string;
  };
  phone: {
    phone_verification_status: "VERIFIED" | "NOT_VERIFIED";
    twilio_sms_status: "READY" | "TRIAL_RESTRICTED" | "FAILED" | "UNCONFIGURED";
    ownershipLabel: string;
    smsLabel: string;
    details: string;
    actionLabel: string;
  };
  whatsapp: {
    whatsapp_sandbox_status: "CONNECTED" | "NOT_CONNECTED" | "READY" | "UNCONFIGURED";
    sandboxNumber: string;
    joinKeyword: string;
    deepLink: string;
    details: string;
    actionLabel: string;
  };
  preflightPassed: boolean;
  preflightSummary: string;
  evaluatedAt: string;
}

export function getDetailedChannelReadiness(
  recipientEmail?: string,
  recipientPhone?: string,
  recipientName?: string
): DetailedChannelReadiness {
  const now = new Date().toISOString();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const configuredSender = process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  const isResendTestingDomain = configuredSender.toLowerCase().includes("onboarding@resend.dev") || configuredSender.toLowerCase().endsWith("@resend.dev");

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM?.trim() || "+14155238886";
  const twilioJoinKeyword = process.env.TWILIO_WHATSAPP_JOIN_KEYWORD?.trim() || "join recoverly";

  const targetEmail = recipientEmail?.trim() || "";
  const targetPhone = recipientPhone?.trim() ? normalizeToE164(recipientPhone.trim()) : "";

  // 1. Email Readiness Evaluation
  let emailStatus: "READY" | "RESTRICTED" | "FAILED" | "UNCONFIGURED" = "UNCONFIGURED";
  let emailDeliveryLabel = "Email Unconfigured";
  let emailDetails = "RESEND_API_KEY environment variable is not configured.";
  let isDeliverableToRecipient = false;

  if (!resendApiKey) {
    emailStatus = "UNCONFIGURED";
    emailDeliveryLabel = "Email Unconfigured (No RESEND_API_KEY)";
    emailDetails = "Resend API key is missing. Email dispatch will run in simulation mode.";
  } else if (!targetEmail) {
    emailStatus = "FAILED";
    emailDeliveryLabel = "Email Missing";
    emailDetails = "Recipient email address was not provided on this contact.";
  } else if (isResendTestingDomain) {
    // Resend testing sender onboarding@resend.dev restriction check
    const devTestEmail = process.env.RESEND_TEST_EMAIL?.trim().toLowerCase();
    const isMatchedTestEmail = devTestEmail && targetEmail.toLowerCase() === devTestEmail;

    if (isMatchedTestEmail) {
      emailStatus = "READY";
      emailDeliveryLabel = "Email Ready (Authorized Testing Address)";
      emailDetails = `Recipient matches configured development test address (${targetEmail}).`;
      isDeliverableToRecipient = true;
    } else {
      emailStatus = "RESTRICTED";
      emailDeliveryLabel = "EMAIL RESTRICTED — TEST SENDER (onboarding@resend.dev)";
      emailDetails = `Sender is set to onboarding@resend.dev. Resend testing sender can only deliver to the account owner's registered testing address. To deliver to customer email (${targetEmail}), please configure and verify a custom sender domain in Resend.`;
      isDeliverableToRecipient = false;
    }
  } else {
    emailStatus = "READY";
    emailDeliveryLabel = `Email Ready (${configuredSender})`;
    emailDetails = `Verified custom sender domain active. Outbound delivery to ${targetEmail} is supported.`;
    isDeliverableToRecipient = true;
  }

  // 2. Phone Ownership & Twilio SMS Readiness Evaluation
  const phoneRecord = targetPhone ? phoneVerificationStore.get(targetPhone) : undefined;
  const isPhoneVerified = phoneRecord?.status === "VERIFIED";

  let twilioSmsStatus: "READY" | "TRIAL_RESTRICTED" | "FAILED" | "UNCONFIGURED" = "UNCONFIGURED";
  let smsLabel = "SMS Unconfigured";
  let phoneDetails = "";

  if (!twilioAccountSid || !twilioAuthToken) {
    twilioSmsStatus = "UNCONFIGURED";
    smsLabel = "SMS Unconfigured (No Twilio Credentials)";
    phoneDetails = "Twilio credentials are not configured in environment variables.";
  } else if (!targetPhone) {
    twilioSmsStatus = "FAILED";
    smsLabel = "SMS Failed (Missing Phone Number)";
    phoneDetails = "Customer phone number is missing.";
  } else if (!isPhoneVerified) {
    twilioSmsStatus = "TRIAL_RESTRICTED";
    smsLabel = "SMS: Twilio Trial Restricted";
    phoneDetails = `Phone number ${targetPhone} has not completed ownership verification. In Twilio Trial mode, non-verified destination numbers are blocked with error 21608.`;
  } else {
    twilioSmsStatus = "READY";
    smsLabel = "SMS Ready";
    phoneDetails = `Phone number ${targetPhone} verified. Ready for SMS dispatch.`;
  }

  // 3. WhatsApp Sandbox Connection Evaluation
  const waRecord = targetPhone ? whatsAppSandboxStore.get(targetPhone) : undefined;
  const isWhatsAppConnected = waRecord?.status === "CONNECTED";

  let whatsAppStatus: "CONNECTED" | "NOT_CONNECTED" | "READY" | "UNCONFIGURED" = "UNCONFIGURED";
  let waDetails = "";

  if (!twilioAccountSid || !twilioAuthToken) {
    whatsAppStatus = "UNCONFIGURED";
    waDetails = "Twilio credentials not configured.";
  } else if (!targetPhone) {
    whatsAppStatus = "NOT_CONNECTED";
    waDetails = "No customer phone provided.";
  } else if (isWhatsAppConnected) {
    whatsAppStatus = "CONNECTED";
    waDetails = `Recipient phone ${targetPhone} is connected to Twilio WhatsApp Sandbox (${twilioWhatsAppFrom}).`;
  } else {
    whatsAppStatus = "NOT_CONNECTED";
    waDetails = `Recipient has not connected to Twilio WhatsApp Sandbox. To connect, send '${twilioJoinKeyword}' to ${twilioWhatsAppFrom}.`;
  }

  const cleanSandboxNumber = twilioWhatsAppFrom.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const waDeepLink = `https://wa.me/${cleanSandboxNumber || "14155238886"}?text=${encodeURIComponent(twilioJoinKeyword)}`;

  const preflightPassed = emailStatus === "READY" || twilioSmsStatus === "READY" || whatsAppStatus === "CONNECTED";
  const preflightSummary = preflightPassed
    ? `Pre-flight checks passed: At least one active delivery channel is available (${[
        emailStatus === "READY" ? "Email" : null,
        twilioSmsStatus === "READY" ? "SMS" : null,
        whatsAppStatus === "CONNECTED" ? "WhatsApp" : null,
      ].filter(Boolean).join(", ")}).`
    : "Pre-flight Notice: Outbound channels have provider limitations (Resend test sender / Twilio trial restriction). Recovery will execute with real provider error telemetry.";

  return {
    recipientEmail: targetEmail,
    recipientPhone: targetPhone,
    recipientName: recipientName || "Customer",
    email: {
      status: emailStatus,
      deliveryLabel: emailDeliveryLabel,
      configuredSender,
      isResendTestingDomain,
      isDeliverableToRecipient,
      details: emailDetails,
      actionLabel: "CONFIGURE EMAIL SENDER",
      actionUrl: "https://resend.com/domains",
    },
    phone: {
      phone_verification_status: isPhoneVerified ? "VERIFIED" : "NOT_VERIFIED",
      twilio_sms_status: twilioSmsStatus,
      ownershipLabel: isPhoneVerified ? "VERIFIED" : "NOT VERIFIED",
      smsLabel,
      details: phoneDetails,
      actionLabel: isPhoneVerified ? "PHONE VERIFIED" : "VERIFY PHONE",
    },
    whatsapp: {
      whatsapp_sandbox_status: whatsAppStatus,
      sandboxNumber: twilioWhatsAppFrom,
      joinKeyword: twilioJoinKeyword,
      deepLink: waDeepLink,
      details: waDetails,
      actionLabel: isWhatsAppConnected ? "WHATSAPP CONNECTED" : "CONNECT WHATSAPP",
    },
    preflightPassed,
    preflightSummary,
    evaluatedAt: now,
  };
}

export async function startPhoneVerification(phoneInput: string): Promise<{
  success: boolean;
  phone: string;
  message: string;
  attemptId: string;
  expiresAt: number;
  mode: "TWILIO_VERIFY" | "SMS_OTP" | "CONSOLE_OTP";
  devCode?: string;
}> {
  const e164 = normalizeToE164(phoneInput);
  if (!e164 || e164.length < 8) {
    throw new Error("Invalid phone number format. Please provide a valid international phone number (e.g. +91 94176 75967 or +1 415 523 8886).");
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  const attemptId = `vfy-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  // Option A: Twilio Verify V2 API (if Verify Service SID is configured)
  if (accountSid && authToken && verifyServiceSid) {
    try {
      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
      const formData = new URLSearchParams();
      formData.append("To", e164);
      formData.append("Channel", "sms");

      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        phoneVerificationStore.set(e164, {
          phone: e164,
          verifiedAt: "",
          status: "NOT_VERIFIED",
          otpExpiresAt: expiresAt,
        });

        return {
          success: true,
          phone: e164,
          message: `Twilio Verify 6-digit code dispatched to ${e164}.`,
          attemptId,
          expiresAt,
          mode: "TWILIO_VERIFY",
        };
      } else {
        console.warn("[Twilio Verify] API Error:", data);
        // Fall back to SMS OTP below if Verify Service SID failed
      }
    } catch (err) {
      console.warn("[Twilio Verify] Exception:", err);
    }
  }

  // Option B: Generate Secure 6-digit OTP and send via Twilio Messages API / Logger
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  phoneVerificationStore.set(e164, {
    phone: e164,
    verifiedAt: "",
    status: "NOT_VERIFIED",
    otpCode,
    otpExpiresAt: expiresAt,
  });

  if (accountSid && authToken) {
    try {
      await sendSmsMessage({
        toPhone: e164,
        customerName: "Operator",
        messageBody: `Your Recoverly verification code is: ${otpCode}. Valid for 10 minutes.`,
        incidentId: attemptId,
      });

      console.info(`[Phone Verification] Sent SMS OTP ${otpCode} to ${e164}`);

      return {
        success: true,
        phone: e164,
        message: `Verification code sent via SMS to ${e164}.`,
        attemptId,
        expiresAt,
        mode: "SMS_OTP",
        devCode: process.env.NODE_ENV !== "production" ? otpCode : undefined,
      };
    } catch (smsErr) {
      console.warn("[Phone Verification] SMS dispatch error:", smsErr);
    }
  }

  // In development / demo environment without Twilio, provide clean devCode
  console.info(`[Phone Verification] Demo Verification OTP for ${e164}: ${otpCode}`);

  return {
    success: true,
    phone: e164,
    message: `Verification challenge generated for ${e164}. Code: ${otpCode}`,
    attemptId,
    expiresAt,
    mode: "CONSOLE_OTP",
    devCode: otpCode,
  };
}

export async function checkPhoneVerification(
  phoneInput: string,
  codeInput: string
): Promise<{
  success: boolean;
  phone: string;
  phone_verification_status: "VERIFIED" | "NOT_VERIFIED";
  twilio_sms_status: "READY" | "TRIAL_RESTRICTED";
  message: string;
}> {
  const e164 = normalizeToE164(phoneInput);
  const code = codeInput?.trim();

  if (!e164 || !code) {
    throw new Error("Phone number and verification code are required.");
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  let verified = false;

  // Check Twilio Verify V2 API if service configured
  if (accountSid && authToken && verifyServiceSid) {
    try {
      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
      const formData = new URLSearchParams();
      formData.append("To", e164);
      formData.append("Code", code);

      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${verifyServiceSid}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "approved") {
        verified = true;
      }
    } catch (err) {
      console.warn("[Twilio Verify Check] Exception:", err);
    }
  }

  // Check OTP store
  const stored = phoneVerificationStore.get(e164);
  if (!verified && stored) {
    if (stored.otpCode && stored.otpCode === code) {
      if (stored.otpExpiresAt && Date.now() <= stored.otpExpiresAt) {
        verified = true;
      } else {
        throw new Error("Verification code has expired. Please request a new code.");
      }
    }
  }

  // Accept master demo override code "123456" for demonstration ease if not verified
  if (!verified && code === "123456") {
    verified = true;
  }

  if (verified) {
    const verifiedAt = new Date().toISOString();
    phoneVerificationStore.set(e164, {
      phone: e164,
      verifiedAt,
      status: "VERIFIED",
    });

    // Update matching persistent incidents in memory
    for (const incident of persistentSandboxIncidents.values()) {
      if (incident.customer_phone && normalizeToE164(incident.customer_phone) === e164) {
        (incident as any).phone_verification_status = "VERIFIED";
        (incident as any).phone_verified_at = verifiedAt;
      }
    }

    // Persist to audit log & Supabase if available
    try {
      const supabase = getSupabaseClient();
      await supabase.from("audit_logs").insert({
        actor_type: "OPERATOR",
        event: "PHONE_NUMBER_VERIFIED",
        details: { phone: e164, verifiedAt },
        created_at: verifiedAt,
      });
    } catch (e) {
      // Non-blocking
    }

    return {
      success: true,
      phone: e164,
      phone_verification_status: "VERIFIED",
      twilio_sms_status: accountSid ? "READY" : "TRIAL_RESTRICTED",
      message: `Phone number ${e164} verified successfully. Ownership confirmed.`,
    };
  }

  throw new Error("Invalid verification code. Please check the code and try again.");
}

export function connectWhatsAppSandbox(phoneInput: string): {
  success: boolean;
  phone: string;
  whatsapp_sandbox_status: "CONNECTED";
  message: string;
} {
  const e164 = normalizeToE164(phoneInput);
  if (!e164) {
    throw new Error("Phone number is required to connect to Twilio WhatsApp Sandbox.");
  }

  const connectedAt = new Date().toISOString();
  whatsAppSandboxStore.set(e164, {
    phone: e164,
    connectedAt,
    status: "CONNECTED",
  });

  // Update matching sandbox incidents
  for (const incident of persistentSandboxIncidents.values()) {
    if (incident.customer_phone && normalizeToE164(incident.customer_phone) === e164) {
      (incident as any).whatsapp_sandbox_status = "CONNECTED";
      (incident as any).whatsapp_connected_at = connectedAt;
    }
  }

  return {
    success: true,
    phone: e164,
    whatsapp_sandbox_status: "CONNECTED",
    message: `WhatsApp Sandbox status recorded as CONNECTED for ${e164}.`,
  };
}

export async function updateContactForIncidentOrTelemetry(
  id: string,
  contact: { name?: string; email?: string; phone?: string; customerType?: string }
): Promise<{ success: boolean; updatedContact: { name: string; email: string; phone: string }; incident?: any; telemetry?: any }> {
  const name = contact.name?.trim();
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();

  // 1. Update in Persistent Sandbox Incidents
  let updatedIncident: any = null;
  const incident = persistentSandboxIncidents.get(id);
  if (incident) {
    if (name) incident.customer_name = name;
    if (email) incident.customer_email = email;
    if (phone) incident.customer_phone = phone;
    if (contact.customerType) incident.customer_type = contact.customerType;
    incident.updated_at = new Date().toISOString();
    updatedIncident = incident;
  }

  // 2. Update in Telemetry Demo Queue (Synthetic Telemetry Record)
  let updatedTelemetry: any = null;
  try {
    const { updateTelemetryOutreachContact } = await import("./telemetryService.js");
    updatedTelemetry = await updateTelemetryOutreachContact(id, {
      name,
      email,
      phone,
    });
  } catch (err) {
    // Non-blocking if telemetry id didn't match
  }

  // 3. Update in Supabase customers table if customer exists
  try {
    const supabase = getSupabaseClient();
    const customerId = incident?.customer_id;
    if (customerId) {
      const updates: any = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (Object.keys(updates).length > 0) {
        await supabase.from("customers").update(updates).eq("id", customerId);
      }
    }
  } catch (e) {
    // Non-blocking
  }

  return {
    success: true,
    updatedContact: {
      name: name || incident?.customer_name || updatedTelemetry?.customerName || "Customer",
      email: email || incident?.customer_email || updatedTelemetry?.customerEmail || "",
      phone: phone || incident?.customer_phone || updatedTelemetry?.customerPhone || "",
    },
    incident: updatedIncident,
    telemetry: updatedTelemetry,
  };
}
