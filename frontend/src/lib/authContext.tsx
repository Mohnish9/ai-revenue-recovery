import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserProfile } from "./types";
import { loginApi, signupApi, fetchMeApi, logoutApi, getStoredToken, setStoredToken } from "./api";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetchMeApi();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    const handleUnauthorized = () => {
      setUser(null);
    };

    window.addEventListener("recoverly_auth_unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("recoverly_auth_unauthorized", handleUnauthorized);
    };
  }, [refreshSession]);

  const login = async (email: string, password: string) => {
    const res = await loginApi(email, password);
    setUser(res.user);
    if (window.location.pathname === "/login") {
      window.history.replaceState({}, "", "/");
    }
  };

  const signup = async (email: string, password: string, name: string, role?: string) => {
    const res = await signupApi(email, password, name, role);
    setUser(res.user);
    if (window.location.pathname === "/login") {
      window.history.replaceState({}, "", "/");
    }
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
      setStoredToken(null);
      if (window.location.pathname !== "/login") {
        window.history.replaceState({}, "", "/login");
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
