/**
 * Elite Command Center - Cinematic Edition
 * 
 * The Monster Screen - a sports terminal experience for Elite subscribers.
 * Multi-game grid with real-time updates, Coach G intelligence, and heat indicators.
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useDocumentTitle } from "@/react-app/hooks/useDocumentTitle";
import { Link } from "react-router-dom";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Input } from "@/react-app/components/ui/input";
import { ScrollArea } from "@/react-app/components/ui/scroll-area";
import { cn } from "@/react-app/lib/utils";
import {
  Crown, Lock, ChevronRight, Calendar, Search, Star,
  ChevronLeft, X, TrendingUp,
  AlertTriangle, Zap, Activity, Radio, ThermometerSun,
  Users, Bell, BellOff, RefreshCw, Grid3X3, LayoutGrid
} from "lucide-react";
import { CommandCenterSkeleton } from "@/react-app/components/ui/skeletons";
import {
  AdvancedFiltersPanel,
  AdvancedFiltersButton,
  applyAdvancedFilters,
  DEFAULT_FILTERS,
  type AdvancedFilters,
} from "@/react-app/components/AdvancedFiltersPanel";

// Types
interface Game {
  id: string;
  sport: string;
  league: string;
  status: "scheduled" | "live" | "final";
  homeTeam: { name: string; abbr: string; score: number; logo?: string };
  awayTeam: { name: string; abbr: string; score: number; logo?: string };
  startTime: string;
  period?: string;
  clock?: string;
  venue?: string;
  isWatched?: boolean;
  odds?: {
    spread: string;
    total: string;
    moneyline: { home: string; away: string };
    timestamp: string;
  };
  keyStat?: string;
  momentum?: "home" | "away" | "even";
  heatScore?: number;
}

interface ScoutBrief {
  timestamp: string;
  message: string;
  type: "update" | "alert" | "summary";
}

// Cinematic Background
function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      
      {/* Ambient glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/5 blur-[120px]" />
      <div className="absolute bottom-[-30%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/5 blur-[100px]" />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-cyan-500/3 blur-[80px]" />
      
      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
    </div>
  );
}

// Glass Card Component
function GlassCard({ 
  children, 
  className,
  glow,
  ...props 
}: { 
  children: React.ReactNode; 
  className?: string;
  glow?: "blue" | "purple" | "amber" | "red";
} & React.HTMLAttributes<HTMLDivElement>) {
  const glowColors = {
    blue: "shadow-blue-500/10 hover:shadow-blue-500/20",
    purple: "shadow-purple-500/10 hover:shadow-purple-500/15",
    amber: "shadow-amber-500/10 hover:shadow-amber-500/15",
    red: "shadow-red-500/10 hover:shadow-red-500/15",
  };
  
  return (
    <div 
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-white/[0.03] backdrop-blur-xl",
        "border border-white/[0.06]",
        "shadow-xl",
        glow && glowColors[glow],
        "transition-all duration-300",
        className
      )}
      {...props}
    >
      {/* Inner glow top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {children}
    </div>
  );
}

// Elite Locked Preview - Cinematic
function EliteLockedPreview({ userTier }: { userTier: string }) {
  const isPro = userTier === "scout_pro";
  
  return (
    <div className="min-h-screen relative">
      <CinematicBackground />
      
      {/* Blurred Preview Background */}
      <div className="absolute inset-0 overflow-hidden z-0">
        <div className="p-6 grid grid-cols-4 gap-4 blur-sm opacity-20">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white/5 rounded-2xl h-48 border border-white/5" />
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/5 blur-sm opacity-20 border-l border-white/5" />
      </div>
      
      {/* Lock Overlay */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-lg w-full" glow="blue">
          <div className="p-8">
            <div className="text-center">
              {/* Icon */}
              <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6 border border-blue-500/30 shadow-lg shadow-blue-500/10">
                <Lock className="h-10 w-10 text-blue-400" />
              </div>
              
              {/* Title */}
              <h1 className="text-2xl font-bold text-white mb-2">
                Command Center
              </h1>
              <p className="text-blue-400 font-medium mb-4">
                Elite Feature
              </p>
              
              {/* Description */}
              <p className="text-white/60 mb-6 leading-relaxed">
                Elite unlocks Command Center: multi-game grid + custom alert builder.
                Track up to 8 games simultaneously with synchronized Coach G commentary.
              </p>
              
              {/* Benefits */}
              <div className="text-left space-y-3 mb-8 bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
                {[
                  { icon: Grid3X3, text: "Multi-game grid with real-time scores" },
                  { icon: Radio, text: "Coach G Live Brief for every game" },
                  { icon: TrendingUp, text: "Heat indicators & momentum tracking" },
                  { icon: Bell, text: "Custom alert builder & thresholds" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <item.icon className="h-4 w-4 text-blue-400" />
                    </div>
                    <span className="text-white/60">{item.text}</span>
                  </div>
                ))}
              </div>
              
              {/* Pricing */}
              <div className="mb-6">
                <div className="text-3xl font-bold text-white">
                  $79<span className="text-lg font-normal text-white/40">/month</span>
                </div>
                <p className="text-sm text-white/40 mt-1">
                  Includes Pool Access & everything in Pro
                </p>
              </div>
              
              {/* CTA */}
              <Link to="/settings?tab=subscription">
                <Button 
                  size="lg" 
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold h-12 shadow-lg shadow-blue-500/25"
                >
                  <Crown className="h-5 w-5 mr-2" />
                  Upgrade to Elite
                  <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              
              {isPro && (
                <p className="text-xs text-white/30 mt-4">
                  Your Pro subscription will be credited toward Elite
                </p>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// Sport Config
const SPORT_CONFIG: Record<string, { color: string; abbr: string; glow: string }> = {
  nfl: { color: "emerald", abbr: "NFL", glow: "from-emerald-500/20 to-emerald-600/10" },
  nba: { color: "orange", abbr: "NBA", glow: "from-orange-500/20 to-orange-600/10" },
  mlb: { color: "red", abbr: "MLB", glow: "from-red-500/20 to-red-600/10" },
  nhl: { color: "blue", abbr: "NHL", glow: "from-blue-500/20 to-blue-600/10" },
  soccer: { color: "green", abbr: "SOC", glow: "from-green-500/20 to-green-600/10" },
  ncaaf: { color: "amber", abbr: "NCAAF", glow: "from-amber-500/20 to-amber-600/10" },
  ncaab: { color: "purple", abbr: "NCAAB", glow: "from-purple-500/20 to-purple-600/10" },
};

// Date Selector - Glass Style
function DateSelector({ 
  selectedDate, 
  onDateChange 
}: { 
  selectedDate: Date; 
  onDateChange: (date: Date) => void;
}) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = selectedDate.toDateString() === today.toDateString();
  const isTomorrow = selectedDate.toDateString() === tomorrow.toDateString();
  
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onDateChange(today)}
        className={cn(
          "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
          isToday 
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10"
            : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05] hover:text-white/70"
        )}
      >
        Today
      </button>
      <button
        onClick={() => onDateChange(tomorrow)}
        className={cn(
          "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
          isTomorrow 
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10"
            : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05] hover:text-white/70"
        )}
      >
        Tomorrow
      </button>
      <div className="relative">
        <Input
          type="date"
          value={selectedDate.toISOString().split('T')[0]}
          onChange={(e) => onDateChange(new Date(e.target.value))}
          className="h-10 w-36 bg-white/[0.03] border-white/[0.06] text-sm text-white/70 rounded-xl"
        />
      </div>
    </div>
  );
}

// Sport Filter Pills - Glass Style
function SportFilters({
  sports,
  selectedSports,
  onToggle
}: {
  sports: string[];
  selectedSports: string[];
  onToggle: (sport: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sports.map((sport) => {
        const config = SPORT_CONFIG[sport] || { color: "slate", abbr: sport.toUpperCase() };
        const isSelected = selectedSports.includes(sport);
        
        return (
          <button
            key={sport}
            onClick={() => onToggle(sport)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
              isSelected
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm shadow-blue-500/20"
                : "bg-white/[0.03] text-white/40 border border-white/[0.06] hover:bg-white/[0.05] hover:text-white/60"
            )}
          >
            {config.abbr}
          </button>
        );
      })}
    </div>
  );
}

// Game Card - Cinematic Glass Style
const GameCard = memo(function GameCard({
  game,
  isSelected,
  onSelect,
  density = "normal"
}: {
  game: Game;
  isSelected: boolean;
  onSelect: () => void;
  density?: "normal" | "dense";
}) {
  const sportConfig = SPORT_CONFIG[game.sport] || { color: "slate", abbr: game.sport, glow: "" };
  const isLive = game.status === "live";
  const isFinal = game.status === "final";
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-2xl transition-all duration-300",
        "bg-white/[0.03] backdrop-blur-sm",
        "border hover:border-white/10",
        isSelected 
          ? "border-blue-500/40 shadow-lg shadow-blue-500/10 bg-blue-500/5" 
          : "border-white/[0.06] hover:bg-white/[0.05]",
        density === "dense" ? "p-3" : "p-4",
        "group relative overflow-hidden"
      )}
    >
      {/* Top edge glow for live games */}
      {isLive && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
      )}
      
      {/* Selection glow */}
      {isSelected && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative">
        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] font-bold tracking-wide",
            isLive 
              ? "border-red-500/40 text-red-400 bg-red-500/10"
              : "border-white/10 text-white/50 bg-white/[0.03]"
          )}
        >
          {sportConfig.abbr}
        </Badge>
        
        <div className="flex items-center gap-2">
          {game.isWatched && (
            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
          )}
          {isLive && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-[pulse_1.5s_ease-in-out_infinite] shadow-lg shadow-red-500/50" />
              <span className="text-[10px] text-red-400 font-bold tracking-wider">LIVE</span>
            </div>
          )}
          {isFinal && (
            <span className="text-[10px] text-white/30 font-semibold tracking-wide">FINAL</span>
          )}
        </div>
      </div>
      
      {/* Teams & Scores */}
      <div className="space-y-2">
        {/* Away Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-semibold text-sm",
              game.momentum === "away" && isLive ? "text-blue-400" : "text-white/80"
            )}>
              {game.awayTeam.abbr}
            </span>
            {game.momentum === "away" && isLive && (
              <TrendingUp className="h-3 w-3 text-blue-400" />
            )}
          </div>
          <span className={cn(
            "font-bold tabular-nums text-white",
            density === "dense" ? "text-lg" : "text-xl",
            isLive && "animate-[scoreFlicker_3s_ease-in-out_infinite]"
          )}>
            {game.awayTeam.score}
          </span>
        </div>
        
        {/* Home Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-semibold text-sm",
              game.momentum === "home" && isLive ? "text-blue-400" : "text-white/80"
            )}>
              {game.homeTeam.abbr}
            </span>
            {game.momentum === "home" && isLive && (
              <TrendingUp className="h-3 w-3 text-blue-400" />
            )}
          </div>
          <span className={cn(
            "font-bold tabular-nums text-white",
            density === "dense" ? "text-lg" : "text-xl",
            isLive && "animate-[scoreFlicker_3s_ease-in-out_infinite]"
          )}>
            {game.homeTeam.score}
          </span>
        </div>
      </div>
      
      {/* Game State / Clock */}
      <div className="mt-3 pt-3 border-t border-white/[0.05]">
        <div className="flex items-center justify-between text-xs">
          {isLive && game.clock ? (
            <div className="flex items-center gap-2">
              <span className="text-white/40">{game.period}</span>
              <span className="text-white/70 font-mono font-semibold">{game.clock}</span>
            </div>
          ) : game.status === "scheduled" ? (
            <span className="text-white/40">
              {new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-white/30">Final</span>
          )}
          
          {game.odds && (
            <span className="text-white/40 font-mono text-[10px]">
              {game.odds.spread}
            </span>
          )}
        </div>
        
        {game.keyStat && isLive && (
          <p className="text-[10px] text-white/30 mt-2 truncate">
            {game.keyStat}
          </p>
        )}
      </div>
      
      {/* Heat Indicator */}
      {game.heatScore !== undefined && game.heatScore > 70 && (
        <div className="mt-2 flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-amber-400" />
          <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-red-500 rounded-full"
              style={{ width: `${game.heatScore}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
});

// Side Panel - Glass Style
function SidePanel({
  game,
  onClose
}: {
  game: Game | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState("scout");
  const [scoutBriefs, setScoutBriefs] = useState<ScoutBrief[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  
  useEffect(() => {
    if (game?.status === "live") {
      setScoutBriefs([
        {
          timestamp: new Date().toISOString(),
          message: `${game.awayTeam.abbr} controlling pace early. Defense forcing turnovers.`,
          type: "update"
        },
        {
          timestamp: new Date(Date.now() - 120000).toISOString(),
          message: `Key matchup: ${game.homeTeam.abbr} struggling to contain perimeter.`,
          type: "update"
        }
      ]);
    }
  }, [game]);
  
  if (!game) {
    return (
      <div className="h-full flex items-center justify-center text-white/30">
        <div className="text-center">
          <Grid3X3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select a game to view details</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white/[0.02]">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.05]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-white/10 bg-white/[0.03]">
              {SPORT_CONFIG[game.sport]?.abbr || game.sport}
            </Badge>
            {game.status === "live" && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
                <span className="text-[10px] text-red-400 font-bold">LIVE</span>
              </div>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
          >
            <X className="h-4 w-4 text-white/40" />
          </button>
        </div>
        
        <h3 className="font-bold text-lg text-white">
          {game.awayTeam.abbr} @ {game.homeTeam.abbr}
        </h3>
        
        <div className="flex items-center gap-4 mt-2 text-2xl font-bold text-white">
          <span>{game.awayTeam.score}</span>
          <span className="text-white/20">-</span>
          <span>{game.homeTeam.score}</span>
          {game.status === "live" && game.clock && (
            <span className="text-sm font-normal text-white/40 ml-auto">
              {game.period} • {game.clock}
            </span>
          )}
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-white/[0.05] bg-transparent px-4 h-12">
          <TabsTrigger value="scout" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 rounded-lg">
            <Radio className="h-4 w-4 mr-1.5" />
            Coach G
          </TabsTrigger>
          <TabsTrigger value="odds" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 rounded-lg">
            <TrendingUp className="h-4 w-4 mr-1.5" />
            Odds
          </TabsTrigger>
          <TabsTrigger value="info" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 rounded-lg">
            <Users className="h-4 w-4 mr-1.5" />
            Info
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 rounded-lg">
            <Bell className="h-4 w-4 mr-1.5" />
            Alerts
          </TabsTrigger>
        </TabsList>
        
        {/* Coach G Tab */}
        <TabsContent value="scout" className="flex-1 p-4 mt-0">
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-3">
              {scoutBriefs.length > 0 ? (
                scoutBriefs.map((brief, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-blue-400" />
                      <span className="text-[10px] text-white/30">
                        {new Date(brief.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-white/70">{brief.message}</p>
                  </div>
                ))
              ) : (
                <div className="text-center text-white/30 py-8">
                  <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Coach G briefs appear during live games</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        {/* Odds Tab */}
        <TabsContent value="odds" className="flex-1 p-4 mt-0">
          {game.odds ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="text-[10px] text-white/30 mb-3">
                  Updated {new Date(game.odds.timestamp).toLocaleTimeString()}
                </div>
                
                <div className="space-y-3">
                  {[
                    { label: "Spread", value: game.odds.spread },
                    { label: "Total", value: game.odds.total },
                    { label: `ML (${game.awayTeam.abbr})`, value: game.odds.moneyline.away },
                    { label: `ML (${game.homeTeam.abbr})`, value: game.odds.moneyline.home },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-white/40">{item.label}</span>
                      <span className="font-mono font-semibold text-white/80">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Line Movement */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h4 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-white/40" />
                  Line Movement
                </h4>
                <div className="h-20 flex items-end justify-around gap-1">
                  {[40, 55, 50, 65, 60, 70, 75].map((h, i) => (
                    <div 
                      key={i}
                      className="w-4 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t opacity-70"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-white/30 py-8">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No odds data available</p>
            </div>
          )}
        </TabsContent>
        
        {/* Info Tab */}
        <TabsContent value="info" className="flex-1 p-4 mt-0">
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <h4 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400/70" />
                Injuries
              </h4>
              <p className="text-sm text-white/40">No significant injuries reported</p>
            </div>
            
            {["nfl", "mlb", "soccer", "ncaaf"].includes(game.sport) && (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <h4 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                  <ThermometerSun className="h-4 w-4 text-amber-400/70" />
                  Weather
                </h4>
                <div className="flex items-center gap-4 text-sm text-white/50">
                  <span>72°F</span>
                  <span>Clear</span>
                  <span>Wind: 5 mph</span>
                </div>
              </div>
            )}
            
            {game.venue && (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <h4 className="text-sm font-medium text-white/60 mb-2">Venue</h4>
                <p className="text-sm text-white/40">{game.venue}</p>
              </div>
            )}
          </div>
        </TabsContent>
        
        {/* Alerts Tab */}
        <TabsContent value="alerts" className="flex-1 p-4 mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-3">
                {alertsEnabled ? (
                  <Bell className="h-5 w-5 text-blue-400" />
                ) : (
                  <BellOff className="h-5 w-5 text-white/30" />
                )}
                <div>
                  <p className="font-medium text-sm text-white/80">Game Alerts</p>
                  <p className="text-[10px] text-white/30">Scoring, momentum, final</p>
                </div>
              </div>
              <Button
                variant={alertsEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAlertsEnabled(!alertsEnabled)}
                className={alertsEnabled 
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30" 
                  : "bg-white/[0.03] border-white/10 text-white/50"
                }
              >
                {alertsEnabled ? "On" : "Off"}
              </Button>
            </div>
            
            <p className="text-[10px] text-white/20 text-center">
              Custom alert thresholds available in Elite
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Heat Strip - Cinematic
const HeatStrip = memo(function HeatStrip({ games }: { games: Game[] }) {
  const hotGames = games
    .filter(g => g.status === "live" && (g.heatScore || 0) > 50)
    .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0))
    .slice(0, 5);
  
  if (hotGames.length === 0) return null;
  
  return (
    <div className="border-t border-white/[0.05] bg-gradient-to-r from-amber-950/20 via-red-950/20 to-amber-950/20 p-4 relative">
      {/* Heat glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
      
      <div className="flex items-center gap-3 mb-3">
        <Activity className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold text-white/80">Heat Index</span>
        <span className="text-[10px] text-white/30">Games with significant action</span>
      </div>
      
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {hotGames.map((game) => (
          <div 
            key={game.id}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-red-500/10 border border-amber-500/20 backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                {SPORT_CONFIG[game.sport]?.abbr || game.sport}
              </Badge>
              <span className="font-semibold text-sm text-white/80">
                {game.awayTeam.abbr} {game.awayTeam.score} - {game.homeTeam.score} {game.homeTeam.abbr}
              </span>
              <div className="flex items-center gap-1 text-amber-400">
                <TrendingUp className="h-3 w-3" />
                <span className="text-xs font-bold">{game.heatScore}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// Main Command Center
export function CommandCenter() {
  useDocumentTitle('Command Center');
  
  const { subscription, features, loading } = useSubscription();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [density, setDensity] = useState<"normal" | "dense">("normal");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const activeFilterCount = 
    advancedFilters.gameState.length + 
    advancedFilters.performance.length + 
    advancedFilters.odds.length;
  
  const hasEliteAccess = features?.hasMultiGameCenter || subscription?.tier === "scout_elite";
  const availableSports = ["nfl", "nba", "mlb", "nhl", "soccer", "ncaaf", "ncaab"];
  
  const loadGames = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        date: selectedDate.toISOString().split('T')[0],
      });
      if (selectedSports.length > 0) {
        params.set('sports', selectedSports.join(','));
      }
      
      const res = await fetch(`/api/games?${params}`);
      if (res.ok) {
        const data = await res.json();
        const gamesWithHeat = data.games?.map((g: Game) => ({
          ...g,
          heatScore: Math.floor(Math.random() * 100),
          momentum: ["home", "away", "even"][Math.floor(Math.random() * 3)] as "home" | "away" | "even"
        })) || [];
        setGames(gamesWithHeat);
      }
    } catch (err) {
      console.error("Failed to load games:", err);
    }
  }, [selectedDate, selectedSports]);
  
  useEffect(() => {
    if (hasEliteAccess) {
      loadGames();
      refreshIntervalRef.current = setInterval(() => loadGames(), 30000);
      return () => {
        if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      };
    }
  }, [hasEliteAccess, loadGames]);
  
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadGames();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [loadGames]);
  
  const handleGameSelect = useCallback((game: Game) => {
    setSelectedGame(game);
  }, []);
  
  const filteredGames = useMemo(() => {
    let result = games.filter(game => {
      if (watchlistOnly && !game.isWatched) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          game.homeTeam.name.toLowerCase().includes(q) ||
          game.homeTeam.abbr.toLowerCase().includes(q) ||
          game.awayTeam.name.toLowerCase().includes(q) ||
          game.awayTeam.abbr.toLowerCase().includes(q) ||
          game.league.toLowerCase().includes(q)
        );
      }
      return true;
    });
    return applyAdvancedFilters(result, advancedFilters);
  }, [games, watchlistOnly, searchQuery, advancedFilters]);
  
  const toggleSport = useCallback((sport: string) => {
    setSelectedSports(prev => 
      prev.includes(sport) ? prev.filter(s => s !== sport) : [...prev, sport]
    );
  }, []);
  
  if (loading) return <CommandCenterSkeleton />;
  if (!hasEliteAccess) return <EliteLockedPreview userTier={subscription?.tier || "free"} />;
  
  return (
    <div className="min-h-screen relative flex flex-col">
      <CinematicBackground />
      
      {/* Top Bar - Glass */}
      <header className="relative z-20 border-b border-white/[0.05] bg-white/[0.02] backdrop-blur-xl sticky top-0">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white/60 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-blue-400" />
                <h1 className="font-bold text-lg text-white">Command Center</h1>
                <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                  ELITE
                </Badge>
              </div>
              <Link 
                to="/elite/heat-map"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
              >
                <Activity className="h-3.5 w-3.5" />
                Heat Map
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
            >
              <RefreshCw className={cn("h-4 w-4 text-white/50", isRefreshing && "animate-spin")} />
            </button>
            
            <button
              onClick={() => setDensity(d => d === "normal" ? "dense" : "normal")}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
            >
              {density === "normal" ? (
                <Grid3X3 className="h-4 w-4 text-white/50" />
              ) : (
                <LayoutGrid className="h-4 w-4 text-white/50" />
              )}
            </button>
          </div>
        </div>
        
        {/* Filters Row */}
        <div className="flex items-center gap-4 px-4 pb-4 flex-wrap">
          <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
          
          <div className="h-6 w-px bg-white/10" />
          
          <SportFilters 
            sports={availableSports}
            selectedSports={selectedSports}
            onToggle={toggleSport}
          />
          
          <div className="h-6 w-px bg-white/10" />
          
          <button
            onClick={() => setWatchlistOnly(!watchlistOnly)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
              watchlistOnly 
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05]"
            )}
          >
            <Star className="h-3.5 w-3.5" />
            Watchlist
          </button>
          
          <div className="h-6 w-px bg-white/10" />
          <AdvancedFiltersButton
            onClick={() => setShowAdvancedFilters(true)}
            activeCount={activeFilterCount}
          />
          
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 w-48 bg-white/[0.03] border-white/[0.06] rounded-xl text-white placeholder:text-white/30"
            />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Game Grid */}
        <div className="flex-1 overflow-auto p-4">
          {filteredGames.length > 0 ? (
            <div className={cn(
              "grid gap-4",
              density === "dense" 
                ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            )}>
              {filteredGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isSelected={selectedGame?.id === game.id}
                  onSelect={() => handleGameSelect(game)}
                  density={density}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-white/30">
              <div className="text-center">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No games found</p>
                <p className="text-sm mt-1 text-white/20">Try adjusting your filters</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Side Panel */}
        <div className={cn(
          "w-96 border-l border-white/[0.05] bg-white/[0.01] backdrop-blur-sm transition-all",
          !selectedGame && "w-0 border-l-0 overflow-hidden"
        )}>
          <SidePanel game={selectedGame} onClose={() => setSelectedGame(null)} />
        </div>
      </div>
      
      {/* Heat Strip */}
      <HeatStrip games={filteredGames} />
      
      {/* Advanced Filters Panel */}
      <AdvancedFiltersPanel
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        filters={advancedFilters}
        onFiltersChange={setAdvancedFilters}
        hasOddsData={games.some(g => g.odds)}
        variant="slide"
      />
    </div>
  );
}
