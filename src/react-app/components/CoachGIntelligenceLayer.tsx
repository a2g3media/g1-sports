import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { CoachGExternalLinkIcon } from "@/react-app/components/CoachGExternalLinkIcon";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";

interface Signal {
  icon?: string;
  message?: string;
  importance?: "high" | "medium" | "low";
}

interface Payload {
  edge_score?: number;
  summary?: string;
  sharp_radar?: Signal[];
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
  intelligence_payload?: {
    title?: string;
    summary?: string;
    edge_score?: number;
    sharp_signals?: Array<{ summary?: string; impact?: "high" | "medium" | "low" }>;
    line_prediction?: {
      current_line?: number | null;
      projected_line?: number | null;
      confidence?: number;
    };
    prop_edges?: Array<{
      player?: string;
      prop?: string;
      line?: number;
      projection?: number;
      edge_score?: number;
    }>;
    alerts?: string[];
  };
}

interface IntelligenceApiResponse {
  edge_score?: number;
  summary?: string;
  sharp_radar?: Signal[];
  line_prediction?: Payload["line_prediction"];
  player_prop_edges?: Payload["player_prop_edges"];
  actionable_intel?: string[];
  intelligence_payload?: Payload["intelligence_payload"];
}

function inferSurface(pathname: string): string {
  if (pathname === "/" || pathname === "/home") return "home";
  if (pathname.startsWith("/games")) return "games";
  if (pathname.startsWith("/odds")) return "odds";
  if (pathname.includes("/match/")) return "game";
  if (pathname.startsWith("/watchboard")) return "watchboards";
  if (pathname.startsWith("/alerts")) return "alerts";
  return "global";
}

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasInvalidZeroSignal(value: unknown): boolean {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("0.0 -> 0.0")
    || normalized.includes("0.0 → 0.0")
    || normalized.includes("0 -> 0")
    || normalized.includes("0 → 0")
    || normalized.includes("0% confidence")
    || normalized.includes("0% conf")
    || normalized.includes("edge 0")
  );
}

function buildSurfaceSummary(surface: string, gameId?: string): string {
  const gameLabel = gameId ? `Game ${gameId}` : "this slate";
  if (surface === "game") return `Coach G is tracking ${gameLabel} and refreshing the latest line signals.`;
  if (surface === "watchboards") return "Coach G is prioritizing your watchboard and surfacing the strongest movement first.";
  if (surface === "odds") return "Coach G is scanning market movement and highlighting the cleanest edges.";
  if (surface === "home") return "Coach G is building your live market brief for today.";
  return "Coach G is refreshing market context and preparing your next read.";
}

function normalizeActionables(payload: Payload | null): string[] {
  if (!payload) return [];
  const direct = Array.isArray(payload.actionable_intel)
    ? payload.actionable_intel.map((item) => cleanText(item)).filter(Boolean)
    : [];
  if (direct.length > 0) return direct.slice(0, 3);

  const fromSignals = Array.isArray(payload.intelligence_payload?.sharp_signals)
    ? payload.intelligence_payload.sharp_signals
      .map((s) => cleanText(s?.summary))
      .filter(Boolean)
    : [];
  if (fromSignals.length > 0) return fromSignals.slice(0, 3);

  const fromAlerts = Array.isArray(payload.intelligence_payload?.alerts)
    ? payload.intelligence_payload.alerts.map((a) => cleanText(a)).filter(Boolean)
    : [];
  return fromAlerts.slice(0, 3);
}

interface CoachGIntelligenceLayerProps {
  surface?: string;
  gameId?: string;
  watchedGames?: Array<{ gameId: string; label: string; sport?: string }>;
  compact?: boolean;
  className?: string;
}

interface WatchSuggestion {
  gameId: string;
  label: string;
  sport?: string;
  edge: number;
  signal: string | null;
  score: number;
}

const EMPTY_WATCHED_GAMES: Array<{ gameId: string; label: string; sport?: string }> = [];

export function CoachGIntelligenceLayer({
  surface: surfaceProp,
  gameId,
  watchedGames = EMPTY_WATCHED_GAMES,
  compact = false,
  className,
}: CoachGIntelligenceLayerProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [watchSuggestions, setWatchSuggestions] = useState<WatchSuggestion[]>([]);

  const surface = useMemo(() => surfaceProp || inferSurface(location.pathname), [surfaceProp, location.pathname]);
  const uniqueWatchedGames = useMemo(
    () =>
      Array.from(new Map(watchedGames.filter((g) => g?.gameId).map((g) => [g.gameId, g])).values()).slice(0, 8),
    [watchedGames]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const qs = new URLSearchParams({ surface });
        if (gameId) qs.set("game_id", gameId);
        const res = await fetch(`/api/coachg/intelligence?${qs.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as IntelligenceApiResponse;
        const payloadV3 = data?.intelligence_payload;
        if (!cancelled) {
          setPayload({
            edge_score: payloadV3?.edge_score ?? data?.edge_score,
            summary: payloadV3?.summary ?? data?.summary,
            sharp_radar: Array.isArray(data?.sharp_radar)
              ? data.sharp_radar
              : Array.isArray(payloadV3?.sharp_signals)
                ? payloadV3.sharp_signals.map((s) => ({ message: s?.summary, importance: s?.impact }))
                : [],
            line_prediction: payloadV3?.line_prediction || data?.line_prediction || null,
            player_prop_edges: Array.isArray(data?.player_prop_edges)
              ? data.player_prop_edges
              : Array.isArray(payloadV3?.prop_edges)
                ? payloadV3.prop_edges
                : [],
            actionable_intel: Array.isArray(data?.actionable_intel) ? data.actionable_intel : [],
            intelligence_payload: payloadV3,
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    const timer = setInterval(run, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [surface, gameId]);

  useEffect(() => {
    if (surface !== "watchboards") {
      setWatchSuggestions((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (uniqueWatchedGames.length === 0) {
      setWatchSuggestions((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const rows: Array<WatchSuggestion | null> = await Promise.all(
          uniqueWatchedGames.map(async (g) => {
            const qs = new URLSearchParams({ surface: "watchboards", game_id: g.gameId });
            const res = await fetch(`/api/coachg/intelligence?${qs.toString()}`, { credentials: "include" });
            if (!res.ok) return null;
            const data = await res.json() as IntelligenceApiResponse;
            const edge = Number(data?.edge_score || 0);
            const signals: Signal[] = Array.isArray(data?.sharp_radar) ? data.sharp_radar : [];
            const high = signals.filter((s) => s?.importance === "high").length;
            const medium = signals.filter((s) => s?.importance === "medium").length;
            const score = edge + high * 10 + medium * 4;
            return {
              gameId: g.gameId,
              label: g.label,
              sport: g.sport,
              edge,
              signal: signals[0]?.message ? String(signals[0].message) : null,
              score,
            } satisfies WatchSuggestion;
          })
        );
        if (!cancelled) {
          setWatchSuggestions(
            rows
              .filter((r): r is WatchSuggestion => r !== null)
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
          );
        }
      } catch {
        if (!cancelled) setWatchSuggestions([]);
      }
    };

    run();
    const timer = setInterval(run, 90000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [surface, uniqueWatchedGames]);

  if (!payload && error) return null;

  const topSignal = payload?.sharp_radar?.[0];
  const edge = payload?.edge_score;
  const linePrediction = payload?.line_prediction;
  const topPropEdge = payload?.player_prop_edges?.[0];
  const sharpCount = payload?.sharp_radar?.length || 0;
  const actionableItems = normalizeActionables(payload);
  const summaryText = cleanText(payload?.summary) || buildSurfaceSummary(surface, gameId);
  const edgeValue = Number(edge);
  const hasRealEdge = Number.isFinite(edgeValue) && Math.abs(edgeValue) > 0;
  const topPropEdgeValue = Number(topPropEdge?.edge_score);
  const hasRealTopPropEdge = Number.isFinite(topPropEdgeValue) && Math.abs(topPropEdgeValue) > 0;
  const currentLine = Number(linePrediction?.current_line);
  const projectedLine = Number(linePrediction?.projected_line);
  const confidenceValue = Number(linePrediction?.confidence);
  const hasValidLine =
    Boolean(linePrediction) &&
    Number.isFinite(currentLine) &&
    Number.isFinite(projectedLine) &&
    Number.isFinite(confidenceValue) &&
    currentLine > 0 &&
    projectedLine > 0 &&
    confidenceValue > 0;
  const safeTopSignalMessage = !hasInvalidZeroSignal(topSignal?.message)
    ? cleanText(topSignal?.message)
    : "";
  const createVideo = async () => {
    if (!gameId || videoBusy) return;
    setVideoBusy(true);
    setVideoMessage(null);
    try {
      const res = await fetch("/api/coachg/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ game_id: gameId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job?: { status?: string } };
      setVideoMessage(`Video job ${data?.job?.status || "queued"}.`);
    } catch (err) {
      setVideoMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setVideoBusy(false);
    }
  };

  const surfaceMeta = (() => {
    if (surface === "game") {
      if (!hasValidLine) return null;
      return {
        label: "Line Prediction",
        value: `${currentLine.toFixed(1)} -> ${projectedLine.toFixed(1)}`,
        sub: `${Math.round(confidenceValue)}% conf`,
      };
    }
    if (surface === "watchboards") {
      return {
        label: "Sharp Alerts",
        value: `${sharpCount} active`,
        sub: topSignal?.message || "No major watchboard shift detected yet",
      };
    }
    return {
      label: "Top Prop Edge",
      value:
        topPropEdge?.player && topPropEdge?.prop && hasRealTopPropEdge
          ? `${topPropEdge.player} ${topPropEdge.prop}`
          : "Analyzing matchup...",
      sub:
        hasRealTopPropEdge
          ? `Edge ${Math.round(topPropEdgeValue)}`
          : safeTopSignalMessage || "Analyzing matchup...",
    };
  })();

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-cyan-500/10 p-3",
        compact && "mb-3 p-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="sr-only">Coach G Intelligence</div>
          <p className={cn("mt-1 truncate text-sm text-white/90", compact && "text-xs")}>
            {summaryText}
          </p>
          {loading && !cleanText(payload?.summary) && (
            <p className="mt-1 text-[11px] text-white/55">Syncing Coach G intelligence...</p>
          )}
          {safeTopSignalMessage && (
            <p className={cn(
              "mt-1 text-xs",
              topSignal?.importance === "high" ? "text-amber-300" : "text-slate-300"
            )}>
              {(topSignal?.icon || "📡")} {safeTopSignalMessage}
            </p>
          )}
          {actionableItems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {actionableItems.slice(0, 2).map((item, i) => (
                <span
                  key={`${item}-${i}`}
                  className="rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100"
                  title={item}
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {surface === "game" && gameId && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={createVideo}
                disabled={videoBusy}
                className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 disabled:opacity-50"
              >
                {videoBusy ? "Creating..." : "Create Coach G Video"}
              </button>
              {videoMessage && <span className="text-[10px] text-white/60">{videoMessage}</span>}
            </div>
          )}
          {surfaceMeta && (
            <div className={cn("mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5", compact && "px-2 py-1")}>
              <p className="text-[10px] uppercase tracking-wide text-white/55">{surfaceMeta.label}</p>
              <p className={cn("truncate text-xs text-white/90", compact ? "mt-0.5" : "mt-1")}>{surfaceMeta.value}</p>
              <p className="truncate text-[10px] text-white/55">{surfaceMeta.sub}</p>
            </div>
          )}
          {surface === "watchboards" && watchSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {watchSuggestions.map((s) => (
                <button
                  key={s.gameId}
                  type="button"
                  onClick={() =>
                    s.sport
                      ? navigate(toGameDetailPath(s.sport, s.gameId))
                      : navigate("/games")
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-100"
                  title={s.signal || "Coach G watch suggestion"}
                >
                  <span className="font-semibold">{s.label}</span>
                  {Math.round(s.edge) > 0 && <span className="text-violet-300/90">{`Edge ${Math.round(s.edge)}`}</span>}
                  <CoachGExternalLinkIcon />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasRealEdge && (
            <div className="rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-center">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Edge</p>
              <p className="text-sm font-bold text-emerald-300">{edgeValue}</p>
            </div>
          )}
          <button
            onClick={() => navigate("/scout")}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-violet-500/20 px-2.5 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/30",
              compact && "px-2 py-1"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Open
            <CoachGExternalLinkIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CoachGIntelligenceLayer;
