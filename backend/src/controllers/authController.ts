import type { Request, Response } from "express";
import { loginWithEmail, signupWithEmail, verifyTokenAndGetUser, signOutSession } from "../services/authService.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const result = await loginWithEmail(normalizedEmail, String(password));
    console.log(`[Auth] Operator logged in successfully: ${normalizedEmail}`);
    return res.json(result);
  } catch (error: any) {
    console.warn(`[Auth Failure] Failed login attempt for: ${normalizedEmail} - ${error.message || "Invalid credentials"}`);
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

  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const result = await signupWithEmail(
      normalizedEmail,
      String(password),
      name ? String(name).trim() : "Operator",
      role ? String(role).trim() : "REVENUE_OPERATOR"
    );
    console.log(`[Auth] Operator account created: ${normalizedEmail}`);
    return res.status(201).json(result);
  } catch (error: any) {
    console.warn(`[Auth Error] Failed signup for ${normalizedEmail}:`, error.message || error);
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
    console.warn(`[Auth Error] Session token verification failed:`, error.message || error);
    return res.status(401).json({ error: error.message || "Session invalid" });
  }
}

export async function logoutController(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

  if (token) {
    try {
      await signOutSession(token);
      console.log(`[Auth] Operator session logged out`);
    } catch (e: any) {
      console.warn("[Auth Warning] Logout error:", e?.message || e);
    }
  }

  return res.json({ success: true, message: "Logged out successfully" });
}
