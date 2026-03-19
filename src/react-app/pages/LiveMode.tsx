import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Radio, Clock, ChevronRight, ArrowLeft, Users, RefreshCw, Filter, Pause, Play, Star,
  Calendar, ChevronDown
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { SportBadge } from "@/react-app/components/ui/premium";
import { ThresholdWhatJustChanged } from "@/react-app/components/ThresholdWhatJustChanged";
import { FilteredPlayByPlay, generateDemoPlays, type Play as PlayType } from "@/react-app/components/FilteredPlayByPlay";
import { getSport } from "@/react-app/data/sports";
import { useDataHub } from "@/react-app/hooks/useDataHub";
import { FollowButton } from "@/react-app/components/FollowButton";

import type { Game } from "@/shared/types";
import type { LiveGame } from "@/react-app/hooks/useLiveGames";

// Transform useDataHub's LiveGame format to Game format for LiveMode components
function transformLiveGameToGame(lg: LiveGame): Game {
  return {
    game_id: lg.id,
    sport: lg.sport?.toLowerCase() || 'nfl',
    league: lg.sport?.toUpperCase() || 'NFL',
    away_team_code: lg.awayTeam.abbreviation,
    home_team_code: lg.homeTeam.abbreviation,
    away_team_name: lg.awayTeam.name,
    home_team_name: lg.homeTeam.name,
    away_score: lg.awayTeam.score,
    home_score: lg.homeTeam.score,
    start_time: lg.startTime || new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    status: lg.status,
    period_label: lg.period || undefined,
    clock: lg.clock || undefined,
    broadcast: lg.channel || undefined,
  };
}

/**
 * LiveMode - Real-time Game Awareness + Full Schedule Browser
 * 
 * Features:
 * - Live games always pinned at top
 * - Day-based schedule navigation (Today, Tomorrow, future dates)
 * - All sports shown, filter by sport tab
 * - No hidden games - expandable sections
 */

// Available sports for filtering
const SPORTS = ["all", "nfl", "nba", "nhl", "ncaaf", "ncaab", "mlb", "soccer"] as const;
type SportFilter = typeof SPORTS[number];

// Date navigation helpers
function getDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === tomorrow.getTime()) return "Tomorrow";
  
  const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'short' });
  const month = target.toLocaleDateString('en-US', { month: 'short' });
  const day = target.getDate();
  
  return `${dayOfWeek}, ${month} ${day}`;
}

function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDatesAhead(count: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

// Live game card component
function LiveGameCard({ 
  game, 
  onClick, 
  isSelected,
  odds,
  isFollowed,
  compact = false,
}: { 
  game: Game; 
  onClick?: () => void; 
  isSelected?: boolean;
  odds?: { spread?: { line: number; favored: string }; total?: { line: number }; moneyline?: { home: number; away: number } } | null;
  isFollowed?: boolean;
  compact?: boolean;
}) {
  const sport = getSport(game.sport);
  const isLive = game.status === "IN_PROGRESS";
  const isFinal = game.status === "FINAL";
  const isAwayWinning = (game.away_score ?? 0) > (game.home_score ?? 0);
  const isHomeWinning = (game.home_score ?? 0) > (game.away_score ?? 0);
  
  // Simulated pool impact (demo data)
  const poolImpact = useMemo(() => {
    if (!isLive) return null;
    return {
      poolCount: Math.floor(Math.random() * 15) + 3,
      playersAtRisk: Math.floor(Math.random() * 8),
    };
  }, [isLive]);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border transition-all duration-200",
        "hover:shadow-lg hover:border-border",
        compact ? "p-3" : "p-4",
        isSelected
          ? "bg-card border-primary shadow-lg ring-2 ring-primary/20"
          : isFollowed
            ? "bg-amber-500/5 border-amber-500/30 shadow-md ring-1 ring-amber-500/10"
            : isLive 
              ? "bg-card border-[hsl(var(--live))]/30 shadow-md" 
              : isFinal
                ? "bg-muted/30 border-border/50"
                : "bg-card border-border/50"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {sport && <sport.icon className="w-4 h-4 text-muted-foreground" />}
          
          {isLive ? (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-[hsl(var(--live))]" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-[hsl(var(--live))] animate-ping" />
              </div>
              <span className="text-xs font-bold text-[hsl(var(--live))] uppercase tracking-wider">Live</span>
              {game.period_label && game.clock && (
                <span className="text-xs text-muted-foreground">
                  · {game.period_label} {game.clock}
                </span>
              )}
            </div>
          ) : game.is_halftime ? (
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Halftime</span>
          ) : isFinal ? (
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Final</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {new Date(game.start_time).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit' 
              })}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {game.broadcast && !compact && (
            <span className="text-[10px] text-muted-foreground">{game.broadcast}</span>
          )}
          {isFollowed && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Star className="w-3 h-3 fill-current" />
              {!compact && <span className="text-[10px] font-semibold">Following</span>}
            </div>
          )}
          {poolImpact && poolImpact.playersAtRisk > 0 && !compact && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">{poolImpact.playersAtRisk} at risk</span>
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <FollowButton 
              itemType="GAME" 
              itemId={game.game_id} 
              sportType={game.sport}
              variant="icon"
            />
          </div>
        </div>
      </div>
      
      {/* Scores */}
      <div className="space-y-2">
        {/* Away Team */}
        <div className={cn(
          "flex items-center justify-between",
          !isLive && !isAwayWinning && isFinal && "opacity-50"
        )}>
          <div className="flex items-center gap-3">
            <TeamBadge teamCode={game.away_team_code} teamName={game.away_team_name} size={compact ? "sm" : "md"} />
            <span className={cn(
              compact ? "text-sm" : "text-base",
              "font-medium",
              isAwayWinning && "font-bold"
            )}>{game.away_team_name}</span>
          </div>
          {(game.away_score !== undefined) && (
            <span className={cn(
              compact ? "text-xl" : "text-2xl",
              "font-bold tabular-nums",
              isAwayWinning && "text-foreground",
              !isAwayWinning && isLive && "text-muted-foreground"
            )}>
              {game.away_score}
            </span>
          )}
        </div>
        
        {/* Home Team */}
        <div className={cn(
          "flex items-center justify-between",
          !isLive && !isHomeWinning && isFinal && "opacity-50"
        )}>
          <div className="flex items-center gap-3">
            <TeamBadge teamCode={game.home_team_code} teamName={game.home_team_name} size={compact ? "sm" : "md"} />
            <span className={cn(
              compact ? "text-sm" : "text-base",
              "font-medium",
              isHomeWinning && "font-bold"
            )}>{game.home_team_name}</span>
          </div>
          {(game.home_score !== undefined) && (
            <span className={cn(
              compact ? "text-xl" : "text-2xl",
              "font-bold tabular-nums",
              isHomeWinning && "text-foreground",
              !isHomeWinning && isLive && "text-muted-foreground"
            )}>
              {game.home_score}
            </span>
          )}
        </div>
      </div>
      
      {/* League info for scheduled games */}
      {game.status === "SCHEDULED" && game.week && !compact && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">{game.league} · {game.week}</span>
        </div>
      )}
      
      {/* Odds display */}
      {odds && (game.status === "SCHEDULED" || game.status === "IN_PROGRESS") && !compact && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between gap-2 text-xs">
            {odds.spread && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Spread:</span>
                <span className="font-medium tabular-nums">
                  {odds.spread.favored === game.away_team_code ? game.away_team_code : game.home_team_code} {odds.spread.line > 0 ? `+${odds.spread.line}` : odds.spread.line}
                </span>
              </div>
            )}
            {odds.total && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">O/U:</span>
                <span className="font-medium tabular-nums">{odds.total.line}</span>
              </div>
            )}
            {odds.moneyline && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">ML:</span>
                <span className="font-medium tabular-nums">
                  {odds.moneyline.home > 0 ? `+${odds.moneyline.home}` : odds.moneyline.home}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </button>
  );
}

// Sport filter tabs
function SportTabs({ 
  selected, 
  onChange,
  gameCounts 
}: { 
  selected: SportFilter; 
  onChange: (sport: SportFilter) => void;
  gameCounts: Record<SportFilter, number>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      {SPORTS.map((sport) => {
        const sportData = sport === "all" ? null : getSport(sport);
        const count = gameCounts[sport];
        
        return (
          <button
            key={sport}
            onClick={() => onChange(sport)}
            className={cn(
              "shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              selected === sport
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {sportData ? (
              <sportData.icon className="w-4 h-4" />
            ) : (
              <Filter className="w-4 h-4" />
            )}
            <span className="capitalize">{sport === "all" ? "All" : sport.toUpperCase()}</span>
            {count > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-md",
                selected === sport ? "bg-primary-foreground/20" : "bg-muted"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Date selector tabs
function DateTabs({
  dates,
  selected,
  onChange,
  gameCounts,
}: {
  dates: Date[];
  selected: string;
  onChange: (dateKey: string) => void;
  gameCounts: Record<string, number>;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      {dates.map((date) => {
        const dateKey = getDateKey(date);
        const label = getDateLabel(date);
        const count = gameCounts[dateKey] || 0;
        const isToday = label === "Today";
        
        return (
          <button
            key={dateKey}
            onClick={() => onChange(dateKey)}
            className={cn(
              "shrink-0 flex flex-col items-center px-4 py-2 rounded-xl text-sm transition-all min-w-[80px]",
              selected === dateKey
                ? "bg-primary text-primary-foreground"
                : isToday && count > 0
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <span className="font-semibold">{label}</span>
            <span className={cn(
              "text-xs mt-0.5",
              selected === dateKey ? "opacity-80" : "opacity-60"
            )}>
              {count} game{count !== 1 ? 's' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Collapsible game section
function GameSection({
  title,
  icon: Icon,
  games,
  oddsByGame,
  followedGameIds,
  selectedGameId,
  onSelectGame,
  defaultExpanded = true,
  accentColor,
  compact = false,
}: {
  title: string;
  icon: React.ElementType;
  games: Game[];
  oddsByGame: Map<string, unknown>;
  followedGameIds: Set<string>;
  selectedGameId?: string | null;
  onSelectGame?: (id: string) => void;
  defaultExpanded?: boolean;
  accentColor?: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  if (games.length === 0) return null;
  
  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-4 w-full text-left group"
      >
        <Icon className={cn("w-4 h-4", accentColor || "text-muted-foreground")} />
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {games.length} game{games.length !== 1 ? 's' : ''}
        </span>
        <ChevronDown className={cn(
          "w-4 h-4 ml-auto text-muted-foreground transition-transform",
          expanded && "rotate-180"
        )} />
      </button>
      
      {expanded && (
        <div className={cn(
          "grid gap-3",
          compact 
            ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
            : "sm:grid-cols-2 lg:grid-cols-3"
        )}>
          {games.map(game => {
            const gameOdds = oddsByGame.get(game.game_id) as { spread?: { home_line?: number; away_line?: number }; total?: { line?: number }; moneyline?: { home_price?: number; away_price?: number } } | undefined;
            const spreadLine = gameOdds?.spread?.home_line ?? gameOdds?.spread?.away_line;
            const favoredTeam = gameOdds?.spread?.home_line != null && gameOdds.spread.home_line < 0 
              ? game.home_team_code 
              : game.away_team_code;
            
            return (
              <LiveGameCard 
                key={game.game_id} 
                game={game} 
                onClick={() => onSelectGame?.(game.game_id)}
                isSelected={selectedGameId === game.game_id}
                isFollowed={followedGameIds.has(game.game_id)}
                compact={compact}
                odds={gameOdds ? {
                  spread: spreadLine != null ? { line: Math.abs(spreadLine), favored: favoredTeam } : undefined,
                  total: gameOdds.total?.line != null ? { line: gameOdds.total.line } : undefined,
                  moneyline: gameOdds.moneyline?.home_price != null ? { home: gameOdds.moneyline.home_price, away: gameOdds.moneyline.away_price ?? 0 } : undefined,
                } : null}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function LiveMode() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialGameId = searchParams.get('game');
  
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [selectedDate, setSelectedDate] = useState<string>(getDateKey(new Date()));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(initialGameId);
  const [showFollowingOnly, setShowFollowingOnly] = useState(false);
  const [followedGameIds, setFollowedGameIds] = useState<Set<string>>(new Set());
  const [dynamicPlays, setDynamicPlays] = useState<Record<string, PlayType[]>>({});
  
  // Get 7 days of dates for the date picker
  const scheduleDates = useMemo(() => getDatesAhead(7), []);
  
  // Fetch followed game IDs
  const fetchFollowedGames = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/watchlist", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const gameIds = new Set<string>(
          (data.items || [])
            .filter((item: { item_type: string }) => item.item_type === "GAME")
            .map((item: { item_id: string }) => item.item_id)
        );
        setFollowedGameIds(gameIds);
      }
    } catch (err) {
      console.error("Failed to fetch followed games:", err);
    }
  }, []);
  
  useEffect(() => {
    fetchFollowedGames();
  }, [fetchFollowedGames]);
  
  // Use consolidated DataHub for games (eliminates duplicate polling)
  const {
    games: liveGameData,
    gamesLoading: _loading,
    isRefreshing,
    lastFetchAt: lastUpdatedAt,
    refresh,
    pause,
    resume,
    isPaused,
  } = useDataHub();
  
  // Transform LiveGame[] to Game[] format for this component
  const allGames = useMemo(() => 
    liveGameData.map(transformLiveGameToGame),
    [liveGameData]
  );
  
  // Compute allLiveGames and hasAnyLive from transformed games
  const allLiveGames = useMemo(() => 
    allGames.filter(g => g.status === 'IN_PROGRESS'),
    [allGames]
  );
  const hasAnyLive = allLiveGames.length > 0;
  
  // Generate odds map from transformed games
  const oddsByGame = useMemo(() => {
    const map = new Map<string, { spread?: { home_line?: number; away_line?: number }; total?: { line?: number }; moneyline?: { home_price?: number; away_price?: number } }>();
    liveGameData.forEach(g => {
      if (g.odds) {
        map.set(g.id, {
          spread: g.odds.spreadHome != null ? { home_line: g.odds.spreadHome } : undefined,
          total: g.odds.total != null ? { line: g.odds.total } : undefined,
          moneyline: g.odds.moneylineHome != null ? { 
            home_price: g.odds.moneylineHome, 
            away_price: g.odds.moneylineAway ?? 0 
          } : undefined,
        });
      }
    });
    return map;
  }, [liveGameData]);
  
  // Filter games by sport and following status
  const baseFilteredGames = useMemo(() => {
    let games = allGames;
    if (sportFilter !== "all") {
      games = games.filter(g => g.sport === sportFilter);
    }
    if (showFollowingOnly) {
      games = games.filter(g => followedGameIds.has(g.game_id));
    }
    return games;
  }, [allGames, sportFilter, showFollowingOnly, followedGameIds]);
  
  // Group games by date
  const gamesByDate = useMemo(() => {
    const groups: Record<string, Game[]> = {};
    baseFilteredGames.forEach(game => {
      const dateKey = getDateKey(new Date(game.start_time));
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(game);
    });
    return groups;
  }, [baseFilteredGames]);
  
  // Game counts by date for tabs
  const dateGameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    scheduleDates.forEach(date => {
      const key = getDateKey(date);
      counts[key] = gamesByDate[key]?.length || 0;
    });
    return counts;
  }, [gamesByDate, scheduleDates]);
  
  // Games for selected date
  const selectedDateGames = useMemo(() => {
    return gamesByDate[selectedDate] || [];
  }, [gamesByDate, selectedDate]);
  
  // Sort with followed games first helper
  const sortWithFollowedFirst = useCallback((games: Game[]) => {
    return [...games].sort((a, b) => {
      const aFollowed = followedGameIds.has(a.game_id) ? 0 : 1;
      const bFollowed = followedGameIds.has(b.game_id) ? 0 : 1;
      if (aFollowed !== bFollowed) return aFollowed - bFollowed;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
  }, [followedGameIds]);
  
  // Live games (always shown at top regardless of date)
  const liveGames = useMemo(() => 
    sortWithFollowedFirst(baseFilteredGames.filter(g => g.status === "IN_PROGRESS")),
    [baseFilteredGames, sortWithFollowedFirst]);
  
  // Games for selected date, grouped by status
  const scheduledGames = useMemo(() => 
    sortWithFollowedFirst(selectedDateGames.filter(g => g.status === "SCHEDULED")),
    [selectedDateGames, sortWithFollowedFirst]);
  
  const finalGames = useMemo(() => {
    const finals = selectedDateGames.filter(g => g.status === "FINAL");
    return [...finals].sort((a, b) => {
      const aFollowed = followedGameIds.has(a.game_id) ? 0 : 1;
      const bFollowed = followedGameIds.has(b.game_id) ? 0 : 1;
      if (aFollowed !== bFollowed) return aFollowed - bFollowed;
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    });
  }, [selectedDateGames, followedGameIds]);
  
  // Game counts for sport filter tabs (all games, not just selected date)
  const sportGameCounts = useMemo(() => {
    const counts: Record<SportFilter, number> = { all: 0, nfl: 0, nba: 0, nhl: 0, ncaaf: 0, ncaab: 0, mlb: 0, soccer: 0 };
    allGames.forEach(g => {
      counts.all++;
      if (g.sport in counts) counts[g.sport as SportFilter]++;
    });
    return counts;
  }, [allGames]);
  
  // Auto-select first live game if none selected (but respect URL param)
  const selectedGame = useMemo(() => {
    if (selectedGameId) {
      // First check in filtered games
      const found = baseFilteredGames.find(g => g.game_id === selectedGameId);
      if (found) return found;
      // If URL param provided but game not in filtered view, check all games
      const foundInAll = allGames.find(g => g.game_id === selectedGameId);
      if (foundInAll) return foundInAll;
    }
    return liveGames[0] || null;
  }, [selectedGameId, baseFilteredGames, allGames, liveGames]);
  
  // Initialize plays for games
  useEffect(() => {
    const initialPlays: Record<string, PlayType[]> = {};
    liveGames.forEach(g => {
      if (!dynamicPlays[g.game_id]) {
        initialPlays[g.game_id] = generateDemoPlays(g.game_id);
      }
    });
    if (Object.keys(initialPlays).length > 0) {
      setDynamicPlays(prev => ({ ...prev, ...initialPlays }));
    }
  }, [liveGames]);
  
  // Generate demo plays when scores update
  useEffect(() => {
    if (!isRefreshing || liveGames.length === 0) return;
    
    const gameToUpdate = liveGames[Math.floor(Math.random() * liveGames.length)];
    if (gameToUpdate && Math.random() > 0.5) {
      const newPlay: PlayType = {
        id: `play-${Date.now()}`,
        type: Math.random() > 0.5 ? "touchdown" : "turnover",
        timestamp: gameToUpdate.clock || "",
        period: gameToUpdate.period_label || "",
        team: Math.random() > 0.5 ? gameToUpdate.home_team_name : gameToUpdate.away_team_name,
        description: getRandomPlayDescription(gameToUpdate.sport),
      };
      
      setDynamicPlays(prev => ({
        ...prev,
        [gameToUpdate.game_id]: [newPlay, ...(prev[gameToUpdate.game_id] || [])].slice(0, 15),
      }));
    }
  }, [isRefreshing, liveGames]);
  
  // Get plays for selected game
  const gamePlays = useMemo(() => {
    if (!selectedGame || selectedGame.status !== "IN_PROGRESS") return [];
    return dynamicPlays[selectedGame.game_id] || generateDemoPlays(selectedGame.game_id);
  }, [selectedGame, dynamicPlays]);
  
  const isToday = selectedDate === getDateKey(new Date());
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
            
            <div className="flex items-center gap-4">
              {hasAnyLive && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Radio className="w-4 h-4 text-[hsl(var(--live))]" />
                  </div>
                  <span className="text-sm font-semibold">
                    {allLiveGames.length} Live
                  </span>
                </div>
              )}
              
              {/* Auto-refresh controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={isPaused ? resume : pause}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isPaused 
                      ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                  title={isPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
                
                <button
                  onClick={() => refresh()}
                  disabled={isRefreshing}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                  title="Refresh now"
                >
                  <RefreshCw className={cn(
                    "w-3.5 h-3.5 transition-all",
                    isRefreshing && "animate-spin text-primary"
                  )} />
                </button>
                
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {lastUpdatedAt?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) || '--:--:--'}
                </span>
                
                {isPaused && (
                  <span className="text-xs text-amber-600 font-medium">Paused</span>
                )}
              </div>
            </div>
            
            <button
              onClick={() => navigate('/intel')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Study Mode
            </button>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Date Navigation */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Schedule</h2>
          </div>
          
          <DateTabs
            dates={scheduleDates}
            selected={selectedDate}
            onChange={setSelectedDate}
            gameCounts={dateGameCounts}
          />
        </div>
        
        {/* Sport Filter + Following Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <SportTabs 
            selected={sportFilter} 
            onChange={setSportFilter}
            gameCounts={sportGameCounts}
          />
          
          {/* Following Only Toggle */}
          <button
            onClick={() => setShowFollowingOnly(!showFollowingOnly)}
            className={cn(
              "shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              showFollowingOnly
                ? "bg-amber-500 text-white"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Star className={cn("w-4 h-4", showFollowingOnly && "fill-current")} />
            <span>Following</span>
            {followedGameIds.size > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-md",
                showFollowingOnly ? "bg-white/20" : "bg-muted"
              )}>
                {followedGameIds.size}
              </span>
            )}
          </button>
        </div>
        
        {/* What Just Changed - only show if today */}
        {isToday && (
          <ThresholdWhatJustChanged 
            scope="DEMO"
            maxItems={3}
            defaultExpanded={true}
            refreshInterval={15000}
            showRefreshButton={true}
          />
        )}
        
        {/* LIVE NOW - Always pinned at top */}
        {liveGames.length > 0 && (
          <section className="relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-[hsl(var(--live))]/10 to-transparent rounded-3xl -z-10" />
            <div className="flex items-center gap-2 mb-4">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--live))]" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-[hsl(var(--live))] animate-ping opacity-75" />
              </div>
              <h2 className="text-xl font-bold">Live Now</h2>
              <span className="text-sm text-muted-foreground">
                {liveGames.length} game{liveGames.length !== 1 ? 's' : ''} in progress
              </span>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveGames.map(game => {
                const gameOdds = oddsByGame.get(game.game_id) as { spread?: { home_line?: number; away_line?: number }; total?: { line?: number }; moneyline?: { home_price?: number; away_price?: number } } | undefined;
                const spreadLine = gameOdds?.spread?.home_line ?? gameOdds?.spread?.away_line;
                const favoredTeam = gameOdds?.spread?.home_line != null && gameOdds.spread.home_line < 0 
                  ? game.home_team_code 
                  : game.away_team_code;
                return (
                  <LiveGameCard 
                    key={game.game_id} 
                    game={game} 
                    onClick={() => setSelectedGameId(game.game_id)}
                    isSelected={selectedGame?.game_id === game.game_id}
                    isFollowed={followedGameIds.has(game.game_id)}
                    odds={gameOdds ? {
                      spread: spreadLine != null ? { line: Math.abs(spreadLine), favored: favoredTeam } : undefined,
                      total: gameOdds.total?.line != null ? { line: gameOdds.total.line } : undefined,
                      moneyline: gameOdds.moneyline?.home_price != null ? { home: gameOdds.moneyline.home_price, away: gameOdds.moneyline.away_price ?? 0 } : undefined,
                    } : null}
                  />
                );
              })}
            </div>
          </section>
        )}
        
        {/* Play-by-Play for Selected Live Game */}
        {selectedGame && selectedGame.status === "IN_PROGRESS" && (
          <section className="rounded-2xl border border-border/50 bg-card/30 p-5">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border/50">
              <SportBadge sport={selectedGame.sport} />
              <TeamBadge teamCode={selectedGame.away_team_code} teamName={selectedGame.away_team_name} size="md" />
              <span className="text-sm text-muted-foreground">@</span>
              <TeamBadge teamCode={selectedGame.home_team_code} teamName={selectedGame.home_team_name} size="md" />
              <span className="text-sm font-medium ml-auto tabular-nums">
                {selectedGame.away_score} - {selectedGame.home_score}
              </span>
            </div>
            <FilteredPlayByPlay 
              plays={gamePlays}
              gameId={selectedGame.game_id}
              maxVisible={5}
              showFilters={true}
            />
          </section>
        )}
        
        {/* Scheduled Games for Selected Date */}
        <GameSection
          title={isToday ? "Coming Up Today" : `Scheduled for ${getDateLabel(new Date(selectedDate + 'T00:00:00'))}`}
          icon={Clock}
          games={scheduledGames}
          oddsByGame={oddsByGame}
          followedGameIds={followedGameIds}
          defaultExpanded={true}
        />
        
        {/* Final Games for Selected Date */}
        <GameSection
          title={isToday ? "Completed Today" : "Completed"}
          icon={Calendar}
          games={finalGames}
          oddsByGame={oddsByGame}
          followedGameIds={followedGameIds}
          defaultExpanded={finalGames.length <= 6}
          compact={true}
        />
        
        {/* No Games State */}
        {liveGames.length === 0 && scheduledGames.length === 0 && finalGames.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No games on this day</h3>
            <p className="text-muted-foreground mb-6">
              {sportFilter === "all" 
                ? "Try selecting a different date"
                : `No ${sportFilter.toUpperCase()} games scheduled`}
            </p>
            <div className="flex items-center justify-center gap-3">
              {sportFilter !== "all" && (
                <button
                  onClick={() => setSportFilter("all")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-foreground font-medium hover:bg-secondary/80 transition-colors"
                >
                  View all sports
                </button>
              )}
              <button
                onClick={() => setSelectedDate(getDateKey(new Date()))}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Go to Today
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Helper for random play descriptions
function getRandomPlayDescription(sport: string): string {
  const plays: Record<string, string[]> = {
    nfl: [
      "Pass complete for 12 yards",
      "Rush up the middle for 5 yards", 
      "Sack for loss of 8 yards",
      "Field goal GOOD from 42 yards",
      "Touchdown pass to the end zone!",
      "Interception! Returned 15 yards",
    ],
    nba: [
      "Three-pointer from downtown!",
      "Fast break layup",
      "Alley-oop dunk!",
      "Free throw (1 of 2)",
      "Mid-range jumper",
      "Steal and coast-to-coast finish",
    ],
    nhl: [
      "Shot on goal saved",
      "Power play goal!",
      "Breakaway chance stopped",
      "Slap shot from the point",
      "Icing called",
    ],
    default: [
      "Score update",
      "Big play",
      "Key moment",
    ],
  };
  
  const sportPlays = plays[sport] || plays.default;
  return sportPlays[Math.floor(Math.random() * sportPlays.length)];
}


