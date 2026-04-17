type JsonCacheEntry = {
  expiresAt: number;
  value: unknown;
};

type JsonFetchOptions = {
  cacheKey?: string;
  ttlMs?: number;
  timeoutMs?: number;
  bypassCache?: boolean;
  init?: RequestInit;
};

const jsonCache = new Map<string, JsonCacheEntry>();
const inflightJson = new Map<string, Promise<unknown>>();

const fetchCacheStats = {
  requests: 0,
  networkFetches: 0,
  cacheHits: 0,
  inflightHits: 0,
  errors: 0,
};

const now = () => Date.now();

function isDegradedPayload(value: unknown): boolean {
  if (
    value
    && typeof value === "object"
    && Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, "pending_refresh")
    && (value as { pending_refresh?: unknown }).pending_refresh === true
  ) {
    return true;
  }
  if (
    !value
    || typeof value !== "object"
    || !Object.prototype.hasOwnProperty.call(value as Record<string, unknown>, "degraded")
    || (value as { degraded?: unknown }).degraded !== true
  ) {
    return false;
  }
  // Only treat degraded player-profile payloads as hard failures.
  // Games/team/sport-hub degraded payloads can still be usable and should render.
  const route = String((value as { route?: unknown }).route || "").trim().toLowerCase();
  if (route && route !== "player-profile") {
    return false;
  }
  return route === "player-profile";
}

export async function fetchJsonCached<T = unknown>(url: string, options: JsonFetchOptions = {}): Promise<T> {
  fetchCacheStats.requests += 1;

  const {
    cacheKey = url,
    ttlMs = 4000,
    timeoutMs = 12000,
    bypassCache = false,
    init,
  } = options;

  const withTimeout = async (promise: Promise<T>): Promise<T> => {
    if (!(timeoutMs > 0)) return promise;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };

  const cached = jsonCache.get(cacheKey);
  if (!bypassCache && ttlMs > 0) {
    if (cached && cached.expiresAt > now()) {
      if (isDegradedPayload(cached.value)) {
        jsonCache.delete(cacheKey);
      } else {
      fetchCacheStats.cacheHits += 1;
      return cached.value as T;
      }
    }
  }

  const existing = inflightJson.get(cacheKey);
  if (existing) {
    fetchCacheStats.inflightHits += 1;
    try {
      return await withTimeout(existing as Promise<T>);
    } catch (err) {
      const message = String((err as any)?.message || "");
      const isTimeout = message.includes("Request timeout after");
      if (isTimeout && cached && cached.value !== undefined) {
        return cached.value as T;
      }
      throw err;
    }
  }

  const request = (async () => {
    fetchCacheStats.networkFetches += 1;
    try {
      const response = await fetch(url, { ...init });
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`) as Error & {
          status?: number;
          responseBody?: unknown;
        };
        err.status = response.status;
        err.responseBody = await response.json().catch(() => null);
        throw err;
      }
      const payload = (await response.json()) as T;
      if (ttlMs > 0 && !isDegradedPayload(payload)) {
        jsonCache.set(cacheKey, { value: payload, expiresAt: now() + ttlMs });
      }
      return payload;
    } catch (err) {
      fetchCacheStats.errors += 1;
      if (cached && cached.value !== undefined) {
        return cached.value as T;
      }
      throw err;
    } finally {
      inflightJson.delete(cacheKey);
    }
  })();

  inflightJson.set(cacheKey, request);

  try {
    return await withTimeout(request as Promise<T>);
  } catch (err) {
    const message = String((err as any)?.message || "");
    const isTimeout = message.includes("Request timeout after");
    if (isTimeout && cached && cached.value !== undefined) {
      return cached.value as T;
    }
    throw err;
  }
}

export function invalidateJsonCache(prefix?: string): void {
  if (!prefix) {
    jsonCache.clear();
    return;
  }
  for (const key of Array.from(jsonCache.keys())) {
    if (key.startsWith(prefix)) {
      jsonCache.delete(key);
    }
  }
}


export function getFetchCacheStats(): Readonly<typeof fetchCacheStats> {
  return {
    requests: fetchCacheStats.requests,
    networkFetches: fetchCacheStats.networkFetches,
    cacheHits: fetchCacheStats.cacheHits,
    inflightHits: fetchCacheStats.inflightHits,
    errors: fetchCacheStats.errors,
  };
}

export function resetFetchCacheStats(): void {
  fetchCacheStats.requests = 0;
  fetchCacheStats.networkFetches = 0;
  fetchCacheStats.cacheHits = 0;
  fetchCacheStats.inflightHits = 0;
  fetchCacheStats.errors = 0;
}
