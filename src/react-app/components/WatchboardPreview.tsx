/**
 * WatchboardPreview - Home page module showing user's active watchboards
 * Shows all boards with games that aren't final, auto-hides completed boards
 */

import { memo, useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Plus, Radio, Clock, ChevronRight, LayoutGrid } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { getTeamLogoUrl } from "@/react-app/lib/teamLogos";
import { getTeamColors } from "@/react-app/data/team-colors";
import { useDataHubWatchboards } from "@/react-app/hooks/useDataHub";

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

function buildFallbackLogoDataUri(label: string): string {
  const safe = (label || "TBD").trim();
  const initials = safe
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 3)
    .toUpperCase() || "TBD";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="100%" height="100%" fill="#1e293b"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-size="16" font-family="Arial, sans-serif">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
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
            LIVE
          </span>
        ) : isFinal ? (
          <span className="px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400 text-[8px] sm:text-[9px] font-medium">
            FINAL
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
            <img
              src={getTeamLogoUrl(game.away_team_code || "TBD", game.sport?.toUpperCase()) ?? undefined}
              alt={game.away_team_code}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-800"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.onerror = null;
                img.src = buildFallbackLogoDataUri(game.away_team_code || "TBD");
              }}
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
            <img
              src={getTeamLogoUrl(game.home_team_code || "TBD", game.sport?.toUpperCase()) ?? undefined}
              alt={game.home_team_code}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-800"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.onerror = null;
                img.src = buildFallbackLogoDataUri(game.home_team_code || "TBD");
              }}
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
}: {
  board: BoardWithGames;
  onGameClick: (game: GameData) => void;
}) {
  // Show up to 4 games per board in preview
  const displayGames = board.games.slice(0, 4);
  const hasMore = board.games.length > 4;

  return (
    <div className="space-y-2">
      {/* Board header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] sm:text-xs text-white/60 font-medium">
            {board.name}
          </span>
          <span className="text-[10px] text-white/30">
            {board.games.length} game{board.games.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Link
          to={`/watchboard?board=${board.id}`}
          className="text-[10px] sm:text-[11px] font-medium text-blue-400/60 hover:text-blue-400 transition-colors flex items-center gap-0.5"
        >
          Open
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Games grid - 2 columns */}
      <div className="grid grid-cols-2 gap-2">
        {displayGames.map((game) => (
          <PreviewTile
            key={game.game_id}
            game={game}
            onClick={() => onGameClick(game)}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {hasMore && (
        <Link
          to={`/watchboard?board=${board.id}`}
          className="block text-center text-[10px] text-white/30 hover:text-white/50 py-1"
        >
          +{board.games.length - 4} more games →
        </Link>
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
      const boardsData: Array<{ 
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

      if (boardsData.length === 0) {
        setBoards([]);
        setIsLoading(false);
        return;
      }

      // Transform API data to component format
      const boardsWithGames: BoardWithGames[] = boardsData.map(b => {
        const games: GameData[] = b.games.map(g => ({
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

      // Filter to only show boards with active games (not all final)
      const activeBoards = boardsWithGames.filter(b => b.hasActiveGames && b.games.length > 0);

      setBoards(activeBoards);
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
    const sport = game.sport?.toLowerCase() || "nba";
    navigate(toGameDetailPath(sport, game.game_id));
  }, [navigate]);

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
            className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
          >
            Manage
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
          className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
        >
          Manage All
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
  const { boards, loading } = useDataHubWatchboards();

  // Handle game click
  const handleGameClick = useCallback((game: GameData) => {
    const sport = game.sport?.toLowerCase() || "nba";
    navigate(toGameDetailPath(sport, game.game_id));
  }, [navigate]);

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
            className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
          >
            Manage
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
          className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors flex items-center gap-0.5 group"
        >
          Manage All
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
