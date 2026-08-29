import { Request, Response } from "express";
import {
  getDetailedChannelReadiness,
  startPhoneVerification,
  checkPhoneVerification,
  connectWhatsAppSandbox,
  updateContactForIncidentOrTelemetry,
} from "../services/providerService.js";
import {
  getDemoTestContactConfig,
  updateDemoTestContactConfig,
} from "../services/demoTestContactService.js";

export async function getDemoTestContactController(_req: Request, res: Response) {
  try {
    const config = getDemoTestContactConfig();
    return res.json({ success: true, data: config });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateDemoTestContactController(req: Request, res: Response) {
  try {
    const updates = req.body;
    const config = updateDemoTestContactConfig(updates);
    return res.json({
      success: true,
      message: "Demo test contact configuration updated successfully.",
      data: config,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

export async function getDetailedChannelReadinessController(req: Request, res: Response) {
  try {
    const email = (req.query.email as string) || (req.body?.email as string);
    const phone = (req.query.phone as string) || (req.body?.phone as string);
    const name = (req.query.name as string) || (req.body?.name as string);

    const readiness = getDetailedChannelReadiness(email, phone, name);
    return res.json({
      success: true,
      data: readiness,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to determine channel readiness",
    });
  }
}

export async function startPhoneVerificationController(req: Request, res: Response) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: "Phone number is required to start verification.",
      });
    }

    const result = await startPhoneVerification(phone);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to start phone verification",
    });
  }
}

export async function checkPhoneVerificationController(req: Request, res: Response) {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        error: "Phone number and verification code are required.",
      });
    }

    const result = await checkPhoneVerification(phone, code);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || "Verification code check failed",
    });
  }
}

export async function connectWhatsAppSandboxController(req: Request, res: Response) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: "Phone number is required.",
      });
    }

    const result = connectWhatsAppSandbox(phone);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to connect WhatsApp sandbox",
    });
  }
}

export async function updateContactController(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const { name, customerName, email, customerEmail, phone, customerPhone, customerType } = req.body;

    const contact = {
      name: name || customerName,
      email: email || customerEmail,
      phone: phone || customerPhone,
      customerType,
    };

    const result = await updateContactForIncidentOrTelemetry(id, contact);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to update contact details",
    });
  }
}
