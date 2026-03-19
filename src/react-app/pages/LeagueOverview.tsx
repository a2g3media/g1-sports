import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/react-app/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/react-app/components/ui/avatar";
import {
  ArrowLeft, Trophy, Users, Skull, Heart, Check, X, Minus,
  Loader2, Target, TrendingUp, TrendingDown, Crown,
  ChevronLeft, ChevronRight, Lock, Eye, EyeOff, Clock,
  Table2, Activity, BarChart3, Radio
} from "lucide-react";
import { SPORTS, POOL_FORMATS, getVariantName } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";
import { SurvivorFieldCollapse } from "@/react-app/components/SurvivorFieldCollapse";
import { EliminationTimeline } from "@/react-app/components/EliminationTimeline";

interface LeagueInfo {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  variant_key?: string;
  season: string;
}

interface Standing {
  userId: number;
  userName: string;
  avatar?: string;
  rank: number;
  previousRank: number;
  totalPoints: number;
  weeklyPoints: number;
  winPercentage: number;
  streak: { count: number; type: "win" | "loss" } | null;
  isCurrentUser: boolean;
}

interface GameEvent {
  id: number;
  external_id: string;
  sport_key: string;
  period_id: string;
  start_at: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "live" | "final";
  final_result: string | null;
}

interface MemberPick {
  userId: number;
  userName: string;
  avatar?: string;
  pickValue: string | null;
  isCorrect: boolean | null;
  confidenceRank?: number;
  isCurrentUser: boolean;
}

interface GameWithPicks {
  event: GameEvent;
  picks: MemberPick[];
}

// StandingsApiResponse type handled inline via Member interface

interface EventApiResponse {
  id: number;
  external_id: string;
  sport_key: string;
  period_id: string;
  start_at: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  winner?: string;
  final_result?: string;
}

interface MemberPicksApiResponse {
  user_id: number;
  userId?: number;
  userName?: string;
  display_name?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  picks: Array<{ event_id: number; pick_value?: string; confidence_rank?: number }>;
  isCurrentUser?: boolean;
}

interface StandingsApiResponse {
  user_id: number;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  rank?: number;
  previous_rank?: number;
  total_points?: number;
  win_percentage?: number;
  current_streak: number;
  streak_type?: string;
}

interface SurvivorMember {
  userId: number;
  userName: string;
  avatar?: string;
  isAlive: boolean;
  eliminatedWeek?: string;
  currentPick?: string;
  picksHistory: { week: string; team: string; result: "win" | "loss" | "pending" }[];
  isCurrentUser: boolean;
}

interface PickDistribution {
  team: string;
  count: number;
  percentage: number;
}

export function LeagueOverview() {
  const { id } = useParams<{ id: string }>();
  const { isDemoMode } = useDemoAuth();
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [gamesWithPicks, setGamesWithPicks] = useState<GameWithPicks[]>([]);
  const [survivorMembers, setSurvivorMembers] = useState<SurvivorMember[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHiddenPicks, setShowHiddenPicks] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "spreadsheet" | "standings" | "survivor">("live");

  const isSurvivor = league?.format_key === "survivor";

  useEffect(() => {
    if (id) {
      fetchLeagueData();
    }
  }, [id]);

  const generateSurvivorData = (members: Standing[]): SurvivorMember[] => {
    const weeks = ["Week 10", "Week 11", "Week 12", "Week 13", "Week 14", "Week 15"];
    const teams = [
      "Kansas City Chiefs", "Buffalo Bills", "Philadelphia Eagles", "San Francisco 49ers",
      "Dallas Cowboys", "Detroit Lions", "Miami Dolphins", "Baltimore Ravens",
      "Cincinnati Bengals", "Jacksonville Jaguars", "Cleveland Browns", "Seattle Seahawks"
    ];

    return members.map((member, idx) => {
      const eliminatedAt = idx > 7 ? Math.floor(Math.random() * 5) : -1;
      const isAlive = eliminatedAt === -1;

      const picksHistory = weeks.map((week, weekIdx) => {
        const teamIdx = (member.userId + weekIdx) % teams.length;
        const result: "win" | "loss" | "pending" = 
          weekIdx === weeks.length - 1 ? "pending" :
          (eliminatedAt === weekIdx ? "loss" : "win");
        
        return { week, team: teams[teamIdx], result };
      });

      return {
        userId: member.userId,
        userName: member.userName,
        avatar: member.avatar,
        isAlive,
        eliminatedWeek: isAlive ? undefined : weeks[eliminatedAt],
        currentPick: isAlive ? picksHistory[picksHistory.length - 1].team : undefined,
        picksHistory,
        isCurrentUser: member.isCurrentUser,
      };
    });
  };

  const fetchLeagueData = async () => {
    setIsLoading(true);
    const headers: HeadersInit = isDemoMode ? { "X-Demo-Mode": "true" } : {};
    try {
      // Fetch league info
      const response = await fetch(`/api/leagues/${id}`, { headers });
      let leagueData = null;
      if (response.ok) {
        leagueData = await response.json();
        setLeague(leagueData);
      }

      // Fetch standings
      const standingsRes = await fetch(`/api/leagues/${id}/standings`, { headers });
      let standingsData: Standing[] = [];
      if (standingsRes.ok) {
        const data = await standingsRes.json();
        standingsData = data.standings?.map((s: StandingsApiResponse, idx: number) => ({
          userId: s.user_id,
          userName: s.display_name || s.email,
          avatar: s.avatar_url,
          rank: s.rank || idx + 1,
          previousRank: s.previous_rank || s.rank || idx + 1,
          totalPoints: s.total_points || 0,
          weeklyPoints: 0,
          winPercentage: s.win_percentage || 0,
          streak: s.current_streak > 0 ? { count: s.current_streak, type: s.streak_type as "win" | "loss" } : null,
          isCurrentUser: s.user_id === data.league?.currentUserId,
        })) || [];
        setStandings(standingsData);
      }

      // Fetch periods
      const periodsRes = await fetch(`/api/leagues/${id}/periods`, { headers });
      if (periodsRes.ok) {
        const periodsData = await periodsRes.json();
        setAvailablePeriods(periodsData.periods || []);
        const period = periodsData.currentPeriod || periodsData.periods?.[0] || "";
        setCurrentPeriod(period);

        // Fetch events for current period
        if (period && leagueData) {
          const eventsRes = await fetch(`/api/leagues/${id}/events?period=${encodeURIComponent(period)}`, { headers });
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            const events: GameEvent[] = eventsData.map((e: EventApiResponse) => ({
              id: e.id,
              external_id: e.external_id,
              sport_key: e.sport_key,
              period_id: e.period_id,
              start_at: e.start_at,
              home_team: e.home_team,
              away_team: e.away_team,
              home_score: e.home_score,
              away_score: e.away_score,
              status: e.status as "scheduled" | "live" | "final",
              final_result: e.winner || e.final_result,
            }));

            // Fetch all picks for this period
            const allPicksRes = await fetch(`/api/leagues/${id}/all-picks?period=${encodeURIComponent(period)}`, { headers });
            if (allPicksRes.ok) {
              const allPicksData = await allPicksRes.json();
              
              // Transform into gamesWithPicks format
              const gamesData: GameWithPicks[] = events.map(event => {
                const isLocked = new Date(event.start_at) <= new Date() || event.status !== "scheduled";
                
                const picks: MemberPick[] = allPicksData.map((member: MemberPicksApiResponse) => {
                  const memberPick = member.picks.find((p: { event_id: number }) => p.event_id === event.id);
                  let isCorrect: boolean | null = null;
                  
                  if (event.status === "final" && event.final_result && memberPick?.pick_value) {
                    isCorrect = memberPick.pick_value === event.final_result;
                  }
                  
                  return {
                    userId: member.userId,
                    userName: member.userName,
                    avatar: member.avatar,
                    pickValue: isLocked ? (memberPick?.pick_value || null) : null,
                    isCorrect,
                    confidenceRank: memberPick?.confidence_rank,
                    isCurrentUser: member.isCurrentUser,
                  };
                });

                return { event, picks };
              });

              setGamesWithPicks(gamesData);
              
              // Generate survivor data if applicable
              if (leagueData.format_key === "survivor" && standingsData.length > 0) {
                const survivorData = generateSurvivorData(standingsData);
                setSurvivorMembers(survivorData);
                setActiveTab("survivor");
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch league data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const navigatePeriod = (direction: "prev" | "next") => {
    const currentIndex = availablePeriods.indexOf(currentPeriod);
    if (direction === "prev" && currentIndex > 0) {
      setCurrentPeriod(availablePeriods[currentIndex - 1]);
    } else if (direction === "next" && currentIndex < availablePeriods.length - 1) {
      setCurrentPeriod(availablePeriods[currentIndex + 1]);
    }
  };

  const getSportIcon = (sportKey: string) => {
    const sport = SPORTS.find(s => s.key === sportKey);
    return sport?.icon;
  };

  const formatGameTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Calculate survivor stats
  const survivorStats = useMemo(() => {
    const alive = survivorMembers.filter(m => m.isAlive).length;
    const eliminated = survivorMembers.filter(m => !m.isAlive).length;
    return { alive, eliminated, total: survivorMembers.length };
  }, [survivorMembers]);

  // Filter games for current period
  const periodGames = useMemo(() => {
    return gamesWithPicks.filter(g => g.event.period_id === currentPeriod);
  }, [gamesWithPicks, currentPeriod]);

  // Calculate pick distribution for each game
  const getPickDistribution = (game: GameWithPicks): { home: PickDistribution; away: PickDistribution } => {
    const totalPicks = game.picks.filter(p => p.pickValue).length;
    const homePicks = game.picks.filter(p => p.pickValue === game.event.home_team).length;
    const awayPicks = game.picks.filter(p => p.pickValue === game.event.away_team).length;
    
    return {
      home: {
        team: game.event.home_team,
        count: homePicks,
        percentage: totalPicks > 0 ? Math.round((homePicks / totalPicks) * 100) : 0,
      },
      away: {
        team: game.event.away_team,
        count: awayPicks,
        percentage: totalPicks > 0 ? Math.round((awayPicks / totalPicks) * 100) : 0,
      },
    };
  };

  // Pool statistics
  const poolStats = useMemo(() => {
    const total = standings.length;
    if (isSurvivor) {
      const alive = survivorMembers.filter(m => m.isAlive).length;
      const eliminated = total - alive;
      return { started: total, eliminated, remaining: alive };
    }
    return { started: total, eliminated: 0, remaining: total };
  }, [standings, survivorMembers, isSurvivor]);

  // Get unique members for spreadsheet
  const allMembers = useMemo(() => {
    return standings.sort((a, b) => a.rank - b.rank);
  }, [standings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">League not found</p>
        <Link to="/">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const SportIcon = getSportIcon(league.sport_key);
  const format = POOL_FORMATS.find(f => f.key === league.format_key);
  const variantName = league.variant_key ? getVariantName(league.format_key, league.variant_key) : "";

  // Get variant display info for survivor pools
  const getVariantBadgeStyle = (variantKey?: string) => {
    switch (variantKey) {
      case "winner":
        return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "loser":
        return "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30";
      case "ats":
        return "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link to="/">
            <button className="btn-icon mt-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {SportIcon && <SportIcon className="h-5 w-5 text-primary" />}
              <Badge variant="secondary">{format?.name}</Badge>
              {variantName && (
                <Badge className={cn("border", getVariantBadgeStyle(league.variant_key))}>
                  {variantName}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">{league.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSurvivor && (
            <Link to={`/leagues/${id}/live`}>
              <Button variant="default" className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white border-0">
                <Radio className="h-4 w-4 mr-2" />
                Live Pool
              </Button>
            </Link>
          )}
          <Link to={league.format_key === "bracket" ? `/leagues/${id}/bracket` : `/leagues/${id}/picks`}>
            <Button variant={isSurvivor ? "outline" : "default"}>
              <Target className="h-4 w-4 mr-2" />
              {league.format_key === "bracket" ? "Fill Bracket" : "Make Picks"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Pool Stats Banner */}
      <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-emerald-500/10 border-primary/30">
        <CardContent className="py-5">
          <div className="flex items-center justify-around text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold text-primary">{poolStats.started}</span>
              </div>
              <p className="text-sm text-muted-foreground">Started Pool</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Skull className="h-5 w-5 text-red-500" />
                <span className="text-3xl font-bold text-red-600">{poolStats.eliminated}</span>
              </div>
              <p className="text-sm text-muted-foreground">Eliminated</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Heart className="h-5 w-5 text-emerald-500" />
                <span className="text-3xl font-bold text-emerald-600">{poolStats.remaining}</span>
              </div>
              <p className="text-sm text-muted-foreground">Remaining</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Survivor Variant Rules Info */}
      {isSurvivor && league.variant_key && (
        <div className={cn(
          "p-4 rounded-xl border flex items-start gap-3",
          getVariantBadgeStyle(league.variant_key)
        )}>
          {league.variant_key === "winner" && (
            <>
              <Heart className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Pick Winner Rules</p>
                <p className="text-sm opacity-80">Pick one team to WIN each week. If your team loses, you're eliminated. Cannot pick the same team twice.</p>
              </div>
            </>
          )}
          {league.variant_key === "loser" && (
            <>
              <Skull className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Pick Loser Rules</p>
                <p className="text-sm opacity-80">Pick one team to LOSE each week. If your team wins, you're eliminated. Cannot pick the same team twice.</p>
              </div>
            </>
          )}
          {league.variant_key === "ats" && (
            <>
              <TrendingUp className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">ATS Survivor Rules</p>
                <p className="text-sm opacity-80">Pick one team to COVER THE SPREAD each week. If your team fails to cover, you're eliminated. Cannot pick the same team twice.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Period Navigation */}
      {availablePeriods.length > 0 && (
        <div className="card-premium p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigatePeriod("prev")}
              disabled={availablePeriods.indexOf(currentPeriod) === 0}
              className="btn-ghost disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="text-2xl font-bold">{currentPeriod}</div>
            </div>
            <button
              onClick={() => navigatePeriod("next")}
              disabled={availablePeriods.indexOf(currentPeriod) === availablePeriods.length - 1}
              className="btn-ghost disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className={cn("grid w-full", isSurvivor ? "grid-cols-4" : "grid-cols-3")}>
          <TabsTrigger value="live" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Live Feed</span>
            <span className="sm:hidden">Live</span>
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="gap-2">
            <Table2 className="h-4 w-4" />
            <span className="hidden sm:inline">Spreadsheet</span>
            <span className="sm:hidden">Grid</span>
          </TabsTrigger>
          <TabsTrigger value="standings" className="gap-2">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Standings</span>
            <span className="sm:hidden">Rank</span>
          </TabsTrigger>
          {isSurvivor && (
            <TabsTrigger value="survivor" className="gap-2">
              <Heart className="h-4 w-4" />
              <span className="hidden sm:inline">Survivor</span>
              <span className="sm:hidden">Status</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Live Feed Tab */}
        <TabsContent value="live" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Picks revealed after games lock
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHiddenPicks(!showHiddenPicks)}
              className="gap-2"
            >
              {showHiddenPicks ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showHiddenPicks ? "Hide Unlocked" : "Show All"}
            </Button>
          </div>

          {periodGames.length === 0 ? (
            <Card className="p-8 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No games for this period</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {periodGames.map(({ event, picks }) => {
                const isLocked = new Date(event.start_at) <= new Date() || event.status !== "scheduled";
                const showPicks = isLocked || showHiddenPicks;
                const distribution = getPickDistribution({ event, picks });

                return (
                  <Card key={event.id} className={cn(
                    "overflow-hidden",
                    event.status === "live" && "ring-2 ring-red-500"
                  )}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="font-bold text-lg">{event.away_team}</p>
                            {event.away_score !== null && (
                              <p className="text-2xl font-bold tabular-nums">{event.away_score}</p>
                            )}
                          </div>
                          <span className="text-muted-foreground">@</span>
                          <div className="text-center">
                            <p className="font-bold text-lg">{event.home_team}</p>
                            {event.home_score !== null && (
                              <p className="text-2xl font-bold tabular-nums">{event.home_score}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {event.status === "live" && (
                            <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
                          )}
                          {event.status === "final" && (
                            <Badge variant="secondary">FINAL</Badge>
                          )}
                          {event.status === "scheduled" && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              {isLocked ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                              {formatGameTime(event.start_at)}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Pick Distribution Bar */}
                      {showPicks && (
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center justify-between text-sm mb-2">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">Pick Distribution</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm mb-2">
                            <span className="w-24 truncate font-medium">{distribution.away.team}</span>
                            <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden flex">
                              <div 
                                className={cn(
                                  "h-full transition-all flex items-center justify-end px-2",
                                  event.final_result === event.away_team ? "bg-emerald-500" : "bg-blue-500"
                                )}
                                style={{ width: `${distribution.away.percentage}%` }}
                              >
                                {distribution.away.percentage > 15 && (
                                  <span className="text-xs font-bold text-white">{distribution.away.count}</span>
                                )}
                              </div>
                              <div 
                                className={cn(
                                  "h-full transition-all flex items-center justify-start px-2",
                                  event.final_result === event.home_team ? "bg-emerald-500" : "bg-orange-500"
                                )}
                                style={{ width: `${distribution.home.percentage}%` }}
                              >
                                {distribution.home.percentage > 15 && (
                                  <span className="text-xs font-bold text-white">{distribution.home.count}</span>
                                )}
                              </div>
                            </div>
                            <span className="w-24 truncate text-right font-medium">{distribution.home.team}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{distribution.away.count} picked ({distribution.away.percentage}%)</span>
                            <span>{distribution.home.count} picked ({distribution.home.percentage}%)</span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {/* Away Team Picks */}
                        <div className={cn(
                          "p-3 rounded-lg",
                          event.final_result === event.away_team 
                            ? "bg-emerald-500/10 border border-emerald-500/30" 
                            : "bg-muted/50"
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{event.away_team}</span>
                            {event.final_result === event.away_team && (
                              <Badge className="bg-emerald-500">Winner</Badge>
                            )}
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {showPicks ? (
                              picks.filter(p => p.pickValue === event.away_team).map(pick => (
                                <div key={pick.userId} className={cn(
                                  "flex items-center gap-2 text-sm p-1.5 rounded",
                                  pick.isCurrentUser && "bg-primary/10 font-medium"
                                )}>
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={pick.avatar} />
                                    <AvatarFallback className="text-xs">
                                      {getInitials(pick.userName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="flex-1 truncate">
                                    {pick.userName}
                                    {pick.isCurrentUser && " (You)"}
                                  </span>
                                  {pick.confidenceRank && (
                                    <Badge variant="outline" className="text-xs">
                                      {pick.confidenceRank} pts
                                    </Badge>
                                  )}
                                  {pick.isCorrect === true && <Check className="h-4 w-4 text-emerald-500" />}
                                  {pick.isCorrect === false && <X className="h-4 w-4 text-red-500" />}
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                Picks hidden until lock
                              </div>
                            )}
                            {showPicks && picks.filter(p => p.pickValue === event.away_team).length === 0 && (
                              <p className="text-xs text-muted-foreground">No picks</p>
                            )}
                          </div>
                        </div>

                        {/* Home Team Picks */}
                        <div className={cn(
                          "p-3 rounded-lg",
                          event.final_result === event.home_team 
                            ? "bg-emerald-500/10 border border-emerald-500/30" 
                            : "bg-muted/50"
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{event.home_team}</span>
                            {event.final_result === event.home_team && (
                              <Badge className="bg-emerald-500">Winner</Badge>
                            )}
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {showPicks ? (
                              picks.filter(p => p.pickValue === event.home_team).map(pick => (
                                <div key={pick.userId} className={cn(
                                  "flex items-center gap-2 text-sm p-1.5 rounded",
                                  pick.isCurrentUser && "bg-primary/10 font-medium"
                                )}>
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={pick.avatar} />
                                    <AvatarFallback className="text-xs">
                                      {getInitials(pick.userName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="flex-1 truncate">
                                    {pick.userName}
                                    {pick.isCurrentUser && " (You)"}
                                  </span>
                                  {pick.confidenceRank && (
                                    <Badge variant="outline" className="text-xs">
                                      {pick.confidenceRank} pts
                                    </Badge>
                                  )}
                                  {pick.isCorrect === true && <Check className="h-4 w-4 text-emerald-500" />}
                                  {pick.isCorrect === false && <X className="h-4 w-4 text-red-500" />}
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                Picks hidden until lock
                              </div>
                            )}
                            {showPicks && picks.filter(p => p.pickValue === event.home_team).length === 0 && (
                              <p className="text-xs text-muted-foreground">No picks</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Spreadsheet Tab */}
        <TabsContent value="spreadsheet" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">All Picks Grid</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHiddenPicks(!showHiddenPicks)}
              className="gap-2"
            >
              {showHiddenPicks ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showHiddenPicks ? "Hide Unlocked" : "Show All"}
            </Button>
          </div>

          {periodGames.length === 0 ? (
            <Card className="p-8 text-center">
              <Table2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No games for this period</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="sticky left-0 bg-muted/50 px-4 py-3 text-left font-semibold min-w-[180px] z-10">
                        Player
                      </th>
                      <th className="px-3 py-3 text-center font-semibold min-w-[80px] bg-primary/10">
                        Points
                      </th>
                      {periodGames.map(({ event }) => (
                        <th key={event.id} className="px-2 py-3 text-center font-medium min-w-[100px]">
                          <div className="text-xs text-muted-foreground">{event.away_team}</div>
                          <div className="text-xs text-muted-foreground">@ {event.home_team}</div>
                          {event.status === "live" && (
                            <Badge variant="destructive" className="text-xs mt-1 animate-pulse">LIVE</Badge>
                          )}
                          {event.status === "final" && (
                            <Badge variant="secondary" className="text-xs mt-1">FINAL</Badge>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allMembers.map((member, idx) => (
                      <tr 
                        key={member.userId} 
                        className={cn(
                          "border-b hover:bg-muted/30 transition-colors",
                          member.isCurrentUser && "bg-primary/5",
                          idx % 2 === 0 && "bg-muted/10"
                        )}
                      >
                        <td className={cn(
                          "sticky left-0 px-4 py-3 z-10",
                          idx % 2 === 0 ? "bg-muted/10" : "bg-background",
                          member.isCurrentUser && "bg-primary/5"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-6 text-center font-mono text-xs">
                              {member.rank}
                            </span>
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="text-xs">
                                {getInitials(member.userName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className={cn(
                              "truncate max-w-[100px]",
                              member.isCurrentUser && "font-semibold text-primary"
                            )}>
                              {member.userName}
                              {member.isCurrentUser && " (You)"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center font-bold bg-primary/5">
                          {member.totalPoints}
                        </td>
                        {periodGames.map(({ event, picks }) => {
                          const memberPick = picks.find(p => p.userId === member.userId);
                          const isLocked = new Date(event.start_at) <= new Date() || event.status !== "scheduled";
                          const showPick = isLocked || showHiddenPicks;
                          
                          return (
                            <td key={event.id} className="px-2 py-3 text-center">
                              {showPick && memberPick?.pickValue ? (
                                <div className={cn(
                                  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                                  memberPick.isCorrect === true && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                                  memberPick.isCorrect === false && "bg-red-500/20 text-red-700 dark:text-red-400",
                                  memberPick.isCorrect === null && "bg-muted"
                                )}>
                                  <span className="truncate max-w-[60px]">{memberPick.pickValue}</span>
                                  {memberPick.confidenceRank && (
                                    <span className="text-xs opacity-70">({memberPick.confidenceRank})</span>
                                  )}
                                  {memberPick.isCorrect === true && <Check className="h-3 w-3 shrink-0" />}
                                  {memberPick.isCorrect === false && <X className="h-3 w-3 shrink-0" />}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  {showPick ? "—" : <Lock className="h-3 w-3 inline" />}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Pick Distribution Summary */}
          {periodGames.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  Pick Distribution Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {periodGames.map(({ event, picks }) => {
                    const isLocked = new Date(event.start_at) <= new Date() || event.status !== "scheduled";
                    const showPick = isLocked || showHiddenPicks;
                    const distribution = getPickDistribution({ event, picks });
                    
                    return (
                      <div key={event.id} className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {event.away_team} @ {event.home_team}
                          </span>
                          {event.status === "final" && event.final_result && (
                            <Badge className="bg-emerald-500 text-xs">
                              {event.final_result} wins
                            </Badge>
                          )}
                        </div>
                        {showPick ? (
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className={cn(
                                event.final_result === event.away_team && "text-emerald-600 font-semibold"
                              )}>
                                {distribution.away.team}
                              </span>
                              <span className="font-mono">
                                {distribution.away.count} ({distribution.away.percentage}%)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className={cn(
                                event.final_result === event.home_team && "text-emerald-600 font-semibold"
                              )}>
                                {distribution.home.team}
                              </span>
                              <span className="font-mono">
                                {distribution.home.count} ({distribution.home.percentage}%)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Lock className="h-3 w-3" />
                            Distribution hidden until lock
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Standings Tab */}
        <TabsContent value="standings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Current Standings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {standings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No standings yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {standings.map((standing) => {
                    const rankChange = standing.previousRank - standing.rank;
                    
                    return (
                      <div
                        key={standing.userId}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-lg transition-colors",
                          standing.rank <= 3 && "bg-muted/50",
                          standing.isCurrentUser && "ring-2 ring-primary/50 bg-primary/5"
                        )}
                      >
                        <div className="w-10 flex items-center justify-center">
                          {standing.rank === 1 ? (
                            <Crown className="h-5 w-5 text-yellow-500" />
                          ) : (
                            <span className="text-lg font-semibold text-muted-foreground">
                              {standing.rank}
                            </span>
                          )}
                        </div>

                        <div className="w-8 flex items-center justify-center">
                          {rankChange > 0 && (
                            <div className="flex items-center text-emerald-500 text-sm">
                              <TrendingUp className="h-4 w-4" />
                            </div>
                          )}
                          {rankChange < 0 && (
                            <div className="flex items-center text-red-500 text-sm">
                              <TrendingDown className="h-4 w-4" />
                            </div>
                          )}
                          {rankChange === 0 && (
                            <Minus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={standing.avatar} />
                            <AvatarFallback>
                              {getInitials(standing.userName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {standing.userName}
                              {standing.isCurrentUser && (
                                <span className="text-primary ml-1 font-semibold">(You)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {standing.winPercentage}% win rate
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-bold">{standing.totalPoints}</p>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Survivor Status Tab */}
        {isSurvivor && (
          <TabsContent value="survivor" className="space-y-4 mt-4">
            {/* Field Collapse Visualization */}
            <SurvivorFieldCollapse leagueId={Number(id)} isDemoMode={true} />
            
            {/* Elimination Timeline */}
            <EliminationTimeline leagueId={Number(id)} isDemoMode={true} />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-600">
                  <Heart className="h-5 w-5" />
                  Still Alive ({survivorStats.alive})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {survivorMembers.filter(m => m.isAlive).map(member => (
                    <div
                      key={member.userId}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20",
                        member.isCurrentUser && "ring-2 ring-primary/50"
                      )}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>{getInitials(member.userName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {member.userName}
                          {member.isCurrentUser && <span className="text-primary ml-1">(You)</span>}
                        </p>
                        {member.currentPick && (
                          <p className="text-sm text-muted-foreground">
                            Current pick: <span className="font-medium">{member.currentPick}</span>
                          </p>
                        )}
                      </div>
                      <Badge className="bg-emerald-500">Alive</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <Skull className="h-5 w-5" />
                  Eliminated ({survivorStats.eliminated})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {survivorStats.eliminated === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No one eliminated yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {survivorMembers.filter(m => !m.isAlive).map(member => (
                      <div
                        key={member.userId}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20 opacity-75",
                          member.isCurrentUser && "ring-2 ring-primary/50 opacity-100"
                        )}
                      >
                        <Avatar className="h-10 w-10 grayscale">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{getInitials(member.userName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {member.userName}
                            {member.isCurrentUser && <span className="text-primary ml-1">(You)</span>}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Eliminated: {member.eliminatedWeek}
                          </p>
                        </div>
                        <Badge variant="destructive">Out</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
