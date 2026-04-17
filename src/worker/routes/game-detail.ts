// @ts-nocheck
/**
 * Game Detail API Routes
 * 
 * Endpoints for detailed game data: box scores, player stats, H2H history, injuries
 * Uses SportsRadar API for real-time sports data
 */

import { Hono } from "hono";
import { cacheHeaders } from "../services/responseCache";
import { getLineMovement } from "../services/sportsRadarOddsService";

interface Env {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
}

const gameDetailRouter = new Hono<{ Bindings: Env }>();

// Parse game ID to extract sport and provider-specific ID
function parseGameId(gameId: string): { sport: string; numericId: string; isSportsRadar: boolean } {
  const parts = gameId.split('_');
  
  // SportsRadar format: sr_nba_12345678 or sr:sport_event:12345678
  if (parts[0] === 'sr' || gameId.startsWith('sr:')) {
    const sport = parts.length >= 2 ? parts[1] : 'nba';
    const numericId = parts.length >= 3 ? parts[2] : parts[parts.length - 1];
    return { sport, numericId, isSportsRadar: true };
  }
  
  // Simple format: nba_12345
  if (parts.length === 2) {
    return { sport: parts[0], numericId: parts[1], isSportsRadar: false };
  }
  
  return { sport: 'nba', numericId: parts[parts.length - 1], isSportsRadar: false };
}

// SportsRadar API configuration
const SR_SPORT_CONFIG: Record<string, { base: string; version: string }> = {
  'nba': { base: 'https://api.sportradar.com/nba/production', version: 'v8' },
  'nfl': { base: 'https://api.sportradar.com/nfl/production', version: 'v7' },
  'mlb': { base: 'https://api.sportradar.com/mlb/production', version: 'v7' },
  'nhl': { base: 'https://api.sportradar.com/nhl/production', version: 'v7' },
  'ncaab': { base: 'https://api.sportradar.com/ncaamb/production', version: 'v8' },
  'ncaaf': { base: 'https://api.sportradar.com/ncaafb/production', version: 'v7' },
};

interface SRInjury {
  playerName: string;
  team: string;
  position: string;
  status: string;
  injury: string;
  lastUpdated: string;
}

// Fetch injuries from SportsRadar injuries endpoint
async function fetchSportsRadarInjuries(
  apiKey: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  homeTeamId?: string,
  awayTeamId?: string
): Promise<{ home: SRInjury[]; away: SRInjury[] }> {
  const config = SR_SPORT_CONFIG[sport.toLowerCase()];
  if (!config) {
    return { home: [], away: [] };
  }
  const normalizeToken = (value: string) =>
    String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const buildCandidates = (teamName: string) => {
    const out = new Set<string>();
    const trimmed = String(teamName || "").trim();
    const token = normalizeToken(trimmed);
    if (token) out.add(token);
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length > 0) out.add(normalizeToken(parts[0]));
    if (parts.length > 1) out.add(normalizeToken(parts[parts.length - 1]));
    if (parts.length > 2) out.add(normalizeToken(parts.slice(-2).join(" ")));
    return out;
  };
  const homeCandidates = buildCandidates(homeTeam);
  const awayCandidates = buildCandidates(awayTeam);
  const homeInjuries: SRInjury[] = [];
  const awayInjuries: SRInjury[] = [];
  const seen = new Set<string>();
  const getTeamSide = (teamNameRaw: string, teamAliasRaw: string, teamMarketRaw: string): "home" | "away" | null => {
    const full = normalizeToken(`${teamMarketRaw} ${teamNameRaw}`.trim());
    const alias = normalizeToken(teamAliasRaw);
    const name = normalizeToken(teamNameRaw);
    const matches = (candidates: Set<string>) =>
      Array.from(candidates).some((candidate) =>
        (candidate && full && (full.includes(candidate) || candidate.includes(full)))
        || (candidate && alias && (alias === candidate || alias.includes(candidate) || candidate.includes(alias)))
        || (candidate && name && (name === candidate || name.includes(candidate) || candidate.includes(name)))
      );
    if (matches(homeCandidates)) return "home";
    if (matches(awayCandidates)) return "away";
    return null;
  };
  const appendInjuryRows = (players: any[], teamLabel: string, side: "home" | "away") => {
    for (const player of players || []) {
      const injuryStatus = player?.injury?.status || player?.injuries?.[0]?.status || player?.status;
      const injuryDesc = player?.injury?.desc || player?.injuries?.[0]?.description || player?.injury?.description || "";
      if (!injuryStatus && !injuryDesc) continue;
      const playerName = player?.full_name || `${player?.first_name || ""} ${player?.last_name || ""}`.trim();
      if (!playerName) continue;
      const key = `${side}|${playerName}|${injuryStatus || ""}|${injuryDesc || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const injury: SRInjury = {
        playerName,
        team: teamLabel,
        position: player?.position || player?.primary_position || '-',
        status: String(injuryStatus || 'Questionable'),
        injury: String(injuryDesc || 'Undisclosed'),
        lastUpdated: player?.injury?.updated || new Date().toISOString(),
      };
      if (side === "home") homeInjuries.push(injury);
      else awayInjuries.push(injury);
    }
  };

  // First pass: team profile injuries (more reliable team assignment)
  const teamIds: Array<{ id: string; side: "home" | "away"; label: string }> = [];
  if (homeTeamId) teamIds.push({ id: homeTeamId, side: "home", label: homeTeam });
  if (awayTeamId) teamIds.push({ id: awayTeamId, side: "away", label: awayTeam });
  for (const team of teamIds) {
    try {
      const profileUrl = `${config.base}/${config.version}/en/teams/${encodeURIComponent(team.id)}/profile.json?api_key=${apiKey}`;
      const profileRes = await fetch(profileUrl);
      if (!profileRes.ok) continue;
      const profile = await profileRes.json() as any;
      appendInjuryRows(profile?.players || [], team.label, team.side);
    } catch {
      // non-fatal
    }
  }
  
  // SportsRadar injuries endpoint: /league/injuries.json
  const url = `${config.base}/${config.version}/en/league/injuries.json?api_key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[Injuries] SportsRadar HTTP ${response.status}`);
      return { home: [], away: [] };
    }
    
    const data = await response.json() as any;
    // Parse teams array - each team has a players array with injury info
    const teams = data.teams || data.league?.teams || [];
    
    for (const team of teams) {
      const teamName = team.name || '';
      const teamAlias = team.alias || '';
      const side = getTeamSide(teamName, teamAlias, team.market || "");
      if (!side) continue;
      appendInjuryRows(team.players || [], teamAlias || teamName || (side === "home" ? homeTeam : awayTeam), side);
    }
    
    return { home: homeInjuries, away: awayInjuries };
  } catch (err) {
    console.log(`[Injuries] SportsRadar error:`, err);
    return { home: [], away: [] };
  }
}

// ============================================
// HEAD-TO-HEAD FROM SPORTSRADAR
// ============================================

interface SRH2HGame {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  margin: number;
  venue?: string;
}

// Fetch H2H history from SportsRadar team schedules
async function fetchSportsRadarH2H(
  apiKey: string,
  sport: string,
  homeTeamName: string,
  awayTeamName: string,
  _gameId?: string
): Promise<{ matchups: SRH2HGame[], homeWins: number, awayWins: number, ties: number }> {
  const config = SR_SPORT_CONFIG[sport.toLowerCase()];
  if (!config) {
    return { matchups: [], homeWins: 0, awayWins: 0, ties: 0 };
  }

  try {
    // For SportsRadar, fetch multiple seasons to find H2H matchups
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1, currentYear - 2]; // Guarantee >=2 full seasons
    
    // Normalize team names for comparison
    const normalizeTeam = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
    const homeNorm = normalizeTeam(homeTeamName);
    const awayNorm = normalizeTeam(awayTeamName);
    
    const allMatchups: SRH2HGame[] = [];
    let homeWins = 0;
    let awayWins = 0;
    let ties = 0;
    
    const seenGames = new Set<string>();
    // Try to fetch schedules for multiple seasons
    for (const year of years) {
      // Build schedule URL(s) based on sport and season phase
      const sportLower = sport.toLowerCase();
      const seasonTypes = ['REG', 'PST'];
      if (!['nba', 'nhl', 'mlb', 'nfl', 'ncaaf', 'ncaab'].includes(sportLower)) continue;

      for (const seasonType of seasonTypes) {
        const scheduleUrl = `${config.base}/${config.version}/en/games/${year}/${seasonType}/schedule.json?api_key=${apiKey}`;
        try {
          const res = await fetch(scheduleUrl, {
            headers: { 'Accept': 'application/json' }
          });

          if (!res.ok) {
            continue;
          }

          const data = await res.json() as any;
          const games = data.games || [];
        
          // Find completed games between these two teams
          for (const game of games) {
            const gameKey = String(game.id || `${game.scheduled || ""}:${game.home?.id || ""}:${game.away?.id || ""}`);
            if (seenGames.has(gameKey)) continue;
            const gameHome = game.home?.name || game.home?.alias || '';
            const gameAway = game.away?.name || game.away?.alias || '';
            const gameHomeNorm = normalizeTeam(gameHome);
            const gameAwayNorm = normalizeTeam(gameAway);

            // Check if this is a matchup between our two teams (either direction)
            const isMatchup = (
              (gameHomeNorm.includes(homeNorm) || homeNorm.includes(gameHomeNorm)) &&
              (gameAwayNorm.includes(awayNorm) || awayNorm.includes(gameAwayNorm))
            ) || (
              (gameHomeNorm.includes(awayNorm) || awayNorm.includes(gameHomeNorm)) &&
              (gameAwayNorm.includes(homeNorm) || homeNorm.includes(gameAwayNorm))
            );

            if (!isMatchup) continue;

            // Only include completed games
            const status = game.status?.toLowerCase() || '';
            if (status !== 'closed' && status !== 'final' && status !== 'complete') continue;

            const homeScore = game.home_points ?? game.home?.points ?? game.home?.runs ?? 0;
            const awayScore = game.away_points ?? game.away?.points ?? game.away?.runs ?? 0;
          
            const winner = homeScore > awayScore ? gameHome 
              : awayScore > homeScore ? gameAway 
              : 'TIE';
            seenGames.add(gameKey);

            allMatchups.push({
              date: game.scheduled || game.date || '',
              homeTeam: gameHome,
              awayTeam: gameAway,
              homeScore,
              awayScore,
              winner,
              margin: Math.abs(homeScore - awayScore),
              venue: game.venue?.name
            });

            // Track series record
            if (winner === 'TIE') {
              ties++;
            } else {
              const winnerNorm = normalizeTeam(winner);
              if (winnerNorm.includes(homeNorm) || homeNorm.includes(winnerNorm)) {
                homeWins++;
              } else {
                awayWins++;
              }
            }
          }
        } catch (err) {
          console.log(`[H2H] Error fetching ${year} ${seasonType} schedule:`, err);
          continue;
        }
      }
    }

    // Sort by date descending (most recent first)
    allMatchups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Limit to last 10 matchups
    return { 
      matchups: allMatchups.slice(0, 10), 
      homeWins, 
      awayWins, 
      ties 
    };
  } catch (err) {
    console.log(`[H2H] SportsRadar error:`, err);
    return { matchups: [], homeWins: 0, awayWins: 0, ties: 0 };
  }
}



// ============================================
// BOX SCORE ENDPOINT
// ============================================

interface PlayerStats {
  name: string;
  position: string;
  minutes: number;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fgMade?: number;
  fgAttempts?: number;
  fg3Made?: number;
  fg3Attempts?: number;
  ftMade?: number;
  ftAttempts?: number;
  plusMinus?: number;
  isStarter: boolean;
}

interface TeamStats {
  team: string;
  points: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fastBreakPoints?: number;
  pointsInPaint?: number;
  secondChancePoints?: number;
}

interface BoxScoreData {
  gameId: string;
  status: string;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  homePlayers: PlayerStats[];
  awayPlayers: PlayerStats[];
  quarterScores: {
    period: string;
    homeScore: number;
    awayScore: number;
  }[];
}

// Helper to fetch box score from SportsRadar
async function fetchSportsRadarBoxScore(
  apiKey: string,
  sport: string,
  gameId: string
): Promise<{ data: any | null; error: string | null }> {
  // Map sport to SportsRadar API path
  const sportPaths: Record<string, string> = {
    nba: 'nba',
    mlb: 'mlb',
    nhl: 'nhl',
    nfl: 'nfl',
    ncaab: 'ncaamb',
    ncaaf: 'ncaafb',
  };
  
  const sportPath = sportPaths[sport.toLowerCase()];
  if (!sportPath) {
    return { data: null, error: `Unsupported sport: ${sport}` };
  }
  
  // SportsRadar game summary endpoint
  const url = `https://api.sportradar.com/${sportPath}/production/v8/en/games/${gameId}/summary.json?api_key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

// Normalize SportsRadar box score data
function normalizeSportsRadarBoxScore(raw: any, sport: string): Partial<BoxScoreData> {
  const game = raw.game || raw;
  const status = game.status || 'scheduled';
  
  // Get home/away data
  const home = game.home || {};
  const away = game.away || {};
  
  // Build quarter/period scores
  const quarterScores: BoxScoreData['quarterScores'] = [];
  
  if (sport === 'nba' || sport === 'ncaab') {
    const periods = game.periods || home.scoring || [];
    if (Array.isArray(periods)) {
      for (const p of periods) {
        const periodNumber = Number(p.number);
        const periodLabel = sport === 'ncaab'
          ? (Number.isFinite(periodNumber) ? (periodNumber <= 2 ? `${periodNumber}H` : `OT${periodNumber - 2}`) : (p.type || 'H'))
          : (Number.isFinite(periodNumber) ? `Q${periodNumber}` : (p.type || 'Q'));
        quarterScores.push({
          period: periodLabel,
          homeScore: p.home_points ?? home.scoring?.[periods.indexOf(p)]?.points ?? 0,
          awayScore: p.away_points ?? away.scoring?.[periods.indexOf(p)]?.points ?? 0
        });
      }
    }
  } else if (sport === 'mlb') {
    const innings = game.innings || [];
    for (const inn of innings) {
      quarterScores.push({
        period: String(inn.number || quarterScores.length + 1),
        homeScore: inn.home_runs ?? 0,
        awayScore: inn.away_runs ?? 0
      });
    }
  } else if (sport === 'nhl') {
    const periods = game.periods || [];
    for (const p of periods) {
      quarterScores.push({
        period: `P${p.number || quarterScores.length + 1}`,
        homeScore: p.home_goals ?? 0,
        awayScore: p.away_goals ?? 0
      });
    }
  }
  
  // Build team stats
  const homeStats = home.statistics || {};
  const awayStats = away.statistics || {};
  
  const homeTeam: TeamStats = {
    team: home.name || home.alias || 'HOME',
    points: home.points ?? home.runs ?? home.goals ?? 0,
    fgPct: homeStats.field_goals_pct ?? 0,
    fg3Pct: homeStats.three_points_pct ?? 0,
    ftPct: homeStats.free_throws_pct ?? 0,
    rebounds: homeStats.rebounds ?? homeStats.total_rebounds ?? 0,
    assists: homeStats.assists ?? 0,
    steals: homeStats.steals ?? 0,
    blocks: homeStats.blocks ?? 0,
    turnovers: homeStats.turnovers ?? 0
  };
  
  const awayTeam: TeamStats = {
    team: away.name || away.alias || 'AWAY',
    points: away.points ?? away.runs ?? away.goals ?? 0,
    fgPct: awayStats.field_goals_pct ?? 0,
    fg3Pct: awayStats.three_points_pct ?? 0,
    ftPct: awayStats.free_throws_pct ?? 0,
    rebounds: awayStats.rebounds ?? awayStats.total_rebounds ?? 0,
    assists: awayStats.assists ?? 0,
    steals: awayStats.steals ?? 0,
    blocks: awayStats.blocks ?? 0,
    turnovers: awayStats.turnovers ?? 0
  };
  
  // Build player stats
  const homePlayers: PlayerStats[] = [];
  const awayPlayers: PlayerStats[] = [];
  
  const processPlayers = (players: any[], targetArray: PlayerStats[]) => {
    if (!Array.isArray(players)) return;
    for (const p of players) {
      const stats = p.statistics || p;
      targetArray.push({
        name: p.full_name || p.name || 'Unknown',
        position: p.position || p.primary_position || '-',
        minutes: stats.minutes ? parseInt(String(stats.minutes).split(':')[0]) : 0,
        points: stats.points ?? 0,
        rebounds: stats.rebounds ?? stats.total_rebounds ?? 0,
        assists: stats.assists ?? 0,
        steals: stats.steals ?? 0,
        blocks: stats.blocks ?? 0,
        turnovers: stats.turnovers ?? 0,
        fgMade: stats.field_goals_made ?? 0,
        fgAttempts: stats.field_goals_att ?? 0,
        fg3Made: stats.three_points_made ?? 0,
        fg3Attempts: stats.three_points_att ?? 0,
        ftMade: stats.free_throws_made ?? 0,
        ftAttempts: stats.free_throws_att ?? 0,
        plusMinus: stats.plus_minus ?? 0,
        isStarter: p.starter === true || p.played === true
      });
    }
  };
  
  processPlayers(home.players || [], homePlayers);
  processPlayers(away.players || [], awayPlayers);
  
  // Sort by minutes
  const sortPlayers = (players: PlayerStats[]) => 
    players.sort((a, b) => b.minutes - a.minutes);
  
  return {
    status: status.toUpperCase(),
    homeTeam,
    awayTeam,
    homePlayers: sortPlayers(homePlayers),
    awayPlayers: sortPlayers(awayPlayers),
    quarterScores
  };
}

/**
 * GET /api/game-detail/:gameId/box-score
 * Get box score with player stats and quarter-by-quarter scoring
 */
gameDetailRouter.get("/:gameId/box-score", async (c) => {
  const gameId = c.req.param("gameId");
  const { sport, numericId } = parseGameId(gameId);
  
  // Fetch from SportsRadar
  const srApiKey = c.env.SPORTSRADAR_API_KEY;
  if (srApiKey) {
    const { data: srBoxScore, error: srError } = await fetchSportsRadarBoxScore(
      srApiKey,
      sport,
      numericId
    );
    
    if (srBoxScore && !srError) {
      const normalizedBoxScore = normalizeSportsRadarBoxScore(srBoxScore, sport);
      return c.json({
        gameId,
        sport,
        ...normalizedBoxScore,
        lastUpdated: new Date().toISOString()
      }, {
        headers: cacheHeaders(30, { isPublic: true })
      });
    }
  }
  
  // Return empty state if no data available
  return c.json({
    gameId,
    sport,
    status: 'SCHEDULED',
    homeTeam: null,
    awayTeam: null,
    homePlayers: [],
    awayPlayers: [],
    quarterScores: [],
    message: "Box score available once game begins"
  }, 200);
});

// Legacy SDIO normalization - kept for reference but unused
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _normalizeBoxScore(raw: any, sport: string): Partial<BoxScoreData> {
  const result: Partial<BoxScoreData> = {
    status: raw.Game?.Status || raw.Status || 'SCHEDULED',
    quarterScores: [],
    homePlayers: [],
    awayPlayers: []
  };
  
  // Handle different sport formats
  if (sport === 'nba' || sport === 'ncaab') {
    return normalizeBasketballBoxScore(raw, sport);
  } else if (sport === 'nfl' || sport === 'ncaaf') {
    return normalizeFootballBoxScore(raw);
  } else if (sport === 'mlb') {
    return normalizeBaseballBoxScore(raw);
  } else if (sport === 'nhl') {
    return normalizeHockeyBoxScore(raw);
  }
  
  return result;
}

function normalizeBasketballBoxScore(raw: any, sport: string = 'nba'): Partial<BoxScoreData> {
  const game = raw.Game || raw;
  const status = game.Status || 'SCHEDULED';
  
  // Quarter/half scores
  const quarterScores: BoxScoreData['quarterScores'] = [];
  if (game.Quarters?.length) {
    for (const q of game.Quarters) {
      quarterScores.push({
        period: q.Name || `Q${q.Number}`,
        homeScore: q.HomeScore ?? 0,
        awayScore: q.AwayScore ?? 0
      });
    }
  } else {
    // Try to build from period scores
    const periods = sport === 'ncaab' ? ['1H', '2H'] : ['Q1', 'Q2', 'Q3', 'Q4'];
    for (let i = 0; i < periods.length; i++) {
      const homeKey = `HomeTeam${periods[i]}Score` as keyof typeof game;
      const awayKey = `AwayTeam${periods[i]}Score` as keyof typeof game;
      if (game[homeKey] !== undefined) {
        quarterScores.push({
          period: periods[i],
          homeScore: game[homeKey] ?? 0,
          awayScore: game[awayKey] ?? 0
        });
      }
    }
  }
  
  // Team stats
  const homeTeam: TeamStats = {
    team: game.HomeTeam || 'HOME',
    points: game.HomeTeamScore ?? 0,
    fgPct: raw.TeamGames?.[0]?.FieldGoalsPercentage ?? 0,
    fg3Pct: raw.TeamGames?.[0]?.ThreePointersPercentage ?? 0,
    ftPct: raw.TeamGames?.[0]?.FreeThrowsPercentage ?? 0,
    rebounds: raw.TeamGames?.[0]?.Rebounds ?? 0,
    assists: raw.TeamGames?.[0]?.Assists ?? 0,
    steals: raw.TeamGames?.[0]?.Steals ?? 0,
    blocks: raw.TeamGames?.[0]?.BlockedShots ?? 0,
    turnovers: raw.TeamGames?.[0]?.Turnovers ?? 0
  };
  
  const awayTeam: TeamStats = {
    team: game.AwayTeam || 'AWAY',
    points: game.AwayTeamScore ?? 0,
    fgPct: raw.TeamGames?.[1]?.FieldGoalsPercentage ?? 0,
    fg3Pct: raw.TeamGames?.[1]?.ThreePointersPercentage ?? 0,
    ftPct: raw.TeamGames?.[1]?.FreeThrowsPercentage ?? 0,
    rebounds: raw.TeamGames?.[1]?.Rebounds ?? 0,
    assists: raw.TeamGames?.[1]?.Assists ?? 0,
    steals: raw.TeamGames?.[1]?.Steals ?? 0,
    blocks: raw.TeamGames?.[1]?.BlockedShots ?? 0,
    turnovers: raw.TeamGames?.[1]?.Turnovers ?? 0
  };
  
  // Player stats
  const homePlayers: PlayerStats[] = [];
  const awayPlayers: PlayerStats[] = [];
  
  const playerGames = raw.PlayerGames || [];
  for (const p of playerGames) {
    const player: PlayerStats = {
      name: p.Name || 'Unknown',
      position: p.Position || '-',
      minutes: p.Minutes ?? 0,
      points: p.Points ?? 0,
      rebounds: p.Rebounds ?? 0,
      assists: p.Assists ?? 0,
      steals: p.Steals ?? 0,
      blocks: p.BlockedShots ?? 0,
      turnovers: p.Turnovers ?? 0,
      fgMade: p.FieldGoalsMade ?? 0,
      fgAttempts: p.FieldGoalsAttempted ?? 0,
      fg3Made: p.ThreePointersMade ?? 0,
      fg3Attempts: p.ThreePointersAttempted ?? 0,
      ftMade: p.FreeThrowsMade ?? 0,
      ftAttempts: p.FreeThrowsAttempted ?? 0,
      plusMinus: p.PlusMinus ?? 0,
      isStarter: p.Started === true || p.IsStarter === true
    };
    
    if (p.HomeOrAway === 'HOME' || p.Team === game.HomeTeam) {
      homePlayers.push(player);
    } else {
      awayPlayers.push(player);
    }
  }
  
  // Sort by minutes (starters first)
  const sortPlayers = (players: PlayerStats[]) => {
    const starters = players.filter(p => p.isStarter).sort((a, b) => b.minutes - a.minutes);
    const bench = players.filter(p => !p.isStarter).sort((a, b) => b.minutes - a.minutes);
    return [...starters, ...bench];
  };
  
  return {
    status,
    homeTeam,
    awayTeam,
    homePlayers: sortPlayers(homePlayers),
    awayPlayers: sortPlayers(awayPlayers),
    quarterScores
  };
}

function normalizeFootballBoxScore(raw: any): Partial<BoxScoreData> {
  const game = raw.Game || raw;
  
  // Quarter scores
  const quarterScores: BoxScoreData['quarterScores'] = [];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  for (const q of quarters) {
    const homeKey = `HomeScore${q}` as keyof typeof game;
    const awayKey = `AwayScore${q}` as keyof typeof game;
    if (game[homeKey] !== undefined) {
      quarterScores.push({
        period: q,
        homeScore: game[homeKey] ?? 0,
        awayScore: game[awayKey] ?? 0
      });
    }
  }
  
  return {
    status: game.Status || 'SCHEDULED',
    quarterScores,
    homeTeam: {
      team: game.HomeTeam || 'HOME',
      points: game.HomeScore ?? 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: raw.TeamGames?.[0]?.Turnovers ?? 0
    },
    awayTeam: {
      team: game.AwayTeam || 'AWAY',
      points: game.AwayScore ?? 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: raw.TeamGames?.[1]?.Turnovers ?? 0
    },
    homePlayers: [],
    awayPlayers: []
  };
}

function normalizeBaseballBoxScore(raw: any): Partial<BoxScoreData> {
  const game = raw.Game || raw;
  
  // Inning scores
  const quarterScores: BoxScoreData['quarterScores'] = [];
  if (game.Innings?.length) {
    for (const inning of game.Innings) {
      quarterScores.push({
        period: `${inning.InningNumber}`,
        homeScore: inning.HomeTeamRuns ?? 0,
        awayScore: inning.AwayTeamRuns ?? 0
      });
    }
  }
  
  return {
    status: game.Status || 'SCHEDULED',
    quarterScores,
    homeTeam: {
      team: game.HomeTeam || 'HOME',
      points: game.HomeTeamRuns ?? 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: game.HomeTeamHits ?? 0, // Using hits as "rebounds" equivalent
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: game.HomeTeamErrors ?? 0
    },
    awayTeam: {
      team: game.AwayTeam || 'AWAY',
      points: game.AwayTeamRuns ?? 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: game.AwayTeamHits ?? 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: game.AwayTeamErrors ?? 0
    },
    homePlayers: [],
    awayPlayers: []
  };
}

function normalizeHockeyBoxScore(raw: any): Partial<BoxScoreData> {
  const game = raw.Game || raw;
  
  // Period scores
  const quarterScores: BoxScoreData['quarterScores'] = [];
  const periods = ['1', '2', '3'];
  for (const p of periods) {
    const homeKey = `HomeTeamPeriod${p}Score` as keyof typeof game;
    const awayKey = `AwayTeamPeriod${p}Score` as keyof typeof game;
    if (game[homeKey] !== undefined) {
      quarterScores.push({
        period: `P${p}`,
        homeScore: game[homeKey] ?? 0,
        awayScore: game[awayKey] ?? 0
      });
    }
  }
  
  return {
    status: game.Status || 'SCHEDULED',
    quarterScores,
    homeTeam: {
      team: game.HomeTeam || 'HOME',
      points: game.HomeTeamScore ?? 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0
    },
    awayTeam: {
      team: game.AwayTeam || 'AWAY',
      points: game.AwayTeamScore ?? 0,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0
    },
    homePlayers: [],
    awayPlayers: []
  };
}

// ============================================
// HEAD-TO-HEAD HISTORY ENDPOINT
// ============================================

// H2HGame interface for SportsRadar H2H response
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _H2HGame {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  margin: number;
  venue?: string;
}

/**
 * GET /api/game-detail/:gameId/h2h
 * Get last 10 head-to-head matchups between the two teams
 */
gameDetailRouter.get("/:gameId/h2h", async (c) => {
  const gameId = c.req.param("gameId");
  const { sport, numericId } = parseGameId(gameId);
  
  // Try to get team names by fetching game details from SportsRadar
  let homeTeam = '';
  let awayTeam = '';
  
  const srApiKey = c.env.SPORTSRADAR_API_KEY;
  if (srApiKey) {
    const { data: srData } = await fetchSportsRadarBoxScore(srApiKey, sport, numericId);
    if (srData) {
      const game = srData.game || srData;
      homeTeam = game.home?.name || game.home?.alias || 'HOME';
      awayTeam = game.away?.name || game.away?.alias || 'AWAY';
    }
  }
  
  if (!homeTeam || !awayTeam) {
    return c.json({
      gameId,
      homeTeam: 'Unknown',
      awayTeam: 'Unknown',
      matchups: [],
      series: {},
      message: "Could not determine teams for H2H lookup"
    }, 200);
  }
  
  // Fetch H2H data from SportsRadar
  if (srApiKey) {
    const h2hResult = await fetchSportsRadarH2H(
      srApiKey,
      sport,
      homeTeam,
      awayTeam,
      numericId
    );
    
    return c.json({
      gameId,
      homeTeam,
      awayTeam,
      matchups: h2hResult.matchups,
      series: {
        [homeTeam]: h2hResult.homeWins,
        [awayTeam]: h2hResult.awayWins,
        ties: h2hResult.ties
      },
      source: 'sportsradar',
      lastUpdated: new Date().toISOString()
    }, {
      headers: cacheHeaders(3600, { isPublic: true })
    });
  }
  
  // Return empty if no API key
  return c.json({
    gameId,
    homeTeam,
    awayTeam,
    matchups: [],
    series: {},
    source: 'none',
    lastUpdated: new Date().toISOString()
  }, {
    headers: cacheHeaders(3600, { isPublic: true })
  });
});

// ============================================
// INJURIES ENDPOINT
// ============================================

// Injury interface for SDIO (legacy)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _Injury {
  playerName: string;
  team: string;
  position: string;
  status: string;
  injury: string;
  lastUpdated: string;
}

/**
 * GET /api/game-detail/:gameId/injuries
 * Get injury reports for both teams in a game
 */
gameDetailRouter.get("/:gameId/injuries", async (c) => {
  const gameId = c.req.param("gameId");
  const { sport, numericId, isSportsRadar } = parseGameId(gameId);
  const queryHomeTeam = c.req.query("homeTeam") || "";
  const queryAwayTeam = c.req.query("awayTeam") || "";
  
  // Get team names by fetching game details from SportsRadar
  let homeTeam = '';
  let awayTeam = '';
  let homeTeamName = '';
  let awayTeamName = '';
  let homeTeamId = '';
  let awayTeamId = '';
  
  const srApiKey = c.env.SPORTSRADAR_API_KEY;
  if (srApiKey && isSportsRadar) {
    const { data: srData } = await fetchSportsRadarBoxScore(srApiKey, sport, numericId);
    if (srData) {
      const game = srData.game || srData;
      homeTeam = game.home?.alias || game.home?.name || '';
      awayTeam = game.away?.alias || game.away?.name || '';
      homeTeamName = game.home?.name || homeTeam;
      awayTeamName = game.away?.name || awayTeam;
      homeTeamId = String(game.home?.id || '');
      awayTeamId = String(game.away?.id || '');
    }
  }

  // Fallback: allow frontend-provided team names so injuries can still resolve.
  if (!homeTeam || !awayTeam) {
    homeTeam = queryHomeTeam;
    awayTeam = queryAwayTeam;
    homeTeamName = homeTeamName || queryHomeTeam;
    awayTeamName = awayTeamName || queryAwayTeam;
  }
  
  if (!homeTeam || !awayTeam) {
    return c.json({
      gameId,
      injuries: { home: [], away: [] },
      message: "Could not determine teams"
    }, 200);
  }
  
  // Fetch injuries from SportsRadar
  if (!srApiKey || !isSportsRadar) {
    return c.json({
      gameId,
      homeTeam: homeTeamName || homeTeam,
      awayTeam: awayTeamName || awayTeam,
      injuries: { home: [], away: [] },
      message: "Injury data requires API key"
    }, 200);
  }
  
  const { home, away } = await fetchSportsRadarInjuries(
    srApiKey,
    sport,
    homeTeam,
    awayTeam,
    homeTeamId || undefined,
    awayTeamId || undefined
  );
  
  // Sort by severity
  const sortByStatus = (a: SRInjury, b: SRInjury) => {
    const order: Record<string, number> = { 'Out': 0, 'Doubtful': 1, 'Questionable': 2, 'Probable': 3, 'Day-To-Day': 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  };
  
  return c.json({
    gameId,
    homeTeam: homeTeamName || homeTeam,
    awayTeam: awayTeamName || awayTeam,
    injuries: {
      home: home.sort(sortByStatus),
      away: away.sort(sortByStatus)
    },
    lastUpdated: new Date().toISOString()
  }, {
    headers: cacheHeaders(300, { isPublic: true })
  });
});

// ============================================
// LINE MOVEMENT SUMMARY ENDPOINT
// ============================================

/**
 * GET /api/game-detail/:gameId/line-summary
 * Get simplified line movement summary (open, current, high, low)
 */
gameDetailRouter.get("/:gameId/line-summary", async (c) => {
  const gameId = c.req.param("gameId");
  
  // Parse gameId - handle both sr_ and sdio_ formats
  const { numericId, isSportsRadar, sport } = parseGameId(gameId);
  
  // For SportsRadar games, use the new odds_opening/odds_snapshots tables
  if (isSportsRadar) {
    try {
      // Get line movement for spread, total, and moneyline
      const [spreadHome, _spreadAway, totalOver, _totalUnder, mlHome, mlAway] = await Promise.all([
        getLineMovement(c.env.DB, gameId, 'SPREAD', 'HOME'),
        getLineMovement(c.env.DB, gameId, 'SPREAD', 'AWAY'),
        getLineMovement(c.env.DB, gameId, 'TOTAL', 'OVER'),
        getLineMovement(c.env.DB, gameId, 'TOTAL', 'UNDER'),
        getLineMovement(c.env.DB, gameId, 'MONEYLINE', 'HOME'),
        getLineMovement(c.env.DB, gameId, 'MONEYLINE', 'AWAY'),
      ]);
      
      const summary: Record<string, {
        open: number | null;
        current: number | null;
        high: number | null;
        low: number | null;
        openTime: string | null;
        currentTime: string | null;
        movement: number | null;
        direction?: 'UP' | 'DOWN' | 'FLAT';
        snapshots?: Array<{ timestamp: string; line: number | null; price: number | null }>;
      }> = {};
      
      // Spread summary
      if (spreadHome) {
        const snaps = spreadHome.snapshots || [];
        summary.spread = {
          open: spreadHome.openingLine,
          current: spreadHome.currentLine,
          high: snaps.length > 0 ? Math.max(...snaps.map(s => s.line ?? -Infinity)) : null,
          low: snaps.length > 0 ? Math.min(...snaps.map(s => s.line ?? Infinity)) : null,
          openTime: snaps[0]?.timestamp ?? null,
          currentTime: snaps[snaps.length - 1]?.timestamp ?? null,
          movement: spreadHome.movement,
          direction: spreadHome.direction,
          snapshots: snaps,
        };
      }
      
      // Total summary
      if (totalOver) {
        const snaps = totalOver.snapshots || [];
        summary.total = {
          open: totalOver.openingLine,
          current: totalOver.currentLine,
          high: snaps.length > 0 ? Math.max(...snaps.map(s => s.line ?? -Infinity)) : null,
          low: snaps.length > 0 ? Math.min(...snaps.map(s => s.line ?? Infinity)) : null,
          openTime: snaps[0]?.timestamp ?? null,
          currentTime: snaps[snaps.length - 1]?.timestamp ?? null,
          movement: totalOver.movement,
          direction: totalOver.direction,
          snapshots: snaps,
        };
      }
      
      // Moneyline summary
      if (mlHome) {
        const snaps = mlHome.snapshots || [];
        summary.moneyline_home = {
          open: mlHome.openingPrice,
          current: mlHome.currentPrice,
          high: snaps.length > 0 ? Math.max(...snaps.map(s => s.price ?? -Infinity)) : null,
          low: snaps.length > 0 ? Math.min(...snaps.map(s => s.price ?? Infinity)) : null,
          openTime: snaps[0]?.timestamp ?? null,
          currentTime: snaps[snaps.length - 1]?.timestamp ?? null,
          movement: mlHome.movement,
          direction: mlHome.direction,
          snapshots: snaps,
        };
      }
      
      if (mlAway) {
        const snaps = mlAway.snapshots || [];
        summary.moneyline_away = {
          open: mlAway.openingPrice,
          current: mlAway.currentPrice,
          high: snaps.length > 0 ? Math.max(...snaps.map(s => s.price ?? -Infinity)) : null,
          low: snaps.length > 0 ? Math.min(...snaps.map(s => s.price ?? Infinity)) : null,
          openTime: snaps[0]?.timestamp ?? null,
          currentTime: snaps[snaps.length - 1]?.timestamp ?? null,
          movement: mlAway.movement,
          direction: mlAway.direction,
          snapshots: snaps,
        };
      }
      
      return c.json({
        gameId,
        sport,
        summary,
        source: 'sportsradar',
        lastUpdated: new Date().toISOString()
      }, {
        headers: cacheHeaders(60, { isPublic: true })
      });
    } catch (err) {
      console.error('[Line Summary] SportsRadar error:', err);
      // Fall through to legacy lookup
    }
  }
  
  // For legacy SDIO games or as fallback, use line_history table
  const searchId = isSportsRadar ? gameId : numericId;
  
  // Query database for line history - search with both full ID and numeric portion
  let historyResult: { results?: unknown[] } = { results: [] };
  try {
    historyResult = await c.env.DB.prepare(`
      SELECT
        market_type,
        MIN(value) as low,
        MAX(value) as high,
        (SELECT value FROM line_history lh2
         WHERE (lh2.game_id = ? OR lh2.game_id = ? OR lh2.game_id LIKE ?) AND lh2.market_type = line_history.market_type
         ORDER BY timestamp ASC LIMIT 1) as open_value,
        (SELECT value FROM line_history lh3
         WHERE (lh3.game_id = ? OR lh3.game_id = ? OR lh3.game_id LIKE ?) AND lh3.market_type = line_history.market_type
         ORDER BY timestamp DESC LIMIT 1) as current_value,
        (SELECT timestamp FROM line_history lh4
         WHERE (lh4.game_id = ? OR lh4.game_id = ? OR lh4.game_id LIKE ?) AND lh4.market_type = line_history.market_type
         ORDER BY timestamp ASC LIMIT 1) as open_time,
        (SELECT timestamp FROM line_history lh5
         WHERE (lh5.game_id = ? OR lh5.game_id = ? OR lh5.game_id LIKE ?) AND lh5.market_type = line_history.market_type
         ORDER BY timestamp DESC LIMIT 1) as current_time
      FROM line_history
      WHERE game_id = ? OR game_id = ? OR game_id LIKE ?
      GROUP BY market_type
    `).bind(
      searchId, numericId, `%${numericId}%`,
      searchId, numericId, `%${numericId}%`,
      searchId, numericId, `%${numericId}%`,
      searchId, numericId, `%${numericId}%`,
      searchId, numericId, `%${numericId}%`
    ).all();
  } catch (error) {
    console.warn("[Line Summary] line_history lookup failed; returning sparse summary", error);
  }
  
  const summary: Record<string, {
    open: number | null;
    current: number | null;
    high: number | null;
    low: number | null;
    openTime: string | null;
    currentTime: string | null;
    movement: number | null;
  }> = {};
  
  if (historyResult.results?.length) {
    for (const row of historyResult.results) {
      const marketType = String(row.market_type);
      const openVal = row.open_value as number | null;
      const currentVal = row.current_value as number | null;
      
      summary[marketType] = {
        open: openVal,
        current: currentVal,
        high: row.high as number | null,
        low: row.low as number | null,
        openTime: row.open_time as string | null,
        currentTime: row.current_time as string | null,
        movement: openVal !== null && currentVal !== null 
          ? Math.round((currentVal - openVal) * 10) / 10 
          : null
      };
    }
  }
  
  // Also try sdio_odds_current for opening odds
  if (!summary.spread || !summary.total) {
    try {
      const oddsResult = await c.env.DB.prepare(`
        SELECT oc.* FROM sdio_odds_current oc
        JOIN sdio_games g ON g.id = oc.game_id
        WHERE g.provider_game_id = ?
        LIMIT 1
      `).bind(numericId).first();

      if (oddsResult) {
        if (!summary.spread && oddsResult.open_spread) {
          summary.spread = {
            open: oddsResult.open_spread as number,
            current: oddsResult.spread_home as number | null,
            high: null,
            low: null,
            openTime: null,
            currentTime: oddsResult.last_updated as string | null,
            movement: oddsResult.movement_spread as number | null
          };
        }
        if (!summary.total && oddsResult.open_total) {
          summary.total = {
            open: oddsResult.open_total as number,
            current: oddsResult.total as number | null,
            high: null,
            low: null,
            openTime: null,
            currentTime: oddsResult.last_updated as string | null,
            movement: oddsResult.movement_total as number | null
          };
        }
      }
    } catch (error) {
      console.warn("[Line Summary] sdio_odds_current fallback unavailable", error);
    }
  }
  
  return c.json({
    gameId,
    summary,
    lastUpdated: new Date().toISOString()
  }, {
    headers: cacheHeaders(60, { isPublic: true }) // 1 min cache
  });
});

export { gameDetailRouter };
