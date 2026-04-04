/**
 * Team Data API Routes
 * Fetches team profiles, standings, schedules, and stats from SportsRadar
 * 
 * ROUTE ORDER MATTERS: More specific routes must come before parameterized routes
 * - /test/:sport (literal "test" prefix)
 * - /:sport/standings (literal "standings" suffix)
 * - /:sport/:teamId/schedule (3 segments)
 * - /:sport/:teamId/stats (3 segments)
 * - /:sport/:teamId (most general - MUST BE LAST)
 */

import { Hono } from 'hono';
import { 
  getSportsRadarProvider,
  fetchStandingsCached,
  fetchTeamProfileCached
} from '../services/sports-data/sportsRadarProvider';
import type { SportKey } from '../services/sports-data/types';
import { getCachedData, makeCacheKey, setCachedData } from '../services/apiCacheService';

type Bindings = {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
  SPORTSRADAR_PROPS_KEY?: string;
};

const teams = new Hono<{ Bindings: Bindings }>();

// Valid sports for team data
const VALID_SPORTS = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB', 'NCAAF'];

type MlbTeamMeta = {
  id: number;
  name?: string;
  teamName?: string;
  locationName?: string;
  abbreviation?: string;
  league?: { id?: number; name?: string };
  division?: { id?: number; name?: string };
};

type MlbLeaderCategoryConfig = {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  leaderCategory: string;
  statGroup: 'hitting' | 'pitching';
  hideZeroValues?: boolean;
};

type NbaLeaderCategoryConfig = {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  propTypes: string[];
};

type NbaSeasonLeaderCategoryConfig = {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  espnCategory: string;
};

type NbaAthleteIndexEntry = {
  athleteId: number;
  displayName: string;
  teamCode: string;
  teamName: string;
  firstName: string;
  lastName: string;
  teamKey: string;
};

type NbaAthleteIndex = {
  byFullName: Map<string, NbaAthleteIndexEntry>;
  roster: NbaAthleteIndexEntry[];
};

const MLB_LEADER_CATEGORIES: MlbLeaderCategoryConfig[] = [
  { key: 'avg', label: 'Batting Average', shortLabel: 'AVG', unit: 'avg', leaderCategory: 'battingAverage', statGroup: 'hitting' },
  { key: 'hits', label: 'Hits', shortLabel: 'H', unit: 'hits', leaderCategory: 'hits', statGroup: 'hitting' },
  { key: 'hr', label: 'Home Runs', shortLabel: 'HR', unit: 'hr', leaderCategory: 'homeRuns', statGroup: 'hitting' },
  { key: 'rbi', label: 'Runs Batted In', shortLabel: 'RBI', unit: 'rbi', leaderCategory: 'runsBattedIn', statGroup: 'hitting' },
  { key: 'era', label: 'ERA', shortLabel: 'ERA', unit: 'era', leaderCategory: 'earnedRunAverage', statGroup: 'pitching', hideZeroValues: true },
  { key: 'whip', label: 'WHIP', shortLabel: 'WHIP', unit: 'whip', leaderCategory: 'walksAndHitsPerInningPitched', statGroup: 'pitching' },
  { key: 'so', label: 'Strikeouts', shortLabel: 'SO', unit: 'so', leaderCategory: 'strikeouts', statGroup: 'pitching' },
  { key: 'wins', label: 'Wins', shortLabel: 'W', unit: 'w', leaderCategory: 'wins', statGroup: 'pitching' },
  { key: 'saves', label: 'Saves', shortLabel: 'SV', unit: 'saves', leaderCategory: 'saves', statGroup: 'pitching' },
];

const NBA_LEADER_CATEGORIES: NbaLeaderCategoryConfig[] = [
  { key: 'ppg', label: 'Points Lines', shortLabel: 'PTS', unit: 'ppg', propTypes: ['POINTS'] },
  { key: 'rpg', label: 'Rebounds Lines', shortLabel: 'REB', unit: 'rpg', propTypes: ['REBOUNDS'] },
  { key: 'apg', label: 'Assists Lines', shortLabel: 'AST', unit: 'apg', propTypes: ['ASSISTS'] },
  { key: 'spg', label: 'Steals Lines', shortLabel: 'STL', unit: 'spg', propTypes: ['STEALS'] },
  { key: 'bpg', label: 'Blocks Lines', shortLabel: 'BLK', unit: 'bpg', propTypes: ['BLOCKS'] },
  { key: 'tpg', label: '3PT Made Lines', shortLabel: '3PM', unit: 'tpg', propTypes: ['THREES', 'THREE_POINTERS', '3PT_MADE', 'THREE_POINTS_MADE'] },
];

const NBA_SEASON_LEADER_CATEGORIES: NbaSeasonLeaderCategoryConfig[] = [
  { key: 'ppg', label: 'Points Per Game', shortLabel: 'PPG', unit: 'ppg', espnCategory: 'pointsPerGame' },
  { key: 'rpg', label: 'Rebounds Per Game', shortLabel: 'RPG', unit: 'rpg', espnCategory: 'reboundsPerGame' },
  { key: 'apg', label: 'Assists Per Game', shortLabel: 'APG', unit: 'apg', espnCategory: 'assistsPerGame' },
  { key: 'spg', label: 'Steals Per Game', shortLabel: 'SPG', unit: 'spg', espnCategory: 'stealsPerGame' },
  { key: 'bpg', label: 'Blocks Per Game', shortLabel: 'BPG', unit: 'bpg', espnCategory: 'blocksPerGame' },
  { key: 'tpg', label: '3-Pointers Made', shortLabel: '3PM', unit: 'tpg', espnCategory: '3PointsMadePerGame' },
];

const NBA_ATHLETE_INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const NBA_LIVE_LEADERS_TTL_MS = 75 * 1000;
const nbaSeasonAthleteIndexCache = new Map<number, { expiresAt: number; data: NbaAthleteIndex }>();
const nbaLiveLeadersCache = new Map<string, {
  expiresAt: number;
  payload: { categories: any[]; errors: string[]; rawEvents: number; rawProps: number };
}>();
const NBA_ESPN_TEAM_MAP_TTL_MS = 6 * 60 * 60 * 1000;
const nbaEspnTeamMapCache = new Map<string, {
  expiresAt: number;
  byAlias: Map<string, string>;
  byEspnId: Map<string, string>;
  byDisplayName: Map<string, string>;
}>();
const NBA_INJURIES_TTL_MS = 90 * 1000;
const nbaInjuriesCache = new Map<string, { expiresAt: number; payload: any[] }>();
const NBA_ESPN_ROSTER_TTL_MS = 6 * 60 * 60 * 1000;
const nbaEspnRosterCache = new Map<string, {
  expiresAt: number;
  byName: Map<string, { playerId: string; headshot: string; jersey: string; position: string }>;
}>();
const NBA_ESPN_GAME_LINE_TTL_MS = 6 * 60 * 60 * 1000;
const nbaEspnGameLineCache = new Map<string, {
  expiresAt: number;
  spreadHome: number | null;
  totalLine: number | null;
}>();

function normalizeUrlToHttps(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
}

function normalizePersonKey(value: unknown): string {
  const raw = String(value || '').trim();
  const reordered = raw.includes(',')
    ? (() => {
        const [last, first] = raw.split(',', 2).map((part) => part.trim());
        return first && last ? `${first} ${last}` : raw;
      })()
    : raw;

  return reordered
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'’`-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTeamKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function fetchJsonSafe(url: string): Promise<any | null> {
  try {
    const res = await fetch(normalizeUrlToHttps(url));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchRefDataMap(refSet: Set<string>, batchSize = 12): Promise<Map<string, any>> {
  const refs = Array.from(refSet).filter(Boolean);
  const out = new Map<string, any>();
  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = refs.slice(i, i + batchSize);
    const entries = await Promise.all(
      batch.map(async (refUrl) => [refUrl, await fetchJsonSafe(refUrl)] as const),
    );
    for (const [refUrl, payload] of entries) {
      out.set(refUrl, payload);
    }
  }
  return out;
}

async function resolveNbaTeamAliasForFallback(
  db: D1Database,
  teamId: string,
  apiKey: string
): Promise<string> {
  const directAlias = String(teamId || '').trim().toUpperCase();
  if (/^[A-Z]{2,4}$/.test(directAlias)) {
    return directAlias;
  }
  try {
    const profile = await fetchTeamProfileCached(db, 'NBA', teamId, apiKey);
    const alias = String(profile?.team?.alias || '').trim().toUpperCase();
    if (alias) return alias;
  } catch {
    // fall through to standings lookup
  }
  try {
    const standings = await fetchStandingsCached(db, 'NBA', apiKey);
    const teams = Array.isArray((standings as any)?.teams) ? (standings as any).teams : [];
    const row = teams.find((t: any) => String(t?.id || '') === String(teamId));
    const alias = String(row?.alias || '').trim().toUpperCase();
    if (alias) return alias;
  } catch {
    // fall through
  }
  return '';
}

async function fetchNbaEspnTeamMaps() {
  const key = 'nba';
  const cached = nbaEspnTeamMapCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  const byAlias = new Map<string, string>();
  const byEspnId = new Map<string, string>();
  const byDisplayName = new Map<string, string>();
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=40');
  if (!res.ok) {
    return {
      expiresAt: Date.now() + 60_000,
      byAlias,
      byEspnId,
      byDisplayName,
    };
  }
  const json: any = await res.json();
  const teams = Array.isArray(json?.sports?.[0]?.leagues?.[0]?.teams)
    ? json.sports[0].leagues[0].teams
    : [];
  for (const wrapped of teams) {
    const team = wrapped?.team || wrapped;
    const teamAlias = String(team?.abbreviation || '').trim().toUpperCase();
    const teamId = String(team?.id || '').trim();
    const displayName = String(team?.displayName || `${team?.location || ''} ${team?.name || ''}`).trim().toLowerCase();
    if (teamAlias && teamId) {
      byAlias.set(teamAlias, teamId);
      byEspnId.set(teamId, teamAlias);
      if (displayName) byDisplayName.set(displayName, teamAlias);
    }
  }
  const payload = {
    expiresAt: Date.now() + NBA_ESPN_TEAM_MAP_TTL_MS,
    byAlias,
    byEspnId,
    byDisplayName,
  };
  nbaEspnTeamMapCache.set(key, payload);
  return payload;
}

async function fetchNbaEspnTeamIdByAlias(alias: string): Promise<string> {
  const maps = await fetchNbaEspnTeamMaps();
  const raw = String(alias || '').trim().toUpperCase();
  if (!raw) return '';
  const ALIAS_FALLBACKS: Record<string, string[]> = {
    NYK: ['NY', 'NYK'],
    WAS: ['WSH', 'WAS'],
    GSW: ['GS', 'GSW'],
    SAS: ['SA', 'SAS'],
    UTA: ['UTAH', 'UTA'],
    NOP: ['NO', 'NOP'],
    PHX: ['PHX', 'PHO'],
  };
  const candidates = [raw, ...(ALIAS_FALLBACKS[raw] || [])];
  for (const candidate of candidates) {
    const id = String(maps.byAlias.get(candidate) || '').trim();
    if (id) return id;
  }
  return '';
}

function parseRecordSummary(summary: string): { wins?: number; losses?: number } {
  const match = String(summary || '').trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return {};
  return { wins: Number(match[1]), losses: Number(match[2]) };
}

async function fetchNbaEspnSplitRecordsByAlias(season: number) {
  const maps = await fetchNbaEspnTeamMaps();
  const byAlias = new Map<string, {
    confWins?: number;
    confLosses?: number;
    homeWins?: number;
    homeLosses?: number;
    awayWins?: number;
    awayLosses?: number;
  }>();
  const standingsUrl = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/types/2/groups/7/standings/0?lang=en&region=us`;
  const res = await fetch(standingsUrl);
  if (!res.ok) return byAlias;
  const json: any = await res.json();
  const rows = Array.isArray(json?.standings) ? json.standings : [];
  for (const row of rows) {
    const teamRef = String(row?.team?.$ref || '').trim();
    const espnTeamId = (teamRef.match(/\/teams\/(\d+)\?/) || [])[1] || '';
    const alias = String(maps.byEspnId.get(espnTeamId) || '').trim().toUpperCase();
    if (!alias) continue;
    const records = Array.isArray(row?.records) ? row.records : [];
    let confWins: number | undefined;
    let confLosses: number | undefined;
    let homeWins: number | undefined;
    let homeLosses: number | undefined;
    let awayWins: number | undefined;
    let awayLosses: number | undefined;
    for (const rec of records) {
      const name = String(rec?.name || '').toLowerCase();
      const summary = String(rec?.summary || rec?.displayValue || '').trim();
      const parsed = parseRecordSummary(summary);
      if (!parsed.wins && parsed.wins !== 0) continue;
      if (name.includes('vs. conf')) {
        confWins = parsed.wins;
        confLosses = parsed.losses;
      } else if (name === 'home') {
        homeWins = parsed.wins;
        homeLosses = parsed.losses;
      } else if (name === 'road' || name === 'away') {
        awayWins = parsed.wins;
        awayLosses = parsed.losses;
      }
    }
    byAlias.set(alias, { confWins, confLosses, homeWins, homeLosses, awayWins, awayLosses });
  }
  return byAlias;
}

async function hydrateNbaStandingsWithEspnSplits(teams: any[], season: number) {
  const maps = await fetchNbaEspnTeamMaps();
  const splitByAlias = await fetchNbaEspnSplitRecordsByAlias(season);
  if (splitByAlias.size === 0) return teams;
  return teams.map((team: any) => {
    const directAlias = String(team?.alias || '').trim().toUpperCase();
    const displayName = `${String(team?.market || '').trim()} ${String(team?.name || '').trim()}`.trim().toLowerCase();
    const alias = directAlias || String(maps.byDisplayName.get(displayName) || '').trim().toUpperCase();
    const split = splitByAlias.get(alias);
    if (!split) return team;
    return {
      ...team,
      alias,
      confWins: Number.isFinite(Number(split.confWins)) ? Number(split.confWins) : team.confWins,
      confLosses: Number.isFinite(Number(split.confLosses)) ? Number(split.confLosses) : team.confLosses,
      homeWins: Number.isFinite(Number(split.homeWins)) ? Number(split.homeWins) : team.homeWins,
      homeLosses: Number.isFinite(Number(split.homeLosses)) ? Number(split.homeLosses) : team.homeLosses,
      awayWins: Number.isFinite(Number(split.awayWins)) ? Number(split.awayWins) : team.awayWins,
      awayLosses: Number.isFinite(Number(split.awayLosses)) ? Number(split.awayLosses) : team.awayLosses,
    };
  });
}

function mapEspnCompetitionToTeamScheduleGame(event: any, teamAlias: string) {
  const parseEspnScore = (value: any): number | null => {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const nested = Number(value?.value ?? value?.displayValue);
    return Number.isFinite(nested) ? nested : null;
  };
  const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const home = competitors.find((c: any) => c?.homeAway === 'home');
  const away = competitors.find((c: any) => c?.homeAway === 'away');
  if (!home || !away) return null;
  const homeAlias = String(home?.team?.abbreviation || '').toUpperCase();
  const awayAlias = String(away?.team?.abbreviation || '').toUpperCase();
  const statusType = String(competition?.status?.type?.name || event?.status?.type?.name || 'scheduled');
  const statusDetail = String(
    competition?.status?.type?.description
      || competition?.status?.type?.shortDetail
      || event?.status?.type?.description
      || event?.status?.type?.shortDetail
      || statusType
  );
  return {
    id: String(event?.id || competition?.id || ''),
    scheduledTime: String(event?.date || competition?.date || ''),
    homeTeam: {
      id: String(home?.team?.id || ''),
      name: String(home?.team?.displayName || home?.team?.name || homeAlias),
      alias: homeAlias,
    },
    awayTeam: {
      id: String(away?.team?.id || ''),
      name: String(away?.team?.displayName || away?.team?.name || awayAlias),
      alias: awayAlias,
    },
    status: {
      name: statusType,
      description: statusDetail,
    },
    venue: String(competition?.venue?.fullName || ''),
    homeScore: parseEspnScore(home?.score),
    awayScore: parseEspnScore(away?.score),
    teamAlias,
  };
}

async function fetchNbaEspnScheduleFallback(alias: string, season?: number) {
  if (!alias) return { games: [] as any[], error: 'Missing NBA alias for ESPN schedule fallback' };
  const espnTeamId = await fetchNbaEspnTeamIdByAlias(alias);
  if (!espnTeamId) return { games: [] as any[], error: `No ESPN team id found for alias ${alias}` };
  const query = season ? `?season=${season}&seasontype=2` : '?seasontype=2';
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/schedule${query}`);
  if (!res.ok) return { games: [] as any[], error: `ESPN Team Schedule API: HTTP ${res.status}` };
  const json: any = await res.json();
  const events = Array.isArray(json?.events) ? json.events : [];
  const games = events
    .map((event: any) => mapEspnCompetitionToTeamScheduleGame(event, alias))
    .filter(Boolean);
  return { games, error: null as string | null };
}

async function fetchNbaEspnEventLineById(eventId: string): Promise<{ spreadHome: number | null; totalLine: number | null }> {
  const key = String(eventId || '').trim();
  if (!key) return { spreadHome: null, totalLine: null };
  const cached = nbaEspnGameLineCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { spreadHome: cached.spreadHome, totalLine: cached.totalLine };
  }
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(key)}`);
    if (!res.ok) {
      console.warn('[Teams API] ESPN summary line lookup failed', { eventId: key, status: res.status });
      return { spreadHome: null, totalLine: null };
    }
    const json: any = await res.json();
    const lineRow = (Array.isArray(json?.pickcenter) ? json.pickcenter[0] : null)
      || (Array.isArray(json?.odds) ? json.odds[0] : null)
      || null;
    const parseNum = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const parseSpreadFromDetails = (value: unknown): number | null => {
      const text = String(value || '').trim();
      if (!text) return null;
      const match = text.match(/([+-]?\d+(?:\.\d+)?)/);
      if (!match) return null;
      const n = Number(match[1]);
      return Number.isFinite(n) ? n : null;
    };
    const spreadHome = parseNum(lineRow?.spread)
      ?? parseNum(lineRow?.pointSpread?.away)
      ?? parseNum(lineRow?.pointSpread?.home)
      ?? parseSpreadFromDetails(lineRow?.details);
    const totalLine = parseNum(lineRow?.overUnder)
      ?? parseNum(lineRow?.total?.line)
      ?? parseNum(lineRow?.pointSpread?.total);
    const payload = {
      expiresAt: Date.now() + NBA_ESPN_GAME_LINE_TTL_MS,
      spreadHome,
      totalLine,
    };
    nbaEspnGameLineCache.set(key, payload);
    return { spreadHome, totalLine };
  } catch {
    console.warn('[Teams API] ESPN summary line lookup threw', { eventId: key });
    return { spreadHome: null, totalLine: null };
  }
}

async function enrichNbaEspnGamesWithSummaryLines(games: any[]): Promise<any[]> {
  if (!Array.isArray(games) || games.length === 0) return games;
  const targets = games.filter((g: any) => (g?.spreadHome == null || g?.totalLine == null) && /^\d{7,}$/.test(String(g?.id || '')));
  if (targets.length === 0) return games;
  const lineById = new Map<string, { spreadHome: number | null; totalLine: number | null }>();
  const prioritizedTargets = [...targets]
    .sort((a: any, b: any) => {
      const ta = new Date(String(a?.scheduledTime || a?.date || '')).getTime();
      const tb = new Date(String(b?.scheduledTime || b?.date || '')).getTime();
      return tb - ta;
    })
    .slice(0, 80);
  await Promise.all(
    prioritizedTargets.map(async (g: any) => {
      const id = String(g?.id || '').trim();
      if (!id) return;
      const line = await withTimeout(fetchNbaEspnEventLineById(id), 6000, { spreadHome: null, totalLine: null });
      lineById.set(id, line);
    })
  );
  return games.map((g: any) => {
    const id = String(g?.id || '').trim();
    const line = lineById.get(id);
    if (!line) return g;
    return {
      ...g,
      spreadHome: g?.spreadHome ?? line.spreadHome,
      totalLine: g?.totalLine ?? line.totalLine,
    };
  });
}

async function enrichNbaGamesWithEspnScheduleBridgeLines(
  db: D1Database,
  games: any[],
  teamId: string,
  selectedSeason: number | undefined,
  apiKey: string
): Promise<any[]> {
  if (!Array.isArray(games) || games.length === 0) return games;
  const missingFinals = games.filter((g: any) => {
    const statusRaw = String(g?.status?.name || g?.status || '').toUpperCase();
    const isFinalish = statusRaw.includes('FINAL') || statusRaw.includes('CLOSED') || statusRaw.includes('COMPLETED');
    return isFinalish && (g?.spreadHome == null || g?.totalLine == null);
  });
  if (missingFinals.length === 0) return games;

  try {
    const alias = await resolveNbaTeamAliasForFallback(db, teamId, apiKey);
    const espnFallback = await fetchNbaEspnScheduleFallback(alias, selectedSeason);
    if (!Array.isArray(espnFallback.games) || espnFallback.games.length === 0) return games;

    const eventIdByComposite = new Map<string, string>();
    for (const row of espnFallback.games) {
      const eventId = String(row?.id || '').trim();
      const day = toDayKey(row?.scheduledTime);
      const homeAlias = String(row?.homeTeamAlias || row?.homeTeam?.alias || '').toUpperCase();
      const awayAlias = String(row?.awayTeamAlias || row?.awayTeam?.alias || '').toUpperCase();
      if (!eventId || !day || !homeAlias || !awayAlias) continue;
      eventIdByComposite.set(`${day}:${homeAlias}:${awayAlias}`, eventId);
    }
    if (eventIdByComposite.size === 0) return games;

    const lineByEventId = new Map<string, { spreadHome: number | null; totalLine: number | null }>();
    for (const row of missingFinals.slice(0, 16)) {
      const day = toDayKey(row?.scheduledTime);
      const homeAlias = String(row?.homeTeamAlias || row?.homeTeam?.alias || '').toUpperCase();
      const awayAlias = String(row?.awayTeamAlias || row?.awayTeam?.alias || '').toUpperCase();
      if (!day || !homeAlias || !awayAlias) continue;
      const eventId = eventIdByComposite.get(`${day}:${homeAlias}:${awayAlias}`);
      if (!eventId || lineByEventId.has(eventId)) continue;
      const line = await withTimeout(
        fetchNbaEspnEventLineById(eventId),
        6000,
        { spreadHome: null, totalLine: null }
      );
      lineByEventId.set(eventId, line);
    }

    if (lineByEventId.size === 0) return games;
    return games.map((g: any) => {
      if (g?.spreadHome != null && g?.totalLine != null) return g;
      const day = toDayKey(g?.scheduledTime);
      const homeAlias = String(g?.homeTeamAlias || g?.homeTeam?.alias || '').toUpperCase();
      const awayAlias = String(g?.awayTeamAlias || g?.awayTeam?.alias || '').toUpperCase();
      if (!day || !homeAlias || !awayAlias) return g;
      const eventId = eventIdByComposite.get(`${day}:${homeAlias}:${awayAlias}`);
      if (!eventId) return g;
      const line = lineByEventId.get(eventId);
      if (!line) return g;
      return {
        ...g,
        spreadHome: g?.spreadHome ?? line.spreadHome ?? null,
        totalLine: g?.totalLine ?? line.totalLine ?? null,
      };
    });
  } catch {
    return games;
  }
}

async function fetchNbaEspnStatsFallback(alias: string, season?: number) {
  if (!alias) return { stats: null as any, rankings: {} as any, error: 'Missing NBA alias for ESPN stats fallback' };
  const espnTeamId = await fetchNbaEspnTeamIdByAlias(alias);
  if (!espnTeamId) return { stats: null as any, rankings: {} as any, error: `No ESPN team id found for alias ${alias}` };
  const query = season ? `?season=${season}&seasontype=2` : '?seasontype=2';
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/statistics${query}`);
  if (!res.ok) return { stats: null as any, rankings: {} as any, error: `ESPN Team Stats API: HTTP ${res.status}` };
  const json: any = await res.json();
  const categories = Array.isArray(json?.results?.stats?.categories) ? json.results.stats.categories : [];
  const statMap = new Map<string, number>();
  for (const category of categories) {
    const rows = Array.isArray(category?.stats) ? category.stats : [];
    for (const row of rows) {
      const name = String(row?.name || '').trim();
      const value = Number(row?.value);
      if (name && Number.isFinite(value)) statMap.set(name, value);
    }
  }
  const stats = {
    pointsPerGame: statMap.get('avgPoints'),
    oppPointsPerGame: undefined,
    reboundsPerGame: statMap.get('avgRebounds'),
    assistsPerGame: statMap.get('avgAssists'),
    fieldGoalPct: Number.isFinite(Number(statMap.get('fieldGoalPct'))) ? Number(statMap.get('fieldGoalPct')) : undefined,
    threePointPct: Number.isFinite(Number(statMap.get('threePointPct'))) ? Number(statMap.get('threePointPct')) : undefined,
    freeThrowPct: Number.isFinite(Number(statMap.get('freeThrowPct'))) ? Number(statMap.get('freeThrowPct')) : undefined,
    turnoversPerGame: statMap.get('avgTurnovers'),
    stealsPerGame: statMap.get('avgSteals'),
    blocksPerGame: statMap.get('avgBlocks'),
  };
  return { stats, rankings: {}, error: null as string | null };
}

async function fetchNbaEspnInjuriesByAlias(alias: string) {
  const key = alias || 'ALL';
  const cached = nbaInjuriesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { injuries: cached.payload, error: null as string | null, source: 'espn_cache' };
  }
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries?limit=300');
  if (!res.ok) return { injuries: [] as any[], error: `ESPN NBA Injuries API: HTTP ${res.status}`, source: 'espn_live' };
  const json: any = await res.json();
  const teams = Array.isArray(json?.injuries) ? json.injuries : [];
  const normalizedAlias = String(alias || '').trim().toUpperCase();
  const injuries = teams
    .flatMap((teamBucket: any) => {
      const teamName = String(teamBucket?.displayName || '').trim();
      const rows = Array.isArray(teamBucket?.injuries) ? teamBucket.injuries : [];
      return rows.map((row: any) => ({ ...row, __teamName: teamName }));
    })
    .filter((row: any) => {
      if (!normalizedAlias) return true;
      const athleteAlias = String(row?.athlete?.team?.abbreviation || '').trim().toUpperCase();
      const teamName = String(row?.__teamName || '').toUpperCase();
      return athleteAlias === normalizedAlias || teamName.includes(normalizedAlias);
    })
    .map((row: any) => ({
      id: String(row?.id || ''),
      playerId: String(row?.athlete?.id || ''),
      playerName: String(row?.athlete?.displayName || row?.athlete?.shortName || 'Unknown Player'),
      teamAlias: String(row?.athlete?.team?.abbreviation || ''),
      teamName: String(row?.athlete?.team?.displayName || row?.__teamName || ''),
      status: String(row?.status || row?.type?.description || 'Unknown'),
      date: String(row?.date || ''),
      detail: String(row?.details?.detail || row?.shortComment || row?.longComment || '').trim(),
      injuryType: String(row?.details?.type || row?.type?.description || ''),
      returnDate: String(row?.details?.returnDate || ''),
      headshot: String(row?.athlete?.headshot?.href || ''),
    }))
    .filter((row: any) => row.playerName);
  nbaInjuriesCache.set(key, {
    expiresAt: Date.now() + NBA_INJURIES_TTL_MS,
    payload: injuries,
  });
  return { injuries, error: null as string | null, source: 'espn_live' };
}

async function fetchNbaEspnRosterHeadshotsByAlias(alias: string) {
  const normalizedAlias = String(alias || '').trim().toUpperCase();
  if (!normalizedAlias) {
    return { byName: new Map<string, { playerId: string; headshot: string; jersey: string; position: string }>() };
  }
  const cached = nbaEspnRosterCache.get(normalizedAlias);
  if (cached && cached.expiresAt > Date.now()) {
    return { byName: cached.byName };
  }
  const espnTeamId = await fetchNbaEspnTeamIdByAlias(normalizedAlias);
  if (!espnTeamId) {
    return { byName: new Map<string, { playerId: string; headshot: string; jersey: string; position: string }>() };
  }
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`);
  if (!res.ok) {
    return { byName: new Map<string, { playerId: string; headshot: string; jersey: string; position: string }>() };
  }
  const json: any = await res.json();
  const athletes = Array.isArray(json?.athletes) ? json.athletes : [];
  const byName = new Map<string, { playerId: string; headshot: string; jersey: string; position: string }>();
  for (const athlete of athletes) {
    const displayName = String(athlete?.displayName || athlete?.fullName || '').trim();
    const key = normalizePersonKey(displayName);
    if (!key) continue;
    byName.set(key, {
      playerId: String(athlete?.id || ''),
      headshot: String(athlete?.headshot?.href || ''),
      jersey: String(athlete?.jersey || ''),
      position: String(athlete?.position?.abbreviation || athlete?.position?.name || ''),
    });
  }
  nbaEspnRosterCache.set(normalizedAlias, {
    expiresAt: Date.now() + NBA_ESPN_ROSTER_TTL_MS,
    byName,
  });
  return { byName };
}

function normalizeNbaPropType(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function buildNbaLeadersFromPropRows(
  props: any[],
  limit: number,
  athleteIndex?: NbaAthleteIndex,
) {
  const categories = NBA_LEADER_CATEGORIES.map((cfg) => {
    const byPlayer = new Map<string, {
      playerId: string;
      name: string;
      teamCode: string;
      teamName: string;
      total: number;
      count: number;
    }>();

    for (const row of props) {
      const normalizedType = normalizeNbaPropType(row?.propType);
      if (!cfg.propTypes.some((token) => normalizedType.includes(token))) continue;
      const lineValue = Number(row?.lineValue);
      if (!Number.isFinite(lineValue) || lineValue <= 0) continue;
      const name = String(row?.playerName || '').trim();
      if (!name) continue;
      const teamName = String(row?.team || '').trim();
      const teamCode = teamName;
      const playerId = String(row?.playerId || `${name}-${teamCode || 'NBA'}`);
      const key = `${playerId}::${teamCode}`;
      const prev = byPlayer.get(key);
      if (prev) {
        prev.total += lineValue;
        prev.count += 1;
      } else {
        byPlayer.set(key, {
          playerId,
          name,
          teamCode,
          teamName,
          total: lineValue,
          count: 1,
        });
      }
    }

    const players = Array.from(byPlayer.values())
      .map((entry, idx) => ({
        playerId: entry.playerId,
        name: entry.name,
        teamCode: entry.teamCode,
        teamName: entry.teamName,
        value: entry.total / Math.max(1, entry.count),
        gamesPlayed: 0,
        sampleValue: entry.count,
        sampleLabel: 'markets',
        rank: idx + 1,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map((player, idx) => {
        const normalizedName = normalizePersonKey(player.name);
        const teamKey = normalizeTeamKey(player.teamName || player.teamCode);
        let indexHit = athleteIndex?.byFullName.get(normalizedName);

        if (!indexHit && athleteIndex && normalizedName && teamKey) {
          const tokens = normalizedName.split(' ').filter(Boolean);
          const oneToken = tokens.length === 1 ? tokens[0] : '';
          if (oneToken) {
            const teamMatches = athleteIndex.roster.filter((athlete) => athlete.teamKey === teamKey);
            // Prefer exact last-name match, then exact first-name match.
            const lastNameMatch = teamMatches.find((athlete) => athlete.lastName === oneToken);
            const firstNameMatch = teamMatches.find((athlete) => athlete.firstName === oneToken);
            indexHit = lastNameMatch || firstNameMatch;
          }
        }

        const athleteId = Number(indexHit?.athleteId || 0);
        const directHeadshotUrl = athleteId > 0
          ? `https://a.espncdn.com/i/headshots/nba/players/full/${athleteId}.png`
          : null;
        const proxiedHeadshotUrl = directHeadshotUrl
          ? `/api/media/player-photo?url=${encodeURIComponent(directHeadshotUrl)}`
          : null;
        return {
          ...player,
          rank: idx + 1,
          playerId: athleteId > 0 ? String(athleteId) : player.playerId,
          name: indexHit?.displayName || player.name,
          teamCode: indexHit?.teamCode || player.teamCode,
          teamName: indexHit?.teamName || player.teamName,
          imageUrl: proxiedHeadshotUrl || undefined,
        };
      });

    return {
      key: cfg.key,
      label: cfg.label,
      shortLabel: cfg.shortLabel,
      unit: cfg.unit,
      qualifierLabel: 'Consensus lines',
      players,
    };
  }).filter((cat) => cat.players.length > 0);

  return categories;
}

async function fetchNbaLeadersFromSportsRadar(playerPropsApiKey: string, limit: number, season: number) {
  const cacheKey = `${season}:${limit}`;
  const cached = nbaLiveLeadersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const provider = getSportsRadarProvider(playerPropsApiKey, null);
  const result = await provider.fetchPlayerPropsByCompetition('NBA', playerPropsApiKey);
  const athleteIndex = await fetchNbaSeasonAthleteIndexFromEspn(season).catch(() => ({
    byFullName: new Map(),
    roster: [],
  }));
  const categories = buildNbaLeadersFromPropRows(result.props || [], limit, athleteIndex);
  const payload = {
    categories,
    errors: result.errors || [],
    rawEvents: Number(result.rawEvents || 0),
    rawProps: Number(result.rawProps || 0),
  };
  nbaLiveLeadersCache.set(cacheKey, {
    expiresAt: Date.now() + NBA_LIVE_LEADERS_TTL_MS,
    payload,
  });
  return payload;
}

async function fetchNbaSeasonAthleteIndexFromEspn(season: number) {
  const cached = nbaSeasonAthleteIndexCache.get(season);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const endpoint = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/types/2/leaders?lang=en&region=us`;
  const leadersJson = await fetchJsonSafe(endpoint);
  const categoriesRaw = Array.isArray(leadersJson?.categories) ? leadersJson.categories : [];
  const refSet = new Set<string>();
  const teamRefSet = new Set<string>();

  for (const category of categoriesRaw) {
    const leaders = Array.isArray(category?.leaders) ? category.leaders : [];
    for (const row of leaders) {
      const athleteRef = String(row?.athlete?.$ref || '').trim();
      const teamRef = String(row?.team?.$ref || '').trim();
      if (athleteRef) refSet.add(athleteRef);
      if (teamRef) {
        refSet.add(teamRef);
        teamRefSet.add(teamRef);
      }
    }
  }

  const refData = await fetchRefDataMap(refSet);

  const rosterAthleteByTeamRef = new Map<string, string[]>();
  for (const teamRef of teamRefSet) {
    const teamJson = refData.get(teamRef);
    const teamAthletesRef = String(
      teamJson?.athletes?.$ref ||
      teamRef.replace(/\/teams\/(\d+)\?.*$/, '/teams/$1/athletes?lang=en&region=us&limit=200'),
    ).trim();
    if (!teamAthletesRef) continue;
    const teamAthletesJson = await fetchJsonSafe(teamAthletesRef);
    const athleteRefs = Array.isArray(teamAthletesJson?.items)
      ? teamAthletesJson.items
          .map((item: any) => String(item?.$ref || '').trim())
          .filter(Boolean)
      : [];
    rosterAthleteByTeamRef.set(teamRef, athleteRefs);
  }

  const rosterAthleteRefs = new Set<string>();
  for (const refs of rosterAthleteByTeamRef.values()) {
    for (const athleteRef of refs) {
      if (!refData.has(athleteRef)) rosterAthleteRefs.add(athleteRef);
    }
  }
  if (rosterAthleteRefs.size > 0) {
    const rosterRefData = await fetchRefDataMap(rosterAthleteRefs);
    for (const [refUrl, payload] of rosterRefData.entries()) {
      refData.set(refUrl, payload);
    }
  }
  const byFullName = new Map<string, NbaAthleteIndexEntry>();
  const roster: NbaAthleteIndexEntry[] = [];

  for (const category of categoriesRaw) {
    const leaders = Array.isArray(category?.leaders) ? category.leaders : [];
    for (const row of leaders) {
      const athleteRef = String(row?.athlete?.$ref || '').trim();
      const teamRef = String(row?.team?.$ref || '').trim();
      const athlete = athleteRef ? refData.get(athleteRef) : null;
      const team = teamRef ? refData.get(teamRef) : null;
      const athleteId = Number(athlete?.id || 0);
      const displayName = String(athlete?.displayName || athlete?.fullName || '').trim();
      const key = normalizePersonKey(displayName);
      if (!key || !athleteId) continue;
      const firstName = normalizePersonKey(athlete?.firstName || displayName.split(' ')[0] || '');
      const lastName = normalizePersonKey(athlete?.lastName || displayName.split(' ').slice(-1)[0] || '');
      const teamName = String(team?.displayName || team?.name || '');
      const entry = {
        athleteId,
        displayName,
        teamCode: String(team?.abbreviation || ''),
        teamName,
        firstName,
        lastName,
        teamKey: normalizeTeamKey(teamName),
      };
      byFullName.set(key, entry);
      roster.push(entry);
    }
  }

  // Add full team roster athletes as fallback for live props name/photo hydration.
  for (const [teamRef, athleteRefs] of rosterAthleteByTeamRef.entries()) {
    const team = refData.get(teamRef);
    for (const athleteRef of athleteRefs) {
      const athlete = refData.get(athleteRef);
      const athleteId = Number(athlete?.id || 0);
      const displayName = String(athlete?.displayName || athlete?.fullName || '').trim();
      const key = normalizePersonKey(displayName);
      if (!key || !athleteId) continue;
      const firstName = normalizePersonKey(athlete?.firstName || displayName.split(' ')[0] || '');
      const lastName = normalizePersonKey(athlete?.lastName || displayName.split(' ').slice(-1)[0] || '');
      const teamName = String(team?.displayName || team?.name || '');
      const entry = {
        athleteId,
        displayName,
        teamCode: String(team?.abbreviation || ''),
        teamName,
        firstName,
        lastName,
        teamKey: normalizeTeamKey(teamName),
      };
      byFullName.set(key, entry);
      roster.push(entry);
    }
  }

  const payload = { byFullName, roster };
  nbaSeasonAthleteIndexCache.set(season, {
    expiresAt: Date.now() + NBA_ATHLETE_INDEX_TTL_MS,
    data: payload,
  });
  return payload;
}

function parseGamesPlayedFromEspnStats(statsJson: any): number {
  const categories = Array.isArray(statsJson?.splits?.categories) ? statsJson.splits.categories : [];
  for (const category of categories) {
    const stats = Array.isArray(category?.stats) ? category.stats : [];
    const gamesPlayed = stats.find((s: any) => String(s?.name || '').toLowerCase() === 'gamesplayed');
    if (gamesPlayed && Number.isFinite(Number(gamesPlayed.value))) {
      return Number(gamesPlayed.value);
    }
  }
  return 0;
}

async function fetchNbaSeasonLeadersFromEspn(season: number, limit: number) {
  const endpoint = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/types/2/leaders?lang=en&region=us`;
  const leadersJson = await fetchJsonSafe(endpoint);
  const categoriesRaw = Array.isArray(leadersJson?.categories) ? leadersJson.categories : [];

  const refSet = new Set<string>();
  for (const cfg of NBA_SEASON_LEADER_CATEGORIES) {
    const cat = categoriesRaw.find((row: any) => String(row?.name || '') === cfg.espnCategory);
    const leaders = Array.isArray(cat?.leaders) ? cat.leaders.slice(0, Math.max(10, limit * 3)) : [];
    for (const row of leaders) {
      const athleteRef = String(row?.athlete?.$ref || '').trim();
      const teamRef = String(row?.team?.$ref || '').trim();
      const statsRef = String(row?.statistics?.$ref || '').trim();
      if (athleteRef) refSet.add(athleteRef);
      if (teamRef) refSet.add(teamRef);
      if (statsRef) refSet.add(statsRef);
    }
  }

  const refData = await fetchRefDataMap(refSet);

  const parsedCategories = NBA_SEASON_LEADER_CATEGORIES.map((cfg) => {
    const cat = categoriesRaw.find((row: any) => String(row?.name || '') === cfg.espnCategory);
    const leaders = Array.isArray(cat?.leaders) ? cat.leaders : [];
    const players = leaders
      .map((row: any, idx: number) => {
        const athleteRef = String(row?.athlete?.$ref || '').trim();
        const teamRef = String(row?.team?.$ref || '').trim();
        const statsRef = String(row?.statistics?.$ref || '').trim();
        const athlete = athleteRef ? refData.get(athleteRef) : null;
        const team = teamRef ? refData.get(teamRef) : null;
        const stats = statsRef ? refData.get(statsRef) : null;
        const athleteId = Number(athlete?.id || 0);
        const statValue = Number(row?.value);
        const directHeadshotUrl = athleteId > 0
          ? `https://a.espncdn.com/i/headshots/nba/players/full/${athleteId}.png`
          : null;
        const proxiedHeadshotUrl = directHeadshotUrl
          ? `/api/media/player-photo?url=${encodeURIComponent(directHeadshotUrl)}`
          : null;
        return {
          playerId: String(athleteId || athlete?.uid || `${cfg.key}-${idx}`),
          name: String(athlete?.displayName || athlete?.fullName || 'Unknown Player'),
          teamCode: String(team?.abbreviation || ''),
          teamName: String(team?.displayName || team?.name || ''),
          value: Number.isFinite(statValue) ? statValue : 0,
          gamesPlayed: parseGamesPlayedFromEspnStats(stats),
          sampleValue: parseGamesPlayedFromEspnStats(stats),
          sampleLabel: 'GP',
          rank: idx + 1,
          imageUrl: proxiedHeadshotUrl,
        };
      })
      .filter((player) => player.name && Number.isFinite(player.value))
      .slice(0, limit);

    return {
      key: cfg.key,
      label: cfg.label,
      shortLabel: cfg.shortLabel,
      unit: cfg.unit,
      qualifierLabel: 'Season',
      players,
    };
  }).filter((cat) => cat.players.length > 0);

  return parsedCategories;
}

async function fetchMlbTeamMetaMap() {
  const teamsRes = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1');
  if (!teamsRes.ok) {
    throw new Error(`MLB teams endpoint HTTP ${teamsRes.status}`);
  }
  const teamsJson = await teamsRes.json() as { teams?: MlbTeamMeta[] };
  const teams = Array.isArray(teamsJson.teams) ? teamsJson.teams : [];
  const teamById = new Map<number, MlbTeamMeta>();
  for (const team of teams) {
    if (typeof team.id === 'number') teamById.set(team.id, team);
  }
  return teamById;
}

async function fetchMlbStatsApiStandings(season: number) {
  const teamById = await fetchMlbTeamMetaMap();

  const standingsRes = await fetch(
    `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&standingsTypes=regularSeason&season=${season}`
  );
  if (!standingsRes.ok) {
    throw new Error(`MLB standings endpoint HTTP ${standingsRes.status}`);
  }
  const standingsJson = await standingsRes.json() as { records?: any[] };
  const records = Array.isArray(standingsJson.records) ? standingsJson.records : [];

  const conferences: any[] = [];
  const divisions: any[] = [];
  const teamsOut: any[] = [];
  const seenConferences = new Set<string>();
  const seenDivisions = new Set<string>();

  for (const record of records) {
    const leagueId = Number(record?.league?.id);
    const divisionId = Number(record?.division?.id);
    const conferenceName = String(record?.league?.name || (leagueId === 103 ? 'American League' : 'National League'));
    const divisionName = String(record?.division?.name || '');
    const confAlias = leagueId === 103 ? 'AL' : leagueId === 104 ? 'NL' : conferenceName;

    const confKey = `${leagueId}:${conferenceName}`;
    if (!seenConferences.has(confKey)) {
      conferences.push({ id: leagueId || confKey, name: conferenceName, alias: confAlias });
      seenConferences.add(confKey);
    }

    const divisionKey = `${divisionId}:${divisionName}`;
    if (divisionName && !seenDivisions.has(divisionKey)) {
      divisions.push({
        id: divisionId || divisionKey,
        name: divisionName,
        alias: divisionName
          .replace('American League ', 'AL ')
          .replace('National League ', 'NL '),
        conferenceId: leagueId || confKey,
        conferenceName,
      });
      seenDivisions.add(divisionKey);
    }

    for (const teamRecord of record?.teamRecords || []) {
      const teamId = Number(teamRecord?.team?.id);
      const meta = teamById.get(teamId);
      const wins = Number(teamRecord?.wins ?? 0);
      const losses = Number(teamRecord?.losses ?? 0);
      const streakCode = String(teamRecord?.streak?.streakCode || '');
      const lastTen = (teamRecord?.records?.splitRecords || [])
        .find((row: any) => String(row?.type).toLowerCase() === 'lastten');
      const home = (teamRecord?.records?.splitRecords || [])
        .find((row: any) => String(row?.type).toLowerCase() === 'home');
      const away = (teamRecord?.records?.splitRecords || [])
        .find((row: any) => String(row?.type).toLowerCase() === 'away');
      const winningPercentage = Number(String(teamRecord?.winningPercentage || '').replace(/^\./, '0.'));

      teamsOut.push({
        id: String(teamId || teamRecord?.team?.id || ''),
        name: meta?.teamName || teamRecord?.team?.name || meta?.name || 'Unknown',
        market: meta?.locationName || '',
        alias: meta?.abbreviation || '',
        sport: 'MLB',
        conferenceId: leagueId || null,
        conferenceName,
        divisionId: divisionId || meta?.division?.id || null,
        divisionName: divisionName || meta?.division?.name || null,
        wins,
        losses,
        ties: null,
        winPct: Number.isFinite(winningPercentage) ? winningPercentage : (wins + losses > 0 ? wins / (wins + losses) : 0),
        confWins: 0,
        confLosses: 0,
        homeWins: Number(home?.wins ?? 0),
        homeLosses: Number(home?.losses ?? 0),
        awayWins: Number(away?.wins ?? 0),
        awayLosses: Number(away?.losses ?? 0),
        rank: Number(teamRecord?.divisionRank || 0) || null,
        gamesBack: teamRecord?.divisionGamesBack ?? teamRecord?.gamesBack ?? null,
        streak: streakCode || null,
        lastTen: lastTen ? `${lastTen.wins}-${lastTen.losses}` : null,
        pointsFor: Number(teamRecord?.runsScored ?? 0),
        pointsAgainst: Number(teamRecord?.runsAllowed ?? 0),
        pointDiff: Number(teamRecord?.runDifferential ?? 0),
        clinched: teamRecord?.clinched || null,
        eliminated: Boolean(teamRecord?.eliminationNumber === 'E'),
      });
    }
  }

  if (divisions.length === 0) {
    const seen = new Set<string>();
    for (const team of teamsOut) {
      const divisionName = String(team.divisionName || '').trim();
      const conferenceName = String(team.conferenceName || '').trim();
      if (!divisionName) continue;
      const key = `${conferenceName}:${divisionName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      divisions.push({
        id: key,
        name: divisionName,
        alias: divisionName
          .replace('American League ', 'AL ')
          .replace('National League ', 'NL '),
        conferenceId: team.conferenceId,
        conferenceName,
      });
    }
  }

  return { conferences, divisions, teams: teamsOut };
}

async function fetchMlbStatsApiLeaders(season: number, limit: number) {
  const teamById = await fetchMlbTeamMetaMap();
  const categoryParam = MLB_LEADER_CATEGORIES.map((c) => c.leaderCategory).join(',');
  const statGroupParam = Array.from(new Set(MLB_LEADER_CATEGORIES.map((c) => c.statGroup))).join(',');
  const upstreamLimit = Math.max(25, Math.min(100, limit * 8));
  const leadersRes = await fetch(
    `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${encodeURIComponent(categoryParam)}&statGroup=${encodeURIComponent(statGroupParam)}&sportId=1&season=${season}&leaderGameTypes=R&limit=${upstreamLimit}`
  );
  if (!leadersRes.ok) {
    throw new Error(`MLB leaders endpoint HTTP ${leadersRes.status}`);
  }
  const leadersJson = await leadersRes.json() as { leagueLeaders?: any[] };
  const groups = Array.isArray(leadersJson.leagueLeaders) ? leadersJson.leagueLeaders : [];
  const peopleIds = new Set<number>();
  for (const group of groups) {
    const leaders = Array.isArray(group?.leaders) ? group.leaders : [];
    for (const row of leaders) {
      const id = Number(row?.person?.id || 0);
      if (id > 0) peopleIds.add(id);
    }
  }

  const sampleMetaByPlayerId = new Map<number, { pa?: number | null; ip?: string | null; gp?: number | null }>();
  if (peopleIds.size > 0) {
    try {
      const ids = Array.from(peopleIds).join(',');
      const hydrate = encodeURIComponent(`stats(group=[hitting,pitching],type=[season],season=${season})`);
      const peopleRes = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=${hydrate}`);
      if (peopleRes.ok) {
        const peopleJson = await peopleRes.json() as { people?: any[] };
        const people = Array.isArray(peopleJson.people) ? peopleJson.people : [];
        for (const person of people) {
          const personId = Number(person?.id || 0);
          if (!personId) continue;
          const stats = Array.isArray(person?.stats) ? person.stats : [];
          const splits = stats.flatMap((s: any) => (Array.isArray(s?.splits) ? s.splits : []));
          let pa: number | null = null;
          let ip: string | null = null;
          let gp: number | null = null;
          for (const split of splits) {
            const stat = split?.stat || {};
            if (stat && pa == null && Number.isFinite(Number(stat.plateAppearances))) {
              pa = Number(stat.plateAppearances);
            }
            if (stat && ip == null && typeof stat.inningsPitched === 'string' && stat.inningsPitched.trim()) {
              ip = stat.inningsPitched.trim();
            }
            if (stat && gp == null && Number.isFinite(Number(stat.gamesPlayed))) {
              gp = Number(stat.gamesPlayed);
            }
          }
          sampleMetaByPlayerId.set(personId, { pa, ip, gp });
        }
      }
    } catch (err) {
      console.warn('[Teams API] MLB leaders sample metadata fetch failed:', err);
    }
  }

  const categories = MLB_LEADER_CATEGORIES.map((cfg) => {
    const group = groups.find((row) =>
      String(row?.leaderCategory || '') === cfg.leaderCategory &&
      String(row?.statGroup || '') === cfg.statGroup
    );
    const leaders = Array.isArray(group?.leaders) ? group.leaders : [];
    const players = leaders
      .map((row: any, idx: number) => {
        const person = row?.person || {};
        const team = row?.team || {};
        const teamId = Number(team.id || 0);
        const personId = Number(person.id || 0);
        const meta = teamById.get(teamId);
        const numericValue = Number(String(row?.value ?? '').replace(/^(\.\d+)$/, '0$1'));
        const leagueName = String(row?.league?.name || '').trim();
        const sampleMeta = sampleMetaByPlayerId.get(personId);
        const directHeadshotUrl = personId > 0
          ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_280,q_auto:best/v1/people/${personId}/headshot/67/current`
          : null;
        const proxiedHeadshotUrl = directHeadshotUrl
          ? `/api/media/player-photo?url=${encodeURIComponent(directHeadshotUrl)}`
          : null;
        return {
          playerId: String(person.id || `${person.fullName || 'player'}-${idx}`),
          name: String(person.fullName || 'Unknown Player'),
          teamCode: String(meta?.abbreviation || team.abbreviation || team.name || ''),
          teamName: String(meta?.teamName || team.name || ''),
          league: leagueName || null,
          imageUrl: proxiedHeadshotUrl,
          sampleValue: cfg.statGroup === 'pitching' ? sampleMeta?.ip || null : sampleMeta?.pa ?? null,
          sampleLabel: cfg.statGroup === 'pitching' ? 'IP' : 'PA',
          gamesPlayed: Number(sampleMeta?.gp ?? 0),
          value: Number.isFinite(numericValue) ? numericValue : 0,
          rank: Number(row?.rank || idx + 1) || idx + 1,
        };
      })
      .filter((row) => row.name && Number.isFinite(row.value))
      .filter((row) => !(cfg.hideZeroValues && row.value <= 0))
      .slice(0, limit);

    return {
      key: cfg.key,
      label: cfg.label,
      shortLabel: cfg.shortLabel,
      unit: cfg.unit,
      statGroup: cfg.statGroup,
      qualifierLabel: 'Qualified',
      players,
    };
  }).filter((cat) => cat.players.length > 0);

  return categories;
}

/**
 * Test SportsRadar team API connectivity
 * GET /api/teams/test/:sport
 */
teams.get('/test/:sport', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ 
      success: false, 
      error: 'SPORTSRADAR_API_KEY not configured',
      hint: 'Add SPORTSRADAR_API_KEY secret in Settings' 
    }, 500);
  }
  
  try {
    // Test by fetching standings (lightweight endpoint)
    const provider = getSportsRadarProvider(apiKey, null);
    const result = await provider.fetchStandings(sport as SportKey, apiKey);
    
    return c.json({
      success: result.teams.length > 0,
      sport,
      teamsFound: result.teams.length,
      conferencesFound: result.conferences.length,
      sampleTeams: result.teams.slice(0, 3).map(t => ({
        name: `${t.market} ${t.name}`,
        record: `${t.wins}-${t.losses}`,
        conference: t.conferenceName
      })),
      errors: result.errors
    });
    
  } catch (err) {
    return c.json({ 
      success: false, 
      error: String(err) 
    }, 500);
  }
});

/**
 * Get standings for a sport
 * GET /api/teams/:sport/standings
 */
teams.get('/:sport/standings', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const season = c.req.query('season');
  
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use cached version - 15 minute TTL
    const result = await fetchStandingsCached(
      c.env.DB,
      sport as SportKey,
      apiKey,
      season ? parseInt(season, 10) : undefined
    );

    if (sport === 'MLB' && result.teams.length === 0) {
      try {
        const fallbackSeason = season ? parseInt(season, 10) : new Date().getFullYear();
        const fallback = await fetchMlbStatsApiStandings(fallbackSeason);
        if (fallback.teams.length > 0) {
          return c.json({
            sport,
            season: fallbackSeason,
            conferences: fallback.conferences,
            divisions: fallback.divisions,
            teams: fallback.teams,
            errors: [],
            cached: false,
            source: 'mlb_stats_api',
          });
        }
      } catch (fallbackErr) {
        console.warn('[Teams API] MLB fallback standings failed:', fallbackErr);
      }
    }
    
    if (result.errors.length > 0 && result.teams.length === 0) {
      return c.json({
        sport,
        season: season || new Date().getFullYear(),
        conferences: [],
        divisions: [],
        teams: [],
        warnings: result.errors,
        source_stale: true,
      });
    }
    const seasonNumber = season ? parseInt(season, 10) : new Date().getFullYear();
    const hydratedTeams = sport === 'NBA'
      ? await hydrateNbaStandingsWithEspnSplits(result.teams, seasonNumber).catch(() => result.teams)
      : result.teams;
    
    return c.json({
      sport,
      season: season || new Date().getFullYear(),
      conferences: result.conferences,
      divisions: result.divisions,
      teams: hydratedTeams,
      errors: result.errors,
      cached: true,
      source: 'sportsradar'
    });
    
  } catch (err) {
    console.error('[Teams API] Standings error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get ESPN line fallback for NBA event IDs.
 * GET /api/teams/:sport/espn-line?eventId=401810962
 */
teams.get('/:sport/espn-line', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  if (sport !== 'NBA') {
    return c.json({ error: 'ESPN line fallback is currently supported for NBA only' }, 400);
  }
  const eventId = String(c.req.query('eventId') || '').trim();
  if (!/^\d{7,}$/.test(eventId)) {
    return c.json({ error: 'eventId is required and must be an ESPN event id' }, 400);
  }
  const line = await fetchNbaEspnEventLineById(eventId);
  return c.json({
    sport,
    eventId,
    spreadHome: line.spreadHome,
    totalLine: line.totalLine,
    hasLine: line.spreadHome !== null || line.totalLine !== null,
  });
});

type TeamH2HMeeting = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamAlias: string;
  awayTeamAlias: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  margin: number;
  marginForTeamA: number;
  teamACoverResult: 'cover' | 'no_cover' | 'push' | null;
  totalResult: 'over' | 'under' | 'push' | null;
  closingSpreadHome: number | null;
  closingTotal: number | null;
};

function isFinalStatus(value: unknown): boolean {
  const status = String(value || '').toUpperCase();
  return status.includes('FINAL') || status.includes('CLOSED') || status.includes('COMPLETE');
}

function parseWindow(value: string | undefined, fallback = 10): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(3, Math.min(20, Math.floor(n)));
}

function toDayKey(value: unknown): string {
  const ts = new Date(String(value || '')).getTime();
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function normalizeAliasToken(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2,4}$/.test(upper)) return upper;
  const words = raw.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const tail = words.length > 0 ? words[words.length - 1] : raw;
  return String(tail).replace(/[^A-Za-z]/g, '').toUpperCase();
}

function resolveStandingTeam(teams: any[], token: string | undefined): any | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const key = normalizeTeamKey(raw);
  if (!key) return null;
  return teams.find((row: any) => {
    const id = normalizeTeamKey(row?.id);
    const alias = normalizeTeamKey(row?.alias);
    const name = normalizeTeamKey(row?.name);
    const market = normalizeTeamKey(row?.market);
    const fullName = normalizeTeamKey(`${row?.market || ''} ${row?.name || ''}`);
    return [id, alias, name, market, fullName].some((candidate) => candidate && (candidate === key || candidate.includes(key) || key.includes(candidate)));
  }) || null;
}

async function fetchClosingLinesByGameId(db: D1Database, gameIds: string[]): Promise<Map<string, { spreadHome: number | null; total: number | null }>> {
  const unique = Array.from(new Set(gameIds.filter(Boolean)));
  const out = new Map<string, { spreadHome: number | null; total: number | null }>();
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => '?').join(', ');
  try {
    const query = `
      SELECT
        game_id,
        MAX(CASE WHEN market_key = 'SPREAD' AND outcome_key = 'HOME' THEN opening_line_value END) AS spread_home,
        MAX(CASE WHEN market_key = 'TOTAL' AND outcome_key = 'OVER' THEN opening_line_value END) AS total_line
      FROM odds_opening
      WHERE game_id IN (${placeholders})
      GROUP BY game_id
    `;
    const rows = await db.prepare(query).bind(...unique).all<any>();
    const list = Array.isArray(rows.results) ? rows.results : [];
    for (const row of list) {
      out.set(String(row.game_id || ''), {
        spreadHome: Number.isFinite(Number(row.spread_home)) ? Number(row.spread_home) : null,
        total: Number.isFinite(Number(row.total_line)) ? Number(row.total_line) : null,
      });
    }
  } catch {
    // Non-fatal: H2H still returns SU with null line outcomes.
  }

  // Fallback: some environments only persisted snapshot lines, not opening lines.
  const missing = unique.filter((id) => !out.has(id));
  if (missing.length > 0) {
    const placeholders = missing.map(() => '?').join(', ');
    try {
      const snapshotQuery = `
        SELECT
          game_id,
          MAX(CASE WHEN market_key = 'SPREAD' AND outcome_key = 'HOME' THEN line_value END) AS spread_home,
          MAX(CASE WHEN market_key = 'TOTAL' AND outcome_key = 'OVER' THEN line_value END) AS total_line
        FROM odds_snapshots
        WHERE game_id IN (${placeholders})
        GROUP BY game_id
      `;
      const rows = await db.prepare(snapshotQuery).bind(...missing).all<any>();
      const list = Array.isArray(rows.results) ? rows.results : [];
      for (const row of list) {
        const id = String(row.game_id || '');
        if (!id) continue;
        if (out.has(id)) continue;
        out.set(id, {
          spreadHome: Number.isFinite(Number(row.spread_home)) ? Number(row.spread_home) : null,
          total: Number.isFinite(Number(row.total_line)) ? Number(row.total_line) : null,
        });
      }
    } catch {
      // Non-fatal fallback miss.
    }
  }
  return out;
}

async function fetchLatestTeamLineFallback(
  db: D1Database,
  sport: string,
  teamAlias: string,
  teamId: string,
  apiKey: string
): Promise<{ spreadHome: number | null; total: number | null } | null> {
  const alias = String(teamAlias || '').trim().toUpperCase();
  const teamIdKey = String(teamId || '').trim();
  if (!alias && !teamIdKey) return null;
  try {
    const candidateNames = new Set<string>();
    if (alias) candidateNames.add(alias);
    try {
      const standings = await fetchStandingsCached(db, 'NBA', apiKey);
      const teams = Array.isArray((standings as any)?.teams) ? (standings as any).teams : [];
      const row = teams.find((t: any) =>
        String(t?.id || '').trim() === teamIdKey
        || (alias && String(t?.alias || '').trim().toUpperCase() === alias)
      );
      const fullName = `${String(row?.market || '').trim()} ${String(row?.name || '').trim()}`.trim().toUpperCase();
      if (fullName) candidateNames.add(fullName);
      const shortName = String(row?.name || '').trim().toUpperCase();
      if (shortName) candidateNames.add(shortName);
    } catch {
      // Non-fatal: keep alias-only candidate.
    }

    const tokens = Array.from(candidateNames).filter(Boolean).slice(0, 4);
    if (tokens.length === 0) return null;
    const likeClauses = tokens.map(() => '(UPPER(COALESCE(home_team, \'\')) = ? OR UPPER(COALESCE(away_team, \'\')) = ? OR UPPER(COALESCE(home_team_name, \'\')) = ? OR UPPER(COALESCE(away_team_name, \'\')) = ?)').join(' OR ');
    const bindArgs: any[] = [sport.toUpperCase()];
    for (const t of tokens) {
      bindArgs.push(t, t, t, t);
    }

    const rows = await db.prepare(`
      SELECT provider_game_id, start_time
      FROM sdio_games
      WHERE UPPER(COALESCE(sport, '')) = ?
        AND (${likeClauses})
      ORDER BY datetime(start_time) DESC
      LIMIT 60
    `).bind(...bindArgs).all<{ provider_game_id: string; start_time: string }>();
    const gameIds = (rows.results || []).map((r) => String(r.provider_game_id || '').trim()).filter(Boolean);
    if (gameIds.length === 0) return null;
    const lineByGame = await fetchClosingLinesByGameId(db, gameIds);
    for (const id of gameIds) {
      const line = lineByGame.get(id);
      if (!line) continue;
      if (line.spreadHome !== null || line.total !== null) {
        return {
          spreadHome: line.spreadHome ?? null,
          total: line.total ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

async function fetchNbaGamesForDayFromApi(origin: string, day: string): Promise<any[]> {
  try {
    const res = await fetch(`${origin}/api/games?sport=NBA&date=${encodeURIComponent(day)}&includeOdds=0&fresh=1`);
    if (!res.ok) return [];
    const json: any = await res.json();
    return Array.isArray(json?.games) ? json.games : [];
  } catch {
    return [];
  }
}

/**
 * Get team-vs-team head-to-head sample.
 * GET /api/teams/:sport/h2h?teamA=...&teamB=...&window=10
 */
teams.get('/:sport/h2h', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const teamAToken = c.req.query('teamA');
  const teamBToken = c.req.query('teamB');
  const window = parseWindow(c.req.query('window'), 10);

  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  if (!teamAToken || !teamBToken) {
    return c.json({ error: 'teamA and teamB are required query params' }, 400);
  }

  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }

  try {
    const standings = await fetchStandingsCached(c.env.DB, sport as SportKey, apiKey);
    const standingTeams = Array.isArray((standings as any)?.teams) ? (standings as any).teams : [];
    const teamA = resolveStandingTeam(standingTeams, teamAToken);
    const teamB = resolveStandingTeam(standingTeams, teamBToken);
    if (!teamA || !teamB) {
      return c.json({
        sport,
        sampleSize: 0,
        window,
        message: 'Unable to resolve team identifiers for head-to-head lookup',
      }, 404);
    }

    const provider = getSportsRadarProvider(apiKey, null);
    const scheduleResult = await provider.fetchTeamSchedule(sport as SportKey, String(teamA.id), apiKey);
    const filtered = (Array.isArray(scheduleResult.games) ? scheduleResult.games : [])
      .filter((g: any) => {
        const homeId = String(g?.homeTeamId || '');
        const awayId = String(g?.awayTeamId || '');
        return isFinalStatus(g?.status) && (homeId === String(teamA.id) || awayId === String(teamA.id))
          && (homeId === String(teamB.id) || awayId === String(teamB.id));
      })
      .sort((a: any, b: any) => new Date(b?.scheduledTime || 0).getTime() - new Date(a?.scheduledTime || 0).getTime())
      .slice(0, window);

    const lineByGame = await fetchClosingLinesByGameId(
      c.env.DB,
      filtered.map((g: any) => String(g?.id || ''))
    );

    let teamAWins = 0;
    let teamBWins = 0;
    let ties = 0;
    let totalMargin = 0;
    let totalScoreSum = 0;
    let atsWithLine = 0;
    let teamACovers = 0;
    let teamBCovers = 0;
    let atsPushes = 0;
    let totalsWithLine = 0;
    let overs = 0;
    let unders = 0;
    let totalPushes = 0;

    const meetings: TeamH2HMeeting[] = filtered.map((g: any) => {
      const homeAlias = String(g?.homeTeamAlias || '').toUpperCase();
      const awayAlias = String(g?.awayTeamAlias || '').toUpperCase();
      const homeName = String(g?.homeTeamName || homeAlias || 'HOME');
      const awayName = String(g?.awayTeamName || awayAlias || 'AWAY');
      const homeScore = Number(g?.homeScore ?? 0) || 0;
      const awayScore = Number(g?.awayScore ?? 0) || 0;
      const isTeamAHome = String(g?.homeTeamId || '') === String(teamA.id);
      const teamAScore = isTeamAHome ? homeScore : awayScore;
      const teamBScore = isTeamAHome ? awayScore : homeScore;
      const marginForTeamA = teamAScore - teamBScore;
      const winner = marginForTeamA > 0 ? 'teamA' : marginForTeamA < 0 ? 'teamB' : 'tie';
      if (winner === 'teamA') teamAWins += 1;
      else if (winner === 'teamB') teamBWins += 1;
      else ties += 1;
      totalMargin += marginForTeamA;
      totalScoreSum += (homeScore + awayScore);

      const line = lineByGame.get(String(g?.id || ''));
      const spreadHome = line?.spreadHome ?? null;
      const totalLine = line?.total ?? null;

      let teamACoverResult: TeamH2HMeeting['teamACoverResult'] = null;
      if (spreadHome !== null) {
        atsWithLine += 1;
        const spreadOutcome = (homeScore - awayScore) + spreadHome;
        const coveredSide = spreadOutcome > 0 ? 'home' : spreadOutcome < 0 ? 'away' : 'push';
        if (coveredSide === 'push') {
          atsPushes += 1;
          teamACoverResult = 'push';
        } else {
          const teamASide = isTeamAHome ? 'home' : 'away';
          const didCover = coveredSide === teamASide;
          teamACoverResult = didCover ? 'cover' : 'no_cover';
          if (didCover) teamACovers += 1;
          else teamBCovers += 1;
        }
      }

      let totalResult: TeamH2HMeeting['totalResult'] = null;
      if (totalLine !== null) {
        totalsWithLine += 1;
        const gameTotal = homeScore + awayScore;
        if (gameTotal > totalLine) {
          overs += 1;
          totalResult = 'over';
        } else if (gameTotal < totalLine) {
          unders += 1;
          totalResult = 'under';
        } else {
          totalPushes += 1;
          totalResult = 'push';
        }
      }

      return {
        id: String(g?.id || ''),
        date: String(g?.scheduledTime || ''),
        homeTeam: homeName,
        awayTeam: awayName,
        homeTeamAlias: homeAlias,
        awayTeamAlias: awayAlias,
        homeScore,
        awayScore,
        winner: winner === 'teamA' ? String(teamA.name || teamA.alias || 'Team A') : winner === 'teamB' ? String(teamB.name || teamB.alias || 'Team B') : 'TIE',
        margin: Math.abs(homeScore - awayScore),
        marginForTeamA,
        teamACoverResult,
        totalResult,
        closingSpreadHome: spreadHome,
        closingTotal: totalLine,
      };
    });

    const sampleSize = meetings.length;
    return c.json({
      sport,
      window,
      sampleSize,
      teamA: {
        id: String(teamA.id || ''),
        name: `${teamA.market || ''} ${teamA.name || ''}`.trim() || String(teamA.name || ''),
        alias: String(teamA.alias || ''),
      },
      teamB: {
        id: String(teamB.id || ''),
        name: `${teamB.market || ''} ${teamB.name || ''}`.trim() || String(teamB.name || ''),
        alias: String(teamB.alias || ''),
      },
      series: {
        teamAWins,
        teamBWins,
        ties,
      },
      ats: {
        sampleWithLine: atsWithLine,
        teamACovers,
        teamBCovers,
        pushes: atsPushes,
      },
      totals: {
        sampleWithLine: totalsWithLine,
        overs,
        unders,
        pushes: totalPushes,
      },
      averages: {
        marginForTeamA: sampleSize > 0 ? Number((totalMargin / sampleSize).toFixed(1)) : null,
        combinedTotal: sampleSize > 0 ? Number((totalScoreSum / sampleSize).toFixed(1)) : null,
      },
      meetings,
      source: 'sportsradar_schedule_plus_odds_cache',
      warnings: scheduleResult.errors || [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Teams API] H2H error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get league leaders for a sport
 * GET /api/teams/:sport/leaders
 */
teams.get('/:sport/leaders', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const season = c.req.query('season');
  const limitRaw = Number(c.req.query('limit') || 5);
  const limit = Number.isFinite(limitRaw) ? Math.max(3, Math.min(10, Math.floor(limitRaw))) : 5;
  const mode = String(c.req.query('mode') || '').trim().toLowerCase();

  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }

  try {
    const selectedSeason = season ? parseInt(season, 10) : new Date().getFullYear();
    if (sport === 'MLB') {
      const categories = await fetchMlbStatsApiLeaders(selectedSeason, limit);
      return c.json({
        sport,
        season: selectedSeason,
        source: 'mlb_stats_api',
        categories,
      });
    }
    if (sport === 'NBA') {
      if (mode === 'live') {
        const cacheKey = makeCacheKey('teams', 'nba/leaders/live', {
          season: selectedSeason,
          limit,
        });
        try {
          const cached = await getCachedData<{
            sport: string;
            season: number;
            mode: 'live';
            source: string;
            categories: any[];
            warnings?: string[];
            rawEvents?: number;
            rawProps?: number;
          }>(c.env.DB, cacheKey);
          if (cached && Array.isArray(cached.categories) && cached.categories.length > 0) {
            return c.json({ ...cached, cached: true });
          }
        } catch {
          // non-fatal cache read failure
        }

        const playerPropsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY
          || c.env.SPORTSRADAR_PROPS_KEY
          || c.env.SPORTSRADAR_API_KEY;
        if (!playerPropsKey) {
          return c.json({
            sport,
            season: selectedSeason,
            source: 'unavailable',
            categories: [],
            warnings: ['SportsRadar Player Props API key not configured'],
          }, 200);
        }
        const nba = await fetchNbaLeadersFromSportsRadar(playerPropsKey, limit, selectedSeason);
        const payload = {
          sport,
          season: selectedSeason,
          mode: 'live',
          source: nba.categories.length > 0 ? 'sportsradar_player_props' : 'unavailable',
          categories: nba.categories,
          warnings: nba.errors,
          rawEvents: nba.rawEvents,
          rawProps: nba.rawProps,
        };
        if (payload.categories.length > 0) {
          c.executionCtx.waitUntil(
            setCachedData(c.env.DB, cacheKey, 'sportsradar', 'teams/nba/leaders/live', payload, 90)
          );
        }
        return c.json(payload);
      }
      const categories = await fetchNbaSeasonLeadersFromEspn(selectedSeason, limit);
      return c.json({
        sport,
        season: selectedSeason,
        mode: 'season',
        source: categories.length > 0 ? 'espn_season_leaders' : 'unavailable',
        categories,
        warnings: categories.length > 0 ? [] : ['No ESPN NBA season leaders available'],
      });
    }
    return c.json({ error: `Leaders route currently supported for MLB and NBA` }, 400);
  } catch (err) {
    console.error('[Teams API] Leaders error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get team schedule
 * GET /api/teams/:sport/:teamId/schedule
 */
teams.get('/:sport/:teamId/schedule', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const teamId = c.req.param('teamId');
  const season = c.req.query('season');
  
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    const selectedSeason = season ? parseInt(season, 10) : undefined;
    const snapshotCacheKey = makeCacheKey('team-schedule-snapshot', `${sport}/${teamId}`, {
      season: Number.isFinite(selectedSeason as number) ? String(selectedSeason) : 'current',
    });
    const readScheduleSnapshot = async () => {
      return await getCachedData<any>(c.env.DB, snapshotCacheKey);
    };
    const writeScheduleSnapshot = (payload: any) => {
      const total = Number(payload?.totalGames || (Array.isArray(payload?.allGames) ? payload.allGames.length : 0));
      if (!Number.isFinite(total) || total <= 0) return;
      c.executionCtx.waitUntil(
        setCachedData(c.env.DB, snapshotCacheKey, 'teams', `schedule/${sport}/${teamId}`, payload, 12 * 60 * 60)
      );
    };

    const provider = getSportsRadarProvider(apiKey, null);
    const result = await provider.fetchTeamSchedule(
      sport as SportKey, 
      teamId, 
      apiKey,
      selectedSeason
    );

    // NBA hardening: merge ESPN schedule scores/status even when SR returned games,
    // because SR team schedule can be sparse/incomplete for some completed games.
    let mergedResultGames = Array.isArray(result.games) ? [...result.games] : [];
    if (sport === 'NBA') {
      const alias = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
      const espnFallback = await fetchNbaEspnScheduleFallback(alias, selectedSeason);
      if (espnFallback.games.length > 0) {
        const byId = new Map<string, any>();
        const byComposite = new Map<string, any>();
        for (const g of espnFallback.games) {
          const id = String(g?.id || '').trim();
          if (id) byId.set(id, g);
          const ts = new Date(String(g?.scheduledTime || '')).getTime();
          const homeAlias = String(g?.homeTeam?.alias || '').toUpperCase();
          const awayAlias = String(g?.awayTeam?.alias || '').toUpperCase();
          if (Number.isFinite(ts) && homeAlias && awayAlias) {
            const day = new Date(ts).toISOString().slice(0, 10);
            byComposite.set(`${day}:${homeAlias}:${awayAlias}`, g);
          }
        }
        mergedResultGames = mergedResultGames.map((g: any) => {
          const id = String(g?.id || '').trim();
          const direct = id ? byId.get(id) : null;
          if (direct) {
            return {
              ...g,
              homeScore: Number.isFinite(Number(g?.homeScore)) ? Number(g.homeScore) : Number(direct?.homeScore),
              awayScore: Number.isFinite(Number(g?.awayScore)) ? Number(g.awayScore) : Number(direct?.awayScore),
              status: g?.status || direct?.status,
            };
          }
          const ts = new Date(String(g?.scheduledTime || '')).getTime();
          const homeAlias = String(g?.homeTeamAlias || '').toUpperCase();
          const awayAlias = String(g?.awayTeamAlias || '').toUpperCase();
          if (Number.isFinite(ts) && homeAlias && awayAlias) {
            const day = new Date(ts).toISOString().slice(0, 10);
            const hit = byComposite.get(`${day}:${homeAlias}:${awayAlias}`);
            if (hit) {
              return {
                ...g,
                homeScore: Number.isFinite(Number(g?.homeScore)) ? Number(g.homeScore) : Number(hit?.homeScore),
                awayScore: Number.isFinite(Number(g?.awayScore)) ? Number(g.awayScore) : Number(hit?.awayScore),
                status: g?.status || hit?.status,
              };
            }
          }
          return g;
        });
      }
    }
    
    if (result.errors.length > 0 && mergedResultGames.length === 0 && sport === 'NBA') {
      const alias = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
      const fallback = await fetchNbaEspnScheduleFallback(alias, selectedSeason);
      if (fallback.games.length > 0) {
        const now = new Date();
        const pastGames = fallback.games
          .filter((g: any) => g.scheduledTime && new Date(g.scheduledTime) < now)
          .sort((a: any, b: any) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime())
          .slice(0, 10);
        const upcomingGames = fallback.games
          .filter((g: any) => g.scheduledTime && new Date(g.scheduledTime) >= now)
          .sort((a: any, b: any) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
          .slice(0, 10);
        const fallbackLineByGame = await fetchClosingLinesByGameId(
          c.env.DB,
          fallback.games.map((g: any) => String(g?.id || ''))
        );
        let fallbackGamesWithLines = fallback.games.map((g: any) => {
          const key = String(g?.id || '');
          const line = fallbackLineByGame.get(key);
          return {
            ...g,
            spreadHome: line?.spreadHome ?? null,
            totalLine: line?.total ?? null,
          };
        });

        const fallbackNeedsLine = fallbackGamesWithLines.filter((g: any) => {
          const statusRaw = String(g?.status?.name || g?.status || '').toUpperCase();
          const isFinalish = statusRaw.includes('FINAL') || statusRaw.includes('CLOSED') || statusRaw.includes('COMPLETED');
          return isFinalish && (g?.spreadHome == null || g?.totalLine == null);
        });
        if (fallbackNeedsLine.length > 0) {
          const days = Array.from(new Set(fallbackNeedsLine.map((g: any) => toDayKey(g?.scheduledTime)).filter(Boolean))).slice(0, 8);
          const providerGamesByDay = new Map<string, any[]>();
          const requestOrigin = new URL(c.req.url).origin;
          await Promise.all(
            days.map(async (day) => {
              const rows = await withTimeout(
                fetchNbaGamesForDayFromApi(requestOrigin, day),
                7000,
                [] as any[]
              );
              providerGamesByDay.set(day, rows);
            })
          );
          const mappedOddsIdByScheduleId = new Map<string, string>();
          for (const row of fallbackNeedsLine) {
            const day = toDayKey(row?.scheduledTime);
            if (!day) continue;
            const homeAlias = String(row?.homeTeamAlias || row?.homeTeam?.alias || '').toUpperCase();
            const awayAlias = String(row?.awayTeamAlias || row?.awayTeam?.alias || '').toUpperCase();
            const rowTs = new Date(String(row?.scheduledTime || '')).getTime();
            const candidates = providerGamesByDay.get(day) || [];
            const match = candidates.find((pg: any) => {
              const pgHomeAlias = String(pg?.home_team_code || '').toUpperCase() || normalizeAliasToken(pg?.home_team_name);
              const pgAwayAlias = String(pg?.away_team_code || '').toUpperCase() || normalizeAliasToken(pg?.away_team_name);
              if (!(pgHomeAlias && pgAwayAlias && pgHomeAlias === homeAlias && pgAwayAlias === awayAlias)) return false;
              const pgTs = new Date(String(pg?.start_time || '')).getTime();
              if (!Number.isFinite(pgTs) || !Number.isFinite(rowTs)) return true;
              return Math.abs(pgTs - rowTs) <= 18 * 60 * 60 * 1000;
            });
            const mappedId = String(match?.game_id || match?.id || '').trim();
            const rowId = String(row?.id || '').trim();
            if (mappedId && rowId) mappedOddsIdByScheduleId.set(rowId, mappedId);
          }
          if (mappedOddsIdByScheduleId.size > 0) {
            const mappedLines = await fetchClosingLinesByGameId(
              c.env.DB,
              Array.from(new Set(Array.from(mappedOddsIdByScheduleId.values())))
            );
            fallbackGamesWithLines = fallbackGamesWithLines.map((g: any) => {
              const id = String(g?.id || '').trim();
              const mappedId = mappedOddsIdByScheduleId.get(id);
              const mappedLine = mappedId ? mappedLines.get(mappedId) : undefined;
              if (!mappedLine) return g;
              return {
                ...g,
                spreadHome: g?.spreadHome ?? mappedLine.spreadHome ?? null,
                totalLine: g?.totalLine ?? mappedLine.total ?? null,
              };
            });
          }
        }

        fallbackGamesWithLines = await enrichNbaGamesWithEspnScheduleBridgeLines(
          c.env.DB,
          fallbackGamesWithLines,
          teamId,
          selectedSeason,
          apiKey
        );
        fallbackGamesWithLines = await enrichNbaEspnGamesWithSummaryLines(fallbackGamesWithLines);
        const aliasForFallbackLines = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
        const latestTeamLine = await fetchLatestTeamLineFallback(
          c.env.DB,
          'NBA',
          aliasForFallbackLines,
          teamId,
          apiKey
        );
        if (latestTeamLine) {
          fallbackGamesWithLines = fallbackGamesWithLines.map((g: any) => {
            const statusRaw = String(g?.status?.name || g?.status || '').toUpperCase();
            const isFinalish = statusRaw.includes('FINAL') || statusRaw.includes('CLOSED') || statusRaw.includes('COMPLETED');
            if (!isFinalish) return g;
            if (g?.spreadHome != null && g?.totalLine != null) return g;
            return {
              ...g,
              spreadHome: g?.spreadHome ?? latestTeamLine.spreadHome ?? null,
              totalLine: g?.totalLine ?? latestTeamLine.total ?? null,
            };
          });
        }
        const fallbackPastGames = fallbackGamesWithLines
          .filter((g: any) => g.scheduledTime && new Date(g.scheduledTime) < now)
          .sort((a: any, b: any) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime())
          .slice(0, 10);
        const fallbackUpcomingGames = fallbackGamesWithLines
          .filter((g: any) => g.scheduledTime && new Date(g.scheduledTime) >= now)
          .sort((a: any, b: any) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
          .slice(0, 10);
        const fallbackPayload = {
          teamId,
          pastGames: fallbackPastGames,
          upcomingGames: fallbackUpcomingGames,
          allGames: fallbackGamesWithLines,
          totalGames: fallbackGamesWithLines.length,
          errors: [...result.errors, 'Used ESPN schedule fallback'],
          source: 'espn_fallback',
        };
        writeScheduleSnapshot(fallbackPayload);
        return c.json(fallbackPayload);
      }
      const snapshot = await readScheduleSnapshot();
      if (snapshot) {
        return c.json({
          ...snapshot,
          source: 'snapshot_fallback',
          errors: [...(Array.isArray(snapshot?.errors) ? snapshot.errors : []), ...(result.errors || []), 'Served last good schedule snapshot'],
        });
      }
      return c.json({ error: fallback.error || result.errors[0] }, 500);
    }
    if (result.errors.length > 0 && mergedResultGames.length === 0) {
      const snapshot = await readScheduleSnapshot();
      if (snapshot) {
        return c.json({
          ...snapshot,
          source: 'snapshot_fallback',
          errors: [...(Array.isArray(snapshot?.errors) ? snapshot.errors : []), ...(result.errors || []), 'Served last good schedule snapshot'],
        });
      }
      return c.json({ error: result.errors[0] }, 500);
    }

    // Enrich team schedule with opening line context when available.
    const lineByGame = await fetchClosingLinesByGameId(
      c.env.DB,
      mergedResultGames.map((g: any) => String(g?.id || ''))
    );
    let gamesWithLines = mergedResultGames.map((g: any) => {
      const key = String(g?.id || '');
      const line = lineByGame.get(key);
      return {
        ...g,
        spreadHome: line?.spreadHome ?? null,
        totalLine: line?.total ?? null,
      };
    });

    // NBA hardening: when schedule rows come from ESPN fallback, IDs are ESPN event IDs
    // and won't match odds tables keyed by SportsRadar IDs. Bridge by matching date + teams.
    if (sport === 'NBA') {
      const needsLine = gamesWithLines.filter((g: any) => {
        const statusRaw = String(g?.status?.name || g?.status || '').toUpperCase();
        const isFinalish = statusRaw.includes('FINAL') || statusRaw.includes('CLOSED') || statusRaw.includes('COMPLETED');
        return isFinalish && (g?.spreadHome == null || g?.totalLine == null);
      });

      if (needsLine.length > 0) {
        const days = Array.from(new Set(needsLine.map((g: any) => toDayKey(g?.scheduledTime)).filter(Boolean))).slice(0, 8);
        const providerGamesByDay = new Map<string, any[]>();
        const requestOrigin = new URL(c.req.url).origin;

        await Promise.all(
          days.map(async (day) => {
            const rows = await withTimeout(
              fetchNbaGamesForDayFromApi(requestOrigin, day),
              7000,
              [] as any[]
            );
            providerGamesByDay.set(day, rows);
          })
        );

        const mappedOddsIdByScheduleId = new Map<string, string>();
        for (const row of needsLine) {
          const day = toDayKey(row?.scheduledTime);
          if (!day) continue;
          const homeAlias = String(row?.homeTeamAlias || row?.homeTeam?.alias || '').toUpperCase();
          const awayAlias = String(row?.awayTeamAlias || row?.awayTeam?.alias || '').toUpperCase();
          const rowTs = new Date(String(row?.scheduledTime || '')).getTime();
          const candidates = providerGamesByDay.get(day) || [];
          const match = candidates.find((pg: any) => {
            const pgHomeAlias = String(pg?.home_team_code || '').toUpperCase() || normalizeAliasToken(pg?.home_team_name);
            const pgAwayAlias = String(pg?.away_team_code || '').toUpperCase() || normalizeAliasToken(pg?.away_team_name);
            if (!(pgHomeAlias && pgAwayAlias && pgHomeAlias === homeAlias && pgAwayAlias === awayAlias)) return false;
            const pgTs = new Date(String(pg?.start_time || '')).getTime();
            if (!Number.isFinite(pgTs) || !Number.isFinite(rowTs)) return true;
            return Math.abs(pgTs - rowTs) <= 18 * 60 * 60 * 1000;
          });
          const mappedId = String(match?.game_id || match?.id || '').trim();
          const rowId = String(row?.id || '').trim();
          if (mappedId && rowId) {
            mappedOddsIdByScheduleId.set(rowId, mappedId);
          }
        }

        if (mappedOddsIdByScheduleId.size > 0) {
          const mappedLines = await fetchClosingLinesByGameId(
            c.env.DB,
            Array.from(new Set(Array.from(mappedOddsIdByScheduleId.values())))
          );
          gamesWithLines = gamesWithLines.map((g: any) => {
            const id = String(g?.id || '').trim();
            const mappedId = mappedOddsIdByScheduleId.get(id);
            const mappedLine = mappedId ? mappedLines.get(mappedId) : undefined;
            if (!mappedLine) return g;
            return {
              ...g,
              spreadHome: g?.spreadHome ?? mappedLine.spreadHome ?? null,
              totalLine: g?.totalLine ?? mappedLine.total ?? null,
            };
          });
        }
      }
    }
    if (sport === 'NBA') {
      gamesWithLines = await enrichNbaGamesWithEspnScheduleBridgeLines(
        c.env.DB,
        gamesWithLines,
        teamId,
        selectedSeason,
        apiKey
      );
      gamesWithLines = await enrichNbaEspnGamesWithSummaryLines(gamesWithLines);
      const aliasForFallbackLines = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
      const latestTeamLine = await fetchLatestTeamLineFallback(
        c.env.DB,
        'NBA',
        aliasForFallbackLines,
        teamId,
        apiKey
      );
      if (latestTeamLine) {
        gamesWithLines = gamesWithLines.map((g: any) => {
          const statusRaw = String(g?.status?.name || g?.status || '').toUpperCase();
          const isFinalish = statusRaw.includes('FINAL') || statusRaw.includes('CLOSED') || statusRaw.includes('COMPLETED');
          if (!isFinalish) return g;
          if (g?.spreadHome != null && g?.totalLine != null) return g;
          return {
            ...g,
            spreadHome: g?.spreadHome ?? latestTeamLine.spreadHome ?? null,
            totalLine: g?.totalLine ?? latestTeamLine.total ?? null,
          };
        });
      }
    }

    // Separate past and upcoming games
    const now = new Date();
    const pastGames = gamesWithLines
      .filter(g => g.scheduledTime && new Date(g.scheduledTime) < now)
      .sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime())
      .slice(0, 10);
    
    const upcomingGames = gamesWithLines
      .filter(g => g.scheduledTime && new Date(g.scheduledTime) >= now)
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
      .slice(0, 10);
    
    const responsePayload = {
      teamId,
      pastGames,
      upcomingGames,
      allGames: gamesWithLines,
      totalGames: gamesWithLines.length,
      errors: result.errors
    };
    writeScheduleSnapshot(responsePayload);
    return c.json(responsePayload);
    
  } catch (err) {
    console.error('[Teams API] Schedule error:', err);
    try {
      const snapshotCacheKey = makeCacheKey('team-schedule-snapshot', `${sport}/${teamId}`, {
        season: Number.isFinite(Number(season)) ? String(Number(season)) : 'current',
      });
      const snapshot = await getCachedData<any>(c.env.DB, snapshotCacheKey);
      if (snapshot) {
        return c.json({
          ...snapshot,
          source: 'snapshot_fallback',
          errors: [...(Array.isArray(snapshot?.errors) ? snapshot.errors : []), `Schedule error: ${String(err)}`, 'Served last good schedule snapshot'],
        });
      }
    } catch {
      // fallback read failed
    }
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get team statistics
 * GET /api/teams/:sport/:teamId/stats
 */
teams.get('/:sport/:teamId/stats', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const teamId = c.req.param('teamId');
  const season = c.req.query('season');
  
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    const selectedSeason = season ? parseInt(season, 10) : undefined;
    const provider = getSportsRadarProvider(apiKey, null);
    const result = await provider.fetchTeamStats(
      sport as SportKey,
      teamId,
      apiKey,
      selectedSeason
    );
    
    if (result.errors.length > 0 && !result.stats && sport === 'NBA') {
      const alias = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
      const fallback = await fetchNbaEspnStatsFallback(alias, selectedSeason);
      if (fallback.stats) {
        return c.json({
          teamId,
          stats: fallback.stats,
          rankings: fallback.rankings,
          errors: [...result.errors, 'Used ESPN stats fallback'],
          source: 'espn_fallback',
        });
      }
      return c.json({ error: fallback.error || result.errors[0] }, 500);
    }
    if (result.errors.length > 0 && !result.stats) {
      return c.json({ error: result.errors[0] }, 500);
    }
    
    return c.json({
      teamId,
      stats: result.stats,
      rankings: result.rankings,
      errors: result.errors
    });
    
  } catch (err) {
    console.error('[Teams API] Stats error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get team split records (conference/home/away)
 * GET /api/teams/:sport/:teamId/splits
 */
teams.get('/:sport/:teamId/splits', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const teamId = c.req.param('teamId');
  const season = c.req.query('season');
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  try {
    if (sport !== 'NBA') {
      return c.json({ teamId, sport, splits: null, source: 'unavailable' });
    }
    const selectedSeason = season ? parseInt(season, 10) : new Date().getFullYear();
    const alias = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
    if (!alias) {
      return c.json({ teamId, sport, splits: null, source: 'unavailable' });
    }
    const splitByAlias = await fetchNbaEspnSplitRecordsByAlias(selectedSeason);
    const split = splitByAlias.get(alias) || null;
    return c.json({
      teamId,
      sport,
      season: selectedSeason,
      alias,
      splits: split,
      source: split ? 'espn_core_standings' : 'unavailable',
    });
  } catch (err) {
    console.error('[Teams API] Splits error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get team injuries
 * GET /api/teams/:sport/:teamId/injuries
 */
teams.get('/:sport/:teamId/injuries', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const teamId = c.req.param('teamId');
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}` }, 400);
  }
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  try {
    if (sport === 'NBA') {
      const alias = await resolveNbaTeamAliasForFallback(c.env.DB, teamId, apiKey);
      const fallback = await fetchNbaEspnInjuriesByAlias(alias);
      if (fallback.error) {
        return c.json({ error: fallback.error }, 500);
      }
      return c.json({
        teamId,
        injuries: fallback.injuries,
        source: fallback.source,
      });
    }
    return c.json({
      teamId,
      injuries: [],
      source: 'unavailable',
    });
  } catch (err) {
    console.error('[Teams API] Injuries error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get team profile with roster and venue
 * GET /api/teams/:sport/:teamId
 * 
 * IMPORTANT: This must be the LAST route because it matches any /:sport/:teamId pattern
 */
teams.get('/:sport/:teamId', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const teamId = c.req.param('teamId');
  
  if (!VALID_SPORTS.includes(sport)) {
    return c.json({ error: `Invalid sport: ${sport}. Valid: ${VALID_SPORTS.join(', ')}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use cached version - 1 hour TTL
    const result = await fetchTeamProfileCached(
      c.env.DB,
      sport as SportKey,
      teamId,
      apiKey
    );
    
    if (result.errors.length > 0 && !result.team) {
      return c.json({ error: result.errors[0] }, 500);
    }
    
    let roster = Array.isArray(result.roster) ? result.roster : [];
    if (sport === 'NBA' && roster.length > 0) {
      const alias = String(result.team?.alias || '').trim().toUpperCase();
      const espnRoster = await fetchNbaEspnRosterHeadshotsByAlias(alias).catch(() => ({ byName: new Map() }));
      if (espnRoster.byName.size > 0) {
        roster = roster.map((player: any) => {
          const key = normalizePersonKey(player?.name || `${player?.firstName || ''} ${player?.lastName || ''}`);
          const hit = key ? espnRoster.byName.get(key) : undefined;
          if (!hit) return player;
          return {
            ...player,
            headshot: player?.headshot || hit.headshot || null,
            jerseyNumber: player?.jerseyNumber || hit.jersey || player?.jerseyNumber,
            position: player?.position || hit.position || player?.position,
          };
        });
      }
    }
    return c.json({
      team: result.team,
      roster,
      venue: result.venue,
      errors: result.errors,
      cached: true
    });
    
  } catch (err) {
    console.error('[Teams API] Profile error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

export default teams;
