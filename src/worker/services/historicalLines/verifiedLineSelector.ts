import type { D1Database } from "@cloudflare/workers-types";
import {
  getPlayerResolutionMetrics,
  resolvePlayerIdentity,
  type PlayerResolutionResult,
} from "../playerResolution/globalResolver";
import { getHistoricalTimingPolicy } from "./timingPolicy";

export type VerifiedLineLockResult = {
  candidates: number;
  strictCandidates: number;
  expandedCandidates: number;
  insertedOrUpdated: number;
  strictInsertedOrUpdated: number;
  expandedInsertedOrUpdated: number;
  errors: number;
  blocked: boolean;
  blockedReason?: string;
  resolutionMetrics?: {
    totalSnapshots: number;
    resolvedPlayers: number;
    unresolvedPlayers: number;
    resolutionRate: number;
  };
  debugSummary?: SelectorDebugSummary;
};

type SnapshotRow = {
  id: number;
  sport: string | null;
  league: string | null;
  event_id: string | null;
  game_id: string | null;
  player_internal_id: string | null;
  player_provider_id: string | null;
  team_id: string | null;
  stat_type: string | null;
  line_value: number | null;
  over_price: number | null;
  under_price: number | null;
  sportsbook: string | null;
  source_payload_json: string | null;
  captured_at: string | null;
  game_start_time: string | null;
};

type CanonicalGameRow = {
  id: string;
  provider_event_id: string | null;
  provider_game_id: string | null;
  start_time: string | null;
};

type ValidatedSnapshot = {
  row: SnapshotRow;
  canonicalGameId: string;
  effectiveGameStartTime: string;
};

export type SelectorDebugSummary = {
  totalSnapshotsStored: number;
  totalSnapshotsPregame: number;
  totalSnapshotsPostgame: number;
  totalEligibleForVerified: number;
  totalSnapshotsChecked: number;
  missingGameId: number;
  missingPlayerId: number;
  missingStatType: number;
  missingLineValue: number;
  afterGameStart: number;
  noGameStartFound: number;
  invalidGameMapping: number;
  validCandidates: number;
  strictCandidates: number;
  expandedCandidates: number;
  fallbackCandidates: number;
  sportPolicyUsed: string;
  strictWindowMinutes: number;
  expandedWindowMinutes: number;
  strictAvgDistanceMinutes: number;
  expandedAvgDistanceMinutes: number;
  fallbackAvgDistanceMinutes: number;
  strictCoverage: number;
  expandedCoverage: number;
};

type ValidationOutcome =
  | { valid: true; value: ValidatedSnapshot & { capturedAtMs: number; gameStartMs: number } }
  | {
      valid: false;
      reason:
        | "missing_game_id"
        | "missing_player_id"
        | "missing_stat_type"
        | "missing_line_value"
        | "no_game_start_found"
        | "after_game_start"
        | "invalid_game_mapping";
    };

type SelectedCandidate = {
  row: SnapshotRow;
  canonicalGameId: string;
  snapshotRuleUsed?: string;
  timingDistanceMinutes?: number;
};

function toIsoOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function hasFiniteLine(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n);
}

async function resolvePlayerInternalIdForSnapshot(params: {
  db: D1Database;
  row: SnapshotRow;
  cache: Map<string, PlayerResolutionResult>;
}): Promise<string | null> {
  const resolved = await resolvePlayerIdentity({
    db: params.db,
    sport: String(params.row.sport || "").toUpperCase(),
    existingPlayerInternalId: params.row.player_internal_id,
    playerProviderId: params.row.player_provider_id,
    teamId: params.row.team_id,
    sourcePayloadJson: params.row.source_payload_json,
    cache: params.cache,
  });
  return resolved.player_internal_id;
}

function extractProviderGameToken(gameId: string): string {
  const s = String(gameId || "").trim();
  const marker = ":game:";
  const idx = s.indexOf(marker);
  if (idx >= 0) return s.slice(idx + marker.length);
  return s;
}

function buildSelectorDebugSummary(): SelectorDebugSummary {
  return {
    totalSnapshotsStored: 0,
    totalSnapshotsPregame: 0,
    totalSnapshotsPostgame: 0,
    totalEligibleForVerified: 0,
    totalSnapshotsChecked: 0,
    missingGameId: 0,
    missingPlayerId: 0,
    missingStatType: 0,
    missingLineValue: 0,
    afterGameStart: 0,
    noGameStartFound: 0,
    invalidGameMapping: 0,
    validCandidates: 0,
    strictCandidates: 0,
    expandedCandidates: 0,
    fallbackCandidates: 0,
    sportPolicyUsed: "UNKNOWN",
    strictWindowMinutes: 0,
    expandedWindowMinutes: 0,
    strictAvgDistanceMinutes: 0,
    expandedAvgDistanceMinutes: 0,
    fallbackAvgDistanceMinutes: 0,
    strictCoverage: 0,
    expandedCoverage: 0,
  };
}

export function isValidSnapshot(params: {
  row: SnapshotRow;
  canonicalById: Map<string, CanonicalGameRow>;
  canonicalByProviderId: Map<string, CanonicalGameRow>;
}): ValidationOutcome {
  const row = params.row;
  const gameId = String(row.game_id || "").trim();
  if (!gameId) return { valid: false, reason: "missing_game_id" };
  const playerInternalId = String(row.player_internal_id || "").trim();
  if (!playerInternalId) return { valid: false, reason: "missing_player_id" };
  const statType = String(row.stat_type || "").trim();
  if (!statType) return { valid: false, reason: "missing_stat_type" };
  if (!hasFiniteLine(row.line_value)) return { valid: false, reason: "missing_line_value" };

  const directGame = params.canonicalById.get(gameId) || null;
  const providerToken = extractProviderGameToken(gameId);
  const providerGame = params.canonicalByProviderId.get(providerToken) || null;
  const mappedGame = directGame || providerGame;
  if (!mappedGame) {
    return { valid: false, reason: "invalid_game_mapping" };
  }
  const effectiveGameStartTime =
    toIsoOrNull(row.game_start_time) ||
    toIsoOrNull(mappedGame.start_time);
  if (!effectiveGameStartTime) {
    return { valid: false, reason: "no_game_start_found" };
  }
  const capturedAt = toIsoOrNull(row.captured_at);
  if (!capturedAt) return { valid: false, reason: "after_game_start" };
  const capturedAtMs = new Date(capturedAt).getTime();
  const gameStartMs = new Date(effectiveGameStartTime).getTime();
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(gameStartMs)) {
    return { valid: false, reason: "after_game_start" };
  }
  return {
    valid: true,
    value: {
      row,
      canonicalGameId: mappedGame.id,
      effectiveGameStartTime,
      capturedAtMs,
      gameStartMs,
    },
  };
}

async function computeSelectorCandidates(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
  verbose?: boolean;
}): Promise<{
  strictSelected: SelectedCandidate[];
  expandedSelected: SelectedCandidate[];
  summary: SelectorDebugSummary;
}> {
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
  const sql = `
    SELECT
      id, sport, league, event_id, game_id, player_internal_id, player_provider_id, team_id, stat_type, line_value,
      over_price, under_price, sportsbook, source_payload_json, captured_at, game_start_time
    FROM historical_prop_snapshots
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY datetime(captured_at) DESC, id DESC
  `;
  const snapshots = await params.db.prepare(sql).bind(...binds).all<SnapshotRow>();
  const allRows = snapshots.results || [];
  const summary = buildSelectorDebugSummary();
  summary.totalSnapshotsStored = allRows.length;
  summary.sportPolicyUsed = sport || "MIXED";
  const resolvedPlayerCache = new Map<string, PlayerResolutionResult>();

  const gameRows = await params.db.prepare(`
    SELECT id, provider_event_id, provider_game_id, start_time
    FROM canonical_games
    ${sport ? "WHERE UPPER(COALESCE(sport, '')) = ?" : ""}
  `).bind(...(sport ? [sport] : [])).all<CanonicalGameRow>();
  const canonicalById = new Map<string, CanonicalGameRow>();
  const canonicalByProviderId = new Map<string, CanonicalGameRow>();
  for (const row of gameRows.results || []) {
    const id = String(row.id || "").trim();
    if (id) canonicalById.set(id, row);
    const providerGameId = String(row.provider_game_id || "").trim();
    if (providerGameId) canonicalByProviderId.set(providerGameId, row);
    const providerEventId = String(row.provider_event_id || "").trim();
    if (providerEventId) canonicalByProviderId.set(providerEventId, row);
  }

  const strictByKey = new Map<string, { row: SnapshotRow; canonicalGameId: string; capturedAtMs: number; distanceToStartMs: number }>();
  const expandedWindowByKey = new Map<string, { row: SnapshotRow; canonicalGameId: string; distanceToStartMs: number }>();
  const displayFallbackByKey = new Map<string, { row: SnapshotRow; canonicalGameId: string; distanceToStartMs: number }>();
  const playersInSnapshots = new Set<string>();
  for (const rawRow of allRows) {
    const capturedAtIso = toIsoOrNull(rawRow.captured_at);
    const gameStartIso = toIsoOrNull(rawRow.game_start_time);
    if (capturedAtIso && gameStartIso) {
      const capturedAtMs = new Date(capturedAtIso).getTime();
      const gameStartMs = new Date(gameStartIso).getTime();
      if (capturedAtMs < gameStartMs) summary.totalSnapshotsPregame += 1;
      else summary.totalSnapshotsPostgame += 1;
    }
    const resolvedPlayerInternalId = await resolvePlayerInternalIdForSnapshot({
      db: params.db,
      row: rawRow,
      cache: resolvedPlayerCache,
    });
    const row: SnapshotRow = {
      ...rawRow,
      player_internal_id: resolvedPlayerInternalId || rawRow.player_internal_id,
    };
    const snapshotPlayerId = String(row.player_internal_id || "").trim();
    if (snapshotPlayerId) playersInSnapshots.add(snapshotPlayerId);
    summary.totalSnapshotsChecked += 1;
    const outcome = isValidSnapshot({
      row,
      canonicalById,
      canonicalByProviderId,
    });
    if (!outcome.valid) {
      const reason = "reason" in outcome ? outcome.reason : "invalid_game_mapping";
      if (reason === "missing_game_id") summary.missingGameId += 1;
      if (reason === "missing_player_id") summary.missingPlayerId += 1;
      if (reason === "missing_stat_type") summary.missingStatType += 1;
      if (reason === "missing_line_value") summary.missingLineValue += 1;
      if (reason === "after_game_start") summary.afterGameStart += 1;
      if (reason === "no_game_start_found") summary.noGameStartFound += 1;
      if (reason === "invalid_game_mapping") summary.invalidGameMapping += 1;
      if (params.verbose) {
        console.log("[historicalLines] selector rejected snapshot", {
          snapshotId: row.id,
          sport: row.sport,
          gameId: row.game_id,
          playerInternalId: row.player_internal_id,
          statType: row.stat_type,
          reason,
        });
      }
      continue;
    }
    const rowSport = String(outcome.value.row.sport || sport || "").toUpperCase();
    const policy = getHistoricalTimingPolicy(rowSport);
    if (sport) {
      summary.sportPolicyUsed = policy.sport;
      summary.strictWindowMinutes = 0;
      summary.expandedWindowMinutes = policy.expandedWindowMinutes;
    }
    const withinPregame = outcome.value.capturedAtMs < outcome.value.gameStartMs;
    const withinExpandedWindow =
      policy.expandedEnabled
      && outcome.value.capturedAtMs >= outcome.value.gameStartMs
      && outcome.value.capturedAtMs <= outcome.value.gameStartMs + (policy.expandedWindowMinutes * 60 * 1000);
    const distanceToStartMs = Math.abs(outcome.value.capturedAtMs - outcome.value.gameStartMs);
    summary.totalEligibleForVerified += 1;
    const playerInternalId = String(outcome.value.row.player_internal_id || "").trim();
    const statType = String(outcome.value.row.stat_type || "").trim().toLowerCase();
    const groupKey = `${String(outcome.value.row.sport || "").toUpperCase()}::${outcome.value.canonicalGameId}::${playerInternalId}::${statType}`;
    const capturedAtMs = outcome.value.capturedAtMs;
    if (withinPregame) {
      const existing = strictByKey.get(groupKey);
      if (!existing || capturedAtMs > existing.capturedAtMs) {
        strictByKey.set(groupKey, {
          row: outcome.value.row,
          canonicalGameId: outcome.value.canonicalGameId,
          capturedAtMs,
          distanceToStartMs,
        });
      }
    } else if (withinExpandedWindow) {
      const existingWindow = expandedWindowByKey.get(groupKey);
      if (!existingWindow || distanceToStartMs < existingWindow.distanceToStartMs) {
        expandedWindowByKey.set(groupKey, {
          row: outcome.value.row,
          canonicalGameId: outcome.value.canonicalGameId,
          distanceToStartMs,
        });
      }
    }
    const fallbackWindowMs = policy.displayFallbackWindowMinutes * 60 * 1000;
    if (fallbackWindowMs > 0 && distanceToStartMs <= fallbackWindowMs) {
      const existingFallback = displayFallbackByKey.get(groupKey);
      if (!existingFallback || distanceToStartMs < existingFallback.distanceToStartMs) {
        displayFallbackByKey.set(groupKey, {
          row: outcome.value.row,
          canonicalGameId: outcome.value.canonicalGameId,
          distanceToStartMs,
        });
      }
    }
  }
  const strictSelected = Array.from(strictByKey.values()).map((v) => ({
    row: v.row,
    canonicalGameId: v.canonicalGameId,
    snapshotRuleUsed: "latest_valid_snapshot_before_game_start",
    timingDistanceMinutes: Number((v.distanceToStartMs / 60000).toFixed(2)),
  }));
  const expandedByKey = new Map<string, SelectedCandidate>();
  for (const [k, v] of strictByKey.entries()) {
    expandedByKey.set(k, {
      row: v.row,
      canonicalGameId: v.canonicalGameId,
      snapshotRuleUsed: "latest_valid_snapshot_before_game_start",
      timingDistanceMinutes: Number((v.distanceToStartMs / 60000).toFixed(2)),
    });
  }
  for (const [k, v] of expandedWindowByKey.entries()) {
    if (!expandedByKey.has(k)) {
      expandedByKey.set(k, {
        row: v.row,
        canonicalGameId: v.canonicalGameId,
        snapshotRuleUsed: "closest_snapshot_within_policy_window",
        timingDistanceMinutes: Number((v.distanceToStartMs / 60000).toFixed(2)),
      });
    }
  }
  let fallbackCandidates = 0;
  let fallbackDistanceTotal = 0;
  for (const [k, v] of displayFallbackByKey.entries()) {
    if (!expandedByKey.has(k)) {
      fallbackCandidates += 1;
      fallbackDistanceTotal += v.distanceToStartMs;
    }
  }
  const expandedSelected = Array.from(expandedByKey.values());
  summary.validCandidates = strictSelected.length;
  summary.strictCandidates = strictSelected.length;
  summary.expandedCandidates = expandedSelected.length;
  summary.fallbackCandidates = fallbackCandidates;
  const strictDistanceTotal = strictSelected.reduce((sum, item) => sum + (Number(item.timingDistanceMinutes || 0) * 60000), 0);
  const expandedOnly = expandedSelected.filter((item) => item.snapshotRuleUsed === "closest_snapshot_within_policy_window");
  const expandedDistanceTotal = expandedOnly.reduce((sum, item) => sum + (Number(item.timingDistanceMinutes || 0) * 60000), 0);
  summary.strictAvgDistanceMinutes = strictSelected.length > 0
    ? Number(((strictDistanceTotal / strictSelected.length) / 60000).toFixed(2))
    : 0;
  summary.expandedAvgDistanceMinutes = expandedOnly.length > 0
    ? Number(((expandedDistanceTotal / expandedOnly.length) / 60000).toFixed(2))
    : 0;
  summary.fallbackAvgDistanceMinutes = fallbackCandidates > 0
    ? Number(((fallbackDistanceTotal / fallbackCandidates) / 60000).toFixed(2))
    : 0;
  const totalPlayers = playersInSnapshots.size;
  const strictPlayers = new Set(strictSelected.map((c) => String(c.row.player_internal_id || "").trim())).size;
  const expandedPlayers = new Set(expandedSelected.map((c) => String(c.row.player_internal_id || "").trim())).size;
  summary.strictCoverage = totalPlayers > 0 ? Number(((strictPlayers / totalPlayers) * 100).toFixed(2)) : 0;
  summary.expandedCoverage = totalPlayers > 0 ? Number(((expandedPlayers / totalPlayers) * 100).toFixed(2)) : 0;
  return { strictSelected, expandedSelected, summary };
}

export async function lockVerifiedHistoricalLines(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
}): Promise<VerifiedLineLockResult> {
  const resolutionMetrics = await getPlayerResolutionMetrics({
    db: params.db,
    sport: params.sport,
    gameId: params.gameId,
  });
  if (resolutionMetrics.resolutionRate < 90) {
    console.error("[historicalLines] selector blocked: resolution rate below threshold", {
      sport: params.sport || null,
      gameId: params.gameId || null,
      resolutionRate: resolutionMetrics.resolutionRate,
      threshold: 90,
    });
    return {
      candidates: 0,
      strictCandidates: 0,
      expandedCandidates: 0,
      insertedOrUpdated: 0,
      strictInsertedOrUpdated: 0,
      expandedInsertedOrUpdated: 0,
      errors: 0,
      blocked: true,
      blockedReason: "player_resolution_below_threshold",
      resolutionMetrics,
      debugSummary: buildSelectorDebugSummary(),
    };
  }
  const computed = await computeSelectorCandidates({
    db: params.db,
    sport: params.sport,
    gameId: params.gameId,
  });
  const upsertRows = async (
    tableName: "historical_verified_lines" | "historical_verified_lines_strict" | "historical_verified_lines_expanded",
    candidates: SelectedCandidate[],
    rule: string
  ): Promise<{ insertedOrUpdated: number; errors: number }> => {
    let insertedOrUpdated = 0;
    let errors = 0;
    for (const candidate of candidates) {
      const row = candidate.row;
      try {
        await params.db
          .prepare(
            `INSERT INTO ${tableName} (
              sport, league, game_id, player_internal_id, stat_type,
              verified_line_value, over_price, under_price, sportsbook,
              selected_snapshot_id, snapshot_rule_used, locked_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
            ON CONFLICT(sport, game_id, player_internal_id, stat_type) DO UPDATE SET
              league = excluded.league,
              verified_line_value = excluded.verified_line_value,
              over_price = excluded.over_price,
              under_price = excluded.under_price,
              sportsbook = excluded.sportsbook,
              selected_snapshot_id = excluded.selected_snapshot_id,
              snapshot_rule_used = excluded.snapshot_rule_used,
              locked_at = datetime('now'),
              updated_at = datetime('now')`
          )
          .bind(
            String(row.sport || "").toUpperCase(),
            row.league,
            candidate.canonicalGameId,
            row.player_internal_id,
            String(row.stat_type || "").toLowerCase(),
            row.line_value,
            row.over_price,
            row.under_price,
            row.sportsbook,
            row.id,
            candidate.snapshotRuleUsed || rule
          )
          .run();
        insertedOrUpdated += 1;
      } catch (error) {
        errors += 1;
        console.error("[historicalLines] verified lock upsert failed", {
          tableName,
          sport: row.sport,
          gameId: row.game_id,
          playerInternalId: row.player_internal_id,
          statType: row.stat_type,
          error,
        });
      }
    }
    return { insertedOrUpdated, errors };
  };

  const strict = await upsertRows(
    "historical_verified_lines_strict",
    computed.strictSelected,
    "latest_valid_snapshot_before_game_start"
  );
  const expanded = await upsertRows(
    "historical_verified_lines_expanded",
    computed.expandedSelected,
    "strict_or_closest_within_policy_window"
  );
  // Keep legacy table populated from strict for compatibility.
  const legacy = await upsertRows(
    "historical_verified_lines",
    computed.strictSelected,
    "latest_valid_snapshot_before_game_start"
  );

  return {
    candidates: computed.strictSelected.length,
    strictCandidates: computed.strictSelected.length,
    expandedCandidates: computed.expandedSelected.length,
    insertedOrUpdated: strict.insertedOrUpdated,
    strictInsertedOrUpdated: strict.insertedOrUpdated,
    expandedInsertedOrUpdated: expanded.insertedOrUpdated,
    errors: strict.errors + expanded.errors + legacy.errors,
    blocked: false,
    resolutionMetrics,
    debugSummary: computed.summary,
  };
}

export async function debugVerifiedSelector(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
  verbose?: boolean;
}): Promise<{
  strictCandidates: number;
  expandedCandidates: number;
  fallbackCandidates: number;
  strictCoverage: number;
  expandedCoverage: number;
  totalSnapshots: number;
  resolvedPlayers: number;
  unresolvedPlayers: number;
  resolutionRate: number;
  summary: SelectorDebugSummary;
}> {
  const computed = await computeSelectorCandidates(params);
  const resolutionMetrics = await getPlayerResolutionMetrics({
    db: params.db,
    sport: params.sport,
    gameId: params.gameId,
  });
  return {
    strictCandidates: computed.summary.strictCandidates,
    expandedCandidates: computed.summary.expandedCandidates,
    fallbackCandidates: computed.summary.fallbackCandidates,
    strictCoverage: computed.summary.strictCoverage,
    expandedCoverage: computed.summary.expandedCoverage,
    totalSnapshots: resolutionMetrics.totalSnapshots,
    resolvedPlayers: resolutionMetrics.resolvedPlayers,
    unresolvedPlayers: resolutionMetrics.unresolvedPlayers,
    resolutionRate: resolutionMetrics.resolutionRate,
    summary: computed.summary,
  };
}

export async function debugVerifiedPipeline(params: {
  db: D1Database;
  sport?: string;
}): Promise<{
  snapshotCount: number;
  validSnapshots: number;
  strictCandidatesFound: number;
  expandedCandidatesFound: number;
  fallbackCandidatesFound: number;
  strictVerifiedLinesInserted: number;
  expandedVerifiedLinesInserted: number;
  resolutionMetrics: {
    totalSnapshots: number;
    resolvedPlayers: number;
    unresolvedPlayers: number;
    resolutionRate: number;
  };
  summary: SelectorDebugSummary;
}> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const snapshotCountRow = await params.db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM historical_prop_snapshots
       ${sport ? "WHERE UPPER(COALESCE(sport, '')) = ?" : ""}`
    )
    .bind(...(sport ? [sport] : []))
    .first<{ c: number }>();
  const computed = await computeSelectorCandidates({
    db: params.db,
    sport: sport || undefined,
  });
  const strictVerified = await params.db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM historical_verified_lines_strict
       ${sport ? "WHERE UPPER(COALESCE(sport, '')) = ?" : ""}`
    )
    .bind(...(sport ? [sport] : []))
    .first<{ c: number }>();
  const expandedVerified = await params.db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM historical_verified_lines_expanded
       ${sport ? "WHERE UPPER(COALESCE(sport, '')) = ?" : ""}`
    )
    .bind(...(sport ? [sport] : []))
    .first<{ c: number }>();
  return {
    snapshotCount: Number(snapshotCountRow?.c || 0),
    validSnapshots: computed.summary.strictCandidates,
    strictCandidatesFound: computed.summary.strictCandidates,
    expandedCandidatesFound: computed.summary.expandedCandidates,
    fallbackCandidatesFound: computed.summary.fallbackCandidates,
    strictVerifiedLinesInserted: Number(strictVerified?.c || 0),
    expandedVerifiedLinesInserted: Number(expandedVerified?.c || 0),
    resolutionMetrics: await getPlayerResolutionMetrics({
      db: params.db,
      sport: sport || undefined,
    }),
    summary: computed.summary,
  };
}

export async function rebuildVerifiedHistoricalLines(params: {
  db: D1Database;
  sport?: string;
}): Promise<{
  strictDeleted: number;
  expandedDeleted: number;
  insertedOrUpdated: number;
  strictInsertedOrUpdated: number;
  expandedInsertedOrUpdated: number;
  candidates: number;
  strictCandidates: number;
  expandedCandidates: number;
  errors: number;
  blocked: boolean;
  blockedReason?: string;
  resolutionMetrics: {
    totalSnapshots: number;
    resolvedPlayers: number;
    unresolvedPlayers: number;
    resolutionRate: number;
  };
  debugSummary: SelectorDebugSummary;
}> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const resolutionMetrics = await getPlayerResolutionMetrics({
    db: params.db,
    sport: sport || undefined,
  });
  if (resolutionMetrics.resolutionRate < 90) {
    console.error("[historicalLines] rebuild skipped: player resolution below 90%", {
      sport: sport || null,
      resolutionRate: resolutionMetrics.resolutionRate,
      threshold: 90,
    });
    return {
      strictDeleted: 0,
      expandedDeleted: 0,
      insertedOrUpdated: 0,
      strictInsertedOrUpdated: 0,
      expandedInsertedOrUpdated: 0,
      candidates: 0,
      strictCandidates: 0,
      expandedCandidates: 0,
      errors: 0,
      blocked: true,
      blockedReason: "player_resolution_below_threshold",
      resolutionMetrics,
      debugSummary: buildSelectorDebugSummary(),
    };
  }
  const strictDeleteStmt = sport
    ? params.db.prepare("DELETE FROM historical_verified_lines_strict WHERE UPPER(COALESCE(sport, '')) = ?").bind(sport)
    : params.db.prepare("DELETE FROM historical_verified_lines_strict");
  const expandedDeleteStmt = sport
    ? params.db.prepare("DELETE FROM historical_verified_lines_expanded WHERE UPPER(COALESCE(sport, '')) = ?").bind(sport)
    : params.db.prepare("DELETE FROM historical_verified_lines_expanded");
  const legacyDeleteStmt = sport
    ? params.db.prepare("DELETE FROM historical_verified_lines WHERE UPPER(COALESCE(sport, '')) = ?").bind(sport)
    : params.db.prepare("DELETE FROM historical_verified_lines");
  const strictDeletedResult = await strictDeleteStmt.run();
  const expandedDeletedResult = await expandedDeleteStmt.run();
  await legacyDeleteStmt.run();
  const lock = await lockVerifiedHistoricalLines({
    db: params.db,
    sport: sport || undefined,
  });
  return {
    strictDeleted: Number(strictDeletedResult.meta?.changes || 0),
    expandedDeleted: Number(expandedDeletedResult.meta?.changes || 0),
    insertedOrUpdated: lock.insertedOrUpdated,
    strictInsertedOrUpdated: lock.strictInsertedOrUpdated,
    expandedInsertedOrUpdated: lock.expandedInsertedOrUpdated,
    candidates: lock.candidates,
    strictCandidates: lock.strictCandidates,
    expandedCandidates: lock.expandedCandidates,
    errors: lock.errors,
    blocked: lock.blocked,
    blockedReason: lock.blockedReason,
    resolutionMetrics: lock.resolutionMetrics || resolutionMetrics,
    debugSummary: lock.debugSummary || buildSelectorDebugSummary(),
  };
}

export async function selectVerifiedLinesStrict(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
}): Promise<SelectedCandidate[]> {
  const computed = await computeSelectorCandidates(params);
  return computed.strictSelected;
}

export async function selectVerifiedLinesExpanded(params: {
  db: D1Database;
  sport?: string;
  gameId?: string;
}): Promise<SelectedCandidate[]> {
  const computed = await computeSelectorCandidates(params);
  return computed.expandedSelected;
}

export async function readVerifiedLinesForPlayerGame(params: {
  db: D1Database;
  sport: string;
  gameId: string;
  playerInternalId: string;
}): Promise<Record<string, { lineValue: number; overPrice: number | null; underPrice: number | null; sportsbook: string | null }>> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const gameId = String(params.gameId || "").trim();
  const playerInternalId = String(params.playerInternalId || "").trim();
  if (!sport || !gameId || !playerInternalId) return {};

  const rows = await params.db
    .prepare(
      `SELECT stat_type, verified_line_value, over_price, under_price, sportsbook
       FROM historical_verified_lines_strict
       WHERE sport = ? AND game_id = ? AND player_internal_id = ?`
    )
    .bind(sport, gameId, playerInternalId)
    .all<{
      stat_type: string;
      verified_line_value: number;
      over_price: number | null;
      under_price: number | null;
      sportsbook: string | null;
    }>();

  const out: Record<string, { lineValue: number; overPrice: number | null; underPrice: number | null; sportsbook: string | null }> = {};
  for (const row of rows.results || []) {
    const stat = String(row.stat_type || "").trim().toLowerCase();
    if (!stat) continue;
    out[stat] = {
      lineValue: Number(row.verified_line_value),
      overPrice: row.over_price ?? null,
      underPrice: row.under_price ?? null,
      sportsbook: row.sportsbook ?? null,
    };
  }
  return out;
}

export async function readPreferredVerifiedLinesForPlayerGame(params: {
  db: D1Database;
  sport: string;
  gameId: string;
  playerInternalId: string;
}): Promise<{
  lines: Record<string, { lineValue: number; overPrice: number | null; underPrice: number | null; sportsbook: string | null }>;
  lineQualityByStat: Record<string, "verified" | "estimated">;
  hasVerified: boolean;
  hasEstimated: boolean;
}> {
  const strict = await readVerifiedLinesForPlayerGame(params);
  const sport = String(params.sport || "").trim().toUpperCase();
  const gameId = String(params.gameId || "").trim();
  const playerInternalId = String(params.playerInternalId || "").trim();
  if (!sport || !gameId || !playerInternalId) {
    return { lines: {}, lineQualityByStat: {}, hasVerified: false, hasEstimated: false };
  }

  const expandedRows = await params.db
    .prepare(
      `SELECT stat_type, verified_line_value, over_price, under_price, sportsbook
       FROM historical_verified_lines_expanded
       WHERE sport = ? AND game_id = ? AND player_internal_id = ?`
    )
    .bind(sport, gameId, playerInternalId)
    .all<{
      stat_type: string;
      verified_line_value: number;
      over_price: number | null;
      under_price: number | null;
      sportsbook: string | null;
    }>();

  const lines: Record<string, { lineValue: number; overPrice: number | null; underPrice: number | null; sportsbook: string | null }> = {
    ...strict,
  };
  const lineQualityByStat: Record<string, "verified" | "estimated"> = {};
  for (const stat of Object.keys(strict)) lineQualityByStat[stat] = "verified";

  let hasEstimated = false;
  for (const row of expandedRows.results || []) {
    const stat = String(row.stat_type || "").trim().toLowerCase();
    if (!stat) continue;
    if (lines[stat]) continue;
    const value = Number(row.verified_line_value);
    if (!Number.isFinite(value)) continue;
    lines[stat] = {
      lineValue: value,
      overPrice: row.over_price ?? null,
      underPrice: row.under_price ?? null,
      sportsbook: row.sportsbook ?? null,
    };
    lineQualityByStat[stat] = "estimated";
    hasEstimated = true;
  }

  return {
    lines,
    lineQualityByStat,
    hasVerified: Object.keys(strict).length > 0,
    hasEstimated,
  };
}
