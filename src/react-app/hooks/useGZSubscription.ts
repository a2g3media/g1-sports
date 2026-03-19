/**
 * GZ Sports Subscription Hook
 * 
 * Provides access to user's subscription tier and feature access.
 * Handles Free, Pool Access, Scout Pro, Scout Elite, and Admin tiers.
 */

import { useState, useEffect, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

export type GZSportsTier = 
  | 'anonymous'           // Not logged in
  | 'free'                // Logged in, no subscription
  | 'pool_access'         // $10/year - can submit picks
  | 'scout_pro'           // $19-29 - full live intelligence
  | 'scout_elite'         // $79 - advanced features
  | 'admin_starter'       // $99/year - 3 pools max
  | 'admin_unlimited';    // $149/year - unlimited pools

export interface FeatureAccess {
  // Core access
  canBrowseScores: boolean;
  canViewPools: boolean;
  canSubmitPicks: boolean;
  
  // Scout AI limits
  scoutDailyCap: number;
  hasLiveCommentary: boolean;
  hasProactiveAlerts: boolean;
  aiPriority: 'standard' | 'elevated' | 'priority';
  
  // Elite features
  hasMultiGameCenter: boolean;
  hasCustomAlerts: boolean;
  hasHeatMaps: boolean;
  hasAdvancedFilters: boolean;
  
  // Admin features
  maxPools: number;
  hasAdminDashboard: boolean;
  hasMemberExport: boolean;
  hasDisputeTools: boolean;
  hasAdvancedAnalytics: boolean;
  hasPrioritySupport: boolean;
  
  // Metadata
  includesPoolAccess: boolean;
  trialDays: number | null;
}

export interface UserSubscription {
  userId: string;
  tier: GZSportsTier;
  productKey: string | null;
  billingPeriod: string | null;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  isTrialing: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  downgradeToProductKey: string | null;
}

interface SubscriptionData {
  subscription: UserSubscription;
  features: FeatureAccess;
  isLoading: boolean;
  error: string | null;
  refreshSubscription: () => Promise<void>;
  startTrial: (productKey: string) => Promise<{ success: boolean; error?: string }>;
  cancelSubscription: (downgradeTo?: 'pool_access' | 'free') => Promise<{ success: boolean; error?: string }>;
}

// Default features for anonymous users
const ANONYMOUS_FEATURES: FeatureAccess = {
  canBrowseScores: true,
  canViewPools: false,
  canSubmitPicks: false,
  scoutDailyCap: 0,
  hasLiveCommentary: false,
  hasProactiveAlerts: false,
  aiPriority: 'standard',
  hasMultiGameCenter: false,
  hasCustomAlerts: false,
  hasHeatMaps: false,
  hasAdvancedFilters: false,
  maxPools: 0,
  hasAdminDashboard: false,
  hasMemberExport: false,
  hasDisputeTools: false,
  hasAdvancedAnalytics: false,
  hasPrioritySupport: false,
  includesPoolAccess: false,
  trialDays: null,
};

// Default subscription for anonymous users
const ANONYMOUS_SUBSCRIPTION: UserSubscription = {
  userId: '',
  tier: 'anonymous',
  productKey: null,
  billingPeriod: null,
  status: 'active',
  isTrialing: false,
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  downgradeToProductKey: null,
};

export function useGZSubscription(): SubscriptionData {
  const { user } = useDemoAuth();
  const [subscription, setSubscription] = useState<UserSubscription>(ANONYMOUS_SUBSCRIPTION);
  const [features, setFeatures] = useState<FeatureAccess>(ANONYMOUS_FEATURES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(ANONYMOUS_SUBSCRIPTION);
      setFeatures(ANONYMOUS_FEATURES);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await fetch("/api/subscription", {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setFeatures(data.features);
      } else {
        throw new Error("Failed to fetch subscription");
      }
    } catch (err) {
      console.error("Failed to fetch subscription:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      // Fallback to free tier on error
      setSubscription({
        userId: user.id,
        tier: 'free',
        productKey: null,
        billingPeriod: null,
        status: 'active',
        isTrialing: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        downgradeToProductKey: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const startTrial = useCallback(async (productKey: string) => {
    try {
      const res = await fetch("/api/subscription/trial/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey }),
      });

      const data = await res.json();

      if (res.ok) {
        setSubscription(data.subscription);
        setFeatures(data.features);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : "Unknown error" 
      };
    }
  }, []);

  const cancelSubscription = useCallback(async (downgradeTo?: 'pool_access' | 'free') => {
    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downgradeTo }),
      });

      const data = await res.json();

      if (res.ok) {
        setSubscription(data.subscription);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : "Unknown error" 
      };
    }
  }, []);

  return {
    subscription,
    features,
    isLoading,
    error,
    refreshSubscription: fetchSubscription,
    startTrial,
    cancelSubscription,
  };
}

/**
 * Hook to check if user has a specific feature
 */
export function useGZFeature(featureCheck: (features: FeatureAccess) => boolean): {
  hasFeature: boolean;
  isLoading: boolean;
  tier: GZSportsTier;
} {
  const { features, isLoading, subscription } = useGZSubscription();
  
  return {
    hasFeature: featureCheck(features),
    isLoading,
    tier: subscription.tier,
  };
}

/**
 * Shorthand hooks for common feature checks
 */
export function useCanSubmitPicks(): boolean {
  const { features } = useGZSubscription();
  return features.canSubmitPicks;
}

export function useHasLiveCommentary(): boolean {
  const { features } = useGZSubscription();
  return features.hasLiveCommentary;
}

export function useHasProactiveAlerts(): boolean {
  const { features } = useGZSubscription();
  return features.hasProactiveAlerts;
}

export function useIsElite(): boolean {
  const { subscription } = useGZSubscription();
  return subscription.tier === 'scout_elite';
}

export function useIsPro(): boolean {
  const { subscription } = useGZSubscription();
  return subscription.tier === 'scout_pro' || subscription.tier === 'scout_elite';
}
