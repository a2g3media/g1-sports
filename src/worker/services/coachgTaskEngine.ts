import { runCoachGBrain } from "./coachgBrainService";
import { enqueueHeyGenVideoJob, publishPendingCompletedVideosToSocial } from "./heygenVideoService";
import { runDailyCoachGPipeline } from "./coachgDailyPipelineService";

type Db = D1Database;
type QueryResults<T> = { results?: T[] };
interface ProviderGameIdRow {
  provider_game_id: string | null;
}

export type CoachGBackgroundTaskName =
  | "scan_line_movement"
  | "scan_prop_edges"
  | "scan_injury_updates"
  | "scan_watchboard_games"
  | "scan_sharp_signals"
  | "build_daily_briefs"
  | "build_market_movers"
  | "build_value_board";

export interface CoachGTaskResult {
  task: CoachGBackgroundTaskName;
  ranAt: string;
  scannedGames: number;
  producedPayloads: number;
  producedVideos?: number;
  errors: string[];
}

const TASK_LOCK_TTL_MS = 2 * 60 * 1000;
const taskLocks = new Map<CoachGBackgroundTaskName, number>();

function acquireTaskLock(task: CoachGBackgroundTaskName): boolean {
  const now = Date.now();
  const current = taskLocks.get(task);
  if (current && now - current < TASK_LOCK_TTL_MS) return false;
  taskLocks.set(task, now);
  return true;
}

function releaseTaskLock(task: CoachGBackgroundTaskName): void {
  taskLocks.delete(task);
}

async function topUpcomingGameIds(db: Db, limit = 10): Promise<string[]> {
  const localDayRows = await db.prepare(`
    SELECT provider_game_id
    FROM sdio_games
    WHERE DATE(start_time, 'localtime') = DATE('now', 'localtime')
    ORDER BY start_time ASC
    LIMIT ?
  `).bind(limit).all() as QueryResults<ProviderGameIdRow>;
  const localDayIds = (localDayRows.results || [])
    .map((r) => String(r.provider_game_id || ""))
    .filter((id: string) => id.length > 0);
  if (localDayIds.length > 0) return localDayIds;

  const rows = await db.prepare(`
    SELECT provider_game_id
    FROM sdio_games
    WHERE start_time >= datetime('now', '-3 hours')
    ORDER BY start_time ASC
    LIMIT ?
  `).bind(limit).all() as QueryResults<ProviderGameIdRow>;
  return (rows.results || [])
    .map((r) => String(r.provider_game_id || ""))
    .filter((id: string) => id.length > 0);
}

export async function runCoachGBackgroundTask(params: {
  db: Db;
  env: Env;
  task: CoachGBackgroundTaskName;
  gameIds?: string[];
}): Promise<CoachGTaskResult> {
  const { db, env, task } = params;
  if (!acquireTaskLock(task)) {
    return {
      task,
      ranAt: new Date().toISOString(),
      scannedGames: 0,
      producedPayloads: 0,
      errors: ["Task already running or recently completed."],
    };
  }

  const errors: string[] = [];
  let producedPayloads = 0;
  let producedVideos = 0;
  let scannedGames = 0;
  try {
    const gameIds = params.gameIds || await topUpcomingGameIds(db, task === "build_daily_briefs" ? 4 : 10);
    scannedGames = gameIds.length;
    for (const gameId of gameIds) {
      try {
        const queryByTask: Record<CoachGBackgroundTaskName, string> = {
          scan_line_movement: "line movement scan",
          scan_prop_edges: "prop edge scan",
          scan_injury_updates: "injury update scan",
          scan_watchboard_games: "watchboard scan",
          scan_sharp_signals: "sharp radar scan",
          build_daily_briefs: "daily briefing",
          build_market_movers: "market movers",
          build_value_board: "value board",
        };
        const payload = await runCoachGBrain({
          db,
          env,
          userId: null,
          surface: "global",
          gameId,
          query: queryByTask[task],
        });
        if (payload.intelligence_payload) {
          producedPayloads += 1;
          const shouldCreateVideo = task === "build_daily_briefs" || task === "build_market_movers" || task === "build_value_board";
          if (shouldCreateVideo) {
            const videoJob = await enqueueHeyGenVideoJob({
              db,
              env,
              payload: payload.intelligence_payload,
              gameId,
            });
            if (videoJob.status === "submitted" || videoJob.status === "queued") producedVideos += 1;
          }
        }
      } catch (error) {
        errors.push(`${gameId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    releaseTaskLock(task);
  }

  return {
    task,
    ranAt: new Date().toISOString(),
    scannedGames,
    producedPayloads,
    producedVideos,
    errors,
  };
}

export async function runCoachGScheduledPipeline(params: {
  db: Db;
  env: Env;
}): Promise<CoachGTaskResult[]> {
  const { db, env } = params;
  const tasks: CoachGBackgroundTaskName[] = [
    "scan_line_movement",
    "scan_prop_edges",
    "scan_watchboard_games",
    "scan_sharp_signals",
    "build_daily_briefs",
    "build_market_movers",
    "build_value_board",
  ];
  const results: CoachGTaskResult[] = [];
  for (const task of tasks) {
    results.push(await runCoachGBackgroundTask({ db, env, task }));
  }
  await runDailyCoachGPipeline({
    db,
    env,
    triggerSource: "scheduled",
    force: false,
  });
  if (env.SOCIAL_CAMPAIGN_WEBHOOK_URL) {
    await publishPendingCompletedVideosToSocial({ db, env, limit: 20 });
  }
  return results;
}
