/**
 * Coach G Deep Game Preview API Routes
 * 
 * GET /api/coach-g-preview/:gameId - Get or generate game preview
 * POST /api/coach-g-preview/:gameId/refresh - Force refresh preview
 * DELETE /api/coach-g-preview/:gameId - Mark preview as stale
 */

import { Hono } from "hono";
import { 
  generateGamePreview, 
  markPreviewStale,
  cleanupExpiredPreviews
} from "../services/coachGPreviewService";

const coachGPreviewRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/coach-g-preview/:gameId
 * 
 * Get game preview - returns cached version if available, otherwise generates new one.
 * Generation takes 10-15 seconds on cache miss.
 */
/**
 * Transform backend preview format to frontend expected format
 */
function transformPreviewForFrontend(preview: Awaited<ReturnType<typeof generateGamePreview>>) {
  // Parse confidence from the pick text (look for keywords)
  const pickText = preview.preview.gsPick || '';
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (pickText.toLowerCase().includes('strong') || pickText.toLowerCase().includes('confident') || pickText.toLowerCase().includes('love')) {
    confidence = 'high';
  } else if (pickText.toLowerCase().includes('lean') || pickText.toLowerCase().includes('slight') || pickText.toLowerCase().includes('risky')) {
    confidence = 'low';
  }

  // Extract the actual pick (first bold or first sentence)
  const pickMatch = pickText.match(/\*\*([^*]+)\*\*/);
  const pickLine = pickMatch ? pickMatch[1] : pickText.split('.')[0];
  const reasoning = pickMatch ? pickText.replace(/\*\*[^*]+\*\*/, '').trim() : pickText.split('.').slice(1).join('.').trim();

  return {
    game_id: preview.gameId,
    sport: preview.sport,
    rosterFreshness: preview.preview.dataFreshness || {
      status: "limited_roster_certainty",
      badge: "Limited roster certainty",
      score: 30,
      capturedAt: null,
      note: "No freshness metadata available for this preview.",
    },
    content: {
      headline: preview.preview.headline,
      sections: [
        { title: 'The Matchup Story', content: preview.preview.matchupStory, icon: 'team' },
        { title: 'Key Numbers', content: preview.preview.keyNumbers, icon: 'trends' },
        { title: 'Player Spotlight', content: preview.preview.playerSpotlight, icon: 'injury' },
        { title: 'Conditions & Situational Factors', content: preview.preview.conditionsAnalysis, icon: 'weather' },
        { title: 'Betting Market Intel', content: preview.preview.bettingInsight, icon: 'odds' },
        { title: 'Risk Assessment', content: preview.preview.riskAssessment, icon: 'history' },
      ].filter(s => s.content && s.content.length > 0),
      // Big G's Pick - this will be gated on the frontend
      coachGPick: pickText ? {
        pick: pickLine,
        confidence,
        reasoning: reasoning || pickText,
      } : undefined,
      sources: preview.sources.map(s => ({
        name: s.name,
        snippetCount: Math.ceil(s.contentLength / 500), // Approximate snippets
      })),
      generatedAt: preview.generatedAt,
      rosterFreshness: preview.preview.dataFreshness || {
        status: "limited_roster_certainty",
        badge: "Limited roster certainty",
        score: 30,
        capturedAt: null,
        note: "No freshness metadata available for this preview.",
      },
    },
    sources_used: preview.sources.map(s => s.name),
    generated_at: preview.generatedAt,
    expires_at: preview.expiresAt,
    word_count: preview.wordCount,
    created_at: preview.generatedAt,
    updated_at: preview.generatedAt,
  };
}

coachGPreviewRouter.get("/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  
  if (!gameId) {
    return c.json({ error: "Game ID is required" }, 400);
  }

  try {
    const preview = await generateGamePreview(
      c.env.DB,
      {
        FIRECRAWL_API_KEY: c.env.FIRECRAWL_API_KEY,
        OPENAI_API_KEY: c.env.OPENAI_API_KEY,
        SPORTSRADAR_API_KEY: c.env.SPORTSRADAR_API_KEY,
        SPORTSRADAR_ODDS_KEY: c.env.SPORTSRADAR_ODDS_KEY,
      },
      gameId,
      false // Don't force refresh
    );

    const transformedPreview = transformPreviewForFrontend(preview);

    return c.json({
      success: true,
      preview: transformedPreview,
      meta: {
        cached: preview.cached,
        wordCount: preview.wordCount,
        sourcesCount: preview.sources.length,
        generatedAt: preview.generatedAt,
        expiresAt: preview.expiresAt,
        rosterFreshness: transformedPreview.rosterFreshness,
      },
    });
  } catch (error) {
    console.error("[CoachGPreview] Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to generate preview";
    
    // Check for specific error types
    if (errorMessage.includes("Game not found")) {
      return c.json({ 
        error: "Game not found",
        gameId,
        fallback_type: "no_coverage",
        fallback_reason: "Unable to resolve game in provider chain",
      }, 404);
    }
    
    if (errorMessage.includes("OPENAI_API_KEY")) {
      return c.json({ 
        error: "AI service not configured",
        details: "Contact support to enable game previews",
        fallback_type: "auth_config",
        fallback_reason: "OPENAI_API_KEY missing",
        config: {
          openai_configured: Boolean(c.env.OPENAI_API_KEY),
          firecrawl_configured: Boolean(c.env.FIRECRAWL_API_KEY),
        },
      }, 503);
    }

    return c.json({ 
      error: "Failed to generate game preview",
      details: errorMessage,
      fallback_type: "provider_error",
      fallback_reason: errorMessage,
      config: {
        openai_configured: Boolean(c.env.OPENAI_API_KEY),
        firecrawl_configured: Boolean(c.env.FIRECRAWL_API_KEY),
      },
    }, 500);
  }
});

/**
 * POST /api/coach-g-preview/:gameId
 *
 * Generate preview on demand (idempotent, uses cache if present).
 */
coachGPreviewRouter.post("/:gameId", async (c) => {
  const gameId = c.req.param("gameId");

  if (!gameId) {
    return c.json({ error: "Game ID is required" }, 400);
  }

  try {
    const preview = await generateGamePreview(
      c.env.DB,
      {
        FIRECRAWL_API_KEY: c.env.FIRECRAWL_API_KEY,
        OPENAI_API_KEY: c.env.OPENAI_API_KEY,
        SPORTSRADAR_API_KEY: c.env.SPORTSRADAR_API_KEY,
        SPORTSRADAR_ODDS_KEY: c.env.SPORTSRADAR_ODDS_KEY,
      },
      gameId,
      false
    );

    const transformedPreview = transformPreviewForFrontend(preview);
    return c.json({
      success: true,
      preview: transformedPreview,
      meta: {
        cached: preview.cached,
        wordCount: preview.wordCount,
        sourcesCount: preview.sources.length,
        generatedAt: preview.generatedAt,
        expiresAt: preview.expiresAt,
        rosterFreshness: transformedPreview.rosterFreshness,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to generate preview";
    return c.json({
      error: "Failed to generate game preview",
      details: errorMessage,
      fallback_type: "provider_error",
      fallback_reason: errorMessage,
      config: {
        openai_configured: Boolean(c.env.OPENAI_API_KEY),
        firecrawl_configured: Boolean(c.env.FIRECRAWL_API_KEY),
      },
    }, 500);
  }
});

/**
 * POST /api/coach-g-preview/:gameId/refresh
 * 
 * Force regenerate the preview, bypassing cache.
 * Use this when major news breaks (injury, lineup change, etc.)
 */
coachGPreviewRouter.post("/:gameId/refresh", async (c) => {
  const gameId = c.req.param("gameId");
  
  if (!gameId) {
    return c.json({ error: "Game ID is required" }, 400);
  }

  try {
    const preview = await generateGamePreview(
      c.env.DB,
      {
        FIRECRAWL_API_KEY: c.env.FIRECRAWL_API_KEY,
        OPENAI_API_KEY: c.env.OPENAI_API_KEY,
        SPORTSRADAR_API_KEY: c.env.SPORTSRADAR_API_KEY,
        SPORTSRADAR_ODDS_KEY: c.env.SPORTSRADAR_ODDS_KEY,
      },
      gameId,
      true // Force refresh
    );

    const transformedPreview = transformPreviewForFrontend(preview);

    return c.json({
      success: true,
      message: "Preview regenerated successfully",
      preview: transformedPreview,
      meta: {
        cached: false,
        wordCount: preview.wordCount,
        sourcesCount: preview.sources.length,
        generatedAt: preview.generatedAt,
        expiresAt: preview.expiresAt,
        rosterFreshness: transformedPreview.rosterFreshness,
      },
    });
  } catch (error) {
    console.error("[CoachGPreview] Refresh error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to refresh preview";
    
    return c.json({ 
      error: "Failed to refresh game preview",
      details: errorMessage,
      fallback_type: "provider_error",
      fallback_reason: errorMessage,
      config: {
        openai_configured: Boolean(c.env.OPENAI_API_KEY),
        firecrawl_configured: Boolean(c.env.FIRECRAWL_API_KEY),
      },
    }, 500);
  }
});

/**
 * DELETE /api/coach-g-preview/:gameId
 * 
 * Mark a preview as stale (will be regenerated on next fetch).
 * Useful when you know the cached data is outdated but don't want to wait for regeneration.
 */
coachGPreviewRouter.delete("/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  
  if (!gameId) {
    return c.json({ error: "Game ID is required" }, 400);
  }

  try {
    await markPreviewStale(c.env.DB, gameId);

    return c.json({
      success: true,
      message: "Preview marked as stale",
      gameId,
    });
  } catch (error) {
    console.error("[CoachGPreview] Delete error:", error);
    
    return c.json({ 
      error: "Failed to mark preview as stale",
    }, 500);
  }
});

/**
 * POST /api/coach-g-preview/cleanup
 * 
 * Admin endpoint to cleanup expired previews (> 1 day old).
 * Should be called periodically by a cron job.
 */
coachGPreviewRouter.post("/cleanup", async (c) => {
  // Check for admin header or demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  const isAdmin = c.req.header("X-Admin-Key") === "cleanup-authorized";
  
  if (!isDemoMode && !isAdmin) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const deletedCount = await cleanupExpiredPreviews(c.env.DB);

    return c.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired previews`,
      deletedCount,
    });
  } catch (error) {
    console.error("[CoachGPreview] Cleanup error:", error);
    
    return c.json({ 
      error: "Failed to cleanup previews",
    }, 500);
  }
});

/**
 * GET /api/coach-g-preview/stats
 * 
 * Get preview generation statistics.
 */
coachGPreviewRouter.get("/stats", async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_previews,
        SUM(CASE WHEN expires_at > datetime('now') AND is_stale = 0 THEN 1 ELSE 0 END) as active_previews,
        SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) as stale_previews,
        AVG(word_count) as avg_word_count,
        SUM(generation_cost_cents) as total_cost_cents,
        MAX(created_at) as last_generated
      FROM coach_g_previews
    `).first();

    const byS = await c.env.DB.prepare(`
      SELECT sport, COUNT(*) as count
      FROM coach_g_previews
      WHERE expires_at > datetime('now') AND is_stale = 0
      GROUP BY sport
    `).all();

    return c.json({
      success: true,
      stats: {
        totalPreviews: stats?.total_previews || 0,
        activePreviews: stats?.active_previews || 0,
        stalePreviews: stats?.stale_previews || 0,
        avgWordCount: Math.round((stats?.avg_word_count as number) || 0),
        totalCostCents: stats?.total_cost_cents || 0,
        lastGenerated: stats?.last_generated || null,
        bySport: byS.results || [],
      },
    });
  } catch (error) {
    console.error("[CoachGPreview] Stats error:", error);
    
    return c.json({ 
      error: "Failed to get preview stats",
    }, 500);
  }
});

export default coachGPreviewRouter;
