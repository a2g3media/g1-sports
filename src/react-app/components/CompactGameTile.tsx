/**
 * CompactGameTile - Lightweight tile for Command Center grid view
 * Designed for 2-column grid, minimal footprint, no heavy hooks
 */

import { memo, useEffect, useState } from 'react';
import { TeamLogo } from '@/react-app/components/TeamLogo';
import { PlayerPhoto } from '@/react-app/components/PlayerPhoto';
import { cn } from '@/react-app/lib/utils';
import { prefetch } from '@/react-app/components/LazyRoute';
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
  mlHome?: number | null;
  mlAway?: number | null;
  spread1H?: number | null;
  total1H?: number | null;
  ml1HHome?: number | null;
  ml1HAway?: number | null;
  isOvertime?: boolean;
  probableAwayPitcher?: { name: string; record?: string };
  probableHomePitcher?: { name: string; record?: string };
}

interface CompactGameTileProps {
  game: CompactGameTileGame;
  onClick?: () => void;
  isInWatchboard?: boolean;
  isFavorite?: boolean;
}

type VideoJobSummary = {
  status: 'queued' | 'submitted' | 'completed' | 'failed';
  socialStatus?: 'not_requested' | 'queued' | 'published' | 'failed';
  videoUrl?: string;
  createdAt?: string;
};

const videoJobCache = new Map<string, VideoJobSummary | null>();

const prefetchedGameResources = new Set<string>();

const prefetchGameResources = (gameId: string, _sport: string) => {
  const id = String(gameId || '').trim();
  if (!id || prefetchedGameResources.has(id)) return;
  prefetchedGameResources.add(id);

  // Route chunk prewarm only. Keep API/data loading on destination pages.
  prefetch(() => import('@/react-app/pages/GameDetailPage'));
  prefetch(() => import('@/react-app/pages/OddsGamePage'));
  prefetch(() => import('@/react-app/pages/PlayerProfilePage'));
};

const EASTERN_TZ = 'America/New_York';

const toEasternDateKey = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const formatGameTime = (startTime: string | undefined): string => {
  if (!startTime) return '';
  try {
    const date = new Date(startTime);
    const now = new Date();
    const isTodayEt = toEasternDateKey(date) === toEasternDateKey(now);
    
    const timeLabel = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: EASTERN_TZ,
    });
    if (isTodayEt) {
      return timeLabel;
    }
    const dateLabel = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: EASTERN_TZ,
    });
    return `${dateLabel} • ${timeLabel}`;
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

const formatGolfPlayerName = (name: string): string => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Player';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return trimmed;
  const firstInitial = parts[0][0]?.toUpperCase() || '';
  const lastName = parts[parts.length - 1];
  return `${firstInitial}. ${lastName}`;
};

const formatSpread = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  const snapped = Math.round(value * 2) / 2;
  if (Object.is(snapped, -0) || snapped === 0) return 'PK';
  return snapped > 0 ? `+${snapped}` : `${snapped}`;
};

const formatMoneyline = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};

const formatPitcherLine = (pitcher: { name: string; record?: string } | undefined): string => {
  const name = String(pitcher?.name || '').trim();
  if (!name) return '';
  const record = String(pitcher?.record || '').trim();
  return record ? `${name} (${record})` : name;
};

const CompactGameTileComponent = ({ game, onClick, isInWatchboard, isFavorite }: CompactGameTileProps) => {
  const isLive = game.status === 'live' || game.status === 'in_progress' || game.status === 'LIVE' || game.status === 'IN_PROGRESS';
  const isFinal = game.status === 'final' || game.status === 'FINAL' || game.status === 'closed';
  const isScheduled = !isLive && !isFinal;
  const isMlb = String(game.sport || '').toUpperCase() === 'MLB';
  
  const homeAbbr = getTeamAbbr(game.homeTeam);
  const awayAbbr = getTeamAbbr(game.awayTeam);
  const homeName = getTeamName(game.homeTeam);
  const awayName = getTeamName(game.awayTeam);
  const periodLabels = getMarketPeriodLabels(game.sport);
  const isGolf = String(game.sport || '').toUpperCase() === 'GOLF';
  const awayDisplayPrimary = isGolf ? formatGolfPlayerName(awayName) : awayAbbr;
  const homeDisplayPrimary = isGolf ? formatGolfPlayerName(homeName) : homeAbbr;
  const [videoJob, setVideoJob] = useState<VideoJobSummary | null>(() => videoJobCache.get(game.id) ?? null);
  
  // Don't default to 0 - preserve null to detect missing data
  const homeScore = game.homeScore ?? null;
  const awayScore = game.awayScore ?? null;
  const hasScores = homeScore !== null && awayScore !== null;
  const homeWinning = hasScores && homeScore > awayScore;
  const awayWinning = hasScores && awayScore > homeScore;
  const awayPitcherLine = formatPitcherLine(game.probableAwayPitcher);
  const homePitcherLine = formatPitcherLine(game.probableHomePitcher);
  const showPitcherMatchup = isScheduled && isMlb && Boolean(awayPitcherLine || homePitcherLine);

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
        <div className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-500/10 px-2.5 py-0.5">
          <div className="relative">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <div className="absolute inset-0 w-1.5 h-1.5 bg-red-400 rounded-full animate-ping" />
          </div>
          <span className="text-[10px] font-semibold text-red-300 uppercase tracking-[0.08em]">
            {game.period || game.clock || 'LIVE'}
          </span>
        </div>
      );
    }
    if (isFinal) {
      return (
        <span className="inline-flex rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
          {game.isOvertime ? 'Final/OT' : 'Final'}
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-cyan-200">
        {formatGameTime(game.startTime)}
      </span>
    );
  };
  
  // Team row component - uses centralized TeamLogo
  const TeamRow = ({ 
    abbr, 
    primary,
    name,
    score, 
    isWinning, 
    isHome 
  }: { 
    abbr: string; 
    primary: string;
    name: string;
    score: number | null; 
    isWinning: boolean;
    isHome: boolean;
  }) => (
    <div className={cn(
      "flex items-center gap-2.5 rounded-[10px] border border-white/[0.05] px-3 py-2",
      isHome
        ? "mt-1 bg-gradient-to-r from-[#17212D] to-[#121821]"
        : "bg-gradient-to-r from-[#141C26] to-[#121821]"
    )}>
      {isGolf ? (
        <PlayerPhoto
          playerName={name}
          sport="golf"
          size={26}
          className="flex-shrink-0"
        />
      ) : (
        <TeamLogo 
          teamCode={abbr}
          teamName={name}
          sport={game.sport} 
          size={26}
          winnerGlow={isFinal && isWinning}
          className="flex-shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn(
          "truncate text-xs font-semibold",
          isFinal && isWinning ? "text-white" : "text-slate-200"
        )}>
          {primary}
        </div>
        <div className="truncate text-[10px] tracking-[0.01em] text-slate-500">{isGolf ? abbr : name}</div>
      </div>
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
      onMouseEnter={() => { void prefetchGameResources(game.id, game.sport); }}
      onFocus={() => { void prefetchGameResources(game.id, game.sport); }}
      onTouchStart={() => { void prefetchGameResources(game.id, game.sport); }}
      className={cn(
        "relative w-full overflow-hidden rounded-[14px] border text-left transition-all duration-200",
        "min-h-[136px] border-white/[0.06] bg-[#121821] shadow-[0_12px_26px_rgba(0,0,0,0.32)]",
        "hover:-translate-y-0.5 hover:border-cyan-400/25 hover:bg-[#16202B] hover:shadow-[0_18px_34px_rgba(0,0,0,0.36)] active:scale-[0.99]",
        isLive && "ring-1 ring-red-500/30",
        isLive && isFavorite && "ring-2 ring-amber-400/35 shadow-[0_0_26px_rgba(251,191,36,0.22)]",
        isInWatchboard && "ring-1 ring-cyan-400/35"
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/15" />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-cyan-400/24" />
      {/* Live glow effect */}
      {isLive && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent" />
      )}
      {isLive && isFavorite && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-400/12 via-transparent to-amber-300/10" />
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
      
      <div className="relative z-10 p-3.5">
        {/* Status row */}
        <div className="mb-2.5 flex items-center justify-between">
          {getStatusDisplay()}
          {game.channel && (
            <span className="max-w-[56px] truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              {game.channel}
            </span>
          )}
        </div>
        
        {/* Away team (listed first, visitors) */}
        <TeamRow 
          abbr={awayAbbr}
          primary={awayDisplayPrimary}
          name={awayName}
          score={awayScore}
          isWinning={awayWinning}
          isHome={false}
        />
        
        {/* Home team */}
        <TeamRow 
          abbr={homeAbbr}
          primary={homeDisplayPrimary}
          name={homeName}
          score={homeScore}
          isWinning={homeWinning}
          isHome={true}
        />
        
        {/* Odds preview for scheduled games */}
        {isScheduled && (game.spread != null || game.overUnder != null || game.mlHome != null || game.mlAway != null || game.ml1HHome != null || game.ml1HAway != null || game.spread1H != null || game.total1H != null) && (
          <div className="mt-2.5 border-t border-white/[0.06] pt-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[10px] border border-white/[0.05] bg-[#0F141B] px-2 py-1.5 text-center">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Spread</div>
                <div className="mt-0.5 text-[11px] font-mono font-semibold text-cyan-300">{formatSpread(game.spread)}</div>
              </div>
              <div className="rounded-[10px] border border-white/[0.05] bg-[#0F141B] px-2 py-1.5 text-center">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Total</div>
                <div className="mt-0.5 text-[11px] font-mono font-semibold text-emerald-300">
                  {game.overUnder != null ? game.overUnder : "-"}
                </div>
              </div>
              <div className="rounded-[10px] border border-white/[0.05] bg-[#0F141B] px-2 py-1.5 text-center">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Moneyline</div>
                <div className="mt-0.5 text-[10px] font-mono font-semibold text-amber-300">
                  {`${formatMoneyline(game.mlAway ?? game.ml1HAway)} / ${formatMoneyline(game.mlHome ?? game.ml1HHome)}`}
                </div>
              </div>
            </div>
            {(game.spread1H != null || game.total1H != null) && (
              <div className="mt-1.5 flex items-center justify-between rounded-[10px] border border-violet-400/25 bg-violet-500/10 px-2 py-1.5">
                <span className="text-[9px] uppercase tracking-wide text-violet-200/90">{periodLabels.short}</span>
                <span className="text-[10px] font-mono font-semibold text-violet-100">
                  {`S ${formatSpread(game.spread1H)} • T ${game.total1H ?? "-"}`}
                </span>
              </div>
            )}
          </div>
        )}

        {showPitcherMatchup && (
          <div className="mt-2.5 rounded-[10px] border border-cyan-400/35 bg-gradient-to-r from-cyan-500/14 via-sky-500/10 to-violet-500/12 px-2.5 py-2 shadow-[0_0_20px_rgba(56,189,248,0.12)]">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-cyan-100/95">
              <span className="text-[10px]">⚾</span>
              <span className="font-semibold">Probable Pitcher Duel</span>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300/80" />
            </div>
            {awayPitcherLine && (
              <div className="mb-1 truncate rounded-md border border-cyan-300/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-slate-100">
                <span className="mr-1 text-[9px] uppercase text-cyan-300">Away</span>
                {awayPitcherLine}
              </div>
            )}
            {homePitcherLine && (
              <div className="truncate rounded-md border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-[10px] font-medium text-slate-100">
                <span className="mr-1 text-[9px] uppercase text-violet-300">Home</span>
                {homePitcherLine}
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
    prevProps.game.startTime === nextProps.game.startTime &&
    prevProps.game.probableAwayPitcher?.name === nextProps.game.probableAwayPitcher?.name &&
    prevProps.game.probableAwayPitcher?.record === nextProps.game.probableAwayPitcher?.record &&
    prevProps.game.probableHomePitcher?.name === nextProps.game.probableHomePitcher?.name &&
    prevProps.game.probableHomePitcher?.record === nextProps.game.probableHomePitcher?.record &&
    prevProps.isInWatchboard === nextProps.isInWatchboard
  );
});
