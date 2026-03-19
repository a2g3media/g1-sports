import { cn } from "@/react-app/lib/utils";

// Shimmer animation component
function Shimmer({ className }: { className?: string }) {
  return (
    <div 
      className={cn(
        "animate-pulse bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded",
        className
      )}
    />
  );
}

// Hero skeleton - the large featured game card at the top
export function HeroSkeleton() {
  return (
    <div className="relative w-full h-[280px] sm:h-[320px] rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 border border-white/5">
      {/* Background glow effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      
      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center p-6 gap-4">
        {/* Teams row */}
        <div className="flex items-center gap-6 sm:gap-10">
          {/* Away team */}
          <div className="flex flex-col items-center gap-2">
            <Shimmer className="w-16 h-16 sm:w-20 sm:h-20 rounded-full" />
            <Shimmer className="w-20 h-4" />
            <Shimmer className="w-10 h-6" />
          </div>
          
          {/* VS / Score */}
          <div className="flex flex-col items-center gap-1">
            <Shimmer className="w-8 h-4" />
            <Shimmer className="w-16 h-8" />
          </div>
          
          {/* Home team */}
          <div className="flex flex-col items-center gap-2">
            <Shimmer className="w-16 h-16 sm:w-20 sm:h-20 rounded-full" />
            <Shimmer className="w-20 h-4" />
            <Shimmer className="w-10 h-6" />
          </div>
        </div>
        
        {/* Game info */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <Shimmer className="w-32 h-4" />
          <Shimmer className="w-24 h-3" />
        </div>
      </div>
      
      {/* Navigation dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {[...Array(3)].map((_, i) => (
          <Shimmer key={i} className="w-2 h-2 rounded-full" />
        ))}
      </div>
    </div>
  );
}

// Pulse strip skeleton
export function PulseStripSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden py-2">
      {[...Array(4)].map((_, i) => (
        <Shimmer key={i} className="flex-shrink-0 w-40 h-8 rounded-full" />
      ))}
    </div>
  );
}

// Coach G section skeleton
export function CoachGSkeleton() {
  return (
    <div className="bg-gradient-to-br from-zinc-900/60 to-zinc-950/80 rounded-xl border border-white/5 p-4 sm:p-6">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <Shimmer className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex-shrink-0" />
        
        {/* Content */}
        <div className="flex-1 space-y-3">
          <Shimmer className="w-32 h-5" />
          <Shimmer className="w-full h-4" />
          <Shimmer className="w-3/4 h-4" />
          
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[...Array(4)].map((_, i) => (
              <Shimmer key={i} className="w-24 h-9 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Game card skeleton
export function GameCardSkeleton() {
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between">
        {/* Teams */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Shimmer className="w-8 h-8 rounded-full" />
            <Shimmer className="w-24 h-4" />
            <Shimmer className="w-8 h-5 ml-auto" />
          </div>
          <div className="flex items-center gap-3">
            <Shimmer className="w-8 h-8 rounded-full" />
            <Shimmer className="w-28 h-4" />
            <Shimmer className="w-8 h-5 ml-auto" />
          </div>
        </div>
        
        {/* Status/Time */}
        <div className="ml-4 flex flex-col items-end gap-1">
          <Shimmer className="w-16 h-4" />
          <Shimmer className="w-12 h-3" />
        </div>
      </div>
    </div>
  );
}

// Schedule section skeleton
export function ScheduleSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Standings row skeleton
function StandingsRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 px-3">
      <Shimmer className="w-6 h-5" />
      <Shimmer className="w-6 h-6 rounded-full" />
      <Shimmer className="w-24 h-4 flex-1" />
      <Shimmer className="w-8 h-4" />
      <Shimmer className="w-8 h-4" />
      <Shimmer className="w-8 h-4" />
    </div>
  );
}

// Standings section skeleton
export function StandingsSkeleton() {
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/5 overflow-hidden">
      {/* Conference tabs */}
      <div className="flex border-b border-white/5 p-1 gap-1">
        <Shimmer className="flex-1 h-9 rounded-lg" />
        <Shimmer className="flex-1 h-9 rounded-lg" />
      </div>
      
      {/* Header */}
      <div className="flex items-center gap-3 py-2 px-3 border-b border-white/5">
        <Shimmer className="w-6 h-4" />
        <Shimmer className="w-16 h-4 flex-1" />
        <Shimmer className="w-6 h-4" />
        <Shimmer className="w-6 h-4" />
        <Shimmer className="w-6 h-4" />
      </div>
      
      {/* Rows */}
      <div className="divide-y divide-white/5">
        {[...Array(8)].map((_, i) => (
          <StandingsRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Leader row skeleton
function LeaderRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 px-3">
      <Shimmer className="w-6 h-5" />
      <Shimmer className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-1">
        <Shimmer className="w-28 h-4" />
        <Shimmer className="w-20 h-3" />
      </div>
      <Shimmer className="w-12 h-5" />
    </div>
  );
}

// Leaders section skeleton
export function LeadersSkeleton() {
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/5 overflow-hidden">
      {/* Category tabs */}
      <div className="flex overflow-x-auto gap-1 p-1 border-b border-white/5">
        {[...Array(5)].map((_, i) => (
          <Shimmer key={i} className="flex-shrink-0 w-20 h-8 rounded-lg" />
        ))}
      </div>
      
      {/* Leaders list */}
      <div className="divide-y divide-white/5">
        {[...Array(5)].map((_, i) => (
          <LeaderRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Section header skeleton
export function SectionHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 mb-4">
      <Shimmer className="w-5 h-5 rounded" />
      <div className="space-y-1">
        <Shimmer className="w-32 h-5" />
        <Shimmer className="w-48 h-3" />
      </div>
    </div>
  );
}

// Full page skeleton - combines all sections
export function SportHubPageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-black">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* Hero */}
        <HeroSkeleton />
        
        {/* Pulse strip */}
        <PulseStripSkeleton />
        
        {/* Coach G */}
        <div>
          <SectionHeaderSkeleton />
          <CoachGSkeleton />
        </div>
        
        {/* Schedule */}
        <div>
          <SectionHeaderSkeleton />
          <ScheduleSkeleton count={4} />
        </div>
        
        {/* Standings */}
        <div>
          <SectionHeaderSkeleton />
          <StandingsSkeleton />
        </div>
        
        {/* Leaders */}
        <div>
          <SectionHeaderSkeleton />
          <LeadersSkeleton />
        </div>
      </div>
    </div>
  );
}

export default SportHubPageSkeleton;
