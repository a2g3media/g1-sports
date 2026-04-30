/**
 * :rotating_light: LOCKED FILE — DO NOT MODIFY :rotating_light:
 *
 * This file contains the stabilized live games engine.
 *
 * DO NOT CHANGE:
 * - live loop (setInterval / rehydration)
 * - resolveGameState
 * - live detection (isGameLive)
 * - bucket logic (LIVE / FINAL / UPCOMING)
 * - data pipeline or mappings
 *
 * ONLY ALLOWED:
 * - small UI text/spacing tweaks
 *
 * Any logic change requires explicit approval.
 */
/**
 * GamesPage - TODAY COMMAND CENTER
 * Premium watchboard layout: compact header, sport quick-jump, games by league
 */

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { RefreshCw, AlertCircle, ChevronDown, X, Zap, Star, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { LivePulseTicker } from '@/react-app/components/LivePulseTicker';
import { ApprovedScoreCardGame } from '@/react-app/components/ApprovedScoreCard';
import { CompactGameTile } from '@/react-app/components/CompactGameTile';
import { OddsIntelligenceDashboard } from '@/react-app/components/OddsIntelligenceDashboard';
import { useGlobalAI } from '@/react-app/components/GlobalAIProvider';
import { AVAILABLE_SPORTS } from '@/react-app/hooks/useScoreboard';
import { useWatchboards } from '@/react-app/hooks/useWatchboards';
// Direct fetch instead of useDataHub for reliability
import AddToWatchboardModal from '@/react-app/components/AddToWatchboardModal';
import { cn } from '@/react-app/lib/utils';
import { toGameDetailPath, toOddsGamePath } from '@/react-app/lib/gameRoutes';
import { fetchJsonCached } from '@/react-app/lib/fetchCache';
import { buildPageDataGamesCacheKey, buildPageDataGamesUrl } from '@/react-app/lib/pageDataKeys';
import { incrementPerfCounter, startPerfTimer } from '@/react-app/lib/perfTelemetry';
import { OddsTelemetryDebugPanel } from '@/react-app/components/debug/OddsTelemetryDebugPanel';
import { generateCoachWhisper as _generateCoachWhisper } from '@/react-app/lib/coachWhisper';
import { useFeatureFlags } from '@/react-app/hooks/useFeatureFlags';
import { prefetch } from '@/react-app/components/LazyRoute';
import { useSafeDataLoader } from '@/react-app/lib/useSafeDataLoader';
// getTeamLogoUrl imported via teamLogos but unused currently
// import { getTeamLogoUrl } from '@/react-app/lib/teamLogos';

type StatusFilter = 'all' | 'live' | 'scheduled' | 'final';
type CommandTab = 'scores' | 'odds' | 'props';
type GamesFetchResult = { blockingError: string | null };

// ============================================
// DATE-BASED GAMES CACHE - Instant date switching
// ============================================
const GAMES_CACHE_VERSION = 'v2';
const GAMES_CACHE_TTL = 120000; // 2 minutes - fresh enough for instant display

interface DateCachedGames {
  games: any[];
  timestamp: number;
}

function getDateCacheKey(dateStr: string, sport: string = 'ALL', includeOdds: boolean = false): string {
  return `gz_games_${GAMES_CACHE_VERSION}_${sport.toUpperCase()}_${includeOdds ? 'odds1' : 'odds0'}_${dateStr}`;
}

function loadCachedGamesForDate(
  dateStr: string,
  sport: string = 'ALL',
  maxAgeMs: number = GAMES_CACHE_TTL,
  includeOdds: boolean = false
): any[] | null {
  try {
    const cached = localStorage.getItem(getDateCacheKey(dateStr, sport, includeOdds));
    if (!cached) return null;
    const data: DateCachedGames = JSON.parse(cached);
    if (Date.now() - data.timestamp < maxAgeMs) {
      return data.games;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedGamesForDate(dateStr: string, games: any[], sport: string = 'ALL', includeOdds: boolean = false): void {
  try {
    const data: DateCachedGames = { games, timestamp: Date.now() };
    localStorage.setItem(getDateCacheKey(dateStr, sport, includeOdds), JSON.stringify(data));
    
    // Clean up old date caches (keep only last 20 entries across sports)
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('gz_games_'));
    if (allKeys.length > 20) {
      // Sort by key (older dates first) and remove oldest
      allKeys.sort();
      const keysToRemove = allKeys.slice(0, allKeys.length - 20);
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  } catch {
    // localStorage might be full or disabled
  }
}

type RouteSlateCacheEntry = {
  games: any[];
  updatedAt: number;
};

type DateGamesCacheEntry = {
  games: any[];
  summary: Record<string, any>;
  updatedAt: number;
};

const routeSlateCache = new Map<string, RouteSlateCacheEntry>();
const dateGamesCache = new Map<string, DateGamesCacheEntry>();
let gamesRouteChunksPrefetched = false;

function prefetchGamesRouteChunks(): void {
  if (gamesRouteChunksPrefetched) return;
  gamesRouteChunksPrefetched = true;
  prefetch(() => import('@/react-app/pages/GameDetailPage'));
  prefetch(() => import('@/react-app/pages/OddsGamePage'));
  prefetch(() => import('@/react-app/pages/PlayerProfilePage'));
}

function getRouteSlateCacheKey(dateStr: string, sport: string): string {
  return `${String(sport || 'ALL').toUpperCase()}|${dateStr}`;
}

function writeRouteSlateCache(key: string, games: any[]): void {
  if (!Array.isArray(games) || games.length === 0) return;
  routeSlateCache.set(key, { games, updatedAt: Date.now() });
}

// Date utilities
const formatDateYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateYYYYMMDD = (str: string): Date | null => {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  if (isNaN(date.getTime())) return null;
  return date;
};

const getDateLabel = (date: Date, today: Date): string => {
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  const todayCopy = new Date(today);
  todayCopy.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((compareDate.getTime() - todayCopy.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const normalizeOddsGameId = (value: unknown): string => String(value || "").trim().toLowerCase();

const readSportParamFromLocation = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('sport');
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  return normalized || null;
};

const buildOddsLookupCandidates = (value: unknown): string[] => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normalizeOddsGameId(v);
    if (n) out.add(n);
  };
  add(raw);
  if (raw.startsWith("sr_")) {
    const parts = raw.split("_");
    const tail = parts.slice(2).join("_");
    if (tail) {
      add(`sr:sport_event:${tail.replace(/_/g, "-")}`);
      add(`sr:sport_event:${tail}`);
      add(`sr:match:${tail}`);
      add(tail);
      add(tail.replace(/_/g, "-"));
    }
  }
  if (raw.startsWith("sr:sport_event:")) {
    const tail = raw.replace("sr:sport_event:", "");
    add(tail);
    add(`sr_${tail.replace(/-/g, "_")}`);
    add(tail.replace(/-/g, "_"));
  }
  if (raw.startsWith("sr:match:")) {
    const tail = raw.replace("sr:match:", "");
    add(tail);
    add(`sr_${tail.replace(/-/g, "_")}`);
  }
  return Array.from(out);
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const readProbablePitcherFromGame = (
  game: any,
  side: "away" | "home"
): { name: string; record?: string } | undefined => {
  const sideKey = side === "away" ? "away" : "home";
  const nested = game?.probable_pitchers?.[sideKey] || game?.probablePitchers?.[sideKey];
  const name = String(
    nested?.name
    || game?.[side === "away" ? "probable_away_pitcher_name" : "probable_home_pitcher_name"]
    || game?.[side === "away" ? "probableAwayPitcherName" : "probableHomePitcherName"]
    || ""
  ).trim();
  if (!name) return undefined;
  const record = String(
    nested?.record
    || game?.[side === "away" ? "probable_away_pitcher_record" : "probable_home_pitcher_record"]
    || game?.[side === "away" ? "probableAwayPitcherRecord" : "probableHomePitcherRecord"]
    || ""
  ).trim();
  return {
    name,
    record: record || undefined,
  };
};

const oddsSummaryStrength = (summary: any): number => {
  if (!summary || typeof summary !== 'object') return 0;
  let score = 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? 1 : 0);
  score += n(summary?.spread?.home_line);
  score += n(summary?.total?.line);
  score += n(summary?.moneyline?.home_price) + n(summary?.moneyline?.away_price);
  score += n(summary?.first_half?.spread?.home_line) + n(summary?.first_half?.spread?.away_line);
  score += n(summary?.first_half?.total?.line);
  score += n(summary?.first_half?.moneyline?.home_price) + n(summary?.first_half?.moneyline?.away_price);
  score += n(summary?.opening_spread) + n(summary?.opening_total);
  return score;
};

const mergeOddsSummaryRecord = (
  prev: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> => {
  const merged = { ...prev };
  for (const [key, nextSummary] of Object.entries(incoming)) {
    const nextStrength = oddsSummaryStrength(nextSummary);
    if (nextStrength <= 0) continue;
    const prevSummary = merged[key];
    const prevStrength = oddsSummaryStrength(prevSummary);
    if (!prevSummary || nextStrength >= prevStrength) {
      merged[key] = nextSummary;
    }
  }
  return merged;
};

const hasRenderableOddsSummary = (summary: any): boolean => oddsSummaryStrength(summary) > 0;

function getOddsSummaryCacheKey(dateStr: string): string {
  return `games:lastSummary:${dateStr}`;
}

function loadCachedOddsSummary(dateStr: string): Record<string, any> | null {
  try {
    const raw = sessionStorage.getItem(getOddsSummaryCacheKey(dateStr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveCachedOddsSummary(dateStr: string, summaries: Record<string, any>): void {
  try {
    const trimmed = Object.fromEntries(
      Object.entries(summaries)
        .filter(([, summary]) => hasRenderableOddsSummary(summary))
        .slice(0, 800)
    );
    sessionStorage.setItem(getOddsSummaryCacheKey(dateStr), JSON.stringify(trimmed));
  } catch {
    // ignore cache write failures
  }
}

const normalizeTeamToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const ymdPart = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const buildOddsMatchKey = (sport: unknown, home: unknown, away: unknown, startTime: unknown): string | null => {
  const s = String(sport || "").trim().toUpperCase();
  const h = normalizeTeamToken(home);
  const a = normalizeTeamToken(away);
  const d = ymdPart(startTime);
  if (!s || !h || !a) return null;
  return `match::${s}|${h}|${a}|${d || "nodate"}`;
};

const getGamesApiPath = (dateStr: string, sport: string, includeOdds: boolean = false): string => {
  return buildPageDataGamesUrl({
    date: dateStr,
    sport: String(sport || "").trim().toUpperCase() || "ALL",
    tab: includeOdds ? "odds" : "scores",
  });
};

type ResolvedStatusBucket = 'LIVE' | 'FINAL' | 'UPCOMING';

type FreshSportTruthSnapshot = {
  canonicalId: string;
  canonicalMatchKey: string | null;
  sport: string;
  status: string;
  period: string | null;
  periodLabel: string | null;
  clock: string | null;
  homeScore: number | null;
  awayScore: number | null;
  startTime: string | null;
  lastUpdatedAt: string | null;
  source: 'sport_fresh';
};

type ResolvedGameState = {
  canonicalId: string;
  canonicalMatchKey: string | null;
  sport: string;
  status_bucket: ResolvedStatusBucket;
  status: string;
  display_status_label: string;
  period: string | null;
  period_label: string | null;
  clock: string | null;
  homeScore: number | null;
  awayScore: number | null;
  start_time: string | null;
  last_updated_at: string | null;
  source_of_truth_used: 'sport_fresh' | 'all_payload';
};

const LIVE_STATUS_TOKENS = new Set([
  'LIVE',
  'IN_PROGRESS',
  'HALFTIME',
  'HALF_TIME',
  'INTERMISSION',
  'END_PERIOD',
  'END_OF_PERIOD',
  'OT',
  'OVERTIME',
  'EXTRA_TIME',
  'ET',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  '1H',
  '2H',
  'P1',
  'P2',
  'P3',
  'TOP',
  'BOT',
  'MID',
  'END',
  'RUNNING',
]);

const FINAL_STATUS_TOKENS = new Set([
  'FINAL',
  'COMPLETED',
  'COMPLETE',
  'CLOSED',
  'FT',
  'FULL_TIME',
  'AFTER_ET',
  'AET',
  'AFTER_PENALTIES',
  'PEN',
  'ENDED',
  'POSTGAME',
]);

const UPCOMING_STATUS_TOKENS = new Set([
  'SCHEDULED',
  'NOT_STARTED',
  'PRE',
  'PREGAME',
  'UPCOMING',
  'NS',
  'TBD',
  'DELAYED',
]);

const SPORT_REFRESH_CANDIDATES = ['MLB', 'NBA', 'NHL', 'NFL', 'NCAAB', 'NCAAF', 'SOCCER', 'MMA', 'GOLF'] as const;
const LIVE_REHYDRATE_INTERVAL_MS = 20_000;
const SLATE_REHYDRATE_INTERVAL_MS = 75_000;
const SPORT_TRUTH_CACHE_TTL_MS = 6_000;

const normalizeStatusUpper = (value: unknown): string => {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
};

const normalizeClockText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const normalizePeriodText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const sportFromGameLike = (game: any): string => normalizeSportForGamesPage(game?.sport, game?.league);

const canonicalGameId = (game: any): string => {
  const preferred = [
    game?.game_id,
    game?.gameId,
    game?.id,
    game?.external_id,
    game?.externalId,
  ]
    .map((v) => String(v || '').trim())
    .find(Boolean);
  if (preferred) return preferred;
  const fallback = [
    sportFromGameLike(game),
    String(game?.home_team_code || game?.homeTeam?.abbreviation || game?.homeTeam?.abbr || game?.home_team_name || '').trim(),
    String(game?.away_team_code || game?.awayTeam?.abbreviation || game?.awayTeam?.abbr || game?.away_team_name || '').trim(),
    String(game?.start_time || game?.startTime || '').trim(),
  ]
    .filter(Boolean)
    .join('|');
  return fallback || `unknown_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

const canonicalMatchKeyFromGame = (game: any): string | null => {
  return buildOddsMatchKey(
    sportFromGameLike(game),
    game?.home_team_code || game?.homeTeam?.abbreviation || game?.homeTeam?.abbr || game?.home_team_name || game?.homeTeam?.name,
    game?.away_team_code || game?.awayTeam?.abbreviation || game?.awayTeam?.abbr || game?.away_team_name || game?.awayTeam?.name,
    game?.start_time || game?.startTime || ''
  );
};

const statusLooksLive = (status: string, period: string | null, clock: string | null): boolean => {
  if (LIVE_STATUS_TOKENS.has(status)) return true;
  if (FINAL_STATUS_TOKENS.has(status) || UPCOMING_STATUS_TOKENS.has(status)) return false;
  const periodText = String(period || '').toUpperCase();
  const clockText = String(clock || '').toUpperCase();
  return LIVE_STATUS_TOKENS.has(periodText) || LIVE_STATUS_TOKENS.has(clockText) || Boolean(clockText && /[:']/i.test(clockText));
};

const statusLooksFinal = (status: string): boolean => FINAL_STATUS_TOKENS.has(status);

const toStatusBucket = (status: string, period: string | null, clock: string | null): ResolvedStatusBucket => {
  if (statusLooksFinal(status)) return 'FINAL';
  if (statusLooksLive(status, period, clock)) return 'LIVE';
  return 'UPCOMING';
};

const isFinalLikeStatusText = (status: unknown): boolean => {
  const upper = normalizeStatusUpper(status);
  return FINAL_STATUS_TOKENS.has(upper) || upper === 'FINAL';
};

const parsePeriodNumber = (period: unknown): number | null => {
  if (typeof period === 'number' && Number.isFinite(period)) return period;
  const raw = String(period ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/\d{1,2}/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
};

const isClockNonZero = (clock: unknown): boolean => {
  const raw = String(clock ?? '').trim();
  if (!raw) return false;
  const digitsOnly = raw.replace(/[^0-9]/g, '');
  if (!digitsOnly) return false;
  return Number(digitsOnly) > 0;
};

/** :lock: LOCKED LOGIC — DO NOT TOUCH */
function isGameLive(game: any): boolean {
  const status = String(game?.status || '').trim();
  const statusUpper = normalizeStatusUpper(status);
  if (isFinalLikeStatusText(statusUpper)) return false;
  if (
    status === 'inprogress' ||
    statusUpper === 'IN_PROGRESS' ||
    status === 'live' ||
    statusUpper === 'LIVE' ||
    status === 'playing' ||
    statusUpper === 'PLAYING'
  ) {
    return true;
  }

  const period = game?.period ?? game?.period_label ?? game?.periodLabel;
  const periodNumber = parsePeriodNumber(period);
  if (periodNumber != null && periodNumber > 0) return true;

  const clock = game?.clock;
  if (isClockNonZero(clock)) return true;

  return false;
}

const cleanFinalLiveFields = (bucket: ResolvedStatusBucket, value: string | null): string | null => {
  if (bucket === 'FINAL') return null;
  return value;
};

const buildFreshTruthSnapshot = (game: any): FreshSportTruthSnapshot => {
  const canonicalId = canonicalGameId(game);
  const status = normalizeStatusUpper(game?.status);
  return {
    canonicalId,
    canonicalMatchKey: canonicalMatchKeyFromGame(game),
    sport: sportFromGameLike(game),
    status,
    period: normalizePeriodText(game?.period),
    periodLabel: normalizePeriodText(game?.period_label ?? game?.periodLabel),
    clock: normalizeClockText(game?.clock),
    homeScore: toFiniteNumberOrNull(game?.home_score ?? game?.homeTeam?.score),
    awayScore: toFiniteNumberOrNull(game?.away_score ?? game?.awayTeam?.score),
    startTime: String(game?.start_time || game?.startTime || '').trim() || null,
    lastUpdatedAt: String(game?.last_updated_at || game?.updated_at || '').trim() || null,
    source: 'sport_fresh',
  };
};

/** :lock: LOCKED LOGIC — DO NOT TOUCH */
const resolveGameState = (
  rawGame: any,
  freshTruth?: FreshSportTruthSnapshot
): ResolvedGameState => {
  const canonicalId = canonicalGameId(rawGame);
  const canonicalMatchKey = canonicalMatchKeyFromGame(rawGame);
  const sport = sportFromGameLike(rawGame);
  const baseStatus = normalizeStatusUpper(rawGame?.status || 'SCHEDULED');
  const mergedStatus = freshTruth?.status || baseStatus;
  const mergedPeriod = normalizePeriodText(freshTruth?.period ?? rawGame?.period);
  const mergedPeriodLabel = normalizePeriodText(freshTruth?.periodLabel ?? rawGame?.period_label ?? rawGame?.periodLabel);
  const mergedClock = normalizeClockText(freshTruth?.clock ?? rawGame?.clock);
  const bucket = toStatusBucket(mergedStatus, mergedPeriodLabel || mergedPeriod, mergedClock);

  const statusForCard = bucket === 'UPCOMING' ? 'SCHEDULED' : bucket;
  const finalPeriod = cleanFinalLiveFields(bucket, mergedPeriod);
  const finalPeriodLabel = cleanFinalLiveFields(bucket, mergedPeriodLabel);
  const finalClock = cleanFinalLiveFields(bucket, mergedClock);

  return {
    canonicalId,
    canonicalMatchKey,
    sport,
    status_bucket: bucket,
    status: statusForCard,
    display_status_label: finalPeriodLabel || finalPeriod || finalClock || statusForCard,
    period: finalPeriod,
    period_label: finalPeriodLabel,
    clock: finalClock,
    homeScore: freshTruth?.homeScore ?? toFiniteNumberOrNull(rawGame?.home_score),
    awayScore: freshTruth?.awayScore ?? toFiniteNumberOrNull(rawGame?.away_score),
    start_time: String(freshTruth?.startTime || rawGame?.start_time || '').trim() || null,
    last_updated_at: String(freshTruth?.lastUpdatedAt || rawGame?.last_updated_at || '').trim() || null,
    source_of_truth_used: freshTruth ? 'sport_fresh' : 'all_payload',
  };
};

// Sport validation - ALL is special, fetches from all sports
const validSportKeys = ['ALL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'SOCCER', 'MMA', 'GOLF'] as const;
type ExtendedSportKey = typeof validSportKeys[number];
const isValidSport = (s: string | null): s is ExtendedSportKey => 
  s !== null && (validSportKeys as readonly string[]).includes(s as typeof validSportKeys[number]);

function normalizeSportForGamesPage(rawSport: unknown, rawLeague?: unknown): string {
  const upper = String(rawSport || '').toUpperCase();
  const league = String(rawLeague || '').toUpperCase();
  const soccerLeagueHints = [
    'UEFA', 'EUROPA', 'CHAMPIONS', 'PREMIER', 'EPL', 'MLS',
    'LA_LIGA', 'LA LIGA', 'SERIE_A', 'SERIE A', 'BUNDES',
    'LIGUE_1', 'LIGUE 1', 'LIGA_MX', 'LIGA MX', 'EREDIVISIE',
    'PRIMEIRA', 'COPA', 'WORLD CUP', 'NATIONS LEAGUE',
  ];
  const hasSoccerLeagueSignal = soccerLeagueHints.some((hint) => league.includes(hint));
  if (upper === 'CBB' || upper === 'NCAAM' || upper === 'NCAA_MEN_BASKETBALL') return 'NCAAB';
  if (upper === 'CFB' || upper === 'NCAAFB' || upper === 'NCAA_FOOTBALL') return 'NCAAF';
  if (upper === 'ICEHOCKEY' || upper === 'HOCKEY') return 'NHL';
  if (upper === 'BASEBALL') return 'MLB';
  if (
    hasSoccerLeagueSignal ||
    upper === 'SOCCER' ||
    upper === 'FOOTBALL_SOCCER' ||
    upper === 'EPL' ||
    upper === 'MLS' ||
    upper === 'UCL' ||
    upper === 'UEFA' ||
    upper === 'EUROPA_LEAGUE' ||
    upper === 'EUROPA-LEAGUE' ||
    upper === 'CHAMPIONS_LEAGUE' ||
    upper === 'CHAMPIONS-LEAGUE' ||
    upper === 'PREMIER_LEAGUE' ||
    upper === 'PREMIER-LEAGUE' ||
    upper === 'LA_LIGA' ||
    upper === 'SERIE_A' ||
    upper === 'BUNDESLIGA' ||
    upper === 'LIGUE_1'
  ) return 'SOCCER';
  if (upper === 'PGA' || upper === 'LIV' || upper === 'DP' || upper === 'GOLF_TOURNAMENT') return 'GOLF';
  if (upper === 'BASKETBALL') {
    if (league.includes('NCAA') || league.includes('NCAAB') || league.includes('CBB')) return 'NCAAB';
    return 'NBA';
  }
  if (upper === 'FOOTBALL') {
    if (league.includes('NCAA') || league.includes('NCAAF') || league.includes('COLLEGE')) return 'NCAAF';
    if (hasSoccerLeagueSignal) return 'SOCCER';
    return 'NFL';
  }
  return upper || 'NBA';
}

// Sports list for dropdown - ALL first, PROPS special (navigates to /props page)
const DROPDOWN_SPORTS = [
  { key: 'ALL', label: 'All Sports', emoji: '🏆' },
  { key: 'NBA', label: 'NBA', emoji: '🏀' },
  { key: 'MLB', label: 'MLB', emoji: '⚾' },
  { key: 'NHL', label: 'NHL', emoji: '🏒' },
  { key: 'NCAAB', label: 'NCAAB', emoji: '🏀' },
  { key: 'SOCCER', label: 'Soccer', emoji: '⚽' },
  { key: 'MMA', label: 'MMA/UFC', emoji: '🥊' },
  { key: 'GOLF', label: 'Golf/PGA', emoji: '⛳' },
  { key: 'PROPS', label: 'Player Props', emoji: '🎯' },
] as const;

// National TV networks - games on these are considered Prime Time
const NATIONAL_TV_NETWORKS = [
  'ABC', 'ESPN', 'ESPN2', 'FOX', 'NBC', 'CBS', 'TNT', 'TBS', 
  'NFL NETWORK', 'NBA TV', 'MLB NETWORK', 'NHL NETWORK',
  'FS1', 'NBCSN', 'USA', 'PEACOCK', 'AMAZON', 'PRIME', 'ESPN+'
];

const isNationalTV = (channel: string | null | undefined): boolean => {
  if (!channel) return false;
  const ch = channel.toUpperCase();
  return NATIONAL_TV_NETWORKS.some(network => ch.includes(network));
};

// OddsCell - Premium sportsbook-style odds button (reserved for future table view)
// @ts-ignore - reserved for future use
interface _OddsCellProps {
  value: string | number | null | undefined;
  color: 'cyan' | 'amber' | 'emerald';
  isFavorite?: boolean;
}

// @ts-ignore - reserved for future use
const _OddsCell = ({ value, color, isFavorite }: _OddsCellProps) => {
  if (!value) {
    return (
      <div className="h-7 flex items-center justify-center">
        <span className="text-slate-600 text-xs">—</span>
      </div>
    );
  }
  
  const colorClasses = {
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20',
    emerald: isFavorite 
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25' 
      : 'bg-slate-700/30 border-slate-600/30 text-slate-300 hover:bg-slate-600/40',
  };
  
  return (
    <div className={cn(
      "h-7 px-2 flex items-center justify-center rounded border transition-colors cursor-pointer",
      colorClasses[color]
    )}>
      <span className="text-[11px] font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
};

// Soccer league options - available feed groupings
// @ts-ignore - reserved for future use
const _SOCCER_LEAGUES = [
  { code: 'ALL', label: 'All Leagues' },
  { code: 'EPL', label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { code: 'ESP', label: '🇪🇸 La Liga' },
  { code: 'MLS', label: '🇺🇸 MLS' },
  { code: 'UCL', label: '🏆 Champions League' },
] as const;

// NCAAB conference options (v2)
// @ts-ignore - reserved for future use
const _NCAAB_CONFERENCES = [
  { code: 'ALL', label: 'All Conferences' },
  { code: 'TOP25', label: '⭐ Top 25' },
  { code: 'ACC', label: 'ACC' },
  { code: 'BIG10', label: 'Big Ten' },
  { code: 'BIG12', label: 'Big 12' },
  { code: 'SEC', label: 'SEC' },
  { code: 'BIGEAST', label: 'Big East' },
  { code: 'PAC12', label: 'Pac-12' },
  { code: 'AAC', label: 'AAC' },
  { code: 'MWC', label: 'Mountain West' },
  { code: 'WCC', label: 'WCC' },
  { code: 'A10', label: 'Atlantic 10' },
  { code: 'CUSA', label: 'C-USA' },
  { code: 'MAC', label: 'MAC' },
  { code: 'SUNBELT', label: 'Sun Belt' },
  { code: 'SOCON', label: 'SoCon' },
  { code: 'IVY', label: 'Ivy League' },
  { code: 'MEAC', label: 'MEAC' },
  { code: 'SWAC', label: 'SWAC' },
  { code: 'MAAC', label: 'MAAC' },
  { code: 'HORIZON', label: 'Horizon' },
  { code: 'MVC', label: 'Missouri Valley' },
  { code: 'OVC', label: 'Ohio Valley' },
  { code: 'WAC', label: 'WAC' },
  { code: 'ASUN', label: 'ASUN' },
  { code: 'BIG SKY', label: 'Big Sky' },
  { code: 'CAA', label: 'CAA' },
  { code: 'SUMMIT', label: 'Summit' },
] as const;

// NCAAF conference options (Power 5 + Group of 5 + FCS)
// @ts-ignore - reserved for future use
const _NCAAF_CONFERENCES = [
  { code: 'ALL', label: 'All Conferences' },
  { code: 'TOP25', label: '⭐ Top 25' },
  // Power 5
  { code: 'ACC', label: 'ACC' },
  { code: 'BIG10', label: 'Big Ten' },
  { code: 'BIG12', label: 'Big 12' },
  { code: 'SEC', label: 'SEC' },
  { code: 'PAC12', label: 'Pac-12' },
  // Group of 5
  { code: 'AAC', label: 'AAC' },
  { code: 'MWC', label: 'Mountain West' },
  { code: 'CUSA', label: 'C-USA' },
  { code: 'MAC', label: 'MAC' },
  { code: 'SUNBELT', label: 'Sun Belt' },
  // FCS
  { code: 'CAA', label: 'CAA' },
  { code: 'MVFC', label: 'MO Valley (FCS)' },
  { code: 'BIG SKY', label: 'Big Sky' },
  { code: 'SOCON', label: 'SoCon' },
  { code: 'IVY', label: 'Ivy League' },
  { code: 'MEAC', label: 'MEAC' },
  { code: 'SWAC', label: 'SWAC' },
  { code: 'OVC', label: 'Ohio Valley' },
  { code: 'PATRIOT', label: 'Patriot' },
  { code: 'PIONEER', label: 'Pioneer' },
] as const;

// Sport Quick-Jump Chips (horizontal strip)
const SPORT_CHIPS = [
  { key: 'ALL', label: 'All' },
  { key: 'NBA', label: 'NBA' },
  { key: 'NHL', label: 'NHL' },
  { key: 'MLB', label: 'MLB' },
  { key: 'NCAAB', label: 'NCAAB' },
  { key: 'SOCCER', label: 'Soccer' },
  { key: 'MMA', label: 'MMA' },
  { key: 'GOLF', label: 'Golf' },
] as const;

async function fetchSoccerPageDataFallback(
  dateStr: string,
  forceRefresh: boolean
): Promise<{ games: any[]; summary: Record<string, any> }> {
  try {
    const payload = await fetchJsonCached<any>(buildPageDataGamesUrl({
      date: dateStr,
      sport: 'SOCCER',
      tab: 'scores',
      fresh: forceRefresh,
    }), {
      cacheKey: buildPageDataGamesCacheKey({
        date: dateStr,
        sport: 'SOCCER',
        tab: 'scores',
        fresh: forceRefresh,
      }),
      ttlMs: forceRefresh ? 0 : 3_000,
      timeoutMs: 5_000,
      bypassCache: forceRefresh,
      init: { credentials: 'include' },
    });
    return {
      games: Array.isArray(payload?.games) ? payload.games : [],
      summary: (payload?.oddsSummaryByGame && typeof payload.oddsSummaryByGame === 'object') ? payload.oddsSummaryByGame : {},
    };
  } catch (err) {
    console.warn('[GamesPage] fetchSoccerPageDataFallback failed:', err);
    return {
      games: [],
      summary: {},
    };
  }
}

function SportQuickJump({ 
  selected, 
  onSelect,
  sportCounts,
}: { 
  selected: ExtendedSportKey; 
  onSelect: (sport: ExtendedSportKey) => void;
  sportCounts: Record<string, number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  return (
    <div className="relative">
      <div 
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {SPORT_CHIPS.map((sport) => {
          const count = sport.key === 'ALL' 
            ? Object.values(sportCounts).reduce((a, b) => a + b, 0)
            : sportCounts[sport.key] || 0;
          const isSelected = selected === sport.key;
          
          return (
            <button
              key={sport.key}
              onClick={() => onSelect(sport.key as ExtendedSportKey)}
              className={cn(
                "group relative flex h-8 items-center gap-1 overflow-hidden rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap transition-all duration-200",
                "border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] active:scale-[0.995]",
                isSelected
                  ? "border-cyan-300/35 bg-cyan-500/14 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                  : "hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
              )}
            >
              <span>{sport.label}</span>
              {count > 0 && (
                <span className={cn(
                  "min-w-[18px] rounded-full border px-1.5 py-0.5 text-center text-[10px]",
                  isSelected
                    ? "border-cyan-300/35 bg-cyan-500/20 text-cyan-100"
                    : "border-white/12 bg-white/[0.03] text-[#9CA3AF]"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Date Modal Component
function DatePickerModal({ 
  isOpen, 
  onClose, 
  selected, 
  onSelect,
  today 
}: { 
  isOpen: boolean;
  onClose: () => void;
  selected: Date;
  onSelect: (date: Date) => void;
  today: Date;
}) {
  const [calendarDate, setCalendarDate] = useState(selected);
  
  // Quick pick options
  const quickPicks = [
    { label: 'Yesterday', date: addDays(today, -1) },
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
  ];
  
  // Next 7 days (excluding yesterday, today, tomorrow)
  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 2)).slice(0, 4);
  
  // Calendar helpers
  const calendarMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = calendarMonth.getDay();
  const monthLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const handleDateSelect = (date: Date) => {
    onSelect(date);
    onClose();
  };
  
  const prevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };
  
  const nextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-lg font-semibold text-white">Select Date</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Quick Picks */}
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Quick Select</p>
          <div className="flex gap-2">
            {quickPicks.map((pick) => {
              const isSelected = formatDateYYYYMMDD(selected) === formatDateYYYYMMDD(pick.date);
              return (
                <button
                  key={pick.label}
                  onClick={() => handleDateSelect(pick.date)}
                  className={cn(
                    "flex-1 py-3 sm:py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] active:scale-95",
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  {pick.label}
                </button>
              );
            })}
          </div>
          
          {/* Next 4 days */}
          <div className="flex gap-2 mt-2">
            {next7Days.map((date) => {
              const isSelected = formatDateYYYYMMDD(selected) === formatDateYYYYMMDD(date);
              const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <button
                  key={formatDateYYYYMMDD(date)}
                  onClick={() => handleDateSelect(date)}
                  className={cn(
                    "flex-1 py-2.5 sm:py-2 rounded-lg text-xs font-medium transition-all min-h-[40px] sm:min-h-0 active:scale-95",
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                  )}
                >
                  {label.split(',')[0]}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Calendar */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronDown className="w-5 h-5 rotate-90" />
            </button>
            <span className="text-sm font-medium text-white">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronDown className="w-5 h-5 -rotate-90" />
            </button>
          </div>
          
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="text-center text-xs text-slate-500 py-1">
                {day}
              </div>
            ))}
          </div>
          
          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before first of month */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-11 sm:h-9" />
            ))}
            
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
              const isSelected = formatDateYYYYMMDD(selected) === formatDateYYYYMMDD(date);
              const isToday = formatDateYYYYMMDD(today) === formatDateYYYYMMDD(date);
              
              return (
                <button
                  key={day}
                  onClick={() => handleDateSelect(date)}
                  className={cn(
                    "h-11 sm:h-9 rounded-lg text-sm font-medium transition-all active:scale-95",
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : isToday
                        ? "bg-slate-700 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function GamesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { openChat } = useGlobalAI();
  const { flags } = useFeatureFlags();

  useEffect(() => {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(':rotating_light: GamesPage is LOCKED — logic modifications are restricted.');
    }
  }, []);
  
  // Watchboard integration - with defensive checks
  const watchboardsResult = useWatchboards();
  const activeBoard = watchboardsResult?.activeBoard || null;
  const activeBoardGameIds = watchboardsResult?.gameIds || [];
  
  // Pre-compute watchboard game IDs as Set for O(1) lookup (instant sport switching)
  const watchboardGameIdsSet = useMemo(() => {
    if (!activeBoard) return new Set<string>();
    return new Set<string>(activeBoardGameIds);
  }, [activeBoard, activeBoardGameIds]);
  
  // Fast O(1) lookup function
  const isGameInWatchboard = useCallback((gameId: string): boolean => {
    return watchboardGameIdsSet.has(gameId);
  }, [watchboardGameIdsSet]);
  
  const [watchboardModal, setWatchboardModal] = useState<{ 
    open: boolean; 
    gameId: string; 
    gameSummary: string 
  }>({ open: false, gameId: '', gameSummary: '' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // @ts-ignore - reserved for watchboard integration
  const _handleWatchClick = (game: ApprovedScoreCardGame) => {
    const awayName = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
    const homeName = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
    const summary = `${awayName} @ ${homeName}`;
    setWatchboardModal({ open: true, gameId: game.id, gameSummary: summary });
  };
  
  // Date picker modal state
  const [dateModalOpen, setDateModalOpen] = useState(false);
  
  // Today reference - use user's local timezone
  // "Today" should be based on the user's device time, not forced to Eastern
  const today = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  
  // State initialized from URL (check window.location as fallback for iframe)
  // Default to 'ALL' for the best landing experience
  const [selectedSport, setSelectedSportState] = useState<ExtendedSportKey>(() => {
    // Try React Router first, then window.location.search as fallback
    let paramSport = searchParams.get('sport')?.toUpperCase();
    if (!paramSport) {
      const urlParams = new URLSearchParams(window.location.search);
      paramSport = urlParams.get('sport')?.toUpperCase() || undefined;
    }
    const normalized = paramSport === 'CBB' ? 'NCAAB' : paramSport === 'CFB' ? 'NCAAF' : paramSport;
    return (normalized && isValidSport(normalized)) ? (normalized as ExtendedSportKey) : 'ALL';
  });
  const [selectedDate, setSelectedDateState] = useState<Date>(() => {
    let dateStr = searchParams.get('date');
    if (!dateStr) {
      const urlParams = new URLSearchParams(window.location.search);
      dateStr = urlParams.get('date');
    }
    if (dateStr) {
      const parsed = parseDateYYYYMMDD(dateStr);
      if (parsed) return parsed;
    }
    return today;
  });
  
  // Sync state when URL changes
  useLayoutEffect(() => {
    // Try React Router first, then window.location.search as fallback
    let paramSport = searchParams.get('sport')?.toUpperCase();
    if (!paramSport) {
      const urlParams = new URLSearchParams(window.location.search);
      paramSport = urlParams.get('sport')?.toUpperCase() || undefined;
    }
    const normalized = paramSport === 'CBB' ? 'NCAAB' : paramSport === 'CFB' ? 'NCAAF' : paramSport;
    const sport = (normalized && isValidSport(normalized)) ? (normalized as ExtendedSportKey) : 'ALL';
    
    let dateStr = searchParams.get('date');
    if (!dateStr) {
      const urlParams = new URLSearchParams(window.location.search);
      dateStr = urlParams.get('date');
    }
    let date = today;
    if (dateStr) {
      const parsed = parseDateYYYYMMDD(dateStr);
      if (parsed) date = parsed;
    }
    
    setSelectedSportState((prev) => (prev === sport ? prev : sport));
    setSelectedDateState((prev) => (
      formatDateYYYYMMDD(prev) === formatDateYYYYMMDD(date) ? prev : date
    ));
  }, [searchParams, today]);
  
  // Mocha preview iframe workaround: re-check URL params periodically
  // (iframe may set URL params after initial React mount)
  useEffect(() => {
    const checkUrlParams = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paramSport = urlParams.get('sport')?.toUpperCase();
      const paramDate = urlParams.get('date');
      
      if (paramSport) {
        const normalized = paramSport === 'CBB' ? 'NCAAB' : paramSport === 'CFB' ? 'NCAAF' : paramSport;
        if (normalized && isValidSport(normalized)) {
          setSelectedSportState(prev => prev !== normalized ? normalized : prev);
        }
      }
      if (paramDate) {
        const parsed = parseDateYYYYMMDD(paramDate);
        if (parsed) {
          setSelectedDateState(prev => {
            if (formatDateYYYYMMDD(prev) !== formatDateYYYYMMDD(parsed)) return parsed;
            return prev;
          });
        }
      }
    };
    
    // Check at multiple intervals to handle various iframe timing scenarios
    // Extended timing for Mocha preview iframe which may delay URL param availability
    const timers = [0, 50, 150, 300, 500, 1000].map(delay => setTimeout(checkUrlParams, delay));
    return () => timers.forEach(t => clearTimeout(t));
  }, []); // Only run once on mount
  
  // Status filter - default to 'all' to show CompactGameTile grid
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [hasAutoFallback, setHasAutoFallback] = useState(false);
  // Read initial tab from URL params (supports /games?tab=odds from nav)
  const [activeTab, setActiveTab] = useState<CommandTab>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam === 'odds' || tabParam === 'props') return tabParam;
    return 'scores';
  });
  // Grid view removed - was causing crashes with 79+ MicroGameTile renders
  
  // Soccer league filter (only shown when sport is SOCCER)
  const [leagueFilter, setLeagueFilter] = useState<string>(() => {
    // Read initial league from URL params
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('league')?.toUpperCase() || 'ALL';
  });
  
  // NCAAB conference filter (only shown when sport is NCAAB)
  const [conferenceFilter, setConferenceFilter] = useState<string>(() => {
    // Read initial conference from URL params
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('conf')?.toUpperCase() || 'ALL';
  });
  
  // Direct fetch for games - same pattern as SportHubPage (which works correctly)
  const [rawGames, setRawGames] = useState<any[]>([]);
  const [oddsSummaryByGame, setOddsSummaryByGame] = useState<Record<string, {
    spread?: { home_line?: number | null };
    total?: { line?: number | null };
    moneyline?: { home_price?: number | null; away_price?: number | null };
    first_half?: {
      spread?: { home_line?: number | null };
      total?: { line?: number | null };
      moneyline?: { home_price?: number | null; away_price?: number | null };
    };
  }>>({});
  const [hubLoading, setHubLoading] = useState(true); // Only true on very first load
  // Removed isDateSwitching - now shows clear loading screen on date switch
  const [hubError, setHubError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const currentDateRef = useRef<string>(''); // Track which date is currently displayed
  const currentGamesRef = useRef<any[]>([]);
  const mountedRef = useRef(true);
  const oddsAutoRecoveryAttemptRef = useRef<string>('');
  const [freshTruthById, setFreshTruthById] = useState<Record<string, FreshSportTruthSnapshot>>({});
  const [freshTruthByMatchKey, setFreshTruthByMatchKey] = useState<Record<string, FreshSportTruthSnapshot>>({});
  const [truthCycleCount, setTruthCycleCount] = useState(0);
  const wasGamesLoaderLoadingRef = useRef(false);
  const liveMissingCountsRef = useRef<Record<string, number>>({});
  const [droppedLiveIds, setDroppedLiveIds] = useState<Record<string, true>>({});
  const liveRefreshInFlightFastRef = useRef(false);
  const liveRefreshInFlightMlbRef = useRef(false);
  const gamesPageShapeLoggedRef = useRef(false);
  
  useEffect(() => {
    // React strict mode runs effect cleanup/re-run in development.
    // Reset mounted so async fetch handlers can still commit state.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentGamesRef.current = rawGames;
  }, [rawGames]);
  
  const fetchGamesPageData = useCallback(async (
    dateToFetch?: Date,
    forceRefresh = false,
    sportToFetch: ExtendedSportKey = 'ALL',
    silentRefresh = false,
    loaderManaged = false
  ): Promise<GamesFetchResult> => {
    const stopPerf = startPerfTimer('games.pageData.fetch');
    const startedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const dateStr = dateToFetch ? formatDateYYYYMMDD(dateToFetch) : formatDateYYYYMMDD(new Date());
    const sportKey = (sportToFetch || 'ALL').toUpperCase();
    const routeSportParam = readSportParamFromLocation();
    const isSingleSportRoute = Boolean(routeSportParam && routeSportParam !== 'ALL');
    const dateScopedCacheKey = `games:${dateStr}`;
    const routeCacheKey = getRouteSlateCacheKey(dateStr, sportKey);
    const hasExisting = currentGamesRef.current.length > 0;
    try {
      if (!silentRefresh) {
        if (!loaderManaged) setHubError(null);
        setStaleNotice(null);
        if (!loaderManaged) setHubLoading(true);
      }
      console.info("PAGE_DATA_START", { route: "games", date: dateStr, sport: sportKey, tab: activeTab, forceRefresh });
      const payload = await fetchJsonCached<any>(buildPageDataGamesUrl({
        date: dateStr,
        sport: "ALL",
        tab: "scores",
        fresh: forceRefresh,
      }), {
        cacheKey: buildPageDataGamesCacheKey({
          date: dateStr,
          sport: "ALL",
          tab: "scores",
          fresh: forceRefresh,
        }),
        ttlMs: forceRefresh ? 0 : 3_000,
        timeoutMs: 2_000,
        bypassCache: forceRefresh,
        init: { credentials: 'include' },
      });
      console.log("games response:", payload);
      const explicitPayloadError = String(payload?.error || "").trim();
      if (payload?.ok === false || explicitPayloadError) {
        const isGlobalSlate = sportKey === 'ALL' && !isSingleSportRoute;
        const payloadError = explicitPayloadError || "Unable to load games right now.";
        if (!hasExisting && isGlobalSlate) {
          if (loaderManaged) {
            return { blockingError: payloadError };
          }
          setHubError(payloadError);
        } else if (!hasExisting) {
          // Single-sport failure should degrade to an empty slate, never global error UI.
          setRawGames([]);
          setHubError(null);
          setStaleNotice(explicitPayloadError || `${sportKey} slate is temporarily unavailable.`);
        } else {
          setStaleNotice(explicitPayloadError || "Games refresh failed. Showing available slate.");
        }
        return { blockingError: null };
      }
      let nextGames = Array.isArray(payload?.games) ? payload.games : [];
      const nextSummary = (payload?.oddsSummaryByGame && typeof payload.oddsSummaryByGame === 'object')
        ? payload.oddsSummaryByGame
        : {};
      if (sportKey === 'SOCCER') {
        const soccerCount = nextGames.filter((game: any) =>
          normalizeSportForGamesPage(game?.sport, game?.league) === 'SOCCER'
        ).length;
        if (soccerCount === 0) {
          try {
            const soccerFallback = await fetchSoccerPageDataFallback(dateStr, forceRefresh);
            if (soccerFallback.games.length > 0) {
              const existingIds = new Set(nextGames.map((g: any) => String(g?.game_id || g?.id || '')));
              const additions = soccerFallback.games.filter((row: any) => !existingIds.has(String(row?.game_id || row?.id || '')));
              if (additions.length > 0) {
                nextGames = [...nextGames, ...additions];
                if (Object.keys(soccerFallback.summary).length > 0) {
                  setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, soccerFallback.summary));
                }
                setStaleNotice('Using soccer fallback slate while primary load completes.');
              }
            }
          } catch (soccerFallbackErr) {
            console.warn('[GamesPage] Soccer fallback fetch failed:', soccerFallbackErr);
          }
        }
      }
      const fetchNextAvailableSportSlate = async (): Promise<{ games: any[]; date: string; summary: Record<string, any> } | null> => {
        if (sportKey === 'ALL') return null;
        // Probe a short forward window so sport tabs do not look dead on off-days.
        for (let dayOffset = 1; dayOffset <= 3; dayOffset += 1) {
          const probeDate = new Date(`${dateStr}T12:00:00`);
          probeDate.setDate(probeDate.getDate() + dayOffset);
          const probeDateStr = formatDateYYYYMMDD(probeDate);
          const probePayload = await fetchJsonCached<any>(buildPageDataGamesUrl({
            date: probeDateStr,
            sport: sportKey,
            tab: "scores",
          }), {
            cacheKey: buildPageDataGamesCacheKey({
              date: probeDateStr,
              sport: sportKey,
              tab: "scores",
            }),
            ttlMs: 2_500,
            timeoutMs: 2_500,
            init: { credentials: 'include' },
          }).catch(() => null);
          const probeGames = Array.isArray(probePayload?.games) ? probePayload.games : [];
          if (probeGames.length === 0) continue;
          const probeSummary = (probePayload?.oddsSummaryByGame && typeof probePayload.oddsSummaryByGame === 'object')
            ? probePayload.oddsSummaryByGame
            : {};
          return { games: probeGames, date: probeDateStr, summary: probeSummary };
        }
        return null;
      };
      if (nextGames.length > 0) {
        setRawGames(nextGames);
        currentDateRef.current = dateStr;
        writeRouteSlateCache(routeCacheKey, nextGames);
        saveCachedGamesForDate(dateStr, nextGames, sportKey, false);
        dateGamesCache.set(dateScopedCacheKey, {
          games: nextGames,
          summary: nextSummary,
          updatedAt: Date.now(),
        });
        hasFetchedRef.current = true;
      } else if (!hasExisting) {
        const fallback = await fetchNextAvailableSportSlate();
        if (fallback && fallback.games.length > 0) {
          setRawGames(fallback.games);
          currentDateRef.current = fallback.date;
          writeRouteSlateCache(getRouteSlateCacheKey(fallback.date, sportKey), fallback.games);
          saveCachedGamesForDate(fallback.date, fallback.games, sportKey, false);
          if (Object.keys(fallback.summary).length > 0) {
            setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, fallback.summary));
          }
          setStaleNotice(`No ${sportKey} games on ${dateStr}. Showing next available slate (${fallback.date}).`);
        } else {
          setRawGames([]);
          console.warn("PAGE_DATA_FALLBACK_USED", { route: "games", reason: "empty_payload_no_existing_data", date: dateStr, sport: sportKey });
        }
      }
      if (Object.keys(nextSummary).length > 0) {
        setOddsSummaryByGame((prev) => {
          const merged = mergeOddsSummaryRecord(prev, nextSummary);
          saveCachedOddsSummary(dateStr, merged);
          return merged;
        });
      }
      if (payload?.freshness?.stale) {
        setStaleNotice('Showing last prepared snapshot while refresh completes.');
      }
      if (payload?.degraded) {
        incrementPerfCounter('games.pageData.degraded');
      }
      console.info("PAGE_DATA_SUCCESS", {
        route: "games",
        date: dateStr,
        sport: sportKey,
        games: nextGames.length,
        oddsSummary: Object.keys(nextSummary).length,
        degraded: Boolean(payload?.degraded),
        cache: payload?.freshness?.source || "cold",
        cache_hit: payload?.freshness?.source === "l1" || payload?.freshness?.source === "l2",
      });
      {
        const elapsedMs = Math.max(
          0,
          (typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now()) - startedAt
        );
        console.info("FIRST_PAINT", { route: "games", first_paint_time_ms: Math.round(elapsedMs) });
        console.info("FULL_HYDRATION", { route: "games", full_hydration_time_ms: Math.round(elapsedMs) });
      }
      if (flags.PAGE_DATA_OBSERVABILITY_ENABLED) {
        const elapsedMs = Math.max(
          0,
          (typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now()) - startedAt
        );
        const oddsAvailableAtFirstRender = nextGames.some((g: any) =>
          g?.spread != null ||
          g?.overUnder != null ||
          g?.moneylineHome != null ||
          g?.moneylineAway != null
        ) || Object.keys(nextSummary).length > 0;
        void fetch('/api/page-data/telemetry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            route: 'games',
            loadMs: Math.round(elapsedMs),
            apiCalls: 1,
            oddsAvailableAtFirstRender,
          }),
        }).catch(() => {});
      }
      return { blockingError: null };
    } catch (err) {
      console.warn('[GamesPage] page-data fetch failed', err);
      const msg = String((err as any)?.message || "");
      if (msg.toLowerCase().includes("timeout") || String((err as any)?.name || "") === "AbortError") {
        console.warn("PAGE_DATA_TIMEOUT", { route: "games", date: dateStr, sport: sportKey, tab: activeTab });
      }
      if (sportKey === 'SOCCER' && !hasExisting) {
        try {
          const soccerFallback = await fetchSoccerPageDataFallback(dateStr, true);
          setRawGames(soccerFallback.games);
          currentDateRef.current = dateStr;
          if (soccerFallback.games.length > 0) {
            writeRouteSlateCache(routeCacheKey, soccerFallback.games);
            saveCachedGamesForDate(dateStr, soccerFallback.games, sportKey, false);
            dateGamesCache.set(dateScopedCacheKey, {
              games: soccerFallback.games,
              summary: soccerFallback.summary,
              updatedAt: Date.now(),
            });
            if (Object.keys(soccerFallback.summary).length > 0) {
              setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, soccerFallback.summary));
            }
            setStaleNotice('Primary request failed; showing soccer fallback slate.');
          } else {
            setStaleNotice('Soccer slate is temporarily unavailable.');
          }
          setHubError(null);
          return { blockingError: null };
        } catch (soccerRecoveryErr) {
          console.warn('[GamesPage] Soccer recovery request failed', soccerRecoveryErr);
        }
      }
      const cachedByDate = dateGamesCache.get(dateScopedCacheKey)
        || (() => {
          const fallbackGames = loadCachedGamesForDate(dateStr, sportKey, 10 * 60_000, false);
          if (!fallbackGames || fallbackGames.length === 0) return null;
          return {
            games: fallbackGames,
            summary: loadCachedOddsSummary(dateStr) || {},
            updatedAt: Date.now(),
          } as DateGamesCacheEntry;
        })();
      if (cachedByDate && cachedByDate.games.length > 0) {
        setRawGames(cachedByDate.games);
        if (Object.keys(cachedByDate.summary).length > 0) {
          setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, cachedByDate.summary));
        }
        setStaleNotice('Showing cached slate while live refresh retries.');
      } else if (!hasExisting) {
        if (sportKey === 'ALL' && !isSingleSportRoute) {
          const globalError = 'Unable to load games right now. Please try again.';
          if (loaderManaged) {
            return { blockingError: globalError };
          }
          setHubError(globalError);
        } else {
          // Single-sport request failures must render empty-state instead of failure UI.
          setRawGames([]);
          setHubError(null);
          setStaleNotice(`${sportKey} slate is temporarily unavailable.`);
        }
        console.warn("PAGE_DATA_FALLBACK_USED", { route: "games", reason: "request_failed_no_existing_data", date: dateStr, sport: sportKey });
      } else {
        setStaleNotice('Live refresh failed. Showing available slate.');
      }
      return { blockingError: null };
    } finally {
      stopPerf();
      if (mountedRef.current && !silentRefresh && !loaderManaged) {
        setHubLoading(false);
        setRefreshCycleCount((v) => v + 1);
      }
    }
  }, [activeTab, flags.PAGE_DATA_OBSERVABILITY_ENABLED]);

  const gamesLoader = useSafeDataLoader<any[]>(
    `games:page:${formatDateYYYYMMDD(selectedDate)}:${selectedSport}`,
    async () => {
      const result = await fetchGamesPageData(selectedDate, false, selectedSport, false, true);
      if (result.blockingError) {
        throw new Error(result.blockingError);
      }
      return currentGamesRef.current;
    },
    {
      enabled: false,
      timeoutMs: 4500,
      retries: 2,
      retryDelayMs: 800,
      seedData: rawGames.length > 0 ? rawGames : undefined,
    }
  );

  const collectSportsForTruthRefresh = useCallback((baseGames: any[]): string[] => {
    const present = new Set<string>();
    for (const game of baseGames) {
      const sport = sportFromGameLike(game);
      if (sport) present.add(sport);
    }
    if (selectedSport !== 'ALL') {
      present.add(selectedSport);
    }
    const ordered = SPORT_REFRESH_CANDIDATES.filter((sport) => present.has(sport));
    if (ordered.length > 0) return ordered;
    return selectedSport !== 'ALL' ? [selectedSport] : ['MLB', 'NBA', 'NHL', 'SOCCER'];
  }, [selectedSport]);

  const refreshFreshSportTruth = useCallback(async (
    dateToFetch: Date,
    baseGames: any[],
    forceRefresh = false
  ) => {
    const targetSports = collectSportsForTruthRefresh(baseGames);
    if (targetSports.length === 0) {
      setFreshTruthById({});
      setFreshTruthByMatchKey({});
      return;
    }
    const dateStr = formatDateYYYYMMDD(dateToFetch);
    const settled = await Promise.allSettled(
      targetSports.map(async (sport) => {
        const url = `/api/games?sport=${encodeURIComponent(String(sport || '').toLowerCase())}&date=${encodeURIComponent(dateStr)}&includeOdds=1&fresh=${forceRefresh ? '1' : '0'}`;
        const payload = await fetchJsonCached<any>(url, {
          cacheKey: `games_sport_truth:${dateStr}:${sport}:${forceRefresh ? 'fresh' : 'cached'}`,
          ttlMs: forceRefresh ? 0 : SPORT_TRUTH_CACHE_TTL_MS,
          timeoutMs: 2_500,
          bypassCache: forceRefresh,
          init: { credentials: 'include' },
        });
        return Array.isArray(payload?.games) ? payload.games : [];
      })
    );

    const nextById: Record<string, FreshSportTruthSnapshot> = {};
    const nextByMatchKey: Record<string, FreshSportTruthSnapshot> = {};
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const raw of result.value) {
        const snapshot = buildFreshTruthSnapshot(raw);
        if (!snapshot.canonicalId) continue;
        nextById[snapshot.canonicalId] = snapshot;
        if (snapshot.canonicalMatchKey) {
          nextByMatchKey[snapshot.canonicalMatchKey] = snapshot;
        }
      }
    }
    if (!mountedRef.current) return;
    setFreshTruthById(nextById);
    setFreshTruthByMatchKey(nextByMatchKey);
    setTruthCycleCount((prev) => prev + 1);
  }, [collectSportsForTruthRefresh]);

  // Pre-fetch adjacent dates in background for instant switching
  const prefetchAdjacentDates = useCallback((baseDate: Date, _sportToFetch: ExtendedSportKey = 'ALL') => {
    // Keep adjacent-date prefetch on ALL so it reuses the same page-data cache path
    // as the primary Games route and avoids extra per-sport cold assemblies.
    const sportKey = 'ALL';
    const yesterday = new Date(baseDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const datesToPrefetch = [yesterday, tomorrow];
    
    // Stagger prefetch requests to avoid overwhelming the API
    datesToPrefetch.forEach((date, index) => {
      const dateStr = formatDateYYYYMMDD(date);
      // Skip if already cached
      const cached = loadCachedGamesForDate(dateStr, sportKey, GAMES_CACHE_TTL, false);
      if (cached && cached.length > 0) return;
      
      // Prefetch with delay to not compete with main request
      setTimeout(() => {
        fetchJsonCached<any>(getGamesApiPath(dateStr, sportKey, false), {
          cacheKey: buildPageDataGamesCacheKey({
            date: dateStr,
            sport: sportKey,
            tab: "scores",
          }),
          ttlMs: 10000,
          timeoutMs: 7000,
        })
          .then((data) => {
            if (data?.games) {
              saveCachedGamesForDate(dateStr, data.games, sportKey, false);
            }
          })
          .catch(() => {});
      }, 2000 + (index * 1500)); // 2s delay, then 1.5s between requests
    });
  }, []);
  
  useEffect(() => {
    const wasLoading = wasGamesLoaderLoadingRef.current;
    if (wasLoading && !gamesLoader.loading) {
      setRefreshCycleCount((v) => v + 1);
    }
    wasGamesLoaderLoadingRef.current = gamesLoader.loading;
    setHubLoading(gamesLoader.loading);
  }, [gamesLoader.loading]);

  useEffect(() => {
    if (gamesLoader.error && currentGamesRef.current.length === 0) {
      setHubError(gamesLoader.error.message || 'Unable to load games right now. Please try again.');
      return;
    }
    if (!gamesLoader.loading) {
      setHubError(null);
    }
  }, [gamesLoader.error, gamesLoader.loading]);

  // Initial fetch and refetch when date/sport changes.
  // Keep the current slate visible while refresh is in flight.
  useEffect(() => {
    const dateStr = formatDateYYYYMMDD(selectedDate);
    const dateScopedCacheKey = `games:${dateStr}`;
    const sportKey = (selectedSport || 'ALL').toUpperCase();
    setHubError(null);
    setStaleNotice(null);
    const cachedByDate = dateGamesCache.get(dateScopedCacheKey)
      || (() => {
        const fallbackGames = loadCachedGamesForDate(dateStr, sportKey, 10 * 60_000, false);
        if (!fallbackGames || fallbackGames.length === 0) return null;
        return {
          games: fallbackGames,
          summary: loadCachedOddsSummary(dateStr) || {},
          updatedAt: Date.now(),
        } as DateGamesCacheEntry;
      })();
    if (cachedByDate && cachedByDate.games.length > 0) {
      setRawGames(cachedByDate.games);
      if (Object.keys(cachedByDate.summary).length > 0) {
        setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, cachedByDate.summary));
      }
    }
    void gamesLoader.refresh();
  }, [gamesLoader.refresh, selectedDate, selectedSport]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      prefetchGamesRouteChunks();
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const dateStr = formatDateYYYYMMDD(selectedDate);
    // Warm odds using ALL to match the main games request contract.
    const sportKey = "ALL";
    const warmOddsUrl = buildPageDataGamesUrl({
      date: dateStr,
      sport: sportKey,
      tab: "odds",
    });
    void fetchJsonCached<any>(warmOddsUrl, {
      cacheKey: buildPageDataGamesCacheKey({
        date: dateStr,
        sport: sportKey,
        tab: "odds",
      }),
      ttlMs: 8_000,
      timeoutMs: 2_500,
      init: { credentials: "include" },
    }).catch(() => {});
  }, [selectedDate]);
  
  // Pre-fetch adjacent dates after initial load completes
  useEffect(() => {
    if (!hubLoading && rawGames.length > 0 && selectedDate && selectedSport !== 'ALL') {
      prefetchAdjacentDates(selectedDate, selectedSport);
    }
  }, [hubLoading, rawGames.length, selectedDate, selectedSport, prefetchAdjacentDates]);

  const selectedDateStr = useMemo(() => formatDateYYYYMMDD(selectedDate), [selectedDate]);

  useEffect(() => {
    const cached = loadCachedOddsSummary(selectedDateStr);
    if (!cached || Object.keys(cached).length === 0) return;
    setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, cached));
  }, [selectedDateStr]);

  // Refresh function
  const hubRefresh = useCallback(async () => {
    await gamesLoader.refresh();
  }, [gamesLoader.refresh]);

  const rawLikelyLiveCount = useMemo(() => {
    if (rawGames.length === 0) return 0;
    return rawGames.reduce((count, game) => count + (isGameLive(game) ? 1 : 0), 0);
  }, [rawGames]);

  useEffect(() => {
    if (rawGames.length === 0) {
      setFreshTruthById({});
      setFreshTruthByMatchKey({});
      return;
    }
    void refreshFreshSportTruth(selectedDate, rawGames, false);
  }, [rawGames, selectedDate, refreshFreshSportTruth]);

  useEffect(() => {
    if (rawGames.length === 0) return;
    const cadenceMs = rawLikelyLiveCount > 0 ? LIVE_REHYDRATE_INTERVAL_MS : SLATE_REHYDRATE_INTERVAL_MS;
    const interval = window.setInterval(() => {
      void fetchGamesPageData(selectedDate, true, selectedSport, true);
      void refreshFreshSportTruth(selectedDate, currentGamesRef.current, true);
    }, cadenceMs);
    return () => window.clearInterval(interval);
  }, [rawGames.length, rawLikelyLiveCount, fetchGamesPageData, refreshFreshSportTruth, selectedDate, selectedSport]);

  // Transform raw API games to LiveGame-like format
  const hubGames = useMemo(() => {
    return rawGames.map((game: any) => {
      const sportKey = normalizeSportForGamesPage(game.sport, game.league);
      const canonicalId = canonicalGameId(game);
      const canonicalMatchKey = canonicalMatchKeyFromGame(game);
      const freshTruth = freshTruthById[canonicalId] || (canonicalMatchKey ? freshTruthByMatchKey[canonicalMatchKey] : undefined);
      const resolved = resolveGameState(game, freshTruth);
      const gameId = game.game_id || game.id || canonicalId || `gen_${sportKey}_${game.home_team_code}_${game.away_team_code}_${game.start_time}`;
      const idSummary = buildOddsLookupCandidates(gameId)
        .map((candidate) => oddsSummaryByGame[candidate])
        .find(Boolean);
      const matchupCandidates = [
        buildOddsMatchKey(sportKey, game.home_team_code, game.away_team_code, game.start_time),
        buildOddsMatchKey(sportKey, game.home_team_name, game.away_team_name, game.start_time),
        buildOddsMatchKey(sportKey, game.home_team_code || game.home_team_name, game.away_team_code || game.away_team_name, game.start_time),
        buildOddsMatchKey(sportKey, game.home_team_code, game.away_team_code, ""),
        buildOddsMatchKey(sportKey, game.home_team_name, game.away_team_name, ""),
      ].filter((key): key is string => Boolean(key));
      const matchupSummary = matchupCandidates.map((candidate) => oddsSummaryByGame[candidate]).find(Boolean);
      const summary = idSummary || matchupSummary;

      return {
        id: gameId,
        canonicalId: resolved.canonicalId,
        sport: sportKey,
        homeTeam: {
          name: game.home_team_name || game.home_team_code || 'TBD',
          abbreviation: game.home_team_code || 'TBD',
          score: resolved.homeScore ?? game.home_score ?? null,
          logo: typeof game.home_logo_url === 'string' ? game.home_logo_url : undefined,
        },
        awayTeam: {
          name: game.away_team_name || game.away_team_code || 'TBD',
          abbreviation: game.away_team_code || 'TBD',
          score: resolved.awayScore ?? game.away_score ?? null,
          logo: typeof game.away_logo_url === 'string' ? game.away_logo_url : undefined,
        },
        status: resolved.status,
        status_bucket: resolved.status_bucket,
        source_of_truth_used: resolved.source_of_truth_used,
        period: resolved.period,
        period_label: resolved.period_label,
        clock: resolved.clock,
        startTime: resolved.start_time || game.start_time || null,
        last_updated_at: resolved.last_updated_at,
        probableAwayPitcher: readProbablePitcherFromGame(game, "away"),
        probableHomePitcher: readProbablePitcherFromGame(game, "home"),
        channel: game.channel || null,
        isOvertime: game.is_overtime || false,
        odds: {
          spreadHome: toFiniteNumberOrNull(summary?.spread?.home_line ?? game.spread_home ?? game.spread),
          total: toFiniteNumberOrNull(summary?.total?.line ?? game.total ?? game.overUnder),
          moneylineHome: toFiniteNumberOrNull(summary?.moneyline?.home_price ?? game.moneyline_home ?? game.moneylineHome),
          moneylineAway: toFiniteNumberOrNull(summary?.moneyline?.away_price ?? game.moneyline_away ?? game.moneylineAway),
          spread1HHome: toFiniteNumberOrNull(summary?.first_half?.spread?.home_line ?? game.spread_1h_home ?? game.spread1HHome),
          total1H: toFiniteNumberOrNull(summary?.first_half?.total?.line ?? game.total_1h ?? game.total1H),
          moneyline1HHome: toFiniteNumberOrNull(summary?.first_half?.moneyline?.home_price ?? game.moneyline_1h_home ?? game.moneyline1HHome),
          moneyline1HAway: toFiniteNumberOrNull(summary?.first_half?.moneyline?.away_price ?? game.moneyline_1h_away ?? game.moneyline1HAway),
          f5: {
            spread: {
              home: toFiniteNumberOrNull(summary?.f5?.spread?.home ?? summary?.first_half?.spread?.home_line),
              away: toFiniteNumberOrNull(summary?.f5?.spread?.away ?? summary?.first_half?.spread?.away_line),
            },
            total: toFiniteNumberOrNull(summary?.f5?.total ?? summary?.first_half?.total?.line),
            moneyline: {
              home: toFiniteNumberOrNull(summary?.f5?.moneyline?.home ?? summary?.first_half?.moneyline?.home_price),
              away: toFiniteNumberOrNull(summary?.f5?.moneyline?.away ?? summary?.first_half?.moneyline?.away_price),
            },
          },
        },
      };
    });
  }, [rawGames, oddsSummaryByGame, freshTruthById, freshTruthByMatchKey, truthCycleCount]);

  useEffect(() => {
    if (gamesPageShapeLoggedRef.current) return;
    const sample = hubGames.find((game) => game && typeof game === 'object');
    if (!sample) return;
    gamesPageShapeLoggedRef.current = true;
    console.log('GAMES_PAGE_SHAPE', sample);
  }, [hubGames]);

  const liveGameCatalog = useMemo(() => {
    const catalog: Record<string, { sport: string; canonicalMatchKey: string | null }> = {};
    for (const game of hubGames) {
      const id = String(game?.id || '').trim();
      if (!id) continue;
      if (!isGameLive(game)) continue;
      const sport = normalizeSportForGamesPage(game?.sport);
      catalog[id] = {
        sport,
        canonicalMatchKey: canonicalMatchKeyFromGame(game),
      };
    }
    return catalog;
  }, [hubGames]);

  /** :lock: LOCKED LOGIC — DO NOT TOUCH */
  const liveGameIds = useMemo(() => {
    // Keep all live IDs in the refresh loop so temporarily-missing games
    // auto-recover once the provider emits fresh truth again.
    return Object.keys(liveGameCatalog);
  }, [liveGameCatalog]);

  useEffect(() => {
    console.log('LIVE DETECTION CHECK', hubGames.map((g: any) => ({
      id: g?.id,
      status: g?.status,
      period: g?.period ?? g?.period_label ?? null,
      clock: g?.clock ?? null,
      isLive: isGameLive(g),
    })));
  }, [hubGames, truthCycleCount]);

  useEffect(() => {
    if (rawGames.length === 0) {
      liveMissingCountsRef.current = {};
      setDroppedLiveIds({});
      return;
    }
    setDroppedLiveIds((prev) => {
      const next: Record<string, true> = {};
      for (const id of Object.keys(prev)) {
        if (liveGameCatalog[id]) next[id] = true;
      }
      return next;
    });
  }, [rawGames.length, liveGameCatalog]);

  const fetchFreshSportTruthByGameIds = useCallback(async (
    ids: string[],
    timeoutMs = 12_000
  ): Promise<Record<string, FreshSportTruthSnapshot>> => {
    if (ids.length === 0) return {};
    const idSet = new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
    if (idSet.size === 0) return {};

    const sports = Array.from(new Set(
      Array.from(idSet)
        .map((id) => liveGameCatalog[id]?.sport)
        .filter((sport): sport is string => Boolean(sport))
    ));
    if (sports.length === 0) return {};

    const dateStr = formatDateYYYYMMDD(selectedDate);
    const settled = await Promise.allSettled(
      sports.map(async (sport) => {
        const url = `/api/games?sport=${encodeURIComponent(sport)}&date=${encodeURIComponent(dateStr)}&includeOdds=1&fresh=1`;
        const payload = await fetchJsonCached<any>(url, {
          cacheKey: `games_live_truth:${dateStr}:${sport}`,
          ttlMs: 0,
          timeoutMs,
          bypassCache: true,
          init: { credentials: 'include' },
        });
        if (Array.isArray(payload)) return payload;
        return Array.isArray(payload?.games) ? payload.games : [];
      })
    );

    const byId: Record<string, FreshSportTruthSnapshot> = {};
    const byMatchKey: Record<string, FreshSportTruthSnapshot> = {};
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const raw of result.value) {
        const snapshot = buildFreshTruthSnapshot(raw);
        byId[snapshot.canonicalId] = snapshot;
        if (snapshot.canonicalMatchKey) byMatchKey[snapshot.canonicalMatchKey] = snapshot;
      }
    }

    const selected: Record<string, FreshSportTruthSnapshot> = {};
    for (const id of idSet) {
      const direct = byId[id];
      if (direct) {
        selected[id] = direct;
        continue;
      }
      const matchKey = liveGameCatalog[id]?.canonicalMatchKey;
      if (matchKey && byMatchKey[matchKey]) {
        selected[id] = byMatchKey[matchKey];
      }
    }
    return selected;
  }, [liveGameCatalog, selectedDate]);

  /** :lock: LOCKED LOGIC — DO NOT TOUCH */
  const refreshLiveGames = useCallback(async (
    ids: string[],
    lane: 'fast' | 'mlb',
    timeoutMs: number
  ) => {
    const inFlightRef = lane === 'mlb' ? liveRefreshInFlightMlbRef : liveRefreshInFlightFastRef;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
    if (!ids.length) return;
    const freshSportData = await fetchFreshSportTruthByGameIds(ids, timeoutMs);
    const idSet = new Set(ids);
    const droppedNow: string[] = [];
    const recoveredNow: string[] = [];
    const resolvedFinalNow = new Set<string>();

    setRawGames((prev) => prev.map((game) => {
      const gameId = canonicalGameId(game);
      if (!idSet.has(gameId)) return game;
      const fresh = freshSportData[gameId];
      if (!fresh) return game;
      const oldResolved = resolveGameState(game);
      const resolved = resolveGameState(game, fresh);
      if (
        oldResolved.status !== resolved.status ||
        oldResolved.period !== resolved.period ||
        oldResolved.clock !== resolved.clock
      ) {
        console.log('LIVE UPDATE', {
          id: gameId,
          old: oldResolved.status,
          new: resolved.status,
          period: resolved.period,
          clock: resolved.clock,
        });
      }
      if (resolved.status_bucket === 'FINAL') {
        resolvedFinalNow.add(gameId);
      }
      return {
        ...game,
        status: resolved.status,
        period: resolved.period,
        period_label: resolved.period_label,
        clock: resolved.clock,
        home_score: resolved.homeScore ?? game.home_score ?? null,
        away_score: resolved.awayScore ?? game.away_score ?? null,
        last_updated_at: resolved.last_updated_at ?? game.last_updated_at ?? null,
      };
    }));

    const nextMissing = { ...liveMissingCountsRef.current };
    for (const id of ids) {
      if (freshSportData[id]) {
        nextMissing[id] = 0;
        recoveredNow.push(id);
        continue;
      }
      const misses = (nextMissing[id] || 0) + 1;
      nextMissing[id] = misses;
      if (misses >= 2) {
        droppedNow.push(id);
      }
    }
    liveMissingCountsRef.current = nextMissing;

    if (Object.keys(freshSportData).length > 0) {
      setFreshTruthById((prev) => ({ ...prev, ...freshSportData }));
      setFreshTruthByMatchKey((prev) => {
        const next = { ...prev };
        for (const snapshot of Object.values(freshSportData)) {
          if (snapshot.canonicalMatchKey) next[snapshot.canonicalMatchKey] = snapshot;
        }
        return next;
      });
      setTruthCycleCount((prev) => prev + 1);
    }

    if (droppedNow.length > 0 || resolvedFinalNow.size > 0 || recoveredNow.length > 0) {
      setDroppedLiveIds((prev) => {
        const next = { ...prev };
        for (const id of recoveredNow) delete next[id];
        for (const id of droppedNow) next[id] = true;
        for (const id of resolvedFinalNow) next[id] = true;
        return next;
      });
    }
    } finally {
      inFlightRef.current = false;
    }
  }, [fetchFreshSportTruthByGameIds]);

  const fastLiveGameIds = useMemo(
    () => liveGameIds.filter((id) => String(liveGameCatalog[id]?.sport || '').toUpperCase() !== 'MLB'),
    [liveGameIds, liveGameCatalog]
  );
  const mlbLiveGameIds = useMemo(
    () => liveGameIds.filter((id) => String(liveGameCatalog[id]?.sport || '').toUpperCase() === 'MLB'),
    [liveGameIds, liveGameCatalog]
  );

  useEffect(() => {
    if (!fastLiveGameIds.length) return;
    void refreshLiveGames(fastLiveGameIds, 'fast', 3_500);
    const interval = window.setInterval(() => {
      void refreshLiveGames(fastLiveGameIds, 'fast', 3_500);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [fastLiveGameIds.join(','), refreshLiveGames]);

  useEffect(() => {
    if (!mlbLiveGameIds.length) return;
    void refreshLiveGames(mlbLiveGameIds, 'mlb', 12_000);
    const interval = window.setInterval(() => {
      void refreshLiveGames(mlbLiveGameIds, 'mlb', 12_000);
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [mlbLiveGameIds.join(','), refreshLiveGames]);
  
  // Data state
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const [refreshCycleCount, setRefreshCycleCount] = useState(0);
  const showDebugTelemetry = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const debug = new URLSearchParams(window.location.search).get('debug');
    return debug === 'true' || debug === 'telemetry';
  }, []);
  const debugCoverageThresholdPct = useMemo(() => {
    if (typeof window === 'undefined') return 35;
    const raw = Number(new URLSearchParams(window.location.search).get('cov'));
    if (!Number.isFinite(raw)) return 35;
    return Math.max(5, Math.min(95, Math.round(raw)));
  }, []);

  // NCAAB/NCAAF team data for conference/ranking filtering
  type TeamLookup = Record<string, { conference?: string; apRank?: number | null }>;
  const [ncaabTeamLookup] = useState<TeamLookup>({});
  const [ncaafTeamLookup] = useState<TeamLookup>({});
  
  // Pagination state - how many games to show per section
  const [showMoreSections, setShowMoreSections] = useState<Record<string, number>>({});
  
  // Use refs for values that shouldn't trigger refetch loops
  const statusFilterRef = useRef(statusFilter);
  const hasAutoFallbackRef = useRef(hasAutoFallback);
  
  // Keep refs in sync
  useEffect(() => { statusFilterRef.current = statusFilter; }, [statusFilter]);
  useEffect(() => { hasAutoFallbackRef.current = hasAutoFallback; }, [hasAutoFallback]);

  // Transform hub games to ApprovedScoreCardGame format with defensive checks
  const games = useMemo<ApprovedScoreCardGame[]>(() => {
    if (!hubGames || !Array.isArray(hubGames) || hubGames.length === 0) return [];
    
    const currentNcaabLookup = ncaabTeamLookup;
    const currentNcaafLookup = ncaafTeamLookup;
    
    try {
      return hubGames
        .filter(g => g && typeof g === 'object' && g.id) // Filter out invalid entries
        .map((g) => {
          // Safely extract team info
          const homeTeam = g.homeTeam || {};
          const awayTeam = g.awayTeam || {};
          const homeAbbr = typeof homeTeam === 'string' ? homeTeam : (homeTeam.abbreviation || homeTeam.name || 'TBD');
          const awayAbbr = typeof awayTeam === 'string' ? awayTeam : (awayTeam.abbreviation || awayTeam.name || 'TBD');
          const homeName = typeof homeTeam === 'string' ? homeTeam : (homeTeam.name || homeAbbr);
          const awayName = typeof awayTeam === 'string' ? awayTeam : (awayTeam.name || awayAbbr);
          const homeScore = typeof homeTeam === 'object' ? (homeTeam.score ?? null) : null;
          const awayScore = typeof awayTeam === 'object' ? (awayTeam.score ?? null) : null;
          
          // Generate consistent public betting percentages based on game id
          const gameIdHash = String(g.id || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
          const homePercent = 45 + (gameIdHash % 20); // 45-64%
          const awayPercent = 100 - homePercent;
          
          // Get NCAAB/NCAAF rankings from team lookup
          const sport = g.sport || '';
          const teamLookup = sport === 'NCAAF' ? currentNcaafLookup : currentNcaabLookup;
          const homeRank = teamLookup[homeAbbr]?.apRank ?? null;
          const awayRank = teamLookup[awayAbbr]?.apRank ?? null;
          
          // Status is resolved once upstream; downstream reads must not mutate it.
          const rawStatus = g.status || 'SCHEDULED';
          const statusStr = normalizeStatusUpper(rawStatus || 'SCHEDULED');
          const bucket = String((g as any).status_bucket || '').toUpperCase();
          const normalizedStatus = (
            bucket === 'LIVE' || statusStr === 'IN_PROGRESS' || statusStr === 'LIVE'
              ? 'LIVE'
              : bucket === 'FINAL' || FINAL_STATUS_TOKENS.has(statusStr)
                ? 'FINAL'
                : 'SCHEDULED'
          ) as 'LIVE' | 'FINAL' | 'SCHEDULED';
          
          return {
            id: String(g.id || canonicalGameId(g)),
            gameId: String(g.id || canonicalGameId(g)),
            sport: normalizeSportForGamesPage(g.sport || 'NBA', (g as any).league),
            league: undefined,
            homeTeam: {
              abbr: homeAbbr,
              name: homeName,
              rank: homeRank ?? undefined,
            },
            awayTeam: {
              abbr: awayAbbr,
              name: awayName,
              rank: awayRank ?? undefined,
            },
            homeScore,
            awayScore,
            status: normalizedStatus,
            startTime: g.startTime || undefined,
            probableAwayPitcher: g.probableAwayPitcher,
            probableHomePitcher: g.probableHomePitcher,
            inningNumber: g?.mlbLiveState?.inningNumber ?? g?.inningNumber ?? g?.inning ?? null,
            inningHalf: g?.mlbLiveState?.inningHalf ?? g?.inningHalf ?? g?.inning_half ?? null,
            inningState: g?.inningState ?? g?.inning_state ?? null,
            mlbLiveState: g?.mlbLiveState ?? null,
            period: normalizedStatus === 'FINAL' ? undefined : (g.period_label || g.period || undefined),
            clock: normalizedStatus === 'FINAL' ? undefined : (g.clock || undefined),
            spread: g.odds?.spreadHome ?? undefined,
            overUnder: g.odds?.total ?? undefined,
            moneylineHome: g.odds?.moneylineHome ?? undefined,
            moneylineAway: g.odds?.moneylineAway ?? undefined,
            odds: {
              spread: g.odds?.spreadHome ?? undefined,
              spreadHome: g.odds?.spreadHome ?? undefined,
              total: g.odds?.total ?? undefined,
              overUnder: g.odds?.total ?? undefined,
              mlHome: g.odds?.moneylineHome ?? undefined,
              homeML: g.odds?.moneylineHome ?? undefined,
              mlAway: g.odds?.moneylineAway ?? undefined,
              awayML: g.odds?.moneylineAway ?? undefined,
              spread1HHome: g.odds?.spread1HHome ?? undefined,
              total1H: g.odds?.total1H ?? undefined,
              moneyline1HHome: g.odds?.moneyline1HHome ?? undefined,
              moneyline1HAway: g.odds?.moneyline1HAway ?? undefined,
              f5: {
                spread: {
                  home: g.odds?.f5?.spread?.home ?? undefined,
                  away: g.odds?.f5?.spread?.away ?? undefined,
                },
                total: g.odds?.f5?.total ?? undefined,
                moneyline: {
                  home: g.odds?.f5?.moneyline?.home ?? undefined,
                  away: g.odds?.f5?.moneyline?.away ?? undefined,
                },
              },
            },
            publicBetting: {
              homePercent,
              awayPercent,
              totalBets: Math.floor(1000 + (gameIdHash % 5000)),
            },
            trending: (gameIdHash % 10) > 7,
          };
        });
    } catch (err) {
      console.error('[GamesPage] Error transforming games:', err);
      return [];
    }
  }, [hubGames, ncaabTeamLookup, ncaafTeamLookup]);

  const realOddsGameCount = useMemo(() => {
    return games.reduce((count, game) => {
      const hasOdds =
        game.spread != null ||
        game.overUnder != null ||
        game.moneylineHome != null ||
        game.moneylineAway != null ||
        game.odds?.spread != null ||
        game.odds?.total != null ||
        game.odds?.mlHome != null ||
        game.odds?.mlAway != null;
      return count + (hasOdds ? 1 : 0);
    }, 0);
  }, [games]);

  useEffect(() => {
    if (activeTab !== 'odds') return;
    if (hubLoading || refreshing) return;
    if (games.length === 0) return;
    if (realOddsGameCount > 0) return;
    const recoveryKey = `${selectedDateStr}|${selectedSport}|${activeTab}`;
    if (oddsAutoRecoveryAttemptRef.current === recoveryKey) return;
    oddsAutoRecoveryAttemptRef.current = recoveryKey;
    const timer = window.setTimeout(() => {
      incrementPerfCounter('games.guardrail.autoRecovery');
      void hubRefresh();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    games.length,
    hubLoading,
    hubRefresh,
    realOddsGameCount,
    refreshing,
    selectedDateStr,
    selectedSport,
  ]);

  const loading = hubLoading;
  const error = hubError;
  const routeSportParam = readSportParamFromLocation();
  const showGlobalFailure = Boolean(error) && (!routeSportParam || routeSportParam === 'ALL');

  // Update URL and state
  const setSelectedSport = useCallback((sport: ExtendedSportKey) => {
    setSelectedSportState(sport);
    const params = new URLSearchParams(searchParams);
    params.set('sport', sport);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);
  
  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date);
    const params = new URLSearchParams(searchParams);
    params.set('date', formatDateYYYYMMDD(date));
    setSearchParams(params, { replace: true });
    setStatusFilter('all');
    setHasAutoFallback(false);
  }, [searchParams, setSearchParams]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await hubRefresh();
    setLastFetchAt(new Date());
    setRefreshing(false);
  }, [hubRefresh]);

  // NCAAB/NCAAF prefetch endpoint is not guaranteed in all local envs.
  // Keep lookups empty when unavailable to avoid repeated 404 noise.

  // Auto-fallback: if filter is 'live' but no live games, switch to 'all'
  useEffect(() => {
    if (hasAutoFallback) return; // Already did auto-fallback
    
    const liveCount = games.filter(g => 
      (g.status || '').toString().toLowerCase() === 'live'
    ).length;
    
    if (liveCount === 0 && statusFilter === 'live') {
      setStatusFilter('all');
      setHasAutoFallback(true);
    }
  }, [games, statusFilter, hasAutoFallback]);

  // Filter and group games - add early return for empty games
  const { liveGames, scheduledGames, finalGames, filteredCount } = useMemo(() => {
    if (games.length === 0) {
      return { liveGames: [], scheduledGames: [], finalGames: [], filteredCount: 0 };
    }
    
    // Process full slate - no client-side caps.
    const gamesToProcess = games;
    // API is already date-scoped, so avoid re-filtering by date on the client.
    let filtered = gamesToProcess;

    // MAIN SPORT FILTER - apply if not "ALL"
    if (selectedSport !== 'ALL') {
      filtered = filtered.filter(g => {
        const gameSport = (g.sport || '').toUpperCase();
        return gameSport === selectedSport;
      });
    }
    
    // Apply league filter for soccer
    if (selectedSport === 'SOCCER' && leagueFilter !== 'ALL') {
      filtered = filtered.filter(g => g.league === leagueFilter);
    }
    
    // Apply conference filter for NCAAB using team lookup
    if (selectedSport === 'NCAAB' && conferenceFilter !== 'ALL') {
      // Conference code to name mapping
      const confCodeToName: Record<string, string[]> = {
        'ACC': ['Atlantic Coast'],
        'BIG10': ['Big Ten'],
        'BIG12': ['Big 12'],
        'SEC': ['SEC', 'Southeastern'],
        'BIGEAST': ['Big East'],
        'PAC12': ['Pac-12'],
        'AAC': ['American', 'AAC'],
        'MWC': ['Mountain West'],
        'WCC': ['West Coast'],
        'A10': ['Atlantic 10'],
        'CUSA': ['Conference USA', 'C-USA'],
        'MAC': ['Mid-American'],
        'SUNBELT': ['Sun Belt'],
        'SOCON': ['Southern'],
        'IVY': ['Ivy'],
        'MEAC': ['Mid-Eastern'],
        'SWAC': ['Southwestern'],
        'MAAC': ['Metro Atlantic', 'MAAC'],
        'HORIZON': ['Horizon'],
        'MVC': ['Missouri Valley'],
        'OVC': ['Ohio Valley'],
        'WAC': ['Western Athletic', 'WAC'],
        'ASUN': ['ASUN', 'Atlantic Sun'],
        'BIG SKY': ['Big Sky'],
        'CAA': ['Colonial', 'CAA'],
        'SUMMIT': ['Summit'],
      };
      
      // Helper to get team abbr from game
      const getTeamAbbr = (team: string | { name?: string; abbreviation?: string; abbr?: string } | null | undefined): string => {
        if (!team) return '';
        if (typeof team === 'string') return team.toUpperCase();
        return (team.abbreviation || team.abbr || team.name || '').toUpperCase();
      };

      
      if (conferenceFilter === 'TOP25') {
        // Filter to games where at least one team is AP-ranked
        filtered = filtered.filter(g => {
          const homeAbbr = getTeamAbbr(g.homeTeam);
          const awayAbbr = getTeamAbbr(g.awayTeam);
          const homeInfo = ncaabTeamLookup[homeAbbr];
          const awayInfo = ncaabTeamLookup[awayAbbr];
          return (homeInfo?.apRank != null) || (awayInfo?.apRank != null);
        });
      } else {
        // Filter by conference
        const confNames = confCodeToName[conferenceFilter] || [];
        filtered = filtered.filter(g => {
          const homeAbbr = getTeamAbbr(g.homeTeam);
          const awayAbbr = getTeamAbbr(g.awayTeam);
          const homeConf = ncaabTeamLookup[homeAbbr]?.conference || '';
          const awayConf = ncaabTeamLookup[awayAbbr]?.conference || '';
          // Match if either team is in the selected conference
          return confNames.some(name => 
            homeConf.toLowerCase().includes(name.toLowerCase()) ||
            awayConf.toLowerCase().includes(name.toLowerCase())
          );
        });
      }
    }
    
    // NCAAF conference filter removed - off season
    
    if (activeTab !== 'odds' && statusFilter !== 'all') {
      filtered = filtered.filter(g => {
        const status = (g.status || '').toString().toLowerCase();
        if (statusFilter === 'live') {
          return status === 'live' || status === 'in_progress';
        }
        return status === statusFilter;
      });
    }
    
    const live = filtered.filter(g => {
      const s = (g.status || '').toString().toLowerCase();
      return s === 'live' || s === 'in_progress';
    });
    const scheduled = filtered.filter(g => (g.status || '').toString().toLowerCase() === 'scheduled');
    const final = filtered.filter(g => (g.status || '').toString().toLowerCase() === 'final');
    
    scheduled.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aTime - bTime;
    });
    
    final.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return bTime - aTime;
    });
    
    return { liveGames: live, scheduledGames: scheduled, finalGames: final, filteredCount: filtered.length };
  }, [games, statusFilter, selectedSport, leagueFilter, conferenceFilter, ncaabTeamLookup, ncaafTeamLookup, activeTab]);

  useEffect(() => {
    if (games.length === 0) return;
    const liveIds = new Set(liveGames.map((g) => g.id));
    const finalIds = new Set(finalGames.map((g) => g.id));
    const overlap = [...liveIds].filter((id) => finalIds.has(id));
    if (overlap.length > 0) {
      console.error('[GamesPage][invariant] LIVE/FINAL overlap detected', { overlap });
    }

    const finalWithLiveFields = finalGames.filter((g) => Boolean((g.period || '').trim()) || Boolean((g.clock || '').trim()));
    if (finalWithLiveFields.length > 0) {
      console.error('[GamesPage][invariant] FINAL game contains live fields', {
        ids: finalWithLiveFields.slice(0, 10).map((g) => g.id),
      });
    }

    const mismatchedWithFreshTruth = games.filter((game) => {
      const byId = freshTruthById[String(game.id || '')];
      if (!byId) return false;
      const expectedBucket = toStatusBucket(byId.status, byId.periodLabel || byId.period, byId.clock);
      const actualBucket = String(game.status || '').toUpperCase() === 'LIVE'
        ? 'LIVE'
        : String(game.status || '').toUpperCase() === 'FINAL'
          ? 'FINAL'
          : 'UPCOMING';
      return expectedBucket !== actualBucket;
    });
    if (mismatchedWithFreshTruth.length > 0) {
      console.error('[GamesPage][invariant] ALL tab truth differs from sport truth', {
        count: mismatchedWithFreshTruth.length,
        sample: mismatchedWithFreshTruth.slice(0, 5).map((g) => g.id),
      });
    }
  }, [games, liveGames, finalGames, freshTruthById]);

  // Status counts (same date filter as sections so tab counts match displayed games)
  const statusCounts = useMemo(() => {
    if (games.length === 0) return { all: 0, live: 0, scheduled: 0, final: 0 };
    return {
      all: games.length,
      live: games.filter(g => {
        const s = (g.status || '').toString().toLowerCase();
        return s === 'live' || s === 'in_progress';
      }).length,
      scheduled: games.filter(g => (g.status || '').toString().toLowerCase() === 'scheduled').length,
      final: games.filter(g => (g.status || '').toString().toLowerCase() === 'final').length,
    };
  }, [games]);

  // Sport counts for quick-jump strip (same date filter as displayed games)
  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach(g => {
      const sport = (g.sport || '').toUpperCase();
      counts[sport] = (counts[sport] || 0) + 1;
    });
    return counts;
  }, [games]);

  // Watchboard games - games that are in the user's active watchboard
  const watchboardGames = useMemo(() => {
    if (!activeBoard || games.length === 0) return [];
    const watchboardGameIds = new Set(activeBoardGameIds);
    if (watchboardGameIds.size === 0) return [];
    return games.filter(g => watchboardGameIds.has(g.id) || watchboardGameIds.has(g.gameId || ''));
  }, [games, activeBoard, activeBoardGameIds]);

  // Prime Time games - upcoming games on national TV
  const primeTimeGames = useMemo(() => {
    if (scheduledGames.length === 0) return [];
    return scheduledGames.filter(g => isNationalTV((g as any).channel || (g as any).broadcast));
  }, [scheduledGames]);

  // Upcoming games that are NOT prime time (to avoid duplicates)
  const regularScheduledGames = useMemo(() => {
    if (scheduledGames.length === 0 || primeTimeGames.length === 0) return scheduledGames;
    const primeTimeIds = new Set(primeTimeGames.map(g => g.id));
    return scheduledGames.filter(g => !primeTimeIds.has(g.id));
  }, [scheduledGames, primeTimeGames]);

  // Coach G Picks - DISABLED for performance - expensive whisper calculations
  // Limited to 3 games for performance
  const coachGPicks = useMemo((): ApprovedScoreCardGame[] => {
    return []; // Disabled for performance
    /* 
    const allActiveGames = [...liveGames, ...scheduledGames];
    // Early return for performance - only process first 10 games max
    const gamesToCheck = allActiveGames.slice(0, 10);
    
    return gamesToCheck.filter(game => {
      const homeTeam = typeof game.homeTeam === 'string' 
        ? { code: game.homeTeam, name: game.homeTeam, score: 0 }
        : { code: game.homeTeam.abbr, name: (game.homeTeam as any).name || game.homeTeam.abbr, score: (game.homeTeam as any).score || 0, record: (game.homeTeam as any).record };
      const awayTeam = typeof game.awayTeam === 'string'
        ? { code: game.awayTeam, name: game.awayTeam, score: 0 }
        : { code: game.awayTeam.abbr, name: (game.awayTeam as any).name || game.awayTeam.abbr, score: (game.awayTeam as any).score || 0, record: (game.awayTeam as any).record };
      
      const whisper = generateCoachWhisper({
        homeTeam,
        awayTeam,
        status: game.status === 'live' ? 'LIVE' : game.status === 'final' ? 'FINAL' : 'SCHEDULED',
        period: game.period,
        clock: game.clock,
        spread: game.spread,
        channel: (game as any).channel || (game as any).broadcast
      });
      
      // Only include games with bullish or alert sentiment
      return whisper && (whisper.sentiment === 'bullish' || whisper.sentiment === 'alert');
    }).slice(0, 3); // Limit to top 3 picks
    */
  }, []); // Empty array - always returns empty anyway

  // Handlers
  const handleGameClick = useCallback((game: ApprovedScoreCardGame, forceOdds?: boolean) => {
    const gameId = game.gameId || game.id;
    const sport = (game.sport || 'NBA').toLowerCase();
    // Route to odds page when on odds tab, otherwise match page
    const route = (forceOdds || activeTab === 'odds') 
      ? toOddsGamePath(sport, gameId)
      : toGameDetailPath(sport, gameId);
    navigate(route);
  }, [navigate, activeTab]);

  // @ts-ignore - reserved for coach integration
  const _handleCoachClick = useCallback((game: ApprovedScoreCardGame) => {
    const homeTeam = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
    const awayTeam = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
    openChat(`Tell me about the ${awayTeam} vs ${homeTeam} game`);
  }, [openChat]);

  // @ts-ignore - reserved for future use
  const _lastUpdateText = useMemo(() => {
    if (!lastFetchAt) return null;
    const diffMs = new Date().getTime() - lastFetchAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1m ago';
    return `${diffMins}m ago`;
  }, [lastFetchAt]);

  const sportConfig = AVAILABLE_SPORTS.find(s => s.key === selectedSport);
  const dateLabel = getDateLabel(selectedDate, today);
  const navDateLabel = dateLabel === "Today"
    ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : dateLabel;
  const sectionShellClass = "rounded-[14px] border border-white/[0.05] bg-[#16202B] p-4 md:p-5 shadow-[0_10px_24px_rgba(0,0,0,0.30)]";
  const sectionHeaderClass = "mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-3 py-1.5 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
  const showMoreBtnClass = "mt-4 w-full rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-4 py-2.5 text-[12px] font-semibold text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]";
  const sportGroupHeaderClass = "mb-4 flex items-center justify-between rounded-[12px] border border-white/[0.06] bg-[#121821]/95 px-4 py-3 backdrop-blur-xl shadow-[0_10px_22px_rgba(0,0,0,0.26)]";

  // Group games by sport for ALL view - memoized for performance
  const groupGamesBySport = useMemo(() => {
    return (sectionGames: ApprovedScoreCardGame[]) => {
      const groups: Record<string, ApprovedScoreCardGame[]> = {};
      for (const game of sectionGames) {
        const sport = (game.sport || 'OTHER').toUpperCase();
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(game);
      }
      // Sort sports by priority (most popular first)
      const sportOrder = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB', 'NCAAF', 'SOCCER', 'MMA', 'GOLF'];
      return Object.entries(groups).sort((a, b) => {
        const aIdx = sportOrder.indexOf(a[0]);
        const bIdx = sportOrder.indexOf(b[0]);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });
    };
  }, []);

  const renderCompactGameTile = useCallback((game: ApprovedScoreCardGame, forceInWatchboard?: boolean) => {
    const safeId = String(game?.id || game?.gameId || '');
    if (!safeId) return null;
    const safeStatus = String(game?.status || 'SCHEDULED').toUpperCase();
    const safeHomeTeam = game?.homeTeam || { abbr: 'TBD', name: 'TBD' };
    const safeAwayTeam = game?.awayTeam || { abbr: 'TBD', name: 'TBD' };
    const safePeriod = game?.period != null ? String(game.period) : undefined;
    const safeClock = game?.clock != null ? String(game.clock) : undefined;
    return (
      <div key={safeId} className="relative">
        <CompactGameTile
          game={{
            id: safeId,
            sport: game?.sport || 'NBA',
            homeTeam: safeHomeTeam,
            awayTeam: safeAwayTeam,
            homeScore: typeof game?.homeScore === 'number' ? game.homeScore : null,
            awayScore: typeof game?.awayScore === 'number' ? game.awayScore : null,
            status: safeStatus,
            period: safePeriod,
            clock: safeClock,
            startTime: game?.startTime,
            inningNumber: game?.inningNumber ?? game?.mlbLiveState?.inningNumber ?? null,
            inningHalf: game?.inningHalf ?? game?.mlbLiveState?.inningHalf ?? null,
            inningState: game?.inningState ?? null,
            mlbLiveState: game?.mlbLiveState ?? null,
            probableAwayPitcher: game.probableAwayPitcher,
            probableHomePitcher: game.probableHomePitcher,
            channel: game.channel,
            spread: game.spread ?? game.odds?.spread ?? null,
            overUnder: game.overUnder ?? game.odds?.total ?? null,
            mlHome: game.moneylineHome ?? game.odds?.mlHome ?? null,
            mlAway: game.moneylineAway ?? game.odds?.mlAway ?? null,
            odds: {
              f5: {
                spread: {
                  home: game.odds?.f5?.spread?.home ?? null,
                  away: game.odds?.f5?.spread?.away ?? null,
                },
                total: game.odds?.f5?.total ?? null,
                moneyline: {
                  home: game.odds?.f5?.moneyline?.home ?? null,
                  away: game.odds?.f5?.moneyline?.away ?? null,
                },
              },
            },
          }}
          onClick={() => handleGameClick(game)}
          onCoachClick={() => _handleCoachClick(game)}
          isInWatchboard={forceInWatchboard ?? isGameInWatchboard(safeId)}
          showQuickAction
          onQuickWatchboard={() => _handleWatchClick(game)}
        />
      </div>
    );
  }, [_handleCoachClick, _handleWatchClick, handleGameClick, isGameInWatchboard]);

  // Special section for watchboard games with enhanced styling
  const renderWatchboardSection = () => {
    if (watchboardGames.length === 0) return null;
    
    const INITIAL_SHOW = 8;
    const sectionKey = 'watchboard-section';
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = watchboardGames.length > showCount;
    const displayGames = watchboardGames.slice(0, showCount);
    
    return (
      <div id="watchboard-section" className="mb-12 first:mt-0 mt-10">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-cyan-200">
              <Star className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">Your Watchboard</span>
            </div>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-500/14 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
              {watchboardGames.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game, true))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: watchboardGames.length }))}
              className={showMoreBtnClass}
            >
              Show {watchboardGames.length - showCount} More Watchboard Games
            </button>
          )}
        </div>
      </div>
    );
  };

  // Enhanced Live section with glowing border
  const renderLiveSection = (sectionGames: ApprovedScoreCardGame[]) => {
    if (sectionGames.length === 0) return null;

    const INITIAL_SHOW = 8;
    const sectionKey = 'live-section';

    // When viewing ALL sports, group games by sport
    if (selectedSport === 'ALL') {
      const groupedBySport = groupGamesBySport(sectionGames);
      return (
        <div className="mb-12 first:mt-0 mt-10" id="live-section">
          <div className={sectionShellClass}>
            <div className={sectionHeaderClass}>
              <div className="flex items-center gap-2 text-red-300">
                <div className="relative">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 bg-red-400 rounded-full animate-ping" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide">Live Now</span>
              </div>
              <span className="rounded-full border border-red-300/30 bg-red-500/14 px-2 py-0.5 text-[10px] font-semibold text-red-100 animate-pulse">
                {sectionGames.length}
              </span>
            </div>
            {groupedBySport.map(([sport, sportGames]) => {
              const sportInfo = DROPDOWN_SPORTS.find(s => s.key === sport);
              const sportSectionKey = `${sectionKey}-${sport}`;
              const sportShowCount = showMoreSections[sportSectionKey] || INITIAL_SHOW;
              const sportHasMore = sportGames.length > sportShowCount;
              const displayGames = sportGames.slice(0, sportShowCount);

              return (
                <div key={sport} id={`league-${sport.toLowerCase()}`} className="mb-8 last:mb-0">
                  <div className={sportGroupHeaderClass}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#16202B] text-[11px] font-semibold text-slate-300">
                        {String(sportInfo?.label || sport).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold tracking-tight text-[#F3F4F6]">{sportInfo?.label || sport}</span>
                        <span className="text-[11px] text-slate-400">Live</span>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {sportGames.length} game{sportGames.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {displayGames.map((game) => renderCompactGameTile(game))}
                  </div>
                  {sportHasMore && (
                    <button
                      onClick={() => setShowMoreSections(prev => ({ ...prev, [sportSectionKey]: sportGames.length }))}
                      className={showMoreBtnClass}
                    >
                      Show {sportGames.length - sportShowCount} More Live {sportInfo?.label || sport} Games
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-12 mt-10 first:mt-0" id="live-section">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-red-300">
              <div className="relative">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-2 h-2 bg-red-400 rounded-full animate-ping" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">Live Now</span>
            </div>
            <span className="rounded-full border border-red-300/30 bg-red-500/14 px-2 py-0.5 text-[10px] font-semibold text-red-100 animate-pulse">
              {sectionGames.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {sectionGames.map((game) => renderCompactGameTile(game))}
          </div>
        </div>
      </div>
    );
  };

  // Render Prime Time section - national TV games with gold styling
  const renderPrimeTimeSection = () => {
    if (primeTimeGames.length === 0) return null;
    
    const INITIAL_SHOW = 8;
    const sectionKey = 'prime-section';
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = primeTimeGames.length > showCount;
    const displayGames = primeTimeGames.slice(0, showCount);
    
    return (
      <div id="prime-section" className="mb-10">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-amber-200">
              <span className="text-xs font-semibold uppercase tracking-wide">Prime Time</span>
            </div>
            <span className="rounded-full border border-amber-300/30 bg-amber-500/14 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
              {primeTimeGames.length} on TV
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: primeTimeGames.length }))}
              className={showMoreBtnClass}
            >
              Show {primeTimeGames.length - showCount} More Prime Time Games
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderCoachGPicksSection = () => {
    if (coachGPicks.length === 0) return null;
    
    const INITIAL_SHOW = 8;
    const sectionKey = 'coachg-section';
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = coachGPicks.length > showCount;
    const displayGames = coachGPicks.slice(0, showCount);
    
    return (
      <div id="coachg-section" className="mb-10">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-violet-200">
              <Star className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">Coach G Picks</span>
            </div>
            <span className="rounded-full border border-violet-300/30 bg-violet-500/14 px-2 py-0.5 text-[10px] font-semibold text-violet-100">
              {coachGPicks.length} hot takes
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: coachGPicks.length }))}
              className={showMoreBtnClass}
            >
              Show {coachGPicks.length - showCount} More Coach G Picks
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (title: string, sectionGames: ApprovedScoreCardGame[], statusClass: string, sectionId?: string) => {
    if (sectionGames.length === 0) return null;
    
    const INITIAL_SHOW = 8; // Show 12 games initially (6 rows in 2-col grid)
    const sectionKey = sectionId || title.toLowerCase();
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = sectionGames.length > showCount;
    
    // When viewing ALL sports, group games by sport within each section
    if (selectedSport === 'ALL') {
      const groupedBySport = groupGamesBySport(sectionGames);
      return (
        <div id={sectionId} className="mb-12 mt-10 first:mt-0">
          <div className={sectionShellClass}>
            <div className={cn(sectionHeaderClass, statusClass)}>
              <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {sectionGames.length}
              </span>
            </div>
            {groupedBySport.map(([sport, sportGames]) => {
            const sportInfo = DROPDOWN_SPORTS.find(s => s.key === sport);
            const sportSectionKey = `${sectionKey}-${sport}`;
            const sportShowCount = showMoreSections[sportSectionKey] || INITIAL_SHOW;
            const sportHasMore = sportGames.length > sportShowCount;
            const displayGames = sportGames.slice(0, sportShowCount);
            
            return (
              <div key={sport} id={`${sectionId}-${sport.toLowerCase()}`} className="mb-8 last:mb-0">
                {/* Enhanced League Section Header - Sticky */}
                <div className={sportGroupHeaderClass}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#16202B] text-[11px] font-semibold text-slate-300">
                      {String(sportInfo?.label || sport).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold tracking-tight text-[#F3F4F6]">{sportInfo?.label || sport}</span>
                      <span className="text-[11px] text-slate-400">Slate</span>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {sportGames.length} game{sportGames.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {displayGames.map((game) => renderCompactGameTile(game))}
                </div>
                {sportHasMore && (
                  <button
                    onClick={() => setShowMoreSections(prev => ({ ...prev, [sportSectionKey]: sportGames.length }))}
                    className={showMoreBtnClass}
                  >
                    Show {sportGames.length - sportShowCount} More {sportInfo?.label || sport} Games
                  </button>
                )}
              </div>
            );
            })}
          </div>
        </div>
      );
    }
    
    const displayGames = sectionGames.slice(0, showCount);
    
    return (
      <div id={sectionId} className="mb-12 mt-10 first:mt-0">
        <div className={sectionShellClass}>
          <div className={cn(sectionHeaderClass, statusClass)}>
            <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              {sectionGames.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: sectionGames.length }))}
              className={showMoreBtnClass}
            >
              Show {sectionGames.length - showCount} More Games
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080B10]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#080B10] via-[#0C1118] to-[#080B10]" />
      <div className="pointer-events-none absolute left-1/4 top-0 h-[30rem] w-[30rem] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 top-6 h-[26rem] w-[26rem] rounded-full bg-violet-500/[0.03] blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(12,17,24,0)_0%,#080B10_78%)]" />
      {/* Live Pulse Ticker - shows live scores scrolling */}
      <LivePulseTicker 
        games={games} 
        onLabelClick={() => {
          document.getElementById('live-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      
      {/* COMPACT COMMAND CENTER HEADER */}
      <div className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#121821]/92 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4">
          {/* Top Row: Title + Date + Actions */}
          <div className="flex items-center justify-between gap-3 py-3">
            {/* Title */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Zap className="w-4 h-4 text-[#D1D5DB]" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold tracking-tight text-white">Command Center</h1>
                <button 
                  onClick={() => setDateModalOpen(true)}
                  className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-cyan-300"
                >
                  <span>{dateLabel}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={cn(
                  "h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100",
                  refreshing && "opacity-50"
                )}
              >
                <RefreshCw className={cn("mx-auto h-4 w-4", refreshing && "animate-spin")} />
              </button>
              
              {/* Settings */}
              <button
                onClick={() => navigate('/settings')}
                className="h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
              >
                <Settings className="mx-auto h-4 w-4" />
              </button>

              {/* Coach G quick entry */}
              <button
                onClick={() => navigate('/coach')}
                className="flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-violet-300/30 hover:bg-violet-500/10 hover:text-violet-100"
              >
                <img
                  src="/assets/coachg/coach-g-avatar.png?v=2"
                  alt="Coach G"
                  className="h-5 w-5 rounded-full border border-violet-300/35 object-cover"
                />
                <span className="hidden text-[10px] font-semibold tracking-wide sm:inline">Coach G</span>
              </button>
            </div>
          </div>
          
          {/* Sport Quick-Jump Strip */}
          <div className="pb-3">
            <SportQuickJump 
              selected={selectedSport}
              onSelect={async (sport) => {
                if (sport === 'MMA') {
                  try {
                    const res = await fetch('/api/mma/next');
                    if (res.ok) {
                      const data = await res.json();
                      if (data.gameId) {
                        navigate(toGameDetailPath('mma', data.gameId));
                        return;
                      }
                    }
                  } catch (err) {
                    console.error('Failed to fetch next UFC event:', err);
                  }
                }
                if (sport === 'GOLF') {
                  navigate('/sports/golf');
                  return;
                }
                setSelectedSport(sport);
                setLeagueFilter('ALL');
                setConferenceFilter('ALL');
              }}
              sportCounts={sportCounts}
            />
          </div>
          
          {/* Tab Strip + Status Controls */}
          <div className="flex flex-wrap items-center gap-2.5 border-t border-white/[0.05] pb-3 pt-2">
            <div className="inline-flex items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
            {([
              { key: 'scores', label: 'Scores' },
              { key: 'odds', label: 'Odds' },
              { key: 'props', label: 'Props' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "h-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200",
                  activeTab === key
                    ? "border-cyan-300/35 bg-cyan-500/14 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                    : "hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
                )}
              >
                {label}
              </button>
            ))}
            </div>

            <div className="inline-flex items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                className="h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100"
                aria-label="Previous date"
              >
                <ChevronLeft className="mx-auto h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDateModalOpen(true)}
                className="flex h-8 items-center rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2.5 text-[11px] font-medium tracking-[0.02em] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
              >
                {navDateLabel}
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="flex h-8 items-center rounded-full border border-cyan-300/30 bg-cyan-500/12 px-2 text-[11px] font-medium text-cyan-100 transition-all duration-200 hover:border-cyan-200/45 hover:bg-cyan-500/18"
              >
                Today
              </button>
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                className="h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-emerald-300/30 hover:bg-emerald-500/10 hover:text-emerald-100"
                aria-label="Next date"
              >
                <ChevronRight className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
            
            {/* Status Filter */}
            <div className="ml-auto inline-flex flex-wrap items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 text-[10px] font-medium backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
              {(['all', 'live', 'scheduled', 'final'] as StatusFilter[]).map((status) => {
                const labels: Record<StatusFilter, string> = { all: 'All', live: 'Live', scheduled: 'Soon', final: 'Final' };
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "h-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2.5 tracking-[0.06em] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200",
                      statusFilter === status
                        ? "border-cyan-300/35 bg-cyan-500/14 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                        : "hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
                    )}
                  >
                    {labels[status]}
                    {statusCounts[status] > 0 && (
                      <span className="ml-1 opacity-70">{statusCounts[status]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* THIN DIVIDER */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-8 pt-5">
        {/* SCORES TAB CONTENT */}
        {staleNotice && (
          <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
            <p className="text-[11px] text-cyan-200">{staleNotice}</p>
          </div>
        )}
        {loading && games.length > 0 && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-200" />
            <p className="text-[11px] font-medium text-cyan-100">Updating games...</p>
          </div>
        )}
        {showDebugTelemetry && (
          <div className="mb-4">
            <OddsTelemetryDebugPanel
              pageKey="games"
              gamesCount={games.length}
              oddsCoverageCount={realOddsGameCount}
              staleNotice={staleNotice}
              isHydrating={loading || refreshing}
              cycleToken={refreshCycleCount}
              lowCoverageThresholdPct={debugCoverageThresholdPct}
            />
          </div>
        )}

        {activeTab === 'scores' && (
          <>
            {/* Loading - only on very first load when no games exist */}
            {loading && games.length === 0 && (
              <div className="rounded-2xl border border-cyan-500/20 bg-[#121821] p-6 md:p-8">
                <div className="mb-4 flex items-center gap-2 text-cyan-200">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <p className="text-sm font-medium">Syncing live slate...</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`games-skeleton-${idx}`} className="h-24 animate-pulse rounded-xl border border-slate-700/40 bg-slate-900/70" />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {showGlobalFailure && !loading && games.length === 0 && rawGames.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-12 text-center">
                <AlertCircle className="mb-3 h-6 w-6 text-red-300" />
                <p className="mb-2 text-sm font-semibold text-red-100">Unable to load games</p>
                <p className="mb-4 max-w-xl text-xs text-red-200/80">{error}</p>
                <button
                  onClick={() => hubRefresh()}
                  disabled={loading}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm transition-colors",
                    loading
                      ? "cursor-not-allowed border-slate-700/40 bg-slate-800/40 text-slate-500"
                      : "border-red-300/30 bg-slate-900/70 text-red-100 hover:bg-slate-800/80"
                  )}
                >
                  {loading ? "Retrying..." : "Try Again"}
                </button>
              </div>
            )}

            {/* Empty - No games for date - show helpful message */}
            {!loading && !showGlobalFailure && games.length === 0 && rawGames.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/30 bg-[#121821] px-6 py-20 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700/30 bg-slate-800/50 text-sm font-semibold tracking-wide text-slate-300">
                  {String(sportConfig?.label || selectedSport || "ALL").slice(0, 3).toUpperCase()}
                </div>
                <p className="mb-2 text-base font-semibold text-slate-100">
                  No {selectedSport === 'ALL' ? '' : (sportConfig?.label || selectedSport) + ' '}games {dateLabel.toLowerCase()}
                </p>
                <p className="mb-6 text-sm text-slate-400">
                  {selectedSport === 'ALL' 
                    ? "No games scheduled across any sport for this date"
                    : "Try viewing All Sports or selecting a different date"
                  }
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {selectedSport !== 'ALL' && (
                    <button
                      onClick={() => setSelectedSport('ALL' as ExtendedSportKey)}
                      className="rounded-lg border border-cyan-500/35 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/30"
                    >
                      View All Sports
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                    className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70"
                  >
                    Check Tomorrow →
                  </button>
                </div>
              </div>
            )}

            {/* Games - List View */}
            {filteredCount > 0 && (
              <div>
                {statusFilter === 'all' ? (
                  <>
                    {renderWatchboardSection()}
                    {renderLiveSection(liveGames)}
                    {renderCoachGPicksSection()}
                    {renderPrimeTimeSection()}
                    {renderSection('Upcoming', regularScheduledGames, 'text-slate-400', 'upcoming-section')}
                    {renderSection('Final', finalGames, 'text-slate-500', 'final-section')}
                  </>
                ) : (
                  (() => {
                    const FILTERED_INITIAL_SHOW = 16;
                    const filterKey = `filtered-${statusFilter}`;
                    const allFilteredGames = statusFilter === 'live' ? liveGames : 
                      statusFilter === 'scheduled' ? scheduledGames : finalGames;
                    const showCount = showMoreSections[filterKey] || FILTERED_INITIAL_SHOW;
                    const displayGames = allFilteredGames.slice(0, showCount);
                    const hasMore = allFilteredGames.length > showCount;
                    
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {displayGames.map((game) => renderCompactGameTile(game))}
                        </div>
                        {hasMore && (
                          <button
                            onClick={() => setShowMoreSections(prev => ({ 
                              ...prev, 
                              [filterKey]: showCount + 16 
                            }))}
                            className="mt-4 w-full py-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-700/50 text-slate-400 text-sm font-medium transition-colors border border-slate-700/30"
                          >
                            Show More ({allFilteredGames.length - showCount} remaining)
                          </button>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            )}

        {/* No games in filtered view */}
        {games.length > 0 && filteredCount === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/30 bg-[#121821] px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700/30 bg-slate-800/40">
              <AlertCircle className="w-6 h-6 text-slate-500" />
            </div>
            <p className="mb-2 text-sm font-medium text-slate-200">
              {conferenceFilter !== 'ALL' 
                ? `No ${conferenceFilter === 'TOP25' ? 'Top 25' : conferenceFilter} games found`
                : `No ${statusFilter === 'scheduled' ? 'upcoming' : statusFilter === 'all' ? 'matching' : statusFilter} games`
              }
            </p>
            <p className="mb-5 text-xs text-slate-400">
              {conferenceFilter !== 'ALL' 
                ? `Try viewing all conferences or changing the date`
                : `${games.length} total games available with different filters`
              }
            </p>
            {conferenceFilter !== 'ALL' ? (
              <button
                onClick={() => setConferenceFilter('ALL')}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70"
              >
                View All Conferences
              </button>
            ) : (
              <button
                onClick={() => setStatusFilter('all')}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70"
              >
                Show All {games.length} Games
              </button>
            )}
          </div>
        )}

        {/* Footer count */}
        {filteredCount > 0 && (
          <div className="mt-12 pt-6 border-t border-slate-800/30 text-center">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {filteredCount} game{filteredCount !== 1 ? 's' : ''} • {dateLabel}
            </span>
          </div>
        )}
          </>
        )}

        {/* ODDS TAB CONTENT - Sports Betting Intelligence Terminal */}
        {activeTab === 'odds' && (
          <div className="space-y-4 py-2">
            {(loading && games.length === 0) ? (
              <div className="rounded-2xl border border-amber-500/20 bg-[#121821] p-6 md:p-8">
                <div className="mb-4 flex items-center gap-2 text-amber-200">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <p className="text-sm font-medium">Loading market intelligence...</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`odds-skeleton-${idx}`} className="h-24 animate-pulse rounded-xl border border-slate-700/40 bg-slate-900/70" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <OddsIntelligenceDashboard
                  games={games}
                  isGameInWatchboard={isGameInWatchboard}
                  onWatchboardClick={(game) => {
                    const awayName = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
                    const homeName = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
                    setWatchboardModal({ open: true, gameId: game.id, gameSummary: `${awayName} @ ${homeName}` });
                  }}
                  selectedSport={selectedSport}
                  showMoreSections={showMoreSections}
                  setShowMoreSections={setShowMoreSections}
                />
              </div>
            )}
          </div>
        )}


        {/* PROPS TAB CONTENT */}
        {activeTab === 'props' && (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <div>
                <p className="font-semibold text-emerald-100">Player Props is live</p>
                <p className="text-sm text-emerald-200/80">
                  Open the full props board or jump into props for a specific game.
                </p>
              </div>
              <button
                onClick={() => navigate('/props')}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-500/30"
              >
                Open Player Props Board
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {games.slice(0, 9).map((game) => {
                const awayName = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
                const homeName = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
                return (
                  <button
                    key={`props-${game.id}`}
                    onClick={() => navigate(`/lines/${game.id}/props`)}
                    className="text-left rounded-xl border border-slate-700/40 bg-slate-900/50 p-3 transition-colors hover:border-emerald-500/30 hover:bg-slate-800/65"
                  >
                    <p className="text-sm font-semibold text-slate-100">{awayName} @ {homeName}</p>
                    <p className="mt-1 text-xs text-emerald-300/90">View game props</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      
      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        selected={selectedDate}
        onSelect={setSelectedDate}
        today={today}
      />
      
      {/* Add to Watchboard Modal */}
      {watchboardModal.open && (
        <AddToWatchboardModal
          isOpen={watchboardModal.open}
          onClose={() => setWatchboardModal({ open: false, gameId: '', gameSummary: '' })}
          gameId={watchboardModal.gameId}
          gameSummary={watchboardModal.gameSummary}
          onSuccess={(boardName) => {
            setToast({ message: `Added to ${boardName}`, type: 'success' });
            setTimeout(() => setToast(null), 2500);
          }}
          onError={(error) => {
            setToast({ message: error, type: 'error' });
            setTimeout(() => setToast(null), 2500);
          }}
        />
      )}
      
      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium z-[100] ${
          toast.type === 'success' 
            ? 'bg-emerald-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default GamesPage;
