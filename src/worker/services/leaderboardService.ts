/**
 * Leaderboard Service
 * 
 * Aggregates user performance data for competitive rankings.
 * Does NOT modify scoring logic - only reads existing pick results.
 * 
 * Privacy: Users can opt out via user_settings.leaderboard_visible
 */

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  stats: {
    totalPicks: number;
    correctPicks: number;
    winPercentage: number;
    currentStreak: number;
    bestStreak: number;
    roi: number | null; // ROI in percentage, null if no stakes
    unitsWon: number;
  };
  isCurrentUser?: boolean;
}

interface LeaderboardResult {
  entries: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  totalParticipants: number;
  lastUpdated: string;
  period: 'all_time' | 'weekly' | 'monthly';
}

interface LeaderboardFilters {
  sportKey?: string;
  period?: 'all_time' | 'weekly' | 'monthly';
  leagueId?: number;
  limit?: number;
}

/**
 * Check if user is visible on public leaderboards
 */
export async function isUserLeaderboardVisible(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `SELECT setting_value FROM user_settings 
       WHERE user_id = ? AND setting_key = 'leaderboard_visible'`
    )
    .bind(userId)
    .first<{ setting_value: string }>();
  
  // Default to visible (ON) if not set
  return result?.setting_value !== 'false';
}

/**
 * Set user leaderboard visibility preference
 */
export async function setUserLeaderboardVisibility(
  db: D1Database,
  userId: string,
  visible: boolean
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, updated_at)
       VALUES (?, 'leaderboard_visible', ?, 'PROD', CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, setting_key, data_scope) 
       DO UPDATE SET setting_value = ?, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(userId, visible ? 'true' : 'false', visible ? 'true' : 'false')
    .run();
}

/**
 * Get date range for period filter
 */
function getPeriodDateRange(period: 'all_time' | 'weekly' | 'monthly'): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  
  if (period === 'weekly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start: start.toISOString(), end };
  }
  
  if (period === 'monthly') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { start: start.toISOString(), end };
  }
  
  // all_time - go back 2 years
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 2);
  return { start: start.toISOString(), end };
}

/**
 * Calculate user streaks from picks
 */
async function calculateStreaks(
  db: D1Database,
  userId: string,
  dateRange: { start: string; end: string }
): Promise<{ current: number; best: number }> {
  const picks = await db
    .prepare(
      `SELECT result, created_at FROM tracker_picks 
       WHERE user_id = ? AND result IN ('WIN', 'LOSS') 
       AND created_at >= ? AND created_at <= ?
       ORDER BY created_at DESC`
    )
    .bind(userId, dateRange.start, dateRange.end)
    .all<{ result: string; created_at: string }>();

  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  let streakType: string | null = null;

  for (const pick of picks.results || []) {
    if (pick.result === 'WIN') {
      if (streakType === 'WIN' || streakType === null) {
        tempStreak++;
        if (streakType === null) {
          currentStreak = tempStreak;
        }
      } else {
        tempStreak = 1;
      }
      streakType = 'WIN';
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      if (streakType === null) {
        currentStreak = 0;
      }
      tempStreak = 0;
      streakType = 'LOSS';
    }
  }

  return { current: currentStreak, best: bestStreak };
}

/**
 * Get global leaderboard (all users across all leagues)
 */
export async function getGlobalLeaderboard(
  db: D1Database,
  currentUserId: string,
  filters: LeaderboardFilters = {}
): Promise<LeaderboardResult> {
  const period = filters.period || 'all_time';
  const limit = filters.limit || 50;
  const dateRange = getPeriodDateRange(period);

  // Get all users who have made picks and are visible on leaderboard
  const query = `
    SELECT 
      tp.user_id,
      u.display_name,
      u.avatar_url,
      COUNT(*) as total_picks,
      SUM(CASE WHEN tp.result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN tp.result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN tp.result = 'WIN' THEN tp.stake_units ELSE 0 END) as units_won_raw,
      SUM(CASE WHEN tp.result = 'LOSS' THEN tp.stake_units ELSE 0 END) as units_lost,
      SUM(tp.result_profit_units) as total_profit_units
    FROM tracker_picks tp
    JOIN users u ON tp.user_id = CAST(u.id AS TEXT)
    LEFT JOIN user_settings us ON tp.user_id = us.user_id 
      AND us.setting_key = 'leaderboard_visible' 
      AND us.data_scope = 'PROD'
    WHERE tp.result IN ('WIN', 'LOSS', 'PUSH')
      AND tp.created_at >= ?
      AND tp.created_at <= ?
      ${filters.sportKey ? 'AND tp.sport_key = ?' : ''}
      AND (us.setting_value IS NULL OR us.setting_value != 'false' OR tp.user_id = ?)
    GROUP BY tp.user_id, u.display_name, u.avatar_url
    HAVING total_picks >= 5
    ORDER BY 
      CAST(wins AS REAL) / NULLIF(wins + losses, 0) DESC,
      total_profit_units DESC,
      wins DESC
    LIMIT ?
  `;

  const params = [dateRange.start, dateRange.end];
  if (filters.sportKey) params.push(filters.sportKey);
  params.push(currentUserId);
  params.push(String(limit));

  const results = await db
    .prepare(query)
    .bind(...params)
    .all<{
      user_id: string;
      display_name: string | null;
      avatar_url: string | null;
      total_picks: number;
      wins: number;
      losses: number;
      units_won_raw: number | null;
      units_lost: number | null;
      total_profit_units: number | null;
    }>();

  const entries: LeaderboardEntry[] = [];
  let currentUserEntry: LeaderboardEntry | null = null;

  for (let i = 0; i < (results.results?.length || 0); i++) {
    const row = results.results![i];
    const winPct = row.wins + row.losses > 0 
      ? (row.wins / (row.wins + row.losses)) * 100 
      : 0;
    
    const totalStaked = (row.units_won_raw || 0) + (row.units_lost || 0);
    const roi = totalStaked > 0 
      ? ((row.total_profit_units || 0) / totalStaked) * 100 
      : null;

    const streaks = await calculateStreaks(db, row.user_id, dateRange);

    const entry: LeaderboardEntry = {
      rank: i + 1,
      userId: row.user_id,
      displayName: row.display_name || `User ${row.user_id.slice(0, 6)}`,
      avatarUrl: row.avatar_url,
      stats: {
        totalPicks: row.total_picks,
        correctPicks: row.wins,
        winPercentage: Math.round(winPct * 10) / 10,
        currentStreak: streaks.current,
        bestStreak: streaks.best,
        roi: roi !== null ? Math.round(roi * 10) / 10 : null,
        unitsWon: row.total_profit_units || 0,
      },
      isCurrentUser: row.user_id === currentUserId,
    };

    entries.push(entry);

    if (row.user_id === currentUserId) {
      currentUserEntry = entry;
    }
  }

  // If current user not in top results, fetch their stats separately
  if (!currentUserEntry) {
    currentUserEntry = await getUserLeaderboardEntry(db, currentUserId, filters);
  }

  // Get total participant count
  const countResult = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) as count FROM tracker_picks 
       WHERE result IN ('WIN', 'LOSS', 'PUSH') 
       AND created_at >= ? AND created_at <= ?`
    )
    .bind(dateRange.start, dateRange.end)
    .first<{ count: number }>();

  return {
    entries,
    currentUserEntry,
    totalParticipants: countResult?.count || 0,
    lastUpdated: new Date().toISOString(),
    period,
  };
}

/**
 * Get league-specific leaderboard
 */
export async function getLeagueLeaderboard(
  db: D1Database,
  leagueId: number,
  currentUserId: string,
  filters: LeaderboardFilters = {}
): Promise<LeaderboardResult> {
  const period = filters.period || 'all_time';
  const limit = filters.limit || 50;
  const dateRange = getPeriodDateRange(period);

  const query = `
    SELECT 
      p.user_id,
      u.display_name,
      u.avatar_url,
      COUNT(*) as total_picks,
      SUM(CASE WHEN e.winner IS NOT NULL AND (
        (p.pick_value = 'home' AND e.winner = e.home_team) OR
        (p.pick_value = 'away' AND e.winner = e.away_team) OR
        (p.pick_value = e.winner)
      ) THEN 1 ELSE 0 END) as wins,
      COUNT(CASE WHEN e.winner IS NOT NULL THEN 1 END) as graded_picks
    FROM picks p
    JOIN users u ON p.user_id = u.id
    JOIN events e ON p.event_id = e.id
    LEFT JOIN user_settings us ON CAST(p.user_id AS TEXT) = us.user_id 
      AND us.setting_key = 'leaderboard_visible' 
      AND us.data_scope = 'PROD'
    WHERE p.league_id = ?
      AND p.created_at >= ?
      AND p.created_at <= ?
      AND (us.setting_value IS NULL OR us.setting_value != 'false' OR CAST(p.user_id AS TEXT) = ?)
    GROUP BY p.user_id, u.display_name, u.avatar_url
    HAVING graded_picks >= 3
    ORDER BY 
      CAST(wins AS REAL) / NULLIF(graded_picks, 0) DESC,
      wins DESC
    LIMIT ?
  `;

  const results = await db
    .prepare(query)
    .bind(leagueId, dateRange.start, dateRange.end, currentUserId, limit)
    .all<{
      user_id: number;
      display_name: string | null;
      avatar_url: string | null;
      total_picks: number;
      wins: number;
      graded_picks: number;
    }>();

  const entries: LeaderboardEntry[] = [];
  let currentUserEntry: LeaderboardEntry | null = null;

  for (let i = 0; i < (results.results?.length || 0); i++) {
    const row = results.results![i];
    const userId = String(row.user_id);
    const winPct = row.graded_picks > 0 
      ? (row.wins / row.graded_picks) * 100 
      : 0;

    const entry: LeaderboardEntry = {
      rank: i + 1,
      userId,
      displayName: row.display_name || `User ${userId.slice(0, 6)}`,
      avatarUrl: row.avatar_url,
      stats: {
        totalPicks: row.total_picks,
        correctPicks: row.wins,
        winPercentage: Math.round(winPct * 10) / 10,
        currentStreak: 0, // Simplified for league leaderboard
        bestStreak: 0,
        roi: null,
        unitsWon: 0,
      },
      isCurrentUser: userId === currentUserId,
    };

    entries.push(entry);

    if (userId === currentUserId) {
      currentUserEntry = entry;
    }
  }

  const countResult = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) as count FROM picks 
       WHERE league_id = ? AND created_at >= ? AND created_at <= ?`
    )
    .bind(leagueId, dateRange.start, dateRange.end)
    .first<{ count: number }>();

  return {
    entries,
    currentUserEntry,
    totalParticipants: countResult?.count || 0,
    lastUpdated: new Date().toISOString(),
    period,
  };
}

/**
 * Get a specific user's leaderboard entry with their rank
 */
async function getUserLeaderboardEntry(
  db: D1Database,
  userId: string,
  filters: LeaderboardFilters = {}
): Promise<LeaderboardEntry | null> {
  const period = filters.period || 'all_time';
  const dateRange = getPeriodDateRange(period);

  const userStats = await db
    .prepare(
      `SELECT 
        COUNT(*) as total_picks,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(result_profit_units) as total_profit_units
       FROM tracker_picks 
       WHERE user_id = ? 
         AND result IN ('WIN', 'LOSS', 'PUSH')
         AND created_at >= ?
         AND created_at <= ?
         ${filters.sportKey ? 'AND sport_key = ?' : ''}`
    )
    .bind(
      userId, 
      dateRange.start, 
      dateRange.end, 
      ...(filters.sportKey ? [filters.sportKey] : [])
    )
    .first<{
      total_picks: number;
      wins: number;
      losses: number;
      total_profit_units: number | null;
    }>();

  if (!userStats || userStats.total_picks < 5) {
    return null;
  }

  const user = await db
    .prepare(`SELECT display_name, avatar_url FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ display_name: string | null; avatar_url: string | null }>();

  const winPct = userStats.wins + userStats.losses > 0 
    ? (userStats.wins / (userStats.wins + userStats.losses)) * 100 
    : 0;

  // Calculate rank
  const rankResult = await db
    .prepare(
      `SELECT COUNT(*) + 1 as rank FROM (
        SELECT user_id, 
          SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses
        FROM tracker_picks
        WHERE result IN ('WIN', 'LOSS', 'PUSH')
          AND created_at >= ?
          AND created_at <= ?
        GROUP BY user_id
        HAVING COUNT(*) >= 5
      ) WHERE CAST(wins AS REAL) / NULLIF(wins + losses, 0) > ?`
    )
    .bind(dateRange.start, dateRange.end, winPct / 100)
    .first<{ rank: number }>();

  const streaks = await calculateStreaks(db, userId, dateRange);

  return {
    rank: rankResult?.rank || 1,
    userId,
    displayName: user?.display_name || `User ${userId.slice(0, 6)}`,
    avatarUrl: user?.avatar_url || null,
    stats: {
      totalPicks: userStats.total_picks,
      correctPicks: userStats.wins,
      winPercentage: Math.round(winPct * 10) / 10,
      currentStreak: streaks.current,
      bestStreak: streaks.best,
      roi: null,
      unitsWon: userStats.total_profit_units || 0,
    },
    isCurrentUser: true,
  };
}

/**
 * Get weekly top performers (for highlights/badges)
 */
export async function getWeeklyTopPerformers(
  db: D1Database,
  limit: number = 3
): Promise<LeaderboardEntry[]> {
  const result = await getGlobalLeaderboard(db, '', { period: 'weekly', limit });
  return result.entries.slice(0, limit);
}
