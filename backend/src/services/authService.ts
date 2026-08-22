import { getSupabaseClient } from "./supabaseService.js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
}

export async function loginWithEmail(email: string, password: string): Promise<AuthResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error || !data.user || !data.session) {
    throw new Error(error?.message || "Invalid email or password");
  }

  const user = data.user;
  const profile: UserProfile = {
    id: user.id,
    email: user.email || email,
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Operator",
    role: user.user_metadata?.role || "REVENUE_ADMIN",
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  };

  return {
    user: profile,
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  };
}

export async function signupWithEmail(
  email: string,
  password: string,
  name: string,
  role = "REVENUE_OPERATOR"
): Promise<AuthResponse> {
  const supabase = getSupabaseClient();

  // We use admin.createUser to immediately confirm and provide a frictionless production auth flow
  try {
    const { error: adminErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (adminErr) {
      // Fallback to standard signUp if admin API has permission constraint
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role },
        },
      });
      if (signUpErr || !signUpData.user) {
        throw new Error(signUpErr?.message || "Failed to create operator account");
      }
    }
  } catch (e: any) {
    if (!e.message?.includes("already registered")) {
      throw e;
    }
  }

  // Now log in to get session token
  return loginWithEmail(email, password);
}

export async function verifyTokenAndGetUser(token: string): Promise<UserProfile> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data.user) {
    throw new Error("Invalid or expired session token");
  }

  const user = data.user;
  return {
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Operator",
    role: user.user_metadata?.role || "REVENUE_ADMIN",
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  };
}

export async function signOutSession(token?: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (token) {
    try {
      if (supabase.auth?.admin?.signOut) {
        await supabase.auth.admin.signOut(token);
      } else if (supabase.auth?.signOut) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn("Supabase auth signOut warning:", e);
    }
  }
}

export async function ensureDefaultAdminExists(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const accounts = [
      { email: "mohnishkaplish92@gmail.com", name: "Mohnish Kaplish", role: "REVENUE_ADMIN", password: "Password123!" },
      { email: "admin@recoverly.ai", name: "Recoverly Admin", role: "REVENUE_ADMIN", password: "Password123!" },
    ];

    const { data: usersData } = await supabase.auth.admin.listUsers();
    const existingEmails = new Set((usersData?.users || []).map((u) => u.email?.toLowerCase()));

    for (const acc of accounts) {
      if (!existingEmails.has(acc.email.toLowerCase())) {
        await supabase.auth.admin.createUser({
          email: acc.email,
          password: acc.password,
          email_confirm: true,
          user_metadata: { name: acc.name, role: acc.role },
        });
      }
    }
  } catch (e) {
    console.warn("Notice: ensureDefaultAdminExists skipped:", e);
  }
}
