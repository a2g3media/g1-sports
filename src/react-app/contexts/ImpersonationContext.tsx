import React, { createContext, useContext, useState, useCallback } from "react";
import { useSuperAdmin } from "./SuperAdminContext";
import { useDemoAuth, DevRole } from "./DemoAuthContext";

// Role types for the application
export type UserRole = "user" | "pool_admin" | "super_admin";

interface ImpersonatedUser {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  originalUserId: string;
}

interface ImpersonationContextType {
  // Current impersonation state
  isImpersonating: boolean;
  impersonatedUser: ImpersonatedUser | null;
  
  // Actions
  startImpersonation: (userId: string, role: UserRole) => Promise<boolean>;
  stopImpersonation: () => void;
  
  // Get effective role (impersonated or actual)
  effectiveRole: UserRole;
  effectiveUserId: string | null;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  isImpersonating: false,
  impersonatedUser: null,
  startImpersonation: async () => false,
  stopImpersonation: () => {},
  effectiveRole: "user",
  effectiveUserId: null,
});

// Map DevRole to UserRole (they're identical but come from different sources)
const devRoleToUserRole = (devRole: DevRole): UserRole => devRole;

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, platformUser } = useSuperAdmin();
  const { isDemoMode, devRole } = useDemoAuth();
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  // Test accounts for role testing (these don't need to exist in DB)
  const TEST_ACCOUNTS: Record<string, { email: string; displayName: string; role: UserRole }> = {
    "test-pool-admin": { email: "test_pool_admin@demo.local", displayName: "Test Pool Admin", role: "pool_admin" },
    "test-player": { email: "test_player@demo.local", displayName: "Test Player", role: "user" },
  };

  const startImpersonation = useCallback(async (userId: string, role: UserRole): Promise<boolean> => {
    // Only super admins can impersonate
    if (!isSuperAdmin || !platformUser) {
      console.warn("Impersonation requires super admin privileges");
      return false;
    }

    try {
      // Check if this is a test account first
      const testAccount = TEST_ACCOUNTS[userId];
      if (testAccount) {
        setImpersonatedUser({
          id: userId,
          email: testAccount.email,
          displayName: testAccount.displayName,
          role: role || testAccount.role,
          originalUserId: platformUser.id,
        });

        sessionStorage.setItem("impersonation", JSON.stringify({
          userId,
          role: role || testAccount.role,
          originalUserId: platformUser.id,
          isTestAccount: true,
        }));

        return true;
      }

      // Fetch real user details for impersonation
      const response = await fetch(`/api/admin/users/${userId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Failed to fetch user for impersonation");
        return false;
      }

      const data = await response.json();
      
      setImpersonatedUser({
        id: userId,
        email: data.user?.email || "unknown@example.com",
        displayName: data.user?.display_name,
        role,
        originalUserId: platformUser.id,
      });

      // Store in sessionStorage so it persists across page navigation but not browser close
      sessionStorage.setItem("impersonation", JSON.stringify({
        userId,
        role,
        originalUserId: platformUser.id,
      }));

      return true;
    } catch (error) {
      console.error("Impersonation error:", error);
      return false;
    }
  }, [isSuperAdmin, platformUser]);

  const stopImpersonation = useCallback(() => {
    setImpersonatedUser(null);
    sessionStorage.removeItem("impersonation");
  }, []);

  // Restore impersonation from sessionStorage on mount
  React.useEffect(() => {
    if (isSuperAdmin && platformUser) {
      const stored = sessionStorage.getItem("impersonation");
      if (stored) {
        try {
          const { userId, role, originalUserId, isTestAccount } = JSON.parse(stored);
          if (originalUserId === platformUser.id) {
            // Check if it's a test account
            const testAccount = TEST_ACCOUNTS[userId];
            if (isTestAccount && testAccount) {
              setImpersonatedUser({
                id: userId,
                email: testAccount.email,
                displayName: testAccount.displayName,
                role: role || testAccount.role,
                originalUserId,
              });
              return;
            }

            // Re-fetch real user details
            fetch(`/api/admin/users/${userId}`, { credentials: "include" })
              .then(res => res.json())
              .then(data => {
                setImpersonatedUser({
                  id: userId,
                  email: data.user?.email || "unknown@example.com",
                  displayName: data.user?.display_name,
                  role,
                  originalUserId,
                });
              })
              .catch(() => {
                sessionStorage.removeItem("impersonation");
              });
          }
        } catch {
          sessionStorage.removeItem("impersonation");
        }
      }
    }
  }, [isSuperAdmin, platformUser]);

  // Priority: impersonation > demo mode role > super admin status > default user
  const effectiveRole: UserRole = impersonatedUser 
    ? impersonatedUser.role 
    : isDemoMode 
      ? devRoleToUserRole(devRole)
      : isSuperAdmin 
        ? "super_admin" 
        : "user";
  
  const effectiveUserId = impersonatedUser ? impersonatedUser.id : platformUser?.id || null;

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: !!impersonatedUser,
        impersonatedUser,
        startImpersonation,
        stopImpersonation,
        effectiveRole,
        effectiveUserId,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
