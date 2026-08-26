import type { Request, Response } from "express";
import { getDashboardSummary, getDebugRecoverySummary } from "../services/supabaseService.js";

export async function getDashboard(_request: Request, response: Response) {
  try {
    response.json(await getDashboardSummary());
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : "Unable to load dashboard data",
    });
  }
}

export async function getDebugSummaryController(_request: Request, response: Response) {
  try {
    response.json(await getDebugRecoverySummary());
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unable to compute debug recovery summary",
    });
  }
}
