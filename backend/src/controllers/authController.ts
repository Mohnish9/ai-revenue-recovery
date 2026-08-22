import type { Request, Response } from "express";
import { loginWithEmail, signupWithEmail, verifyTokenAndGetUser, signOutSession } from "../services/authService.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await loginWithEmail(String(email).trim().toLowerCase(), String(password));
    return res.json(result);
  } catch (error: any) {
    return res.status(401).json({ error: error.message || "Invalid credentials" });
  }
}

export async function signupController(req: Request, res: Response) {
  const { email, password, name, role } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const result = await signupWithEmail(
      String(email).trim().toLowerCase(),
      String(password),
      name ? String(name).trim() : "Operator",
      role ? String(role).trim() : "REVENUE_OPERATOR"
    );
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to create operator account" });
  }
}

export async function meController(req: AuthenticatedRequest, res: Response) {
  if (req.user) {
    return res.json({ user: req.user });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const user = await verifyTokenAndGetUser(token);
    return res.json({ user });
  } catch (error: any) {
    return res.status(401).json({ error: error.message || "Session invalid" });
  }
}

export async function logoutController(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

  if (token) {
    try {
      await signOutSession(token);
    } catch (e: any) {
      console.warn("Logout error:", e);
    }
  }

  return res.json({ success: true, message: "Logged out successfully" });
}
