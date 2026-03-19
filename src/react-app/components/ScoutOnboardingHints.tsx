import { X, Share2, Trophy, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

// Coach G Welcome Tooltip - shown when panel is collapsed for first-time users
interface CoachGWelcomeTooltipProps {
  onDismiss: () => void;
  className?: string;
}

export function CoachGWelcomeTooltip({ onDismiss, className }: CoachGWelcomeTooltipProps) {
  return (
    <div
      className={cn(
        "absolute -left-48 top-1/2 -translate-y-1/2 z-50",
        "bg-blue-500 text-white",
        "px-4 py-3 rounded-xl shadow-xl",
        "animate-in fade-in slide-in-from-right-4 duration-500",
        "max-w-[200px]",
        className
      )}
    >
      <button
        onClick={onDismiss}
        className="absolute -top-2 -right-2 p-1 bg-white/20 rounded-full hover:bg-white/30"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-start gap-2">
        <MessageCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Ask Coach G about any game</p>
          <p className="text-xs text-white/80 mt-0.5">100 free questions daily</p>
        </div>
      </div>
      {/* Arrow pointing right */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
        <div className="border-8 border-transparent border-l-blue-500" />
      </div>
    </div>
  );
}

// Free Questions Badge - shows remaining daily questions for free tier
interface FreeQuestionsBadgeProps {
  questionsRemaining: number;
  dailyLimit: number;
  className?: string;
}

export function FreeQuestionsBadge({ questionsRemaining, dailyLimit, className }: FreeQuestionsBadgeProps) {
  const percentage = (questionsRemaining / dailyLimit) * 100;
  const isLow = percentage <= 20;
  const isEmpty = questionsRemaining <= 0;
  
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        isEmpty ? "bg-red-500/20 text-red-300" :
        isLow ? "bg-muted text-muted-foreground" :
        "bg-blue-500/20 text-blue-400",
        className
      )}
    >
      <Sparkles className="w-3 h-3" />
      <span>{questionsRemaining}/{dailyLimit} free today</span>
    </div>
  );
}

// Feature Hint - contextual hints for share, leaderboard, etc.
interface FeatureHintProps {
  type: "share" | "leaderboard" | "ai";
  onDismiss: () => void;
  className?: string;
}

const HINT_CONFIG = {
  share: {
    icon: Share2,
    title: "Share this take!",
    description: "Flex Coach G's insights with friends",
    color: "bg-blue-500/10 border-blue-500/30",
    iconColor: "text-blue-500",
  },
  leaderboard: {
    icon: Trophy,
    title: "Check the leaderboard!",
    description: "See how you rank against others",
    color: "bg-blue-500/10 border-blue-500/30",
    iconColor: "text-blue-500",
  },
  ai: {
    icon: Sparkles,
    title: "Ask Coach G anything",
    description: "100 free questions daily",
    color: "bg-blue-500/10 border-blue-500/30",
    iconColor: "text-blue-500",
  },
} as const;

export function FeatureHint({ type, onDismiss, className }: FeatureHintProps) {
  const config = HINT_CONFIG[type];
  const Icon = config.icon;
  
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 px-4 py-2.5 rounded-xl",
        "bg-gradient-to-r border backdrop-blur-sm",
        "animate-in fade-in slide-in-from-bottom-2 duration-500",
        config.color,
        className
      )}
    >
      <div className={cn("shrink-0", config.iconColor)}>
        <Icon className="w-5 h-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {config.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {config.description}
        </p>
      </div>
      
      <button
        onClick={onDismiss}
        className="shrink-0 p-1 rounded-md hover:bg-foreground/10 transition-colors"
        aria-label="Dismiss hint"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}
