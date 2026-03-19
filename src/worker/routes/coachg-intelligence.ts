import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { HTTPException } from "hono/http-exception";
import { runCoachGBrain } from "../services/coachgBrainService";
import type { IntelligencePayload } from "../types/intelligencePayload";
import {
  checkCoachGVideoRetryCooldown,
  enqueueCoachGVideoScriptJob,
  enqueueHeyGenVideoJob,
  getHeyGenVideoJobById,
  getCoachGVideoOpsSummary,
  listFailedCoachGGameIdsForTodaySlate,
  listHeyGenJobs,
  listMissingCoachGVideos,
  publishHeyGenVideoToSocial,
  refreshHeyGenVideoJobStatus,
  setCoachGVideoJobReview,
} from "../services/heygenVideoService";
import { getCoachGModelUsageSnapshot } from "../services/coachgTelemetry";
import { getPlatformUser, logAuditEvent, superAdminMiddleware } from "../middleware/rbac";
import {
  getCoachGPipelineConfig,
  getCoachGFeaturedItemById,
  listCoachGFeaturedItems,
  setCoachGPipelineConfig,
  updateCoachGFeaturedItemEditorial,
  updateCoachGFeaturedItemStates,
} from "../services/coachgFeaturedContentRepository";
import {
  getCoachGPipelineHealth,
  publishCoachGToSocialPlatforms,
  runDailyCoachGPipeline,
} from "../services/coachgDailyPipelineService";
import { publishCoachGItemToSocial } from "../services/socialPublisherService";
import { fetchGamesWithFallback, fetchLiveGamesWithFallback, fetchScheduledGamesWithFallback } from "../services/providers";

const coachGIntelligenceRouter = new Hono<{ Bindings: Env }>();
type UserHeaderContext = {
  req: { header: (key: string) => string | undefined };
  get: (key: string) => unknown;
};
let systemConfig: Record<string, unknown> = {
  modelRoutingMode: "task_based",
  edgeWeightsProfile: "default",
  sharpRadarSensitivity: "medium",
  taskEngineEnabled: true,
  providerQuotaMode: "balanced",
  alertThrottlePerHour: 24,
};

function getUserId(c: UserHeaderContext): string | null {
  const direct = c.req.header("x-user-id");
  if (direct) return direct;
  try {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || null;
  } catch {
    return null;
  }
}

function isDemoMode(c: UserHeaderContext): boolean {
  return c.req.header("X-Demo-Mode") === "true";
}

function parseMetadataJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function withTimeoutOrNull<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (timer) clearTimeout(timer);
  return result;
}

coachGIntelligenceRouter.use("/admin/*", async (c, next) => {
  if (isDemoMode(c)) {
    await next();
    return;
  }
  try {
    await authMiddleware(c, async () => {});
    await superAdminMiddleware(c, async () => {});
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message || "Access denied" }, error.status);
    }
    throw error;
  }
  await next();
});

/**
 * GET /api/coachg/intelligence
 * Central Coach G intelligence payload for Home/Games/Odds/Watchboards/Game pages.
 */
coachGIntelligenceRouter.get("/intelligence", async (c) => {
  const gameId = c.req.query("game_id") || undefined;
  const surface = c.req.query("surface") || "global";
  const query = c.req.query("q") || undefined;
  const userId = getUserId(c);
  try {
    const payload = await withTimeoutOrNull(
      runCoachGBrain({
        db: c.env.DB,
        env: c.env,
        userId,
        surface,
        gameId,
        query: query || surface,
      }),
      surface === "home" ? 2400 : 3200
    );
    if (!payload) {
      const matchup = query || gameId || "live matchup";
      return c.json({
        surface,
        summary: `Live read active for ${matchup}. Monitoring line movement and momentum updates.`,
        edge_score: 0,
        sharp_radar: [
          {
            type: "market_monitor",
            icon: "📡",
            message: "Live market updating",
            importance: "medium",
          },
        ],
        line_prediction: null,
        player_prop_edges: [],
        actionable_intel: [
          "Monitoring live movement and key momentum swings.",
        ],
        generated_at: new Date().toISOString(),
        model_route: {
          task: "fallback",
          provider: "deterministic",
          model: "fallback",
          reason: "route_timeout",
          fallback_used: true,
        },
      }, 200);
    }

    return c.json({
      surface,
      ...payload,
    });
  } catch (error) {
    const matchup = query || gameId || "live matchup";
    console.error("[CoachG] /intelligence fallback:", error);
    return c.json({
      surface,
      summary: `Live read active for ${matchup}. Monitoring line movement and momentum updates.`,
      edge_score: 0,
      sharp_radar: [
        {
          type: "market_monitor",
          icon: "📡",
          message: "Live market updating",
          importance: "medium",
        },
      ],
      line_prediction: null,
      player_prop_edges: [],
      actionable_intel: [
        "Monitoring live movement and key momentum swings.",
      ],
      generated_at: new Date().toISOString(),
      model_route: {
        task: "fallback",
        provider: "deterministic",
        model: "fallback",
        reason: "route_error",
        fallback_used: true,
      },
    }, 200);
  }
});

/**
 * GET /api/coachg/daily-brief
 * Personalized daily briefing using user context + top available game context.
 */
coachGIntelligenceRouter.get("/daily-brief", async (c) => {
  const userId = getUserId(c);
  const payload = await runCoachGBrain({
    db: c.env.DB,
    env: c.env,
    userId,
    surface: "home",
    query: "daily briefing",
  });

  return c.json({
    title: "Coach G Daily Brief",
    generated_at: payload.generated_at,
    edge_score: payload.edge_score,
    summary: payload.summary,
    top_signals: payload.sharp_radar.slice(0, 3),
    top_prop_edges: payload.player_prop_edges.slice(0, 3),
    source: "coachg_brain_service",
  });
});

/**
 * GET /api/coachg/feed
 * Intelligence feed for /intelligence dashboard surfaces.
 */
coachGIntelligenceRouter.get("/feed", async (c) => {
  const userId = getUserId(c);
  const requestedLimit = Math.max(1, Math.min(20, Number(c.req.query("limit") || 8)));
  // Keep feed latency predictable while still filling meaningful cards.
  const limit = Math.min(requestedLimit, 6);
  const surface = c.req.query("surface") || "home";
  const live = await fetchLiveGamesWithFallback({ sports: ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer", "mma", "golf", "nascar"] });
  const ids = live.data
    .slice(0, limit)
    .map((g) => String(g.game_id || ""))
    .filter((id) => id.length > 0);
  if (ids.length < limit) {
    const upcoming = await fetchScheduledGamesWithFallback({ hours: 24 });
    for (const game of upcoming.data) {
      if (ids.length >= limit) break;
      const id = String(game.game_id || "");
      if (!id || ids.includes(id)) continue;
      ids.push(id);
    }
  }
  if (ids.length < limit) {
    // Fallback to broad sport sweeps so feed stays populated off-hours.
    const fallbackSports: Array<"nba" | "nfl" | "mlb" | "nhl" | "ncaab" | "ncaaf" | "soccer" | "mma" | "golf" | "nascar"> =
      ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer", "mma", "golf", "nascar"];
    for (const sport of fallbackSports) {
      if (ids.length >= limit) break;
      const sweep = await fetchGamesWithFallback(sport, {});
      for (const game of sweep.data) {
        if (ids.length >= limit) break;
        const id = String(game.game_id || "");
        if (!id || ids.includes(id)) continue;
        ids.push(id);
      }
    }
  }

  const payloads: IntelligencePayload[] = [];
  const feedResults = await Promise.all(
    ids.map((gameId) =>
      withTimeoutOrNull(
        runCoachGBrain({
          db: c.env.DB,
          env: c.env,
          userId,
          surface,
          gameId,
          query: "intelligence feed",
        }),
        5000
      )
    )
  );
  for (const result of feedResults) {
    if (result?.intelligence_payload) payloads.push(result.intelligence_payload);
  }

  return c.json({
    surface,
    count: payloads.length,
    payloads,
    source: "provider_chain",
    fallback_reason: ids.length === 0 ? (live.error || "No live/scheduled games available from provider chain") : null,
  });
});

/**
 * GET /api/coachg/admin/intelligence
 * Lightweight telemetry panel payload for admin dashboard.
 */
coachGIntelligenceRouter.get("/admin/intelligence", async (c) => {
  const now = new Date().toISOString();
  const feed = await runCoachGBrain({
    db: c.env.DB,
    env: c.env,
    userId: null,
    surface: "admin",
    query: "market movers",
  });
  return c.json({
    as_of: now,
    usage_snapshot: getCoachGModelUsageSnapshot(),
    model_usage: {
      provider: feed.model_route.provider,
      model: feed.model_route.model,
      latency_ms: feed.model_route.latency_ms || 0,
      fallback_used: feed.model_route.fallback_used || false,
    },
    signal_generation: {
      sharp_signals: feed.sharp_radar.length,
      prop_edges: feed.player_prop_edges.length,
      edge_score: feed.edge_score,
    },
    sample_payload: feed.intelligence_payload || null,
  });
});

coachGIntelligenceRouter.get("/admin/system", async (c) => {
  return c.json({
    config: systemConfig,
    defaults: {
      coachg_v3_enabled: c.env.COACHG_V3_ENABLED !== "false",
    },
  });
});

coachGIntelligenceRouter.put("/admin/system", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  systemConfig = {
    ...systemConfig,
    ...body,
  };
  return c.json({ success: true, config: systemConfig });
});

coachGIntelligenceRouter.post("/video/jobs", async (c) => {
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const gameId = String(body?.game_id || "");
  const userId = getUserId(c);
  if (!gameId) return c.json({ error: "game_id is required" }, 400);

  const intel = await runCoachGBrain({
    db: c.env.DB,
    env: c.env,
    userId,
    surface: "game",
    gameId,
    query: "video script generation",
  });
  if (!intel.intelligence_payload) {
    return c.json({ error: "No payload available for video generation" }, 422);
  }
  const job = await enqueueHeyGenVideoJob({
    db: c.env.DB,
    env: c.env,
    payload: intel.intelligence_payload,
    gameId,
  });
  return c.json({ success: true, job });
});

coachGIntelligenceRouter.get("/video/jobs", async (c) => {
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") || 25)));
  const gameId = c.req.query("game_id") || undefined;
  const windowHours = Number(c.req.query("window_hours") || 24);
  const viewerTzOffsetMin = Number(c.req.query("viewer_tz_offset_min") || 0);
  const jobs = await listHeyGenJobs(c.env.DB, {
    limit,
    gameId,
    windowHours,
    viewerTzOffsetMin,
    fullHistory: false,
  });
  return c.json({ jobs });
});

coachGIntelligenceRouter.get("/admin/video/jobs", async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100)));
  const gameId = c.req.query("game_id") || undefined;
  const jobs = await listHeyGenJobs(c.env.DB, {
    limit,
    gameId,
    fullHistory: true,
  });
  return c.json({ jobs });
});

coachGIntelligenceRouter.get("/featured", async (c) => {
  const dateKey = c.req.query("date_key") || undefined;
  const sport = c.req.query("sport") || undefined;
  const lane = c.req.query("lane") || undefined;
  const contentType = c.req.query("content_type") || undefined;
  const approvalStatus = c.req.query("approval_status") || undefined;
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") || 20)));
  const items = await listCoachGFeaturedItems(c.env.DB, {
    dateKey,
    sport,
    lane: lane as Parameters<typeof listCoachGFeaturedItems>[1]["lane"],
    contentType: contentType as Parameters<typeof listCoachGFeaturedItems>[1]["contentType"],
    approvalStatus: approvalStatus as Parameters<typeof listCoachGFeaturedItems>[1]["approvalStatus"],
    limit,
  });
  return c.json({
    date_key: dateKey || null,
    count: items.length,
    items,
  });
});

coachGIntelligenceRouter.get("/admin/featured", async (c) => {
  const dateKey = c.req.query("date_key") || undefined;
  const sport = c.req.query("sport") || undefined;
  const lane = c.req.query("lane") || undefined;
  const contentType = c.req.query("content_type") || undefined;
  const approvalStatus = c.req.query("approval_status") || undefined;
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100)));
  const items = await listCoachGFeaturedItems(c.env.DB, {
    dateKey,
    sport,
    lane: lane as Parameters<typeof listCoachGFeaturedItems>[1]["lane"],
    contentType: contentType as Parameters<typeof listCoachGFeaturedItems>[1]["contentType"],
    approvalStatus: approvalStatus as Parameters<typeof listCoachGFeaturedItems>[1]["approvalStatus"],
    limit,
  });
  return c.json({
    date_key: dateKey || null,
    count: items.length,
    items,
  });
});

coachGIntelligenceRouter.get("/admin/pipeline/config", async (c) => {
  const config = await getCoachGPipelineConfig(c.env.DB);
  return c.json({ config });
});

coachGIntelligenceRouter.put("/admin/pipeline/config", async (c) => {
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    updates[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  if (Object.keys(updates).length > 0) {
    await setCoachGPipelineConfig(c.env.DB, updates);
  }
  const config = await getCoachGPipelineConfig(c.env.DB);
  return c.json({ success: true, config });
});

coachGIntelligenceRouter.post("/admin/pipeline/run", async (c) => {
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const dateKey = typeof body.date_key === "string" ? body.date_key : undefined;
  const force = body.force === true;
  const gameId = typeof body.game_id === "string" ? body.game_id : undefined;
  const result = await runDailyCoachGPipeline({
    db: c.env.DB,
    env: c.env,
    dateKey,
    triggerSource: "manual",
    force,
    gameId,
  });
  return c.json({ success: true, result });
});

coachGIntelligenceRouter.get("/admin/pipeline/health", async (c) => {
  const dateKey = c.req.query("date_key") || undefined;
  const health = await getCoachGPipelineHealth({
    db: c.env.DB,
    env: c.env,
    dateKey,
  });
  return c.json({ health });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/publish-owned", async (c) => {
  const itemId = c.req.param("itemId");
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  await updateCoachGFeaturedItemStates(c.env.DB, item.itemId, { publishStatus: "published_owned" });
  return c.json({ success: true });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/retry-video", async (c) => {
  const itemId = c.req.param("itemId");
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  const job = await enqueueCoachGVideoScriptJob({
    db: c.env.DB,
    env: c.env,
    gameId: item.gameId,
    scriptText: item.videoScript,
    payloadId: item.sourcePayloadId || null,
  });
  await updateCoachGFeaturedItemStates(c.env.DB, item.itemId, {
    videoJobId: job.id,
    videoStatus: job.status === "failed" ? "retry_pending" : job.status,
    videoUrl: job.videoUrl || null,
  });
  return c.json({ success: true, job });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/retry-social", async (c) => {
  const itemId = c.req.param("itemId");
  const force = c.req.query("force") === "1";
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  const result = await publishCoachGToSocialPlatforms({
    db: c.env.DB,
    env: c.env,
    dateKey: item.dateKey,
    force,
  });
  return c.json({ success: true, result });
});

coachGIntelligenceRouter.put("/admin/featured/:itemId/script", async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  const scriptTextRaw = typeof body.video_script === "string" ? body.video_script.trim() : "";
  if (!scriptTextRaw) {
    return c.json({ error: "video_script is required" }, 400);
  }
  const safeScript = scriptTextRaw.startsWith("What's up G1, Coach G here.")
    ? scriptTextRaw
    : `What's up G1, Coach G here. ${scriptTextRaw}`;
  await updateCoachGFeaturedItemEditorial(c.env.DB, itemId, {
    headline: typeof body.headline === "string" ? body.headline : undefined,
    shortSummary: typeof body.short_summary === "string" ? body.short_summary : undefined,
    fullAnalysisText: typeof body.full_analysis_text === "string" ? body.full_analysis_text : undefined,
    videoScript: safeScript,
  });
  await updateCoachGFeaturedItemStates(c.env.DB, itemId, {
    videoStatus: "retry_pending",
    videoUrl: null,
  });
  const refreshed = await getCoachGFeaturedItemById(c.env.DB, itemId);
  return c.json({ success: true, item: refreshed });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/approval", async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const state = typeof body.state === "string" ? body.state : "";
  if (!["needs_review", "approved", "rejected", "held"].includes(state)) {
    return c.json({ error: "state must be one of needs_review|approved|rejected|held" }, 400);
  }
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  const existingMeta = parseMetadataJson(item.metadataJson);
  const updated = {
    ...existingMeta,
    approval_state: state,
    approval_note: typeof body.note === "string" ? body.note : null,
    approval_updated_at: new Date().toISOString(),
  };
  await updateCoachGFeaturedItemStates(c.env.DB, itemId, {
    approvalStatus: state as "needs_review" | "approved" | "rejected" | "held",
    metadataJson: JSON.stringify(updated),
  });
  const refreshed = await getCoachGFeaturedItemById(c.env.DB, itemId);
  return c.json({ success: true, item: refreshed });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/schedule", async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  const scheduledFor = typeof body.scheduled_for === "string" && body.scheduled_for.trim().length > 0
    ? body.scheduled_for
    : null;
  const existingMeta = parseMetadataJson(item.metadataJson);
  const updated = {
    ...existingMeta,
    schedule_state: scheduledFor ? "scheduled" : "unscheduled",
    scheduled_for: scheduledFor,
    schedule_updated_at: new Date().toISOString(),
  };
  await updateCoachGFeaturedItemStates(c.env.DB, itemId, {
    metadataJson: JSON.stringify(updated),
  });
  const refreshed = await getCoachGFeaturedItemById(c.env.DB, itemId);
  return c.json({ success: true, item: refreshed });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/platforms", async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  const disabled = Array.isArray(body.disabled_platforms)
    ? body.disabled_platforms.map((v) => String(v))
    : [];
  const existingMeta = parseMetadataJson(item.metadataJson);
  const updated = {
    ...existingMeta,
    disabled_platforms: disabled,
    platform_override_updated_at: new Date().toISOString(),
  };
  await updateCoachGFeaturedItemStates(c.env.DB, itemId, {
    metadataJson: JSON.stringify(updated),
  });
  const refreshed = await getCoachGFeaturedItemById(c.env.DB, itemId);
  return c.json({ success: true, item: refreshed });
});

coachGIntelligenceRouter.post("/admin/featured/:itemId/publish-now", async (c) => {
  const itemId = c.req.param("itemId");
  const item = await getCoachGFeaturedItemById(c.env.DB, itemId);
  if (!item) return c.json({ error: "Featured item not found" }, 404);
  await updateCoachGFeaturedItemStates(c.env.DB, item.itemId, { publishStatus: "published_owned" });
  const config = await getCoachGPipelineConfig(c.env.DB);
  const metadata = parseMetadataJson(item.metadataJson);
  const disabled = Array.isArray(metadata.disabled_platforms)
    ? metadata.disabled_platforms.map((v) => String(v))
    : [];
  const social = await publishCoachGItemToSocial({
    db: c.env.DB,
    env: c.env,
    item,
    platformEnabled: {
      instagram: config.platform_instagram_enabled !== "false" && !disabled.includes("instagram"),
      facebook: config.platform_facebook_enabled !== "false" && !disabled.includes("facebook"),
      tiktok: config.platform_tiktok_enabled !== "false" && !disabled.includes("tiktok"),
    },
  });
  const refreshed = await getCoachGFeaturedItemById(c.env.DB, itemId);
  return c.json({ success: true, item: refreshed, social });
});

coachGIntelligenceRouter.get("/admin/video-ops/summary", async (c) => {
  const viewerTzOffsetMin = Number(c.req.query("viewer_tz_offset_min") || 0);
  const summary = await getCoachGVideoOpsSummary(c.env.DB, { viewerTzOffsetMin });
  return c.json({ summary });
});

coachGIntelligenceRouter.get("/admin/video-ops/missing", async (c) => {
  const viewerTzOffsetMin = Number(c.req.query("viewer_tz_offset_min") || 0);
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100)));
  const missing = await listMissingCoachGVideos(c.env.DB, { viewerTzOffsetMin, limit });
  return c.json({
    count: missing.length,
    missing,
  });
});

coachGIntelligenceRouter.post("/admin/video-ops/retry/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const userId = getUserId(c);
  if (!gameId) return c.json({ error: "gameId is required" }, 400);
  const cooldown = await checkCoachGVideoRetryCooldown(c.env.DB, gameId, 10);
  if (!cooldown.allowed) {
    return c.json({
      error: "Retry cooldown active",
      gameId,
      retry_after_seconds: cooldown.retryAfterSeconds,
      cooldown_minutes: cooldown.cooldownMinutes,
      latest_job_id: cooldown.latestJobId,
      latest_created_at: cooldown.latestCreatedAt,
    }, 429);
  }

  const intel = await runCoachGBrain({
    db: c.env.DB,
    env: c.env,
    userId,
    surface: "admin",
    gameId,
    query: "video script generation retry",
  });
  if (!intel.intelligence_payload) {
    return c.json({ error: "No payload available for video generation" }, 422);
  }

  const job = await enqueueHeyGenVideoJob({
    db: c.env.DB,
    env: c.env,
    payload: intel.intelligence_payload,
    gameId,
  });
  return c.json({ success: true, job });
});

coachGIntelligenceRouter.post("/admin/video-ops/retry-failed", async (c) => {
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const viewerTzOffsetMin = Number(body.viewer_tz_offset_min || 0);
  const limit = Math.max(1, Math.min(100, Number(body.limit || 25)));
  const userId = getUserId(c);

  const failedCandidates = await listFailedCoachGGameIdsForTodaySlate(c.env.DB, {
    viewerTzOffsetMin,
    limit,
  });

  const jobs = [];
  const skippedCooldown: Array<{ gameId: string; retryAfterSeconds: number; latestJobId: string | null; latestCreatedAt: string | null }> = [];
  for (const candidate of failedCandidates) {
    const cooldown = await checkCoachGVideoRetryCooldown(c.env.DB, candidate.gameId, 10);
    if (!cooldown.allowed) {
      skippedCooldown.push({
        gameId: candidate.gameId,
        retryAfterSeconds: cooldown.retryAfterSeconds,
        latestJobId: cooldown.latestJobId,
        latestCreatedAt: cooldown.latestCreatedAt,
      });
      continue;
    }

    const intel = await runCoachGBrain({
      db: c.env.DB,
      env: c.env,
      userId,
      surface: "admin",
      gameId: candidate.gameId,
      query: "video script generation retry",
    });
    if (!intel.intelligence_payload) continue;
    const job = await enqueueHeyGenVideoJob({
      db: c.env.DB,
      env: c.env,
      payload: intel.intelligence_payload,
      gameId: candidate.gameId,
    });
    jobs.push(job);
  }

  return c.json({
    success: true,
    requested: failedCandidates.length,
    retried: jobs.length,
    skipped_cooldown: skippedCooldown.length,
    skipped_cooldown_games: skippedCooldown,
    jobs,
  });
});

coachGIntelligenceRouter.post("/admin/video-ops/review/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const action = body.action === "reject" ? "reject" : body.action === "approve" ? "approve" : null;
  const notes = typeof body.notes === "string" ? body.notes : null;
  const actor = getPlatformUser(c);
  const actorUserId = actor?.id || (isDemoMode(c) ? "demo-super-admin" : null);
  if (!action) {
    return c.json({ error: "action must be 'approve' or 'reject'" }, 400);
  }
  if (!actorUserId) {
    return c.json({ error: "Super Admin access required" }, 403);
  }

  const reviewed = await setCoachGVideoJobReview({
    db: c.env.DB,
    jobId,
    action,
    actorUserId,
    notes,
  });
  if (!reviewed) return c.json({ error: "Job not found" }, 404);

  await logAuditEvent(c.env.DB, {
    actorUserId,
    actorRole: "super_admin",
    entityType: "system",
    entityId: reviewed.id,
    actionType: action === "approve" ? "setting_changed" : "feature_flag_toggled",
    summary: `Coach G video ${action}: ${reviewed.id}`,
    detailsJson: {
      game_id: reviewed.gameId,
      action,
      notes: notes || null,
    },
  });

  return c.json({ success: true, job: reviewed });
});

coachGIntelligenceRouter.post("/admin/video-ops/publish/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const actor = getPlatformUser(c);
  const actorUserId = actor?.id || (isDemoMode(c) ? "demo-super-admin" : null);
  if (!actorUserId) {
    return c.json({ error: "Super Admin access required" }, 403);
  }
  const job = await getHeyGenVideoJobById(c.env.DB, jobId);
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (job.reviewStatus !== "approved") {
    return c.json({ error: "Job must be approved before publish", job }, 409);
  }
  const published = await publishHeyGenVideoToSocial({
    db: c.env.DB,
    env: c.env,
    jobId,
  });
  if (!published) return c.json({ error: "Job not found" }, 404);

  await logAuditEvent(c.env.DB, {
    actorUserId,
    actorRole: "super_admin",
    entityType: "system",
    entityId: published.id,
    actionType: "campaign_sent",
    summary: `Coach G video publish requested: ${published.id}`,
    detailsJson: {
      game_id: published.gameId,
      social_status: published.socialStatus || "not_requested",
    },
  });

  return c.json({ success: true, job: published });
});

coachGIntelligenceRouter.get("/video/jobs/:jobId", async (c) => {
  const job = await refreshHeyGenVideoJobStatus({
    db: c.env.DB,
    env: c.env,
    jobId: c.req.param("jobId"),
  });
  if (!job) return c.json({ error: "Job not found" }, 404);
  return c.json({ job });
});

coachGIntelligenceRouter.post("/video/jobs/:jobId/publish-social", async (c) => {
  if (!isDemoMode(c)) {
    try {
      await authMiddleware(c, async () => {});
      await superAdminMiddleware(c, async () => {});
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json({ error: error.message || "Access denied" }, error.status);
      }
      throw error;
    }
  }
  const existing = await getHeyGenVideoJobById(c.env.DB, c.req.param("jobId"));
  if (!existing) return c.json({ error: "Job not found" }, 404);
  if (existing.reviewStatus !== "approved") {
    return c.json({ error: "Job must be approved before publish", job: existing }, 409);
  }
  const job = await publishHeyGenVideoToSocial({
    db: c.env.DB,
    env: c.env,
    jobId: c.req.param("jobId"),
  });
  if (!job) return c.json({ error: "Job not found" }, 404);
  return c.json({ success: true, job });
});

/**
 * POST /api/coachg/chat
 * Intent-first Coach G assistant bridge to the intelligence engine.
 */
coachGIntelligenceRouter.post("/chat", async (c) => {
  const body = await c.req.json().catch((): Record<string, unknown> => ({}));
  const message = String(body?.message || "");
  const gameId = body?.game_id ? String(body.game_id) : undefined;
  const userId = getUserId(c);

  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }

  const payload = await withTimeoutOrNull(
    runCoachGBrain({
      db: c.env.DB,
      env: c.env,
      userId,
      surface: "chat",
      gameId,
      query: message,
    }),
    2400
  );
  if (!payload) {
    return c.json({
      reply: "Live read active. I am monitoring market movement and momentum shifts as fresh context comes in.",
      intelligence: {
        summary: "Live read active. Monitoring line movement and momentum shifts.",
        actionable_intel: ["Watch line movement and injury updates before lock."],
        generated_at: new Date().toISOString(),
        model_route: {
          task: "fallback",
          provider: "deterministic",
          model: "fallback",
          reason: "route_timeout",
          fallback_used: true,
        },
      },
    });
  }

  return c.json({
    reply: payload.summary,
    intelligence: payload,
  });
});

export default coachGIntelligenceRouter;
