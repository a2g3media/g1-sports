import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Star, Trash2, RefreshCw, ChevronRight, Gamepad2, Users, Trophy,
  Building, Activity, AlertTriangle, Loader2
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/react-app/components/ui/alert-dialog";
import { useWatchlistItems, type WatchlistItemDisplay } from "@/react-app/hooks/useAlerts";
import type { WatchlistItemType } from "@/shared/types";

// Item type configurations
const ITEM_TYPE_CONFIG: Record<WatchlistItemType, {
  icon: typeof Star;
  label: string;
  color: string;
  bgColor: string;
}> = {
  GAME: {
    icon: Gamepad2,
    label: "Game",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  TEAM: {
    icon: Users,
    label: "Team",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  POOL: {
    icon: Trophy,
    label: "Pool",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  LEAGUE: {
    icon: Building,
    label: "League",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  SPORT: {
    icon: Activity,
    label: "Sport",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

// Individual watchlist item card
function WatchlistItemCard({
  item,
  onUnfollow,
}: {
  item: WatchlistItemDisplay;
  onUnfollow: () => void;
}) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const config = ITEM_TYPE_CONFIG[item.item_type];
  const Icon = config.icon;
  
  // Parse metadata for additional info
  const metadata = item.metadata_json ? JSON.parse(item.metadata_json) : {};
  
  // Generate display name
  const displayName = item.display_name || item.item_id;
  
  // Generate link based on type
  const getLink = () => {
    switch (item.item_type) {
      case "GAME":
        return `/intel/game/${item.item_id}`;
      case "POOL":
        return `/pools/${item.item_id}`;
      case "TEAM":
        return `/teams/${item.item_id}`;
      default:
        return null;
    }
  };
  
  const link = getLink();
  
  const handleDelete = async () => {
    setIsDeleting(true);
    await onUnfollow();
    setIsDeleting(false);
    setConfirmDelete(false);
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };
  
  return (
    <>
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border bg-card",
        "hover:bg-muted/30 transition-colors group"
      )}>
        {/* Icon */}
        <div className={cn(
          "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          config.bgColor
        )}>
          <Icon className={cn("w-5 h-5", config.color)} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{displayName}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {config.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {item.sport_type && (
              <span className="uppercase">{item.sport_type}</span>
            )}
            {metadata.team_name && (
              <span>• {metadata.team_name}</span>
            )}
            <span>• Added {formatDate(item.created_at)}</span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {link && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(link)}
              title="View details"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            title="Unfollow"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Star indicator (always visible) */}
        <Star className={cn(
          "w-4 h-4 shrink-0 fill-amber-500 text-amber-500",
          "group-hover:opacity-50"
        )} />
      </div>
      
      {/* Confirm delete dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfollow {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll no longer receive alerts for this {config.label.toLowerCase()}. 
              You can follow it again anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Unfollow"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Empty state
function EmptyWatchlist() {
  const navigate = useNavigate();
  
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Star className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Nothing followed yet</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm">
        Follow games, teams, pools, or sports to get personalized alerts when important things happen.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={() => navigate("/live")}>
          Browse Games
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/pools")}>
          View Pools
        </Button>
      </div>
    </div>
  );
}

// Main watchlist management component
export function WatchlistManagement() {
  const { items, loading, error, refresh, unfollow } = useWatchlistItems();
  const [filterType, setFilterType] = useState<WatchlistItemType | "ALL">("ALL");
  
  // Filter items
  const filteredItems = filterType === "ALL" 
    ? items 
    : items.filter(item => item.item_type === filterType);
  
  // Group items by type for stats
  const groupedCounts = items.reduce((acc, item) => {
    acc[item.item_type] = (acc[item.item_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }
  
  if (items.length === 0) {
    return <EmptyWatchlist />;
  }
  
  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border bg-card p-3">
          <div className="text-2xl font-bold text-primary">{items.length}</div>
          <div className="text-xs text-muted-foreground">Following</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-2xl font-bold">{groupedCounts["GAME"] || 0}</div>
          <div className="text-xs text-muted-foreground">Games</div>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <div className="text-2xl font-bold">{groupedCounts["POOL"] || 0}</div>
          <div className="text-xs text-muted-foreground">Pools</div>
        </div>
      </div>
      
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        <FilterButton
          active={filterType === "ALL"}
          onClick={() => setFilterType("ALL")}
          count={items.length}
        >
          All
        </FilterButton>
        {(["GAME", "POOL", "TEAM", "SPORT"] as WatchlistItemType[]).map(type => {
          const count = groupedCounts[type] || 0;
          if (count === 0) return null;
          const config = ITEM_TYPE_CONFIG[type];
          return (
            <FilterButton
              key={type}
              active={filterType === type}
              onClick={() => setFilterType(type)}
              count={count}
            >
              {config.label}s
            </FilterButton>
          );
        })}
      </div>
      
      {/* Items list */}
      <div className="space-y-2">
        {filteredItems.map(item => (
          <WatchlistItemCard
            key={`${item.item_type}-${item.item_id}`}
            item={item}
            onUnfollow={() => unfollow(item.item_type, item.item_id)}
          />
        ))}
      </div>
      
      {filteredItems.length === 0 && filterType !== "ALL" && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No {ITEM_TYPE_CONFIG[filterType].label.toLowerCase()}s followed</p>
        </div>
      )}
    </div>
  );
}

// Filter button component
function FilterButton({
  children,
  active,
  onClick,
  count,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span>{children}</span>
      <span className={cn(
        "text-xs px-1.5 py-0.5 rounded",
        active ? "bg-primary-foreground/20" : "bg-background"
      )}>
        {count}
      </span>
    </button>
  );
}
