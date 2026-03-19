import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Target, Percent, 
  DollarSign, Flame, BarChart3, PieChart, Activity,
  Calendar, Home, Plane, RefreshCw, Zap, Plus, History,
  X, ChevronDown
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";

import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
  LineChart,
  Line,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { TrackerStats } from "@/shared/types";

// Demo data removed - using live data only

// =====================================================
// API RESPONSE TYPES
// =====================================================

interface SportStats {
  sport_key: string;
  total_picks: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  units_wagered: number;
  units_profit: number;
  roi: number;
}

interface TypeStats {
  pick_type: string;
  total_picks: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  units_wagered: number;
  units_profit: number;
  roi: number;
}

interface DayStats {
  day: string;
  day_num: number;
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit: number;
}

interface OddsStats {
  range: string;
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
  expected_win_rate: number;
  edge: number;
  profit: number;
}

interface WeeklyStats {
  week: string;
  week_id: string;
  picks: number;
  wins: number;
  losses: number;
  profit: number;
  cumulative: number;
  roi: number;
}

interface MonthlyStats {
  month: string;
  month_id: string;
  picks: number;
  wins: number;
  losses: number;
  profit: number;
  cumulative: number;
  win_rate: number;
}

interface SideStats {
  home: { wins: number; losses: number; pushes: number; total: number; win_rate: number };
  away: { wins: number; losses: number; pushes: number; total: number; win_rate: number };
}

interface AnalyticsData {
  stats: TrackerStats;
  sportStats: SportStats[];
  typeStats: TypeStats[];
  dayStats: DayStats[];
  oddsStats: OddsStats[];
  weeklyStats: WeeklyStats[];
  monthlyStats: MonthlyStats[];
  sideStats: SideStats;
}

// =====================================================
// API HOOKS
// =====================================================

interface FilterOptions {
  sportKey?: string;
  pickType?: string;
  days?: number; // undefined = all time
}

const TIME_PERIODS = [
  { label: "7 Days", value: 7 },
  { label: "30 Days", value: 30 },
  { label: "90 Days", value: 90 },
  { label: "All Time", value: undefined },
] as const;

function useAnalyticsData(scope: string, filters: FilterOptions) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);

      try {
        // Build query params
        const params = new URLSearchParams({ scope });
        if (filters.sportKey) params.append("sport_key", filters.sportKey);
        if (filters.pickType) params.append("pick_type", filters.pickType);
        if (filters.days) params.append("days", filters.days.toString());
        const queryStr = params.toString();
        
        // Fetch all analytics data in parallel
        const [
          statsRes,
          sportRes,
          typeRes,
          dayRes,
          oddsRes,
          weeklyRes,
          monthlyRes,
          sideRes,
        ] = await Promise.all([
          fetch(`/api/tracker/stats?${queryStr}`),
          fetch(`/api/tracker/stats/by-sport?scope=${scope}`), // Always show all sports for reference
          fetch(`/api/tracker/stats/by-type?scope=${scope}`), // Always show all types for reference
          fetch(`/api/tracker/stats/by-day?${queryStr}`),
          fetch(`/api/tracker/stats/by-odds?${queryStr}`),
          fetch(`/api/tracker/stats/weekly?weeks=12&${queryStr}`),
          fetch(`/api/tracker/stats/monthly?months=6&${queryStr}`),
          fetch(`/api/tracker/stats/by-side?${queryStr}`),
        ]);

        // Check for auth errors - show error for unauthenticated users
        if (statsRes.status === 401) {
          setError("Please sign in to view your analytics");
          setLoading(false);
          return;
        }

        const [stats, sports, types, days, odds, weekly, monthly, side] = await Promise.all([
          statsRes.json(),
          sportRes.json(),
          typeRes.json(),
          dayRes.json(),
          oddsRes.json(),
          weeklyRes.json(),
          monthlyRes.json(),
          sideRes.json(),
        ]);

        setData({
          stats: stats as TrackerStats,
          sportStats: sports.sports || [],
          typeStats: types.types || [],
          dayStats: days.days || [],
          oddsStats: odds.odds || [],
          weeklyStats: weekly.weeks || [],
          monthlyStats: monthly.months || [],
          sideStats: side as SideStats,
        });
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
        setError("Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [scope, filters.sportKey, filters.pickType, filters.days]);

  return { data, loading, error };
}

// =====================================================
// CHART COMPONENTS
// =====================================================

// Stat Card
function StatCard({ 
  label, 
  value, 
  subValue, 
  icon: Icon, 
  trend,
  color = "primary"
}: { 
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  trend?: { value: number; isPositive: boolean };
  color?: "primary" | "success" | "destructive" | "warning";
}) {
  const colorClasses = {
    primary: "from-primary/10 to-primary/5",
    success: "from-[hsl(var(--success))]/10 to-[hsl(var(--success))]/5",
    destructive: "from-destructive/10 to-destructive/5",
    warning: "from-amber-500/10 to-amber-500/5",
  };

  const iconColors = {
    primary: "text-primary",
    success: "text-[hsl(var(--success))]",
    destructive: "text-destructive",
    warning: "text-amber-500",
  };

  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-4", colorClasses[color])}>
      <div className="flex items-start justify-between mb-2">
        <div className={cn("p-2 rounded-xl bg-background/80", iconColors[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && (
          <Badge variant={trend.isPositive ? "default" : "destructive"} className="text-xs">
            {trend.isPositive ? "+" : ""}{trend.value}%
          </Badge>
        )}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {subValue && <div className="text-xs text-muted-foreground mt-1">{subValue}</div>}
    </div>
  );
}

// Win Rate Gauge
function WinRateGauge({ winRate, target = 52.4 }: { winRate: number; target?: number }) {
  const data = [{ name: "Win Rate", value: winRate, fill: "hsl(var(--success))" }];

  return (
    <div className="relative h-48">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="90%"
          startAngle={180}
          endAngle={0}
          data={data}
        >
          <RadialBar
            background={{ fill: "hsl(var(--muted))" }}
            dataKey="value"
            cornerRadius={10}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
        <div className="text-3xl font-bold">{winRate.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground">Win Rate</div>
        <div className="text-xs text-muted-foreground mt-1">
          Target: {target}% (break even)
        </div>
      </div>
    </div>
  );
}

// Profit Trend Chart
function ProfitTrendChart({ data }: { data: WeeklyStats[] }) {
  if (!data.length) {
    return (
      <div className="h-72 flex items-center justify-center text-muted-foreground">
        No weekly data yet
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="week" 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
          />
          <YAxis 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            tickFormatter={(value) => `${value}u`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))", 
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            }}
            formatter={(value, name) => {
              if (name === "cumulative") return [`${Number(value).toFixed(2)}u`, "Total Profit"];
              if (name === "profit") return [`${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}u`, "Week P/L"];
              return [value, name];
            }}
          />
          <Area 
            type="monotone" 
            dataKey="cumulative" 
            stroke="hsl(var(--success))" 
            strokeWidth={2}
            fill="url(#profitGradient)" 
          />
          <Line 
            type="monotone" 
            dataKey="profit" 
            stroke="hsl(var(--primary))" 
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sport Performance Chart
function SportPerformanceChart({ data }: { data: SportStats[] }) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No sport data yet
      </div>
    );
  }

  const chartData = data.map(s => ({
    sport: s.sport_key.toUpperCase(),
    wins: s.wins,
    losses: s.losses,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 50, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
          <YAxis 
            dataKey="sport" 
            type="category" 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            width={45}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))", 
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            }}
          />
          <Bar dataKey="wins" stackId="a" fill="hsl(var(--success))" name="Wins" />
          <Bar dataKey="losses" stackId="a" fill="hsl(var(--destructive))" name="Losses" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Record Donut
function RecordDonut({ wins, losses, pushes }: { wins: number; losses: number; pushes: number }) {
  const data = [
    { name: "Wins", value: wins, color: "hsl(var(--success))" },
    { name: "Losses", value: losses, color: "hsl(var(--destructive))" },
    { name: "Pushes", value: pushes, color: "hsl(var(--muted-foreground))" },
  ].filter(d => d.value > 0);
  
  const total = wins + losses + pushes;

  if (total === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground">
        No picks yet
      </div>
    );
  }

  return (
    <div className="relative h-52">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPie>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))", 
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            }}
          />
        </RechartsPie>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground">Total Picks</div>
        </div>
      </div>
    </div>
  );
}

// Day of Week Chart
function DayOfWeekChart({ data }: { data: DayStats[] }) {
  if (!data.length) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground">
        No daily data yet
      </div>
    );
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="day" 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
          />
          <YAxis 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))", 
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            }}
            formatter={(value, name) => [value, name === "wins" ? "Wins" : "Losses"]}
          />
          <Bar dataKey="wins" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="losses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Monthly Comparison Chart
function MonthlyChart({ data }: { data: MonthlyStats[] }) {
  if (!data.length) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground">
        No monthly data yet
      </div>
    );
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="month" 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
          />
          <YAxis 
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v) => `${v}u`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))", 
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            }}
            formatter={(value, name) => {
              if (name === "profit") return [`${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}u`, "Monthly P/L"];
              if (name === "cumulative") return [`${Number(value).toFixed(2)}u`, "Cumulative"];
              return [value, name];
            }}
          />
          <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="cumulative" stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Market Type Card
function MarketCard({ market }: { market: TypeStats }) {
  const total = market.wins + market.losses;
  const winPct = total > 0 ? (market.wins / total) * 100 : 0;
  
  return (
    <div className="p-4 rounded-xl border bg-card/50 hover:bg-card transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold">{market.pick_type}</span>
        <Badge variant={market.roi > 0 ? "default" : "destructive"} className="text-xs">
          {market.roi > 0 ? "+" : ""}{market.roi.toFixed(1)}% ROI
        </Badge>
      </div>
      
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-muted-foreground">{market.wins}W - {market.losses}L</span>
          <span className="font-medium">{market.win_rate.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[hsl(var(--success))] to-[hsl(var(--success))]/70 rounded-full transition-all"
            style={{ width: `${winPct}%` }}
          />
        </div>
      </div>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} picks • {market.units_wagered.toFixed(1)}u wagered</span>
        <span className={cn(market.units_profit > 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
          {market.units_profit > 0 ? "+" : ""}{market.units_profit.toFixed(2)}u
        </span>
      </div>
    </div>
  );
}

// Odds Range Card
function OddsRangeCard({ data }: { data: OddsStats }) {
  const total = data.wins + data.losses;
  const isPositiveEdge = data.edge > 0;
  
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{data.range}</p>
        <p className="text-xs text-muted-foreground">
          {data.wins}W - {data.losses}L ({total} picks)
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">{data.win_rate.toFixed(1)}%</p>
        <p className={cn(
          "text-xs",
          isPositiveEdge ? "text-[hsl(var(--success))]" : "text-destructive"
        )}>
          {isPositiveEdge ? "+" : ""}{data.edge.toFixed(1)}% edge
        </p>
      </div>
    </div>
  );
}

// Side Split Card
function SideSplitCard({ 
  label, 
  icon: Icon, 
  data 
}: { 
  label: string;
  icon: React.ElementType;
  data: { wins: number; losses: number; pushes: number; total: number; win_rate: number };
}) {
  return (
    <div className="p-4 rounded-xl border bg-card/50">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <span className="font-semibold">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{data.win_rate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">
            {data.wins}W - {data.losses}L
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">{data.total}</p>
          <p className="text-xs text-muted-foreground">picks</p>
        </div>
      </div>
    </div>
  );
}

// Insight Card
function InsightCard({ 
  color, 
  title, 
  description 
}: { 
  color: "success" | "primary" | "warning" | "destructive";
  title: string;
  description: string;
}) {
  const colors = {
    success: "bg-[hsl(var(--success))]",
    primary: "bg-primary",
    warning: "bg-amber-500",
    destructive: "bg-destructive",
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-background/50">
      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", colors[color])} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Empty State
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <BarChart3 className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-2">No picks tracked yet</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm">
        Start tracking your picks to see detailed analytics and insights about your betting performance.
      </p>
      <Link to="/picks">
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Make Your First Pick
        </Button>
      </Link>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function PicksAnalytics() {
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const [activeTab, setActiveTab] = useState("overview");
  const [sportFilter, setSportFilter] = useState<string | undefined>();
  const [marketFilter, setMarketFilter] = useState<string | undefined>();
  const [timePeriod, setTimePeriod] = useState<number | undefined>(undefined);
  
  const filters: FilterOptions = {
    sportKey: sportFilter,
    pickType: marketFilter,
    days: timePeriod,
  };
  
  const { data, loading, error } = useAnalyticsData(scope, filters);
  
  // Get available sports and markets from the unfiltered data
  const availableSports = data?.sportStats.map(s => s.sport_key) || [];
  const availableMarkets = data?.typeStats.map(t => t.pick_type) || [];
  
  const hasActiveFilters = sportFilter || marketFilter || timePeriod;
  
  const activeTimePeriodLabel = TIME_PERIODS.find(p => p.value === timePeriod)?.label || "All Time";
  
  const clearFilters = () => {
    setSportFilter(undefined);
    setMarketFilter(undefined);
    setTimePeriod(undefined);
  };
  
  // Find best performers
  const bestDay = useMemo(() => {
    if (!data?.dayStats?.length) return null;
    return data.dayStats.reduce((best, day) => 
      (day.win_rate > best.win_rate && day.total >= 3) ? day : best
    , data.dayStats[0]);
  }, [data?.dayStats]);

  const bestSport = useMemo(() => {
    if (!data?.sportStats?.length) return null;
    return data.sportStats.reduce((best, sport) => 
      sport.roi > best.roi ? sport : best
    );
  }, [data?.sportStats]);

  const bestMarket = useMemo(() => {
    if (!data?.typeStats?.length) return null;
    return data.typeStats.reduce((best, market) => 
      market.roi > best.roi ? market : best
    );
  }, [data?.typeStats]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate("/login")}>Sign In</Button>
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const hasData = stats && stats.total_picks > 0;
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-bold text-lg">Analytics</h1>
                <p className="text-xs text-muted-foreground">
                  {hasActiveFilters ? (
                    <span className="text-primary">
                      Filtered: {[
                        timePeriod ? activeTimePeriodLabel : null,
                        sportFilter?.toUpperCase(), 
                        marketFilter
                      ].filter(Boolean).join(" • ")}
                    </span>
                  ) : (
                    "Performance breakdown"
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 text-xs gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
              
              {/* Time Period Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={timePeriod ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs gap-1"
                  >
                    <Calendar className="w-3 h-3" />
                    {activeTimePeriodLabel}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {TIME_PERIODS.map(period => (
                    <DropdownMenuItem
                      key={period.label}
                      onClick={() => setTimePeriod(period.value)}
                    >
                      {period.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Sport Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={sportFilter ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs gap-1"
                  >
                    {sportFilter ? sportFilter.toUpperCase() : "Sport"}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSportFilter(undefined)}>
                    All Sports
                  </DropdownMenuItem>
                  {availableSports.map(sport => (
                    <DropdownMenuItem
                      key={sport}
                      onClick={() => setSportFilter(sport)}
                    >
                      {sport.toUpperCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Market Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={marketFilter ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs gap-1"
                  >
                    {marketFilter || "Market"}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setMarketFilter(undefined)}>
                    All Markets
                  </DropdownMenuItem>
                  {availableMarkets.map(market => (
                    <DropdownMenuItem
                      key={market}
                      onClick={() => setMarketFilter(market)}
                    >
                      {market}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 pb-24">
        {!hasData ? (
          <EmptyState />
        ) : (
          <>
            {/* Tab Navigation */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="sports" className="text-xs">By Sport</TabsTrigger>
                <TabsTrigger value="markets" className="text-xs">By Market</TabsTrigger>
                <TabsTrigger value="trends" className="text-xs">Trends</TabsTrigger>
              </TabsList>
              
              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="mt-6 space-y-6">
                {/* Key Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    label="Win Rate"
                    value={`${stats.win_rate.toFixed(1)}%`}
                    subValue={`${stats.wins}W - ${stats.losses}L`}
                    icon={Target}
                    color="success"
                  />
                  <StatCard
                    label="ROI"
                    value={`${stats.roi > 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
                    subValue="Return on Investment"
                    icon={Percent}
                    color={stats.roi > 0 ? "success" : "destructive"}
                  />
                  <StatCard
                    label="Units Profit"
                    value={`${stats.units_profit > 0 ? "+" : ""}${stats.units_profit.toFixed(2)}u`}
                    subValue={`${stats.units_wagered.toFixed(1)}u wagered`}
                    icon={DollarSign}
                    color={stats.units_profit > 0 ? "success" : "destructive"}
                  />
                  <StatCard
                    label="Current Streak"
                    value={`${stats.current_streak > 0 ? "W" : stats.current_streak < 0 ? "L" : ""}${Math.abs(stats.current_streak)}`}
                    subValue={`Best: W${stats.best_streak}`}
                    icon={Flame}
                    color={stats.current_streak > 0 ? "success" : stats.current_streak < 0 ? "destructive" : "primary"}
                  />
                </div>
                
                {/* Win Rate Gauge + Record Donut */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">Win Rate</h3>
                    </div>
                    <WinRateGauge winRate={stats.win_rate} />
                  </div>
                  
                  <div className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <PieChart className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">Record Breakdown</h3>
                    </div>
                    <RecordDonut 
                      wins={stats.wins} 
                      losses={stats.losses} 
                      pushes={stats.pushes} 
                    />
                    <div className="flex items-center justify-center gap-6 mt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[hsl(var(--success))]" />
                        <span className="text-sm">{stats.wins} Wins</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-destructive" />
                        <span className="text-sm">{stats.losses} Losses</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Home/Away Split */}
                {data?.sideStats && (
                  <div className="grid grid-cols-2 gap-3">
                    <SideSplitCard 
                      label="Home/Over" 
                      icon={Home} 
                      data={data.sideStats.home} 
                    />
                    <SideSplitCard 
                      label="Away/Under" 
                      icon={Plane} 
                      data={data.sideStats.away} 
                    />
                  </div>
                )}
                
                {/* Key Insights */}
                {(bestMarket || bestSport || bestDay) && (
                  <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">Key Insights</h3>
                    </div>
                    <div className="space-y-2">
                      {bestMarket && bestMarket.roi !== 0 && (
                        <InsightCard
                          color="success"
                          title={`${bestMarket.pick_type} is your best market`}
                          description={`${bestMarket.win_rate.toFixed(1)}% win rate with ${bestMarket.roi > 0 ? "+" : ""}${bestMarket.roi.toFixed(1)}% ROI`}
                        />
                      )}
                      {bestSport && bestSport.roi !== 0 && (
                        <InsightCard
                          color="primary"
                          title={`${bestSport.sport_key.toUpperCase()} leads in profitability`}
                          description={`${bestSport.roi > 0 ? "+" : ""}${bestSport.roi.toFixed(1)}% ROI across ${bestSport.units_wagered.toFixed(1)} units wagered`}
                        />
                      )}
                      {bestDay && bestDay.total >= 3 && (
                        <InsightCard
                          color="warning"
                          title={`${bestDay.day} is your best day`}
                          description={`${bestDay.win_rate.toFixed(1)}% win rate on ${bestDay.day}s (${bestDay.total} picks)`}
                        />
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* SPORTS TAB */}
              <TabsContent value="sports" className="mt-6 space-y-6">
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Performance by Sport</h3>
                  </div>
                  <SportPerformanceChart data={data?.sportStats || []} />
                </div>
                
                {/* Sport Stats Table */}
                {data?.sportStats && data.sportStats.length > 0 && (
                  <div className="rounded-2xl border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-3 px-4 font-medium">Sport</th>
                            <th className="text-center py-3 px-4 font-medium">Record</th>
                            <th className="text-center py-3 px-4 font-medium">Win %</th>
                            <th className="text-right py-3 px-4 font-medium">ROI</th>
                            <th className="text-right py-3 px-4 font-medium">Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sportStats.map((sport) => (
                            <tr key={sport.sport_key} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-3 px-4 font-medium">{sport.sport_key.toUpperCase()}</td>
                              <td className="py-3 px-4 text-center">
                                <span className="text-[hsl(var(--success))]">{sport.wins}</span>
                                <span className="text-muted-foreground"> - </span>
                                <span className="text-destructive">{sport.losses}</span>
                                {sport.pushes > 0 && (
                                  <span className="text-muted-foreground"> - {sport.pushes}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">{sport.win_rate.toFixed(1)}%</td>
                              <td className={cn(
                                "py-3 px-4 text-right font-medium",
                                sport.roi > 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                              )}>
                                {sport.roi > 0 ? "+" : ""}{sport.roi.toFixed(1)}%
                              </td>
                              <td className={cn(
                                "py-3 px-4 text-right font-semibold",
                                sport.units_profit > 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                              )}>
                                {sport.units_profit > 0 ? "+" : ""}{sport.units_profit.toFixed(2)}u
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/30 font-semibold">
                            <td className="py-3 px-4">Total</td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-[hsl(var(--success))]">{stats.wins}</span>
                              <span> - </span>
                              <span className="text-destructive">{stats.losses}</span>
                            </td>
                            <td className="py-3 px-4 text-center">{stats.win_rate.toFixed(1)}%</td>
                            <td className={cn(
                              "py-3 px-4 text-right",
                              stats.roi > 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                            )}>
                              {stats.roi > 0 ? "+" : ""}{stats.roi.toFixed(1)}%
                            </td>
                            <td className={cn(
                              "py-3 px-4 text-right",
                              stats.units_profit > 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                            )}>
                              {stats.units_profit > 0 ? "+" : ""}{stats.units_profit.toFixed(2)}u
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* MARKETS TAB */}
              <TabsContent value="markets" className="mt-6 space-y-6">
                {/* Market Type Cards */}
                {data?.typeStats && data.typeStats.length > 0 && (
                  <div className="grid sm:grid-cols-3 gap-3">
                    {data.typeStats.map((market) => (
                      <MarketCard key={market.pick_type} market={market} />
                    ))}
                  </div>
                )}
                
                {/* Odds Range Analysis */}
                {data?.oddsStats && data.oddsStats.length > 0 && (
                  <div className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">Performance by Odds Range</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Edge = Your win rate minus implied probability from odds
                    </p>
                    <div className="space-y-2">
                      {data.oddsStats.map((range) => (
                        <OddsRangeCard key={range.range} data={range} />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* TRENDS TAB */}
              <TabsContent value="trends" className="mt-6 space-y-6">
                {/* Profit Trend */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Profit Trend (Weekly)</h3>
                  </div>
                  <ProfitTrendChart data={data?.weeklyStats || []} />
                  {data?.weeklyStats && data.weeklyStats.length > 0 && (
                    <div className="flex items-center justify-center gap-6 mt-4 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-[hsl(var(--success))]" />
                        <span>Cumulative Profit</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-primary" />
                        <span>Weekly P/L</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Monthly Performance */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Monthly Performance</h3>
                  </div>
                  <MonthlyChart data={data?.monthlyStats || []} />
                </div>
                
                {/* Day of Week */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold">Results by Day of Week</h3>
                  </div>
                  <DayOfWeekChart data={data?.dayStats || []} />
                  {bestDay && bestDay.total >= 3 && (
                    <p className="text-xs text-muted-foreground text-center mt-3">
                      Best: <span className="font-medium text-foreground">{bestDay.day}</span> ({bestDay.win_rate.toFixed(1)}%)
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
        
        {/* Navigation */}
        <div className="flex gap-3 pt-4">
          <Link to="/picks" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <Plus className="w-4 h-4" />
              Make Picks
            </Button>
          </Link>
          <Link to="/picks/history" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <History className="w-4 h-4" />
              View History
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
