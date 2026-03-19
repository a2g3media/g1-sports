/**
 * Multi-Sportsbook Odds Service
 * Sportsbook comparison compatibility layer.
 * Legacy provider fetch path is disabled during SportsRadar-only migration.
 */

// Sportsbook configuration
export interface Sportsbook {
  id: string;
  name: string;
  shortName: string;
  color: string;
  logo?: string;
}

// Known sportsbook identities for UI rendering/comparison.
export const SPORTSBOOKS: Record<string, Sportsbook> = {
  G1100: { id: 'G1100', name: 'DraftKings', shortName: 'DK', color: '#53D337' },
  G1101: { id: 'G1101', name: 'FanDuel', shortName: 'FD', color: '#1493FF' },
  G1103: { id: 'G1103', name: 'BetMGM', shortName: 'MGM', color: '#BFA05A' },
  G1104: { id: 'G1104', name: 'Caesars', shortName: 'CZR', color: '#004833' },
  G1110: { id: 'G1110', name: 'PointsBet', shortName: 'PB', color: '#ED1B2E' },
  G1111: { id: 'G1111', name: 'BetRivers', shortName: 'BR', color: '#1E5C37' },
  G1112: { id: 'G1112', name: 'Unibet', shortName: 'UNI', color: '#147B45' },
  G1113: { id: 'G1113', name: 'WynnBET', shortName: 'WYNN', color: '#BD9B60' },
  G1116: { id: 'G1116', name: 'Parx', shortName: 'PARX', color: '#B71C1C' },
  G1117: { id: 'G1117', name: 'Fanatics', shortName: 'FAN', color: '#006241' },
};

// Default sportsbooks to compare (most popular)
export const DEFAULT_SPORTSBOOKS = ['G1100', 'G1101', 'G1103', 'G1104', 'G1117'];

// Sport key mapping retained for compatibility.
const SPORT_PATHS: Record<string, string> = {
  NFL: 'nfl',
  NBA: 'nba',
  NCAAB: 'cbb',
  NHL: 'nhl',
  MLB: 'mlb',
  WNBA: 'wnba',
};

export interface SportsbookOdds {
  sportsbook: Sportsbook;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeML: number | null;
  awayML: number | null;
  lastUpdated: string | null;
}

export interface MultiBookOdds {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  odds: SportsbookOdds[];
  bestSpread: { sportsbook: string; value: number; odds: number } | null;
  bestTotal: { sportsbook: string; value: number; type: 'over' | 'under'; odds: number } | null;
  bestHomeML: { sportsbook: string; value: number } | null;
  bestAwayML: { sportsbook: string; value: number } | null;
  fetchedAt: string;
}

/**
 * Fetch odds from a specific sportsbook for a date
 */
async function fetchOddsFromSportsbook(
  apiKey: string,
  sport: string,
  date: string,
  sportsbookId: string
): Promise<any[]> {
  void apiKey;
  void sport;
  void date;
  void sportsbookId;
  void SPORT_PATHS;
  // SportsRadar-only migration: return no remote sportsbook payloads here.
  return [];
}

/**
 * Extract odds for a specific sportsbook from game data
 */
function extractSportsbookOdds(game: any, sportsbookId: string): SportsbookOdds | null {
  const sportsbook = SPORTSBOOKS[sportsbookId];
  if (!sportsbook) return null;

  // Find matching pregame odds for this sportsbook
  const pregameOdds = game.PregameOdds || [];
  const bookOdds = pregameOdds.find((o: any) => 
    o.Sportsbook === sportsbook.name || 
    o.SportsbookId === sportsbookId ||
    o.Sportsbook?.toLowerCase().includes(sportsbook.name.toLowerCase())
  );

  if (!bookOdds) {
    return {
      sportsbook,
      spread: null,
      spreadOdds: null,
      total: null,
      overOdds: null,
      underOdds: null,
      homeML: null,
      awayML: null,
      lastUpdated: null,
    };
  }

  return {
    sportsbook,
    spread: bookOdds.HomePointSpread ?? bookOdds.PointSpread ?? null,
    spreadOdds: bookOdds.HomePointSpreadPayout ?? null,
    total: bookOdds.OverUnder ?? bookOdds.TotalPoints ?? null,
    overOdds: bookOdds.OverPayout ?? null,
    underOdds: bookOdds.UnderPayout ?? null,
    homeML: bookOdds.HomeMoneyLine ?? null,
    awayML: bookOdds.AwayMoneyLine ?? null,
    lastUpdated: bookOdds.Updated ?? null,
  };
}

/**
 * Calculate best odds across all sportsbooks
 */
function calculateBestOdds(odds: SportsbookOdds[]): {
  bestSpread: MultiBookOdds['bestSpread'];
  bestTotal: MultiBookOdds['bestTotal'];
  bestHomeML: MultiBookOdds['bestHomeML'];
  bestAwayML: MultiBookOdds['bestAwayML'];
} {
  let bestSpread: MultiBookOdds['bestSpread'] = null;
  let bestTotal: MultiBookOdds['bestTotal'] = null;
  let bestHomeML: MultiBookOdds['bestHomeML'] = null;
  let bestAwayML: MultiBookOdds['bestAwayML'] = null;

  for (const o of odds) {
    // Best spread (most favorable to bettor = highest number if negative, lowest if positive)
    if (o.spread !== null && o.spreadOdds !== null) {
      if (!bestSpread || o.spreadOdds > bestSpread.odds) {
        bestSpread = {
          sportsbook: o.sportsbook.id,
          value: o.spread,
          odds: o.spreadOdds,
        };
      }
    }

    // Best total over (highest payout)
    if (o.total !== null && o.overOdds !== null) {
      if (!bestTotal || o.overOdds > bestTotal.odds) {
        bestTotal = {
          sportsbook: o.sportsbook.id,
          value: o.total,
          type: 'over',
          odds: o.overOdds,
        };
      }
    }

    // Best home ML (highest payout)
    if (o.homeML !== null) {
      if (!bestHomeML || o.homeML > bestHomeML.value) {
        bestHomeML = {
          sportsbook: o.sportsbook.id,
          value: o.homeML,
        };
      }
    }

    // Best away ML (highest payout)
    if (o.awayML !== null) {
      if (!bestAwayML || o.awayML > bestAwayML.value) {
        bestAwayML = {
          sportsbook: o.sportsbook.id,
          value: o.awayML,
        };
      }
    }
  }

  return { bestSpread, bestTotal, bestHomeML, bestAwayML };
}

/**
 * Fetch odds comparison for a specific game from multiple sportsbooks
 */
export async function getMultiBookOdds(
  apiKey: string,
  gameId: string,
  sport: string,
  date: string,
  homeTeam: string,
  awayTeam: string,
  sportsbookIds: string[] = DEFAULT_SPORTSBOOKS
): Promise<MultiBookOdds> {
  // SportsRadar-only migration mode: service returns deterministic null odds
  // until dedicated sportsbook feed ingestion is wired.
  const allGames = await fetchOddsFromSportsbook(apiKey, sport, date, 'G1001');
  
  // Find our target game
  const targetGame = allGames.find((g: any) => 
    g.GameId?.toString() === gameId ||
    g.GlobalGameId?.toString() === gameId ||
    (g.HomeTeam === homeTeam && g.AwayTeam === awayTeam)
  );

  const odds: SportsbookOdds[] = [];

  if (targetGame) {
    // Extract odds for each requested sportsbook
    for (const sbId of sportsbookIds) {
      const sbOdds = extractSportsbookOdds(targetGame, sbId);
      if (sbOdds) {
        odds.push(sbOdds);
      }
    }
  } else {
    // No game found, return empty odds for all sportsbooks
    for (const sbId of sportsbookIds) {
      const sportsbook = SPORTSBOOKS[sbId];
      if (sportsbook) {
        odds.push({
          sportsbook,
          spread: null,
          spreadOdds: null,
          total: null,
          overOdds: null,
          underOdds: null,
          homeML: null,
          awayML: null,
          lastUpdated: null,
        });
      }
    }
  }

  const bestOdds = calculateBestOdds(odds);

  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    odds,
    ...bestOdds,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Get all available sportsbooks
 */
export function getAllSportsbooks(): Sportsbook[] {
  return Object.values(SPORTSBOOKS);
}

/**
 * Get default sportsbooks for comparison
 */
export function getDefaultSportsbooks(): Sportsbook[] {
  return DEFAULT_SPORTSBOOKS.map(id => SPORTSBOOKS[id]).filter(Boolean);
}
