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
    return existing as Promise<T>;
  }

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
    const initSignal = init?.signal;
    const signal = (() => {
      if (initSignal && typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).any === "function") {
        return (AbortSignal as any).any([controller.signal, initSignal]);
      }
      return controller.signal;
    })();
    fetchCacheStats.networkFetches += 1;
    try {
      const response = await fetch(url, { ...init, signal });
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
      const name = String((err as any)?.name || "");
      const message = String((err as any)?.message || "");
      const isAbort = name === "AbortError" || message.toLowerCase().includes("aborted");
      if (isAbort) {
        if (cached && cached.value !== undefined) {
          return cached.value as T;
        }
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      if (cached && cached.value !== undefined) {
        return cached.value as T;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      inflightJson.delete(cacheKey);
    }
  })();

  inflightJson.set(cacheKey, request);
  return request;
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
