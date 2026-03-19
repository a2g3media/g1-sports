/**
 * ProfileHeader Component
 * 
 * Display user profile with subscription badge
 */

import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { SubscriptionBadge } from "@/react-app/components/SubscriptionBadge";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { User } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface ProfileHeaderProps {
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  className?: string;
}

export function ProfileHeader({ size = "md", showBadge = true, className }: ProfileHeaderProps) {
  const { user } = useDemoAuth();
  const { subscription } = useSubscription();
  
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-base",
  };
  
  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-5 w-5",
    lg: "h-7 w-7",
  };
  
  if (!user) return null;
  
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(
        "rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center",
        sizeClasses[size]
      )}>
        <User className={cn("text-primary", iconSizes[size])} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            "font-semibold truncate",
            size === "sm" && "text-sm",
            size === "md" && "text-base",
            size === "lg" && "text-lg"
          )}>
            {user.email?.split('@')[0] || "User"}
          </p>
          {showBadge && subscription && (
            <SubscriptionBadge 
              tier={subscription.tier} 
              size={size === "lg" ? "md" : "sm"} 
            />
          )}
        </div>
        {user.email && (
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        )}
      </div>
    </div>
  );
}
