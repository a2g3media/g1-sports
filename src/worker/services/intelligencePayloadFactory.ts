import type { CoachGDeterministicResult, CoachGModelOutput } from "../types/coachg";
import type { CoachGContextPackage } from "../types/context";
import type { IntelligencePayload } from "../types/intelligencePayload";
import type { GraphInsight } from "./gameIntelligenceGraph";

export function buildIntelligencePayload(params: {
  entityType: IntelligencePayload["entity_type"];
  entityId: string;
  sport: string;
  contextPackage: CoachGContextPackage;
  deterministic: CoachGDeterministicResult;
  model: CoachGModelOutput;
  graphInsights?: GraphInsight[];
  ttlMinutes?: number;
}): IntelligencePayload {
  const {
    entityType,
    entityId,
    sport,
    contextPackage,
    deterministic,
    model,
    graphInsights = [],
    ttlMinutes = 10,
  } = params;

  const now = Date.now();
  const expiresAt = new Date(now + ttlMinutes * 60 * 1000).toISOString();
  const generatedAt = new Date(now).toISOString();
  const g = contextPackage.gameContext;

  return {
    id: `intel:${entityType}:${entityId}:${now}`,
    entity_type: entityType,
    entity_id: entityId,
    sport,
    title: model.title,
    summary: model.summary,
    coachg_note: model.coachgNote,
    edge_score: deterministic.edge.edgeScore,
    sharp_signals: deterministic.sharpSignals.map((s) => ({
      type: s.type,
      confidence: s.confidence,
      reason_codes: s.reasonCodes,
      summary: s.summary,
      impact: s.impact,
    })),
    line_prediction: {
      current_line: deterministic.linePrediction.currentLine,
      projected_line: deterministic.linePrediction.projectedLine,
      confidence: deterministic.linePrediction.confidence,
      reason_codes: deterministic.linePrediction.reasonCodes,
    },
    prop_edges: deterministic.propEdges.map((p) => ({
      player: p.player,
      prop: p.prop,
      line: p.line,
      projection: p.projection,
      edge_score: p.edgeScore,
      confidence: p.confidence,
      reason_codes: p.reasonCodes,
    })),
    context_factors: deterministic.edge.weightedFactors,
    alerts: graphInsights.map((i) => i.summary),
    source_refs: (g?.sourceRefs || []).map((source) => ({
      source,
      updatedAt: g?.freshness.generatedAt,
    })),
    confidence: model.confidence,
    generated_at: generatedAt,
    expires_at: expiresAt,
    ui_modules: [
      {
        id: "daily_brief",
        kind: "summary",
        title: model.title,
        priority: 1,
        data: {
          summary: model.summary,
          edge_score: deterministic.edge.edgeScore,
        },
      },
      {
        id: "sharp_radar",
        kind: "signals",
        title: "Sharp Radar",
        priority: 2,
        data: {
          signals: deterministic.sharpSignals,
        },
      },
      {
        id: "line_prediction",
        kind: "market",
        title: "Line Prediction",
        priority: 3,
        data: {
          currentLine: deterministic.linePrediction.currentLine,
          projectedLine: deterministic.linePrediction.projectedLine,
          confidence: deterministic.linePrediction.confidence,
          reasonCodes: deterministic.linePrediction.reasonCodes,
        },
      },
      {
        id: "prop_edges",
        kind: "props",
        title: "Top Prop Edges",
        priority: 4,
        data: {
          edges: deterministic.propEdges.slice(0, 8),
        },
      },
    ],
    actions: [
      { id: "open_coach_chat", label: "Open Coach G", type: "open_chat" },
      {
        id: "view_game",
        label: "View Game Intelligence",
        type: "navigate",
        payload: { game_id: g?.gameId || entityId },
      },
      {
        id: "add_watchboard",
        label: "Add to Watchboard",
        type: "add_to_watchboard",
        payload: { game_id: g?.gameId || entityId },
      },
    ],
  };
}
