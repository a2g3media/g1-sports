#!/usr/bin/env node
/*
 * Compare P0 strict reports and classify per-route trends.
 *
 * Inputs are JSON files emitted by qa-page-data-p0-routes.mjs --json-out.
 *
 * Example:
 *   node scripts/qa-page-data-p0-trends.mjs \
 *     --current .tmp/page-data-p0-strict.json \
 *     --baseline .tmp/baseline/page-data-p0-strict.json \
 *     --fail-on-regression false
 */

function parseArg(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(n) {
  return Math.round(toNum(n) * 10) / 10;
}

function pctDelta(curr, base) {
  const c = toNum(curr);
  const b = toNum(base);
  if (b === 0) return c === 0 ? 0 : 100;
  return ((c - b) / Math.abs(b)) * 100;
}

function classifyRoute(current, baseline, tolerances) {
  const reasons = [];
  let score = 0;

  const p50Delta = pctDelta(current.p50Ms, baseline.p50Ms);
  const p95Delta = pctDelta(current.p95Ms, baseline.p95Ms);
  const callsDelta = pctDelta(current.apiCallsP95, baseline.apiCallsP95);
  const oddsDelta = pctDelta(current.oddsAvailabilityPct, baseline.oddsAvailabilityPct);

  // Lower is better for p50/p95/apiCalls.
  if (p95Delta >= tolerances.regressPct) {
    reasons.push(`p95_regressed_${round1(p95Delta)}%`);
    score -= 2;
  } else if (p95Delta <= -tolerances.improvePct) {
    reasons.push(`p95_improved_${round1(Math.abs(p95Delta))}%`);
    score += 2;
  }

  if (p50Delta >= tolerances.regressPct) {
    reasons.push(`p50_regressed_${round1(p50Delta)}%`);
    score -= 1;
  } else if (p50Delta <= -tolerances.improvePct) {
    reasons.push(`p50_improved_${round1(Math.abs(p50Delta))}%`);
    score += 1;
  }

  if (callsDelta >= tolerances.regressPct) {
    reasons.push(`api_calls_regressed_${round1(callsDelta)}%`);
    score -= 1;
  } else if (callsDelta <= -tolerances.improvePct) {
    reasons.push(`api_calls_improved_${round1(Math.abs(callsDelta))}%`);
    score += 1;
  }

  // Higher is better for odds availability.
  if (oddsDelta <= -tolerances.regressPct) {
    reasons.push(`odds_availability_regressed_${round1(Math.abs(oddsDelta))}%`);
    score -= 1;
  } else if (oddsDelta >= tolerances.improvePct) {
    reasons.push(`odds_availability_improved_${round1(oddsDelta)}%`);
    score += 1;
  }

  const status = score < 0 ? "regressed" : score > 0 ? "improved" : "same";
  return { status, reasons, deltas: { p50Delta, p95Delta, callsDelta, oddsDelta } };
}

async function readJson(path) {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const currentPath = parseArg("--current", "").trim();
  const baselinePath = parseArg("--baseline", "").trim();
  if (!currentPath || !baselinePath) {
    throw new Error("Both --current and --baseline are required");
  }
  const failOnRegression = ["1", "true", "yes", "on"].includes(
    String(parseArg("--fail-on-regression", "false")).toLowerCase()
  );

  const tolerances = {
    regressPct: Math.max(1, toNum(parseArg("--regress-pct", "10"))),
    improvePct: Math.max(1, toNum(parseArg("--improve-pct", "10"))),
  };

  const current = await readJson(currentPath);
  const baseline = await readJson(baselinePath);

  const currentRoutes = current?.routeSummaries || {};
  const baselineRoutes = baseline?.routeSummaries || {};
  const routeNames = Array.from(new Set([...Object.keys(currentRoutes), ...Object.keys(baselineRoutes)])).sort();

  const improved = [];
  const regressed = [];
  const same = [];
  const missingBaseline = [];
  const missingCurrent = [];

  for (const route of routeNames) {
    const c = currentRoutes[route];
    const b = baselineRoutes[route];
    if (!b && c) {
      missingBaseline.push(route);
      continue;
    }
    if (b && !c) {
      missingCurrent.push(route);
      regressed.push({ route, reasons: ["route_missing_in_current"] });
      continue;
    }
    const result = classifyRoute(c, b, tolerances);
    if (result.status === "improved") improved.push({ route, ...result });
    else if (result.status === "regressed") regressed.push({ route, ...result });
    else same.push({ route, ...result });
  }

  console.log("[p0-trends] summary");
  console.log(`[p0-trends] improved=${improved.length} regressed=${regressed.length} same=${same.length}`);
  if (missingBaseline.length) console.log(`[p0-trends] baseline_missing_routes=${missingBaseline.join(",")}`);
  if (missingCurrent.length) console.log(`[p0-trends] current_missing_routes=${missingCurrent.join(",")}`);

  for (const row of improved) {
    console.log(`[p0-trends] improved ${row.route} reasons=${row.reasons.join("|") || "none"}`);
  }
  for (const row of regressed) {
    console.log(`[p0-trends] regressed ${row.route} reasons=${row.reasons.join("|") || "none"}`);
  }
  for (const row of same) {
    console.log(`[p0-trends] same ${row.route}`);
  }

  const report = {
    ok: regressed.length === 0,
    failOnRegression,
    tolerances,
    summary: {
      improved: improved.length,
      regressed: regressed.length,
      same: same.length,
      missingBaseline: missingBaseline.length,
      missingCurrent: missingCurrent.length,
    },
    improved,
    regressed,
    same,
    missingBaseline,
    missingCurrent,
    generatedAt: new Date().toISOString(),
  };

  const out = parseArg("--json-out", "").trim();
  if (out) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2), "utf8");
  }

  if (failOnRegression && regressed.length > 0) {
    console.error("[p0-trends] NO-GO: regressions detected");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[p0-trends] fatal: ${String(err)}`);
  process.exit(1);
});

