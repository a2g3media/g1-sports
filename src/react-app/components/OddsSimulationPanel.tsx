/**
 * Odds Simulation Panel
 * 
 * Advanced controls for simulating odds movements in demo mode.
 * Features: auto-simulation, volatility control, batch actions, and detailed feedback.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  DollarSign,
  Play,
  Pause,
  Gauge,
  Zap,
  Settings2,
  Shuffle,
  ChevronDown,
  ChevronUp,
  Timer,
  BarChart3,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import type { Game } from "@/shared/types";

interface OddsSimulationPanelProps {
  games: Game[];
  onSpreadMove: (gameId: string, delta: number) => Promise<void>;
  onTotalMove: (gameId: string, delta: number) => Promise<void>;
  onFavoriteFlip: (gameId: string) => Promise<void>;
  isSimulating: boolean;
}

interface SimulationConfig {
  autoEnabled: boolean;
  intervalMs: number;
  volatility: "low" | "medium" | "high" | "extreme";
  spreadProbability: number;
  totalProbability: number;
  flipProbability: number;
}

interface SimulationStats {
  spreadsTriggered: number;
  totalsTriggered: number;
  flipsTriggered: number;
  lastAction: string | null;
  sessionStarted: Date | null;
}

const VOLATILITY_CONFIG = {
  low: { label: "Low", intervalMs: 15000, spreadProb: 0.3, totalProb: 0.2, flipProb: 0.02 },
  medium: { label: "Medium", intervalMs: 8000, spreadProb: 0.5, totalProb: 0.4, flipProb: 0.05 },
  high: { label: "High", intervalMs: 4000, spreadProb: 0.7, totalProb: 0.6, flipProb: 0.1 },
  extreme: { label: "Extreme", intervalMs: 2000, spreadProb: 0.9, totalProb: 0.8, flipProb: 0.2 },
};

const SPREAD_DELTAS = [0.5, 1, 1.5, 2, 3];
const TOTAL_DELTAS = [0.5, 1, 1.5, 2, 3];

export function OddsSimulationPanel({
  games,
  onSpreadMove,
  onTotalMove,
  onFavoriteFlip,
  isSimulating,
}: OddsSimulationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [config, setConfig] = useState<SimulationConfig>({
    autoEnabled: false,
    intervalMs: 8000,
    volatility: "medium",
    spreadProbability: 0.5,
    totalProbability: 0.4,
    flipProbability: 0.05,
  });
  const [stats, setStats] = useState<SimulationStats>({
    spreadsTriggered: 0,
    totalsTriggered: 0,
    flipsTriggered: 0,
    lastAction: null,
    sessionStarted: null,
  });
  const [recentActions, setRecentActions] = useState<Array<{ type: string; message: string; time: Date }>>([]);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingRef = useRef(false);
  
  // Get eligible games (scheduled or in progress)
  const eligibleGames = games.filter(g => g.status === "SCHEDULED" || g.status === "IN_PROGRESS");
  
  // Update config when volatility changes
  const setVolatility = (volatility: "low" | "medium" | "high" | "extreme") => {
    const volatilitySettings = VOLATILITY_CONFIG[volatility];
    setConfig(prev => ({
      ...prev,
      volatility,
      intervalMs: volatilitySettings.intervalMs,
      spreadProbability: volatilitySettings.spreadProb,
      totalProbability: volatilitySettings.totalProb,
      flipProbability: volatilitySettings.flipProb,
    }));
  };
  
  // Random simulation action
  const runSimulationTick = useCallback(async () => {
    if (isProcessingRef.current || eligibleGames.length === 0) return;
    isProcessingRef.current = true;
    
    try {
      // Pick a random game
      const game = eligibleGames[Math.floor(Math.random() * eligibleGames.length)];
      const rand = Math.random();
      
      let actionTaken = false;
      let actionType = "";
      let actionMessage = "";
      
      // Decide which action to take
      if (rand < config.flipProbability) {
        await onFavoriteFlip(game.game_id);
        actionTaken = true;
        actionType = "flip";
        actionMessage = `Favorite flipped: ${game.away_team_code} @ ${game.home_team_code}`;
        setStats(prev => ({ ...prev, flipsTriggered: prev.flipsTriggered + 1 }));
      } else if (rand < config.flipProbability + config.spreadProbability * 0.3) {
        const delta = (Math.random() > 0.5 ? 1 : -1) * SPREAD_DELTAS[Math.floor(Math.random() * 3)];
        await onSpreadMove(game.game_id, delta);
        actionTaken = true;
        actionType = "spread";
        actionMessage = `Spread ${delta > 0 ? "+" : ""}${delta}: ${game.away_team_code} @ ${game.home_team_code}`;
        setStats(prev => ({ ...prev, spreadsTriggered: prev.spreadsTriggered + 1 }));
      } else if (rand < config.flipProbability + config.spreadProbability * 0.3 + config.totalProbability * 0.3) {
        const delta = (Math.random() > 0.5 ? 1 : -1) * TOTAL_DELTAS[Math.floor(Math.random() * 3)];
        await onTotalMove(game.game_id, delta);
        actionTaken = true;
        actionType = "total";
        actionMessage = `Total ${delta > 0 ? "+" : ""}${delta}: ${game.away_team_code} @ ${game.home_team_code}`;
        setStats(prev => ({ ...prev, totalsTriggered: prev.totalsTriggered + 1 }));
      }
      
      if (actionTaken) {
        setStats(prev => ({ ...prev, lastAction: actionMessage }));
        setRecentActions(prev => [
          { type: actionType, message: actionMessage, time: new Date() },
          ...prev.slice(0, 9),
        ]);
      }
    } catch (err) {
      console.error("Simulation tick failed:", err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [eligibleGames, config, onSpreadMove, onTotalMove, onFavoriteFlip]);
  
  // Auto-simulation effect
  useEffect(() => {
    if (config.autoEnabled && eligibleGames.length > 0) {
      // Start auto-simulation
      if (!stats.sessionStarted) {
        setStats(prev => ({ ...prev, sessionStarted: new Date() }));
      }
      
      intervalRef.current = setInterval(runSimulationTick, config.intervalMs);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Stop auto-simulation
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [config.autoEnabled, config.intervalMs, eligibleGames.length, runSimulationTick, stats.sessionStarted]);
  
  // Batch actions
  const runBatchSpreadMove = async () => {
    for (const game of eligibleGames.slice(0, 5)) {
      const delta = (Math.random() > 0.5 ? 1 : -1) * 0.5;
      await onSpreadMove(game.game_id, delta);
    }
    setRecentActions(prev => [
      { type: "batch", message: `Batch spread move on ${Math.min(5, eligibleGames.length)} games`, time: new Date() },
      ...prev.slice(0, 9),
    ]);
  };
  
  const runBatchTotalMove = async () => {
    for (const game of eligibleGames.slice(0, 5)) {
      const delta = (Math.random() > 0.5 ? 1 : -1);
      await onTotalMove(game.game_id, delta);
    }
    setRecentActions(prev => [
      { type: "batch", message: `Batch total move on ${Math.min(5, eligibleGames.length)} games`, time: new Date() },
      ...prev.slice(0, 9),
    ]);
  };
  
  // Reset stats
  const resetStats = () => {
    setStats({
      spreadsTriggered: 0,
      totalsTriggered: 0,
      flipsTriggered: 0,
      lastAction: null,
      sessionStarted: null,
    });
    setRecentActions([]);
  };
  
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            config.autoEnabled ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/10 text-primary"
          )}>
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold">Odds Simulation Engine</h3>
            <p className="text-xs text-muted-foreground">
              {config.autoEnabled 
                ? `Auto-running (${VOLATILITY_CONFIG[config.volatility].label} volatility)`
                : `${eligibleGames.length} games available`
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {config.autoEnabled && (
            <div className="flex items-center gap-1.5 text-emerald-500">
              <Activity className="w-4 h-4 animate-pulse" />
              <span className="text-sm font-medium">Active</span>
            </div>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t bg-secondary/10">
          {/* Auto-Simulation Toggle */}
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="font-medium text-sm">Auto-Simulation</span>
              </div>
              <Button
                size="sm"
                variant={config.autoEnabled ? "default" : "outline"}
                className={cn(
                  "gap-2",
                  config.autoEnabled && "bg-emerald-600 hover:bg-emerald-700"
                )}
                onClick={() => setConfig(prev => ({ ...prev, autoEnabled: !prev.autoEnabled }))}
                disabled={eligibleGames.length === 0}
              >
                {config.autoEnabled ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Start
                  </>
                )}
              </Button>
            </div>
            
            {/* Volatility Selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />
                <span>Volatility Level</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(VOLATILITY_CONFIG) as Array<keyof typeof VOLATILITY_CONFIG>).map(level => (
                  <button
                    key={level}
                    onClick={() => setVolatility(level)}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-medium transition-colors",
                      config.volatility === level
                        ? level === "extreme"
                          ? "bg-red-500/20 text-red-500 ring-1 ring-red-500/30"
                          : level === "high"
                            ? "bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30"
                            : level === "medium"
                              ? "bg-blue-500/20 text-blue-500 ring-1 ring-blue-500/30"
                              : "bg-muted text-foreground ring-1 ring-border"
                        : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
                    )}
                  >
                    {VOLATILITY_CONFIG[level].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Updates every {(config.intervalMs / 1000).toFixed(0)}s • 
                Spread: {(config.spreadProbability * 100).toFixed(0)}% • 
                Total: {(config.totalProbability * 100).toFixed(0)}% • 
                Flip: {(config.flipProbability * 100).toFixed(0)}%
              </p>
            </div>
          </div>
          
          {/* Manual Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Settings2 className="w-3.5 h-3.5" />
              <span>Manual Controls</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2.5 flex-col"
                onClick={async () => {
                  if (eligibleGames.length > 0) {
                    const game = eligibleGames[Math.floor(Math.random() * eligibleGames.length)];
                    const delta = Math.random() > 0.5 ? 0.5 : -0.5;
                    await onSpreadMove(game.game_id, delta);
                  }
                }}
                disabled={isSimulating || eligibleGames.length === 0}
              >
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-xs">Spread</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2.5 flex-col"
                onClick={async () => {
                  if (eligibleGames.length > 0) {
                    const game = eligibleGames[Math.floor(Math.random() * eligibleGames.length)];
                    const delta = Math.random() > 0.5 ? 1 : -1;
                    await onTotalMove(game.game_id, delta);
                  }
                }}
                disabled={isSimulating || eligibleGames.length === 0}
              >
                <TrendingDown className="w-4 h-4 text-purple-500" />
                <span className="text-xs">Total</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2.5 flex-col"
                onClick={async () => {
                  if (eligibleGames.length > 0) {
                    const game = eligibleGames[Math.floor(Math.random() * eligibleGames.length)];
                    await onFavoriteFlip(game.game_id);
                  }
                }}
                disabled={isSimulating || eligibleGames.length === 0}
              >
                <ArrowRightLeft className="w-4 h-4 text-amber-500" />
                <span className="text-xs">Flip</span>
              </Button>
            </div>
            
            {/* Batch Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={runBatchSpreadMove}
                disabled={isSimulating || eligibleGames.length === 0}
              >
                <Shuffle className="w-3.5 h-3.5" />
                Batch Spreads
              </Button>
              
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={runBatchTotalMove}
                disabled={isSimulating || eligibleGames.length === 0}
              >
                <Shuffle className="w-3.5 h-3.5" />
                Batch Totals
              </Button>
            </div>
          </div>
          
          {/* Session Stats */}
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Session Stats</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={resetStats}
              >
                Reset
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-background p-2.5 rounded-lg text-center">
                <p className="text-lg font-bold text-blue-500">{stats.spreadsTriggered}</p>
                <p className="text-xs text-muted-foreground">Spreads</p>
              </div>
              <div className="bg-background p-2.5 rounded-lg text-center">
                <p className="text-lg font-bold text-purple-500">{stats.totalsTriggered}</p>
                <p className="text-xs text-muted-foreground">Totals</p>
              </div>
              <div className="bg-background p-2.5 rounded-lg text-center">
                <p className="text-lg font-bold text-amber-500">{stats.flipsTriggered}</p>
                <p className="text-xs text-muted-foreground">Flips</p>
              </div>
            </div>
            
            {stats.sessionStarted && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Timer className="w-3 h-3" />
                <span>Session started {formatTimeAgo(stats.sessionStarted)}</span>
              </div>
            )}
          </div>
          
          {/* Recent Actions Log */}
          {recentActions.length > 0 && (
            <div className="space-y-2 pt-3 border-t max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">Recent Actions</p>
              {recentActions.map((action, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-xs p-2 rounded-lg flex items-center gap-2",
                    action.type === "flip" ? "bg-amber-500/10" :
                    action.type === "spread" ? "bg-blue-500/10" :
                    action.type === "total" ? "bg-purple-500/10" :
                    "bg-muted"
                  )}
                >
                  {action.type === "flip" ? <ArrowRightLeft className="w-3 h-3 text-amber-500 shrink-0" /> :
                   action.type === "spread" ? <TrendingUp className="w-3 h-3 text-blue-500 shrink-0" /> :
                   action.type === "total" ? <TrendingDown className="w-3 h-3 text-purple-500 shrink-0" /> :
                   <Shuffle className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <span className="flex-1 truncate">{action.message}</span>
                  <span className="text-muted-foreground shrink-0">{formatTimeShort(action.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatTimeShort(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
