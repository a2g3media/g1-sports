import { cn } from "@/react-app/lib/utils";
import { Clock, Lock, Radio } from "lucide-react";
import { TeamBadge, TeamBadgeStatus, TeamBadgeEmphasis } from "./team-badge";

/**
 * GameRow - Canonical matchup layout component
 * 
 * Used on: Picks screen, Live scoreboard, Field/exposure views, Results views
 * Logo-free design using TeamBadge components
 */

export type GameStatus = "scheduled" | "live" | "in_progress" | "final" | "final_ot";

interface GameRowProps {
  /** Unique game identifier */
  gameId: number | string;
  /** Away team name */
  awayTeam: string;
  /** Home team name */
  homeTeam: string;
  /** Away team score */
  awayScore?: number | null;
  /** Home team score */
  homeScore?: number | null;
  /** Game status */
  status: GameStatus;
  /** Game start time */
  startTime: Date | string;
  /** Current period/quarter for live games (e.g., "Q4 02:31") */
  gameClock?: string;
  /** Spread line (e.g., -3.5) */
  spread?: number;
  /** Winner team name (for final games) */
  winner?: string;
  /** User's selected team */
  selectedTeam?: string;
  /** Whether picks are locked */
  isLocked?: boolean;
  /** Callback when user selects a team */
  onSelectTeam?: (team: string) => void;
  /** Layout variant */
  variant?: "default" | "compact" | "expanded";
  /** Additional class names */
  className?: string;
}

// Map game status to TeamBadge status
function getTeamStatus(gameStatus: GameStatus): TeamBadgeStatus {
  if (gameStatus === "live" || gameStatus === "in_progress") return "live";
  if (gameStatus === "final" || gameStatus === "final_ot") return "final";
  return "upcoming";
}

// Format game time
function formatGameTime(startTime: Date | string): string {
  const date = typeof startTime === "string" ? new Date(startTime) : startTime;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Format short time (hours/minutes only)
function formatShortTime(startTime: Date | string): string {
  const date = typeof startTime === "string" ? new Date(startTime) : startTime;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GameRow({
  awayTeam,
  homeTeam,
  awayScore,
  homeScore,
  status,
  startTime,
  gameClock,
  spread,
  winner,
  selectedTeam,
  isLocked,
  onSelectTeam,
  variant = "default",
  className
}: GameRowProps) {
  const teamStatus = getTeamStatus(status);
  const isLive = status === "live" || status === "in_progress";
  const isFinal = status === "final" || status === "final_ot";
  const isScheduled = status === "scheduled";
  
  // Determine emphasis for each team
  const getEmphasis = (teamName: string): TeamBadgeEmphasis => {
    if (selectedTeam === teamName) return "selected";
    if (isFinal && winner) {
      if (winner === teamName) return "winning";
      return "losing";
    }
    return "normal";
  };
  
  // Determine if a team is currently winning (for live games)
  const isTeamWinning = (teamName: string): boolean => {
    if (!isLive || awayScore === null || awayScore === undefined || homeScore === null || homeScore === undefined) return false;
    if (teamName === awayTeam) return awayScore > homeScore;
    if (teamName === homeTeam) return homeScore > awayScore;
    return false;
  };
  
  const handleSelect = (team: string) => {
    if (isLocked || !onSelectTeam) return;
    onSelectTeam(team);
  };

  // Compact variant for list views
  if (variant === "compact") {
    return (
      <div className={cn(
        "flex items-center justify-between p-3 rounded-xl",
        "bg-card border border-border/50",
        "transition-all duration-200",
        isLive && "ring-1 ring-primary/30 bg-primary/5",
        className
      )}>
        {/* Teams */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <TeamBadge
            teamName={awayTeam}
            status={teamStatus}
            emphasis={getEmphasis(awayTeam)}
            score={awayScore}
            isWinning={isTeamWinning(awayTeam)}
            size="sm"
            onClick={onSelectTeam && !isLocked ? () => handleSelect(awayTeam) : undefined}
            disabled={isLocked}
          />
          <span className="text-xs text-muted-foreground">@</span>
          <TeamBadge
            teamName={homeTeam}
            status={teamStatus}
            emphasis={getEmphasis(homeTeam)}
            score={homeScore}
            isWinning={isTeamWinning(homeTeam)}
            size="sm"
            onClick={onSelectTeam && !isLocked ? () => handleSelect(homeTeam) : undefined}
            disabled={isLocked}
          />
        </div>
        
        {/* Status */}
        <div className="text-right shrink-0">
          {isLive && (
            <div className="flex items-center gap-1.5 text-primary">
              <Radio className="w-3 h-3 animate-pulse" />
              <span className="text-xs font-semibold">{gameClock || "LIVE"}</span>
            </div>
          )}
          {isFinal && (
            <span className="text-xs text-muted-foreground font-medium">FINAL</span>
          )}
          {isScheduled && (
            <span className="text-xs text-muted-foreground">{formatShortTime(startTime)}</span>
          )}
        </div>
      </div>
    );
  }

  // Default variant - full matchup display
  return (
    <div className={cn(
      "p-4 rounded-2xl",
      "bg-card border border-border/50",
      "transition-all duration-200",
      isLive && "ring-2 ring-primary/30 bg-primary/5",
      selectedTeam && !isLocked && "ring-2 ring-primary/50",
      className
    )}>
      {/* Header: Status + Time */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isLive ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wide">
                {gameClock || "Live"}
              </span>
            </div>
          ) : isFinal ? (
            <div className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              {status === "final_ot" ? "FINAL/OT" : "FINAL"}
            </div>
          ) : isLocked ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              <Lock className="w-3 h-3" />
              <span className="text-xs font-medium">LOCKED</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs">{formatGameTime(startTime)}</span>
            </div>
          )}
          
          {/* Spread badge */}
          {spread !== undefined && !isLocked && !isFinal && (
            <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              {spread > 0 ? `+${spread}` : spread}
            </div>
          )}
        </div>
        
        {/* Selected indicator */}
        {selectedTeam && !isLocked && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            Picked
          </div>
        )}
      </div>

      {/* Matchup Grid: Away @ Home */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center">
        {/* Away Team */}
        <button
          onClick={() => handleSelect(awayTeam)}
          disabled={isLocked || !onSelectTeam}
          className={cn(
            "relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl",
            "border-2 transition-all duration-200",
            "hover:border-primary/50 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:hover:border-border disabled:active:scale-100",
            selectedTeam === awayTeam
              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
              : "border-border hover:bg-secondary/50"
          )}
        >
          <TeamBadge
            teamName={awayTeam}
            status={teamStatus}
            emphasis={getEmphasis(awayTeam)}
            size="lg"
          />
          <span className="text-xs font-semibold truncate max-w-full">{awayTeam}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Away</span>
          
          {/* Score */}
          {(isLive || isFinal) && awayScore !== null && awayScore !== undefined && (
            <span className={cn(
              "text-2xl font-bold tabular-nums mt-1",
              isTeamWinning(awayTeam) && "text-[hsl(var(--success))]",
              isFinal && winner === homeTeam && "text-muted-foreground"
            )}>
              {awayScore}
            </span>
          )}
        </button>

        {/* VS Divider */}
        <div className="flex flex-col items-center justify-center px-1">
          {isLive || isFinal ? (
            <div className="text-sm font-medium text-muted-foreground">vs</div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
              @
            </div>
          )}
        </div>

        {/* Home Team */}
        <button
          onClick={() => handleSelect(homeTeam)}
          disabled={isLocked || !onSelectTeam}
          className={cn(
            "relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl",
            "border-2 transition-all duration-200",
            "hover:border-primary/50 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:hover:border-border disabled:active:scale-100",
            selectedTeam === homeTeam
              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
              : "border-border hover:bg-secondary/50"
          )}
        >
          <TeamBadge
            teamName={homeTeam}
            status={teamStatus}
            emphasis={getEmphasis(homeTeam)}
            size="lg"
          />
          <span className="text-xs font-semibold truncate max-w-full">{homeTeam}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Home</span>
          
          {/* Score */}
          {(isLive || isFinal) && homeScore !== null && homeScore !== undefined && (
            <span className={cn(
              "text-2xl font-bold tabular-nums mt-1",
              isTeamWinning(homeTeam) && "text-[hsl(var(--success))]",
              isFinal && winner === awayTeam && "text-muted-foreground"
            )}>
              {homeScore}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * GameRowSkeleton - Loading placeholder
 */
export function GameRowSkeleton({ variant = "default" }: { variant?: "default" | "compact" }) {
  if (variant === "compact") {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-8 rounded-lg bg-muted animate-pulse" />
          <div className="w-6 h-4 rounded bg-muted animate-pulse" />
          <div className="w-12 h-8 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="w-12 h-4 rounded bg-muted animate-pulse" />
      </div>
    );
  }
  
  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="w-20 h-6 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border">
          <div className="w-16 h-10 rounded-xl bg-muted animate-pulse" />
          <div className="w-20 h-4 rounded bg-muted animate-pulse" />
        </div>
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border">
          <div className="w-16 h-10 rounded-xl bg-muted animate-pulse" />
          <div className="w-20 h-4 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/**
 * ExposureBar - Distribution visualization for "who picked what"
 */
interface ExposureBarProps {
  teamName: string;
  count: number;
  total: number;
  isHighlighted?: boolean;
  className?: string;
}

export function ExposureBar({ teamName, count, total, isHighlighted, className }: ExposureBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-2 rounded-lg",
      isHighlighted && "bg-primary/5",
      className
    )}>
      <TeamBadge teamName={teamName} size="sm" emphasis={isHighlighted ? "selected" : "normal"} />
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
        <div 
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isHighlighted ? "bg-primary" : "bg-muted-foreground/30"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={cn(
        "text-sm font-semibold tabular-nums min-w-[40px] text-right",
        isHighlighted && "text-primary"
      )}>
        {count}
      </span>
    </div>
  );
}
