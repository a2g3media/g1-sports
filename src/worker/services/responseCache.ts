/**
 * Response Cache Service
 * 
 * Centralized caching layer for API responses with:
 * - Smart TTL based on data freshness (live vs final)
 * - HTTP cache headers for CDN/browser caching
 * - In-memory cache with automatic invalidation
 * - Cache key generation utilities
 */

// Cache entry with TTL tracking
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
  etag?: string;
}

// Generic response cache
const responseCache = new Map<string, CacheEntry<unknown>>();

// TTL presets (milliseconds)
export const CACHE_TTL = {
  // Game data
  LIVE_GAME: 15 * 1000,           // 15 seconds - active games need frequent updates
  SCHEDULED_GAME: 5 * 60 * 1000,  // 5 minutes - upcoming games rarely change
  FINAL_GAME: 60 * 60 * 1000,     // 1 hour - completed games don't change
  
  // Odds data
  LIVE_ODDS: 15 * 1000,           // 15 seconds - live odds are volatile
  PREGAME_ODDS: 2 * 60 * 1000,    // 2 minutes - pregame odds update regularly
  FINAL_ODDS: 24 * 60 * 60 * 1000, // 24 hours - closed markets don't change
  
  // User data
  SUBSCRIPTION: 5 * 60 * 1000,    // 5 minutes - subscription status rarely changes
  PREFERENCES: 10 * 60 * 1000,    // 10 minutes - user preferences
  
  // Static-ish data
  TEAM_LIST: 60 * 60 * 1000,      // 1 hour - teams don't change often
  SPORT_LIST: 24 * 60 * 60 * 1000, // 24 hours - sports are static
  
  // Short-lived
  AI_RESPONSE: 0,                  // Never cache AI responses (non-deterministic)
  REAL_TIME: 5 * 1000,            // 5 seconds - for dashboards with auto-refresh
} as const;

// =====================================================
// CACHE OPERATIONS
// =====================================================

/**
 * Generate cache key from components
 */
export function cacheKey(...parts: (string | number | undefined | null)[]): string {
  return parts.filter(Boolean).join(':');
}

/**
 * Get cached value if valid
 */
export function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  
  if (Date.now() - entry.cachedAt > entry.ttlMs) {
    responseCache.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Set cached value with TTL
 */
export function setCached<T>(key: string, data: T, ttlMs: number): void {
  const etag = generateEtag(data);
  responseCache.set(key, {
    data,
    cachedAt: Date.now(),
    ttlMs,
    etag,
  });
}

/**
 * Invalidate cache by key or prefix
 */
export function invalidateCache(keyOrPrefix: string): number {
  let count = 0;
  
  // Exact match
  if (responseCache.has(keyOrPrefix)) {
    responseCache.delete(keyOrPrefix);
    count++;
  }
  
  // Prefix match (for invalidating related keys)
  for (const key of responseCache.keys()) {
    if (key.startsWith(keyOrPrefix + ':')) {
      responseCache.delete(key);
      count++;
    }
  }
  
  return count;
}

/**
 * Clear all cached data
 */
export function clearAllCache(): void {
  responseCache.clear();
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): {
  size: number;
  entries: { key: string; ageMs: number; ttlMs: number; valid: boolean }[];
} {
  const entries: { key: string; ageMs: number; ttlMs: number; valid: boolean }[] = [];
  const now = Date.now();
  
  for (const [key, entry] of responseCache.entries()) {
    const age = now - entry.cachedAt;
    entries.push({
      key,
      ageMs: age,
      ttlMs: entry.ttlMs,
      valid: age < entry.ttlMs,
    });
  }
  
  return {
    size: responseCache.size,
    entries,
  };
}

// =====================================================
// HTTP CACHE HEADERS
// =====================================================

/**
 * Generate HTTP cache headers based on content type
 */
export function cacheHeaders(ttlMs: number, options: {
  isPublic?: boolean;
  staleWhileRevalidate?: number;
  etag?: string;
} = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  const ttlSeconds = Math.floor(ttlMs / 1000);
  
  if (ttlMs === 0) {
    // No caching
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
    headers['Pragma'] = 'no-cache';
  } else {
    const directives: string[] = [];
    
    // Public vs private (affects CDN caching)
    directives.push(options.isPublic ? 'public' : 'private');
    
    // Max age
    directives.push(`max-age=${ttlSeconds}`);
    
    // Stale-while-revalidate for better UX
    if (options.staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }
    
    headers['Cache-Control'] = directives.join(', ');
  }
  
  // ETag for conditional requests
  if (options.etag) {
    headers['ETag'] = `"${options.etag}"`;
  }
  
  return headers;
}

/**
 * Generate cache headers for live game data
 */
export function liveGameHeaders(): Record<string, string> {
  return cacheHeaders(CACHE_TTL.LIVE_GAME, {
    isPublic: false,
    staleWhileRevalidate: 5,
  });
}

/**
 * Generate cache headers for scheduled game data
 */
export function scheduledGameHeaders(): Record<string, string> {
  return cacheHeaders(CACHE_TTL.SCHEDULED_GAME, {
    isPublic: true,
    staleWhileRevalidate: 60,
  });
}

/**
 * Generate cache headers for final game data
 */
export function finalGameHeaders(): Record<string, string> {
  return cacheHeaders(CACHE_TTL.FINAL_GAME, {
    isPublic: true,
    staleWhileRevalidate: 300,
  });
}

/**
 * Generate cache headers for odds data
 */
export function oddsHeaders(isLive: boolean): Record<string, string> {
  if (isLive) {
    return cacheHeaders(CACHE_TTL.LIVE_ODDS, {
      isPublic: false,
      staleWhileRevalidate: 5,
    });
  }
  return cacheHeaders(CACHE_TTL.PREGAME_ODDS, {
    isPublic: true,
    staleWhileRevalidate: 30,
  });
}

/**
 * Generate cache headers for user-specific data
 */
export function userDataHeaders(): Record<string, string> {
  return cacheHeaders(CACHE_TTL.PREFERENCES, {
    isPublic: false, // Never cache user data publicly
  });
}

// =====================================================
// CONDITIONAL REQUEST HANDLING
// =====================================================

/**
 * Generate ETag from data
 */
export function generateEtag(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if request can use cached response (304 Not Modified)
 */
export function checkConditionalRequest(
  requestHeaders: Headers,
  etag: string
): boolean {
  const ifNoneMatch = requestHeaders.get('If-None-Match');
  if (ifNoneMatch) {
    // Remove quotes if present
    const clientEtag = ifNoneMatch.replace(/"/g, '');
    return clientEtag === etag;
  }
  return false;
}

// =====================================================
// SMART CACHE TTL DETERMINATION
// =====================================================

export type GameStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL' | 'POSTPONED' | 'CANCELED';

/**
 * Determine optimal TTL based on game status
 */
export function getTTLForGameStatus(status: GameStatus): number {
  switch (status) {
    case 'IN_PROGRESS':
      return CACHE_TTL.LIVE_GAME;
    case 'SCHEDULED':
      return CACHE_TTL.SCHEDULED_GAME;
    case 'FINAL':
    case 'POSTPONED':
    case 'CANCELED':
      return CACHE_TTL.FINAL_GAME;
    default:
      return CACHE_TTL.SCHEDULED_GAME;
  }
}

/**
 * Determine TTL for a list of games (use shortest TTL if any are live)
 */
export function getTTLForGamesList(statuses: GameStatus[]): number {
  const hasLive = statuses.includes('IN_PROGRESS');
  if (hasLive) return CACHE_TTL.LIVE_GAME;
  
  const allFinal = statuses.every(s => 
    s === 'FINAL' || s === 'POSTPONED' || s === 'CANCELED'
  );
  if (allFinal) return CACHE_TTL.FINAL_GAME;
  
  return CACHE_TTL.SCHEDULED_GAME;
}

// =====================================================
// CACHE WARMING / PRELOADING
// =====================================================

/**
 * Preload cache entries (call on worker startup or scheduled)
 */
export async function warmCache(
  loaders: Array<{ key: string; loader: () => Promise<unknown>; ttlMs: number }>
): Promise<{ loaded: number; failed: number }> {
  let loaded = 0;
  let failed = 0;
  
  for (const { key, loader, ttlMs } of loaders) {
    try {
      const data = await loader();
      setCached(key, data, ttlMs);
      loaded++;
    } catch (e) {
      console.error(`Cache warm failed for ${key}:`, e);
      failed++;
    }
  }
  
  return { loaded, failed };
}

// =====================================================
// CACHE MIDDLEWARE HELPERS
// =====================================================

/**
 * Create a cached API handler wrapper
 */
export function withCache<T>(
  keyFn: (req: Request) => string,
  ttlMs: number,
  handler: () => Promise<T>
): () => Promise<{ data: T; fromCache: boolean; headers: Record<string, string> }> {
  return async () => {
    const key = keyFn(new Request('http://localhost'));
    
    // Check cache first
    const cached = getCached<T>(key);
    if (cached !== null) {
      const etag = generateEtag(cached);
      return {
        data: cached,
        fromCache: true,
        headers: cacheHeaders(ttlMs, { etag }),
      };
    }
    
    // Execute handler
    const data = await handler();
    
    // Cache result
    setCached(key, data, ttlMs);
    
    const etag = generateEtag(data);
    return {
      data,
      fromCache: false,
      headers: cacheHeaders(ttlMs, { etag }),
    };
  };
}
