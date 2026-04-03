/*
 * Player Matchup Guardrails QA
 *
 * Purpose:
 * Catch regressions where Player Profile "Matchup Edge" loses
 * - opponent logo
 * - upcoming game / upcoming opponents
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
  "CJ McCollum",
];

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function looksLikeNbaAbbr(value: unknown): boolean {
  return /^[A-Z]{3}$/.test(String(value || "").trim().toUpperCase());
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

async function readJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" as RequestCredentials });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173").replace(/\/+$/, "");
  const sport = parseArg("--sport", "NBA").toUpperCase();
  const onlyRaw = parseArg("--players", "").trim();
  const players = onlyRaw
    ? onlyRaw.split(",").map((p) => p.trim()).filter(Boolean)
    : DEFAULT_PLAYERS;

  console.log(`[matchup-guardrails] base=${base} sport=${sport} players=${players.length}`);

  const failures: GuardrailFailure[] = [];
  let checked = 0;

  for (const player of players) {
    const encoded = encodeURIComponent(player);
    const url = `${base}/api/player/${sport}/${encoded}?fresh=1`;
    let payload: PlayerProfilePayload;
    try {
      payload = await readJson<PlayerProfilePayload>(url);
    } catch (err) {
      failures.push({ player, reason: "fetch_failed", details: { error: String(err) } });
      continue;
    }
    checked += 1;

    const matchup = payload.matchup;
    if (!matchup || !matchup.opponent) {
      failures.push({ player, reason: "missing_matchup" });
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

