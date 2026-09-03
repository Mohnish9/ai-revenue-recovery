import { useState } from "react";
import { useAuth } from "../lib/authContext";

export function LoginPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("REVENUE_ADMIN");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please provide both email and password.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        if (!name.trim()) {
          setError("Please enter your full name.");
          setSubmitting(false);
          return;
        }
        await signup(email.trim(), password, name.trim(), role);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#081016",
        color: "#f8fafc",
        padding: "24px",
        fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#0d1b24",
          border: "1px solid #1a2c38",
          borderRadius: "12px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: "28px 28px 20px",
            borderBottom: "1px solid #1a2c38",
            background: "#0b1720",
            textAlign: "center",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "#0b1720",
                border: "1.5px solid #d8ee9b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "14px",
                color: "#d8ee9b",
              }}
            >
              R
            </div>
            <span style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.5px", color: "#ffffff" }}>
              Recoverly
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>
            Autonomous AI Revenue Recovery & Involuntary Churn Engine
          </div>
        </div>

        {/* Mode Toggle Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #1a2c38" }}>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            style={{
              padding: "12px",
              background: mode === "login" ? "#0d1b24" : "#081016",
              color: mode === "login" ? "#ffffff" : "#64748b",
              border: "none",
              borderBottom: mode === "login" ? "2px solid #d8ee9b" : "none",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Operator Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            style={{
              padding: "12px",
              background: mode === "signup" ? "#0d1b24" : "#081016",
              color: mode === "signup" ? "#ffffff" : "#64748b",
              border: "none",
              borderBottom: mode === "signup" ? "2px solid #d8ee9b" : "none",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Create Operator Account
          </button>
        </div>

        {/* Form Container */}
        <div style={{ padding: "24px 28px" }}>
          {error && (
            <div
              style={{
                background: "rgba(220, 38, 38, 0.15)",
                border: "1px solid #ef4444",
                color: "#fca5a5",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "11.5px",
                marginBottom: "18px",
                lineHeight: "1.4",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {mode === "signup" && (
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: "5px" }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#081016",
                    border: "1px solid #1e3342",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "12.5px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: "5px" }}>
                Work Email Address
              </label>
              <input
                type="email"
                required
                placeholder="operator@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#081016",
                  border: "1px solid #1e3342",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "12.5px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8" }}>
                  Password
                </label>
                {mode === "login" && (
                  <span style={{ fontSize: "10px", color: "#64748b" }}>Secured by Supabase Auth</span>
                )}
              </div>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#081016",
                  border: "1px solid #1e3342",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "12.5px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {mode === "signup" && (
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: "5px" }}>
                  Operator Role & Access Tier
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#081016",
                    border: "1px solid #1e3342",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="REVENUE_ADMIN">Revenue Administrator (Full Operations & AI)</option>
                  <option value="REVENUE_OPERATOR">Revenue Operations Specialist</option>
                  <option value="RISK_ANALYST">Risk & Dunning Policy Analyst</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: "6px",
                padding: "12px",
                background: "#d8ee9b",
                color: "#0b1720",
                fontWeight: 700,
                fontSize: "12.5px",
                borderRadius: "6px",
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                transition: "opacity 0.2s",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting
                ? "Authenticating with Supabase..."
                : mode === "login"
                ? "Sign In to Operations Console →"
                : "Create Verified Operator Account →"}
            </button>
          </form>
        </div>

        {/* Security Footer */}
        <div
          style={{
            padding: "12px 28px",
            background: "#081016",
            borderTop: "1px solid #1a2c38",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "10.5px",
            color: "#64748b",
          }}
        >
          <span>🔒 Supabase Auth (256-bit AES)</span>
          <span>SOC2 Type II Audit Trails</span>
        </div>
      </div>
    </div>
  );
}
