export type FreshnessClass = "static" | "slow" | "medium" | "live" | "finalizing";

export type FreshnessPolicy = {
  cacheTtlMs: number;
  staleWindowMs: number;
  allowRequestTriggeredRefresh: boolean;
  routeMayServeStaleImmediately: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const POLICIES: Record<FreshnessClass, FreshnessPolicy> = {
  static: {
    cacheTtlMs: 6 * HOUR,
    staleWindowMs: 24 * HOUR,
    allowRequestTriggeredRefresh: false,
    routeMayServeStaleImmediately: true,
  },
  slow: {
    cacheTtlMs: 45 * MINUTE,
    staleWindowMs: 8 * HOUR,
    allowRequestTriggeredRefresh: true,
    routeMayServeStaleImmediately: true,
  },
  medium: {
    cacheTtlMs: 5 * MINUTE,
    staleWindowMs: 90 * MINUTE,
    allowRequestTriggeredRefresh: true,
    routeMayServeStaleImmediately: true,
  },
  live: {
    cacheTtlMs: 10_000,
    staleWindowMs: 120_000,
    allowRequestTriggeredRefresh: true,
    routeMayServeStaleImmediately: true,
  },
  finalizing: {
    cacheTtlMs: 60_000,
    staleWindowMs: 30 * MINUTE,
    allowRequestTriggeredRefresh: true,
    routeMayServeStaleImmediately: true,
  },
};

export function getFreshnessPolicy(freshnessClass: FreshnessClass): FreshnessPolicy {
  return POLICIES[freshnessClass];
}

