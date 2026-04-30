/**
 * AI Intelligence Feed
 *
 * Home page intelligence layer powered by Coach G runtime output.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/react-app/lib/utils";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { 
  Brain,
  Zap, 
  TrendingUp, 
  AlertTriangle, 
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import type { LiveGame } from "@/react-app/hooks/useLiveGames";

interface GameContextSignal {
  type: string;
  label: string;
  value: string;
  importance: 'high' | 'medium' | 'low';
  icon?: string;
}

interface GameContext {
  gameId: string;
  sport: string;
  signals: GameContextSignal[];
  coachGNote: string;
  headline: string;
  edgeScore: number;
  linePrediction?: {
    currentLine: number | null;
    projectedLine: number | null;
    confidence: number;
  } | null;
  topPropEdge?: {
    player: string;
    prop: string;
    line: number;
    projection: number;
    edgeScore: number;
  } | null;
  provider?: string;
  model?: string;
  modelFallbackUsed?: boolean;
  dataStatus?: 'live' | 'syncing' | 'fallback';
  updatedAt?: string;
}

interface CoachGRawSignal {
  type?: string;
  icon?: string;
  message?: string;
  importance?: 'high' | 'medium' | 'low';
}

interface CoachGIntelligenceResponse {
  summary?: string;
  edge_score?: number;
  sharp_radar?: CoachGRawSignal[];
  line_prediction?: {
    current_line?: number | null;
    projected_line?: number | null;
    confidence?: number;
  } | null;
  player_prop_edges?: Array<{
    player?: string;
    prop?: string;
    line?: number;
    projection?: number;
    edge_score?: number;
  }>;
  actionable_intel?: string[];
  generated_at?: string;
  model_route?: {
    provider?: string;
    model?: string;
    fallback_used?: boolean;
  };
}

const SIGNAL_COLORS = {
  high: 'bg-red-500/22 border-red-400/45 text-red-200',
  medium: 'bg-amber-500/22 border-amber-400/45 text-amber-200',
  low: 'bg-slate-500/15 border-slate-300/25 text-slate-200',
};

interface AIIntelligenceFeedProps {
  games: LiveGame[];
  className?: string;
}

function normalizeDisplayText(value: unknown): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COACH_G_PLACEHOLDER_TOKENS = [
  "safe fallback",
  "pre-game signals syncing",
  "signals syncing",
  "syncing",
  "fallback",
];

function isPlaceholderCoachGText(value: unknown): boolean {
  const normalized = normalizeDisplayText(value).toLowerCase();
  if (!normalized) return true;
  return COACH_G_PLACEHOLDER_TOKENS.some((token) => normalized.includes(token));
}

function isInvalidZeroSignalText(value: unknown): boolean {
  const normalized = normalizeDisplayText(value).toLowerCase();
  if (!normalized) return false;
  const hasZeroLine =
    normalized.includes("0.0 -> 0.0")
    || normalized.includes("0 -> 0")
    || normalized.includes("0.0 → 0.0")
    || normalized.includes("0 → 0");
  const hasZeroConfidence =
    normalized.includes("0% confidence")
    || normalized.includes("0% conf")
    || normalized.includes("(0%)");
  const hasEdgeZero = normalized.includes("edge 0");
  return hasZeroLine || hasZeroConfidence || hasEdgeZero;
}

function isValidPositiveMetric(value: unknown): value is number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function hasStrictValidLinePrediction(
  linePrediction?: { currentLine: number | null; projectedLine: number | null; confidence: number } | null
): linePrediction is { currentLine: number; projectedLine: number; confidence: number } {
  if (!linePrediction) return false;
  return (
    isValidPositiveMetric(linePrediction.currentLine)
    && isValidPositiveMetric(linePrediction.projectedLine)
    && isValidPositiveMetric(linePrediction.confidence)
  );
}

function isGenericProfileScopeMessage(text: string): boolean {
  const normalized = text.toLowerCase();
  const hasFollowPrompt =
    normalized.includes("follow specific teams") ||
    normalized.includes("follow teams") ||
    normalized.includes("followed teams") ||
    normalized.includes("followed players") ||
    normalized.includes("watchlist");
  const hasUnavailablePrompt =
    normalized.includes("unavailable") ||
    normalized.includes("inactive") ||
    normalized.includes("configured") ||
    normalized.includes("configure") ||
    normalized.includes("to surface") ||
    normalized.includes("to trigger");
  const hasNoContextPrompt =
    normalized.includes("no game context") ||
    normalized.includes("no real-time game data") ||
    normalized.includes("cannot be grounded") ||
    normalized.includes("no computed data was provided");
  return (
    normalized.includes("no personalization data") ||
    normalized.includes("no favorite sports selected") ||
    normalized.includes("no favorite sports configured") ||
    normalized.includes("set your favorite") ||
    normalized.includes("add favorite sports") ||
    normalized.includes("no followed teams on file") ||
    normalized.includes("no followed players detected") ||
    normalized.includes("no followed teams") ||
    normalized.includes("no followed players") ||
    normalized.includes("no game context") ||
    normalized.includes("no real-time game data") ||
    normalized.includes("without a defined scope") ||
    normalized.includes("without a sport context") ||
    normalized.includes("cannot surface sport-specific") ||
    (hasFollowPrompt && hasUnavailablePrompt) ||
    hasNoContextPrompt
  );
}

function isActionableModelNote(note: string, game: LiveGame): boolean {
  const n = normalizeDisplayText(note).toLowerCase();
  if (!n || n.length < 24 || isGenericProfileScopeMessage(n)) return false;
  const away = game.awayTeam.abbreviation.toLowerCase();
  const home = game.homeTeam.abbreviation.toLowerCase();
  const hasTeamAnchor = n.includes(away) || n.includes(home);
  const hasMarketKeyword =
    n.includes("line") ||
    n.includes("spread") ||
    n.includes("total") ||
    n.includes("prop") ||
    n.includes("market") ||
    n.includes("injury") ||
    n.includes("steam") ||
    n.includes("momentum");
  const hasNumericDetail = /\b-?\d+(\.\d+)?\b/.test(n);
  return hasTeamAnchor || (hasMarketKeyword && hasNumericDetail);
}

export function AIIntelligenceFeed({ games, className }: AIIntelligenceFeedProps) {
  const navigate = useNavigate();
  const [contexts, setContexts] = useState<Map<string, GameContext>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayGames = useMemo(() => games.slice(0, 8), [games]);
  const displayGameIdsKey = useMemo(() => displayGames.map((g) => g.id).join("|"), [displayGames]);
  const REQUEST_TIMEOUT_MS = 9000;

  const signalTypeLabel = useCallback((type?: string) => {
    const normalized = String(type || 'signal').replace(/_/g, ' ').trim();
    if (!normalized) return 'Signal';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }, []);

  const getCoachGId = useCallback((game: LiveGame) => {
    const candidates = [
      game.id,
      (game as any)?.gameId,
      (game as any)?.game_id,
      (game as any)?.provider_game_id,
      (game as any)?.providerGameId,
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean);

    const canonical = candidates.find((id) => !id.startsWith('gen_') && !id.startsWith('demo_'));
    return canonical || null;
  }, []);

  const toFallbackContext = useCallback((game: LiveGame, reason?: string): GameContext => {
    return {
      gameId: game.id,
      sport: game.sport,
      signals: [],
      coachGNote: "Analyzing matchup...",
      headline: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
      edgeScore: 0,
      linePrediction: null,
      topPropEdge: null,
      dataStatus: reason?.toLowerCase().includes('fetching') || reason?.toLowerCase().includes('warming') || reason?.toLowerCase().includes('sync')
        ? 'syncing'
        : 'fallback',
      updatedAt: new Date().toISOString(),
    };
  }, []);

  const normalizeCoachGContext = useCallback((game: LiveGame, data: CoachGIntelligenceResponse): GameContext => {
    const sharpSignals: GameContextSignal[] = Array.isArray(data.sharp_radar)
      ? data.sharp_radar
          .filter((s) => s && typeof s === 'object')
          .slice(0, 6)
          .map((s) => {
            const importance: GameContextSignal['importance'] =
              s.importance === 'high' || s.importance === 'low' ? s.importance : 'medium';
            return {
              type: String(s.type || 'signal'),
              label: signalTypeLabel(s.type),
              value: String(s.message || 'Signal detected'),
              importance,
              icon: s.icon || undefined,
            };
          })
          .filter((s) => !isPlaceholderCoachGText(s.value) && !isInvalidZeroSignalText(s.value))
      : [];

    const bestProp = (Array.isArray(data.player_prop_edges) ? [...data.player_prop_edges] : [])
      .filter((p) => p && typeof p === 'object')
      .sort((a, b) => Number(b?.edge_score || 0) - Number(a?.edge_score || 0))[0];

    const summaryText = normalizeDisplayText(data.summary);
    const actionable = Array.isArray(data.actionable_intel) ? data.actionable_intel : [];
    const coachNote = normalizeDisplayText(actionable[0] || summaryText);

    const fallbackContext = toFallbackContext(game, 'Coach G data is warming up.');
    const edgeScoreValue = Number(data.edge_score);
    const hasValidEdgeScore = isValidPositiveMetric(edgeScoreValue);
    const lineCurrent = Number(data.line_prediction?.current_line);
    const lineProjected = Number(data.line_prediction?.projected_line);
    const lineConfidence = Number(data.line_prediction?.confidence);
    const hasValidLine = isValidPositiveMetric(lineCurrent)
      && isValidPositiveMetric(lineProjected)
      && isValidPositiveMetric(lineConfidence);
    const liveScore = game.status === 'IN_PROGRESS'
      ? `Score ${game.awayTeam.abbreviation} ${game.awayTeam.score ?? 0}-${game.homeTeam.score ?? 0} ${game.homeTeam.abbreviation}.`
      : '';
    const lineShiftText = hasValidLine
      ? `Line ${lineCurrent.toFixed(1)} -> ${lineProjected.toFixed(1)} (${Math.round(lineConfidence)}% confidence).`
      : '';
    const topSignalText = sharpSignals[0]?.value ? `Signal: ${sharpSignals[0].value}.` : '';
    const topPropEdgeScore = Number(bestProp?.edge_score);
    const hasValidTopProp = Boolean(bestProp)
      && isValidPositiveMetric(topPropEdgeScore)
      && !isPlaceholderCoachGText(bestProp?.player)
      && !isPlaceholderCoachGText(bestProp?.prop);
    const topPropText = hasValidTopProp
      ? `Top prop: ${String(bestProp?.player)} ${String(bestProp?.prop)} ${Number(bestProp?.line || 0)} (edge ${Math.round(topPropEdgeScore)}).`
      : '';
    const hasAnyValidSignal = hasValidEdgeScore || hasValidLine || hasValidTopProp;
    const matchupInsight = `Matchup Insight: ${game.awayTeam.abbreviation} vs ${game.homeTeam.abbreviation}`;
    const generatedOperationalNote = hasAnyValidSignal
      ? [matchupInsight, liveScore, topSignalText, lineShiftText, topPropText]
          .map((s) => normalizeDisplayText(s))
          .filter(Boolean)
          .join(" ")
      : "";

    const sanitizedCoachNote = hasAnyValidSignal
      ? (
        isActionableModelNote(coachNote, game) && !isPlaceholderCoachGText(coachNote) && !isInvalidZeroSignalText(coachNote)
          ? coachNote
          : generatedOperationalNote || matchupInsight
      )
      : "Analyzing matchup...";

    return {
      ...fallbackContext,
      signals: sharpSignals,
      coachGNote: sanitizedCoachNote || "Analyzing matchup...",
      headline: summaryText ? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}` : fallbackContext.headline,
      edgeScore: Number(data.edge_score || 0),
      linePrediction: data.line_prediction
        ? {
            currentLine: data.line_prediction.current_line ?? null,
            projectedLine: data.line_prediction.projected_line ?? null,
            confidence: Number(data.line_prediction.confidence || 0),
          }
        : null,
      topPropEdge: bestProp
        ? {
            player: String(bestProp.player || 'Player'),
            prop: String(bestProp.prop || 'Prop'),
            line: Number(bestProp.line || 0),
            projection: Number(bestProp.projection || 0),
            edgeScore: Number(bestProp.edge_score || 0),
          }
        : null,
      provider: data.model_route?.provider || undefined,
      model: data.model_route?.model || undefined,
      modelFallbackUsed: Boolean(data.model_route?.fallback_used),
      dataStatus: isActionableModelNote(sanitizedCoachNote, game) && !data.model_route?.fallback_used ? 'live' : 'fallback',
      updatedAt: data.generated_at || new Date().toISOString(),
    };
  }, [signalTypeLabel, toFallbackContext]);

  useEffect(() => {
    if (displayGames.length === 0) {
      setContexts(new Map());
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchBatchContext() {
      setLoading(true);
      setError(null);
      const contextMap = new Map<string, GameContext>();
      setContexts((prev) => {
        const next = new Map<string, GameContext>();
        for (const game of displayGames) {
          const existing = prev.get(game.id);
          next.set(game.id, existing || toFallbackContext(game, "Fetching live Coach G intel..."));
        }
        for (const [k, v] of next) contextMap.set(k, v);
        return next;
      });
      try {
        const settled = await Promise.allSettled(
          displayGames.map(async (game) => {
            const coachGameId = getCoachGId(game);
            const matchupQuery = `${game.sport} ${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation} live intelligence`;
            const requestVariants: URLSearchParams[] = [];
            if (coachGameId) {
              requestVariants.push(new URLSearchParams({ surface: 'home', game_id: coachGameId }));
              requestVariants.push(new URLSearchParams({ surface: 'home', game_id: coachGameId, q: matchupQuery }));
            }
            requestVariants.push(new URLSearchParams({ surface: 'home', q: matchupQuery }));

            for (const qs of requestVariants) {
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
                let response: Response;
                try {
                  response = await fetch(`/api/coachg/intelligence?${qs.toString()}`, {
                    credentials: 'include',
                    signal: controller.signal,
                  });
                } finally {
                  clearTimeout(timeout);
                }
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                const data = (await response.json()) as CoachGIntelligenceResponse;
                const normalized = normalizeCoachGContext(game, data);
                const shouldTryNextVariant =
                  qs.has('game_id') && !isActionableModelNote(normalized.coachGNote, game);
                if (!shouldTryNextVariant) {
                  return { key: game.id, context: normalized };
                }
              } catch (err) {
                console.warn('[AIIntelligenceFeed] Coach G request variant failed', {
                  gameId: game.id,
                  coachGameId,
                  params: qs.toString(),
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }

            return { key: game.id, context: toFallbackContext(game, 'Temporary provider delay. Coach G is retrying.') };
          })
        );

        for (const result of settled) {
          if (result.status === 'fulfilled') {
            contextMap.set(result.value.key, result.value.context);
          }
        }

        if (!cancelled) {
          setContexts(contextMap);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Coach G intelligence temporarily unavailable.');
        }
        console.error('[AIIntelligenceFeed] Error fetching Coach G context:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBatchContext();
    return () => {
      cancelled = true;
    };
  }, [displayGameIdsKey, displayGames, getCoachGId, normalizeCoachGContext, toFallbackContext]);

  // Navigate to game
  const handleGameClick = useCallback((game: LiveGame) => {
    const sport = game.sport.toLowerCase();
    const gameId = game.id || (game as any).game_id || "";
    navigate(toGameDetailPath(sport, gameId));
  }, [navigate]);
  
  // Get games with high-priority signals first
  const sortedGames = [...displayGames].sort((a, b) => {
    const ctxA = contexts.get(a.id);
    const ctxB = contexts.get(b.id);
    
    const highA = ctxA?.signals.filter(s => s.importance === 'high').length || 0;
    const highB = ctxB?.signals.filter(s => s.importance === 'high').length || 0;
    
    // Sort by high priority signals first
    if (highB !== highA) return highB - highA;
    
    // Then by live status
    if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
    if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
    
    return 0;
  });

  const modelFootprint = useMemo(() => {
    const providers = new Set<string>();
    for (const ctx of contexts.values()) {
      if (ctx.provider) providers.add(ctx.provider);
    }
    return providers.size > 0 ? Array.from(providers).join(', ') : 'Live AI models connected';
  }, [contexts]);

  if (displayGames.length === 0) {
    return null;
  }
  
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/[0.05] via-slate-900/40 to-slate-900/20 p-3 sm:p-5 shadow-[0_10px_40px_rgba(0,0,0,0.25)]",
        className
      )}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="absolute -inset-1.5 rounded-full bg-violet-500/30 blur-md animate-pulse" />
            <div className="relative rounded-full ring-2 ring-violet-300/45 shadow-[0_0_20px_rgba(167,139,250,0.25)]">
              <CoachGAvatar size="sm" presence={loading ? "alert" : "monitoring"} className="rounded-full" />
            </div>
          </div>
          <div>
            <h2 className="text-sm sm:text-[15px] font-black text-white uppercase tracking-wider flex items-center gap-2">
              Game Intelligence
              {loading && (
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </h2>
            <p className="text-[10px] text-white/50 flex items-center gap-1">
              <Brain className="w-3 h-3 text-violet-400/70" />
              Coach G live analysis • {modelFootprint}
            </p>
          </div>
        </div>
        
        <button 
          onClick={() => navigate('/games')}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary font-semibold transition-colors"
        >
          All Games
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      {/* Intelligence Cards */}
      <div className="space-y-3 sm:space-y-4">
        {loading && contexts.size === 0 && (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-white/60">
            Syncing Coach G context across active games...
          </div>
        )}
        {error && contexts.size === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {error}
          </div>
        )}
        {sortedGames.slice(0, 5).map((game) => {
          const context = contexts.get(game.id);
          return (
            <IntelligenceCard
              key={game.id}
              game={game}
              context={context}
              onClick={() => handleGameClick(game)}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * Individual game intelligence card
 */
function IntelligenceCard({
  game,
  context,
  onClick,
}: {
  game: LiveGame;
  context?: GameContext;
  onClick: () => void;
}) {
  const isLive = game.status === 'IN_PROGRESS';
  const cleanedCoachNote = normalizeDisplayText(context?.coachGNote);
  const summaryText = cleanedCoachNote && !isPlaceholderCoachGText(cleanedCoachNote)
    ? cleanedCoachNote
    : "Analyzing matchup...";
  const topSignals = (context?.signals || [])
    .filter((signal) => !isPlaceholderCoachGText(signal.value) && !isInvalidZeroSignalText(signal.value))
    .slice(0, 3);
  const edgeValue = Number(context?.edgeScore);
  const hasEdgeMetric = isValidPositiveMetric(edgeValue);
  const hasLineMetric = hasStrictValidLinePrediction(context?.linePrediction);
  const topPropEdgeScore = Number(context?.topPropEdge?.edgeScore);
  const hasPropMetric = Boolean(context?.topPropEdge)
    && isValidPositiveMetric(topPropEdgeScore)
    && !isPlaceholderCoachGText(context?.topPropEdge?.player)
    && !isPlaceholderCoachGText(context?.topPropEdge?.prop);
  const strictLinePrediction = hasLineMetric ? context?.linePrediction : null;
  const linePredictionText = hasLineMetric && context?.linePrediction
    ? `${strictLinePrediction!.currentLine!.toFixed(1)} -> ${strictLinePrediction!.projectedLine!.toFixed(1)} (${Math.round(strictLinePrediction!.confidence)}% conf)`
    : null;
  const hasAnyValidMetric = hasEdgeMetric || hasLineMetric || hasPropMetric;
  const primaryLineText = hasAnyValidMetric ? summaryText : "Analyzing matchup...";
  const lastUpdatedLabel = formatUpdatedTime(context?.updatedAt);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full relative overflow-hidden rounded-xl",
        "bg-gradient-to-br from-slate-900/95 via-slate-800/88 to-slate-900/95",
        "border border-white/12",
        "backdrop-blur-sm",
        "p-4",
        "text-left",
        "hover:border-violet-400/35 hover:bg-slate-800/95 hover:shadow-[0_10px_28px_rgba(139,92,246,0.18)]",
        "active:scale-[0.995]",
        "transition-all duration-250",
        "group"
      )}
    >
      {/* Live indicator glow */}
      {isLive && (
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-transparent pointer-events-none" />
      )}
      
      {/* Top Row: Teams + Status */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        {/* Teams */}
        <div className="flex items-center gap-3">
          {/* Away Team */}
          <div className="flex items-center gap-2">
            <TeamLogo
              teamCode={game.awayTeam.abbreviation}
              sport={game.sport}
              size={24}
              className="shrink-0"
            />
            <span className="text-sm font-bold text-white/95 truncate max-w-[80px]">
              {game.awayTeam.abbreviation}
            </span>
            {isLive && (
              <span className="text-base font-bold text-white">
                {game.awayTeam.score ?? 0}
              </span>
            )}
          </div>
          
          <span className="text-white/30 text-xs">@</span>
          
          {/* Home Team */}
          <div className="flex items-center gap-2">
            <TeamLogo
              teamCode={game.homeTeam.abbreviation}
              sport={game.sport}
              size={24}
              className="shrink-0"
            />
            <span className="text-sm font-bold text-white/95 truncate max-w-[80px]">
              {game.homeTeam.abbreviation}
            </span>
            {isLive && (
              <span className="text-base font-bold text-white">
                {game.homeTeam.score ?? 0}
              </span>
            )}
          </div>
        </div>
        
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/25 border border-red-400/45 shadow-[0_0_14px_rgba(239,68,68,0.28)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[10px] font-bold text-red-400 uppercase">Live</span>
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-full bg-white/8 border border-white/15">
              <span className="text-[10px] font-semibold text-white/65">
                {formatGameTime(game.startTime)}
              </span>
            </div>
          )}
          
          <span className="text-[10px] font-bold text-primary/75 uppercase bg-primary/15 px-2 py-1 rounded border border-primary/25">
            {game.sport}
          </span>
        </div>
      </div>
      
      {hasAnyValidMetric && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-white/45">
            Updated {lastUpdatedLabel}
          </span>
        </div>
      )}

      {hasAnyValidMetric && topSignals.length > 0 && (
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-3.5">
          {topSignals.map((signal, idx) => (
            <SignalPill key={`${signal.type}-${idx}`} signal={signal} />
          ))}
        </div>
      )}

      {/* Metrics */}
      {hasAnyValidMetric && (
        <div className="mb-3 sm:mb-3.5 flex flex-wrap gap-1.5 sm:gap-2">
          {hasEdgeMetric && (
            <span className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
              Edge {Math.round(edgeValue)}
            </span>
          )}
          {linePredictionText && (
            <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
              Line {linePredictionText}
            </span>
          )}
          {hasPropMetric && context?.topPropEdge && (
            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              Prop {context.topPropEdge.player} {context.topPropEdge.prop}
            </span>
          )}
        </div>
      )}
      
      {/* Coach G Note */}
      <div className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-violet-500/14 border border-violet-400/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <CoachGAvatar size="xs" presence={isLive ? "alert" : "monitoring"} className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-violet-500/30" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold text-violet-400">Coach G</span>
              <Sparkles className="w-3 h-3 text-violet-400/50" />
            </div>
            <p className="text-xs text-white/80 leading-relaxed line-clamp-2">
              {primaryLineText}
            </p>
          </div>
      </div>
      
      {/* View Arrow */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-5 h-5 text-white/30" />
      </div>
    </button>
  );
}

/**
 * Signal pill component
 */
function SignalPill({ signal }: { signal: GameContextSignal }) {
  const colorClass = SIGNAL_COLORS[signal.importance];
  
  const IconComponent = signal.importance === 'high' 
    ? AlertTriangle 
    : signal.importance === 'medium' 
    ? TrendingUp 
    : Zap;
  
  return (
    <div className={cn(
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.02)]",
      colorClass
    )}>
      {signal.icon ? (
        <span className="text-xs">{signal.icon}</span>
      ) : (
        <IconComponent className="w-3 h-3" />
      )}
      <span className="truncate max-w-[140px]">{signal.value}</span>
    </div>
  );
}

/**
 * Format game time for display
 */
function formatGameTime(startTime?: string): string {
  if (!startTime) return 'TBD';
  
  try {
    const date = new Date(startTime);
    const now = new Date();
    
    // If today, just show time
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    
    // Otherwise show day + time
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'TBD';
  }
}

function formatUpdatedTime(updatedAt?: string): string {
  if (!updatedAt) return 'just now';
  try {
    const date = new Date(updatedAt);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'just now';
  }
}

export default AIIntelligenceFeed;
