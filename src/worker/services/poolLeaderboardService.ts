/**
 * Pool Leaderboard Service
 *
 * Pool-type-aware leaderboard with:
 * - Weekly + season + bundle + tournament views
 * - Rank movement tracking
 * - Drop worst / Best X support
 * - Multi-entry independence
 * - Survivor remaining count
 */

// ─── Types ──────────────────────────────────────────────────────

export interface PoolLeaderboardEntry {
  rank: number;
  previous_rank: number | null;
  rank_delta: number;
  entry_id: number;
  user_id: string;
  display_name: string;
  entry_name: string | null;
  avatar_url: string | null;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  win_percentage: number;
  current_streak: number;
  longest_streak: number;
  is_eliminated: boolean;
  lives_remaining: number | null;
  periods_played: number;
  dropped_periods: number;
  is_current_user: boolean;
}

export interface PoolLeaderboardResult {
  entries: PoolLeaderboardEntry[];
  current_user_entry: PoolLeaderboardEntry | null;
  total_entries: number;
  view: "weekly" | "season" | "bundle" | "tournament" | "survival";
  period_id: string | null;
  last_updated: string;
}

// ─── Weekly Leaderboard ─────────────────────────────────────────

export async function getWeeklyLeaderboard(
  db: D1Database,
  leagueId: number,
  periodId: string,
  currentUserId: string,
  limit = 100,
): Promise<PoolLeaderboardResult> {
  const rows = await db.prepare(`
    SELECT
      pews.pool_entry_id as entry_id,
      CAST(pews.user_id AS TEXT) as user_id,
      u.display_name,
      u.avatar_url,
      pe.entry_name,
      pews.rank,
      pews.rank_delta,
      pews.points_earned,
      pews.total_points,
      pews.correct_picks,
      pews.total_picks,
      pews.win_percentage,
      pes.current_win_streak,
      pes.longest_win_streak,
      pes.is_eliminated,
      pes.lives_remaining
    FROM pool_entry_weekly_stats pews
    JOIN pool_entries pe ON pews.pool_entry_id = pe.id
    JOIN pool_entry_stats pes ON pews.pool_entry_id = pes.pool_entry_id
    JOIN users u ON pews.user_id = CAST(u.id AS TEXT)
    WHERE pews.league_id = ? AND pews.period_id = ?
    ORDER BY pews.rank ASC
    LIMIT ?
  `).bind(leagueId, periodId, limit).all<{
    entry_id: number; user_id: string; display_name: string | null; avatar_url: string | null;
    entry_name: string | null; rank: number; rank_delta: number | null;
    points_earned: number; total_points: number; correct_picks: number; total_picks: number;
    win_percentage: number; current_win_streak: number; longest_win_streak: number;
    is_eliminated: number; lives_remaining: number | null;
  }>();

  const entries: PoolLeaderboardEntry[] = (rows.results || []).map((row) => ({
    rank: row.rank || 0,
    previous_rank: row.rank_delta !== null ? (row.rank || 0) + (row.rank_delta || 0) : null,
    rank_delta: -(row.rank_delta || 0),
    entry_id: row.entry_id,
    user_id: row.user_id,
    display_name: row.display_name || `User ${row.user_id.slice(0, 6)}`,
    entry_name: row.entry_name,
    avatar_url: row.avatar_url,
    total_points: row.total_points,
    correct_picks: row.correct_picks,
    total_picks: row.total_picks,
    win_percentage: row.win_percentage,
    current_streak: row.current_win_streak,
    longest_streak: row.longest_win_streak,
    is_eliminated: row.is_eliminated === 1,
    lives_remaining: row.lives_remaining,
    periods_played: 0,
    dropped_periods: 0,
    is_current_user: row.user_id === currentUserId,
  }));

  return {
    entries,
    current_user_entry: entries.find((e) => e.is_current_user) || null,
    total_entries: entries.length,
    view: "weekly",
    period_id: periodId,
    last_updated: new Date().toISOString(),
  };
}

// ─── Season Leaderboard ─────────────────────────────────────────

export async function getSeasonLeaderboard(
  db: D1Database,
  leagueId: number,
  currentUserId: string,
  dropWorstPeriods = 0,
  bestXPeriods = 0,
  limit = 100,
): Promise<PoolLeaderboardResult> {
  const rows = await db.prepare(`
    SELECT
      pes.pool_entry_id as entry_id,
      CAST(pes.user_id AS TEXT) as user_id,
      u.display_name,
      u.avatar_url,
      pe.entry_name,
      pes.total_points,
      pes.correct_picks,
      pes.total_picks,
      pes.win_percentage,
      pes.current_win_streak,
      pes.longest_win_streak,
      pes.is_eliminated,
      pes.lives_remaining
    FROM pool_entry_stats pes
    JOIN pool_entries pe ON pes.pool_entry_id = pe.id
    JOIN users u ON pes.user_id = CAST(u.id AS TEXT)
    WHERE pes.league_id = ?
    ORDER BY pes.total_points DESC
    LIMIT ?
  `).bind(leagueId, limit).all<{
    entry_id: number; user_id: string; display_name: string | null; avatar_url: string | null;
    entry_name: string | null; total_points: number; correct_picks: number; total_picks: number;
    win_percentage: number; current_win_streak: number; longest_win_streak: number;
    is_eliminated: number; lives_remaining: number | null;
  }>();

  let entries: PoolLeaderboardEntry[] = [];

  for (let idx = 0; idx < (rows.results || []).length; idx++) {
    const row = (rows.results || [])[idx];
    let adjustedPoints = row.total_points;
    let droppedCount = 0;

    if (dropWorstPeriods > 0 || bestXPeriods > 0) {
      const weeklyRows = await db.prepare(`
        SELECT points_earned FROM pool_entry_weekly_stats
        WHERE pool_entry_id = ? AND league_id = ?
        ORDER BY points_earned ASC
      `).bind(row.entry_id, leagueId).all<{ points_earned: number }>();

      const weeklyPoints = (weeklyRows.results || []).map((w) => w.points_earned).sort((a, b) => a - b);

      if (dropWorstPeriods > 0 && weeklyPoints.length > dropWorstPeriods) {
        const dropped = weeklyPoints.slice(0, dropWorstPeriods);
        adjustedPoints = row.total_points - dropped.reduce((s, v) => s + v, 0);
        droppedCount = dropWorstPeriods;
      }

      if (bestXPeriods > 0 && weeklyPoints.length > bestXPeriods) {
        const best = weeklyPoints.sort((a, b) => b - a).slice(0, bestXPeriods);
        adjustedPoints = best.reduce((s, v) => s + v, 0);
        droppedCount = weeklyPoints.length - bestXPeriods;
      }
    }

    entries.push({
      rank: idx + 1,
      previous_rank: null,
      rank_delta: 0,
      entry_id: row.entry_id,
      user_id: row.user_id,
      display_name: row.display_name || `User ${row.user_id.slice(0, 6)}`,
      entry_name: row.entry_name,
      avatar_url: row.avatar_url,
      total_points: adjustedPoints,
      correct_picks: row.correct_picks,
      total_picks: row.total_picks,
      win_percentage: row.win_percentage,
      current_streak: row.current_win_streak,
      longest_streak: row.longest_win_streak,
      is_eliminated: row.is_eliminated === 1,
      lives_remaining: row.lives_remaining,
      periods_played: 0,
      dropped_periods: droppedCount,
      is_current_user: row.user_id === currentUserId,
    });
  }

  entries.sort((a, b) => b.total_points - a.total_points);
  entries = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    entries,
    current_user_entry: entries.find((e) => e.is_current_user) || null,
    total_entries: entries.length,
    view: "season",
    period_id: null,
    last_updated: new Date().toISOString(),
  };
}

// ─── Survival Leaderboard ───────────────────────────────────────

export async function getSurvivalLeaderboard(
  db: D1Database,
  leagueId: number,
  currentUserId: string,
  limit = 100,
): Promise<PoolLeaderboardResult> {
  const rows = await db.prepare(`
    SELECT
      pes.pool_entry_id as entry_id,
      CAST(pes.user_id AS TEXT) as user_id,
      u.display_name,
      u.avatar_url,
      pe.entry_name,
      pes.total_points,
      pes.correct_picks,
      pes.total_picks,
      pes.win_percentage,
      pes.is_eliminated,
      pes.lives_remaining,
      pes.eliminated_period_id
    FROM pool_entry_stats pes
    JOIN pool_entries pe ON pes.pool_entry_id = pe.id
    JOIN users u ON pes.user_id = CAST(u.id AS TEXT)
    WHERE pes.league_id = ?
    ORDER BY pes.is_eliminated ASC, pes.correct_picks DESC
    LIMIT ?
  `).bind(leagueId, limit).all<{
    entry_id: number; user_id: string; display_name: string | null; avatar_url: string | null;
    entry_name: string | null; total_points: number; correct_picks: number; total_picks: number;
    win_percentage: number; is_eliminated: number; lives_remaining: number | null;
    eliminated_period_id: string | null;
  }>();

  const entries: PoolLeaderboardEntry[] = (rows.results || []).map((row, idx) => ({
    rank: idx + 1,
    previous_rank: null,
    rank_delta: 0,
    entry_id: row.entry_id,
    user_id: row.user_id,
    display_name: row.display_name || `User ${row.user_id.slice(0, 6)}`,
    entry_name: row.entry_name,
    avatar_url: row.avatar_url,
    total_points: row.total_points,
    correct_picks: row.correct_picks,
    total_picks: row.total_picks,
    win_percentage: row.win_percentage,
    current_streak: 0,
    longest_streak: 0,
    is_eliminated: row.is_eliminated === 1,
    lives_remaining: row.lives_remaining,
    periods_played: row.correct_picks + (row.is_eliminated === 1 ? 1 : 0),
    dropped_periods: 0,
    is_current_user: row.user_id === currentUserId,
  }));

  return {
    entries,
    current_user_entry: entries.find((e) => e.is_current_user) || null,
    total_entries: entries.length,
    view: "survival",
    period_id: null,
    last_updated: new Date().toISOString(),
  };
}

// ─── Bundle Leaderboard ─────────────────────────────────────────

export async function getBundleLeaderboard(
  db: D1Database,
  parentLeagueId: number,
  currentUserId: string,
  limit = 100,
): Promise<PoolLeaderboardResult> {
  const childPools = await db.prepare(`
    SELECT child_league_id, weight FROM bundle_pools
    WHERE parent_league_id = ? AND is_active = 1
  `).bind(parentLeagueId).all<{ child_league_id: number; weight: number }>();

  const userScores = new Map<string, { points: number; display_name: string; avatar_url: string | null; entry_id: number }>();

  for (const child of childPools.results || []) {
    const stats = await db.prepare(`
      SELECT CAST(pes.user_id AS TEXT) as user_id, u.display_name, u.avatar_url,
             pes.pool_entry_id as entry_id, pes.total_points
      FROM pool_entry_stats pes
      JOIN users u ON pes.user_id = CAST(u.id AS TEXT)
      WHERE pes.league_id = ?
    `).bind(child.child_league_id).all<{
      user_id: string; display_name: string | null; avatar_url: string | null;
      entry_id: number; total_points: number;
    }>();

    for (const row of stats.results || []) {
      const existing = userScores.get(row.user_id) || {
        points: 0,
        display_name: row.display_name || `User ${row.user_id.slice(0, 6)}`,
        avatar_url: row.avatar_url,
        entry_id: row.entry_id,
      };
      existing.points += Math.round(row.total_points * child.weight);
      userScores.set(row.user_id, existing);
    }
  }

  const sorted = Array.from(userScores.entries())
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, limit);

  const entries: PoolLeaderboardEntry[] = sorted.map(([userId, data], idx) => ({
    rank: idx + 1,
    previous_rank: null,
    rank_delta: 0,
    entry_id: data.entry_id,
    user_id: userId,
    display_name: data.display_name,
    entry_name: null,
    avatar_url: data.avatar_url,
    total_points: data.points,
    correct_picks: 0,
    total_picks: 0,
    win_percentage: 0,
    current_streak: 0,
    longest_streak: 0,
    is_eliminated: false,
    lives_remaining: null,
    periods_played: 0,
    dropped_periods: 0,
    is_current_user: userId === currentUserId,
  }));

  return {
    entries,
    current_user_entry: entries.find((e) => e.is_current_user) || null,
    total_entries: entries.length,
    view: "bundle",
    period_id: null,
    last_updated: new Date().toISOString(),
  };
}

// ─── Update Rank Deltas (run after period grading) ──────────────

export async function updateRankDeltas(
  db: D1Database,
  leagueId: number,
  currentPeriodId: string,
  previousPeriodId: string | null,
): Promise<void> {
  if (!previousPeriodId) return;

  const currentRanks = await db.prepare(`
    SELECT pool_entry_id, rank FROM pool_entry_weekly_stats
    WHERE league_id = ? AND period_id = ?
  `).bind(leagueId, currentPeriodId).all<{ pool_entry_id: number; rank: number }>();

  const previousRanks = await db.prepare(`
    SELECT pool_entry_id, rank FROM pool_entry_weekly_stats
    WHERE league_id = ? AND period_id = ?
  `).bind(leagueId, previousPeriodId).all<{ pool_entry_id: number; rank: number }>();

  const prevMap = new Map((previousRanks.results || []).map((r) => [r.pool_entry_id, r.rank]));

  for (const current of currentRanks.results || []) {
    const prevRank = prevMap.get(current.pool_entry_id);
    const delta = prevRank !== undefined ? prevRank - current.rank : 0;

    await db.prepare(`
      UPDATE pool_entry_weekly_stats SET rank_delta = ? WHERE league_id = ? AND period_id = ? AND pool_entry_id = ?
    `).bind(delta, leagueId, currentPeriodId, current.pool_entry_id).run();
  }
}
