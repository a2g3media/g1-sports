/*
 * Player Matchup Guardrails QA
 *
 * Purpose:
 * Catch regressions where Player Profile "Matchup Edge" loses
 * - opponent logo
 * - upcoming game / upcoming opponents
 * - recent performance odds lines unexpectedly all missing
 * - valid NBA team abbreviation format
 *
 * Usage:
 *   npx tsx scripts/qa-player-matchup-guardrails.ts --base http://localhost:5173
 *   npx tsx scripts/qa-player-matchup-guardrails.ts --base https://<workers-dev-url>
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
  matchup?: {
    opponent?: {
      name?: string;
      abbr?: string;
      logo?: string;
    };
    upcomingOpponents?: Array<{
      name?: string;
      abbr?: string;
      logo?: string;
      gameTime?: string;
    }>;
    gameTime?: string;
  };
};

const DEFAULT_PLAYERS = [
  "Trae Young",
  "Cade Cunningham",
  "Stephen Curry",
  "Nikola Jokić",
  "CJ McCollum",
];

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function looksLikeNbaAbbr(value: unknown): boolean {
  // ESPN and downstream feeds can emit aliases like SA/NY in addition to 3-letter keys.
  return /^[A-Z]{2,4}$/.test(String(value || "").trim().toUpperCase());
}

function isTruthyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasUpcomingSignal(matchup: PlayerProfilePayload["matchup"]): boolean {
  if (!matchup) return false;
  if (isTruthyString(matchup.gameTime)) return true;
  const upcoming = Array.isArray(matchup.upcomingOpponents) ? matchup.upcomingOpponents : [];
  return upcoming.length > 0 && upcoming.some((row) => isTruthyString(row?.gameTime) || isTruthyString(row?.name));
}

function hasAnyOddsLine(payload: PlayerProfilePayload): boolean {
  const rows = Array.isArray(payload.recentPerformance) ? payload.recentPerformance : [];
  if (rows.length === 0) return true;
  return rows.some((row) => {
    const lines = row?.propLines;
    if (!lines) return false;
    return [lines.points, lines.rebounds, lines.assists].some((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  });
}

async function readJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: "include" as RequestCredentials,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173").replace(/\/+$/, "");
  const sport = parseArg("--sport", "NBA").toUpperCase();
  const timeoutMs = Math.max(5000, Number.parseInt(parseArg("--timeout-ms", "20000"), 10) || 20000);
  const onlyRaw = parseArg("--players", "").trim();
  const players = onlyRaw
    ? onlyRaw.split(",").map((p) => p.trim()).filter(Boolean)
    : DEFAULT_PLAYERS;

  console.log(`[matchup-guardrails] base=${base} sport=${sport} players=${players.length}`);

  const failures: GuardrailFailure[] = [];
  const missingLinePlayers: string[] = [];
  const fetchFailedPlayers: string[] = [];
  const missingMatchupPlayers: string[] = [];
  let checked = 0;

  for (const player of players) {
    const encoded = encodeURIComponent(player);
    const url = `${base}/api/player/${sport}/${encoded}?fresh=1`;
    let payload: PlayerProfilePayload | null = null;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const nextPayload = await readJson<PlayerProfilePayload>(url, timeoutMs);
        payload = nextPayload;
        // Some upstream sources return partial payloads transiently; retry once/twice.
        if (nextPayload?.matchup?.opponent) break;
      } catch (err) {
        lastErr = err;
      }
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }

    if (!payload) {
      fetchFailedPlayers.push(player);
      continue;
    }
    checked += 1;

    const matchup = payload.matchup;
    if (!matchup || !matchup.opponent) {
      missingMatchupPlayers.push(player);
      continue;
    }

    const abbr = String(matchup.opponent.abbr || "").trim().toUpperCase();
    const logo = String(matchup.opponent.logo || "").trim();

    if (sport === "NBA" && !looksLikeNbaAbbr(abbr)) {
      failures.push({
        player,
        reason: "invalid_opponent_abbr",
        details: { abbr, opponent: matchup.opponent.name || "" },
      });
    }

    if (!isTruthyString(logo)) {
      failures.push({
        player,
        reason: "missing_opponent_logo",
        details: { abbr, opponent: matchup.opponent.name || "" },
      });
    }

    if (!hasUpcomingSignal(matchup)) {
      failures.push({
        player,
        reason: "missing_upcoming_game_signal",
        details: {
          gameTime: matchup.gameTime || null,
          upcomingCount: Array.isArray(matchup.upcomingOpponents) ? matchup.upcomingOpponents.length : 0,
        },
      });
    }

    if (!hasAnyOddsLine(payload)) {
      missingLinePlayers.push(player);
    }
  }

  // Treat missing odds lines as a hard regression only when coverage collapses globally.
  if (checked > 0 && missingLinePlayers.length === checked) {
    failures.push({
      player: "ALL_CHECKED_PLAYERS",
      reason: "missing_recent_odds_lines_global_regression",
      details: {
        checked,
        players: missingLinePlayers,
      },
    });
  }

  if (checked === 0) {
    failures.push({
      player: "ALL_CHECKED_PLAYERS",
      reason: "all_player_fetches_failed",
      details: { players: fetchFailedPlayers },
    });
  } else if (fetchFailedPlayers.length > Math.floor(players.length / 2)) {
    failures.push({
      player: "MULTIPLE_PLAYERS",
      reason: "high_player_fetch_failure_rate",
      details: {
        totalPlayers: players.length,
        failed: fetchFailedPlayers.length,
        players: fetchFailedPlayers,
      },
    });
  } else if (fetchFailedPlayers.length > 0) {
    console.warn(
      `[matchup-guardrails] warning: transient fetch failures ignored for ${fetchFailedPlayers.length} players: ${fetchFailedPlayers.join(", ")}`
    );
  }

  if (checked > 0 && missingMatchupPlayers.length === checked) {
    failures.push({
      player: "ALL_CHECKED_PLAYERS",
      reason: "missing_matchup_global_regression",
      details: { checked, players: missingMatchupPlayers },
    });
  } else if (missingMatchupPlayers.length > Math.floor(players.length / 2)) {
    failures.push({
      player: "MULTIPLE_PLAYERS",
      reason: "high_missing_matchup_rate",
      details: {
        totalPlayers: players.length,
        missing: missingMatchupPlayers.length,
        players: missingMatchupPlayers,
      },
    });
  } else if (missingMatchupPlayers.length > 0) {
    console.warn(
      `[matchup-guardrails] warning: transient missing matchup ignored for ${missingMatchupPlayers.length} players: ${missingMatchupPlayers.join(", ")}`
    );
  }

  if (failures.length > 0) {
    console.error(`\n[matchup-guardrails] FAIL (${failures.length} issues across ${checked} checked players)\n`);
    for (const failure of failures) {
      console.error(`- ${failure.player}: ${failure.reason}${failure.details ? ` ${JSON.stringify(failure.details)}` : ""}`);
    }
    process.exit(1);
  }

  console.log(`\n[matchup-guardrails] PASS (${checked} players)\n`);
}

main().catch((err) => {
  console.error("[matchup-guardrails] fatal", err);
  process.exit(1);
});

