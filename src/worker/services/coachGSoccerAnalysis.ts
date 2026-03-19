/**
 * Coach G Soccer Match Analysis Service
 * 
 * Generates AI-powered match analysis for soccer games:
 * - Pregame: storylines, form, tactics, injuries, xG angle, what to watch
 * - Postgame: recap, turning points, performance, what it means next
 * 
 * Uses existing AI service and soccer data with 30-60 min caching
 */

import OpenAI from "openai";

// ============ Types ============

export interface SoccerMatchAnalysis {
  matchId: string;
  phase: 'pregame' | 'live' | 'postgame';
  homeTeam: string;
  awayTeam: string;
  competition: string;
  analysis: AnalysisContent;
  generatedAt: string;
  expiresAt: string;
  cached: boolean;
}

export interface AnalysisContent {
  headline: string;
  insights: Array<{
    type: 'storyline' | 'form' | 'tactical' | 'injury' | 'xg' | 'momentum' | 'turning_point' | 'performance' | 'impact';
    title: string;
    content: string;
    confidence: number;
  }>;
}

interface MatchData {
  eventId: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  competition: string;
  status: 'scheduled' | 'live' | 'finished';
  homeScore: number | null;
  awayScore: number | null;
  minute?: string;
  date: string;
}

// ============ Cache Management ============

const CACHE_TTL_MINUTES = 45; // 45 min cache

interface CachedAnalysis {
  data: SoccerMatchAnalysis;
  expiresAt: number;
}

const analysisCache = new Map<string, CachedAnalysis>();

function getCacheKey(matchId: string, phase: string): string {
  return `soccer_analysis_${matchId}_${phase}`;
}

function getCached(matchId: string, phase: string): SoccerMatchAnalysis | null {
  const key = getCacheKey(matchId, phase);
  const cached = analysisCache.get(key);
  
  if (!cached) return null;
  
  if (Date.now() > cached.expiresAt) {
    analysisCache.delete(key);
    return null;
  }
  
  return { ...cached.data, cached: true };
}

function setCache(analysis: SoccerMatchAnalysis): void {
  const key = getCacheKey(analysis.matchId, analysis.phase);
  const expiresAt = Date.now() + (CACHE_TTL_MINUTES * 60 * 1000);
  
  analysisCache.set(key, {
    data: analysis,
    expiresAt,
  });
}

// ============ Analysis Generation ============

async function fetchMatchData(db: D1Database, matchId: string): Promise<MatchData | null> {
  void db;
  void matchId;
  // Try to fetch from soccer API cache or games table
  // For now, return mock data - in production this would query actual tables
  return null;
}

function buildPregamePrompt(match: MatchData): string {
  return `You are Coach G, an expert soccer analyst. Generate a sharp, insightful pregame analysis for this match:

${match.homeTeam.name} vs ${match.awayTeam.name}
Competition: ${match.competition}
Kickoff: ${new Date(match.date).toLocaleString()}

Provide 4-5 insights covering:
1. Key storylines (rivalry, stakes, context)
2. Recent form analysis (last 5 games, momentum)
3. Tactical matchup (playing styles, key battles)
4. Injury/availability concerns
5. Expected goals (xG) angle or what to watch

Format as JSON:
{
  "headline": "One punchy sentence headline",
  "insights": [
    {
      "type": "storyline|form|tactical|injury|xg",
      "title": "Brief title",
      "content": "2-3 sentences of sharp analysis",
      "confidence": 75
    }
  ]
}

Keep it concrete, avoid generic platitudes. Focus on actionable intel.`;
}

function buildPostgamePrompt(match: MatchData): string {
  const score = `${match.homeScore}-${match.awayScore}`;
  
  return `You are Coach G, an expert soccer analyst. Generate a sharp postgame analysis for this match:

${match.homeTeam.name} ${score} ${match.awayTeam.name}
Competition: ${match.competition}

Provide 4-5 insights covering:
1. Match recap (how it unfolded, key moments)
2. Turning points (goals, red cards, tactical changes)
3. Performance analysis (who delivered, who disappointed)
4. What it means next (implications, momentum shift)

Format as JSON:
{
  "headline": "One punchy sentence headline capturing the result",
  "insights": [
    {
      "type": "momentum|turning_point|performance|impact",
      "title": "Brief title",
      "content": "2-3 sentences of sharp analysis",
      "confidence": 80
    }
  ]
}

Keep it concrete and avoid generic commentary.`;
}

export async function generateSoccerAnalysis(
  db: D1Database,
  apiKeys: { OPENAI_API_KEY?: string },
  matchId: string,
  phase: 'pregame' | 'live' | 'postgame',
  forceRefresh = false
): Promise<SoccerMatchAnalysis> {
  // Check cache first
  if (!forceRefresh) {
    const cached = getCached(matchId, phase);
    if (cached) {
      return cached;
    }
  }
  
  // Validate API key
  if (!apiKeys.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  // Fetch match data
  const match = await fetchMatchData(db, matchId);
  
  // For demo/testing, use mock data if no real match found
  const mockMatch: MatchData = match || {
    eventId: matchId,
    homeTeam: { id: '1', name: 'Arsenal' },
    awayTeam: { id: '2', name: 'Chelsea' },
    competition: 'Premier League',
    status: phase === 'postgame' ? 'finished' : phase === 'live' ? 'live' : 'scheduled',
    homeScore: phase === 'postgame' ? 2 : null,
    awayScore: phase === 'postgame' ? 1 : null,
    minute: phase === 'live' ? '67\'' : undefined,
    date: new Date().toISOString(),
  };
  
  // Build prompt based on phase
  const prompt = phase === 'postgame' 
    ? buildPostgamePrompt(mockMatch)
    : buildPregamePrompt(mockMatch);
  
  // Call OpenAI
  const openai = new OpenAI({ apiKey: apiKeys.OPENAI_API_KEY });
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are Coach G, a sharp soccer analyst who provides concrete, actionable insights. Respond only with valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }
  
  let parsed: AnalysisContent;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error("Failed to parse AI response as JSON");
  }
  
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000).toISOString();
  
  const analysis: SoccerMatchAnalysis = {
    matchId,
    phase,
    homeTeam: mockMatch.homeTeam.name,
    awayTeam: mockMatch.awayTeam.name,
    competition: mockMatch.competition,
    analysis: parsed,
    generatedAt: now,
    expiresAt,
    cached: false,
  };
  
  // Cache it
  setCache(analysis);
  
  return analysis;
}

export function clearAnalysisCache(matchId?: string): void {
  if (matchId) {
    // Clear specific match
    ['pregame', 'live', 'postgame'].forEach(phase => {
      analysisCache.delete(getCacheKey(matchId, phase));
    });
  } else {
    // Clear all
    analysisCache.clear();
  }
}
