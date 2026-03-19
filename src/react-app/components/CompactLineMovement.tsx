/**
 * Compact Line Movement
 * 
 * Minimal intelligence display for Lines Center expanded game view.
 * Shows movement summary and sharp shift indicator in a single row.
 */

import { useState, useEffect, useRef, memo } from "react";
import { Zap, Clock } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface LineMovementData {
  opening: { spread: number | null; total: number | null };
  current: { spread: number | null; total: number | null };
  delta: { spread: number | null; total: number | null };
  lastMovementAt: string | null;
  sharpShift: {
    detected: boolean;
    note: string | null;
  };
}

interface CompactLineMovementProps {
  gameId: string;
  className?: string;
}

// Cache with 60 second TTL
const movementCache = new Map<string, { data: LineMovementData; timestamp: number }>();
const CACHE_TTL_MS = 60000;

function formatDelta(value: number | null): string {
  if (value === null || value === 0) return 'No change';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} since open`;
}

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const CompactLineMovement = memo(function CompactLineMovement({
  gameId,
  className
}: CompactLineMovementProps) {
  const [data, setData] = useState<LineMovementData | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Prevent double fetch
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchMovement = async () => {
      // Check cache first
      const cached = movementCache.get(gameId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setData(cached.data);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/line-movement/${gameId}`, {
          credentials: 'include'
        });
        
        if (!res.ok) throw new Error('Failed to fetch');
        
        const json = await res.json();
        if (json.ok) {
          const movementData: LineMovementData = {
            opening: json.opening,
            current: json.current,
            delta: json.delta,
            lastMovementAt: json.lastMovementAt,
            sharpShift: json.sharpShift
          };
          movementCache.set(gameId, { data: movementData, timestamp: Date.now() });
          setData(movementData);
        }
      } catch (err) {
        console.error('[CompactLineMovement] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMovement();
  }, [gameId]);

  // Don't render if loading or no meaningful data
  if (loading) return null;
  if (!data) return null;
  
  const hasMovement = data.delta.spread !== null || data.delta.total !== null;
  const spreadDelta = data.delta.spread;
  const hasSpreadMovement = spreadDelta !== null && spreadDelta !== 0;
  
  // Only show if there's something interesting to display
  if (!hasMovement && !data.sharpShift.detected) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Movement Summary */}
      {hasSpreadMovement && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-white/40">Moved:</span>
          <span className={cn(
            "font-mono font-medium",
            spreadDelta > 0 ? "text-emerald-400" : "text-amber-400"
          )}>
            {formatDelta(spreadDelta)}
          </span>
          {data.lastMovementAt && (
            <span className="flex items-center gap-1 text-white/30">
              <Clock className="w-3 h-3" />
              Last: {formatTimeAgo(data.lastMovementAt)}
            </span>
          )}
        </div>
      )}

      {/* Sharp Shift Indicator */}
      {data.sharpShift.detected && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
          <Zap className="w-3 h-3" />
          <span className="font-medium">Sharp shift detected</span>
        </div>
      )}
    </div>
  );
});

export default CompactLineMovement;
