/**
 * TeamProfilePage - Comprehensive Team Profile Hub
 * 
 * Route: /sports/:sportKey/team/:teamId
 * Shows team info, stats, roster preview, recent/upcoming games
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  ArrowLeft, Trophy, Users, Calendar,
  MapPin, ChevronRight, Target, BarChart3
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { getTeamColors } from "@/react-app/lib/teamColors";
import { motion, AnimatePresence } from "framer-motion";
import FavoriteEntityButton from "@/react-app/components/FavoriteEntityButton";
import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import { getRouteCache, setRouteCache } from "@/react-app/lib/routeDataCache";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";
import PremiumScoutFlowBar, { type ScoutFlowItem } from "@/react-app/components/PremiumScoutFlowBar";
import { buildPlayerRoute, buildTeamRoute, logPlayerNavigation, logTeamNavigation } from "@/react-app/lib/navigationRoutes";

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
  status?: string;
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
  spread?: number | null;
  total?: number | null;
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
  injuries: TeamInjury[];
  teamH2H: TeamH2HData | null;
}

interface TeamInjury {
  id: string;
  playerName: string;
  status: string;
  detail?: string;
  injuryType?: string;
  returnDate?: string;
  headshot?: string;
}

interface TeamH2HData {
  window: number;
  sampleSize: number;
  teamA: { name: string; alias: string };
  teamB: { name: string; alias: string };
  series: { teamAWins: number; teamBWins: number; ties: number };
  ats: { sampleWithLine: number; teamACovers: number; teamBCovers: number; pushes: number };
  totals: { sampleWithLine: number; overs: number; unders: number; pushes: number };
  averages: { marginForTeamA: number | null; combinedTotal: number | null };
  meetings: Array<{
    id: string;
    date: string;
    homeTeamAlias: string;
    awayTeamAlias: string;
    homeScore: number;
    awayScore: number;
    teamACoverResult: 'cover' | 'no_cover' | 'push' | null;
    totalResult: 'over' | 'under' | 'push' | null;
  }>;
}

const FALLBACK_AVATAR_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%23101724'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%234b5563'/%3E%3Cpath d='M12 56c3-10 11-16 20-16s17 6 20 16' fill='%234b5563'/%3E%3C/svg%3E";

interface ScoutRecentEntry {
  type: "player" | "team";
  label: string;
  subtitle?: string;
  sport: string;
  path: string;
  ts: number;
}

function safeNum(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizePct(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n > 1 ? n / 100 : n;
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
  sportKey,
  league,
}: { 
  team: TeamInfo; 
  record: TeamRecord;
  sportKey: string;
  league?: string;
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
          <FavoriteEntityButton
            type="team"
            entityId={team.id || team.abbreviation || team.name}
            sport={sportKey}
            league={league}
            metadata={{
              team_name: team.name,
              team_code: team.abbreviation,
              team_city: team.city,
              sport: sportKey,
            }}
            className="self-start mt-2 sm:mt-0"
            label="Favorite Team"
          />
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
            value={
              record.confWins !== undefined || record.confLosses !== undefined
                ? `${record.confWins ?? 0}-${record.confLosses ?? 0}`
                : '-'
            }
            icon={<Trophy className="w-4 h-4" />}
          />
          <QuickStat 
            label="Home" 
            value={
              record.homeWins !== undefined || record.homeLosses !== undefined
                ? `${record.homeWins ?? 0}-${record.homeLosses ?? 0}`
                : '-'
            }
            icon={<MapPin className="w-4 h-4" />}
          />
          <QuickStat 
            label="Away" 
            value={
              record.awayWins !== undefined || record.awayLosses !== undefined
                ? `${record.awayWins ?? 0}-${record.awayLosses ?? 0}`
                : '-'
            }
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
  const normalizeStatus = (value: string | undefined) => String(value || '').trim().toUpperCase();
  const statusRank = (value: string | undefined) => {
    const s = normalizeStatus(value);
    if (s === 'ACT' || s === 'ACTIVE') return 0;
    if (s === 'PROBABLE' || s === 'DAY_TO_DAY' || s === 'DTD') return 1;
    if (s === 'QUESTIONABLE') return 2;
    if (s === 'GTD') return 3;
    if (s === 'OUT') return 4;
    if (s === 'INJ') return 5;
    if (s === 'TWO-WAY' || s === 'TWOWAY') return 6;
    return 7;
  };
  const primaryPos = (value: string) => {
    const p = String(value || '').toUpperCase();
    if (p.includes('PG')) return 'PG';
    if (p.includes('SG')) return 'SG';
    if (p.includes('SF')) return 'SF';
    if (p.includes('PF')) return 'PF';
    if (p === 'C' || p.includes('-C') || p.includes('C-')) return 'C';
    if (p.includes('G')) return 'G';
    if (p.includes('F')) return 'F';
    return 'UNK';
  };
  const posRank = (value: string) => {
    const p = primaryPos(value);
    if (p === 'PG') return 0;
    if (p === 'SG') return 1;
    if (p === 'SF') return 2;
    if (p === 'PF') return 3;
    if (p === 'C') return 4;
    if (p === 'G') return 5;
    if (p === 'F') return 6;
    return 7;
  };
  const byRelevance = [...roster].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    const byPos = posRank(a.position) - posRank(b.position);
    if (byPos !== 0) return byPos;
    return a.name.localeCompare(b.name);
  });
  const activePool = byRelevance.filter((p) => statusRank(p.status) <= 2);
  const starters: RosterPlayer[] = [];
  const used = new Set<string>();
  const starterSlots = ['PG', 'SG', 'SF', 'PF', 'C'];
  for (const slot of starterSlots) {
    const hit = activePool.find((p) => !used.has(p.id) && primaryPos(p.position) === slot);
    if (hit) {
      starters.push(hit);
      used.add(hit.id);
    }
  }
  for (const player of activePool) {
    if (starters.length >= 5) break;
    if (used.has(player.id)) continue;
    starters.push(player);
    used.add(player.id);
  }
  const depth = byRelevance.filter((p) => !used.has(p.id));
  const prefetchPlayer = (playerName: string) => {
    const sportUpper = String(sportKey || '').toUpperCase();
    if (!sportUpper || !playerName) return;
    void fetchJsonCached(`/api/player/${sportUpper}/${encodeURIComponent(playerName)}`, {
      cacheKey: `player-api:${sportUpper}:${playerName}`,
      ttlMs: 45_000,
      timeoutMs: 4_000,
      init: { credentials: 'include' },
    }).catch(() => null);
  };
  
  if (roster.length === 0) {
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
          Full Roster
        </h3>
        <span className="text-xs text-muted-foreground">{roster.length} players</span>
      </div>
      <div className="space-y-2">
        {starters.length > 0 && (
          <div className="pb-1">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-emerald-300/90 font-semibold">
              Likely Starters / Core
            </div>
            <div className="space-y-1.5">
              {starters.map((player) => (
                <Link
                  key={player.id}
                  to={buildPlayerRoute(String(sportKey || ""), player.name)}
                  onClick={() => logPlayerNavigation(player.name, String(sportKey || ""))}
                  className="flex items-center gap-3 p-2 rounded-lg border border-emerald-300/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group"
                  onMouseEnter={() => prefetchPlayer(player.name)}
                  onFocus={() => prefetchPlayer(player.name)}
                >
                  <div className="relative w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {player.headshot ? (
                      <img
                        src={player.headshot}
                        alt={player.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== FALLBACK_AVATAR_SVG) {
                            target.src = FALLBACK_AVATAR_SVG;
                          }
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
        )}

        {depth.length > 0 && (
          <div className="pt-1">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Bench / Depth
            </div>
            <div className="space-y-1.5">
              {depth.map((player) => (
                <Link
                  key={player.id}
                  to={buildPlayerRoute(String(sportKey || ""), player.name)}
                  onClick={() => logPlayerNavigation(player.name, String(sportKey || ""))}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                  onMouseEnter={() => prefetchPlayer(player.name)}
                  onFocus={() => prefetchPlayer(player.name)}
                >
                  <div className="relative w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {player.headshot ? (
                      <img
                        src={player.headshot}
                        alt={player.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== FALLBACK_AVATAR_SVG) {
                            target.src = FALLBACK_AVATAR_SVG;
                          }
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
        )}
      </div>
    </div>
  );
}

export function SchedulePreview({ schedule }: { schedule: GameResult[]; teamColor?: string }) {
  const [tab, setTab] = useState<'recent' | 'upcoming'>('upcoming');
  
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

export function TeamH2HPreview({ h2h }: { h2h: TeamH2HData | null }) {
  if (!h2h || h2h.sampleSize === 0) {
    return (
      <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Head-to-Head
        </h3>
        <p className="text-sm text-muted-foreground text-center py-3">
          No recent head-to-head sample available
        </p>
      </div>
    );
  }

  const latest = h2h.meetings[0];
  const lastScore = latest
    ? `${latest.awayTeamAlias} ${latest.awayScore} - ${latest.homeScore} ${latest.homeTeamAlias}`
    : '-';

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Head-to-Head ({h2h.sampleSize})
        </h3>
        <span className="text-xs text-muted-foreground">
          L{h2h.window}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg bg-white/5 p-3 border border-white/10">
          <div className="text-xs text-muted-foreground mb-1">Series</div>
          <div className="text-sm font-semibold">
            {h2h.teamA.alias} {h2h.series.teamAWins}-{h2h.series.teamBWins} {h2h.teamB.alias}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-3 border border-white/10">
          <div className="text-xs text-muted-foreground mb-1">Avg Margin</div>
          <div className="text-sm font-semibold">
            {h2h.averages.marginForTeamA === null
              ? '-'
              : `${h2h.averages.marginForTeamA > 0 ? '+' : ''}${h2h.averages.marginForTeamA.toFixed(1)}`}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg bg-white/5 p-3 border border-white/10">
          <div className="text-xs text-muted-foreground mb-1">ATS (lines)</div>
          <div className="text-sm font-semibold">
            {h2h.ats.sampleWithLine > 0
              ? `${h2h.ats.teamACovers}-${h2h.ats.teamBCovers}-${h2h.ats.pushes}`
              : 'No line sample'}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-3 border border-white/10">
          <div className="text-xs text-muted-foreground mb-1">O/U (lines)</div>
          <div className="text-sm font-semibold">
            {h2h.totals.sampleWithLine > 0
              ? `${h2h.totals.overs}-${h2h.totals.unders}-${h2h.totals.pushes}`
              : 'No line sample'}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Latest meeting: {lastScore}
      </div>
    </div>
  );
}

function TeamMatchupEdgeSection({
  sportKey,
  teamAbbr,
  teamName,
  schedule,
  initialH2H,
}: {
  sportKey: string;
  teamAbbr: string;
  teamName: string;
  schedule: GameResult[];
  initialH2H: TeamH2HData | null;
}) {
  const recentGames = useMemo(
    () =>
      [...schedule]
        .filter((g) => g.status === 'final')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    [schedule]
  );

  const opponents = useMemo(() => {
    const upcoming = schedule
      .filter((g) => g.status === 'scheduled' || g.status === 'live')
      .map((g) => g.opponent);
    const fallback = schedule
      .filter((g) => g.status === 'final')
      .map((g) => g.opponent);
    const merged = [...upcoming, ...fallback];
    const seen = new Set<string>();
    const out: Array<{ name: string; abbreviation: string; logo?: string }> = [];
    for (const opp of merged) {
      const key = String(opp?.abbreviation || opp?.name || '').trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: opp.name, abbreviation: opp.abbreviation, logo: opp.logo });
    }
    return out.slice(0, 12);
  }, [schedule]);

  const [oppIdx, setOppIdx] = useState(0);
  const [h2h, setH2h] = useState<TeamH2HData | null>(initialH2H);

  useEffect(() => {
    if (opponents.length === 0) return;
    if (oppIdx >= opponents.length) setOppIdx(0);
  }, [oppIdx, opponents.length]);

  useEffect(() => {
    const selected = opponents[oppIdx];
    const teamA = String(teamAbbr || '').trim();
    const sportUpper = String(sportKey || '').toUpperCase();
    if (!selected || !teamA || !sportUpper) return;
    const teamB = String(selected.abbreviation || selected.name || '').trim();
    if (!teamB) return;
    const initialMatches =
      initialH2H
      && String(initialH2H.teamB?.alias || '').toUpperCase() === String(selected.abbreviation || '').toUpperCase();
    if (initialMatches) {
      setH2h(initialH2H);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = `/api/teams/${sportUpper}/h2h?teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}&window=10`;
      const result = await fetchJsonCached<TeamH2HData>(url, {
        cacheKey: `team-h2h:${sportUpper}:${teamA}:${teamB}`,
        ttlMs: 90_000,
        timeoutMs: 5_000,
      }).catch(() => null);
      if (!cancelled) {
        setH2h(result && Number(result.sampleSize) > 0 ? result : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialH2H, oppIdx, opponents, sportKey, teamAbbr]);

  const outcomeBadgeTone = (label: 'Cover' | 'No Cover' | 'Push' | 'No Line' | 'Over' | 'Under') =>
    label === 'Cover' || label === 'Over'
      ? 'bg-emerald-500 text-white'
      : label === 'No Cover' || label === 'Under'
        ? 'bg-rose-500 text-white'
        : label === 'Push'
          ? 'bg-slate-500 text-white'
          : 'bg-amber-500 text-black';
  const outcomeIcon = (label: 'Cover' | 'No Cover' | 'Push' | 'No Line' | 'Over' | 'Under') =>
    label === 'Cover' || label === 'Over' ? '▲' : label === 'No Cover' || label === 'Under' ? '▼' : label === 'Push' ? '•' : '○';
  const outcomeBlockTone = (label: 'Cover' | 'No Cover' | 'Push' | 'No Line' | 'Over' | 'Under') =>
    label === 'Cover' || label === 'Over'
      ? 'bg-emerald-500/16 border-emerald-300/30'
      : label === 'No Cover' || label === 'Under'
        ? 'bg-rose-500/16 border-rose-300/30'
        : label === 'Push'
          ? 'bg-slate-400/16 border-slate-300/25'
          : 'bg-amber-500/16 border-amber-300/30';

  const lineOutcomes = recentGames.map((game) => {
    const teamScore = typeof game.teamScore === 'number' && Number.isFinite(game.teamScore) ? game.teamScore : null;
    const oppScore = typeof game.oppScore === 'number' && Number.isFinite(game.oppScore) ? game.oppScore : null;
    const spread = typeof game.spread === 'number' && Number.isFinite(game.spread) ? game.spread : null;
    const total = typeof game.total === 'number' && Number.isFinite(game.total) ? game.total : null;
    const validScores = teamScore !== null && oppScore !== null;
    let ats: 'Cover' | 'No Cover' | 'Push' | 'No Line' = 'No Line';
    let totalOutcome: 'Over' | 'Under' | 'Push' | 'No Line' = 'No Line';
    if (validScores && spread !== null) {
      const adjusted = teamScore + spread - oppScore;
      ats = Math.abs(adjusted) < 0.0001 ? 'Push' : adjusted > 0 ? 'Cover' : 'No Cover';
    }
    if (validScores && total !== null) {
      const combined = teamScore + oppScore;
      totalOutcome = Math.abs(combined - total) < 0.0001 ? 'Push' : combined > total ? 'Over' : 'Under';
    }
    return { game, ats, totalOutcome };
  });

  const atsSummary = lineOutcomes.reduce(
    (acc, row) => {
      if (row.ats === 'Cover') acc.cover += 1;
      if (row.ats === 'No Cover') acc.noCover += 1;
      if (row.ats === 'Push') acc.push += 1;
      return acc;
    },
    { cover: 0, noCover: 0, push: 0 }
  );
  const atsSampleWithLine = lineOutcomes.filter((row) => row.ats !== 'No Line').length;
  const l5AtsLabel = atsSampleWithLine > 0
    ? `${atsSummary.cover}-${atsSummary.noCover}-${atsSummary.push}`
    : 'No Line';

  const selectedOpponent = opponents[oppIdx] || null;
  const fallbackH2H = useMemo(() => {
    if (!selectedOpponent) return null;
    const oppKey = String(selectedOpponent.abbreviation || selectedOpponent.name || '').toUpperCase();
    if (!oppKey) return null;
    const meetings = [...schedule]
      .filter((g) => g.status === 'final' && String(g.opponent.abbreviation || '').toUpperCase() === oppKey)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
    if (meetings.length === 0) return null;

    let teamAWins = 0;
    let teamBWins = 0;
    let ties = 0;
    let covers = 0;
    let noCovers = 0;
    let pushes = 0;
    let atsSample = 0;

    for (const game of meetings) {
      const teamScore = typeof game.teamScore === 'number' && Number.isFinite(game.teamScore) ? game.teamScore : null;
      const oppScore = typeof game.oppScore === 'number' && Number.isFinite(game.oppScore) ? game.oppScore : null;
      if (teamScore !== null && oppScore !== null) {
        if (teamScore > oppScore) teamAWins += 1;
        else if (teamScore < oppScore) teamBWins += 1;
        else ties += 1;
      }
      const spread = typeof game.spread === 'number' && Number.isFinite(game.spread) ? game.spread : null;
      if (teamScore !== null && oppScore !== null && spread !== null) {
        atsSample += 1;
        const adjusted = teamScore + spread - oppScore;
        if (Math.abs(adjusted) < 0.0001) pushes += 1;
        else if (adjusted > 0) covers += 1;
        else noCovers += 1;
      }
    }

    return {
      seriesLabel: `${teamAbbr} ${teamAWins}-${teamBWins}${ties > 0 ? `-${ties}` : ''} ${selectedOpponent.abbreviation}`,
      atsLabel: atsSample > 0 ? `${covers}-${noCovers}-${pushes}` : 'No Line',
    };
  }, [schedule, selectedOpponent, teamAbbr]);

  const h2hSeriesLabel = h2h
    ? `${h2h.teamA.alias} ${h2h.series.teamAWins}-${h2h.series.teamBWins} ${h2h.teamB.alias}`
    : (fallbackH2H?.seriesLabel || 'No Matchups Yet');
  const h2hAtsLabel = h2h && h2h.ats.sampleWithLine > 0
    ? `${h2h.ats.teamACovers}-${h2h.ats.teamBCovers}-${h2h.ats.pushes}`
    : (fallbackH2H?.atsLabel || 'No Line');

  return (
    <div className="rounded-xl border border-cyan-400/15 bg-gradient-to-br from-[#0d1628]/90 via-[#0b1323]/90 to-[#111827]/90 overflow-hidden shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-white">Team Matchup Edge</h3>
        </div>
        {selectedOpponent && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOppIdx((n) => (n - 1 + opponents.length) % opponents.length)}
              className="px-2 py-1 rounded border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 text-xs hover:bg-cyan-500/20 transition-colors"
            >
              Prev Team
            </button>
            <button
              onClick={() => setOppIdx((n) => (n + 1) % opponents.length)}
              className="px-2 py-1 rounded border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 text-xs hover:bg-cyan-500/20 transition-colors"
            >
              Next Team
            </button>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 font-medium text-cyan-100">
            Upcoming: {selectedOpponent ? `${selectedOpponent.name} (${selectedOpponent.abbreviation})` : 'TBD'}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-2 py-0.5 font-medium text-white/65">
            Game-by-Game + Cover Checks
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-3 text-center">
            <div className="text-xs text-white/45">L5 ATS</div>
            <div className="mt-1 text-lg font-bold text-white">{l5AtsLabel}</div>
          </div>
          <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-3 text-center">
            <div className="text-xs text-white/45">H2H Series</div>
            <div className="mt-1 text-lg font-bold text-white">
              {h2hSeriesLabel}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-3 text-center">
            <div className="text-xs text-white/45">H2H ATS</div>
            <div className="mt-1 text-lg font-bold text-white">
              {h2hAtsLabel}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {lineOutcomes.length === 0 ? (
            <div className="rounded-md bg-white/[0.02] border border-white/[0.05] px-3 py-3 text-xs text-white/60">
              No final games available.
            </div>
          ) : (
            lineOutcomes.map((row, idx) => (
              <div
                key={`${row.game.id || row.game.date}-${idx}`}
                className="group rounded-md bg-white/[0.02] border border-white/[0.05] px-3 py-3 text-xs transition-all duration-200 hover:border-cyan-300/25 hover:bg-white/[0.04] hover:shadow-[0_0_16px_rgba(34,211,238,0.08)] hover:-translate-y-[1px]"
              >
                {(() => {
                  const hasSpread = typeof row.game.spread === 'number' && Number.isFinite(row.game.spread);
                  const hasTotal = typeof row.game.total === 'number' && Number.isFinite(row.game.total);
                  const hasAnyLine = hasSpread || hasTotal;
                  return (
                <div className="md:grid md:grid-cols-[1.6fr_1fr] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="inline-flex items-center rounded-md border border-indigo-300/30 bg-indigo-500/15 px-1.5 py-0.5 font-semibold text-indigo-100">
                        {new Date(row.game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-white/70">{row.game.homeAway === 'away' ? '@' : 'vs'} {row.game.opponent.abbreviation}</span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold',
                          row.game.result === 'W'
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-300/30'
                            : row.game.result === 'L'
                              ? 'bg-rose-500/20 text-rose-200 border border-rose-300/30'
                              : 'bg-slate-500/20 text-slate-200 border border-slate-300/30'
                        )}
                      >
                        {row.game.result || '-'}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-white/90 font-semibold">
                      <span className="text-white/60">Final:</span>{' '}
                      <span className="text-cyan-100">{teamName}</span>{' '}
                      <span className="text-white">{row.game.teamScore ?? '-'}</span>
                      <span className="text-white/45 mx-1">-</span>
                      <span className="text-white">{row.game.oppScore ?? '-'}</span>{' '}
                      <span className="text-white/75">{row.game.opponent.abbreviation}</span>
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-cyan-200/85">
                      {`Line: Spread ${typeof row.game.spread === 'number' && Number.isFinite(row.game.spread) ? row.game.spread : '-'} | Total ${typeof row.game.total === 'number' && Number.isFinite(row.game.total) ? row.game.total : '-'}`}
                    </div>
                  </div>
                  {hasAnyLine ? (
                    <div className="relative mt-2 md:mt-0 grid grid-cols-2 divide-x divide-white/[0.08] rounded-md border border-white/[0.05] bg-white/[0.02] overflow-hidden">
                      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-r from-transparent via-cyan-400/[0.06] to-transparent" />
                      {([
                        { key: 'ATS', value: row.ats },
                        { key: 'TOTAL', value: row.totalOutcome },
                      ] as const).map((item) => (
                        <div key={item.key} className={cn('px-2 py-1.5 text-center border transition-colors', outcomeBlockTone(item.value))}>
                          <div className="text-[9px] uppercase tracking-wide text-white/65">{item.key}</div>
                          <div className="mt-0.5 text-[11px] font-semibold tracking-wide">
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', outcomeBadgeTone(item.value))}>
                              <span aria-hidden className="text-[11px] opacity-95">{outcomeIcon(item.value)}</span>
                              <span>{item.value}</span>
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-white/62">
                            {item.key === 'ATS'
                              ? `Spread ${typeof row.game.spread === 'number' && Number.isFinite(row.game.spread) ? row.game.spread : '-'}`
                              : `Total ${typeof row.game.total === 'number' && Number.isFinite(row.game.total) ? row.game.total : '-'}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 md:mt-0 rounded-md border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-amber-200/85">Market Data</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-amber-100">No confirmed line for this game</div>
                    </div>
                  )}
                </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function InjuriesPreview({ injuries }: { injuries: TeamInjury[] }) {
  const rows = injuries.slice(0, 8);
  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Users className="w-4 h-4" />
          Injuries
        </h3>
        <span className="text-xs text-muted-foreground">{injuries.length} listed</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No reported injuries</p>
      ) : (
        <div className="space-y-2">
          {rows.map((injury) => (
            <div key={`${injury.id}-${injury.playerName}`} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex-shrink-0">
                {injury.headshot ? (
                  <img
                    src={injury.headshot}
                    alt={injury.playerName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== FALLBACK_AVATAR_SVG) {
                        target.src = FALLBACK_AVATAR_SVG;
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Users className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{injury.playerName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[injury.injuryType, injury.detail].filter(Boolean).join(' - ') || 'Status update pending'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-amber-300">{injury.status || 'Out'}</div>
                {injury.returnDate && (
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(injury.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
  const { flags } = useFeatureFlags();
  const scoutEnabled = Boolean(flags.PREMIUM_SCOUT_FLOW_ENABLED);
  
  const [data, setData] = useState<TeamProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoutRecent, setScoutRecent] = useState<ScoutRecentEntry[]>([]);
  const [scoutPlayers, setScoutPlayers] = useState<Array<{ name: string; team: string; sport: string }>>([]);
  const [scoutTeams, setScoutTeams] = useState<Array<{ id: string; alias: string; name: string }>>([]);

  useEffect(() => {
    if (!sportKey || !teamId) return;
    const sportUpper = sportKey.toUpperCase();
    const raw = String(teamId).trim();
    if (!raw) return;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw) || raw.startsWith("sr:")) return;
    const controller = new AbortController();

    const resolveCanonicalRoute = async () => {
      try {
        const timeout = setTimeout(() => controller.abort(), 1800);
        try {
          const res = await fetch(`/api/teams/${encodeURIComponent(sportUpper)}/standings`, {
            credentials: "include",
            signal: controller.signal,
          });
          if (!res.ok) return;
          const json = await res.json().catch(() => null) as any;
          const teams = Array.isArray(json?.teams) ? json.teams : [];
          const alias = raw.toUpperCase();
          const aliasMap: Record<string, string[]> = {
            GSW: ["GS"],
            GS: ["GSW"],
            NYK: ["NY"],
            NY: ["NYK"],
            SAS: ["SA"],
            SA: ["SAS"],
            NOP: ["NO"],
            NO: ["NOP"],
            PHX: ["PHO"],
            PHO: ["PHX"],
            CHA: ["CHO"],
            CHO: ["CHA"],
            BKN: ["BRK"],
            BRK: ["BKN"],
          };
          const candidates = new Set<string>([alias, ...(aliasMap[alias] || [])]);
          const normalizedRaw = alias.replace(/[^A-Z0-9]/g, "");
          const row = teams.find((t: any) => {
            const id = String(t?.id || "").trim();
            const rowAlias = String(t?.alias || t?.abbreviation || "").trim().toUpperCase();
            const rowName = String(t?.name || "").trim().toUpperCase();
            const rowMarket = String(t?.market || "").trim().toUpperCase();
            const rowFull = `${rowMarket} ${rowName}`.trim();
            const normalizedFull = rowFull.replace(/[^A-Z0-9]/g, "");
            return id === raw
              || candidates.has(rowAlias)
              || normalizedFull === normalizedRaw
              || normalizedRaw.includes(normalizedFull)
              || normalizedFull.includes(normalizedRaw);
          });
          const canonical = String(row?.id || "").trim();
          if (canonical && canonical !== raw) {
            navigate(`/sports/${sportKey.toLowerCase()}/team/${encodeURIComponent(canonical)}`, { replace: true });
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    };
    void resolveCanonicalRoute();
    return () => controller.abort();
  }, [sportKey, teamId, navigate]);

  const fetchTeamData = async () => {
    if (!sportKey || !teamId) return;
    const loadStartedAt = Date.now();
    let apiCalls = 0;
    const sportUpper = sportKey.toUpperCase();
    let effectiveTeamId = String(teamId || "").trim();
    if (effectiveTeamId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(effectiveTeamId) && !effectiveTeamId.startsWith("sr:")) {
      try {
        apiCalls += 1;
        const standings = await fetchJsonCached<{ teams?: Array<{ id?: string; alias?: string; abbreviation?: string; name?: string; market?: string }> }>(
          `/api/teams/${encodeURIComponent(sportUpper)}/standings`,
          {
            cacheKey: `team-canonical-standings:${sportUpper}:v1`,
            ttlMs: 90_000,
            timeoutMs: 1_500,
            init: { credentials: "include" },
          }
        ).catch(() => ({ teams: [] }));
        const teams = Array.isArray(standings?.teams) ? standings.teams : [];
        const alias = effectiveTeamId.toUpperCase();
        const aliasMap: Record<string, string[]> = {
          GSW: ["GS"],
          GS: ["GSW"],
          NYK: ["NY"],
          NY: ["NYK"],
          SAS: ["SA"],
          SA: ["SAS"],
          NOP: ["NO"],
          NO: ["NOP"],
          PHX: ["PHO"],
          PHO: ["PHX"],
          CHA: ["CHO"],
          CHO: ["CHA"],
          BKN: ["BRK"],
          BRK: ["BKN"],
        };
        const candidates = new Set<string>([alias, ...(aliasMap[alias] || [])]);
        const normalizedRaw = alias.replace(/[^A-Z0-9]/g, "");
        const hit = teams.find((row) => {
          const id = String(row?.id || "").trim();
          const rowAlias = String(row?.alias || row?.abbreviation || "").trim().toUpperCase();
          const rowName = String(row?.name || "").trim().toUpperCase();
          const rowMarket = String(row?.market || "").trim().toUpperCase();
          const rowFull = `${rowMarket} ${rowName}`.trim();
          const normalizedFull = rowFull.replace(/[^A-Z0-9]/g, "");
          return id === effectiveTeamId
            || candidates.has(rowAlias)
            || normalizedFull === normalizedRaw
            || normalizedRaw.includes(normalizedFull)
            || normalizedFull.includes(normalizedRaw);
        });
        const canonical = String(hit?.id || "").trim();
        if (canonical) {
          effectiveTeamId = canonical;
        }
      } catch {
        // keep original teamId when canonical lookup fails
      }
    }
    const cacheKey = `team-profile:v12:${sportUpper}:${effectiveTeamId}`;
    const cached = getRouteCache<TeamProfileData>(cacheKey, 180_000);
    const lastGood = cached || data;
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    
    if (!cached) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const isTimeoutError = (value: unknown): boolean => {
        const msg = String((value as any)?.message || '').toLowerCase();
        const name = String((value as any)?.name || '');
        return msg.includes('timeout') || name === 'AbortError';
      };
      const pageDataOnlyMode = true;
      let profileJson: any = null;
      let scheduleJson: any = null;
      let statsJson: any = null;
      let standingsJson: any = null;
      let gamesJson: any = null;
      let injuriesJson: any = null;
      let splitsJson: any = null;

      apiCalls += 1;
      console.info("PAGE_DATA_START", { route: "team-profile", sport: sportUpper, teamId: effectiveTeamId, requestedTeamId: teamId });
      let pageData: any = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          apiCalls += attempt > 0 ? 1 : 0;
          pageData = await fetchJsonCached<any>(
            `/api/page-data/team-profile?sport=${encodeURIComponent(sportUpper)}&teamId=${encodeURIComponent(effectiveTeamId)}`,
            {
              cacheKey: `page-data-team-profile:v1:${sportUpper}:${effectiveTeamId}`,
              ttlMs: 60_000,
              timeoutMs: 8_000,
              bypassCache: attempt > 0,
              init: { credentials: "include" },
            }
          );
          if (!pageData?.data?.profileJson?.team && attempt === 0) {
            throw new Error("Team profile payload is partial");
          }
          break;
        } catch (attemptErr) {
          lastErr = attemptErr;
          if (isTimeoutError(attemptErr)) {
            console.warn("PAGE_DATA_TIMEOUT", {
              route: "team-profile",
              sport: sportUpper,
              teamId: effectiveTeamId,
              attempt: attempt + 1,
            });
          }
          if (attempt === 0) continue;
          throw attemptErr;
        }
      }

      if (pageData?.data?.profileJson?.team) {
        profileJson = pageData?.data?.profileJson || {};
        scheduleJson = pageData?.data?.scheduleJson || { allGames: [], pastGames: [], upcomingGames: [] };
        statsJson = pageData?.data?.statsJson || { stats: {}, rankings: {} };
        standingsJson = pageData?.data?.standingsJson || { teams: [] };
        gamesJson = pageData?.data?.gamesJson || { games: [] };
        injuriesJson = pageData?.data?.injuriesJson || { injuries: [] };
        splitsJson = pageData?.data?.splitsJson || { splits: null };
      } else {
        console.warn("PAGE_DATA_FALLBACK_USED", { route: "team-profile", reason: "empty_page_data_payload", sport: sportUpper, teamId });
        if (lastGood) {
          setData(lastGood);
          return;
        }
        if (lastErr) {
          throw (lastErr instanceof Error ? lastErr : new Error("Failed to load team data"));
        }
        profileJson = { team: { id: effectiveTeamId || teamId, name: "Unknown", alias: "" } };
        scheduleJson = { allGames: [], pastGames: [], upcomingGames: [] };
        statsJson = { stats: {}, rankings: {} };
        standingsJson = { teams: [] };
        gamesJson = { games: [] };
        injuriesJson = { injuries: [] };
        splitsJson = { splits: null };
      }
      
      // Transform SportsRadar data to our format
      const teamAlias = profileJson.team?.alias || '';
      const teamColors = getTeamColors(sportKey || 'nba', teamAlias);
      
      const team: TeamInfo = {
        id: profileJson.team?.id || effectiveTeamId || teamId,
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
      
      // Transform record with standings fallback (profile payload can be sparse for some leagues/seasons).
      const standingsTeams = Array.isArray(standingsJson?.teams) ? standingsJson.teams : [];
      const profileTeamId = String(profileJson.team?.id || effectiveTeamId || teamId);
      const profileAlias = String(profileJson.team?.alias || '').toLowerCase();
      const profileName = String(profileJson.team?.name || '').toLowerCase();
      const profileMarket = String(profileJson.team?.market || '').toLowerCase();
      const aliasBridge: Record<string, string[]> = {
        cha: ["cho"],
        cho: ["cha"],
        gsw: ["gs"],
        gs: ["gsw"],
        nyk: ["ny"],
        ny: ["nyk"],
        sas: ["sa"],
        sa: ["sas"],
        nop: ["no"],
        no: ["nop"],
        phx: ["pho"],
        pho: ["phx"],
        bkn: ["brk"],
        brk: ["bkn"],
      };
      const profileAliasCandidates = new Set<string>([
        profileAlias,
        ...(aliasBridge[profileAlias] || []),
      ]);
      const normalizedProfileToken = `${profileMarket} ${profileName}`
        .trim()
        .replace(/[^a-z0-9]/g, "");
      const standingsMatch = standingsTeams.find((row: any) => {
        const rowId = String(row?.id || '');
        const rowAlias = String(row?.alias || '').toLowerCase();
        const rowName = String(row?.name || '').toLowerCase();
        const rowMarket = String(row?.market || '').toLowerCase();
        const normalizedRowToken = `${rowMarket} ${rowName}`.trim().replace(/[^a-z0-9]/g, "");
        return rowId === profileTeamId
          || (profileAlias && profileAliasCandidates.has(rowAlias))
          || (profileName && rowName === profileName)
          || (normalizedProfileToken && normalizedRowToken && (
            normalizedProfileToken === normalizedRowToken
            || normalizedProfileToken.includes(normalizedRowToken)
            || normalizedRowToken.includes(normalizedProfileToken)
          ));
      });

      const teamRecord = profileJson.team?.record || {};
      const wins = Number(teamRecord.wins ?? standingsMatch?.wins ?? 0);
      const losses = Number(teamRecord.losses ?? standingsMatch?.losses ?? 0);
      const ties = Number.isFinite(Number(teamRecord.ties ?? standingsMatch?.ties))
        ? Number(teamRecord.ties ?? standingsMatch?.ties)
        : undefined;
      const confWins = Number.isFinite(Number(teamRecord.conference?.wins ?? standingsMatch?.confWins))
        ? Number(teamRecord.conference?.wins ?? standingsMatch?.confWins)
        : undefined;
      const confLosses = Number.isFinite(Number(teamRecord.conference?.losses ?? standingsMatch?.confLosses))
        ? Number(teamRecord.conference?.losses ?? standingsMatch?.confLosses)
        : undefined;
      const homeWins = Number.isFinite(Number(teamRecord.home?.wins ?? standingsMatch?.homeWins))
        ? Number(teamRecord.home?.wins ?? standingsMatch?.homeWins)
        : undefined;
      const homeLosses = Number.isFinite(Number(teamRecord.home?.losses ?? standingsMatch?.homeLosses))
        ? Number(teamRecord.home?.losses ?? standingsMatch?.homeLosses)
        : undefined;
      const awayWins = Number.isFinite(Number(teamRecord.away?.wins ?? teamRecord.road?.wins ?? standingsMatch?.awayWins))
        ? Number(teamRecord.away?.wins ?? teamRecord.road?.wins ?? standingsMatch?.awayWins)
        : undefined;
      const awayLosses = Number.isFinite(Number(teamRecord.away?.losses ?? teamRecord.road?.losses ?? standingsMatch?.awayLosses))
        ? Number(teamRecord.away?.losses ?? teamRecord.road?.losses ?? standingsMatch?.awayLosses)
        : undefined;
      let record: TeamRecord = {
        wins,
        losses,
        ties,
        pct: Number(teamRecord.win_pct ?? standingsMatch?.winPct ?? (wins / Math.max(1, wins + losses))),
        confWins,
        confLosses,
        homeWins,
        homeLosses,
        awayWins,
        awayLosses,
        streak: teamRecord.streak?.length ? { 
          type: teamRecord.streak.kind === 'win' ? 'W' : 'L', 
          count: teamRecord.streak.length 
        } : undefined,
        rank: Number.isFinite(Number(standingsMatch?.rank)) ? Number(standingsMatch?.rank) : undefined,
        playoffSeed: teamRecord.seed
      };
      const splitOverride = splitsJson?.splits || null;
      if (splitOverride) {
        const parseSplitNum = (value: unknown): number | undefined =>
          Number.isFinite(Number(value)) ? Number(value) : undefined;
        record = {
          ...record,
          confWins: parseSplitNum(splitOverride.confWins) ?? record.confWins,
          confLosses: parseSplitNum(splitOverride.confLosses) ?? record.confLosses,
          homeWins: parseSplitNum(splitOverride.homeWins) ?? record.homeWins,
          homeLosses: parseSplitNum(splitOverride.homeLosses) ?? record.homeLosses,
          awayWins: parseSplitNum(splitOverride.awayWins) ?? record.awayWins,
          awayLosses: parseSplitNum(splitOverride.awayLosses) ?? record.awayLosses,
        };
      }
      
      // Transform roster
      const roster: RosterPlayer[] = (profileJson.roster || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        position: p.position || 'N/A',
        jersey: p.jerseyNumber || '-',
        headshot: p.headshot || `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportKey}/players/full/${p.id}.png&w=96&h=70&cb=1`,
        stats: {}
      }));
      
      // Transform schedule - prefer team endpoint; fallback to sport games feed if unavailable.
      const teamAliasUpper = String(team.abbreviation || '').toUpperCase();
      const rawGames = Array.isArray(gamesJson?.games) ? gamesJson.games : [];
      const resolveFeedStatus = (raw: unknown): 'final' | 'live' | 'scheduled' => {
        const statusRaw = String(raw || '').toUpperCase();
        if (statusRaw === 'FINAL' || statusRaw === 'COMPLETED' || statusRaw === 'CLOSED' || statusRaw === 'STATUS_FINAL') return 'final';
        if (statusRaw === 'LIVE' || statusRaw === 'IN_PROGRESS' || statusRaw === 'STATUS_IN_PROGRESS') return 'live';
        return 'scheduled';
      };
      const isBasketballSport = new Set(['NBA', 'NCAAB']).has(sportUpper);
      const expandAliasCandidates = (raw: string): Set<string> => {
        const code = String(raw || '').trim().toUpperCase();
        const out = new Set<string>();
        if (!code) return out;
        out.add(code);
        const map: Record<string, string[]> = {
          GSW: ['GS'],
          GS: ['GSW'],
          NYK: ['NY'],
          NY: ['NYK'],
          SAS: ['SA'],
          SA: ['SAS'],
          NOP: ['NO'],
          NO: ['NOP'],
          PHX: ['PHO'],
          PHO: ['PHX'],
          UTA: ['UTAH'],
          UTAH: ['UTA'],
        };
        for (const alt of map[code] || []) out.add(alt);
        return out;
      };
      const teamAliasCandidates = expandAliasCandidates(teamAliasUpper);
      const isTeamAlias = (value: unknown): boolean => {
        const code = String(value || '').trim().toUpperCase();
        if (!code) return false;
        if (teamAliasCandidates.has(code)) return true;
        const reverse = expandAliasCandidates(code);
        for (const t of teamAliasCandidates) {
          if (reverse.has(t)) return true;
        }
        return false;
      };
      const cleanScore = (value: number | undefined, status: 'final' | 'live' | 'scheduled') => {
        if (value === undefined) return undefined;
        if (isBasketballSport && status === 'final' && value === 0) return undefined;
        return value;
      };
      const findRawGameMatch = (row: GameResult): any | null => {
        const rowId = String(row.id || '').trim();
        const rowDateTs = new Date(row.date).getTime();
        const oppAbbr = String(row?.opponent?.abbreviation || '').toUpperCase();

        const byId = rawGames.find((g: any) => {
          const gid = String(g?.game_id || g?.id || '').trim();
          const ext = String(g?.external_id || '').trim();
          return (rowId && (gid === rowId || ext === rowId));
        });
        if (byId) return byId;

        return rawGames.find((g: any) => {
          const homeCode = String(g?.home_team_code || '').toUpperCase();
          const awayCode = String(g?.away_team_code || '').toUpperCase();
          const hasTeam = teamAliasUpper && (isTeamAlias(homeCode) || isTeamAlias(awayCode));
          const hasOpp = oppAbbr && (homeCode === oppAbbr || awayCode === oppAbbr);
          if (!hasTeam || !hasOpp) return false;
          const feedTs = new Date(String(g?.start_time || g?.scheduled || '')).getTime();
          if (!Number.isFinite(feedTs) || !Number.isFinite(rowDateTs)) return true;
          return Math.abs(feedTs - rowDateTs) <= 18 * 60 * 60 * 1000;
        }) || null;
      };
      const enrichWithGamesFeed = (row: GameResult): GameResult => {
        const feed = findRawGameMatch(row);
        if (!feed) return row;
        const status = resolveFeedStatus(feed?.status || row.status);
        const feedHomeScoreRaw = safeNum(feed?.home_score);
        const feedAwayScoreRaw = safeNum(feed?.away_score);
        const feedHomeScore = cleanScore(feedHomeScoreRaw, status);
        const feedAwayScore = cleanScore(feedAwayScoreRaw, status);
        const feedHomeCode = String(feed?.home_team_code || '').toUpperCase();
        const feedAwayCode = String(feed?.away_team_code || '').toUpperCase();
        const hasFeedSides = Boolean(feedHomeCode && feedAwayCode);
        const isHome = hasFeedSides
          ? isTeamAlias(feedHomeCode)
          : row.homeAway === 'home';
        const teamScore = feedHomeScore !== undefined && feedAwayScore !== undefined
          ? (isHome ? feedHomeScore : feedAwayScore)
          : row.teamScore;
        const oppScore = feedHomeScore !== undefined && feedAwayScore !== undefined
          ? (isHome ? feedAwayScore : feedHomeScore)
          : row.oppScore;
        const spreadHome = safeNum(feed?.spread_home ?? feed?.spreadHome ?? feed?.spread);
        const teamSpread = spreadHome !== undefined ? (isHome ? spreadHome : -spreadHome) : row.spread;
        const total = safeNum(feed?.over_under ?? feed?.total);
        const result = status === 'final' && typeof teamScore === 'number' && typeof oppScore === 'number'
          ? (teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T')
          : row.result;
        const oppAlias = hasFeedSides
          ? (isHome ? feedAwayCode : feedHomeCode)
          : String(row?.opponent?.abbreviation || '').toUpperCase();
        const oppName = hasFeedSides
          ? String(isHome ? feed?.away_team_name : feed?.home_team_name || oppAlias || row?.opponent?.name || 'Opponent')
          : String(row?.opponent?.name || oppAlias || 'Opponent');
        return {
          ...row,
          homeAway: isHome ? 'home' : 'away',
          opponent: {
            name: oppName,
            abbreviation: oppAlias,
            logo: `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${oppAlias.toLowerCase()}.png`,
          },
          teamScore,
          oppScore,
          spread: teamSpread ?? null,
          total: total ?? row.total ?? null,
          status,
          result,
        };
      };
      const mapTeamScheduleGame = (g: any, forceStatus?: 'scheduled' | 'final' | 'live'): GameResult => {
        const homeAlias = String(g?.homeTeamAlias || g?.homeTeam?.alias || '').toUpperCase();
        const awayAlias = String(g?.awayTeamAlias || g?.awayTeam?.alias || '').toUpperCase();
        const homeName = String(g?.homeTeamName || g?.homeTeam?.name || g?.homeTeam?.displayName || homeAlias);
        const awayName = String(g?.awayTeamName || g?.awayTeam?.name || g?.awayTeam?.displayName || awayAlias);
        const isHome = typeof g?.isHome === 'boolean' ? g.isHome : (teamAliasUpper ? isTeamAlias(homeAlias) : true);
        const homeScoreRaw = safeNum(g?.homeScore);
        const awayScoreRaw = safeNum(g?.awayScore);
        const parsedStatus: 'final' | 'live' | 'scheduled' = forceStatus || (() => {
          const statusRaw = String(g?.status?.name || g?.status || '').toUpperCase();
          if (
            statusRaw.includes('FINAL')
            || statusRaw.includes('CLOSED')
            || statusRaw.includes('COMPLETED')
            || statusRaw.includes('POSTPONED')
            || statusRaw.includes('CANCELED')
          ) return 'final';
          if (statusRaw.includes('LIVE') || statusRaw.includes('IN_PROGRESS') || statusRaw.includes('STATUS_IN_PROGRESS')) return 'live';
          return 'scheduled';
        })();
        const homeScore = cleanScore(homeScoreRaw, parsedStatus);
        const awayScore = cleanScore(awayScoreRaw, parsedStatus);
        const result = parsedStatus === 'final' && homeScore != null && awayScore != null
          ? (isHome
              ? (homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'T')
              : (awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'T'))
          : undefined;
        const oppAlias = isHome ? awayAlias : homeAlias;
        const oppName = isHome ? awayName : homeName;
        const rawSpread = safeNum(g?.spread);
        const teamSpread = rawSpread !== undefined ? (isHome ? rawSpread : -rawSpread) : null;
        return {
          id: String(g?.id || ''),
          date: String(g?.scheduledTime || ''),
          opponent: {
            name: oppName,
            abbreviation: oppAlias,
            logo: `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${oppAlias.toLowerCase()}.png`
          },
          homeAway: isHome ? 'home' : 'away',
          result,
          teamScore: isHome ? homeScore : awayScore,
          oppScore: isHome ? awayScore : homeScore,
          spread: (() => {
            const spreadHome = safeNum(g?.spreadHome);
            return spreadHome !== undefined ? (isHome ? spreadHome : -spreadHome) : teamSpread;
          })(),
          total: (() => {
            const totalLine = safeNum(g?.totalLine);
            const fallbackTotal = safeNum(g?.total ?? g?.overUnder ?? g?.over_under);
            return totalLine ?? fallbackTotal ?? null;
          })(),
          status: parsedStatus,
          time: g?.scheduledTime ? new Date(g.scheduledTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined,
        };
      };
      const mapSchedulePayloadRows = (payload: any): GameResult[] => {
        const rows: any[] = Array.isArray(payload?.allGames) && payload.allGames.length > 0
          ? payload.allGames
          : [
              ...(Array.isArray(payload?.pastGames) ? payload.pastGames : []),
              ...(Array.isArray(payload?.upcomingGames) ? payload.upcomingGames : []),
            ];
        return rows.map((g: any) => mapTeamScheduleGame(g));
      };
      let scheduleFromTeamEndpointRaw: GameResult[] = mapSchedulePayloadRows(scheduleJson);
      const dateKey = (value: string | undefined) => {
        const ms = new Date(String(value || '')).getTime();
        if (!Number.isFinite(ms)) return '';
        return new Date(ms).toISOString().slice(0, 10);
      };
      const enrichMissingLinesByDate = async (rows: GameResult[]): Promise<GameResult[]> => {
        if (pageDataOnlyMode) return rows;
        const lineMissing = rows.filter((row) => row.status === 'final' && (row.spread == null || row.total == null));
        if (lineMissing.length === 0) return rows;

        const days = Array.from(new Set(lineMissing.map((row) => dateKey(row.date)).filter(Boolean))).slice(0, 8);
        if (days.length === 0) return rows;

        const gamesByDay = new Map<string, any[]>();
        await Promise.all(
          days.map(async (day) => {
            try {
              const json = await fetchJsonCached<{ games?: any[] }>(
                `/api/games?sport=${sportUpper}&includeOdds=1&date=${encodeURIComponent(day)}`,
                {
                  cacheKey: `games-lite-by-date:${sportUpper}:${day}:v1`,
                  ttlMs: 120_000,
                  timeoutMs: 2_400,
                  init: { credentials: 'include' },
                }
              );
              gamesByDay.set(day, Array.isArray(json?.games) ? json.games : []);
            } catch {
              gamesByDay.set(day, []);
            }
          })
        );

        const rowsWithGameMatch = rows.map((row) => {
          if (row.status !== 'final' || (row.spread != null && row.total != null)) return row;
          const day = dateKey(row.date);
          const dayGames = gamesByDay.get(day) || [];
          if (dayGames.length === 0) return row;

          const rowTs = new Date(row.date).getTime();
          const oppAbbr = String(row?.opponent?.abbreviation || '').toUpperCase();
          const matched = dayGames.find((g: any) => {
            const homeCode = String(g?.home_team_code || '').toUpperCase();
            const awayCode = String(g?.away_team_code || '').toUpperCase();
            const hasTeam = teamAliasUpper && (homeCode === teamAliasUpper || awayCode === teamAliasUpper);
            const hasOpp = oppAbbr && (homeCode === oppAbbr || awayCode === oppAbbr);
            if (!hasTeam || !hasOpp) return false;
            const feedTs = new Date(String(g?.start_time || g?.scheduled || '')).getTime();
            if (!Number.isFinite(feedTs) || !Number.isFinite(rowTs)) return true;
            return Math.abs(feedTs - rowTs) <= 18 * 60 * 60 * 1000;
          });
          if (!matched) return row;
          const isHome = String(matched?.home_team_code || '').toUpperCase() === teamAliasUpper;
          const spreadHome = safeNum(matched?.spread_home ?? matched?.spreadHome ?? matched?.spread);
          const total = safeNum(matched?.over_under ?? matched?.total);
          return {
            ...row,
            id: String(matched?.game_id || matched?.id || row.id || ''),
            spread: row.spread ?? (spreadHome !== undefined ? (isHome ? spreadHome : -spreadHome) : null),
            total: row.total ?? (total ?? null),
          };
        });

        const missingAfterDate = rowsWithGameMatch.filter((row) => row.status === 'final' && (row.spread == null || row.total == null));
        const historyByGameId = new Map<string, { spread?: number | null; total?: number | null }>();
        const idsNeedingHistory = Array.from(new Set(
          missingAfterDate
            .map((row) => String(row.id || '').trim())
            .filter(Boolean)
        )).slice(0, 8);

        if (idsNeedingHistory.length > 0) {
          await Promise.all(
            idsNeedingHistory.map(async (gameId) => {
              try {
                const historyJson = await fetchJsonCached<{ latest?: { spread?: number | null; total?: number | null } }>(
                  `/api/games/${encodeURIComponent(gameId)}/line-history`,
                  {
                    cacheKey: `game-line-history:${gameId}:v2`,
                    ttlMs: 120_000,
                    timeoutMs: 2_200,
                    init: { credentials: 'include' },
                  }
                );
                historyByGameId.set(gameId, {
                  spread: safeNum(historyJson?.latest?.spread),
                  total: safeNum(historyJson?.latest?.total),
                });
              } catch {
                historyByGameId.set(gameId, {});
              }
            })
          );
        }

        const withHistoryFallback = rowsWithGameMatch.map((row) => {
          if (row.status !== 'final' || (row.spread != null && row.total != null)) return row;
          const history = historyByGameId.get(String(row.id || '').trim());
          if (!history) return row;
          return {
            ...row,
            spread: row.spread ?? (history.spread ?? null),
            total: row.total ?? (history.total ?? null),
          };
        });

        // Last-mile NBA fallback: if a row carries an ESPN event id, fetch ESPN summary
        // directly from browser to recover spread/total when server-side ID mapping misses.
        if (sportUpper !== 'NBA') return withHistoryFallback;
        const espnTargets = withHistoryFallback
          .filter((row) => row.status === 'final' && (row.spread == null || row.total == null) && /^\d{7,}$/.test(String(row.id || '')))
          .slice(0, 8);
        if (espnTargets.length === 0) return withHistoryFallback;

        const espnLineById = new Map<string, { spreadHome: number | null; total: number | null }>();
        const parseEspnNum = (value: unknown): number | null => {
          if (value === null || value === undefined) return null;
          if (typeof value === 'string' && value.trim() === '') return null;
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
        };
        await Promise.all(
          espnTargets.map(async (row) => {
            const eventId = String(row.id || '').trim();
            if (!eventId) return;
            try {
              const payload = await fetchJsonCached<{ spreadHome?: number | null; totalLine?: number | null }>(
                `/api/teams/NBA/espn-line?eventId=${encodeURIComponent(eventId)}`,
                {
                  cacheKey: `espn-line:${eventId}:v1`,
                  ttlMs: 6 * 60 * 60 * 1000,
                  timeoutMs: 3_500,
                  init: { credentials: 'include' },
                }
              );
              const spreadHome = parseEspnNum(payload?.spreadHome);
              const total = parseEspnNum(payload?.totalLine);
              espnLineById.set(eventId, { spreadHome, total });
            } catch {
              // Best-effort only.
            }
          })
        );

        return withHistoryFallback.map((row) => {
          if (row.status !== 'final' || (row.spread != null && row.total != null)) return row;
          const eventId = String(row.id || '').trim();
          const espnLine = espnLineById.get(eventId);
          if (!espnLine) return row;
          const isHome = row.homeAway === 'home';
          const teamSpread = espnLine.spreadHome != null ? (isHome ? espnLine.spreadHome : -espnLine.spreadHome) : null;
          return {
            ...row,
            spread: row.spread ?? teamSpread,
            total: row.total ?? (espnLine.total ?? null),
          };
        });
      };
      let scheduleFromTeamEndpoint = await enrichMissingLinesByDate(scheduleFromTeamEndpointRaw.map(enrichWithGamesFeed));
      // Self-heal for degraded fast-timeout payloads: one quick fresh retry only.
      if (!pageDataOnlyMode && sportUpper === 'NBA' && scheduleFromTeamEndpoint.filter((g) => g.status === 'final').length === 0) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3_500);
          try {
            const res = await fetch(`/api/teams/${sportUpper}/${teamId}/schedule?fresh=1`, {
              credentials: 'include',
              signal: controller.signal,
            });
            if (res.ok) {
              const freshScheduleJson = await res.json().catch(() => null);
              if (freshScheduleJson) {
                const freshRaw = mapSchedulePayloadRows(freshScheduleJson);
                const freshMapped = await enrichMissingLinesByDate(freshRaw.map(enrichWithGamesFeed));
                if (freshMapped.filter((g) => g.status === 'final').length > 0) {
                  scheduleFromTeamEndpointRaw = freshRaw;
                  scheduleFromTeamEndpoint = freshMapped;
                }
              }
            }
          } finally {
            clearTimeout(timer);
          }
        } catch {
          // Keep initial schedule; stability fallback paths still apply below.
        }
      }
      const teamAllGamesFromEndpoint: GameResult[] = (Array.isArray(scheduleJson?.allGames) ? scheduleJson.allGames : [])
        .map((g: any) => mapTeamScheduleGame(g))
        .map(enrichWithGamesFeed)
        .filter((g: GameResult) => Boolean(g.id && g.date));
      const fallbackSchedule: GameResult[] = rawGames
        .filter((g: any) => {
          const homeCode = String(g?.home_team_code || '').toUpperCase();
          const awayCode = String(g?.away_team_code || '').toUpperCase();
          return teamAliasUpper && (isTeamAlias(homeCode) || isTeamAlias(awayCode));
        })
        .map((g: any) => {
          const isHome = isTeamAlias(String(g?.home_team_code || '').toUpperCase());
          const homeScoreRaw = safeNum(g?.home_score);
          const awayScoreRaw = safeNum(g?.away_score);
          const statusRaw = String(g?.status || '').toUpperCase();
          const status: 'final' | 'live' | 'scheduled' =
            statusRaw === 'FINAL' || statusRaw === 'COMPLETED' || statusRaw === 'CLOSED' || statusRaw === 'STATUS_FINAL'
              ? 'final'
              : statusRaw === 'LIVE' || statusRaw === 'IN_PROGRESS'
                ? 'live'
                : 'scheduled';
          const homeScore = cleanScore(homeScoreRaw, status);
          const awayScore = cleanScore(awayScoreRaw, status);
          const result = status === 'final' && homeScore != null && awayScore != null
            ? (isHome
                ? (homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'T')
                : (awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'T'))
            : undefined;
          const rawSpread = safeNum(g?.spread ?? g?.home_spread);
          const teamSpread = rawSpread !== undefined ? (isHome ? rawSpread : -rawSpread) : null;
          return {
            id: String(g?.game_id || ''),
            date: String(g?.start_time || ''),
            opponent: {
              name: String(isHome ? g?.away_team_name : g?.home_team_name || ''),
              abbreviation: String(isHome ? g?.away_team_code : g?.home_team_code || ''),
              logo: `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${String(isHome ? g?.away_team_code : g?.home_team_code || '').toLowerCase()}.png`,
            },
            homeAway: isHome ? 'home' : 'away',
            result,
            teamScore: isHome ? homeScore : awayScore,
            oppScore: isHome ? awayScore : homeScore,
            spread: teamSpread,
            total: safeNum(g?.over_under ?? g?.total) ?? null,
            status,
            time: g?.start_time ? new Date(g.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined,
          } as GameResult;
        })
        .filter((g: any) => g.id && g.date)
        .sort((a: GameResult, b: GameResult) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const normalizeScheduleRows = (rows: any[]): GameResult[] => (Array.isArray(rows) ? rows : []).map((row: any) => {
        const homeAway = row?.homeAway === 'away' ? 'away' : 'home';
        const homeAlias = String(row?.homeTeamAlias || row?.homeTeam?.alias || row?.home_team_code || '').trim().toUpperCase();
        const awayAlias = String(row?.awayTeamAlias || row?.awayTeam?.alias || row?.away_team_code || '').trim().toUpperCase();
        const fallbackOppAbbr = homeAway === 'home' ? awayAlias : homeAlias;
        const oppAbbr = String(row?.opponent?.abbreviation || fallbackOppAbbr || '').trim().toUpperCase();
        const oppName = String(
          row?.opponent?.name
          || (homeAway === 'home' ? row?.awayTeamName || row?.away_team_name : row?.homeTeamName || row?.home_team_name)
          || oppAbbr
          || 'Opponent'
        );
        const logo = String(row?.opponent?.logo || `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${oppAbbr.toLowerCase()}.png`);
        const statusRaw = String(row?.status?.name || row?.status || '').toUpperCase();
        const hasScores = Number.isFinite(Number(row?.teamScore)) && Number.isFinite(Number(row?.oppScore));
        const status: 'final' | 'live' | 'scheduled' =
          statusRaw.includes('FINAL') || statusRaw.includes('COMPLETED') || statusRaw.includes('CLOSED') || statusRaw.includes('STATUS_FINAL')
            ? 'final'
            : statusRaw.includes('LIVE') || statusRaw.includes('IN_PROGRESS') || statusRaw.includes('STATUS_IN_PROGRESS')
              ? 'live'
              : (hasScores ? 'final' : 'scheduled');
        return {
          ...row,
          id: String(row?.id || ''),
          date: String(row?.date || row?.scheduledTime || row?.start_time || ''),
          opponent: {
            name: oppName,
            abbreviation: oppAbbr,
            logo,
          },
          homeAway,
          status,
        } as GameResult;
      }).filter((row) => Boolean(row.date));
      const scheduleQuality = (rows: GameResult[]) => {
        const total = rows.length;
        const withOpp = rows.filter((row) => String(row?.opponent?.abbreviation || '').trim().length > 0).length;
        const finals = rows.filter((row) => row.status === 'final').length;
        return { total, withOpp, finals };
      };
      const endpointQuality = scheduleQuality(scheduleFromTeamEndpoint);
      const fallbackQuality = scheduleQuality(fallbackSchedule);
      const endpointLooksDegraded =
        endpointQuality.total > 0
        && (
          endpointQuality.withOpp < Math.max(3, Math.floor(endpointQuality.total * 0.2))
          || (endpointQuality.finals === 0 && fallbackQuality.finals > 0)
        );
      const preferredScheduleSource =
        endpointQuality.total === 0
          ? fallbackSchedule
          : (endpointLooksDegraded && fallbackQuality.total > 0 ? fallbackSchedule : scheduleFromTeamEndpoint);
      let schedule: GameResult[] = normalizeScheduleRows(preferredScheduleSource);
      const hasScheduleData = Array.isArray(schedule) && schedule.length > 0;
      const hasLastGoodSchedule = Array.isArray(lastGood?.schedule) && lastGood!.schedule.length > 0;
      const lastGoodSchedule = hasLastGoodSchedule ? normalizeScheduleRows(lastGood!.schedule) : [];
      const currentQuality = scheduleQuality(schedule);
      const lastGoodQuality = scheduleQuality(lastGoodSchedule);
      const scheduleLooksDowngraded =
        hasLastGoodSchedule
        && (
          currentQuality.total === 0
          || (currentQuality.finals === 0 && lastGoodQuality.finals > 0)
          || (
            currentQuality.finals < lastGoodQuality.finals
            && currentQuality.total < Math.max(5, Math.floor(lastGoodQuality.total * 0.35))
          )
        );
      // Stability lock: never replace a previously good schedule with a degraded transient payload.
      if ((!hasScheduleData && hasLastGoodSchedule) || scheduleLooksDowngraded) {
        schedule = lastGoodSchedule;
      }
      const h2hOpponent = schedule.find((g) => g.status === 'scheduled' || g.status === 'live')?.opponent
        || schedule.find((g) => g.status === 'final')?.opponent
        || null;
      let teamH2H: TeamH2HData | null = null;
      if (!pageDataOnlyMode && h2hOpponent?.abbreviation) {
        try {
          const h2hUrl = `/api/teams/${sportKey.toUpperCase()}/h2h?teamA=${encodeURIComponent(String(team.id || team.abbreviation || team.name || ''))}&teamB=${encodeURIComponent(String(h2hOpponent.abbreviation || h2hOpponent.name || ''))}&window=10`;
          const h2hJson = await fetchJsonCached<TeamH2HData>(h2hUrl, {
            cacheKey: `team-h2h:${sportKey.toUpperCase()}:${String(team.id || team.abbreviation || team.name || '').toUpperCase()}:${String(h2hOpponent.abbreviation || h2hOpponent.name || '').toUpperCase()}`,
            ttlMs: 90_000,
            timeoutMs: 5_000,
            init: { credentials: 'include' },
          });
          if (Number(h2hJson?.sampleSize) > 0) {
            teamH2H = h2hJson as TeamH2HData;
          }
        } catch {
          // Non-fatal: page continues without H2H block.
        }
      }

      // Derive split records when provider sends placeholder 0-0 values.
      if (
        (record.confWins === 0 && record.confLosses === 0 && record.wins + record.losses > 0)
        || (record.homeWins === 0 && record.homeLosses === 0 && record.wins + record.losses > 0)
        || (record.awayWins === 0 && record.awayLosses === 0 && record.wins + record.losses > 0)
      ) {
        const splitSource = teamAllGamesFromEndpoint.length > 0 ? teamAllGamesFromEndpoint : fallbackSchedule;
        const finals = splitSource.filter((g) => g.status === 'final');
        if (finals.length > 0) {
          let homeWinsDerived = 0;
          let homeLossesDerived = 0;
          let awayWinsDerived = 0;
          let awayLossesDerived = 0;
          let confWinsDerived = 0;
          let confLossesDerived = 0;
          const teamConference = String(team.conference || standingsMatch?.conferenceName || '').trim().toLowerCase();
          const confByAlias = new Map<string, string>();
          for (const row of standingsTeams) {
            const alias = String(row?.alias || '').trim().toUpperCase();
            const conf = String(row?.conferenceName || '').trim().toLowerCase();
            if (alias && conf) confByAlias.set(alias, conf);
          }
          for (const g of finals) {
            if (!g.result || g.result === 'T') continue;
            const didWin = g.result === 'W';
            if (g.homeAway === 'home') {
              if (didWin) homeWinsDerived += 1;
              else homeLossesDerived += 1;
            } else {
              if (didWin) awayWinsDerived += 1;
              else awayLossesDerived += 1;
            }
            if (teamConference) {
              const oppConf = confByAlias.get(String(g?.opponent?.abbreviation || '').toUpperCase());
              if (oppConf && oppConf === teamConference) {
                if (didWin) confWinsDerived += 1;
                else confLossesDerived += 1;
              }
            }
          }
          record = {
            ...record,
            homeWins: (record.homeWins === 0 && record.homeLosses === 0 && (homeWinsDerived + homeLossesDerived) > 0) ? homeWinsDerived : record.homeWins,
            homeLosses: (record.homeWins === 0 && record.homeLosses === 0 && (homeWinsDerived + homeLossesDerived) > 0) ? homeLossesDerived : record.homeLosses,
            awayWins: (record.awayWins === 0 && record.awayLosses === 0 && (awayWinsDerived + awayLossesDerived) > 0) ? awayWinsDerived : record.awayWins,
            awayLosses: (record.awayWins === 0 && record.awayLosses === 0 && (awayWinsDerived + awayLossesDerived) > 0) ? awayLossesDerived : record.awayLosses,
            confWins: (record.confWins === 0 && record.confLosses === 0 && (confWinsDerived + confLossesDerived) > 0) ? confWinsDerived : record.confWins,
            confLosses: (record.confWins === 0 && record.confLosses === 0 && (confWinsDerived + confLossesDerived) > 0) ? confLossesDerived : record.confLosses,
          };
        }
      }
      let injuries: TeamInjury[] = (Array.isArray(injuriesJson?.injuries) ? injuriesJson.injuries : []).map((row: any) => ({
        id: String(row?.id || ''),
        playerName: String(row?.playerName || ''),
        status: String(row?.status || ''),
        detail: String(row?.detail || ''),
        injuryType: String(row?.injuryType || ''),
        returnDate: String(row?.returnDate || ''),
        headshot: String(row?.headshot || ''),
      }));
      const hasLastGoodInjuries = Array.isArray(lastGood?.injuries) && lastGood!.injuries.length > 0;
      if (injuries.length === 0 && hasLastGoodInjuries) {
        injuries = lastGood!.injuries;
      }
      
      // Transform stats
      const srStats = statsJson.stats || {};
      const rankings = statsJson.rankings || {};
      const stats: TeamStats = {
        ppg: safeNum(srStats.pointsPerGame) ?? safeNum(srStats.goalsPerGame) ?? safeNum(standingsMatch?.pointsFor),
        oppPpg: safeNum(srStats.oppPointsPerGame) ?? safeNum(srStats.goalsAgainstPerGame) ?? safeNum(standingsMatch?.pointsAgainst),
        rpg: srStats.reboundsPerGame,
        apg: srStats.assistsPerGame,
        fgPct: normalizePct(srStats.fieldGoalPct),
        threePct: normalizePct(srStats.threePointPct),
        offRank: rankings.offense,
        defRank: rankings.defense
      };
      
      const hydratedTeam: TeamInfo = {
        ...team,
        conference: team.conference || standingsMatch?.conferenceName,
        division: team.division || standingsMatch?.divisionName,
      };

      const nextData = {
        team: hydratedTeam,
        record,
        roster,
        schedule,
        stats,
        injuries,
        teamH2H: teamH2H || lastGood?.teamH2H || null,
      };
      setData(nextData);
      setRouteCache(cacheKey, nextData, 240_000);
      console.info("PAGE_DATA_SUCCESS", {
        route: "team-profile",
        sport: sportUpper,
        teamId,
        hasTeam: Boolean(nextData?.team?.id),
        scheduleGames: Array.isArray(nextData?.schedule) ? nextData.schedule.length : 0,
      });
    } catch (err: any) {
      console.error('[TeamProfile] Fetch error:', err);
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('timeout') || String(err?.name || '') === 'AbortError') {
        console.warn("PAGE_DATA_TIMEOUT", { route: "team-profile", sport: String(sportKey || "").toUpperCase(), teamId });
      }
      console.warn("PAGE_DATA_FALLBACK_USED", { route: "team-profile", reason: "request_failed", sport: String(sportKey || "").toUpperCase(), teamId });
      if (lastGood || data) {
        setError(null);
      } else {
        setError(msg.includes('404') ? 'Team not found' : (err.message || 'Failed to load team data'));
      }
    } finally {
      void fetch("/api/page-data/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          route: "team-profile",
          loadMs: Math.max(0, Date.now() - loadStartedAt),
          apiCalls,
          oddsAvailableAtFirstRender: false,
        }),
      }).catch(() => undefined);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [sportKey, teamId]);

  useEffect(() => {
    if (!sportKey || !teamId || !data?.team || !scoutEnabled || loading) return;
    const key = "scout-flow:recent:v1";
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as ScoutRecentEntry[]) : [];
      const next: ScoutRecentEntry = {
        type: "team",
        label: data.team.name,
        subtitle: data.team.abbreviation || undefined,
        sport: sportKey.toUpperCase(),
        path: `/sports/${sportKey.toLowerCase()}/team/${encodeURIComponent(teamId)}`,
        ts: Date.now(),
      };
      const merged = [next, ...parsed.filter((row) => row.path !== next.path)].slice(0, 12);
      window.localStorage.setItem(key, JSON.stringify(merged));
      setScoutRecent(merged);
    } catch {
      // Ignore localStorage failures.
    }
  }, [sportKey, teamId, data?.team?.name, data?.team?.abbreviation, scoutEnabled, loading]);

  useEffect(() => {
    if (!scoutEnabled || !sportKey || loading) return;
    let cancelled = false;
    (async () => {
      const sportUpper = sportKey.toUpperCase();
      const players = await fetchJsonCached<{ props?: Array<{ player_name?: string; team?: string; sport?: string }> }>(
        `/api/sports-data/props/today?sport=${encodeURIComponent(sportUpper)}&limit=220&offset=0`,
        {
          cacheKey: `scout-flow:players:${sportUpper}:v1`,
          ttlMs: 45_000,
          timeoutMs: 4_500,
          init: { credentials: "include" },
        }
      ).catch(() => ({ props: [] }));
      const standings = await fetchJsonCached<{ teams?: Array<{ id?: string; alias?: string; name?: string }> }>(
        `/api/teams/${encodeURIComponent(sportUpper)}/standings`,
        {
          cacheKey: `scout-flow:teams:${sportUpper}:v1`,
          ttlMs: 90_000,
          timeoutMs: 4_500,
          init: { credentials: "include" },
        }
      ).catch(() => ({ teams: [] }));
      if (cancelled) return;

      const playerMap = new Map<string, { name: string; team: string; sport: string }>();
      for (const row of Array.isArray(players?.props) ? players.props : []) {
        const name = String(row?.player_name || "").trim();
        if (!name) continue;
        const mapKey = name.toLowerCase();
        if (!playerMap.has(mapKey)) {
          playerMap.set(mapKey, {
            name,
            team: String(row?.team || "").trim(),
            sport: String(row?.sport || sportUpper).toUpperCase(),
          });
        }
      }
      setScoutPlayers(Array.from(playerMap.values()).slice(0, 150));
      setScoutTeams(
        (Array.isArray(standings?.teams) ? standings.teams : [])
          .map((row) => ({
            id: String(row?.id || "").trim(),
            alias: String(row?.alias || "").trim().toUpperCase(),
            name: String(row?.name || "").trim(),
          }))
          .filter((row) => row.id && row.alias)
          .slice(0, 40)
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sportKey, scoutEnabled, loading]);

  const scoutItems = useMemo<ScoutFlowItem[]>(() => {
    if (!scoutEnabled || !sportKey) return [];
    const sportUpper = sportKey.toUpperCase();
    const recentItems: ScoutFlowItem[] = scoutRecent
      .filter((row) => row.sport === sportUpper)
      .slice(0, 6)
      .map((row) => ({
        id: `recent:${row.path}`,
        label: row.label,
        subtitle: row.subtitle || "Recent view",
        kind: "recent",
        onSelect: () => navigate(row.path),
      }));
    const playerItems: ScoutFlowItem[] = scoutPlayers
      .slice(0, 12)
      .map((row) => ({
        id: `player:${row.name}`,
        label: row.name,
        subtitle: row.team || "Player",
        kind: "player",
        onSelect: () => {
          logPlayerNavigation(row.name, sportUpper);
          navigate(buildPlayerRoute(sportUpper, row.name));
        },
      }));
    const teamItems: ScoutFlowItem[] = scoutTeams
      .filter((row) => row.id !== teamId)
      .slice(0, 12)
      .map((row) => ({
        id: `team:${row.id}`,
        label: row.name || row.alias,
        subtitle: row.alias,
        kind: "team",
        onSelect: () => {
          logTeamNavigation(row.id, sportKey);
          navigate(buildTeamRoute(String(sportKey || ""), row.id));
        },
      }));
    return [...recentItems, ...playerItems, ...teamItems];
  }, [scoutEnabled, sportKey, scoutRecent, scoutPlayers, scoutTeams, navigate, teamId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error || 'Unknown error'} onRetry={fetchTeamData} />;

  const { team, record, roster, schedule, stats, injuries, teamH2H } = data;

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
      <TeamHero
        team={team}
        record={record}
        sportKey={sportKey || "nba"}
        league={String(team.conference || team.division || "")}
      />

      {/* Content */}
      <div className="px-4 space-y-4 -mt-4 relative z-10">
        {scoutEnabled && (
          <PremiumScoutFlowBar
            title="Coach G Flow"
            placeholder="Jump to team or player..."
            items={scoutItems}
            quickActions={[
              { id: "games", label: "Games", onClick: () => navigate(`/games?sport=${String(sportKey || "").toUpperCase()}`) },
              { id: "props", label: "Player Props", onClick: () => navigate("/props") },
            ]}
          />
        )}
        {/* Stats Grid */}
        <TeamStatsGrid stats={stats} sportKey={sportKey || 'nba'} />

        {/* Matchup Edge (Upcoming + Last 5 + Historical vs Selected Team) */}
        <TeamMatchupEdgeSection
          sportKey={sportKey || 'nba'}
          teamAbbr={team.abbreviation}
          teamName={team.name}
          schedule={schedule}
          initialH2H={teamH2H}
        />

        {/* Roster Preview */}
        <RosterPreview 
          roster={roster} 
          sportKey={sportKey || 'nba'} 
          teamAbbr={team.abbreviation}
        />

        {/* Injuries */}
        <InjuriesPreview injuries={injuries} />

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
