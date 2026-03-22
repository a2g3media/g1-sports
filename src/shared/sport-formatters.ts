// Sport-Aware Response Formatting
// Provides correct terminology, units, and presentation for each sport

// ==========================================
// SPORT CATEGORY DETECTION
// ==========================================

export type SportCategory = 
  | "soccer" 
  | "american_football" 
  | "basketball" 
  | "baseball" 
  | "hockey" 
  | "tennis" 
  | "golf" 
  | "combat" 
  | "motorsport" 
  | "cricket"
  | "rugby"
  | "cycling"
  | "esports"
  | "olympics"
  | "unknown";

export function detectSportCategory(sportKey: string): SportCategory {
  const key = sportKey.toLowerCase();
  
  if (key.includes("soccer") || key.includes("epl") || key.includes("uefa") || key.includes("la_liga") || 
      key.includes("bundesliga") || key.includes("serie_a") || key.includes("ligue") || key.includes("mls") ||
      key.includes("copa") || key.includes("fifa") || key.includes("afcon") || key.includes("eredivisie")) {
    return "soccer";
  }
  if (key.includes("americanfootball") || key.includes("nfl") || key.includes("ncaaf") || 
      key.includes("cfl") || key.includes("xfl") || key.includes("usfl")) {
    return "american_football";
  }
  if (key.includes("basketball") || key.includes("nba") || key.includes("wnba") || 
      key.includes("ncaab") || key.includes("euroleague")) {
    return "basketball";
  }
  if (key.includes("baseball") || key.includes("mlb") || key.includes("npb") || key.includes("kbo")) {
    return "baseball";
  }
  if (key.includes("icehockey") || key.includes("nhl") || key.includes("khl") || key.includes("shl")) {
    return "hockey";
  }
  if (key.includes("tennis") || key.includes("atp") || key.includes("wta") || 
      key.includes("wimbledon") || key.includes("open")) {
    return "tennis";
  }
  if (key.includes("golf") || key.includes("pga") || key.includes("lpga") || 
      key.includes("masters") || key.includes("ryder")) {
    return "golf";
  }
  if (key.includes("mma") || key.includes("ufc") || key.includes("boxing") || 
      key.includes("bellator") || key.includes("pfl")) {
    return "combat";
  }
  if (key.includes("motorsport") || key.includes("f1") || key.includes("formula") || 
      key.includes("nascar") || key.includes("indycar") || key.includes("motogp") ||
      key.includes("wec") || key.includes("wrc")) {
    return "motorsport";
  }
  if (key.includes("cricket") || key.includes("ipl") || key.includes("bbl") || key.includes("ashes")) {
    return "cricket";
  }
  if (key.includes("rugby") || key.includes("six_nations")) {
    return "rugby";
  }
  if (key.includes("cycling") || key.includes("tour_de") || key.includes("giro") || key.includes("vuelta")) {
    return "cycling";
  }
  if (key.includes("esports") || key.includes("league_of_legends") || key.includes("csgo") || 
      key.includes("dota") || key.includes("valorant")) {
    return "esports";
  }
  if (key.includes("olympics")) {
    return "olympics";
  }
  
  return "unknown";
}

// ==========================================
// EVENT TERMINOLOGY
// ==========================================

export interface SportTerminology {
  event: string;           // "match", "game", "bout", "race"
  eventPlural: string;     // "matches", "games", "bouts", "races"
  contest: string;         // "fixture", "game", "fight", "race"
  competitor: string;      // "team", "player", "fighter", "driver"
  competitorPlural: string;
  venue: string;           // "stadium", "arena", "octagon", "track"
  period: string;          // "half", "quarter", "period", "round", "lap", "set"
  periodPlural: string;
  score: string;           // "score", "score", "result", "position"
  win: string;             // "win", "victory", "knockout", "checkered flag"
  loss: string;            // "defeat", "loss", "knockout loss", "DNF"
  draw: string;            // "draw", "tie", "draw", "N/A"
  standings: string;       // "table", "standings", "rankings", "championship"
  champion: string;        // "champion", "champion", "champion", "champion"
}

const SPORT_TERMINOLOGY: Record<SportCategory, SportTerminology> = {
  soccer: {
    event: "match",
    eventPlural: "matches",
    contest: "fixture",
    competitor: "team",
    competitorPlural: "teams",
    venue: "stadium",
    period: "half",
    periodPlural: "halves",
    score: "score",
    win: "win",
    loss: "defeat",
    draw: "draw",
    standings: "table",
    champion: "champion",
  },
  american_football: {
    event: "game",
    eventPlural: "games",
    contest: "game",
    competitor: "team",
    competitorPlural: "teams",
    venue: "stadium",
    period: "quarter",
    periodPlural: "quarters",
    score: "score",
    win: "win",
    loss: "loss",
    draw: "tie",
    standings: "standings",
    champion: "champion",
  },
  basketball: {
    event: "game",
    eventPlural: "games",
    contest: "game",
    competitor: "team",
    competitorPlural: "teams",
    venue: "arena",
    period: "quarter",
    periodPlural: "quarters",
    score: "score",
    win: "win",
    loss: "loss",
    draw: "tie",
    standings: "standings",
    champion: "champion",
  },
  baseball: {
    event: "game",
    eventPlural: "games",
    contest: "game",
    competitor: "team",
    competitorPlural: "teams",
    venue: "ballpark",
    period: "inning",
    periodPlural: "innings",
    score: "score",
    win: "win",
    loss: "loss",
    draw: "tie",
    standings: "standings",
    champion: "World Series champion",
  },
  hockey: {
    event: "game",
    eventPlural: "games",
    contest: "game",
    competitor: "team",
    competitorPlural: "teams",
    venue: "arena",
    period: "period",
    periodPlural: "periods",
    score: "score",
    win: "win",
    loss: "loss",
    draw: "tie",
    standings: "standings",
    champion: "Stanley Cup champion",
  },
  tennis: {
    event: "match",
    eventPlural: "matches",
    contest: "match",
    competitor: "player",
    competitorPlural: "players",
    venue: "court",
    period: "set",
    periodPlural: "sets",
    score: "score",
    win: "win",
    loss: "defeat",
    draw: "N/A",
    standings: "rankings",
    champion: "champion",
  },
  golf: {
    event: "tournament",
    eventPlural: "tournaments",
    contest: "round",
    competitor: "player",
    competitorPlural: "players",
    venue: "course",
    period: "round",
    periodPlural: "rounds",
    score: "score",
    win: "win",
    loss: "missed cut",
    draw: "playoff",
    standings: "leaderboard",
    champion: "champion",
  },
  combat: {
    event: "bout",
    eventPlural: "bouts",
    contest: "fight",
    competitor: "fighter",
    competitorPlural: "fighters",
    venue: "arena",
    period: "round",
    periodPlural: "rounds",
    score: "result",
    win: "victory",
    loss: "defeat",
    draw: "draw",
    standings: "rankings",
    champion: "champion",
  },
  motorsport: {
    event: "race",
    eventPlural: "races",
    contest: "Grand Prix",
    competitor: "driver",
    competitorPlural: "drivers",
    venue: "circuit",
    period: "lap",
    periodPlural: "laps",
    score: "position",
    win: "victory",
    loss: "DNF",
    draw: "N/A",
    standings: "championship",
    champion: "World Champion",
  },
  cricket: {
    event: "match",
    eventPlural: "matches",
    contest: "match",
    competitor: "team",
    competitorPlural: "teams",
    venue: "ground",
    period: "innings",
    periodPlural: "innings",
    score: "score",
    win: "win",
    loss: "defeat",
    draw: "draw",
    standings: "table",
    champion: "champion",
  },
  rugby: {
    event: "match",
    eventPlural: "matches",
    contest: "fixture",
    competitor: "team",
    competitorPlural: "teams",
    venue: "stadium",
    period: "half",
    periodPlural: "halves",
    score: "score",
    win: "win",
    loss: "defeat",
    draw: "draw",
    standings: "table",
    champion: "champion",
  },
  cycling: {
    event: "stage",
    eventPlural: "stages",
    contest: "race",
    competitor: "rider",
    competitorPlural: "riders",
    venue: "route",
    period: "stage",
    periodPlural: "stages",
    score: "time",
    win: "stage win",
    loss: "time lost",
    draw: "N/A",
    standings: "general classification",
    champion: "champion",
  },
  esports: {
    event: "match",
    eventPlural: "matches",
    contest: "game",
    competitor: "team",
    competitorPlural: "teams",
    venue: "arena",
    period: "map",
    periodPlural: "maps",
    score: "score",
    win: "win",
    loss: "loss",
    draw: "draw",
    standings: "standings",
    champion: "champion",
  },
  olympics: {
    event: "event",
    eventPlural: "events",
    contest: "competition",
    competitor: "athlete",
    competitorPlural: "athletes",
    venue: "venue",
    period: "round",
    periodPlural: "rounds",
    score: "result",
    win: "gold",
    loss: "no medal",
    draw: "N/A",
    standings: "medal table",
    champion: "gold medalist",
  },
  unknown: {
    event: "event",
    eventPlural: "events",
    contest: "competition",
    competitor: "competitor",
    competitorPlural: "competitors",
    venue: "venue",
    period: "period",
    periodPlural: "periods",
    score: "score",
    win: "win",
    loss: "loss",
    draw: "draw",
    standings: "standings",
    champion: "champion",
  },
};

export function getTerminology(sportKey: string): SportTerminology {
  const category = detectSportCategory(sportKey);
  return SPORT_TERMINOLOGY[category];
}

// ==========================================
// SCORE FORMATTING
// ==========================================

export interface ScoreFormatOptions {
  homeScore: number;
  awayScore: number;
  homeTeam?: string;
  awayTeam?: string;
  sportKey: string;
  isLive?: boolean;
  period?: string | number;
  timeRemaining?: string;
}

export function formatScore(options: ScoreFormatOptions): string {
  const { homeScore, awayScore, homeTeam, awayTeam, sportKey, isLive, period, timeRemaining } = options;
  const category = detectSportCategory(sportKey);
  
  let scoreStr: string;
  
  switch (category) {
    case "soccer":
      // Soccer: "2-1" or "Liverpool 2-1 Manchester United"
      scoreStr = homeTeam && awayTeam 
        ? `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`
        : `${homeScore}-${awayScore}`;
      break;
      
    case "tennis":
      // Tennis: scores are usually sets/games, handled separately
      scoreStr = `${homeScore}-${awayScore}`;
      break;
      
    case "cricket":
      // Cricket: "245/6" (runs/wickets) - simplified here
      scoreStr = `${homeScore}-${awayScore}`;
      break;
      
    case "golf":
      // Golf: relative to par
      scoreStr = formatGolfScoreValue(homeScore);
      break;
      
    case "motorsport":
      // Motorsport: position "P1", "P2"
      scoreStr = `P${homeScore}`;
      break;
      
    default:
      // American sports: "24-17" or higher score first
      scoreStr = homeTeam && awayTeam
        ? `${homeTeam} ${homeScore}, ${awayTeam} ${awayScore}`
        : `${homeScore}-${awayScore}`;
  }
  
  // Add live indicator
  if (isLive) {
    const periodStr = formatPeriod(period, sportKey);
    const timeStr = timeRemaining ? ` - ${timeRemaining}` : "";
    scoreStr += ` (${periodStr}${timeStr})`;
  }
  
  return scoreStr;
}

function formatGolfScoreValue(score: number): string {
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return score.toString();
}

// ==========================================
// PERIOD/TIME FORMATTING
// ==========================================

export function formatPeriod(period: string | number | undefined, sportKey: string): string {
  if (!period) return "";
  
  const category = detectSportCategory(sportKey);
  const sportKeyLower = sportKey.toLowerCase();
  const isNcaab = sportKeyLower.includes("ncaab");
  const p = typeof period === "number" ? period : parseInt(period) || period;
  
  switch (category) {
    case "soccer":
      if (p === 1 || period === "1H") return "1st Half";
      if (p === 2 || period === "2H") return "2nd Half";
      if (period === "HT") return "Half Time";
      if (period === "FT") return "Full Time";
      if (period === "ET" || period === "AET") return "Extra Time";
      if (period === "PEN") return "Penalties";
      return String(period);
      
    case "american_football":
      if (typeof p === "number") {
        return p <= 4 ? `${["1st", "2nd", "3rd", "4th"][p-1]} Quarter` : `OT${p-4}`;
      }
      return String(period);
      
    case "basketball":
      if (typeof p === "number") {
        if (isNcaab) {
          return p <= 2 ? `${p}H` : `OT${p - 2}`;
        }
        return p <= 4 ? `Q${p}` : `OT${p-4}`;
      }
      if (isNcaab) {
        if (period === "Q1") return "1H";
        if (period === "Q2") return "2H";
      }
      return String(period);
      
    case "baseball":
      if (typeof p === "number") {
        return p <= 9 ? `${ordinal(p)} Inning` : `${p}th Inning`;
      }
      return String(period);
      
    case "hockey":
      if (typeof p === "number") {
        const ordinals = ["1st", "2nd", "3rd"];
        return p <= 3 ? `${ordinals[p-1]} Period` : `OT${p-3}`;
      }
      return String(period);
      
    case "tennis":
      if (typeof p === "number") {
        return `Set ${p}`;
      }
      return String(period);
      
    case "combat":
      if (typeof p === "number") {
        return `Round ${p}`;
      }
      return String(period);
      
    case "motorsport":
      if (typeof p === "number") {
        return `Lap ${p}`;
      }
      return String(period);
      
    default:
      return String(period);
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ==========================================
// STATUS FORMATTING
// ==========================================

export type EventStatus = 
  | "scheduled" 
  | "live" 
  | "halftime"
  | "completed" 
  | "postponed" 
  | "cancelled" 
  | "suspended"
  | "delayed";

export function formatStatus(status: string, sportKey: string): { label: string; color: string } {
  const category = detectSportCategory(sportKey);
  const normalizedStatus = status.toLowerCase();
  
  // Live statuses
  if (normalizedStatus.includes("live") || normalizedStatus.includes("in_progress") || 
      normalizedStatus.includes("playing") || normalizedStatus.includes("racing")) {
    return { label: "LIVE", color: "red" };
  }
  
  // Halftime/intermission
  if (normalizedStatus.includes("half") || normalizedStatus.includes("intermission") ||
      normalizedStatus.includes("break")) {
    return { label: category === "hockey" ? "Intermission" : "Half Time", color: "yellow" };
  }
  
  // Completed
  if (normalizedStatus.includes("completed") || normalizedStatus.includes("final") ||
      normalizedStatus.includes("finished") || normalizedStatus.includes("ft")) {
    return { label: "Final", color: "gray" };
  }
  
  // Scheduled
  if (normalizedStatus.includes("scheduled") || normalizedStatus.includes("upcoming") ||
      normalizedStatus === "not_started") {
    return { label: "Upcoming", color: "blue" };
  }
  
  // Postponed
  if (normalizedStatus.includes("postponed")) {
    return { label: "Postponed", color: "orange" };
  }
  
  // Cancelled
  if (normalizedStatus.includes("cancelled") || normalizedStatus.includes("canceled")) {
    return { label: "Cancelled", color: "red" };
  }
  
  // Suspended/Delayed
  if (normalizedStatus.includes("suspended") || normalizedStatus.includes("delayed")) {
    return { label: "Delayed", color: "yellow" };
  }
  
  return { label: status, color: "gray" };
}

// ==========================================
// STANDINGS FORMATTING
// ==========================================

export interface StandingsColumn {
  key: string;
  label: string;
  description?: string;
}

export function getStandingsColumns(sportKey: string): StandingsColumn[] {
  const category = detectSportCategory(sportKey);
  
  switch (category) {
    case "soccer":
      return [
        { key: "pos", label: "#", description: "Position" },
        { key: "team", label: "Team", description: "Team name" },
        { key: "played", label: "P", description: "Matches played" },
        { key: "won", label: "W", description: "Wins" },
        { key: "drawn", label: "D", description: "Draws" },
        { key: "lost", label: "L", description: "Losses" },
        { key: "gf", label: "GF", description: "Goals for" },
        { key: "ga", label: "GA", description: "Goals against" },
        { key: "gd", label: "GD", description: "Goal difference" },
        { key: "points", label: "Pts", description: "Points" },
      ];
      
    case "american_football":
      return [
        { key: "pos", label: "#", description: "Position" },
        { key: "team", label: "Team", description: "Team name" },
        { key: "won", label: "W", description: "Wins" },
        { key: "lost", label: "L", description: "Losses" },
        { key: "tied", label: "T", description: "Ties" },
        { key: "pct", label: "PCT", description: "Win percentage" },
        { key: "pf", label: "PF", description: "Points for" },
        { key: "pa", label: "PA", description: "Points against" },
        { key: "diff", label: "DIFF", description: "Point differential" },
      ];
      
    case "basketball":
      return [
        { key: "pos", label: "#", description: "Position" },
        { key: "team", label: "Team", description: "Team name" },
        { key: "won", label: "W", description: "Wins" },
        { key: "lost", label: "L", description: "Losses" },
        { key: "pct", label: "PCT", description: "Win percentage" },
        { key: "gb", label: "GB", description: "Games behind" },
        { key: "streak", label: "STRK", description: "Current streak" },
      ];
      
    case "baseball":
      return [
        { key: "pos", label: "#", description: "Position" },
        { key: "team", label: "Team", description: "Team name" },
        { key: "won", label: "W", description: "Wins" },
        { key: "lost", label: "L", description: "Losses" },
        { key: "pct", label: "PCT", description: "Win percentage" },
        { key: "gb", label: "GB", description: "Games behind" },
        { key: "rs", label: "RS", description: "Runs scored" },
        { key: "ra", label: "RA", description: "Runs allowed" },
      ];
      
    case "hockey":
      return [
        { key: "pos", label: "#", description: "Position" },
        { key: "team", label: "Team", description: "Team name" },
        { key: "gp", label: "GP", description: "Games played" },
        { key: "won", label: "W", description: "Wins" },
        { key: "lost", label: "L", description: "Losses" },
        { key: "otl", label: "OTL", description: "Overtime losses" },
        { key: "points", label: "PTS", description: "Points" },
        { key: "gf", label: "GF", description: "Goals for" },
        { key: "ga", label: "GA", description: "Goals against" },
      ];
      
    case "motorsport":
      return [
        { key: "pos", label: "Pos", description: "Championship position" },
        { key: "driver", label: "Driver", description: "Driver name" },
        { key: "team", label: "Team", description: "Constructor/Team" },
        { key: "points", label: "Pts", description: "Championship points" },
        { key: "wins", label: "Wins", description: "Race wins" },
        { key: "podiums", label: "Podiums", description: "Podium finishes" },
      ];
      
    case "golf":
      return [
        { key: "pos", label: "Pos", description: "Position" },
        { key: "player", label: "Player", description: "Player name" },
        { key: "total", label: "Total", description: "Total score to par" },
        { key: "thru", label: "Thru", description: "Holes completed" },
        { key: "today", label: "Today", description: "Today's score" },
        { key: "r1", label: "R1", description: "Round 1" },
        { key: "r2", label: "R2", description: "Round 2" },
        { key: "r3", label: "R3", description: "Round 3" },
        { key: "r4", label: "R4", description: "Round 4" },
      ];
      
    case "tennis":
      return [
        { key: "rank", label: "Rank", description: "World ranking" },
        { key: "player", label: "Player", description: "Player name" },
        { key: "country", label: "Country", description: "Nationality" },
        { key: "points", label: "Points", description: "Ranking points" },
        { key: "titles", label: "Titles", description: "Tournament titles" },
      ];
      
    case "combat":
      return [
        { key: "rank", label: "#", description: "Division ranking" },
        { key: "fighter", label: "Fighter", description: "Fighter name" },
        { key: "record", label: "Record", description: "Win-Loss-Draw" },
        { key: "streak", label: "Streak", description: "Current streak" },
      ];
      
    default:
      return [
        { key: "pos", label: "#", description: "Position" },
        { key: "name", label: "Name", description: "Competitor name" },
        { key: "won", label: "W", description: "Wins" },
        { key: "lost", label: "L", description: "Losses" },
        { key: "points", label: "Pts", description: "Points" },
      ];
  }
}

// ==========================================
// SPORT-SPECIFIC SENTENCE TEMPLATES
// ==========================================

export interface GameSummaryOptions {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  sportKey: string;
  venue?: string;
  date?: string;
  status: string;
  winner?: string;
}

export function formatGameSummary(options: GameSummaryOptions): string {
  const { homeTeam, awayTeam, homeScore, awayScore, sportKey, venue, date, status, winner } = options;
  const { label: statusLabel } = formatStatus(status, sportKey);
  
  // Determine result
  const isComplete = statusLabel === "Final";
  const isTie = homeScore === awayScore;
  
  if (!isComplete) {
    // Upcoming or live
    if (statusLabel === "LIVE") {
      return `${homeTeam} and ${awayTeam} are currently playing. Score: ${formatScore({ homeScore, awayScore, sportKey })}`;
    }
    return `${homeTeam} vs ${awayTeam}${venue ? ` at ${venue}` : ""}${date ? ` on ${date}` : ""}`;
  }
  
  // Completed game - determine winner from scores if not provided
  const gameWinner = winner || (homeScore > awayScore ? homeTeam : awayTeam);
  const category = detectSportCategory(sportKey);
  
  switch (category) {
    case "soccer":
      if (isTie) {
        return `${homeTeam} drew ${homeScore}-${awayScore} with ${awayTeam}`;
      }
      return gameWinner === homeTeam
        ? `${homeTeam} beat ${awayTeam} ${homeScore}-${awayScore}`
        : `${awayTeam} beat ${homeTeam} ${awayScore}-${homeScore}`;
      
    case "american_football":
    case "basketball":
      return gameWinner === homeTeam
        ? `${homeTeam} defeated ${awayTeam} ${homeScore}-${awayScore}`
        : `${awayTeam} defeated ${homeTeam} ${awayScore}-${homeScore}`;
      
    case "combat":
      return `${gameWinner} won against ${gameWinner === homeTeam ? awayTeam : homeTeam}`;
      
    default:
      if (isTie) {
        return `${homeTeam} and ${awayTeam} tied ${homeScore}-${awayScore}`;
      }
      return gameWinner === homeTeam
          ? `${homeTeam} won ${homeScore}-${awayScore} against ${awayTeam}`
          : `${awayTeam} won ${awayScore}-${homeScore} against ${homeTeam}`;
  }
}

// ==========================================
// DATE/TIME FORMATTING
// ==========================================

export function formatGameTime(isoString: string, _sportKey: string, options?: { 
  includeDate?: boolean;
  timezone?: string;
}): string {
  const date = new Date(isoString);
  // Sport category available via detectSportCategory(sportKey) for future customization
  
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  
  if (options?.includeDate) {
    timeOptions.weekday = "short";
    timeOptions.month = "short";
    timeOptions.day = "numeric";
  }
  
  return date.toLocaleString("en-US", timeOptions);
}

// ==========================================
// RESULT PHRASES
// ==========================================

export function getResultPhrase(
  _homeTeam: string,
  _awayTeam: string,
  homeScore: number,
  awayScore: number,
  sportKey: string
): string {
  const sportCategory = detectSportCategory(sportKey);
  const diff = Math.abs(homeScore - awayScore);
  const loser = homeScore > awayScore ? _awayTeam : _homeTeam;
  
  if (homeScore === awayScore) {
    if (sportCategory === "soccer") {
      return homeScore === 0 
        ? "played out a goalless draw"
        : `shared the points in a ${homeScore}-${awayScore} draw`;
    }
    return "ended in a tie";
  }
  
  // Close game
  if (diff === 1) {
    switch (sportCategory) {
      case "soccer":
        return `edged past ${loser}`;
      case "combat":
        return `narrowly defeated ${loser}`;
      default:
        return `narrowly beat ${loser}`;
    }
  }
  
  // Dominant win
  if ((sportCategory === "soccer" && diff >= 3) ||
      (sportCategory === "american_football" && diff >= 21) ||
      (sportCategory === "basketball" && diff >= 20) ||
      (sportCategory === "baseball" && diff >= 5)) {
    switch (sportCategory) {
      case "soccer":
        return `thrashed ${loser}`;
      case "basketball":
        return `dominated ${loser}`;
      default:
        return `cruised past ${loser}`;
    }
  }
  
  // Normal win
  switch (sportCategory) {
    case "soccer":
      return `beat ${loser}`;
    case "combat":
      return `defeated ${loser}`;
    default:
      return `defeated ${loser}`;
  }
}

// ==========================================
// EXPORTS: Combined formatter
// ==========================================

export interface SportFormatter {
  category: SportCategory;
  terminology: SportTerminology;
  formatScore: (home: number, away: number, homeTeam?: string, awayTeam?: string) => string;
  formatPeriod: (period: string | number | undefined) => string;
  formatStatus: (status: string) => { label: string; color: string };
  getStandingsColumns: () => StandingsColumn[];
  formatGameSummary: (options: Omit<GameSummaryOptions, "sportKey">) => string;
}

export function createSportFormatter(sportKey: string): SportFormatter {
  const category = detectSportCategory(sportKey);
  const terminology = getTerminology(sportKey);
  
  return {
    category,
    terminology,
    formatScore: (home, away, homeTeam, awayTeam) => 
      formatScore({ homeScore: home, awayScore: away, homeTeam, awayTeam, sportKey }),
    formatPeriod: (period) => formatPeriod(period, sportKey),
    formatStatus: (status) => formatStatus(status, sportKey),
    getStandingsColumns: () => getStandingsColumns(sportKey),
    formatGameSummary: (options) => formatGameSummary({ ...options, sportKey }),
  };
}
