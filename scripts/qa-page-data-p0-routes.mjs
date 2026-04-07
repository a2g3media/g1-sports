#!/usr/bin/env node
/*
 * Print focused P0 page-data route metrics.
 *
 * Reads /api/page-data/metrics and outputs:
 * - route requests
 * - load p50 / p95 / avg
 * - apiCalls p95
 * - odds availability pct
 *
 * Example:
 *   node scripts/qa-page-data-p0-routes.mjs --base http://localhost:5173 --cookie "session=..."
 */

const DEFAULT_BASE = "http://localhost:5173";
const DEFAULT_ROUTES = [
  "team-profile",
  "player-profile",
  "universal-player",
  "league-overview",
  "league-gameday",
  "league-picks",
];
const DEFAULT_STRICT_THRESHOLDS = {
  minRequestsPerRoute: 10,
  maxRouteP50Ms: 1500,
  maxRouteP95Ms: 3000,
  maxApiCallsP95: 2,
  minCombinedHitRatePct: 60,
  maxColdPathPct: 45,
};

function parseArg(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function round1(n) {
  return Math.round(toNum(n) * 10) / 10;
}

async function fetchMetrics({ url, cookie, bearer, timeoutMs }) {
  const headers = { accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${JSON.stringify(json || {})}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function printRouteLine(route, m) {
  const requests = toNum(m?.requests);
  const p50 = round1(m?.routeLoadMs?.p50);
  const p95 = round1(m?.routeLoadMs?.p95);
  const avg = round1(m?.routeLoadMs?.avg);
  const callsP95 = round1(m?.apiCallsPerRoute?.p95);
  const oddsPct = round1(m?.oddsAvailabilityPct);
  console.log(
    `[p0-metrics] route=${route} requests=${requests} p50=${p50}ms p95=${p95}ms avg=${avg}ms apiCallsP95=${callsP95} oddsAvail=${oddsPct}%`
  );
}

async function main() {
  const base = (parseArg("--base", process.env.QA_BASE || DEFAULT_BASE) || DEFAULT_BASE).replace(/\/+$/, "");
  const cookie = parseArg("--cookie", process.env.QA_COOKIE || "");
  const bearer = parseArg("--bearer", process.env.QA_BEARER || "");
  const timeoutMs = Math.max(3000, toNum(parseArg("--timeout-ms", "10000")));
  const metricsUrl = parseArg("--metrics-url", `${base}/api/page-data/metrics`);
  const routeListRaw = parseArg("--routes", DEFAULT_ROUTES.join(","));
  const jsonOut = parseArg("--json-out", "").trim();
  const routes = routeListRaw
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const strict = hasFlag("--strict");
  const thresholds = {
    minRequestsPerRoute: Math.max(0, toNum(parseArg("--min-requests", String(DEFAULT_STRICT_THRESHOLDS.minRequestsPerRoute)))),
    maxRouteP50Ms: Math.max(0, toNum(parseArg("--max-p50-ms", String(DEFAULT_STRICT_THRESHOLDS.maxRouteP50Ms)))),
    maxRouteP95Ms: Math.max(0, toNum(parseArg("--max-p95-ms", String(DEFAULT_STRICT_THRESHOLDS.maxRouteP95Ms)))),
    maxApiCallsP95: Math.max(0, toNum(parseArg("--max-api-calls-p95", String(DEFAULT_STRICT_THRESHOLDS.maxApiCallsP95)))),
    minCombinedHitRatePct: Math.max(0, toNum(parseArg("--min-combined-hit-rate", String(DEFAULT_STRICT_THRESHOLDS.minCombinedHitRatePct)))),
    maxColdPathPct: Math.max(0, toNum(parseArg("--max-cold-path-pct", String(DEFAULT_STRICT_THRESHOLDS.maxColdPathPct)))),
  };

  console.log(
    `[p0-metrics] base=${base} metrics=${metricsUrl} routes=${routes.join(",")} strict=${strict ? "on" : "off"}`
  );
  const snapshot = await fetchMetrics({ url: metricsUrl, cookie, bearer, timeoutMs });
  const routeMetrics = snapshot?.routes || {};

  const missing = [];
  const failures = [];
  const routeSummaries = {};
  for (const route of routes) {
    const m = routeMetrics[route];
    if (!m) {
      missing.push(route);
      if (strict) failures.push(`missing route bucket: ${route}`);
      continue;
    }
    printRouteLine(route, m);
    routeSummaries[route] = {
      requests: toNum(m?.requests),
      p50Ms: round1(m?.routeLoadMs?.p50),
      p95Ms: round1(m?.routeLoadMs?.p95),
      avgMs: round1(m?.routeLoadMs?.avg),
      apiCallsP95: round1(m?.apiCallsPerRoute?.p95),
      oddsAvailabilityPct: round1(m?.oddsAvailabilityPct),
    };
    if (strict) {
      const requests = routeSummaries[route].requests;
      const p50 = routeSummaries[route].p50Ms;
      const p95 = routeSummaries[route].p95Ms;
      const callsP95 = routeSummaries[route].apiCallsP95;
      if (requests < thresholds.minRequestsPerRoute) {
        failures.push(`${route}.requests ${requests} below ${thresholds.minRequestsPerRoute}`);
      }
      if (p50 > thresholds.maxRouteP50Ms) {
        failures.push(`${route}.p50 ${p50}ms above ${thresholds.maxRouteP50Ms}ms`);
      }
      if (p95 > thresholds.maxRouteP95Ms) {
        failures.push(`${route}.p95 ${p95}ms above ${thresholds.maxRouteP95Ms}ms`);
      }
      if (callsP95 > thresholds.maxApiCallsP95) {
        failures.push(`${route}.apiCallsP95 ${callsP95} above ${thresholds.maxApiCallsP95}`);
      }
    }
  }

  const derived = snapshot?.derived || {};
  const combinedHitRate = round1(toNum(derived.l1HitRatePct) + toNum(derived.l2HitRatePct));
  const coldPathPct = round1(derived.coldPathPct);
  console.log(
    `[p0-metrics] global combinedHitRate=${combinedHitRate}% coldPath=${coldPathPct}%`
  );
  if (strict) {
    if (combinedHitRate < thresholds.minCombinedHitRatePct) {
      failures.push(`global.combinedHitRate ${combinedHitRate}% below ${thresholds.minCombinedHitRatePct}%`);
    }
    if (coldPathPct > thresholds.maxColdPathPct) {
      failures.push(`global.coldPath ${coldPathPct}% above ${thresholds.maxColdPathPct}%`);
    }
  }

  if (missing.length > 0) {
    console.log(`[p0-metrics] missing route buckets: ${missing.join(", ")}`);
  }
  if (strict) {
    console.log(
      `[p0-metrics] strict thresholds: minRequests=${thresholds.minRequestsPerRoute} maxP50=${thresholds.maxRouteP50Ms}ms maxP95=${thresholds.maxRouteP95Ms}ms maxApiCallsP95=${thresholds.maxApiCallsP95} minCombinedHit=${thresholds.minCombinedHitRatePct}% maxColdPath=${thresholds.maxColdPathPct}%`
    );
    if (failures.length > 0) {
      console.error("[p0-metrics] STRICT NO-GO");
      for (const line of failures) console.error(`- ${line}`);
      if (jsonOut) {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        const report = {
          ok: false,
          strict: true,
          base,
          metricsUrl,
          routes,
          thresholds,
          routeSummaries,
          derived: { combinedHitRatePct: combinedHitRate, coldPathPct },
          missing,
          failures,
          generatedAt: new Date().toISOString(),
        };
        await mkdir(dirname(jsonOut), { recursive: true });
        await writeFile(jsonOut, JSON.stringify(report, null, 2), "utf8");
      }
      process.exit(1);
    }
    console.log("[p0-metrics] STRICT GO");
  }

  if (jsonOut) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const report = {
      ok: failures.length === 0,
      strict,
      base,
      metricsUrl,
      routes,
      thresholds,
      routeSummaries,
      derived: { combinedHitRatePct: combinedHitRate, coldPathPct },
      missing,
      failures,
      generatedAt: new Date().toISOString(),
    };
    await mkdir(dirname(jsonOut), { recursive: true });
    await writeFile(jsonOut, JSON.stringify(report, null, 2), "utf8");
  }
}

main().catch((err) => {
  console.error(`[p0-metrics] fatal: ${String(err)}`);
  process.exit(1);
});

