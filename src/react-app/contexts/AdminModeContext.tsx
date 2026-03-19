import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";

interface AdminModeContextValue {
  /**
   * Whether Admin Mode is currently active (toggle ON)
   */
  isAdminMode: boolean;
  
  /**
   * Whether the user has an active subscription that enables Admin Mode
   */
  hasAdminSubscription: boolean;
  
  /**
   * Toggle Admin Mode on/off (only works if hasAdminSubscription is true)
   */
  toggleAdminMode: () => void;
  
  /**
   * Enable Admin Mode
   */
  enableAdminMode: () => void;
  
  /**
   * Disable Admin Mode
   */
  disableAdminMode: () => void;
  
  /**
   * Show the upgrade modal
   */
  showUpgradeModal: () => void;
  
  /**
   * Whether upgrade modal is open
   */
  isUpgradeModalOpen: boolean;
  
  /**
   * Close the upgrade modal
   */
  closeUpgradeModal: () => void;
  
  /**
   * Simulate upgrading (for demo purposes)
   */
  simulateUpgrade: () => void;
  
  /**
   * Reset subscription (for demo purposes)
   */
  resetSubscription: () => void;
}

const AdminModeContext = createContext<AdminModeContextValue | null>(null);

const ADMIN_MODE_STORAGE_KEY = "poolvault_admin_mode";
const ADMIN_SUBSCRIPTION_STORAGE_KEY = "poolvault_admin_subscription";

export function AdminModeProvider({ children }: { children: ReactNode }) {
  // Check localStorage for persisted state
  const [isAdminMode, setIsAdminMode] = useState(() => {
    const stored = localStorage.getItem(ADMIN_MODE_STORAGE_KEY);
    return stored === "true";
  });
  
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  
  // Subscription status - checks localStorage
  const [hasAdminSubscription, setHasAdminSubscription] = useState(() => {
    const stored = localStorage.getItem(ADMIN_SUBSCRIPTION_STORAGE_KEY);
    // Default to false so users see the upgrade flow
    return stored === "true";
  });

  // Persist admin mode state
  useEffect(() => {
    localStorage.setItem(ADMIN_MODE_STORAGE_KEY, isAdminMode.toString());
  }, [isAdminMode]);

  // If subscription is revoked, turn off admin mode
  useEffect(() => {
    if (!hasAdminSubscription && isAdminMode) {
      setIsAdminMode(false);
    }
  }, [hasAdminSubscription, isAdminMode]);

  const toggleAdminMode = useCallback(() => {
    if (hasAdminSubscription) {
      setIsAdminMode(prev => !prev);
    } else {
      // Show upgrade modal when trying to toggle without subscription
      setIsUpgradeModalOpen(true);
    }
  }, [hasAdminSubscription]);

  const enableAdminMode = useCallback(() => {
    if (hasAdminSubscription) {
      setIsAdminMode(true);
    } else {
      setIsUpgradeModalOpen(true);
    }
  }, [hasAdminSubscription]);

  const disableAdminMode = useCallback(() => {
    setIsAdminMode(false);
  }, []);
  
  const showUpgradeModal = useCallback(() => {
    setIsUpgradeModalOpen(true);
  }, []);
  
  const closeUpgradeModal = useCallback(() => {
    setIsUpgradeModalOpen(false);
  }, []);
  
  const simulateUpgrade = useCallback(() => {
    localStorage.setItem(ADMIN_SUBSCRIPTION_STORAGE_KEY, "true");
    setHasAdminSubscription(true);
    setIsUpgradeModalOpen(false);
    // Automatically enable admin mode after upgrade
    setIsAdminMode(true);
  }, []);
  
  const resetSubscription = useCallback(() => {
    localStorage.setItem(ADMIN_SUBSCRIPTION_STORAGE_KEY, "false");
    setHasAdminSubscription(false);
    setIsAdminMode(false);
  }, []);

  const value: AdminModeContextValue = {
    isAdminMode,
    hasAdminSubscription,
    toggleAdminMode,
    enableAdminMode,
    disableAdminMode,
    showUpgradeModal,
    isUpgradeModalOpen,
    closeUpgradeModal,
    simulateUpgrade,
    resetSubscription,
  };

  return (
    <AdminModeContext.Provider value={value}>
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  const context = useContext(AdminModeContext);
  if (!context) {
    throw new Error("useAdminMode must be used within an AdminModeProvider");
  }
  return context;
}
