/*
 * Rolling player snapshot audit.
 *
 * Purpose:
 * - Continuously compare player page-data usability vs raw provider usability.
 * - Catch regressions where raw data is usable but page-data is degraded/missing.
 *
 * Usage:
 *   npx tsx scripts/qa-player-rolling-audit.ts --base http://localhost:5173
 *   npx tsx scripts/qa-player-rolling-audit.ts --iterations 1 --sample-size 100
 *   npx tsx scripts/qa-player-rolling-audit.ts --interval-sec 90 --concurrency 6
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

type PlayerTarget = { sport: string; name: string };
type Verdict = "pass_usable" | "pass_unavailable" | "fail_miss" | "timeout" | "other";

type AuditRow = {
  sport: string;
  name: string;
  verdict: Verdict;
  pdPartial: string | null;
  pdPlayerId: string | null;
  rawEspnId: string | null;
};

type IterationSummary = {
  ts: string;
  iteration: number;
  sampled: number;
  passUsable: number;
  passUnavailable: number;
  failMiss: number;
  timeout: number;
  other: number;
  failRows: AuditRow[];
};

const curatedTargets: PlayerTarget[] = [
  // NBA
  { sport: "NBA", name: "LeBron James" },
  { sport: "NBA", name: "Stephen Curry" },
  { sport: "NBA", name: "Kevin Durant" },
  { sport: "NBA", name: "Luka Doncic" },
  { sport: "NBA", name: "Nikola Jokic" },
  { sport: "NBA", name: "Giannis Antetokounmpo" },
  { sport: "NBA", name: "Anthony Edwards" },
  { sport: "NBA", name: "Victor Wembanyama" },
  { sport: "NBA", name: "Alex Caruso" },
  { sport: "NBA", name: "Colin Castleton" },
  // NCAAB
  { sport: "NCAAB", name: "Thomas Sorber" },
  { sport: "NCAAB", name: "Mara, Aday" },
  { sport: "NCAAB", name: "Cooper Flagg" },
  // NHL
  { sport: "NHL", name: "Connor McDavid" },
  { sport: "NHL", name: "Auston Matthews" },
  { sport: "NHL", name: "Nathan MacKinnon" },
  // MLB
  { sport: "MLB", name: "Shohei Ohtani" },
  { sport: "MLB", name: "Aaron Judge" },
  { sport: "MLB", name: "Mookie Betts" },
  // NFL
  { sport: "NFL", name: "Patrick Mahomes" },
  { sport: "NFL", name: "Josh Allen" },
  { sport: "NFL", name: "Jalen Hurts" },
];

function parseArg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function parseIntArg(flag: string, fallback: number): number {
  const n = Number.parseInt(parseArg(flag, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolArg(flag: string, fallback: boolean): boolean {
  const raw = parseArg(flag, fallback ? "1" : "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function uniqTargets(list: PlayerTarget[]): PlayerTarget[] {
  const out: PlayerTarget[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const sport = String(row.sport || "").trim().toUpperCase();
    const name = String(row.name || "").trim();
    if (!sport || !name) continue;
    const key = `${sport}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sport, name });
  }
  return out;
}

function hasMeaningfulPayload(payload: any): boolean {
  const gameLog = Array.isArray(payload?.gameLog) ? payload.gameLog.length : 0;
  const season = payload?.seasonAverages && typeof payload.seasonAverages === "object"
    ? Object.keys(payload.seasonAverages).length
    : 0;
  const props = Array.isArray(payload?.currentProps) ? payload.currentProps.length : 0;
  return gameLog > 0 || season > 0 || props > 0;
}

async function resolveAuditPlayerId(base: string, item: PlayerTarget, timeoutMs: number): Promise<string | null> {
  const url = new URL(
    `/api/player/${encodeURIComponent(item.sport)}/${encodeURIComponent(item.name)}/headshot`,
    base
  );
  const res = await fetchJsonWithTimeout(url.toString(), timeoutMs);
  if (res.timeout || !res.body) return null;
  const id = String(res.body?.espnId ?? "").trim();
  return /^\d{4,}$/.test(id) ? id : null;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<{ status: number; body: any; timeout: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, timeout: false };
  } catch {
    return { status: 0, body: null, timeout: true };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeedTargets(base: string, limit: number, timeoutMs: number): Promise<PlayerTarget[]> {
  const url = new URL("/api/sports-data/props/today", base);
  url.searchParams.set("sport", "ALL");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");
  const feed = await fetchJsonWithTimeout(url.toString(), timeoutMs);
  const rows = Array.isArray(feed.body?.props) ? feed.body.props : [];
  const out: PlayerTarget[] = [];
  for (const row of rows) {
    const sport = String(row?.sport || row?.league || "").trim().toUpperCase();
    const name = String(row?.player_name || row?.playerName || "").trim();
    if (!sport || !name) continue;
    out.push({ sport, name });
  }
  return uniqTargets(out);
}

function buildSample(pool: PlayerTarget[], sampleSize: number, seedBase: number): PlayerTarget[] {
  if (pool.length === 0) return [];
  let seed = seedBase >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shuffled = [...pool].sort(() => rand() - 0.5);
  if (shuffled.length >= sampleSize) return shuffled.slice(0, sampleSize);
  const out = [...shuffled];
  let i = 0;
  while (out.length < sampleSize) {
    out.push(shuffled[i % shuffled.length]);
    i += 1;
  }
  return out;
}

async function auditOne(base: string, item: PlayerTarget, timeoutMs: number, useFreshProbe: boolean): Promise<AuditRow> {
  const canonicalId = await resolveAuditPlayerId(base, item, timeoutMs);
  if (!canonicalId) {
    return {
      sport: item.sport,
      name: item.name,
      verdict: "other",
      pdPartial: "unresolved_player_id",
      pdPlayerId: null,
      rawEspnId: null,
    };
  }

  const rawUrl = new URL(`/api/player/${encodeURIComponent(item.sport)}/${encodeURIComponent(item.name)}`, base);
  rawUrl.searchParams.set("pageData", "1");
  rawUrl.searchParams.set("fast", "1");
  if (useFreshProbe) rawUrl.searchParams.set("fresh", "1");

  const pdUrl = new URL("/api/page-data/player-profile", base);
  pdUrl.searchParams.set("sport", item.sport);
  pdUrl.searchParams.set("playerName", item.name);
  pdUrl.searchParams.set("playerId", canonicalId);
  if (useFreshProbe) pdUrl.searchParams.set("fresh", "1");

  const [raw, pd] = await Promise.all([
    fetchJsonWithTimeout(rawUrl.toString(), timeoutMs),
    fetchJsonWithTimeout(pdUrl.toString(), timeoutMs),
  ]);

  if (raw.timeout || pd.timeout) {
    return {
      sport: item.sport,
      name: item.name,
      verdict: "timeout",
      pdPartial: null,
      pdPlayerId: null,
      rawEspnId: null,
    };
  }

  const rawUsable = Boolean(raw.body?.player) && hasMeaningfulPayload(raw.body);
  const profile = pd.body?.data?.profile || {};
  const pdUsable = pd.body?.degraded !== true && hasMeaningfulPayload(profile);

  let verdict: Verdict = "other";
  if (pdUsable) {
    verdict = "pass_usable";
  } else if (pd.body?.meta?.partialReason === "unavailable_no_data" && !rawUsable) {
    verdict = "pass_unavailable";
  } else if (rawUsable && !pdUsable) {
    verdict = "fail_miss";
  }

  return {
    sport: item.sport,
    name: item.name,
    verdict,
    pdPartial: String(pd.body?.meta?.partialReason || "") || null,
    pdPlayerId: String(pd.body?.meta?.playerId || "") || null,
    rawEspnId: String(raw.body?.player?.espnId || "") || null,
  };
}

async function runIteration(params: {
  base: string;
  sample: PlayerTarget[];
  concurrency: number;
  timeoutMs: number;
  iteration: number;
  useFreshProbe: boolean;
}): Promise<IterationSummary> {
  const queue = [...params.sample];
  const results: AuditRow[] = [];

  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      results.push(await auditOne(params.base, next, params.timeoutMs, params.useFreshProbe));
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, params.concurrency) }, () => worker()));

  const failRows = results.filter((r) => r.verdict === "fail_miss" || r.verdict === "timeout").slice(0, 20);
  return {
    ts: new Date().toISOString(),
    iteration: params.iteration,
    sampled: results.length,
    passUsable: results.filter((r) => r.verdict === "pass_usable").length,
    passUnavailable: results.filter((r) => r.verdict === "pass_unavailable").length,
    failMiss: results.filter((r) => r.verdict === "fail_miss").length,
    timeout: results.filter((r) => r.verdict === "timeout").length,
    other: results.filter((r) => r.verdict === "other").length,
    failRows,
  };
}

function printIteration(summary: IterationSummary, rolling: IterationSummary[]): void {
  console.log(`\n[player-rolling-audit] iteration=${summary.iteration} ts=${summary.ts}`);
  console.table([{
    sampled: summary.sampled,
    pass_usable: summary.passUsable,
    pass_unavailable: summary.passUnavailable,
    fail_miss: summary.failMiss,
    timeout: summary.timeout,
    other: summary.other,
    pass_rate_pct: summary.sampled > 0
      ? Number((((summary.passUsable + summary.passUnavailable) / summary.sampled) * 100).toFixed(1))
      : 0,
  }]);

  const rollingRows = rolling.map((row) => ({
    iter: row.iteration,
    fail_miss: row.failMiss,
    timeout: row.timeout,
    pass_rate_pct: row.sampled > 0
      ? Number((((row.passUsable + row.passUnavailable) / row.sampled) * 100).toFixed(1))
      : 0,
  }));
  if (rollingRows.length > 0) {
    console.log("[player-rolling-audit] rolling table");
    console.table(rollingRows);
  }

  if (summary.failRows.length > 0) {
    console.log("[player-rolling-audit] fail/timeout rows");
    console.table(summary.failRows.map((r) => ({
      sport: r.sport,
      player: r.name,
      verdict: r.verdict,
      pd_partial: r.pdPartial,
      pd_player_id: r.pdPlayerId,
      raw_espn_id: r.rawEspnId,
    })));
  }
}

async function appendJsonl(outPath: string, summary: IterationSummary): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await appendFile(outPath, `${JSON.stringify(summary)}\n`, "utf8");
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173");
  const intervalSec = Math.max(10, parseIntArg("--interval-sec", 60));
  const iterations = Math.max(0, parseIntArg("--iterations", 0)); // 0 = run forever
  const sampleSize = Math.max(10, parseIntArg("--sample-size", 100));
  const concurrency = Math.max(1, parseIntArg("--concurrency", 6));
  const timeoutMs = Math.max(2500, parseIntArg("--timeout-ms", 12000));
  const feedLimit = Math.max(200, parseIntArg("--feed-limit", 3000));
  const out = parseArg("--out", ".tmp/qa-player-rolling-audit.jsonl");
  const rollingWindow = Math.max(3, parseIntArg("--rolling-window", 10));
  const useFreshProbe = parseBoolArg("--fresh-probe", false);

  console.log(`[player-rolling-audit] base=${base} interval_sec=${intervalSec} sample_size=${sampleSize} concurrency=${concurrency} timeout_ms=${timeoutMs} fresh_probe=${useFreshProbe ? "1" : "0"}`);
  console.log(`[player-rolling-audit] output=${out} iterations=${iterations === 0 ? "infinite" : iterations}`);

  const feedTargets = await fetchFeedTargets(base, feedLimit, timeoutMs);
  const pool = uniqTargets([...curatedTargets, ...feedTargets]);
  if (pool.length === 0) {
    console.error("[player-rolling-audit] no player targets found");
    process.exit(1);
  }

  const rolling: IterationSummary[] = [];
  let iter = 1;
  for (;;) {
    const sample = buildSample(pool, sampleSize, 1000 + iter);
    const summary = await runIteration({
      base,
      sample,
      concurrency,
      timeoutMs,
      iteration: iter,
      useFreshProbe,
    });
    rolling.push(summary);
    while (rolling.length > rollingWindow) rolling.shift();

    printIteration(summary, rolling);
    await appendJsonl(out, summary);

    if (iterations > 0 && iter >= iterations) break;
    iter += 1;
    await sleep(intervalSec * 1000);
  }
}

main().catch((err) => {
  console.error("[player-rolling-audit] failed", err);
  process.exit(1);
});
