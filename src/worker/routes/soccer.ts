/**
 * Soccer API Routes
 * Fetches soccer standings, leaders, schedules, and match details from SportsRadar
 */

import { Hono } from 'hono';
import { 
  getSportsRadarProvider,
  SOCCER_COMPETITIONS
} from '../services/sports-data/sportsRadarProvider';
import { cachedFetch, API_CACHE_TTL } from '../services/apiCacheService';

// ============================================================================
// ESPN LEAGUE IDS FOR SOCCER
// ============================================================================
const ESPN_SOCCER_LEAGUE_IDS: Record<string, string> = {
  'premier-league': 'eng.1',
  'la-liga': 'esp.1',
  'serie-a': 'ita.1',
  'bundesliga': 'ger.1',
  'ligue-1': 'fra.1',
  'champions-league': 'uefa.champions',
  'mls': 'usa.1',
  'liga-mx': 'mex.1',
};

// ============================================================================
// SOCCER PLAYER PHOTO LOOKUP (TheSportsDB PRIMARY)
// ============================================================================

// Cache for player photo lookups (name -> photoUrl)
const playerPhotoCache = new Map<string, { photoUrl: string | null; timestamp: number }>();
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for successful lookups
const PLAYER_CACHE_TTL_NEGATIVE = 5 * 60 * 1000; // 5 minutes for failed lookups (allows retries)

/**
 * Normalize player name for consistent lookups
 */
function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z\s]/g, '') // Remove non-alpha
    .trim();
}

/**
 * Generate name variations to try for TheSportsDB search
 * TheSportsDB often works better with last name only or specific formats
 */
function getNameVariations(fullName: string): string[] {
  const variations: string[] = [];
  const trimmed = fullName.trim();
  
  // Add original name first
  variations.push(trimmed);
  
  const parts = trimmed.split(/\s+/);
  
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    void parts.slice(1, -1); // middleParts not currently used
    
    // Last name only (often works best for famous players)
    variations.push(lastName);
    
    // First + Last (without middle names)
    if (parts.length > 2) {
      variations.push(`${firstName} ${lastName}`);
    }
    
    // Last name + First name (some databases use this format)
    variations.push(`${lastName} ${firstName}`);
    
    // First name only (for single-name players like "Neymar")
    variations.push(firstName);
    
    // Handle "Jr" or "Junior" suffixes
    if (lastName.toLowerCase() === 'jr' || lastName.toLowerCase() === 'junior') {
      if (parts.length >= 3) {
        const actualLast = parts[parts.length - 2];
        variations.push(actualLast);
        variations.push(`${firstName} ${actualLast}`);
      }
    }
  }
  
  // Remove duplicates while preserving order
  return [...new Set(variations)];
}

/**
 * Single TheSportsDB API call for a given search term
 */
async function queryTheSportsDB(searchTerm: string): Promise<string | null> {
  try {
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(searchTerm)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GZSports/1.0',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json() as any;
    const players = data.player || [];
    
    // Find a soccer player in results
    for (const player of players) {
      if (player.strSport === 'Soccer' && player.strCutout) {
        return player.strCutout;
      }
      if (player.strSport === 'Soccer' && player.strThumb) {
        return player.strThumb;
      }
    }
    
    // If no soccer match, try first player with photo
    for (const player of players) {
      if (player.strCutout) {
        return player.strCutout;
      }
      if (player.strThumb) {
        return player.strThumb;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Search TheSportsDB for a soccer player by name
 * Tries multiple name variations for better match rates
 * API: https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=PlayerName
 */
async function searchTheSportsDBPlayer(playerName: string): Promise<string | null> {
  const variations = getNameVariations(playerName);
  
  // Try each variation until we find a match
  for (const variation of variations) {
    const photo = await queryTheSportsDB(variation);
    if (photo) {
      return photo;
    }
  }
  
  return null;
}

/**
 * Search for soccer player photo - TheSportsDB primary, ESPN fallback
 */
async function searchPlayerPhoto(playerName: string): Promise<string | null> {
  const normalized = normalizePlayerName(playerName);
  
  // Check cache first
  const cached = playerPhotoCache.get(normalized);
  if (cached) {
    const ttl = cached.photoUrl ? PLAYER_CACHE_TTL : PLAYER_CACHE_TTL_NEGATIVE;
    if (Date.now() - cached.timestamp < ttl) {
      return cached.photoUrl;
    }
  }
  
  // Try TheSportsDB first (best for international soccer)
  const tsdbPhoto = await searchTheSportsDBPlayer(playerName);
  if (tsdbPhoto) {
    playerPhotoCache.set(normalized, { photoUrl: tsdbPhoto, timestamp: Date.now() });
    return tsdbPhoto;
  }
  
  // ESPN doesn't have soccer player headshots - they return 404
  // TheSportsDB is the only reliable source for international football players
  
  // No photo found
  playerPhotoCache.set(normalized, { photoUrl: null, timestamp: Date.now() });
  return null;
}

type Bindings = {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
};

const soccer = new Hono<{ Bindings: Bindings }>();

/**
 * Get league summaries for directory page
 * GET /api/soccer/league-summaries
 * 
 * Returns computed stats for each league:
 * - liveCount: number of matches currently live
 * - nextKickoff: next upcoming match time
 * - todayCount: matches scheduled today
 * - featuredMatches: up to 3 compact match previews
 */
soccer.get('/league-summaries', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }

  try {
    const provider = getSportsRadarProvider(apiKey, null);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Top leagues to fetch (match TOP_LEAGUES in frontend)
    const leagueKeys = [
      'premier_league', 'la_liga', 'serie_a', 'bundesliga', 'ligue_1',
      'champions_league', 'mls', 'liga_mx'
    ];

    const summaries = await Promise.all(
      leagueKeys.map(async (key) => {
        try {
          const result = await cachedFetch(
            c.env.DB,
            'sportsradar',
            `soccer/schedule/${key}`,
            API_CACHE_TTL.SR_PROPS, // 5 min cache
            async () => provider.fetchSoccerSchedule(key, apiKey)
          );

          const data = result.data;
          const matches = data.matches || [];

          // Compute stats
          const liveMatches = matches.filter((m: any) => 
            m.status === 'live' || m.status === 'inprogress'
          );

          const todayMatches = matches.filter((m: any) => {
            if (!m.startTime) return false;
            const matchDate = new Date(m.startTime);
            matchDate.setHours(0, 0, 0, 0);
            return matchDate.getTime() === today.getTime();
          });

          const upcomingMatches = matches
            .filter((m: any) => m.startTime && new Date(m.startTime) >= now)
            .sort((a: any, b: any) => 
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            );

          const nextMatch = upcomingMatches[0];
          const featuredMatches = [...liveMatches, ...upcomingMatches]
            .slice(0, 3)
            .map((m: any) => ({
              eventId: m.eventId,
              homeTeam: m.homeTeam?.name || 'TBD',
              awayTeam: m.awayTeam?.name || 'TBD',
              homeScore: m.homeScore,
              awayScore: m.awayScore,
              status: m.status,
              minute: m.minute,
              startTime: m.startTime
            }));

          return {
            leagueKey: key,
            competitionId: SOCCER_COMPETITIONS[key]?.id || null,
            liveCount: liveMatches.length,
            todayCount: todayMatches.length,
            nextKickoff: nextMatch?.startTime || null,
            featuredMatches,
            hasData: matches.length > 0
          };
        } catch (err) {
          console.error(`[Soccer Summaries] Error for ${key}:`, err);
          return {
            leagueKey: key,
            competitionId: SOCCER_COMPETITIONS[key]?.id || null,
            liveCount: 0,
            todayCount: 0,
            nextKickoff: null,
            featuredMatches: [],
            hasData: false,
            error: String(err)
          };
        }
      })
    );

    return c.json({ summaries });

  } catch (err) {
    console.error('[Soccer API] League summaries error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get soccer player photo URL by name
 * GET /api/soccer/player-photo?name=Erling+Haaland
 * 
 * Returns { photoUrl, playerName, found }
 * Uses TheSportsDB (primary) and ESPN (fallback) to find player photos
 */
soccer.get('/player-photo', async (c) => {
  const playerName = c.req.query('name');
  
  if (!playerName) {
    return c.json({ error: 'name query parameter required' }, 400);
  }
  
  try {
    const photoUrl = await searchPlayerPhoto(playerName);
    
    if (photoUrl) {
      return c.json({ 
        photoUrl,
        playerName,
        found: true 
      });
    }
    
    // Return placeholder if not found
    return c.json({ 
      photoUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254',
      playerName,
      found: false 
    });
    
  } catch (error) {
    console.error('Player photo lookup error:', error);
    return c.json({ 
      photoUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254',
      error: String(error),
      found: false 
    });
  }
});

/**
 * Batch lookup player photos
 * POST /api/soccer/player-photos
 * Body: { names: ["Erling Haaland", "Mohamed Salah", ...] }
 * 
 * Returns { players: [{ name, photoUrl, found }, ...] }
 */
soccer.post('/player-photos', async (c) => {
  try {
    const body = await c.req.json() as { names: string[] };
    const names = body.names || [];
    
    if (!Array.isArray(names) || names.length === 0) {
      return c.json({ error: 'names array required' }, 400);
    }
    
    // Limit to 25 players per request
    const limitedNames = names.slice(0, 25);
    
    const players = await Promise.all(
      limitedNames.map(async (name) => {
        try {
          const photoUrl = await searchPlayerPhoto(name);
          return {
            name,
            photoUrl: photoUrl || 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254',
            found: !!photoUrl
          };
        } catch {
          return {
            name,
            photoUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254',
            found: false
          };
        }
      })
    );
    
    return c.json({ players });
    
  } catch (error) {
    console.error('Batch player photo error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * List all available soccer competitions
 * GET /api/soccer/competitions
 */
soccer.get('/competitions', async (c) => {
  const competitions = Object.entries(SOCCER_COMPETITIONS).map(([key, comp]) => ({
    key,
    id: comp.id,
    name: comp.name,
    country: comp.country,
    type: comp.type
  }));
  
  // Group by type
  const leagues = competitions.filter(c => c.type === 'league');
  const cups = competitions.filter(c => c.type === 'cup');
  const international = competitions.filter(c => c.type === 'international');
  
  return c.json({
    total: competitions.length,
    leagues,
    cups,
    international
  });
});

/**
 * Search across teams, players, and matches
 * GET /api/soccer/search?q=query
 * 
 * Returns categorized results from cached data
 */
soccer.get('/search', async (c) => {
  const query = c.req.query('q')?.toLowerCase().trim();
  
  if (!query || query.length < 2) {
    return c.json({ teams: [], players: [], matches: [] });
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    const teams: any[] = [];
    const players: any[] = [];
    const matches: any[] = [];
    
    // Search across major competitions
    const competitionsToSearch = [
      'premier-league',
      'la-liga',
      'serie-a',
      'bundesliga',
      'ligue-1',
      'champions-league',
      'europa-league'
    ];
    
    // Use cached standings/schedules data for search
    for (const compKey of competitionsToSearch) {
      try {
        // Search teams from standings
        const standingsResult = await cachedFetch(
          c.env.DB,
          'sportsradar',
          `soccer/standings/${compKey}`,
          API_CACHE_TTL.SR_STANDINGS,
          async () => {
            const provider = getSportsRadarProvider(apiKey, null);
            return provider.fetchSoccerStandings(compKey, apiKey);
          }
        );
        
        const standingsData = standingsResult.data;
        if (standingsData.standings.length > 0) {
          for (const standing of standingsData.standings) {
            if (standing.name.toLowerCase().includes(query)) {
              teams.push({
                id: standing.id,
                name: standing.name,
                leagueName: standingsData.competition.name,
                leagueId: standingsData.competition.id,
                logoUrl: standing.logo || null
              });
            }
          }
        }
        
        // Search matches from schedule
        const scheduleResult = await cachedFetch(
          c.env.DB,
          'sportsradar',
          `soccer/schedule/${compKey}`,
          API_CACHE_TTL.SR_PROPS,
          async () => {
            const provider = getSportsRadarProvider(apiKey, null);
            return provider.fetchSoccerSchedule(compKey, apiKey);
          }
        );
        
        const scheduleData = scheduleResult.data;
        if (scheduleData.matches.length > 0) {
          const now = new Date();
          const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
          const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          for (const match of scheduleData.matches) {
            const matchDate = new Date(match.startTime);
            // Only include recent/upcoming matches
            if (matchDate < twoDaysAgo || matchDate > sevenDaysAhead) continue;
            
            const homeTeamMatch = match.homeTeam.toLowerCase().includes(query);
            const awayTeamMatch = match.awayTeam.toLowerCase().includes(query);
            
            if (homeTeamMatch || awayTeamMatch) {
              matches.push({
                id: match.eventId,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeTeamId: match.homeTeamId,
                awayTeamId: match.awayTeamId,
                competitionName: scheduleData.competition.name,
                competitionId: scheduleData.competition.id,
                startTime: match.startTime,
                status: match.status || 'scheduled'
              });
            }
          }
        }
        
        // Search players from leaders
        const leadersResult = await cachedFetch(
          c.env.DB,
          'sportsradar',
          `soccer/leaders/${compKey}`,
          API_CACHE_TTL.SR_SOCCER_LEADERS,
          async () => {
            const provider = getSportsRadarProvider(apiKey, null);
            return provider.fetchSoccerLeaders(compKey, apiKey);
          }
        );
        
        const leadersData = leadersResult.data;
        const allPlayers = [...leadersData.topScorers, ...leadersData.topAssists];
        
        for (const player of allPlayers) {
          if (player.name.toLowerCase().includes(query)) {
            // Avoid duplicates
            if (!players.find(p => p.id === player.playerId)) {
              players.push({
                id: player.playerId,
                name: player.name,
                teamName: player.teamName,
                teamId: player.teamId,
                position: player.position || null,
                imageUrl: player.imageUrl || null
              });
            }
          }
        }
        
      } catch (err) {
        // Continue with other competitions if one fails
        console.error(`[Search] Error searching ${compKey}:`, err);
      }
    }
    
    // Remove duplicates and limit results
    const uniqueTeams = Array.from(new Map(teams.map(t => [t.id, t])).values()).slice(0, 5);
    const uniquePlayers = Array.from(new Map(players.map(p => [p.id, p])).values()).slice(0, 5);
    const uniqueMatches = Array.from(new Map(matches.map(m => [m.id, m])).values()).slice(0, 5);
    
    return c.json({
      teams: uniqueTeams,
      players: uniquePlayers,
      matches: uniqueMatches
    });
    
  } catch (err) {
    console.error('[Soccer Search] Error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get standings/league table for a competition
 * GET /api/soccer/standings/:competitionKey
 */
soccer.get('/standings/:competitionKey', async (c) => {
  const competitionKey = c.req.param('competitionKey');
  
  // Validate competition exists
  if (!SOCCER_COMPETITIONS[competitionKey]) {
    return c.json({ 
      error: `Unknown competition: ${competitionKey}`,
      availableCompetitions: Object.keys(SOCCER_COMPETITIONS).slice(0, 10)
    }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use caching - 15 minute TTL
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/standings/${competitionKey}`,
      API_CACHE_TTL.SR_STANDINGS,
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerStandings(competitionKey, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && data.standings.length === 0) {
      return c.json({ error: data.errors[0] }, 500);
    }
    
    return c.json({
      competition: data.competition,
      season: data.season,
      standings: data.standings,
      cached: result.fromCache,
      errors: data.errors
    });
    
  } catch (err) {
    console.error('[Soccer API] Standings error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * ESPN-BASED TOP PERFORMERS (TEST ENDPOINT)
 * Uses ESPN API instead of SportsRadar to test if rate limiting is the issue
 * GET /api/soccer/espn-leaders/:competitionKey
 */
soccer.get('/espn-leaders/:competitionKey', async (c) => {
  const competitionKey = c.req.param('competitionKey');
  
  // Map to ESPN league ID
  const espnLeagueId = ESPN_SOCCER_LEAGUE_IDS[competitionKey];
  if (!espnLeagueId) {
    return c.json({ 
      error: `ESPN not available for: ${competitionKey}. Supported: ${Object.keys(ESPN_SOCCER_LEAGUE_IDS).join(', ')}` 
    }, 400);
  }
  
  try {
    // ESPN Statistics endpoint (has goalsLeaders and assistsLeaders)
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeagueId}/statistics`;
    console.log('[ESPN Soccer] Fetching statistics from:', espnUrl);
    
    const response = await fetch(espnUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GZSports/1.0',
      },
    });
    
    if (!response.ok) {
      console.error('[ESPN Soccer] Leaders API error:', response.status);
      return c.json({ 
        error: `ESPN API error: ${response.status}`,
        espnLeagueId,
        url: espnUrl 
      }, 500);
    }
    
    const data = await response.json() as any;
    
    // ESPN /statistics returns { stats: [{ name: 'goalsLeaders', leaders: [...] }, ...] }
    const stats = data.stats || [];
    console.log('[ESPN Soccer] Statistics response:', {
      hasStats: stats.length > 0,
      categories: stats.map((s: any) => s.name),
    });
    
    // Find goals and assists categories
    const goalsCategory = stats.find((s: any) => 
      s.name === 'goalsLeaders' || s.name === 'goals'
    );
    const assistsCategory = stats.find((s: any) => 
      s.name === 'assistsLeaders' || s.name === 'assists' || s.name === 'goalAssists'
    );
    
    // Transform ESPN format to our standard format
    const topScorers = (goalsCategory?.leaders || []).slice(0, 10).map((entry: any) => {
      const athlete = entry.athlete || {};
      const team = athlete.team || {};
      // Get goals from statistics array
      const goalsStat = athlete.statistics?.find((s: any) => s.name === 'totalGoals');
      const goals = goalsStat?.value || entry.value || 0;
      
      return {
        playerId: athlete.id ? `espn:${athlete.id}` : '',
        name: athlete.displayName || athlete.shortName || 'Unknown',
        teamId: team.id ? `espn:${team.id}` : '',
        teamName: team.displayName || team.name || team.abbreviation || '',
        goals,
        photoUrl: `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${athlete.id}.png&w=350&h=254`,
        teamLogo: team.logos?.[0]?.href || null,
      };
    });
    
    const topAssists = (assistsCategory?.leaders || []).slice(0, 10).map((entry: any) => {
      const athlete = entry.athlete || {};
      const team = athlete.team || {};
      // Get assists from statistics array
      const assistsStat = athlete.statistics?.find((s: any) => s.name === 'goalAssists');
      const assists = assistsStat?.value || entry.value || 0;
      
      return {
        playerId: athlete.id ? `espn:${athlete.id}` : '',
        name: athlete.displayName || athlete.shortName || 'Unknown',
        teamId: team.id ? `espn:${team.id}` : '',
        teamName: team.displayName || team.name || team.abbreviation || '',
        assists,
        photoUrl: `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${athlete.id}.png&w=350&h=254`,
        teamLogo: team.logos?.[0]?.href || null,
      };
    });
    
    return c.json({
      source: 'espn',
      competition: competitionKey,
      espnLeagueId,
      topScorers,
      topAssists,
      availableCategories: stats.map((s: any) => ({
        name: s.name,
        displayName: s.displayName,
        count: s.leaders?.length || 0,
      })),
    });
    
  } catch (err) {
    console.error('[ESPN Soccer] Leaders fetch error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get top scorers and assists for a competition (SportsRadar)
 * GET /api/soccer/leaders/:competitionKey
 */
soccer.get('/leaders/:competitionKey', async (c) => {
  const competitionKey = c.req.param('competitionKey');
  
  if (!SOCCER_COMPETITIONS[competitionKey]) {
    return c.json({ error: `Unknown competition: ${competitionKey}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use caching - 30 minute TTL for leaders
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/leaders/${competitionKey}`,
      API_CACHE_TTL.SR_SOCCER_LEADERS,
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerLeaders(competitionKey, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && data.topScorers.length === 0) {
      return c.json({ error: data.errors[0] }, 500);
    }
    
    return c.json({
      competition: data.competition,
      season: data.season,
      topScorers: data.topScorers,
      topAssists: data.topAssists,
      cached: result.fromCache,
      errors: data.errors
    });
    
  } catch (err) {
    console.error('[Soccer API] Leaders error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get schedule/fixtures for a competition
 * GET /api/soccer/schedule/:competitionKey
 */
soccer.get('/schedule/:competitionKey', async (c) => {
  const competitionKey = c.req.param('competitionKey');
  const filter = c.req.query('filter'); // 'upcoming', 'recent', or 'all'
  
  if (!SOCCER_COMPETITIONS[competitionKey]) {
    return c.json({ error: `Unknown competition: ${competitionKey}` }, 400);
  }
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use caching - 5 minute TTL for schedule (more dynamic)
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/schedule/${competitionKey}`,
      API_CACHE_TTL.SR_PROPS, // 5 minute TTL
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerSchedule(competitionKey, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && data.matches.length === 0) {
      // Do not hard-fail the page when SportsRadar has temporary coverage gaps
      // (for example, no current season returned for a competition).
      // Returning a stable empty payload prevents frontend hard-crash blank states.
      return c.json({
        competition: data.competition || null,
        season: data.season || null,
        matches: [],
        totalMatches: 0,
        filter: filter || 'all',
        cached: result.fromCache,
        errors: data.errors,
      });
    }
    
    // Filter matches based on query param
    const now = new Date();
    let matches = data.matches;
    
    if (filter === 'upcoming') {
      matches = matches
        .filter((m: any) => m.startTime && new Date(m.startTime) >= now)
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 20);
    } else if (filter === 'recent') {
      matches = matches
        .filter((m: any) => m.startTime && new Date(m.startTime) < now)
        .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 20);
    }
    
    return c.json({
      competition: data.competition,
      season: data.season,
      matches,
      totalMatches: data.matches.length,
      filter: filter || 'all',
      cached: result.fromCache,
      errors: data.errors
    });
    
  } catch (err) {
    console.error('[Soccer API] Schedule error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get match details including lineups, stats, and timeline
 * GET /api/soccer/match/:eventId
 * 
 * Live-aware caching:
 * - Live matches: 15s TTL for real-time updates
 * - Pre/post matches: 5min TTL to reduce API calls
 * - Pass ?live=true query param to force short cache
 */
soccer.get('/match/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const forceLive = c.req.query('live') === 'true';
  
  // ============================================================================
  // ESPN MATCH LOOKUP (for IDs that aren't SportsRadar URNs)
  // ============================================================================
  if (!eventId.startsWith('sr:')) {
    console.log(`[Soccer Match] ESPN lookup for ID: ${eventId}`);
    
    try {
      // Try different ESPN league endpoints
      const ESPN_LEAGUES = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1', 'uefa.champions', 'uefa.europa'];
      
      for (const leagueId of ESPN_LEAGUES) {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/summary?event=${eventId}`;
        
        const response = await fetch(espnUrl);
        if (!response.ok) continue;
        
        const data = await response.json() as any;
        if (!data.header) continue;
        
        // Found the match - transform ESPN format to our standard format
        const header = data.header;
        const competition = header.competitions?.[0] || {};
        const homeCompetitor = competition.competitors?.find((c: any) => c.homeAway === 'home');
        const awayCompetitor = competition.competitors?.find((c: any) => c.homeAway === 'away');
        
        // Map ESPN status to our standard statuses
        const espnStatus = competition.status?.type?.name?.toLowerCase() || 'scheduled';
        const mappedStatus = espnStatus === 'status_full_time' ? 'closed' :
                             espnStatus === 'status_halftime' ? 'live' :
                             espnStatus === 'status_in_progress' ? 'live' :
                             espnStatus === 'in' ? 'live' :
                             espnStatus;
        
        const match = {
          eventId: `espn:${eventId}`,
          // Match the Team interface: { id, name, abbreviation?, country? }
          homeTeam: {
            id: homeCompetitor?.team?.id ? `espn:team:${homeCompetitor.team.id}` : 'unknown',
            name: homeCompetitor?.team?.displayName || 'Home',
            abbreviation: homeCompetitor?.team?.abbreviation || undefined,
            logo: homeCompetitor?.team?.logos?.[0]?.href || null,
          },
          awayTeam: {
            id: awayCompetitor?.team?.id ? `espn:team:${awayCompetitor.team.id}` : 'unknown',
            name: awayCompetitor?.team?.displayName || 'Away',
            abbreviation: awayCompetitor?.team?.abbreviation || undefined,
            logo: awayCompetitor?.team?.logos?.[0]?.href || null,
          },
          homeScore: parseInt(homeCompetitor?.score || '0'),
          awayScore: parseInt(awayCompetitor?.score || '0'),
          status: mappedStatus,
          statusText: competition.status?.type?.shortDetail || '',
          startTime: competition.date || header.timeValid,
          venue: data.gameInfo?.venue?.fullName || null,
          competition: header.league?.name || 'Unknown League',
          competitionId: header.league?.id || null
        };
        
        // Parse lineups from rosters if available
        const lineups = { home: [] as any[], away: [] as any[] };
        if (data.rosters) {
          for (const roster of data.rosters) {
            const isHome = roster.homeAway === 'home';
            const players = roster.roster || [];
            for (const player of players) {
              const playerData = {
                playerId: player.athlete?.id ? `espn:${player.athlete.id}` : null,
                name: player.athlete?.displayName || player.athlete?.shortName || 'Unknown',
                position: player.position?.abbreviation || player.position?.name || '',
                jerseyNumber: player.jersey || '',
                starter: player.starter || false,
                photoUrl: player.athlete?.headshot?.href || null
              };
              if (isHome) lineups.home.push(playerData);
              else lineups.away.push(playerData);
            }
          }
        }
        
        // Parse basic stats from boxscore
        const statistics = data.boxscore?.teams || null;
        
        // Return ESPN data in standard format
        return c.json({
          match,
          lineups,
          statistics,
          timeline: [], // ESPN doesn't provide play-by-play in the same format
          isLive: match.status === 'in' || match.status === 'live',
          recommendedPollInterval: 60000,
          cached: false,
          source: 'espn',
          errors: []
        });
      }
      
      // ESPN lookup failed for all leagues
      return c.json({ error: 'Match not found in any league' }, 404);
      
    } catch (err) {
      console.error('[Soccer API] ESPN match lookup error:', err);
      return c.json({ error: String(err) }, 500);
    }
  }
  
  // ============================================================================
  // SPORTSRADAR MATCH LOOKUP (for sr: prefixed IDs)
  // ============================================================================
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // First fetch to check if match is live (use default TTL initially)
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/match/${eventId}`,
      forceLive ? API_CACHE_TTL.SR_SOCCER_MATCH_LIVE : API_CACHE_TTL.SR_SOCCER_MATCH,
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerMatchDetail(eventId, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && !data.match) {
      return c.json({ error: data.errors[0] }, 500);
    }
    
    // Check if match is live for client-side polling hint
    const isLive = data.match?.status === 'live' || 
                   data.match?.status === 'inprogress' ||
                   data.match?.status === 'started';
    
    return c.json({
      match: data.match,
      lineups: data.lineups,
      statistics: data.statistics,
      timeline: data.timeline,
      isLive,
      recommendedPollInterval: isLive ? 15000 : 60000, // 15s for live, 60s otherwise
      cached: result.fromCache,
      errors: data.errors
    });
    
  } catch (err) {
    console.error('[Soccer API] Match detail error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * DEBUG: Test raw SportsRadar lineups endpoint
 * GET /api/soccer/debug-lineups/:eventId
 */
soccer.get('/debug-lineups/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    const SOCCER_API_BASES = [
      'https://api.sportradar.com/soccer/production/v4',
      'https://api.sportradar.com/soccer/trial/v4'
    ];
    
    const results: any = {};
    
    for (const baseUrl of SOCCER_API_BASES) {
      // Test lineups endpoint
      const lineupsUrl = `${baseUrl}/en/sport_events/${eventId}/lineups.json?api_key=${apiKey}`;
      console.log(`[DEBUG] Testing lineups URL: ${lineupsUrl}`);
      
      const lineupsResponse = await fetch(lineupsUrl);
      console.log(`[DEBUG] Lineups response status: ${lineupsResponse.status}`);
      
      if (lineupsResponse.ok) {
        const lineupsData = await lineupsResponse.json();
        results[baseUrl] = {
          status: lineupsResponse.status,
          topLevelKeys: Object.keys(lineupsData || {}),
          raw: lineupsData
        };
      } else {
        results[baseUrl] = {
          status: lineupsResponse.status,
          error: await lineupsResponse.text()
        };
      }
    }
    
    return c.json({
      eventId,
      results
    });
    
  } catch (err) {
    console.error('[DEBUG] Lineups test error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get head-to-head history between two teams
 * GET /api/soccer/h2h/:team1Id/:team2Id
 */
soccer.get('/h2h/:team1Id/:team2Id', async (c) => {
  const team1Id = c.req.param('team1Id');
  const team2Id = c.req.param('team2Id');
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use caching - 1 hour TTL for H2H data (historical, doesn't change often)
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/h2h/${team1Id}/${team2Id}`,
      API_CACHE_TTL.SR_TEAM_PROFILE, // 1 hour TTL
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerH2H(team1Id, team2Id, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && data.meetings.length === 0) {
      return c.json({ error: data.errors[0] }, 500);
    }
    
    return c.json({
      team1: data.team1,
      team2: data.team2,
      totals: data.totals,
      meetings: data.meetings,
      cached: result.fromCache,
      errors: data.errors
    });
    
  } catch (err) {
    console.error('[Soccer API] H2H error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get player profile with stats and recent matches
 * GET /api/soccer/player/:playerId
 * 
 * Aggregates data from:
 * - Competition leaders (stats)
 * - Team profile (bio details)
 * - Team schedule (recent matches)
 */
soccer.get('/player/:playerId', async (c) => {
  const playerId = c.req.param('playerId');
  
  // ============================================================================
  // ESPN PLAYER LOOKUP (for IDs from ESPN-powered leaders)
  // ============================================================================
  if (playerId.startsWith('espn:')) {
    const espnId = playerId.replace('espn:', '');
    
    try {
      // Use ESPN's common API which works for all soccer athletes
      const athleteUrl = `https://site.api.espn.com/apis/common/v3/sports/soccer/athletes/${espnId}`;
      console.log('[ESPN Player] Fetching from:', athleteUrl);
      
      const response = await fetch(athleteUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GZSports/1.0',
        },
      });
      
      if (!response.ok) {
        console.error('[ESPN Player] API error:', response.status);
        return c.json({ 
          found: false, 
          error: 'Player not found in ESPN database',
          playerId 
        }, 404);
      }
      
      const athleteData = await response.json() as any;
      
      // Extract player info from ESPN response
      // ESPN common API returns basic info - no team/stats in this endpoint
      const athlete = athleteData.athlete || athleteData;
      const position = athlete.position?.displayName || athlete.position?.name || '';
      
      // Build player object with available data
      const player = {
        id: playerId,
        name: athlete.displayName || athlete.fullName || 'Unknown Player',
        nationality: athlete.citizenship || athlete.birthPlace?.country || '',
        dateOfBirth: athlete.dateOfBirth || null,
        height: athlete.height ? `${Math.floor(athlete.height / 12)}'${athlete.height % 12}"` : null,
        weight: athlete.weight ? `${athlete.weight} lbs` : null,
        position: position || 'Forward', // Default position since API often doesn't include it
        jerseyNumber: athlete.jersey || null,
        team: null as { id: string; name: string } | null,
        competition: null as { id: string; name: string } | null,
        photoUrl: null as string | null,
      };
      
      // Fetch photo from TheSportsDB (ESPN doesn't have soccer headshots)
      const playerName = player.name;
      try {
        const tsdbUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`;
        const tsdbRes = await fetch(tsdbUrl, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'GZSports/1.0' },
        });
        if (tsdbRes.ok) {
          const tsdbData = await tsdbRes.json() as any;
          const foundPlayer = tsdbData.player?.[0];
          if (foundPlayer) {
            // Prefer cutout image, fall back to thumb
            player.photoUrl = foundPlayer.strCutout || foundPlayer.strThumb || null;
          }
        }
      } catch (err) {
        console.error('[ESPN Player] TheSportsDB photo lookup error:', err);
      }
      
      // Try to find player in league leaders to get team and stats
      let goals = 0;
      let assists = 0;
      let appearances = 0;
      
      // Search Premier League leaders (most likely source for ESPN player IDs)
      try {
        const plStatsUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/statistics`;
        const statsRes = await fetch(plStatsUrl, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'GZSports/1.0' },
        });
        
        if (statsRes.ok) {
          const statsData = await statsRes.json() as any;
          const categories = statsData.stats || [];
          
          // Search for player in goals and assists leaders
          for (const cat of categories) {
            for (const leader of (cat.leaders || [])) {
              const leaderAthlete = leader.athlete || {};
              if (leaderAthlete.id === espnId) {
                const team = leaderAthlete.team || {};
                if (team.id) {
                  player.team = {
                    id: `espn:${team.id}`,
                    name: team.displayName || team.name || ''
                  };
                  player.competition = {
                    id: 'premier-league',
                    name: 'Premier League'
                  };
                }
                // Get stats from this leader entry
                const playerStats = leaderAthlete.statistics || [];
                for (const stat of playerStats) {
                  if (stat.name === 'totalGoals') goals = parseInt(stat.value) || 0;
                  if (stat.name === 'goalAssists') assists = parseInt(stat.value) || 0;
                  if (stat.name === 'appearances') appearances = parseInt(stat.value) || 0;
                }
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error('[ESPN Player] Error fetching league stats:', err);
      }
      
      const stats = {
        appearances,
        goals,
        assists,
        yellowCards: 0,
        redCards: 0,
        minutesPlayed: 0
      };
      
      // Get recent results from ESPN if team available
      let recentMatches: any[] = [];
      const teamId = player.team?.id?.replace('espn:', '');
      if (teamId) {
        try {
          const teamResultsUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${teamId}/schedule`;
          const teamRes = await fetch(teamResultsUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'GZSports/1.0' },
          });
          
          if (teamRes.ok) {
            const teamData = await teamRes.json() as any;
            const events = teamData.events || [];
            
            // Get completed matches
            const completedMatches = events
              .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
              .slice(-10)
              .reverse();
            
            recentMatches = completedMatches.map((event: any) => {
              const comp = event.competitions?.[0] || {};
              const competitors = comp.competitors || [];
              const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
              const awayTeam = competitors.find((c: any) => c.homeAway === 'away');
              const isHome = homeTeam?.id === teamId;
              const opponent = isHome ? awayTeam?.team?.displayName : homeTeam?.team?.displayName;
              const homeScore = parseInt(homeTeam?.score) || 0;
              const awayScore = parseInt(awayTeam?.score) || 0;
              
              let result = 'D';
              if (isHome) {
                result = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
              } else {
                result = awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'D';
              }
              
              return {
                eventId: event.id,
                date: event.date,
                competition: 'Premier League',
                opponent,
                opponentId: isHome ? awayTeam?.id : homeTeam?.id,
                result: `${result} ${homeScore}-${awayScore}`,
                goals: 0,
                assists: 0,
                minutesPlayed: 90
              };
            });
          }
        } catch (err) {
          console.error('[ESPN Player] Error fetching team schedule:', err);
        }
      }
      
      return c.json({
        player,
        stats,
        recentMatches,
        found: true,
        source: 'espn'
      });
      
    } catch (err) {
      console.error('[ESPN Player] Error fetching player:', err);
      return c.json({ error: String(err), found: false }, 500);
    }
  }
  
  // ============================================================================
  // SPORTSRADAR PLAYER LOOKUP (original implementation)
  // ============================================================================
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    const provider = getSportsRadarProvider(apiKey, null);
    
    // Step 1: Search leaders across major competitions to find the player
    // Use parallel search for speed - most will hit cache anyway
    const competitionsToSearch = [
      'premier-league', 'la-liga', 'serie-a', 'bundesliga', 'ligue-1',
      'champions-league', 'europa-league', 'mls'
    ];
    
    let foundPlayer: any = null;
    let foundCompetition: any = null;
    let playerGoals = 0;
    let playerAssists = 0;
    
    // Search competitions SEQUENTIALLY to avoid rate limiting
    // The queue system in sportsRadarProvider will space out the API calls
    for (const compKey of competitionsToSearch) {
      try {
        const leadersResult = await cachedFetch(
          c.env.DB,
          'sportsradar',
          `soccer/leaders/${compKey}`,
          API_CACHE_TTL.SR_SOCCER_LEADERS,
          async () => provider.fetchSoccerLeaders(compKey, apiKey)
        );
        
        const data = leadersResult.data;
        
        // Check cache hit - if cached, we can search faster
        if (leadersResult.fromCache) {
          const allPlayers = [...(data.topScorers || []), ...(data.topAssists || [])];
          for (const player of allPlayers) {
            if (player.playerId === playerId) {
              foundPlayer = player;
              foundCompetition = data.competition;
              playerGoals = Math.max(playerGoals, player.goals || 0);
              playerAssists = Math.max(playerAssists, player.assists || 0);
              break;
            }
          }
          if (foundPlayer) break;
        } else {
          // API call - check player and continue
          const allPlayers = [...(data.topScorers || []), ...(data.topAssists || [])];
          for (const player of allPlayers) {
            if (player.playerId === playerId) {
              foundPlayer = player;
              foundCompetition = data.competition;
              playerGoals = Math.max(playerGoals, player.goals || 0);
              playerAssists = Math.max(playerAssists, player.assists || 0);
              break;
            }
          }
          if (foundPlayer) break;
        }
      } catch (err) {
        console.error(`[Soccer API] Error searching ${compKey}:`, err);
      }
    }
    
    // Results collected in foundPlayer above
    
    // Player search already happened in loop above
    
    // Step 2: If we found the player, get their team profile for more details
    let playerDetails: any = null;
    let recentMatches: any[] = [];
    
    if (foundPlayer?.teamId) {
      try {
        const teamResult = await cachedFetch(
          c.env.DB,
          'sportsradar',
          `soccer/team/${foundPlayer.teamId}`,
          1800, // 30 minutes
          async () => provider.fetchSoccerTeamProfile(foundPlayer.teamId, apiKey)
        );
        
        const teamData = teamResult.data;
        
        // Find player in team roster for more details
        if (teamData.players) {
          playerDetails = teamData.players.find((p: any) => p.id === playerId);
        }
        
        // Build recent matches from team's results
        if (teamData.recentResults) {
          void (teamData.team?.name || foundPlayer.teamName); // teamName available if needed
          
          recentMatches = teamData.recentResults.slice(0, 10).map((match: any) => {
            const isHome = match.homeTeamId === foundPlayer.teamId;
            const opponent = isHome ? match.awayTeam : match.homeTeam;
            const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
            const homeScore = match.homeScore || 0;
            const awayScore = match.awayScore || 0;
            
            let result = 'D';
            if (isHome) {
              result = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
            } else {
              result = awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'D';
            }
            
            return {
              eventId: match.eventId,
              date: match.startTime,
              competition: match.competition || foundCompetition?.name || '',
              opponent: opponent,
              opponentId: opponentId,
              result: `${result} ${homeScore}-${awayScore}`,
              // Individual stats not available from team results, show 0
              goals: 0,
              assists: 0,
              minutesPlayed: 90
            };
          });
        }
      } catch (err) {
        console.error('[Soccer API] Error fetching team for player:', err);
      }
    }
    
    // Build response
    const player = {
      id: playerId,
      name: foundPlayer?.playerName || playerDetails?.name || 'Unknown Player',
      nationality: playerDetails?.nationality || foundPlayer?.nationality || '',
      dateOfBirth: playerDetails?.dateOfBirth || null,
      height: playerDetails?.height || null,
      weight: playerDetails?.weight || null,
      position: playerDetails?.position || 'Unknown',
      jerseyNumber: playerDetails?.jerseyNumber || null,
      team: foundPlayer?.teamId ? {
        id: foundPlayer.teamId,
        name: foundPlayer.teamName || ''
      } : null,
      competition: foundCompetition ? {
        id: foundCompetition.id,
        name: foundCompetition.name
      } : null
    };
    
    const stats = {
      appearances: foundPlayer?.matches || playerDetails?.appearances || 0,
      goals: playerGoals || playerDetails?.goals || 0,
      assists: playerAssists || playerDetails?.assists || 0,
      yellowCards: playerDetails?.yellowCards || 0,
      redCards: playerDetails?.redCards || 0,
      minutesPlayed: playerDetails?.minutesPlayed || 0
    };
    
    return c.json({
      player,
      stats,
      recentMatches,
      found: !!foundPlayer
    });
    
  } catch (err) {
    console.error('[Soccer API] Player profile error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get soccer team profile with squad, results, and fixtures
 * GET /api/soccer/team/:teamId
 * Supports both SportsRadar IDs (sr:competitor:XXX) and ESPN IDs (plain numbers)
 */
soccer.get('/team/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  
  // Check if this is an ESPN ID (not sr: format)
  const isEspnId = !teamId.startsWith('sr:');
  
  if (isEspnId) {
    // ESPN fallback for non-SportsRadar IDs
    try {
      const result = await cachedFetch(
        c.env.DB,
        'espn',
        `soccer/team/${teamId}`,
        1800, // 30 minutes
        async () => {
          // Try each ESPN league until we find the team
          const leagueIds = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1'];
          
          for (const leagueId of leagueIds) {
            try {
              // Fetch team info
              const teamUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/teams/${teamId}`;
              const teamResp = await fetch(teamUrl);
              if (!teamResp.ok) continue;
              
              const teamData = await teamResp.json() as { team?: { id: string; name: string; abbreviation?: string; logos?: Array<{ href: string }>; record?: { items?: Array<{ stats?: Array<{ name: string; value: number }> }> } } };
              if (!teamData.team) continue;
              
              const team = teamData.team;
              
              // Fetch roster
              const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/teams/${teamId}/roster`;
              const rosterResp = await fetch(rosterUrl);
              const rosterData = rosterResp.ok 
                ? await rosterResp.json() as { athletes?: Array<{ id: string; displayName: string; jersey?: string; position?: { name: string } }> }
                : { athletes: [] };
              
              // Fetch schedule for recent results
              const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/teams/${teamId}/schedule`;
              const scheduleResp = await fetch(scheduleUrl);
              const scheduleData = scheduleResp.ok 
                ? await scheduleResp.json() as { events?: Array<{ id: string; date: string; name: string; competitions?: Array<{ status?: { type?: { name: string } }; competitors?: Array<{ id: string; team?: { name: string; logo: string }; score?: string; winner?: boolean }> }> }> }
                : { events: [] };
              
              // Extract record stats
              const recordStats = team.record?.items?.[0]?.stats || [];
              const getStat = (name: string) => recordStats.find((s: { name: string; value: number }) => s.name === name)?.value || 0;
              
              // Transform players
              const players = (rosterData.athletes || []).map((a: { id: string; displayName: string; jersey?: string; position?: { name: string } }) => ({
                id: `espn:${a.id}`,
                name: a.displayName,
                jerseyNumber: a.jersey || '',
                position: a.position?.name || 'Unknown'
              }));
              
              // Transform matches - separate recent results and upcoming
              const now = new Date();
              const recentResults: Array<{ id: string; date: string; homeTeam: { name: string; logo?: string }; awayTeam: { name: string; logo?: string }; homeScore: number; awayScore: number; status: string }> = [];
              const upcomingFixtures: Array<{ id: string; date: string; homeTeam: { name: string; logo?: string }; awayTeam: { name: string; logo?: string }; status: string }> = [];
              
              for (const event of (scheduleData.events || []).slice(0, 20)) {
                const comp = event.competitions?.[0];
                const status = comp?.status?.type?.name || '';
                const isCompleted = status === 'STATUS_FULL_TIME' || status === 'STATUS_FINAL';
                const eventDate = new Date(event.date);
                
                const homeComp = comp?.competitors?.find((x: { id: string }) => x.id !== teamId) || comp?.competitors?.[0];
                const awayComp = comp?.competitors?.find((x: { id: string }) => x.id === teamId) || comp?.competitors?.[1];
                
                const matchData = {
                  id: event.id,
                  date: event.date,
                  homeTeam: { name: homeComp?.team?.name || 'TBD', logo: homeComp?.team?.logo },
                  awayTeam: { name: awayComp?.team?.name || 'TBD', logo: awayComp?.team?.logo },
                  status: isCompleted ? 'completed' : eventDate > now ? 'scheduled' : 'live'
                };
                
                if (isCompleted) {
                  recentResults.push({
                    ...matchData,
                    homeScore: parseInt(homeComp?.score || '0', 10),
                    awayScore: parseInt(awayComp?.score || '0', 10)
                  });
                } else if (eventDate > now) {
                  upcomingFixtures.push(matchData);
                }
              }
              
              // Get league name from leagueId
              const leagueNames: Record<string, string> = {
                'eng.1': 'Premier League',
                'esp.1': 'La Liga',
                'ita.1': 'Serie A',
                'ger.1': 'Bundesliga',
                'fra.1': 'Ligue 1',
                'usa.1': 'MLS'
              };
              
              return {
                team: {
                  id: `espn:${team.id}`,
                  name: team.name,
                  abbreviation: team.abbreviation || '',
                  logo: team.logos?.[0]?.href || '',
                  competition: leagueNames[leagueId] || leagueId
                },
                players,
                recentResults: recentResults.slice(0, 10),
                upcomingFixtures: upcomingFixtures.slice(0, 5),
                leagueStanding: {
                  position: getStat('rank'),
                  points: getStat('points'),
                  played: getStat('gamesPlayed'),
                  won: getStat('wins'),
                  drawn: getStat('ties'),
                  lost: getStat('losses'),
                  goalsFor: getStat('pointsFor'),
                  goalsAgainst: getStat('pointsAgainst')
                },
                seasonStats: {
                  goalsScored: getStat('pointsFor'),
                  goalsConceded: getStat('pointsAgainst'),
                  cleanSheets: 0 // ESPN doesn't provide this
                },
                errors: [],
                source: 'espn'
              };
            } catch (leagueErr) {
              console.error(`[Soccer API] ESPN team lookup failed for league ${leagueId}:`, leagueErr);
              continue;
            }
          }
          
          // No league found the team
          return {
            team: null,
            players: [],
            recentResults: [],
            upcomingFixtures: [],
            leagueStanding: null,
            seasonStats: null,
            errors: ['Team not found in ESPN data'],
            source: 'espn'
          };
        }
      );
      
      const data = result.data;
      
      if (!data.team) {
        return c.json({ error: 'Team not found' }, 404);
      }
      
      return c.json({
        team: data.team,
        players: data.players,
        recentResults: data.recentResults,
        upcomingFixtures: data.upcomingFixtures,
        leagueStanding: data.leagueStanding,
        seasonStats: data.seasonStats,
        cached: result.fromCache,
        errors: data.errors,
        source: 'espn'
      });
      
    } catch (err) {
      console.error('[Soccer API] ESPN team profile error:', err);
      return c.json({ error: String(err) }, 500);
    }
  }
  
  // SportsRadar path for sr: format IDs
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use caching - 30 minute TTL for team profile
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/team/${teamId}`,
      1800, // 30 minutes
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerTeamProfile(teamId, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && !data.team) {
      return c.json({ error: data.errors[0] }, 500);
    }
    
    return c.json({
      team: data.team,
      players: data.players,
      recentResults: data.recentResults,
      upcomingFixtures: data.upcomingFixtures,
      leagueStanding: data.leagueStanding,
      seasonStats: data.seasonStats,
      cached: result.fromCache,
      errors: data.errors,
      source: 'sportsradar'
    });
    
  } catch (err) {
    console.error('[Soccer API] Team profile error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Get team's full season schedule (all results + upcoming)
 * GET /api/soccer/team/:teamId/schedule
 */
soccer.get('/team/:teamId/schedule', async (c) => {
  const teamId = c.req.param('teamId');
  
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    // Use caching - 10 minute TTL for schedule data
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `soccer/team/${teamId}/schedule`,
      600, // 10 minutes
      async () => {
        const provider = getSportsRadarProvider(apiKey, null);
        return provider.fetchSoccerTeamSeasonSchedule(teamId, apiKey);
      }
    );
    
    const data = result.data;
    
    if (data.errors.length > 0 && data.results.length === 0 && data.upcoming.length === 0) {
      return c.json({ 
        results: [],
        upcoming: [],
        error: data.errors[0],
        cached: result.fromCache
      });
    }
    
    return c.json({
      results: data.results,
      upcoming: data.upcoming,
      cached: result.fromCache,
      errors: data.errors
    });
    
  } catch (err) {
    console.error('[Soccer API] Team schedule error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Debug: Test fetchSoccerSchedule function
 * GET /api/soccer/debug-schedule
 */
soccer.get('/debug-schedule', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SPORTSRADAR_API_KEY not configured' }, 500);
  }
  
  const provider = getSportsRadarProvider(apiKey, null);
  const result = await provider.fetchSoccerSchedule('premier-league', apiKey);
  
  return c.json({
    competitionKey: 'premier-league',
    result: {
      hasCompetition: !!result.competition,
      hasSeason: !!result.season,
      matchCount: result.matches?.length || 0,
      errors: result.errors,
      sampleMatches: result.matches?.slice(0, 3).map(m => ({
        eventId: m.eventId,
        home: m.homeTeamName,
        away: m.awayTeamName,
        startTime: m.startTime,
        status: m.status
      }))
    }
  });
});

/**
 * Debug: Test schedule URL directly
 * GET /api/soccer/test-schedule-url
 */
soccer.get('/test-schedule-url', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SPORTSRADAR_API_KEY not configured' }, 500);
  }
  
  // First get season ID for Premier League
  const competitionId = 'sr:competition:17';
  const seasonsUrl = `https://api.sportradar.com/soccer/production/v4/en/competitions/${competitionId}/seasons.json?api_key=${apiKey}`;
  
  try {
    const seasonsResp = await fetch(seasonsUrl);
    if (!seasonsResp.ok) {
      return c.json({ error: `Seasons API failed: ${seasonsResp.status}` }, 500);
    }
    
    const seasonsData = await seasonsResp.json() as any;
    const currentSeason = seasonsData.seasons?.find((s: any) => s.current === true) || seasonsData.seasons?.[0];
    
    if (!currentSeason) {
      return c.json({ error: 'No season found', seasons: seasonsData.seasons?.slice(0, 3) }, 400);
    }
    
    // Try different schedule endpoint patterns
    const testUrls = [
      `https://api.sportradar.com/soccer/production/v4/en/seasons/${currentSeason.id}/schedules.json?api_key=${apiKey}`,
      `https://api.sportradar.com/soccer/production/v4/en/seasons/${currentSeason.id}/schedule.json?api_key=${apiKey}`,
      `https://api.sportradar.com/soccer/production/v4/en/seasons/${currentSeason.id}/summaries.json?api_key=${apiKey}`,
    ];
    
    const results: any[] = [];
    
    for (const url of testUrls) {
      const maskedUrl = url.replace(apiKey, 'KEY');
      const resp = await fetch(url);
      let preview = null;
      
      if (resp.ok) {
        const data = await resp.json() as any;
        preview = JSON.stringify(data).substring(0, 300);
      }
      
      results.push({
        url: maskedUrl,
        status: resp.status,
        ok: resp.ok,
        preview
      });
    }
    
    return c.json({
      seasonId: currentSeason.id,
      seasonName: currentSeason.name,
      results
    });
    
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Test SportsRadar Soccer standings URL (debug endpoint)
 * GET /api/soccer/test-standings-url
 */
soccer.get('/test-standings-url', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SPORTSRADAR_API_KEY not configured' }, 500);
  }
  
  const results: any[] = [];
  
  // Competition ID for Premier League
  const competitionId = 'sr:competition:17';
  const encodedId = encodeURIComponent(competitionId);
  
  // Try different URL patterns
  const testUrls = [
    // Current pattern (raw competition ID)
    `https://api.sportradar.com/soccer/production/v4/en/competitions/${competitionId}/standings.json?api_key=${apiKey}`,
    // URL-encoded competition ID
    `https://api.sportradar.com/soccer/production/v4/en/competitions/${encodedId}/standings.json?api_key=${apiKey}`,
    // Without sr:competition prefix (just number)
    `https://api.sportradar.com/soccer/production/v4/en/competitions/17/standings.json?api_key=${apiKey}`,
    // Season-based endpoints
    `https://api.sportradar.com/soccer/production/v4/en/competitions/${competitionId}/seasons.json?api_key=${apiKey}`,
    // Try season standings with discovered season ID
    `https://api.sportradar.com/soccer/production/v4/en/seasons/sr:season:118689/standings.json?api_key=${apiKey}`,
  ];
  
  for (const url of testUrls) {
    try {
      const maskedUrl = url.replace(apiKey, 'KEY');
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      
      let preview = null;
      if (response.ok) {
        const data = await response.json() as any;
        preview = JSON.stringify(data).substring(0, 500);
      } else {
        try {
          const errorText = await response.text();
          preview = errorText.substring(0, 300);
        } catch { }
      }
      
      results.push({
        url: maskedUrl,
        status: response.status,
        success: response.ok,
        preview
      });
    } catch (err) {
      results.push({
        url: url.replace(apiKey, 'KEY'),
        error: String(err)
      });
    }
  }
  
  return c.json({ results });
});

/**
 * Debug: Raw leaders API response to check structure
 * GET /api/soccer/test-leaders-raw
 */
soccer.get('/test-leaders-raw', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'SPORTSRADAR_API_KEY not configured' }, 500);
  }
  
  try {
    // Get current season first
    const competitionId = 'sr:competition:17'; // Premier League
    const seasonsUrl = `https://api.sportradar.com/soccer/production/v4/en/competitions/${competitionId}/seasons.json?api_key=${apiKey}`;
    
    const seasonsResp = await fetch(seasonsUrl);
    if (!seasonsResp.ok) {
      return c.json({ error: `Seasons API: ${seasonsResp.status}` }, 500);
    }
    
    const seasonsData = await seasonsResp.json() as any;
    const currentSeason = seasonsData.seasons?.find((s: any) => s.current === true) 
      || seasonsData.seasons?.[0];
    
    if (!currentSeason) {
      return c.json({ error: 'No current season found' }, 400);
    }
    
    // Fetch leaders
    const leadersUrl = `https://api.sportradar.com/soccer/production/v4/en/seasons/${currentSeason.id}/leaders.json?api_key=${apiKey}`;
    const leadersResp = await fetch(leadersUrl);
    
    if (!leadersResp.ok) {
      return c.json({ 
        error: `Leaders API: ${leadersResp.status}`,
        seasonUsed: currentSeason.id 
      }, 500);
    }
    
    const data = await leadersResp.json() as any;
    
    // Return raw structure for debugging
    return c.json({
      seasonId: currentSeason.id,
      seasonName: currentSeason.name,
      rawKeys: Object.keys(data),
      listsCount: data.lists?.length || 0,
      listsSample: data.lists?.slice(0, 2).map((list: any) => ({
        type: list.type,
        name: list.name,
        keys: Object.keys(list),
        leadersCount: list.leaders?.length,
        playersCount: list.players?.length,
        competitorsCount: list.competitors?.length,
        firstItem: list.leaders?.[0] || list.players?.[0] || list.competitors?.[0]
      }))
    });
    
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * Test SportsRadar Soccer API connectivity (raw URL test)
 * GET /api/soccer/test-raw
 */
soccer.get('/test-raw', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ 
      success: false, 
      error: 'SPORTSRADAR_API_KEY not configured' 
    }, 500);
  }
  
  const results: any[] = [];
  
  // Test URLs to try
  const testUrls = [
    `https://api.sportradar.com/soccer/production/v4/en/competitions.json?api_key=${apiKey}`,
    `https://api.sportradar.com/soccer/trial/v4/en/competitions.json?api_key=${apiKey}`,
  ];
  
  for (const url of testUrls) {
    try {
      const maskedUrl = url.replace(apiKey, 'API_KEY_HIDDEN');
      console.log(`[Soccer Test] Trying: ${maskedUrl}`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      const status = response.status;
      let data = null;
      let competitionCount = 0;
      
      if (response.ok) {
        data = await response.json() as any;
        competitionCount = data.competitions?.length || 0;
      }
      
      results.push({
        url: maskedUrl,
        status,
        success: response.ok,
        competitionCount,
        sampleCompetitions: response.ok && data?.competitions ? 
          data.competitions.slice(0, 3).map((c: any) => c.name) : null
      });
      
      // If one works, break
      if (response.ok) break;
      
    } catch (err) {
      results.push({
        url: url.replace(apiKey, 'API_KEY_HIDDEN'),
        error: String(err)
      });
    }
  }
  
  return c.json({
    apiKeyPresent: true,
    apiKeyLength: apiKey.length,
    tests: results
  });
});

/**
 * Test SportsRadar Soccer API connectivity
 * GET /api/soccer/test
 */
soccer.get('/test', async (c) => {
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  if (!apiKey) {
    return c.json({ 
      success: false, 
      error: 'SPORTSRADAR_API_KEY not configured' 
    }, 500);
  }
  
  try {
    // Test with Premier League standings
    const provider = getSportsRadarProvider(apiKey, null);
    const result = await provider.fetchSoccerStandings('premier-league', apiKey);
    
    return c.json({
      success: result.standings.length > 0,
      competition: result.competition,
      teamsFound: result.standings.length,
      topTeams: result.standings.slice(0, 5).map(t => ({
        rank: t.rank,
        team: t.teamName,
        played: t.played,
        points: t.points,
        gd: t.goalDifference
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

export default soccer;
