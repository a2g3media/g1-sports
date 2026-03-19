/**
 * GameContextCard
 * 
 * Premium dark card that displays contextual intelligence for a game.
 * Shows 4-6 key context signals with Coach G's analysis.
 * 
 * Design: Scan-friendly, concise, premium dark aesthetic
 */

import { useState, useEffect } from "react";
import { cn } from "@/react-app/lib/utils";
import { 
  TrendingUp, 
  AlertTriangle, 
  Activity,
  Zap,
  Heart,
  Trophy,
  Cloud,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

// Coach G Avatar
const COACH_G_AVATAR = "/assets/coachg/coach-g-avatar.png";

interface GameContextSignal {
  type: string;
  label: string;
  value: string;
  edge?: 'home' | 'away' | 'neutral';
  importance: 'high' | 'medium' | 'low';
  icon?: string;
}

interface GameContextData {
  gameId: string;
  sport: string;
  signals: GameContextSignal[];
  coachGNote: string;
  headline: string;
  lastUpdated: string;
  _mock?: boolean;
}

interface GameContextCardProps {
  gameId: string;
  sport: string;
  homeTeam?: string;
  awayTeam?: string;
  className?: string;
  compact?: boolean;
  showCoachG?: boolean;
}

// Icon mapping for signal types
const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  rest_advantage: <Activity className="w-4 h-4" />,
  back_to_back: <AlertTriangle className="w-4 h-4" />,
  recent_form: <TrendingUp className="w-4 h-4" />,
  head_to_head: <Users className="w-4 h-4" />,
  pace_matchup: <Zap className="w-4 h-4" />,
  tempo_matchup: <Zap className="w-4 h-4" />,
  injury_impact: <Heart className="w-4 h-4" />,
  line_movement: <TrendingUp className="w-4 h-4" />,
  goalie_matchup: <Trophy className="w-4 h-4" />,
  probable_pitchers: <Trophy className="w-4 h-4" />,
  weather: <Cloud className="w-4 h-4" />,
  weather_wind: <Cloud className="w-4 h-4" />,
  park_factor: <Activity className="w-4 h-4" />,
  rankings: <Trophy className="w-4 h-4" />,
  home_court: <Activity className="w-4 h-4" />,
  home_field: <Activity className="w-4 h-4" />,
  conference: <Trophy className="w-4 h-4" />,
  fixture_congestion: <AlertTriangle className="w-4 h-4" />,
  home_form: <TrendingUp className="w-4 h-4" />,
  away_form: <TrendingUp className="w-4 h-4" />,
  missing_players: <Heart className="w-4 h-4" />,
  travel_fatigue: <Activity className="w-4 h-4" />,
  series_momentum: <TrendingUp className="w-4 h-4" />,
};

// Edge color mapping
const EDGE_COLORS = {
  home: 'text-emerald-400',
  away: 'text-amber-400',
  neutral: 'text-slate-400',
};

export function GameContextCard({
  gameId,
  sport,
  homeTeam,
  awayTeam,
  className,
  compact = false,
  showCoachG = true,
}: GameContextCardProps) {
  const [context, setContext] = useState<GameContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    async function fetchContext() {
      try {
        setLoading(true);
        setError(null);
        
        // Build URL with optional team names as query params
        const params = new URLSearchParams();
        if (homeTeam) params.set('homeTeam', homeTeam);
        if (awayTeam) params.set('awayTeam', awayTeam);
        const queryString = params.toString();
        const url = `/api/game-context/${sport.toLowerCase()}/${gameId}${queryString ? `?${queryString}` : ''}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch game context');
        }
        
        const data = await response.json();
        setContext(data);
      } catch (err) {
        console.error('[GameContextCard] Error:', err);
        setError('Unable to load game context');
      } finally {
        setLoading(false);
      }
    }

    if (gameId && sport) {
      fetchContext();
    }
  }, [gameId, sport, homeTeam, awayTeam]);

  if (loading) {
    return (
      <div className={cn(
        "rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-800/60",
        "backdrop-blur-sm p-4",
        className
      )}>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          <span className="ml-2 text-sm text-slate-400">Loading context...</span>
        </div>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className={cn(
        "rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-800/60",
        "backdrop-blur-sm p-4",
        className
      )}>
        <div className="text-center py-4 text-slate-500 text-sm">
          {error || 'No context available'}
        </div>
      </div>
    );
  }

  const displaySignals = expanded ? context.signals : context.signals.slice(0, 3);

  return (
    <div className={cn(
      "rounded-xl border border-white/10",
      "bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90",
      "backdrop-blur-sm overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-white">Game Context</h3>
          </div>
          {context.headline && (
            <span className="text-xs font-medium text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full">
              {context.headline}
            </span>
          )}
        </div>
      </div>

      {/* Signals Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displaySignals.map((signal, idx) => (
            <SignalRow key={`${signal.type}-${idx}`} signal={signal} />
          ))}
        </div>

        {/* Expand/Collapse for compact mode */}
        {compact && context.signals.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center justify-center w-full py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Show {context.signals.length - 3} more
              </>
            )}
          </button>
        )}
      </div>

      {/* Coach G Note */}
      {showCoachG && context.coachGNote && (
        <div className="px-4 pb-4">
          <div className="flex gap-3 p-3 rounded-lg bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20">
            <img
              src={COACH_G_AVATAR}
              alt="Coach G"
              className="w-8 h-8 rounded-full flex-shrink-0 ring-2 ring-violet-500/30"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-semibold text-violet-400">Coach G</span>
                <span className="text-[10px] text-slate-500">Context Note</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {context.coachGNote}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer with timestamp */}
      {context.lastUpdated && (
        <div className="px-4 pb-3">
          <div className="text-[10px] text-slate-600 text-right">
            Updated {formatTimestamp(context.lastUpdated)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual signal row component
 */
function SignalRow({ signal }: { signal: GameContextSignal }) {
  const icon = SIGNAL_ICONS[signal.type] || <Activity className="w-4 h-4" />;
  const edgeColor = signal.edge ? EDGE_COLORS[signal.edge] : 'text-slate-300';
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-2.5 rounded-lg border",
      "transition-all duration-200 hover:bg-white/[0.02]",
      signal.importance === 'high' 
        ? 'bg-red-500/5 border-red-500/20' 
        : signal.importance === 'medium'
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-slate-500/5 border-slate-500/20'
    )}>
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
        signal.importance === 'high' 
          ? 'bg-red-500/20 text-red-400' 
          : signal.importance === 'medium'
          ? 'bg-amber-500/20 text-amber-400'
          : 'bg-slate-500/20 text-slate-400'
      )}>
        {signal.icon ? (
          <span className="text-base">{signal.icon}</span>
        ) : (
          icon
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
          {signal.label}
        </div>
        <div className={cn("text-sm font-medium truncate", edgeColor)}>
          {signal.value}
        </div>
      </div>

      {/* Edge indicator */}
      {signal.edge && signal.edge !== 'neutral' && (
        <div className={cn(
          "flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
          signal.edge === 'home' 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : 'bg-amber-500/20 text-amber-400'
        )}>
          {signal.edge}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for previews
 */
export function GameContextChip({
  gameId,
  sport,
  homeTeam,
  awayTeam,
  className,
}: {
  gameId: string;
  sport: string;
  homeTeam?: string;
  awayTeam?: string;
  className?: string;
}) {
  const [context, setContext] = useState<GameContextData | null>(null);

  useEffect(() => {
    async function fetchContext() {
      try {
        // Build URL with team names for better context
        const params = new URLSearchParams();
        if (homeTeam) params.set('homeTeam', homeTeam);
        if (awayTeam) params.set('awayTeam', awayTeam);
        const queryString = params.toString();
        const url = `/api/game-context/${sport.toLowerCase()}/${gameId}${queryString ? `?${queryString}` : ''}`;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setContext(data);
        }
      } catch {
        // Silent fail for chip
      }
    }
    fetchContext();
  }, [gameId, sport, homeTeam, awayTeam]);

  if (!context || context.signals.length === 0) {
    return null;
  }

  // Show first high-priority signal as a chip
  const primarySignal = context.signals.find(s => s.importance === 'high') || context.signals[0];

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
      "bg-slate-800/60 border border-white/10",
      className
    )}>
      {primarySignal.icon && (
        <span className="text-sm">{primarySignal.icon}</span>
      )}
      <span className="text-slate-300 truncate max-w-[120px]">
        {primarySignal.value}
      </span>
    </div>
  );
}

/**
 * Hook to fetch game context
 */
export function useGameContext(gameId: string, sport: string) {
  const [context, setContext] = useState<GameContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchContext() {
      if (!gameId || !sport) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/game-context/${sport.toLowerCase()}/${gameId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch game context');
        }
        
        const data = await response.json();
        setContext(data);
      } catch (err) {
        console.error('[useGameContext] Error:', err);
        setError('Unable to load game context');
      } finally {
        setLoading(false);
      }
    }

    fetchContext();
  }, [gameId, sport]);

  return { context, loading, error };
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

export default GameContextCard;
