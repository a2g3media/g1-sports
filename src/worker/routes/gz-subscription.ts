/**
 * GZ Sports Subscription API Routes
 * 
 * Handles subscription management, feature access checks, and trial flows.
 */

import { Hono } from "hono";
import {
  getUserSubscription,
  getUserFeatureAccess,
  startTrial,
  cancelSubscription,
  calculatePoolAccessCredit,
  type GZSportsTier,
} from "../services/subscriptionService";
import { processReferralPayment } from "../services/referralService";

const app = new Hono<{
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    userId: string;
  };
}>();

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/subscription
 * Get current user's subscription and feature access
 */
app.get("/", async (c) => {
  const userId = c.get("userId");

  try {
    const subscription = await getUserSubscription(c.env.DB, userId);
    const features = await getUserFeatureAccess(c.env.DB, userId);

    // Get available products
    const products = await c.env.DB.prepare(`
      SELECT 
        product_key,
        name,
        tier_level,
        price_monthly_cents,
        price_annual_cents,
        billing_period,
        features_json
      FROM subscription_products
      WHERE is_active = 1
      ORDER BY tier_level ASC
    `).all();

    return c.json({
      subscription,
      features,
      products: products.results,
    });
  } catch (error) {
    console.error("Failed to fetch subscription:", error);
    return c.json({ error: "Failed to fetch subscription" }, 500);
  }
});

/**
 * GET /api/subscription/features
 * Get feature access for current user
 */
app.get("/features", async (c) => {
  const userId = c.get("userId");

  try {
    const features = await getUserFeatureAccess(c.env.DB, userId);
    return c.json({ features });
  } catch (error) {
    console.error("Failed to fetch features:", error);
    return c.json({ error: "Failed to fetch features" }, 500);
  }
});

/**
 * POST /api/subscription/trial/start
 * Start a trial subscription
 */
app.post("/trial/start", async (c) => {
  const userId = c.get("userId");
  const { productKey } = await c.req.json();

  if (!productKey) {
    return c.json({ error: "Product key required" }, 400);
  }

  try {
    const result = await startTrial(c.env.DB, userId, productKey);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    const subscription = await getUserSubscription(c.env.DB, userId);
    const features = await getUserFeatureAccess(c.env.DB, userId);

    return c.json({
      success: true,
      subscription,
      features,
    });
  } catch (error) {
    console.error("Failed to start trial:", error);
    return c.json({ error: "Failed to start trial" }, 500);
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel subscription (downgrade at period end)
 */
app.post("/cancel", async (c) => {
  const userId = c.get("userId");
  const { downgradeTo } = await c.req.json();

  try {
    const result = await cancelSubscription(c.env.DB, userId, downgradeTo);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    const subscription = await getUserSubscription(c.env.DB, userId);

    return c.json({
      success: true,
      subscription,
    });
  } catch (error) {
    console.error("Failed to cancel subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

/**
 * GET /api/subscription/pool-access-credit
 * Calculate Pool Access credit for upgrade
 */
app.get("/pool-access-credit", async (c) => {
  const userId = c.get("userId");

  try {
    const subscription = await getUserSubscription(c.env.DB, userId);

    if (subscription.tier !== 'pool_access') {
      return c.json({ creditCents: 0 });
    }

    const periodEnd = subscription.currentPeriodEnd 
      ? new Date(subscription.currentPeriodEnd)
      : null;

    const creditCents = calculatePoolAccessCredit(periodEnd);

    return c.json({
      creditCents,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error("Failed to calculate credit:", error);
    return c.json({ error: "Failed to calculate credit" }, 500);
  }
});

/**
 * POST /api/subscription/trial
 * Start a trial for a product (alias for trial/start)
 */
app.post("/trial", async (c) => {
  const userId = c.get("userId");
  const { productKey } = await c.req.json();

  if (!productKey) {
    return c.json({ error: "Product key required" }, 400);
  }

  try {
    const result = await startTrial(c.env.DB, userId, productKey);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    const subscription = await getUserSubscription(c.env.DB, userId);
    const features = await getUserFeatureAccess(c.env.DB, userId);

    return c.json({
      success: true,
      subscription,
      features,
    });
  } catch (error) {
    console.error("Failed to start trial:", error);
    return c.json({ error: "Failed to start trial" }, 500);
  }
});

/**
 * POST /api/subscription/checkout
 * Create checkout session (simulated for demo)
 */
app.post("/checkout", async (c) => {
  const userId = c.get("userId");
  
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  
  const body = await c.req.json().catch(() => ({}));
  const productKey = body?.productKey;

  if (!productKey) {
    return c.json({ error: "Product key required" }, 400);
  }

  try {
    // Check if product exists
    const product = await c.env.DB.prepare(`
      SELECT price_monthly_cents, billing_period
      FROM subscription_products
      WHERE product_key = ? AND is_active = 1
    `).bind(productKey).first<{ price_monthly_cents: number; billing_period: string }>();

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    // For demo: simulate successful subscription
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const billingPeriod = product.billing_period || 'monthly';

    // Check for existing subscription
    const existing = await c.env.DB.prepare(`
      SELECT id FROM user_subscriptions
      WHERE user_id = ? AND status IN ('active', 'trialing')
    `).bind(userId).first();

    if (existing) {
      // Update existing subscription
      await c.env.DB.prepare(`
        UPDATE user_subscriptions
        SET 
          product_key = ?,
          status = 'active',
          billing_period = ?,
          trial_ends_at = NULL,
          current_period_end = ?,
          cancel_at_period_end = 0,
          downgrade_to_product_key = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND status IN ('active', 'trialing')
      `).bind(productKey, billingPeriod, periodEnd.toISOString(), userId).run();
    } else {
      // Create new subscription
      await c.env.DB.prepare(`
        INSERT INTO user_subscriptions (
          user_id, product_key, status, billing_period,
          current_period_start, current_period_end
        ) VALUES (?, ?, 'active', ?, ?, ?)
      `).bind(
        userId,
        productKey,
        billingPeriod,
        now.toISOString(),
        periodEnd.toISOString()
      ).run();
    }

    const subscription = await getUserSubscription(c.env.DB, userId);
    const features = await getUserFeatureAccess(c.env.DB, userId);

    // Process referral reward if this user was referred
    // This triggers bonus days for the referrer on first paid upgrade
    let referralReward = null;
    try {
      const referralResult = await processReferralPayment(c.env.DB, userId);
      if (referralResult.rewardGranted) {
        referralReward = {
          referrerId: referralResult.referrerId,
          daysGranted: referralResult.daysGranted,
        };
        console.log(`Referral reward granted: ${referralResult.daysGranted} days to ${referralResult.referrerId}`);
      }
    } catch (referralError) {
      // Don't fail the checkout if referral processing fails
      console.error("Referral processing error (non-fatal):", referralError);
    }

    return c.json({ 
      success: true,
      subscription,
      features,
      referralReward,
    });
  } catch (error) {
    console.error("Failed to process checkout:", error);
    return c.json({ error: "Failed to process checkout" }, 500);
  }
});

/**
 * POST /api/subscription/reactivate
 * Reactivate a canceled subscription
 */
app.post("/reactivate", async (c) => {
  const userId = c.get("userId");

  try {
    // Check if there's a subscription pending cancellation
    const subscription = await c.env.DB.prepare(`
      SELECT id, current_period_end
      FROM user_subscriptions
      WHERE user_id = ? AND cancel_at_period_end = 1
    `).bind(userId).first<{ id: number; current_period_end: string }>();

    if (!subscription) {
      return c.json({ error: "No subscription to reactivate" }, 400);
    }

    // Check if still within the billing period
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd < new Date()) {
      return c.json({ error: "Subscription period has ended" }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE user_subscriptions
      SET 
        cancel_at_period_end = 0,
        downgrade_to_product_key = NULL,
        canceled_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(subscription.id).run();

    const updated = await getUserSubscription(c.env.DB, userId);
    const features = await getUserFeatureAccess(c.env.DB, userId);

    return c.json({ success: true, subscription: updated, features });
  } catch (error) {
    console.error("Failed to reactivate subscription:", error);
    return c.json({ error: "Failed to reactivate subscription" }, 500);
  }
});

/**
 * POST /api/subscription/simulate (Demo mode only)
 * Simulate subscription tier for testing
 */
app.post("/simulate", async (c) => {
  const userId = c.get("userId");
  const { tier } = await c.req.json();

  const validTiers: GZSportsTier[] = [
    'free',
    'pool_access',
    'scout_pro',
    'scout_elite',
    'admin_starter',
    'admin_unlimited',
  ];

  if (!tier || !validTiers.includes(tier)) {
    return c.json({ error: "Invalid tier" }, 400);
  }

  try {
    // Update simulated subscription in users table for demo mode
    await c.env.DB.prepare(`
      UPDATE users 
      SET simulated_subscription = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(tier, userId).run();

    const features = await getUserFeatureAccess(c.env.DB, userId);

    return c.json({
      success: true,
      tier,
      features,
    });
  } catch (error) {
    console.error("Failed to simulate subscription:", error);
    return c.json({ error: "Failed to simulate subscription" }, 500);
  }
});

export default app;
