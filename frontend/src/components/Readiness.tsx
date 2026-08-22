export function Readiness({ label, status, done }: { label: string; status: string; done?: boolean }) {
  return <div className="readiness-row"><span className={`check ${done ? "done" : ""}`}>{done ? "✓" : ""}</span><div><b>{label}</b><small>{status}</small></div><span className="row-arrow">→</span></div>;
}