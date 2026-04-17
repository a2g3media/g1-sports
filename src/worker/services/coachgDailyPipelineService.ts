// @ts-nocheck
import { generateCoachGAnalysis } from "./coachgContentFactoryService";
import {
  getCoachGFeaturedItemById,
  getCoachGPipelineConfig,
  hasCoachGPipelineRunForDate,
  listCoachGFeaturedItems,
  startCoachGPipelineRun,
  completeCoachGPipelineRun,
  upsertCoachGFeaturedItem,
  updateCoachGFeaturedItemStates,
  type CoachGFeaturedItemRecord,
} from "./coachgFeaturedContentRepository";
import { selectFeaturedGamesBySport } from "./featuredGameSelectorService";
import { enqueueCoachGVideoScriptJob, refreshHeyGenVideoJobStatus } from "./heygenVideoService";
import { publishCoachGItemToSocial, type SocialPublishResult } from "./socialPublisherService";

export interface CoachGDailyPipelineResult {
  runId: string;
  dateKey: string;
  status: "completed" | "failed" | "skipped";
  selectedGamesCount: number;
  generatedItemsCount: number;
  videoRequestedCount: number;
  videoReadyCount: number;
  socialPublishedCount: number;
  errors: string[];
}

export interface CoachGPipelineHealthSnapshot {
  config: CoachGPipelineConfigResolved;
  requiredEnv: Record<string, boolean>;
  missingEnv: string[];
  today: {
    featuredItems: number;
    videosReady: number;
    videosPending: number;
    socialsPublished: number;
    socialsFailed: number;
  };
}

export interface CoachGPipelineConfigResolved {
  enabled: boolean;
  shadowMode: boolean;
  dailyMaxVideos: number;
  enabledSports: string[];
  platformInstagramEnabled: boolean;
  platformFacebookEnabled: boolean;
  platformTiktokEnabled: boolean;
}

function dateKeyUtc(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function parseBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function parseStringArray(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v).toLowerCase());
  } catch {
    return fallback;
  }
  return fallback;
}

async function resolvePipelineConfig(db: D1Database): Promise<CoachGPipelineConfigResolved> {
  const cfg = await getCoachGPipelineConfig(db);
  return {
    enabled: parseBool(cfg.enabled, true),
    shadowMode: parseBool(cfg.shadow_mode, false),
    dailyMaxVideos: Math.max(1, Math.min(40, parseNumber(cfg.daily_max_videos, 12))),
    enabledSports: parseStringArray(cfg.enabled_sports, ["nba", "nfl", "mlb", "nhl", "soccer", "golf", "mma", "ncaab"]),
    platformInstagramEnabled: parseBool(cfg.platform_instagram_enabled, true),
    platformFacebookEnabled: parseBool(cfg.platform_facebook_enabled, true),
    platformTiktokEnabled: parseBool(cfg.platform_tiktok_enabled, true),
  };
}

export async function getCoachGPipelineHealth(params: {
  db: D1Database;
  env: Env;
  dateKey?: string;
}): Promise<CoachGPipelineHealthSnapshot> {
  const { db, env, dateKey = dateKeyUtc() } = params;
  const config = await resolvePipelineConfig(db);
  const requiredEnv: Record<string, boolean> = {
    HEYGEN_API_KEY: Boolean(env.HEYGEN_API_KEY),
    HEYGEN_AVATAR_ID: Boolean(env.HEYGEN_AVATAR_ID),
    HEYGEN_VOICE_NAME: Boolean(env.HEYGEN_VOICE_NAME),
    INSTAGRAM_ACCESS_TOKEN: Boolean(env.INSTAGRAM_ACCESS_TOKEN),
    FACEBOOK_PAGE_ACCESS_TOKEN: Boolean(env.FACEBOOK_PAGE_ACCESS_TOKEN),
    TIKTOK_ACCESS_TOKEN: Boolean(env.TIKTOK_ACCESS_TOKEN),
    APP_BASE_URL: Boolean(env.APP_BASE_URL),
  };
  const missingEnv = Object.entries(requiredEnv)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  const items = await listCoachGFeaturedItems(db, { dateKey, limit: 200 });
  const videosReady = items.filter((i) => i.videoStatus === "completed").length;
  const videosPending = items.filter((i) => i.videoStatus !== "completed").length;
  const socialsPublished = items.filter((i) =>
    i.socialStatusInstagram === "published" ||
    i.socialStatusFacebook === "published" ||
    i.socialStatusTiktok === "published"
  ).length;
  const socialsFailed = items.filter((i) =>
    i.socialStatusInstagram === "failed" ||
    i.socialStatusFacebook === "failed" ||
    i.socialStatusTiktok === "failed"
  ).length;

  return {
    config,
    requiredEnv,
    missingEnv,
    today: {
      featuredItems: items.length,
      videosReady,
      videosPending,
      socialsPublished,
      socialsFailed,
    },
  };
}

async function syncVideoStatusForItem(db: D1Database, env: Env, item: CoachGFeaturedItemRecord): Promise<CoachGFeaturedItemRecord> {
  if (!item.videoJobId) return item;
  const refreshed = await refreshHeyGenVideoJobStatus({
    db,
    env,
    jobId: item.videoJobId,
  });
  if (!refreshed) return item;
  await updateCoachGFeaturedItemStates(db, item.itemId, {
    videoStatus: refreshed.status === "failed" ? "retry_pending" : refreshed.status,
    videoUrl: refreshed.videoUrl || null,
  });
  return (await getCoachGFeaturedItemById(db, item.itemId)) || item;
}

export async function publishCoachGToOwnedChannels(params: {
  db: D1Database;
  dateKey?: string;
}): Promise<number> {
  const { db, dateKey = dateKeyUtc() } = params;
  const items = await listCoachGFeaturedItems(db, { dateKey, limit: 200 });
  let published = 0;
  for (const item of items) {
    if (item.publishStatus === "published_owned") continue;
    await updateCoachGFeaturedItemStates(db, item.itemId, { publishStatus: "published_owned" });
    published += 1;
  }
  return published;
}

export async function publishCoachGToSocialPlatforms(params: {
  db: D1Database;
  env: Env;
  dateKey?: string;
  force?: boolean;
}): Promise<{ publishedCount: number; results: SocialPublishResult[]; errors: string[] }> {
  const { db, env, dateKey = dateKeyUtc(), force = false } = params;
  const config = await resolvePipelineConfig(db);
  const items = await listCoachGFeaturedItems(db, { dateKey, limit: 200 });
  const errors: string[] = [];
  const allResults: SocialPublishResult[] = [];
  let publishedCount = 0;

  for (const item of items) {
    const synced = await syncVideoStatusForItem(db, env, item);
    if (!synced.videoUrl || (synced.videoStatus !== "completed" && !force)) continue;
    if (!force &&
      synced.socialStatusInstagram === "published" &&
      synced.socialStatusFacebook === "published" &&
      synced.socialStatusTiktok === "published") {
      continue;
    }
    const results = await publishCoachGItemToSocial({
      db,
      env,
      item: synced,
      platformEnabled: {
        instagram: config.platformInstagramEnabled,
        facebook: config.platformFacebookEnabled,
        tiktok: config.platformTiktokEnabled,
      },
    });
    allResults.push(...results);
    publishedCount += results.filter((r) => r.success).length;
    for (const result of results) {
      if (!result.success && result.error) {
        errors.push(`${synced.itemId}:${result.platform}:${result.error}`);
      }
    }
  }

  return { publishedCount, results: allResults, errors };
}

export async function runDailyCoachGPipeline(params: {
  db: D1Database;
  env: Env;
  dateKey?: string;
  triggerSource?: "scheduled" | "manual";
  force?: boolean;
  gameId?: string;
}): Promise<CoachGDailyPipelineResult> {
  const { db, env, dateKey = dateKeyUtc(), triggerSource = "scheduled", force = false, gameId } = params;
  const runId = `${dateKey}:${triggerSource}:${Date.now()}`;
  const errors: string[] = [];
  const config = await resolvePipelineConfig(db);

  if (!config.enabled && !force) {
    return {
      runId,
      dateKey,
      status: "skipped",
      selectedGamesCount: 0,
      generatedItemsCount: 0,
      videoRequestedCount: 0,
      videoReadyCount: 0,
      socialPublishedCount: 0,
      errors: ["Pipeline disabled by config."],
    };
  }
  if (!force && triggerSource === "scheduled" && await hasCoachGPipelineRunForDate(db, dateKey, "scheduled")) {
    return {
      runId,
      dateKey,
      status: "skipped",
      selectedGamesCount: 0,
      generatedItemsCount: 0,
      videoRequestedCount: 0,
      videoReadyCount: 0,
      socialPublishedCount: 0,
      errors: ["Scheduled pipeline already ran for this date."],
    };
  }

  await startCoachGPipelineRun(db, { runId, dateKey, triggerSource });

  let selectedGamesCount = 0;
  let generatedItemsCount = 0;
  let videoRequestedCount = 0;
  let videoReadyCount = 0;
  let socialPublishedCount = 0;

  try {
    const featured = await selectFeaturedGamesBySport({
      db,
      dateKey,
      enabledSports: config.enabledSports,
      perSport: 1,
    });
    const selected = gameId ? featured.filter((f) => f.gameId === gameId) : featured;
    selectedGamesCount = selected.length;

    let createdVideoCount = 0;
    for (const game of selected) {
      try {
        const analysis = await generateCoachGAnalysis({
          db,
          env,
          featuredGame: game,
        });
        const itemId = `${dateKey}:${game.sport}:${game.gameId}`;
        let videoStatus: CoachGFeaturedItemRecord["videoStatus"] = "pending";
        let videoJobId: string | null = null;
        let videoUrl: string | null = null;

        if (createdVideoCount < config.dailyMaxVideos && env.HEYGEN_API_KEY && env.HEYGEN_AVATAR_ID && env.HEYGEN_VOICE_NAME) {
          const job = await enqueueCoachGVideoScriptJob({
            db,
            env,
            gameId: analysis.game_id,
            scriptText: analysis.video_script,
            payloadId: analysis.source_payload_id || null,
          });
          videoJobId = job.id;
          videoStatus = job.status === "failed" ? "retry_pending" : job.status;
          videoUrl = job.videoUrl || null;
          createdVideoCount += 1;
          videoRequestedCount += 1;
          if (job.videoUrl) videoReadyCount += 1;
        } else {
          videoStatus = "retry_pending";
          errors.push(`${game.gameId}: video generation skipped (missing env or daily limit reached)`);
        }

        await upsertCoachGFeaturedItem(db, {
          itemId,
          dateKey,
          lane: "game_content",
          contentType: "game_preview",
          sport: analysis.sport,
          gameId: analysis.game_id,
          sourceRefType: "game_id",
          sourceRefId: analysis.game_id,
          homeTeam: analysis.teams.home,
          awayTeam: analysis.teams.away,
          headline: analysis.headline,
          shortSummary: analysis.short_summary,
          fullText: analysis.full_analysis_text,
          fullAnalysisText: analysis.full_analysis_text,
          videoScript: analysis.video_script,
          approvalStatus: "needs_review",
          publishDestinations: ["game_page", "homepage_featured", "social_optional"],
          publishStatus: config.shadowMode ? "draft" : "published_owned",
          videoJobId,
          videoStatus,
          videoUrl,
          socialStatusInstagram: "not_requested",
          socialStatusFacebook: "not_requested",
          socialStatusTiktok: "not_requested",
          sourcePayloadId: analysis.source_payload_id || null,
          metadataJson: JSON.stringify({
            selectorScore: game.score,
            selectorFactors: game.factors,
            generatedAt: analysis.created_at,
          }),
        });
        generatedItemsCount += 1;
      } catch (error) {
        errors.push(`${game.gameId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!config.shadowMode) {
      await publishCoachGToOwnedChannels({ db, dateKey });
      const social = await publishCoachGToSocialPlatforms({ db, env, dateKey, force: false });
      socialPublishedCount = social.publishedCount;
      errors.push(...social.errors);
    }

    const status: CoachGDailyPipelineResult["status"] = errors.length > 0 ? "failed" : "completed";
    await completeCoachGPipelineRun(db, {
      status,
      selectedGamesCount,
      generatedItemsCount,
      videoRequestedCount,
      videoReadyCount,
      socialPublishedCount,
      errorsJson: errors.length > 0 ? JSON.stringify(errors) : null,
    });
    return {
      runId,
      dateKey,
      status,
      selectedGamesCount,
      generatedItemsCount,
      videoRequestedCount,
      videoReadyCount,
      socialPublishedCount,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(msg);
    await completeCoachGPipelineRun(db, {
      status: "failed",
      selectedGamesCount,
      generatedItemsCount,
      videoRequestedCount,
      videoReadyCount,
      socialPublishedCount,
      errorsJson: JSON.stringify(errors),
    });
    return {
      runId,
      dateKey,
      status: "failed",
      selectedGamesCount,
      generatedItemsCount,
      videoRequestedCount,
      videoReadyCount,
      socialPublishedCount,
      errors,
    };
  }
}

