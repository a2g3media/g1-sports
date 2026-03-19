import { useState, useEffect, useMemo } from "react";
import { Radio, AlertTriangle, Skull, Shield, Crown, RefreshCw, Users } from "lucide-react";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
}

interface TimeContext {
  periodLabel: string;
  periodNumber: number | string;
  status: "open" | "locked" | "live" | "final";
  lockTime: Date;
  timeUntilLock: number;
}

interface LiveSweatTabProps {
  league: League;
  timeContext: TimeContext | null;
}

type PlayerStatus = "AT_RISK" | "ELIMINATED" | "WINNING" | "SAFE" | "TIED";

interface PlayerPick {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: PlayerStatus;
}

interface LiveSweatGame {
  gameId: string;
  sport: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINAL";
  period: string;
  clock?: string;
  awayTeam: {
    name: string;
    abbr: string;
    score: number;
  };
  homeTeam: {
    name: string;
    abbr: string;
    score: number;
  };
  awayPickers: PlayerPick[];
  homePickers: PlayerPick[];
}

// Map sport_key from league format to simple sport
function mapSportKey(sportKey: string): string {
  const mapping: Record<string, string> = {
    americanfootball_nfl: "nfl",
    basketball_nba: "nba",
    icehockey_nhl: "nhl",
    americanfootball_ncaaf: "ncaaf",
    basketball_ncaab: "ncaab",
    baseball_mlb: "mlb",
    soccer_epl: "soccer",
  };
  return mapping[sportKey] || sportKey.split("_")[1] || sportKey;
}

// Demo data for Live Sweat visualization
function getDemoLiveSweatData(sport: string): LiveSweatGame[] {
  const demoPlayers = [
    { userId: "1", displayName: "Mike S." },
    { userId: "2", displayName: "Sarah L." },
    { userId: "3", displayName: "Tom B." },
    { userId: "4", displayName: "Jess K." },
    { userId: "5", displayName: "Dave R." },
    { userId: "6", displayName: "Amy C." },
    { userId: "7", displayName: "Chris M." },
    { userId: "8", displayName: "Kate W." },
  ];

  if (sport === "nfl") {
    return [
      {
        gameId: "nfl_live_1",
        sport: "nfl",
        status: "IN_PROGRESS",
        period: "3rd Quarter",
        clock: "8:42",
        awayTeam: { name: "Buffalo Bills", abbr: "BUF", score: 14 },
        homeTeam: { name: "Kansas City Chiefs", abbr: "KC", score: 21 },
        awayPickers: [
          { ...demoPlayers[0], status: "AT_RISK" },
          { ...demoPlayers[1], status: "AT_RISK" },
          { ...demoPlayers[4], status: "AT_RISK" },
        ],
        homePickers: [
          { ...demoPlayers[2], status: "WINNING" },
          { ...demoPlayers[3], status: "WINNING" },
        ],
      },
      {
        gameId: "nfl_live_2",
        sport: "nfl",
        status: "IN_PROGRESS",
        period: "4th Quarter",
        clock: "2:15",
        awayTeam: { name: "Philadelphia Eagles", abbr: "PHI", score: 28 },
        homeTeam: { name: "Dallas Cowboys", abbr: "DAL", score: 24 },
        awayPickers: [
          { ...demoPlayers[5], status: "WINNING" },
        ],
        homePickers: [
          { ...demoPlayers[6], status: "AT_RISK" },
          { ...demoPlayers[7], status: "AT_RISK" },
        ],
      },
      {
        gameId: "nfl_final_1",
        sport: "nfl",
        status: "FINAL",
        period: "Final",
        awayTeam: { name: "San Francisco 49ers", abbr: "SF", score: 31 },
        homeTeam: { name: "Seattle Seahawks", abbr: "SEA", score: 17 },
        awayPickers: [
          { userId: "9", displayName: "Jim H.", status: "SAFE" },
        ],
        homePickers: [
          { userId: "10", displayName: "Lisa P.", status: "ELIMINATED" },
        ],
      },
    ];
  }

  // Generic demo for other sports
  return [
    {
      gameId: `${sport}_live_1`,
      sport,
      status: "IN_PROGRESS",
      period: "2nd Half",
      clock: "12:30",
      awayTeam: { name: "Away Team", abbr: "AWY", score: 45 },
      homeTeam: { name: "Home Team", abbr: "HME", score: 52 },
      awayPickers: [
        { ...demoPlayers[0], status: "AT_RISK" },
        { ...demoPlayers[1], status: "AT_RISK" },
      ],
      homePickers: [
        { ...demoPlayers[2], status: "WINNING" },
      ],
    },
  ];
}

// Status badge component
function StatusChip({ status }: { status: PlayerStatus }) {
  const config = {
    AT_RISK: {
      bg: "bg-red-500/20",
      text: "text-red-400",
      border: "border-red-500/30",
      icon: AlertTriangle,
      label: "AT RISK",
    },
    ELIMINATED: {
      bg: "bg-slate-700/50",
      text: "text-slate-500",
      border: "border-slate-600/30",
      icon: Skull,
      label: "ELIMINATED",
    },
    WINNING: {
      bg: "bg-emerald-500/20",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
      icon: Crown,
      label: "WINNING",
    },
    SAFE: {
      bg: "bg-emerald-500/20",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
      icon: Shield,
      label: "SAFE",
    },
    TIED: {
      bg: "bg-yellow-500/20",
      text: "text-yellow-400",
      border: "border-yellow-500/30",
      icon: AlertTriangle,
      label: "TIED",
    },
  };

  const { bg, text, border, icon: Icon, label } = config[status];

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
      bg, text, border
    )}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// Player row in the picks list
function PlayerRow({ player }: { player: PlayerPick }) {
  const isEliminated = player.status === "ELIMINATED";
  
  return (
    <div className={cn(
      "flex items-center justify-between py-1.5",
      isEliminated && "opacity-50"
    )}>
      <span className={cn(
        "text-sm",
        isEliminated && "line-through text-slate-500"
      )}>
        {player.displayName}
      </span>
      <StatusChip status={player.status} />
    </div>
  );
}

// Live game card with sweat visualization
function LiveSweatGameCard({ game }: { game: LiveSweatGame }) {
  const isLive = game.status === "IN_PROGRESS";
  const isFinal = game.status === "FINAL";
  const awayWinning = game.awayTeam.score > game.homeTeam.score;
  const homeWinning = game.homeTeam.score > game.awayTeam.score;

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden transition-all",
      "bg-gradient-to-br from-slate-900/80 to-slate-950/80",
      "backdrop-blur-xl",
      isLive ? "border-red-500/30 shadow-lg shadow-red-500/10" : "border-white/[0.08]"
    )}>
      {/* Game Header */}
      <div className={cn(
        "px-4 py-3 border-b",
        isLive ? "border-red-500/20 bg-red-500/5" : "border-white/[0.06]"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLive && (
              <div className="relative flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="absolute left-0 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wide">Live</span>
              </div>
            )}
            {isFinal && (
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Final</span>
            )}
          </div>
          <span className="text-xs text-slate-400">
            {game.period}{game.clock && ` • ${game.clock}`}
          </span>
        </div>
      </div>

      {/* Score Section */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          {/* Away Team */}
          <div className="text-center">
            <TeamBadge teamName={game.awayTeam.name} size="lg" />
            <div className="mt-2 text-xs text-slate-400 truncate">{game.awayTeam.name}</div>
          </div>
          
          {/* Score */}
          <div className="flex items-center gap-3">
            <span className={cn(
              "text-3xl font-bold tabular-nums",
              awayWinning ? "text-white" : "text-slate-500"
            )}>
              {game.awayTeam.score}
            </span>
            <span className="text-slate-600 text-lg">-</span>
            <span className={cn(
              "text-3xl font-bold tabular-nums",
              homeWinning ? "text-white" : "text-slate-500"
            )}>
              {game.homeTeam.score}
            </span>
          </div>
          
          {/* Home Team */}
          <div className="text-center">
            <TeamBadge teamName={game.homeTeam.name} size="lg" />
            <div className="mt-2 text-xs text-slate-400 truncate">{game.homeTeam.name}</div>
          </div>
        </div>
      </div>

      {/* Picks Section */}
      <div className="grid grid-cols-2 divide-x divide-white/[0.06] border-t border-white/[0.06]">
        {/* Away Pickers */}
        <div className={cn(
          "px-4 py-3",
          !awayWinning && isLive && "bg-red-500/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">
              Picked {game.awayTeam.abbr}
            </span>
            <span className="text-xs text-slate-500">({game.awayPickers.length})</span>
          </div>
          <div className="space-y-1">
            {game.awayPickers.length > 0 ? (
              game.awayPickers.map((player) => (
                <PlayerRow key={player.userId} player={player} />
              ))
            ) : (
              <span className="text-xs text-slate-500 italic">No picks</span>
            )}
          </div>
        </div>

        {/* Home Pickers */}
        <div className={cn(
          "px-4 py-3",
          !homeWinning && isLive && "bg-red-500/5"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">
              Picked {game.homeTeam.abbr}
            </span>
            <span className="text-xs text-slate-500">({game.homePickers.length})</span>
          </div>
          <div className="space-y-1">
            {game.homePickers.length > 0 ? (
              game.homePickers.map((player) => (
                <PlayerRow key={player.userId} player={player} />
              ))
            ) : (
              <span className="text-xs text-slate-500 italic">No picks</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveSweatTab({ league, timeContext }: LiveSweatTabProps) {
  const { isDemoMode } = useDemoAuth();
  const [games, setGames] = useState<LiveSweatGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const sport = mapSportKey(league.sport_key);

  // Fetch live sweat data
  const fetchLiveSweat = async () => {
    try {
      setIsRefreshing(true);
      
      if (isDemoMode) {
        // Use demo data
        await new Promise(resolve => setTimeout(resolve, 500));
        setGames(getDemoLiveSweatData(sport));
      } else {
        // TODO: Fetch from real API
        const headers: HeadersInit = {};
        if (isDemoMode) {
          headers["X-Demo-Mode"] = "true";
        }
        
        const response = await fetch(
          `/api/live-sweat/${league.id}?period=${timeContext?.periodNumber || "current"}`,
          { headers }
        );
        
        if (response.ok) {
          const data = await response.json();
          setGames(data.games || []);
        } else {
          // Fallback to demo data for now
          setGames(getDemoLiveSweatData(sport));
        }
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to fetch live sweat data:", error);
      // Fallback to demo data
      setGames(getDemoLiveSweatData(sport));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchLiveSweat();
  }, [league.id, sport, isDemoMode]);

  // Auto-refresh every 20 seconds when games are live
  useEffect(() => {
    const hasLiveGames = games.some(g => g.status === "IN_PROGRESS");
    
    if (!hasLiveGames) return;
    
    const interval = setInterval(() => {
      fetchLiveSweat();
    }, 20000);
    
    return () => clearInterval(interval);
  }, [games, league.id, sport, isDemoMode]);

  // Split games by status
  const { liveGames, finalGames } = useMemo(() => {
    return {
      liveGames: games.filter(g => g.status === "IN_PROGRESS"),
      finalGames: games.filter(g => g.status === "FINAL"),
    };
  }, [games]);

  // Count at-risk players
  const atRiskCount = useMemo(() => {
    return games.reduce((count, game) => {
      const atRisk = [...game.awayPickers, ...game.homePickers].filter(
        p => p.status === "AT_RISK"
      ).length;
      return count + atRisk;
    }, 0);
  }, [games]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 bg-slate-800/50 rounded-xl" />
        <div className="h-64 bg-slate-800/30 rounded-2xl" />
        <div className="h-64 bg-slate-800/30 rounded-2xl" />
      </div>
    );
  }

  // No picks yet
  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-6">
          <Radio className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">No Picks Yet</h2>
        <p className="text-slate-400 max-w-sm">
          Live games will appear here once members make their picks for this week.
        </p>
      </div>
    );
  }

  // No live games right now
  if (liveGames.length === 0 && finalGames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-6">
          <Radio className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Nothing Live Right Now</h2>
        <p className="text-slate-400 max-w-sm">
          Check back when games kick off to see live scores and who's sweating.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {liveGames.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping" />
              </div>
              <span className="text-sm font-medium text-white">
                {liveGames.length} Live {liveGames.length === 1 ? "Game" : "Games"}
              </span>
            </div>
          )}
          
          {atRiskCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-400">
                {atRiskCount} AT RISK
              </span>
            </div>
          )}
        </div>
        
        <button
          onClick={fetchLiveSweat}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 transition-colors"
        >
          <RefreshCw className={cn(
            "w-3.5 h-3.5",
            isRefreshing && "animate-spin"
          )} />
          Refresh
        </button>
      </div>

      {/* Live Games */}
      {liveGames.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping" />
            </div>
            LIVE NOW
          </h3>
          
          <div className="space-y-4">
            {liveGames.map(game => (
              <LiveSweatGameCard key={game.gameId} game={game} />
            ))}
          </div>
        </div>
      )}

      {/* Final Games */}
      {finalGames.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-400">FINAL</h3>
          
          <div className="space-y-4">
            {finalGames.map(game => (
              <LiveSweatGameCard key={game.gameId} game={game} />
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div className="text-center">
        <span className="text-xs text-slate-500">
          Last updated: {lastRefresh.toLocaleTimeString()}
          {liveGames.length > 0 && " • Auto-refreshing every 20s"}
        </span>
      </div>
    </div>
  );
}
