/**
 * AI Routes - OpenAI-powered Scout Intelligence Hub
 * 
 * Provides grounded, data-driven AI responses using function calling
 * to fetch real sports data before generating responses.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import OpenAI from "openai";
import { 
  AI_PERSONAS, 
  type PersonaKey 
} from "../../shared/ai-personas";
import {
  generateAIResponse,
  checkForBettingAdvice,
} from "../services/ai-service";
import { runCoachGBrain } from "../services/coachgBrainService";
import {
  getAIPriorityRouting,
  checkAIRateLimit,
  logAIRequest,
  getEliteContext,
  saveSessionMemory,
  extractReferencedEntities,
} from "../services/aiPriorityRouter";

const aiRouter = new Hono<{ Bindings: Env }>();

// ============ Main Chat Endpoint ============

/**
 * POST /api/ai/chat
 * Chat with an AI persona (Scout, Ref, or Big G)
 * 
 * Body:
 * - persona: PersonaKey (billy, coach, big_g)
 * - message: string
 * - leagueId?: number (optional pool context)
 * - pageContext?: string (current page for context)
 * - conversationHistory?: array of previous messages
 */
aiRouter.post("/chat", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { persona, message, leagueId, pageContext, conversationHistory = [], sessionId } = body;

  if (!persona || !AI_PERSONAS[persona as PersonaKey]) {
    return c.json({ error: "Invalid persona" }, 400);
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return c.json({ error: "Message is required" }, 400);
  }

  // Persona config available for future use
  const _personaConfig = AI_PERSONAS[persona as PersonaKey];
  void _personaConfig;
  const db = c.env.DB;
  
  // Get priority routing configuration for this user
  const routing = await getAIPriorityRouting(db, user.id);
  
  // Check rate limit
  const rateLimit = await checkAIRateLimit(db, user.id, routing);
  
  // Set rate limit headers
  c.header("X-RateLimit-Limit", routing.rateLimitPerMinute.toString());
  c.header("X-RateLimit-Remaining", rateLimit.remaining.toString());
  c.header("X-RateLimit-Reset", rateLimit.resetAt.toISOString());
  c.header("X-AI-Tier", routing.tier);
  c.header("X-AI-Model", routing.model);
  
  if (!rateLimit.allowed) {
    return c.json({
      error: "Rate limit exceeded",
      retryAfter: rateLimit.resetAt.toISOString(),
      tier: routing.tier,
      limit: routing.rateLimitPerMinute,
    }, 429);
  }
  
  // Get Elite context if user is elite tier
  let eliteContext = null;
  if (routing.tier === 'elite') {
    eliteContext = await getEliteContext(db, user.id, sessionId);
  }
  
  // Check for betting advice request
  const { isBettingAdvice } = checkForBettingAdvice(message);
  
  // Get league context if provided (used by generateAIResponse internally)
  if (leagueId) {
    const league = await db.prepare(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
      FROM leagues l
      WHERE l.id = ?
    `).bind(leagueId).first();
    
    // League context is passed to generateAIResponse
    void league;
  }

  const startTime = Date.now();
  
  try {
    // Route consumer Coach G persona through the new Coach G brain so
    // chat and intelligence surfaces share one core engine.
    if (persona === "billy") {
      const payload = await runCoachGBrain({
        db,
        env: c.env,
        userId: user.id,
        surface: pageContext || "chat",
        query: message,
      });
      const responseTime = Date.now() - startTime;
      await logAIRequest(
        db,
        user.id,
        routing,
        persona,
        message,
        payload.summary,
        responseTime,
        ["coachg_brain_service"],
        true
      );
      return c.json({
        response: payload.summary,
        persona,
        sources: [{ name: "Coach G Intelligence Engine", lastUpdated: payload.generated_at }],
        toolsUsed: ["coachg_brain_service"],
        intelligence: payload,
        isFallback: false,
        isBettingAdvice,
        tier: routing.tier,
        model: payload.model_route.model,
        responseTimeMs: responseTime,
        queuePriority: routing.queuePriority,
      });
    }

    // Check if API key is configured
    const apiKey = c.env?.OPENAI_API_KEY as string | undefined;
    
    if (!apiKey || apiKey.trim() === '') {
      // Fallback to intelligent canned responses
      const fallbackResponse = await generateFallbackResponse(
        db, 
        user.id, 
        persona as PersonaKey, 
        message,
        leagueId,
        pageContext
      );
      
      const responseTime = Date.now() - startTime;
      
      // Log the interaction with tier info
      await logAIRequest(
        db,
        user.id,
        routing,
        persona,
        message,
        fallbackResponse.response,
        responseTime,
        ['fallback'],
        true
      );

      return c.json({
        response: fallbackResponse.response,
        persona,
        sources: fallbackResponse.sources,
        toolsUsed: [],
        isFallback: true,
        isBettingAdvice,
        tier: routing.tier,
        model: 'fallback',
        responseTimeMs: responseTime,
      });
    }

    // Initialize OpenAI client
    const client = new OpenAI({ apiKey });

    // Generate response with function calling
    const result = await generateAIResponse(
      client,
      db,
      user.id,
      persona as PersonaKey,
      message,
      conversationHistory.slice(-10).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      pageContext,
      leagueId,
      eliteContext,
      routing
    );

    const responseTime = Date.now() - startTime;
    
    // Save session memory for Elite users
    if (routing.tier === 'elite' && sessionId) {
      const { games, teams } = extractReferencedEntities(message, result.response);
      saveSessionMemory(
        db,
        user.id,
        sessionId,
        message,
        result.response,
        result.toolsUsed,
        games,
        teams
      ).catch(err => console.error('Failed to save session memory:', err));
    }

    // Log the interaction with tier and performance info
    await logAIRequest(
      db,
      user.id,
      routing,
      persona,
      message,
      result.response,
      responseTime,
      result.toolsUsed,
      true
    );

    return c.json({
      response: result.response,
      persona,
      sources: result.sources,
      toolsUsed: result.toolsUsed,
      isFallback: false,
      isBettingAdvice: result.isBettingAdvice,
      tier: routing.tier,
      model: routing.model,
      responseTimeMs: responseTime,
      queuePriority: routing.queuePriority,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    
    // Fallback on error
    const fallbackResponse = await generateFallbackResponse(
      db,
      user.id,
      persona as PersonaKey,
      message,
      leagueId,
      pageContext
    );
    
    await db.prepare(`
      INSERT INTO ai_event_log (persona, user_id, league_id, request_text, response_text, sources_used, flags)
      VALUES (?, ?, ?, ?, ?, 'fallback_error', 'api_error')
    `).bind(persona, user.id, leagueId || null, message, fallbackResponse.response).run();

    return c.json({
      response: fallbackResponse.response,
      persona,
      sources: fallbackResponse.sources,
      toolsUsed: [],
      isFallback: true,
      isBettingAdvice,
    });
  }
});

// ============ Data Endpoints for Scout ============

/**
 * GET /api/ai/data/schedule
 * Get game schedule for Scout queries
 */
aiRouter.get("/data/schedule", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const sport = c.req.query("sport") || "nfl";
  const period = c.req.query("period");
  const date = c.req.query("date");
  const db = c.env.DB;

  let query = `SELECT * FROM events WHERE sport_key = ?`;
  const params: any[] = [sport];

  if (period) {
    query += ` AND period_id = ?`;
    params.push(period);
  }

  if (date) {
    query += ` AND DATE(start_at) = ?`;
    params.push(date);
  }

  query += ` ORDER BY start_at ASC LIMIT 30`;

  const { results } = await db.prepare(query).bind(...params).all();

  return c.json({
    games: results.map((e: any) => ({
      id: e.id,
      homeTeam: e.home_team,
      awayTeam: e.away_team,
      startAt: e.start_at,
      status: e.status,
      venue: e.venue,
      homeScore: e.home_score,
      awayScore: e.away_score,
      period: e.period_id,
    })),
    source: "Schedule Feed",
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/ai/data/game/:id
 * Get detailed game information
 */
aiRouter.get("/data/game/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const gameId = c.req.param("id");
  const db = c.env.DB;

  const game = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(gameId).first();

  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }

  // Get odds if available
  const odds = await db.prepare(`
    SELECT * FROM odds_quotes WHERE game_id = ? ORDER BY updated_at DESC LIMIT 10
  `).bind(gameId).all();

  return c.json({
    game: {
      id: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      startAt: game.start_at,
      status: game.status,
      venue: game.venue,
      broadcast: game.broadcast,
      weather: game.weather,
      homeScore: game.home_score,
      awayScore: game.away_score,
      winner: game.winner,
      period: game.period_id,
    },
    odds: odds.results,
    source: "Game Data",
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/ai/data/lines/:gameId
 * Get lines history for a game
 */
aiRouter.get("/data/lines/:gameId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const gameId = c.req.param("gameId");
  const db = c.env.DB;

  // Get snapshots
  const { results: snapshots } = await db.prepare(`
    SELECT * FROM odds_snapshots 
    WHERE game_id = ? 
    ORDER BY captured_at ASC
    LIMIT 50
  `).bind(gameId).all();

  // Get opening lines
  const { results: opening } = await db.prepare(`
    SELECT * FROM odds_opening WHERE game_id = ?
  `).bind(gameId).all();

  // Get current quotes
  const { results: current } = await db.prepare(`
    SELECT * FROM odds_quotes 
    WHERE game_id = ? 
    ORDER BY updated_at DESC
  `).bind(gameId).all();

  return c.json({
    gameId,
    opening: opening.length > 0 ? opening : null,
    current: current.length > 0 ? current : null,
    history: snapshots,
    movementCount: snapshots.length,
    source: "Lines Feed",
    lastUpdated: current[0]?.updated_at || new Date().toISOString(),
  });
});

/**
 * GET /api/ai/data/consensus/:gameId
 * Get market consensus/averages for a game
 */
aiRouter.get("/data/consensus/:gameId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const gameId = c.req.param("gameId");
  const db = c.env.DB;

  // Get all current odds for this game
  const { results: odds } = await db.prepare(`
    SELECT * FROM odds_quotes WHERE game_id = ?
  `).bind(gameId).all();

  if (odds.length === 0) {
    return c.json({
      gameId,
      message: "No odds data available",
      source: "Market Data",
      lastUpdated: new Date().toISOString(),
    });
  }

  // Calculate consensus
  const spreads = odds.filter((o: any) => o.market_key === "SPREAD" && o.line_value !== null);
  const totals = odds.filter((o: any) => o.market_key === "TOTAL" && o.line_value !== null);
  // Moneyline odds available for future use
  const _mls = odds.filter((o: any) => o.market_key === "MONEYLINE" && o.price_american !== null);
  void _mls;

  const avgSpread = spreads.length > 0 
    ? spreads.reduce((sum: number, o: any) => sum + o.line_value, 0) / spreads.length 
    : null;
  const avgTotal = totals.length > 0 
    ? totals.reduce((sum: number, o: any) => sum + o.line_value, 0) / totals.length 
    : null;

  return c.json({
    gameId,
    consensus: {
      spread: avgSpread ? avgSpread.toFixed(1) : "N/A",
      total: avgTotal ? avgTotal.toFixed(1) : "N/A",
      bookCount: new Set(odds.map((o: any) => o.bookmaker_key)).size,
    },
    spreadRange: spreads.length > 0 ? {
      min: Math.min(...spreads.map((o: any) => o.line_value)),
      max: Math.max(...spreads.map((o: any) => o.line_value)),
    } : null,
    totalRange: totals.length > 0 ? {
      min: Math.min(...totals.map((o: any) => o.line_value)),
      max: Math.max(...totals.map((o: any) => o.line_value)),
    } : null,
    source: "Market Data",
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/ai/data/weather/:gameId
 * Get weather forecast for outdoor game
 */
aiRouter.get("/data/weather/:gameId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const gameId = c.req.param("gameId");
  const db = c.env.DB;

  const game = await db.prepare(`SELECT * FROM events WHERE id = ?`).bind(gameId).first();

  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }

  // Check if game has weather data stored
  let weather = null;
  if (game.weather) {
    try {
      weather = JSON.parse(game.weather as string);
    } catch {}
  }

  // Generate simulated weather for outdoor sports if not available
  if (!weather && ["nfl", "mlb", "soccer"].includes(game.sport_key as string)) {
    const hash = (game.id as number) + new Date(game.start_at as string).getTime();
    const temp = 45 + (hash % 40);
    const windSpeed = 5 + (hash % 20);
    
    weather = {
      temp,
      tempUnit: "F",
      condition: temp > 70 ? "Sunny" : temp > 50 ? "Partly Cloudy" : "Cloudy",
      wind: { speed: windSpeed, direction: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][hash % 8] },
      precipitation: hash % 100 < 20 ? (hash % 40) : 0,
      humidity: 30 + (hash % 50),
    };
  }

  // Determine game impact
  let gameImpact = "Minimal impact expected";
  if (weather) {
    if (weather.wind?.speed > 15) {
      gameImpact = "High winds may affect passing game";
    } else if (weather.precipitation > 30) {
      gameImpact = "Rain expected - may affect scoring";
    } else if (weather.temp < 32) {
      gameImpact = "Cold temperatures - passing efficiency may decrease";
    } else if (weather.temp > 85) {
      gameImpact = "High temperatures - watch for fatigue late in game";
    }
  }

  return c.json({
    gameId,
    venue: game.venue || "Stadium",
    weather: weather || { message: "Weather data not available for indoor venues" },
    gameImpact,
    source: "Weather Feed",
    lastUpdated: new Date().toISOString(),
  });
});

// ============ AI History & Analytics ============

/**
 * GET /api/ai/history
 * Get AI conversation history for a user
 */
aiRouter.get("/history", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const persona = c.req.query("persona");
  const limit = parseInt(c.req.query("limit") || "20");
  const db = c.env.DB;

  let query = `SELECT * FROM ai_event_log WHERE user_id = ?`;
  const params: any[] = [user.id];

  if (persona) {
    query += ` AND persona = ?`;
    params.push(persona);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const { results } = await db.prepare(query).bind(...params).all();

  return c.json(results);
});

/**
 * GET /api/ai/stats
 * Get AI usage statistics (for admin)
 */
aiRouter.get("/stats", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  // Get usage stats
  const stats = await db.prepare(`
    SELECT 
      persona,
      COUNT(*) as total_queries,
      COUNT(DISTINCT user_id) as unique_users,
      SUM(CASE WHEN flags LIKE '%betting_advice%' THEN 1 ELSE 0 END) as betting_advice_requests
    FROM ai_event_log
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY persona
  `).all();

  return c.json({
    last7Days: stats.results,
    timestamp: new Date().toISOString(),
  });
});

// ============ Fallback Response Generator ============

async function generateFallbackResponse(
  db: D1Database,
  _userId: string,
  persona: PersonaKey,
  message: string,
  _leagueId?: number,
  _pageContext?: string
): Promise<{ response: string; sources: Array<{ name: string; lastUpdated: string }> }> {
  const lowerMessage = message.toLowerCase();
  const sources: Array<{ name: string; lastUpdated: string }> = [];
  const now = new Date().toISOString();
  
  // Scout (billy) - Sports analyst
  if (persona === "billy") {
    // Check for betting advice (refuse gracefully)
    if (lowerMessage.includes("should i pick") || lowerMessage.includes("who should i") || 
        lowerMessage.includes("best bet") || lowerMessage.includes("who will win")) {
      return {
        response: "I can't make picks for you, but I can provide context to inform your decision. Here's what I can help with:\n\n• Explain the current spread and what it means\n• Show you line movement history\n• Summarize injury reports\n• Provide weather conditions for outdoor games\n\nWhat specific information would help you make your decision?",
        sources: [],
      };
    }
    
    // Schedule questions
    if (lowerMessage.includes("today") || lowerMessage.includes("tonight") || lowerMessage.includes("schedule")) {
      const { results: games } = await db.prepare(`
        SELECT * FROM events 
        WHERE DATE(start_at) = DATE('now') AND status = 'scheduled'
        ORDER BY start_at ASC LIMIT 10
      `).all();
      
      if (games.length > 0) {
        sources.push({ name: "Schedule Feed", lastUpdated: now });
        const gameList = games.slice(0, 5).map((g: any) => 
          `• ${g.away_team} @ ${g.home_team} - ${new Date(g.start_at).toLocaleTimeString()}`
        ).join("\n");
        
        return {
          response: `Here's today's slate:\n\n${gameList}\n\n${games.length > 5 ? `Plus ${games.length - 5} more games.` : ""}\n\nWant details on any specific matchup?`,
          sources,
        };
      }
      
      return {
        response: "I don't see any games scheduled for today in my data. This could mean:\n\n• It's an off-day for most leagues\n• Games are scheduled but not yet loaded\n\nTry asking about a specific week or sport (e.g., \"NFL Week 12 schedule\").",
        sources: [],
      };
    }
    
    // Line movement questions
    if (lowerMessage.includes("line") || lowerMessage.includes("spread") || lowerMessage.includes("moved") || lowerMessage.includes("movement")) {
      sources.push({ name: "Lines Feed", lastUpdated: now });
      return {
        response: "Line movement tells you how the betting market is shifting. Key things to understand:\n\n• **Opening line**: The first spread/total posted\n• **Current line**: Where it stands now\n• **Movement**: The difference between open and current\n\nCommon reasons for movement:\n• Sharp money (professional bettors)\n• Injury news\n• Weather changes\n• Public betting volume\n\nWant me to check line movement for a specific game?",
        sources,
      };
    }
    
    // Injury questions
    if (lowerMessage.includes("injury") || lowerMessage.includes("injured") || lowerMessage.includes("out")) {
      sources.push({ name: "Injury Feed", lastUpdated: now });
      return {
        response: "Injury reports are critical for informed picks. Here's how to read them:\n\n• **Out**: Player will not play\n• **Doubtful**: 25% chance to play\n• **Questionable**: 50% chance to play\n• **Probable**: 75% chance to play\n\nKey injuries often move lines significantly, especially:\n• Starting QBs in football\n• Star players in any sport\n• Multiple starters on one team\n\nWhich team's injury report would you like me to check?",
        sources,
      };
    }
    
    // Weather questions
    if (lowerMessage.includes("weather") || lowerMessage.includes("rain") || lowerMessage.includes("wind") || lowerMessage.includes("cold")) {
      sources.push({ name: "Weather Feed", lastUpdated: now });
      return {
        response: "Weather matters most for outdoor sports like NFL and MLB. Key factors:\n\n• **Wind >15 mph**: Can affect passing and kicking\n• **Rain/Snow**: Typically lowers scoring\n• **Extreme cold**: Can impact ball handling\n• **Extreme heat**: Watch for fatigue late in games\n\nFor domed stadiums and indoor sports, weather isn't a factor.\n\nWant me to check weather for a specific game?",
        sources,
      };
    }
    
    // Pool format questions
    if (lowerMessage.includes("confidence") || lowerMessage.includes("survivor") || lowerMessage.includes("pick'em") || lowerMessage.includes("pickem")) {
      return {
        response: getPoolFormatExplanation(lowerMessage),
        sources: [],
      };
    }
    
    // Default Coach G response
    return {
      response: "I'm Coach G, your sports intelligence assistant. I can help you with:\n\n• **Game schedules** - Today's slate, upcoming games\n• **Line movement** - How spreads and totals are shifting\n• **Injury reports** - Who's in, who's out\n• **Weather conditions** - For outdoor games\n• **Pool rules** - How different formats work\n\nRemember: I provide information to help you decide, but I can't tell you who to pick. What would you like to know?",
      sources: [],
    };
  }
  
  // Ref (coach) - Pool admin AI
  if (persona === "coach") {
    if (lowerMessage.includes("payment") || lowerMessage.includes("fee") || lowerMessage.includes("money")) {
      return {
        response: "Payment management recommendations:\n\n• Set clear payment deadlines before the season\n• Use the payment tracking feature to mark verified payments\n• Consider requiring payment before picks are allowed\n• Document all exceptions in the audit log\n\nThe audit log tracks all payment verifications for transparency.",
        sources: [{ name: "Pool Settings", lastUpdated: now }],
      };
    }
    
    if (lowerMessage.includes("dispute") || lowerMessage.includes("conflict")) {
      return {
        response: "Handling disputes:\n\n1. **Check the audit log** - It shows the exact sequence of events with timestamps\n2. **Review pool rules** - Apply them consistently\n3. **Document your decision** - Add notes for future reference\n4. **Communicate clearly** - Explain the ruling to all parties\n\nThe audit log is append-only and serves as your source of truth.",
        sources: [{ name: "Audit Trail", lastUpdated: now }],
      };
    }
    
    if (lowerMessage.includes("late") && (lowerMessage.includes("join") || lowerMessage.includes("member"))) {
      return {
        response: "Mid-season join policy options:\n\n• **Option 1**: Allow joins, start with 0 points for missed weeks\n• **Option 2**: Prorated entry fee based on remaining weeks\n• **Option 3**: No mid-season joins (cleanest for standings)\n\nFor Survivor pools, late joiners might start with a life already used. Whatever you decide, apply it consistently and document your policy.",
        sources: [],
      };
    }
    
    return {
      response: "I'm Ref, your pool operations assistant. I can advise on:\n\n• **Payment management** - Tracking, verification, refunds\n• **Dispute resolution** - Fair handling of conflicts\n• **Member management** - Late joins, removals\n• **Audit trail** - Using the log for transparency\n\nI provide recommendations only - you'll need to take actions through the admin interface. How can I help?",
      sources: [],
    };
  }
  
  // Big G - Super admin AI
  if (persona === "big_g") {
    return {
      response: "Platform oversight at your service. I can help with:\n\n• **Platform health** - System status and metrics\n• **User analytics** - Engagement trends\n• **Risk detection** - Anomaly flagging\n• **Pool performance** - Activity across pools\n\nNote: I have visibility but take no direct actions. What needs attention?",
      sources: [],
    };
  }
  
  return {
    response: "How can I assist you?",
    sources: [],
  };
}

function getPoolFormatExplanation(message: string): string {
  if (message.includes("confidence")) {
    return "**Confidence Pool Format**\n\nIn a Confidence pool, you pick winners for each game AND assign point values based on your confidence:\n\n• With 10 games, you assign points 1-10 to each pick\n• Correct picks earn those points\n• Wrong picks earn 0 points\n\n**Strategy tips:**\n• Put high points on games you're most certain about\n• Consider line movement and injuries for close games\n• Don't just follow the largest spreads\n\nNeed help understanding how scoring works for your specific pool?";
  }
  
  if (message.includes("survivor")) {
    return "**Survivor Pool Format**\n\nSurvive and advance by picking one winning team each week:\n\n• Pick one team to win straight up\n• If they win, you advance\n• If they lose, you're eliminated\n• You can't pick the same team twice all season\n\n**Strategy tips:**\n• Save strong teams for difficult weeks\n• Don't waste big favorites early\n• Track which teams you've used\n• Consider bye weeks in your planning\n\nWant me to check which teams you've already used?";
  }
  
  if (message.includes("pick'em") || message.includes("pickem")) {
    return "**Pick'em Pool Format**\n\nThe simplest format - just pick winners:\n\n• Pick the winner of each game\n• Each correct pick = 1 point (usually)\n• Most points at season end wins\n\n**Strategy tips:**\n• Focus on matchups, not just favorites\n• Home field matters\n• Weather can impact outdoor games\n• Track your win percentage over time\n\nSome pools use spreads (ATS) instead of straight up winners.";
  }
  
  return "Pool formats I can explain:\n\n• **Pick'em** - Pick game winners, 1 point each\n• **Confidence** - Assign point values to picks\n• **Survivor** - Pick one winner per week, one loss eliminates\n• **Bracket** - Tournament-style predictions\n• **Squares** - Grid-based game tied to score\n\nWhich format would you like to learn about?";
}

export { aiRouter };
