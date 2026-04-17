import type { D1Database } from "@cloudflare/workers-types";
import { normalizeMarketStatKey } from "../../../shared/marketTaxonomy";
import { evaluatePlayerProfileCoreReadiness } from "../../../shared/playerProfileCompleteness";

let coachGTableReady = false;

export async function ensureCoachGFeatureTable(db: D1Database): Promise<void> {
  if (coachGTableReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS coach_g_player_features (sport TEXT NOT NULL, player_id TEXT NOT NULL, feature_json TEXT NOT NULL, completeness_json TEXT NOT NULL, confidence_json TEXT NOT NULL, build_version TEXT NOT NULL DEFAULT 'v1', built_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (sport, player_id))"
  );
  await db.exec("CREATE INDEX IF NOT EXISTS idx_coach_g_player_features_updated ON coach_g_player_features(updated_at)");
  coachGTableReady = true;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function buildMarketSignals(profile: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {
    points: null,
    rebounds: null,
    assists: null,
  };
  const currentProps = Array.isArray(profile.currentProps) ? profile.currentProps : [];
  for (const row of currentProps as any[]) {
    const stat = normalizeMarketStatKey(row?.statType || row?.market || row?.marketType);
    if (!stat) continue;
    const line = Number(row?.line || row?.value || row?.point || row?.target);
    if (!Number.isFinite(line)) continue;
    out[stat] = line;
  }
  return out;
}

export function buildCoachGFeatureDocument(input: {
  sport: string;
  playerId: string;
  profile: Record<string, unknown>;
  sourceMeta?: Record<string, unknown> | null;
}): {
  feature: Record<string, unknown>;
  completeness: Record<string, unknown>;
  confidence: Record<string, unknown>;
} {
  const profile = input.profile;
  const readiness = evaluatePlayerProfileCoreReadiness(profile);
  const gameLog = Array.isArray(profile.gameLog) ? profile.gameLog : [];
  const recentRows = gameLog.slice(0, 5);
  const pointsRecent = recentRows
    .map((row: any) => Number(row?.points ?? row?.pts))
    .filter((value: number) => Number.isFinite(value));
  const reboundsRecent = recentRows
    .map((row: any) => Number(row?.rebounds ?? row?.reb))
    .filter((value: number) => Number.isFinite(value));
  const assistsRecent = recentRows
    .map((row: any) => Number(row?.assists ?? row?.ast))
    .filter((value: number) => Number.isFinite(value));

  const player = (profile.player || {}) as Record<string, unknown>;
  const marketSignals = buildMarketSignals(profile);
  const feature = {
    sport: input.sport,
    playerId: input.playerId,
    identity: {
      displayName: String(player.displayName || player.name || "").trim(),
      team: String(player.teamAbbr || player.teamName || "").trim() || null,
      position: String(player.position || "").trim() || null,
    },
    recentForm: {
      pointsAvg5: mean(pointsRecent),
      reboundsAvg5: mean(reboundsRecent),
      assistsAvg5: mean(assistsRecent),
      gamesUsed: recentRows.length,
    },
    marketSignals,
    sourceMeta: input.sourceMeta || null,
    generatedAt: new Date().toISOString(),
  };

  const completeness = {
    identity: readiness.identityValid,
    stats: readiness.hasSeasonAverages,
    gameLog: readiness.hasGameLog,
    markets: readiness.hasMarketEvidence,
    ready: readiness.ready,
    reasons: readiness.reasons,
  };
  const confidence = {
    score: readiness.ready ? 1 : 0.5,
    reasons: readiness.reasons,
  };
  return { feature, completeness, confidence };
}

export async function upsertCoachGFeatureDocument(params: {
  db: D1Database;
  sport: string;
  playerId: string;
  profile: Record<string, unknown>;
  sourceMeta?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureCoachGFeatureTable(params.db);
  const sport = String(params.sport || "").trim().toUpperCase();
  const playerId = String(params.playerId || "").trim();
  if (!sport || !/^\d{3,}$/.test(playerId)) return;
  const built = buildCoachGFeatureDocument({
    sport,
    playerId,
    profile: params.profile,
    sourceMeta: params.sourceMeta,
  });
  await params.db
    .prepare(
      `INSERT INTO coach_g_player_features
        (sport, player_id, feature_json, completeness_json, confidence_json, build_version, built_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'v1', ?, datetime('now'))
       ON CONFLICT(sport, player_id) DO UPDATE SET
         feature_json = excluded.feature_json,
         completeness_json = excluded.completeness_json,
         confidence_json = excluded.confidence_json,
         build_version = excluded.build_version,
         built_at = excluded.built_at,
         updated_at = datetime('now')`
    )
    .bind(
      sport,
      playerId,
      JSON.stringify(built.feature),
      JSON.stringify(built.completeness),
      JSON.stringify(built.confidence),
      new Date().toISOString()
    )
    .run();
}
