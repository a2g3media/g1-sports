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
import { useDemoAuth } from '@/react-app/contexts/DemoAuthContext';
import {
  homeDataLockDevLog,
  reconcileAcceptedHomeWatchboardPayload,
  shouldDiscardStaleHomePayload,
  shouldDiscardStaleHomeWatchboardPayload,
  summarizeHomePayload,
} from '@/react-app/lib/homeLockRules';

const DEBUG_LOG_ENDPOINT = "http://127.0.0.1:7738/ingest/3f0629af-a99a-4780-a8a2-f41a5bc25b15";
const DEBUG_SESSION_ID = "05f1a6";

function sendDebugLog(payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}): void {
  // #region agent log
  fetch(DEBUG_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      ...payload,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

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

interface WatchboardChangeDetail {
  source?: string;
  action?: string;
  itemId?: string;
  boardId?: number | null;
  tempBoardId?: number | null;
  boardName?: string;
  mutationTs?: number;
  beforeCount?: number;
  afterCount?: number;
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
  const status = String(game.status || '').toUpperCase();
  if (normalizedSport !== 'SOCCER') {
    // Keep Home dense and predictable: include valid same-day rows for all non-soccer sports.
    if (HOME_LIVE_STATUSES.has(status)) return true;
    if (status === 'POSTPONED' || status === 'CANCELED' || status === 'CANCELLED') return false;
    if (HOME_FINAL_STATUSES.has(status)) {
      const finalRef = resolveFinalReferenceTime(game);
      return finalRef ? isTodayLocalOrUtc(finalRef, new Date(nowMs)) : false;
    }
    const start = parseDateSafe(game.start_time);
    if (!start) return false;
    return isTodayLocalOrUtc(start, new Date(nowMs));
  }

  // Temporary soccer override:
  // - keep LIVE rows
  // - keep all scheduled rows for today (local/UTC), regardless of time window
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

const DATAHUB_FETCH_TIMEOUT_MS = 20000;
const WATCHBOARD_MISSING_HYDRATE_LIMIT = 6;
const WATCHBOARD_MISSING_HYDRATE_TIMEOUT_MS = 3500;

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
  spread_home?: number | null;
  total?: number | null;
  moneyline_home?: number | null;
  moneyline_away?: number | null;
  mlHome?: number | null;
  mlAway?: number | null;
  oddsHome?: number | null;
  oddsAway?: number | null;
  lines?: {
    spread?: number | { home?: number | null; away?: number | null; home_line?: number | null; away_line?: number | null } | null;
    total?: number | { line?: number | null } | null;
    moneyline?: {
      home?: number | null;
      away?: number | null;
      home_price?: number | null;
      away_price?: number | null;
    } | null;
  } | null;
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
    spread: pickNum(
      base.spread,
      base.spread_home,
      incoming.spread,
      incoming.spread_home
    ) as number | null | undefined,
    overUnder: pickNum(
      base.overUnder,
      base.total,
      incoming.overUnder,
      incoming.total
    ) as number | null | undefined,
    moneylineHome: pickNum(
      base.moneylineHome,
      base.moneyline_home,
      base.mlHome,
      base.oddsHome,
      incoming.moneylineHome,
      incoming.moneyline_home,
      incoming.mlHome,
      incoming.oddsHome
    ) as number | null | undefined,
    moneylineAway: pickNum(
      base.moneylineAway,
      base.moneyline_away,
      base.mlAway,
      base.oddsAway,
      incoming.moneylineAway,
      incoming.moneyline_away,
      incoming.mlAway,
      incoming.oddsAway
    ) as number | null | undefined,
    spread_home: pickNum(base.spread_home, incoming.spread_home) as number | null | undefined,
    total: pickNum(base.total, incoming.total) as number | null | undefined,
    moneyline_home: pickNum(base.moneyline_home, incoming.moneyline_home) as number | null | undefined,
    moneyline_away: pickNum(base.moneyline_away, incoming.moneyline_away) as number | null | undefined,
    mlHome: pickNum(base.mlHome, incoming.mlHome) as number | null | undefined,
    mlAway: pickNum(base.mlAway, incoming.mlAway) as number | null | undefined,
    oddsHome: pickNum(base.oddsHome, incoming.oddsHome) as number | null | undefined,
    oddsAway: pickNum(base.oddsAway, incoming.oddsAway) as number | null | undefined,
    lines: (incoming.lines ?? base.lines) || null,
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

  const asFiniteNumber = (value: unknown): number | undefined => {
    if (value === null || value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const pickNum = (...values: unknown[]): number | undefined => {
    for (const value of values) {
      const n = asFiniteNumber(value);
      if (n !== undefined) return n;
    }
    return undefined;
  };
  const lineSpread = game.lines?.spread;
  const lineSpreadObj = (lineSpread && typeof lineSpread === 'object') ? lineSpread as Record<string, unknown> : null;
  const lineTotal = game.lines?.total;
  const lineTotalObj = (lineTotal && typeof lineTotal === 'object') ? lineTotal as Record<string, unknown> : null;
  const lineMoneyline = game.lines?.moneyline || null;
  const normalizedSpread = pickNum(
    game.spread,
    game.spread_home,
    lineSpread,
    lineSpreadObj?.home,
    lineSpreadObj?.home_line
  );
  const normalizedTotal = pickNum(
    game.overUnder,
    game.total,
    lineTotal,
    lineTotalObj?.line
  );
  const normalizedHomeML = pickNum(
    game.moneylineHome,
    game.moneyline_home,
    game.mlHome,
    game.oddsHome,
    lineMoneyline?.home,
    lineMoneyline?.home_price
  );
  const normalizedAwayML = pickNum(
    game.moneylineAway,
    game.moneyline_away,
    game.mlAway,
    game.oddsAway,
    lineMoneyline?.away,
    lineMoneyline?.away_price
  );
  const normalizedOdds = {
    spread: normalizedSpread ?? null,
    total: normalizedTotal ?? null,
    homeML: normalizedHomeML ?? null,
    awayML: normalizedAwayML ?? null,
  };

  return {
    id: game.game_id || `gen_${game.sport}_${game.home_team_code || 'H'}_${game.away_team_code || 'A'}_${game.start_time || Date.now()}`,
    league: game.league || null,
    homeTeam: {
      name: getTeamShortName(game.home_team_name),
      abbreviation: homeAbbr,
      score: homeScore,
      logo: homeDirectLogo || getTeamOrCountryLogoUrl(homeAbbr, sportKey, game.league, {
        teamName: game.home_team_name || '',
        soccerContext: {
          homeTeam: game.home_team_name || '',
          awayTeam: game.away_team_name || '',
          homeCode: homeAbbr,
          awayCode: awayAbbr,
        },
      }) || '',
    },
    awayTeam: {
      name: getTeamShortName(game.away_team_name),
      abbreviation: awayAbbr,
      score: awayScore,
      logo: awayDirectLogo || getTeamOrCountryLogoUrl(awayAbbr, sportKey, game.league, {
        teamName: game.away_team_name || '',
        soccerContext: {
          homeTeam: game.home_team_name || '',
          awayTeam: game.away_team_name || '',
          homeCode: homeAbbr,
          awayCode: awayAbbr,
        },
      }) || '',
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
    odds: (normalizedSpread !== undefined || normalizedTotal !== undefined || normalizedHomeML !== undefined || normalizedAwayML !== undefined) ? {
      spreadHome: normalizedSpread ?? null,
      total: normalizedTotal ?? null,
      moneylineHome: normalizedHomeML ?? null,
      moneylineAway: normalizedAwayML ?? null,
      movementSpread: null,
      movementTotal: null,
    } : undefined,
    normalizedOdds,
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
  const yesterdayEt = getDateInEastern(new Date(Date.now() - 24 * 60 * 60 * 1000));
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
      let filledRows = filtered;
      if (sportKey === "NBA" && filtered.length < 3) {
        try {
          const fallbackParams = new URLSearchParams({
            date: yesterdayEt,
            sport: "nba",
            includeOdds: "0",
            fresh: "1",
          });
          const fallbackUrl = `/api/games?${fallbackParams.toString()}`;
          assertHomeScheduleOnlyEndpoint(fallbackUrl);
          const fallbackPayload = await fetchJsonCached<any>(fallbackUrl, {
            cacheKey: `home:schedule:${yesterdayEt}:nba:recent-finals`,
            ttlMs: HOME_SCHEDULE_TTL_MS,
            timeoutMs: HOME_INITIAL_SPORT_TIMEOUT_MS,
            bypassCache: false,
            init: { credentials: "include" },
          });
          const fallbackRows = Array.isArray(fallbackPayload?.games) ? (fallbackPayload.games as DbGame[]) : [];
          const recentFinals = fallbackRows
            .filter((row) => HOME_FINAL_STATUSES.has(String(row.status || "").toUpperCase()))
            .sort((a, b) => {
              const ta = resolveFinalReferenceTime(a)?.getTime() ?? Number.NEGATIVE_INFINITY;
              const tb = resolveFinalReferenceTime(b)?.getTime() ?? Number.NEGATIVE_INFINITY;
              return tb - ta;
            });
          if (recentFinals.length > 0) {
            const seen = new Set<string>(filtered.map((row) => String(row.game_id || "").trim()).filter(Boolean));
            const needed = 3 - filtered.length;
            const additions: DbGame[] = [];
            for (const row of recentFinals) {
              const key = String(row.game_id || "").trim();
              if (!key || seen.has(key)) continue;
              seen.add(key);
              additions.push(row);
              if (additions.length >= needed) break;
            }
            if (additions.length > 0) {
              filledRows = [...filtered, ...additions];
            }
          }
        } catch (fallbackError) {
          console.warn("[Home][NBA-fill] Failed to load recent finals fallback", {
            reason: String((fallbackError as Error)?.message || "fallback fetch failed"),
          });
        }
      }
      const afterFilter = filledRows.length;
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
        eligibleBySport.set(sportKey, filledRows);
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
          transformed[targetIdx] = { ...transformed[targetIdx], period: result.value ?? transformed[targetIdx].period, clock: '' };
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

async function fetchWatchboardGame(gameId: string): Promise<GameData | null> {
  const toGameData = (raw: any, fallbackId: string): GameData | null => {
    if (!raw || typeof raw !== 'object') return null;
    const homeName = raw.home_team_name || raw.homeTeam?.name || null;
    const awayName = raw.away_team_name || raw.awayTeam?.name || null;
    const homeCode = String(
      raw.home_team_code || raw.home_team || raw.homeTeam?.abbreviation || raw.homeTeam?.code || ''
    ).trim() || getTeamAbbreviation(homeName);
    const awayCode = String(
      raw.away_team_code || raw.away_team || raw.awayTeam?.abbreviation || raw.awayTeam?.code || ''
    ).trim() || getTeamAbbreviation(awayName);
    const id = String(raw.game_id || raw.id || raw.provider_game_id || fallbackId || '').trim();
    if (!id) return null;
    return {
      game_id: id,
      sport: String(raw.sport || '').toLowerCase() || 'unknown',
      home_team_code: homeCode || 'TBD',
      away_team_code: awayCode || 'TBD',
      home_team_name: homeName,
      away_team_name: awayName,
      home_score: Number.isFinite(Number(raw.home_score ?? raw.homeTeam?.score)) ? Number(raw.home_score ?? raw.homeTeam?.score) : null,
      away_score: Number.isFinite(Number(raw.away_score ?? raw.awayTeam?.score)) ? Number(raw.away_score ?? raw.awayTeam?.score) : null,
      status: String(raw.status || 'SCHEDULED'),
      start_time: String(raw.start_time || raw.startTime || new Date().toISOString()),
      period_label: raw.period_label || raw.period || null,
      clock: raw.clock || null,
    };
  };

  const tryDirectLookup = async (idCandidate: string): Promise<GameData | null> => {
    const res = await fetchWithTimeout(
      `/api/games/${encodeURIComponent(idCandidate)}?lite=1`,
      undefined,
      WATCHBOARD_MISSING_HYDRATE_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const game = data?.game || data;
    const mapped = toGameData(game, idCandidate);
    if (!mapped) return null;
    const hasTeamData = Boolean(
      (mapped.home_team_name && mapped.away_team_name) ||
      (mapped.home_team_code && mapped.home_team_code !== 'TBD' && mapped.away_team_code && mapped.away_team_code !== 'TBD')
    );
    return hasTeamData ? mapped : null;
  };

  const collectStringValues = (value: unknown, out: string[], depth = 0): void => {
    if (depth > 3 || out.length > 200) return;
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) out.push(normalized);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) collectStringValues(entry, out, depth + 1);
      return;
    }
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStringValues(entry, out, depth + 1);
    }
  };

  try {
    if (gameId.startsWith('sr:match:')) {
      return await fetchSoccerGame(gameId);
    }

    const directCandidates = [gameId];
    const srLike = gameId.match(/^sr_([a-z0-9]+)_(.+)$/i);
    if (srLike) {
      directCandidates.push(`sr:sport_event:${srLike[2]}`);
      directCandidates.push(`sr:match:${srLike[2]}`);
    }
    for (const idCandidate of directCandidates) {
      const found = await tryDirectLookup(idCandidate);
      if (found) return found;
    }

    // Legacy ESPN IDs can still exist in watchboards. Resolve to current canonical rows by scanning sport slate.
    const espnLike = gameId.match(/^espn_([a-z0-9]+)_(.+)$/i);
    if (espnLike) {
      const sport = String(espnLike[1] || '').toLowerCase();
      const token = String(espnLike[2] || '').trim();
      const slateRes = await fetchWithTimeout(`/api/games?sport=${encodeURIComponent(sport)}&includeOdds=0`);
      if (slateRes.ok) {
        const slateData = await slateRes.json();
        const rows = Array.isArray(slateData?.games) ? slateData.games : [];
        for (const row of rows) {
          const values: string[] = [];
          collectStringValues(row, values);
          const hasToken = values.some((v) => v === gameId || v === token || v.includes(token));
          if (!hasToken) continue;
          const mapped = toGameData(row, gameId);
          if (mapped) return mapped;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[DataHub] Error fetching watchboard game:', gameId, error);
    return null;
  }
}

async function fetchWatchboardsData(userId: string | null): Promise<BoardWithGames[]> {
  const resolveStableUserId = (): string | null => {
    const normalized = String(userId || "").trim();
    if (normalized) return normalized;
    if (typeof window === "undefined") return null;
    try {
      const demoModeRaw = localStorage.getItem("demoMode");
      const devRoleRaw = localStorage.getItem("devRole");
      const demoMode = demoModeRaw == null ? true : demoModeRaw === "true";
      const devRole = String(devRoleRaw || "user").toLowerCase();
      if (demoMode && devRole !== "guest") return "demo-user-001";
    } catch {
      // Ignore localStorage access errors and fall through.
    }
    return null;
  };
  const stableUserId = resolveStableUserId();
  if (!stableUserId) return [];
  const startedAt = Date.now();
  let networkRequests = 0;
  const invalidTeamTokens = new Set(["", "TBD", "UNK", "UNKNOWN", "HOME", "AWAY"]);
  const looksLikeRawId = (value: string): boolean => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return true;
    return normalized.startsWith("sr:")
      || normalized.startsWith("sr_")
      || normalized.startsWith("espn_")
      || normalized.includes(":sport_event:")
      || normalized.includes(":match:");
  };
  const isRenderableGame = (game: GameData | undefined | null): game is GameData => {
    if (!game) return false;
    const sport = String(game.sport || "").trim().toLowerCase();
    if (!sport) return false;
    if (String(game.status || "").trim().toUpperCase() === "UNKNOWN") return false;
    const homeCode = String(game.home_team_code || "").trim().toUpperCase();
    const awayCode = String(game.away_team_code || "").trim().toUpperCase();
    if (invalidTeamTokens.has(homeCode) || invalidTeamTokens.has(awayCode)) return false;
    const gameId = String(game.game_id || "").trim();
    const homeName = String(game.home_team_name || "").trim();
    const awayName = String(game.away_team_name || "").trim();
    if (homeName && (homeName === gameId || looksLikeRawId(homeName))) return false;
    if (awayName && (awayName === gameId || looksLikeRawId(awayName))) return false;
    return true;
  };

  networkRequests += 1;
  const res = await fetchWithTimeout('/api/watchboards/home-preview', {
    headers: { 'x-user-id': stableUserId },
  });
  
  if (!res.ok) return [];
  
  const data = await res.json();
  const boardsData = Array.isArray(data?.boards) ? data.boards : [];
  const endpointMeta = data?.meta || {};

  const seenBoardIds = new Set<number>();
  let transformed = boardsData
    .map((b: { id: number; name: string; gameIds: string[]; games: (GameData & { needs_fetch?: boolean })[] }) => {
      const boardId = Number(b?.id);
      const boardName = String(b?.name || "").trim();
      if (!Number.isFinite(boardId) || boardId <= 0 || !boardName || seenBoardIds.has(boardId)) return null;
      seenBoardIds.add(boardId);

      const games = (Array.isArray(b.games) ? b.games : []).map((g) => {
        const { needs_fetch, ...gameData } = g as GameData & { needs_fetch?: boolean };
        return gameData as GameData;
      }).filter(isRenderableGame);
      
      return {
        id: boardId,
        name: boardName,
        gameIds: Array.from(new Set(
          (Array.isArray(b.gameIds) ? b.gameIds : [])
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        )),
        games,
        hasActiveGames: games.some((g: GameData) => {
          const status = g.status?.toLowerCase();
          return status !== 'final' && status !== 'closed';
        }),
      };
    })
    .filter(Boolean) as BoardWithGames[];

  const unresolvedIds = Array.from(new Set(
    transformed.flatMap((board) => {
      const existing = new Set((board.games || []).map((game) => String(game?.game_id || "").trim()));
      return (board.gameIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => id && !existing.has(id));
    })
  ));

  if (unresolvedIds.length > 0) {
    const hydrationCandidates = unresolvedIds.slice(0, WATCHBOARD_MISSING_HYDRATE_LIMIT);
    const hydratedRows = await Promise.allSettled(
      hydrationCandidates.map((id) => fetchWatchboardGame(id))
    );
    const hydratedById = new Map<string, GameData>();
    for (let i = 0; i < hydrationCandidates.length; i += 1) {
      const candidateId = hydrationCandidates[i];
      const entry = hydratedRows[i];
      if (entry?.status !== "fulfilled" || !entry.value) continue;
      const normalizedCandidate = String(candidateId || "").trim();
      const normalizedResolved = String(entry.value.game_id || "").trim();
      if (normalizedCandidate) hydratedById.set(normalizedCandidate, entry.value);
      if (normalizedResolved) hydratedById.set(normalizedResolved, entry.value);
    }
    if (hydratedById.size > 0) {
      transformed = transformed.map((board) => {
        const existing = new Set((board.games || []).map((game) => String(game?.game_id || "").trim()));
        const appendRows: GameData[] = [];
        for (const gameId of board.gameIds || []) {
          const normalized = String(gameId || "").trim();
          if (!normalized || existing.has(normalized)) continue;
          const hydrated = hydratedById.get(normalized);
          if (!hydrated) continue;
          appendRows.push({ ...hydrated, game_id: normalized });
        }
        if (appendRows.length === 0) return board;
        return {
          ...board,
          games: [...board.games, ...appendRows],
        };
      });
    }
  }

  const degradedGames = transformed.reduce((total, board) => {
    return total + board.games.filter((game) => {
      const missingCodes = !game.home_team_code || !game.away_team_code || game.home_team_code === 'TBD' || game.away_team_code === 'TBD' || game.home_team_code === 'UNK' || game.away_team_code === 'UNK';
      const missingNames = !game.home_team_name || !game.away_team_name;
      return missingCodes || missingNames || game.sport === 'unknown';
    }).length;
  }, 0);

  console.info("[DataHub][watchboards][hydrate]", {
    durationMs: Date.now() - startedAt,
    networkRequests,
    boardCount: transformed.length,
    itemCount: transformed.reduce((sum, board) => sum + (board.gameIds?.length || 0), 0),
    degradedGames,
    endpointDurationMs: Number(endpointMeta?.durationMs || 0) || null,
    endpointQueryCount: Number(endpointMeta?.queryCount || 0) || null,
  });
  // #region agent log
  sendDebugLog({
    runId: "syncing-debug-run3",
    hypothesisId: "H5",
    location: "src/react-app/hooks/useDataHub.tsx:fetchWatchboardsData",
    message: "datahub transformed watchboards snapshot",
    data: {
      boardCount: transformed.length,
      boardGameIds: transformed.reduce((sum, board) => sum + (board.gameIds?.length || 0), 0),
      boardGames: transformed.reduce((sum, board) => sum + (board.games?.length || 0), 0),
      unresolvedAfterTransform: transformed.reduce((sum, board) => {
        const existing = new Set((board.games || []).map((g) => String(g?.game_id || "").trim()));
        return sum + (board.gameIds || []).filter((id) => !existing.has(String(id || "").trim())).length;
      }, 0),
      degradedGames,
    },
  });
  // #endregion
  return transformed;
}

async function fetchAlertsData(isDemoMode: boolean): Promise<SharpAlert[]> {
  const res = await fetchWithTimeout('/api/line-movement/alerts', {
    headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
  });
  
  if (!res.ok) return [];
  
  const data = await res.json();
  return data.alerts?.slice(0, 10) || [];
}

function enrichWatchboardsWithLiveGames(boards: BoardWithGames[], liveGames: LiveGame[]): BoardWithGames[] {
  if (!Array.isArray(boards) || boards.length === 0 || !Array.isArray(liveGames) || liveGames.length === 0) {
    return boards;
  }
  const liveMap = new Map<string, LiveGame>();
  for (const game of liveGames) {
    const id = String(game?.id || "").trim();
    if (id) liveMap.set(id, game);
  }
  return boards.map((board) => {
    const hydratedGames = (board.games || []).map((row) => {
      const id = String(row?.game_id || "").trim();
      const unresolved = !row?.home_team_name || !row?.away_team_name || !row?.home_team_code || !row?.away_team_code
        || row.home_team_code === "TBD" || row.away_team_code === "TBD" || row.sport === "unknown";
      if (!id || !unresolved) return row;
      const live = liveMap.get(id);
      if (!live) return row;
      return {
        ...row,
        sport: String(row.sport || live.sport || "").toLowerCase() || row.sport,
        home_team_code: row.home_team_code && row.home_team_code !== "TBD"
          ? row.home_team_code
          : String((live as any)?.homeTeam?.abbreviation || "").trim() || getTeamAbbreviation((live as any)?.homeTeam?.name || ""),
        away_team_code: row.away_team_code && row.away_team_code !== "TBD"
          ? row.away_team_code
          : String((live as any)?.awayTeam?.abbreviation || "").trim() || getTeamAbbreviation((live as any)?.awayTeam?.name || ""),
        home_team_name: row.home_team_name || (live as any)?.homeTeam?.name || row.home_team_name,
        away_team_name: row.away_team_name || (live as any)?.awayTeam?.name || row.away_team_name,
        home_score: row.home_score ?? (Number.isFinite(Number((live as any)?.homeTeam?.score)) ? Number((live as any)?.homeTeam?.score) : row.home_score),
        away_score: row.away_score ?? (Number.isFinite(Number((live as any)?.awayTeam?.score)) ? Number((live as any)?.awayTeam?.score) : row.away_score),
      };
    });
    const presentIds = new Set(
      hydratedGames
        .map((row) => String(row?.game_id || "").trim())
        .filter(Boolean)
    );
    const synthesizedRows = (board.gameIds || [])
      .map((id) => String(id || "").trim())
      .filter((id) => id && !presentIds.has(id))
      .map((id) => {
        const live = liveMap.get(id);
        if (!live) return null;
        return {
          game_id: id,
          sport: String((live as any)?.sport || "").toLowerCase() || "unknown",
          home_team_code: String((live as any)?.homeTeam?.abbreviation || "").trim() || getTeamAbbreviation((live as any)?.homeTeam?.name || ""),
          away_team_code: String((live as any)?.awayTeam?.abbreviation || "").trim() || getTeamAbbreviation((live as any)?.awayTeam?.name || ""),
          home_team_name: String((live as any)?.homeTeam?.name || "").trim() || null,
          away_team_name: String((live as any)?.awayTeam?.name || "").trim() || null,
          home_score: Number.isFinite(Number((live as any)?.homeTeam?.score)) ? Number((live as any)?.homeTeam?.score) : null,
          away_score: Number.isFinite(Number((live as any)?.awayTeam?.score)) ? Number((live as any)?.awayTeam?.score) : null,
          status: String((live as any)?.status || "SCHEDULED").trim() || "SCHEDULED",
          start_time: String((live as any)?.scheduled || (live as any)?.startTime || "").trim(),
          period_label: String((live as any)?.period || "").trim() || null,
          clock: String((live as any)?.clock || "").trim() || null,
        } as BoardWithGames["games"][number];
      })
      .filter(Boolean) as BoardWithGames["games"];
    return {
      ...board,
      games: [...hydratedGames, ...synthesizedRows],
    };
  });
}

function removeWatchboardItemFromBoards(
  boards: BoardWithGames[],
  itemId: string,
  boardId?: number | null
): BoardWithGames[] {
  const normalizedId = String(itemId || "").trim();
  if (!normalizedId) return boards;
  const next = boards.map((board) => {
    if (boardId && board.id !== boardId) return board;
    const gameIds = board.gameIds.filter((id) => String(id || "").trim() !== normalizedId);
    const games = board.games.filter((g) => String(g?.game_id || "").trim() !== normalizedId);
    return {
      ...board,
      gameIds,
      games,
      hasActiveGames: games.some((g) => {
        const status = String(g?.status || "").toLowerCase();
        return status !== "final" && status !== "closed";
      }),
    };
  });
  return next;
}

function addWatchboardItemToBoards(
  boards: BoardWithGames[],
  itemId: string,
  boardId?: number | null
): BoardWithGames[] {
  const normalizedId = String(itemId || "").trim();
  if (!normalizedId || !boardId) return boards;
  return boards.map((board) => {
    if (board.id !== boardId) return board;
    const alreadyInIds = board.gameIds.some((id) => String(id || "").trim() === normalizedId);
    const alreadyInGames = board.games.some((g) => String(g?.game_id || "").trim() === normalizedId);
    if (alreadyInIds) return board;
    return {
      ...board,
      gameIds: alreadyInIds ? board.gameIds : [normalizedId, ...board.gameIds],
      // Keep optimistic item in gameIds for instant state consistency, but avoid
      // injecting degraded pseudo-game rows into user-facing UI.
      games: board.games,
      hasActiveGames: true,
    };
  });
}

function upsertOptimisticBoard(
  boards: BoardWithGames[],
  boardId: number,
  boardName: string
): BoardWithGames[] {
  if (!Number.isFinite(boardId)) return boards;
  const normalizedName = String(boardName || "").trim() || "Watchboard";
  const existing = boards.find((b) => b.id === boardId);
  if (existing) {
    if (existing.name === normalizedName) return boards;
    return boards.map((b) => (b.id === boardId ? { ...b, name: normalizedName } : b));
  }
  return [
    {
      id: boardId,
      name: normalizedName,
      gameIds: [],
      games: [],
      hasActiveGames: false,
    },
    ...boards,
  ];
}

function normalizeBoardName(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function replaceBoardId(
  boards: BoardWithGames[],
  tempBoardId: number,
  nextBoardId: number,
  nextBoardName?: string
): BoardWithGames[] {
  if (!Number.isFinite(tempBoardId) || !Number.isFinite(nextBoardId) || tempBoardId === nextBoardId) {
    return boards;
  }
  let moved: BoardWithGames | null = null;
  const withoutTemp = boards.filter((b) => {
    if (b.id === tempBoardId) {
      moved = b;
      return false;
    }
    return true;
  });
  if (!moved) return withoutTemp;
  const movedBoard = moved;
  const existing = withoutTemp.find((b) => b.id === nextBoardId);
  if (existing) {
    return withoutTemp.map((b) => {
      if (b.id !== nextBoardId) return b;
      const mergedIds = Array.from(new Set([...(b.gameIds || []), ...(movedBoard.gameIds || [])]));
      const mergedGames = [
        ...(b.games || []),
        ...(movedBoard.games || []).filter((g) => !(b.games || []).some((existingGame) => String(existingGame?.game_id || "").trim() === String(g?.game_id || "").trim())),
      ];
      return {
        ...b,
        name: String(nextBoardName || b.name || movedBoard.name || "Watchboard"),
        gameIds: mergedIds,
        games: mergedGames,
        hasActiveGames: mergedGames.some((g) => {
          const status = String(g?.status || "").toLowerCase();
          return status !== "final" && status !== "closed";
        }),
      };
    });
  }
  return [
    {
      ...movedBoard,
      id: nextBoardId,
      name: String(nextBoardName || movedBoard.name || "Watchboard"),
    },
    ...withoutTemp,
  ];
}

function applyOptimisticWatchboardPatches(
  boards: BoardWithGames[],
  tombstones: Set<string>,
  optimisticAddedByBoard: Map<number, Set<string>>,
  optimisticBoardNames: Map<number, string>
): BoardWithGames[] {
  let nextBoards = tombstones.size > 0
    ? boards.map((board) => ({
        ...board,
        gameIds: board.gameIds.filter((id) => !tombstones.has(String(id || "").trim())),
        games: board.games.filter((g) => !tombstones.has(String(g?.game_id || "").trim())),
      }))
    : boards;
  if (optimisticBoardNames.size > 0) {
    for (const [boardId, boardName] of optimisticBoardNames.entries()) {
      if (boardId <= 0) {
        // Temp boards may be created optimistically before backend confirm.
        // If the server already contains the real board name, do not keep a
        // stale temp row alive.
        const normalizedTempName = normalizeBoardName(boardName);
        const hasMatchingServerBoard = nextBoards.some((board) => (
          board.id > 0 && normalizeBoardName(board.name) === normalizedTempName
        ));
        if (hasMatchingServerBoard) continue;
        nextBoards = upsertOptimisticBoard(nextBoards, boardId, boardName);
        continue;
      }
      // For confirmed boards, never synthesize rows not present in server payload.
      // This prevents stale optimistic names from resurrecting phantom boards.
      nextBoards = nextBoards.map((board) => (
        board.id === boardId ? { ...board, name: String(boardName || board.name || "Watchboard") } : board
      ));
    }
  }
  if (optimisticAddedByBoard.size === 0) return nextBoards;
  return nextBoards.map((board) => {
    const optimisticIds = optimisticAddedByBoard.get(board.id);
    if (!optimisticIds || optimisticIds.size === 0) return board;
    let nextBoard = board;
    for (const optimisticId of optimisticIds) {
      nextBoard = addWatchboardItemToBoards([nextBoard], optimisticId, board.id)[0] ?? nextBoard;
    }
    return nextBoard;
  });
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
  const { user } = useDemoAuth();
  const effectiveUserId = userId ?? (user?.id ? String(user.id) : null);
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
  const MAX_BACKOFF_MULTIPLIER = 4; // Cap at 2 minutes between retries (30s * 4)
  
  // Refs for avoiding stale closure issues
  const userIdRef = useRef(effectiveUserId);
  const isDemoModeRef = useRef(isDemoMode);
  const gamesRef = useRef<LiveGame[]>(cachedGames);
  const watchboardsRef = useRef<BoardWithGames[]>([]);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const mutationRefreshTimersRef = useRef<number[]>([]);
  const previousWatchboardUserScopeRef = useRef<string | null>(effectiveUserId);
  const tombstoneDeletedIdsRef = useRef<Set<string>>(new Set());
  const tombstoneDeletedBoardIdsRef = useRef<Set<number>>(new Set());
  const optimisticAddedByBoardRef = useRef<Map<number, Set<string>>>(new Map());
  const optimisticBoardNamesRef = useRef<Map<number, string>>(new Map());
  const lastWatchboardMutationAtRef = useRef(0);
  const watchboardMutationVersionRef = useRef(0);
  const latestAcceptedGamesAtRef = useRef(0);
  const latestAcceptedWatchboardsAtRef = useRef(0);
  const lastKnownGoodGamesRef = useRef<LiveGame[]>(cachedGames);
  const lastKnownGoodWatchboardsRef = useRef<BoardWithGames[]>([]);
  // Home data acceptance contract:
  // optimistic local state > latest accepted fresh response > last-known-good snapshot.
  // Never replace visible Home with stale or weaker payloads.
  
  useEffect(() => {
    userIdRef.current = effectiveUserId;
    isDemoModeRef.current = isDemoMode;
  }, [effectiveUserId, isDemoMode]);

  useEffect(() => {
    const prevScope = previousWatchboardUserScopeRef.current;
    if (prevScope === effectiveUserId) return;
    previousWatchboardUserScopeRef.current = effectiveUserId;

    // User scope changed (e.g. guest <-> demo/auth): clear optimistic + stale watchboard state.
    tombstoneDeletedIdsRef.current.clear();
    tombstoneDeletedBoardIdsRef.current.clear();
    optimisticAddedByBoardRef.current.clear();
    optimisticBoardNamesRef.current.clear();
    lastKnownGoodWatchboardsRef.current = [];
    latestAcceptedWatchboardsAtRef.current = 0;
    setWatchboards([]);
    watchboardsRef.current = [];
    setWatchboardsLoading(Boolean(effectiveUserId));
  }, [effectiveUserId]);

  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  useEffect(() => {
    watchboardsRef.current = watchboards;
  }, [watchboards]);

  const acceptHomeGamesPayload = useCallback((nextGames: LiveGame[], acceptedAt: number, source: string) => {
    setGames(nextGames);
    gamesRef.current = nextGames;
    latestAcceptedGamesAtRef.current = acceptedAt;
    if (nextGames.length > 0) {
      lastKnownGoodGamesRef.current = nextGames;
      saveCachedGames(nextGames);
    }
    homeDataLockDevLog("fetch accept", { source, type: "games", count: nextGames.length, acceptedAt });
  }, []);

  const acceptHomeWatchboardsPayload = useCallback((nextWatchboards: BoardWithGames[], acceptedAt: number, source: string) => {
    // Keep optimistic maps bounded to server-visible boards to avoid stale phantom rows.
    const serverBoardIds = new Set(nextWatchboards.map((board) => Number(board.id)));
    const serverBoardNames = new Set(nextWatchboards.map((board) => normalizeBoardName(board.name)));
    for (const [boardId] of optimisticBoardNamesRef.current.entries()) {
      if (boardId > 0 && !serverBoardIds.has(boardId)) {
        optimisticBoardNamesRef.current.delete(boardId);
        continue;
      }
      if (boardId <= 0) {
        const optimisticName = normalizeBoardName(optimisticBoardNamesRef.current.get(boardId));
        if (optimisticName && serverBoardNames.has(optimisticName)) {
          optimisticBoardNamesRef.current.delete(boardId);
          optimisticAddedByBoardRef.current.delete(boardId);
        }
      }
    }
    for (const [boardId, ids] of optimisticAddedByBoardRef.current.entries()) {
      if (ids.size === 0 || (boardId > 0 && !serverBoardIds.has(boardId))) {
        optimisticAddedByBoardRef.current.delete(boardId);
      }
    }

    setWatchboards(nextWatchboards);
    watchboardsRef.current = nextWatchboards;
    latestAcceptedWatchboardsAtRef.current = acceptedAt;
    if (nextWatchboards.length > 0) {
      lastKnownGoodWatchboardsRef.current = nextWatchboards;
    }
    homeDataLockDevLog("fetch accept", {
      source,
      type: "watchboards",
      boards: nextWatchboards.length,
      items: nextWatchboards.reduce((sum, board) => sum + board.gameIds.length, 0),
      acceptedAt,
    });
  }, []);

  // Consolidated fetch function with error backoff
  const fetchAllData = useCallback(async (isManualRefresh = false) => {
    if (fetchInFlightRef.current) {
      await fetchInFlightRef.current;
      return;
    }

    const run = async () => {
      const fetchStartedAt = Date.now();
      const mutationVersionAtFetchStart = watchboardMutationVersionRef.current;
      homeDataLockDevLog("fetch start", {
        source: isManualRefresh ? "manual-refresh" : "poll",
        fetchStartedAt,
        mutationVersionAtFetchStart,
      });
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
          const decision = shouldDiscardStaleHomePayload({
            requestStartedAt: fetchStartedAt,
            latestAcceptedAt: latestAcceptedGamesAtRef.current,
            latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
            incomingSummary: summarizeHomePayload({ games: partialGames }),
            currentVisibleSummary: summarizeHomePayload({ games: gamesRef.current }),
          });
          const discardBecauseWeakPayload = decision.discard && decision.reason === "weaker_payload";
          if (decision.discard && !discardBecauseWeakPayload) {
            homeDataLockDevLog(
              decision.reason === "weaker_payload" ? "reject weak payload" : "fetch discard stale",
              {
                source: "datahub:games:partial",
                reason: decision.reason,
                fetchStartedAt,
                latestAcceptedAt: latestAcceptedGamesAtRef.current,
                latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
              }
            );
            return;
          }
          publishedPartial = true;
          acceptHomeGamesPayload(partialGames, Date.now(), "datahub:games:partial");
          setGamesError(null);
          setGamesLoading(false);
        };
        const gamesResult = await Promise.allSettled([
          timed('games', () => fetchGamesData(handlePartialGames))
        ]);
        if (gamesResult[0].status === 'fulfilled') {
          const nextGames = Array.isArray(gamesResult[0].value) ? gamesResult[0].value : [];
          const decision = shouldDiscardStaleHomePayload({
            requestStartedAt: fetchStartedAt,
            latestAcceptedAt: latestAcceptedGamesAtRef.current,
            latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
            incomingSummary: summarizeHomePayload({ games: nextGames }),
            currentVisibleSummary: summarizeHomePayload({ games: gamesRef.current }),
          });
          if (decision.discard) {
            homeDataLockDevLog(
              decision.reason === "weaker_payload" ? "reject weak payload" : "fetch discard stale",
              {
                source: "datahub:games:final",
                reason: decision.reason,
                fetchStartedAt,
                latestAcceptedAt: latestAcceptedGamesAtRef.current,
                latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
              }
            );
            if (lastKnownGoodGamesRef.current.length > 0 && gamesRef.current.length === 0) {
              acceptHomeGamesPayload(lastKnownGoodGamesRef.current, latestAcceptedGamesAtRef.current || Date.now(), "datahub:games:last-known-good");
            }
            setGamesError(null);
          } else if (nextGames.length > 0) {
            acceptHomeGamesPayload(nextGames, Date.now(), "datahub:games:final");
            setGamesError(null);
          } else if (!hasCachedGames && !publishedPartial && lastKnownGoodGamesRef.current.length === 0) {
            setGames([]);
            gamesRef.current = [];
            latestAcceptedGamesAtRef.current = Date.now();
            setGamesError(null);
          } else {
            // Keep the last-known-valid slate if a refresh returns empty or weak.
            homeDataLockDevLog("reject weak payload", {
              source: "datahub:games:final",
              reason: "empty_after_stable",
              currentCount: gamesRef.current.length,
              lastKnownGoodCount: lastKnownGoodGamesRef.current.length,
            });
            if (lastKnownGoodGamesRef.current.length > 0 && gamesRef.current.length === 0) {
              acceptHomeGamesPayload(lastKnownGoodGamesRef.current, latestAcceptedGamesAtRef.current || Date.now(), "datahub:games:last-known-good");
            }
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
        const nextWatchboardsRaw = enrichWatchboardsWithLiveGames(watchboardsResult.value, gamesRef.current)
          .filter((board) => !tombstoneDeletedBoardIdsRef.current.has(board.id));
        const nextWatchboards = applyOptimisticWatchboardPatches(
          nextWatchboardsRaw,
          tombstoneDeletedIdsRef.current,
          optimisticAddedByBoardRef.current,
          optimisticBoardNamesRef.current
        );
        const reconciledWatchboards = reconcileAcceptedHomeWatchboardPayload(nextWatchboards, watchboardsRef.current);
        const hasCurrentWatchboards = watchboardsRef.current.length > 0;
        const staleByMutation = shouldDiscardStaleHomeWatchboardPayload({
          fetchStartedAt,
          lastMutationAt: lastWatchboardMutationAtRef.current,
          mutationVersionAtFetchStart,
          mutationVersionNow: watchboardMutationVersionRef.current,
        });
        if (staleByMutation) {
          homeDataLockDevLog("fetch discard stale", {
            source: "datahub:fetch-all-data",
            fetchStartedAt,
            lastMutationAt: lastWatchboardMutationAtRef.current,
            mutationVersionAtFetchStart,
            mutationVersionNow: watchboardMutationVersionRef.current,
          });
          console.debug("[DataHub][watchboards-sync] Discarded stale watchboard payload", {
            fetchStartedAt,
            lastMutationAt: lastWatchboardMutationAtRef.current,
            mutationVersionAtFetchStart,
            mutationVersionNow: watchboardMutationVersionRef.current,
          });
          homeDataLockDevLog("fetch discard stale", {
            source: "datahub:watchboards:final",
            reason: "watchboard-mutation-version",
            fetchStartedAt,
          });
        } else {
          const decision = shouldDiscardStaleHomePayload({
            requestStartedAt: fetchStartedAt,
            latestAcceptedAt: latestAcceptedWatchboardsAtRef.current,
            latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
            incomingSummary: summarizeHomePayload({ watchboards: reconciledWatchboards }),
            currentVisibleSummary: summarizeHomePayload({ watchboards: watchboardsRef.current }),
          });
          if (decision.discard) {
            homeDataLockDevLog(
              decision.reason === "weaker_payload" ? "reject weak payload" : "fetch discard stale",
              {
                source: "datahub:watchboards:final",
                reason: decision.reason,
                fetchStartedAt,
                latestAcceptedAt: latestAcceptedWatchboardsAtRef.current,
                latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
              }
            );
            if (watchboardsRef.current.length === 0 && lastKnownGoodWatchboardsRef.current.length > 0) {
              acceptHomeWatchboardsPayload(
                lastKnownGoodWatchboardsRef.current,
                latestAcceptedWatchboardsAtRef.current || Date.now(),
                "datahub:watchboards:last-known-good"
              );
            }
          } else if (hasCurrentWatchboards && reconciledWatchboards.length === 0) {
            console.warn('[DataHub] watchboards cycle returned empty; preserving last-known-good state');
            homeDataLockDevLog("reject weak payload", {
              source: "datahub:watchboards:final",
              reason: "empty_after_stable",
              currentBoards: watchboardsRef.current.length,
            });
            if (watchboardsRef.current.length === 0 && lastKnownGoodWatchboardsRef.current.length > 0) {
              acceptHomeWatchboardsPayload(
                lastKnownGoodWatchboardsRef.current,
                latestAcceptedWatchboardsAtRef.current || Date.now(),
                "datahub:watchboards:last-known-good"
              );
            }
          } else {
            acceptHomeWatchboardsPayload(reconciledWatchboards, Date.now(), "datahub:watchboards:final");
            homeDataLockDevLog("watchboard payload reconciled", {
              boards: reconciledWatchboards.length,
              items: reconciledWatchboards.reduce((sum, board) => sum + board.gameIds.length, 0),
            });
          }
        }
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

  const refreshWatchboardsOnly = useCallback(async (source = "manual", allowEmptyOverride = false) => {
    try {
      const fetchStartedAt = Date.now();
      const mutationVersionAtFetchStart = watchboardMutationVersionRef.current;
      const nextWatchboardsRaw = enrichWatchboardsWithLiveGames(
        await fetchWatchboardsData(userIdRef.current),
        gamesRef.current
      ).filter((board) => !tombstoneDeletedBoardIdsRef.current.has(board.id));
      const nextWatchboards = applyOptimisticWatchboardPatches(
        nextWatchboardsRaw,
        tombstoneDeletedIdsRef.current,
        optimisticAddedByBoardRef.current,
        optimisticBoardNamesRef.current
      );
      const reconciledWatchboards = reconcileAcceptedHomeWatchboardPayload(nextWatchboards, watchboardsRef.current);
      const hasCurrentWatchboards = watchboardsRef.current.length > 0;
      const staleByMutation = shouldDiscardStaleHomeWatchboardPayload({
        fetchStartedAt,
        lastMutationAt: lastWatchboardMutationAtRef.current,
        mutationVersionAtFetchStart,
        mutationVersionNow: watchboardMutationVersionRef.current,
      });
      const normalizedSource = String(source || "").toLowerCase();
      const allowMutationStaleOverride = normalizedSource.includes("create:confirm")
        || normalizedSource.includes("create-confirm")
        || normalizedSource.includes("verify-confirm")
        || normalizedSource.includes("verify:confirmed")
        || normalizedSource.includes("mutation:create-confirm")
        || normalizedSource.includes("mutation:verify-confirm");
      if (staleByMutation && !allowMutationStaleOverride) {
        homeDataLockDevLog("fetch discard stale", {
          source,
          fetchStartedAt,
          lastMutationAt: lastWatchboardMutationAtRef.current,
          mutationVersionAtFetchStart,
          mutationVersionNow: watchboardMutationVersionRef.current,
        });
        console.debug("[DataHub][watchboards-sync] Discarded stale watchboard refresh", {
          source,
          fetchStartedAt,
          lastMutationAt: lastWatchboardMutationAtRef.current,
          mutationVersionAtFetchStart,
          mutationVersionNow: watchboardMutationVersionRef.current,
        });
      } else {
        const decision = shouldDiscardStaleHomePayload({
          requestStartedAt: fetchStartedAt,
          latestAcceptedAt: latestAcceptedWatchboardsAtRef.current,
          latestOptimisticMutationAt: lastWatchboardMutationAtRef.current,
          incomingSummary: summarizeHomePayload({ watchboards: reconciledWatchboards }),
          currentVisibleSummary: summarizeHomePayload({ watchboards: watchboardsRef.current }),
        });
        const shouldAllowWeakPayload = decision.reason === "weaker_payload"
          && allowEmptyOverride;
        if (decision.discard && !shouldAllowWeakPayload) {
          homeDataLockDevLog(
            decision.reason === "weaker_payload" ? "reject weak payload" : "fetch discard stale",
            {
              source,
              reason: decision.reason,
              fetchStartedAt,
              latestAcceptedAt: latestAcceptedWatchboardsAtRef.current,
            }
          );
          if (watchboardsRef.current.length === 0 && lastKnownGoodWatchboardsRef.current.length > 0) {
            acceptHomeWatchboardsPayload(
              lastKnownGoodWatchboardsRef.current,
              latestAcceptedWatchboardsAtRef.current || Date.now(),
              "datahub:watchboards:last-known-good"
            );
          }
        } else if (!allowEmptyOverride && hasCurrentWatchboards && reconciledWatchboards.length === 0) {
          console.warn('[DataHub] watchboards refresh returned empty; preserving last-known-good state', { source });
          homeDataLockDevLog("reject weak payload", {
            source,
            reason: "empty_after_stable",
            currentBoards: watchboardsRef.current.length,
          });
          if (watchboardsRef.current.length === 0 && lastKnownGoodWatchboardsRef.current.length > 0) {
            acceptHomeWatchboardsPayload(
              lastKnownGoodWatchboardsRef.current,
              latestAcceptedWatchboardsAtRef.current || Date.now(),
              "datahub:watchboards:last-known-good"
            );
          }
        } else {
          acceptHomeWatchboardsPayload(reconciledWatchboards, Date.now(), source);
          homeDataLockDevLog("watchboard payload reconciled", {
            source,
            boards: reconciledWatchboards.length,
            items: reconciledWatchboards.reduce((sum, board) => sum + board.gameIds.length, 0),
          });
        }
      }
      setWatchboardsLoading(false);
      console.debug("[DataHub][watchboards-sync]", { source, count: reconciledWatchboards.length });
      // #region agent log
      sendDebugLog({
        runId: "syncing-delay-run1",
        hypothesisId: "H10",
        location: "src/react-app/hooks/useDataHub.tsx:refreshWatchboardsOnly",
        message: "watchboards refresh cycle complete",
        data: {
          source,
          durationMs: Date.now() - fetchStartedAt,
          acceptedBoards: reconciledWatchboards.length,
          acceptedItems: reconciledWatchboards.reduce((sum, board) => sum + board.gameIds.length, 0),
          acceptedHydratedItems: reconciledWatchboards.reduce((sum, board) => sum + board.games.length, 0),
          optimisticBoardsTracked: optimisticAddedByBoardRef.current.size,
          optimisticItemsTracked: Array.from(optimisticAddedByBoardRef.current.values()).reduce((sum, set) => sum + set.size, 0),
          staleByMutation,
        },
      });
      // #endregion
    } catch (err) {
      console.warn("[DataHub] watchboard-only refresh failed", { source, err });
      setWatchboardsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!effectiveUserId) return;
    // Ensure Home watchboards repaint immediately when auth/user scope changes.
    void refreshWatchboardsOnly("user-scope-change", true);
  }, [enabled, effectiveUserId, refreshWatchboardsOnly]);

  useEffect(() => {
    runHomeLockSelfTest();
  }, []);

  // Keep Home watchboards synced with Watchboard mutations (single source: /api/watchboards/home-preview).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const clearMutationRefreshTimers = () => {
      if (mutationRefreshTimersRef.current.length === 0) return;
      for (const timerId of mutationRefreshTimersRef.current) {
        window.clearTimeout(timerId);
      }
      mutationRefreshTimersRef.current = [];
    };
    const onWatchboardChanged = (event: Event) => {
      const detail = (event as CustomEvent<WatchboardChangeDetail>).detail;
      const action = String(detail?.action || "");
      const itemId = String(detail?.itemId || "").trim();
      const boardId = typeof detail?.boardId === "number" ? detail.boardId : null;
      const tempBoardId = typeof detail?.tempBoardId === "number" ? detail.tempBoardId : null;
      const mutationTs = Number(detail?.mutationTs || 0) || Date.now();
      if (action) {
        lastWatchboardMutationAtRef.current = Math.max(lastWatchboardMutationAtRef.current, mutationTs);
        watchboardMutationVersionRef.current += 1;
      }
      if ((action === "remove" || action === "rollback:add") && itemId) {
        tombstoneDeletedIdsRef.current.add(itemId);
        if (boardId && optimisticAddedByBoardRef.current.has(boardId)) {
          const bucket = optimisticAddedByBoardRef.current.get(boardId)!;
          bucket.delete(itemId);
          if (bucket.size === 0) {
            optimisticAddedByBoardRef.current.delete(boardId);
          }
        }
        setWatchboards((prev) => {
          const next = removeWatchboardItemFromBoards(prev, itemId, boardId);
          console.debug("[DataHub][watchboards-sync:optimistic-remove]", {
            source: detail?.source || "watchboards:changed",
            itemId,
            boardId,
            beforeCount: prev.reduce((sum, board) => sum + board.gameIds.length, 0),
            afterCount: next.reduce((sum, board) => sum + board.gameIds.length, 0),
          });
          return next;
        });
        homeDataLockDevLog("optimistic mutation applied", {
          action,
          source: detail?.source || "watchboards:changed",
          boardId,
          itemId,
        });
      } else if ((action === "add" || action === "rollback:remove") && itemId) {
        tombstoneDeletedIdsRef.current.delete(itemId);
        if (boardId) {
          const bucket = optimisticAddedByBoardRef.current.get(boardId) || new Set<string>();
          bucket.add(itemId);
          optimisticAddedByBoardRef.current.set(boardId, bucket);
          // #region agent log
          sendDebugLog({
            runId: "syncing-delay-run1",
            hypothesisId: "H9",
            location: "src/react-app/hooks/useDataHub.tsx:onWatchboardChanged",
            message: "optimistic add queued",
            data: {
              source: detail?.source || "watchboards:changed",
              action,
              boardId,
              itemId,
              optimisticCountForBoard: bucket.size,
              optimisticBoardsTracked: optimisticAddedByBoardRef.current.size,
            },
          });
          // #endregion
          setWatchboards((prev) => {
            const next = addWatchboardItemToBoards(prev, itemId, boardId);
            console.debug("[DataHub][watchboards-sync:optimistic-add]", {
              source: detail?.source || "watchboards:changed",
              itemId,
              boardId,
              beforeCount: prev.reduce((sum, board) => sum + board.gameIds.length, 0),
              afterCount: next.reduce((sum, board) => sum + board.gameIds.length, 0),
            });
            return next;
          });
          homeDataLockDevLog("optimistic mutation applied", {
            action,
            source: detail?.source || "watchboards:changed",
            boardId,
            itemId,
          });
        }
      } else if (action === "create:add" && tempBoardId && itemId) {
        optimisticBoardNamesRef.current.set(tempBoardId, String(detail?.boardName || "Watchboard"));
        const bucket = optimisticAddedByBoardRef.current.get(tempBoardId) || new Set<string>();
        bucket.add(itemId);
        optimisticAddedByBoardRef.current.set(tempBoardId, bucket);
        setWatchboards((prev) => addWatchboardItemToBoards(
          upsertOptimisticBoard(prev, tempBoardId, String(detail?.boardName || "Watchboard")),
          itemId,
          tempBoardId
        ));
        homeDataLockDevLog("optimistic mutation applied", {
          action,
          source: detail?.source || "watchboards:changed",
          tempBoardId,
          itemId,
          boardName: detail?.boardName || "Watchboard",
        });
      } else if (action === "create:confirm" && tempBoardId && boardId) {
        tombstoneDeletedBoardIdsRef.current.delete(boardId);
        const tempBucket = optimisticAddedByBoardRef.current.get(tempBoardId);
        if (tempBucket && tempBucket.size > 0) {
          const realBucket = optimisticAddedByBoardRef.current.get(boardId) || new Set<string>();
          for (const id of tempBucket) realBucket.add(id);
          optimisticAddedByBoardRef.current.set(boardId, realBucket);
        }
        optimisticAddedByBoardRef.current.delete(tempBoardId);
        optimisticBoardNamesRef.current.delete(tempBoardId);
        setWatchboards((prev) => replaceBoardId(prev, tempBoardId, boardId, detail?.boardName));
      } else if (action === "create:rollback" && tempBoardId) {
        optimisticAddedByBoardRef.current.delete(tempBoardId);
        optimisticBoardNamesRef.current.delete(tempBoardId);
        setWatchboards((prev) => prev.filter((board) => board.id !== tempBoardId));
      } else if ((action === "board:delete" || action === "delete-board") && boardId) {
        tombstoneDeletedBoardIdsRef.current.add(boardId);
        optimisticAddedByBoardRef.current.delete(boardId);
        optimisticBoardNamesRef.current.delete(boardId);
        setWatchboards((prev) => prev.filter((board) => board.id !== boardId));
        homeDataLockDevLog("optimistic mutation applied", {
          action,
          source: detail?.source || "watchboards:changed",
          boardId,
        });
      }
      const isOptimisticItemMutation = action === "add"
        || action === "remove"
        || action === "rollback:add"
        || action === "rollback:remove"
        || action === "create:add"
        || action === "create:confirm"
        || action === "create:rollback"
        || action === "board:delete"
        || action === "delete-board";
      const shouldHydrateAfterOptimisticMutation = action === "add"
        || action === "rollback:remove"
        || action === "create:confirm";
      if (!isOptimisticItemMutation || shouldHydrateAfterOptimisticMutation) {
        const allowEmptyOverride = Number(detail?.afterCount ?? -1) === 0;
        const source = detail?.source || "watchboards:changed";
        console.info("[DataHub][watchboards][cache]", {
          event: "invalidate",
          source,
          action,
          allowEmptyOverride,
          optimisticHydrate: shouldHydrateAfterOptimisticMutation,
        });
        // Mutation-driven sync should not wait for general polling/backoff.
        consecutiveErrorsRef.current = 0;
        backoffMultiplierRef.current = 1;
        clearMutationRefreshTimers();
        void refreshWatchboardsOnly(source, allowEmptyOverride);
        if (action === "add" || action === "create:confirm" || action === "verify:confirmed") {
          const burstDelaysMs = [1200, 4500, 10000];
          for (const delayMs of burstDelaysMs) {
            const timerId = window.setTimeout(() => {
              void refreshWatchboardsOnly(`${source}:burst:${delayMs}`, allowEmptyOverride);
            }, delayMs);
            mutationRefreshTimersRef.current.push(timerId);
          }
        }
      }
    };
    window.addEventListener("watchboards:changed", onWatchboardChanged as EventListener);
    return () => {
      window.removeEventListener("watchboards:changed", onWatchboardChanged as EventListener);
      clearMutationRefreshTimers();
    };
  }, [refreshWatchboardsOnly]);

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
