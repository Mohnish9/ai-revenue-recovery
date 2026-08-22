import type { Request, Response } from "express";
import { getHealthStatus } from "../services/healthService.js";
import { getDatabaseStatus } from "../services/supabaseService.js";

export async function getHealth(_request: Request, response: Response) {
  const database = await getDatabaseStatus();
  response.status(database.connected ? 200 : 503).json({
    ...getHealthStatus(),
    database,
  });
}