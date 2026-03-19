/**
 * Elite League-Wide Heat Map
 * 
 * Visual display of "where the action is" across all games.
 * Heat score based on: tempo, score differential, clutch time, odds movement.
 * Elite-only with locked preview for Pro/Free users.
 */

import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { useDataHub } from "@/react-app/hooks/useDataHub";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { Input } from "@/react-app/components/ui/input";
import { ScrollArea } from "@/react-app/components/ui/scroll-area";
import { Switch } from "@/react-app/components/ui/switch";
import { cn } from "@/react-app/lib/utils";
import {
  Crown, ChevronRight, Calendar, Star,
  ChevronLeft, X, TrendingUp,
  AlertTriangle, Zap, Radio, ThermometerSun,
  Users, Bell, BellOff, RefreshCw, Flame, Activity
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

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
    spreadMove?: number;
    totalMove?: number;
  };
  keyStat?: string;
  momentum?: "home" | "away" | "even";
  heatScore?: number;
  heatFactors?: HeatFactors;
}

interface HeatFactors {
  tempo: number;      // 0-25: period/time weight
  closeness: number;  // 0-25: score differential weight
  clutch: number;     // 0-25: late-game close situation
  movement: number;   // 0-25: odds movement (if available)
}

interface ScoutBrief {
  timestamp: string;
  message: string;
  type: "update" | "alert" | "summary";
}

// =============================================================================
// Heat Score Calculator
// =============================================================================

/**
 * Heat Score Formula (0-100):
 * - Tempo (0-25): Later periods = hotter
 * - Closeness (0-25): Smaller differential = hotter (sport-aware thresholds)
 * - Clutch (0-25): Final 2 min of close games = very hot
 * - Movement (0-25): Line/total movement if odds data available
 */

const CLOSE_GAME_THRESHOLDS: Record<string, number> = {
  nfl: 7,
  ncaaf: 7,
  nba: 6,
  ncaab: 6,
  nhl: 2,
  mlb: 2,
  soccer: 1,
};

const BLOWOUT_THRESHOLDS: Record<string, number> = {
  nfl: 21,
  ncaaf: 21,
  nba: 20,
  ncaab: 20,
  nhl: 4,
  mlb: 6,
  soccer: 3,
};

function calculateHeatScore(game: Game): { score: number; factors: HeatFactors } {
  const sport = game.sport.toLowerCase();
  const closeThreshold = CLOSE_GAME_THRESHOLDS[sport] || 7;
  const blowoutThreshold = BLOWOUT_THRESHOLDS[sport] || 21;
  const diff = Math.abs(game.homeTeam.score - game.awayTeam.score);
  
  // Tempo score (0-25): based on game progress
  let tempo = 0;
  if (game.status === "live") {
    const period = game.period?.toLowerCase() || "";
    if (period.includes("4th") || period.includes("9th") || period.includes("3rd") && sport === "nhl") {
      tempo = 25; // Final period
    } else if (period.includes("3rd") || period.includes("7th") || period.includes("8th") || period.includes("2nd") && sport === "soccer") {
      tempo = 20;
    } else if (period.includes("2nd") || period.includes("5th") || period.includes("6th")) {
      tempo = 15;
    } else if (period.includes("ot") || period.includes("extra")) {
      tempo = 25; // Overtime is hot
    } else {
      tempo = 10; // Early game
    }
  } else if (game.status === "final") {
    tempo = 5; // Finals are cooler
  }
  
  // Closeness score (0-25): based on score differential
  let closeness = 0;
  if (diff <= closeThreshold) {
    closeness = 25; // Very close
  } else if (diff <= closeThreshold * 2) {
    closeness = 18;
  } else if (diff <= blowoutThreshold) {
    closeness = 10;
  } else {
    closeness = 2; // Blowout
  }
  
  // Clutch score (0-25): late game + close = maximum heat
  let clutch = 0;
  if (game.status === "live" && diff <= closeThreshold) {
    const clock = game.clock || "";
    const period = game.period?.toLowerCase() || "";
    const isFinalPeriod = period.includes("4th") || period.includes("9th") || 
                          (period.includes("3rd") && sport === "nhl") ||
                          (period.includes("2nd") && sport === "soccer");
    
    // Parse clock for final 5 minutes
    const clockMatch = clock.match(/(\d+):(\d+)/);
    if (clockMatch && isFinalPeriod) {
      const minutes = parseInt(clockMatch[1]);
      if (minutes <= 2) {
        clutch = 25; // Crunch time
      } else if (minutes <= 5) {
        clutch = 18;
      } else {
        clutch = 10;
      }
    }
    
    // Overtime always clutch
    if (period.includes("ot") || period.includes("extra")) {
      clutch = 25;
    }
  }
  
  // Movement score (0-25): odds movement if available
  let movement = 0;
  if (game.odds) {
    const spreadMove = Math.abs(game.odds.spreadMove || 0);
    const totalMove = Math.abs(game.odds.totalMove || 0);
    
    if (spreadMove >= 2 || totalMove >= 3) {
      movement = 25; // Significant movement
    } else if (spreadMove >= 1 || totalMove >= 2) {
      movement = 15;
    } else if (spreadMove > 0 || totalMove > 0) {
      movement = 8;
    }
  } else {
    // No odds data - redistribute points to other factors
    movement = 0;
  }
  
  const factors: HeatFactors = { tempo, closeness, clutch, movement };
  const total = tempo + closeness + clutch + movement;
  
  // Normalize if no odds data (max becomes 75, scale to 100)
  const maxPossible = game.odds ? 100 : 75;
  const score = Math.min(100, Math.round((total / maxPossible) * 100));
  
  return { score, factors };
}

// =============================================================================
// Sport Config
// =============================================================================

const SPORT_CONFIG: Record<string, { color: string; abbr: string; name: string }> = {
  nfl: { color: "emerald", abbr: "NFL", name: "Football" },
  nba: { color: "orange", abbr: "NBA", name: "Basketball" },
  mlb: { color: "red", abbr: "MLB", name: "Baseball" },
  nhl: { color: "blue", abbr: "NHL", name: "Hockey" },
  soccer: { color: "green", abbr: "SOC", name: "Soccer" },
  ncaaf: { color: "amber", abbr: "NCAAF", name: "College Football" },
  ncaab: { color: "purple", abbr: "NCAAB", name: "College Basketball" },
};

// =============================================================================
// Heat Color Utilities
// =============================================================================

function getHeatColor(score: number): string {
  if (score >= 80) return "from-red-600 to-orange-500"; // Hot
  if (score >= 60) return "from-orange-500 to-amber-500"; // Warm
  if (score >= 40) return "from-amber-500 to-yellow-500"; // Moderate
  if (score >= 20) return "from-yellow-500 to-lime-500"; // Cool
  return "from-lime-500 to-cyan-500"; // Cold
}

function getHeatBorderColor(score: number): string {
  if (score >= 80) return "border-red-500/60";
  if (score >= 60) return "border-orange-500/50";
  if (score >= 40) return "border-amber-500/40";
  if (score >= 20) return "border-yellow-500/30";
  return "border-cyan-500/20";
}

function getHeatGlow(score: number): string {
  if (score >= 80) return "shadow-red-500/30";
  if (score >= 60) return "shadow-orange-500/20";
  if (score >= 40) return "shadow-amber-500/15";
  return "";
}

// =============================================================================
// Elite Locked Preview
// =============================================================================

function EliteLockedPreview({ userTier }: { userTier: string }) {
  const isPro = userTier === "scout_pro";
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Blurred Preview Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 via-orange-500/5 to-amber-500/5" />
        
        {/* Fake heat tiles - blurred */}
        <div className="p-6 grid grid-cols-5 gap-4 blur-sm opacity-40">
          {Array.from({ length: 15 }).map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "rounded-xl h-32 border",
                i % 5 === 0 ? "bg-gradient-to-br from-red-600/30 to-orange-500/30 border-red-500/30" :
                i % 3 === 0 ? "bg-gradient-to-br from-orange-500/30 to-amber-500/30 border-orange-500/30" :
                "bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border-amber-500/20"
              )}
            />
          ))}
        </div>
      </div>
      
      {/* Lock Overlay */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-lg w-full bg-slate-900/95 border-orange-500/30 shadow-2xl shadow-orange-500/10">
          <CardContent className="p-8">
            <div className="text-center">
              {/* Icon */}
              <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/20 via-orange-500/20 to-amber-500/20 flex items-center justify-center mb-6 border border-orange-500/30">
                <Flame className="h-10 w-10 text-orange-400" />
              </div>
              
              {/* Title */}
              <h1 className="text-2xl font-bold text-white mb-2">
                Heat Map
              </h1>
              <p className="text-orange-300 font-medium mb-4">
                Elite Feature
              </p>
              
              {/* Description */}
              <p className="text-slate-400 mb-6 leading-relaxed">
                See where the action is at a glance. The Heat Map shows real-time game intensity 
                across all leagues—close games, clutch moments, and momentum swings highlighted instantly.
              </p>
              
              {/* Heat Legend Preview */}
              <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 mb-3">Heat Scale</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 rounded-full bg-gradient-to-r from-cyan-500 via-lime-500 via-yellow-500 via-amber-500 via-orange-500 to-red-500" />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Cold</span>
                  <span>Hot</span>
                </div>
              </div>
              
              {/* Benefits */}
              <div className="text-left space-y-3 mb-8 bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <Flame className="h-4 w-4 text-red-400" />
                  </div>
                  <span className="text-slate-300">Real-time heat scoring across all games</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-orange-400" />
                  </div>
                  <span className="text-slate-300">Clutch time &amp; momentum detection</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-amber-400" />
                  </div>
                  <span className="text-slate-300">Odds movement heat factor (when available)</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Radio className="h-4 w-4 text-violet-400" />
                  </div>
                  <span className="text-slate-300">Scout brief on tap for any game</span>
                </div>
              </div>
              
              {/* Pricing */}
              <div className="mb-6">
                <div className="text-3xl font-bold text-white">
                  $79<span className="text-lg font-normal text-slate-400">/month</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Includes Command Center, Custom Alerts &amp; Pool Access
                </p>
              </div>
              
              {/* CTA */}
              <Link to="/settings?tab=subscription">
                <Button 
                  size="lg" 
                  className="w-full bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white font-semibold h-12"
                >
                  <Crown className="h-5 w-5 mr-2" />
                  Upgrade to Elite
                  <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
              
              {isPro && (
                <p className="text-xs text-slate-500 mt-4">
                  Your Pro subscription will be credited toward Elite
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// Date Selector
// =============================================================================

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
      <Button
        variant={isToday ? "default" : "outline"}
        size="sm"
        onClick={() => onDateChange(today)}
        className={cn("h-8", isToday && "bg-orange-600 hover:bg-orange-500")}
      >
        Today
      </Button>
      <Button
        variant={isTomorrow ? "default" : "outline"}
        size="sm"
        onClick={() => onDateChange(tomorrow)}
        className={cn("h-8", isTomorrow && "bg-orange-600 hover:bg-orange-500")}
      >
        Tomorrow
      </Button>
      <div className="relative">
        <Input
          type="date"
          value={selectedDate.toISOString().split('T')[0]}
          onChange={(e) => onDateChange(new Date(e.target.value))}
          className="h-8 w-36 bg-slate-800/50 border-slate-700 text-sm"
        />
      </div>
    </div>
  );
}

// =============================================================================
// Sport Filter Chips
// =============================================================================

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
        const config = SPORT_CONFIG[sport] || { abbr: sport.toUpperCase() };
        const isSelected = selectedSports.length === 0 || selectedSports.includes(sport);
        
        return (
          <button
            key={sport}
            onClick={() => onToggle(sport)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
              isSelected
                ? "bg-orange-500/20 text-orange-300 border border-orange-500/50"
                : "bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:border-slate-600"
            )}
          >
            {config.abbr}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Heat Legend
// =============================================================================

function HeatLegend() {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
      <span className="text-xs text-slate-500">Heat:</span>
      <div className="flex items-center gap-1">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-500 to-lime-500" />
        <span className="text-xs text-slate-400">Cold</span>
      </div>
      <div className="w-12 h-2 rounded-full bg-gradient-to-r from-cyan-500 via-lime-500 via-yellow-500 via-amber-500 via-orange-500 to-red-500" />
      <div className="flex items-center gap-1">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-red-600 to-orange-500" />
        <span className="text-xs text-slate-400">Hot</span>
      </div>
    </div>
  );
}

// =============================================================================
// Heat Tile
// =============================================================================

function HeatTile({
  game,
  isSelected,
  onSelect
}: {
  game: Game;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const score = game.heatScore || 0;
  const sportConfig = SPORT_CONFIG[game.sport] || { abbr: game.sport };
  const isLive = game.status === "live";
  const isFinal = game.status === "final";
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative w-full text-left rounded-xl border transition-all duration-300 p-4",
        "hover:scale-[1.02] hover:z-10",
        getHeatBorderColor(score),
        isSelected && "ring-2 ring-white/30 scale-[1.02]",
        score >= 60 && "shadow-lg",
        getHeatGlow(score)
      )}
      style={{
        background: `linear-gradient(135deg, rgba(15,23,42,0.9), rgba(15,23,42,0.95))`,
      }}
    >
      {/* Heat Glow Overlay */}
      <div 
        className={cn(
          "absolute inset-0 rounded-xl opacity-20 transition-opacity",
          `bg-gradient-to-br ${getHeatColor(score)}`
        )}
      />
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs font-semibold",
              isLive && "border-red-500/50 text-red-400 bg-red-500/10"
            )}
          >
            {sportConfig.abbr}
          </Badge>
          
          <div className="flex items-center gap-2">
            {game.isWatched && (
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            )}
            {isLive && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400 font-medium">LIVE</span>
              </div>
            )}
            {isFinal && (
              <span className="text-xs text-slate-500 font-medium">FINAL</span>
            )}
          </div>
        </div>
        
        {/* Teams & Scores */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm truncate max-w-[100px]">
              {game.awayTeam.abbr}
            </span>
            <span className="font-bold text-lg tabular-nums">
              {game.awayTeam.score}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm truncate max-w-[100px]">
              {game.homeTeam.abbr}
            </span>
            <span className="font-bold text-lg tabular-nums">
              {game.homeTeam.score}
            </span>
          </div>
        </div>
        
        {/* Game State */}
        <div className="mt-3 pt-2 border-t border-slate-700/30">
          <div className="flex items-center justify-between">
            {isLive && game.clock ? (
              <span className="text-xs text-slate-400">
                {game.period} • {game.clock}
              </span>
            ) : game.status === "scheduled" ? (
              <span className="text-xs text-slate-400">
                {new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            ) : (
              <span className="text-xs text-slate-500">Final</span>
            )}
          </div>
        </div>
        
        {/* Heat Bar */}
        <div className="mt-2 flex items-center gap-2">
          <Flame className={cn(
            "h-3 w-3 transition-colors",
            score >= 80 ? "text-red-400" :
            score >= 60 ? "text-orange-400" :
            score >= 40 ? "text-amber-400" :
            score >= 20 ? "text-yellow-400" :
            "text-cyan-400"
          )} />
          <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
            <div 
              className={cn("h-full rounded-full transition-all", `bg-gradient-to-r ${getHeatColor(score)}`)}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-bold tabular-nums",
            score >= 80 ? "text-red-400" :
            score >= 60 ? "text-orange-400" :
            score >= 40 ? "text-amber-400" :
            "text-slate-400"
          )}>
            {score}
          </span>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Context Drawer (Side Panel)
// =============================================================================

function ContextDrawer({
  game,
  onClose
}: {
  game: Game | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState("scout");
  const [scoutBriefs, setScoutBriefs] = useState<ScoutBrief[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  
  // Simulated Scout briefs
  useEffect(() => {
    if (game?.status === "live") {
      const diff = Math.abs(game.homeTeam.score - game.awayTeam.score);
      const closeThreshold = CLOSE_GAME_THRESHOLDS[game.sport] || 7;
      
      const briefs: ScoutBrief[] = [];
      
      if (diff <= closeThreshold) {
        briefs.push({
          timestamp: new Date().toISOString(),
          message: `Tight contest—${game.awayTeam.abbr} and ${game.homeTeam.abbr} separated by just ${diff}. Intensity picking up.`,
          type: "update"
        });
      }
      
      if (game.heatScore && game.heatScore >= 70) {
        briefs.push({
          timestamp: new Date(Date.now() - 60000).toISOString(),
          message: `High heat index (${game.heatScore}) — this game is generating significant action.`,
          type: "alert"
        });
      }
      
      if (game.heatFactors?.clutch && game.heatFactors.clutch >= 20) {
        briefs.push({
          timestamp: new Date(Date.now() - 120000).toISOString(),
          message: `Entering crunch time. Decision points coming up.`,
          type: "update"
        });
      }
      
      setScoutBriefs(briefs.length > 0 ? briefs : [
        {
          timestamp: new Date().toISOString(),
          message: `${game.awayTeam.abbr} vs ${game.homeTeam.abbr} in progress. Monitoring for key moments.`,
          type: "update"
        }
      ]);
    } else {
      setScoutBriefs([]);
    }
  }, [game]);
  
  if (!game) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center px-6">
          <Flame className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Select a game</p>
          <p className="text-sm mt-1">Tap any tile to see details and Scout brief</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {SPORT_CONFIG[game.sport]?.abbr || game.sport}
            </Badge>
            {game.status === "live" && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400">LIVE</span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <h3 className="font-bold text-lg">
          {game.awayTeam.abbr} @ {game.homeTeam.abbr}
        </h3>
        
        <div className="flex items-center gap-4 mt-2 text-2xl font-bold">
          <span>{game.awayTeam.score}</span>
          <span className="text-slate-500">-</span>
          <span>{game.homeTeam.score}</span>
          {game.status === "live" && game.clock && (
            <span className="text-sm font-normal text-slate-400 ml-auto">
              {game.period} • {game.clock}
            </span>
          )}
        </div>
        
        {/* Heat Score Breakdown */}
        {game.heatFactors && (
          <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Heat Score</span>
              <span className={cn(
                "font-bold",
                (game.heatScore || 0) >= 80 ? "text-red-400" :
                (game.heatScore || 0) >= 60 ? "text-orange-400" :
                (game.heatScore || 0) >= 40 ? "text-amber-400" :
                "text-slate-400"
              )}>
                {game.heatScore}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="text-slate-500">Tempo</div>
                <div className="font-semibold">{game.heatFactors.tempo}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500">Close</div>
                <div className="font-semibold">{game.heatFactors.closeness}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500">Clutch</div>
                <div className="font-semibold">{game.heatFactors.clutch}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500">Move</div>
                <div className="font-semibold">{game.heatFactors.movement}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-slate-700/50 bg-transparent px-4">
          <TabsTrigger value="scout" className="data-[state=active]:bg-orange-500/20">
            <Radio className="h-4 w-4 mr-1.5" />
            Scout
          </TabsTrigger>
          <TabsTrigger value="odds" className="data-[state=active]:bg-orange-500/20">
            <TrendingUp className="h-4 w-4 mr-1.5" />
            Odds
          </TabsTrigger>
          <TabsTrigger value="info" className="data-[state=active]:bg-orange-500/20">
            <Users className="h-4 w-4 mr-1.5" />
            Info
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-orange-500/20">
            <Bell className="h-4 w-4 mr-1.5" />
            Alerts
          </TabsTrigger>
        </TabsList>
        
        {/* Scout Tab */}
        <TabsContent value="scout" className="flex-1 p-4 mt-0">
          <ScrollArea className="h-[calc(100vh-420px)]">
            <div className="space-y-4">
              {scoutBriefs.length > 0 ? (
                scoutBriefs.map((brief, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className={cn(
                        "h-4 w-4",
                        brief.type === "alert" ? "text-red-400" : "text-orange-400"
                      )} />
                      <span className="text-xs text-slate-500">
                        {new Date(brief.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{brief.message}</p>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 py-8">
                  <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Scout briefs appear during live games</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        {/* Odds Tab */}
        <TabsContent value="odds" className="flex-1 p-4 mt-0">
          {game.odds ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-500 mb-3">
                  Updated {new Date(game.odds.timestamp).toLocaleTimeString()}
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Spread</span>
                    <span className="font-mono font-semibold">{game.odds.spread}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Total</span>
                    <span className="font-mono font-semibold">{game.odds.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">ML ({game.awayTeam.abbr})</span>
                    <span className="font-mono font-semibold">{game.odds.moneyline.away}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">ML ({game.homeTeam.abbr})</span>
                    <span className="font-mono font-semibold">{game.odds.moneyline.home}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No odds data available</p>
              <p className="text-xs mt-1">Heat score uses game-state signals only</p>
            </div>
          )}
        </TabsContent>
        
        {/* Info Tab */}
        <TabsContent value="info" className="flex-1 p-4 mt-0">
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Injuries
              </h4>
              <p className="text-sm text-slate-400">No significant injuries reported</p>
            </div>
            
            {["nfl", "mlb", "soccer", "ncaaf"].includes(game.sport) && (
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <ThermometerSun className="h-4 w-4 text-sky-400" />
                  Weather
                </h4>
                <div className="flex items-center gap-4 text-sm">
                  <span>72°F</span>
                  <span className="text-slate-400">Clear</span>
                  <span className="text-slate-400">Wind: 5 mph</span>
                </div>
              </div>
            )}
            
            {game.venue && (
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <h4 className="text-sm font-medium mb-2">Venue</h4>
                <p className="text-sm text-slate-400">{game.venue}</p>
              </div>
            )}
          </div>
        </TabsContent>
        
        {/* Alerts Tab */}
        <TabsContent value="alerts" className="flex-1 p-4 mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-3">
                {alertsEnabled ? (
                  <Bell className="h-5 w-5 text-orange-400" />
                ) : (
                  <BellOff className="h-5 w-5 text-slate-500" />
                )}
                <div>
                  <p className="font-medium text-sm">Game Alerts</p>
                  <p className="text-xs text-slate-500">Scoring, momentum, final</p>
                </div>
              </div>
              <Button
                variant={alertsEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAlertsEnabled(!alertsEnabled)}
                className={alertsEnabled ? "bg-orange-600 hover:bg-orange-500" : ""}
              >
                {alertsEnabled ? "On" : "Off"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Main Heat Map Component
// =============================================================================

export function HeatMap() {
  const { subscription, features, loading } = useSubscription();
  const { games: hubGames, gamesLoading, refresh, isRefreshing } = useDataHub();
  
  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  
  // Check Elite access
  const hasEliteAccess = features?.hasMultiGameCenter || subscription?.tier === "scout_elite";
  
  // Available sports
  const availableSports = ["nfl", "nba", "mlb", "nhl", "soccer", "ncaaf", "ncaab"];
  
  // Transform LiveGame[] to HeatMap Game[] with heat calculations
  const games = useMemo<Game[]>(() => {
    const transformed = hubGames.map(g => {
      const statusLower = g.status?.toLowerCase() || 'scheduled';
      const gameForHeat: Game = {
        id: g.id,
        sport: g.sport?.toLowerCase() || '',
        league: g.sport || '',
        status: statusLower === 'in_progress' ? 'live' : statusLower === 'final' ? 'final' : 'scheduled',
        homeTeam: {
          name: g.homeTeam?.name || '',
          abbr: g.homeTeam?.abbreviation || '',
          score: g.homeTeam?.score ?? 0,
        },
        awayTeam: {
          name: g.awayTeam?.name || '',
          abbr: g.awayTeam?.abbreviation || '',
          score: g.awayTeam?.score ?? 0,
        },
        startTime: g.startTime || new Date().toISOString(),
        period: g.period || '',
        clock: g.clock,
        venue: undefined,
        isWatched: false,
        odds: g.odds ? {
          spread: g.odds.spreadHome?.toString() || '',
          total: g.odds.total?.toString() || '',
          moneyline: {
            home: g.odds.moneylineHome?.toString() || '',
            away: g.odds.moneylineAway?.toString() || '',
          },
          timestamp: new Date().toISOString(),
        } : undefined,
      };
      
      // Calculate heat scores
      const { score, factors } = calculateHeatScore(gameForHeat);
      return {
        ...gameForHeat,
        heatScore: score,
        heatFactors: factors,
      };
    });
    
    // Sort by heat score (hottest first)
    transformed.sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
    return transformed;
  }, [hubGames]);
  
  // Manual refresh
  const handleRefresh = async () => {
    await refresh();
  };
  
  // Filter games
  const filteredGames = games.filter(game => {
    if (selectedSports.length > 0 && !selectedSports.includes(game.sport)) {
      return false;
    }
    if (watchlistOnly && !game.isWatched) {
      return false;
    }
    return true;
  });
  
  // Toggle sport
  const toggleSport = (sport: string) => {
    setSelectedSports(prev => 
      prev.includes(sport) 
        ? prev.filter(s => s !== sport)
        : [...prev, sport]
    );
  };
  
  // Show loading
  if (loading || gamesLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }
  
  // Show locked preview for non-Elite
  if (!hasEliteAccess) {
    return <EliteLockedPreview userTier={subscription?.tier || "free"} />;
  }
  
  // Main Heat Map
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <ChevronLeft className="h-5 w-5 text-slate-400" />
            </Link>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-400" />
                <h1 className="font-bold text-lg">Heat Map</h1>
                <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">
                  ELITE
                </Badge>
              </div>
              <Link 
                to="/elite/command-center"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-semibold hover:bg-violet-500/20 transition-colors"
              >
                <Crown className="h-3.5 w-3.5" />
                Command Center
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
        
        {/* Filters Row */}
        <div className="flex items-center gap-4 px-4 pb-4 flex-wrap">
          <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
          
          <div className="h-6 w-px bg-slate-700/50" />
          
          <SportFilters 
            sports={availableSports}
            selectedSports={selectedSports}
            onToggle={toggleSport}
          />
          
          <div className="h-6 w-px bg-slate-700/50" />
          
          <div className="flex items-center gap-2">
            <Switch
              checked={watchlistOnly}
              onCheckedChange={setWatchlistOnly}
              className="data-[state=checked]:bg-amber-500"
            />
            <label className="text-sm text-slate-400 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              Watchlist only
            </label>
          </div>
          
          <div className="ml-auto">
            <HeatLegend />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Heat Grid */}
        <div className="flex-1 overflow-auto p-4">
          {filteredGames.length > 0 ? (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredGames.map((game) => (
                <HeatTile
                  key={game.id}
                  game={game}
                  isSelected={selectedGame?.id === game.id}
                  onSelect={() => setSelectedGame(game)}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              <div className="text-center">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No games found</p>
                <p className="text-sm mt-1">Try adjusting your filters or date</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Context Drawer */}
        <div className={cn(
          "w-96 border-l border-slate-700/50 bg-slate-900/50 transition-all duration-300",
          !selectedGame && "w-0 border-l-0 overflow-hidden"
        )}>
          <ContextDrawer game={selectedGame} onClose={() => setSelectedGame(null)} />
        </div>
      </div>
    </div>
  );
}
