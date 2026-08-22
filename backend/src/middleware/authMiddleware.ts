import type { Request, Response, NextFunction } from "express";
import { verifyTokenAndGetUser, type UserProfile } from "../services/authService.js";

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required. Missing Bearer token." });
  }

  try {
    const user = await verifyTokenAndGetUser(token);
    req.user = user;
    next();
  } catch (error: any) {
    return res.status(401).json({ error: error.message || "Invalid or expired session token." });
  }
}
