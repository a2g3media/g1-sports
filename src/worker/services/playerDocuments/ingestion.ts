import type { Bindings } from "../../routes/player-profile";
import { isPlayerDocumentEnrichmentSatisfied } from "./playerDocumentStore";
import { runPlayerDocumentStages } from "./stagePipeline";

const PROFILE_SPORTS = ["NBA", "NFL", "MLB", "NHL", "NCAAB", "GOLF"] as const;

export type PropsFeedFetchFn = (pathWithQuery: string) => Promise<{
  ok: boolean;
  status: number;
  body: any;
}>;

export type QueueLane = "visible_roster" | "live_slate" | "background";
const DEFAULT_QUEUE_LANE: QueueLane = "background";
const DEAD_LETTER_STATUS = "dead_letter";
const MAX_QUEUE_ATTEMPTS = 6;

/**
 * Seed queue from today's props board (discovery only — no page-data).
 */
export async function enqueuePlayerDocumentsFromPropsFeed(
  db: D1Database,
  fetchFn: PropsFeedFetchFn
): Promise<{ enqueued: number }> {
  let enqueued = 0;
  await ensurePlayerDocumentQueueTable(db);
  for (const sport of PROFILE_SPORTS) {
    const res = await fetchFn(
      `/api/sports-data/props/today?sport=${encodeURIComponent(sport)}&limit=15000&offset=0`
    );
    if (!res.ok || !res.body) continue;
    const rows = Array.isArray(res.body.props) ? res.body.props : [];
    const seen = new Set<string>();
    for (const r of rows) {
      const name = String(r?.player_name || r?.playerName || "").trim();
      const id = String(r?.player_id || r?.playerId || "").trim();
      if (!name || !/^\d{3,}$/.test(id)) continue;
      const k = `${sport}:${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await enqueuePlayerDocumentBuild(db, sport, id, name);
      enqueued += 1;
    }
  }
  return { enqueued };
}

/**
 * @deprecated Prefer enqueue + processPlayerDocumentQueue. Kept for scripts/cron compatibility.
 */
export async function runPlayerDocumentIngestionFromProps(params: {
  db: D1Database;
  env: Bindings;
  origin: string;
  fetchFn: PropsFeedFetchFn;
  queueLimit?: number;
}): Promise<{
  enqueued: number;
  queue: { processed: number; ok: number; failed: number };
}> {
  const enqueued = (await enqueuePlayerDocumentsFromPropsFeed(params.db, params.fetchFn)).enqueued;
  const queue = await processPlayerDocumentQueue({
    db: params.db,
    env: params.env,
    origin: params.origin,
    limit: params.queueLimit ?? 150,
  });
  return { enqueued, queue };
}

/**
 * Lightweight queue table: enqueue (sport, player_id) for builds.
 * Idempotent UNIQUE(sport, player_id).
 */
export async function ensurePlayerDocumentQueueTable(db: D1Database): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS player_document_build_queue (sport TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT, lane TEXT NOT NULL DEFAULT 'background', status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 6, last_error TEXT, next_retry_at TEXT NOT NULL DEFAULT (datetime('now')), last_attempt_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (sport, player_id))"
  );
  try {
    await db.exec("ALTER TABLE player_document_build_queue ADD COLUMN lane TEXT NOT NULL DEFAULT 'background'");
  } catch {}
  try {
    await db.exec("ALTER TABLE player_document_build_queue ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 6");
  } catch {}
  try {
    await db.exec("ALTER TABLE player_document_build_queue ADD COLUMN next_retry_at TEXT NOT NULL DEFAULT (datetime('now'))");
  } catch {}
  try {
    await db.exec("ALTER TABLE player_document_build_queue ADD COLUMN last_attempt_at TEXT");
  } catch {}
  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_player_document_queue_retry ON player_document_build_queue(status, lane, next_retry_at, updated_at)"
  );
}

export async function enqueuePlayerDocumentBuild(
  db: D1Database,
  sport: string,
  playerId: string,
  playerName?: string,
  lane: QueueLane = DEFAULT_QUEUE_LANE
): Promise<void> {
  await ensurePlayerDocumentQueueTable(db);
  const s = String(sport || "").trim().toUpperCase();
  const id = String(playerId || "").trim();
  if (!s || s === "ALL" || !/^\d{3,}$/.test(id)) return;
  const name = String(playerName || "").trim();
  try {
    await db
      .prepare(
        `
      INSERT INTO player_document_build_queue (sport, player_id, player_name, lane, status, attempts, max_attempts, next_retry_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', 0, ?, datetime('now'), datetime('now'))
      ON CONFLICT(sport, player_id) DO UPDATE SET
        player_name = COALESCE(excluded.player_name, player_document_build_queue.player_name),
        lane = COALESCE(excluded.lane, player_document_build_queue.lane),
        status = CASE
          WHEN player_document_build_queue.status = 'done' THEN 'done'
          WHEN player_document_build_queue.status = '${DEAD_LETTER_STATUS}' THEN '${DEAD_LETTER_STATUS}'
          ELSE 'pending'
        END,
        next_retry_at = datetime('now'),
        updated_at = datetime('now')
    `
      )
      .bind(s, id, name || null, lane, MAX_QUEUE_ATTEMPTS)
      .run();
  } catch {
    // non-fatal
  }
}

export async function dequeuePendingPlayerDocumentJobs(
  db: D1Database,
  limit: number
): Promise<Array<{
  sport: string;
  player_id: string;
  player_name: string | null;
  attempts: number;
  lane: QueueLane;
  max_attempts: number;
}>> {
  await ensurePlayerDocumentQueueTable(db);
  try {
    const { results } = await db
      .prepare(
        `SELECT sport, player_id, player_name, attempts, lane, max_attempts
         FROM player_document_build_queue
         WHERE status = 'pending' AND datetime(next_retry_at) <= datetime('now')
         ORDER BY CASE lane
            WHEN 'visible_roster' THEN 0
            WHEN 'live_slate' THEN 1
            ELSE 2
         END ASC, updated_at ASC
         LIMIT ?`
      )
      .bind(Math.max(1, Math.min(200, limit)))
      .all<{
        sport: string;
        player_id: string;
        player_name: string | null;
        attempts: number;
        lane: QueueLane;
        max_attempts: number;
      }>();
    return results || [];
  } catch {
    return [];
  }
}

export async function markPlayerDocumentJobDone(db: D1Database, sport: string, playerId: string): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE player_document_build_queue
         SET status = 'done', next_retry_at = datetime('now'), updated_at = datetime('now')
         WHERE sport = ? AND player_id = ?`
      )
      .bind(String(sport).toUpperCase(), String(playerId).trim())
      .run();
  } catch {
    // non-fatal
  }
}

export async function markPlayerDocumentJobError(
  db: D1Database,
  sport: string,
  playerId: string,
  err: string,
  attempts: number,
  maxAttempts: number
): Promise<void> {
  const nextAttempts = attempts + 1;
  if (nextAttempts >= maxAttempts) {
    try {
      await db
        .prepare(
          `UPDATE player_document_build_queue
           SET status = '${DEAD_LETTER_STATUS}', attempts = ?, last_error = ?, updated_at = datetime('now')
           WHERE sport = ? AND player_id = ?`
        )
        .bind(nextAttempts, String(err).slice(0, 500), String(sport).toUpperCase(), String(playerId).trim())
        .run();
      return;
    } catch {
      // non-fatal
    }
  }
  const backoffSeconds = Math.min(600, 30 * Math.max(1, nextAttempts));
  try {
    await db
      .prepare(
        `UPDATE player_document_build_queue
         SET status = 'pending',
             attempts = ?,
             last_error = ?,
             next_retry_at = datetime('now', ?),
             last_attempt_at = datetime('now'),
             updated_at = datetime('now')
         WHERE sport = ? AND player_id = ?`
      )
      .bind(
        nextAttempts,
        String(err).slice(0, 500),
        `+${backoffSeconds} seconds`,
        String(sport).toUpperCase(),
        String(playerId).trim()
      )
      .run();
  } catch {
    // non-fatal
  }
}

/**
 * Queue processor: ONLY `buildPlayerDocument` (direct providers → player_documents).
 */
export async function processPlayerDocumentQueue(params: {
  db: D1Database;
  env: Bindings;
  origin: string;
  limit?: number;
}): Promise<{ processed: number; ok: number; failed: number }> {
  const rows = await dequeuePendingPlayerDocumentJobs(params.db, params.limit ?? 80);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const sport = row.sport;
    const pid = row.player_id;
    const maxAttempts = Math.max(1, Number(row.max_attempts || MAX_QUEUE_ATTEMPTS));
    if (await isPlayerDocumentEnrichmentSatisfied(params.db, sport, pid)) {
      ok += 1;
      await markPlayerDocumentJobDone(params.db, sport, pid);
      continue;
    }
    const staged = await runPlayerDocumentStages({
      db: params.db,
      env: params.env,
      sport,
      playerId: pid,
      playerNameHint: row.player_name,
      origin: params.origin,
    });
    if (staged.ok) {
      const satisfied = await isPlayerDocumentEnrichmentSatisfied(params.db, sport, pid);
      if (satisfied) {
        ok += 1;
        await markPlayerDocumentJobDone(params.db, sport, pid);
      } else {
        failed += 1;
        await markPlayerDocumentJobError(
          params.db,
          sport,
          pid,
          "incomplete_enrichment",
          Number(row.attempts ?? 0),
          maxAttempts
        );
      }
    } else {
      failed += 1;
      const lastStageFailure = staged.stages.find((stage) => !stage.ok)?.reason || "stage_pipeline_failed";
      await markPlayerDocumentJobError(
        params.db,
        sport,
        pid,
        lastStageFailure,
        Number(row.attempts ?? 0),
        maxAttempts
      );
    }
  }
  return { processed: rows.length, ok, failed };
}

export async function replayDeadLetterPlayerDocumentJobs(
  db: D1Database,
  limit: number
): Promise<{ replayed: number }> {
  await ensurePlayerDocumentQueueTable(db);
  const capped = Math.max(1, Math.min(200, limit));
  try {
    const { results } = await db
      .prepare(
        `SELECT sport, player_id
         FROM player_document_build_queue
         WHERE status = '${DEAD_LETTER_STATUS}'
         ORDER BY updated_at ASC
         LIMIT ?`
      )
      .bind(capped)
      .all<{ sport: string; player_id: string }>();
    let replayed = 0;
    for (const row of results || []) {
      await db
        .prepare(
          `UPDATE player_document_build_queue
           SET status = 'pending', attempts = 0, next_retry_at = datetime('now'), updated_at = datetime('now')
           WHERE sport = ? AND player_id = ?`
        )
        .bind(String(row.sport || "").toUpperCase(), String(row.player_id || "").trim())
        .run();
      replayed += 1;
    }
    return { replayed };
  } catch {
    return { replayed: 0 };
  }
}
