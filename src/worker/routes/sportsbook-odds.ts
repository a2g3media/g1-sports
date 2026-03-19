/**
 * Sportsbook Odds Comparison API Routes
 * Endpoints for fetching multi-sportsbook odds comparison
 */

import { Hono } from 'hono';
import { authMiddleware } from '@getmocha/users-service/backend';
import {
  fetchAllSportsbooksForGame,
} from '../services/sportsRadarOddsService';
import { fetchGameWithFallback, fetchGamesWithFallback, type SportKey } from '../services/providers';
import { getTodayEasternDateString } from '../services/dateUtils';

type Env = {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_ODDS_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

type SportsbookMeta = {
  id: string;
  name: string;
  shortName: string;
  color: string;
};

const SPORTSBOOKS: Record<string, SportsbookMeta> = {
  consensus: { id: 'consensus', name: 'Consensus', shortName: 'CONS', color: '#6B7280' },
  draftkings: { id: 'draftkings', name: 'DraftKings', shortName: 'DK', color: '#53D337' },
  fanduel: { id: 'fanduel', name: 'FanDuel', shortName: 'FD', color: '#1493FF' },
  betmgm: { id: 'betmgm', name: 'BetMGM', shortName: 'MGM', color: '#BFA05A' },
  caesars: { id: 'caesars', name: 'Caesars', shortName: 'CZR', color: '#004833' },
  pointsbet: { id: 'pointsbet', name: 'PointsBet', shortName: 'PB', color: '#ED1B2E' },
  bet365: { id: 'bet365', name: 'bet365', shortName: '365', color: '#147B45' },
};
const DEFAULT_SPORTSBOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'consensus'];

type DegradedResponseMeta = {
  provider: 'sportsradar';
  degraded: true;
  fallback_type: "no_coverage" | "provider_error" | "auth_config";
  fallback_reason: string;
  next_action: string;
  retriable: boolean;
  fetchedAt: string;
  details?: string;
};

// Demo mode check
function isDemoMode(c: any): boolean {
  return c.req.header('X-Demo-Mode') === 'true';
}

// Demo/auth middleware
async function demoOrAuthMiddleware(c: any, next: () => Promise<void>) {
  if (isDemoMode(c)) {
    return await next();
  }
  return await authMiddleware(c, next);
}

function toSportKey(value: string | undefined): SportKey | null {
  if (!value) return null;
  const sport = value.toLowerCase() as SportKey;
  const supported: SportKey[] = ['nfl', 'nba', 'mlb', 'nhl', 'ncaaf', 'ncaab', 'soccer', 'mma', 'golf'];
  return supported.includes(sport) ? sport : null;
}

function normalizeBookId(name: string | undefined): string {
  const value = (name || '').toLowerCase();
  if (value.includes('draft')) return 'draftkings';
  if (value.includes('fan duel') || value.includes('fanduel')) return 'fanduel';
  if (value.includes('mgm')) return 'betmgm';
  if (value.includes('caesar')) return 'caesars';
  if (value.includes('pointsbet')) return 'pointsbet';
  if (value.includes('365')) return 'bet365';
  if (value.includes('consensus')) return 'consensus';
  return value.replace(/\s+/g, '-');
}

function degradedPayload(
  fallback_type: "no_coverage" | "provider_error" | "auth_config",
  fallback_reason: string,
  next_action: string,
  retriable: boolean,
  details?: string
): DegradedResponseMeta {
  return {
    provider: 'sportsradar',
    degraded: true,
    fallback_type,
    fallback_reason,
    next_action,
    retriable,
    fetchedAt: new Date().toISOString(),
    details,
  };
}

function calculateBest(oddsRows: Array<{
  sportsbook: SportsbookMeta;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeML: number | null;
  awayML: number | null;
}>) {
  let bestSpread: { sportsbook: string; value: number; odds: number } | null = null;
  let bestTotal: { sportsbook: string; value: number; type: 'over' | 'under'; odds: number } | null = null;
  let bestHomeML: { sportsbook: string; value: number } | null = null;
  let bestAwayML: { sportsbook: string; value: number } | null = null;

  for (const row of oddsRows) {
    if (row.spread !== null && row.spreadOdds !== null) {
      if (!bestSpread || row.spreadOdds > bestSpread.odds) {
        bestSpread = { sportsbook: row.sportsbook.id, value: row.spread, odds: row.spreadOdds };
      }
    }
    if (row.total !== null && row.overOdds !== null) {
      if (!bestTotal || row.overOdds > bestTotal.odds) {
        bestTotal = { sportsbook: row.sportsbook.id, value: row.total, type: 'over', odds: row.overOdds };
      }
    }
    if (row.homeML !== null && (!bestHomeML || row.homeML > bestHomeML.value)) {
      bestHomeML = { sportsbook: row.sportsbook.id, value: row.homeML };
    }
    if (row.awayML !== null && (!bestAwayML || row.awayML > bestAwayML.value)) {
      bestAwayML = { sportsbook: row.sportsbook.id, value: row.awayML };
    }
  }

  return { bestSpread, bestTotal, bestHomeML, bestAwayML };
}

// ============================================
// GET /api/sportsbook-odds/sportsbooks
// List all available sportsbooks
// ============================================

app.get('/sportsbooks', async (c) => {
  const all = Object.values(SPORTSBOOKS);
  const defaults = DEFAULT_SPORTSBOOKS.map((id) => SPORTSBOOKS[id]).filter(Boolean);
  
  return c.json({
    sportsbooks: all,
    defaults: defaults.map(s => s.id),
    count: all.length,
  });
});

// ============================================
// GET /api/sportsbook-odds/game/:gameId
// Get multi-sportsbook odds comparison for a game
// ============================================

app.get('/game/:gameId', demoOrAuthMiddleware, async (c) => {
  const { gameId } = c.req.param();
  const sport = c.req.query('sport') || 'nfl';
  const homeTeam = c.req.query('homeTeam') || '';
  const awayTeam = c.req.query('awayTeam') || '';
  const booksParam = c.req.query('sportsbooks');
  
  const sportsbookIds = booksParam 
    ? booksParam.split(',').map((id) => id.toLowerCase()).filter(id => SPORTSBOOKS[id])
    : DEFAULT_SPORTSBOOKS;
  const sportKey = toSportKey(sport);
  if (!sportKey) {
    return c.json({ error: 'Unsupported sport' }, 400);
  }

  const mainKey = c.env.SPORTSRADAR_API_KEY;
  const oddsKey = c.env.SPORTSRADAR_ODDS_KEY || c.env.SPORTSRADAR_API_KEY;
  if (!mainKey || isDemoMode(c)) {
    const fallbackReason = isDemoMode(c)
      ? "Demo mode request - skipping live SportsRadar sportsbook fetch"
      : "SPORTSRADAR_API_KEY not set";
    return c.json({
      error: 'Sportsbook comparison unavailable',
      ...degradedPayload(
        "auth_config",
        fallbackReason,
        isDemoMode(c)
          ? 'Disable demo mode or use static development fixtures.'
          : 'Set SPORTSRADAR_API_KEY and retry this endpoint.',
        !isDemoMode(c)
      ),
      odds: [],
      gameId,
      sport: sportKey.toUpperCase(),
    }, 503);
  }

  let resolvedHome = homeTeam;
  let resolvedAway = awayTeam;
  if (!resolvedHome || !resolvedAway) {
    const gameResult = await fetchGameWithFallback(gameId);
    const game = gameResult.data?.game;
    resolvedHome = resolvedHome || game?.home_team_name || game?.home_team_code || 'HOME';
    resolvedAway = resolvedAway || game?.away_team_name || game?.away_team_code || 'AWAY';
    if (!game && gameResult.error) {
      return c.json({
        error: 'Unable to resolve teams for sportsbook lookup',
        ...degradedPayload(
          "provider_error",
          `Game resolution failed via ${gameResult.provider || 'provider chain'}`,
          'Verify gameId and ensure primary/fallback game feeds are healthy.',
          true,
          gameResult.error
        ),
        gameId,
        sport: sportKey.toUpperCase(),
        odds: [],
      }, 424);
    }
  }

  try {
    const allBooks = await fetchAllSportsbooksForGame(
      sportKey,
      mainKey,
      c.env.DB,
      resolvedHome,
      resolvedAway,
      oddsKey
    );
    const normalized = allBooks.map((row) => {
      const bookId = normalizeBookId(row.sportsbook);
      const meta = SPORTSBOOKS[bookId] || {
        id: bookId,
        name: row.sportsbook,
        shortName: row.sportsbook.slice(0, 4).toUpperCase(),
        color: '#6B7280',
      };
      return {
        sportsbook: meta,
        spread: row.spreadHome ?? null,
        spreadOdds: -110,
        total: row.total ?? null,
        overOdds: -110,
        underOdds: -110,
        homeML: row.moneylineHome ?? null,
        awayML: row.moneylineAway ?? null,
        lastUpdated: row.updatedAt || new Date().toISOString(),
      };
    }).filter((row) => sportsbookIds.includes(row.sportsbook.id));

    const best = calculateBest(normalized);
    if (normalized.length === 0) {
      return c.json({
        error: 'No sportsbook rows returned for requested game',
        ...degradedPayload(
          "no_coverage",
          'SportsRadar returned no sportsbook lines for this matchup',
          'Retry closer to game time or verify sportsbook coverage for this sport.',
          true
        ),
        gameId,
        sport: sportKey.toUpperCase(),
        homeTeam: resolvedHome,
        awayTeam: resolvedAway,
        odds: [],
      }, 200);
    }
    return c.json({
      gameId,
      sport: sportKey.toUpperCase(),
      homeTeam: resolvedHome,
      awayTeam: resolvedAway,
      odds: normalized,
      ...best,
      provider: 'sportsradar',
      degraded: false,
      fallback_reason: null,
      next_action: null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('SportsRadar sportsbook odds fetch error:', err);
    return c.json({
      error: 'Failed to fetch sportsbook odds',
      ...degradedPayload(
        "provider_error",
        'Upstream sportsbook odds request failed',
        'Retry request and inspect SportsRadar upstream status / rate limits.',
        true,
        err.message
      ),
      gameId,
      sport: sportKey.toUpperCase(),
      odds: [],
    }, 502);
  }
});

// ============================================
// GET /api/sportsbook-odds/compare
// Get multi-sportsbook odds for multiple games
// ============================================

app.get('/compare', demoOrAuthMiddleware, async (c) => {
  const sport = c.req.query('sport') || 'nfl';
  const date = c.req.query('date') || getTodayEasternDateString();
  const booksParam = c.req.query('sportsbooks');
  
  const sportsbookIds = booksParam 
    ? booksParam.split(',').map((id) => id.toLowerCase()).filter(id => SPORTSBOOKS[id])
    : DEFAULT_SPORTSBOOKS;
  const sportKey = toSportKey(sport);
  if (!sportKey) {
    return c.json({ error: 'Unsupported sport' }, 400);
  }

  const mainKey = c.env.SPORTSRADAR_API_KEY;
  const oddsKey = c.env.SPORTSRADAR_ODDS_KEY || c.env.SPORTSRADAR_API_KEY;
  if (!mainKey || isDemoMode(c)) {
    const fallbackReason = isDemoMode(c)
      ? "Demo mode request - skipping live SportsRadar compare fetch"
      : "SPORTSRADAR_API_KEY not set";
    return c.json({
      error: 'Sportsbook compare unavailable',
      ...degradedPayload(
        "auth_config",
        fallbackReason,
        isDemoMode(c)
          ? 'Disable demo mode to query live sportsbook comparisons.'
          : 'Configure SPORTSRADAR_API_KEY and retry compare.',
        !isDemoMode(c)
      ),
      sport: sportKey,
      date,
      games: [],
      sportsbooks: sportsbookIds.map((id) => SPORTSBOOKS[id]),
    }, 503);
  }

  try {
    const gamesResult = await fetchGamesWithFallback(sportKey, { date });
    if (gamesResult.error && gamesResult.data.length === 0) {
      return c.json({
        error: 'No games available for sportsbook comparison',
        ...degradedPayload(
          "provider_error",
          `Provider chain returned no games (${gamesResult.provider})`,
          'Validate provider health and retry once games are available.',
          true,
          gamesResult.error
        ),
        sport: sportKey.toUpperCase(),
        date,
        games: [],
        sportsbooks: sportsbookIds.map(id => SPORTSBOOKS[id]),
      }, 503);
    }
    const games = gamesResult.data.slice(0, 20);
    if (games.length === 0) {
      return c.json({
        error: 'No scheduled games found for comparison window',
        ...degradedPayload(
          "no_coverage",
          'Game feed returned an empty slate',
          'Retry with another date or verify this sport has active events.',
          true
        ),
        sport: sportKey.toUpperCase(),
        date,
        games: [],
        sportsbooks: sportsbookIds.map(id => SPORTSBOOKS[id]),
      }, 200);
    }

    const comparisons = [];
    const warnings: string[] = [];
    for (const game of games) {
      let odds: any[] = [];
      try {
        const allBooks = await fetchAllSportsbooksForGame(
          sportKey,
          mainKey,
          c.env.DB,
          game.home_team_name,
          game.away_team_name,
          oddsKey
        );
        odds = allBooks.map((row) => {
          const bookId = normalizeBookId(row.sportsbook);
          const sportsbook = SPORTSBOOKS[bookId] || {
            id: bookId,
            name: row.sportsbook,
            shortName: row.sportsbook.slice(0, 4).toUpperCase(),
            color: '#6B7280',
          };
          return {
            sportsbook,
            spread: row.spreadHome ?? null,
            spreadOdds: -110,
            total: row.total ?? null,
            overOdds: -110,
            underOdds: -110,
            homeML: row.moneylineHome ?? null,
            awayML: row.moneylineAway ?? null,
          };
        }).filter((row) => sportsbookIds.includes(row.sportsbook.id));
      } catch (err: any) {
        warnings.push(`${game.game_id}: ${err?.message || 'fetch failed'}`);
      }

      comparisons.push({
        gameId: game.game_id,
        homeTeam: game.home_team_code || game.home_team_name,
        awayTeam: game.away_team_code || game.away_team_name,
        startTime: game.start_time,
        status: game.status,
        odds,
      });
    }

    const degraded = warnings.length > 0 || comparisons.every((game) => game.odds.length === 0);
    return c.json({
      sport: sportKey.toUpperCase(),
      date,
      provider: 'sportsradar',
      degraded,
      fallback_reason: degraded ? 'Partial sportsbook coverage in compare response' : null,
      next_action: degraded ? 'Retry endpoint and inspect warnings for game-level provider failures.' : null,
      sportsbooks: sportsbookIds.map(id => SPORTSBOOKS[id]),
      games: comparisons,
      warnings,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('SportsRadar compare fetch error:', err);
    return c.json({
      error: 'Failed to fetch SportsRadar comparison',
      ...degradedPayload(
        "provider_error",
        'Upstream compare request failed',
        'Retry request and verify provider health.',
        true,
        err.message
      ),
      sport: sportKey.toUpperCase(),
      date,
      games: [],
      sportsbooks: sportsbookIds.map(id => SPORTSBOOKS[id]),
    }, 502);
  }
});

export default app;
