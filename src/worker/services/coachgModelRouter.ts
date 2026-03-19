import type { CoachGSurface, CoachGTask, ModelRouteDecision, ProviderName } from "../types/coachg";

const OPENAI_TASKS: CoachGTask[] = [
  "probability_modeling",
  "ev_calculation",
  "spread_prediction",
  "prop_projection",
  "line_movement_prediction",
  "edge_scoring",
  "daily_briefing",
  "watchboard_suggestion",
  "market_movers",
  "video_script_generation",
];

const CLAUDE_TASKS: CoachGTask[] = [
  "injury_analysis",
  "news_summary",
  "game_breakdown",
  "value_board",
];

const GEMINI_TASKS: CoachGTask[] = [
  "season_trend_analysis",
  "historical_pattern_detection",
  "sharp_radar_scan",
];

function modelForProvider(provider: ProviderName, env?: Env): string {
  if (provider === "openai") return env?.OPENAI_COACHG_MODEL || "gpt-4o-mini";
  if (provider === "claude") return env?.ANTHROPIC_COACHG_MODEL || "claude-sonnet-4-5";
  return env?.GEMINI_COACHG_MODEL || "gemini-1.5-pro";
}

export function routeCoachGModel(task: CoachGTask, env?: Env): ModelRouteDecision {
  if (OPENAI_TASKS.includes(task)) {
    return {
      provider: "openai",
      model: modelForProvider("openai", env),
      reason: "Math/reasoning-heavy task",
      estimatedCostTier: "medium",
    };
  }

  if (CLAUDE_TASKS.includes(task)) {
    return {
      provider: "claude",
      model: modelForProvider("claude", env),
      reason: "Narrative and analysis-focused task",
      estimatedCostTier: "medium",
    };
  }

  if (GEMINI_TASKS.includes(task)) {
    return {
      provider: "gemini",
      model: modelForProvider("gemini", env),
      reason: "Large dataset pattern task",
      estimatedCostTier: "high",
    };
  }

  return {
    provider: "openai",
    model: modelForProvider("openai", env),
    reason: "Default intelligence routing",
    estimatedCostTier: "low",
  };
}

export function detectCoachGTask(intent: string): CoachGTask {
  const lower = intent.toLowerCase();
  if (lower.includes("daily brief") || lower.includes("daily briefing")) return "daily_briefing";
  if (lower.includes("value board")) return "value_board";
  if (lower.includes("market movers")) return "market_movers";
  if (lower.includes("video script") || lower.includes("heygen")) return "video_script_generation";
  if (lower.includes("watchboard")) return "watchboard_suggestion";
  if (lower.includes("sharp") || lower.includes("steam") || lower.includes("trap")) return "sharp_radar_scan";
  if (lower.includes("edge score") || lower.includes("edge")) return "edge_scoring";
  if (lower.includes("probability") || lower.includes("chance")) return "probability_modeling";
  if (lower.includes("ev") || lower.includes("expected value")) return "ev_calculation";
  if (lower.includes("spread") && lower.includes("predict")) return "spread_prediction";
  if (lower.includes("prop") && lower.includes("project")) return "prop_projection";
  if (lower.includes("line") && lower.includes("move")) return "line_movement_prediction";
  if (lower.includes("injury")) return "injury_analysis";
  if (lower.includes("news")) return "news_summary";
  if (lower.includes("season") || lower.includes("trend")) return "season_trend_analysis";
  if (lower.includes("historical") || lower.includes("pattern")) return "historical_pattern_detection";
  if (lower.includes("breakdown") || lower.includes("analyze")) return "game_breakdown";
  return "general_intelligence";
}

export function detectCoachGTaskForSurface(intent: string, surface: CoachGSurface | string): CoachGTask {
  const explicit = detectCoachGTask(intent);
  if (explicit !== "general_intelligence") return explicit;

  const s = surface.toLowerCase();
  if (s === "watchboards") return "watchboard_suggestion";
  if (s === "alerts") return "sharp_radar_scan";
  if (s === "home") return "daily_briefing";
  if (s === "games" || s === "odds" || s === "game") return "edge_scoring";
  if (s === "admin") return "market_movers";
  return "general_intelligence";
}
