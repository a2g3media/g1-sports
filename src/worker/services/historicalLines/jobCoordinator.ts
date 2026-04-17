import type { D1Database } from "@cloudflare/workers-types";
import { lockVerifiedHistoricalLines } from "./verifiedLineSelector";
import { gradeVerifiedHistoricalLines } from "./gradingEngine";

export type HistoricalArchiveJobMetrics = {
  snapshotsInserted: number;
  verifiedLinesLocked: number;
  gradedLines: number;
  noActionGrades: number;
  missingCanonicalRejections: number;
  missingGameRejections: number;
};

export type HistoricalArchiveJobResult = {
  ok: boolean;
  runKey: string;
  elapsedMs: number;
  metrics: HistoricalArchiveJobMetrics;
  error?: string;
};

const DEFAULT_METRICS: HistoricalArchiveJobMetrics = {
  snapshotsInserted: 0,
  verifiedLinesLocked: 0,
  gradedLines: 0,
  noActionGrades: 0,
  missingCanonicalRejections: 0,
  missingGameRejections: 0,
};

export async function runHistoricalArchivePostIngestionJobs(params: {
  db: D1Database;
  runKey?: string;
  sport?: string;
}): Promise<HistoricalArchiveJobResult> {
  const startedAt = Date.now();
  const runKey = String(params.runKey || `archive:${new Date().toISOString().slice(0, 16)}`).trim();
  const sport = String(params.sport || "").trim().toUpperCase() || undefined;

  try {
    const lock = await lockVerifiedHistoricalLines({ db: params.db, sport });
    const grade = await gradeVerifiedHistoricalLines({ db: params.db, sport });
    const result: HistoricalArchiveJobResult = {
      ok: true,
      runKey,
      elapsedMs: Date.now() - startedAt,
      metrics: {
        ...DEFAULT_METRICS,
        verifiedLinesLocked: lock.insertedOrUpdated,
        gradedLines: grade.graded,
        noActionGrades: grade.noAction,
      },
    };
    console.log("[historicalLines] post-ingestion jobs completed", result);
    return result;
  } catch (error) {
    const out: HistoricalArchiveJobResult = {
      ok: false,
      runKey,
      elapsedMs: Date.now() - startedAt,
      metrics: { ...DEFAULT_METRICS },
      error: error instanceof Error ? error.message : String(error),
    };
    console.error("[historicalLines] post-ingestion jobs failed", out);
    return out;
  }
}
