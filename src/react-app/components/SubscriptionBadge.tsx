/**
 * SubscriptionBadge Component
 * 
 * Displays user's subscription tier as a premium badge.
 * Shows trial status, admin badges, and charter member status.
 */

import { Badge } from "@/react-app/components/ui/badge";
import { Crown, Zap, Trophy, Shield, Sparkles, Clock } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface SubscriptionBadgeProps {
  tier: string;
  isTrialing?: boolean;
  trialDaysRemaining?: number;
  isCharter?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const TIER_CONFIG = {
  free: {
    label: "Free",
    icon: null,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
    show: false,
  },
  pool_access: {
    label: "Pool",
    icon: Trophy,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    show: true,
  },
  scout_pro: {
    label: "Pro",
    icon: Zap,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    show: true,
  },
  scout_elite: {
    label: "Elite",
    icon: Crown,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    show: true,
  },
  admin_starter: {
    label: "Admin",
    icon: Shield,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    show: true,
  },
  admin_unlimited: {
    label: "Admin",
    icon: Shield,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    show: true,
  },
};

export function SubscriptionBadge({
  tier,
  isTrialing = false,
  trialDaysRemaining,
  isCharter = false,
  size = "md",
  showLabel = true,
}: SubscriptionBadgeProps) {
  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.free;
  const Icon = config.icon;
  
  // Don't show badge for free tier unless trialing
  if (!config.show && !isTrialing) {
    return null;
  }
  
  const iconSize = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const fontSize = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";
  
  if (isTrialing) {
    return (
      <div className="flex items-center gap-2">
        <Badge className={cn(
          "bg-amber-100 dark:bg-amber-900/30",
          "text-amber-700 dark:text-amber-300",
          "border border-amber-200 dark:border-amber-800",
          fontSize
        )}>
          <Clock className={cn(iconSize, "mr-1")} />
          {showLabel && (
            <>
              Trial
              {trialDaysRemaining !== undefined && ` (${trialDaysRemaining}d)`}
            </>
          )}
        </Badge>
        {isCharter && (
          <Badge className={cn(
            "bg-primary/10 border border-primary/20",
            "text-primary",
            fontSize
          )}>
            <Sparkles className={cn(iconSize, "mr-1")} />
            {showLabel && "Charter"}
          </Badge>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <Badge className={cn(
          config.bgColor,
          config.color,
          "border border-current/20",
          fontSize
        )}>
          <Icon className={cn(iconSize, "mr-1")} />
          {showLabel && config.label}
        </Badge>
      )}
      {isCharter && (
        <Badge className={cn(
          "bg-primary/10 border border-primary/20",
          "text-primary",
          fontSize
        )}>
          <Sparkles className={cn(iconSize, "mr-1")} />
          {showLabel && "Charter"}
        </Badge>
      )}
    </div>
  );
}
