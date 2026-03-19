import { useState, useMemo, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ChevronLeft, ChevronRight, Radio, Tv, Calendar
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { LiveGamesStripSkeleton } from "@/react-app/components/ui/skeletons";
import { getSport } from "@/react-app/data/sports";
import { type SportKey } from "@/react-app/components/FavoriteSportsSelector";
import type { Game } from "@/shared/types";
import { useDataHub } from "@/react-app/hooks/useDataHub";

type TimeFilter = "today" | "tomorrow";

interface LiveGamesStripProps {
  favoriteSports?: SportKey[];
  compact?: boolean;
  maxGames?: number;
  showTimeFilter?: boolean;
  className?: string;
}

// Compact live game card for the strip - memoized to prevent re-renders
const LiveGameCard = memo(function LiveGameCard({ game, onClick }: { game: Game; onClick?: () => void }) {
  const isLive = game.status === "IN_PROGRESS";
  const isFinal = game.status === "FINAL";
  const sport = getSport(game.sport as SportKey);
  
  // Determine winner for final games
  const winner = isFinal && game.home_score !== undefined && game.away_score !== undefined
    ? (game.home_score > game.away_score ? game.home_team_name : game.away_team_name)
    : undefined;
  
  // Get the period display
  const getPeriodDisplay = () => {
    if (isLive) {
      return (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {game.period_label && game.clock ? `${game.period_label} ${game.clock}` : "LIVE"}
        </span>
      );
    }
    if (isFinal) return "Final";
    return new Date(game.start_time).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 w-[180px] p-3 rounded-xl border transition-all duration-200 text-left",
        "bg-card/80 backdrop-blur-sm hover:bg-accent/50 hover:border-primary/30",
        "hover:shadow-md hover:-translate-y-0.5",
        "active:scale-[0.98] active:translate-y-0",
        isLive && "border-[hsl(var(--live))]/40 bg-[hsl(var(--live))]/5 shadow-lg shadow-[hsl(var(--live))]/10 animate-live-glow-primary"
      )}
    >
      {/* Header: Sport + Status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {sport && <sport.icon className="w-3 h-3 text-muted-foreground" />}
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {sport?.abbr || game.sport}
          </span>
        </div>
        <span className={cn(
          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-all duration-300",
          isLive 
            ? "bg-[hsl(var(--live))]/20 text-[hsl(var(--live))] animate-pulse-subtle" 
            : isFinal
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary"
        )}>
          {getPeriodDisplay()}
        </span>
      </div>
      
      {/* Teams with scores */}
      <div className="space-y-1.5">
        {/* Away team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <TeamBadge teamName={game.away_team_name} size="xs" />
            <span className={cn(
              "text-sm font-medium truncate",
              winner === game.away_team_name && "text-[hsl(var(--success))]"
            )}>
              {game.away_team_name}
            </span>
          </div>
          {game.away_score !== undefined && (
            <span className={cn(
              "text-base font-bold tabular-nums ml-2",
              winner === game.away_team_name && "text-[hsl(var(--success))]",
              isLive && winner !== game.away_team_name && "text-foreground"
            )}>
              {game.away_score}
            </span>
          )}
        </div>
        
        {/* Home team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <TeamBadge teamName={game.home_team_name} size="xs" />
            <span className={cn(
              "text-sm font-medium truncate",
              winner === game.home_team_name && "text-[hsl(var(--success))]"
            )}>
              {game.home_team_name}
            </span>
          </div>
          {game.home_score !== undefined && (
            <span className={cn(
              "text-base font-bold tabular-nums ml-2",
              winner === game.home_team_name && "text-[hsl(var(--success))]",
              isLive && winner !== game.home_team_name && "text-foreground"
            )}>
              {game.home_score}
            </span>
          )}
        </div>
      </div>
      
      {/* Footer: Broadcast */}
      {game.broadcast && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
          <Tv className="w-3 h-3" />
          {game.broadcast}
        </div>
      )}
    </button>
  );
});

// Upcoming game card - memoized to prevent re-renders
const UpcomingGameCard = memo(function UpcomingGameCard({ game, onClick }: { game: Game; onClick?: () => void }) {
  const sport = getSport(game.sport as SportKey);
  const startTime = new Date(game.start_time);
  const isToday = startTime.toDateString() === new Date().toDateString();
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 w-[160px] p-3 rounded-xl border transition-all text-left",
        "bg-card/60 backdrop-blur-sm hover:bg-accent/50 hover:border-primary/30",
        "active:scale-[0.98]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {sport && <sport.icon className="w-3 h-3 text-muted-foreground" />}
        </div>
        <span className="text-[10px] font-medium text-primary">
          {isToday 
            ? startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : startTime.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
          }
        </span>
      </div>
      
      {/* Matchup */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamBadge teamName={game.away_team_name} size="xs" />
          <span className="text-xs font-medium truncate">{game.away_team_name}</span>
        </div>
        <span className="text-xs text-muted-foreground">@</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate">{game.home_team_name}</span>
          <TeamBadge teamName={game.home_team_name} size="xs" />
        </div>
      </div>
    </button>
  );
});

export function LiveGamesStrip({ 
  favoriteSports = [], 
  compact: _compact = false,
  maxGames = 20,
  showTimeFilter = true,
  className 
}: LiveGamesStripProps) {
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // Use shared data hub instead of independent fetching
  const { games: hubGames, gamesLoading: loading } = useDataHub();
  
  // Transform LiveGame[] to Game[] format and filter by time
  const games = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const tomorrow = new Date(now.getTime() + 86400000).toDateString();
    
    return hubGames
      .filter(g => {
        const startTime = g.startTime || '';
        if (!startTime) return false;
        const gameDate = new Date(startTime).toDateString();
        return timeFilter === "today" ? gameDate === today : gameDate === tomorrow;
      })
      .map(g => ({
        game_id: g.id,
        sport: g.sport,
        home_team_name: g.homeTeam?.name || g.homeTeam?.abbreviation || 'TBD',
        away_team_name: g.awayTeam?.name || g.awayTeam?.abbreviation || 'TBD',
        home_score: g.homeTeam?.score ?? undefined,
        away_score: g.awayTeam?.score ?? undefined,
        status: g.status,
        start_time: g.startTime || '',
        period_label: g.period || null,
        clock: g.clock || null,
        broadcast: g.channel || null,
      } as Game));
  }, [hubGames, timeFilter]);
  
  // Sort games: live first, then by start time, favorites prioritized
  const sortedGames = useMemo(() => {
    return [...games]
      .sort((a, b) => {
        // Live games first
        if (a.status === "IN_PROGRESS" && b.status !== "IN_PROGRESS") return -1;
        if (b.status === "IN_PROGRESS" && a.status !== "IN_PROGRESS") return 1;
        
        // Then favorites
        const aFav = favoriteSports.includes(a.sport as SportKey);
        const bFav = favoriteSports.includes(b.sport as SportKey);
        if (aFav && !bFav) return -1;
        if (bFav && !aFav) return 1;
        
        // Then by start time
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      })
      .slice(0, maxGames);
  }, [games, favoriteSports, maxGames]);
  
  const liveGames = sortedGames.filter(g => g.status === "IN_PROGRESS");
  const upcomingGames = sortedGames.filter(g => g.status === "SCHEDULED");
  const finalGames = sortedGames.filter(g => g.status === "FINAL");
  
  const handleScroll = (direction: "left" | "right") => {
    const container = document.getElementById("live-games-strip");
    if (container) {
      const scrollAmount = 200;
      const newPosition = direction === "left" 
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;
      container.scrollTo({ left: newPosition, behavior: "smooth" });
      setScrollPosition(newPosition);
    }
  };
  
  const handleGameClick = useCallback((game: Game) => {
    navigate(`/scores/game/${game.game_id}`);
  }, [navigate]);
  
  if (loading && games.length === 0) {
    return (
      <div className={className}>
        <LiveGamesStripSkeleton count={4} />
      </div>
    );
  }
  
  if (games.length === 0) {
    return (
      <div className={cn("text-center py-6 text-muted-foreground", className)}>
        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No games {timeFilter}</p>
      </div>
    );
  }
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {liveGames.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-[hsl(var(--live))]" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-[hsl(var(--live))] animate-ping" />
              </div>
              <h2 className="text-sm font-semibold text-[hsl(var(--live))]">
                {liveGames.length} Live
              </h2>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground">Games</h2>
            </div>
          )}
          
          <span className="text-xs text-muted-foreground">
            {upcomingGames.length} upcoming
            {finalGames.length > 0 && ` • ${finalGames.length} final`}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {showTimeFilter && (
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setTimeFilter("today")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  timeFilter === "today" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Today
              </button>
              <button
                onClick={() => setTimeFilter("tomorrow")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  timeFilter === "tomorrow" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Tomorrow
              </button>
            </div>
          )}
          
          {/* Scroll buttons - desktop only */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => handleScroll("left")}
              className="p-1 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll("right")}
              className="p-1 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Games strip */}
      <div 
        id="live-games-strip"
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
        onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
      >
        {/* Live games first */}
        {liveGames.map((game) => (
          <LiveGameCard 
            key={game.game_id} 
            game={game}
            onClick={() => handleGameClick(game)}
          />
        ))}
        
        {/* Divider if both live and upcoming */}
        {liveGames.length > 0 && (upcomingGames.length > 0 || finalGames.length > 0) && (
          <div className="shrink-0 w-px bg-border my-2" />
        )}
        
        {/* Upcoming games */}
        {upcomingGames.map((game) => (
          <UpcomingGameCard 
            key={game.game_id} 
            game={game}
            onClick={() => handleGameClick(game)}
          />
        ))}
        
        {/* Final games at the end */}
        {finalGames.map((game) => (
          <LiveGameCard 
            key={game.game_id} 
            game={game}
            onClick={() => handleGameClick(game)}
          />
        ))}
        
        {/* View all button */}
        <button
          onClick={() => navigate("/games")}
          className="shrink-0 w-[100px] flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-dashed text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <Radio className="w-5 h-5" />
          <span className="text-xs font-medium">All Scores</span>
        </button>
      </div>
    </div>
  );
}
