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

// Non-blocking fallback for authenticated users when subscription endpoint fails.
const FREE_FALLBACK_FEATURES: FeatureAccess = {
  ...ANONYMOUS_FEATURES,
  canViewPools: true,
};

const REFRESH_COOLDOWN_MS = 30_000;
const FAILURE_BACKOFF_BASE_MS = 15_000;
const FAILURE_BACKOFF_MAX_MS = 5 * 60_000;
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 2_500;

type SharedSubscriptionState = {
  subscription: UserSubscription;
  features: FeatureAccess;
  isLoading: boolean;
  error: string | null;
  activeUserId: string;
  failureCount: number;
  lastAttemptAtMs: number;
};

const sharedSubscriptionState: SharedSubscriptionState = {
  subscription: ANONYMOUS_SUBSCRIPTION,
  features: ANONYMOUS_FEATURES,
  isLoading: false,
  error: null,
  activeUserId: "",
  failureCount: 0,
  lastAttemptAtMs: 0,
};

const subscriptionListeners = new Set<(next: SharedSubscriptionState) => void>();
let subscriptionInflight: Promise<void> | null = null;

function emitSubscriptionState(): void {
  for (const listener of subscriptionListeners) {
    listener({ ...sharedSubscriptionState });
  }
}

function buildFreeFallbackSubscription(userId: string): UserSubscription {
  return {
    userId,
    tier: 'free',
    productKey: null,
    billingPeriod: null,
    status: 'active',
    isTrialing: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    downgradeToProductKey: null,
  };
}

async function readSubscriptionFromApi(): Promise<{ subscription: UserSubscription; features: FeatureAccess }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUBSCRIPTION_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/subscription", {
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch subscription (HTTP ${res.status})`);
    }
    const data = await res.json();
    return {
      subscription: data.subscription as UserSubscription,
      features: data.features as FeatureAccess,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function useGZSubscription(): SubscriptionData {
  const { user } = useDemoAuth();
  const [subscription, setSubscription] = useState<UserSubscription>(sharedSubscriptionState.subscription);
  const [features, setFeatures] = useState<FeatureAccess>(sharedSubscriptionState.features);
  const [isLoading, setIsLoading] = useState(sharedSubscriptionState.isLoading);
  const [error, setError] = useState<string | null>(sharedSubscriptionState.error);

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      sharedSubscriptionState.subscription = ANONYMOUS_SUBSCRIPTION;
      sharedSubscriptionState.features = ANONYMOUS_FEATURES;
      sharedSubscriptionState.isLoading = false;
      sharedSubscriptionState.error = null;
      sharedSubscriptionState.activeUserId = "";
      sharedSubscriptionState.failureCount = 0;
      sharedSubscriptionState.lastAttemptAtMs = Date.now();
      emitSubscriptionState();
      return;
    }

    const userId = String(user.id || "").trim();
    const nowMs = Date.now();
    const backoffMs = Math.min(
      FAILURE_BACKOFF_MAX_MS,
      FAILURE_BACKOFF_BASE_MS * Math.max(1, sharedSubscriptionState.failureCount || 1)
    );
    const minIntervalMs = sharedSubscriptionState.failureCount > 0
      ? Math.max(REFRESH_COOLDOWN_MS, backoffMs)
      : REFRESH_COOLDOWN_MS;
    const sameUser = sharedSubscriptionState.activeUserId === userId;
    if (
      sameUser
      && sharedSubscriptionState.lastAttemptAtMs > 0
      && nowMs - sharedSubscriptionState.lastAttemptAtMs < minIntervalMs
    ) {
      return;
    }
    if (subscriptionInflight) {
      await subscriptionInflight;
      return;
    }

    const firstLoadForUser = !sameUser;
    sharedSubscriptionState.activeUserId = userId;
    sharedSubscriptionState.lastAttemptAtMs = nowMs;
    sharedSubscriptionState.isLoading = firstLoadForUser;
    emitSubscriptionState();

    subscriptionInflight = (async () => {
    try {
      const data = await readSubscriptionFromApi();
      sharedSubscriptionState.subscription = data.subscription;
      sharedSubscriptionState.features = data.features;
      sharedSubscriptionState.error = null;
      sharedSubscriptionState.failureCount = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sharedSubscriptionState.error = message;
      sharedSubscriptionState.failureCount = Math.min(8, (sharedSubscriptionState.failureCount || 0) + 1);
      // Safe fallback: page render should continue regardless of subscription endpoint health.
      sharedSubscriptionState.subscription = buildFreeFallbackSubscription(userId);
      sharedSubscriptionState.features = FREE_FALLBACK_FEATURES;
      console.warn("[subscription] non-blocking fallback applied", {
        userId,
        failureCount: sharedSubscriptionState.failureCount,
        message,
      });
    } finally {
      sharedSubscriptionState.isLoading = false;
      emitSubscriptionState();
    }
    })();
    try {
      await subscriptionInflight;
    } finally {
      subscriptionInflight = null;
    }
  }, [user]);

  useEffect(() => {
    const onChange = (next: SharedSubscriptionState) => {
      setSubscription(next.subscription);
      setFeatures(next.features);
      setIsLoading(next.isLoading);
      setError(next.error);
    };
    subscriptionListeners.add(onChange);
    onChange({ ...sharedSubscriptionState });
    return () => {
      subscriptionListeners.delete(onChange);
    };
  }, []);

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
