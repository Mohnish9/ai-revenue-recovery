import type { PageKey } from "../lib/types";

const pageCopy: Record<Exclude<PageKey, "dashboard">, { eyebrow: string; title: string; description: string }> = {
  recovery: { eyebrow: "Operations", title: "Recovery cases", description: "A focused queue for revenue at risk and the actions that bring it back." },
  transactions: { eyebrow: "Operations", title: "Transactions", description: "Monitor payment activity and identify the moments that need attention." },
  customers: { eyebrow: "Operations", title: "Customers", description: "Understand customer payment health across your revenue lifecycle." },
  agent: { eyebrow: "Intelligence", title: "AI agent", description: "Agent activity and guardrails will appear here in a later phase." },
  scenarios: { eyebrow: "Intelligence", title: "Scenario center", description: "Model recovery scenarios before they become production workflows." },
  analytics: { eyebrow: "Insights", title: "Analytics", description: "Measure recovery performance once your data connection is ready." },
  audit: { eyebrow: "Insights", title: "Audit logs", description: "A durable record of recovery decisions, changes, and policy events." },
};

export function PlaceholderPage({ page }: { page: Exclude<PageKey, "dashboard"> }) {
  const copy = pageCopy[page];
  return <div className="page placeholder-page"><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.description}</p><div className="placeholder-card"><div className="placeholder-icon">✦</div><h2>Coming in the next phase</h2><p>This foundation is ready for the data model and workflows that will power this area.</p><button className="outline-button">View documentation <span>→</span></button></div></div>;
}