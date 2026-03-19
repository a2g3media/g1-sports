import { AlertCircle, UserX, Clock, CheckCircle, HelpCircle } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/react-app/components/ui/tooltip";

/**
 * InjuryNewsSummary - Displays injury reports and news for a game
 * 
 * Shows player status, position, impact on game, and when updated.
 * Calm, factual presentation without sensationalism.
 */

export type InjuryStatus = "out" | "doubtful" | "questionable" | "probable" | "day_to_day";

export interface InjuryReport {
  player: string;
  team: string;
  position?: string;
  status: InjuryStatus;
  injury?: string;
  impact: "high" | "medium" | "low";
  note?: string;
  updatedAt?: Date;
}

export interface NewsItem {
  headline: string;
  team?: string;
  impact: "high" | "medium" | "low";
  timestamp: Date;
}

interface InjuryNewsSummaryProps {
  injuries?: InjuryReport[];
  news?: NewsItem[];
  variant?: "compact" | "expanded" | "card";
  maxItems?: number;
  className?: string;
}

// Status configuration
const statusConfig: Record<InjuryStatus, { 
  label: string; 
  icon: typeof AlertCircle;
  color: string;
  bgColor: string;
}> = {
  out: { 
    label: "OUT", 
    icon: UserX, 
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10"
  },
  doubtful: { 
    label: "Doubtful", 
    icon: AlertCircle, 
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10"
  },
  questionable: { 
    label: "Questionable", 
    icon: HelpCircle, 
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10"
  },
  probable: { 
    label: "Probable", 
    icon: CheckCircle, 
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10"
  },
  day_to_day: { 
    label: "Day-to-Day", 
    icon: Clock, 
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10"
  },
};

// Impact indicator
function ImpactDot({ impact }: { impact: "high" | "medium" | "low" }) {
  return (
    <span className={cn(
      "w-1.5 h-1.5 rounded-full shrink-0",
      impact === "high" && "bg-red-500",
      impact === "medium" && "bg-amber-500",
      impact === "low" && "bg-slate-400 dark:bg-slate-500"
    )} />
  );
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  
  if (minutes < 5) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Single injury item
function InjuryItem({ injury, variant }: { injury: InjuryReport; variant: "compact" | "expanded" | "card" }) {
  const config = statusConfig[injury.status];
  const Icon = config.icon;
  
  if (variant === "compact") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-help",
            config.bgColor
          )}>
            <ImpactDot impact={injury.impact} />
            <span className={cn("text-xs font-medium", config.color)}>
              {injury.player.split(' ').slice(-1)[0]}
            </span>
            <span className="text-xs text-muted-foreground">
              {config.label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <div className="font-medium">{injury.player}</div>
            {injury.position && (
              <div className="text-xs text-muted-foreground">{injury.position} • {injury.team}</div>
            )}
            <div className={cn("text-sm font-medium", config.color)}>
              {config.label}{injury.injury && ` — ${injury.injury}`}
            </div>
            {injury.note && (
              <p className="text-xs text-muted-foreground">{injury.note}</p>
            )}
            {injury.updatedAt && (
              <div className="text-xs text-muted-foreground/70 pt-1">
                Updated {formatRelativeTime(injury.updatedAt)}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <div className={cn(
      "flex items-start gap-3 p-2.5 rounded-lg",
      variant === "card" && config.bgColor
    )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
        config.bgColor
      )}>
        <Icon className={cn("w-4 h-4", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{injury.player}</span>
          <ImpactDot impact={injury.impact} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {injury.position && <span>{injury.position}</span>}
          {injury.position && injury.team && <span>•</span>}
          <span>{injury.team}</span>
        </div>
        <div className={cn("text-xs font-medium mt-1", config.color)}>
          {config.label}
          {injury.injury && <span className="font-normal text-muted-foreground"> — {injury.injury}</span>}
        </div>
        {injury.note && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{injury.note}</p>
        )}
      </div>
      {injury.updatedAt && (
        <span className="text-xs text-muted-foreground/70 shrink-0">
          {formatRelativeTime(injury.updatedAt)}
        </span>
      )}
    </div>
  );
}

// News item component
function NewsItemDisplay({ item }: { item: NewsItem }) {
  return (
    <div className="flex items-start gap-2 p-2">
      <ImpactDot impact={item.impact} />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">{item.headline}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {item.team && <span>{item.team}</span>}
          <span>•</span>
          <span>{formatRelativeTime(item.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

export function InjuryNewsSummary({
  injuries = [],
  news = [],
  variant = "compact",
  maxItems = 3,
  className,
}: InjuryNewsSummaryProps) {
  // Sort by impact (high first) and take top items
  const sortedInjuries = [...injuries]
    .sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    })
    .slice(0, maxItems);
  
  const sortedNews = [...news]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, maxItems);
  
  const hasContent = sortedInjuries.length > 0 || sortedNews.length > 0;
  
  if (!hasContent) return null;
  
  if (variant === "compact") {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {sortedInjuries.map((injury, idx) => (
          <InjuryItem key={`injury-${idx}`} injury={injury} variant="compact" />
        ))}
      </div>
    );
  }
  
  return (
    <div className={cn(
      "space-y-1",
      variant === "card" && "p-3 rounded-xl bg-secondary/30 border border-border/50",
      className
    )}>
      {sortedInjuries.length > 0 && (
        <div className="space-y-1">
          {variant === "card" && (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Injuries</span>
            </div>
          )}
          {sortedInjuries.map((injury, idx) => (
            <InjuryItem key={`injury-${idx}`} injury={injury} variant={variant} />
          ))}
        </div>
      )}
      
      {sortedNews.length > 0 && (
        <div className="space-y-1">
          {variant === "card" && sortedInjuries.length > 0 && (
            <div className="border-t border-border/50 my-2" />
          )}
          {variant === "card" && (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Latest</span>
            </div>
          )}
          {sortedNews.map((item, idx) => (
            <NewsItemDisplay key={`news-${idx}`} item={item} />
          ))}
        </div>
      )}
      
      {/* Show count of hidden items */}
      {(injuries.length > maxItems || news.length > maxItems) && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          {injuries.length > maxItems && `+${injuries.length - maxItems} more injuries`}
          {injuries.length > maxItems && news.length > maxItems && " • "}
          {news.length > maxItems && `+${news.length - maxItems} more updates`}
        </div>
      )}
    </div>
  );
}

// Quick badge for game cards (shows count and most critical status)
interface InjuryBadgeProps {
  injuries: InjuryReport[];
  className?: string;
}

export function InjuryBadge({ injuries, className }: InjuryBadgeProps) {
  if (injuries.length === 0) return null;
  
  const highImpact = injuries.filter(i => i.impact === "high");
  const hasOut = injuries.some(i => i.status === "out" || i.status === "doubtful");
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-help",
          hasOut 
            ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          className
        )}>
          <AlertCircle className="w-3.5 h-3.5" />
          <span>
            {highImpact.length > 0 
              ? `${highImpact.length} key ${highImpact.length === 1 ? 'injury' : 'injuries'}`
              : `${injuries.length} ${injuries.length === 1 ? 'injury' : 'injuries'}`
            }
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="p-0 max-w-sm">
        <div className="p-3 space-y-2">
          <div className="font-semibold text-sm">Injury Report</div>
          {injuries.slice(0, 4).map((injury, idx) => {
            const config = statusConfig[injury.status];
            return (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <ImpactDot impact={injury.impact} />
                <span className="font-medium">{injury.player}</span>
                <span className={cn("text-xs", config.color)}>({config.label})</span>
              </div>
            );
          })}
          {injuries.length > 4 && (
            <div className="text-xs text-muted-foreground">
              +{injuries.length - 4} more
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Demo data generator
export function generateDemoInjuries(team1: string, team2: string): InjuryReport[] {
  return [
    {
      player: "Chris Jones",
      team: team1,
      position: "DT",
      status: "questionable",
      injury: "Knee",
      impact: "high",
      note: "Limited practice Thursday. Game-time decision likely.",
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      player: "Josh Allen",
      team: team2,
      position: "QB",
      status: "probable",
      injury: "Shoulder",
      impact: "low",
      note: "Full practice participation. Expected to play.",
      updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    }
  ];
}
