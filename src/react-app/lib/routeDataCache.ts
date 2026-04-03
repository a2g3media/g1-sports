type RouteCacheEntry<T = unknown> = {
  value: T;
  createdAt: number;
  expiresAt: number;
};

const routeCache = new Map<string, RouteCacheEntry>();

const routeCacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
};

const now = () => Date.now();

export function getRouteCache<T = unknown>(key: string, maxAgeMs = 30000): T | null {
  const entry = routeCache.get(key);
  if (!entry) {
    routeCacheStats.misses += 1;
    return null;
  }
  if (entry.expiresAt <= now()) {
    routeCache.delete(key);
    routeCacheStats.misses += 1;
    routeCacheStats.evictions += 1;
    return null;
  }
  if (maxAgeMs > 0 && now() - entry.createdAt > maxAgeMs) {
    routeCacheStats.misses += 1;
    return null;
  }
  routeCacheStats.hits += 1;
  return entry.value as T;
}

export function setRouteCache<T = unknown>(key: string, value: T, ttlMs = 60000): void {
  if (ttlMs <= 0) return;
  routeCacheStats.sets += 1;
  routeCache.set(key, {
    value,
    createdAt: now(),
    expiresAt: now() + ttlMs,
  });
}

export function clearRouteCache(prefix?: string): void {
  if (!prefix) {
    routeCache.clear();
    return;
  }
  for (const key of Array.from(routeCache.keys())) {
    if (key.startsWith(prefix)) routeCache.delete(key);
  }
}


export function getRouteCacheStats(): Readonly<typeof routeCacheStats> {
  return {
    hits: routeCacheStats.hits,
    misses: routeCacheStats.misses,
    sets: routeCacheStats.sets,
    evictions: routeCacheStats.evictions,
  };
}

export function resetRouteCacheStats(): void {
  routeCacheStats.hits = 0;
  routeCacheStats.misses = 0;
  routeCacheStats.sets = 0;
  routeCacheStats.evictions = 0;
}
