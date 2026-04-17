/* COVERAGE LOCK: do not redesign/refactor; only completeness data updates. */
import type { D1Database } from "@cloudflare/workers-types";
import {
  buildCanonicalPlayerId,
  normalizeCanonicalAliases,
  normalizeCanonicalEspnPlayerId,
  normalizeCanonicalName,
  normalizeCanonicalSport,
  type CanonicalPlayerRecord,
} from "../../../shared/canonicalPlayer";

let canonicalTablesReady = false;

export async function ensureCanonicalPlayerTables(db: D1Database): Promise<void> {
  if (canonicalTablesReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS canonical_players (sport TEXT NOT NULL, canonical_player_id TEXT NOT NULL, espn_player_id TEXT NOT NULL, display_name TEXT NOT NULL, normalized_name TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]', team_ids_json TEXT NOT NULL DEFAULT '[]', provider_ids_json TEXT NOT NULL DEFAULT '{}', position TEXT, jersey TEXT, status TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (sport, canonical_player_id), UNIQUE (sport, espn_player_id))"
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS canonical_player_conflicts (id INTEGER PRIMARY KEY AUTOINCREMENT, sport TEXT NOT NULL, espn_player_id TEXT NOT NULL, input_name TEXT, existing_name TEXT, reason TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  await db.exec("CREATE INDEX IF NOT EXISTS idx_canonical_players_updated ON canonical_players(updated_at)");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_canonical_conflicts_sport_player ON canonical_player_conflicts(sport, espn_player_id)");
  canonicalTablesReady = true;
}

function parseJsonArray(value: unknown): string[] {
  try {
    if (typeof value !== "string" || !value.trim()) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeCanonicalAliases(parsed) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, string> {
  try {
    if (typeof value !== "string" || !value.trim()) return {};
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const key = String(k || "").trim();
      const val = String(v || "").trim();
      if (!key || !val) continue;
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function mapRowToCanonical(row: any): CanonicalPlayerRecord {
  const sport = normalizeCanonicalSport(row?.sport);
  const espnPlayerId = normalizeCanonicalEspnPlayerId(row?.espn_player_id);
  const canonicalPlayerId =
    String(row?.canonical_player_id || "").trim() || buildCanonicalPlayerId(sport, espnPlayerId);
  return {
    sport,
    canonicalPlayerId,
    espnPlayerId,
    displayName: String(row?.display_name || "").trim(),
    normalizedName: String(row?.normalized_name || "").trim() || normalizeCanonicalName(row?.display_name),
    aliases: parseJsonArray(row?.aliases_json),
    teamIds: parseJsonArray(row?.team_ids_json),
    providerIds: parseJsonObject(row?.provider_ids_json),
    position: row?.position ? String(row.position) : null,
    jersey: row?.jersey ? String(row.jersey) : null,
    status: row?.status ? String(row.status) : null,
    metadata: row?.metadata_json ? (JSON.parse(String(row.metadata_json || "{}")) as Record<string, unknown>) : null,
    createdAt: row?.created_at ? String(row.created_at) : undefined,
    updatedAt: row?.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function getCanonicalPlayerByEspnId(
  db: D1Database,
  sportInput: string,
  espnPlayerIdInput: string
): Promise<CanonicalPlayerRecord | null> {
  await ensureCanonicalPlayerTables(db);
  const sport = normalizeCanonicalSport(sportInput);
  const espnPlayerId = normalizeCanonicalEspnPlayerId(espnPlayerIdInput);
  if (!sport || !espnPlayerId) return null;
  const row = await db
    .prepare(
      `SELECT sport, canonical_player_id, espn_player_id, display_name, normalized_name,
              aliases_json, team_ids_json, provider_ids_json, position, jersey, status,
              metadata_json, created_at, updated_at
       FROM canonical_players
       WHERE sport = ? AND espn_player_id = ?
       LIMIT 1`
    )
    .bind(sport, espnPlayerId)
    .first<any>();
  return row ? mapRowToCanonical(row) : null;
}

export async function upsertCanonicalPlayer(
  db: D1Database,
  input: {
    sport: string;
    espnPlayerId: string;
    displayName: string;
    aliases?: string[];
    teamIds?: string[];
    providerIds?: Record<string, string>;
    position?: string | null;
    jersey?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<CanonicalPlayerRecord | null> {
  await ensureCanonicalPlayerTables(db);
  const sport = normalizeCanonicalSport(input.sport);
  const espnPlayerId = normalizeCanonicalEspnPlayerId(input.espnPlayerId);
  const displayName = String(input.displayName || "").trim();
  if (!sport || !espnPlayerId || !displayName) return null;
  const canonicalPlayerId = buildCanonicalPlayerId(sport, espnPlayerId);
  const normalizedName = normalizeCanonicalName(displayName);
  const aliases = normalizeCanonicalAliases([displayName, ...(input.aliases || [])]);
  const teamIds = normalizeCanonicalAliases(input.teamIds || []);
  const providerIds = input.providerIds || {};
  const metadata = input.metadata || null;

  await db
    .prepare(
      `INSERT INTO canonical_players
         (sport, canonical_player_id, espn_player_id, display_name, normalized_name, aliases_json, team_ids_json, provider_ids_json, position, jersey, status, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(sport, canonical_player_id) DO UPDATE SET
         display_name = excluded.display_name,
         normalized_name = excluded.normalized_name,
         aliases_json = excluded.aliases_json,
         team_ids_json = excluded.team_ids_json,
         provider_ids_json = excluded.provider_ids_json,
         position = excluded.position,
         jersey = excluded.jersey,
         status = excluded.status,
         metadata_json = excluded.metadata_json,
         updated_at = datetime('now')`
    )
    .bind(
      sport,
      canonicalPlayerId,
      espnPlayerId,
      displayName,
      normalizedName,
      JSON.stringify(aliases),
      JSON.stringify(teamIds),
      JSON.stringify(providerIds),
      input.position ?? null,
      input.jersey ?? null,
      input.status ?? null,
      metadata ? JSON.stringify(metadata) : null
    )
    .run();

  return getCanonicalPlayerByEspnId(db, sport, espnPlayerId);
}

export async function insertCanonicalPlayerConflict(
  db: D1Database,
  input: {
    sport: string;
    espnPlayerId: string;
    inputName?: string | null;
    existingName?: string | null;
    reason: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await ensureCanonicalPlayerTables(db);
  const sport = normalizeCanonicalSport(input.sport);
  const espnPlayerId = normalizeCanonicalEspnPlayerId(input.espnPlayerId);
  const reason = String(input.reason || "").trim();
  if (!sport || !espnPlayerId || !reason) return;
  await db
    .prepare(
      `INSERT INTO canonical_player_conflicts
        (sport, espn_player_id, input_name, existing_name, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      sport,
      espnPlayerId,
      input.inputName ? String(input.inputName).trim() : null,
      input.existingName ? String(input.existingName).trim() : null,
      reason,
      input.metadata ? JSON.stringify(input.metadata) : null
    )
    .run();
}
