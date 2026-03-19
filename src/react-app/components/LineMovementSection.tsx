/**
 * Line Movement Section
 * 
 * Premium intelligence layer for Game Detail pages.
 * Shows opening vs current lines, movement delta, sharp shift detection,
 * and a mini movement timeline.
 */

import { useState, useEffect, memo } from "react";
import { Zap, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface LineMovementData {
  gameId: string;
  sport: string;
  opening: {
    spread: number | null;
    total: number | null;
    moneyline: number | null;
  };
  current: {
    spread: number | null;
    total: number | null;
    moneyline: number | null;
  };
  delta: {
    spread: number | null;
    total: number | null;
    moneyline: number | null;
  };
  lastMovementAt: string | null;
  sharpShift: {
    detected: boolean;
    market: 'spread' | 'total' | 'moneyline' | null;
    direction: 'toward_public' | 'against_public' | null;
    note: string | null;
  };
  timeline: {
    market: string;
    points: Array<{
      value: number;
      timestamp: string;
      isOpening: boolean;
      isCurrent: boolean;
    }>;
  }[];
}

interface LineMovementSectionProps {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
}

// Format line value for display
function formatLine(value: number | null, type: 'spread' | 'total' | 'moneyline'): string {
  if (value === null) return '—';
  
  if (type === 'spread') {
    return value > 0 ? `+${value}` : value.toString();
  }
  if (type === 'total') {
    return value.toString();
  }
  if (type === 'moneyline') {
    return value > 0 ? `+${value}` : value.toString();
  }
  return value.toString();
}

// Format delta for display
function formatDelta(value: number | null): string {
  if (value === null || value === 0) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}`;
}

// Format time ago
function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return '—';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Mini timeline component
const MiniTimeline = memo(function MiniTimeline({
  points,
  market,
  homeTeam
}: {
  points: Array<{ value: number; timestamp: string; isOpening: boolean; isCurrent: boolean }>;
  market: string;
  homeTeam: string;
}) {
  if (points.length < 2) return null;
  
  const opening = points[0].value;
  const current = points[points.length - 1].value;
  const movement = current - opening;
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/40 uppercase w-12">{market}</span>
      <div className="flex-1 relative h-6 flex items-center">
        {/* Timeline line */}
        <div className="absolute inset-x-0 h-px bg-white/10" />
        
        {/* Points */}
        <div className="relative flex justify-between w-full">
          {points.map((point, idx) => (
            <div 
              key={idx}
              className="relative flex flex-col items-center"
              style={{ 
                position: idx === 0 ? 'relative' : idx === points.length - 1 ? 'relative' : 'absolute',
                left: idx === 0 ? 0 : idx === points.length - 1 ? 'auto' : `${(idx / (points.length - 1)) * 100}%`,
                right: idx === points.length - 1 ? 0 : 'auto',
                transform: idx > 0 && idx < points.length - 1 ? 'translateX(-50%)' : 'none'
              }}
            >
              <div 
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  point.isOpening && "bg-white/30",
                  point.isCurrent && (movement !== 0 ? "bg-primary ring-2 ring-primary/30" : "bg-white/50"),
                  !point.isOpening && !point.isCurrent && "bg-white/20 w-1.5 h-1.5"
                )}
              />
              {(point.isOpening || point.isCurrent) && (
                <span className={cn(
                  "absolute -bottom-4 text-[9px] tabular-nums whitespace-nowrap",
                  point.isOpening ? "text-white/30" : "text-white/60 font-medium"
                )}>
                  {market === 'spread' ? `${homeTeam} ${point.value > 0 ? '+' : ''}${point.value}` : point.value}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// Sharp shift indicator
const SharpShiftBadge = memo(function SharpShiftBadge({
  note
}: {
  note: string | null;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
      <div className="relative">
        <Zap className="w-4 h-4 text-amber-400" />
        <div className="absolute inset-0 animate-ping opacity-30">
          <Zap className="w-4 h-4 text-amber-400" />
        </div>
      </div>
      <span className="text-xs text-amber-300/80">Possible Sharp Shift Detected</span>
      {note && (
        <span className="text-[10px] text-white/30 ml-auto">{note}</span>
      )}
    </div>
  );
});

export const LineMovementSection = memo(function LineMovementSection({
  gameId,
  homeTeam,
  awayTeam: _awayTeam
}: LineMovementSectionProps) {
  const [data, setData] = useState<LineMovementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLineMovement = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/line-movement/${gameId}`, {
          credentials: 'include'
        });
        
        if (!res.ok) throw new Error('Failed to fetch');
        
        const json = await res.json();
        if (json.ok) {
          setData(json);
        }
      } catch (err) {
        setError('Line data unavailable');
        console.error('[LineMovement] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLineMovement();
  }, [gameId]);

  // Don't render anything while loading or if no meaningful data
  if (loading) return null;
  if (error || !data) return null;
  
  // Check if we have any line data to show
  const hasSpread = data.opening.spread !== null || data.current.spread !== null;
  const hasTotal = data.opening.total !== null || data.current.total !== null;
  const hasMovement = data.delta.spread !== null || data.delta.total !== null;
  
  if (!hasSpread && !hasTotal) return null;

  return (
    <div className="space-y-3">
      {/* Main line comparison */}
      <div className="grid grid-cols-3 gap-3">
        {/* Opening */}
        <div className="p-3 rounded-xl bg-white/[0.02]">
          <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Opening</div>
          {hasSpread && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">{homeTeam}</span>
              <span className="font-mono font-medium text-white/70">
                {formatLine(data.opening.spread, 'spread')}
              </span>
            </div>
          )}
          {hasTotal && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-white/50">O/U</span>
              <span className="font-mono font-medium text-white/70">
                {formatLine(data.opening.total, 'total')}
              </span>
            </div>
          )}
        </div>

        {/* Current */}
        <div className="p-3 rounded-xl bg-white/[0.03]">
          <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Current</div>
          {hasSpread && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">{homeTeam}</span>
              <span className="font-mono font-semibold text-white">
                {formatLine(data.current.spread, 'spread')}
              </span>
            </div>
          )}
          {hasTotal && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-white/50">O/U</span>
              <span className="font-mono font-semibold text-white">
                {formatLine(data.current.total, 'total')}
              </span>
            </div>
          )}
        </div>

        {/* Movement */}
        <div className="p-3 rounded-xl bg-white/[0.02]">
          <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Movement</div>
          {hasSpread && data.delta.spread !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Spread</span>
              <span className={cn(
                "font-mono font-medium flex items-center gap-1",
                data.delta.spread === 0 && "text-white/40",
                data.delta.spread > 0 && "text-emerald-400",
                data.delta.spread < 0 && "text-red-400"
              )}>
                {data.delta.spread > 0 && <TrendingUp className="w-3 h-3" />}
                {data.delta.spread < 0 && <TrendingDown className="w-3 h-3" />}
                {data.delta.spread === 0 && <Minus className="w-3 h-3" />}
                {formatDelta(data.delta.spread)}
              </span>
            </div>
          )}
          {hasTotal && data.delta.total !== null && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-white/50">Total</span>
              <span className={cn(
                "font-mono font-medium flex items-center gap-1",
                data.delta.total === 0 && "text-white/40",
                data.delta.total > 0 && "text-emerald-400",
                data.delta.total < 0 && "text-red-400"
              )}>
                {data.delta.total > 0 && <TrendingUp className="w-3 h-3" />}
                {data.delta.total < 0 && <TrendingDown className="w-3 h-3" />}
                {data.delta.total === 0 && <Minus className="w-3 h-3" />}
                {formatDelta(data.delta.total)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Last movement time */}
      {data.lastMovementAt && hasMovement && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Clock className="w-3 h-3" />
          <span>Last move: {formatTimeAgo(data.lastMovementAt)}</span>
        </div>
      )}

      {/* Sharp shift indicator */}
      {data.sharpShift.detected && (
        <SharpShiftBadge note={data.sharpShift.note} />
      )}

      {/* Mini timeline */}
      {data.timeline.length > 0 && data.timeline.some(t => t.points.length >= 2) && (
        <div className="pt-2 space-y-4">
          {data.timeline
            .filter(t => t.points.length >= 2)
            .map(timeline => (
              <MiniTimeline
                key={timeline.market}
                points={timeline.points}
                market={timeline.market}
                homeTeam={homeTeam}
              />
            ))}
        </div>
      )}
    </div>
  );
});

export default LineMovementSection;
