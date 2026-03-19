/**
 * Share Scout Take Service
 * Handles creation and tracking of shareable Scout AI takes
 */

// Generate a short, human-readable share ID (8 chars)
function generateShareId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export interface CreateShareInput {
  userId: string;
  gameContext?: string;
  scoutTake: string;
  confidence?: string;
  persona?: string;
  sportKey?: string;
  teams?: string;
}

export interface SharedTake {
  id: number;
  share_id: string;
  user_id: string;
  game_context: string | null;
  scout_take: string;
  confidence: string | null;
  persona: string;
  sport_key: string | null;
  teams: string | null;
  view_count: number;
  created_at: string;
}

export interface ShareEventInput {
  shareId: string;
  eventType: 'share_created' | 'share_link_clicked' | 'share_conversion_signup';
  referrerUrl?: string;
  userAgent?: string;
  convertedUserId?: string;
}

/**
 * Create a shareable Scout take
 */
export async function createShare(
  db: D1Database,
  input: CreateShareInput
): Promise<{ shareId: string; success: boolean }> {
  const shareId = generateShareId();
  
  try {
    await db.prepare(`
      INSERT INTO shared_takes (
        share_id, user_id, game_context, scout_take, confidence, persona, sport_key, teams
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      shareId,
      input.userId,
      input.gameContext || null,
      input.scoutTake,
      input.confidence || null,
      input.persona || 'billy',
      input.sportKey || null,
      input.teams || null
    ).run();

    // Track share creation
    await trackShareEvent(db, {
      shareId,
      eventType: 'share_created'
    });

    return { shareId, success: true };
  } catch (error) {
    console.error('Error creating share:', error);
    return { shareId: '', success: false };
  }
}

/**
 * Get a shared take by share ID
 */
export async function getShare(
  db: D1Database,
  shareId: string
): Promise<SharedTake | null> {
  try {
    const result = await db.prepare(`
      SELECT * FROM shared_takes WHERE share_id = ?
    `).bind(shareId).first<SharedTake>();

    return result || null;
  } catch (error) {
    console.error('Error getting share:', error);
    return null;
  }
}

/**
 * Increment view count for a shared take
 */
export async function incrementViewCount(
  db: D1Database,
  shareId: string
): Promise<void> {
  try {
    await db.prepare(`
      UPDATE shared_takes 
      SET view_count = view_count + 1, updated_at = CURRENT_TIMESTAMP
      WHERE share_id = ?
    `).bind(shareId).run();
  } catch (error) {
    console.error('Error incrementing view count:', error);
  }
}

/**
 * Track share-related events
 */
export async function trackShareEvent(
  db: D1Database,
  input: ShareEventInput
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO share_events (share_id, event_type, referrer_url, user_agent, converted_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      input.shareId,
      input.eventType,
      input.referrerUrl || null,
      input.userAgent || null,
      input.convertedUserId || null
    ).run();
  } catch (error) {
    console.error('Error tracking share event:', error);
  }
}

/**
 * Get share stats for a user
 */
export async function getUserShareStats(
  db: D1Database,
  userId: string
): Promise<{
  totalShares: number;
  totalViews: number;
  totalClicks: number;
  conversions: number;
}> {
  try {
    // Get total shares and views
    const sharesResult = await db.prepare(`
      SELECT COUNT(*) as total_shares, COALESCE(SUM(view_count), 0) as total_views
      FROM shared_takes WHERE user_id = ?
    `).bind(userId).first<{ total_shares: number; total_views: number }>();

    // Get click and conversion counts
    const eventsResult = await db.prepare(`
      SELECT 
        SUM(CASE WHEN event_type = 'share_link_clicked' THEN 1 ELSE 0 END) as clicks,
        SUM(CASE WHEN event_type = 'share_conversion_signup' THEN 1 ELSE 0 END) as conversions
      FROM share_events se
      JOIN shared_takes st ON se.share_id = st.share_id
      WHERE st.user_id = ?
    `).bind(userId).first<{ clicks: number; conversions: number }>();

    return {
      totalShares: sharesResult?.total_shares || 0,
      totalViews: sharesResult?.total_views || 0,
      totalClicks: eventsResult?.clicks || 0,
      conversions: eventsResult?.conversions || 0
    };
  } catch (error) {
    console.error('Error getting user share stats:', error);
    return { totalShares: 0, totalViews: 0, totalClicks: 0, conversions: 0 };
  }
}

/**
 * Get recent shares for a user
 */
export async function getUserRecentShares(
  db: D1Database,
  userId: string,
  limit: number = 10
): Promise<SharedTake[]> {
  try {
    const result = await db.prepare(`
      SELECT * FROM shared_takes 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(userId, limit).all<SharedTake>();

    return result.results || [];
  } catch (error) {
    console.error('Error getting recent shares:', error);
    return [];
  }
}
