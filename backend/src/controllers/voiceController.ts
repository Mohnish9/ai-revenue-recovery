import { Request, Response } from "express";
import {
  findIncidentForVoiceRecovery,
  getOrGenerateVoiceRecoveryMessage,
  dispatchExotelVoiceCall,
  processExotelStatusCallback,
} from "../services/voiceRecoveryService.js";

/**
 * Public dynamic voice recovery script endpoint for Exotel Voice flow.
 * Generates or retrieves an AI-personalized voice script via Gemini (grounded in incident data).
 * Supports both GET and HEAD requests.
 * Returns strictly plain text (Content-Type: text/plain; charset=utf-8) with HTTP 200 OK.
 */
export async function getVoiceRecoveryMessageController(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const query = (req.query || {}) as Record<string, string | undefined>;
  const rawCustomField =
    query.CustomField ||
    query.customfield ||
    query.customField ||
    query.incidentId ||
    query.incident_id ||
    query.id ||
    (typeof req.body?.CustomField === "string" ? req.body.CustomField : undefined);

  const callSid = query.CallSid || query.call_sid || query.Sid || query.sid || "N/A";
  const callerFrom = query.From || query.from || "N/A";
  const callerTo = query.To || query.to || "N/A";

  console.info(`[Voice Controller] 📞 Incoming Exotel Passthru Request [${req.method}]`);
  console.info(`[Voice Controller] ├─ Call SID: ${callSid}`);
  console.info(`[Voice Controller] ├─ From: ${callerFrom} -> To: ${callerTo}`);
  console.info(`[Voice Controller] └─ CustomField: "${rawCustomField || "UNSPECIFIED"}"`);

  if (req.method === "HEAD") {
    console.info(`[Voice Controller] ⚡ Handled Exotel HEAD validation probe in ${Date.now() - startTime}ms -> HTTP 200 OK`);
    res.status(200).set("Content-Type", "text/plain; charset=utf-8").end();
    return;
  }

  const cleanCustomField = (rawCustomField || "").trim();
  const { incident, script, source } = await getOrGenerateVoiceRecoveryMessage(cleanCustomField);
  const elapsedMs = Date.now() - startTime;
  const voiceLang = (process.env.EXOTEL_VOICE_LANGUAGE || "hi-IN").trim();

  // Check if ExoML XML format was requested by Exotel
  const isXml =
    query.format === "xml" ||
    query.format === "exoml" ||
    req.headers.accept?.includes("application/xml") ||
    req.headers.accept?.includes("text/xml");

  if (isXml) {
    const escaped = script
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
    const exoml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Say voice="female" language="${voiceLang}">${escaped}</Say>\n</Response>`;
    const xmlBuffer = Buffer.from(exoml, "utf8");

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Content-Length", xmlBuffer.length.toString());
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("X-Exotel-Voice-Language", voiceLang);
    res.set("X-Exotel-Voice-Script-Language", "Hinglish");

    console.info(`[Voice Controller] ✅ Delivering ExoML Hinglish Voice Script to Exotel in ${elapsedMs}ms`);
    console.info(`[Voice Controller] ├─ Incident: ${incident?.id || "None"} (${incident?.customerName || "Customer"})`);
    console.info(`[Voice Controller] ├─ Language: ${voiceLang} (Hinglish)`);
    console.info(`[Voice Controller] └─ Spoken Text: "${script}"`);

    res.status(200).send(exoml);
    return;
  }

  const textBuffer = Buffer.from(script, "utf8");

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Content-Length", textBuffer.length.toString());
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("X-Exotel-Voice-Language", voiceLang);
  res.set("X-Exotel-Voice-Script-Language", "Hinglish");

  console.info(`[Voice Controller] ✅ Delivering Hinglish Voice Script to Exotel in ${elapsedMs}ms`);
  console.info(`[Voice Controller] ├─ Incident: ${incident?.id || "None"} (${incident?.customerName || "Customer"})`);
  console.info(`[Voice Controller] ├─ Source: ${source}`);
  console.info(`[Voice Controller] ├─ Voice Language: ${voiceLang}`);
  console.info(`[Voice Controller] ├─ Script Length: ${script.length} characters`);
  console.info(`[Voice Controller] ├─ Spoken Text: "${script}"`);
  console.info(`[Voice Controller] └─ Response Status: HTTP 200 OK`);

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
