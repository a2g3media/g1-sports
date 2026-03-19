/**
 * FormStrip - Display last N game results as visual indicators
 * Part of Scout Visual Intelligence system
 */

import { cn } from "@/react-app/lib/utils";
import { 
  CheckCircle2, 
  XCircle, 
  MinusCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";
import { FreshnessBadge, FreshnessLevel } from "@/react-app/components/ui/freshness-badge";

export type GameResult = "W" | "L" | "D" | "OTW" | "OTL" | "P";

export interface FormGame {
  result: GameResult;
  opponent?: string;
  score?: string;
  date?: string;
  isHome?: boolean;
  competition?: string;
}

export interface FormStripProps {
  team: string;
  games: FormGame[];
  sport?: "soccer" | "nfl" | "nba" | "nhl" | "mlb" | "tennis" | "default";
  showLabels?: boolean;
  freshness?: FreshnessLevel;
  lastUpdated?: string;
  className?: string;
}

const resultConfig: Record<GameResult, {
  color: string;
  bg: string;
  glow: string;
  icon: React.ElementType;
  label: string;
}> = {
  W: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    glow: "shadow-emerald-500/30",
    icon: CheckCircle2,
    label: "Win",
  },
  L: {
    color: "text-red-400",
    bg: "bg-red-500/20",
    glow: "shadow-red-500/30",
    icon: XCircle,
    label: "Loss",
  },
  D: {
    color: "text-amber-400",
    bg: "bg-amber-500/20",
    glow: "shadow-amber-500/30",
    icon: MinusCircle,
    label: "Draw",
  },
  OTW: {
    color: "text-emerald-300",
    bg: "bg-emerald-500/15",
    glow: "shadow-emerald-500/20",
    icon: CheckCircle2,
    label: "OT Win",
  },
  OTL: {
    color: "text-orange-400",
    bg: "bg-orange-500/20",
    glow: "shadow-orange-500/30",
    icon: XCircle,
    label: "OT Loss",
  },
  P: {
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    glow: "",
    icon: MinusCircle,
    label: "Postponed",
  },
};

function calculateFormRating(games: FormGame[]): { rating: number; trend: "up" | "down" | "flat" } {
  const points: number[] = games.map(g => {
    switch (g.result) {
      case "W": return 3;
      case "OTW": return 2.5;
      case "D": return 1;
      case "OTL": return 0.5;
      case "L": return 0;
      default: return 0;
    }
  });
  
  const total = points.reduce((a, b) => a + b, 0);
  const max = games.filter(g => g.result !== "P").length * 3;
  const rating = max > 0 ? (total / max) * 100 : 0;
  
  // Calculate trend (compare first half to second half)
  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid).reduce((a, b) => a + b, 0);
  const secondHalf = points.slice(mid).reduce((a, b) => a + b, 0);
  const trend = secondHalf > firstHalf ? "up" : secondHalf < firstHalf ? "down" : "flat";
  
  return { rating, trend };
}

export function FormStrip({
  team,
  games,
  showLabels = true,
  freshness = "fresh",
  lastUpdated,
  className,
}: FormStripProps) {
  const { rating, trend } = calculateFormRating(games);
  const wins = games.filter(g => g.result === "W" || g.result === "OTW").length;
  const losses = games.filter(g => g.result === "L" || g.result === "OTL").length;
  const draws = games.filter(g => g.result === "D").length;

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-4",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center",
            trend === "up" && "bg-emerald-500/15 text-emerald-400",
            trend === "down" && "bg-red-500/15 text-red-400",
            trend === "flat" && "bg-blue-500/15 text-blue-400"
          )}>
            {trend === "up" && <TrendingUp className="w-4 h-4" />}
            {trend === "down" && <TrendingDown className="w-4 h-4" />}
            {trend === "flat" && <Minus className="w-4 h-4" />}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{team}</h4>
            <p className="text-xs text-muted-foreground">
              Last {games.length} games
            </p>
          </div>
        </div>
        <FreshnessBadge level={freshness} timestamp={lastUpdated} compact />
      </div>

      {/* Form strip */}
      <div className="flex items-center gap-1.5 mb-3">
        <TooltipProvider>
          {games.map((game, idx) => {
            const config = resultConfig[game.result];
            const Icon = config.icon;
            
            return (
              <Tooltip key={idx} delayDuration={200}>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "relative w-8 h-8 rounded-lg flex items-center justify-center cursor-default transition-all hover:scale-110",
                    config.bg,
                    config.glow && "shadow-sm hover:shadow-md",
                    config.glow
                  )}>
                    <Icon className={cn("w-4 h-4", config.color)} />
                    {game.isHome !== undefined && (
                      <span className={cn(
                        "absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-medium",
                        "text-muted-foreground/70"
                      )}>
                        {game.isHome ? "H" : "A"}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-xs">
                      <span className={config.color}>{config.label}</span>
                      {game.opponent && ` vs ${game.opponent}`}
                    </p>
                    {game.score && (
                      <p className="text-xs font-mono">{game.score}</p>
                    )}
                    {game.date && (
                      <p className="text-xs text-muted-foreground">{game.date}</p>
                    )}
                    {game.competition && (
                      <p className="text-[10px] text-muted-foreground">{game.competition}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Summary */}
      {showLabels && (
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-400 font-medium">{wins}W</span>
            </span>
            {draws > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-amber-400 font-medium">{draws}D</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-400 font-medium">{losses}L</span>
            </span>
          </div>
          
          {/* Form rating bar */}
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all",
                  rating >= 60 && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                  rating >= 40 && rating < 60 && "bg-gradient-to-r from-amber-500 to-amber-400",
                  rating < 40 && "bg-gradient-to-r from-red-500 to-red-400"
                )}
                style={{ width: `${rating}%` }}
              />
            </div>
            <span className={cn(
              "text-xs font-bold",
              rating >= 60 && "text-emerald-400",
              rating >= 40 && rating < 60 && "text-amber-400",
              rating < 40 && "text-red-400"
            )}>
              {Math.round(rating)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline compact version
export function FormStripInline({
  games,
  className,
}: {
  games: FormGame[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {games.map((game, idx) => {
        const cfg = resultConfig[game.result];
        return (
          <span 
            key={idx}
            className={cn(
              "w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center",
              cfg.bg, cfg.color
            )}
          >
            {game.result}
          </span>
        );
      })}
    </div>
  );
}

// Minimal dot-only version
export function FormDots({
  games,
  size = "sm",
  className,
}: {
  games: FormGame[];
  size?: "sm" | "md";
  className?: string;
}) {
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {games.map((game, idx) => (
        <span 
          key={idx}
          className={cn(
            "rounded-full",
            dotSize,
            game.result === "W" || game.result === "OTW" ? "bg-emerald-500" :
            game.result === "L" || game.result === "OTL" ? "bg-red-500" :
            game.result === "D" ? "bg-amber-500" : "bg-muted-foreground"
          )}
        />
      ))}
    </div>
  );
}
