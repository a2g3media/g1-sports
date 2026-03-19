/**
 * Paywall Events API
 * 
 * Records paywall/upgrade funnel events for analytics.
 * No PII or sensitive content is stored.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

type Variables = {
  userId?: string;
};

const paywallEventsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// Auth middleware for tracking - anonymous users tracked as "anonymous"
paywallEventsRouter.use("/metrics", authMiddleware);

// Record a paywall event
paywallEventsRouter.post("/", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId") || "anonymous";
  
  try {
    const body = await c.req.json();
    
    const {
      event_type,      // upgrade_prompt_shown, upgrade_cta_clicked, paywall_dismissed, ai_cap_hit, locked_feature_clicked
      reason_code,     // AI_CAP_REACHED, FEATURE_LOCKED, TRIAL_EXPIRED, PLAN_REQUIRED, LIMIT_EXCEEDED
      screen_name,     // dashboard, scores, command_center, scout_panel, etc.
      feature_key,     // advanced_filters, priority_ai, custom_alerts, etc.
      plan_required,   // pool_access, scout_pro, scout_elite
      cap_type: _cap_type,        // daily, weekly, monthly
      remaining: _remaining,       // number remaining (0 for cap hit)
      from_tier,       // user's current tier
      to_tier,         // target tier if clicking upgrade
      page_path,       // current URL path
      timestamp: _timestamp,       // client timestamp
    } = body;
    
    // Validate required fields
    if (!event_type || !reason_code || !screen_name) {
      return c.json({ error: "Missing required fields: event_type, reason_code, screen_name" }, 400);
    }
    
    // Store in upgrade_events table (reuse existing table with extended fields)
    await db.prepare(`
      INSERT INTO upgrade_events (
        user_id,
        from_tier,
        to_tier,
        trigger_source,
        trigger_context,
        trigger_feature,
        page_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      from_tier || null,
      to_tier || plan_required || null,
      event_type,           // trigger_source = event_type
      reason_code,          // trigger_context = reason_code
      feature_key || null,  // trigger_feature = feature_key
      page_path || null
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to record paywall event:", error);
    return c.json({ error: "Failed to record event" }, 500);
  }
});

// Get aggregate paywall metrics (admin only)
paywallEventsRouter.get("/metrics", authMiddleware, async (c) => {
  const db = c.env.DB;
  
  // Get event counts by type for last 7 days
  const { results: eventCounts } = await db.prepare(`
    SELECT 
      trigger_source as event_type,
      trigger_context as reason_code,
      COUNT(*) as count
    FROM upgrade_events
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY trigger_source, trigger_context
    ORDER BY count DESC
  `).all();
  
  // Get top blocked features
  const { results: topFeatures } = await db.prepare(`
    SELECT 
      trigger_feature as feature_key,
      COUNT(*) as count
    FROM upgrade_events
    WHERE trigger_feature IS NOT NULL
      AND created_at >= datetime('now', '-7 days')
    GROUP BY trigger_feature
    ORDER BY count DESC
    LIMIT 10
  `).all();
  
  // Get conversion rate
  const conversionStats = await db.prepare(`
    SELECT 
      COUNT(*) as total_prompts,
      SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as conversions
    FROM upgrade_events
    WHERE created_at >= datetime('now', '-7 days')
  `).first<{ total_prompts: number; conversions: number }>();
  
  return c.json({
    eventCounts,
    topFeatures,
    conversion: conversionStats ? {
      total: conversionStats.total_prompts,
      converted: conversionStats.conversions,
      rate: conversionStats.total_prompts > 0 
        ? (conversionStats.conversions / conversionStats.total_prompts * 100).toFixed(1) + "%"
        : "0%"
    } : null,
  });
});

export { paywallEventsRouter };
