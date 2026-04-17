import type { D1Database } from "@cloudflare/workers-types";
import { resolveCanonicalPlayerIdentity } from "../playerIdentity/canonicalPlayerResolver";
import { resolveCanonicalPlayerIdFromPayload } from "../../../shared/espnAthleteIdLookup";

export type PlayerResolutionMatchSource =
  | "existing_player_internal_id"
  | "provider_id_direct"
  | "canonical_name_exact"
  | "canonical_name_fuzzy"
  | "alias_exact"
  | "alias_fuzzy"
  | "unresolved";

export type PlayerResolutionResult = {
  player_internal_id: string | null;
  confidence_score: number;
  match_source: PlayerResolutionMatchSource;
};

export type PlayerResolutionMetrics = {
  totalSnapshots: number;
  resolvedPlayers: number;
  unresolvedPlayers: number;
  resolutionRate: number;
};

type CandidateRow = {
  canonical_player_id: string;
  espn_player_id: string | null;
  normalized_name: string | null;
  aliases_json: string | null;
  team_ids_json: string | null;
  provider_ids_json: string | null;
};

function normalizeName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildNameVariants(value: unknown): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const out = new Set<string>();
  out.add(raw);
  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (first && last) out.add(`${first} ${last}`.trim());
  } else {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      out.add(`${parts.slice(1).join(" ")}, ${parts[0]}`.trim());
    }
  }
  return Array.from(out);
}

function readSourcePlayerName(sourcePayloadJson: unknown): string {
  try {
    const payload =
      typeof sourcePayloadJson === "string" ? JSON.parse(sourcePayloadJson) : sourcePayloadJson;
    const candidates = [
      (payload as any)?.playerName,
      (payload as any)?.player_name,
      (payload as any)?.rawPayload?.playerName,
      (payload as any)?.rawPayload?.player_name,
      (payload as any)?.name,
    ];
    for (const c of candidates) {
      const s = String(c || "").trim();
      if (s) return s;
    }
    return "";
  } catch {
    return "";
  }
}

function parseJsonArray(value: unknown): string[] {
  try {
    if (typeof value !== "string" || !value.trim()) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function safeProviderToken(value: unknown): string {
  return String(value || "").trim();
}

function bigramSet(value: string): Set<string> {
  const s = ` ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

function similarityScore(aRaw: string, bRaw: string): number {
  const a = normalizeName(aRaw);
  const b = normalizeName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aSet = bigramSet(a);
  const bSet = bigramSet(b);
  if (!aSet.size || !bSet.size) return 0;
  let overlap = 0;
  for (const token of aSet) if (bSet.has(token)) overlap += 1;
  return (2 * overlap) / (aSet.size + bSet.size);
}

async function ensurePlayerAliasesTable(db: D1Database): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS player_aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, alias_name TEXT NOT NULL, canonical_player_id TEXT, canonical_player_key TEXT NOT NULL DEFAULT '', sport TEXT NOT NULL, confidence_score REAL, source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_player_aliases_unique ON player_aliases(sport, alias_name, canonical_player_key)");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_player_aliases_sport_alias ON player_aliases(sport, alias_name)");
}

async function writeAlias(params: {
  db: D1Database;
  sport: string;
  aliasName: string;
  canonicalPlayerId: string | null;
  confidenceScore: number;
  source: string;
}): Promise<void> {
  const alias = normalizeName(params.aliasName);
  if (!alias) return;
  await ensurePlayerAliasesTable(params.db);
  await params.db
    .prepare(
      `INSERT INTO player_aliases (
         alias_name, canonical_player_id, canonical_player_key, sport, confidence_score, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(sport, alias_name, canonical_player_key) DO UPDATE SET
         confidence_score = MAX(COALESCE(player_aliases.confidence_score, 0), excluded.confidence_score),
         source = excluded.source,
         updated_at = datetime('now')`
    )
    .bind(
      alias,
      params.canonicalPlayerId,
      String(params.canonicalPlayerId || "").trim(),
      params.sport,
      Number.isFinite(params.confidenceScore) ? params.confidenceScore : 0,
      params.source
    )
    .run();
}

function teamBoostScore(teamIdsJson: string | null, teamId: string | null): number {
  const targetTeam = String(teamId || "").trim();
  if (!targetTeam) return 0;
  const teamIds = parseJsonArray(teamIdsJson);
  return teamIds.includes(targetTeam) ? 0.06 : 0;
}

async function resolveByProviderId(params: {
  db: D1Database;
  sport: string;
  providerId: string;
  playerName: string;
}): Promise<PlayerResolutionResult> {
  const providerId = safeProviderToken(params.providerId);
  if (!providerId) return { player_internal_id: null, confidence_score: 0, match_source: "unresolved" };
  const espnCandidate = /^\d{4,}$/.test(providerId) ? providerId : "";
  if (espnCandidate) {
    const direct = await params.db
      .prepare(
        `SELECT canonical_player_id
         FROM canonical_players
         WHERE sport = ? AND espn_player_id = ?
         LIMIT 1`
      )
      .bind(params.sport, espnCandidate)
      .first<{ canonical_player_id: string | null }>();
    const id = String(direct?.canonical_player_id || "").trim();
    if (id) {
      return { player_internal_id: id, confidence_score: 1, match_source: "provider_id_direct" };
    }
    const canonical = await resolveCanonicalPlayerIdentity({
      db: params.db,
      sport: params.sport,
      playerId: espnCandidate,
      playerName: params.playerName || espnCandidate,
      source: "playerResolution.global.provider",
    });
    if (canonical.ok) {
      return {
        player_internal_id: canonical.identity.canonicalPlayerId,
        confidence_score: 1,
        match_source: "provider_id_direct",
      };
    }
  }

  const byProviderMap = await params.db
    .prepare(
      `SELECT canonical_player_id
       FROM canonical_players
       WHERE sport = ? AND provider_ids_json LIKE ?
       LIMIT 1`
    )
    .bind(params.sport, `%${providerId}%`)
    .first<{ canonical_player_id: string | null }>();
  const providerMapped = String(byProviderMap?.canonical_player_id || "").trim();
  if (providerMapped) {
    return {
      player_internal_id: providerMapped,
      confidence_score: 0.98,
      match_source: "provider_id_direct",
    };
  }
  return { player_internal_id: null, confidence_score: 0, match_source: "unresolved" };
}

async function resolveByAliasTable(params: {
  db: D1Database;
  sport: string;
  normalizedName: string;
  teamId: string | null;
}): Promise<PlayerResolutionResult> {
  await ensurePlayerAliasesTable(params.db);
  const exact = await params.db
    .prepare(
      `SELECT canonical_player_id, confidence_score
       FROM player_aliases
       WHERE sport = ? AND alias_name = ? AND canonical_player_id IS NOT NULL
       ORDER BY COALESCE(confidence_score, 0) DESC, id DESC
       LIMIT 1`
    )
    .bind(params.sport, params.normalizedName)
    .first<{ canonical_player_id: string | null; confidence_score: number | null }>();
  const exactId = String(exact?.canonical_player_id || "").trim();
  if (exactId) {
    return {
      player_internal_id: exactId,
      confidence_score: Number(exact?.confidence_score ?? 0.95) || 0.95,
      match_source: "alias_exact",
    };
  }

  const token = params.normalizedName.split(" ").slice(-1)[0] || params.normalizedName;
  const rows = await params.db
    .prepare(
      `SELECT a.alias_name, a.canonical_player_id, a.confidence_score, c.team_ids_json
       FROM player_aliases a
       LEFT JOIN canonical_players c
         ON c.sport = a.sport AND c.canonical_player_id = a.canonical_player_id
       WHERE a.sport = ?
         AND a.alias_name LIKE ?
         AND a.canonical_player_id IS NOT NULL
       LIMIT 100`
    )
    .bind(params.sport, `%${token}%`)
    .all<{
      alias_name: string;
      canonical_player_id: string | null;
      confidence_score: number | null;
      team_ids_json: string | null;
    }>();
  let best: { id: string; score: number } | null = null;
  for (const row of rows.results || []) {
    const id = String(row.canonical_player_id || "").trim();
    if (!id) continue;
    const alias = normalizeName(row.alias_name);
    const similarity = similarityScore(params.normalizedName, alias);
    const score = Math.max(similarity, Number(row.confidence_score || 0.7)) + teamBoostScore(row.team_ids_json, params.teamId);
    if (score < 0.8) continue;
    if (!best || score > best.score) best = { id, score };
  }
  if (!best) return { player_internal_id: null, confidence_score: 0, match_source: "unresolved" };
  return { player_internal_id: best.id, confidence_score: best.score, match_source: "alias_fuzzy" };
}

async function resolveByCanonicalName(params: {
  db: D1Database;
  sport: string;
  normalizedName: string;
  teamId: string | null;
}): Promise<PlayerResolutionResult> {
  const exact = await params.db
    .prepare(
      `SELECT canonical_player_id
       FROM canonical_players
       WHERE sport = ? AND normalized_name = ?
       LIMIT 1`
    )
    .bind(params.sport, params.normalizedName)
    .first<{ canonical_player_id: string | null }>();
  const exactId = String(exact?.canonical_player_id || "").trim();
  if (exactId) {
    return {
      player_internal_id: exactId,
      confidence_score: 0.95,
      match_source: "canonical_name_exact",
    };
  }

  const token = params.normalizedName.split(" ").slice(-1)[0] || params.normalizedName;
  const rows = await params.db
    .prepare(
      `SELECT canonical_player_id, normalized_name, aliases_json, team_ids_json
       FROM canonical_players
       WHERE sport = ?
         AND (
           normalized_name LIKE ?
           OR aliases_json LIKE ?
         )
       LIMIT 120`
    )
    .bind(params.sport, `%${token}%`, `%${token}%`)
    .all<CandidateRow>();
  let best: { id: string; score: number } | null = null;
  for (const row of rows.results || []) {
    const id = String(row.canonical_player_id || "").trim();
    if (!id) continue;
    const canonicalName = normalizeName(row.normalized_name);
    const aliases = parseJsonArray(row.aliases_json).map((a) => normalizeName(a));
    const similarity = Math.max(
      similarityScore(params.normalizedName, canonicalName),
      ...aliases.map((alias) => similarityScore(params.normalizedName, alias)),
      0
    );
    const score = similarity + teamBoostScore(row.team_ids_json, params.teamId);
    if (score < 0.8) continue;
    if (!best || score > best.score) best = { id, score };
  }
  if (!best) return { player_internal_id: null, confidence_score: 0, match_source: "unresolved" };
  return {
    player_internal_id: best.id,
    confidence_score: best.score,
    match_source: "canonical_name_fuzzy",
  };
}

export async function resolvePlayerIdentity(params: {
  db: D1Database;
  sport: string;
  existingPlayerInternalId?: string | null;
  playerProviderId?: string | null;
  playerName?: string | null;
  teamId?: string | null;
  sourcePayloadJson?: string | null;
  cache?: Map<string, PlayerResolutionResult>;
}): Promise<PlayerResolutionResult> {
  const sport = String(params.sport || "").trim().toUpperCase();
  if (!sport) {
    return { player_internal_id: null, confidence_score: 0, match_source: "unresolved" };
  }
  const existing = String(params.existingPlayerInternalId || "").trim();
  if (existing) {
    return {
      player_internal_id: existing,
      confidence_score: 1,
      match_source: "existing_player_internal_id",
    };
  }

  const nameFromPayload = readSourcePlayerName(params.sourcePayloadJson);
  const baseName = String(params.playerName || "").trim() || nameFromPayload;
  const nameVariants = buildNameVariants(baseName);
  const normalizedVariants = Array.from(
    new Set(nameVariants.map((n) => normalizeName(n)).filter(Boolean))
  );
  const providerId = safeProviderToken(params.playerProviderId);
  const teamId = String(params.teamId || "").trim() || null;
  const cache = params.cache;

  const cacheKey = `${sport}|${providerId}|${normalizedVariants.join("|")}|${teamId || ""}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;

  const unresolved = { player_internal_id: null, confidence_score: 0, match_source: "unresolved" as const };
  if (!providerId && normalizedVariants.length === 0) {
    if (cache) cache.set(cacheKey, unresolved);
    return unresolved;
  }

  if (providerId) {
    const direct = await resolveByProviderId({
      db: params.db,
      sport,
      providerId,
      playerName: baseName,
    });
    if (direct.player_internal_id) {
      for (const variant of normalizedVariants) {
        await writeAlias({
          db: params.db,
          sport,
          aliasName: variant,
          canonicalPlayerId: direct.player_internal_id,
          confidenceScore: direct.confidence_score,
          source: "provider_resolution",
        });
      }
      if (cache) cache.set(cacheKey, direct);
      return direct;
    }
  }

  for (const variant of normalizedVariants) {
    const fromAlias = await resolveByAliasTable({
      db: params.db,
      sport,
      normalizedName: variant,
      teamId,
    });
    if (fromAlias.player_internal_id) {
      await writeAlias({
        db: params.db,
        sport,
        aliasName: variant,
        canonicalPlayerId: fromAlias.player_internal_id,
        confidenceScore: fromAlias.confidence_score,
        source: "alias_lookup",
      });
      if (cache) cache.set(cacheKey, fromAlias);
      return fromAlias;
    }
  }

  for (const variant of normalizedVariants) {
    const fromCanonical = await resolveByCanonicalName({
      db: params.db,
      sport,
      normalizedName: variant,
      teamId,
    });
    if (fromCanonical.player_internal_id) {
      await writeAlias({
        db: params.db,
        sport,
        aliasName: variant,
        canonicalPlayerId: fromCanonical.player_internal_id,
        confidenceScore: fromCanonical.confidence_score,
        source: "canonical_lookup",
      });
      if (cache) cache.set(cacheKey, fromCanonical);
      return fromCanonical;
    }
  }

  for (const variant of nameVariants) {
    const inferred = resolveCanonicalPlayerIdFromPayload(variant, sport) || null;
    if (!inferred || !/^\d{4,}$/.test(String(inferred))) continue;
    const canonical = await resolveCanonicalPlayerIdentity({
      db: params.db,
      sport,
      playerId: String(inferred),
      playerName: variant,
      source: "playerResolution.global.inferred",
    });
    if (!canonical.ok) continue;
    const id = canonical.identity.canonicalPlayerId;
    for (const normalized of normalizedVariants) {
      await writeAlias({
        db: params.db,
        sport,
        aliasName: normalized,
        canonicalPlayerId: id,
        confidenceScore: 0.9,
        source: "inferred_espn_map",
      });
    }
    const result: PlayerResolutionResult = {
      player_internal_id: id,
      confidence_score: 0.9,
      match_source: "provider_id_direct",
    };
    if (cache) cache.set(cacheKey, result);
    return result;
  }

  for (const variant of normalizedVariants) {
    await writeAlias({
      db: params.db,
      sport,
      aliasName: variant,
      canonicalPlayerId: null,
      confidenceScore: 0,
      source: "unresolved_observation",
    });
  }
  if (cache) cache.set(cacheKey, unresolved);
  return unresolved;
}

export async function getPlayerResolutionMetrics(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
}): Promise<PlayerResolutionMetrics> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const gameId = String(params.gameId || "").trim();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (sport) {
    where.push("UPPER(COALESCE(sport, '')) = ?");
    binds.push(sport);
  }
  if (gameId) {
    where.push("game_id = ?");
    binds.push(gameId);
  }
  const groupedQuery = `
    WITH grouped AS (
      SELECT
        UPPER(COALESCE(sport, '')) AS sport_key,
        COALESCE(game_id, '') AS game_key,
        COALESCE(event_id, '') AS event_key,
        COALESCE(player_provider_id, '') AS provider_key,
        COALESCE(team_id, '') AS team_key,
        COALESCE(stat_type, '') AS stat_key,
        COALESCE(market_type, '') AS market_key,
        COALESCE(captured_at, '') AS captured_key,
        COALESCE(CAST(line_value AS TEXT), '') AS line_key,
        MAX(CASE WHEN COALESCE(TRIM(player_internal_id), '') <> '' THEN 1 ELSE 0 END) AS has_resolved
      FROM historical_prop_snapshots
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      GROUP BY sport_key, game_key, event_key, provider_key, team_key, stat_key, market_key, captured_key, line_key
    )
    SELECT
      COUNT(*) AS totalSnapshots,
      SUM(has_resolved) AS resolvedPlayers
    FROM grouped
  `;
  const row = await params.db
    .prepare(groupedQuery)
    .bind(...binds)
    .first<{ totalSnapshots: number; resolvedPlayers: number }>();
  const totalSnapshots = Number(row?.totalSnapshots || 0);
  const resolvedPlayers = Number(row?.resolvedPlayers || 0);
  const unresolvedPlayers = Math.max(0, totalSnapshots - resolvedPlayers);
  const resolutionRate = totalSnapshots > 0
    ? Number(((resolvedPlayers / totalSnapshots) * 100).toFixed(2))
    : 0;
  return {
    totalSnapshots,
    resolvedPlayers,
    unresolvedPlayers,
    resolutionRate,
  };
}

export async function backfillSnapshotPlayerIdentities(params: {
  db: D1Database;
  sport?: string;
  batchSize?: number;
}): Promise<{
  totalSnapshots: number;
  attempted: number;
  updated: number;
  unresolved: number;
  resolutionRate: number;
}> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const batchSize = Math.max(100, Math.min(Number(params.batchSize || 8000), 50000));
  const where: string[] = ["COALESCE(TRIM(player_internal_id), '') = ''"];
  const binds: unknown[] = [];
  if (sport) {
    where.push("UPPER(COALESCE(sport, '')) = ?");
    binds.push(sport);
  }
  const rows = await params.db
    .prepare(
      `SELECT
         id, sport, league, event_id, game_id, player_internal_id, player_provider_id,
         team_id, opponent_team_id, stat_type, market_type, line_value, over_price, under_price,
         sportsbook, captured_at, game_start_time, source_payload_json, status
       FROM historical_prop_snapshots
       WHERE ${where.join(" AND ")}
       ORDER BY id DESC
       LIMIT ?`
    )
    .bind(...binds, batchSize)
    .all<{
      id: number;
      sport: string | null;
      league: string | null;
      event_id: string | null;
      game_id: string | null;
      player_internal_id: string | null;
      player_provider_id: string | null;
      team_id: string | null;
      opponent_team_id: string | null;
      stat_type: string | null;
      market_type: string | null;
      line_value: number | null;
      over_price: number | null;
      under_price: number | null;
      sportsbook: string | null;
      captured_at: string | null;
      game_start_time: string | null;
      source_payload_json: string | null;
      status: string | null;
    }>();

  const cache = new Map<string, PlayerResolutionResult>();
  let updated = 0;
  let unresolved = 0;
  for (const row of rows.results || []) {
    const resolved = await resolvePlayerIdentity({
      db: params.db,
      sport: String(row.sport || ""),
      existingPlayerInternalId: row.player_internal_id,
      playerProviderId: row.player_provider_id,
      teamId: row.team_id,
      sourcePayloadJson: row.source_payload_json,
      cache,
    });
    if (!resolved.player_internal_id) {
      unresolved += 1;
      continue;
    }
    const duplicate = await params.db
      .prepare(
        `SELECT id
         FROM historical_prop_snapshots
         WHERE sport = ?
           AND COALESCE(game_id, '') = COALESCE(?, '')
           AND COALESCE(event_id, '') = COALESCE(?, '')
           AND COALESCE(player_provider_id, '') = COALESCE(?, '')
           AND COALESCE(stat_type, '') = COALESCE(?, '')
           AND COALESCE(captured_at, '') = COALESCE(?, '')
           AND COALESCE(line_value, -999999) = COALESCE(?, -999999)
           AND COALESCE(player_internal_id, '') = ?
         LIMIT 1`
      )
      .bind(
        row.sport,
        row.game_id,
        row.event_id,
        row.player_provider_id,
        row.stat_type,
        row.captured_at,
        row.line_value,
        resolved.player_internal_id
      )
      .first<{ id: number | null }>();
    if (duplicate?.id) continue;
    await params.db
      .prepare(
        `INSERT INTO historical_prop_snapshots (
          sport, league, event_id, game_id, player_internal_id, player_provider_id,
          team_id, opponent_team_id, stat_type, market_type, line_value, over_price, under_price,
          sportsbook, captured_at, game_start_time, source_payload_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        row.sport,
        row.league,
        row.event_id,
        row.game_id,
        resolved.player_internal_id,
        row.player_provider_id,
        row.team_id,
        row.opponent_team_id,
        row.stat_type,
        row.market_type,
        row.line_value,
        row.over_price,
        row.under_price,
        row.sportsbook,
        row.captured_at,
        row.game_start_time,
        row.source_payload_json,
        row.status || "captured"
      )
      .run();
    updated += 1;
  }
  const metrics = await getPlayerResolutionMetrics({
    db: params.db,
    sport: sport || undefined,
  });
  return {
    totalSnapshots: metrics.totalSnapshots,
    attempted: (rows.results || []).length,
    updated,
    unresolved,
    resolutionRate: metrics.resolutionRate,
  };
}
