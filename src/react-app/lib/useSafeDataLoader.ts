import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LoaderCacheEntry<T> = {
  data: T;
  updatedAt: number;
  usedAt: number;
};

type LoaderCacheEnvelope = LoaderCacheEntry<unknown>;

const LOADER_CACHE_MAX_ENTRIES = 64;
const LOADER_CACHE_TTL_MS = 5 * 60 * 1000;
const loaderCache = new Map<string, LoaderCacheEnvelope>();

function pruneLoaderCache(now = Date.now()): void {
  for (const [key, entry] of loaderCache.entries()) {
    if (now - entry.updatedAt > LOADER_CACHE_TTL_MS) {
      loaderCache.delete(key);
    }
  }
  if (loaderCache.size <= LOADER_CACHE_MAX_ENTRIES) return;
  const ordered = Array.from(loaderCache.entries()).sort((a, b) => a[1].usedAt - b[1].usedAt);
  const overflow = loaderCache.size - LOADER_CACHE_MAX_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    loaderCache.delete(ordered[i][0]);
  }
}

function readCache<T>(key: string): T | null {
  const existing = loaderCache.get(key);
  if (!existing) return null;
  const now = Date.now();
  if (now - existing.updatedAt > LOADER_CACHE_TTL_MS) {
    loaderCache.delete(key);
    return null;
  }
  existing.usedAt = now;
  return existing.data as T;
}

function writeCache<T>(key: string, data: T): void {
  const now = Date.now();
  loaderCache.set(key, {
    data: data as unknown,
    updatedAt: now,
    usedAt: now,
  });
  pruneLoaderCache(now);
}

type FetchContext = {
  signal: AbortSignal;
  attempt: number;
};

type SafeLoaderOptions<T> = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  enabled?: boolean;
  seedData?: T;
};

type SafeLoaderState<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  retryCount: number;
  hasUsableData: boolean;
  refresh: () => Promise<T | null>;
};

async function waitFor(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeAbortSignals(controller: AbortController, timeoutMs: number): () => void {
  if (!(timeoutMs > 0)) return () => {};
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return () => window.clearTimeout(timer);
}

export function useSafeDataLoader<T>(
  key: string,
  fetchFn: (context: FetchContext) => Promise<T>,
  options: SafeLoaderOptions<T> = {}
): SafeLoaderState<T> {
  const {
    timeoutMs = 12_000,
    retries = 2,
    retryDelayMs = 600,
    enabled = true,
    seedData,
  } = options;

  const initialData = useMemo(() => {
    const cached = readCache<T>(key);
    if (cached !== null) return cached;
    if (seedData !== undefined) return seedData;
    return null;
  }, [key, seedData]);

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(initialData === null && enabled);
  const [refreshing, setRefreshing] = useState(initialData !== null && enabled);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const generationRef = useRef(0);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const dataRef = useRef<T | null>(initialData);
  const refreshRef = useRef<() => Promise<T | null>>(async () => null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refresh = useCallback(async (): Promise<T | null> => {
    generationRef.current += 1;
    const generation = generationRef.current;
    inFlightAbortRef.current?.abort();
    const controller = new AbortController();
    inFlightAbortRef.current = controller;

    const hasExisting = dataRef.current !== null;
    setLoading(!hasExisting);
    setRefreshing(hasExisting);
    setError(null);
    setRetryCount(0);

    let lastError: Error | null = null;
    const maxAttempts = Math.max(1, retries + 1);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (controller.signal.aborted) break;
      const clearTimer = mergeAbortSignals(controller, timeoutMs);
      try {
        const result = await fetchFn({ signal: controller.signal, attempt });
        clearTimer();
        if (generation !== generationRef.current || controller.signal.aborted) {
          return dataRef.current;
        }
        setData(result);
        dataRef.current = result;
        writeCache(key, result);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        setRetryCount(attempt - 1);
        return result;
      } catch (err) {
        clearTimer();
        if (generation !== generationRef.current || controller.signal.aborted) {
          return dataRef.current;
        }
        lastError = err instanceof Error ? err : new Error('Request failed');
        setRetryCount(attempt - 1);
        if (attempt < maxAttempts) {
          await waitFor(retryDelayMs * attempt);
        }
      }
    }

    if (generation === generationRef.current) {
      setLoading(false);
      setRefreshing(false);
      if (dataRef.current === null) {
        setError(lastError || new Error('Request failed'));
      }
    }
    return dataRef.current;
  }, [fetchFn, key, retries, retryDelayMs, timeoutMs]);

  refreshRef.current = refresh;

  useEffect(() => {
    const cached = readCache<T>(key);
    if (cached !== null) {
      setData(cached);
      dataRef.current = cached;
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (seedData !== undefined) {
      setData(seedData);
      dataRef.current = seedData;
      writeCache(key, seedData);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setData(null);
    dataRef.current = null;
    setLoading(Boolean(enabled));
    setRefreshing(false);
  }, [enabled, key, seedData]);

  useEffect(() => {
    if (!enabled) return;
    void refreshRef.current();
  }, [enabled, key]);

  useEffect(() => () => {
    inFlightAbortRef.current?.abort();
  }, []);

  return {
    data,
    loading,
    refreshing,
    error,
    retryCount,
    hasUsableData: data !== null,
    refresh,
  };
}

export default useSafeDataLoader;
