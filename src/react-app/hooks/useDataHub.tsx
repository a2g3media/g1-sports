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

function isRelevantHomepageGame(game: DbGame, todayEt: string): boolean {
  const status = String(game.status || '').toUpperCase();
  const start = game.start_time ? new Date(game.start_time) : null;
  const liveStatuses = new Set(['IN_PROGRESS', 'LIVE', 'INPROGRESS', 'HALFTIME']);
  const scheduledStatuses = new Set(['SCHEDULED', 'NOT_STARTED', 'PRE_GAME', 'PREGAME']);
  const finalStatuses = new Set(['FINAL', 'COMPLETED', 'CLOSED']);

  if (liveStatuses.has(status)) return true;
  if (!start || Number.isNaN(start.getTime())) return false;

  const startMs = start.getTime();
  const now = Date.now();
  const gameEt = getDateInEastern(start);

  // Keep upcoming games for today, but avoid far-future bleed.
  if (scheduledStatuses.has(status)) {
    return gameEt === todayEt
      && startMs >= now - 2 * 60 * 60 * 1000
      && startMs <= now + 24 * 60 * 60 * 1000;
  }

  // Keep finals only from today ET to avoid yesterday bleed-through.
  if (finalStatuses.has(status)) {
    return gameEt === todayEt;
  }

  return false;
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

const DATAHUB_ODDS_HYDRATION_TTL_MS = 30000;
const dataHubOddsHydrationCache = new Map<string, { expiresAt: number; byId: Record<string, any> }>();

function normalizeOddsGameId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function buildOddsLookupCandidates(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normalizeOddsGameId(v);
    if (n) out.add(n);
  };
  add(raw);
  if (raw.startsWith('sr_')) {
    const parts = raw.split('_');
    const tail = parts.slice(2).join('_');
    if (tail) {
      add(`sr:sport_event:${tail}`);
      add(`sr:sport_event:${tail.replace(/_/g, '-')}`);
      add(`sr:match:${tail}`);
      add(tail);
      add(tail.replace(/_/g, '-'));
    }
  }
  if (raw.startsWith('sr:sport_event:')) {
    const tail = raw.replace('sr:sport_event:', '');
    add(tail);
    add(`sr_${tail.replace(/-/g, '_')}`);
    add(tail.replace(/-/g, '_'));
  }
  if (raw.startsWith('sr:match:')) {
    const tail = raw.replace('sr:match:', '');
    add(tail);
    add(`sr_${tail.replace(/-/g, '_')}`);
  }
  return Array.from(out);
}

function normalizeTeamToken(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function ymdPart(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function buildOddsMatchKey(sport: unknown, home: unknown, away: unknown, startTime: unknown): string | null {
  const s = String(sport || '').trim().toUpperCase();
  const h = normalizeTeamToken(home);
  const a = normalizeTeamToken(away);
  const d = ymdPart(startTime);
  if (!s || !h || !a) return null;
  return `match::${s}|${h}|${a}|${d || 'nodate'}`;
}

function summaryStrength(summary: any): number {
  if (!summary || typeof summary !== 'object') return 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? 1 : 0);
  let score = 0;
  score += n(summary?.spread?.home_line);
  score += n(summary?.total?.line);
  score += n(summary?.moneyline?.home_price) + n(summary?.moneyline?.away_price);
  score += n(summary?.first_half?.spread?.home_line) + n(summary?.first_half?.spread?.away_line);
  score += n(summary?.first_half?.total?.line);
  score += n(summary?.first_half?.moneyline?.home_price) + n(summary?.first_half?.moneyline?.away_price);
  return score;
}

function hasNativeOdds(game: DbGame): boolean {
  return (
    game.spread !== null && game.spread !== undefined ||
    game.overUnder !== null && game.overUnder !== undefined ||
    game.moneylineHome !== null && game.moneylineHome !== undefined ||
    game.moneylineAway !== null && game.moneylineAway !== undefined
  );
}

async function hydrateGamesWithOddsSummaries(games: DbGame[], dateStr: string): Promise<DbGame[]> {
  if (!Array.isArray(games) || games.length === 0) return games;
  const nativeCount = games.reduce((acc, g) => acc + (hasNativeOdds(g) ? 1 : 0), 0);
  const nativeCoverage = nativeCount / games.length;
  if (nativeCoverage >= 0.6) return games;

  const ids = games.map((g) => String(g?.game_id || '').trim()).filter(Boolean).slice(0, 60);
  if (ids.length === 0) return games;
  const cacheKey = `${dateStr}|${ids.join('|')}`;
  const cached = dataHubOddsHydrationCache.get(cacheKey);
  const now = Date.now();
  let byId: Record<string, any> = {};
  if (cached && cached.expiresAt > now) {
    byId = cached.byId;
  } else {
    const addSummary = (summary: any) => {
      const strength = summaryStrength(summary);
      if (strength <= 0) return;
      const gameId = String(summary?.game?.game_id || summary?.game_id || '').trim();
      for (const candidate of buildOddsLookupCandidates(gameId)) {
        const prev = byId[candidate];
        if (!prev || strength >= summaryStrength(prev)) byId[candidate] = summary;
      }
      const sportKey = String(summary?.game?.sport || '').toUpperCase();
      const keys = [
        buildOddsMatchKey(sportKey, summary?.game?.home_team_code, summary?.game?.away_team_code, summary?.game?.start_time),
        buildOddsMatchKey(sportKey, summary?.game?.home_team_name, summary?.game?.away_team_name, summary?.game?.start_time),
        buildOddsMatchKey(sportKey, summary?.game?.home_team_code || summary?.game?.home_team_name, summary?.game?.away_team_code || summary?.game?.away_team_name, summary?.game?.start_time),
      ].filter((k): k is string => Boolean(k));
      for (const key of keys) {
        const prev = byId[key];
        if (!prev || strength >= summaryStrength(prev)) byId[key] = summary;
      }
    };

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const chunkResponses = await Promise.allSettled(
      chunks.map(async (chunk) => {
        const qs = new URLSearchParams({ game_ids: chunk.join(','), scope: 'PROD', date: dateStr });
        const res = await fetchWithTimeout(`/api/odds/slate?${qs.toString()}`, undefined, 10000);
        if (!res.ok) return [];
        const payload = await res.json();
        return Array.isArray(payload?.summaries) ? payload.summaries : [];
      })
    );
    for (const response of chunkResponses) {
      if (response.status !== 'fulfilled') continue;
      for (const summary of response.value) addSummary(summary);
    }
    dataHubOddsHydrationCache.set(cacheKey, {
      expiresAt: now + DATAHUB_ODDS_HYDRATION_TTL_MS,
      byId,
    });
  }

  if (Object.keys(byId).length === 0) return games;

  return games.map((game) => {
    const gameId = String(game?.game_id || '').trim();
    const idSummary = buildOddsLookupCandidates(gameId).map((candidate) => byId[candidate]).find(Boolean);
    const matchupCandidates = [
      buildOddsMatchKey(game.sport, game.home_team_code, game.away_team_code, game.start_time),
      buildOddsMatchKey(game.sport, game.home_team_name, game.away_team_name, game.start_time),
      buildOddsMatchKey(game.sport, game.home_team_code || game.home_team_name, game.away_team_code || game.away_team_name, game.start_time),
    ].filter((k): k is string => Boolean(k));
    const matchupSummary = matchupCandidates.map((candidate) => byId[candidate]).find(Boolean);
    const summary = idSummary || matchupSummary;
    if (!summary) return game;
    return {
      ...game,
      spread: game.spread ?? summary?.spread?.home_line ?? null,
      overUnder: game.overUnder ?? summary?.total?.line ?? null,
      moneylineHome: game.moneylineHome ?? summary?.moneyline?.home_price ?? null,
      moneylineAway: game.moneylineAway ?? summary?.moneyline?.away_price ?? null,
    };
  });
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
  if (upper === 'CBB' || upper === 'NCAAM' || upper === 'NCAA_MEN_BASKETBALL') return 'NCAAB';
  if (upper === 'CFB' || upper === 'NCAAFB' || upper === 'NCAA_FOOTBALL') return 'NCAAF';
  if (upper === 'ICEHOCKEY' || upper === 'HOCKEY') return 'NHL';
  if (upper === 'BASEBALL') return 'MLB';
  if (upper === 'BASKETBALL') {
    if (league.includes('NCAA') || league.includes('NCAAB') || league.includes('CBB')) return 'NCAAB';
    return 'NBA';
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

const SOCCER_PRIORITY_TEAMS = [
  'REAL MADRID', 'BARCELONA', 'MANCHESTER CITY', 'LIVERPOOL', 'ARSENAL',
  'MANCHESTER UNITED', 'BAYERN MUNICH', 'PARIS SAINT-GERMAIN', 'PSG',
  'INTER MILAN', 'JUVENTUS', 'AC MILAN', 'ATLETICO MADRID', 'CHELSEA',
  'TOTTENHAM', 'NEWCASTLE UNITED', 'BORUSSIA DORTMUND', 'NAPOLI',
];

const SOCCER_TEAM_ALIASES: Record<string, string> = {
  'FC BARCELONA': 'BARCELONA',
  'BARCA': 'BARCELONA',
  'REAL MADRID CF': 'REAL MADRID',
  'MANCHESTER UTD': 'MANCHESTER UNITED',
  'MAN UTD': 'MANCHESTER UNITED',
  'MAN UNITED': 'MANCHESTER UNITED',
  'MAN CITY': 'MANCHESTER CITY',
  'FC BAYERN MUNICH': 'BAYERN MUNICH',
  'BAYERN': 'BAYERN MUNICH',
  'PARIS SG': 'PARIS SAINT-GERMAIN',
  'PARIS SAINT GERMAIN': 'PARIS SAINT-GERMAIN',
  'INTER': 'INTER MILAN',
  'ATLETICO': 'ATLETICO MADRID',
  'SPURS': 'TOTTENHAM',
  'NEWCASTLE': 'NEWCASTLE UNITED',
  'DORTMUND': 'BORUSSIA DORTMUND',
};

function normalizeSoccerTeamName(value: string | null | undefined): string {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  return SOCCER_TEAM_ALIASES[raw] || raw;
}

function soccerTeamRank(value: string | null | undefined): number {
  const normalized = normalizeSoccerTeamName(value);
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  const exact = SOCCER_PRIORITY_TEAMS.indexOf(normalized);
  if (exact >= 0) return exact;
  const containsIdx = SOCCER_PRIORITY_TEAMS.findIndex((name) =>
    normalized.includes(name) || name.includes(normalized)
  );
  return containsIdx >= 0 ? containsIdx : Number.MAX_SAFE_INTEGER;
}

function soccerMatchPriorityScore(
  homeName?: string | null,
  awayName?: string | null,
  homeCode?: string | null,
  awayCode?: string | null
): number {
  const homeRank = Math.min(soccerTeamRank(homeName), soccerTeamRank(homeCode));
  const awayRank = Math.min(soccerTeamRank(awayName), soccerTeamRank(awayCode));
  const toScore = (rank: number) => (rank === Number.MAX_SAFE_INTEGER ? 0 : (SOCCER_PRIORITY_TEAMS.length - rank));
  return toScore(homeRank) + toScore(awayRank);
}

async function fetchMlbInningLabel(gameId: string): Promise<string | null> {
  if (!gameId) return null;
  try {
    const res = await fetchWithTimeout(`/api/games/${encodeURIComponent(gameId)}/playbyplay`, undefined, 3000);
    if (!res.ok) return null;
    const data = await res.json();
    const plays = Array.isArray(data?.plays) ? data.plays : [];
    const orderedCandidates = [
      data?.lastPlay,
      ...plays,
    ].filter(Boolean);
    const bestPlay = orderedCandidates.find((p: any) =>
      /\b(top|bot|bottom|mid|middle|end|t|b)\b/i.test(String(p?.period || ''))
    ) || orderedCandidates[0] || null;
    const periodRaw = bestPlay?.period;
    const clockRaw = bestPlay?.clock;
    const periodText = periodRaw != null ? String(periodRaw).trim() : '';
    const clockText = clockRaw != null ? String(clockRaw).trim() : '';

    const sideMatch = periodText.match(/\b(top|bot|bottom|mid|middle|end)\b(?:\s+of(?:\s+the)?|\s+the)?[\s:-]*(\d{1,2})(?:st|nd|rd|th)?/i);
    if (sideMatch) {
      const sideRaw = sideMatch[1].toLowerCase();
      const side =
        sideRaw === 'bottom' ? 'Bot'
        : sideRaw === 'middle' ? 'Mid'
        : sideRaw.charAt(0).toUpperCase() + sideRaw.slice(1);
      const inning = Number(sideMatch[2]);
      const outsMatch = clockText.match(/(\d)\s*out/i);
      if (Number.isFinite(inning) && inning > 0) {
        const outsSuffix = outsMatch ? ` • ${outsMatch[1]} Out${outsMatch[1] === '1' ? '' : 's'}` : '';
        return `${side} ${ordinalSuffix(inning)}${outsSuffix}`;
      }
    }

    const numeric = Number(periodText.replace(/[^\d]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      const outsMatch = clockText.match(/(\d)\s*out/i);
      const outsSuffix = outsMatch ? ` • ${outsMatch[1]} Out${outsMatch[1] === '1' ? '' : 's'}` : '';
      return `${ordinalSuffix(numeric)} Inning${outsSuffix}`;
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
      logo: getTeamOrCountryLogoUrl(homeAbbr, sportKey, game.league) || '',
    },
    awayTeam: {
      name: getTeamShortName(game.away_team_name),
      abbreviation: awayAbbr,
      score: awayScore,
      logo: getTeamOrCountryLogoUrl(awayAbbr, sportKey, game.league) || '',
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

async function fetchGamesData(): Promise<LiveGame[]> {
  // Home feed should prioritize true live games across all sports,
  // then include today's upcoming schedule.
  const todayEt = getDateInEastern(new Date());
  const tomorrowEt = getDateInEastern(new Date(Date.now() + 24 * 60 * 60 * 1000));
  // Bundled home-path fetch first, then lightweight live overlay.
  // This reduces home route request fanout from 4 blocking calls to 2.
  const [baseRes, liveRes] = await Promise.allSettled([
    fetchWithTimeout('/api/games?includeOdds=0', undefined, 5000),
    fetchWithTimeout('/api/games/live', undefined, 1500),
  ]);

  const safeJsonGames = async (res: PromiseSettledResult<Response>): Promise<DbGame[]> => {
    if (res.status !== 'fulfilled' || !res.value.ok) return [];
    try {
      const data = await res.value.json();
      return Array.isArray(data?.games) ? data.games : [];
    } catch {
      return [];
    }
  };

  const [baseGamesRaw, liveGamesRaw] = await Promise.all([
    safeJsonGames(baseRes),
    safeJsonGames(liveRes),
  ]);

  // Keep this alias for downstream schedule-driven soccer fallback logic.
  const dayGamesRaw = baseGamesRaw;
  const merged = [...baseGamesRaw, ...liveGamesRaw];
  const deduped = new Map<string, DbGame>();
  for (const game of merged) {
    const key = String(game?.game_id || '').trim();
    if (!key) continue;
    const existing = deduped.get(key);
    deduped.set(key, existing ? mergeDbGames(existing, game) : game);
  }

  let allDedupedGames = Array.from(deduped.values());
  if (allDedupedGames.length === 0) {
    // Defensive fallback: if concurrent endpoint calls timeout or fail together,
    // use the base games feed so homepage never renders a false-empty slate.
    try {
      const fallbackRes = await fetchWithTimeout('/api/games?includeOdds=0', undefined, 5000);
      if (fallbackRes.ok) {
        const fallbackPayload = await fallbackRes.json();
        const fallbackGames = Array.isArray(fallbackPayload?.games) ? fallbackPayload.games as DbGame[] : [];
        if (fallbackGames.length > 0) {
          allDedupedGames = fallbackGames;
        }
      }
    } catch {
      // Keep the original empty set when fallback feed is also unavailable.
    }
  }
  let currentGames = allDedupedGames.filter((g) => isRelevantHomepageGame(g, todayEt));

  // Guardrail: never return a false-empty homepage slate when valid games exist.
  // If strict relevance filtering yields nothing, use a bounded near-term fallback set.
  if (currentGames.length === 0 && allDedupedGames.length > 0) {
    const now = Date.now();
    const fallbackCandidates = allDedupedGames
      .filter((g) => {
        const status = String(g.status || '').toUpperCase();
        if (status === 'IN_PROGRESS' || status === 'LIVE' || status === 'INPROGRESS') return true;
        if (!g.start_time) return false;
        const dt = new Date(g.start_time);
        if (Number.isNaN(dt.getTime())) return false;
        const gameEt = getDateInEastern(dt);
        const ts = dt.getTime();
        // Keep today/tomorrow ET rows in a practical visibility window.
        const isNearDay = gameEt === todayEt || gameEt === tomorrowEt;
        if (!isNearDay) return false;
        if (status === 'FINAL' || status === 'COMPLETED' || status === 'CLOSED') {
          return gameEt === todayEt;
        }
        return ts >= now - 3 * 60 * 60 * 1000 && ts <= now + 36 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const ta = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      });
    currentGames = fallbackCandidates.slice(0, 40);
  }

  // Ensure key sports appear in rotation when they have games today, even if
  // strict relevance filtering excludes them (common with delayed statuses).
  const mustShowSports = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER'];
  const presentSports = new Set(
    currentGames.map((g) => normalizeSportKey(g.sport, g.league))
  );
  const statusRank = (status: string): number => {
    const s = String(status || '').toUpperCase();
    if (s === 'IN_PROGRESS' || s === 'LIVE' || s === 'INPROGRESS') return 0;
    if (s === 'FINAL' || s === 'COMPLETED' || s === 'CLOSED') return 1;
    return 2;
  };

  for (const sport of mustShowSports) {
    if (presentSports.has(sport)) continue;
    const candidates = allDedupedGames
      .filter((g) => normalizeSportKey(g.sport, g.league) === sport)
      .filter((g) => {
        const status = String(g.status || '').toUpperCase();
        if (status === 'IN_PROGRESS' || status === 'LIVE' || status === 'INPROGRESS') return true;
        if (!g.start_time) return false;
        const d = new Date(g.start_time);
        if (Number.isNaN(d.getTime())) return false;
        const ts = d.getTime();
          if (status === 'FINAL' || status === 'COMPLETED' || status === 'CLOSED') {
            return getDateInEastern(d) === todayEt;
          }
        return getDateInEastern(d) === todayEt
          && ts >= Date.now() - 60 * 60 * 1000
          && ts <= Date.now() + 12 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const sr = statusRank(a.status) - statusRank(b.status);
        if (sr !== 0) return sr;
        const ta = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
        // Prefer latest finals and nearest upcoming/live-adjacent starts.
        if (statusRank(a.status) === 1 && statusRank(b.status) === 1) return tb - ta;
        return ta - tb;
      });

    if (candidates.length > 0) {
      currentGames.push(candidates[0]);
      presentSports.add(sport);
    }
  }

  // NCAAB top-up: keep at least 3 games from today ET available for the sport carousel.
  {
    const ncaabExisting = currentGames.filter((g) => normalizeSportKey(g.sport, g.league) === 'NCAAB');
    if (ncaabExisting.length < 3) {
      const existingIds = new Set(ncaabExisting.map((g) => g.game_id));
      const ncaabCandidates = allDedupedGames
        .filter((g) => normalizeSportKey(g.sport, g.league) === 'NCAAB')
        .filter((g) => {
          const status = String(g.status || '').toUpperCase();
          if (status === 'IN_PROGRESS' || status === 'LIVE' || status === 'INPROGRESS') return true;
          if (!g.start_time) return false;
          const d = new Date(g.start_time);
          if (Number.isNaN(d.getTime())) return false;
          const ts = d.getTime();
          if (status === 'FINAL' || status === 'COMPLETED' || status === 'CLOSED') {
            return getDateInEastern(d) === todayEt;
          }
          const sameDay = getDateInEastern(d) === todayEt;
          return sameDay
            && ts >= Date.now() - 60 * 60 * 1000
            && ts <= Date.now() + 12 * 60 * 60 * 1000;
        })
        .sort((a, b) => {
          const ra = statusRank(a.status);
          const rb = statusRank(b.status);
          if (ra !== rb) return ra - rb;
          const ta = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
          // Most recent today-finals first; nearest time first for others.
          if (ra === 1 && rb === 1) return tb - ta;
          return ta - tb;
        });

      const needed = 3 - ncaabExisting.length;
      const additions: DbGame[] = [];
      for (const g of ncaabCandidates) {
        if (additions.length >= needed) break;
        if (existingIds.has(g.game_id)) continue;
        existingIds.add(g.game_id);
        additions.push(g);
      }
      if (additions.length > 0) {
        currentGames.push(...additions);
        presentSports.add('NCAAB');
      }
    }
  }

  // If strict ET filtering leaves NHL/NCAAB empty, use provider day-slate as a
  // controlled fallback (fresh window only) so those sports don't disappear.
  // This keeps cards populated without reopening very old/stale results.
  for (const sport of ['NHL', 'NCAAB']) {
    if (currentGames.some((g) => normalizeSportKey(g.sport, g.league) === sport)) continue;
    const existingIds = new Set(currentGames.map((g) => g.game_id));
    const fallback = dayGamesRaw
      .filter((g) => normalizeSportKey(g.sport, g.league) === sport)
      .filter((g) => {
        const status = String(g.status || '').toUpperCase();
        if (!g.start_time) return status === 'IN_PROGRESS' || status === 'LIVE' || status === 'INPROGRESS';
        const d = new Date(g.start_time);
        if (Number.isNaN(d.getTime())) return false;
        const gameEt = getDateInEastern(d);
        const ts = d.getTime();
        if (sport === 'NCAAB') {
          // NCAA is sensitive to stale day-boundary data; keep strictly today ET.
          if (gameEt !== todayEt) return false;
        }
        // Keep only fresh rows near "now", to avoid stale prior-day drift.
        const withinFreshWindow = ts >= Date.now() - 36 * 60 * 60 * 1000 && ts <= Date.now() + 18 * 60 * 60 * 1000;
        if (!withinFreshWindow) return false;
        return status === 'IN_PROGRESS'
          || status === 'LIVE'
          || status === 'INPROGRESS'
          || status === 'FINAL'
          || status === 'COMPLETED'
          || status === 'CLOSED'
          || status === 'SCHEDULED';
      })
      .sort((a, b) => {
        const ra = statusRank(a.status);
        const rb = statusRank(b.status);
        if (ra !== rb) return ra - rb;
        const ta = a.start_time ? new Date(a.start_time).getTime() : Number.NEGATIVE_INFINITY;
        const tb = b.start_time ? new Date(b.start_time).getTime() : Number.NEGATIVE_INFINITY;
        if (ra === 1 && rb === 1) return tb - ta; // latest finals first
        return ta - tb;
      });

    const additions: DbGame[] = [];
    for (const g of fallback) {
      if (additions.length >= 3) break;
      if (existingIds.has(g.game_id)) continue;
      existingIds.add(g.game_id);
      additions.push(g);
    }
    if (additions.length > 0) {
      currentGames.push(...additions);
      presentSports.add(sport);
    }
  }

  // Soccer homepage cards should always reflect real schedule data from top leagues.
  // Strictly keep today's ET slate (live, upcoming, final).
  // Replace stale aggregate soccer rows with a schedule-driven top 3 selection.
  const allowSoccerDeepHydration = false;
  if (allowSoccerDeepHydration) {
    const soccerLeagueKeys = [
      'la-liga',
      'premier-league',
      'champions-league',
      'serie-a',
      'bundesliga',
      'ligue-1',
      'mls',
      'europa-league',
      'liga-mx',
    ];
    const nowTs = Date.now();
    const soccerResponses = await Promise.allSettled(
      soccerLeagueKeys.map((key) => fetchWithTimeout(`/api/soccer/schedule/${key}?filter=all`, undefined, 6000))
    );
    const soccerPool: DbGame[] = [];

    for (let i = 0; i < soccerResponses.length; i++) {
      const result = soccerResponses[i];
      if (result.status !== 'fulfilled' || !result.value.ok) continue;
      try {
        const data = await result.value.json();
        const matches = Array.isArray(data?.matches) ? data.matches : [];
        for (const match of matches) {
          const startRaw = String(match?.startTime || '');
          if (!startRaw) continue;
          const start = new Date(startRaw);
          if (Number.isNaN(start.getTime())) continue;

          const matchEt = getDateInEastern(start);
          if (matchEt !== todayEt) continue;

          const rawStatus = String(match?.status || '').toLowerCase();
          const startTs = start.getTime();
          const staleScheduled = rawStatus === 'scheduled' && startTs <= nowTs - 2 * 60 * 60 * 1000;
          const status = rawStatus === 'live' || rawStatus === 'inprogress' || rawStatus === 'halftime'
            ? 'IN_PROGRESS'
            : rawStatus === 'closed' || rawStatus === 'ended' || rawStatus === 'finished' || rawStatus === 'final' || staleScheduled
              ? 'FINAL'
              : 'SCHEDULED';

          const homeName = String(match?.homeTeamName || match?.homeTeam || 'Home');
          const awayName = String(match?.awayTeamName || match?.awayTeam || 'Away');
          const homeAbbrRaw = String(match?.homeTeamAbbreviation || match?.homeTeamAbbr || '').trim();
          const awayAbbrRaw = String(match?.awayTeamAbbreviation || match?.awayTeamAbbr || '').trim();
          const rawEventId = String(match?.eventId || `${soccerLeagueKeys[i]}_${homeName}_${awayName}_${startRaw}`);
          const eventId = rawEventId.startsWith('sr:sport_event:')
            ? rawEventId
            : rawEventId.startsWith('soccer_sr:sport_event:')
              ? rawEventId.replace(/^soccer_/, '')
              : rawEventId;

          soccerPool.push({
            game_id: eventId,
            sport: 'SOCCER',
            league: soccerLeagueKeys[i],
            home_team_code: (homeAbbrRaw || homeName.slice(0, 3)).toUpperCase(),
            away_team_code: (awayAbbrRaw || awayName.slice(0, 3)).toUpperCase(),
            home_team_name: homeName,
            away_team_name: awayName,
            start_time: start.toISOString(),
            status,
            home_score: match?.homeScore ?? null,
            away_score: match?.awayScore ?? null,
            period_label: match?.period ? String(match.period) : null,
            clock: match?.clock ? String(match.clock) : null,
            broadcast: null,
            is_overtime: false,
          });
        }
      } catch {}
    }

    if (soccerPool.length > 0) {
      const dedupedSoccer = Array.from(
        soccerPool.reduce((acc, game) => {
          if (!acc.has(game.game_id)) acc.set(game.game_id, game);
          return acc;
        }, new Map<string, DbGame>()).values()
      );
      const scoreAndSort = (list: DbGame[], descendingTime = false) =>
        list.sort((a, b) => {
          const pa = soccerMatchPriorityScore(a.home_team_name, a.away_team_name, a.home_team_code, a.away_team_code);
          const pb = soccerMatchPriorityScore(b.home_team_name, b.away_team_name, b.home_team_code, b.away_team_code);
          if (pa !== pb) return pb - pa;
          return descendingTime
            ? b.start_time.localeCompare(a.start_time)
            : a.start_time.localeCompare(b.start_time);
        });

      const liveSoccer = scoreAndSort(dedupedSoccer.filter((g) => g.status === 'IN_PROGRESS'));
      const upcomingSoccer = scoreAndSort(
        dedupedSoccer.filter((g) => g.status === 'SCHEDULED' && new Date(g.start_time).getTime() >= nowTs - 30 * 60 * 1000)
      );
      const todayFinalSoccer = scoreAndSort(
        dedupedSoccer.filter((g) => g.status === 'FINAL' && getDateInEastern(new Date(g.start_time)) === todayEt),
        true
      );

      const selectedSoccer: DbGame[] = [];
      const seen = new Set<string>();
      const addFrom = (list: DbGame[]) => {
        for (const game of list) {
          if (selectedSoccer.length >= 3) break;
          if (seen.has(game.game_id)) continue;
          seen.add(game.game_id);
          selectedSoccer.push(game);
        }
      };
      addFrom(liveSoccer);
      addFrom(upcomingSoccer);
      addFrom(todayFinalSoccer);

      if (selectedSoccer.length > 0) {
        for (let i = currentGames.length - 1; i >= 0; i--) {
          if (normalizeSportKey(currentGames[i].sport, currentGames[i].league) === 'SOCCER') {
            currentGames.splice(i, 1);
          }
        }
        currentGames.push(...selectedSoccer);
        presentSports.add('SOCCER');
      }
    }
  }
  
  // Debug: Log sport counts from API
  const sportCounts = currentGames.reduce((acc, g) => {
    const sport = g.sport?.toUpperCase() || 'UNKNOWN';
    acc[sport] = (acc[sport] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('[DataHub] API returned current games by sport:', sportCounts, 'Total:', currentGames.length);
  
  // Debug: Log first 3 games to verify game_id mapping
  console.log('[DataHub] First 3 games from API:', currentGames.slice(0, 3).map(g => ({ 
    game_id: g.game_id, sport: g.sport, status: g.status 
  })));

  // Guardrail: when base feeds lack odds fields, hydrate from odds summaries so cards don't go blank.
  let gamesWithOdds = currentGames;
  try {
    gamesWithOdds = await hydrateGamesWithOddsSummaries(currentGames, todayEt);
  } catch {
    // Keep original games when odds hydration fails.
  }
  
  // Transform all games
  const transformed = gamesWithOdds.map(transformDbGameToLiveGame);

  // MLB live feed frequently lacks inning fields in base game payload.
  // Enrich a small capped subset from play-by-play so cards can show inning.
  const mlbNeedingInning = transformed
    .map((g, idx) => ({ g, idx }))
    .filter(({ g }) =>
      (g.sport || '').toUpperCase() === 'MLB' &&
      g.status === 'IN_PROGRESS' &&
      !String(g.period || '').trim() &&
      !String(g.clock || '').trim()
    )
    .slice(0, 6);

  if (mlbNeedingInning.length > 0) {
    const inningLookups = await Promise.allSettled(
      mlbNeedingInning.map(({ g }) => fetchMlbInningLabel(g.id))
    );
    inningLookups.forEach((result, i) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const targetIdx = mlbNeedingInning[i].idx;
      transformed[targetIdx] = { ...transformed[targetIdx], period: result.value };
    });
  }
  
  // Separate by status for proper sorting
  const liveGames = transformed.filter(g => g.status === 'IN_PROGRESS');
  const scheduledGames = transformed.filter(g => g.status === 'SCHEDULED');
  const finalGames = transformed.filter(g => g.status === 'FINAL');
  
  // Sort scheduled by start time
  scheduledGames.sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
    return timeA - timeB;
  });
  
  // Combine: live first, then scheduled, then finals so sports like NCAAB/Soccer
  // still rotate when their slate is mostly completed.
  const combined = [...liveGames, ...scheduledGames, ...finalGames];

  // Keep all relevant games for sport rotation; do not cap list by diversity helper.
  const sportOrder = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER', 'GOLF', 'MMA'];
  const sportRank = (sport: string): number => {
    const idx = sportOrder.indexOf(normalizeSportKey(sport));
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
  };
  const statusRankForSort = (status: LiveGame['status']): number =>
    status === 'IN_PROGRESS' ? 0 : status === 'SCHEDULED' ? 1 : 2;

  return [...combined].sort((a, b) => {
    const sr = statusRankForSort(a.status) - statusRankForSort(b.status);
    if (sr !== 0) return sr;
    const spr = sportRank(a.sport) - sportRank(b.sport);
    if (spr !== 0) return spr;
    if ((a.sport || '').toUpperCase() === 'SOCCER' && (b.sport || '').toUpperCase() === 'SOCCER') {
      const pa = soccerMatchPriorityScore(a.homeTeam?.name, a.awayTeam?.name, a.homeTeam?.abbreviation, a.awayTeam?.abbreviation);
      const pb = soccerMatchPriorityScore(b.homeTeam?.name, b.awayTeam?.name, b.homeTeam?.abbreviation, b.awayTeam?.abbreviation);
      if (pa !== pb) return pb - pa;
    }
    const ta = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
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
const CACHE_VERSION = 'v12'; // Invalidate cache after UTC/ET day-slate merge fix
const CACHE_KEY = `gz_datahub_cache_${CACHE_VERSION}`;
const CACHE_TTL = 60000; // 1 minute - data is fresh enough to show instantly

interface CachedData {
  games: LiveGame[];
  timestamp: number;
}

function loadCachedGames(): LiveGame[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    const data: CachedData = JSON.parse(cached);
    // Return cached data if it's less than 1 minute old
    if (Date.now() - data.timestamp < CACHE_TTL) {
      return data.games;
    }
    return [];
  } catch {
    return [];
  }
}

function saveCachedGames(games: LiveGame[]): void {
  try {
    const data: CachedData = { games, timestamp: Date.now() };
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
      if (isManualRefresh) setIsRefreshing(true);

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
      const deferGamesFetch = shouldDeferDataHubGamesFetch();
      const gamesResult = await Promise.allSettled([
        deferGamesFetch ? Promise.resolve(gamesRef.current) : timed('games', () => fetchGamesData())
      ]);
      if (deferGamesFetch) {
        timings.games = 0;
      }

      // Process games result first with stale-protection (never overwrite valid with empty/transient failures)
      if (deferGamesFetch) {
        setGamesLoading(false);
        setGamesError(null);
      } else if (gamesResult[0].status === 'fulfilled') {
        const nextGames = Array.isArray(gamesResult[0].value) ? gamesResult[0].value : [];
        if (nextGames.length > 0) {
          setGames(nextGames);
          gamesRef.current = nextGames;
          saveCachedGames(nextGames); // Cache for instant navigation
          setGamesError(null);
        } else if (gamesRef.current.length > 0) {
          console.warn('[DataHub] Empty games refresh ignored; preserving last-known-valid slate.');
          setGamesError(null);
        } else {
          setGames(nextGames);
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
        games_count: gamesResult[0].status === 'fulfilled' && Array.isArray(gamesResult[0].value) ? gamesResult[0].value.length : gamesRef.current.length,
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
