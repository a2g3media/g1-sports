/**
 * OddsCard - Premium betting intelligence card for the Odds Board
 * Mobile-first design: 2 cards across, dark premium styling
 */

import { useNavigate } from 'react-router-dom';
import { Bell, TrendingUp, TrendingDown, Star, MoreVertical } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { getTeamOrCountryLogoUrl } from '@/react-app/lib/teamLogos';
import { getSportAvatarConfig } from '@/react-app/lib/sportAvatars';
import { getMarketPeriodLabels } from '@/react-app/lib/marketPeriodLabels';
import { toGameDetailPath } from '@/react-app/lib/gameRoutes';
import { useState } from 'react';

export interface OddsCardGame {
  id: string;
  gameId?: string;
  sport: string;
  league?: string | null;
  homeTeam: string | { abbr: string; name?: string };
  awayTeam: string | { abbr: string; name?: string };
  homeScore?: number | null;
  awayScore?: number | null;
  status: 'live' | 'scheduled' | 'final' | string;
  period?: string;
  periodLabel?: string;
  clock?: string;
  mlbLiveState?: {
    inningHalf?: string;
    inningNumber?: number;
    inningState?: string;
  } | null;
  startTime?: string;
  channel?: string | null;
  spread?: number;
  spreadOpen?: number; // Opening line for movement tracking
  overUnder?: number;
  overUnderOpen?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  odds?: {
    spread?: number;
    spreadHome?: number;
    spreadOpen?: number;
    total?: number;
    overUnder?: number;
    totalOpen?: number;
    mlHome?: number;
    homeML?: number;
    mlAway?: number;
    awayML?: number;
    spread1H?: number;
    spread1HHome?: number;
    total1H?: number;
    ml1HHome?: number;
    moneyline1HHome?: number;
    ml1HAway?: number;
    moneyline1HAway?: number;
    spread1P?: number;
    total1P?: number;
    ml1PHome?: number;
    ml1PAway?: number;
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
}

interface OddsCardProps {
  game: OddsCardGame;
  isInWatchboard?: boolean;
  onAlertClick?: () => void;
  onWatchboardClick?: () => void;
}

export function OddsCard({ game, isInWatchboard, onAlertClick, onWatchboardClick }: OddsCardProps) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  
  // Extract team info
  const awayCode = typeof game.awayTeam === 'object' ? game.awayTeam.abbr : game.awayTeam;
  const homeCode = typeof game.homeTeam === 'object' ? game.homeTeam.abbr : game.homeTeam;
  const awayName = typeof game.awayTeam === 'object' ? (game.awayTeam.name || game.awayTeam.abbr) : game.awayTeam;
  const homeName = typeof game.homeTeam === 'object' ? (game.homeTeam.name || game.homeTeam.abbr) : game.homeTeam;
  const awayLogo = getTeamOrCountryLogoUrl(awayCode, game.sport, game.league, { teamName: awayName });
  const homeLogo = getTeamOrCountryLogoUrl(homeCode, game.sport, game.league, { teamName: homeName });
  const fallbackLogo = getSportAvatarConfig(String(game.sport || '').toLowerCase()).src;
  
  // Status detection
  const statusLower = (game.status || '').toString().toLowerCase().trim();
  const statusCompact = statusLower.replace(/[\s-]+/g, '_');
  const isLive =
    statusCompact === 'live' ||
    statusCompact === 'in_progress' ||
    statusCompact === 'inprogress' ||
    statusCompact === 'underway' ||
    statusCompact === 'ongoing' ||
    statusCompact.includes('live') ||
    statusCompact.includes('progress');
  const isFinal = statusLower === 'final' || statusLower === 'completed' || statusLower === 'closed';
  
  // Odds values
  const numOrUndefined = (value: unknown): number | undefined => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const spread = numOrUndefined(game.odds?.spread ?? game.odds?.spreadHome ?? game.spread);
  const spreadOpen = numOrUndefined(game.odds?.spreadOpen ?? game.spreadOpen);
  const total = numOrUndefined(game.odds?.total ?? game.odds?.overUnder ?? game.overUnder);
  const totalOpen = numOrUndefined(game.odds?.totalOpen ?? game.overUnderOpen);
  const mlAway = numOrUndefined(game.odds?.mlAway ?? game.odds?.awayML ?? game.moneylineAway);
  const mlHome = numOrUndefined(game.odds?.mlHome ?? game.odds?.homeML ?? game.moneylineHome);
  const sportUpper = String(game.sport || '').toUpperCase();
  const periodSpread = numOrUndefined(
    sportUpper === 'MLB'
      ? (game.odds?.f5?.spread?.home ?? game.odds?.spread1H ?? game.odds?.spread1HHome)
      : sportUpper === 'NHL'
        ? (game.odds?.spread1P ?? game.odds?.spread1H ?? game.odds?.spread1HHome ?? game.odds?.f5?.spread?.home)
        : (game.odds?.spread1H ?? game.odds?.spread1HHome ?? game.odds?.f5?.spread?.home)
  );
  const rawPeriodTotal = numOrUndefined(
    sportUpper === 'MLB'
      ? (game.odds?.f5?.total ?? game.odds?.total1H)
      : sportUpper === 'NHL'
        ? (game.odds?.total1P ?? game.odds?.total1H ?? game.odds?.f5?.total)
        : (game.odds?.total1H ?? game.odds?.f5?.total)
  );
  const rawPeriodMlAway = numOrUndefined(
    sportUpper === 'MLB'
      ? (game.odds?.f5?.moneyline?.away ?? game.odds?.ml1HAway ?? game.odds?.moneyline1HAway)
      : sportUpper === 'NHL'
        ? (game.odds?.ml1PAway ?? game.odds?.ml1HAway ?? game.odds?.moneyline1HAway ?? game.odds?.f5?.moneyline?.away)
        : (game.odds?.ml1HAway ?? game.odds?.moneyline1HAway ?? game.odds?.f5?.moneyline?.away)
  );
  const rawPeriodMlHome = numOrUndefined(
    sportUpper === 'MLB'
      ? (game.odds?.f5?.moneyline?.home ?? game.odds?.ml1HHome ?? game.odds?.moneyline1HHome)
      : sportUpper === 'NHL'
        ? (game.odds?.ml1PHome ?? game.odds?.ml1HHome ?? game.odds?.moneyline1HHome ?? game.odds?.f5?.moneyline?.home)
        : (game.odds?.ml1HHome ?? game.odds?.moneyline1HHome ?? game.odds?.f5?.moneyline?.home)
  );
  const periodTotal = rawPeriodTotal === 0 ? undefined : rawPeriodTotal;
  const periodMlAway = rawPeriodMlAway === 0 ? undefined : rawPeriodMlAway;
  const periodMlHome = rawPeriodMlHome === 0 ? undefined : rawPeriodMlHome;
  const hasAnyPeriod = periodSpread != null || periodTotal != null || periodMlAway != null || periodMlHome != null;
  const periodLabels = getMarketPeriodLabels(game.sport);
  
  // Movement detection (compare current to opening)
  const spreadMoved = spread !== undefined && spreadOpen !== undefined && spread !== spreadOpen;
  const spreadMovedUp = spreadMoved && spread! < spreadOpen!; // Line moved toward favorite
  const totalMoved = total !== undefined && totalOpen !== undefined && total !== totalOpen;
  const totalMovedUp = totalMoved && total! > totalOpen!;
  const hasScores = game.homeScore != null && game.awayScore != null;
  const awayWinning = hasScores && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWinning = hasScores && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  
  // Format time
  const gameTime = game.startTime 
    ? new Date(game.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) 
    : '';
  const isMlb = sportUpper === 'MLB';
  const mlbLiveLabel = (() => {
    if (!isLive || !isMlb) return '';
    const normalize = (value: string): string =>
      value
        .replace(/\bbottom\b/i, 'Bot')
        .replace(/\btop\b/i, 'Top')
        .replace(/\bmiddle\b/i, 'Mid')
        .replace(/\bend\b/i, 'End')
        .replace(/\s+/g, ' ')
        .trim();
    const label = String(game.periodLabel || '').trim();
    if (label) return normalize(label);
    const state = String(game.mlbLiveState?.inningState || '').trim();
    if (state) return normalize(state);
    const halfRaw = String(game.mlbLiveState?.inningHalf || '').trim().toLowerCase();
    const inning = Number(game.mlbLiveState?.inningNumber ?? game.period);
    if (Number.isFinite(inning)) {
      const half = halfRaw.startsWith('top') ? 'Top' : halfRaw.startsWith('bottom') ? 'Bot' : '';
      const suffix = inning % 10 === 1 && inning % 100 !== 11 ? 'st'
        : inning % 10 === 2 && inning % 100 !== 12 ? 'nd'
        : inning % 10 === 3 && inning % 100 !== 13 ? 'rd'
        : 'th';
      return `${half ? `${half} ` : ''}${inning}${suffix}`.trim();
    }
    return '';
  })();
  const liveMetaLabel = isMlb
    ? mlbLiveLabel
    : [game.period, game.clock].filter(Boolean).join(' • ');

  const formatSpread = (value: number | undefined): string => {
    if (value == null) return "—";
    const snapped = Math.round(value * 2) / 2;
    if (Object.is(snapped, -0) || snapped === 0) return "PK";
    return snapped > 0 ? `+${snapped}` : `${snapped}`;
  };

  const formatMoneyline = (value: number | undefined): string => {
    if (value == null) return "—";
    const rounded = Math.round(value);
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  };
  
  const handleClick = () => {
    const gameId = game.gameId || game.id;
    const sport = (game.sport || 'nba').toLowerCase();
    navigate(toGameDetailPath(sport, gameId));
  };
  
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };
  
  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative w-full overflow-hidden rounded-[14px] border text-left transition-all duration-200 cursor-pointer group",
        "min-h-[136px] border-white/[0.06] bg-[#121821] shadow-[0_12px_26px_rgba(0,0,0,0.32)]",
        "hover:-translate-y-0.5 hover:border-cyan-400/25 hover:bg-[#16202B] hover:shadow-[0_18px_34px_rgba(0,0,0,0.36)] active:scale-[0.99]",
        isLive && "ring-1 ring-red-500/30",
        isInWatchboard && "ring-1 ring-cyan-400/35"
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/15" />
      <div className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-cyan-400/24" />
      {/* Live indicator glow */}
      {isLive && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent" />
      )}
      
      {/* Watchboard indicator */}
      {isInWatchboard && (
        <div className="absolute top-2 right-2 z-10">
          <Star className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
        </div>
      )}
      
      <div className="relative z-10 p-3.5">
        {/* Header: Status + Actions */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            {/* Status Badge */}
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-500/10 px-2.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-300">Live</span>
              </span>
            ) : isFinal ? (
              <span className="inline-flex rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                Final
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-cyan-200">
                {gameTime}
              </span>
            )}
            
            {/* Period/Clock for live */}
            {isLive && liveMetaLabel && (
              <span
                className={cn(
                  "text-[10px]",
                  isMlb && mlbLiveLabel
                    ? "rounded-full border border-red-400/35 bg-red-500/12 px-2 py-0.5 text-[10px] font-semibold tracking-[0.02em] text-red-200"
                    : "text-slate-500"
                )}
              >
                {liveMetaLabel}
              </span>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAlertClick?.(); }}
              className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-500 hover:text-cyan-400 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMenuClick}
              className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-500 hover:text-white transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        
        {/* Matchup rows */}
        <div className="space-y-1.5 mb-3">
          {/* Away */}
          <div className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.05] bg-gradient-to-r from-[#141C26] to-[#121821] px-3 py-2">
            <img 
              src={awayLogo ?? undefined} 
              alt="" 
              className="h-[26px] w-[26px] object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallbackApplied === 'true') {
                  img.style.opacity = '0';
                  return;
                }
                img.dataset.fallbackApplied = 'true';
                img.src = fallbackLogo;
              }}
            />
            <div className="min-w-0 flex-1">
              <div className={cn(
                "truncate text-xs font-semibold",
                isFinal && awayWinning ? "text-white" : "text-slate-200"
              )}>
                {awayCode}
              </div>
              <div className="truncate text-[10px] tracking-[0.01em] text-slate-500">{awayName}</div>
            </div>
            {hasScores && (isLive || isFinal) && (
              <span className={cn(
                "min-w-[24px] text-right text-sm font-bold tabular-nums",
                isFinal && awayWinning ? "text-white" : isLive && awayWinning ? "text-emerald-400" : "text-slate-400"
              )}>
                {game.awayScore ?? 0}
              </span>
            )}
          </div>
          {/* Home */}
          <div className="mt-1 flex items-center gap-2.5 rounded-[10px] border border-white/[0.05] bg-gradient-to-r from-[#17212D] to-[#121821] px-3 py-2">
            <img 
              src={homeLogo ?? undefined} 
              alt="" 
              className="h-[26px] w-[26px] object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallbackApplied === 'true') {
                  img.style.opacity = '0';
                  return;
                }
                img.dataset.fallbackApplied = 'true';
                img.src = fallbackLogo;
              }}
            />
            <div className="min-w-0 flex-1">
              <div className={cn(
                "truncate text-xs font-semibold",
                isFinal && homeWinning ? "text-white" : "text-slate-200"
              )}>
                {homeCode}
              </div>
              <div className="truncate text-[10px] tracking-[0.01em] text-slate-500">{homeName}</div>
            </div>
            {hasScores && (isLive || isFinal) && (
              <span className={cn(
                "min-w-[24px] text-right text-sm font-bold tabular-nums",
                isFinal && homeWinning ? "text-white" : isLive && homeWinning ? "text-emerald-400" : "text-slate-400"
              )}>
                {game.homeScore ?? 0}
              </span>
            )}
          </div>
        </div>
        
        {/* Markets: stat block parity */}
        <div className="mt-2.5 border-t border-white/[0.06] pt-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[10px] border border-white/[0.05] bg-[#0F141B] px-2 py-1.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Spread</div>
              <div className="mt-0.5 text-[12px] font-mono font-semibold text-cyan-300">
                {`${homeCode} ${formatSpread(spread)}`}
              </div>
              {spreadMoved && (
                <div className="mt-0.5 inline-flex items-center gap-1 text-[9px] text-slate-400">
                  {spreadMovedUp ? <TrendingUp className="h-2.5 w-2.5 text-emerald-400" /> : <TrendingDown className="h-2.5 w-2.5 text-red-400" />}
                  <span>{formatSpread(spreadOpen)} {"->"} {formatSpread(spread)}</span>
                </div>
              )}
            </div>
            <div className="rounded-[10px] border border-white/[0.05] bg-[#0F141B] px-2 py-1.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Total</div>
              <div className="mt-0.5 text-[12px] font-mono font-semibold text-emerald-300">
                {total != null ? total : "—"}
              </div>
              {totalMoved && (
                <div className="mt-0.5 inline-flex items-center gap-1 text-[9px] text-slate-400">
                  {totalMovedUp ? <TrendingUp className="h-2.5 w-2.5 text-emerald-400" /> : <TrendingDown className="h-2.5 w-2.5 text-red-400" />}
                  <span>{totalOpen ?? "—"} {"->"} {total ?? "—"}</span>
                </div>
              )}
            </div>
            <div className="rounded-[10px] border border-white/[0.05] bg-[#0F141B] px-2 py-1.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Moneyline</div>
              <div className="mt-0.5 text-[11px] font-mono font-semibold text-amber-300">
                {`${formatMoneyline(mlAway)} / ${formatMoneyline(mlHome)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Sport-specific derivative lines */}
        <div className="mt-1.5 flex items-center justify-between rounded-[10px] border border-violet-400/25 bg-violet-500/10 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-violet-200/90">{periodLabels.short}</div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="text-center min-w-[58px]">
              <div className="text-slate-500">Spread</div>
              <div className="font-semibold text-violet-100">
                {periodSpread != null ? `${homeCode} ${formatSpread(periodSpread)}` : "—"}
              </div>
            </div>
            <div className="text-center min-w-[40px]">
              <div className="text-slate-500">Total</div>
              <div className="font-semibold text-violet-100">{periodTotal != null ? periodTotal : "—"}</div>
            </div>
            <div className="text-center min-w-[84px]">
              <div className="text-slate-500">ML</div>
              <div className="font-semibold text-violet-100">
                {hasAnyPeriod
                  ? `${formatMoneyline(periodMlAway)} / ${formatMoneyline(periodMlHome)}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Overflow Menu */}
      {showMenu && (
        <div 
          className="absolute bottom-full right-2 mb-1 w-36 bg-slate-800/95 backdrop-blur-md rounded-lg border border-slate-700/50 shadow-xl z-20 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onWatchboardClick?.(); setShowMenu(false); }}
            className="w-full px-3 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700/60 transition-colors flex items-center gap-2"
          >
            <Star className="w-3.5 h-3.5" />
            Add to Watchboard
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAlertClick?.(); setShowMenu(false); }}
            className="w-full px-3 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-700/60 transition-colors flex items-center gap-2 border-t border-slate-700/30"
          >
            <Bell className="w-3.5 h-3.5" />
            Set Alert
          </button>
        </div>
      )}
      
      {/* Click outside to close menu */}
      {showMenu && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
        />
      )}
    </div>
  );
}

export default OddsCard;
