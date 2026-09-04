import { GoogleGenAI } from "@google/genai";

// Supported active Gemini models from official @google/genai guidelines
export const GEMINI_TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
] as const;

let genAIInstance: GoogleGenAI | null = null;
let lastUsedApiKey = "";

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  if (!apiKey || apiKey === "undefined" || apiKey === "null") {
    return null;
  }

  if (!genAIInstance || lastUsedApiKey !== apiKey) {
    try {
      genAIInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      lastUsedApiKey = apiKey;
    } catch (err: any) {
      console.warn("[GeminiService] Failed to initialize GoogleGenAI client:", err);
      return null;
    }
  }

  return genAIInstance;
}

export function cleanAndParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export interface GenerateOptions {
  contents: string;
  systemInstruction?: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  models?: readonly string[];
  maxRetriesPerModel?: number;
}

export async function generateContentResilient(
  options: GenerateOptions
): Promise<{ text: string; modelUsed: string; json?: any } | null> {
  const ai = getGeminiClient();
  if (!ai) {
    return null;
  }

  const modelsToTry = options.models || GEMINI_TEXT_MODELS;
  const maxRetries = options.maxRetriesPerModel ?? 2;
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const config: any = {};
        if (options.systemInstruction) {
          config.systemInstruction = options.systemInstruction;
        }
        if (options.responseMimeType) {
          config.responseMimeType = options.responseMimeType;
        }
        if (options.temperature !== undefined) {
          config.temperature = options.temperature;
        }

        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        const text = response.text?.trim() || "";
        if (text) {
          let json: any = undefined;
          if (options.responseMimeType === "application/json") {
            json = cleanAndParseJson(text);
          }
          return { text, modelUsed: model, json };
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || "");
        const status = err?.status || err?.code || "";
        const isTransient =
          msg.includes("503") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("high demand") ||
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("500") ||
          msg.includes("INTERNAL") ||
          status === "UNAVAILABLE" ||
          status === 503 ||
          status === 429;

        if (isTransient && attempt < maxRetries - 1) {
          const delay = 200 * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If not transient or retries exhausted for this model, move to next model in sequence
        break;
      }
    }
  }

  // If all models in the fallback chain were exhausted, log concise info and return null
  console.info(
    `[GeminiService] AI generation transitioned to heuristic rules (transient provider load: ${
      lastError?.message?.slice(0, 100) || "Unavailable"
    })`
  );
  return null;
}
