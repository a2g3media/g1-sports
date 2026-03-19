/**
 * GZ Sports Feature Gate Middleware
 * 
 * Middleware to check feature access based on subscription tier.
 * Returns 403 with upgrade message if user lacks required feature.
 */

import { MiddlewareHandler } from "hono";
import { getUserFeatureAccess, type FeatureAccess } from "../services/subscriptionService";
import { getTodayEasternDateString } from "../services/dateUtils";

/**
 * Require specific feature access
 */
export function requireFeature(
  featureCheck: (features: FeatureAccess) => boolean,
  featureName: string
): MiddlewareHandler<{
  Bindings: { DB: D1Database };
  Variables: { userId: string };
}> {
  return async (c, next) => {
    const userId = c.get("userId");

    try {
      const features = await getUserFeatureAccess(c.env.DB, userId);
      const hasAccess = featureCheck(features);

      if (!hasAccess) {
        return c.json(
          {
            error: "Feature not available",
            message: `This feature requires ${featureName}. Please upgrade your subscription.`,
            featureName,
          },
          403
        );
      }

      await next();
    } catch (error) {
      console.error("Feature gate error:", error);
      return c.json({ error: "Failed to check feature access" }, 500);
    }
  };
}

/**
 * Require ability to submit picks (Pool Access or higher)
 */
export const requirePickSubmission = requireFeature(
  (f) => f.canSubmitPicks,
  "Pool Access or higher"
);

/**
 * Require live commentary (Coach G Pro or higher)
 */
export const requireLiveCommentary = requireFeature(
  (f) => f.hasLiveCommentary,
  "Coach G Pro or Elite"
);

/**
 * Require proactive alerts (Coach G Pro or higher)
 */
export const requireProactiveAlerts = requireFeature(
  (f) => f.hasProactiveAlerts,
  "Coach G Pro or Elite"
);

/**
 * Require multi-game center (Coach G Elite)
 */
export const requireMultiGameCenter = requireFeature(
  (f) => f.hasMultiGameCenter,
  "Coach G Elite"
);

/**
 * Require custom alerts (Coach G Elite)
 */
export const requireCustomAlerts = requireFeature(
  (f) => f.hasCustomAlerts,
  "Coach G Elite"
);

/**
 * Require admin dashboard (Admin tier)
 */
export const requireAdminDashboard = requireFeature(
  (f) => f.hasAdminDashboard,
  "Admin Starter or Unlimited"
);

/**
 * Check AI usage against daily cap
 * Soft cap for Free tier, enforced for all tiers
 */
export function checkAIUsageCap(): MiddlewareHandler<{
  Bindings: { DB: D1Database };
  Variables: { userId: string };
}> {
  return async (c, next) => {
    const userId = c.get("userId");

    try {
      const features = await getUserFeatureAccess(c.env.DB, userId);

      // Get today's AI usage
      const today = getTodayEasternDateString();
      const usage = await c.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM ai_event_log
        WHERE user_id = ?
          AND DATE(created_at) = ?
      `).bind(userId, today).first<{ count: number }>();

      const usageCount = usage?.count || 0;

      if (usageCount >= features.scoutDailyCap) {
        return c.json(
          {
            error: "Daily AI usage limit reached",
            message: "You've reached your daily Coach G AI limit. Upgrade for higher limits.",
            usageCount,
            dailyCap: features.scoutDailyCap,
          },
          429
        );
      }

      // Add usage info to response headers
      c.header('X-AI-Usage-Count', String(usageCount));
      c.header('X-AI-Daily-Cap', String(features.scoutDailyCap));
      c.header('X-AI-Usage-Remaining', String(features.scoutDailyCap - usageCount));

      await next();
    } catch (error) {
      console.error("AI usage cap check error:", error);
      // Don't block on error, just log it
      await next();
    }
  };
}
