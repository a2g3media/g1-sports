/**
 * TeamProfilePage - Comprehensive Team Profile Hub
 * 
 * Route: /sports/:sportKey/team/:teamId
 * Shows team info, stats, roster preview, recent/upcoming games
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Trophy, Users, Calendar,
  MapPin, ChevronRight, Target, BarChart3
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { getTeamColors } from "@/react-app/lib/teamColors";
import { motion, AnimatePresence } from "framer-motion";
import FavoriteEntityButton from "@/react-app/components/FavoriteEntityButton";
import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import { prefetchFullPlayerProfileSnapshot } from "@/react-app/lib/playerProfileSnapshotPrewarm";
import { getRouteCache, setRouteCache } from "@/react-app/lib/routeDataCache";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";
import PremiumScoutFlowBar, { type ScoutFlowItem } from "@/react-app/components/PremiumScoutFlowBar";
import {
  buildPlayerRoute,
  buildTeamRoute,
  logPlayerNavigation,
  logTeamNavigation,
} from "@/react-app/lib/navigationRoutes";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";
import {
  readAndRepairScoutRecentStorage,
  sanitizeScoutRecentList,
  SCOUT_FLOW_STORAGE_KEY,
  fetchScoutFlowPlayersAndTeams,
  isLikelyUuid,
  navigateToScoutRecentPlayer,
  navigateToScoutRecentTeam,
  parsePlayerProfilePath,
  parseTeamProfilePath,
  validateScoutRecentEntry,
  type ScoutRecentEntry,
  type ScoutFlowPlayerRow,
  type ScoutFlowTeamRow,
} from "@/react-app/lib/scoutFlowRail";

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
  playerId?: string;
  name: string;
  position: string;
  jersey: string;
  status?: string;
  headshot?: string;
  routeTarget?: string;
  clickable?: boolean;
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

function safeNum(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function extractEspnPlayerIdFromHeadshot(headshotUrl: unknown): string {
  const raw = String(headshotUrl || "").trim();
  if (!raw) return "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const fullMatch = decoded.match(/\/players\/full\/(\d{4,})\.png/i);
  if (fullMatch?.[1]) return fullMatch[1];
  const genericMatch = decoded.match(/\/players\/(?:full\/)?(\d{4,})(?:\.png)?/i);
  return genericMatch?.[1] || "";
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

const NBA_ALIAS_TO_FULL_NAME: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GS: "Golden State Warriors",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NO: "New Orleans Pelicans",
  NOP: "New Orleans Pelicans",
  NY: "New York Knicks",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHO: "Phoenix Suns",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SA: "San Antonio Spurs",
  SAS: "San Antonio Spurs",
  SAC: "Sacramento Kings",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  UTAH: "Utah Jazz",
  WAS: "Washington Wizards",
};

const NBA_ALIAS_TO_LEGACY_TEAM_ID: Record<string, string> = {
  ATL: "1",
  BOS: "2",
  BKN: "17",
  CHA: "30",
  CHI: "4",
  CLE: "5",
  DAL: "6",
  DEN: "7",
  DET: "8",
  GS: "9",
  GSW: "9",
  HOU: "10",
  IND: "11",
  LAC: "12",
  LAL: "13",
  MEM: "29",
  MIA: "14",
  MIL: "15",
  MIN: "16",
  NOP: "3",
  NO: "3",
  NYK: "18",
  NY: "18",
  OKC: "25",
  ORL: "19",
  PHI: "20",
  PHX: "21",
  PHO: "21",
  POR: "22",
  SAC: "23",
  SAS: "24",
  SA: "24",
  TOR: "28",
  UTA: "26",
  UTAH: "26",
  WAS: "27",
};

function isAbbreviationLikeTeamName(value: string): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  if (normalized.length <= 4 && normalized === normalized.toUpperCase()) return true;
  return false;
}

function collectRosterCandidates(profileJson: any): any[] {
  const out: any[] = [];
  const pushRows = (rows: any[]) => {
    for (const row of rows) out.push(row);
  };
  if (Array.isArray(profileJson?.roster)) pushRows(profileJson.roster);
  if (Array.isArray(profileJson?.players)) pushRows(profileJson.players);
  if (Array.isArray(profileJson?.athletes)) pushRows(profileJson.athletes);
  if (Array.isArray(profileJson?.entries)) pushRows(profileJson.entries);
  const grouped = [
    ...(Array.isArray(profileJson?.groups) ? profileJson.groups : []),
    ...(Array.isArray(profileJson?.positions) ? profileJson.positions : []),
    ...(Array.isArray(profileJson?.athletesByPosition) ? profileJson.athletesByPosition : []),
  ];
  for (const bucket of grouped) {
    const athletes = Array.isArray(bucket?.athletes) ? bucket.athletes : [];
    pushRows(athletes);
  }
  return out;
}

function normalizeTeamRosterForRender(profileJson: any, sportKey: string): RosterPlayer[] {
  const rows = collectRosterCandidates(profileJson);
  const sportLower = String(sportKey || "").toLowerCase();
  const dedup = new Map<string, RosterPlayer>();
  for (const raw of rows) {
    const athlete = raw?.athlete || raw?.person || raw?.player || null;
    const rawId = pickFirstString(
      raw?.id,
      raw?.playerId,
      raw?.athleteId,
      raw?.espnId,
      athlete?.id,
      extractEspnPlayerIdFromHeadshot(raw?.headshot),
      extractEspnPlayerIdFromHeadshot(raw?.photoUrl),
      extractEspnPlayerIdFromHeadshot(athlete?.headshot?.href),
    );
    const rawName = pickFirstString(
      raw?.name,
      raw?.displayName,
      raw?.fullName,
      athlete?.displayName,
      athlete?.fullName,
      athlete?.name,
    );
    if (!rawName) continue;
    const normalizedPlayerId =
      resolvePlayerIdForNavigation(rawId, rawName, sportLower)
      || (/^\d{4,}$/.test(rawId) ? rawId : "");
    const playerId = normalizedPlayerId || rawId;
    const position = pickFirstString(
      raw?.position?.abbreviation,
      raw?.position?.name,
      raw?.position,
      athlete?.position?.abbreviation,
      athlete?.position?.name,
      "N/A",
    );
    const jersey = pickFirstString(
      raw?.jersey,
      raw?.jerseyNumber,
      raw?.shirtNumber,
      athlete?.jersey,
      athlete?.jerseyNumber,
      "-",
    );
    const headshot = pickFirstString(
      raw?.headshot,
      raw?.photoUrl,
      raw?.image,
      athlete?.headshot?.href,
      /^\d{4,}$/.test(String(playerId || ""))
        ? `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportLower}/players/full/${playerId}.png&w=96&h=70&cb=1`
        : "",
    );
    const key = `${String(playerId || rawId || "").trim()}::${rawName.toLowerCase()}`;
    dedup.set(key, {
      id: String(rawId || playerId || "").trim() || rawName.toLowerCase().replace(/\s+/g, "-"),
      playerId: String(playerId || "").trim() || undefined,
      name: rawName,
      position,
      jersey,
      status: pickFirstString(raw?.status, athlete?.status) || undefined,
      headshot: headshot || undefined,
      routeTarget: /^\d{4,}$/.test(String(playerId || "")) ? String(playerId) : undefined,
      clickable: /^\d{4,}$/.test(String(playerId || "")),
      stats: {},
    });
  }
  return Array.from(dedup.values());
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

function RosterPreview({
  roster,
  sportKey,
  teamId,
  isLoading = false,
}: {
  roster: RosterPlayer[];
  sportKey: string;
  teamAbbr?: string;
  teamId?: string;
  isLoading?: boolean;
}) {
  void sportKey;
  const navigate = useNavigate();
  const rosterPrefetchSignatureRef = useRef("");
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
  const resolveRosterPlayerId = (player: Pick<RosterPlayer, "id" | "name" | "headshot">): string => {
    const sportLower = String(sportKey || "").toLowerCase();
    const routeTarget = String((player as any)?.routeTarget || "").trim();
    if (/^\d{4,}$/.test(routeTarget)) return routeTarget;
    const preferredId = String((player as any)?.playerId || "").trim();
    if (/^\d{4,}$/.test(preferredId)) return preferredId;
    const headshotId = extractEspnPlayerIdFromHeadshot(player.headshot);
    if (/^\d{4,}$/.test(headshotId)) {
      return resolvePlayerIdForNavigation(headshotId, player.name, sportLower) || headshotId;
    }
    const directId = String(player.id || "").trim();
    if (/^\d{4,}$/.test(directId)) return directId;
    const mappedFromRaw = resolvePlayerIdForNavigation(directId, player.name, sportLower);
    if (mappedFromRaw) return mappedFromRaw;
    return "";
  };
  const prefetchPlayer = (resolvedPid?: string) => {
    const sportUpper = String(sportKey || '').toUpperCase();
    if (!sportUpper) return;
    const pid = String(resolvedPid || "").trim();
    if (!pid) return;
    void prefetchFullPlayerProfileSnapshot({
      sport: sportUpper,
      playerId: pid,
      timeoutMs: 22_000,
    }).catch(() => null);
  };
  useEffect(() => {
    const sportUpper = String(sportKey || "").toUpperCase();
    if (!sportUpper || roster.length === 0) return;
    const previewTargets = starters
      .map((p) => resolveRosterPlayerId(p))
      .filter((id, idx, arr) => Boolean(id) && arr.indexOf(id) === idx)
      .slice(0, 2);
    if (previewTargets.length === 0) return;
    const signature = `${sportUpper}:${String(teamId || "")}:${previewTargets.join(",")}`;
    if (rosterPrefetchSignatureRef.current === signature) return;
    rosterPrefetchSignatureRef.current = signature;
    for (const playerId of previewTargets) prefetchPlayer(playerId);
  }, [roster.length, sportKey, starters, teamId]);
  
  if (roster.length === 0) {
    return (
      <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Roster
        </h3>
        {isLoading ? (
          <div className="space-y-2 py-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`roster-skeleton-${idx}`} className="h-9 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
            ))}
            <p className="text-xs text-muted-foreground text-center pt-1">Loading roster...</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Roster not available yet.
          </p>
        )}
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
              {starters.map((player) => {
                const pid = resolveRosterPlayerId(player);
                const isClickable = Boolean(pid);
                return (
                <button
                  key={player.id}
                  type="button"
                  data-team-roster-row="true"
                  data-clickable={isClickable ? "true" : "false"}
                  disabled={!isClickable}
                  onClick={() => {
                    if (!pid) return;
                    logPlayerNavigation(pid, String(sportKey || ""));
                    const hintedName = String(player.name || "").trim();
                    const routeBase = buildPlayerRoute(String(sportKey || ""), pid);
                    const route = hintedName
                      ? `${routeBase}?playerName=${encodeURIComponent(hintedName)}`
                      : routeBase;
                    navigate(route, {
                      state: { playerNameHint: String(player.name || "").trim() },
                    });
                  }}
                  className={cn(
                    "w-full text-left flex items-center gap-3 p-2 rounded-lg border transition-colors group",
                    isClickable
                      ? "border-emerald-300/20 bg-emerald-500/5 hover:bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.02] opacity-70 cursor-default"
                  )}
                  onMouseEnter={() => {
                    if (!pid) return;
                    prefetchPlayer(pid);
                  }}
                  onFocus={() => {
                    if (!pid) return;
                    prefetchPlayer(pid);
                  }}
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
                    <div className={cn(
                      "font-medium text-sm truncate transition-colors",
                      isClickable && "group-hover:text-primary"
                    )}>
                      {player.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      #{player.jersey} · {player.position}
                    </div>
                  </div>
                  {isClickable ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  ) : null}
                </button>
              )})}
            </div>
          </div>
        )}

        {depth.length > 0 && (
          <div className="pt-1">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Bench / Depth
            </div>
            <div className="space-y-1.5">
              {depth.map((player) => {
                const pid = resolveRosterPlayerId(player);
                const isClickable = Boolean(pid);
                return (
                <button
                  key={player.id}
                  type="button"
                  data-team-roster-row="true"
                  data-clickable={isClickable ? "true" : "false"}
                  disabled={!isClickable}
                  onClick={() => {
                    if (!pid) return;
                    logPlayerNavigation(pid, String(sportKey || ""));
                    const hintedName = String(player.name || "").trim();
                    const routeBase = buildPlayerRoute(String(sportKey || ""), pid);
                    const route = hintedName
                      ? `${routeBase}?playerName=${encodeURIComponent(hintedName)}`
                      : routeBase;
                    navigate(route, {
                      state: { playerNameHint: String(player.name || "").trim() },
                    });
                  }}
                  className={cn(
                    "w-full text-left flex items-center gap-3 p-2 rounded-lg transition-colors group",
                    isClickable ? "hover:bg-white/5" : "opacity-70 cursor-default"
                  )}
                  onMouseEnter={() => {
                    if (!pid) return;
                    prefetchPlayer(pid);
                  }}
                  onFocus={() => {
                    if (!pid) return;
                    prefetchPlayer(pid);
                  }}
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
                    <div className={cn(
                      "font-medium text-sm truncate transition-colors",
                      isClickable && "group-hover:text-primary"
                    )}>
                      {player.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      #{player.jersey} · {player.position}
                    </div>
                  </div>
                  {isClickable ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  ) : null}
                </button>
              )})}
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
  isLoading = false,
}: {
  sportKey: string;
  teamAbbr: string;
  teamName: string;
  schedule: GameResult[];
  initialH2H: TeamH2HData | null;
  isLoading?: boolean;
}) {
  const fallbackScheduleAttemptedRef = useRef(false);
  const [fallbackScheduleRows, setFallbackScheduleRows] = useState<GameResult[]>([]);
  const scheduleForEdge = useMemo(() => {
    const hasFinals = schedule.some((g) => g.status === "final");
    if (hasFinals) return schedule;
    return fallbackScheduleRows.length > 0 ? fallbackScheduleRows : schedule;
  }, [schedule, fallbackScheduleRows]);

  useEffect(() => {
    const sportUpper = String(sportKey || "").toUpperCase();
    if (sportUpper !== "NBA") return;
    const hasFinals = schedule.some((g) => g.status === "final");
    if (hasFinals) {
      setFallbackScheduleRows([]);
      fallbackScheduleAttemptedRef.current = false;
      return;
    }
    if (fallbackScheduleAttemptedRef.current) return;
    const alias = String(teamAbbr || "").trim().toUpperCase();
    if (!alias) return;
    fallbackScheduleAttemptedRef.current = true;
    let cancelled = false;
    const toStatus = (raw: unknown): "final" | "live" | "scheduled" => {
      const statusRaw = String((raw as any)?.name || raw || "").toUpperCase();
      if (
        statusRaw.includes("FINAL")
        || statusRaw.includes("STATUS_FINAL")
        || statusRaw.includes("COMPLETED")
        || statusRaw.includes("CLOSED")
      ) return "final";
      if (statusRaw.includes("LIVE") || statusRaw.includes("IN_PROGRESS")) return "live";
      return "scheduled";
    };
    const toNum = (value: unknown): number | undefined => {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    };
    const normalizeRows = (rows: any[]): GameResult[] => {
      return rows.map((g: any) => {
        const homeAlias = String(g?.homeTeamAlias || g?.homeTeam?.alias || "").trim().toUpperCase();
        const awayAlias = String(g?.awayTeamAlias || g?.awayTeam?.alias || "").trim().toUpperCase();
        const isHome = homeAlias === alias;
        const status = toStatus(g?.status);
        const oppAlias = isHome ? awayAlias : homeAlias;
        const oppName = String(
          isHome
            ? (g?.awayTeamName || g?.awayTeam?.name || oppAlias)
            : (g?.homeTeamName || g?.homeTeam?.name || oppAlias)
        ).trim() || oppAlias || "Opponent";
        const homeScore = toNum(g?.homeScore);
        const awayScore = toNum(g?.awayScore);
        const teamScore = isHome ? homeScore : awayScore;
        const oppScore = isHome ? awayScore : homeScore;
        const result = status === "final" && teamScore !== undefined && oppScore !== undefined
          ? (teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T")
          : undefined;
        return {
          id: String(g?.id || ""),
          date: String(g?.scheduledTime || g?.start_time || ""),
          opponent: {
            name: oppName,
            abbreviation: oppAlias,
            logo: `https://a.espncdn.com/i/teamlogos/nba/500/${oppAlias.toLowerCase()}.png`,
          },
          homeAway: isHome ? "home" : "away",
          result,
          teamScore,
          oppScore,
          spread: toNum(g?.spreadHome) !== undefined ? (isHome ? Number(g.spreadHome) : -Number(g.spreadHome)) : null,
          total: toNum(g?.totalLine) ?? null,
          status,
          time: g?.scheduledTime
            ? new Date(g.scheduledTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : undefined,
        } as GameResult;
      }).filter((row) => Boolean(row.date));
    };
    const loadFallbackSchedule = async () => {
      const startedAt = performance.now();
      const preferredId = NBA_ALIAS_TO_LEGACY_TEAM_ID[alias] || "";
      const candidates = [preferredId, alias].filter(Boolean);
      for (const candidate of candidates) {
        const pageDataController = new AbortController();
        const pageDataTimer = setTimeout(() => pageDataController.abort(), 2_800);
        try {
          const pageDataRes = await fetch(
            `/api/page-data/team-profile?sport=NBA&teamId=${encodeURIComponent(candidate)}&fresh=1`,
            {
              credentials: "include",
              signal: pageDataController.signal,
            }
          );
          if (pageDataRes.ok) {
            const pageDataJson = await pageDataRes.json().catch(() => null);
            const scheduleJson = pageDataJson?.data?.scheduleJson || {};
            const rows = Array.isArray(scheduleJson?.allGames) && scheduleJson.allGames.length > 0
              ? scheduleJson.allGames
              : [
                  ...(Array.isArray(scheduleJson?.pastGames) ? scheduleJson.pastGames : []),
                  ...(Array.isArray(scheduleJson?.upcomingGames) ? scheduleJson.upcomingGames : []),
                ];
            if (rows.length > 0) {
              const normalized = normalizeRows(rows);
              const withFinals = normalized.filter((row) => row.status === "final");
              if (withFinals.length > 0) {
                if (!cancelled) setFallbackScheduleRows(normalized);
                console.info("TEAM_MATCHUP_EDGE_FALLBACK", {
                  sport: "NBA",
                  teamAbbr: alias,
                  candidate,
                  source: "page-data-team-profile",
                  rows: normalized.length,
                  finals: withFinals.length,
                  elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
                });
                return;
              }
            }
          }
        } catch {
          // Fall through to team schedule endpoint.
        } finally {
          clearTimeout(pageDataTimer);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2_800);
        try {
          const res = await fetch(`/api/teams/NBA/${encodeURIComponent(candidate)}/schedule?fresh=1`, {
            credentials: "include",
            signal: controller.signal,
          });
          if (!res.ok) continue;
          const payload = await res.json().catch(() => null);
          const rows = Array.isArray(payload?.allGames) ? payload.allGames : [];
          if (rows.length === 0) continue;
          const normalized = normalizeRows(rows);
          const withFinals = normalized.filter((row) => row.status === "final");
          if (withFinals.length === 0) continue;
          if (!cancelled) setFallbackScheduleRows(normalized);
          console.info("TEAM_MATCHUP_EDGE_FALLBACK", {
            sport: "NBA",
            teamAbbr: alias,
            candidate,
            source: "teams-schedule",
            rows: normalized.length,
            finals: withFinals.length,
            elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
          });
          return;
        } catch {
          // Keep trying candidates.
        } finally {
          clearTimeout(timer);
        }
      }
      console.info("TEAM_MATCHUP_EDGE_FALLBACK", {
        sport: "NBA",
        teamAbbr: alias,
        source: "none",
        rows: 0,
        finals: 0,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
    };
    void loadFallbackSchedule();
    return () => {
      cancelled = true;
    };
  }, [schedule, sportKey, teamAbbr]);

  const recentGames = useMemo(
    () =>
      [...scheduleForEdge]
        .filter((g) => g.status === 'final')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    [scheduleForEdge]
  );

  const opponents = useMemo(() => {
    const finals = scheduleForEdge
      .filter((g) => g.status === 'final')
      .map((g) => g.opponent);
    const upcoming = scheduleForEdge
      .filter((g) => g.status === 'scheduled' || g.status === 'live')
      .map((g) => g.opponent);
    // Prefer finalized opponents first so H2H cards default to meaningful matchups.
    const merged = [...finals, ...upcoming];
    const seen = new Set<string>();
    const out: Array<{ name: string; abbreviation: string; logo?: string }> = [];
    for (const opp of merged) {
      const key = String(opp?.abbreviation || opp?.name || '').trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: opp.name, abbreviation: opp.abbreviation, logo: opp.logo });
    }
    return out.slice(0, 12);
  }, [scheduleForEdge]);

  const [oppIdx, setOppIdx] = useState(0);
  const [h2h, setH2h] = useState<TeamH2HData | null>(initialH2H);

  useEffect(() => {
    if (opponents.length === 0) return;
    if (oppIdx >= opponents.length) {
      setOppIdx(0);
    }
  }, [oppIdx, opponents.length]);

  useEffect(() => {
    const selected = opponents[oppIdx];
    const teamA = String(teamAbbr || '').trim();
    const sportUpper = String(sportKey || '').toUpperCase();
    const supportsTeamH2H = new Set(['NBA', 'NFL', 'MLB', 'NCAAB', 'NCAAF']).has(sportUpper);
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
    if (!supportsTeamH2H) {
      setH2h(null);
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
  const straightSummary = lineOutcomes.reduce(
    (acc, row) => {
      if (row.game.result === 'W') acc.wins += 1;
      if (row.game.result === 'L') acc.losses += 1;
      if (row.game.result === 'T') acc.ties += 1;
      return acc;
    },
    { wins: 0, losses: 0, ties: 0 }
  );
  const l5AtsLabel = atsSampleWithLine > 0
    ? `${atsSummary.cover}-${atsSummary.noCover}-${atsSummary.push}`
    : (lineOutcomes.length > 0
      ? `W-L ${straightSummary.wins}-${straightSummary.losses}${straightSummary.ties > 0 ? `-${straightSummary.ties}` : ''}`
      : 'No Recent Games');

  const selectedOpponent = opponents[oppIdx] || null;
  const selectedOrRecentOpponent = selectedOpponent || recentGames[0]?.opponent || null;
  const fallbackH2H = useMemo(() => {
    if (!selectedOrRecentOpponent) return null;
    const oppKey = String(selectedOrRecentOpponent.abbreviation || selectedOrRecentOpponent.name || '').toUpperCase();
    if (!oppKey) return null;
    const meetings = [...scheduleForEdge]
      .filter((g) => {
        if (g.status !== 'final') return false;
        const gameOppAbbr = String(g.opponent.abbreviation || '').toUpperCase();
        const gameOppName = String(g.opponent.name || '').toUpperCase();
        return gameOppAbbr === oppKey || gameOppName === oppKey;
      })
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
      seriesLabel: `${teamAbbr} ${teamAWins}-${teamBWins}${ties > 0 ? `-${ties}` : ''} ${String(selectedOrRecentOpponent.abbreviation || selectedOrRecentOpponent.name || "OPP").toUpperCase()}`,
      atsLabel: atsSample > 0
        ? `${covers}-${noCovers}-${pushes}`
        : `${teamAWins}-${teamBWins}${ties > 0 ? `-${ties}` : ''}`,
    };
  }, [scheduleForEdge, selectedOrRecentOpponent, teamAbbr]);

  const recentSeriesLabel = recentGames.length > 0
    ? `${teamAbbr} ${straightSummary.wins}-${straightSummary.losses}${straightSummary.ties > 0 ? `-${straightSummary.ties}` : ''}`
    : "No Matchups Yet";

  const h2hSeriesLabel = h2h
    ? `${h2h.teamA.alias} ${h2h.series.teamAWins}-${h2h.series.teamBWins} ${h2h.teamB.alias}`
    : (fallbackH2H?.seriesLabel || recentSeriesLabel);
  const h2hAtsLabel = h2h && h2h.ats.sampleWithLine > 0
    ? `${h2h.ats.teamACovers}-${h2h.ats.teamBCovers}-${h2h.ats.pushes}`
    : (h2h
      ? `${h2h.series.teamAWins}-${h2h.series.teamBWins}${h2h.series.ties > 0 ? `-${h2h.series.ties}` : ''}`
      : (fallbackH2H?.atsLabel
        || "No Matchups Yet"));

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
            Upcoming: {selectedOrRecentOpponent ? `${selectedOrRecentOpponent.name} (${selectedOrRecentOpponent.abbreviation})` : 'TBD'}
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
              {isLoading ? 'Loading matchup edge...' : 'No completed games yet for matchup analysis.'}
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

function InjuriesPreview({ injuries, isLoading = false }: { injuries: TeamInjury[]; isLoading?: boolean }) {
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
        isLoading ? (
          <div className="space-y-2 py-1">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={`injury-skeleton-${idx}`} className="h-11 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
            ))}
            <p className="text-xs text-muted-foreground text-center pt-1">Loading injuries...</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No reported injuries</p>
        )
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

// ============================================
// MAIN COMPONENT
// ============================================

export function TeamProfilePage() {
  const { sportKey, teamId } = useParams<{ sportKey: string; teamId: string }>();
  const navigate = useNavigate();
  const { flags } = useFeatureFlags();
  const scoutEnabled = Boolean(flags.PREMIUM_SCOUT_FLOW_ENABLED);

  useEffect(() => {
    if (!scoutEnabled) return;
    const cleaned = readAndRepairScoutRecentStorage((reason, row) => {
      if (import.meta.env.DEV) {
        console.info("[scoutFlowRail] dropped invalid recent entry", { reason, row });
      }
    });
    setScoutRecent(cleaned);
  }, [scoutEnabled]);

  const [data, setData] = useState<TeamProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'partial' | 'complete'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [scoutRecent, setScoutRecent] = useState<ScoutRecentEntry[]>([]);
  const [scoutPlayers, setScoutPlayers] = useState<ScoutFlowPlayerRow[]>([]);
  const [scoutTeams, setScoutTeams] = useState<ScoutFlowTeamRow[]>([]);
  const backgroundRetryTimerRef = useRef<number | null>(null);
  const backgroundRetryCountRef = useRef(0);
  const partialHydrationAttemptedRef = useRef(false);
  const finalHydrationAttemptedRef = useRef(false);
  const activeLoadRequestRef = useRef(0);
  const routeStartMsRef = useRef<number>(0);
  const firstPaintLoggedRef = useRef(false);
  const fullHydrationLoggedRef = useRef(false);
  const lastRosterPrebuildKeyRef = useRef("");
  const routeProvisionalData = useMemo<TeamProfileData>(() => {
    const effectiveTeamId = String(teamId || "").trim();
    const sportLower = String(sportKey || "nba").toLowerCase();
    return {
      team: {
        id: effectiveTeamId || teamId || "team",
        name: String(teamId || "Team"),
        nickname: String(teamId || "Team"),
        abbreviation: String(teamId || "").toUpperCase(),
        city: "",
        logo: "",
        color: "#3b82f6",
      },
      record: { wins: 0, losses: 0, pct: 0 },
      roster: [],
      schedule: [],
      stats: {},
      injuries: [],
      teamH2H: null,
      sport: sportLower,
    };
  }, [sportKey, teamId]);

  const isTeamPayloadIncomplete = (payload: TeamProfileData | null): boolean => {
    if (!payload?.team?.id) return true;
    const hasRoster = Array.isArray(payload.roster) && payload.roster.length > 0;
    const hasSchedule = Array.isArray(payload.schedule) && payload.schedule.length > 0;
    const hasFinalScheduleGame = Array.isArray(payload.schedule)
      && payload.schedule.some((game) => game?.status === "final");
    const wins = Number(payload?.record?.wins ?? 0);
    const losses = Number(payload?.record?.losses ?? 0);
    const ties = Number(payload?.record?.ties ?? 0);
    const hasRecord = Number.isFinite(wins) && Number.isFinite(losses) && (wins + losses + ties) > 0;
    const stats = payload.stats || {};
    const hasStats = [
      stats.ppg,
      stats.oppPpg,
      stats.rpg,
      stats.apg,
      stats.fgPct,
      stats.threePct,
      stats.offRank,
      stats.defRank,
    ].some((value) => Number.isFinite(Number(value)));
    // Team pages need real schedule context. Without schedule we cannot render matchup reliably.
    if (!hasSchedule) return true;
    const teamAlias = String(payload?.team?.abbreviation || "").trim().toUpperCase();
    const isNbaTeam = Boolean(teamAlias && NBA_ALIAS_TO_FULL_NAME[teamAlias]);
    // NBA degraded payloads often include roster/stats + record but no finals; force hydration until finals exist.
    if (isNbaTeam && !hasFinalScheduleGame && hasRecord) return true;
    const completedSlices = [hasRoster, hasSchedule, hasStats].filter(Boolean).length;
    return completedSlices < 2;
  };

  const fetchTeamData = async (stage: 'primary' | 'second' | 'final' = 'primary', requestId = activeLoadRequestRef.current) => {
    const isActiveRequest = () => activeLoadRequestRef.current === requestId;
    if (!sportKey || !teamId) return;
    const loadStartedAt = Date.now();
    let apiCalls = 0;
    let keepLoading = false;
    const sportUpper = sportKey.toUpperCase();
    const effectiveTeamId = String(teamId || "").trim();
    const cacheKey = `team-profile:v18:${sportUpper}:${effectiveTeamId}`;
    const cached = getRouteCache<TeamProfileData>(cacheKey, 180_000);
    const lastGood = cached || null;
    if (cached) {
      if (!isActiveRequest()) return;
      setData(cached);
      setLoading(false);
      setLoadStatus(isTeamPayloadIncomplete(cached) ? 'partial' : 'complete');
      if (!firstPaintLoggedRef.current) {
        firstPaintLoggedRef.current = true;
        const elapsed = Math.max(0, Math.round(performance.now() - (routeStartMsRef.current || performance.now())));
        console.info("FIRST_PAINT", { route: "team-profile", source: "cache", first_paint_time_ms: elapsed });
      }
    }
    
    if (!cached) {
      if (!isActiveRequest()) return;
      setData(routeProvisionalData);
      setLoading(false);
      setLoadStatus('partial');
      if (!firstPaintLoggedRef.current) {
        firstPaintLoggedRef.current = true;
        const elapsed = Math.max(0, Math.round(performance.now() - (routeStartMsRef.current || performance.now())));
        console.info("FIRST_PAINT", { route: "team-profile", source: "provisional", first_paint_time_ms: elapsed });
      }
    }
    setError(null);
    
    try {
      const isTimeoutError = (value: unknown): boolean => {
        const msg = String((value as any)?.message || '').toLowerCase();
        const name = String((value as any)?.name || '');
        return msg.includes('timeout') || name === 'AbortError';
      };
      const pageDataOnlyMode = stage !== 'final';
      let profileJson: any = null;
      let scheduleJson: any = null;
      let statsJson: any = null;
      let standingsJson: any = null;
      let gamesJson: any = null;
      let injuriesJson: any = null;
      let splitsJson: any = null;

      apiCalls += 1;
      console.info("PAGE_DATA_START", { route: "team-profile", sport: sportUpper, teamId: effectiveTeamId, requestedTeamId: teamId });
      const baseCacheKey = `page-data-team-profile:v2:${sportUpper}:${effectiveTeamId}`;
      let pageData: any = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          apiCalls += attempt > 0 ? 1 : 0;
          pageData = await fetchJsonCached<any>(
            `/api/page-data/team-profile?sport=${encodeURIComponent(sportUpper)}&teamId=${encodeURIComponent(effectiveTeamId)}`,
            {
              cacheKey: stage !== 'primary'
                ? `${baseCacheKey}:hydrate`
                : (attempt > 0 ? `${baseCacheKey}:retry` : baseCacheKey),
              ttlMs: 60_000,
              timeoutMs: stage === "primary" ? 3_500 : 8_000,
              bypassCache: stage !== 'primary' || attempt > 0,
              init: { credentials: "include" },
            }
          );
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
      const explicitPayloadError = String(pageData?.error || "").trim();
      if (pageData?.ok === false || explicitPayloadError) {
        if (!isActiveRequest()) return;
        setError(explicitPayloadError || "Unable to load team data right now.");
        setData(lastGood || routeProvisionalData);
        setLoadStatus(lastGood ? (isTeamPayloadIncomplete(lastGood) ? 'partial' : 'complete') : 'partial');
        return;
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
          if (!isActiveRequest()) return;
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
      const teamAlias = String(profileJson.team?.alias || '').trim();
      const teamColors = getTeamColors(sportKey || 'nba', teamAlias);
      
      let team: TeamInfo = {
        id: profileJson.team?.id || effectiveTeamId || teamId,
        name: String(profileJson.team?.name || '').trim() || String(effectiveTeamId || teamId || "Unknown"),
        nickname: String(profileJson.team?.name || '').trim() || String(effectiveTeamId || teamId || "Unknown"),
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

      const gamesRows = Array.isArray(gamesJson?.games) ? gamesJson.games : [];
      const gameTeamMatch = gamesRows.find((g: any) => {
        const ids = [
          String(g?.home_team_id || g?.homeTeamId || "").trim(),
          String(g?.away_team_id || g?.awayTeamId || "").trim(),
        ].filter(Boolean);
        const aliases = [
          String(g?.home_team_code || g?.homeTeam || "").trim().toLowerCase(),
          String(g?.away_team_code || g?.awayTeam || "").trim().toLowerCase(),
        ].filter(Boolean);
        return ids.includes(profileTeamId) || (profileAlias && aliases.includes(profileAlias));
      });
      const gameAlias = String(
        gameTeamMatch?.home_team_id === profileTeamId || String(gameTeamMatch?.home_team_code || "").trim().toLowerCase() === profileAlias
          ? (gameTeamMatch?.home_team_code || gameTeamMatch?.homeTeam || "")
          : (gameTeamMatch?.away_team_code || gameTeamMatch?.awayTeam || "")
      ).trim().toUpperCase();
      const gameName = String(
        gameTeamMatch?.home_team_id === profileTeamId || String(gameTeamMatch?.home_team_code || "").trim().toLowerCase() === profileAlias
          ? (gameTeamMatch?.home_team_name || gameTeamMatch?.homeTeamFull || "")
          : (gameTeamMatch?.away_team_name || gameTeamMatch?.awayTeamFull || "")
      ).trim();

      const resolvedAlias = String(team.abbreviation || standingsMatch?.alias || gameAlias || profileAlias || "").trim().toUpperCase();
      const standingsDisplayName = [String(standingsMatch?.market || "").trim(), String(standingsMatch?.name || "").trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      const rawTeamName = String(team.name || "").trim();
      const nbaNameFromAlias = sportUpper === "NBA"
        ? (NBA_ALIAS_TO_FULL_NAME[resolvedAlias] || "")
        : "";
      const resolvedName = (isAbbreviationLikeTeamName(rawTeamName) ? "" : rawTeamName)
        || nbaNameFromAlias
        || standingsDisplayName
        || gameName
        || resolvedAlias
        || String(effectiveTeamId || teamId || "Unknown");
      const resolvedId = String(team.id || standingsMatch?.id || "").trim() || String(effectiveTeamId || teamId || "");
      const resolvedCity = String(team.city || standingsMatch?.market || "").trim();

      team = {
        ...team,
        id: resolvedId,
        name: resolvedName,
        nickname: resolvedName,
        abbreviation: resolvedAlias,
        city: resolvedCity,
        logo: team.logo || (resolvedAlias ? `https://a.espncdn.com/i/teamlogos/${sportKey}/500/${resolvedAlias.toLowerCase()}.png` : team.logo),
      };

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
        const winsMissing = Number(record.wins || 0) <= 0 && Number(record.losses || 0) <= 0;
        const derivedWins = Number(record.homeWins ?? 0) + Number(record.awayWins ?? 0);
        const derivedLosses = Number(record.homeLosses ?? 0) + Number(record.awayLosses ?? 0);
        if (winsMissing && (derivedWins + derivedLosses) > 0) {
          record = {
            ...record,
            wins: derivedWins,
            losses: derivedLosses,
            pct: derivedWins / Math.max(1, derivedWins + derivedLosses),
          };
        }
      }
      
      // Transform roster
      const roster: RosterPlayer[] = normalizeTeamRosterForRender(profileJson, sportKey || "");
      const rosterBuildTargets = roster
        .map((p) => ({
          playerId: String(p.id || "").trim(),
          playerName: String(p.name || "").trim(),
        }))
        .filter((row) => /^\d{3,}$/.test(row.playerId) && row.playerName.length > 0);
      if (stage === 'primary' && rosterBuildTargets.length > 0) {
        const prebuildKey = `${sportUpper}:${effectiveTeamId}:${rosterBuildTargets.map((row) => row.playerId).sort().join(",")}`;
        if (lastRosterPrebuildKeyRef.current !== prebuildKey) {
          lastRosterPrebuildKeyRef.current = prebuildKey;
          // Fire-and-forget prebuild so team page first paint is never blocked.
          const schedulePrebuild = () => {
            void (async () => {
              const prebuildRes = await fetch("/api/page-data/player-profile/build-bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  sport: sportUpper,
                  teamId: effectiveTeamId,
                  players: rosterBuildTargets,
                  concurrency: 6,
                  maxAttempts: 3,
                  waitForCompletion: false,
                }),
              }).catch(() => null);
              const prebuildBody = prebuildRes ? await prebuildRes.json().catch(() => null) : null;
              const totalBuilt = Number(prebuildBody?.summary?.total || 0);
              const readyBuilt = Number(prebuildBody?.summary?.ready || 0);
              const failedBuilt = Number(prebuildBody?.summary?.failed || 0);
              console.info("TEAM_ROSTER_PREBUILD_BG", {
                sport: sportUpper,
                teamId: effectiveTeamId,
                totalBuilt,
                readyBuilt,
                failedBuilt,
              });
            })();
          };
          if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number })
              .requestIdleCallback?.(schedulePrebuild, { timeout: 1200 });
          } else {
            globalThis.setTimeout(schedulePrebuild, 0);
          }
        }
      }
      
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
      const safeEnrichSchedule = async (rows: GameResult[]): Promise<GameResult[]> => {
        const baseRows = rows.map(enrichWithGamesFeed);
        try {
          return await enrichMissingLinesByDate(baseRows);
        } catch {
          // Never drop finalized schedule context when line enrichment fails.
          return baseRows;
        }
      };
      let scheduleFromTeamEndpoint = await safeEnrichSchedule(scheduleFromTeamEndpointRaw);
      // Self-heal for degraded fast-timeout payloads: one quick fresh retry only.
      if (!pageDataOnlyMode && sportUpper === 'NBA' && scheduleFromTeamEndpoint.filter((g) => g.status === 'final').length === 0) {
        try {
          const aliasUpper = String(team.abbreviation || '').trim().toUpperCase();
          const preferredNbaId = NBA_ALIAS_TO_LEGACY_TEAM_ID[aliasUpper] || '';
          const scheduleFetchCandidates = [
            preferredNbaId,
            String(teamId || '').trim(),
            String(team.id || '').trim(),
          ].filter((candidate, idx, arr) => Boolean(candidate) && arr.indexOf(candidate) === idx);
          for (const candidateId of scheduleFetchCandidates) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5_500);
            try {
              const res = await fetch(`/api/teams/${sportUpper}/${encodeURIComponent(candidateId)}/schedule?fresh=1`, {
                credentials: 'include',
                signal: controller.signal,
              });
              if (!res.ok) continue;
              const freshScheduleJson = await res.json().catch(() => null);
              if (!freshScheduleJson) continue;
              const freshRaw = mapSchedulePayloadRows(freshScheduleJson);
              const freshMapped = await safeEnrichSchedule(freshRaw);
              if (freshMapped.filter((g) => g.status === 'final').length > 0) {
                scheduleFromTeamEndpointRaw = freshRaw;
                scheduleFromTeamEndpoint = freshMapped;
                break;
              }
            } finally {
              clearTimeout(timer);
            }
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
      const supportsTeamH2H = new Set(["NBA", "NFL", "MLB", "NCAAB", "NCAAF"]).has(sportUpper);
      if (!pageDataOnlyMode && supportsTeamH2H && h2hOpponent?.abbreviation) {
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
      const normalizePersonForTeamMatch = (value: unknown): string =>
        String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, " ")
          .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const rosterNameSet = new Set(
        roster
          .map((row) => normalizePersonForTeamMatch(row.name))
          .filter(Boolean)
      );
      const rosterIdSet = new Set(
        roster
          .map((row) => String(row.playerId || row.id || "").trim())
          .filter(Boolean)
      );
      const teamAliasSet = new Set(expandAliasCandidates(String(team.abbreviation || "").toUpperCase()));
      injuries = injuries.filter((row: any) => {
        const playerNameKey = normalizePersonForTeamMatch(row.playerName);
        const playerId = String((row as any)?.playerId || "").trim();
        const injuryAlias = String((row as any)?.teamAlias || "").trim().toUpperCase();
        if (playerId && rosterIdSet.has(playerId)) return true;
        if (playerNameKey && rosterNameSet.has(playerNameKey)) return true;
        if (injuryAlias && teamAliasSet.has(injuryAlias)) return true;
        return false;
      });
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
      if (!isActiveRequest()) return;
      setData(nextData);
      setLoadStatus(isTeamPayloadIncomplete(nextData) ? 'partial' : 'complete');
      setRouteCache(cacheKey, nextData, 240_000);
      console.info("PAGE_DATA_SUCCESS", {
        route: "team-profile",
        sport: sportUpper,
        teamId,
        hasTeam: Boolean(nextData?.team?.id),
        scheduleGames: Array.isArray(nextData?.schedule) ? nextData.schedule.length : 0,
        cache: pageData?.freshness?.source || "cold",
        cache_hit: pageData?.freshness?.source === "l1" || pageData?.freshness?.source === "l2",
      });
      if (!firstPaintLoggedRef.current) {
        firstPaintLoggedRef.current = true;
        const elapsed = Math.max(0, Math.round(performance.now() - (routeStartMsRef.current || performance.now())));
        console.info("FIRST_PAINT", { route: "team-profile", source: "network", first_paint_time_ms: elapsed });
      }
      const incomplete = isTeamPayloadIncomplete(nextData);
      if (stage === 'primary' && incomplete && !partialHydrationAttemptedRef.current) {
        partialHydrationAttemptedRef.current = true;
        console.info("PAGE_DATA_PARTIAL_DETECTED", {
          route: "team-profile",
          sport: sportUpper,
          teamId: effectiveTeamId,
        });
        if (backgroundRetryTimerRef.current !== null) {
          window.clearTimeout(backgroundRetryTimerRef.current);
        }
        backgroundRetryTimerRef.current = window.setTimeout(() => {
          void fetchTeamData('second', requestId);
        }, 1200);
      } else if (stage === 'second') {
        console.info("PAGE_DATA_SECOND_FETCH_SUCCESS", {
          route: "team-profile",
          sport: sportUpper,
          teamId: effectiveTeamId,
          complete: !incomplete,
        });
        if (incomplete && !finalHydrationAttemptedRef.current) {
          finalHydrationAttemptedRef.current = true;
          console.info("PAGE_DATA_FINAL_FETCH_START", {
            route: "team-profile",
            sport: sportUpper,
            teamId: effectiveTeamId,
          });
          if (backgroundRetryTimerRef.current !== null) {
            window.clearTimeout(backgroundRetryTimerRef.current);
          }
          backgroundRetryTimerRef.current = window.setTimeout(() => {
            void fetchTeamData('final', requestId);
          }, 1200);
        }
      } else if (stage === 'final') {
        console.info("PAGE_DATA_FINAL_FETCH_SUCCESS", {
          route: "team-profile",
          sport: sportUpper,
          teamId: effectiveTeamId,
          complete: !incomplete,
        });
      }
    } catch (err: any) {
      console.error('[TeamProfile] Fetch error:', err);
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('timeout') || String(err?.name || '') === 'AbortError') {
        console.warn("PAGE_DATA_TIMEOUT", { route: "team-profile", sport: String(sportKey || "").toUpperCase(), teamId });
      }
      console.warn("PAGE_DATA_FALLBACK_USED", { route: "team-profile", reason: "request_failed", sport: String(sportKey || "").toUpperCase(), teamId });
      if (lastGood) {
        if (!isActiveRequest()) return;
        setError(msg ? `Unable to refresh team data (${msg.slice(0, 120)}).` : "Unable to refresh team data right now.");
        setLoadStatus(lastGood ? (isTeamPayloadIncomplete(lastGood) ? 'partial' : 'complete') : 'partial');
      } else {
        const lowered = msg.toLowerCase();
        const recoverable = lowered.includes('timeout') || lowered.includes('partial') || lowered.includes('empty');
        if (recoverable && backgroundRetryCountRef.current < 1) {
          backgroundRetryCountRef.current += 1;
          keepLoading = true;
          setLoadStatus('loading');
          setError(null);
          if (backgroundRetryTimerRef.current !== null) {
            window.clearTimeout(backgroundRetryTimerRef.current);
          }
          backgroundRetryTimerRef.current = window.setTimeout(() => {
            void fetchTeamData('primary', requestId);
          }, 1200);
          return;
        }
        if (!isActiveRequest()) return;
        setError(msg.includes('404') ? 'Team not found' : (msg ? `Unable to load team data (${msg.slice(0, 120)}).` : 'Unable to load team data right now.'));
        setData(lastGood || routeProvisionalData);
        setLoadStatus('partial');
      }
    } finally {
      if (!isActiveRequest()) return;
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
      setLoading(keepLoading);
    }
  };

  useEffect(() => {
    const requestId = activeLoadRequestRef.current + 1;
    activeLoadRequestRef.current = requestId;
    routeStartMsRef.current = performance.now();
    firstPaintLoggedRef.current = false;
    fullHydrationLoggedRef.current = false;
    backgroundRetryCountRef.current = 0;
    partialHydrationAttemptedRef.current = false;
    finalHydrationAttemptedRef.current = false;
    if (backgroundRetryTimerRef.current !== null) {
      window.clearTimeout(backgroundRetryTimerRef.current);
      backgroundRetryTimerRef.current = null;
    }
    fetchTeamData('primary', requestId);
    return () => {
      if (backgroundRetryTimerRef.current !== null) {
        window.clearTimeout(backgroundRetryTimerRef.current);
      }
    };
  }, [sportKey, teamId]);

  useEffect(() => {
    if (loadStatus !== "complete") return;
    if (fullHydrationLoggedRef.current) return;
    fullHydrationLoggedRef.current = true;
    const elapsed = Math.max(0, Math.round(performance.now() - (routeStartMsRef.current || performance.now())));
    console.info("FULL_HYDRATION", { route: "team-profile", full_hydration_time_ms: elapsed });
  }, [loadStatus]);

  useEffect(() => {
    if (!sportKey || !teamId || !data?.team || !scoutEnabled || loading) return;
    if (isLikelyUuid(String(teamId))) return;
    try {
      const raw = window.localStorage.getItem(SCOUT_FLOW_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const next: ScoutRecentEntry = {
        type: "team",
        label: data.team.name,
        subtitle: data.team.abbreviation || undefined,
        sport: sportKey.toUpperCase(),
        path: buildTeamRoute(sportKey, teamId),
        ts: Date.now(),
      };
      const validated = validateScoutRecentEntry(next);
      if (!validated) return;
      const prev = sanitizeScoutRecentList(Array.isArray(parsed) ? parsed : []);
      const merged = [validated, ...prev.filter((row) => row.path !== validated.path)];
      const cleaned = sanitizeScoutRecentList(merged);
      window.localStorage.setItem(SCOUT_FLOW_STORAGE_KEY, JSON.stringify(cleaned.slice(0, 12)));
      setScoutRecent(cleaned.slice(0, 12));
    } catch {
      // Ignore localStorage failures.
    }
  }, [sportKey, teamId, data?.team?.name, data?.team?.abbreviation, scoutEnabled, loading]);

  useEffect(() => {
    if (!scoutEnabled || !sportKey || loading) return;
    let cancelled = false;
    (async () => {
      const sportUpper = sportKey.toUpperCase();
      const { players, teams } = await fetchScoutFlowPlayersAndTeams(sportUpper);
      if (cancelled) return;
      setScoutPlayers(players);
      setScoutTeams(teams);
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
        id: `recent:${row.type}:${row.path}`,
        label: row.label,
        subtitle: row.subtitle || (row.type === "team" ? "team" : "player"),
        kind: row.type === "team" ? "team" : "player",
        onSelect: () => {
          if (row.type === "team") {
            const p = parseTeamProfilePath(row.path);
            if (p) logTeamNavigation(p.teamId, p.sportKey);
            navigateToScoutRecentTeam(row.path, navigate);
            return;
          }
          const p = parsePlayerProfilePath(row.path);
          if (p) logPlayerNavigation(p.playerId, p.sportKey);
          navigateToScoutRecentPlayer(row.path, navigate);
        },
      }));
    const playerItems: ScoutFlowItem[] = scoutPlayers
      .map((row) => {
        const pid =
          resolvePlayerIdForNavigation(row.playerId, row.name, String(row.sport || sportUpper).toLowerCase())
          || "";
        return { row, pid };
      })
      .filter(({ pid }) => Boolean(pid))
      .slice(0, 12)
      .map(({ row, pid }) => ({
        id: `player:${pid}`,
        label: row.name || "Loading player profile...",
        subtitle: row.team || "Player",
        kind: "player" as const,
        onSelect: () => {
          logPlayerNavigation(pid, sportUpper);
          const hintedName = String(row.name || "").trim();
          const routeBase = buildPlayerRoute(sportUpper, pid);
          const route = hintedName
            ? `${routeBase}?playerName=${encodeURIComponent(hintedName)}`
            : routeBase;
          navigate(route, {
            state: { playerNameHint: String(row.name || "").trim() },
          });
        },
      }));
    const teamItems: ScoutFlowItem[] = scoutTeams
      .filter((row) => row.id !== teamId && !isLikelyUuid(row.id))
      .slice(0, 12)
      .map((row) => ({
        id: `team:${row.id}`,
        label: row.name || row.alias,
        subtitle: row.alias,
        kind: "team" as const,
        onSelect: () => {
          logTeamNavigation(row.id, sportKey);
          navigate(buildTeamRoute(String(sportKey || ""), row.id));
        },
      }));
    return [...recentItems, ...playerItems, ...teamItems];
  }, [scoutEnabled, sportKey, scoutRecent, scoutPlayers, scoutTeams, navigate, teamId]);

  const renderData = data || routeProvisionalData;
  const { team, record, roster, schedule, stats, injuries, teamH2H } = renderData;

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
        {loadStatus === 'partial' && loading && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Loading remaining team sections...
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => void fetchTeamData('primary')}
              className="shrink-0 rounded border border-red-300/40 bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/25"
            >
              Retry
            </button>
          </div>
        )}
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
          isLoading={loading && schedule.length === 0}
        />

        {/* Roster Preview */}
        <RosterPreview 
          roster={roster} 
          sportKey={sportKey || 'nba'} 
          teamAbbr={team.abbreviation}
          teamId={team.id}
          isLoading={loading && roster.length === 0}
        />

        {/* Injuries */}
        <InjuriesPreview injuries={injuries} isLoading={loading && injuries.length === 0} />

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
