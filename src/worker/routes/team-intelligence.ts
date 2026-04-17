// @ts-nocheck
/**
 * Team Intelligence API Routes
 * Provides Coach G team analysis for soccer teams
 */

import { Hono } from 'hono';
import { generateTeamIntelligence, clearTeamIntelligenceCache } from '../services/coachGTeamIntelligence';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/team-intelligence/:teamId
 * Get team intelligence analysis
 */
app.get('/:teamId', async (c) => {
  const { teamId } = c.req.param();
  const env = c.env;
  
  if (!teamId) {
    return c.json({ success: false, error: 'Team ID required' }, 400);
  }
  
  try {
    // Fetch team data from soccer API to build context
    const teamResponse = await fetch(`${new URL(c.req.url).origin}/api/soccer/team/${teamId}`);
    if (!teamResponse.ok) {
      return c.json({ success: false, error: 'Failed to fetch team data' }, 500);
    }
    
    const teamData = await teamResponse.json() as Record<string, any>;
    
    // Build context from team data
    const lastMatch = teamData.recentResults?.[0];
    const nextMatch = teamData.upcomingFixtures?.[0];
    
    const intelligenceData = {
      teamId,
      teamName: teamData.team?.name || 'Unknown Team',
      lastMatch: lastMatch ? {
        opponent: lastMatch.isHome ? lastMatch.awayTeam.name : lastMatch.homeTeam.name,
        result: lastMatch.result || 'Unknown',
        score: `${lastMatch.homeScore}-${lastMatch.awayScore}`,
        date: lastMatch.date
      } : undefined,
      nextMatch: nextMatch ? {
        opponent: nextMatch.isHome ? nextMatch.awayTeam.name : nextMatch.homeTeam.name,
        date: nextMatch.date,
        competition: nextMatch.competition
      } : undefined,
      recentForm: teamData.recentResults?.slice(0, 5).map((r: any) => r.result).filter(Boolean),
      standings: teamData.leagueStanding ? {
        position: teamData.leagueStanding.position,
        points: teamData.leagueStanding.points,
        league: teamData.leagueStanding.leagueName
      } : undefined
    };
    
    // Generate intelligence
    const analysis = await generateTeamIntelligence(env, intelligenceData);
    
    return c.json({
      success: true,
      intelligence: analysis
    });
  } catch (error) {
    console.error('Error generating team intelligence:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate team intelligence'
    }, 500);
  }
});

/**
 * POST /api/team-intelligence/:teamId/refresh
 * Force refresh team intelligence cache
 */
app.post('/:teamId/refresh', async (c) => {
  const { teamId } = c.req.param();
  
  if (!teamId) {
    return c.json({ success: false, error: 'Team ID required' }, 400);
  }
  
  clearTeamIntelligenceCache(teamId);
  
  return c.json({
    success: true,
    message: 'Cache cleared for team'
  });
});

export default app;
