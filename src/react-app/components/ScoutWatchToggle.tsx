/**
 * Coach G Watch Toggle
 * 
 * Toggle button to add/remove a game from Coach G's watch list.
 * Shows tier-based access (Pro+ required for live watching).
 * 
 * Variants:
 * - default: Full toggle with label and status
 * - compact: Icon-only toggle for cards
 * - pill: Slim pill-style toggle
 */

import { useState, useCallback } from "react";
import { Eye, EyeOff, Loader2, Lock, Crown, Clock, Sparkles } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";
import { cn } from "@/react-app/lib/utils";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Link } from "react-router-dom";

// ============================================================================
// TYPES
// ============================================================================

interface ScoutWatchToggleProps {
  gameId: string;
  isWatching?: boolean;
  variant?: "default" | "compact" | "pill";
  lastUpdate?: string;
  className?: string;
  onToggle?: (watching: boolean) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ScoutWatchToggle({
  gameId,
  isWatching: initialWatching = false,
  variant = "default",
  lastUpdate,
  className,
  onToggle,
}: ScoutWatchToggleProps) {
  const { subscription, hasFeature, loading: subLoading } = useSubscription();
  const { isDemoMode } = useDemoAuth();
  const [isWatching, setIsWatching] = useState(initialWatching);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user can use live watching (Pro+)
  const canWatch = hasFeature("LIVE_WATCHING");
  const userTier = subscription?.productKey || "free";
  const isElite = userTier === "scout_elite";
  const isLocked = !canWatch && !subLoading;

  // Toggle watch status
  const handleToggle = useCallback(async () => {
    if (isLocked || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const method = isWatching ? "DELETE" : "POST";
      const res = await fetch(`/api/live-watcher/games/${gameId}/watch`, {
        method,
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update watch status");
      }

      const newState = !isWatching;
      setIsWatching(newState);
      onToggle?.(newState);
    } catch (err) {
      console.error("Failed to toggle watch status:", err);
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsLoading(false);
    }
  }, [gameId, isWatching, isLocked, isLoading, isDemoMode, onToggle]);

  // Format last update time
  const formatLastUpdate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return "just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  // Locked state - show upgrade prompt
  if (isLocked) {
    if (variant === "compact") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/settings?tab=subscription">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 text-muted-foreground hover:text-foreground",
                    className
                  )}
                >
                  <Lock className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-semibold text-sm">Coach G Live Watch</p>
                <p className="text-xs text-muted-foreground">
                  Pro or Elite subscription required for real-time game monitoring.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Link to="/settings?tab=subscription" className={className}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-muted-foreground">
              Coach G Watch
            </span>
            <p className="text-xs text-muted-foreground/70">
              Pro+ required
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Crown className="h-3 w-3 mr-1" />
            Pro
          </Badge>
        </div>
      </Link>
    );
  }

  // Compact variant (for game cards in Command Center)
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isWatching ? "default" : "ghost"}
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleToggle();
              }}
              disabled={isLoading}
              className={cn(
                "h-8 w-8 transition-all",
                isWatching && "bg-primary/90 hover:bg-primary text-primary-foreground",
                !isWatching && "text-muted-foreground hover:text-foreground",
                className
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isWatching ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="space-y-1">
              <p className="font-semibold text-sm">
                {isWatching ? "Coach G is Watching" : "Add to Coach G Watch"}
              </p>
              {isWatching && lastUpdate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last update: {formatLastUpdate(lastUpdate)}
                </p>
              )}
              {isElite && isWatching && (
                <p className="text-xs text-blue-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Elite: Priority alerts enabled
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Pill variant
  if (variant === "pill") {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggle();
        }}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
          isWatching
            ? "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
            : "bg-muted/50 text-muted-foreground border border-border/50 hover:bg-muted hover:text-foreground",
          isLoading && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isWatching ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
        <span>{isWatching ? "Watching" : "Watch"}</span>
        {isElite && isWatching && (
          <Sparkles className="h-3 w-3 text-blue-400" />
        )}
      </button>
    );
  }

  // Default variant (full toggle with status)
  return (
    <div className={cn("space-y-2", className)}>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
          isWatching
            ? "bg-primary/5 border-primary/30 hover:bg-primary/10"
            : "bg-card border-border hover:bg-muted/50",
          isLoading && "opacity-50 cursor-not-allowed"
        )}
      >
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
            isWatching
              ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isWatching ? (
            <Eye className="h-5 w-5" />
          ) : (
            <EyeOff className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {isWatching ? "Coach G is Watching" : "Add to Coach G Watch"}
            </span>
            {isWatching && (
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isWatching
              ? "Real-time alerts for scoring, breaks, and big plays"
              : "Get notified of key moments in this game"}
          </p>
        </div>

        {isElite && isWatching && (
          <Badge variant="outline" className="border-blue-500/30 text-blue-400">
            <Sparkles className="h-3 w-3 mr-1" />
            Priority
          </Badge>
        )}
      </button>

      {/* Status info when watching */}
      {isWatching && lastUpdate && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Last update: {formatLastUpdate(lastUpdate)}
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Sparkles className="h-3 w-3" />
            Active
          </span>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
    </div>
  );
}

// ============================================================================
// AUTO-WATCH FOLLOWED TEAMS TOGGLE (Pro+ only)
// ============================================================================

interface AutoWatchToggleProps {
  enabled?: boolean;
  className?: string;
  onChange?: (enabled: boolean) => void;
}

export function AutoWatchFollowedTeamsToggle({
  enabled: initialEnabled = false,
  className,
  onChange,
}: AutoWatchToggleProps) {
  const { hasFeature, loading: subLoading } = useSubscription();
  const { isDemoMode } = useDemoAuth();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isLoading, setIsLoading] = useState(false);

  const canAutoWatch = hasFeature("LIVE_WATCHING");
  const isLocked = !canAutoWatch && !subLoading;

  const handleToggle = useCallback(async () => {
    if (isLocked || isLoading) return;

    setIsLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const res = await fetch("/api/live-watcher/settings/auto-watch", {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ enabled: !enabled }),
      });

      if (!res.ok) {
        throw new Error("Failed to update setting");
      }

      const newState = !enabled;
      setEnabled(newState);
      onChange?.(newState);
    } catch (err) {
      console.error("Failed to toggle auto-watch:", err);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isLocked, isLoading, isDemoMode, onChange]);

  if (isLocked) {
    return (
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-muted/20",
        className
      )}>
        <Lock className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <span className="text-sm font-medium text-muted-foreground">
            Auto-watch followed teams
          </span>
          <p className="text-xs text-muted-foreground/70">Pro+ required</p>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
        enabled
          ? "bg-primary/5 border-primary/30 hover:bg-primary/10"
          : "bg-card border-border hover:bg-muted/50",
        isLoading && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <div
        className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
          enabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Eye className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 text-left">
        <span className="font-semibold">Auto-watch followed teams</span>
        <p className="text-xs text-muted-foreground">
          Automatically watch games when your followed teams play
        </p>
      </div>

      <div
        className={cn(
          "w-11 h-6 rounded-full transition-colors flex items-center",
          enabled ? "bg-primary" : "bg-muted"
        )}
      >
        <div
          className={cn(
            "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </div>
    </button>
  );
}
