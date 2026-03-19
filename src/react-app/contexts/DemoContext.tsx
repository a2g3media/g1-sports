import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

// =====================================================
// DEMO MODE CONTEXT - DO NOT DELETE
// This system is critical for testing all features.
// Always extend demo coverage when adding new features.
// =====================================================

interface DemoSettings {
  autoSeedOnLogin: boolean;
  impersonatingUserId: number | null;
  lastSeededAt: Date | null;
}

interface DemoContextType {
  // Core state
  isDemoUser: boolean;
  demoModeEnabled: boolean;
  setDemoModeEnabled: (enabled: boolean) => void;
  
  // Simulation state
  simulatedSubscription: "free" | "bronze" | "silver" | "gold";
  setSimulatedSubscription: (tier: "free" | "bronze" | "silver" | "gold") => void;
  simulatedAdminMode: boolean;
  setSimulatedAdminMode: (enabled: boolean) => void;
  
  // Demo settings
  settings: DemoSettings;
  updateSettings: (settings: Partial<DemoSettings>) => void;
  
  // Demo data actions
  seedDemoUniverse: () => Promise<void>;
  resetDemoUniverse: () => Promise<void>;
  reseedDemoUniverse: () => Promise<void>;
  
  // Simulation actions
  advanceWeekState: (leagueId: number, newState: string) => Promise<void>;
  triggerScoring: (leagueId: number) => Promise<void>;
  triggerEliminationDrama: (leagueId: number) => Promise<void>;
  generateReceipt: (leagueId: number, userId?: number) => Promise<void>;
  setPaymentStatus: (leagueId: number, userId: number, status: "paid" | "unpaid" | "pending") => Promise<void>;
  
  // Loading states
  isSeeding: boolean;
  isResetting: boolean;
  seedingProgress: { current: number; total: number; stage: string } | null;
}

const DemoContext = createContext<DemoContextType | null>(null);

// Demo user whitelist (add tester emails here)
const DEMO_USER_EMAILS: string[] = [
  // Owner/admin emails that should have demo access
  // Add emails as needed - these users can toggle demo mode
];
let demoSettingsAuthBlocked = false;

export function DemoProvider({ children }: { children: ReactNode }) {
  const { user } = useDemoAuth();
  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  
  // Check if current user is a demo user (whitelist or already flagged)
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [demoModeEnabled, setDemoModeEnabledState] = useState(false);
  const [simulatedSubscription, setSimulatedSubscriptionState] = useState<"free" | "bronze" | "silver" | "gold">("free");
  const [simulatedAdminMode, setSimulatedAdminModeState] = useState(false);
  const [settings, setSettings] = useState<DemoSettings>({
    autoSeedOnLogin: true,
    impersonatingUserId: null,
    lastSeededAt: null,
  });
  
  const [isSeeding, setIsSeeding] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState<{ current: number; total: number; stage: string } | null>(null);
  
  // Check demo user status on auth change
  useEffect(() => {
    if (user?.email) {
      // All authenticated users get demo access for now (for testing)
      // In production, check against whitelist or user flag
      const isWhitelisted = DEMO_USER_EMAILS.length === 0 || DEMO_USER_EMAILS.includes(user.email);
      setIsDemoUser(isWhitelisted);
      
      // Defer fetch to avoid network congestion on app load
      const timeoutId = setTimeout(() => {
        fetchDemoSettings();
      }, 800);
      
      return () => clearTimeout(timeoutId);
    }
  }, [user?.email]);
  
  const fetchDemoSettings = async () => {
    if (isLocalhost) return;
    if (demoSettingsAuthBlocked) return;
    try {
      const response = await fetch("/api/demo/settings", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setDemoModeEnabledState(data.demo_mode_enabled || false);
        setSimulatedSubscriptionState(data.simulated_subscription || "free");
        setSimulatedAdminModeState(data.simulated_admin_mode || false);
        setSettings({
          autoSeedOnLogin: data.auto_seed_on_login ?? true,
          impersonatingUserId: data.impersonating_user_id || null,
          lastSeededAt: data.last_seeded_at ? new Date(data.last_seeded_at) : null,
        });
      } else if (response.status === 401 || response.status === 403) {
        demoSettingsAuthBlocked = true;
      }
    } catch (err) {
      console.error("Failed to fetch demo settings:", err);
    }
  };
  
  const setDemoModeEnabled = useCallback(async (enabled: boolean) => {
    setDemoModeEnabledState(enabled);
    try {
      await fetch("/api/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ demo_mode_enabled: enabled }),
      });
    } catch (err) {
      console.error("Failed to update demo mode:", err);
    }
  }, []);
  
  const setSimulatedSubscription = useCallback(async (tier: "free" | "bronze" | "silver" | "gold") => {
    setSimulatedSubscriptionState(tier);
    try {
      await fetch("/api/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ simulated_subscription: tier }),
      });
    } catch (err) {
      console.error("Failed to update subscription:", err);
    }
  }, []);
  
  const setSimulatedAdminMode = useCallback(async (enabled: boolean) => {
    setSimulatedAdminModeState(enabled);
    try {
      await fetch("/api/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ simulated_admin_mode: enabled }),
      });
    } catch (err) {
      console.error("Failed to update admin mode:", err);
    }
  }, []);
  
  const updateSettings = useCallback(async (newSettings: Partial<DemoSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    try {
      await fetch("/api/demo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          auto_seed_on_login: newSettings.autoSeedOnLogin,
          impersonating_user_id: newSettings.impersonatingUserId,
        }),
      });
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  }, []);
  
  const seedDemoUniverse = useCallback(async () => {
    setIsSeeding(true);
    setSeedingProgress({ current: 0, total: 100, stage: "Initializing..." });
    
    try {
      const response = await fetch("/api/demo/seed", {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to seed demo universe");
      }
      
      const result = await response.json();
      setSettings(prev => ({ ...prev, lastSeededAt: new Date() }));
      setSeedingProgress({ current: 100, total: 100, stage: "Complete!" });
      
      // Refresh settings
      await fetchDemoSettings();
      
      return result;
    } finally {
      setIsSeeding(false);
      setTimeout(() => setSeedingProgress(null), 2000);
    }
  }, []);
  
  const resetDemoUniverse = useCallback(async () => {
    setIsResetting(true);
    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to reset demo universe");
      }
    } finally {
      setIsResetting(false);
    }
  }, []);
  
  const reseedDemoUniverse = useCallback(async () => {
    await resetDemoUniverse();
    await seedDemoUniverse();
  }, [resetDemoUniverse, seedDemoUniverse]);
  
  const advanceWeekState = useCallback(async (leagueId: number, newState: string) => {
    await fetch("/api/demo/simulate/week-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ league_id: leagueId, new_state: newState }),
    });
  }, []);
  
  const triggerScoring = useCallback(async (leagueId: number) => {
    await fetch("/api/demo/simulate/scoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ league_id: leagueId }),
    });
  }, []);
  
  const triggerEliminationDrama = useCallback(async (leagueId: number) => {
    await fetch("/api/demo/simulate/eliminations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ league_id: leagueId }),
    });
  }, []);
  
  const generateReceipt = useCallback(async (leagueId: number, userId?: number) => {
    await fetch("/api/demo/simulate/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ league_id: leagueId, user_id: userId }),
    });
  }, []);
  
  const setPaymentStatus = useCallback(async (leagueId: number, userId: number, status: "paid" | "unpaid" | "pending") => {
    await fetch("/api/demo/simulate/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ league_id: leagueId, user_id: userId, status }),
    });
  }, []);
  
  return (
    <DemoContext.Provider
      value={{
        isDemoUser,
        demoModeEnabled,
        setDemoModeEnabled,
        simulatedSubscription,
        setSimulatedSubscription,
        simulatedAdminMode,
        setSimulatedAdminMode,
        settings,
        updateSettings,
        seedDemoUniverse,
        resetDemoUniverse,
        reseedDemoUniverse,
        advanceWeekState,
        triggerScoring,
        triggerEliminationDrama,
        generateReceipt,
        setPaymentStatus,
        isSeeding,
        isResetting,
        seedingProgress,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return context;
}

// Optional hook for components that may exist outside DemoProvider
export function useDemoOptional() {
  return useContext(DemoContext);
}
