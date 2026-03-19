import type { CoachGTask } from "../types/coachg";
import type { CoachGGameContext, CoachGUserContext } from "./coachgContextEngine";

export interface CoachGPromptInput {
  task: CoachGTask;
  query: string;
  surface: string;
  gameContext: CoachGGameContext | null;
  userContext: CoachGUserContext;
  edgeScore: number;
  linePrediction: {
    current_line: number | null;
    projected_line: number | null;
    confidence: number;
  };
  sharpRadar: Array<{ message: string; importance: "high" | "medium" | "low" }>;
  propEdges: Array<{ player: string; prop: string; line: number; projection: number; edge_score: number }>;
  newsBriefs?: string[];
}

export interface CoachGAIResult {
  summary: string;
  actionable_intel: string[];
  model_notes: string[];
}

const BASE_SYSTEM_PROMPT = [
  "You are Coach G, the Sports Intelligence Engine for GZ Sports.",
  "Be concise, specific, and data-grounded. No hype.",
  "Do not provide direct betting commands. Never say: 'Bet this team', 'Take this parlay', or 'This is a lock bet'.",
  "Provide context, trends, edge framing, and risk factors only.",
  "Write like a calm, confident sports analyst speaking to the G1 community.",
  "When data is missing, explicitly say what is unavailable.",
  "Return strict JSON only with keys: summary, actionable_intel, model_notes.",
].join(" ");

export function buildCoachGSystemPrompt(task: CoachGTask): string {
  const taskGuide: Record<CoachGTask, string> = {
    probability_modeling: "Focus on probabilistic framing and uncertainty ranges.",
    ev_calculation: "Focus on value framing, edge sizing, and fair-price logic.",
    spread_prediction: "Focus on spread directionality and market pressure.",
    prop_projection: "Focus on player prop context, role, and variance factors.",
    line_movement_prediction: "Focus on line movement catalysts and confidence.",
    injury_analysis: "Focus on injury availability impact and lineup shifts.",
    news_summary: "Focus on short news synthesis and market impact.",
    game_breakdown: "Focus on matchup dynamics and key swing factors.",
    season_trend_analysis: "Focus on season-level trends and historical context.",
    historical_pattern_detection: "Focus on repeatable patterns and caveats.",
    edge_scoring: "Explain the main factors that are increasing/decreasing edge score.",
    sharp_radar_scan: "Highlight sharp/public imbalance and trap/steam warnings.",
    daily_briefing: "Generate a short personalized daily intelligence brief.",
    watchboard_suggestion: "Recommend what to prioritize watching and why.",
    market_movers: "Summarize biggest market movers and key catalysts.",
    value_board: "Highlight strongest value board entries and why they matter.",
    video_script_generation: "Create a short spoken script suitable for 20-60 second video. Start with: 'What's up G1, Coach G here.'",
    general_intelligence: "Provide the highest-signal intelligence available.",
  };
  return `${BASE_SYSTEM_PROMPT} ${taskGuide[task] || taskGuide.general_intelligence}`;
}

export function buildCoachGUserPrompt(input: CoachGPromptInput): string {
  const topEdges = input.propEdges.slice(0, 3);
  const topSignals = input.sharpRadar.slice(0, 4);
  const isHomeSurface = input.surface === "home";
  const gc = input.gameContext;
  const compactGameContext = gc
    ? {
        gameId: gc.gameId,
        sport: gc.sport,
        league: gc.league,
        homeTeam: gc.homeTeam,
        awayTeam: gc.awayTeam,
        startTime: gc.startTime,
        status: gc.status,
        score: gc.score,
        spread: gc.spread,
        total: gc.total,
        lineMovement: gc.lineMovement,
        moneyline: gc.moneyline,
        injuries: (gc.injuries || []).slice(0, 4),
        projectedLineups: (gc.projectedLineups || []).slice(0, 2),
      }
    : null;

  return JSON.stringify(
    {
      request: {
        task: input.task,
        surface: input.surface,
        query: input.query || "general intelligence",
      },
      game_context: compactGameContext,
      user_context: {
        favorite_sports: input.userContext.favoriteSports,
        favorite_teams: input.userContext.favoriteTeams,
        followed_players: input.userContext.trackedPlayers,
      },
      computed_intelligence: {
        edge_score: input.edgeScore,
        line_prediction: input.linePrediction,
        sharp_radar: topSignals,
        top_prop_edges: topEdges,
        article_briefs: (input.newsBriefs || []).slice(0, 3),
      },
      output_requirements: {
        summary_max_words: 40,
        actionable_intel_max_items: 4,
        model_notes_max_items: 3,
        home_surface_rules: isHomeSurface
          ? [
              "Prioritize matchup-specific intelligence over profile-personalization comments.",
              "Do not mention missing favorites/followed teams/watchlist configuration.",
              "If context is limited, still provide a concrete market-focused live read.",
            ]
          : undefined,
      },
    },
    null,
    2
  );
}

export function normalizeCoachGAIResult(raw: unknown, fallback: string): CoachGAIResult {
  if (!raw || typeof raw !== "object") {
    return { summary: fallback, actionable_intel: [], model_notes: [] };
  }
  const payload = raw as Record<string, unknown>;
  const summary = typeof payload.summary === "string" && payload.summary.trim().length > 0
    ? payload.summary.trim()
    : fallback;
  const actionable_intel = Array.isArray(payload.actionable_intel)
    ? payload.actionable_intel.map((x) => String(x)).slice(0, 4)
    : [];
  const model_notes = Array.isArray(payload.model_notes)
    ? payload.model_notes.map((x) => String(x)).slice(0, 3)
    : [];
  return { summary, actionable_intel, model_notes };
}
