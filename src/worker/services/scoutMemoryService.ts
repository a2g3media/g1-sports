/**
 * Scout Memory Service
 * 
 * Manages Scout's personalization memory for each user:
 * - Followed entities (teams, players, leagues, games)
 * - User preferences (tone, detail level, focus areas)
 * - Interaction history (questions, picks, views)
 * 
 * This service provides the data layer for Scout's personalization features.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// Types
// ============================================================================

export type EntityType = "TEAM" | "PLAYER" | "LEAGUE" | "GAME";

export interface FollowedEntity {
  id: number;
  entityType: EntityType;
  entityKey: string;
  entityName: string;
  sportKey: string;
  priority: number;
  context: string | null;
  autoAdded: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface MemoryPreferences {
  // Tone
  tone: "casual" | "balanced" | "analytical";
  detailLevel: "brief" | "medium" | "detailed";
  
  // Focus areas
  focusInjuries: boolean;
  focusWeather: boolean;
  focusTrends: boolean;
  focusLineMovement: boolean;
  focusMatchups: boolean;
  
  // Context
  includeHistoricalContext: boolean;
  includeMarketContext: boolean;
  includeSocialSentiment: boolean;
  
  // Behavior
  autoLearnFollows: boolean;
  useMemoryInResponses: boolean;
  showMemoryCitations: boolean;
}

export interface MemoryInteraction {
  id: number;
  interactionType: string;
  topic: string | null;
  entityKeys: string[];
  sportKey: string | null;
  createdAt: string;
}

export interface MemorySummary {
  followedTeams: FollowedEntity[];
  followedPlayers: FollowedEntity[];
  followedLeagues: FollowedEntity[];
  preferences: MemoryPreferences;
  recentTopics: string[];
  totalInteractions: number;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_PREFERENCES: MemoryPreferences = {
  tone: "balanced",
  detailLevel: "medium",
  focusInjuries: true,
  focusWeather: true,
  focusTrends: true,
  focusLineMovement: true,
  focusMatchups: true,
  includeHistoricalContext: true,
  includeMarketContext: true,
  includeSocialSentiment: false,
  autoLearnFollows: true,
  useMemoryInResponses: true,
  showMemoryCitations: false,
};

// ============================================================================
// Followed Entities Operations
// ============================================================================

/**
 * Get all followed entities for a user
 */
export async function getFollowedEntities(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  options: {
    entityType?: EntityType;
    sportKey?: string;
    activeOnly?: boolean;
    limit?: number;
  } = {}
): Promise<FollowedEntity[]> {
  const { entityType, sportKey, activeOnly = true, limit = 100 } = options;
  
  let query = `
    SELECT id, entity_type, entity_key, entity_name, sport_key,
           priority, context, auto_added, is_active, created_at
    FROM scout_memory_entities
    WHERE user_id = ? AND data_scope = ?
  `;
  const params: (string | number)[] = [userId, dataScope];
  
  if (activeOnly) {
    query += ` AND is_active = 1`;
  }
  
  if (entityType) {
    query += ` AND entity_type = ?`;
    params.push(entityType);
  }
  
  if (sportKey) {
    query += ` AND sport_key = ?`;
    params.push(sportKey);
  }
  
  query += ` ORDER BY priority DESC, created_at DESC LIMIT ?`;
  params.push(limit);
  
  const result = await db.prepare(query).bind(...params).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    id: row.id as number,
    entityType: row.entity_type as EntityType,
    entityKey: row.entity_key as string,
    entityName: row.entity_name as string,
    sportKey: row.sport_key as string,
    priority: row.priority as number,
    context: row.context as string | null,
    autoAdded: Boolean(row.auto_added),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  }));
}

/**
 * Add or update a followed entity
 */
export async function followEntity(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  entity: {
    entityType: EntityType;
    entityKey: string;
    entityName: string;
    sportKey: string;
    priority?: number;
    context?: string;
    autoAdded?: boolean;
  }
): Promise<{ id: number; isNew: boolean }> {
  const {
    entityType,
    entityKey,
    entityName,
    sportKey,
    priority = 5,
    context = null,
    autoAdded = false,
  } = entity;
  
  // Check if already exists
  const existing = await db.prepare(`
    SELECT id FROM scout_memory_entities
    WHERE user_id = ? AND data_scope = ? AND entity_type = ? AND entity_key = ?
  `).bind(userId, dataScope, entityType, entityKey).first() as { id: number } | null;
  
  if (existing) {
    // Update existing
    await db.prepare(`
      UPDATE scout_memory_entities
      SET entity_name = ?, priority = ?, context = COALESCE(?, context),
          is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(entityName, priority, context, existing.id).run();
    
    return { id: existing.id, isNew: false };
  }
  
  // Insert new
  const result = await db.prepare(`
    INSERT INTO scout_memory_entities (
      user_id, data_scope, entity_type, entity_key, entity_name,
      sport_key, priority, context, auto_added, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    userId, dataScope, entityType, entityKey, entityName,
    sportKey, priority, context, autoAdded ? 1 : 0
  ).run();
  
  return { id: result.meta?.last_row_id || 0, isNew: true };
}

/**
 * Unfollow an entity (soft delete)
 */
export async function unfollowEntity(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  entityType: EntityType,
  entityKey: string
): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE scout_memory_entities
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND data_scope = ? AND entity_type = ? AND entity_key = ?
  `).bind(userId, dataScope, entityType, entityKey).run();
  
  return (result.meta?.changes || 0) > 0;
}

/**
 * Update entity priority
 */
export async function updateEntityPriority(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  entityId: number,
  priority: number
): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE scout_memory_entities
    SET priority = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND data_scope = ?
  `).bind(priority, entityId, userId, dataScope).run();
  
  return (result.meta?.changes || 0) > 0;
}

/**
 * Clear all followed entities for a user
 */
export async function clearFollowedEntities(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  entityType?: EntityType
): Promise<number> {
  let query = `
    DELETE FROM scout_memory_entities
    WHERE user_id = ? AND data_scope = ?
  `;
  const params: string[] = [userId, dataScope];
  
  if (entityType) {
    query += ` AND entity_type = ?`;
    params.push(entityType);
  }
  
  const result = await db.prepare(query).bind(...params).run();
  return result.meta?.changes || 0;
}

// ============================================================================
// Preferences Operations
// ============================================================================

/**
 * Get memory preferences for a user
 */
export async function getMemoryPreferences(
  db: D1Database,
  userId: string,
  _dataScope: DataScope
): Promise<MemoryPreferences> {
  const result = await db.prepare(`
    SELECT tone, detail_level, focus_injuries, focus_weather, focus_trends,
           focus_line_movement, focus_matchups, include_historical_context,
           include_market_context, include_social_sentiment, auto_learn_follows,
           use_memory_in_responses, show_memory_citations
    FROM scout_memory_preferences
    WHERE user_id = ?
  `).bind(userId).first() as Record<string, unknown> | null;
  
  if (!result) {
    return { ...DEFAULT_PREFERENCES };
  }
  
  return {
    tone: (result.tone as MemoryPreferences["tone"]) || "balanced",
    detailLevel: (result.detail_level as MemoryPreferences["detailLevel"]) || "medium",
    focusInjuries: Boolean(result.focus_injuries),
    focusWeather: Boolean(result.focus_weather),
    focusTrends: Boolean(result.focus_trends),
    focusLineMovement: Boolean(result.focus_line_movement),
    focusMatchups: Boolean(result.focus_matchups),
    includeHistoricalContext: Boolean(result.include_historical_context),
    includeMarketContext: Boolean(result.include_market_context),
    includeSocialSentiment: Boolean(result.include_social_sentiment),
    autoLearnFollows: Boolean(result.auto_learn_follows),
    useMemoryInResponses: Boolean(result.use_memory_in_responses),
    showMemoryCitations: Boolean(result.show_memory_citations),
  };
}

/**
 * Update memory preferences
 */
export async function updateMemoryPreferences(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  preferences: Partial<MemoryPreferences>
): Promise<void> {
  // Check if record exists
  const existing = await db.prepare(`
    SELECT id FROM scout_memory_preferences WHERE user_id = ?
  `).bind(userId).first();
  
  if (existing) {
    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const params: (string | number)[] = [];
    
    if (preferences.tone !== undefined) {
      updates.push("tone = ?");
      params.push(preferences.tone);
    }
    if (preferences.detailLevel !== undefined) {
      updates.push("detail_level = ?");
      params.push(preferences.detailLevel);
    }
    if (preferences.focusInjuries !== undefined) {
      updates.push("focus_injuries = ?");
      params.push(preferences.focusInjuries ? 1 : 0);
    }
    if (preferences.focusWeather !== undefined) {
      updates.push("focus_weather = ?");
      params.push(preferences.focusWeather ? 1 : 0);
    }
    if (preferences.focusTrends !== undefined) {
      updates.push("focus_trends = ?");
      params.push(preferences.focusTrends ? 1 : 0);
    }
    if (preferences.focusLineMovement !== undefined) {
      updates.push("focus_line_movement = ?");
      params.push(preferences.focusLineMovement ? 1 : 0);
    }
    if (preferences.focusMatchups !== undefined) {
      updates.push("focus_matchups = ?");
      params.push(preferences.focusMatchups ? 1 : 0);
    }
    if (preferences.includeHistoricalContext !== undefined) {
      updates.push("include_historical_context = ?");
      params.push(preferences.includeHistoricalContext ? 1 : 0);
    }
    if (preferences.includeMarketContext !== undefined) {
      updates.push("include_market_context = ?");
      params.push(preferences.includeMarketContext ? 1 : 0);
    }
    if (preferences.includeSocialSentiment !== undefined) {
      updates.push("include_social_sentiment = ?");
      params.push(preferences.includeSocialSentiment ? 1 : 0);
    }
    if (preferences.autoLearnFollows !== undefined) {
      updates.push("auto_learn_follows = ?");
      params.push(preferences.autoLearnFollows ? 1 : 0);
    }
    if (preferences.useMemoryInResponses !== undefined) {
      updates.push("use_memory_in_responses = ?");
      params.push(preferences.useMemoryInResponses ? 1 : 0);
    }
    if (preferences.showMemoryCitations !== undefined) {
      updates.push("show_memory_citations = ?");
      params.push(preferences.showMemoryCitations ? 1 : 0);
    }
    
    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(userId);
      
      await db.prepare(`
        UPDATE scout_memory_preferences
        SET ${updates.join(", ")}
        WHERE user_id = ?
      `).bind(...params).run();
    }
  } else {
    // Insert new record with defaults merged with provided values
    const merged = { ...DEFAULT_PREFERENCES, ...preferences };
    
    await db.prepare(`
      INSERT INTO scout_memory_preferences (
        user_id, data_scope, tone, detail_level,
        focus_injuries, focus_weather, focus_trends, focus_line_movement, focus_matchups,
        include_historical_context, include_market_context, include_social_sentiment,
        auto_learn_follows, use_memory_in_responses, show_memory_citations
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, dataScope, merged.tone, merged.detailLevel,
      merged.focusInjuries ? 1 : 0,
      merged.focusWeather ? 1 : 0,
      merged.focusTrends ? 1 : 0,
      merged.focusLineMovement ? 1 : 0,
      merged.focusMatchups ? 1 : 0,
      merged.includeHistoricalContext ? 1 : 0,
      merged.includeMarketContext ? 1 : 0,
      merged.includeSocialSentiment ? 1 : 0,
      merged.autoLearnFollows ? 1 : 0,
      merged.useMemoryInResponses ? 1 : 0,
      merged.showMemoryCitations ? 1 : 0
    ).run();
  }
}

/**
 * Reset preferences to defaults
 */
export async function resetMemoryPreferences(
  db: D1Database,
  userId: string
): Promise<void> {
  await db.prepare(`
    DELETE FROM scout_memory_preferences WHERE user_id = ?
  `).bind(userId).run();
}

// ============================================================================
// Interaction History Operations
// ============================================================================

/**
 * Record an interaction for learning
 */
export async function recordInteraction(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  interaction: {
    interactionType: "QUESTION" | "PICK" | "WATCHLIST_ADD" | "ALERT_VIEWED";
    topic?: string;
    entityKeys?: string[];
    sportKey?: string;
  }
): Promise<void> {
  const { interactionType, topic = null, entityKeys = [], sportKey = null } = interaction;
  
  await db.prepare(`
    INSERT INTO scout_memory_interactions (
      user_id, data_scope, interaction_type, topic, entity_keys, sport_key
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    userId, dataScope, interactionType, topic,
    entityKeys.length > 0 ? JSON.stringify(entityKeys) : null,
    sportKey
  ).run();
}

/**
 * Get recent interactions
 */
export async function getRecentInteractions(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  options: {
    interactionType?: string;
    limit?: number;
    daysBack?: number;
  } = {}
): Promise<MemoryInteraction[]> {
  const { interactionType, limit = 50, daysBack = 30 } = options;
  
  let query = `
    SELECT id, interaction_type, topic, entity_keys, sport_key, created_at
    FROM scout_memory_interactions
    WHERE user_id = ? AND data_scope = ?
    AND created_at > datetime('now', '-${daysBack} days')
  `;
  const params: (string | number)[] = [userId, dataScope];
  
  if (interactionType) {
    query += ` AND interaction_type = ?`;
    params.push(interactionType);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  
  const result = await db.prepare(query).bind(...params).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    id: row.id as number,
    interactionType: row.interaction_type as string,
    topic: row.topic as string | null,
    entityKeys: row.entity_keys ? JSON.parse(row.entity_keys as string) : [],
    sportKey: row.sport_key as string | null,
    createdAt: row.created_at as string,
  }));
}

/**
 * Get frequently mentioned entities from interactions
 */
export async function getFrequentEntities(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  options: {
    daysBack?: number;
    limit?: number;
  } = {}
): Promise<Array<{ entityKey: string; count: number }>> {
  const { daysBack = 30, limit = 20 } = options;
  
  // Get all interactions with entity keys
  const result = await db.prepare(`
    SELECT entity_keys
    FROM scout_memory_interactions
    WHERE user_id = ? AND data_scope = ?
    AND entity_keys IS NOT NULL
    AND created_at > datetime('now', '-${daysBack} days')
  `).bind(userId, dataScope).all();
  
  // Count entity frequencies
  const counts = new Map<string, number>();
  for (const row of (result.results || []) as { entity_keys: string }[]) {
    try {
      const keys = JSON.parse(row.entity_keys);
      for (const key of keys) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    } catch {
      // Skip invalid JSON
    }
  }
  
  // Sort by count and return top N
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([entityKey, count]) => ({ entityKey, count }));
}

/**
 * Clear interaction history
 */
export async function clearInteractionHistory(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  options: {
    olderThanDays?: number;
    interactionType?: string;
  } = {}
): Promise<number> {
  const { olderThanDays, interactionType } = options;
  
  let query = `
    DELETE FROM scout_memory_interactions
    WHERE user_id = ? AND data_scope = ?
  `;
  const params: string[] = [userId, dataScope];
  
  if (olderThanDays !== undefined) {
    query += ` AND created_at < datetime('now', '-${olderThanDays} days')`;
  }
  
  if (interactionType) {
    query += ` AND interaction_type = ?`;
    params.push(interactionType);
  }
  
  const result = await db.prepare(query).bind(...params).run();
  return result.meta?.changes || 0;
}

// ============================================================================
// Memory Summary (for Scout system prompt)
// ============================================================================

/**
 * Get a complete memory summary for use in Scout's system prompt
 */
export async function getMemorySummary(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<MemorySummary> {
  // Get followed entities by type
  const [teams, players, leagues, preferences, interactions] = await Promise.all([
    getFollowedEntities(db, userId, dataScope, { entityType: "TEAM", limit: 20 }),
    getFollowedEntities(db, userId, dataScope, { entityType: "PLAYER", limit: 20 }),
    getFollowedEntities(db, userId, dataScope, { entityType: "LEAGUE", limit: 10 }),
    getMemoryPreferences(db, userId, dataScope),
    getRecentInteractions(db, userId, dataScope, { limit: 20 }),
  ]);
  
  // Extract recent topics
  const recentTopics = interactions
    .filter(i => i.topic)
    .map(i => i.topic!)
    .slice(0, 10);
  
  // Get total interaction count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as count
    FROM scout_memory_interactions
    WHERE user_id = ? AND data_scope = ?
  `).bind(userId, dataScope).first() as { count: number } | null;
  
  return {
    followedTeams: teams,
    followedPlayers: players,
    followedLeagues: leagues,
    preferences,
    recentTopics,
    totalInteractions: countResult?.count || 0,
  };
}

/**
 * Clear all memory for a user (full reset)
 */
export async function clearAllMemory(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<{ entities: number; preferences: boolean; interactions: number }> {
  const entitiesDeleted = await clearFollowedEntities(db, userId, dataScope);
  await resetMemoryPreferences(db, userId);
  const interactionsDeleted = await clearInteractionHistory(db, userId, dataScope);
  
  return {
    entities: entitiesDeleted,
    preferences: true,
    interactions: interactionsDeleted,
  };
}

// ============================================================================
// Auto-Learning Helpers
// ============================================================================

/**
 * Auto-learn entities from a pick
 */
export async function learnFromPick(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  pick: {
    sportKey: string;
    homeTeam: string;
    awayTeam: string;
    pickSide: string;
  }
): Promise<void> {
  const prefs = await getMemoryPreferences(db, userId, dataScope);
  
  if (!prefs.autoLearnFollows) {
    return;
  }
  
  // Determine which team was picked
  const pickedTeam = pick.pickSide === "HOME" ? pick.homeTeam : pick.awayTeam;
  
  // Try to add as a followed team with low priority (auto-added)
  await followEntity(db, userId, dataScope, {
    entityType: "TEAM",
    entityKey: pickedTeam.toLowerCase().replace(/\s+/g, "_"),
    entityName: pickedTeam,
    sportKey: pick.sportKey,
    priority: 3,
    context: "Picked in a pool",
    autoAdded: true,
  });
  
  // Record the interaction
  await recordInteraction(db, userId, dataScope, {
    interactionType: "PICK",
    topic: `${pick.awayTeam} @ ${pick.homeTeam}`,
    entityKeys: [
      pick.homeTeam.toLowerCase().replace(/\s+/g, "_"),
      pick.awayTeam.toLowerCase().replace(/\s+/g, "_"),
    ],
    sportKey: pick.sportKey,
  });
}

/**
 * Auto-learn from a question asked to Scout
 */
export async function learnFromQuestion(
  db: D1Database,
  userId: string,
  dataScope: DataScope,
  question: {
    topic: string;
    entityKeys?: string[];
    sportKey?: string;
  }
): Promise<void> {
  await recordInteraction(db, userId, dataScope, {
    interactionType: "QUESTION",
    topic: question.topic,
    entityKeys: question.entityKeys,
    sportKey: question.sportKey,
  });
}
