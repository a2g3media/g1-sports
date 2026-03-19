/**
 * Coach G Team Intelligence Service
 * Generates AI-powered team analysis for soccer teams
 */

import OpenAI from 'openai';

interface TeamIntelligenceData {
  teamId: string;
  teamName: string;
  lastMatch?: {
    opponent: string;
    result: string;
    score: string;
    date: string;
  };
  nextMatch?: {
    opponent: string;
    date: string;
    competition: string;
  };
  recentForm?: string[];
  standings?: {
    position: number;
    points: number;
    league: string;
  };
}

interface TeamIntelligenceAnalysis {
  teamId: string;
  lastMatchAnalysis: {
    summary: string;
    whatWentRight: string[];
    whatWentWrong: string[];
  };
  nextMatchPreview: {
    summary: string;
    keyPoints: string[];
  };
  injuries: {
    available: boolean;
    injuries: Array<{ player: string; status: string; expectedReturn?: string }>;
  };
  newsSentiment: {
    headlines: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  generatedAt: string;
}

// In-memory cache for team intelligence
const intelligenceCache = new Map<string, { analysis: TeamIntelligenceAnalysis; timestamp: number }>();
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Generate team intelligence analysis using AI
 */
export async function generateTeamIntelligence(
  env: { OPENAI_API_KEY: string },
  teamData: TeamIntelligenceData
): Promise<TeamIntelligenceAnalysis> {
  const cacheKey = `team_intelligence_${teamData.teamId}`;
  
  // Check cache first
  const cached = intelligenceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.analysis;
  }
  
  // Build context from team data
  const context = buildTeamContext(teamData);
  
  // Generate analysis using OpenAI directly
  const prompt = `You are Coach G, an expert soccer analyst. Analyze this team's current situation and provide insights.

Team: ${teamData.teamName}

${context}

Provide a comprehensive analysis covering:
1. Last match summary (what went right, what went wrong)
2. Next match preview (key tactical points, what to watch)
3. Current injury situation
4. Recent news sentiment

Format your response as JSON with this exact structure:
{
  "lastMatchAnalysis": {
    "summary": "Brief match summary",
    "whatWentRight": ["point 1", "point 2", "point 3"],
    "whatWentWrong": ["point 1", "point 2"]
  },
  "nextMatchPreview": {
    "summary": "Brief preview of upcoming match",
    "keyPoints": ["tactical point 1", "tactical point 2", "tactical point 3"]
  },
  "injuries": {
    "available": true/false,
    "injuries": [{"player": "Name", "status": "Out/Doubt", "expectedReturn": "date or timeframe"}]
  },
  "newsSentiment": {
    "headlines": ["headline 1", "headline 2", "headline 3"],
    "sentiment": "positive/neutral/negative"
  }
}`;

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    const response = { reply: completion.choices[0]?.message?.content || '' };
    
    // Parse AI response
    const analysis = parseAIResponse(response.reply, teamData.teamId);
    
    // Cache the result
    intelligenceCache.set(cacheKey, {
      analysis,
      timestamp: Date.now()
    });
    
    return analysis;
  } catch (error) {
    console.error('Failed to generate team intelligence:', error);
    // Return fallback analysis
    return getFallbackAnalysis(teamData);
  }
}

/**
 * Build context string from team data
 */
function buildTeamContext(teamData: TeamIntelligenceData): string {
  const parts: string[] = [];
  
  if (teamData.lastMatch) {
    parts.push(`Last Match: ${teamData.lastMatch.result} vs ${teamData.lastMatch.opponent} (${teamData.lastMatch.score}) on ${teamData.lastMatch.date}`);
  }
  
  if (teamData.nextMatch) {
    parts.push(`Next Match: vs ${teamData.nextMatch.opponent} in ${teamData.nextMatch.competition} on ${teamData.nextMatch.date}`);
  }
  
  if (teamData.recentForm && teamData.recentForm.length > 0) {
    parts.push(`Recent Form: ${teamData.recentForm.join(', ')}`);
  }
  
  if (teamData.standings) {
    parts.push(`League Position: ${teamData.standings.position} in ${teamData.standings.league} with ${teamData.standings.points} points`);
  }
  
  return parts.join('\n');
}

/**
 * Parse AI response into structured analysis
 */
function parseAIResponse(aiReply: string, teamId: string): TeamIntelligenceAnalysis {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiReply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        teamId,
        lastMatchAnalysis: parsed.lastMatchAnalysis || {
          summary: "Analysis unavailable",
          whatWentRight: [],
          whatWentWrong: []
        },
        nextMatchPreview: parsed.nextMatchPreview || {
          summary: "Preview unavailable",
          keyPoints: []
        },
        injuries: parsed.injuries || {
          available: false,
          injuries: []
        },
        newsSentiment: parsed.newsSentiment || {
          headlines: [],
          sentiment: 'neutral'
        },
        generatedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error('Failed to parse AI response:', error);
  }
  
  // Fallback if parsing fails
  return {
    teamId,
    lastMatchAnalysis: {
      summary: aiReply.substring(0, 200),
      whatWentRight: ["Analysis available in summary"],
      whatWentWrong: []
    },
    nextMatchPreview: {
      summary: "Check back for match preview",
      keyPoints: []
    },
    injuries: {
      available: false,
      injuries: []
    },
    newsSentiment: {
      headlines: [],
      sentiment: 'neutral'
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Get fallback analysis when AI generation fails
 */
function getFallbackAnalysis(teamData: TeamIntelligenceData): TeamIntelligenceAnalysis {
  return {
    teamId: teamData.teamId,
    lastMatchAnalysis: {
      summary: teamData.lastMatch 
        ? `${teamData.lastMatch.result} vs ${teamData.lastMatch.opponent} (${teamData.lastMatch.score})`
        : "No recent match data available",
      whatWentRight: ["Fallback analysis mode"],
      whatWentWrong: []
    },
    nextMatchPreview: {
      summary: teamData.nextMatch
        ? `Upcoming: vs ${teamData.nextMatch.opponent} in ${teamData.nextMatch.competition}`
        : "No upcoming match scheduled",
      keyPoints: []
    },
    injuries: {
      available: false,
      injuries: []
    },
    newsSentiment: {
      headlines: ["Team intelligence analysis temporarily unavailable"],
      sentiment: 'neutral'
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Clear cache for a specific team
 */
export function clearTeamIntelligenceCache(teamId: string): void {
  const cacheKey = `team_intelligence_${teamId}`;
  intelligenceCache.delete(cacheKey);
}

/**
 * Clear all team intelligence cache
 */
export function clearAllTeamIntelligenceCache(): void {
  intelligenceCache.clear();
}
