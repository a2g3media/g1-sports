/**
 * API Cache Service
 * 
 * D1-based persistent caching for external API calls.
 * Dramatically reduces API calls to SportsRadar, provider feeds, etc.
 * 
 * Features:
 * - D1-based persistent caching
 * - In-flight request deduplication (prevents concurrent API calls for same data)
 * - Error response caching (prevents retry storms)
 */

// TTL presets in seconds - INCREASED to reduce API pressure
export const API_CACHE_TTL = {
  // SportsRadar - INCREASED TTLs to reduce rate limiting
  SR_STANDINGS: 30 * 60,        // 30 min - standings change slowly
  SR_SCHEDULE: 60 * 60,         // 1 hour - game schedules are static for day
  SR_TEAM_PROFILE: 2 * 60 * 60, // 2 hours - team info is very static
  SR_PLAYER_STATS: 30 * 60,     // 30 min - player stats
  SR_PROPS: 10 * 60,            // 10 min - props change but not rapidly
  SR_GOLF_LEADERBOARD: 3 * 60,  // 3 min - live golf data
  SR_GOLF_SCHEDULE: 2 * 60 * 60,// 2 hours - tournament schedule
  SR_SOCCER_MATCH_LIVE: 30,     // 30 sec - live match data
  SR_SOCCER_MATCH: 10 * 60,     // 10 min - pre/post match data
  SR_SOCCER_H2H: 2 * 60 * 60,   // 2 hours - H2H is historical
  SR_SOCCER_LEADERS: 30 * 60,   // 30 min - top scorers
  
  // Legacy provider feed
  SDIO_GAMES: 1 * 60,           // 1 min - game data
  SDIO_ODDS: 2 * 60,            // 2 min - odds data
  SDIO_LIVE: 30,                // 30 sec - live game updates
  
  // ESPN
  ESPN_SCOREBOARD: 1 * 60,      // 1 min - scores
  ESPN_PLAYER: 15 * 60,         // 15 min - player profiles
  
  // Default
  DEFAULT: 5 * 60,              // 5 min default
  
  // Error caching - short TTL to prevent retry storms
  ERROR: 60,                    // 1 min - cache errors briefly
} as const;

// In-flight request tracking to deduplicate concurrent requests
const inFlightRequests = new Map<string, Promise<any>>();

// Track whether we've already ensured the table exists in this isolate.
let apiCacheTableReady = false;

/**
 * Auto-create the api_cache table if it doesn't exist.
 * Called once per isolate lifetime on first cache access.
 */
async function ensureApiCacheTable(db: D1Database): Promise<void> {
  if (apiCacheTableReady) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS api_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT '',
        endpoint TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}',
        ttl_seconds INTEGER NOT NULL DEFAULT 300,
        cached_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL DEFAULT (datetime('now','+300 seconds')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        hit_count INTEGER NOT NULL DEFAULT 0
      )
    `).run();
    apiCacheTableReady = true;
  } catch (err) {
    console.error('[apiCache] Failed to ensure table:', err);
  }
}

interface CacheEntry {
  id: number;
  cache_key: string;
  provider: string;
  endpoint: string;
  data_json: string;
  ttl_seconds: number;
  cached_at: string;
  expires_at: string;
  hit_count: number;
}

/**
 * Generate a cache key from provider and endpoint
 */
export function makeCacheKey(provider: string, endpoint: string, params?: Record<string, string | number>): string {
  let key = `${provider}:${endpoint}`;
  if (params) {
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    if (sortedParams) {
      key += `?${sortedParams}`;
    }
  }
  return key;
}

/**
 * Get cached data from D1
 */
export async function getCachedData<T>(
  db: D1Database,
  cacheKey: string
): Promise<T | null> {
  try {
    await ensureApiCacheTable(db);
    const entry = await db.prepare(`
      SELECT * FROM api_cache 
      WHERE cache_key = ? AND expires_at > datetime('now')
    `).bind(cacheKey).first<CacheEntry>();
    
    if (!entry) return null;
    
    // Update hit count async (don't await)
    db.prepare(`
      UPDATE api_cache SET hit_count = hit_count + 1, updated_at = datetime('now')
      WHERE cache_key = ?
    `).bind(cacheKey).run().catch(() => {});
    
    return JSON.parse(entry.data_json) as T;
  } catch (err) {
    console.error('[apiCache] Error reading cache:', err);
    return null;
  }
}

/**
 * Set cached data in D1
 */
export async function setCachedData<T>(
  db: D1Database,
  cacheKey: string,
  provider: string,
  endpoint: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  try {
    await ensureApiCacheTable(db);
    const dataJson = JSON.stringify(data);
    
    await db.prepare(`
      INSERT INTO api_cache (cache_key, provider, endpoint, data_json, ttl_seconds, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))
      ON CONFLICT(cache_key) DO UPDATE SET
        data_json = excluded.data_json,
        ttl_seconds = excluded.ttl_seconds,
        expires_at = datetime('now', '+' || excluded.ttl_seconds || ' seconds'),
        cached_at = datetime('now'),
        updated_at = datetime('now')
    `).bind(cacheKey, provider, endpoint, dataJson, ttlSeconds, ttlSeconds).run();
  } catch (err) {
    console.error('[apiCache] Error writing cache:', err);
  }
}

/**
 * Clear expired cache entries (call periodically)
 */
export async function clearExpiredCache(db: D1Database): Promise<number> {
  try {
    const result = await db.prepare(`
      DELETE FROM api_cache WHERE expires_at < datetime('now')
    `).run();
    return result.meta.changes || 0;
  } catch (err) {
    console.error('[apiCache] Error clearing expired:', err);
    return 0;
  }
}

/**
 * Clear all cache for a provider
 */
export async function clearProviderCache(db: D1Database, provider: string): Promise<number> {
  try {
    const result = await db.prepare(`
      DELETE FROM api_cache WHERE provider = ?
    `).bind(provider).run();
    return result.meta.changes || 0;
  } catch (err) {
    console.error('[apiCache] Error clearing provider cache:', err);
    return 0;
  }
}

/**
 * Get cache stats
 */
export async function getCacheStats(db: D1Database): Promise<{
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  totalHits: number;
  byProvider: Record<string, number>;
}> {
  try {
    const stats = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > datetime('now') THEN 1 ELSE 0 END) as valid,
        SUM(CASE WHEN expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired,
        SUM(hit_count) as hits
      FROM api_cache
    `).first<{ total: number; valid: number; expired: number; hits: number }>();
    
    const byProviderRows = await db.prepare(`
      SELECT provider, COUNT(*) as count FROM api_cache 
      WHERE expires_at > datetime('now')
      GROUP BY provider
    `).all<{ provider: string; count: number }>();
    
    const byProvider: Record<string, number> = {};
    for (const row of byProviderRows.results || []) {
      byProvider[row.provider] = row.count;
    }
    
    return {
      totalEntries: stats?.total || 0,
      validEntries: stats?.valid || 0,
      expiredEntries: stats?.expired || 0,
      totalHits: stats?.hits || 0,
      byProvider,
    };
  } catch (err) {
    console.error('[apiCache] Error getting stats:', err);
    return { totalEntries: 0, validEntries: 0, expiredEntries: 0, totalHits: 0, byProvider: {} };
  }
}

/**
 * Wrapper for cached fetch - use this in providers
 * 
 * Features:
 * - Checks D1 cache first
 * - Deduplicates concurrent in-flight requests (prevents multiple API calls for same data)
 * - Caches error responses briefly to prevent retry storms
 */
export async function cachedFetch<T>(
  db: D1Database,
  provider: string,
  endpoint: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  params?: Record<string, string | number>
): Promise<{ data: T; fromCache: boolean }> {
  const cacheKey = makeCacheKey(provider, endpoint, params);
  
  // Check cache first
  const cached = await getCachedData<T>(db, cacheKey);
  if (cached !== null) {
    // Check if this is a cached error response
    if (typeof cached === 'object' && cached !== null && (cached as any).__cacheError) {
      console.log(`[apiCache] CACHED_ERROR: ${cacheKey.substring(0, 80)}...`);
      // Return the cached error - prevents retry storms
      // Caller should handle empty/error data gracefully
      return { data: { topScorers: [], topAssists: [], standings: [], schedule: [] } as unknown as T, fromCache: true };
    }
    console.log(`[apiCache] HIT: ${cacheKey.substring(0, 80)}...`);
    return { data: cached, fromCache: true };
  }
  
  // Check if there's already an in-flight request for this key
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    console.log(`[apiCache] DEDUP: ${cacheKey.substring(0, 80)}...`);
    try {
      const data = await inFlight;
      return { data, fromCache: true };
    } catch (err) {
      // In-flight request failed, we'll try our own
    }
  }
  
  // Create our request promise and track it
  console.log(`[apiCache] MISS: ${cacheKey.substring(0, 80)}...`);
  
  const requestPromise = (async () => {
    try {
      const data = await fetchFn();
      
      // Store successful result in cache
      await setCachedData(db, cacheKey, provider, endpoint, data, ttlSeconds);
      
      return data;
    } catch (err) {
      // Cache error response briefly to prevent retry storms
      const errorResponse = { __cacheError: true, message: String(err) } as unknown as T;
      await setCachedData(db, cacheKey, provider, endpoint, errorResponse, API_CACHE_TTL.ERROR);
      throw err;
    } finally {
      // Clean up in-flight tracking
      inFlightRequests.delete(cacheKey);
    }
  })();
  
  // Track this request as in-flight
  inFlightRequests.set(cacheKey, requestPromise);
  
  const data = await requestPromise;
  return { data, fromCache: false };
}
