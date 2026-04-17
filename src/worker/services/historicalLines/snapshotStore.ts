import type { D1Database } from "@cloudflare/workers-types";
import {
  normalizeHistoricalPropInput,
  type RawHistoricalPropInput,
} from "./normalizer";

export async function insertHistoricalPropSnapshot(
  db: D1Database,
  raw: RawHistoricalPropInput
): Promise<{ inserted: boolean; reason?: string }> {
  const normalized = await normalizeHistoricalPropInput(db, raw);
  if (!normalized) return { inserted: false, reason: "normalization_failed" };

  try {
    await db
      .prepare(
        `INSERT INTO historical_prop_snapshots (
          sport, league, event_id, game_id, player_internal_id, player_provider_id,
          team_id, opponent_team_id, stat_type, market_type, line_value, over_price, under_price,
          sportsbook, captured_at, game_start_time, source_payload_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        normalized.sport,
        normalized.league,
        normalized.eventId,
        normalized.gameId,
        normalized.playerInternalId,
        normalized.playerProviderId,
        normalized.teamId,
        normalized.opponentTeamId,
        normalized.statType,
        normalized.marketType,
        normalized.lineValue,
        normalized.overPrice,
        normalized.underPrice,
        normalized.sportsbook,
        normalized.capturedAt,
        normalized.gameStartTime,
        normalized.sourcePayloadJson,
        normalized.status
      )
      .run();
    return { inserted: true };
  } catch (error) {
    console.error("[historicalLines] snapshot insert failed", {
      sport: raw.sport,
      eventId: raw.eventId,
      gameId: raw.gameId,
      player: raw.playerName,
      statType: raw.statType,
      error,
    });
    return { inserted: false, reason: "insert_failed" };
  }
}
