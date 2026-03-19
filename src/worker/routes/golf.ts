/**
 * Golf API Routes - SportsRadar Integration
 * 
 * Provides tournament schedule, leaderboards, and results
 */

import { Hono } from "hono";

const golfRouter = new Hono<{ Bindings: Env }>();

const GOLF_API_BASE = 'https://api.sportradar.com/golf';
const ACCESS_LEVEL = 'production';
const LANGUAGE = 'en';

// Helper to get API key
function getGolfKey(env: Env): string | null {
  return env.SPORTSRADAR_API_KEY || null;
}

// Helper for API calls with rate limit handling
async function fetchGolfApi(
  url: string,
  apiKey: string
): Promise<{ data: any; error: string | null; status?: number }> {
  try {
    const response = await fetch(`${url}?api_key=${apiKey}`);
    
    if (response.status === 429) {
      return { data: null, error: 'Rate limited - try again later', status: 429 };
    }
    
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}`, status: response.status };
    }
    
    const data = await response.json();
    return { data, error: null, status: response.status };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

/**
 * GET /api/golf/schedule
 * Returns full season schedule with current, upcoming, and completed tournaments
 */
golfRouter.get('/schedule', async (c) => {
  const apiKey = getGolfKey(c.env);
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const year = new Date().getFullYear();
  const url = `${GOLF_API_BASE}/${ACCESS_LEVEL}/pga/v3/${LANGUAGE}/${year}/tournaments/schedule.json`;
  
  const { data, error } = await fetchGolfApi(url, apiKey);
  
  if (error) {
    return c.json({ error }, error.includes('Rate limited') ? 429 : 500);
  }
  
  const now = new Date();
  const tournaments = (data.tournaments || []).map((t: any) => {
    const startDate = new Date(t.start_date + 'T12:00:00Z');
    const endDate = t.end_date 
      ? new Date(t.end_date + 'T23:59:59Z') 
      : new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000);
    
    // Determine status based on dates AND API status
    let status = 'upcoming';
    if (t.status === 'closed' || endDate < now) {
      // Tournament is completed if API says closed OR end date is in the past
      status = 'completed';
    } else if (t.status === 'inprogress' || (startDate <= now && endDate >= now)) {
      status = 'in_progress';
    }
    
    return {
      id: t.id,
      name: t.name,
      startDate: t.start_date,
      endDate: t.end_date,
      course: t.venue?.name || t.courses?.[0]?.name || '',
      location: t.venue?.city ? `${t.venue.city}, ${t.venue.state || t.venue.country || ''}` : '',
      purse: t.purse || 0,
      currency: t.currency || 'USD',
      winningShare: t.winning_share || 0,
      defendingChamp: t.defending_champ?.first_name && t.defending_champ?.last_name 
        ? `${t.defending_champ.first_name} ${t.defending_champ.last_name}` 
        : null,
      // For completed tournaments, use defending_champ as the winner (they won last year)
      // The "defending champ" for 2026 is the 2025 winner
      winner: status === 'completed' && t.defending_champ?.first_name && t.defending_champ?.last_name
        ? `${t.defending_champ.first_name} ${t.defending_champ.last_name}`
        : null,
      winningScore: status === 'completed' ? (t.winning_share ? null : null) : null, // Would need separate API call for actual score
      status,
      pointsLabel: t.points_label || 'FedEx Cup',
    };
  });
  
  // Separate into categories
  const current = tournaments.find((t: any) => t.status === 'in_progress');
  const upcoming = tournaments.filter((t: any) => t.status === 'upcoming').slice(0, 8);
  const completed = tournaments.filter((t: any) => t.status === 'completed').reverse().slice(0, 5);
  
  return c.json({
    season: year,
    current,
    upcoming,
    completed,
    totalTournaments: tournaments.length,
  });
});

/**
 * GET /api/golf/current
 * Returns the current or next upcoming tournament with basic info
 */
golfRouter.get('/current', async (c) => {
  const apiKey = getGolfKey(c.env);
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const year = new Date().getFullYear();
  const url = `${GOLF_API_BASE}/${ACCESS_LEVEL}/pga/v3/${LANGUAGE}/${year}/tournaments/schedule.json`;
  
  const { data, error } = await fetchGolfApi(url, apiKey);
  
  if (error) {
    return c.json({ error }, error.includes('Rate limited') ? 429 : 500);
  }
  
  const now = new Date();
  const tournaments = data.tournaments || [];
  
  // Find current in-progress tournament
  let current = tournaments.find((t: any) => t.status === 'inprogress');
  
  // If no in-progress, find next upcoming
  if (!current) {
    current = tournaments
      .filter((t: any) => new Date(t.start_date) > now && t.status !== 'closed')
      .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())[0];
  }
  
  if (!current) {
    return c.json({ error: 'No current or upcoming tournament found' }, 404);
  }
  
  return c.json({
    id: current.id,
    name: current.name,
    startDate: current.start_date,
    endDate: current.end_date,
    course: current.venue?.name || current.courses?.[0]?.name || '',
    location: current.venue?.city ? `${current.venue.city}, ${current.venue.state || current.venue.country || ''}` : '',
    purse: current.purse || 0,
    currency: current.currency || 'USD',
    defendingChamp: current.defending_champ?.first_name && current.defending_champ?.last_name 
      ? `${current.defending_champ.first_name} ${current.defending_champ.last_name}` 
      : null,
    status: current.status === 'inprogress' ? 'in_progress' : 'scheduled',
    isLive: current.status === 'inprogress',
    currentRound: current.current_round || null,
  });
});

/**
 * GET /api/golf/leaderboard/:tournamentId
 * Returns leaderboard for a specific tournament
 */
golfRouter.get('/leaderboard/:tournamentId', async (c) => {
  const apiKey = getGolfKey(c.env);
  const tournamentId = c.req.param('tournamentId');
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  // Remove prefix if present
  const rawId = tournamentId.replace('sr_golf_', '');
  const year = new Date().getFullYear();
  
  const url = `${GOLF_API_BASE}/${ACCESS_LEVEL}/pga/v3/${LANGUAGE}/${year}/tournaments/${rawId}/leaderboard.json`;
  
  const { data, error } = await fetchGolfApi(url, apiKey);
  
  if (error) {
    return c.json({ error }, error.includes('Rate limited') ? 429 : 500);
  }
  
  // Normalize tournament info
  const tournament = {
    id: data.id,
    name: data.name,
    status: data.status === 'inprogress' ? 'in_progress' : data.status === 'closed' ? 'final' : 'scheduled',
    startDate: data.start_date,
    endDate: data.end_date,
    course: data.venue?.name || data.courses?.[0]?.name || '',
    location: data.venue?.city ? `${data.venue.city}, ${data.venue.state || data.venue.country || ''}` : '',
    purse: data.purse || 0,
    currentRound: data.current_round || null,
    par: data.courses?.[0]?.par || 72,
  };
  
  // Normalize leaderboard
  const leaderboard = (data.leaderboard || []).map((player: any, idx: number) => {
    const rounds = (player.rounds || []).map((r: any) => ({
      round: r.number || r.sequence,
      score: r.score ?? null,
      strokes: r.strokes ?? null,
      thru: r.thru ?? 18,
    }));
    
    return {
      position: player.position ?? idx + 1,
      tied: player.tied || false,
      name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown',
      country: player.country || '',
      score: player.score ?? 0,
      strokes: player.strokes ?? 0,
      thru: player.thru !== undefined ? player.thru : null,
      today: player.current_round?.score ?? null,
      rounds,
      status: player.status || 'active', // active, CUT, WD, DQ
      money: player.money ?? null,
      points: player.points ?? null,
    };
  });
  
  return c.json({
    tournament,
    leaderboard,
    totalPlayers: leaderboard.length,
  });
});

/**
 * GET /api/golf/results/:tournamentId
 * Returns final results for a completed tournament
 */
golfRouter.get('/results/:tournamentId', async (c) => {
  const apiKey = getGolfKey(c.env);
  const tournamentId = c.req.param('tournamentId');
  
  if (!apiKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  // Remove prefix if present
  const rawId = tournamentId.replace('sr_golf_', '');
  const year = new Date().getFullYear();
  
  // Try summary endpoint for completed tournaments
  const url = `${GOLF_API_BASE}/${ACCESS_LEVEL}/pga/v3/${LANGUAGE}/${year}/tournaments/${rawId}/summary.json`;
  
  const { data, error } = await fetchGolfApi(url, apiKey);
  
  if (error) {
    return c.json({ error }, error.includes('Rate limited') ? 429 : 500);
  }
  
  // Find winner (position 1)
  const leaderboard = data.leaderboard || [];
  const winner = leaderboard.find((p: any) => p.position === 1);
  
  return c.json({
    tournament: {
      id: data.id,
      name: data.name,
      startDate: data.start_date,
      endDate: data.end_date,
      course: data.venue?.name || data.courses?.[0]?.name || '',
      purse: data.purse || 0,
    },
    winner: winner ? {
      name: `${winner.first_name || ''} ${winner.last_name || ''}`.trim(),
      score: winner.score ?? 0,
      strokes: winner.strokes ?? 0,
      money: winner.money ?? 0,
      country: winner.country || '',
    } : null,
    topFinishers: leaderboard.slice(0, 10).map((p: any) => ({
      position: p.position,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      score: p.score ?? 0,
      money: p.money ?? 0,
    })),
  });
});

export default golfRouter;
