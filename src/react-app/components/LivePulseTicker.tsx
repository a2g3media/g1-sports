/**
 * LivePulseTicker - Horizontal scrolling live scores ticker
 * Shows live/recent games with continuous scroll animation
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/react-app/lib/utils';
import { toGameDetailPath } from '@/react-app/lib/gameRoutes';
import type { ApprovedScoreCardGame } from '@/react-app/components/ApprovedScoreCard';

interface LivePulseTickerProps {
  games: ApprovedScoreCardGame[];
  className?: string;
  onLabelClick?: () => void;
}

// Helper to get team abbreviation
function getTeamAbbr(team: string | { abbr?: string; name?: string } | null | undefined): string {
  if (!team) return '???';
  if (typeof team === 'string') return team;
  return team.abbr || team.name?.slice(0, 3).toUpperCase() || '???';
}

// Helper to format score display
function formatScore(score: number | null | undefined): string {
  return score != null ? String(score) : '-';
}

export function LivePulseTicker({ games, className, onLabelClick }: LivePulseTickerProps) {
  const navigate = useNavigate();
  
  // Filter to live and recent final games (for context)
  const tickerGames = useMemo(() => {
    const live = games.filter(g => g.status === 'live');
    const finals = games.filter(g => g.status === 'final').slice(0, 5); // Last 5 finals
    // Prioritize live games, then recent finals
    return [...live, ...finals];
  }, [games]);
  
  // Don't render if no games to show
  if (tickerGames.length === 0) return null;
  
  const handleGameClick = (game: ApprovedScoreCardGame) => {
    const sport = (game.sport || 'nba').toLowerCase();
    const gameId = game.gameId || game.id;
    navigate(toGameDetailPath(sport, gameId));
  };
  
  // Duplicate items for seamless loop
  const items = [...tickerGames, ...tickerGames];
  
  return (
    <div className={cn(
      "relative w-full overflow-hidden bg-slate-950/80 border-b border-slate-800/50",
      className
    )}>
      {/* Label - clickable to scroll to live section */}
      <button
        onClick={onLabelClick}
        className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-3 pr-4 bg-gradient-to-r from-slate-950 via-slate-950 to-transparent hover:from-slate-900 hover:via-slate-900 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 group-hover:text-red-300">Live</span>
        </div>
      </button>
      
      {/* Scrolling content */}
      <div className="flex animate-ticker py-2 pl-20">
        {items.map((game, idx) => {
          const isLive = game.status === 'live';
          const homeAbbr = getTeamAbbr(game.homeTeam);
          const awayAbbr = getTeamAbbr(game.awayTeam);
          const homeScore = formatScore(game.homeScore);
          const awayScore = formatScore(game.awayScore);
          
          // Determine winner for finals
          const homeWins = game.status === 'final' && (game.homeScore ?? 0) > (game.awayScore ?? 0);
          const awayWins = game.status === 'final' && (game.awayScore ?? 0) > (game.homeScore ?? 0);
          
          return (
            <button
              key={`${game.id}-${idx}`}
              onClick={() => handleGameClick(game)}
              className={cn(
                "flex items-center gap-2 px-4 py-1 mx-1 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                "hover:bg-slate-800/60 active:scale-95",
                isLive 
                  ? "bg-red-500/10 border border-red-500/20 text-white" 
                  : "bg-slate-800/30 border border-slate-700/30 text-slate-400"
              )}
            >
              {/* Away team */}
              <span className={cn(
                "font-semibold",
                awayWins ? "text-emerald-400" : isLive ? "text-white" : "text-slate-400"
              )}>
                {awayAbbr}
              </span>
              
              {/* Score */}
              <span className={cn(
                "font-bold tabular-nums",
                isLive ? "text-white" : "text-slate-500"
              )}>
                {awayScore}
              </span>
              
              <span className="text-slate-600">-</span>
              
              <span className={cn(
                "font-bold tabular-nums",
                isLive ? "text-white" : "text-slate-500"
              )}>
                {homeScore}
              </span>
              
              {/* Home team */}
              <span className={cn(
                "font-semibold",
                homeWins ? "text-emerald-400" : isLive ? "text-white" : "text-slate-400"
              )}>
                {homeAbbr}
              </span>
              
              {/* Status badge */}
              {isLive ? (
                <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-500/80 text-white">
                  {game.period || game.clock || 'LIVE'}
                </span>
              ) : (
                <span className="ml-1 text-[9px] font-medium uppercase text-slate-500">
                  Final
                </span>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
    </div>
  );
}

export default LivePulseTicker;
