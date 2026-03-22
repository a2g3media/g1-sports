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

type Bindings = {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
};

const teams = new Hono<{ Bindings: Bindings }>();

// Valid sports for team data
const VALID_SPORTS = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB', 'NCAAF'];

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
    
    return c.json({
      sport,
      season: season || new Date().getFullYear(),
      conferences: result.conferences,
      divisions: result.divisions,
      teams: result.teams,
      errors: result.errors,
      cached: true
    });
    
  } catch (err) {
    console.error('[Teams API] Standings error:', err);
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
    const provider = getSportsRadarProvider(apiKey, null);
    const result = await provider.fetchTeamSchedule(
      sport as SportKey, 
      teamId, 
      apiKey,
      season ? parseInt(season, 10) : undefined
    );
    
    if (result.errors.length > 0 && result.games.length === 0) {
      return c.json({ error: result.errors[0] }, 500);
    }
    
    // Separate past and upcoming games
    const now = new Date();
    const pastGames = result.games
      .filter(g => g.scheduledTime && new Date(g.scheduledTime) < now)
      .sort((a, b) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime())
      .slice(0, 10);
    
    const upcomingGames = result.games
      .filter(g => g.scheduledTime && new Date(g.scheduledTime) >= now)
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
      .slice(0, 10);
    
    return c.json({
      teamId,
      pastGames,
      upcomingGames,
      totalGames: result.games.length,
      errors: result.errors
    });
    
  } catch (err) {
    console.error('[Teams API] Schedule error:', err);
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
    const provider = getSportsRadarProvider(apiKey, null);
    const result = await provider.fetchTeamStats(
      sport as SportKey,
      teamId,
      apiKey,
      season ? parseInt(season, 10) : undefined
    );
    
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
    
    return c.json({
      team: result.team,
      roster: result.roster,
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
