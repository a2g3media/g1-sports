/**
 * OddsCard - Premium betting intelligence card for the Odds Board
 * Mobile-first design: 2 cards across, dark premium styling
 */

import { useNavigate } from 'react-router-dom';
import { Bell, TrendingUp, TrendingDown, Star, MoreVertical } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { getTeamOrCountryLogoUrl } from '@/react-app/lib/teamLogos';
import { getMarketPeriodLabels } from '@/react-app/lib/marketPeriodLabels';
import { toOddsGamePath } from '@/react-app/lib/gameRoutes';
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
  clock?: string;
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
    spreadOpen?: number;
    total?: number;
    totalOpen?: number;
    mlHome?: number;
    mlAway?: number;
    spread1H?: number;
    total1H?: number;
    ml1HHome?: number;
    ml1HAway?: number;
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
  const awayLogo = getTeamOrCountryLogoUrl(awayCode, game.sport, game.league);
  const homeLogo = getTeamOrCountryLogoUrl(homeCode, game.sport, game.league);
  
  // Status detection
  const statusLower = (game.status || '').toString().toLowerCase();
  const isLive = statusLower === 'live' || statusLower === 'in_progress' || statusLower === 'inprogress';
  const isFinal = statusLower === 'final' || statusLower === 'completed' || statusLower === 'closed';
  
  // Odds values
  const spread = game.odds?.spread ?? game.spread;
  const spreadOpen = game.odds?.spreadOpen ?? game.spreadOpen;
  const total = game.odds?.total ?? game.overUnder;
  const totalOpen = game.odds?.totalOpen ?? game.overUnderOpen;
  const mlAway = game.odds?.mlAway ?? game.moneylineAway;
  const mlHome = game.odds?.mlHome ?? game.moneylineHome;
  const spread1H = game.odds?.spread1H;
  const total1H = game.odds?.total1H;
  const ml1HAway = game.odds?.ml1HAway;
  const ml1HHome = game.odds?.ml1HHome;
  const hasAny1H = spread1H !== undefined || total1H !== undefined || ml1HAway !== undefined || ml1HHome !== undefined;
  const periodLabels = getMarketPeriodLabels(game.sport);
  
  // Movement detection (compare current to opening)
  const spreadMoved = spread !== undefined && spreadOpen !== undefined && spread !== spreadOpen;
  const spreadMovedUp = spreadMoved && spread! < spreadOpen!; // Line moved toward favorite
  const totalMoved = total !== undefined && totalOpen !== undefined && total !== totalOpen;
  const totalMovedUp = totalMoved && total! > totalOpen!;
  
  // Format time
  const gameTime = game.startTime 
    ? new Date(game.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) 
    : '';
  
  const handleClick = () => {
    const gameId = game.gameId || game.id;
    const sport = (game.sport || 'nba').toLowerCase();
    navigate(toOddsGamePath(sport, gameId));
  };
  
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };
  
  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative bg-slate-900/80 rounded-xl border transition-all cursor-pointer overflow-hidden group",
        isLive 
          ? "border-red-500/40 shadow-lg shadow-red-500/10" 
          : "border-slate-700/50 hover:border-slate-600/60",
        "hover:bg-slate-800/90 active:scale-[0.98]"
      )}
    >
      {/* Live indicator glow */}
      {isLive && (
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none" />
      )}
      
      {/* Watchboard indicator */}
      {isInWatchboard && (
        <div className="absolute top-2 right-2 z-10">
          <Star className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
        </div>
      )}
      
      <div className="p-3">
        {/* Header: Status + Actions */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            {/* Status Badge */}
            {isLive ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase">Live</span>
              </span>
            ) : isFinal ? (
              <span className="px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500 text-[10px] font-bold uppercase">
                Final
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">{gameTime}</span>
            )}
            
            {/* Period/Clock for live */}
            {isLive && game.period && (
              <span className="text-[10px] text-slate-500">{game.period} {game.clock && `• ${game.clock}`}</span>
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
        
        {/* Matchup: Away @ Home with logos */}
        <div className="space-y-1.5 mb-3">
          {/* Away */}
          <div className="flex items-center gap-2">
            <img 
              src={awayLogo ?? undefined} 
              alt="" 
              className="w-5 h-5 object-contain"
              onError={(e) => { e.currentTarget.style.opacity = '0'; }}
            />
            <span className="flex-1 text-xs font-semibold text-slate-200 truncate">{awayCode}</span>
            {(isLive || isFinal) && (
              <span className={cn(
                "text-sm font-bold tabular-nums",
                isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0) ? "text-emerald-400" : "text-slate-400"
              )}>
                {game.awayScore ?? 0}
              </span>
            )}
          </div>
          {/* Home */}
          <div className="flex items-center gap-2">
            <img 
              src={homeLogo ?? undefined} 
              alt="" 
              className="w-5 h-5 object-contain"
              onError={(e) => { e.currentTarget.style.opacity = '0'; }}
            />
            <span className="flex-1 text-xs font-semibold text-slate-200 truncate">{homeCode}</span>
            {(isLive || isFinal) && (
              <span className={cn(
                "text-sm font-bold tabular-nums",
                isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0) ? "text-emerald-400" : "text-slate-400"
              )}>
                {game.homeScore ?? 0}
              </span>
            )}
          </div>
        </div>
        
        {/* Markets: Spread, Total, Moneyline */}
        <div className="space-y-1.5">
          {/* Spread */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Spread</span>
            <div className="flex items-center gap-1">
              {spread !== undefined ? (
                <>
                  <span className="text-xs font-bold text-cyan-300 tabular-nums">
                    {homeCode} {spread > 0 ? `+${spread}` : spread}
                  </span>
                  {spreadMoved && (
                    spreadMovedUp 
                      ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                      : <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                </>
              ) : (
                <span className="text-[10px] text-slate-600">—</span>
              )}
            </div>
          </div>
          
          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Total</span>
            <div className="flex items-center gap-1">
              {total !== undefined ? (
                <>
                  <span className="text-xs font-bold text-amber-300 tabular-nums">{total}</span>
                  {totalMoved && (
                    totalMovedUp 
                      ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                      : <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                </>
              ) : (
                <span className="text-[10px] text-slate-600">—</span>
              )}
            </div>
          </div>
          
          {/* Moneyline - both teams */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-medium uppercase">ML</span>
            {mlAway || mlHome ? (
              <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
                <span className={cn(
                  mlAway && mlAway < 0 ? "text-emerald-300" : "text-slate-400"
                )}>
                  {mlAway ? (mlAway > 0 ? `+${mlAway}` : mlAway) : '—'}
                </span>
                <span className="text-slate-600">/</span>
                <span className={cn(
                  mlHome && mlHome < 0 ? "text-emerald-300" : "text-slate-400"
                )}>
                  {mlHome ? (mlHome > 0 ? `+${mlHome}` : mlHome) : '—'}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-slate-600">—</span>
            )}
          </div>
        </div>

        {/* Sport-specific derivative lines */}
        <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-2 py-1.5">
          <div className="mb-1 text-[9px] uppercase tracking-wider text-violet-300/80">{periodLabels.lines}</div>
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <div className="text-center">
              <div className="text-slate-500">Spread</div>
              <div className="font-semibold text-violet-200">
                {spread1H !== undefined ? `${homeCode} ${spread1H > 0 ? `+${spread1H}` : spread1H}` : "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">Total</div>
              <div className="font-semibold text-violet-200">{total1H !== undefined ? total1H : "—"}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">ML</div>
              <div className="font-semibold text-violet-200">
                {hasAny1H
                  ? `${ml1HAway != null ? (ml1HAway > 0 ? `+${ml1HAway}` : ml1HAway) : "—"} / ${ml1HHome != null ? (ml1HHome > 0 ? `+${ml1HHome}` : ml1HHome) : "—"}`
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
