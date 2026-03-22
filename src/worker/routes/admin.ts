import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { superAdminMiddleware, logAuditEvent, getPlatformUser } from "../middleware/rbac";
import { parseRoles } from "../../shared/rbac";
import { checkAllSourcesFreshness } from "../services/data-freshness-service";
import { POOL_TYPE_CATALOG, buildLegacyAllowedSettings } from "../../shared/poolTypeCatalog";

const adminRouter = new Hono<{ Bindings: Env }>();

// Demo mode check - allows testing admin panel without real super admin auth
const isDemoMode = (c: any) => c.req.header("X-Demo-Mode") === "true";

// Demo data generators
const generateDemoOverview = () => ({
  totalUsers: 1247,
  activeUsers7d: 834,
  totalPools: 156,
  activePools: 89,
  poolsBySport: [
    { sport: "NFL", count: 45 },
    { sport: "NBA", count: 32 },
    { sport: "MLB", count: 28 },
    { sport: "NHL", count: 18 },
    { sport: "NCAAB", count: 33 },
  ],
  avgPoolSize: 8.3,
  subscriptionBreakdown: { free: 892, trial: 145, paid: 187, expired: 23 },
  health: {
    sportsDataFeeds: { status: "OK", delayedCount: 0 },
    pushNotifications: { status: "OK", failureCount: 2 },
    escrowWebhooks: { status: "OK", failureCount: 0 },
    appErrors: { count24h: 5 },
  },
});

const generateDemoPools = () => ({
  pools: [
    { id: 1, name: "Office NFL Pool 2025", sport_key: "nfl", format_key: "pick_em", season: "2025", is_active: 1, member_count: 24, owner_emails: "john@example.com", created_at: "2025-09-01T10:00:00Z", entry_fee_cents: 2500 },
    { id: 2, name: "Fantasy Basketball League", sport_key: "nba", format_key: "fantasy", season: "2025-26", is_active: 1, member_count: 12, owner_emails: "sarah@example.com", created_at: "2025-10-15T14:30:00Z", entry_fee_cents: 5000 },
    { id: 3, name: "March Madness Bracket", sport_key: "ncaab", format_key: "bracket", season: "2026", is_active: 1, member_count: 64, owner_emails: "mike@example.com", created_at: "2026-02-01T09:00:00Z", entry_fee_cents: 1000 },
    { id: 4, name: "Hockey Playoff Pool", sport_key: "nhl", format_key: "playoff", season: "2025-26", is_active: 0, member_count: 16, owner_emails: "lisa@example.com", created_at: "2025-04-10T11:00:00Z", entry_fee_cents: 2000 },
    { id: 5, name: "Baseball Survivor", sport_key: "mlb", format_key: "survivor", season: "2025", is_active: 0, member_count: 32, owner_emails: "tom@example.com", created_at: "2025-03-28T08:00:00Z", entry_fee_cents: 1500 },
  ],
  hasMore: false,
  page: 1,
  limit: 50,
});

const generateDemoUsers = () => ({
  users: [
    { id: "user_1", email: "john@example.com", display_name: "John Smith", status: "active", subscription_status: "paid", roles: ["pool_admin"], pools_joined: 3, pools_managed: 1, created_at: "2024-09-15T10:00:00Z", last_active_at: "2026-02-16T08:30:00Z" },
    { id: "user_2", email: "sarah@example.com", display_name: "Sarah Johnson", status: "active", subscription_status: "paid", roles: ["pool_admin"], pools_joined: 2, pools_managed: 1, created_at: "2024-10-01T14:00:00Z", last_active_at: "2026-02-15T19:45:00Z" },
    { id: "user_3", email: "mike@example.com", display_name: "Mike Williams", status: "active", subscription_status: "trial", roles: ["pool_admin"], pools_joined: 4, pools_managed: 2, created_at: "2025-01-20T09:30:00Z", last_active_at: "2026-02-16T12:00:00Z" },
    { id: "user_4", email: "lisa@example.com", display_name: "Lisa Brown", status: "active", subscription_status: "free", roles: [], pools_joined: 1, pools_managed: 0, created_at: "2025-06-10T16:00:00Z", last_active_at: "2026-02-14T21:15:00Z" },
    { id: "user_5", email: "tom@example.com", display_name: "Tom Davis", status: "active", subscription_status: "paid", roles: ["pool_admin"], pools_joined: 5, pools_managed: 1, created_at: "2024-08-05T11:00:00Z", last_active_at: "2026-02-16T10:30:00Z" },
  ],
  hasMore: false,
  total: 1247,
  page: 1,
  limit: 50,
});

const generateDemoLedger = () => ({
  transactions: [
    { id: 1, user_id: "user_1", user_email: "john@example.com", user_name: "John Smith", league_id: 1, pool_name: "Office NFL Pool 2025", amount_cents: 2500, status: "completed", intent_type: "pool_entry", created_at: "2025-09-02T10:15:00Z" },
    { id: 2, user_id: "user_2", user_email: "sarah@example.com", user_name: "Sarah Johnson", league_id: 2, pool_name: "Fantasy Basketball League", amount_cents: 5000, status: "completed", intent_type: "pool_entry", created_at: "2025-10-16T15:00:00Z" },
    { id: 3, user_id: "user_3", user_email: "mike@example.com", user_name: "Mike Williams", league_id: 3, pool_name: "March Madness Bracket", amount_cents: 1000, status: "pending", intent_type: "pool_entry", created_at: "2026-02-02T09:30:00Z" },
    { id: 4, user_id: "user_1", user_email: "john@example.com", user_name: "John Smith", league_id: null, pool_name: null, amount_cents: 999, status: "completed", intent_type: "subscription", created_at: "2025-09-01T08:00:00Z" },
    { id: 5, user_id: "user_5", user_email: "tom@example.com", user_name: "Tom Davis", league_id: 5, pool_name: "Baseball Survivor", amount_cents: 1500, status: "refunded", intent_type: "pool_entry", created_at: "2025-04-01T12:00:00Z" },
  ],
  hasMore: false,
  page: 1,
  limit: 50,
  summary: { totalCollectedCents: 850000, totalPendingCents: 15000, totalFailedCents: 2500, totalCount: 342 },
});

const generateDemoMetrics = () => ({
  usersByTier: [
    { tier: "free", count: 892, percentage: 71.5 },
    { tier: "pool_access", count: 145, percentage: 11.6 },
    { tier: "pro", count: 147, percentage: 11.8 },
    { tier: "elite", count: 63, percentage: 5.1 },
  ],
  aiMetrics: [
    { tier: "free", requests: 1240, avgTokens: 450, estimatedCost: 5.58 },
    { tier: "pro", requests: 3420, avgTokens: 680, estimatedCost: 23.26 },
    { tier: "elite", requests: 1890, avgTokens: 920, estimatedCost: 17.39 },
  ],
  pushMetrics: [
    { tier: "free", sent: 2340, suppressed: 890, bundled: 120, blockedByCaps: 45, deliveryRate: 94.2 },
    { tier: "pro", sent: 5680, suppressed: 234, bundled: 89, blockedByCaps: 12, deliveryRate: 97.8 },
    { tier: "elite", sent: 2890, suppressed: 67, bundled: 23, blockedByCaps: 0, deliveryRate: 99.1 },
  ],
  conversionFunnel: [
    { from: "free", to: "pro", count: 45, rate: 5.0 },
    { from: "free", to: "pool_access", count: 67, rate: 7.5 },
    { from: "pool_access", to: "pro", count: 23, rate: 15.9 },
    { from: "pro", to: "elite", count: 12, rate: 8.2 },
  ],
  revenueByTier: [
    { tier: "pool_access", mrr: 1208, userCount: 145, arpu: 8.33 },
    { tier: "pro", mrr: 2205, userCount: 147, arpu: 15.00 },
    { tier: "elite", mrr: 1575, userCount: 63, arpu: 25.00 },
  ],
  heavyUsers: [
    { userId: "user_3", email: "mike@example.com", tier: "elite", aiRequests24h: 89, tokenUsage24h: 78500, estimatedCost: 0.79 },
    { userId: "user_1", email: "john@example.com", tier: "pro", aiRequests24h: 67, tokenUsage24h: 54200, estimatedCost: 0.54 },
  ],
  upgradeTriggers: [
    { source: "feature_gate", feature: "coach_g_pro", impressions: 1240, conversions: 67, conversionRate: 5.4 },
    { source: "soft_cap", feature: "ai_limit", impressions: 890, conversions: 45, conversionRate: 5.1 },
  ],
  topCTAs: [
    { source: "upgrade_modal", context: "coach_g", pagePath: "/coach", shown: 456, converted: 34, rate: 7.5 },
    { source: "inline_gate", context: "lines_center", pagePath: "/lines", shown: 234, converted: 12, rate: 5.1 },
  ],
  totals: { totalUsers: 1247, activeUsers24h: 423, totalAIRequests24h: 6550, totalPushSent24h: 10910, totalMRR: 4988, estimatedAICost24h: 46.23 },
});

const generateDemoNotificationsHealth = () => ({
  summary: { totalSent: 45230, totalFailed: 234, deliveryRate: 99.5 },
  channelBreakdown: [
    { channel: "push", total: 32450, sent: 32200, failed: 145, rate: 99.2 },
    { channel: "email", total: 12500, sent: 12420, failed: 80, rate: 99.4 },
    { channel: "sms", total: 280, sent: 271, failed: 9, rate: 96.8 },
  ],
  recentFailures: [],
});

const generateDemoAuditTimeline = () => ({
  events: [
    { id: 1, event_type: "user_joined_pool", entity_type: "pool", entity_id: "1", actor_email: "john@example.com", pool_name: "Office NFL Pool 2025", reason: "User joined pool", created_at: "2026-02-16T10:30:00Z" },
    { id: 2, event_type: "pick_submitted", entity_type: "pick", entity_id: "123", actor_email: "sarah@example.com", pool_name: "Fantasy Basketball League", reason: "Weekly picks submitted", created_at: "2026-02-16T09:15:00Z" },
    { id: 3, event_type: "payment_completed", entity_type: "transaction", entity_id: "456", actor_email: "mike@example.com", pool_name: "March Madness Bracket", reason: "Entry fee paid", created_at: "2026-02-15T14:00:00Z" },
  ],
  hasMore: false,
  page: 1,
  limit: 50,
});

// All admin routes require authentication + super admin role
// Demo mode check is done in individual handlers to return mock data
adminRouter.use("*", async (c, next) => {
  // Allow demo mode to bypass auth entirely
  if (isDemoMode(c)) {
    return next();
  }
  // Otherwise require real auth + super admin
  // Use sequential middleware pattern
  let authPassed = false;
  let adminPassed = false;
  
  const authResult = await authMiddleware(c, async () => {
    authPassed = true;
  });
  
  if (!authPassed) return authResult as Response;
  
  const superAdminResult = await superAdminMiddleware(c, async () => {
    adminPassed = true;
  });
  
  if (!adminPassed) return superAdminResult as Response;
  
  return next();
});

// ============ Overview (Executive Health Dashboard) ============

adminRouter.get("/overview", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoOverview());
  }
  
  const db = c.env.DB;
  const platformUser = getPlatformUser(c);
  
  // Total users
  const totalUsersResult = await db.prepare(`
    SELECT COUNT(*) as count FROM users
  `).first<{ count: number }>();
  
  // Active users (7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activeUsersResult = await db.prepare(`
    SELECT COUNT(*) as count FROM users WHERE last_active_at >= ? OR created_at >= ?
  `).bind(sevenDaysAgo, sevenDaysAgo).first<{ count: number }>();
  
  // Total pools
  const totalPoolsResult = await db.prepare(`
    SELECT COUNT(*) as count FROM leagues
  `).first<{ count: number }>();
  
  // Active pools
  const activePoolsResult = await db.prepare(`
    SELECT COUNT(*) as count FROM leagues WHERE is_active = 1
  `).first<{ count: number }>();
  
  // Pools by sport
  const { results: poolsBySport } = await db.prepare(`
    SELECT sport_key as sport, COUNT(*) as count 
    FROM leagues 
    GROUP BY sport_key 
    ORDER BY count DESC 
    LIMIT 5
  `).all();
  
  // Average pool size
  const avgPoolSizeResult = await db.prepare(`
    SELECT AVG(member_count) as avg FROM (
      SELECT COUNT(*) as member_count FROM league_members GROUP BY league_id
    )
  `).first<{ avg: number }>();
  
  // Subscription breakdown
  const { results: subscriptionResults } = await db.prepare(`
    SELECT subscription_status, COUNT(*) as count 
    FROM users 
    GROUP BY subscription_status
  `).all();
  
  const subscriptionBreakdown = {
    free: 0,
    trial: 0,
    paid: 0,
    expired: 0,
  };
  
  for (const row of subscriptionResults) {
    const status = (row.subscription_status as string) || "free";
    if (status in subscriptionBreakdown) {
      subscriptionBreakdown[status as keyof typeof subscriptionBreakdown] = row.count as number;
    }
  }
  
  // Notification failures (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const notifFailuresResult = await db.prepare(`
    SELECT COUNT(*) as count FROM notification_deliveries 
    WHERE status = 'failed' AND created_at >= ?
  `).bind(oneDayAgo).first<{ count: number }>();
  
  // Payment webhook failures (last 24h)
  const webhookFailuresResult = await db.prepare(`
    SELECT COUNT(*) as count FROM transaction_ledger 
    WHERE status = 'failed' AND created_at >= ?
  `).bind(oneDayAgo).first<{ count: number }>();
  
  // App errors (event_log errors in last 24h)
  const appErrorsResult = await db.prepare(`
    SELECT COUNT(*) as count FROM event_log 
    WHERE event_type LIKE '%error%' AND created_at >= ?
  `).bind(oneDayAgo).first<{ count: number }>();
  
  // Log the admin view
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "system",
      actionType: "admin_viewed_overview",
      summary: "Super Admin viewed platform overview",
    });
  }
  
  return c.json({
    totalUsers: totalUsersResult?.count || 0,
    activeUsers7d: activeUsersResult?.count || 0,
    totalPools: totalPoolsResult?.count || 0,
    activePools: activePoolsResult?.count || 0,
    poolsBySport: poolsBySport.map(p => ({
      sport: (p.sport as string || "").toUpperCase(),
      count: p.count as number,
    })),
    avgPoolSize: Math.round((avgPoolSizeResult?.avg || 0) * 10) / 10,
    subscriptionBreakdown,
    health: {
      sportsDataFeeds: {
        status: "OK",
        delayedCount: 0,
      },
      pushNotifications: {
        status: (notifFailuresResult?.count || 0) > 10 ? "DEGRADED" : "OK",
        failureCount: notifFailuresResult?.count || 0,
      },
      escrowWebhooks: {
        status: (webhookFailuresResult?.count || 0) > 5 ? "DEGRADED" : "OK",
        failureCount: webhookFailuresResult?.count || 0,
      },
      appErrors: {
        count24h: appErrorsResult?.count || 0,
      },
    },
  });
});

// ============ Analytics & Metrics Dashboard ============

adminRouter.get("/metrics", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoMetrics());
  }
  
  const db = c.env.DB;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Users by tier
  const { results: usersByTierRaw } = await db.prepare(`
    SELECT 
      COALESCE(subscription_tier, 'free') as tier,
      COUNT(*) as count
    FROM users
    GROUP BY subscription_tier
  `).all();
  
  const totalUsers = usersByTierRaw.reduce((sum, row) => sum + (row.count as number), 0);
  const usersByTier = usersByTierRaw.map(row => ({
    tier: (row.tier as string) || 'free',
    count: row.count as number,
    percentage: totalUsers > 0 ? Math.round(((row.count as number) / totalUsers) * 1000) / 10 : 0,
  }));
  
  // Active users 24h
  const activeUsers24h = await db.prepare(`
    SELECT COUNT(*) as count FROM users WHERE last_active_at >= ?
  `).bind(oneDayAgo).first<{ count: number }>();
  
  // AI metrics by tier (from ai_event_log)
  const { results: aiMetricsRaw } = await db.prepare(`
    SELECT 
      COALESCE(u.subscription_tier, 'free') as tier,
      COUNT(*) as requests,
      AVG(COALESCE(ael.tokens_used, 500)) as avg_tokens
    FROM ai_event_log ael
    LEFT JOIN users u ON ael.user_id = CAST(u.id AS TEXT)
    WHERE ael.created_at >= ?
    GROUP BY u.subscription_tier
  `).bind(oneDayAgo).all();
  
  const aiMetrics = aiMetricsRaw.map(row => ({
    tier: (row.tier as string) || 'free',
    requests: row.requests as number,
    avgTokens: Math.round(row.avg_tokens as number) || 500,
    // Cost estimate: ~$0.01 per 1000 tokens (rough estimate)
    estimatedCost: Math.round((((row.requests as number) * (row.avg_tokens as number || 500)) / 1000) * 0.01 * 100) / 100,
  }));
  
  // Push metrics by tier
  const { results: pushMetricsRaw } = await db.prepare(`
    SELECT 
      COALESCE(u.subscription_tier, 'free') as tier,
      SUM(CASE WHEN pn.status IN ('sent', 'delivered') THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN pn.status = 'suppressed' THEN 1 ELSE 0 END) as suppressed,
      SUM(CASE WHEN pn.status = 'bundled' THEN 1 ELSE 0 END) as bundled,
      SUM(CASE WHEN pn.status = 'blocked' THEN 1 ELSE 0 END) as blocked,
      COUNT(*) as total
    FROM push_notifications pn
    LEFT JOIN users u ON pn.user_id = CAST(u.id AS TEXT)
    WHERE pn.created_at >= ?
    GROUP BY u.subscription_tier
  `).bind(oneDayAgo).all();
  
  const pushMetrics = pushMetricsRaw.map(row => {
    const sent = (row.sent as number) || 0;
    const total = (row.total as number) || 1;
    return {
      tier: (row.tier as string) || 'free',
      sent,
      suppressed: (row.suppressed as number) || 0,
      bundled: (row.bundled as number) || 0,
      blockedByCaps: (row.blocked as number) || 0,
      deliveryRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : 100,
    };
  });
  
  // Conversion funnel (30d)
  const { results: conversionRaw } = await db.prepare(`
    SELECT 
      previous_tier as from_tier,
      subscription_tier as to_tier,
      COUNT(*) as count
    FROM users
    WHERE subscription_changed_at >= ? 
      AND previous_tier IS NOT NULL 
      AND previous_tier != subscription_tier
    GROUP BY previous_tier, subscription_tier
  `).bind(thirtyDaysAgo).all();
  
  // Get tier counts for rate calculation
  const tierCounts: Record<string, number> = {};
  usersByTier.forEach(t => { tierCounts[t.tier] = t.count; });
  
  const conversionFunnel = conversionRaw.map(row => ({
    from: (row.from_tier as string) || 'free',
    to: (row.to_tier as string) || 'pro',
    count: row.count as number,
    rate: tierCounts[(row.from_tier as string)] > 0 
      ? Math.round(((row.count as number) / tierCounts[(row.from_tier as string)]) * 1000) / 10 
      : 0,
  }));
  
  // Revenue by tier
  const { results: revenueRaw } = await db.prepare(`
    SELECT 
      COALESCE(u.subscription_tier, 'pro') as tier,
      SUM(tl.amount_cents) / 100.0 as mrr,
      COUNT(DISTINCT tl.user_id) as user_count
    FROM transaction_ledger tl
    LEFT JOIN users u ON tl.user_id = CAST(u.id AS TEXT)
    WHERE tl.status = 'completed' 
      AND tl.intent_type = 'subscription'
      AND tl.created_at >= ?
    GROUP BY u.subscription_tier
  `).bind(thirtyDaysAgo).all();
  
  const revenueByTier = revenueRaw.map(row => ({
    tier: (row.tier as string) || 'pro',
    mrr: (row.mrr as number) || 0,
    userCount: (row.user_count as number) || 0,
    arpu: (row.user_count as number) > 0 ? Math.round(((row.mrr as number) / (row.user_count as number)) * 100) / 100 : 0,
  }));
  
  // Heavy users (top AI consumers)
  const { results: heavyUsersRaw } = await db.prepare(`
    SELECT 
      u.id as user_id,
      u.email,
      COALESCE(u.subscription_tier, 'free') as tier,
      COUNT(*) as ai_requests,
      SUM(COALESCE(ael.tokens_used, 500)) as total_tokens
    FROM ai_event_log ael
    LEFT JOIN users u ON ael.user_id = CAST(u.id AS TEXT)
    WHERE ael.created_at >= ?
    GROUP BY u.id
    ORDER BY total_tokens DESC
    LIMIT 10
  `).bind(oneDayAgo).all();
  
  const heavyUsers = heavyUsersRaw.map(row => ({
    userId: row.user_id as string,
    email: row.email as string,
    tier: (row.tier as string) || 'free',
    aiRequests24h: row.ai_requests as number,
    tokenUsage24h: row.total_tokens as number,
    estimatedCost: Math.round(((row.total_tokens as number) / 1000) * 0.01 * 100) / 100,
  }));
  
  // Calculate totals
  const totalAIRequests = aiMetrics.reduce((sum, m) => sum + m.requests, 0);
  const totalPushSent = pushMetrics.reduce((sum, m) => sum + m.sent, 0);
  const totalMRR = revenueByTier.reduce((sum, r) => sum + r.mrr, 0);
  const totalAICost = aiMetrics.reduce((sum, m) => sum + m.estimatedCost, 0);
  
  // Upgrade funnel tracking (30d)
  const { results: upgradeTriggersRaw } = await db.prepare(`
    SELECT 
      trigger_source,
      trigger_feature,
      COUNT(*) as impressions,
      SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as conversions
    FROM upgrade_events
    WHERE created_at >= ?
    GROUP BY trigger_source, trigger_feature
    ORDER BY impressions DESC
  `).bind(thirtyDaysAgo).all();
  
  const upgradeTriggers = upgradeTriggersRaw.map(row => ({
    source: row.trigger_source as string,
    feature: (row.trigger_feature as string) || null,
    impressions: row.impressions as number,
    conversions: row.conversions as number,
    conversionRate: (row.impressions as number) > 0 
      ? Math.round(((row.conversions as number) / (row.impressions as number)) * 1000) / 10 
      : 0,
  }));
  
  // Top performing CTAs
  const { results: topCTAsRaw } = await db.prepare(`
    SELECT 
      trigger_source,
      trigger_context,
      page_path,
      COUNT(*) as shown,
      SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as converted
    FROM upgrade_events
    WHERE created_at >= ?
    GROUP BY trigger_source, trigger_context, page_path
    HAVING converted > 0
    ORDER BY converted DESC, shown DESC
    LIMIT 10
  `).bind(thirtyDaysAgo).all();
  
  const topCTAs = topCTAsRaw.map(row => ({
    source: row.trigger_source as string,
    context: row.trigger_context as string,
    pagePath: row.page_path as string,
    shown: row.shown as number,
    converted: row.converted as number,
    rate: (row.shown as number) > 0 ? Math.round(((row.converted as number) / (row.shown as number)) * 1000) / 10 : 0,
  }));
  
  return c.json({
    usersByTier,
    aiMetrics,
    pushMetrics,
    conversionFunnel,
    revenueByTier,
    heavyUsers,
    upgradeTriggers,
    topCTAs,
    totals: {
      totalUsers,
      activeUsers24h: activeUsers24h?.count || 0,
      totalAIRequests24h: totalAIRequests,
      totalPushSent24h: totalPushSent,
      totalMRR: Math.round(totalMRR * 100) / 100,
      estimatedAICost24h: Math.round(totalAICost * 100) / 100,
    },
  });
});

// ============ Users (Global Registry) ============

adminRouter.get("/users", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoUsers());
  }
  
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const search = c.req.query("search") || "";
  const status = c.req.query("status");
  const role = c.req.query("role");
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT 
      u.id, u.email, u.display_name, u.phone, u.avatar_url,
      u.roles, u.status, u.subscription_status,
      u.created_at, u.last_active_at,
      (SELECT COUNT(*) FROM league_members WHERE user_id = u.id) as pools_joined,
      (SELECT COUNT(*) FROM league_members WHERE user_id = u.id AND role = 'owner') as pools_managed
    FROM users u
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  
  if (search) {
    query += ` AND (u.email LIKE ? OR u.display_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (status) {
    query += ` AND u.status = ?`;
    params.push(status);
  }
  
  if (role) {
    query += ` AND u.roles LIKE ?`;
    params.push(`%${role}%`);
  }
  
  query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);
  
  const { results } = await db.prepare(query).bind(...params).all();
  
  const hasMore = results.length > limit;
  const users = results.slice(0, limit).map(u => ({
    ...u,
    roles: parseRoles(u.roles),
  }));
  
  // Get total count
  let countQuery = `SELECT COUNT(*) as count FROM users WHERE 1=1`;
  const countParams: string[] = [];
  
  if (search) {
    countQuery += ` AND (email LIKE ? OR display_name LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    countQuery += ` AND status = ?`;
    countParams.push(status);
  }
  if (role) {
    countQuery += ` AND roles LIKE ?`;
    countParams.push(`%${role}%`);
  }
  
  const countResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();
  
  return c.json({
    users,
    hasMore,
    total: countResult?.count || 0,
    page,
    limit,
  });
});

adminRouter.get("/users/:userId", async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("userId");
  const platformUser = getPlatformUser(c);
  
  const user = await db.prepare(`
    SELECT 
      u.id, u.email, u.display_name, u.phone, u.avatar_url,
      u.roles, u.status, u.subscription_status, u.flags_json,
      u.created_at, u.updated_at, u.last_active_at
    FROM users u
    WHERE u.id = ?
  `).bind(userId).first();
  
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  
  // Get user's pools
  const { results: pools } = await db.prepare(`
    SELECT l.id, l.name, l.sport_key, l.format_key, lm.role,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
    FROM leagues l
    INNER JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ?
    ORDER BY l.created_at DESC
  `).bind(userId).all();
  
  // Get ledger summary
  const ledgerSummary = await db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'completed' THEN amount_cents ELSE 0 END) as total_paid,
      SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) as total_pending,
      COUNT(*) as transaction_count
    FROM transaction_ledger
    WHERE user_id = ?
  `).bind(userId).first<{ total_paid: number; total_pending: number; transaction_count: number }>();
  
  // Get recent audit events for this user
  const { results: recentEvents } = await db.prepare(`
    SELECT id, event_type, entity_type, entity_id, reason, created_at
    FROM event_log
    WHERE user_id = ? OR actor_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(userId, userId).all();
  
  // Log the view
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "user",
      entityId: userId,
      actionType: "admin_viewed_user",
      summary: `Viewed user profile: ${user.email}`,
    });
  }
  
  return c.json({
    user: {
      ...user,
      roles: parseRoles(user.roles),
      flags: user.flags_json ? JSON.parse(user.flags_json as string) : null,
    },
    pools,
    ledgerSummary: {
      totalPaidCents: ledgerSummary?.total_paid || 0,
      totalPendingCents: ledgerSummary?.total_pending || 0,
      transactionCount: ledgerSummary?.transaction_count || 0,
    },
    recentEvents,
  });
});

adminRouter.post("/users/:userId/disable", async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("userId");
  const platformUser = getPlatformUser(c);
  const { reason } = await c.req.json();
  
  // Check user exists
  const user = await db.prepare(`SELECT email, status FROM users WHERE id = ?`).bind(userId).first<{ email: string; status: string }>();
  
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  
  // Update status
  await db.prepare(`
    UPDATE users SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(userId).run();
  
  // Log the action
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "user",
      entityId: userId,
      actionType: "user_disabled",
      summary: `Disabled user account: ${user.email}`,
      detailsJson: { reason, previousStatus: user.status },
    });
  }
  
  return c.json({ success: true, message: "User account disabled" });
});

adminRouter.post("/users/:userId/enable", async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("userId");
  const platformUser = getPlatformUser(c);
  
  const user = await db.prepare(`SELECT email, status FROM users WHERE id = ?`).bind(userId).first<{ email: string; status: string }>();
  
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  
  await db.prepare(`
    UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(userId).run();
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "user",
      entityId: userId,
      actionType: "user_enabled",
      summary: `Enabled user account: ${user.email}`,
      detailsJson: { previousStatus: user.status },
    });
  }
  
  return c.json({ success: true, message: "User account enabled" });
});

// ============ Pools (Global Oversight) ============

adminRouter.get("/pools", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoPools());
  }
  
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const search = c.req.query("search") || "";
  const sport = c.req.query("sport");
  const status = c.req.query("status");
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT 
      l.id, l.name, l.sport_key, l.format_key, l.season,
      l.pool_type_id, l.pool_type_version,
      l.is_active, l.created_at, l.updated_at,
      l.entry_fee_cents, l.is_payment_required,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count,
      (SELECT GROUP_CONCAT(u.email) FROM league_members lm 
        INNER JOIN users u ON lm.user_id = u.id 
        WHERE lm.league_id = l.id AND lm.role = 'owner') as owner_emails
    FROM leagues l
    WHERE l.data_scope != 'DEMO' OR l.data_scope IS NULL
  `;
  const params: (string | number)[] = [];
  
  if (search) {
    query += ` AND l.name LIKE ?`;
    params.push(`%${search}%`);
  }
  
  if (sport) {
    query += ` AND l.sport_key = ?`;
    params.push(sport);
  }
  
  if (status === "active") {
    query += ` AND l.is_active = 1`;
  } else if (status === "inactive") {
    query += ` AND l.is_active = 0`;
  }
  
  query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);
  
  const { results } = await db.prepare(query).bind(...params).all();
  
  const hasMore = results.length > limit;
  const pools = results.slice(0, limit);
  
  return c.json({
    pools,
    hasMore,
    page,
    limit,
  });
});

adminRouter.get("/pools/:poolId", async (c) => {
  const db = c.env.DB;
  const poolId = c.req.param("poolId");
  const platformUser = getPlatformUser(c);
  
  const pool = await db.prepare(`
    SELECT l.*, pt.name as pool_type_name
    FROM leagues l
    LEFT JOIN pool_types pt ON l.pool_type_id = pt.id
    WHERE l.id = ?
  `).bind(poolId).first();
  
  if (!pool) {
    return c.json({ error: "Pool not found" }, 404);
  }
  
  // Get member count
  const memberCount = await db.prepare(`
    SELECT COUNT(*) as count FROM league_members WHERE league_id = ?
  `).bind(poolId).first<{ count: number }>();
  
  // Get ledger summary
  const ledgerSummary = await db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'completed' AND intent_type != 'refund' THEN amount_cents ELSE 0 END) as total_collected,
      SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) as total_pending,
      SUM(CASE WHEN status = 'refunded' OR (status = 'completed' AND intent_type = 'refund') THEN amount_cents ELSE 0 END) as total_refunded
    FROM transaction_ledger
    WHERE league_id = ?
  `).bind(poolId).first();
  
  // Get recent audit events
  const { results: recentEvents } = await db.prepare(`
    SELECT id, event_type, user_id, actor_id, entity_type, reason, created_at
    FROM event_log
    WHERE league_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(poolId).all();
  
  // Log the view
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "pool",
      entityId: poolId,
      actionType: "admin_viewed_pool",
      summary: `Viewed pool: ${pool.name}`,
    });
  }
  
  return c.json({
    pool: {
      ...pool,
      rules: pool.rules_json ? JSON.parse(pool.rules_json as string) : null,
    },
    memberCount: memberCount?.count || 0,
    ledgerSummary: {
      totalCollectedCents: ledgerSummary?.total_collected || 0,
      totalPendingCents: ledgerSummary?.total_pending || 0,
      totalRefundedCents: ledgerSummary?.total_refunded || 0,
    },
    recentEvents,
  });
});

// ============ Pool Type Library ============

adminRouter.get("/pool-types", async (c) => {
  const db = c.env.DB;
  const ensureCatalogSeeded = async () => {
    for (const definition of POOL_TYPE_CATALOG) {
      const existing = await db.prepare(`
        SELECT id
        FROM pool_types
        WHERE sport_key = ? AND format_key = ? AND name = ?
        LIMIT 1
      `).bind(definition.sport, definition.key, definition.name).first<{ id?: number }>();
      if (existing?.id) continue;
      const configJson = JSON.stringify({
        allowed_settings: buildLegacyAllowedSettings(definition),
        commissioner_options: definition.commissioner_options,
        template: definition.template,
        schedule_type: definition.schedule_type,
        scoring_mode: definition.scoring_mode,
        pick_mode: definition.pick_mode,
        elimination_mode: definition.elimination_mode,
        leaderboard_mode: definition.leaderboard_mode,
        entry_mode: definition.entry_mode,
        payout_bucket_support: definition.payout_bucket_support,
        multi_pool_bundle_support: definition.multi_pool_bundle_support,
        rule_variants: definition.rule_variants,
        aliases: definition.aliases || [],
      });
      await db.prepare(`
        INSERT INTO pool_types (name, sport_key, format_key, version, status, description, allowed_settings_json)
        VALUES (?, ?, ?, 'v1', 'active', ?, ?)
      `).bind(
        definition.name,
        definition.sport,
        definition.key,
        definition.description,
        configJson,
      ).run();
    }
  };
  await ensureCatalogSeeded();
  const { results: poolTypes } = await db.prepare(`
    SELECT * FROM pool_types ORDER BY sport_key, format_key, version DESC
  `).all();

  const parseAllowedSettings = (raw: unknown): { allowedSettings: string[] | null; config: Record<string, unknown> | null } => {
    if (!raw || typeof raw !== "string") return { allowedSettings: null, config: null };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { allowedSettings: parsed.filter((v): v is string => typeof v === "string"), config: null };
      }
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const allowed = Array.isArray(obj.allowed_settings)
          ? obj.allowed_settings.filter((v): v is string => typeof v === "string")
          : null;
        return { allowedSettings: allowed, config: obj };
      }
      return { allowedSettings: null, config: null };
    } catch {
      return { allowedSettings: null, config: null };
    }
  };

  return c.json({
    poolTypes: (poolTypes || []).map((pt) => {
      const parsed = parseAllowedSettings(pt.allowed_settings_json);
      return {
        ...pt,
        allowedSettings: parsed.allowedSettings,
        config: parsed.config,
      };
    }),
  });
});

adminRouter.get("/pool-types/catalog", async (c) => {
  return c.json({
    templates: POOL_TYPE_CATALOG,
    total: POOL_TYPE_CATALOG.length,
  });
});

adminRouter.post("/pool-types", async (c) => {
  const db = c.env.DB;
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { name, sport_key, format_key, description, allowed_settings } = body;
  
  if (!name || !sport_key || !format_key) {
    return c.json({ error: "Name, sport_key, and format_key are required" }, 400);
  }
  
  const result = await db.prepare(`
    INSERT INTO pool_types (name, sport_key, format_key, version, status, description, allowed_settings_json)
    VALUES (?, ?, ?, 'v1', 'draft', ?, ?)
  `).bind(
    name,
    sport_key,
    format_key,
    description || null,
    allowed_settings ? JSON.stringify(allowed_settings) : null
  ).run();
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "pool_type",
      entityId: result.meta.last_row_id,
      actionType: "pool_type_created",
      summary: `Created pool type: ${name}`,
      detailsJson: { sport_key, format_key },
    });
  }
  
  return c.json({ success: true, id: result.meta.last_row_id });
});

adminRouter.post("/pool-types/:id/version", async (c) => {
  const db = c.env.DB;
  const poolTypeId = c.req.param("id");
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { description, allowed_settings } = body;
  
  // Get current pool type
  const current = await db.prepare(`SELECT * FROM pool_types WHERE id = ?`).bind(poolTypeId).first();
  
  if (!current) {
    return c.json({ error: "Pool type not found" }, 404);
  }
  
  // Parse current version and increment
  const currentVersion = (current.version as string) || "v1";
  const versionNum = parseInt(currentVersion.replace("v", "").split(".")[0]) || 1;
  const newVersion = `v${versionNum + 1}`;
  
  // Create new version
  const result = await db.prepare(`
    INSERT INTO pool_types (name, sport_key, format_key, version, status, description, allowed_settings_json)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)
  `).bind(
    current.name,
    current.sport_key,
    current.format_key,
    newVersion,
    description !== undefined ? description : current.description,
    allowed_settings !== undefined ? JSON.stringify(allowed_settings) : current.allowed_settings_json
  ).run();
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "pool_type",
      entityId: result.meta.last_row_id,
      actionType: "pool_type_versioned",
      summary: `Versioned pool type: ${current.name} from ${currentVersion} to ${newVersion}`,
      detailsJson: { previousId: poolTypeId, newVersion },
    });
  }
  
  return c.json({ success: true, id: result.meta.last_row_id, version: newVersion });
});

adminRouter.patch("/pool-types/:id", async (c) => {
  const db = c.env.DB;
  const poolTypeId = c.req.param("id");
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { status, description, allowed_settings } = body;
  
  const current = await db.prepare(`SELECT * FROM pool_types WHERE id = ?`).bind(poolTypeId).first();
  
  if (!current) {
    return c.json({ error: "Pool type not found" }, 404);
  }
  
  const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const values: (string | number)[] = [];
  
  if (status !== undefined) {
    updates.push("status = ?");
    values.push(status);
  }
  if (description !== undefined) {
    updates.push("description = ?");
    values.push(description);
  }
  if (allowed_settings !== undefined) {
    updates.push("allowed_settings_json = ?");
    values.push(JSON.stringify(allowed_settings));
  }
  
  values.push(poolTypeId);
  
  await db.prepare(`
    UPDATE pool_types SET ${updates.join(", ")} WHERE id = ?
  `).bind(...values).run();
  
  if (platformUser && status === "deprecated") {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "pool_type",
      entityId: poolTypeId,
      actionType: "pool_type_deprecated",
      summary: `Deprecated pool type: ${current.name} ${current.version}`,
    });
  }
  
  return c.json({ success: true });
});

// ============ Payments & Ledger ============

adminRouter.get("/ledger", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoLedger());
  }
  
  const db = c.env.DB;
  const platformUser = getPlatformUser(c);
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const status = c.req.query("status");
  const poolId = c.req.query("pool_id");
  const startDate = c.req.query("start_date");
  const endDate = c.req.query("end_date");
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT 
      tl.*,
      u.email as user_email, u.display_name as user_name,
      l.name as pool_name
    FROM transaction_ledger tl
    LEFT JOIN users u ON tl.user_id = CAST(u.id AS TEXT)
    LEFT JOIN leagues l ON tl.league_id = l.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  
  if (status) {
    query += ` AND tl.status = ?`;
    params.push(status);
  }
  if (poolId) {
    query += ` AND tl.league_id = ?`;
    params.push(poolId);
  }
  if (startDate) {
    query += ` AND tl.created_at >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND tl.created_at <= ?`;
    params.push(endDate);
  }
  
  query += ` ORDER BY tl.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);
  
  const { results } = await db.prepare(query).bind(...params).all();
  
  const hasMore = results.length > limit;
  const transactions = results.slice(0, limit);
  
  // Get summary stats
  const summary = await db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'completed' AND intent_type != 'refund' THEN amount_cents ELSE 0 END) as total_collected,
      SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) as total_pending,
      SUM(CASE WHEN status = 'failed' THEN amount_cents ELSE 0 END) as total_failed,
      COUNT(*) as total_count
    FROM transaction_ledger
  `).first();
  
  // Log the view
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "ledger",
      actionType: "admin_viewed_ledger",
      summary: "Viewed global payment ledger",
    });
  }
  
  return c.json({
    transactions,
    hasMore,
    page,
    limit,
    summary: {
      totalCollectedCents: summary?.total_collected || 0,
      totalPendingCents: summary?.total_pending || 0,
      totalFailedCents: summary?.total_failed || 0,
      totalCount: summary?.total_count || 0,
    },
  });
});

adminRouter.get("/ledger/:transactionId", async (c) => {
  const db = c.env.DB;
  const transactionId = c.req.param("transactionId");
  
  const transaction = await db.prepare(`
    SELECT 
      tl.*,
      u.email as user_email, u.display_name as user_name,
      l.name as pool_name
    FROM transaction_ledger tl
    LEFT JOIN users u ON tl.user_id = CAST(u.id AS TEXT)
    LEFT JOIN leagues l ON tl.league_id = l.id
    WHERE tl.id = ?
  `).bind(transactionId).first();
  
  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }
  
  // Get related audit events
  const { results: relatedEvents } = await db.prepare(`
    SELECT * FROM event_log 
    WHERE entity_type = 'transaction' AND entity_id = ?
    ORDER BY created_at DESC
  `).bind(transactionId).all();
  
  return c.json({
    transaction,
    relatedEvents,
  });
});

// ============ Notifications Health ============

adminRouter.get("/notifications-health", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoNotificationsHealth());
  }
  
  const db = c.env.DB;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // Total sent (7d)
  const totalSent = await db.prepare(`
    SELECT COUNT(*) as count FROM notification_deliveries 
    WHERE status IN ('delivered', 'sent') AND created_at >= ?
  `).bind(sevenDaysAgo).first<{ count: number }>();
  
  // Total failed (7d)
  const totalFailed = await db.prepare(`
    SELECT COUNT(*) as count FROM notification_deliveries 
    WHERE status = 'failed' AND created_at >= ?
  `).bind(sevenDaysAgo).first<{ count: number }>();
  
  // Per-channel breakdown
  const { results: channelStats } = await db.prepare(`
    SELECT 
      channel,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('delivered', 'sent') THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM notification_deliveries
    WHERE created_at >= ?
    GROUP BY channel
  `).bind(sevenDaysAgo).all();
  
  // Recent failures
  const { results: recentFailures } = await db.prepare(`
    SELECT nd.*, u.email as user_email
    FROM notification_deliveries nd
    LEFT JOIN users u ON nd.user_id = CAST(u.id AS TEXT)
    WHERE nd.status = 'failed' AND nd.created_at >= ?
    ORDER BY nd.created_at DESC
    LIMIT 20
  `).bind(oneDayAgo).all();
  
  const sent = totalSent?.count || 0;
  const failed = totalFailed?.count || 0;
  const total = sent + failed;
  const deliveryRate = total > 0 ? Math.round((sent / total) * 1000) / 10 : 100;
  
  return c.json({
    summary: {
      totalSent: sent,
      totalFailed: failed,
      deliveryRate,
    },
    channelBreakdown: channelStats.map(ch => ({
      channel: ch.channel,
      total: ch.total,
      sent: ch.sent,
      failed: ch.failed,
      rate: (ch.total as number) > 0 ? Math.round(((ch.sent as number) / (ch.total as number)) * 1000) / 10 : 100,
    })),
    recentFailures,
  });
});

// ============ Audit Timeline ============

adminRouter.get("/audit-timeline", async (c) => {
  // Return demo data in demo mode
  if (isDemoMode(c)) {
    return c.json(generateDemoAuditTimeline());
  }
  
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const entityType = c.req.query("entity_type");
  const actionType = c.req.query("action_type");
  const actorRole = c.req.query("actor_role");
  const poolId = c.req.query("pool_id");
  const startDate = c.req.query("start_date");
  const endDate = c.req.query("end_date");
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT 
      el.*,
      u.email as actor_email,
      l.name as pool_name
    FROM event_log el
    LEFT JOIN users u ON el.actor_id = CAST(u.id AS TEXT)
    LEFT JOIN leagues l ON el.league_id = l.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  
  if (entityType) {
    query += ` AND el.entity_type = ?`;
    params.push(entityType);
  }
  if (actionType) {
    query += ` AND el.event_type = ?`;
    params.push(actionType);
  }
  if (actorRole) {
    query += ` AND el.payload_json LIKE ?`;
    params.push(`%"actor_role":"${actorRole}"%`);
  }
  if (poolId) {
    query += ` AND el.league_id = ?`;
    params.push(poolId);
  }
  if (startDate) {
    query += ` AND el.created_at >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND el.created_at <= ?`;
    params.push(endDate);
  }
  
  query += ` ORDER BY el.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);
  
  const { results } = await db.prepare(query).bind(...params).all();
  
  const hasMore = results.length > limit;
  const events = results.slice(0, limit).map(e => ({
    ...e,
    details: e.payload_json ? JSON.parse(e.payload_json as string) : null,
  }));
  
  return c.json({
    events,
    hasMore,
    page,
    limit,
  });
});

// ============ Scout QA Dashboard ============

adminRouter.get("/scout-qa", async (c) => {
  const db = c.env.DB;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get Scout (persona = 'scout') questions summary
  const summary = await db.prepare(`
    SELECT 
      COUNT(*) as total_questions,
      SUM(CASE WHEN response_text IS NOT NULL AND response_text != '' THEN 1 ELSE 0 END) as answered_count,
      SUM(CASE WHEN response_text IS NULL OR response_text = '' THEN 1 ELSE 0 END) as unanswered_count,
      SUM(CASE WHEN flags IS NOT NULL AND flags != '' THEN 1 ELSE 0 END) as flagged_count,
      SUM(CASE WHEN flags LIKE '%hallucination%' OR flags LIKE '%invented%' THEN 1 ELSE 0 END) as hallucination_flags
    FROM ai_event_log
    WHERE persona = 'scout' AND created_at >= ?
  `).bind(sevenDaysAgo).first<{
    total_questions: number;
    answered_count: number;
    unanswered_count: number;
    flagged_count: number;
    hallucination_flags: number;
  }>();
  
  // Get tool usage metrics from scout_cache (tracks which tools are being called)
  const { results: toolMetrics } = await db.prepare(`
    SELECT 
      tool_name,
      COUNT(*) as call_count,
      AVG(CASE 
        WHEN julianday(updated_at) - julianday(created_at) > 0 
        THEN (julianday(updated_at) - julianday(created_at)) * 86400000 
        ELSE 50 
      END) as avg_latency_ms,
      SUM(CASE WHEN data_json LIKE '%"error"%' THEN 1 ELSE 0 END) as error_count,
      MAX(cached_at) as last_used
    FROM scout_cache
    WHERE cached_at >= ?
    GROUP BY tool_name
    ORDER BY call_count DESC
  `).bind(sevenDaysAgo).all();
  
  // Estimate avg response time from AI logs (based on response length as proxy)
  const avgResponseTime = await db.prepare(`
    SELECT AVG(LENGTH(response_text) * 2 + 500) as avg_time_estimate
    FROM ai_event_log
    WHERE persona = 'scout' AND response_text IS NOT NULL AND created_at >= ?
  `).bind(sevenDaysAgo).first<{ avg_time_estimate: number }>();
  
  // Get recent questions
  const { results: recentQuestions } = await db.prepare(`
    SELECT 
      id, user_id, league_id, request_text, response_text, sources_used, flags, created_at
    FROM ai_event_log
    WHERE persona = 'scout'
    ORDER BY created_at DESC
    LIMIT 30
  `).all();
  
  // Get unanswered questions
  const { results: unansweredQuestions } = await db.prepare(`
    SELECT 
      id, user_id, league_id, request_text, response_text, sources_used, flags, created_at
    FROM ai_event_log
    WHERE persona = 'scout' AND (response_text IS NULL OR response_text = '')
    ORDER BY created_at DESC
    LIMIT 20
  `).all();
  
  // Get flagged questions
  const { results: flaggedQuestions } = await db.prepare(`
    SELECT 
      id, user_id, league_id, request_text, response_text, sources_used, flags, created_at
    FROM ai_event_log
    WHERE persona = 'scout' AND flags IS NOT NULL AND flags != ''
    ORDER BY created_at DESC
    LIMIT 20
  `).all();
  
  // Get data freshness status
  const freshness = await checkAllSourcesFreshness(db);
  
  return c.json({
    summary: {
      totalQuestions7d: summary?.total_questions || 0,
      answeredCount: summary?.answered_count || 0,
      unansweredCount: summary?.unanswered_count || 0,
      flaggedCount: summary?.flagged_count || 0,
      hallucationFlags: summary?.hallucination_flags || 0,
      avgResponseTimeMs: avgResponseTime?.avg_time_estimate || 800,
    },
    toolMetrics: toolMetrics.map((t: any) => ({
      toolName: t.tool_name,
      callCount: t.call_count,
      avgLatencyMs: Math.round(t.avg_latency_ms || 50),
      errorCount: t.error_count || 0,
      lastUsed: t.last_used,
    })),
    recentQuestions: recentQuestions.map((q: any) => ({
      id: q.id,
      userId: q.user_id,
      leagueId: q.league_id,
      requestText: q.request_text,
      responseText: q.response_text,
      sourcesUsed: q.sources_used,
      flags: q.flags,
      createdAt: q.created_at,
      wasAnswered: !!(q.response_text && q.response_text.length > 0),
    })),
    unansweredQuestions: unansweredQuestions.map((q: any) => ({
      id: q.id,
      userId: q.user_id,
      leagueId: q.league_id,
      requestText: q.request_text,
      responseText: q.response_text,
      sourcesUsed: q.sources_used,
      flags: q.flags,
      createdAt: q.created_at,
      wasAnswered: false,
    })),
    flaggedQuestions: flaggedQuestions.map((q: any) => ({
      id: q.id,
      userId: q.user_id,
      leagueId: q.league_id,
      requestText: q.request_text,
      responseText: q.response_text,
      sourcesUsed: q.sources_used,
      flags: q.flags,
      createdAt: q.created_at,
      wasAnswered: !!(q.response_text && q.response_text.length > 0),
    })),
    dataFreshness: {
      results: freshness.results,
      summary: freshness.summary,
    },
  });
});

// ============ AI Insights ============

adminRouter.get("/ai-insights", async (c) => {
  const db = c.env.DB;
  
  // Get recent AI event logs grouped by persona
  const { results: aiLogs } = await db.prepare(`
    SELECT 
      persona,
      COUNT(*) as request_count,
      SUM(CASE WHEN flags LIKE '%error%' THEN 1 ELSE 0 END) as error_count
    FROM ai_event_log
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY persona
  `).all();
  
  // Get flagged AI events
  const { results: flaggedEvents } = await db.prepare(`
    SELECT * FROM ai_event_log
    WHERE flags IS NOT NULL AND flags != ''
    ORDER BY created_at DESC
    LIMIT 20
  `).all();
  
  // Placeholder insights (would be computed by AI in production)
  const insights = [
    {
      category: "pools_at_risk",
      title: "Pools at Risk",
      description: "Pools with low submission rates or payment issues",
      count: 0,
      items: [],
    },
    {
      category: "unusual_overrides",
      title: "Admins with Unusual Overrides",
      description: "Pool admins making frequent manual changes",
      count: 0,
      items: [],
    },
    {
      category: "stuck_onboarding",
      title: "Users Stuck Onboarding",
      description: "Users who signed up but haven't joined a pool",
      count: 0,
      items: [],
    },
    {
      category: "payment_exceptions",
      title: "Payment Exceptions",
      description: "Failed or disputed payments requiring attention",
      count: 0,
      items: [],
    },
  ];
  
  return c.json({
    aiUsage: aiLogs,
    flaggedEvents,
    insights,
  });
});

// ============ Marketing ============

adminRouter.get("/marketing/segments", async (c) => {
  const db = c.env.DB;
  
  const { results } = await db.prepare(`
    SELECT * FROM marketing_segments ORDER BY name
  `).all();
  
  return c.json({
    segments: results.map(s => ({
      ...s,
      criteria: s.criteria_json ? JSON.parse(s.criteria_json as string) : null,
    })),
  });
});

adminRouter.post("/marketing/segments", async (c) => {
  const db = c.env.DB;
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { name, segment_key, criteria } = body;
  
  if (!name || !segment_key) {
    return c.json({ error: "Name and segment_key are required" }, 400);
  }
  
  const result = await db.prepare(`
    INSERT INTO marketing_segments (name, segment_key, criteria_json)
    VALUES (?, ?, ?)
  `).bind(name, segment_key, criteria ? JSON.stringify(criteria) : null).run();
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "campaign",
      entityId: result.meta.last_row_id,
      actionType: "segment_created",
      summary: `Created marketing segment: ${name}`,
    });
  }
  
  return c.json({ success: true, id: result.meta.last_row_id });
});

adminRouter.get("/marketing/campaigns", async (c) => {
  const db = c.env.DB;
  
  const { results } = await db.prepare(`
    SELECT c.*, s.name as segment_name
    FROM marketing_campaigns c
    LEFT JOIN marketing_segments s ON c.segment_id = s.id
    ORDER BY c.created_at DESC
  `).all();
  
  return c.json({ campaigns: results });
});

adminRouter.post("/marketing/campaigns", async (c) => {
  const db = c.env.DB;
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { name, segment_id, channel, subject, body: content } = body;
  
  if (!name || !channel) {
    return c.json({ error: "Name and channel are required" }, 400);
  }
  
  const result = await db.prepare(`
    INSERT INTO marketing_campaigns (name, segment_id, channel, subject, body, status)
    VALUES (?, ?, ?, ?, ?, 'draft')
  `).bind(name, segment_id || null, channel, subject || null, content || null).run();
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "campaign",
      entityId: result.meta.last_row_id,
      actionType: "campaign_created",
      summary: `Created marketing campaign: ${name}`,
      detailsJson: { channel },
    });
  }
  
  return c.json({ success: true, id: result.meta.last_row_id });
});

// ============ Settings ============

adminRouter.get("/settings", async (c) => {
  const db = c.env.DB;
  
  const { results: settings } = await db.prepare(`
    SELECT * FROM platform_settings ORDER BY setting_key
  `).all();
  
  const { results: flags } = await db.prepare(`
    SELECT * FROM feature_flags ORDER BY flag_key
  `).all();
  
  return c.json({
    settings,
    featureFlags: flags,
  });
});

adminRouter.patch("/settings/:key", async (c) => {
  const db = c.env.DB;
  const settingKey = c.req.param("key");
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { value, description } = body;
  
  // Check if setting exists
  const existing = await db.prepare(`SELECT * FROM platform_settings WHERE setting_key = ?`).bind(settingKey).first();
  
  if (existing) {
    await db.prepare(`
      UPDATE platform_settings 
      SET setting_value = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP 
      WHERE setting_key = ?
    `).bind(value, description, settingKey).run();
  } else {
    await db.prepare(`
      INSERT INTO platform_settings (setting_key, setting_value, description)
      VALUES (?, ?, ?)
    `).bind(settingKey, value, description || null).run();
  }
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "system",
      actionType: "setting_changed",
      summary: `Changed platform setting: ${settingKey}`,
      detailsJson: { previousValue: existing?.setting_value, newValue: value },
    });
  }
  
  return c.json({ success: true });
});

adminRouter.patch("/feature-flags/:key", async (c) => {
  const db = c.env.DB;
  const flagKey = c.req.param("key");
  const platformUser = getPlatformUser(c);
  const body = await c.req.json();
  const { is_enabled, description } = body;
  const normalizedDescription = typeof description === "string" ? description : null;
  
  const existing = await db.prepare(`SELECT * FROM feature_flags WHERE flag_key = ?`).bind(flagKey).first();
  
  if (existing) {
    await db.prepare(`
      UPDATE feature_flags 
      SET is_enabled = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP 
      WHERE flag_key = ?
    `).bind(is_enabled ? 1 : 0, normalizedDescription, flagKey).run();
  } else {
    await db.prepare(`
      INSERT INTO feature_flags (flag_key, is_enabled, description)
      VALUES (?, ?, ?)
    `).bind(flagKey, is_enabled ? 1 : 0, normalizedDescription).run();
  }
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "system",
      actionType: "feature_flag_toggled",
      summary: `${is_enabled ? "Enabled" : "Disabled"} feature flag: ${flagKey}`,
      detailsJson: { previousState: existing?.is_enabled === 1 },
    });
  }
  
  return c.json({ success: true });
});

// ============ Promote User to Super Admin (for initial setup) ============

adminRouter.post("/users/:userId/promote-super-admin", async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("userId");
  const platformUser = getPlatformUser(c);
  
  const user = await db.prepare(`SELECT email, roles FROM users WHERE id = ?`).bind(userId).first<{ email: string; roles: string }>();
  
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  
  const currentRoles = parseRoles(user.roles);
  if (!currentRoles.includes("super_admin")) {
    currentRoles.push("super_admin");
  }
  
  await db.prepare(`
    UPDATE users SET roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(JSON.stringify(currentRoles), userId).run();
  
  if (platformUser) {
    await logAuditEvent(db, {
      actorUserId: platformUser.id,
      actorRole: "super_admin",
      entityType: "user",
      entityId: userId,
      actionType: "user_role_changed",
      summary: `Promoted user to super_admin: ${user.email}`,
      detailsJson: { newRoles: currentRoles },
    });
  }
  
  return c.json({ success: true, message: "User promoted to Super Admin" });
});

export { adminRouter };
