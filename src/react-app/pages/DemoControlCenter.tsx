/**
 * Demo Control Center
 * 
 * Admin interface for simulating game events in demo mode.
 * Allows manual score updates, game state changes, and threshold testing.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Square,
  RefreshCw,
  Zap,
  Radio,
  Clock,
  Trophy,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  RotateCcw,
  Settings,
  Activity,
  Target,
  DollarSign,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { SportBadge } from "@/react-app/components/ui/premium";
import { OddsSimulationPanel } from "@/react-app/components/OddsSimulationPanel";
import type { Game, GameStatus } from "@/shared/types";

type SportFilter = "all" | "nfl" | "nba" | "nhl" | "mlb" | "ncaaf" | "ncaab" | "soccer";

const STATUS_CONFIG: Record<GameStatus, { label: string; icon: React.ReactNode; color: string }> = {
  SCHEDULED: { label: "Scheduled", icon: <Calendar className="w-3.5 h-3.5" />, color: "text-muted-foreground" },
  IN_PROGRESS: { label: "Live", icon: <Radio className="w-3.5 h-3.5" />, color: "text-[hsl(var(--live))]" },
  FINAL: { label: "Final", icon: <Trophy className="w-3.5 h-3.5" />, color: "text-emerald-500" },
  POSTPONED: { label: "Postponed", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-amber-500" },
  CANCELED: { label: "Canceled", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-red-500" },
};

const SPORT_FILTERS: Array<{ key: SportFilter; label: string }> = [
  { key: "all", label: "All Sports" },
  { key: "nfl", label: "NFL" },
  { key: "nba", label: "NBA" },
  { key: "nhl", label: "NHL" },
  { key: "mlb", label: "MLB" },
  { key: "ncaaf", label: "NCAAF" },
  { key: "ncaab", label: "NCAAB" },
  { key: "soccer", label: "Soccer" },
];

interface ThresholdEvent {
  type: string;
  category: string;
  message: string;
  severity: string;
  timestamp: string;
}



export function DemoControlCenter() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<ThresholdEvent[]>([]);
  const [isSimulating, setIsSimulating] = useState<string | null>(null);
  const [isSimulatingOdds, setIsSimulatingOdds] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  
  // Fetch games
  const fetchGames = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/games", {
        credentials: "include",
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || `Failed to load games (${res.status})`);
        setGames([]);
        return;
      }
      
      setGames(data.games || []);
    } catch (err) {
      console.error("Failed to fetch games:", err);
      setError("Network error - could not connect to server");
      setGames([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Filter games
  const filteredGames = useMemo(() => {
    let filtered = games;
    if (sportFilter !== "all") {
      filtered = filtered.filter(g => g.sport === sportFilter);
    }
    // Sort: live first, then scheduled, then final
    const statusOrder: Record<GameStatus, number> = {
      IN_PROGRESS: 0,
      SCHEDULED: 1,
      POSTPONED: 2,
      FINAL: 3,
      CANCELED: 4,
    };
    return filtered.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [games, sportFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: games.length,
    live: games.filter(g => g.status === "IN_PROGRESS").length,
    scheduled: games.filter(g => g.status === "SCHEDULED").length,
    final: games.filter(g => g.status === "FINAL").length,
  }), [games]);

  // Simulate score update
  const simulateScore = async (gameId: string, team: "home" | "away", points: number) => {
    setIsSimulating(gameId);
    try {
      const res = await fetch(`/api/games/${gameId}/simulate/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, points, triggerThresholds: true }),
      });
      const data = await res.json();
      
      if (data.game) {
        setGames(prev => prev.map(g => g.game_id === gameId ? data.game : g));
      }
      
      if (data.thresholdEvents?.length > 0) {
        setRecentEvents(prev => [...data.thresholdEvents, ...prev].slice(0, 20));
      }
    } catch (err) {
      console.error("Score simulation failed:", err);
    } finally {
      setIsSimulating(null);
    }
  };

  // Simulate state change
  const simulateState = async (gameId: string, status: GameStatus) => {
    setIsSimulating(gameId);
    try {
      const res = await fetch(`/api/games/${gameId}/simulate/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, triggerThresholds: true }),
      });
      const data = await res.json();
      
      if (data.game) {
        setGames(prev => prev.map(g => g.game_id === gameId ? data.game : g));
      }
      
      if (data.thresholdEvents?.length > 0) {
        setRecentEvents(prev => [...data.thresholdEvents, ...prev].slice(0, 20));
      }
    } catch (err) {
      console.error("State simulation failed:", err);
    } finally {
      setIsSimulating(null);
    }
  };

  // Clear cache
  const clearCache = async () => {
    try {
      await fetch("/api/games/admin/cache/clear", { method: "POST" });
      await fetchGames();
    } catch (err) {
      console.error("Cache clear failed:", err);
    }
  };

  // Simulate spread move
  const simulateSpreadMove = async (gameId: string, delta: number) => {
    setIsSimulatingOdds(gameId);
    try {
      await fetch("/api/odds/simulate/spread-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId, delta }),
      });
    } catch (err) {
      console.error("Spread simulation failed:", err);
    } finally {
      setIsSimulatingOdds(null);
    }
  };

  // Simulate total move
  const simulateTotalMove = async (gameId: string, delta: number) => {
    setIsSimulatingOdds(gameId);
    try {
      await fetch("/api/odds/simulate/total-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId, delta }),
      });
    } catch (err) {
      console.error("Total simulation failed:", err);
    } finally {
      setIsSimulatingOdds(null);
    }
  };

  // Simulate favorite flip
  const simulateFavoriteFlip = async (gameId: string) => {
    setIsSimulatingOdds(gameId);
    try {
      await fetch("/api/odds/simulate/favorite-flip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId }),
      });
    } catch (err) {
      console.error("Favorite flip simulation failed:", err);
    } finally {
      setIsSimulatingOdds(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading games...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary" />
                  Demo Control Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Simulate game events and test threshold triggers
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchGames}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearCache}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Cache
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-red-500">Error Loading Games</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}
        
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Games" value={stats.total} icon={<Activity className="w-4 h-4" />} />
          <StatCard label="Live Now" value={stats.live} icon={<Radio className="w-4 h-4" />} color="text-[hsl(var(--live))]" />
          <StatCard label="Scheduled" value={stats.scheduled} icon={<Clock className="w-4 h-4" />} color="text-blue-500" />
          <StatCard label="Final" value={stats.final} icon={<Trophy className="w-4 h-4" />} color="text-emerald-500" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Games List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Sport Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {SPORT_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSportFilter(key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    sportFilter === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Games */}
            <div className="space-y-2">
              {filteredGames.map(game => (
                <GameCard
                  key={game.game_id}
                  game={game}
                  isExpanded={expandedGameId === game.game_id}
                  isSimulating={isSimulating === game.game_id}
                  isSimulatingOdds={isSimulatingOdds === game.game_id}
                  onToggle={() => setExpandedGameId(
                    expandedGameId === game.game_id ? null : game.game_id
                  )}
                  onScoreUpdate={simulateScore}
                  onStateChange={simulateState}
                  onSpreadMove={simulateSpreadMove}
                  onTotalMove={simulateTotalMove}
                  onFavoriteFlip={simulateFavoriteFlip}
                />
              ))}
            </div>
          </div>

          {/* Events Panel */}
          <div className="space-y-4">
            <div className="bg-card border rounded-xl p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-amber-500" />
                Threshold Events
              </h3>
              
              {recentEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No events yet</p>
                  <p className="text-xs">Simulate a score or state change</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {recentEvents.map((event, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-3 rounded-lg text-sm",
                        event.severity === "HIGH" ? "bg-red-500/10 border border-red-500/20" :
                        event.severity === "MEDIUM" ? "bg-amber-500/10 border border-amber-500/20" :
                        "bg-secondary/50"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-xs font-medium px-1.5 py-0.5 rounded",
                          event.severity === "HIGH" ? "bg-red-500/20 text-red-500" :
                          event.severity === "MEDIUM" ? "bg-amber-500/20 text-amber-500" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {event.category}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {event.type}
                        </span>
                      </div>
                      <p className="text-foreground">{event.message}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {recentEvents.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setRecentEvents([])}
                >
                  Clear Events
                </Button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-card border rounded-xl p-4">
              <h3 className="font-semibold mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={async () => {
                    // Start first scheduled game
                    const scheduled = games.find(g => g.status === "SCHEDULED");
                    if (scheduled) {
                      await simulateState(scheduled.game_id, "IN_PROGRESS");
                    }
                  }}
                >
                  <Play className="w-4 h-4 text-emerald-500" />
                  Start Next Scheduled Game
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={async () => {
                    // End first live game
                    const live = games.find(g => g.status === "IN_PROGRESS");
                    if (live) {
                      await simulateState(live.game_id, "FINAL");
                    }
                  }}
                >
                  <Square className="w-4 h-4 text-red-500" />
                  End First Live Game
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={async () => {
                    // Random score update
                    const live = games.filter(g => g.status === "IN_PROGRESS");
                    if (live.length > 0) {
                      const game = live[Math.floor(Math.random() * live.length)];
                      const team = Math.random() > 0.5 ? "home" : "away";
                      const points = getRandomPoints(game.sport);
                      await simulateScore(game.game_id, team, points);
                    }
                  }}
                >
                  <Zap className="w-4 h-4 text-amber-500" />
                  Random Score Update
                </Button>
              </div>
            </div>

            {/* Odds Simulation Panel */}
            <OddsSimulationPanel
              games={games}
              onSpreadMove={simulateSpreadMove}
              onTotalMove={simulateTotalMove}
              onFavoriteFlip={simulateFavoriteFlip}
              isSimulating={isSimulatingOdds !== null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  color = "text-foreground" 
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode; 
  color?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className={cn("text-2xl font-bold", color)}>{value}</span>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function GameCard({
  game,
  isExpanded,
  isSimulating,
  isSimulatingOdds,
  onToggle,
  onScoreUpdate,
  onStateChange,
  onSpreadMove,
  onTotalMove,
  onFavoriteFlip,
}: {
  game: Game;
  isExpanded: boolean;
  isSimulating: boolean;
  isSimulatingOdds?: boolean;
  onToggle: () => void;
  onScoreUpdate: (gameId: string, team: "home" | "away", points: number) => Promise<void>;
  onStateChange: (gameId: string, status: GameStatus) => Promise<void>;
  onSpreadMove: (gameId: string, delta: number) => Promise<void>;
  onTotalMove: (gameId: string, delta: number) => Promise<void>;
  onFavoriteFlip: (gameId: string) => Promise<void>;
}) {
  const statusConfig = STATUS_CONFIG[game.status];
  const isLive = game.status === "IN_PROGRESS";
  
  return (
    <div className={cn(
      "bg-card border rounded-xl overflow-hidden transition-all",
      isExpanded && "ring-2 ring-primary/20"
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <SportBadge sport={game.sport} />
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TeamBadge teamCode={game.away_team_code} size="sm" />
              <span className="font-medium">{game.away_team_name}</span>
              {game.away_score !== undefined && (
                <span className="font-bold text-lg">{game.away_score}</span>
              )}
            </div>
            
            <span className="text-muted-foreground">@</span>
            
            <div className="flex items-center gap-2">
              <TeamBadge teamCode={game.home_team_code} size="sm" />
              <span className="font-medium">{game.home_team_name}</span>
              {game.home_score !== undefined && (
                <span className="font-bold text-lg">{game.home_score}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={cn("flex items-center gap-1.5", statusConfig.color)}>
            {statusConfig.icon}
            <span className="text-sm font-medium">{statusConfig.label}</span>
            {isLive && game.period_label && (
              <span className="text-xs opacity-80">• {game.period_label}</span>
            )}
          </div>
          
          {isSimulating ? (
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          ) : (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>
      
      {/* Expanded Controls */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t bg-secondary/20">
          <div className="pt-4 space-y-4">
            {/* Score Controls (only for live games) */}
            {isLive && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Score Update</h4>
                <div className="grid grid-cols-2 gap-4">
                  <ScoreControl
                    label={game.away_team_name}
                    teamCode={game.away_team_code}
                    score={game.away_score || 0}
                    sport={game.sport}
                    onAdd={(pts) => onScoreUpdate(game.game_id, "away", pts)}
                    disabled={isSimulating}
                  />
                  <ScoreControl
                    label={game.home_team_name}
                    teamCode={game.home_team_code}
                    score={game.home_score || 0}
                    sport={game.sport}
                    onAdd={(pts) => onScoreUpdate(game.game_id, "home", pts)}
                    disabled={isSimulating}
                  />
                </div>
              </div>
            )}
            
            {/* State Controls */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Game State</h4>
              <div className="flex flex-wrap gap-2">
                {game.status === "SCHEDULED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onStateChange(game.game_id, "IN_PROGRESS")}
                    disabled={isSimulating}
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-500" />
                    Start Game
                  </Button>
                )}
                
                {game.status === "IN_PROGRESS" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onStateChange(game.game_id, "FINAL")}
                    disabled={isSimulating}
                  >
                    <Square className="w-3.5 h-3.5 text-red-500" />
                    End Game
                  </Button>
                )}
                
                {["SCHEDULED", "IN_PROGRESS"].includes(game.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onStateChange(game.game_id, "POSTPONED")}
                    disabled={isSimulating}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Postpone
                  </Button>
                )}
                
                {game.status === "FINAL" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onStateChange(game.game_id, "SCHEDULED")}
                    disabled={isSimulating}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Scheduled
                  </Button>
                )}
              </div>
            </div>
            
            {/* Odds Controls (for scheduled and live games) */}
            {(game.status === "SCHEDULED" || game.status === "IN_PROGRESS") && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5" />
                  Odds Simulation
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {/* Spread Controls */}
                  <div className="p-3 bg-background rounded-lg border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Spread</p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => onSpreadMove(game.game_id, -0.5)}
                        disabled={isSimulatingOdds}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => onSpreadMove(game.game_id, 0.5)}
                        disabled={isSimulatingOdds}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Total Controls */}
                  <div className="p-3 bg-background rounded-lg border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Total</p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => onTotalMove(game.game_id, -1)}
                        disabled={isSimulatingOdds}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => onTotalMove(game.game_id, 1)}
                        disabled={isSimulatingOdds}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Favorite Flip */}
                  <div className="p-3 bg-background rounded-lg border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Favorite</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full gap-1"
                      onClick={() => onFavoriteFlip(game.game_id)}
                      disabled={isSimulatingOdds}
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      Flip
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Debug Info */}
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground font-mono">
                ID: {game.game_id} | Updated: {new Date(game.last_updated_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreControl({
  label,
  teamCode,
  score,
  sport,
  onAdd,
  disabled,
}: {
  label: string;
  teamCode: string;
  score: number;
  sport: string;
  onAdd: (points: number) => void;
  disabled?: boolean;
}) {
  const pointOptions = getPointOptions(sport);
  
  return (
    <div className="p-3 bg-background rounded-lg border">
      <div className="flex items-center gap-2 mb-3">
        <TeamBadge teamCode={teamCode} size="sm" />
        <span className="font-medium text-sm">{label}</span>
        <span className="ml-auto text-xl font-bold">{score}</span>
      </div>
      <div className="flex gap-1">
        {pointOptions.map(pts => (
          <Button
            key={pts}
            size="sm"
            variant="secondary"
            className="flex-1 gap-1"
            onClick={() => onAdd(pts)}
            disabled={disabled}
          >
            <Plus className="w-3 h-3" />
            {pts}
          </Button>
        ))}
      </div>
    </div>
  );
}

function getPointOptions(sport: string): number[] {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return [3, 6, 7];
    case "nba":
    case "ncaab":
      return [1, 2, 3];
    case "mlb":
    case "nhl":
    case "soccer":
      return [1];
    default:
      return [1, 2, 3];
  }
}

function getRandomPoints(sport: string): number {
  const options = getPointOptions(sport);
  return options[Math.floor(Math.random() * options.length)];
}
