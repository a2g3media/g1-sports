import { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Zap, Clock } from 'lucide-react';

// Helper to safely extract team abbreviation from union type
function getTeamAbbr(team: string | { abbr: string; name?: string }): string {
  return typeof team === 'string' ? team : team.abbr;
}

export interface AliveGame {
  id: string;
  gameId?: string;
  sport: string;
  homeTeam: string | { abbr: string; name?: string; };
  awayTeam: string | { abbr: string; name?: string; };
  homeScore: number | null;
  awayScore: number | null;
  status: 'LIVE' | 'SCHEDULED' | 'FINAL' | 'live' | 'scheduled' | 'final';
  period?: string;
  clock?: string;
  startTime?: string;
  venue?: string;
  channel?: string | null;
  spread?: number;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  homeOdds?: number;
  awayOdds?: number;
  publicBetHome?: number;
  publicBetAway?: number;
  lineMovement?: { from: number; to: number };
  coachSignal?: 'edge' | 'watch' | 'noise';
  odds?: {
    spread?: number;
    spreadHome?: number;
    spreadAway?: number;
    openSpread?: number;
    total?: number;
    openTotal?: number;
    overUnder?: number;
    mlHome?: number;
    mlAway?: number;
    moneylineHome?: number;
    moneylineAway?: number;
  };
}

interface AliveGameCardProps {
  game: AliveGame;
  variant?: 'compact' | 'expanded';
  onClick?: () => void;
}

// Team colors for gradient backgrounds
const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  // NFL
  KC: { primary: '#E31837', secondary: '#FFB612' },
  BUF: { primary: '#00338D', secondary: '#C60C30' },
  SF: { primary: '#AA0000', secondary: '#B3995D' },
  PHI: { primary: '#004C54', secondary: '#A5ACAF' },
  DAL: { primary: '#003594', secondary: '#869397' },
  GB: { primary: '#203731', secondary: '#FFB612' },
  MIA: { primary: '#008E97', secondary: '#FC4C02' },
  DET: { primary: '#0076B6', secondary: '#B0B7BC' },
  BAL: { primary: '#241773', secondary: '#9E7C0C' },
  CIN: { primary: '#FB4F14', secondary: '#000000' },
  // NBA
  BOS: { primary: '#007A33', secondary: '#BA9653' },
  LAL: { primary: '#552583', secondary: '#FDB927' },
  GSW: { primary: '#1D428A', secondary: '#FFC72C' },
  MIL: { primary: '#00471B', secondary: '#EEE1C6' },
  DEN: { primary: '#0E2240', secondary: '#FEC524' },
  PHX: { primary: '#1D1160', secondary: '#E56020' },
  // NHL
  NYR: { primary: '#0038A8', secondary: '#CE1126' },
  TOR: { primary: '#00205B', secondary: '#FFFFFF' },
  EDM: { primary: '#041E42', secondary: '#FF4C00' },
  VGK: { primary: '#B4975A', secondary: '#333F42' },
  COL: { primary: '#6F263D', secondary: '#236192' },
  FLA: { primary: '#041E42', secondary: '#C8102E' },
  // MLB
  NYY: { primary: '#003087', secondary: '#FFFFFF' },
  LAD: { primary: '#005A9C', secondary: '#EF3E42' },
  HOU: { primary: '#002D62', secondary: '#EB6E1F' },
  ATL: { primary: '#CE1141', secondary: '#13274F' },
  // Default
  DEFAULT: { primary: '#3B82F6', secondary: '#1E40AF' },
};

const getTeamColors = (team: string) => {
  return TEAM_COLORS[team] || TEAM_COLORS.DEFAULT;
};

const formatSpread = (spread: number | undefined | null): string => {
  if (spread === undefined || spread === null) return '-';
  return spread > 0 ? `+${spread}` : `${spread}`;
};

const formatMoneyline = (ml: number | undefined | null): string => {
  if (ml === undefined || ml === null) return '-';
  return ml > 0 ? `+${ml}` : `${ml}`;
};

const formatStartTime = (startTime: string | undefined): string => {
  if (!startTime) return '';
  try {
    const date = new Date(startTime);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

const SportIcon = ({ sport }: { sport: string }) => {
  const icons: Record<string, string> = {
    NFL: '🏈',
    NBA: '🏀',
    NHL: '🏒',
    MLB: '⚾',
    NCAAF: '🏈',
    NCAAB: '🏀',
    SOCCER: '⚽',
  };
  return <span className="text-lg">{icons[sport] || '🏆'}</span>;
};

export function AliveGameCard({ game, variant = 'expanded', onClick }: AliveGameCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const homeColors = getTeamColors(getTeamAbbr(game.homeTeam));
  const awayColors = getTeamColors(getTeamAbbr(game.awayTeam));
  
  // Normalize status to handle both uppercase and lowercase
  const normalizedStatus = (game.status || '').toLowerCase();
  const isLive = normalizedStatus === 'live';
  const isScheduled = normalizedStatus === 'scheduled';
  const isFinal = normalizedStatus === 'final';
  
  const homeWinning = (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWinning = (game.awayScore ?? 0) > (game.homeScore ?? 0);

  if (variant === 'compact') {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300
          bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl
          border border-white/10 hover:border-white/20
          ${isHovered ? 'scale-[1.02] shadow-2xl shadow-blue-500/20' : 'shadow-lg'}
        `}
      >
        {/* Live pulse indicator */}
        {isLive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
          </div>
        )}

        <div className="p-4">
          {/* Sport badge */}
          <div className="absolute top-3 right-3">
            <SportIcon sport={game.sport} />
          </div>

          {/* Matchup - Vertical layout with clear Away/Home labels */}
          <div className="mt-4 space-y-2">
            {/* Away Team Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
                  style={{ 
                    background: `linear-gradient(135deg, ${awayColors.primary}, ${awayColors.secondary})`
                  }}
                >
                  {getTeamAbbr(game.awayTeam).slice(0, 3)}
                </div>
                <span className="text-[10px] text-slate-500 uppercase">Away</span>
              </div>
              <div className={`text-2xl font-black tabular-nums ${awayWinning ? 'text-white' : 'text-slate-500'}`}>
                {game.awayScore ?? '-'}
              </div>
            </div>
            {/* Home Team Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
                  style={{ 
                    background: `linear-gradient(135deg, ${homeColors.primary}, ${homeColors.secondary})`
                  }}
                >
                  {getTeamAbbr(game.homeTeam).slice(0, 3)}
                </div>
                <span className="text-[10px] text-slate-500 uppercase">Home</span>
              </div>
              <div className={`text-2xl font-black tabular-nums ${homeWinning ? 'text-white' : 'text-slate-500'}`}>
                {game.homeScore ?? '-'}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-2 text-xs text-slate-400">
            {isLive && game.period && game.clock && `${game.period} • ${game.clock}`}
            {isScheduled && formatStartTime(game.startTime)}
            {isFinal && 'Final'}
          </div>
        </div>
      </div>
    );
  }

  // Expanded variant
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-500
        bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-slate-950/95 backdrop-blur-xl
        border border-white/10 hover:border-white/25
        ${isHovered ? 'scale-[1.01] shadow-2xl' : 'shadow-xl'}
      `}
      style={{
        boxShadow: isHovered 
          ? `0 25px 50px -12px ${homeColors.primary}30, 0 0 0 1px ${homeColors.primary}20`
          : undefined
      }}
    >
      {/* Ambient gradient background */}
      <div 
        className="absolute inset-0 opacity-20 transition-opacity duration-500"
        style={{
          background: `
            radial-gradient(ellipse at 0% 0%, ${awayColors.primary}40 0%, transparent 50%),
            radial-gradient(ellipse at 100% 100%, ${homeColors.primary}40 0%, transparent 50%)
          `
        }}
      />

      {/* Live pulse border effect */}
      {isLive && (
        <div 
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: `linear-gradient(90deg, ${homeColors.primary}00, ${homeColors.primary}30, ${homeColors.primary}00)`,
            animation: 'shimmer 2s infinite',
          }}
        />
      )}

      <div className="relative p-5">
        {/* Header: Sport + Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SportIcon sport={game.sport} />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{game.sport}</span>
          </div>

          {isLive ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Live</span>
              {game.period && game.clock && (
                <span className="text-xs text-red-300 ml-1">
                  {game.period} • {game.clock}
                </span>
              )}
            </div>
          ) : isScheduled ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600/30">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-300">{formatStartTime(game.startTime)}</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600/30">
              <span className="text-xs font-medium text-slate-400">Final</span>
            </div>
          )}
        </div>

        {/* Scoreboard - Clean layout: Away badge + score vs Home score + badge */}
        <div className="flex items-center justify-between py-3">
          {/* Away Team */}
          <div className="flex items-center gap-3 flex-1">
            <div className="flex flex-col items-center gap-1">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black"
                style={{ 
                  background: `linear-gradient(135deg, ${awayColors.primary}, ${awayColors.secondary})`,
                  boxShadow: awayWinning ? `0 0 20px ${awayColors.primary}60` : undefined
                }}
              >
                {getTeamAbbr(game.awayTeam).slice(0, 3)}
              </div>
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Away</span>
            </div>
            <div className={`
              text-3xl font-black tabular-nums transition-all duration-300
              ${awayWinning ? 'text-white scale-105' : 'text-slate-500'}
            `}>
              {game.awayScore ?? '-'}
            </div>
          </div>

          {/* VS Divider */}
          <div className="px-4">
            <div className="text-slate-600 text-xl font-medium">vs</div>
          </div>

          {/* Home Team */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className={`
              text-3xl font-black tabular-nums transition-all duration-300
              ${homeWinning ? 'text-white scale-105' : 'text-slate-500'}
            `}>
              {game.homeScore ?? '-'}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black"
                style={{ 
                  background: `linear-gradient(135deg, ${homeColors.primary}, ${homeColors.secondary})`,
                  boxShadow: homeWinning ? `0 0 20px ${homeColors.primary}60` : undefined
                }}
              >
                {getTeamAbbr(game.homeTeam).slice(0, 3)}
              </div>
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Home</span>
            </div>
          </div>
        </div>

        {/* Betting Strip - adds shimmer on hover via CSS class */}
        {(game.spread != null || game.overUnder != null || game.moneylineHome != null) && (
          <div className="mt-4 flex items-center gap-2">
            {/* Spread */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 odds-shimmer transition-all duration-200 hover:border-slate-600/70">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">Spread</div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white">{formatSpread(game.spread)}</span>
                {game.lineMovement && (
                  <span className="animate-line-move">
                    {game.lineMovement.to > game.lineMovement.from ? (
                      <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Over/Under */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 odds-shimmer transition-all duration-200 hover:border-slate-600/70">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">O/U</div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white">{game.overUnder != null ? game.overUnder : '-'}</span>
                {game.lineMovement && (
                  <span className="animate-line-move">
                    <Activity className="w-3.5 h-3.5 text-yellow-400" />
                  </span>
                )}
              </div>
            </div>

            {/* Moneyline */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 odds-shimmer transition-all duration-200 hover:border-slate-600/70">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">ML</div>
              <div className="text-sm font-bold">
                <span className={game.moneylineAway && game.moneylineAway < 0 ? 'text-green-400' : 'text-white'}>
                  {formatMoneyline(game.moneylineAway)}
                </span>
                <span className="text-slate-600 mx-1">/</span>
                <span className={game.moneylineHome && game.moneylineHome < 0 ? 'text-green-400' : 'text-white'}>
                  {formatMoneyline(game.moneylineHome)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Public Betting + Coach Signal */}
        {(game.publicBetHome !== undefined || game.coachSignal) && (
          <div className="mt-3 flex items-center gap-3">
            {/* Public betting bar with expand animation */}
            {game.publicBetHome !== undefined && game.publicBetAway !== undefined && (
              <div className="flex-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span>{game.publicBetAway}%</span>
                  <span className="uppercase tracking-wider">Public</span>
                  <span>{game.publicBetHome}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden flex">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 animate-bar-expand"
                    style={{ width: `${game.publicBetAway}%` }}
                  />
                  <div 
                    className="h-full bg-gradient-to-r from-purple-400 to-purple-500 animate-bar-expand"
                    style={{ width: `${game.publicBetHome}%`, animationDelay: '0.1s' }}
                  />
                </div>
              </div>
            )}

            {/* Coach G Signal */}
            {game.coachSignal && (
              <div className={`
                px-3 py-1.5 rounded-lg flex items-center gap-1.5 border
                ${game.coachSignal === 'edge' 
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
                  : game.coachSignal === 'watch'
                  ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                  : 'bg-slate-700/50 border-slate-600/30 text-slate-400'}
              `}>
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold capitalize">{game.coachSignal}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shimmer animation for live games */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export default AliveGameCard;
