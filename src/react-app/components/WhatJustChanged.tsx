import { useState, useMemo } from "react";
import { 
  ChevronDown, 
  TrendingUp, 
  AlertCircle,
  Users,
  Zap,
  Minus
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

/**
 * WhatJustChanged - Live Intelligence Panel
 * 
 * Shows the 1-3 most important changes happening right now.
 * Always visible at top of live views, collapsible.
 * 
 * Tone: Calm, factual, no emojis, no hype, no betting language.
 * 
 * Change types:
 * - line_move: Significant line movement
 * - injury: Key player injury update
 * - pool_impact: Change affecting pools
 * - elimination: Players eliminated
 * - weather: Weather change affecting game
 */

export type ChangeType = "line_move" | "injury" | "pool_impact" | "elimination" | "weather";

export interface ChangeItem {
  id: string;
  type: ChangeType;
  priority: "high" | "medium" | "low";
  timestamp: Date;
  headline: string;
  detail?: string;
  gameId?: string;
  teams?: { away: string; home: string };
  metadata?: {
    // Line move specifics
    oldLine?: number;
    newLine?: number;
    direction?: "toward_home" | "toward_away";
    
    // Pool impact specifics
    poolCount?: number;
    exposurePercent?: number;
    eliminatedCount?: number;
    
    // Injury specifics
    player?: string;
    team?: string;
    status?: string;
  };
}

interface WhatJustChangedProps {
  changes: ChangeItem[];
  maxItems?: number;
  defaultExpanded?: boolean;
  className?: string;
  variant?: "default" | "compact" | "inline";
}

// Get icon for change type
function getChangeIcon(type: ChangeType) {
  switch (type) {
    case "line_move":
      return TrendingUp;
    case "injury":
      return AlertCircle;
    case "pool_impact":
      return Users;
    case "elimination":
      return Zap;
    case "weather":
      return AlertCircle;
    default:
      return Minus;
  }
}

// Individual change item component
function ChangeItemCard({ change, variant }: { change: ChangeItem; variant: "default" | "compact" | "inline" }) {
  const Icon = getChangeIcon(change.type);
  const isCompact = variant === "compact" || variant === "inline";
  
  // Use Tailwind classes directly based on type
  const colorClasses = useMemo(() => {
    const colors = {
      line_move: {
        bg: "bg-blue-500/10 dark:bg-blue-500/15",
        border: "border-blue-500/20 dark:border-blue-500/30",
        icon: "text-blue-600 dark:text-blue-400",
      },
      injury: {
        bg: "bg-red-500/10 dark:bg-red-500/15",
        border: "border-red-500/20 dark:border-red-500/30",
        icon: "text-red-600 dark:text-red-400",
      },
      pool_impact: {
        bg: "bg-amber-500/10 dark:bg-amber-500/15",
        border: "border-amber-500/20 dark:border-amber-500/30",
        icon: "text-amber-600 dark:text-amber-400",
      },
      elimination: {
        bg: "bg-purple-500/10 dark:bg-purple-500/15",
        border: "border-purple-500/20 dark:border-purple-500/30",
        icon: "text-purple-600 dark:text-purple-400",
      },
      weather: {
        bg: "bg-sky-500/10 dark:bg-sky-500/15",
        border: "border-sky-500/20 dark:border-sky-500/30",
        icon: "text-sky-600 dark:text-sky-400",
      },
    };
    return colors[change.type] || colors.pool_impact;
  }, [change.type]);
  
  // Format relative time
  const timeAgo = useMemo(() => {
    const now = new Date();
    const diff = now.getTime() - change.timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return change.timestamp.toLocaleDateString();
  }, [change.timestamp]);
  
  if (isCompact) {
    return (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg border",
        colorClasses.bg,
        colorClasses.border,
        change.priority === "high" && "ring-1 ring-inset ring-current/10"
      )}>
        <Icon className={cn("w-4 h-4 shrink-0", colorClasses.icon)} />
        <span className="text-sm font-medium flex-1 truncate">{change.headline}</span>
        <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
      </div>
    );
  }
  
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      colorClasses.bg,
      colorClasses.border,
      change.priority === "high" && "ring-1 ring-inset ring-current/10"
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          colorClasses.bg
        )}>
          <Icon className={cn("w-4 h-4", colorClasses.icon)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {change.type.replace("_", " ")}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          
          <p className="font-semibold leading-snug">{change.headline}</p>
          
          {change.detail && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {change.detail}
            </p>
          )}
        </div>
      </div>
      
      {/* Teams involved */}
      {change.teams && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-current/10">
          <TeamBadge teamName={change.teams.away} size="sm" />
          <span className="text-xs text-muted-foreground">@</span>
          <TeamBadge teamName={change.teams.home} size="sm" />
          {change.metadata?.oldLine !== undefined && change.metadata?.newLine !== undefined && (
            <span className="ml-auto text-sm font-semibold tabular-nums">
              {change.metadata.oldLine > 0 ? "+" : ""}{change.metadata.oldLine}
              <span className="mx-1.5 text-muted-foreground">→</span>
              {change.metadata.newLine > 0 ? "+" : ""}{change.metadata.newLine}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function WhatJustChanged({
  changes,
  maxItems = 3,
  defaultExpanded = true,
  className,
  variant = "default"
}: WhatJustChangedProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Sort by priority and recency, take top items
  const displayedChanges = useMemo(() => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return [...changes]
      .sort((a, b) => {
        // First by priority
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by recency
        return b.timestamp.getTime() - a.timestamp.getTime();
      })
      .slice(0, maxItems);
  }, [changes, maxItems]);
  
  const highPriorityCount = displayedChanges.filter(c => c.priority === "high").length;
  
  if (displayedChanges.length === 0) {
    return null;
  }
  
  if (variant === "inline") {
    return (
      <div className={cn("space-y-2", className)}>
        {displayedChanges.map(change => (
          <ChangeItemCard key={change.id} change={change} variant="inline" />
        ))}
      </div>
    );
  }
  
  return (
    <div className={cn(
      "rounded-2xl border border-border/50 bg-card overflow-hidden",
      highPriorityCount > 0 && "ring-1 ring-amber-500/20",
      className
    )}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn(
              "w-2 h-2 rounded-full",
              highPriorityCount > 0 ? "bg-amber-500" : "bg-green-500"
            )} />
            {highPriorityCount > 0 && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </div>
          <span className="font-semibold text-sm">What Just Changed</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {displayedChanges.length} update{displayedChanges.length !== 1 ? "s" : ""}
          </span>
        </div>
        
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform duration-200",
          isExpanded && "rotate-180"
        )} />
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
            {displayedChanges.map(change => (
              <ChangeItemCard key={change.id} change={change} variant={variant} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Demo data generator for testing
export function generateDemoChanges(): ChangeItem[] {
  const now = new Date();
  
  return [
    {
      id: "1",
      type: "line_move",
      priority: "high",
      timestamp: new Date(now.getTime() - 5 * 60000), // 5 min ago
      headline: "BUF -2.5 → -4 after Chris Jones ruled out",
      detail: "Sharp money moved the line 1.5 points. 72% of bets on KC but 64% of money on BUF.",
      teams: { away: "Kansas City Chiefs", home: "Buffalo Bills" },
      metadata: {
        oldLine: -2.5,
        newLine: -4,
        direction: "toward_home"
      }
    },
    {
      id: "2",
      type: "elimination",
      priority: "high",
      timestamp: new Date(now.getTime() - 12 * 60000), // 12 min ago
      headline: "7 players eliminated after DAL loss",
      detail: "Dallas covered +3 but lost outright. Survivor pools significantly impacted.",
      metadata: {
        eliminatedCount: 7,
        poolCount: 4
      }
    },
    {
      id: "3",
      type: "pool_impact",
      priority: "medium",
      timestamp: new Date(now.getTime() - 25 * 60000), // 25 min ago
      headline: "KC-BUF now affects 62% of active pools",
      detail: "High exposure game. Consider diversifying picks if not locked.",
      metadata: {
        poolCount: 12,
        exposurePercent: 62
      }
    },
    {
      id: "4",
      type: "injury",
      priority: "medium",
      timestamp: new Date(now.getTime() - 45 * 60000), // 45 min ago
      headline: "Giannis Antetokounmpo questionable vs Celtics",
      detail: "Knee soreness reported in morning shootaround. Game-time decision.",
      teams: { away: "Boston Celtics", home: "Milwaukee Bucks" },
      metadata: {
        player: "Giannis Antetokounmpo",
        team: "Milwaukee Bucks",
        status: "Questionable"
      }
    },
    {
      id: "5",
      type: "weather",
      priority: "low",
      timestamp: new Date(now.getTime() - 90 * 60000), // 90 min ago
      headline: "Snow expected in Buffalo, 15mph winds",
      detail: "Total dropped from 49 to 47.5. Weather typically favors unders.",
      teams: { away: "Kansas City Chiefs", home: "Buffalo Bills" },
    }
  ];
}
