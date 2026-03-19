/**
 * WatchboardTicker - Compact horizontal event ticker for play-by-play events
 * 
 * A minimal, scrolling ticker that shows recent plays across watched games.
 * Features subtle slide-in animations and compact event cards.
 */

import { useState, useEffect, useRef, memo } from "react";
import { Zap, Activity, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { getTeamColors } from "@/react-app/data/team-colors";
import { useSoundEffects } from "@/react-app/hooks/useSoundEffects";

// ====================
// TYPES
// ====================

interface TickerPlay {
  id: string;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  description: string;
  clock?: string;
  period?: string;
  team?: string;
  points?: number;
  isScoring?: boolean;
  isMajor?: boolean;
  playerName?: string;
  timestamp: number;
}

interface WatchboardTickerProps {
  plays: TickerPlay[];
  maxVisible?: number;
  autoScroll?: boolean;
  showSoundToggle?: boolean;
  compact?: boolean;
  className?: string;
}

// ====================
// TICKER EVENT CARD
// ====================

const TickerEventCard = memo(function TickerEventCard({
  play,
  isNew,
}: {
  play: TickerPlay;
  isNew: boolean;
}) {
  const isHighlight = play.isMajor || (play.points && play.points >= 3);
  const teamColors = play.team ? getTeamColors(play.team) : null;
  const accentColor = teamColors?.primary || '#64748b';
  
  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300",
        "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]",
        isNew && "animate-ticker-slide",
        isHighlight && "ring-1 ring-amber-500/30"
      )}
    >
      {/* Team color accent */}
      <div 
        className={cn(
          "w-1 h-6 rounded-full flex-shrink-0",
          isNew && isHighlight && "animate-ticker-glow"
        )}
        style={{ backgroundColor: accentColor }}
      />
      
      {/* Game info */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wide truncate">
            {play.awayTeam} @ {play.homeTeam}
          </span>
          {play.clock && play.period && (
            <span className="text-[9px] text-white/40 font-mono">
              {play.period} {play.clock}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/90 truncate max-w-[180px]">
            {play.description}
          </span>
          {play.points && play.points > 0 && (
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0",
              play.points >= 3 
                ? "bg-amber-500/20 text-amber-400" 
                : "bg-blue-500/20 text-blue-400"
            )}>
              +{play.points}
            </span>
          )}
          {isHighlight && !play.points && (
            <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
});

// ====================
// MAIN COMPONENT
// ====================

export const WatchboardTicker = memo(function WatchboardTicker({
  plays,
  maxVisible = 10,
  autoScroll = true,
  showSoundToggle = true,
  compact: _compact = false,
  className,
}: WatchboardTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const { isMuted, toggleMute, playSoundForPlay } = useSoundEffects();
  
  // Track new plays for animations and sounds
  useEffect(() => {
    if (!plays.length) return;
    
    const freshIds = new Set<string>();
    plays.forEach(play => {
      if (!seenIds.current.has(play.id)) {
        freshIds.add(play.id);
        seenIds.current.add(play.id);
        
        // Play sound for major plays
        if (play.isMajor || (play.points && play.points >= 3)) {
          playSoundForPlay({
            isMajor: play.isMajor || false,
            points: play.points || 0,
            description: play.description,
          });
        }
      }
    });
    
    if (freshIds.size > 0) {
      setNewIds(freshIds);
      
      // Auto-scroll to start when new plays arrive
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }
      
      // Clear "new" status after animation completes
      const timer = setTimeout(() => {
        setNewIds(new Set());
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [plays, autoScroll, playSoundForPlay]);
  
  // Sort plays by timestamp (newest first)
  const sortedPlays = [...plays]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxVisible);
  
  if (plays.length === 0) {
    return (
      <div className={cn(
        "flex items-center justify-center gap-2 px-4 py-3 rounded-xl",
        "bg-white/[0.02] border border-white/5 text-white/40 text-sm",
        className
      )}>
        <Activity className="w-4 h-4 animate-pulse" />
        <span>Waiting for plays...</span>
      </div>
    );
  }
  
  return (
    <div className={cn("relative", className)}>
      {/* Header bar with controls */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-white/50">
            <Activity className="w-3 h-3" />
            <span className="font-medium">Live Feed</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
            {plays.length} plays
          </span>
        </div>
        
        {showSoundToggle && (
          <button
            onClick={toggleMute}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full transition-all",
              isMuted 
                ? "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50" 
                : "bg-blue-500/20 text-blue-400"
            )}
            title={isMuted ? "Unmute sounds" : "Mute sounds"}
          >
            {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
        )}
      </div>
      
      {/* Scrollable ticker */}
      <div className="relative">
        {/* Left fade */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
        
        {/* Right fade */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />
        
        {/* Ticker content */}
        <div 
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sortedPlays.map(play => (
            <TickerEventCard
              key={play.id}
              play={play}
              isNew={newIds.has(play.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ====================
// COMPACT VARIANT
// ====================

export const WatchboardTickerCompact = memo(function WatchboardTickerCompact({
  plays,
  className,
}: {
  plays: TickerPlay[];
  className?: string;
}) {
  const seenIds = useRef<Set<string>>(new Set());
  const [latestPlay, setLatestPlay] = useState<TickerPlay | null>(null);
  const [isNew, setIsNew] = useState(false);
  const { playSoundForPlay } = useSoundEffects();
  
  // Track latest play
  useEffect(() => {
    if (!plays.length) return;
    
    const sorted = [...plays].sort((a, b) => b.timestamp - a.timestamp);
    const latest = sorted[0];
    
    if (latest && !seenIds.current.has(latest.id)) {
      seenIds.current.add(latest.id);
      setLatestPlay(latest);
      setIsNew(true);
      
      // Play sound for major plays
      if (latest.isMajor || (latest.points && latest.points >= 3)) {
        playSoundForPlay({
          isMajor: latest.isMajor || false,
          points: latest.points || 0,
          description: latest.description,
        });
      }
      
      const timer = setTimeout(() => setIsNew(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [plays, playSoundForPlay]);
  
  if (!latestPlay) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg",
        "bg-white/[0.02] border border-white/5 text-white/40 text-xs",
        className
      )}>
        <Activity className="w-3 h-3 animate-pulse" />
        <span>Waiting...</span>
      </div>
    );
  }
  
  const isHighlight = latestPlay.isMajor || (latestPlay.points && latestPlay.points >= 3);
  const teamColors = latestPlay.team ? getTeamColors(latestPlay.team) : null;
  const accentColor = teamColors?.primary || '#64748b';
  
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all",
        "bg-white/[0.03] border-white/10",
        isNew && "animate-ticker-slide",
        isHighlight && "ring-1 ring-amber-500/30",
        className
      )}
    >
      {/* Accent dot */}
      <div 
        className={cn(
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          isNew && isHighlight && "animate-ticker-glow"
        )}
        style={{ backgroundColor: accentColor }}
      />
      
      {/* Play text */}
      <span className="text-xs text-white/80 truncate flex-1">
        <span className="text-white/50">{latestPlay.homeTeam}:</span>{' '}
        {latestPlay.description}
      </span>
      
      {/* Points badge */}
      {latestPlay.points && latestPlay.points > 0 && (
        <span className={cn(
          "px-1 py-0.5 rounded text-[9px] font-bold flex-shrink-0",
          latestPlay.points >= 3 
            ? "bg-amber-500/20 text-amber-400" 
            : "bg-blue-500/20 text-blue-400"
        )}>
          +{latestPlay.points}
        </span>
      )}
      
      {isHighlight && !latestPlay.points && (
        <Zap className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
      )}
    </div>
  );
});

export type { TickerPlay };
