/**
 * Lightweight Loading Skeletons
 * 
 * Reusable skeleton components for common UI patterns.
 * CSS-only shimmer animation, no external libraries.
 * Matches existing card radius (0.75rem).
 */

import { cn } from "@/react-app/lib/utils";

/**
 * SkeletonBlock - Global rectangular skeleton with shimmer animation
 * 
 * Usage:
 *   <SkeletonBlock className="h-32 w-full" />
 *   <SkeletonBlock width={200} height={40} />
 *   <SkeletonBlock className="h-4 w-24" rounded="full" />
 * 
 * Props:
 *   - width/height: pixel values (optional, use className for Tailwind)
 *   - rounded: "sm" | "md" | "lg" | "xl" | "2xl" | "full" (default: "xl")
 *   - shimmer: boolean (default: true) - use shimmer vs pulse animation
 */
interface SkeletonBlockProps extends React.ComponentProps<"div"> {
  width?: number;
  height?: number;
  rounded?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  shimmer?: boolean;
}

export function SkeletonBlock({ 
  className, 
  width, 
  height, 
  rounded = "xl",
  shimmer = true,
  style,
  ...props 
}: SkeletonBlockProps) {
  const roundedClass = {
    sm: "rounded-sm",
    md: "rounded-md", 
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
    full: "rounded-full",
  }[rounded];
  
  return (
    <div
      className={cn(
        roundedClass,
        shimmer ? "skeleton" : "bg-muted/60 animate-pulse",
        className
      )}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        ...style,
      }}
      {...props}
    />
  );
}

// Base skeleton with pulse animation (legacy, for backwards compatibility)
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-muted/60 rounded-lg animate-pulse", className)}
      {...props}
    />
  );
}

// Text line skeleton
export function TextSkeleton({ 
  width = "w-24", 
  className 
}: { 
  width?: string; 
  className?: string;
}) {
  return <Skeleton className={cn("h-4", width, className)} />;
}

// Avatar/icon skeleton
export function AvatarSkeleton({ 
  size = "md",
  className 
}: { 
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12"
  };
  return <Skeleton className={cn(sizes[size], "rounded-full", className)} />;
}

// Badge skeleton
export function BadgeSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-12 rounded-full", className)} />;
}

// Team row skeleton (team badge + name + score)
export function TeamRowSkeleton({ showScore = true }: { showScore?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Skeleton className="w-6 h-6 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
      {showScore && <Skeleton className="h-6 w-8" />}
    </div>
  );
}

// Game card skeleton (matches GameCard in Scores.tsx)
export function GameCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "p-4 rounded-xl border bg-card/50",
      className
    )}>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3">
        <BadgeSkeleton />
        <Skeleton className="h-5 w-14" />
      </div>
      
      {/* Teams */}
      <div className="space-y-2">
        <TeamRowSkeleton />
        <TeamRowSkeleton />
      </div>
      
      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border">
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// Compact live game card skeleton (for LiveGamesStrip)
export function LiveGameCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "shrink-0 w-[180px] p-3 rounded-xl border bg-card/50",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      
      {/* Teams */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-5 w-6" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-5 w-6" />
        </div>
      </div>
    </div>
  );
}

// Pool/league card skeleton
export function PoolCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "p-4 rounded-2xl border bg-card/50",
      className
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

// Personalized game card skeleton (Dashboard)
export function PersonalizedGameCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "p-4 rounded-xl border bg-card/50",
      className
    )}>
      {/* Badges row */}
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-4 w-10" />
        <BadgeSkeleton className="w-16" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-12" />
      </div>
      
      {/* Teams */}
      <div className="space-y-2">
        <TeamRowSkeleton />
        <TeamRowSkeleton />
      </div>
    </div>
  );
}

// Following/watchlist card skeleton
export function FollowingCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "shrink-0 w-[140px] p-3 rounded-xl border bg-card/50",
      className
    )}>
      <Skeleton className="w-8 h-8 rounded-lg mb-2" />
      <Skeleton className="h-4 w-20 mb-1" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

// Stat card skeleton (admin dashboards)
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "p-4 rounded-xl border bg-card/50",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-24 mb-1" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

// Standing row skeleton
export function StandingRowSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-3 border-b border-border/50",
      className
    )}>
      <Skeleton className="w-6 h-6 rounded" />
      <div className="flex items-center gap-2 flex-1">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-4 w-8" />
    </div>
  );
}

// Chart skeleton
export function ChartSkeleton({ 
  height = "h-48",
  className 
}: { 
  height?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", height, className)}>
      <div className="absolute inset-0 flex items-end justify-around gap-2 p-4">
        {[40, 65, 50, 80, 55, 70, 45, 60].map((h, i) => (
          <Skeleton 
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// Section header skeleton
export function SectionHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <div className="flex items-center gap-2">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

// Full page skeletons

// Live games strip skeleton
export function LiveGamesStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-2 h-2 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <LiveGameCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Games grid skeleton
export function GamesGridSkeleton({ 
  count = 6,
  columns = "sm:grid-cols-2 lg:grid-cols-3"
}: { 
  count?: number;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-3", columns)}>
      {Array.from({ length: count }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Dashboard skeleton
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      
      {/* Live games strip */}
      <LiveGamesStripSkeleton />
      
      {/* Your teams section */}
      <div>
        <SectionHeaderSkeleton />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <PersonalizedGameCardSkeleton key={i} />
          ))}
        </div>
      </div>
      
      {/* Pools section */}
      <div>
        <SectionHeaderSkeleton />
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <PoolCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Command center skeleton
export function CommandCenterSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-5 h-5" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-8 w-20 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-12 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      
      {/* Game grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <GameCardSkeleton key={i} className="bg-card/50" />
        ))}
      </div>
    </div>
  );
}

// Scores page skeleton
export function ScoresPageSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded" />
            <Skeleton className="h-9 w-24 rounded" />
            <Skeleton className="h-9 w-28 rounded" />
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-8">
        {/* Sport section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <BadgeSkeleton className="w-14" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <GamesGridSkeleton />
        </div>
        
        {/* Another sport section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <BadgeSkeleton className="w-12" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <GamesGridSkeleton count={3} />
        </div>
      </div>
    </div>
  );
}

// Settings skeleton
export function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-8 w-32 mb-6" />
      
      {/* Setting cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-4 rounded-xl border bg-card/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div>
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Table skeleton
export function TableSkeleton({ 
  rows = 5,
  columns = 4,
  className 
}: { 
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card/50 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 p-3 border-b bg-muted/30">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton 
            key={i} 
            className={cn(
              "h-4",
              i === 0 ? "w-8" : i === 1 ? "flex-1" : "w-16"
            )} 
          />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 p-3 border-b border-border/50 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton 
              key={c}
              className={cn(
                "h-4",
                c === 0 ? "w-8" : c === 1 ? "flex-1" : "w-16"
              )} 
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Pool card skeleton (matches PoolsList card dimensions exactly)
export function PoolListCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "card-elevated p-5",
      className
    )}>
      {/* Header - matches pool card header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="w-8 h-8" rounded="lg" />
          <div>
            <SkeletonBlock className="h-5 w-32 mb-1" rounded="md" />
            <SkeletonBlock className="h-3 w-20" rounded="md" />
          </div>
        </div>
        <SkeletonBlock className="h-6 w-16" rounded="full" />
      </div>
      
      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3">
        <SkeletonBlock className="h-4 w-12" rounded="md" />
        <SkeletonBlock className="h-4 w-10" rounded="md" />
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <SkeletonBlock className="h-4 w-24" rounded="md" />
        <SkeletonBlock className="h-4 w-12" rounded="md" />
      </div>
    </div>
  );
}

// Pool list skeleton grid (matches PoolsList grid layout)
export function PoolListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <PoolListCardSkeleton key={i} />
      ))}
    </div>
  );
}

// League table row skeleton
export function LeagueTableRowSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 border-b border-border/50",
      className
    )}>
      <SkeletonBlock className="w-8 h-8" rounded="lg" />
      <SkeletonBlock className="h-5 flex-1 max-w-[200px]" rounded="md" />
      <SkeletonBlock className="h-4 w-16" rounded="md" />
      <SkeletonBlock className="h-6 w-14" rounded="full" />
    </div>
  );
}

// Dashboard widget skeleton
export function DashboardWidgetSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "card-elevated p-6",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <SkeletonBlock className="h-5 w-32" rounded="md" />
        <SkeletonBlock className="w-6 h-6" rounded="md" />
      </div>
      <SkeletonBlock className="h-8 w-24 mb-2" rounded="lg" />
      <SkeletonBlock className="h-3 w-20" rounded="md" />
    </div>
  );
}

// ============================================
// SPORT HUB SKELETONS
// ============================================

// Hero card skeleton for sport hubs
export function HubHeroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "relative rounded-2xl border bg-gradient-to-br from-card/80 to-card/40 overflow-hidden p-6",
      className
    )}>
      {/* Background shimmer */}
      <div className="absolute inset-0 skeleton opacity-20" />
      
      <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
        {/* Team logos */}
        <div className="flex items-center gap-4">
          <SkeletonBlock className="w-20 h-20 md:w-24 md:h-24" rounded="full" />
          <SkeletonBlock className="h-8 w-12" rounded="lg" />
          <SkeletonBlock className="w-20 h-20 md:w-24 md:h-24" rounded="full" />
        </div>
        
        {/* Game info */}
        <div className="flex-1 text-center md:text-left space-y-2">
          <SkeletonBlock className="h-6 w-48 mx-auto md:mx-0" rounded="lg" />
          <SkeletonBlock className="h-4 w-32 mx-auto md:mx-0" rounded="md" />
          <SkeletonBlock className="h-5 w-24 mx-auto md:mx-0" rounded="full" />
        </div>
        
        {/* CTA button */}
        <SkeletonBlock className="h-10 w-28" rounded="lg" />
      </div>
    </div>
  );
}

// Coach G intel card skeleton
export function CoachGIntelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border bg-gradient-to-br from-violet-500/10 to-purple-500/5 p-5",
      className
    )}>
      <div className="flex items-start gap-4">
        <SkeletonBlock className="w-12 h-12 shrink-0" rounded="full" />
        <div className="flex-1 space-y-3">
          <SkeletonBlock className="h-5 w-32" rounded="md" />
          <SkeletonBlock className="h-4 w-full max-w-md" rounded="md" />
          <SkeletonBlock className="h-4 w-3/4" rounded="md" />
          <div className="flex gap-2 pt-2">
            <SkeletonBlock className="h-8 w-24" rounded="lg" />
            <SkeletonBlock className="h-8 w-20" rounded="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Standings table skeleton
export function HubStandingsSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card/50 overflow-hidden", className)}>
      {/* Header tabs */}
      <div className="flex gap-2 p-3 border-b bg-muted/20">
        <SkeletonBlock className="h-8 w-24" rounded="lg" />
        <SkeletonBlock className="h-8 w-24" rounded="lg" />
      </div>
      
      {/* Table header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/10 text-xs">
        <SkeletonBlock className="w-6 h-4" rounded="md" />
        <SkeletonBlock className="flex-1 h-4" rounded="md" />
        <SkeletonBlock className="w-8 h-4" rounded="md" />
        <SkeletonBlock className="w-8 h-4" rounded="md" />
        <SkeletonBlock className="w-8 h-4" rounded="md" />
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-b-0">
          <SkeletonBlock className="w-6 h-5" rounded="md" />
          <SkeletonBlock className="w-8 h-8" rounded="full" />
          <SkeletonBlock className="flex-1 h-4 max-w-[120px]" rounded="md" />
          <SkeletonBlock className="w-8 h-4" rounded="md" />
          <SkeletonBlock className="w-8 h-4" rounded="md" />
          <SkeletonBlock className="w-8 h-4" rounded="md" />
        </div>
      ))}
    </div>
  );
}

// Leaders section skeleton
export function HubLeadersSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card/50 overflow-hidden", className)}>
      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b bg-muted/20 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 w-20 shrink-0" rounded="lg" />
        ))}
      </div>
      
      {/* Leader rows */}
      <div className="p-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
            <SkeletonBlock className="w-6 h-6" rounded="full" />
            <SkeletonBlock className="w-10 h-10" rounded="full" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-28 mb-1" rounded="md" />
              <SkeletonBlock className="h-3 w-20" rounded="md" />
            </div>
            <SkeletonBlock className="h-6 w-12" rounded="lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Schedule/Games grid skeleton for hubs
export function HubScheduleSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-6 w-32" rounded="lg" />
        <SkeletonBlock className="h-8 w-24" rounded="lg" />
      </div>
      
      {/* Game cards grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card/50 p-4">
            {/* Status */}
            <div className="flex items-center justify-between mb-3">
              <SkeletonBlock className="h-5 w-16" rounded="full" />
              <SkeletonBlock className="h-4 w-12" rounded="md" />
            </div>
            
            {/* Teams */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="w-8 h-8" rounded="full" />
                  <SkeletonBlock className="h-4 w-24" rounded="md" />
                </div>
                <SkeletonBlock className="h-6 w-8" rounded="md" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="w-8 h-8" rounded="full" />
                  <SkeletonBlock className="h-4 w-24" rounded="md" />
                </div>
                <SkeletonBlock className="h-6 w-8" rounded="md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Full sport hub page skeleton
export function SportHubSkeleton({ sport: _sport = 'nba' }: { sport?: string }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-gradient-to-b from-card/80 to-transparent">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <SkeletonBlock className="w-12 h-12" rounded="xl" />
            <div>
              <SkeletonBlock className="h-7 w-40 mb-1" rounded="lg" />
              <SkeletonBlock className="h-4 w-24" rounded="md" />
            </div>
          </div>
          
          {/* Nav tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-9 w-20 shrink-0" rounded="lg" />
            ))}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-8">
        {/* Hero */}
        <HubHeroSkeleton />
        
        {/* Coach G Intel */}
        <CoachGIntelSkeleton />
        
        {/* Two column layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Schedule */}
          <HubScheduleSkeleton />
          
          {/* Standings */}
          <HubStandingsSkeleton rows={6} />
        </div>
        
        {/* Leaders */}
        <HubLeadersSkeleton />
      </div>
    </div>
  );
}

// Export the base skeleton too
export { Skeleton };
