import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, TrendingUp, TrendingDown, 
  Check, Clock, ChevronRight, History, BarChart3,
  Calendar, PieChart, CheckCircle2, Bell,  BellRing
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import { TeamBadge } from "@/react-app/components/ui/team-badge";
import { SportBadge } from "@/react-app/components/ui/premium";
import { PickConfirmationModal } from "@/react-app/components/picks/PickConfirmationModal";
import { useDataHub } from "@/react-app/hooks/useDataHub";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { Game, CreateTrackerPick } from "@/shared/types";

// Pick market types
type PickMarket = "SPREAD" | "TOTAL" | "MONEYLINE";
type PickSide = "HOME" | "AWAY" | "OVER" | "UNDER";

interface PendingPick {
  gameId: string;
  market: PickMarket;
  side: PickSide;
  line: number | null;
  odds: number;
}

// Toast notification state
interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

// Stub odds data for games
function getGameOdds(gameId: string) {
  const hash = gameId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const spreadBase = (hash % 14) - 7;
  const spread = spreadBase + (hash % 2 === 0 ? 0 : 0.5);
  const total = 42 + (hash % 20);
  
  return {
    spread: {
      home: { line: spread, odds: -110 },
      away: { line: -spread, odds: -110 },
    },
    total: {
      over: { line: total, odds: -110 },
      under: { line: total, odds: -110 },
    },
    moneyline: {
      home: spread < 0 ? -(110 + Math.abs(spread) * 15) : 100 + spread * 15,
      away: spread > 0 ? -(110 + Math.abs(spread) * 15) : 100 + Math.abs(spread) * 15,
    },
  };
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatSpread(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

// Toast component
function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg border animate-in slide-in-from-bottom-5 fade-in duration-300",
        toast.type === "success" 
          ? "bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]"
          : "bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]/30 text-[hsl(var(--destructive))]"
      )}
    >
      {toast.type === "success" && <CheckCircle2 className="w-5 h-5 shrink-0" />}
      <span className="font-medium">{toast.message}</span>
      <button 
        onClick={onDismiss}
        className="ml-auto text-current/70 hover:text-current"
      >
        ×
      </button>
    </div>
  );
}

// Game card with pick options
function GamePickCard({ 
  game, 
  pendingPick, 
  onSelectPick,
  isWatched,
  onToggleWatch,
}: { 
  game: Game;
  pendingPick: PendingPick | null;
  onSelectPick: (pick: PendingPick | null) => void;
  isWatched: boolean;
  onToggleWatch: () => void;
}) {
  const [activeMarket, setActiveMarket] = useState<PickMarket>("SPREAD");
  const odds = getGameOdds(game.game_id);
  const gameTime = new Date(game.start_time);
  const isLocked = game.status !== "SCHEDULED";
  
  const handlePickClick = (market: PickMarket, side: PickSide, line: number | null, price: number) => {
    if (isLocked) return;
    
    if (pendingPick?.gameId === game.game_id && 
        pendingPick?.market === market && 
        pendingPick?.side === side) {
      onSelectPick(null);
      return;
    }
    
    onSelectPick({
      gameId: game.game_id,
      market,
      side,
      line,
      odds: price,
    });
  };
  
  const isSelected = (market: PickMarket, side: PickSide) => 
    pendingPick?.gameId === game.game_id && 
    pendingPick?.market === market && 
    pendingPick?.side === side;
  
  return (
    <div className={cn(
      "rounded-2xl border bg-card overflow-hidden transition-all",
      isLocked && "opacity-60"
    )}>
      {/* Game Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-3">
          <SportBadge sport={game.sport} />
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatch();
              }}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                isWatched 
                  ? "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            >
              {isWatched ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {gameTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' • '}
              {gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
        </div>
        
        {/* Teams */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <TeamBadge teamName={game.away_team_name} size="md" />
            <div>
              <p className="font-semibold">{game.away_team_name}</p>
              <p className="text-xs text-muted-foreground">{game.away_team_code}</p>
            </div>
          </div>
          <div className="text-muted-foreground text-sm font-medium">@</div>
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="text-right">
              <p className="font-semibold">{game.home_team_name}</p>
              <p className="text-xs text-muted-foreground">{game.home_team_code}</p>
            </div>
            <TeamBadge teamName={game.home_team_name} size="md" />
          </div>
        </div>
      </div>
      
      {/* Market Tabs */}
      <div className="p-4">
        <Tabs value={activeMarket} onValueChange={(v) => setActiveMarket(v as PickMarket)}>
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="SPREAD" className="text-xs">Spread</TabsTrigger>
            <TabsTrigger value="TOTAL" className="text-xs">Total</TabsTrigger>
            <TabsTrigger value="MONEYLINE" className="text-xs">Moneyline</TabsTrigger>
          </TabsList>
          
          {/* Spread */}
          <TabsContent value="SPREAD" className="mt-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePickClick("SPREAD", "AWAY", odds.spread.away.line, odds.spread.away.odds)}
                disabled={isLocked}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center",
                  isSelected("SPREAD", "AWAY")
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isLocked && "cursor-not-allowed"
                )}
              >
                <p className="text-xs text-muted-foreground mb-1">{game.away_team_code}</p>
                <p className="font-bold text-lg">{formatSpread(odds.spread.away.line)}</p>
                <p className="text-sm text-muted-foreground">{formatOdds(odds.spread.away.odds)}</p>
              </button>
              <button
                onClick={() => handlePickClick("SPREAD", "HOME", odds.spread.home.line, odds.spread.home.odds)}
                disabled={isLocked}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center",
                  isSelected("SPREAD", "HOME")
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isLocked && "cursor-not-allowed"
                )}
              >
                <p className="text-xs text-muted-foreground mb-1">{game.home_team_code}</p>
                <p className="font-bold text-lg">{formatSpread(odds.spread.home.line)}</p>
                <p className="text-sm text-muted-foreground">{formatOdds(odds.spread.home.odds)}</p>
              </button>
            </div>
          </TabsContent>
          
          {/* Total */}
          <TabsContent value="TOTAL" className="mt-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePickClick("TOTAL", "OVER", odds.total.over.line, odds.total.over.odds)}
                disabled={isLocked}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center",
                  isSelected("TOTAL", "OVER")
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isLocked && "cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Over</span>
                </div>
                <p className="font-bold text-lg">{odds.total.over.line}</p>
                <p className="text-sm text-muted-foreground">{formatOdds(odds.total.over.odds)}</p>
              </button>
              <button
                onClick={() => handlePickClick("TOTAL", "UNDER", odds.total.under.line, odds.total.under.odds)}
                disabled={isLocked}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center",
                  isSelected("TOTAL", "UNDER")
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isLocked && "cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingDown className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Under</span>
                </div>
                <p className="font-bold text-lg">{odds.total.under.line}</p>
                <p className="text-sm text-muted-foreground">{formatOdds(odds.total.under.odds)}</p>
              </button>
            </div>
          </TabsContent>
          
          {/* Moneyline */}
          <TabsContent value="MONEYLINE" className="mt-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePickClick("MONEYLINE", "AWAY", null, odds.moneyline.away)}
                disabled={isLocked}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center",
                  isSelected("MONEYLINE", "AWAY")
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isLocked && "cursor-not-allowed"
                )}
              >
                <p className="text-xs text-muted-foreground mb-1">{game.away_team_code}</p>
                <p className="font-bold text-lg">{formatOdds(odds.moneyline.away)}</p>
                <p className="text-sm text-muted-foreground">Win</p>
              </button>
              <button
                onClick={() => handlePickClick("MONEYLINE", "HOME", null, odds.moneyline.home)}
                disabled={isLocked}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center",
                  isSelected("MONEYLINE", "HOME")
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isLocked && "cursor-not-allowed"
                )}
              >
                <p className="text-xs text-muted-foreground mb-1">{game.home_team_code}</p>
                <p className="font-bold text-lg">{formatOdds(odds.moneyline.home)}</p>
                <p className="text-sm text-muted-foreground">Win</p>
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Lock indicator */}
      {isLocked && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Game has started - picks locked</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Stats summary card
function StatsCard() {
  const stats = {
    totalPicks: 47,
    wins: 28,
    losses: 17,
    pushes: 2,
    winRate: 62.2,
    roi: 8.4,
    currentStreak: { type: "W" as const, count: 3 },
    bestStreak: 7,
  };
  
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Your Stats
        </h3>
        <Link to="/picks/history" className="text-xs text-primary hover:underline flex items-center gap-1">
          View all
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-[hsl(var(--success))]">{stats.wins}</p>
          <p className="text-xs text-muted-foreground">Wins</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-[hsl(var(--destructive))]">{stats.losses}</p>
          <p className="text-xs text-muted-foreground">Losses</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-muted-foreground">{stats.pushes}</p>
          <p className="text-xs text-muted-foreground">Push</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{stats.winRate}%</p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          <Badge variant={stats.roi > 0 ? "default" : "destructive"} className="text-xs">
            {stats.roi > 0 ? "+" : ""}{stats.roi}% ROI
          </Badge>
          <Badge variant="outline" className="text-xs">
            {stats.currentStreak.type}{stats.currentStreak.count} Streak
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Best: {stats.bestStreak} straight
        </span>
      </div>
    </div>
  );
}

export function PicksTracker() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const { games: hubGames, gamesLoading } = useDataHub();
  const [selectedPick, setSelectedPick] = useState<PendingPick | null>(null);
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [watchedGames, setWatchedGames] = useState<Set<string>>(new Set());
  
  // Transform LiveGame[] to Game[] format
  const allGames = useMemo<Game[]>(() => {
    return hubGames.map(g => {
      const statusUpper = g.status?.toUpperCase() || 'SCHEDULED';
      return {
        game_id: g.id,
        sport: g.sport,
        league: g.sport || '',
        home_team_code: g.homeTeam?.abbreviation || '',
        away_team_code: g.awayTeam?.abbreviation || '',
        home_team_name: g.homeTeam?.name || '',
        away_team_name: g.awayTeam?.name || '',
        home_score: g.homeTeam?.score ?? 0,
        away_score: g.awayTeam?.score ?? 0,
        status: (statusUpper === 'IN_PROGRESS' ? 'IN_PROGRESS' : statusUpper === 'FINAL' ? 'FINAL' : 'SCHEDULED') as 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL',
        start_time: g.startTime || new Date().toISOString(),
        period_label: g.period || '',
        clock: g.clock || '',
        last_updated_at: new Date().toISOString(),
      };
    });
  }, [hubGames]);
  
  // Fetch user's watched games on mount
  useEffect(() => {
    if (!user) return;
    
    const fetchWatchlist = async () => {
      try {
        const response = await fetch("/api/tracker/watchlist", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          const watchedIds = new Set<string>(data.watchlist.map((w: { game_id: string }) => w.game_id));
          setWatchedGames(watchedIds);
        }
      } catch (err) {
        console.error("Failed to fetch watchlist:", err);
      }
    };
    
    fetchWatchlist();
  }, [user]);

  // Toggle watch status for a game
  const handleToggleWatch = async (gameId: string, game: Game) => {
    if (!user) {
      addToast("Sign in to watch games", "error");
      return;
    }
    
    const isCurrentlyWatched = watchedGames.has(gameId);
    
    // Optimistic update
    setWatchedGames(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyWatched) {
        newSet.delete(gameId);
      } else {
        newSet.add(gameId);
      }
      return newSet;
    });
    
    try {
      if (isCurrentlyWatched) {
        // Remove from watchlist
        const response = await fetch(`/api/tracker/watchlist/${gameId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to remove");
        addToast("Removed from watchlist", "success");
      } else {
        // Add to watchlist
        const response = await fetch("/api/tracker/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            game_id: gameId,
            sport: game.sport,
            home_team: game.home_team_name,
            away_team: game.away_team_name,
            start_time: game.start_time,
          }),
        });
        if (!response.ok) throw new Error("Failed to add");
        addToast("Added to watchlist", "success");
      }
    } catch {
      // Revert optimistic update
      setWatchedGames(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyWatched) {
          newSet.add(gameId);
        } else {
          newSet.delete(gameId);
        }
        return newSet;
      });
      addToast("Failed to update watchlist", "error");
    }
  };
  
  // Filter games from live API data
  const games = useMemo(() => {
    // Filter to scheduled and live games only
    const available = allGames.filter(g => 
      g.status === "SCHEDULED" || g.status === "IN_PROGRESS"
    ).sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    
    if (sportFilter === "all") return available;
    return available.filter(g => g.sport.toLowerCase() === sportFilter.toLowerCase());
  }, [allGames, sportFilter]);
  
  // Get unique sports from games
  const sports = useMemo(() => {
    const sportSet = new Set(games.map(g => g.sport));
    return Array.from(sportSet);
  }, [games]);

  // Get the game for current pick
  const selectedGame = useMemo(() => {
    if (!selectedPick) return null;
    return games.find(g => g.game_id === selectedPick.gameId) || null;
  }, [selectedPick, games]);

  // Toast management
  const addToast = (message: string, type: "success" | "error") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  
  const handleOpenConfirmation = () => {
    if (!selectedPick || !user) return;
    setShowConfirmation(true);
  };

  const handleSubmitPick = async (pickData: CreateTrackerPick) => {
    const response = await fetch("/api/tracker/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(pickData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to save pick");
    }

    // Success - clear selection and show toast
    setSelectedPick(null);
    addToast("Pick locked successfully!", "success");
  };
  
  const getPickDescription = (pick: PendingPick): string => {
    const game = games.find(g => g.game_id === pick.gameId);
    if (!game) return "";
    
    switch (pick.market) {
      case "SPREAD":
        return `${pick.side === "HOME" ? game.home_team_name : game.away_team_name} ${formatSpread(pick.line!)}`;
      case "TOTAL":
        return `${pick.side === "OVER" ? "Over" : "Under"} ${pick.line}`;
      case "MONEYLINE":
        return `${pick.side === "HOME" ? game.home_team_name : game.away_team_name} ML`;
    }
  };
  
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
                <h1 className="font-bold text-lg">Make Picks</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link to="/watchlist">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <Bell className="w-4 h-4" />
                  <span className="hidden sm:inline">Watch</span>
                </Button>
              </Link>
              <Link to="/picks/analytics">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <PieChart className="w-4 h-4" />
                  <span className="hidden sm:inline">Analytics</span>
                </Button>
              </Link>
              <Link to="/picks/history">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <History className="w-4 h-4" />
                  <span className="hidden sm:inline">History</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 pb-32">
        {/* Stats Summary */}
        <div className="mb-6">
          <StatsCard />
        </div>
        
        {/* Sport Filter */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          <Button
            variant={sportFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSportFilter("all")}
            className="shrink-0"
          >
            All Sports
          </Button>
          {sports.map(sport => (
            <Button
              key={sport}
              variant={sportFilter === sport.toLowerCase() ? "default" : "outline"}
              size="sm"
              onClick={() => setSportFilter(sport.toLowerCase())}
              className="shrink-0"
            >
              {sport.toUpperCase()}
            </Button>
          ))}
        </div>
        
        {/* Games List */}
        <div className="space-y-4">
          {gamesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-2xl border bg-card p-4 animate-pulse">
                  <div className="h-6 w-24 bg-muted rounded mb-3" />
                  <div className="flex justify-between items-center mb-4">
                    <div className="h-10 w-32 bg-muted rounded" />
                    <div className="h-10 w-32 bg-muted rounded" />
                  </div>
                  <div className="h-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Games Available</h3>
              <p className="text-sm text-muted-foreground">
                No upcoming or live games found. Check back later.
              </p>
            </div>
          ) : (
            games.map(game => (
              <GamePickCard
                key={game.game_id}
                game={game}
                pendingPick={selectedPick?.gameId === game.game_id ? selectedPick : null}
                onSelectPick={setSelectedPick}
                isWatched={watchedGames.has(game.game_id)}
                onToggleWatch={() => handleToggleWatch(game.game_id, game)}
              />
            ))
          )}
        </div>
      </main>
      
      {/* Floating Confirm Button */}
      {selectedPick && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="container mx-auto max-w-lg">
            <div className="rounded-2xl border bg-card shadow-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">Your Pick</p>
                  <p className="font-semibold">{getPickDescription(selectedPick)}</p>
                </div>
                <Badge variant="outline" className="text-lg font-bold">
                  {formatOdds(selectedPick.odds)}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setSelectedPick(null)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 gap-2"
                  onClick={handleOpenConfirmation}
                >
                  <Check className="w-4 h-4" />
                  Lock Pick
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {selectedPick && selectedGame && (
        <PickConfirmationModal
          isOpen={showConfirmation}
          onClose={() => setShowConfirmation(false)}
          pick={selectedPick}
          game={selectedGame}
          onSubmit={handleSubmitPick}
        />
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 min-w-[300px]">
        {toasts.map(toast => (
          <ToastNotification 
            key={toast.id} 
            toast={toast} 
            onDismiss={() => removeToast(toast.id)} 
          />
        ))}
      </div>
    </div>
  );
}
