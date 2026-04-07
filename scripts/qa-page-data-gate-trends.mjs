#!/usr/bin/env node
/*
 * Compare page-data gate reports and surface regressions.
 *
 * Usage:
 *   node scripts/qa-page-data-gate-trends.mjs \
 *     --current .tmp/page-data-gates.json \
 *     --baseline .tmp/page-data-gates-baseline.json \
 *     --fail-on-regression false
 */

import { readFile } from "node:fs/promises";

function parseArg(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function parseBoolArg(flag, fallback = false) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const raw = String(process.argv[idx + 1] || "").trim().toLowerCase();
  if (!raw) return true;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDelta(delta, unit = "") {
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}${unit}`;
}

async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const currentPath = parseArg("--current", ".tmp/page-data-gates.json");
  const baselinePath = parseArg("--baseline", ".tmp/page-data-gates-baseline.json");
  const failOnRegression = parseBoolArg("--fail-on-regression", false);

  const current = await readJson(currentPath);
  const baseline = await readJson(baselinePath);

  const regressions = [];
  const lines = [];

  const checks = [
    {
      key: "combinedHitRatePct",
      label: "combined_hit_rate_pct",
      curr: toNum(current?.derived?.combinedHitRatePct),
      base: toNum(baseline?.derived?.combinedHitRatePct),
      // lower is regression
      isRegression: (delta) => delta <= -3,
      better: "up",
      unit: "pp",
    },
    {
      key: "coldPathPct",
      label: "cold_path_pct",
      curr: toNum(current?.derived?.coldPathPct),
      base: toNum(baseline?.derived?.coldPathPct),
      // higher is regression
      isRegression: (delta) => delta >= 3,
      better: "down",
      unit: "pp",
    },
  ];

  for (const c of checks) {
    const delta = c.curr - c.base;
    const reg = c.isRegression(delta);
    const status = reg ? "REGRESSION" : "OK";
    lines.push(
      `[page-data-trends] ${status} ${c.label}: current=${c.curr} baseline=${c.base} delta=${formatDelta(delta, c.unit)} (better ${c.better})`
    );
    if (reg) regressions.push(`${c.label} delta ${formatDelta(delta, c.unit)}`);
  }

  const routeNames = Array.from(
    new Set([
      ...Object.keys(baseline?.snapshot?.routes || {}),
      ...Object.keys(current?.snapshot?.routes || {}),
    ])
  );

  for (const route of routeNames) {
    const currRoute = current?.snapshot?.routes?.[route];
    const baseRoute = baseline?.snapshot?.routes?.[route];
    if (!currRoute || !baseRoute) continue;

    const routeChecks = [
      {
        label: `${route}.route_p95_ms`,
        curr: toNum(currRoute?.routeLoadMs?.p95),
        base: toNum(baseRoute?.routeLoadMs?.p95),
        isRegression: (delta) => delta >= 300,
        unit: "ms",
        better: "down",
      },
      {
        label: `${route}.odds_availability_pct`,
        curr: toNum(currRoute?.oddsAvailabilityPct),
        base: toNum(baseRoute?.oddsAvailabilityPct),
        isRegression: (delta) => delta <= -4,
        unit: "pp",
        better: "up",
      },
      {
        label: `${route}.api_calls_p95`,
        curr: toNum(currRoute?.apiCallsPerRoute?.p95),
        base: toNum(baseRoute?.apiCallsPerRoute?.p95),
        isRegression: (delta) => delta >= 0.4,
        unit: "",
        better: "down",
      },
    ];

    for (const check of routeChecks) {
      const delta = check.curr - check.base;
      const reg = check.isRegression(delta);
      const status = reg ? "REGRESSION" : "OK";
      lines.push(
        `[page-data-trends] ${status} ${check.label}: current=${check.curr} baseline=${check.base} delta=${formatDelta(delta, check.unit)} (better ${check.better})`
      );
      if (reg) regressions.push(`${check.label} delta ${formatDelta(delta, check.unit)}`);
    }
  }

  for (const line of lines) console.log(line);

  if (regressions.length > 0) {
    console.error("\n[page-data-trends] Regressions detected:");
    for (const r of regressions) console.error(`- ${r}`);
    if (failOnRegression) process.exit(1);
  } else {
    console.log("\n[page-data-trends] No material regressions detected.");
  }
}

main().catch((err) => {
  console.error("[page-data-trends] fatal", err);
  process.exit(1);
});

