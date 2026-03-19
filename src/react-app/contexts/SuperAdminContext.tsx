import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useDemoAuth } from "./DemoAuthContext";

interface PlatformUser {
  id: string;
  email: string;
  roles: string[];
  status: string;
  subscription_status: string;
  display_name?: string;
}

interface SuperAdminContextType {
  isSuperAdmin: boolean;
  isLoading: boolean;
  platformUser: PlatformUser | null;
  checkAccess: () => Promise<boolean>;
}

const SuperAdminContext = createContext<SuperAdminContextType>({
  isSuperAdmin: false,
  isLoading: true,
  platformUser: null,
  checkAccess: async () => false,
});

export function SuperAdminProvider({ children }: { children: React.ReactNode }) {
  const { user, isDemoMode } = useDemoAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [platformUser, setPlatformUser] = useState<PlatformUser | null>(null);

  const checkAccess = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setIsSuperAdmin(false);
      setPlatformUser(null);
      setIsLoading(false);
      return false;
    }

    try {
      // Try to access admin overview - if successful, user is super admin
      const headers: HeadersInit = {};
      if (isDemoMode) {
        headers["X-Demo-Mode"] = "true";
      }
      const response = await fetch("/api/admin/overview", {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        // Demo users may not exist in admin user table; avoid noisy 404 lookups.
        if (isDemoMode) {
          setPlatformUser({
            id: user.id,
            email: user.email || "",
            roles: ["super_admin"],
            status: "active",
            subscription_status: "free",
          });
        } else {
          const userResponse = await fetch(`/api/admin/users/${user.id}`, {
            credentials: "include",
            headers,
          });
          
          if (userResponse.ok) {
            const data = await userResponse.json();
            setPlatformUser({
              id: user.id,
              email: user.email || "",
              roles: data.user?.roles || ["super_admin"],
              status: data.user?.status || "active",
              subscription_status: data.user?.subscription_status || "free",
              display_name: data.user?.display_name,
            });
          } else {
            setPlatformUser({
              id: user.id,
              email: user.email || "",
              roles: ["super_admin"],
              status: "active",
              subscription_status: "free",
            });
          }
        }
        
        setIsSuperAdmin(true);
        setIsLoading(false);
        return true;
      }

      setIsSuperAdmin(false);
      setPlatformUser(null);
      setIsLoading(false);
      return false;
    } catch {
      setIsSuperAdmin(false);
      setPlatformUser(null);
      setIsLoading(false);
      return false;
    }
  }, [user]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return (
    <SuperAdminContext.Provider
      value={{
        isSuperAdmin,
        isLoading,
        platformUser,
        checkAccess,
      }}
    >
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  return useContext(SuperAdminContext);
}
