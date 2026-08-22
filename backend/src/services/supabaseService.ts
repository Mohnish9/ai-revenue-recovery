import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const requiredEnvironment = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
export const databaseTables = [
  "customers",
  "transactions",
  "subscriptions",
  "invoices",
  "recovery_cases",
  "recovery_actions",
  "payment_events",
  "agent_logs",
  "promises_to_pay",
  "audit_logs",
] as const;

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const missing = requiredEnvironment.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}`);
  }
  client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export async function getDatabaseStatus() {
  try {
    const supabase = getSupabaseClient();
    const tableChecks = await Promise.all(databaseTables.map(async (table) => {
      const { error } = await supabase.from(table).select("id").limit(1);
      return { table, available: !error, error: error?.message };
    }));
    const unavailable = tableChecks.filter((check) => !check.available);
    return {
      connected: unavailable.length === 0,
      tables: tableChecks,
      error: unavailable[0]?.error,
    };
  } catch (error) {
    return {
      connected: false,
      tables: databaseTables.map((table) => ({ table, available: false })),
      error: error instanceof Error ? error.message : "Unable to connect to Supabase",
    };
  }
}

export async function getDashboardSummary() {
  const supabase = getSupabaseClient();
  const [{ data: cases, error: casesError }, { data: recoveredCases, error: recoveredError }] = await Promise.all([
    supabase.from("recovery_cases").select("amount_at_risk,status"),
    supabase.from("recovery_cases").select("amount_at_risk").eq("status", "RECOVERED"),
  ]);

  if (casesError) throw casesError;
  if (recoveredError) throw recoveredError;

  const activeCases = (cases ?? []).filter((item) => item.status !== "RECOVERED" && item.status !== "CLOSED");
  const totalCaseValue = (cases ?? []).reduce((sum, item) => sum + Number(item.amount_at_risk), 0);
  const recoveredValue = (recoveredCases ?? []).reduce((sum, item) => sum + Number(item.amount_at_risk), 0);
  const resolvedValue = totalCaseValue - activeCases.reduce((sum, item) => sum + Number(item.amount_at_risk), 0);

  return {
    revenueAtRisk: activeCases.reduce((sum, item) => sum + Number(item.amount_at_risk), 0),
    openRecoveryCases: activeCases.length,
    recoveredThisMonth: recoveredValue,
    recoveryRate: resolvedValue > 0 ? recoveredValue / resolvedValue : 0,
    totalRecoveryCases: cases?.length ?? 0,
  };
}