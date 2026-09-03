import React, { useState, useEffect } from "react";
import { fetchDemoTestContactApi, updateDemoTestContactApi, type DemoTestContactConfig } from "../lib/api";

interface DemoTestContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: DemoTestContactConfig) => void;
}

export function DemoTestContactModal({
  isOpen,
  onClose,
  onConfigSaved,
}: DemoTestContactModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DemoTestContactConfig>({
    enabled: false,
    testPhone: "",
    testEmail: "",
    autoFormatPhone: true,
    notes: "Verified demo contact for live Exotel Voice & Resend Email test dispatches",
    updatedAt: new Date().toISOString(),
  });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setErrorMsg(null);
      fetchDemoTestContactApi()
        .then((res) => {
          if (res.data) {
            setConfig(res.data);
          }
        })
        .catch((err) => {
          console.warn("Failed to load demo test contact config:", err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await updateDemoTestContactApi({
        enabled: config.enabled,
        testPhone: config.testPhone.trim(),
        testEmail: config.testEmail.trim(),
        autoFormatPhone: config.autoFormatPhone,
        notes: config.notes,
      });

      if (res.success) {
        setConfig(res.data);
        setSuccessMsg("Test contact routing configuration updated successfully.");
        if (onConfigSaved) onConfigSaved(res.data);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save test contact configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "560px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
          animation: "scaleIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "#0f172a",
            color: "#ffffff",
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🧪</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#f8fafc" }}>
                Demo Test Contact Router
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
                Real Exotel & Resend outbound testing for synthetic customer scenarios
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "18px",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Explanation Banner */}
          <div
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "12px",
              color: "#0369a1",
              lineHeight: "1.5",
            }}
          >
            <strong>How this works:</strong> Synthetic customer telemetry and risk decisions remain completely preserved. When enabled, actual outbound dispatches via Exotel (Voice Calls) and Resend (Email) are routed to your verified numbers/emails below so you receive real test calls and emails on your devices.
          </div>

          {loading ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
              Loading test contact configuration...
            </div>
          ) : (
            <>
              {/* Toggle Switch */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: config.enabled ? "#f0fdf4" : "#f8fafc",
                  borderRadius: "10px",
                  border: `1.5px solid ${config.enabled ? "#86efac" : "#e2e8f0"}`,
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: config.enabled ? "#166534" : "#475569" }}>
                    Enable Demo Test Contact Override
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    {config.enabled
                      ? "Active: Real provider dispatches will route to your verified test contact"
                      : "Disabled: Real provider calls will attempt to send to the synthetic customer contact"}
                  </div>
                </div>

                <label style={{ position: "relative", display: "inline-block", width: "48px", height: "26px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: config.enabled ? "#16a34a" : "#cbd5e1",
                      borderRadius: "34px",
                      transition: "0.3s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        height: "20px",
                        width: "20px",
                        left: config.enabled ? "24px" : "3px",
                        bottom: "3px",
                        backgroundColor: "white",
                        borderRadius: "50%",
                        transition: "0.3s",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Form Inputs */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                    Verified Test Phone Number (Exotel Voice Calls)
                  </label>
                  <input
                    type="text"
                    value={config.testPhone}
                    onChange={(e) => setConfig({ ...config, testPhone: e.target.value })}
                    placeholder="+91 94176 75967 or +1..."
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      fontFamily: "monospace",
                    }}
                  />
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                    Destination phone number for real Exotel automated voice recovery phone calls.
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                    Verified Test Email Address (Resend)
                  </label>
                  <input
                    type="email"
                    value={config.testEmail}
                    onChange={(e) => setConfig({ ...config, testEmail: e.target.value })}
                    placeholder="operator@company.com"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                    }}
                  />
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                    Resend free testing tier delivers to your account owner email address.
                  </div>
                </div>
              </div>

              {/* Messages */}
              {successMsg && (
                <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #86efac", color: "#166534", borderRadius: "8px", fontSize: "12px" }}>
                  ✅ {successMsg}
                </div>
              )}
              {errorMsg && (
                <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: "8px", fontSize: "12px" }}>
                  ⚠️ {errorMsg}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ fontSize: "12px", padding: "8px 16px" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn btn-primary"
            style={{
              fontSize: "12px",
              fontWeight: 700,
              padding: "8px 18px",
              background: "#4f46e5",
              borderColor: "#4338ca",
            }}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
