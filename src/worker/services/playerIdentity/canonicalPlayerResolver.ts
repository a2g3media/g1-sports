/* COVERAGE LOCK: do not redesign/refactor; only completeness data updates. */
import type { D1Database } from "@cloudflare/workers-types";
import {
  normalizeCanonicalEspnPlayerId,
  normalizeCanonicalName,
  normalizeCanonicalSport,
  type CanonicalPlayerRecord,
} from "../../../shared/canonicalPlayer";
import {
  getCanonicalPlayerByEspnId,
  insertCanonicalPlayerConflict,
  upsertCanonicalPlayer,
} from "./canonicalPlayerStore";

function isFallbackDisplayName(value: string): boolean {
  const s = String(value || "").trim();
  if (!s) return true;
  if (/^player-\d+$/i.test(s)) return true;
  if (/^player\s+\d+$/i.test(s)) return true;
  if (/^\d{4,}$/.test(s)) return true;
  return false;
}

export async function resolveCanonicalPlayerIdentity(params: {
  db: D1Database;
  sport: string;
  playerId: string;
  playerName?: string | null;
  source: string;
}): Promise<{ ok: true; identity: CanonicalPlayerRecord } | { ok: false; reason: string }> {
  const sport = normalizeCanonicalSport(params.sport);
  const playerId = normalizeCanonicalEspnPlayerId(params.playerId);
  const playerName = String(params.playerName || "").trim();
  if (!sport || !playerId) {
    return { ok: false, reason: "invalid_sport_or_player_id" };
  }

  const existing = await getCanonicalPlayerByEspnId(params.db, sport, playerId);
  if (existing) {
    const existingNameNorm = normalizeCanonicalName(existing.displayName);
    const incomingNameNorm = normalizeCanonicalName(playerName);
    if (
      incomingNameNorm
      && !isFallbackDisplayName(playerName)
      && isFallbackDisplayName(existing.displayName)
    ) {
      const repaired = await upsertCanonicalPlayer(params.db, {
        sport,
        espnPlayerId: playerId,
        displayName: playerName,
        aliases: [existing.displayName, ...(existing.aliases || [])],
        providerIds: existing.providerIds || { espn: playerId },
        position: existing.position,
        jersey: existing.jersey,
        status: existing.status,
        metadata: { ...(existing.metadata || {}), source: params.source, repairedFromFallback: true },
      });
      if (repaired) return { ok: true, identity: repaired };
    }
    if (
      incomingNameNorm
      && existingNameNorm
      && incomingNameNorm !== existingNameNorm
    ) {
      await insertCanonicalPlayerConflict(params.db, {
        sport,
        espnPlayerId: playerId,
        inputName: playerName,
        existingName: existing.displayName,
        reason: "display_name_conflict",
        metadata: { source: params.source },
      });
    }
    return { ok: true, identity: existing };
  }

  const displayName = playerName || playerId;
  const inserted = await upsertCanonicalPlayer(params.db, {
    sport,
    espnPlayerId: playerId,
    displayName,
    aliases: playerName ? [playerName] : [],
    providerIds: { espn: playerId },
    metadata: { source: params.source, createdFrom: "resolver" },
  });
  if (!inserted) {
    return { ok: false, reason: "canonical_upsert_failed" };
  }
  return { ok: true, identity: inserted };
}
