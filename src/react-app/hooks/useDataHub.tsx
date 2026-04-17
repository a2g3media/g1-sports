/**
 * useDataHub - Consolidated Polling Hook
 * 
 * Coordinates all dashboard data fetching through a single polling interval.
 * Reduces multiple 30-second intervals to one coordinated fetch cycle.
 * 
 * Data types managed:
 * - Live games (from /api/games)
 * - Watchboard previews (from /api/watchboards/home-preview)
 * - Line movement alerts (from /api/line-movement/alerts)
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import type { LiveGame } from './useLiveGames';
import { getTeamOrCountryLogoUrl } from '@/react-app/lib/teamLogos';
import { fetchJsonCached } from '@/react-app/lib/fetchCache';

// ============================================
// TYPES
// ============================================

interface GameData {
  game_id: string;
  sport: string;
  home_team_code: string;
  away_team_code: string;
  home_team_name?: string;
  away_team_name?: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  start_time: string;
  period_label?: string;
  clock?: string;
}

interface BoardWithGames {
  id: number;
  name: string;
  gameIds: string[];
  games: GameData[];
  hasActiveGames: boolean;
}

interface LineMovement {
  id: string;
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  type: 'spread' | 'total' | 'moneyline';
  direction: 'up' | 'down';
  previousValue: number;
  currentValue: number;
  change: number;
  severity: 'minor' | 'moderate' | 'sharp' | 'steam';
  detectedAt: string;
  source: string;
  analysis: string;
}

interface SharpAlert {
  id: string;
  movement: LineMovement;
  headline: string;
  description: string;
  isNew: boolean;
  expiresAt: string;
}

interface DataHubState {
  // Games data
  games: LiveGame[];
  gamesLoading: boolean;
  gamesError: string | null;
  
  // Watchboard data
  watchboards: BoardWithGames[];
  watchboardsLoading: boolean;
  
  // Alerts data
  alerts: SharpAlert[];
  alertsLoading: boolean;
  
  // Global state
  lastFetchAt: Date | null;
  isRefreshing: boolean;
  isPaused: boolean;
}

interface DataHubActions {
  refresh: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  dismissAlert: (alertId: string) => void;
}

interface DataHubContextValue extends DataHubState, DataHubActions {
  // Computed values
  hasLiveGames: boolean;
  liveGameCount: number;
  steamAlertCount: number;
  sharpAlertCount: number;
}

// ============================================
// CONTEXT
// ============================================

const DataHubContext = createContext<DataHubContextValue | null>(null);

// ============================================
// TEAM HELPERS (from useLiveGames)
// ============================================

const TEAM_ABBREVIATIONS: Record<string, string> = {
  'Kansas City Chiefs': 'KC', 'Buffalo Bills': 'BUF', 'Philadelphia Eagles': 'PHI',
  'San Francisco 49ers': 'SF', 'Dallas Cowboys': 'DAL', 'Miami Dolphins': 'MIA',
  'Los Angeles Lakers': 'LAL', 'Boston Celtics': 'BOS', 'Golden State Warriors': 'GSW',
  'New York Knicks': 'NYK', 'Los Angeles Dodgers': 'LAD', 'New York Yankees': 'NYY',
};

function getTeamAbbreviation(teamName: string | null | undefined): string {
  if (!teamName) return 'TBD';
  if (TEAM_ABBREVIATIONS[teamName]) return TEAM_ABBREVIATIONS[teamName];
  if (teamName.length <= 4) return teamName.toUpperCase();
  return teamName.substring(0, 3).toUpperCase();
}

function getTeamShortName(teamName: string | null | undefined): string {
  if (!teamName) return 'TBD';
  const parts = teamName.split(' ');
  return parts[parts.length - 1];
}

function formatStartTime(startTime: string): string {
  try {
    const date = new Date(startTime);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function getDateInEastern(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const HOME_LIVE_STATUSES = new Set(['IN_PROGRESS', 'LIVE', 'INPROGRESS', 'HALFTIME']);
const HOME_FINAL_STATUSES = new Set(['FINAL', 'COMPLETED', 'CLOSED']);
const HOME_LIVE_RECENT_WINDOW_MS = 8 * 60 * 60 * 1000;
const HOME_LIVE_FUTURE_GRACE_MS = 60 * 60 * 1000;
const HOME_SOON_WINDOW_MS = 18 * 60 * 60 * 1000;
const HOME_RECENT_START_GRACE_MS = 2 * 60 * 60 * 1000;
const HOME_LOCKED = true;
const HOME_SCHEDULE_ENDPOINT = '/api/games';
let homeLockSelfTestRan = false;

function runHomeLogicMutation<T>(action: string, override: boolean, mutation: () => T): T | null {
  if (HOME_LOCKED && !override) {
    console.warn("HOME LOCKED — CHANGE BLOCKED", { action });
    return null;
  }
  return mutation();
}

function runHomeLockSelfTest(): void {
  if (homeLockSelfTestRan) return;
  homeLockSelfTestRan = true;
  runHomeLogicMutation('home-lock-self-test', false, () => true);
}

function assertHomeScheduleOnlyEndpoint(url: string): void {
  if (!String(url || '').startsWith(`${HOME_SCHEDULE_ENDPOINT}?`)) {
    console.error('HOME DEPENDENCY VIOLATION', {
      expected: HOME_SCHEDULE_ENDPOINT,
      actual: url,
      message: 'Home = schedule only; no fallback/detail/alternate sources allowed.',
    });
  }
}

function parseDateSafe(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function isTodayLocalOrUtc(date: Date, now: Date): boolean {
  return isSameLocalDay(date, now) || isSameUtcDay(date, now);
}

function resolveFinalReferenceTime(game: DbGame): Date | null {
  const candidates = [
    (game as any).completed_at,
    (game as any).completedAt,
    (game as any).ended_at,
    (game as any).endedAt,
    (game as any).finished_at,
    (game as any).finishedAt,
    game.start_time,
  ];
  for (const candidate of candidates) {
    const parsed = parseDateSafe(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function resolveLiveReferenceTime(game: DbGame): Date | null {
  const candidates = [
    (game as any).last_updated_at,
    (game as any).lastUpdatedAt,
    (game as any).updated_at,
    (game as any).updatedAt,
    (game as any).started_at,
    (game as any).startedAt,
    game.start_time,
  ];
  for (const candidate of candidates) {
    const parsed = parseDateSafe(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function isRelevantHomepageGame(game: DbGame, nowMs = Date.now()): boolean {
  const status = String(game.status || '').toUpperCase();
  if (HOME_LIVE_STATUSES.has(status)) {
    // Defensive anti-stale guardrail:
    // providers occasionally leave games flagged as live after they end.
    const liveRef = resolveLiveReferenceTime(game);
    if (!liveRef) return false;
    const liveRefMs = liveRef.getTime();
    return liveRefMs >= nowMs - HOME_LIVE_RECENT_WINDOW_MS
      && liveRefMs <= nowMs + HOME_LIVE_FUTURE_GRACE_MS;
  }

  const now = new Date(nowMs);
  const start = parseDateSafe(game.start_time);
  if (!start) return false;
  const startMs = start.getTime();
  const isToday = isTodayLocalOrUtc(start, now);

  if (HOME_FINAL_STATUSES.has(status)) {
    const finalRef = resolveFinalReferenceTime(game);
    if (!finalRef) return false;
    // Home display rule: finals are eligible when completed today (local or UTC).
    return isTodayLocalOrUtc(finalRef, now);
  }

  // Scheduled / pregame: only today, with a small grace window for start-time drift.
  return isToday
    && startMs >= nowMs - HOME_RECENT_START_GRACE_MS
    && startMs <= nowMs + HOME_SOON_WINDOW_MS;
}

function isRelevantHomepageGameForSport(game: DbGame, sportKey: string, nowMs = Date.now()): boolean {
  const normalizedSport = String(sportKey || '').toUpperCase();
  if (normalizedSport !== 'SOCCER') {
    return isRelevantHomepageGame(game, nowMs);
  }

  // Temporary soccer override:
  // - keep LIVE rows
  // - keep all scheduled rows for today (local/UTC), regardless of time window
  const status = String(game.status || '').toUpperCase();
  if (HOME_LIVE_STATUSES.has(status)) return true;

  const start = parseDateSafe(game.start_time);
  if (!start) return false;
  const isToday = isTodayLocalOrUtc(start, new Date(nowMs));
  if (!isToday) return false;

  const isScheduledLike = !HOME_FINAL_STATUSES.has(status);
  if (isScheduledLike) return true;

  // Keep existing recent-final logic for soccer finals.
  return isRelevantHomepageGame(game, nowMs);
}

// ============================================
// DATA FETCHING
// ============================================

const DATAHUB_FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = DATAHUB_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

interface DbGame {
  game_id: string;
  sport: string;
  league: string;
  home_team_code: string;
  away_team_code: string;
  home_team_name: string;
  away_team_name: string;
  start_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  period_label: string | null;
  clock: string | null;
  broadcast?: string | null;
  is_overtime?: boolean;
  home_logo_url?: string | null;
  away_logo_url?: string | null;
  spread?: number | null;
  overUnder?: number | null;
  moneylineHome?: number | null;
  moneylineAway?: number | null;
}


function shouldDeferDataHubGamesFetch(): boolean {
  // Keep DataHub scoped away from route-owned pages by default, but the home
  // dashboard still relies on this feed for "Games Today" cards.
  if (typeof window === 'undefined') return false;
  const path = String(window.location.pathname || '').toLowerCase();
  const isHomeRoute = path === '/' || path === '/home' || path.startsWith('/dashboard');
  return !isHomeRoute;
}

function mergeDbGames(base: DbGame, incoming: DbGame): DbGame {
  const pickText = (a?: string | null, b?: string | null): string | null | undefined => {
    const aa = a != null ? String(a).trim() : '';
    const bb = b != null ? String(b).trim() : '';
    if (!aa && bb) return b;
    return a;
  };
  const pickNum = (a?: number | null, b?: number | null): number | null | undefined => {
    if ((a === null || a === undefined) && b !== null && b !== undefined) return b;
    return a;
  };

  return {
    ...base,
    status: pickText(base.status, incoming.status) as string,
    period_label: pickText(base.period_label, incoming.period_label) as string | null,
    clock: pickText(base.clock, incoming.clock) as string | null,
    broadcast: pickText(base.broadcast, incoming.broadcast) as string | null | undefined,
    home_logo_url: pickText(base.home_logo_url, incoming.home_logo_url) as string | null | undefined,
    away_logo_url: pickText(base.away_logo_url, incoming.away_logo_url) as string | null | undefined,
    home_score: pickNum(base.home_score, incoming.home_score) as number | null,
    away_score: pickNum(base.away_score, incoming.away_score) as number | null,
    spread: pickNum(base.spread, incoming.spread) as number | null | undefined,
    overUnder: pickNum(base.overUnder, incoming.overUnder) as number | null | undefined,
    moneylineHome: pickNum(base.moneylineHome, incoming.moneylineHome) as number | null | undefined,
    moneylineAway: pickNum(base.moneylineAway, incoming.moneylineAway) as number | null | undefined,
  };
}

function normalizeSportKey(rawSport: string | null | undefined, rawLeague?: string | null | undefined): string {
  const upper = String(rawSport || '').toUpperCase();
  const league = String(rawLeague || '').toUpperCase();
  const soccerLeagueHints = [
    'UEFA',
    'EUROPA',
    'CHAMPIONS',
    'PREMIER',
    'EPL',
    'MLS',
    'LA_LIGA',
    'LA LIGA',
    'SERIE_A',
    'SERIE A',
    'BUNDES',
    'LIGUE_1',
    'LIGUE 1',
    'LIGA_MX',
    'LIGA MX',
    'EREDIVISIE',
    'PRIMEIRA',
    'COPA',
    'WORLD CUP',
    'NATIONS LEAGUE',
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
    return 'NFL';
  }
  return upper || 'NFL';
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function extractInningDisplayFromPlayLike(play: unknown): string | null {
  if (!play || typeof play !== 'object') return null;
  const obj = play as Record<string, unknown>;
  const periodText = String(obj.period || '').trim();
  const clockText = String(obj.clock || '').trim();
  const raw = `${periodText} ${clockText}`.trim();
  if (!raw) return null;

  const sideMatch = raw.match(/\b(top|bot|bottom|mid|middle|end|t|b)\b(?:\s+of(?:\s+the)?|\s+the)?[\s:-]*(\d{1,2})(?:st|nd|rd|th)?/i);
  if (sideMatch) {
    const sideRaw = sideMatch[1].toLowerCase();
    const inning = Number(sideMatch[2]);
    if (!Number.isFinite(inning) || inning <= 0) return null;
    const side = sideRaw === 'bottom' || sideRaw === 'b'
      ? 'Bot'
      : sideRaw === 'top' || sideRaw === 't'
        ? 'Top'
        : sideRaw === 'middle'
          ? 'Mid'
          : sideRaw.charAt(0).toUpperCase() + sideRaw.slice(1);
    return `${side} ${ordinalSuffix(inning)}`;
  }

  const inningOnly = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(inning|inn|in)\b/i);
  if (inningOnly) {
    const inning = Number(inningOnly[1]);
    if (Number.isFinite(inning) && inning > 0) return `${ordinalSuffix(inning)} Inning`;
  }

  return null;
}

async function fetchMlbInningLabel(gameId: string): Promise<string | null> {
  if (!gameId) return null;
  try {
    const url = `/api/games/${encodeURIComponent(gameId)}/playbyplay`;
    assertHomeScheduleOnlyEndpoint(url);
    const res = await fetchWithTimeout(url, undefined, 3000);
    if (!res.ok) return null;
    const data = await res.json();
    const plays = Array.isArray((data as Record<string, unknown>)?.plays)
      ? ((data as Record<string, unknown>).plays as unknown[])
      : [];
    const lastPlay = (data as Record<string, unknown>)?.lastPlay;
    const ordered = [lastPlay, ...plays].filter(Boolean);
    for (const play of ordered) {
      const label = extractInningDisplayFromPlayLike(play);
      if (label) return label;
    }
    return null;
  } catch {
    return null;
  }
}

function transformDbGameToLiveGame(game: DbGame): LiveGame {
  const homeScore = game.home_score ?? 0;
  const awayScore = game.away_score ?? 0;
  const sportKey = normalizeSportKey(game.sport, game.league);
  const isScheduled = game.status === 'SCHEDULED';
  
  let momentum: 'home' | 'away' | null = null;
  if (game.status === 'IN_PROGRESS' || game.status === 'LIVE') {
    if (homeScore > awayScore) momentum = 'home';
    else if (awayScore > homeScore) momentum = 'away';
  }

  const homePercent = 45 + Math.floor(Math.random() * 20);

  const homeAbbr = game.home_team_code || getTeamAbbreviation(game.home_team_name);
  const awayAbbr = game.away_team_code || getTeamAbbreviation(game.away_team_name);
  const homeDirectLogo = String(game.home_logo_url || "").trim();
  const awayDirectLogo = String(game.away_logo_url || "").trim();

  const normalizedStatus = String(game.status || '').toUpperCase();
  const liveStatuses = new Set(['LIVE', 'IN_PROGRESS', 'INPROGRESS']);
  const scheduledStatuses = new Set(['SCHEDULED', 'NOT_STARTED', 'PRE_GAME', 'PREGAME']);
  const finalStatuses = new Set(['FINAL', 'COMPLETED', 'CLOSED']);

  const mappedStatus: LiveGame['status'] = liveStatuses.has(normalizedStatus)
    ? 'IN_PROGRESS'
    : scheduledStatuses.has(normalizedStatus)
      ? 'SCHEDULED'
      : finalStatuses.has(normalizedStatus)
        ? 'FINAL'
        : 'SCHEDULED';

  return {
    id: game.game_id || `gen_${game.sport}_${game.home_team_code || 'H'}_${game.away_team_code || 'A'}_${game.start_time || Date.now()}`,
    league: game.league || null,
    homeTeam: {
      name: getTeamShortName(game.home_team_name),
      abbreviation: homeAbbr,
      score: homeScore,
      logo: homeDirectLogo || getTeamOrCountryLogoUrl(homeAbbr, sportKey, game.league) || '',
    },
    awayTeam: {
      name: getTeamShortName(game.away_team_name),
      abbreviation: awayAbbr,
      score: awayScore,
      logo: awayDirectLogo || getTeamOrCountryLogoUrl(awayAbbr, sportKey, game.league) || '',
    },
    period: game.period_label || (isScheduled ? '' : ''),
    clock: game.clock || (isScheduled ? formatStartTime(game.start_time) : ''),
    sport: sportKey,
    status: mappedStatus,
    momentum,
    hasCoachInsight: Math.random() > 0.5,
    rankImpact: null,
    community: { homePercent, awayPercent: 100 - homePercent },
    channel: game.broadcast || null,
    startTime: game.start_time || undefined,
    isOvertime: game.is_overtime || false,
    odds: (game.spread !== undefined || game.moneylineHome !== undefined) ? {
      spreadHome: game.spread ?? null,
      total: game.overUnder ?? null,
      moneylineHome: game.moneylineHome ?? null,
      moneylineAway: game.moneylineAway ?? null,
      movementSpread: null,
      movementTotal: null,
    } : undefined,
  };
}

function getHomeSortBucket(game: LiveGame, nowMs: number): 0 | 1 | 2 | 3 {
  const status = String(game.status || '').toUpperCase();
  if (status === 'IN_PROGRESS') return 0;

  const start = parseDateSafe(game.startTime);
  const startMs = start ? start.getTime() : Number.NaN;
  const hasStart = Number.isFinite(startMs);
  const isToday = start ? isTodayLocalOrUtc(start, new Date(nowMs)) : false;

  // Upcoming soon should surface right below live.
  if (status === 'SCHEDULED' && hasStart && startMs >= nowMs && startMs <= nowMs + HOME_SOON_WINDOW_MS) {
    return 1;
  }

  // Remaining games from today's slate.
  if (isToday) return 2;

  // Any other edge rows (guardrail fallback paths) stay last.
  return 3;
}

function getStatusTieBreakRank(status: LiveGame['status']): number {
  if (status === 'SCHEDULED') return 0;
  if (status === 'FINAL') return 1;
  return 2;
}

function sortHomeGamesForDisplay(games: LiveGame[]): LiveGame[] {
  const nowMs = Date.now();
  const sorted = [...games].sort((a, b) => {
    const bucketDiff = getHomeSortBucket(a, nowMs) - getHomeSortBucket(b, nowMs);
    if (bucketDiff !== 0) return bucketDiff;

    const statusDiff = getStatusTieBreakRank(a.status) - getStatusTieBreakRank(b.status);
    if (statusDiff !== 0) return statusDiff;

    const timeA = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
    if (Number.isFinite(timeA) || Number.isFinite(timeB)) return timeA - timeB;

    // Stable deterministic fallback.
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return sorted;
}

function runHomeRuntimeAssertions(games: LiveGame[], source: string): void {
  const nowMs = Date.now();
  const seen = new Set<string>();
  const sportCounts = new Map<string, number>();
  const violations: Array<Record<string, unknown>> = [];

  for (const game of games) {
    const gameId = String(game.id || '').trim();
    const sport = String(game.sport || '').toUpperCase().trim();
    const startTime = String(game.startTime || '').trim();

    if (!gameId) {
      violations.push({ type: 'missing_game_id', source });
    } else if (seen.has(gameId)) {
      violations.push({ type: 'duplicate_game_id', gameId, source });
    } else {
      seen.add(gameId);
    }

    if (!sport) {
      violations.push({ type: 'missing_sport', gameId, source });
    } else {
      sportCounts.set(sport, (sportCounts.get(sport) || 0) + 1);
    }

    if (!startTime) {
      violations.push({ type: 'undefined_start_time', gameId, sport, source });
    }

    const dbLike: DbGame = {
      game_id: gameId,
      sport,
      league: String(game.league || ''),
      home_team_code: String(game.homeTeam?.abbreviation || ''),
      away_team_code: String(game.awayTeam?.abbreviation || ''),
      home_team_name: String(game.homeTeam?.name || ''),
      away_team_name: String(game.awayTeam?.name || ''),
      start_time: startTime,
      status: String(game.status || ''),
      home_score: Number.isFinite(Number(game.homeTeam?.score)) ? Number(game.homeTeam?.score) : null,
      away_score: Number.isFinite(Number(game.awayTeam?.score)) ? Number(game.awayTeam?.score) : null,
      period_label: String(game.period || '') || null,
      clock: String(game.clock || '') || null,
    };

    if (!isRelevantHomepageGameForSport(dbLike, sport, nowMs)) {
      violations.push({
        type: 'stale_or_invalid_game_on_home',
        gameId,
        sport,
        status: game.status,
        startTime,
        source,
      });
    }
  }

  for (const [sport, count] of sportCounts.entries()) {
    if (!(count > 0)) {
      violations.push({ type: 'empty_sport_section', sport, count, source });
    }
  }

  if (violations.length > 0) {
    console.error('[Home][assertions] violation detected', {
      source,
      totalGames: games.length,
      violations,
    });
  }
}

async function fetchGamesData(onPartial?: (games: LiveGame[]) => void): Promise<LiveGame[]> {
  return fetchHomeGamesFromSportSchedules(onPartial);
}

const HOME_SPORT_SCHEDULES = [
  'MLB',
  'NBA',
  'NHL',
  'NFL',
  'SOCCER',
  'NCAAB',
  'NCAAF',
  'MMA',
  'GOLF',
  'NASCAR',
] as const;
const HOME_SCHEDULE_TTL_MS = 8_000;
const HOME_INITIAL_SPORT_TIMEOUT_MS = 1_800;
const HOME_SOCCER_INITIAL_TIMEOUT_MS = 900;

function buildHomeGamesFromEligibleBySport(eligibleBySport: Map<string, DbGame[]>): LiveGame[] {
  const built = runHomeLogicMutation('build-home-games-from-eligible-by-sport', true, () => {
    const deduped = new Map<string, DbGame>();
    for (const rows of eligibleBySport.values()) {
      for (const game of rows) {
        const key = String(game?.game_id || "").trim();
        if (!key) continue;
        const existing = deduped.get(key);
        deduped.set(key, existing ? mergeDbGames(existing, game) : game);
      }
    }
    if (deduped.size === 0) return [] as LiveGame[];
    return sortHomeGamesForDisplay(Array.from(deduped.values()).map(transformDbGameToLiveGame));
  });
  return built ?? [];
}

async function fetchHomeGamesFromSportSchedules(onPartial?: (games: LiveGame[]) => void): Promise<LiveGame[]> {
  const todayEt = getDateInEastern(new Date());
  const nowMs = Date.now();
  const startedAt = Date.now();
  let firstUsefulPublished = false;
  let maxPartialCount = 0;
  const eligibleBySport = new Map<string, DbGame[]>();
  let firstFetchResolvedLogged = false;
  let raceWinnerLogged = false;
  let resolveFirstNonEmptySport: ((winner: { sport: string; games: LiveGame[] }) => void) | null = null;
  const firstNonEmptySportPromise = new Promise<{ sport: string; games: LiveGame[] }>((resolve) => {
    resolveFirstNonEmptySport = resolve;
  });

  const scheduleRequests = HOME_SPORT_SCHEDULES.map(async (sport) => {
    const sportKey = String(sport || "").toUpperCase();
    try {
      const params = new URLSearchParams({
        date: todayEt,
        sport: String(sport || "").toLowerCase(),
        includeOdds: "0",
        fresh: "1",
      });
      const url = `/api/games?${params.toString()}`;
      assertHomeScheduleOnlyEndpoint(url);
      const isSoccer = sportKey === 'SOCCER';
      const timeoutMs = isSoccer ? HOME_SOCCER_INITIAL_TIMEOUT_MS : HOME_INITIAL_SPORT_TIMEOUT_MS;
      const cacheKey = isSoccer
        ? `home:schedule:${todayEt}:${sport}:initial`
        : `home:schedule:${todayEt}:${sport}`;
      const payload = await fetchJsonCached<any>(url, {
        cacheKey,
        ttlMs: HOME_SCHEDULE_TTL_MS,
        timeoutMs,
        bypassCache: false,
        init: { credentials: "include" },
      });
      const rows = Array.isArray(payload?.games) ? (payload.games as DbGame[]) : [];
      if (!firstFetchResolvedLogged) {
        firstFetchResolvedLogged = true;
        console.info('[Home][perf]', {
          first_fetch_resolve_ms: Date.now() - startedAt,
          sport: sportKey,
          fetchedCount: rows.length,
        });
      }
      const totalFetched = rows.length;
      if (sportKey === 'SOCCER') {
        const now = new Date(nowMs);
        const nowLocal = now.toLocaleString();
        const nowUtc = now.toISOString();
        for (const row of rows) {
          const parsed = parseDateSafe(row.start_time);
          console.info('[Home][soccer-time-debug]', {
            game_id: String(row.game_id || ''),
            start_time_raw: String(row.start_time || ''),
            parsed_utc: parsed ? parsed.toISOString() : null,
            parsed_local: parsed ? parsed.toLocaleString() : null,
            now_utc: nowUtc,
            now_local: nowLocal,
          });
        }
      }
      const filtered = rows.filter((row) => isRelevantHomepageGameForSport(row, sportKey, nowMs));
      const afterFilter = filtered.length;
      const reasonIfZero = afterFilter === 0
        ? (totalFetched === 0 ? "no games today" : "filtered by time window")
        : null;
      console.info('[Home][sport-visibility]', {
        sport: sportKey,
        totalFetched,
        afterFilter,
        reasonIfZero,
      });
      if (afterFilter > 0) {
        eligibleBySport.set(sportKey, filtered);
        if (resolveFirstNonEmptySport) {
          const winnerGames = buildHomeGamesFromEligibleBySport(eligibleBySport);
          if (winnerGames.length > 0) {
            resolveFirstNonEmptySport({ sport: sportKey, games: winnerGames });
            resolveFirstNonEmptySport = null;
          }
        }
        if (onPartial) {
          const partialGames = buildHomeGamesFromEligibleBySport(eligibleBySport);
          if (partialGames.length > 0 && partialGames.length >= maxPartialCount) {
            maxPartialCount = partialGames.length;
            if (!firstUsefulPublished) {
              firstUsefulPublished = true;
              console.info('[Home][perf]', {
                first_useful_games_ms: Date.now() - startedAt,
                sportsReady: Array.from(eligibleBySport.keys()),
                gamesCount: partialGames.length,
              });
            }
            onPartial(partialGames);
          }
        }
      }
    } catch (error) {
      if (!firstFetchResolvedLogged) {
        firstFetchResolvedLogged = true;
        console.info('[Home][perf]', {
          first_fetch_resolve_ms: Date.now() - startedAt,
          sport: sportKey,
          fetchedCount: 0,
          reason: String((error as Error)?.message || 'fetch failed'),
        });
      }
      if (sportKey === 'SOCCER') {
        console.info('[Home][soccer-initial-skip]', {
          reason: String((error as Error)?.message || 'soccer fetch failed'),
          timeoutMs: HOME_SOCCER_INITIAL_TIMEOUT_MS,
        });
      }
      console.info('[Home][sport-visibility]', {
        sport: sportKey,
        totalFetched: 0,
        afterFilter: 0,
        reasonIfZero: "no games today",
      });
    }
  });

  const allSettledPromise = (async (): Promise<LiveGame[]> => {
    await Promise.allSettled(scheduleRequests);

    if (eligibleBySport.size === 0) return [] as LiveGame[];

    // Keep Home fast: transform schedule-level rows only, no detail calls.
    const transformed = buildHomeGamesFromEligibleBySport(eligibleBySport);

    // MLB scoreboard feeds can omit Top/Bot context; patch live rows from play-by-play.
    const mlbLiveNeedingInning = transformed
      .map((game, idx) => ({ game, idx }))
      .filter(({ game }) => {
        if (String(game.sport || '').toUpperCase() !== 'MLB') return false;
        if (String(game.status || '').toUpperCase() !== 'IN_PROGRESS') return false;
        const periodText = String(game.period || '').trim().toLowerCase();
        return !periodText || /^\d{1,2}$/.test(periodText) || periodText === 'live';
      })
      .slice(0, 6);
    if (mlbLiveNeedingInning.length > 0) {
      const inningLookups = await Promise.allSettled(
        mlbLiveNeedingInning.map(({ game }) => fetchMlbInningLabel(String(game.id || '')))
      );
      inningLookups.forEach((result, i) => {
        if (result.status !== 'fulfilled' || !result.value) return;
        const targetIdx = mlbLiveNeedingInning[i].idx;
        runHomeLogicMutation('apply-mlb-inning-enrichment', true, () => {
          transformed[targetIdx] = { ...transformed[targetIdx], period: result.value, clock: '' };
          return true;
        });
      });
    }

    runHomeRuntimeAssertions(transformed, 'fetchHomeGamesFromSportSchedules');
    return transformed;
  })();

  const firstWinnerOrFinal = await Promise.race([
    firstNonEmptySportPromise.then((winner) => ({ type: 'winner' as const, winner })),
    allSettledPromise.then((games) => ({ type: 'final' as const, games })),
  ]);

  if (firstWinnerOrFinal.type === 'winner' && firstWinnerOrFinal.winner.games.length > 0) {
    if (!raceWinnerLogged) {
      raceWinnerLogged = true;
      console.info('[Home][perf]', {
        first_non_empty_sport_ms: Date.now() - startedAt,
        race_winner_sport: firstWinnerOrFinal.winner.sport,
        initial_games_count: firstWinnerOrFinal.winner.games.length,
      });
    }
    // Continue hydrating remaining sports in background.
    void allSettledPromise.then((finalGames) => {
      if (!onPartial || finalGames.length === 0) return;
      onPartial(finalGames);
    });
    console.info('[Home][perf]', {
      initial_snapshot_ms: Date.now() - startedAt,
      initial_games_count: firstWinnerOrFinal.winner.games.length,
      mode: 'first-valid-sport',
    });
    return firstWinnerOrFinal.winner.games;
  }

  const finalGames = firstWinnerOrFinal.type === 'final'
    ? firstWinnerOrFinal.games
    : await allSettledPromise;
  if (resolveFirstNonEmptySport) {
    resolveFirstNonEmptySport = null;
  }
  return finalGames;
}

// Helper to fetch a single soccer game from the soccer API
async function fetchSoccerGame(gameId: string): Promise<GameData | null> {
  try {
    // Extract the match ID - handle both sr:match: and sr:sport_event: formats
    let matchId = gameId;
    if (gameId.startsWith('sr:sport_event:')) {
      matchId = gameId.replace('sr:sport_event:', 'sr:match:');
    }
    
    const res = await fetchWithTimeout(`/api/soccer/match/${encodeURIComponent(matchId)}`);
    if (!res.ok) return null;
    
    const data = await res.json();
    const match = data.match;
    if (!match) return null;
    
    // Map soccer match data to GameData format
    return {
      game_id: gameId,
      sport: 'soccer',
      home_team_code: match.homeTeam?.abbreviation || match.homeTeam?.name?.substring(0, 3).toUpperCase() || 'TBD',
      away_team_code: match.awayTeam?.abbreviation || match.awayTeam?.name?.substring(0, 3).toUpperCase() || 'TBD',
      home_team_name: match.homeTeam?.name || null,
      away_team_name: match.awayTeam?.name || null,
      home_score: match.homeScore ?? null,
      away_score: match.awayScore ?? null,
      status: match.status || 'SCHEDULED',
      start_time: match.startTime || new Date().toISOString(),
      period_label: match.period || null,
      clock: match.clock || null,
    };
  } catch (e) {
    console.error('[DataHub] Error fetching soccer game:', gameId, e);
    return null;
  }
}

async function fetchWatchboardsData(userId: string | null): Promise<BoardWithGames[]> {
  if (!userId) return [];
  
  const res = await fetchWithTimeout('/api/watchboards/home-preview', {
    headers: { 'x-user-id': userId },
  });
  
  if (!res.ok) return [];
  
  const data = await res.json();
  const boardsData = data.boards || [];
  
  // Find all games that need fetching (soccer games not in sdio_games)
  const gamesToFetch: string[] = [];
  for (const board of boardsData) {
    for (const game of board.games) {
      if (game.needs_fetch && game.game_id.startsWith('sr:')) {
        gamesToFetch.push(game.game_id);
      }
    }
  }
  
  // Fetch soccer games in parallel
  const fetchedGamesMap: Record<string, GameData> = {};
  if (gamesToFetch.length > 0) {
    const uniqueGameIds = [...new Set(gamesToFetch)];
    const fetchResults = await Promise.allSettled(
      uniqueGameIds.map(id => fetchSoccerGame(id))
    );
    
    for (let i = 0; i < uniqueGameIds.length; i++) {
      const result = fetchResults[i];
      if (result.status === 'fulfilled' && result.value) {
        fetchedGamesMap[uniqueGameIds[i]] = result.value;
      }
    }
  }
  
  // Transform boards, replacing placeholder games with fetched data
  return boardsData
    .map((b: { id: number; name: string; gameIds: string[]; games: (GameData & { needs_fetch?: boolean })[] }) => {
      const games = b.games.map(g => {
        // If this game was fetched, use the fetched data
        if (g.needs_fetch && fetchedGamesMap[g.game_id]) {
          return fetchedGamesMap[g.game_id];
        }
        // Otherwise use the original data (remove needs_fetch flag)
        const { needs_fetch, ...gameData } = g as GameData & { needs_fetch?: boolean };
        return gameData;
      });
      
      return {
        id: b.id,
        name: b.name,
        gameIds: b.gameIds,
        games,
        hasActiveGames: games.some((g: GameData) => {
          const status = g.status?.toLowerCase();
          return status !== 'final' && status !== 'closed';
        }),
      };
    });
}

async function fetchAlertsData(isDemoMode: boolean): Promise<SharpAlert[]> {
  const res = await fetchWithTimeout('/api/line-movement/alerts', {
    headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
  });
  
  if (!res.ok) return [];
  
  const data = await res.json();
  return data.alerts?.slice(0, 10) || [];
}

// ============================================
// LOCALSTORAGE CACHE - Instant navigation
// ============================================

// Cache version - increment to invalidate old caches when data structure changes
const CACHE_VERSION = 'v14'; // Invalidate cache after Home schedule-only stabilization
const CACHE_KEY = `gz_datahub_cache_${CACHE_VERSION}`;
const CACHE_TTL = 45 * 1000; // Keep Home fast while avoiding stale day bleed

interface CachedData {
  games: LiveGame[];
  timestamp: number;
  slateDateEt: string;
}

function loadCachedGames(): LiveGame[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    const data: CachedData = JSON.parse(cached);
    const ageMs = Date.now() - Number(data.timestamp || 0);
    const slateDateEt = String(data.slateDateEt || '').trim();
    const games = Array.isArray(data.games) ? data.games : [];

    if (!(ageMs < CACHE_TTL)) {
      console.info('[DataHub][cache] Rejecting stale local cache by age', { ageMs, ttlMs: CACHE_TTL, key: CACHE_KEY });
      return [];
    }

    const filtered = games.filter((g) => {
      const status = String(g?.status || '').toUpperCase();
      if (status === 'IN_PROGRESS') return true;
      const dbLike: DbGame = {
        game_id: String(g?.id || ''),
        sport: String(g?.sport || ''),
        league: String(g?.league || ''),
        home_team_code: String((g as any)?.homeTeam?.abbreviation || ''),
        away_team_code: String((g as any)?.awayTeam?.abbreviation || ''),
        home_team_name: String((g as any)?.homeTeam?.name || ''),
        away_team_name: String((g as any)?.awayTeam?.name || ''),
        start_time: String(g?.startTime || ''),
        status,
        home_score: Number.isFinite(Number((g as any)?.homeTeam?.score)) ? Number((g as any)?.homeTeam?.score) : null,
        away_score: Number.isFinite(Number((g as any)?.awayTeam?.score)) ? Number((g as any)?.awayTeam?.score) : null,
        period_label: String(g?.period || '') || null,
        clock: String(g?.clock || '') || null,
      };
      return isRelevantHomepageGame(dbLike);
    });
    if (filtered.length !== games.length) {
      console.info('[DataHub][cache] Discarding cache due to freshness guard mismatch', {
        cachedCount: games.length,
        validCount: filtered.length,
        key: CACHE_KEY,
      });
      return [];
    }
    if (filtered.length === 0) {
      console.info('[DataHub][cache] Rejecting cache with no currently valid rows', { count: games.length, key: CACHE_KEY });
      return [];
    }

    console.info('[DataHub][cache] Using local cache for first paint', {
      key: CACHE_KEY,
      ageMs,
      slateDateEt,
      count: filtered.length,
    });
    const sorted = sortHomeGamesForDisplay(filtered);
    runHomeRuntimeAssertions(sorted, 'loadCachedGames');
    return sorted;
  } catch {
    return [];
  }
}

function saveCachedGames(games: LiveGame[]): void {
  try {
    const data: CachedData = {
      games,
      timestamp: Date.now(),
      slateDateEt: getDateInEastern(new Date()),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or disabled
  }
}

// ============================================
// PROVIDER COMPONENT
// ============================================

interface DataHubProviderProps {
  children: ReactNode;
  userId?: string | null;
  isDemoMode?: boolean;
  pollInterval?: number;
  enabled?: boolean;
}

export function DataHubProvider({
  children,
  userId = null,
  isDemoMode = false,
  pollInterval = 30000,
  enabled = true,
}: DataHubProviderProps) {
  // State - initialize with cached data for instant display
  const cachedGames = useMemo(() => loadCachedGames(), []);
  const [games, setGames] = useState<LiveGame[]>(cachedGames);
  const [gamesLoading, setGamesLoading] = useState(cachedGames.length === 0);
  const [gamesError, setGamesError] = useState<string | null>(null);
  
  const [watchboards, setWatchboards] = useState<BoardWithGames[]>([]);
  const [watchboardsLoading, setWatchboardsLoading] = useState(true);
  
  const [alerts, setAlerts] = useState<SharpAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Error backoff state - prevents request flooding when server is struggling
  const consecutiveErrorsRef = useRef(0);
  const backoffMultiplierRef = useRef(1);
  const MAX_BACKOFF_MULTIPLIER = 8; // Max 4 minutes between retries (30s * 8)
  
  // Refs for avoiding stale closure issues
  const userIdRef = useRef(userId);
  const isDemoModeRef = useRef(isDemoMode);
  const gamesRef = useRef<LiveGame[]>(cachedGames);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  
  useEffect(() => {
    userIdRef.current = userId;
    isDemoModeRef.current = isDemoMode;
  }, [userId, isDemoMode]);

  useEffect(() => {
    gamesRef.current = games;
  }, [games]);
  
  // Consolidated fetch function with error backoff
  const fetchAllData = useCallback(async (isManualRefresh = false) => {
    if (fetchInFlightRef.current) {
      await fetchInFlightRef.current;
      return;
    }

    const run = async () => {
      const deferGamesFetch = shouldDeferDataHubGamesFetch();
      const hasCachedGames = gamesRef.current.length > 0;
      const shouldShowBackgroundRefreshing = !isManualRefresh && !deferGamesFetch && hasCachedGames;
      if (isManualRefresh || shouldShowBackgroundRefreshing) setIsRefreshing(true);

      let hasAnyError = false;
      const startedAt = Date.now();
      const timings: Record<string, number> = {};

      const timed = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try {
          return await fn();
        } finally {
          timings[key] = Date.now() - t0;
        }
      };

      // Start secondary feeds, but resolve games first so homepage paints fast.
      const watchboardsPromise = timed('watchboards', () => fetchWatchboardsData(userIdRef.current));
      const alertsPromise = timed('alerts', () => fetchAlertsData(isDemoModeRef.current));
      if (deferGamesFetch) {
        timings.games = 0;
        setGamesLoading(false);
        setGamesError(null);
      } else {
        if (!hasCachedGames) {
          setGamesLoading(true);
        }
        let publishedPartial = false;
        const handlePartialGames = (partialGames: LiveGame[]) => {
          if (!Array.isArray(partialGames) || partialGames.length === 0) return;
          publishedPartial = true;
          setGames(partialGames);
          gamesRef.current = partialGames;
          saveCachedGames(partialGames);
          setGamesError(null);
          setGamesLoading(false);
        };
        const gamesResult = await Promise.allSettled([
          timed('games', () => fetchGamesData(handlePartialGames))
        ]);
        if (gamesResult[0].status === 'fulfilled') {
          const nextGames = Array.isArray(gamesResult[0].value) ? gamesResult[0].value : [];
          if (nextGames.length > 0) {
            setGames(nextGames);
            gamesRef.current = nextGames;
            saveCachedGames(nextGames);
            setGamesError(null);
          } else if (!hasCachedGames && !publishedPartial) {
            setGames([]);
            setGamesError(null);
          } else {
            // Keep the last-known-valid slate if a refresh returns empty.
            setGamesError(null);
          }
        } else {
          const message = (gamesResult[0].reason as Error)?.message || 'Failed to fetch games';
          if (gamesRef.current.length === 0) {
            setGamesError(message);
          } else {
            console.warn('[DataHub] Games refresh failed; preserving last-known-valid slate:', message);
            setGamesError(null);
          }
          hasAnyError = true;
        }
        setGamesLoading(false);
      }

      // Secondary feeds can finish after games are already rendered.
      const [watchboardsResult, alertsResult] = await Promise.allSettled([watchboardsPromise, alertsPromise]);

      if (watchboardsResult.status === 'fulfilled') {
        setWatchboards(watchboardsResult.value);
      } else {
        hasAnyError = true;
      }
      setWatchboardsLoading(false);

      if (alertsResult.status === 'fulfilled') {
        setAlerts(alertsResult.value);
      } else {
        hasAnyError = true;
      }
      setAlertsLoading(false);

      // Track consecutive errors for backoff
      if (hasAnyError) {
        consecutiveErrorsRef.current += 1;
        // Exponential backoff: 1x, 2x, 4x, 8x (max)
        backoffMultiplierRef.current = Math.min(
          Math.pow(2, consecutiveErrorsRef.current - 1),
          MAX_BACKOFF_MULTIPLIER
        );
        console.warn(`[DataHub] Error detected, backoff multiplier: ${backoffMultiplierRef.current}x`);
      } else {
        // Reset backoff on success
        if (consecutiveErrorsRef.current > 0) {
          console.log('[DataHub] Success, resetting backoff');
        }
        consecutiveErrorsRef.current = 0;
        backoffMultiplierRef.current = 1;
      }

      const totalMs = Date.now() - startedAt;
      console.debug('[DataHub][perf]', {
        total_ms: totalMs,
        timings,
        games_count: gamesRef.current.length,
        backoff_multiplier: backoffMultiplierRef.current,
      });

      setLastFetchAt(new Date());
      setIsRefreshing(false);
    };

    fetchInFlightRef.current = run();
    try {
      await fetchInFlightRef.current;
    } finally {
      fetchInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    runHomeLockSelfTest();
  }, []);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchAllData();
    }
  }, [enabled, fetchAllData]);
  
  // Polling interval with dynamic backoff
  useEffect(() => {
    if (!enabled || isPaused || pollInterval <= 0) return;
    
    // Use setTimeout instead of setInterval for dynamic backoff
    let timeoutId: NodeJS.Timeout;
    
    const scheduleFetch = () => {
      const actualInterval = pollInterval * backoffMultiplierRef.current;
      timeoutId = setTimeout(async () => {
        await fetchAllData();
        scheduleFetch(); // Schedule next fetch after this one completes
      }, actualInterval);
    };
    
    scheduleFetch();
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, isPaused, pollInterval, fetchAllData]);
  
  // Actions
  const refresh = useCallback(async () => {
    await fetchAllData(true);
  }, [fetchAllData]);
  
  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);
  
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    // Fire and forget - mark as read on backend
    fetch(`/api/line-movement/alerts/${alertId}/read`, {
      method: 'POST',
      headers: isDemoModeRef.current ? { 'X-Demo-Mode': 'true' } : {},
    }).catch(() => {});
  }, []);
  
  // Computed values
  const hasLiveGames = useMemo(() => 
    games.some(g => g.status === 'IN_PROGRESS'), [games]);
  
  const liveGameCount = useMemo(() => 
    games.filter(g => g.status === 'IN_PROGRESS').length, [games]);
  
  const steamAlertCount = useMemo(() => 
    alerts.filter(a => a.movement.severity === 'steam').length, [alerts]);
  
  const sharpAlertCount = useMemo(() => 
    alerts.filter(a => a.movement.severity === 'sharp').length, [alerts]);
  
  // Context value
  const value = useMemo<DataHubContextValue>(() => ({
    // State
    games,
    gamesLoading,
    gamesError,
    watchboards,
    watchboardsLoading,
    alerts,
    alertsLoading,
    lastFetchAt,
    isRefreshing,
    isPaused,
    // Actions
    refresh,
    pause,
    resume,
    dismissAlert,
    // Computed
    hasLiveGames,
    liveGameCount,
    steamAlertCount,
    sharpAlertCount,
  }), [
    games, gamesLoading, gamesError,
    watchboards, watchboardsLoading,
    alerts, alertsLoading,
    lastFetchAt, isRefreshing, isPaused,
    refresh, pause, resume, dismissAlert,
    hasLiveGames, liveGameCount, steamAlertCount, sharpAlertCount,
  ]);
  
  return (
    <DataHubContext.Provider value={value}>
      {children}
    </DataHubContext.Provider>
  );
}

// ============================================
// HOOKS
// ============================================

/**
 * Main hook for accessing consolidated data hub
 * Returns safe defaults if used outside provider (prevents crashes)
 */
export function useDataHub(): DataHubContextValue {
  const context = useContext(DataHubContext);
  
  // Return safe defaults if context is missing (prevents crash)
  if (!context) {
    console.warn('[useDataHub] Used outside of DataHubProvider - returning safe defaults');
    return {
      games: [],
      gamesLoading: false,
      gamesError: 'DataHubProvider not found',
      watchboards: [],
      watchboardsLoading: false,
      alerts: [],
      alertsLoading: false,
      lastFetchAt: null,
      isRefreshing: false,
      isPaused: false,
      refresh: async () => {},
      pause: () => {},
      resume: () => {},
      dismissAlert: () => {},
      hasLiveGames: false,
      liveGameCount: 0,
      steamAlertCount: 0,
      sharpAlertCount: 0,
    };
  }
  return context;
}

/**
 * Hook for games data only (drop-in replacement for useLiveGames)
 */
export function useDataHubGames() {
  const { games, gamesLoading, gamesError, refresh, lastFetchAt, isRefreshing } = useDataHub();
  return {
    games,
    loading: gamesLoading,
    error: gamesError,
    refetch: refresh,
    refresh,
    lastFetchAt,
    refreshing: isRefreshing,
  };
}

/**
 * Hook for watchboard data only
 */
export function useDataHubWatchboards() {
  const { watchboards, watchboardsLoading, refresh } = useDataHub();
  return {
    boards: watchboards,
    loading: watchboardsLoading,
    refresh,
  };
}

/**
 * Hook for alerts data only
 */
export function useDataHubAlerts() {
  const { alerts, alertsLoading, dismissAlert, steamAlertCount, sharpAlertCount } = useDataHub();
  return {
    alerts,
    loading: alertsLoading,
    dismissAlert,
    steamCount: steamAlertCount,
    sharpCount: sharpAlertCount,
  };
}

export default DataHubProvider;
