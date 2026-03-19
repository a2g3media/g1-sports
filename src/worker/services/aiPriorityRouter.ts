/**
 * AI Priority Router - Elite Tier Priority Processing
 * 
 * Routes AI requests to appropriate models and processing queues based on user tier.
 * Elite users get premium models, faster processing, dedicated capacity, and enhanced context.
 */

import type { D1Database } from "@cloudflare/workers-types";

export type AITier = 'free' | 'pro' | 'elite';

export interface PriorityRouting {
  tier: AITier;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  rateLimitPerMinute: number;
  queuePriority: number; // Higher = faster processing
  responseDepth: 'concise' | 'standard' | 'deep';
  sessionMemoryEnabled: boolean;
  multiGameContext: boolean;
  maxSessionTurns: number;
}

export interface UserAIStats {
  requestCount: number;
  lastRequestAt: Date | null;
  avgResponseTimeMs: number;
}

export interface EliteContext {
  watchedGames: Array<{
    gameId: string;
    homeTeam: string;
    awayTeam: string;
    sportKey: string;
    startTime: string;
  }>;
  followedTeams: Array<{
    entityKey: string;
    entityName: string;
    sportKey: string;
    priority: number;
  }>;
  recentInteractions: Array<{
    turnNumber: number;
    userMessage: string;
    assistantResponse: string;
    createdAt: string;
  }>;
  preferences: {
    tone: string;
    detailLevel: string;
    focusAreas: string[];
  } | null;
}

export interface AIRoutingMetrics {
  userId: string;
  tier: AITier;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  responseTimeMs: number;
  queueWaitMs: number;
  wasCached: boolean;
  wasRateLimited: boolean;
  errorType?: string;
}

// Model configurations by tier
const TIER_CONFIGS: Record<AITier, PriorityRouting> = {
  free: {
    tier: 'free',
    model: 'gpt-4o-mini',
    maxTokens: 500,          // Lower cap for concise responses
    temperature: 0.7,
    timeoutMs: 30000,
    rateLimitPerMinute: 10,  // Throttled after daily soft cap
    queuePriority: 1,
    responseDepth: 'concise',
    sessionMemoryEnabled: false,
    multiGameContext: false,
    maxSessionTurns: 0,
  },
  pro: {
    tier: 'pro',
    model: 'gpt-4o-mini',
    maxTokens: 800,          // Full token cap
    temperature: 0.7,
    timeoutMs: 25000,
    rateLimitPerMinute: 30,  // Normal latency
    queuePriority: 2,
    responseDepth: 'standard',
    sessionMemoryEnabled: false,
    multiGameContext: false,
    maxSessionTurns: 0,
  },
  elite: {
    tier: 'elite',
    model: 'gpt-4o',          // Premium model
    maxTokens: 1500,          // Higher token cap for deep analysis
    temperature: 0.7,
    timeoutMs: 20000,         // Faster timeout target
    rateLimitPerMinute: 100,  // Priority queue
    queuePriority: 3,
    responseDepth: 'deep',
    sessionMemoryEnabled: true,
    multiGameContext: true,
    maxSessionTurns: 10,      // Recent 10 interactions
  },
};

/**
 * Map subscription product keys to AI tiers
 */
function mapProductKeyToTier(productKey: string | null | undefined): AITier {
  if (!productKey) return 'free';
  
  const key = productKey.toLowerCase();
  if (key.includes('elite') || key.includes('admin')) return 'elite';
  if (key.includes('pro') || key.includes('pool')) return 'pro';
  return 'free';
}

/**
 * Get AI routing configuration for a user
 */
export async function getAIPriorityRouting(
  db: D1Database,
  userId: string
): Promise<PriorityRouting> {
  try {
    // Get user's subscription
    const subscription = await db.prepare(`
      SELECT product_key, status
      FROM user_subscriptions
      WHERE user_id = ?
        AND status IN ('active', 'trialing')
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(userId).first<{ product_key: string; status: string }>();

    const tier = mapProductKeyToTier(subscription?.product_key);
    return TIER_CONFIGS[tier];
  } catch (error) {
    console.error('Error getting AI priority routing:', error);
    return TIER_CONFIGS.free;
  }
}

/**
 * Get Elite context: watched games, followed teams, session memory
 * Only fetches data for Elite tier users
 */
export async function getEliteContext(
  db: D1Database,
  userId: string,
  sessionId?: string
): Promise<EliteContext | null> {
  try {
    // Get watched games (active games from watchlist)
    const { results: watchedGames } = await db.prepare(`
      SELECT gw.game_id, gw.home_team, gw.away_team, gw.sport_key, gw.game_start_time
      FROM game_watchlist gw
      WHERE gw.user_id = ?
        AND datetime(gw.game_start_time) > datetime('now', '-4 hours')
        AND datetime(gw.game_start_time) < datetime('now', '+24 hours')
      ORDER BY gw.game_start_time ASC
      LIMIT 10
    `).bind(userId).all();

    // Get followed teams from Scout Memory
    const { results: followedTeams } = await db.prepare(`
      SELECT entity_key, entity_name, sport_key, priority
      FROM scout_memory_entities
      WHERE user_id = ? 
        AND entity_type = 'TEAM' 
        AND is_active = 1
      ORDER BY priority DESC
      LIMIT 10
    `).bind(userId).all();

    // Get recent session interactions (last 10 turns)
    let recentInteractions: any[] = [];
    if (sessionId) {
      const { results } = await db.prepare(`
        SELECT turn_number, user_message, assistant_response, created_at
        FROM ai_session_memory
        WHERE user_id = ? AND session_id = ?
        ORDER BY turn_number DESC
        LIMIT 10
      `).bind(userId, sessionId).all();
      recentInteractions = results.reverse(); // Chronological order
    } else {
      // Get most recent interactions across sessions
      const { results } = await db.prepare(`
        SELECT turn_number, user_message, assistant_response, created_at
        FROM ai_session_memory
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `).bind(userId).all();
      recentInteractions = results.reverse();
    }

    // Get user preferences
    const preferences = await db.prepare(`
      SELECT tone, detail_level,
        focus_injuries, focus_weather, focus_trends, 
        focus_line_movement, focus_matchups
      FROM scout_memory_preferences
      WHERE user_id = ?
    `).bind(userId).first<{
      tone: string;
      detail_level: string;
      focus_injuries: number;
      focus_weather: number;
      focus_trends: number;
      focus_line_movement: number;
      focus_matchups: number;
    }>();

    // Build focus areas array
    const focusAreas: string[] = [];
    if (preferences) {
      if (preferences.focus_injuries) focusAreas.push('injuries');
      if (preferences.focus_weather) focusAreas.push('weather');
      if (preferences.focus_trends) focusAreas.push('trends');
      if (preferences.focus_line_movement) focusAreas.push('line_movement');
      if (preferences.focus_matchups) focusAreas.push('matchups');
    }

    return {
      watchedGames: watchedGames.map((g: any) => ({
        gameId: g.game_id,
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        sportKey: g.sport_key,
        startTime: g.game_start_time,
      })),
      followedTeams: followedTeams.map((t: any) => ({
        entityKey: t.entity_key,
        entityName: t.entity_name,
        sportKey: t.sport_key,
        priority: t.priority,
      })),
      recentInteractions: recentInteractions.map((i: any) => ({
        turnNumber: i.turn_number,
        userMessage: i.user_message,
        assistantResponse: i.assistant_response,
        createdAt: i.created_at,
      })),
      preferences: preferences ? {
        tone: preferences.tone,
        detailLevel: preferences.detail_level,
        focusAreas,
      } : null,
    };
  } catch (error) {
    console.error('Error getting Elite context:', error);
    return null;
  }
}

/**
 * Save session memory for Elite users
 */
export async function saveSessionMemory(
  db: D1Database,
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  toolsUsed: string[],
  gamesReferenced: string[],
  teamsReferenced: string[]
): Promise<void> {
  try {
    // Get current turn number
    const lastTurn = await db.prepare(`
      SELECT MAX(turn_number) as max_turn
      FROM ai_session_memory
      WHERE user_id = ? AND session_id = ?
    `).bind(userId, sessionId).first<{ max_turn: number | null }>();

    const turnNumber = (lastTurn?.max_turn || 0) + 1;

    await db.prepare(`
      INSERT INTO ai_session_memory (
        user_id, session_id, turn_number, user_message, assistant_response,
        tools_used, games_referenced, teams_referenced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      sessionId,
      turnNumber,
      userMessage,
      assistantResponse,
      toolsUsed.join(','),
      JSON.stringify(gamesReferenced),
      JSON.stringify(teamsReferenced)
    ).run();

    // Clean up old sessions (keep last 50 turns per user)
    await db.prepare(`
      DELETE FROM ai_session_memory
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM ai_session_memory
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      )
    `).bind(userId, userId).run();
  } catch (error) {
    console.error('Error saving session memory:', error);
  }
}

/**
 * Check if user has exceeded rate limit
 */
export async function checkAIRateLimit(
  db: D1Database,
  userId: string,
  routing: PriorityRouting
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  try {
    const result = await db.prepare(`
      SELECT COUNT(*) as count
      FROM ai_event_log
      WHERE user_id = ?
        AND created_at > datetime(?, 'unixepoch', 'subsec')
    `).bind(userId, windowStart / 1000).first<{ count: number }>();

    const count = result?.count || 0;
    const allowed = count < routing.rateLimitPerMinute;
    const remaining = Math.max(0, routing.rateLimitPerMinute - count);
    const resetAt = new Date(now + 60000);

    return { allowed, remaining, resetAt };
  } catch (error) {
    console.error('Error checking AI rate limit:', error);
    return { allowed: true, remaining: routing.rateLimitPerMinute, resetAt: new Date(now + 60000) };
  }
}

/**
 * Get user's AI usage statistics
 */
export async function getUserAIStats(
  db: D1Database,
  userId: string,
  daysBack: number = 30
): Promise<UserAIStats> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  try {
    const stats = await db.prepare(`
      SELECT 
        COUNT(*) as request_count,
        MAX(created_at) as last_request_at,
        AVG(CAST(
          CASE WHEN sources_used LIKE '%response_time:%' 
          THEN SUBSTR(sources_used, INSTR(sources_used, 'response_time:') + 14)
          ELSE '0' END AS INTEGER
        )) as avg_response_time_ms
      FROM ai_event_log
      WHERE user_id = ?
        AND created_at > ?
    `).bind(userId, cutoff.toISOString()).first<{
      request_count: number;
      last_request_at: string | null;
      avg_response_time_ms: number | null;
    }>();

    return {
      requestCount: stats?.request_count || 0,
      lastRequestAt: stats?.last_request_at ? new Date(stats.last_request_at) : null,
      avgResponseTimeMs: stats?.avg_response_time_ms || 0,
    };
  } catch (error) {
    console.error('Error getting user AI stats:', error);
    return {
      requestCount: 0,
      lastRequestAt: null,
      avgResponseTimeMs: 0,
    };
  }
}

/**
 * Log AI request with performance metrics
 */
export async function logAIRequest(
  db: D1Database,
  userId: string,
  routing: PriorityRouting,
  persona: string,
  message: string,
  response: string,
  responseTimeMs: number,
  toolsUsed: string[],
  success: boolean
): Promise<void> {
  try {
    // Log to ai_event_log
    await db.prepare(`
      INSERT INTO ai_event_log (
        persona, user_id, request_text, response_text, sources_used, flags
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      persona,
      userId,
      message,
      response,
      `${toolsUsed.join(',')};response_time:${responseTimeMs};tier:${routing.tier};model:${routing.model}`,
      success ? '' : 'error'
    ).run();

    // Log to metrics table for detailed analysis
    await db.prepare(`
      INSERT INTO ai_routing_metrics (
        user_id, tier, model, response_time_ms, was_cached, was_rate_limited
      ) VALUES (?, ?, ?, ?, 0, 0)
    `).bind(userId, routing.tier, routing.model, responseTimeMs).run();
  } catch (error) {
    console.error('Error logging AI request:', error);
  }
}

/**
 * Log detailed routing metrics
 */
export async function logRoutingMetrics(
  db: D1Database,
  metrics: AIRoutingMetrics
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO ai_routing_metrics (
        user_id, tier, model, input_tokens, output_tokens, total_tokens,
        response_time_ms, queue_wait_ms, was_cached, was_rate_limited, error_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      metrics.userId,
      metrics.tier,
      metrics.model,
      metrics.inputTokens || null,
      metrics.outputTokens || null,
      metrics.totalTokens || null,
      metrics.responseTimeMs,
      metrics.queueWaitMs,
      metrics.wasCached ? 1 : 0,
      metrics.wasRateLimited ? 1 : 0,
      metrics.errorType || null
    ).run();
  } catch (error) {
    console.error('Error logging routing metrics:', error);
  }
}

/**
 * Get aggregated metrics for monitoring dashboard
 */
export async function getAggregatedMetrics(
  db: D1Database,
  hoursBack: number = 24
): Promise<{
  byTier: Record<AITier, {
    requestCount: number;
    avgResponseTimeMs: number;
    errorRate: number;
    avgTokens: number;
  }>;
  queueDepth: number;
  totalRequests: number;
}> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hoursBack);

  try {
    const { results } = await db.prepare(`
      SELECT 
        tier,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        SUM(CASE WHEN error_type IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as error_rate,
        AVG(total_tokens) as avg_tokens
      FROM ai_routing_metrics
      WHERE created_at > ?
      GROUP BY tier
    `).bind(cutoff.toISOString()).all();

    const byTier: Record<string, any> = {
      free: { requestCount: 0, avgResponseTimeMs: 0, errorRate: 0, avgTokens: 0 },
      pro: { requestCount: 0, avgResponseTimeMs: 0, errorRate: 0, avgTokens: 0 },
      elite: { requestCount: 0, avgResponseTimeMs: 0, errorRate: 0, avgTokens: 0 },
    };

    let totalRequests = 0;

    results.forEach((row: any) => {
      if (byTier[row.tier]) {
        byTier[row.tier] = {
          requestCount: row.request_count || 0,
          avgResponseTimeMs: Math.round(row.avg_response_time || 0),
          errorRate: row.error_rate || 0,
          avgTokens: Math.round(row.avg_tokens || 0),
        };
        totalRequests += row.request_count || 0;
      }
    });

    // Estimate queue depth from recent rate-limited requests
    const queueResult = await db.prepare(`
      SELECT COUNT(*) as queued
      FROM ai_routing_metrics
      WHERE created_at > datetime('now', '-5 minutes')
        AND was_rate_limited = 1
    `).first<{ queued: number }>();

    return {
      byTier: byTier as Record<AITier, any>,
      queueDepth: queueResult?.queued || 0,
      totalRequests,
    };
  } catch (error) {
    console.error('Error getting aggregated metrics:', error);
    return {
      byTier: {
        free: { requestCount: 0, avgResponseTimeMs: 0, errorRate: 0, avgTokens: 0 },
        pro: { requestCount: 0, avgResponseTimeMs: 0, errorRate: 0, avgTokens: 0 },
        elite: { requestCount: 0, avgResponseTimeMs: 0, errorRate: 0, avgTokens: 0 },
      },
      queueDepth: 0,
      totalRequests: 0,
    };
  }
}

/**
 * Get queue position estimate based on priority
 */
export function getQueuePosition(routing: PriorityRouting): number {
  if (routing.tier === 'elite') return 0; // Immediate processing
  if (routing.tier === 'pro') return Math.floor(Math.random() * 3) + 1;
  return Math.floor(Math.random() * 10) + 3; // Free tier may wait
}

/**
 * Get tier display information
 */
export function getTierDisplay(tier: AITier): {
  name: string;
  badge: string;
  color: string;
  description: string;
} {
  const displays = {
    free: {
      name: 'Free',
      badge: 'FREE',
      color: 'text-muted-foreground',
      description: 'Standard processing with concise responses',
    },
    pro: {
      name: 'Pro',
      badge: 'PRO',
      color: 'text-blue-500',
      description: 'Full contextual breakdown with standard model',
    },
    elite: {
      name: 'Elite',
      badge: 'ELITE',
      color: 'text-violet-500',
      description: 'Premium GPT-4o model with deep analysis and multi-game context',
    },
  };
  
  return displays[tier];
}

/**
 * Build response depth instructions for system prompt
 */
export function getResponseDepthInstructions(routing: PriorityRouting): string {
  switch (routing.responseDepth) {
    case 'concise':
      return `
RESPONSE STYLE: CONCISE
- Keep responses brief and to the point
- Focus on the most important facts only
- Use bullet points for clarity
- Avoid lengthy explanations
- Maximum 2-3 paragraphs`;
    
    case 'standard':
      return `
RESPONSE STYLE: STANDARD
- Provide full contextual breakdown
- Include relevant statistics and trends
- Explain reasoning clearly
- Use structured formatting when helpful
- Balance depth with readability`;
    
    case 'deep':
      return `
RESPONSE STYLE: DEEP ANALYSIS (Elite)
- Provide expanded statistical depth
- Include multi-factor breakdown
- Use structured sections with clear headers
- Bullet points for clarity and scannability
- Consider multiple angles and scenarios
- Reference historical context when relevant
- Cross-reference data points for insights
- Still maintain compliance: no betting advice`;
    
    default:
      return '';
  }
}

/**
 * Build Elite context prompt addition
 */
export function buildEliteContextPrompt(context: EliteContext | null): string {
  if (!context) return '';

  const parts: string[] = [];

  // Watched games context
  if (context.watchedGames.length > 0) {
    parts.push(`
USER'S ACTIVE WATCHED GAMES:
${context.watchedGames.map(g => 
  `- ${g.awayTeam} @ ${g.homeTeam} (${g.sportKey}) - ${g.startTime}`
).join('\n')}
Consider these games in your analysis when relevant.`);
  }

  // Followed teams context
  if (context.followedTeams.length > 0) {
    parts.push(`
USER'S FOLLOWED TEAMS (by priority):
${context.followedTeams.map(t => 
  `- ${t.entityName} (${t.sportKey}) - Priority: ${t.priority}/10`
).join('\n')}
Prioritize information about these teams when answering.`);
  }

  // Session memory context
  if (context.recentInteractions.length > 0) {
    parts.push(`
RECENT CONVERSATION CONTEXT:
${context.recentInteractions.slice(-3).map(i => 
  `User: ${i.userMessage.substring(0, 100)}${i.userMessage.length > 100 ? '...' : ''}
Scout: ${i.assistantResponse.substring(0, 150)}${i.assistantResponse.length > 150 ? '...' : ''}`
).join('\n\n')}
Use this context to maintain conversation continuity.`);
  }

  // User preferences
  if (context.preferences) {
    parts.push(`
USER PREFERENCES:
- Tone: ${context.preferences.tone}
- Detail Level: ${context.preferences.detailLevel}
- Focus Areas: ${context.preferences.focusAreas.join(', ') || 'all'}
Adjust your response style accordingly.`);
  }

  return parts.length > 0 ? '\n\n--- ELITE USER CONTEXT ---' + parts.join('\n') : '';
}

/**
 * Extract referenced entities from message for session logging
 */
export function extractReferencedEntities(
  message: string,
  response: string
): { games: string[]; teams: string[] } {
  // Simple extraction - could be enhanced with NLP
  const teamPatterns = [
    /\b(Chiefs|Raiders|Cowboys|Eagles|Patriots|49ers|Packers|Bears|Vikings|Lions)\b/gi,
    /\b(Lakers|Celtics|Warriors|Heat|Nets|Bucks|Suns|Mavericks|Clippers|Nuggets)\b/gi,
    /\b(Yankees|Red Sox|Dodgers|Cubs|Cardinals|Braves|Astros|Phillies|Mets|Giants)\b/gi,
  ];

  const teams: Set<string> = new Set();
  const games: Set<string> = new Set();

  const text = `${message} ${response}`;
  
  teamPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => teams.add(m));
    }
  });

  // Extract game IDs mentioned (e.g., "game 123" or "game_id: 456")
  const gameIdPattern = /game[_\s]*(?:id[:\s]*)?(\d+)/gi;
  let match;
  while ((match = gameIdPattern.exec(text)) !== null) {
    games.add(match[1]);
  }

  return {
    games: Array.from(games),
    teams: Array.from(teams),
  };
}
