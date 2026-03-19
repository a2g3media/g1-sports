import type { CoachGContextPackage } from "./context";

export type CoachGTask =
  | "probability_modeling"
  | "ev_calculation"
  | "spread_prediction"
  | "prop_projection"
  | "line_movement_prediction"
  | "injury_analysis"
  | "news_summary"
  | "game_breakdown"
  | "season_trend_analysis"
  | "historical_pattern_detection"
  | "edge_scoring"
  | "sharp_radar_scan"
  | "daily_briefing"
  | "watchboard_suggestion"
  | "market_movers"
  | "value_board"
  | "video_script_generation"
  | "general_intelligence";

export type CoachGSurface =
  | "home"
  | "games"
  | "odds"
  | "game"
  | "watchboards"
  | "alerts"
  | "chat"
  | "admin"
  | "global";

export type ProviderName = "openai" | "claude" | "gemini";
export type CostTier = "low" | "medium" | "high";

export interface ModelRouteDecision {
  provider: ProviderName;
  model: string;
  reason: string;
  estimatedCostTier: CostTier;
}

export interface EdgeFactorBreakdown {
  factor: string;
  weight: number;
  value: number;
  contribution: number;
  reason: string;
}

export interface EdgeScoreResult {
  edgeScore: number;
  weightedFactors: EdgeFactorBreakdown[];
}

export type SharpReasonCode =
  | "reverse_line_movement"
  | "steam_move"
  | "public_money_divergence"
  | "trap_line_shape"
  | "none";

export interface SharpSignalResult {
  type: "sharp_money" | "public_heavy" | "trap_line" | "steam_move";
  confidence: number;
  reasonCodes: SharpReasonCode[];
  summary: string;
  impact: "high" | "medium" | "low";
}

export interface PropEdgeResult {
  player: string;
  prop: string;
  line: number;
  projection: number;
  edgeScore: number;
  confidence: number;
  reasonCodes: string[];
}

export interface LinePredictionResult {
  currentLine: number | null;
  projectedLine: number | null;
  confidence: number;
  reasonCodes: string[];
}

export interface CoachGDeterministicResult {
  edge: EdgeScoreResult;
  sharpSignals: SharpSignalResult[];
  propEdges: PropEdgeResult[];
  linePrediction: LinePredictionResult;
}

export interface CoachGModelInput {
  task: CoachGTask;
  surface: CoachGSurface;
  query: string;
  context: CoachGContextPackage;
  deterministic: CoachGDeterministicResult;
}

export interface CoachGModelOutput {
  title: string;
  summary: string;
  coachgNote: string;
  actionableIntel: string[];
  modelNotes: string[];
  confidence: number;
}

export interface CoachGProviderTelemetry {
  provider: ProviderName;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  reason: string;
  tokensIn?: number;
  tokensOut?: number;
}
