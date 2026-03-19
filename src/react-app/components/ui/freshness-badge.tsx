import { cn } from "@/react-app/lib/utils";
import { Clock, Zap, AlertTriangle, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";

export type FreshnessLevel = "live" | "fresh" | "recent" | "aging" | "stale" | "unknown";

interface FreshnessBadgeProps {
  level: FreshnessLevel;
  timestamp?: string;
  source?: string;
  compact?: boolean;
  className?: string;
}

const freshnessConfig: Record<FreshnessLevel, {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
  pulseColor?: string;
  description: string;
}> = {
  live: {
    icon: Zap,
    label: "LIVE",
    color: "text-green-500",
    bgColor: "bg-green-500/15",
    pulseColor: "bg-green-500",
    description: "Real-time data, updated within seconds",
  },
  fresh: {
    icon: Clock,
    label: "Fresh",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "Recently updated within the last few minutes",
  },
  recent: {
    icon: Clock,
    label: "Recent",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    description: "Updated within the last hour",
  },
  aging: {
    icon: Clock,
    label: "Aging",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    description: "Data may be several hours old",
  },
  stale: {
    icon: AlertTriangle,
    label: "Stale",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Data is outdated, may not reflect current state",
  },
  unknown: {
    icon: HelpCircle,
    label: "Unknown",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    description: "Data freshness could not be determined",
  },
};

export function FreshnessBadge({ 
  level, 
  timestamp, 
  source, 
  compact = false,
  className 
}: FreshnessBadgeProps) {
  const config = freshnessConfig[level];
  const Icon = config.icon;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium transition-colors",
        config.color,
        config.bgColor,
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className
      )}
    >
      {level === "live" && config.pulseColor && (
        <span className="relative flex h-2 w-2">
          <span className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            config.pulseColor
          )} />
          <span className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            config.pulseColor
          )} />
        </span>
      )}
      {level !== "live" && <Icon className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3")} />}
      {!compact && config.label}
    </span>
  );

  if (timestamp || source) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-xs">{config.description}</p>
              {source && (
                <p className="text-xs text-muted-foreground">Source: {source}</p>
              )}
              {timestamp && (
                <p className="text-xs text-muted-foreground">Updated: {timestamp}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

// Parse freshness indicator from formatted AI response
export function parseFreshnessFromResponse(text: string): {
  level: FreshnessLevel;
  timestamp?: string;
} | null {
  // Match patterns like [🟢 2m ago • Recently updated] or [🟡 15m ago]
  const freshnessMatch = text.match(/\[(🟢|🟡|🟠|🔴|⚪)\s+([^•\]]+?)(?:\s+•\s+[^\]]+)?\]/);
  
  if (!freshnessMatch) return null;

  const [, indicator, timestamp] = freshnessMatch;
  
  const levelMap: Record<string, FreshnessLevel> = {
    "🟢": "live",
    "🟡": "fresh",
    "🟠": "aging",
    "🔴": "stale",
    "⚪": "unknown",
  };

  return {
    level: levelMap[indicator] || "unknown",
    timestamp: timestamp?.trim(),
  };
}

// Inline freshness indicator for use within text
export function InlineFreshnessIndicator({ 
  level,
  className 
}: { 
  level: FreshnessLevel; 
  className?: string;
}) {
  // freshnessConfig[level] available if needed for future enhancements
  
  return (
    <span className={cn("inline-flex items-center", className)}>
      {level === "live" ? (
        <span className="relative flex h-1.5 w-1.5 mx-0.5">
          <span className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            "bg-green-500"
          )} />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
        </span>
      ) : (
        <span className={cn(
          "w-1.5 h-1.5 rounded-full mx-0.5",
          level === "fresh" && "bg-blue-500",
          level === "recent" && "bg-cyan-500",
          level === "aging" && "bg-amber-500",
          level === "stale" && "bg-orange-500",
          level === "unknown" && "bg-muted-foreground"
        )} />
      )}
    </span>
  );
}

// Data source header with freshness
interface DataSourceHeaderProps {
  icon?: string;
  name: string;
  freshness: FreshnessLevel;
  timestamp?: string;
  className?: string;
}

export function DataSourceHeader({ 
  icon, 
  name, 
  freshness, 
  timestamp,
  className 
}: DataSourceHeaderProps) {
  return (
    <div className={cn(
      "flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50 text-xs",
      className
    )}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon && <span>{icon}</span>}
        <span className="font-medium">{name}</span>
      </span>
      <FreshnessBadge level={freshness} timestamp={timestamp} compact />
    </div>
  );
}
