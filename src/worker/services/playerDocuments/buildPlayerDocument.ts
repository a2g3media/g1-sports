/* COVERAGE LOCK: do not redesign/refactor; only completeness rule updates. */
import {
  computeLivePlayerProfilePayload,
  normalizePlayerSlug,
  resolvePlayerInfoForDocumentBuild,
  type Bindings,
} from "../../routes/player-profile";
import { computeDocumentCompleteness } from "./documentCompleteness";
import { upsertPlayerDocumentV1, type StoredPlayerDocumentV1 } from "./playerDocumentStore";
import { resolveCanonicalPlayerIdentity } from "../playerIdentity/canonicalPlayerResolver";
import { evaluatePlayerProfileCoreReadiness } from "../../../shared/playerProfileCompleteness";

function deriveSeasonAveragesFromGameLog(
  sportInput: unknown,
  gameLogInput: unknown,
  currentSeason: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const sport = String(sportInput || "").trim().toUpperCase();
  const season = currentSeason && typeof currentSeason === "object" ? { ...currentSeason } : {};
  if (Object.keys(season).length > 0) return season;
  const gameLog = Array.isArray(gameLogInput) ? gameLogInput : [];
  if (!gameLog.length) return season;
  if (sport === "NHL") {
    let games = 0;
    let goals = 0;
    let assists = 0;
    let points = 0;
    let shots = 0;
    let saves = 0;
    let goalsAgainst = 0;
    let wins = 0;
    for (const row of gameLog as any[]) {
      const stats = row?.stats && typeof row.stats === "object" ? row.stats : row || {};
      const g = Number(stats?.G ?? stats?.goals);
      const a = Number(stats?.A ?? stats?.assists);
      const p = Number(stats?.PTS ?? stats?.points);
      const sog = Number(stats?.SOG ?? stats?.shots ?? stats?.SA);
      const sv = Number(stats?.SV ?? stats?.saves);
      const ga = Number(stats?.GA ?? stats?.goalsAgainst);
      const w = Number(stats?.WINS ?? stats?.W ?? stats?.wins);
      if (
        !Number.isFinite(g)
        && !Number.isFinite(a)
        && !Number.isFinite(p)
        && !Number.isFinite(sog)
        && !Number.isFinite(sv)
        && !Number.isFinite(ga)
        && !Number.isFinite(w)
      ) continue;
      games += 1;
      if (Number.isFinite(g)) goals += g;
      if (Number.isFinite(a)) assists += a;
      if (Number.isFinite(p)) points += p;
      if (Number.isFinite(sog)) shots += sog;
      if (Number.isFinite(sv)) saves += sv;
      if (Number.isFinite(ga)) goalsAgainst += ga;
      if (Number.isFinite(w)) wins += w;
    }
    if (!games) return season;
    season.goals = Number((goals / games).toFixed(2));
    season.assists = Number((assists / games).toFixed(2));
    season.points = Number((points / games).toFixed(2));
    season.shots = Number((shots / games).toFixed(2));
    if (saves > 0) season.saves = Number((saves / games).toFixed(2));
    if (goalsAgainst > 0) season.goalsAgainst = Number((goalsAgainst / games).toFixed(2));
    if (wins > 0) season.wins = Number((wins / games).toFixed(2));
    season.gamesPlayed = games;
    return season;
  }
  if (sport === "MLB") {
    let games = 0;
    let hits = 0;
    let runs = 0;
    let rbis = 0;
    let homeRuns = 0;
    let strikeouts = 0;
    for (const row of gameLog as any[]) {
      const stats = row?.stats && typeof row.stats === "object" ? row.stats : row || {};
      const h = Number(stats?.hits ?? stats?.H ?? stats?.hit);
      const r = Number(stats?.runs ?? stats?.R ?? stats?.run);
      const rbi = Number(stats?.rbi ?? stats?.RBIs ?? stats?.rbis ?? stats?.RBI);
      const hr = Number(stats?.hr ?? stats?.homeRuns ?? stats?.home_runs ?? stats?.HR);
      const so = Number(stats?.so ?? stats?.strikeouts ?? stats?.K ?? stats?.ks);
      if (!Number.isFinite(h) && !Number.isFinite(r) && !Number.isFinite(rbi) && !Number.isFinite(hr) && !Number.isFinite(so)) continue;
      games += 1;
      if (Number.isFinite(h)) hits += h;
      if (Number.isFinite(r)) runs += r;
      if (Number.isFinite(rbi)) rbis += rbi;
      if (Number.isFinite(hr)) homeRuns += hr;
      if (Number.isFinite(so)) strikeouts += so;
    }
    if (!games) return season;
    season.hits = Number((hits / games).toFixed(2));
    season.runs = Number((runs / games).toFixed(2));
    season.rbis = Number((rbis / games).toFixed(2));
    season.homeRuns = Number((homeRuns / games).toFixed(2));
    season.strikeouts = Number((strikeouts / games).toFixed(2));
    season.gamesPlayed = games;
    return season;
  }
  let games = 0;
  let pts = 0;
  let reb = 0;
  let ast = 0;
  for (const row of gameLog as any[]) {
    const stats = row?.stats && typeof row.stats === "object" ? row.stats : row || {};
    const p = Number(
      stats?.pts
      ?? stats?.PTS
      ?? stats?.points
      ?? stats?.Points
    );
    const r = Number(
      stats?.reb
      ?? stats?.REB
      ?? stats?.rebounds
      ?? stats?.Rebounds
    );
    const a = Number(
      stats?.ast
      ?? stats?.AST
      ?? stats?.assists
      ?? stats?.Assists
    );
    if (!Number.isFinite(p) && !Number.isFinite(r) && !Number.isFinite(a)) continue;
    games += 1;
    if (Number.isFinite(p)) pts += p;
    if (Number.isFinite(r)) reb += r;
    if (Number.isFinite(a)) ast += a;
  }
  if (!games) return season;
  season.points = Number((pts / games).toFixed(1));
  season.rebounds = Number((reb / games).toFixed(1));
  season.assists = Number((ast / games).toFixed(1));
  season.gamesPlayed = games;
  return season;
}

function buildStage1ProfileShell(
  playerInfo: {
    espnId: string;
    displayName: string;
    position: string;
    jersey: string;
    teamName: string;
    teamAbbr: string;
    teamColor: string;
    headshotUrl: string;
    birthDate?: string;
    height?: string;
    weight?: string;
    experience?: string;
    college?: string;
  },
  sport: string
): Record<string, unknown> {
  return {
    player: {
      ...playerInfo,
      sport,
    },
    gameLog: [],
    seasonAverages: {},
    currentProps: [],
    recentPerformance: [],
    propHitRates: {},
    matchup: null,
    vsOpponent: null,
    health: undefined,
    news: [],
    liveProps: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Background-only: staged enrichment into `player_documents`.
 * Stage 1 (fast): identity + team + headshot persisted immediately so D1 can serve a real row quickly.
 * Stage 2 (slow): full ESPN/SR merge; upserts again; may re-enqueue if completeness < threshold.
 */
export async function buildPlayerDocument(params: {
  db: D1Database;
  env: Bindings;
  sport: string;
  playerId: string;
  playerNameHint?: string | null;
  origin: string;
}): Promise<{ ok: true; completenessScore?: number } | { ok: false; reason: string }> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const pid = String(params.playerId || "").trim();
  if (!sport || sport === "ALL" || !/^\d{3,}$/.test(pid)) {
    return { ok: false, reason: "invalid_sport_or_id" };
  }

  const rawHint = String(params.playerNameHint || "").trim() || pid;
  const canonical = await resolveCanonicalPlayerIdentity({
    db: params.db,
    sport,
    playerId: pid,
    playerName: rawHint,
    source: "buildPlayerDocument",
  });
  if (!canonical.ok) {
    return { ok: false, reason: "reason" in canonical ? canonical.reason : "canonical_resolution_failed" };
  }
  const canonicalPid = canonical.identity.espnPlayerId;
  const canonicalName = String(canonical.identity.displayName || rawHint || canonicalPid).trim();
  const identity = await resolvePlayerInfoForDocumentBuild({
    sport,
    playerId: canonicalPid,
    playerNameHint: canonicalName,
  });
  if (!identity) {
    return { ok: false, reason: "no_identity" };
  }

  const stage1Profile = buildStage1ProfileShell(identity, sport);
  const c1 = computeDocumentCompleteness(stage1Profile);
  const metaName = String(identity.displayName || canonicalName).trim() || canonicalPid;
  const docStage1: StoredPlayerDocumentV1 = {
    schemaVersion: 1,
    meta: {
      sport,
      playerName: metaName,
      playerId: canonicalPid,
      partialReason: "stage1_shell",
      completeness: c1,
    },
    data: {
      profile: stage1Profile,
      canonicalTeamRouteId: null,
    },
  };
  await upsertPlayerDocumentV1(params.db, docStage1, new Date().toISOString());

  const rawPlayerName = String(identity.displayName || canonicalName).trim();
  const normalizedPlayerName = normalizePlayerSlug(rawPlayerName);
  const playerName = normalizedPlayerName || rawPlayerName;

  const computed = await computeLivePlayerProfilePayload({
    db: params.db,
    env: params.env,
    sport,
    rawPlayerName,
    normalizedPlayerName,
    playerName: rawPlayerName || canonicalName || canonicalPid,
    team: undefined,
    // Use the faster page-data compute profile so document builds consistently
    // complete within request/worker budgets across the full league.
    pageDataMode: true,
    origin: params.origin,
  });

  if (!computed.ok) {
    console.warn("[playerDocuments][build] live_compute_failed", {
      sport,
      playerId: canonicalPid,
      playerName: canonicalName,
      reason: "live_compute_failed",
    });
    return { ok: false, reason: "live_compute_failed" };
  }

  const profile: Record<string, unknown> = {
    player: computed.payload.player,
    gameLog: computed.payload.gameLog,
    seasonAverages: computed.payload.seasonAverages,
    currentProps: computed.payload.currentProps,
    recentPerformance: computed.payload.recentPerformance,
    matchup: computed.payload.matchup,
    liveProps: computed.payload.liveProps,
    propHitRates: computed.payload.propHitRates,
    vsOpponent: computed.payload.vsOpponent,
    health: computed.payload.health,
    news: computed.payload.news,
    lastUpdated: computed.payload.lastUpdated,
  };
  const p = profile.player && typeof profile.player === "object"
    ? { ...(profile.player as Record<string, unknown>) }
    : {};
  p.id = String(p.id || p.espnId || canonicalPid).trim() || canonicalPid;
  p.espnId = String(p.espnId || p.id || canonicalPid).trim() || canonicalPid;
  p.headshotPlayerId = String(p.headshotPlayerId || p.id || canonicalPid).trim() || canonicalPid;
  const hydratedName =
    String(p.displayName || p.name || canonicalName || metaName || canonicalPid).trim()
    || canonicalPid;
  p.displayName = hydratedName;
  p.name = String(p.name || hydratedName).trim() || hydratedName;
  profile.player = p;
  profile.seasonAverages = deriveSeasonAveragesFromGameLog(
    sport,
    profile.gameLog,
    (profile.seasonAverages || {}) as Record<string, unknown>
  );

  const readyEval = evaluatePlayerProfileCoreReadiness(profile as Record<string, unknown>);
  if (readyEval.ready) {
    delete (profile.player as Record<string, unknown>).__documentPending;
  } else {
    (profile.player as Record<string, unknown>).__documentPending = true;
  }

  const c2 = computeDocumentCompleteness(profile as Record<string, unknown>);
  const finalName =
    String((profile.player as { displayName?: string; name?: string })?.displayName || "").trim()
    || String((profile.player as { name?: string })?.name || "").trim()
    || canonicalName
    || metaName;

  const docFull: StoredPlayerDocumentV1 = {
    schemaVersion: 1,
    meta: {
      sport,
      playerName: finalName,
      playerId: canonicalPid,
      partialReason: readyEval.ready ? null : readyEval.reasons.join(","),
      completeness: c2,
    },
    data: {
      profile,
      canonicalTeamRouteId: null,
    },
  };

  await upsertPlayerDocumentV1(
    params.db,
    docFull,
    String(computed.payload.lastUpdated || new Date().toISOString())
  );

  if (!readyEval.ready) {
    console.warn("[playerDocuments][build] readiness_failed", {
      sport,
      playerId: canonicalPid,
      playerName: finalName,
      reasons: readyEval.reasons,
      missingSections: readyEval.missingSections,
    });
    return {
      ok: false,
      reason: readyEval.reasons.join(",") || "readiness_failed",
    };
  }

  return { ok: true, completenessScore: c2.completenessScore };
}
