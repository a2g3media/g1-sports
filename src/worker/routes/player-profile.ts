// @ts-nocheck
/**
 * Player Profile API Routes
 * Comprehensive player data hub - stats, game logs, headshots, matchup intel
 * 
 * Data Sources:
 * - ESPN API: Player search, headshots, game logs, season stats
 * - SportsRadar: Props data (already fetched)
 * - Internal: Cached team defensive ratings
 */

import { Hono } from 'hono';
import { fetchGamePlayerProps, fetchSportsRadarOdds } from '../services/sportsRadarOddsService';
import { getCachedData, makeCacheKey, setCachedData } from '../services/apiCacheService';
import { resolveCanonicalPlayerIdFromPayload } from '../../shared/espnAthleteIdLookup';
import { resolveCanonicalPlayerIdentity } from '../services/playerIdentity/canonicalPlayerResolver';
import { resolveDisplayLinesForPlayerGame } from '../services/historicalLines/displayLineResolver';
import { buildEdgeRows } from '../services/edge/edgeEngine';

export type Bindings = {
  DB: any;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============================================
// ESPN API HELPERS
// ============================================

const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_WEB_API_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports';

function normalizePlayerSearchName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 4000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Sport to ESPN path mapping
const SPORT_PATHS: Record<string, string> = {
  'NBA': 'basketball/nba',
  'NFL': 'football/nfl',
  'MLB': 'baseball/mlb',
  'NHL': 'hockey/nhl',
  'NCAAB': 'basketball/mens-college-basketball',
  'NCAAF': 'football/college-football',
};

// Headshot URL construction
function getEspnHeadshotUrl(espnId: string, sport: string): string {
  const sportPath = sport === 'NBA' || sport === 'NCAAB' ? 'nba' :
                    sport === 'NFL' || sport === 'NCAAF' ? 'nfl' :
                    sport === 'MLB' ? 'mlb' :
                    sport === 'NHL' ? 'nhl' : 'nba';
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${espnId}.png&w=350&h=254`;
}

// Search ESPN for a player by name
async function searchEspnPlayer(
  playerName: string, 
  sport: string,
  team?: string,
  options?: { quick?: boolean }
): Promise<{
  espnId: string;
  displayName: string;
  position: string;
  jersey: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  headshotUrl: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  experience?: string;
  college?: string;
} | null> {
  try {
    const quickLookup = options?.quick === true;
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return null;
    
    // Use ESPN's athlete search endpoint
    const searchUrl = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(playerName)}&limit=10&type=player`;
    
    const searchRes = await fetchWithTimeout(searchUrl, {
      headers: { 'Accept': 'application/json' }
    }, 4500);
    
    if (!searchRes || !searchRes.ok) {
      console.log(`ESPN search failed for ${playerName}: ${searchRes?.status ?? 'timeout'}`);
      return null;
    }
    
    const searchData = await searchRes.json() as any;
    // ESPN returns 'items' not 'results'
    const results = searchData?.items || searchData?.results || [];
    
    // Find matching player - prefer exact name match, then team match
    let bestMatch: any = null;
    for (const result of results) {
      if (result.type !== 'player') continue;
      
      const resultName = normalizePlayerSearchName(result.displayName || '');
      const searchName = normalizePlayerSearchName(playerName);
      
      // Get team from teamRelationships (ESPN's nested format)
      const resultTeam = result.teamRelationships?.[0]?.displayName || result.team?.displayName || '';
      
      // Exact match is best
      if (resultName === searchName) {
        bestMatch = result;
        break;
      }
      
      // Partial match - names contain each other (accent-insensitive)
      if (resultName.includes(searchName) || searchName.includes(resultName)) {
        // If team provided, prefer team match
        if (team && resultTeam.toLowerCase().includes(team.toLowerCase())) {
          bestMatch = result;
          break;
        }
        if (!bestMatch) {
          bestMatch = result;
        }
      }
    }
    
    if (!bestMatch) {
      console.log(`No ESPN match found for ${playerName}`);
      return null;
    }
    
    const playerId = bestMatch.id;
    const searchTeam = bestMatch.teamRelationships?.[0]?.core
      || bestMatch.teamRelationships?.[0]
      || bestMatch.team
      || {};
    
    // Page-data fast path: return immediately from search payload
    // to avoid paying for slower overview/detail endpoints on cold opens.
    if (quickLookup) {
      return {
        espnId: playerId,
        displayName: bestMatch.displayName || playerName,
        position: bestMatch.position?.abbreviation || '',
        jersey: bestMatch.jersey || '',
        teamName: bestMatch.team?.displayName || searchTeam.displayName || searchTeam.name || '',
        teamAbbr: bestMatch.team?.abbreviation || searchTeam.abbreviation || '',
        teamColor: bestMatch.team?.color || searchTeam.color || '3B82F6',
        headshotUrl: bestMatch.headshot?.href || getEspnHeadshotUrl(playerId, sport),
      };
    }

    // Fetch from overview endpoint for better player details
    const overviewUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${playerId}/overview`;
    const overviewRes = await fetchWithTimeout(overviewUrl, {
      headers: { 'Accept': 'application/json' }
    }, 3200);
    
    if (overviewRes && overviewRes.ok) {
      const overviewData = await overviewRes.json() as any;
      const athlete = overviewData.athlete || {};
      const teamData = athlete.team || {};
      
      return {
        espnId: playerId,
        displayName: athlete.displayName || bestMatch.displayName || playerName,
        position: athlete.position?.abbreviation || bestMatch.position?.abbreviation || '',
        jersey: athlete.jersey || bestMatch.jersey || '',
        teamName: teamData.displayName || teamData.name || searchTeam.displayName || searchTeam.name || '',
        teamAbbr: teamData.abbreviation || searchTeam.abbreviation || '',
        teamColor: teamData.color || searchTeam.color || '3B82F6',
        headshotUrl: athlete.headshot?.href || getEspnHeadshotUrl(playerId, sport),
        birthDate: athlete.dateOfBirth,
        height: athlete.displayHeight,
        weight: athlete.displayWeight,
        experience: athlete.experience?.years ? `${athlete.experience.years} yrs` : undefined,
        college: athlete.college?.name,
      };
    }
    
    // Fallback: try the old detailed athlete endpoint
    const detailUrl = `${ESPN_API_BASE}/${sportPath}/athletes/${playerId}`;
    const detailRes = await fetchWithTimeout(detailUrl, {
      headers: { 'Accept': 'application/json' }
    }, 3200);
    
    if (detailRes && detailRes.ok) {
      const playerData = await detailRes.json() as any;
      const athlete = playerData.athlete || playerData;
      
      return {
        espnId: playerId,
        displayName: athlete.displayName || playerName,
        position: athlete.position?.abbreviation || '',
        jersey: athlete.jersey || '',
        teamName: athlete.team?.displayName || searchTeam.displayName || searchTeam.name || '',
        teamAbbr: athlete.team?.abbreviation || searchTeam.abbreviation || '',
        teamColor: athlete.team?.color || searchTeam.color || '3B82F6',
        headshotUrl: athlete.headshot?.href || getEspnHeadshotUrl(playerId, sport),
        birthDate: athlete.dateOfBirth,
        height: athlete.displayHeight,
        weight: athlete.displayWeight,
        experience: athlete.experience?.years ? `${athlete.experience.years} yrs` : undefined,
        college: athlete.college?.name,
      };
    }
    
    // Final fallback: return basic info from search
    return {
      espnId: playerId,
      displayName: bestMatch.displayName || playerName,
      position: bestMatch.position?.abbreviation || '',
      jersey: bestMatch.jersey || '',
      teamName: bestMatch.team?.displayName || searchTeam.displayName || searchTeam.name || '',
      teamAbbr: bestMatch.team?.abbreviation || searchTeam.abbreviation || '',
      teamColor: bestMatch.team?.color || searchTeam.color || '3B82F6',
      headshotUrl: getEspnHeadshotUrl(playerId, sport),
    };
  } catch (err) {
    console.error(`ESPN player search error for ${playerName}:`, err);
    return null;
  }
}

// Sport-specific stat label normalization
const MLB_STAT_LABELS: Record<string, string> = {
  'AB': 'AB', 'R': 'R', 'H': 'H', 'HR': 'HR', 'RBI': 'RBI', 'BB': 'BB',
  'SO': 'SO', 'SB': 'SB', 'AVG': 'AVG', 'OBP': 'OBP', 'SLG': 'SLG', 'OPS': 'OPS',
  'atBats': 'AB', 'runs': 'R', 'hits': 'H', 'homeRuns': 'HR', 'RBIs': 'RBI',
  'walks': 'BB', 'strikeouts': 'SO', 'stolenBases': 'SB', 'battingAverage': 'AVG',
  // Pitching stats
  'W': 'W', 'L': 'L', 'ERA': 'ERA', 'IP': 'IP', 'K': 'K', 'WHIP': 'WHIP',
  'wins': 'W', 'losses': 'L', 'inningsPitched': 'IP',
};

const NCAAB_STAT_LABELS: Record<string, string> = {
  'PTS': 'PTS', 'REB': 'REB', 'AST': 'AST', 'STL': 'STL', 'BLK': 'BLK',
  'MIN': 'MIN', 'FGM': 'FGM', 'FGA': 'FGA', 'FG%': 'FG%', '3PM': '3PM',
  '3PA': '3PA', '3P%': '3P%', 'FTM': 'FTM', 'FTA': 'FTA', 'FT%': 'FT%',
  'points': 'PTS', 'rebounds': 'REB', 'assists': 'AST', 'steals': 'STL',
  'blocks': 'BLK', 'minutes': 'MIN',
};

function normalizeStatLabel(label: string, sport: string): string {
  if (sport === 'MLB') {
    return MLB_STAT_LABELS[label] || label;
  }
  if (sport === 'NCAAB') {
    return NCAAB_STAT_LABELS[label] || label;
  }
  return label;
}

// Fetch player's game log (last N games)
async function fetchEspnGameLog(
  espnId: string,
  sport: string,
  limit: number = 10,
  season?: number,
  options?: { includeSeasonOverview?: boolean }
): Promise<{
  games: Array<{
    date: string;
    opponent: string;
    homeAway: 'home' | 'away';
    result: 'W' | 'L' | 'T';
    score: string;
    stats: Record<string, string | number>;
    minutes?: string;
  }>;
  seasonAverages: Record<string, number>;
} | null> {
  try {
    const includeSeasonOverview = options?.includeSeasonOverview !== false;
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return null;
    
    // Use the ESPN web API for gamelog.
    // Build query params to support cross-season lookups for stronger H2H samples.
    const params = new URLSearchParams();
    if (sport === 'MLB') {
      // MLB endpoint requires batting/pitching category context.
      params.set('category', 'batting');
      // Preserve prior behavior for MLB until in-season endpoint reliability is revisited.
      params.set('season', '2025');
    } else if (season) {
      params.set('season', String(season));
    }
    const qs = params.toString();
    const logUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${espnId}/gamelog${qs ? `?${qs}` : ''}`;
    
    const logRes = await fetchWithTimeout(logUrl, {
      headers: { 'Accept': 'application/json' }
    }, 4800);
    
    if (!logRes || !logRes.ok) {
      console.log(`ESPN game log failed for ${espnId}: ${logRes?.status ?? 'timeout'}`);
      return null;
    }
    
    const logData = await logRes.json() as any;
    
    // Parse labels for stat columns - ESPN returns these at top level
    let labels = logData.labels || [];
    
    // ESPN sometimes nests data differently for baseball
    const seasonTypes = logData.seasonTypes || [];
    const categories = logData.categories || [];
    
    // Try to get labels from categories for MLB
    if (labels.length === 0 && categories.length > 0) {
      const battingCat = categories.find((c: any) => c.name === 'batting' || c.type === 'batting');
      const pitchingCat = categories.find((c: any) => c.name === 'pitching' || c.type === 'pitching');
      const cat = battingCat || pitchingCat || categories[0];
      if (cat?.labels) {
        labels = cat.labels;
      }
    }
    
    // Parse game log entries - ESPN uses different structures
    const games: Array<{
      date: string;
      opponent: string;
      homeAway: 'home' | 'away';
      result: 'W' | 'L' | 'T';
      score: string;
      stats: Record<string, string | number>;
      minutes?: string;
    }> = [];
    
    // Root events have game info (date, opponent, score)
    const gameInfoEvents = logData.events || {};
    
    // Per-game stats are in seasonTypes[].categories[].events keyed by eventId
    // We need to merge these two data sources
    const statsEvents: Record<string, { stats: string[] }> = {};
    
    for (const st of seasonTypes) {
      const cats = st.categories || [];
      for (const cat of cats) {
        const catEvents = cat.events || [];
        // catEvents is an ARRAY of {eventId, stats} objects for MLB
        if (Array.isArray(catEvents)) {
          for (const eventData of catEvents) {
            if (eventData?.eventId && eventData?.stats) {
              statsEvents[eventData.eventId] = eventData;
            }
          }
        } else {
          // Fallback for object structure (other sports)
          for (const [eventId, eventData] of Object.entries(catEvents)) {
            const typedEventData = eventData as { eventId: string; stats: string[] };
            if (typedEventData.stats) {
              const resolvedEventId = String(typedEventData.eventId || eventId || "").trim();
              if (!resolvedEventId) continue;
              statsEvents[resolvedEventId] = typedEventData;
            }
          }
        }
        // Grab labels from this category if not already set
        if (labels.length === 0 && cat.labels) {
          labels = cat.labels;
        }
      }
    }
    
    // Use event IDs sorted by date desc, then apply limit.
    const eventIds = Object.entries(gameInfoEvents)
      .map(([eventId, gameInfo]: [string, any]) => ({
        eventId,
        ts: new Date(gameInfo?.gameDate || gameInfo?.eventDate || 0).getTime() || 0,
      }))
      .sort((a, b) => b.ts - a.ts)
      .map((row) => row.eventId)
      .slice(0, limit);
    
    for (const eventId of eventIds) {
      const gameInfo = gameInfoEvents[eventId];
      if (!gameInfo) continue;
      
      const gameStats: Record<string, string | number> = {};
      
      // Get stats from the stats events using eventId as key
      const statsData = statsEvents[eventId];
      const statsArr = statsData?.stats || [];
      
      // Map labels to values with normalization
      for (let i = 0; i < labels.length && i < statsArr.length; i++) {
        const normalizedLabel = normalizeStatLabel(labels[i], sport);
        gameStats[normalizedLabel] = statsArr[i];
      }
      
      // Parse opponent and result from game info event data
      const opponentData = gameInfo.opponent || {};
      const atVs = gameInfo.atVs || 'vs';
      
      games.push({
        date: gameInfo.gameDate || gameInfo.eventDate || '',
        opponent: opponentData.displayName || opponentData.abbreviation || 'Unknown',
        homeAway: atVs === '@' ? 'away' : 'home',
        result: gameInfo.gameResult || (gameInfo.homeScore > gameInfo.awayScore ? 'W' : 'L'),
        score: gameInfo.score || '',
        stats: gameStats,
        minutes: gameStats['MIN']?.toString(),
      });
    }

    // Some ESPN responses omit root `events` metadata but still provide per-event stats
    // under seasonTypes/categories. Emit minimal rows so profile panels can render.
    if (games.length === 0 && Object.keys(statsEvents).length > 0) {
      const statOnlyEventIds = Object.keys(statsEvents).slice(0, limit);
      for (const eventId of statOnlyEventIds) {
        const statsData = statsEvents[eventId];
        const statsArr = statsData?.stats || [];
        const gameStats: Record<string, string | number> = {};
        for (let i = 0; i < labels.length && i < statsArr.length; i++) {
          const normalizedLabel = normalizeStatLabel(labels[i], sport);
          gameStats[normalizedLabel] = statsArr[i];
        }
        games.push({
          date: '',
          opponent: 'Unknown',
          homeAway: 'home',
          result: 'T',
          score: '',
          stats: gameStats,
          minutes: gameStats['MIN']?.toString(),
        });
      }
    }
    
    // Fetch season averages from overview endpoint
    const seasonStats: Record<string, number> = {};
    if (includeSeasonOverview) {
      try {
        const overviewUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${espnId}/overview`;
        const overviewRes = await fetchWithTimeout(overviewUrl, {
          headers: { 'Accept': 'application/json' }
        }, 2800);
        
        if (overviewRes && overviewRes.ok) {
          const overviewData = await overviewRes.json() as any;
          const statistics = overviewData.statistics || {};
          let statLabels = statistics.labels || [];
          const splits = statistics.splits || [];
          
          // For MLB, statistics might be in categories array
          if (statLabels.length === 0 && statistics.categories) {
            const battingCat = statistics.categories.find((c: any) => 
              c.name === 'batting' || c.displayName === 'Batting'
            );
            const cat = battingCat || statistics.categories[0];
            if (cat) {
              statLabels = cat.labels || [];
              // Look for season totals in this category's splits
              const catSplits = cat.splits || [];
              const regSeason = catSplits.find((s: any) => 
                s.displayName === 'Regular Season' || s.displayName === 'Season' || s.displayName === 'Total'
              ) || catSplits[0];
              
              if (regSeason?.stats) {
                for (let i = 0; i < statLabels.length && i < regSeason.stats.length; i++) {
                  const label = normalizeStatLabel(statLabels[i], sport);
                  const val = regSeason.stats[i];
                  if (typeof val === 'number') {
                    seasonStats[label] = val;
                  } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
                    seasonStats[label] = parseFloat(val);
                  }
                }
              }
            }
          }
          
          // Standard path for NBA/NHL/NCAAB
          if (Object.keys(seasonStats).length === 0 && splits.length > 0) {
            // Find regular season stats (usually first split)
            const regularSeason = splits.find((s: any) => 
              s.displayName === 'Regular Season' || s.displayName === 'Season'
            ) || splits[0];
            
            if (regularSeason?.stats) {
              for (let i = 0; i < statLabels.length && i < regularSeason.stats.length; i++) {
                const label = normalizeStatLabel(statLabels[i], sport);
                const val = regularSeason.stats[i];
                if (typeof val === 'number') {
                  seasonStats[label] = val;
                } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
                  seasonStats[label] = parseFloat(val);
                }
              }
            }
          }
        }
      } catch (e) {
        console.log(`Failed to fetch overview for ${espnId}:`, e);
      }
    }
    
    return {
      games,
      seasonAverages: seasonStats,
    };
  } catch (err) {
    console.error(`ESPN game log error for ${espnId}:`, err);
    return null;
  }
}



// ============================================
// MATCHUP & HEALTH DATA
// ============================================

interface MatchupData {
  opponent: {
    name: string;
    abbr: string;
    logo?: string;
  };
  upcomingOpponents?: Array<{
    name: string;
    abbr: string;
    logo?: string;
    gameTime?: string;
    venue?: string;
  }>;
  gameTime?: string;
  venue?: string;
  defensiveRankings?: {
    overall?: number;
    vsPosition?: number;
    ptsAllowed?: number;
    last5PtsAllowed?: number;
  };
  recentPerformance?: Array<{
    date: string;
    opponent: string;
    result: string;
    keyStats: Record<string, number>;
  }>;
}

interface HealthData {
  status: 'healthy' | 'questionable' | 'doubtful' | 'out' | 'injury_reserve' | 'unknown';
  injury?: string;
  injuryDate?: string;
  expectedReturn?: string;
  minutesTrend: {
    last5Avg: number;
    seasonAvg: number;
    trend: 'up' | 'down' | 'stable';
    last5: number[];
  };
}

interface OpponentPropCoverage {
  propType: string;
  line: number;
  hits: number;
  total: number;
  rate: number;
}

interface PlayerVsOpponentData {
  opponent: {
    name: string;
    abbr: string;
  };
  sampleSize: number;
  wins: number;
  losses: number;
  averages: Record<string, number>;
  props: OpponentPropCoverage[];
  recent: Array<{
    date: string;
    opponent: string;
    result: string;
    stats: Record<string, number>;
  }>;
}

interface RecentPerformanceWithOdds {
  date: string;
  opponent: string;
  result: 'W' | 'L' | 'T';
  stats: Record<string, number | null>;
  propLines?: Record<string, number | null>;
  lineQualityByStat?: Record<string, "verified" | "estimated">;
  lineSourceByStat?: Record<string, "historical_verified" | "estimated_verified" | "display_fallback" | "unavailable">;
  lineSource: 'historical' | 'historical_verified' | 'latest_fallback' | 'event_fallback' | 'estimated_fallback' | 'unavailable';
}

type PlayerRoleBucket =
  | "mlb_pitcher"
  | "mlb_hitter"
  | "nhl_goalie"
  | "nhl_skater"
  | "soccer_goalkeeper"
  | "soccer_field"
  | "generic";

function normalizePlayerRole(params: {
  sport: string;
  rawPosition: string;
  seasonAverages?: Record<string, unknown> | null;
  gameLog?: Array<{ stats?: Record<string, string | number> }> | null;
  props?: Array<{ prop_type?: string | null }> | null;
}): { normalizedPosition: string; roleBucket: PlayerRoleBucket } {
  const sportUpper = String(params.sport || "").toUpperCase();
  const raw = String(params.rawPosition || "").trim().toUpperCase();
  const compactRaw = raw.replace(/\s+/g, "");
  const season = params.seasonAverages && typeof params.seasonAverages === "object" ? params.seasonAverages : {};
  const games = Array.isArray(params.gameLog) ? params.gameLog : [];
  const props = Array.isArray(params.props) ? params.props : [];
  const hasSeasonKey = (keys: string[]) =>
    keys.some((k) => Object.prototype.hasOwnProperty.call(season, k) && season[k as keyof typeof season] !== null && season[k as keyof typeof season] !== undefined);
  const hasGameStatKey = (keys: string[]) =>
    games.some((g) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      return keys.some((k) => Object.prototype.hasOwnProperty.call(stats, k));
    });
  const hasPropToken = (tokens: string[]) =>
    props.some((p) => {
      const t = String(p?.prop_type || "").toUpperCase();
      return tokens.some((token) => t.includes(token));
    });

  if (sportUpper === "MLB") {
    const pitcherTokens = new Set(["P", "SP", "RP", "CP", "RHP", "LHP"]);
    const inferredPitcher =
      hasSeasonKey(["IP", "inningsPitched", "ERA", "WHIP", "earnedRuns"])
      || hasGameStatKey(["IP", "ERA", "WHIP", "ER", "earnedRuns", "outsRecorded", "hitsAllowed"])
      || hasPropToken(["PITCHER_STRIKEOUT", "OUTS_RECORDED", "EARNED_RUN", "HITS_ALLOWED", "WALKS_ALLOWED", "INNINGS_PITCHED"]);
    const isPitcher = pitcherTokens.has(compactRaw) || inferredPitcher;
    if (isPitcher) {
      return { normalizedPosition: compactRaw || "P", roleBucket: "mlb_pitcher" };
    }
    return { normalizedPosition: compactRaw || "H", roleBucket: "mlb_hitter" };
  }

  if (sportUpper === "NHL") {
    const isGoalie = compactRaw === "G" || hasSeasonKey(["saves", "SV", "goalsAgainst", "GA"]) || hasGameStatKey(["SV", "saves", "GA", "goalsAgainst"]);
    return { normalizedPosition: compactRaw || (isGoalie ? "G" : ""), roleBucket: isGoalie ? "nhl_goalie" : "nhl_skater" };
  }

  if (sportUpper === "SOCCER") {
    const isGoalkeeper = compactRaw === "GK" || compactRaw === "G" || hasSeasonKey(["cleanSheets", "saves"]) || hasGameStatKey(["saves"]);
    return { normalizedPosition: compactRaw || (isGoalkeeper ? "GK" : ""), roleBucket: isGoalkeeper ? "soccer_goalkeeper" : "soccer_field" };
  }

  return { normalizedPosition: compactRaw || raw, roleBucket: "generic" };
}

function filterPropsForRole(params: {
  sport: string;
  roleBucket: PlayerRoleBucket;
  props: any[];
}): any[] {
  const sportUpper = String(params.sport || "").toUpperCase();
  const rows = Array.isArray(params.props) ? params.props : [];
  if (sportUpper !== "MLB") return rows;

  const isPitcher = params.roleBucket === "mlb_pitcher";
  const isHitter = params.roleBucket === "mlb_hitter";
  if (!isPitcher && !isHitter) return rows;

  const isPitcherType = (typeRaw: string): boolean => {
    const t = typeRaw.toUpperCase();
    return (
      t.includes("PITCHER_STRIKEOUT")
      || t.includes("OUTS_RECORDED")
      || t.includes("EARNED_RUN")
      || t.includes("HITS_ALLOWED")
      || t.includes("WALKS_ALLOWED")
      || t.includes("INNINGS_PITCHED")
    );
  };
  const isHitterType = (typeRaw: string): boolean => {
    const t = typeRaw.toUpperCase();
    return (
      t.includes("HITS")
      || t.includes("RUNS")
      || t.includes("RBI")
      || t.includes("HOME_RUN")
      || t.includes("TOTAL_BASES")
      || t.includes("SINGLES")
      || t.includes("DOUBLES")
      || t.includes("TRIPLES")
      || t.includes("STOLEN_BASE")
    );
  };

  return rows.filter((row) => {
    const typeRaw = String(row?.prop_type || "").trim();
    if (!typeRaw) return false;
    if (isPitcher) return isPitcherType(typeRaw);
    if (isHitter) return isHitterType(typeRaw);
    return true;
  });
}

const NBA_TEAM_ABBR_BY_NAME: Record<string, string> = {
  'atlanta hawks': 'ATL',
  'boston celtics': 'BOS',
  'brooklyn nets': 'BKN',
  'charlotte hornets': 'CHA',
  'chicago bulls': 'CHI',
  'cleveland cavaliers': 'CLE',
  'dallas mavericks': 'DAL',
  'denver nuggets': 'DEN',
  'detroit pistons': 'DET',
  'golden state warriors': 'GSW',
  'houston rockets': 'HOU',
  'indiana pacers': 'IND',
  'la clippers': 'LAC',
  'los angeles clippers': 'LAC',
  'los angeles lakers': 'LAL',
  'memphis grizzlies': 'MEM',
  'miami heat': 'MIA',
  'milwaukee bucks': 'MIL',
  'minnesota timberwolves': 'MIN',
  'new orleans pelicans': 'NOP',
  'new york knicks': 'NYK',
  'oklahoma city thunder': 'OKC',
  'orlando magic': 'ORL',
  'philadelphia 76ers': 'PHI',
  'phoenix suns': 'PHX',
  'portland trail blazers': 'POR',
  'sacramento kings': 'SAC',
  'san antonio spurs': 'SAS',
  'toronto raptors': 'TOR',
  'utah jazz': 'UTA',
  'washington wizards': 'WAS',
};

function resolveOpponentAbbrFromName(opponentName: string, sport: string): string {
  const raw = String(opponentName || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2,4}$/.test(upper)) return upper;
  if (sport === 'NBA' || sport === 'NCAAB') {
    const key = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const hit = NBA_TEAM_ABBR_BY_NAME[key];
    if (hit) return hit;
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0] || ''}${tokens[tokens.length - 1][0] || ''}`.toUpperCase();
  return raw.slice(0, 3).toUpperCase();
}

function normalizeToken(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeWordTokens(value: unknown): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function expandNbaAliasCandidates(aliasLike: unknown): string[] {
  const raw = String(aliasLike || '').trim().toUpperCase();
  if (!raw) return [];
  const map: Record<string, string[]> = {
    GSW: ['GS'],
    GS: ['GSW'],
    NYK: ['NY'],
    NY: ['NYK'],
    SAS: ['SA'],
    SA: ['SAS'],
    NOP: ['NO'],
    NO: ['NOP'],
    PHX: ['PHO'],
    PHO: ['PHX'],
    UTA: ['UTAH'],
    UTAH: ['UTA'],
  };
  return Array.from(new Set([raw, ...(map[raw] || [])]));
}

export function normalizePlayerSlug(value: unknown): string {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2019/g, "'")
    .trim();
  if (!raw) return '';
  if (raw.includes(',')) {
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const [last, ...rest] = parts;
      const first = rest.join(' ').trim();
      const combined = `${first} ${last}`.replace(/\s+/g, ' ').trim();
      if (combined) return combined;
    }
  }
  return raw;
}

function toDisplayFirstLast(name: string): string {
  if (!name.includes(',')) return name.trim();
  const [last, first] = name.split(',').map((part) => part.trim());
  return `${first} ${last}`.trim();
}

function toDisplayLastFirst(name: string): string {
  if (name.includes(',')) return name.trim();
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return String(name || '').trim();
  const first = parts.shift() || '';
  const last = parts.join(' ');
  return `${last}, ${first}`.trim();
}

async function resolveCanonicalPlayer(
  db: D1Database,
  sport: string,
  playerNameInput: string,
  teamHint?: string
): Promise<{ player_internal_id: string; espn_player_id: string; canonical_name: string } | null> {
  const normalizeName = (value: unknown): string =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const requested = normalizeName(playerNameInput);
  if (!requested) return null;
  const sportKey = String(sport || "").toUpperCase();
  const teamToken = normalizeName(teamHint || "");

  const exact = await db.prepare(`
    SELECT canonical_player_id AS player_internal_id, espn_player_id, display_name AS canonical_name
    FROM canonical_players
    WHERE sport = ?
      AND normalized_name = ?
    LIMIT 1
  `).bind(sportKey, requested).first<{
    player_internal_id: string;
    espn_player_id: string;
    canonical_name: string;
  }>();
  if (exact?.player_internal_id && exact?.espn_player_id) return exact;

  const tokens = requested.split(" ").filter(Boolean);
  const first = tokens[0] || "";
  const last = tokens[tokens.length - 1] || "";
  const fuzzy = await db.prepare(`
    SELECT canonical_player_id AS player_internal_id, espn_player_id, display_name AS canonical_name, normalized_name, team_ids_json
    FROM canonical_players
    WHERE sport = ?
      AND (
        normalized_name LIKE ?
        OR normalized_name LIKE ?
      )
    LIMIT 80
  `).bind(
    sportKey,
    `%${last}%`,
    `%${first}%`
  ).all<{
    player_internal_id: string;
    espn_player_id: string;
    canonical_name: string;
    normalized_name: string;
    team_ids_json: string | null;
  }>();
  let best: { score: number; row: { player_internal_id: string; espn_player_id: string; canonical_name: string } } | null = null;
  for (const row of fuzzy.results || []) {
    const normalized = normalizeName(row.normalized_name || row.canonical_name);
    if (!normalized) continue;
    let score = 0;
    if (normalized === requested) score += 10;
    if (last && normalized.includes(last)) score += 4;
    if (first && normalized.includes(first)) score += 2;
    if (teamToken && String(row.team_ids_json || "").toLowerCase().includes(teamToken)) score += 2;
    if (!best || score > best.score) {
      best = {
        score,
        row: {
          player_internal_id: String(row.player_internal_id || ""),
          espn_player_id: String(row.espn_player_id || ""),
          canonical_name: String(row.canonical_name || ""),
        },
      };
    }
  }
  if (best && best.score >= 4 && best.row.player_internal_id && best.row.espn_player_id) {
    return best.row;
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildRecentPerformanceWithOdds(
  db: D1Database,
  sport: string,
  playerNames: string[],
  gameLog: Array<{ date: string; opponent: string; result: 'W' | 'L' | 'T'; stats: Record<string, string | number>; gameId?: string }>,
  fallbackProps?: Array<{ prop_type?: string; line_value?: number }>,
  sportsRadarPropsKey?: string,
  playerTeamName?: string,
  options?: {
    allowOnDemandFetch?: boolean;
    playerId?: string;
    roleBucket?: PlayerRoleBucket;
  }
): Promise<RecentPerformanceWithOdds[]> {
  const allowOnDemandFetch = options?.allowOnDemandFetch !== false;
  const hasLineValue = (value: unknown): boolean => {
    if (value === null || value === undefined || value === "") return false;
    const n = Number(value);
    return Number.isFinite(n);
  };
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sdio_props_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        prop_type TEXT NOT NULL,
        line_value REAL NOT NULL,
        recorded_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch {
    // Non-fatal guardrail for local DBs missing migration 61.
  }

  let recentGames = [...(gameLog || [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Verified archive path is the only allowed source for historical line rendering.
  const normalizeToken = (value: unknown): string =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const normalizeWords = (value: unknown): string[] =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
  const toYmd = (value: unknown): string => {
    const d = new Date(String(value || ""));
    if (!Number.isFinite(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };
  const dayDiff = (a: string, b: string): number => {
    const da = new Date(`${a}T12:00:00`);
    const db = new Date(`${b}T12:00:00`);
    if (!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return Number.POSITIVE_INFINITY;
    return Math.abs(da.getTime() - db.getTime()) / (24 * 60 * 60 * 1000);
  };
  const resolveCanonicalPlayerInternalId = async (): Promise<string | null> => {
    const sportKey = String(sport || "").toUpperCase();
    const normalizeName = (value: unknown): string =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const primaryPlayerId = String(options?.playerId || "").trim();
    if (/^\d{4,}$/.test(primaryPlayerId)) {
      const canonical = await resolveCanonicalPlayerIdentity({
        db,
        sport: sportKey,
        playerId: primaryPlayerId,
        playerName: playerNames.find(Boolean) || primaryPlayerId,
        source: "playerProfile.verifiedArchive.primaryId",
      });
      if (canonical.ok) return canonical.identity.canonicalPlayerId;
    }
    for (const name of playerNames || []) {
      const raw = String(name || "").trim();
      if (!raw) continue;
      const espnId = resolveCanonicalPlayerIdFromPayload(raw, sportKey);
      if (!espnId || !/^\d{4,}$/.test(String(espnId))) continue;
      const canonical = await resolveCanonicalPlayerIdentity({
        db,
        sport: sportKey,
        playerId: String(espnId),
        playerName: raw,
        source: "playerProfile.verifiedArchive",
      });
      if (canonical.ok) return canonical.identity.canonicalPlayerId;
    }
    for (const name of playerNames || []) {
      const normalized = normalizeName(name);
      if (!normalized) continue;
      const row = await db.prepare(`
        SELECT canonical_player_id
        FROM canonical_players
        WHERE sport = ?
          AND normalized_name = ?
        LIMIT 1
      `).bind(sportKey, normalized).first<{ canonical_player_id: string | null }>();
      const canonicalPlayerId = String(row?.canonical_player_id || "").trim();
      if (canonicalPlayerId) return canonicalPlayerId;
    }
    for (const name of playerNames || []) {
      const raw = String(name || "").trim();
      if (!raw) continue;
      const resolved = await resolveCanonicalPlayer(db, sportKey, raw, playerTeamName);
      const canonicalPlayerId = String(resolved?.player_internal_id || "").trim();
      if (canonicalPlayerId) return canonicalPlayerId;
    }
    return null;
  };
  const resolveGameProviderIdForRow = async (game: { date: string; opponent: string }): Promise<string | null> => {
    const gameDate = toYmd(game.date);
    if (!gameDate) return null;
    const rows = await db.prepare(`
      SELECT provider_game_id, start_time, home_team_name, away_team_name, home_team, away_team
      FROM sdio_games
      WHERE UPPER(COALESCE(sport, '')) = ?
        AND provider_game_id IS NOT NULL
        AND start_time IS NOT NULL
      ORDER BY ABS(strftime('%s', start_time) - strftime('%s', ?)) ASC
      LIMIT 40
    `).bind(String(sport || "").toUpperCase(), game.date).all<{
      provider_game_id: string;
      start_time: string;
      home_team_name: string | null;
      away_team_name: string | null;
      home_team: string | null;
      away_team: string | null;
    }>();
    const oppTokens = new Set<string>();
    oppTokens.add(normalizeToken(game.opponent));
    for (const w of normalizeWords(game.opponent)) {
      if (w.length >= 3) oppTokens.add(normalizeToken(w));
    }
    const playerTeamToken = normalizeToken(playerTeamName || "");
    let best: { score: number; providerGameId: string } | null = null;
    for (const row of rows.results || []) {
      const providerGameId = String(row.provider_game_id || "").trim();
      if (!providerGameId) continue;
      const rowDate = toYmd(row.start_time);
      let score = 0;
      if (gameDate && rowDate) {
        const diff = dayDiff(gameDate, rowDate);
        if (diff === 0) score += 3;
        else if (diff <= 1) score += 2;
      }
      const homeToken = normalizeToken(row.home_team_name || row.home_team || "");
      const awayToken = normalizeToken(row.away_team_name || row.away_team || "");
      const oppMatch = Array.from(oppTokens).some((t) => t && (homeToken.includes(t) || awayToken.includes(t)));
      if (oppMatch) score += 3;
      if (playerTeamToken && (homeToken.includes(playerTeamToken) || awayToken.includes(playerTeamToken))) {
        score += 1;
      }
      if (!best || score > best.score) best = { score, providerGameId };
    }
    return best && best.score >= 3 ? best.providerGameId : null;
  };
  const logRowMatchFailure = (payload: {
    playerId: string | null;
    gameId: string | null;
    statType: string;
    reason: string;
  }) => {
    console.warn("[player-profile][row-match-failure]", {
      playerId: payload.playerId,
      gameId: payload.gameId,
      statType: payload.statType,
      reason: payload.reason,
    });
  };
  const resolveCanonicalGameIdForRow = async (game: { date: string; opponent: string }): Promise<string | null> => {
    const providerGameId = await resolveGameProviderIdForRow(game);
    if (providerGameId) {
      const canonicalGame = await db.prepare(`
        SELECT id
        FROM canonical_games
        WHERE sport = ?
          AND (
            provider_game_id = ?
            OR provider_event_id = ?
            OR id = ?
          )
        LIMIT 1
      `).bind(
        String(sport || "").toUpperCase(),
        providerGameId,
        providerGameId,
        `${String(sport || "").toLowerCase()}:game:${providerGameId}`
      ).first<{ id: string | null }>();
      const gameKey = String(canonicalGame?.id || `${String(sport || "").toLowerCase()}:game:${providerGameId}`).trim();
      if (gameKey) return gameKey;
    }
    const targetDate = toYmd(game.date);
    if (!targetDate) return null;
    const oppTokens = new Set<string>();
    oppTokens.add(normalizeToken(game.opponent));
    for (const w of normalizeWords(game.opponent)) {
      if (w.length >= 3) oppTokens.add(normalizeToken(w));
    }
    const rows = await db.prepare(`
      SELECT
        g.id,
        g.start_time,
        ht.display_name AS home_team_name,
        at.display_name AS away_team_name
      FROM canonical_games g
      LEFT JOIN canonical_teams ht ON ht.id = g.home_team_id
      LEFT JOIN canonical_teams at ON at.id = g.away_team_id
      WHERE UPPER(COALESCE(g.sport, '')) = ?
      ORDER BY ABS(strftime('%s', g.start_time) - strftime('%s', ?)) ASC
      LIMIT 50
    `).bind(
      String(sport || "").toUpperCase(),
      game.date
    ).all<{
      id: string | null;
      start_time: string | null;
      home_team_name: string | null;
      away_team_name: string | null;
    }>();
    let best: { score: number; gameId: string } | null = null;
    for (const row of rows.results || []) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      const rowDate = toYmd(row.start_time);
      let score = 0;
      if (rowDate) {
        const diff = dayDiff(targetDate, rowDate);
        if (diff === 0) score += 3;
        else if (diff <= 1) score += 2;
      }
      const homeToken = normalizeToken(row.home_team_name || "");
      const awayToken = normalizeToken(row.away_team_name || "");
      const oppMatch = Array.from(oppTokens).some((t) => t && (homeToken.includes(t) || awayToken.includes(t)));
      if (oppMatch) score += 3;
      if (!best || score > best.score) best = { score, gameId: id };
    }
    return best && best.score >= 3 ? best.gameId : null;
  };
  const canonicalPlayerId = await resolveCanonicalPlayerInternalId();
  const loadArchiveRecentGames = async (): Promise<Array<{ date: string; opponent: string; result: 'W' | 'L' | 'T'; stats: Record<string, string | number>; gameId?: string }>> => {
    if (!canonicalPlayerId) return [];
    const rows = await db.prepare(`
      SELECT
        v.game_id,
        g.start_time,
        ht.display_name AS home_team_name,
        at.display_name AS away_team_name
      FROM (
        SELECT DISTINCT game_id
        FROM historical_verified_lines_expanded
        WHERE sport = ? AND player_internal_id = ?
        UNION
        SELECT DISTINCT game_id
        FROM historical_verified_lines_strict
        WHERE sport = ? AND player_internal_id = ?
      ) v
      LEFT JOIN canonical_games g ON g.id = v.game_id
      LEFT JOIN canonical_teams ht ON ht.id = g.home_team_id
      LEFT JOIN canonical_teams at ON at.id = g.away_team_id
      ORDER BY datetime(g.start_time) DESC
      LIMIT 5
    `).bind(
      String(sport || "").toUpperCase(),
      canonicalPlayerId,
      String(sport || "").toUpperCase(),
      canonicalPlayerId
    ).all<{
      game_id: string | null;
      start_time: string | null;
      home_team_name: string | null;
      away_team_name: string | null;
    }>();
    return (rows.results || []).map((row) => {
      const home = String(row.home_team_name || "Home Team").trim();
      const away = String(row.away_team_name || "Away Team").trim();
      const playerTeamToken = normalizeToken(playerTeamName || "");
      const homeToken = normalizeToken(home);
      const awayToken = normalizeToken(away);
      const opponent = playerTeamToken && homeToken.includes(playerTeamToken)
        ? away
        : playerTeamToken && awayToken.includes(playerTeamToken)
          ? home
          : away || home;
      return {
        date: String(row.start_time || ""),
        opponent,
        result: "T",
        stats: {},
        gameId: String(row.game_id || "").trim() || undefined,
      };
    }).filter((row) => Boolean(toYmd(row.date)));
  };
  const latestGameDate = recentGames.length > 0 ? toYmd(recentGames[0]?.date) : "";
  const latestGameAgeDays = latestGameDate ? dayDiff(latestGameDate, toYmd(new Date().toISOString())) : Number.POSITIVE_INFINITY;
  if ((recentGames.length === 0 || latestGameAgeDays > 30) && canonicalPlayerId) {
    const archiveRecentGames = await loadArchiveRecentGames();
    if (archiveRecentGames.length > 0) {
      console.info("[player-profile][row-match]", {
        playerId: canonicalPlayerId,
        reason: recentGames.length === 0 ? "empty_game_log_using_archive_rows" : "stale_game_log_using_archive_rows",
        replacedRows: archiveRecentGames.length,
      });
      recentGames = archiveRecentGames;
    }
  }
  if (recentGames.length === 0) return [];
  const verifiedByRow: Array<{
    lines: Record<string, number | null>;
    lineQualityByStat: Record<string, "verified" | "estimated">;
    lineSourceByStat: Record<string, "historical_verified" | "estimated_verified" | "display_fallback" | "unavailable">;
    hasVerified: boolean;
    hasEstimated: boolean;
    hasDisplayFallback: boolean;
  }> = [];
  const rowGameKeys: Array<string | null> = [];
  if (canonicalPlayerId) {
    for (const game of recentGames) {
      const directGameId = String((game as { gameId?: string })?.gameId || "").trim();
      const gameKey = directGameId || await resolveCanonicalGameIdForRow(game);
      if (!gameKey) {
        logRowMatchFailure({
          playerId: canonicalPlayerId,
          gameId: null,
          statType: "row",
          reason: "no_canonical_game_match",
        });
        verifiedByRow.push({
          lines: {},
          lineQualityByStat: {},
          lineSourceByStat: {},
          hasVerified: false,
          hasEstimated: false,
          hasDisplayFallback: false,
        });
        rowGameKeys.push(null);
        continue;
      }
      const preferred = await resolveDisplayLinesForPlayerGame({
        db,
        sport: String(sport || "").toUpperCase(),
        gameId: gameKey,
        playerInternalId: canonicalPlayerId,
      });
      if (!preferred.hasStrict && !preferred.hasExpanded && !preferred.hasDisplayFallback) {
        logRowMatchFailure({
          playerId: canonicalPlayerId,
          gameId: gameKey,
          statType: "row",
          reason: "no_display_lines_for_game",
        });
      }
      verifiedByRow.push(
        {
          lines: Object.fromEntries(
            Object.entries(preferred.lines || {}).map(([k, v]) => [k, Number.isFinite(Number(v?.lineValue)) ? Number(v?.lineValue) : null])
          ),
          lineQualityByStat: preferred.lineQualityByStat || {},
          lineSourceByStat: preferred.lineSourceByStat || {},
          hasVerified: Boolean(preferred.hasStrict),
          hasEstimated: Boolean(preferred.hasExpanded),
          hasDisplayFallback: Boolean(preferred.hasDisplayFallback),
        }
      );
      rowGameKeys.push(gameKey);
    }
  } else {
    for (const _ of recentGames) {
      verifiedByRow.push({
        lines: {},
        lineQualityByStat: {},
        lineSourceByStat: {},
        hasVerified: false,
        hasEstimated: false,
        hasDisplayFallback: false,
      });
      rowGameKeys.push(null);
    }
  }

  const readRowLine = (rowLines: Record<string, number | null>, keys: string[]): number | null => {
    for (const key of keys) {
      const value = rowLines[key];
      if (hasLineValue(value)) return Number(value);
    }
    return null;
  };

  if (String(sport || "").toUpperCase() === "MLB") {
    const isPitcher = options?.roleBucket === "mlb_pitcher";
    return recentGames.map((g, idx) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      const rowMeta = verifiedByRow[idx] || { lines: {}, lineQualityByStat: {}, lineSourceByStat: {}, hasVerified: false, hasEstimated: false, hasDisplayFallback: false };
      const rowLines = rowMeta.lines || {};
      const strikeouts = Number((stats as any).strikeouts ?? (stats as any).so ?? (stats as any).K);
      const hits = Number((stats as any).hits ?? (stats as any).H);
      const runs = Number((stats as any).runs ?? (stats as any).R);
      const rbis = Number((stats as any).rbis ?? (stats as any).rbi ?? (stats as any).RBI);
      const homeRuns = Number((stats as any).homeRuns ?? (stats as any).home_runs ?? (stats as any).hr ?? (stats as any).HR);
      const earnedRuns = Number((stats as any).earnedRuns ?? (stats as any).earned_runs ?? (stats as any).ER);
      const outsRecorded = Number((stats as any).outsRecorded ?? (stats as any).pitchingOuts ?? (stats as any).OUT);
      const hitsAllowed = Number((stats as any).hitsAllowed ?? (stats as any).hits_allowed ?? (stats as any).HA);
      const walksAllowed = Number((stats as any).walksAllowed ?? (stats as any).walks_allowed ?? (stats as any).BB);
      const inningsPitched = Number((stats as any).inningsPitched ?? (stats as any).IP);
      const propLines = isPitcher
        ? {
            strikeouts: readRowLine(rowLines, ["pitcherStrikeouts", "strikeouts", "so", "k"]),
            earnedRuns: readRowLine(rowLines, ["earnedRuns", "earned_runs", "er"]),
            outsRecorded: readRowLine(rowLines, ["outsRecorded", "outs_recorded", "pitchingOuts", "outs"]),
            hitsAllowed: readRowLine(rowLines, ["hitsAllowed", "hits_allowed", "ha"]),
            walksAllowed: readRowLine(rowLines, ["walksAllowed", "walks_allowed", "bb"]),
          }
        : {
            hits: readRowLine(rowLines, ["hits", "hit"]),
            runs: readRowLine(rowLines, ["runs", "run"]),
            rbis: readRowLine(rowLines, ["rbis", "rbi"]),
            homeRuns: readRowLine(rowLines, ["homeRuns", "home_runs", "hr"]),
            strikeouts: readRowLine(rowLines, ["strikeouts", "so", "k"]),
          };
      const hasAny = Object.values(propLines).some((v) => hasLineValue(v));
      const statTypesToValidate = isPitcher
        ? ["strikeouts", "earnedRuns", "outsRecorded", "hitsAllowed", "walksAllowed"]
        : ["hits", "runs", "rbis", "homeRuns", "strikeouts"];
      for (const statType of statTypesToValidate) {
        if (!hasLineValue((propLines as any)[statType])) {
          logRowMatchFailure({
            playerId: canonicalPlayerId,
            gameId: rowGameKeys[idx] || String(g?.date || ""),
            statType,
            reason: "stat_key_unmatched",
          });
        }
      }
      return {
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        stats: isPitcher
          ? {
              K: Number.isFinite(strikeouts) ? strikeouts : null,
              ER: Number.isFinite(earnedRuns) ? earnedRuns : null,
              OUT: Number.isFinite(outsRecorded) ? outsRecorded : null,
              HA: Number.isFinite(hitsAllowed) ? hitsAllowed : null,
              BB: Number.isFinite(walksAllowed) ? walksAllowed : null,
              IP: Number.isFinite(inningsPitched) ? inningsPitched : null,
            }
          : {
              H: Number.isFinite(hits) ? hits : null,
              R: Number.isFinite(runs) ? runs : null,
              RBI: Number.isFinite(rbis) ? rbis : null,
              HR: Number.isFinite(homeRuns) ? homeRuns : null,
              K: Number.isFinite(strikeouts) ? strikeouts : null,
            },
        propLines: hasAny ? propLines : undefined,
        lineQualityByStat: rowMeta.lineQualityByStat || {},
        lineSourceByStat: rowMeta.lineSourceByStat || {},
        lineSource: rowMeta.hasVerified
          ? "historical_verified"
          : rowMeta.hasEstimated || rowMeta.hasDisplayFallback
            ? "estimated_fallback"
            : "unavailable",
      };
    });
  }

  if (String(sport || "").toUpperCase() === "NHL") {
    return recentGames.map((g, idx) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      const goals = Number((stats as any).G ?? (stats as any).goals);
      const assists = Number((stats as any).A ?? (stats as any).assists);
      const points = Number((stats as any).PTS ?? (stats as any).points);
      const shots = Number((stats as any).SOG ?? (stats as any).S ?? (stats as any).shots ?? (stats as any).Shots ?? (stats as any).SA);
      const saves = Number((stats as any).SV ?? (stats as any).saves);
      const rowMeta = verifiedByRow[idx] || { lines: {}, lineQualityByStat: {}, lineSourceByStat: {}, hasVerified: false, hasEstimated: false, hasDisplayFallback: false };
      const rowLines = rowMeta.lines || {};
      const propLines = {
        goals: readRowLine(rowLines, ["goals", "goal"]),
        assists: readRowLine(rowLines, ["assists", "assist"]),
        points: readRowLine(rowLines, ["points", "point"]),
        shots: readRowLine(rowLines, ["shots", "shots_on_goal", "sog"]),
        saves: readRowLine(rowLines, ["saves", "save"]),
      };
      for (const statType of ["goals", "assists", "points", "shots", "saves"]) {
        if (!hasLineValue((propLines as any)[statType])) {
          logRowMatchFailure({
            playerId: canonicalPlayerId,
            gameId: rowGameKeys[idx] || String(g?.date || ""),
            statType,
            reason: "stat_key_unmatched",
          });
        }
      }
      const hasAny = Object.values(propLines).some((v) => hasLineValue(v));
      return {
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        stats: {
          G: Number.isFinite(goals) ? goals : null,
          A: Number.isFinite(assists) ? assists : null,
          PTS: Number.isFinite(points) ? points : null,
          SOG: Number.isFinite(shots) ? shots : null,
          SV: Number.isFinite(saves) ? saves : null,
        },
        propLines: hasAny ? propLines : undefined,
        lineQualityByStat: rowMeta.lineQualityByStat || {},
        lineSourceByStat: rowMeta.lineSourceByStat || {},
        lineSource: rowMeta.hasVerified
          ? "historical_verified"
          : rowMeta.hasEstimated || rowMeta.hasDisplayFallback
            ? "estimated_fallback"
            : "unavailable",
      };
    });
  }

  if (String(sport || "").toUpperCase() === "NFL") {
    return recentGames.map((g, idx) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      const passYards = Number((stats as any).passYards ?? (stats as any).passingYards ?? (stats as any)["PASS YDS"]);
      const rushYards = Number((stats as any).rushYards ?? (stats as any).rushingYards ?? (stats as any)["RUSH YDS"]);
      const recYards = Number((stats as any).recYards ?? (stats as any).receivingYards ?? (stats as any)["REC YDS"]);
      const receptions = Number((stats as any).receptions ?? (stats as any).REC);
      const passTd = Number((stats as any).passTd ?? (stats as any).passingTouchdowns ?? (stats as any)["PASS TD"]);
      const rowMeta = verifiedByRow[idx] || { lines: {}, lineQualityByStat: {}, lineSourceByStat: {}, hasVerified: false, hasEstimated: false, hasDisplayFallback: false };
      const rowLines = rowMeta.lines || {};
      const propLines = {
        passingYards: readRowLine(rowLines, ["passingYards", "pass_yards", "passYds"]),
        rushingYards: readRowLine(rowLines, ["rushingYards", "rush_yards", "rushYds"]),
        receivingYards: readRowLine(rowLines, ["receivingYards", "rec_yards", "receivingYds"]),
        receptions: readRowLine(rowLines, ["receptions", "rec"]),
        passTd: readRowLine(rowLines, ["passingTds", "pass_tds", "passTd"]),
      };
      const hasAny = Object.values(propLines).some((v) => hasLineValue(v));
      return {
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        stats: {
          "PASS YDS": Number.isFinite(passYards) ? passYards : null,
          "RUSH YDS": Number.isFinite(rushYards) ? rushYards : null,
          "REC YDS": Number.isFinite(recYards) ? recYards : null,
          REC: Number.isFinite(receptions) ? receptions : null,
          "PASS TD": Number.isFinite(passTd) ? passTd : null,
        },
        propLines: hasAny ? propLines : undefined,
        lineQualityByStat: rowMeta.lineQualityByStat || {},
        lineSourceByStat: rowMeta.lineSourceByStat || {},
        lineSource: rowMeta.hasVerified
          ? "historical_verified"
          : rowMeta.hasEstimated || rowMeta.hasDisplayFallback
            ? "estimated_fallback"
            : "unavailable",
      };
    });
  }

  if (String(sport || "").toUpperCase() === "SOCCER") {
    return recentGames.map((g, idx) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      const goals = Number((stats as any).G ?? (stats as any).goals);
      const assists = Number((stats as any).A ?? (stats as any).assists);
      const shots = Number((stats as any).SOG ?? (stats as any).shots ?? (stats as any).S);
      const shotsOnTarget = Number((stats as any).shotsOnTarget ?? (stats as any).SOT ?? (stats as any).sot);
      const chances = Number((stats as any).chancesCreated ?? (stats as any).CC);
      const rowMeta = verifiedByRow[idx] || { lines: {}, lineQualityByStat: {}, lineSourceByStat: {}, hasVerified: false, hasEstimated: false, hasDisplayFallback: false };
      const rowLines = rowMeta.lines || {};
      const propLines = {
        goals: readRowLine(rowLines, ["goals", "goal"]),
        assists: readRowLine(rowLines, ["assists", "assist"]),
        shots: readRowLine(rowLines, ["shots", "shot"]),
        shotsOnTarget: readRowLine(rowLines, ["shotsOnTarget", "shots_on_target", "sot"]),
      };
      const hasAny = Object.values(propLines).some((v) => hasLineValue(v));
      return {
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        stats: {
          G: Number.isFinite(goals) ? goals : null,
          A: Number.isFinite(assists) ? assists : null,
          SOG: Number.isFinite(shots) ? shots : null,
          SOT: Number.isFinite(shotsOnTarget) ? shotsOnTarget : null,
          CC: Number.isFinite(chances) ? chances : null,
        },
        propLines: hasAny ? propLines : undefined,
        lineQualityByStat: rowMeta.lineQualityByStat || {},
        lineSourceByStat: rowMeta.lineSourceByStat || {},
        lineSource: rowMeta.hasVerified
          ? "historical_verified"
          : rowMeta.hasEstimated || rowMeta.hasDisplayFallback
            ? "estimated_fallback"
            : "unavailable",
      };
    });
  }

  return recentGames.map((game, idx) => {
    const stats = game?.stats && typeof game.stats === 'object' ? game.stats : {};
    const points = Number((stats as any).points ?? (stats as any).PTS);
    const rebounds = Number((stats as any).rebounds ?? (stats as any).REB);
    const assists = Number((stats as any).assists ?? (stats as any).AST);
    const minutes = Number((stats as any).minutes ?? (stats as any).MIN);
    const rowMeta = verifiedByRow[idx] || { lines: {}, lineQualityByStat: {}, lineSourceByStat: {}, hasVerified: false, hasEstimated: false, hasDisplayFallback: false };
    const rowLines = rowMeta.lines || {};
    const propLines = {
      points: readRowLine(rowLines, ["points", "pts"]),
      rebounds: readRowLine(rowLines, ["rebounds", "reb", "trb"]),
      assists: readRowLine(rowLines, ["assists", "ast", "a"]),
    };
    for (const statType of ["points", "rebounds", "assists"]) {
      if (!hasLineValue((propLines as any)[statType])) {
        logRowMatchFailure({
          playerId: canonicalPlayerId,
          gameId: rowGameKeys[idx] || String(game?.date || ""),
          statType,
          reason: "stat_key_unmatched",
        });
      }
    }
    const hasAny = Object.values(propLines).some((v) => hasLineValue(v));
    return {
      date: game.date,
      opponent: game.opponent,
      result: game.result,
      stats: {
        PTS: Number.isFinite(points) ? points : null,
        REB: Number.isFinite(rebounds) ? rebounds : null,
        AST: Number.isFinite(assists) ? assists : null,
        MIN: Number.isFinite(minutes) ? minutes : null,
      },
      propLines: hasAny ? propLines : undefined,
      lineQualityByStat: rowMeta.lineQualityByStat || {},
      lineSourceByStat: rowMeta.lineSourceByStat || {},
      lineSource: rowMeta.hasVerified
        ? "historical_verified"
        : rowMeta.hasEstimated || rowMeta.hasDisplayFallback
          ? "estimated_fallback"
          : "unavailable",
    };
  });

  if (String(sport || "").toUpperCase() === "MLB") {
    const normalizedType = (value: unknown): string => {
      const t = String(value || "").toUpperCase();
      if (!t) return "";
      if (t.includes("HIT")) return "hits";
      if (t.includes("RUN") && !t.includes("HOME")) return "runs";
      if (t.includes("RBI")) return "rbis";
      if (t.includes("HOME") && t.includes("RUN")) return "homeRuns";
      if (t.includes("STRIKEOUT") || t === "K" || t.includes("PITCHER_STRIKEOUT")) return "strikeouts";
      return "";
    };
    const fallbackRows = Array.isArray(fallbackProps) ? fallbackProps : [];
    const latestLines: Record<string, number | null> = {
      hits: null,
      runs: null,
      rbis: null,
      homeRuns: null,
      strikeouts: null,
    };
    for (const row of fallbackRows) {
      const key = normalizedType(row?.prop_type);
      if (!key || latestLines[key] !== null) continue;
      const line = Number(row?.line_value);
      if (!Number.isFinite(line) || line <= 0) continue;
      latestLines[key] = line;
    }
    const hasAnyLine = Object.values(latestLines).some((v) => Number.isFinite(Number(v)));
    return recentGames.map((g) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      const hits = Number((stats as any).hits ?? (stats as any).H);
      const runs = Number((stats as any).runs ?? (stats as any).R);
      const rbis = Number((stats as any).rbis ?? (stats as any).rbi ?? (stats as any).RBI);
      const homeRuns = Number((stats as any).homeRuns ?? (stats as any).home_runs ?? (stats as any).hr ?? (stats as any).HR);
      const strikeouts = Number((stats as any).strikeouts ?? (stats as any).so ?? (stats as any).K);
      return {
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        stats: {
          H: Number.isFinite(hits) ? hits : null,
          R: Number.isFinite(runs) ? runs : null,
          RBI: Number.isFinite(rbis) ? rbis : null,
          HR: Number.isFinite(homeRuns) ? homeRuns : null,
          K: Number.isFinite(strikeouts) ? strikeouts : null,
        },
        propLines: hasAnyLine ? latestLines : undefined,
        lineSource: hasAnyLine ? "latest_fallback" : "unavailable",
      };
    });
  }
  if (String(sport || "").toUpperCase() === "NHL") {
    const hasFiniteLineValue = (value: unknown): boolean => {
      if (value === null || value === undefined || value === "") return false;
      const n = Number(value);
      return Number.isFinite(n) && n > 0;
    };
    const normalizedType = (value: unknown): string => {
      const t = String(value || "").toUpperCase();
      if (!t) return "";
      if (t.includes("GOAL")) return "goals";
      if (t.includes("ASSIST")) return "assists";
      if (t.includes("POINT")) return "points";
      if (t.includes("SHOT")) return "shots";
      if (t.includes("SAVE")) return "saves";
      return "";
    };
    const fallbackRows = Array.isArray(fallbackProps) ? fallbackProps : [];
    const latestLines: Record<string, number | null> = {
      goals: null,
      assists: null,
      points: null,
      shots: null,
      saves: null,
    };
    const applyNhlLine = (propTypeValue: unknown, lineValue: unknown) => {
      const key = normalizedType(propTypeValue);
      if (!key || latestLines[key] !== null) return;
      const line = Number(lineValue);
      if (!Number.isFinite(line) || line <= 0) return;
      latestLines[key] = line;
    };
    for (const row of fallbackRows) {
      applyNhlLine(row?.prop_type, row?.line_value);
    }
    const readNhlDbFallbackLines = async () => {
      const hasAny = Object.values(latestLines).some((v) => hasFiniteLineValue(v));
      if (hasAny) return;
      const normalizedNames = Array.from(
        new Set(
          (playerNames || [])
            .map((name) => String(name || "").trim().toLowerCase())
            .filter((name) => name.length >= 3)
        )
      ).slice(0, 8);
      if (normalizedNames.length === 0) return;
      try {
        const placeholders = normalizedNames.map(() => "?").join(", ");
        const currentSql = `
          SELECT UPPER(COALESCE(p.prop_type, '')) AS prop_type, p.line_value
          FROM sdio_props_current p
          JOIN sdio_games g ON g.id = p.game_id
          WHERE UPPER(COALESCE(g.sport, '')) = ?
            AND LOWER(COALESCE(p.player_name, '')) IN (${placeholders})
          ORDER BY datetime(COALESCE(p.last_updated, p.updated_at, p.created_at)) DESC
          LIMIT 200
        `;
        const currentRows = await db.prepare(currentSql)
          .bind(String(sport || "").toUpperCase(), ...normalizedNames)
          .all<{ prop_type: string; line_value: number }>();
        for (const row of currentRows.results || []) {
          applyNhlLine(row.prop_type, row.line_value);
        }
        const afterCurrent = Object.values(latestLines).some((v) => hasFiniteLineValue(v));
        if (afterCurrent) return;
        const historySql = `
          SELECT UPPER(COALESCE(h.prop_type, '')) AS prop_type, h.line_value
          FROM sdio_props_history h
          JOIN sdio_games g ON g.id = h.game_id
          WHERE UPPER(COALESCE(g.sport, '')) = ?
            AND LOWER(COALESCE(h.player_name, '')) IN (${placeholders})
          ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
          LIMIT 400
        `;
        const historyRows = await db.prepare(historySql)
          .bind(String(sport || "").toUpperCase(), ...normalizedNames)
          .all<{ prop_type: string; line_value: number }>();
        for (const row of historyRows.results || []) {
          applyNhlLine(row.prop_type, row.line_value);
        }
      } catch {
        // Non-fatal fallback path.
      }
    };
    await readNhlDbFallbackLines();
    if (!Object.values(latestLines).some((v) => hasFiniteLineValue(v))) {
      const firstRaw = String(toDisplayFirstLast(playerNames[0] || "") || "").trim().toLowerCase();
      const tokens = firstRaw.split(/\s+/).filter(Boolean);
      const firstToken = tokens[0] || "";
      const lastToken = tokens[tokens.length - 1] || "";
      if (firstToken.length >= 2 && lastToken.length >= 2) {
        try {
          const firstLike = `%${firstToken}%`;
          const lastLike = `%${lastToken}%`;
          const fuzzySql = `
            SELECT UPPER(COALESCE(h.prop_type, '')) AS prop_type, h.line_value
            FROM sdio_props_history h
            JOIN sdio_games g ON g.id = h.game_id
            WHERE UPPER(COALESCE(g.sport, '')) = ?
              AND LOWER(COALESCE(h.player_name, '')) LIKE ?
              AND LOWER(COALESCE(h.player_name, '')) LIKE ?
            ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
            LIMIT 400
          `;
          const fuzzyRows = await db.prepare(fuzzySql)
            .bind(String(sport || "").toUpperCase(), firstLike, lastLike)
            .all<{ prop_type: string; line_value: number }>();
          for (const row of fuzzyRows.results || []) {
            applyNhlLine(row.prop_type, row.line_value);
          }
        } catch {
          // Non-fatal fallback path.
        }
      }
    }
    const hasAnyLine = Object.values(latestLines).some((v) => hasFiniteLineValue(v));
    const normalizeToken = (value: unknown): string =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const normalizeWords = (value: unknown): string[] =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\\s]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);
    const toYmd = (value: unknown): string => {
      const d = new Date(String(value || ""));
      if (!Number.isFinite(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    };
    const dayDiff = (a: string, b: string): number => {
      const da = new Date(`${a}T12:00:00`);
      const db = new Date(`${b}T12:00:00`);
      if (!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return Number.POSITIVE_INFINITY;
      return Math.abs(da.getTime() - db.getTime()) / (24 * 60 * 60 * 1000);
    };
    const gameMatchedRows: Array<{
      stat: "goals" | "assists" | "points" | "shots" | "saves";
      line: number;
      date: string;
      opp: Set<string>;
    }> = [];
    try {
      const names = Array.from(
        new Set(
          (playerNames || [])
            .flatMap((name) => {
              const raw = String(name || "").trim();
              if (!raw) return [];
              return [raw, toDisplayFirstLast(raw), toDisplayLastFirst(raw)];
            })
            .map((name) => String(name || "").trim().toLowerCase())
            .filter((name) => name.length >= 3)
        )
      ).slice(0, 10);
      if (names.length > 0) {
        const placeholders = names.map(() => "?").join(", ");
        const sql = `
          SELECT
            UPPER(COALESCE(h.prop_type, '')) AS prop_type,
            h.line_value AS line_value,
            COALESCE(g.start_time, h.recorded_at, h.created_at) AS game_date,
            COALESCE(g.home_team_name, g.home_team) AS home_name,
            COALESCE(g.away_team_name, g.away_team) AS away_name
          FROM sdio_props_history h
          JOIN sdio_games g ON g.id = h.game_id
          WHERE UPPER(COALESCE(g.sport, '')) = ?
            AND LOWER(COALESCE(h.player_name, '')) IN (${placeholders})
          ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
          LIMIT 1200
        `;
        const rows = await db.prepare(sql)
          .bind(String(sport || "").toUpperCase(), ...names)
          .all<{
            prop_type: string;
            line_value: number;
            game_date: string | null;
            home_name: string | null;
            away_name: string | null;
          }>();
        for (const row of rows.results || []) {
          const stat = normalizedType(row.prop_type) as "goals" | "assists" | "points" | "shots" | "saves" | "";
          if (!stat) continue;
          const line = Number(row.line_value);
          if (!Number.isFinite(line) || line <= 0) continue;
          const opp = new Set<string>();
          for (const candidate of [row.home_name, row.away_name]) {
            const token = normalizeToken(candidate);
            if (token) opp.add(token);
            for (const word of normalizeWords(candidate)) {
              if (word.length >= 3) opp.add(normalizeToken(word));
            }
          }
          gameMatchedRows.push({
            stat,
            line,
            date: toYmd(row.game_date),
            opp,
          });
        }
      }
    } catch {
      // Non-fatal: fallback logic below remains active.
    }
    const resolveHistoricalLine = (
      game: { date: string; opponent: string },
      stat: "goals" | "assists" | "points" | "shots" | "saves"
    ): number | null => {
      if (gameMatchedRows.length === 0) return null;
      const gameDate = toYmd(game.date);
      const gameOpp = new Set<string>();
      gameOpp.add(normalizeToken(game.opponent));
      for (const w of normalizeWords(game.opponent)) {
        if (w.length >= 3) gameOpp.add(normalizeToken(w));
      }
      let best: { score: number; line: number } | null = null;
      for (const row of gameMatchedRows) {
        if (row.stat !== stat) continue;
        let score = 0;
        let dateMatch = false;
        if (gameDate && row.date) {
          const diff = dayDiff(gameDate, row.date);
          if (diff === 0) {
            score += 3;
            dateMatch = true;
          } else if (diff <= 1) {
            score += 2;
            dateMatch = true;
          }
        }
        const oppOverlap = Array.from(gameOpp).some((token) => token && row.opp.has(token));
        if (oppOverlap) score += 3;
        // Guardrail: historical line match must have opponent overlap plus close date.
        if (!oppOverlap || !dateMatch) continue;
        if (!best || score > best.score) best = { score, line: row.line };
      }
      return best && best.score >= 5 ? best.line : null;
    };
    return recentGames.map((g, idx) => {
      const stats = g?.stats && typeof g.stats === "object" ? g.stats : {};
      const goals = Number((stats as any).G ?? (stats as any).goals);
      const assists = Number((stats as any).A ?? (stats as any).assists);
      const points = Number((stats as any).PTS ?? (stats as any).points);
      const shots = Number(
        (stats as any).SOG
        ?? (stats as any).S
        ?? (stats as any).shots
        ?? (stats as any).Shots
        ?? (stats as any).SA
      );
      const saves = Number((stats as any).SV ?? (stats as any).saves);
      const historicalLines = {
        goals: resolveHistoricalLine(g, "goals"),
        assists: resolveHistoricalLine(g, "assists"),
        points: resolveHistoricalLine(g, "points"),
        shots: resolveHistoricalLine(g, "shots"),
        saves: resolveHistoricalLine(g, "saves"),
      };
      const mergedLines = {
        goals: historicalLines.goals ?? null,
        assists: historicalLines.assists ?? null,
        points: historicalLines.points ?? null,
        shots: historicalLines.shots ?? null,
        saves: historicalLines.saves ?? null,
      };
      const hasMergedLine = Object.values(mergedLines).some((v) => hasFiniteLineValue(v));
      const usedHistorical = Object.values(historicalLines).some((v) => hasFiniteLineValue(v));
      return {
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        stats: {
          G: Number.isFinite(goals) ? goals : null,
          A: Number.isFinite(assists) ? assists : null,
          PTS: Number.isFinite(points) ? points : null,
          SOG: Number.isFinite(shots) ? shots : null,
          SV: Number.isFinite(saves) ? saves : null,
        },
        propLines: hasMergedLine ? mergedLines : undefined,
        lineSource: usedHistorical ? "historical" : hasMergedLine ? "latest_fallback" : "unavailable",
      };
    });
  }

  const candidates = new Set<string>();
  for (const raw of playerNames) {
    const name = String(raw || '').trim();
    if (!name) continue;
    candidates.add(name.toLowerCase());
    candidates.add(toDisplayFirstLast(name).toLowerCase());
    candidates.add(toDisplayLastFirst(name).toLowerCase());
  }
  const candidateList = Array.from(candidates).filter(Boolean).slice(0, 8);

  type PropLineRow = {
    game_id: number;
    player_name: string;
    prop_type: string;
    line_value: number;
    recorded_at: string;
    start_time: string;
    home_team_name: string | null;
    away_team_name: string | null;
    home_team: string | null;
    away_team: string | null;
  };

  let propRows: PropLineRow[] = [];
  if (candidateList.length > 0) {
    try {
      const placeholders = candidateList.map(() => '?').join(', ');
      const sql = `
        SELECT
          h.game_id,
          h.player_name,
          UPPER(COALESCE(h.prop_type, '')) AS prop_type,
          h.line_value,
          h.recorded_at,
          g.start_time,
          g.home_team_name,
          g.away_team_name,
          g.home_team,
          g.away_team
        FROM sdio_props_history h
        JOIN sdio_games g ON g.id = h.game_id
        WHERE UPPER(COALESCE(g.sport, '')) = ?
          AND LOWER(COALESCE(h.player_name, '')) IN (${placeholders})
        ORDER BY datetime(g.start_time) DESC, datetime(h.recorded_at) DESC
        LIMIT 2000
      `;
      const result = await db.prepare(sql).bind(sport.toUpperCase(), ...candidateList).all<PropLineRow>();
      propRows = result.results || [];
    } catch {
      propRows = [];
    }
  }

  type GamePropLines = {
    start_time: string;
    home: string;
    away: string;
    lines: { points: number | null; rebounds: number | null; assists: number | null };
  };

  const latestPerGameProp = new Map<string, PropLineRow>();
  for (const row of propRows) {
    const typeRaw = String(row.prop_type || '').toUpperCase();
    const type =
      typeRaw.includes('POINT') ? 'POINTS'
      : typeRaw.includes('REBOUND') ? 'REBOUNDS'
      : typeRaw.includes('ASSIST') ? 'ASSISTS'
      : '';
    if (!type) continue;
    const key = `${row.game_id}:${type}`;
    if (!latestPerGameProp.has(key)) {
      latestPerGameProp.set(key, { ...row, prop_type: type });
    }
  }
  const linesByGame = new Map<number, GamePropLines>();
  for (const row of latestPerGameProp.values()) {
    const existing = linesByGame.get(row.game_id) || {
      start_time: row.start_time,
      home: String(row.home_team_name || row.home_team || ''),
      away: String(row.away_team_name || row.away_team || ''),
      lines: { points: null, rebounds: null, assists: null },
    };
    if (row.prop_type === 'POINTS') existing.lines.points = Number(row.line_value);
    if (row.prop_type === 'REBOUNDS') existing.lines.rebounds = Number(row.line_value);
    if (row.prop_type === 'ASSISTS') existing.lines.assists = Number(row.line_value);
    linesByGame.set(row.game_id, existing);
  }

  const matchGameLines = (game: { date: string; opponent: string }): { points: number | null; rebounds: number | null; assists: number | null } => {
    const gameTs = new Date(game.date).getTime();
    if (!Number.isFinite(gameTs) || linesByGame.size === 0) {
      return { points: null, rebounds: null, assists: null };
    }
    const oppWords = normalizeWordTokens(game.opponent);
    const oppNormalized = normalizeToken(game.opponent);
    const oppTail = oppWords.slice(-1)[0] || '';
    const oppTailToken = oppTail.length >= 4 ? normalizeToken(oppTail) : '';
    let best: { diff: number; lines: { points: number | null; rebounds: number | null; assists: number | null } } | null = null;
    for (const row of linesByGame.values()) {
      const startTs = new Date(row.start_time).getTime();
      if (!Number.isFinite(startTs)) continue;
      const diffHours = Math.abs(startTs - gameTs) / (1000 * 60 * 60);
      if (diffHours > 72) continue;
      const homeToken = normalizeToken(row.home);
      const awayToken = normalizeToken(row.away);
      const teamMatchByTail = oppTailToken
        ? (homeToken.includes(oppTailToken) || awayToken.includes(oppTailToken))
        : false;
      const teamMatchByNormalized = oppNormalized.length >= 3
        ? (
            homeToken.includes(oppNormalized)
            || awayToken.includes(oppNormalized)
            || oppNormalized.includes(homeToken)
            || oppNormalized.includes(awayToken)
          )
        : false;
      const teamMatchByWord = oppWords.some((w) => {
        const token = normalizeToken(w);
        return token.length >= 4 && (homeToken.includes(token) || awayToken.includes(token));
      });
      const teamMatch = teamMatchByTail || teamMatchByNormalized || teamMatchByWord;
      if (!teamMatch) continue;
      if (!best || diffHours < best.diff) {
        best = { diff: diffHours, lines: row.lines };
      }
    }
    // Fallback: if team labels are sparse (e.g. abbreviations only), use nearest game by time.
    if (!best) {
      for (const row of linesByGame.values()) {
        const startTs = new Date(row.start_time).getTime();
        if (!Number.isFinite(startTs)) continue;
        const diffHours = Math.abs(startTs - gameTs) / (1000 * 60 * 60);
        if (diffHours > 24) continue;
        if (!best || diffHours < best.diff) {
          best = { diff: diffHours, lines: row.lines };
        }
      }
    }
    return best?.lines || { points: null, rebounds: null, assists: null };
  };

  const normalizePlayerNameToken = (name: string): string =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const playerTokens = new Set<string>();
  for (const raw of playerNames) {
    const v = String(raw || '').trim();
    if (!v) continue;
    playerTokens.add(normalizePlayerNameToken(v));
    playerTokens.add(normalizePlayerNameToken(toDisplayFirstLast(v)));
    playerTokens.add(normalizePlayerNameToken(toDisplayLastFirst(v)));
  }

  const matchesPlayer = (candidateName: string): boolean => {
    const token = normalizePlayerNameToken(candidateName);
    if (!token) return false;
    for (const p of playerTokens) {
      if (!p) continue;
      if (token === p || token.includes(p) || p.includes(token)) return true;
    }
    return false;
  };

  const onDemandCache = new Map<string, { points: number | null; rebounds: number | null; assists: number | null } | null>();
  const onDemandDeadlineMs = Date.now() + 3000;
  const fetchOnDemandLines = async (game: { date: string; opponent: string }) => {
    const cacheKey = `${game.date}|${game.opponent}`;
    if (onDemandCache.has(cacheKey)) return onDemandCache.get(cacheKey) || null;
    if (Date.now() > onDemandDeadlineMs) {
      onDemandCache.set(cacheKey, null);
      return null;
    }
    if (!allowOnDemandFetch || !sportsRadarPropsKey) {
      onDemandCache.set(cacheKey, null);
      return null;
    }
    try {
      const opponentToken = normalizeToken(game.opponent.split(' ').slice(-1).join(' '));
      const playerTeamToken = normalizeToken(String(playerTeamName || '').split(' ').slice(-1).join(' '));
      const candidatesResult = await db.prepare(`
        SELECT provider_game_id, start_time, home_team_name, away_team_name, home_team, away_team
        FROM sdio_games
        WHERE UPPER(COALESCE(sport, '')) = ?
          AND start_time IS NOT NULL
        ORDER BY ABS(strftime('%s', start_time) - strftime('%s', ?)) ASC
        LIMIT 30
      `).bind(sport.toUpperCase(), game.date).all<{
        provider_game_id: string;
        start_time: string;
        home_team_name: string | null;
        away_team_name: string | null;
        home_team: string | null;
        away_team: string | null;
      }>();

      const candidates = (candidatesResult.results || []).filter((row) => {
        const home = normalizeToken(String(row.home_team_name || row.home_team || ''));
        const away = normalizeToken(String(row.away_team_name || row.away_team || ''));
        if (!opponentToken) return true;
        return home.includes(opponentToken) || away.includes(opponentToken);
      }).slice(0, 5);

      for (const row of candidates) {
        const gameId = String(row.provider_game_id || '').trim();
        if (!gameId) continue;
        const home = String(row.home_team_name || row.home_team || '');
        const away = String(row.away_team_name || row.away_team || '');
        const props = await fetchGamePlayerProps(gameId, sport.toLowerCase(), home, away, sportsRadarPropsKey, 'SCHEDULED');
        if (!Array.isArray(props) || props.length === 0) continue;

        const lines: { points: number | null; rebounds: number | null; assists: number | null } = {
          points: null,
          rebounds: null,
          assists: null,
        };
        for (const prop of props) {
          if (!matchesPlayer(String(prop.player_name || ''))) continue;
          const line = Number(prop.line);
          if (!Number.isFinite(line) || line <= 0) continue;
          const type = String(prop.prop_type || '').toLowerCase();
          if (lines.points === null && type.includes('point')) lines.points = line;
          if (lines.rebounds === null && type.includes('rebound')) lines.rebounds = line;
          if (lines.assists === null && type.includes('assist')) lines.assists = line;
        }
        const hasAny = [lines.points, lines.rebounds, lines.assists].some((v) => v !== null);
        if (hasAny) {
          onDemandCache.set(cacheKey, lines);
          return lines;
        }
      }

      if (Date.now() > onDemandDeadlineMs) {
        onDemandCache.set(cacheKey, null);
        return null;
      }

      // If local game mapping is sparse, resolve historical event IDs from SportsRadar by game date.
      const gameDate = new Date(game.date);
      const dateParam = Number.isFinite(gameDate.getTime())
        ? gameDate.toISOString().slice(0, 10)
        : null;
      if (dateParam) {
        // Preferred path: player-props daily schedule feed for exact date.
        const SPORT_URNS_BY_LABEL: Record<string, string> = {
          NBA: 'sr:sport:2',
          NCAAB: 'sr:sport:4',
          NFL: 'sr:sport:16',
          MLB: 'sr:sport:3',
          NHL: 'sr:sport:5',
        };
        const sportUrn = SPORT_URNS_BY_LABEL[String(sport || '').toUpperCase()];
        if (sportUrn) {
          try {
            const scheduleUrl = `https://api.sportradar.com/oddscomparison-player-props/production/v2/en/sports/${encodeURIComponent(sportUrn)}/schedules/${dateParam}/schedules.json?api_key=${sportsRadarPropsKey}`;
            const scheduleRes = await fetch(scheduleUrl, { headers: { Accept: 'application/json' } });
            if (scheduleRes.ok) {
              const scheduleData = await scheduleRes.json() as any;
              const scheduleRows = Array.isArray(scheduleData?.schedules) ? scheduleData.schedules : [];
              const eventCandidates: Array<{ gameId: string; home: string; away: string }> = [];
              for (const row of scheduleRows) {
                const event = row?.sport_event || {};
                const gameId = String(event?.id || '').trim();
                if (!gameId) continue;
                const competitors = Array.isArray(event?.competitors) ? event.competitors : [];
                const homeRow = competitors.find((c: any) => String(c?.qualifier || '').toLowerCase() === 'home') || competitors[0] || {};
                const awayRow = competitors.find((c: any) => String(c?.qualifier || '').toLowerCase() === 'away') || competitors[1] || {};
                const home = String(homeRow?.name || '').trim();
                const away = String(awayRow?.name || '').trim();
                const homeToken = normalizeToken(home.split(' ').slice(-1).join(' '));
                const awayToken = normalizeToken(away.split(' ').slice(-1).join(' '));
                const matchesOpponent = opponentToken
                  ? (homeToken.includes(opponentToken) || awayToken.includes(opponentToken))
                  : true;
                const matchesPlayerTeam = playerTeamToken
                  ? (homeToken.includes(playerTeamToken) || awayToken.includes(playerTeamToken))
                  : true;
                if (!matchesOpponent || !matchesPlayerTeam) continue;
                eventCandidates.push({ gameId, home, away });
                if (eventCandidates.length >= 8) break;
              }

              for (const event of eventCandidates) {
                let props = await fetchGamePlayerProps(
                  event.gameId,
                  sport.toLowerCase(),
                  event.home,
                  event.away,
                  sportsRadarPropsKey,
                  'SCHEDULED'
                );
                if (!Array.isArray(props) || props.length === 0) {
                  props = await fetchGamePlayerProps(
                    event.gameId,
                    sport.toLowerCase(),
                    event.home,
                    event.away,
                    sportsRadarPropsKey,
                    'IN_PROGRESS'
                  );
                }
                if (!Array.isArray(props) || props.length === 0) continue;
                const lines = { points: null as number | null, rebounds: null as number | null, assists: null as number | null };
                for (const prop of props) {
                  if (!matchesPlayer(String(prop.player_name || ''))) continue;
                  const line = Number(prop.line);
                  if (!Number.isFinite(line) || line <= 0) continue;
                  const type = String(prop.prop_type || '').toLowerCase();
                  if (lines.points === null && type.includes('point')) lines.points = line;
                  if (lines.rebounds === null && type.includes('rebound')) lines.rebounds = line;
                  if (lines.assists === null && type.includes('assist')) lines.assists = line;
                }
                const hasAny = [lines.points, lines.rebounds, lines.assists].some((v) => v !== null);
                if (hasAny) {
                  onDemandCache.set(cacheKey, lines);
                  return lines;
                }
              }
            }
          } catch {
            // fall through to odds-map strategy
          }
        }

        if (Date.now() > onDemandDeadlineMs) {
          onDemandCache.set(cacheKey, null);
          return null;
        }

        // Secondary path: resolve from odds map by date.
        const oddsMap = await fetchSportsRadarOdds(
          sport.toLowerCase(),
          sportsRadarPropsKey,
          db,
          dateParam
        );
        const seenEventIds = new Set<string>();
        const eventCandidates: Array<{ gameId: string; home: string; away: string }> = [];
        for (const odds of oddsMap.values()) {
          const gameId = String((odds as any)?.gameId || '').trim();
          if (!gameId || !gameId.startsWith('sr:sport_event:') || seenEventIds.has(gameId)) continue;
          seenEventIds.add(gameId);
          const home = String((odds as any)?.homeTeam || '');
          const away = String((odds as any)?.awayTeam || '');
          const homeToken = normalizeToken(home.split(' ').slice(-1).join(' '));
          const awayToken = normalizeToken(away.split(' ').slice(-1).join(' '));
          const matchesOpponent = opponentToken
            ? (homeToken.includes(opponentToken) || awayToken.includes(opponentToken))
            : true;
          const matchesPlayerTeam = playerTeamToken
            ? (homeToken.includes(playerTeamToken) || awayToken.includes(playerTeamToken))
            : true;
          if (!matchesOpponent || !matchesPlayerTeam) continue;
          eventCandidates.push({ gameId, home, away });
          if (eventCandidates.length >= 8) break;
        }

        for (const event of eventCandidates) {
          let props = await fetchGamePlayerProps(
            event.gameId,
            sport.toLowerCase(),
            event.home,
            event.away,
            sportsRadarPropsKey,
            'SCHEDULED'
          );
          if (!Array.isArray(props) || props.length === 0) {
            props = await fetchGamePlayerProps(
              event.gameId,
              sport.toLowerCase(),
              event.home,
              event.away,
              sportsRadarPropsKey,
              'IN_PROGRESS'
            );
          }
          if (!Array.isArray(props) || props.length === 0) continue;
          const lines = { points: null as number | null, rebounds: null as number | null, assists: null as number | null };
          for (const prop of props) {
            if (!matchesPlayer(String(prop.player_name || ''))) continue;
            const line = Number(prop.line);
            if (!Number.isFinite(line) || line <= 0) continue;
            const type = String(prop.prop_type || '').toLowerCase();
            if (lines.points === null && type.includes('point')) lines.points = line;
            if (lines.rebounds === null && type.includes('rebound')) lines.rebounds = line;
            if (lines.assists === null && type.includes('assist')) lines.assists = line;
          }
          const hasAny = [lines.points, lines.rebounds, lines.assists].some((v) => v !== null);
          if (hasAny) {
            onDemandCache.set(cacheKey, lines);
            return lines;
          }
        }
      }
    } catch {
      // swallow and fallback to null
    }
    onDemandCache.set(cacheKey, null);
    return null;
  };

  const fallbackLatestLines = (() => {
    const rows = Array.isArray(fallbackProps) ? fallbackProps : [];
    let points: number | null = null;
    let rebounds: number | null = null;
    let assists: number | null = null;
    for (const row of rows) {
      const propType = String(row?.prop_type || '').toUpperCase();
      const line = Number(row?.line_value);
      if (!Number.isFinite(line) || line <= 0) continue;
      if (points === null && (propType === 'POINTS' || propType.includes('POINT'))) points = line;
      if (rebounds === null && (propType === 'REBOUNDS' || propType.includes('REBOUND'))) rebounds = line;
      if (assists === null && (propType === 'ASSISTS' || propType.includes('ASSIST'))) assists = line;
    }
    const hasAny = [points, rebounds, assists].some((v) => v !== null);
    return hasAny ? { points, rebounds, assists } : null;
  })();

  const extractLinesFromRows = (rows: Array<{ prop_type: string; line_value: number }>) => {
    const lines = { points: null as number | null, rebounds: null as number | null, assists: null as number | null };
    for (const row of rows || []) {
      const type = String(row.prop_type || '');
      const line = Number(row.line_value);
      if (!Number.isFinite(line) || line <= 0) continue;
      if (lines.points === null && (type === 'POINTS' || type.includes('POINT'))) lines.points = line;
      if (lines.rebounds === null && (type === 'REBOUNDS' || type.includes('REBOUND'))) lines.rebounds = line;
      if (lines.assists === null && (type === 'ASSISTS' || type.includes('ASSIST'))) lines.assists = line;
    }
    const hasAny = [lines.points, lines.rebounds, lines.assists].some((v) => v !== null);
    return hasAny ? lines : null;
  };
  const roundHalf = (value: number): number => Math.round(value * 2) / 2;
  const hasAnyLine = (lines: { points: number | null; rebounds: number | null; assists: number | null } | null | undefined): boolean =>
    Boolean(lines && [lines.points, lines.rebounds, lines.assists].some((v) => v !== null));
  const estimatedFallbackLines = (() => {
    const sortedGames = [...(gameLog || [])]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
    const collect = (keys: string[]): number[] =>
      sortedGames
        .map((g) => {
          for (const key of keys) {
            const n = Number((g.stats as any)?.[key]);
            if (Number.isFinite(n)) return n;
          }
          return NaN;
        })
        .filter((n) => Number.isFinite(n));
    const pts = collect(['PTS', 'Points']);
    const reb = collect(['REB', 'Rebounds', 'TRB']);
    const ast = collect(['AST', 'Assists']);
    if (pts.length < 2 && reb.length < 2 && ast.length < 2) return null;
    const avg = (arr: number[]) => (arr.length === 0 ? null : roundHalf(arr.reduce((sum, n) => sum + n, 0) / arr.length));
    return {
      points: avg(pts),
      rebounds: avg(reb),
      assists: avg(ast),
    };
  })();

  const fuzzyNameLineFallback = async (): Promise<{ points: number | null; rebounds: number | null; assists: number | null } | null> => {
    const firstRaw = String(toDisplayFirstLast(playerNames[0] || '') || '').trim();
    const words = normalizeWordTokens(firstRaw);
    const firstToken = words[0] || '';
    const lastToken = words[words.length - 1] || '';
    if (firstToken.length < 2 || lastToken.length < 2) return null;
    try {
      const firstLike = `%${firstToken}%`;
      const lastLike = `%${lastToken}%`;
      const currentSql = `
        SELECT UPPER(COALESCE(p.prop_type, '')) AS prop_type, p.line_value
        FROM sdio_props_current p
        JOIN sdio_games g ON g.id = p.game_id
        WHERE UPPER(COALESCE(g.sport, '')) = ?
          AND LOWER(COALESCE(p.player_name, '')) LIKE ?
          AND LOWER(COALESCE(p.player_name, '')) LIKE ?
        ORDER BY datetime(COALESCE(p.last_updated, p.updated_at, p.created_at)) DESC
        LIMIT 200
      `;
      const currentRows = await db.prepare(currentSql)
        .bind(sport.toUpperCase(), firstLike, lastLike)
        .all<{ prop_type: string; line_value: number }>();
      const fromCurrent = extractLinesFromRows(currentRows.results || []);
      if (fromCurrent) return fromCurrent;
      const currentNoJoinSql = `
        SELECT UPPER(COALESCE(p.prop_type, '')) AS prop_type, p.line_value
        FROM sdio_props_current p
        WHERE LOWER(COALESCE(p.player_name, '')) LIKE ?
          AND LOWER(COALESCE(p.player_name, '')) LIKE ?
        ORDER BY datetime(COALESCE(p.last_updated, p.updated_at, p.created_at)) DESC
        LIMIT 200
      `;
      const currentNoJoinRows = await db.prepare(currentNoJoinSql)
        .bind(firstLike, lastLike)
        .all<{ prop_type: string; line_value: number }>();
      const fromCurrentNoJoin = extractLinesFromRows(currentNoJoinRows.results || []);
      if (fromCurrentNoJoin) return fromCurrentNoJoin;

      const historySql = `
        SELECT UPPER(COALESCE(h.prop_type, '')) AS prop_type, h.line_value
        FROM sdio_props_history h
        JOIN sdio_games g ON g.id = h.game_id
        WHERE UPPER(COALESCE(g.sport, '')) = ?
          AND LOWER(COALESCE(h.player_name, '')) LIKE ?
          AND LOWER(COALESCE(h.player_name, '')) LIKE ?
        ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
        LIMIT 400
      `;
      const historyRows = await db.prepare(historySql)
        .bind(sport.toUpperCase(), firstLike, lastLike)
        .all<{ prop_type: string; line_value: number }>();
      const fromHistory = extractLinesFromRows(historyRows.results || []);
      if (fromHistory) return fromHistory;
      const historyNoJoinSql = `
        SELECT UPPER(COALESCE(h.prop_type, '')) AS prop_type, h.line_value
        FROM sdio_props_history h
        WHERE LOWER(COALESCE(h.player_name, '')) LIKE ?
          AND LOWER(COALESCE(h.player_name, '')) LIKE ?
        ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
        LIMIT 400
      `;
      const historyNoJoinRows = await db.prepare(historyNoJoinSql)
        .bind(firstLike, lastLike)
        .all<{ prop_type: string; line_value: number }>();
      return extractLinesFromRows(historyNoJoinRows.results || []);
    } catch {
      return null;
    }
  };

  const fallbackCurrentLines = async (): Promise<{ points: number | null; rebounds: number | null; assists: number | null } | null> => {
    if (fallbackLatestLines) return fallbackLatestLines;
    if (candidateList.length === 0) return null;
    try {
      const placeholders = candidateList.map(() => '?').join(', ');
      const sql = `
        SELECT UPPER(COALESCE(p.prop_type, '')) AS prop_type, p.line_value
        FROM sdio_props_current p
        JOIN sdio_games g ON g.id = p.game_id
        WHERE UPPER(COALESCE(g.sport, '')) = ?
          AND LOWER(COALESCE(p.player_name, '')) IN (${placeholders})
        ORDER BY datetime(COALESCE(p.last_updated, p.updated_at, p.created_at)) DESC
        LIMIT 100
      `;
      const result = await db.prepare(sql).bind(sport.toUpperCase(), ...candidateList).all<{ prop_type: string; line_value: number }>();
      const fromJoined = extractLinesFromRows(result.results || []);
      if (fromJoined) return fromJoined;
      const noJoinSql = `
        SELECT UPPER(COALESCE(p.prop_type, '')) AS prop_type, p.line_value
        FROM sdio_props_current p
        WHERE LOWER(COALESCE(p.player_name, '')) IN (${placeholders})
        ORDER BY datetime(COALESCE(p.last_updated, p.updated_at, p.created_at)) DESC
        LIMIT 200
      `;
      const noJoinResult = await db.prepare(noJoinSql).bind(...candidateList).all<{ prop_type: string; line_value: number }>();
      return extractLinesFromRows(noJoinResult.results || []);
    } catch {
      return null;
    }
  };
  const currentLinesFallback = await fallbackCurrentLines();
  const historyLinesFallback = async (): Promise<{ points: number | null; rebounds: number | null; assists: number | null } | null> => {
    if (candidateList.length === 0) return null;
    try {
      const placeholders = candidateList.map(() => '?').join(', ');
      const sql = `
        SELECT UPPER(COALESCE(h.prop_type, '')) AS prop_type, h.line_value
        FROM sdio_props_history h
        JOIN sdio_games g ON g.id = h.game_id
        WHERE UPPER(COALESCE(g.sport, '')) = ?
          AND LOWER(COALESCE(h.player_name, '')) IN (${placeholders})
        ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
        LIMIT 300
      `;
      const result = await db.prepare(sql).bind(sport.toUpperCase(), ...candidateList).all<{ prop_type: string; line_value: number }>();
      const fromJoined = extractLinesFromRows(result.results || []);
      if (fromJoined) return fromJoined;
      const noJoinSql = `
        SELECT UPPER(COALESCE(h.prop_type, '')) AS prop_type, h.line_value
        FROM sdio_props_history h
        WHERE LOWER(COALESCE(h.player_name, '')) IN (${placeholders})
        ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
        LIMIT 400
      `;
      const noJoinResult = await db.prepare(noJoinSql).bind(...candidateList).all<{ prop_type: string; line_value: number }>();
      return extractLinesFromRows(noJoinResult.results || []);
    } catch {
      return null;
    }
  };
  const playerHistoryFallback = await historyLinesFallback();
  const fuzzyFallback = await fuzzyNameLineFallback();
  const universalFallback = currentLinesFallback || playerHistoryFallback || fuzzyFallback || estimatedFallbackLines;
  const universalFallbackSource: RecentPerformanceWithOdds['lineSource'] =
    hasAnyLine(currentLinesFallback) || hasAnyLine(playerHistoryFallback) || hasAnyLine(fuzzyFallback)
      ? 'latest_fallback'
      : (hasAnyLine(estimatedFallbackLines) ? 'estimated_fallback' : 'unavailable');

  const out: RecentPerformanceWithOdds[] = [];
  let carryForwardLines = universalFallback;
  for (let idx = 0; idx < recentGames.length; idx += 1) {
    const g = recentGames[idx];
    const pts = Number(g.stats.PTS ?? g.stats.Points);
    const reb = Number(g.stats.REB ?? g.stats.Rebounds ?? g.stats.TRB);
    const ast = Number(g.stats.AST ?? g.stats.Assists);
    const min = Number(g.stats.MIN ?? g.stats.Minutes);
    const matchedLines = matchGameLines(g);
    let candidateLines = ([matchedLines.points, matchedLines.rebounds, matchedLines.assists].some((v) => v !== null))
      ? matchedLines
      : universalFallback;
    let lineSource: RecentPerformanceWithOdds['lineSource'] =
      ([matchedLines.points, matchedLines.rebounds, matchedLines.assists].some((v) => v !== null))
        ? 'historical'
        : universalFallbackSource;
    if (!candidateLines && allowOnDemandFetch) {
      const onDemand = await fetchOnDemandLines(g);
      if (onDemand) {
        candidateLines = onDemand;
        lineSource = 'event_fallback';
      }
    }
    if (!candidateLines && carryForwardLines) {
      candidateLines = carryForwardLines;
      lineSource = universalFallbackSource;
    }
    if (candidateLines) {
      carryForwardLines = candidateLines;
    }
    out.push({
      date: g.date,
      opponent: g.opponent,
      result: g.result,
      stats: {
        PTS: Number.isFinite(pts) ? pts : null,
        REB: Number.isFinite(reb) ? reb : null,
        AST: Number.isFinite(ast) ? ast : null,
        MIN: Number.isFinite(min) ? min : null,
      },
      propLines: candidateLines || undefined,
      lineSource: candidateLines ? lineSource : 'unavailable',
    });
  }
  return out;
}

function statNum(game: { stats?: Record<string, unknown> }, keys: string[]): number | null {
  for (const key of keys) {
    const raw = game?.stats?.[key];
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildPlayerVsOpponentData(
  sport: string,
  gameLog: Array<{ date: string; opponent: string; result: 'W' | 'L' | 'T'; stats: Record<string, string | number> }>,
  matchup: MatchupData | null,
  currentProps: any[]
): PlayerVsOpponentData | null {
  if (sport !== 'NBA' || !Array.isArray(gameLog) || gameLog.length === 0 || !matchup?.opponent) {
    return null;
  }

  const oppAbbr = String(matchup.opponent.abbr || '').trim();
  const oppName = String(matchup.opponent.name || '').trim();
  const oppAbbrTokens = expandNbaAliasCandidates(oppAbbr).map((code) => normalizeToken(code)).filter(Boolean);
  const oppNameTail = oppName.split(' ').slice(-1).join(' ').trim();
  const oppNormalized = normalizeToken(oppName);
  const oppTailNormalized = normalizeToken(oppNameTail);
  const oppWordTokens = normalizeWordTokens(oppName).filter((w) => w.length >= 4);
  const oppMatchTokens = new Set<string>([oppNormalized, oppTailNormalized, ...oppWordTokens, ...oppAbbrTokens].filter(Boolean));

  const vsGames = [...gameLog]
    .filter((g) => {
      const gameOppRaw = String(g.opponent || '');
      const gameOpp = normalizeToken(gameOppRaw);
      if (!gameOpp) return false;
      if (oppAbbrTokens.some((abbr) => abbr === gameOpp)) {
        return true;
      }
      if (oppNormalized && (gameOpp === oppNormalized || gameOpp.includes(oppNormalized) || oppNormalized.includes(gameOpp))) {
        return true;
      }
      if (oppTailNormalized && oppTailNormalized.length >= 4 && gameOpp.includes(oppTailNormalized)) {
        return true;
      }
      const gameWords = normalizeWordTokens(gameOppRaw);
      if (oppWordTokens.some((token) => gameWords.includes(token))) {
        return true;
      }
      const gameTokens = new Set<string>([gameOpp, ...gameWords.map((w) => normalizeToken(w))].filter(Boolean));
      for (const token of gameTokens) {
        if (oppMatchTokens.has(token)) return true;
      }
      return false;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  if (vsGames.length === 0) {
    return null;
  }

  const statMap: Record<string, string[]> = {
    PTS: ['PTS', 'Points'],
    REB: ['REB', 'Rebounds', 'TRB'],
    AST: ['AST', 'Assists'],
    STL: ['STL', 'Steals'],
    BLK: ['BLK', 'Blocks'],
    '3PM': ['3PM', '3PT', 'FG3M'],
  };
  const propMap: Record<string, string[]> = {
    POINTS: statMap.PTS,
    REBOUNDS: statMap.REB,
    ASSISTS: statMap.AST,
    STEALS: statMap.STL,
    BLOCKS: statMap.BLK,
    THREES: statMap['3PM'],
  };

  let wins = 0;
  let losses = 0;
  for (const g of vsGames) {
    if (g.result === 'W') wins += 1;
    if (g.result === 'L') losses += 1;
  }

  const averages: Record<string, number> = {};
  for (const [label, keys] of Object.entries(statMap)) {
    const values = vsGames.map((g) => statNum(g, keys)).filter((n): n is number => n !== null);
    if (values.length > 0) {
      averages[label] = Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(1));
    }
  }

  const props: OpponentPropCoverage[] = [];
  for (const row of Array.isArray(currentProps) ? currentProps : []) {
    const propType = String(row?.prop_type || '').trim().toUpperCase();
    const line = Number(row?.line_value);
    if (!propType || !Number.isFinite(line) || line <= 0) continue;
    const keys = propMap[propType];
    if (!keys) continue;
    let hits = 0;
    let total = 0;
    for (const g of vsGames) {
      const value = statNum(g, keys);
      if (value === null) continue;
      total += 1;
      if (value > line) hits += 1;
    }
    if (total > 0) {
      props.push({
        propType,
        line,
        hits,
        total,
        rate: Number((hits / total).toFixed(3)),
      });
    }
  }

  const recent = vsGames.slice(0, 5).map((g) => {
    const stats: Record<string, number> = {};
    for (const [label, keys] of Object.entries(statMap)) {
      const value = statNum(g, keys);
      if (value !== null) stats[label] = value;
    }
    return {
      date: g.date,
      opponent: g.opponent,
      result: g.result,
      stats,
    };
  });

  return {
    opponent: {
      name: oppName,
      abbr: oppAbbr,
    },
    sampleSize: vsGames.length,
    wins,
    losses,
    averages,
    props,
    recent,
  };
}

// Fetch upcoming game matchup for a player's team
async function fetchMatchupData(
  teamAbbr: string,
  sport: string,
  _position?: string
): Promise<MatchupData | null> {
  try {
    if (!teamAbbr) return null;
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return null;

    // Get team schedule to find next game
    const scheduleUrl = `${ESPN_API_BASE}/${sportPath}/teams/${teamAbbr.toLowerCase()}/schedule`;
    const schedRes = await fetch(scheduleUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!schedRes.ok) return null;
    const schedData = await schedRes.json() as any;
    
    // Find upcoming games
    const events = Array.isArray(schedData.events) ? schedData.events : [];
    const now = new Date();
    const upcomingEvents = events
      .filter((e: any) => {
        const gameDate = new Date(e?.date || 0);
        return Number.isFinite(gameDate.getTime()) && gameDate > now;
      })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const nextGame = upcomingEvents[0];
    
    if (!nextGame) return null;
    
    const resolveTeamLogo = (team: any): string | undefined => {
      if (!team) return undefined;
      const directLogo = typeof team.logo === 'string' ? team.logo : null;
      if (directLogo) return directLogo;
      const logoHref = typeof team.logo?.href === 'string' ? team.logo.href : null;
      if (logoHref) return logoHref;
      if (Array.isArray(team.logos)) {
        const first = team.logos.find((row: any) => typeof row?.href === 'string');
        if (first?.href) return String(first.href);
      }
      return undefined;
    };

    const resolveOpponentFromEvent = (eventRow: any) => {
      const competitions = eventRow?.competitions || [];
      const comp = competitions[0];
      if (!comp) return null;
      const homeTeam = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const awayTeam = comp.competitors?.find((c: any) => c.homeAway === 'away');
      const isHome = homeTeam?.team?.abbreviation?.toLowerCase() === teamAbbr.toLowerCase();
      const opponent = isHome ? awayTeam : homeTeam;
      if (!opponent?.team) return null;
      return {
        name: opponent.team.displayName || opponent.team.name || 'Unknown',
        abbr: opponent.team.abbreviation || '',
        logo: resolveTeamLogo(opponent.team),
        gameTime: eventRow?.date,
        venue: comp.venue?.fullName,
      };
    };

    const upcomingOpponents = upcomingEvents
      .map((e: any) => resolveOpponentFromEvent(e))
      .filter((row): row is NonNullable<ReturnType<typeof resolveOpponentFromEvent>> => Boolean(row))
      .slice(0, 6);

    const primaryOpponent = resolveOpponentFromEvent(nextGame);
    if (!primaryOpponent) return null;
    
    // Fetch opponent team stats for defensive rankings
    let defensiveRankings: MatchupData['defensiveRankings'];
    try {
      const oppStatsUrl = `${ESPN_API_BASE}/${sportPath}/teams/${primaryOpponent.abbr.toLowerCase()}/statistics`;
      const oppStatsRes = await fetch(oppStatsUrl, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (oppStatsRes.ok) {
        const oppStats = await oppStatsRes.json() as any;
        
        // Parse defensive stats based on sport
        const stats = oppStats.stats || oppStats.statistics || [];
        let ptsAllowed: number | undefined;
        let defRank: number | undefined;
        
        for (const stat of stats) {
          const cats = stat.stats || stat.categories || [];
          for (const cat of cats) {
            if (cat.name === 'pointsAgainstPerGame' || cat.displayName === 'Opp PPG') {
              ptsAllowed = parseFloat(cat.value);
              defRank = cat.rank || cat.rankDisplayValue;
            }
          }
        }
        
        defensiveRankings = {
          overall: defRank,
          ptsAllowed: ptsAllowed,
        };
      }
    } catch {
      // Defensive stats not available
    }
    
    return {
      opponent: {
        name: primaryOpponent.name,
        abbr: primaryOpponent.abbr,
        logo: primaryOpponent.logo,
      },
      upcomingOpponents,
      gameTime: primaryOpponent.gameTime,
      venue: primaryOpponent.venue,
      defensiveRankings,
    };
  } catch (err) {
    console.error('Matchup fetch error:', err);
    return null;
  }
}

function buildFallbackMatchupFromGameLog(
  gameLog: Array<{ date: string; opponent: string }>,
  sport: string
): MatchupData | null {
  if (!Array.isArray(gameLog) || gameLog.length === 0) return null;
  const latest = gameLog
    .filter((g) => g && g.opponent)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  if (!latest?.opponent) return null;
  const opponentName = String(latest.opponent).trim();
  const abbr = resolveOpponentAbbrFromName(opponentName, sport);
  const logo = (sport === 'NBA' || sport === 'NCAAB') && abbr
    ? `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/${abbr.toLowerCase()}.png`
    : undefined;
  return {
    opponent: {
      name: opponentName,
      abbr,
      logo,
    },
    upcomingOpponents: abbr ? [{
      name: opponentName,
      abbr,
      logo,
      gameTime: undefined,
      venue: undefined,
    }] : undefined,
    gameTime: undefined,
    venue: undefined,
    defensiveRankings: undefined,
  };
}

// Fetch player injury status from ESPN
async function fetchPlayerHealth(
  espnId: string,
  sport: string,
  gameLog?: Array<{ stats: Record<string, any> }>
): Promise<HealthData> {
  // Calculate minutes trend from game log
  let minutesTrend: HealthData['minutesTrend'] = {
    last5Avg: 0,
    seasonAvg: 0,
    trend: 'stable',
    last5: [],
  };
  
  if (gameLog && gameLog.length > 0) {
    const minutesValues: number[] = [];
    
    for (const game of gameLog.slice(0, 10)) {
      const mins = game.stats['MIN'] || game.stats['Minutes'] || game.stats['minutes'];
      if (mins !== undefined) {
        const minVal = typeof mins === 'number' ? mins : parseFloat(String(mins).replace(':', '.'));
        if (!isNaN(minVal)) {
          minutesValues.push(minVal);
        }
      }
    }
    
    if (minutesValues.length > 0) {
      const last5 = minutesValues.slice(0, 5);
      const last5Avg = last5.reduce((a, b) => a + b, 0) / last5.length;
      const seasonAvg = minutesValues.reduce((a, b) => a + b, 0) / minutesValues.length;
      
      // Determine trend
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (last5.length >= 3) {
        const recent = (last5[0] + last5[1]) / 2;
        const older = (last5[last5.length - 2] + last5[last5.length - 1]) / 2;
        if (recent > older * 1.1) trend = 'up';
        else if (recent < older * 0.9) trend = 'down';
      }
      
      minutesTrend = { last5Avg, seasonAvg, trend, last5 };
    }
  }
  
  // Try to fetch injury status from ESPN
  try {
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) {
      return { status: 'unknown', minutesTrend };
    }
    
    // ESPN injuries endpoint
    const injuryUrl = `${ESPN_API_BASE}/${sportPath}/injuries`;
    const injRes = await fetch(injuryUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (injRes.ok) {
      const injData = await injRes.json() as any;
      const injuries = injData.injuries || [];
      
      // Search for this player in injury report
      for (const teamInjury of injuries) {
        for (const player of teamInjury.injuries || []) {
          if (player.athlete?.id === espnId) {
            const status = player.status?.toLowerCase() || 'unknown';
            let healthStatus: HealthData['status'] = 'unknown';
            
            if (status.includes('out')) healthStatus = 'out';
            else if (status.includes('doubtful')) healthStatus = 'doubtful';
            else if (status.includes('questionable')) healthStatus = 'questionable';
            else if (status.includes('ir') || status.includes('injured reserve')) healthStatus = 'injury_reserve';
            
            return {
              status: healthStatus,
              injury: player.details?.type || player.description,
              injuryDate: player.date,
              expectedReturn: player.details?.returnDate,
              minutesTrend,
            };
          }
        }
      }
    }
  } catch {
    // Injury data not available
  }
  
  return { status: 'healthy', minutesTrend };
}

// ============================================
// SPORTSRADAR PLAYER PROPS API
// ============================================

// Competition ID mapping for SportsRadar Player Props (oddscomparison-player-props product).
// These IDs are specific to the Odds Comparison product family and differ from the
// Sports Data API. Verified 2026-03-20.
const SR_COMPETITION_IDS: Record<string, string[]> = {
  'NBA': ['sr:competition:132'],
  'NFL': ['sr:competition:31'],
  'MLB': ['sr:competition:109'],
  'NHL': ['sr:competition:234'],
  'NCAAB': [
    'sr:competition:28370',  // NCAA Div I Championship (March Madness)
    'sr:competition:648',    // NCAA Regular Season
    'sr:competition:24135',  // NIT
  ],
  'NCAAF': [
    'sr:competition:27653',  // NCAA Regular Season
    'sr:competition:27625',  // NCAA FBS Post Season
  ],
};

interface PlayerProp {
  type: string;
  line: number;
  overOdds: number;
  underOdds: number;
  sportsbook: string;
}

async function fetchPlayerPropsFromSportsRadar(
  playerName: string,
  sport: string,
  apiKey: string | undefined
): Promise<PlayerProp[]> {
  if (!apiKey) {
    console.log('[SportsRadar Props] No API key provided');
    return [];
  }
  
  const competitionIds = SR_COMPETITION_IDS[sport];
  if (!competitionIds || competitionIds.length === 0) {
    console.log(`[SportsRadar Props] Unknown sport: ${sport}`);
    return [];
  }
  
  try {
    const props: PlayerProp[] = [];
    const normalizeNameToken = (value: string): string =>
      String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const playerLower = playerName.toLowerCase();
    const targetNameTokens = new Set<string>([
      normalizeNameToken(playerName),
      normalizeNameToken(toDisplayFirstLast(playerName)),
      normalizeNameToken(toDisplayLastFirst(playerName)),
    ].filter(Boolean));
    const namesLikelyMatch = (candidateName: string): boolean => {
      const normalizedCandidate = normalizeNameToken(candidateName);
      if (!normalizedCandidate) return false;
      for (const token of targetNameTokens) {
        if (!token) continue;
        if (
          normalizedCandidate === token
          || normalizedCandidate.includes(token)
          || token.includes(normalizedCandidate)
        ) {
          return true;
        }
      }
      return false;
    };

    // Try each competition ID until we find props for this player.
    for (const competitionId of competitionIds) {
      const url = `https://api.sportradar.com/oddscomparison-player-props/production/v2/en/competitions/${encodeURIComponent(competitionId)}/players_props.json?api_key=${apiKey}`;
      
      console.log(`[SportsRadar Props] Fetching props for ${playerName} in ${sport} (${competitionId})`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        console.log(`[SportsRadar Props] API error ${response.status} for ${competitionId}`);
        continue;
      }
      
      const data = await response.json() as any;
    
    // Parse player props from response.
    // Primary schema: competition_sport_events_players_props[].players_props[].
    const competitionEvents = data.competition_sport_events_players_props || [];
    for (const event of competitionEvents) {
      const playersProps = event.players_props || [];
      for (const row of playersProps) {
        const rowPlayerName = String(row?.player?.name || row?.name || '').trim();
        if (!rowPlayerName) continue;
        if (!namesLikelyMatch(rowPlayerName) && !rowPlayerName.toLowerCase().includes(playerLower)) continue;
        const markets = row.markets || [];
        for (const market of markets) {
          const marketName = market.name || '';
          const propType = mapSportsRadarPropType(marketName);
          if (!propType) continue;
          const book = (market.books || [])
            .filter((candidate: any) => Array.isArray(candidate?.outcomes) && candidate.outcomes.length > 0)
            .sort((a: any, b: any) => (b.outcomes?.length || 0) - (a.outcomes?.length || 0))[0];
          if (!book) continue;
          const outcomes = book.outcomes || [];
          const overOutcome = outcomes.find((o: any) => (o.type || '').toLowerCase().includes('over'));
          const underOutcome = outcomes.find((o: any) => (o.type || '').toLowerCase().includes('under'));
          const lineValue = overOutcome?.line ?? underOutcome?.line ?? overOutcome?.total ?? underOutcome?.total;
          if (lineValue === undefined || lineValue === null) continue;
          props.push({
            type: propType,
            line: Number(lineValue) || 0,
            overOdds: overOutcome?.odds ? decimalToAmerican(overOutcome.odds) : -110,
            underOdds: underOutcome?.odds ? decimalToAmerican(underOutcome.odds) : -110,
            sportsbook: book.name || 'SportsRadar',
          });
        }
      }
    }

      // Legacy schema fallback: sport_events[].markets[] with player name embedded in outcome names.
      const legacyEvents = data.sport_events || [];
      for (const event of legacyEvents) {
        const markets = event.markets || [];
        for (const market of markets) {
          const books = market.books || [];
          if (books.length === 0) continue;
          const book = books
            .filter((candidate: any) => Array.isArray(candidate?.outcomes) && candidate.outcomes.length > 0)
            .sort((a: any, b: any) => (b.outcomes?.length || 0) - (a.outcomes?.length || 0))[0];
          if (!book) continue;
          const outcomes = book.outcomes || [];
          const overOutcome = outcomes.find((o: any) =>
            (o.name || '').toLowerCase().includes(playerLower) && (o.type || '').toLowerCase() === 'over'
          );
          const underOutcome = outcomes.find((o: any) =>
            (o.name || '').toLowerCase().includes(playerLower) && (o.type || '').toLowerCase() === 'under'
          );
          if (!overOutcome && !underOutcome) continue;
          const marketName = market.name || '';
          const propType = mapSportsRadarPropType(marketName);
          if (!propType) continue;
          const lineValue = overOutcome?.line ?? underOutcome?.line;
          if (lineValue === undefined || lineValue === null) continue;
          props.push({
            type: propType,
            line: Number(lineValue) || 0,
            overOdds: overOutcome?.odds ? decimalToAmerican(overOutcome.odds) : -110,
            underOdds: underOutcome?.odds ? decimalToAmerican(underOutcome.odds) : -110,
            sportsbook: book.name || 'SportsRadar',
          });
        }
      }

      // If we found props in this competition, stop searching others.
      if (props.length > 0) break;
    } // end competitionIds loop
    
    console.log(`[SportsRadar Props] Found ${props.length} props for ${playerName}`);
    return props;
    
  } catch (err) {
    console.error('[SportsRadar Props] Error:', err);
    return [];
  }
}

function mapSportsRadarPropType(marketName: string): string | null {
  const lower = marketName.toLowerCase();
  
  // NBA/NCAAB
  if (lower.includes('point') && !lower.includes('spread')) return 'Points';
  if (lower.includes('rebound')) return 'Rebounds';
  if (lower.includes('assist')) return 'Assists';
  if (lower.includes('three') || lower.includes('3-point')) return '3-Pointers';
  if (lower.includes('steal')) return 'Steals';
  if (lower.includes('block')) return 'Blocks';
  if (lower.includes('turnover')) return 'Turnovers';
  
  // NFL
  if (lower.includes('passing yard')) return 'Passing Yards';
  if (lower.includes('rushing yard')) return 'Rushing Yards';
  if (lower.includes('receiving yard')) return 'Receiving Yards';
  if (lower.includes('pass td') || lower.includes('passing td')) return 'Passing TDs';
  if (lower.includes('reception')) return 'Receptions';
  if (lower.includes('rush attempt')) return 'Rush Attempts';
  
  // MLB
  if (lower.includes('hit') && !lower.includes('pitch')) return 'Hits';
  if (lower.includes('total base')) return 'Total Bases';
  if (lower.includes('rbi')) return 'RBIs';
  if (lower.includes('run scored') || lower.includes('runs scored')) return 'Runs';
  if (lower.includes('home run')) return 'Home Runs';
  if (lower.includes('strikeout') && lower.includes('pitch')) return 'Strikeouts';
  
  // NHL
  if (lower.includes('shot on goal') || lower.includes('shots on goal')) return 'Shots on Goal';
  if (lower.includes('goal') && !lower.includes('shot')) return 'Goals';
  
  return null;
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

// ============================================
// ESPN NEWS FOR PLAYER
// ============================================

interface PlayerNewsItem {
  headline: string;
  description: string;
  published: string;
  link?: string;
}

async function fetchPlayerNews(
  playerName: string,
  sport: string
): Promise<PlayerNewsItem[]> {
  try {
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return [];
    
    // ESPN news API
    const newsUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/news?limit=10`;
    const res = await fetch(newsUrl);
    if (!res.ok) return [];
    
    const data = await res.json() as any;
    const articles = data.articles || [];
    
    // Filter for articles mentioning this player
    const playerLower = playerName.toLowerCase();
    const nameParts = playerLower.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    
    const relevantArticles = articles.filter((a: any) => {
      const headline = (a.headline || '').toLowerCase();
      const description = (a.description || '').toLowerCase();
      
      // Check if player's full name or last name is mentioned
      return headline.includes(playerLower) || 
             headline.includes(lastName) ||
             description.includes(playerLower) ||
             description.includes(lastName);
    });
    
    // Return up to 5 relevant articles
    return relevantArticles.slice(0, 5).map((a: any) => ({
      headline: a.headline || '',
      description: a.description || '',
      published: a.published || '',
      link: a.links?.web?.href || a.links?.api?.news?.href,
    }));
  } catch (err) {
    console.error('Error fetching player news:', err);
    return [];
  }
}


// ============================================
// SHARED LIVE PROFILE COMPUTATION (routes + document builder)
// ============================================

export type ComputeLivePlayerProfileResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
      profileCacheKey: string;
      hasUsablePayload: boolean;
      rawPlayerName: string;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function enrichPlayerInfoFromOverview(
  espnId: string,
  sport: string
): Promise<{
  espnId: string;
  displayName: string;
  position: string;
  jersey: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  headshotUrl: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  experience?: string;
  college?: string;
} | null> {
  try {
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return null;
    const overviewUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${espnId}/overview`;
    const overviewRes = await fetchWithTimeout(
      overviewUrl,
      { headers: { Accept: "application/json" } },
      3200
    );
    if (!overviewRes || !overviewRes.ok) {
      const coreFallback = await fetchCoreAthleteIdentity(espnId, sport);
      return coreFallback;
    }
    const overviewData = (await overviewRes.json()) as any;
    const athlete = overviewData.athlete || {};
    const teamData = athlete.team || {};
    if (!athlete || Object.keys(athlete).length === 0) {
      const coreFallback = await fetchCoreAthleteIdentity(espnId, sport);
      if (coreFallback) return coreFallback;
      return null;
    }
    return {
      espnId,
      displayName: athlete.displayName || "",
      position: athlete.position?.abbreviation || "",
      jersey: athlete.jersey || "",
      teamName: teamData.displayName || teamData.name || "",
      teamAbbr: teamData.abbreviation || "",
      teamColor: teamData.color || "3B82F6",
      headshotUrl: athlete.headshot?.href || getEspnHeadshotUrl(espnId, sport),
      birthDate: athlete.dateOfBirth,
      height: athlete.displayHeight,
      weight: athlete.displayWeight,
      experience: athlete.experience?.years ? `${athlete.experience.years} yrs` : undefined,
      college: athlete.college?.name,
    };
  } catch {
    const coreFallback = await fetchCoreAthleteIdentity(espnId, sport);
    return coreFallback;
  }
}

async function fetchCoreAthleteIdentity(
  espnId: string,
  sport: string
): Promise<{
  espnId: string;
  displayName: string;
  position: string;
  jersey: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  headshotUrl: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  experience?: string;
  college?: string;
} | null> {
  try {
    const sportUpper = String(sport || "").toUpperCase();
    const coreLeaguePath =
      sportUpper === "MLB" ? "baseball/leagues/mlb" :
      sportUpper === "NBA" ? "basketball/leagues/nba" :
      sportUpper === "NCAAB" ? "basketball/leagues/mens-college-basketball" :
      sportUpper === "NFL" ? "football/leagues/nfl" :
      sportUpper === "NHL" ? "hockey/leagues/nhl" :
      sportUpper === "SOCCER" ? "soccer/leagues/eng.1" :
      "";
    if (!coreLeaguePath) return null;
    const url = `https://sports.core.api.espn.com/v2/sports/${coreLeaguePath}/athletes/${encodeURIComponent(espnId)}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 3200);
    if (!res || !res.ok) return null;
    const athlete = await res.json() as any;
    const positionRaw =
      String(athlete?.position?.abbreviation || athlete?.position?.displayName || athlete?.position || "")
        .trim()
        .toUpperCase();
    return {
      espnId,
      displayName: String(athlete?.displayName || athlete?.fullName || "").trim(),
      position: positionRaw,
      jersey: "",
      teamName: "",
      teamAbbr: "",
      teamColor: "3B82F6",
      headshotUrl: getEspnHeadshotUrl(espnId, sportUpper),
      birthDate: athlete?.dateOfBirth || undefined,
      height: athlete?.displayHeight || undefined,
      weight: athlete?.displayWeight || undefined,
    };
  } catch {
    return null;
  }
}

/** Fast path for document builder: identity + team + headshot only (no game logs / props). */
export async function resolvePlayerInfoForDocumentBuild(params: {
  sport: string;
  playerId: string;
  playerNameHint: string;
}): Promise<{
  espnId: string;
  displayName: string;
  position: string;
  jersey: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  headshotUrl: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  experience?: string;
  college?: string;
} | null> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const pid = String(params.playerId || "").trim();
  const hint = String(params.playerNameHint || "").trim();
  if (!sport || !SPORT_PATHS[sport]) return null;
  if (/^\d{4,}$/.test(pid)) {
    const fromOverview = await enrichPlayerInfoFromOverview(pid, sport);
    if (fromOverview) return fromOverview;
    return {
      espnId: pid,
      displayName: hint,
      position: "",
      jersey: "",
      teamName: "",
      teamAbbr: "",
      teamColor: "3B82F6",
      headshotUrl: getEspnHeadshotUrl(pid, sport),
    };
  }
  const found = await searchEspnPlayer(hint || pid, sport, undefined, { quick: true });
  if (!found) return null;
  return {
    espnId: found.espnId,
    displayName: found.displayName,
    position: found.position,
    jersey: found.jersey,
    teamName: found.teamName,
    teamAbbr: found.teamAbbr,
    teamColor: found.teamColor,
    headshotUrl: found.headshotUrl,
  };
}

export async function computeLivePlayerProfilePayload(params: {
  db: D1Database;
  env: Bindings;
  sport: string;
  rawPlayerName: string;
  normalizedPlayerName: string;
  playerName: string;
  team?: string;
  pageDataMode: boolean;
  origin: string;
}): Promise<ComputeLivePlayerProfileResult> {
  const { db, env, sport, rawPlayerName, normalizedPlayerName, playerName, team, pageDataMode, origin } = params;
  const sportsRadarPropsKey =
    env.SPORTSRADAR_PLAYER_PROPS_KEY
    || (env as any)?.SPORTSRADAR_PROPS_KEY
    || (env as any)?.SPORTSRADAR_API_KEY;

  if (!SPORT_PATHS[sport]) {
    return {
      ok: false,
      status: 400,
      body: { error: "Unsupported sport", supported: Object.keys(SPORT_PATHS) },
    };
  }

  const profileCacheKey = makeCacheKey(
    "player-profile",
    `${sport}/${normalizeToken(playerName)}:role-v2`,
    team ? { team: normalizeToken(team) } : undefined
  );
  const requestedId = String(playerName || "").trim();
  const canonicalResolved = !/^\d{4,}$/.test(requestedId)
    ? await resolveCanonicalPlayer(db, sport, rawPlayerName || playerName || requestedId, team)
    : null;
  const numericRequestedId = /^\d{4,}$/.test(requestedId)
    ? requestedId
    : (String(canonicalResolved?.espn_player_id || "").trim() || "");
  console.log("PLAYER_ROUTE_CANONICAL_RESOLUTION", {
    requestedName: rawPlayerName || playerName || requestedId,
    resolvedPlayerId: canonicalResolved?.player_internal_id || null,
    canonicalName: canonicalResolved?.canonical_name || null,
  });

  let playerInfo = numericRequestedId
    ? (await enrichPlayerInfoFromOverview(numericRequestedId, sport)) || {
        espnId: numericRequestedId,
        displayName: String(canonicalResolved?.canonical_name || "").trim(),
        position: "",
        jersey: "",
        teamName: team || "",
        teamAbbr: "",
        teamColor: "",
        headshotUrl: getEspnHeadshotUrl(numericRequestedId, sport),
      }
    : await searchEspnPlayer(playerName, sport, team || undefined, { quick: pageDataMode });
  if (!playerInfo && !numericRequestedId && normalizedPlayerName && normalizedPlayerName !== rawPlayerName) {
    playerInfo = await searchEspnPlayer(rawPlayerName, sport, team || undefined, { quick: pageDataMode });
  }

  if (!playerInfo) {
    return {
      ok: false,
      status: 404,
      body: {
        error: "Player not found",
        playerName: rawPlayerName,
        sport,
        fallback: {
          displayName: rawPlayerName,
          sport,
          team: team || "Unknown",
          headshotUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(rawPlayerName)}&background=1e293b&color=94a3b8&size=350`,
        },
      },
    };
  }

  const gameLogPromise = (async () => {
    const baseGameLog = await withTimeout(
      fetchEspnGameLog(playerInfo!.espnId, sport, 60, undefined, { includeSeasonOverview: !pageDataMode }),
      pageDataMode ? 5800 : 4500,
      null
    );
    let mergedGames = baseGameLog?.games || [];
    let seasonAverages = baseGameLog?.seasonAverages || {};
    if (pageDataMode && mergedGames.length === 0 && Object.keys(seasonAverages || {}).length === 0) {
      // Retry once with a larger budget; ESPN can be bursty for some athlete ids.
      const retryGameLog = await withTimeout(
        fetchEspnGameLog(playerInfo!.espnId, sport, 60, undefined, { includeSeasonOverview: false }),
        8500,
        null
      );
      if (retryGameLog) {
        mergedGames = retryGameLog.games || mergedGames;
        if (Object.keys(seasonAverages || {}).length === 0) {
          seasonAverages = retryGameLog.seasonAverages || seasonAverages;
        }
      }
    }
    if (sport === "NBA" && !pageDataMode) {
      const nowYear = new Date().getUTCFullYear();
      const priorSeasons = [nowYear - 1, nowYear - 2];
      const priorLogs = await withTimeout(
        Promise.all(priorSeasons.map((yr) => fetchEspnGameLog(playerInfo!.espnId, sport, 80, yr))),
        2200,
        []
      );
      const seen = new Set<string>();
      const deduped: typeof mergedGames = [];
      for (const row of [...mergedGames, ...(priorLogs as Array<any>).flatMap((r) => r?.games || [])]) {
        const key = `${row.date}|${row.opponent}|${row.score}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(row);
      }
      mergedGames = deduped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    if (sport === "NBA" && pageDataMode && mergedGames.length === 0) {
      const nowYear = new Date().getUTCFullYear();
      const priorSeasons = [nowYear - 1, nowYear - 2];
      const priorLogs = await withTimeout(
        Promise.all(
          priorSeasons.map((yr) =>
            fetchEspnGameLog(playerInfo!.espnId, sport, 60, yr, { includeSeasonOverview: false })
          )
        ),
        2600,
        []
      );
      const seen = new Set<string>();
      const deduped: typeof mergedGames = [];
      for (const row of [...mergedGames, ...(priorLogs as Array<any>).flatMap((r) => r?.games || [])]) {
        const key = `${row.date}|${row.opponent}|${row.score}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(row);
      }
      mergedGames = deduped
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 60);
    }
    if (pageDataMode && mergedGames.length === 0 && Object.keys(seasonAverages || {}).length === 0) {
      const overviewOnly = await withTimeout(
        fetchEspnGameLog(playerInfo!.espnId, sport, 1, undefined, { includeSeasonOverview: true }),
        2200,
        null
      );
      const overviewSeason = overviewOnly?.seasonAverages || {};
      if (overviewSeason && Object.keys(overviewSeason).length > 0) {
        seasonAverages = overviewSeason;
      }
    }
    return {
      games: mergedGames,
      seasonAverages,
    };
  })();
  const matchupPromise = withTimeout(
    fetchMatchupData(playerInfo.teamAbbr, sport, playerInfo.position),
    3500,
    null
  );
  const newsPromise = pageDataMode
    ? Promise.resolve([])
    : withTimeout(fetchPlayerNews(playerInfo.displayName || playerName, sport), 2000, []);

  const playerNameCandidates = Array.from(
    new Set(
      [rawPlayerName, playerName, playerInfo.displayName, toDisplayFirstLast(playerName), toDisplayLastFirst(playerName)]
        .map((n) => String(n || "").trim())
        .filter(Boolean)
    )
  );

  const currentPropsPromise = (async () => {
    let currentProps: any[] = [];
    try {
      const placeholders = playerNameCandidates.map(() => "?").join(", ");
      const propsResult = await db
        .prepare(
          `
        SELECT * FROM sportsradar_props_cache
        WHERE LOWER(player_name) IN (${placeholders})
        AND fetched_at > datetime('now', '-3 hour')
        ORDER BY fetched_at DESC
      `
        )
        .bind(...playerNameCandidates.map((n) => n.toLowerCase()))
        .all();
      currentProps = propsResult.results || [];
    } catch {
      // Props cache table may not exist yet.
    }
    return currentProps;
  })();
  const shouldFetchLivePropsInPageData = pageDataMode && (sport === "MLB" || sport === "NHL");
  const livePropsTimeoutMs = sport === "NHL"
    ? (pageDataMode ? 8000 : 9000)
    : (pageDataMode ? 2200 : 2500);
  const livePropsPromise = (pageDataMode && !shouldFetchLivePropsInPageData)
    ? Promise.resolve([])
    : withTimeout(
        fetchPlayerPropsFromSportsRadar(playerInfo.displayName || playerName, sport, sportsRadarPropsKey),
        livePropsTimeoutMs,
        []
      );

  const [gameLog, matchupData, currentProps, liveProps, news] = await Promise.all([
    gameLogPromise,
    matchupPromise,
    currentPropsPromise,
    livePropsPromise,
    newsPromise,
  ]);

  const roleResolution = normalizePlayerRole({
    sport,
    rawPosition: String(playerInfo.position || ""),
    seasonAverages: gameLog?.seasonAverages || {},
    gameLog: gameLog?.games || [],
    props: [
      ...(Array.isArray(currentProps) ? currentProps : []),
      ...(Array.isArray(liveProps) ? liveProps : []),
    ],
  });
  playerInfo = {
    ...playerInfo,
    position: roleResolution.normalizedPosition || String(playerInfo.position || ""),
  };

  const healthData = await withTimeout(
    fetchPlayerHealth(playerInfo.espnId, sport, gameLog?.games),
    pageDataMode ? 1200 : 2000,
    {
      status: "unknown" as const,
      minutesTrend: {
        last5Avg: 0,
        seasonAvg: 0,
        trend: "stable" as const,
        last5: [],
      },
    }
  );
  if (
    healthData?.minutesTrend
    && Array.isArray(gameLog?.games)
    && gameLog.games.length > 0
    && (!Array.isArray(healthData.minutesTrend.last5) || healthData.minutesTrend.last5.length === 0)
  ) {
    const minuteValues = gameLog.games
      .map((g: any) => {
        const raw = g?.minutes ?? g?.stats?.MIN ?? g?.stats?.Min ?? "";
        const parsed = Number.parseFloat(String(raw || "").replace(/[^\d.]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    if (minuteValues.length > 0) {
      const last5 = minuteValues.slice(0, 5);
      const last5Avg = Number((last5.reduce((sum, v) => sum + v, 0) / last5.length).toFixed(1));
      const seasonAvg = Number((minuteValues.reduce((sum, v) => sum + v, 0) / minuteValues.length).toFixed(1));
      const delta = last5Avg - seasonAvg;
      healthData.minutesTrend = {
        last5Avg,
        seasonAvg,
        trend: delta > 1 ? "up" : delta < -1 ? "down" : "stable",
        last5,
      };
    }
  }

  const normalizedLiveProps = (Array.isArray(liveProps) ? liveProps : [])
    .map((p) => ({
      prop_type: String(p?.prop_type || "")
        .toUpperCase()
        .replace(/\s+/g, "_"),
      line_value: Number(p?.line ?? 0),
      sportsbook: p?.sportsbook || "SportsRadar",
      odds_american: Number(p?.over_odds ?? -110),
    }))
    .filter((p) => p.prop_type && Number.isFinite(p.line_value) && p.line_value > 0);

  let effectiveProps = currentProps.length > 0 ? currentProps : normalizedLiveProps;
  if (!Array.isArray(effectiveProps) || effectiveProps.length === 0) {
    try {
      const fallbackPropsTimeoutMs = sport === "NHL"
        ? (pageDataMode ? 9000 : 12000)
        : (pageDataMode ? 1800 : 2500);
      const playerId = String(playerInfo?.espnId || "").trim();
      const tryExtractFallbackProps = (rows: Array<any>) =>
        rows
          .filter((row) => {
            const rowId = String(row?.player_id || row?.playerId || row?.espnId || "").trim();
            if (playerId && rowId && rowId === playerId) return true;
            const candidate = String(row?.player_name || "").trim();
            if (!candidate) return false;
            const normalizedCandidate = normalizeToken(candidate);
            return playerNameCandidates.some((n) => {
              const normalizedTarget = normalizeToken(n);
              return (
                normalizedTarget &&
                (normalizedCandidate === normalizedTarget ||
                  normalizedCandidate.includes(normalizedTarget) ||
                  normalizedTarget.includes(normalizedCandidate))
              );
            });
          })
          .map((p) => ({
            prop_type: String(p?.prop_type || "")
              .toUpperCase()
              .replace(/\s+/g, "_"),
            line_value: Number(p?.line_value ?? p?.line ?? 0),
            sportsbook: p?.sportsbook || p?.book || "SportsRadar",
            odds_american: Number(p?.over_odds ?? p?.odds_american ?? -110),
          }))
          .filter((p) => p.prop_type && Number.isFinite(p.line_value) && p.line_value > 0);
      const offsetsToTry = sport === "NHL" ? [0, 3000] : [0];
      for (const offset of offsetsToTry) {
        const fallbackRes = await withTimeout(
          fetch(`${origin}/api/sports-data/props/today?sport=${encodeURIComponent(sport)}&limit=3000&offset=${offset}&fresh=1`),
          fallbackPropsTimeoutMs,
          null as Response | null
        );
        if (!fallbackRes || !fallbackRes.ok) continue;
        const payload = (await fallbackRes.json()) as { props?: Array<any> };
        const fallbackProps = tryExtractFallbackProps(Array.isArray(payload?.props) ? payload.props : []);
        if (fallbackProps.length > 0) {
          effectiveProps = fallbackProps;
          break;
        }
      }
    } catch {
      // Non-fatal fallback.
    }
  }
  effectiveProps = filterPropsForRole({
    sport,
    roleBucket: roleResolution.roleBucket,
    props: Array.isArray(effectiveProps) ? effectiveProps : [],
  });

  const propHitRates: Record<string, { hits: number; total: number; rate: number }> = {};
  if (gameLog?.games) {
    const statMappings: Record<string, string[]> = {
      POINTS: ["PTS", "Points"],
      REBOUNDS: ["REB", "Rebounds", "TRB"],
      ASSISTS: ["AST", "Assists"],
      THREES: ["3PM", "3PT", "FG3M"],
      STEALS: ["STL", "Steals"],
      BLOCKS: ["BLK", "Blocks"],
    };

    for (const [propType, statKeys] of Object.entries(statMappings)) {
      let hits = 0;
      let total = 0;

      const matchingProp = effectiveProps.find(
        (p) =>
          p.prop_type === propType || p.prop_type?.toLowerCase().includes(propType.toLowerCase())
      );
      const line = matchingProp?.line_value || 0;

      if (line > 0) {
        for (const game of gameLog.games) {
          for (const key of statKeys) {
            const val = game.stats[key];
            if (val !== undefined) {
              const numVal = typeof val === "number" ? val : parseFloat(String(val));
              if (!isNaN(numVal)) {
                total++;
                if (numVal > line) hits++;
              }
              break;
            }
          }
        }

        if (total > 0) {
          propHitRates[propType] = { hits, total, rate: hits / total };
        }
      }
    }
  }

  const effectiveMatchup = matchupData || buildFallbackMatchupFromGameLog(gameLog?.games || [], sport);
  const recentPerformance = await buildRecentPerformanceWithOdds(
        db,
        sport,
        playerNameCandidates,
        gameLog?.games || [],
        effectiveProps,
        sportsRadarPropsKey,
        playerInfo.teamName,
        {
          allowOnDemandFetch: !pageDataMode,
          playerId: String(playerInfo?.espnId || playerInfo?.id || ""),
          roleBucket: roleResolution.roleBucket,
        }
      );
  const vsOpponent = buildPlayerVsOpponentData(
    sport,
    gameLog?.games || [],
    effectiveMatchup,
    effectiveProps
  );
  const lineQualityHints: Record<string, "verified" | "estimated"> = {};
  for (const row of Array.isArray(recentPerformance) ? recentPerformance : []) {
    const qualities = (row as any)?.lineQualityByStat && typeof (row as any).lineQualityByStat === "object"
      ? (row as any).lineQualityByStat
      : {};
    for (const [stat, quality] of Object.entries(qualities)) {
      const key = String(stat || "").trim();
      const q = String(quality || "").toLowerCase();
      if (!key || (q !== "verified" && q !== "estimated")) continue;
      if (q === "verified" || !lineQualityHints[key]) {
        lineQualityHints[key] = q as "verified" | "estimated";
      }
    }
  }
  const edgeSignals = buildEdgeRows({
    sport,
    currentProps: Array.isArray(effectiveProps) ? effectiveProps : [],
    recentPerformance: Array.isArray(recentPerformance) ? recentPerformance : [],
    seasonAverages: gameLog?.seasonAverages || {},
    propHitRates,
    lineQualityHints,
    matchupAdjustment: 0,
  });

  const playerDisplayName =
    String(playerInfo.displayName || rawPlayerName || normalizedPlayerName || playerName || "").trim();
  const historical_verified_lines = (Array.isArray(recentPerformance) ? recentPerformance : []).flatMap((row) => {
    const date = String(row?.date || "").trim() || null;
    const lineSource = String((row as any)?.lineSource || "").toLowerCase();
    if (lineSource !== "historical_verified") return [];
    const lines = row?.propLines && typeof row.propLines === "object" ? row.propLines : {};
    const lineQualityByStat =
      (row as any)?.lineQualityByStat && typeof (row as any).lineQualityByStat === "object"
        ? (row as any).lineQualityByStat
        : {};
    const stats = row?.stats && typeof row.stats === "object" ? row.stats : {};
    const hasLineValue = (value: unknown): boolean => {
      if (value === null || value === undefined || value === "") return false;
      const n = Number(value);
      return Number.isFinite(n);
    };
    const entries = Object.entries(lines).map(([stat_type, rawLine]) => {
      const statQuality = String((lineQualityByStat as any)?.[String(stat_type || "")] || "").toLowerCase();
      if (statQuality && statQuality !== "verified") return null;
      if (!hasLineValue(rawLine)) return null;
      const line_value = Number(rawLine);
      const statAliases: Record<string, string[]> = {
        points: ["PTS", "points"],
        rebounds: ["REB", "rebounds", "TRB"],
        assists: ["AST", "assists", "A"],
        goals: ["G", "goals"],
        shots: ["SOG", "S", "shots", "Shots", "SA"],
        shots_on_goal: ["SOG", "S", "shots", "Shots", "SA"],
        saves: ["SV", "saves"],
        hits: ["H", "hits"],
        runs: ["R", "runs"],
        rbis: ["RBI", "rbis", "rbi"],
        home_runs: ["HR", "homeRuns", "home_runs", "hr"],
        strikeouts: ["K", "SO", "strikeouts"],
      };
      const aliases = statAliases[String(stat_type || "").toLowerCase()] || [String(stat_type || "")];
      let actual: number | null = null;
      for (const alias of aliases) {
        const n = Number((stats as any)?.[alias]);
        if (Number.isFinite(n)) {
          actual = n;
          break;
        }
      }
      const outcome =
        actual === null
          ? "no_action"
          : Math.abs(actual - line_value) < 0.0001
            ? "push"
            : actual > line_value
              ? "over"
              : "under";
      return {
        game_date: date,
        stat_type: String(stat_type || "").toLowerCase(),
        line_value,
        outcome,
        captured_at: date,
      };
    }).filter((v): v is { game_date: string | null; stat_type: string; line_value: number; outcome: string; captured_at: string | null } => Boolean(v));
    return entries;
  });
  const payload = {
    player: {
      ...playerInfo,
      displayName: playerDisplayName,
      name: playerDisplayName,
      id: String(playerInfo.espnId || playerName || ""),
      espnId: String(playerInfo.espnId || playerName || ""),
      headshotPlayerId: String(playerInfo.espnId || playerName || ""),
      sport,
      roleBucket: roleResolution.roleBucket,
    },
    gameLog: gameLog?.games || [],
    seasonAverages: gameLog?.seasonAverages || {},
    currentProps: effectiveProps,
    liveProps,
    propHitRates,
    edgeSignals,
    recentPerformance,
    historicalLines: historical_verified_lines,
    historical_verified_lines,
    matchup: effectiveMatchup,
    vsOpponent,
    health: healthData,
    news,
    lastUpdated: new Date().toISOString(),
  };
  const hasUsablePayload =
    (Array.isArray(payload.gameLog) && payload.gameLog.length > 0) ||
    (payload.seasonAverages &&
      typeof payload.seasonAverages === "object" &&
      Object.keys(payload.seasonAverages).length > 0) ||
    (Array.isArray(payload.currentProps) && payload.currentProps.length > 0);

  return {
    ok: true,
    payload,
    profileCacheKey,
    hasUsablePayload,
    rawPlayerName,
  };
}


// ============================================
// ROUTES
// ============================================

/**
 * GET /api/player/:sport/:playerName
 * Full player profile with stats, game log, and matchup intel
 */
app.get('/:sport/:playerName', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const rawPlayerName = decodeURIComponent(c.req.param('playerName'));
  const normalizedPlayerName = normalizePlayerSlug(rawPlayerName);
  const playerName = normalizedPlayerName || rawPlayerName;
  const team = c.req.query('team');
  const pageDataMode = c.req.query('pageData') === '1' || c.req.query('fast') === '1';
  const bypassCache = c.req.query('fresh') === '1';

  // Validate sport
  if (!SPORT_PATHS[sport]) {
    return c.json({ error: 'Unsupported sport', supported: Object.keys(SPORT_PATHS) }, 400);
  }

  const profileCacheKey = makeCacheKey(
    'player-profile',
    `${sport}/${normalizeToken(playerName)}:role-v2`,
    team ? { team: normalizeToken(team) } : undefined
  );
  const requestedId = String(playerName || '').trim();
  const numericRequestedId = /^\d{4,}$/.test(requestedId) ? requestedId : '';
  const payloadPlayerId = (payload: unknown): string => {
    if (!payload || typeof payload !== "object") return "";
    const p = (payload as { player?: unknown }).player;
    if (!p || typeof p !== "object") return "";
    const player = p as { id?: unknown; espnId?: unknown };
    return String(player.id || "").trim();
  };
  if (!bypassCache) {
    try {
      const cached = await getCachedData<any>(c.env.DB, profileCacheKey);
      if (cached) {
        const cachedId = payloadPlayerId(cached);
        if (numericRequestedId && cachedId !== numericRequestedId) {
          console.warn("PLAYER_PROFILE_CACHE_ID_MISMATCH", {
            requestedId: numericRequestedId,
            cachedId,
            sport,
            cacheScope: "primary",
          });
        } else {
        const hasUsableCachedPayload =
          (Array.isArray(cached?.gameLog) && cached.gameLog.length > 0)
          || (cached?.seasonAverages && typeof cached.seasonAverages === 'object' && Object.keys(cached.seasonAverages).length > 0)
          || (Array.isArray(cached?.currentProps) && cached.currentProps.length > 0);
        if (hasUsableCachedPayload) {
          return c.json(cached);
        }
        }
      }
    } catch {
      // Non-fatal cache read miss/failure.
    }
  }
  
  const computed = await computeLivePlayerProfilePayload({
    db: c.env.DB,
    env: c.env,
    sport,
    rawPlayerName,
    normalizedPlayerName,
    playerName,
    team: c.req.query("team") || undefined,
    pageDataMode,
    origin: new URL(c.req.url).origin,
  });
  if (!computed.ok) {
    return c.json(computed.body, computed.status);
  }
  const { payload, hasUsablePayload, rawPlayerName: rawForCache } = computed;
  try {
    if (hasUsablePayload) {
      await setCachedData(c.env.DB, profileCacheKey, "player-profile", `${sport}/${rawForCache}`, payload, 6 * 60 * 60);
    }
  } catch {
    // Non-fatal cache write failure.
  }
  return c.json(payload);
});

/**
 * GET /api/player/:sport/:playerName/headshot
 * Just the headshot URL (for quick lookups)
 */
app.get('/:sport/:playerName/headshot', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const rawPlayerName = decodeURIComponent(c.req.param('playerName'));
  const normalizedPlayerName = normalizePlayerSlug(rawPlayerName);
  const playerName = normalizedPlayerName || rawPlayerName;
  const team = c.req.query('team');
  
  let playerInfo = await searchEspnPlayer(playerName, sport, team || undefined);
  if (!playerInfo && normalizedPlayerName && normalizedPlayerName !== rawPlayerName) {
    playerInfo = await searchEspnPlayer(rawPlayerName, sport, team || undefined);
  }
  
  if (!playerInfo) {
    return c.json({ 
      headshotUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(rawPlayerName)}&background=1e293b&color=94a3b8&size=350`,
      found: false
    });
  }
  
  return c.json({
    headshotUrl: playerInfo.headshotUrl,
    espnId: playerInfo.espnId,
    found: true
  });
});

/**
 * GET /api/player/search
 * Search players across sports
 */
app.get('/search', async (c) => {
  const query = c.req.query('q');
  const sport = c.req.query('sport')?.toUpperCase();
  
  if (!query || query.length < 2) {
    return c.json({ error: 'Query too short', minLength: 2 }, 400);
  }
  
  // Use ESPN's search endpoint
  const searchUrl = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(query)}&limit=20&type=player`;
  
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!searchRes.ok) {
      return c.json({ results: [] });
    }
    
    const data = await searchRes.json() as any;
    // ESPN returns 'items' not 'results'
    const results = (data.items || data.results || [])
      .filter((r: any) => r.type === 'player')
      .map((r: any) => {
        // Team info is in teamRelationships for ESPN's format
        const teamInfo = r.teamRelationships?.[0]?.core || r.team || {};
        const leagueInfo = r.leagueRelationships?.[0]?.core || r.league || {};
        const leagueAbbr = String(leagueInfo.abbreviation || r.league || 'NBA').trim();
        const rawEspnId = String(r.id || '').trim();
        const displayName = String(r.displayName || '').trim();
        const canonicalId =
          resolveCanonicalPlayerIdFromPayload(rawEspnId, displayName, leagueAbbr.toLowerCase())
          || rawEspnId;
        if (rawEspnId && canonicalId && rawEspnId !== canonicalId) {
          console.warn("PLAYER_SEARCH_ID_MISMATCH", {
            query,
            displayName,
            rawEspnId,
            canonicalId,
            sport: leagueAbbr,
          });
        }
        return {
          espnId: canonicalId,
          displayName,
          position: r.position?.abbreviation,
          teamName: teamInfo.displayName || teamInfo.name,
          teamAbbr: teamInfo.abbreviation,
          sport: leagueAbbr || 'Unknown',
          headshotUrl: r.headshot?.href || getEspnHeadshotUrl(canonicalId || rawEspnId, leagueAbbr || 'NBA'),
        };
      });
    
    // Filter by sport if specified
    const filtered = sport 
      ? results.filter((r: any) => r.sport === sport)
      : results;

    const wu = c.executionCtx?.waitUntil?.bind(c.executionCtx);
    if (wu && filtered.length > 0) {
      wu(
        (async () => {
          try {
            const { enqueuePlayerDocumentsFromSearchResults } = await import("../services/playerDocuments/prebuildEnqueue");
            await enqueuePlayerDocumentsFromSearchResults(c.env.DB, filtered as any, 20);
          } catch {
            // non-fatal
          }
        })()
      );
    }

    return c.json({ results: filtered });
  } catch (err) {
    console.error('Player search error:', err);
    return c.json({ results: [] });
  }
});

export default app;
