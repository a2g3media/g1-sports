/*
 * LOCK + SCALE VALIDATION: Full NBA roster sweep.
 *
 * Usage:
 *   npx tsx scripts/qa-nba-full-sweep.ts --base http://localhost:5173
 */

type TeamSummary = {
  teamId: string;
  teamName: string;
  rosterSize: number;
  readyCount: number;
  failedCount: number;
  failures: Array<{
    playerId: string;
    playerName: string;
    reasons: string[];
    missingSections: string[];
    clickStatus?: number;
    clickError?: string | null;
  }>;
};

type SweepReport = {
  ts: string;
  base: string;
  totalTeams: number;
  totalPlayers: number;
  totalReady: number;
  totalFailed: number;
  teamSummaries: TeamSummary[];
};

function parseArg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function firstNumeric(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value || "").trim();
    if (/^\d{3,}$/.test(s)) return s;
    const m = s.match(/\/full\/(\d+)\.png/i);
    if (m?.[1] && /^\d{3,}$/.test(m[1])) return m[1];
  }
  return "";
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function buildPlayer(base: string, sport: string, playerId: string, playerName: string): Promise<{ ok: boolean; reason: string | null }> {
  const url = new URL("/api/page-data/player-profile/build", base);
  url.searchParams.set("sport", sport);
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("playerName", playerName);
  url.searchParams.set("localBypass", "1");
  const out = await fetchJson(url.toString());
  return {
    ok: out.status === 200 && out.body?.ok === true,
    reason: out.body?.reason ? String(out.body.reason) : null,
  };
}

async function clickValidate(base: string, sport: string, playerId: string, playerName: string): Promise<{ status: number; error: string | null }> {
  const url = new URL("/api/page-data/player-profile", base);
  url.searchParams.set("sport", sport);
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("playerName", playerName);
  const out = await fetchJson(url.toString());
  return {
    status: out.status,
    error: out.body?.error ? String(out.body.error) : null,
  };
}

export async function runFullNBASweep(base: string): Promise<SweepReport> {
  const standings = await fetchJson(`${base}/api/teams/NBA/standings`);
  const teams = Array.isArray(standings.body?.teams) ? standings.body.teams : [];
  const teamSummaries: TeamSummary[] = [];

  for (const team of teams) {
    const teamId = String(team?.alias || team?.id || "").trim();
    const teamName = String(team?.name || teamId).trim();
    if (!teamId) continue;

    const rosterRes = await fetchJson(`${base}/api/teams/NBA/${encodeURIComponent(teamId)}`);
    const rosterRaw = Array.isArray(rosterRes.body?.roster) ? rosterRes.body.roster : [];
    const roster = rosterRaw
      .map((p: any) => ({
        playerId: firstNumeric(p?.playerId, p?.athleteId, p?.espnId, p?.athlete?.id, p?.headshot, p?.id),
        playerName: String(p?.name || p?.displayName || "").trim(),
      }))
      .filter((p: { playerId: string; playerName: string }) => p.playerId && p.playerName);

    for (const row of roster) {
      await buildPlayer(base, "NBA", row.playerId, row.playerName);
    }

    const retryMap = new Map<string, { playerId: string; playerName: string }>();
    for (let pass = 0; pass < 2; pass += 1) {
      const targets = pass === 0 ? roster : Array.from(retryMap.values());
      retryMap.clear();
      for (const row of targets) {
        const click = await clickValidate(base, "NBA", row.playerId, row.playerName);
        if (click.status !== 200) {
          retryMap.set(row.playerId, row);
        }
      }
      if (retryMap.size === 0) break;
      for (const row of retryMap.values()) {
        await buildPlayer(base, "NBA", row.playerId, row.playerName);
      }
    }

    const coverage = await fetchJson(`${base}/api/page-data/player-profile/coverage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sport: "NBA",
        teamId,
        players: roster,
      }),
    });
    const coveragePlayers = Array.isArray(coverage.body?.players) ? coverage.body.players : [];
    const failed = coveragePlayers.filter((p: any) => p?.ready !== true);

    const failures: TeamSummary["failures"] = [];
    for (const row of failed) {
      const playerId = String(row?.playerId || "").trim();
      const playerName = String(row?.playerName || "").trim();
      const click = await clickValidate(base, "NBA", playerId, playerName);
      const reasonRaw = String(row?.reason || "").trim();
      const reasons = reasonRaw ? reasonRaw.split(",").map((x) => x.trim()).filter(Boolean) : ["unknown"];
      const missingSections = Object.entries(row?.sectionStates || {})
        .filter(([, state]) => String(state) !== "ready")
        .map(([section]) => section);
      failures.push({
        playerId,
        playerName,
        reasons,
        missingSections,
        clickStatus: click.status,
        clickError: click.error,
      });
    }

    const readyCount = Number(coverage.body?.ready || 0);
    const rosterSize = roster.length;
    teamSummaries.push({
      teamId,
      teamName,
      rosterSize,
      readyCount,
      failedCount: failures.length,
      failures,
    });
  }

  const totalTeams = teamSummaries.length;
  const totalPlayers = teamSummaries.reduce((sum, row) => sum + row.rosterSize, 0);
  const totalReady = teamSummaries.reduce((sum, row) => sum + row.readyCount, 0);
  const totalFailed = teamSummaries.reduce((sum, row) => sum + row.failedCount, 0);

  return {
    ts: new Date().toISOString(),
    base,
    totalTeams,
    totalPlayers,
    totalReady,
    totalFailed,
    teamSummaries,
  };
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173");
  const out = await runFullNBASweep(base);

  console.log("\n[NBA SWEEP] Team Summary");
  console.table(
    out.teamSummaries.map((row) => ({
      team: row.teamName,
      teamId: row.teamId,
      roster: row.rosterSize,
      ready: row.readyCount,
      failed: row.failedCount,
    }))
  );

  if (out.totalFailed > 0) {
    console.log("\n[NBA SWEEP] Failing Players");
    for (const team of out.teamSummaries) {
      for (const player of team.failures) {
        console.log(JSON.stringify({
          team: team.teamName,
          teamId: team.teamId,
          playerId: player.playerId,
          playerName: player.playerName,
          reasons: player.reasons,
          missingSections: player.missingSections,
          clickStatus: player.clickStatus,
          clickError: player.clickError,
        }));
      }
    }
  }

  console.log("\n[NBA SWEEP] Totals");
  console.log(
    JSON.stringify({
      totalTeams: out.totalTeams,
      totalPlayers: out.totalPlayers,
      totalReady: out.totalReady,
      totalFailed: out.totalFailed,
      coveragePct: out.totalPlayers > 0 ? Number(((out.totalReady / out.totalPlayers) * 100).toFixed(2)) : 0,
    })
  );
}

main().catch((err) => {
  console.error("[NBA SWEEP] failed", err);
  process.exit(1);
});
