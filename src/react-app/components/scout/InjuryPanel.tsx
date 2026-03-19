/**
 * InjuryPanel - Display injury/availability status for teams
 * Part of Scout Visual Intelligence system
 */

import { cn } from "@/react-app/lib/utils";
import { 
  UserX, 
  AlertTriangle, 
  HelpCircle, 
  CheckCircle2,
  Clock,
  Activity
} from "lucide-react";
import { FreshnessBadge, FreshnessLevel } from "@/react-app/components/ui/freshness-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";

export type InjuryStatus = "out" | "doubtful" | "questionable" | "probable" | "active" | "day-to-day";

export interface InjuredPlayer {
  name: string;
  position?: string;
  status: InjuryStatus;
  injury?: string;
  lastUpdated?: string;
  impact?: "high" | "medium" | "low";
  notes?: string;
}

export interface TeamInjuries {
  team: string;
  players: InjuredPlayer[];
}

export interface InjuryPanelProps {
  teams: TeamInjuries[];
  freshness?: FreshnessLevel;
  lastUpdated?: string;
  compact?: boolean;
  className?: string;
}

const statusConfig: Record<InjuryStatus, {
  label: string;
  color: string;
  bg: string;
  icon: React.ElementType;
  order: number;
}> = {
  out: {
    label: "OUT",
    color: "text-red-400",
    bg: "bg-red-500/15",
    icon: UserX,
    order: 0,
  },
  doubtful: {
    label: "DOUBTFUL",
    color: "text-orange-400",
    bg: "bg-orange-500/15",
    icon: AlertTriangle,
    order: 1,
  },
  questionable: {
    label: "QUESTIONABLE",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    icon: HelpCircle,
    order: 2,
  },
  "day-to-day": {
    label: "DAY-TO-DAY",
    color: "text-yellow-400",
    bg: "bg-yellow-500/15",
    icon: Clock,
    order: 3,
  },
  probable: {
    label: "PROBABLE",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    icon: CheckCircle2,
    order: 4,
  },
  active: {
    label: "ACTIVE",
    color: "text-green-400",
    bg: "bg-green-500/15",
    icon: Activity,
    order: 5,
  },
};

const impactConfig: Record<string, { label: string; color: string }> = {
  high: { label: "Key Player", color: "text-red-400" },
  medium: { label: "Starter", color: "text-amber-400" },
  low: { label: "Rotation", color: "text-muted-foreground" },
};

export function InjuryPanel({
  teams,
  freshness = "fresh",
  lastUpdated,
  compact = false,
  className,
}: InjuryPanelProps) {
  // Sort players by status severity
  const sortedTeams = teams.map(team => ({
    ...team,
    players: [...team.players].sort((a, b) => 
      statusConfig[a.status].order - statusConfig[b.status].order
    ),
  }));

  // Count total injuries by status
  const totalByStatus = teams.reduce((acc, team) => {
    team.players.forEach(p => {
      acc[p.status] = (acc[p.status] || 0) + 1;
    });
    return acc;
  }, {} as Record<InjuryStatus, number>);

  const totalInjured = Object.entries(totalByStatus)
    .filter(([status]) => status !== "active" && status !== "probable")
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Injury Report</h4>
              <p className="text-xs text-muted-foreground">
                {totalInjured} player{totalInjured !== 1 ? "s" : ""} affected
              </p>
            </div>
          </div>
          <FreshnessBadge level={freshness} timestamp={lastUpdated} compact />
        </div>

        {/* Status summary pills */}
        {!compact && Object.keys(totalByStatus).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(["out", "doubtful", "questionable", "day-to-day"] as InjuryStatus[])
              .filter(status => totalByStatus[status] > 0)
              .map(status => {
                const config = statusConfig[status];
                return (
                  <span
                    key={status}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-medium",
                      config.bg, config.color
                    )}
                  >
                    {totalByStatus[status]} {config.label}
                  </span>
                );
              })}
          </div>
        )}
      </div>

      {/* Team sections */}
      <div className={cn(
        "divide-y divide-border/30",
        teams.length === 2 && "grid grid-cols-2 divide-y-0 divide-x"
      )}>
        {sortedTeams.map((team, teamIdx) => (
          <div key={teamIdx} className="p-3">
            <h5 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              {team.team}
            </h5>
            
            {team.players.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 py-2">
                No injuries reported
              </p>
            ) : (
              <div className="space-y-1.5">
                {team.players.map((player, idx) => (
                  <PlayerInjuryRow 
                    key={idx} 
                    player={player} 
                    compact={compact}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {teams.every(t => t.players.length === 0) && (
        <div className="px-4 py-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">All players healthy</p>
        </div>
      )}
    </div>
  );
}

// Individual player row
function PlayerInjuryRow({
  player,
  compact = false,
}: {
  player: InjuredPlayer;
  compact?: boolean;
}) {
  const config = statusConfig[player.status];
  const Icon = config.icon;
  const impact = player.impact ? impactConfig[player.impact] : null;

  const content = (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
      config.bg,
      "hover:bg-opacity-30"
    )}>
      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", config.color)} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate">
            {player.name}
          </span>
          {player.position && (
            <span className="text-[10px] text-muted-foreground">
              ({player.position})
            </span>
          )}
          {impact && (
            <span className={cn("text-[9px] font-medium", impact.color)}>
              • {impact.label}
            </span>
          )}
        </div>
        {!compact && player.injury && (
          <p className="text-[10px] text-muted-foreground truncate">
            {player.injury}
          </p>
        )}
      </div>

      <span className={cn(
        "text-[10px] font-bold uppercase tracking-wide flex-shrink-0",
        config.color
      )}>
        {config.label}
      </span>
    </div>
  );

  if (player.notes || player.lastUpdated) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            {content}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              {player.injury && (
                <p className="text-xs font-medium">{player.injury}</p>
              )}
              {player.notes && (
                <p className="text-xs text-muted-foreground">{player.notes}</p>
              )}
              {player.lastUpdated && (
                <p className="text-[10px] text-muted-foreground/70">
                  Updated: {player.lastUpdated}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

// Compact inline version
export function InjuryBadges({
  players,
  maxShow = 3,
  className,
}: {
  players: InjuredPlayer[];
  maxShow?: number;
  className?: string;
}) {
  const critical = players.filter(p => 
    p.status === "out" || p.status === "doubtful"
  );
  const shown = critical.slice(0, maxShow);
  const remaining = critical.length - maxShow;

  if (critical.length === 0) {
    return (
      <span className={cn(
        "text-xs text-emerald-400 flex items-center gap-1",
        className
      )}>
        <CheckCircle2 className="w-3 h-3" />
        Healthy
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {shown.map((player, idx) => {
        const config = statusConfig[player.status];
        return (
          <span
            key={idx}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1",
              config.bg, config.color
            )}
          >
            <span className="truncate max-w-[60px]">{player.name}</span>
            <span className="opacity-70">{config.label}</span>
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{remaining} more
        </span>
      )}
    </div>
  );
}

// Single team injury summary
export function TeamInjurySummary({
  team,
  players,
  className,
}: {
  team: string;
  players: InjuredPlayer[];
  className?: string;
}) {
  const out = players.filter(p => p.status === "out").length;
  const questionable = players.filter(p => 
    p.status === "questionable" || p.status === "doubtful" || p.status === "day-to-day"
  ).length;

  return (
    <div className={cn(
      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30",
      className
    )}>
      <span className="text-xs font-medium">{team}</span>
      <div className="flex items-center gap-1.5">
        {out > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
            {out} OUT
          </span>
        )}
        {questionable > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
            {questionable} GTD
          </span>
        )}
        {out === 0 && questionable === 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
            Healthy
          </span>
        )}
      </div>
    </div>
  );
}
