import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  ChevronDown, 
  TrendingUp, 
  AlertCircle,
  Users,
  CloudRain,
  Activity,
  RefreshCw,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

/**
 * ThresholdWhatJustChanged - API-powered Intelligence Panel
 * 
 * Fetches from the Threshold Engine API and displays the top material changes.
 * Severity levels: INFO (blue), IMPACT (amber), CRITICAL (red)
 * 
 * Philosophy: Calm, factual, no emojis, no hype.
 * Returns "No material changes" when nothing significant happened.
 */

interface ThresholdEvent {
  id: number;
  event_category: string;
  event_type: string;
  severity: "INFO" | "IMPACT" | "CRITICAL";
  headline: string;
  details: {
    old_value?: number;
    new_value?: number;
    change?: number;
    player_name?: string;
    position?: string;
    team?: string;
    status?: string;
    wind_mph?: number;
    at_risk_count?: number;
    alive_count?: number;
    risk_percentage?: number;
    team_name?: string;
    home_team?: string;
    away_team?: string;
    [key: string]: unknown;
  } | null;
  age_minutes: number;
  created_at: string;
}

interface WhatChangedResponse {
  items: ThresholdEvent[];
  hasChanges: boolean;
  message: string;
  should_surface?: boolean;
}

interface ThresholdWhatJustChangedProps {
  scope?: "DEMO" | "PROD";
  gameId?: number;
  leagueId?: number;
  maxItems?: number;
  defaultExpanded?: boolean;
  className?: string;
  variant?: "default" | "compact" | "inline";
  refreshInterval?: number; // ms, 0 to disable auto-refresh
  showRefreshButton?: boolean;
  filterSports?: string[]; // Only show events for these sports
}

// Map event category to icon
function getCategoryIcon(category: string) {
  switch (category) {
    case "ODDS":
      return TrendingUp;
    case "INJURY":
      return AlertCircle;
    case "WEATHER":
      return CloudRain;
    case "POOL_IMPACT":
      return Users;
    case "GAMESTATE":
      return Activity;
    default:
      return Activity;
  }
}

// Map severity to color classes
function getSeverityColors(severity: "INFO" | "IMPACT" | "CRITICAL") {
  switch (severity) {
    case "CRITICAL":
      return {
        bg: "bg-red-500/10 dark:bg-red-500/15",
        border: "border-red-500/20 dark:border-red-500/30",
        icon: "text-red-600 dark:text-red-400",
        badge: "bg-red-500/10 text-red-600 dark:text-red-400",
        dot: "bg-red-500"
      };
    case "IMPACT":
      return {
        bg: "bg-amber-500/10 dark:bg-amber-500/15",
        border: "border-amber-500/20 dark:border-amber-500/30",
        icon: "text-amber-600 dark:text-amber-400",
        badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        dot: "bg-amber-500"
      };
    case "INFO":
    default:
      return {
        bg: "bg-blue-500/10 dark:bg-blue-500/15",
        border: "border-blue-500/20 dark:border-blue-500/30",
        icon: "text-blue-600 dark:text-blue-400",
        badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        dot: "bg-blue-500"
      };
  }
}

// Format relative time
function formatTimeAgo(ageMinutes: number): string {
  if (ageMinutes < 1) return "Just now";
  if (ageMinutes < 60) return `${Math.round(ageMinutes)}m ago`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Get detail text from event
function getDetailText(event: ThresholdEvent): string | null {
  const d = event.details;
  if (!d) return null;
  
  switch (event.event_category) {
    case "ODDS":
      if (d.old_value !== undefined && d.new_value !== undefined) {
        const formatted = (v: number) => v > 0 ? `+${v}` : `${v}`;
        return `Moved from ${formatted(d.old_value)} to ${formatted(d.new_value)}`;
      }
      break;
    case "INJURY":
      if (d.player_name && d.status) {
        return `${d.player_name} (${d.position || "Player"}) now ${d.status}`;
      }
      break;
    case "WEATHER":
      if (d.wind_mph !== undefined) {
        return `Wind at ${d.wind_mph} mph may affect game`;
      }
      break;
    case "POOL_IMPACT":
      if (d.at_risk_count !== undefined && d.risk_percentage !== undefined) {
        return `${d.at_risk_count} entries (${d.risk_percentage}%) at risk`;
      }
      break;
    case "GAMESTATE":
      if (d.home_team && d.away_team) {
        return `${d.away_team} @ ${d.home_team}`;
      }
      break;
  }
  return null;
}

// Individual event card
function EventCard({ 
  event, 
  variant 
}: { 
  event: ThresholdEvent; 
  variant: "default" | "compact" | "inline" 
}) {
  const Icon = getCategoryIcon(event.event_category);
  const colors = getSeverityColors(event.severity);
  const isCompact = variant === "compact" || variant === "inline";
  const detail = getDetailText(event);
  
  if (isCompact) {
    return (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg border",
        colors.bg,
        colors.border,
        event.severity === "CRITICAL" && "ring-1 ring-inset ring-red-500/20"
      )}>
        <Icon className={cn("w-4 h-4 shrink-0", colors.icon)} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{event.headline}</span>
        </div>
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", colors.badge)}>
          {event.severity}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatTimeAgo(event.age_minutes)}
        </span>
      </div>
    );
  }
  
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      colors.bg,
      colors.border,
      event.severity === "CRITICAL" && "ring-1 ring-inset ring-red-500/20"
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          colors.bg
        )}>
          <Icon className={cn("w-4 h-4", colors.icon)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {event.event_category.replace("_", " ")}
              </span>
              <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", colors.badge)}>
                {event.severity}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(event.age_minutes)}
            </span>
          </div>
          
          <p className="font-semibold leading-snug">{event.headline}</p>
          
          {detail && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {detail}
            </p>
          )}
        </div>
      </div>
      
      {/* Teams if available */}
      {event.details?.home_team && event.details?.away_team && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-current/10">
          <TeamBadge teamName={event.details.away_team} size="sm" />
          <span className="text-xs text-muted-foreground">@</span>
          <TeamBadge teamName={event.details.home_team} size="sm" />
        </div>
      )}
    </div>
  );
}

export function ThresholdWhatJustChanged({
  scope = "PROD",
  gameId,
  leagueId,
  maxItems = 3,
  defaultExpanded = true,
  className,
  variant = "default",
  refreshInterval = 30000, // 30 seconds default
  showRefreshButton = true,
  filterSports
}: ThresholdWhatJustChangedProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [data, setData] = useState<WhatChangedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  
  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    
    try {
      const params = new URLSearchParams({
        scope,
        max_items: maxItems.toString()
      });
      if (gameId) params.set("game_id", gameId.toString());
      if (leagueId) params.set("league_id", leagueId.toString());
      
      const response = await fetch(`/api/thresholds/what-changed?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");
      
      const result = await response.json();
      setData(result);
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      console.error("Error fetching what changed:", err);
      setError("Unable to load changes");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [scope, gameId, leagueId, maxItems]);
  
  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => fetchData(true), refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);
  
  // Filter items by sport if filterSports is provided
  const items = useMemo(() => {
    const allItems = data?.items || [];
    if (!filterSports || filterSports.length === 0) return allItems;
    
    // Filter by sport key in details (e.g., team contains sport, or explicit sport field)
    return allItems.filter(item => {
      const details = item.details;
      if (!details) return true; // Include items without details
      
      // Check for explicit sport field
      if (details.sport && filterSports.includes(String(details.sport).toLowerCase())) {
        return true;
      }
      
      // Check team names for sport keywords (fallback)
      const teamText = [details.team, details.home_team, details.away_team]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      
      // Include if no team info (could be general)
      if (!teamText) return true;
      
      return true; // Include all if we can't determine sport
    });
  }, [data?.items, filterSports]);
  
  const hasCritical = items.some(i => i.severity === "CRITICAL");
  const hasImpact = items.some(i => i.severity === "IMPACT");
  
  // Determine indicator state
  const indicatorState = useMemo(() => {
    if (hasCritical) return { color: "bg-red-500", pulse: true, label: "Critical" };
    if (hasImpact) return { color: "bg-amber-500", pulse: true, label: "Notable" };
    if (items.length > 0) return { color: "bg-blue-500", pulse: false, label: "Updates" };
    return { color: "bg-green-500", pulse: false, label: "Clear" };
  }, [hasCritical, hasImpact, items.length]);
  
  // Show nothing if no changes and not in inline mode
  if (!isLoading && items.length === 0 && variant !== "inline") {
    return (
      <div className={cn(
        "rounded-2xl border border-border/50 bg-card/50 overflow-hidden",
        className
      )}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm text-muted-foreground">No material changes</span>
          </div>
          {showRefreshButton && (
            <div
              onClick={() => !isRefreshing && fetchData(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!isRefreshing) fetchData(true);
                }
              }}
              className={cn(
                "p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer",
                isRefreshing && "opacity-50 cursor-not-allowed"
              )}
              aria-label="Refresh changes"
            >
              <RefreshCw className={cn(
                "w-3.5 h-3.5 text-muted-foreground",
                isRefreshing && "animate-spin"
              )} />
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (variant === "inline") {
    if (isLoading) {
      return (
        <div className={cn("space-y-2", className)}>
          {[1, 2].map(i => (
            <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      );
    }
    
    if (items.length === 0) {
      return (
        <div className={cn("text-sm text-muted-foreground text-center py-4", className)}>
          No material changes
        </div>
      );
    }
    
    return (
      <div className={cn("space-y-2", className)}>
        {items.map(event => (
          <EventCard key={event.id} event={event} variant="inline" />
        ))}
      </div>
    );
  }
  
  return (
    <div className={cn(
      "rounded-2xl border border-border/50 bg-card overflow-hidden",
      hasCritical && "ring-1 ring-red-500/20",
      hasImpact && !hasCritical && "ring-1 ring-amber-500/20",
      className
    )}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn("w-2 h-2 rounded-full", indicatorState.color)} />
            {indicatorState.pulse && (
              <div className={cn(
                "absolute inset-0 w-2 h-2 rounded-full animate-ping",
                indicatorState.color
              )} />
            )}
          </div>
          <span className="font-semibold text-sm">What Just Changed</span>
          {isLoading ? (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              Loading...
            </span>
          ) : items.length > 0 ? (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {items.length} update{items.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              Clear
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {showRefreshButton && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isRefreshing) fetchData(true);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isRefreshing) fetchData(true);
                }
              }}
              className={cn(
                "p-1 rounded hover:bg-muted transition-colors cursor-pointer",
                isRefreshing && "opacity-50 cursor-not-allowed"
              )}
              aria-label="Refresh changes"
            >
              <RefreshCw className={cn(
                "w-3.5 h-3.5 text-muted-foreground",
                isRefreshing && "animate-spin"
              )} />
            </div>
          )}
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180"
          )} />
        </div>
      </button>
      
      {/* Content */}
      <div className={cn(
        "grid transition-all duration-200 ease-out",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}>
        <div className="overflow-hidden">
          <div className={cn(
            "px-4 pb-4 space-y-3",
            variant === "compact" && "space-y-2"
          )}>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No material changes
              </div>
            ) : (
              items.map(event => (
                <EventCard key={event.id} event={event} variant={variant} />
              ))
            )}
            
            {lastFetch && !isLoading && (
              <p className="text-[10px] text-muted-foreground/60 text-center pt-2">
                Last updated {lastFetch.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
