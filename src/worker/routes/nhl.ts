/**
 * NHL API Routes - SportsRadar Integration
 * 
 * Provides standings, league leaders, and goalie leaders
 */
import { Hono } from "hono";
import { cachedFetch, API_CACHE_TTL } from "../services/apiCacheService";

const nhlRoutes = new Hono<{ Bindings: Env }>();

// SportsRadar NHL API Base
const NHL_API_BASE = 'https://api.sportradar.com/nhl/production/v7/en';

// Cache for season ID
let cachedSeasonId: { id: string; fetchedAt: number } | null = null;
const SEASON_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Helper: Get API Key
 */
function getApiKey(env: Env): string | null {
  return env.SPORTSRADAR_API_KEY || null;
}

/**
 * Helper: Fetch with rate limit handling
 */
async function fetchNHLApi(url: string, apiKey: string): Promise<{ data: any; error: string | null }> {
  try {
    const response = await fetch(`${url}?api_key=${apiKey}`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.status === 429) {
      return { data: null, error: 'Rate limited - try again later' };
    }
    
    if (response.status === 404) {
      return { data: null, error: 'Data not found' };
    }
    
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

/**
 * Helper: Get current NHL season ID
 * SportsRadar uses format like "sr:season:106835" for 2024-25
 */
async function getCurrentSeasonId(apiKey: string): Promise<string | null> {
  // Check cache
  if (cachedSeasonId && (Date.now() - cachedSeasonId.fetchedAt < SEASON_CACHE_TTL)) {
    return cachedSeasonId.id;
  }
  
  try {
    // Fetch all seasons
    const { data, error } = await fetchNHLApi(`${NHL_API_BASE}/league/seasons.json`, apiKey);
    
    if (error || !data?.seasons) {
      console.error('[NHL] Failed to fetch seasons:', error);
      // Use NHL v7 schedule year format as fallback - SportsRadar NHL uses 4-digit year
      const year = new Date().getFullYear();
      const month = new Date().getMonth();
      // NHL season starts in October (month 9), so if before October, use previous year
      const seasonYear = month < 9 ? year - 1 : year;
      const fallbackId = `${seasonYear}`;
      cachedSeasonId = { id: fallbackId, fetchedAt: Date.now() };
      console.log('[NHL] Using fallback season:', fallbackId);
      return fallbackId;
    }
    
    // Find the current regular season
    const now = new Date();
    const seasons = data.seasons || [];
    
    // Sort by year descending
    const sortedSeasons = seasons
      .filter((s: any) => s.type === 'REG') // Regular season only
      .sort((a: any, b: any) => (b.year || 0) - (a.year || 0));
    
    // Find season that's currently active or most recent
    for (const season of sortedSeasons) {
      const startDate = season.start_date ? new Date(season.start_date) : null;
      const endDate = season.end_date ? new Date(season.end_date) : null;
      
      // If we're within this season's dates
      if (startDate && endDate && now >= startDate && now <= endDate) {
        cachedSeasonId = { id: season.id, fetchedAt: Date.now() };
        console.log('[NHL] Found current season:', season.id, season.year);
        return season.id;
      }
    }
    
    // If no current season, use the most recent one
    if (sortedSeasons.length > 0) {
      const mostRecent = sortedSeasons[0];
      cachedSeasonId = { id: mostRecent.id, fetchedAt: Date.now() };
      console.log('[NHL] Using most recent season:', mostRecent.id, mostRecent.year);
      return mostRecent.id;
    }
    
    // Final fallback
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const seasonYear = month < 9 ? year - 1 : year;
    const fallbackId = `${seasonYear}`;
    cachedSeasonId = { id: fallbackId, fetchedAt: Date.now() };
    console.log('[NHL] Final fallback season:', fallbackId);
    return fallbackId;
  } catch (err) {
    console.error('[NHL] Season fetch error:', err);
    // Fallback on exception
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const seasonYear = month < 9 ? year - 1 : year;
    return `${seasonYear}`;
  }
}

/**
 * GET /api/nhl/standings
 * Fetch NHL standings by conference and division
 */
nhlRoutes.get('/standings', async (c) => {
  const apiKey = getApiKey(c.env);
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const seasonId = await getCurrentSeasonId(apiKey);
  if (!seasonId) {
    return c.json({ error: 'Could not determine current season' }, 500);
  }
  
  try {
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `nhl/standings/${seasonId}`,
      API_CACHE_TTL.SR_STANDINGS,
      async () => {
        const { data, error } = await fetchNHLApi(
          `${NHL_API_BASE}/seasons/${seasonId}/REG/standings.json`,
          apiKey
        );
        
        if (error) throw new Error(error);
        return data;
      }
    );
    
    const data = result.data;
    
    if (!data?.conferences) {
      return c.json({ error: 'Invalid standings data' }, 500);
    }
    
    // Parse standings into clean format
    const standings: any[] = [];
    
    for (const conference of data.conferences || []) {
      for (const division of conference.divisions || []) {
        for (const team of division.teams || []) {
          standings.push({
            team: team.alias || team.abbr || '',
            teamName: team.name || '',
            teamId: team.id,
            conference: conference.alias || conference.name || '',
            division: division.alias || division.name || '',
            wins: team.wins || 0,
            losses: team.losses || 0,
            otl: team.ot_losses || team.overtime?.losses || 0,
            points: team.points || 0,
            gf: team.scoring?.goals || team.goals_for || 0,
            ga: team.scoring?.goals_against || team.goals_against || 0,
            streak: team.streak?.kind ? `${team.streak.kind}${team.streak.length}` : '-',
            gamesPlayed: team.games_played || 0,
            regulationWins: team.regulation_wins || 0,
            goalDiff: (team.scoring?.goals || team.goals_for || 0) - (team.scoring?.goals_against || team.goals_against || 0),
          });
        }
      }
    }
    
    // Sort by points, then regulation wins, then goal differential
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.regulationWins !== a.regulationWins) return b.regulationWins - a.regulationWins;
      return b.goalDiff - a.goalDiff;
    });
    
    return c.json({ 
      standings,
      seasonId,
      cached: result.fromCache,
      fetchedAt: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('[NHL] Standings error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * GET /api/nhl/leaders/skaters
 * Fetch NHL skater leaders (goals, assists, points, plus_minus, powerplay_goals)
 */
nhlRoutes.get('/leaders/skaters', async (c) => {
  const apiKey = getApiKey(c.env);
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const seasonId = await getCurrentSeasonId(apiKey);
  if (!seasonId) {
    return c.json({ error: 'Could not determine current season' }, 500);
  }
  
  try {
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `nhl/leaders/skaters/${seasonId}`,
      API_CACHE_TTL.SR_STANDINGS, // 30 min cache
      async () => {
        const { data, error } = await fetchNHLApi(
          `${NHL_API_BASE}/seasons/${seasonId}/REG/leaders/offense.json`,
          apiKey
        );
        
        if (error) throw new Error(error);
        return data;
      }
    );
    
    const data = result.data;
    
    // Parse leader categories
    const parseLeaders = (players: any[], valueKey: string) => {
      return (players || []).slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.full_name || `${p.first_name} ${p.last_name}`,
        team: p.team?.alias || p.team?.abbr || '',
        teamId: p.team?.id,
        value: p[valueKey] || p.total?.[valueKey] || 0,
        gamesPlayed: p.games_played || p.total?.games_played || 0,
      }));
    };
    
    const leaders = {
      goals: parseLeaders(data?.categories?.find((c: any) => c.name === 'goals')?.leaders || [], 'value'),
      assists: parseLeaders(data?.categories?.find((c: any) => c.name === 'assists')?.leaders || [], 'value'),
      points: parseLeaders(data?.categories?.find((c: any) => c.name === 'points')?.leaders || [], 'value'),
      plusMinus: parseLeaders(data?.categories?.find((c: any) => c.name === 'plus_minus')?.leaders || [], 'value'),
      ppGoals: parseLeaders(data?.categories?.find((c: any) => c.name === 'powerplay_goals')?.leaders || [], 'value'),
    };
    
    return c.json({ 
      leaders,
      seasonId,
      cached: result.fromCache,
      fetchedAt: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('[NHL] Skater leaders error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * GET /api/nhl/leaders/goalies
 * Fetch NHL goalie leaders (save_percentage, gaa, wins, shutouts)
 */
nhlRoutes.get('/leaders/goalies', async (c) => {
  const apiKey = getApiKey(c.env);
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const seasonId = await getCurrentSeasonId(apiKey);
  if (!seasonId) {
    return c.json({ error: 'Could not determine current season' }, 500);
  }
  
  try {
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `nhl/leaders/goalies/${seasonId}`,
      API_CACHE_TTL.SR_STANDINGS, // 30 min cache
      async () => {
        const { data, error } = await fetchNHLApi(
          `${NHL_API_BASE}/seasons/${seasonId}/REG/leaders/goaltending.json`,
          apiKey
        );
        
        if (error) throw new Error(error);
        return data;
      }
    );
    
    const data = result.data;
    
    // Parse goalie leader categories
    const parseLeaders = (players: any[], valueKey: string) => {
      return (players || []).slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.full_name || `${p.first_name} ${p.last_name}`,
        team: p.team?.alias || p.team?.abbr || '',
        teamId: p.team?.id,
        value: p[valueKey] || p.total?.[valueKey] || 0,
        gamesPlayed: p.games_played || p.total?.games_played || 0,
      }));
    };
    
    const leaders = {
      savePct: parseLeaders(data?.categories?.find((c: any) => c.name === 'save_pct')?.leaders || [], 'value'),
      gaa: parseLeaders(data?.categories?.find((c: any) => c.name === 'avg_goals_against')?.leaders || [], 'value'),
      wins: parseLeaders(data?.categories?.find((c: any) => c.name === 'wins')?.leaders || [], 'value'),
      shutouts: parseLeaders(data?.categories?.find((c: any) => c.name === 'shutouts')?.leaders || [], 'value'),
    };
    
    return c.json({ 
      leaders,
      seasonId,
      cached: result.fromCache,
      fetchedAt: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('[NHL] Goalie leaders error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * GET /api/nhl/player/:playerId
 * Fetch NHL player profile
 */
nhlRoutes.get('/player/:playerId', async (c) => {
  const apiKey = getApiKey(c.env);
  const playerId = c.req.param('playerId');
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  try {
    const result = await cachedFetch(
      c.env.DB,
      'sportsradar',
      `nhl/player/${playerId}`,
      API_CACHE_TTL.SR_TEAM_PROFILE, // 2 hour cache
      async () => {
        const { data, error } = await fetchNHLApi(
          `${NHL_API_BASE}/players/${playerId}/profile.json`,
          apiKey
        );
        
        if (error) throw new Error(error);
        return data;
      }
    );
    
    const data = result.data;
    
    if (!data?.player) {
      return c.json({ error: 'Player not found' }, 404);
    }
    
    const player = data.player;
    
    return c.json({
      id: player.id,
      name: player.full_name || `${player.first_name} ${player.last_name}`,
      firstName: player.first_name,
      lastName: player.last_name,
      team: player.team?.alias || '',
      teamName: player.team?.name || '',
      teamId: player.team?.id,
      position: player.position,
      jerseyNumber: player.jersey_number,
      birthDate: player.birth_date,
      birthPlace: player.birthplace,
      height: player.height,
      weight: player.weight,
      shoots: player.handedness,
      draft: player.draft,
      seasons: player.seasons || [],
      cached: result.fromCache
    });
    
  } catch (err) {
    console.error('[NHL] Player profile error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

export default nhlRoutes;
