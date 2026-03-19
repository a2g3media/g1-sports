/**
 * GameContextChip - Minimal context indicator for game tiles
 * Shows 1-2 key signals as compact badges from the real context API
 */

import { memo, useEffect, useState, useRef } from 'react';
import { Flame, TrendingUp, Zap, Users, Target, Star, AlertTriangle, Home, Cloud, Activity, Video, Share2 } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

interface ContextSignal {
  type: string;
  label: string;
  value: string;
  importance: 'high' | 'medium' | 'low';
  icon?: string;
  edge?: 'home' | 'away' | 'neutral';
}

interface GameContextChipProps {
  gameId: string;
  sport: string;
  homeTeam?: string;
  awayTeam?: string;
  className?: string;
}

// Map context signal types to icons
const SIGNAL_ICONS: Record<string, React.ElementType> = {
  rest_advantage: Activity,
  back_to_back: AlertTriangle,
  recent_form: Flame,
  momentum: Flame,
  h2h: Users,
  head_to_head: Users,
  rivalry: Users,
  pace_matchup: Zap,
  tempo_matchup: Zap,
  injuries: AlertTriangle,
  line_movement: TrendingUp,
  trend: TrendingUp,
  goalie_matchup: Target,
  pitchers: Target,
  probable_pitchers: Target,
  matchup: Target,
  weather: Cloud,
  weather_wind: Cloud,
  value: Star,
  sharp: Star,
  home_field: Home,
  home_court: Home,
  home_pitch: Home,
  rankings: Star,
};

const IMPORTANCE_COLORS: Record<string, string> = {
  high: 'text-amber-400',
  medium: 'text-cyan-400',
  low: 'text-slate-400',
};

const IMPORTANCE_GLOW: Record<string, string> = {
  high: 'shadow-[0_0_8px_currentColor]',
  medium: 'shadow-[0_0_4px_currentColor]',
  low: '',
};

const GameContextChipComponent = ({ gameId, sport, homeTeam, awayTeam, className }: GameContextChipProps) => {
  const [signals, setSignals] = useState<ContextSignal[]>([]);
  const [videoStatus, setVideoStatus] = useState<{
    status: 'queued' | 'submitted' | 'completed' | 'failed';
    socialStatus?: 'not_requested' | 'queued' | 'published' | 'failed';
  } | null>(null);
  const fetchedRef = useRef(false);
  
  useEffect(() => {
    // Prevent duplicate fetches in StrictMode
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    
    async function fetchContext() {
      if (!gameId || !sport) return;
      
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
          if (data.signals && Array.isArray(data.signals)) {
            setSignals(data.signals);
          }
        }
        const viewerOffset = new Date().getTimezoneOffset();
        const videoRes = await fetch(`/api/coachg/video/jobs?game_id=${encodeURIComponent(gameId)}&limit=1&window_hours=24&viewer_tz_offset_min=${encodeURIComponent(String(viewerOffset))}`, {
          credentials: 'include',
        });
        if (videoRes.ok) {
          const videoData = await videoRes.json() as {
            jobs?: Array<{
              status?: 'queued' | 'submitted' | 'completed' | 'failed';
              socialStatus?: 'not_requested' | 'queued' | 'published' | 'failed';
            }>;
          };
          const top = videoData.jobs?.[0];
          if (top?.status) {
            setVideoStatus({
              status: top.status,
              socialStatus: top.socialStatus,
            });
          }
        }
      } catch {
        // Silent fail for chip - it's a nice-to-have
      }
    }
    
    fetchContext();
  }, [gameId, sport, homeTeam, awayTeam]);
  
  if (signals.length === 0 && !videoStatus) return null;
  
  // Show highest priority signal first
  const sortedSignals = [...signals].sort((a, b) => {
    const priority = { high: 3, medium: 2, low: 1 };
    return (priority[b.importance] || 0) - (priority[a.importance] || 0);
  });
  
  const topSignal = sortedSignals[0];
  const Icon = topSignal ? (SIGNAL_ICONS[topSignal.type] || Zap) : Zap;
  const colorClass = topSignal ? (IMPORTANCE_COLORS[topSignal.importance] || 'text-cyan-400') : 'text-cyan-400';
  const glowClass = topSignal ? (IMPORTANCE_GLOW[topSignal.importance] || '') : '';
  
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <div
        className={cn(
          'flex items-center justify-center w-4 h-4 rounded-full',
          'bg-black/60 backdrop-blur-sm',
          colorClass,
          glowClass
        )}
        title={topSignal ? (topSignal.value || topSignal.label) : 'Game context'}
      >
        <Icon className="w-2.5 h-2.5" />
      </div>
      {videoStatus && (
        <div
          className={cn(
            'flex items-center justify-center w-4 h-4 rounded-full bg-black/60 backdrop-blur-sm',
            videoStatus.status === 'completed' ? 'text-emerald-400' :
            videoStatus.status === 'failed' ? 'text-red-400' :
            'text-violet-300'
          )}
          title={`Coach G video: ${videoStatus.status}${videoStatus.socialStatus ? ` • social ${videoStatus.socialStatus}` : ''}`}
        >
          {videoStatus.socialStatus === 'published' ? <Share2 className="w-2.5 h-2.5" /> : <Video className="w-2.5 h-2.5" />}
        </div>
      )}
      {signals.length > 1 && (
        <div className="w-3 h-3 rounded-full bg-black/60 flex items-center justify-center">
          <span className="text-[8px] text-zinc-400">+{signals.length - 1}</span>
        </div>
      )}
    </div>
  );
};

export const GameContextChip = memo(GameContextChipComponent);
