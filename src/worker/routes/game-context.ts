/**
 * Game Context API Routes
 * 
 * Provides contextual intelligence for games via the GameContextEngine.
 */

import { Hono } from "hono";
import { generateGameContext, GameData } from "../services/gameContextEngine";

const app = new Hono<{ Bindings: Env }>();

/**
 * Extract team names from gameId or context params
 */
function buildGameDataFromParams(
  gameId: string, 
  sport: string, 
  homeTeam?: string, 
  awayTeam?: string,
  status?: string
): GameData {
  return {
    gameId,
    sport: sport.toUpperCase(),
    homeTeam: homeTeam || 'Home Team',
    awayTeam: awayTeam || 'Away Team',
    status: status || 'SCHEDULED',
    startTime: new Date().toISOString(),
  };
}

/**
 * GET /api/game-context/:sport/:gameId
 * 
 * Returns contextual intelligence for a specific game.
 * Optional query params: homeTeam, awayTeam, status for better context
 */
app.get("/:sport/:gameId", async (c) => {
  const sport = c.req.param("sport").toUpperCase();
  const gameId = c.req.param("gameId");
  
  // Accept optional team names from query params
  const homeTeam = c.req.query("homeTeam");
  const awayTeam = c.req.query("awayTeam");
  const status = c.req.query("status");

  try {
    // Build game data from params
    const gameData = buildGameDataFromParams(gameId, sport, homeTeam, awayTeam, status);
    
    // Generate context
    const context = generateGameContext(gameData);
    
    return c.json(context);
  } catch (error) {
    console.error("[game-context] Error building context:", error);
    return c.json({
      gameId,
      sport,
      signals: [],
      coachGNote: "Unable to generate context at this time.",
      headline: "Game Preview",
      lastUpdated: new Date().toISOString(),
      error: true,
    }, 500);
  }
});

/**
 * POST /api/game-context/batch
 * 
 * Returns context for multiple games at once (for efficiency).
 * Request body: { games: [{ gameId, sport, homeTeam?, awayTeam?, status? }] }
 */
app.post("/batch", async (c) => {
  try {
    const body = await c.req.json<{ 
      games: Array<{ 
        gameId: string; 
        sport: string;
        homeTeam?: string;
        awayTeam?: string;
        status?: string;
      }> 
    }>();
    
    if (!body.games || !Array.isArray(body.games)) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    // Process games - use provided team names
    const gamesSlice = body.games.slice(0, 20);
    const results = gamesSlice.map(({ gameId, sport, homeTeam, awayTeam, status }) => {
      try {
        const gameData = buildGameDataFromParams(gameId, sport, homeTeam, awayTeam, status);
        return generateGameContext(gameData);
      } catch {
        return {
          gameId,
          sport,
          signals: [],
          coachGNote: "",
          headline: "",
          lastUpdated: new Date().toISOString(),
          error: true,
        };
      }
    });

    return c.json({ contexts: results });
  } catch (error) {
    console.error("[game-context] Batch error:", error);
    return c.json({ error: "Failed to fetch batch context" }, 500);
  }
});

export default app;
