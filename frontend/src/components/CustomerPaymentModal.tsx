import React, { useState } from "react";
import type { SandboxIncidentResponse } from "../lib/types";
import { customerResolveSandboxIncidentApi } from "../lib/api";

interface CustomerPaymentModalProps {
  incident: SandboxIncidentResponse;
  onClose: () => void;
  onResolved: (updated: SandboxIncidentResponse) => void;
}

export function CustomerPaymentModal({
  incident,
  onClose,
  onResolved,
}: CustomerPaymentModalProps) {
  const [paymentRail, setPaymentRail] = useState<string>("UPI_AUTOPAY");
  const [resolving, setResolving] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    try {
      setResolving(true);
      setError(null);
      const updated = await customerResolveSandboxIncidentApi(incident.incident.id, {
        method: paymentRail,
        notes: "Authorized directly by customer via self-serve link",
      });
      setSuccess(true);
      setTimeout(() => {
        onResolved(updated);
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err?.message || "Payment authorization failed");
      setResolving(false);
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
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "#0f172a",
            color: "#ffffff",
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.5px" }}>
              RECOVERLY • CUSTOMER PAYMENT PORTAL
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 800, margin: "2px 0 0", color: "#f8fafc" }}>
              Resolve Pending Invoice
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {success ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "28px",
                  fontWeight: 800,
                  margin: "0 auto 16px",
                }}
              >
                ✓
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#166534", margin: "0 0 6px" }}>
                Payment Successfully Settled!
              </h3>
              <p style={{ fontSize: "13px", color: "#4b5563", margin: 0 }}>
                {incident.incident.currency} {incident.incident.amount.toLocaleString()} reconciled on the ledger. Autonomous recovery loop completed.
              </p>
            </div>
          ) : (
            <>
              {/* Invoice Summary */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "10px",
                  padding: "16px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Customer:</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a" }}>
                    {incident.customer.name}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Disruption:</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#b91c1c" }}>
                    {incident.incident.scenarioTypeName}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Amount Due:</span>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: "#4f46e5" }}>
                    {incident.incident.currency} {incident.incident.amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Payment Methods */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                  Select Payment Method
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { id: "UPI_AUTOPAY", label: "Instant UPI Intent (PhonePe / GPay / Paytm)", icon: "⚡" },
                    { id: "SAVED_CARD_RETRY", label: "Credit / Debit Card (Visa / Mastercard)", icon: "💳" },
                    { id: "NETBANKING", label: "NetBanking (HDFC / ICICI / SBI)", icon: "🏦" },
                  ].map((method) => (
                    <label
                      key={method.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid",
                        borderColor: paymentRail === method.id ? "#4f46e5" : "#e2e8f0",
                        background: paymentRail === method.id ? "#f5f3ff" : "#ffffff",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentRail"
                        value={method.id}
                        checked={paymentRail === method.id}
                        onChange={() => setPaymentRail(method.id)}
                      />
                      <span>{method.icon}</span>
                      <span>{method.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ background: "#fef2f2", color: "#991b1b", padding: "10px", borderRadius: "6px", fontSize: "12px", marginBottom: "16px" }}>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={resolving}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: "10px" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={resolving}
                  className="btn btn-primary"
                  style={{
                    flex: 2,
                    padding: "10px",
                    fontWeight: 700,
                    boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
                  }}
                >
                  {resolving ? "Authorizing Payment..." : `Authorize & Settle ${incident.incident.currency} ${incident.incident.amount.toLocaleString()}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
