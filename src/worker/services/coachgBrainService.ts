import {
  buildCoachGContextPackage,
  buildUserContext,
  type CoachGGameContext,
  type CoachGUserContext,
} from "./coachgContextEngine";
import { fetchGameWithFallback, fetchLiveGamesWithFallback, fetchScheduledGamesWithFallback } from "./providers";
import type { CoachGContextPackage } from "../types/context";
import { detectCoachGTaskForSurface, routeCoachGModel } from "./coachgModelRouter";
import { runCoachGModelTask, type CoachGModelExecution } from "./coachgModelRuntime";
import type { CoachGDeterministicResult, CoachGModelOutput, CoachGSurface } from "../types/coachg";
import type { IntelligencePayload } from "../types/intelligencePayload";
import { calculateEdgeScore } from "./edgeScoreCalculator";
import { calculateSharpRadar } from "./sharpRadarCalculator";
import { calculatePropEdges } from "./propEdgeCalculator";
import { predictLineDirection } from "./linePredictionEngine";
import { buildGameIntelligenceGraph } from "./gameIntelligenceGraph";
import { buildIntelligencePayload } from "./intelligencePayloadFactory";
import { recordCoachGModelUsage } from "./coachgTelemetry";
import { enforceInformationalClosing, sanitizeCoachGList, sanitizeCoachGText } from "./coachgCompliance";

type Db = D1Database;

export interface CoachGSignal {
  type: "sharp_money" | "public_heavy" | "trap_line" | "steam_move" | "injury" | "prop_move";
  icon: string;
  message: string;
  importance: "high" | "medium" | "low";
}

export interface CoachGIntelligenceOutput {
  architecture: {
    interface: "coachg_interface";
    brain: "coachg_brain_service";
    context_engine: "game_context_engine_v2";
    model_router: "coachg_model_router";
    data_layer: "sports_data_layer";
  };
  contexts: {
    game_context: CoachGGameContext | null;
    team_context: CoachGContextPackage["teamContext"];
    player_context: CoachGContextPackage["playerContext"];
    market_context: CoachGContextPackage["marketContext"];
    user_context: CoachGUserContext;
  };
  model_route: {
    task: string;
    provider: string;
    model: string;
    reason: string;
    latency_ms?: number;
    fallback_used?: boolean;
  };
  edge_score: number;
  sharp_radar: CoachGSignal[];
  line_prediction: {
    current_line: number | null;
    projected_line: number | null;
    confidence: number;
  };
  player_prop_edges: Array<{
    player: string;
    prop: string;
    line: number;
    projection: number;
    edge_score: number;
  }>;
  summary: string;
  actionable_intel?: string[];
  model_notes?: string[];
  generated_at: string;
  intelligence_payload?: IntelligencePayload;
  context_package?: CoachGContextPackage;
  context_meta?: {
    context_source: "provider_chain" | "sdio_fallback" | "none";
    market_source: "odds_snapshots" | "sdio_fallback" | "none";
    fallback_reason: string | null;
  };
}

type BrainCacheEntry = {
  at: number;
  value: CoachGIntelligenceOutput;
};

type ContextQuality = {
  hasGameContext: boolean;
  hasOdds: boolean;
  propsCount: number;
  sharpRadarCount: number;
  hasLinePrediction: boolean;
  score: number;
};

const BRAIN_CACHE_TTL_MS = 45000;
const brainCache = new Map<string, BrainCacheEntry>();
const DEFAULT_GAME_TTL_MS = 60000;
let defaultGameCache: { at: number; gameId: string } | null = null;

function isPersonalizationBoilerplate(text: string): boolean {
  const t = String(text || "").toLowerCase();
  const hasFollowPrompt =
    t.includes("follow specific teams") ||
    t.includes("follow teams") ||
    t.includes("followed teams") ||
    t.includes("followed players") ||
    t.includes("your watchlist");
  const hasUnavailablePrompt =
    t.includes("unavailable") ||
    t.includes("inactive") ||
    t.includes("configured") ||
    t.includes("configure") ||
    t.includes("to surface") ||
    t.includes("to trigger");
  const hasNoContextPrompt =
    t.includes("no game context") ||
    t.includes("no real-time game data") ||
    t.includes("cannot be grounded") ||
    t.includes("no computed data was provided");

  return (
    t.includes("no personalization data") ||
    t.includes("favorite sports") ||
    t.includes("favourite sports") ||
    t.includes("set your favorite") ||
    t.includes("no followed teams") ||
    t.includes("no followed players") ||
    t.includes("no followed teams on file") ||
    t.includes("no followed players detected") ||
    t.includes("no game context") ||
    t.includes("no real-time game data") ||
    t.includes("cannot surface sport-specific") ||
    t.includes("without a sport context") ||
    t.includes("without a defined scope") ||
    (hasFollowPrompt && hasUnavailablePrompt) ||
    hasNoContextPrompt
  );
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isActionableSummary(text: string, gameContext: CoachGGameContext | null): boolean {
  const s = normalizeText(text).toLowerCase();
  if (!s || s.length < 24) return false;
  if (isPersonalizationBoilerplate(s)) return false;
  const hasMarketTerms =
    s.includes("line") ||
    s.includes("spread") ||
    s.includes("total") ||
    s.includes("moneyline") ||
    s.includes("prop") ||
    s.includes("edge") ||
    s.includes("steam") ||
    s.includes("sharp") ||
    s.includes("market") ||
    s.includes("momentum");
  if (!gameContext) return hasMarketTerms;
  const home = normalizeText(gameContext.homeTeam).toLowerCase();
  const away = normalizeText(gameContext.awayTeam).toLowerCase();
  return hasMarketTerms || s.includes(home) || s.includes(away);
}

function buildOperationalHomeSummary(
  gameContext: CoachGGameContext | null,
  deterministic: CoachGDeterministicResult,
  fallbackLabel?: string
): string {
  if (!gameContext) {
    const label = normalizeText(fallbackLabel || "this matchup");
    return `Live read: ${label}. Monitoring market movement while matchup context finalizes.`;
  }
  const edge = Math.max(0, Math.round(Number(deterministic.edge.edgeScore || 0)));
  const signal = deterministic.sharpSignals[0]?.summary || "No major market anomaly yet.";
  const line = deterministic.linePrediction;
  const lineText = Number.isFinite(Number(line.currentLine)) && Number.isFinite(Number(line.projectedLine))
    ? ` Line ${Number(line.currentLine).toFixed(1)} -> ${Number(line.projectedLine).toFixed(1)} (${Math.round(Number(line.confidence || 0))}% confidence).`
    : "";
  return `Live read: ${gameContext.awayTeam} @ ${gameContext.homeTeam} (Edge ${edge}). ${signal}${lineText}`;
}

function buildOperationalHomeActionables(
  gameContext: CoachGGameContext | null,
  deterministic: CoachGDeterministicResult,
  fallbackLabel?: string
): string[] {
  if (!gameContext) {
    const label = normalizeText(fallbackLabel || "this matchup");
    return [`Monitoring live line movement and momentum shifts for ${label}.`];
  }
  const list: string[] = [];
  const line = deterministic.linePrediction;
  if (Number.isFinite(Number(line.currentLine)) && Number.isFinite(Number(line.projectedLine))) {
    list.push(
      `Line watch: ${Number(line.currentLine).toFixed(1)} -> ${Number(line.projectedLine).toFixed(1)} (${Math.round(Number(line.confidence || 0))}% confidence).`
    );
  }
  if (deterministic.sharpSignals[0]?.summary) {
    list.push(`Signal watch: ${deterministic.sharpSignals[0].summary}`);
  }
  if (deterministic.propEdges[0]) {
    const p = deterministic.propEdges[0];
    list.push(`Top prop edge: ${p.player} ${p.prop} ${p.line} (edge ${Math.round(Number(p.edgeScore || 0))}).`);
  }
  if (list.length === 0) {
    list.push(`Monitor ${gameContext.awayTeam} @ ${gameContext.homeTeam} for live line movement and momentum changes.`);
  }
  return list.slice(0, 4);
}

function computeContextQuality(
  contextPackage: CoachGContextPackage,
  deterministic: CoachGDeterministicResult
): ContextQuality {
  const market = (contextPackage.marketContext || {}) as Record<string, unknown>;
  const oddsArrays = [
    market.odds,
    market.lines,
    market.bookLines,
    market.snapshots,
  ].filter(Array.isArray) as unknown[][];
  const hasOdds = oddsArrays.some((arr) => arr.length > 0);
  const hasLinePrediction =
    Number.isFinite(Number(deterministic.linePrediction.currentLine)) &&
    Number.isFinite(Number(deterministic.linePrediction.projectedLine));
  const quality: ContextQuality = {
    hasGameContext: Boolean(contextPackage.gameContext),
    hasOdds,
    propsCount: deterministic.propEdges.length,
    sharpRadarCount: deterministic.sharpSignals.length,
    hasLinePrediction,
    score: 0,
  };
  quality.score =
    (quality.hasGameContext ? 2 : 0) +
    (quality.hasOdds ? 2 : 0) +
    (quality.propsCount > 0 ? 1 : 0) +
    (quality.sharpRadarCount > 0 ? 1 : 0) +
    (quality.hasLinePrediction ? 1 : 0);
  return quality;
}

function toLegacySignals(deterministic: CoachGDeterministicResult): CoachGSignal[] {
  return deterministic.sharpSignals.map((s) => ({
    type: s.type,
    icon: s.type === "steam_move" ? "📈" : s.type === "trap_line" ? "⚠" : s.type === "sharp_money" ? "🔥" : "💰",
    message: s.summary,
    importance: s.impact,
  }));
}

function toModelOutput(summary: string, actionable_intel?: string[], model_notes?: string[]): CoachGModelOutput {
  return {
    title: "Coach G Intelligence",
    summary,
    coachgNote: actionable_intel?.[0] || summary,
    actionableIntel: actionable_intel || [],
    modelNotes: model_notes || [],
    confidence: 74,
  };
}

function toProviderFallbackGameContext(game: {
  game_id: string;
  sport?: string;
  league?: string;
  home_team_name?: string;
  away_team_name?: string;
  start_time?: string;
  status?: string;
  home_score?: number;
  away_score?: number;
}): CoachGGameContext {
  const now = new Date().toISOString();
  return {
    gameId: String(game.game_id || ""),
    sport: String(game.sport || "unknown").toLowerCase(),
    league: game.league ? String(game.league) : null,
    homeTeam: String(game.home_team_name || "HOME"),
    awayTeam: String(game.away_team_name || "AWAY"),
    startTime: game.start_time ? String(game.start_time) : null,
    status: game.status ? String(game.status) : null,
    score: {
      home: Number.isFinite(Number(game.home_score)) ? Number(game.home_score) : null,
      away: Number.isFinite(Number(game.away_score)) ? Number(game.away_score) : null,
    },
    spread: null,
    moneyline: { home: null, away: null },
    total: null,
    openingLine: { spread: null, total: null, moneylineHome: null, moneylineAway: null },
    currentLine: { spread: null, total: null, moneylineHome: null, moneylineAway: null },
    lineMovement: 0,
    publicBettingPercentage: { home: null, away: null },
    moneyPercentage: { home: null, away: null },
    injuries: [],
    projectedLineups: [],
    restDays: { home: null, away: null },
    travelDistance: { home: null, away: null },
    backToBack: { home: false, away: false },
    recentForm: { home: null, away: null },
    headToHeadHistory: null,
    weather: null,
    newsBriefs: [],
    propLines: [],
    propLineMovement: [],
    sourceRefs: ["providers_live_game_feed"],
    freshness: {
      generatedAt: now,
      dataAgeMinutes: null,
      isStale: false,
    },
  };
}

export async function runCoachGBrain(params: {
  db: Db;
  env: Env;
  userId: string | null;
  surface?: string;
  gameId?: string;
  query?: string;
}): Promise<CoachGIntelligenceOutput> {
  const { db, env, userId, gameId, query, surface = "global" } = params;
  const normalizedQuery = String(query || "").trim().toLowerCase().slice(0, 160);
  const cacheKey = `${surface}:${gameId || "none"}:${normalizedQuery}:${userId || "anon"}`;
  const cached = brainCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BRAIN_CACHE_TTL_MS) return cached.value;

  let selectedGameId = gameId;
  let contextSource: "provider_chain" | "sdio_fallback" | "none" = "none";
  let marketSource: "odds_snapshots" | "sdio_fallback" | "none" = "none";
  let contextFallbackReason: string | null = null;
  if (!selectedGameId) {
    if (defaultGameCache && Date.now() - defaultGameCache.at < DEFAULT_GAME_TTL_MS) {
      selectedGameId = defaultGameCache.gameId;
    }
  }
  if (!selectedGameId) {
    try {
      const liveSports =
        surface === "home" || surface === "chat"
          ? ["ncaab", "nba", "nfl", "mlb"]
          : ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer"];
      const live = await fetchLiveGamesWithFallback({
        sports: liveSports as Array<"nba" | "nfl" | "mlb" | "nhl" | "ncaab" | "ncaaf" | "soccer" | "mma" | "golf" | "nascar">,
      });
      selectedGameId = live.data[0]?.game_id;
      if (selectedGameId) {
        contextSource = "provider_chain";
        marketSource = "odds_snapshots";
        defaultGameCache = { at: Date.now(), gameId: selectedGameId };
      } else {
        const upcoming = await fetchScheduledGamesWithFallback({
          hours: surface === "home" || surface === "chat" ? 8 : 24,
        });
        selectedGameId = upcoming.data[0]?.game_id;
        if (selectedGameId) {
          contextSource = "provider_chain";
          marketSource = "odds_snapshots";
          defaultGameCache = { at: Date.now(), gameId: selectedGameId };
        } else {
          contextFallbackReason = live.error || upcoming.error || "No provider game available";
        }
      }
    } catch (err) {
      contextFallbackReason = String(err);
    }
  }

  // Data retrieval first
  let contextPackage = await buildCoachGContextPackage({
    db,
    env,
    userId,
    gameId: selectedGameId,
    query,
  });
  if (!contextPackage.gameContext && selectedGameId) {
    const providerFallback = await fetchGameWithFallback(selectedGameId);
    const providerGame = providerFallback.data?.game;
    if (providerGame) {
      contextPackage = {
        ...contextPackage,
        gameContext: toProviderFallbackGameContext(providerGame),
      };
      contextSource = "provider_chain";
      marketSource = "none";
      contextFallbackReason = providerFallback.error || contextFallbackReason;
    } else if (providerFallback.error) {
      contextFallbackReason = providerFallback.error;
    }
  }
  const gameContext = contextPackage.gameContext;
  if (gameContext && contextSource === "none") {
    const refs = Array.isArray(gameContext.sourceRefs) ? gameContext.sourceRefs : [];
    if (refs.some((r) => String(r).includes("providers_live_game_feed"))) {
      contextSource = "provider_chain";
      marketSource = refs.some((r) => String(r).includes("odds_snapshots")) ? "odds_snapshots" : "none";
    } else if (refs.length > 0) {
      contextSource = "sdio_fallback";
      marketSource = "sdio_fallback";
    }
  }
  const userContext = contextPackage.userContext || await buildUserContext(db, userId);

  // Deterministic calculations second
  const deterministic: CoachGDeterministicResult = {
    edge: calculateEdgeScore(contextPackage),
    sharpSignals: calculateSharpRadar(contextPackage),
    propEdges: calculatePropEdges(contextPackage),
    linePrediction: predictLineDirection(contextPackage),
  };
  const contextQuality = computeContextQuality(contextPackage, deterministic);

  // Graph enrichment third
  const graph = buildGameIntelligenceGraph(contextPackage);

  // Model routing/synthesis fourth
  const task = detectCoachGTaskForSurface(query || "general_intelligence", surface as CoachGSurface);
  const route = routeCoachGModel(task, env);
  const modelTimeoutMs = surface === "home" || surface === "chat" ? 1800 : 12000;
  const modelController = new AbortController();
  const modelTimer = setTimeout(() => modelController.abort("coachg_model_timeout"), modelTimeoutMs);
  const deterministicSummary = gameContext
    ? `Coach G Edge ${deterministic.edge.edgeScore}: ${gameContext.awayTeam} @ ${gameContext.homeTeam}. ${deterministic.sharpSignals[0]?.summary || "No major market anomaly yet."}`
    : "Coach G is online, but no game context is available yet.";

  let modelExecution: CoachGModelExecution;
  try {
    modelExecution = env.COACHG_V3_ENABLED === "false"
      ? {
          ai: {
            summary: deterministicSummary,
            actionable_intel: deterministic.sharpSignals.slice(0, 3).map((s) => s.summary),
            model_notes: ["COACHG_V3_ENABLED=false, deterministic-only mode."],
          },
          telemetry: {
            provider: "deterministic",
            model: "none",
            latency_ms: 0,
            fallback_used: false,
            reason: "Feature flag disabled model layer",
          },
        }
      : await runCoachGModelTask({
          env,
          task,
          route,
          signal: modelController.signal,
          fallbackSummary: deterministicSummary,
          prompt: {
            task,
            query: query || "general_intelligence",
            surface,
            gameContext,
            userContext,
            edgeScore: deterministic.edge.edgeScore,
            linePrediction: {
              current_line: deterministic.linePrediction.currentLine,
              projected_line: deterministic.linePrediction.projectedLine,
              confidence: deterministic.linePrediction.confidence,
            },
            sharpRadar: deterministic.sharpSignals.map((s) => ({ message: s.summary, importance: s.impact })),
            propEdges: deterministic.propEdges.map((p) => ({
              player: p.player,
              prop: p.prop,
              line: p.line,
              projection: p.projection,
              edge_score: p.edgeScore,
            })),
            newsBriefs: gameContext?.newsBriefs || [],
          },
        });
  } finally {
    clearTimeout(modelTimer);
  }
  if (modelController.signal.aborted && modelExecution.telemetry.provider !== "deterministic") {
    modelExecution = {
      ai: {
        summary: deterministicSummary,
        actionable_intel: deterministic.sharpSignals.slice(0, 3).map((s) => s.summary),
        model_notes: ["Model response timeout; served deterministic fallback."],
      },
      telemetry: {
        provider: "deterministic",
        model: "none",
        latency_ms: modelTimeoutMs,
        fallback_used: true,
        reason: "Model timeout budget exceeded",
      },
    };
  }

  const rawSummary = sanitizeCoachGText(enforceInformationalClosing(modelExecution.ai.summary || deterministicSummary));
  let cleanSummary = isPersonalizationBoilerplate(rawSummary) ? deterministicSummary : rawSummary;
  const cleanActionableRaw = sanitizeCoachGList(modelExecution.ai.actionable_intel, 4);
  let cleanActionable = cleanActionableRaw
    .filter((line) => !isPersonalizationBoilerplate(line))
    .slice(0, 4);
  const shouldUseOperationalHomeOutput =
    surface === "home" &&
    (!isActionableSummary(cleanSummary, gameContext) || cleanActionable.length === 0);
  let fallbackTemplateReason: string | null = null;
  if (shouldUseOperationalHomeOutput) {
    fallbackTemplateReason = !isActionableSummary(cleanSummary, gameContext)
      ? "invalid_or_generic_summary"
      : "empty_actionable";
    const fallbackLabel = query && query !== surface ? query : selectedGameId;
    cleanSummary = buildOperationalHomeSummary(gameContext, deterministic, fallbackLabel);
    cleanActionable = buildOperationalHomeActionables(gameContext, deterministic, fallbackLabel);
  } else if (cleanActionable.length === 0 && gameContext) {
    cleanActionable.push(`Monitor ${gameContext.awayTeam} @ ${gameContext.homeTeam} for live line movement and momentum changes.`);
  }
  const cleanModelNotes = sanitizeCoachGList(modelExecution.ai.model_notes, 3);

  const modelPayload = toModelOutput(
    cleanSummary,
    cleanActionable,
    cleanModelNotes
  );
  const intelligencePayload = buildIntelligencePayload({
    entityType: gameContext ? "game" : "user_brief",
    entityId: gameContext?.gameId || userId || "global",
    sport: gameContext?.sport || "multi",
    contextPackage,
    deterministic,
    model: modelPayload,
    graphInsights: graph.insights,
  });

  const sharpRadar = toLegacySignals(deterministic);
  const linePrediction = {
    current_line: deterministic.linePrediction.currentLine,
    projected_line: deterministic.linePrediction.projectedLine,
    confidence: deterministic.linePrediction.confidence,
  };
  const propEdges = deterministic.propEdges.map((p) => ({
    player: p.player,
    prop: p.prop,
    line: p.line,
    projection: p.projection,
    edge_score: p.edgeScore,
  }));

  const output: CoachGIntelligenceOutput = {
    architecture: {
      interface: "coachg_interface",
      brain: "coachg_brain_service",
      context_engine: "game_context_engine_v2",
      model_router: "coachg_model_router",
      data_layer: "sports_data_layer",
    },
    contexts: {
      game_context: gameContext,
      team_context: contextPackage.teamContext,
      player_context: contextPackage.playerContext,
      market_context: contextPackage.marketContext,
      user_context: userContext,
    },
    model_route: {
      task,
      provider: modelExecution.telemetry.provider,
      model: modelExecution.telemetry.model,
      reason: modelExecution.telemetry.reason,
      latency_ms: modelExecution.telemetry.latency_ms,
      fallback_used: modelExecution.telemetry.fallback_used,
    },
    edge_score: deterministic.edge.edgeScore,
    sharp_radar: sharpRadar,
    line_prediction: linePrediction,
    player_prop_edges: propEdges,
    summary: cleanSummary,
    actionable_intel: cleanActionable,
    model_notes: cleanModelNotes,
    generated_at: new Date().toISOString(),
    intelligence_payload: intelligencePayload,
    context_package: contextPackage,
    context_meta: {
      context_source: contextSource,
      market_source: marketSource,
      fallback_reason: contextFallbackReason,
    },
  };
  recordCoachGModelUsage({
    at: output.generated_at,
    provider: output.model_route.provider,
    model: output.model_route.model,
    latencyMs: output.model_route.latency_ms || 0,
    fallbackUsed: Boolean(output.model_route.fallback_used),
    task,
  });
  if (surface === "home") {
    console.info("[CoachG][home_intel]", JSON.stringify({
      game_id: selectedGameId || null,
      provider: output.model_route.provider,
      fallback_used: Boolean(output.model_route.fallback_used),
      context_quality: contextQuality,
      template_fallback_reason: fallbackTemplateReason,
    }));
  }
  brainCache.set(cacheKey, { at: Date.now(), value: output });
  return output;
}
