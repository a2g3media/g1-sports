/**
 * MiniShotCourt - Compact basketball half-court showing shot locations
 * Syncs with play-by-play to highlight recent shots
 */

import { memo, useMemo, useState } from 'react';
import { cn } from '@/react-app/lib/utils';
import { Target, Zap } from 'lucide-react';

export interface ShotLocation {
  id: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage  
  made: boolean;
  team: string;
  player: string;
  description: string;
  period: string;
  clock: string;
  points: number;
  isRecent?: boolean;
}

interface MiniShotCourtProps {
  shots: ShotLocation[];
  homeTeam: string;
  awayTeam: string;
  homeColor?: string;
  awayColor?: string;
  highlightedShotId?: string | null;
  onShotHover?: (shotId: string | null) => void;
  compact?: boolean;
}

// Compact court SVG for the mini view
const MiniCourtSVG = memo(function MiniCourtSVG() {
  return (
    <svg viewBox="0 0 100 94" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Court floor gradient */}
      <defs>
        <linearGradient id="courtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(30,41,59,0.8)" />
          <stop offset="100%" stopColor="rgba(15,23,42,0.9)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="94" fill="url(#courtGrad)" rx="4" />
      
      {/* Court outline */}
      <rect x="2" y="2" width="96" height="90" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" rx="2" />
      
      {/* Paint/Key */}
      <rect x="34" y="2" width="32" height="38" fill="rgba(59,130,246,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      
      {/* Free throw circle */}
      <circle cx="50" cy="40" r="12" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      
      {/* Restricted area */}
      <path d="M 42 2 A 8 8 0 0 0 58 2" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      
      {/* Basket */}
      <circle cx="50" cy="10" r="2" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      <rect x="44" y="8" width="12" height="1" fill="rgba(255,255,255,0.15)" />
      
      {/* Three-point arc */}
      <path 
        d="M 6 2 L 6 28 A 47.5 47.5 0 0 0 94 28 L 94 2" 
        fill="none" 
        stroke="rgba(255,255,255,0.15)" 
        strokeWidth="0.5"
      />
      
      {/* Zone labels */}
      <text x="50" y="20" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="4" fontWeight="bold">PAINT</text>
      <text x="50" y="58" textAnchor="middle" fill="rgba(255,255,255,0.1)" fontSize="3">MID-RANGE</text>
      <text x="50" y="82" textAnchor="middle" fill="rgba(255,255,255,0.1)" fontSize="3">3PT</text>
    </svg>
  );
});

// Individual shot marker
const ShotMarker = memo(function ShotMarker({
  shot,
  isHome,
  homeColor,
  awayColor,
  isHighlighted,
  isRecent,
  onHover,
  onLeave,
}: {
  shot: ShotLocation;
  isHome: boolean;
  homeColor: string;
  awayColor: string;
  isHighlighted: boolean;
  isRecent: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const color = isHome ? homeColor : awayColor;
  const baseSize = isHighlighted ? 10 : isRecent ? 8 : 6;
  
  return (
    <div
      className={cn(
        "absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 cursor-pointer",
        isHighlighted && "z-30",
        isRecent && !isHighlighted && "z-20 animate-pulse",
        !isRecent && !isHighlighted && "z-10 opacity-60 hover:opacity-100"
      )}
      style={{
        left: `${shot.x}%`,
        top: `${shot.y}%`,
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {shot.made ? (
        <div 
          className={cn(
            "rounded-full transition-all",
            isHighlighted && "ring-2 ring-white/70"
          )}
          style={{ 
            width: baseSize, 
            height: baseSize, 
            backgroundColor: color,
            boxShadow: isHighlighted 
              ? `0 0 16px ${color}, 0 0 32px ${color}40` 
              : isRecent 
                ? `0 0 8px ${color}` 
                : `0 0 4px ${color}60`
          }}
        />
      ) : (
        <div 
          className={cn(
            "rounded-full border transition-all bg-slate-900/60",
            isHighlighted && "ring-2 ring-white/50"
          )}
          style={{ 
            width: baseSize, 
            height: baseSize, 
            borderWidth: 1.5,
            borderColor: color,
          }}
        />
      )}
    </div>
  );
});

// Shot tooltip
const ShotTooltip = memo(function ShotTooltip({
  shot,
  homeColor,
  awayColor,
  homeTeam,
  awayTeam: _awayTeam,
}: {
  shot: ShotLocation;
  homeColor: string;
  awayColor: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const isHome = shot.team === homeTeam || shot.team?.toLowerCase() === homeTeam?.toLowerCase();
  const color = isHome ? homeColor : awayColor;
  
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900/95 border border-white/20 rounded-lg shadow-xl z-50 whitespace-nowrap pointer-events-none">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold text-white">{shot.player}</span>
        {shot.made && shot.points > 0 && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            shot.points >= 3 ? "bg-amber-500/30 text-amber-300" : "bg-emerald-500/30 text-emerald-300"
          )}>
            +{shot.points}
          </span>
        )}
      </div>
      <div className="text-xs text-white/60">
        {shot.made ? '✓ Made' : '✗ Missed'} • {shot.period} {shot.clock}
      </div>
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
    </div>
  );
});

export const MiniShotCourt = memo(function MiniShotCourt({
  shots,
  homeTeam,
  awayTeam,
  homeColor = '#3B82F6',
  awayColor = '#EF4444',
  highlightedShotId,
  onShotHover,
  compact = false,
}: MiniShotCourtProps) {
  const [hoveredShot, setHoveredShot] = useState<string | null>(null);
  const activeHighlight = highlightedShotId || hoveredShot;
  
  // Calculate stats
  const stats = useMemo(() => {
    const homeShots = shots.filter(s => s.team === homeTeam || s.team?.toLowerCase() === homeTeam?.toLowerCase());
    const awayShots = shots.filter(s => s.team === awayTeam || s.team?.toLowerCase() === awayTeam?.toLowerCase());
    
    const calc = (arr: ShotLocation[]) => {
      const made = arr.filter(s => s.made).length;
      const total = arr.length;
      return { made, total, pct: total > 0 ? Math.round((made / total) * 100) : 0 };
    };
    
    return { home: calc(homeShots), away: calc(awayShots) };
  }, [shots, homeTeam, awayTeam]);
  
  // Recent shots (last 5)
  const recentShotIds = useMemo(() => {
    return new Set(shots.slice(-5).map(s => s.id));
  }, [shots]);
  
  if (shots.length === 0) {
    return (
      <div className={cn(
        "bg-slate-800/50 rounded-xl border border-white/10 flex flex-col items-center justify-center",
        compact ? "h-32 p-3" : "h-48 p-4"
      )}>
        <Target className="w-6 h-6 text-white/20 mb-2" />
        <span className="text-xs text-white/40">Shot chart updates live</span>
      </div>
    );
  }
  
  return (
    <div className={cn(
      "bg-gradient-to-b from-slate-800/60 to-slate-900/60 rounded-xl border border-white/10 overflow-hidden",
      compact ? "p-2" : "p-3"
    )}>
      {/* Header stats */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor }} />
          <span className="text-[10px] font-medium text-white/70">{awayTeam}</span>
          <span className="text-xs font-bold text-white">{stats.away.pct}%</span>
          <span className="text-[10px] text-white/40">({stats.away.made}/{stats.away.total})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">({stats.home.made}/{stats.home.total})</span>
          <span className="text-xs font-bold text-white">{stats.home.pct}%</span>
          <span className="text-[10px] font-medium text-white/70">{homeTeam}</span>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor }} />
        </div>
      </div>
      
      {/* Court with shots */}
      <div className={cn(
        "relative",
        compact ? "aspect-[100/94]" : "aspect-[100/94] max-h-40"
      )}>
        <MiniCourtSVG />
        
        {/* Shot markers */}
        {shots.map((shot) => {
          const isHome = shot.team === homeTeam || shot.team?.toLowerCase() === homeTeam?.toLowerCase();
          return (
            <ShotMarker
              key={shot.id}
              shot={shot}
              isHome={isHome}
              homeColor={homeColor}
              awayColor={awayColor}
              isHighlighted={activeHighlight === shot.id}
              isRecent={recentShotIds.has(shot.id)}
              onHover={() => {
                setHoveredShot(shot.id);
                onShotHover?.(shot.id);
              }}
              onLeave={() => {
                setHoveredShot(null);
                onShotHover?.(null);
              }}
            />
          );
        })}
        
        {/* Tooltip for highlighted shot */}
        {activeHighlight && shots.find(s => s.id === activeHighlight) && (
          <div 
            className="absolute pointer-events-none"
            style={{
              left: `${shots.find(s => s.id === activeHighlight)!.x}%`,
              top: `${shots.find(s => s.id === activeHighlight)!.y}%`,
            }}
          >
            <ShotTooltip
              shot={shots.find(s => s.id === activeHighlight)!}
              homeColor={homeColor}
              awayColor={awayColor}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-white/40">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Made</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full border border-blue-400 bg-transparent" />
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-2.5 h-2.5 text-amber-400" />
          <span>Recent</span>
        </div>
      </div>
    </div>
  );
});

// Helper to parse shot location from play description
export function parseShotLocation(
  play: { 
    description: string; 
    team: string | null; 
    playerName: string | null;
    period: string;
    clock: string;
    playId?: number;
    points?: number;
    isScoring?: boolean;
  },
  index: number
): ShotLocation | null {
  const desc = (play.description || '').toLowerCase();
  
  // Check if this is a shot attempt
  const isShotAttempt = 
    desc.includes('shot') || 
    desc.includes('3pt') || 
    desc.includes('three') ||
    desc.includes('jumper') || 
    desc.includes('layup') || 
    desc.includes('dunk') ||
    desc.includes('hook') ||
    desc.includes('floater') ||
    desc.includes('tip') ||
    (desc.includes('made') && !desc.includes('free throw') && !desc.includes('ft')) ||
    (desc.includes('missed') && !desc.includes('free throw') && !desc.includes('ft'));
  
  if (!isShotAttempt) return null;
  
  const isMade = desc.includes('made') || (play.isScoring && !desc.includes('missed'));
  const is3pt = desc.includes('3pt') || desc.includes('three') || desc.includes('3-point');
  
  // Generate position based on shot type and hash
  const hash = (play.playId || index).toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  
  let x: number, y: number;
  
  if (is3pt) {
    // 3-point shots: along the arc
    const angle = ((hash % 160) - 80) * (Math.PI / 180);
    const radius = 38 + (hash % 5);
    x = 50 + Math.cos(angle) * radius;
    y = 50 - Math.sin(angle) * radius * 0.6;
  } else if (desc.includes('layup') || desc.includes('dunk')) {
    // Layups/dunks: near the basket
    x = 50 + ((hash % 16) - 8);
    y = 8 + (hash % 8);
  } else {
    // Mid-range
    const angle = ((hash % 140) - 70) * (Math.PI / 180);
    const radius = 15 + (hash % 18);
    x = 50 + Math.cos(angle) * radius;
    y = 30 - Math.sin(angle) * radius * 0.4;
  }
  
  // Determine points
  let points = 0;
  if (isMade) {
    points = is3pt ? 3 : 2;
  }
  if (play.points && play.points > 0) {
    points = play.points;
  }
  
  return {
    id: `shot-${play.playId || index}`,
    x: Math.max(5, Math.min(95, x)),
    y: Math.max(5, Math.min(90, y)),
    made: isMade || false,
    team: play.team || '',
    player: play.playerName || 'Unknown',
    description: play.description,
    period: play.period,
    clock: play.clock,
    points,
  };
}

export default MiniShotCourt;
