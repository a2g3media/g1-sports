import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "@/react-app/config/routes";
import { 
  ArrowLeft, Clock, Filter, Search,
  CheckCircle2, XCircle, MinusCircle, AlertCircle,
  BarChart3, Target, Flame, Plus, RefreshCw, TrendingUp
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/react-app/components/ui/dropdown-menu";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { TrackerPick, TrackerStats, TrackerPickResult } from "@/shared/types";
import { PickShareButton } from "@/react-app/components/PickShareCard";

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-primary/[0.03] rounded-full blur-[100px]" />
    </div>
  );
}

// =====================================================
// HELPERS
// =====================================================

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatLine(line: number | null, type: string): string {
  if (line === null) return "";
  if (type === "TOTAL") return line.toString();
  return line > 0 ? `+${line}` : `${line}`;
}

// =====================================================
// RESULT COMPONENTS - CINEMATIC
// =====================================================

function ResultIcon({ result }: { result: TrackerPickResult }) {
  switch (result) {
    case "WIN":
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case "LOSS":
      return <XCircle className="w-5 h-5 text-red-400" />;
    case "PUSH":
      return <MinusCircle className="w-5 h-5 text-white/40" />;
    case "VOID":
      return <AlertCircle className="w-5 h-5 text-white/40" />;
    default:
      return <Clock className="w-5 h-5 text-amber-400" />;
  }
}

function ResultBadge({ result }: { result: TrackerPickResult }) {
  const variants: Record<TrackerPickResult, { className: string; label: string }> = {
    WIN: { 
      className: "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_0_12px_rgba(52,211,153,0.4)]", 
      label: "Win" 
    },
    LOSS: { 
      className: "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]", 
      label: "Loss" 
    },
    PUSH: { 
      className: "bg-white/10 text-white/60", 
      label: "Push" 
    },
    VOID: { 
      className: "bg-white/10 text-white/60", 
      label: "Void" 
    },
    PENDING: { 
      className: "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.4)]", 
      label: "Pending" 
    },
  };
  
  const variant = variants[result];
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
      variant.className
    )}>
      {variant.label}
    </span>
  );
}

// =====================================================
// STATS SUMMARY - CINEMATIC
// =====================================================

function StatsSummary({ stats }: { stats: TrackerStats }) {
  return (
    <div className={cn(
      "rounded-2xl overflow-hidden",
      "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
      "border border-white/[0.08]",
      "backdrop-blur-xl",
      "shadow-[0_0_40px_rgba(59,130,246,0.1)]"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <h3 className="font-bold text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          Your Performance
        </h3>
      </div>
      
      <div className="p-4">
        {/* Main stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5",
            "border border-emerald-500/20"
          )}>
            <p className="text-3xl font-black text-emerald-400">{stats.wins}</p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Wins</p>
          </div>
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-red-500/10 to-red-500/5",
            "border border-red-500/20"
          )}>
            <p className="text-3xl font-black text-red-400">{stats.losses}</p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Losses</p>
          </div>
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
            "border border-white/[0.08]"
          )}>
            <p className="text-3xl font-black text-white/50">{stats.pushes}</p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Pushes</p>
          </div>
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-amber-500/10 to-amber-500/5",
            "border border-amber-500/20"
          )}>
            <p className="text-3xl font-black text-amber-400">{stats.pending}</p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Pending</p>
          </div>
        </div>
        
        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/[0.06]">
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-white/[0.04] to-white/[0.01]",
            "border border-white/[0.06]"
          )}>
            <p className="text-xl font-black text-white">{stats.win_rate.toFixed(1)}%</p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Win Rate</p>
          </div>
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-white/[0.04] to-white/[0.01]",
            "border border-white/[0.06]"
          )}>
            <p className={cn(
              "text-xl font-black",
              stats.roi > 0 ? "text-emerald-400" : stats.roi < 0 ? "text-red-400" : "text-white"
            )}>
              {stats.roi > 0 ? "+" : ""}{stats.roi.toFixed(1)}%
            </p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">ROI</p>
          </div>
          <div className={cn(
            "text-center p-3 rounded-xl",
            "bg-gradient-to-br from-white/[0.04] to-white/[0.01]",
            "border border-white/[0.06]"
          )}>
            <p className={cn(
              "text-xl font-black",
              stats.units_profit > 0 ? "text-emerald-400" : stats.units_profit < 0 ? "text-red-400" : "text-white"
            )}>
              {stats.units_profit > 0 ? "+" : ""}{stats.units_profit.toFixed(2)}u
            </p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Profit</p>
          </div>
        </div>
        
        {/* Streaks */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Flame className={cn(
              "w-4 h-4",
              stats.current_streak > 0 ? "text-emerald-400" : "text-red-400"
            )} />
            <span className="text-sm font-semibold text-white">
              Current: {stats.current_streak > 0 ? "W" : "L"}{Math.abs(stats.current_streak)}
            </span>
          </div>
          <span className="text-xs text-white/40">
            Best: W{stats.best_streak} | Worst: L{Math.abs(stats.worst_streak)}
          </span>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// PICK CARD - CINEMATIC
// =====================================================

function PickCard({ pick, index }: { pick: TrackerPick; index: number }) {
  const gameTime = new Date(pick.game_start_time);
  const isGraded = pick.result !== "PENDING";
  
  const getPickDescription = () => {
    switch (pick.pick_type) {
      case "SPREAD": {
        const team = pick.pick_side === "HOME" ? pick.home_team : pick.away_team;
        return `${team} ${formatLine(pick.line_value, "SPREAD")}`;
      }
      case "TOTAL":
        return `${pick.pick_side === "OVER" ? "Over" : "Under"} ${pick.line_value}`;
      case "MONEYLINE":
        return `${pick.pick_side === "HOME" ? pick.home_team : pick.away_team} ML`;
    }
  };
  
  return (
    <div
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        "rounded-xl p-4 transition-all duration-300 group",
        "animate-in fade-in slide-in-from-left-3",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
        "border backdrop-blur-xl",
        "hover:-translate-y-0.5 hover:from-white/[0.12] hover:to-white/[0.04]",
        isGraded && pick.result === "WIN" && "border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.1)]",
        isGraded && pick.result === "LOSS" && "border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]",
        !isGraded && "border-white/[0.08]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
            "bg-white/[0.08] text-white/60"
          )}>
            {pick.sport_key}
          </span>
          <span className="text-xs text-white/40 font-medium">
            {gameTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <ResultBadge result={pick.result} />
      </div>
      
      {/* Matchup */}
      <div className="flex items-center gap-3 mb-3">
        <TeamBadge teamName={pick.away_team} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {pick.away_team} @ {pick.home_team}
          </p>
        </div>
        <TeamBadge teamName={pick.home_team} size="sm" />
      </div>
      
      {/* Pick details */}
      <div className={cn(
        "flex items-center justify-between p-3 rounded-lg",
        "bg-gradient-to-r from-white/[0.06] to-white/[0.02]",
        "border border-white/[0.06]"
      )}>
        <div>
          <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-0.5">Your Pick</p>
          <p className="font-bold text-white">{getPickDescription()}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-0.5">Odds</p>
          <p className="font-mono font-bold text-white">{formatOdds(pick.odds_american)}</p>
        </div>
      </div>
      
      {/* Stake and result */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Stake</p>
            <p className="text-sm font-bold text-white">{pick.stake_units}u</p>
          </div>
          {isGraded && pick.result_profit_units !== null && (
            <div>
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">P/L</p>
              <p className={cn(
                "text-sm font-bold",
                pick.result_profit_units > 0 ? "text-emerald-400" : 
                pick.result_profit_units < 0 ? "text-red-400" : "text-white/60"
              )}>
                {pick.result_profit_units > 0 ? "+" : ""}{pick.result_profit_units.toFixed(2)}u
              </p>
            </div>
          )}
        </div>
        <ResultIcon result={pick.result} />
      </div>
      
      {/* Notes and share */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
        {pick.notes ? (
          <p className="text-xs text-white/40 italic flex-1 truncate mr-2">"{pick.notes}"</p>
        ) : (
          <div className="flex-1" />
        )}
        <PickShareButton 
          pick={{
            id: String(pick.id ?? ''),
            homeTeam: pick.home_team,
            awayTeam: pick.away_team,
            sport: pick.sport_key,
            pickType: pick.pick_type,
            pickSide: pick.pick_side,
            lineValue: pick.line_value,
            odds: pick.odds_american,
            result: pick.result === 'VOID' ? 'PUSH' : pick.result,
            gameTime: pick.game_start_time,
            notes: pick.notes ?? undefined,
          }}
          size="sm"
        />
      </div>
    </div>
  );
}

// =====================================================
// FILTER TAB - CINEMATIC
// =====================================================

function FilterTab({ active, onClick, label, count }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 shrink-0",
        active
          ? "bg-gradient-to-r from-primary to-primary/80 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
          : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/70 border border-white/[0.06]"
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn(
          "ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
          active ? "bg-white/20" : "bg-white/[0.08]"
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// =====================================================
// EMPTY STATE - CINEMATIC
// =====================================================

function EmptyState({ filter }: { filter: string }) {
  const messages = {
    all: {
      title: "No picks yet",
      description: "Start tracking your picks to build your history",
    },
    pending: {
      title: "No pending picks",
      description: "All your picks have been graded",
    },
    wins: {
      title: "No wins to show",
      description: "Keep making picks - winners are coming",
    },
    losses: {
      title: "No losses",
      description: "You're on a clean streak!",
    },
  };
  
  const msg = messages[filter as keyof typeof messages] || messages.all;
  
  return (
    <div className="text-center py-16">
      <div className={cn(
        "w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
        "border border-white/[0.1]",
        "shadow-[0_0_40px_rgba(59,130,246,0.1)]"
      )}>
        <Target className="w-9 h-9 text-white/20" />
      </div>
      <h3 className="font-bold text-lg text-white/80 mb-2">{msg.title}</h3>
      <p className="text-sm text-white/40 mb-8">{msg.description}</p>
      <Link to={ROUTES.MY_PICKS}>
        <Button className={cn(
          "gap-2 rounded-xl px-6",
          "bg-gradient-to-r from-primary to-primary/80",
          "shadow-[0_8px_24px_rgba(59,130,246,0.25)]",
          "hover:shadow-[0_12px_32px_rgba(59,130,246,0.35)]"
        )}>
          <Plus className="w-4 h-4" />
          Make a Pick
        </Button>
      </Link>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function MyPicks() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const [picks, setPicks] = useState<TrackerPick[]>([]);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  
  const fetchData = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [picksRes, statsRes] = await Promise.all([
        fetch("/api/tracker/picks", { credentials: "include" }),
        fetch("/api/tracker/stats", { credentials: "include" }),
      ]);
      
      if (!picksRes.ok || !statsRes.ok) {
        throw new Error("Failed to fetch data");
      }
      
      const [picksData, statsData] = await Promise.all([
        picksRes.json(),
        statsRes.json(),
      ]);
      
      setPicks(picksData.picks || []);
      setStats(statsData);
    } catch (err) {
      console.error("Error fetching picks:", err);
      setError("Failed to load your picks. Please try again.");
      setPicks([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, [user]);
  
  const filteredPicks = useMemo(() => {
    let filtered = [...picks];
    
    switch (activeTab) {
      case "pending":
        filtered = filtered.filter(p => p.result === "PENDING");
        break;
      case "graded":
        filtered = filtered.filter(p => p.result !== "PENDING");
        break;
      case "wins":
        filtered = filtered.filter(p => p.result === "WIN");
        break;
      case "losses":
        filtered = filtered.filter(p => p.result === "LOSS");
        break;
    }
    
    if (sportFilter) {
      filtered = filtered.filter(p => p.sport_key.toLowerCase() === sportFilter.toLowerCase());
    }
    
    if (typeFilter) {
      filtered = filtered.filter(p => p.pick_type === typeFilter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.home_team.toLowerCase().includes(q) ||
        p.away_team.toLowerCase().includes(q)
      );
    }
    
    filtered.sort((a, b) => 
      new Date(b.game_start_time).getTime() - new Date(a.game_start_time).getTime()
    );
    
    return filtered;
  }, [picks, activeTab, sportFilter, typeFilter, searchQuery]);
  
  const sports = useMemo(() => {
    const sportSet = new Set(picks.map(p => p.sport_key.toUpperCase()));
    return Array.from(sportSet);
  }, [picks]);
  
  const activeFiltersCount = [sportFilter, typeFilter].filter(Boolean).length;
  
  const tabCounts = useMemo(() => ({
    all: picks.length,
    pending: picks.filter(p => p.result === "PENDING").length,
    graded: picks.filter(p => p.result !== "PENDING").length,
    wins: picks.filter(p => p.result === "WIN").length,
    losses: picks.filter(p => p.result === "LOSS").length,
  }), [picks]);
  
  return (
    <div className="min-h-screen relative -mx-4 -mt-6 px-4 pt-6 pb-24">
      <CinematicBackground />
      
      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]"
              >
                <ArrowLeft className="w-5 h-5 text-white/70" />
              </Button>
              <div>
                <h1 className="font-black text-xl text-white flex items-center gap-2">
                  My Picks
                  <TrendingUp className="w-5 h-5 text-primary" />
                </h1>
                <p className="text-xs text-white/40 font-medium">Track your performance</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={fetchData}
                disabled={loading}
                className="rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]"
              >
                <RefreshCw className={cn("w-4 h-4 text-white/60", loading && "animate-spin")} />
              </Button>
              <Link to={ROUTES.MY_PICKS}>
                <Button size="sm" className={cn(
                  "gap-1.5 rounded-xl",
                  "bg-gradient-to-r from-primary to-primary/80",
                  "shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                )}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New Pick</span>
                </Button>
              </Link>
            </div>
          </div>
        </header>
        
        {/* Stats Summary */}
        {stats && (
          <div className="mb-6">
            <StatsSummary stats={stats} />
          </div>
        )}
        
        {/* Search and filters */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "pl-10 rounded-xl",
                "bg-white/[0.04] border-white/[0.08]",
                "text-white placeholder:text-white/30",
                "focus:border-primary/50 focus:ring-primary/20"
              )}
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className={cn(
                  "relative rounded-xl",
                  "bg-white/[0.04] border-white/[0.08]",
                  "hover:bg-white/[0.08]"
                )}
              >
                <Filter className="w-4 h-4 text-white/60" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sport</DropdownMenuLabel>
              <DropdownMenuItem 
                onClick={() => setSportFilter(null)}
                className={cn(!sportFilter && "bg-accent")}
              >
                All Sports
              </DropdownMenuItem>
              {sports.map(sport => (
                <DropdownMenuItem
                  key={sport}
                  onClick={() => setSportFilter(sport)}
                  className={cn(sportFilter === sport && "bg-accent")}
                >
                  {sport}
                </DropdownMenuItem>
              ))}
              
              <DropdownMenuSeparator />
              
              <DropdownMenuLabel>Pick Type</DropdownMenuLabel>
              <DropdownMenuItem 
                onClick={() => setTypeFilter(null)}
                className={cn(!typeFilter && "bg-accent")}
              >
                All Types
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTypeFilter("SPREAD")}
                className={cn(typeFilter === "SPREAD" && "bg-accent")}
              >
                Spread
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTypeFilter("TOTAL")}
                className={cn(typeFilter === "TOTAL" && "bg-accent")}
              >
                Total
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTypeFilter("MONEYLINE")}
                className={cn(typeFilter === "MONEYLINE" && "bg-accent")}
              >
                Moneyline
              </DropdownMenuItem>
              
              {activeFiltersCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      setSportFilter(null);
                      setTypeFilter(null);
                    }}
                    className="text-red-400"
                  >
                    Clear Filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Result tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 mb-6">
          <FilterTab active={activeTab === "all"} onClick={() => setActiveTab("all")} label="All" count={tabCounts.all} />
          <FilterTab active={activeTab === "pending"} onClick={() => setActiveTab("pending")} label="Pending" count={tabCounts.pending} />
          <FilterTab active={activeTab === "graded"} onClick={() => setActiveTab("graded")} label="Graded" count={tabCounts.graded} />
          <FilterTab active={activeTab === "wins"} onClick={() => setActiveTab("wins")} label="Wins" count={tabCounts.wins} />
          <FilterTab active={activeTab === "losses"} onClick={() => setActiveTab("losses")} label="Losses" count={tabCounts.losses} />
        </div>
        
        {/* Picks list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={cn(
                "rounded-xl p-4 animate-pulse",
                "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
                "border border-white/[0.08]"
              )}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-12 bg-white/10 rounded" />
                  <div className="h-4 w-20 bg-white/10 rounded" />
                </div>
                <div className="h-10 bg-white/10 rounded mb-3" />
                <div className="h-16 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className={cn(
              "w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center",
              "bg-gradient-to-br from-red-500/20 to-red-500/5",
              "border border-red-500/20"
            )}>
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="font-bold text-white/80 mb-2">Error Loading Picks</h3>
            <p className="text-sm text-white/40 mb-4">{error}</p>
            <Button onClick={fetchData} className="rounded-xl">Try Again</Button>
          </div>
        ) : filteredPicks.length === 0 ? (
          <EmptyState filter={activeTab} />
        ) : (
          <div className="space-y-3">
            {filteredPicks.map((pick, index) => (
              <PickCard key={pick.id} pick={pick} index={index} />
            ))}
          </div>
        )}
        
        {/* Summary footer */}
        {filteredPicks.length > 0 && (
          <div className="mt-6 text-center text-sm text-white/30 font-medium">
            Showing {filteredPicks.length} of {picks.length} picks
          </div>
        )}
      </div>
    </div>
  );
}
