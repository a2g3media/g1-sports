export type CoachGFeaturedPublishStatus = "draft" | "published_app" | "published_site" | "published_owned" | "archived";
export type CoachGVideoStatus = "pending" | "queued" | "submitted" | "completed" | "failed" | "retry_pending";
export type CoachGSocialStatus = "not_requested" | "queued" | "published" | "failed" | "retry_pending";
export type CoachGSocialPlatform = "instagram" | "facebook" | "tiktok";
export type CoachGContentLane = "game_content" | "betting_intelligence" | "watchboard_live";
export type CoachGContentType = "game_preview" | "sharp_money" | "edges" | "line_movement" | "prop_watch" | "market_insight" | "live_alert";

export interface CoachGFeaturedItemRecord {
  itemId: string;
  dateKey: string;
  lane: CoachGContentLane;
  contentType: CoachGContentType;
  sport: string;
  gameId: string;
  sourceRefType: string | null;
  sourceRefId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  headline: string;
  shortSummary: string;
  fullText: string;
  fullAnalysisText: string;
  videoScript: string;
  approvalStatus: "needs_review" | "approved" | "rejected" | "held";
  publishDestinations: string[];
  publishStatus: CoachGFeaturedPublishStatus;
  videoJobId: string | null;
  videoStatus: CoachGVideoStatus;
  videoUrl: string | null;
  socialStatusInstagram: CoachGSocialStatus;
  socialStatusFacebook: CoachGSocialStatus;
  socialStatusTiktok: CoachGSocialStatus;
  sourcePayloadId: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachGSocialPostRecord {
  postJobId: string;
  itemId: string;
  platform: CoachGSocialPlatform;
  status: CoachGSocialStatus | "queued";
  captionText: string | null;
  postId: string | null;
  responseJson: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachGPipelineRunRecord {
  runId: string;
  dateKey: string;
  triggerSource: string;
  status: "running" | "completed" | "failed";
  selectedGamesCount: number;
  generatedItemsCount: number;
  videoRequestedCount: number;
  videoReadyCount: number;
  socialPublishedCount: number;
  errorsJson: string | null;
  startedAt: string;
  finishedAt: string | null;
}

type QueryResults<T> = { results?: T[] };
let ensureFeaturedSchemaPromise: Promise<void> | null = null;

function isDuplicateColumnError(error: unknown): boolean {
  const text = String(error || "").toLowerCase();
  return text.includes("duplicate column name");
}

async function ensureColumn(db: D1Database, sql: string): Promise<void> {
  try {
    await db.prepare(sql).run();
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
}

async function ensureCoachGFeaturedSchema(db: D1Database): Promise<void> {
  if (ensureFeaturedSchemaPromise) {
    await ensureFeaturedSchemaPromise;
    return;
  }
  ensureFeaturedSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS coachg_featured_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL UNIQUE,
        date_key TEXT NOT NULL,
        lane TEXT NOT NULL DEFAULT 'game_content',
        content_type TEXT NOT NULL DEFAULT 'game_preview',
        sport TEXT NOT NULL,
        game_id TEXT NOT NULL,
        source_ref_type TEXT,
        source_ref_id TEXT,
        home_team TEXT,
        away_team TEXT,
        headline TEXT NOT NULL,
        short_summary TEXT NOT NULL,
        full_text TEXT,
        full_analysis_text TEXT NOT NULL,
        video_script TEXT NOT NULL,
        approval_status TEXT NOT NULL DEFAULT 'needs_review',
        publish_destinations TEXT NOT NULL DEFAULT '["game_page","homepage_featured","social_optional"]',
        publish_status TEXT NOT NULL DEFAULT 'draft',
        video_job_id TEXT,
        video_status TEXT NOT NULL DEFAULT 'pending',
        video_url TEXT,
        social_status_instagram TEXT NOT NULL DEFAULT 'not_requested',
        social_status_facebook TEXT NOT NULL DEFAULT 'not_requested',
        social_status_tiktok TEXT NOT NULL DEFAULT 'not_requested',
        source_payload_id TEXT,
        metadata_json TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN lane TEXT NOT NULL DEFAULT 'game_content'`);
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN content_type TEXT NOT NULL DEFAULT 'game_preview'`);
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN source_ref_type TEXT`);
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN source_ref_id TEXT`);
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN full_text TEXT`);
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'needs_review'`);
    await ensureColumn(db, `ALTER TABLE coachg_featured_items ADD COLUMN publish_destinations TEXT NOT NULL DEFAULT '["game_page","homepage_featured","social_optional"]'`);
    await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_coachg_featured_items_date_sport ON coachg_featured_items(date_key, sport)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_publish_status ON coachg_featured_items(publish_status)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_video_status ON coachg_featured_items(video_status)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_game_id ON coachg_featured_items(game_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_lane ON coachg_featured_items(lane)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_content_type ON coachg_featured_items(content_type)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_approval_status ON coachg_featured_items(approval_status)`).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS coachg_social_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_job_id TEXT NOT NULL UNIQUE,
        item_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        caption_text TEXT,
        post_id TEXT,
        response_json TEXT,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_social_posts_item_id ON coachg_social_posts(item_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_social_posts_platform_status ON coachg_social_posts(platform, status)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_social_posts_next_retry ON coachg_social_posts(next_retry_at)`).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS coachg_pipeline_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL UNIQUE,
        date_key TEXT NOT NULL,
        trigger_source TEXT NOT NULL DEFAULT 'scheduled',
        status TEXT NOT NULL DEFAULT 'running',
        selected_games_count INTEGER NOT NULL DEFAULT 0,
        generated_items_count INTEGER NOT NULL DEFAULT 0,
        video_requested_count INTEGER NOT NULL DEFAULT 0,
        video_ready_count INTEGER NOT NULL DEFAULT 0,
        social_published_count INTEGER NOT NULL DEFAULT 0,
        errors_json TEXT,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_coachg_pipeline_runs_date_source ON coachg_pipeline_runs(date_key, trigger_source)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coachg_pipeline_runs_status ON coachg_pipeline_runs(status)`).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS coachg_pipeline_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT NOT NULL UNIQUE,
        config_value TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare(`
      INSERT OR IGNORE INTO coachg_pipeline_config (config_key, config_value) VALUES
        ('enabled', 'true'),
        ('daily_max_videos', '12'),
        ('enabled_sports', '["nba","nfl","mlb","nhl","soccer","golf","mma","ncaab"]'),
        ('platform_instagram_enabled', 'true'),
        ('platform_facebook_enabled', 'true'),
        ('platform_tiktok_enabled', 'true'),
        ('shadow_mode', 'false')
    `).run();
  })().catch((error) => {
    ensureFeaturedSchemaPromise = null;
    throw error;
  });
  await ensureFeaturedSchemaPromise;
}

function mapFeaturedRow(row: Record<string, unknown>): CoachGFeaturedItemRecord {
  const publishDestinationsRaw = typeof row.publish_destinations === "string" ? row.publish_destinations : null;
  let publishDestinations: string[] = [];
  if (publishDestinationsRaw) {
    try {
      const parsed = JSON.parse(publishDestinationsRaw);
      publishDestinations = Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      publishDestinations = [];
    }
  }
  const fullText = typeof row.full_text === "string" && row.full_text.trim().length > 0
    ? row.full_text
    : String(row.full_analysis_text || "");
  return {
    itemId: String(row.item_id || ""),
    dateKey: String(row.date_key || ""),
    lane: String(row.lane || "game_content") as CoachGContentLane,
    contentType: String(row.content_type || "game_preview") as CoachGContentType,
    sport: String(row.sport || ""),
    gameId: String(row.game_id || ""),
    sourceRefType: typeof row.source_ref_type === "string" ? row.source_ref_type : null,
    sourceRefId: typeof row.source_ref_id === "string" ? row.source_ref_id : null,
    homeTeam: typeof row.home_team === "string" ? row.home_team : null,
    awayTeam: typeof row.away_team === "string" ? row.away_team : null,
    headline: String(row.headline || ""),
    shortSummary: String(row.short_summary || ""),
    fullText,
    fullAnalysisText: String(row.full_analysis_text || ""),
    videoScript: String(row.video_script || ""),
    approvalStatus: String(row.approval_status || "needs_review") as CoachGFeaturedItemRecord["approvalStatus"],
    publishDestinations,
    publishStatus: String(row.publish_status || "draft") as CoachGFeaturedPublishStatus,
    videoJobId: typeof row.video_job_id === "string" ? row.video_job_id : null,
    videoStatus: String(row.video_status || "pending") as CoachGVideoStatus,
    videoUrl: typeof row.video_url === "string" ? row.video_url : null,
    socialStatusInstagram: String(row.social_status_instagram || "not_requested") as CoachGSocialStatus,
    socialStatusFacebook: String(row.social_status_facebook || "not_requested") as CoachGSocialStatus,
    socialStatusTiktok: String(row.social_status_tiktok || "not_requested") as CoachGSocialStatus,
    sourcePayloadId: typeof row.source_payload_id === "string" ? row.source_payload_id : null,
    metadataJson: typeof row.metadata_json === "string" ? row.metadata_json : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function todayDateKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

export async function getCoachGPipelineConfig(db: D1Database): Promise<Record<string, string>> {
  await ensureCoachGFeaturedSchema(db);
  const rows = await db.prepare(`
    SELECT config_key, config_value
    FROM coachg_pipeline_config
  `).all<QueryResults<{ config_key: string; config_value: string }>>();
  const output: Record<string, string> = {};
  for (const row of rows.results || []) {
    output[row.config_key] = row.config_value;
  }
  return output;
}

export async function setCoachGPipelineConfig(
  db: D1Database,
  updates: Record<string, string>
): Promise<void> {
  await ensureCoachGFeaturedSchema(db);
  const keys = Object.keys(updates);
  for (const key of keys) {
    await db.prepare(`
      INSERT INTO coachg_pipeline_config (config_key, config_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(config_key) DO UPDATE SET
        config_value = excluded.config_value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, updates[key]).run();
  }
}

export async function upsertCoachGFeaturedItem(
  db: D1Database,
  input: Omit<CoachGFeaturedItemRecord, "createdAt" | "updatedAt">
): Promise<CoachGFeaturedItemRecord> {
  await ensureCoachGFeaturedSchema(db);
  const fullText = input.fullText || input.fullAnalysisText;
  const fullAnalysisText = input.fullAnalysisText || input.fullText;
  const publishDestinations = JSON.stringify(input.publishDestinations || []);
  await db.prepare(`
    INSERT INTO coachg_featured_items (
      item_id, date_key, lane, content_type, sport, game_id, source_ref_type, source_ref_id,
      home_team, away_team, headline, short_summary, full_text, full_analysis_text,
      video_script, approval_status, publish_destinations, publish_status, video_job_id, video_status, video_url, social_status_instagram,
      social_status_facebook, social_status_tiktok, source_payload_id, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(item_id) DO UPDATE SET
      date_key = excluded.date_key,
      lane = excluded.lane,
      content_type = excluded.content_type,
      sport = excluded.sport,
      game_id = excluded.game_id,
      source_ref_type = excluded.source_ref_type,
      source_ref_id = excluded.source_ref_id,
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      headline = excluded.headline,
      short_summary = excluded.short_summary,
      full_text = excluded.full_text,
      full_analysis_text = excluded.full_analysis_text,
      video_script = excluded.video_script,
      approval_status = excluded.approval_status,
      publish_destinations = excluded.publish_destinations,
      publish_status = excluded.publish_status,
      video_job_id = excluded.video_job_id,
      video_status = excluded.video_status,
      video_url = excluded.video_url,
      social_status_instagram = excluded.social_status_instagram,
      social_status_facebook = excluded.social_status_facebook,
      social_status_tiktok = excluded.social_status_tiktok,
      source_payload_id = excluded.source_payload_id,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    input.itemId,
    input.dateKey,
    input.lane,
    input.contentType,
    input.sport,
    input.gameId,
    input.sourceRefType,
    input.sourceRefId,
    input.homeTeam,
    input.awayTeam,
    input.headline,
    input.shortSummary,
    fullText,
    fullAnalysisText,
    input.videoScript,
    input.approvalStatus,
    publishDestinations,
    input.publishStatus,
    input.videoJobId,
    input.videoStatus,
    input.videoUrl,
    input.socialStatusInstagram,
    input.socialStatusFacebook,
    input.socialStatusTiktok,
    input.sourcePayloadId,
    input.metadataJson
  ).run();

  const row = await db.prepare(`
    SELECT *
    FROM coachg_featured_items
    WHERE item_id = ?
    LIMIT 1
  `).bind(input.itemId).first<Record<string, unknown>>();
  return mapFeaturedRow(row || {});
}

export async function listCoachGFeaturedItems(
  db: D1Database,
  options: {
    dateKey?: string;
    sport?: string;
    lane?: CoachGContentLane;
    contentType?: CoachGContentType;
    approvalStatus?: CoachGFeaturedItemRecord["approvalStatus"];
    limit?: number;
    publishStatus?: CoachGFeaturedPublishStatus;
  } = {}
): Promise<CoachGFeaturedItemRecord[]> {
  await ensureCoachGFeaturedSchema(db);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
  const dateKey = options.dateKey || todayDateKey();
  const clauses = ["date_key = ?"];
  const values: Array<string | number> = [dateKey];
  if (options.sport) {
    clauses.push("sport = ?");
    values.push(options.sport.toLowerCase());
  }
  if (options.lane) {
    clauses.push("lane = ?");
    values.push(options.lane);
  }
  if (options.contentType) {
    clauses.push("content_type = ?");
    values.push(options.contentType);
  }
  if (options.approvalStatus) {
    clauses.push("approval_status = ?");
    values.push(options.approvalStatus);
  }
  if (options.publishStatus) {
    clauses.push("publish_status = ?");
    values.push(options.publishStatus);
  }
  values.push(limit);
  const sql = `
    SELECT *
    FROM coachg_featured_items
    WHERE ${clauses.join(" AND ")}
    ORDER BY sport ASC, updated_at DESC
    LIMIT ?
  `;
  const rows = await db.prepare(sql).bind(...values).all<QueryResults<Record<string, unknown>>>();
  return (rows.results || []).map(mapFeaturedRow);
}

export async function getCoachGFeaturedItemById(db: D1Database, itemId: string): Promise<CoachGFeaturedItemRecord | null> {
  await ensureCoachGFeaturedSchema(db);
  const row = await db.prepare(`
    SELECT *
    FROM coachg_featured_items
    WHERE item_id = ?
    LIMIT 1
  `).bind(itemId).first<Record<string, unknown>>();
  return row ? mapFeaturedRow(row) : null;
}

export async function updateCoachGFeaturedItemStates(
  db: D1Database,
  itemId: string,
  updates: Partial<Pick<CoachGFeaturedItemRecord, "publishStatus" | "videoJobId" | "videoStatus" | "videoUrl" | "socialStatusInstagram" | "socialStatusFacebook" | "socialStatusTiktok" | "metadataJson" | "approvalStatus" | "publishDestinations">>
): Promise<void> {
  await ensureCoachGFeaturedSchema(db);
  const publishDestinations = updates.publishDestinations ? JSON.stringify(updates.publishDestinations) : null;
  await db.prepare(`
    UPDATE coachg_featured_items
    SET publish_status = COALESCE(?, publish_status),
        video_job_id = COALESCE(?, video_job_id),
        video_status = COALESCE(?, video_status),
        video_url = COALESCE(?, video_url),
        social_status_instagram = COALESCE(?, social_status_instagram),
        social_status_facebook = COALESCE(?, social_status_facebook),
        social_status_tiktok = COALESCE(?, social_status_tiktok),
        approval_status = COALESCE(?, approval_status),
        publish_destinations = COALESCE(?, publish_destinations),
        metadata_json = COALESCE(?, metadata_json),
        updated_at = CURRENT_TIMESTAMP
    WHERE item_id = ?
  `).bind(
    updates.publishStatus ?? null,
    updates.videoJobId ?? null,
    updates.videoStatus ?? null,
    updates.videoUrl ?? null,
    updates.socialStatusInstagram ?? null,
    updates.socialStatusFacebook ?? null,
    updates.socialStatusTiktok ?? null,
    updates.approvalStatus ?? null,
    publishDestinations,
    updates.metadataJson ?? null,
    itemId
  ).run();
}

export async function updateCoachGFeaturedItemEditorial(
  db: D1Database,
  itemId: string,
  updates: Partial<Pick<CoachGFeaturedItemRecord, "headline" | "shortSummary" | "fullAnalysisText" | "videoScript">>
): Promise<void> {
  await ensureCoachGFeaturedSchema(db);
  await db.prepare(`
    UPDATE coachg_featured_items
    SET headline = COALESCE(?, headline),
        short_summary = COALESCE(?, short_summary),
        full_analysis_text = COALESCE(?, full_analysis_text),
        video_script = COALESCE(?, video_script),
        updated_at = CURRENT_TIMESTAMP
    WHERE item_id = ?
  `).bind(
    updates.headline ?? null,
    updates.shortSummary ?? null,
    updates.fullAnalysisText ?? null,
    updates.videoScript ?? null,
    itemId
  ).run();
}

export async function logCoachGSocialPost(
  db: D1Database,
  input: Omit<CoachGSocialPostRecord, "createdAt" | "updatedAt">
): Promise<void> {
  await ensureCoachGFeaturedSchema(db);
  await db.prepare(`
    INSERT INTO coachg_social_posts (
      post_job_id, item_id, platform, status, caption_text, post_id, response_json, error_message, retry_count, next_retry_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(post_job_id) DO UPDATE SET
      status = excluded.status,
      caption_text = excluded.caption_text,
      post_id = excluded.post_id,
      response_json = excluded.response_json,
      error_message = excluded.error_message,
      retry_count = excluded.retry_count,
      next_retry_at = excluded.next_retry_at,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    input.postJobId,
    input.itemId,
    input.platform,
    input.status,
    input.captionText,
    input.postId,
    input.responseJson,
    input.errorMessage,
    input.retryCount,
    input.nextRetryAt
  ).run();
}

export async function listCoachGSocialPostsForItem(db: D1Database, itemId: string): Promise<CoachGSocialPostRecord[]> {
  await ensureCoachGFeaturedSchema(db);
  const rows = await db.prepare(`
    SELECT post_job_id, item_id, platform, status, caption_text, post_id, response_json, error_message, retry_count, next_retry_at, created_at, updated_at
    FROM coachg_social_posts
    WHERE item_id = ?
    ORDER BY created_at DESC
  `).bind(itemId).all<QueryResults<Record<string, unknown>>>();
  return (rows.results || []).map((row) => ({
    postJobId: String(row.post_job_id || ""),
    itemId: String(row.item_id || ""),
    platform: String(row.platform || "instagram") as CoachGSocialPlatform,
    status: String(row.status || "queued") as CoachGSocialPostRecord["status"],
    captionText: typeof row.caption_text === "string" ? row.caption_text : null,
    postId: typeof row.post_id === "string" ? row.post_id : null,
    responseJson: typeof row.response_json === "string" ? row.response_json : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    retryCount: Number(row.retry_count || 0),
    nextRetryAt: typeof row.next_retry_at === "string" ? row.next_retry_at : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  }));
}

export async function startCoachGPipelineRun(
  db: D1Database,
  input: Pick<CoachGPipelineRunRecord, "runId" | "dateKey" | "triggerSource">
): Promise<void> {
  await ensureCoachGFeaturedSchema(db);
  await db.prepare(`
    INSERT INTO coachg_pipeline_runs (run_id, date_key, trigger_source, status, started_at, updated_at)
    VALUES (?, ?, ?, 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(run_id) DO UPDATE SET
      status = 'running',
      updated_at = CURRENT_TIMESTAMP
  `).bind(input.runId, input.dateKey, input.triggerSource).run();
}

export async function completeCoachGPipelineRun(
  db: D1Database,
  runId: string,
  updates: Pick<CoachGPipelineRunRecord, "status" | "selectedGamesCount" | "generatedItemsCount" | "videoRequestedCount" | "videoReadyCount" | "socialPublishedCount" | "errorsJson">
): Promise<void> {
  await ensureCoachGFeaturedSchema(db);
  await db.prepare(`
    UPDATE coachg_pipeline_runs
    SET status = ?,
        selected_games_count = ?,
        generated_items_count = ?,
        video_requested_count = ?,
        video_ready_count = ?,
        social_published_count = ?,
        errors_json = ?,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE run_id = ?
  `).bind(
    updates.status,
    updates.selectedGamesCount,
    updates.generatedItemsCount,
    updates.videoRequestedCount,
    updates.videoReadyCount,
    updates.socialPublishedCount,
    updates.errorsJson,
    runId
  ).run();
}

export async function hasCoachGPipelineRunForDate(
  db: D1Database,
  dateKey: string,
  triggerSource = "scheduled"
): Promise<boolean> {
  await ensureCoachGFeaturedSchema(db);
  const row = await db.prepare(`
    SELECT id
    FROM coachg_pipeline_runs
    WHERE date_key = ? AND trigger_source = ? AND status IN ('running', 'completed')
    LIMIT 1
  `).bind(dateKey, triggerSource).first<{ id: number }>();
  return Boolean(row?.id);
}

