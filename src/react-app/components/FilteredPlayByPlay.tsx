import { useState } from "react";
import { 
  Zap, Target, AlertTriangle, Trophy, 
  ChevronDown, ChevronUp, TrendingUp, Users,
  Clock, Repeat
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

/**
 * FilteredPlayByPlay - Meaningful Events Only
 * 
 * Cuts through the noise. Shows only plays that matter:
 * - Scoring plays
 * - Turnovers
 * - Big plays (20+ yard gains)
 * - Key downs (4th down attempts, 2pt conversions)
 * - Momentum shifts
 * - Red zone entries
 * 
 * Philosophy: If it doesn't change the game, skip it.
 */

export type PlayType = 
  | "touchdown" 
  | "field_goal" 
  | "turnover" 
  | "big_play" 
  | "key_stop" 
  | "red_zone"
  | "two_point"
  | "fourth_down"
  | "lead_change"
  | "timeout"
  | "injury_timeout";

export interface Play {
  id: string;
  type: PlayType;
  timestamp: string; // Game clock
  period: string;
  team: string;
  description: string;
  impact?: string; // "Chiefs now lead by 7" or "Momentum shift"
  poolImpact?: {
    message: string;
    severity: "info" | "warning" | "critical";
  };
  yards?: number;
  scoreChange?: {
    team: "home" | "away";
    points: number;
    newScore: string; // "24-17"
  };
}

// Play type configuration
const PLAY_CONFIG: Record<PlayType, { 
  icon: typeof Zap; 
  color: string; 
  bgColor: string;
  label: string;
  priority: number;
}> = {
  touchdown: { 
    icon: Trophy, 
    color: "text-green-600 dark:text-green-400", 
    bgColor: "bg-green-500/10",
    label: "TOUCHDOWN",
    priority: 1
  },
  field_goal: { 
    icon: Target, 
    color: "text-blue-600 dark:text-blue-400", 
    bgColor: "bg-blue-500/10",
    label: "FIELD GOAL",
    priority: 2
  },
  turnover: { 
    icon: Repeat, 
    color: "text-red-600 dark:text-red-400", 
    bgColor: "bg-red-500/10",
    label: "TURNOVER",
    priority: 1
  },
  big_play: { 
    icon: Zap, 
    color: "text-amber-600 dark:text-amber-400", 
    bgColor: "bg-amber-500/10",
    label: "BIG PLAY",
    priority: 3
  },
  key_stop: { 
    icon: AlertTriangle, 
    color: "text-purple-600 dark:text-purple-400", 
    bgColor: "bg-purple-500/10",
    label: "KEY STOP",
    priority: 3
  },
  red_zone: { 
    icon: Target, 
    color: "text-orange-600 dark:text-orange-400", 
    bgColor: "bg-orange-500/10",
    label: "RED ZONE",
    priority: 4
  },
  two_point: { 
    icon: TrendingUp, 
    color: "text-indigo-600 dark:text-indigo-400", 
    bgColor: "bg-indigo-500/10",
    label: "2PT ATTEMPT",
    priority: 2
  },
  fourth_down: { 
    icon: AlertTriangle, 
    color: "text-yellow-600 dark:text-yellow-400", 
    bgColor: "bg-yellow-500/10",
    label: "4TH DOWN",
    priority: 3
  },
  lead_change: { 
    icon: TrendingUp, 
    color: "text-cyan-600 dark:text-cyan-400", 
    bgColor: "bg-cyan-500/10",
    label: "LEAD CHANGE",
    priority: 1
  },
  timeout: { 
    icon: Clock, 
    color: "text-muted-foreground", 
    bgColor: "bg-muted",
    label: "TIMEOUT",
    priority: 5
  },
  injury_timeout: { 
    icon: AlertTriangle, 
    color: "text-rose-600 dark:text-rose-400", 
    bgColor: "bg-rose-500/10",
    label: "INJURY",
    priority: 4
  }
};

function PlayCard({ play, isLatest }: { play: Play; isLatest: boolean }) {
  const config = PLAY_CONFIG[play.type];
  const Icon = config.icon;
  
  return (
    <div 
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-300",
        isLatest 
          ? "bg-card border-primary/30 shadow-lg shadow-primary/5" 
          : "bg-card/50 border-border/50"
      )}
    >
      {/* Latest indicator */}
      {isLatest && (
        <div className="absolute -top-px left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-1.5 rounded-lg", config.bgColor)}>
            <Icon className={cn("w-4 h-4", config.color)} />
          </div>
          <div>
            <span className={cn("text-xs font-bold tracking-wider", config.color)}>
              {config.label}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <TeamBadge teamName={play.team} size="sm" />
              <span className="text-sm font-medium text-muted-foreground">{play.team}</span>
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <span className="text-xs text-muted-foreground">{play.period}</span>
          <span className="text-xs text-muted-foreground mx-1">·</span>
          <span className="text-xs font-mono text-muted-foreground">{play.timestamp}</span>
        </div>
      </div>
      
      {/* Description */}
      <p className="text-sm text-foreground leading-relaxed mb-2">
        {play.description}
      </p>
      
      {/* Score change */}
      {play.scoreChange && (
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted/50 mb-2">
          <span className="text-sm font-bold tabular-nums">{play.scoreChange.newScore}</span>
          <span className="text-xs text-muted-foreground">
            +{play.scoreChange.points} {play.scoreChange.team === "home" ? "Home" : "Away"}
          </span>
        </div>
      )}
      
      {/* Impact */}
      {play.impact && (
        <p className="text-xs text-muted-foreground italic">
          {play.impact}
        </p>
      )}
      
      {/* Pool Impact */}
      {play.poolImpact && (
        <div className={cn(
          "mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border",
          play.poolImpact.severity === "critical" 
            ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
            : play.poolImpact.severity === "warning"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
              : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
        )}>
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{play.poolImpact.message}</span>
        </div>
      )}
    </div>
  );
}

interface FilteredPlayByPlayProps {
  plays: Play[];
  gameId: string;
  maxVisible?: number;
  showFilters?: boolean;
}

export function FilteredPlayByPlay({ 
  plays, 
  maxVisible = 5,
  showFilters = true 
}: FilteredPlayByPlayProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<PlayType | "all">("all");
  
  // Sort by priority and recency
  const sortedPlays = [...plays].sort((a, b) => {
    const priorityDiff = PLAY_CONFIG[a.type].priority - PLAY_CONFIG[b.type].priority;
    if (priorityDiff !== 0) return priorityDiff;
    return 0; // Keep original order for same priority
  });
  
  const filteredPlays = filter === "all" 
    ? sortedPlays 
    : sortedPlays.filter(p => p.type === filter);
  
  const visiblePlays = expanded ? filteredPlays : filteredPlays.slice(0, maxVisible);
  const hasMore = filteredPlays.length > maxVisible;
  
  // Get unique play types for filter buttons
  const playTypes = Array.from(new Set(plays.map(p => p.type)));
  
  if (plays.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/50 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
          <Zap className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">No key plays yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Scoring plays, turnovers, and big moments will appear here
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Key Plays</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {filteredPlays.length} moments
          </span>
        </div>
      </div>
      
      {/* Filter Pills */}
      {showFilters && playTypes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            All
          </button>
          {playTypes.map(type => {
            const config = PLAY_CONFIG[type];
            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                  filter === type
                    ? cn(config.bgColor, config.color)
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <config.icon className="w-3 h-3" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}
      
      {/* Plays List */}
      <div className="space-y-3">
        {visiblePlays.map((play, index) => (
          <PlayCard 
            key={play.id} 
            play={play} 
            isLatest={index === 0}
          />
        ))}
      </div>
      
      {/* Show More/Less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show {filteredPlays.length - maxVisible} More
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Demo data generator for development
export function generateDemoPlays(gameId: string): Play[] {
  const demoPlays: Play[] = [
    {
      id: `${gameId}-play-1`,
      type: "touchdown",
      timestamp: "8:42",
      period: "3rd",
      team: "Kansas City Chiefs",
      description: "Mahomes finds Kelce on a 15-yard touchdown pass. Chiefs extend the lead with a methodical 8-play, 75-yard drive.",
      impact: "Chiefs take a 10-point lead, biggest of the game",
      scoreChange: { team: "away", points: 7, newScore: "24-14" },
      poolImpact: {
        message: "3 survivor picks on Bills now at risk",
        severity: "warning"
      }
    },
    {
      id: `${gameId}-play-2`,
      type: "turnover",
      timestamp: "11:23",
      period: "3rd",
      team: "Buffalo Bills",
      description: "Josh Allen intercepted by Chris Jones at the Chiefs 35. Allen's first INT of the game, intended for Diggs.",
      impact: "Momentum shift - Chiefs take over in plus territory",
      poolImpact: {
        message: "Bills cover probability drops to 34%",
        severity: "info"
      }
    },
    {
      id: `${gameId}-play-3`,
      type: "big_play",
      timestamp: "2:45",
      period: "2nd",
      team: "Kansas City Chiefs",
      description: "Pacheco breaks through for a 42-yard run. Biggest play of the half, sets up 1st and goal.",
      yards: 42,
      impact: "Red zone opportunity created"
    },
    {
      id: `${gameId}-play-4`,
      type: "field_goal",
      timestamp: "0:03",
      period: "2nd",
      team: "Buffalo Bills",
      description: "Bass hits a 48-yard field goal as time expires in the first half.",
      scoreChange: { team: "home", points: 3, newScore: "17-14" },
      impact: "Bills go into halftime down by just 3"
    },
    {
      id: `${gameId}-play-5`,
      type: "key_stop",
      timestamp: "5:12",
      period: "2nd",
      team: "Buffalo Bills",
      description: "Bills defense forces a 3-and-out in the red zone. Milano stops Pacheco for a 2-yard loss on 3rd down.",
      impact: "Chiefs settle for field goal attempt, miss wide left"
    },
    {
      id: `${gameId}-play-6`,
      type: "red_zone",
      timestamp: "9:15",
      period: "3rd",
      team: "Kansas City Chiefs",
      description: "Chiefs enter the red zone after a 22-yard completion to Rice.",
      impact: "Scoring opportunity in progress"
    },
    {
      id: `${gameId}-play-7`,
      type: "lead_change",
      timestamp: "14:22",
      period: "2nd",
      team: "Kansas City Chiefs",
      description: "Mahomes scrambles in for a 3-yard touchdown. Chiefs take their first lead of the game.",
      scoreChange: { team: "away", points: 6, newScore: "10-7" },
      impact: "3rd lead change of the game",
      poolImpact: {
        message: "Game swings back toward Chiefs -4 cover",
        severity: "info"
      }
    }
  ];
  
  return demoPlays;
}
