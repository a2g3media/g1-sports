/**
 * ShotChart - Visual basketball court with shot locations
 * Shows made/missed shots with player details
 */

import { memo, useMemo, useState } from 'react';
import { cn } from '@/react-app/lib/utils';
import { Target, X, Check } from 'lucide-react';

interface Shot {
  x: number; // Court x position (0-100)
  y: number; // Court y position (0-100)
  made: boolean;
  player: string;
  team: 'home' | 'away';
  period: string;
  clock: string;
  shotType: string;
  points: number;
}

interface ShotChartProps {
  shots: Shot[];
  homeTeam: string;
  awayTeam: string;
  homeColor?: string;
  awayColor?: string;
  isLoading?: boolean;
}

// Basketball half-court SVG
const CourtSVG = memo(function CourtSVG() {
  return (
    <svg viewBox="0 0 500 470" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Court outline */}
      <rect x="0" y="0" width="500" height="470" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      
      {/* Paint/Key */}
      <rect x="170" y="0" width="160" height="190" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      
      {/* Free throw circle */}
      <circle cx="250" cy="190" r="60" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      
      {/* Restricted area */}
      <path d="M 210 0 A 40 40 0 0 0 290 0" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      
      {/* Basket */}
      <circle cx="250" cy="52" r="7.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <rect x="220" y="40" width="60" height="4" fill="rgba(255,255,255,0.2)" />
      
      {/* Three-point arc */}
      <path 
        d="M 30 0 L 30 140 A 237.5 237.5 0 0 0 470 140 L 470 0" 
        fill="none" 
        stroke="rgba(255,255,255,0.2)" 
        strokeWidth="2"
      />
      
      {/* Center court arc (at bottom) */}
      <path 
        d="M 190 470 A 60 60 0 0 1 310 470" 
        fill="none" 
        stroke="rgba(255,255,255,0.1)" 
        strokeWidth="2"
      />
      
      {/* Hash marks on free throw line */}
      <line x1="170" y1="70" x2="160" y2="70" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      <line x1="170" y1="110" x2="160" y2="110" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      <line x1="170" y1="150" x2="160" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      <line x1="330" y1="70" x2="340" y2="70" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      <line x1="330" y1="110" x2="340" y2="110" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
      <line x1="330" y1="150" x2="340" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
    </svg>
  );
});

// Shot marker component
const ShotMarker = memo(function ShotMarker({ 
  shot, 
  isHome, 
  homeColor, 
  awayColor,
  isHighlighted,
  onHover,
  onLeave
}: { 
  shot: Shot;
  isHome: boolean;
  homeColor: string;
  awayColor: string;
  isHighlighted: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const color = isHome ? homeColor : awayColor;
  const size = isHighlighted ? 14 : 10;
  
  return (
    <div
      className={cn(
        "absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-150 cursor-pointer z-10",
        isHighlighted && "z-20"
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
            "rounded-full flex items-center justify-center transition-all",
            isHighlighted && "ring-2 ring-white/50"
          )}
          style={{ 
            width: size, 
            height: size, 
            backgroundColor: color,
            boxShadow: isHighlighted ? `0 0 12px ${color}` : `0 0 6px ${color}80`
          }}
        >
          {isHighlighted && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
      ) : (
        <div 
          className={cn(
            "rounded-full flex items-center justify-center border-2 transition-all bg-slate-900/80",
            isHighlighted && "ring-2 ring-white/30"
          )}
          style={{ 
            width: size, 
            height: size, 
            borderColor: color,
          }}
        >
          {isHighlighted && <X className="w-2.5 h-2.5" style={{ color }} />}
        </div>
      )}
    </div>
  );
});
export const ShotChart = memo(function ShotChart({
  shots,
  homeTeam,
  awayTeam,
  homeColor = '#3B82F6',
  awayColor = '#EF4444',
  isLoading = false
}: ShotChartProps) {
  const [filter, setFilter] = useState<'all' | 'home' | 'away'>('all');
  const [highlightedShot, setHighlightedShot] = useState<number | null>(null);
  
  const filteredShots = useMemo(() => {
    if (filter === 'all') return shots;
    return shots.filter(s => s.team === filter);
  }, [shots, filter]);
  
  // Stats
  const stats = useMemo(() => {
    const homeShots = shots.filter(s => s.team === 'home');
    const awayShots = shots.filter(s => s.team === 'away');
    
    const calc = (arr: Shot[]) => {
      const made = arr.filter(s => s.made).length;
      const total = arr.length;
      const threes = arr.filter(s => s.points === 3);
      const threesMade = threes.filter(s => s.made).length;
      return {
        made,
        total,
        pct: total > 0 ? Math.round((made / total) * 100) : 0,
        threeMade: threesMade,
        threeTotal: threes.length,
        threePct: threes.length > 0 ? Math.round((threesMade / threes.length) * 100) : 0
      };
    };
    
    return {
      home: calc(homeShots),
      away: calc(awayShots),
      total: calc(shots)
    };
  }, [shots]);
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-4" />
        <p className="text-white/50 text-sm">Loading shot data...</p>
      </div>
    );
  }
  
  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Target className="w-8 h-8 text-white/30" />
        </div>
        <p className="text-white/70 font-medium mb-1">No shot data available</p>
        <p className="text-white/40 text-sm">Shot chart will appear once the game starts</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Team Filter */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            filter === 'all'
              ? "bg-white/15 text-white"
              : "bg-white/5 text-white/50 hover:bg-white/10"
          )}
        >
          All
        </button>
        <button
          onClick={() => setFilter('away')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
            filter === 'away'
              ? "bg-white/15 text-white"
              : "bg-white/5 text-white/50 hover:bg-white/10"
          )}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: awayColor }} />
          {awayTeam}
        </button>
        <button
          onClick={() => setFilter('home')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
            filter === 'home'
              ? "bg-white/15 text-white"
              : "bg-white/5 text-white/50 hover:bg-white/10"
          )}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: homeColor }} />
          {homeTeam}
        </button>
      </div>
      
      {/* Shot Chart */}
      <div className="relative bg-gradient-to-b from-slate-800/50 to-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
        <div className="relative aspect-[500/470] max-w-lg mx-auto p-4">
          <CourtSVG />
          
          {/* Shot markers */}
          {filteredShots.map((shot, i) => (
            <ShotMarker
              key={i}
              shot={shot}
              isHome={shot.team === 'home'}
              homeColor={homeColor}
              awayColor={awayColor}
              isHighlighted={highlightedShot === i}
              onHover={() => setHighlightedShot(i)}
              onLeave={() => setHighlightedShot(null)}
            />
          ))}
        </div>
        
        {/* Tooltip */}
        {highlightedShot !== null && filteredShots[highlightedShot] && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900/95 border border-white/20 rounded-xl shadow-xl">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ 
                  backgroundColor: filteredShots[highlightedShot].team === 'home' ? homeColor : awayColor 
                }}
              />
              <div>
                <div className="text-sm font-semibold text-white">
                  {filteredShots[highlightedShot].player}
                </div>
                <div className="text-xs text-white/60">
                  {filteredShots[highlightedShot].shotType} • 
                  {filteredShots[highlightedShot].made ? ' Made' : ' Missed'} • 
                  {filteredShots[highlightedShot].period} {filteredShots[highlightedShot].clock}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-white/50">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Made</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-transparent" />
          <span>Missed</span>
        </div>
      </div>
      
      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: awayColor }} />
            <span className="text-sm font-semibold text-white">{awayTeam}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white">{stats.away.pct}%</div>
              <div className="text-xs text-white/50">FG ({stats.away.made}/{stats.away.total})</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.away.threePct}%</div>
              <div className="text-xs text-white/50">3PT ({stats.away.threeMade}/{stats.away.threeTotal})</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: homeColor }} />
            <span className="text-sm font-semibold text-white">{homeTeam}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white">{stats.home.pct}%</div>
              <div className="text-xs text-white/50">FG ({stats.home.made}/{stats.home.total})</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.home.threePct}%</div>
              <div className="text-xs text-white/50">3PT ({stats.home.threeMade}/{stats.home.threeTotal})</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ShotChart;
