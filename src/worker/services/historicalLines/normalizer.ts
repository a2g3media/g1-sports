import type { D1Database } from "@cloudflare/workers-types";
import {
  normalizeHistoricalSport,
  normalizeHistoricalStatType,
  type HistoricalSportKey,
  type HistoricalStatType,
} from "../../../shared/historicalStatTypeRegistry";
import { resolvePlayerIdentity } from "../playerResolution/globalResolver";

export interface RawHistoricalPropInput {
  sport: string;
  league?: string | null;
  provider?: string | null;
  eventId?: string | null;
  gameId?: string | null;
  gameStartTime?: string | null;
  playerName?: string | null;
  playerProviderId?: string | null;
  teamName?: string | null;
  opponentTeamName?: string | null;
  teamProviderId?: string | null;
  opponentTeamProviderId?: string | null;
  statType?: string | null;
  marketType?: string | null;
  lineValue?: number | string | null;
  overPrice?: number | string | null;
  underPrice?: number | string | null;
  sportsbook?: string | null;
  capturedAt?: string | null;
  rawPayload?: unknown;
}

export interface CanonicalHistoricalSnapshotInput {
  sport: HistoricalSportKey;
  league: string | null;
  eventId: string | null;
  gameId: string | null;
  playerInternalId: string | null;
  playerProviderId: string | null;
  teamId: string | null;
  opponentTeamId: string | null;
  statType: HistoricalStatType;
  marketType: string;
  lineValue: number;
  overPrice: number | null;
  underPrice: number | null;
  sportsbook: string | null;
  capturedAt: string;
  gameStartTime: string | null;
  sourcePayloadJson: string;
  status: "captured" | "invalid";
}

function normalizeNameToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

async function upsertCanonicalTeam(params: {
  db: D1Database;
  sport: HistoricalSportKey;
  league: string | null;
  teamName: string | null;
  providerTeamId: string | null;
}): Promise<string | null> {
  const displayName = String(params.teamName || "").trim();
  const providerTeamId = String(params.providerTeamId || "").trim();
  if (!displayName && !providerTeamId) return null;
  const normalizedName = normalizeNameToken(displayName || providerTeamId);
  const id = `${params.sport.toLowerCase()}:team:${providerTeamId || normalizedName}`;
  try {
    await params.db.prepare(
      `INSERT INTO canonical_teams (
         id, sport, league, provider_team_id, display_name, normalized_name, aliases_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, '[]', datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         league = excluded.league,
         provider_team_id = COALESCE(excluded.provider_team_id, canonical_teams.provider_team_id),
         display_name = COALESCE(NULLIF(excluded.display_name, ''), canonical_teams.display_name),
         normalized_name = COALESCE(NULLIF(excluded.normalized_name, ''), canonical_teams.normalized_name),
         updated_at = datetime('now')`
    )
      .bind(
        id,
        params.sport,
        params.league,
        providerTeamId || null,
        displayName || providerTeamId,
        normalizedName
      )
      .run();
    return id;
  } catch {
    return null;
  }
}

async function upsertCanonicalGame(params: {
  db: D1Database;
  sport: HistoricalSportKey;
  league: string | null;
  providerEventId: string | null;
  providerGameId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startTime: string | null;
}): Promise<string | null> {
  const providerEventId = String(params.providerEventId || "").trim();
  const providerGameId = String(params.providerGameId || "").trim();
  const syntheticKey = providerGameId || providerEventId;
  if (!syntheticKey) return null;
  const id = `${params.sport.toLowerCase()}:game:${syntheticKey}`;
  try {
    await params.db.prepare(
      `INSERT INTO canonical_games (
         id, sport, league, provider_event_id, provider_game_id, home_team_id, away_team_id, start_time, status, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', '{}', datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         league = excluded.league,
         provider_event_id = COALESCE(excluded.provider_event_id, canonical_games.provider_event_id),
         provider_game_id = COALESCE(excluded.provider_game_id, canonical_games.provider_game_id),
         home_team_id = COALESCE(excluded.home_team_id, canonical_games.home_team_id),
         away_team_id = COALESCE(excluded.away_team_id, canonical_games.away_team_id),
         start_time = COALESCE(excluded.start_time, canonical_games.start_time),
         updated_at = datetime('now')`
    )
      .bind(
        id,
        params.sport,
        params.league,
        providerEventId || null,
        providerGameId || null,
        params.homeTeamId,
        params.awayTeamId,
        params.startTime
      )
      .run();
    return id;
  } catch {
    return null;
  }
}

async function resolveGameByTeamsAndTime(params: {
  db: D1Database;
  sport: HistoricalSportKey;
  teamId: string | null;
  opponentTeamId: string | null;
  gameStartTime: string | null;
}): Promise<string | null> {
  const gameStartTime = String(params.gameStartTime || "").trim();
  if (!params.teamId || !params.opponentTeamId || !gameStartTime) return null;
  const candidate = await params.db.prepare(
    `SELECT id
     FROM canonical_games
     WHERE sport = ?
       AND datetime(start_time) BETWEEN datetime(?, '-2 hours') AND datetime(?, '+2 hours')
       AND (
         (home_team_id = ? AND away_team_id = ?)
         OR (home_team_id = ? AND away_team_id = ?)
       )
     ORDER BY ABS(strftime('%s', start_time) - strftime('%s', ?)) ASC
     LIMIT 1`
  )
    .bind(
      params.sport,
      gameStartTime,
      gameStartTime,
      params.teamId,
      params.opponentTeamId,
      params.opponentTeamId,
      params.teamId,
      gameStartTime,
      gameStartTime
    )
    .first<{ id: string | null }>();
  return String(candidate?.id || "").trim() || null;
}

async function resolvePlayerInternalIdWithFallback(params: {
  db: D1Database;
  sport: HistoricalSportKey;
  playerProviderId: string | null;
  playerName: string | null;
  teamId: string | null;
  source: string;
}): Promise<string | null> {
  const resolved = await resolvePlayerIdentity({
    db: params.db,
    sport: String(params.sport || "").toUpperCase(),
    playerProviderId: params.playerProviderId,
    playerName: params.playerName,
    teamId: params.teamId,
  });
  if (!resolved.player_internal_id && params.playerName) {
    console.warn("[historicalLines] unmatched player during normalization", {
      sport: params.sport,
      playerName: params.playerName,
      source: params.source,
      teamId: params.teamId,
    });
  }
  return resolved.player_internal_id;
}

export async function normalizeHistoricalPropInput(
  db: D1Database,
  raw: RawHistoricalPropInput
): Promise<CanonicalHistoricalSnapshotInput | null> {
  const sport = normalizeHistoricalSport(raw.sport);
  if (!sport) return null;

  const statType = normalizeHistoricalStatType({
    sport,
    statType: raw.statType,
    marketType: raw.marketType,
  });
  if (!statType) return null;

  const lineValue = readFiniteNumber(raw.lineValue);
  if (lineValue === null) return null;

  const overPrice = readFiniteNumber(raw.overPrice);
  const underPrice = readFiniteNumber(raw.underPrice);
  const league = String(raw.league || "").trim() || null;
  const playerProviderId = String(raw.playerProviderId || "").trim() || null;
  const playerName = String(raw.playerName || "").trim() || null;

  const teamId = await upsertCanonicalTeam({
    db,
    sport,
    league,
    teamName: raw.teamName || null,
    providerTeamId: raw.teamProviderId || null,
  });
  const opponentTeamId = await upsertCanonicalTeam({
    db,
    sport,
    league,
    teamName: raw.opponentTeamName || null,
    providerTeamId: raw.opponentTeamProviderId || null,
  });

  const gameId = await upsertCanonicalGame({
    db,
    sport,
    league,
    providerEventId: raw.eventId || null,
    providerGameId: raw.gameId || null,
    homeTeamId: teamId,
    awayTeamId: opponentTeamId,
    startTime: String(raw.gameStartTime || "").trim() || null,
  });
  const resolvedGameId =
    gameId ||
    (await resolveGameByTeamsAndTime({
      db,
      sport,
      teamId,
      opponentTeamId,
      gameStartTime: String(raw.gameStartTime || "").trim() || null,
    }));

  const playerInternalId = await resolvePlayerInternalIdWithFallback({
    db,
    sport,
    playerProviderId,
    playerName,
    teamId,
    source: "historicalLines.normalizer",
  });
  if (!playerInternalId && playerName) {
    console.warn("[historicalLines] unmatched player during normalization", {
      sport,
      playerName,
      gameId: raw.gameId || raw.eventId || null,
      team: raw.teamName || null,
    });
  }

  const capturedAt = String(raw.capturedAt || "").trim() || new Date().toISOString();
  const marketType = String(raw.marketType || raw.statType || statType).trim() || String(statType);

  return {
    sport,
    league,
    eventId: String(raw.eventId || "").trim() || null,
    gameId: resolvedGameId,
    playerInternalId,
    playerProviderId,
    teamId,
    opponentTeamId,
    statType,
    marketType,
    lineValue,
    overPrice,
    underPrice,
    sportsbook: String(raw.sportsbook || "").trim() || null,
    capturedAt,
    gameStartTime: String(raw.gameStartTime || "").trim() || null,
    sourcePayloadJson: safeJson(raw.rawPayload ?? raw),
    status: "captured",
  };
}
