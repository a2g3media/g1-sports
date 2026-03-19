import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/react-app/components/ui/avatar";

import { 
  Trophy, Medal, TrendingUp, TrendingDown, Minus, Target, 
  Loader2, ArrowLeft, Crown, Flame, Snowflake, BarChart3
} from "lucide-react";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";

import { cn } from "@/react-app/lib/utils";

interface Standing {
  user_id: number;
  entry_id?: number | null;
  entry_name?: string | null;
  entry_number?: number | null;
  display_name: string;
  email: string;
  avatar_url: string | null;
  rank: number;
  previous_rank: number | null;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  win_percentage: number;
  current_streak: number;
  streak_type: "win" | "loss" | "none";
  best_week: string | null;
  best_week_points: number;
  is_eliminated?: boolean;
  is_current_user?: boolean;
}

function getStandingKey(standing: Standing): string {
  return `${standing.user_id}:${standing.entry_id ?? "primary"}`;
}

interface PeriodResult {
  period_id: string;
  standings: Standing[];
}

interface LeagueInfo {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
}

export function LeagueStandings() {
  const { id } = useParams<{ id: string }>();
  const { isDemoMode } = useDemoAuth();
  const headers: HeadersInit = isDemoMode ? { "X-Demo-Mode": "true" } : {};
  
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [periodResults, setPeriodResults] = useState<PeriodResult[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("overall");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchStandings();
    }
  }, [id]);

  const fetchStandings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leagues/${id}/standings`, { headers });
      if (response.ok) {
        const data = await response.json();
        setLeague(data.league);
        setStandings(data.standings);
        setPeriodResults(data.periodResults || []);
      }
    } catch (error) {
      console.error("Failed to fetch standings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSportIcon = (sportKey: string) => {
    const Icon = SPORTS.find(s => s.key === sportKey)?.icon;
    return Icon ? <Icon className="h-10 w-10" /> : <span className="text-4xl">🏆</span>;
  };

  const getFormatName = (formatKey: string) => {
    return POOL_FORMATS.find(f => f.key === formatKey)?.name || formatKey;
  };

  const getRankChange = (current: number, previous: number | null) => {
    if (previous === null) return null;
    return previous - current;
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return null;
  };

  const getInitials = (name: string, email: string) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const currentStandings = selectedPeriod === "overall" 
    ? standings 
    : periodResults.find(p => p.period_id === selectedPeriod)?.standings || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!league) {
    return (
      <Card className="p-8 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">League not found</h3>
        <Link to="/">
          <Button>Back to Dashboard</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {getSportIcon(league.sport_key)}
            {league.name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{getFormatName(league.format_key)}</Badge>
            <Badge variant="outline">{league.season}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/leagues/${id}/history`}>
            <Button variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              History
            </Button>
          </Link>
          <Link to={`/leagues/${id}/picks`}>
            <Button variant="outline">
              <Target className="h-4 w-4 mr-2" />
              Make Picks
            </Button>
          </Link>
        </div>
      </div>

      {/* Period Tabs */}
      <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overall" className="gap-2">
            <Trophy className="h-4 w-4" />
            Overall
          </TabsTrigger>
          {periodResults.map(period => (
            <TabsTrigger key={period.period_id} value={period.period_id}>
              {period.period_id}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Top 3 Podium */}
      {currentStandings.length >= 3 && (
        <div className="grid grid-cols-3 gap-4">
          {[1, 0, 2].map((idx) => {
            const standing = currentStandings[idx];
            if (!standing) return null;
            const isFirst = standing.rank === 1;
            const isCurrentUser = standing.is_current_user;
            
            return (
              <Card 
                key={getStandingKey(standing)}
                className={cn(
                  "relative overflow-hidden transition-all",
                  isFirst && "ring-2 ring-yellow-500/50 bg-gradient-to-br from-yellow-500/5 to-amber-500/10",
                  isCurrentUser && !isFirst && "ring-2 ring-primary/50 bg-gradient-to-br from-primary/5 to-primary/10"
                )}
              >
                <CardContent className="pt-6 text-center">
                  <div className={cn(
                    "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg",
                    standing.rank === 1 && "bg-yellow-500 text-yellow-950",
                    standing.rank === 2 && "bg-gray-300 text-gray-700",
                    standing.rank === 3 && "bg-amber-600 text-amber-50"
                  )}>
                    {standing.rank}
                  </div>
                  
                  <Avatar className={cn("mx-auto mb-3", isFirst ? "h-20 w-20" : "h-16 w-16")}>
                    <AvatarImage src={standing.avatar_url || undefined} />
                    <AvatarFallback className="text-lg">
                      {getInitials(standing.display_name, standing.email)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <h3 className={cn("font-semibold truncate", isFirst && "text-lg")}>
                    {standing.display_name || standing.email.split("@")[0]}
                    {isCurrentUser && <span className="text-primary ml-1">(You)</span>}
                  </h3>
                  {standing.entry_name && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{standing.entry_name}</p>
                  )}
                  
                  <div className={cn("font-bold mt-2", isFirst ? "text-3xl" : "text-2xl")}>
                    {standing.total_points}
                    <span className="text-sm font-normal text-muted-foreground ml-1">pts</span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {standing.correct_picks}/{standing.total_picks} correct ({standing.win_percentage}%)
                  </p>
                  
                  {standing.current_streak > 0 && (
                    <Badge 
                      variant={standing.streak_type === "win" ? "default" : "destructive"}
                      className="mt-2 gap-1"
                    >
                      {standing.streak_type === "win" ? (
                        <Flame className="h-3 w-3" />
                      ) : (
                        <Snowflake className="h-3 w-3" />
                      )}
                      {standing.current_streak} streak
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Full Standings Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {selectedPeriod === "overall" ? "Season Standings" : `${selectedPeriod} Results`}
          </CardTitle>
          <CardDescription>
            {currentStandings.length} participant{currentStandings.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStandings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No standings yet. Make picks to see results!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentStandings.map((standing, idx) => {
                const rankChange = getRankChange(standing.rank, standing.previous_rank);
                const isSurvivor = league.format_key === "survivor";
                const isCurrentUser = standing.is_current_user;
                
                return (
                  <div 
                    key={getStandingKey(standing)}
                    className={cn(
                      "flex items-center gap-4 p-3 rounded-lg transition-colors hover:bg-muted/50",
                      standing.is_eliminated && "opacity-50",
                      idx < 3 && "bg-muted/30",
                      isCurrentUser && "ring-2 ring-primary/50 bg-primary/5"
                    )}
                  >
                    {/* Rank */}
                    <div className="w-12 flex items-center justify-center">
                      {getRankIcon(standing.rank) || (
                        <span className="text-lg font-semibold text-muted-foreground">
                          {standing.rank}
                        </span>
                      )}
                    </div>

                    {/* Rank Change */}
                    <div className="w-8 flex items-center justify-center">
                      {rankChange !== null && (
                        <>
                          {rankChange > 0 && (
                            <div className="flex items-center text-green-500 text-sm">
                              <TrendingUp className="h-4 w-4" />
                              <span>{rankChange}</span>
                            </div>
                          )}
                          {rankChange < 0 && (
                            <div className="flex items-center text-red-500 text-sm">
                              <TrendingDown className="h-4 w-4" />
                              <span>{Math.abs(rankChange)}</span>
                            </div>
                          )}
                          {rankChange === 0 && (
                            <Minus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </>
                      )}
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={standing.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(standing.display_name, standing.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {standing.display_name || standing.email.split("@")[0]}
                          {isCurrentUser && <span className="text-primary ml-1 font-semibold">(You)</span>}
                        </p>
                        {standing.entry_name && (
                          <p className="text-xs text-muted-foreground truncate">{standing.entry_name}</p>
                        )}
                        {isSurvivor && standing.is_eliminated && (
                          <Badge variant="destructive" className="text-xs">Eliminated</Badge>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Record</p>
                        <p className="font-medium">
                          {standing.correct_picks}-{standing.total_picks - standing.correct_picks}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Win %</p>
                        <p className="font-medium">{standing.win_percentage}%</p>
                      </div>
                      {standing.current_streak > 0 && (
                        <Badge 
                          variant={standing.streak_type === "win" ? "default" : "secondary"}
                          className="gap-1"
                        >
                          {standing.streak_type === "win" ? <Flame className="h-3 w-3" /> : <Snowflake className="h-3 w-3" />}
                          {standing.current_streak}
                        </Badge>
                      )}
                    </div>

                    {/* Points */}
                    <div className="text-right">
                      <p className="text-2xl font-bold">{standing.total_points}</p>
                      <p className="text-xs text-muted-foreground">points</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scoring Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring System</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            {league.format_key === "pickem" && (
              <>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Correct Pick</p>
                  <p className="text-muted-foreground">+1 point per correct winner</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Tiebreaker</p>
                  <p className="text-muted-foreground">Total points in final game</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Season Winner</p>
                  <p className="text-muted-foreground">Most points at season end</p>
                </div>
              </>
            )}
            {league.format_key === "confidence" && (
              <>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Confidence Points</p>
                  <p className="text-muted-foreground">Earn your confidence value if correct</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Point Range</p>
                  <p className="text-muted-foreground">1 to N (N = number of games)</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Strategy</p>
                  <p className="text-muted-foreground">Assign highest values to surest picks</p>
                </div>
              </>
            )}
            {league.format_key === "survivor" && (
              <>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">One Pick Per Week</p>
                  <p className="text-muted-foreground">Choose one team to win</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">Elimination</p>
                  <p className="text-muted-foreground">One loss and you're out</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">No Repeats</p>
                  <p className="text-muted-foreground">Can't pick same team twice</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
