import { Request, Response } from "express";
import {
  findIncidentForVoiceRecovery,
  getOrGenerateVoiceRecoveryMessage,
  dispatchExotelVoiceCall,
  processExotelStatusCallback,
} from "../services/voiceRecoveryService.js";

/**
 * Public dynamic voice recovery script endpoint for Exotel Voice flow.
 * Generates an AI-personalized voice script via Gemini (grounded in incident data).
 * Supports both GET and HEAD requests.
 * Returns strictly plain text (Content-Type: text/plain; charset=utf-8).
 */
export async function getVoiceRecoveryMessageController(req: Request, res: Response): Promise<void> {
  const query = req.query as Record<string, string | undefined>;
  const rawCustomField =
    query.CustomField ||
    query.customfield ||
    query.customField ||
    query.incidentId ||
    query.incident_id ||
    query.id;

  if (!rawCustomField || typeof rawCustomField !== "string" || !rawCustomField.trim()) {
    res
      .status(404)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", "no-store, no-cache, must-revalidate")
      .send("Incident not found: Missing required CustomField query parameter.");
    return;
  }

  const cleanCustomField = rawCustomField.trim();
  const { incident, script } = await getOrGenerateVoiceRecoveryMessage(cleanCustomField);

  if (!incident || !script) {
    res
      .status(404)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", "no-store, no-cache, must-revalidate")
      .send(`Incident not found for provided CustomField: ${cleanCustomField}`);
    return;
  }

  const textBuffer = Buffer.from(script, "utf8");

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Content-Length", textBuffer.length.toString());
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  res.status(200).send(script);
}

/**
 * Initiate an outbound Exotel voice call for an incident.
 * Endpoint: POST /api/voice/recovery-call (and POST /api/voice/dispatch-call)
 */
export async function dispatchVoiceCallController(req: Request, res: Response): Promise<void> {
  try {
    const incidentId = (req.body?.incidentId || req.body?.id || req.params?.id || "").trim();
    const targetPhoneOverride = req.body?.targetPhoneOverride;

    if (!incidentId) {
      res.status(400).json({ error: "Missing required 'incidentId' in request body." });
      return;
    }

    const result = await dispatchExotelVoiceCall(incidentId, { targetPhoneOverride });
    if (!result.success && result.providerErrorCode === "INCIDENT_NOT_FOUND") {
      res.status(404).json(result);
      return;
    }

    res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    console.error("[Voice Controller] Error dispatching voice call:", err);
    res.status(500).json({ error: err?.message || "Internal server error dispatching voice call" });
  }
}

/**
 * Public Webhook for Exotel Status Callbacks (terminal events, call status).
 */
export async function exotelCallbackController(req: Request, res: Response): Promise<void> {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const callSid = payload.CallSid || payload.call_sid || payload.Sid || payload.sid;
    const customField = payload.CustomField || payload.custom_field || payload.customField;
    const status = payload.Status || payload.status || payload.CallStatus || payload.call_status;
    const recordingUrl = payload.RecordingUrl || payload.recording_url;
    const duration = payload.Duration || payload.duration || payload.CallDuration;
    const dialCallDuration = payload.DialCallDuration || payload.dial_call_duration;

    await processExotelStatusCallback({
      callSid: typeof callSid === "string" ? callSid : undefined,
      customField: typeof customField === "string" ? customField : undefined,
      status: typeof status === "string" ? status : undefined,
      recordingUrl: typeof recordingUrl === "string" ? recordingUrl : undefined,
      duration: typeof duration === "string" || typeof duration === "number" ? duration : undefined,
      dialCallDuration: typeof dialCallDuration === "string" || typeof dialCallDuration === "number" ? dialCallDuration : undefined,
      details: payload,
    });

    res.status(200).type("text/plain").send("OK");
  } catch (err: any) {
    console.warn("[Voice Controller] Exotel status callback error:", err);
    res.status(200).type("text/plain").send("OK");
  }
}
