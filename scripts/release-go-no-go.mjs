#!/usr/bin/env node
/*
 * Release Go/No-Go Gate (plain Node runtime)
 *
 * This script intentionally avoids tsx/ts-node so CI and local runs are
 * deterministic. It verifies the core production risks we kept hitting:
 * - player matchup edge payload integrity
 * - player recent lines availability (including fallback sources)
 * - team schedule endpoint health across NBA teams
 */

const DEFAULT_BASE = "http://localhost:5173";
const DEFAULT_SPORT = "NBA";
const DEFAULT_PAGE_DATA_PROFILE = "launch";
const DEFAULT_PLAYERS = [
  "Nikola Jokić",
  "Jonas Valančiūnas",
  "Stephen Curry",
  "Trae Young",
  "LeBron James",
];
const CRITICAL_UI_FILES = [
  "src/react-app/pages/TeamProfilePage.tsx",
  "src/react-app/pages/PlayerProfilePage.tsx",
];

async function runUiHooksGate() {
  try {
    const { spawnSync } = await import("node:child_process");
    const cmd = "npx";
    const args = [
      "eslint",
      ...CRITICAL_UI_FILES,
      "--rule",
      "@typescript-eslint/no-explicit-any: off",
      "--rule",
      "@typescript-eslint/no-unused-vars: off",
      "--rule",
      "react-hooks/exhaustive-deps: off",
      "--rule",
      "react-hooks/rules-of-hooks: error",
      "--rule",
      "no-extra-boolean-cast: off",
      "--max-warnings=0",
    ];
    const result = spawnSync(cmd, args, {
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const ok = Number(result?.status ?? 1) === 0;
    const output = `${result?.stdout || ""}${result?.stderr || ""}`.trim();
    return {
      ok,
      summary: {
        files: CRITICAL_UI_FILES.length,
        exitCode: Number(result?.status ?? 1),
      },
      failures: ok
        ? []
        : [
            "critical UI hooks lint failed",
            ...(output ? output.split("\n").slice(-20) : []),
          ],
    };
  } catch (err) {
    return {
      ok: false,
      summary: { files: CRITICAL_UI_FILES.length, exitCode: 1 },
      failures: [`unable to execute hooks lint gate: ${String(err)}`],
    };
  }
}

async function runPageDataGates({ base, profile }) {
  try {
    const { spawnSync } = await import("node:child_process");
    const args = [
      "scripts/qa-page-data-gates.mjs",
      "--base",
      base,
      "--profile",
      profile,
    ];
    const result = spawnSync("node", args, {
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
      env: process.env,
    });
    const ok = Number(result?.status ?? 1) === 0;
    const output = `${result?.stdout || ""}${result?.stderr || ""}`.trim();
    return {
      ok,
      summary: {
        profile,
        exitCode: Number(result?.status ?? 1),
      },
      failures: ok
        ? []
        : [
            "page-data rollout gates failed",
            ...(output ? output.split("\n").slice(-30) : []),
          ],
    };
  } catch (err) {
    return {
      ok: false,
      summary: { profile, exitCode: 1 },
      failures: [`unable to execute page-data gates: ${String(err)}`],
    };
  }
}

async function runPageDataP0StrictGate({ base }) {
  try {
    const { spawnSync } = await import("node:child_process");
    const args = [
      "scripts/qa-page-data-p0-routes.mjs",
      "--base",
      base,
      "--strict",
    ];
    const result = spawnSync("node", args, {
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
      env: process.env,
    });
    const ok = Number(result?.status ?? 1) === 0;
    const output = `${result?.stdout || ""}${result?.stderr || ""}`.trim();
    return {
      ok,
      summary: {
        strict: true,
        exitCode: Number(result?.status ?? 1),
      },
      failures: ok
        ? []
        : [
            "page-data P0 strict gates failed",
            ...(output ? output.split("\n").slice(-30) : []),
          ],
    };
  } catch (err) {
    return {
      ok: false,
      summary: { strict: true, exitCode: 1 },
      failures: [`unable to execute page-data P0 strict gates: ${String(err)}`],
    };
  }
}

function parseArg(flag, fallback = "") {
  let value = fallback;
  for (let i = 0; i < process.argv.length - 1; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      value = process.argv[i + 1];
    }
  }
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}

function parseBoolArg(flag, fallback = false) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const next = String(process.argv[idx + 1] || "").trim().toLowerCase();
  if (!next) return true;
  if (["1", "true", "yes", "on"].includes(next)) return true;
  if (["0", "false", "no", "off"].includes(next)) return false;
  return fallback;
}

function toNum(value, fallback) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonWithRetry(url, timeoutMs, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetchJson(url, timeoutMs);
      if (response.status >= 200 && response.status < 300) {
        return response.json;
      }
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) {
      await sleep(350 * (i + 1));
    }
  }
  throw lastErr || new Error("request failed");
}

function hasUpcomingSignal(matchup) {
  if (!matchup) return false;
  if (typeof matchup.gameTime === "string" && matchup.gameTime.trim().length > 0) return true;
  const upcoming = Array.isArray(matchup.upcomingOpponents) ? matchup.upcomingOpponents : [];
  return upcoming.some(
    (row) => typeof row?.gameTime === "string" && row.gameTime.trim().length > 0
      || typeof row?.name === "string" && row.name.trim().length > 0
  );
}

function hasAnyRecentLine(payload) {
  const rows = Array.isArray(payload?.recentPerformance) ? payload.recentPerformance : [];
  if (rows.length === 0) return false;
  return rows.some((row) => {
    const lines = row?.propLines;
    if (!lines) return false;
    return [lines.points, lines.rebounds, lines.assists].some((v) => Number.isFinite(Number(v)));
  });
}

function isSparsePayload(payload) {
  const gameLogCount = Array.isArray(payload?.gameLog) ? payload.gameLog.length : 0;
  const seasonCount = payload?.seasonAverages ? Object.keys(payload.seasonAverages).length : 0;
  const recentCount = Array.isArray(payload?.recentPerformance) ? payload.recentPerformance.length : 0;
  const hasMatchup = Boolean(payload?.matchup?.opponent);
  return gameLogCount === 0 && seasonCount === 0 && recentCount === 0 && !hasMatchup;
}

async function runPlayerGate({ base, sport, timeoutMs }) {
  const failures = [];
  const fetchFailed = [];
  const sparsePlayers = [];
  const missingMatchup = [];
  const missingLines = [];
  let checked = 0;

  for (const player of DEFAULT_PLAYERS) {
    const url = `${base}/api/player/${sport}/${encodeURIComponent(player)}?fresh=1`;
    try {
      const payload = await readJsonWithRetry(url, timeoutMs, 3);
      checked += 1;
      if (isSparsePayload(payload)) sparsePlayers.push(player);
      const matchup = payload?.matchup;
      if (!matchup?.opponent) {
        missingMatchup.push(player);
      } else {
        const logo = String(matchup?.opponent?.logo || "").trim();
        if (!logo) {
          failures.push(`${player}: missing opponent logo`);
        }
        if (!hasUpcomingSignal(matchup)) {
          failures.push(`${player}: missing upcoming signal`);
        }
      }
      if (!hasAnyRecentLine(payload)) {
        missingLines.push(player);
      }
    } catch (err) {
      fetchFailed.push(`${player}: ${String(err)}`);
    }
  }

  if (checked === 0) failures.push("all players failed to fetch");
  if (fetchFailed.length > Math.floor(DEFAULT_PLAYERS.length / 2)) {
    failures.push(`high player fetch failure rate (${fetchFailed.length}/${DEFAULT_PLAYERS.length})`);
  }
  if (sparsePlayers.length === checked && checked > 0) {
    failures.push("all checked player payloads are sparse/degraded");
  }
  if (missingMatchup.length === checked && checked > 0) {
    failures.push("global matchup regression across checked players");
  }
  if (missingLines.length === checked && checked > 0) {
    failures.push("global no-line regression across checked players");
  }

  return {
    ok: failures.length === 0,
    summary: {
      checked,
      fetchFailed: fetchFailed.length,
      sparse: sparsePlayers.length,
      missingMatchup: missingMatchup.length,
      missingLines: missingLines.length,
    },
    failures: [...failures, ...fetchFailed],
  };
}

async function runTeamScheduleGate({ base, sport, timeoutMs, teamLimit, maxFailureRate }) {
  const standings = await readJsonWithRetry(`${base}/api/teams/${sport}/standings?fresh=1`, timeoutMs, 2);
  const teamsRaw = Array.isArray(standings?.teams) && standings.teams.length > 0
    ? standings.teams
    : (Array.isArray(standings?.standings) ? standings.standings : []);
  const teams = teamsRaw
    .filter((t) => String(t?.id || "").trim().length > 0)
    .slice(0, teamLimit);

  if (teams.length === 0) {
    return { ok: false, failures: ["no teams found in standings"], summary: { checked: 0, failed: 0, total: 0 } };
  }

  let checked = 0;
  const failures = [];
  const concurrency = 8;
  let idx = 0;

  async function worker() {
    while (idx < teams.length) {
      const current = teams[idx];
      idx += 1;
      const teamId = encodeURIComponent(String(current.id));
      const label = String(current.alias || current.abbreviation || current.name || teamId);
      try {
        const payload = await readJsonWithRetry(`${base}/api/teams/${sport}/${teamId}/schedule?fresh=1`, timeoutMs, 2);
        const totalGames = Number(payload?.totalGames || (Array.isArray(payload?.allGames) ? payload.allGames.length : 0));
        if (!Number.isFinite(totalGames) || totalGames <= 0) {
          failures.push(`${label}: empty schedule payload`);
          continue;
        }
        checked += 1;
      } catch (err) {
        failures.push(`${label}: ${String(err)}`);
      }
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, teams.length) }, () => worker());
  await Promise.all(runners);

  const allowedFailures = Math.max(0, Math.floor(teams.length * maxFailureRate));
  const ok = failures.length <= allowedFailures;
  return {
    ok,
    failures,
    summary: {
      total: teams.length,
      checked,
      failed: failures.length,
      allowedFailures,
    },
  };
}

function isFinalStatus(value) {
  const statusRaw = String(value?.name || value || "").toUpperCase();
  return statusRaw.includes("FINAL") || statusRaw.includes("COMPLETED") || statusRaw.includes("CLOSED");
}

function extractScheduleGames(payload) {
  if (Array.isArray(payload?.allGames) && payload.allGames.length > 0) return payload.allGames;
  return [
    ...(Array.isArray(payload?.pastGames) ? payload.pastGames : []),
    ...(Array.isArray(payload?.upcomingGames) ? payload.upcomingGames : []),
  ];
}

function pickOpponentFromSchedule(games, teamAliasRaw) {
  const teamAlias = String(teamAliasRaw || "").trim().toUpperCase();
  const upcoming = games.find((g) => !isFinalStatus(g?.status));
  const fallback = games.find((g) => isFinalStatus(g?.status));
  const row = upcoming || fallback;
  if (!row) return "";
  const direct = String(row?.opponent?.abbreviation || row?.opponent?.name || "").trim().toUpperCase();
  if (direct) return direct;
  const home = String(row?.homeTeamAlias || row?.homeTeam?.alias || "").trim().toUpperCase();
  const away = String(row?.awayTeamAlias || row?.awayTeam?.alias || "").trim().toUpperCase();
  if (home && away) {
    if (teamAlias && home === teamAlias) return away;
    if (teamAlias && away === teamAlias) return home;
    return away;
  }
  return away || home || "";
}

function hasAnyRecentFinalLine(games) {
  const finals = games.filter((g) => isFinalStatus(g?.status)).slice(0, 8);
  if (finals.length === 0) return false;
  return finals.some((g) => {
    const spread = Number(g?.spreadHome ?? g?.spread);
    const total = Number(g?.totalLine ?? g?.total);
    return Number.isFinite(spread) || Number.isFinite(total);
  });
}

async function runTeamMatchupEdgeGate({ base, sport, timeoutMs, teamLimit, maxFailureRate }) {
  const standings = await readJsonWithRetry(`${base}/api/teams/${sport}/standings?fresh=1`, timeoutMs, 2);
  const teamsRaw = Array.isArray(standings?.teams) && standings.teams.length > 0
    ? standings.teams
    : (Array.isArray(standings?.standings) ? standings.standings : []);
  const teams = teamsRaw
    .filter((t) => String(t?.id || "").trim().length > 0)
    .slice(0, teamLimit);

  if (teams.length === 0) {
    return { ok: false, failures: ["no teams found in standings"], summary: { checked: 0, finals: 0, h2h: 0, lines: 0, failed: 0, allowedFailures: 0 } };
  }

  const failures = [];
  let checked = 0;
  let teamsWithFinals = 0;
  let teamsWithH2hResponse = 0;
  let teamsWithLines = 0;

  for (const team of teams) {
    const teamIdRaw = String(team?.id || "").trim();
    const teamId = encodeURIComponent(teamIdRaw);
    const label = String(team?.alias || team?.abbreviation || team?.name || teamIdRaw);
    try {
      const schedulePayload = await readJsonWithRetry(`${base}/api/teams/${sport}/${teamId}/schedule`, timeoutMs, 2);
      const games = extractScheduleGames(schedulePayload);
      checked += 1;
      const finals = games.filter((g) => isFinalStatus(g?.status)).length;
      if (finals > 0) teamsWithFinals += 1;
      else failures.push(`${label}: no final games in schedule`);

      if (hasAnyRecentFinalLine(games)) teamsWithLines += 1;

      const teamAlias = String(team?.alias || team?.abbreviation || "").trim().toUpperCase();
      const opp = pickOpponentFromSchedule(games, teamAlias);
      if (!opp) {
        failures.push(`${label}: unable to resolve opponent for h2h`);
        continue;
      }
      const h2hRes = await fetchJson(
        `${base}/api/teams/${sport}/h2h?teamA=${encodeURIComponent(teamIdRaw)}&teamB=${encodeURIComponent(opp)}&window=10`,
        timeoutMs
      );
      if (Number(h2hRes?.status || 0) >= 500) {
        failures.push(`${label}: h2h HTTP ${h2hRes.status} vs ${opp}`);
      } else {
        teamsWithH2hResponse += 1;
      }
    } catch (err) {
      failures.push(`${label}: ${String(err)}`);
    }
  }

  const allowedFailures = Math.max(0, Math.floor(teams.length * maxFailureRate));
  const globalFailures = [];
  if (checked === 0) globalFailures.push("all teams failed matchup-edge checks");
  if (teamsWithFinals === 0) globalFailures.push("global finals regression");
  if (teamsWithH2hResponse === 0) globalFailures.push("global h2h endpoint regression");
  if (teamsWithLines === 0) globalFailures.push("global line regression in recent finals");

  return {
    ok: globalFailures.length === 0 && failures.length <= allowedFailures,
    failures: [...globalFailures, ...failures],
    summary: {
      total: teams.length,
      checked,
      finals: teamsWithFinals,
      h2h: teamsWithH2hResponse,
      lines: teamsWithLines,
      failed: failures.length,
      allowedFailures,
    },
  };
}

async function main() {
  const base = (parseArg("--base", process.env.QA_BASE || DEFAULT_BASE) || DEFAULT_BASE).replace(/\/+$/, "");
  const sport = parseArg("--sport", DEFAULT_SPORT).toUpperCase();
  const timeoutMs = Math.max(6000, toNum(parseArg("--timeout-ms", "12000"), 12000));
  const teamLimit = Math.max(2, Math.floor(toNum(parseArg("--teams", "12"), 12)));
  const maxFailureRate = Math.min(0.5, Math.max(0, toNum(parseArg("--max-failure-rate", "0.15"), 0.15)));
  const pageDataProfile = parseArg(
    "--page-data-profile",
    process.env.PAGE_DATA_PROFILE || DEFAULT_PAGE_DATA_PROFILE
  ).toLowerCase() === "canary" ? "canary" : "launch";
  const skipPageDataGates = parseBoolArg("--skip-page-data-gates", false);
  const enablePageDataP0Strict = parseBoolArg(
    "--enable-page-data-p0-strict",
    parseBoolArg("--page-data-p0-strict", false)
      || String(process.env.PAGE_DATA_P0_STRICT || "").toLowerCase() === "true"
  );

  console.log(
    `[release-go-no-go] base=${base} sport=${sport} timeoutMs=${timeoutMs} page_data_profile=${pageDataProfile} skip_page_data=${skipPageDataGates} p0_strict=${enablePageDataP0Strict}`
  );

  const playerGate = await runPlayerGate({ base, sport, timeoutMs });
  console.log(`[release-go-no-go] player_gate ${playerGate.ok ? "PASS" : "FAIL"} ${JSON.stringify(playerGate.summary)}`);
  if (!playerGate.ok) {
    for (const failure of playerGate.failures) console.error(`- ${failure}`);
  }

  const teamGate = await runTeamScheduleGate({ base, sport, timeoutMs: Math.max(timeoutMs, 12000), teamLimit, maxFailureRate });
  console.log(`[release-go-no-go] team_gate ${teamGate.ok ? "PASS" : "FAIL"} ${JSON.stringify(teamGate.summary)}`);
  if (!teamGate.ok) {
    for (const failure of teamGate.failures.slice(0, 20)) console.error(`- ${failure}`);
    if (teamGate.failures.length > 20) {
      console.error(`- ...and ${teamGate.failures.length - 20} more`);
    }
  }

  const matchupEdgeGate = await runTeamMatchupEdgeGate({
    base,
    sport,
    timeoutMs: Math.max(timeoutMs, 9000),
    teamLimit,
    maxFailureRate: Math.min(0.35, Math.max(maxFailureRate, 0.2)),
  });
  console.log(`[release-go-no-go] matchup_edge_gate ${matchupEdgeGate.ok ? "PASS" : "FAIL"} ${JSON.stringify(matchupEdgeGate.summary)}`);
  if (!matchupEdgeGate.ok) {
    for (const failure of matchupEdgeGate.failures.slice(0, 25)) console.error(`- ${failure}`);
    if (matchupEdgeGate.failures.length > 25) {
      console.error(`- ...and ${matchupEdgeGate.failures.length - 25} more`);
    }
  }

  const uiHooksGate = await runUiHooksGate();
  console.log(`[release-go-no-go] ui_hooks_gate ${uiHooksGate.ok ? "PASS" : "FAIL"} ${JSON.stringify(uiHooksGate.summary)}`);
  if (!uiHooksGate.ok) {
    for (const failure of uiHooksGate.failures) console.error(`- ${failure}`);
  }

  let pageDataGate = { ok: true, summary: { skipped: true }, failures: [] };
  if (!skipPageDataGates) {
    pageDataGate = await runPageDataGates({ base, profile: pageDataProfile });
    console.log(`[release-go-no-go] page_data_gate ${pageDataGate.ok ? "PASS" : "FAIL"} ${JSON.stringify(pageDataGate.summary)}`);
    if (!pageDataGate.ok) {
      for (const failure of pageDataGate.failures) console.error(`- ${failure}`);
    }
  } else {
    console.log("[release-go-no-go] page_data_gate SKIP (--skip-page-data-gates)");
  }

  let pageDataP0StrictGate = { ok: true, summary: { skipped: true }, failures: [] };
  if (enablePageDataP0Strict) {
    pageDataP0StrictGate = await runPageDataP0StrictGate({ base });
    console.log(`[release-go-no-go] page_data_p0_strict_gate ${pageDataP0StrictGate.ok ? "PASS" : "FAIL"} ${JSON.stringify(pageDataP0StrictGate.summary)}`);
    if (!pageDataP0StrictGate.ok) {
      for (const failure of pageDataP0StrictGate.failures) console.error(`- ${failure}`);
    }
  } else {
    console.log("[release-go-no-go] page_data_p0_strict_gate SKIP");
  }

  if (!playerGate.ok || !teamGate.ok || !matchupEdgeGate.ok || !uiHooksGate.ok || !pageDataGate.ok || !pageDataP0StrictGate.ok) {
    console.error("\n[release-go-no-go] NO-GO: release blocked");
    process.exit(1);
  }

  console.log("\n[release-go-no-go] GO: release checks passed");
}

main().catch((err) => {
  console.error("[release-go-no-go] fatal", err);
  process.exit(1);
});

