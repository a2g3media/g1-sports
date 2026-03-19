// =====================================================
// DEMO GAMES DATA - LIVE SCORES SYSTEM
// Provides seeded game data for demo mode when no
// external provider is configured.
// =====================================================

import type { Game, GameStatus, GameScoreUpdate } from "@/shared/types";

// Team data with codes and full names
const TEAMS: Record<string, Array<{ code: string; name: string }>> = {
  nfl: [
    { code: "KC", name: "Chiefs" },
    { code: "BUF", name: "Bills" },
    { code: "BAL", name: "Ravens" },
    { code: "PIT", name: "Steelers" },
    { code: "PHI", name: "Eagles" },
    { code: "DAL", name: "Cowboys" },
    { code: "SF", name: "49ers" },
    { code: "SEA", name: "Seahawks" },
    { code: "MIA", name: "Dolphins" },
    { code: "NYJ", name: "Jets" },
    { code: "CIN", name: "Bengals" },
    { code: "CLE", name: "Browns" },
    { code: "GB", name: "Packers" },
    { code: "CHI", name: "Bears" },
    { code: "MIN", name: "Vikings" },
    { code: "DET", name: "Lions" },
    { code: "NE", name: "Patriots" },
    { code: "DEN", name: "Broncos" },
    { code: "LAC", name: "Chargers" },
    { code: "LV", name: "Raiders" },
    { code: "ATL", name: "Falcons" },
    { code: "NO", name: "Saints" },
    { code: "TB", name: "Buccaneers" },
    { code: "CAR", name: "Panthers" },
    { code: "ARI", name: "Cardinals" },
    { code: "LAR", name: "Rams" },
    { code: "WAS", name: "Commanders" },
    { code: "NYG", name: "Giants" },
    { code: "TEN", name: "Titans" },
    { code: "IND", name: "Colts" },
    { code: "JAX", name: "Jaguars" },
    { code: "HOU", name: "Texans" },
  ],
  nba: [
    { code: "LAL", name: "Lakers" },
    { code: "BOS", name: "Celtics" },
    { code: "GSW", name: "Warriors" },
    { code: "PHX", name: "Suns" },
    { code: "MIL", name: "Bucks" },
    { code: "MIA", name: "Heat" },
    { code: "DEN", name: "Nuggets" },
    { code: "DAL", name: "Mavericks" },
    { code: "LAC", name: "Clippers" },
    { code: "OKC", name: "Thunder" },
    { code: "PHI", name: "76ers" },
    { code: "NYK", name: "Knicks" },
    { code: "BKN", name: "Nets" },
    { code: "CHI", name: "Bulls" },
    { code: "CLE", name: "Cavaliers" },
    { code: "IND", name: "Pacers" },
    { code: "ATL", name: "Hawks" },
    { code: "TOR", name: "Raptors" },
    { code: "SAC", name: "Kings" },
    { code: "MIN", name: "Timberwolves" },
  ],
  mlb: [
    { code: "NYY", name: "Yankees" },
    { code: "LAD", name: "Dodgers" },
    { code: "BOS", name: "Red Sox" },
    { code: "CHC", name: "Cubs" },
    { code: "SF", name: "Giants" },
    { code: "STL", name: "Cardinals" },
    { code: "ATL", name: "Braves" },
    { code: "PHI", name: "Phillies" },
    { code: "HOU", name: "Astros" },
    { code: "TEX", name: "Rangers" },
    { code: "SD", name: "Padres" },
    { code: "ARI", name: "Diamondbacks" },
    { code: "SEA", name: "Mariners" },
    { code: "TOR", name: "Blue Jays" },
    { code: "BAL", name: "Orioles" },
    { code: "TB", name: "Rays" },
  ],
  nhl: [
    { code: "EDM", name: "Oilers" },
    { code: "FLA", name: "Panthers" },
    { code: "VGK", name: "Golden Knights" },
    { code: "DAL", name: "Stars" },
    { code: "COL", name: "Avalanche" },
    { code: "CAR", name: "Hurricanes" },
    { code: "NYR", name: "Rangers" },
    { code: "BOS", name: "Bruins" },
    { code: "TOR", name: "Maple Leafs" },
    { code: "TBL", name: "Lightning" },
    { code: "WPG", name: "Jets" },
    { code: "VAN", name: "Canucks" },
    { code: "MIN", name: "Wild" },
    { code: "LAK", name: "Kings" },
    { code: "NJD", name: "Devils" },
    { code: "PIT", name: "Penguins" },
  ],
  ncaaf: [
    { code: "BAMA", name: "Alabama" },
    { code: "UGA", name: "Georgia" },
    { code: "OSU", name: "Ohio State" },
    { code: "MICH", name: "Michigan" },
    { code: "TEX", name: "Texas" },
    { code: "USC", name: "USC" },
    { code: "FSU", name: "Florida State" },
    { code: "ORE", name: "Oregon" },
    { code: "LSU", name: "LSU" },
    { code: "CLEM", name: "Clemson" },
    { code: "PSU", name: "Penn State" },
    { code: "ND", name: "Notre Dame" },
    { code: "OU", name: "Oklahoma" },
    { code: "TENN", name: "Tennessee" },
    { code: "MISS", name: "Ole Miss" },
    { code: "UW", name: "Washington" },
  ],
  ncaab: [
    { code: "DUKE", name: "Duke" },
    { code: "UNC", name: "North Carolina" },
    { code: "UK", name: "Kentucky" },
    { code: "KU", name: "Kansas" },
    { code: "UCLA", name: "UCLA" },
    { code: "ZAGA", name: "Gonzaga" },
    { code: "UCONN", name: "UConn" },
    { code: "PUR", name: "Purdue" },
    { code: "ARIZ", name: "Arizona" },
    { code: "BAY", name: "Baylor" },
    { code: "HOU", name: "Houston" },
    { code: "MARQ", name: "Marquette" },
    { code: "TENN", name: "Tennessee" },
    { code: "CREI", name: "Creighton" },
    { code: "MSU", name: "Michigan State" },
    { code: "IU", name: "Indiana" },
  ],
  soccer: [
    { code: "MCI", name: "Manchester City" },
    { code: "ARS", name: "Arsenal" },
    { code: "LIV", name: "Liverpool" },
    { code: "MUN", name: "Manchester United" },
    { code: "CHE", name: "Chelsea" },
    { code: "TOT", name: "Tottenham" },
    { code: "NEW", name: "Newcastle" },
    { code: "AVL", name: "Aston Villa" },
    { code: "BHA", name: "Brighton" },
    { code: "WHU", name: "West Ham" },
    { code: "FUL", name: "Fulham" },
    { code: "BRE", name: "Brentford" },
  ],
};

// League display names
const LEAGUE_NAMES: Record<string, string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ncaaf: "NCAA Football",
  ncaab: "NCAA Basketball",
  soccer: "Premier League",
};

// Period labels by sport
function getPeriodLabel(sport: string, period: number, isHalftime?: boolean): string {
  if (isHalftime) return "Halftime";
  
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return ["1st", "2nd", "3rd", "4th"][period - 1] || `${period}th`;
    case "nba":
    case "ncaab":
      return ["1st", "2nd", "3rd", "4th"][period - 1] || `OT${period - 4}`;
    case "nhl":
      return ["1st", "2nd", "3rd"][period - 1] || `OT${period - 3}`;
    case "mlb":
      return period <= 9 ? `${period}${getOrdinalSuffix(period)}` : `${period}th`;
    case "soccer":
      return period === 1 ? "1st Half" : "2nd Half";
    default:
      return `${period}`;
  }
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Generate random clock based on sport
function generateClock(sport: string, period: number): string {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return `${Math.floor(Math.random() * 15)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
    case "nba":
    case "ncaab":
      return `${Math.floor(Math.random() * 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
    case "nhl":
      return `${Math.floor(Math.random() * 20)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
    case "soccer": {
      const baseMinute = period === 1 ? Math.floor(Math.random() * 45) : 45 + Math.floor(Math.random() * 45);
      return `${baseMinute}'`;
    }
    case "mlb":
      return ""; // Baseball doesn't have a clock
    default:
      return "";
  }
}

// Mutable demo games store (allows simulation updates)
let demoGamesStore: Game[] = [];
let lastGeneratedDate: string = "";

// Generate today's demo games for all sports
export function generateDemoGames(): Game[] {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  
  // Only regenerate if date changed
  if (lastGeneratedDate === today && demoGamesStore.length > 0) {
    return demoGamesStore;
  }
  
  const games: Game[] = [];
  let gameId = 1;
  
  // Generate games for each sport
  const sportsConfig: Array<{ sport: string; gamesCount: number; week?: string }> = [
    { sport: "nfl", gamesCount: 14, week: "Week 14" },
    { sport: "nba", gamesCount: 8 },
    { sport: "nhl", gamesCount: 6 },
    { sport: "ncaaf", gamesCount: 10, week: "Week 14" },
    { sport: "ncaab", gamesCount: 12 },
    { sport: "mlb", gamesCount: 8 },
    { sport: "soccer", gamesCount: 6, week: "Matchday 18" },
  ];
  
  for (const config of sportsConfig) {
    const teams = TEAMS[config.sport] || [];
    if (teams.length < 2) continue;
    
    for (let i = 0; i < config.gamesCount && i * 2 + 1 < teams.length; i++) {
      const homeTeam = teams[i * 2];
      const awayTeam = teams[i * 2 + 1];
      
      // Determine game status based on position
      // Mix of: finals (past), live (current), scheduled (upcoming)
      let status: GameStatus;
      let startTime: Date;
      let period: number | undefined;
      let clock: string | undefined;
      let homeScore: number | undefined;
      let awayScore: number | undefined;
      let isHalftime = false;
      
      const statusRoll = Math.random();
      
      if (i < 2) {
        // First 2 games: LIVE
        status = "IN_PROGRESS";
        startTime = new Date(now.getTime() - (30 + Math.random() * 90) * 60000);
        period = Math.floor(Math.random() * 4) + 1;
        clock = generateClock(config.sport, period);
        isHalftime = Math.random() < 0.1;
        homeScore = Math.floor(Math.random() * getMaxScore(config.sport));
        awayScore = Math.floor(Math.random() * getMaxScore(config.sport));
      } else if (i < 5) {
        // Next 3 games: FINAL
        status = "FINAL";
        startTime = new Date(now.getTime() - (120 + i * 60) * 60000);
        homeScore = Math.floor(Math.random() * getMaxScore(config.sport)) + getMinScore(config.sport);
        awayScore = Math.floor(Math.random() * getMaxScore(config.sport)) + getMinScore(config.sport);
      } else if (statusRoll < 0.1) {
        // 10% chance: POSTPONED
        status = "POSTPONED";
        startTime = new Date(now.getTime() + (i - 4) * 60 * 60000);
      } else {
        // Rest: SCHEDULED
        status = "SCHEDULED";
        startTime = new Date(now.getTime() + (i - 4) * 60 * 60000);
      }
      
      games.push({
        game_id: `demo_${config.sport}_${gameId}`,
        external_id: `ext_${gameId}`,
        sport: config.sport,
        league: LEAGUE_NAMES[config.sport] || config.sport.toUpperCase(),
        season: "2024-2025",
        week: config.week,
        start_time: startTime.toISOString(),
        status,
        period,
        period_label: period ? getPeriodLabel(config.sport, period, isHalftime) : undefined,
        clock,
        is_halftime: isHalftime,
        home_team_code: homeTeam.code,
        home_team_name: homeTeam.name,
        away_team_code: awayTeam.code,
        away_team_name: awayTeam.name,
        home_score: homeScore,
        away_score: awayScore,
        broadcast: getBroadcast(config.sport, i),
        last_updated_at: now.toISOString(),
        source_provider: "demo",
      });
      
      gameId++;
    }
  }
  
  demoGamesStore = games;
  lastGeneratedDate = today;
  return games;
}

function getMaxScore(sport: string): number {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return 42;
    case "nba":
    case "ncaab":
      return 120;
    case "mlb":
      return 12;
    case "nhl":
      return 6;
    case "soccer":
      return 4;
    default:
      return 30;
  }
}

function getMinScore(sport: string): number {
  switch (sport) {
    case "nba":
    case "ncaab":
      return 70;
    default:
      return 0;
  }
}

function getBroadcast(sport: string, index: number): string {
  const broadcasts: Record<string, string[]> = {
    nfl: ["CBS", "FOX", "NBC", "ESPN", "Amazon Prime"],
    nba: ["ESPN", "TNT", "ABC", "NBA TV"],
    nhl: ["ESPN", "TNT", "NHL Network"],
    ncaaf: ["ESPN", "ABC", "FOX", "CBS"],
    ncaab: ["ESPN", "CBS", "FOX", "ESPN2"],
    mlb: ["ESPN", "FOX", "TBS", "MLB Network"],
    soccer: ["NBC", "Peacock", "USA Network"],
  };
  
  const options = broadcasts[sport] || ["ESPN"];
  return options[index % options.length];
}

// =====================================================
// QUERY FUNCTIONS
// =====================================================

export function getDemoGames(): Game[] {
  if (demoGamesStore.length === 0) {
    generateDemoGames();
  }
  return demoGamesStore;
}

export function getDemoGameById(gameId: string): Game | undefined {
  return getDemoGames().find((g) => g.game_id === gameId);
}

export function getDemoGamesBySport(sport: string): Game[] {
  return getDemoGames().filter((g) => g.sport === sport);
}

export function getDemoGamesByStatus(status: GameStatus): Game[] {
  return getDemoGames().filter((g) => g.status === status);
}

export function getLiveGames(): Game[] {
  return getDemoGamesByStatus("IN_PROGRESS");
}

export function getUpcomingGames(): Game[] {
  return getDemoGamesByStatus("SCHEDULED").sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}

export function getFinalGames(): Game[] {
  return getDemoGamesByStatus("FINAL").sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );
}

export function getTodaysGames(): Game[] {
  const today = new Date().toISOString().split("T")[0];
  return getDemoGames().filter((g) => g.start_time.startsWith(today));
}

// =====================================================
// SIMULATION FUNCTIONS (for Demo Control Center)
// =====================================================

export function simulateScoreUpdate(gameId: string): GameScoreUpdate | null {
  const game = getDemoGameById(gameId);
  if (!game || game.status !== "IN_PROGRESS") return null;
  
  // Randomly increment a score
  const scoringTeam = Math.random() > 0.5 ? "home" : "away";
  const points = getScoreIncrement(game.sport);
  
  if (scoringTeam === "home") {
    game.home_score = (game.home_score || 0) + points;
  } else {
    game.away_score = (game.away_score || 0) + points;
  }
  
  // Maybe advance clock/period
  if (Math.random() < 0.3) {
    advanceGameClock(game);
  }
  
  game.last_updated_at = new Date().toISOString();
  
  return {
    game_id: game.game_id,
    status: game.status,
    period: game.period,
    period_label: game.period_label,
    clock: game.clock,
    home_score: game.home_score,
    away_score: game.away_score,
    last_updated_at: game.last_updated_at,
  };
}

function getScoreIncrement(sport: string): number {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return [3, 6, 7][Math.floor(Math.random() * 3)];
    case "nba":
    case "ncaab":
      return [1, 2, 3][Math.floor(Math.random() * 3)];
    case "mlb":
      return 1;
    case "nhl":
      return 1;
    case "soccer":
      return 1;
    default:
      return 1;
  }
}

function advanceGameClock(game: Game): void {
  const sport = game.sport;
  
  // Advance period if we're late in the game
  if (game.period && Math.random() < 0.2) {
    const maxPeriods = sport === "mlb" ? 9 : sport === "soccer" ? 2 : sport === "nhl" ? 3 : 4;
    if (game.period < maxPeriods) {
      game.period++;
      game.period_label = getPeriodLabel(sport, game.period);
      game.clock = generateClock(sport, game.period);
    } else {
      // Game ended
      game.status = "FINAL";
      game.clock = undefined;
      game.period_label = "Final";
    }
  } else if (game.clock) {
    // Just update the clock
    game.clock = generateClock(sport, game.period || 1);
  }
}

export function simulateGameStateChange(gameId: string, newStatus: GameStatus): Game | null {
  const game = getDemoGameById(gameId);
  if (!game) return null;
  
  const previousStatus = game.status;
  game.status = newStatus;
  game.last_updated_at = new Date().toISOString();
  
  if (newStatus === "IN_PROGRESS" && previousStatus === "SCHEDULED") {
    game.period = 1;
    game.period_label = getPeriodLabel(game.sport, 1);
    game.clock = generateClock(game.sport, 1);
    game.home_score = 0;
    game.away_score = 0;
  } else if (newStatus === "FINAL") {
    game.clock = undefined;
    game.period_label = "Final";
  }
  
  return game;
}

// Reset demo games (for testing)
export function resetDemoGames(): void {
  lastGeneratedDate = "";
  demoGamesStore = [];
  generateDemoGames();
}

// Initialize on import
generateDemoGames();

console.log("[Demo Games] Loaded:", {
  total: demoGamesStore.length,
  live: getLiveGames().length,
  scheduled: getUpcomingGames().length,
  final: getFinalGames().length,
});
