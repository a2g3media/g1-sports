/**
 * CompactGameTile - clean mobile-first Games card.
 */

import { memo } from 'react';
import { TeamLogo } from '@/react-app/components/TeamLogo';
import { PlayerPhoto } from '@/react-app/components/PlayerPhoto';
import { cn } from '@/react-app/lib/utils';
import { prefetch } from '@/react-app/components/LazyRoute';

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
  odds?: {
    f5?: {
      spread?: {
        home?: number | null;
        away?: number | null;
      };
      total?: number | null;
      moneyline?: {
        home?: number | null;
        away?: number | null;
      };
    };
  };
  isOvertime?: boolean;
  probableAwayPitcher?: { name: string; record?: string };
  probableHomePitcher?: { name: string; record?: string };
  inningNumber?: number | null;
  inningHalf?: string | null;
  inningState?: string | null;
  mlbLiveState?: {
    inningNumber?: number | null;
    inningHalf?: string | null;
  } | null;
}

interface CompactGameTileProps {
  game: CompactGameTileGame;
  onClick?: () => void;
  onCoachClick?: () => void;
  isInWatchboard?: boolean;
  showQuickAction?: boolean;
  onQuickWatchboard?: () => void;
}

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
const COACH_G_AVATAR = '/assets/coachg/coach-g-avatar.png';

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

const ordinalSuffix = (value: number): string => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
};

const normalizeMlbInningHalf = (value?: string | null): 'Top' | 'Bot' | 'Mid' | 'End' | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 't' || raw === 'top' || raw.includes('top')) return 'Top';
  if (raw === 'b' || raw === 'bot' || raw === 'bottom' || raw.includes('bottom')) return 'Bot';
  if (raw === 'm' || raw === 'mid' || raw === 'middle' || raw.includes('mid')) return 'Mid';
  if (raw === 'e' || raw === 'end' || raw.includes('end')) return 'End';
  return null;
};

const parseMlbInningDisplay = (
  period?: string,
  clock?: string,
  inningNumber?: number | null,
  inningHalf?: string | null,
  inningState?: string | null
): string | null => {
  const explicitInning = Number(
    inningNumber ??
      (Number.isFinite(Number(period)) ? Number(period) : NaN)
  );
  const explicitHalf = normalizeMlbInningHalf(inningState) || normalizeMlbInningHalf(inningHalf);
  if (Number.isFinite(explicitInning) && explicitInning > 0 && explicitHalf) {
    return `${explicitHalf} ${ordinalSuffix(explicitInning)}`;
  }
  if (Number.isFinite(explicitInning) && explicitInning > 0) {
    return `${ordinalSuffix(explicitInning)} Inning`;
  }

  const raw = `${String(period || '').trim()} ${String(clock || '').trim()}`.trim();
  if (!raw) return null;

  const sideWithInning = raw.match(/\b(top|bot|bottom|mid|middle|end|t|b|m|e)\b(?:\s+of(?:\s+the)?|\s+the)?[\s:-]*(\d{1,2})(?:st|nd|rd|th)?/i);
  if (sideWithInning) {
    const sideRaw = sideWithInning[1].toLowerCase();
    const inning = Number(sideWithInning[2]);
    if (!Number.isFinite(inning) || inning <= 0) return null;
    const side = sideRaw === 't' || sideRaw === 'top'
      ? 'Top'
      : sideRaw === 'm' || sideRaw === 'mid' || sideRaw === 'middle'
        ? 'Mid'
        : sideRaw === 'e' || sideRaw === 'end'
          ? 'End'
          : 'Bot';
    return `${side} ${ordinalSuffix(inning)}`;
  }

  const shortCode = raw.match(/\b([TtBb])\s*[- ]?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (shortCode) {
    const side = shortCode[1].toUpperCase() === 'T' ? 'Top' : 'Bot';
    const inning = Number(shortCode[2]);
    if (!Number.isFinite(inning) || inning <= 0) return null;
    return `${side} ${ordinalSuffix(inning)}`;
  }

  // Fallback when feed only provides inning number.
  const inningOnly = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:inning|inn|in)?\b/i);
  if (inningOnly) {
    const inning = Number(inningOnly[1]);
    if (Number.isFinite(inning) && inning > 0) {
      return `${ordinalSuffix(inning)} Inning`;
    }
  }

  return null;
};

const isZeroClockValue = (clock?: string): boolean => {
  const raw = String(clock || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes('intermission')) return true;
  const digitsOnly = raw.replace(/[^0-9]/g, '');
  return digitsOnly.length > 0 && Number(digitsOnly) === 0;
};

const parseHockeyLiveLabel = (period?: string, clock?: string): string | null => {
  if (!isZeroClockValue(clock)) return null;

  const periodRaw = String(period || '').trim().toLowerCase();
  const clockRaw = String(clock || '').trim().toLowerCase();
  if (periodRaw.includes('intermission') || clockRaw.includes('intermission')) {
    return 'Intermission';
  }

  const combined = `${periodRaw} ${clockRaw}`;
  const periodMatch = combined.match(/\b(?:p(?:eriod)?)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (!periodMatch) return 'Intermission';

  const periodNumber = Number(periodMatch[1]);
  if (!Number.isFinite(periodNumber) || periodNumber <= 0) return 'Intermission';
  return `End ${ordinalSuffix(periodNumber)}`;
};

const isValidClockValue = (clock?: string): boolean => {
  const raw = String(clock || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower.includes('null:null')) return false;
  return true;
};

const parseSoccerLiveLabel = (period?: string, clock?: string): string | null => {
  const combined = `${String(period || '')} ${String(clock || '')}`.toLowerCase();
  if (/\bht\b|\bhalf[- ]?time\b|\bhalftime\b/.test(combined)) return 'HT';
  if (/\bft\b|\bfull[- ]?time\b|\bfulltime\b/.test(combined)) return 'FT';

  const minuteSource = String(clock || period || '').trim();
  if (!minuteSource) return null;
  const minuteMatch = minuteSource.match(/(\d{1,3})(?:\+(\d{1,2}))?(?:[:']\d{2})?/);
  if (!minuteMatch) return null;
  const baseMinute = Number(minuteMatch[1]);
  if (!Number.isFinite(baseMinute) || baseMinute < 0) return null;
  const extraRaw = minuteMatch[2];
  const extraMinute = extraRaw != null ? Number(extraRaw) : null;
  if (extraMinute != null && Number.isFinite(extraMinute) && extraMinute >= 0) {
    return `${baseMinute}+${extraMinute}'`;
  }
  return `${baseMinute}'`;
};

const parseQuarterOrHalfLabel = (period?: string, sport?: string): string | null => {
  const raw = String(period || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (/\bhalftime\b|\bhalf[- ]?time\b/.test(lower)) return 'Halftime';
  if (/\bot\b|\bovertime\b/.test(lower)) return 'OT';

  const q = raw.match(/\b(?:q|quarter)\s*([1-9])\b/i) || raw.match(/\b([1-9])(?:st|nd|rd|th)?\s*q\b/i);
  if (q) return `Q${q[1]}`;

  const isCollegeBall = ['NCAAB', 'NCAAF'].includes(String(sport || '').toUpperCase());
  const halfMatch = raw.match(/\b([12])(?:st|nd)?\s*half\b/i) || raw.match(/\b([12])h\b/i);
  if (halfMatch && isCollegeBall) return `${halfMatch[1]}H`;
  if (halfMatch && !isCollegeBall) return `Q${halfMatch[1]}`;

  return null;
};

const parseHockeyPeriodLabel = (period?: string): string | null => {
  const raw = String(period || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('intermission')) return 'Intermission';
  if (lower.includes('ot') || lower.includes('overtime')) return 'OT';
  const match = raw.match(/\b(?:p|period)\s*([1-9])\b/i) || raw.match(/\b([1-9])(?:st|nd|rd|th)?\s*period\b/i);
  if (match) return `P${match[1]}`;
  return null;
};

const formatLiveStatusLabel = (
  sport: string,
  period?: string,
  clock?: string,
  mlbContext?: {
    inningNumber?: number | null;
    inningHalf?: string | null;
    inningState?: string | null;
  }
): string => {
  const sportUpper = String(sport || '').toUpperCase();
  const periodRaw = String(period || '').trim();
  const clockRaw = String(clock || '').trim();
  const hasClock = isValidClockValue(clockRaw);
  const hasPeriod = Boolean(periodRaw);

  if (sportUpper === 'MLB') {
    const mlb = parseMlbInningDisplay(
      period,
      clock,
      mlbContext?.inningNumber ?? null,
      mlbContext?.inningHalf ?? null,
      mlbContext?.inningState ?? null
    );
    if (mlb) return mlb;
    return hasPeriod ? periodRaw : (hasClock ? clockRaw : 'LIVE');
  }

  if (sportUpper === 'SOCCER') {
    const soccer = parseSoccerLiveLabel(period, clock);
    if (soccer) return soccer;
    return hasClock ? clockRaw : (hasPeriod ? periodRaw : 'LIVE');
  }

  if (sportUpper === 'NHL' || sportUpper.includes('HOCKEY')) {
    const hockeyBoundary = parseHockeyLiveLabel(period, clock);
    if (hockeyBoundary) return hockeyBoundary === 'Intermission' ? 'Intermission' : hockeyBoundary.replace('End ', 'P');
    const hockeyPeriod = parseHockeyPeriodLabel(period);
    if (hockeyPeriod === 'Intermission') return 'Intermission';
    if (hockeyPeriod && hasClock) return `${hockeyPeriod} ${clockRaw}`;
    if (hockeyPeriod) return hockeyPeriod;
    return hasClock ? clockRaw : (hasPeriod ? periodRaw : 'LIVE');
  }

  if (['NBA', 'WNBA', 'NFL', 'NCAAB', 'NCAAF', 'NCAAM'].includes(sportUpper)) {
    const quarterOrHalf = parseQuarterOrHalfLabel(period, sportUpper);
    if (quarterOrHalf === 'Halftime') return 'Halftime';
    if (quarterOrHalf && hasClock) return `${quarterOrHalf} ${clockRaw}`;
    if (quarterOrHalf) return quarterOrHalf;
    if (hasPeriod && hasClock) return `${periodRaw} ${clockRaw}`;
    return hasPeriod ? periodRaw : (hasClock ? clockRaw : 'LIVE');
  }

  if (hasPeriod && hasClock) return `${periodRaw} ${clockRaw}`;
  return hasPeriod ? periodRaw : (hasClock ? clockRaw : 'LIVE');
};

const CompactGameTileComponent = ({
  game,
  onClick,
  onCoachClick,
  isInWatchboard,
  showQuickAction = true,
  onQuickWatchboard,
}: CompactGameTileProps) => {
  const isLive = game.status === 'live' || game.status === 'in_progress' || game.status === 'LIVE' || game.status === 'IN_PROGRESS';
  const isFinal = game.status === 'final' || game.status === 'FINAL' || game.status === 'closed';
  const isMlb = String(game.sport || '').toUpperCase() === 'MLB';
  const isHockey = String(game.sport || '').toUpperCase() === 'NHL' || String(game.sport || '').toUpperCase().includes('HOCKEY');
  
  const homeAbbr = getTeamAbbr(game.homeTeam);
  const awayAbbr = getTeamAbbr(game.awayTeam);
  const homeName = getTeamName(game.homeTeam);
  const awayName = getTeamName(game.awayTeam);
  const isGolf = String(game.sport || '').toUpperCase() === 'GOLF';
  const awayDisplayPrimary = isGolf ? formatGolfPlayerName(awayName) : awayAbbr;
  const homeDisplayPrimary = isGolf ? formatGolfPlayerName(homeName) : homeAbbr;
  
  const homeScore = game.homeScore ?? null;
  const awayScore = game.awayScore ?? null;
  const hasScores = homeScore !== null && awayScore !== null;
  const homeWinning = hasScores && homeScore > awayScore;
  const awayWinning = hasScores && awayScore > homeScore;

  const getStatusDisplay = () => {
    if (isLive) {
      const liveLabel = formatLiveStatusLabel(
        game.sport,
        game.period != null ? String(game.period) : undefined,
        game.clock != null ? String(game.clock) : undefined,
        {
          inningNumber: game.inningNumber ?? game.mlbLiveState?.inningNumber ?? null,
          inningHalf: game.inningHalf ?? game.mlbLiveState?.inningHalf ?? null,
          inningState: game.inningState ?? null,
        }
      );
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-red-300/35 bg-gradient-to-r from-red-500/20 via-orange-500/12 to-red-500/18 px-2.5 py-0.5 shadow-[0_0_14px_rgba(239,68,68,0.22)]">
          <div className="relative">
            <div className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
            <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-red-300 animate-ping" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-red-100">
            {liveLabel}
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
      <span className="inline-flex rounded-full border border-cyan-400/25 bg-gradient-to-r from-cyan-500/14 to-sky-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-cyan-100">
        {formatGameTime(game.startTime)}
      </span>
    );
  };
  
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
      "flex items-center gap-3 rounded-[10px] border border-white/[0.06] px-3.5 py-2.5 transition-colors duration-200",
      isHome
        ? "mt-1 bg-gradient-to-r from-[#1A2532] to-[#121821]"
        : "bg-gradient-to-r from-[#151E2A] to-[#121821]"
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
          "truncate text-[13px] font-semibold leading-tight",
          isFinal && isWinning ? "text-white" : "text-slate-200"
        )}>
          {primary}
        </div>
        <div className="truncate text-[11px] tracking-[0.01em] text-slate-500">{isGolf ? abbr : name}</div>
      </div>
      {hasScores && score !== null && (
        <span className={cn(
          "min-w-[30px] text-right text-[21px] font-extrabold leading-none tabular-nums tracking-tight transition-colors duration-200",
          isFinal && isWinning
            ? "text-white"
            : isLive && isWinning
              ? "text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.25)]"
              : "text-slate-200"
        )}>
          {score}
        </span>
      )}
    </div>
  );
  
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-interactive-control="true"]')) return;
        onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => { void prefetchGameResources(game.id, game.sport); }}
      onFocus={() => { void prefetchGameResources(game.id, game.sport); }}
      onTouchStart={() => { void prefetchGameResources(game.id, game.sport); }}
      className={cn(
        "relative w-full overflow-hidden rounded-[14px] border text-left transition-all duration-200 ease-out",
        "min-h-[136px] border-white/[0.08] bg-[#121821] shadow-[0_14px_28px_rgba(0,0,0,0.34)]",
        "hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-[#172230] hover:shadow-[0_22px_36px_rgba(0,0,0,0.4)] active:scale-[0.99]",
        isLive && "ring-1 ring-red-400/35 shadow-[0_16px_32px_rgba(0,0,0,0.38),0_0_22px_rgba(239,68,68,0.16)]",
        isInWatchboard && "ring-1 ring-cyan-300/40"
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.025] via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(255,255,255,0.03)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-cyan-400/24" />
      {/* Live glow effect */}
      {isLive && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/14 via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-red-500/[0.06] via-transparent to-orange-400/[0.04]" />
        </>
      )}
      
      <div className="relative z-10 p-3.5">
        {/* Status row */}
        <div className="mb-3 flex items-center justify-between gap-2">
          {getStatusDisplay()}
          <button
            type="button"
            data-interactive-control="true"
            onClick={(e) => {
              e.stopPropagation();
              onCoachClick?.();
            }}
            className="relative z-20 pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.16)] transition-all hover:scale-105 hover:bg-emerald-500/20 active:scale-95"
            aria-label="Open Coach G for this game"
          >
            <img src={COACH_G_AVATAR} alt="Coach G" className="h-5 w-5 rounded-full object-cover" />
          </button>
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
        
        {showQuickAction && (
          <div className="mt-3 border-t border-white/[0.06] pt-2.5">
            <button
              type="button"
              data-interactive-control="true"
              onClick={(e) => {
                e.stopPropagation();
                onQuickWatchboard?.();
              }}
              className={cn(
                "w-full rounded-[10px] border px-3 py-2 text-[11px] font-semibold tracking-wide transition-all duration-200 active:scale-[0.985]",
                isInWatchboard
                  ? "border-cyan-300/45 bg-gradient-to-r from-cyan-500/18 to-sky-500/14 text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.18)] hover:from-cyan-500/22 hover:to-sky-500/18"
                  : "border-white/[0.12] bg-white/[0.03] text-slate-100 hover:border-cyan-300/30 hover:bg-cyan-500/[0.08]"
              )}
            >
              {isInWatchboard ? "In Watchboard • Add to another" : "Add to Watchboard"}
            </button>
          </div>
        )}
      </div>
    </div>
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
    prevProps.game.odds?.f5?.spread?.home === nextProps.game.odds?.f5?.spread?.home &&
    prevProps.game.odds?.f5?.spread?.away === nextProps.game.odds?.f5?.spread?.away &&
    prevProps.game.odds?.f5?.total === nextProps.game.odds?.f5?.total &&
    prevProps.game.odds?.f5?.moneyline?.home === nextProps.game.odds?.f5?.moneyline?.home &&
    prevProps.game.odds?.f5?.moneyline?.away === nextProps.game.odds?.f5?.moneyline?.away &&
    prevProps.game.startTime === nextProps.game.startTime &&
    prevProps.game.probableAwayPitcher?.name === nextProps.game.probableAwayPitcher?.name &&
    prevProps.game.probableAwayPitcher?.record === nextProps.game.probableAwayPitcher?.record &&
    prevProps.game.probableHomePitcher?.name === nextProps.game.probableHomePitcher?.name &&
    prevProps.game.probableHomePitcher?.record === nextProps.game.probableHomePitcher?.record &&
    prevProps.isInWatchboard === nextProps.isInWatchboard &&
    Boolean(prevProps.onCoachClick) === Boolean(nextProps.onCoachClick) &&
    prevProps.showQuickAction === nextProps.showQuickAction
  );
});
