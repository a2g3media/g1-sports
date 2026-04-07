#!/usr/bin/env node
/*
 * Page-data rollout gate checker.
 *
 * Reads /api/page-data/metrics and enforces canary/launch thresholds.
 * Exits non-zero on gate failure.
 *
 * Examples:
 *   node scripts/qa-page-data-gates.mjs --base http://localhost:5173 --profile canary
 *   node scripts/qa-page-data-gates.mjs --base https://g1.example.com --profile launch --cookie "session=..."
 */

const DEFAULT_BASE = "http://localhost:5173";
const DEFAULT_PROFILE = "canary";
const DEFAULT_ROUTES = ["games", "odds", "sport-hub", "game-detail"];

const PROFILES = {
  canary: {
    minRequestsPerRoute: 20,
    maxRouteP50Ms: 1600,
    maxRouteP95Ms: 3200,
    minCombinedHitRatePct: 70,
    maxColdPathPct: 35,
    minOddsAvailabilityPct: 85,
    maxApiCallsP95: 2,
  },
  launch: {
    minRequestsPerRoute: 50,
    maxRouteP50Ms: 1200,
    maxRouteP95Ms: 2500,
    minCombinedHitRatePct: 85,
    maxColdPathPct: 15,
    minOddsAvailabilityPct: 92,
    maxApiCallsP95: 1.5,
  },
};

function parseArg(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function parseNum(flag, fallback) {
  const raw = parseArg(flag, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function toFixed1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
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

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function mainReportLine(ok, label, value, target) {
  const status = ok ? "PASS" : "FAIL";
  return `[page-data-gates] ${status} ${label}: ${value} (target ${target})`;
}

async function main() {
  const base = (parseArg("--base", process.env.QA_BASE || DEFAULT_BASE) || DEFAULT_BASE).replace(/\/+$/, "");
  const profileRaw = (parseArg("--profile", DEFAULT_PROFILE) || DEFAULT_PROFILE).toLowerCase();
  const profile = profileRaw === "launch" ? "launch" : "canary";
  const thresholds = { ...PROFILES[profile] };
  const timeoutMs = Math.max(3000, parseNum("--timeout-ms", 10000));
  const cookie = parseArg("--cookie", process.env.QA_COOKIE || "");
  const bearer = parseArg("--bearer", process.env.QA_BEARER || "");
  const jsonOut = parseArg("--json-out", "").trim();
  const routeListRaw = parseArg("--routes", DEFAULT_ROUTES.join(","));
  const routes = routeListRaw
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const metricsUrl = parseArg("--metrics-url", `${base}/api/page-data/metrics`);

  console.log(
    `[page-data-gates] profile=${profile} metrics=${metricsUrl} routes=${routes.join(",")} timeoutMs=${timeoutMs}`
  );

  const snapshot = await fetchMetrics({ url: metricsUrl, cookie, bearer, timeoutMs });
  const derived = snapshot?.derived || {};
  const routeMetrics = snapshot?.routes || {};

  const combinedHitRate = toFixed1((Number(derived.l1HitRatePct || 0) + Number(derived.l2HitRatePct || 0)));
  const coldPathPct = toFixed1(Number(derived.coldPathPct || 0));

  const failures = [];
  const notes = [];

  {
    const ok = combinedHitRate >= thresholds.minCombinedHitRatePct;
    notes.push(mainReportLine(ok, "combined_hit_rate_pct", combinedHitRate, `>= ${thresholds.minCombinedHitRatePct}`));
    if (!ok) failures.push(`combined_hit_rate_pct ${combinedHitRate} below ${thresholds.minCombinedHitRatePct}`);
  }
  {
    const ok = coldPathPct <= thresholds.maxColdPathPct;
    notes.push(mainReportLine(ok, "cold_path_pct", coldPathPct, `<= ${thresholds.maxColdPathPct}`));
    if (!ok) failures.push(`cold_path_pct ${coldPathPct} above ${thresholds.maxColdPathPct}`);
  }

  for (const route of routes) {
    const m = routeMetrics[route];
    if (!m) {
      failures.push(`route '${route}' missing from metrics snapshot`);
      continue;
    }

    const requests = Number(m.requests || 0);
    const p50 = toFixed1(Number(m?.routeLoadMs?.p50 || 0));
    const p95 = toFixed1(Number(m?.routeLoadMs?.p95 || 0));
    const oddsPct = toFixed1(Number(m?.oddsAvailabilityPct || 0));
    const apiCallsP95 = toFixed1(Number(m?.apiCallsPerRoute?.p95 || 0));

    const reqOk = requests >= thresholds.minRequestsPerRoute;
    notes.push(mainReportLine(reqOk, `${route}.requests`, requests, `>= ${thresholds.minRequestsPerRoute}`));
    if (!reqOk) failures.push(`${route}.requests ${requests} below ${thresholds.minRequestsPerRoute}`);

    const p50Ok = p50 <= thresholds.maxRouteP50Ms;
    notes.push(mainReportLine(p50Ok, `${route}.route_p50_ms`, p50, `<= ${thresholds.maxRouteP50Ms}`));
    if (!p50Ok) failures.push(`${route}.route_p50_ms ${p50} above ${thresholds.maxRouteP50Ms}`);

    const p95Ok = p95 <= thresholds.maxRouteP95Ms;
    notes.push(mainReportLine(p95Ok, `${route}.route_p95_ms`, p95, `<= ${thresholds.maxRouteP95Ms}`));
    if (!p95Ok) failures.push(`${route}.route_p95_ms ${p95} above ${thresholds.maxRouteP95Ms}`);

    const oddsOk = oddsPct >= thresholds.minOddsAvailabilityPct;
    notes.push(mainReportLine(oddsOk, `${route}.odds_availability_pct`, oddsPct, `>= ${thresholds.minOddsAvailabilityPct}`));
    if (!oddsOk) failures.push(`${route}.odds_availability_pct ${oddsPct} below ${thresholds.minOddsAvailabilityPct}`);

    const callsOk = apiCallsP95 <= thresholds.maxApiCallsP95;
    notes.push(mainReportLine(callsOk, `${route}.api_calls_p95`, apiCallsP95, `<= ${thresholds.maxApiCallsP95}`));
    if (!callsOk) failures.push(`${route}.api_calls_p95 ${apiCallsP95} above ${thresholds.maxApiCallsP95}`);
  }

  for (const line of notes) console.log(line);

  const report = {
    ok: failures.length === 0,
    profile,
    base,
    metricsUrl,
    routes,
    thresholds,
    derived: {
      combinedHitRatePct: combinedHitRate,
      coldPathPct,
    },
    notes,
    failures,
    snapshot,
    generatedAt: new Date().toISOString(),
  };

  if (jsonOut) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(jsonOut), { recursive: true });
    await writeFile(jsonOut, JSON.stringify(report, null, 2), "utf8");
  }

  if (failures.length > 0) {
    console.error("\n[page-data-gates] NO-GO");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log("\n[page-data-gates] GO");
}

main().catch((err) => fail([`[page-data-gates] fatal: ${String(err)}`]));

