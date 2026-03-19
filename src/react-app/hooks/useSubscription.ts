/**
 * useSubscription Hook
 * 
 * Provides subscription state and feature access throughout the app.
 * Handles loading, caching, and feature gating logic.
 * 
 * IMPORTANT: Super Admin role bypasses all subscription gates.
 */

import { useState, useEffect, useMemo } from "react";
import { useImpersonation, type UserRole } from "@/react-app/contexts/ImpersonationContext";

export type GZSportsTier = 
  | 'anonymous'
  | 'free'
  | 'pool_access'
  | 'scout_pro'
  | 'scout_elite'
  | 'admin_starter'
  | 'admin_unlimited';

export interface Subscription {
  userId: string;
  tier: GZSportsTier;
  productKey: string | null;
  billingPeriod: string | null;
  status: "active" | "trialing" | "past_due" | "canceled" | "expired";
  isTrialing: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  downgradeToProductKey: string | null;
}

export interface FeatureAccess {
  canBrowseScores: boolean;
  canViewPools: boolean;
  canSubmitPicks: boolean;
  scoutDailyCap: number;
  hasLiveCommentary: boolean;
  hasProactiveAlerts: boolean;
  aiPriority: 'standard' | 'elevated' | 'priority';
  hasMultiGameCenter: boolean;
  hasCustomAlerts: boolean;
  hasHeatMaps: boolean;
  hasAdvancedFilters: boolean;
  maxPools: number;
  hasAdminDashboard: boolean;
  hasMemberExport: boolean;
  hasDisputeTools: boolean;
  hasAdvancedAnalytics: boolean;
  hasPrioritySupport: boolean;
  includesPoolAccess: boolean;
  trialDays: number | null;
}

interface UseSubscriptionResult {
  subscription: Subscription | null;
  features: FeatureAccess | null;
  loading: boolean;
  error: string | null;
  hasFeature: (feature: string) => boolean;
  isAtLeast: (tier: GZSportsTier) => boolean;
  trialDaysRemaining: number;
  refresh: () => Promise<void>;
  // Role info for components that need it
  effectiveRole: UserRole;
  isSuperAdmin: boolean;
}

// Full feature access for super admins - bypasses all subscription gates
const SUPER_ADMIN_FEATURES: FeatureAccess = {
  canBrowseScores: true,
  canViewPools: true,
  canSubmitPicks: true,
  scoutDailyCap: 999999,
  hasLiveCommentary: true,
  hasProactiveAlerts: true,
  aiPriority: 'priority',
  hasMultiGameCenter: true,
  hasCustomAlerts: true,
  hasHeatMaps: true,
  hasAdvancedFilters: true,
  maxPools: 999999,
  hasAdminDashboard: true,
  hasMemberExport: true,
  hasDisputeTools: true,
  hasAdvancedAnalytics: true,
  hasPrioritySupport: true,
  includesPoolAccess: true,
  trialDays: null,
};

const SUPER_ADMIN_SUBSCRIPTION: Subscription = {
  userId: 'super_admin',
  tier: 'scout_elite',
  productKey: 'super_admin',
  billingPeriod: null,
  status: 'active',
  isTrialing: false,
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  downgradeToProductKey: null,
};

export function useSubscription(): UseSubscriptionResult {
  const { effectiveRole } = useImpersonation();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [features, setFeatures] = useState<FeatureAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if current role is super_admin (bypasses all gates)
  const isSuperAdmin = effectiveRole === 'super_admin';

  const loadSubscription = async () => {
    try {
      const res = await fetch("/api/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setFeatures(data.features);
        setError(null);
      } else {
        setError("Failed to load subscription");
      }
    } catch (err) {
      console.error("Subscription load error:", err);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);
  
  // Memoize effective subscription/features based on role
  const effectiveSubscription = useMemo(() => {
    if (isSuperAdmin) return SUPER_ADMIN_SUBSCRIPTION;
    return subscription;
  }, [isSuperAdmin, subscription]);
  
  const effectiveFeatures = useMemo(() => {
    if (isSuperAdmin) return SUPER_ADMIN_FEATURES;
    return features;
  }, [isSuperAdmin, features]);

  const hasFeature = (feature: string): boolean => {
    // Super admin has all features
    if (isSuperAdmin) return true;
    
    if (!effectiveFeatures) return false;
    
    const featureMap: Record<string, boolean> = {
      pick_submission: effectiveFeatures.canSubmitPicks,
      live_commentary: effectiveFeatures.hasLiveCommentary,
      proactive_alerts: effectiveFeatures.hasProactiveAlerts,
      multi_game_center: effectiveFeatures.hasMultiGameCenter,
      custom_alerts: effectiveFeatures.hasCustomAlerts,
      heat_maps: effectiveFeatures.hasHeatMaps,
      advanced_filters: effectiveFeatures.hasAdvancedFilters,
      admin_dashboard: effectiveFeatures.hasAdminDashboard,
      // Live watching requires Pro+ (hasLiveCommentary is true for Pro/Elite)
      LIVE_WATCHING: effectiveFeatures.hasLiveCommentary,
    };
    
    return featureMap[feature] || false;
  };

  const isAtLeast = (tier: GZSportsTier): boolean => {
    // Super admin is always at the highest tier
    if (isSuperAdmin) return true;
    
    if (!effectiveSubscription) return false;
    
    const tierHierarchy: GZSportsTier[] = [
      'anonymous',
      'free',
      'pool_access',
      'scout_pro',
      'scout_elite',
    ];
    
    // Admin tiers are separate
    if (tier.startsWith('admin')) {
      return effectiveSubscription.tier === tier || effectiveSubscription.tier === 'admin_unlimited';
    }
    
    const userLevel = tierHierarchy.indexOf(effectiveSubscription.tier);
    const requiredLevel = tierHierarchy.indexOf(tier);
    
    return userLevel >= requiredLevel;
  };

  const getTrialDaysRemaining = (): number => {
    if (!effectiveSubscription?.trialEndsAt) return 0;
    const end = new Date(effectiveSubscription.trialEndsAt);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  };

  return {
    subscription: effectiveSubscription,
    features: effectiveFeatures,
    loading,
    error,
    hasFeature,
    isAtLeast,
    trialDaysRemaining: getTrialDaysRemaining(),
    refresh: loadSubscription,
    // Expose role info for components that need it
    effectiveRole,
    isSuperAdmin,
  };
}
