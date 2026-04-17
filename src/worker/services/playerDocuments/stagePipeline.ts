import type { D1Database } from "@cloudflare/workers-types";
import type { Bindings } from "../../routes/player-profile";
import { getStoredPlayerDocumentJson, type StoredPlayerDocumentV1 } from "./playerDocumentStore";
import { buildPlayerDocument } from "./buildPlayerDocument";
import { upsertCoachGFeatureDocument } from "./coachGFeatureStore";

export type PlayerBuildStageName = "identity_shell" | "stats_logs" | "markets" | "coachg_features";

export type PlayerBuildStageResult = {
  stage: PlayerBuildStageName;
  ok: boolean;
  reason?: string;
};

export async function runPlayerDocumentStages(params: {
  db: D1Database;
  env: Bindings;
  origin: string;
  sport: string;
  playerId: string;
  playerNameHint?: string | null;
}): Promise<{
  ok: boolean;
  stages: PlayerBuildStageResult[];
}> {
  const stages: PlayerBuildStageResult[] = [];
  stages.push({ stage: "identity_shell", ok: true });

  const built = await buildPlayerDocument({
    db: params.db,
    env: params.env,
    sport: params.sport,
    playerId: params.playerId,
    playerNameHint: params.playerNameHint || null,
    origin: params.origin,
  });
  if (!built.ok) {
    stages.push({
      stage: "stats_logs",
      ok: false,
      reason: "reason" in built ? built.reason : "build_failed",
    });
    stages.push({ stage: "markets", ok: false, reason: "build_failed" });
    stages.push({ stage: "coachg_features", ok: false, reason: "build_failed" });
    return { ok: false, stages };
  }
  stages.push({ stage: "stats_logs", ok: true });
  stages.push({ stage: "markets", ok: true });

  const raw = await getStoredPlayerDocumentJson(params.db, params.sport, params.playerId);
  if (!raw) {
    stages.push({ stage: "coachg_features", ok: false, reason: "document_missing" });
    return { ok: false, stages };
  }
  try {
    const parsed = JSON.parse(raw) as StoredPlayerDocumentV1;
    const profile = (parsed?.data?.profile || null) as Record<string, unknown> | null;
    if (!profile || typeof profile !== "object") {
      stages.push({ stage: "coachg_features", ok: false, reason: "profile_missing" });
      return { ok: false, stages };
    }
    await upsertCoachGFeatureDocument({
      db: params.db,
      sport: params.sport,
      playerId: params.playerId,
      profile,
      sourceMeta: {
        playerNameHint: params.playerNameHint || null,
        stagePipeline: "v1",
      },
    });
    stages.push({ stage: "coachg_features", ok: true });
    return { ok: true, stages };
  } catch {
    stages.push({ stage: "coachg_features", ok: false, reason: "document_parse_failed" });
    return { ok: false, stages };
  }
}
