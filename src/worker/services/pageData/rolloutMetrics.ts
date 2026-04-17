type Histogram = {
  values: number[];
  maxSize: number;
};

type RouteMetrics = {
  routeLoadMs: Histogram;
  apiCallsPerRoute: Histogram;
  requests: number;
  firstRenderOddsAvailable: number;
};

type CounterMap = Record<string, number>;

const HIST_MAX = 400;
const routeMetrics = new Map<string, RouteMetrics>();
const counters: CounterMap = {
  pageDataRequests: 0,
  pageDataL1Hits: 0,
  pageDataL2Hits: 0,
  pageDataColdPath: 0,
  pageDataErrors: 0,
  pageDataPlayerProfileRequests: 0,
  pageDataPlayerProfileColdHits: 0,
  /** User-facing GET /player-profile with no L1/D1 hit (cold build blocked; must prewarm). */
  pageDataPlayerProfileSnapshotMiss: 0,
  pageDataPlayerWarmKnown: 0,
  pageDataPlayerWarmWarmed: 0,
  pageDataPlayerBuildRequests: 0,
  pageDataPlayerBuildClientDirect: 0,
  /** L1/D1 snapshot existed but shouldAcceptPayload returned false (Phase 0 observability). */
  pageDataPlayerProfileSnapshotRejected: 0,
  /** User GET /player-profile (document store read path). */
  pageDataPlayerProfileUserReads: 0,
  pageDataPlayerProfileDocumentHit: 0,
  pageDataPlayerProfileDocumentMiss: 0,
  /** Rows upserted into player_documents (idempotent rebuilds increment). */
  playerDocumentsUpserts: 0,
  /** Last observed COUNT(*) from player_documents (updated on scheduled ingestion). */
  playerDocumentsRowCount: 0,
};

function pushHistogram(hist: Histogram, value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  hist.values.push(value);
  if (hist.values.length > hist.maxSize) hist.values.shift();
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return Math.round(sorted[index] * 10) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

function getRoute(route: string): RouteMetrics {
  const key = String(route || "unknown").trim().toLowerCase() || "unknown";
  const existing = routeMetrics.get(key);
  if (existing) return existing;
  const next: RouteMetrics = {
    routeLoadMs: { values: [], maxSize: HIST_MAX },
    apiCallsPerRoute: { values: [], maxSize: HIST_MAX },
    requests: 0,
    firstRenderOddsAvailable: 0,
  };
  routeMetrics.set(key, next);
  return next;
}

export function incCounter(key: keyof typeof counters, by = 1): void {
  if (!Number.isFinite(by) || by <= 0) return;
  counters[key] += by;
}

export function setCounter(key: keyof typeof counters, value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  counters[key] = Math.round(value);
}

export function recordRouteRenderEvent(event: {
  route: string;
  loadMs: number;
  apiCalls: number;
  oddsAvailableAtFirstRender: boolean;
}): void {
  const bucket = getRoute(event.route);
  bucket.requests += 1;
  pushHistogram(bucket.routeLoadMs, event.loadMs);
  pushHistogram(bucket.apiCallsPerRoute, event.apiCalls);
  if (event.oddsAvailableAtFirstRender) {
    bucket.firstRenderOddsAvailable += 1;
  }
}

export function getRolloutMetricsSnapshot(): {
  counters: CounterMap;
  derived: {
    l1HitRatePct: number;
    l2HitRatePct: number;
    coldPathPct: number;
    warmedPlayerCoveragePct: number;
    coldHitPlayerPagePct: number;
    snapshotMissPct: number;
    avgPlayerPageFirstRenderMs: number;
    snapshotRejectPct: number;
    playerDocumentHitRatePct: number;
    playerDocumentMissRatePct: number;
    /** COUNT(*) player_documents last synced in scheduled job (approximate store size). */
    playerDocumentsStoreRowsApprox: number;
  };
  routes: Record<string, {
    requests: number;
    routeLoadMs: { p50: number; p95: number; avg: number };
    apiCallsPerRoute: { p50: number; p95: number; avg: number };
    oddsAvailabilityPct: number;
  }>;
} {
  const total = counters.pageDataRequests || 0;
  const l1HitRatePct = total > 0 ? Math.round((counters.pageDataL1Hits / total) * 10_000) / 100 : 0;
  const l2HitRatePct = total > 0 ? Math.round((counters.pageDataL2Hits / total) * 10_000) / 100 : 0;
  const coldPathPct = total > 0 ? Math.round((counters.pageDataColdPath / total) * 10_000) / 100 : 0;
  const warmedPlayerCoveragePct =
    counters.pageDataPlayerWarmKnown > 0
      ? Math.round((Math.min(counters.pageDataPlayerWarmWarmed, counters.pageDataPlayerWarmKnown) / counters.pageDataPlayerWarmKnown) * 10_000) / 100
      : 0;
  const coldHitPlayerPagePct =
    counters.pageDataPlayerProfileRequests > 0
      ? Math.round((counters.pageDataPlayerProfileColdHits / counters.pageDataPlayerProfileRequests) * 10_000) / 100
      : 0;
  const snapshotMissPct =
    counters.pageDataPlayerProfileRequests > 0
      ? Math.round((counters.pageDataPlayerProfileSnapshotMiss / counters.pageDataPlayerProfileRequests) * 10_000) / 100
      : 0;
  const snapshotRejectPct =
    counters.pageDataPlayerProfileRequests > 0
      ? Math.round((counters.pageDataPlayerProfileSnapshotRejected / counters.pageDataPlayerProfileRequests) * 10_000) / 100
      : 0;
  const userDocReads = counters.pageDataPlayerProfileUserReads || 0;
  const docHits = counters.pageDataPlayerProfileDocumentHit || 0;
  const docMisses = counters.pageDataPlayerProfileDocumentMiss || 0;
  const playerDocumentHitRatePct =
    userDocReads > 0 ? Math.round((docHits / userDocReads) * 10_000) / 100 : 0;
  const playerDocumentMissRatePct =
    userDocReads > 0 ? Math.round((docMisses / userDocReads) * 10_000) / 100 : 0;
  const playerDocumentsStoreRowsApprox = counters.playerDocumentsRowCount || 0;
  const playerRoute = routeMetrics.get("player-profile");
  const avgPlayerPageFirstRenderMs = playerRoute ? avg(playerRoute.routeLoadMs.values) : 0;

  const routes: Record<string, {
    requests: number;
    routeLoadMs: { p50: number; p95: number; avg: number };
    apiCallsPerRoute: { p50: number; p95: number; avg: number };
    oddsAvailabilityPct: number;
  }> = {};

  for (const [route, metric] of routeMetrics.entries()) {
    routes[route] = {
      requests: metric.requests,
      routeLoadMs: {
        p50: quantile(metric.routeLoadMs.values, 0.5),
        p95: quantile(metric.routeLoadMs.values, 0.95),
        avg: avg(metric.routeLoadMs.values),
      },
      apiCallsPerRoute: {
        p50: quantile(metric.apiCallsPerRoute.values, 0.5),
        p95: quantile(metric.apiCallsPerRoute.values, 0.95),
        avg: avg(metric.apiCallsPerRoute.values),
      },
      oddsAvailabilityPct: metric.requests > 0
        ? Math.round((metric.firstRenderOddsAvailable / metric.requests) * 10_000) / 100
        : 0,
    };
  }

  return {
    counters: { ...counters },
    derived: {
      l1HitRatePct,
      l2HitRatePct,
      coldPathPct,
      warmedPlayerCoveragePct,
      coldHitPlayerPagePct,
      snapshotMissPct,
      avgPlayerPageFirstRenderMs,
      snapshotRejectPct,
      playerDocumentHitRatePct,
      playerDocumentMissRatePct,
      playerDocumentsStoreRowsApprox,
    },
    routes,
  };
}

