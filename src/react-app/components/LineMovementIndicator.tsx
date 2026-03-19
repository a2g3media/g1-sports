import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/react-app/components/ui/tooltip";

/**
 * LineMovementIndicator - Shows line movement with explanation tooltip
 * 
 * Displays why lines moved: sharp money, injuries, weather, public betting, etc.
 * Tone: Calm, factual, educational.
 */

export type MovementDirection = "toward_home" | "toward_away" | "stable";

export interface LineMovementData {
  direction: MovementDirection;
  magnitude: number;
  openingLine?: number;
  currentLine?: number;
  openingTotal?: number;
  currentTotal?: number;
  reasons: LineMovementReason[];
  timestamp?: Date;
}

export interface LineMovementReason {
  type: "sharp_money" | "public_money" | "injury" | "weather" | "steam_move" | "reverse_line" | "key_number";
  description: string;
  impact: "high" | "medium" | "low";
}

interface LineMovementIndicatorProps {
  movement: LineMovementData;
  variant?: "badge" | "inline" | "detailed";
  showTooltip?: boolean;
  className?: string;
}

// Get icon for movement direction
function getDirectionIcon(direction: MovementDirection) {
  switch (direction) {
    case "toward_home":
      return TrendingDown;
    case "toward_away":
      return TrendingUp;
    default:
      return Minus;
  }
}

// Get color classes for movement direction
function getDirectionColors(direction: MovementDirection) {
  switch (direction) {
    case "toward_home":
      return {
        bg: "bg-blue-500/10 dark:bg-blue-500/15",
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-500/20",
      };
    case "toward_away":
      return {
        bg: "bg-purple-500/10 dark:bg-purple-500/15",
        text: "text-purple-600 dark:text-purple-400",
        border: "border-purple-500/20",
      };
    default:
      return {
        bg: "bg-muted",
        text: "text-muted-foreground",
        border: "border-border",
      };
  }
}

// Get icon for reason type
function getReasonIcon(type: LineMovementReason["type"]) {
  const icons: Record<LineMovementReason["type"], string> = {
    sharp_money: "💰",
    public_money: "👥",
    injury: "🏥",
    weather: "🌧️",
    steam_move: "⚡",
    reverse_line: "🔄",
    key_number: "🔢",
  };
  return icons[type];
}

// Get reason type label
function getReasonLabel(type: LineMovementReason["type"]): string {
  const labels: Record<LineMovementReason["type"], string> = {
    sharp_money: "Sharp Money",
    public_money: "Public Money",
    injury: "Injury News",
    weather: "Weather",
    steam_move: "Steam Move",
    reverse_line: "Reverse Line",
    key_number: "Key Number",
  };
  return labels[type];
}

// Format spread for display
function formatSpread(spread: number): string {
  if (spread > 0) return `+${spread}`;
  if (spread < 0) return `${spread}`;
  return "PK";
}

// Tooltip content component
function MovementTooltipContent({ movement }: { movement: LineMovementData }) {
  const hasSpreadChange = movement.openingLine !== undefined && movement.currentLine !== undefined;
  const hasTotalChange = movement.openingTotal !== undefined && movement.currentTotal !== undefined;
  
  return (
    <div className="w-64 p-1">
      {/* Header */}
      <div className="font-semibold mb-2">Why the line moved</div>
      
      {/* Line Change Summary */}
      {(hasSpreadChange || hasTotalChange) && (
        <div className="space-y-1.5 mb-3 pb-3 border-b border-current/10">
          {hasSpreadChange && (
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Spread</span>
              <span className="font-medium tabular-nums">
                {formatSpread(movement.openingLine!)}
                <span className="mx-1.5 opacity-50">→</span>
                {formatSpread(movement.currentLine!)}
              </span>
            </div>
          )}
          {hasTotalChange && (
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Total</span>
              <span className="font-medium tabular-nums">
                {movement.openingTotal}
                <span className="mx-1.5 opacity-50">→</span>
                {movement.currentTotal}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Reasons */}
      {movement.reasons.length > 0 ? (
        <div className="space-y-2">
          {movement.reasons.map((reason, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-sm shrink-0">{getReasonIcon(reason.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{getReasonLabel(reason.type)}</span>
                  {reason.impact === "high" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </div>
                <p className="text-xs opacity-70 leading-relaxed">{reason.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs opacity-70">
          Minor market adjustment. No significant factors identified.
        </p>
      )}
      
      {/* Timestamp */}
      {movement.timestamp && (
        <div className="mt-3 pt-2 border-t border-current/10 text-xs opacity-50">
          Last updated {movement.timestamp.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
          })}
        </div>
      )}
    </div>
  );
}

export function LineMovementIndicator({
  movement,
  variant = "badge",
  showTooltip = true,
  className,
}: LineMovementIndicatorProps) {
  const Icon = getDirectionIcon(movement.direction);
  const colors = getDirectionColors(movement.direction);
  
  const content = (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 cursor-help",
        variant === "badge" && [
          "px-2.5 py-1 rounded-lg text-xs font-medium",
          colors.bg,
          colors.text,
        ],
        variant === "inline" && [
          "text-xs font-medium",
          colors.text,
        ],
        variant === "detailed" && [
          "px-3 py-2 rounded-xl text-sm font-medium border",
          colors.bg,
          colors.text,
          colors.border,
        ],
        className
      )}
    >
      <Icon className={cn(
        variant === "detailed" ? "w-4 h-4" : "w-3.5 h-3.5"
      )} />
      <span>
        {movement.magnitude > 0 
          ? `${movement.magnitude} pt${movement.magnitude !== 1 ? 's' : ''}`
          : movement.direction === "stable" ? "Holding" : "Moving"
        }
      </span>
      {showTooltip && variant !== "detailed" && (
        <Info className="w-3 h-3 opacity-60" />
      )}
    </div>
  );
  
  if (!showTooltip) {
    return content;
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent 
        className="bg-card text-foreground border border-border shadow-xl p-0"
        sideOffset={8}
      >
        <MovementTooltipContent movement={movement} />
      </TooltipContent>
    </Tooltip>
  );
}

// Demo data generator for testing
export function generateDemoMovement(
  direction: MovementDirection = "toward_home",
  magnitude: number = 1.5
): LineMovementData {
  const reasons: LineMovementReason[] = [];
  
  if (direction === "toward_home") {
    reasons.push({
      type: "sharp_money",
      description: "Professional bettors moved early on the home team. 72% of tickets but only 35% of money on away.",
      impact: "high",
    });
    reasons.push({
      type: "injury",
      description: "Key player ruled out for away team affects defensive matchups.",
      impact: "medium",
    });
  } else if (direction === "toward_away") {
    reasons.push({
      type: "public_money",
      description: "Heavy public action on the favorite creating value opportunity.",
      impact: "medium",
    });
  }
  
  return {
    direction,
    magnitude,
    openingLine: direction === "toward_home" ? -1 : 3,
    currentLine: direction === "toward_home" ? -2.5 : 2.5,
    openingTotal: 48.5,
    currentTotal: 47,
    reasons,
    timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
  };
}
