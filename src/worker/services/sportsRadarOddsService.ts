/**
 * SportsRadar Odds Comparison Service
 * Full production access to all SportsRadar Odds APIs:
 * - Odds Comparison Regular API
 * - Odds Comparison Prematch API
 * - Odds Comparison Player Props API
 * - Odds Comparison Futures API
 * 
 * Uses D1 database cache to persist across restarts.
 */

import { getCachedData, setCachedData } from './apiCacheService';

// Cache TTL - 5 minutes for odds (fresher data with full access)
const ODDS_CACHE_TTL_SECONDS = 5 * 60;

// Rate limit backoff - cache empty results for 2 minutes when rate limited
const RATE_LIMIT_BACKOFF_SECONDS = 2 * 60;

// Rate limiting - reduced with full access
let lastApiCallTimestamp = 0;
const MIN_API_INTERVAL_MS = 500; // 500ms between API calls (full access allows more)

// Competition ID mapping for SportsRadar Odds Comparison API
// Full coverage for all major sports and leagues
const COMPETITION_IDS: Record<string, string[]> = {
  'nba': ['sr:competition:132'],
  'nfl': ['sr:competition:1'],
  'mlb': ['sr:competition:109'],
  'nhl': ['sr:competition:234'],
  'ncaab': ['sr:competition:233'],
  'ncaaf': ['sr:competition:298'],
  // Soccer - multiple leagues
  'soccer': [
    'sr:competition:17',   // EPL - Premier League
    'sr:competition:8',    // La Liga
    'sr:competition:23',   // Serie A
    'sr:competition:35',   // Bundesliga
    'sr:competition:34',   // Ligue 1
    'sr:competition:7',    // Champions League
    'sr:competition:325',  // MLS
    'sr:competition:1',    // World Cup
  ],
  'mma': ['sr:competition:250'],   // UFC
  'golf': ['sr:competition:170'],  // PGA Tour
  'nascar': ['sr:competition:168'], // NASCAR Cup Series
};

// Sport URN mapping (backup)
const SPORT_URNS: Record<string, string> = {
  'nba': 'sr:sport:2',       // Basketball
  'nfl': 'sr:sport:16',      // American Football
  'mlb': 'sr:sport:3',       // Baseball
  'nhl': 'sr:sport:4',       // Ice Hockey
  'ncaab': 'sr:sport:2',     // Basketball (same sport, different competition)
  'ncaaf': 'sr:sport:16',    // American Football
  'soccer': 'sr:sport:1',    // Soccer/Football
  'mma': 'sr:sport:117',     // MMA
  'golf': 'sr:sport:9',      // Golf
};

function getTodayEasternDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Market types we care about
const MARKET_TYPES = {
  SPREAD: ['spread', 'handicap', 'point_spread', 'american_football.handicap', 'basketball.handicap', 'ice_hockey.handicap', 'baseball.handicap'],
  TOTAL: ['total', 'over_under', 'totals', 'american_football.totals', 'basketball.totals', 'ice_hockey.totals', 'baseball.totals'],
  MONEYLINE: ['moneyline', 'winner', '1x2', 'h2h', 'match_winner', '2way', 'american_football.match_winner', 'basketball.match_winner'],
};

export interface SportsRadarOdds {
  gameId: string;
  sportEventId: string;
  homeTeam: string;
  awayTeam: string;
  spread: number | null;
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  spread1HHome: number | null;
  spread1HAway: number | null;
  total1H: number | null;
  moneyline1HHome: number | null;
  moneyline1HAway: number | null;
  bookmaker?: string;
}

interface SportEventMarket {
  sport_event?: {
    id: string;
    competitors?: Array<{
      id: string;
      name: string;
      qualifier?: string;
    }>;
  };
  markets?: Array<{
    id?: string;
    name?: string;
    books?: Array<{
      id: string;
      name: string;
      outcomes?: Array<{
        id?: string;
        type?: string;
        name?: string;
        odds?: number;
        open_odds?: number;
        handicap?: number;
        total?: number;
        competitor?: string;
      }>;
    }>;
  }>;
}

interface SportsRadarOddsResponse {
  sport_event_markets?: SportEventMarket[];
  generated_at?: string;
}

/**
 * Fetch odds for all games in a sport/competition
 * Uses D1 database caching to persist across restarts and reduce rate limiting.
 */
export async function fetchSportsRadarOdds(
  sport: string,
  apiKey: string,
  db?: D1Database, // Optional database for persistent caching
  date?: string, // YYYY-MM-DD format (optional)
  oddsApiKey?: string // Separate Odds Comparison API key (if different from main key)
): Promise<Map<string, SportsRadarOdds>> {
  // Use dedicated odds API key if provided, otherwise fall back to main key
  const effectiveApiKey = oddsApiKey || apiKey;
  const sportLower = sport.toLowerCase();
  const cacheKey = `sr_odds_${sportLower}_${date || 'all'}`;
  
  // Check D1 database cache first if available
  if (db) {
    try {
      const cached = await getCachedData<Record<string, SportsRadarOdds>>(db, cacheKey);
      if (cached) {
        // Check if this is a rate-limit backoff entry
        if ((cached as any)._rate_limited) {
          console.log(`[SportsRadar Odds] ${sport}: In rate-limit backoff period, skipping API call`);
          return new Map<string, SportsRadarOdds>(); // Return empty map, don't hit API
        }
        if (Object.keys(cached).length > 0) {
          console.log(`[SportsRadar Odds] DB cache hit for ${sport}: ${Object.keys(cached).length} games`);
          return new Map(Object.entries(cached));
        }
      }
    } catch (err) {
      console.error(`[SportsRadar Odds] DB cache read error:`, err);
    }
  }
  
  const oddsMap = new Map<string, SportsRadarOdds>();
  
  const competitionIds = COMPETITION_IDS[sportLower];
  const sportUrn = SPORT_URNS[sportLower];
  
  if (!competitionIds && !sportUrn) {
    console.log(`[SportsRadar Odds] Unknown sport: ${sport}`);
    return oddsMap;
  }
  
  // Use production endpoints only.
  const BASE_URLS = [
    'https://api.sportradar.com/oddscomparison-regular/production/v2',
    'https://api.sportradar.com/oddscomparison-prematch/production/v2',
    'https://api.sportradar.com/oddscomparison-liveodds/production/v2',
  ];
  
  // Fetch from all competition IDs for this sport
  if (competitionIds && competitionIds.length > 0) {
    for (const competitionId of competitionIds) {
      // Rate limit: ensure minimum interval between API calls
      const now = Date.now();
      const timeSinceLastCall = now - lastApiCallTimestamp;
      if (timeSinceLastCall < MIN_API_INTERVAL_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_API_INTERVAL_MS - timeSinceLastCall));
      }
      lastApiCallTimestamp = Date.now();
      
      let fetched = false;
      for (const baseUrl of BASE_URLS) {
        const url = `${baseUrl}/en/competitions/${encodeURIComponent(competitionId)}/sport_event_markets.json?api_key=${effectiveApiKey}`;
        try {
          const feed = baseUrl.includes('regular')
            ? 'regular'
            : baseUrl.includes('liveodds')
              ? 'liveodds'
              : 'prematch';
          console.log(`[SportsRadar Odds] Fetching ${sport} (${competitionId}) via production ${feed}`);
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
          });
          
          if (response.ok) {
            const data = await response.json() as any;
            
            // The API returns competition_sport_event_markets for competition endpoint
            const events = data.competition_sport_event_markets || data.sport_event_markets || data.sport_events || [];
            console.log(`[SportsRadar Odds] ${sport} (${competitionId}): ${events.length} events found`);
            
            const parsedOdds = parseOddsResponse({ sport_event_markets: events }, sportLower);
            for (const [key, odds] of parsedOdds) {
              oddsMap.set(key, odds);
            }
            // Keep scanning other odds feeds (regular/prematch/liveodds):
            // some competitions return 200 with zero events on one feed and
            // populated rows on another.
            fetched = true;
            continue;
          } else if (response.status === 429) {
            console.log(`[SportsRadar Odds] ${sport}: Rate limited (429), backing off`);
            // Cache rate limit to prevent hammering
            if (db) {
              try {
                await setCachedData(db, cacheKey, 'sportsradar_odds', sport, { _rate_limited: true }, RATE_LIMIT_BACKOFF_SECONDS);
              } catch (err) {
                console.error(`[SportsRadar Odds] Failed to cache rate limit:`, err);
              }
            }
            fetched = true;
            break; // Stop trying endpoint variants if rate-limited
          } else {
            console.log(`[SportsRadar Odds] ${sport} (${competitionId}): API error ${response.status}`);
          }
        } catch (err) {
          console.error(`[SportsRadar Odds] ${sport} (${competitionId}) error:`, err);
        }
      }
      if (!fetched) {
        console.log(`[SportsRadar Odds] ${sport} (${competitionId}): no successful production endpoint response`);
      }
    }
    
    // Cache the results in D1 database if available
    if (db && oddsMap.size > 0) {
      try {
        const cacheData = Object.fromEntries(oddsMap);
        await setCachedData(db, cacheKey, 'sportsradar_odds', sport, cacheData, ODDS_CACHE_TTL_SECONDS);
        console.log(`[SportsRadar Odds] ${sport}: ${oddsMap.size} games cached in DB`);
      } catch (err) {
        console.error(`[SportsRadar Odds] DB cache write error:`, err);
      }
    }
  }

  // Fallback: some sports (notably NCAAB) can have sparse/empty competition feeds
  // while sport-scoped endpoints still return event markets.
  if (oddsMap.size === 0 && sportUrn) {
    for (const baseUrl of BASE_URLS) {
      const url = `${baseUrl}/en/sports/${encodeURIComponent(sportUrn)}/sport_event_markets.json?api_key=${effectiveApiKey}`;
      try {
        const feed = baseUrl.includes('regular')
          ? 'regular'
          : baseUrl.includes('liveodds')
            ? 'liveodds'
            : 'prematch';
        console.log(`[SportsRadar Odds] Fallback fetch ${sport} (${sportUrn}) via production ${feed}`);
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        });
        if (!response.ok) {
          console.log(`[SportsRadar Odds] ${sport} (${sportUrn}) fallback API error ${response.status}`);
          continue;
        }
        const data = await response.json() as any;
        const events = data.sport_event_markets || data.competition_sport_event_markets || data.sport_events || [];
        console.log(`[SportsRadar Odds] ${sport} (${sportUrn}) fallback: ${events.length} events found`);
        const parsedOdds = parseOddsResponse({ sport_event_markets: events }, sportLower);
        for (const [key, odds] of parsedOdds) {
          oddsMap.set(key, odds);
        }
      } catch (err) {
        console.error(`[SportsRadar Odds] ${sport} (${sportUrn}) fallback error:`, err);
      }
    }
    if (db && oddsMap.size > 0) {
      try {
        const cacheData = Object.fromEntries(oddsMap);
        await setCachedData(db, cacheKey, 'sportsradar_odds', sport, cacheData, ODDS_CACHE_TTL_SECONDS);
        console.log(`[SportsRadar Odds] ${sport}: ${oddsMap.size} fallback games cached in DB`);
      } catch (err) {
        console.error(`[SportsRadar Odds] DB fallback cache write error:`, err);
      }
    }
  }

  // Final fallback: resolve odds via Odds Comparison schedule event IDs.
  // Some sports can expose schedule IDs that differ from score provider IDs.
  if (oddsMap.size === 0 && sportUrn) {
    const targetDate = date || getTodayEasternDateString();
    const scheduleUrls = [
      `https://api.sportradar.com/oddscomparison-liveodds/production/v2/en/schedules/${targetDate}/schedule.json?api_key=${effectiveApiKey}`,
      `https://api.sportradar.com/oddscomparison-liveodds/production/v2/en/sports/${encodeURIComponent(sportUrn)}/schedules/${targetDate}/schedule.json?api_key=${effectiveApiKey}`,
    ];
    const scheduleEventIds = new Set<string>();
    for (const url of scheduleUrls) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const payload = await res.json() as any;
        const events = payload.sport_events || payload.schedule?.sport_events || [];
        for (const event of events) {
          const eventId = String(event?.id || "").trim();
          if (!eventId) continue;
          const eventSport = String(event?.sport?.id || event?.tournament?.sport?.id || "").trim();
          if (eventSport && eventSport !== sportUrn) continue;
          scheduleEventIds.add(eventId);
        }
      } catch {
        // Non-fatal fallback path.
      }
    }

    const idsToProbe = Array.from(scheduleEventIds).slice(0, 60);
    for (const eventId of idsToProbe) {
      try {
        const resolved = await fetchSportsRadarOddsForGame(eventId, effectiveApiKey);
        if (!resolved) continue;
        const homeKey = normalizeTeamName(resolved.homeTeam);
        const awayKey = normalizeTeamName(resolved.awayTeam);
        const matchKey = `${sportLower}|${awayKey}|${homeKey}`;
        oddsMap.set(matchKey, resolved);
        oddsMap.set(String(resolved.gameId || eventId), resolved);
        oddsMap.set(`${sportLower}|${String(resolved.awayTeam || "").toLowerCase()}|${String(resolved.homeTeam || "").toLowerCase()}`, resolved);
      } catch {
        // Ignore single-event failures.
      }
    }

    if (db && oddsMap.size > 0) {
      try {
        const cacheData = Object.fromEntries(oddsMap);
        await setCachedData(db, cacheKey, 'sportsradar_odds', sport, cacheData, ODDS_CACHE_TTL_SECONDS);
        console.log(`[SportsRadar Odds] ${sport}: ${oddsMap.size} schedule-fallback games cached in DB`);
      } catch (err) {
        console.error(`[SportsRadar Odds] DB schedule-fallback cache write error:`, err);
      }
    }
  }
  
  return oddsMap;
}

/**
 * Parse odds response from SportsRadar
 */
function parseOddsResponse(data: SportsRadarOddsResponse, sport: string): Map<string, SportsRadarOdds> {
  const oddsMap = new Map<string, SportsRadarOdds>();
  
  // Handle different response structures
  const events = data.sport_event_markets || (data as any).sport_events || [];
  console.log(`[SportsRadar Odds] Parsing ${events.length} events for ${sport}`);
  
  // Debug: log first event structure if available
  if (events.length > 0) {
    console.log(`[SportsRadar Odds] First event keys:`, Object.keys(events[0]));
    // Log market names to debug matching issues
    const firstEvent = events[0];
    const marketNames = (firstEvent.markets || []).map((m: any) => m.name || m.id || 'unknown');
    console.log(`[SportsRadar Odds] Market names in first event:`, marketNames.slice(0, 10));
  }
  
  for (const event of events) {
    const sportEvent = event.sport_event;
    if (!sportEvent?.id) continue;
    
    const competitors = sportEvent.competitors || [];
    const homeTeam = competitors.find((c: { qualifier: string }) => c.qualifier === 'home');
    const awayTeam = competitors.find((c: { qualifier: string }) => c.qualifier === 'away');
    
    if (!homeTeam || !awayTeam) continue;
    
    const odds: SportsRadarOdds = {
      gameId: sportEvent.id,
      sportEventId: sportEvent.id,
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      spread: null,
      spreadHome: null,
      spreadAway: null,
      total: null,
      moneylineHome: null,
      moneylineAway: null,
      spread1HHome: null,
      spread1HAway: null,
      total1H: null,
      moneyline1HHome: null,
      moneyline1HAway: null,
    };
    
    // Parse markets from first bookmaker (consensus)
    const markets = event.markets || [];
    
    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();
      const books = market.books || [];
      const book = books[0]; // Use first bookmaker as consensus
      
      if (!book?.outcomes) continue;
      
      const isFirstHalfMarket = isFirstHalfMarketName(marketName);
      const isDerivativeMarket = isDerivativeMarketName(marketName);

      // Spread/Handicap
      if (isMarketType(marketName, MARKET_TYPES.SPREAD)) {
        console.log(`[SportsRadar Odds] SPREAD MARKET FOUND for ${homeTeam.name}: market="${marketName}", outcomes=${book.outcomes.length}`);
        console.log(`[SportsRadar Odds] First outcome raw data:`, JSON.stringify(book.outcomes[0], null, 2));
        for (const outcome of book.outcomes) {
          // SportsRadar uses string handicap values - parse to number
          const rawHandicap = outcome.handicap ?? outcome.spread ?? outcome.line;
          console.log(`[SportsRadar Odds] Outcome handicap check - handicap:${outcome.handicap}, spread:${outcome.spread}, line:${outcome.line}, odds_decimal:${outcome.odds_decimal}, odds_american:${outcome.odds_american}, type:${outcome.type}`);
          const handicapValue = rawHandicap !== undefined ? parseFloat(String(rawHandicap)) : undefined;
          
          if (handicapValue !== undefined && !isNaN(handicapValue)) {
            // Use outcome.type field for team identification (e.g., "home_{hcp}", "away_handicap")
            const outcomeType = (outcome.type || '').toLowerCase();
            const isHome = outcomeType.includes('home') || 
                           outcome.competitor === homeTeam.id || 
                           outcome.name?.toLowerCase().includes(homeTeam.name.toLowerCase().split(' ').pop() || '');
            const isAway = outcomeType.includes('away') || 
                           outcome.competitor === awayTeam.id || 
                           outcome.name?.toLowerCase().includes(awayTeam.name.toLowerCase().split(' ').pop() || '');
            
            if (isFirstHalfMarket) {
              if (isHome) {
                odds.spread1HHome = handicapValue;
              } else if (isAway) {
                odds.spread1HAway = handicapValue;
              }
            } else if (!isDerivativeMarket) {
              if (isHome) {
                odds.spreadHome = handicapValue;
                odds.spread = handicapValue;
              } else if (isAway) {
                odds.spreadAway = handicapValue;
              }
            }
          }
        }
        // If we only got one spread, calculate the other (full game and 1H independently).
        if (!isDerivativeMarket && !isFirstHalfMarket) {
          if (odds.spreadHome !== null && odds.spreadAway === null) {
            odds.spreadAway = -odds.spreadHome;
          } else if (odds.spreadAway !== null && odds.spreadHome === null) {
            odds.spreadHome = -odds.spreadAway;
            odds.spread = odds.spreadHome;
          }
        } else if (isFirstHalfMarket) {
          if (odds.spread1HHome !== null && odds.spread1HAway === null) {
            odds.spread1HAway = -odds.spread1HHome;
          } else if (odds.spread1HAway !== null && odds.spread1HHome === null) {
            odds.spread1HHome = -odds.spread1HAway;
          }
        }
      }
      
      // Total/Over-Under
      if (isMarketType(marketName, MARKET_TYPES.TOTAL)) {
        for (const outcome of book.outcomes) {
          // Parse total from various possible fields (may be strings)
          const rawTotal = outcome.total ?? outcome.handicap;
          if (rawTotal !== undefined) {
            const totalValue = parseFloat(String(rawTotal));
            if (!isNaN(totalValue)) {
              if (isFirstHalfMarket) {
                odds.total1H = totalValue;
              } else if (!isDerivativeMarket) {
                // Main O/U must always be full-game pregame total.
                odds.total = totalValue;
              }
              break;
            }
          }
        }
      }
      
      // Moneyline/Winner
      if (isMarketType(marketName, MARKET_TYPES.MONEYLINE)) {
        console.log(`[SportsRadar Odds] MONEYLINE MARKET FOUND for ${homeTeam.name}: market="${marketName}"`);
        console.log(`[SportsRadar Odds] First moneyline outcome:`, JSON.stringify(book.outcomes[0], null, 2));
        for (const outcome of book.outcomes) {
          // SportsRadar provides odds_american directly, or odds_decimal we can convert
          let americanOdds: number | null = null;
          console.log(`[SportsRadar Odds] ML outcome - odds_american:${outcome.odds_american}, odds_decimal:${outcome.odds_decimal}, odds:${outcome.odds}, type:${outcome.type}`);
          if (outcome.odds_american !== undefined) {
            americanOdds = parseInt(String(outcome.odds_american), 10);
          } else if (outcome.odds_decimal !== undefined) {
            americanOdds = decimalToAmerican(parseFloat(String(outcome.odds_decimal)));
          } else if (outcome.odds !== undefined) {
            americanOdds = decimalToAmerican(outcome.odds);
          }
          console.log(`[SportsRadar Odds] ML converted americanOdds: ${americanOdds}`);
          
          if (americanOdds !== null && !isNaN(americanOdds)) {
            // Use outcome.type field for team identification
            const outcomeType = (outcome.type || '').toLowerCase();
            const isHome = outcomeType.includes('home') || outcomeType === '1' ||
                           outcome.competitor === homeTeam.id || 
                           outcome.name?.toLowerCase().includes(homeTeam.name.toLowerCase().split(' ').pop() || '');
            const isAway = outcomeType.includes('away') || outcomeType === '2' ||
                           outcome.competitor === awayTeam.id || 
                           outcome.name?.toLowerCase().includes(awayTeam.name.toLowerCase().split(' ').pop() || '');
            
            if (isFirstHalfMarket) {
              if (isHome) {
                odds.moneyline1HHome = americanOdds;
              } else if (isAway) {
                odds.moneyline1HAway = americanOdds;
              }
            } else if (!isDerivativeMarket) {
              if (isHome) {
                odds.moneylineHome = americanOdds;
              } else if (isAway) {
                odds.moneylineAway = americanOdds;
              }
            }
          }
        }
      }
    }
    
    // Only add if we found some odds data
    if (odds.spread !== null || odds.total !== null || odds.moneylineHome !== null) {
      // Create key based on team names for matching
      const homeKey = normalizeTeamName(homeTeam.name);
      const awayKey = normalizeTeamName(awayTeam.name);
      const matchKey = `${sport.toLowerCase()}|${awayKey}|${homeKey}`;
      
      oddsMap.set(matchKey, odds);
      oddsMap.set(sportEvent.id, odds); // Store by sport event ID (e.g., sr:sport_event:653e460f-...)
      
      // Store additional keys for better matching
      oddsMap.set(`${sport.toLowerCase()}|${awayTeam.name.toLowerCase()}|${homeTeam.name.toLowerCase()}`, odds);
      
      console.log(`[SportsRadar Odds] Stored odds for: ${awayTeam.name} @ ${homeTeam.name} (${sportEvent.id})`);
    }
  }
  
  console.log(`[SportsRadar Odds] Parsed ${oddsMap.size} games with odds`);
  return oddsMap;
}

/**
 * Fetch odds for a specific game by sport event ID
 * Endpoint: /{locale}/sport_events/{urn_sport_event}/sport_event_markets
 */
export async function fetchSportsRadarOddsForGame(
  sportEventId: string,
  apiKey: string
): Promise<SportsRadarOdds | null> {
  const baseUrls = [
    'https://api.sportradar.com/oddscomparison-regular/production/v2',
    'https://api.sportradar.com/oddscomparison-liveodds/production/v2',
    'https://api.sportradar.com/oddscomparison-prematch/production/v2',
  ];
  console.log(`[SportsRadar Odds] Fetching odds for game: ${sportEventId}`);

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}/en/sport_events/${encodeURIComponent(sportEventId)}/sport_event_markets.json?api_key=${apiKey}`;
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      const feed = baseUrl.includes('regular')
        ? 'regular'
        : baseUrl.includes('liveodds')
          ? 'live'
          : 'prematch';
      console.log(`[SportsRadar Odds] Game odds response (production ${feed}): ${response.status}`);
      if (!response.ok) continue;

      const data = await response.json() as SportsRadarOddsResponse;
      const directEvent = (data as any)?.sport_event && (data as any)?.markets
        ? [{ sport_event: (data as any).sport_event, markets: (data as any).markets }]
        : null;
      const normalizedPayload = directEvent
        ? ({ sport_event_markets: directEvent } as SportsRadarOddsResponse)
        : data;
      const oddsMap = parseOddsResponse(normalizedPayload, 'unknown');
      const found = oddsMap.get(sportEventId) || Array.from(oddsMap.values())[0] || null;
      if (found) return found;
    } catch (err) {
      console.error(`[SportsRadar Odds] Error fetching game odds (${baseUrl}):`, err);
    }
  }
  return null;
}

/**
 * Sportsbook data structure for individual book odds
 */
export interface SportsbookOdds {
  sportsbook: string;
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  spread1HHome?: number | null;
  spread1HAway?: number | null;
  total1H?: number | null;
  moneyline1HHome?: number | null;
  moneyline1HAway?: number | null;
  updatedAt?: string;
}

/**
 * Fetch ALL sportsbooks odds for a specific game (not just consensus)
 * Returns individual odds from each bookmaker for the sportsbooks tab
 */
export async function fetchAllSportsbooksForGame(
  sport: string,
  apiKey: string,
  db: D1Database,
  homeTeamName: string,
  awayTeamName: string,
  oddsApiKey?: string
): Promise<SportsbookOdds[]> {
  const sportsbooks: SportsbookOdds[] = [];
  const sportLower = sport.toLowerCase();
  
  // First check if we have cached odds data with all books
  const cacheKey = `sr_odds_${sportLower}_allbooks`;
  
  // Fetch odds for the sport (uses competition endpoint)
  const oddsMap = await fetchSportsRadarOdds(sport, apiKey, db, undefined, oddsApiKey);
  
  // Try to find the specific game by team names
  const homeKey = normalizeTeamName(homeTeamName);
  const awayKey = normalizeTeamName(awayTeamName);
  const perGameCacheKey = `sr_odds_${sportLower}_books_${homeKey}_${awayKey}`;

  // Return cached per-game books first for fast UI loads.
  const cachedBooks = await getCachedData<SportsbookOdds[]>(db, perGameCacheKey);
  if (Array.isArray(cachedBooks) && cachedBooks.length > 0) {
    return cachedBooks;
  }
  
  // Look through cached data for this specific game's raw API response
  // Since the parseOddsResponse only returns consensus, we need to re-fetch for individual books
  const competitionIds = COMPETITION_IDS[sportLower];
  const sportUrn = SPORT_URNS[sportLower];
  const effectiveApiKey = oddsApiKey || apiKey;
  
  if (!competitionIds || competitionIds.length === 0) {
    // Return consensus as single sportsbook if no competition IDs
    for (const [key, odds] of oddsMap) {
      if (key.includes(homeKey) && key.includes(awayKey)) {
        sportsbooks.push({
          sportsbook: "SportsRadar Consensus",
          spreadHome: odds.spreadHome,
          spreadAway: odds.spreadAway,
          total: odds.total,
          moneylineHome: odds.moneylineHome,
          moneylineAway: odds.moneylineAway,
          updatedAt: new Date().toISOString(),
        });
        break;
      }
    }
    return sportsbooks;
  }
  
  // Fetch from competition to get all bookmakers.
  // Try all feeds: some games are present in liveodds/regular but not prematch.
  const BASE_URLS = [
    'https://api.sportradar.com/oddscomparison-prematch/production/v2',
    'https://api.sportradar.com/oddscomparison-regular/production/v2',
    'https://api.sportradar.com/oddscomparison-liveodds/production/v2',
  ];
  const competitionScanIds = competitionIds;
  
  try {
    // Check if we're in rate limit backoff
    const cached = await getCachedData<any>(db, cacheKey);
    if (cached?._rate_limited) {
      console.log(`[Sportsbooks] In rate-limit backoff, returning consensus only`);
      for (const [key, odds] of oddsMap) {
        if (key.includes(homeKey) && key.includes(awayKey)) {
          sportsbooks.push({
            sportsbook: "SportsRadar Consensus",
            spreadHome: odds.spreadHome,
            spreadAway: odds.spreadAway,
            total: odds.total,
            moneylineHome: odds.moneylineHome,
            moneylineAway: odds.moneylineAway,
          });
          break;
        }
      }
      return sportsbooks;
    }
    
    console.log(`[Sportsbooks] Fetching all books for ${sport}: ${homeTeamName} vs ${awayTeamName}`);
    let events: any[] = [];
    for (const competitionId of competitionScanIds) {
      for (const baseUrl of BASE_URLS) {
        const url = `${baseUrl}/en/competitions/${encodeURIComponent(competitionId)}/sport_event_markets.json?api_key=${effectiveApiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) {
          console.log(`[Sportsbooks] API error ${response.status} via ${baseUrl} (${competitionId})`);
          continue;
        }
        const data = await response.json() as any;
        const feedEvents = data.competition_sport_event_markets || data.sport_event_markets || [];
        if (Array.isArray(feedEvents) && feedEvents.length > 0) {
          events = feedEvents;
          break;
        }
      }
      if (events.length > 0) break;
    }
    if (events.length === 0 && sportUrn) {
      for (const baseUrl of BASE_URLS) {
        const url = `${baseUrl}/en/sports/${encodeURIComponent(sportUrn)}/sport_event_markets.json?api_key=${effectiveApiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) {
          console.log(`[Sportsbooks] Fallback API error ${response.status} via ${baseUrl} (${sportUrn})`);
          continue;
        }
        const data = await response.json() as any;
        const feedEvents = data.sport_event_markets || data.competition_sport_event_markets || [];
        if (Array.isArray(feedEvents) && feedEvents.length > 0) {
          events = feedEvents;
          break;
        }
      }
    }
    if (events.length === 0) {
      console.log(`[Sportsbooks] No events in competition feed, returning consensus`);
      for (const [key, odds] of oddsMap) {
        if (key.includes(homeKey) && key.includes(awayKey)) {
          sportsbooks.push({
            sportsbook: "SportsRadar Consensus",
            spreadHome: odds.spreadHome,
            spreadAway: odds.spreadAway,
            total: odds.total,
            moneylineHome: odds.moneylineHome,
            moneylineAway: odds.moneylineAway,
          });
          break;
        }
      }
      if (sportsbooks.length > 0) {
        await setCachedData(db, perGameCacheKey, "sportsbooks", sportLower, sportsbooks, 120);
      }
      return sportsbooks;
    }
    
    // Find this specific game by team names
    for (const event of events) {
      const sportEvent = event.sport_event;
      if (!sportEvent?.competitors) continue;
      
      const competitors = sportEvent.competitors || [];
      const homeTeam = competitors.find((c: any) => c.qualifier === 'home');
      const awayTeam = competitors.find((c: any) => c.qualifier === 'away');
      
      if (!homeTeam || !awayTeam) continue;
      
      // Check if this is our game
      const eventHomeKey = normalizeTeamName(homeTeam.name || '');
      const eventAwayKey = normalizeTeamName(awayTeam.name || '');
      
      if (!eventHomeKey.includes(homeKey) && !homeKey.includes(eventHomeKey)) continue;
      if (!eventAwayKey.includes(awayKey) && !awayKey.includes(eventAwayKey)) continue;
      
      // Found our game - extract all bookmakers
      const markets = event.markets || [];
      const bookOddsMap = new Map<string, SportsbookOdds>();
      
      for (const market of markets) {
        const marketName = (market.name || '').toLowerCase();
        const books = market.books || [];
        
        for (const book of books) {
          const bookName = book.name || book.id || 'Unknown';
          if (!bookOddsMap.has(bookName)) {
            bookOddsMap.set(bookName, {
              sportsbook: bookName,
              spreadHome: null,
              spreadAway: null,
              total: null,
              moneylineHome: null,
              moneylineAway: null,
              spread1HHome: null,
              spread1HAway: null,
              total1H: null,
              moneyline1HHome: null,
              moneyline1HAway: null,
              updatedAt: book.last_updated || new Date().toISOString(),
            });
          }
          
          const bookOdds = bookOddsMap.get(bookName)!;
          
          if (!book.outcomes) continue;
          
      const isFirstHalfMarket = isFirstHalfMarketName(marketName);
      const isDerivativeMarket = isDerivativeMarketName(marketName);

      // Parse spread
      if (isMarketType(marketName, MARKET_TYPES.SPREAD)) {
            for (const outcome of book.outcomes) {
              const rawHandicap = outcome.handicap ?? outcome.spread ?? outcome.line;
              const handicapValue = rawHandicap !== undefined ? parseFloat(String(rawHandicap)) : undefined;
              
              if (handicapValue !== undefined && !isNaN(handicapValue)) {
                const outcomeType = (outcome.type || '').toLowerCase();
                const isHome = outcomeType.includes('home') || outcome.competitor === homeTeam.id;
                const isAway = outcomeType.includes('away') || outcome.competitor === awayTeam.id;
                
                if (isFirstHalfMarket) {
                  if (isHome) bookOdds.spread1HHome = handicapValue;
                  else if (isAway) bookOdds.spread1HAway = handicapValue;
                } else if (!isDerivativeMarket) {
                  if (isHome) bookOdds.spreadHome = handicapValue;
                  else if (isAway) bookOdds.spreadAway = handicapValue;
                }
              }
            }
            if (isFirstHalfMarket) {
              if (bookOdds.spread1HHome !== null && bookOdds.spread1HAway === null) {
                bookOdds.spread1HAway = -bookOdds.spread1HHome;
              }
              if (bookOdds.spread1HAway !== null && bookOdds.spread1HHome === null) {
                bookOdds.spread1HHome = -bookOdds.spread1HAway;
              }
            } else if (!isDerivativeMarket && bookOdds.spreadHome !== null && bookOdds.spreadAway === null) {
              bookOdds.spreadAway = -bookOdds.spreadHome;
            }
          }
          
          // Parse total
      if (isMarketType(marketName, MARKET_TYPES.TOTAL)) {
            for (const outcome of book.outcomes) {
              const rawTotal = outcome.total ?? outcome.handicap;
              if (rawTotal !== undefined) {
                const totalValue = parseFloat(String(rawTotal));
                if (!isNaN(totalValue)) {
                  if (isFirstHalfMarket) {
                    bookOdds.total1H = totalValue;
                  } else if (!isDerivativeMarket) {
                    bookOdds.total = totalValue;
                  }
                  break;
                }
              }
            }
          }
          
          // Parse moneyline
      if (isMarketType(marketName, MARKET_TYPES.MONEYLINE)) {
            for (const outcome of book.outcomes) {
              let americanOdds: number | null = null;
              if (outcome.odds_american !== undefined) {
                americanOdds = parseInt(String(outcome.odds_american), 10);
              } else if (outcome.odds_decimal !== undefined) {
                americanOdds = decimalToAmerican(parseFloat(String(outcome.odds_decimal)));
              }
              
              if (americanOdds !== null && !isNaN(americanOdds)) {
                const outcomeType = (outcome.type || '').toLowerCase();
                const isHome = outcomeType.includes('home') || outcomeType === '1' || outcome.competitor === homeTeam.id;
                const isAway = outcomeType.includes('away') || outcomeType === '2' || outcome.competitor === awayTeam.id;
                
                if (isFirstHalfMarket) {
                  if (isHome) bookOdds.moneyline1HHome = americanOdds;
                  else if (isAway) bookOdds.moneyline1HAway = americanOdds;
                } else if (!isDerivativeMarket) {
                  if (isHome) bookOdds.moneylineHome = americanOdds;
                  else if (isAway) bookOdds.moneylineAway = americanOdds;
                }
              }
            }
          }
        }
      }
      
      // Convert map to array and filter books with actual data
      for (const bookOdds of bookOddsMap.values()) {
        if (
          bookOdds.spreadHome !== null ||
          bookOdds.total !== null ||
          bookOdds.moneylineHome !== null ||
          bookOdds.spread1HHome !== null ||
          bookOdds.total1H !== null ||
          bookOdds.moneyline1HHome !== null
        ) {
          sportsbooks.push(bookOdds);
        }
      }
      
      console.log(`[Sportsbooks] Found ${sportsbooks.length} sportsbooks for game`);
      break; // Found our game, stop searching
    }
    
  } catch (err) {
    console.error(`[Sportsbooks] Error fetching:`, err);
    // Return consensus as fallback
    for (const [key, odds] of oddsMap) {
      if (key.includes(homeKey) && key.includes(awayKey)) {
        sportsbooks.push({
          sportsbook: "SportsRadar Consensus",
          spreadHome: odds.spreadHome,
          spreadAway: odds.spreadAway,
          total: odds.total,
          moneylineHome: odds.moneylineHome,
          moneylineAway: odds.moneylineAway,
        });
        break;
      }
    }
  }
  if (sportsbooks.length > 0) {
    await setCachedData(db, perGameCacheKey, "sportsbooks", sportLower, sportsbooks, 120);
  }
  
  return sportsbooks;
}

// Helper functions

function isMarketType(marketName: string, types: string[]): boolean {
  return types.some(t => marketName.includes(t));
}

function isFirstHalfMarketName(marketName: string): boolean {
  const normalized = marketName.toLowerCase();
  return (
    normalized.includes("1h") ||
    normalized.includes("1 h") ||
    normalized.includes("first half") ||
    normalized.includes("1st half") ||
    normalized.includes("halftime")
  );
}

function isDerivativeMarketName(marketName: string): boolean {
  const normalized = marketName.toLowerCase();
  return (
    isFirstHalfMarketName(normalized) ||
    normalized.includes("2h") ||
    normalized.includes("2nd half") ||
    normalized.includes("second half") ||
    normalized.includes("quarter") ||
    normalized.includes("q1") ||
    normalized.includes("q2") ||
    normalized.includes("q3") ||
    normalized.includes("q4") ||
    normalized.includes("period") ||
    normalized.includes("1st period") ||
    normalized.includes("2nd period") ||
    normalized.includes("3rd period") ||
    // Team/alternate totals are derivative and should not pollute full-game totals.
    normalized.includes("team total") ||
    normalized.includes("home total") ||
    normalized.includes("away total") ||
    normalized.includes("home team total") ||
    normalized.includes("away team total") ||
    normalized.includes("totals - home") ||
    normalized.includes("totals - away") ||
    normalized.includes("alternate total") ||
    normalized.includes("alternative total") ||
    normalized.includes("alt total")
  );
}

function normalizeTeamName(name: string): string {
  // Get last word (usually the team nickname like "Lakers", "Bulls")
  return name.split(' ').pop()?.toLowerCase() || name.toLowerCase();
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    // Positive American odds
    return Math.round((decimal - 1) * 100);
  } else {
    // Negative American odds
    return Math.round(-100 / (decimal - 1));
  }
}

// ============ LINE MOVEMENT TRACKING ============

export interface LineMovementData {
  gameId: string;
  sport: string;
  market: 'SPREAD' | 'TOTAL' | 'MONEYLINE';
  outcome: 'HOME' | 'AWAY' | 'OVER' | 'UNDER';
  openingLine: number | null;
  openingPrice: number | null;
  currentLine: number | null;
  currentPrice: number | null;
  movement: number;
  movementPercent: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
  snapshots: Array<{
    timestamp: string;
    line: number | null;
    price: number | null;
  }>;
}

/**
 * Capture and store odds snapshot for line movement tracking
 * Stores current odds to odds_snapshots table for historical tracking
 */
export async function captureOddsSnapshot(
  db: D1Database,
  gameId: string,
  _sport: string,
  odds: SportsRadarOdds
): Promise<void> {
  const now = new Date().toISOString();
  const dataScope = 'PROD';
  
  const inserts: Promise<D1Result>[] = [];
  
  // Spread snapshots
  if (odds.spreadHome !== null) {
    inserts.push(
      db.prepare(`
        INSERT INTO odds_snapshots (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, captured_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'SPREAD', 'HOME', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.spreadHome, now, now, now).run()
    );
    inserts.push(
      db.prepare(`
        INSERT INTO odds_snapshots (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, captured_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'SPREAD', 'AWAY', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.spreadAway ?? -odds.spreadHome, now, now, now).run()
    );
  }
  
  // Total snapshots
  if (odds.total !== null) {
    inserts.push(
      db.prepare(`
        INSERT INTO odds_snapshots (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, captured_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'TOTAL', 'OVER', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.total, now, now, now).run()
    );
    inserts.push(
      db.prepare(`
        INSERT INTO odds_snapshots (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, captured_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'TOTAL', 'UNDER', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.total, now, now, now).run()
    );
  }
  
  // Moneyline snapshots
  if (odds.moneylineHome !== null || odds.moneylineAway !== null) {
    if (odds.moneylineHome !== null) {
      inserts.push(
        db.prepare(`
          INSERT INTO odds_snapshots (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, captured_at, created_at, updated_at)
          VALUES (?, ?, 'consensus', 'MONEYLINE', 'HOME', NULL, ?, ?, ?, ?)
        `).bind(dataScope, gameId, odds.moneylineHome, now, now, now).run()
      );
    }
    if (odds.moneylineAway !== null) {
      inserts.push(
        db.prepare(`
          INSERT INTO odds_snapshots (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, captured_at, created_at, updated_at)
          VALUES (?, ?, 'consensus', 'MONEYLINE', 'AWAY', NULL, ?, ?, ?, ?)
        `).bind(dataScope, gameId, odds.moneylineAway, now, now, now).run()
      );
    }
  }
  
  try {
    await Promise.all(inserts);
    console.log(`[Line Movement] Captured snapshot for ${gameId}: spread=${odds.spreadHome}, total=${odds.total}`);
  } catch (err) {
    console.error(`[Line Movement] Failed to capture snapshot:`, err);
  }
}

/**
 * Store opening lines for a game (first time we see odds)
 * These serve as the baseline for line movement calculations
 */
export async function storeOpeningLines(
  db: D1Database,
  gameId: string,
  odds: SportsRadarOdds
): Promise<void> {
  const now = new Date().toISOString();
  const dataScope = 'PROD';
  
  // Check if we already have opening lines for this game
  const existing = await db.prepare(`
    SELECT COUNT(*) as count FROM odds_opening WHERE game_id = ? AND data_scope = ?
  `).bind(gameId, dataScope).first<{ count: number }>();
  
  if (existing && existing.count > 0) {
    console.log(`[Line Movement] Opening lines already exist for ${gameId}`);
    return;
  }
  
  const inserts: Promise<D1Result>[] = [];
  
  // Spread opening
  if (odds.spreadHome !== null) {
    inserts.push(
      db.prepare(`
        INSERT INTO odds_opening (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opened_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'SPREAD', 'HOME', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.spreadHome, now, now, now).run()
    );
    inserts.push(
      db.prepare(`
        INSERT INTO odds_opening (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opened_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'SPREAD', 'AWAY', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.spreadAway ?? -odds.spreadHome, now, now, now).run()
    );
  }
  
  // Total opening
  if (odds.total !== null) {
    inserts.push(
      db.prepare(`
        INSERT INTO odds_opening (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opened_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'TOTAL', 'OVER', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.total, now, now, now).run()
    );
    inserts.push(
      db.prepare(`
        INSERT INTO odds_opening (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opened_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'TOTAL', 'UNDER', ?, -110, ?, ?, ?)
      `).bind(dataScope, gameId, odds.total, now, now, now).run()
    );
  }
  
  // Moneyline opening
  if (odds.moneylineHome !== null) {
    inserts.push(
      db.prepare(`
        INSERT INTO odds_opening (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opened_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'MONEYLINE', 'HOME', NULL, ?, ?, ?, ?)
      `).bind(dataScope, gameId, odds.moneylineHome, now, now, now).run()
    );
  }
  if (odds.moneylineAway !== null) {
    inserts.push(
      db.prepare(`
        INSERT INTO odds_opening (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opened_at, created_at, updated_at)
        VALUES (?, ?, 'consensus', 'MONEYLINE', 'AWAY', NULL, ?, ?, ?, ?)
      `).bind(dataScope, gameId, odds.moneylineAway, now, now, now).run()
    );
  }
  
  try {
    await Promise.all(inserts);
    console.log(`[Line Movement] Stored opening lines for ${gameId}`);
  } catch (err) {
    console.error(`[Line Movement] Failed to store opening lines:`, err);
  }
}

/**
 * Get line movement data for a game
 * Compares current odds to opening lines and provides historical snapshots
 */
export async function getLineMovement(
  db: D1Database,
  gameId: string,
  market: 'SPREAD' | 'TOTAL' | 'MONEYLINE' = 'SPREAD',
  outcome: 'HOME' | 'AWAY' | 'OVER' | 'UNDER' = 'HOME'
): Promise<LineMovementData | null> {
  const scopes: Array<"PROD" | "DEMO"> = ["PROD", "DEMO"];
  let opening: {
    opening_line_value: number | null;
    opening_price_american: number | null;
    opened_at: string;
  } | null = null;
  let snapshots: Array<{
    line_value: number | null;
    price_american: number | null;
    captured_at: string;
  }> = [];

  for (const dataScope of scopes) {
    const openingRow = await db.prepare(`
      SELECT opening_line_value, opening_price_american, opened_at
      FROM odds_opening
      WHERE game_id = ? AND data_scope = ? AND market_key = ? AND outcome_key = ?
      ORDER BY opened_at ASC LIMIT 1
    `).bind(gameId, dataScope, market, outcome).first<{
      opening_line_value: number | null;
      opening_price_american: number | null;
      opened_at: string;
    }>();

    const snapshotRows = await db.prepare(`
      SELECT line_value, price_american, captured_at
      FROM odds_snapshots
      WHERE game_id = ? AND data_scope = ? AND market_key = ? AND outcome_key = ?
      ORDER BY captured_at ASC
      LIMIT 100
    `).bind(gameId, dataScope, market, outcome).all<{
      line_value: number | null;
      price_american: number | null;
      captured_at: string;
    }>();

    if (openingRow || snapshotRows.results.length > 0) {
      opening = openingRow;
      snapshots = snapshotRows.results;
      break;
    }
  }

  if (!opening && snapshots.length === 0) {
    return null;
  }
  
  // Get current (most recent) values
  const current = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  
  const openingLine = opening?.opening_line_value ?? (snapshots[0]?.line_value ?? null);
  const openingPrice = opening?.opening_price_american ?? (snapshots[0]?.price_american ?? null);
  const currentLine = current?.line_value ?? openingLine;
  const currentPrice = current?.price_american ?? openingPrice;
  
  // Calculate movement
  let movement = 0;
  let movementPercent = 0;
  let direction: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
  
  if (market === 'MONEYLINE') {
    if (openingPrice !== null && currentPrice !== null) {
      movement = currentPrice - openingPrice;
      movementPercent = openingPrice !== 0 ? (movement / Math.abs(openingPrice)) * 100 : 0;
      direction = movement > 0 ? 'UP' : movement < 0 ? 'DOWN' : 'FLAT';
    }
  } else {
    if (openingLine !== null && currentLine !== null) {
      movement = currentLine - openingLine;
      movementPercent = openingLine !== 0 ? (movement / Math.abs(openingLine)) * 100 : 0;
      direction = movement > 0 ? 'UP' : movement < 0 ? 'DOWN' : 'FLAT';
    }
  }
  
  return {
    gameId,
    sport: '', // Would need to be passed in or looked up
    market,
    outcome,
    openingLine,
    openingPrice,
    currentLine,
    currentPrice,
    movement: Math.round(movement * 100) / 100,
    movementPercent: Math.round(movementPercent * 10) / 10,
    direction,
    snapshots: snapshots.map(s => ({
      timestamp: s.captured_at,
      line: s.line_value,
      price: s.price_american,
    })),
  };
}

// ============================================
// SPORTSRADAR PLAYER PROPS FOR GAME
// ============================================

// Competition IDs for Player Props API
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PLAYER_PROPS_COMPETITION_IDS: Record<string, string> = {
  'nba': 'sr:competition:132',
  'nfl': 'sr:competition:1',
  'mlb': 'sr:competition:109',
  'nhl': 'sr:competition:234',
  'ncaab': 'sr:competition:233',
  'ncaaf': 'sr:competition:298',
};

export interface GamePlayerProp {
  player_name: string;
  prop_type: string;
  line: number;
  over_odds: number;
  under_odds: number;
  sportsbook: string;
}

/**
 * Fetch player props for a specific game from SportsRadar Player Props API
 */
export async function fetchGamePlayerProps(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  apiKey: string | undefined,
  gameStatus?: string
): Promise<GamePlayerProp[]> {
  if (!apiKey) {
    console.log('[SportsRadar Props] No Player Props API key');
    return [];
  }
  
  // Extract SportsRadar event ID from gameId
  // Format: sr_nba_uuid -> sr:sport_event:uuid
  let sportEventId = '';
  if (gameId.startsWith('sr_')) {
    const parts = gameId.split('_');
    if (parts.length >= 3) {
      const uuid = parts.slice(2).join('_');
      sportEventId = `sr:sport_event:${uuid}`;
    }
  } else if (gameId.startsWith('sr:sport_event:')) {
    sportEventId = gameId;
  } else if (gameId.includes('-') && gameId.length > 30) {
    // Looks like a raw UUID
    sportEventId = `sr:sport_event:${gameId}`;
  }

  if (!sportEventId) {
    console.log(`[SportsRadar Props] Could not extract sport event ID from: ${gameId}`);
    return [];
  }

  console.log(`[SportsRadar Props] Fetching props for ${sport}: ${awayTeam} @ ${homeTeam}`);
  console.log(`[SportsRadar Props] Using Sport Event ID: ${sportEventId}`);
  const encodedEventId = encodeURIComponent(sportEventId);
  const status = String(gameStatus || "").toUpperCase();
  const isLiveGame = status === "LIVE" || status === "IN_PROGRESS";
  const candidateUrls = isLiveGame
    ? [
        // Live/in-game props must come from OC Live Odds API.
        `https://api.sportradar.com/oddscomparison-liveodds/production/v2/en/sport_events/${encodedEventId}/players_props.json?api_key=${apiKey}`,
      ]
    : [
        // Pre-match props must come from OC Player Props API (production server per OpenAPI spec).
        `https://api.sportradar.com/oddscomparison-player-props/production/v2/en/sport_events/${encodedEventId}/players_props.json?api_key=${apiKey}`,
      ];
  
  // Clean team names for logging
  const cleanTeamName = (name: string) => {
    const words = name.split(' ');
    if (words.length > 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
      return words.slice(1).join(' ');
    }
    return name;
  };
  const homeClean = cleanTeamName(homeTeam);
  const awayClean = cleanTeamName(awayTeam);
  
  console.log(`[SportsRadar Props] Fetching for: ${awayClean} @ ${homeClean}`);

  try {
    let data: any = null;
    let lastError: string | null = null;
    for (const url of candidateUrls) {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        lastError = `${response.status} ${errorText.slice(0, 120)}`;
        console.log(`[SportsRadar Props] Endpoint miss (${response.status}), trying next: ${url}`);
        continue;
      }
      data = await response.json() as any;
      console.log(`[SportsRadar Props] Endpoint hit: ${url}`);
      break;
    }

    if (!data) {
      console.log(`[SportsRadar Props] All endpoint variants failed for ${sportEventId}. Last error: ${lastError || 'none'}`);
      return [];
    }
    const props: GamePlayerProp[] = [];

    // Debug: log response structure
    const topKeys = Object.keys(data);
    console.log(`[SportsRadar Props] Response keys: ${topKeys.join(', ')}`);
    
    // Support multiple documented payload shapes:
    // 1) { player_markets: [...] } (legacy)
    // 2) { players_props: [...] } (legacy)
    // 3) { sport_event_players_props: { players_props: [...] } } (v2 schema)
    const eventPayload = data.sport_event_players_props || data.sport_event_player_props || null;
    const playerMarkets = data.player_markets || data.players_props || eventPayload?.players_props || [];
    
    if (playerMarkets.length === 0) {
      console.log(`[SportsRadar Props] No player_markets found in response`);
      // Log first 500 chars of response for debugging
      console.log(`[SportsRadar Props] Response sample: ${JSON.stringify(data).slice(0, 500)}`);
      return [];
    }
    
    console.log(`[SportsRadar Props] Found ${playerMarkets.length} player markets`);
    
    // Parse player markets - each has a player and their prop markets
    for (const pm of playerMarkets) {
      // Try multiple paths for player name (spec can expose player on object or in outcomes)
      const playerName = pm.player?.name || pm.name || pm.player_name || '';
      if (!playerName) continue;
      
      const markets = pm.markets || pm.player_props || [];
      
      for (const market of markets) {
        // Get market type using market ID or name
        const marketId = market.id || market.market_id || '';
        const marketName = market.name || market.market_name || '';
        const propType = mapPropType(marketName) || mapMarketIdToType(marketId);
        if (!propType) continue;
        
        // Parse outcomes (books offering odds)
        const books = market.books || market.outcomes || [];
        
        for (const book of books) {
          const sportsbook = book.name || book.book_name || 'Unknown';
          const outcomes = book.outcomes || [];
          
          let line: number | undefined;
          let overOdds = -110;
          let underOdds = -110;
          
          for (const o of outcomes) {
            const type = (o.type || o.outcome_type || '').toLowerCase();
            const oddsValue = o.odds_american ?? (o.odds ? decimalToAmerican(o.odds) : -110);
            
            if (type.includes('over')) {
              line = o.line ?? o.total ?? o.handicap;
              overOdds = typeof oddsValue === 'number' ? oddsValue : parseInt(String(oddsValue)) || -110;
            } else if (type.includes('under')) {
              underOdds = typeof oddsValue === 'number' ? oddsValue : parseInt(String(oddsValue)) || -110;
            }
          }
          
          if (line !== undefined && playerName) {
            props.push({
              player_name: playerName,
              prop_type: propType,
              line,
              over_odds: overOdds,
              under_odds: underOdds,
              sportsbook,
            });
          }
        }
        
        // Also check for direct outcomes without books wrapper
        if (books.length === 0 && market.outcomes) {
          let line: number | undefined;
          let overOdds = -110;
          let underOdds = -110;
          
          for (const o of market.outcomes) {
            const type = (o.type || '').toLowerCase();
            if (type.includes('over')) {
              line = o.line;
              overOdds = o.odds_american ? parseInt(String(o.odds_american)) : (o.odds ? decimalToAmerican(o.odds) : -110);
            } else if (type.includes('under')) {
              underOdds = o.odds_american ? parseInt(String(o.odds_american)) : (o.odds ? decimalToAmerican(o.odds) : -110);
            }
          }
          if (line !== undefined) {
            props.push({
              player_name: playerName,
              prop_type: propType,
              line,
              over_odds: overOdds,
              under_odds: underOdds,
              sportsbook: 'SportsRadar',
            });
          }
        }
      }
    }
    
    console.log(`[SportsRadar Props] Extracted ${props.length} props`);
    return props;

  } catch (err) {
    console.error('[SportsRadar Props] Error:', err);
    return [];
  }
}

// Map market IDs from SportsRadar API to display types
function mapMarketIdToType(marketId: string): string {
  const MARKET_MAP: Record<string, string> = {
    // NBA
    'sr:market:921': 'Points',
    'sr:market:922': 'Assists',
    'sr:market:923': 'Rebounds',
    'sr:market:924': '3-Pointers',
    'sr:market:8000': 'Steals',
    'sr:market:8001': 'Blocks',
    'sr:market:8002': 'Turnovers',
    'sr:market:8003': 'Pts+Reb',
    'sr:market:8004': 'Pts+Ast',
    'sr:market:8005': 'Reb+Ast',
    'sr:market:8006': 'Pts+Reb+Ast',
    'sr:market:8007': 'Blk+Stl',
    'sr:market:8008': 'Double-Double',
    'sr:market:8009': 'Triple-Double',
    // MLB
    'sr:market:925': 'Strikeouts',
    'sr:market:926': 'Total Bases',
    'sr:market:928': 'Earned Runs',
    'sr:market:9000': 'Hits',
    'sr:market:9001': 'Runs',
    'sr:market:9002': 'RBIs',
    'sr:market:9003': 'Home Runs',
    'sr:market:9012': 'Home Run',
    // NHL
    'sr:market:38': 'First Goal',
    'sr:market:39': 'Last Goal',
    'sr:market:40': 'Anytime Goal',
    'sr:market:7000': 'Shots',
    'sr:market:7001': 'Assists',
    'sr:market:7002': 'Points',
    // NFL
    'sr:market:914': 'Passing Yards',
    'sr:market:915': 'Completions',
    'sr:market:916': 'Passing TDs',
    'sr:market:917': 'Carries',
    'sr:market:918': 'Rushing Yards',
    'sr:market:919': 'Receiving Yards',
    'sr:market:920': 'Receptions',
    'sr:market:6014': 'First TD',
    'sr:market:6016': 'Anytime TD',
  };
  return MARKET_MAP[marketId] || '';
}

function mapPropType(marketName: string): string {
  if (!marketName) return 'Prop';
  
  const lower = marketName.toLowerCase();

  // NBA/NCAAB
  if (lower.includes('point') && !lower.includes('spread')) return 'Points';
  if (lower.includes('rebound')) return 'Rebounds';
  if (lower.includes('assist')) return 'Assists';
  if (lower.includes('three') || lower.includes('3-point')) return '3-Pointers';
  if (lower.includes('steal')) return 'Steals';
  if (lower.includes('block')) return 'Blocks';
  if (lower.includes('pts+reb+ast') || lower.includes('pra')) return 'Pts+Reb+Ast';
  if (lower.includes('double-double') || lower.includes('double double')) return 'Double-Double';
  if (lower.includes('triple-double') || lower.includes('triple double')) return 'Triple-Double';

  // NFL
  if (lower.includes('passing yard')) return 'Passing Yards';
  if (lower.includes('rushing yard')) return 'Rushing Yards';
  if (lower.includes('receiving yard')) return 'Receiving Yards';
  if (lower.includes('pass td') || lower.includes('passing td')) return 'Passing TDs';
  if (lower.includes('reception')) return 'Receptions';
  if (lower.includes('touchdown')) return 'Touchdowns';

  // MLB
  if (lower.includes('hit') && !lower.includes('pitch')) return 'Hits';
  if (lower.includes('total base')) return 'Total Bases';
  if (lower.includes('rbi')) return 'RBIs';
  if (lower.includes('strikeout') && lower.includes('pitch')) return 'Strikeouts';
  if (lower.includes('home run')) return 'Home Runs';
  if (lower.includes('run') && !lower.includes('home')) return 'Runs';

  // NHL
  if (lower.includes('shot on goal') || lower.includes('shots on goal')) return 'Shots on Goal';
  if (lower.includes('goal') && !lower.includes('shot')) return 'Goals';
  if (lower.includes('save')) return 'Saves';

  // Return cleaned-up market name if no specific mapping
  // Capitalize first letter of each word
  return marketName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Batch capture snapshots for all games with odds
 * Call this periodically (e.g., every 15 minutes) to build line history
 */
export async function captureAllOddsSnapshots(
  db: D1Database,
  oddsMap: Map<string, SportsRadarOdds>,
  sport: string
): Promise<{ captured: number; errors: number }> {
  let captured = 0;
  let errors = 0;
  
  for (const [key, odds] of oddsMap) {
    // Skip duplicate keys (we store by multiple keys)
    if (!key.startsWith('sr:')) continue;
    
    try {
      // Store opening lines if this is first time seeing this game
      await storeOpeningLines(db, odds.gameId, odds);
      
      // Capture current snapshot
      await captureOddsSnapshot(db, odds.gameId, sport, odds);
      captured++;
    } catch (err) {
      console.error(`[Line Movement] Error capturing ${odds.gameId}:`, err);
      errors++;
    }
  }
  
  console.log(`[Line Movement] Batch capture complete: ${captured} captured, ${errors} errors`);
  return { captured, errors };
}
