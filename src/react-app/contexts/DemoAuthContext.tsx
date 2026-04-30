import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { MochaUser } from "@getmocha/users-service/shared";

// Dev login roles
export type DevRole = "user" | "pool_admin" | "super_admin";

// Demo users for different roles
const DEMO_USERS: Record<DevRole, MochaUser> = {
  user: {
    id: "demo-user-001",
    email: "demo@poolvault.app",
    google_sub: "demo",
    google_user_data: {
      email: "demo@poolvault.app",
      email_verified: true,
      name: "Demo User",
      given_name: "Demo",
      family_name: "User",
      picture: null,
      sub: "demo",
    },
    last_signed_in_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  pool_admin: {
    id: "demo-pool-admin-001",
    email: "admin@poolvault.app",
    google_sub: "demo-admin",
    google_user_data: {
      email: "admin@poolvault.app",
      email_verified: true,
      name: "Pool Admin",
      given_name: "Pool",
      family_name: "Admin",
      picture: null,
      sub: "demo-admin",
    },
    last_signed_in_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  super_admin: {
    id: "demo-super-admin-001",
    email: "superadmin@poolvault.app",
    google_sub: "demo-superadmin",
    google_user_data: {
      email: "superadmin@poolvault.app",
      email_verified: true,
      name: "Super Admin",
      given_name: "Super",
      family_name: "Admin",
      picture: null,
      sub: "demo-superadmin",
    },
    last_signed_in_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};



const DEMO_MODE_KEY = "poolvault_demo_mode";
const DEV_ROLE_KEY = "poolvault_dev_role";

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures to keep auth state usable.
  }
}

function isLocalhostDevRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  return Boolean(meta?.env?.DEV) || host === "localhost" || host === "127.0.0.1";
}

interface DemoAuthContextValue {
  user: MochaUser | null;
  isPending: boolean;
  isFetching: boolean;
  isDemoMode: boolean;
  devRole: DevRole;
  fetchUser: () => Promise<void>;
  redirectToLogin: () => Promise<void>;
  logout: () => Promise<void>;
  enterDemoMode: () => void;
  enterDevMode: (role: DevRole) => void;
  exitDemoMode: () => void;
  exchangeCodeForSessionToken: () => Promise<void>;
}

const DemoAuthContext = createContext<DemoAuthContextValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [devRole, setDevRole] = useState<DevRole>("user");
  const [isInitialized, setIsInitialized] = useState(false);
  const [realUser, setRealUser] = useState<MochaUser | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Check localStorage on mount.
  // Default to real mode unless demo mode is explicitly enabled.
  useEffect(() => {
    try {
      const stored = safeStorageGet(DEMO_MODE_KEY);
      const storedRole = safeStorageGet(DEV_ROLE_KEY) as DevRole | null;
      // Localhost/dev guardrail: keep a stable demo user scope by default.
      // This prevents guest fallback drift that makes watchboards disappear after refreshes.
      const shouldForceLocalDemo = isLocalhostDevRuntime() && stored !== "true";
      if (stored === "true" || shouldForceLocalDemo) {
        const nextRole: DevRole = storedRole && DEMO_USERS[storedRole] ? storedRole : "user";
        safeStorageSet(DEMO_MODE_KEY, "true");
        safeStorageSet(DEV_ROLE_KEY, nextRole);
        setIsDemoMode(true);
        setDevRole(nextRole);
        setRealUser(null);
      } else {
        setIsDemoMode(false);
        // Fetch real user in non-demo mode
        fetchRealUser();
      }
    } catch {
      // If storage is restricted, prefer real mode.
      setIsDemoMode(false);
      fetchRealUser();
    }
    setIsInitialized(true);
  }, []);

  const fetchRealUser = async () => {
    if (isDemoMode) return;
    
    setIsFetching(true);
    try {
      const response = await fetch("/api/users/me");
      if (response.ok) {
        const user = await response.json();
        setRealUser(user);
      } else {
        if (response.status === 401 && isLocalhostDevRuntime()) {
          // Local dev guardrail: avoid drifting into guest scope where watchboards disappear.
          const fallbackRole: DevRole = "user";
          safeStorageSet(DEMO_MODE_KEY, "true");
          safeStorageSet(DEV_ROLE_KEY, fallbackRole);
          setDevRole(fallbackRole);
          setIsDemoMode(true);
        }
        setRealUser(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      if (isLocalhostDevRuntime()) {
        const fallbackRole: DevRole = "user";
        safeStorageSet(DEMO_MODE_KEY, "true");
        safeStorageSet(DEV_ROLE_KEY, fallbackRole);
        setDevRole(fallbackRole);
        setIsDemoMode(true);
      }
      setRealUser(null);
    } finally {
      setIsFetching(false);
    }
  };

  const fetchUser = useCallback(async () => {
    await fetchRealUser();
  }, [isDemoMode]);

  const redirectToLogin = useCallback(async () => {
    if (isDemoMode) {
      return;
    }
    
    try {
      const response = await fetch("/api/oauth/google/redirect_url");
      const data = await response.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (error) {
      console.error("Failed to get login redirect URL:", error);
    }
  }, [isDemoMode]);

  const exchangeCodeForSessionToken = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      throw new Error("No code provided");
    }

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error("Failed to exchange code for session token");
      }

      await fetchRealUser();
    } catch (error) {
      console.error("Failed to exchange code:", error);
      throw error;
    }
  }, []);

  const enterDemoMode = useCallback(() => {
    safeStorageSet(DEMO_MODE_KEY, "true");
    safeStorageSet(DEV_ROLE_KEY, "user");
    setIsDemoMode(true);
    setDevRole("user");
    setRealUser(null);
  }, []);

  const enterDevMode = useCallback((role: DevRole) => {
    safeStorageSet(DEMO_MODE_KEY, "true");
    safeStorageSet(DEV_ROLE_KEY, role);
    setIsDemoMode(true);
    setDevRole(role);
    setRealUser(null);
  }, []);

  const exitDemoMode = useCallback(async () => {
    safeStorageSet(DEMO_MODE_KEY, "false");
    setIsDemoMode(false);
    await fetchRealUser();
  }, []);

  const logout = useCallback(async () => {
    if (isDemoMode) {
      exitDemoMode();
    } else {
      try {
        await fetch("/api/logout");
        setRealUser(null);
      } catch (error) {
        console.error("Failed to logout:", error);
      }
    }
  }, [isDemoMode, exitDemoMode]);

  // Determine the effective user based on dev role
  const effectiveUser = isDemoMode ? DEMO_USERS[devRole] : realUser;
  const effectiveIsPending = !isInitialized || (!isDemoMode && isFetching && realUser === null);

  const value: DemoAuthContextValue = {
    user: effectiveUser,
    isPending: effectiveIsPending,
    isFetching,
    isDemoMode,
    devRole,
    fetchUser,
    redirectToLogin,
    logout,
    enterDemoMode,
    enterDevMode,
    exitDemoMode,
    exchangeCodeForSessionToken,
  };

  return (
    <DemoAuthContext.Provider value={value}>
      {children}
    </DemoAuthContext.Provider>
  );
}

export function useDemoAuth() {
  const context = useContext(DemoAuthContext);
  if (!context) {
    throw new Error("useDemoAuth must be used within a DemoAuthProvider");
  }
  return context;
}
