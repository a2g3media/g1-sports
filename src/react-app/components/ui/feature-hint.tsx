import { X, Share2, Trophy, Sparkles } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

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
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
    iconColor: "text-blue-500",
  },
  leaderboard: {
    icon: Trophy,
    title: "Check the leaderboard!",
    description: "See how you rank against others",
    color: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
    iconColor: "text-amber-500",
  },
  ai: {
    icon: Sparkles,
    title: "Ask Coach G anything!",
    description: "100 free questions daily",
    color: "from-purple-500/20 to-pink-500/20 border-purple-500/30",
    iconColor: "text-purple-500",
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
