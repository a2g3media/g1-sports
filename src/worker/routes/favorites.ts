import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

type FavoriteType = "team" | "player" | "game" | "market";

interface FavoriteRow {
  id: number;
  user_id: string;
  type: FavoriteType;
  entity_id: string;
  sport: string | null;
  league: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

const favoritesRouter = new Hono<{ Bindings: Bindings }>();
let ensureFavoritesSchemaPromise: Promise<void> | null = null;

async function ensureFavoritesSchema(db: D1Database): Promise<void> {
  if (ensureFavoritesSchemaPromise) {
    await ensureFavoritesSchemaPromise;
    return;
  }
  ensureFavoritesSchemaPromise = (async () => {
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
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_favorites_user_type
      ON favorites(user_id, type)
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_favorites_user_created
      ON favorites(user_id, created_at DESC)
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS alerts_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, entity_id, alert_type)
      )
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_alerts_prefs_user_entity
      ON alerts_preferences(user_id, entity_id)
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'My Watchlist',
        is_default BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watchlist_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        sport_type TEXT,
        display_name TEXT,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_type, item_id)
      )
    `).run();
  })();
  try {
    await ensureFavoritesSchemaPromise;
  } finally {
    ensureFavoritesSchemaPromise = null;
  }
}

function getUserId(c: any): string {
  const fromHeader = String(c.req.header("x-user-id") || "").trim();
  if (fromHeader) return fromHeader;
  const user = c.get?.("user");
  if (user?.id) return String(user.id);
  return "guest";
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isLiveStatus(status: unknown): boolean {
  const s = String(status || "").toUpperCase();
  return s === "LIVE" || s === "IN_PROGRESS";
}

async function safeFirst<T>(
  db: D1Database,
  sql: string,
  params: Array<string | number | null>
): Promise<T | null> {
  try {
    return await db.prepare(sql).bind(...params).first<T>();
  } catch {
    return null;
  }
}

async function safeAll<T>(
  db: D1Database,
  sql: string,
  params: Array<string | number | null>
): Promise<T[]> {
  try {
    const res = await db.prepare(sql).bind(...params).all<T>();
    return res.results || [];
  } catch {
    return [];
  }
}

function toWatchlistItemType(type: FavoriteType): "GAME" | "TEAM" | "SPORT" | null {
  if (type === "game") return "GAME";
  if (type === "team") return "TEAM";
  if (type === "market") return "SPORT";
  return null;
}

async function hydrateLegacyFavorites(db: D1Database, userId: string): Promise<void> {
  try {
    const settings = await db.prepare(`
      SELECT setting_key, setting_value
      FROM user_settings
      WHERE user_id = ? AND data_scope = 'PROD'
        AND setting_key IN ('followed_teams', 'followed_players')
    `).bind(userId).all<{ setting_key: string; setting_value: string }>();
    for (const row of settings.results || []) {
      const key = String(row.setting_key || "");
      const raw = String(row.setting_value || "[]");
      let values: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        values = Array.isArray(parsed) ? parsed.map((v) => String(v || "").trim()).filter(Boolean) : [];
      } catch {
        values = [];
      }
      const type: FavoriteType | null = key === "followed_teams" ? "team" : key === "followed_players" ? "player" : null;
      if (!type) continue;
      for (const entityId of values) {
        await db.prepare(`
          INSERT OR IGNORE INTO favorites (user_id, type, entity_id, metadata, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(userId, type, entityId, JSON.stringify({ source: "legacy_user_settings" })).run();
      }
    }
  } catch {
    // no-op
  }

  try {
    const watchedPlayers = await db.prepare(`
      SELECT player_name, sport, team_abbr
      FROM watchboard_players
      WHERE user_id = ? AND is_active = 1
    `).bind(userId).all<{ player_name: string; sport: string | null; team_abbr: string | null }>();
    for (const row of watchedPlayers.results || []) {
      const playerName = String(row.player_name || "").trim();
      if (!playerName) continue;
      await db.prepare(`
        INSERT OR IGNORE INTO favorites (user_id, type, entity_id, sport, metadata, updated_at)
        VALUES (?, 'player', ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        userId,
        playerName,
        row.sport ? String(row.sport).toLowerCase() : null,
        JSON.stringify({ source: "legacy_watchboard_players", team_code: row.team_abbr || null, player_name: playerName })
      ).run();
    }
  } catch {
    // no-op
  }
}

async function getOrCreateDefaultWatchlistId(db: D1Database, userId: string): Promise<number> {
  const existing = await db
    .prepare(`SELECT id FROM watchlists WHERE user_id = ? AND is_default = 1 LIMIT 1`)
    .bind(userId)
    .first<{ id: number }>();
  if (existing?.id) return existing.id;
  const created = await db
    .prepare(`INSERT INTO watchlists (user_id, name, is_default) VALUES (?, 'My Watchlist', 1)`)
    .bind(userId)
    .run();
  return Number(created.meta.last_row_id || 0);
}

favoritesRouter.use("*", async (c, next) => {
  await ensureFavoritesSchema(c.env.DB);
  return next();
});

favoritesRouter.get("/", async (c) => {
  const userId = getUserId(c);
  await hydrateLegacyFavorites(c.env.DB, userId);
  const type = String(c.req.query("type") || "").trim().toLowerCase();
  const sport = String(c.req.query("sport") || "").trim().toLowerCase();

  let sql = `SELECT * FROM favorites WHERE user_id = ?`;
  const params: Array<string> = [userId];
  if (type) {
    sql += ` AND type = ?`;
    params.push(type);
  }
  if (sport) {
    sql += ` AND LOWER(COALESCE(sport, '')) = ?`;
    params.push(sport);
  }
  sql += ` ORDER BY created_at DESC`;

  const results = await c.env.DB.prepare(sql).bind(...params).all<FavoriteRow>();
  const favorites = (results.results || []).map((row) => ({
    ...row,
    metadata: parseMetadata(row.metadata),
  }));
  return c.json({ favorites });
});

favoritesRouter.get("/check", async (c) => {
  const userId = getUserId(c);
  await hydrateLegacyFavorites(c.env.DB, userId);
  const type = String(c.req.query("type") || "").trim().toLowerCase();
  const entityId = String(c.req.query("entity_id") || "").trim();
  if (!type || !entityId) return c.json({ is_favorite: false });

  const existing = await c.env.DB
    .prepare(`SELECT id FROM favorites WHERE user_id = ? AND type = ? AND entity_id = ? LIMIT 1`)
    .bind(userId, type, entityId)
    .first<{ id: number }>();

  return c.json({ is_favorite: Boolean(existing) });
});

favoritesRouter.post("/toggle", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json<{
    type: FavoriteType;
    entity_id: string;
    sport?: string;
    league?: string;
    metadata?: Record<string, unknown>;
  }>();

  const type = String(body.type || "").trim().toLowerCase() as FavoriteType;
  const entityId = String(body.entity_id || "").trim();
  if (!type || !entityId) {
    return c.json({ error: "type and entity_id are required" }, 400);
  }

  const existing = await c.env.DB
    .prepare(`SELECT id FROM favorites WHERE user_id = ? AND type = ? AND entity_id = ?`)
    .bind(userId, type, entityId)
    .first<{ id: number }>();

  if (existing) {
    await c.env.DB
      .prepare(`DELETE FROM favorites WHERE id = ?`)
      .bind(existing.id)
      .run();
    const watchlistType = toWatchlistItemType(type);
    if (watchlistType) {
      try {
        await c.env.DB
          .prepare(`DELETE FROM watchlist_items WHERE user_id = ? AND item_type = ? AND item_id = ?`)
          .bind(userId, watchlistType, entityId)
          .run();
      } catch {
        // no-op: keep favorites flow resilient if legacy watchlist is unavailable
      }
    }
    return c.json({ success: true, is_favorite: false });
  }

  await c.env.DB
    .prepare(`
      INSERT INTO favorites (user_id, type, entity_id, sport, league, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      userId,
      type,
      entityId,
      body.sport ? String(body.sport).toLowerCase() : null,
      body.league || null,
      body.metadata ? JSON.stringify(body.metadata) : null
    )
    .run();

  const watchlistType = toWatchlistItemType(type);
  if (watchlistType) {
    try {
      const watchlistId = await getOrCreateDefaultWatchlistId(c.env.DB, userId);
      await c.env.DB
        .prepare(`
          INSERT OR IGNORE INTO watchlist_items
          (watchlist_id, user_id, item_type, item_id, sport_type, display_name, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          watchlistId,
          userId,
          watchlistType,
          entityId,
          body.sport ? String(body.sport).toLowerCase() : null,
          body.metadata ? String((body.metadata as Record<string, unknown>).team_name || (body.metadata as Record<string, unknown>).player_name || entityId) : entityId,
          body.metadata ? JSON.stringify(body.metadata) : null
        )
        .run();
    } catch {
      // no-op: keep favorites flow resilient if legacy watchlist is unavailable
    }
  }

  return c.json({ success: true, is_favorite: true });
});

favoritesRouter.get("/dashboard", async (c) => {
  const userId = getUserId(c);
  await hydrateLegacyFavorites(c.env.DB, userId);
  const favoritesRes = await c.env.DB
    .prepare(`SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<FavoriteRow>();
  const allFavorites = favoritesRes.results || [];

  const teams = allFavorites.filter((f) => f.type === "team");
  const players = allFavorites.filter((f) => f.type === "player");
  const livePriority: Array<Record<string, unknown>> = [];

  const teamCards = await Promise.all(
    teams.map(async (team) => {
      const metadata = parseMetadata(team.metadata);
      const teamCode = String(metadata.team_code || metadata.team_abbr || team.entity_id).toUpperCase();
      const teamName = String(metadata.team_name || team.entity_id);
      const sport = String(team.sport || metadata.sport || "").toLowerCase();
      const nowIso = new Date().toISOString();

      const game = await c.env.DB
        .prepare(`
          SELECT *
          FROM sdio_games
          WHERE (UPPER(COALESCE(home_team, '')) = ? OR UPPER(COALESCE(away_team, '')) = ?
              OR LOWER(COALESCE(home_team_name, '')) = ? OR LOWER(COALESCE(away_team_name, '')) = ?)
            AND (? = '' OR LOWER(COALESCE(sport, '')) = ?)
            AND datetime(start_time) >= datetime(?, '-4 hours')
          ORDER BY
            CASE WHEN UPPER(status) IN ('LIVE', 'IN_PROGRESS') THEN 0 ELSE 1 END,
            datetime(start_time) ASC
          LIMIT 1
        `)
        .bind(
          teamCode,
          teamCode,
          teamName.toLowerCase(),
          teamName.toLowerCase(),
          sport,
          sport,
          nowIso
        )
        .first<Record<string, unknown>>()
        .catch(() => null);

      let odds: Record<string, unknown> | null = null;
      if (game?.id) {
        odds = await safeFirst<Record<string, unknown>>(
          c.env.DB,
          `
          SELECT spread_home, spread_away, total, moneyline_home, moneyline_away, updated_at
          FROM sdio_odds_current
          WHERE game_id = ?
          LIMIT 1
          `,
          [String(game.id)]
        );
      }

      const live = isLiveStatus(game?.status);
      if (live) {
        livePriority.push({
          kind: "team",
          favorite_id: team.id,
          entity_id: team.entity_id,
          team_code: teamCode,
          team_name: teamName,
          game,
        });
      }

      return {
        id: team.id,
        entity_id: team.entity_id,
        sport: sport || null,
        league: team.league,
        team_code: teamCode,
        team_name: teamName,
        metadata,
        next_game: game || null,
        current_odds: odds || null,
        is_live: live,
      };
    })
  );

  const playerCards = await Promise.all(
    players.map(async (player) => {
      const metadata = parseMetadata(player.metadata);
      const playerName = String(metadata.player_name || player.entity_id);
      const teamCode = String(metadata.team_code || metadata.team_abbr || "").toUpperCase();
      const sport = String(player.sport || metadata.sport || "").toLowerCase();
      const nowIso = new Date().toISOString();

      const topProps = await safeAll<Record<string, unknown>>(
        c.env.DB,
        `
        SELECT prop_type, line, over_odds, under_odds, updated_at
        FROM sdio_props_current
        WHERE LOWER(COALESCE(player_name, '')) = ?
        ORDER BY datetime(updated_at) DESC
        LIMIT 3
        `,
        [playerName.toLowerCase()]
      );

      const game = teamCode
        ? await safeFirst<Record<string, unknown>>(
            c.env.DB,
            `
            SELECT *
            FROM sdio_games
            WHERE (UPPER(COALESCE(home_team, '')) = ? OR UPPER(COALESCE(away_team, '')) = ?)
              AND (? = '' OR LOWER(COALESCE(sport, '')) = ?)
              AND datetime(start_time) >= datetime(?, '-4 hours')
            ORDER BY
              CASE WHEN UPPER(status) IN ('LIVE', 'IN_PROGRESS') THEN 0 ELSE 1 END,
              datetime(start_time) ASC
            LIMIT 1
            `,
            [teamCode, teamCode, sport, sport, nowIso]
          )
        : null;

      const live = isLiveStatus(game?.status);
      if (live) {
        livePriority.push({
          kind: "player",
          favorite_id: player.id,
          entity_id: player.entity_id,
          player_name: playerName,
          team_code: teamCode || null,
          game,
        });
      }

      return {
        id: player.id,
        entity_id: player.entity_id,
        sport: sport || null,
        league: player.league,
        player_name: playerName,
        team_code: teamCode || null,
        metadata,
        next_game: game || null,
        props: topProps,
        is_live: live,
      };
    })
  );

  return c.json({
    teams: teamCards,
    players: playerCards,
    live_priority: livePriority,
    counts: {
      total: allFavorites.length,
      teams: teamCards.length,
      players: playerCards.length,
      live: livePriority.length,
    },
  });
});

favoritesRouter.get("/alerts/preferences", async (c) => {
  const userId = getUserId(c);
  const entityId = String(c.req.query("entity_id") || "").trim();

  let sql = `SELECT entity_id, alert_type, enabled FROM alerts_preferences WHERE user_id = ?`;
  const params: Array<string> = [userId];
  if (entityId) {
    sql += ` AND entity_id = ?`;
    params.push(entityId);
  }
  sql += ` ORDER BY entity_id ASC, alert_type ASC`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all<{
    entity_id: string;
    alert_type: string;
    enabled: number;
  }>();

  return c.json({
    preferences: (rows.results || []).map((r) => ({
      entity_id: r.entity_id,
      alert_type: r.alert_type,
      enabled: Number(r.enabled) === 1,
    })),
  });
});

favoritesRouter.put("/alerts/preferences", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json<{
    entity_id: string;
    alert_type: string;
    enabled: boolean;
  }>();
  const entityId = String(body.entity_id || "").trim();
  const alertType = String(body.alert_type || "").trim().toLowerCase();
  if (!entityId || !alertType) {
    return c.json({ error: "entity_id and alert_type are required" }, 400);
  }

  await c.env.DB
    .prepare(`
      INSERT INTO alerts_preferences (user_id, entity_id, alert_type, enabled, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, entity_id, alert_type)
      DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
    `)
    .bind(userId, entityId, alertType, body.enabled ? 1 : 0)
    .run();

  return c.json({ success: true });
});

export default favoritesRouter;
