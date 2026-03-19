// Scout Data Caching Service
// Caches tool responses to improve performance and reduce database load

export interface CacheEntry {
  key: string;
  data: any;
  source: string;
  lastUpdated: string;
  cachedAt: string;
  expiresAt: string;
  hitCount: number;
}

export interface CacheConfig {
  [toolName: string]: {
    ttlMinutes: number;
    maxEntries: number;
  };
}

// TTL configuration per tool type
export const CACHE_CONFIG: CacheConfig = {
  // Fast-changing data - short TTL
  get_lines_history: { ttlMinutes: 2, maxEntries: 50 },
  get_market_averages: { ttlMinutes: 2, maxEntries: 50 },
  get_injuries: { ttlMinutes: 15, maxEntries: 30 },
  
  // Moderate change frequency
  get_game_schedule: { ttlMinutes: 10, maxEntries: 20 },
  get_game_details: { ttlMinutes: 5, maxEntries: 100 },
  get_live_state: { ttlMinutes: 1, maxEntries: 100 }, // Very short TTL for live data
  get_standings: { ttlMinutes: 30, maxEntries: 20 },
  get_weather: { ttlMinutes: 30, maxEntries: 30 },
  
  // Slow-changing data - longer TTL
  get_team_stats: { ttlMinutes: 60, maxEntries: 50 },
  get_team_recent_results: { ttlMinutes: 60, maxEntries: 50 },
  get_team_form: { ttlMinutes: 30, maxEntries: 50 },
  get_head_to_head: { ttlMinutes: 120, maxEntries: 50 },
  get_venue_info: { ttlMinutes: 1440, maxEntries: 30 }, // 24 hours
  resolve_entity: { ttlMinutes: 60, maxEntries: 100 },
  search_knowledge_base: { ttlMinutes: 1440, maxEntries: 50 }, // 24 hours
  
  // User-specific - short TTL
  get_pool_rules: { ttlMinutes: 30, maxEntries: 30 },
  get_user_picks: { ttlMinutes: 5, maxEntries: 50 },
};

// Generate cache key from tool name and args
export function generateCacheKey(toolName: string, args: Record<string, any>, userId?: string): string {
  // Sort args for consistent key generation
  const sortedArgs = Object.keys(args)
    .sort()
    .reduce((acc, key) => {
      if (args[key] !== undefined && args[key] !== null && args[key] !== "") {
        acc[key] = args[key];
      }
      return acc;
    }, {} as Record<string, any>);
  
  // Include userId for user-specific tools
  const userSpecificTools = ["get_user_picks", "get_pool_rules"];
  const userKey = userSpecificTools.includes(toolName) && userId ? `:${userId}` : "";
  
  return `scout:${toolName}${userKey}:${JSON.stringify(sortedArgs)}`;
}

// Check if cached data is still valid
export function isCacheValid(entry: CacheEntry): boolean {
  const now = new Date();
  const expiresAt = new Date(entry.expiresAt);
  return now < expiresAt;
}

// Get cached data if available and valid
export async function getCachedData(
  db: D1Database,
  cacheKey: string
): Promise<CacheEntry | null> {
  try {
    const result = await db.prepare(`
      SELECT * FROM scout_cache WHERE cache_key = ?
    `).bind(cacheKey).first();
    
    if (!result) return null;
    
    const entry: CacheEntry = {
      key: result.cache_key as string,
      data: JSON.parse(result.data_json as string),
      source: result.source as string,
      lastUpdated: result.last_updated as string,
      cachedAt: result.cached_at as string,
      expiresAt: result.expires_at as string,
      hitCount: result.hit_count as number,
    };
    
    if (!isCacheValid(entry)) {
      // Cache expired, delete it
      await db.prepare(`DELETE FROM scout_cache WHERE cache_key = ?`).bind(cacheKey).run();
      return null;
    }
    
    // Update hit count
    await db.prepare(`
      UPDATE scout_cache SET hit_count = hit_count + 1, updated_at = CURRENT_TIMESTAMP WHERE cache_key = ?
    `).bind(cacheKey).run();
    
    return entry;
  } catch (error) {
    // Table might not exist yet, or other error
    console.error("Cache read error:", error);
    return null;
  }
}

// Store data in cache
export async function setCachedData(
  db: D1Database,
  toolName: string,
  cacheKey: string,
  data: any,
  source: string,
  lastUpdated: string
): Promise<void> {
  const config = CACHE_CONFIG[toolName] || { ttlMinutes: 10, maxEntries: 50 };
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.ttlMinutes * 60 * 1000);
  
  try {
    await db.prepare(`
      INSERT INTO scout_cache (cache_key, tool_name, data_json, source, last_updated, cached_at, expires_at, hit_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        data_json = excluded.data_json,
        source = excluded.source,
        last_updated = excluded.last_updated,
        cached_at = CURRENT_TIMESTAMP,
        expires_at = excluded.expires_at,
        hit_count = 0,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      cacheKey,
      toolName,
      JSON.stringify(data),
      source,
      lastUpdated,
      expiresAt.toISOString()
    ).run();
    
    // Cleanup old entries if over limit
    await cleanupExpiredCache(db, toolName, config.maxEntries);
  } catch (error) {
    // Cache write failure shouldn't break the app
    console.error("Cache write error:", error);
  }
}

// Cleanup expired cache entries
async function cleanupExpiredCache(
  db: D1Database,
  toolName: string,
  maxEntries: number
): Promise<void> {
  try {
    // Delete expired entries
    await db.prepare(`
      DELETE FROM scout_cache WHERE expires_at < CURRENT_TIMESTAMP
    `).run();
    
    // Delete excess entries for this tool (keep most recently accessed)
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM scout_cache WHERE tool_name = ?
    `).bind(toolName).first();
    
    const count = (countResult?.count as number) || 0;
    
    if (count > maxEntries) {
      const deleteCount = count - maxEntries;
      await db.prepare(`
        DELETE FROM scout_cache 
        WHERE cache_key IN (
          SELECT cache_key FROM scout_cache 
          WHERE tool_name = ? 
          ORDER BY hit_count ASC, updated_at ASC 
          LIMIT ?
        )
      `).bind(toolName, deleteCount).run();
    }
  } catch (error) {
    console.error("Cache cleanup error:", error);
  }
}

// Get cache statistics
export async function getCacheStats(db: D1Database): Promise<{
  totalEntries: number;
  totalHits: number;
  entriesByTool: Array<{ toolName: string; count: number; hits: number }>;
  oldestEntry: string | null;
  newestEntry: string | null;
}> {
  try {
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as count, SUM(hit_count) as hits FROM scout_cache
    `).first();
    
    const { results: byTool } = await db.prepare(`
      SELECT tool_name, COUNT(*) as count, SUM(hit_count) as hits 
      FROM scout_cache 
      GROUP BY tool_name 
      ORDER BY count DESC
    `).all();
    
    const oldestResult = await db.prepare(`
      SELECT cached_at FROM scout_cache ORDER BY cached_at ASC LIMIT 1
    `).first();
    
    const newestResult = await db.prepare(`
      SELECT cached_at FROM scout_cache ORDER BY cached_at DESC LIMIT 1
    `).first();
    
    return {
      totalEntries: (totalResult?.count as number) || 0,
      totalHits: (totalResult?.hits as number) || 0,
      entriesByTool: byTool.map((r: any) => ({
        toolName: r.tool_name,
        count: r.count,
        hits: r.hits || 0,
      })),
      oldestEntry: (oldestResult?.cached_at as string) || null,
      newestEntry: (newestResult?.cached_at as string) || null,
    };
  } catch (error) {
    console.error("Cache stats error:", error);
    return {
      totalEntries: 0,
      totalHits: 0,
      entriesByTool: [],
      oldestEntry: null,
      newestEntry: null,
    };
  }
}

// Clear all cache or specific tool cache
export async function clearCache(db: D1Database, toolName?: string): Promise<number> {
  try {
    if (toolName) {
      const result = await db.prepare(`
        DELETE FROM scout_cache WHERE tool_name = ?
      `).bind(toolName).run();
      return result.meta.changes || 0;
    } else {
      const result = await db.prepare(`DELETE FROM scout_cache`).run();
      return result.meta.changes || 0;
    }
  } catch (error) {
    console.error("Cache clear error:", error);
    return 0;
  }
}

// Invalidate cache entries matching a pattern
export async function invalidateCachePattern(
  db: D1Database,
  pattern: string
): Promise<number> {
  try {
    const result = await db.prepare(`
      DELETE FROM scout_cache WHERE cache_key LIKE ?
    `).bind(`%${pattern}%`).run();
    return result.meta.changes || 0;
  } catch (error) {
    console.error("Cache invalidation error:", error);
    return 0;
  }
}
