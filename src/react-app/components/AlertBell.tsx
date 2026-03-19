import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { useAlertCounts } from "@/react-app/hooks/useAlerts";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { cn } from "@/react-app/lib/utils";

interface AlertBellProps {
  className?: string;
}

export function AlertBell({ className }: AlertBellProps) {
  const navigate = useNavigate();
  const { isDemoMode, user } = useDemoAuth();
  const scope = isDemoMode || !user?.id ? "DEMO" : "PROD";
  const { counts } = useAlertCounts(scope);

  const unreadCount = counts.total_unread;
  const hasCritical = counts.critical_unread > 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/alerts")}
      className={cn(
        "relative h-9 w-9 rounded-full hover:bg-muted/50",
        className
      )}
      title="Alert Center"
    >
      <Bell className={cn(
        "h-4.5 w-4.5",
        hasCritical && "text-red-500"
      )} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center">
          <span className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            hasCritical ? "bg-red-500/40" : "bg-primary/40"
          )} />
          <span className={cn(
            "relative inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white",
            hasCritical ? "bg-red-500" : "bg-primary"
          )}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </span>
      )}
    </Button>
  );
}

// Compact version for mobile nav
export function AlertBellCompact({ className }: AlertBellProps) {
  const navigate = useNavigate();
  const { isDemoMode, user } = useDemoAuth();
  const scope = isDemoMode || !user?.id ? "DEMO" : "PROD";
  const { counts } = useAlertCounts(scope);

  const unreadCount = counts.total_unread;
  const hasCritical = counts.critical_unread > 0;

  return (
    <button
      onClick={() => navigate("/alerts")}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 py-2 flex-1 rounded-xl transition-all",
        "active:scale-95 touch-manipulation text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <div className="relative">
        <Bell className={cn(
          "h-5 w-5",
          hasCritical && "text-red-500"
        )} />
        {unreadCount > 0 && (
          <span className={cn(
            "absolute -top-1 -right-1 h-3.5 w-3.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white",
            hasCritical ? "bg-red-500" : "bg-primary"
          )}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>
      <span className="text-[10px] font-semibold opacity-60">Alerts</span>
    </button>
  );
}
