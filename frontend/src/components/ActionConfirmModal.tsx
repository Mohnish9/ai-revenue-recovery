import { useState } from "react";

export interface ActionModalConfig {
  actionType: string;
  actionTitle: string;
  targetLabel: string;
  amountAtRisk?: number | string;
  currency?: string;
  description: string;
  defaultReason?: string;
  impactWarning?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function ActionConfirmModal({
  actionType,
  actionTitle,
  targetLabel,
  amountAtRisk,
  currency = "INR",
  description,
  defaultReason = "Manual operator intervention from recovery queue",
  impactWarning = "Executing this action will mutate records in Supabase PostgreSQL, append an immutable audit log, and initiate the corresponding recovery workflow.",
  onConfirm,
  onClose,
}: ActionModalConfig) {
  const [reason, setReason] = useState(defaultReason);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setExecuting(true);
      setError(null);
      await onConfirm(reason);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to execute database action");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px", border: "1px solid #cbd5e1" }}>
        <div className="modal-header" style={{ background: "#0b1720", color: "#ffffff", padding: "14px 20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#f59e0b", fontSize: "14px" }}>⚡</span>
              <h2 style={{ color: "#ffffff", margin: 0, fontSize: "14px", fontWeight: 700 }}>
                Live Database Action Confirmation
              </h2>
            </div>
            <span style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginTop: "2px" }}>
              Supabase Production Environment & Immutable Audit Ledger
            </span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ color: "#ffffff" }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Action Overview Card */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Action Requested</span>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>{actionTitle}</div>
              </div>
              <span className="status-pill warning" style={{ fontFamily: "DM Mono", fontSize: "10px" }}>
                {actionType}
              </span>
            </div>

            <div style={{ fontSize: "11.5px", color: "#475569", lineHeight: "1.4" }}>
              {description}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: amountAtRisk ? "1fr 1fr" : "1fr", gap: "10px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #edf1f4" }}>
              <div>
                <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Target Target / Subject:</span>
                <strong style={{ fontSize: "12px", color: "#1e293b" }}>{targetLabel}</strong>
              </div>
              {amountAtRisk !== undefined && (
                <div>
                  <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>Revenue at Risk:</span>
                  <strong style={{ fontSize: "12px", color: "#b91c1c" }}>
                    {currency} {Number(amountAtRisk).toLocaleString()}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "6px" }}>
              Operator Justification & Reason (Recorded to Audit Trail)
            </label>
            <input
              type="text"
              className="search-input"
              style={{ width: "100%", fontSize: "12px" }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for executing this action..."
            />
          </div>

          {/* Security & Consequence Notice */}
          <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "10px 12px", borderRadius: "6px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span style={{ color: "#d97706", fontSize: "13px" }}>⚠</span>
            <div style={{ fontSize: "11px", color: "#92400e", lineHeight: "1.4" }}>
              <strong>Production Impact: </strong>
              {impactWarning}
            </div>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px", borderRadius: "6px", color: "#991b1b", fontSize: "11.5px" }}>
              ✕ Error: {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: "12px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
          <button className="outline-button" onClick={onClose} disabled={executing}>
            Cancel
          </button>
          <button
            className="primary-button"
            onClick={handleConfirm}
            disabled={executing}
            style={{ background: "#0b1720", borderColor: "#0b1720" }}
          >
            {executing ? "Executing on Supabase..." : "⚡ Confirm & Execute Live Action"}
          </button>
        </div>
      </div>
    </div>
  );
}
