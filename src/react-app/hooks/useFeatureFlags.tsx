import * as React from "react";
import type { ReactNode } from "react";

const { useState, useEffect, createContext, useContext, useCallback } = React;

interface FeatureFlags {
  PUBLIC_POOLS: boolean;
  MARKETPLACE_ENABLED: boolean;
  GAME_FAVORITES_ENABLED: boolean;
  HOME_FAVORITES_RAIL_ENABLED: boolean;
}

interface FeatureFlagsContextValue {
  flags: FeatureFlags;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const defaultFlags: FeatureFlags = {
  PUBLIC_POOLS: false,
  MARKETPLACE_ENABLED: false,
  GAME_FAVORITES_ENABLED: true,
  HOME_FAVORITES_RAIL_ENABLED: true,
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: defaultFlags,
  isLoading: true,
  error: null,
  refresh: async () => {},
});

interface FeatureFlagsProviderProps {
  children: ReactNode;
}

export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);
  const [isLoading, setIsLoading] = useState(false); // Start false - don't block render
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch("/api/feature-flags/public");
      
      if (!response.ok) {
        throw new Error("Failed to fetch feature flags");
      }
      
      const data = await response.json();
      setFlags({
        PUBLIC_POOLS: data.PUBLIC_POOLS ?? false,
        MARKETPLACE_ENABLED: data.MARKETPLACE_ENABLED ?? false,
        GAME_FAVORITES_ENABLED: data.GAME_FAVORITES_ENABLED ?? true,
        HOME_FAVORITES_RAIL_ENABLED: data.HOME_FAVORITES_RAIL_ENABLED ?? true,
      });
    } catch (err) {
      console.error("Failed to fetch feature flags:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      // Keep defaults on error - don't reset
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch in background - don't block initial render
  useEffect(() => {
    // Use requestIdleCallback to defer non-critical fetch
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => fetchFlags());
    } else {
      // Fallback: slight delay to not block initial paint
      setTimeout(fetchFlags, 100);
    }
  }, [fetchFlags]);

  const contextValue: FeatureFlagsContextValue = {
    flags,
    isLoading,
    error,
    refresh: fetchFlags,
  };

  return (
    <FeatureFlagsContext.Provider value={contextValue}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

export function usePublicPoolsEnabled(): boolean {
  const { flags } = useFeatureFlags();
  return flags.PUBLIC_POOLS;
}
