import { useCallback } from "react";
import { useSubscription } from "./useSubscription";

type TriggerSource = 
  | "scores_page"
  | "command_center"
  | "heat_map"
  | "scout_cap"
  | "feature_gate"
  | "alert_center"
  | "custom_alerts"
  | "pool_access"
  | "settings"
  | "live_watcher"
  | "upgrade_modal"
  | "trial_offer"
  | "onboarding";

type TriggerContext = 
  | "elite_filters_locked"
  | "ai_limit_reached"
  | "live_commentary_locked"
  | "custom_rules_locked"
  | "priority_ai_locked"
  | "command_center_locked"
  | "heat_map_locked"
  | "pool_join_locked"
  | "pool_create_locked"
  | "trial_offer_prompt"
  | "tier_comparison"
  | "direct_upgrade";

type TriggerFeature = 
  | "advanced_filters"
  | "priority_ai"
  | "custom_alerts"
  | "command_center"
  | "heat_map"
  | "live_commentary"
  | "pool_access"
  | "unlimited_ai"
  | "proactive_alerts";

interface TrackUpgradeOptions {
  source: TriggerSource;
  context?: TriggerContext;
  feature?: TriggerFeature;
  toTier?: string;
}

export function useUpgradeTracking() {
  const { subscription } = useSubscription();
    const tier = subscription?.tier || 'FREE';
  
  const trackUpgradeTrigger = useCallback(async (options: TrackUpgradeOptions) => {
    const { source, context, feature, toTier } = options;
    
    try {
      await fetch("/api/upgrade/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_source: source,
          trigger_context: context,
          trigger_feature: feature,
          page_path: window.location.pathname,
          from_tier: tier,
          to_tier: toTier,
        }),
      });
    } catch (error) {
      // Silent fail - don't interrupt user flow for analytics
      console.debug("Upgrade tracking failed:", error);
    }
  }, [tier]);
  
  const trackUpgradeConversion = useCallback(async (toTier: string) => {
    try {
      await fetch("/api/upgrade/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_tier: toTier }),
      });
    } catch (error) {
      console.debug("Conversion tracking failed:", error);
    }
  }, []);
  
  return {
    trackUpgradeTrigger,
    trackUpgradeConversion,
  };
}
