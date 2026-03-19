/**
 * Paywall Event Tracker
 * 
 * Tracks upgrade-related events with throttling to prevent duplicate events.
 * No PII or sensitive content is logged.
 */

// Standardized reason codes
export type PaywallReason = 
  | "AI_CAP_REACHED"
  | "FEATURE_LOCKED"
  | "TRIAL_EXPIRED"
  | "PLAN_REQUIRED"
  | "LIMIT_EXCEEDED";

export type PaywallEvent = 
  | "upgrade_prompt_shown"
  | "upgrade_cta_clicked"
  | "paywall_dismissed"
  | "ai_cap_hit"
  | "locked_feature_clicked";

export type CapType = "daily" | "weekly" | "monthly";

export interface PaywallEventPayload {
  event: PaywallEvent;
  reason: PaywallReason;
  screen_name: string;
  feature_key?: string;
  plan_required?: string;
  cap_type?: CapType;
  remaining?: number;
  from_tier?: string;
  to_tier?: string;
}

// Throttle state: Map of "event:reason:screen" -> last fire timestamp
const throttleMap = new Map<string, number>();
const THROTTLE_MS = 3000; // 3 second throttle per unique event combination

/**
 * Get throttle key for deduplication
 */
function getThrottleKey(payload: PaywallEventPayload): string {
  return `${payload.event}:${payload.reason}:${payload.screen_name}:${payload.feature_key || ""}`;
}

/**
 * Check if event should be throttled
 */
function shouldThrottle(key: string): boolean {
  const lastFired = throttleMap.get(key);
  if (!lastFired) return false;
  return Date.now() - lastFired < THROTTLE_MS;
}

/**
 * Track a paywall event with throttling
 */
export async function trackPaywallEvent(payload: PaywallEventPayload): Promise<void> {
  const throttleKey = getThrottleKey(payload);
  
  // Check throttle
  if (shouldThrottle(throttleKey)) {
    console.debug("[PaywallTracker] Throttled:", payload.event, payload.reason);
    return;
  }
  
  // Update throttle map
  throttleMap.set(throttleKey, Date.now());
  
  // Log in dev
  if (import.meta.env.DEV) {
    console.log("[PaywallTracker]", payload.event, {
      reason: payload.reason,
      screen: payload.screen_name,
      feature: payload.feature_key,
      plan: payload.plan_required,
    });
  }
  
  // Send to backend
  try {
    await fetch("/api/paywall-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_type: payload.event,
        reason_code: payload.reason,
        screen_name: payload.screen_name,
        feature_key: payload.feature_key || null,
        plan_required: payload.plan_required || null,
        cap_type: payload.cap_type || null,
        remaining: payload.remaining ?? null,
        from_tier: payload.from_tier || null,
        to_tier: payload.to_tier || null,
        page_path: window.location.pathname,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    // Silent fail - don't interrupt user experience for analytics
    console.debug("[PaywallTracker] Failed to send event:", error);
  }
}

// Convenience functions for specific events

export function trackUpgradePromptShown(options: {
  reason: PaywallReason;
  screenName: string;
  featureKey?: string;
  planRequired?: string;
  fromTier?: string;
}): void {
  trackPaywallEvent({
    event: "upgrade_prompt_shown",
    reason: options.reason,
    screen_name: options.screenName,
    feature_key: options.featureKey,
    plan_required: options.planRequired,
    from_tier: options.fromTier,
  });
}

export function trackUpgradeCtaClicked(options: {
  reason: PaywallReason;
  screenName: string;
  featureKey?: string;
  toTier?: string;
}): void {
  trackPaywallEvent({
    event: "upgrade_cta_clicked",
    reason: options.reason,
    screen_name: options.screenName,
    feature_key: options.featureKey,
    to_tier: options.toTier,
  });
}

export function trackPaywallDismissed(options: {
  reason: PaywallReason;
  screenName: string;
  featureKey?: string;
}): void {
  trackPaywallEvent({
    event: "paywall_dismissed",
    reason: options.reason,
    screen_name: options.screenName,
    feature_key: options.featureKey,
  });
}

export function trackAiCapHit(options: {
  capType: CapType;
  screenName: string;
  fromTier?: string;
}): void {
  trackPaywallEvent({
    event: "ai_cap_hit",
    reason: "AI_CAP_REACHED",
    screen_name: options.screenName,
    cap_type: options.capType,
    remaining: 0,
    from_tier: options.fromTier,
  });
}

export function trackLockedFeatureClicked(options: {
  featureKey: string;
  planRequired: string;
  screenName: string;
  fromTier?: string;
}): void {
  trackPaywallEvent({
    event: "locked_feature_clicked",
    reason: "FEATURE_LOCKED",
    screen_name: options.screenName,
    feature_key: options.featureKey,
    plan_required: options.planRequired,
    from_tier: options.fromTier,
  });
}
