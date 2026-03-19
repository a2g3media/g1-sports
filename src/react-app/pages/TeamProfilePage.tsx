/**
 * TeamProfilePage - Comprehensive Team Profile Hub
 * 
 * Route: /sports/:sportKey/team/:teamId
 * Shows team info, stats, roster preview, recent/upcoming games
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  ArrowLeft, Trophy, Users, Calendar,
  MapPin, ChevronRight, Target, BarChart3
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { getTeamColors } from "@/react-app/lib/teamColors";
import { motion, AnimatePresence } from "framer-motion";

// ============================================
// TYPES
// ============================================

interface TeamInfo {
  id: string;
  name: string;
  nickname: string;
  abbreviation: string;
  city: string;
  logo: string;
  color: string;
  alternateColor?: string;
  venue?: {
    name: string;
    city: string;
    capacity?: number;
  };
  conference?: string;
  division?: string;
}

interface TeamRecord {
  wins: number;
  losses: number;
  ties?: number;
  pct: number;
  confWins?: number;
  confLosses?: number;
  homeWins?: number;
  homeLosses?: number;
  awayWins?: number;
  awayLosses?: number;
  streak?: { type: 'W' | 'L'; count: number };
  last10?: { wins: number; losses: number };
  rank?: number;
  playoffSeed?: number;
}

interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  jersey: string;
  headshot?: string;
  stats?: Record<string, number>;
}

interface GameResult {
  id: string;
  date: string;
  opponent: {
    name: string;
    abbreviation: string;
    logo: string;
  };
  homeAway: 'home' | 'away';
  result?: 'W' | 'L' | 'T';
  teamScore?: number;
  oppScore?: number;
  status: 'final' | 'live' | 'scheduled';
  time?: string;
}

interface TeamStats {
  ppg?: number;
  oppPpg?: number;
  rpg?: number;
  apg?: number;
  fgPct?: number;
  threePct?: number;
  offRank?: number;
  defRank?: number;
}

interface TeamProfileData {
  team: TeamInfo;
  record: TeamRecord;
  roster: RosterPlayer[];
  schedule: GameResult[];
  stats: TeamStats;
}

// ============================================
// SPORT CONFIGURATIONS
// ============================================

const SPORT_CONFIG: Record<string, { label: string; statLabels: string[]; primaryStats: string[] }> = {
  nba: { 
    label: 'NBA', 
    statLabels: ['PPG', 'OPP PPG', 'RPG', 'APG', 'FG%', '3P%'],
    primaryStats: ['ppg', 'oppPpg', 'rpg', 'apg', 'fgPct', 'threePct']
  },
  nfl: { 
    label: 'NFL', 
    statLabels: ['PPG', 'OPP PPG', 'YPG', 'Pass YPG', 'Rush YPG', 'TO'],
    primaryStats: ['ppg', 'oppPpg', 'ypg', 'passYpg', 'rushYpg', 'turnovers']
  },
  mlb: { 
    label: 'MLB', 
    statLabels: ['Runs', 'OPP Runs', 'BA', 'HR', 'ERA', 'WHIP'],
    primaryStats: ['runs', 'oppRuns', 'battingAvg', 'homeRuns', 'era', 'whip']
  },
  nhl: { 
    label: 'NHL', 
    statLabels: ['GF', 'GA', 'PP%', 'PK%', 'SOG', 'SV%'],
    primaryStats: ['goalsFor', 'goalsAgainst', 'ppPct', 'pkPct', 'sog', 'svPct']
  },
  ncaaf: { 
    label: 'NCAAF', 
    statLabels: ['PPG', 'OPP PPG', 'YPG', 'Pass YPG', 'Rush YPG', 'TO'],
    primaryStats: ['ppg', 'oppPpg', 'ypg', 'passYpg', 'rushYpg', 'turnovers']
  },
  ncaab: { 
    label: 'NCAAB', 
    statLabels: ['PPG', 'OPP PPG', 'RPG', 'APG', 'FG%', '3P%'],
    primaryStats: ['ppg', 'oppPpg', 'rpg', 'apg', 'fgPct', 'threePct']
  },
};

// ============================================
// COMPONENTS
// ============================================

function CinematicBackground({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${color}40 0%, ${color}10 30%, transparent 60%)`
        }}
      />
      {/* Glow orb */}
      <div 
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30"
        style={{ backgroundColor: color }}
      />
      {/* Dark overlay fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
    </div>
  );
}

function TeamHero({ 
  team, 
  record, 
  sportKey 
}: { 
  team: TeamInfo; 
  record: TeamRecord;
  sportKey: string;
}) {
  void sportKey; // Reserved for sport-specific config
  
  return (
    <div className="relative min-h-[280px] overflow-hidden">
      <CinematicBackground color={team.color || '#3B82F6'} />
      
      <div className="relative z-10 p-6 pt-16">
        {/* Team Logo & Name */}
        <div className="flex items-center gap-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
            <div 
              className="absolute inset-0 blur-2xl opacity-50 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <img 
              src={team.logo || `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${team.abbreviation?.toLowerCase()}.png`}
              alt={team.name}
              className="relative w-28 h-28 object-contain drop-shadow-2xl"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://a.espncdn.com/i/teamlogos/${sportKey}/500/default-team.png`;
              }}
            />
          </motion.div>
          
          <div className="flex-1">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                {team.city}
              </p>
              <h1 className="text-4xl font-black tracking-tight text-white">
                {team.nickname || team.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xl font-bold text-white">
                  {record.wins}-{record.losses}{record.ties ? `-${record.ties}` : ''}
                </span>
                {record.playoffSeed && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ 
                      backgroundColor: team.color,
                      color: '#fff'
                    }}
                  >
                    #{record.playoffSeed} Seed
                  </span>
                )}
                {record.streak && (
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    record.streak.type === 'W' 
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  )}>
                    {record.streak.type}{record.streak.count}
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-4 mt-6"
        >
          <QuickStat 
            label="Conference" 
            value={record.confWins !== undefined ? `${record.confWins}-${record.confLosses}` : '-'}
            icon={<Trophy className="w-4 h-4" />}
          />
          <QuickStat 
            label="Home" 
            value={record.homeWins !== undefined ? `${record.homeWins}-${record.homeLosses}` : '-'}
            icon={<MapPin className="w-4 h-4" />}
          />
          <QuickStat 
            label="Away" 
            value={record.awayWins !== undefined ? `${record.awayWins}-${record.awayLosses}` : '-'}
            icon={<Target className="w-4 h-4" />}
          />
        </motion.div>
      </div>
    </div>
  );
}

function QuickStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function TeamStatsGrid({ stats, sportKey }: { stats: TeamStats; sportKey: string }) {
  const config = SPORT_CONFIG[sportKey] || SPORT_CONFIG.nba;
  
  const statValues = [
    stats.ppg?.toFixed(1) || '-',
    stats.oppPpg?.toFixed(1) || '-',
    stats.rpg?.toFixed(1) || '-',
    stats.apg?.toFixed(1) || '-',
    stats.fgPct ? `${(stats.fgPct * 100).toFixed(1)}%` : '-',
    stats.threePct ? `${(stats.threePct * 100).toFixed(1)}%` : '-',
  ];

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" />
        Season Stats
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {config.statLabels.map((label, i) => (
          <div key={label} className="text-center">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="text-lg font-bold">{statValues[i]}</div>
          </div>
        ))}
      </div>
      {(stats.offRank || stats.defRank) && (
        <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-border/50">
          {stats.offRank && (
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">OFF Rank</div>
              <div className={cn(
                "text-lg font-bold",
                stats.offRank <= 10 ? "text-emerald-400" : stats.offRank <= 20 ? "text-yellow-400" : "text-red-400"
              )}>
                #{stats.offRank}
              </div>
            </div>
          )}
          {stats.defRank && (
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">DEF Rank</div>
              <div className={cn(
                "text-lg font-bold",
                stats.defRank <= 10 ? "text-emerald-400" : stats.defRank <= 20 ? "text-yellow-400" : "text-red-400"
              )}>
                #{stats.defRank}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RosterPreview({ roster, sportKey }: { roster: RosterPlayer[]; sportKey: string; teamAbbr?: string }) {
  void sportKey;
  // Show top 6 players
  const displayRoster = roster.slice(0, 6);
  
  if (displayRoster.length === 0) {
    return (
      <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Roster
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">
          Roster data unavailable
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Users className="w-4 h-4" />
          Key Players
        </h3>
        <span className="text-xs text-muted-foreground">{roster.length} players</span>
      </div>
      <div className="space-y-2">
        {displayRoster.map((player) => (
          <Link
            key={player.id}
            to={`/props/player/${sportKey.toUpperCase()}/${encodeURIComponent(player.name)}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="relative w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
              {player.headshot ? (
                <img 
                  src={player.headshot} 
                  alt={player.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Users className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                {player.name}
              </div>
              <div className="text-xs text-muted-foreground">
                #{player.jersey} · {player.position}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function SchedulePreview({ schedule }: { schedule: GameResult[]; teamColor?: string }) {
  const [tab, setTab] = useState<'recent' | 'upcoming'>('recent');
  
  const recentGames = schedule.filter(g => g.status === 'final').slice(-5).reverse();
  const upcomingGames = schedule.filter(g => g.status === 'scheduled').slice(0, 5);
  const displayGames = tab === 'recent' ? recentGames : upcomingGames;

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Schedule
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('recent')}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              tab === 'recent' 
                ? "bg-primary/20 text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Recent
          </button>
          <button
            onClick={() => setTab('upcoming')}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              tab === 'upcoming' 
                ? "bg-primary/20 text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Upcoming
          </button>
        </div>
      </div>
      
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-2"
        >
          {displayGames.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No {tab} games
            </p>
          ) : (
            displayGames.map((game) => (
              <div 
                key={game.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
              >
                <img 
                  src={game.opponent.logo}
                  alt={game.opponent.name}
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = 'https://a.espncdn.com/i/teamlogos/default-team-logo-500.png';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {game.homeAway === 'away' ? '@' : 'vs'} {game.opponent.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(game.date).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                    {game.time && ` · ${game.time}`}
                  </div>
                </div>
                {game.status === 'final' && game.result && (
                  <div className={cn(
                    "text-sm font-bold px-2 py-1 rounded",
                    game.result === 'W' 
                      ? "bg-emerald-500/20 text-emerald-400"
                      : game.result === 'L'
                        ? "bg-red-500/20 text-red-400"
                        : "bg-yellow-500/20 text-yellow-400"
                  )}>
                    {game.result} {game.teamScore}-{game.oppScore}
                  </div>
                )}
                {game.status === 'live' && (
                  <div className="flex items-center gap-1 text-sm font-bold text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </div>
                )}
              </div>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-background">
      <div className="animate-pulse p-6 space-y-6">
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-full bg-muted" />
          <div className="space-y-3">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-6 w-32 bg-muted rounded" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <Target className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold">Team Not Found</h2>
        <p className="text-muted-foreground text-sm">{message}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TeamProfilePage() {
  const { sportKey, teamId } = useParams<{ sportKey: string; teamId: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<TeamProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamData = async () => {
    if (!sportKey || !teamId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch team profile, schedule, and stats in parallel
      const [profileRes, scheduleRes, statsRes] = await Promise.all([
        fetch(`/api/teams/${sportKey.toUpperCase()}/${teamId}`),
        fetch(`/api/teams/${sportKey.toUpperCase()}/${teamId}/schedule`),
        fetch(`/api/teams/${sportKey.toUpperCase()}/${teamId}/stats`).catch(() => null)
      ]);
      
      if (!profileRes.ok) {
        throw new Error(profileRes.status === 404 ? 'Team not found' : 'Failed to load team data');
      }
      
      const profileJson = await profileRes.json();
      const scheduleJson = scheduleRes.ok ? await scheduleRes.json() : { pastGames: [], upcomingGames: [] };
      const statsJson = statsRes && statsRes.ok ? await statsRes.json() : { stats: {}, rankings: {} };
      
      // Transform SportsRadar data to our format
      const teamAlias = profileJson.team?.alias || '';
      const teamColors = getTeamColors(sportKey || 'nba', teamAlias);
      
      const team: TeamInfo = {
        id: profileJson.team?.id || teamId,
        name: profileJson.team?.name || 'Unknown',
        nickname: profileJson.team?.name || 'Unknown',
        abbreviation: teamAlias,
        city: profileJson.team?.market || '',
        logo: profileJson.team?.logo || `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${teamAlias.toLowerCase()}.png`,
        color: teamColors.primary,
        alternateColor: teamColors.secondary,
        venue: profileJson.venue ? {
          name: profileJson.venue.name,
          city: `${profileJson.venue.city}, ${profileJson.venue.state || ''}`.trim(),
          capacity: profileJson.venue.capacity
        } : undefined,
        conference: profileJson.team?.conference,
        division: profileJson.team?.division
      };
      
      // Transform record from standings or team record
      const teamRecord = profileJson.team?.record || {};
      const record: TeamRecord = {
        wins: teamRecord.wins || 0,
        losses: teamRecord.losses || 0,
        ties: teamRecord.ties,
        pct: teamRecord.win_pct || (teamRecord.wins / Math.max(1, teamRecord.wins + teamRecord.losses)),
        confWins: teamRecord.conference?.wins,
        confLosses: teamRecord.conference?.losses,
        homeWins: teamRecord.home?.wins,
        homeLosses: teamRecord.home?.losses,
        awayWins: teamRecord.away?.wins || teamRecord.road?.wins,
        awayLosses: teamRecord.away?.losses || teamRecord.road?.losses,
        streak: teamRecord.streak?.length ? { 
          type: teamRecord.streak.kind === 'win' ? 'W' : 'L', 
          count: teamRecord.streak.length 
        } : undefined,
        playoffSeed: teamRecord.seed
      };
      
      // Transform roster
      const roster: RosterPlayer[] = (profileJson.roster || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        position: p.position || 'N/A',
        jersey: p.jerseyNumber || '-',
        headshot: p.headshot || `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportKey}/players/full/${p.id}.png&w=96&h=70&cb=1`,
        stats: {}
      }));
      
      // Transform schedule - combine past and upcoming games
      const schedule: GameResult[] = [
        ...(scheduleJson.pastGames || []).map((g: any) => ({
          id: g.id,
          date: g.scheduledTime,
          opponent: {
            name: g.isHome ? g.awayTeamName : g.homeTeamName,
            abbreviation: g.isHome ? g.awayTeamAlias : g.homeTeamAlias,
            logo: `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${(g.isHome ? g.awayTeamAlias : g.homeTeamAlias)?.toLowerCase()}.png`
          },
          homeAway: g.isHome ? 'home' : 'away',
          result: g.homeScore !== null && g.awayScore !== null 
            ? (g.isHome 
                ? (g.homeScore > g.awayScore ? 'W' : g.homeScore < g.awayScore ? 'L' : 'T')
                : (g.awayScore > g.homeScore ? 'W' : g.awayScore < g.homeScore ? 'L' : 'T'))
            : undefined,
          teamScore: g.isHome ? g.homeScore : g.awayScore,
          oppScore: g.isHome ? g.awayScore : g.homeScore,
          status: g.status === 'FINAL' ? 'final' : g.status === 'LIVE' ? 'live' : 'scheduled'
        })),
        ...(scheduleJson.upcomingGames || []).map((g: any) => ({
          id: g.id,
          date: g.scheduledTime,
          opponent: {
            name: g.isHome ? g.awayTeamName : g.homeTeamName,
            abbreviation: g.isHome ? g.awayTeamAlias : g.homeTeamAlias,
            logo: `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${(g.isHome ? g.awayTeamAlias : g.homeTeamAlias)?.toLowerCase()}.png`
          },
          homeAway: g.isHome ? 'home' : 'away',
          status: 'scheduled' as const,
          time: g.scheduledTime ? new Date(g.scheduledTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined
        }))
      ];
      
      // Transform stats
      const srStats = statsJson.stats || {};
      const rankings = statsJson.rankings || {};
      const stats: TeamStats = {
        ppg: srStats.pointsPerGame || srStats.goalsPerGame,
        oppPpg: srStats.oppPointsPerGame || srStats.goalsAgainstPerGame,
        rpg: srStats.reboundsPerGame,
        apg: srStats.assistsPerGame,
        fgPct: srStats.fieldGoalPct ? parseFloat(srStats.fieldGoalPct) / 100 : undefined,
        threePct: srStats.threePointPct ? parseFloat(srStats.threePointPct) / 100 : undefined,
        offRank: rankings.offense,
        defRank: rankings.defense
      };
      
      setData({ team, record, roster, schedule, stats });
    } catch (err: any) {
      console.error('[TeamProfile] Fetch error:', err);
      setError(err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [sportKey, teamId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error || 'Unknown error'} onRetry={fetchTeamData} />;

  const { team, record, roster, schedule, stats } = data;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Back Button */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-background to-transparent pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pointer-events-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* Hero */}
      <TeamHero team={team} record={record} sportKey={sportKey || 'nba'} />

      {/* Content */}
      <div className="px-4 space-y-4 -mt-4 relative z-10">
        {/* Stats Grid */}
        <TeamStatsGrid stats={stats} sportKey={sportKey || 'nba'} />

        {/* Roster Preview */}
        <RosterPreview 
          roster={roster} 
          sportKey={sportKey || 'nba'} 
          teamAbbr={team.abbreviation}
        />

        {/* Schedule */}
        <SchedulePreview 
          schedule={schedule} 
          teamColor={team.color}
        />

        {/* Venue Info */}
        {team.venue && (
          <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Home Venue
            </h3>
            <div className="text-lg font-medium">{team.venue.name}</div>
            <div className="text-sm text-muted-foreground">{team.venue.city}</div>
            {team.venue.capacity && (
              <div className="text-xs text-muted-foreground mt-1">
                Capacity: {team.venue.capacity.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamProfilePage;
