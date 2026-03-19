import { useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { useFollow } from "@/react-app/hooks/useAlerts";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { WatchlistItemType } from "@/shared/types";

interface FollowButtonProps {
  itemType: WatchlistItemType;
  itemId: string;
  sportType?: string;
  variant?: "default" | "icon" | "compact" | "pill";
  className?: string;
  showLabel?: boolean;
  onToggle?: (isFollowing: boolean) => void;
}

export function FollowButton({
  itemType,
  itemId,
  sportType,
  variant = "default",
  className,
  showLabel = true,
  onToggle,
}: FollowButtonProps) {
  const { isDemoMode } = useDemoAuth();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const { isFollowing, loading, toggle } = useFollow(scope, itemType, itemId, sportType);
  const [showToast, setShowToast] = useState(false);

  const handleToggle = async () => {
    const success = await toggle();
    if (success) {
      onToggle?.(!isFollowing);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  };

  const label = isFollowing ? "Following" : "Follow";
  const itemLabel = {
    GAME: "game",
    TEAM: "team",
    POOL: "pool",
    LEAGUE: "league",
    SPORT: "sport",
  }[itemType];

  // Icon-only button
  if (variant === "icon") {
    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            "relative transition-all",
            isFollowing && "text-amber-500 hover:text-amber-600",
            className
          )}
          title={isFollowing ? `Unfollow this ${itemLabel}` : `Follow this ${itemLabel}`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star
              className={cn(
                "h-4 w-4 transition-all",
                isFollowing && "fill-current"
              )}
            />
          )}
        </Button>
        {/* Toast */}
        <Toast show={showToast} isFollowing={isFollowing} itemLabel={itemLabel} />
      </div>
    );
  }

  // Compact button with small icon
  if (variant === "compact") {
    return (
      <div className="relative">
        <button
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all",
            "border border-border/50 hover:border-border",
            isFollowing 
              ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20" 
              : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted",
            loading && "opacity-50 cursor-not-allowed",
            className
          )}
          title={isFollowing ? `Unfollow this ${itemLabel}` : `Follow this ${itemLabel}`}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Star
              className={cn(
                "h-3 w-3 transition-all",
                isFollowing && "fill-current"
              )}
            />
          )}
          {showLabel && <span>{label}</span>}
        </button>
        <Toast show={showToast} isFollowing={isFollowing} itemLabel={itemLabel} />
      </div>
    );
  }

  // Pill style
  if (variant === "pill") {
    return (
      <div className="relative">
        <button
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
            isFollowing 
              ? "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/25" 
              : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
            loading && "opacity-50 cursor-not-allowed",
            className
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star
              className={cn(
                "h-4 w-4 transition-all",
                isFollowing && "fill-current"
              )}
            />
          )}
          {showLabel && <span>{label}</span>}
        </button>
        <Toast show={showToast} isFollowing={isFollowing} itemLabel={itemLabel} position="below" />
      </div>
    );
  }

  // Default button
  return (
    <div className="relative">
      <Button
        variant={isFollowing ? "secondary" : "outline"}
        size="sm"
        onClick={handleToggle}
        disabled={loading}
        className={cn(
          "gap-2 transition-all",
          isFollowing && "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20",
          className
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Star
            className={cn(
              "h-4 w-4 transition-all",
              isFollowing && "fill-current"
            )}
          />
        )}
        {showLabel && label}
      </Button>
      <Toast show={showToast} isFollowing={isFollowing} itemLabel={itemLabel} />
    </div>
  );
}

// Toast notification
function Toast({ 
  show, 
  isFollowing, 
  itemLabel,
  position = "above"
}: { 
  show: boolean; 
  isFollowing: boolean; 
  itemLabel: string;
  position?: "above" | "below";
}) {
  if (!show) return null;
  
  return (
    <div 
      className={cn(
        "absolute left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 zoom-in-95 duration-200",
        position === "above" ? "bottom-full mb-2" : "top-full mt-2"
      )}
    >
      <div className="bg-foreground text-background px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg">
        {isFollowing ? `Following this ${itemLabel}` : `Unfollowed`}
      </div>
    </div>
  );
}

// Quick follow row for lists
interface QuickFollowRowProps {
  itemType: WatchlistItemType;
  itemId: string;
  sportType?: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function QuickFollowRow({
  itemType,
  itemId,
  sportType,
  label,
  sublabel,
  icon,
  className,
}: QuickFollowRowProps) {
  const { isDemoMode } = useDemoAuth();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const { isFollowing, loading, toggle } = useFollow(scope, itemType, itemId, sportType);

  return (
    <div 
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors",
        className
      )}
    >
      {icon && (
        <div className="shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground truncate">{sublabel}</p>}
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={cn(
          "shrink-0 p-2 rounded-lg transition-all",
          isFollowing 
            ? "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20" 
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
          loading && "opacity-50"
        )}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Star className={cn("h-5 w-5", isFollowing && "fill-current")} />
        )}
      </button>
    </div>
  );
}
