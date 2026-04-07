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
      fetchCacheStats.cacheHits += 1;
      return cached.value as T;
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
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as T;
      if (ttlMs > 0) {
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
