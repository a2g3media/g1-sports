/**
 * Futures API Routes
 * Championship odds, MVP markets, and season-long betting markets
 * Uses SportsRadar Futures API when available, with mock data fallback
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getCachedData, setCachedData } from "../services/apiCacheService";

interface Env {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_ODDS_KEY?: string;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
  SPORTSRADAR_PROPS_KEY?: string;
}

const futures = new Hono<{ Bindings: Env }>();

// Competition IDs for SportsRadar Futures (oddscomparison-futures product).
// Verified against odds API 2026-03-20.
const COMPETITION_IDS: Record<string, string> = {
  nba: "sr:competition:132",
  nfl: "sr:competition:31",
  mlb: "sr:competition:109",
  nhl: "sr:competition:234",
  ncaab: "sr:competition:28370",
  ncaaf: "sr:competition:27653",
};

// Market type to SportsRadar market name mapping
const MARKET_MAPPINGS: Record<string, string[]> = {
  championship: ["outright", "winner", "championship", "to_win"],
  mvp: ["mvp", "most_valuable_player", "season_mvp"],
  conference: ["conference_winner", "division_winner", "pennant"],
  win_total: ["season_wins", "win_total", "regular_season_wins"],
};

// Cache TTL - 30 minutes for futures (they don't change frequently)
const FUTURES_CACHE_TTL = 30 * 60;

function getSportsRadarKeyChain(env: Env) {
  return [
    { name: "SPORTSRADAR_ODDS_KEY", key: env.SPORTSRADAR_ODDS_KEY },
    { name: "SPORTSRADAR_PLAYER_PROPS_KEY", key: env.SPORTSRADAR_PLAYER_PROPS_KEY },
    { name: "SPORTSRADAR_PROPS_KEY", key: env.SPORTSRADAR_PROPS_KEY },
    { name: "SPORTSRADAR_API_KEY", key: env.SPORTSRADAR_API_KEY },
  ].filter((entry): entry is { name: string; key: string } => Boolean(entry.key));
}

/**
 * GET /api/futures/:sport/:marketType
 * Returns futures odds for a specific sport and market type
 */
futures.get("/:sport/:marketType", async (c: Context<{ Bindings: Env }>) => {
  const sport = c.req.param("sport")?.toLowerCase() || "";
  const marketType = c.req.param("marketType")?.toLowerCase() || "";
  
  if (!COMPETITION_IDS[sport]) {
    return c.json({ error: "Unsupported sport" }, 400);
  }
  
  if (!MARKET_MAPPINGS[marketType]) {
    return c.json({ error: "Unsupported market type" }, 400);
  }
  
  const cacheKey = `futures_${sport}_${marketType}`;
  
  // Check cache first
  try {
    const cached = await getCachedData(c.env.DB, cacheKey);
    if (cached) {
      console.log(`[Futures] Cache hit for ${sport}/${marketType}`);
      return c.json(cached);
    }
  } catch (err) {
    console.error("[Futures] Cache read error:", err);
  }
  
  // Try SportsRadar Futures API with ordered key precedence
  const keyChain = getSportsRadarKeyChain(c.env);
  for (const keyInfo of keyChain) {
    try {
      const futuresData = await fetchSportsRadarFutures(sport, marketType, keyInfo.key);
      if (futuresData && futuresData.outcomes.length > 0) {
        const response = {
          ...futuresData,
          source: "sportsradar",
          keyUsed: keyInfo.name,
          fallback_reason: null,
        };
        // Cache the result
        try {
          await setCachedData(c.env.DB, cacheKey, "futures", sport, response, FUTURES_CACHE_TTL);
        } catch (err) {
          console.error("[Futures] Cache write error:", err);
        }
        return c.json(response);
      }
    } catch (err) {
      console.error(`[Futures] SportsRadar fetch error with ${keyInfo.name}:`, err);
    }
  }
  
  // Fallback to mock data
  console.log(`[Futures] Using mock data for ${sport}/${marketType}`);
  const mockData = getMockFutures(sport, marketType);
  
  // Cache mock data with shorter TTL
  try {
    await setCachedData(c.env.DB, cacheKey, "futures_mock", sport, mockData, 10 * 60);
  } catch (err) {
    // Ignore cache errors
  }
  
  return c.json({
    ...mockData,
    source: "fallback_mock",
    keyUsed: keyChain[0]?.name || null,
    fallback_reason: keyChain.length === 0
      ? "No SportsRadar key configured"
      : "SportsRadar returned no futures outcomes for this market",
  });
});

/**
 * Fetch futures from SportsRadar Futures API
 */
async function fetchSportsRadarFutures(
  sport: string,
  marketType: string,
  apiKey: string
): Promise<FuturesMarket | null> {
  const competitionId = COMPETITION_IDS[sport];
  const marketNames = MARKET_MAPPINGS[marketType];
  
  // SportsRadar Futures endpoint
  // Trial: https://api.sportradar.com/oddscomparison-futures/trial/v2
  // Production: https://api.sportradar.com/oddscomparison-futures/production/v2
  const urls = [
    `https://api.sportradar.com/oddscomparison-futures/production/v2/en/competitions/${encodeURIComponent(competitionId)}/outrights.json?api_key=${apiKey}`,
    `https://api.sportradar.com/oddscomparison-futures/trial/v2/en/competitions/${encodeURIComponent(competitionId)}/outrights.json?api_key=${apiKey}`,
  ];
  
  for (const url of urls) {
    try {
      console.log(`[Futures] Fetching: ${url.split("?")[0]}`);
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        console.log(`[Futures] Response keys:`, Object.keys(data));
        
        // Parse the response
        const outrights = data.outrights || data.competition_outrights || [];
        const outcomes: FutureOdds[] = [];
        
        for (const outright of outrights) {
          const outrightName = (outright.name || "").toLowerCase();
          
          // Check if this outright matches our market type
          const matches = marketNames.some((name) => outrightName.includes(name));
          if (!matches && outrights.length > 1) continue;
          
          // Parse outcomes from books
          const markets = outright.markets || [];
          for (const market of markets) {
            const books = market.books || [];
            const book = books[0]; // Use first bookmaker
            
            if (!book?.outcomes) continue;
            
            for (const outcome of book.outcomes) {
              if (outcome.name && outcome.odds) {
                outcomes.push({
                  id: outcome.id || `${sport}_${outcomes.length}`,
                  name: outcome.name,
                  odds: decimalToAmerican(outcome.odds),
                  change: outcome.odds !== outcome.open_odds
                    ? Math.round((decimalToAmerican(outcome.open_odds || outcome.odds) - decimalToAmerican(outcome.odds)))
                    : 0,
                });
              }
            }
          }
        }
        
        if (outcomes.length > 0) {
          // Sort by odds (favorites first)
          outcomes.sort((a, b) => {
            const aAbs = a.odds > 0 ? a.odds : Math.abs(a.odds);
            const bAbs = b.odds > 0 ? b.odds : Math.abs(b.odds);
            return aAbs - bAbs;
          });
          
          return {
            sport,
            marketType,
            title: getMarketTitle(sport, marketType),
            outcomes: outcomes.slice(0, 20), // Top 20
            lastUpdated: new Date().toISOString(),
          };
        }
      } else if (response.status === 429) {
        console.log(`[Futures] Rate limited (429)`);
        break;
      } else {
        console.log(`[Futures] API error: ${response.status}`);
      }
    } catch (err) {
      console.error(`[Futures] Fetch error:`, err);
    }
  }
  
  return null;
}

function decimalToAmerican(decimal: number): number {
  if (!decimal || decimal <= 1) return 100;
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

function getMarketTitle(sport: string, marketType: string): string {
  const sportNames: Record<string, string> = {
    nba: "NBA",
    nfl: "NFL",
    mlb: "MLB",
    nhl: "NHL",
  };
  
  const marketTitles: Record<string, Record<string, string>> = {
    nba: {
      championship: "NBA Championship 2025-26",
      mvp: "NBA MVP 2025-26",
      conference: "NBA Conference Winners 2025-26",
      win_total: "NBA Regular Season Win Totals 2025-26",
    },
    nfl: {
      championship: "Super Bowl LX Winner",
      mvp: "NFL MVP 2025",
      conference: "NFL Conference Winners 2025",
      win_total: "NFL Regular Season Win Totals 2025",
    },
    mlb: {
      championship: "World Series 2025 Winner",
      mvp: "MLB MVP 2025",
      conference: "MLB League Pennant 2025",
      win_total: "MLB Season Win Totals 2025",
    },
    nhl: {
      championship: "Stanley Cup 2025-26 Winner",
      mvp: "Hart Trophy (NHL MVP) 2025-26",
      conference: "NHL Conference Winners 2025-26",
      win_total: "NHL Point Totals 2025-26",
    },
  };
  
  return marketTitles[sport]?.[marketType] || `${sportNames[sport] || sport.toUpperCase()} ${marketType.replace("_", " ")}`;
}

interface FutureOdds {
  id: string;
  name: string;
  odds: number;
  change?: number;
  logo?: string;
}

interface FuturesMarket {
  sport: string;
  marketType: string;
  title: string;
  outcomes: FutureOdds[];
  lastUpdated?: string;
}

// Mock data for when API is unavailable
function getMockFutures(sport: string, marketType: string): FuturesMarket {
  const mockData: Record<string, Record<string, FuturesMarket>> = {
    nba: {
      championship: {
        sport: "nba",
        marketType: "championship",
        title: "NBA Championship 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Boston Celtics", odds: 350, change: -50 },
          { id: "2", name: "Denver Nuggets", odds: 450, change: 25 },
          { id: "3", name: "Oklahoma City Thunder", odds: 500, change: -100 },
          { id: "4", name: "Milwaukee Bucks", odds: 800, change: 0 },
          { id: "5", name: "Phoenix Suns", odds: 1000, change: 50 },
          { id: "6", name: "Los Angeles Lakers", odds: 1200, change: -100 },
          { id: "7", name: "Golden State Warriors", odds: 1400, change: 100 },
          { id: "8", name: "Philadelphia 76ers", odds: 1500, change: 0 },
          { id: "9", name: "Miami Heat", odds: 2000, change: -200 },
          { id: "10", name: "Dallas Mavericks", odds: 2200, change: 100 },
        ],
      },
      mvp: {
        sport: "nba",
        marketType: "mvp",
        title: "NBA MVP 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Luka Dončić", odds: 300, change: -50 },
          { id: "2", name: "Nikola Jokić", odds: 350, change: 0 },
          { id: "3", name: "Giannis Antetokounmpo", odds: 400, change: 25 },
          { id: "4", name: "Jayson Tatum", odds: 600, change: -100 },
          { id: "5", name: "Shai Gilgeous-Alexander", odds: 700, change: -150 },
          { id: "6", name: "Anthony Edwards", odds: 1200, change: -200 },
        ],
      },
      conference: {
        sport: "nba",
        marketType: "conference",
        title: "NBA Conference Winners 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Boston Celtics (East)", odds: 175, change: -25 },
          { id: "2", name: "Milwaukee Bucks (East)", odds: 400, change: 50 },
          { id: "3", name: "Denver Nuggets (West)", odds: 250, change: 0 },
          { id: "4", name: "Oklahoma City Thunder (West)", odds: 300, change: -75 },
        ],
      },
      win_total: {
        sport: "nba",
        marketType: "win_total",
        title: "NBA Regular Season Win Totals 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Boston Celtics O/U 56.5", odds: -110, change: 0 },
          { id: "2", name: "Denver Nuggets O/U 53.5", odds: -110, change: 0 },
          { id: "3", name: "Milwaukee Bucks O/U 52.5", odds: -110, change: 0 },
        ],
      },
    },
    nfl: {
      championship: {
        sport: "nfl",
        marketType: "championship",
        title: "Super Bowl LX Winner",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Kansas City Chiefs", odds: 500, change: -50 },
          { id: "2", name: "San Francisco 49ers", odds: 600, change: 0 },
          { id: "3", name: "Philadelphia Eagles", odds: 800, change: -100 },
          { id: "4", name: "Detroit Lions", odds: 900, change: -150 },
          { id: "5", name: "Baltimore Ravens", odds: 1000, change: 50 },
        ],
      },
      mvp: {
        sport: "nfl",
        marketType: "mvp",
        title: "NFL MVP 2025",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Patrick Mahomes", odds: 400, change: 0 },
          { id: "2", name: "Josh Allen", odds: 500, change: -50 },
          { id: "3", name: "Lamar Jackson", odds: 600, change: 0 },
        ],
      },
      conference: {
        sport: "nfl",
        marketType: "conference",
        title: "NFL Conference Winners 2025",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Kansas City Chiefs (AFC)", odds: 300, change: 0 },
          { id: "2", name: "San Francisco 49ers (NFC)", odds: 275, change: 0 },
        ],
      },
      win_total: {
        sport: "nfl",
        marketType: "win_total",
        title: "NFL Regular Season Win Totals 2025",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Kansas City Chiefs O/U 11.5", odds: -110, change: 0 },
          { id: "2", name: "San Francisco 49ers O/U 11.5", odds: -115, change: 0 },
        ],
      },
    },
    mlb: {
      championship: {
        sport: "mlb",
        marketType: "championship",
        title: "World Series 2025 Winner",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Los Angeles Dodgers", odds: 350, change: -75 },
          { id: "2", name: "Atlanta Braves", odds: 500, change: 0 },
          { id: "3", name: "Houston Astros", odds: 700, change: 50 },
        ],
      },
      mvp: {
        sport: "mlb",
        marketType: "mvp",
        title: "MLB MVP 2025",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Shohei Ohtani (NL)", odds: 200, change: -50 },
          { id: "2", name: "Aaron Judge (AL)", odds: 350, change: 0 },
        ],
      },
      conference: {
        sport: "mlb",
        marketType: "conference",
        title: "MLB League Pennant 2025",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Los Angeles Dodgers (NL)", odds: 200, change: -50 },
          { id: "2", name: "Houston Astros (AL)", odds: 400, change: 25 },
        ],
      },
      win_total: {
        sport: "mlb",
        marketType: "win_total",
        title: "MLB Season Win Totals 2025",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Los Angeles Dodgers O/U 98.5", odds: -110, change: 0 },
        ],
      },
    },
    nhl: {
      championship: {
        sport: "nhl",
        marketType: "championship",
        title: "Stanley Cup 2025-26 Winner",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Edmonton Oilers", odds: 600, change: -100 },
          { id: "2", name: "Florida Panthers", odds: 700, change: 0 },
          { id: "3", name: "Colorado Avalanche", odds: 800, change: -50 },
        ],
      },
      mvp: {
        sport: "nhl",
        marketType: "mvp",
        title: "Hart Trophy (NHL MVP) 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Connor McDavid", odds: 200, change: 0 },
          { id: "2", name: "Nathan MacKinnon", odds: 400, change: -50 },
        ],
      },
      conference: {
        sport: "nhl",
        marketType: "conference",
        title: "NHL Conference Winners 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Edmonton Oilers (West)", odds: 350, change: -75 },
          { id: "2", name: "Florida Panthers (East)", odds: 400, change: 0 },
        ],
      },
      win_total: {
        sport: "nhl",
        marketType: "win_total",
        title: "NHL Point Totals 2025-26",
        lastUpdated: new Date().toISOString(),
        outcomes: [
          { id: "1", name: "Edmonton Oilers O/U 108.5 pts", odds: -110, change: 0 },
        ],
      },
    },
  };

  return mockData[sport]?.[marketType] || {
    sport,
    marketType,
    title: getMarketTitle(sport, marketType),
    outcomes: [],
    lastUpdated: new Date().toISOString(),
  };
}

export default futures;
