import { cn } from "@/react-app/lib/utils";
import { 
  Check, 
  Lock, 
  Radio, 
  Minus,
  Clock,
  Flame,
  Trophy,
  ChevronUp,
  ChevronDown,
  XCircle,
  Shield,
  MessageCircle,
  Smartphone
} from "lucide-react";
import { useEffect, useState } from "react";

// ===== STATUS PILL =====
type StatusType = "open" | "submitted" | "locked" | "live" | "final" | "eliminated" | "alive";

interface StatusPillProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; icon: React.ElementType; className: string }> = {
  open: {
    label: "Open",
    icon: Radio,
    className: "status-pill-open hover:scale-105 transition-transform"
  },
  submitted: {
    label: "Submitted",
    icon: Check,
    className: "status-pill-submitted hover:scale-105 transition-transform"
  },
  locked: {
    label: "Locked",
    icon: Lock,
    className: "status-pill-locked hover:scale-105 transition-transform"
  },
  live: {
    label: "Live",
    icon: Radio,
    className: "status-pill-live live-pulse hover:scale-105 transition-transform"
  },
  final: {
    label: "Final",
    icon: Check,
    className: "status-pill-locked hover:scale-105 transition-transform"
  },
  eliminated: {
    label: "Eliminated",
    icon: XCircle,
    className: "status-pill-eliminated hover:scale-105 transition-transform"
  },
  alive: {
    label: "Alive",
    icon: Shield,
    className: "status-pill-alive hover:scale-105 transition-transform"
  }
};

export function StatusPill({ status, className }: StatusPillProps) {
  const config = statusConfig[status];
  
  // Safety check - if status is invalid, return null or a default
  if (!config) {
    console.warn(`StatusPill: Invalid status "${status}". Valid statuses:`, Object.keys(statusConfig));
    return null;
  }
  
  const Icon = config.icon;
  
  return (
    <span className={cn(config.className, className)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ===== COUNTDOWN PILL =====
interface CountdownPillProps {
  targetDate: Date;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
}

function getTimeRemaining(targetDate: Date) {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { days, hours, minutes, seconds, total: diff };
}

export function CountdownPill({ targetDate, className, size = "md", showLabels = true }: CountdownPillProps) {
  const [time, setTime] = useState(getTimeRemaining(targetDate));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getTimeRemaining(targetDate));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [targetDate]);
  
  const isUrgent = time.total < 60 * 60 * 1000; // Less than 1 hour
  
  const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl sm:text-3xl",
    lg: "text-4xl sm:text-5xl"
  };
  
  const labelClasses = {
    sm: "text-[8px]",
    md: "text-[10px]",
    lg: "text-xs"
  };
  
  if (time.total <= 0) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        <Lock className="w-4 h-4" />
        <span className="font-medium">Locked</span>
      </div>
    );
  }
  
  return (
    <div className={cn("countdown-container", isUrgent && "countdown-urgent", className)}>
      {time.days > 0 && (
        <>
          <div className="countdown-segment">
            <span className={cn("countdown-value", sizeClasses[size])}>{time.days}</span>
            {showLabels && <span className={cn("countdown-label", labelClasses[size])}>Days</span>}
          </div>
          <span className={cn("countdown-separator", sizeClasses[size])}>:</span>
        </>
      )}
      <div className="countdown-segment">
        <span className={cn("countdown-value", sizeClasses[size])}>
          {String(time.hours).padStart(2, '0')}
        </span>
        {showLabels && <span className={cn("countdown-label", labelClasses[size])}>Hrs</span>}
      </div>
      <span className={cn("countdown-separator", sizeClasses[size])}>:</span>
      <div className="countdown-segment">
        <span className={cn("countdown-value", sizeClasses[size])}>
          {String(time.minutes).padStart(2, '0')}
        </span>
        {showLabels && <span className={cn("countdown-label", labelClasses[size])}>Min</span>}
      </div>
      <span className={cn("countdown-separator", sizeClasses[size])}>:</span>
      <div className="countdown-segment">
        <span className={cn("countdown-value", sizeClasses[size])}>
          {String(time.seconds).padStart(2, '0')}
        </span>
        {showLabels && <span className={cn("countdown-label", labelClasses[size])}>Sec</span>}
      </div>
    </div>
  );
}

// ===== RANK BADGE =====
interface RankBadgeProps {
  rank: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RankBadge({ rank, size = "md", className }: RankBadgeProps) {
  const sizeClasses = {
    sm: "w-7 h-7 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-14 h-14 text-xl"
  };
  
  const getRankClass = () => {
    if (rank === 1) return "rank-badge-1";
    if (rank === 2) return "rank-badge-2";
    if (rank === 3) return "rank-badge-3";
    return "rank-badge-default";
  };
  
  return (
    <div className={cn(
      getRankClass(), 
      sizeClasses[size], 
      "transition-transform duration-200 hover:scale-110",
      rank === 1 && "animate-float-subtle",
      className
    )}>
      {rank === 1 && <Trophy className="w-1/2 h-1/2" />}
      {rank > 1 && rank}
    </div>
  );
}

// ===== DELTA INDICATOR =====
interface DeltaIndicatorProps {
  delta: number;
  className?: string;
  showIcon?: boolean;
}

export function DeltaIndicator({ delta, className, showIcon = true }: DeltaIndicatorProps) {
  if (delta === 0) {
    return (
      <span className={cn("delta-neutral", className)}>
        {showIcon && <Minus className="w-3 h-3" />}
        —
      </span>
    );
  }
  
  if (delta > 0) {
    return (
      <span className={cn("delta-up", className)}>
        {showIcon && <ChevronUp className="w-4 h-4" />}
        +{delta}
      </span>
    );
  }
  
  return (
    <span className={cn("delta-down", className)}>
      {showIcon && <ChevronDown className="w-4 h-4" />}
      {delta}
    </span>
  );
}

// ===== RECEIPT STAMP =====
interface ReceiptStampProps {
  receiptCode: string;
  submittedAt: Date;
  className?: string;
  onClick?: () => void;
}

export function ReceiptStamp({ receiptCode, submittedAt, className, onClick }: ReceiptStampProps) {
  const formattedTime = submittedAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  
  return (
    <button 
      onClick={onClick}
      className={cn(
        "receipt-stamp group cursor-pointer hover:bg-[hsl(var(--success)/0.15)] transition-colors",
        className
      )}
    >
      <Check className="w-4 h-4" />
      <div className="flex flex-col items-start">
        <span className="receipt-stamp-code">{receiptCode}</span>
        <span className="receipt-stamp-time">{formattedTime}</span>
      </div>
    </button>
  );
}

// ===== STREAK INDICATOR =====
interface StreakIndicatorProps {
  streak: number;
  type: "win" | "loss";
  className?: string;
}

export function StreakIndicator({ streak, type, className }: StreakIndicatorProps) {
  if (streak < 2) return null;
  
  return (
    <div className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
      type === "win" 
        ? "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
        : "bg-[hsl(var(--negative)/0.1)] text-[hsl(var(--negative))]",
      className
    )}>
      <Flame className="w-3 h-3" />
      {streak}{type === "win" ? "W" : "L"}
    </div>
  );
}

// ===== SPORT BADGE =====
interface SportBadgeProps {
  sport: string;
  format?: string;
  className?: string;
}

const sportEmojis: Record<string, string> = {
  nfl: "🏈",
  nba: "🏀",
  mlb: "⚾",
  nhl: "🏒",
  ncaaf: "🏈",
  ncaab: "🏀",
  soccer: "⚽",
  golf: "⛳"
};

export function SportBadge({ sport, format, className }: SportBadgeProps) {
  const emoji = sportEmojis[sport.toLowerCase()] || "🏆";
  
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg",
      "bg-secondary text-secondary-foreground text-xs font-medium",
      className
    )}>
      <span>{emoji}</span>
      <span className="uppercase">{sport}</span>
      {format && (
        <>
          <span className="text-muted-foreground">•</span>
          <span className="capitalize">{format}</span>
        </>
      )}
    </div>
  );
}

// ===== COMPETITIVE STRIP =====
interface CompetitiveStripProps {
  rank: number;
  totalPlayers: number;
  delta: number;
  pointsBehindLeader: number;
  streak?: { count: number; type: "win" | "loss" };
  className?: string;
}

export function CompetitiveStrip({ 
  rank, 
  totalPlayers, 
  delta, 
  pointsBehindLeader,
  streak,
  className 
}: CompetitiveStripProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-2xl bg-secondary/50",
      className
    )}>
      {/* Your Rank */}
      <div className="flex items-center gap-3">
        <RankBadge rank={rank} size="md" />
        <div>
          <div className="text-sm text-muted-foreground">Your Rank</div>
          <div className="flex items-center gap-2">
            <span className="text-h3">#{rank}</span>
            <span className="text-muted-foreground text-sm">of {totalPlayers}</span>
          </div>
        </div>
      </div>
      
      {/* Delta */}
      <div className="text-center">
        <div className="text-sm text-muted-foreground mb-0.5">This Week</div>
        <DeltaIndicator delta={delta} className="text-lg" />
      </div>
      
      {/* Behind Leader */}
      <div className="text-right">
        <div className="text-sm text-muted-foreground mb-0.5">Behind Leader</div>
        <div className="text-h3">
          {pointsBehindLeader === 0 ? (
            <span className="text-[hsl(var(--success))]">Leader!</span>
          ) : (
            <span>-{pointsBehindLeader} pts</span>
          )}
        </div>
      </div>
      
      {/* Streak */}
      {streak && streak.count >= 2 && (
        <div className="hidden sm:block">
          <StreakIndicator streak={streak.count} type={streak.type} />
        </div>
      )}
    </div>
  );
}

// ===== HERO PANEL =====
interface HeroPanelProps {
  weekNumber: number;
  weekLabel?: string;
  status: StatusType;
  lockTime: Date;
  isSubmitted: boolean;
  receiptCode?: string;
  submittedAt?: Date;
  onMakePicks: () => void;
  onViewReceipt?: () => void;
  className?: string;
}

export function HeroPanel({
  weekNumber,
  weekLabel,
  status,
  lockTime,
  isSubmitted,
  receiptCode,
  submittedAt,
  onMakePicks,
  onViewReceipt,
  className
}: HeroPanelProps) {
  const getButtonLabel = () => {
    if (status === "locked" || status === "live") return "View Picks";
    if (isSubmitted) return "Edit Picks";
    return "Make Picks";
  };
  
  return (
    <div className={cn("card-hero", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-caption mb-1">{weekLabel || "Current Week"}</div>
          <h2 className="text-h1">Week {weekNumber}</h2>
        </div>
        <StatusPill status={status} />
      </div>
      
      {/* Countdown */}
      {status === "open" && (
        <div className="mb-6">
          <div className="text-caption mb-2 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Locks at {lockTime.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </div>
          <CountdownPill targetDate={lockTime} size="lg" />
        </div>
      )}
      
      {/* Submission State */}
      {isSubmitted && receiptCode && submittedAt && (
        <div className="mb-6">
          <ReceiptStamp 
            receiptCode={receiptCode} 
            submittedAt={submittedAt}
            onClick={onViewReceipt}
          />
        </div>
      )}
      
      {/* CTA */}
      <button 
        onClick={onMakePicks}
        className="btn-cta w-full"
      >
        {getButtonLabel()}
      </button>
    </div>
  );
}

// ===== LEAGUE PULSE ITEM =====
interface LeaguePulseItemProps {
  icon: React.ElementType;
  message: string;
  onClick?: () => void;
  className?: string;
}

export function LeaguePulseItem({ icon: Icon, message, onClick, className }: LeaguePulseItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl w-full text-left group/pulse",
        "bg-secondary/50 hover:bg-secondary transition-all duration-200 ease-out",
        "hover:translate-x-1 active:scale-[0.98]",
        className
      )}
    >
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center transition-transform duration-200 group-hover/pulse:scale-110">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <span className="text-sm">{message}</span>
    </button>
  );
}

// ===== PREMIUM LEAGUE CARD =====
interface PremiumLeagueCardProps {
  name: string;
  sport: string;
  sportIcon?: React.ElementType;
  sportAbbr?: string;
  format: string;
  memberCount: number;
  entryFeeCents?: number;
  rank: number;
  totalPlayers: number;
  delta: number;
  status: StatusType;
  lockTime?: Date;
  periodLabel: string;
  periodNumber: number;
  isSubmitted: boolean;
  receiptCode?: string;
  onMakePicks: () => void;
  onViewStandings: () => void;
  onInvite: () => void;
  onAdmin?: () => void;
  onChat?: () => void;
  onGameDay?: () => void;
  showAdmin?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Sport-specific gradient colors
const sportGradients: Record<string, { from: string; to: string; accent: string }> = {
  nfl: { from: "from-orange-500/20", to: "to-red-600/10", accent: "orange" },
  nba: { from: "from-orange-400/20", to: "to-amber-500/10", accent: "orange" },
  mlb: { from: "from-red-500/20", to: "to-blue-600/10", accent: "red" },
  nhl: { from: "from-blue-500/20", to: "to-cyan-500/10", accent: "blue" },
  ncaaf: { from: "from-amber-500/20", to: "to-orange-600/10", accent: "amber" },
  ncaab: { from: "from-blue-500/20", to: "to-indigo-600/10", accent: "blue" },
  soccer: { from: "from-green-500/20", to: "to-emerald-600/10", accent: "green" },
  golf: { from: "from-emerald-500/20", to: "to-green-600/10", accent: "emerald" },
};

export function PremiumLeagueCard({
  name,
  sport,
  sportIcon: SportIcon,
  sportAbbr,
  format,
  memberCount,
  entryFeeCents,
  rank,
  totalPlayers,
  delta,
  status,
  lockTime,
  periodLabel,
  periodNumber,
  isSubmitted,
  receiptCode,
  onMakePicks,
  onViewStandings,
  onInvite,
  onAdmin,
  onChat,
  onGameDay,
  showAdmin,
  className,
  style
}: PremiumLeagueCardProps) {
  const gradient = sportGradients[sport.toLowerCase()] || sportGradients.nfl;
  const emoji = sportEmojis[sport.toLowerCase()] || "🏆";
  
  const getCtaLabel = () => {
    if (status === "locked" || status === "live" || status === "final") return "View";
    if (isSubmitted) return "Edit";
    return "Pick";
  };
  
  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/50",
        "bg-gradient-to-br backdrop-blur-sm",
        gradient.from, gradient.to,
        "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        "transition-all duration-300 ease-out",
        className
      )}
      style={style}
    >
      {/* Subtle shine effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
      </div>
      
      <div className="relative p-4 sm:p-5">
        {/* Top Row: Sport Badge + Status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Sport Icon Circle */}
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              "bg-background/80 backdrop-blur-sm border border-border/50",
              "group-hover:scale-105 transition-transform"
            )}>
              {SportIcon ? (
                <SportIcon className="w-5 h-5 text-foreground/80" />
              ) : (
                <span className="text-lg">{emoji}</span>
              )}
            </div>
            {/* Sport & Format Tags */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold tracking-wider text-foreground/60 uppercase">
                {sportAbbr || sport}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{format}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Entry Fee Badge */}
            {entryFeeCents && entryFeeCents > 0 && (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                ${Math.floor(entryFeeCents / 100)}
              </span>
            )}
            <StatusPill status={status} />
          </div>
        </div>
        
        {/* League Name */}
        <h3 className="text-lg font-semibold text-foreground mb-1 truncate group-hover:text-primary transition-colors">
          {name}
        </h3>
        
        {/* Period + Countdown Row */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
          <span>{periodLabel} {periodNumber}</span>
          <span>•</span>
          <span>{memberCount} players</span>
          {lockTime && (status === "open" || status === "submitted") && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1 text-foreground/70">
                <Clock className="w-3 h-3" />
                <CountdownPill targetDate={lockTime} size="sm" showLabels={false} className="text-xs" />
              </span>
            </>
          )}
        </div>
        
        {/* Stats Row */}
        <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-background/50 border border-border/30">
          {/* Rank Display */}
          <div className="flex items-center gap-3">
            <RankBadge rank={rank} size="sm" />
            <div>
              <div className="text-xs text-muted-foreground">Your Rank</div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">#{rank}</span>
                <span className="text-xs text-muted-foreground">/ {totalPlayers}</span>
              </div>
            </div>
          </div>
          
          {/* Delta */}
          <div className="text-center px-3 border-x border-border/30">
            <div className="text-xs text-muted-foreground mb-0.5">Change</div>
            <DeltaIndicator delta={delta} />
          </div>
          
          {/* Submission Status */}
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Picks</div>
            {isSubmitted && receiptCode ? (
              <div className="flex items-center gap-1 text-[hsl(var(--success))]">
                <Check className="w-3.5 h-3.5" />
                <span className="text-xs font-mono">{receiptCode.split('-')[1]}</span>
              </div>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Not submitted</span>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={onMakePicks}
            className="btn-primary flex-1 py-2.5"
          >
            {getCtaLabel()}
          </button>
          <button 
            onClick={onViewStandings}
            className="btn-secondary px-3 py-2.5"
            title="Standings"
          >
            <Trophy className="w-4 h-4" />
          </button>
          <button 
            onClick={onGameDay}
            className="btn-secondary px-3 py-2.5"
            title="Game Day"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button 
            onClick={onChat}
            className="btn-ghost px-3 py-2.5"
            title="Chat"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button 
            onClick={onInvite}
            className="btn-ghost px-3 py-2.5"
            title="Invite"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          {showAdmin && onAdmin && (
            <button 
              onClick={onAdmin}
              className="btn-ghost px-3 py-2.5 text-amber-600 dark:text-amber-400"
              title="Admin"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {/* Live indicator pulse */}
      {status === "live" && (
        <div className="absolute top-3 right-3">
          <div className="relative">
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-[hsl(var(--live))] animate-ping" />
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--live))]" />
          </div>
        </div>
      )}
    </div>
  );
}
