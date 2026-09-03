import type { Request, Response } from "express";
import { getDashboardSummary, getDebugRecoverySummary } from "../services/supabaseService.js";

export async function getDashboard(request: Request, response: Response) {
  try {
    const user = (request as any).user;
    response.json(await getDashboardSummary(user));
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : "Unable to load dashboard data",
    });
  }
}

export async function getDebugSummaryController(request: Request, response: Response) {
  try {
    const user = (request as any).user;
    response.json(await getDebugRecoverySummary(user));
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unable to compute debug recovery summary",
    });
  }
}
