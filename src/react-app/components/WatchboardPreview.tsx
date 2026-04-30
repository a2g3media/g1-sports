/**
 * HOMEPAGE LOCKED
 * Do not change behavior/order/render rules without explicit approval.
 * Homepage stability rules:
 * - exactly 3 Games Today cards
 * - soccer + White Sox logo stability
 * - static sport icon row behavior
 * - watchboards render immediately and stay synced on Home
 * - no flicker / no late visual swapping
 */

import { memo, useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Plus, Radio, Clock, ChevronRight, LayoutGrid, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { getTeamColors } from "@/react-app/data/team-colors";
import { useDataHubWatchboards } from "@/react-app/hooks/useDataHub";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { homeLockDevLog } from "@/react-app/lib/homeLockRules";

const DEBUG_LOG_ENDPOINT = "http://127.0.0.1:7738/ingest/3f0629af-a99a-4780-a8a2-f41a5bc25b15";
const DEBUG_SESSION_ID = "05f1a6";

interface GameData {
  game_id: string;
  sport: string;
  home_team_code: string;
  away_team_code: string;
  home_team_name?: string;
  away_team_name?: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  start_time: string;
  period_label?: string;
  clock?: string;
}

interface BoardWithGames {
  id: number;
  name: string;
  gameIds: string[];
  games: GameData[];
  hasActiveGames: boolean; // true if any game is not final
}

function inferSportFromGameId(gameId: string): string {
  const id = String(gameId || "").trim().toLowerCase();
  if (id.startsWith("sr:")) return "soccer";
  if (id.startsWith("espn_nba_")) return "nba";
  if (id.startsWith("espn_nfl_")) return "nfl";
  if (id.startsWith("espn_mlb_")) return "mlb";
  if (id.startsWith("espn_nhl_")) return "nhl";
  if (id.startsWith("espn_soccer_")) return "soccer";
  return "unknown";
}

const INVALID_TEAM_TOKENS = new Set(["", "TBD", "UNK", "UNKNOWN", "HOME", "AWAY"]);

function looksLikeRawGameId(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized.startsWith("sr:")
    || normalized.startsWith("sr_")
    || normalized.startsWith("espn_")
    || normalized.includes(":sport_event:")
    || normalized.includes(":match:");
}

function sendDebugLog(payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}): void {
  // #region agent log
  fetch(DEBUG_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      ...payload,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function isRenderableWatchboardGame(game: GameData | undefined | null): game is GameData {
  if (!game) return false;
  const sport = String(game.sport || "").trim().toLowerCase();
  if (!sport) return false;
  if (String(game.status || "").trim().toUpperCase() === "UNKNOWN") return false;
  const homeCode = String(game.home_team_code || "").trim().toUpperCase();
  const awayCode = String(game.away_team_code || "").trim().toUpperCase();
  if (INVALID_TEAM_TOKENS.has(homeCode) || INVALID_TEAM_TOKENS.has(awayCode)) return false;
  const gameId = String(game.game_id || "").trim();
  const homeName = String(game.home_team_name || "").trim();
  const awayName = String(game.away_team_name || "").trim();
  if (homeName && (looksLikeRawGameId(homeName) || homeName === gameId)) return false;
  if (awayName && (looksLikeRawGameId(awayName) || awayName === gameId)) return false;
  return true;
}

function buildGameIdAliasCandidates(gameId: string | null | undefined): string[] {
  const normalized = String(gameId || "").trim();
  if (!normalized) return [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
  };

  push(normalized);

  const soccerLegacy = normalized.startsWith("soccer_sr:sport_event:")
    ? normalized.replace(/^soccer_/, "")
    : normalized;
  push(soccerLegacy);

  const srMatch = normalized.match(/^sr_([a-z0-9]+)_(.+)$/i);
  if (srMatch) {
    const external = String(srMatch[2] || "").trim();
    push(external);
    if (external) {
      push(`sr:sport_event:${external}`);
      push(`sr:match:${external}`);
    }
  }

  if (normalized.startsWith("sr:sport_event:")) {
    const external = normalized.replace("sr:sport_event:", "").trim();
    push(external);
  }
  if (normalized.startsWith("sr:match:")) {
    const external = normalized.replace("sr:match:", "").trim();
    push(external);
  }

  const espnMatch = normalized.match(/^espn_([a-z0-9]+)_(.+)$/i);
  if (espnMatch) {
    const external = String(espnMatch[2] || "").trim();
    push(external);
  }

  return Array.from(seen);
}

function gameIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = buildGameIdAliasCandidates(a);
  const right = new Set(buildGameIdAliasCandidates(b));
  if (left.length === 0 || right.size === 0) return false;
  return left.some((value) => right.has(value));
}

// Compact game tile for preview
const PreviewTile = memo(function PreviewTile({
  game,
  onClick,
}: {
  game: GameData;
  onClick: () => void;
}) {
  const isLive = game.status?.toLowerCase() === "in_progress" || game.status?.toLowerCase() === "live";
  const isFinal = game.status?.toLowerCase() === "final" || game.status?.toLowerCase() === "closed";
  const homeColors = getTeamColors(game.home_team_code || "");
  const awayColors = getTeamColors(game.away_team_code || "");

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return "";
      const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const formattedTime = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `${formattedDate} • ${formattedTime}`;
    } catch {
      return "";
    }
  };

  const formatLiveLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return "LIVE";
      const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `LIVE • ${formattedDate}`;
    } catch {
      return "LIVE";
    }
  };

  const formatFinalLabel = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return "FINAL";
      const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `FINAL • ${formattedDate}`;
    } catch {
      return "FINAL";
    }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-sm",
        "hover:border-blue-500/30 hover:bg-slate-800/70 transition-all duration-200",
        "overflow-hidden text-left p-2.5 sm:p-3"
      )}
    >
      {/* Gradient accent */}
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, ${homeColors?.primary || "#3b82f6"}, ${awayColors?.primary || "#8b5cf6"})`,
        }}
      />

      {/* Status badge */}
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <span className="text-[9px] sm:text-[10px] font-semibold text-white/50 uppercase">{game.sport}</span>
        {isLive ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] sm:text-[9px] font-medium">
            <Radio className="w-2 h-2 sm:w-2.5 sm:h-2.5 animate-pulse" />
            {formatLiveLabel(game.start_time)}
          </span>
        ) : isFinal ? (
          <span className="px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400 text-[8px] sm:text-[9px] font-medium">
            {formatFinalLabel(game.start_time)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-slate-400 text-[8px] sm:text-[9px]">
            <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            {formatTime(game.start_time)}
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="space-y-1">
        {/* Away */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <TeamLogo
              teamCode={game.away_team_code || "TBD"}
              teamName={game.away_team_name}
              sport={game.sport || "unknown"}
              size={24}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-800"
            />
            <span className="text-xs sm:text-sm font-semibold text-white">{game.away_team_code}</span>
          </div>
          <span className={cn("text-base sm:text-lg font-bold tabular-nums", game.away_score !== null ? "text-white" : "text-slate-500")}>
            {game.away_score ?? "-"}
          </span>
        </div>
        {/* Home */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <TeamLogo
              teamCode={game.home_team_code || "TBD"}
              teamName={game.home_team_name}
              sport={game.sport || "unknown"}
              size={24}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-800"
            />
            <span className="text-xs sm:text-sm font-semibold text-white">{game.home_team_code}</span>
          </div>
          <span className={cn("text-base sm:text-lg font-bold tabular-nums", game.home_score !== null ? "text-white" : "text-slate-500")}>
            {game.home_score ?? "-"}
          </span>
        </div>
      </div>

      {/* Period/Clock for live */}
      {isLive && game.period_label && (
        <div className="mt-1.5 pt-1 border-t border-white/5 text-center">
          <span className="text-[9px] sm:text-[10px] text-white/40">
            {game.period_label} • {game.clock || ""}
          </span>
        </div>
      )}
    </button>
  );
});

// Single board section
const BoardSection = memo(function BoardSection({
  board,
  onGameClick,
  onDeleteBoard,
  canDeleteBoard,
}: {
  board: BoardWithGames;
  onGameClick: (game: GameData) => void;
  onDeleteBoard?: (board: BoardWithGames) => void;
  canDeleteBoard?: boolean;
}) {
  const boardGameIds = Array.isArray(board.gameIds) ? board.gameIds : [];
  const hydratedGames = Array.isArray(board.games) ? board.games.filter(isRenderableWatchboardGame) : [];
  // Keep board order, but tolerate canonical/raw game-id alias differences.
  const displayEntries = boardGameIds.map((gameId) => {
    const normalizedGameId = String(gameId || "").trim();
    const matchedGame = hydratedGames.find((game) => gameIdsMatch(game.game_id, normalizedGameId));
    if (matchedGame) {
      return { kind: "game" as const, gameId: normalizedGameId, game: matchedGame };
    }
    return { kind: "unresolved" as const, gameId: normalizedGameId };
  });
  const unresolvedCount = displayEntries.filter((entry) => entry.kind === "unresolved").length;

  return (
    <div className="space-y-2">
      {/* Board header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] sm:text-xs text-white/60 font-medium">
            {board.name}
          </span>
          <span className="text-[10px] text-white/30">
            {boardGameIds.length} game{boardGameIds.length !== 1 ? "s" : ""}
          </span>
          {unresolvedCount > 0 && (
            <span className="text-[10px] text-amber-300/70">
              • {unresolvedCount} syncing
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            to={`/watchboard/${board.id}`}
            className="text-[10px] sm:text-[11px] font-medium text-blue-400/60 hover:text-blue-400 transition-colors flex items-center gap-0.5"
          >
            Open
            <ChevronRight className="w-3 h-3" />
          </Link>
          {canDeleteBoard && onDeleteBoard && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-1 text-white/45 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label={`Board actions for ${board.name}`}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onDeleteBoard(board)}
                  className="text-red-400 focus:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete Board
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Games grid - 2 columns */}
      {displayEntries.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {displayEntries.map((entry, idx) => (
            entry.kind === "game" ? (
              <PreviewTile
                key={`game-${entry.game.game_id}-${idx}`}
                game={entry.game}
                onClick={() => onGameClick(entry.game)}
              />
            ) : (
              <div
                key={`sync-${entry.gameId || idx}`}
                className="rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-3 py-3 text-[10px] text-amber-200/75"
              >
                <div className="font-semibold tracking-wide uppercase">Syncing</div>
                <div className="mt-1 text-amber-100/70">Game details are still loading.</div>
              </div>
            )
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50">
          {unresolvedCount > 0 ? `Syncing ${unresolvedCount} game${unresolvedCount === 1 ? "" : "s"}...` : "No valid games yet"}
        </div>
      )}

    </div>
  );
});

// Empty state component
function EmptyState() {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-6 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-gradient-to-br from-blue-500/15 to-purple-500/15 border border-blue-500/20 flex items-center justify-center">
        <Eye className="w-5 h-5 text-blue-400/60" />
      </div>
      <p className="text-sm font-medium text-white/50 mb-1">No games yet</p>
      <p className="text-xs text-white/30 mb-4">Add games to your watchboard to track them here</p>
      <Link
        to="/games"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Browse Games
      </Link>
    </div>
  );
}

export const WatchboardPreview = memo(function WatchboardPreview() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const [boards, setBoards] = useState<BoardWithGames[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all boards with their games - OPTIMIZED: API now returns full game data
  const fetchBoardsWithGames = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch boards with FULL game data in single request (no N+1 queries)
      const res = await fetch("/api/watchboards/home-preview", {
        headers: { "x-user-id": user.id.toString() },
      });
      const data = await res.json();
      const rawBoardsData: Array<{ 
        id: number; 
        name: string; 
        gameIds: string[];
        games: Array<{
          game_id: string;
          sport: string;
          home_team_code: string;
          away_team_code: string;
          home_team_name: string | null;
          away_team_name: string | null;
          home_score: number | null;
          away_score: number | null;
          status: string;
          start_time: string;
          period_label: string | null;
          clock: string | null;
        }>;
      }> = data.boards || [];
      const seenBoardIds = new Set<number>();
      const boardsData = rawBoardsData.filter((board) => {
        const id = Number(board?.id);
        const name = String(board?.name || "").trim();
        if (!Number.isFinite(id) || id <= 0 || !name) return false;
        if (seenBoardIds.has(id)) return false;
        seenBoardIds.add(id);
        return true;
      });

      if (boardsData.length === 0) {
        setBoards([]);
        setIsLoading(false);
        return;
      }

      // Transform API data to component format
      const rejectionCounts = {
        missingSport: 0,
        unknownStatus: 0,
        invalidTeamToken: 0,
        rawName: 0,
      };
      const boardsWithGames: BoardWithGames[] = boardsData.map(b => {
        const mappedGames: GameData[] = b.games.map(g => ({
          game_id: g.game_id,
          sport: g.sport,
          home_team_code: g.home_team_code,
          away_team_code: g.away_team_code,
          home_team_name: g.home_team_name || undefined,
          away_team_name: g.away_team_name || undefined,
          home_score: g.home_score,
          away_score: g.away_score,
          status: g.status,
          start_time: g.start_time,
          period_label: g.period_label || undefined,
          clock: g.clock || undefined,
        }));
        const games: GameData[] = mappedGames.filter((game) => {
          const sport = String(game.sport || "").trim().toLowerCase();
          if (!sport) {
            rejectionCounts.missingSport += 1;
            return false;
          }
          if (String(game.status || "").trim().toUpperCase() === "UNKNOWN") {
            rejectionCounts.unknownStatus += 1;
            return false;
          }
          const homeCode = String(game.home_team_code || "").trim().toUpperCase();
          const awayCode = String(game.away_team_code || "").trim().toUpperCase();
          if (INVALID_TEAM_TOKENS.has(homeCode) || INVALID_TEAM_TOKENS.has(awayCode)) {
            rejectionCounts.invalidTeamToken += 1;
            return false;
          }
          const gameId = String(game.game_id || "").trim();
          const homeName = String(game.home_team_name || "").trim();
          const awayName = String(game.away_team_name || "").trim();
          if (homeName && (looksLikeRawGameId(homeName) || homeName === gameId)) {
            rejectionCounts.rawName += 1;
            return false;
          }
          if (awayName && (looksLikeRawGameId(awayName) || awayName === gameId)) {
            rejectionCounts.rawName += 1;
            return false;
          }
          return true;
        });
        
        const hasActiveGames = games.some(g => {
          const status = g.status?.toLowerCase();
          return status !== "final" && status !== "closed";
        });

        return {
          id: b.id,
          name: b.name,
          gameIds: b.gameIds,
          games,
          hasActiveGames,
        };
      });

      // Show all boards with games (including final/completed slates)
      // so recently updated watchboards don't disappear from Home.
      const boardsToShow = boardsWithGames.filter(b => (b.gameIds?.length || 0) > 0 || b.games.length > 0);
      // #region agent log
      sendDebugLog({
        runId: "syncing-debug-run1",
        hypothesisId: "H2",
        location: "src/react-app/components/WatchboardPreview.tsx:fetchBoardsWithGames",
        message: "home preview renderability summary",
        data: {
          boardCount: boardsData.length,
          boardRows: boardsData.reduce((sum, board) => sum + (Array.isArray(board?.gameIds) ? board.gameIds.length : 0), 0),
          hydratedRowsRaw: boardsData.reduce((sum, board) => sum + (Array.isArray(board?.games) ? board.games.length : 0), 0),
          hydratedRowsRenderable: boardsWithGames.reduce((sum, board) => sum + board.games.length, 0),
          unresolvedRows: boardsWithGames.reduce((sum, board) => sum + Math.max(0, (board.gameIds?.length || 0) - (board.games?.length || 0)), 0),
          rejectionCounts,
        },
      });
      // #endregion
      setBoards(boardsToShow);
    } catch (e) {
      console.error("Error fetching watchboards:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Fetch on mount and refresh with exponential backoff
  const errorCountRef = useRef(0);
  
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const BASE_INTERVAL = 30000;
    const MAX_BACKOFF = 240000; // 4 minutes max
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await fetchBoardsWithGames();
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    // Initial fetch
    fetchBoardsWithGames();
    // Start polling after first interval
    timeoutId = setTimeout(pollWithBackoff, BASE_INTERVAL);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [fetchBoardsWithGames]);

  // Handle game click
  const handleGameClick = useCallback((game: GameData) => {
    const inferredSport = game.sport && game.sport !== "unknown"
      ? game.sport
      : inferSportFromGameId(game.game_id);
    const sport = inferredSport?.toLowerCase() || "nba";
    navigate(toGameDetailPath(sport, game.game_id));
  }, [navigate]);

  const handleDeleteBoard = useCallback(async (board: BoardWithGames) => {
    if (!user?.id) return;
    const confirmed = window.confirm(`Delete "${board.name}"?`);
    if (!confirmed) return;
    setBoards((prev) => prev.filter((b) => b.id !== board.id));
    homeLockDevLog("watchboard optimistic action applied", {
      action: "board:delete",
      boardId: board.id,
      source: "home-watchboard-preview",
    });
    try {
      const res = await fetch(`/api/watchboards/${board.id}`, {
        method: "DELETE",
        headers: { "x-user-id": user.id.toString() },
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      window.dispatchEvent(new CustomEvent("watchboards:changed", {
        detail: {
          source: "home-watchboard-preview",
          action: "board:delete",
          boardId: board.id,
          afterCount: 0,
        },
      }));
    } catch (err) {
      console.error("Failed to delete watchboard from Home preview:", err);
      fetchBoardsWithGames();
    }
  }, [fetchBoardsWithGames, user?.id]);

  // Don't render while loading
  if (isLoading) {
    return null;
  }

  // No active boards
  if (boards.length === 0) {
    return (
      <section>
        <div className="flex items-center justify-between mb-2 lg:mb-2.5 px-1">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm lg:text-base font-black text-white/60 uppercase tracking-wider">
              Your Watchboards
            </h2>
          </div>
          <Link
            to="/watchboard"
            className="text-[11px] font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
          >
            View All
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <EmptyState />
      </section>
    );
  }

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 lg:mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm lg:text-base font-black text-white/60 uppercase tracking-wider">
            Your Watchboards
          </h2>
          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-[10px] text-blue-400 font-semibold">
            {boards.length} active
          </span>
        </div>
        <Link
          to="/watchboard"
          className="text-[11px] font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
        >
          View All
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Boards */}
      <div className="space-y-4">
        {boards.map((board) => (
          <BoardSection
            key={board.id}
            board={board}
            onGameClick={handleGameClick}
            onDeleteBoard={handleDeleteBoard}
            canDeleteBoard={Boolean(user?.id)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4">
        <Link
          to="/watchboard"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm font-medium text-white/60 hover:text-white/80 transition-all"
        >
          <LayoutGrid className="w-4 h-4" />
          All Watchboards
        </Link>
        <Link
          to="/games"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-sm font-medium text-blue-400 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Games
        </Link>
      </div>
    </section>
  );
});

/**
 * WatchboardPreviewHub - Version that uses consolidated DataHub polling
 * No internal polling - data comes from parent DataHubProvider
 */
export const WatchboardPreviewHub = memo(function WatchboardPreviewHub() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const { boards, loading, refresh } = useDataHubWatchboards();
  const homeWatchboardLoggedRef = useRef(false);
  const boardCount = boards.length;
  const itemCounts = boards.map((board) => board.gameIds.length);
  const ids = Array.from(new Set(
    boards.flatMap((board) => board.gameIds.map((id) => String(id || "").trim()).filter(Boolean))
  ));

  // Handle game click
  const handleGameClick = useCallback((game: GameData) => {
    const sport = game.sport?.toLowerCase() || "nba";
    navigate(toGameDetailPath(sport, game.game_id));
  }, [navigate]);

  const handleDeleteBoard = useCallback(async (board: BoardWithGames) => {
    if (!user?.id) return;
    const confirmed = window.confirm(`Delete "${board.name}"?`);
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/watchboards/${board.id}`, {
        method: "DELETE",
        headers: { "x-user-id": user.id.toString() },
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      window.dispatchEvent(new CustomEvent("watchboards:changed", {
        detail: {
          source: "home-watchboard-preview-hub",
          action: "board:delete",
          boardId: board.id,
          afterCount: 0,
        },
      }));
      homeLockDevLog("watchboard optimistic action applied", {
        action: "board:delete",
        boardId: board.id,
        source: "home-watchboard-preview-hub",
      });
      await refresh();
    } catch (err) {
      console.error("Failed to delete watchboard from Home preview hub:", err);
    }
  }, [refresh, user?.id]);

  useEffect(() => {
    if (homeWatchboardLoggedRef.current) return;
    const watchboardSource = (typeof window !== "undefined" ? (window as any).__GZ_WATCHBOARD_SOURCE_LAST__ : null) || null;
    const source = String(watchboardSource?.source || "datahub:/api/watchboards/home-preview");
    const emptyStateShown = !loading && boardCount === 0;
    console.log("[HOME WATCHBOARD DATA]", {
      source,
      boardCount,
      itemCounts,
      ids,
      emptyStateShown,
    });
    homeWatchboardLoggedRef.current = true;
  }, [boardCount, ids, itemCounts, loading]);

  useEffect(() => {
    const unresolvedRows = boards.reduce((sum, board) => {
      const existing = new Set((board.games || []).map((g) => String(g?.game_id || "").trim()));
      return sum + (board.gameIds || []).filter((id) => !existing.has(String(id || "").trim())).length;
    }, 0);
    // #region agent log
    sendDebugLog({
      runId: "syncing-debug-run3",
      hypothesisId: "H6",
      location: "src/react-app/components/WatchboardPreview.tsx:WatchboardPreviewHub",
      message: "hub boards state rendered",
      data: {
        loading,
        boardCount: boards.length,
        boardGameIds: boards.reduce((sum, board) => sum + (board.gameIds?.length || 0), 0),
        boardGames: boards.reduce((sum, board) => sum + (board.games?.length || 0), 0),
        unresolvedRows,
      },
    });
    // #endregion
  }, [boards, loading]);

  // Don't render while loading
  if (loading) {
    return null;
  }

  // No active boards
  if (boards.length === 0) {
    return (
      <section>
        <div className="flex items-center justify-between mb-2 lg:mb-2.5 px-1">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm lg:text-base font-black text-white/60 uppercase tracking-wider">
              Your Watchboards
            </h2>
          </div>
          <Link
            to="/watchboard"
            className="text-[11px] font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
          >
            View All
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <EmptyState />
      </section>
    );
  }

  // Transform boards to expected format
  const boardsWithGames: BoardWithGames[] = boards.map(b => ({
    id: b.id,
    name: b.name,
    gameIds: b.gameIds,
    games: b.games,
    hasActiveGames: b.hasActiveGames,
  }));

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 lg:mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm lg:text-base font-black text-white/60 uppercase tracking-wider">
            Your Watchboards
          </h2>
          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-[10px] text-blue-400 font-semibold">
            {boardsWithGames.length} active
          </span>
        </div>
        <Link
          to="/watchboard"
          className="text-[11px] font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
        >
          View All
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Boards */}
      <div className="space-y-4">
        {boardsWithGames.map((board) => (
          <BoardSection
            key={board.id}
            board={board}
            onGameClick={handleGameClick}
            onDeleteBoard={handleDeleteBoard}
            canDeleteBoard={Boolean(user?.id)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4">
        <Link
          to="/watchboard"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm font-medium text-white/60 hover:text-white/80 transition-all"
        >
          <LayoutGrid className="w-4 h-4" />
          All Watchboards
        </Link>
        <Link
          to="/games"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-sm font-medium text-blue-400 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Games
        </Link>
      </div>
    </section>
  );
});

export default WatchboardPreview;
