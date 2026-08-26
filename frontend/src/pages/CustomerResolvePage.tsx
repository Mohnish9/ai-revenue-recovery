import React, { useState, useEffect } from "react";
import { resolveApiUrl } from "../lib/api";
import {
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Smartphone,
  Building2,
  ArrowRight,
  Lock,
  RefreshCw,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";

interface PublicIncident {
  id: string;
  customerName: string;
  customerEmail: string;
  scenarioTypeName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  failureReason: string;
  status: string;
  isResolved: boolean;
  recoveredAmount?: number;
  settledTimestamp?: string;
}

export function CustomerResolvePage({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<PublicIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("UPI_1CLICK");
  const [resolving, setResolving] = useState(false);
  const [successData, setSuccessData] = useState<any | null>(null);

  const fetchIncident = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(resolveApiUrl(`/sandbox/incidents/${incidentId}/public`));
      if (!res.ok) {
        throw new Error(`Payment resolution link expired or incident not found (HTTP ${res.status})`);
      }
      const data = await res.json();
      setIncident(data);
      if (data.isResolved) {
        setSuccessData({
          settledTimestamp: data.settledTimestamp || new Date().toISOString(),
          amount: data.recoveredAmount || data.amount,
          currency: data.currency,
          method: data.paymentMethod || "UPI / Card",
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load payment details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (incidentId) {
      fetchIncident();
    }
  }, [incidentId]);

  const handleAuthorizePayment = async () => {
    try {
      setResolving(true);
      const methodLabel =
        selectedMethod === "UPI_1CLICK"
          ? "UPI 1-Click Intent (Google Pay / PhonePe)"
          : selectedMethod === "CARD_REAUTH"
          ? "Tokenized Card Instant Re-auth"
          : "NetBanking Direct Settlement";

      const res = await fetch(resolveApiUrl(`/sandbox/incidents/${incidentId}/resolve`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: methodLabel,
          notes: "Customer authorized payment resolution via self-serve link.",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to process payment resolution.");
      }

      const result = await res.json();
      setSuccessData({
        settledTimestamp: new Date().toISOString(),
        amount: incident?.amount || 0,
        currency: incident?.currency || "INR",
        method: methodLabel,
        txnId: `RCV-TXN-${Date.now().toString().slice(-8)}`,
      });
      // Refresh local incident state
      fetchIncident();
    } catch (err: any) {
      setError(err.message || "Payment submission failed. Please retry.");
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 font-sans p-6">
        <div className="w-10 h-10 border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide text-slate-400">
          Loading secure payment resolution portal...
        </p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Resolution Link Unavailable</h2>
          <p className="text-sm text-slate-400 mb-6">{error || "This incident could not be found."}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-all"
          >
            Go to Operations Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-lg">
              R
            </div>
            <div>
              <span className="font-bold text-slate-100 text-base tracking-tight">Recoverly</span>
              <span className="text-xs text-slate-400 block -mt-1 font-medium">
                Autonomous Revenue Protection
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            256-Bit Bank-Grade Encryption
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        {successData ? (
          /* Settlement Confirmation View */
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
            <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              Payment Completed
            </span>
            <h1 className="text-2xl font-black text-slate-50 mb-2">Payment Successfully Resolved</h1>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-8">
              Your pending transaction of{" "}
              <strong className="text-slate-200">
                {incident.currency} {incident.amount.toLocaleString()}
              </strong>{" "}
              has been successfully authenticated and settled.
            </p>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-left text-xs space-y-3 mb-8">
              <div className="flex justify-between items-center text-slate-400">
                <span>Incident Reference</span>
                <span className="font-mono text-slate-200 font-semibold">{incident.id}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Customer Account</span>
                <span className="text-slate-200 font-medium">{incident.customerName} ({incident.customerEmail})</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Settled Amount</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {incident.currency} {incident.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Settlement Method</span>
                <span className="text-slate-200">{successData.method}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Reconciliation Time</span>
                <span className="text-slate-300 font-mono">
                  {new Date(successData.settledTimestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400 border-t border-slate-800/80 pt-2">
                <span>Autonomous Workflow Status</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Halted & Ledger Reconciled
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/"
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
              >
                Return to Operator Workspace
              </a>
            </div>
          </div>
        ) : (
          /* Payment Authorization Form View */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Action Required
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
                  Resolve Pending Payment
                </h1>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block font-medium">Total Amount Due</span>
                <span className="text-2xl font-black text-emerald-400 tracking-tight">
                  {incident.currency} {incident.amount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Context Card */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 mb-6 text-xs text-slate-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Account:</span>
                <span className="font-semibold text-slate-200">{incident.customerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="text-slate-200">{incident.customerEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Original Payment Method:</span>
                <span className="text-slate-200 font-medium">{incident.paymentMethod}</span>
              </div>
              <div className="flex items-start justify-between border-t border-slate-800/80 pt-2">
                <span className="text-slate-400">Disruption Reason:</span>
                <span className="text-amber-400 font-medium text-right max-w-[280px]">
                  {incident.failureReason}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Select Resolution Rail
              </label>

              <div className="space-y-3">
                {/* UPI Intent */}
                <label
                  onClick={() => setSelectedMethod("UPI_1CLICK")}
                  className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedMethod === "UPI_1CLICK"
                      ? "bg-emerald-950/40 border-emerald-500 text-slate-100 shadow-md shadow-emerald-950/50"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedMethod === "UPI_1CLICK"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                        UPI 1-Click Instant Intent
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          FASTEST
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Google Pay • PhonePe • Paytm • BHIM
                      </div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={selectedMethod === "UPI_1CLICK"}
                    onChange={() => setSelectedMethod("UPI_1CLICK")}
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>

                {/* Tokenized Card */}
                <label
                  onClick={() => setSelectedMethod("CARD_REAUTH")}
                  className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedMethod === "CARD_REAUTH"
                      ? "bg-emerald-950/40 border-emerald-500 text-slate-100 shadow-md shadow-emerald-950/50"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedMethod === "CARD_REAUTH"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-100">
                        Debit / Credit Card (Tokenized Re-Auth)
                      </div>
                      <div className="text-xs text-slate-400">
                        Visa • Mastercard • RuPay (3D Secure 2.0)
                      </div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={selectedMethod === "CARD_REAUTH"}
                    onChange={() => setSelectedMethod("CARD_REAUTH")}
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>

                {/* NetBanking */}
                <label
                  onClick={() => setSelectedMethod("NETBANKING")}
                  className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedMethod === "NETBANKING"
                      ? "bg-emerald-950/40 border-emerald-500 text-slate-100 shadow-md shadow-emerald-950/50"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedMethod === "NETBANKING"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-100">Direct NetBanking</div>
                      <div className="text-xs text-slate-400">HDFC, ICICI, SBI, Axis, Kotak</div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={selectedMethod === "NETBANKING"}
                    onChange={() => setSelectedMethod("NETBANKING")}
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* Submit Action */}
            <button
              onClick={handleAuthorizePayment}
              disabled={resolving}
              className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {resolving ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Authorizing & Settling Payment...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Authorize & Pay {incident.currency} {incident.amount.toLocaleString()}
                  <ArrowRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>

            <div className="mt-4 text-center">
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Payments are securely processed via tokenized gateway rails. Instant receipt dispatched on completion.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-400">
        <p>Recoverly Autonomous Revenue Operations • Incident ID: <code>{incidentId}</code></p>
      </footer>
    </div>
  );
}
