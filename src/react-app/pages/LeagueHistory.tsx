import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/react-app/components/ui/avatar";
import { 
  ArrowLeft, Loader2, TrendingUp, TrendingDown, Trophy, 
  Target, Users, BarChart3, LineChart as LineChartIcon
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar
} from "recharts";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";

interface UserHistory {
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  data: { period: string; rank: number; points: number }[];
}

interface PeriodStanding {
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  rank: number;
  total_points: number;
  correct_picks: number;
  total_picks: number;
  win_percentage: number;
  is_current_user: boolean;
}

interface Period {
  period_id: string;
  standings: PeriodStanding[];
}

interface LeagueInfo {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
}

// Color palette for chart lines
const chartColors = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
  "#ef4444", // red
  "#6366f1", // indigo
  "#84cc16", // lime
];

export function LeagueHistory() {
  const { id } = useParams<{ id: string }>();
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [users, setUsers] = useState<UserHistory[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartType, setChartType] = useState<"rank" | "points" | "winpct">("rank");
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (id) {
      fetchHistory();
    }
  }, [id]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leagues/${id}/standings/history`);
      if (response.ok) {
        const data = await response.json();
        setLeague(data.league);
        setPeriods(data.periods);
        setUsers(data.users);
        setCurrentUserId(data.current_user_id);
        
        // Select top 5 users by default, plus current user
        const topUsers = new Set<number>();
        if (data.periods.length > 0) {
          const lastPeriod = data.periods[data.periods.length - 1];
          lastPeriod.standings.slice(0, 5).forEach((s: PeriodStanding) => topUsers.add(s.user_id));
        }
        if (data.current_user_id) {
          topUsers.add(data.current_user_id);
        }
        setSelectedUsers(topUsers);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSportIcon = (sportKey: string) => {
    const sport = SPORTS.find(s => s.key === sportKey);
    const Icon = sport?.icon;
    return Icon ? <Icon className="h-6 w-6" /> : <span className="text-2xl">🏆</span>;
  };

  const getFormatName = (formatKey: string) => {
    return POOL_FORMATS.find(f => f.key === formatKey)?.name || formatKey;
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const toggleUser = (userId: number) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  // Build chart data based on selected users
  const buildChartData = () => {
    if (periods.length === 0) return [];
    
    const allPeriodIds = periods.map(p => p.period_id);
    
    return allPeriodIds.map(periodId => {
      const period = periods.find(p => p.period_id === periodId);
      const dataPoint: Record<string, any> = { period: periodId };
      
      for (const user of users) {
        if (!selectedUsers.has(user.user_id)) continue;
        const periodData = user.data.find(d => d.period === periodId);
        if (periodData) {
          dataPoint[`rank_${user.user_id}`] = periodData.rank;
          dataPoint[`points_${user.user_id}`] = periodData.points;
          
          // Calculate win percentage from period standings
          const standing = period?.standings.find(s => s.user_id === user.user_id);
          dataPoint[`winpct_${user.user_id}`] = standing?.win_percentage || 0;
        }
      }
      
      return dataPoint;
    });
  };

  const chartData = buildChartData();

  // Get user color
  const getUserColor = (userId: number) => {
    const index = users.findIndex(u => u.user_id === userId);
    return chartColors[index % chartColors.length];
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    
    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1">
          {payload
            .sort((a: { color: string; name: string; value: number }, b: { color: string; name: string; value: number }) => {
              if (chartType === "rank") return a.value - b.value;
              return b.value - a.value;
            })
            .map((entry: { color: string; name: string; value: number; dataKey?: string }, index: number) => {
              const userId = parseInt((entry.dataKey || "").split("_")[1]);
              const user = users.find(u => u.user_id === userId);
              return (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className={cn(
                    "truncate max-w-[120px]",
                    userId === currentUserId && "font-semibold text-primary"
                  )}>
                    {user?.user_name}
                  </span>
                  <span className="font-medium ml-auto">
                    {chartType === "rank" && `#${entry.value}`}
                    {chartType === "points" && `${entry.value} pts`}
                    {chartType === "winpct" && `${entry.value}%`}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  // Calculate rank change for current period
  const getRankChange = (userId: number) => {
    const user = users.find(u => u.user_id === userId);
    if (!user || user.data.length < 2) return null;
    
    const current = user.data[user.data.length - 1].rank;
    const previous = user.data[user.data.length - 2].rank;
    return previous - current;
  };

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
        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link to={`/leagues/${id}/standings`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Standings
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {getSportIcon(league.sport_key)}
            {league.name} History
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{getFormatName(league.format_key)}</Badge>
            <Badge variant="outline">{periods.length} periods tracked</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/leagues/${id}/standings`}>
            <Button variant="outline">
              <Trophy className="h-4 w-4 mr-2" />
              Current Standings
            </Button>
          </Link>
        </div>
      </div>

      {periods.length === 0 ? (
        <Card className="p-12 text-center">
          <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold mb-2">No History Yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Standings history will appear here after periods are scored and snapshots are saved. 
            Check back after the first week of results!
          </p>
        </Card>
      ) : (
        <>
          {/* Chart Type Selector */}
          <Tabs value={chartType} onValueChange={(v) => setChartType(v as typeof chartType)}>
            <TabsList>
              <TabsTrigger value="rank" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Rank Progression
              </TabsTrigger>
              <TabsTrigger value="points" className="gap-2">
                <Target className="h-4 w-4" />
                Points Over Time
              </TabsTrigger>
              <TabsTrigger value="winpct" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Win Percentage
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Main Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5" />
                {chartType === "rank" && "Rank Progression"}
                {chartType === "points" && "Points Accumulation"}
                {chartType === "winpct" && "Win Percentage Trend"}
              </CardTitle>
              <CardDescription>
                {chartType === "rank" && "Lower is better - track how rankings change over time"}
                {chartType === "points" && "Total points earned through each period"}
                {chartType === "winpct" && "Cumulative win percentage over the season"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "rank" ? (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis 
                        dataKey="period" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        reversed 
                        domain={[1, "dataMax"]}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        label={{ value: "Rank", angle: -90, position: "insideLeft", className: "fill-muted-foreground" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        formatter={(value) => {
                          const userId = parseInt(value.split("_")[1]);
                          const user = users.find(u => u.user_id === userId);
                          return user?.user_name || value;
                        }}
                      />
                      {users.filter(u => selectedUsers.has(u.user_id)).map(user => (
                        <Line
                          key={user.user_id}
                          type="monotone"
                          dataKey={`rank_${user.user_id}`}
                          name={`rank_${user.user_id}`}
                          stroke={getUserColor(user.user_id)}
                          strokeWidth={user.user_id === currentUserId ? 3 : 2}
                          dot={{ r: user.user_id === currentUserId ? 5 : 3 }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  ) : chartType === "points" ? (
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis 
                        dataKey="period" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        label={{ value: "Points", angle: -90, position: "insideLeft", className: "fill-muted-foreground" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        formatter={(value) => {
                          const userId = parseInt(value.split("_")[1]);
                          const user = users.find(u => u.user_id === userId);
                          return user?.user_name || value;
                        }}
                      />
                      {users.filter(u => selectedUsers.has(u.user_id)).map(user => (
                        <Area
                          key={user.user_id}
                          type="monotone"
                          dataKey={`points_${user.user_id}`}
                          name={`points_${user.user_id}`}
                          stroke={getUserColor(user.user_id)}
                          fill={getUserColor(user.user_id)}
                          fillOpacity={0.1}
                          strokeWidth={user.user_id === currentUserId ? 3 : 2}
                        />
                      ))}
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis 
                        dataKey="period" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        domain={[0, 100]}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        label={{ value: "Win %", angle: -90, position: "insideLeft", className: "fill-muted-foreground" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        formatter={(value) => {
                          const userId = parseInt(value.split("_")[1]);
                          const user = users.find(u => u.user_id === userId);
                          return user?.user_name || value;
                        }}
                      />
                      {users.filter(u => selectedUsers.has(u.user_id)).map(user => (
                        <Bar
                          key={user.user_id}
                          dataKey={`winpct_${user.user_id}`}
                          name={`winpct_${user.user_id}`}
                          fill={getUserColor(user.user_id)}
                          fillOpacity={user.user_id === currentUserId ? 1 : 0.7}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* User Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Select Players to Display
              </CardTitle>
              <CardDescription>
                Click to toggle players on the chart. Your position is highlighted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {users.map(user => {
                  const isSelected = selectedUsers.has(user.user_id);
                  const isCurrentUser = user.user_id === currentUserId;
                  const rankChange = getRankChange(user.user_id);
                  const lastData = user.data[user.data.length - 1];
                  
                  return (
                    <button
                      key={user.user_id}
                      onClick={() => toggleUser(user.user_id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border bg-background hover:bg-muted/50",
                        isCurrentUser && "ring-2 ring-primary/50"
                      )}
                    >
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: isSelected ? getUserColor(user.user_id) : "#888" }}
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(user.user_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className={cn(
                        "text-sm font-medium",
                        isCurrentUser && "text-primary"
                      )}>
                        {user.user_name}
                        {isCurrentUser && " (You)"}
                      </span>
                      {lastData && (
                        <Badge variant="outline" className="text-xs">
                          #{lastData.rank}
                        </Badge>
                      )}
                      {rankChange !== null && rankChange !== 0 && (
                        <span className={cn(
                          "text-xs flex items-center",
                          rankChange > 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {rankChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(rankChange)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Period-by-Period Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Period-by-Period Results</CardTitle>
              <CardDescription>
                Detailed standings snapshot for each period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[...periods].reverse().slice(0, 5).map(period => (
                  <div key={period.period_id} className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 border-b">
                      <h4 className="font-semibold">{period.period_id}</h4>
                    </div>
                    <div className="divide-y">
                      {period.standings.slice(0, 10).map((standing, idx) => (
                        <div 
                          key={standing.user_id}
                          className={cn(
                            "flex items-center gap-4 px-4 py-2",
                            standing.is_current_user && "bg-primary/5"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                            idx === 0 && "bg-yellow-500 text-yellow-950",
                            idx === 1 && "bg-gray-300 text-gray-700",
                            idx === 2 && "bg-amber-600 text-amber-50",
                            idx > 2 && "bg-muted text-muted-foreground"
                          )}>
                            {standing.rank}
                          </div>
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={standing.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(standing.user_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "font-medium truncate",
                              standing.is_current_user && "text-primary"
                            )}>
                              {standing.user_name}
                              {standing.is_current_user && " (You)"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {standing.correct_picks}/{standing.total_picks} correct ({standing.win_percentage}%)
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">{standing.total_points}</p>
                            <p className="text-xs text-muted-foreground">pts</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
