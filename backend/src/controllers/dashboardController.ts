import type { Request, Response } from "express";
import { getDashboardSummary } from "../services/supabaseService.js";

export async function getDashboard(_request: Request, response: Response) {
  try {
    response.json(await getDashboardSummary());
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : "Unable to load dashboard data",
    });
  }
}