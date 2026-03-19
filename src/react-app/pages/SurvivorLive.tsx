import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  ArrowLeft, Heart, Skull, Zap, AlertTriangle,
  Loader2, Users, Radio, ChevronDown, ChevronUp
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge, type SurvivorState } from "@/react-app/components/ui/team-badge";
import { EliminationTimeline } from "@/react-app/components/EliminationTimeline";
import { SurvivorFieldCollapse } from "@/react-app/components/SurvivorFieldCollapse";
import { ThresholdWhatJustChanged } from "@/react-app/components/ThresholdWhatJustChanged";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

// Types
interface LeagueInfo {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
}

interface GameEvent {
  id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "live" | "final" | "final_ot";
  start_at: string;
  winner?: string;
}

interface SurvivorPlayer {
  userId: string;
  userName: string;
  avatar?: string;
  isCurrentUser: boolean;
  status: "alive" | "sweating" | "eliminated";
  currentPick?: string;
  eliminatedAt?: string;
  gameStatus?: "scheduled" | "live" | "final" | "final_ot";
}

interface MemberPickData {
  user_id: string;
  userId?: string;
  userName?: string;
  display_name?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  is_eliminated?: boolean;
  eliminated_at?: string;
  picks?: Array<{ pick_value?: string; is_correct?: boolean }>;
  isCurrentUser?: boolean;
}

interface EliminationEvent {
  id: string;
  timestamp: Date;
  type: "elimination" | "safe" | "field_update";
  message: string;
  playersAffected?: number;
  team?: string;
}

interface Scenario {
  team: string;
  outcome: "wins" | "loses";
  consequence: string;
  playersAtRisk: number;
}

export function SurvivorLive() {
  const { id } = useParams<{ id: string }>();
  const { isDemoMode } = useDemoAuth();
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [players, setPlayers] = useState<SurvivorPlayer[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [eliminationTimeline, setEliminationTimeline] = useState<EliminationEvent[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<SurvivorPlayer | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameEvent | null>(null);

  // Fetch data
  useEffect(() => {
    if (id) {
      fetchData();
      // Poll for updates every 30 seconds during live games
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [id, isDemoMode]);

  const fetchData = async () => {
    const headers: HeadersInit = {};
    if (isDemoMode) {
      headers["X-Demo-Mode"] = "true";
    }
    
    try {
      // Fetch league
      const leagueRes = await fetch(`/api/leagues/${id}`, { headers });
      if (leagueRes.ok) {
        const leagueData = await leagueRes.json();
        setLeague(leagueData);
      }

      // Fetch periods
      const periodsRes = await fetch(`/api/leagues/${id}/periods`, { headers });
      if (periodsRes.ok) {
        const periodsData = await periodsRes.json();
        const period = periodsData.currentPeriod || periodsData.periods?.[0] || "Week 1";
        setCurrentPeriod(period);

        // Fetch events for period
        let fetchedEvents: GameEvent[] = [];
        const eventsRes = await fetch(`/api/leagues/${id}/events?period=${encodeURIComponent(period)}`, { headers });
        if (eventsRes.ok) {
          fetchedEvents = await eventsRes.json();
          setEvents(fetchedEvents);
        }

        // Fetch all picks to build survivor state
        const picksRes = await fetch(`/api/leagues/${id}/all-picks?period=${encodeURIComponent(period)}`, { headers });
        if (picksRes.ok) {
          const picksData = await picksRes.json();
          processPlayerData(picksData, fetchedEvents);
        } else {
          generateDemoData();
        }
      } else {
        generateDemoData();
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      generateDemoData();
    } finally {
      setIsLoading(false);
    }
  };

  // Generate demo data when no real data available
  const generateDemoData = useCallback(() => {
    const demoPlayers: SurvivorPlayer[] = [
      { userId: "1", userName: "Mike Thompson", isCurrentUser: true, status: "sweating", currentPick: "Kansas City Chiefs", gameStatus: "live" },
      { userId: "2", userName: "Sarah Chen", isCurrentUser: false, status: "alive", currentPick: "Buffalo Bills" },
      { userId: "3", userName: "Jake Miller", isCurrentUser: false, status: "sweating", currentPick: "Kansas City Chiefs", gameStatus: "live" },
      { userId: "4", userName: "Emma Wilson", isCurrentUser: false, status: "alive", currentPick: "Philadelphia Eagles" },
      { userId: "5", userName: "Chris Davis", isCurrentUser: false, status: "eliminated", currentPick: "Dallas Cowboys", eliminatedAt: "Week 12" },
      { userId: "6", userName: "Aisha Johnson", isCurrentUser: false, status: "sweating", currentPick: "San Francisco 49ers", gameStatus: "live" },
      { userId: "7", userName: "Ryan O'Brien", isCurrentUser: false, status: "alive", currentPick: "Detroit Lions" },
      { userId: "8", userName: "Maria Garcia", isCurrentUser: false, status: "eliminated", currentPick: "Miami Dolphins", eliminatedAt: "Week 11" },
      { userId: "9", userName: "Tom Bradley", isCurrentUser: false, status: "alive", currentPick: "Baltimore Ravens" },
      { userId: "10", userName: "Lisa Park", isCurrentUser: false, status: "eliminated", currentPick: "New York Jets", eliminatedAt: "Week 10" },
      { userId: "11", userName: "David Kim", isCurrentUser: false, status: "sweating", currentPick: "San Francisco 49ers", gameStatus: "live" },
      { userId: "12", userName: "Jennifer Lee", isCurrentUser: false, status: "alive", currentPick: "Cincinnati Bengals" },
    ];

    const demoEvents: GameEvent[] = [
      { id: 1, home_team: "Kansas City Chiefs", away_team: "Las Vegas Raiders", home_score: 21, away_score: 17, status: "live", start_at: new Date().toISOString() },
      { id: 2, home_team: "San Francisco 49ers", away_team: "Seattle Seahawks", home_score: 14, away_score: 10, status: "live", start_at: new Date().toISOString() },
      { id: 3, home_team: "Buffalo Bills", away_team: "New York Jets", home_score: null, away_score: null, status: "scheduled", start_at: new Date(Date.now() + 3600000).toISOString() },
      { id: 4, home_team: "Philadelphia Eagles", away_team: "Dallas Cowboys", home_score: 31, away_score: 24, status: "final", start_at: new Date().toISOString(), winner: "Philadelphia Eagles" },
      { id: 5, home_team: "Detroit Lions", away_team: "Green Bay Packers", home_score: null, away_score: null, status: "scheduled", start_at: new Date(Date.now() + 7200000).toISOString() },
      { id: 6, home_team: "Baltimore Ravens", away_team: "Cleveland Browns", home_score: null, away_score: null, status: "scheduled", start_at: new Date(Date.now() + 10800000).toISOString() },
      { id: 7, home_team: "Cincinnati Bengals", away_team: "Pittsburgh Steelers", home_score: null, away_score: null, status: "scheduled", start_at: new Date(Date.now() + 14400000).toISOString() },
    ];

    const demoTimeline: EliminationEvent[] = [
      { id: "1", timestamp: new Date(), type: "field_update", message: "Pool reduced to 9 / 12 players" },
      { id: "2", timestamp: new Date(), type: "elimination", message: "Dallas Cowboys loss eliminated 1 player", playersAffected: 1, team: "Dallas Cowboys" },
      { id: "3", timestamp: new Date(), type: "safe", message: "Philadelphia Eagles win keeps 1 player alive", playersAffected: 1, team: "Philadelphia Eagles" },
    ];

    setPlayers(demoPlayers);
    setEvents(demoEvents);
    setEliminationTimeline(demoTimeline);
    setCurrentPeriod("Week 14");
  }, []);

  const processPlayerData = useCallback((picksData: MemberPickData[], eventsData: GameEvent[]) => {
    // If no picks data, use demo data
    if (!picksData || picksData.length === 0) {
      generateDemoData();
      return;
    }

    const processedPlayers: SurvivorPlayer[] = picksData.map((member: MemberPickData) => {
      const pick = member.picks?.[0]; // Survivor = one pick per period
      const pickValue = pick?.pick_value;
      
      // Find the game for this pick
      const game = eventsData.find(
        e => e.home_team === pickValue || e.away_team === pickValue
      );
      
      // Determine status
      let status: "alive" | "sweating" | "eliminated" = "alive";
      let gameStatus: "scheduled" | "live" | "final" | "final_ot" | undefined;
      
      if (game) {
        gameStatus = game.status;
        
        if (game.status === "live") {
          status = "sweating";
        } else if (game.status === "final" || game.status === "final_ot") {
          // Check if their team lost
          const teamWon = game.winner === pickValue;
          status = teamWon ? "alive" : "eliminated";
        }
      }
      
      // Check historical elimination (from previous weeks)
      if (pick?.is_correct === false) {
        status = "eliminated";
      }

      return {
        userId: member.userId || member.user_id || "",
        userName: member.userName || member.display_name || member.email || "Unknown",
        avatar: member.avatar || member.avatar_url || "",
        isCurrentUser: member.isCurrentUser || false,
        status,
        currentPick: pickValue,
        gameStatus,
        eliminatedAt: status === "eliminated" ? currentPeriod : undefined,
      };
    });

    setPlayers(processedPlayers);
    
    // Generate timeline events based on game results
    generateTimeline(processedPlayers, eventsData);
  }, [currentPeriod, generateDemoData]);

  const generateTimeline = (players: SurvivorPlayer[], events: GameEvent[]) => {
    const timeline: EliminationEvent[] = [];
    
    // Group by team outcomes
    const finalGames = events.filter(e => e.status === "final" || e.status === "final_ot");
    
    finalGames.forEach(game => {
      const losingTeam = game.winner === game.home_team ? game.away_team : game.home_team;
      const winningTeam = game.winner;
      
      const eliminatedPlayers = players.filter(
        p => p.currentPick === losingTeam && p.status === "eliminated"
      );
      
      const safePlayers = players.filter(
        p => p.currentPick === winningTeam && p.status === "alive"
      );
      
      if (eliminatedPlayers.length > 0) {
        timeline.push({
          id: `elim-${game.id}`,
          timestamp: new Date(),
          type: "elimination",
          message: `${losingTeam} loss eliminated ${eliminatedPlayers.length} player${eliminatedPlayers.length > 1 ? 's' : ''}`,
          playersAffected: eliminatedPlayers.length,
          team: losingTeam,
        });
      }
      
      if (safePlayers.length > 0) {
        timeline.push({
          id: `safe-${game.id}`,
          timestamp: new Date(),
          type: "safe",
          message: `${winningTeam} win keeps ${safePlayers.length} player${safePlayers.length > 1 ? 's' : ''} alive`,
          playersAffected: safePlayers.length,
          team: winningTeam,
        });
      }
    });
    
    // Add field update
    const alive = players.filter(p => p.status !== "eliminated").length;
    const total = players.length;
    if (finalGames.length > 0) {
      timeline.unshift({
        id: "field-update",
        timestamp: new Date(),
        type: "field_update",
        message: `Pool reduced to ${alive} / ${total} players`,
        playersAffected: alive,
      });
    }
    
    setEliminationTimeline(timeline);
  };

  // Stats
  const stats = useMemo(() => {
    const alive = players.filter(p => p.status === "alive").length;
    const sweating = players.filter(p => p.status === "sweating").length;
    const eliminated = players.filter(p => p.status === "eliminated").length;
    return { alive, sweating, eliminated, total: players.length };
  }, [players]);

  // Live games
  const liveGames = useMemo(() => {
    return events.filter(e => e.status === "live");
  }, [events]);

  // Scenarios (only show during live games)
  const scenarios = useMemo((): Scenario[] => {
    if (liveGames.length === 0) return [];
    
    return liveGames.flatMap(game => {
      const homePickCount = players.filter(p => p.currentPick === game.home_team && p.status !== "eliminated").length;
      const awayPickCount = players.filter(p => p.currentPick === game.away_team && p.status !== "eliminated").length;
      
      const results: Scenario[] = [];
      
      if (homePickCount > 0) {
        results.push({
          team: game.home_team,
          outcome: "loses",
          consequence: `${homePickCount} player${homePickCount > 1 ? 's' : ''} eliminated`,
          playersAtRisk: homePickCount,
        });
      }
      
      if (awayPickCount > 0) {
        results.push({
          team: game.away_team,
          outcome: "loses",
          consequence: `${awayPickCount} player${awayPickCount > 1 ? 's' : ''} eliminated`,
          playersAtRisk: awayPickCount,
        });
      }
      
      return results;
    }).sort((a, b) => b.playersAtRisk - a.playersAtRisk);
  }, [liveGames, players]);

  // Endgame detection
  const isEndgame = stats.alive <= 10 && stats.alive > 0;
  
  // Unique picks among remaining players
  const uniquePicks = useMemo(() => {
    const alivePlayers = players.filter(p => p.status !== "eliminated");
    const picks = new Set(alivePlayers.map(p => p.currentPick).filter(Boolean));
    return Array.from(picks);
  }, [players]);

  // Get players by game
  const getPlayersForGame = (game: GameEvent) => {
    return players.filter(
      p => p.currentPick === game.home_team || p.currentPick === game.away_team
    );
  };

  // Map player status to survivor state
  const getSurvivorState = (player: SurvivorPlayer): SurvivorState => {
    if (player.status === "eliminated") return "eliminated";
    if (player.status === "sweating") return "sweating";
    return "alive";
  };

  // Get game status for badge
  const getGameStatusForBadge = (game: GameEvent): "upcoming" | "live" | "final" => {
    if (game.status === "live") return "live";
    if (game.status === "final" || game.status === "final_ot") return "final";
    return "upcoming";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">League not found</p>
          <Link to="/" className="text-primary hover:underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const hasLiveGames = liveGames.length > 0;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to={`/leagues/${id}/overview`}>
                <button className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <div>
                <h1 className="font-bold text-lg leading-tight">{league.name}</h1>
                <p className="text-sm text-muted-foreground">{currentPeriod}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* LIVE Badge */}
              {hasLiveGames && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 animate-live-glow">
                  <Radio className="h-3 w-3 text-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Live</span>
                </div>
              )}
              
              {/* Alive Counter */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <Heart className="h-4 w-4 text-emerald-500" />
                <span className="font-bold text-emerald-500">{stats.alive}</span>
                <span className="text-xs text-muted-foreground">/ {stats.total}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* What Just Changed - Threshold Engine */}
        <ThresholdWhatJustChanged 
          scope="DEMO"
          leagueId={Number(id)}
          maxItems={3}
          defaultExpanded={hasLiveGames}
          variant="compact"
          refreshInterval={20000}
        />

        {/* Scenario Strip - Only during live games */}
        {scenarios.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Zap className="h-3.5 w-3.5" />
              <span>Live Scenarios</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {scenarios.slice(0, 4).map((scenario, idx) => (
                <div 
                  key={idx}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm"
                >
                  <span className="text-muted-foreground">If</span>
                  <TeamBadge 
                    teamName={scenario.team} 
                    size="sm" 
                    status="live"
                    survivorState="sweating"
                  />
                  <span className="text-muted-foreground">{scenario.outcome} →</span>
                  <span className="font-semibold text-amber-500">{scenario.consequence}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Endgame Panel */}
        {isEndgame && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-amber-500">Endgame Mode</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Only {stats.alive} players remain. 
                  {uniquePicks.length} unique picks in play.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {uniquePicks.slice(0, 5).map(pick => (
                    <TeamBadge key={pick} teamName={pick!} size="sm" status="upcoming" />
                  ))}
                  {uniquePicks.length > 5 && (
                    <span className="px-2 py-1 text-xs text-muted-foreground">
                      +{uniquePicks.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Field View - Player Groups */}
        <div className="space-y-6">
          {/* Alive Players */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Heart className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <span className="font-semibold text-emerald-500">Alive</span>
              <span className="text-sm text-muted-foreground">({stats.alive})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {players
                .filter(p => p.status === "alive")
                .map(player => (
                  <button
                    key={player.userId}
                    onClick={() => setSelectedPlayer(player)}
                    className={cn(
                      "group flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200",
                      "bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10",
                      player.isCurrentUser && "ring-2 ring-primary/50"
                    )}
                  >
                    {player.currentPick && (
                      <TeamBadge 
                        teamName={player.currentPick} 
                        size="md" 
                        status="upcoming"
                        survivorState="alive"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium truncate",
                        player.isCurrentUser && "text-primary"
                      )}>
                        {player.userName}
                        {player.isCurrentUser && " (You)"}
                      </p>
                      {player.currentPick && (
                        <p className="text-xs text-muted-foreground truncate">
                          {player.currentPick}
                        </p>
                      )}
                    </div>
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Heart className="h-3 w-3 text-emerald-500" />
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Sweating Players */}
          {stats.sweating > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center animate-pulse">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <span className="font-semibold text-amber-500">Sweating</span>
                <span className="text-sm text-muted-foreground">({stats.sweating})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {players
                  .filter(p => p.status === "sweating")
                  .map(player => (
                    <button
                      key={player.userId}
                      onClick={() => setSelectedPlayer(player)}
                      className={cn(
                        "group flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200",
                        "bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/50",
                        player.isCurrentUser && "ring-2 ring-primary/50"
                      )}
                    >
                      {player.currentPick && (
                        <TeamBadge 
                          teamName={player.currentPick} 
                          size="md" 
                          status="live"
                          survivorState="sweating"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium truncate",
                          player.isCurrentUser && "text-primary"
                        )}>
                          {player.userName}
                          {player.isCurrentUser && " (You)"}
                        </p>
                        {player.currentPick && (
                          <p className="text-xs text-amber-400 truncate font-medium flex items-center gap-1">
                            <Radio className="h-2.5 w-2.5 animate-pulse" />
                            {player.currentPick} • LIVE
                          </p>
                        )}
                      </div>
                      <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Eliminated Players */}
          {stats.eliminated > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                  <Skull className="h-3.5 w-3.5 text-red-500" />
                </div>
                <span className="font-semibold text-red-500">Eliminated</span>
                <span className="text-sm text-muted-foreground">({stats.eliminated})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {players
                  .filter(p => p.status === "eliminated")
                  .map(player => (
                    <button
                      key={player.userId}
                      onClick={() => setSelectedPlayer(player)}
                      className={cn(
                        "group flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200",
                        "bg-red-500/5 border border-red-500/20 opacity-60 hover:opacity-80",
                        player.isCurrentUser && "ring-2 ring-primary/50 opacity-100"
                      )}
                    >
                      {player.currentPick && (
                        <TeamBadge 
                          teamName={player.currentPick} 
                          size="md" 
                          status="final"
                          survivorState="eliminated"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium truncate",
                          !player.isCurrentUser && "line-through text-muted-foreground"
                        )}>
                          {player.userName}
                          {player.isCurrentUser && " (You)"}
                        </p>
                        {player.currentPick && (
                          <p className="text-xs text-muted-foreground truncate">
                            {player.currentPick}
                          </p>
                        )}
                      </div>
                      <Skull className="h-4 w-4 text-red-500/50 shrink-0" />
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Games - Tap to see who's riding */}
        {events.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Users className="h-3.5 w-3.5" />
              <span>Games This Week</span>
            </div>
            <div className="space-y-2">
              {events.map(game => {
                const playersOnGame = getPlayersForGame(game);
                const homePlayers = playersOnGame.filter(p => p.currentPick === game.home_team);
                const awayPlayers = playersOnGame.filter(p => p.currentPick === game.away_team);
                const isLive = game.status === "live";
                const isFinal = game.status === "final" || game.status === "final_ot";
                const gameStatus = getGameStatusForBadge(game);
                
                // Determine winner status for badges
                const awayWon = game.winner === game.away_team;
                const homeWon = game.winner === game.home_team;
                
                return (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGame(selectedGame?.id === game.id ? null : game)}
                    className={cn(
                      "w-full p-4 rounded-xl text-left transition-all duration-200",
                      "border bg-card hover:bg-muted/50",
                      isLive && "border-red-500/50 bg-red-500/5 animate-live-glow",
                      isFinal && "border-border/50",
                      selectedGame?.id === game.id && "ring-2 ring-primary"
                    )}
                  >
                    {/* Game Header */}
                    <div className="flex items-center justify-between mb-3">
                      {isLive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-xs font-bold">
                          <Radio className="h-2.5 w-2.5 animate-pulse" />
                          LIVE
                        </span>
                      )}
                      {isFinal && (
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Final</span>
                      )}
                      {!isLive && !isFinal && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(game.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {playersOnGame.length} player{playersOnGame.length !== 1 ? 's' : ''} riding
                      </div>
                    </div>

                    {/* Matchup with TeamBadges */}
                    <div className="flex items-center justify-between gap-4">
                      {/* Away Team */}
                      <div className="flex-1 flex items-center gap-3">
                        <TeamBadge 
                          teamName={game.away_team} 
                          size="lg" 
                          status={gameStatus}
                          emphasis={isFinal ? (awayWon ? "winning" : "losing") : "normal"}
                          survivorState={
                            isLive && awayPlayers.some(p => p.status === "sweating") 
                              ? "sweating" 
                              : isFinal && !awayWon 
                                ? "eliminated" 
                                : "alive"
                          }
                        />
                        <div className="min-w-0">
                          <p className={cn(
                            "font-semibold truncate",
                            isFinal && awayWon && "text-emerald-500"
                          )}>
                            {game.away_team}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {awayPlayers.length} pick{awayPlayers.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-2 px-3">
                        {(isLive || isFinal) && game.away_score !== null && game.home_score !== null ? (
                          <div className="flex items-center gap-2 text-xl font-bold tabular-nums">
                            <span className={cn(awayWon && "text-emerald-500")}>{game.away_score}</span>
                            <span className="text-muted-foreground text-sm">-</span>
                            <span className={cn(homeWon && "text-emerald-500")}>{game.home_score}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">vs</span>
                        )}
                      </div>

                      {/* Home Team */}
                      <div className="flex-1 flex items-center gap-3 justify-end">
                        <div className="min-w-0 text-right">
                          <p className={cn(
                            "font-semibold truncate",
                            isFinal && homeWon && "text-emerald-500"
                          )}>
                            {game.home_team}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {homePlayers.length} pick{homePlayers.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <TeamBadge 
                          teamName={game.home_team} 
                          size="lg" 
                          status={gameStatus}
                          emphasis={isFinal ? (homeWon ? "winning" : "losing") : "normal"}
                          survivorState={
                            isLive && homePlayers.some(p => p.status === "sweating") 
                              ? "sweating" 
                              : isFinal && !homeWon 
                                ? "eliminated" 
                                : "alive"
                          }
                        />
                      </div>
                    </div>
                    
                    {/* Expanded player list */}
                    {selectedGame?.id === game.id && playersOnGame.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">{game.away_team}</p>
                          {awayPlayers.length > 0 ? awayPlayers.map(p => (
                            <div 
                              key={p.userId} 
                              className={cn(
                                "flex items-center gap-2 text-sm",
                                p.status === "eliminated" && "line-through text-muted-foreground"
                              )}
                            >
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                p.status === "alive" && "bg-emerald-500",
                                p.status === "sweating" && "bg-amber-500 animate-pulse",
                                p.status === "eliminated" && "bg-red-500"
                              )} />
                              {p.userName}
                            </div>
                          )) : (
                            <p className="text-sm text-muted-foreground/50">No picks</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">{game.home_team}</p>
                          {homePlayers.length > 0 ? homePlayers.map(p => (
                            <div 
                              key={p.userId} 
                              className={cn(
                                "flex items-center gap-2 text-sm",
                                p.status === "eliminated" && "line-through text-muted-foreground"
                              )}
                            >
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                p.status === "alive" && "bg-emerald-500",
                                p.status === "sweating" && "bg-amber-500 animate-pulse",
                                p.status === "eliminated" && "bg-red-500"
                              )} />
                              {p.userName}
                            </div>
                          )) : (
                            <p className="text-sm text-muted-foreground/50">No picks</p>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Elimination Timeline */}
        {eliminationTimeline.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setTimelineExpanded(!timelineExpanded)}
              className="flex items-center justify-between w-full text-xs text-muted-foreground uppercase tracking-wide"
            >
              <span>What Just Happened</span>
              {timelineExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            
            {timelineExpanded && (
              <div className="space-y-2">
                {eliminationTimeline.map(event => (
                  <div 
                    key={event.id}
                    className={cn(
                      "p-3 rounded-xl text-sm flex items-center gap-3",
                      event.type === "elimination" && "bg-red-500/10 border border-red-500/20",
                      event.type === "safe" && "bg-emerald-500/10 border border-emerald-500/20",
                      event.type === "field_update" && "bg-muted/50 border border-border"
                    )}
                  >
                    {event.type === "elimination" && <Skull className="h-4 w-4 text-red-500 shrink-0" />}
                    {event.type === "safe" && <Heart className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {event.type === "field_update" && <Users className="h-4 w-4 text-muted-foreground shrink-0" />}
                    
                    {event.team ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <TeamBadge 
                          teamName={event.team} 
                          size="sm" 
                          status="final"
                          survivorState={event.type === "elimination" ? "eliminated" : "alive"}
                        />
                        <span className={cn(
                          event.type === "elimination" && "text-red-400",
                          event.type === "safe" && "text-emerald-400"
                        )}>
                          {event.type === "elimination" ? "loss" : "win"} — {event.playersAffected} player{event.playersAffected !== 1 ? 's' : ''} {event.type === "elimination" ? "eliminated" : "safe"}
                        </span>
                      </div>
                    ) : (
                      <span>{event.message}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Field Collapse & Elimination Timeline */}
        {players.length > 0 && (
          <div className="space-y-4">
            <SurvivorFieldCollapse leagueId={Number(id)} isDemoMode={true} />
            <EliminationTimeline leagueId={Number(id)} isDemoMode={true} />
          </div>
        )}

        {/* Empty state */}
        {players.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No picks submitted yet</p>
          </div>
        )}
      </main>

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div 
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-in slide-in-from-bottom-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-6">
              {selectedPlayer.currentPick && (
                <TeamBadge 
                  teamName={selectedPlayer.currentPick} 
                  size="xl" 
                  status={selectedPlayer.gameStatus === "live" ? "live" : selectedPlayer.status === "eliminated" ? "final" : "upcoming"}
                  survivorState={getSurvivorState(selectedPlayer)}
                />
              )}
              <div>
                <h3 className="font-bold text-lg">{selectedPlayer.userName}</h3>
                <p className={cn(
                  "text-sm font-medium capitalize flex items-center gap-1.5",
                  selectedPlayer.status === "alive" && "text-emerald-500",
                  selectedPlayer.status === "sweating" && "text-amber-500",
                  selectedPlayer.status === "eliminated" && "text-red-500"
                )}>
                  {selectedPlayer.status === "alive" && <Heart className="h-3.5 w-3.5" />}
                  {selectedPlayer.status === "sweating" && <Zap className="h-3.5 w-3.5" />}
                  {selectedPlayer.status === "eliminated" && <Skull className="h-3.5 w-3.5" />}
                  {selectedPlayer.status}
                </p>
              </div>
            </div>
            
            {selectedPlayer.currentPick && (
              <div className="p-3 rounded-lg bg-muted/50 mb-4">
                <p className="text-xs text-muted-foreground mb-1">Current Pick</p>
                <p className="font-semibold">{selectedPlayer.currentPick}</p>
              </div>
            )}
            
            {selectedPlayer.eliminatedAt && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-muted-foreground mb-1">Eliminated</p>
                <p className="font-semibold text-red-400">{selectedPlayer.eliminatedAt}</p>
              </div>
            )}
            
            <button
              onClick={() => setSelectedPlayer(null)}
              className="w-full mt-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
