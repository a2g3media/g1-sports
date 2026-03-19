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

type Bindings = {
  DB: any;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============================================
// ESPN API HELPERS
// ============================================

const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_WEB_API_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports';

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
  team?: string
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
    
    // Use ESPN's athlete search endpoint
    const searchUrl = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(playerName)}&limit=10&type=player`;
    
    const searchRes = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!searchRes.ok) {
      console.log(`ESPN search failed for ${playerName}: ${searchRes.status}`);
      return null;
    }
    
    const searchData = await searchRes.json() as any;
    // ESPN returns 'items' not 'results'
    const results = searchData?.items || searchData?.results || [];
    
    // Find matching player - prefer exact name match, then team match
    let bestMatch: any = null;
    for (const result of results) {
      if (result.type !== 'player') continue;
      
      const resultName = (result.displayName || '').toLowerCase();
      const searchName = playerName.toLowerCase();
      
      // Get team from teamRelationships (ESPN's nested format)
      const resultTeam = result.teamRelationships?.[0]?.displayName || result.team?.displayName || '';
      
      // Exact match is best
      if (resultName === searchName) {
        bestMatch = result;
        break;
      }
      
      // Partial match - names contain each other
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
    
    // Fetch from overview endpoint for better player details
    const overviewUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${playerId}/overview`;
    const overviewRes = await fetch(overviewUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (overviewRes.ok) {
      const overviewData = await overviewRes.json() as any;
      const athlete = overviewData.athlete || {};
      const teamData = athlete.team || {};
      
      return {
        espnId: playerId,
        displayName: athlete.displayName || bestMatch.displayName || playerName,
        position: athlete.position?.abbreviation || bestMatch.position?.abbreviation || '',
        jersey: athlete.jersey || bestMatch.jersey || '',
        teamName: teamData.displayName || teamData.name || '',
        teamAbbr: teamData.abbreviation || '',
        teamColor: teamData.color || '3B82F6',
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
    const detailRes = await fetch(detailUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (detailRes.ok) {
      const playerData = await detailRes.json() as any;
      const athlete = playerData.athlete || playerData;
      
      return {
        espnId: playerId,
        displayName: athlete.displayName || playerName,
        position: athlete.position?.abbreviation || '',
        jersey: athlete.jersey || '',
        teamName: athlete.team?.displayName || '',
        teamAbbr: athlete.team?.abbreviation || '',
        teamColor: athlete.team?.color || '3B82F6',
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
      teamName: bestMatch.team?.displayName || bestMatch.teamRelationships?.[0]?.displayName || '',
      teamAbbr: bestMatch.team?.abbreviation || '',
      teamColor: bestMatch.team?.color || '3B82F6',
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
  limit: number = 10
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
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return null;
    
    // Use the new ESPN web API for gamelog
    // For MLB, default to batting stats (pitching requires separate call)
    // Also use 2025 season for MLB since 2026 hasn't started yet
    const categoryParam = sport === 'MLB' ? '?category=batting&season=2025' : '';
    const logUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${espnId}/gamelog${categoryParam}`;
    
    const logRes = await fetch(logUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!logRes.ok) {
      console.log(`ESPN game log failed for ${espnId}: ${logRes.status}`);
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
              statsEvents[eventId] = typedEventData;
            }
          }
        }
        // Grab labels from this category if not already set
        if (labels.length === 0 && cat.labels) {
          labels = cat.labels;
        }
      }
    }
    
    // Use game info event IDs, limited
    const eventIds = Object.keys(gameInfoEvents).slice(0, limit);
    
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
    
    // Fetch season averages from overview endpoint
    const seasonStats: Record<string, number> = {};
    try {
      const overviewUrl = `${ESPN_WEB_API_BASE}/${sportPath}/athletes/${espnId}/overview`;
      const overviewRes = await fetch(overviewUrl, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (overviewRes.ok) {
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

// Fetch upcoming game matchup for a player's team
async function fetchMatchupData(
  teamAbbr: string,
  sport: string,
  _position?: string
): Promise<MatchupData | null> {
  try {
    const sportPath = SPORT_PATHS[sport];
    if (!sportPath) return null;

    // Get team schedule to find next game
    const scheduleUrl = `${ESPN_API_BASE}/${sportPath}/teams/${teamAbbr.toLowerCase()}/schedule`;
    const schedRes = await fetch(scheduleUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!schedRes.ok) return null;
    const schedData = await schedRes.json() as any;
    
    // Find next upcoming game
    const events = schedData.events || [];
    const now = new Date();
    const nextGame = events.find((e: any) => {
      const gameDate = new Date(e.date);
      return gameDate > now;
    });
    
    if (!nextGame) return null;
    
    // Determine opponent
    const competitions = nextGame.competitions || [];
    const comp = competitions[0];
    if (!comp) return null;
    
    const homeTeam = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const awayTeam = comp.competitors?.find((c: any) => c.homeAway === 'away');
    const isHome = homeTeam?.team?.abbreviation?.toLowerCase() === teamAbbr.toLowerCase();
    const opponent = isHome ? awayTeam : homeTeam;
    
    if (!opponent) return null;
    
    // Fetch opponent team stats for defensive rankings
    let defensiveRankings: MatchupData['defensiveRankings'];
    try {
      const oppStatsUrl = `${ESPN_API_BASE}/${sportPath}/teams/${opponent.team?.abbreviation?.toLowerCase()}/statistics`;
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
        name: opponent.team?.displayName || opponent.team?.name || 'Unknown',
        abbr: opponent.team?.abbreviation || '',
        logo: opponent.team?.logo,
      },
      gameTime: nextGame.date,
      venue: comp.venue?.fullName,
      defensiveRankings,
    };
  } catch (err) {
    console.error('Matchup fetch error:', err);
    return null;
  }
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

// Competition ID mapping for SportsRadar Player Props
const SR_COMPETITION_IDS: Record<string, string> = {
  'NBA': 'sr:competition:132',
  'NFL': 'sr:competition:1',
  'MLB': 'sr:competition:109',
  'NHL': 'sr:competition:234',
  'NCAAB': 'sr:competition:233',
  'NCAAF': 'sr:competition:298',
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
  
  const competitionId = SR_COMPETITION_IDS[sport];
  if (!competitionId) {
    console.log(`[SportsRadar Props] Unknown sport: ${sport}`);
    return [];
  }
  
  try {
    // SportsRadar Player Props endpoint
    const url = `https://api.sportradar.com/oddscomparison-player-props/production/v2/en/competitions/${encodeURIComponent(competitionId)}/players_props.json?api_key=${apiKey}`;
    
    console.log(`[SportsRadar Props] Fetching props for ${playerName} in ${sport}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`[SportsRadar Props] API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json() as any;
    const props: PlayerProp[] = [];
    const playerLower = playerName.toLowerCase();
    
    // Parse player props from response
    const sportEvents = data.sport_events || [];
    
    for (const event of sportEvents) {
      const markets = event.markets || [];
      
      for (const market of markets) {
        const books = market.books || [];
        if (books.length === 0) continue;
        
        const book = books[0]; // Use first sportsbook
        const outcomes = book.outcomes || [];
        
        // Find outcomes for this player
        for (const outcome of outcomes) {
          const outcomeName = (outcome.name || '').toLowerCase();
          if (!outcomeName.includes(playerLower)) continue;
          
          // Extract prop type from market name
          const marketName = market.name || '';
          const propType = mapSportsRadarPropType(marketName);
          
          if (propType && outcome.line !== undefined) {
            // Find the corresponding over/under
            const overOutcome = outcomes.find((o: any) => 
              o.name?.toLowerCase().includes(playerLower) && 
              o.type?.toLowerCase() === 'over'
            );
            const underOutcome = outcomes.find((o: any) => 
              o.name?.toLowerCase().includes(playerLower) && 
              o.type?.toLowerCase() === 'under'
            );
            
            if (overOutcome || underOutcome) {
              props.push({
                type: propType,
                line: outcome.line || overOutcome?.line || underOutcome?.line || 0,
                overOdds: overOutcome?.odds ? decimalToAmerican(overOutcome.odds) : -110,
                underOdds: underOutcome?.odds ? decimalToAmerican(underOutcome.odds) : -110,
                sportsbook: book.name || 'SportsRadar',
              });
            }
          }
        }
      }
    }
    
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
// ROUTES
// ============================================

/**
 * GET /api/player/:sport/:playerName
 * Full player profile with stats, game log, and matchup intel
 */
app.get('/:sport/:playerName', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const playerName = decodeURIComponent(c.req.param('playerName'));
  const team = c.req.query('team');
  
  // Validate sport
  if (!SPORT_PATHS[sport]) {
    return c.json({ error: 'Unsupported sport', supported: Object.keys(SPORT_PATHS) }, 400);
  }
  
  // Search for player on ESPN
  const playerInfo = await searchEspnPlayer(playerName, sport, team || undefined);
  
  if (!playerInfo) {
    return c.json({ 
      error: 'Player not found',
      playerName,
      sport,
      fallback: {
        displayName: playerName,
        sport,
        team: team || 'Unknown',
        headshotUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&background=1e293b&color=94a3b8&size=350`,
      }
    }, 404);
  }
  
  // Fetch game log
  const gameLog = await fetchEspnGameLog(playerInfo.espnId, sport, 10);
  
  // Fetch matchup data (next opponent with defensive stats)
  const matchupData = await fetchMatchupData(playerInfo.teamAbbr, sport, playerInfo.position);
  
  // Fetch health/injury status and minutes trend
  const healthData = await fetchPlayerHealth(playerInfo.espnId, sport, gameLog?.games);
  
  // Fetch current props from SportsRadar (if available in DB cache)
  let currentProps: any[] = [];
  try {
    const propsResult = await c.env.DB.prepare(`
      SELECT * FROM sportsradar_props_cache
      WHERE LOWER(player_name) = LOWER(?)
      AND fetched_at > datetime('now', '-1 hour')
      ORDER BY fetched_at DESC
    `).bind(playerName).all();
    currentProps = propsResult.results || [];
  } catch {
    // Props cache table may not exist yet
  }
  
  // Calculate prop hit rates based on game log
  const propHitRates: Record<string, { hits: number; total: number; rate: number }> = {};
  if (gameLog?.games) {
    // For NBA: check points, rebounds, assists
    const statMappings: Record<string, string[]> = {
      'POINTS': ['PTS', 'Points'],
      'REBOUNDS': ['REB', 'Rebounds', 'TRB'],
      'ASSISTS': ['AST', 'Assists'],
      'THREES': ['3PM', '3PT', 'FG3M'],
      'STEALS': ['STL', 'Steals'],
      'BLOCKS': ['BLK', 'Blocks'],
    };
    
    for (const [propType, statKeys] of Object.entries(statMappings)) {
      let hits = 0;
      let total = 0;
      
      // Find matching prop line
      const matchingProp = currentProps.find(p => 
        p.prop_type === propType || 
        p.prop_type?.toLowerCase().includes(propType.toLowerCase())
      );
      const line = matchingProp?.line_value || 0;
      
      if (line > 0) {
        for (const game of gameLog.games) {
          for (const key of statKeys) {
            const val = game.stats[key];
            if (val !== undefined) {
              const numVal = typeof val === 'number' ? val : parseFloat(String(val));
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
  
  // Fetch live player props from SportsRadar
  const liveProps = await fetchPlayerPropsFromSportsRadar(
    playerName,
    sport,
    c.env.SPORTSRADAR_PLAYER_PROPS_KEY
  );
  
  // Fetch relevant news for this player
  const news = await fetchPlayerNews(playerName, sport);
  
  return c.json({
    player: {
      ...playerInfo,
      sport,
    },
    gameLog: gameLog?.games || [],
    seasonAverages: gameLog?.seasonAverages || {},
    currentProps,
    liveProps,
    propHitRates,
    matchup: matchupData,
    health: healthData,
    news,
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/player/:sport/:playerName/headshot
 * Just the headshot URL (for quick lookups)
 */
app.get('/:sport/:playerName/headshot', async (c) => {
  const sport = c.req.param('sport').toUpperCase();
  const playerName = decodeURIComponent(c.req.param('playerName'));
  const team = c.req.query('team');
  
  const playerInfo = await searchEspnPlayer(playerName, sport, team || undefined);
  
  if (!playerInfo) {
    return c.json({ 
      headshotUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&background=1e293b&color=94a3b8&size=350`,
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
        return {
          espnId: r.id,
          displayName: r.displayName,
          position: r.position?.abbreviation,
          teamName: teamInfo.displayName || teamInfo.name,
          teamAbbr: teamInfo.abbreviation,
          sport: leagueInfo.abbreviation || r.league || 'Unknown',
          headshotUrl: r.headshot?.href || getEspnHeadshotUrl(r.id, leagueInfo.abbreviation || r.league || 'NBA'),
        };
      });
    
    // Filter by sport if specified
    const filtered = sport 
      ? results.filter((r: any) => r.sport === sport)
      : results;
    
    return c.json({ results: filtered });
  } catch (err) {
    console.error('Player search error:', err);
    return c.json({ results: [] });
  }
});

export default app;
