import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/react-app/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Progress } from "@/react-app/components/ui/progress";
import { 
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, Line
} from "recharts";
import { 
  TrendingUp, TrendingDown, Target, Trophy, Flame, Snowflake,
  BarChart3, PieChartIcon, Activity, Award, Users,
  Loader2, ChevronRight, Zap, Star, Clock, CheckCircle, XCircle
} from "lucide-react";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";

interface AnalyticsData {
  overview: {
    totalPicks: number;
    correctPicks: number;
    winPercentage: number;
    totalPoints: number;
    avgPointsPerWeek: number;
    bestWeek: { period: string; points: number; league: string } | null;
    worstWeek: { period: string; points: number; league: string } | null;
    currentStreak: number;
    streakType: "win" | "loss" | "none";
    longestWinStreak: number;
    longestLossStreak: number;
  };
  leagueStats: Array<{
    id: number;
    name: string;
    sportKey: string;
    formatKey: string;
    rank: number;
    totalMembers: number;
    points: number;
    winPercentage: number;
    picksMade: number;
  }>;
  weeklyPerformance: Array<{
    period: string;
    points: number;
    correct: number;
    total: number;
    winPct: number;
  }>;
  sportBreakdown: Array<{
    sport: string;
    picks: number;
    correct: number;
    winPct: number;
  }>;
  formatBreakdown: Array<{
    format: string;
    picks: number;
    correct: number;
    winPct: number;
    avgPoints: number;
  }>;
  recentPicks: Array<{
    id: number;
    leagueName: string;
    period: string;
    pickValue: string;
    result: "win" | "loss" | "pending";
    points: number;
    date: string;
  }>;
  confidenceAnalysis?: {
    distribution: Array<{ rank: number; correct: number; total: number }>;
    avgRankWhenCorrect: number;
    avgRankWhenWrong: number;
  };
  teamAnalysis: Array<{
    team: string;
    picks: number;
    wins: number;
    winPct: number;
  }>;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(217, 91%, 60%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 87%, 65%)",
  "hsl(350, 89%, 60%)",
];

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  trend,
  className 
}: { 
  icon: typeof Trophy; 
  label: string; 
  value: string | number; 
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {subValue && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                {trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                {trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                {subValue}
              </p>
            )}
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeague, setSelectedLeague] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("season");

  useEffect(() => {
    fetchAnalytics();
  }, [selectedLeague, timeRange]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLeague !== "all") params.set("league", selectedLeague);
      if (timeRange !== "season") params.set("range", timeRange);
      
      const response = await fetch(`/api/analytics?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        // Generate demo data if API not ready
        setData(generateDemoData());
      }
    } catch {
      setData(generateDemoData());
    } finally {
      setIsLoading(false);
    }
  };

  const generateDemoData = (): AnalyticsData => {
    const periods = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8"];
    
    return {
      overview: {
        totalPicks: 87,
        correctPicks: 52,
        winPercentage: 59.8,
        totalPoints: 156,
        avgPointsPerWeek: 19.5,
        bestWeek: { period: "Week 3", points: 28, league: "NFL Pick'em 2024" },
        worstWeek: { period: "Week 6", points: 11, league: "NFL Pick'em 2024" },
        currentStreak: 4,
        streakType: "win",
        longestWinStreak: 7,
        longestLossStreak: 3,
      },
      leagueStats: [
        { id: 1, name: "NFL Pick'em 2024", sportKey: "nfl", formatKey: "pickem", rank: 3, totalMembers: 12, points: 98, winPercentage: 62.5, picksMade: 48 },
        { id: 2, name: "Survivor Pool", sportKey: "nfl", formatKey: "survivor", rank: 1, totalMembers: 24, points: 8, winPercentage: 100, picksMade: 8 },
        { id: 3, name: "NBA Confidence", sportKey: "nba", formatKey: "confidence", rank: 5, totalMembers: 8, points: 50, winPercentage: 55.0, picksMade: 31 },
      ],
      weeklyPerformance: periods.map((period) => ({
        period,
        points: 15 + Math.floor(Math.random() * 15),
        correct: 8 + Math.floor(Math.random() * 5),
        total: 14,
        winPct: 55 + Math.floor(Math.random() * 20),
      })),
      sportBreakdown: [
        { sport: "NFL", picks: 56, correct: 35, winPct: 62.5 },
        { sport: "NBA", picks: 31, correct: 17, winPct: 54.8 },
      ],
      formatBreakdown: [
        { format: "Pick'em", picks: 48, correct: 30, winPct: 62.5, avgPoints: 12.3 },
        { format: "Confidence", picks: 31, correct: 17, winPct: 54.8, avgPoints: 45.2 },
        { format: "Survivor", picks: 8, correct: 8, winPct: 100, avgPoints: 1 },
      ],
      recentPicks: [
        { id: 1, leagueName: "NFL Pick'em", period: "Week 8", pickValue: "Kansas City Chiefs", result: "win", points: 1, date: "2024-10-27" },
        { id: 2, leagueName: "NFL Pick'em", period: "Week 8", pickValue: "Buffalo Bills", result: "win", points: 1, date: "2024-10-27" },
        { id: 3, leagueName: "NFL Pick'em", period: "Week 8", pickValue: "Detroit Lions", result: "loss", points: 0, date: "2024-10-27" },
        { id: 4, leagueName: "Survivor Pool", period: "Week 8", pickValue: "Baltimore Ravens", result: "pending", points: 0, date: "2024-10-27" },
        { id: 5, leagueName: "NBA Confidence", period: "Day 42", pickValue: "Boston Celtics", result: "win", points: 8, date: "2024-10-26" },
      ],
      confidenceAnalysis: {
        distribution: Array.from({ length: 10 }, (_, i) => ({
          rank: i + 1,
          correct: Math.floor(Math.random() * 6) + 2,
          total: 8,
        })),
        avgRankWhenCorrect: 6.2,
        avgRankWhenWrong: 4.8,
      },
      teamAnalysis: [
        { team: "Kansas City Chiefs", picks: 6, wins: 5, winPct: 83.3 },
        { team: "Buffalo Bills", picks: 5, wins: 4, winPct: 80.0 },
        { team: "Detroit Lions", picks: 4, wins: 3, winPct: 75.0 },
        { team: "San Francisco 49ers", picks: 4, wins: 2, winPct: 50.0 },
        { team: "Philadelphia Eagles", picks: 3, wins: 2, winPct: 66.7 },
      ],
    };
  };

  const getSportIcon = (sportKey: string) => {
    const sport = SPORTS.find(s => s.key === sportKey);
    return sport?.icon;
  };

  const getFormatName = (formatKey: string) => {
    return POOL_FORMATS.find(f => f.key === formatKey)?.name || formatKey;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No analytics data available</h3>
        <p className="text-muted-foreground mb-4">Make some picks to see your stats!</p>
        <Link to="/">
          <Button>Go to Dashboard</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your performance across all pools
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="season">Full Season</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedLeague} onValueChange={setSelectedLeague}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Leagues" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leagues</SelectItem>
              {data.leagueStats.map(league => (
                <SelectItem key={league.id} value={league.id.toString()}>
                  {league.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Target} 
          label="Win Rate" 
          value={`${data.overview.winPercentage}%`}
          subValue={`${data.overview.correctPicks}/${data.overview.totalPicks} correct`}
          trend={data.overview.winPercentage >= 55 ? "up" : "down"}
        />
        <StatCard 
          icon={Trophy} 
          label="Total Points" 
          value={data.overview.totalPoints}
          subValue={`${data.overview.avgPointsPerWeek} avg/week`}
        />
        <StatCard 
          icon={data.overview.streakType === "win" ? Flame : Snowflake} 
          label="Current Streak" 
          value={data.overview.currentStreak}
          subValue={data.overview.streakType === "win" ? "Win streak" : data.overview.streakType === "loss" ? "Loss streak" : "No streak"}
          trend={data.overview.streakType === "win" ? "up" : data.overview.streakType === "loss" ? "down" : "neutral"}
        />
        <StatCard 
          icon={Award} 
          label="Best Week" 
          value={data.overview.bestWeek?.points || 0}
          subValue={data.overview.bestWeek?.period || "N/A"}
        />
      </div>

      {/* Tabs for different analytics views */}
      <Tabs defaultValue="performance" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="performance" className="gap-2">
            <Activity className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="leagues" className="gap-2">
            <Users className="h-4 w-4" />
            Leagues
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="gap-2">
            <PieChartIcon className="h-4 w-4" />
            Breakdown
          </TabsTrigger>
          <TabsTrigger value="picks" className="gap-2">
            <Clock className="h-4 w-4" />
            Pick History
          </TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          {/* Weekly Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Weekly Performance Trend
              </CardTitle>
              <CardDescription>Points and win percentage over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.weeklyPerformance}>
                    <defs>
                      <linearGradient id="pointsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="points" 
                      stroke="hsl(var(--primary))" 
                      fill="url(#pointsGradient)"
                      name="Points"
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="winPct" 
                      stroke="hsl(142, 76%, 36%)" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(142, 76%, 36%)' }}
                      name="Win %"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Streak Records */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Longest Win Streak
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold">{data.overview.longestWinStreak}</p>
                    <p className="text-sm text-muted-foreground">consecutive wins</p>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(data.overview.longestWinStreak, 7) }).map((_, idx) => (
                      <div key={idx} className="h-8 w-2 rounded-full bg-green-500" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-blue-500" />
                  Longest Loss Streak
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold">{data.overview.longestLossStreak}</p>
                    <p className="text-sm text-muted-foreground">consecutive losses</p>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(data.overview.longestLossStreak, 7) }).map((_, idx) => (
                      <div key={idx} className="h-8 w-2 rounded-full bg-red-500" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Confidence Analysis (if applicable) */}
          {data.confidenceAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Confidence Point Analysis
                </CardTitle>
                <CardDescription>How well you allocate confidence points</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.confidenceAnalysis.distribution}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="rank" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="correct" fill="hsl(142, 76%, 36%)" name="Correct" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="total" fill="hsl(var(--muted))" name="Total" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                      <p className="text-sm text-muted-foreground">Avg rank when correct</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {data.confidenceAnalysis.avgRankWhenCorrect.toFixed(1)}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-sm text-muted-foreground">Avg rank when wrong</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {data.confidenceAnalysis.avgRankWhenWrong.toFixed(1)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {data.confidenceAnalysis.avgRankWhenCorrect > data.confidenceAnalysis.avgRankWhenWrong
                        ? "✓ Good job! You're correctly placing higher confidence on your best picks."
                        : "⚠️ Consider being more conservative with high confidence points."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Leagues Tab */}
        <TabsContent value="leagues" className="space-y-6">
          <div className="grid gap-4">
            {data.leagueStats.map(league => {
              const SportIcon = getSportIcon(league.sportKey);
              const percentile = Math.round((1 - (league.rank / league.totalMembers)) * 100);
              
              return (
                <Card key={league.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          {SportIcon && <SportIcon className="h-6 w-6 text-primary" />}
                        </div>
                        <div>
                          <h3 className="font-semibold">{league.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary">{getFormatName(league.formatKey)}</Badge>
                            <span className="text-sm text-muted-foreground">
                              #{league.rank} of {league.totalMembers}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center hidden sm:block">
                          <p className="text-sm text-muted-foreground">Win Rate</p>
                          <p className="font-semibold">{league.winPercentage}%</p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-sm text-muted-foreground">Picks</p>
                          <p className="font-semibold">{league.picksMade}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Points</p>
                          <p className="text-2xl font-bold">{league.points}</p>
                        </div>
                        <Link to={`/leagues/${league.id}/standings`}>
                          <Button variant="ghost" size="icon">
                            <ChevronRight className="h-5 w-5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Rank percentile</span>
                        <span className={cn(
                          "font-medium",
                          percentile >= 75 && "text-green-600 dark:text-green-400",
                          percentile >= 50 && percentile < 75 && "text-yellow-600 dark:text-yellow-400",
                          percentile < 50 && "text-red-600 dark:text-red-400"
                        )}>
                          Top {100 - percentile}%
                        </span>
                      </div>
                      <Progress value={percentile} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Sport Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance by Sport</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.sportBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="picks"
                        nameKey="sport"
                        label={false}
                      >
                        {data.sportBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                  {data.sportBreakdown.map((sport, i) => (
                    <div key={sport.sport} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm">{sport.sport}</span>
                      </div>
                      <span className="text-sm font-medium">{sport.correct}/{sport.picks} ({sport.winPct}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Format Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance by Format</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.formatBreakdown.map((format) => (
                    <div key={format.format} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{format.format}</span>
                        <Badge variant={format.winPct >= 60 ? "default" : "secondary"}>
                          {format.winPct}% win rate
                        </Badge>
                      </div>
                      <Progress value={format.winPct} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{format.correct}/{format.picks} picks</span>
                        <span>{format.avgPoints.toFixed(1)} avg pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Most Picked Teams */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Your Most Picked Teams
              </CardTitle>
              <CardDescription>Teams you pick most often and their success rate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.teamAnalysis.map(team => (
                  <div 
                    key={team.team}
                    className={cn(
                      "p-3 rounded-lg border",
                      team.winPct >= 75 && "bg-green-500/5 border-green-500/20",
                      team.winPct >= 50 && team.winPct < 75 && "bg-muted/50",
                      team.winPct < 50 && "bg-red-500/5 border-red-500/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{team.team}</span>
                      <Badge variant={team.winPct >= 60 ? "default" : "secondary"}>
                        {team.winPct.toFixed(0)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {team.wins} wins / {team.picks} picks
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pick History Tab */}
        <TabsContent value="picks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Picks
              </CardTitle>
              <CardDescription>Your latest pick results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recentPicks.map(pick => (
                  <div 
                    key={pick.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      pick.result === "win" && "bg-green-500/5",
                      pick.result === "loss" && "bg-red-500/5",
                      pick.result === "pending" && "bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center",
                        pick.result === "win" && "bg-green-500/20",
                        pick.result === "loss" && "bg-red-500/20",
                        pick.result === "pending" && "bg-muted"
                      )}>
                        {pick.result === "win" && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {pick.result === "loss" && <XCircle className="h-4 w-4 text-red-500" />}
                        {pick.result === "pending" && <Clock className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="font-medium">{pick.pickValue}</p>
                        <p className="text-sm text-muted-foreground">
                          {pick.leagueName} • {pick.period}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-semibold",
                        pick.result === "win" && "text-green-600 dark:text-green-400",
                        pick.result === "loss" && "text-red-600 dark:text-red-400"
                      )}>
                        {pick.result === "pending" ? "Pending" : `+${pick.points}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{pick.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
