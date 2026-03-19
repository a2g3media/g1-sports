import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { 
  ArrowLeft, Users, DollarSign, TrendingUp, Activity, 
  BarChart3, Clock, CheckCircle2, AlertCircle,
  Crown, MessageCircle, Loader2, Target, Zap,
  PieChart, Shield, Eye
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { SPORTS, POOL_FORMATS } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  entry_fee_cents: number;
  is_payment_required: number;
  is_active: number;
  member_count: number;
  role: string;
}

interface LeagueAnalytics {
  league_id: number;
  league_name: string;
  member_count: number;
  paid_count: number;
  unpaid_count: number;
  total_collected_cents: number;
  pick_participation_rate: number;
  chat_messages_count: number;
  avg_picks_per_member: number;
  most_active_period: string | null;
  recent_activity_count: number;
}

interface OverallStats {
  total_leagues: number;
  total_members: number;
  total_collected_cents: number;
  total_pending_cents: number;
  avg_participation_rate: number;
  avg_payment_rate: number;
  total_picks_submitted: number;
  total_chat_messages: number;
  active_members_this_week: number;
}

interface ActivityEvent {
  id: number;
  type: string;
  league_name: string;
  user_name?: string;
  description: string;
  created_at: string;
}

interface MemberRecord {
  is_payment_verified: number;
}

interface AuditEvent {
  id: number;
  event_type: string;
  user_id?: string;
  created_at: string;
  payload_json?: string;
}

interface ChatMessage {
  created_at: string;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function CommissionerDashboard() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  const [analytics, setAnalytics] = useState<LeagueAnalytics[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ week: string; picks: number; members: number; messages: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      // Fetch user's leagues where they are owner/admin
      const leaguesRes = await fetch("/api/leagues");
      if (!leaguesRes.ok) throw new Error("Failed to fetch leagues");
      const allLeagues: League[] = await leaguesRes.json();
      
      // Filter to leagues where user is owner or admin
      const adminLeagues = allLeagues.filter(l => l.role === "owner" || l.role === "admin");
      setLeagues(adminLeagues);
      
      if (adminLeagues.length === 0) {
        setIsLoading(false);
        return;
      }
      
      // Fetch analytics for each league
      const analyticsData: LeagueAnalytics[] = [];
      let totalMembers = 0;
      let totalCollected = 0;
      let totalPending = 0;
      let totalPicks = 0;
      let totalMessages = 0;
      let totalPaidMembers = 0;
      let totalMembersWithPaymentRequired = 0;
      let participationSum = 0;
      const activeThisWeek = new Set<string>();
      const activityEvents: ActivityEvent[] = [];
      const weeklyStats: Record<string, { picks: number; members: Set<string>; messages: number }> = {};
      
      for (const league of adminLeagues) {
        try {
          // Get members with payment status
          const membersRes = await fetch(`/api/leagues/${league.id}/members`);
          const members = membersRes.ok ? await membersRes.json() : [];
          
          // Get transactions for payment stats
          const txnRes = await fetch(`/api/leagues/${league.id}/transactions`);
          const txnData = txnRes.ok ? await txnRes.json() : { transactions: [], summary: {} };
          
          // Get audit log for activity
          const auditRes = await fetch(`/api/leagues/${league.id}/audit`);
          const auditEvents = auditRes.ok ? await auditRes.json() : [];
          
          // Get chat messages count
          const chatRes = await fetch(`/api/leagues/${league.id}/chat?limit=100`);
          const chatData = chatRes.ok ? await chatRes.json() : { messages: [] };
          
          const paidCount = members.filter((m: MemberRecord) => m.is_payment_verified === 1).length;
          const unpaidCount = league.is_payment_required ? members.length - paidCount : 0;
          
          // Track picks per period
          const pickEvents = auditEvents.filter((e: AuditEvent) => e.event_type === "picks_submitted");
          const uniquePickers = new Set(pickEvents.map((e: AuditEvent) => e.user_id));
          const participationRate = members.length > 0 
            ? Math.round((uniquePickers.size / members.length) * 100) 
            : 0;
          
          // Count recent activity (last 7 days)
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const recentActivity = auditEvents.filter((e: AuditEvent) => new Date(e.created_at) > weekAgo);
          
          // Track active users this week
          recentActivity.forEach((e: AuditEvent) => {
            if (e.user_id) activeThisWeek.add(e.user_id);
          });
          
          // Aggregate weekly data
          auditEvents.forEach((e: AuditEvent) => {
            const date = new Date(e.created_at);
            const weekKey = getWeekKey(date);
            if (!weeklyStats[weekKey]) {
              weeklyStats[weekKey] = { picks: 0, members: new Set(), messages: 0 };
            }
            if (e.event_type === "picks_submitted") {
              weeklyStats[weekKey].picks++;
              if (e.user_id) weeklyStats[weekKey].members.add(e.user_id);
            }
          });
          
          chatData.messages?.forEach((m: ChatMessage) => {
            const date = new Date(m.created_at);
            const weekKey = getWeekKey(date);
            if (!weeklyStats[weekKey]) {
              weeklyStats[weekKey] = { picks: 0, members: new Set(), messages: 0 };
            }
            weeklyStats[weekKey].messages++;
          });
          
          // Add to activity feed
          auditEvents.slice(0, 5).forEach((e: AuditEvent) => {
            activityEvents.push({
              id: e.id,
              type: e.event_type,
              league_name: league.name,
              description: formatEventDescription(e.event_type, e.payload_json ?? null),
              created_at: e.created_at,
            });
          });
          
          analyticsData.push({
            league_id: league.id,
            league_name: league.name,
            member_count: members.length,
            paid_count: paidCount,
            unpaid_count: unpaidCount,
            total_collected_cents: txnData.summary?.totalCollectedCents || 0,
            pick_participation_rate: participationRate,
            chat_messages_count: chatData.messages?.length || 0,
            avg_picks_per_member: members.length > 0 ? Math.round((pickEvents.length / members.length) * 10) / 10 : 0,
            most_active_period: getMostActivePeriod(pickEvents),
            recent_activity_count: recentActivity.length,
          });
          
          // Aggregate totals
          totalMembers += members.length;
          totalCollected += txnData.summary?.totalCollectedCents || 0;
          totalPending += txnData.summary?.totalPendingCents || 0;
          totalPicks += pickEvents.length;
          totalMessages += chatData.messages?.length || 0;
          if (league.is_payment_required) {
            totalPaidMembers += paidCount;
            totalMembersWithPaymentRequired += members.length;
          }
          participationSum += participationRate;
        } catch (err) {
          console.error(`Error fetching analytics for league ${league.id}:`, err);
        }
      }
      
      setAnalytics(analyticsData);
      
      // Calculate overall stats
      setOverallStats({
        total_leagues: adminLeagues.length,
        total_members: totalMembers,
        total_collected_cents: totalCollected,
        total_pending_cents: totalPending,
        avg_participation_rate: adminLeagues.length > 0 
          ? Math.round(participationSum / adminLeagues.length) 
          : 0,
        avg_payment_rate: totalMembersWithPaymentRequired > 0 
          ? Math.round((totalPaidMembers / totalMembersWithPaymentRequired) * 100) 
          : 100,
        total_picks_submitted: totalPicks,
        total_chat_messages: totalMessages,
        active_members_this_week: activeThisWeek.size,
      });
      
      // Sort activity by date
      activityEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivityFeed(activityEvents.slice(0, 20));
      
      // Convert weekly stats to chart data
      const sortedWeeks = Object.entries(weeklyStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8)
        .map(([week, data]) => ({
          week: formatWeekLabel(week),
          picks: data.picks,
          members: data.members.size,
          messages: data.messages,
        }));
      setWeeklyData(sortedWeeks);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  };

  const getWeekKey = (date: Date): string => {
    const yr = date.getFullYear();
    const weekNum = Math.ceil((date.getTime() - new Date(yr, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return `${yr}-W${weekNum.toString().padStart(2, "0")}`;
  };

  const formatWeekLabel = (weekKey: string): string => {
    const [, week] = weekKey.split("-W");
    return `W${week}`;
  };

  const getMostActivePeriod = (pickEvents: AuditEvent[]): string | null => {
    const periodCounts: Record<string, number> = {};
    pickEvents.forEach((e: AuditEvent) => {
      try {
        const payload = JSON.parse(e.payload_json || "{}");
        if (payload.periodId) {
          periodCounts[payload.periodId] = (periodCounts[payload.periodId] || 0) + 1;
        }
      } catch {}
    });
    
    const sorted = Object.entries(periodCounts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || null;
  };

  const formatEventDescription = (type: string, payloadJson: string | null): string => {
    try {
      const payload = payloadJson ? JSON.parse(payloadJson) : {};
      switch (type) {
        case "picks_submitted":
          return `Submitted ${payload.pickCount || "?"} picks for ${payload.periodId || "?"}`;
        case "member_joined":
          return "New member joined";
        case "payment_manually_verified":
          return "Payment verified";
        case "chat_message_sent":
          return "Sent a message";
        case "league_updated":
          return "League settings updated";
        default:
          return type.replace(/_/g, " ");
      }
    } catch {
      return type.replace(/_/g, " ");
    }
  };

  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const selectedAnalytics = selectedLeagueId === "all" 
    ? analytics 
    : analytics.filter(a => a.league_id === parseInt(selectedLeagueId));

  const pieData = selectedAnalytics.map(a => ({
    name: a.league_name,
    value: a.member_count,
  }));

  const paymentPieData = selectedLeagueId === "all"
    ? [
        { name: "Paid", value: analytics.reduce((sum, a) => sum + a.paid_count, 0), fill: "hsl(var(--chart-2))" },
        { name: "Unpaid", value: analytics.reduce((sum, a) => sum + a.unpaid_count, 0), fill: "hsl(var(--destructive))" },
      ]
    : (() => {
        const league = analytics.find(a => a.league_id === parseInt(selectedLeagueId));
        return league ? [
          { name: "Paid", value: league.paid_count, fill: "hsl(var(--chart-2))" },
          { name: "Unpaid", value: league.unpaid_count, fill: "hsl(var(--destructive))" },
        ] : [];
      })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <Crown className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
        <h1 className="text-2xl font-bold mb-2">Commissioner Dashboard</h1>
        <p className="text-muted-foreground mb-6">
          You don't have any leagues where you're an owner or admin yet.
        </p>
        <Link to="/create-league">
          <Button>Create Your First League</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Crown className="h-6 w-6 text-amber-500" />
              Commissioner Dashboard
            </h1>
            <p className="text-muted-foreground text-sm">
              Analytics and insights across {leagues.length} league{leagues.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        
        <Select value={selectedLeagueId} onValueChange={setSelectedLeagueId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Leagues" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Leagues</SelectItem>
            {leagues.map(league => (
              <SelectItem key={league.id} value={league.id.toString()}>
                {league.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Overview Stats Cards */}
      {overallStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-3xl font-bold">{overallStats.total_members}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overallStats.active_members_this_week} active this week
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Collected</p>
                  <p className="text-3xl font-bold">{formatCurrency(overallStats.total_collected_cents)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(overallStats.total_pending_cents)} pending
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Participation Rate</p>
                  <p className="text-3xl font-bold">{overallStats.avg_participation_rate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overallStats.total_picks_submitted} picks submitted
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Target className="h-6 w-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Payment Rate</p>
                  <p className="text-3xl font-bold">{overallStats.avg_payment_rate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overallStats.total_chat_messages} chat messages
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="engagement" className="gap-2">
            <Activity className="h-4 w-4" />
            Engagement
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Clock className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Weekly Activity Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Weekly Activity
                </CardTitle>
                <CardDescription>Picks, messages, and active members over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyData}>
                      <defs>
                        <linearGradient id="colorPicks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="week" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip 
                        contentStyle={{ 
                          background: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="picks" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#colorPicks)" name="Picks" />
                      <Area type="monotone" dataKey="messages" stroke="hsl(var(--chart-2))" fillOpacity={1} fill="url(#colorMessages)" name="Messages" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* League Comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Member Distribution
                </CardTitle>
                <CardDescription>Members across your leagues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          background: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* League Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {selectedAnalytics.map(league => {
              const leagueInfo = leagues.find(l => l.id === league.league_id);
              const sport = SPORTS.find(s => s.key === leagueInfo?.sport_key);
              const format = POOL_FORMATS.find(f => f.key === leagueInfo?.format_key);
              
              return (
                <Card key={league.league_id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {sport && <sport.icon className="h-5 w-5" />}
                        <CardTitle className="text-lg">{league.league_name}</CardTitle>
                      </div>
                      <Badge variant="outline">{format?.name}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Members</span>
                        <p className="font-semibold">{league.member_count}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Participation</span>
                        <p className="font-semibold">{league.pick_participation_rate}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Collected</span>
                        <p className="font-semibold">{formatCurrency(league.total_collected_cents)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Messages</span>
                        <p className="font-semibold">{league.chat_messages_count}</p>
                      </div>
                    </div>
                    
                    {/* Mini progress bars */}
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Payment Status</span>
                          <span>{league.paid_count}/{league.member_count}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${league.member_count > 0 ? (league.paid_count / league.member_count) * 100 : 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => navigate(`/leagues/${league.league_id}/admin`)}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        Manage
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate(`/leagues/${league.league_id}/standings`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Participation by League */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Participation by League
                </CardTitle>
                <CardDescription>Pick submission rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedAnalytics} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="league_name" type="category" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          background: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value) => [`${value}%`, "Participation"]}
                      />
                      <Bar dataKey="pick_participation_rate" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Chat Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Chat Engagement
                </CardTitle>
                <CardDescription>Message activity by league</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedAnalytics}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="league_name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip 
                        contentStyle={{ 
                          background: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="chat_messages_count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Messages" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Engagement Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Engagement Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {selectedAnalytics.map(league => (
                  <div key={league.league_id} className="p-4 rounded-lg bg-muted/50">
                    <h4 className="font-medium mb-2">{league.league_name}</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg picks/member</span>
                        <span className="font-medium">{league.avg_picks_per_member}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Most active period</span>
                        <span className="font-medium">{league.most_active_period || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Recent activity</span>
                        <span className="font-medium">{league.recent_activity_count} events</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Payment Status Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Payment Status
                </CardTitle>
                <CardDescription>Paid vs unpaid members</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={paymentPieData.filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {paymentPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          background: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue by League */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Revenue by League
                </CardTitle>
                <CardDescription>Total collected per league</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedAnalytics.filter(a => a.total_collected_cents > 0)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="league_name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v/100}`} />
                      <Tooltip 
                        contentStyle={{ 
                          background: "hsl(var(--background))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value) => [formatCurrency(value as number), "Collected"]}
                      />
                      <Bar dataKey="total_collected_cents" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Unpaid Members Alert */}
          {selectedAnalytics.some(a => a.unpaid_count > 0) && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-5 w-5" />
                  Payment Reminders Needed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedAnalytics.filter(a => a.unpaid_count > 0).map(league => (
                    <div key={league.league_id} className="flex items-center justify-between p-3 bg-background rounded-lg">
                      <div>
                        <span className="font-medium">{league.league_name}</span>
                        <p className="text-sm text-muted-foreground">
                          {league.unpaid_count} member{league.unpaid_count !== 1 ? "s" : ""} haven't paid
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/leagues/${league.league_id}/admin?tab=payments`)}
                      >
                        View Details
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest events across your leagues</CardDescription>
            </CardHeader>
            <CardContent>
              {activityFeed.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No recent activity
                </p>
              ) : (
                <div className="space-y-4">
                  {activityFeed.map((event, idx) => (
                    <div 
                      key={`${event.id}-${idx}`}
                      className={cn(
                        "flex items-start gap-4 p-4 rounded-lg",
                        "bg-muted/30 hover:bg-muted/50 transition-colors"
                      )}
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                        event.type === "picks_submitted" && "bg-blue-500/10 text-blue-500",
                        event.type === "member_joined" && "bg-green-500/10 text-green-500",
                        event.type === "payment_manually_verified" && "bg-amber-500/10 text-amber-500",
                        event.type === "chat_message_sent" && "bg-purple-500/10 text-purple-500",
                        !["picks_submitted", "member_joined", "payment_manually_verified", "chat_message_sent"].includes(event.type) && "bg-muted text-muted-foreground"
                      )}>
                        {event.type === "picks_submitted" && <Target className="h-5 w-5" />}
                        {event.type === "member_joined" && <Users className="h-5 w-5" />}
                        {event.type === "payment_manually_verified" && <CheckCircle2 className="h-5 w-5" />}
                        {event.type === "chat_message_sent" && <MessageCircle className="h-5 w-5" />}
                        {!["picks_submitted", "member_joined", "payment_manually_verified", "chat_message_sent"].includes(event.type) && <Activity className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{event.league_name}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimeAgo(event.created_at)}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
