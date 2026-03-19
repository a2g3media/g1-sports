import { TrendingUp, TrendingDown, Minus, ArrowRightLeft, RefreshCw } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/react-app/components/ui/tooltip";
import type { GameOddsSummary } from "@/shared/types";

/**
 * OddsSnapshot - Clean Open vs Current Odds Display
 * 
 * Shows consensus spread, total, and moneyline with opening comparisons.
 * Highlights significant movement with clear visual indicators.
 */

interface OddsSnapshotProps {
  summary: GameOddsSummary | null;
  homeTeam?: string;
  awayTeam?: string;
  variant?: "full" | "compact" | "inline";
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

// Format spread for display
function formatSpread(spread: number | null | undefined): string {
  if (spread === null || spread === undefined) return "-";
  if (spread > 0) return `+${spread}`;
  if (spread < 0) return `${spread}`;
  return "PK";
}

// Format total for display
function formatTotal(total: number | null | undefined): string {
  if (total === null || total === undefined) return "-";
  return total.toString();
}

// Format American odds
function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return price > 0 ? `+${price}` : `${price}`;
}

// Calculate movement direction
function getMovementDirection(current: number | null, opening: number | null): "up" | "down" | "none" {
  if (current === null || opening === null) return "none";
  if (current > opening) return "up";
  if (current < opening) return "down";
  return "none";
}

// Movement indicator component
function MovementIndicator({ 
  current, 
  opening, 
  type 
}: { 
  current: number | null; 
  opening: number | null;
  type: "spread" | "total" | "ml";
}) {
  if (current === null || opening === null) return null;
  
  const diff = current - opening;
  if (Math.abs(diff) < 0.5) return null;
  
  const direction = diff > 0 ? "up" : "down";
  const absChange = Math.abs(diff);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(
          "inline-flex items-center gap-0.5 text-xs font-medium ml-1",
          direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        )}>
          {direction === "up" ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {type !== "ml" && absChange.toFixed(1)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <div className="space-y-1">
          <div className="font-medium">
            {type === "spread" ? "Spread" : type === "total" ? "Total" : "Moneyline"} Movement
          </div>
          <div className="text-muted-foreground">
            Opened: {type === "ml" ? formatPrice(opening) : opening} → Current: {type === "ml" ? formatPrice(current) : current}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Favorite flip badge
function FavoriteFlipBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ArrowRightLeft className="w-3 h-3" />
          Flipped
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-[200px]">
        The favorite has changed since opening. This often indicates significant money or information moving the market.
      </TooltipContent>
    </Tooltip>
  );
}

// Loading skeleton
function OddsSnapshotSkeleton({ variant }: { variant: "full" | "compact" | "inline" }) {
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-4">
        <div className="h-5 w-16 bg-muted rounded animate-pulse" />
        <div className="h-5 w-12 bg-muted rounded animate-pulse" />
        <div className="h-5 w-14 bg-muted rounded animate-pulse" />
      </div>
    );
  }
  
  return (
    <div className="space-y-3 p-4">
      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-12 bg-muted rounded animate-pulse" />
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OddsSnapshot({
  summary,
  homeTeam,
  awayTeam,
  variant = "full",
  isLoading,
  onRefresh,
  className,
}: OddsSnapshotProps) {
  if (isLoading) {
    return <OddsSnapshotSkeleton variant={variant} />;
  }
  
  if (!summary) {
    return (
      <div className={cn("text-center py-6 text-muted-foreground text-sm", className)}>
        No odds available
      </div>
    );
  }
  
  const { spread, total, moneyline, opening_spread, opening_total, opening_home_ml, spread_moved, total_moved, favorite_flipped, books_count } = summary;
  
  // Inline variant - single row for game cards
  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-4 text-sm", className)}>
        {spread && (
          <div className="flex items-center">
            <span className="text-muted-foreground mr-1.5">Sprd</span>
            <span className={cn(
              "font-semibold tabular-nums",
              spread_moved && "text-amber-600 dark:text-amber-400"
            )}>
              {formatSpread(spread.home_line)}
            </span>
            {spread_moved && (
              <MovementIndicator current={spread.home_line} opening={opening_spread} type="spread" />
            )}
          </div>
        )}
        {total && (
          <div className="flex items-center">
            <span className="text-muted-foreground mr-1.5">O/U</span>
            <span className={cn(
              "font-semibold tabular-nums",
              total_moved && "text-amber-600 dark:text-amber-400"
            )}>
              {formatTotal(total.line)}
            </span>
            {total_moved && (
              <MovementIndicator current={total.line} opening={opening_total} type="total" />
            )}
          </div>
        )}
        {favorite_flipped && <FavoriteFlipBadge />}
      </div>
    );
  }
  
  // Compact variant - condensed for lists
  if (variant === "compact") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}>
        {/* Spread */}
        {spread && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Spread</span>
            <div className="flex items-center">
              <span className={cn(
                "text-sm font-semibold tabular-nums",
                spread_moved && "text-amber-600 dark:text-amber-400"
              )}>
                {formatSpread(spread.home_line)} ({formatPrice(spread.home_price)})
              </span>
              {spread_moved && (
                <MovementIndicator current={spread.home_line} opening={opening_spread} type="spread" />
              )}
            </div>
          </div>
        )}
        
        {/* Total */}
        {total && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total</span>
            <div className="flex items-center">
              <span className={cn(
                "text-sm font-semibold tabular-nums",
                total_moved && "text-amber-600 dark:text-amber-400"
              )}>
                {formatTotal(total.line)}
              </span>
              {total_moved && (
                <MovementIndicator current={total.line} opening={opening_total} type="total" />
              )}
            </div>
          </div>
        )}
        
        {/* Moneyline */}
        {moneyline && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">ML</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatPrice(moneyline.home_price)} / {formatPrice(moneyline.away_price)}
            </span>
            {favorite_flipped && <FavoriteFlipBadge />}
          </div>
        )}
      </div>
    );
  }
  
  // Full variant - detailed card view
  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Consensus Odds
        </h3>
        <div className="flex items-center gap-2">
          {books_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {books_count} books
            </span>
          )}
          {onRefresh && (
            <button 
              onClick={onRefresh}
              className="p-1 rounded hover:bg-secondary transition-colors"
              aria-label="Refresh odds"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      
      {/* Movement Alerts */}
      {(spread_moved || total_moved || favorite_flipped) && (
        <div className="flex flex-wrap gap-2">
          {spread_moved && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TrendingDown className="w-3 h-3" />
              Spread moved
            </span>
          )}
          {total_moved && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
              {getMovementDirection(total?.line ?? null, opening_total) === "up" ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              Total moved
            </span>
          )}
          {favorite_flipped && <FavoriteFlipBadge />}
        </div>
      )}
      
      {/* Odds Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Spread */}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Spread</div>
          {spread ? (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-xl font-bold tabular-nums",
                  spread_moved && "text-amber-600 dark:text-amber-400"
                )}>
                  {formatSpread(spread.home_line)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  ({formatPrice(spread.home_price)})
                </span>
              </div>
              {opening_spread !== null && spread.home_line !== opening_spread && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Open: {formatSpread(opening_spread)}</span>
                  <MovementIndicator current={spread.home_line} opening={opening_spread} type="spread" />
                </div>
              )}
            </div>
          ) : (
            <div className="text-lg text-muted-foreground">-</div>
          )}
        </div>
        
        {/* Total */}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total</div>
          {total ? (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-xl font-bold tabular-nums",
                  total_moved && "text-amber-600 dark:text-amber-400"
                )}>
                  {formatTotal(total.line)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  ({formatPrice(total.over_price)})
                </span>
              </div>
              {opening_total !== null && total.line !== opening_total && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Open: {formatTotal(opening_total)}</span>
                  <MovementIndicator current={total.line} opening={opening_total} type="total" />
                </div>
              )}
            </div>
          ) : (
            <div className="text-lg text-muted-foreground">-</div>
          )}
        </div>
        
        {/* Moneyline */}
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Moneyline</div>
          {moneyline ? (
            <div className="space-y-0.5">
              <div className="flex flex-col">
                <span className="text-lg font-bold tabular-nums">
                  {formatPrice(moneyline.home_price)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatPrice(moneyline.away_price)}
                </span>
              </div>
              {opening_home_ml !== null && moneyline.home_price !== opening_home_ml && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Open: {formatPrice(opening_home_ml)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-lg text-muted-foreground">-</div>
          )}
        </div>
      </div>
      
      {/* Team Labels */}
      {(homeTeam || awayTeam) && (
        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
          <span>{homeTeam || "Home"} spread/ML shown</span>
          <span>{awayTeam || "Away"}</span>
        </div>
      )}
    </div>
  );
}

// Standalone compact badge for movement summary
export function OddsMovementBadge({ summary }: { summary: GameOddsSummary | null }) {
  if (!summary) return null;
  
  const { spread_moved, total_moved, favorite_flipped } = summary;
  
  if (!spread_moved && !total_moved && !favorite_flipped) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground">
        <Minus className="w-3 h-3" />
        Stable
      </span>
    );
  }
  
  const movements = [];
  if (spread_moved) movements.push("spread");
  if (total_moved) movements.push("total");
  if (favorite_flipped) movements.push("favorite");
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 cursor-help">
          <TrendingUp className="w-3 h-3" />
          Movement
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        Changed since open: {movements.join(", ")}
      </TooltipContent>
    </Tooltip>
  );
}
