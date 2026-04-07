/*
 * Player Lines Guardrails QA
 *
 * Purpose:
 * Ensure player profile recent rows have usable prop lines
 * (historical/latest/event/estimated fallback), and catch
 * regressions where everything collapses to "No Line".
 *
 * Usage:
 *   npx tsx scripts/qa-player-lines-guardrails.ts --base http://localhost:5173
 *   npx tsx scripts/qa-player-lines-guardrails.ts --base https://<workers-dev-url>
 */

type GuardrailFailure = {
  player: string;
  reason: string;
  details?: Record<string, unknown>;
};

type PlayerProfilePayload = {
  recentPerformance?: Array<{
    propLines?: {
      points?: number | null;
      rebounds?: number | null;
      assists?: number | null;
    };
    lineSource?: string;
  }>;
};

const DEFAULT_PLAYERS = [
  "Nikola Jokić",
  "Jonas Valančiūnas",
  "LeBron James",
  "Stephen Curry",
  "Trae Young",
];

const ACCEPTED_LINE_SOURCES = new Set([
  "historical",
  "latest_fallback",
  "event_fallback",
  "estimated_fallback",
]);

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: "include" as RequestCredentials,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function rowHasAnyLine(row: PlayerProfilePayload["recentPerformance"][number]): boolean {
  const lines = row?.propLines;
  if (!lines) return false;
  return [lines.points, lines.rebounds, lines.assists].some((v) => Number.isFinite(Number(v)));
}

function rowHasAcceptedSource(row: PlayerProfilePayload["recentPerformance"][number]): boolean {
  return ACCEPTED_LINE_SOURCES.has(String(row?.lineSource || "").trim());
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173").replace(/\/+$/, "");
  const sport = parseArg("--sport", "NBA").toUpperCase();
  const timeoutMs = Math.max(5000, Number.parseInt(parseArg("--timeout-ms", "20000"), 10) || 20000);
  const maxFailureRate = Math.min(0.5, Math.max(0, Number.parseFloat(parseArg("--max-failure-rate", "0.2")) || 0.2));
  const onlyRaw = parseArg("--players", "").trim();
  const players = onlyRaw
    ? onlyRaw.split(",").map((p) => p.trim()).filter(Boolean)
    : DEFAULT_PLAYERS;

  console.log(`[player-lines-guardrails] base=${base} sport=${sport} players=${players.length}`);

  const failures: GuardrailFailure[] = [];
  const fetchFailed: string[] = [];
  let checked = 0;

  for (const player of players) {
    const encoded = encodeURIComponent(player);
    const url = `${base}/api/player/${sport}/${encoded}?fresh=1`;
    let payload: PlayerProfilePayload | null = null;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const next = await readJson<PlayerProfilePayload>(url, timeoutMs);
        payload = next;
        // Retry once if recent rows are absent (transient sparse payload).
        const rows = Array.isArray(next?.recentPerformance) ? next.recentPerformance : [];
        if (rows.length > 0 || attempt === 2) break;
      } catch (err) {
        lastErr = err;
      }
      if (attempt < 2) await sleep(350 * (attempt + 1));
    }

    if (!payload) {
      fetchFailed.push(player);
      continue;
    }

    checked += 1;
    const rows = Array.isArray(payload.recentPerformance) ? payload.recentPerformance : [];
    if (rows.length === 0) {
      failures.push({
        player,
        reason: "missing_recent_performance_rows",
      });
      continue;
    }

    const rowsWithLine = rows.filter((row) => rowHasAnyLine(row)).length;
    const rowsWithAcceptedSource = rows.filter((row) => rowHasAcceptedSource(row)).length;
    if (rowsWithLine === 0) {
      failures.push({
        player,
        reason: "all_recent_rows_missing_lines",
        details: { rows: rows.length, acceptedSources: rowsWithAcceptedSource },
      });
      continue;
    }
    if (rowsWithAcceptedSource === 0) {
      failures.push({
        player,
        reason: "all_recent_rows_missing_valid_line_source",
        details: { rows: rows.length, rowsWithLine },
      });
    }
  }

  if (checked === 0) {
    failures.push({
      player: "ALL_CHECKED_PLAYERS",
      reason: "all_player_fetches_failed",
      details: { players: fetchFailed },
    });
  } else if (fetchFailed.length > Math.floor(players.length / 2)) {
    failures.push({
      player: "MULTIPLE_PLAYERS",
      reason: "high_player_fetch_failure_rate",
      details: {
        totalPlayers: players.length,
        failed: fetchFailed.length,
        players: fetchFailed,
      },
    });
  } else if (fetchFailed.length > 0) {
    console.warn(
      `[player-lines-guardrails] warning: transient fetch failures ignored for ${fetchFailed.length} players: ${fetchFailed.join(", ")}`
    );
  }

  const allowedFailures = Math.max(0, Math.floor(players.length * maxFailureRate));
  if (failures.length > allowedFailures) {
    console.error(`\n[player-lines-guardrails] FAIL (${failures.length} issues / ${checked} players checked)\n`);
    for (const failure of failures) {
      console.error(`- ${failure.player}: ${failure.reason}${failure.details ? ` ${JSON.stringify(failure.details)}` : ""}`);
    }
    console.error(`[player-lines-guardrails] allowed_failures=${allowedFailures} max_failure_rate=${maxFailureRate}`);
    process.exit(1);
  }

  if (failures.length > 0) {
    console.warn(`\n[player-lines-guardrails] WARN (${failures.length} tolerated issues / ${checked} players checked)\n`);
    for (const failure of failures) {
      console.warn(`- ${failure.player}: ${failure.reason}${failure.details ? ` ${JSON.stringify(failure.details)}` : ""}`);
    }
    console.warn(`[player-lines-guardrails] allowed_failures=${allowedFailures} max_failure_rate=${maxFailureRate}`);
  } else {
    console.log(`\n[player-lines-guardrails] PASS (${checked} players)\n`);
  }
}

main().catch((err) => {
  console.error("[player-lines-guardrails] fatal", err);
  process.exit(1);
});

