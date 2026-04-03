type DurationAggregate = {
  count: number;
  totalMs: number;
  maxMs: number;
};

const durationAgg = new Map<string, DurationAggregate>();
const counters = new Map<string, number>();

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export function startPerfTimer(key: string): () => void {
  const startedAt = nowMs();
  return () => {
    const elapsed = Math.max(0, nowMs() - startedAt);
    const current = durationAgg.get(key);
    if (!current) {
      durationAgg.set(key, { count: 1, totalMs: elapsed, maxMs: elapsed });
      return;
    }
    current.count += 1;
    current.totalMs += elapsed;
    current.maxMs = Math.max(current.maxMs, elapsed);
  };
}

export function incrementPerfCounter(key: string, by = 1): void {
  if (!Number.isFinite(by) || by <= 0) return;
  counters.set(key, (counters.get(key) || 0) + by);
}

export function getPerfSnapshot(): {
  durations: Record<string, { count: number; avgMs: number; maxMs: number; totalMs: number }>;
  counters: Record<string, number>;
} {
  const durations: Record<string, { count: number; avgMs: number; maxMs: number; totalMs: number }> = {};
  for (const [key, value] of durationAgg.entries()) {
    durations[key] = {
      count: value.count,
      avgMs: value.count > 0 ? Math.round((value.totalMs / value.count) * 10) / 10 : 0,
      maxMs: Math.round(value.maxMs * 10) / 10,
      totalMs: Math.round(value.totalMs * 10) / 10,
    };
  }

  const counterSnapshot: Record<string, number> = {};
  for (const [key, value] of counters.entries()) {
    counterSnapshot[key] = value;
  }

  return { durations, counters: counterSnapshot };
}

export function resetPerfSnapshot(): void {
  durationAgg.clear();
  counters.clear();
}

export function logPerfSnapshot(scope: string): void {
  console.debug(`[Perf][${scope}]`, getPerfSnapshot());
}
