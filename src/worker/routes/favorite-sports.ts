/**
 * Favorite Sports API Routes
 * 
 * Manages user sport preferences, followed teams, and locale for personalization.
 * Drives: Scores sorting, Alert defaults, Scout context
 */

import { Hono } from 'hono';
import { authMiddleware } from "@getmocha/users-service/backend";

const favoriteSportsRouter = new Hono<{ Bindings: Env }>();
const DEMO_USER_ID = "demo-user-001";

async function demoOrAuthMiddleware(c: any, next: () => Promise<void>) {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    c.set("user", { id: DEMO_USER_ID });
    await next();
    return;
  }
  // Run auth middleware with a no-op next so we can detect unauthorized
  // responses without risking double-finalization of the context.
  await authMiddleware(c, async () => {});
  if (c.finalized) return;
  await next();
}

// Valid sport keys
const VALID_SPORTS = [
  'nfl', 'nba', 'mlb', 'nhl', 'ncaaf', 'ncaab', 
  'soccer', 'tennis', 'golf', 'mma', 'boxing', 'f1'
] as const;
type SportKey = typeof VALID_SPORTS[number];

// Settings keys
const FAVORITE_SPORTS_KEY = 'favorite_sports';
const FOLLOWED_TEAMS_KEY = 'followed_teams';
const FOLLOWED_PLAYERS_KEY = 'followed_players';
const USER_LOCALE_KEY = 'user_locale';
const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

async function ensureFavoritesTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      sport TEXT,
      league TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, type, entity_id)
    )
  `).run();
}

// Regional defaults (matches frontend)
const REGIONAL_DEFAULTS: Record<string, SportKey[]> = {
  'US': ['nfl', 'nba', 'mlb'],
  'CA': ['nhl', 'nba', 'mlb'],
  'GB': ['soccer', 'tennis', 'f1'],
  'DE': ['soccer', 'f1', 'tennis'],
  'ES': ['soccer', 'tennis', 'f1'],
  'FR': ['soccer', 'tennis', 'f1'],
  'IT': ['soccer', 'f1', 'tennis'],
  'JP': ['mlb', 'soccer', 'golf'],
  'KR': ['mlb', 'soccer', 'golf'],
  'AU': ['soccer', 'tennis', 'f1'],
  'MX': ['soccer', 'mlb', 'boxing'],
  'BR': ['soccer', 'mma', 'f1'],
  'default': ['nfl', 'nba', 'soccer'],
};

/**
 * GET /api/user/favorite-sports
 * Get user's favorite sports, followed teams, locale, and onboarding status
 */
favoriteSportsRouter.get('/', demoOrAuthMiddleware, async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ 
      sports: REGIONAL_DEFAULTS['default'],
      followedTeams: [],
      followedPlayers: [],
      locale: 'US',
      hasCompletedOnboarding: true, // Don't show onboarding to anonymous
    });
  }

  const db = c.env.DB;

  try {
    await ensureFavoritesTable(db);
    // Fetch all user settings in one query
    const results = await db.prepare(`
      SELECT setting_key, setting_value 
      FROM user_settings 
      WHERE user_id = ? AND data_scope = 'PROD'
      AND setting_key IN (?, ?, ?, ?, ?)
    `).bind(
      user.id, 
      FAVORITE_SPORTS_KEY, 
      FOLLOWED_TEAMS_KEY, 
      FOLLOWED_PLAYERS_KEY,
      USER_LOCALE_KEY,
      ONBOARDING_COMPLETE_KEY
    ).all() as { results: { setting_key: string; setting_value: string }[] };

    // Parse results into a map
    const settings = new Map<string, string>();
    for (const row of results.results || []) {
      settings.set(row.setting_key, row.setting_value);
    }

    const sports = settings.has(FAVORITE_SPORTS_KEY)
      ? JSON.parse(settings.get(FAVORITE_SPORTS_KEY)!)
      : [];
    
    const followedTeamsLegacy = settings.has(FOLLOWED_TEAMS_KEY)
      ? JSON.parse(settings.get(FOLLOWED_TEAMS_KEY)!)
      : [];
    const followedPlayersLegacy = settings.has(FOLLOWED_PLAYERS_KEY)
      ? JSON.parse(settings.get(FOLLOWED_PLAYERS_KEY)!)
      : [];

    const favRows = await db.prepare(`
      SELECT type, entity_id
      FROM favorites
      WHERE user_id = ? AND type IN ('team', 'player')
    `).bind(user.id).all<{ type: string; entity_id: string }>();
    const followedTeamsFromFavorites = (favRows.results || [])
      .filter((r) => String(r.type) === "team")
      .map((r) => String(r.entity_id));
    const followedPlayersFromFavorites = (favRows.results || [])
      .filter((r) => String(r.type) === "player")
      .map((r) => String(r.entity_id));

    const followedTeams = Array.from(new Set([...(Array.isArray(followedTeamsLegacy) ? followedTeamsLegacy : []), ...followedTeamsFromFavorites]));
    const followedPlayers = Array.from(new Set([...(Array.isArray(followedPlayersLegacy) ? followedPlayersLegacy : []), ...followedPlayersFromFavorites]));

    const locale = settings.get(USER_LOCALE_KEY) || 'US';
    const hasCompletedOnboarding = settings.get(ONBOARDING_COMPLETE_KEY) === 'true';

    return c.json({ 
      sports,
      followedTeams,
      followedPlayers,
      locale,
      hasCompletedOnboarding,
    });
  } catch (err) {
    console.error('Failed to fetch favorite sports:', err);
    return c.json({ 
      sports: REGIONAL_DEFAULTS['default'],
      followedTeams: [],
      followedPlayers: [],
      locale: 'US',
      hasCompletedOnboarding: true,
    });
  }
});

/**
 * POST /api/user/favorite-sports
 * Save user's favorite sports, followed teams, and locale
 */
favoriteSportsRouter.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const db = c.env.DB;

  try {
    await ensureFavoritesTable(db);
    const body = await c.req.json();
    const { sports, followedTeams, followedPlayers, locale, markOnboardingComplete } = body;

    // Validate sports array
    if (!Array.isArray(sports)) {
      return c.json({ error: 'Sports must be an array' }, 400);
    }

    // Filter to valid sports only
    const validSports = sports.filter((s): s is SportKey => 
      VALID_SPORTS.includes(s as SportKey)
    );

    const now = new Date().toISOString();

    // Upsert favorite sports
    await db.prepare(`
      INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
      VALUES (?, ?, ?, 'PROD', ?, ?)
      ON CONFLICT (user_id, setting_key, data_scope) 
      DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
    `).bind(
      user.id, 
      FAVORITE_SPORTS_KEY, 
      JSON.stringify(validSports),
      now,
      now
    ).run();

    // Upsert followed teams if provided
    if (Array.isArray(followedTeams)) {
      await db.prepare(`
        INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
        VALUES (?, ?, ?, 'PROD', ?, ?)
        ON CONFLICT (user_id, setting_key, data_scope) 
        DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
      `).bind(
        user.id, 
        FOLLOWED_TEAMS_KEY, 
        JSON.stringify(followedTeams),
        now,
        now
      ).run();

      await db.prepare(`DELETE FROM favorites WHERE user_id = ? AND type = 'team'`).bind(user.id).run();
      for (const teamIdRaw of followedTeams) {
        const teamId = String(teamIdRaw || "").trim();
        if (!teamId) continue;
        await db.prepare(`
          INSERT OR IGNORE INTO favorites (user_id, type, entity_id, metadata, updated_at)
          VALUES (?, 'team', ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          user.id,
          teamId,
          JSON.stringify({ source: "favorite_sports_sync" })
        ).run();
      }
    }

    // Upsert followed players if provided
    if (Array.isArray(followedPlayers)) {
      await db.prepare(`
        INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
        VALUES (?, ?, ?, 'PROD', ?, ?)
        ON CONFLICT (user_id, setting_key, data_scope) 
        DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
      `).bind(
        user.id,
        FOLLOWED_PLAYERS_KEY,
        JSON.stringify(followedPlayers),
        now,
        now
      ).run();

      await db.prepare(`DELETE FROM favorites WHERE user_id = ? AND type = 'player'`).bind(user.id).run();
      for (const playerIdRaw of followedPlayers) {
        const playerId = String(playerIdRaw || "").trim();
        if (!playerId) continue;
        await db.prepare(`
          INSERT OR IGNORE INTO favorites (user_id, type, entity_id, metadata, updated_at)
          VALUES (?, 'player', ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          user.id,
          playerId,
          JSON.stringify({ source: "favorite_sports_sync" })
        ).run();
      }
    }

    // Upsert locale if provided
    if (locale && typeof locale === 'string') {
      await db.prepare(`
        INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
        VALUES (?, ?, ?, 'PROD', ?, ?)
        ON CONFLICT (user_id, setting_key, data_scope) 
        DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
      `).bind(
        user.id, 
        USER_LOCALE_KEY, 
        locale,
        now,
        now
      ).run();
    }

    // Mark onboarding complete if requested
    if (markOnboardingComplete) {
      await db.prepare(`
        INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
        VALUES (?, ?, 'true', 'PROD', ?, ?)
        ON CONFLICT (user_id, setting_key, data_scope) 
        DO UPDATE SET setting_value = 'true', updated_at = excluded.updated_at
      `).bind(
        user.id, 
        ONBOARDING_COMPLETE_KEY,
        now,
        now
      ).run();
    }

    return c.json({ 
      success: true,
      sports: validSports,
      followedTeams: followedTeams || [],
      followedPlayers: followedPlayers || [],
    });
  } catch (err) {
    console.error('Failed to save favorite sports:', err);
    return c.json({ error: 'Failed to save preferences' }, 500);
  }
});

/**
 * GET /api/user/favorite-sports/defaults
 * Get regional defaults without requiring auth (for pre-selection)
 */
favoriteSportsRouter.get('/defaults', async (c) => {
  const region = c.req.query('region') || 'US';
  const defaults = REGIONAL_DEFAULTS[region] || REGIONAL_DEFAULTS['default'];
  
  return c.json({
    region,
    sports: defaults,
  });
});

export { favoriteSportsRouter };
