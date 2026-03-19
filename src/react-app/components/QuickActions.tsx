import { useNavigate } from "react-router-dom";
import { 
  Trophy, Bell, Radio, 
  Star, Target, Crown
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useSubscription } from "@/react-app/hooks/useSubscription";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  color?: string;
  badge?: string;
  eliteOnly?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "scores", label: "Games & Odds", icon: Radio, path: "/games", color: "text-blue-500" },
  { id: "pools", label: "Pools", icon: Trophy, path: "/pools", color: "text-amber-500" },
  { id: "alerts", label: "Alerts", icon: Bell, path: "/alerts", color: "text-purple-500" },
  { id: "watchlist", label: "Following", icon: Star, path: "/watchlist", color: "text-yellow-500" },
  { id: "picks", label: "My Picks", icon: Target, path: "/picks/history", color: "text-green-500" },
  { id: "command", label: "Command", icon: Crown, path: "/elite/command-center", color: "text-amber-400", eliteOnly: true },
];

interface QuickActionsProps {
  className?: string;
}

export function QuickActions({ className }: QuickActionsProps) {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const tier = subscription?.tier || 'FREE';
  const isElite = (tier as string) === "SCOUT_ELITE";
  
  const visibleActions = QUICK_ACTIONS.filter(action => 
    !action.eliteOnly || isElite
  );
  
  return (
    <div className={cn("grid grid-cols-4 sm:grid-cols-6 gap-2", className)}>
      {visibleActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => navigate(action.path)}
            className={cn(
              "group flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl",
              "bg-card/80 backdrop-blur-sm border border-transparent transition-all duration-200",
              "hover:bg-accent/50 hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5",
              "active:scale-95 active:translate-y-0"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200",
              "bg-secondary group-hover:scale-110"
            )}>
              <Icon className={cn("w-5 h-5 transition-colors", action.color || "text-foreground")} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {action.label}
            </span>
            {action.badge && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                {action.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
