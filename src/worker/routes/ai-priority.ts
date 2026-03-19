/**
 * AI Priority Monitoring Routes
 * 
 * Provides endpoints for monitoring AI tier status, usage stats, and performance metrics.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  getAIPriorityRouting,
  getUserAIStats,
  getAggregatedMetrics,
  getTierDisplay,
  getQueuePosition,
  type AITier,
} from "../services/aiPriorityRouter";

const aiPriorityRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/ai/priority/status
 * Get current user's AI tier status and configuration
 */
aiPriorityRouter.get("/status", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  
  try {
    const routing = await getAIPriorityRouting(db, user.id);
    const stats = await getUserAIStats(db, user.id, 30);
    const display = getTierDisplay(routing.tier);
    const queuePosition = getQueuePosition(routing);

    return c.json({
      tier: routing.tier,
      display,
      config: {
        model: routing.model,
        maxTokens: routing.maxTokens,
        rateLimitPerMinute: routing.rateLimitPerMinute,
        responseDepth: routing.responseDepth,
        sessionMemoryEnabled: routing.sessionMemoryEnabled,
        multiGameContext: routing.multiGameContext,
        queuePriority: routing.queuePriority,
      },
      stats: {
        requestsLast30Days: stats.requestCount,
        lastRequestAt: stats.lastRequestAt?.toISOString() || null,
        avgResponseTimeMs: Math.round(stats.avgResponseTimeMs),
      },
      queuePosition,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting AI priority status:", error);
    return c.json({ error: "Failed to get status" }, 500);
  }
});

/**
 * GET /api/ai/priority/stats
 * Get user's AI usage statistics
 */
aiPriorityRouter.get("/stats", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const daysBack = parseInt(c.req.query("days") || "30");
  
  try {
    const stats = await getUserAIStats(db, user.id, Math.min(daysBack, 90));
    const routing = await getAIPriorityRouting(db, user.id);

    // Get recent request breakdown
    const { results: recentRequests } = await db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        persona
      FROM ai_event_log
      WHERE user_id = ?
        AND created_at > datetime('now', '-' || ? || ' days')
      GROUP BY DATE(created_at), persona
      ORDER BY date DESC
    `).bind(user.id, daysBack.toString()).all();

    // Group by date
    const byDate: Record<string, { total: number; byPersona: Record<string, number> }> = {};
    recentRequests.forEach((row: any) => {
      if (!byDate[row.date]) {
        byDate[row.date] = { total: 0, byPersona: {} };
      }
      byDate[row.date].total += row.count;
      byDate[row.date].byPersona[row.persona] = row.count;
    });

    return c.json({
      tier: routing.tier,
      summary: {
        totalRequests: stats.requestCount,
        lastRequestAt: stats.lastRequestAt?.toISOString() || null,
        avgResponseTimeMs: Math.round(stats.avgResponseTimeMs),
      },
      dailyBreakdown: byDate,
      period: `${daysBack} days`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting AI stats:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

/**
 * GET /api/ai/priority/comparison
 * Get tier comparison data for upgrade prompts
 */
aiPriorityRouter.get("/comparison", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  
  try {
    const routing = await getAIPriorityRouting(db, user.id);
    const currentDisplay = getTierDisplay(routing.tier);

    const tiers: Array<{
      tier: AITier;
      display: ReturnType<typeof getTierDisplay>;
      features: string[];
      limitations: string[];
      recommended: boolean;
    }> = [
      {
        tier: 'free',
        display: getTierDisplay('free'),
        features: [
          'Basic sports information',
          'Schedule and scores',
          '10 questions per day',
        ],
        limitations: [
          'Concise responses only',
          'No session memory',
          'Standard processing queue',
        ],
        recommended: false,
      },
      {
        tier: 'pro',
        display: getTierDisplay('pro'),
        features: [
          'Full contextual analysis',
          'Injury and weather reports',
          'Line movement tracking',
          '30 requests per minute',
        ],
        limitations: [
          'No multi-game context',
          'No conversation memory',
        ],
        recommended: routing.tier === 'free',
      },
      {
        tier: 'elite',
        display: getTierDisplay('elite'),
        features: [
          'Premium GPT-4o model',
          'Deep multi-factor analysis',
          'Session memory (remembers context)',
          'Multi-game comparison',
          'Priority processing queue',
          'Watched games integration',
          'Followed teams prioritization',
          '100 requests per minute',
        ],
        limitations: [],
        recommended: routing.tier === 'pro',
      },
    ];

    return c.json({
      currentTier: routing.tier,
      currentDisplay,
      tiers,
      upgradeMessage: routing.tier === 'free'
        ? 'Upgrade to Pro for full contextual analysis and faster responses.'
        : routing.tier === 'pro'
          ? 'Upgrade to Elite for premium AI model, session memory, and priority processing.'
          : 'You have access to all Elite features.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting tier comparison:", error);
    return c.json({ error: "Failed to get comparison" }, 500);
  }
});

/**
 * GET /api/ai/priority/metrics
 * Get aggregated platform metrics (admin only)
 */
aiPriorityRouter.get("/metrics", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const hoursBack = parseInt(c.req.query("hours") || "24");
  
  // Check if user is admin
  const adminCheck = await db.prepare(`
    SELECT product_key FROM user_subscriptions
    WHERE user_id = ? AND product_key = 'admin' AND status = 'active'
  `).bind(user.id).first();
  
  if (!adminCheck) {
    return c.json({ error: "Admin access required" }, 403);
  }
  
  try {
    const metrics = await getAggregatedMetrics(db, hoursBack);

    // Get additional breakdown
    const { results: topUsers } = await db.prepare(`
      SELECT 
        user_id,
        tier,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time
      FROM ai_routing_metrics
      WHERE created_at > datetime('now', '-' || ? || ' hours')
      GROUP BY user_id
      ORDER BY request_count DESC
      LIMIT 10
    `).bind(hoursBack.toString()).all();

    const { results: errorBreakdown } = await db.prepare(`
      SELECT 
        error_type,
        COUNT(*) as count
      FROM ai_routing_metrics
      WHERE error_type IS NOT NULL
        AND created_at > datetime('now', '-' || ? || ' hours')
      GROUP BY error_type
      ORDER BY count DESC
    `).bind(hoursBack.toString()).all();

    return c.json({
      period: `${hoursBack} hours`,
      summary: {
        totalRequests: metrics.totalRequests,
        queueDepth: metrics.queueDepth,
      },
      byTier: metrics.byTier,
      topUsers: topUsers.map((u: any) => ({
        userId: u.user_id,
        tier: u.tier,
        requests: u.request_count,
        avgResponseMs: Math.round(u.avg_response_time || 0),
      })),
      errors: errorBreakdown,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting AI metrics:", error);
    return c.json({ error: "Failed to get metrics" }, 500);
  }
});

export { aiPriorityRouter };
