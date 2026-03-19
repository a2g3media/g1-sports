import { getPoolTypeByKey, getTemplateForPoolType } from "../../shared/poolTypeCatalog";
import { generatePoolRuleEngineOutput, type PoolRuleEngineOutput, type RuleUserState } from "../../shared/poolRuleEngine";

interface LeagueRecord {
  id: number;
  sport_key: string;
  format_key: string;
  rules_json: string | null;
}

function parseSettings(rulesJson?: string | null): Record<string, unknown> {
  if (!rulesJson) return {};
  try {
    const parsed = JSON.parse(rulesJson);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export async function buildPoolRuleEngineForLeague(args: {
  env: Env;
  leagueId: string | number;
  userId: string | number;
  periodId?: string | null;
}): Promise<PoolRuleEngineOutput | null> {
  const league = await args.env.DB.prepare(`
    SELECT id, sport_key, format_key, rules_json
    FROM leagues
    WHERE id = ?
    LIMIT 1
  `).bind(args.leagueId).first<LeagueRecord>();
  if (!league) return null;

  const settings = parseSettings(league.rules_json);
  const typeDef = getPoolTypeByKey(league.format_key);
  const template = getTemplateForPoolType(league.format_key);
  const scheduleType = typeDef?.schedule_type || ["weekly"];

  let periodId = (args.periodId || "").trim();
  if (!periodId) {
    const upcoming = await args.env.DB.prepare(`
      SELECT period_id
      FROM events
      WHERE sport_key = ? AND start_at >= datetime('now')
      ORDER BY start_at ASC
      LIMIT 1
    `).bind(league.sport_key).first<{ period_id: string | null }>();
    periodId = String(upcoming?.period_id || "").trim();
  }
  if (!periodId) {
    const latest = await args.env.DB.prepare(`
      SELECT period_id
      FROM events
      WHERE sport_key = ?
      ORDER BY start_at DESC
      LIMIT 1
    `).bind(league.sport_key).first<{ period_id: string | null }>();
    periodId = String(latest?.period_id || "").trim();
  }

  const userState: RuleUserState = {
    currentPeriod: periodId || undefined,
    usedSelections: [],
  };

  const allUserPicks = await args.env.DB.prepare(`
    SELECT pick_value, period_id
    FROM picks
    WHERE league_id = ? AND user_id = ?
  `).bind(args.leagueId, args.userId).all<{ pick_value: string; period_id: string }>();
  userState.usedSelections = (allUserPicks.results || [])
    .map((row) => String(row.pick_value || "").trim())
    .filter(Boolean);

  if (periodId) {
    const userPicksForPeriod = await args.env.DB.prepare(`
      SELECT p.pick_value, p.event_id, p.period_id
      FROM picks p
      WHERE p.league_id = ? AND p.user_id = ? AND p.period_id = ?
    `).bind(args.leagueId, args.userId, periodId).all<{ pick_value: string; event_id: number; period_id: string }>();
    userState.picksSubmittedCount = (userPicksForPeriod.results || []).length;

    const duplicateRows = await args.env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT pick_value
        FROM picks
        WHERE league_id = ? AND user_id = ? AND period_id = ?
        GROUP BY pick_value
        HAVING COUNT(*) > 1
      ) d
    `).bind(args.leagueId, args.userId, periodId).first<{ count: number }>();
    userState.duplicatePickCount = Number(duplicateRows?.count || 0);

    const eligibleEvents = await args.env.DB.prepare(`
      SELECT id, status
      FROM events
      WHERE sport_key = ? AND period_id = ?
    `).bind(league.sport_key, periodId).all<{ id: number; status: string | null }>();
    const events = eligibleEvents.results || [];
    const openEvents = events.filter((event) => {
      const status = normalizeStatus(event.status);
      return status === "SCHEDULED" || status === "NOT_STARTED";
    });
    userState.eligibleEventsCount = openEvents.length;
    userState.missedPicksCount = Math.max(0, openEvents.length - Number(userState.picksSubmittedCount || 0));

    const eventIds = new Set(events.map((event) => Number(event.id)));
    userState.invalidSelectionCount = (userPicksForPeriod.results || []).reduce((count, pick) => {
      return eventIds.has(Number(pick.event_id)) ? count : count + 1;
    }, 0);

    userState.canceledGamesCount = events.reduce((count, event) => {
      const status = normalizeStatus(event.status);
      return status === "CANCELED" || status === "CANCELLED" ? count + 1 : count;
    }, 0);
    userState.postponedGamesCount = events.reduce((count, event) => {
      const status = normalizeStatus(event.status);
      return status === "POSTPONED" || status === "DELAYED" ? count + 1 : count;
    }, 0);
  }

  const tiedGames = await args.env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE sport_key = ?
      AND period_id = COALESCE(?, period_id)
      AND status IN ('final', 'completed', 'FINAL', 'COMPLETED')
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND home_score = away_score
  `).bind(league.sport_key, periodId || null).first<{ count: number }>();
  userState.tiedGamesCount = Number(tiedGames?.count || 0);

  const membership = await args.env.DB.prepare(`
    SELECT lm.created_at AS joined_at,
      (
        SELECT MIN(start_at)
        FROM events e
        WHERE e.sport_key = l.sport_key
      ) AS first_event_at
    FROM league_members lm
    INNER JOIN leagues l ON l.id = lm.league_id
    WHERE lm.league_id = ? AND lm.user_id = ?
    LIMIT 1
  `).bind(args.leagueId, args.userId).first<{ joined_at: string | null; first_event_at: string | null }>();
  const joinedAtMs = Date.parse(String(membership?.joined_at || ""));
  const firstEventMs = Date.parse(String(membership?.first_event_at || ""));
  userState.lateEntry = Number.isFinite(joinedAtMs) && Number.isFinite(firstEventMs) ? joinedAtMs > firstEventMs : false;

  if (template === "survivor" || template === "last_man_standing") {
    const survivorEntry = await args.env.DB.prepare(`
      SELECT lives_remaining, is_eliminated
      FROM survivor_entries
      WHERE league_id = ? AND user_id = ?
      ORDER BY entry_number DESC
      LIMIT 1
    `).bind(args.leagueId, args.userId).first<{ lives_remaining: number | null; is_eliminated: number | null }>();
    if (survivorEntry) {
      userState.livesRemaining = Number(survivorEntry.lives_remaining ?? 0);
      userState.totalLives = Number(settings.survivorLives ?? settings.lives ?? (userState.livesRemaining || 1));
      userState.isEliminated = Number(survivorEntry.is_eliminated || 0) === 1;
    }
  }

  const streakState = await args.env.DB.prepare(`
    SELECT
      COALESCE(MAX(current_streak), 0) AS current_streak,
      COALESCE(MAX(best_streak), 0) AS best_streak
    FROM standings
    WHERE league_id = ? AND user_id = ?
  `).bind(args.leagueId, args.userId).first<{ current_streak: number | null; best_streak: number | null }>().catch(() => null);
  if (streakState) {
    userState.currentStreak = Number(streakState.current_streak || 0);
    userState.maxStreak = Number(streakState.best_streak || 0);
  }

  return generatePoolRuleEngineOutput({
    template,
    scheduleType,
    settings,
    userState,
  });
}
