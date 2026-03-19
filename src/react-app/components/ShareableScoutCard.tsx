/**
 * ShareableScoutCard - Visual card for shared Scout AI takes
 * Displays the AI insight with branding for social sharing
 */
import { Sparkles, Calendar, TrendingUp, Trophy, Zap } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface ShareableScoutCardProps {
  gameContext?: string | null;
  scoutTake: string;
  confidence?: string | null;
  persona?: string;
  sportKey?: string | null;
  teams?: string | null;
  createdAt?: string;
  viewCount?: number;
  className?: string;
  variant?: "default" | "compact";
}

// Persona configurations
const personaConfig: Record<string, { name: string; avatar: string; gradient: string; glow: string }> = {
  billy: {
    name: "Billy",
    avatar: "🎯",
    gradient: "from-emerald-500/90 via-teal-500/90 to-cyan-600/90",
    glow: "shadow-emerald-500/20"
  },
  coach: {
    name: "Coach",
    avatar: "🏈",
    gradient: "from-amber-500/90 via-orange-500/90 to-red-500/90",
    glow: "shadow-amber-500/20"
  },
  big_g: {
    name: "Big G",
    avatar: "📊",
    gradient: "from-blue-600/90 via-indigo-600/90 to-purple-700/90",
    glow: "shadow-blue-500/20"
  }
};

// Confidence indicator styling
function getConfidenceStyle(confidence?: string | null): { color: string; icon: typeof TrendingUp; label: string } {
  const c = confidence?.toLowerCase() || "";
  if (c.includes("high") || c.includes("strong") || c.includes("confident")) {
    return { color: "text-green-500", icon: TrendingUp, label: "High Confidence" };
  }
  if (c.includes("medium") || c.includes("moderate")) {
    return { color: "text-amber-500", icon: Zap, label: "Moderate Confidence" };
  }
  if (c.includes("low") || c.includes("uncertain")) {
    return { color: "text-muted-foreground", icon: Trophy, label: "Low Confidence" };
  }
  return { color: "text-blue-500", icon: Sparkles, label: confidence || "" };
}

// Sport icons mapping
const sportIcons: Record<string, string> = {
  americanfootball_nfl: "🏈",
  americanfootball_ncaaf: "🏈",
  basketball_nba: "🏀",
  basketball_ncaab: "🏀",
  baseball_mlb: "⚾",
  icehockey_nhl: "🏒",
  soccer_epl: "⚽",
  soccer_mls: "⚽",
  mma_mixed_martial_arts: "🥊",
  golf_pga: "⛳",
  tennis_atp: "🎾"
};

export function ShareableScoutCard({
  gameContext,
  scoutTake,
  confidence,
  persona = "billy",
  sportKey,
  teams,
  createdAt,
  viewCount,
  className,
  variant = "default"
}: ShareableScoutCardProps) {
  const personaData = personaConfig[persona] || personaConfig.billy;
  const confidenceData = getConfidenceStyle(confidence);
  const ConfidenceIcon = confidenceData.icon;
  const sportIcon = sportKey ? sportIcons[sportKey] : "🎯";

  const formattedDate = createdAt 
    ? new Date(createdAt).toLocaleDateString("en-US", { 
        month: "short", 
        day: "numeric", 
        hour: "numeric", 
        minute: "2-digit" 
      })
    : null;

  if (variant === "compact") {
    return (
      <div className={cn(
        "rounded-xl overflow-hidden border border-border/50",
        "bg-card shadow-lg",
        personaData.glow,
        className
      )}>
        <div className={cn(
          "bg-gradient-to-r px-3 py-2 text-white",
          personaData.gradient
        )}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{personaData.avatar}</span>
            <span className="font-medium text-sm">{personaData.name}'s Take</span>
            {sportIcon && <span className="ml-auto text-sm opacity-80">{sportIcon}</span>}
          </div>
        </div>
        <div className="p-3">
          <p className="text-sm leading-relaxed line-clamp-3">{scoutTake}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden border border-border/50",
      "bg-card shadow-2xl max-w-md w-full",
      personaData.glow,
      className
    )}>
      {/* Header with gradient */}
      <div className={cn(
        "bg-gradient-to-r px-5 py-4 text-white relative overflow-hidden",
        personaData.gradient
      )}>
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>
        
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl shadow-lg">
            {personaData.avatar}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold tracking-tight">{personaData.name}'s Take</h3>
              <Sparkles className="w-4 h-4 opacity-70" />
            </div>
            <p className="text-white/70 text-xs">Scout AI Insight</p>
          </div>
          {sportIcon && (
            <span className="text-2xl opacity-80">{sportIcon}</span>
          )}
        </div>
      </div>

      {/* Game Context */}
      {(gameContext || teams) && (
        <div className="px-5 py-3 bg-muted/30 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{gameContext || teams}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-5">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{scoutTake}</p>
        
        {/* Confidence indicator */}
        {confidence && (
          <div className="mt-4 flex items-center gap-2">
            <ConfidenceIcon className={cn("w-4 h-4", confidenceData.color)} />
            <span className={cn("text-xs font-medium", confidenceData.color)}>
              {confidenceData.label}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-muted/20 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {formattedDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formattedDate}
            </span>
          )}
          {typeof viewCount === "number" && viewCount > 0 && (
            <span className="flex items-center gap-1">
              {viewCount} {viewCount === 1 ? "view" : "views"}
            </span>
          )}
        </div>
        
        {/* Branding */}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            Powered by Scout
          </span>
        </div>
      </div>
    </div>
  );
}

export default ShareableScoutCard;
