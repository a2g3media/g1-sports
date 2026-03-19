/**
 * AI Interaction Tracking Routes
 * 
 * Handles soft cap checking and trial offer logic for free tier users.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { 
  trackAIInteraction, 
  getAIInteractionStats,
  markTrialOfferShown 
} from "../services/aiInteractionTracker";
import { getFeatureAccess, getUserSubscription } from "../services/subscriptionService";

const aiInteractionRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/ai/interaction-stats
 * Get current AI interaction stats for the user
 */
aiInteractionRouter.get("/interaction-stats", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const subscription = await getUserSubscription(db, user.id);
  const features = getFeatureAccess(subscription?.tier || "free");

  // Pro/Elite users have unlimited access
  if (features.scoutDailyCap === -1) {
    return c.json({
      hasUnlimitedAccess: true,
      todayCount: 0,
      dailyLimit: -1,
      hasReachedLimit: false,
      shouldShowTrialOffer: false,
      tier: subscription?.tier || "free",
    });
  }

  const stats = await getAIInteractionStats(db, user.id);
  
  return c.json({
    hasUnlimitedAccess: false,
    ...stats,
    tier: subscription?.tier || "free",
  });
});

/**
 * POST /api/ai/track-interaction
 * Track a Scout interaction and return updated stats
 */
aiInteractionRouter.post("/track-interaction", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const subscription = await getUserSubscription(db, user.id);
  const features = getFeatureAccess(subscription?.tier || "free");

  // Pro/Elite users have unlimited access - don't track
  if (features.scoutDailyCap === -1) {
    return c.json({
      hasUnlimitedAccess: true,
      allowed: true,
      todayCount: 0,
      dailyLimit: -1,
      hasReachedLimit: false,
      shouldShowTrialOffer: false,
    });
  }

  const stats = await trackAIInteraction(db, user.id);
  
  return c.json({
    hasUnlimitedAccess: false,
    allowed: !stats.hasReachedLimit,
    ...stats,
  });
});

/**
 * POST /api/ai/dismiss-trial-offer
 * Mark that user has seen trial offer
 */
aiInteractionRouter.post("/dismiss-trial-offer", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await markTrialOfferShown(c.env.DB, user.id);
  
  return c.json({ success: true });
});

export { aiInteractionRouter };
