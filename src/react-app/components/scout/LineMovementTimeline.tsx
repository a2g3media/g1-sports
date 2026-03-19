/**
 * LineMovementTimeline - Premium visual timeline showing odds movement with cause annotations
 * Part of Scout Visual Intelligence system
 */

import { cn } from "@/react-app/lib/utils";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  CloudRain,
  UserX,
  Newspaper,
  Clock,
  ArrowRight
} from "lucide-react";
import { FreshnessBadge, FreshnessLevel } from "@/react-app/components/ui/freshness-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";

export interface LineMovementPoint {
  value: number;
  timestamp: string;
  cause?: {
    type: "injury" | "weather" | "news" | "steam" | "sharp" | "unknown";
    description: string;
  };
}

export interface LineMovementTimelineProps {
  gameId?: string;
  market: "spread" | "total" | "moneyline";
  team?: string;
  openLine: number;
  currentLine: number;
  closeLine?: number;
  points?: LineMovementPoint[];
  freshness?: FreshnessLevel;
  lastUpdated?: string;
  className?: string;
}

const causeIcons: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  injury: { icon: UserX, color: "text-red-400", bg: "bg-red-500/20" },
  weather: { icon: CloudRain, color: "text-blue-400", bg: "bg-blue-500/20" },
  news: { icon: Newspaper, color: "text-amber-400", bg: "bg-amber-500/20" },
  steam: { icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/20" },
  sharp: { icon: AlertTriangle, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  unknown: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/50" },
};

function formatLineValue(value: number, market: string): string {
  if (market === "moneyline") {
    return value > 0 ? `+${value}` : `${value}`;
  }
  if (market === "total") {
    return value.toFixed(1);
  }
  // Spread
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString([], { 
    month: "short", 
    day: "numeric",
    hour: "2-digit", 
    minute: "2-digit" 
  });
}

export function LineMovementTimeline({
  market,
  team,
  openLine,
  currentLine,
  closeLine,
  points = [],
  freshness = "fresh",
  lastUpdated,
  className,
}: LineMovementTimelineProps) {
  const change = currentLine - openLine;
  const trend = change > 0.1 ? "up" : change < -0.1 ? "down" : "flat";
  
  // Determine movement significance
  const isSignificant = market === "moneyline" 
    ? Math.abs(change) >= 15 
    : Math.abs(change) >= 0.5;

  // Build timeline points including open, intermediate movements, and current
  const timelinePoints = [
    { label: "Open", value: openLine, timestamp: points[0]?.timestamp, isAnchor: true },
    ...points.filter(p => p.cause).map(p => ({
      label: p.cause?.type || "Move",
      value: p.value,
      timestamp: p.timestamp,
      cause: p.cause,
      isAnchor: false,
    })),
    { label: "Current", value: currentLine, timestamp: lastUpdated, isAnchor: true },
  ];

  if (closeLine !== undefined && closeLine !== currentLine) {
    timelinePoints.push({ 
      label: "Close", 
      value: closeLine, 
      timestamp: undefined, 
      isAnchor: true 
    });
  }

  return (
    <div className={cn(
      "relative rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-4 overflow-hidden",
      className
    )}>
      {/* Ambient glow effect */}
      <div className={cn(
        "absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none",
        trend === "up" && "bg-emerald-500",
        trend === "down" && "bg-red-500",
        trend === "flat" && "bg-blue-500"
      )} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            trend === "up" && "bg-emerald-500/15 text-emerald-400",
            trend === "down" && "bg-red-500/15 text-red-400",
            trend === "flat" && "bg-blue-500/15 text-blue-400"
          )}>
            {trend === "up" && <TrendingUp className="w-4 h-4" />}
            {trend === "down" && <TrendingDown className="w-4 h-4" />}
            {trend === "flat" && <Minus className="w-4 h-4" />}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {market === "spread" ? "Spread" : market === "total" ? "Total" : "Moneyline"}
              {team && <span className="text-muted-foreground font-normal"> • {team}</span>}
            </h4>
            <p className={cn(
              "text-xs",
              isSignificant ? (trend === "up" ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
            )}>
              {change > 0 ? "+" : ""}{formatLineValue(change, market)} since open
              {isSignificant && " • Significant move"}
            </p>
          </div>
        </div>
        <FreshnessBadge level={freshness} timestamp={lastUpdated} compact />
      </div>

      {/* Main value display */}
      <div className="flex items-center justify-center gap-4 py-4 mb-4">
        <ValuePill 
          label="Open" 
          value={formatLineValue(openLine, market)} 
          muted 
        />
        <ArrowRight className={cn(
          "w-5 h-5",
          trend === "up" && "text-emerald-400",
          trend === "down" && "text-red-400",
          trend === "flat" && "text-muted-foreground"
        )} />
        <ValuePill 
          label="Current" 
          value={formatLineValue(currentLine, market)} 
          highlight
          trend={trend}
        />
        {closeLine !== undefined && closeLine !== currentLine && (
          <>
            <ArrowRight className="w-5 h-5 text-muted-foreground/50" />
            <ValuePill 
              label="Close" 
              value={formatLineValue(closeLine, market)} 
              muted 
            />
          </>
        )}
      </div>

      {/* Timeline visualization */}
      {points.length > 0 && (
        <div className="relative">
          {/* Timeline track */}
          <div className="absolute top-3 left-0 right-0 h-0.5 bg-gradient-to-r from-muted/50 via-border to-muted/50" />
          
          {/* Timeline points */}
          <div className="relative flex justify-between items-start px-2">
            {timelinePoints.map((point, idx) => (
              <TimelinePoint 
                key={idx}
                {...point}
                market={market}
                isFirst={idx === 0}
                isLast={idx === timelinePoints.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cause annotations */}
      {points.filter(p => p.cause).length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/50 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Movement Causes
          </p>
          <div className="flex flex-wrap gap-2">
            {points.filter(p => p.cause).map((p, idx) => {
              const config = causeIcons[p.cause!.type];
              const Icon = config.icon;
              return (
                <TooltipProvider key={idx}>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
                        config.bg, config.color
                      )}>
                        <Icon className="w-3 h-3" />
                        <span className="capitalize">{p.cause!.type}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">{p.cause!.description}</p>
                      {p.timestamp && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatFullTimestamp(p.timestamp)}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Value pill component
function ValuePill({ 
  label, 
  value, 
  muted = false,
  highlight = false,
  trend,
}: { 
  label: string; 
  value: string; 
  muted?: boolean;
  highlight?: boolean;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className={cn(
      "text-center px-4 py-2 rounded-lg transition-all",
      muted && "bg-muted/30",
      highlight && "bg-gradient-to-br shadow-lg",
      highlight && trend === "up" && "from-emerald-500/20 to-emerald-500/5 shadow-emerald-500/10",
      highlight && trend === "down" && "from-red-500/20 to-red-500/5 shadow-red-500/10",
      highlight && trend === "flat" && "from-blue-500/20 to-blue-500/5 shadow-blue-500/10",
    )}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p className={cn(
        "text-lg font-bold font-mono",
        muted && "text-muted-foreground",
        highlight && trend === "up" && "text-emerald-400",
        highlight && trend === "down" && "text-red-400",
        highlight && trend === "flat" && "text-foreground",
      )}>
        {value}
      </p>
    </div>
  );
}

// Timeline point component
function TimelinePoint({
  label,
  value,
  timestamp,
  cause,
  market,
  isFirst,
  isLast,
  isAnchor,
}: {
  label: string;
  value: number;
  timestamp?: string;
  cause?: { type: string; description: string };
  market: string;
  isFirst?: boolean;
  isLast?: boolean;
  isAnchor?: boolean;
}) {
  const config = cause ? causeIcons[cause.type] : null;
  const Icon = config?.icon;

  return (
    <div className={cn(
      "flex flex-col items-center",
      isFirst && "items-start",
      isLast && "items-end"
    )}>
      {/* Dot */}
      <div className={cn(
        "w-2.5 h-2.5 rounded-full border-2 relative z-10",
        isAnchor ? "bg-background border-primary" : cn(config?.bg, "border-transparent"),
        cause && config?.color
      )}>
        {Icon && (
          <div className={cn(
            "absolute -top-5 left-1/2 -translate-x-1/2 w-4 h-4 rounded flex items-center justify-center",
            config?.bg
          )}>
            <Icon className={cn("w-2.5 h-2.5", config?.color)} />
          </div>
        )}
      </div>
      
      {/* Label & value */}
      <div className={cn(
        "mt-2 text-center",
        isFirst && "text-left",
        isLast && "text-right"
      )}>
        <p className="text-[10px] text-muted-foreground capitalize">
          {cause ? cause.type : label}
        </p>
        <p className="text-xs font-mono font-medium">
          {formatLineValue(value, market)}
        </p>
        {timestamp && (
          <p className="text-[9px] text-muted-foreground/70">
            {formatTimestamp(timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

// Compact version for smaller spaces
export function LineMovementTimelineCompact({
  market,
  openLine,
  currentLine,
  trend: trendOverride,
  className,
}: {
  market: "spread" | "total" | "moneyline";
  openLine: number;
  currentLine: number;
  trend?: "up" | "down" | "flat";
  className?: string;
}) {
  const change = currentLine - openLine;
  const trend = trendOverride || (change > 0.1 ? "up" : change < -0.1 ? "down" : "flat");

  return (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30",
      className
    )}>
      <span className="text-xs text-muted-foreground font-mono">
        {formatLineValue(openLine, market)}
      </span>
      <ArrowRight className={cn(
        "w-3 h-3",
        trend === "up" && "text-emerald-400",
        trend === "down" && "text-red-400",
        trend === "flat" && "text-muted-foreground"
      )} />
      <span className={cn(
        "text-xs font-mono font-medium",
        trend === "up" && "text-emerald-400",
        trend === "down" && "text-red-400",
        trend === "flat" && "text-foreground"
      )}>
        {formatLineValue(currentLine, market)}
      </span>
      <span className={cn(
        "text-[10px] px-1 py-0.5 rounded",
        trend === "up" && "text-emerald-400 bg-emerald-500/10",
        trend === "down" && "text-red-400 bg-red-500/10",
        trend === "flat" && "text-muted-foreground bg-muted/50"
      )}>
        {change > 0 ? "+" : ""}{formatLineValue(change, market)}
      </span>
    </div>
  );
}
