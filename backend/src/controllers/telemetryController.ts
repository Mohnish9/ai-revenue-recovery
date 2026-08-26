import type { Request, Response } from "express";
import {
  getTelemetryDemoQueue,
  getTelemetryRecordById,
  createCustomTelemetry,
  analyzeTelemetryWithAI,
  resetTelemetryDemoQueue,
  updateTelemetryOutreachContact,
} from "../services/telemetryService.js";
import { getDetailedChannelReadiness } from "../services/providerService.js";

export async function getTelemetryQueueController(_req: Request, res: Response): Promise<void> {
  try {
    const result = await getTelemetryDemoQueue();
    res.json({
      success: true,
      data: result.queue,
      summary: result.summary,
    });
  } catch (error: any) {
    console.error("[TelemetryController] getTelemetryQueue error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch telemetry demo queue" });
  }
}

export async function getTelemetryRecordController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const record = await getTelemetryRecordById(id);
    if (!record) {
      res.status(404).json({ error: `Telemetry record ${id} not found` });
      return;
    }
    res.json({ success: true, data: record });
  } catch (error: any) {
    console.error("[TelemetryController] getTelemetryRecord error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch telemetry record" });
  }
}

export async function createCustomTelemetryController(req: Request, res: Response): Promise<void> {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      customerType,
      amount,
      currency,
      paymentMethod,
      paymentRail,
      events,
      sessionContext,
      historicalContext,
      notes,
    } = req.body;

    if (!customerName || amount === undefined || !paymentMethod) {
      res.status(400).json({
        error: "Missing required fields: customerName, amount, and paymentMethod are required.",
      });
      return;
    }

    const record = await createCustomTelemetry({
      customerName,
      customerEmail,
      customerPhone,
      customerType,
      amount: Number(amount),
      currency: currency || "INR",
      paymentMethod,
      paymentRail: paymentRail || "Standard Gateway",
      events: events || [],
      sessionContext: sessionContext || {},
      historicalContext: historicalContext || {},
      notes,
    });

    res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    console.error("[TelemetryController] createCustomTelemetry error:", error);
    res.status(500).json({ error: error.message || "Failed to create custom telemetry" });
  }
}

export async function analyzeTelemetryController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const result = await analyzeTelemetryWithAI(id);
    res.json({
      success: true,
      message: `Gemini AI successfully diagnosed telemetry ${id} as ${result.analysis.detectedScenarioType}`,
      data: result,
    });
  } catch (error: any) {
    console.error("[TelemetryController] analyzeTelemetry error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze telemetry with AI" });
  }
}

export async function resetTelemetryQueueController(_req: Request, res: Response): Promise<void> {
  try {
    await resetTelemetryDemoQueue();
    res.json({ success: true, message: "Telemetry demo queue reset to initial WAITING state." });
  } catch (error: any) {
    console.error("[TelemetryController] resetTelemetryQueue error:", error);
    res.status(500).json({ error: error.message || "Failed to reset telemetry queue" });
  }
}

export async function updateTelemetryContactController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { email, phone } = req.body;
    const updated = await updateTelemetryOutreachContact(id, { email, phone });
    res.json({
      success: true,
      message: `Outreach contact destination updated for telemetry ${id}`,
      data: updated,
    });
  } catch (error: any) {
    console.error("[TelemetryController] updateTelemetryContact error:", error);
    res.status(400).json({ error: error.message || "Failed to update telemetry outreach contact" });
  }
}

export async function getChannelReadinessController(req: Request, res: Response): Promise<void> {
  try {
    const email = (req.query.email as string) || (req.body?.email as string);
    const phone = (req.query.phone as string) || (req.body?.phone as string);
    const name = (req.query.name as string) || (req.body?.name as string);

    const detailed = getDetailedChannelReadiness(email, phone, name);

    // Provide dual compatibility: detailed + legacy nested structure
    res.json({
      success: true,
      data: {
        ...detailed,
        resend: {
          configured: detailed.email.status !== "UNCONFIGURED",
          apiKeyPresent: Boolean(process.env.RESEND_API_KEY),
          fromEmail: detailed.email.configuredSender,
          status: detailed.email.status,
          deliveryLabel: detailed.email.deliveryLabel,
          details: detailed.email.details,
          isResendTestingDomain: detailed.email.isResendTestingDomain,
          isDeliverableToRecipient: detailed.email.isDeliverableToRecipient,
        },
        twilioSms: {
          configured: detailed.phone.twilio_sms_status !== "UNCONFIGURED",
          accountSidPresent: Boolean(process.env.TWILIO_ACCOUNT_SID),
          fromNumber: process.env.TWILIO_PHONE_NUMBER || "+14155238886",
          mode: "TRIAL",
          status: detailed.phone.twilio_sms_status,
          phone_verification_status: detailed.phone.phone_verification_status,
          deliveryLabel: detailed.phone.smsLabel,
          details: detailed.phone.details,
          errorCodeDoc: "Code 21608: The number is unverified. Trial accounts cannot send messages to unverified numbers.",
          actionLabel: detailed.phone.actionLabel,
        },
        twilioWhatsApp: {
          configured: detailed.whatsapp.whatsapp_sandbox_status !== "UNCONFIGURED",
          accountSidPresent: Boolean(process.env.TWILIO_ACCOUNT_SID),
          fromNumber: detailed.whatsapp.sandboxNumber,
          sandboxNumber: detailed.whatsapp.sandboxNumber,
          status: detailed.whatsapp.whatsapp_sandbox_status,
          whatsapp_sandbox_status: detailed.whatsapp.whatsapp_sandbox_status,
          deliveryLabel: detailed.whatsapp.details,
          details: detailed.whatsapp.details,
          joinKeyword: detailed.whatsapp.joinKeyword,
          deepLink: detailed.whatsapp.deepLink,
          actionLabel: detailed.whatsapp.actionLabel,
        },
        defaultTestContact: {
          email: email || detailed.recipientEmail || "customer@example.test",
          phone: phone || detailed.recipientPhone || "+14155238886",
          hasCustomContact: Boolean(email || phone),
        },
      },
    });
  } catch (error: any) {
    console.error("[TelemetryController] getChannelReadiness error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch channel readiness" });
  }
}

