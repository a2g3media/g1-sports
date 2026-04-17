import type { D1Database } from "@cloudflare/workers-types";
import { incCounter } from "../pageData/rolloutMetrics";

import type { DocumentCompletenessMeta } from "./documentCompleteness";

/** Stored shape (no freshness envelope — reapplied on read). */
export type StoredPlayerDocumentV1 = {
  schemaVersion: 1;
  meta: {
    sport: string;
    playerName: string;
    playerId?: string | null;
    partialReason: string | null;
    /** Background enrichment progress only — not for user-facing warnings. */
    completeness?: DocumentCompletenessMeta;
  };
  data: {
    profile: unknown;
    canonicalTeamRouteId: string | null;
  };
};

let tableReady = false;

export function normalizePlayerDocumentKeyParts(
  sportUpper: string,
  playerId: string
): { sport: string; playerId: string; valid: boolean } {
  const sport = String(sportUpper || "").trim().toUpperCase();
  const pid = String(playerId || "").trim();
  return {
    sport,
    playerId: pid,
    valid: Boolean(sport && sport !== "ALL" && /^\d{3,}$/.test(pid)),
  };
}

export function buildPlayerDocumentL1CacheKey(sportUpper: string, playerId: string): string {
  const key = normalizePlayerDocumentKeyParts(sportUpper, playerId);
  if (!key.valid) return "";
  return `pdpp:${key.sport}:${key.playerId}`;
}

export async function ensurePlayerDocumentsTable(db: D1Database): Promise<void> {
  if (tableReady) return;
  try {
    // D1 local (Miniflare) rejects multiple statements in a single `exec()` — run DDL separately.
    await db.exec(
      "CREATE TABLE IF NOT EXISTS player_documents (sport TEXT NOT NULL, player_id TEXT NOT NULL, display_name TEXT, document_json TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1, built_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (sport, player_id))"
    );
    await db.exec(
      "CREATE INDEX IF NOT EXISTS idx_player_documents_updated ON player_documents(updated_at)"
    );
    tableReady = true;
  } catch (e) {
    console.error("[playerDocuments] ensure table failed", e);
  }
}

export async function countPlayerDocuments(db: D1Database): Promise<number> {
  await ensurePlayerDocumentsTable(db);
  try {
    const row = await db.prepare(`SELECT COUNT(*) as c FROM player_documents`).first<{ c: number }>();
    return Number(row?.c || 0);
  } catch {
    return 0;
  }
}

/**
 * Read persisted player page document. User-facing GET /player-profile uses this exclusively.
 */
const ENRICHMENT_COMPLETE_THRESHOLD = 0.85;

/** Used by queue: skip heavy rebuild when document is already rich enough. */
export async function isPlayerDocumentEnrichmentSatisfied(
  db: D1Database,
  sport: string,
  playerId: string
): Promise<boolean> {
  const raw = await getStoredPlayerDocumentJson(db, sport, playerId);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as StoredPlayerDocumentV1;
    const score = parsed?.meta?.completeness?.completenessScore ?? 0;
    return score >= ENRICHMENT_COMPLETE_THRESHOLD;
  } catch {
    return false;
  }
}

export async function getStoredPlayerDocumentJson(
  db: D1Database,
  sportUpper: string,
  playerId: string
): Promise<string | null> {
  await ensurePlayerDocumentsTable(db);
  const key = normalizePlayerDocumentKeyParts(sportUpper, playerId);
  if (!key.valid) return null;
  try {
    const row = await db
      .prepare(
        `SELECT document_json FROM player_documents WHERE sport = ? AND player_id = ?`
      )
      .bind(key.sport, key.playerId)
      .first<{ document_json: string }>();
    return row?.document_json || null;
  } catch {
    return null;
  }
}

export async function upsertPlayerDocumentV1(
  db: D1Database,
  doc: StoredPlayerDocumentV1,
  builtAtIso?: string
): Promise<void> {
  await ensurePlayerDocumentsTable(db);
  const key = normalizePlayerDocumentKeyParts(doc.meta.sport || "", doc.meta.playerId || "");
  if (!key.valid) return;
  const displayName = String(doc.meta.playerName || "").trim() || "";
  const json = JSON.stringify(doc);
  const built = (builtAtIso || new Date().toISOString()).trim();
  try {
    await db
      .prepare(
        `
      INSERT INTO player_documents (sport, player_id, display_name, document_json, schema_version, built_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
      ON CONFLICT(sport, player_id) DO UPDATE SET
        display_name = excluded.display_name,
        document_json = excluded.document_json,
        schema_version = excluded.schema_version,
        built_at = excluded.built_at,
        updated_at = datetime('now')
    `
      )
      .bind(key.sport, key.playerId, displayName, json, built)
      .run();
    incCounter("playerDocumentsUpserts");
  } catch (e) {
    console.error("[playerDocuments] upsert failed", { sport: key.sport, player_id: key.playerId, e });
  }
}

export async function getStoredPlayerDocumentRecord(
  db: D1Database,
  sportUpper: string,
  playerId: string
): Promise<{ documentJson: string; builtAt: string | null; updatedAt: string | null } | null> {
  await ensurePlayerDocumentsTable(db);
  const key = normalizePlayerDocumentKeyParts(sportUpper, playerId);
  if (!key.valid) return null;
  try {
    const row = await db
      .prepare(
        `SELECT document_json, built_at, updated_at
         FROM player_documents
         WHERE sport = ? AND player_id = ?
         LIMIT 1`
      )
      .bind(key.sport, key.playerId)
      .first<{ document_json: string; built_at?: string | null; updated_at?: string | null }>();
    if (!row?.document_json) return null;
    return {
      documentJson: row.document_json,
      builtAt: row.built_at ? String(row.built_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    };
  } catch {
    return null;
  }
}
