// @ts-nocheck
import { Hono, Context } from "hono";
import {
  exchangeCodeForSessionToken,
  getOAuthRedirectUrl,
  authMiddleware,
  deleteSession,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";
import { getCookie, setCookie } from "hono/cookie";
import {
  getAvailablePeriods,
  generateSampleEvents,
  generateFinalizedEvent,
  type NormalizedEvent,
} from "../shared/events";
import {
  generateMockTxnId,
  type EscrowProvider,
} from "../shared/escrow";
import {
  generateReceiptEmail,
  generateDeadlineReminderEmail,
  generateWeeklyResultsEmail,
} from "./email-templates";

const app = new Hono<{ Bindings: Env }>();

// Consistent JSON 404 shape across all API routes.
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      path: c.req.path,
      method: c.req.method,
    },
    404
  );
});

// Global error guard so transient upstream fetch failures don't crash the dev overlay.
app.onError((err, c) => {
  console.error("[Worker] Unhandled error:", err);
  return c.json(
    {
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
    },
    500
  );
});

app.get("/api/media/player-photo", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.json({ error: "Missing required query param: url" }, 400);
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return c.json({ error: "Invalid url query param" }, 400);
  }

  // Keep this endpoint strictly image-only and host-whitelisted.
  const allowedHosts = new Set(["a.espncdn.com", "img.mlbstatic.com", "mlbstatic.com"]);
  if (!allowedHosts.has(target.hostname)) {
    return c.json({ error: "Host not allowed for media proxy" }, 403);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; GZSportsMediaProxy/1.0)",
        accept: "image/*,*/*;q=0.8",
      },
    });
  } catch (error) {
    console.warn("[MediaProxy] Upstream fetch failed", { url: target.toString(), error });
    return c.json({ error: "Failed to fetch upstream media" }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    return c.json(
      { error: "Upstream media unavailable", status: upstream.status },
      upstream.status === 404 ? 404 : 502
    );
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=21600, s-maxage=21600",
    },
  });
});

function hasConfiguredValue(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "REPLACE_ME") return false;
  return true;
}

function getMochaAuthConfig(c: Context<{ Bindings: Env }>) {
  const apiUrl = c.env.MOCHA_USERS_SERVICE_API_URL;
  const apiKey = c.env.MOCHA_USERS_SERVICE_API_KEY;

  if (!hasConfiguredValue(apiUrl) || !hasConfiguredValue(apiKey)) {
    return null;
  }

  return { apiUrl, apiKey };
}

// ============ Internal Scheduler for Sports Data Refresh ============
// Runs background jobs on each request without blocking.
// Scheduler is triggered via the cron handler export, not on each request
// This avoids "Context is not finalized" errors in the Vite dev server

// Mount threshold engine routes
app.route("/api/thresholds", thresholdsRouter);

// Mount games API routes
app.route("/api/games", gamesRouter);

// Mount sports API routes (dedicated live endpoint with caching)
app.route("/api/sports", sportsRouter);

// Mount odds API routes
app.route("/api/odds", oddsRouter);

// Mount tracker picks API routes
app.route("/api/tracker", trackerPicksRouter);

// Mount watchlist API routes
app.route("/api/watchlist", watchlistRouter);

// Mount watchboards API routes (multi-board command center)
app.route("/api/watchboards", watchboardsRouter);
app.route("/api/favorites", favoritesRouter);

// Mount bet tickets API routes (ticket tracking system)
// Note: Routes handle auth internally by reading x-user-id header from frontend
app.route("/api/bet-tickets", betTicketsRouter);

// Mount ticket alerts API routes (Smart Alert Engine)
app.route("/api/ticket-alerts", ticketAlertsRouter);

// Command Center alert preferences
app.route("/api/command-center", commandCenter);

// Mount bet performance API routes (Performance Tracker)
app.route("/api/bet-performance", betPerformanceRouter);

// Mount alerts API routes (Alert Center)
app.route("/api/alerts", alertsRouter);

// Mount push notifications API routes
app.route("/api/push", pushRouter);

// Mount Super Admin Control Plane routes (RBAC protected)
app.route("/api/admin", adminRouter);

// Mount Pool Admin routes (per-pool admin features)
app.route("/api/pool-admin", poolAdminRouter);
app.route("/api/marketplace", poolMarketplaceRouter);

// Mount Receipts API routes (player trust system)
app.route("/api/receipts", receiptsRouter);

// Mount AI routes (Scout Intelligence Hub with function calling)
app.route("/api/ai", aiRouter);
import { aiInteractionRouter } from "./routes/ai-interaction";

import watchboardsRouter from "./routes/watchboards";
import betTicketsRouter from "./routes/bet-tickets";
import ticketAlertsRouter from "./routes/ticket-alerts";
import { commandCenter } from "./routes/command-center";
import betPerformanceRouter from "./routes/bet-performance";

// Mount AI Interaction tracking routes (soft caps, trial offers)
app.route("/api/ai", aiInteractionRouter);



// Mount AI Priority routes (tier-based routing and stats)
app.route("/api/ai/priority", aiPriorityRouter);

// Mount Data Freshness Monitoring routes
app.route("/api/freshness", freshnessRoutes);

// Mount Soccer Analysis routes (Coach G match analysis)
app.route("/api/soccer-analysis", soccerAnalysisRouter);

// Mount Coach G Alerts routes
app.route("/api/coach-alerts", coachAlertsRouter);

// Mount Live Watcher routes
app.route("/api/live-watcher", liveWatcherRouter);
app.route("/api/live-watcher", liveWatcherStatusRoutes);

// Mount Universal Live Impact Engine routes
app.route("/api/live-impact", liveImpactRouter);

// Mount Weekly Recap Email routes
app.route("/api/weekly-recap", weeklyRecapRouter);

// Mount Coach G Memory routes
app.route("/api/coach/memory", coachMemoryRoutes);

// Mount Coach G V2 intelligence engine routes
app.route("/api/coachg", coachGIntelligenceRouter);

// Mount Feature Flags routes (Super Admin only for management)
app.route("/api/feature-flags", featureFlagsRouter);
app.route("/api/page-data", pageDataRouter);

// Internal-only warm trigger that uses in-process app.fetch to avoid self-origin fetch failures.
app.post("/api/page-data/warm-internal", async (c) => {
  const providedKey = String(c.req.header("x-page-data-admin-key") || "").trim();
  const expectedKey = String(c.env.PAGE_DATA_WARM_BYPASS_KEY || "").trim();
  if (!expectedKey || providedKey !== expectedKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const laneRaw = String(c.req.query("lane") || "").trim().toLowerCase();
  const lane = laneRaw === "live" || laneRaw === "core" || laneRaw === "depth" || laneRaw === "full" ? laneRaw : "full";
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const date = String(c.req.query("date") || "").trim() || undefined;
  const activeSport = String(c.req.header("x-page-data-active-sport") || "").trim() || undefined;
  const ctx = (c as any).executionCtx as ExecutionContext;

  const summary = await runPageDataWarmCycle({
    lane,
    forceFresh,
    date,
    activeSport,
    db: c.env.DB,
    fetchFn: async (pathWithQuery) => {
      try {
        const request = new Request(`https://internal${pathWithQuery}`, {
          method: "GET",
          headers: { "x-page-data-warm": "1", "x-page-data-warm-lane": lane },
        });
        const response = await app.fetch(request, c.env, ctx);
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body };
      } catch {
        return { ok: false, status: 0, body: null };
      }
    },
  });

  return c.json({ ok: true, summary });
});

// Mount GZ Sports Subscription routes
app.route("/api/subscription", gzSubscriptionRoutes);

// Mount Teams API routes (SportsRadar team data)
import teamsRouter from "./routes/teams";
import soccerRouter from "./routes/soccer";
import soccerAnalysisRouter from "./routes/soccer-analysis";
import teamIntelligenceRouter from "./routes/team-intelligence";
app.route("/api/teams", teamsRouter);
app.route("/api/soccer", soccerRouter);
app.route("/api/soccer-analysis", soccerAnalysisRouter);
app.route("/api/team-intelligence", teamIntelligenceRouter);

// Mount Golf API routes (SportsRadar golf tournaments & leaderboards)
import golfRouter from "./routes/golf";
import mmaRouter from "./routes/mma";
import gameContextRouter from "./routes/game-context";
app.route("/api/golf", golfRouter);
app.route("/api/mma", mmaRouter);
app.route("/api/game-context", gameContextRouter);

// Mount Custom Alert Rules routes (Elite feature)
app.route("/api/alert-rules", customAlertRulesRouter);

// Mount Favorite Sports routes (onboarding & personalization)
app.route("/api/user/favorite-sports", favoriteSportsRouter);

// Mount Notification Settings routes (smart defaults)
app.route("/api/notifications", notificationSettingsRouter);

// Mount Live Sweat routes (Survivor pool live tracking)
app.route("/api/live-sweat", liveSweatRouter);

// Mount Upgrade Tracking routes (conversion funnel analytics)
app.route("/api/upgrade", upgradeTrackingRouter);

// Mount Referral System routes
app.route("/api/referrals", referralsRouter);

// Mount Leaderboard routes (competitive rankings with privacy toggle)
app.route("/api/leaderboard", leaderboardRouter);

// Mount Paywall Events routes (detailed paywall funnel tracking)
import { paywallEventsRouter } from "./routes/paywall-events";
app.route("/api/paywall-events", paywallEventsRouter);

// Mount API Health Check routes (admin-only diagnostics)
import apiHealthRouter from "./routes/api-health";
app.route("/api/health", apiHealthRouter);

import futuresRouter from "./routes/futures";
app.route("/api/futures", futuresRouter);

// Mount Share Scout Take routes
import sharesRouter from "./routes/shares";
app.route("/api/shares", sharesRouter);

import nhlRouter from "./routes/nhl";
app.route("/api/nhl", nhlRouter);

import coachGIntelligenceRouter from "./routes/coachg-intelligence";

// Mount Sports Data Engine routes (refresh orchestrator)
import sportsDataRefreshRouter from "./routes/sports-data-refresh";
app.route("/api/sports-data", sportsDataRefreshRouter);
export { HistoricalIngestionLoopDO } from "./services/historicalLines/ingestionLoopDO";

// Mount Scoreboard API routes (unified scores + lines endpoint)
import scoreboardRouter from "./routes/scoreboard";
app.route("/api/sports-data/scoreboard", scoreboardRouter);

// Mount Line Movement API routes (line history + sharp shift detection)
import lineMovementRouter from "./routes/line-movement";
import friendsRouter from "./routes/friends";
app.route("/api/line-movement", lineMovementRouter);
app.route("/api/friends", friendsRouter);

// Mount Sportsbook Odds Comparison routes (multi-book odds)
import sportsbookOddsRouter from "./routes/sportsbook-odds";
app.route("/api/sportsbook-odds", sportsbookOddsRouter);

// Mount Shared Picks API routes (social pick feed)
import sharedPicksRouter from "./routes/shared-picks";
app.route("/api/shared-picks", sharedPicksRouter);

// Mount Coach G Deep Game Preview routes
import coachGPreviewRouter from "./routes/coach-g-preview";
app.route("/api/coach-g-preview", coachGPreviewRouter);

// Mount Game Detail API routes (box scores, H2H, injuries)
import { gameDetailRouter } from "./routes/game-detail";
app.route("/api/game-detail", gameDetailRouter);

// Mount Player Profile API routes (player intel hub)
import playerProfileRouter from "./routes/player-profile";
app.route("/api/player", playerProfileRouter);

// ============ Auth Routes ============

// Get Google OAuth redirect URL
app.get("/api/oauth/google/redirect_url", async (c) => {
  const authConfig = getMochaAuthConfig(c);
  if (!authConfig) {
    return c.json(
      {
        redirectUrl: null,
        config_required: true,
        error: "Mocha auth is not configured for local development",
      },
      200
    );
  }

  const redirectUrl = await getOAuthRedirectUrl("google", authConfig);

  return c.json({ redirectUrl }, 200);
});

// Exchange OAuth code for session token
app.post("/api/sessions", async (c) => {
  const body = await c.req.json().catch(() => ({} as { code?: string }));

  if (!body.code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }

  const authConfig = getMochaAuthConfig(c);
  if (!authConfig) {
    return c.json({ error: "Mocha auth is not configured for local development" }, 503);
  }

  const sessionToken = await exchangeCodeForSessionToken(body.code, authConfig);

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 60 * 24 * 60 * 60, // 60 days
  });

  return c.json({ success: true }, 200);
});

// Get current user
app.get("/api/users/me", authMiddleware, async (c) => {
  return c.json(c.get("user"));
});

// Get user preferences
app.get("/api/users/preferences", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get user record from DB
  const dbUser = await c.env.DB.prepare(`
    SELECT display_name, phone, is_phone_verified,
           notification_email, notification_sms, notification_invites,
           notification_reminders, notification_results,
           notification_prefs_json
    FROM users WHERE id = ?
  `).bind(user.id).first();

  // Parse extended preferences if stored
  let extendedPrefs = {};
  if (dbUser?.notification_prefs_json) {
    try {
      extendedPrefs = JSON.parse(dbUser.notification_prefs_json as string);
    } catch {}
  }

  return c.json({
    displayName: dbUser?.display_name || "",
    phone: dbUser?.phone || "",
    isPhoneVerified: dbUser?.is_phone_verified === 1,
    notifications: {
      channelEmail: dbUser?.notification_email === 1,
      channelSms: dbUser?.notification_sms === 1,
      leagueInvites: dbUser?.notification_invites === 1,
      pickReminders: dbUser?.notification_reminders === 1,
      weeklyResults: dbUser?.notification_results === 1,
      ...extendedPrefs,
    },
  });
});

// Update user preferences
app.patch("/api/users/preferences", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { displayName, phone, notifications } = body;

  // Check if user exists, create if not
  const existing = await c.env.DB.prepare(`
    SELECT id FROM users WHERE id = ?
  `).bind(user.id).first();

  if (!existing) {
    await c.env.DB.prepare(`
      INSERT INTO users (id, email, display_name, phone)
      VALUES (?, ?, ?, ?)
    `).bind(user.id, user.email, displayName || null, phone || null).run();
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (displayName !== undefined) {
    updates.push("display_name = ?");
    values.push(displayName);
  }
  if (phone !== undefined) {
    updates.push("phone = ?");
    values.push(phone);
  }

  if (notifications) {
    if (notifications.channelEmail !== undefined) {
      updates.push("notification_email = ?");
      values.push(notifications.channelEmail ? 1 : 0);
    }
    if (notifications.channelSms !== undefined) {
      updates.push("notification_sms = ?");
      values.push(notifications.channelSms ? 1 : 0);
    }
    if (notifications.leagueInvites !== undefined) {
      updates.push("notification_invites = ?");
      values.push(notifications.leagueInvites ? 1 : 0);
    }
    if (notifications.pickReminders !== undefined) {
      updates.push("notification_reminders = ?");
      values.push(notifications.pickReminders ? 1 : 0);
    }
    if (notifications.weeklyResults !== undefined) {
      updates.push("notification_results = ?");
      values.push(notifications.weeklyResults ? 1 : 0);
    }
    
    // Store extended preferences as JSON
    const extendedPrefs = {
      channelPush: notifications.channelPush,
      pickReminderTiming: notifications.pickReminderTiming,
      deadlineAlerts: notifications.deadlineAlerts,
      scoreUpdates: notifications.scoreUpdates,
      leagueActivity: notifications.leagueActivity,
      memberJoins: notifications.memberJoins,
      chatMessages: notifications.chatMessages,
      quietHoursEnabled: notifications.quietHoursEnabled,
      quietHoursStart: notifications.quietHoursStart,
      quietHoursEnd: notifications.quietHoursEnd,
    };
    updates.push("notification_prefs_json = ?");
    values.push(JSON.stringify(extendedPrefs));
  }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(user.id);

    await c.env.DB.prepare(`
      UPDATE users SET ${updates.join(", ")} WHERE id = ?
    `).bind(...values).run();
  }

  // Log the preference update
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('preferences_updated', ?, ?, 'user', ?, ?)
  `).bind(user.id, user.id, user.id, JSON.stringify({ fieldsUpdated: updates.length })).run();

  return c.json({ success: true });
});

// Logout
app.get("/api/logout", async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  const authConfig = getMochaAuthConfig(c);

  if (typeof sessionToken === "string" && authConfig) {
    await deleteSession(sessionToken, authConfig);
  }

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 0,
  });

  return c.json({ success: true }, 200);
});

// ============ League Routes ============

// Helper to verify user from Authorization header without middleware
async function verifyUserFromHeader(c: Context<{ Bindings: Env }>, authHeader: string): Promise<{ id: string } | null> {
  const authConfig = getMochaAuthConfig(c);
  if (!authConfig) return null;

  try {
    const response = await fetch(`${authConfig.apiUrl}/verify`, {
      headers: {
        Authorization: authHeader,
        "X-API-Key": authConfig.apiKey
      }
    });
    if (!response.ok) return null;
    return await response.json() as { id: string };
  } catch {
    return null;
  }
}

// Demo leagues for unauthenticated users
const DEMO_LEAGUES = [
  {
    id: 1,
    name: "Office NFL Survivor 2024",
    sport_key: "nfl",
    format_key: "survivor",
    season: "2024-25",
    rules_json: '{"lockType":"game_start","visibilityType":"after_lock"}',
    entry_fee_cents: 2500,
    is_payment_required: 1,
    invite_code: "DEMO01",
    owner_id: "demo-user",
    is_public: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: "owner",
    member_count: 12
  },
  {
    id: 2,
    name: "Fantasy Football Pick'em",
    sport_key: "nfl",
    format_key: "pickem",
    season: "2024-25",
    rules_json: '{"scoringType":"spread","lockType":"first_game","visibilityType":"after_lock"}',
    entry_fee_cents: 0,
    is_payment_required: 0,
    invite_code: "DEMO02",
    owner_id: "demo-user-2",
    is_public: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: "member",
    member_count: 8
  }
];

// Demo mode constants
const DEMO_USER_ID = "demo-user-001";

// Demo mode middleware for league routes - allows demo mode OR real auth
async function leagueDemoOrAuthMiddleware(c: any, next: () => Promise<void>) {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return next();
  }
  return authMiddleware(c, next);
}

// Helper to get user ID (supports demo mode) for league routes
function getLeagueUserId(c: any): string | null {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return DEMO_USER_ID;
  }
  const user = c.get("user");
  return user?.id || null;
}

// Demo data generators for league routes
function getDemoLeague(leagueId: string) {
  const id = parseInt(leagueId) || 1;
  return DEMO_LEAGUES.find(l => l.id === id) || {
    ...DEMO_LEAGUES[0],
    id,
    name: `Demo League ${id}`,
  };
}

function getDemoMembers() {
  return [
    { id: 1, user_id: "demo-user-001", role: "owner", is_payment_verified: 1, created_at: new Date().toISOString() },
    { id: 2, user_id: "demo-user-002", role: "member", is_payment_verified: 1, created_at: new Date().toISOString() },
    { id: 3, user_id: "demo-user-003", role: "member", is_payment_verified: 0, created_at: new Date().toISOString() },
  ];
}

function getDemoPeriods() {
  return {
    periods: ["Week 1", "Week 2", "Week 3", "Week 4"],
    currentPeriod: "Week 2",
  };
}

function getDemoEvents() {
  return [
    { id: 1, event_key: "demo_1", sport_key: "nfl", period_id: "Week 2", home_team: "Chiefs", away_team: "Bills", start_at: new Date().toISOString(), status: "scheduled" },
    { id: 2, event_key: "demo_2", sport_key: "nfl", period_id: "Week 2", home_team: "Eagles", away_team: "Cowboys", start_at: new Date().toISOString(), status: "scheduled" },
  ];
}

// Generate a unique invite code
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new league
app.post("/api/leagues", async (c) => {
  // Check for demo mode - simulate league creation without real auth
  const authHeader = c.req.header("Authorization");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  
  if (!authHeader || isDemoMode) {
    // Demo mode: simulate successful league creation
    try {
      await c.req.json(); // consume body even in demo mode
    } catch {
      // ignore parse errors in demo mode
    }
    const demoInviteCode = "DEMO" + Math.random().toString(36).substring(2, 6).toUpperCase();
    return c.json({ 
      id: Math.floor(Math.random() * 1000) + 100, 
      inviteCode: demoInviteCode,
      message: "League created successfully (demo mode)" 
    }, 201);
  }
  
  // Real auth flow
  const user = await verifyUserFromHeader(c, authHeader);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { name, sportKey, formatKey, poolTypeKey, season, entryFeeCents, isPaymentRequired, rules, isPublic,
    entryMode, allowMultipleEntries, maxEntriesPerUser, requiredEntries, missedPickPolicy, allowLateJoins, allowLatePicks, picksPerPeriod, hidePicksUntilLock } = body;
  
  // Check if trying to create a public pool - only allowed if PUBLIC_POOLS flag is enabled
  let poolIsPublic = false;
  if (isPublic) {
    const { isPublicPoolsEnabled } = await import("./services/featureFlagService");
    const publicPoolsEnabled = await isPublicPoolsEnabled(c.env.DB);
    if (!publicPoolsEnabled) {
      return c.json({ 
        error: "Public pools are disabled. All pools are invite-only.",
        feature_flag: "PUBLIC_POOLS",
        enabled: false 
      }, 403);
    }
    poolIsPublic = true;
  }

  if (!name || !sportKey || !formatKey || !season) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const { normalizeFormatKey, getCanonicalPoolType } = await import("./services/poolEngineService");
  const { buildPoolRuleConfig } = await import("../shared/poolRuleConfig");
  const { isSupportedPoolTypeKey, getPoolTypeByKey, validatePoolTypeRules } = await import("../shared/poolTypeCatalog");
  const normalizedFormatKey = normalizeFormatKey(poolTypeKey || formatKey);
  if (!isSupportedPoolTypeKey(normalizedFormatKey)) {
    return c.json({ error: `Unsupported format key: ${poolTypeKey || formatKey}` }, 400);
  }
  const ruleErrors = validatePoolTypeRules({
    sportKey: String(sportKey || ""),
    formatKey: normalizedFormatKey,
    rules: (rules && typeof rules === "object") ? (rules as Record<string, unknown>) : {},
  });
  if (ruleErrors.length > 0) {
    return c.json({ error: "Pool rule validation failed", details: ruleErrors }, 400);
  }
  const poolTypeDefinition = getPoolTypeByKey(normalizedFormatKey);

  const resolvedEntryMode: "single" | "optional" | "required" =
    entryMode === "required" || entryMode === "optional" || entryMode === "single"
      ? entryMode
      : allowMultipleEntries === true
        ? (requiredEntries != null && Number(requiredEntries) > 1 ? "required" : "optional")
        : "single";

  const canonicalRuleConfig = buildPoolRuleConfig(normalizedFormatKey, {
    ...(rules && typeof rules === "object" ? rules : {}),
    entry: {
      mode: resolvedEntryMode,
      max_entries_per_user: Math.max(1, Number(maxEntriesPerUser) || (allowMultipleEntries ? 3 : 1)),
      required_entries: Math.max(1, Number(requiredEntries) || 1),
      entry_naming: "custom",
    },
    missed_pick_behavior: typeof missedPickPolicy === "string" ? missedPickPolicy : undefined,
    allow_late_joins: allowLateJoins !== undefined ? allowLateJoins !== false : undefined,
    allow_late_picks: allowLatePicks !== undefined ? allowLatePicks === true : undefined,
    picks_per_period: picksPerPeriod ?? undefined,
  });

  const normalizedRules = {
    lockType: rules?.lockType || "game_start",
    visibilityType: rules?.visibilityType || "after_lock",
    scoringType: rules?.scoringType || "straight",
    pointsPerWin: Number(rules?.pointsPerWin || 1),
    poolTypeKey: poolTypeDefinition?.key || normalizedFormatKey,
    poolTemplate: poolTypeDefinition?.template || null,
    scheduleType: poolTypeDefinition?.schedule_type || null,
    commissionerOptions: poolTypeDefinition?.commissioner_options || null,
    entryMode: canonicalRuleConfig.entry.mode,
    allowMultipleEntries: canonicalRuleConfig.entry.mode !== "single",
    maxEntriesPerUser: canonicalRuleConfig.entry.max_entries_per_user,
    requiredEntries: canonicalRuleConfig.entry.mode === "required" ? canonicalRuleConfig.entry.required_entries : null,
    missedPickPolicy: canonicalRuleConfig.missed_pick_behavior,
    allowLateJoins: canonicalRuleConfig.allow_late_joins,
    allowLatePicks: canonicalRuleConfig.allow_late_picks,
    picksPerPeriod: canonicalRuleConfig.picks_per_period,
    hidePicksUntilLock: hidePicksUntilLock !== false,
    entry: canonicalRuleConfig.entry,
    missed_pick_behavior: canonicalRuleConfig.missed_pick_behavior,
    allow_late_joins: canonicalRuleConfig.allow_late_joins,
    allow_late_picks: canonicalRuleConfig.allow_late_picks,
    picks_per_period: canonicalRuleConfig.picks_per_period,
    ...(rules && typeof rules === "object" ? rules : {}),
  };
  if (!getCanonicalPoolType(normalizedFormatKey)) {
    return c.json({ error: `No evaluator mapping for format key: ${formatKey}` }, 400);
  }

  // Generate unique invite code
  let inviteCode = generateInviteCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM leagues WHERE invite_code = ?"
    ).bind(inviteCode).first();
    if (!existing) break;
    inviteCode = generateInviteCode();
    attempts++;
  }

  const rulesJson = JSON.stringify(normalizedRules);

  // Create the league
  const result = await c.env.DB.prepare(`
    INSERT INTO leagues (name, sport_key, format_key, season, rules_json, entry_fee_cents, is_payment_required, invite_code, owner_id, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    name,
    sportKey,
    normalizedFormatKey,
    season,
    rulesJson,
    entryFeeCents || 0,
    isPaymentRequired ? 1 : 0,
    inviteCode,
    user.id,
    poolIsPublic ? 1 : 0
  ).run();

  const leagueId = result.meta.last_row_id;

  // Add creator as owner member
  await c.env.DB.prepare(`
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (?, ?, 'owner')
  `).bind(leagueId, user.id).run();

  // Log the creation event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('league_created', ?, ?, ?, 'league', ?, ?)
  `).bind(leagueId, user.id, user.id, leagueId, JSON.stringify({ name, sportKey, formatKey: normalizedFormatKey })).run();

  return c.json({ 
    id: leagueId, 
    inviteCode,
    message: "League created successfully" 
  }, 201);
});

// Get leagues for current user
app.get("/api/leagues", async (c) => {
  // Check for demo mode - return demo leagues
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json(DEMO_LEAGUES);
  }
  
  // Real auth flow
  const user = await verifyUserFromHeader(c, authHeader);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { results } = await c.env.DB.prepare(`
    SELECT 
      l.*,
      lm.role,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
    FROM leagues l
    INNER JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND lm.invite_status = 'joined' AND l.is_active = 1
    ORDER BY l.created_at DESC
  `).bind(user.id).all();

  return c.json(results);
});

// Get single league by ID
app.get("/api/leagues/:id", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  // Demo mode: return demo league data
  if (isDemoMode) {
    return c.json(getDemoLeague(leagueId));
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'
  `).bind(leagueId, userId).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const league = await c.env.DB.prepare(`
    SELECT l.*, 
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
    FROM leagues l
    WHERE l.id = ?
  `).bind(leagueId).first();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }
  const { buildPoolRuleEngineForLeague } = await import("./services/poolRuleEngineService");
  const ruleEngineSnapshot = await buildPoolRuleEngineForLeague({
    env: c.env,
    leagueId,
    userId,
  });

  return c.json({ ...league, role: membership.role, rule_engine_snapshot: ruleEngineSnapshot });
});

// Get computed rule engine payload for a league and period
app.get("/api/leagues/:id/rules-engine", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const period = c.req.query("period") || null;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    const demoLeague = getDemoLeague(String(leagueId));
    const { getTemplateForPoolType } = await import("../shared/poolTypeCatalog");
    const { generatePoolRuleEngineOutput } = await import("../shared/poolRuleEngine");
    const output = generatePoolRuleEngineOutput({
      template: getTemplateForPoolType(String(demoLeague?.format_key || "pickem")),
      scheduleType: ["weekly"],
      settings: {},
      userState: {
        currentPeriod: period || "Week 1",
        picksSubmittedCount: 0,
        eligibleEventsCount: 0,
      },
    });
    return c.json(output);
  }

  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'
  `).bind(leagueId, userId).first();
  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const { buildPoolRuleEngineForLeague } = await import("./services/poolRuleEngineService");
  const payload = await buildPoolRuleEngineForLeague({
    env: c.env,
    leagueId,
    userId,
    periodId: period,
  });

  if (!payload) {
    return c.json({ error: "League not found" }, 404);
  }
  return c.json(payload);
});

// Get server-side rules acceptance status (auditable acceptance record)
app.get("/api/leagues/:id/rules-acceptance", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json({ accepted: true, accepted_at: null, rule_hash: null });
  }

  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'
  `).bind(leagueId, userId).first();
  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  let acceptance: {
    accepted_at: string | null;
    rule_hash: string | null;
    rule_snapshot_json: string | null;
  } | null = null;
  try {
    acceptance = await c.env.DB.prepare(`
      SELECT accepted_at, rule_hash, rule_snapshot_json
      FROM league_rule_acceptance
      WHERE league_id = ? AND user_id = ?
      LIMIT 1
    `).bind(leagueId, userId).first<{
      accepted_at: string | null;
      rule_hash: string | null;
      rule_snapshot_json: string | null;
    }>();
  } catch {
    // Graceful fallback before migration 92 is applied.
    return c.json({
      accepted: false,
      accepted_at: null,
      rule_hash: null,
      has_snapshot: false,
      storage_ready: false,
    });
  }

  return c.json({
    accepted: Boolean(acceptance),
    accepted_at: acceptance?.accepted_at || null,
    rule_hash: acceptance?.rule_hash || null,
    has_snapshot: Boolean(acceptance?.rule_snapshot_json),
  });
});

// Record server-side rules acceptance for compliance/dispute audit
app.post("/api/leagues/:id/rules-acceptance", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json({ success: true, accepted_at: new Date().toISOString(), demo_mode: true });
  }

  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'
  `).bind(leagueId, userId).first();
  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const ruleHash = String(body?.rule_hash || "").trim() || null;
  const snapshotRaw = body?.rule_snapshot;
  const ruleSnapshotJson = snapshotRaw ? JSON.stringify(snapshotRaw) : null;

  let saved: { accepted_at: string | null; rule_hash: string | null } | null = null;
  try {
    await c.env.DB.prepare(`
      INSERT INTO league_rule_acceptance (league_id, user_id, accepted_at, rule_hash, rule_snapshot_json, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(league_id, user_id) DO UPDATE SET
        accepted_at = CURRENT_TIMESTAMP,
        rule_hash = excluded.rule_hash,
        rule_snapshot_json = excluded.rule_snapshot_json,
        updated_at = CURRENT_TIMESTAMP
    `).bind(leagueId, userId, ruleHash, ruleSnapshotJson).run();

    saved = await c.env.DB.prepare(`
      SELECT accepted_at, rule_hash
      FROM league_rule_acceptance
      WHERE league_id = ? AND user_id = ?
      LIMIT 1
    `).bind(leagueId, userId).first<{ accepted_at: string | null; rule_hash: string | null }>();
  } catch {
    return c.json({
      success: false,
      accepted_at: null,
      rule_hash: null,
      storage_ready: false,
      message: "Rules acceptance storage is not ready. Apply migration 92.",
    }, 503);
  }

  return c.json({
    success: true,
    accepted_at: saved?.accepted_at || null,
    rule_hash: saved?.rule_hash || null,
  });
});

// PUBLIC POOLS - List discoverable pools (only when PUBLIC_POOLS flag is enabled)
app.get("/api/leagues/public", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Check if public pools feature is enabled
  const { isPublicPoolsEnabled } = await import("./services/featureFlagService");
  const isEnabled = await isPublicPoolsEnabled(c.env.DB);
  
  if (!isEnabled) {
    return c.json({ 
      error: "Public pool browsing is disabled. Pools are invite-only.",
      feature_flag: "PUBLIC_POOLS",
      enabled: false 
    }, 403);
  }

  // Only show pools marked as public/discoverable
  const { results } = await c.env.DB.prepare(`
    SELECT 
      l.id, l.name, l.sport_key, l.format_key, l.season, l.entry_fee_cents,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count,
      EXISTS(SELECT 1 FROM league_members WHERE league_id = l.id AND user_id = ?) as is_member
    FROM leagues l
    WHERE l.is_active = 1 AND l.is_public = 1
    ORDER BY member_count DESC, l.created_at DESC
    LIMIT 50
  `).bind(user.id).all();

  return c.json(results);
});

// Get league by invite code (for join flow)
app.get("/api/leagues/invite/:code", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const inviteCode = c.req.param("code").toUpperCase();

  const league = await c.env.DB.prepare(`
    SELECT l.id, l.name, l.sport_key, l.format_key, l.season, l.entry_fee_cents, l.rules_json,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
    FROM leagues l
    WHERE l.invite_code = ? AND l.is_active = 1
  `).bind(inviteCode).first();

  if (!league) {
    return c.json({ error: "League not found or inactive" }, 404);
  }

  // Check if already a member
  const membership = await c.env.DB.prepare(`
    SELECT role, invite_status FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(league.id, user.id).first();

  const rawRules = typeof league.rules_json === "string" ? league.rules_json : "{}";
  const { deserializePoolRuleConfig } = await import("../shared/poolRuleConfig");
  let parsedRules: Record<string, unknown> = {};
  try {
    parsedRules = JSON.parse(rawRules);
  } catch {
    parsedRules = {};
  }
  const canonicalRules = deserializePoolRuleConfig(String(league.format_key || "pickem"), rawRules);
  const joinRequirements = {
    approvalRequired: parsedRules.joinApprovalRequired === true,
    requireEmail: parsedRules.requireJoinEmail === true,
    requirePhone: parsedRules.requireJoinPhone === true,
    autoApproveWhenProfileComplete: parsedRules.joinAutoApproveWhenProfileComplete === true,
    notifyAdminsOnRequest: parsedRules.joinNotifyAdminsOnRequest !== false,
    notifyUsersOnStatusChange: parsedRules.joinNotifyUsersOnStatusChange !== false,
  };
  const entryMode = canonicalRules.entry.mode;
  const allowMultipleEntries = entryMode !== "single";
  const maxEntriesPerUser = Math.max(1, Number(canonicalRules.entry.max_entries_per_user || 1));
  const requiredEntries = Math.max(1, Number(canonicalRules.entry.required_entries || 1));
  const entryPackageOptions = Array.isArray(parsedRules.entry_package_options)
    ? parsedRules.entry_package_options
    : Array.isArray(parsedRules.entryPackageOptions)
      ? parsedRules.entryPackageOptions
      : entryMode === "required"
        ? [requiredEntries]
        : Array.from({ length: maxEntriesPerUser }, (_, i) => i + 1);
  const requirePaymentBeforeEntry =
    parsedRules.require_payment_before_entry === true || parsedRules.requirePaymentBeforeEntry === true;

  const userProfile = await c.env.DB.prepare(`
    SELECT email, phone FROM users WHERE id = ?
  `).bind(user.id).first<{ email: string | null; phone: string | null }>();

  const missingEmail = joinRequirements.requireEmail && !((userProfile?.email || user.email || "").trim());
  const missingPhone = joinRequirements.requirePhone && !(userProfile?.phone || "").trim();

  const leaguePublic = { ...(league as Record<string, unknown>) };
  delete leaguePublic.rules_json;

  return c.json({
    ...leaguePublic,
    isMember: !!membership && membership.invite_status === "joined",
    membershipStatus: membership?.invite_status || null,
    joinRequirements,
    entrySettings: {
      entryMode,
      allowMultipleEntries,
      maxEntriesPerUser,
      requiredEntries,
      entryPackageOptions,
      requirePaymentBeforeEntry,
    },
    profileRequirements: {
      missingEmail,
      missingPhone,
    },
  });
});

// Join a league
app.post("/api/leagues/join", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const {
    inviteCode,
    email,
    phone,
    requestedEntries,
    entryNames,
  } = await c.req.json<{
    inviteCode: string;
    email?: string;
    phone?: string;
    requestedEntries?: number;
    entryNames?: string[];
  }>();

  if (!inviteCode) {
    return c.json({ error: "Invite code required" }, 400);
  }

  const league = await c.env.DB.prepare(`
    SELECT id, name, format_key, rules_json FROM leagues WHERE invite_code = ? AND is_active = 1
  `).bind(inviteCode.toUpperCase()).first<{ id: number; name: string; format_key: string; rules_json: string | null }>();

  if (!league) {
    return c.json({ error: "Invalid invite code" }, 404);
  }

  // Check if already a member
  const existing = await c.env.DB.prepare(`
    SELECT id, invite_status FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(league.id, user.id).first<{ id: number; invite_status: string }>();

  if (existing?.invite_status === "joined") {
    return c.json({ error: "Already a member of this league" }, 400);
  }

  let parsedRules: Record<string, unknown> = {};
  try {
    parsedRules = JSON.parse(league.rules_json || "{}");
  } catch {
    parsedRules = {};
  }
  const { deserializePoolRuleConfig } = await import("../shared/poolRuleConfig");
  const canonicalRules = deserializePoolRuleConfig(league.format_key, league.rules_json || "{}");
  const joinApprovalRequired = parsedRules.joinApprovalRequired === true;
  const requireJoinEmail = parsedRules.requireJoinEmail === true;
  const requireJoinPhone = parsedRules.requireJoinPhone === true;
  const joinAutoApproveWhenProfileComplete = parsedRules.joinAutoApproveWhenProfileComplete === true;
  const joinNotifyAdminsOnRequest = parsedRules.joinNotifyAdminsOnRequest !== false;
  const joinNotifyUsersOnStatusChange = parsedRules.joinNotifyUsersOnStatusChange !== false;
  const entryMode = canonicalRules.entry.mode;
  const allowMultipleEntries = entryMode !== "single";
  const maxEntriesPerUser = Math.max(1, Number(canonicalRules.entry.max_entries_per_user || 1));
  const requiredEntries = Math.max(1, Number(canonicalRules.entry.required_entries || 1));
  const normalizedRequestedEntries = Number.isFinite(Number(requestedEntries))
    ? Math.max(1, Math.floor(Number(requestedEntries)))
    : 1;
  const finalRequestedEntries = entryMode === "required"
    ? requiredEntries
    : Math.min(allowMultipleEntries ? maxEntriesPerUser : 1, normalizedRequestedEntries);

  const userProfile = await c.env.DB.prepare(`
    SELECT email, phone FROM users WHERE id = ?
  `).bind(user.id).first<{ email: string | null; phone: string | null }>();

  const effectiveEmail = typeof email === "string" && email.trim() ? email.trim() : (userProfile?.email || user.email || "");
  const effectivePhone = typeof phone === "string" && phone.trim() ? phone.trim() : (userProfile?.phone || "");

  if (requireJoinEmail && !effectiveEmail) {
    return c.json({ error: "Email is required to request access to this pool.", code: "JOIN_EMAIL_REQUIRED" }, 400);
  }
  if (requireJoinPhone && !effectivePhone) {
    return c.json({ error: "Phone number is required to request access to this pool.", code: "JOIN_PHONE_REQUIRED" }, 400);
  }

  // Persist profile fields submitted during join flow.
  if (effectiveEmail || effectivePhone) {
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (effectiveEmail) {
      updates.push("email = ?");
      values.push(effectiveEmail);
    }
    if (effectivePhone) {
      updates.push("phone = ?");
      values.push(effectivePhone);
    }
    if (updates.length > 0) {
      values.push(user.id);
      await c.env.DB.prepare(`
        UPDATE users SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(...values).run();
    }
  }

  const autoApproveByRule =
    joinApprovalRequired &&
    joinAutoApproveWhenProfileComplete &&
    (!requireJoinEmail || Boolean(effectiveEmail)) &&
    (!requireJoinPhone || Boolean(effectivePhone));
  const membershipStatus = (joinApprovalRequired && !autoApproveByRule) ? "pending_approval" : "joined";
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE league_members
      SET role = 'member',
          invite_status = ?,
          invited_at = CASE WHEN ? = 'pending_approval' THEN ? ELSE invited_at END,
          joined_at = CASE WHEN ? = 'joined' THEN ? ELSE joined_at END,
          removed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      membershipStatus,
      membershipStatus,
      now,
      membershipStatus,
      now,
      existing.id
    ).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO league_members (league_id, user_id, role, invite_status, invited_at, joined_at)
      VALUES (?, ?, 'member', ?, ?, ?)
    `).bind(
      league.id,
      user.id,
      membershipStatus,
      membershipStatus === "pending_approval" ? now : null,
      membershipStatus === "joined" ? now : null
    ).run();
  }

  // Log the join/request event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id)
    VALUES (?, ?, ?, ?, 'league_member', ?)
  `).bind(
    membershipStatus === "pending_approval" ? "member_join_requested" : "member_joined",
    league.id,
    user.id,
    user.id,
    league.id
  ).run();

  if (membershipStatus === "pending_approval") {
    if (joinNotifyAdminsOnRequest) {
      // Notify all pool admins/owners about the pending request.
      const { results: admins } = await c.env.DB.prepare(`
        SELECT user_id
        FROM league_members
        WHERE league_id = ? AND role IN ('owner', 'admin') AND invite_status = 'joined'
      `).bind(league.id).all();

      const requesterLabel = (effectiveEmail || user.email || "A user").trim();
      for (const adminRow of admins || []) {
        const adminUserId = String(adminRow.user_id || "");
        if (!adminUserId || adminUserId === user.id) continue;
        await c.env.DB.prepare(`
          INSERT INTO notifications (user_id, type, title, body, url, metadata_json)
          VALUES (?, 'league_invite', ?, ?, ?, ?)
        `).bind(
          adminUserId,
          "New join request",
          `${requesterLabel} requested access to ${league.name}.`,
          `/pool-admin/members?pool=${league.id}`,
          JSON.stringify({ league_id: league.id, requester_user_id: user.id, status: "pending_approval" })
        ).run();
      }
    }

    if (joinNotifyUsersOnStatusChange) {
      // Notify requester that request is pending.
      await c.env.DB.prepare(`
        INSERT INTO notifications (user_id, type, title, body, url, metadata_json)
        VALUES (?, 'league_invite', ?, ?, ?, ?)
      `).bind(
        user.id,
        "Join request submitted",
        `Your request to join ${league.name} is waiting for commissioner approval.`,
        "/join",
        JSON.stringify({ league_id: league.id, status: "pending_approval" })
      ).run();
    }

    return c.json({
      leagueId: league.id,
      leagueName: league.name,
      requestedEntries: finalRequestedEntries,
      status: "pending_approval",
      message: "Join request submitted. Waiting for commissioner approval.",
    });
  }

  if (membershipStatus === "joined") {
    const existingEntries = await c.env.DB.prepare(`
      SELECT id, entry_number
      FROM pool_entries
      WHERE league_id = ? AND user_id = ?
      ORDER BY entry_number ASC
    `).bind(league.id, user.id).all<{ id: number; entry_number: number }>();

    if ((existingEntries.results || []).length === 0) {
      for (let i = 1; i <= finalRequestedEntries; i++) {
        const submittedName = Array.isArray(entryNames) ? entryNames[i - 1] : "";
        const nameFromUser = typeof submittedName === "string" ? submittedName.trim() : "";
        const fallbackName = i === 1 ? "Main Entry" : `Entry ${i}`;
        const createdEntry = await c.env.DB.prepare(`
          INSERT INTO pool_entries (
            league_id,
            user_id,
            entry_number,
            entry_name,
            is_primary,
            entry_fee_cents,
            metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          league.id,
          user.id,
          i,
          nameFromUser || fallbackName,
          i === 1 ? 1 : 0,
          0,
          JSON.stringify({ source: "league_join" }),
        ).run();
        const createdEntryId = Number(createdEntry.meta.last_row_id || 0);
        if (createdEntryId > 0) {
          await writePoolEntryEvent(c.env.DB, {
            poolEntryId: createdEntryId,
            leagueId: league.id,
            userId: user.id,
            periodId: null,
            eventType: "entry_created",
            payload: {
              source: "league_join",
              entryNumber: i,
              entryName: nameFromUser || fallbackName,
            },
          });
        }
      }
    }
  }

  if (autoApproveByRule && joinNotifyUsersOnStatusChange) {
    await c.env.DB.prepare(`
      INSERT INTO notifications (user_id, type, title, body, url, metadata_json)
      VALUES (?, 'league_invite', ?, ?, ?, ?)
    `).bind(
      user.id,
      "Joined automatically",
      `You were automatically approved and joined ${league.name}.`,
      `/pools/${league.id}`,
      JSON.stringify({ league_id: league.id, status: "joined_auto_approved" })
    ).run();
  }

  return c.json({
    leagueId: league.id,
    leagueName: league.name,
    requestedEntries: finalRequestedEntries,
    status: "joined",
    message: "Successfully joined league",
  });
});

// Get league members
app.get("/api/leagues/:id/members", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  // Demo mode: return demo members
  if (isDemoMode) {
    return c.json(getDemoMembers());
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, userId).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT lm.id, lm.user_id, lm.role, lm.is_payment_verified, lm.created_at
    FROM league_members lm
    WHERE lm.league_id = ?
    ORDER BY lm.created_at ASC
  `).bind(leagueId).all();

  return c.json(results);
});

// Update league settings (owner/admin only)
app.patch("/api/leagues/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const body = await c.req.json();
  const { name, season, entryFeeCents, isActive } = body;

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (name !== undefined) {
    updates.push("name = ?");
    values.push(name);
  }
  if (season !== undefined) {
    updates.push("season = ?");
    values.push(season);
  }
  if (entryFeeCents !== undefined) {
    updates.push("entry_fee_cents = ?");
    values.push(entryFeeCents);
  }
  if (isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(isActive ? 1 : 0);
  }
  const chatToggled = body.isChatEnabled !== undefined;
  if (chatToggled) {
    updates.push("is_chat_enabled = ?");
    values.push(body.isChatEnabled ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: "No updates provided" }, 400);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(leagueId);

  await c.env.DB.prepare(`
    UPDATE leagues SET ${updates.join(", ")} WHERE id = ?
  `).bind(...values).run();

  // Log the update
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('league_updated', ?, ?, ?, 'league', ?, ?)
  `).bind(leagueId, user.id, user.id, leagueId, JSON.stringify(body)).run();

  // Log specific chat toggle event for audit trail
  if (chatToggled) {
    await c.env.DB.prepare(`
      INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
      VALUES ('chat_toggled', ?, ?, ?, 'league', ?, ?)
    `).bind(leagueId, user.id, user.id, leagueId, JSON.stringify({ enabled: body.isChatEnabled })).run();
  }

  return c.json({ success: true });
});

// Update member role (owner only)
app.patch("/api/leagues/:id/members/:memberId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const memberId = c.req.param("memberId");

  // Check owner access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Owner access required" }, 403);
  }

  const { role } = await c.req.json();

  if (!role || !["member", "admin"].includes(role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  // Get target member
  const targetMember = await c.env.DB.prepare(`
    SELECT user_id, role FROM league_members WHERE id = ? AND league_id = ?
  `).bind(memberId, leagueId).first<{ user_id: string; role: string }>();

  if (!targetMember) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (targetMember.role === "owner") {
    return c.json({ error: "Cannot change owner role" }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE league_members SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(role, memberId).run();

  // Log the role change
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('member_role_changed', ?, ?, ?, 'league_member', ?, ?)
  `).bind(leagueId, targetMember.user_id, user.id, memberId, JSON.stringify({ oldRole: targetMember.role, newRole: role })).run();

  return c.json({ success: true });
});

// Remove member (owner only)
app.delete("/api/leagues/:id/members/:memberId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const memberId = c.req.param("memberId");

  // Check owner access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Owner access required" }, 403);
  }

  // Get target member
  const targetMember = await c.env.DB.prepare(`
    SELECT user_id, role FROM league_members WHERE id = ? AND league_id = ?
  `).bind(memberId, leagueId).first<{ user_id: string; role: string }>();

  if (!targetMember) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (targetMember.role === "owner") {
    return c.json({ error: "Cannot remove league owner" }, 400);
  }

  await c.env.DB.prepare(`
    DELETE FROM league_members WHERE id = ?
  `).bind(memberId).run();

  // Log the removal
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, reason)
    VALUES ('member_removed', ?, ?, ?, 'league_member', ?, 'Removed by owner')
  `).bind(leagueId, targetMember.user_id, user.id, memberId).run();

  return c.json({ success: true });
});

// Get available periods for a league
app.get("/api/leagues/:id/periods", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  // Demo mode: return demo periods
  if (isDemoMode) {
    return c.json(getDemoPeriods());
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, userId).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const league = await c.env.DB.prepare(`
    SELECT sport_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ sport_key: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  // Get distinct periods from events for this sport
  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT period_id FROM events 
    WHERE sport_key = ? 
    ORDER BY period_id ASC
  `).bind(league.sport_key).all();

  const periods = results.map((r: Record<string, unknown>) => r.period_id as string);
  
  // Find current period (first one with upcoming games)
  const now = new Date().toISOString();
  const currentPeriodResult = await c.env.DB.prepare(`
    SELECT period_id FROM events 
    WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC
    LIMIT 1
  `).bind(league.sport_key, now).first<{ period_id: string }>();

  return c.json({
    periods,
    currentPeriod: currentPeriodResult?.period_id || periods[periods.length - 1] || null,
  });
});

// Get events for a league's period
app.get("/api/leagues/:id/events", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const period = c.req.query("period");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (!period) {
    return c.json({ error: "Period required" }, 400);
  }

  // Demo mode: return demo events
  if (isDemoMode) {
    return c.json(getDemoEvents());
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, userId).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const league = await c.env.DB.prepare(`
    SELECT sport_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ sport_key: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM events 
    WHERE sport_key = ? AND period_id = ?
    ORDER BY start_at ASC
  `).bind(league.sport_key, period).all();

  return c.json(results);
});

// Get ALL members' picks for a period (for live grid view)
app.get("/api/leagues/:id/all-picks", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const period = c.req.query("period");
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (!period) {
    return c.json({ error: "Period required" }, 400);
  }

  // Demo mode: return empty picks (no demo picks data)
  if (isDemoMode) {
    return c.json({
      members: getDemoMembers().map(m => ({ user_id: m.user_id, user_name: `User ${m.id}`, avatar_url: null })),
      picks: {},
    });
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, userId).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get all members with their picks for this period
  const { results: members } = await c.env.DB.prepare(`
    SELECT lm.user_id, COALESCE(u.display_name, u.email) as user_name, u.avatar_url
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ?
  `).bind(leagueId).all();

  // Get all picks for this period
  const { results: picks } = await c.env.DB.prepare(`
    SELECT p.user_id, p.event_id, p.pick_value, p.confidence_rank, p.is_correct, p.points_earned
    FROM picks p
    WHERE p.league_id = ? AND p.period_id = ?
  `).bind(leagueId, period).all();

  // Get events for this period to check lock status
  const league = await c.env.DB.prepare(`
    SELECT sport_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ sport_key: string }>();

  const { results: events } = await c.env.DB.prepare(`
    SELECT id, start_at, status FROM events 
    WHERE sport_key = ? AND period_id = ?
  `).bind(league?.sport_key || "", period).all();

  const now = new Date().toISOString();
  const eventLockStatus: Record<number, boolean> = {};
  for (const event of events) {
    const isLocked = (event.start_at as string) <= now || event.status !== "scheduled";
    eventLockStatus[event.id as number] = isLocked;
  }

  // Build picks by member, respecting lock status
  const memberPicks: Record<string, any[]> = {};
  for (const pick of picks) {
    const userId = pick.user_id as string;
    const eventId = pick.event_id as number;
    const isLocked = eventLockStatus[eventId] ?? true;
    
    if (!memberPicks[userId]) {
      memberPicks[userId] = [];
    }
    
    // Only include pick value if game is locked OR it's the current user's pick
    memberPicks[userId].push({
      event_id: eventId,
      pick_value: (isLocked || (pick.user_id as string) === userId) ? pick.pick_value : null,
      confidence_rank: pick.confidence_rank,
      is_correct: pick.is_correct,
      points_earned: pick.points_earned,
    });
  }

  // Format response with all members and their picks
  const result = members.map((member: Record<string, unknown>) => ({
    userId: member.user_id,
    userName: member.user_name,
    avatar: member.avatar_url,
    isCurrentUser: member.user_id === userId,
    picks: memberPicks[member.user_id as string] || [],
  }));

  return c.json(result);
});

interface PoolEntryRecord {
  id: number;
  league_id: number;
  user_id: number;
  entry_number: number;
  entry_name: string | null;
  is_primary: number;
  status: string;
}

async function getOrCreateUserPoolEntries(
  db: D1Database,
  leagueId: string | number,
  userId: string | number,
): Promise<PoolEntryRecord[]> {
  const existing = await db.prepare(`
    SELECT id, league_id, user_id, entry_number, entry_name, is_primary, status
    FROM pool_entries
    WHERE league_id = ? AND user_id = ?
    ORDER BY is_primary DESC, entry_number ASC, id ASC
  `).bind(leagueId, userId).all<PoolEntryRecord>();

  if ((existing.results || []).length > 0) {
    return existing.results || [];
  }

  await db.prepare(`
    INSERT INTO pool_entries (league_id, user_id, entry_number, entry_name, is_primary, entry_fee_cents, metadata_json)
    VALUES (?, ?, 1, 'Main Entry', 1, 0, ?)
  `).bind(leagueId, userId, JSON.stringify({ source: "auto_backfill" })).run();

  const backfilled = await db.prepare(`
    SELECT id, league_id, user_id, entry_number, entry_name, is_primary, status
    FROM pool_entries
    WHERE league_id = ? AND user_id = ?
    ORDER BY is_primary DESC, entry_number ASC, id ASC
  `).bind(leagueId, userId).all<PoolEntryRecord>();

  return backfilled.results || [];
}

function pickActiveEntry(
  entries: PoolEntryRecord[],
  requestedEntryId?: number | null,
): PoolEntryRecord | null {
  if (entries.length === 0) return null;
  if (typeof requestedEntryId === "number" && Number.isFinite(requestedEntryId)) {
    return entries.find((entry) => entry.id === requestedEntryId) || null;
  }
  return entries[0];
}

async function writePoolEntryEvent(
  db: D1Database,
  input: {
    poolEntryId: number;
    leagueId: string | number;
    userId: string | number;
    periodId?: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
    createdAt?: string | null;
  },
) {
  if (input.createdAt) {
    await db.prepare(`
      INSERT INTO pool_entry_events (pool_entry_id, league_id, user_id, period_id, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      input.poolEntryId,
      input.leagueId,
      input.userId,
      input.periodId || null,
      input.eventType,
      input.payload ? JSON.stringify(input.payload) : null,
      input.createdAt,
    ).run();
    return;
  }
  await db.prepare(`
    INSERT INTO pool_entry_events (pool_entry_id, league_id, user_id, period_id, event_type, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    input.poolEntryId,
    input.leagueId,
    input.userId,
    input.periodId || null,
    input.eventType,
    input.payload ? JSON.stringify(input.payload) : null,
  ).run();
}

// Get current user's entries in a league
app.get("/api/leagues/:id/my-entries", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const entries = await getOrCreateUserPoolEntries(c.env.DB, leagueId, user.id);
  return c.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      entryNumber: entry.entry_number,
      entryName: entry.entry_name || `Entry ${entry.entry_number}`,
      isPrimary: entry.is_primary === 1,
      status: entry.status || "active",
    })),
  });
});

async function backfillPoolEntryEvents(
  db: D1Database,
  input: {
    leagueId: string;
    targetUserId?: number | null;
    dryRun?: boolean;
  },
): Promise<{
  entriesProcessed: number;
  entryCreatedInserted: number;
  picksSubmittedInserted: number;
  pickScoredInserted: number;
}> {
  const dryRun = input.dryRun === true;
  const entriesResult = await db.prepare(`
    SELECT id, league_id, user_id, entry_number, entry_name, created_at
    FROM pool_entries
    WHERE league_id = ?
      ${input.targetUserId !== null && input.targetUserId !== undefined ? "AND user_id = ?" : ""}
    ORDER BY user_id ASC, entry_number ASC
  `).bind(
    ...(input.targetUserId !== null && input.targetUserId !== undefined
      ? [input.leagueId, input.targetUserId]
      : [input.leagueId])
  ).all<{
    id: number;
    league_id: number;
    user_id: number;
    entry_number: number;
    entry_name: string | null;
    created_at: string;
  }>();

  const groupedRows = await db.prepare(`
    SELECT
      COALESCE(p.entry_id, pe.id) as resolved_entry_id,
      p.user_id,
      p.period_id,
      MAX(p.created_at) as submitted_at,
      COUNT(*) as pick_count,
      SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
      SUM(CASE WHEN p.is_correct = 0 THEN 1 ELSE 0 END) as incorrect_count,
      SUM(COALESCE(p.points_earned, 0)) as points_earned
    FROM picks p
    LEFT JOIN pool_entries pe
      ON pe.league_id = p.league_id
      AND pe.user_id = p.user_id
      AND pe.is_primary = 1
    WHERE p.league_id = ?
      ${input.targetUserId !== null && input.targetUserId !== undefined ? "AND p.user_id = ?" : ""}
    GROUP BY COALESCE(p.entry_id, pe.id), p.user_id, p.period_id
    HAVING resolved_entry_id IS NOT NULL
  `).bind(
    ...(input.targetUserId !== null && input.targetUserId !== undefined
      ? [input.leagueId, input.targetUserId]
      : [input.leagueId])
  ).all<{
    resolved_entry_id: number;
    user_id: number;
    period_id: string;
    submitted_at: string;
    pick_count: number;
    correct_count: number;
    incorrect_count: number;
    points_earned: number;
  }>();

  let entryCreatedInserted = 0;
  let picksSubmittedInserted = 0;
  let pickScoredInserted = 0;

  for (const entry of entriesResult.results || []) {
    const existingCreated = await db.prepare(`
      SELECT id
      FROM pool_entry_events
      WHERE pool_entry_id = ? AND event_type = 'entry_created'
      LIMIT 1
    `).bind(entry.id).first<{ id: number }>();
    if (!existingCreated) {
      if (!dryRun) {
        await writePoolEntryEvent(db, {
          poolEntryId: entry.id,
          leagueId: input.leagueId,
          userId: entry.user_id,
          periodId: null,
          eventType: "entry_created",
          payload: {
            source: "backfill",
            entryNumber: entry.entry_number,
            entryName: entry.entry_name || `Entry ${entry.entry_number}`,
            message: `Entry created (${entry.entry_name || `Entry ${entry.entry_number}`})`,
          },
          createdAt: entry.created_at || null,
        });
      }
      entryCreatedInserted += 1;
    }
  }

  for (const row of groupedRows.results || []) {
    const existingSubmission = await db.prepare(`
      SELECT id
      FROM pool_entry_events
      WHERE pool_entry_id = ? AND period_id = ? AND event_type = 'picks_submitted'
      LIMIT 1
    `).bind(row.resolved_entry_id, row.period_id).first<{ id: number }>();
    if (!existingSubmission) {
      if (!dryRun) {
        await writePoolEntryEvent(db, {
          poolEntryId: row.resolved_entry_id,
          leagueId: input.leagueId,
          userId: row.user_id,
          periodId: row.period_id,
          eventType: "picks_submitted",
          payload: {
            source: "backfill",
            pickCount: Number(row.pick_count || 0),
            message: `${Number(row.pick_count || 0)} pick${Number(row.pick_count || 0) === 1 ? "" : "s"} submitted`,
          },
          createdAt: row.submitted_at || null,
        });
      }
      picksSubmittedInserted += 1;
    }

    const scoreTouched = Number(row.correct_count || 0) + Number(row.incorrect_count || 0);
    if (scoreTouched > 0) {
      const existingScored = await db.prepare(`
        SELECT id
        FROM pool_entry_events
        WHERE pool_entry_id = ? AND period_id = ? AND event_type = 'pick_scored'
        LIMIT 1
      `).bind(row.resolved_entry_id, row.period_id).first<{ id: number }>();
      if (!existingScored) {
        if (!dryRun) {
          await writePoolEntryEvent(db, {
            poolEntryId: row.resolved_entry_id,
            leagueId: input.leagueId,
            userId: row.user_id,
            periodId: row.period_id,
            eventType: "pick_scored",
            payload: {
              source: "backfill",
              correctCount: Number(row.correct_count || 0),
              incorrectCount: Number(row.incorrect_count || 0),
              pointsEarned: Number(row.points_earned || 0),
              message: `Scored ${Number(row.correct_count || 0)}/${scoreTouched} picks for ${Number(row.points_earned || 0)} point${Number(row.points_earned || 0) === 1 ? "" : "s"}`,
            },
            createdAt: row.submitted_at || null,
          });
        }
        pickScoredInserted += 1;
      }
    }
  }

  return {
    entriesProcessed: (entriesResult.results || []).length,
    entryCreatedInserted,
    picksSubmittedInserted,
    pickScoredInserted,
  };
}

app.post("/api/leagues/:id/backfill-entry-events", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'
  `).bind(leagueId, user.id).first<{ role: string }>();
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const body = await c.req.json().catch(() => ({})) as {
    dryRun?: boolean;
    userId?: number;
  };
  const targetUserId = Number.isFinite(Number(body.userId)) ? Number(body.userId) : null;
  const result = await backfillPoolEntryEvents(c.env.DB, {
    leagueId,
    targetUserId,
    dryRun: body.dryRun === true,
  });

  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, payload_json)
    VALUES ('pool_entry_events_backfilled', ?, ?, ?, 'league', ?)
  `).bind(
    leagueId,
    targetUserId ?? user.id,
    user.id,
    JSON.stringify({
      league_id: Number(leagueId),
      dryRun: body.dryRun === true,
      targetUserId,
      ...result,
    }),
  ).run();

  return c.json({
    success: true,
    dryRun: body.dryRun === true,
    targetUserId,
    ...result,
  });
});

app.get("/api/leagues/:id/my-entries/history", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const entries = await getOrCreateUserPoolEntries(c.env.DB, leagueId, user.id);
  if (!entries.length) {
    return c.json({ entries: [] });
  }

  // Opportunistic self-backfill keeps legacy pools usable immediately.
  await backfillPoolEntryEvents(c.env.DB, {
    leagueId,
    targetUserId: Number.isFinite(Number(user.id)) ? Number(user.id) : null,
    dryRun: false,
  });

  const entryById = new Map<number, PoolEntryRecord>();
  const primaryEntry = entries.find((entry) => entry.is_primary === 1) || entries[0];
  const primaryEntryId = primaryEntry.id;
  for (const entry of entries) {
    entryById.set(entry.id, entry);
  }

  const picksRows = await c.env.DB.prepare(`
    SELECT
      p.entry_id,
      p.period_id,
      p.event_id,
      p.pick_value,
      p.confidence_rank,
      p.is_correct,
      p.points_earned,
      p.created_at,
      e.status as event_status,
      e.winner,
      e.home_team,
      e.away_team
    FROM picks p
    LEFT JOIN events e ON e.id = p.event_id
    WHERE p.league_id = ? AND p.user_id = ?
    ORDER BY p.period_id ASC, p.created_at ASC
  `).bind(leagueId, user.id).all<{
    entry_id: number | null;
    period_id: string;
    event_id: number;
    pick_value: string;
    confidence_rank: number | null;
    is_correct: number | null;
    points_earned: number | null;
    created_at: string;
    event_status: string | null;
    winner: string | null;
    home_team: string | null;
    away_team: string | null;
  }>();

  const standingsRows = await c.env.DB.prepare(`
    SELECT period_id, entry_id, rank, total_points, correct_picks, total_picks, win_percentage, snapshot_at
    FROM standings_history
    WHERE league_id = ? AND user_id = ?
    ORDER BY period_id ASC, snapshot_at ASC
  `).bind(leagueId, user.id).all<{
    period_id: string;
    entry_id: number | null;
    rank: number;
    total_points: number;
    correct_picks: number;
    total_picks: number;
    win_percentage: number;
    snapshot_at: string;
  }>();

  const eventRows = await c.env.DB.prepare(`
    SELECT pool_entry_id, period_id, event_type, payload_json, created_at
    FROM pool_entry_events
    WHERE league_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(leagueId, user.id).all<{
    pool_entry_id: number;
    period_id: string | null;
    event_type: string;
    payload_json: string | null;
    created_at: string;
  }>();

  const survivorRows = await c.env.DB.prepare(`
    SELECT entry_number, lives_remaining, is_eliminated, eliminated_period, reentry_from_entry_id
    FROM survivor_entries
    WHERE league_id = ? AND user_id = ?
    ORDER BY entry_number ASC
  `).bind(leagueId, user.id).all<{
    entry_number: number;
    lives_remaining: number;
    is_eliminated: number;
    eliminated_period: string | null;
    reentry_from_entry_id: number | null;
  }>();

  const pointsByEntryPeriod = new Map<string, { points: number; correct: number; total: number }>();
  const periodsByEntry = new Map<number, Set<string>>();
  const totalByEntry = new Map<number, { points: number; correct: number; total: number; streak: number[] }>();
  const pickSubmittedTimelineByEntry = new Map<number, Array<{ periodId: string; createdAt: string; picksCount: number }>>();

  for (const row of picksRows.results || []) {
    const resolvedEntryId = row.entry_id ?? primaryEntryId;
    const periodId = row.period_id;
    const epKey = `${resolvedEntryId}:${periodId}`;
    const upperStatus = row.event_status ? row.event_status.toUpperCase() : "";
    const scored = row.winner && (upperStatus === "FINAL" || upperStatus === "FINAL_OT" || upperStatus === "COMPLETED");
    const isCorrect = scored && row.is_correct === 1;
    const points = isCorrect ? Number(row.points_earned || 0) : 0;

    const prevByPeriod = pointsByEntryPeriod.get(epKey) || { points: 0, correct: 0, total: 0 };
    prevByPeriod.total += scored ? 1 : 0;
    prevByPeriod.correct += isCorrect ? 1 : 0;
    prevByPeriod.points += points;
    pointsByEntryPeriod.set(epKey, prevByPeriod);

    if (!periodsByEntry.has(resolvedEntryId)) periodsByEntry.set(resolvedEntryId, new Set());
    periodsByEntry.get(resolvedEntryId)?.add(periodId);

    const prevTotal = totalByEntry.get(resolvedEntryId) || { points: 0, correct: 0, total: 0, streak: [] };
    if (scored) {
      prevTotal.total += 1;
      if (isCorrect) prevTotal.correct += 1;
      prevTotal.points += points;
      prevTotal.streak.push(isCorrect ? 1 : 0);
    }
    totalByEntry.set(resolvedEntryId, prevTotal);

    const submitTimeline = pickSubmittedTimelineByEntry.get(resolvedEntryId) || [];
    const existingTimelineItem = submitTimeline.find((item) => item.periodId === periodId);
    if (existingTimelineItem) {
      existingTimelineItem.picksCount += 1;
      if (row.created_at > existingTimelineItem.createdAt) {
        existingTimelineItem.createdAt = row.created_at;
      }
    } else {
      submitTimeline.push({ periodId, createdAt: row.created_at, picksCount: 1 });
    }
    pickSubmittedTimelineByEntry.set(resolvedEntryId, submitTimeline);
  }

  const standingsByEntryPeriod = new Map<string, {
    rank: number;
    total_points: number;
    correct_picks: number;
    total_picks: number;
    win_percentage: number;
  }>();
  for (const row of standingsRows.results || []) {
    const resolvedEntryId = row.entry_id ?? primaryEntryId;
    standingsByEntryPeriod.set(`${resolvedEntryId}:${row.period_id}`, {
      rank: Number(row.rank || 0),
      total_points: Number(row.total_points || 0),
      correct_picks: Number(row.correct_picks || 0),
      total_picks: Number(row.total_picks || 0),
      win_percentage: Number(row.win_percentage || 0),
    });
  }

  const survivorByEntryNumber = new Map<number, {
    livesRemaining: number;
    isEliminated: boolean;
    eliminatedPeriod: string | null;
    reentryFromEntryId: number | null;
  }>();
  for (const row of survivorRows.results || []) {
    survivorByEntryNumber.set(Number(row.entry_number || 1), {
      livesRemaining: Number(row.lives_remaining || 0),
      isEliminated: row.is_eliminated === 1,
      eliminatedPeriod: row.eliminated_period || null,
      reentryFromEntryId: row.reentry_from_entry_id || null,
    });
  }

  const responseEntries: Array<{
    id: number;
    entryNumber: number;
    entryName: string;
    status: string;
    seasonStats: {
      totalPoints: number;
      correctPicks: number;
      totalPicks: number;
      winPercentage: number;
      currentStreak: number;
      bestStreak: number;
      rank: number | null;
    };
    weeklyTracking: Array<{
      periodId: string;
      pointsEarned: number;
      totalPoints: number;
      rank: number | null;
      rankDelta: number;
      correctPicks: number;
      totalPicks: number;
      winPercentage: number;
    }>;
    elimination: {
      isEliminated: boolean;
      livesRemaining: number | null;
      eliminatedPeriod: string | null;
      reentryFromEntryId: number | null;
    };
    timeline: Array<{
      eventType: string;
      periodId: string | null;
      createdAt: string;
      details: string;
    }>;
    pickDistribution: {
      periodId: string | null;
      items: Array<{
        pickValue: string;
        count: number;
        percentage: number;
        isYourPick: boolean;
      }>;
    };
    weeklyRecap: {
      periodId: string | null;
      topScorer: string | null;
      mostPickedTeam: string | null;
      biggestUpset: string | null;
    };
  }> = [];

  for (const entry of entries) {
    const entryId = entry.id;
    const periodSet = periodsByEntry.get(entryId) || new Set<string>();
    const periods = Array.from(periodSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    let lastRank: number | null = null;
    const weeklyTracking = periods.map((periodId) => {
      const pointAgg = pointsByEntryPeriod.get(`${entryId}:${periodId}`) || { points: 0, correct: 0, total: 0 };
      const standing = standingsByEntryPeriod.get(`${entryId}:${periodId}`);
      const rank = standing?.rank ?? null;
      const rankDelta = rank !== null && lastRank !== null ? lastRank - rank : 0;
      if (rank !== null) lastRank = rank;
      const winPct = pointAgg.total > 0 ? Math.round((pointAgg.correct / pointAgg.total) * 1000) / 10 : 0;
      return {
        periodId,
        pointsEarned: pointAgg.points,
        totalPoints: standing?.total_points ?? 0,
        rank,
        rankDelta,
        correctPicks: standing?.correct_picks ?? pointAgg.correct,
        totalPicks: standing?.total_picks ?? pointAgg.total,
        winPercentage: standing?.win_percentage ?? winPct,
      };
    });

    const entryTotals = totalByEntry.get(entryId) || { points: 0, correct: 0, total: 0, streak: [] };
    let bestStreak = 0;
    let currentStreak = 0;
    let running = 0;
    for (const result of entryTotals.streak) {
      if (result === 1) {
        running += 1;
        if (running > bestStreak) bestStreak = running;
      } else {
        running = 0;
      }
    }
    for (let i = entryTotals.streak.length - 1; i >= 0; i -= 1) {
      if (entryTotals.streak[i] === 1) currentStreak += 1;
      else break;
    }

    const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
    let pickDistribution = {
      periodId: latestPeriod,
      items: [] as Array<{ pickValue: string; count: number; percentage: number; isYourPick: boolean }>,
    };
    if (latestPeriod) {
      const leagueDistributionRows = await c.env.DB.prepare(`
        SELECT pick_value, COUNT(*) as count
        FROM picks
        WHERE league_id = ? AND period_id = ?
        GROUP BY pick_value
        ORDER BY count DESC
        LIMIT 10
      `).bind(leagueId, latestPeriod).all<{ pick_value: string; count: number }>();
      const yourPickRows = await c.env.DB.prepare(`
        SELECT DISTINCT pick_value
        FROM picks
        WHERE league_id = ? AND user_id = ? AND period_id = ? AND (entry_id = ? OR (? = 1 AND entry_id IS NULL))
      `).bind(leagueId, user.id, latestPeriod, entryId, entry.entry_number === 1 ? 1 : 0).all<{ pick_value: string }>();

      const yourPickSet = new Set((yourPickRows.results || []).map((row) => row.pick_value));
      const totalDist = (leagueDistributionRows.results || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
      pickDistribution = {
        periodId: latestPeriod,
        items: (leagueDistributionRows.results || []).map((row) => ({
          pickValue: row.pick_value,
          count: Number(row.count || 0),
          percentage: totalDist > 0 ? Math.round((Number(row.count || 0) / totalDist) * 1000) / 10 : 0,
          isYourPick: yourPickSet.has(row.pick_value),
        })),
      };
    }

    const weeklyRecap = {
      periodId: latestPeriod,
      topScorer: null as string | null,
      mostPickedTeam: pickDistribution.items[0]?.pickValue || null,
      biggestUpset: null as string | null,
    };
    if (latestPeriod) {
      const topRow = await c.env.DB.prepare(`
        SELECT COALESCE(u.display_name, u.email) as display_name, sh.total_points
        FROM standings_history sh
        LEFT JOIN users u ON u.id = sh.user_id
        WHERE sh.league_id = ? AND sh.period_id = ?
        ORDER BY sh.rank ASC
        LIMIT 1
      `).bind(leagueId, latestPeriod).first<{ display_name: string | null; total_points: number }>();
      if (topRow?.display_name) {
        weeklyRecap.topScorer = `${topRow.display_name} (${topRow.total_points || 0})`;
      }

      const upsetRows = await c.env.DB.prepare(`
        SELECT 
          p.event_id,
          e.winner,
          COUNT(*) as total_picks,
          SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as winner_count
        FROM picks p
        INNER JOIN events e ON e.id = p.event_id
        WHERE p.league_id = ? AND p.period_id = ?
          AND (UPPER(e.status) = 'FINAL' OR UPPER(e.status) = 'FINAL_OT')
          AND e.winner IS NOT NULL
        GROUP BY p.event_id, e.winner
      `).bind(leagueId, latestPeriod).all<{
        event_id: number;
        winner: string;
        total_picks: number;
        winner_count: number;
      }>();
      const upsetByEvent = new Map<number, { winner: string; total: number; winnerCount: number }>();
      for (const row of upsetRows.results || []) {
        const current = upsetByEvent.get(row.event_id) || { winner: row.winner, total: 0, winnerCount: 0 };
        current.total += Number(row.total_picks || 0);
        current.winnerCount += Number(row.winner_count || 0);
        upsetByEvent.set(row.event_id, current);
      }
      let bestUpset: { winner: string; againstPct: number } | null = null;
      for (const [, info] of upsetByEvent) {
        if (info.total <= 0) continue;
        const winnerPct = info.winnerCount / info.total;
        const againstPct = (1 - winnerPct) * 100;
        if (againstPct <= 50) continue;
        if (!bestUpset || againstPct > bestUpset.againstPct) {
          bestUpset = { winner: info.winner, againstPct };
        }
      }
      if (bestUpset) {
        weeklyRecap.biggestUpset = `${bestUpset.winner} (${Math.round(bestUpset.againstPct)}% picked against)`;
      }
    }

    const timelineEvents: Array<{ eventType: string; periodId: string | null; createdAt: string; details: string }> = [];
    const hasExplicitSubmissionEvent = (eventRows.results || []).some(
      (row) => row.pool_entry_id === entryId && row.event_type === "picks_submitted",
    );
    const submitTimeline = pickSubmittedTimelineByEntry.get(entryId) || [];
    if (!hasExplicitSubmissionEvent) {
      for (const item of submitTimeline) {
        timelineEvents.push({
          eventType: "picks_submitted",
          periodId: item.periodId,
          createdAt: item.createdAt,
          details: `${item.picksCount} pick${item.picksCount === 1 ? "" : "s"} submitted`,
        });
      }
    }
    for (const row of eventRows.results || []) {
      if (row.pool_entry_id !== entryId) continue;
      let details = row.event_type;
      if (row.payload_json) {
        try {
          const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
          if (typeof payload.message === "string" && payload.message.trim()) {
            details = payload.message;
          }
        } catch {
          // ignore parse issues for timeline details
        }
      }
      timelineEvents.push({
        eventType: row.event_type,
        periodId: row.period_id,
        createdAt: row.created_at,
        details,
      });
    }

    const survivorMeta = survivorByEntryNumber.get(entry.entry_number);
    if (survivorMeta?.isEliminated) {
      timelineEvents.push({
        eventType: "eliminated",
        periodId: survivorMeta.eliminatedPeriod,
        createdAt: "",
        details: `Eliminated in ${survivorMeta.eliminatedPeriod || "unknown period"}`,
      });
    }
    if (survivorMeta?.reentryFromEntryId) {
      timelineEvents.push({
        eventType: "reentry",
        periodId: null,
        createdAt: "",
        details: `Re-entered from previous entry #${survivorMeta.reentryFromEntryId}`,
      });
    }

    timelineEvents.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const latestWeeklyRank = weeklyTracking.length > 0 ? weeklyTracking[weeklyTracking.length - 1].rank : null;
    responseEntries.push({
      id: entry.id,
      entryNumber: entry.entry_number,
      entryName: entry.entry_name || `Entry ${entry.entry_number}`,
      status: entry.status || "active",
      seasonStats: {
        totalPoints: entryTotals.points,
        correctPicks: entryTotals.correct,
        totalPicks: entryTotals.total,
        winPercentage: entryTotals.total > 0 ? Math.round((entryTotals.correct / entryTotals.total) * 1000) / 10 : 0,
        currentStreak,
        bestStreak,
        rank: latestWeeklyRank,
      },
      weeklyTracking,
      elimination: {
        isEliminated: survivorMeta?.isEliminated === true,
        livesRemaining: survivorMeta ? survivorMeta.livesRemaining : null,
        eliminatedPeriod: survivorMeta?.eliminatedPeriod || null,
        reentryFromEntryId: survivorMeta?.reentryFromEntryId || null,
      },
      timeline: timelineEvents.slice(0, 20),
      pickDistribution,
      weeklyRecap,
    });
  }

  return c.json({ entries: responseEntries });
});

// Get user's picks for a period (entry-aware)
app.get("/api/leagues/:id/picks", leagueDemoOrAuthMiddleware, async (c) => {
  const userId = getLeagueUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const period = c.req.query("period");
  const entryIdFromQuery = c.req.query("entry_id");
  const requestedEntryId = entryIdFromQuery ? Number(entryIdFromQuery) : null;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (!period) {
    return c.json({ error: "Period required" }, 400);
  }

  // Demo mode: return empty picks
  if (isDemoMode) {
    return c.json([]);
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, userId).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const entries = await getOrCreateUserPoolEntries(c.env.DB, leagueId, userId);
  const activeEntry = pickActiveEntry(entries, requestedEntryId);
  if (!activeEntry) {
    return c.json({ error: "No active entry found for this user" }, 404);
  }

  const includeLegacyNull = activeEntry.entry_number === 1 ? 1 : 0;
  const { results } = await c.env.DB.prepare(`
    SELECT id, event_id, pick_value, confidence_rank, is_locked, entry_id
    FROM picks
    WHERE league_id = ? AND user_id = ? AND period_id = ?
      AND (entry_id = ? OR (? = 1 AND entry_id IS NULL))
  `).bind(leagueId, userId, period, activeEntry.id, includeLegacyNull).all();

  return c.json({
    entry: {
      id: activeEntry.id,
      entryNumber: activeEntry.entry_number,
      entryName: activeEntry.entry_name || `Entry ${activeEntry.entry_number}`,
      isPrimary: activeEntry.is_primary === 1,
    },
    picks: results || [],
  });
});

// Generate SHA-256 hash for receipt
async function generateReceiptHash(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate receipt code
function generateReceiptCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PV-${timestamp}-${random}`;
}

// Submit picks
app.post("/api/leagues/:id/picks", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const body = await c.req.json<{
    period_id: string;
    picks: Array<{
      event_id: number;
      pick_value: string;
      selection_label?: string;
      confidence_rank?: number;
    }>;
    tiebreaker_value?: number | null;
    entry_id?: number;
  }>();
  const { period_id, picks, tiebreaker_value, entry_id } = body;

  if (!period_id || !picks || !Array.isArray(picks) || picks.length === 0) {
    return c.json({ error: "Period and picks are required" }, 400);
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role, is_payment_verified FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string; is_payment_verified: number }>();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const league = await c.env.DB.prepare(`
    SELECT sport_key, format_key, rules_json, is_payment_required
    FROM leagues
    WHERE id = ? AND is_active = 1
  `).bind(leagueId).first<{ sport_key: string; format_key: string; rules_json: string | null; is_payment_required: number }>();

  if (!league) {
    return c.json({ error: "League not found or inactive" }, 404);
  }

  const entries = await getOrCreateUserPoolEntries(c.env.DB, leagueId, user.id);
  const activeEntry = pickActiveEntry(entries, Number.isFinite(Number(entry_id)) ? Number(entry_id) : null);
  if (!activeEntry) {
    return c.json({ error: "No active entry found for this user" }, 404);
  }

  const now = new Date().toISOString();
  const {
    parseLeagueRules,
    isPeriodLocked,
    isScheduledEventStatus,
  } = await import("./services/poolEngineService");
  const rules = parseLeagueRules(league.rules_json);

  // Enforce payment eligibility consistently for paid pools.
  if (league.is_payment_required === 1 && membership.is_payment_verified !== 1) {
    return c.json({ error: "Payment required before submitting picks" }, 403);
  }

  // Determine whether the full period is locked (e.g. first_game lock).
  const periodEvents = await c.env.DB.prepare(`
    SELECT start_at
    FROM events
    WHERE sport_key = ? AND period_id = ?
  `).bind(league.sport_key, period_id).all<{ start_at: string }>();
  const periodStartTimes = (periodEvents.results || []).map((e) => e.start_at).filter(Boolean);
  if (isPeriodLocked(rules.lockType, now, periodStartTimes)) {
    return c.json({ error: "This period is locked" }, 400);
  }

  // If pool_event_map exists for this pool+period, enforce the configured event universe.
  const mappedEvents = await c.env.DB.prepare(`
    SELECT event_id
    FROM pool_event_map
    WHERE pool_id = ? AND period_id = ?
  `).bind(leagueId, period_id).all<{ event_id: string }>();
  const eligibleEventIds = new Set((mappedEvents.results || []).map((row) => String(row.event_id)));

  const { getTemplateForPoolType } = await import("../shared/poolTypeCatalog");
  const { validateRuleEngineSubmission } = await import("../shared/poolRuleEngine");
  const { deserializePoolRuleConfig } = await import("../shared/poolRuleConfig");
  const { validatePick: validatePickEdge } = await import("../shared/edgeCaseEngine");

  const template = getTemplateForPoolType(league.format_key);
  const poolConfig = deserializePoolRuleConfig(league.format_key, league.rules_json);

  const ruleValidationErrors = validateRuleEngineSubmission({
    picks,
    eligibleEventIds,
    restrictDuplicateTeam: template === "survivor" || template === "last_man_standing",
    requireConfidenceUniqueness: template === "confidence" || template === "ats_confidence",
  });
  if (ruleValidationErrors.length > 0) {
    return c.json({ error: ruleValidationErrors[0], details: ruleValidationErrors }, 400);
  }

  // Gather lock/start state for all period events in a single query
  const { results: eventRows } = await c.env.DB.prepare(`
    SELECT id, start_at, status FROM events WHERE sport_key = ? AND period_id = ?
  `).bind(league.sport_key, period_id).all<{ id: number; start_at: string; status: string }>();

  const eventMap = new Map((eventRows || []).map((e) => [e.id, e]));
  const lockedEventIds = new Set<string>();
  const startedEventIds = new Set<string>();
  for (const ev of eventRows || []) {
    if (ev.start_at <= now || !isScheduledEventStatus(ev.status)) {
      lockedEventIds.add(String(ev.id));
      startedEventIds.add(String(ev.id));
    }
  }

  // Load previously used teams for survivor reuse enforcement
  const usedTeams: string[] = [];
  if (template === "survivor" || template === "last_man_standing") {
    const { results: priorPicks } = await c.env.DB.prepare(`
      SELECT pick_value FROM picks
      WHERE league_id = ? AND user_id = ? AND entry_id = ? AND period_id != ? AND is_locked = 1
    `).bind(leagueId, user.id, activeEntry.id, period_id).all<{ pick_value: string }>();
    for (const pp of priorPicks || []) usedTeams.push(pp.pick_value);
  }

  // Determine the max confidence rank for this period
  const totalEligible = eligibleEventIds.size > 0 ? eligibleEventIds.size : (eventRows || []).length;

  // Run edge-case-aware validation on each pick
  const existingValidatedPicks: Array<{ event_id: string; pick_value: string; confidence_rank?: number; entry_id?: number }> = [];
  for (const pick of picks) {
    const event = eventMap.get(pick.event_id);
    if (!event) {
      return c.json({ error: `Invalid event: ${pick.event_id}` }, 400);
    }

    const edgeResult = validatePickEdge(
      { event_id: String(pick.event_id), pick_value: pick.pick_value, confidence_rank: pick.confidence_rank, entry_id: activeEntry.id },
      {
        config: poolConfig,
        template: template || league.format_key,
        period_id,
        existing_picks: existingValidatedPicks,
        used_teams: usedTeams,
        eligible_event_ids: eligibleEventIds.size > 0 ? eligibleEventIds : new Set((eventRows || []).map((e) => String(e.id))),
        locked_event_ids: lockedEventIds,
        started_event_ids: startedEventIds,
        max_confidence_rank: totalEligible,
      },
    );

    if (!edgeResult.valid) {
      return c.json({ error: edgeResult.errors[0], details: edgeResult.errors }, 400);
    }

    existingValidatedPicks.push({
      event_id: String(pick.event_id),
      pick_value: pick.pick_value,
      confidence_rank: pick.confidence_rank,
      entry_id: activeEntry.id,
    });
  }

  // Delete existing unlocked picks for this period
  await c.env.DB.prepare(`
    DELETE FROM picks 
    WHERE league_id = ? AND user_id = ? AND period_id = ? AND is_locked = 0
      AND (entry_id = ? OR (? = 1 AND entry_id IS NULL))
  `).bind(leagueId, user.id, period_id, activeEntry.id, activeEntry.entry_number === 1 ? 1 : 0).run();

  // Insert new picks
  for (const pick of picks) {
    const selectionLabel = typeof pick.selection_label === "string" && pick.selection_label.trim().length > 0
      ? pick.selection_label.trim()
      : pick.pick_value;

    await c.env.DB.prepare(`
      INSERT INTO picks (user_id, league_id, event_id, period_id, pick_value, confidence_rank, tiebreaker_value, entry_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.id,
      leagueId,
      pick.event_id,
      period_id,
      pick.pick_value,
      pick.confidence_rank || null,
      tiebreaker_value || null,
      activeEntry.id,
    ).run();

    // Dual-write into pool_entry_actions so live impact/scoring consumers stay in sync.
    await c.env.DB.prepare(`
      INSERT INTO pool_entry_actions (
        pool_id, period_id, user_id, entry_id, event_id, action_type, selection_id, selection_label, confidence_rank, is_locked, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, 'PICK', ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(pool_id, period_id, user_id, entry_id, event_id, action_type) DO UPDATE SET
        selection_id = excluded.selection_id,
        selection_label = excluded.selection_label,
        confidence_rank = excluded.confidence_rank,
        is_locked = excluded.is_locked,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      leagueId,
      period_id,
      String(user.id),
      activeEntry.id,
      String(pick.event_id),
      pick.pick_value,
      selectionLabel,
      pick.confidence_rank || null,
      JSON.stringify({
        source: "picks_submit",
        entryId: activeEntry.id,
        entryName: activeEntry.entry_name || `Entry ${activeEntry.entry_number}`,
        formatKey: league.format_key,
        tiebreakerValue: tiebreaker_value ?? null,
      }),
    ).run();
  }

  // Create immutable receipt with proper superseding
  const submittedAt = new Date().toISOString();
  const receiptCode = generateReceiptCode();
  const picksPayload = JSON.stringify({ picks, tiebreaker_value, submittedAt });
  const payloadHash = await generateReceiptHash(picksPayload);

  // Check for existing active receipt for this user/pool/period
  const existingReceipt = await c.env.DB.prepare(`
    SELECT id, receipt_code FROM pick_receipts 
    WHERE user_id = ? AND league_id = ? AND period_id = ? AND status = 'submitted'
      AND (entry_id = ? OR (? = 1 AND entry_id IS NULL))
    ORDER BY submitted_at DESC LIMIT 1
  `).bind(user.id, leagueId, period_id, activeEntry.id, activeEntry.entry_number === 1 ? 1 : 0).first<{ id: number; receipt_code: string }>();

  // Insert new receipt first to get its ID
  const newReceiptResult = await c.env.DB.prepare(`
    INSERT INTO pick_receipts (receipt_code, user_id, league_id, period_id, entry_id, format_key, submitted_at, picks_payload_json, payload_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
  `).bind(
    receiptCode,
    user.id,
    leagueId,
    period_id,
    activeEntry.id,
    league.format_key,
    submittedAt,
    picksPayload,
    payloadHash,
  ).run();

  const newReceiptId = newReceiptResult.meta.last_row_id;

  // If there was a previous receipt, mark it as replaced
  if (existingReceipt) {
    await c.env.DB.prepare(`
      UPDATE pick_receipts SET status = 'replaced', replaced_by_receipt_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(newReceiptId, submittedAt, existingReceipt.id).run();

    // Log the superseding event
    await c.env.DB.prepare(`
      INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
      VALUES ('receipt_superseded', ?, ?, ?, 'pick_receipt', ?, ?)
    `).bind(leagueId, user.id, user.id, existingReceipt.id, JSON.stringify({ 
      oldReceiptCode: existingReceipt.receipt_code, 
      newReceiptCode: receiptCode,
      newReceiptId 
    })).run();
  }

  // Log the submission
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('picks_submitted', ?, ?, ?, 'pick_receipt', ?, ?)
  `).bind(leagueId, user.id, user.id, newReceiptId, JSON.stringify({ 
    receiptCode, 
    periodId: period_id, 
    entryId: activeEntry.id,
    entryName: activeEntry.entry_name || `Entry ${activeEntry.entry_number}`,
    pickCount: picks.length,
    isUpdate: !!existingReceipt 
  })).run();

  await writePoolEntryEvent(c.env.DB, {
    poolEntryId: activeEntry.id,
    leagueId,
    userId: user.id,
    periodId: period_id,
    eventType: "picks_submitted",
    payload: {
      receiptCode,
      pickCount: picks.length,
      isUpdate: !!existingReceipt,
      tiebreakerValue: tiebreaker_value ?? null,
    },
  });

  // Check user notification preferences and queue delivery
  const prefs = await c.env.DB.prepare(`
    SELECT confirm_channel, confirm_pick_submission FROM user_notification_preferences WHERE user_id = ?
  `).bind(user.id).first<{ confirm_channel: string; confirm_pick_submission: number }>();

  const deliveries: { channel: string; destination: string }[] = [];

  if (prefs?.confirm_pick_submission && prefs.confirm_channel !== 'none') {
    const userDetails = await c.env.DB.prepare(`
      SELECT email, phone, is_phone_verified FROM users WHERE id = ?
    `).bind(user.id).first<{ email: string; phone: string | null; is_phone_verified: number }>();

    if (userDetails) {
      const shouldEmail = prefs.confirm_channel === 'email' || prefs.confirm_channel === 'both';
      const shouldSms = (prefs.confirm_channel === 'sms' || prefs.confirm_channel === 'both') && 
                        userDetails.phone && userDetails.is_phone_verified;

      if (shouldEmail && userDetails.email) {
        await c.env.DB.prepare(`
          INSERT INTO receipt_deliveries (receipt_id, user_id, channel, destination, status, created_at, updated_at)
          VALUES (?, ?, 'email', ?, 'pending', ?, ?)
        `).bind(newReceiptId, user.id, userDetails.email, submittedAt, submittedAt).run();
        deliveries.push({ channel: 'email', destination: userDetails.email });
      }

      if (shouldSms && userDetails.phone) {
        await c.env.DB.prepare(`
          INSERT INTO receipt_deliveries (receipt_id, user_id, channel, destination, status, created_at, updated_at)
          VALUES (?, ?, 'sms', ?, 'pending', ?, ?)
        `).bind(newReceiptId, user.id, userDetails.phone, submittedAt, submittedAt).run();
        deliveries.push({ channel: 'sms', destination: userDetails.phone });
      }

      // Log delivery queueing if any
      if (deliveries.length > 0) {
        await c.env.DB.prepare(`
          INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
          VALUES ('receipt_delivery_queued', ?, ?, ?, 'pick_receipt', ?, ?)
        `).bind(leagueId, user.id, user.id, newReceiptId, JSON.stringify({ 
          receiptCode,
          channels: deliveries.map(d => d.channel)
        })).run();
      }
    }
  }

  return c.json({
    success: true,
    entry: {
      id: activeEntry.id,
      entryNumber: activeEntry.entry_number,
      entryName: activeEntry.entry_name || `Entry ${activeEntry.entry_number}`,
      isPrimary: activeEntry.is_primary === 1,
    },
    receiptCode,
    receiptId: newReceiptId,
    payloadHash,
    isUpdate: !!existingReceipt,
    previousReceiptCode: existingReceipt?.receipt_code || null,
    deliveries: deliveries.map(d => ({ channel: d.channel, status: 'pending' })),
    message: existingReceipt 
      ? "Picks updated successfully. Previous submission has been replaced." 
      : "Picks submitted successfully",
  });
});

// Get survivor pool status for a user
app.get("/api/leagues/:id/survivor-status", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT sport_key, format_key, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ sport_key: string; format_key: string; rules_json: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  // Parse rules for survivor variant and type
  let survivorType: "winner" | "loser" | "ats" = "winner";
  let survivorVariant: "standard" | "two_life" | "reentry" = "standard";
  let totalLives = 1;
  let reentryFeeCents = 0;
  try {
    const rules = JSON.parse(league.rules_json || "{}");
    survivorType = rules.survivorType || "winner";
    survivorVariant = rules.survivorVariant || "standard";
    totalLives = survivorVariant === "two_life" ? (rules.survivorLives || 2) : 1;
    reentryFeeCents = rules.survivorReentryFeeCents || 0;
  } catch {}

  // Get or create survivor entry for this user
  let entry = await c.env.DB.prepare(`
    SELECT * FROM survivor_entries 
    WHERE league_id = ? AND user_id = ? 
    ORDER BY entry_number DESC LIMIT 1
  `).bind(leagueId, user.id).first<{
    id: number;
    entry_number: number;
    lives_remaining: number;
    is_eliminated: number;
    eliminated_at: string;
    eliminated_period: string;
  }>();

  // If no entry exists, create one
  if (!entry) {
    const initialLives = survivorVariant === "two_life" ? totalLives : 1;
    await c.env.DB.prepare(`
      INSERT INTO survivor_entries (league_id, user_id, entry_number, lives_remaining)
      VALUES (?, ?, 1, ?)
    `).bind(leagueId, user.id, initialLives).run();

    entry = {
      id: 0,
      entry_number: 1,
      lives_remaining: initialLives,
      is_eliminated: 0,
      eliminated_at: "",
      eliminated_period: "",
    };
  }

  // Get picks only for current entry (use entry_number to filter by period if needed)
  // For re-entry variant, we only consider picks after the re-entry
  const { results: picks } = await c.env.DB.prepare(`
    SELECT p.period_id, p.pick_value, p.event_id, p.is_correct,
           e.status as event_status, e.winner
    FROM picks p
    LEFT JOIN events e ON p.event_id = e.id
    WHERE p.user_id = ? AND p.league_id = ?
    ORDER BY p.period_id ASC
  `).bind(user.id, leagueId).all();

  // Build survivor status
  const usedTeams: string[] = [];
  const survivorPicks: Array<{
    period_id: string;
    team: string;
    result: "pending" | "win" | "loss";
    event_id: number;
    life_lost?: boolean;
  }> = [];

  let currentStreak = 0;

  for (const pick of picks) {
    const team = pick.pick_value as string;
    usedTeams.push(team);

    let result: "pending" | "win" | "loss" = "pending";
    let lifeLost = false;
    
    // Determine result based on event status
    if (pick.event_status === "final" || pick.event_status === "final_ot") {
      if (survivorType === "winner") {
        result = pick.winner === team ? "win" : "loss";
      } else if (survivorType === "loser") {
        result = pick.winner !== team ? "win" : "loss";
      } else {
        result = pick.is_correct ? "win" : "loss";
      }

      if (result === "win") {
        currentStreak++;
      } else {
        lifeLost = true;
        currentStreak = 0;
      }
    }

    survivorPicks.push({
      period_id: pick.period_id as string,
      team,
      result,
      event_id: pick.event_id as number,
      life_lost: lifeLost,
    });
  }

  // Determine elimination status based on variant
  const isEliminated = entry.is_eliminated === 1;
  const eliminatedWeek = entry.eliminated_period || null;
  const livesRemaining = entry.lives_remaining;
  
  // Can re-enter if eliminated and variant is reentry
  const canReenter = isEliminated && survivorVariant === "reentry";

  return c.json({
    isEliminated,
    eliminatedWeek,
    usedTeams,
    currentStreak,
    picks: survivorPicks,
    survivorType,
    survivorVariant,
    livesRemaining,
    totalLives,
    entryNumber: entry.entry_number,
    canReenter,
    reentryFeeCents,
  });
});

// Re-enter a survivor pool (for reentry variant)
app.post("/api/leagues/:id/survivor-reentry", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ rules_json: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  // Check if reentry is allowed
  let survivorVariant = "standard";
  try {
    const rules = JSON.parse(league.rules_json || "{}");
    survivorVariant = rules.survivorVariant || "standard";
  } catch {}

  if (survivorVariant !== "reentry") {
    return c.json({ error: "This pool does not allow re-entry" }, 400);
  }

  // Get current entry
  const currentEntry = await c.env.DB.prepare(`
    SELECT * FROM survivor_entries 
    WHERE league_id = ? AND user_id = ? 
    ORDER BY entry_number DESC LIMIT 1
  `).bind(leagueId, user.id).first<{
    id: number;
    entry_number: number;
    is_eliminated: number;
  }>();

  if (!currentEntry || currentEntry.is_eliminated !== 1) {
    return c.json({ error: "You must be eliminated to re-enter" }, 400);
  }

  // Create new entry
  const newEntryNumber = currentEntry.entry_number + 1;

  await c.env.DB.prepare(`
    INSERT INTO survivor_entries (league_id, user_id, entry_number, lives_remaining, reentry_from_entry_id)
    VALUES (?, ?, ?, 1, ?)
  `).bind(leagueId, user.id, newEntryNumber, currentEntry.id).run();

  // Log the re-entry
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, payload_json)
    VALUES ('survivor_reentry', ?, ?, ?, 'survivor_entry', ?)
  `).bind(leagueId, user.id, user.id, JSON.stringify({ 
    previousEntryNumber: currentEntry.entry_number,
    newEntryNumber 
  })).run();

  // Create notification for the user
  await createNotification(
    c.env.DB,
    user.id,
    "survivor_reentry",
    "🔄 You're Back in the Game!",
    `Entry #${newEntryNumber} started. All teams are available again. Good luck!`,
    `/leagues/${leagueId}/survivor`
  );

  return c.json({
    success: true,
    entryNumber: newEntryNumber,
    message: "Successfully re-entered the survivor pool",
  });
});

// Process survivor elimination (called when a pick result is determined)
app.post("/api/leagues/:id/survivor-process-result", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const { period_id, pick_result } = await c.req.json();

  if (!period_id || !pick_result) {
    return c.json({ error: "Period ID and pick result required" }, 400);
  }

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ rules_json: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  let survivorVariant = "standard";
  try {
    const rules = JSON.parse(league.rules_json || "{}");
    survivorVariant = rules.survivorVariant || "standard";
  } catch {}

  // Get all member entries that need processing for this period
  const { results: entries } = await c.env.DB.prepare(`
    SELECT se.*, p.pick_value, p.is_correct as pick_is_correct, e.winner,
           e.status as event_status, e.home_score, e.away_score
    FROM survivor_entries se
    INNER JOIN picks p ON p.user_id = se.user_id AND p.league_id = se.league_id AND p.period_id = ?
    INNER JOIN events e ON p.event_id = e.id
    WHERE se.league_id = ? AND se.is_eliminated = 0
    AND UPPER(e.status) IN ('FINAL','FINAL_OT','COMPLETED','CANCELED','CANCELLED')
  `).bind(period_id, leagueId).all();

  let eliminatedCount = 0;
  let livesLostCount = 0;
  const now = new Date().toISOString();

  const { deserializePoolRuleConfig: deserializeSurvivor } = await import("../shared/poolRuleConfig");
  const { handleCanceledGame: handleCanceledSurvivor, handleTie: handleTieSurvivor } = await import("../shared/edgeCaseEngine");
  const survivorConfig = deserializeSurvivor("survivor", league.rules_json);

  for (const entry of entries) {
    const evStatus = ((entry.event_status as string) || "").toUpperCase();

    // Canceled games never eliminate in survivor
    if (evStatus === "CANCELED" || evStatus === "CANCELLED") {
      const cancelResult = handleCanceledSurvivor(survivorConfig, "survivor", true, true);
      if (!cancelResult.affects_elimination) continue;
    }

    // Tied games use configured tie handling
    const homeScore = entry.home_score as number | null;
    const awayScore = entry.away_score as number | null;
    if (homeScore !== null && awayScore !== null && homeScore === awayScore) {
      const tieResult = handleTieSurvivor(survivorConfig, "survivor");
      if (!tieResult.affects_elimination) continue;
    }

    if (entry.pick_is_correct === null || entry.pick_is_correct === undefined) {
      // Survivor processing should only use deterministic graded outcomes.
      continue;
    }
    const isCorrect = (entry.pick_is_correct as number) === 1;

    if (!isCorrect) {
      const currentLives = entry.lives_remaining as number;
      const newLives = currentLives - 1;

      if (newLives <= 0) {
        // Eliminated
        await c.env.DB.prepare(`
          UPDATE survivor_entries 
          SET lives_remaining = 0, is_eliminated = 1, eliminated_at = ?, eliminated_period = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(now, period_id, entry.id).run();

        eliminatedCount++;

        // Create notification
        await createNotification(
          c.env.DB,
          entry.user_id as string,
          "survivor_eliminated",
          survivorVariant === "reentry" ? "💀 Eliminated - Re-entry Available" : "💀 Eliminated from Survivor Pool",
          survivorVariant === "two_life" 
            ? `You've used all your lives. Eliminated in ${period_id}.`
            : survivorVariant === "reentry"
            ? `Eliminated in ${period_id}. You can re-enter with fresh team selections.`
            : `Your ${entry.pick_value} pick lost. Eliminated in ${period_id}.`,
          `/leagues/${leagueId}/survivor`
        );
      } else {
        // Lost a life but not eliminated (two_life variant)
        await c.env.DB.prepare(`
          UPDATE survivor_entries 
          SET lives_remaining = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(newLives, entry.id).run();

        livesLostCount++;

        // Create notification
        await createNotification(
          c.env.DB,
          entry.user_id as string,
          "survivor_life_lost",
          "❤️ Life Lost - Still Alive!",
          `Your ${entry.pick_value} pick lost in ${period_id}. ${newLives} life${newLives > 1 ? 's' : ''} remaining.`,
          `/leagues/${leagueId}/survivor`
        );
      }
    }
  }

  // Log the processing
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, payload_json)
    VALUES ('survivor_results_processed', ?, ?, ?, 'league', ?)
  `).bind(leagueId, user.id, user.id, JSON.stringify({ 
    period_id,
    entriesProcessed: entries.length,
    eliminatedCount,
    livesLostCount
  })).run();

  return c.json({
    success: true,
    entriesProcessed: entries.length,
    eliminatedCount,
    livesLostCount,
  });
});

// Get survivor field collapse data
app.get("/api/leagues/:id/survivor-field", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT sport_key, format_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ sport_key: string; format_key: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  // Get total entrants (all members with survivor entries)
  const totalResult = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT user_id) as total FROM survivor_entries WHERE league_id = ?
  `).bind(leagueId).first<{ total: number }>();

  const totalEntrants = totalResult?.total || 0;

  if (totalEntrants === 0) {
    // If no entries yet, count league members
    const memberResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM league_members WHERE league_id = ?
    `).bind(leagueId).first<{ total: number }>();
    
    return c.json({ 
      weeks: [],
      totalEntrants: memberResult?.total || 0,
      currentSurvivors: memberResult?.total || 0,
    });
  }

  // Get distinct periods with picks for this league
  const { results: periods } = await c.env.DB.prepare(`
    SELECT DISTINCT p.period_id
    FROM picks p
    INNER JOIN events e ON p.event_id = e.id
    WHERE p.league_id = ? 
    AND (e.status = 'final' OR e.status = 'final_ot')
    ORDER BY p.period_id ASC
  `).bind(leagueId).all();

  const weeks: Array<{
    period_id: string;
    alive_start: number;
    eliminated: number;
    alive_end: number;
  }> = [];

  let currentAlive = totalEntrants;

  for (const period of periods) {
    const periodId = period.period_id as string;
    
    // Count eliminations in this period
    const eliminatedResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM survivor_entries 
      WHERE league_id = ? AND eliminated_period = ?
    `).bind(leagueId, periodId).first<{ count: number }>();

    const eliminated = eliminatedResult?.count || 0;
    const aliveEnd = currentAlive - eliminated;

    weeks.push({
      period_id: periodId,
      alive_start: currentAlive,
      eliminated,
      alive_end: Math.max(0, aliveEnd),
    });

    currentAlive = Math.max(0, aliveEnd);
  }

  // Get current survivors count
  const survivorsResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count 
    FROM survivor_entries 
    WHERE league_id = ? AND is_eliminated = 0
    ORDER BY entry_number DESC
  `).bind(leagueId).first<{ count: number }>();

  return c.json({
    weeks,
    totalEntrants,
    currentSurvivors: survivorsResult?.count || currentAlive,
  });
});

// Get league standings with scoring
app.get("/api/leagues/:id/standings", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT id, name, sport_key, format_key, season, rules_json
    FROM leagues WHERE id = ?
  `).bind(leagueId).first<{
    id: number;
    name: string;
    sport_key: string;
    format_key: string;
    season: string;
    rules_json: string;
  }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  const { isFinalEventStatus, getCanonicalPoolType } = await import("./services/poolEngineService");
  const { deserializePoolRuleConfig } = await import("../shared/poolRuleConfig");
  const { gradePick: gradePickStandings } = await import("./services/scoringEngine");
  const canonicalLeaguePoolType = getCanonicalPoolType(league.format_key) || league.format_key;
  const standingsConfig = deserializePoolRuleConfig(league.format_key, league.rules_json);

  const { results: members } = await c.env.DB.prepare(`
    SELECT lm.user_id, u.display_name, u.email, u.avatar_url
    FROM league_members lm
    INNER JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ? AND lm.invite_status = 'joined'
  `).bind(leagueId).all<{
    user_id: number;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>();

  // Ensure each member has at least one entry and then load entries.
  for (const member of members || []) {
    await getOrCreateUserPoolEntries(c.env.DB, leagueId, member.user_id);
  }

  const { results: entryRows } = await c.env.DB.prepare(`
    SELECT pe.id as entry_id, pe.user_id, pe.entry_number, pe.entry_name, pe.is_primary,
           u.display_name, u.email, u.avatar_url
    FROM pool_entries pe
    INNER JOIN users u ON u.id = pe.user_id
    INNER JOIN league_members lm ON lm.user_id = pe.user_id AND lm.league_id = pe.league_id
    WHERE pe.league_id = ? AND lm.invite_status = 'joined'
    ORDER BY pe.user_id ASC, pe.is_primary DESC, pe.entry_number ASC, pe.id ASC
  `).bind(leagueId).all<{
    entry_id: number;
    user_id: number;
    entry_number: number;
    entry_name: string | null;
    is_primary: number;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>();

  // Get all picks with event results (including fields needed by gradePick)
  const { results: allPicks } = await c.env.DB.prepare(`
    SELECT 
      p.id as pick_id, p.user_id, p.entry_id, p.event_id, p.period_id, p.pick_value, p.confidence_rank, p.is_correct, p.points_earned,
      e.winner, e.status as event_status, e.home_team, e.away_team, e.home_score, e.away_score, e.start_at, e.spread
    FROM picks p
    LEFT JOIN events e ON p.event_id = e.id
    WHERE p.league_id = ?
  `).bind(leagueId).all<{
    pick_id: number;
    user_id: number;
    entry_id: number | null;
    event_id: number;
    period_id: string;
    pick_value: string;
    confidence_rank: number | null;
    is_correct: number | null;
    points_earned: number | null;
    winner: string | null;
    event_status: string | null;
    home_team: string | null;
    away_team: string | null;
    home_score: number | null;
    away_score: number | null;
    start_at: string | null;
    spread: number | null;
  }>();

  interface EntryStats {
    user_id: number;
    entry_id: number;
    entry_number: number;
    entry_name: string;
    display_name: string;
    email: string;
    avatar_url: string | null;
    total_points: number;
    correct_picks: number;
    total_picks: number;
    streak: number[];
    period_points: Record<string, number>;
    is_eliminated: boolean;
  }

  const entryStats = new Map<string, EntryStats>();
  const primaryEntryByUser = new Map<number, number>();

  for (const entry of entryRows || []) {
    const key = `${entry.user_id}:${entry.entry_id}`;
    entryStats.set(key, {
      user_id: entry.user_id,
      entry_id: entry.entry_id,
      entry_number: entry.entry_number || 1,
      entry_name: entry.entry_name?.trim() || `Entry ${entry.entry_number || 1}`,
      display_name: entry.display_name || entry.email || `User ${entry.user_id}`,
      email: entry.email || "",
      avatar_url: entry.avatar_url,
      total_points: 0,
      correct_picks: 0,
      total_picks: 0,
      streak: [],
      period_points: {},
      is_eliminated: false,
    });
    if (!primaryEntryByUser.has(entry.user_id) || entry.is_primary === 1) {
      primaryEntryByUser.set(entry.user_id, entry.entry_id);
    }
  }

  for (const pick of allPicks || []) {
    const resolvedEntryId = pick.entry_id ?? primaryEntryByUser.get(pick.user_id) ?? null;
    if (!resolvedEntryId) continue;
    const key = `${pick.user_id}:${resolvedEntryId}`;
    const stats = entryStats.get(key);
    if (!stats) continue;
    const periodId = pick.period_id;

    if (isFinalEventStatus(pick.event_status)) {
      stats.total_picks++;

      // Use pre-scored values if available, otherwise grade on-the-fly
      let isCorrect: boolean;
      let points: number;

      if (pick.is_correct !== null && pick.points_earned !== null) {
        isCorrect = pick.is_correct === 1;
        points = pick.points_earned;
      } else {
        const gradeResult = gradePickStandings({
          pick_id: pick.pick_id,
          entry_id: resolvedEntryId,
          user_id: String(pick.user_id),
          event_id: pick.event_id,
          pick_value: pick.pick_value,
          confidence_rank: pick.confidence_rank,
          event_status: pick.event_status || "FINAL",
          event_started: Boolean(pick.start_at && new Date(pick.start_at) < new Date()),
          home_team: pick.home_team || "",
          away_team: pick.away_team || "",
          home_score: pick.home_score,
          away_score: pick.away_score,
          winner: pick.winner,
          spread: pick.spread,
        }, standingsConfig, league.format_key);

        if (gradeResult.result === "pending") continue;
        isCorrect = gradeResult.result === "win";
        points = gradeResult.points;

        if (gradeResult.affects_elimination) {
          stats.is_eliminated = true;
        }
      }

      if (isCorrect) {
        stats.correct_picks++;
        stats.total_points += points;
        stats.period_points[periodId] = (stats.period_points[periodId] || 0) + points;
        stats.streak.push(1);
      } else {
        stats.streak.push(0);
        if (canonicalLeaguePoolType === "survivor" || canonicalLeaguePoolType === "last_man_standing") {
          stats.is_eliminated = true;
        }
      }
    }
  }

  // Calculate current streak and best week for each entry
  const standings = Array.from(entryStats.values()).map((stats) => {
    // Calculate streak (consecutive wins/losses from most recent)
    let currentStreak = 0;
    let streakType: "win" | "loss" | "none" = "none";
    
    if (stats.streak.length > 0) {
      const lastResult = stats.streak[stats.streak.length - 1];
      streakType = lastResult === 1 ? "win" : "loss";
      
      for (let i = stats.streak.length - 1; i >= 0; i--) {
        if ((streakType === "win" && stats.streak[i] === 1) ||
            (streakType === "loss" && stats.streak[i] === 0)) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Find best week
    let bestWeek: string | null = null;
    let bestWeekPoints = 0;
    for (const [period, points] of Object.entries(stats.period_points)) {
      if (points > bestWeekPoints) {
        bestWeekPoints = points;
        bestWeek = period;
      }
    }

    const winPercentage = stats.total_picks > 0 
      ? Math.round((stats.correct_picks / stats.total_picks) * 100) 
      : 0;

    return {
      user_id: stats.user_id,
      entry_id: stats.entry_id,
      entry_number: stats.entry_number,
      entry_name: stats.entry_name,
      display_name: stats.display_name,
      email: stats.email,
      avatar_url: stats.avatar_url,
      total_points: stats.total_points,
      correct_picks: stats.correct_picks,
      total_picks: stats.total_picks,
      win_percentage: winPercentage,
      current_streak: currentStreak,
      streak_type: streakType,
      best_week: bestWeek,
      best_week_points: bestWeekPoints,
      is_eliminated: stats.is_eliminated,
    };
  });

  // Sort by points (desc), then win percentage, then correct picks
  standings.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.win_percentage !== a.win_percentage) return b.win_percentage - a.win_percentage;
    return b.correct_picks - a.correct_picks;
  });

  // Assign ranks
  standings.forEach((standing, idx) => {
    (standing as any).rank = idx + 1;
    (standing as any).previous_rank = null; // Could be calculated from historical data
  });

  // Get period results
  const periodIds = [...new Set((allPicks || []).map((p) => p.period_id))].filter(Boolean);
  const periodResults = periodIds.map(periodId => {
    const periodStandings = Array.from(entryStats.values()).map(stats => ({
      user_id: stats.user_id,
      entry_id: stats.entry_id,
      entry_number: stats.entry_number,
      entry_name: stats.entry_name,
      display_name: stats.display_name,
      email: stats.email,
      avatar_url: stats.avatar_url,
      total_points: stats.period_points[periodId] || 0,
      correct_picks: 0, // Would need per-period calculation
      total_picks: 0,
      win_percentage: 0,
      current_streak: 0,
      streak_type: "none" as const,
      best_week: null,
      best_week_points: 0,
    }));

    periodStandings.sort((a, b) => b.total_points - a.total_points);
    periodStandings.forEach((s, idx) => {
      (s as any).rank = idx + 1;
      (s as any).previous_rank = null;
    });

    return { period_id: periodId, standings: periodStandings };
  });

  return c.json({
    league: {
      id: league.id,
      name: league.name,
      sport_key: league.sport_key,
      format_key: league.format_key,
      season: league.season,
    },
    standings,
    periodResults,
  });
});

// Score picks for completed events (can be called by admin or cron)
app.post("/api/leagues/:id/score", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const league = await c.env.DB.prepare(`
    SELECT format_key, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ format_key: string; rules_json: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  const { gradePick } = await import("./services/scoringEngine");
  const { deserializePoolRuleConfig } = await import("../shared/poolRuleConfig");

  const config = deserializePoolRuleConfig(league.format_key, league.rules_json);

  const { results: unscoredPicks } = await c.env.DB.prepare(`
    SELECT p.id, p.user_id, p.entry_id, p.period_id, p.pick_value, p.confidence_rank,
           e.winner, e.status as event_status, e.home_team, e.away_team,
           e.home_score, e.away_score, e.start_at, e.spread
    FROM picks p
    INNER JOIN events e ON p.event_id = e.id
    WHERE p.league_id = ? AND p.is_correct IS NULL
      AND (UPPER(e.status) IN ('FINAL','COMPLETED','CANCELED','CANCELLED','POSTPONED','DELAYED'))
  `).bind(leagueId).all<{
    id: number;
    user_id: number;
    entry_id: number | null;
    period_id: string;
    pick_value: string;
    confidence_rank: number | null;
    winner: string | null;
    event_status: string;
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    start_at: string | null;
    spread: number | null;
  }>();

  let scored = 0;
  for (const pick of unscoredPicks) {
    const gradeInput: PickGradeInput = {
      pick_id: pick.id,
      entry_id: pick.entry_id || 0,
      user_id: String(pick.user_id),
      event_id: pick.id,
      pick_value: pick.pick_value,
      confidence_rank: pick.confidence_rank,
      event_status: pick.event_status || "FINAL",
      event_started: Boolean(pick.start_at && new Date(pick.start_at) < new Date()),
      home_team: pick.home_team || "",
      away_team: pick.away_team || "",
      home_score: pick.home_score,
      away_score: pick.away_score,
      winner: pick.winner,
      spread: pick.spread,
    };

    const result = gradePick(gradeInput, config, league.format_key);

    if (result.result === "pending") continue;

    const isCorrect = result.result === "win" ? 1 : 0;
    const pointsEarned = result.points;

    await c.env.DB.prepare(`
      UPDATE picks SET is_correct = ?, points_earned = ?, is_locked = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(isCorrect, pointsEarned, pick.id).run();

    if (pick.entry_id) {
      await writePoolEntryEvent(c.env.DB, {
        poolEntryId: pick.entry_id,
        leagueId,
        userId: pick.user_id,
        periodId: pick.period_id,
        eventType: "pick_scored",
        payload: {
          pickId: pick.id,
          isCorrect: isCorrect === 1,
          pointsEarned,
          result: result.result,
          edgeAction: result.edge_action,
          reason: result.reason,
          winner: pick.winner,
          pickValue: pick.pick_value,
        },
      });
    }

    scored++;
  }

  // --- Missed Pick Enforcement ---
  const { handleMissedPick } = await import("../shared/edgeCaseEngine");
  let missedPicksPenalized = 0;

  const scoredPeriods = [...new Set(unscoredPicks.map((p) => p.period_id))];
  for (const periodId of scoredPeriods) {
    const { results: periodFinalEvents } = await c.env.DB.prepare(`
      SELECT id FROM events
      WHERE sport_key = (SELECT sport_key FROM leagues WHERE id = ?) AND period_id = ?
        AND UPPER(status) IN ('FINAL','COMPLETED')
    `).bind(leagueId, periodId).all<{ id: number }>();

    const totalGamesInPeriod = periodFinalEvents.length;
    if (totalGamesInPeriod === 0) continue;

    const { results: entryRows } = await c.env.DB.prepare(`
      SELECT pe.id as entry_id, pe.user_id FROM pool_entries pe
      INNER JOIN league_members lm ON lm.user_id = pe.user_id AND lm.league_id = pe.league_id
      WHERE pe.league_id = ? AND lm.invite_status = 'joined'
    `).bind(leagueId).all<{ entry_id: number; user_id: number }>();

    for (const entry of entryRows || []) {
      const pickCount = await c.env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM picks
        WHERE league_id = ? AND entry_id = ? AND period_id = ?
      `).bind(leagueId, entry.entry_id, periodId).first<{ cnt: number }>();

      const expectedPicks = config.picks_per_period === "all" ? totalGamesInPeriod : Math.min(Number(config.picks_per_period), totalGamesInPeriod);
      const actualPicks = pickCount?.cnt || 0;
      const missedCount = Math.max(0, expectedPicks - actualPicks);

      if (missedCount > 0) {
        const missedResult = handleMissedPick(config, league.format_key);
        missedPicksPenalized += missedCount;

        await writePoolEntryEvent(c.env.DB, {
          poolEntryId: entry.entry_id,
          leagueId,
          userId: entry.user_id,
          periodId,
          eventType: "missed_pick_penalty",
          payload: {
            missedCount,
            action: missedResult.action,
            reason: missedResult.reason,
            affectsElimination: missedResult.affects_elimination,
          },
        });
      }
    }
  }

  // Log scoring event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('picks_scored', ?, ?, ?, 'league', ?, ?)
  `).bind(leagueId, user.id, user.id, leagueId, JSON.stringify({ picksScored: scored, missedPicksPenalized })).run();

  return c.json({ success: true, picksScored: scored, missedPicksPenalized });
});

// Get audit log (owner/admin only)
app.get("/api/leagues/:id/audit", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT id, event_type, user_id, actor_id, entity_type, entity_id, payload_json, reason, created_at
    FROM event_log
    WHERE league_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(leagueId).all();

  return c.json(results);
});

// ============ Audit Routes ============

// Get audit events for current user
app.get("/api/audit", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const eventType = c.req.query("type");
  const offset = (page - 1) * limit;

  // Get user's league memberships to filter events
  const { results: memberships } = await c.env.DB.prepare(`
    SELECT league_id FROM league_members WHERE user_id = ?
  `).bind(user.id).all();
  
  const leagueIds = memberships.map((m: Record<string, unknown>) => m.league_id as number);

  let query = `
    SELECT 
      el.id, el.event_type, el.league_id, el.user_id, el.actor_id,
      el.entity_type, el.entity_id, el.payload_json, el.reason, el.created_at,
      l.name as league_name,
      u.email as user_email,
      a.email as actor_email
    FROM event_log el
    LEFT JOIN leagues l ON el.league_id = l.id
    LEFT JOIN users u ON el.user_id = u.id
    LEFT JOIN users a ON el.actor_id = a.id
    WHERE (el.user_id = ? OR el.actor_id = ? ${leagueIds.length > 0 ? `OR el.league_id IN (${leagueIds.join(",")})` : ""})
  `;

  const params: (string | number)[] = [user.id, user.id];

  if (eventType) {
    query += ` AND el.event_type = ?`;
    params.push(eventType);
  }

  query += ` ORDER BY el.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const hasMore = results.length > limit;
  const events = results.slice(0, limit);

  return c.json({ events, hasMore, page, limit });
});

// ============ Receipt Routes ============

// Get all receipts for current user
app.get("/api/receipts", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { results } = await c.env.DB.prepare(`
    SELECT 
      pr.id, pr.receipt_code, pr.league_id, pr.period_id, pr.format_key,
      pr.submitted_at, pr.picks_payload_json, pr.payload_hash, pr.status,
      l.name as league_name, l.sport_key
    FROM pick_receipts pr
    INNER JOIN leagues l ON pr.league_id = l.id
    WHERE pr.user_id = ?
    ORDER BY pr.submitted_at DESC
  `).bind(user.id).all();

  // Get deliveries and pick counts for each receipt
  const receiptsWithDetails = await Promise.all(results.map(async (receipt: Record<string, unknown>) => {
    const { results: deliveries } = await c.env.DB.prepare(`
      SELECT id, channel, destination, status, sent_at, delivered_at, failed_at
      FROM receipt_deliveries
      WHERE receipt_id = ?
      ORDER BY created_at DESC
    `).bind(receipt.id).all();

    // Count picks from payload
    let pickCount = 0;
    try {
      const payload = JSON.parse(receipt.picks_payload_json as string);
      pickCount = payload.picks?.length || 0;
    } catch {}

    return {
      ...receipt,
      deliveries,
      pick_count: pickCount,
    };
  }));

  return c.json(receiptsWithDetails);
});

// Verify a receipt's hash
app.get("/api/receipts/:code/verify", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const receiptCode = c.req.param("code");

  const receipt = await c.env.DB.prepare(`
    SELECT id, picks_payload_json, payload_hash, user_id
    FROM pick_receipts
    WHERE receipt_code = ?
  `).bind(receiptCode).first<{ id: number; picks_payload_json: string; payload_hash: string; user_id: string }>();

  if (!receipt) {
    return c.json({ error: "Receipt not found" }, 404);
  }

  // Only allow user to verify their own receipts
  if (receipt.user_id !== user.id) {
    return c.json({ error: "Access denied" }, 403);
  }

  // Recompute hash from stored payload
  const computedHash = await generateReceiptHash(receipt.picks_payload_json);
  const isValid = computedHash === receipt.payload_hash;

  // Log verification attempt
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('receipt_verified', ?, ?, 'pick_receipt', ?, ?)
  `).bind(user.id, user.id, receipt.id, JSON.stringify({ isValid, receiptCode })).run();

  return c.json({
    isValid,
    storedHash: receipt.payload_hash,
    computedHash,
    timestamp: new Date().toISOString(),
  });
});

// Request delivery of a receipt
app.post("/api/receipts/:code/deliver", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const receiptCode = c.req.param("code");
  const { channel } = await c.req.json();

  if (!channel || !["email", "sms"].includes(channel)) {
    return c.json({ error: "Invalid channel. Use 'email' or 'sms'" }, 400);
  }

  // Get full receipt with league info
  const receipt = await c.env.DB.prepare(`
    SELECT pr.*, l.name as league_name, l.sport_key
    FROM pick_receipts pr
    INNER JOIN leagues l ON pr.league_id = l.id
    WHERE pr.receipt_code = ?
  `).bind(receiptCode).first<{
    id: number;
    user_id: string;
    receipt_code: string;
    league_id: number;
    league_name: string;
    sport_key: string;
    period_id: string;
    submitted_at: string;
    picks_payload_json: string;
    payload_hash: string;
  }>();

  if (!receipt) {
    return c.json({ error: "Receipt not found" }, 404);
  }

  if (receipt.user_id !== user.id) {
    return c.json({ error: "Access denied" }, 403);
  }

  // Get user's contact info
  const destination = channel === "email" ? user.email : "Not set";

  if (channel === "sms") {
    return c.json({ error: "SMS delivery requires phone number setup. Email delivery is available." }, 400);
  }

  // Parse picks from payload
  const picks: Array<{ eventName: string; pickValue: string; confidenceRank?: number }> = [];
  let pickCount = 0;
  try {
    const payload = JSON.parse(receipt.picks_payload_json);
    pickCount = payload.picks?.length || 0;
    
    // Get event details to build pick display
    for (const pick of payload.picks || []) {
      const event = await c.env.DB.prepare(`
        SELECT home_team, away_team FROM events WHERE id = ?
      `).bind(pick.event_id).first<{ home_team: string; away_team: string }>();
      
      picks.push({
        eventName: event ? `${event.away_team} @ ${event.home_team}` : `Event ${pick.event_id}`,
        pickValue: pick.pick_value,
        confidenceRank: pick.confidence_rank,
      });
    }
  } catch {}

  // Get sport display name
  const sportNames: Record<string, string> = {
    nfl: "NFL Football",
    nba: "NBA Basketball",
    mlb: "MLB Baseball",
    nhl: "NHL Hockey",
    ncaaf: "College Football",
    ncaab: "College Basketball",
    soccer: "Soccer",
    golf: "Golf",
  };
  const sportName = sportNames[receipt.sport_key] || receipt.sport_key.toUpperCase();

  // Generate email from template
  const emailData = {
    receiptCode: receipt.receipt_code,
    leagueName: receipt.league_name,
    sportName,
    periodId: receipt.period_id,
    pickCount,
    submittedAt: receipt.submitted_at,
    payloadHash: receipt.payload_hash,
    picks,
    userName: user.email.split("@")[0],
    verifyUrl: `${c.req.url.split("/api")[0]}/picks`,
  };

  const emailContent = generateReceiptEmail(emailData);

  // Create delivery record
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO receipt_deliveries (receipt_id, user_id, channel, destination, status, sent_at, delivered_at)
    VALUES (?, ?, ?, ?, 'delivered', ?, ?)
  `).bind(receipt.id, user.id, channel, destination, now, now).run();

  // Log delivery with email template info
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('receipt_delivered', ?, ?, 'receipt_delivery', ?, ?)
  `).bind(user.id, user.id, receipt.id, JSON.stringify({ 
    channel, 
    destination, 
    receiptCode,
    emailSubject: emailContent.subject,
  })).run();

  // Fetch updated deliveries
  const { results: deliveries } = await c.env.DB.prepare(`
    SELECT id, channel, destination, status, sent_at, delivered_at, failed_at
    FROM receipt_deliveries
    WHERE receipt_id = ?
    ORDER BY created_at DESC
  `).bind(receipt.id).all();

  return c.json({
    success: true,
    message: `Receipt confirmation ${channel === "email" ? "emailed" : "texted"} to ${destination}`,
    deliveries,
    emailPreview: {
      subject: emailContent.subject,
      // Include HTML for preview (in production, this would be sent via email service)
      html: emailContent.html,
    },
  });
});

// Preview email template (for testing)
app.get("/api/emails/preview/:type", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const type = c.req.param("type");
  const baseUrl = c.req.url.split("/api")[0];

  if (type === "receipt") {
    const email = generateReceiptEmail({
      receiptCode: "PV-DEMO123-XYZ",
      leagueName: "Sunday Funday Pool",
      sportName: "NFL Football",
      periodId: "Week 12",
      pickCount: 14,
      submittedAt: new Date().toISOString(),
      payloadHash: "8a4d7e3b9c1f2a5d6e8b0c3f7a9d2e4b6c8f0a1d3e5b7c9f2a4d6e8b0c3f5a7d",
      picks: [
        { eventName: "Ravens @ Steelers", pickValue: "Ravens", confidenceRank: 14 },
        { eventName: "Chiefs @ Raiders", pickValue: "Chiefs", confidenceRank: 13 },
        { eventName: "Bills @ Dolphins", pickValue: "Bills", confidenceRank: 12 },
        { eventName: "Cowboys @ Eagles", pickValue: "Eagles", confidenceRank: 11 },
        { eventName: "49ers @ Seahawks", pickValue: "49ers", confidenceRank: 10 },
      ],
      userName: user.email.split("@")[0],
      verifyUrl: `${baseUrl}/picks`,
    });
    
    // Return HTML directly for browser preview
    if (c.req.header("accept")?.includes("text/html")) {
      return c.html(email.html);
    }
    return c.json(email);
  }

  if (type === "deadline") {
    const email = generateDeadlineReminderEmail({
      userName: user.email.split("@")[0],
      leagueName: "Sunday Funday Pool",
      sportName: "NFL Football",
      periodId: "Week 12",
      deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      picksUrl: `${baseUrl}/leagues/1/picks`,
      eventsCount: 14,
    });
    
    if (c.req.header("accept")?.includes("text/html")) {
      return c.html(email.html);
    }
    return c.json(email);
  }

  if (type === "results") {
    const email = generateWeeklyResultsEmail({
      userName: user.email.split("@")[0],
      leagueName: "Sunday Funday Pool",
      sportName: "NFL Football",
      periodId: "Week 11",
      correctPicks: 10,
      totalPicks: 14,
      pointsEarned: 85,
      currentRank: 3,
      totalPlayers: 12,
      topPicks: [
        { event: "Ravens @ Steelers", pick: "Ravens", result: "win" },
        { event: "Chiefs @ Raiders", pick: "Chiefs", result: "win" },
        { event: "Bills @ Dolphins", pick: "Bills", result: "loss" },
        { event: "Cowboys @ Eagles", pick: "Eagles", result: "win" },
        { event: "49ers @ Seahawks", pick: "49ers", result: "win" },
      ],
      dashboardUrl: `${baseUrl}/`,
    });
    
    if (c.req.header("accept")?.includes("text/html")) {
      return c.html(email.html);
    }
    return c.json(email);
  }

  return c.json({ error: "Unknown email type. Use: receipt, deadline, results" }, 400);
});

// ============ Analytics Routes ============

// Get comprehensive analytics for current user
app.get("/api/analytics", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueFilter = c.req.query("league");
  const rangeFilter = c.req.query("range") || "season";

  // Get user's leagues
  const { results: userLeagues } = await c.env.DB.prepare(`
    SELECT l.*, lm.role,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
    FROM leagues l
    INNER JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND l.is_active = 1
  `).bind(user.id).all();

  // Build league filter for queries
  const leagueIds = leagueFilter 
    ? [parseInt(leagueFilter)] 
    : userLeagues.map((l: Record<string, unknown>) => l.id as number);

  if (leagueIds.length === 0) {
    return c.json({
      overview: {
        totalPicks: 0, correctPicks: 0, winPercentage: 0, totalPoints: 0,
        avgPointsPerWeek: 0, bestWeek: null, worstWeek: null,
        currentStreak: 0, streakType: "none", longestWinStreak: 0, longestLossStreak: 0,
      },
      leagueStats: [],
      weeklyPerformance: [],
      sportBreakdown: [],
      formatBreakdown: [],
      recentPicks: [],
      teamAnalysis: [],
    });
  }

  const leagueIdList = leagueIds.join(",");

  // Get all picks with results (including fields for gradePick fallback)
  const { results: allPicks } = await c.env.DB.prepare(`
    SELECT 
      p.id, p.user_id, p.league_id, p.event_id, p.period_id, p.pick_value, 
      p.confidence_rank, p.is_correct, p.points_earned, p.created_at, p.entry_id,
      e.winner, e.status as event_status, e.home_team, e.away_team, e.start_at,
      e.home_score, e.away_score, e.spread,
      l.name as league_name, l.sport_key, l.format_key, l.rules_json
    FROM picks p
    LEFT JOIN events e ON p.event_id = e.id
    LEFT JOIN leagues l ON p.league_id = l.id
    WHERE p.user_id = ? AND p.league_id IN (${leagueIdList})
    ORDER BY p.created_at DESC
  `).bind(user.id).all();

  const { gradePick: gradePickAnalytics } = await import("./services/scoringEngine");
  const { deserializePoolRuleConfig: deserializeAnalytics } = await import("../shared/poolRuleConfig");
  const analyticsConfigCache = new Map<string, ReturnType<typeof deserializeAnalytics>>();
  function getAnalyticsConfig(formatKey: string, rulesJson: unknown) {
    const key = `${formatKey}:${String(rulesJson || "")}`;
    if (!analyticsConfigCache.has(key)) {
      analyticsConfigCache.set(key, deserializeAnalytics(formatKey, rulesJson as string | null));
    }
    return analyticsConfigCache.get(key)!;
  }

  // Filter by time range
  const now = new Date();
  let filteredPicks = allPicks;
  if (rangeFilter === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filteredPicks = allPicks.filter((p: Record<string, unknown>) => new Date(p.created_at as string) >= weekAgo);
  } else if (rangeFilter === "month") {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    filteredPicks = allPicks.filter((p: Record<string, unknown>) => new Date(p.created_at as string) >= monthAgo);
  }

  // Calculate overview stats
  let totalPicks = 0;
  let correctPicks = 0;
  let totalPoints = 0;
  const streakResults: number[] = [];
  const periodPoints: Record<string, { points: number; league: string }> = {};
  const sportStats: Record<string, { picks: number; correct: number }> = {};
  const formatStats: Record<string, { picks: number; correct: number; points: number }> = {};
  const teamStats: Record<string, { picks: number; wins: number }> = {};
  const confidenceData: { rank: number; correct: boolean }[] = [];

  for (const pick of filteredPicks) {
    const evStatus = (pick.event_status as string || "").toLowerCase();
    if (evStatus === "final" || evStatus === "final_ot" || evStatus === "completed" || evStatus === "canceled" || evStatus === "cancelled" || evStatus === "postponed") {
      // Use pre-scored values if available; otherwise grade via hardened engine
      let isCorrect: boolean;
      let points: number;

      if (pick.is_correct !== null && pick.is_correct !== undefined) {
        isCorrect = (pick.is_correct as number) === 1;
        points = (pick.points_earned as number) || 0;
      } else {
        const cfg = getAnalyticsConfig(pick.format_key as string, pick.rules_json);
        const gradeResult = gradePickAnalytics({
          pick_id: pick.id as number,
          entry_id: (pick.entry_id as number) || 0,
          user_id: String(pick.user_id),
          event_id: pick.event_id as number,
          pick_value: pick.pick_value as string,
          confidence_rank: (pick.confidence_rank as number | null) ?? null,
          event_status: pick.event_status as string || "FINAL",
          event_started: Boolean(pick.start_at && new Date(pick.start_at as string) < new Date()),
          home_team: (pick.home_team as string) || "",
          away_team: (pick.away_team as string) || "",
          home_score: (pick.home_score as number | null) ?? null,
          away_score: (pick.away_score as number | null) ?? null,
          winner: (pick.winner as string | null) ?? null,
          spread: (pick.spread as number | null) ?? null,
        }, cfg, pick.format_key as string);

        if (gradeResult.result === "pending") continue;
        isCorrect = gradeResult.result === "win";
        points = gradeResult.points;
      }

      totalPicks++;
      if (isCorrect) {
        correctPicks++;
        totalPoints += points;
        streakResults.push(1);
      } else {
        streakResults.push(0);
      }

      // Period tracking
      const periodKey = `${pick.league_id}-${pick.period_id}`;
      if (!periodPoints[periodKey]) {
        periodPoints[periodKey] = { points: 0, league: pick.league_name as string };
      }
      periodPoints[periodKey].points += isCorrect ? points : 0;

      // Sport breakdown
      const sport = pick.sport_key as string;
      if (!sportStats[sport]) sportStats[sport] = { picks: 0, correct: 0 };
      sportStats[sport].picks++;
      if (isCorrect) sportStats[sport].correct++;

      // Format breakdown
      const format = pick.format_key as string;
      if (!formatStats[format]) formatStats[format] = { picks: 0, correct: 0, points: 0 };
      formatStats[format].picks++;
      if (isCorrect) {
        formatStats[format].correct++;
        formatStats[format].points += points;
      }

      // Team analysis
      const team = pick.pick_value as string;
      if (!teamStats[team]) teamStats[team] = { picks: 0, wins: 0 };
      teamStats[team].picks++;
      if (isCorrect) teamStats[team].wins++;

      // Confidence analysis
      if (pick.confidence_rank) {
        confidenceData.push({ rank: pick.confidence_rank as number, correct: isCorrect });
      }
    }
  }

  // Calculate streaks
  let currentStreak = 0;
  let streakType: "win" | "loss" | "none" = "none";
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;

  for (let i = streakResults.length - 1; i >= 0; i--) {
    if (currentStreak === 0) {
      streakType = streakResults[i] === 1 ? "win" : "loss";
    }
    if ((streakType === "win" && streakResults[i] === 1) ||
        (streakType === "loss" && streakResults[i] === 0)) {
      currentStreak++;
    } else if (currentStreak > 0) {
      break;
    }
  }

  for (const result of streakResults) {
    if (result === 1) {
      tempWinStreak++;
      longestWinStreak = Math.max(longestWinStreak, tempWinStreak);
      tempLossStreak = 0;
    } else {
      tempLossStreak++;
      longestLossStreak = Math.max(longestLossStreak, tempLossStreak);
      tempWinStreak = 0;
    }
  }

  // Find best/worst week
  let bestWeek: { period: string; points: number; league: string } | null = null;
  let worstWeek: { period: string; points: number; league: string } | null = null;
  
  for (const [periodKey, data] of Object.entries(periodPoints)) {
    const period = periodKey.split("-").slice(1).join("-");
    if (!bestWeek || data.points > bestWeek.points) {
      bestWeek = { period, points: data.points, league: data.league };
    }
    if (!worstWeek || data.points < worstWeek.points) {
      worstWeek = { period, points: data.points, league: data.league };
    }
  }

  // Calculate league stats
  const leagueStats = [];
  for (const league of userLeagues) {
    const leaguePicks = filteredPicks.filter((p: Record<string, unknown>) => 
      p.league_id === league.id && (p.event_status === "final" || p.event_status === "final_ot")
    );
    
    const leagueCorrect = leaguePicks.filter((p: Record<string, unknown>) =>
      p.is_correct !== null && p.is_correct !== undefined && (p.is_correct as number) === 1
    ).length;
    const leaguePoints = leaguePicks.reduce((sum: number, p: Record<string, unknown>) => {
      const correct = p.is_correct !== null && p.is_correct !== undefined && (p.is_correct as number) === 1;
      return sum + (correct ? ((p.points_earned as number) || 0) : 0);
    }, 0);

    // Get rank in this league
    const { results: standings } = await c.env.DB.prepare(`
      SELECT user_id, SUM(CASE WHEN is_correct = 1 THEN COALESCE(points_earned, 1) ELSE 0 END) as total_points
      FROM picks 
      WHERE league_id = ? AND (
        SELECT status FROM events WHERE id = picks.event_id
      ) IN ('final', 'final_ot')
      GROUP BY user_id
      ORDER BY total_points DESC
    `).bind(league.id).all();

    const rank = standings.findIndex((s: Record<string, unknown>) => s.user_id === user.id) + 1;

    leagueStats.push({
      id: league.id,
      name: league.name,
      sportKey: league.sport_key,
      formatKey: league.format_key,
      rank: rank || standings.length + 1,
      totalMembers: league.member_count as number,
      points: leaguePoints,
      winPercentage: leaguePicks.length > 0 
        ? Math.round((leagueCorrect / leaguePicks.length) * 100) 
        : 0,
      picksMade: leaguePicks.length,
    });
  }

  // Weekly performance (aggregate by period)
  const periodData: Record<string, { points: number; correct: number; total: number }> = {};
  for (const pick of filteredPicks) {
    const evStat = (pick.event_status as string || "").toLowerCase();
    if (evStat === "final" || evStat === "final_ot" || evStat === "completed") {
      const period = pick.period_id as string;
      if (!periodData[period]) periodData[period] = { points: 0, correct: 0, total: 0 };
      periodData[period].total++;

      let pickCorrect: boolean;
      let pickPts: number;
      if (pick.is_correct !== null && pick.is_correct !== undefined) {
        pickCorrect = (pick.is_correct as number) === 1;
        pickPts = (pick.points_earned as number) || 0;
      } else {
        const cfg = getAnalyticsConfig(pick.format_key as string, pick.rules_json);
        const gr = gradePickAnalytics({
          pick_id: pick.id as number, entry_id: (pick.entry_id as number) || 0,
          user_id: String(pick.user_id), event_id: pick.event_id as number,
          pick_value: pick.pick_value as string, confidence_rank: (pick.confidence_rank as number | null) ?? null,
          event_status: pick.event_status as string || "FINAL",
          event_started: Boolean(pick.start_at && new Date(pick.start_at as string) < new Date()),
          home_team: (pick.home_team as string) || "", away_team: (pick.away_team as string) || "",
          home_score: (pick.home_score as number | null) ?? null, away_score: (pick.away_score as number | null) ?? null,
          winner: (pick.winner as string | null) ?? null, spread: (pick.spread as number | null) ?? null,
        }, cfg, pick.format_key as string);
        pickCorrect = gr.result === "win";
        pickPts = gr.points;
      }

      if (pickCorrect) {
        periodData[period].correct++;
        periodData[period].points += pickPts;
      }
    }
  }

  const weeklyPerformance = Object.entries(periodData)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([period, data]) => ({
      period,
      points: data.points,
      correct: data.correct,
      total: data.total,
      winPct: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
    }));

  // Sport breakdown
  const sportBreakdown = Object.entries(sportStats)
    .map(([sport, data]) => ({
      sport: sport.toUpperCase(),
      picks: data.picks,
      correct: data.correct,
      winPct: data.picks > 0 ? Math.round((data.correct / data.picks) * 100) : 0,
    }))
    .sort((a, b) => b.picks - a.picks);

  // Format breakdown
  const formatNames: Record<string, string> = {
    pickem: "Pick'em",
    confidence: "Confidence",
    survivor: "Survivor",
    bracket: "Bracket",
    squares: "Squares",
  };
  
  const formatBreakdown = Object.entries(formatStats)
    .map(([format, data]) => ({
      format: formatNames[format] || format,
      picks: data.picks,
      correct: data.correct,
      winPct: data.picks > 0 ? Math.round((data.correct / data.picks) * 100) : 0,
      avgPoints: data.picks > 0 ? Math.round((data.points / data.picks) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.picks - a.picks);

  // Recent picks (last 20) — use pre-scored values or gradePick fallback
  const recentPicks = filteredPicks.slice(0, 20).map((pick: Record<string, unknown>) => {
    const evSt = ((pick.event_status as string) || "").toLowerCase();
    const isFinal = evSt === "final" || evSt === "final_ot" || evSt === "completed";

    let result: string = "pending";
    let pts = 0;

    if (isFinal) {
      if (pick.is_correct !== null && pick.is_correct !== undefined) {
        result = (pick.is_correct as number) === 1 ? "win" : "loss";
        pts = (pick.points_earned as number) || 0;
      } else {
        const cfg = getAnalyticsConfig(pick.format_key as string, pick.rules_json);
        const gr = gradePickAnalytics({
          pick_id: pick.id as number, entry_id: (pick.entry_id as number) || 0,
          user_id: String(pick.user_id), event_id: pick.event_id as number,
          pick_value: pick.pick_value as string, confidence_rank: (pick.confidence_rank as number | null) ?? null,
          event_status: pick.event_status as string || "FINAL",
          event_started: true,
          home_team: (pick.home_team as string) || "", away_team: (pick.away_team as string) || "",
          home_score: (pick.home_score as number | null) ?? null, away_score: (pick.away_score as number | null) ?? null,
          winner: (pick.winner as string | null) ?? null, spread: (pick.spread as number | null) ?? null,
        }, cfg, pick.format_key as string);
        result = gr.result === "win" ? "win" : gr.result === "push" ? "push" : gr.result === "void" ? "void" : "loss";
        pts = gr.points;
      }
    }

    return {
      id: pick.id,
      leagueName: pick.league_name,
      period: pick.period_id,
      pickValue: pick.pick_value,
      result,
      points: pts,
      date: (pick.start_at as string)?.split("T")[0] || (pick.created_at as string)?.split("T")[0],
    };
  });

  // Team analysis (top 10)
  const teamAnalysis = Object.entries(teamStats)
    .map(([team, data]) => ({
      team,
      picks: data.picks,
      wins: data.wins,
      winPct: data.picks > 0 ? Math.round((data.wins / data.picks) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 10);

  // Confidence analysis
  let confidenceAnalysis = undefined;
  if (confidenceData.length > 0) {
    const distribution: Record<number, { correct: number; total: number }> = {};
    let correctRankSum = 0;
    let correctCount = 0;
    let wrongRankSum = 0;
    let wrongCount = 0;

    for (const item of confidenceData) {
      if (!distribution[item.rank]) distribution[item.rank] = { correct: 0, total: 0 };
      distribution[item.rank].total++;
      if (item.correct) {
        distribution[item.rank].correct++;
        correctRankSum += item.rank;
        correctCount++;
      } else {
        wrongRankSum += item.rank;
        wrongCount++;
      }
    }

    confidenceAnalysis = {
      distribution: Object.entries(distribution)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([rank, data]) => ({ rank: parseInt(rank), ...data })),
      avgRankWhenCorrect: correctCount > 0 ? Math.round((correctRankSum / correctCount) * 10) / 10 : 0,
      avgRankWhenWrong: wrongCount > 0 ? Math.round((wrongRankSum / wrongCount) * 10) / 10 : 0,
    };
  }

  const uniquePeriods = Object.keys(periodPoints).length;
  const winPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 1000) / 10 : 0;

  return c.json({
    overview: {
      totalPicks,
      correctPicks,
      winPercentage,
      totalPoints,
      avgPointsPerWeek: uniquePeriods > 0 ? Math.round((totalPoints / uniquePeriods) * 10) / 10 : 0,
      bestWeek,
      worstWeek,
      currentStreak,
      streakType: currentStreak > 0 ? streakType : "none",
      longestWinStreak,
      longestLossStreak,
    },
    leagueStats,
    weeklyPerformance,
    sportBreakdown,
    formatBreakdown,
    recentPicks,
    confidenceAnalysis,
    teamAnalysis,
  });
});

// ============ Events Routes ============

// Get available periods for a sport
app.get("/api/events/periods", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const sportKey = c.req.query("sport") || "nfl";
  const season = c.req.query("season") || "2024-2025";

  // Get periods from config
  const configPeriods = getAvailablePeriods(sportKey, season);

  // Get periods that have events in DB
  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT period_id FROM events 
    WHERE sport_key = ? 
    ORDER BY period_id ASC
  `).bind(sportKey).all();

  const dbPeriods = results.map((r: Record<string, unknown>) => r.period_id as string);

  // Merge and dedupe
  const allPeriods = [...new Set([...dbPeriods, ...configPeriods])];

  // Find current period (first one with upcoming games)
  const now = new Date().toISOString();
  const currentPeriodResult = await c.env.DB.prepare(`
    SELECT period_id FROM events 
    WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC
    LIMIT 1
  `).bind(sportKey, now).first<{ period_id: string }>();

  // Default to first period with scheduled games, or first config period
  const currentPeriod = currentPeriodResult?.period_id || configPeriods[0] || null;

  return c.json({
    periods: allPeriods.length > 0 ? allPeriods : configPeriods.slice(0, 18),
    currentPeriod,
  });
});

// Get events with filters
app.get("/api/events", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const sportKey = c.req.query("sport") || "nfl";
  const periodId = c.req.query("period");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);

  let query = `SELECT * FROM events WHERE sport_key = ?`;
  const params: (string | number)[] = [sportKey];

  if (periodId) {
    query += ` AND period_id = ?`;
    params.push(periodId);
  }

  if (status && status !== "all") {
    if (status === "final") {
      query += ` AND (status = 'final' OR status = 'final_ot')`;
    } else {
      query += ` AND status = ?`;
      params.push(status);
    }
  }

  query += ` ORDER BY start_at ASC LIMIT ?`;
  params.push(limit);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ events: results });
});

// Get single event
app.get("/api/events/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const eventId = c.req.param("id");

  const event = await c.env.DB.prepare(`
    SELECT * FROM events WHERE id = ?
  `).bind(eventId).first();

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  return c.json(event);
});

// Sync events (generates sample data for development)
app.post("/api/events/sync", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { sportKey, periodId, finalize } = body;

  if (!sportKey || !periodId) {
    return c.json({ error: "Sport and period required" }, 400);
  }

  // Check if events already exist for this period
  const existing = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM events WHERE sport_key = ? AND period_id = ?
  `).bind(sportKey, periodId).first<{ count: number }>();

  if (existing && existing.count > 0) {
    // If finalize flag is set, mark some events as final
    if (finalize) {
      const { results: scheduledEvents } = await c.env.DB.prepare(`
        SELECT * FROM events WHERE sport_key = ? AND period_id = ? AND status = 'scheduled'
        LIMIT 5
      `).bind(sportKey, periodId).all();

      let finalized = 0;
      for (const event of scheduledEvents) {
        const normalized: NormalizedEvent = {
          externalId: event.external_id as string,
          sportKey: event.sport_key as string,
          season: event.season as string,
          periodId: event.period_id as string,
          startAt: event.start_at as string,
          homeTeam: event.home_team as string,
          awayTeam: event.away_team as string,
          status: "scheduled",
        };

        const finalEvent = generateFinalizedEvent(normalized);

        await c.env.DB.prepare(`
          UPDATE events 
          SET home_score = ?, away_score = ?, status = ?, winner = ?, final_result = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          finalEvent.homeScore,
          finalEvent.awayScore,
          finalEvent.status,
          finalEvent.winner,
          finalEvent.finalResult,
          event.id
        ).run();

        finalized++;
      }

      return c.json({ 
        success: true, 
        message: `Finalized ${finalized} events`,
        eventsFinalized: finalized,
      });
    }

    return c.json({ 
      success: true, 
      message: "Events already exist for this period",
      eventsExisting: existing.count,
    });
  }

  // Generate sample events
  const sampleEvents = generateSampleEvents(sportKey, periodId, 16);

  let inserted = 0;
  for (const event of sampleEvents) {
    try {
      await c.env.DB.prepare(`
        INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        event.externalId,
        event.sportKey,
        event.season,
        event.periodId,
        event.startAt,
        event.homeTeam,
        event.awayTeam,
        event.status
      ).run();
      inserted++;
    } catch (err) {
      console.error("Failed to insert event:", err);
    }
  }

  // Log sync event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('events_synced', ?, ?, 'event', ?)
  `).bind(user.id, user.id, JSON.stringify({ sportKey, periodId, eventsInserted: inserted })).run();

  return c.json({ 
    success: true, 
    message: `Synced ${inserted} events for ${sportKey} ${periodId}`,
    eventsInserted: inserted,
  });
});

// Update event (admin endpoint for manual corrections)
app.patch("/api/events/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const eventId = c.req.param("id");
  const body = await c.req.json();

  const { homeScore, awayScore, status, winner } = body;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (homeScore !== undefined) {
    updates.push("home_score = ?");
    values.push(homeScore);
  }
  if (awayScore !== undefined) {
    updates.push("away_score = ?");
    values.push(awayScore);
  }
  if (status !== undefined) {
    updates.push("status = ?");
    values.push(status);
  }
  if (winner !== undefined) {
    updates.push("winner = ?");
    values.push(winner);
  }

  if (updates.length === 0) {
    return c.json({ error: "No updates provided" }, 400);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(eventId);

  await c.env.DB.prepare(`
    UPDATE events SET ${updates.join(", ")} WHERE id = ?
  `).bind(...values).run();

  // Build final_result if scores and teams exist
  const event = await c.env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(eventId).first();
  
  if (event && event.home_score !== null && event.away_score !== null) {
    const finalResult = `${event.home_team} ${event.home_score} - ${event.away_score} ${event.away_team}`;
    await c.env.DB.prepare(`
      UPDATE events SET final_result = ? WHERE id = ?
    `).bind(finalResult, eventId).run();
  }

  // Log update
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('event_updated', ?, ?, 'event', ?, ?)
  `).bind(user.id, user.id, eventId, JSON.stringify(body)).run();

  return c.json({ success: true });
});

// Bulk finalize events (simulate game completions for testing)
app.post("/api/events/finalize", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { sportKey, periodId, count = 5 } = body;

  if (!sportKey || !periodId) {
    return c.json({ error: "Sport and period required" }, 400);
  }

  const { results: scheduledEvents } = await c.env.DB.prepare(`
    SELECT * FROM events 
    WHERE sport_key = ? AND period_id = ? AND status = 'scheduled'
    ORDER BY start_at ASC
    LIMIT ?
  `).bind(sportKey, periodId, count).all();

  let finalized = 0;
  for (const event of scheduledEvents) {
    const normalized: NormalizedEvent = {
      externalId: event.external_id as string,
      sportKey: event.sport_key as string,
      season: event.season as string,
      periodId: event.period_id as string,
      startAt: event.start_at as string,
      homeTeam: event.home_team as string,
      awayTeam: event.away_team as string,
      status: "scheduled",
    };

    const finalEvent = generateFinalizedEvent(normalized);

    await c.env.DB.prepare(`
      UPDATE events 
      SET home_score = ?, away_score = ?, status = ?, winner = ?, final_result = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      finalEvent.homeScore,
      finalEvent.awayScore,
      finalEvent.status,
      finalEvent.winner,
      finalEvent.finalResult,
      event.id
    ).run();

    finalized++;
  }

  // Log finalization
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('events_finalized', ?, ?, 'event', ?)
  `).bind(user.id, user.id, JSON.stringify({ sportKey, periodId, eventsFinalized: finalized })).run();

  return c.json({ 
    success: true, 
    eventsFinalized: finalized,
    message: `Finalized ${finalized} events`,
  });
});

// ============ Escrow Gateway Routes ============

// Generate SHA-256 hash for webhook payload verification
async function generateWebhookHash(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Create a payment intent (initiate entry fee payment)
app.post("/api/leagues/:id/payments/intent", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const body = await c.req.json();
  const { provider, intentType = "entry_fee" } = body;

  if (!provider || !["stripe", "paypal", "venmo", "manual"].includes(provider)) {
    return c.json({ error: "Invalid payment provider" }, 400);
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role, is_payment_verified FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string; is_payment_verified: number }>();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Check if already paid
  if (membership.is_payment_verified) {
    return c.json({ error: "Payment already verified for this league" }, 400);
  }

  // Get league entry fee
  const league = await c.env.DB.prepare(`
    SELECT name, entry_fee_cents, is_payment_required FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; entry_fee_cents: number; is_payment_required: number }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  if (!league.is_payment_required || league.entry_fee_cents <= 0) {
    return c.json({ error: "This league does not require payment" }, 400);
  }

  // Check for existing pending transaction
  const existingPending = await c.env.DB.prepare(`
    SELECT id FROM transaction_ledger 
    WHERE league_id = ? AND user_id = ? AND intent_type = 'entry_fee' AND status = 'pending'
  `).bind(leagueId, user.id).first();

  if (existingPending) {
    return c.json({ error: "A pending payment already exists. Complete or cancel it first." }, 400);
  }

  // Create transaction record
  const providerTxnId = generateMockTxnId(provider as EscrowProvider);
  
  const result = await c.env.DB.prepare(`
    INSERT INTO transaction_ledger (league_id, user_id, provider, provider_txn_id, intent_type, amount_cents, fee_cents, currency, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'pending')
  `).bind(
    leagueId,
    user.id,
    provider,
    providerTxnId,
    intentType,
    league.entry_fee_cents,
    Math.round(league.entry_fee_cents * 0.029) // ~2.9% processing fee estimate
  ).run();

  const transactionId = result.meta.last_row_id;

  // Log the intent creation
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('payment_intent_created', ?, ?, ?, 'transaction', ?, ?)
  `).bind(leagueId, user.id, user.id, transactionId, JSON.stringify({ 
    provider, 
    amountCents: league.entry_fee_cents,
    providerTxnId 
  })).run();

  // In a real implementation, this would return a redirect URL to the payment provider
  // For now, return the transaction details
  return c.json({
    transactionId,
    providerTxnId,
    provider,
    amountCents: league.entry_fee_cents,
    currency: "USD",
    status: "pending",
    // Mock redirect URLs for external providers
    redirectUrl: provider !== "manual" 
      ? `https://pay.example.com/${provider}/${providerTxnId}` 
      : null,
    message: provider === "manual" 
      ? "Manual payment created. An admin will verify your payment."
      : `Redirect to ${provider} to complete payment.`,
  });
});

// Simulate webhook callback (for testing/demo purposes)
app.post("/api/webhooks/escrow/:provider", async (c) => {
  const provider = c.req.param("provider") as EscrowProvider;
  const body = await c.req.json();
  const { providerTxnId, status, signature } = body;

  if (!providerTxnId || !status) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // Find the transaction
  const transaction = await c.env.DB.prepare(`
    SELECT tl.*, l.name as league_name 
    FROM transaction_ledger tl
    INNER JOIN leagues l ON tl.league_id = l.id
    WHERE tl.provider_txn_id = ? AND tl.provider = ?
  `).bind(providerTxnId, provider).first<{
    id: number;
    league_id: number;
    user_id: number;
    amount_cents: number;
    status: string;
    league_name: string;
  }>();

  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  // Hash the webhook payload for audit trail
  const payloadHash = await generateWebhookHash(JSON.stringify(body));

  // Update transaction status
  const now = new Date().toISOString();
  const completedAt = status === "completed" ? now : null;

  await c.env.DB.prepare(`
    UPDATE transaction_ledger 
    SET status = ?, webhook_payload_hash = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, payloadHash, completedAt, transaction.id).run();

  // If payment completed, update member payment status
  if (status === "completed") {
    await c.env.DB.prepare(`
      UPDATE league_members 
      SET is_payment_verified = 1, payment_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE league_id = ? AND user_id = ?
    `).bind(now, transaction.league_id, transaction.user_id).run();
  }

  // Log the webhook event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, entity_type, entity_id, payload_json)
    VALUES ('payment_webhook_received', ?, ?, 'transaction', ?, ?)
  `).bind(
    transaction.league_id, 
    transaction.user_id, 
    transaction.id, 
    JSON.stringify({ provider, status, payloadHash, signature })
  ).run();

  return c.json({ 
    success: true, 
    transactionId: transaction.id,
    status,
    paymentVerified: status === "completed",
  });
});

// Get payment eligibility for a league
app.get("/api/leagues/:id/payments/eligibility", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role, is_payment_verified FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string; is_payment_verified: number }>();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT entry_fee_cents, is_payment_required FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ entry_fee_cents: number; is_payment_required: number }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  // Get user's transactions for this league
  const { results: transactions } = await c.env.DB.prepare(`
    SELECT * FROM transaction_ledger 
    WHERE league_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).bind(leagueId, user.id).all();

  // Calculate paid and pending amounts
  let paidAmountCents = 0;
  let pendingAmountCents = 0;

  for (const txn of transactions) {
    if (txn.status === "completed" && txn.intent_type !== "refund") {
      paidAmountCents += txn.amount_cents as number;
    } else if (txn.status === "refunded" || (txn.status === "completed" && txn.intent_type === "refund")) {
      paidAmountCents -= txn.amount_cents as number;
    } else if (txn.status === "pending" || txn.status === "processing") {
      pendingAmountCents += txn.amount_cents as number;
    }
  }

  const isEligible = !league.is_payment_required || 
    membership.is_payment_verified === 1 || 
    paidAmountCents >= league.entry_fee_cents;

  return c.json({
    userId: user.id,
    leagueId: parseInt(leagueId),
    isEligible,
    isPaymentRequired: league.is_payment_required === 1,
    requiredAmountCents: league.entry_fee_cents,
    paidAmountCents,
    pendingAmountCents,
    transactions,
  });
});

// Get transaction ledger for a league (admin only)
app.get("/api/leagues/:id/transactions", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const { results: transactions } = await c.env.DB.prepare(`
    SELECT tl.*, u.email, u.display_name
    FROM transaction_ledger tl
    INNER JOIN users u ON tl.user_id = u.id
    WHERE tl.league_id = ?
    ORDER BY tl.created_at DESC
  `).bind(leagueId).all();

  // Get summary stats
  const summary = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_transactions,
      SUM(CASE WHEN status = 'completed' AND intent_type != 'refund' THEN amount_cents ELSE 0 END) as total_collected,
      SUM(CASE WHEN status = 'completed' AND intent_type != 'refund' THEN fee_cents ELSE 0 END) as total_fees,
      SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN amount_cents ELSE 0 END) as total_pending,
      SUM(CASE WHEN status = 'refunded' OR (status = 'completed' AND intent_type = 'refund') THEN amount_cents ELSE 0 END) as total_refunded,
      COUNT(DISTINCT CASE WHEN status = 'completed' THEN user_id END) as paid_members
    FROM transaction_ledger
    WHERE league_id = ?
  `).bind(leagueId).first();

  return c.json({
    transactions,
    summary: {
      totalTransactions: summary?.total_transactions || 0,
      totalCollectedCents: summary?.total_collected || 0,
      totalFeesCents: summary?.total_fees || 0,
      totalPendingCents: summary?.total_pending || 0,
      totalRefundedCents: summary?.total_refunded || 0,
      paidMembers: summary?.paid_members || 0,
    },
  });
});

// Get all payments/transactions for a league (used by payment dashboard)
app.get("/api/leagues/:id/payments", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const { results: transactions } = await c.env.DB.prepare(`
    SELECT tl.*, u.email, u.display_name
    FROM transaction_ledger tl
    LEFT JOIN users u ON tl.user_id = u.id
    WHERE tl.league_id = ?
    ORDER BY tl.created_at DESC
  `).bind(leagueId).all();

  return c.json(transactions);
});

// Get eligibility status for all members in a league
app.get("/api/leagues/:id/eligibility", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Get all members with their payment and pick status
  const { results: members } = await c.env.DB.prepare(`
    SELECT 
      lm.user_id,
      u.display_name,
      u.email,
      lm.is_payment_verified,
      (SELECT COUNT(*) FROM picks WHERE user_id = lm.user_id AND league_id = lm.league_id) as picks_count
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ?
  `).bind(leagueId).all();

  // Get league payment requirements
  const league = await c.env.DB.prepare(`
    SELECT is_payment_required FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ is_payment_required: number }>();

  const eligibility = members.map((m: Record<string, unknown>) => ({
    user_id: m.user_id,
    display_name: m.display_name,
    email: m.email,
    is_eligible: !league?.is_payment_required || m.is_payment_verified === 1,
    has_paid: m.is_payment_verified === 1,
    has_submitted_picks: ((m.picks_count as number) || 0) > 0,
    picks_count: m.picks_count || 0,
  }));

  return c.json(eligibility);
});

// Record an external payment (admin records a payment received outside the system)
app.post("/api/leagues/:id/payments/record", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const body = await c.req.json();
  const { userId, provider, providerTxnId, amountCents } = body;

  if (!userId || !provider) {
    return c.json({ error: "User ID and provider required" }, 400);
  }

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Get league entry fee if amount not specified
  const league = await c.env.DB.prepare(`
    SELECT entry_fee_cents FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ entry_fee_cents: number }>();

  const amount = amountCents || league?.entry_fee_cents || 0;
  const now = new Date().toISOString();
  const txnId = providerTxnId || generateMockTxnId(provider as EscrowProvider);

  // Create transaction record
  const result = await c.env.DB.prepare(`
    INSERT INTO transaction_ledger (league_id, user_id, provider, provider_txn_id, intent_type, amount_cents, fee_cents, currency, status, completed_at)
    VALUES (?, ?, ?, ?, 'entry_fee', ?, 0, 'USD', 'completed', ?)
  `).bind(leagueId, userId, provider, txnId, amount, now).run();

  const transactionId = result.meta.last_row_id;

  // Update member payment status
  await c.env.DB.prepare(`
    UPDATE league_members 
    SET is_payment_verified = 1, payment_verified_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE league_id = ? AND user_id = ?
  `).bind(now, leagueId, userId).run();

  // Log the recording
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('payment_recorded', ?, ?, ?, 'transaction', ?, ?)
  `).bind(leagueId, userId, user.id, transactionId, JSON.stringify({ 
    provider, 
    amountCents: amount,
    providerTxnId: txnId 
  })).run();

  return c.json({
    success: true,
    transactionId,
    message: "Payment recorded and member verified",
  });
});

// Admin: Manually verify/unverify a payment (toggle verification status)
app.post("/api/leagues/:id/payments/verify", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const body = await c.req.json();
  const { memberId, userId, verified, amountCents, notes } = body;
  
  // Support both memberId (from new UI) and userId (from existing code)
  const targetMemberId = memberId;
  let targetUserId = userId;

  if (!targetMemberId && !targetUserId) {
    return c.json({ error: "Member ID or User ID required" }, 400);
  }

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Get target member - support lookup by either memberId or userId
  let targetMembership;
  if (targetMemberId) {
    targetMembership = await c.env.DB.prepare(`
      SELECT id, user_id, is_payment_verified FROM league_members WHERE id = ? AND league_id = ?
    `).bind(targetMemberId, leagueId).first<{ id: number; user_id: string; is_payment_verified: number }>();
    if (targetMembership) targetUserId = targetMembership.user_id;
  } else {
    targetMembership = await c.env.DB.prepare(`
      SELECT id, user_id, is_payment_verified FROM league_members WHERE league_id = ? AND user_id = ?
    `).bind(leagueId, targetUserId).first<{ id: number; user_id: string; is_payment_verified: number }>();
  }

  if (!targetMembership) {
    return c.json({ error: "Member not found in this league" }, 404);
  }

  const now = new Date().toISOString();
  const shouldVerify = verified !== undefined ? verified : true;

  if (shouldVerify) {
    // Verify payment - create transaction record and update member
    const league = await c.env.DB.prepare(`
      SELECT entry_fee_cents FROM leagues WHERE id = ?
    `).bind(leagueId).first<{ entry_fee_cents: number }>();

    const amount = amountCents || league?.entry_fee_cents || 0;

    const result = await c.env.DB.prepare(`
      INSERT INTO transaction_ledger (league_id, user_id, provider, provider_txn_id, intent_type, amount_cents, fee_cents, currency, status, completed_at)
      VALUES (?, ?, 'manual', ?, 'entry_fee', ?, 0, 'USD', 'completed', ?)
    `).bind(leagueId, targetUserId, generateMockTxnId("manual"), amount, now).run();

    await c.env.DB.prepare(`
      UPDATE league_members 
      SET is_payment_verified = 1, payment_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(now, targetMembership.id).run();

    await c.env.DB.prepare(`
      INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json, reason)
      VALUES ('payment_manually_verified', ?, ?, ?, 'transaction', ?, ?, ?)
    `).bind(leagueId, targetUserId, user.id, result.meta.last_row_id, JSON.stringify({ amountCents: amount }), notes || "Manual verification by admin").run();

    return c.json({ success: true, message: "Payment verified successfully" });
  } else {
    // Unverify payment - just update the member status
    await c.env.DB.prepare(`
      UPDATE league_members 
      SET is_payment_verified = 0, payment_verified_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(targetMembership.id).run();

    await c.env.DB.prepare(`
      INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, reason)
      VALUES ('payment_verification_removed', ?, ?, ?, 'league_member', ?, ?)
    `).bind(leagueId, targetUserId, user.id, targetMembership.id, notes || "Verification removed by admin").run();

    return c.json({ success: true, message: "Payment verification removed" });
  }
});

// Admin: Issue a refund
app.post("/api/leagues/:id/payments/refund", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const body = await c.req.json();
  const { transactionId, reason } = body;

  if (!transactionId) {
    return c.json({ error: "Transaction ID required" }, 400);
  }

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Get original transaction
  const transaction = await c.env.DB.prepare(`
    SELECT * FROM transaction_ledger WHERE id = ? AND league_id = ?
  `).bind(transactionId, leagueId).first<{
    id: number;
    user_id: number;
    amount_cents: number;
    status: string;
    provider: string;
  }>();

  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  if (transaction.status !== "completed") {
    return c.json({ error: "Can only refund completed transactions" }, 400);
  }

  const now = new Date().toISOString();

  // Update original transaction status
  await c.env.DB.prepare(`
    UPDATE transaction_ledger SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(transactionId).run();

  // Create refund record
  const refundResult = await c.env.DB.prepare(`
    INSERT INTO transaction_ledger (league_id, user_id, provider, provider_txn_id, intent_type, amount_cents, fee_cents, currency, status, completed_at)
    VALUES (?, ?, ?, ?, 'refund', ?, 0, 'USD', 'completed', ?)
  `).bind(
    leagueId, 
    transaction.user_id, 
    transaction.provider,
    generateMockTxnId(transaction.provider as EscrowProvider),
    transaction.amount_cents,
    now
  ).run();

  // Revoke payment verified status
  await c.env.DB.prepare(`
    UPDATE league_members 
    SET is_payment_verified = 0, payment_verified_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, transaction.user_id).run();

  // Log the refund
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json, reason)
    VALUES ('payment_refunded', ?, ?, ?, 'transaction', ?, ?, ?)
  `).bind(
    leagueId, 
    transaction.user_id, 
    user.id, 
    refundResult.meta.last_row_id,
    JSON.stringify({ originalTransactionId: transactionId, amountCents: transaction.amount_cents }),
    reason || "Refund issued by admin"
  ).run();

  return c.json({
    success: true,
    refundTransactionId: refundResult.meta.last_row_id,
    message: "Refund processed successfully",
  });
});

// Cancel a pending payment
app.delete("/api/leagues/:id/payments/:transactionId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const transactionId = c.req.param("transactionId");

  // Get transaction
  const transaction = await c.env.DB.prepare(`
    SELECT * FROM transaction_ledger WHERE id = ? AND league_id = ?
  `).bind(transactionId, leagueId).first<{
    id: number;
    user_id: number;
    status: string;
  }>();

  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  // Only the user who created it or an admin can cancel
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  const isAdmin = membership?.role === "owner" || membership?.role === "admin";
  const isOwner = String(transaction.user_id) === String(user.id);

  if (!isAdmin && !isOwner) {
    return c.json({ error: "Access denied" }, 403);
  }

  if (transaction.status !== "pending") {
    return c.json({ error: "Can only cancel pending transactions" }, 400);
  }

  // Update status to failed/cancelled
  await c.env.DB.prepare(`
    UPDATE transaction_ledger SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(transactionId).run();

  // Log cancellation
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, reason)
    VALUES ('payment_cancelled', ?, ?, ?, 'transaction', ?, 'Cancelled by user')
  `).bind(leagueId, transaction.user_id, user.id, transactionId).run();

  return c.json({ success: true, message: "Payment cancelled" });
});

// ============ League Feed Routes (Social Mode) ============

// Get league feed
app.get("/api/leagues/:id/feed", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const limit = Math.min(parseInt(c.req.query("limit") || "30"), 100);

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT 
      lf.id, lf.type, lf.user_id, lf.content, lf.metadata_json, lf.created_at,
      COALESCE(u.display_name, u.email) as user_name
    FROM league_feed lf
    LEFT JOIN users u ON lf.user_id = u.id
    WHERE lf.league_id = ?
    ORDER BY lf.created_at DESC
    LIMIT ?
  `).bind(leagueId, limit).all();

  return c.json(results.map((item: Record<string, unknown>) => ({
    ...item,
    metadata: item.metadata_json ? JSON.parse(item.metadata_json as string) : null,
  })));
});

// Post to league feed (comments only - achievements/milestones are system-generated)
app.post("/api/leagues/:id/feed", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const { content } = await c.req.json();

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Content is required" }, 400);
  }

  if (content.length > 500) {
    return c.json({ error: "Content must be 500 characters or less" }, 400);
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Insert the comment
  const result = await c.env.DB.prepare(`
    INSERT INTO league_feed (league_id, user_id, type, content)
    VALUES (?, ?, 'comment', ?)
  `).bind(leagueId, user.id, content.trim()).run();

  return c.json({ 
    success: true, 
    id: result.meta.last_row_id,
  });
});

// ============ Squares Pool Routes ============

// Get squares grid for a league
app.get("/api/leagues/:id/squares", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = parseInt(c.req.param("id"));
  const db = c.env.DB;

  // Get grid configuration
  const grid = await db.prepare(`
    SELECT * FROM squares_grids WHERE league_id = ?
  `).bind(leagueId).first();

  if (!grid) {
    return c.json({ grid: null, squares: [], scores: [] });
  }

  // Get all squares with owner info
  const squaresResult = await db.prepare(`
    SELECT s.*, u.display_name, u.email
    FROM squares s
    LEFT JOIN users u ON s.owner_id = CAST(u.id AS TEXT)
    WHERE s.grid_id = ?
    ORDER BY s.row_num, s.col_num
  `).bind(grid.id).all();

  // Get quarter scores
  const scoresResult = await db.prepare(`
    SELECT * FROM squares_scores WHERE grid_id = ? ORDER BY quarter
  `).bind(grid.id).all();

  // Parse row/col numbers
  const rowNumbers = grid.row_numbers ? JSON.parse(grid.row_numbers as string) : null;
  const colNumbers = grid.col_numbers ? JSON.parse(grid.col_numbers as string) : null;

  return c.json({
    grid: {
      ...grid,
      row_numbers: rowNumbers,
      col_numbers: colNumbers,
    },
    squares: squaresResult.results.map((s: Record<string, unknown>) => ({
      ...s,
      owner_name: s.display_name || (s.email ? (s.email as string).split("@")[0] : null),
      is_current_user: s.owner_id === String(user.id),
    })),
    scores: scoresResult.results,
  });
});

// Initialize squares grid for a league
app.post("/api/leagues/:id/squares", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = parseInt(c.req.param("id"));
  const db = c.env.DB;

  // Check if user is owner/admin
  const member = await db.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!member || !["owner", "admin"].includes(member.role as string)) {
    return c.json({ error: "Only owners/admins can create grid" }, 403);
  }

  // Check if grid already exists
  const existingGrid = await db.prepare(`
    SELECT id FROM squares_grids WHERE league_id = ?
  `).bind(leagueId).first();

  if (existingGrid) {
    return c.json({ error: "Grid already exists for this league" }, 400);
  }

  const body = await c.req.json();
  const { 
    home_team, away_team, price_per_square_cents = 0,
    game_date, game_time, venue 
  } = body;

  // Create grid
  const gridResult = await db.prepare(`
    INSERT INTO squares_grids (league_id, home_team, away_team, price_per_square_cents, game_date, game_time, venue)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(leagueId, home_team, away_team, price_per_square_cents, game_date, game_time, venue).run();

  const gridId = gridResult.meta.last_row_id;

  // Create 100 empty squares (10x10 grid)
  const insertSquares = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      insertSquares.push(
        db.prepare(`INSERT INTO squares (grid_id, row_num, col_num) VALUES (?, ?, ?)`)
          .bind(gridId, row, col)
      );
    }
  }
  await db.batch(insertSquares);

  // Create quarter score placeholders
  const quarters = ["Q1", "Q2", "Q3", "Q4", "Final"];
  const insertScores = quarters.map(q => 
    db.prepare(`INSERT INTO squares_scores (grid_id, quarter) VALUES (?, ?)`).bind(gridId, q)
  );
  await db.batch(insertScores);

  // Log event
  await db.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "squares_grid_created",
    leagueId,
    user.id,
    user.id,
    "squares_grid",
    gridId,
    JSON.stringify({ home_team, away_team, price_per_square_cents })
  ).run();

  return c.json({ success: true, grid_id: gridId });
});

// Claim a square
app.post("/api/leagues/:id/squares/claim", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = parseInt(c.req.param("id"));
  const db = c.env.DB;

  // Verify membership
  const member = await db.prepare(`
    SELECT id FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!member) {
    return c.json({ error: "Must be a league member" }, 403);
  }

  const body = await c.req.json();
  const { row, col } = body;

  // Get grid
  const grid = await db.prepare(`
    SELECT * FROM squares_grids WHERE league_id = ?
  `).bind(leagueId).first();

  if (!grid) {
    return c.json({ error: "Grid not found" }, 404);
  }

  if (grid.status !== "open") {
    return c.json({ error: "Grid is no longer accepting claims" }, 400);
  }

  // Get the specific square
  const square = await db.prepare(`
    SELECT * FROM squares WHERE grid_id = ? AND row_num = ? AND col_num = ?
  `).bind(grid.id, row, col).first();

  if (!square) {
    return c.json({ error: "Square not found" }, 404);
  }

  if (square.owner_id) {
    return c.json({ error: "Square already claimed" }, 400);
  }

  // Claim the square
  await db.prepare(`
    UPDATE squares SET owner_id = ?, purchased_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(String(user.id), square.id).run();

  // Log event
  await db.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "square_claimed",
    leagueId,
    user.id,
    user.id,
    "square",
    square.id,
    JSON.stringify({ row, col })
  ).run();

  return c.json({ success: true });
});

// Release a square (unclaim)
app.post("/api/leagues/:id/squares/release", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = parseInt(c.req.param("id"));
  const db = c.env.DB;
  const body = await c.req.json();
  const { row, col } = body;

  // Get grid
  const grid = await db.prepare(`
    SELECT * FROM squares_grids WHERE league_id = ?
  `).bind(leagueId).first();

  if (!grid || grid.status !== "open") {
    return c.json({ error: "Cannot release squares after grid is locked" }, 400);
  }

  // Get the square
  const square = await db.prepare(`
    SELECT * FROM squares WHERE grid_id = ? AND row_num = ? AND col_num = ?
  `).bind(grid.id, row, col).first();

  if (!square || square.owner_id !== String(user.id)) {
    return c.json({ error: "You can only release your own squares" }, 403);
  }

  // Release the square
  await db.prepare(`
    UPDATE squares SET owner_id = NULL, purchased_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(square.id).run();

  return c.json({ success: true });
});

// Reveal numbers (admin only) - locks the grid
app.post("/api/leagues/:id/squares/reveal-numbers", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = parseInt(c.req.param("id"));
  const db = c.env.DB;

  // Check admin
  const member = await db.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!member || !["owner", "admin"].includes(member.role as string)) {
    return c.json({ error: "Only owners/admins can reveal numbers" }, 403);
  }

  // Get grid
  const grid = await db.prepare(`
    SELECT * FROM squares_grids WHERE league_id = ?
  `).bind(leagueId).first();

  if (!grid) {
    return c.json({ error: "Grid not found" }, 404);
  }

  if (grid.is_numbers_revealed) {
    return c.json({ error: "Numbers already revealed" }, 400);
  }

  // Generate random numbers 0-9 for rows and columns
  const shuffleArray = (arr: number[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const rowNumbers = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const colNumbers = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  // Update grid
  await db.prepare(`
    UPDATE squares_grids 
    SET row_numbers = ?, col_numbers = ?, is_numbers_revealed = 1, status = 'locked', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(JSON.stringify(rowNumbers), JSON.stringify(colNumbers), grid.id).run();

  // Log event
  await db.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "squares_numbers_revealed",
    leagueId,
    user.id,
    user.id,
    "squares_grid",
    grid.id,
    JSON.stringify({ row_numbers: rowNumbers, col_numbers: colNumbers })
  ).run();

  return c.json({ 
    success: true, 
    row_numbers: rowNumbers, 
    col_numbers: colNumbers 
  });
});

// Update quarter score (admin only)
app.post("/api/leagues/:id/squares/score", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = parseInt(c.req.param("id"));
  const db = c.env.DB;

  // Check admin
  const member = await db.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!member || !["owner", "admin"].includes(member.role as string)) {
    return c.json({ error: "Only owners/admins can update scores" }, 403);
  }

  const body = await c.req.json();
  const { quarter, home_score, away_score } = body;

  // Get grid
  const grid = await db.prepare(`
    SELECT * FROM squares_grids WHERE league_id = ?
  `).bind(leagueId).first();

  if (!grid) {
    return c.json({ error: "Grid not found" }, 404);
  }

  if (!grid.is_numbers_revealed) {
    return c.json({ error: "Numbers must be revealed before scoring" }, 400);
  }

  const rowNumbers = JSON.parse(grid.row_numbers as string);
  const colNumbers = JSON.parse(grid.col_numbers as string);

  // Find winning square based on last digit of scores
  const homeLastDigit = home_score % 10;
  const awayLastDigit = away_score % 10;

  // Find which row has homeLastDigit and which col has awayLastDigit
  const winningRow = rowNumbers.indexOf(homeLastDigit);
  const winningCol = colNumbers.indexOf(awayLastDigit);

  // Get winning square
  const winningSquare = await db.prepare(`
    SELECT * FROM squares WHERE grid_id = ? AND row_num = ? AND col_num = ?
  `).bind(grid.id, winningRow, winningCol).first();

  // Update score record
  await db.prepare(`
    UPDATE squares_scores 
    SET home_score = ?, away_score = ?, winning_square_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE grid_id = ? AND quarter = ?
  `).bind(home_score, away_score, winningSquare?.id || null, grid.id, quarter).run();

  // Mark winning square
  if (winningSquare) {
    const winnerCol = quarter === "Final" ? "is_final_winner" : `is_${quarter.toLowerCase()}_winner`;
    await db.prepare(`
      UPDATE squares SET ${winnerCol} = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(winningSquare.id).run();
  }

  // Log event
  await db.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    "squares_score_updated",
    leagueId,
    user.id,
    user.id,
    "squares_grid",
    grid.id,
    JSON.stringify({ quarter, home_score, away_score, winning_square_id: winningSquare?.id })
  ).run();

  return c.json({ 
    success: true, 
    winning_square: winningSquare ? {
      row: winningRow,
      col: winningCol,
      owner_id: winningSquare.owner_id,
    } : null
  });
});

// ============ Push Notification Routes ============

// Save a push subscription
app.post("/api/push/subscribe", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: "Invalid subscription data" }, 400);
  }

  const userAgent = c.req.header("user-agent") || "";

  // Upsert subscription (update if endpoint exists, insert if not)
  const existing = await c.env.DB.prepare(`
    SELECT id FROM push_subscriptions WHERE endpoint = ?
  `).bind(endpoint).first();

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE push_subscriptions 
      SET user_id = ?, keys_p256dh = ?, keys_auth = ?, user_agent = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(user.id, keys.p256dh, keys.auth, userAgent, existing.id).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).bind(user.id, endpoint, keys.p256dh, keys.auth, userAgent).run();
  }

  // Update user preferences to enable push
  await c.env.DB.prepare(`
    UPDATE users SET notification_prefs_json = json_set(
      COALESCE(notification_prefs_json, '{}'), 
      '$.channelPush', 
      json('true')
    ), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(user.id).run();

  // Log the subscription
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('push_subscribed', ?, ?, 'push_subscription', ?)
  `).bind(user.id, user.id, JSON.stringify({ userAgent })).run();

  return c.json({ success: true, message: "Push subscription saved" });
});

// Remove a push subscription
app.delete("/api/push/subscribe", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return c.json({ error: "Endpoint required" }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE push_subscriptions SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE endpoint = ? AND user_id = ?
  `).bind(endpoint, user.id).run();

  // Log the unsubscription
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('push_unsubscribed', ?, ?, 'push_subscription', ?)
  `).bind(user.id, user.id, JSON.stringify({ endpoint })).run();

  return c.json({ success: true, message: "Push subscription removed" });
});

// Get user's push subscriptions
app.get("/api/push/subscriptions", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { results } = await c.env.DB.prepare(`
    SELECT id, endpoint, user_agent, is_active, created_at, updated_at
    FROM push_subscriptions
    WHERE user_id = ? AND is_active = 1
  `).bind(user.id).all();

  return c.json(results);
});

// Schedule deadline notifications for leagues
app.post("/api/notifications/schedule-deadlines", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get user's notification preferences
  const userPrefs = await c.env.DB.prepare(`
    SELECT notification_reminders, notification_prefs_json FROM users WHERE id = ?
  `).bind(user.id).first<{ notification_reminders: number; notification_prefs_json: string }>();

  if (!userPrefs?.notification_reminders) {
    return c.json({ scheduled: 0, message: "Pick reminders disabled" });
  }

  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(userPrefs.notification_prefs_json || "{}");
  } catch {}

  const reminderTiming = (prefs.pickReminderTiming || "2h") as "1h" | "2h" | "6h" | "24h";
  const timingMap: Record<string, number> = { "1h": 1, "2h": 2, "6h": 6, "24h": 24 };
  const reminderHours = timingMap[reminderTiming] || 2;
  const deadlineAlerts = prefs.deadlineAlerts !== false;

  // Get user's leagues
  const { results: leagues } = await c.env.DB.prepare(`
    SELECT l.id, l.name, l.sport_key, l.format_key
    FROM leagues l
    INNER JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND l.is_active = 1
  `).bind(user.id).all();

  let scheduled = 0;
  const now = new Date();

  for (const league of leagues) {
    // Get upcoming events for this league's sport
    const { results: events } = await c.env.DB.prepare(`
      SELECT DISTINCT period_id, MIN(start_at) as first_game_start
      FROM events
      WHERE sport_key = ? AND status = 'scheduled' AND start_at > ?
      GROUP BY period_id
      ORDER BY first_game_start ASC
      LIMIT 2
    `).bind(league.sport_key, now.toISOString()).all();

    for (const event of events) {
      const gameStart = new Date(event.first_game_start as string);
      
      // Check if user has picks for this period
      const existingPicks = await c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM picks 
        WHERE user_id = ? AND league_id = ? AND period_id = ?
      `).bind(user.id, league.id, event.period_id).first<{ count: number }>();

      // Only schedule if no picks submitted yet
      if (!existingPicks || existingPicks.count === 0) {
        // Schedule reminder notification
        const reminderTime = new Date(gameStart.getTime() - reminderHours * 60 * 60 * 1000);
        
        if (reminderTime > now) {
          // Check if notification already scheduled
          const existingNotif = await c.env.DB.prepare(`
            SELECT id FROM scheduled_notifications 
            WHERE user_id = ? AND league_id = ? AND notification_type = 'pick_reminder'
            AND scheduled_for = ? AND status = 'pending'
          `).bind(user.id, league.id, reminderTime.toISOString()).first();

          if (!existingNotif) {
            await c.env.DB.prepare(`
              INSERT INTO scheduled_notifications (user_id, league_id, notification_type, title, body, url, scheduled_for)
              VALUES (?, ?, 'pick_reminder', ?, ?, ?, ?)
            `).bind(
              user.id,
              league.id,
              `⏰ Pick Reminder: ${league.name}`,
              `${event.period_id} picks lock in ${reminderHours} hour${reminderHours > 1 ? 's' : ''}! Don't miss the deadline.`,
              `/leagues/${league.id}/picks?period=${event.period_id}`,
              reminderTime.toISOString()
            ).run();
            scheduled++;
          }
        }

        // Schedule 15-min deadline alert if enabled
        if (deadlineAlerts) {
          const deadlineTime = new Date(gameStart.getTime() - 15 * 60 * 1000);
          
          if (deadlineTime > now) {
            const existingDeadline = await c.env.DB.prepare(`
              SELECT id FROM scheduled_notifications 
              WHERE user_id = ? AND league_id = ? AND notification_type = 'deadline_alert'
              AND scheduled_for = ? AND status = 'pending'
            `).bind(user.id, league.id, deadlineTime.toISOString()).first();

            if (!existingDeadline) {
              await c.env.DB.prepare(`
                INSERT INTO scheduled_notifications (user_id, league_id, notification_type, title, body, url, scheduled_for)
                VALUES (?, ?, 'deadline_alert', ?, ?, ?, ?)
              `).bind(
                user.id,
                league.id,
                `🚨 DEADLINE: ${league.name}`,
                `${event.period_id} picks lock in 15 minutes! Submit now!`,
                `/leagues/${league.id}/picks?period=${event.period_id}`,
                deadlineTime.toISOString()
              ).run();
              scheduled++;
            }
          }
        }
      }
    }
  }

  return c.json({ scheduled, message: `Scheduled ${scheduled} notifications` });
});

// Get pending notifications (for processing)
app.get("/api/notifications/pending", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date().toISOString();
  
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM scheduled_notifications 
    WHERE user_id = ? AND status = 'pending' AND scheduled_for <= ?
    ORDER BY scheduled_for ASC
    LIMIT 10
  `).bind(user.id, now).all();

  return c.json(results);
});

// Send a test push notification
app.post("/api/notifications/test", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get user's push subscriptions
  const { results: subscriptions } = await c.env.DB.prepare(`
    SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions
    WHERE user_id = ? AND is_active = 1
  `).bind(user.id).all();

  if (subscriptions.length === 0) {
    return c.json({ error: "No push subscriptions found. Enable push notifications first." }, 400);
  }

  // In a production app, you would use web-push library here
  // For now, we return the notification payload that would be sent
  const notification = {
    title: "🏈 POOLVAULT Test",
    body: "Push notifications are working! You'll receive reminders before pick deadlines.",
    url: "/settings",
    icon: "https://019c35cd-bc59-7336-8464-048ca4acc6ad.mochausercontent.com/icons-icon-192x192.png",
    badge: "https://019c35cd-bc59-7336-8464-048ca4acc6ad.mochausercontent.com/icons-icon-72x72.png",
  };

  // Log the test
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('push_test_sent', ?, ?, 'notification', ?)
  `).bind(user.id, user.id, JSON.stringify(notification)).run();

  return c.json({ 
    success: true, 
    message: "Test notification queued",
    subscriptionCount: subscriptions.length,
    notification,
  });
});

// Mark notification as sent
app.patch("/api/notifications/:id/sent", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const notificationId = c.req.param("id");
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE scheduled_notifications 
    SET status = 'sent', sent_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(now, notificationId, user.id).run();

  return c.json({ success: true });
});

// ============ AI Personas Routes ============

import OpenAI from "openai";
import { AI_PERSONAS, formatLeagueContext, type PersonaKey } from "../shared/ai-personas";
import { thresholdsRouter } from "./routes/thresholds";
import { gamesRouter } from "./routes/games";
import { initProviders } from "./services/providers";
import { oddsRouter } from "./routes/odds";
import { trackerPicksRouter } from "./routes/tracker-picks";
import { watchlistRouter } from "./routes/watchlist";
import favoritesRouter from "./routes/favorites";
import { alertsRouter } from "./routes/alerts";
import { pushRouter } from "./routes/push";
import { adminRouter } from "./routes/admin";
import { poolAdminRouter } from "./routes/pool-admin";
import { poolMarketplaceRouter } from "./routes/pool-marketplace";
import { receiptsRouter } from "./routes/receipts";
import { aiRouter } from "./routes/ai";
import { aiPriorityRouter } from "./routes/ai-priority";
import { freshnessRoutes } from "./routes/data-freshness";
import { coachAlertsRouter } from "./routes/coach-alerts";
import { liveWatcherRouter } from "./routes/live-watcher";
import liveWatcherStatusRoutes from "./routes/live-watcher-status";
import { coachMemoryRoutes } from "./routes/coach-memory";
import gzSubscriptionRoutes from "./routes/gz-subscription";
import { customAlertRulesRouter } from "./routes/custom-alert-rules";
import { favoriteSportsRouter } from "./routes/favorite-sports";
import { notificationSettingsRouter } from "./routes/notification-settings";
import { upgradeTrackingRouter } from "./routes/upgrade-tracking";
import referralsRouter from "./routes/referrals";
import leaderboardRouter from "./routes/leaderboard";
import { featureFlagsRouter } from "./routes/feature-flags";
import { pageDataRouter } from "./routes/page-data";
import { runPageDataWarmCycle } from "./services/pageData/precompute";
import liveSweatRouter from "./routes/live-sweat";
import liveImpactRouter from "./routes/live-impact";
import { weeklyRecapRouter } from "./routes/weekly-recap";
import { sportsRouter } from "./routes/sports";

// Chat with an AI persona
app.post("/api/ai/chat", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { persona, message, leagueId, conversationHistory = [] } = body;

  if (!persona || !AI_PERSONAS[persona as PersonaKey]) {
    return c.json({ error: "Invalid persona" }, 400);
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return c.json({ error: "Message is required" }, 400);
  }

  const personaConfig = AI_PERSONAS[persona as PersonaKey];
  
  // Get league context if provided
  let leagueContext = "";
  if (leagueId) {
    const league = await c.env.DB.prepare(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
      FROM leagues l
      WHERE l.id = ?
    `).bind(leagueId).first();
    
    if (league) {
      leagueContext = formatLeagueContext(league as any);
    }
  }

  // Build the messages array
  const systemMessage = personaConfig.systemPrompt + (leagueContext ? `\n${leagueContext}` : "");
  
  // Build conversation history (limit to last 10 messages to manage tokens)
  const historyMessages = conversationHistory.slice(-10).map((msg: Record<string, unknown>) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  try {
    // Check if API key is configured
    const apiKey = c.env?.OPENAI_API_KEY as string | undefined;
    if (!apiKey || apiKey.trim() === '') {
      // Fallback to canned responses when no API key
      const fallbackResponse = getFallbackResponse(persona as PersonaKey, message);
      
      // Log the interaction
      await c.env.DB.prepare(`
        INSERT INTO ai_event_log (persona, user_id, league_id, request_text, response_text, sources_used, flags)
        VALUES (?, ?, ?, ?, ?, 'fallback', 'no_api_key')
      `).bind(persona, user.id, leagueId || null, message, fallbackResponse).run();

      return c.json({
        response: fallbackResponse,
        persona,
        isFallback: true,
      });
    }

    const client = new OpenAI({
      apiKey: apiKey,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        ...historyMessages,
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const assistantResponse = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";

    // Log the interaction
    await c.env.DB.prepare(`
      INSERT INTO ai_event_log (persona, user_id, league_id, request_text, response_text, sources_used)
      VALUES (?, ?, ?, ?, ?, 'openai')
    `).bind(persona, user.id, leagueId || null, message, assistantResponse).run();

    return c.json({
      response: assistantResponse,
      persona,
      isFallback: false,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    
    // Fallback on error
    const fallbackResponse = getFallbackResponse(persona as PersonaKey, message);
    
    await c.env.DB.prepare(`
      INSERT INTO ai_event_log (persona, user_id, league_id, request_text, response_text, sources_used, flags)
      VALUES (?, ?, ?, ?, ?, 'fallback', 'api_error')
    `).bind(persona, user.id, leagueId || null, message, fallbackResponse).run();

    return c.json({
      response: fallbackResponse,
      persona,
      isFallback: true,
    });
  }
});

// Get AI conversation history for a user
app.get("/api/ai/history", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const persona = c.req.query("persona");
  const limit = parseInt(c.req.query("limit") || "20");

  let query = `
    SELECT * FROM ai_event_log 
    WHERE user_id = ?
  `;
  const params: any[] = [user.id];

  if (persona) {
    query += ` AND persona = ?`;
    params.push(persona);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json(results);
});

// Helper function for fallback responses when API is unavailable
function getFallbackResponse(persona: PersonaKey, message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (persona === "billy") {
    // Billy - Rules Coach fallback responses
    if (lowerMessage.includes("confidence")) {
      return "Great question about Confidence pools! 🏈 In a Confidence pool, you assign point values to each of your picks based on how confident you are. If you have 10 games, you'd assign points 1-10 to each pick. If your pick is correct, you earn those points! The strategy is deciding whether to put your highest points on the \"sure thing\" or spread the risk. It's all about risk management!";
    }
    if (lowerMessage.includes("survivor") || lowerMessage.includes("eliminator")) {
      return "Survivor pools are all about staying alive! 🎯 Each week, you pick ONE team to win. If they win, you advance. If they lose, you're eliminated. The catch? You can't pick the same team twice all season! So save your powerhouse teams for when you really need them. It's a marathon, not a sprint!";
    }
    if (lowerMessage.includes("pick") && (lowerMessage.includes("lock") || lowerMessage.includes("deadline"))) {
      return "Picks typically lock at game time! ⏰ Once a game starts, you can't change your pick for that game. Make sure to get your picks in before kickoff. Some leagues set a single deadline for all picks (like Thursday night for NFL), while others lock picks individually as each game starts. Check your league settings!";
    }
    if (lowerMessage.includes("squares") || lowerMessage.includes("grid")) {
      return "Squares is a fun grid-based pool! 🔢 You pick squares on a 10x10 grid, and after the pool fills up, random numbers (0-9) are assigned to each row and column. Winners are determined by the last digit of each team's score at the end of each quarter and the final. It's mostly luck, which makes it perfect for casual fans!";
    }
    if (lowerMessage.includes("bracket")) {
      return "Bracket pools follow tournament format! 🏆 You predict the winner of each game throughout the tournament. Points typically increase each round - getting the Final Four right is worth more than Round 1. Some leagues use upset bonuses too. My tip: balance chalk picks with a few calculated upsets!";
    }
    return "Hey there! I'm Billy, your rules coach. 🏈 I can help explain how Pick'em, Confidence, Survivor, Bracket, and Squares pools work. I can also share strategy tips and explain scoring. What would you like to know? Just ask me about any pool format or rule!";
  }
  
  // Big G - Admin Helper fallback responses
  if (lowerMessage.includes("payment") || lowerMessage.includes("fee") || lowerMessage.includes("money")) {
    return "Payment management is crucial for a well-run pool. 💼 Here's my recommendation: Set clear payment deadlines before the season starts, use the payment tracking feature to mark who's paid, and consider requiring payment before allowing picks. This prevents awkward situations later. The audit log tracks all payment verifications for transparency.";
  }
  if (lowerMessage.includes("dispute") || lowerMessage.includes("argument") || lowerMessage.includes("conflict")) {
    return "Disputes happen in every pool - here's how to handle them professionally. 📋 First, check the audit log for the exact sequence of events with timestamps. The log is append-only, so it's your source of truth. Review your league rules, apply them consistently, and document your decision. If rules don't cover the situation, err on the side of fairness and update rules for next season.";
  }
  if (lowerMessage.includes("late") && (lowerMessage.includes("join") || lowerMessage.includes("member"))) {
    return "Mid-season joins can be tricky. 📊 My recommendation: If it's early in the season, allow joins but they start with 0 points for missed weeks. For Survivor pools, late joiners might start with a 'life' already used. Document your policy clearly. Some commissioners prorate entry fees for late joins - whatever you decide, apply it consistently.";
  }
  if (lowerMessage.includes("audit") || lowerMessage.includes("log") || lowerMessage.includes("history")) {
    return "The audit log is your best friend for fair league management! 📜 It records every action: picks submitted, payments verified, member changes, and rule modifications. All entries are timestamped and append-only - nothing can be deleted. Use it to verify when picks were made, resolve disputes, and demonstrate transparency to your members.";
  }
  if (lowerMessage.includes("member") || lowerMessage.includes("size") || lowerMessage.includes("how many")) {
    return "Pool size affects the experience significantly. 👥 For Confidence pools, 8-20 members is ideal - enough competition but manageable. Survivor pools work great with 20-100 people. Squares need exactly 100 squares filled (can have multiple per person). Brackets can scale to any size. Consider your prize structure when setting member limits.";
  }
  return "I'm Big G, your admin helper. 👔 I can advise on league management best practices: handling payments, resolving disputes, member management, using the audit log, and optimizing your pool setup. Remember, I provide recommendations only - all actions must be taken through the proper interfaces. How can I help you run a better pool?";
}

// ============ Pool History — Week-by-Week Summary ============

app.get("/api/leagues/:id/pool-history/weeks", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  const membership = await c.env.DB.prepare(
    `SELECT role FROM league_members WHERE league_id = ? AND user_id = ? AND invite_status = 'joined'`
  ).bind(leagueId, user.id).first();
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const league = await c.env.DB.prepare(
    `SELECT id, name, sport_key, format_key, rules_json FROM leagues WHERE id = ?`
  ).bind(leagueId).first<{ id: number; name: string; sport_key: string; format_key: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "League not found" }, 404);

  const { results: periodRows } = await c.env.DB.prepare(`
    SELECT DISTINCT period_id FROM picks WHERE league_id = ? ORDER BY period_id ASC
  `).bind(leagueId).all<{ period_id: string }>();

  const periodIds = (periodRows || []).map((r) => r.period_id);

  const weeks: Array<{
    periodId: string;
    totalPicks: number;
    correctPicks: number;
    averageAccuracy: number;
    participantCount: number;
    topScorer: { name: string; points: number } | null;
    mostPopularPick: { value: string; percentage: number } | null;
    biggestUpset: string | null;
    leaderboardSnapshot: Array<{ rank: number; name: string; points: number; correct: number; total: number }>;
    yourSummary: { correct: number; total: number; points: number; rank: number | null } | null;
  }> = [];

  for (const periodId of periodIds) {
    const { results: pickStats } = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_picks,
        SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
        COUNT(DISTINCT p.user_id) as participant_count
      FROM picks p
      LEFT JOIN events e ON e.id = p.event_id
      WHERE p.league_id = ? AND p.period_id = ?
        AND (UPPER(e.status) IN ('FINAL','FINAL_OT','COMPLETED') OR e.status IS NULL)
    `).bind(leagueId, periodId).all<{ total_picks: number; correct_picks: number; participant_count: number }>();

    const stats = pickStats?.[0] || { total_picks: 0, correct_picks: 0, participant_count: 0 };
    const totalPicks = Number(stats.total_picks || 0);
    const correctPicks = Number(stats.correct_picks || 0);
    const participantCount = Number(stats.participant_count || 0);
    const averageAccuracy = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 1000) / 10 : 0;

    const { results: popularPick } = await c.env.DB.prepare(`
      SELECT pick_value, COUNT(*) as cnt FROM picks
      WHERE league_id = ? AND period_id = ?
      GROUP BY pick_value ORDER BY cnt DESC LIMIT 1
    `).bind(leagueId, periodId).all<{ pick_value: string; cnt: number }>();
    const mostPopularPick = popularPick?.[0]
      ? { value: popularPick[0].pick_value, percentage: totalPicks > 0 ? Math.round((Number(popularPick[0].cnt) / totalPicks) * 1000) / 10 : 0 }
      : null;

    const { results: leaderboardRows } = await c.env.DB.prepare(`
      SELECT sh.rank, COALESCE(u.display_name, u.email) as name, sh.total_points, sh.correct_picks, sh.total_picks
      FROM standings_history sh
      LEFT JOIN users u ON u.id = sh.user_id
      WHERE sh.league_id = ? AND sh.period_id = ?
      ORDER BY sh.rank ASC LIMIT 10
    `).bind(leagueId, periodId).all<{ rank: number; name: string; total_points: number; correct_picks: number; total_picks: number }>();

    const leaderboardSnapshot = (leaderboardRows || []).map((r) => ({
      rank: Number(r.rank), name: r.name || "Unknown", points: Number(r.total_points || 0),
      correct: Number(r.correct_picks || 0), total: Number(r.total_picks || 0),
    }));

    const topScorer = leaderboardSnapshot[0]
      ? { name: leaderboardSnapshot[0].name, points: leaderboardSnapshot[0].points }
      : null;

    const upsetRow = await c.env.DB.prepare(`
      SELECT e.winner, COUNT(*) as total, SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as winner_count
      FROM picks p INNER JOIN events e ON e.id = p.event_id
      WHERE p.league_id = ? AND p.period_id = ?
        AND (UPPER(e.status) = 'FINAL' OR UPPER(e.status) = 'FINAL_OT') AND e.winner IS NOT NULL
      GROUP BY p.event_id, e.winner HAVING total > 0
      ORDER BY (1.0 - CAST(SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) DESC
      LIMIT 1
    `).bind(leagueId, periodId).first<{ winner: string; total: number; winner_count: number }>();
    let biggestUpset: string | null = null;
    if (upsetRow && upsetRow.total > 0) {
      const againstPct = Math.round((1 - Number(upsetRow.winner_count) / Number(upsetRow.total)) * 100);
      if (againstPct > 50) biggestUpset = `${upsetRow.winner} (${againstPct}% picked against)`;
    }

    const yourRow = await c.env.DB.prepare(`
      SELECT sh.rank, sh.total_points, sh.correct_picks, sh.total_picks
      FROM standings_history sh WHERE sh.league_id = ? AND sh.period_id = ? AND sh.user_id = ?
      LIMIT 1
    `).bind(leagueId, periodId, user.id).first<{ rank: number; total_points: number; correct_picks: number; total_picks: number }>();
    const yourSummary = yourRow
      ? { correct: Number(yourRow.correct_picks || 0), total: Number(yourRow.total_picks || 0), points: Number(yourRow.total_points || 0), rank: Number(yourRow.rank || 0) }
      : null;

    weeks.push({ periodId, totalPicks, correctPicks, averageAccuracy, participantCount, topScorer, mostPopularPick, biggestUpset, leaderboardSnapshot, yourSummary });
  }

  return c.json({
    league: { id: league.id, name: league.name, sport_key: league.sport_key, format_key: league.format_key },
    weeks,
    totalPeriods: weeks.length,
  });
});

// ============ Standings History Routes ============

// Get standings history for a league (for charts)
app.get("/api/leagues/:id/standings/history", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league info
  const league = await c.env.DB.prepare(`
    SELECT id, name, sport_key, format_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ id: number; name: string; sport_key: string; format_key: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  // Get all history records for this league
  const { results: history } = await c.env.DB.prepare(`
    SELECT 
      sh.period_id, sh.user_id, sh.rank, sh.total_points, sh.correct_picks, sh.total_picks, sh.win_percentage,
      COALESCE(u.display_name, u.email) as user_name,
      u.avatar_url
    FROM standings_history sh
    LEFT JOIN users u ON sh.user_id = u.id
    WHERE sh.league_id = ?
    ORDER BY sh.period_id ASC, sh.rank ASC
  `).bind(leagueId).all();

  // Group by period
  const periodMap: Record<string, { period_id: string; standings: Record<string, unknown>[] }> = {};
  
  for (const record of history) {
    const periodId = record.period_id as string;
    if (!periodMap[periodId]) {
      periodMap[periodId] = { period_id: periodId, standings: [] };
    }
    periodMap[periodId].standings.push({
      user_id: record.user_id,
      user_name: record.user_name || `User ${record.user_id}`,
      avatar_url: record.avatar_url,
      rank: record.rank,
      total_points: record.total_points,
      correct_picks: record.correct_picks,
      total_picks: record.total_picks,
      win_percentage: record.win_percentage,
      is_current_user: record.user_id === user.id,
    });
  }

  const periods = Object.values(periodMap).sort((a, b) => 
    a.period_id.localeCompare(b.period_id, undefined, { numeric: true })
  );

  // Build rank progression per user
  const users: Record<number, { user_id: number; user_name: string; avatar_url: string | null; data: { period: string; rank: number; points: number }[] }> = {};
  
  for (const period of periods) {
    for (const standing of period.standings) {
      const odUserId = standing.user_id as number;
      if (!users[odUserId]) {
        users[odUserId] = {
          user_id: odUserId,
          user_name: standing.user_name as string,
          avatar_url: standing.avatar_url as string | null,
          data: [],
        };
      }
      users[odUserId].data.push({
        period: period.period_id,
        rank: standing.rank as number,
        points: standing.total_points as number,
      });
    }
  }

  return c.json({
    league: {
      id: league.id,
      name: league.name,
      sport_key: league.sport_key,
      format_key: league.format_key,
    },
    periods,
    users: Object.values(users),
    current_user_id: user.id,
  });
});

// Save a standings snapshot (typically called after scoring)
app.post("/api/leagues/:id/standings/snapshot", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const { period_id } = await c.req.json();

  if (!period_id) {
    return c.json({ error: "Period ID required" }, 400);
  }

  // Check admin access
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Get current standings
  const league = await c.env.DB.prepare(`
    SELECT name, format_key, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; format_key: string; rules_json: string }>();

  if (!league) {
    return c.json({ error: "League not found" }, 404);
  }

  const rules = JSON.parse(league.rules_json || "{}");
  const pointsPerWin = rules.pointsPerWin || 1;
  const weeklyRankRecapEnabled = rules.weeklyRankRecapEnabled !== false;
  const weeklyRankRecapPushEnabled = rules.weeklyRankRecapPushEnabled !== false;

  // Get previous ranks (latest snapshot prior to this period) so we can notify members of movement.
  const { results: previousRankRows } = await c.env.DB.prepare(`
    SELECT user_id, rank
    FROM (
      SELECT
        user_id,
        rank,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY snapshot_at DESC, id DESC) as rn
      FROM standings_history
      WHERE league_id = ? AND period_id != ?
    ) ranked
    WHERE rn = 1
  `).bind(leagueId, period_id).all();
  const previousRankByUser = new Map<string, number>();
  for (const row of previousRankRows || []) {
    const userId = String((row as Record<string, unknown>).user_id ?? "");
    const rank = Number((row as Record<string, unknown>).rank ?? 0);
    if (userId && Number.isFinite(rank) && rank > 0) {
      previousRankByUser.set(userId, rank);
    }
  }

  // Get all members
  const { results: members } = await c.env.DB.prepare(`
    SELECT lm.user_id FROM league_members lm WHERE lm.league_id = ?
  `).bind(leagueId).all();

  // Calculate cumulative standings up to this period
  const memberStats: Record<number, { total_points: number; correct_picks: number; total_picks: number }> = {};
  
  for (const member of members) {
    memberStats[member.user_id as number] = { total_points: 0, correct_picks: 0, total_picks: 0 };
  }

  // Get all picks with results up to and including this period
  const { gradePick: gradePickSnapshot } = await import("./services/scoringEngine");
  const { deserializePoolRuleConfig: deserializeSnapshot } = await import("../shared/poolRuleConfig");
  const snapshotConfig = deserializeSnapshot(league.format_key, league.rules_json);

  const { results: allPicks } = await c.env.DB.prepare(`
    SELECT 
      p.id as pick_id, p.user_id, p.entry_id, p.pick_value, p.confidence_rank, p.period_id,
      p.is_correct, p.points_earned,
      e.winner, e.status as event_status, e.home_team, e.away_team,
      e.home_score, e.away_score, e.start_at, e.spread
    FROM picks p
    LEFT JOIN events e ON p.event_id = e.id
    WHERE p.league_id = ? AND UPPER(e.status) IN ('FINAL','COMPLETED','FINAL_OT')
    AND p.period_id <= ?
  `).bind(leagueId, period_id).all();

  for (const pick of allPicks) {
    const userId = pick.user_id as number;
    if (!memberStats[userId]) continue;

    memberStats[userId].total_picks++;

    let isCorrect: boolean;
    let pts: number;

    if (pick.is_correct !== null && pick.is_correct !== undefined) {
      isCorrect = (pick.is_correct as number) === 1;
      pts = (pick.points_earned as number) || 0;
    } else {
      const gr = gradePickSnapshot({
        pick_id: pick.pick_id as number, entry_id: (pick.entry_id as number) || 0,
        user_id: String(userId), event_id: pick.pick_id as number,
        pick_value: pick.pick_value as string,
        confidence_rank: (pick.confidence_rank as number | null) ?? null,
        event_status: (pick.event_status as string) || "FINAL",
        event_started: true,
        home_team: (pick.home_team as string) || "", away_team: (pick.away_team as string) || "",
        home_score: (pick.home_score as number | null) ?? null, away_score: (pick.away_score as number | null) ?? null,
        winner: (pick.winner as string | null) ?? null, spread: (pick.spread as number | null) ?? null,
      }, snapshotConfig, league.format_key);
      isCorrect = gr.result === "win";
      pts = gr.points;
    }

    if (isCorrect) {
      memberStats[userId].correct_picks++;
      memberStats[userId].total_points += pts;
    }
  }

  // Convert to sorted array for ranking
  const standings = Object.entries(memberStats)
    .map(([userId, stats]) => ({
      user_id: parseInt(userId),
      ...stats,
      win_percentage: stats.total_picks > 0 ? Math.round((stats.correct_picks / stats.total_picks) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return b.win_percentage - a.win_percentage;
    });

  // Delete existing snapshot for this period
  await c.env.DB.prepare(`
    DELETE FROM standings_history WHERE league_id = ? AND period_id = ?
  `).bind(leagueId, period_id).run();

  // Insert new snapshot
  let inserted = 0;
  const standingsForNotifications: Array<{
    user_id: string;
    rank: number;
    previous_rank: number | null;
    rank_delta: number;
    total_points: number;
    win_percentage: number;
  }> = [];
  for (let i = 0; i < standings.length; i++) {
    const standing = standings[i];
    const userId = String(standing.user_id);
    const previousRank = previousRankByUser.get(userId) ?? null;
    const currentRank = i + 1;
    const rankDelta = previousRank ? previousRank - currentRank : 0;
    await c.env.DB.prepare(`
      INSERT INTO standings_history (league_id, user_id, period_id, rank, total_points, correct_picks, total_picks, win_percentage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      leagueId,
      standing.user_id,
      period_id,
      i + 1,
      standing.total_points,
      standing.correct_picks,
      standing.total_picks,
      standing.win_percentage
    ).run();
    inserted++;
    standingsForNotifications.push({
      user_id: userId,
      rank: currentRank,
      previous_rank: previousRank,
      rank_delta: rankDelta,
      total_points: standing.total_points,
      win_percentage: standing.win_percentage,
    });
  }

  // Log the snapshot
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, payload_json)
    VALUES ('standings_snapshot_saved', ?, ?, ?, 'standings_history', ?)
  `).bind(leagueId, user.id, user.id, JSON.stringify({ period_id, members_count: inserted })).run();

  // Build per-user preference map for weekly/pool-activity style recap notifications.
  const { results: memberPrefRows } = await c.env.DB.prepare(`
    SELECT
      lm.user_id,
      u.notification_results,
      u.notification_prefs_json,
      (
        SELECT us.setting_value
        FROM user_settings us
        WHERE CAST(us.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
          AND us.setting_key = 'notification_preferences'
        ORDER BY us.updated_at DESC
        LIMIT 1
      ) as notification_settings_json,
      COALESCE(ap.channel_push, 0) as channel_push,
      EXISTS(
        SELECT 1
        FROM push_subscriptions ps
        WHERE CAST(ps.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
          AND ps.is_active = 1
      ) as has_push_subscription
    FROM league_members lm
    LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(lm.user_id AS TEXT)
    LEFT JOIN alert_preferences ap ON CAST(ap.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
    WHERE lm.league_id = ? AND lm.invite_status = 'joined'
  `).bind(leagueId).all();
  const notifyEligibleUsers = new Set<string>();
  const pushEligibleUsers = new Set<string>();
  for (const row of memberPrefRows || []) {
    const rec = row as Record<string, unknown>;
    const userId = String(rec.user_id ?? "");
    if (!userId) continue;
    const weeklyResultsEnabled = Number(rec.notification_results ?? 0) === 1;
    let poolActivityEnabled = false;
    let weeklyRankRecapEnabled = false;
    if (typeof rec.notification_settings_json === "string" && rec.notification_settings_json.trim()) {
      try {
        const parsed = JSON.parse(rec.notification_settings_json) as Record<string, unknown>;
        poolActivityEnabled = parsed.poolActivity === true;
        weeklyRankRecapEnabled = parsed.weeklyRankRecap === true;
      } catch {
        poolActivityEnabled = false;
        weeklyRankRecapEnabled = false;
      }
    }
    if (!poolActivityEnabled && typeof rec.notification_prefs_json === "string" && rec.notification_prefs_json.trim()) {
      try {
        const parsed = JSON.parse(rec.notification_prefs_json) as Record<string, unknown>;
        poolActivityEnabled = parsed.poolActivity === true;
      } catch {
        poolActivityEnabled = false;
      }
    }
    if (weeklyResultsEnabled || poolActivityEnabled || weeklyRankRecapEnabled) {
      notifyEligibleUsers.add(userId);
    }
    const channelPushEnabled = Number(rec.channel_push ?? 0) === 1;
    const hasPushSubscription = Number(rec.has_push_subscription ?? 0) === 1;
    if (channelPushEnabled && hasPushSubscription) {
      pushEligibleUsers.add(userId);
    }
  }

  // Send in-app "weekly style" standings recap notifications with celebratory tone.
  for (const s of standingsForNotifications) {
    if (!weeklyRankRecapEnabled) continue;
    if (!notifyEligibleUsers.has(s.user_id)) continue;
    const rankSuffix = s.rank % 10 === 1 && s.rank % 100 !== 11
      ? "st"
      : s.rank % 10 === 2 && s.rank % 100 !== 12
      ? "nd"
      : s.rank % 10 === 3 && s.rank % 100 !== 13
      ? "rd"
      : "th";
    const rankLabel = `${s.rank}${rankSuffix}`;
    const movementText =
      s.previous_rank == null
        ? "First standings snapshot is in."
        : s.rank_delta > 0
        ? `You climbed ${s.rank_delta} spot${s.rank_delta === 1 ? "" : "s"} this week.`
        : s.rank_delta < 0
        ? `Tough week - down ${Math.abs(s.rank_delta)} spot${Math.abs(s.rank_delta) === 1 ? "" : "s"}.`
        : "No movement this week, but you're still in it.";

    const title =
      s.rank === 1
        ? "🏆 You're on top of the leaderboard!"
        : s.rank_delta > 0
        ? "📈 Nice climb this week!"
        : s.rank_delta < 0
        ? "💪 Keep pushing - bounce-back week next!"
        : "📊 Weekly pool recap is in";

    const body =
      s.rank === 1
        ? `You finished ${period_id} in 1st place in ${league.name}. ${movementText}`
        : `You finished ${period_id} in ${rankLabel} place (${s.rank}/${inserted}) in ${league.name}. ${movementText}`;

    const standingsUrl = `/leagues/${leagueId}/standings?period=${encodeURIComponent(period_id)}`;
    await createNotification(
      c.env.DB,
      s.user_id,
      "weekly_results",
      title,
      body,
      standingsUrl,
      {
        league_id: Number(leagueId),
        period_id,
        current_rank: s.rank,
        previous_rank: s.previous_rank,
        rank_delta: s.rank_delta,
        total_members: inserted,
        total_points: s.total_points,
        win_percentage: s.win_percentage,
        category: "weekly_standings_recap",
      },
    );

    if (weeklyRankRecapPushEnabled && pushEligibleUsers.has(s.user_id)) {
      const existingPush = await c.env.DB.prepare(`
        SELECT id
        FROM scheduled_notifications
        WHERE user_id = ? AND league_id = ? AND notification_type = 'weekly_results' AND url = ?
          AND status IN ('pending', 'sent')
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(s.user_id, Number(leagueId), standingsUrl).first<{ id: number }>();
      if (!existingPush) {
        await queuePushNotification(
          c.env.DB,
          s.user_id,
          "weekly_results",
          title,
          body,
          standingsUrl,
          Number(leagueId),
        );
      }
    }
  }

  return c.json({ success: true, members_snapshotted: inserted });
});

// ============ League Chat Routes ============

// Get chat messages and members for a league
app.get("/api/leagues/:id/chat", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get league name and chat settings
  const league = await c.env.DB.prepare(`
    SELECT name, is_chat_enabled FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; is_chat_enabled: number | null }>();

  // Check if chat is enabled (default to true if null)
  const isChatEnabled = league?.is_chat_enabled !== 0;

  // Get messages with user info
  const { results: messages } = await c.env.DB.prepare(`
    SELECT 
      m.id, m.user_id, m.content, m.reply_to_id, m.reactions_json, m.is_edited, m.created_at,
      COALESCE(u.display_name, u.email) as user_name,
      u.avatar_url as user_avatar,
      (SELECT content FROM league_messages WHERE id = m.reply_to_id LIMIT 1) as reply_preview
    FROM league_messages m
    LEFT JOIN users u ON m.user_id = CAST(u.id AS TEXT)
    WHERE m.league_id = ? AND m.is_deleted = 0
    ORDER BY m.created_at ASC
    LIMIT ?
  `).bind(leagueId, limit).all();

  // Get members
  const { results: members } = await c.env.DB.prepare(`
    SELECT 
      lm.user_id, 
      COALESCE(u.display_name, u.email) as display_name,
      u.avatar_url,
      lm.role
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = CAST(u.id AS TEXT)
    WHERE lm.league_id = ?
  `).bind(leagueId).all();

  // Parse reactions JSON for each message
  const formattedMessages = messages.map((msg: Record<string, unknown>) => ({
    ...msg,
    reactions: msg.reactions_json ? JSON.parse(msg.reactions_json as string) : {},
    reply_preview: msg.reply_preview ? (msg.reply_preview as string).slice(0, 100) : null,
  }));

  return c.json({
    messages: formattedMessages,
    members,
    league_name: league?.name || "League Chat",
    is_chat_enabled: isChatEnabled,
  });
});

// Send a chat message
app.post("/api/leagues/:id/chat", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const { content, reply_to_id } = await c.req.json();

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Message content is required" }, 400);
  }

  if (content.length > 2000) {
    return c.json({ error: "Message must be 2000 characters or less" }, 400);
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Check if chat is enabled
  const league = await c.env.DB.prepare(`
    SELECT is_chat_enabled FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ is_chat_enabled: number | null }>();

  if (league?.is_chat_enabled === 0) {
    return c.json({ error: "Chat is disabled for this pool" }, 403);
  }

  // Verify reply_to exists if provided
  if (reply_to_id) {
    const replyTarget = await c.env.DB.prepare(`
      SELECT id FROM league_messages WHERE id = ? AND league_id = ? AND is_deleted = 0
    `).bind(reply_to_id, leagueId).first();

    if (!replyTarget) {
      return c.json({ error: "Reply target message not found" }, 404);
    }
  }

  // Insert message
  const result = await c.env.DB.prepare(`
    INSERT INTO league_messages (league_id, user_id, content, reply_to_id)
    VALUES (?, ?, ?, ?)
  `).bind(leagueId, user.id, content.trim(), reply_to_id || null).run();

  // Log the message event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('chat_message_sent', ?, ?, ?, 'league_message', ?, ?)
  `).bind(leagueId, user.id, user.id, result.meta.last_row_id, JSON.stringify({ 
    contentLength: content.length,
    hasReply: !!reply_to_id 
  })).run();

  return c.json({ 
    success: true, 
    id: result.meta.last_row_id,
  });
});

// Add or toggle a reaction on a message
app.post("/api/leagues/:id/chat/:messageId/react", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const messageId = c.req.param("messageId");
  const { emoji } = await c.req.json();

  if (!emoji || typeof emoji !== "string") {
    return c.json({ error: "Emoji is required" }, 400);
  }

  // Allowed emojis
  const allowedEmojis = ["👍", "❤️", "🎉", "🔥", "🏆", "😂", "😮", "😢"];
  if (!allowedEmojis.includes(emoji)) {
    return c.json({ error: "Invalid emoji" }, 400);
  }

  // Check membership
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  // Get message
  const message = await c.env.DB.prepare(`
    SELECT id, reactions_json FROM league_messages WHERE id = ? AND league_id = ? AND is_deleted = 0
  `).bind(messageId, leagueId).first<{ id: number; reactions_json: string | null }>();

  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Parse existing reactions
  const reactions: Record<string, string[]> = message.reactions_json 
    ? JSON.parse(message.reactions_json) 
    : {};

  // Toggle user's reaction
  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }

  const userIndex = reactions[emoji].indexOf(user.id);
  if (userIndex === -1) {
    // Add reaction
    reactions[emoji].push(user.id);
  } else {
    // Remove reaction
    reactions[emoji].splice(userIndex, 1);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  }

  // Update message
  await c.env.DB.prepare(`
    UPDATE league_messages SET reactions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(JSON.stringify(reactions), messageId).run();

  return c.json({ success: true, reactions });
});

// Edit a message (only own messages)
app.patch("/api/leagues/:id/chat/:messageId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const messageId = c.req.param("messageId");
  const { content } = await c.req.json();

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Message content is required" }, 400);
  }

  // Get message and verify ownership
  const message = await c.env.DB.prepare(`
    SELECT id, user_id FROM league_messages WHERE id = ? AND league_id = ? AND is_deleted = 0
  `).bind(messageId, leagueId).first<{ id: number; user_id: string }>();

  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  if (message.user_id !== user.id) {
    return c.json({ error: "Can only edit your own messages" }, 403);
  }

  // Update message
  await c.env.DB.prepare(`
    UPDATE league_messages SET content = ?, is_edited = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(content.trim(), messageId).run();

  return c.json({ success: true });
});

// =====================================================
// DEMO MODE API ROUTES - DO NOT DELETE
// These endpoints are critical for the demo system.
// Always maintain demo functionality when making changes.
// =====================================================

// Get demo settings for current user
app.get("/api/demo/settings", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get user's demo flags
  const userRecord = await c.env.DB.prepare(`
    SELECT is_demo_user, demo_mode_enabled, simulated_subscription, simulated_admin_mode
    FROM users WHERE id = ?
  `).bind(user.id).first();

  // Get demo_settings if exists
  const demoSettings = await c.env.DB.prepare(`
    SELECT auto_seed_on_login, impersonating_user_id, last_seeded_at
    FROM demo_settings WHERE user_id = ?
  `).bind(user.id).first();

  return c.json({
    is_demo_user: true, // All authenticated users have demo access for testing
    demo_mode_enabled: userRecord?.demo_mode_enabled === 1,
    simulated_subscription: userRecord?.simulated_subscription || "free",
    simulated_admin_mode: userRecord?.simulated_admin_mode === 1,
    auto_seed_on_login: demoSettings?.auto_seed_on_login !== 0,
    impersonating_user_id: demoSettings?.impersonating_user_id || null,
    last_seeded_at: demoSettings?.last_seeded_at || null,
  });
});

// Update demo settings
app.patch("/api/demo/settings", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { demo_mode_enabled, simulated_subscription, simulated_admin_mode, auto_seed_on_login, impersonating_user_id } = body;

  // Update user record
  const userUpdates: string[] = [];
  const userValues: (string | number)[] = [];

  if (demo_mode_enabled !== undefined) {
    userUpdates.push("demo_mode_enabled = ?");
    userValues.push(demo_mode_enabled ? 1 : 0);
  }
  if (simulated_subscription !== undefined) {
    userUpdates.push("simulated_subscription = ?");
    userValues.push(simulated_subscription);
  }
  if (simulated_admin_mode !== undefined) {
    userUpdates.push("simulated_admin_mode = ?");
    userValues.push(simulated_admin_mode ? 1 : 0);
  }

  if (userUpdates.length > 0) {
    userUpdates.push("updated_at = CURRENT_TIMESTAMP");
    userValues.push(user.id);
    await c.env.DB.prepare(`
      UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?
    `).bind(...userValues).run();
  }

  // Update or create demo_settings
  if (auto_seed_on_login !== undefined || impersonating_user_id !== undefined) {
    const existingSettings = await c.env.DB.prepare(`
      SELECT id FROM demo_settings WHERE user_id = ?
    `).bind(user.id).first();

    if (existingSettings) {
      const settingsUpdates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
      const settingsValues: (string | number)[] = [];
      
      if (auto_seed_on_login !== undefined) {
        settingsUpdates.push("auto_seed_on_login = ?");
        settingsValues.push(auto_seed_on_login ? 1 : 0);
      }
      if (impersonating_user_id !== undefined) {
        settingsUpdates.push("impersonating_user_id = ?");
        settingsValues.push(impersonating_user_id);
      }
      
      settingsValues.push(user.id);
      await c.env.DB.prepare(`
        UPDATE demo_settings SET ${settingsUpdates.join(", ")} WHERE user_id = ?
      `).bind(...settingsValues).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO demo_settings (user_id, auto_seed_on_login, impersonating_user_id)
        VALUES (?, ?, ?)
      `).bind(user.id, auto_seed_on_login ? 1 : 0, impersonating_user_id || null).run();
    }
  }

  return c.json({ success: true });
});

// Get demo leagues
app.get("/api/demo/leagues", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { results } = await c.env.DB.prepare(`
    SELECT l.*, 
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id AND data_scope = 'DEMO') as member_count
    FROM leagues l
    WHERE l.data_scope = 'DEMO'
    ORDER BY l.format_key, l.name
  `).all();

  // Map to include a simulated "state" based on rules or a pattern
  const leagues = results.map((league: Record<string, unknown>) => {
    // Extract state from league name pattern (e.g., "NFL Pick'em - OPEN")
    const nameParts = (league.name as string).split(" - ");
    const state = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : "open";
    
    return {
      id: league.id,
      name: league.name,
      sport_key: league.sport_key,
      format_key: league.format_key,
      state,
      member_count: league.member_count || 0,
    };
  });

  return c.json({ leagues });
});

// Seed demo universe
app.post("/api/demo/seed", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  // Pool types and states to create
  const poolTypes = ["pickem", "ats", "confidence", "survivor", "bracket", "squares", "props"];
  const states = ["preview", "open", "submitted", "locked", "live", "final"];
  const sports = ["nfl", "nba", "mlb", "nhl"];

  // First, create demo members if they don't exist
  const existingMembers = await db.prepare(`
    SELECT COUNT(*) as count FROM demo_members
  `).first<{ count: number }>();

  if (!existingMembers || existingMembers.count < 50) {
    // Generate 100 demo members with varied profiles
    const names = [
      "Alex Johnson", "Jordan Smith", "Casey Williams", "Morgan Brown", "Taylor Davis",
      "Riley Wilson", "Quinn Anderson", "Avery Thomas", "Peyton Jackson", "Cameron White",
      "Jamie Martin", "Drew Garcia", "Pat Martinez", "Sam Robinson", "Chris Clark",
      "Blake Lewis", "Bailey Lee", "Skyler Walker", "Reese Hall", "Finley Allen",
      "Sage Young", "Hayden King", "Dakota Wright", "Rowan Scott", "Phoenix Green",
      "Charlie Adams", "Emerson Baker", "Jesse Nelson", "Parker Hill", "Kendall Moore",
      "Logan Taylor", "Harper Mitchell", "Addison Perez", "Elliot Roberts", "Rory Turner",
      "Shawn Phillips", "Spencer Campbell", "Tatum Parker", "River Evans", "Aspen Edwards",
      "Marlowe Collins", "Ainsley Stewart", "Sloane Sanchez", "Lennox Morris", "Blair Rogers",
      "Noel Reed", "Sutton Cook", "Milan Morgan", "Ellis Bell", "Shiloh Murphy"
    ];
    
    const tiers = ["top", "top", "mid", "mid", "mid", "mid", "mid", "bottom", "bottom", "bottom"];
    
    for (let i = 0; i < names.length; i++) {
      const tier = tiers[i % tiers.length];
      await db.prepare(`
        INSERT OR IGNORE INTO demo_members (demo_id, display_name, performance_tier)
        VALUES (?, ?, ?)
      `).bind(`demo-${i + 1}`, names[i], tier).run();
    }
  }

  // Get demo members for league population
  const { results: demoMembers } = await db.prepare(`
    SELECT id, demo_id, display_name, performance_tier FROM demo_members LIMIT 100
  `).all();

  let leaguesCreated = 0;

  // Create demo leagues for each pool type × state combination
  for (const poolType of poolTypes) {
    for (const state of states) {
      for (const sport of sports.slice(0, 2)) { // NFL and NBA for each
        const leagueName = `${sport.toUpperCase()} ${poolType.charAt(0).toUpperCase() + poolType.slice(1)} - ${state.toUpperCase()}`;
        
        // Check if this league already exists
        const existing = await db.prepare(`
          SELECT id FROM leagues WHERE name = ? AND data_scope = 'DEMO'
        `).bind(leagueName).first();

        if (existing) continue;

        // Create the league
        const inviteCode = `DEMO${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const entryFee = poolType === "squares" ? 1000 : 2500; // $10 or $25
        
        const result = await db.prepare(`
          INSERT INTO leagues (name, sport_key, format_key, season, rules_json, entry_fee_cents, is_payment_required, invite_code, owner_id, data_scope)
          VALUES (?, ?, ?, '2024-2025', ?, ?, 1, ?, ?, 'DEMO')
        `).bind(
          leagueName,
          sport,
          poolType,
          JSON.stringify({ pointsPerWin: 1, survivorType: "winner" }),
          entryFee,
          inviteCode,
          user.id
        ).run();

        const leagueId = result.meta.last_row_id;

        // Add owner as member
        await db.prepare(`
          INSERT INTO league_members (league_id, user_id, role, is_payment_verified, data_scope)
          VALUES (?, ?, 'owner', 1, 'DEMO')
        `).bind(leagueId, user.id).run();

        // Add demo members (varies by pool size)
        const memberCount = poolType === "survivor" && state === "live" ? 100 : Math.min(20 + Math.floor(Math.random() * 30), demoMembers.length);
        
        for (let i = 0; i < memberCount && i < demoMembers.length; i++) {
          const member = demoMembers[i];
          const isPaid = state !== "preview" || Math.random() > 0.3;
          
          await db.prepare(`
            INSERT INTO league_members (league_id, user_id, role, is_payment_verified, data_scope)
            VALUES (?, ?, 'member', ?, 'DEMO')
          `).bind(leagueId, `demo-user-${member.demo_id}`, isPaid ? 1 : 0).run();
        }

        leaguesCreated++;
      }
    }
  }

  // Update last_seeded_at
  const now = new Date().toISOString();
  const existingSettings = await db.prepare(`
    SELECT id FROM demo_settings WHERE user_id = ?
  `).bind(user.id).first();

  if (existingSettings) {
    await db.prepare(`
      UPDATE demo_settings SET last_seeded_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(now, user.id).run();
  } else {
    await db.prepare(`
      INSERT INTO demo_settings (user_id, last_seeded_at) VALUES (?, ?)
    `).bind(user.id, now).run();
  }

  // Log the seeding
  await db.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json, data_scope)
    VALUES ('demo_universe_seeded', ?, ?, 'demo', ?, 'DEMO')
  `).bind(user.id, user.id, JSON.stringify({ leaguesCreated, membersCount: demoMembers.length })).run();

  return c.json({ 
    success: true, 
    leaguesCreated,
    membersCreated: demoMembers.length,
    message: `Demo universe seeded with ${leaguesCreated} leagues and ${demoMembers.length} demo members`,
  });
});

// Reset demo universe (delete all DEMO scope data)
app.post("/api/demo/reset", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  // Delete all DEMO scope data in reverse dependency order
  await db.prepare(`DELETE FROM standings_history WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM league_messages WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM squares_scores WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM squares WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM squares_grids WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM ai_event_log WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM transaction_ledger WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM event_log WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM receipt_deliveries WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM pick_receipts WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM picks WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM events WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM league_members WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM league_feed WHERE data_scope = 'DEMO'`).run();
  await db.prepare(`DELETE FROM leagues WHERE data_scope = 'DEMO'`).run();

  // Log the reset (in PROD scope so it persists)
  await db.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('demo_universe_reset', ?, ?, 'demo', '{}')
  `).bind(user.id, user.id).run();

  return c.json({ success: true, message: "Demo universe reset complete" });
});

// Simulate week state change
app.post("/api/demo/simulate/week-state", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { league_id, new_state } = await c.req.json();

  if (!league_id || !new_state) {
    return c.json({ error: "League ID and new state required" }, 400);
  }

  // Update league name to reflect state
  const league = await c.env.DB.prepare(`
    SELECT name FROM leagues WHERE id = ? AND data_scope = 'DEMO'
  `).bind(league_id).first<{ name: string }>();

  if (!league) {
    return c.json({ error: "Demo league not found" }, 404);
  }

  // Update the league name with new state
  const baseName = league.name.split(" - ")[0];
  const newName = `${baseName} - ${new_state.toUpperCase()}`;

  await c.env.DB.prepare(`
    UPDATE leagues SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(newName, league_id).run();

  return c.json({ success: true, new_name: newName });
});

// Simulate scoring
app.post("/api/demo/simulate/scoring", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { league_id } = await c.req.json();

  // This would update pick results and standings
  // For now, just log the action
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, payload_json, data_scope)
    VALUES ('demo_scoring_triggered', ?, ?, ?, 'league', '{}', 'DEMO')
  `).bind(league_id, user.id, user.id).run();

  return c.json({ success: true, message: "Scoring simulation triggered" });
});

// Simulate eliminations (for survivor pools)
app.post("/api/demo/simulate/eliminations", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { league_id } = await c.req.json();

  // Log the elimination simulation
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, payload_json, data_scope)
    VALUES ('demo_eliminations_triggered', ?, ?, ?, 'league', '{}', 'DEMO')
  `).bind(league_id, user.id, user.id).run();

  return c.json({ success: true, message: "Elimination simulation triggered" });
});

// ============ In-App Notifications Routes ============

// Get notifications for current user
app.get("/api/notifications", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const unreadOnly = c.req.query("unread") === "true";

  let query = `
    SELECT * FROM notifications 
    WHERE user_id = ?
  `;
  
  if (unreadOnly) {
    query += ` AND is_read = 0`;
  }
  
  query += ` ORDER BY created_at DESC LIMIT ?`;

  const { results } = await c.env.DB.prepare(query).bind(user.id, limit).all();

  // Get unread count
  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
  `).bind(user.id).first<{ count: number }>();

  return c.json({
    notifications: results.map((n: Record<string, unknown>) => ({
      ...n,
      metadata: n.metadata_json ? JSON.parse(n.metadata_json as string) : null,
    })),
    unread_count: countResult?.count || 0,
  });
});

// Mark notification as read
app.patch("/api/notifications/:id/read", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const notificationId = c.req.param("id");
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE notifications SET is_read = 1, read_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(now, notificationId, user.id).run();

  return c.json({ success: true });
});

// Mark all notifications as read
app.post("/api/notifications/mark-all-read", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE notifications SET is_read = 1, read_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND is_read = 0
  `).bind(now, user.id).run();

  return c.json({ success: true });
});

// Delete a notification
app.delete("/api/notifications/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const notificationId = c.req.param("id");

  await c.env.DB.prepare(`
    DELETE FROM notifications WHERE id = ? AND user_id = ?
  `).bind(notificationId, user.id).run();

  return c.json({ success: true });
});

// Create a notification (internal helper - used by other endpoints)
export async function createNotification(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  body?: string,
  url?: string,
  metadata?: Record<string, any>
) {
  await db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, url, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    type,
    title,
    body || null,
    url || null,
    metadata ? JSON.stringify(metadata) : null
  ).run();
}

async function queuePushNotification(
  db: D1Database,
  userId: string,
  notificationType: string,
  title: string,
  body: string,
  url?: string,
  leagueId?: number,
) {
  await db.prepare(`
    INSERT INTO scheduled_notifications (
      user_id, league_id, notification_type, title, body, url, scheduled_for, status
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending')
  `).bind(
    userId,
    leagueId ?? null,
    notificationType,
    title,
    body,
    url || null,
  ).run();
}

// Delete a message (own messages or admin)
app.delete("/api/leagues/:id/chat/:messageId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("id");
  const messageId = c.req.param("messageId");

  // Check membership and role
  const membership = await c.env.DB.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, user.id).first<{ role: string }>();

  if (!membership) {
    return c.json({ error: "Not a member of this league" }, 403);
  }

  const isAdmin = membership.role === "owner" || membership.role === "admin";

  // Get message
  const message = await c.env.DB.prepare(`
    SELECT id, user_id FROM league_messages WHERE id = ? AND league_id = ? AND is_deleted = 0
  `).bind(messageId, leagueId).first<{ id: number; user_id: string }>();

  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Can only delete own messages unless admin
  if (message.user_id !== user.id && !isAdmin) {
    return c.json({ error: "Cannot delete this message" }, 403);
  }

  // Soft delete
  await c.env.DB.prepare(`
    UPDATE league_messages SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(messageId).run();

  // Log deletion
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, reason)
    VALUES ('chat_message_deleted', ?, ?, ?, 'league_message', ?, ?)
  `).bind(leagueId, message.user_id, user.id, messageId, isAdmin && message.user_id !== user.id ? "Deleted by admin" : "Deleted by author").run();

  return c.json({ success: true });
});

// Legacy scheduled handler (for Cloudflare cron if ever configured)
async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const { checkAndRunScheduledJobs: runScheduler } = await import('./services/sports-data/internalScheduler');
  const { runCoachGScheduledPipeline } = await import('./services/coachgTaskEngine');
  const { fetchSportsRadarOdds, captureAllOddsSnapshots } = await import('./services/sportsRadarOddsService');
  
  console.log(`[Scheduled] Triggered by cron: ${event.cron}`);
  
  ctx.waitUntil(
    runScheduler(env.DB)
      .then(() => console.log('[Scheduled] Scheduler check complete'))
      .catch(err => console.error('[Scheduled] Scheduler check failed:', err))
  );

  // Optional Coach G V3 autonomous scan pipeline
  if (env.COACHG_V3_ENABLED !== "false") {
    ctx.waitUntil(
      runCoachGScheduledPipeline({ db: env.DB, env })
        .then((results) => {
          const produced = results.reduce((sum, row) => sum + row.producedPayloads, 0);
          console.log(`[Scheduled] Coach G task engine complete: ${results.length} jobs, ${produced} payloads`);
        })
        .catch((err) => console.error('[Scheduled] Coach G task engine failed:', err))
    );
  }

  // Keep line-movement snapshots warm even when UI requests use includeOdds=0.
  // This ensures opening/current movement data continues across all active sports.
  const oddsApiKey = env.SPORTSRADAR_ODDS_KEY || env.SPORTSRADAR_API_KEY;
  if (env.DB && oddsApiKey) {
    const baseApiKey = env.SPORTSRADAR_API_KEY || oddsApiKey;
    const oddsSports = ['nba', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf', 'soccer', 'mma', 'golf', 'nascar'] as const;
    ctx.waitUntil(
      (async () => {
        let totalCaptured = 0;
        let totalErrors = 0;
        await Promise.allSettled(
          oddsSports.map(async (sport) => {
            try {
              const oddsMap = await fetchSportsRadarOdds(sport, baseApiKey, env.DB, undefined, oddsApiKey);
              if (oddsMap.size === 0) return;
              const result = await captureAllOddsSnapshots(env.DB, oddsMap, sport);
              totalCaptured += result.captured;
              totalErrors += result.errors;
            } catch (err) {
              totalErrors += 1;
              console.error(`[Scheduled] Snapshot capture failed for ${sport}:`, err);
            }
          })
        );
        console.log(`[Scheduled] Line movement capture complete: ${totalCaptured} captured, ${totalErrors} errors`);
      })()
    );
  }

  // Warm canonical page-data snapshots so user navigation reads prepared payloads.
  ctx.waitUntil(
    (async () => {
      try {
        const minute = Number(new Date().getUTCMinutes());
        // Alternate full vs depth every minute — "full" pulls maximum props + roster coverage.
        const lane = minute % 2 === 0 ? "full" : "depth";
        const runLane = async (selectedLane: "core" | "depth" | "full", forceFresh: boolean) =>
          runPageDataWarmCycle({
            lane: selectedLane,
            forceFresh,
            db: env.DB,
            fetchFn: async (pathWithQuery) => {
              try {
                const request = new Request(`https://internal${pathWithQuery}`, {
                  method: "GET",
                  headers: { "x-page-data-warm": "1", "x-page-data-warm-lane": selectedLane },
                });
                const response = await app.fetch(request, env, ctx);
                const body = await response.json().catch(() => null);
                return { ok: response.ok, status: response.status, body };
              } catch {
                return { ok: false, status: 0, body: null };
              }
            },
          });
        const summary = await runLane(lane, lane === "full");
        console.log("[Scheduled] Page-data warm complete", { lane, summary });
      } catch (err) {
        console.error("[Scheduled] Page-data warm failed:", err);
      }
    })()
  );

  // Player documents: seed queue from props feed, drain via buildPlayerDocument only (no page-data / warm).
  if (env.DB) {
    ctx.waitUntil(
      (async () => {
        try {
          const { enqueuePlayerDocumentsFromPropsFeed, processPlayerDocumentQueue } = await import(
            "./services/playerDocuments/ingestion"
          );
          const { countPlayerDocuments } = await import("./services/playerDocuments/playerDocumentStore");
          const { setCounter } = await import("./services/pageData/rolloutMetrics");
          const internalFetch = async (pathWithQuery: string) => {
            try {
              const request = new Request(`https://internal${pathWithQuery}`, { method: "GET" });
              const response = await app.fetch(request, env, ctx);
              const body = await response.json().catch(() => null);
              return { ok: response.ok, status: response.status, body };
            } catch {
              return { ok: false, status: 0, body: null };
            }
          };
          const enq = await enqueuePlayerDocumentsFromPropsFeed(env.DB, internalFetch);
          const proc = await processPlayerDocumentQueue({
            db: env.DB,
            env: env as any,
            origin: "https://internal",
            limit: 120,
          });
          const rowCount = await countPlayerDocuments(env.DB);
          setCounter("playerDocumentsRowCount", rowCount);
          console.log("[Scheduled] Player document queue", { enq, proc, rowCount });
        } catch (err) {
          console.error("[Scheduled] Player document queue failed:", err);
        }
      })()
    );
  }
}

// Track if providers have been initialized this request
let providersInitialized = false;

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    const applyAssetCachePolicy = (
      response: Response,
      opts: { path: string; isDocumentRequest: boolean; hasFileExtension: boolean }
    ): Response => {
      const { path, isDocumentRequest, hasFileExtension } = opts;
      const isServiceWorker = path === "/sw.js";
      const isManifest = path === "/manifest.json";
      const isHtmlShell =
        (isDocumentRequest && !hasFileExtension) || path === "/" || path.endsWith(".html");
      const isFingerprintedAsset = path.startsWith("/assets/");

      if (!isServiceWorker && !isManifest && !isHtmlShell && !isFingerprintedAsset) {
        return response;
      }

      const headers = new Headers(response.headers);
      if (isServiceWorker || isManifest || isHtmlShell) {
        headers.set("cache-control", "no-store, no-cache, must-revalidate");
        headers.set("pragma", "no-cache");
        headers.set("expires", "0");
      } else if (isFingerprintedAsset) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }
      if (isServiceWorker) {
        headers.set("service-worker-allowed", "/");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };
    
    // Initialize providers with API keys and database from env on each request
    // (workers may be cold-started, so we need to ensure providers are ready)
    if (!providersInitialized) {
      initProviders({ 
        SPORTSRADAR_API_KEY: env.SPORTSRADAR_API_KEY, // PRIMARY provider
        DB: env.DB 
      });
      // Ensure core D1 tables exist (non-blocking, errors are swallowed)
      if (env.DB) {
        import('./services/dbBootstrap').then(m => m.ensureCoreTables(env.DB)).catch(() => {});
      }
      providersInitialized = true;
    }
    
    // ASSETS binding is auto-provided by Cloudflare when assets are configured
    const assets = (env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
    
    // Only handle API routes with Hono
    // All other routes go to assets (SPA fallback)
    if (url.pathname.startsWith('/api/')) {
      try {
        return await app.fetch(request, env, ctx);
      } catch (error) {
        console.error("[Worker] Unhandled API error:", error);
        return new Response(
          JSON.stringify({
            error: "Upstream fetch failed",
            message: "Temporary upstream/network failure while handling API request.",
          }),
          {
            status: 502,
            headers: { "content-type": "application/json; charset=utf-8" },
          }
        );
      }
    }
    
    const accept = request.headers.get("accept") || "";
    const isDocumentRequest = request.method === "GET" && accept.includes("text/html");
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);

    // For non-API routes in production, serve from assets
    // In dev mode, the Cloudflare Vite plugin handles static files
    if (assets) {
      try {
        const assetResponse = await assets.fetch(request);
        if (assetResponse.status !== 404) {
          return applyAssetCachePolicy(assetResponse, {
            path: url.pathname,
            isDocumentRequest,
            hasFileExtension,
          });
        }

        // Production SPA deep-link fallback:
        // when /games or /odds is requested directly, serve the root document.
        if (isDocumentRequest && !hasFileExtension) {
          const rootUrl = new URL("/", url);
          const rootRequest = new Request(rootUrl.toString(), request);
          const rootResponse = await assets.fetch(rootRequest);
          if (rootResponse.ok) {
            return applyAssetCachePolicy(rootResponse, {
              path: "/",
              isDocumentRequest: true,
              hasFileExtension: false,
            });
          }
        }

        return assetResponse;
      } catch (error) {
        console.error("[Worker] Asset fetch failed:", error);
      }
    }
    
    // Dev-only SPA fallback when assets binding is unavailable.
    // Serve a minimal Vite HTML shell for document navigation requests so
    // deep links like /games/... resolve to the React router instead of 404.

    if (isDocumentRequest && !hasFileExtension) {
      return new Response(
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>G1 Sports</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/react-app/main.tsx"></script>
  </body>
</html>`,
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }
      );
    }

    return new Response(null, { status: 404 });
  },
  scheduled: handleScheduled,
};
