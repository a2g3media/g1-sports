/**
 * CompactGameTile - Lightweight tile for Command Center grid view
 * Designed for 2-column grid, minimal footprint, no heavy hooks
 */

import { memo, useEffect, useState } from 'react';
import { TeamLogo } from '@/react-app/components/TeamLogo';
import { cn } from '@/react-app/lib/utils';
import { GameContextChip } from './GameContextChip';
import { getMarketPeriodLabels } from '@/react-app/lib/marketPeriodLabels';

export interface CompactGameTileGame {
  id: string;
  sport: string;
  homeTeam: string | { abbr: string; name?: string };
  awayTeam: string | { abbr: string; name?: string };
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string | null;
  spread?: number | null;
  overUnder?: number | null;
  spread1H?: number | null;
  total1H?: number | null;
  ml1HHome?: number | null;
  ml1HAway?: number | null;
  isOvertime?: boolean;
}

interface CompactGameTileProps {
  game: CompactGameTileGame;
  onClick?: () => void;
  isInWatchboard?: boolean;
}

type VideoJobSummary = {
  status: 'queued' | 'submitted' | 'completed' | 'failed';
  socialStatus?: 'not_requested' | 'queued' | 'published' | 'failed';
  videoUrl?: string;
  createdAt?: string;
};

const videoJobCache = new Map<string, VideoJobSummary | null>();

const formatGameTime = (startTime: string | undefined): string => {
  if (!startTime) return '';
  try {
    const date = new Date(startTime);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const getTeamAbbr = (team: string | { abbr: string; name?: string }): string => {
  if (typeof team === 'string') return team;
  return team.abbr || '';
};

const getTeamName = (team: string | { abbr: string; name?: string }): string => {
  if (typeof team === 'string') return team;
  return team.name || team.abbr || '';
};

const CompactGameTileComponent = ({ game, onClick, isInWatchboard }: CompactGameTileProps) => {
  const isLive = game.status === 'live' || game.status === 'in_progress' || game.status === 'LIVE' || game.status === 'IN_PROGRESS';
  const isFinal = game.status === 'final' || game.status === 'FINAL' || game.status === 'closed';
  const isScheduled = !isLive && !isFinal;
  
  const homeAbbr = getTeamAbbr(game.homeTeam);
  const awayAbbr = getTeamAbbr(game.awayTeam);
  const periodLabels = getMarketPeriodLabels(game.sport);
  const [videoJob, setVideoJob] = useState<VideoJobSummary | null>(() => videoJobCache.get(game.id) ?? null);
  
  // Don't default to 0 - preserve null to detect missing data
  const homeScore = game.homeScore ?? null;
  const awayScore = game.awayScore ?? null;
  const hasScores = homeScore !== null && awayScore !== null;
  const homeWinning = hasScores && homeScore > awayScore;
  const awayWinning = hasScores && awayScore > homeScore;

  useEffect(() => {
    let cancelled = false;
    const cached = videoJobCache.get(game.id);
    if (cached !== undefined) {
      setVideoJob(cached);
      return;
    }
    const run = async () => {
      try {
        const viewerOffset = new Date().getTimezoneOffset();
        const res = await fetch(`/api/coachg/video/jobs?game_id=${encodeURIComponent(game.id)}&limit=1&window_hours=24&viewer_tz_offset_min=${encodeURIComponent(String(viewerOffset))}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          videoJobCache.set(game.id, null);
          return;
        }
        const data = await res.json() as {
          jobs?: Array<{
            status?: 'queued' | 'submitted' | 'completed' | 'failed';
            socialStatus?: 'not_requested' | 'queued' | 'published' | 'failed';
            videoUrl?: string;
            createdAt?: string;
          }>;
        };
        const latest = data.jobs?.[0];
        const normalized: VideoJobSummary | null = latest?.status
          ? {
              status: latest.status,
              socialStatus: latest.socialStatus,
              videoUrl: latest.videoUrl,
              createdAt: latest.createdAt,
            }
          : null;
        videoJobCache.set(game.id, normalized);
        if (!cancelled) setVideoJob(normalized);
      } catch {
        videoJobCache.set(game.id, null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [game.id]);
  
  // Logos now handled by centralized TeamLogo component
  
  // Status display
  const getStatusDisplay = () => {
    if (isLive) {
      return (
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <div className="absolute inset-0 w-1.5 h-1.5 bg-red-400 rounded-full animate-ping" />
          </div>
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">
            {game.period || game.clock || 'LIVE'}
          </span>
        </div>
      );
    }
    if (isFinal) {
      return <span className="text-[10px] font-semibold text-slate-500 uppercase">{game.isOvertime ? 'Final/OT' : 'Final'}</span>;
    }
    return (
      <span className="text-[10px] font-semibold text-slate-400">
        {formatGameTime(game.startTime)}
      </span>
    );
  };
  
  // Team row component - uses centralized TeamLogo
  const TeamRow = ({ 
    abbr, 
    score, 
    isWinning, 
    isHome 
  }: { 
    abbr: string; 
    score: number | null; 
    isWinning: boolean;
    isHome: boolean;
  }) => (
    <div className={cn(
      "flex items-center gap-2 py-1.5",
      isHome && "border-t border-slate-700/30"
    )}>
      <TeamLogo 
        teamCode={abbr} 
        sport={game.sport} 
        size={24}
        winnerGlow={isFinal && isWinning}
        className="flex-shrink-0"
      />
      <span className={cn(
        "text-xs font-semibold flex-1 truncate",
        isFinal && isWinning ? "text-white" : "text-slate-300"
      )}>
        {abbr}
      </span>
      {hasScores && score !== null && (
        <span className={cn(
          "text-sm font-bold tabular-nums min-w-[24px] text-right",
          isFinal && isWinning ? "text-white" : 
          isLive && isWinning ? "text-emerald-400" : "text-slate-400"
        )}>
          {score}
        </span>
      )}
    </div>
  );
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full text-left rounded-xl overflow-hidden transition-all duration-200",
        "bg-slate-900/60 hover:bg-slate-800/80 active:scale-[0.98]",
        "border border-slate-700/40 hover:border-slate-600/60",
        "min-h-[120px]", // Ensure minimum touch-friendly height
        isLive && "ring-1 ring-red-500/30",
        isInWatchboard && "ring-1 ring-cyan-500/40"
      )}
    >
      {/* Live glow effect */}
      {isLive && (
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
      )}
      
      {/* Watchboard indicator */}
      {isInWatchboard && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-cyan-500 rounded-full" />
      )}
      
      {/* Context signal chip */}
      <GameContextChip 
        gameId={game.id} 
        sport={game.sport}
        homeTeam={getTeamName(game.homeTeam)}
        awayTeam={getTeamName(game.awayTeam)}
        className="absolute top-1 left-1" 
      />
      
      <div className="p-3">
        {/* Status row */}
        <div className="flex items-center justify-between mb-2">
          {getStatusDisplay()}
          {game.channel && (
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider truncate max-w-[50px]">
              {game.channel}
            </span>
          )}
        </div>
        
        {/* Away team (listed first, visitors) */}
        <TeamRow 
          abbr={awayAbbr}
          score={awayScore}
          isWinning={awayWinning}
          isHome={false}
        />
        
        {/* Home team */}
        <TeamRow 
          abbr={homeAbbr}
          score={homeScore}
          isWinning={homeWinning}
          isHome={true}
        />
        
        {/* Odds preview for scheduled games */}
        {isScheduled && (game.spread != null || game.spread1H != null || game.total1H != null) && (
          <div className="mt-2 pt-2 border-t border-slate-700/30 space-y-1">
            {game.spread != null && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Spread</span>
                <span className="text-[11px] font-mono font-semibold text-cyan-400">
                  {game.spread > 0 ? `+${game.spread}` : game.spread}
                </span>
              </div>
            )}
            {(game.spread1H != null || game.total1H != null) && (
              <div className="flex items-center justify-between rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-1">
                <span className="text-[9px] uppercase tracking-wide text-violet-300/90">{periodLabels.short}</span>
                <span className="text-[10px] font-mono font-semibold text-violet-200">
                  {game.spread1H != null ? (game.spread1H > 0 ? `S +${game.spread1H}` : `S ${game.spread1H}`) : "S —"}
                  {" • "}
                  {game.total1H != null ? `T ${game.total1H}` : "T —"}
                </span>
              </div>
            )}
          </div>
        )}

        {videoJob && (
          <div className="mt-2 flex items-center justify-between rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
              Coach G Video: {videoJob.status}
              {videoJob.socialStatus === 'published' ? ' • Published' : ''}
            </span>
            {videoJob.status === 'completed' && videoJob.videoUrl && (
              <a
                href={videoJob.videoUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
              >
                Watch Video
              </a>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

// Memoized export for performance - prevents re-renders when props haven't changed
export const CompactGameTile = memo(CompactGameTileComponent, (prevProps, nextProps) => {
  // Custom comparison for performance
  return (
    prevProps.game.id === nextProps.game.id &&
    prevProps.game.status === nextProps.game.status &&
    prevProps.game.homeScore === nextProps.game.homeScore &&
    prevProps.game.awayScore === nextProps.game.awayScore &&
    prevProps.game.spread === nextProps.game.spread &&
    prevProps.game.overUnder === nextProps.game.overUnder &&
    prevProps.game.spread1H === nextProps.game.spread1H &&
    prevProps.game.total1H === nextProps.game.total1H &&
    prevProps.game.ml1HHome === nextProps.game.ml1HHome &&
    prevProps.game.ml1HAway === nextProps.game.ml1HAway &&
    prevProps.isInWatchboard === nextProps.isInWatchboard
  );
});
