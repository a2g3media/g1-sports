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

async function fetchJsonWithTimeout({ url, method = "GET", headers = {}, body, timeoutMs = 10000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function runWatchboardSmoke({
  base,
  userId,
  gameId,
  timeoutMs,
  maxCreateMs,
  strict,
  failures,
}) {
  const names = [
    `QA Smoke Board A ${Date.now()}`,
    `QA Smoke Board B ${Date.now() + 1}`,
  ];
  const createdIds = [];
  const createdLatencies = [];
  const commonHeaders = {
    accept: "application/json",
    "content-type": "application/json",
    "x-user-id": userId,
  };

  try {
    for (let i = 0; i < names.length; i += 1) {
      const started = Date.now();
      const createRes = await fetchJsonWithTimeout({
        url: `${base}/api/watchboards/create-with-game`,
        method: "POST",
        headers: commonHeaders,
        body: {
          name: names[i],
          game_id: gameId,
          added_from: "qa-watchboard-smoke",
          client_mutation_id: `qa-smoke-${Date.now()}-${i}`,
        },
        timeoutMs,
      });
      const elapsed = Date.now() - started;
      createdLatencies.push(elapsed);
      const boardId = Number(createRes?.json?.boardId || createRes?.json?.board?.id || 0) || null;
      const ok = Boolean(createRes.ok && createRes?.json?.success && boardId);
      console.log(`[p0-metrics][watchboard-smoke] create_${i + 1} ok=${ok} status=${createRes.status} latencyMs=${elapsed} boardId=${boardId || "n/a"}`);
      if (!ok) {
        failures.push(`watchboard-smoke.create_${i + 1} failed status=${createRes.status}`);
        return;
      }
      createdIds.push(boardId);
      if (strict && elapsed > maxCreateMs) {
        failures.push(`watchboard-smoke.create_${i + 1} latency ${elapsed}ms above ${maxCreateMs}ms`);
      }
    }

    const previewRes = await fetchJsonWithTimeout({
      url: `${base}/api/watchboards/home-preview?fast=1`,
      method: "GET",
      headers: { accept: "application/json", "x-user-id": userId },
      timeoutMs,
    });
    const boards = Array.isArray(previewRes?.json?.boards) ? previewRes.json.boards : [];
    const namesLower = new Set(boards.map((b) => String(b?.name || "").trim().toLowerCase()));
    const foundAll = names.every((name) => namesLower.has(name.trim().toLowerCase()));
    console.log(`[p0-metrics][watchboard-smoke] verify boardsFound=${foundAll} totalBoards=${boards.length}`);
    if (!foundAll) {
      failures.push("watchboard-smoke verification failed: newly created boards missing from home-preview");
    }
  } finally {
    for (const boardId of createdIds) {
      await fetchJsonWithTimeout({
        url: `${base}/api/watchboards/${boardId}`,
        method: "DELETE",
        headers: { accept: "application/json", "x-user-id": userId },
        timeoutMs,
      }).catch(() => {});
    }
  }
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
  const watchboardSmoke = hasFlag("--watchboard-smoke");
  const watchboardUserId = parseArg("--watchboard-user-id", process.env.QA_WATCHBOARD_USER_ID || "demo-user-001");
  const watchboardGameId = parseArg("--watchboard-game-id", process.env.QA_WATCHBOARD_GAME_ID || "sr_nba_ff04675a-96e4-41eb-9fec-7d0bfd20057e");
  const maxWatchboardCreateMs = Math.max(500, toNum(parseArg("--max-watchboard-create-ms", "8000")));
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
  let snapshot = null;
  try {
    snapshot = await fetchMetrics({ url: metricsUrl, cookie, bearer, timeoutMs });
  } catch (error) {
    const message = String(error);
    console.warn(`[p0-metrics] metrics fetch failed: ${message}`);
    if (!watchboardSmoke || strict) {
      throw error;
    }
  }
  const routeMetrics = snapshot?.routes || {};

  const missing = [];
  const failures = [];
  const routeSummaries = {};
  for (const route of routes) {
    if (!snapshot) break;
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
  if (snapshot) {
    console.log(
      `[p0-metrics] global combinedHitRate=${combinedHitRate}% coldPath=${coldPathPct}%`
    );
  }
  if (strict && snapshot) {
    if (combinedHitRate < thresholds.minCombinedHitRatePct) {
      failures.push(`global.combinedHitRate ${combinedHitRate}% below ${thresholds.minCombinedHitRatePct}%`);
    }
    if (coldPathPct > thresholds.maxColdPathPct) {
      failures.push(`global.coldPath ${coldPathPct}% above ${thresholds.maxColdPathPct}%`);
    }
  }

  if (watchboardSmoke) {
    await runWatchboardSmoke({
      base,
      userId: watchboardUserId,
      gameId: watchboardGameId,
      timeoutMs,
      maxCreateMs: maxWatchboardCreateMs,
      strict,
      failures,
    });
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

