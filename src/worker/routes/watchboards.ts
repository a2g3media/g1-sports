/**
 * Watchboard API Routes
 * CRUD operations for watchboards and their games
 */

import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};

const watchboardsRouter = new Hono<{ Bindings: Bindings }>();

let ensureWatchboardSchemaPromise: Promise<void> | null = null;

async function ensureWatchboardSchema(db: D1Database): Promise<void> {
  if (ensureWatchboardSchemaPromise) {
    await ensureWatchboardSchemaPromise;
    return;
  }

  ensureWatchboardSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS watchboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'My Watchboard',
        pinned_game_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS watchboard_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watchboard_id INTEGER NOT NULL,
        game_id TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        added_from TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS watchboard_props (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watchboard_id INTEGER NOT NULL,
        game_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        player_id TEXT,
        team TEXT,
        sport TEXT NOT NULL,
        prop_type TEXT NOT NULL,
        line_value REAL NOT NULL DEFAULT 0,
        selection TEXT NOT NULL DEFAULT '',
        odds_american INTEGER,
        current_stat_value REAL,
        order_index INTEGER NOT NULL DEFAULT 0,
        added_from TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS watchboard_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watchboard_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        player_id TEXT,
        sport TEXT NOT NULL,
        team TEXT,
        team_abbr TEXT,
        position TEXT,
        headshot_url TEXT,
        prop_type TEXT,
        prop_line REAL,
        prop_selection TEXT,
        current_stat_value REAL,
        order_index INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  })();

  try {
    await ensureWatchboardSchemaPromise;
  } finally {
    ensureWatchboardSchemaPromise = null;
  }
}

watchboardsRouter.use("*", async (c, next) => {
  await ensureWatchboardSchema(c.env.DB);
  return next();
});

// Types
interface Watchboard {
  id: number;
  user_id: string;
  name: string;
  pinned_game_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WatchboardGame {
  id: number;
  watchboard_id: number;
  game_id: string;
  order_index: number;
  added_from: string | null;
  created_at: string;
  updated_at: string;
}

interface WatchboardProp {
  id: number;
  watchboard_id: number;
  game_id: string;
  player_name: string;
  player_id: string | null;
  team: string | null;
  sport: string;
  prop_type: string;
  line_value: number;
  selection: string;
  odds_american: number | null;
  current_stat_value: number | null;
  order_index: number;
  added_from: string | null;
  created_at: string;
  updated_at: string;
}

interface WatchboardPlayer {
  id: number;
  watchboard_id: number;
  user_id: string;
  player_name: string;
  player_id: string | null;
  sport: string;
  team: string | null;
  team_abbr: string | null;
  position: string | null;
  headshot_url: string | null;
  prop_type: string | null;
  prop_line: number | null;
  prop_selection: string | null;
  current_stat_value: number | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to get or create default watchboard for user
async function getOrCreateDefaultWatchboard(db: D1Database, userId: string): Promise<Watchboard> {
  // Check for existing active board
  const existing = await db
    .prepare("SELECT * FROM watchboards WHERE user_id = ? AND is_active = 1 LIMIT 1")
    .bind(userId)
    .first<Watchboard>();
  
  if (existing) return existing;

  // Check for any board
  const anyBoard = await db
    .prepare("SELECT * FROM watchboards WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first<Watchboard>();
  
  if (anyBoard) {
    // Make it active
    await db.prepare("UPDATE watchboards SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(anyBoard.id)
      .run();
    return { ...anyBoard, is_active: true };
  }

  // Create default board
  const result = await db
    .prepare("INSERT INTO watchboards (user_id, name, is_active) VALUES (?, 'My Watchboard', 1)")
    .bind(userId)
    .run();
  
  const newBoard = await db
    .prepare("SELECT * FROM watchboards WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Watchboard>();
  
  return newBoard!;
}

// GET /api/watchboards - List all boards for user
watchboardsRouter.get("/", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;

  try {
    const boards = await db
      .prepare("SELECT * FROM watchboards WHERE user_id = ? ORDER BY created_at ASC")
      .bind(userId)
      .all<Watchboard>();

    // If no boards, create default
    if (boards.results.length === 0) {
      const defaultBoard = await getOrCreateDefaultWatchboard(db, userId);
      return c.json({ boards: [defaultBoard] });
    }

    return c.json({ boards: boards.results });
  } catch (error) {
    console.error("[Watchboards] Error listing boards:", error);
    return c.json({ error: "Failed to list watchboards" }, 500);
  }
});

// GET /api/watchboards/active - Get active board with games
watchboardsRouter.get("/active", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);
    
    // Get games in this board
    const games = await db
      .prepare("SELECT * FROM watchboard_games WHERE watchboard_id = ? ORDER BY order_index ASC")
      .bind(board.id)
      .all<WatchboardGame>();

    return c.json({ 
      board,
      games: games.results,
      gameIds: games.results.map((g: WatchboardGame) => g.game_id)
    });
  } catch (error) {
    console.error("[Watchboards] Error getting active board:", error);
    return c.json({ error: "Failed to get active watchboard" }, 500);
  }
});

// GET /api/watchboards/home-preview - Get all boards with games for home screen
// OPTIMIZED: Returns full game data in single query to avoid N+1 problem
watchboardsRouter.get("/home-preview", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;

  try {
    // Get all boards for user
    const boards = await db
      .prepare("SELECT * FROM watchboards WHERE user_id = ? ORDER BY updated_at DESC")
      .bind(userId)
      .all<Watchboard>();

    if (boards.results.length === 0) {
      return c.json({ boards: [] });
    }

    // Get games for all boards with full game data in one query
    const boardIds = boards.results.map(b => b.id);
    const placeholders = boardIds.map(() => "?").join(",");
    
    type HomePreviewRow = {
      watchboard_id: number;
      game_id: string;
      order_index: number;
      sport: string | null;
      home_team_code: string | null;
      away_team_code: string | null;
      home_team_name: string | null;
      away_team_name: string | null;
      home_score: number | null;
      away_score: number | null;
      status: string | null;
      start_time: string | null;
      period_label: string | null;
      clock: string | null;
    };

    // Join watchboard_games with sdio_games to get full game data.
    // If sdio tables are unavailable, gracefully fall back to IDs-only payload.
    let allGamesWithData: { results: HomePreviewRow[] } = { results: [] };
    try {
      allGamesWithData = await db
        .prepare(`
          SELECT 
            wg.watchboard_id,
            wg.game_id,
            wg.order_index,
            g.sport,
            g.home_team AS home_team_code,
            g.away_team AS away_team_code,
            g.home_team_name,
            g.away_team_name,
            g.score_home AS home_score,
            g.score_away AS away_score,
            g.status,
            g.start_time,
            g.period AS period_label,
            g.clock
          FROM watchboard_games wg
          LEFT JOIN sdio_games g ON wg.game_id = g.provider_game_id
          WHERE wg.watchboard_id IN (${placeholders})
          ORDER BY wg.order_index ASC
        `)
        .bind(...boardIds)
        .all<HomePreviewRow>();
    } catch (error) {
      console.warn("[Watchboards] home-preview game join unavailable, returning ids only", error);
      const idsOnly = await db
        .prepare(`
          SELECT watchboard_id, game_id, order_index
          FROM watchboard_games
          WHERE watchboard_id IN (${placeholders})
          ORDER BY order_index ASC
        `)
        .bind(...boardIds)
        .all<{ watchboard_id: number; game_id: string; order_index: number }>();
      allGamesWithData = {
        results: (idsOnly.results || []).map((row) => ({
          watchboard_id: row.watchboard_id,
          game_id: row.game_id,
          order_index: row.order_index,
          sport: null,
          home_team_code: null,
          away_team_code: null,
          home_team_name: null,
          away_team_name: null,
          home_score: null,
          away_score: null,
          status: null,
          start_time: null,
          period_label: null,
          clock: null,
        })),
      };
    }

    // Group games by board with full data
    const gamesByBoard: Record<number, { gameIds: string[]; games: Array<{
      game_id: string;
      sport: string;
      home_team_code: string;
      away_team_code: string;
      home_team_name: string | null;
      away_team_name: string | null;
      home_score: number | null;
      away_score: number | null;
      status: string;
      start_time: string;
      period_label: string | null;
      clock: string | null;
      needs_fetch?: boolean;
    }> }> = {};
    
    for (const row of allGamesWithData.results) {
      if (!gamesByBoard[row.watchboard_id]) {
        gamesByBoard[row.watchboard_id] = { gameIds: [], games: [] };
      }
      gamesByBoard[row.watchboard_id].gameIds.push(row.game_id);
      
      // If join succeeded (game exists in sdio_games), add full data
      if (row.sport) {
        gamesByBoard[row.watchboard_id].games.push({
          game_id: row.game_id,
          sport: row.sport,
          home_team_code: row.home_team_code || 'TBD',
          away_team_code: row.away_team_code || 'TBD',
          home_team_name: row.home_team_name,
          away_team_name: row.away_team_name,
          home_score: row.home_score,
          away_score: row.away_score,
          status: row.status || 'SCHEDULED',
          start_time: row.start_time || new Date().toISOString(),
          period_label: row.period_label,
          clock: row.clock,
        });
      } else {
        // Game not in sdio_games - likely soccer (SportsRadar) or other external source
        // Add placeholder entry so frontend knows to fetch from appropriate API
        const isSoccerMatch = row.game_id.startsWith('sr:');
        gamesByBoard[row.watchboard_id].games.push({
          game_id: row.game_id,
          sport: isSoccerMatch ? 'soccer' : 'unknown',
          home_team_code: 'TBD',
          away_team_code: 'TBD',
          home_team_name: null,
          away_team_name: null,
          home_score: null,
          away_score: null,
          status: 'SCHEDULED',
          start_time: new Date().toISOString(),
          period_label: null,
          clock: null,
          needs_fetch: true,
        });
      }
    }

    // Return boards with their game IDs AND full game data
    const boardsWithGames = boards.results.map(board => ({
      id: board.id,
      name: board.name,
      gameIds: gamesByBoard[board.id]?.gameIds || [],
      games: gamesByBoard[board.id]?.games || [],
    }));

    return c.json({ boards: boardsWithGames });
  } catch (error) {
    console.error("[Watchboards] Error getting home preview:", error);
    return c.json({ error: "Failed to get watchboards preview" }, 500);
  }
});

// POST /api/watchboards - Create new board
watchboardsRouter.post("/", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const { name } = await c.req.json<{ name: string }>();

  if (!name || name.trim().length === 0) {
    return c.json({ error: "Board name is required" }, 400);
  }

  try {
    const result = await db
      .prepare("INSERT INTO watchboards (user_id, name, is_active) VALUES (?, ?, 0)")
      .bind(userId, name.trim())
      .run();

    const newBoard = await db
      .prepare("SELECT * FROM watchboards WHERE id = ?")
      .bind(result.meta.last_row_id)
      .first<Watchboard>();

    return c.json({ board: newBoard }, 201);
  } catch (error) {
    console.error("[Watchboards] Error creating board:", error);
    return c.json({ error: "Failed to create watchboard" }, 500);
  }
});

// PUT /api/watchboards/:id - Update board (rename, set active, set pinned)
watchboardsRouter.put("/:id", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const boardId = parseInt(c.req.param("id"));
  const updates = await c.req.json<{ name?: string; is_active?: boolean; pinned_game_id?: string | null }>();

  try {
    // Verify ownership
    const existing = await db
      .prepare("SELECT * FROM watchboards WHERE id = ? AND user_id = ?")
      .bind(boardId, userId)
      .first<Watchboard>();

    if (!existing) {
      return c.json({ error: "Watchboard not found" }, 404);
    }

    // Build update query
    const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: (string | number | null)[] = [];

    if (updates.name !== undefined) {
      setClauses.push("name = ?");
      values.push(updates.name.trim());
    }

    if (updates.is_active !== undefined && updates.is_active) {
      // First deactivate all other boards
      await db.prepare("UPDATE watchboards SET is_active = 0 WHERE user_id = ?").bind(userId).run();
      setClauses.push("is_active = 1");
    }

    if (updates.pinned_game_id !== undefined) {
      setClauses.push("pinned_game_id = ?");
      values.push(updates.pinned_game_id);
    }

    values.push(boardId);
    
    await db
      .prepare(`UPDATE watchboards SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    const updated = await db
      .prepare("SELECT * FROM watchboards WHERE id = ?")
      .bind(boardId)
      .first<Watchboard>();

    return c.json({ board: updated });
  } catch (error) {
    console.error("[Watchboards] Error updating board:", error);
    return c.json({ error: "Failed to update watchboard" }, 500);
  }
});

// DELETE /api/watchboards/:id - Delete board
watchboardsRouter.delete("/:id", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const boardId = parseInt(c.req.param("id"));

  try {
    // Verify ownership and not the only board
    const boards = await db
      .prepare("SELECT * FROM watchboards WHERE user_id = ?")
      .bind(userId)
      .all<Watchboard>();

    if (boards.results.length <= 1) {
      return c.json({ error: "Cannot delete your only watchboard" }, 400);
    }

    const board = boards.results.find((b: Watchboard) => b.id === boardId);
    if (!board) {
      return c.json({ error: "Watchboard not found" }, 404);
    }

    // Delete games in board first
    await db.prepare("DELETE FROM watchboard_games WHERE watchboard_id = ?").bind(boardId).run();
    
    // Delete board
    await db.prepare("DELETE FROM watchboards WHERE id = ?").bind(boardId).run();

    // If deleted board was active, make another active
    if (board.is_active) {
      const remaining = boards.results.find((b: Watchboard) => b.id !== boardId);
      if (remaining) {
        await db.prepare("UPDATE watchboards SET is_active = 1 WHERE id = ?").bind(remaining.id).run();
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error deleting board:", error);
    return c.json({ error: "Failed to delete watchboard" }, 500);
  }
});

// POST /api/watchboards/games - Add game to a specific board or active board
watchboardsRouter.post("/games", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const { game_id, added_from, board_id } = await c.req.json<{ game_id: string; added_from?: string; board_id?: number }>();

  if (!game_id) {
    return c.json({ error: "game_id is required" }, 400);
  }

  try {
    let board: Watchboard;
    
    // If board_id specified, use that board (verify ownership)
    if (board_id) {
      const specificBoard = await db
        .prepare("SELECT * FROM watchboards WHERE id = ? AND user_id = ?")
        .bind(board_id, userId)
        .first<Watchboard>();
      
      if (!specificBoard) {
        return c.json({ error: "Watchboard not found" }, 404);
      }
      board = specificBoard;
    } else {
      // Fallback to active board
      board = await getOrCreateDefaultWatchboard(db, userId);
    }

    // Check if already exists in this board
    const existing = await db
      .prepare("SELECT id FROM watchboard_games WHERE watchboard_id = ? AND game_id = ?")
      .bind(board.id, game_id)
      .first();

    if (existing) {
      return c.json({ error: "Game already in watchboard", alreadyExists: true, boardName: board.name }, 400);
    }

    // Get max order_index
    const maxOrder = await db
      .prepare("SELECT MAX(order_index) as max_order FROM watchboard_games WHERE watchboard_id = ?")
      .bind(board.id)
      .first<{ max_order: number | null }>();

    const nextOrder = (maxOrder?.max_order ?? -1) + 1;

    await db
      .prepare("INSERT INTO watchboard_games (watchboard_id, game_id, order_index, added_from) VALUES (?, ?, ?, ?)")
      .bind(board.id, game_id, nextOrder, added_from || null)
      .run();

    return c.json({ success: true, boardId: board.id, boardName: board.name, order_index: nextOrder }, 201);
  } catch (error) {
    console.error("[Watchboards] Error adding game:", error);
    return c.json({ error: "Failed to add game to watchboard" }, 500);
  }
});

// DELETE /api/watchboards/games/:gameId - Remove game from active board
watchboardsRouter.delete("/games/:gameId", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const gameId = c.req.param("gameId");

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    await db
      .prepare("DELETE FROM watchboard_games WHERE watchboard_id = ? AND game_id = ?")
      .bind(board.id, gameId)
      .run();

    // Re-index remaining games
    const remaining = await db
      .prepare("SELECT id FROM watchboard_games WHERE watchboard_id = ? ORDER BY order_index ASC")
      .bind(board.id)
      .all<{ id: number }>();

    for (let i = 0; i < remaining.results.length; i++) {
      await db
        .prepare("UPDATE watchboard_games SET order_index = ? WHERE id = ?")
        .bind(i, remaining.results[i].id)
        .run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error removing game:", error);
    return c.json({ error: "Failed to remove game from watchboard" }, 500);
  }
});

// PUT /api/watchboards/games/reorder - Reorder games in active board
watchboardsRouter.put("/games/reorder", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const { gameIds } = await c.req.json<{ gameIds: string[] }>();

  if (!gameIds || !Array.isArray(gameIds)) {
    return c.json({ error: "gameIds array is required" }, 400);
  }

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    // Update each game's order_index
    for (let i = 0; i < gameIds.length; i++) {
      await db
        .prepare("UPDATE watchboard_games SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE watchboard_id = ? AND game_id = ?")
        .bind(i, board.id, gameIds[i])
        .run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error reordering games:", error);
    return c.json({ error: "Failed to reorder games" }, 500);
  }
});

// GET /api/watchboards/games/check/:gameId - Check if game is in active board
watchboardsRouter.get("/games/check/:gameId", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const gameId = c.req.param("gameId");

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    const existing = await db
      .prepare("SELECT id FROM watchboard_games WHERE watchboard_id = ? AND game_id = ?")
      .bind(board.id, gameId)
      .first();

    return c.json({ inWatchboard: !!existing });
  } catch (error) {
    console.error("[Watchboards] Error checking game:", error);
    return c.json({ error: "Failed to check game" }, 500);
  }
});

// ============================================
// PLAYER PROPS ROUTES
// ============================================

// GET /api/watchboards/props - Get all props in active board
watchboardsRouter.get("/props", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    const props = await db
      .prepare("SELECT * FROM watchboard_props WHERE watchboard_id = ? ORDER BY order_index ASC")
      .bind(board.id)
      .all<WatchboardProp>();

    return c.json({ props: props.results });
  } catch (error) {
    console.error("[Watchboards] Error getting props:", error);
    return c.json({ error: "Failed to get props" }, 500);
  }
});

// POST /api/watchboards/props - Add prop to specific board or active board
watchboardsRouter.post("/props", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const body = await c.req.json<{
    game_id: string;
    player_name: string;
    player_id?: string;
    team?: string;
    sport: string;
    prop_type: string;
    line_value: number;
    selection: string;
    odds_american?: number;
    added_from?: string;
    board_id?: number;
  }>();

  // Validate required fields
  if (!body.player_name || !body.sport || !body.prop_type || body.line_value === undefined || !body.selection) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    let board: Watchboard;
    
    // If board_id specified, use that board (verify ownership)
    if (body.board_id) {
      const specificBoard = await db
        .prepare("SELECT * FROM watchboards WHERE id = ? AND user_id = ?")
        .bind(body.board_id, userId)
        .first<Watchboard>();
      
      if (!specificBoard) {
        return c.json({ error: "Watchboard not found" }, 404);
      }
      board = specificBoard;
    } else {
      // Fallback to active board
      board = await getOrCreateDefaultWatchboard(db, userId);
    }

    // Check if prop already exists (same player, same prop type, same game)
    const existing = await db
      .prepare("SELECT id FROM watchboard_props WHERE watchboard_id = ? AND game_id = ? AND player_name = ? AND prop_type = ?")
      .bind(board.id, body.game_id, body.player_name, body.prop_type)
      .first();

    if (existing) {
      return c.json({ error: "Prop already tracked", alreadyExists: true }, 400);
    }

    // Get max order_index
    const maxOrder = await db
      .prepare("SELECT MAX(order_index) as max_order FROM watchboard_props WHERE watchboard_id = ?")
      .bind(board.id)
      .first<{ max_order: number | null }>();

    const nextOrder = (maxOrder?.max_order ?? -1) + 1;

    await db
      .prepare(`
        INSERT INTO watchboard_props 
        (watchboard_id, game_id, player_name, player_id, team, sport, prop_type, line_value, selection, odds_american, order_index, added_from) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        board.id,
        body.game_id,
        body.player_name,
        body.player_id || null,
        body.team || null,
        body.sport,
        body.prop_type,
        body.line_value,
        body.selection,
        body.odds_american || null,
        nextOrder,
        body.added_from || null
      )
      .run();

    return c.json({ success: true, boardId: board.id, boardName: board.name }, 201);
  } catch (error) {
    console.error("[Watchboards] Error adding prop:", error);
    return c.json({ error: "Failed to add prop" }, 500);
  }
});

// PUT /api/watchboards/props/:propId - Update prop (e.g., current stat value)
watchboardsRouter.put("/props/:propId", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const propId = parseInt(c.req.param("propId"));
  const updates = await c.req.json<{ current_stat_value?: number; selection?: string; line_value?: number }>();

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    // Verify ownership
    const existing = await db
      .prepare("SELECT id FROM watchboard_props WHERE id = ? AND watchboard_id = ?")
      .bind(propId, board.id)
      .first();

    if (!existing) {
      return c.json({ error: "Prop not found" }, 404);
    }

    const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: (string | number | null)[] = [];

    if (updates.current_stat_value !== undefined) {
      setClauses.push("current_stat_value = ?");
      values.push(updates.current_stat_value);
    }

    if (updates.selection !== undefined) {
      setClauses.push("selection = ?");
      values.push(updates.selection);
    }

    if (updates.line_value !== undefined) {
      setClauses.push("line_value = ?");
      values.push(updates.line_value);
    }

    values.push(propId);

    await db
      .prepare(`UPDATE watchboard_props SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error updating prop:", error);
    return c.json({ error: "Failed to update prop" }, 500);
  }
});

// DELETE /api/watchboards/props/:propId - Remove prop from board
watchboardsRouter.delete("/props/:propId", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const propId = parseInt(c.req.param("propId"));

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    await db
      .prepare("DELETE FROM watchboard_props WHERE id = ? AND watchboard_id = ?")
      .bind(propId, board.id)
      .run();

    // Re-index remaining props
    const remaining = await db
      .prepare("SELECT id FROM watchboard_props WHERE watchboard_id = ? ORDER BY order_index ASC")
      .bind(board.id)
      .all<{ id: number }>();

    for (let i = 0; i < remaining.results.length; i++) {
      await db
        .prepare("UPDATE watchboard_props SET order_index = ? WHERE id = ?")
        .bind(i, remaining.results[i].id)
        .run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error removing prop:", error);
    return c.json({ error: "Failed to remove prop" }, 500);
  }
});

// PUT /api/watchboards/props/reorder - Reorder props in active board
watchboardsRouter.put("/props/reorder", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const { propIds } = await c.req.json<{ propIds: number[] }>();

  if (!propIds || !Array.isArray(propIds)) {
    return c.json({ error: "propIds array is required" }, 400);
  }

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    for (let i = 0; i < propIds.length; i++) {
      await db
        .prepare("UPDATE watchboard_props SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND watchboard_id = ?")
        .bind(i, propIds[i], board.id)
        .run();
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error reordering props:", error);
    return c.json({ error: "Failed to reorder props" }, 500);
  }
});

// =====================================================
// LIVE PROP STATS
// =====================================================

// Map prop types to box score stat fields
const PROP_TYPE_TO_STAT: Record<string, string[]> = {
  points: ['points'],
  rebounds: ['rebounds'],
  assists: ['assists'],
  steals: ['steals'],
  blocks: ['blocks'],
  threes: ['fg3Made'],
  turnovers: ['turnovers'],
  pts_reb_ast: ['points', 'rebounds', 'assists'],
  pts_reb: ['points', 'rebounds'],
  pts_ast: ['points', 'assists'],
  reb_ast: ['rebounds', 'assists'],
  passing_yards: ['passingYards'],
  rushing_yards: ['rushingYards'],
  receiving_yards: ['receivingYards'],
  touchdowns: ['touchdowns'],
  strikeouts: ['strikeouts'],
  hits: ['hits'],
  home_runs: ['homeRuns'],
  goals: ['goals'],
  saves: ['saves'],
};

interface BoxScorePlayerStats {
  name: string;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  fg3Made?: number;
  turnovers?: number;
  passingYards?: number;
  rushingYards?: number;
  receivingYards?: number;
  touchdowns?: number;
  strikeouts?: number;
  hits?: number;
  homeRuns?: number;
  goals?: number;
  saves?: number;
}

// GET /api/watchboards/props/stats - Fetch live stats for tracked props
watchboardsRouter.get("/props/stats", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);
    
    // Get all props for active board
    const propsResult = await db
      .prepare("SELECT * FROM watchboard_props WHERE watchboard_id = ? ORDER BY order_index ASC")
      .bind(board.id)
      .all<WatchboardProp>();
    
    const props = propsResult.results || [];
    if (props.length === 0) {
      return c.json({ stats: {} }, 200);
    }

    // SportsRadar player box-score mapping is not fully wired in this endpoint yet.
    // Return deterministic nulls so UI remains stable without legacy provider dependency.
    const stats: Record<number, number | null> = {};
    for (const prop of props) {
      stats[prop.id] = null;
    }

    return c.json({
      stats,
      source: "sportsradar_pending",
      message: "Live prop stat mapping is pending SportsRadar player-stat wiring."
    }, 200);
  } catch (error) {
    console.error("[Watchboards] Error fetching prop stats:", error);
    return c.json({ error: "Failed to fetch prop stats", stats: {} }, 500);
  }
});

// ============================================
// FOLLOWED PLAYERS ROUTES
// ============================================

// GET /api/watchboards/players - Get all followed players for active board
watchboardsRouter.get("/players", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    const players = await db
      .prepare("SELECT * FROM watchboard_players WHERE watchboard_id = ? AND is_active = 1 ORDER BY order_index ASC")
      .bind(board.id)
      .all<WatchboardPlayer>();

    return c.json({ players: players.results });
  } catch (error) {
    console.error("[Watchboards] Error getting players:", error);
    return c.json({ error: "Failed to get followed players" }, 500);
  }
});

// GET /api/watchboards/players/check/:sport/:playerName - Check if player is followed
watchboardsRouter.get("/players/check/:sport/:playerName", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const sport = c.req.param("sport");
  const playerName = decodeURIComponent(c.req.param("playerName"));

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    const existing = await db
      .prepare("SELECT id, prop_type, prop_line, prop_selection FROM watchboard_players WHERE watchboard_id = ? AND player_name = ? AND sport = ? AND is_active = 1")
      .bind(board.id, playerName, sport)
      .first();

    return c.json({ 
      isFollowing: !!existing,
      followedPlayer: existing || null
    });
  } catch (error) {
    console.error("[Watchboards] Error checking player:", error);
    return c.json({ error: "Failed to check player" }, 500);
  }
});

// POST /api/watchboards/players - Follow a player
watchboardsRouter.post("/players", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const body = await c.req.json<{
    player_name: string;
    player_id?: string;
    sport: string;
    team?: string;
    team_abbr?: string;
    position?: string;
    headshot_url?: string;
    prop_type?: string;
    prop_line?: number;
    prop_selection?: string;
    board_id?: number;
  }>();

  if (!body.player_name || !body.sport) {
    return c.json({ error: "player_name and sport are required" }, 400);
  }

  try {
    let board = await getOrCreateDefaultWatchboard(db, userId);
    if (body.board_id) {
      const requestedBoard = await db
        .prepare("SELECT * FROM watchboards WHERE id = ? AND user_id = ?")
        .bind(body.board_id, userId)
        .first<Watchboard>();
      if (!requestedBoard) {
        return c.json({ error: "Watchboard not found" }, 404);
      }
      board = requestedBoard;
    }

    // Check if already following
    const existing = await db
      .prepare("SELECT id FROM watchboard_players WHERE watchboard_id = ? AND player_name = ? AND sport = ?")
      .bind(board.id, body.player_name, body.sport)
      .first();

    if (existing) {
      // Update existing (reactivate if inactive, update prop if provided)
      const setClauses = ["is_active = 1", "updated_at = CURRENT_TIMESTAMP"];
      const values: (string | number | null)[] = [];

      if (body.prop_type !== undefined) {
        setClauses.push("prop_type = ?");
        values.push(body.prop_type || null);
      }
      if (body.prop_line !== undefined) {
        setClauses.push("prop_line = ?");
        values.push(body.prop_line);
      }
      if (body.prop_selection !== undefined) {
        setClauses.push("prop_selection = ?");
        values.push(body.prop_selection || null);
      }
      if (body.headshot_url) {
        setClauses.push("headshot_url = ?");
        values.push(body.headshot_url);
      }

      values.push((existing as { id: number }).id);

      await db
        .prepare(`UPDATE watchboard_players SET ${setClauses.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();

      return c.json({ success: true, updated: true, boardName: board.name });
    }

    // Get max order_index
    const maxOrder = await db
      .prepare("SELECT MAX(order_index) as max_order FROM watchboard_players WHERE watchboard_id = ?")
      .bind(board.id)
      .first<{ max_order: number | null }>();

    const nextOrder = (maxOrder?.max_order ?? -1) + 1;

    await db
      .prepare(`
        INSERT INTO watchboard_players 
        (watchboard_id, user_id, player_name, player_id, sport, team, team_abbr, position, headshot_url, prop_type, prop_line, prop_selection, order_index) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        board.id,
        userId,
        body.player_name,
        body.player_id || null,
        body.sport,
        body.team || null,
        body.team_abbr || null,
        body.position || null,
        body.headshot_url || null,
        body.prop_type || null,
        body.prop_line ?? null,
        body.prop_selection || null,
        nextOrder
      )
      .run();

    return c.json({ success: true, boardName: board.name }, 201);
  } catch (error) {
    console.error("[Watchboards] Error following player:", error);
    return c.json({ error: "Failed to follow player" }, 500);
  }
});

// PUT /api/watchboards/players/:playerId - Update followed player (e.g., change prop to track)
watchboardsRouter.put("/players/:playerId", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const playerId = parseInt(c.req.param("playerId"));
  const updates = await c.req.json<{
    prop_type?: string;
    prop_line?: number;
    prop_selection?: string;
    current_stat_value?: number;
  }>();

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    // Verify ownership
    const existing = await db
      .prepare("SELECT id FROM watchboard_players WHERE id = ? AND watchboard_id = ?")
      .bind(playerId, board.id)
      .first();

    if (!existing) {
      return c.json({ error: "Player not found" }, 404);
    }

    const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: (string | number | null)[] = [];

    if (updates.prop_type !== undefined) {
      setClauses.push("prop_type = ?");
      values.push(updates.prop_type || null);
    }
    if (updates.prop_line !== undefined) {
      setClauses.push("prop_line = ?");
      values.push(updates.prop_line);
    }
    if (updates.prop_selection !== undefined) {
      setClauses.push("prop_selection = ?");
      values.push(updates.prop_selection || null);
    }
    if (updates.current_stat_value !== undefined) {
      setClauses.push("current_stat_value = ?");
      values.push(updates.current_stat_value);
    }

    values.push(playerId);

    await db
      .prepare(`UPDATE watchboard_players SET ${setClauses.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error updating player:", error);
    return c.json({ error: "Failed to update player" }, 500);
  }
});

// DELETE /api/watchboards/players/:playerId - Unfollow a player
watchboardsRouter.delete("/players/:playerId", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const playerId = parseInt(c.req.param("playerId"));

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    // Soft delete (set is_active = 0)
    await db
      .prepare("UPDATE watchboard_players SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND watchboard_id = ?")
      .bind(playerId, board.id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error unfollowing player:", error);
    return c.json({ error: "Failed to unfollow player" }, 500);
  }
});

// DELETE /api/watchboards/players/by-name/:sport/:playerName - Unfollow by name
watchboardsRouter.delete("/players/by-name/:sport/:playerName", async (c) => {
  const userId = c.req.header("x-user-id") || "guest";
  const db = c.env.DB;
  const sport = c.req.param("sport");
  const playerName = decodeURIComponent(c.req.param("playerName"));

  try {
    const board = await getOrCreateDefaultWatchboard(db, userId);

    await db
      .prepare("UPDATE watchboard_players SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE watchboard_id = ? AND player_name = ? AND sport = ?")
      .bind(board.id, playerName, sport)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("[Watchboards] Error unfollowing player:", error);
    return c.json({ error: "Failed to unfollow player" }, 500);
  }
});

export default watchboardsRouter;
