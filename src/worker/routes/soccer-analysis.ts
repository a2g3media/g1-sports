/**
 * Soccer Match Analysis API Routes
 * 
 * GET /api/soccer-analysis/:matchId/pregame - Get pregame analysis
 * GET /api/soccer-analysis/:matchId/postgame - Get postgame analysis
 * POST /api/soccer-analysis/:matchId/refresh - Force refresh analysis
 */

import { Hono } from "hono";
import { generateSoccerAnalysis, clearAnalysisCache } from "../services/coachGSoccerAnalysis";

const soccerAnalysisRouter = new Hono<{ Bindings: Env }>();

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<{ timedOut: boolean; value: T | null }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = (await Promise.race([promise, timeoutPromise])) as T | null;
  if (timer) clearTimeout(timer);
  if (result === null) return { timedOut: true, value: null };
  return { timedOut: false, value: result };
}

/**
 * GET /api/soccer-analysis/:matchId/pregame
 * Get pregame analysis for a match
 */
soccerAnalysisRouter.get("/:matchId/pregame", async (c) => {
  const matchId = c.req.param("matchId");
  
  if (!matchId) {
    return c.json({ error: "Match ID is required" }, 400);
  }

  try {
    const timed = await withTimeout(
      generateSoccerAnalysis(
        c.env.DB,
        { OPENAI_API_KEY: c.env.OPENAI_API_KEY },
        matchId,
        'pregame',
        false
      ),
      7000
    );
    if (timed.timedOut) {
      return c.json({
        success: false,
        message: "Pregame analysis still processing",
        status: "deferred",
      }, 202);
    }
    const analysis = timed.value!;

    return c.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("[SoccerAnalysis] Pregame error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to generate analysis";
    
    if (errorMessage.includes("OPENAI_API_KEY")) {
      return c.json({ 
        error: "AI service not configured",
      }, 503);
    }

    return c.json({ 
      error: "Failed to generate pregame analysis",
      details: errorMessage,
    }, 500);
  }
});

/**
 * GET /api/soccer-analysis/:matchId/postgame
 * Get postgame analysis for a match
 */
soccerAnalysisRouter.get("/:matchId/postgame", async (c) => {
  const matchId = c.req.param("matchId");
  
  if (!matchId) {
    return c.json({ error: "Match ID is required" }, 400);
  }

  try {
    const timed = await withTimeout(
      generateSoccerAnalysis(
        c.env.DB,
        { OPENAI_API_KEY: c.env.OPENAI_API_KEY },
        matchId,
        'postgame',
        false
      ),
      7000
    );
    if (timed.timedOut) {
      return c.json({
        success: false,
        message: "Postgame analysis still processing",
        status: "deferred",
      }, 202);
    }
    const analysis = timed.value!;

    return c.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("[SoccerAnalysis] Postgame error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to generate analysis";

    return c.json({ 
      error: "Failed to generate postgame analysis",
      details: errorMessage,
    }, 500);
  }
});

/**
 * POST /api/soccer-analysis/:matchId/refresh
 * Force refresh analysis for a match
 */
soccerAnalysisRouter.post("/:matchId/refresh", async (c) => {
  const matchId = c.req.param("matchId");
  const body = await c.req.json().catch(() => ({ phase: 'pregame' }));
  const phase = body.phase || 'pregame';
  
  if (!matchId) {
    return c.json({ error: "Match ID is required" }, 400);
  }

  try {
    const timed = await withTimeout(
      generateSoccerAnalysis(
        c.env.DB,
        { OPENAI_API_KEY: c.env.OPENAI_API_KEY },
        matchId,
        phase,
        true // Force refresh
      ),
      7000
    );
    if (timed.timedOut) {
      return c.json({
        success: false,
        message: "Refresh request accepted; analysis still processing",
        status: "deferred",
      }, 202);
    }
    const analysis = timed.value!;

    return c.json({
      success: true,
      message: "Analysis refreshed",
      analysis,
    });
  } catch (error) {
    console.error("[SoccerAnalysis] Refresh error:", error);
    
    return c.json({ 
      error: "Failed to refresh analysis",
    }, 500);
  }
});

/**
 * DELETE /api/soccer-analysis/:matchId/cache
 * Clear cached analysis for a match
 */
soccerAnalysisRouter.delete("/:matchId/cache", async (c) => {
  const matchId = c.req.param("matchId");
  
  if (!matchId) {
    return c.json({ error: "Match ID is required" }, 400);
  }

  try {
    clearAnalysisCache(matchId);

    return c.json({
      success: true,
      message: "Cache cleared",
    });
  } catch (error) {
    console.error("[SoccerAnalysis] Cache clear error:", error);
    
    return c.json({ 
      error: "Failed to clear cache",
    }, 500);
  }
});

export default soccerAnalysisRouter;
