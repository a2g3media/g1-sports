/**
 * Alive Indicators - Refresh status, toast notifications, and premium empty states
 * Used by Scores and Lines pages for consistent "alive" feel
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, Radio, Calendar, Zap, Clock } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { formatRelativeTime, AVAILABLE_SPORTS, SportKey, DateRange } from '@/react-app/hooks/useScoreboard';

// ============================================
// REFRESH STATUS BAR
// ============================================

interface RefreshStatusProps {
  lastFetchAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  className?: string;
}

export function RefreshStatus({ lastFetchAt, refreshing, onRefresh, className }: RefreshStatusProps) {
  const [relativeTime, setRelativeTime] = useState<string>('');
  
  // Update relative time every 10 seconds
  useEffect(() => {
    if (!lastFetchAt) return;
    
    const update = () => setRelativeTime(formatRelativeTime(lastFetchAt));
    update();
    
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [lastFetchAt]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {lastFetchAt && (
        <span className="text-xs text-white/40">
          Updated {relativeTime}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className={cn(
          "p-1.5 rounded-lg transition-all",
          "hover:bg-white/5 active:bg-white/10",
          refreshing && "pointer-events-none"
        )}
        title="Refresh"
      >
        <RefreshCw 
          className={cn(
            "w-4 h-4 text-white/40 transition-all",
            refreshing && "animate-spin text-emerald-400"
          )} 
        />
      </button>
    </div>
  );
}

// ============================================
// FALLBACK MESSAGE BANNER
// ============================================

interface FallbackBannerProps {
  message: string;
  onDismiss: () => void;
  onShowOriginal?: () => void;
  originalSport?: string;
}

export function FallbackBanner({ message, onDismiss, onShowOriginal, originalSport }: FallbackBannerProps) {
  return (
    <div className="mx-4 mb-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-amber-300/90 flex-1">
          {message}
        </p>
        <div className="flex items-center gap-2">
          {onShowOriginal && originalSport && (
            <button
              onClick={onShowOriginal}
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
            >
              Show {originalSport}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-white/5 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TOAST NOTIFICATION
// ============================================

interface ToastProps {
  message: string;
  type: 'error' | 'success' | 'info';
  onDismiss: () => void;
  onRetry?: () => void;
}

export function Toast({ message, type, onDismiss, onRetry }: ToastProps) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div 
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 z-50",
        "px-4 py-2.5 rounded-xl backdrop-blur-md border",
        "animate-in fade-in slide-in-from-bottom-4 duration-300",
        type === 'error' && "bg-red-500/20 border-red-500/30",
        type === 'success' && "bg-emerald-500/20 border-emerald-500/30",
        type === 'info' && "bg-blue-500/20 border-blue-500/30"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          "text-sm",
          type === 'error' && "text-red-300",
          type === 'success' && "text-emerald-300",
          type === 'info' && "text-blue-300"
        )}>
          {message}
        </span>
        {onRetry && type === 'error' && (
          <button
            onClick={onRetry}
            className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
          >
            Retry
          </button>
        )}
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white/50" />
        </button>
      </div>
    </div>
  );
}

// Hook to manage toast state
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  
  const showToast = useCallback((message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);
  
  const hideToast = useCallback(() => {
    setToast(null);
  }, []);
  
  return { toast, showToast, hideToast };
}

// ============================================
// PREMIUM EMPTY STATE (ALL SPORTS EMPTY)
// ============================================

interface PremiumEmptyStateProps {
  currentRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  onSportChange: (sport: SportKey) => void;
  sport: SportKey;
}

export function PremiumEmptyState({ currentRange, onRangeChange, onSportChange, sport }: PremiumEmptyStateProps) {
  const availableSports = AVAILABLE_SPORTS.filter(s => s.available && s.key !== sport);
  
  return (
    <div className="py-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Glass card */}
        <div className="relative rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-md p-8 text-center overflow-hidden">
          {/* Subtle glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.08),transparent_70%)] pointer-events-none" />
          
          <div className="relative z-10">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center mx-auto mb-5 border border-white/10">
              {currentRange === 'live' ? (
                <Radio className="w-8 h-8 text-white/30" />
              ) : (
                <Calendar className="w-8 h-8 text-white/30" />
              )}
            </div>
            
            {/* Title */}
            <h3 className="text-lg font-bold text-white mb-2">
              No games right now
            </h3>
            
            {/* Subtitle */}
            <p className="text-sm text-white/50 mb-6">
              Try Today, Tomorrow, or This Week — or switch sports.
            </p>
            
            {/* Range buttons */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {currentRange !== 'today' && (
                <button
                  onClick={() => onRangeChange('today')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all border border-white/10"
                >
                  Today
                </button>
              )}
              {currentRange !== 'tomorrow' && (
                <button
                  onClick={() => onRangeChange('tomorrow')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all border border-white/10"
                >
                  Tomorrow
                </button>
              )}
              {currentRange !== 'week' && (
                <button
                  onClick={() => onRangeChange('week')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all border border-white/10"
                >
                  This Week
                </button>
              )}
            </div>
            
            {/* Sport chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {availableSports.slice(0, 4).map(s => (
                <button
                  key={s.key}
                  onClick={() => onSportChange(s.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white transition-all border border-white/5"
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// LIVE PULSE DOT (ANIMATED)
// ============================================

interface LivePulseDotProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LivePulseDot({ size = 'md', className }: LivePulseDotProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };
  
  return (
    <span className={cn("relative flex", sizeClasses[size], className)}>
      <span className="live-pulse-ring absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
      <span className={cn("relative inline-flex rounded-full bg-red-500", sizeClasses[size])}></span>
    </span>
  );
}

// ============================================
// LIVE BADGE (WITH ANIMATION)
// ============================================

interface LiveBadgeProps {
  count?: number;
  className?: string;
}

export function LiveBadge({ count, className }: LiveBadgeProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/25",
      className
    )}>
      <LivePulseDot size="sm" />
      <span className="text-xs font-bold text-red-400">
        {count !== undefined ? count : 'LIVE'}
      </span>
    </div>
  );
}

// ============================================
// SECTION HEADER WITH LIVE INDICATOR
// ============================================

interface SectionHeaderProps {
  title: string;
  count: number;
  variant: 'live' | 'upcoming' | 'final';
}

export function SectionHeader({ title, count, variant }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {variant === 'live' && (
        <div className="relative">
          <Zap className="w-5 h-5 text-red-400" />
          <div className="absolute inset-0 bg-red-400 blur-md opacity-30 animate-pulse-glow"></div>
        </div>
      )}
      {variant === 'upcoming' && (
        <Clock className="w-5 h-5 text-blue-400" />
      )}
      {variant === 'final' && (
        <span className="w-5 h-5 flex items-center justify-center rounded bg-white/10 text-[10px] font-bold text-white/60">F</span>
      )}
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <span className="text-sm text-white/40 ml-1">({count})</span>
    </div>
  );
}
