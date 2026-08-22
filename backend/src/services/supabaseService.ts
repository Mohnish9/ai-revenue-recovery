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
  "sandbox_incidents",
  "sandbox_actions",
  "sandbox_audit_logs",
] as const;

// In-memory store starts completely empty (zero fake/demo rows)
const mockCustomers: any[] = [];

const mockTransactions: any[] = [];
const mockSubscriptions: any[] = [];
const mockInvoices: any[] = [];
const mockRecoveryCases: any[] = [];
const mockPaymentEvents: any[] = [];
const mockRecoveryActions: any[] = [];
const mockPromisesToPay: any[] = [];
const mockAgentLogs: any[] = [];
const mockAuditLogs: any[] = [];

const mockUsers = [
  {
    id: "usr_demo_001",
    email: "mohnishkaplish92@gmail.com",
    password: "Password123!",
    created_at: "2026-08-01T00:00:00Z",
    last_sign_in_at: "2026-08-22T06:00:00Z",
    user_metadata: { name: "Mohnish Kaplish", role: "REVENUE_ADMIN" },
  },
  {
    id: "usr_demo_002",
    email: "admin@recoverly.ai",
    password: "Password123!",
    created_at: "2026-08-01T00:00:00Z",
    last_sign_in_at: "2026-08-22T06:00:00Z",
    user_metadata: { name: "Recoverly Admin", role: "REVENUE_ADMIN" },
  },
];

const mockData: Record<string, any[]> = {
  customers: mockCustomers,
  transactions: mockTransactions,
  subscriptions: mockSubscriptions,
  invoices: mockInvoices,
  recovery_cases: mockRecoveryCases,
  payment_events: mockPaymentEvents,
  recovery_actions: mockRecoveryActions,
  promises_to_pay: mockPromisesToPay,
  agent_logs: mockAgentLogs,
  audit_logs: mockAuditLogs,
  sandbox_incidents: [],
  sandbox_actions: [],
  sandbox_audit_logs: [],
};

function createMockQuery(table: string) {
  if (!mockData[table]) {
    mockData[table] = [];
  }
  let list = [...mockData[table]];
  let pendingUpdate: Record<string, any> | null = null;
  let filterConditions: Array<(item: any) => boolean> = [];

  const applyFilters = () => {
    let result = [...mockData[table]];
    for (const filter of filterConditions) {
      result = result.filter(filter);
    }
    return result;
  };

  const query: any = {
    select: (_fields = "*") => {
      list = applyFilters();
      if (table === "recovery_cases") {
        list = list.map((item) => ({
          ...item,
          customers: mockCustomers.find((c) => c.id === item.customer_id) || null,
        }));
      }
      return query;
    },
    insert: (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const inserted: any[] = [];
      for (const item of items) {
        const newItem = {
          id: item.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          created_at: item.created_at || new Date().toISOString(),
          ...item,
        };
        mockData[table].push(newItem);
        inserted.push(newItem);
      }
      list = inserted;
      return query;
    },
    update: (patch: any) => {
      pendingUpdate = patch;
      const targetIndices = mockData[table]
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => filterConditions.every((f) => f(item)))
        .map(({ idx }) => idx);

      for (const idx of targetIndices) {
        mockData[table][idx] = {
          ...mockData[table][idx],
          ...patch,
          updated_at: patch.updated_at || new Date().toISOString(),
        };
      }
      list = targetIndices.map((idx) => mockData[table][idx]);
      return query;
    },
    upsert: (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const upserted: any[] = [];
      for (const item of items) {
        const existingIdx = item.id
          ? mockData[table].findIndex((x) => x.id === item.id)
          : item.recovery_case_id
          ? mockData[table].findIndex((x) => x.recovery_case_id === item.recovery_case_id)
          : -1;

        if (existingIdx >= 0) {
          mockData[table][existingIdx] = {
            ...mockData[table][existingIdx],
            ...item,
            updated_at: item.updated_at || new Date().toISOString(),
          };
          upserted.push(mockData[table][existingIdx]);
        } else {
          const newItem = {
            id: item.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            created_at: item.created_at || new Date().toISOString(),
            ...item,
          };
          mockData[table].push(newItem);
          upserted.push(newItem);
        }
      }
      list = upserted;
      return query;
    },
    delete: () => {
      const remaining = mockData[table].filter((item) => !filterConditions.every((f) => f(item)));
      mockData[table] = remaining;
      list = [];
      return query;
    },
    eq: (column: string, value: any) => {
      const cond = (item: any) => item[column] === value;
      filterConditions.push(cond);
      list = list.filter(cond);
      return query;
    },
    or: (expr: string) => {
      const parts = expr.split(",");
      const orCond = (item: any) => {
        return parts.some((part) => {
          const match = part.trim().match(/^([^.]+)\.ilike\.%(.+)%$/);
          if (match) {
            const [, col, val] = match;
            return String(item[col] ?? "").toLowerCase().includes(val.toLowerCase());
          }
          return false;
        });
      };
      filterConditions.push(orCond);
      list = list.filter(orCond);
      return query;
    },
    order: (column: string, { ascending = true }: { ascending?: boolean } = {}) => {
      list.sort((a, b) => {
        const valA = a[column];
        const valB = b[column];
        if (valA < valB) return ascending ? -1 : 1;
        if (valA > valB) return ascending ? 1 : -1;
        return 0;
      });
      return query;
    },
    limit: (count: number) => {
      list = list.slice(0, count);
      return query;
    },
    maybeSingle: async () => {
      return { data: list[0] ?? null, error: null };
    },
    single: async () => {
      return { data: list[0] ?? null, error: list.length === 0 ? { message: "No rows found" } : null };
    },
    then: (resolve: (val: any) => any) => {
      return Promise.resolve({ data: list, error: null }).then(resolve);
    },
  };

  return query;
}

const mockAuth = {
  signInWithPassword: async ({ email, password }: { email: string; password?: string }) => {
    const user = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      // Allow any demo user in mock mode for a seamless local development experience
      const newUser = {
        id: `usr_${Date.now()}`,
        email,
        password: password || "Password123!",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        user_metadata: { name: email.split("@")[0], role: "REVENUE_ADMIN" },
      };
      mockUsers.push(newUser);
      return {
        data: {
          user: newUser,
          session: {
            access_token: `mock_jwt_${newUser.id}`,
            refresh_token: `mock_refresh_${newUser.id}`,
            expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
          },
        },
        error: null,
      };
    }
    return {
      data: {
        user,
        session: {
          access_token: `mock_jwt_${user.id}`,
          refresh_token: `mock_refresh_${user.id}`,
          expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
        },
      },
      error: null,
    };
  },
  signUp: async ({ email, password, options }: { email: string; password?: string; options?: any }) => {
    const existing = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { data: { user: existing, session: null }, error: { message: "User already registered" } };
    }
    const newUser = {
      id: `usr_${Date.now()}`,
      email,
      password: password || "Password123!",
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      user_metadata: options?.data || { name: email.split("@")[0], role: "REVENUE_OPERATOR" },
    };
    mockUsers.push(newUser);
    return {
      data: {
        user: newUser,
        session: {
          access_token: `mock_jwt_${newUser.id}`,
          refresh_token: `mock_refresh_${newUser.id}`,
          expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
        },
      },
      error: null,
    };
  },
  getUser: async (token: string) => {
    if (!token) return { data: { user: null }, error: { message: "No token provided" } };
    const userIdMatch = token.replace("mock_jwt_", "").replace("Bearer ", "");
    const user = mockUsers.find((u) => u.id === userIdMatch) || mockUsers[0];
    return { data: { user }, error: null };
  },
  signOut: async () => {
    return { error: null };
  },
  admin: {
    createUser: async ({ email, password, user_metadata }: { email: string; password?: string; email_confirm?: boolean; user_metadata?: any }) => {
      const existing = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return { data: { user: existing }, error: { message: "User already registered" } };
      }
      const newUser = {
        id: `usr_${Date.now()}`,
        email,
        password: password || "Password123!",
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        user_metadata: user_metadata || { name: email.split("@")[0], role: "REVENUE_ADMIN" },
      };
      mockUsers.push(newUser);
      return { data: { user: newUser }, error: null };
    },
    listUsers: async () => {
      return { data: { users: mockUsers }, error: null };
    },
    signOut: async () => {
      return { error: null };
    },
  },
};

const mockSupabaseClient: any = {
  from: (table: string) => createMockQuery(table),
  auth: mockAuth,
};

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    // Return in-memory mock client when credentials are not configured
    return mockSupabaseClient as unknown as SupabaseClient;
  }
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export async function getDatabaseStatus() {
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    return {
      connected: true,
      mock: true,
      tables: databaseTables.map((table) => ({ table, available: true })),
      error: undefined,
    };
  }
  try {
    const supabase = getSupabaseClient();
    const tableChecks = await Promise.all(databaseTables.map(async (table) => {
      const { error } = await supabase.from(table).select("id").limit(1);
      return { table, available: !error, error: error?.message };
    }));
    const unavailable = tableChecks.filter((check) => !check.available);
    return {
      connected: unavailable.length === 0,
      mock: false,
      tables: tableChecks,
      error: unavailable[0]?.error,
    };
  } catch (error) {
    return {
      connected: false,
      mock: false,
      tables: databaseTables.map((table) => ({ table, available: false, error: error instanceof Error ? error.message : "Connection failed" })),
      error: error instanceof Error ? error.message : "Failed to connect to Supabase database",
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
