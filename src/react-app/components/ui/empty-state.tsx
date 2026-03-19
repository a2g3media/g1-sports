/**
 * Smart Empty States
 * 
 * Reusable empty state component for lists and grids.
 * Friendly, action-driven messaging.
 * Conditional rendering: only shows when loading=false, error=null, data is empty.
 */

import { cn } from "@/react-app/lib/utils";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { 
  Trophy, 
  FileText, 
  Users, 
  Bell, 
  Calendar, 
  Heart,
  Gamepad2,
  Target,
  Star
} from "lucide-react";

interface EmptyStateProps {
  /** Icon to display (from lucide-react) */
  icon?: LucideIcon;
  /** Main headline */
  title: string;
  /** Friendly description text */
  description: string;
  /** Primary CTA button */
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Optional secondary link */
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Custom icon color (defaults to primary) */
  iconClassName?: string;
  /** Additional container className */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  primaryAction,
  secondaryAction,
  iconClassName,
  className,
  size = "md"
}: EmptyStateProps) {
  const sizeConfig = {
    sm: {
      container: "py-8",
      iconWrapper: "w-12 h-12 rounded-xl mb-4",
      icon: "w-6 h-6",
      title: "text-base font-semibold mb-1",
      description: "text-sm mb-4 max-w-xs",
      button: "text-sm px-4 py-2"
    },
    md: {
      container: "py-12",
      iconWrapper: "w-16 h-16 rounded-2xl mb-6",
      icon: "w-8 h-8",
      title: "text-xl font-bold mb-2",
      description: "text-sm mb-6 max-w-sm",
      button: "text-sm px-5 py-2.5"
    },
    lg: {
      container: "py-16",
      iconWrapper: "w-20 h-20 rounded-2xl mb-8",
      icon: "w-10 h-10",
      title: "text-2xl font-bold mb-3",
      description: "text-base mb-8 max-w-md",
      button: "px-6 py-3"
    }
  };

  const config = sizeConfig[size];

  return (
    <div className={cn(
      "text-center mx-auto",
      config.container,
      className
    )}>
      {/* Icon */}
      <div className={cn(
        "bg-primary/10 flex items-center justify-center mx-auto",
        config.iconWrapper
      )}>
        <Icon className={cn(
          "text-primary",
          config.icon,
          iconClassName
        )} />
      </div>

      {/* Title */}
      <h3 className={cn("text-foreground", config.title)}>
        {title}
      </h3>

      {/* Description */}
      <p className={cn(
        "text-muted-foreground mx-auto",
        config.description
      )}>
        {description}
      </p>

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {secondaryAction && (
            secondaryAction.href ? (
              <Link to={secondaryAction.href}>
                <button className={cn(
                  "btn-secondary rounded-xl font-medium",
                  config.button
                )}>
                  {secondaryAction.label}
                </button>
              </Link>
            ) : (
              <button
                onClick={secondaryAction.onClick}
                className={cn(
                  "btn-secondary rounded-xl font-medium",
                  config.button
                )}
              >
                {secondaryAction.label}
              </button>
            )
          )}
          {primaryAction && (
            primaryAction.href ? (
              <Link to={primaryAction.href}>
                <button className={cn(
                  "btn-primary rounded-xl font-medium",
                  config.button
                )}>
                  {primaryAction.label}
                </button>
              </Link>
            ) : (
              <button
                onClick={primaryAction.onClick}
                className={cn(
                  "btn-primary rounded-xl font-medium",
                  config.button
                )}
              >
                {primaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * EmptyStateWrapper - Conditional wrapper that shows empty state only when appropriate
 * 
 * Usage:
 *   <EmptyStateWrapper
 *     loading={isLoading}
 *     error={error}
 *     isEmpty={items.length === 0}
 *     emptyState={<EmptyState title="..." description="..." />}
 *   >
 *     {children}
 *   </EmptyStateWrapper>
 */
interface EmptyStateWrapperProps {
  /** Is data currently loading? */
  loading: boolean;
  /** Current error state (null if no error) */
  error: string | null | undefined;
  /** Is the data array empty? */
  isEmpty: boolean;
  /** The empty state component to render */
  emptyState: React.ReactNode;
  /** Normal content to render when data exists */
  children: React.ReactNode;
}

export function EmptyStateWrapper({
  loading,
  error,
  isEmpty,
  emptyState,
  children
}: EmptyStateWrapperProps) {
  // Don't show empty state while loading or if there's an error
  if (loading || error) {
    return <>{children}</>;
  }

  // Show empty state only when: loading=false, error=null, data is empty
  if (isEmpty) {
    return <>{emptyState}</>;
  }

  return <>{children}</>;
}

// Pre-configured empty states for common scenarios

export function PoolsEmptyState() {
  return (
    <EmptyState
      icon={Trophy}
      title="No Pools Yet"
      description="Join a pool with an invite code or create your own to get started."
      primaryAction={{ label: "Create Pool", href: "/create-league" }}
      secondaryAction={{ label: "Join Pool", href: "/join" }}
    />
  );
}

export function PicksEmptyState({ onMakePicks }: { onMakePicks?: () => void }) {
  return (
    <EmptyState
      icon={Target}
      title="No Picks Submitted"
      description="Make your selections before kickoff to compete with your pool."
      primaryAction={{ 
        label: "Make Picks", 
        onClick: onMakePicks,
        href: onMakePicks ? undefined : "#picks"
      }}
    />
  );
}

export function GamesEmptyState({ sport }: { sport?: string }) {
  return (
    <EmptyState
      icon={Calendar}
      title="No Games Today"
      description={sport 
        ? `No ${sport} games scheduled for this date. Try selecting a different day.`
        : "No games scheduled for this date. Try selecting a different day or sport."
      }
      size="sm"
    />
  );
}

export function AlertsEmptyState() {
  return (
    <EmptyState
      icon={Bell}
      title="No Alerts Yet"
      description="You'll see game updates, score changes, and important notifications here."
      primaryAction={{ label: "Set Up Alerts", href: "/settings" }}
      size="sm"
    />
  );
}

export function LeagueMembersEmptyState() {
  return (
    <EmptyState
      icon={Users}
      title="No Members Yet"
      description="Share your invite code to get friends to join your pool."
      size="sm"
    />
  );
}

export function FavoritesEmptyState() {
  return (
    <EmptyState
      icon={Heart}
      title="No Favorites Yet"
      description="Follow your favorite teams to see their games highlighted."
      primaryAction={{ label: "Find Teams", href: "/settings" }}
      size="sm"
    />
  );
}

export function WatchlistEmptyState() {
  return (
    <EmptyState
      icon={Star}
      title="Watchlist Empty"
      description="Add games you want to track closely for real-time updates."
      size="sm"
    />
  );
}

export function ContestsEmptyState() {
  return (
    <EmptyState
      icon={Gamepad2}
      title="No Active Contests"
      description="Join or create a pool to start competing with friends."
      primaryAction={{ label: "Browse Pools", href: "/pools" }}
      secondaryAction={{ label: "Create Pool", href: "/create-league" }}
    />
  );
}

export function SearchEmptyState({ query }: { query: string }) {
  return (
    <EmptyState
      icon={FileText}
      title="No Results Found"
      description={`We couldn't find anything matching "${query}". Try a different search term.`}
      size="sm"
    />
  );
}

export function FilterEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <EmptyState
      icon={FileText}
      title="No Matches"
      description="No items match your current filters. Try adjusting your criteria."
      primaryAction={onClearFilters ? { 
        label: "Clear Filters", 
        onClick: onClearFilters 
      } : undefined}
      size="sm"
    />
  );
}
