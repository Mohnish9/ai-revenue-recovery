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

    // Provide clean structure matching detailed readiness (Email & Voice)
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
        exotel: {
          configured: detailed.voice.status !== "UNCONFIGURED",
          sidPresent: Boolean(process.env.EXOTEL_SID),
          exoPhone: detailed.voice.exoPhone,
          status: detailed.voice.status,
          deliveryLabel: detailed.voice.deliveryLabel,
          details: detailed.voice.details,
          actionLabel: detailed.voice.actionLabel,
        },
        defaultTestContact: {
          email: email || detailed.recipientEmail || "customer@example.test",
          phone: phone || detailed.recipientPhone || "+919417675967",
          hasCustomContact: Boolean(email || phone),
        },
      },
    });
  } catch (error: any) {
    console.error("[TelemetryController] getChannelReadiness error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch channel readiness" });
  }
}

