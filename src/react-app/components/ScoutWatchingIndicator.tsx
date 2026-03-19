/**
 * Scout is Watching Indicator
 * 
 * Shows users when Scout is actively monitoring their games in real-time.
 * Displays:
 * - Live watching status
 * - Number of games being monitored
 * - Quick access to watched games
 * - Animated indicator when watching
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, Sparkles, Activity, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/react-app/components/ui/popover";
import { Badge } from "@/react-app/components/ui/badge";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

// ============================================================================
// TYPES
// ============================================================================

interface WatchedGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  status: "SCHEDULED" | "PREGAME" | "IN_PROGRESS" | "HALFTIME" | "FINAL";
  homeScore?: number;
  awayScore?: number;
  period?: string;
  isLive: boolean;
}

interface WatchingStatus {
  isWatching: boolean;
  totalGames: number;
  liveGames: number;
  upcomingGames: number;
  games: WatchedGame[];
}

// ============================================================================
// COMPACT VARIANT (for header)
// ============================================================================

export function ScoutWatchingIndicator({ variant = "default" }: { variant?: "default" | "compact" }) {
  const { isDemoMode } = useDemoAuth();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const [status, setStatus] = useState<WatchingStatus>({
    isWatching: false,
    totalGames: 0,
    liveGames: 0,
    upcomingGames: 0,
    games: [],
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Fetch watching status
  const fetchStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const res = await fetch(`/api/live-watcher/status?scope=${scope}`, {
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        if (res.status === 401) {
          setStatus({
            isWatching: false,
            totalGames: 0,
            liveGames: 0,
            upcomingGames: 0,
            games: [],
          });
          return;
        }
        throw new Error("Failed to fetch watching status");
      }

      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Failed to fetch Scout watching status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [scope, isDemoMode]);

  if (loading) {
    return variant === "compact" ? (
      <Button variant="ghost" size="icon" disabled className="relative">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Button>
    ) : null;
  }

  if (!status.isWatching || status.totalGames === 0) {
    // Not watching anything - show subtle inactive state
    return variant === "compact" ? (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Eye className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end" sideOffset={8}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Scout Live Watch</h4>
                <p className="text-xs text-muted-foreground">Not watching any games</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Follow games or add them to your watchlist to enable Scout's real-time monitoring and alerts.
            </p>
            <div className="flex gap-2">
              <Link to="/intel" className="flex-1">
                <Button size="sm" className="w-full text-xs">
                  Browse Games
                </Button>
              </Link>
              <Link to="/watchlist" className="flex-1">
                <Button size="sm" variant="outline" className="w-full text-xs">
                  Watchlist
                </Button>
              </Link>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    ) : null;
  }

  // Watching games - show active state
  if (variant === "compact") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative group">
            <Eye className="h-4 w-4 text-primary" />
            {status.liveGames > 0 && (
              <>
                <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background animate-pulse" />
                <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background animate-ping" />
              </>
            )}
            {status.totalGames > 0 && (
              <Badge
                variant="secondary"
                className="absolute -bottom-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] font-bold border-2 border-background"
              >
                {status.totalGames}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96" align="end" sideOffset={8}>
          <ScoutWatchingPopoverContent status={status} onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    );
  }

  // Default variant (for other placements)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/15 hover:to-primary/10 border border-primary/20 transition-all group">
          <div className="relative">
            <Eye className="h-4 w-4 text-primary" />
            {status.liveGames > 0 && (
              <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-background animate-pulse" />
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">Scout is Watching</span>
              {status.liveGames > 0 && (
                <Activity className="h-3 w-3 text-green-500" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {status.liveGames > 0 
                ? `${status.liveGames} live • ${status.totalGames} total`
                : `${status.totalGames} game${status.totalGames === 1 ? '' : 's'}`
              }
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end" sideOffset={8}>
        <ScoutWatchingPopoverContent status={status} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// POPOVER CONTENT
// ============================================================================

function ScoutWatchingPopoverContent({ 
  status, 
  onClose 
}: { 
  status: WatchingStatus;
  onClose: () => void;
}) {
  const liveGames = status.games.filter(g => g.isLive);
  const upcomingGames = status.games.filter(g => !g.isLive);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
          <Eye className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold flex items-center gap-2">
            Scout is Watching
            {status.liveGames > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold uppercase">
                <Activity className="h-2.5 w-2.5" />
                Live
              </span>
            )}
          </h4>
          <p className="text-xs text-muted-foreground">
            Real-time monitoring for {status.totalGames} game{status.totalGames === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Live Now</span>
            {status.liveGames > 0 && (
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <p className="text-lg font-bold text-green-600">{status.liveGames}</p>
        </div>
        <div className="rounded-lg border bg-card p-2.5">
          <span className="text-xs text-muted-foreground">Upcoming</span>
          <p className="text-lg font-bold">{status.upcomingGames}</p>
        </div>
      </div>

      {/* Live Games */}
      {liveGames.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-green-500" />
            <h5 className="text-xs font-semibold text-green-600 uppercase">Live Games</h5>
          </div>
          <div className="space-y-1.5">
            {liveGames.slice(0, 3).map((game) => (
              <Link
                key={game.gameId}
                to={`/game/${game.gameId}`}
                onClick={onClose}
                className="block"
              >
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className="truncate">{game.awayTeam}</span>
                      <span className="text-muted-foreground">@</span>
                      <span className="truncate">{game.homeTeam}</span>
                    </div>
                    {game.homeScore !== undefined && game.awayScore !== undefined && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold text-primary">
                          {game.awayScore} - {game.homeScore}
                        </span>
                        {game.period && (
                          <span className="text-[10px] text-muted-foreground">
                            {game.period}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
            {liveGames.length > 3 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{liveGames.length - 3} more live
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Games */}
      {upcomingGames.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-muted-foreground uppercase">Upcoming</h5>
          <div className="space-y-1.5">
            {upcomingGames.slice(0, 3).map((game) => (
              <Link
                key={game.gameId}
                to={`/game/${game.gameId}`}
                onClick={onClose}
                className="block"
              >
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className="truncate">{game.awayTeam}</span>
                      <span className="text-muted-foreground">@</span>
                      <span className="truncate">{game.homeTeam}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {game.league} • {game.status}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
            {upcomingGames.length > 3 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{upcomingGames.length - 3} more upcoming
              </p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t space-y-2">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          <p>
            Scout monitors these games for scoring events, period breaks, and dominant performances,
            delivering real-time alerts based on your preferences.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/watchlist" className="flex-1" onClick={onClose}>
            <Button size="sm" variant="outline" className="w-full text-xs">
              Manage Watchlist
            </Button>
          </Link>
          <Link to="/settings" className="flex-1" onClick={onClose}>
            <Button size="sm" variant="outline" className="w-full text-xs">
              Alert Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FLOATING WIDGET (alternative placement)
// ============================================================================

export function ScoutWatchingWidget() {
  const { isDemoMode } = useDemoAuth();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const [status, setStatus] = useState<WatchingStatus>({
    isWatching: false,
    totalGames: 0,
    liveGames: 0,
    upcomingGames: 0,
    games: [],
  });
  const [expanded, setExpanded] = useState(false);

  // Fetch watching status
  const fetchStatus = async () => {
    try {
      const headers: Record<string, string> = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const res = await fetch(`/api/live-watcher/status?scope=${scope}`, {
        credentials: "include",
        headers,
      });

      if (!res.ok) return;

      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Failed to fetch Scout watching status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [scope, isDemoMode]);

  if (!status.isWatching || status.liveGames === 0) {
    return null; // Only show widget when watching live games
  }

  return (
    <div className="fixed bottom-20 right-4 z-40">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-all",
          "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground",
          "hover:shadow-xl hover:scale-105 active:scale-95",
          expanded && "rounded-2xl"
        )}
      >
        <div className="relative">
          <Eye className="h-4 w-4" />
          <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 ring-2 ring-primary animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold">Scout Watching</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold">
            {status.liveGames}
          </Badge>
        </div>
        {expanded && (
          <Activity className="h-3.5 w-3.5 animate-pulse" />
        )}
      </button>

      {expanded && (
        <div className="absolute bottom-full right-0 mb-2 w-80 p-3 rounded-2xl bg-background border shadow-xl">
          <ScoutWatchingPopoverContent status={status} onClose={() => setExpanded(false)} />
        </div>
      )}
    </div>
  );
}
