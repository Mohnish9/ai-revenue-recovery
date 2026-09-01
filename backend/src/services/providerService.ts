import { normalizeToE164 } from "./messagingService.js";
import { persistentSandboxIncidents } from "./autonomousRecoveryEngine.js";
import { getSupabaseClient } from "./supabaseService.js";
import { getDemoTestContactConfig } from "./demoTestContactService.js";

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
  voice: {
    status: "READY" | "FAILED" | "UNCONFIGURED";
    deliveryLabel: string;
    exoPhone: string;
    details: string;
    actionLabel: string;
    actionUrl: string;
  };
  preflightPassed: boolean;
  preflightSummary: string;
  evaluatedAt: string;
  resend?: {
    configured: boolean;
    apiKeyPresent: boolean;
    fromEmail: string;
    status: string;
    deliveryLabel: string;
    details: string;
    isResendTestingDomain?: boolean;
    isDeliverableToRecipient?: boolean;
  };
  exotel?: {
    configured: boolean;
    sidPresent: boolean;
    exoPhone: string;
    status: string;
    deliveryLabel: string;
    details: string;
    actionLabel: string;
  };
  defaultTestContact?: {
    email: string;
    phone: string;
    hasCustomContact: boolean;
  };
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

  const exotelApiKey = process.env.EXOTEL_API_KEY?.trim();
  const exotelApiToken = process.env.EXOTEL_API_TOKEN?.trim();
  const exotelSid = process.env.EXOTEL_SID?.trim();
  const exotelExoPhone = process.env.EXOTEL_EXOPHONE?.trim() || "";

  const demoContact = getDemoTestContactConfig();
  const shouldUseTestContact = demoContact.enabled;

  const targetEmail = (shouldUseTestContact && demoContact.verifiedEmail ? demoContact.verifiedEmail : recipientEmail)?.trim() || "";
  const rawPhone = (shouldUseTestContact && demoContact.verifiedPhone ? demoContact.verifiedPhone : recipientPhone)?.trim() || "";
  const targetPhone = rawPhone ? normalizeToE164(rawPhone) : "";

  const verifiedEmail = (process.env.RESEND_TEST_EMAIL || process.env.DEMO_TEST_EMAIL || "").trim().toLowerCase();
  const verifiedPhone = (process.env.EXOTEL_VERIFIED_TO || process.env.EXOTEL_TEST_PHONE || process.env.DEMO_TEST_PHONE || "").trim();

  // 1. Email Readiness Evaluation (Resend)
  let emailStatus: "READY" | "RESTRICTED" | "FAILED" | "UNCONFIGURED" = "UNCONFIGURED";
  let emailDeliveryLabel = "Email Unconfigured";
  let emailDetails = "RESEND_API_KEY environment variable is not configured.";
  let isDeliverableToRecipient = false;

  if (!resendApiKey) {
    emailStatus = "UNCONFIGURED";
    emailDeliveryLabel = "Email Unconfigured (No RESEND_API_KEY)";
    emailDetails = "Resend API key is missing. Configure RESEND_API_KEY in environment variables.";
  } else if (!targetEmail) {
    emailStatus = "FAILED";
    emailDeliveryLabel = "Email Missing";
    emailDetails = "Recipient email address was not provided on this contact.";
  } else {
    const isMatchedTestEmail = Boolean(verifiedEmail && targetEmail.toLowerCase() === verifiedEmail);

    if (isMatchedTestEmail) {
      emailStatus = "READY";
      emailDeliveryLabel = `Email Ready (Verified Destination: ${targetEmail})`;
      emailDetails = `Recipient matches configured verified test address (${targetEmail}). Outbound Resend dispatch will proceed.`;
      isDeliverableToRecipient = true;
    } else {
      emailStatus = "RESTRICTED";
      emailDeliveryLabel = "Email Destination Not Verified (EMAIL_DESTINATION_NOT_VERIFIED)";
      emailDetails = `Customer email (${targetEmail}) does not match verified allowlist (RESEND_TEST_EMAIL: "${verifiedEmail || "NOT_CONFIGURED"}"). Email dispatch will fail with EMAIL_DESTINATION_NOT_VERIFIED.`;
      isDeliverableToRecipient = false;
    }
  }

  // 2. Voice Readiness Evaluation (Exotel)
  let voiceStatus: "READY" | "FAILED" | "UNCONFIGURED" = "UNCONFIGURED";
  let voiceDeliveryLabel = "Voice Unconfigured";
  let voiceDetails = "";

  const hasExotelCreds = Boolean(exotelApiKey && exotelApiToken && exotelSid && exotelExoPhone);

  if (!hasExotelCreds) {
    const missing: string[] = [];
    if (!exotelApiKey) missing.push("EXOTEL_API_KEY");
    if (!exotelApiToken) missing.push("EXOTEL_API_TOKEN");
    if (!exotelSid) missing.push("EXOTEL_SID");
    if (!exotelExoPhone) missing.push("EXOTEL_EXOPHONE");

    voiceStatus = "UNCONFIGURED";
    voiceDeliveryLabel = `Voice Unconfigured (${missing.join(", ")} missing)`;
    voiceDetails = `Exotel credentials are not configured in environment variables (${missing.join(", ")}).`;
  } else if (!targetPhone) {
    voiceStatus = "FAILED";
    voiceDeliveryLabel = "Voice Call Failed (Missing Phone Number)";
    voiceDetails = "Customer destination phone number is missing.";
  } else {
    const isMatchedPhone = Boolean(verifiedPhone && normalizeToE164(targetPhone) === normalizeToE164(verifiedPhone));
    if (isMatchedPhone) {
      voiceStatus = "READY";
      voiceDeliveryLabel = `Voice Ready (Verified Destination: ${targetPhone})`;
      voiceDetails = `Customer phone matches verified test allowlist (EXOTEL_VERIFIED_TO: ${verifiedPhone}). Outbound calls enabled.`;
    } else {
      voiceStatus = "FAILED";
      voiceDeliveryLabel = "Voice Destination Not Verified (VOICE_DESTINATION_NOT_VERIFIED)";
      voiceDetails = `Customer phone (${targetPhone}) does not match verified allowlist (EXOTEL_VERIFIED_TO: "${verifiedPhone || "NOT_CONFIGURED"}"). Voice dispatch will fail with VOICE_DESTINATION_NOT_VERIFIED.`;
    }
  }

  const preflightPassed = emailStatus === "READY" || voiceStatus === "READY";
  const preflightSummary = preflightPassed
    ? `Pre-flight checks passed: Active delivery channels available (${[
        emailStatus === "READY" ? "Email (Resend)" : null,
        voiceStatus === "READY" ? "Voice (Exotel)" : null,
      ].filter(Boolean).join(", ")}).`
    : "Pre-flight Notice: Outbound channels have provider limitations. Recovery will execute with real provider error telemetry.";

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
    voice: {
      status: voiceStatus,
      deliveryLabel: voiceDeliveryLabel,
      exoPhone: exotelExoPhone,
      details: voiceDetails,
      actionLabel: hasExotelCreds ? (targetPhone ? "VOICE READY" : "ADD PHONE") : "CONFIGURE EXOTEL",
      actionUrl: "https://my.exotel.com",
    },
    preflightPassed,
    preflightSummary,
    evaluatedAt: now,
    resend: {
      configured: Boolean(resendApiKey),
      apiKeyPresent: Boolean(resendApiKey),
      fromEmail: configuredSender,
      status: emailStatus,
      deliveryLabel: emailDeliveryLabel,
      details: emailDetails,
      isResendTestingDomain,
      isDeliverableToRecipient,
    },
    exotel: {
      configured: hasExotelCreds,
      sidPresent: Boolean(exotelSid),
      exoPhone: exotelExoPhone,
      status: voiceStatus,
      deliveryLabel: voiceDeliveryLabel,
      details: voiceDetails,
      actionLabel: hasExotelCreds ? "VOICE CONFIGURED" : "CONFIGURE EXOTEL",
    },
    defaultTestContact: {
      email: demoContact.verifiedEmail || "customer@example.test",
      phone: demoContact.verifiedPhone || "+919417675967",
      hasCustomContact: demoContact.enabled,
    },
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

