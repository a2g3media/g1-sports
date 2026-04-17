/**
 * PlayerProfilePage - The Hub of All Hubs for Player Intel
 * 
 * Route: /props/player/:sport/:playerId
 * Comprehensive player data: stats, game logs, props, matchup intel, Coach G analysis
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { 
  ArrowLeft, TrendingUp, TrendingDown, Target, Calendar, 
  BarChart3, User, Sparkles, Send, Shield, Activity, Heart,
  ChevronDown, ChevronUp, AlertCircle, Plus, Bell, Flame, Zap, Clock, LineChart
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import FavoriteEntityButton from "@/react-app/components/FavoriteEntityButton";
import { getRouteCache, setRouteCache } from "@/react-app/lib/routeDataCache";
import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import { buildPlayerProfileSnapshotCacheKey } from "@/react-app/lib/pageDataKeys";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";
import PremiumScoutFlowBar, { type ScoutFlowItem } from "@/react-app/components/PremiumScoutFlowBar";
import {
  buildPlayerRoute,
  buildTeamRoute,
  canonicalPlayerIdQueryParam,
  logPlayerNavigation,
  logTeamNavigation,
  normalizeSportKeyForRoute,
} from "@/react-app/lib/navigationRoutes";
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
import {
  isPlayerProfileDisplayNameFallback,
} from "@/shared/playerProfileCompleteness";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";

const PROFILE_RECOVERY_SPORT_PROBES = ["NBA", "NCAAB", "NHL", "NFL", "MLB"] as const;

// ============================================
// TYPES
// ============================================

interface PlayerInfo {
  id?: string;
  espnId: string;
  displayName: string;
  position: string;
  jersey: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  headshotUrl: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  experience?: string;
  college?: string;
  sport: string;
  roleBucket?: string;
  /** Server-built document not ready yet; UI shows identity + empty stat sections (never an error). */
  __documentPending?: boolean;
  /** Optional identity owner for headshot safety checks. */
  headshotPlayerId?: string;
}

interface GameLogEntry {
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  result: 'W' | 'L' | 'T';
  score: string;
  stats: Record<string, string | number>;
  minutes?: string;
}

/** API rows occasionally omit `stats`; direct `g.stats.PTS` access crashes the route. */
function safeGlStats(g: GameLogEntry): Record<string, string | number> {
  const s = g?.stats;
  return s && typeof s === "object" ? s : {};
}

interface PropHitRate {
  hits: number;
  total: number;
  rate: number;
}

interface MatchupData {
  opponent: {
    name: string;
    abbr: string;
    logo?: string;
  };
  upcomingOpponents?: Array<{
    name: string;
    abbr: string;
    logo?: string;
    gameTime?: string;
    venue?: string;
  }>;
  gameTime?: string;
  venue?: string;
  defensiveRankings?: {
    overall?: number;
    vsPosition?: number;
    ptsAllowed?: number;
    last5PtsAllowed?: number;
  };
}

interface HealthData {
  status: 'healthy' | 'questionable' | 'doubtful' | 'out' | 'injury_reserve' | 'unknown';
  injury?: string;
  injuryDate?: string;
  expectedReturn?: string;
  minutesTrend: {
    last5Avg: number;
    seasonAvg: number;
    trend: 'up' | 'down' | 'stable';
    last5: number[];
  };
}

interface VsOpponentData {
  opponent: { name: string; abbr: string };
  sampleSize: number;
  wins: number;
  losses: number;
  averages: Record<string, number>;
  props: Array<{ propType: string; line: number; hits: number; total: number; rate: number }>;
  recent: Array<{ date: string; opponent: string; result: string; stats: Record<string, number> }>;
}

interface RecentPerformanceEntry {
  date: string;
  opponent: string;
  result: 'W' | 'L' | 'T';
  stats: Record<string, number | null>;
  propLines?: Record<string, number | null>;
  lineQualityByStat?: Record<string, 'verified' | 'estimated'>;
  lineSourceByStat?: Record<string, 'historical_verified' | 'estimated_verified' | 'display_fallback' | 'unavailable'>;
  lineSource?: 'historical' | 'historical_verified' | 'latest_fallback' | 'event_fallback' | 'estimated_fallback' | 'unavailable';
}

interface EdgeSignalRow {
  statType: string;
  displayLine: number | null;
  lineQuality: 'verified' | 'estimated' | 'unavailable';
  projectedValue: number | null;
  edgeValue: number | null;
  confidence: number;
  signal: 'strong_over' | 'lean_over' | 'no_edge' | 'lean_under' | 'strong_under';
  basisLabel: 'verified_basis' | 'estimated_basis';
  components: {
    recentForm: number;
    seasonAverage: number;
    matchupAdjustment: number;
    verifiedHitRate: number;
    estimatedSupport: number;
  };
}

interface HistoricalVerifiedLineRow {
  game_date?: string | null;
  stat_type: string;
  line_value: number;
  outcome?: "over" | "under" | "push" | "no_action";
  captured_at?: string | null;
  line_source?: 'verified' | 'estimated';
}

interface PlayerProfileData {
  player: PlayerInfo;
  gameLog: GameLogEntry[];
  seasonAverages: Record<string, number>;
  currentProps: any[];
  propHitRates: Record<string, PropHitRate>;
  edgeSignals?: EdgeSignalRow[];
  recentPerformance?: RecentPerformanceEntry[];
  historicalLines?: HistoricalVerifiedLineRow[];
  historical_verified_lines?: HistoricalVerifiedLineRow[];
  matchup: MatchupData | null;
  vsOpponent?: VsOpponentData | null;
  health?: HealthData;
  lastUpdated: string;
  /** Team route id from page-data (when server provides it). */
  canonicalTeamRouteId?: string | null;
}

// ============================================
// CONSTANTS
// ============================================

const STAT_LABELS: Record<string, string> = {
  PTS: 'Points',
  REB: 'Rebounds',
  AST: 'Assists',
  STL: 'Steals',
  BLK: 'Blocks',
  '3PM': '3PT Made',
  FG: 'Field Goals',
  FGP: 'FG%',
  MIN: 'Minutes',
  TO: 'Turnovers',
  // NFL
  'PASS YDS': 'Pass Yards',
  'PASS TD': 'Pass TDs',
  'RUSH YDS': 'Rush Yards',
  'REC YDS': 'Rec Yards',
  REC: 'Receptions',
  passTd: 'Pass TDs',
  passingYards: 'Pass Yards',
  rushingYards: 'Rush Yards',
  receivingYards: 'Rec Yards',
  receptions: 'Receptions',
  // MLB
  H: 'Hits',
  R: 'Runs',
  RBI: 'RBIs',
  HR: 'Home Runs',
  SO: 'Strikeouts',
  K: 'Strikeouts',
  AVG: 'Batting Avg',
  ER: 'Earned Runs',
  OUT: 'Outs Recorded',
  HA: 'Hits Allowed',
  BB: 'Walks Allowed',
  IP: 'Innings Pitched',
  strikeouts: 'Strikeouts',
  earnedRuns: 'Earned Runs',
  outsRecorded: 'Outs Recorded',
  hitsAllowed: 'Hits Allowed',
  walksAllowed: 'Walks Allowed',
  // NHL
  G: 'Goals',
  A: 'Assists',
  SOG: 'Shots',
  SV: 'Saves',
  GA: 'Goals Against',
  W: 'Wins',
  shots: 'Shots',
  saves: 'Saves',
  goalsAgainst: 'Goals Against',
  wins: 'Wins',
  goals: 'Goals',
  assists: 'Assists',
  points: 'Points',
  SOT: 'Shots on Target',
  CC: 'Chances Created',
  shotsOnTarget: 'Shots on Target',
  chancesCreated: 'Chances Created',
  '+/-': 'Plus/Minus',
};

const PRIMARY_STATS: Record<string, string[]> = {
  NBA: ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'],
  NCAAB: ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'],
  NFL: ['PASS YDS', 'PASS TD', 'RUSH YDS', 'REC YDS', 'REC'],
  MLB: ['H', 'R', 'RBI', 'HR', 'AVG'],
  NHL: ['G', 'A', 'SOG', '+/-'],
};

const MLB_HITTER_PRIMARY_STATS = ['H', 'R', 'RBI', 'HR', 'AVG'];
const MLB_PITCHER_PRIMARY_STATS = ['K', 'ER', 'OUT', 'HA', 'BB', 'IP'];

function isMlbPitcherRole(player?: { sport?: string; roleBucket?: string; position?: string } | null): boolean {
  const sport = String(player?.sport || "").toUpperCase();
  if (sport !== "MLB") return false;
  const roleBucket = String(player?.roleBucket || "").toLowerCase();
  if (roleBucket === "mlb_pitcher") return true;
  const position = String(player?.position || "").trim().toUpperCase();
  return new Set(["P", "SP", "RP", "CP", "RHP", "LHP"]).has(position);
}

function getPrimaryStatsForPlayer(params: {
  sport: string;
  roleBucket?: string;
  position?: string;
}): string[] {
  const sportUpper = String(params.sport || "").toUpperCase();
  if (sportUpper === "MLB") {
    return isMlbPitcherRole({
      sport: sportUpper,
      roleBucket: params.roleBucket,
      position: params.position,
    })
      ? MLB_PITCHER_PRIMARY_STATS
      : MLB_HITTER_PRIMARY_STATS;
  }
  return PRIMARY_STATS[sportUpper] || PRIMARY_STATS.NBA;
}

const PROP_TYPE_LABELS: Record<string, string> = {
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES: '3-Pointers',
  PRA: 'PTS+REB+AST',
  PASSING_YARDS: 'Pass Yards',
  RUSHING_YARDS: 'Rush Yards',
  RECEIVING_YARDS: 'Rec Yards',
};

function resolvePlayerHeadshotUrl(
  player: { headshotUrl?: unknown; headshot?: unknown; espnId?: unknown; sport?: unknown; id?: unknown },
  routeSport: string
): string {
  const raw = String(player.headshotUrl || player.headshot || "").trim();
  if (raw) return raw;
  const espnId = String(player.id || player.espnId || "").trim();
  if (!/^\d+$/.test(espnId)) return "";
  const sportUpper = String(player.sport || routeSport || "NBA").toUpperCase();
  const sportPath =
    sportUpper === "NBA" || sportUpper === "NCAAB" ? "nba" :
    sportUpper === "NFL" || sportUpper === "NCAAF" ? "nfl" :
    sportUpper === "MLB" ? "mlb" :
    sportUpper === "NHL" ? "nhl" : "nba";
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${espnId}.png&w=350&h=254`;
}

// ============================================
// COMPONENTS
// ============================================

/** Inline styles use `#${hex}` — strip leading `#` from API/shell values to avoid invalid `##RRGGBB`. */
function normalizeTeamColorHex(raw?: string | null, fallback = "3B82F6"): string {
  const s = String(raw ?? "")
    .trim()
    .replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return fallback;
}

function CinematicBackground({ teamColor }: { teamColor?: string }) {
  const color = normalizeTeamColorHex(teamColor, "3B82F6");
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,6%)] via-[hsl(220,20%,8%)] to-[hsl(220,25%,4%)]" />
      <div 
        className="absolute top-0 left-0 w-full h-[400px] opacity-20"
        style={{ background: `linear-gradient(180deg, #${color}40, transparent)` }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/[0.02] rounded-full blur-[100px]" />
    </div>
  );
}

function PlayerHero({ 
  player, 
  isFollowing = false,
  onFollowClick,
  isLoading = false
}: { 
  player: PlayerInfo;
  isFollowing?: boolean;
  onFollowClick?: () => void;
  isLoading?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const identityPlayerId = String(player.id || player.espnId || "").trim();
  const imageIdentityPlayerId = String(player.headshotPlayerId || "").trim();
  const headshotSrc = (player.headshotUrl || "").trim();
  const colorHex = normalizeTeamColorHex(player.teamColor, "22d3ee");
  useEffect(() => {
    setImgError(false);
  }, [headshotSrc, player.displayName]);
  const showPhotoFallback =
    !headshotSrc
    || imgError
    || !identityPlayerId
    || !imageIdentityPlayerId
    || imageIdentityPlayerId !== identityPlayerId;

  return (
    <div className="relative overflow-hidden">
      {/* Dramatic team color gradient background */}
      <div 
        className="absolute inset-0"
        style={{ 
          background: `linear-gradient(135deg, #${colorHex}30 0%, transparent 50%, #${colorHex}10 100%)` 
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
      
      {/* Glowing accent orb */}
      <div 
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[100px] opacity-30"
        style={{ backgroundColor: `#${colorHex}` }}
      />
      
      <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8">
        {/* Large Player Photo with glow */}
        <div className="relative group">
          {/* Glow effect behind photo */}
          <div 
            className="absolute inset-0 rounded-2xl blur-xl opacity-50 scale-110"
            style={{ backgroundColor: `#${colorHex}` }}
          />
          <div 
            className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20"
          >
            {showPhotoFallback ? (
              <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center animate-pulse">
                <div className="w-14 h-14 rounded-full bg-white/10" />
              </div>
            ) : (
              <img 
                src={headshotSrc}
                alt={player.displayName}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            )}
          </div>
          {/* Jersey number badge - larger and more prominent */}
          {player.jersey && (
            <div 
              className="absolute -bottom-3 -right-3 w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-xl border-2 border-black/20"
              style={{ backgroundColor: `#${colorHex}` }}
            >
              {player.jersey}
            </div>
          )}
        </div>
        
        {/* Player Info - Larger and more dramatic */}
        <div className="flex-1 text-center sm:text-left">
          {/* Name + role */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              {player.displayName?.trim()
                ? player.displayName
                : "Loading player profile..."}
            </h1>
            {player.position && (
              <span className="inline-block px-2.5 py-1 rounded-md bg-white/[0.08] text-white/60 text-xs font-semibold tracking-wide uppercase">
                {player.position}
              </span>
            )}
          </div>
          
          {/* Team with colored accent */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: `#${colorHex}` }}
              />
              <span className="text-lg font-semibold text-white/90">
                {player.teamName}
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-md bg-white/[0.06] text-white/50 text-sm font-medium">
              {player.sport}
            </span>
          </div>
          
          {/* Bio details - cleaner layout */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-sm text-white/40 mb-4">
            {player.height && <span>{player.height}</span>}
            {player.weight && <span>{player.weight}</span>}
            {player.experience && <span>{player.experience} experience</span>}
            {player.college && <span className="text-white/30">{player.college}</span>}
          </div>
          
          {/* Follow Player Button */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onFollowClick}
              disabled={isLoading}
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all",
                isLoading && "opacity-60 cursor-not-allowed",
                isFollowing
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                  : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]"
              )}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isFollowing ? "Unfollowing..." : "Following..."}
                </>
              ) : isFollowing ? (
                <>
                  <Bell className="w-4 h-4" />
                  Following
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Follow Player
                </>
              )}
            </button>
            <FavoriteEntityButton
              type="player"
              entityId={player.espnId || player.displayName}
              sport={String(player.sport || "").toLowerCase()}
              metadata={{
                player_name: player.displayName,
                team_name: player.teamName,
                team_code: player.teamAbbr,
                sport: String(player.sport || "").toLowerCase(),
              }}
              label="Favorite"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext, trend, isPrimary = false, accentColor }: { 
  label: string; 
  value: string | number; 
  subtext?: string;
  trend?: 'up' | 'down' | null;
  isPrimary?: boolean;
  accentColor?: string;
}) {
  return (
    <div className={cn(
      "relative rounded-xl border overflow-hidden transition-all hover:scale-[1.02]",
      isPrimary 
        ? "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/[0.08] p-5"
        : "bg-white/[0.03] border-white/[0.04] p-4"
    )}>
      {/* Accent glow for primary stats */}
      {isPrimary && accentColor && (
        <div 
          className="absolute top-0 left-0 w-full h-1"
          style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
        />
      )}
      
      <div className={cn(
        "font-medium uppercase tracking-wider mb-1",
        isPrimary ? "text-xs text-white/50" : "text-[10px] text-white/40"
      )}>
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span className={cn(
          "font-black text-white",
          isPrimary ? "text-4xl" : "text-2xl"
        )}>
          {value}
        </span>
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 mb-1 px-1.5 py-0.5 rounded-full text-xs font-semibold",
            trend === 'up' 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "bg-red-500/20 text-red-400"
          )}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          </div>
        )}
      </div>
      {subtext && (
        <div className="text-xs text-white/30 mt-1">{subtext}</div>
      )}
    </div>
  );
}

// Big hero stat for the most important number
function HeroStat({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="relative flex-1 min-w-[100px] p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden group hover:bg-white/[0.05] transition-all">
      {/* Background glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `radial-gradient(circle at center, ${color}15, transparent 70%)` }}
      />
      
      <div className="relative flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{label}</div>
          <div className="text-2xl font-black text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}

// Calculate streak for a stat (consecutive games above or below average)
function calculateStreak(games: GameLogEntry[], statKey: string, average: number): { type: 'hot' | 'cold' | null; count: number } {
  if (games.length === 0 || average === 0) return { type: null, count: 0 };
  
  let streakType: 'hot' | 'cold' | null = null;
  let count = 0;
  
  for (const game of games) {
    const val = parseFloat(String(safeGlStats(game)[statKey] || 0));
    const isAbove = val > average * 1.05; // 5% above is "hot"
    const isBelow = val < average * 0.85; // 15% below is "cold"
    
    if (streakType === null) {
      if (isAbove) {
        streakType = 'hot';
        count = 1;
      } else if (isBelow) {
        streakType = 'cold';
        count = 1;
      }
    } else if (streakType === 'hot' && isAbove) {
      count++;
    } else if (streakType === 'cold' && isBelow) {
      count++;
    } else {
      break;
    }
  }
  
  // Only return streak if 3+ games
  if (count >= 3) {
    return { type: streakType, count };
  }
  return { type: null, count: 0 };
}

// Stat cell with visual indicator
function StatCell({ value, average, statKey }: { value: string | number | undefined; average: number; statKey: string }) {
  if (value === undefined) {
    return <span className="text-white/30">-</span>;
  }
  
  const numValue = parseFloat(String(value));
  const isPercentage = statKey.includes('%') || statKey === 'FGP' || statKey === 'AVG';
  
  // Don't compare percentages or if no average
  if (isPercentage || !average || isNaN(numValue)) {
    return <span className="text-white font-medium">{value}</span>;
  }
  
  const diff = numValue - average;
  const percentDiff = average > 0 ? (diff / average) * 100 : 0;
  
  // Thresholds: >15% above = green, <15% below = red
  const isAbove = percentDiff > 15;
  const isBelow = percentDiff < -15;
  
  return (
    <div className="flex items-center justify-center gap-1">
      <span className={cn(
        "font-medium tabular-nums",
        isAbove && "text-emerald-400",
        isBelow && "text-red-400",
        !isAbove && !isBelow && "text-white"
      )}>
        {value}
      </span>
      {isAbove && <TrendingUp className="w-3 h-3 text-emerald-400" />}
      {isBelow && <TrendingDown className="w-3 h-3 text-red-400" />}
    </div>
  );
}

function GameLogTable({
  games,
  sport,
  seasonAverages,
  roleBucket,
  position,
}: {
  games: GameLogEntry[];
  sport: string;
  seasonAverages: Record<string, number>;
  roleBucket?: string;
  position?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayGames = expanded ? games : games.slice(0, 5);
  
  // Get primary stat keys for this sport
  const statKeys = getPrimaryStatsForPlayer({ sport, roleBucket, position });
  
  // Find stats that exist in the data
  const availableStats = statKeys.filter(key =>
    games.some((g) => safeGlStats(g)[key] !== undefined)
  ).slice(0, 5);
  
  // Calculate streaks for primary stats
  const streaks = useMemo(() => {
    const result: Record<string, { type: 'hot' | 'cold' | null; count: number }> = {};
    for (const stat of availableStats) {
      const avg = seasonAverages[stat] || 0;
      result[stat] = calculateStreak(games, stat, avg);
    }
    return result;
  }, [games, availableStats, seasonAverages]);
  
  // Find the primary streak to display (first one with 3+ games)
  const primaryStreak = useMemo(() => {
    for (const stat of availableStats) {
      if (streaks[stat]?.type && streaks[stat].count >= 3) {
        return { stat, ...streaks[stat] };
      }
    }
    return null;
  }, [streaks, availableStats]);
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white">Last {games.length} Games</h3>
        </div>
        
        {/* Streak Badge */}
        {primaryStreak && (
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
            primaryStreak.type === 'hot' 
              ? "bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/30"
              : "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/30"
          )}>
            {primaryStreak.type === 'hot' ? (
              <>
                <Flame className="w-3.5 h-3.5" />
                {primaryStreak.count}-Game Hot Streak
              </>
            ) : (
              <>
                <TrendingDown className="w-3.5 h-3.5" />
                {primaryStreak.count}-Game Cold Streak
              </>
            )}
            <span className="text-white/50">({STAT_LABELS[primaryStreak.stat] || primaryStreak.stat})</span>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="px-4 py-2 border-b border-white/[0.02] flex items-center gap-4 text-[10px] text-white/40">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span>15%+ above avg</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-red-400" />
          <span>15%+ below avg</span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="px-4 py-2 text-left text-white/40 font-medium">Date</th>
              <th className="px-4 py-2 text-left text-white/40 font-medium">OPP</th>
              <th className="px-4 py-2 text-center text-white/40 font-medium">W/L</th>
              {availableStats.map(stat => (
                <th key={stat} className="px-3 py-2 text-center text-white/40 font-medium">
                  <div className="flex flex-col items-center">
                    <span>{STAT_LABELS[stat] || stat}</span>
                    {seasonAverages[stat] !== undefined && (
                      <span className="text-[9px] text-white/25 font-normal">
                        avg {seasonAverages[stat]?.toFixed(1)}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayGames.map((game, i) => (
              <tr 
                key={i} 
                className={cn(
                  "border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors",
                  i === 0 && "bg-amber-500/[0.03]" // Highlight most recent
                )}
              >
                <td className="px-4 py-3 text-white/60">
                  {game.date ? new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-white/50">{game.homeAway === 'away' ? '@' : 'vs'}</span>
                  <span className="text-white ml-1">{game.opponent}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    game.result === 'W' ? "bg-emerald-500/20 text-emerald-400" :
                    game.result === 'L' ? "bg-red-500/20 text-red-400" :
                    "bg-white/10 text-white/50"
                  )}>
                    {game.result}
                  </span>
                </td>
                {availableStats.map(stat => (
                  <td key={stat} className="px-3 py-3 text-center">
                    <StatCell 
                      value={safeGlStats(game)[stat]} 
                      average={seasonAverages[stat] || 0}
                      statKey={stat}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {games.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-center text-sm text-white/50 hover:text-white/70 hover:bg-white/[0.02] transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>Show less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show all {games.length} games <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}
    </div>
  );
}

// ============================================
// MATCHUP SECTION
// ============================================

function MatchupSection({
  matchup,
  gameLog,
  vsOpponent,
}: {
  matchup: MatchupData;
  gameLog: GameLogEntry[];
  vsOpponent?: VsOpponentData | null;
}) {
  const normalizeToken = (value: string) =>
    String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizeWords = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
  const expandAliasCandidates = (raw: string): string[] => {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return [];
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
    return Array.from(new Set([code, ...(map[code] || [])]));
  };
  const upcoming = (Array.isArray(matchup.upcomingOpponents) && matchup.upcomingOpponents.length > 0)
    ? matchup.upcomingOpponents
    : [{
        name: matchup.opponent.name,
        abbr: matchup.opponent.abbr,
        logo: matchup.opponent.logo,
        gameTime: matchup.gameTime,
        venue: matchup.venue,
      }];
  const [selectedOpponentIdx, setSelectedOpponentIdx] = useState(0);
  const safeIdx = Math.min(selectedOpponentIdx, Math.max(0, upcoming.length - 1));
  const selectedOpponent = upcoming[safeIdx];
  const [logoBroken, setLogoBroken] = useState(false);
  const gameTime = selectedOpponent?.gameTime ? new Date(selectedOpponent.gameTime) : null;
  const isToday = gameTime && gameTime.toDateString() === new Date().toDateString();
  useEffect(() => {
    setSelectedOpponentIdx(0);
  }, [matchup.opponent.name, matchup.gameTime]);
  useEffect(() => {
    setLogoBroken(false);
  }, [selectedOpponent?.abbr, selectedOpponent?.name, selectedOpponent?.logo]);

  const oppName = String(selectedOpponent?.name || '');
  const oppAbbr = String(selectedOpponent?.abbr || '');
  const oppNorm = normalizeToken(oppName);
  const oppTailNorm = normalizeToken(oppName.split(' ').slice(-1).join(' '));
  const oppWordTokens = normalizeWords(oppName).filter((w) => w.length >= 4);
  const oppAbbrTokens = expandAliasCandidates(oppAbbr).map((abbr) => normalizeToken(abbr)).filter(Boolean);
  const oppMatchTokens = new Set<string>([oppNorm, oppTailNorm, ...oppWordTokens, ...oppAbbrTokens].filter(Boolean));
  const h2hRecent = [...(gameLog || [])]
    .filter((g) => {
      const gameOppRaw = String(g.opponent || '');
      const gameOpp = normalizeToken(gameOppRaw);
      if (!gameOpp) return false;
      if (oppAbbrTokens.some((abbr) => abbr === gameOpp)) {
        return true;
      }
      if (oppNorm && (gameOpp === oppNorm || gameOpp.includes(oppNorm) || oppNorm.includes(gameOpp))) {
        return true;
      }
      if (oppTailNorm && oppTailNorm.length >= 4 && gameOpp.includes(oppTailNorm)) {
        return true;
      }
      const gameWords = normalizeWords(gameOppRaw);
      if (oppWordTokens.some((t) => gameWords.includes(t))) {
        return true;
      }
      // Handle mixed feeds where one row uses abbreviation and another full name.
      const gameTokens = new Set<string>([gameOpp, ...gameWords.map(normalizeToken)].filter(Boolean));
      for (const token of gameTokens) {
        if (oppMatchTokens.has(token)) {
          return true;
        }
      }
      return false;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
    .map((g) => {
      const st = safeGlStats(g);
      return {
        date: g.date,
        result: g.result,
        stats: {
          PTS: Number(st.PTS ?? st.Points),
          REB: Number(st.REB ?? st.Rebounds ?? st.TRB),
          AST: Number(st.AST ?? st.Assists),
        },
      };
    });
  const avg = (key: 'PTS' | 'REB' | 'AST'): number | null => {
    const values = h2hRecent
      .map((g) => Number(g?.stats?.[key]))
      .filter((n) => Number.isFinite(n));
    if (values.length === 0) return null;
    return Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(1));
  };
  const h2hPts = avg('PTS');
  const h2hReb = avg('REB');
  const h2hAst = avg('AST');
  const h2hWins = h2hRecent.filter((g) => g.result === 'W').length;
  const h2hLosses = h2hRecent.filter((g) => g.result === 'L').length;
  const h2hSample = h2hRecent.length;
  const confidence =
    h2hSample >= 5 ? 'High' :
    h2hSample >= 3 ? 'Medium' :
    h2hSample >= 1 ? 'Low' :
    'N/A';
  const selectedMatchesVsOpponent =
    Boolean(vsOpponent?.opponent) &&
    (
      normalizeToken(String(vsOpponent?.opponent?.name || '')) === normalizeToken(String(selectedOpponent?.name || ''))
      || normalizeToken(String(vsOpponent?.opponent?.abbr || '')) === normalizeToken(String(selectedOpponent?.abbr || ''))
    );
  const bestPropHit = selectedMatchesVsOpponent && Array.isArray(vsOpponent?.props)
    ? [...vsOpponent.props].sort((a, b) => b.rate - a.rate)[0]
    : null;
  
  return (
    <div className="rounded-xl border border-cyan-400/15 bg-gradient-to-br from-[#0d1628]/90 via-[#0b1323]/90 to-[#111827]/90 overflow-hidden shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-300" />
          <h3 className="font-semibold text-white">Matchup Edge</h3>
        </div>
        {isToday && (
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-full">
            TODAY
          </span>
        )}
      </div>
      
      <div className="p-4">
        <div className="mb-3 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-white/70">
          <span className="font-semibold text-white/85">Clarity:</span> `Last 5 Form` above = overall last five games.
          This panel = last five meetings against the selected opponent only.
        </div>

        {/* Opponent Card */}
        <div className="flex items-center gap-4 mb-4">
          {selectedOpponent?.logo && !logoBroken ? (
            <img 
              src={selectedOpponent.logo} 
              alt={selectedOpponent.name}
              className="w-14 h-14 object-contain"
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-white/10 flex items-center justify-center">
              <span className="text-lg font-bold text-white/65 tracking-wide">
                {(selectedOpponent?.abbr || '--').slice(0, 3)}
              </span>
            </div>
          )}
          <div className="flex-1">
            <div className="text-lg font-semibold text-white">
              vs {selectedOpponent?.name}
            </div>
            {gameTime && (
              <div className="flex items-center gap-3 text-sm text-white/50 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {gameTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}
            {selectedOpponent?.venue && (
              <div className="text-xs text-white/30 mt-1">{selectedOpponent.venue}</div>
            )}
          </div>
        </div>

        {upcoming.length > 1 && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-2.5 py-2.5">
            <button
              type="button"
              onClick={() => setSelectedOpponentIdx((prev) => Math.max(0, prev - 1))}
              disabled={safeIdx === 0}
              className={cn(
                "min-w-[112px] px-4 py-2.5 rounded-full text-xs font-semibold transition-all border",
                safeIdx === 0
                  ? "text-white/30 bg-white/[0.03] border-white/[0.08] shadow-none"
                  : "text-cyan-100 bg-cyan-500/22 border-cyan-300/40 shadow-[0_0_14px_rgba(34,211,238,0.25)] hover:bg-cyan-500/34 hover:shadow-[0_0_20px_rgba(34,211,238,0.38)] hover:-translate-y-[1px] hover:animate-[pulse_520ms_ease-out_1] active:translate-y-0"
              )}
            >
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>◀</span>
                Prev Team
              </span>
            </button>
            <div className="text-xs font-medium text-white/75">
              Opponent {safeIdx + 1} of {upcoming.length}
            </div>
            <button
              type="button"
              onClick={() => setSelectedOpponentIdx((prev) => Math.min(upcoming.length - 1, prev + 1))}
              disabled={safeIdx >= upcoming.length - 1}
              className={cn(
                "min-w-[112px] px-4 py-2.5 rounded-full text-xs font-semibold transition-all border",
                safeIdx >= upcoming.length - 1
                  ? "text-white/30 bg-white/[0.03] border-white/[0.08] shadow-none"
                  : "text-cyan-100 bg-cyan-500/22 border-cyan-300/40 shadow-[0_0_14px_rgba(34,211,238,0.25)] hover:bg-cyan-500/34 hover:shadow-[0_0_20px_rgba(34,211,238,0.38)] hover:-translate-y-[1px] hover:animate-[pulse_520ms_ease-out_1] active:translate-y-0"
              )}
            >
              <span className="inline-flex items-center gap-1">
                Next Team
                <span aria-hidden>▶</span>
              </span>
            </button>
          </div>
        )}
        
        {h2hSample > 0 && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-2.5 text-center">
              <div className="text-[10px] text-white/40">H2H Record</div>
              <div className="text-sm font-bold text-white">{h2hWins}-{h2hLosses}</div>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-2.5 text-center">
              <div className="text-[10px] text-white/40">Games vs Team</div>
              <div className="text-sm font-bold text-white">{h2hSample}</div>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-2.5 text-center">
              <div className="text-[10px] text-white/40">Confidence</div>
              <div className={cn(
                "text-sm font-bold",
                confidence === 'High' ? 'text-emerald-300' :
                confidence === 'Medium' ? 'text-amber-300' :
                'text-orange-300'
              )}>
                {confidence}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-2.5 text-center">
              <div className="text-[10px] text-white/40">Best Prop Hit</div>
              <div className="text-sm font-bold text-white">
                {bestPropHit ? `${Math.round(bestPropHit.rate * 100)}%` : '-'}
              </div>
            </div>
          </div>
        )}

        {/* Defensive Rankings */}
        {matchup.defensiveRankings && (
          <div className="grid grid-cols-2 gap-3">
            {matchup.defensiveRankings.overall !== undefined && (
              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <div className="text-xs text-white/40 mb-1">DEF Rank</div>
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-2xl font-bold",
                    matchup.defensiveRankings.overall <= 10 ? "text-red-400" :
                    matchup.defensiveRankings.overall >= 20 ? "text-emerald-400" :
                    "text-white"
                  )}>
                    #{matchup.defensiveRankings.overall}
                  </span>
                  <span className="text-xs text-white/30">
                    {matchup.defensiveRankings.overall <= 10 ? '(tough)' : 
                     matchup.defensiveRankings.overall >= 20 ? '(favorable)' : ''}
                  </span>
                </div>
              </div>
            )}
            
            {matchup.defensiveRankings.ptsAllowed !== undefined && (
              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <div className="text-xs text-white/40 mb-1">Opp PPG Allowed</div>
                <div className="text-2xl font-bold text-white">
                  {matchup.defensiveRankings.ptsAllowed.toFixed(1)}
                </div>
              </div>
            )}
          </div>
        )}

        {h2hRecent.length > 0 && (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-white/40">
                Last 5 meetings vs {selectedOpponent?.abbr || selectedOpponent?.name}
              </div>
              <div className="text-[11px] text-white/45">
                {`AVG: ${h2hPts ?? '-'} PTS • ${h2hReb ?? '-'} REB • ${h2hAst ?? '-'} AST`}
              </div>
            </div>
            <div className="space-y-1.5">
              {h2hRecent.map((game, idx) => (
                <div
                  key={`${game.date}-${idx}`}
                  className="rounded-md bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 text-xs flex items-center justify-between"
                >
                  <span className="text-white/65">
                    {new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {game.result}
                  </span>
                  <span className="text-white/85 font-medium">
                    {`PTS ${game.stats.PTS ?? '-'} | REB ${game.stats.REB ?? '-'} | AST ${game.stats.AST ?? '-'}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {h2hRecent.length === 0 && (
          <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/55">
            No recent meetings found against this opponent yet.
          </div>
        )}
        
        {/* Favorable/Tough indicator */}
        {matchup.defensiveRankings?.overall !== undefined && (
          <div className={cn(
            "mt-3 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2",
            matchup.defensiveRankings.overall >= 20 
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : matchup.defensiveRankings.overall <= 10
              ? "bg-red-500/10 text-red-400 border border-red-500/20"
              : "bg-white/[0.03] text-white/60 border border-white/[0.04]"
          )}>
            {matchup.defensiveRankings.overall >= 20 ? (
              <>
                <TrendingUp className="w-4 h-4" />
                Favorable matchup — Weak defense
              </>
            ) : matchup.defensiveRankings.overall <= 10 ? (
              <>
                <Shield className="w-4 h-4" />
                Tough matchup — Elite defense
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                Neutral matchup
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LastFiveFormSection({
  gameLog,
  recentPerformance,
  historicalVerifiedLines,
  sport,
  roleBucket,
}: {
  gameLog: GameLogEntry[];
  recentPerformance?: RecentPerformanceEntry[];
  historicalVerifiedLines?: HistoricalVerifiedLineRow[];
  sport?: string;
  roleBucket?: string;
}) {
  const readNullableNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const sportUpper = String(sport || 'NBA').toUpperCase();
  const statConfig = (() => {
    if (sportUpper === 'NHL') {
      return {
        columns: [
          { statKey: 'G', lineKey: 'goals', label: 'G' },
          { statKey: 'A', lineKey: 'assists', label: 'A' },
          { statKey: 'PTS', lineKey: 'points', label: 'PTS' },
          { statKey: 'SOG', lineKey: 'shots', label: 'SOG' },
          { statKey: 'SV', lineKey: 'saves', label: 'SV' },
        ],
        minuteKeys: ['TOI', 'MIN'],
      };
    }
    if (sportUpper === 'MLB') {
      const isPitcher = String(roleBucket || "").toLowerCase() === "mlb_pitcher";
      return {
        columns: isPitcher
          ? [
              { statKey: 'K', lineKey: 'strikeouts', label: 'K' },
              { statKey: 'ER', lineKey: 'earnedRuns', label: 'ER' },
              { statKey: 'OUT', lineKey: 'outsRecorded', label: 'OUT' },
              { statKey: 'HA', lineKey: 'hitsAllowed', label: 'HA' },
              { statKey: 'BB', lineKey: 'walksAllowed', label: 'BB' },
            ]
          : [
              { statKey: 'H', lineKey: 'hits', label: 'H' },
              { statKey: 'R', lineKey: 'runs', label: 'R' },
              { statKey: 'RBI', lineKey: 'rbis', label: 'RBI' },
              { statKey: 'HR', lineKey: 'homeRuns', label: 'HR' },
              { statKey: 'K', lineKey: 'strikeouts', label: 'K' },
            ],
        minuteKeys: ['MIN'],
      };
    }
    if (sportUpper === 'NFL') {
      return {
        columns: [
          { statKey: 'PASS YDS', lineKey: 'passingYards', label: 'PASS YDS' },
          { statKey: 'RUSH YDS', lineKey: 'rushingYards', label: 'RUSH YDS' },
          { statKey: 'REC YDS', lineKey: 'receivingYards', label: 'REC YDS' },
          { statKey: 'REC', lineKey: 'receptions', label: 'REC' },
          { statKey: 'PASS TD', lineKey: 'passTd', label: 'PASS TD' },
        ],
        minuteKeys: ['MIN'],
      };
    }
    if (sportUpper === 'SOCCER') {
      return {
        columns: [
          { statKey: 'G', lineKey: 'goals', label: 'G' },
          { statKey: 'A', lineKey: 'assists', label: 'A' },
          { statKey: 'SOG', lineKey: 'shots', label: 'SOG' },
          { statKey: 'SOT', lineKey: 'shotsOnTarget', label: 'SOT' },
          { statKey: 'CC', lineKey: 'chancesCreated', label: 'CC' },
        ],
        minuteKeys: ['MIN'],
      };
    }
    return {
      columns: [
        { statKey: 'PTS', lineKey: 'points', label: 'PTS' },
        { statKey: 'REB', lineKey: 'rebounds', label: 'REB' },
        { statKey: 'AST', lineKey: 'assists', label: 'AST' },
      ],
      minuteKeys: ['MIN'],
    };
  })();
  const sample = (Array.isArray(recentPerformance) && recentPerformance.length > 0)
    ? recentPerformance.slice(0, 5)
    : gameLog.slice(0, 5).map((g) => {
        const st = safeGlStats(g);
        const readFromAliases = (aliases: string[]): number | null => {
          for (const key of aliases) {
            const raw = (st as Record<string, unknown>)[key];
            const n = readNullableNumber(raw);
            if (n !== null) return n;
          }
          return null;
        };
        const statsByColumn: Record<string, number | null> = {};
        for (const col of statConfig.columns) {
          const aliases = (() => {
            if (col.statKey === "H") return ["H", "hits"];
            if (col.statKey === "R") return ["R", "runs"];
            if (col.statKey === "RBI") return ["RBI", "rbis", "rbi"];
            if (col.statKey === "HR") return ["HR", "homeRuns", "home_runs", "hr"];
            if (col.statKey === "K") return ["K", "SO", "strikeouts", "so"];
            if (col.statKey === "ER") return ["ER", "earnedRuns", "earned_runs"];
            if (col.statKey === "OUT") return ["OUT", "outsRecorded", "outs"];
            if (col.statKey === "HA") return ["HA", "hitsAllowed", "hits_allowed"];
            if (col.statKey === "BB") return ["BB", "walksAllowed", "walks_allowed"];
            return [col.statKey];
          })();
          statsByColumn[col.statKey] = readFromAliases(aliases);
        }
        return {
          date: g.date,
          opponent: g.opponent,
          result: g.result,
          stats: {
            ...statsByColumn,
            MIN: readFromAliases(["MIN", "Minutes", "TOI"]),
          },
          propLines: undefined,
          lineSource: 'unavailable' as const,
        };
      });
  if (sample.length === 0) return null;

  const hydratedSample = useMemo(() => {
    const verifiedRows = Array.isArray(historicalVerifiedLines) ? historicalVerifiedLines : [];
    const toYmd = (value: unknown): string => {
      const d = new Date(String(value || ""));
      if (!Number.isFinite(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    };
    const normalizeStatType = (value: unknown): string => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (raw === "shots_on_goal") return "shots";
      if (raw === "home_runs") return "homeRuns";
      return raw;
    };
    const byDateStat = new Map<string, number>();
    for (const row of verifiedRows) {
      const line = Number(row?.line_value);
      if (!Number.isFinite(line)) continue;
      const stat = normalizeStatType(row?.stat_type);
      const date = toYmd(row?.game_date || row?.captured_at);
      if (!stat || !date) continue;
      byDateStat.set(`${date}:${stat}`, line);
    }
    return sample.map((game) => {
      const date = toYmd(game.date);
      const merged: Record<string, number | null> = {
        ...(game.propLines || {}),
      };
      const lineQualityByStat: Record<string, 'verified' | 'estimated'> = {
        ...((game as any).lineQualityByStat || {}),
      };
      const lineSourceByStat: Record<string, 'historical_verified' | 'estimated_verified' | 'display_fallback' | 'unavailable'> = {
        ...((game as any).lineSourceByStat || {}),
      };
      for (const col of statConfig.columns) {
        const key = `${date}:${col.lineKey}`;
        const line = byDateStat.get(key);
        if (Number.isFinite(Number(line))) {
          merged[col.lineKey] = Number(line);
          lineQualityByStat[col.lineKey] = 'verified';
          lineSourceByStat[col.lineKey] = 'historical_verified';
        }
      }
      const hasAny = Object.values(merged).some((v) => Number.isFinite(Number(v)));
      const mergedLineSource: RecentPerformanceEntry['lineSource'] = hasAny
        ? Object.values(lineQualityByStat).some((q) => q === 'verified')
          ? "historical_verified"
          : "estimated_fallback"
        : "unavailable";
      return {
        ...game,
        propLines: hasAny ? merged : undefined,
        lineQualityByStat: hasAny ? lineQualityByStat : undefined,
        lineSourceByStat: hasAny ? lineSourceByStat : undefined,
        lineSource: mergedLineSource,
      };
    });
  }, [sample, historicalVerifiedLines, statConfig.columns]);

  const displayColumns = useMemo(() => {
    const readStat = (game: RecentPerformanceEntry, key: string): number | null => {
      const stats = game.stats as Record<string, number | null> | undefined;
      return readNullableNumber(stats?.[key]);
    };
    const hasAnyForColumn = (col: { statKey: string; lineKey: string }) =>
      hydratedSample.some((game) => {
        const statNum = readStat(game, col.statKey);
        const lineNum = readNullableNumber(game.propLines?.[col.lineKey]);
        return statNum !== null || lineNum !== null;
      });
    const hasLineForColumn = (col: { statKey: string; lineKey: string }) =>
      hydratedSample.some((game) => readNullableNumber(game.propLines?.[col.lineKey]) !== null);
    const positiveStatCount = (col: { statKey: string; lineKey: string }) =>
      hydratedSample.reduce((count, game) => {
        const statNum = readStat(game, col.statKey);
        return statNum !== null && Math.abs(statNum) > 0 ? count + 1 : count;
      }, 0);
    const withLines = statConfig.columns.filter((col) => hasLineForColumn(col));
    if (withLines.length >= 3) return withLines.slice(0, 3);
    const withData = statConfig.columns.filter((col) => hasAnyForColumn(col));
    const noLineWithData = withData
      .filter((col) => !withLines.includes(col))
      .sort((a, b) => positiveStatCount(b) - positiveStatCount(a));
    const ordered = [...withLines, ...noLineWithData];
    return (ordered.length > 0 ? ordered : statConfig.columns).slice(0, 3);
  }, [hydratedSample, statConfig.columns]);

  const avgFor = (keys: string[]): number | null => {
    const values: number[] = [];
    for (const game of hydratedSample) {
      const stats = game.stats as Record<string, number | null> | undefined;
      for (const key of keys) {
        const n = Number(stats?.[key]);
        if (Number.isFinite(n)) {
          values.push(n);
          break;
        }
      }
    }
    if (values.length === 0) return null;
    return Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(1));
  };

  const cards = [
    ...displayColumns.map((col) => ({ label: `L5 ${col.label}`, value: avgFor([col.statKey]) })),
    { label: 'L5 MIN', value: avgFor(statConfig.minuteKeys) },
  ].filter((row) => row.value !== null);

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white/60">
        Data unavailable for this player role.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-400/15 bg-gradient-to-br from-[#0d1628]/90 via-[#0b1323]/90 to-[#111827]/90 overflow-hidden shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.02]">
        <BarChart3 className="w-4 h-4 text-cyan-400" />
        <h3 className="font-semibold text-white">Recent 5 Games (All Opponents)</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 font-medium text-cyan-100">
            All Opponents
          </span>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-2 py-0.5 font-medium text-white/65">
            Game-by-Game + Cover Checks
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg bg-white/[0.04] border border-white/[0.07] p-3 text-center">
              <div className="text-xs text-white/40 mb-1">{card.label}</div>
              <div className="text-xl font-bold text-white">{card.value}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {hydratedSample.map((game, idx) => (
            (() => {
              const getDisplayLineForStat = (row: RecentPerformanceEntry, statType: string): {
                value: number | null;
                quality: 'verified' | 'estimated' | 'unavailable';
                source: 'historical_verified' | 'estimated_verified' | 'display_fallback' | 'unavailable';
              } => {
                const value = readNullableNumber(row.propLines?.[statType]);
                if (value === null) {
                  return { value: null, quality: 'unavailable', source: 'unavailable' };
                }
                const qualityRaw = String(row.lineQualityByStat?.[statType] || '').toLowerCase();
                const sourceRaw = String(row.lineSourceByStat?.[statType] || '').toLowerCase();
                const quality = qualityRaw === 'verified' ? 'verified' : 'estimated';
                const source = sourceRaw === 'historical_verified' || sourceRaw === 'estimated_verified' || sourceRaw === 'display_fallback'
                  ? sourceRaw
                  : (quality === 'verified' ? 'historical_verified' : 'estimated_verified');
                return { value, quality, source };
              };
              const outcome = (
                actual: number | null,
                line: { value: number | null; quality: 'verified' | 'estimated' | 'unavailable' }
              ): 'Over' | 'Under' | 'Push' | 'Estimated' | 'Unavailable' => {
                if (line.quality === 'unavailable' || line.value === null) return 'Unavailable';
                if (line.quality === 'estimated') return 'Estimated';
                if (actual === null) return 'Unavailable';
                const value = Number(line.value);
                if (!Number.isFinite(value)) return 'Unavailable';
                if (Math.abs(actual - value) < 0.0001) return 'Push';
                return actual > value ? 'Over' : 'Under';
              };
              const lineStateCopy = (hasStrict: boolean, hasEstimated: boolean): string => {
                if (hasStrict) return "Verified line available.";
                if (hasEstimated) return "Estimated line available.";
                return "Line unavailable.";
              };
              const lineSummaryCopy = (rowColumnsLocal: Array<{ lineKey: string; label: string }>): string => {
                const segments = rowColumnsLocal
                  .map((col) => {
                    const resolved = getDisplayLineForStat(game, col.lineKey);
                    return resolved.value === null ? `${col.label} -` : `${col.label} ${resolved.value}`;
                  });
                return segments.join(" | ");
              };
              // Keep the visible stat triplet stable (sport defaults + available data),
              // even when only 1-2 markets are currently offered.
              const rowColumns = displayColumns;
              const gameStats = game.stats as Record<string, number | null> | undefined;
              const statRows = rowColumns.map((col) => {
                const displayLine = getDisplayLineForStat(game, col.lineKey);
                return {
                  key: col.label,
                  lineQuality: displayLine.quality,
                  lineSource: displayLine.source,
                  outcome: outcome(
                    readNullableNumber(gameStats?.[col.statKey]),
                    displayLine
                  ),
                  actual: readNullableNumber(gameStats?.[col.statKey]),
                  line: displayLine.value,
                };
              });
              const outcomeTone = (label: 'Over' | 'Under' | 'Push' | 'Estimated' | 'Unavailable') =>
                label === 'Over'
                  ? 'text-emerald-100'
                  : label === 'Under'
                    ? 'text-rose-100'
                    : label === 'Push'
                      ? 'text-slate-100'
                      : label === 'Estimated'
                        ? 'text-amber-100'
                        : 'text-slate-200';
              const outcomeBlockTone = (label: 'Over' | 'Under' | 'Push' | 'Estimated' | 'Unavailable') =>
                label === 'Over'
                  ? 'bg-emerald-500/16 border-emerald-300/30'
                  : label === 'Under'
                    ? 'bg-rose-500/16 border-rose-300/30'
                    : label === 'Push'
                      ? 'bg-slate-400/16 border-slate-300/25'
                      : label === 'Estimated'
                        ? 'bg-amber-500/16 border-amber-300/30'
                        : 'bg-gradient-to-b from-slate-500/20 to-slate-600/18 border-slate-200/18';
              const outcomeBadgeTone = (label: 'Over' | 'Under' | 'Push' | 'Estimated' | 'Unavailable') =>
                label === 'Over'
                  ? 'bg-emerald-500 text-white'
                  : label === 'Under'
                    ? 'bg-rose-500 text-white'
                    : label === 'Push'
                      ? 'bg-slate-500 text-white'
                      : label === 'Estimated'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-500/80 text-slate-100 border border-slate-300/20';
              const outcomeIcon = (label: 'Over' | 'Under' | 'Push' | 'Estimated' | 'Unavailable') =>
                label === 'Over'
                  ? '▲'
                  : label === 'Under'
                    ? '▼'
                    : label === 'Push'
                      ? '•'
                      : label === 'Estimated'
                        ? '~'
                        : '—';
              const hasAnyLineInRow = statRows.some((row) => row.line !== null);
              const hasStrictLine = statRows.some((row) => row.lineQuality === 'verified');
              const hasEstimatedOnlyLine = hasAnyLineInRow && !hasStrictLine;
              return (
            <div
              key={`${game.date}-${idx}`}
              className="group rounded-md bg-white/[0.02] border border-white/[0.05] px-3 py-3 text-xs transition-all duration-200 hover:border-cyan-300/25 hover:bg-white/[0.04] hover:shadow-[0_0_16px_rgba(34,211,238,0.08)] hover:-translate-y-[1px]"
            >
              <div className="md:grid md:grid-cols-[1.6fr_1fr] md:items-center md:gap-4">
                <div className="min-w-0">
                  <div className="text-white/70">
                    {new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • vs {game.opponent} • {game.result}
                  </div>
                  <div className="mt-1">
                    {hasStrictLine ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-300/35 bg-emerald-500/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                        Verified
                      </span>
                    ) : hasEstimatedOnlyLine ? (
                      <span
                        className="inline-flex items-center rounded-full border border-amber-300/35 bg-amber-500/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100"
                        title="Estimated from closest available market data near game start."
                      >
                        Estimated
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                        Unavailable
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-white/95 font-bold">
                    {`Actual stat line: ${rowColumns.map((col) => `${col.label} ${gameStats?.[col.statKey] ?? '-'}`).join(' | ')} | MIN ${statConfig.minuteKeys.map((k) => gameStats?.[k]).find((v) => Number.isFinite(Number(v))) ?? '-'}`}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-cyan-200/85">
                    {hasAnyLineInRow
                      ? `${lineStateCopy(hasStrictLine, hasEstimatedOnlyLine)} ${lineSummaryCopy(rowColumns)}`
                      : lineStateCopy(false, false)}
                  </div>
                </div>

                <div
                  className="relative mt-2 md:mt-0 grid divide-x divide-white/[0.08] rounded-md border border-white/[0.05] bg-white/[0.02] overflow-hidden"
                  style={{ gridTemplateColumns: `repeat(${Math.max(1, statRows.length)}, minmax(0, 1fr))` }}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 bg-gradient-to-r from-transparent via-cyan-400/[0.06] to-transparent" />
                  {statRows.map((row) => (
                    <div key={row.key} className={cn("px-2 py-1.5 text-center border transition-colors", outcomeBlockTone(row.outcome))}>
                      <div className="text-[9px] uppercase tracking-wide text-white/65">
                        {row.key}
                      </div>
                      <div className={cn("mt-0.5 text-[11px] font-semibold tracking-wide", outcomeTone(row.outcome))}>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", outcomeBadgeTone(row.outcome))}>
                          <span aria-hidden className="text-[11px] opacity-95">{outcomeIcon(row.outcome)}</span>
                          <span>{row.outcome}</span>
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/62">
                        <span className="text-white/85 font-semibold">{`${row.actual ?? '-'}`}</span>
                        <span className="text-white/30">{` / ${row.line ?? '-'}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
              );
            })()
          ))}
        </div>
      </div>
    </div>
  );
}

function EdgeSignalsSection({ edgeSignals }: { edgeSignals: EdgeSignalRow[] }) {
  const rows = Array.isArray(edgeSignals) ? edgeSignals.slice(0, 6) : [];
  if (rows.length === 0) return null;
  const signalLabel = (signal: EdgeSignalRow["signal"]): string => {
    if (signal === "strong_over") return "Strong Over";
    if (signal === "lean_over") return "Lean Over";
    if (signal === "lean_under") return "Lean Under";
    if (signal === "strong_under") return "Strong Under";
    return "No Edge";
  };
  const signalTone = (signal: EdgeSignalRow["signal"]): string => {
    if (signal === "strong_over" || signal === "lean_over") return "text-emerald-100 border-emerald-300/35 bg-emerald-500/16";
    if (signal === "strong_under" || signal === "lean_under") return "text-rose-100 border-rose-300/35 bg-rose-500/16";
    return "text-slate-100 border-slate-300/25 bg-slate-500/16";
  };
  return (
    <div className="rounded-xl border border-cyan-400/15 bg-gradient-to-br from-[#0d1628]/90 via-[#0b1323]/90 to-[#111827]/90 overflow-hidden shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.02]">
        <LineChart className="w-4 h-4 text-cyan-400" />
        <h3 className="font-semibold text-white">Edge Signals V1</h3>
      </div>
      <div className="p-4 space-y-2">
        {rows.map((row) => (
          <div key={row.statType} className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{String(row.statType || "").toUpperCase()}</div>
              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", signalTone(row.signal))}>
                {signalLabel(row.signal)}
              </span>
            </div>
            <div className="mt-1 flex items-center flex-wrap gap-2 text-[11px] text-white/75">
              <span>Line: <span className="text-white">{row.displayLine ?? "-"}</span></span>
              <span>Projected: <span className="text-white">{row.projectedValue ?? "-"}</span></span>
              <span>Edge: <span className="text-white">{row.edgeValue ?? "-"}</span></span>
              <span>Confidence: <span className="text-white">{row.confidence}%</span></span>
            </div>
            <div className="mt-1 text-[10px] text-white/65">
              {row.basisLabel === "verified_basis" ? "Verified edge basis" : "Estimated edge basis"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// HEALTH SECTION
// ============================================

const HEALTH_STATUS_CONFIG: Record<HealthData['status'], {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  healthy: { label: 'Healthy', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  questionable: { label: 'Questionable', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  doubtful: { label: 'Doubtful', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
  out: { label: 'Out', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  injury_reserve: { label: 'Injury Reserve', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  unknown: { label: 'Unknown', color: 'text-white/50', bgColor: 'bg-white/5', borderColor: 'border-white/10' },
};

function HealthSection({ health }: { health: HealthData }) {
  const statusConfig = HEALTH_STATUS_CONFIG[health.status];
  const { minutesTrend } = health;
  
  const trendDiff = minutesTrend.last5Avg - minutesTrend.seasonAvg;
  const trendPercent = minutesTrend.seasonAvg > 0 
    ? Math.round((trendDiff / minutesTrend.seasonAvg) * 100) 
    : 0;
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
        <Heart className="w-4 h-4 text-rose-400" />
        <h3 className="font-semibold text-white">Health & Minutes</h3>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Health Status */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          statusConfig.bgColor, statusConfig.borderColor
        )}>
          <div>
            <div className="text-xs text-white/40 mb-1">Status</div>
            <div className={cn("text-lg font-semibold", statusConfig.color)}>
              {statusConfig.label}
            </div>
          </div>
          {health.status !== 'healthy' && health.status !== 'unknown' && (
            <AlertCircle className={cn("w-6 h-6", statusConfig.color)} />
          )}
        </div>
        
        {/* Injury Details */}
        {health.injury && (
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
            <div className="text-xs text-white/40 mb-1">Injury</div>
            <div className="text-sm text-white">{health.injury}</div>
            {health.expectedReturn && (
              <div className="text-xs text-white/50 mt-1">
                Expected return: {health.expectedReturn}
              </div>
            )}
          </div>
        )}
        
        {/* Minutes Trend */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">Minutes Trend</div>
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
              minutesTrend.trend === 'up' ? "bg-emerald-500/20 text-emerald-400" :
              minutesTrend.trend === 'down' ? "bg-red-500/20 text-red-400" :
              "bg-white/10 text-white/50"
            )}>
              {minutesTrend.trend === 'up' ? (
                <><TrendingUp className="w-3 h-3" /> Increasing</>
              ) : minutesTrend.trend === 'down' ? (
                <><TrendingDown className="w-3 h-3" /> Decreasing</>
              ) : (
                <>Stable</>
              )}
            </div>
          </div>
          
          {/* Minutes Bar Chart */}
          {minutesTrend.last5.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-1 h-16">
                {minutesTrend.last5.map((mins, i) => {
                  const maxMins = Math.max(...minutesTrend.last5, minutesTrend.seasonAvg);
                  const height = maxMins > 0 ? (mins / maxMins) * 100 : 0;
                  const isAboveAvg = mins > minutesTrend.seasonAvg;
                  
                  return (
                    <div 
                      key={i}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-white/40">
                        {mins.toFixed(0)}
                      </span>
                      <div 
                        className={cn(
                          "w-full rounded-t transition-all",
                          isAboveAvg ? "bg-emerald-500/60" : "bg-white/20",
                          i === 0 && "ring-1 ring-amber-400/50"
                        )}
                        style={{ height: `${height}%`, minHeight: '4px' }}
                      />
                    </div>
                  );
                })}
              </div>
              
              {/* Season Average Line Label */}
              <div className="flex items-center justify-between text-[10px] text-white/30">
                <span>Last 5 games →</span>
                <span>Season avg: {minutesTrend.seasonAvg.toFixed(1)} min</span>
              </div>
            </div>
          )}
          
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-xs text-white/40">Last 5 Avg</div>
              <div className="text-lg font-semibold text-white">
                {minutesTrend.last5Avg.toFixed(1)}
                <span className="text-xs text-white/40 ml-1">min</span>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-xs text-white/40">vs Season</div>
              <div className={cn(
                "text-lg font-semibold",
                trendDiff > 1 ? "text-emerald-400" :
                trendDiff < -1 ? "text-red-400" :
                "text-white"
              )}>
                {trendDiff > 0 ? '+' : ''}{trendDiff.toFixed(1)}
                <span className="text-xs text-white/40 ml-1">
                  ({trendPercent > 0 ? '+' : ''}{trendPercent}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropHitRatesPanel({ 
  hitRates, 
  props 
}: { 
  hitRates: Record<string, PropHitRate>; 
  props: any[];
}) {
  if (Object.keys(hitRates).length === 0 && props.length === 0) {
    return null;
  }
  
  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
        <Target className="w-4 h-4 text-blue-400" />
        <h3 className="font-semibold text-white">Today's Props & Hit Rates</h3>
      </div>
      
      <div className="p-4 space-y-3">
        {Object.entries(hitRates).map(([propType, data]) => {
          const prop = props.find(p => p.prop_type === propType);
          const hitPercent = Math.round(data.rate * 100);
          
          return (
            <div 
              key={propType}
              className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]"
            >
              <div>
                <div className="text-white font-medium">
                  {PROP_TYPE_LABELS[propType] || propType}
                </div>
                {prop && (
                  <div className="text-sm text-white/50">
                    Line: {prop.line_value}
                  </div>
                )}
              </div>
              
              <div className="text-right">
                <div className={cn(
                  "text-lg font-bold",
                  hitPercent >= 70 ? "text-emerald-400" :
                  hitPercent >= 50 ? "text-amber-400" :
                  "text-red-400"
                )}>
                  {hitPercent}%
                </div>
                <div className="text-xs text-white/40">
                  {data.hits}/{data.total} games
                </div>
              </div>
            </div>
          );
        })}
        
        {Object.keys(hitRates).length === 0 && props.length > 0 && (
          <div className="text-sm text-white/50 text-center py-2">
            Hit rates calculated from recent game log
          </div>
        )}
      </div>
    </div>
  );
}

function CoachGAnalysis({ 
  player, 
  gameLog, 
  seasonAverages,
  props 
}: { 
  player: PlayerInfo;
  gameLog: GameLogEntry[];
  seasonAverages: Record<string, number>;
  props: any[];
}) {
  const { user } = useDemoAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialAnalysis, setHasInitialAnalysis] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);
  
  // Generate initial analysis on mount
  useEffect(() => {
    if (hasInitialAnalysis || chatHistory.length > 0) return;
    
    const generateInitialAnalysis = async () => {
      setIsLoading(true);
      
      try {
        // Build player context
        const last5Stats = gameLog.slice(0, 5).map(g => {
          const st = safeGlStats(g);
          const pts = st['PTS'] || st['Points'] || 0;
          const reb = st['REB'] || st['Rebounds'] || 0;
          const ast = st['AST'] || st['Assists'] || 0;
          return `${g.date ? new Date(g.date).toLocaleDateString() : 'Recent'} vs ${g.opponent}: ${pts} pts, ${reb} reb, ${ast} ast (${g.result})`;
        }).join('\n');
        
        const propsContext = props.slice(0, 5).map(p => 
          `${PROP_TYPE_LABELS[p.prop_type] || p.prop_type}: ${p.line_value}`
        ).join(', ');
        
        const contextMessage = `[Player Profile Analysis Request]
Player: ${player.displayName} (${player.teamName} - ${player.position})
Sport: ${player.sport}

Last 5 Games:
${last5Stats || 'No recent game data'}

Season Averages: ${Object.entries(seasonAverages).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Not available'}

Current Props Lines: ${propsContext || 'None available'}

Provide a concise analysis of this player's recent form, any trends you notice, and whether their current prop lines look favorable based on the data. Keep it to 2-3 sentences.`;

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': user?.id?.toString() || ''
          },
          credentials: 'include',
          body: JSON.stringify({
            persona: 'coach',
            message: contextMessage,
            pageContext: 'player-profile',
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setChatHistory([{ 
            role: 'assistant', 
            content: data.structured?.answerSummary || data.response 
          }]);
        }
      } catch (err) {
        console.error('Failed to generate analysis:', err);
      } finally {
        setIsLoading(false);
        setHasInitialAnalysis(true);
      }
    };
    
    // Small delay before generating
    const timer = setTimeout(generateInitialAnalysis, 500);
    return () => clearTimeout(timer);
  }, [player, gameLog, props, seasonAverages, user?.id, hasInitialAnalysis, chatHistory.length]);
  
  const suggestedQuestions = [
    `How does ${player.displayName} perform against tough defenses?`,
    `Should I take the over on his points prop?`,
    `What's his ceiling in this matchup?`,
    `Any injury concerns?`
  ];
  
  const askCoachG = async () => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message.trim();
    setMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    try {
      const last5Stats = gameLog.slice(0, 5).map(g => {
        const st = safeGlStats(g);
        const pts = st['PTS'] || st['Points'] || 0;
        return `vs ${g.opponent}: ${pts} pts (${g.result})`;
      }).join(', ');
      
      const contextMessage = `[Context: Viewing ${player.displayName}'s profile (${player.teamName} - ${player.sport}). Recent: ${last5Stats}]

User question: ${userMessage}`;
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user?.id?.toString() || ''
        },
        credentials: 'include',
        body: JSON.stringify({
          persona: 'coach',
          message: contextMessage,
          pageContext: 'player-profile',
          conversationHistory: chatHistory.slice(-6)
        })
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const data = await response.json();
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: data.structured?.answerSummary || data.response 
      }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: "Having trouble connecting. Try again in a moment." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="bg-gradient-to-br from-blue-500/[0.08] to-purple-500/[0.05] rounded-xl border border-blue-500/20 overflow-hidden">
      {/* Header */}
      <div 
        className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <img 
            src="/assets/coachg/coach-g-avatar.png"
            alt="Coach G"
            className="w-10 h-10 rounded-full cursor-pointer transition-transform hover:scale-105"
            onClick={(e) => {
              e.stopPropagation();
              window.location.assign('/scout');
            }}
          />
          <div>
            <h3 className="font-semibold text-white flex items-center gap-1.5">
              Coach G Analysis
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </h3>
            <p className="text-xs text-white/50">Player intelligence & insights</p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
      </div>
      
      {isOpen && (
        <>
          {/* Chat Messages */}
          <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
            {chatHistory.length === 0 && !isLoading ? (
              <div className="text-center py-4">
                <p className="text-sm text-white/50 mb-3">
                  Ask me anything about {player.displayName}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.slice(0, 2).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setMessage(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/60 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {chatHistory.map((msg, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "flex",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[85%] px-3 py-2 rounded-2xl text-sm",
                      msg.role === 'user'
                        ? "bg-blue-500 text-white rounded-br-md"
                        : "bg-white/[0.06] text-white/90 rounded-bl-md"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askCoachG()}
                placeholder={`Ask about ${player.displayName}...`}
                className="flex-1 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-blue-500/30"
                disabled={isLoading}
              />
              <button
                onClick={askCoachG}
                disabled={!message.trim() || isLoading}
                className="px-4 py-2.5 rounded-xl bg-blue-500 text-white disabled:opacity-50 hover:bg-blue-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero skeleton */}
      <div className="flex gap-6 p-6">
        <div className="w-32 h-32 rounded-2xl bg-white/10" />
        <div className="flex-1 space-y-3">
          <div className="h-8 w-48 bg-white/10 rounded" />
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="h-4 w-64 bg-white/10 rounded" />
        </div>
      </div>
      
      {/* Stats grid skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-white/[0.03] rounded-xl" />
        ))}
      </div>
      
      {/* Table skeleton */}
      <div className="h-64 bg-white/[0.02] rounded-xl" />
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PlayerProfilePage() {
  const { sport, playerId: playerIdParam } = useParams<{ sport: string; playerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const pathSegment = useMemo(() => decodeURIComponent(playerIdParam || "").trim(), [playerIdParam]);
  const queryPlayerId = useMemo(
    () => String(new URLSearchParams(location.search).get("playerId") || "").trim(),
    [location.search]
  );
  const queryPlayerNameHint = useMemo(
    () => String(new URLSearchParams(location.search).get("playerName") || "").trim(),
    [location.search]
  );
  const statePlayerNameHint = useMemo(() => {
    const s = (location.state as { playerNameHint?: unknown } | null)?.playerNameHint;
    return String(s || "").trim();
  }, [location.state]);
  const effectivePlayerNameHint = useMemo(
    () => statePlayerNameHint || queryPlayerNameHint,
    [statePlayerNameHint, queryPlayerNameHint]
  );
  const effectiveRoutePlayerId = useMemo(() => {
    return (
      canonicalPlayerIdQueryParam(pathSegment)
      ?? canonicalPlayerIdQueryParam(queryPlayerId)
      ?? ""
    );
  }, [pathSegment, queryPlayerId]);
  
  const [data, setData] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'complete' | 'unavailable'>('loading');
  const [unavailableReason, setUnavailableReason] = useState<"no_data" | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [showHeavySections, setShowHeavySections] = useState(false);
  const lastGoodProfileRef = useRef<PlayerProfileData | null>(null);
  const activeLoadRequestRef = useRef(0);
  const recoveryAttemptRef = useRef<string>("");
  const stalledIdentityRecoveryAttemptRef = useRef<string>("");
  const canonicalHintRedirectAttemptRef = useRef<string>("");
  const routeStartRef = useRef<number>(Date.now());
  const firstPaintLoggedRef = useRef(false);
  const sectionLoadedRef = useRef<{ stats: boolean; logs: boolean; props: boolean }>({
    stats: false,
    logs: false,
    props: false,
  });
  const [scoutRecent, setScoutRecent] = useState<ScoutRecentEntry[]>([]);
  const [scoutPlayers, setScoutPlayers] = useState<ScoutFlowPlayerRow[]>([]);
  const [scoutTeams, setScoutTeams] = useState<ScoutFlowTeamRow[]>([]);
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

  const profileIdentityId = useCallback((payload: PlayerProfileData | null | undefined): string => {
    if (!payload?.player) return "";
    return String(payload.player.id || payload.player.espnId || "").trim();
  }, []);

  const profileIdentityName = useCallback((payload: PlayerProfileData | null | undefined): string => {
    if (!payload?.player) return "";
    return String(payload.player.displayName || "").trim();
  }, []);

  const isPlaceholderName = useCallback((name: unknown): boolean => {
    const s = String(name || "").trim();
    return !s || /^Player\s+\d+$/i.test(s);
  }, []);
  const isLocalDev = useMemo(() => {
    if (typeof window === "undefined") return false;
    const host = String(window.location.hostname || "").trim().toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }, []);

  const hasRouteIdAnchoredPayload = useMemo(() => {
    const requestedId = String(effectiveRoutePlayerId || "").trim();
    const renderedId = profileIdentityId(data);
    return Boolean(requestedId && renderedId && requestedId === renderedId);
  }, [data, effectiveRoutePlayerId, profileIdentityId]);
  // Block full-page skeleton only until requested id is verified.
  // Once id is anchored, render the same-player shell and keep enriching.
  const showBlockingLoading =
    !error && loadStatus === "loading" && !hasRouteIdAnchoredPayload;
  useEffect(() => {
    setShowHeavySections(false);
    const runLater = (cb: () => void) => {
      const ric = (window as any).requestIdleCallback as ((fn: () => void, opts?: { timeout: number }) => number) | undefined;
      if (typeof ric === "function") return ric(cb, { timeout: 250 });
      return window.setTimeout(cb, 120);
    };
    const cancelLater = (id: number) => {
      const cic = (window as any).cancelIdleCallback as ((value: number) => void) | undefined;
      if (typeof cic === "function") cic(id);
      else window.clearTimeout(id);
    };
    const handle = runLater(() => setShowHeavySections(true));
    return () => cancelLater(handle as number);
  }, [effectiveRoutePlayerId, sport, retryNonce]);

  // Watchboard hook for follow functionality
  const { 
    isPlayerFollowed, 
    followPlayer,
    unfollowPlayerByName
  } = useWatchboards();

  const hasCoreProfileData = useCallback((payload: any): payload is PlayerProfileData => {
    if (!payload || !payload.player) return false;
    const hasRequiredShape = Array.isArray(payload.gameLog)
      && Boolean(payload.seasonAverages && typeof payload.seasonAverages === "object")
      && Array.isArray(payload.currentProps)
      && Array.isArray(payload.recentPerformance)
      && Object.prototype.hasOwnProperty.call(payload, "matchup");
    if (!hasRequiredShape) return false;
    const displayName = String(payload?.player?.displayName || payload?.player?.name || "").trim();
    const hasIdentity =
      Boolean(String(payload?.player?.id || payload?.player?.espnId || "").trim())
      && !isPlaceholderName(displayName)
      && !isPlayerProfileDisplayNameFallback(displayName);
    const hasAnyStatsData =
      Object.keys(payload?.seasonAverages || {}).length > 0
      || (Array.isArray(payload?.gameLog) && payload.gameLog.length > 0)
      || (Array.isArray(payload?.currentProps) && payload.currentProps.length > 0)
      || (Array.isArray(payload?.recentPerformance) && payload.recentPerformance.length > 0);
    return hasIdentity && hasAnyStatsData;
  }, []);

  const readPersistentLastGood = useCallback((key: string): PlayerProfileData | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return hasCoreProfileData(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [hasCoreProfileData]);

  const writePersistentLastGood = useCallback((key: string, payload: PlayerProfileData): void => {
    if (typeof window === 'undefined') return;
    if (!hasCoreProfileData(payload) || payload.player?.__documentPending) return;
    try {
      // Keep a compact snapshot to avoid localStorage bloat.
      const compact: PlayerProfileData = {
        ...payload,
        gameLog: Array.isArray(payload.gameLog) ? payload.gameLog.slice(0, 80) : [],
        recentPerformance: Array.isArray(payload.recentPerformance) ? payload.recentPerformance.slice(0, 10) : [],
      };
      window.localStorage.setItem(key, JSON.stringify(compact));
    } catch {
      // Non-fatal persistence failure.
    }
  }, [hasCoreProfileData]);

  const normalizeProfilePayload = useCallback((incoming: any, fallback: PlayerProfileData | null): PlayerProfileData | null => {
    const source = incoming && typeof incoming === "object" ? incoming : null;
    const player = source?.player ?? fallback?.player ?? null;
    if (!player) return null;
    const requestedId = String(effectiveRoutePlayerId || "").trim();
    const sourcePlayerId = String(player.id || player.espnId || "").trim();
    if (!sourcePlayerId || (requestedId && sourcePlayerId !== requestedId)) return null;
    const canonicalTeamRouteId =
      source?.canonicalTeamRouteId !== undefined
        ? source.canonicalTeamRouteId
        : fallback?.canonicalTeamRouteId ?? null;
    const rawName = String(player.displayName || player.name || "").trim();
    const pendingFlag =
      player.__documentPending === true || isPlayerProfileDisplayNameFallback(rawName);
    const hintedName = String(effectivePlayerNameHint || "").trim();
    const fallbackIdentityName =
      hintedName && !isPlayerProfileDisplayNameFallback(hintedName) ? hintedName : "";
    const displayName = pendingFlag ? (fallbackIdentityName || "") : (rawName || fallbackIdentityName || "");
    const resolvedHeadshotUrl = resolvePlayerHeadshotUrl(player, String(sport || "").toUpperCase() || "NBA");
    const headshotOwnerId = String(player.headshotPlayerId || player.id || player.espnId || "").trim();
    const safeHeadshotUrl =
      headshotOwnerId && headshotOwnerId === sourcePlayerId ? resolvedHeadshotUrl : "";
    return {
      player: {
        id: sourcePlayerId,
        espnId: sourcePlayerId,
        displayName,
        position: String(player.position || ""),
        roleBucket: String(player.roleBucket || ""),
        jersey: String(player.jersey || ""),
        teamName: String(player.teamName || ""),
        teamAbbr: String(player.teamAbbr || ""),
        teamColor: String(player.teamColor || "#22d3ee"),
        headshotUrl: safeHeadshotUrl,
        headshotPlayerId: safeHeadshotUrl ? sourcePlayerId : "",
        birthDate: player.birthDate || undefined,
        height: player.height || undefined,
        weight: player.weight || undefined,
        experience: player.experience || undefined,
        college: player.college || undefined,
        sport: String(player.sport || String(sport || "").toUpperCase() || "NBA"),
        ...(pendingFlag ? { __documentPending: true as const } : {}),
      },
      gameLog: Array.isArray(source?.gameLog) ? source.gameLog : (fallback?.gameLog || []),
      seasonAverages: {
        ...(fallback?.seasonAverages || {}),
        ...((source?.seasonAverages && typeof source.seasonAverages === "object") ? source.seasonAverages : {}),
      },
      currentProps: Array.isArray(source?.currentProps) ? source.currentProps : (fallback?.currentProps || []),
      propHitRates: {
        ...(fallback?.propHitRates || {}),
        ...((source?.propHitRates && typeof source.propHitRates === "object") ? source.propHitRates : {}),
      },
      edgeSignals: Array.isArray(source?.edgeSignals)
        ? source.edgeSignals
        : (Array.isArray((fallback as any)?.edgeSignals) ? (fallback as any).edgeSignals : []),
      recentPerformance: Array.isArray(source?.recentPerformance) ? source.recentPerformance : (fallback?.recentPerformance || []),
      historicalLines: Array.isArray(source?.historicalLines)
        ? source.historicalLines
        : (Array.isArray(source?.historical_verified_lines)
          ? source.historical_verified_lines
          : (fallback?.historicalLines || fallback?.historical_verified_lines || [])),
      historical_verified_lines: Array.isArray(source?.historical_verified_lines)
        ? source.historical_verified_lines
        : (Array.isArray(source?.historicalLines)
          ? source.historicalLines
          : (fallback?.historical_verified_lines || fallback?.historicalLines || [])),
      matchup: source?.matchup ?? fallback?.matchup ?? null,
      vsOpponent: source?.vsOpponent ?? fallback?.vsOpponent ?? null,
      health: source?.health ?? fallback?.health,
      lastUpdated: String(source?.lastUpdated || fallback?.lastUpdated || new Date().toISOString()),
      canonicalTeamRouteId:
        canonicalTeamRouteId != null && String(canonicalTeamRouteId).trim()
          ? String(canonicalTeamRouteId).trim()
          : null,
    };
  }, [effectiveRoutePlayerId, sport, effectivePlayerNameHint]);

  useEffect(() => {
    routeStartRef.current = Date.now();
    firstPaintLoggedRef.current = false;
    sectionLoadedRef.current = { stats: false, logs: false, props: false };
  }, [sport, playerIdParam, effectiveRoutePlayerId]);

  useEffect(() => {
    if (loadStatus !== "loading") return;
    if (hasRouteIdAnchoredPayload) return;
    const timeout = window.setTimeout(() => {
      activeLoadRequestRef.current += 1;
      setLoadStatus((curr) => {
        if (curr !== "loading") return curr;
        setData(null);
        setError(null);
        setLoading(false);
        return isLocalDev ? "loading" : "unavailable";
      });
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [loadStatus, sport, effectiveRoutePlayerId, retryNonce, hasRouteIdAnchoredPayload, isLocalDev]);

  useEffect(() => {
    if (!loading || !showBlockingLoading || error) return;
    const timeout = window.setTimeout(() => {
      activeLoadRequestRef.current += 1;
      setData(null);
      setError(null);
      setLoading(false);
      setLoadStatus(isLocalDev ? "loading" : "unavailable");
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [loading, showBlockingLoading, loadStatus, error, sport, effectiveRoutePlayerId, retryNonce, isLocalDev]);

  useEffect(() => {
    if (loadStatus !== "unavailable") return;
    const sportUpper = String(sport || "").toUpperCase();
    const sportLower = sportUpper.toLowerCase();
    const currentId = String(effectiveRoutePlayerId || "").trim();
    const routeHint = String(effectivePlayerNameHint || "").trim();
    if (!sportUpper || !currentId) return;
    const attemptKey = `${sportUpper}:${currentId}:${routeHint.toLowerCase() || "no-hint"}`;
    if (recoveryAttemptRef.current === attemptKey) return;
    recoveryAttemptRef.current = attemptKey;
    const controller = new AbortController();
    void (async () => {
      try {
        let resolvedHint = routeHint;
        if (!resolvedHint) {
          const propsUrl =
            `/api/sports-data/props/today?sport=${encodeURIComponent(sportUpper)}&limit=500&offset=0`;
          const propsRes = await fetch(propsUrl, {
            signal: controller.signal,
            credentials: "include",
          });
          const propsBody = await propsRes.json().catch(() => null);
          const rows = Array.isArray(propsBody?.props) ? propsBody.props : [];
          const matched = rows.find((row: any) => String(row?.player_id || "").trim() === currentId);
          const inferredName = String(matched?.player_name || "").trim();
          if (inferredName && !isPlayerProfileDisplayNameFallback(inferredName)) {
            resolvedHint = inferredName;
          }
        }
        if (!resolvedHint) return;

        const url =
          `/api/player/${encodeURIComponent(sportUpper)}/${encodeURIComponent(resolvedHint)}/headshot`;
        const res = await fetch(url, {
          signal: controller.signal,
          credentials: "include",
        });
        const body = await res.json().catch(() => null);
        const headshotResolvedId = String(body?.espnId || "").trim();
        const mappedResolvedId = resolvePlayerIdForNavigation(undefined, resolvedHint, sportLower);
        const recoveredId = /^\d{4,}$/.test(headshotResolvedId)
          ? headshotResolvedId
          : String(mappedResolvedId || "").trim();
        if (!/^\d{4,}$/.test(recoveredId)) return;

        const routeBase = buildPlayerRoute(sportUpper, recoveredId);
        const route = `${routeBase}?playerName=${encodeURIComponent(resolvedHint)}`;
        if (recoveredId === currentId && routeHint) return;
        navigate(route, {
          replace: true,
          state: { playerNameHint: resolvedHint },
        });
      } catch {
        // keep unavailable card when recovery probe fails
      }
    })();
    return () => controller.abort();
  }, [loadStatus, sport, effectiveRoutePlayerId, effectivePlayerNameHint, navigate]);

  useEffect(() => {
    const sportUpper = String(sport || "").toUpperCase();
    const currentId = String(effectiveRoutePlayerId || "").trim();
    const hintedName = String(effectivePlayerNameHint || "").trim();
    if (!sportUpper || !/^\d{4,}$/.test(currentId)) return;
    if (!hintedName || isPlayerProfileDisplayNameFallback(hintedName)) return;
    const attemptKey = `${sportUpper}:${currentId}:${hintedName.toLowerCase()}`;
    if (canonicalHintRedirectAttemptRef.current === attemptKey) return;
    canonicalHintRedirectAttemptRef.current = attemptKey;
    const controller = new AbortController();
    void (async () => {
      try {
        const hintedHeadshotUrl =
          `/api/player/${encodeURIComponent(sportUpper)}/${encodeURIComponent(hintedName)}/headshot`;
        const hintedHeadshotRes = await fetch(hintedHeadshotUrl, {
          signal: controller.signal,
          credentials: "include",
        });
        const hintedHeadshotBody = await hintedHeadshotRes.json().catch(() => null);
        const hintedResolvedId = String(hintedHeadshotBody?.espnId || "").trim();
        if (!/^\d{4,}$/.test(hintedResolvedId)) return;
        if (hintedResolvedId === currentId) return;
        const hintedRouteBase = buildPlayerRoute(sportUpper, hintedResolvedId);
        const hintedRoute = `${hintedRouteBase}?playerName=${encodeURIComponent(hintedName)}`;
        navigate(hintedRoute, {
          replace: true,
          state: { playerNameHint: hintedName },
        });
      } catch {
        // Non-fatal; later recovery effects still run.
      }
    })();
    return () => controller.abort();
  }, [sport, effectiveRoutePlayerId, effectivePlayerNameHint, navigate]);

  useEffect(() => {
    if (loadStatus !== "loading") return;
    if (!hasRouteIdAnchoredPayload) return;
    const sportUpper = String(sport || "").toUpperCase();
    const currentId = String(effectiveRoutePlayerId || "").trim();
    if (!sportUpper || !/^\d{4,}$/.test(currentId)) return;
    const currentName = String(data?.player?.displayName || "").trim();
    const hasAnyStatsData =
      Object.keys(data?.seasonAverages || {}).length > 0
      || (Array.isArray(data?.gameLog) && data.gameLog.length > 0)
      || (Array.isArray(data?.currentProps) && data.currentProps.length > 0)
      || (Array.isArray(data?.recentPerformance) && data.recentPerformance.length > 0);
    if (currentName && !isPlayerProfileDisplayNameFallback(currentName) && hasAnyStatsData) return;

    const attemptKey = `${sportUpper}:${currentId}:${String(effectivePlayerNameHint || "").trim().toLowerCase() || "no-hint"}`;
    if (stalledIdentityRecoveryAttemptRef.current === attemptKey) return;
    stalledIdentityRecoveryAttemptRef.current = attemptKey;
    const controller = new AbortController();
    let timeout: number | null = null;
    let cancelled = false;
    const runRecovery = async (): Promise<void> => {
      try {
        const hintedName = String(effectivePlayerNameHint || currentName || "").trim();
        if (hintedName && !isPlayerProfileDisplayNameFallback(hintedName)) {
          const hintedHeadshotUrl =
            `/api/player/${encodeURIComponent(sportUpper)}/${encodeURIComponent(hintedName)}/headshot`;
          const hintedHeadshotRes = await fetch(hintedHeadshotUrl, {
            signal: controller.signal,
            credentials: "include",
          });
          const hintedHeadshotBody = await hintedHeadshotRes.json().catch(() => null);
          const hintedResolvedId = String(hintedHeadshotBody?.espnId || "").trim();
          if (/^\d{4,}$/.test(hintedResolvedId) && hintedResolvedId !== currentId && !cancelled) {
            const hintedRouteBase = buildPlayerRoute(sportUpper, hintedResolvedId);
            const hintedRoute = `${hintedRouteBase}?playerName=${encodeURIComponent(hintedName)}`;
            navigate(hintedRoute, {
              replace: true,
              state: { playerNameHint: hintedName },
            });
            return;
          }
        }
      } catch {
        // fall through to delayed broad-sport probe
      }
      if (cancelled) return;
      timeout = window.setTimeout(() => {
        void (async () => {
        try {
          let recoveredName = "";
          let recoveredSport = sportUpper;
          const probeSports = Array.from(new Set([sportUpper, ...PROFILE_RECOVERY_SPORT_PROBES]));
          for (const probeSport of probeSports) {
            const propsUrl =
              `/api/sports-data/props/today?sport=${encodeURIComponent(probeSport)}&limit=5000&offset=0&fresh=1`;
            const propsRes = await fetch(propsUrl, {
              signal: controller.signal,
              credentials: "include",
            });
            const propsBody = await propsRes.json().catch(() => null);
            const rows = Array.isArray(propsBody?.props) ? propsBody.props : [];
            const matched = rows.find((row: any) => String(row?.player_id || "").trim() === currentId);
            const inferredName = String(matched?.player_name || "").trim();
            if (!inferredName || isPlayerProfileDisplayNameFallback(inferredName)) continue;
            recoveredName = inferredName;
            recoveredSport = String(matched?.sport || probeSport || sportUpper).trim().toUpperCase();
            break;
          }
          if (!recoveredName) return;
          const recoveredSportLower = recoveredSport.toLowerCase();
          const headshotUrl =
            `/api/player/${encodeURIComponent(recoveredSport)}/${encodeURIComponent(recoveredName)}/headshot`;
          const headshotRes = await fetch(headshotUrl, {
            signal: controller.signal,
            credentials: "include",
          });
          const headshotBody = await headshotRes.json().catch(() => null);
          const headshotResolvedId = String(headshotBody?.espnId || "").trim();
          const mappedResolvedId = resolvePlayerIdForNavigation(undefined, recoveredName, recoveredSportLower);
          const recoveredId = /^\d{4,}$/.test(headshotResolvedId)
            ? headshotResolvedId
            : String(mappedResolvedId || "").trim();
          if (!/^\d{4,}$/.test(recoveredId)) return;
          const normalizedCurrentSport = normalizeSportKeyForRoute(sportUpper);
          const normalizedRecoveredSport = normalizeSportKeyForRoute(recoveredSport);
          const routeBase = buildPlayerRoute(recoveredSport, recoveredId);
          const route = `${routeBase}?playerName=${encodeURIComponent(recoveredName)}`;
          const alreadyHinted =
            String(effectivePlayerNameHint || "").trim().toLowerCase() === recoveredName.toLowerCase();
          if (
            recoveredId === currentId
            && normalizedRecoveredSport === normalizedCurrentSport
            && alreadyHinted
          ) {
            return;
          }
          navigate(route, {
            replace: true,
            state: { playerNameHint: recoveredName },
          });
        } catch {
          // keep current same-player shell when recovery probe fails
        }
      })();
      }, 3500);
    };
    void runRecovery();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadStatus, hasRouteIdAnchoredPayload, sport, effectiveRoutePlayerId, data, effectivePlayerNameHint, navigate]);

  // Canonical route is /props/player/:sport/:playerId — path segment always wins over ?playerId=.
  // Stale query (e.g. after chip navigation) used to redirect to the *old* id and fight the rail.
  useEffect(() => {
    if (!sport) return;
    const q = canonicalPlayerIdQueryParam(queryPlayerId);
    const path = canonicalPlayerIdQueryParam(pathSegment);
    const base = `/props/player/${normalizeSportKeyForRoute(sport)}`;
    if (path && q && q !== path) {
      navigate(`${base}/${encodeURIComponent(path)}`, { replace: true });
      return;
    }
    if (!path && q) {
      navigate(`${base}/${encodeURIComponent(q)}`, { replace: true });
      return;
    }
    if (path && q && q === path && location.search) {
      const params = new URLSearchParams(location.search);
      params.delete("playerId");
      const nextSearch = params.toString();
      navigate(
        `${base}/${encodeURIComponent(path)}${nextSearch ? `?${nextSearch}` : ""}`,
        { replace: true }
      );
    }
  }, [sport, pathSegment, queryPlayerId, navigate, location.search]);

  useEffect(() => {
    if (!data) return;
    if (!firstPaintLoggedRef.current) {
      firstPaintLoggedRef.current = true;
      console.info("FIRST_PAINT", {
        route: "player-profile",
        sport: String(sport || "").toUpperCase(),
        playerId: effectiveRoutePlayerId,
        msSinceRouteStart: Math.max(0, Date.now() - routeStartRef.current),
      });
    }
    if (!sectionLoadedRef.current.stats && data.seasonAverages && Object.keys(data.seasonAverages).length > 0) {
      sectionLoadedRef.current.stats = true;
      console.info("SECTION_LOADED: stats", {
        route: "player-profile",
        sport: String(sport || "").toUpperCase(),
        playerId: effectiveRoutePlayerId,
        msSinceRouteStart: Math.max(0, Date.now() - routeStartRef.current),
      });
    }
    if (!sectionLoadedRef.current.logs && Array.isArray(data.gameLog) && data.gameLog.length > 0) {
      sectionLoadedRef.current.logs = true;
      console.info("SECTION_LOADED: logs", {
        route: "player-profile",
        sport: String(sport || "").toUpperCase(),
        playerId: effectiveRoutePlayerId,
        msSinceRouteStart: Math.max(0, Date.now() - routeStartRef.current),
      });
    }
    if (!sectionLoadedRef.current.props && Array.isArray(data.currentProps) && data.currentProps.length > 0) {
      sectionLoadedRef.current.props = true;
      console.info("SECTION_LOADED: props", {
        route: "player-profile",
        sport: String(sport || "").toUpperCase(),
        playerId: effectiveRoutePlayerId,
        msSinceRouteStart: Math.max(0, Date.now() - routeStartRef.current),
      });
    }
  }, [data, effectiveRoutePlayerId, sport]);

  useEffect(() => {
    if (!sport || !playerIdParam) return;
    const requestedRoutePlayerId = String(effectiveRoutePlayerId || "").trim();
    const requestId = activeLoadRequestRef.current + 1;
    activeLoadRequestRef.current = requestId;
    const isActiveRequest = () => activeLoadRequestRef.current === requestId;
    const logFirstPaint = (source: "cache" | "network") => {
      if (firstPaintLoggedRef.current) return;
      firstPaintLoggedRef.current = true;
      console.info("FIRST_PAINT", {
        route: "player-profile",
        sport: String(sport || "").toUpperCase(),
        playerId: effectiveRoutePlayerId,
        source,
        msSinceRouteStart: Math.max(0, Date.now() - routeStartRef.current),
      });
    };
    const normalizeSportTag = (value: unknown): string => {
      const raw = String(value || "").trim().toUpperCase();
      if (raw === "CBB") return "NCAAB";
      if (raw === "CFB") return "NCAAF";
      return raw;
    };
    const expectedSportTag = normalizeSportTag(sport);
    const isRequestedSportPayload = (payload: PlayerProfileData | null | undefined): boolean => {
      const payloadSport = normalizeSportTag(payload?.player?.sport);
      return !payloadSport || payloadSport === expectedSportTag;
    };
    const isRequestedIdentityPayload = (payload: PlayerProfileData | null | undefined): boolean => {
      const requestedId = requestedRoutePlayerId;
      const renderedId = profileIdentityId(payload);
      const renderedName = profileIdentityName(payload);
      return Boolean(
        payload
        && requestedId
        && renderedId === requestedId
        && !isPlaceholderName(renderedName)
      );
    };
    const isFullyHydratedProfile = (payload: PlayerProfileData | null): payload is PlayerProfileData =>
      Boolean(payload && hasCoreProfileData(payload) && isRequestedIdentityPayload(payload));
    const fetchProfile = async () => {
      const loadStartedAt = Date.now();
      let apiCalls = 0;
      let cacheKey = "";
      let persistentKey = "";
      const effectivePlayerId = requestedRoutePlayerId;
      setLoadStatus("loading");
      setUnavailableReason(null);
      setLoading(true);
      setError(null);
      const unwrapProfile = (payload: any): any => {
        if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
          return payload.data.profile ?? null;
        }
        return payload;
      };

      if (!effectivePlayerId) {
        if (!isActiveRequest()) return;
        console.error("PLAYER_PROFILE_MISSING_PLAYER_ID", { sport, pathSegment, queryPlayerId });
        setData(null);
        setError("Player profile requires a numeric player id.");
        setLoadStatus("complete");
        setLoading(false);
        void fetch("/api/page-data/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            route: "player-profile",
            loadMs: Math.max(0, Date.now() - loadStartedAt),
            apiCalls: 0,
            oddsAvailableAtFirstRender: false,
            resolutionFailed: true,
          }),
        }).catch(() => undefined);
        return;
      }
      const hintedRouteName = String(effectivePlayerNameHint || "").trim();
      if (hintedRouteName && !isPlayerProfileDisplayNameFallback(hintedRouteName)) {
        try {
          const hintedHeadshotUrl =
            `/api/player/${encodeURIComponent(String(sport || "").toUpperCase())}/${encodeURIComponent(hintedRouteName)}/headshot`;
          const hintedHeadshotRes = await fetch(hintedHeadshotUrl, {
            credentials: "include",
          });
          const hintedHeadshotBody = await hintedHeadshotRes.json().catch(() => null);
          const hintedResolvedId = String(hintedHeadshotBody?.espnId || "").trim();
          if (/^\d{4,}$/.test(hintedResolvedId) && hintedResolvedId !== String(effectivePlayerId || "").trim()) {
            const hintedRouteBase = buildPlayerRoute(sport, hintedResolvedId);
            const hintedRoute = `${hintedRouteBase}?playerName=${encodeURIComponent(hintedRouteName)}`;
            navigate(hintedRoute, {
              replace: true,
              state: { playerNameHint: hintedRouteName },
            });
            return;
          }
        } catch {
          // Non-fatal; continue with current route id.
        }
      }

      const idScope = `:${effectivePlayerId}`;
      cacheKey = `player-profile:v2:${sport.toUpperCase()}:${effectivePlayerId}${idScope}`;
      persistentKey = `player-profile:last-good:v2:${sport.toUpperCase()}:${effectivePlayerId}${idScope}`;

      const cacheLookupStartedAt = Date.now();
      const cachedRaw = getRouteCache<PlayerProfileData>(cacheKey, 120_000);
      const cachedRawValid = isFullyHydratedProfile(cachedRaw) && isRequestedSportPayload(cachedRaw);
      const persistent = readPersistentLastGood(persistentKey);
      const cached = cachedRawValid
        ? cachedRaw
        : (isFullyHydratedProfile(persistent) && isRequestedSportPayload(persistent) ? persistent : null);
      console.info("PLAYER_PAGE_CACHE_LOOKUP", {
        route: "player-profile",
        sport: String(sport || "").toUpperCase(),
        playerId: effectivePlayerId,
        source: cachedRaw ? "route-cache" : (cached ? "persistent-last-good" : "none"),
        hit: Boolean(cached),
        ms: Math.max(0, Date.now() - cacheLookupStartedAt),
      });
      lastGoodProfileRef.current = cached ?? null;
      if (cached && isFullyHydratedProfile(cached)) {
          if (isActiveRequest()) {
            setData(cached);
            setLoading(false);
            setLoadStatus("complete");
            logFirstPaint("cache");
          }
        } else if (!cached) {
        if (isActiveRequest()) {
          setData(null);
          setLoadStatus("loading");
          setLoading(true);
        }
      }

      console.info("PAGE_DATA_START", { route: "player-profile", sport: sport.toUpperCase(), playerId: effectivePlayerId });
      const primaryUrl =
        `/api/page-data/player-profile?sport=${encodeURIComponent(sport)}&playerId=${encodeURIComponent(effectivePlayerId)}`
        + (effectivePlayerNameHint ? `&playerName=${encodeURIComponent(effectivePlayerNameHint)}` : "");
      const hasRecentLineEvidence = (payload: any): boolean => {
        const rows = Array.isArray(payload?.recentPerformance) ? payload.recentPerformance : [];
        return rows.some((row: any) => {
          const lines = row?.propLines;
          if (!lines || typeof lines !== "object") return false;
          return Object.values(lines).some((v) => Number.isFinite(Number(v)) && Number(v) > 0);
        });
      };
      const fetchCacheKey = buildPlayerProfileSnapshotCacheKey({
        sport: String(sport || "").toUpperCase(),
        playerId: String(effectivePlayerId || ""),
        playerNameHint: "-",
      });
      try {
        apiCalls += 1;
        let envelope: any = await fetchJsonCached<any>(primaryUrl, {
          cacheKey: fetchCacheKey,
          ttlMs: 45_000,
          timeoutMs: 8_000,
          init: { credentials: "include" },
        });
        let envelopePartialReason = String(envelope?.meta?.partialReason || "").trim().toLowerCase();

        const profileData = unwrapProfile(envelope);
        if (!profileData) {
          throw new Error("Player profile payload is empty");
        }
        const envelopeTeamId =
          envelope &&
          typeof envelope === "object" &&
          envelope.data &&
          typeof envelope.data === "object" &&
          "canonicalTeamRouteId" in envelope.data
            ? (envelope.data as { canonicalTeamRouteId?: unknown }).canonicalTeamRouteId
            : undefined;
        const profileDataWithTeam =
          envelopeTeamId !== undefined
            ? { ...profileData, canonicalTeamRouteId: envelopeTeamId }
            : profileData;
        console.info("PAGE_DATA_SUCCESS", {
          route: "player-profile",
          sport: sport.toUpperCase(),
          playerId: effectivePlayerId,
          hasCoreData: hasCoreProfileData(profileData),
        });

        const profileEid = String(profileDataWithTeam?.player?.id || profileDataWithTeam?.player?.espnId || "").trim();
        if (profileEid && profileEid !== effectivePlayerId) {
          const resolvedNameHint = String(
            profileDataWithTeam?.player?.displayName
            || profileDataWithTeam?.player?.name
            || effectivePlayerNameHint
            || ""
          ).trim();
          if (/^\d{4,}$/.test(profileEid)) {
            const canonicalRouteBase = buildPlayerRoute(sport, profileEid);
            const canonicalRoute = resolvedNameHint
              ? `${canonicalRouteBase}?playerName=${encodeURIComponent(resolvedNameHint)}`
              : canonicalRouteBase;
            navigate(canonicalRoute, {
              replace: true,
              state: resolvedNameHint ? { playerNameHint: resolvedNameHint } : undefined,
            });
            return;
          }
          throw new Error("Player identity mismatch");
        }
        if (!isRequestedSportPayload(profileDataWithTeam as PlayerProfileData)) {
          throw new Error("Player sport mismatch");
        }

        let mergedProfile = normalizeProfilePayload(
          profileDataWithTeam,
          lastGoodProfileRef.current || null
        );
        if (!mergedProfile) {
          throw new Error("Failed to load player data");
        }
        const shouldForceFreshNhl =
          String(sport || "").toUpperCase() === "NHL"
          && (!Array.isArray(mergedProfile.currentProps) || mergedProfile.currentProps.length === 0)
          && !hasRecentLineEvidence(mergedProfile);
        if (shouldForceFreshNhl) {
          try {
            apiCalls += 1;
            const freshUrl = `${primaryUrl}${primaryUrl.includes("?") ? "&" : "?"}fresh=1`;
            const freshEnvelope: any = await fetchJsonCached<any>(freshUrl, {
              cacheKey: `${fetchCacheKey}:fresh-heal`,
              ttlMs: 0,
              bypassCache: true,
              timeoutMs: 14_000,
              init: { credentials: "include" },
            });
            const freshProfile = unwrapProfile(freshEnvelope);
            const freshTeamId =
              freshEnvelope &&
              typeof freshEnvelope === "object" &&
              freshEnvelope.data &&
              typeof freshEnvelope.data === "object" &&
              "canonicalTeamRouteId" in freshEnvelope.data
                ? (freshEnvelope.data as { canonicalTeamRouteId?: unknown }).canonicalTeamRouteId
                : undefined;
            const freshWithTeam =
              freshTeamId !== undefined ? { ...freshProfile, canonicalTeamRouteId: freshTeamId } : freshProfile;
            const mergedFresh = normalizeProfilePayload(freshWithTeam, mergedProfile);
            if (mergedFresh) {
              mergedProfile = mergedFresh;
            }
          } catch {
            // keep first payload when forced refresh probe fails
          }
          const stillMissingNhlLines =
            (!Array.isArray(mergedProfile.currentProps) || mergedProfile.currentProps.length === 0)
            && !hasRecentLineEvidence(mergedProfile);
          if (stillMissingNhlLines) {
            try {
              const liveLookupKey = String(effectivePlayerNameHint || mergedProfile.player?.displayName || effectivePlayerId || "").trim();
              if (liveLookupKey) {
                apiCalls += 1;
                const liveUrl =
                  `/api/player/${encodeURIComponent(String(sport || "").toUpperCase())}/${encodeURIComponent(liveLookupKey)}?fresh=1`;
                const liveProfile: any = await fetchJsonCached<any>(liveUrl, {
                  cacheKey: `${fetchCacheKey}:live-heal`,
                  ttlMs: 0,
                  bypassCache: true,
                  timeoutMs: 14_000,
                  init: { credentials: "include" },
                });
                const liveResolvedId = String(
                  liveProfile?.player?.id
                  || liveProfile?.player?.espnId
                  || ""
                ).trim();
                if (/^\d{4,}$/.test(liveResolvedId) && liveResolvedId !== String(effectivePlayerId || "").trim()) {
                  const canonicalRouteBase = buildPlayerRoute(sport, liveResolvedId);
                  const canonicalRoute = liveLookupKey
                    ? `${canonicalRouteBase}?playerName=${encodeURIComponent(liveLookupKey)}`
                    : canonicalRouteBase;
                  navigate(canonicalRoute, {
                    replace: true,
                    state: liveLookupKey ? { playerNameHint: liveLookupKey } : undefined,
                  });
                  return;
                }
                const mergedLive = normalizeProfilePayload(liveProfile, mergedProfile);
                if (mergedLive) {
                  mergedProfile = mergedLive;
                }
              }
            } catch {
              // keep fresh page-data payload when direct live probe fails
            }
          }
        }
        const hasCoreData = hasCoreProfileData(mergedProfile as any);
        if (!isActiveRequest()) return;
        setData(mergedProfile);
        lastGoodProfileRef.current = mergedProfile;
        const hasAnchoredIdentity =
          String(mergedProfile?.player?.id || mergedProfile?.player?.espnId || "").trim()
            === String(effectivePlayerId || "").trim();
        if (hasCoreData) {
          setRouteCache(cacheKey, mergedProfile, 180_000);
          writePersistentLastGood(persistentKey, mergedProfile);
        }
        setLoadStatus(hasCoreData || hasAnchoredIdentity ? "complete" : "loading");
        logFirstPaint("network");
        console.info("PLAYER_PAGE_FULL_PAYLOAD_COMPLETE", {
          route: "player-profile",
          sport: sport.toUpperCase(),
          playerId: effectivePlayerId,
          msSinceRouteStart: Math.max(0, Date.now() - routeStartRef.current),
          msNetworkSinceLoadStart: Math.max(0, Date.now() - loadStartedAt),
          apiCalls,
        });

        if (!hasCoreData) {
          const mergedName = String(mergedProfile?.player?.displayName || "").trim();
          const hasAnyStatsData =
            Object.keys(mergedProfile?.seasonAverages || {}).length > 0
            || (Array.isArray(mergedProfile?.gameLog) && mergedProfile.gameLog.length > 0)
            || (Array.isArray(mergedProfile?.currentProps) && mergedProfile.currentProps.length > 0)
            || (Array.isArray(mergedProfile?.recentPerformance) && mergedProfile.recentPerformance.length > 0);
          if (!mergedName && !hasAnyStatsData) {
            // Keep anchored same-player shell visible; enrichment can still complete later.
            if (!hasAnchoredIdentity) {
              setData(null);
              setLoadStatus(isLocalDev ? "loading" : "unavailable");
              setError(null);
              return;
            }
          }
          if (envelopePartialReason === "unavailable_no_data" && !hasAnchoredIdentity) {
            setUnavailableReason("no_data");
            setData(null);
            setLoadStatus("unavailable");
            setError(null);
            return;
          }
          const runEnrichmentPoll = async () => {
            let unavailableSignals = 0;
            for (let i = 0; i < 4; i++) {
              if (!isActiveRequest()) return;
              await new Promise((r) => setTimeout(r, 750));
              if (!isActiveRequest()) return;
              try {
                const env = await fetchJsonCached<any>(primaryUrl, {
                  cacheKey: `${fetchCacheKey}:enrich:${i}`,
                  ttlMs: 0,
                  bypassCache: true,
                  timeoutMs: 6_000,
                  init: { credentials: "include" },
                });
                const pollPartialReason = String(env?.meta?.partialReason || "").trim().toLowerCase();
                if (pollPartialReason === "unavailable_no_data") {
                  unavailableSignals += 1;
                  if (!isActiveRequest()) return;
                  if (!hasAnchoredIdentity) {
                    if (unavailableSignals >= 3) {
                      setUnavailableReason("no_data");
                      setData(null);
                      setLoadStatus("unavailable");
                      setError(null);
                      return;
                    }
                  }
                  continue;
                }
                const prof = unwrapProfile(env);
                if (!prof) continue;
                const envTeam =
                  env &&
                  typeof env === "object" &&
                  env.data &&
                  typeof env.data === "object" &&
                  "canonicalTeamRouteId" in env.data
                    ? (env.data as { canonicalTeamRouteId?: unknown }).canonicalTeamRouteId
                    : undefined;
                const profWithTeam =
                  envTeam !== undefined ? { ...prof, canonicalTeamRouteId: envTeam } : prof;
                const profEid = String(profWithTeam?.player?.id || profWithTeam?.player?.espnId || "").trim();
                const profName = String(profWithTeam?.player?.displayName || profWithTeam?.player?.name || "").trim();
                if (!profEid || profEid !== effectivePlayerId) continue;
                if (isPlaceholderName(profName) || isPlayerProfileDisplayNameFallback(profName)) continue;
                const m = normalizeProfilePayload(profWithTeam, lastGoodProfileRef.current);
                if (!m || !isActiveRequest()) continue;
                setData(m);
                lastGoodProfileRef.current = m;
                if (hasCoreProfileData(m)) {
                  setRouteCache(cacheKey, m, 180_000);
                  writePersistentLastGood(persistentKey, m);
                  setLoadStatus("complete");
                  return;
                }
              } catch {
                /* continue polling */
              }
            }
            if (!isActiveRequest()) return;
            if (!hasAnchoredIdentity) {
              setUnavailableReason("no_data");
              setData(null);
              setLoadStatus("unavailable");
              setError(null);
              return;
            }
            setLoadStatus("complete");
            setError(null);
          };
          void runEnrichmentPoll();
        }
      } catch (err: any) {
        const status = Number(err?.status ?? 0);
        const snapBody = err?.responseBody as { error?: string } | undefined;
        const msg = String((err as Error)?.message || "");
        const requestTimedOut =
          /request timeout after/i.test(msg) || /abort/i.test(msg);
        const identityPending =
          msg === "Player identity placeholder" || msg === "Player identity mismatch";
        const profileStoreMiss =
          status === 503 &&
          (snapBody?.error === "player_profile_snapshot_miss" || snapBody?.error === "player_document_miss");
        const profileNotReady503 =
          status === 503
          && (snapBody?.error === "player_profile_not_ready" || snapBody?.error === "player_profile_not_prebuilt");
        if (profileStoreMiss) {
          console.warn("PLAYER_PROFILE_STORE_MISS", {
            sport,
            playerId: effectivePlayerId,
            error: snapBody?.error,
          });
        }
        console.error("Failed to fetch player profile:", err);
        if (
          lastGoodProfileRef.current &&
          String(lastGoodProfileRef.current?.player?.id || lastGoodProfileRef.current?.player?.espnId || "").trim() === String(effectivePlayerId || "").trim() &&
          isRequestedSportPayload(lastGoodProfileRef.current) &&
          hasCoreProfileData(lastGoodProfileRef.current)
        ) {
          if (!isActiveRequest()) return;
          setData(lastGoodProfileRef.current);
          setLoadStatus("complete");
          setError(null);
          return;
        }
        if (profileNotReady503) {
          if (!isActiveRequest()) return;
          setUnavailableReason("no_data");
          setData(null);
          setLoadStatus("unavailable");
          setError(null);
          return;
        }
        if (requestTimedOut) {
          if (!isActiveRequest()) return;
          const hasAnchoredShell =
            String(lastGoodProfileRef.current?.player?.id || lastGoodProfileRef.current?.player?.espnId || "").trim()
              === String(effectivePlayerId || "").trim();
          // Keep same-player shell visible immediately on timeout.
          setLoadStatus(hasAnchoredShell ? "complete" : "loading");
          setError(null);
          return;
        }
        if (!isActiveRequest()) return;
        setData(null);
        if (profileStoreMiss || identityPending || requestTimedOut) {
          setLoadStatus("loading");
          setError(null);
        } else {
          setLoadStatus("complete");
          setError(
            err instanceof Error ? err.message : "Failed to load player profile."
          );
        }
      } finally {
        if (!isActiveRequest()) return;
        void fetch("/api/page-data/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            route: "player-profile",
            loadMs: Math.max(0, Date.now() - loadStartedAt),
            apiCalls: Math.max(1, apiCalls),
            oddsAvailableAtFirstRender: false,
          }),
        }).catch(() => undefined);
        setLoading(false);
      }
    };
    
    void fetchProfile();
  }, [sport, playerIdParam, effectiveRoutePlayerId, pathSegment, queryPlayerId, effectivePlayerNameHint, readPersistentLastGood, writePersistentLastGood, normalizeProfilePayload, hasCoreProfileData, retryNonce, isLocalDev]);
  
  const isFollowing = useMemo(() => {
    if (!sport || !data?.player?.displayName) return false;
    return isPlayerFollowed(data.player.displayName, sport.toUpperCase());
  }, [sport, data?.player?.displayName, isPlayerFollowed]);
  
  // Handle follow/unfollow toggle
  const handleFollowClick = useCallback(async () => {
    if (!data?.player || !sport || followLoading) return;
    
    setFollowLoading(true);
    try {
      if (isFollowing) {
        // Unfollow
        await unfollowPlayerByName(data.player.displayName, sport.toUpperCase());
      } else {
        // Follow - include player details
        await followPlayer({
          player_name: data.player.displayName,
          player_id: data.player.espnId || undefined,
          sport: sport.toUpperCase(),
          team: data.player.teamName || undefined,
          team_abbr: data.player.teamAbbr || undefined,
          position: data.player.position || undefined,
          headshot_url: data.player.headshotUrl || undefined,
        });
      }
    } catch (err) {
      console.error('Failed to toggle follow:', err);
    } finally {
      setFollowLoading(false);
    }
  }, [data?.player, sport, isFollowing, followLoading, followPlayer, unfollowPlayerByName]);

  useEffect(() => {
    if (!scoutEnabled || !sport || !data?.player) return;
    let cancelled = false;
    (async () => {
      const sportUpper = sport.toUpperCase();
      const { players, teams } = await fetchScoutFlowPlayersAndTeams(sportUpper);
      if (cancelled) return;
      setScoutPlayers(players);
      setScoutTeams(teams);
    })();
    return () => {
      cancelled = true;
    };
  }, [sport, scoutEnabled, data?.player]);

  useEffect(() => {
    if (!sport || !effectiveRoutePlayerId) return;
    if (!scoutEnabled || loading || !data?.player) return;
    const pid =
      canonicalPlayerIdQueryParam(effectiveRoutePlayerId) ?? canonicalPlayerIdQueryParam(data?.player?.espnId);
    if (!pid) return;
    const displayName = String(data.player.displayName || "").trim();
    if (!displayName || isPlayerProfileDisplayNameFallback(displayName)) return;
    try {
      const raw = window.localStorage.getItem(SCOUT_FLOW_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const routeBase = buildPlayerRoute(String(sport || ""), pid);
      const route = `${routeBase}?playerName=${encodeURIComponent(displayName)}`;
      const next: ScoutRecentEntry = {
        type: "player",
        label: displayName,
        subtitle: data.player.teamName ? String(data.player.teamName) : undefined,
        sport: sport.toUpperCase(),
        path: route,
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
  }, [
    sport,
    effectiveRoutePlayerId,
    data?.player?.teamName,
    data?.player?.displayName,
    data?.player?.espnId,
    scoutEnabled,
    loading,
  ]);

  const scoutItems = useMemo<ScoutFlowItem[]>(() => {
    if (!scoutEnabled || !sport || !data?.player) return [];
    const sportUpper = sport.toUpperCase();
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

    const selfPid = canonicalPlayerIdQueryParam(effectiveRoutePlayerId) ?? "";
    const selfName = String(data?.player?.displayName || "").trim().toLowerCase();
    const playerItems: ScoutFlowItem[] = scoutPlayers
      .map((row) => {
        const resolvedId =
          resolvePlayerIdForNavigation(row.playerId, row.name, String(row.sport || sportUpper).toLowerCase())
          || "";
        return { row, resolvedId };
      })
      .filter(
        ({ row, resolvedId }) =>
          Boolean(resolvedId) &&
          resolvedId !== selfPid &&
          row.name.trim().toLowerCase() !== selfName
      )
      .slice(0, 12)
      .map(({ row, resolvedId }) => ({
        id: `player:${resolvedId}`,
        label: row.name || "Loading player profile...",
        subtitle: row.team || "Player",
        kind: "player" as const,
        onSelect: () => {
          const sportKey = String(row.sport || sport || "").toUpperCase();
          logPlayerNavigation(resolvedId, sportKey);
          const hintedName = String(row.name || "").trim();
          const routeBase = buildPlayerRoute(sportKey, resolvedId);
          const route = hintedName
            ? `${routeBase}?playerName=${encodeURIComponent(hintedName)}`
            : routeBase;
          navigate(route, {
            state: { playerNameHint: String(row.name || "").trim() },
          });
        },
      }));

    const teamItems: ScoutFlowItem[] = scoutTeams
      .filter((row) => {
        const tid = String(row.id || "").trim();
        return Boolean(tid) && !isLikelyUuid(tid);
      })
      .slice(0, 10)
      .map((row) => ({
        id: `team:${row.id}`,
        label: row.name || row.alias,
        subtitle: row.alias,
        kind: "team" as const,
        onSelect: () => {
          logTeamNavigation(row.id, sport);
          navigate(buildTeamRoute(String(sport || ""), row.id));
        },
      }));

    return [...recentItems, ...playerItems, ...teamItems];
  }, [
    scoutEnabled,
    sport,
    data,
    scoutRecent,
    scoutPlayers,
    scoutTeams,
    effectiveRoutePlayerId,
    navigate,
  ]);
  
  // Calculate season averages to display
  const displayAverages = useMemo(() => {
    if (!data?.seasonAverages) return [];
    
    const sportUpper = sport?.toUpperCase() || 'NBA';
    const season = data.seasonAverages || {};
    const readSeasonNumber = (key: string): number | null => {
      const value = (season as Record<string, unknown>)[key];
      if (value === null || value === undefined || value === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const sportKeys = (() => {
      if (sportUpper === "NHL") {
        const goalieSignal = readSeasonNumber("saves");
        if (goalieSignal !== null && goalieSignal > 0) {
          return ["saves", "goalsAgainst", "wins", "shots", "points"];
        }
        return ["goals", "assists", "points", "shots", "wins"];
      }
      return getPrimaryStatsForPlayer({
        sport: sportUpper,
        roleBucket: data?.player?.roleBucket,
        position: data?.player?.position,
      });
    })();
    const isMlbPitcher = isMlbPitcherRole(data?.player);
    const avgEntries: Array<{ key: string; value: number }> = [];
    
    for (const key of sportKeys) {
      const val = readSeasonNumber(key);
      if (val !== null) {
        avgEntries.push({ key, value: val });
      }
    }
    
    // If no matching keys, show first 6 available
    if (avgEntries.length === 0) {
      if (isMlbPitcher) {
        return [];
      }
      Object.entries(data.seasonAverages)
        .map(([key, value]) => ({ key, value: readSeasonNumber(key) ?? Number(value) }))
        .filter((row) => Number.isFinite(row.value))
        .slice(0, 6)
        .forEach((row) => avgEntries.push({ key: row.key, value: row.value }));
    }
    
    return avgEntries.slice(0, 6);
  }, [data?.seasonAverages, data?.player?.position, data?.player?.roleBucket, sport]);
  const extendedAverages = useMemo(() => displayAverages.slice(3), [displayAverages]);
  
  const teamQuickActionId = useMemo(() => {
    const fromDoc = String(data?.canonicalTeamRouteId || "").trim();
    if (fromDoc && !isLikelyUuid(fromDoc)) return fromDoc;
    const abbr = String(data?.player?.teamAbbr || "")
      .trim()
      .toUpperCase();
    const fromScout = scoutTeams.find((t) => t.alias === abbr)?.id;
    const resolved = String(fromScout || "").trim();
    return resolved && !isLikelyUuid(resolved) ? resolved : "";
  }, [data?.canonicalTeamRouteId, data?.player?.teamAbbr, scoutTeams]);

  return (
    <div className="relative min-h-screen">
      <CinematicBackground teamColor={data?.player?.teamColor} />
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Props</span>
        </button>

        {/* Full-page loading state until identity and profile contract are safe to render */}
        {showBlockingLoading && (
          <div className="space-y-3">
            <LoadingSkeleton />
            <p className="text-center text-sm text-white/60">Loading player profile...</p>
          </div>
        )}

        {!error && loadStatus === "unavailable" && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-300 mx-auto" />
            <p className="text-white font-medium">
              {unavailableReason === "no_data" ? "No verified player data is available yet." : "Player profile is temporarily unavailable."}
            </p>
            <p className="text-sm text-white/70">
              {unavailableReason === "no_data"
                ? "This player does not currently have enough stats/markets to render safely."
                : "We could not load enough verified data for this player right now."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setError(null);
                  setData(null);
                  setUnavailableReason(null);
                  setLoadStatus("loading");
                  setRetryNonce((n) => n + 1);
                }}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
              >
                Retry
              </button>
              <button
                onClick={() => navigate('/props')}
                className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-white text-sm"
              >
                Back to Player Props
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && !data && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-white mb-2">{error}</p>
            <button
              onClick={() => navigate('/props')}
              className="text-sm text-amber-400 hover:underline"
            >
              Back to Player Props
            </button>
          </div>
        )}
        
        {/* Render same-player shell once requested id is anchored */}
        {hasRouteIdAnchoredPayload && data?.player && (
          <>
            {scoutEnabled && (
              <PremiumScoutFlowBar
                title="Coach G Flow"
                placeholder="Jump to player or team..."
                items={scoutItems}
                quickActions={[
                  { id: "props", label: "All Props", onClick: () => navigate("/props") },
                  ...(teamQuickActionId
                    ? [{
                    id: "team",
                    label: data?.player?.teamName || "Team",
                    onClick: () => {
                      logTeamNavigation(teamQuickActionId, sport);
                      navigate(buildTeamRoute(String(sport || ""), teamQuickActionId));
                    },
                  }]
                    : []),
                ]}
              />
            )}
            {/* Hero Section */}
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden">
              <PlayerHero 
                player={data.player} 
                isFollowing={isFollowing}
                onFollowClick={handleFollowClick}
                isLoading={followLoading}
              />
            </div>
            
            {/* Primary Stats Row - Big numbers */}
            {displayAverages.length >= 3 && (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                <HeroStat
                  label={STAT_LABELS[displayAverages[0]?.key] || displayAverages[0]?.key || 'PTS'}
                  value={displayAverages[0]?.value?.toFixed(1) || '0.0'}
                  icon={Flame}
                  color="#F59E0B"
                />
                <HeroStat
                  label={STAT_LABELS[displayAverages[1]?.key] || displayAverages[1]?.key || 'REB'}
                  value={displayAverages[1]?.value?.toFixed(1) || '0.0'}
                  icon={Target}
                  color="#3B82F6"
                />
                <HeroStat
                  label={STAT_LABELS[displayAverages[2]?.key] || displayAverages[2]?.key || 'AST'}
                  value={displayAverages[2]?.value?.toFixed(1) || '0.0'}
                  icon={Zap}
                  color="#10B981"
                />
              </div>
            )}
            {displayAverages.length < 3 && loadStatus !== "complete" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="h-20 rounded-xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />
                <div className="h-20 rounded-xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />
                <div className="h-20 rounded-xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />
              </div>
            )}
            
            {/* Season Averages Grid (exclude top 3 hero stats to avoid duplicate display) */}
            {extendedAverages.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <h2 className="font-semibold text-white">More Season Averages</h2>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {extendedAverages.map(({ key, value }) => (
                    <StatCard 
                      key={key}
                      label={STAT_LABELS[key] || key}
                      value={typeof value === 'number' ? value.toFixed(1) : value}
                    />
                  ))}
                </div>
              </div>
            )}
            
            <LastFiveFormSection
              gameLog={data.gameLog}
              recentPerformance={data.recentPerformance}
              historicalVerifiedLines={data.historical_verified_lines || data.historicalLines || []}
              sport={data.player?.sport || sport}
              roleBucket={data.player?.roleBucket}
            />
            {showHeavySections ? (
              <EdgeSignalsSection edgeSignals={Array.isArray(data.edgeSignals) ? data.edgeSignals : []} />
            ) : (
              <div className="h-28 rounded-xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
            )}
            
            {/* Matchup & Health Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Next Matchup */}
              {data.matchup && (
                <MatchupSection matchup={data.matchup} gameLog={data.gameLog} vsOpponent={data.vsOpponent} />
              )}
              
              {/* Health & Minutes */}
              {data.health && (
                <HealthSection health={data.health} />
              )}
            </div>

            {/* Props & Hit Rates */}
            {showHeavySections ? (
              <PropHitRatesPanel
                hitRates={data.propHitRates}
                props={data.currentProps}
              />
            ) : (
              <div className="h-36 rounded-xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
            )}
            
            {/* Game Log */}
            {data.gameLog.length > 0 && (
              <GameLogTable 
                games={data.gameLog} 
                sport={data.player.sport} 
                seasonAverages={data.seasonAverages}
                roleBucket={data.player?.roleBucket}
                position={data.player?.position}
              />
            )}
            {data.gameLog.length === 0 && loadStatus !== "complete" && (
              <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-6">
                <div className="h-4 w-40 bg-white/[0.05] rounded mb-3 animate-pulse" />
                <div className="h-24 bg-white/[0.03] rounded animate-pulse" />
              </div>
            )}
            
            {/* Empty state for no data */}
            {data.gameLog.length === 0
              && Object.keys(data.seasonAverages).length === 0
              && (!Array.isArray(data.currentProps) || data.currentProps.length === 0)
              && (!Array.isArray(data.recentPerformance) || data.recentPerformance.length === 0)
              && !data.matchup
              && (
              (() => {
                const docPending = data.player?.__documentPending === true;
                const hasIdentityContext = Boolean(
                  String(data.player?.espnId || "").trim()
                  || String(data.player?.teamName || "").trim()
                  || String(data.player?.teamAbbr || "").trim()
                  || String(data.player?.headshotUrl || "").trim()
                );
                return (
              <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-8 text-center">
                <User className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/50 mb-1">
                  {docPending
                    ? "Season stats & game log"
                    : hasIdentityContext
                      ? "No recent stats yet"
                      : "Limited data available"}
                </p>
                <p className="text-sm text-white/30">
                  {docPending
                    ? "Nothing to show in this section yet."
                    : hasIdentityContext
                      ? "This player does not have enough recent game data in this view."
                      : "Game logs and stats may not be available for this player."}
                </p>
              </div>
                );
              })()
            )}

            {/* Coach G Analysis */}
            <CoachGAnalysis 
              player={data.player}
              gameLog={data.gameLog}
              seasonAverages={data.seasonAverages}
              props={data.currentProps}
            />
          </>
        )}
      </div>
    </div>
  );
}
