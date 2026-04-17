// @ts-nocheck
import type { IntelligencePayload } from "../types/intelligencePayload";
import { enforceInformationalClosing, sanitizeCoachGText } from "./coachgCompliance";
import { generateCoachGVideo } from "./coachGVideoGeneratorService";
import { fetchLiveGamesWithFallback, fetchScheduledGamesWithFallback } from "./providers";

export interface HeyGenVideoJob {
  id: string;
  script: string;
  gameId: string;
  status: "queued" | "submitted" | "completed" | "failed";
  heygenVideoId?: string;
  videoUrl?: string;
  socialStatus?: "not_requested" | "queued" | "published" | "failed";
  socialResponse?: string | null;
  reviewStatus?: "pending_review" | "approved" | "rejected";
  reviewNotes?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
}

const MAX_DAILY_VIDEOS = 200;
type HeyGenStatusResponse = {
  data?: { status?: string; video_url?: string };
  status?: string;
  video_url?: string;
};
interface VideoJobRow {
  job_id: string;
  game_id: string;
  script_text: string;
  status: string;
  heygen_video_id: string | null;
  video_url: string | null;
  social_status: string | null;
  social_response: string | null;
  review_status: string | null;
  review_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
type QueryResults<T> = { results?: T[] };
export interface ListHeyGenJobsOptions {
  limit?: number;
  gameId?: string;
  windowHours?: number;
  viewerTzOffsetMin?: number;
  fullHistory?: boolean;
}

export interface CoachGVideoOpsSummary {
  totals: {
    all: number;
    queued: number;
    submitted: number;
    completed: number;
    failed: number;
  };
  social: {
    notRequested: number;
    queued: number;
    published: number;
    failed: number;
  };
  rolling24h: {
    all: number;
    completed: number;
    failed: number;
  };
  todaySlate: {
    totalGames: number;
    withVideoJobs: number;
    missingVideos: number;
    scope?: "provider_live" | "provider_upcoming" | "local_day" | "upcoming_window" | "recent_fallback";
  };
}

export interface CoachGMissingVideoGame {
  gameId: string;
  league: string | null;
  awayTeam: string | null;
  homeTeam: string | null;
  startTime: string | null;
  latestJobStatus: HeyGenVideoJob["status"] | null;
}

export interface CoachGFailedRetryCandidate {
  gameId: string;
  latestJobStatus: HeyGenVideoJob["status"];
}

export interface CoachGRetryCooldownCheck {
  allowed: boolean;
  cooldownMinutes: number;
  retryAfterSeconds: number;
  latestJobId: string | null;
  latestCreatedAt: string | null;
}

interface TableInfoRow {
  name: string;
}

let ensureSchemaPromise: Promise<void> | null = null;

async function ensureCoachGVideoJobsSchema(db: D1Database): Promise<void> {
  if (ensureSchemaPromise) {
    await ensureSchemaPromise;
    return;
  }
  ensureSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS coachg_video_jobs (
        job_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        payload_id TEXT,
        script_text TEXT NOT NULL,
        heygen_video_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        video_url TEXT,
        social_status TEXT NOT NULL DEFAULT 'not_requested',
        social_response TEXT,
        error_message TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_coachg_video_jobs_created_at
      ON coachg_video_jobs(created_at DESC)
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_coachg_video_jobs_game_id
      ON coachg_video_jobs(game_id)
    `).run();

    const tableInfo = await db.prepare(`PRAGMA table_info(coachg_video_jobs)`).all<TableInfoRow>();
    const columnNames = new Set((tableInfo.results || []).map((row) => String(row.name || "")));
    if (!columnNames.has("social_status")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN social_status TEXT NOT NULL DEFAULT 'not_requested'`).run();
    }
    if (!columnNames.has("social_response")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN social_response TEXT`).run();
    }
    if (!columnNames.has("error_message")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN error_message TEXT`).run();
    }
    if (!columnNames.has("updated_at")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`).run();
    }
    if (!columnNames.has("review_status")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending_review'`).run();
    }
    if (!columnNames.has("review_notes")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN review_notes TEXT`).run();
    }
    if (!columnNames.has("approved_by")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN approved_by TEXT`).run();
    }
    if (!columnNames.has("approved_at")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN approved_at DATETIME`).run();
    }
    if (!columnNames.has("rejected_by")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN rejected_by TEXT`).run();
    }
    if (!columnNames.has("rejected_at")) {
      await db.prepare(`ALTER TABLE coachg_video_jobs ADD COLUMN rejected_at DATETIME`).run();
    }
  })().catch((error) => {
    ensureSchemaPromise = null;
    throw error;
  });
  await ensureSchemaPromise;
}

function normalizeStatus(status: string): HeyGenVideoJob["status"] {
  if (status === "submitted" || status === "completed" || status === "failed") return status;
  return "queued";
}

function normalizeSocialStatus(status: string | null): NonNullable<HeyGenVideoJob["socialStatus"]> {
  if (status === "queued" || status === "published" || status === "failed") return status;
  return "not_requested";
}

function normalizeReviewStatus(status: string | null): NonNullable<HeyGenVideoJob["reviewStatus"]> {
  if (status === "approved" || status === "rejected") return status;
  return "pending_review";
}

function mapRowToJob(row: VideoJobRow): HeyGenVideoJob {
  return {
    id: row.job_id,
    script: row.script_text,
    gameId: row.game_id,
    status: normalizeStatus(row.status),
    heygenVideoId: row.heygen_video_id || undefined,
    videoUrl: row.video_url || undefined,
    socialStatus: normalizeSocialStatus(row.social_status),
    socialResponse: row.social_response,
    reviewStatus: normalizeReviewStatus(row.review_status),
    reviewNotes: row.review_notes,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getDailyJobCount(db: D1Database): Promise<number> {
  const countRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM coachg_video_jobs
    WHERE DATE(created_at) = DATE('now')
  `).first<{ count: number }>();
  return Number(countRow?.count || 0);
}

async function insertVideoJob(params: {
  db: D1Database;
  jobId: string;
  gameId: string;
  payloadId?: string | null;
  script: string;
}): Promise<void> {
  const { db, jobId, gameId, payloadId, script } = params;
  await db.prepare(`
    INSERT INTO coachg_video_jobs (
      job_id,
      game_id,
      payload_id,
      script_text,
      status,
      social_status,
      review_status
    )
    VALUES (?, ?, ?, ?, 'queued', 'not_requested', 'pending_review')
  `).bind(jobId, gameId, payloadId || null, script).run();
}

async function updateVideoJob(params: {
  db: D1Database;
  jobId: string;
  status?: string;
  heygenVideoId?: string | null;
  videoUrl?: string | null;
  socialStatus?: string;
  socialResponse?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const {
    db,
    jobId,
    status,
    heygenVideoId,
    videoUrl,
    socialStatus,
    socialResponse,
    errorMessage,
  } = params;
  await db.prepare(`
    UPDATE coachg_video_jobs
    SET status = COALESCE(?, status),
        heygen_video_id = COALESCE(?, heygen_video_id),
        video_url = COALESCE(?, video_url),
        social_status = COALESCE(?, social_status),
        social_response = COALESCE(?, social_response),
        error_message = COALESCE(?, error_message),
        updated_at = CURRENT_TIMESTAMP
    WHERE job_id = ?
  `).bind(
    status ?? null,
    heygenVideoId ?? null,
    videoUrl ?? null,
    socialStatus ?? null,
    socialResponse ?? null,
    errorMessage ?? null,
    jobId
  ).run();
}

async function getVideoJobRow(db: D1Database, jobId: string): Promise<VideoJobRow | null> {
  const row = await db.prepare(`
    SELECT job_id, game_id, script_text, status, heygen_video_id, video_url, social_status, social_response, review_status, review_notes, approved_by, approved_at, rejected_by, rejected_at, error_message, created_at, updated_at
    FROM coachg_video_jobs
    WHERE job_id = ?
    LIMIT 1
  `).bind(jobId).first<VideoJobRow>();
  return row || null;
}

export async function getHeyGenVideoJobById(db: D1Database, jobId: string): Promise<HeyGenVideoJob | null> {
  await ensureCoachGVideoJobsSchema(db);
  const row = await getVideoJobRow(db, jobId);
  return row ? mapRowToJob(row) : null;
}

export async function setCoachGVideoJobReview(params: {
  db: D1Database;
  jobId: string;
  action: "approve" | "reject";
  actorUserId: string;
  notes?: string | null;
}): Promise<HeyGenVideoJob | null> {
  const { db, jobId, action, actorUserId, notes } = params;
  await ensureCoachGVideoJobsSchema(db);
  const existing = await getVideoJobRow(db, jobId);
  if (!existing) return null;

  if (action === "approve") {
    await db.prepare(`
      UPDATE coachg_video_jobs
      SET review_status = 'approved',
          review_notes = ?,
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP,
          rejected_by = NULL,
          rejected_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `).bind(notes || null, actorUserId, jobId).run();
  } else {
    await db.prepare(`
      UPDATE coachg_video_jobs
      SET review_status = 'rejected',
          review_notes = ?,
          rejected_by = ?,
          rejected_at = CURRENT_TIMESTAMP,
          approved_by = NULL,
          approved_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `).bind(notes || null, actorUserId, jobId).run();
  }

  const updated = await getVideoJobRow(db, jobId);
  return updated ? mapRowToJob(updated) : null;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

export function buildCoachGVideoScript(payload: IntelligencePayload): string {
  const topSignal = payload.sharp_signals[0];
  const topProp = payload.prop_edges[0];
  const secondProp = payload.prop_edges[1];
  const sport = String(payload.sport || "").trim().toUpperCase();
  const actionables = (payload.actionable_intel || []).filter(Boolean).slice(0, 3);
  const line = payload.line_prediction;
  const edgeScore = Number(payload.edge_score || 0);
  const title = String(payload.title || "this matchup");
  const sections = [
    "What's up G1, Coach G here.",
    `Let's break down ${title}${sport ? ` in ${sport}` : ""}.`,
    edgeScore > 0
      ? `Current model edge score sits at ${edgeScore}, so there is real signal here but still game-state risk.`
      : "This matchup is still tightening, so read this as a live risk-adjusted scouting report.",
    topSignal
      ? `First market signal: ${topSignal.summary}`
      : "No major sharp anomaly yet, but market context is active and likely to move near tip.",
    line.current_line !== null && line.projected_line !== null
      ? `Line movement note: current number is ${line.current_line}, with projection toward ${line.projected_line}. Confidence is ${Math.round(Number(line.confidence || 0))} percent.`
      : "Line projection is still developing from the current market inputs.",
    topProp
      ? `Prop watch: ${topProp.player} ${topProp.prop}, with edge score ${topProp.edge_score}.`
      : "Prop board is balanced right now, so keep watching for movement into game time.",
    secondProp
      ? `Secondary prop angle: ${secondProp.player} ${secondProp.prop}, currently showing an edge score of ${secondProp.edge_score}.`
      : "Secondary prop market is mixed, so prioritize confirmation from rotation and pace.",
    actionables.length
      ? `Execution plan: ${actionables.join(" ")}`
      : "Execution plan: track opening pace, monitor late availability updates, and watch for a first-quarter line overreaction.",
    sport
      ? `Sport context check: this ${sport} matchup can swing quickly on pace, rotation decisions, and in-game adjustment windows.`
      : "Sport context check: this matchup can swing quickly on pace, rotation decisions, and in-game adjustment windows.",
    "If the first six to eight minutes break opposite the expected tempo, treat that as a live adjustment trigger.",
    "That is your full matchup story for this game. Stay disciplined, protect your downside, and I will update if the market shifts.",
  ];
  const raw = sections.join(" ");
  const clean = enforceInformationalClosing(sanitizeCoachGText(raw));
  const words = clean.split(/\s+/).filter(Boolean);
  // Target longer story format for higher production value videos (~45-80s).
  if (words.length <= 240) return clean;
  return `${words.slice(0, 240).join(" ")}.`;
}

export async function enqueueHeyGenVideoJob(params: {
  db: D1Database;
  env: Env;
  payload: IntelligencePayload;
  gameId: string;
}): Promise<HeyGenVideoJob> {
  const { db, env, payload, gameId } = params;
  await ensureCoachGVideoJobsSchema(db);
  const id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : `${todayKey()}:${gameId}:${Date.now()}`;
  const script = buildCoachGVideoScript(payload);
  await insertVideoJob({
    db,
    jobId: id,
    gameId,
    payloadId: payload.id,
    script,
  });

  const todayJobs = await getDailyJobCount(db);
  if (todayJobs > MAX_DAILY_VIDEOS) {
    await updateVideoJob({
      db,
      jobId: id,
      status: "failed",
      errorMessage: `Daily cap exceeded (${MAX_DAILY_VIDEOS})`,
    });
    const capped = await getVideoJobRow(db, id);
    return capped ? mapRowToJob(capped) : {
      id, script, gameId, status: "failed", createdAt: new Date().toISOString(), errorMessage: "Daily cap exceeded",
    };
  }

  if (!env.HEYGEN_API_KEY) {
    const queued = await getVideoJobRow(db, id);
    return queued ? mapRowToJob(queued) : {
      id, script, gameId, status: "queued", createdAt: new Date().toISOString(),
    };
  }

  try {
    const generated = await generateCoachGVideo(script, {
      HEYGEN_API_KEY: env.HEYGEN_API_KEY,
      HEYGEN_AVATAR_ID: env.HEYGEN_AVATAR_ID,
      HEYGEN_VOICE_NAME: env.HEYGEN_VOICE_NAME,
      HEYGEN_VOICE_ID: env.HEYGEN_VOICE_ID,
    });
    const heygenVideoId = generated.video_id;
    await updateVideoJob({
      db,
      jobId: id,
      status: generated.video_url ? "completed" : (heygenVideoId ? "submitted" : "failed"),
      heygenVideoId: heygenVideoId || null,
      videoUrl: generated.video_url || null,
      errorMessage: heygenVideoId ? null : "Missing heygen video_id in response",
    });
  } catch (error) {
    await updateVideoJob({
      db,
      jobId: id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "HeyGen request failed",
    });
  }

  const saved = await getVideoJobRow(db, id);
  return saved ? mapRowToJob(saved) : {
    id, script, gameId, status: "failed", createdAt: new Date().toISOString(), errorMessage: "Unable to load saved job",
  };
}

export async function enqueueCoachGVideoScriptJob(params: {
  db: D1Database;
  env: Env;
  gameId: string;
  scriptText: string;
  payloadId?: string | null;
}): Promise<HeyGenVideoJob> {
  const { db, env, gameId, scriptText, payloadId } = params;
  await ensureCoachGVideoJobsSchema(db);
  const id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : `${todayKey()}:${gameId}:${Date.now()}`;
  const script = enforceInformationalClosing(sanitizeCoachGText(scriptText || ""));
  await insertVideoJob({
    db,
    jobId: id,
    gameId,
    payloadId: payloadId || null,
    script,
  });

  const todayJobs = await getDailyJobCount(db);
  if (todayJobs > MAX_DAILY_VIDEOS) {
    await updateVideoJob({
      db,
      jobId: id,
      status: "failed",
      errorMessage: `Daily cap exceeded (${MAX_DAILY_VIDEOS})`,
    });
    const capped = await getVideoJobRow(db, id);
    return capped ? mapRowToJob(capped) : {
      id, script, gameId, status: "failed", createdAt: new Date().toISOString(), errorMessage: "Daily cap exceeded",
    };
  }

  if (!env.HEYGEN_API_KEY) {
    await updateVideoJob({
      db,
      jobId: id,
      status: "queued",
      errorMessage: "HEYGEN_API_KEY missing",
    });
    const queued = await getVideoJobRow(db, id);
    return queued ? mapRowToJob(queued) : {
      id, script, gameId, status: "queued", createdAt: new Date().toISOString(),
    };
  }

  try {
    const generated = await generateCoachGVideo(script, {
      HEYGEN_API_KEY: env.HEYGEN_API_KEY,
      HEYGEN_AVATAR_ID: env.HEYGEN_AVATAR_ID,
      HEYGEN_VOICE_NAME: env.HEYGEN_VOICE_NAME,
      HEYGEN_VOICE_ID: env.HEYGEN_VOICE_ID,
    });
    const heygenVideoId = generated.video_id;
    await updateVideoJob({
      db,
      jobId: id,
      status: generated.video_url ? "completed" : (heygenVideoId ? "submitted" : "failed"),
      heygenVideoId: heygenVideoId || null,
      videoUrl: generated.video_url || null,
      errorMessage: heygenVideoId ? null : "Missing heygen video_id in response",
    });
  } catch (error) {
    await updateVideoJob({
      db,
      jobId: id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "HeyGen request failed",
    });
  }

  const saved = await getVideoJobRow(db, id);
  return saved ? mapRowToJob(saved) : {
    id, script, gameId, status: "failed", createdAt: new Date().toISOString(), errorMessage: "Unable to load saved job",
  };
}

export async function refreshHeyGenVideoJobStatus(params: {
  db: D1Database;
  env: Env;
  jobId: string;
}): Promise<HeyGenVideoJob | null> {
  const { db, env, jobId } = params;
  await ensureCoachGVideoJobsSchema(db);
  const row = await getVideoJobRow(db, jobId);
  if (!row) return null;
  const current = mapRowToJob(row);
  if (!current.heygenVideoId || !env.HEYGEN_API_KEY) return current;
  if (current.status === "completed" || current.status === "failed") return current;

  try {
    const url = `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(current.heygenVideoId)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Api-Key": env.HEYGEN_API_KEY,
      },
    });
    if (!res.ok) return current;
    const body = await res.json() as HeyGenStatusResponse;
    const status = String(body?.data?.status || body?.status || "").toLowerCase();
    if (status === "completed") {
      await updateVideoJob({
        db,
        jobId,
        status: "completed",
        videoUrl: String(body?.data?.video_url || body?.video_url || ""),
      });
    } else if (status === "failed" || status === "error") {
      await updateVideoJob({
        db,
        jobId,
        status: "failed",
        errorMessage: "HeyGen marked job failed",
      });
    } else {
      await updateVideoJob({
        db,
        jobId,
        status: "submitted",
      });
    }
    const updated = await getVideoJobRow(db, jobId);
    return updated ? mapRowToJob(updated) : current;
  } catch {
    return current;
  }
}

export async function listHeyGenJobs(
  db: D1Database,
  options: ListHeyGenJobsOptions = {}
): Promise<HeyGenVideoJob[]> {
  await ensureCoachGVideoJobsSchema(db);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 50)));
  const gameId = options.gameId;
  const fullHistory = options.fullHistory === true;
  const viewerTzOffsetMin = Number.isFinite(options.viewerTzOffsetMin) ? Number(options.viewerTzOffsetMin) : 0;
  const windowHours = Math.max(1, Math.min(168, Number(options.windowHours || 24)));
  const hasGameFilter = Boolean(gameId);
  const sql = fullHistory
    ? hasGameFilter
      ? `
      SELECT job_id, game_id, script_text, status, heygen_video_id, video_url, social_status, social_response, review_status, review_notes, approved_by, approved_at, rejected_by, rejected_at, error_message, created_at, updated_at
      FROM coachg_video_jobs
      WHERE game_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      : `
      SELECT job_id, game_id, script_text, status, heygen_video_id, video_url, social_status, social_response, review_status, review_notes, approved_by, approved_at, rejected_by, rejected_at, error_message, created_at, updated_at
      FROM coachg_video_jobs
      ORDER BY created_at DESC
      LIMIT ?
    `
    : hasGameFilter
    ? `
      SELECT job_id, game_id, script_text, status, heygen_video_id, video_url, social_status, social_response, review_status, review_notes, approved_by, approved_at, rejected_by, rejected_at, error_message, created_at, updated_at
      FROM coachg_video_jobs
      WHERE game_id = ?
        AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `
    : `
      SELECT job_id, game_id, script_text, status, heygen_video_id, video_url, social_status, social_response, review_status, review_notes, approved_by, approved_at, rejected_by, rejected_at, error_message, created_at, updated_at
      FROM coachg_video_jobs
      WHERE created_at >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `;
  const statement = db.prepare(sql);
  const hourModifier = `-${windowHours} hours`;
  const rows = (fullHistory
    ? hasGameFilter
      ? await statement.bind(gameId, limit).all<{ results?: VideoJobRow[] }>()
      : await statement.bind(limit).all<{ results?: VideoJobRow[] }>()
    : hasGameFilter
      ? await statement.bind(gameId, hourModifier, limit).all<{ results?: VideoJobRow[] }>()
      : await statement.bind(hourModifier, limit).all<{ results?: VideoJobRow[] }>());
  const mapped = (rows.results || []).map(mapRowToJob);
  if (fullHistory) return mapped;

  const shiftedDayKey = (dateLike: string | number): string => {
    const raw = new Date(dateLike);
    const baseMs = Number.isNaN(raw.getTime()) ? Date.now() : raw.getTime();
    const shifted = new Date(baseMs - viewerTzOffsetMin * 60_000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  };
  const today = shiftedDayKey(Date.now());
  return mapped.sort((a, b) => {
    const aToday = shiftedDayKey(a.createdAt) === today ? 0 : 1;
    const bToday = shiftedDayKey(b.createdAt) === today ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    const aTs = new Date(a.createdAt).getTime();
    const bTs = new Date(b.createdAt).getTime();
    return (Number.isNaN(bTs) ? 0 : bTs) - (Number.isNaN(aTs) ? 0 : aTs);
  });
}

export async function publishHeyGenVideoToSocial(params: {
  db: D1Database;
  env: Env;
  jobId: string;
}): Promise<HeyGenVideoJob | null> {
  const { db, env, jobId } = params;
  await ensureCoachGVideoJobsSchema(db);
  const current = await refreshHeyGenVideoJobStatus({ db, env, jobId });
  if (!current) return null;
  if (current.status !== "completed" || !current.videoUrl) {
    await updateVideoJob({
      db,
      jobId,
      socialStatus: "failed",
      socialResponse: "Video must be completed before social publish",
    });
    const failed = await getVideoJobRow(db, jobId);
    return failed ? mapRowToJob(failed) : current;
  }
  if (!env.SOCIAL_CAMPAIGN_WEBHOOK_URL) {
    await updateVideoJob({
      db,
      jobId,
      socialStatus: "queued",
      socialResponse: "Webhook not configured. Marked queued for manual campaign publish.",
    });
    const queued = await getVideoJobRow(db, jobId);
    return queued ? mapRowToJob(queued) : current;
  }

  try {
    const res = await fetch(env.SOCIAL_CAMPAIGN_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.SOCIAL_CAMPAIGN_API_KEY ? { Authorization: `Bearer ${env.SOCIAL_CAMPAIGN_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        source: "coachg",
        job_id: current.id,
        game_id: current.gameId,
        video_url: current.videoUrl,
        script: current.script,
      }),
    });
    if (!res.ok) {
      await updateVideoJob({
        db,
        jobId,
        socialStatus: "failed",
        socialResponse: `Webhook HTTP ${res.status}`,
      });
    } else {
      const bodyText = await res.text();
      await updateVideoJob({
        db,
        jobId,
        socialStatus: "published",
        socialResponse: bodyText.slice(0, 1000),
      });
    }
  } catch {
    await updateVideoJob({
      db,
      jobId,
      socialStatus: "failed",
      socialResponse: "Webhook call failed",
    });
  }

  const updated = await getVideoJobRow(db, jobId);
  return updated ? mapRowToJob(updated) : current;
}

export async function publishPendingCompletedVideosToSocial(params: {
  db: D1Database;
  env: Env;
  limit?: number;
}): Promise<HeyGenVideoJob[]> {
  const { db, env, limit = 20 } = params;
  await ensureCoachGVideoJobsSchema(db);
  const rows = await db.prepare(`
    SELECT job_id, game_id, script_text, status, heygen_video_id, video_url, social_status, social_response, review_status, review_notes, approved_by, approved_at, rejected_by, rejected_at, error_message, created_at, updated_at
    FROM coachg_video_jobs
    WHERE status = 'completed' AND COALESCE(social_status, 'not_requested') = 'not_requested'
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all<VideoJobRow>();

  const published: HeyGenVideoJob[] = [];
  for (const row of (rows.results || [])) {
    const result = await publishHeyGenVideoToSocial({
      db,
      env,
      jobId: row.job_id,
    });
    if (result) published.push(result);
  }
  return published;
}

interface CountRow {
  count: number;
}

interface TodaySlateGameRow {
  provider_game_id: string | null;
  league: string | null;
  away_team: string | null;
  home_team: string | null;
  start_time: string | null;
}

interface VideoOpsSlateGamesResult {
  games: Array<{
    gameId: string;
    league: string | null;
    awayTeam: string | null;
    homeTeam: string | null;
    startTime: string | null;
  }>;
  scope: "provider_live" | "provider_upcoming" | "local_day" | "upcoming_window" | "recent_fallback";
}

interface LatestJobRow {
  job_id?: string;
  game_id: string;
  status: string;
  created_at?: string;
}

function tzShiftModifier(viewerTzOffsetMin = 0): string {
  const safeOffset = Number.isFinite(viewerTzOffsetMin) ? Number(viewerTzOffsetMin) : 0;
  const shifted = -safeOffset;
  return `${shifted} minutes`;
}

async function fetchVideoOpsSlateGames(
  db: D1Database,
  tzModifier: string,
  limit = 200
): Promise<VideoOpsSlateGamesResult> {
  const safeLimit = Math.max(1, Math.min(400, Number(limit || 200)));

  // Provider-first slate selection so video ops is aligned with live API feeds.
  try {
    const live = await fetchLiveGamesWithFallback({
      sports: ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer"],
    });
    const liveGames = (live.data || [])
      .slice(0, safeLimit)
      .map((game) => ({
        gameId: String(game.game_id || ""),
        league: game.league ? String(game.league) : null,
        awayTeam: game.away_team_name ? String(game.away_team_name) : null,
        homeTeam: game.home_team_name ? String(game.home_team_name) : null,
        startTime: game.start_time ? String(game.start_time) : null,
      }))
      .filter((game) => Boolean(game.gameId));
    if (liveGames.length > 0) {
      return { games: liveGames, scope: "provider_live" };
    }

    const upcoming = await fetchScheduledGamesWithFallback({
      sports: ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer"],
      hours: 36,
    });
    const upcomingGames = (upcoming.data || [])
      .slice(0, safeLimit)
      .map((game) => ({
        gameId: String(game.game_id || ""),
        league: game.league ? String(game.league) : null,
        awayTeam: game.away_team_name ? String(game.away_team_name) : null,
        homeTeam: game.home_team_name ? String(game.home_team_name) : null,
        startTime: game.start_time ? String(game.start_time) : null,
      }))
      .filter((game) => Boolean(game.gameId));
    if (upcomingGames.length > 0) {
      return { games: upcomingGames, scope: "provider_upcoming" };
    }
  } catch {
    // Fall through to legacy DB-backed fallback.
  }

  const mapRows = (rows: TodaySlateGameRow[]) => rows
    .filter((row) => Boolean(row.provider_game_id))
    .map((row) => ({
      gameId: String(row.provider_game_id),
      league: row.league,
      awayTeam: row.away_team,
      homeTeam: row.home_team,
      startTime: row.start_time,
    }));

  const localDayResult = await db.prepare(`
    SELECT provider_game_id, league, away_team, home_team, start_time
    FROM sdio_games
    WHERE provider_game_id IS NOT NULL
      AND DATE(start_time, ?) = DATE('now', ?)
    ORDER BY start_time ASC
    LIMIT ?
  `).bind(tzModifier, tzModifier, safeLimit).all<TodaySlateGameRow>();
  const localDayGames = mapRows(localDayResult.results || []);
  if (localDayGames.length > 0) {
    return { games: localDayGames, scope: "local_day" };
  }

  const upcomingResult = await db.prepare(`
    SELECT provider_game_id, league, away_team, home_team, start_time
    FROM sdio_games
    WHERE provider_game_id IS NOT NULL
      AND start_time >= datetime('now', '-3 hours')
      AND start_time <= datetime('now', '+36 hours')
    ORDER BY start_time ASC
    LIMIT ?
  `).bind(safeLimit).all<TodaySlateGameRow>();
  const upcomingGames = mapRows(upcomingResult.results || []);
  if (upcomingGames.length > 0) {
    return { games: upcomingGames, scope: "upcoming_window" };
  }

  const recentResult = await db.prepare(`
    SELECT provider_game_id, league, away_team, home_team, start_time
    FROM sdio_games
    WHERE provider_game_id IS NOT NULL
    ORDER BY start_time DESC
    LIMIT ?
  `).bind(Math.min(50, safeLimit)).all<TodaySlateGameRow>();
  const recentGames = mapRows(recentResult.results || []);
  return { games: recentGames, scope: "recent_fallback" };
}

function toJobStatus(value: string | null | undefined): HeyGenVideoJob["status"] | null {
  if (!value) return null;
  if (value === "submitted" || value === "completed" || value === "failed") return value;
  if (value === "queued") return "queued";
  return null;
}

export async function checkCoachGVideoRetryCooldown(
  db: D1Database,
  gameId: string,
  cooldownMinutes = 10
): Promise<CoachGRetryCooldownCheck> {
  await ensureCoachGVideoJobsSchema(db);
  const safeCooldownMinutes = Math.max(1, Math.min(120, Number(cooldownMinutes || 10)));
  const thresholdModifier = `-${safeCooldownMinutes} minutes`;

  const latest = await db.prepare(`
    SELECT job_id, created_at
    FROM coachg_video_jobs
    WHERE game_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(gameId).first<{ job_id: string | null; created_at: string | null }>();

  if (!latest?.created_at) {
    return {
      allowed: true,
      cooldownMinutes: safeCooldownMinutes,
      retryAfterSeconds: 0,
      latestJobId: latest?.job_id || null,
      latestCreatedAt: null,
    };
  }

  const isBlocked = await db.prepare(`
    SELECT 1 AS blocked
    FROM coachg_video_jobs
    WHERE game_id = ?
      AND created_at = ?
      AND created_at >= datetime('now', ?)
    LIMIT 1
  `).bind(gameId, latest.created_at, thresholdModifier).first<{ blocked?: number }>();

  if (!isBlocked?.blocked) {
    return {
      allowed: true,
      cooldownMinutes: safeCooldownMinutes,
      retryAfterSeconds: 0,
      latestJobId: latest.job_id || null,
      latestCreatedAt: latest.created_at,
    };
  }

  const secondsUntilOpen = await db.prepare(`
    SELECT MAX(0, CAST((strftime('%s', datetime(?, ?)) - strftime('%s', 'now')) AS INTEGER)) AS retry_after_seconds
  `).bind(latest.created_at, `+${safeCooldownMinutes} minutes`).first<{ retry_after_seconds?: number }>();

  return {
    allowed: false,
    cooldownMinutes: safeCooldownMinutes,
    retryAfterSeconds: Number(secondsUntilOpen?.retry_after_seconds || 0),
    latestJobId: latest.job_id || null,
    latestCreatedAt: latest.created_at,
  };
}

export async function getCoachGVideoOpsSummary(
  db: D1Database,
  options: { viewerTzOffsetMin?: number } = {}
): Promise<CoachGVideoOpsSummary> {
  await ensureCoachGVideoJobsSchema(db);
  const tzModifier = tzShiftModifier(options.viewerTzOffsetMin);

  const [
    allCount,
    queuedCount,
    submittedCount,
    completedCount,
    failedCount,
    socialNotRequestedCount,
    socialQueuedCount,
    socialPublishedCount,
    socialFailedCount,
    rollingAllCount,
    rollingCompletedCount,
    rollingFailedCount,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE status = 'queued'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE status = 'submitted'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE status = 'completed'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE status = 'failed'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE COALESCE(social_status, 'not_requested') = 'not_requested'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE social_status = 'queued'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE social_status = 'published'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE social_status = 'failed'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE created_at >= datetime('now', '-24 hours')`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE created_at >= datetime('now', '-24 hours') AND status = 'completed'`).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM coachg_video_jobs WHERE created_at >= datetime('now', '-24 hours') AND status = 'failed'`).first<CountRow>(),
  ]);

  const slate = await fetchVideoOpsSlateGames(db, tzModifier, 200);
  const slateGames = slate.games;

  if (slateGames.length === 0) {
    return {
      totals: {
        all: Number(allCount?.count || 0),
        queued: Number(queuedCount?.count || 0),
        submitted: Number(submittedCount?.count || 0),
        completed: Number(completedCount?.count || 0),
        failed: Number(failedCount?.count || 0),
      },
      social: {
        notRequested: Number(socialNotRequestedCount?.count || 0),
        queued: Number(socialQueuedCount?.count || 0),
        published: Number(socialPublishedCount?.count || 0),
        failed: Number(socialFailedCount?.count || 0),
      },
      rolling24h: {
        all: Number(rollingAllCount?.count || 0),
        completed: Number(rollingCompletedCount?.count || 0),
        failed: Number(rollingFailedCount?.count || 0),
      },
      todaySlate: {
        totalGames: 0,
        withVideoJobs: 0,
        missingVideos: 0,
        scope: slate.scope,
      },
    };
  }

  const latestJobsResult = await db.prepare(`
    SELECT j.game_id, j.status
    FROM coachg_video_jobs j
    INNER JOIN (
      SELECT game_id, MAX(created_at) AS max_created_at
      FROM coachg_video_jobs
      WHERE DATE(created_at, ?) = DATE('now', ?)
      GROUP BY game_id
    ) latest
      ON latest.game_id = j.game_id
     AND latest.max_created_at = j.created_at
  `).bind(tzModifier, tzModifier).all<LatestJobRow>();
  const latestByGame = new Map<string, HeyGenVideoJob["status"]>();
  for (const row of latestJobsResult.results || []) {
    const normalized = toJobStatus(row.status);
    if (normalized) latestByGame.set(row.game_id, normalized);
  }

  const withVideoJobs = slateGames.reduce((count, game) => (latestByGame.has(game.gameId) ? count + 1 : count), 0);
  const missingVideos = Math.max(0, slateGames.length - withVideoJobs);

  return {
    totals: {
      all: Number(allCount?.count || 0),
      queued: Number(queuedCount?.count || 0),
      submitted: Number(submittedCount?.count || 0),
      completed: Number(completedCount?.count || 0),
      failed: Number(failedCount?.count || 0),
    },
    social: {
      notRequested: Number(socialNotRequestedCount?.count || 0),
      queued: Number(socialQueuedCount?.count || 0),
      published: Number(socialPublishedCount?.count || 0),
      failed: Number(socialFailedCount?.count || 0),
    },
    rolling24h: {
      all: Number(rollingAllCount?.count || 0),
      completed: Number(rollingCompletedCount?.count || 0),
      failed: Number(rollingFailedCount?.count || 0),
    },
    todaySlate: {
      totalGames: slateGames.length,
      withVideoJobs,
      missingVideos,
      scope: slate.scope,
    },
  };
}

export async function listMissingCoachGVideos(
  db: D1Database,
  options: { viewerTzOffsetMin?: number; limit?: number } = {}
): Promise<CoachGMissingVideoGame[]> {
  await ensureCoachGVideoJobsSchema(db);
  const tzModifier = tzShiftModifier(options.viewerTzOffsetMin);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const slate = await fetchVideoOpsSlateGames(db, tzModifier, limit);
  const games = slate.games;

  if (games.length === 0) return [];

  const latestJobsResult = await db.prepare(`
    SELECT j.game_id, j.status
    FROM coachg_video_jobs j
    INNER JOIN (
      SELECT game_id, MAX(created_at) AS max_created_at
      FROM coachg_video_jobs
      WHERE DATE(created_at, ?) = DATE('now', ?)
      GROUP BY game_id
    ) latest
      ON latest.game_id = j.game_id
     AND latest.max_created_at = j.created_at
  `).bind(tzModifier, tzModifier).all<LatestJobRow>();
  const latestByGame = new Map<string, HeyGenVideoJob["status"]>();
  for (const row of latestJobsResult.results || []) {
    latestByGame.set(row.game_id, toJobStatus(row.status) || "queued");
  }

  return games
    .filter((game) => !latestByGame.has(game.gameId))
    .map((game) => ({
      ...game,
      latestJobStatus: null,
    }));
}

export async function listFailedCoachGGameIdsForTodaySlate(
  db: D1Database,
  options: { viewerTzOffsetMin?: number; limit?: number } = {}
): Promise<CoachGFailedRetryCandidate[]> {
  await ensureCoachGVideoJobsSchema(db);
  const tzModifier = tzShiftModifier(options.viewerTzOffsetMin);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const slate = await fetchVideoOpsSlateGames(db, tzModifier, limit);
  const slateGameIds = slate.games.map((game) => game.gameId);
  if (slateGameIds.length === 0) return [];

  const latestJobsResult = await db.prepare(`
    SELECT j.game_id, j.status
    FROM coachg_video_jobs j
    INNER JOIN (
      SELECT game_id, MAX(created_at) AS max_created_at
      FROM coachg_video_jobs
      WHERE DATE(created_at, ?) = DATE('now', ?)
      GROUP BY game_id
    ) latest
      ON latest.game_id = j.game_id
     AND latest.max_created_at = j.created_at
  `).bind(tzModifier, tzModifier).all<LatestJobRow>();
  const latestByGame = new Map<string, HeyGenVideoJob["status"]>();
  for (const row of latestJobsResult.results || []) {
    const status = toJobStatus(row.status);
    if (status) latestByGame.set(row.game_id, status);
  }

  const failedGames: CoachGFailedRetryCandidate[] = [];
  for (const gameId of slateGameIds) {
    const status = latestByGame.get(gameId);
    if (status === "failed") {
      failedGames.push({
        gameId,
        latestJobStatus: status,
      });
      if (failedGames.length >= limit) break;
    }
  }
  return failedGames;
}
