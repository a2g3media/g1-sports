/**
 * Weekly Recap Service
 * 
 * Aggregates user pool data for weekly recap emails.
 * Includes performance across all pools, standings changes, upcoming deadlines.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export interface PoolRecapData {
  leagueId: number;
  leagueName: string;
  sportKey: string;
  formatKey: string;
  correctPicks: number;
  totalPicks: number;
  winPercentage: number;
  pointsEarned: number;
  currentRank: number;
  previousRank: number | null;
  totalMembers: number;
  rankChange: number; // positive = moved up, negative = moved down
  isEliminated?: boolean;
  livesRemaining?: number;
}

export interface UpcomingDeadline {
  leagueId: number;
  leagueName: string;
  sportKey: string;
  periodId: string;
  deadline: string;
  eventsCount: number;
  hasMadePicks: boolean;
}

export interface WeeklyRecapData {
  userId: string;
  userName: string;
  userEmail: string;
  weekStart: string;
  weekEnd: string;
  // Aggregate stats
  totalPools: number;
  totalCorrectPicks: number;
  totalPicks: number;
  overallWinRate: number;
  totalPointsEarned: number;
  poolsImproved: number;
  poolsDeclined: number;
  // Per-pool breakdown
  poolRecaps: PoolRecapData[];
  // Upcoming
  upcomingDeadlines: UpcomingDeadline[];
  // Coach G insight (optional AI-generated)
  coachGInsight?: string;
  // Links
  dashboardUrl: string;
}

/**
 * Get the date range for the past week
 */
function getWeekDateRange(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  
  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

/**
 * Build weekly recap data for a user
 */
export async function buildWeeklyRecap(
  db: D1Database,
  userId: string,
  appBaseUrl: string
): Promise<WeeklyRecapData | null> {
  const { weekStart, weekEnd } = getWeekDateRange();
  
  // Get user info
  const user = await db.prepare(`
    SELECT id, email, display_name FROM users WHERE id = ?
  `).bind(userId).first();
  
  if (!user || !user.email) {
    return null;
  }
  
  // Get all leagues the user is a member of
  const leagues = await db.prepare(`
    SELECT 
      l.id,
      l.name,
      l.sport_key,
      l.format_key,
      lm.role
    FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND l.is_active = 1
  `).bind(userId).all();
  
  if (!leagues.results || leagues.results.length === 0) {
    return null; // User is not in any pools
  }
  
  const poolRecaps: PoolRecapData[] = [];
  let totalCorrectPicks = 0;
  let totalPicks = 0;
  let totalPointsEarned = 0;
  let poolsImproved = 0;
  let poolsDeclined = 0;
  
  for (const league of leagues.results) {
    // Get picks from this week (prefer pre-scored is_correct / points_earned)
    const weekPicks = await db.prepare(`
      SELECT 
        p.id,
        p.pick_value,
        p.is_correct,
        p.points_earned,
        e.winner,
        e.status,
        p.confidence_rank
      FROM picks p
      JOIN events e ON p.event_id = e.id
      WHERE p.user_id = ? 
        AND p.league_id = ?
        AND p.created_at >= ?
        AND p.created_at <= ?
    `).bind(userId, league.id, weekStart, weekEnd).all();
    
    let correct = 0;
    let total = 0;
    let points = 0;
    
    for (const pick of weekPicks.results || []) {
      if ((pick.status === 'final' || pick.status === 'completed') && pick.winner) {
        total++;
        const pickCorrect = pick.is_correct !== null && pick.is_correct !== undefined
          ? (pick.is_correct as number) === 1
          : false;
        if (pickCorrect) {
          correct++;
          points += (pick.points_earned as number) || (pick.confidence_rank as number) || 1;
        }
      }
    }
    
    // Get current standing
    const currentStanding = await db.prepare(`
      SELECT rank, total_points
      FROM standings_history
      WHERE league_id = ? AND user_id = ?
      ORDER BY snapshot_at DESC
      LIMIT 1
    `).bind(league.id, userId).first();
    
    // Get previous week's standing
    const previousStanding = await db.prepare(`
      SELECT rank
      FROM standings_history
      WHERE league_id = ? AND user_id = ? AND snapshot_at < ?
      ORDER BY snapshot_at DESC
      LIMIT 1
    `).bind(league.id, userId, weekStart).first();
    
    // Get total members
    const memberCount = await db.prepare(`
      SELECT COUNT(*) as count FROM league_members WHERE league_id = ?
    `).bind(league.id).first();
    
    // Check survivor status
    let isEliminated = false;
    let livesRemaining = null;
    if (league.format_key === 'survivor') {
      const survivorEntry = await db.prepare(`
        SELECT is_eliminated, lives_remaining
        FROM survivor_entries
        WHERE league_id = ? AND user_id = ?
        ORDER BY entry_number DESC
        LIMIT 1
      `).bind(league.id, userId).first();
      
      if (survivorEntry) {
        isEliminated = survivorEntry.is_eliminated === 1;
        livesRemaining = survivorEntry.lives_remaining;
      }
    }
    
    const currentRank = currentStanding?.rank || 0;
    const previousRank = previousStanding?.rank || null;
    const rankChange = previousRank ? previousRank - currentRank : 0;
    
    if (rankChange > 0) poolsImproved++;
    if (rankChange < 0) poolsDeclined++;
    
    poolRecaps.push({
      leagueId: league.id as number,
      leagueName: league.name as string,
      sportKey: league.sport_key as string,
      formatKey: league.format_key as string,
      correctPicks: correct,
      totalPicks: total,
      winPercentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      pointsEarned: points,
      currentRank,
      previousRank,
      totalMembers: memberCount?.count || 0,
      rankChange,
      isEliminated,
      livesRemaining,
    });
    
    totalCorrectPicks += correct;
    totalPicks += total;
    totalPointsEarned += points;
  }
  
  // Get upcoming deadlines (next 7 days)
  const upcomingDeadlines: UpcomingDeadline[] = [];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  for (const league of leagues.results) {
    // Get upcoming events
    const upcomingEvents = await db.prepare(`
      SELECT 
        COUNT(*) as event_count,
        MIN(start_at) as first_event
      FROM events
      WHERE sport_key = ?
        AND start_at > datetime('now')
        AND start_at < ?
        AND status = 'scheduled'
    `).bind(league.sport_key, nextWeek.toISOString()).first();
    
    if (upcomingEvents && upcomingEvents.event_count > 0) {
      // Check if user has made picks
      const existingPicks = await db.prepare(`
        SELECT COUNT(*) as count
        FROM picks
        WHERE user_id = ? AND league_id = ?
          AND created_at > datetime('now', '-7 days')
      `).bind(userId, league.id).first();
      
      upcomingDeadlines.push({
        leagueId: league.id as number,
        leagueName: league.name as string,
        sportKey: league.sport_key as string,
        periodId: 'Current Week',
        deadline: upcomingEvents.first_event as string,
        eventsCount: upcomingEvents.event_count as number,
        hasMadePicks: (existingPicks?.count || 0) > 0,
      });
    }
  }
  
  // Sort deadlines by date
  upcomingDeadlines.sort((a, b) => 
    new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  );
  
  return {
    userId,
    userName: user.display_name || 'Player',
    userEmail: user.email,
    weekStart,
    weekEnd,
    totalPools: poolRecaps.length,
    totalCorrectPicks,
    totalPicks,
    overallWinRate: totalPicks > 0 ? Math.round((totalCorrectPicks / totalPicks) * 100) : 0,
    totalPointsEarned,
    poolsImproved,
    poolsDeclined,
    poolRecaps: poolRecaps.filter(p => p.totalPicks > 0 || p.currentRank > 0),
    upcomingDeadlines: upcomingDeadlines.slice(0, 5),
    dashboardUrl: appBaseUrl,
  };
}

/**
 * Get users opted into weekly recaps
 */
export async function getWeeklyRecapRecipients(db: D1Database): Promise<Array<{ userId: string; email: string }>> {
  const result = await db.prepare(`
    SELECT u.id as user_id, u.email
    FROM users u
    LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
    WHERE u.email IS NOT NULL
      AND (unp.weekly_recap_opt_in IS NULL OR unp.weekly_recap_opt_in = 1)
  `).all();
  
  return (result.results || []).map((r: { user_id: string | number; email: string }) => ({
    userId: String(r.user_id),
    email: r.email,
  }));
}

/**
 * Check if user is opted into weekly recaps
 */
export async function isUserOptedIntoWeeklyRecap(db: D1Database, userId: string): Promise<boolean> {
  const pref = await db.prepare(`
    SELECT weekly_recap_opt_in
    FROM user_notification_preferences
    WHERE user_id = ?
  `).bind(userId).first();
  
  // Default to opted in
  return pref?.weekly_recap_opt_in !== 0;
}

/**
 * Set user's weekly recap preference
 */
export async function setWeeklyRecapOptIn(
  db: D1Database, 
  userId: string, 
  optIn: boolean
): Promise<void> {
  await db.prepare(`
    INSERT INTO user_notification_preferences (user_id, weekly_recap_opt_in, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      weekly_recap_opt_in = excluded.weekly_recap_opt_in,
      updated_at = datetime('now')
  `).bind(userId, optIn ? 1 : 0).run();
}
