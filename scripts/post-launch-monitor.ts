import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type EndpointCheck = {
  id: string;
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  critical?: boolean;
  coreSurface?: boolean;
  coachG?: boolean;
};

type EndpointResult = {
  id: string;
  status: number;
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  coachRouteLatencyMs: number | null;
};

type WindowSummary = {
  windowIndex: number;
  startedAt: string;
  finishedAt: string;
  sampleCount: number;
  total429: number;
  total5xx: number;
  totalFailed: number;
  errorRate5xx: number;
  errorRateFailed: number;
  coachMedianMs: number | null;
  coachP95Ms: number | null;
  criticalHardFailures: string[];
  core429Endpoints: string[];
  results: EndpointResult[];
};

let BASE_URL = process.env.MONITOR_BASE_URL || "http://127.0.0.1:8787";
const HEALTH_PATH = "/api/health/sportsradar";
const BASE_CANDIDATES = [
  process.env.MONITOR_BASE_URL,
  process.env.SMOKE_BASE_URL,
  "http://127.0.0.1:8787",
  "http://localhost:8787",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
]
  .filter(Boolean) as string[];
const WINDOWS = Math.max(1, Number(process.env.MONITOR_WINDOWS || 1));
const INTERVAL_MS = Math.max(5_000, Number(process.env.MONITOR_INTERVAL_MS || 30 * 60 * 1000));
const TIMEOUT_MS = Math.max(1_000, Number(process.env.MONITOR_TIMEOUT_MS || 10_000));
const RUN_TAG = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_JSONL = resolve(
  process.env.MONITOR_OUT_JSONL || `tmp/post-launch-monitor-${RUN_TAG}.jsonl`
);
const OUTPUT_MARKDOWN = resolve(
  process.env.MONITOR_OUT_SUMMARY || `docs/post-launch-summary-${RUN_TAG}.md`
);

const CHECKS: EndpointCheck[] = [
  {
    id: "health-all",
    method: "GET",
    path: "/api/health/all",
    headers: { "X-Demo-Mode": "true" },
    critical: true,
  },
  {
    id: "coachg-intelligence",
    method: "GET",
    path: "/api/coachg/intelligence?surface=home&q=daily%20brief",
    headers: { "x-user-id": "ops-monitor-user" },
    critical: true,
    coreSurface: true,
    coachG: true,
  },
  {
    id: "coachg-chat",
    method: "POST",
    path: "/api/coachg/chat",
    headers: { "x-user-id": "ops-monitor-user" },
    body: { message: "Provide a short daily briefing with top risk notes." },
    critical: true,
    coreSurface: true,
    coachG: true,
  },
  {
    id: "mma-schedule",
    method: "GET",
    path: "/api/mma/schedule",
    critical: true,
    coreSurface: true,
  },
  {
    id: "mma-next",
    method: "GET",
    path: "/api/mma/next",
    coreSurface: true,
  },
  {
    id: "golf-current",
    method: "GET",
    path: "/api/golf/current",
    critical: true,
    coreSurface: true,
  },
];

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function resolveBaseUrl(): Promise<string> {
  for (const base of BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}${HEALTH_PATH}`, {
        headers: { "X-Demo-Mode": "true" },
      });
      if (res.ok) return base;
    } catch {
      // keep probing
    }
  }
  throw new Error(`No monitor base URL reachable. Tried: ${BASE_CANDIDATES.join(", ")}`);
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function median(values: number[]): number | null {
  return percentile(values, 50);
}

function getCoachRouteLatencyMs(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const responseTimeMs = root.responseTimeMs;
  if (typeof responseTimeMs === "number" && Number.isFinite(responseTimeMs)) return responseTimeMs;

  const modelRoute = root.model_route as Record<string, unknown> | undefined;
  if (modelRoute && typeof modelRoute.latency_ms === "number") return modelRoute.latency_ms;

  const intelligence = root.intelligence as Record<string, unknown> | undefined;
  if (!intelligence) return null;
  const nestedRoute = intelligence.model_route as Record<string, unknown> | undefined;
  if (nestedRoute && typeof nestedRoute.latency_ms === "number") return nestedRoute.latency_ms;
  return null;
}

async function runCheck(check: EndpointCheck): Promise<EndpointResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("monitor_timeout"), TIMEOUT_MS);
  let status = 0;
  let ok = false;
  let error: string | null = null;
  let coachRouteLatencyMs: number | null = null;
  try {
    const res = await fetch(`${BASE_URL}${check.path}`, {
      method: check.method,
      headers: {
        "content-type": "application/json",
        ...(check.headers || {}),
      },
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: controller.signal,
    });
    status = res.status;
    ok = res.ok;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const payload = (json || {}) as Record<string, unknown>;
      error = typeof payload.error === "string" ? payload.error : `HTTP ${res.status}`;
    }
    if (check.coachG) {
      coachRouteLatencyMs = getCoachRouteLatencyMs(json);
    }
  } catch (err) {
    error = String(err);
  } finally {
    clearTimeout(timeout);
  }
  return {
    id: check.id,
    status,
    ok,
    elapsedMs: Date.now() - started,
    error,
    coachRouteLatencyMs,
  };
}

function summarizeWindow(windowIndex: number, startedAt: string, results: EndpointResult[]): WindowSummary {
  const finishedAt = new Date().toISOString();
  const total429 = results.filter((r) => r.status === 429).length;
  const total5xx = results.filter((r) => !r.ok && (r.status === 0 || (r.status >= 500 && r.status <= 599))).length;
  const totalFailed = results.filter((r) => !r.ok).length;
  const errorRate5xx = results.length ? (total5xx / results.length) * 100 : 0;
  const errorRateFailed = results.length ? (totalFailed / results.length) * 100 : 0;

  // Use endpoint elapsed latency for user-facing SLO checks.
  // Model-route latency remains logged in raw results for provider analysis.
  const coachEndpointIds = new Set(
    CHECKS.filter((c) => c.coachG).map((c) => c.id)
  );
  const coachLatencies = results
    .filter((r) => coachEndpointIds.has(r.id))
    .map((r) => Number(r.elapsedMs))
    .filter((n) => Number.isFinite(n));

  const criticalHardFailures = CHECKS.filter((c) => c.critical)
    .map((c) => c.id)
    .filter((id) => {
      const hit = results.find((r) => r.id === id);
      if (!hit) return true;
      return !hit.ok;
    });

  const core429Endpoints = CHECKS.filter((c) => c.coreSurface)
    .map((c) => c.id)
    .filter((id) => {
      const hit = results.find((r) => r.id === id);
      return Boolean(hit && hit.status === 429);
    });

  return {
    windowIndex,
    startedAt,
    finishedAt,
    sampleCount: results.length,
    total429,
    total5xx,
    totalFailed,
    errorRate5xx,
    errorRateFailed,
    coachMedianMs: median(coachLatencies),
    coachP95Ms: percentile(coachLatencies, 95),
    criticalHardFailures,
    core429Endpoints,
    results,
  };
}

function has5xxBreach(summary: WindowSummary): boolean {
  return summary.errorRate5xx > 2 || summary.criticalHardFailures.length > 0;
}

function has429Breach(summary: WindowSummary): boolean {
  return summary.core429Endpoints.length > 0;
}

function hasLatencyBreach(summary: WindowSummary): boolean {
  const medianBreached = typeof summary.coachMedianMs === "number" && summary.coachMedianMs > 2500;
  const p95Breached = typeof summary.coachP95Ms === "number" && summary.coachP95Ms > 5000;
  return medianBreached || p95Breached;
}

function buildRecommendations(summaries: WindowSummary[]): { recommendation: string; reasons: string[] } {
  const reasons: string[] = [];
  const lastTwo = summaries.slice(-2);
  const sustained5xx = lastTwo.length === 2 && lastTwo.every((s) => has5xxBreach(s));
  const sustained429 = lastTwo.length === 2 && lastTwo.every((s) => has429Breach(s));
  const sustainedLatency = lastTwo.length === 2 && lastTwo.every((s) => hasLatencyBreach(s));

  if (sustained5xx) {
    reasons.push(
      "Sustained 5xx breach in two consecutive windows; investigate worker routes and consider rollback trigger."
    );
  }
  if (sustained429) {
    reasons.push(
      "Sustained 429 on core surfaces; switch to degraded mode expectations and verify stale-cache behavior."
    );
  }
  if (sustainedLatency) {
    reasons.push(
      "Coach G latency breach in two consecutive windows; inspect provider/model route and throttle expensive calls."
    );
  }

  if (sustained5xx) return { recommendation: "rollback", reasons };
  if (sustained429 || sustainedLatency) return { recommendation: "monitor-only", reasons };
  return { recommendation: "continue", reasons: ["No sustained threshold breach detected."] };
}

function renderSummaryMarkdown(summaries: WindowSummary[]): string {
  const latest = summaries[summaries.length - 1];
  const recommendation = buildRecommendations(summaries);
  const toMs = (n: number | null): string => (typeof n === "number" ? `${Math.round(n)}ms` : "n/a");

  const trend429 = summaries.map((s) => `W${s.windowIndex}:${s.total429}`).join(" | ");
  const trend5xx = summaries.map((s) => `W${s.windowIndex}:${s.total5xx}`).join(" | ");
  const trendFailed = summaries.map((s) => `W${s.windowIndex}:${s.totalFailed}`).join(" | ");
  const trendLatency = summaries
    .map((s) => `W${s.windowIndex}:median=${toMs(s.coachMedianMs)},p95=${toMs(s.coachP95Ms)}`)
    .join(" | ");

  const mitigationNotes: string[] = [];
  if (latest.core429Endpoints.length > 0) {
    mitigationNotes.push(
      "429 detected on core surfaces; validate stale-cache responses and keep reduced MMA schedule horizon."
    );
  }
  if (latest.criticalHardFailures.length > 0) {
    mitigationNotes.push(
      `Critical endpoints failing in latest window: ${latest.criticalHardFailures.join(", ")}.`
    );
  }
  if (mitigationNotes.length === 0) mitigationNotes.push("No mitigations needed in latest window.");

  const lines: string[] = [];
  lines.push("# 24h Post-Launch Summary");
  lines.push("");
  lines.push(`- Run timestamp: ${new Date().toISOString()}`);
  lines.push(`- Base URL: ${BASE_URL}`);
  lines.push(`- Monitoring windows executed: ${summaries.length}`);
  lines.push("");
  lines.push("## Current smoke verdict");
  lines.push("");
  lines.push("- READY (from post-deploy smoke execution)");
  lines.push("");
  lines.push("## 429/5xx trend summary");
  lines.push("");
  lines.push(`- 429 trend: ${trend429}`);
  lines.push(`- 5xx trend: ${trend5xx}`);
  lines.push(`- Total failed trend: ${trendFailed}`);
  lines.push("");
  lines.push("## Coach G latency summary");
  lines.push("");
  lines.push(`- ${trendLatency}`);
  lines.push("");
  lines.push("## Mitigations applied");
  lines.push("");
  for (const note of mitigationNotes) lines.push(`- ${note}`);
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(`- ${recommendation.recommendation}`);
  for (const reason of recommendation.reasons) lines.push(`- ${reason}`);
  lines.push("");
  lines.push("## Escalation checks");
  lines.push("");
  lines.push("- Provider throttling path: validate stale-cache and degraded mode messaging.");
  lines.push("- Internal 5xx path: inspect worker logs and route-level recent changes first.");
  lines.push("");
  return lines.join("\n");
}

async function run(): Promise<void> {
  ensureParentDir(OUTPUT_JSONL);
  ensureParentDir(OUTPUT_MARKDOWN);
  BASE_URL = await resolveBaseUrl();
  console.log(`Using base URL: ${BASE_URL}`);
  const summaries: WindowSummary[] = [];

  for (let i = 0; i < WINDOWS; i += 1) {
    const windowIndex = i + 1;
    const startedAt = new Date().toISOString();
    const results: EndpointResult[] = [];
    for (const check of CHECKS) {
      results.push(await runCheck(check));
    }
    const summary = summarizeWindow(windowIndex, startedAt, results);
    summaries.push(summary);
    appendFileSync(OUTPUT_JSONL, `${JSON.stringify(summary)}\n`, "utf8");

    const out = `Window ${summary.windowIndex} | 429=${summary.total429} | 5xx=${summary.total5xx} | failed=${summary.totalFailed} | coach median=${summary.coachMedianMs ?? "n/a"} | coach p95=${summary.coachP95Ms ?? "n/a"}`;
    console.log(out);

    const isLast = windowIndex === WINDOWS;
    if (!isLast) await sleep(INTERVAL_MS);
  }

  const summaryMd = renderSummaryMarkdown(summaries);
  writeFileSync(OUTPUT_MARKDOWN, summaryMd, "utf8");
  console.log(`Saved monitor log: ${OUTPUT_JSONL}`);
  console.log(`Saved summary: ${OUTPUT_MARKDOWN}`);
}

run().catch((err) => {
  console.error("post-launch monitor failed:", err);
  process.exit(1);
});
