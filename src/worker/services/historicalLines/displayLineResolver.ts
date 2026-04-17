import type { D1Database } from "@cloudflare/workers-types";
import { getHistoricalTimingPolicy } from "./timingPolicy";

export type DisplayLineSource =
  | "historical_verified"
  | "estimated_verified"
  | "display_fallback"
  | "unavailable";

export type DisplayLineQuality = "verified" | "estimated" | "unavailable";

export type DisplayLineValue = {
  lineValue: number;
  overPrice: number | null;
  underPrice: number | null;
  sportsbook: string | null;
};

export type DisplayLineResolution = {
  lines: Record<string, DisplayLineValue>;
  lineQualityByStat: Record<string, DisplayLineQuality>;
  lineSourceByStat: Record<string, DisplayLineSource>;
  hasStrict: boolean;
  hasExpanded: boolean;
  hasDisplayFallback: boolean;
};

type SnapshotFallbackRow = {
  stat_type: string | null;
  line_value: number | null;
  over_price: number | null;
  under_price: number | null;
  sportsbook: string | null;
  captured_at: string | null;
  game_start_time: string | null;
};

function normalizeStatKey(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "shots_on_goal") return "shots";
  if (raw === "home_runs") return "homeRuns";
  if (raw === "rbi") return "rbis";
  if (raw === "hr") return "homeRuns";
  if (raw === "so" || raw === "k") return "strikeouts";
  if (raw === "hit") return "hits";
  if (raw === "run") return "runs";
  return raw;
}

function addLineAliases(store: Record<string, DisplayLineValue>, key: string, value: DisplayLineValue): void {
  if (!key) return;
  store[key] = value;
  if (key === "shots") store.shots_on_goal = value;
  if (key === "shots_on_goal") store.shots = value;
  if (key === "homeRuns") store.home_runs = value;
  if (key === "home_runs") store.homeRuns = value;
  if (key === "rbis") store.rbi = value;
  if (key === "rbi") store.rbis = value;
  if (key === "strikeouts") {
    store.so = value;
    store.k = value;
  }
}

function toMs(value: unknown): number | null {
  const d = new Date(String(value || ""));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isFiniteLine(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n);
}

export async function resolveDisplayLinesForPlayerGame(params: {
  db: D1Database;
  sport: string;
  gameId: string;
  playerInternalId: string;
}): Promise<DisplayLineResolution> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const gameId = String(params.gameId || "").trim();
  const playerInternalId = String(params.playerInternalId || "").trim();
  if (!sport || !gameId || !playerInternalId) {
    return {
      lines: {},
      lineQualityByStat: {},
      lineSourceByStat: {},
      hasStrict: false,
      hasExpanded: false,
      hasDisplayFallback: false,
    };
  }

  const lines: Record<string, DisplayLineValue> = {};
  const lineQualityByStat: Record<string, DisplayLineQuality> = {};
  const lineSourceByStat: Record<string, DisplayLineSource> = {};
  let hasStrict = false;
  let hasExpanded = false;
  let hasDisplayFallback = false;

  const strictRows = await params.db
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

  for (const row of strictRows.results || []) {
    const stat = normalizeStatKey(row.stat_type);
    if (!stat || !isFiniteLine(row.verified_line_value)) continue;
    const line: DisplayLineValue = {
      lineValue: Number(row.verified_line_value),
      overPrice: row.over_price ?? null,
      underPrice: row.under_price ?? null,
      sportsbook: row.sportsbook ?? null,
    };
    addLineAliases(lines, stat, line);
    lineQualityByStat[stat] = "verified";
    lineSourceByStat[stat] = "historical_verified";
    hasStrict = true;
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

  for (const row of expandedRows.results || []) {
    const stat = normalizeStatKey(row.stat_type);
    if (!stat || lines[stat] || !isFiniteLine(row.verified_line_value)) continue;
    const line: DisplayLineValue = {
      lineValue: Number(row.verified_line_value),
      overPrice: row.over_price ?? null,
      underPrice: row.under_price ?? null,
      sportsbook: row.sportsbook ?? null,
    };
    addLineAliases(lines, stat, line);
    lineQualityByStat[stat] = "estimated";
    lineSourceByStat[stat] = "estimated_verified";
    hasExpanded = true;
  }

  const policy = getHistoricalTimingPolicy(sport);
  const fallbackRows = await params.db
    .prepare(
      `SELECT stat_type, line_value, over_price, under_price, sportsbook, captured_at, game_start_time
       FROM historical_prop_snapshots
       WHERE sport = ? AND game_id = ? AND player_internal_id = ?
         AND line_value IS NOT NULL`
    )
    .bind(sport, gameId, playerInternalId)
    .all<SnapshotFallbackRow>();

  const closestByStat = new Map<string, { row: SnapshotFallbackRow; distanceMs: number }>();
  for (const row of fallbackRows.results || []) {
    const stat = normalizeStatKey(row.stat_type);
    if (!stat || lines[stat] || !isFiniteLine(row.line_value)) continue;
    const capturedAtMs = toMs(row.captured_at);
    const gameStartMs = toMs(row.game_start_time);
    if (capturedAtMs === null) continue;
    const distanceMs =
      gameStartMs === null ? 0 : Math.abs(capturedAtMs - gameStartMs);
    if (policy.displayFallbackWindowMinutes > 0 && gameStartMs !== null) {
      const maxDistance = policy.displayFallbackWindowMinutes * 60 * 1000;
      if (distanceMs > maxDistance) continue;
    }
    const existing = closestByStat.get(stat);
    if (!existing || distanceMs < existing.distanceMs) {
      closestByStat.set(stat, { row, distanceMs });
    }
  }

  for (const [stat, selected] of closestByStat.entries()) {
    if (lines[stat]) continue;
    const line: DisplayLineValue = {
      lineValue: Number(selected.row.line_value),
      overPrice: selected.row.over_price ?? null,
      underPrice: selected.row.under_price ?? null,
      sportsbook: selected.row.sportsbook ?? null,
    };
    addLineAliases(lines, stat, line);
    lineQualityByStat[stat] = "estimated";
    lineSourceByStat[stat] = "display_fallback";
    hasDisplayFallback = true;
  }

  return {
    lines,
    lineQualityByStat,
    lineSourceByStat,
    hasStrict,
    hasExpanded,
    hasDisplayFallback,
  };
}

export async function computeCoverageBySport(params: {
  db: D1Database;
  sport?: string;
}): Promise<Array<{
  sport: string;
  totalRows: number;
  strictCoveredRows: number;
  expandedCoveredRows: number;
  displayCoveredRows: number;
  trueUnavailableRows: number;
  strictCoveragePct: number;
  expandedCoveragePct: number;
  displayCoveragePct: number;
  trueUnavailablePct: number;
}>> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const rows = await params.db
    .prepare(
      `WITH grouped AS (
         SELECT
           UPPER(COALESCE(sport, '')) AS sport,
           COALESCE(game_id, '') AS game_id,
           COALESCE(player_internal_id, '') AS player_internal_id,
           LOWER(COALESCE(stat_type, '')) AS stat_type,
           MAX(CASE WHEN line_value IS NOT NULL THEN 1 ELSE 0 END) AS has_usable_snapshot
         FROM historical_prop_snapshots
         WHERE COALESCE(TRIM(game_id), '') <> ''
           AND COALESCE(TRIM(player_internal_id), '') <> ''
           AND COALESCE(TRIM(stat_type), '') <> ''
           ${sport ? "AND UPPER(COALESCE(sport, '')) = ?" : ""}
         GROUP BY UPPER(COALESCE(sport, '')), COALESCE(game_id, ''), COALESCE(player_internal_id, ''), LOWER(COALESCE(stat_type, ''))
       ),
       strict_rows AS (
         SELECT UPPER(COALESCE(sport, '')) AS sport, game_id, player_internal_id, LOWER(COALESCE(stat_type, '')) AS stat_type
         FROM historical_verified_lines_strict
       ),
       expanded_rows AS (
         SELECT UPPER(COALESCE(sport, '')) AS sport, game_id, player_internal_id, LOWER(COALESCE(stat_type, '')) AS stat_type
         FROM historical_verified_lines_expanded
       )
       SELECT
         g.sport AS sport,
         COUNT(*) AS total_rows,
         SUM(CASE WHEN EXISTS (
           SELECT 1 FROM strict_rows s
           WHERE s.sport = g.sport AND s.game_id = g.game_id AND s.player_internal_id = g.player_internal_id AND s.stat_type = g.stat_type
         ) THEN 1 ELSE 0 END) AS strict_rows,
         SUM(CASE WHEN EXISTS (
           SELECT 1 FROM expanded_rows e
           WHERE e.sport = g.sport AND e.game_id = g.game_id AND e.player_internal_id = g.player_internal_id AND e.stat_type = g.stat_type
         ) THEN 1 ELSE 0 END) AS expanded_rows,
         SUM(CASE WHEN
           EXISTS (
             SELECT 1 FROM strict_rows s
             WHERE s.sport = g.sport AND s.game_id = g.game_id AND s.player_internal_id = g.player_internal_id AND s.stat_type = g.stat_type
           )
           OR EXISTS (
             SELECT 1 FROM expanded_rows e
             WHERE e.sport = g.sport AND e.game_id = g.game_id AND e.player_internal_id = g.player_internal_id AND e.stat_type = g.stat_type
           )
           OR g.has_usable_snapshot = 1
         THEN 1 ELSE 0 END) AS display_rows,
         SUM(CASE WHEN
           NOT EXISTS (
             SELECT 1 FROM strict_rows s
             WHERE s.sport = g.sport AND s.game_id = g.game_id AND s.player_internal_id = g.player_internal_id AND s.stat_type = g.stat_type
           )
           AND NOT EXISTS (
             SELECT 1 FROM expanded_rows e
             WHERE e.sport = g.sport AND e.game_id = g.game_id AND e.player_internal_id = g.player_internal_id AND e.stat_type = g.stat_type
           )
           AND g.has_usable_snapshot = 0
         THEN 1 ELSE 0 END) AS unavailable_rows
       FROM grouped g
       GROUP BY g.sport
       ORDER BY g.sport`
    )
    .bind(...(sport ? [sport] : []))
    .all<{
      sport: string;
      total_rows: number;
      strict_rows: number;
      expanded_rows: number;
      display_rows: number;
      unavailable_rows: number;
    }>();

  return (rows.results || []).map((row) => {
    const total = Number(row.total_rows || 0);
    const strictCoveredRows = Number(row.strict_rows || 0);
    const expandedCoveredRows = Number(row.expanded_rows || 0);
    const displayCoveredRows = Number(row.display_rows || 0);
    const trueUnavailableRows = Number(row.unavailable_rows || 0);
    const pct = (value: number) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);
    return {
      sport: String(row.sport || ""),
      totalRows: total,
      strictCoveredRows,
      expandedCoveredRows,
      displayCoveredRows,
      trueUnavailableRows,
      strictCoveragePct: pct(strictCoveredRows),
      expandedCoveragePct: pct(expandedCoveredRows),
      displayCoveragePct: pct(displayCoveredRows),
      trueUnavailablePct: pct(trueUnavailableRows),
    };
  });
}

