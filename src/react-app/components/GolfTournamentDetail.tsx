/**
 * Premium Golf Tournament Detail Component
 * ESPN-style PGA leaderboard with round breakdowns and player stats
 */

import { useState, useEffect, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Loader2, Trophy, MapPin, Calendar, ArrowLeft,
  ChevronDown, ChevronUp, Flag
} from 'lucide-react';
import { Badge } from '@/react-app/components/ui/badge';
import { cn } from '@/react-app/lib/utils';

// Cinematic Background for Golf page
const CinematicBackground = memo(function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient - lush green golf course feel */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(160,25%,6%)] via-[hsl(160,20%,9%)] to-[hsl(165,18%,12%)]" />
      
      {/* Golf green accent glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/15 via-transparent to-amber-900/5" />
      
      {/* Subtle sky gradient at top */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-sky-900/10 to-transparent" />
      
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />
    </div>
  );
});

// Types
interface PlayerRound {
  round: number;
  score: number | null;
  strokes: number | null;
  par: number | null;
  birdies: number | null;
  bogeys: number | null;
}

interface LeaderboardPlayer {
  playerId: number;
  playerTournamentId: number;
  name: string;
  rank: number | null;
  country: string;
  totalScore: number;
  totalStrokes: number;
  totalThrough: string | null;
  earnings: number | null;
  fedExPoints: number | null;
  rounds: PlayerRound[];
  isWithdrawn: boolean;
  madeCut: boolean | null;
  teeTime: string | null;
  streak: string | null;
  birdies: number;
  pars: number;
  bogeys: number;
  eagles: number;
  doubleEagles: number;
  doubleBogeys: number;
}

interface Tournament {
  tournamentId: number;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
  location: string;
  purse: number;
  par: number;
  yards: number;
  status: string;
  isOver?: boolean;
  currentRound?: number;
}

interface TournamentData {
  tournament: Tournament;
  leaderboard: LeaderboardPlayer[];
  cutLine?: number;
  totalPlayers: number;
  message?: string;
}

interface GolfTournamentDetailProps {
  tournamentId: string;
}

// Country code to flag emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  'USA': '🇺🇸', 'US': '🇺🇸', 'United States': '🇺🇸',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Northern Ireland': '🇬🇧', 'NIR': '🇬🇧',
  'Ireland': '🇮🇪', 'IRL': '🇮🇪',
  'Spain': '🇪🇸', 'ESP': '🇪🇸',
  'South Korea': '🇰🇷', 'KOR': '🇰🇷', 'Korea': '🇰🇷',
  'Japan': '🇯🇵', 'JPN': '🇯🇵',
  'Australia': '🇦🇺', 'AUS': '🇦🇺',
  'Canada': '🇨🇦', 'CAN': '🇨🇦',
  'South Africa': '🇿🇦', 'RSA': '🇿🇦', 'ZAF': '🇿🇦',
  'Sweden': '🇸🇪', 'SWE': '🇸🇪',
  'Norway': '🇳🇴', 'NOR': '🇳🇴',
  'Denmark': '🇩🇰', 'DEN': '🇩🇰',
  'Germany': '🇩🇪', 'GER': '🇩🇪',
  'France': '🇫🇷', 'FRA': '🇫🇷',
  'Italy': '🇮🇹', 'ITA': '🇮🇹',
  'Belgium': '🇧🇪', 'BEL': '🇧🇪',
  'Netherlands': '🇳🇱', 'NED': '🇳🇱',
  'Mexico': '🇲🇽', 'MEX': '🇲🇽',
  'Argentina': '🇦🇷', 'ARG': '🇦🇷',
  'Colombia': '🇨🇴', 'COL': '🇨🇴',
  'Chile': '🇨🇱', 'CHI': '🇨🇱',
  'China': '🇨🇳', 'CHN': '🇨🇳',
  'India': '🇮🇳', 'IND': '🇮🇳',
  'Thailand': '🇹🇭', 'THA': '🇹🇭',
  'Philippines': '🇵🇭', 'PHI': '🇵🇭',
  'New Zealand': '🇳🇿', 'NZL': '🇳🇿',
  'Zimbabwe': '🇿🇼', 'ZIM': '🇿🇼',
  'Fiji': '🇫🇯', 'FIJ': '🇫🇯',
};

// Premium Glass Card
const GlassCard = memo(function GlassCard({ 
  children, 
  className,
  variant = 'default'
}: { 
  children: React.ReactNode; 
  className?: string;
  variant?: 'default' | 'leader' | 'header';
}) {
  const variants = {
    default: 'ring-white/[0.06]',
    'leader': 'ring-emerald-500/30 shadow-lg shadow-emerald-500/5',
    'header': 'ring-amber-500/20',
  };
  
  return (
    <div className={cn(
      "relative rounded-2xl overflow-hidden ring-1",
      variants[variant],
      className
    )}>
      <div className="absolute inset-0 bg-[hsl(160,18%,8%)]" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
});

// Format golf score (e.g., -5, E, +3)
function formatScore(score: number | null): string {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

// Score color based on relative to par
function getScoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score < 0) return 'text-emerald-400';
  if (score === 0) return 'text-slate-300';
  return 'text-rose-400';
}

// Format currency
function formatMoney(amount: number | null): string {
  if (amount === null || amount === undefined) return '--';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

// Round Score Badge
const RoundBadge = memo(function RoundBadge({ 
  round, 
  score,
  strokes 
}: { 
  round: number; 
  score: number | null;
  strokes: number | null;
}) {
  return (
    <div className="flex flex-col items-center min-w-[40px]">
      <span className="text-[10px] text-slate-500 mb-0.5">R{round}</span>
      <span className={cn(
        "text-sm font-semibold tabular-nums",
        getScoreColor(score)
      )}>
        {strokes !== null ? strokes : '--'}
      </span>
    </div>
  );
});

// Player Row Component
const PlayerRow = memo(function PlayerRow({
  player,
  position: _position,
  expanded,
  onToggle,
  isLeader,
}: {
  player: LeaderboardPlayer;
  position: number;
  expanded: boolean;
  onToggle: () => void;
  isLeader: boolean;
}) {
  const flag = COUNTRY_FLAGS[player.country] || '🏳️';
  
  return (
    <div className={cn(
      "transition-all duration-200",
      isLeader && "bg-emerald-950/20",
    )}>
      {/* Main Row */}
      <div 
        className={cn(
          "flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors",
          player.isWithdrawn && "opacity-50"
        )}
        onClick={onToggle}
      >
        {/* Position */}
        <div className={cn(
          "w-10 sm:w-12 text-center font-bold text-lg tabular-nums",
          isLeader ? "text-amber-400" : "text-slate-400"
        )}>
          {player.rank || '--'}
        </div>
        
        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg sm:text-xl">{flag}</span>
            <span className="font-semibold text-white truncate">
              {player.name}
            </span>
            {player.isWithdrawn && (
              <Badge variant="outline" className="text-xs border-rose-500/30 text-rose-400">
                WD
              </Badge>
            )}
            {player.madeCut === false && (
              <Badge variant="outline" className="text-xs border-slate-500/30 text-slate-500">
                CUT
              </Badge>
            )}
          </div>
          {/* Mobile: Show rounds inline */}
          <div className="flex gap-2 mt-1 sm:hidden text-xs text-slate-500">
            {player.rounds.slice(0, 4).map((r) => (
              <span key={r.round} className={getScoreColor(r.score)}>
                R{r.round}: {r.strokes || '--'}
              </span>
            ))}
          </div>
        </div>
        
        {/* Rounds (desktop) */}
        <div className="hidden sm:flex items-center gap-1">
          {[1, 2, 3, 4].map((roundNum) => {
            const round = player.rounds.find(r => r.round === roundNum);
            return (
              <RoundBadge 
                key={roundNum}
                round={roundNum}
                score={round?.score ?? null}
                strokes={round?.strokes ?? null}
              />
            );
          })}
        </div>
        
        {/* Total Score */}
        <div className="flex flex-col items-end min-w-[50px]">
          <span className={cn(
            "text-xl font-bold tabular-nums",
            getScoreColor(player.totalScore)
          )}>
            {formatScore(player.totalScore)}
          </span>
          <span className="text-xs text-slate-500">
            {player.totalStrokes || '--'}
          </span>
        </div>
        
        {/* Expand indicator */}
        <div className="w-6 text-slate-500">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 bg-black/20 border-t border-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4">
            {/* Stats */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Scoring</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Eagles</span>
                  <span className="text-amber-400 font-medium">{player.eagles || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Birdies</span>
                  <span className="text-emerald-400 font-medium">{player.birdies || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Pars</span>
                  <span className="text-slate-300 font-medium">{player.pars || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Bogeys</span>
                  <span className="text-rose-400 font-medium">{player.bogeys || 0}</span>
                </div>
              </div>
            </div>
            
            {/* Round Details */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Rounds</h4>
              <div className="space-y-1.5">
                {player.rounds.map((round) => (
                  <div key={round.round} className="flex justify-between text-sm">
                    <span className="text-slate-400">Round {round.round}</span>
                    <span className={cn("font-medium", getScoreColor(round.score))}>
                      {round.strokes || '--'} ({formatScore(round.score)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Thru & Status */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Thru</span>
                  <span className="text-white font-medium">{player.totalThrough || 'F'}</span>
                </div>
                {player.teeTime && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Tee Time</span>
                    <span className="text-white font-medium">
                      {new Date(player.teeTime).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                )}
                {player.streak && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Streak</span>
                    <span className="text-emerald-400 font-medium">{player.streak}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Earnings & Points */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Earnings</h4>
              <div className="space-y-1.5">
                {player.earnings !== null && player.earnings > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Prize</span>
                    <span className="text-emerald-400 font-medium">{formatMoney(player.earnings)}</span>
                  </div>
                )}
                {player.fedExPoints !== null && player.fedExPoints > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">FedEx Pts</span>
                    <span className="text-sky-400 font-medium">{player.fedExPoints?.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Tournament Header
const TournamentHeader = memo(function TournamentHeader({
  tournament,
  totalPlayers,
}: {
  tournament: Tournament;
  totalPlayers: number;
}) {
  const startDate = new Date(tournament.startDate);
  const endDate = tournament.endDate ? new Date(tournament.endDate) : null;
  
  const formatDateRange = () => {
    if (!endDate) return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    if (startMonth === endMonth) {
      return `${startMonth} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`;
    }
    return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${endDate.getFullYear()}`;
  };
  
  return (
    <GlassCard variant="header" className="mb-6">
      <div className="p-6">
        {/* Tournament Title */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {tournament.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>{tournament.venue}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{formatDateRange()}</span>
              </div>
            </div>
          </div>
          
          {/* Status Badge */}
          <Badge className={cn(
            "text-sm px-3 py-1",
            tournament.status === 'in_progress' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
            tournament.status === 'final' && "bg-slate-500/20 text-slate-300 border-slate-500/30",
            tournament.status === 'scheduled' && "bg-sky-500/20 text-sky-400 border-sky-500/30",
          )}>
            {tournament.status === 'in_progress' ? 'LIVE' : 
             tournament.status === 'final' ? 'FINAL' : 'UPCOMING'}
          </Badge>
        </div>
        
        {/* Tournament Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/10">
          <div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Purse</span>
            <p className="text-lg font-semibold text-emerald-400">{formatMoney(tournament.purse)}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Par</span>
            <p className="text-lg font-semibold text-white">{tournament.par || '--'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Yards</span>
            <p className="text-lg font-semibold text-white">{tournament.yards?.toLocaleString() || '--'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Field</span>
            <p className="text-lg font-semibold text-white">{totalPlayers} players</p>
          </div>
        </div>
        
        {tournament.currentRound && tournament.currentRound > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Current Round</span>
            <p className="text-lg font-semibold text-amber-400">Round {tournament.currentRound}</p>
          </div>
        )}
      </div>
    </GlassCard>
  );
});

// Main Component
export default function GolfTournamentDetail({ tournamentId }: GolfTournamentDetailProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [showTopN, setShowTopN] = useState(30);
  
  // Fetch tournament data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Support SportsRadar-style ID prefixes
        const cleanId = tournamentId.replace('sr_golf_', '');
        const res = await fetch(`/api/sports-data/sportsradar/golf/leaderboard/${cleanId}`);
        
        if (!res.ok) {
          throw new Error(`Failed to load tournament: ${res.status}`);
        }
        
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('[GolfTournamentDetail] Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load tournament');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Refresh every 60 seconds if tournament is live
    const interval = setInterval(() => {
      if (data?.tournament?.status === 'in_progress') {
        fetchData();
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [tournamentId]);
  
  const handleTogglePlayer = useCallback((playerId: number) => {
    setExpandedPlayer(prev => prev === playerId ? null : playerId);
  }, []);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CinematicBackground />
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading tournament...</p>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <CinematicBackground />
        <GlassCard className="max-w-md w-full">
          <div className="p-8 text-center">
            <Flag className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Tournament Not Found</h2>
            <p className="text-slate-400 mb-6">{error || 'Unable to load tournament data'}</p>
            <button
              onClick={() => navigate('/games')}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              Back to Games
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }
  
  const { tournament, leaderboard, totalPlayers } = data;
  const displayPlayers = leaderboard.slice(0, showTopN);
  
  return (
    <div className="min-h-screen">
      <CinematicBackground />
      
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/games')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Games</span>
        </button>
        
        {/* Tournament Header */}
        <TournamentHeader tournament={tournament} totalPlayers={totalPlayers} />
        
        {/* Leaderboard Message (if no data yet) */}
        {data.message && (
          <GlassCard className="mb-6">
            <div className="p-6 text-center">
              <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">{data.message}</p>
            </div>
          </GlassCard>
        )}
        
        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <GlassCard>
            {/* Leaderboard Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 className="font-semibold text-white">Leaderboard</h2>
              </div>
              <span className="text-sm text-slate-400">
                Showing {displayPlayers.length} of {totalPlayers}
              </span>
            </div>
            
            {/* Column Headers */}
            <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 border-b border-white/5 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <div className="w-10 sm:w-12 text-center">Pos</div>
              <div className="flex-1">Player</div>
              <div className="hidden sm:flex items-center gap-1">
                {[1, 2, 3, 4].map((r) => (
                  <div key={r} className="w-10 text-center">R{r}</div>
                ))}
              </div>
              <div className="w-[50px] text-right">Total</div>
              <div className="w-6" />
            </div>
            
            {/* Player Rows */}
            <div className="divide-y divide-white/5">
              {displayPlayers.map((player, idx) => (
                <PlayerRow
                  key={player.playerTournamentId || player.playerId}
                  player={player}
                  position={idx + 1}
                  expanded={expandedPlayer === player.playerId}
                  onToggle={() => handleTogglePlayer(player.playerId)}
                  isLeader={idx === 0}
                />
              ))}
            </div>
            
            {/* Show More */}
            {leaderboard.length > showTopN && (
              <button
                onClick={() => setShowTopN(prev => Math.min(prev + 30, leaderboard.length))}
                className="w-full py-3 text-sm text-emerald-400 hover:text-emerald-300 hover:bg-white/[0.02] transition-colors border-t border-white/5"
              >
                Show More ({leaderboard.length - showTopN} remaining)
              </button>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
