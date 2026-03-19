/**
 * Referral System API Routes
 * 
 * Endpoints:
 * - GET /api/referrals/stats - Get user's referral stats and code
 * - GET /api/referrals/code - Get just the referral code
 * - POST /api/referrals/validate - Validate a referral code (for signup flow)
 * - POST /api/referrals/record - Record a referral (called during signup)
 * - POST /api/referrals/process-payment - Process referral reward (called from payment webhook)
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  getOrCreateReferralCode,
  lookupReferralCode,
  recordReferral,
  processReferralPayment,
  getReferralStats,
  checkBonusDays,
  REFERRAL_CONFIG
} from "../services/referralService";

type Bindings = {
  DB: D1Database;
};

type Variables = {
  userId?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /stats - Get referral stats for authenticated user
 */
app.get("/stats", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const stats = await getReferralStats(c.env.DB, userId);
    const bonusDays = await checkBonusDays(c.env.DB, userId);

    return c.json({
      success: true,
      data: {
        ...stats,
        config: REFERRAL_CONFIG,
        bonusDaysActive: bonusDays.available
      }
    });
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return c.json({ error: "Failed to get referral stats" }, 500);
  }
});

/**
 * GET /code - Get user's referral code (creates if doesn't exist)
 */
app.get("/code", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { code, isNew } = await getOrCreateReferralCode(c.env.DB, userId);
    
    return c.json({
      success: true,
      data: {
        code,
        isNew,
        shareUrl: `${new URL(c.req.url).origin}/signup?ref=${code}`
      }
    });
  } catch (error) {
    console.error("Error getting referral code:", error);
    return c.json({ error: "Failed to get referral code" }, 500);
  }
});

/**
 * POST /validate - Validate a referral code (public endpoint for signup flow)
 */
app.post("/validate", async (c) => {
  try {
    const { code } = await c.req.json<{ code: string }>();
    
    if (!code || typeof code !== "string") {
      return c.json({ success: false, valid: false, error: "Code is required" }, 400);
    }

    const referrer = await lookupReferralCode(c.env.DB, code);
    
    return c.json({
      success: true,
      valid: referrer !== null,
      // Don't expose referrer details for privacy
    });
  } catch (error) {
    console.error("Error validating referral code:", error);
    return c.json({ error: "Failed to validate code" }, 500);
  }
});

/**
 * POST /record - Record a referral (called during/after signup)
 * Should be called with the newly created user's auth
 */
app.post("/record", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { code } = await c.req.json<{ code: string }>();
    
    if (!code || typeof code !== "string") {
      return c.json({ success: false, error: "Referral code is required" }, 400);
    }

    const result = await recordReferral(c.env.DB, userId, code);
    
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, message: "Referral recorded" });
  } catch (error) {
    console.error("Error recording referral:", error);
    return c.json({ error: "Failed to record referral" }, 500);
  }
});

/**
 * POST /process-payment - Process referral reward after successful payment
 * This would typically be called from a payment webhook handler
 * In production, this should be secured (internal only or with webhook signature)
 */
app.post("/process-payment", async (c) => {
  try {
    const { userId } = await c.req.json<{ 
      userId: string;
      webhookSecret?: string;
    }>();
    
    // Basic security check - in production, verify webhook signature
    // For now, we just check the user exists
    if (!userId) {
      return c.json({ success: false, error: "User ID is required" }, 400);
    }

    const result = await processReferralPayment(c.env.DB, userId);
    
    return c.json({
      success: true,
      data: {
        rewardGranted: result.rewardGranted,
        daysGranted: result.daysGranted || 0,
        referrerId: result.referrerId ? "[redacted]" : null // Don't expose referrer ID
      }
    });
  } catch (error) {
    console.error("Error processing referral payment:", error);
    return c.json({ error: "Failed to process referral payment" }, 500);
  }
});

/**
 * GET /bonus-days - Check user's bonus days status
 */
app.get("/bonus-days", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const bonusDays = await checkBonusDays(c.env.DB, userId);
    
    return c.json({
      success: true,
      data: bonusDays
    });
  } catch (error) {
    console.error("Error checking bonus days:", error);
    return c.json({ error: "Failed to check bonus days" }, 500);
  }
});

/**
 * GET /config - Get referral program configuration (public)
 */
app.get("/config", async (c) => {
  return c.json({
    success: true,
    data: {
      ...REFERRAL_CONFIG,
      description: `Earn ${REFERRAL_CONFIG.daysPerReferral} free Pro days for each friend who upgrades (max ${REFERRAL_CONFIG.maxBonusDays} days)`
    }
  });
});

export default app;
