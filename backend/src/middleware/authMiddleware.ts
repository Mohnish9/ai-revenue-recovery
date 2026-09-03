import type { Request, Response, NextFunction } from "express";
import { verifyTokenAndGetUser, type UserProfile } from "../services/authService.js";

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

/**
 * Enforces authentication on protected routes.
 * Rejects requests with HTTP 401 Unauthorized if no valid Bearer token is provided.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token || token.trim().length === 0) {
    return res.status(401).json({ error: "Authentication required. Please sign in to access this resource." });
  }

  try {
    const user = await verifyTokenAndGetUser(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired session token. Please sign in again." });
    }
    req.user = user;
    next();
  } catch (error: any) {
    return res.status(401).json({ error: error?.message || "Invalid or expired session token. Please sign in again." });
  }
}
