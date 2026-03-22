/**
 * Threshold Engine API Routes
 * 
 * Endpoints for accessing threshold events and "What Just Changed" data
 */

import { Hono } from "hono";
import {
  getWhatJustChanged,
  checkAIActivation,
  simulateSpreadMove,
  simulateInjury,
  simulateWeather,
  simulateSurvivorCascade,
  simulateLeadChange,
  clearDemoThresholdEvents,
  getThresholdConfig,
  processGameStateChange,
  detectGameStarted,
  detectGameEnded,
  type GameLifecycleInput,
} from "../services/thresholdEngine";
import type { Game } from "../../shared/types";

const thresholdsRouter = new Hono<{ Bindings: Env }>();

function isMissingThresholdStorage(error: unknown): boolean {
  const msg = String(error || "").toLowerCase();
  return msg.includes("no such table") || msg.includes("threshold_");
}

/**
 * GET /api/thresholds/what-changed
 * 
 * Returns the top material changes for a given context
 * Query params:
 * - scope: DEMO | PROD (default: PROD)
 * - game_id: optional game filter
 * - league_id: optional league filter
 * - max_items: max items to return (default: 3)
 */
thresholdsRouter.get("/what-changed", async (c) => {
  try {
    const scope = (c.req.query("scope") || "PROD") as "DEMO" | "PROD";
    const gameId = c.req.query("game_id") ? parseInt(c.req.query("game_id")!) : undefined;
    const leagueId = c.req.query("league_id") ? parseInt(c.req.query("league_id")!) : undefined;
    const maxItems = c.req.query("max_items") ? parseInt(c.req.query("max_items")!) : 3;

    const result = await getWhatJustChanged(c.env.DB, {
      dataScope: scope,
      gameId,
      leagueId,
      maxItems
    });

    return c.json(result);
  } catch (error) {
    console.error("Error getting what changed:", error);
    if (isMissingThresholdStorage(error)) {
      return c.json({
        changes: [],
        has_changes: false,
        summary: "Threshold storage not initialized",
      });
    }
    return c.json({ error: "Failed to get changes" }, 500);
  }
});

/**
 * GET /api/thresholds/ai-activation
 * 
 * Check if AI auto-insight is allowed for a game
 * Query params:
 * - scope: DEMO | PROD (default: PROD)
 * - game_id: required game ID
 */
thresholdsRouter.get("/ai-activation", async (c) => {
  try {
    const scope = (c.req.query("scope") || "PROD") as "DEMO" | "PROD";
    const gameId = c.req.query("game_id");

    if (!gameId) {
      return c.json({ error: "game_id is required" }, 400);
    }

    const result = await checkAIActivation(c.env.DB, scope, parseInt(gameId));
    return c.json(result);
  } catch (error) {
    console.error("Error checking AI activation:", error);
    if (isMissingThresholdStorage(error)) {
      return c.json({
        allowed: false,
        reason: "Threshold storage not initialized",
      });
    }
    return c.json({ error: "Failed to check AI activation" }, 500);
  }
});

/**
 * GET /api/thresholds/config
 * 
 * Get current threshold configuration
 */
thresholdsRouter.get("/config", async (c) => {
  try {
    const config = await getThresholdConfig(c.env.DB);
    return c.json({ config });
  } catch (error) {
    console.error("Error getting config:", error);
    if (isMissingThresholdStorage(error)) {
      return c.json({ config: {} });
    }
    return c.json({ error: "Failed to get config" }, 500);
  }
});

/**
 * GET /api/thresholds/events
 * 
 * Get recent threshold events
 * Query params:
 * - scope: DEMO | PROD (default: PROD)
 * - game_id: optional game filter
 * - league_id: optional league filter
 * - category: optional category filter
 * - severity: optional severity filter
 * - limit: max items (default: 50)
 */
thresholdsRouter.get("/events", async (c) => {
  try {
    const scope = c.req.query("scope") || "PROD";
    const gameId = c.req.query("game_id");
    const leagueId = c.req.query("league_id");
    const category = c.req.query("category");
    const severity = c.req.query("severity");
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 50;

    let query = `
      SELECT * FROM threshold_events
      WHERE data_scope = ?
    `;
    const params: (string | number)[] = [scope];

    if (gameId) {
      query += ` AND game_id = ?`;
      params.push(parseInt(gameId));
    }

    if (leagueId) {
      query += ` AND league_context_id = ?`;
      params.push(parseInt(leagueId));
    }

    if (category) {
      query += ` AND event_category = ?`;
      params.push(category);
    }

    if (severity) {
      query += ` AND severity = ?`;
      params.push(severity);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    const events = result.results.map((row: Record<string, unknown>) => ({
      ...row,
      details: row.details_json ? JSON.parse(row.details_json as string) : null
    }));

    return c.json({ events });
  } catch (error) {
    console.error("Error getting events:", error);
    if (isMissingThresholdStorage(error)) {
      return c.json({ events: [] });
    }
    return c.json({ error: "Failed to get events" }, 500);
  }
});

// ============================================
// DEMO SIMULATION ROUTES
// ============================================

/**
 * POST /api/thresholds/demo/simulate-spread-move
 * 
 * Simulate a spread movement for demo testing
 */
thresholdsRouter.post("/demo/simulate-spread-move", async (c) => {
  try {
    const body = await c.req.json();
    const { game_id, old_spread, new_spread, sport_type } = body;

    if (!game_id || old_spread === undefined || new_spread === undefined) {
      return c.json({ error: "game_id, old_spread, and new_spread are required" }, 400);
    }

    const event = await simulateSpreadMove(
      c.env.DB,
      game_id,
      old_spread,
      new_spread,
      sport_type || "NFL"
    );

    return c.json({
      success: true,
      triggered: event !== null,
      event
    });
  } catch (error) {
    console.error("Error simulating spread move:", error);
    return c.json({ error: "Failed to simulate spread move" }, 500);
  }
});

/**
 * POST /api/thresholds/demo/simulate-injury
 * 
 * Simulate an injury update for demo testing
 */
thresholdsRouter.post("/demo/simulate-injury", async (c) => {
  try {
    const body = await c.req.json();
    const { game_id, player_name, position, new_status, sport_type } = body;

    if (!game_id || !player_name || !position || !new_status) {
      return c.json({ error: "game_id, player_name, position, and new_status are required" }, 400);
    }

    const event = await simulateInjury(
      c.env.DB,
      game_id,
      player_name,
      position,
      new_status,
      sport_type || "NFL"
    );

    return c.json({
      success: true,
      triggered: event !== null,
      event
    });
  } catch (error) {
    console.error("Error simulating injury:", error);
    return c.json({ error: "Failed to simulate injury" }, 500);
  }
});

/**
 * POST /api/thresholds/demo/simulate-weather
 * 
 * Simulate a weather threshold for demo testing
 */
thresholdsRouter.post("/demo/simulate-weather", async (c) => {
  try {
    const body = await c.req.json();
    const { game_id, wind_mph, sport_type } = body;

    if (!game_id || wind_mph === undefined) {
      return c.json({ error: "game_id and wind_mph are required" }, 400);
    }

    const events = await simulateWeather(
      c.env.DB,
      game_id,
      wind_mph,
      sport_type || "NFL"
    );

    return c.json({
      success: true,
      triggered: events.length > 0,
      events
    });
  } catch (error) {
    console.error("Error simulating weather:", error);
    return c.json({ error: "Failed to simulate weather" }, 500);
  }
});

/**
 * POST /api/thresholds/demo/simulate-survivor-cascade
 * 
 * Simulate a survivor elimination cascade for demo testing
 */
thresholdsRouter.post("/demo/simulate-survivor-cascade", async (c) => {
  try {
    const body = await c.req.json();
    const { league_id, game_id, team_name, at_risk_count, alive_count, sport_type } = body;

    if (!league_id || !game_id || !team_name || at_risk_count === undefined || alive_count === undefined) {
      return c.json({ 
        error: "league_id, game_id, team_name, at_risk_count, and alive_count are required" 
      }, 400);
    }

    const event = await simulateSurvivorCascade(
      c.env.DB,
      league_id,
      game_id,
      team_name,
      at_risk_count,
      alive_count,
      sport_type || "NFL"
    );

    return c.json({
      success: true,
      triggered: event !== null,
      event
    });
  } catch (error) {
    console.error("Error simulating survivor cascade:", error);
    return c.json({ error: "Failed to simulate survivor cascade" }, 500);
  }
});

/**
 * POST /api/thresholds/demo/simulate-lead-change
 * 
 * Simulate a lead change event for demo testing
 */
thresholdsRouter.post("/demo/simulate-lead-change", async (c) => {
  try {
    const body = await c.req.json();
    const { 
      game_id, home_team, away_team, 
      home_score, away_score, minutes_remaining, 
      sport_type 
    } = body;

    if (!game_id || !home_team || !away_team || 
        home_score === undefined || away_score === undefined || 
        minutes_remaining === undefined) {
      return c.json({ 
        error: "game_id, home_team, away_team, home_score, away_score, and minutes_remaining are required" 
      }, 400);
    }

    const event = await simulateLeadChange(
      c.env.DB,
      game_id,
      home_team,
      away_team,
      home_score,
      away_score,
      minutes_remaining,
      sport_type || "NFL"
    );

    return c.json({
      success: true,
      triggered: event !== null,
      event
    });
  } catch (error) {
    console.error("Error simulating lead change:", error);
    return c.json({ error: "Failed to simulate lead change" }, 500);
  }
});

/**
 * DELETE /api/thresholds/demo/clear
 * 
 * Clear all demo threshold events
 */
thresholdsRouter.delete("/demo/clear", async (c) => {
  try {
    await clearDemoThresholdEvents(c.env.DB);
    return c.json({ success: true, message: "Demo threshold events cleared" });
  } catch (error) {
    console.error("Error clearing demo events:", error);
    if (isMissingThresholdStorage(error)) {
      return c.json({ success: true, message: "Threshold storage not initialized" });
    }
    return c.json({ error: "Failed to clear demo events" }, 500);
  }
});

// ============================================
// GAME LIFECYCLE SIMULATION ROUTES
// ============================================

/**
 * POST /api/thresholds/demo/simulate-game-started
 * 
 * Simulate a game starting (SCHEDULED → IN_PROGRESS)
 */
thresholdsRouter.post("/demo/simulate-game-started", async (c) => {
  try {
    const body = await c.req.json();
    const { game, pool_context } = body;

    if (!game || !game.game_id) {
      return c.json({ error: "game object with game_id is required" }, 400);
    }

    // Create previous game state (scheduled)
    const previousGame: Game = {
      ...game,
      status: "SCHEDULED",
      away_score: undefined,
      home_score: undefined,
      period_number: undefined,
      period_label: undefined,
      clock: undefined,
    };

    // Set current game as in progress
    const currentGame: Game = {
      ...game,
      status: "IN_PROGRESS",
      away_score: game.away_score ?? 0,
      home_score: game.home_score ?? 0,
      period_number: game.period_number ?? 1,
      period_label: game.period_label ?? "Q1",
    };

    const input: GameLifecycleInput = {
      dataScope: 'DEMO',
      game: currentGame,
      previousGame,
      poolContext: pool_context,
    };

    const event = await detectGameStarted(c.env.DB, input);

    return c.json({
      success: true,
      triggered: event !== null,
      event,
    });
  } catch (error) {
    console.error("Error simulating game started:", error);
    return c.json({ error: "Failed to simulate game started" }, 500);
  }
});

/**
 * POST /api/thresholds/demo/simulate-game-ended
 * 
 * Simulate a game ending (IN_PROGRESS → FINAL)
 */
thresholdsRouter.post("/demo/simulate-game-ended", async (c) => {
  try {
    const body = await c.req.json();
    const { game, pool_context } = body;

    if (!game || !game.game_id) {
      return c.json({ error: "game object with game_id is required" }, 400);
    }

    // Create previous game state (in progress)
    const previousGame: Game = {
      ...game,
      status: "IN_PROGRESS",
    };

    // Set current game as final
    const currentGame: Game = {
      ...game,
      status: "FINAL",
    };

    const input: GameLifecycleInput = {
      dataScope: 'DEMO',
      game: currentGame,
      previousGame,
      poolContext: pool_context,
    };

    const event = await detectGameEnded(c.env.DB, input);

    return c.json({
      success: true,
      triggered: event !== null,
      event,
    });
  } catch (error) {
    console.error("Error simulating game ended:", error);
    return c.json({ error: "Failed to simulate game ended" }, 500);
  }
});

/**
 * POST /api/thresholds/demo/process-game-change
 * 
 * Process a full game state change with previous/current state
 * Returns all triggered threshold events
 */
thresholdsRouter.post("/demo/process-game-change", async (c) => {
  try {
    const body = await c.req.json();
    const { current_game, previous_game, pool_context } = body;

    if (!current_game || !current_game.game_id) {
      return c.json({ error: "current_game object with game_id is required" }, 400);
    }

    const input: GameLifecycleInput = {
      dataScope: 'DEMO',
      game: current_game,
      previousGame: previous_game,
      poolContext: pool_context,
    };

    const events = await processGameStateChange(c.env.DB, input);

    return c.json({
      success: true,
      triggered_count: events.length,
      events,
    });
  } catch (error) {
    console.error("Error processing game change:", error);
    return c.json({ error: "Failed to process game change" }, 500);
  }
});

export { thresholdsRouter };
