// Sport-agnostic event types and data provider interface

// ============ Sport Configuration ============

export interface SportConfig {
  key: string;
  name: string;
  icon: string;
  periodType: "week" | "round" | "day" | "matchday" | "tournament";
  periodPrefix: string;
  teamType: "home_away" | "participants" | "individual";
  scoringType: "points" | "sets" | "strokes" | "position";
  hasOvertime: boolean;
  defaultEventDuration: number; // minutes
}

export const SPORT_CONFIGS: Record<string, SportConfig> = {
  nfl: {
    key: "nfl",
    name: "NFL Football",
    icon: "🏈",
    periodType: "week",
    periodPrefix: "Week",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: true,
    defaultEventDuration: 210,
  },
  nba: {
    key: "nba",
    name: "NBA Basketball",
    icon: "🏀",
    periodType: "day",
    periodPrefix: "Day",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: true,
    defaultEventDuration: 150,
  },
  mlb: {
    key: "mlb",
    name: "MLB Baseball",
    icon: "⚾",
    periodType: "day",
    periodPrefix: "Day",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: false, // Extra innings, but scored differently
    defaultEventDuration: 180,
  },
  nhl: {
    key: "nhl",
    name: "NHL Hockey",
    icon: "🏒",
    periodType: "day",
    periodPrefix: "Day",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: true,
    defaultEventDuration: 150,
  },
  ncaaf: {
    key: "ncaaf",
    name: "College Football",
    icon: "🏈",
    periodType: "week",
    periodPrefix: "Week",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: true,
    defaultEventDuration: 210,
  },
  ncaab: {
    key: "ncaab",
    name: "College Basketball",
    icon: "🏀",
    periodType: "round",
    periodPrefix: "Round",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: true,
    defaultEventDuration: 120,
  },
  soccer: {
    key: "soccer",
    name: "Soccer",
    icon: "⚽",
    periodType: "matchday",
    periodPrefix: "Matchday",
    teamType: "home_away",
    scoringType: "points",
    hasOvertime: false, // Regular season
    defaultEventDuration: 105,
  },
  golf: {
    key: "golf",
    name: "Golf",
    icon: "⛳",
    periodType: "tournament",
    periodPrefix: "Tournament",
    teamType: "individual",
    scoringType: "strokes",
    hasOvertime: false,
    defaultEventDuration: 360, // Per round
  },
};

// ============ Normalized Event Types ============

export type EventStatus = 
  | "scheduled"     // Future event
  | "in_progress"   // Currently playing
  | "halftime"      // At break
  | "delayed"       // Weather, etc.
  | "postponed"     // Rescheduled
  | "cancelled"     // Not happening
  | "final"         // Completed
  | "final_ot";     // Completed with overtime

export interface NormalizedEvent {
  id?: number;
  externalId: string;           // ID from data provider
  sportKey: string;
  leagueKey?: string;           // e.g., "premier-league", "champions-league"
  season: string;
  periodId: string;             // e.g., "week-1", "round-2", "2024-01-15"
  startAt: string;              // ISO timestamp
  endAt?: string;               // ISO timestamp (estimated)
  
  // Teams/Participants
  homeTeam?: string;
  awayTeam?: string;
  participants?: string[];      // For individual sports or multi-team events
  
  // Scores
  homeScore?: number;
  awayScore?: number;
  scores?: Record<string, number>;  // For individual sports: { "Tiger Woods": -8 }
  
  // Status & Results
  status: EventStatus;
  winner?: string;              // Team name or "tie"
  finalResult?: string;         // Detailed result info
  
  // Metadata
  venue?: string;
  broadcast?: string;
  weather?: string;
  odds?: EventOdds;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export interface EventOdds {
  spread?: number;              // Home team spread (negative = favorite)
  overUnder?: number;           // Total points line
  homeMoneyline?: number;
  awayMoneyline?: number;
  lastUpdated?: string;
}

// ============ Data Provider Interface ============

export interface DataProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  rateLimitPerMinute?: number;
}

export interface FetchEventsParams {
  sportKey: string;
  season?: string;
  periodId?: string;
  startDate?: string;
  endDate?: string;
  status?: EventStatus[];
  limit?: number;
}

export interface DataProvider {
  name: string;
  supportedSports: string[];
  
  // Fetch and normalize events
  fetchEvents(params: FetchEventsParams): Promise<NormalizedEvent[]>;
  
  // Fetch single event
  fetchEvent(externalId: string): Promise<NormalizedEvent | null>;
  
  // Get available periods for a sport/season
  fetchPeriods(sportKey: string, season: string): Promise<string[]>;
  
  // Check if provider is healthy
  healthCheck(): Promise<boolean>;
}

// ============ Sample Data Generator ============
// Used for development/demo - generates realistic sample data

export function generateSampleEvents(
  sportKey: string,
  periodId: string,
  count: number = 10
): NormalizedEvent[] {
  const config = SPORT_CONFIGS[sportKey];
  if (!config) return [];

  const events: NormalizedEvent[] = [];
  const teams = SAMPLE_TEAMS[sportKey] || [];
  
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1); // Start tomorrow
  
  for (let i = 0; i < Math.min(count, Math.floor(teams.length / 2)); i++) {
    const homeTeam = teams[i * 2];
    const awayTeam = teams[i * 2 + 1];
    
    // Stagger start times
    const startAt = new Date(baseDate);
    startAt.setHours(12 + Math.floor(i / 3) * 4);
    startAt.setMinutes((i % 3) * 25);
    
    const event: NormalizedEvent = {
      externalId: `sample-${sportKey}-${periodId}-${i}`,
      sportKey,
      season: "2024-2025",
      periodId,
      startAt: startAt.toISOString(),
      homeTeam,
      awayTeam,
      status: "scheduled",
    };
    
    events.push(event);
  }
  
  return events;
}

export function generateFinalizedEvent(event: NormalizedEvent): NormalizedEvent {
  const config = SPORT_CONFIGS[event.sportKey];
  if (!config) return event;

  // Generate realistic scores
  const homeScore = generateScore(event.sportKey);
  const awayScore = generateScore(event.sportKey);
  
  const isOvertime = config.hasOvertime && homeScore === awayScore && Math.random() > 0.7;
  const finalHomeScore = isOvertime ? homeScore + Math.floor(Math.random() * 7) + 1 : homeScore;
  const finalAwayScore = isOvertime && finalHomeScore === awayScore ? awayScore + Math.floor(Math.random() * 7) + 1 : awayScore;
  
  let winner: string | undefined;
  if (finalHomeScore > finalAwayScore) {
    winner = event.homeTeam;
  } else if (finalAwayScore > finalHomeScore) {
    winner = event.awayTeam;
  } else {
    winner = "tie";
  }

  return {
    ...event,
    homeScore: finalHomeScore,
    awayScore: finalAwayScore,
    status: isOvertime ? "final_ot" : "final",
    winner,
    finalResult: `${event.homeTeam} ${finalHomeScore} - ${finalAwayScore} ${event.awayTeam}${isOvertime ? " (OT)" : ""}`,
  };
}

function generateScore(sportKey: string): number {
  const ranges: Record<string, [number, number]> = {
    nfl: [10, 35],
    nba: [95, 125],
    mlb: [2, 8],
    nhl: [1, 5],
    ncaaf: [14, 42],
    ncaab: [60, 85],
    soccer: [0, 4],
    golf: [-12, 4],
  };
  
  const [min, max] = ranges[sportKey] || [0, 10];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Sample team data for each sport
const SAMPLE_TEAMS: Record<string, string[]> = {
  nfl: [
    "Kansas City Chiefs", "San Francisco 49ers",
    "Buffalo Bills", "Miami Dolphins",
    "Dallas Cowboys", "Philadelphia Eagles",
    "Baltimore Ravens", "Cincinnati Bengals",
    "Detroit Lions", "Green Bay Packers",
    "New York Jets", "New England Patriots",
    "Los Angeles Rams", "Seattle Seahawks",
    "Houston Texans", "Jacksonville Jaguars",
  ],
  nba: [
    "Boston Celtics", "Milwaukee Bucks",
    "Denver Nuggets", "Phoenix Suns",
    "Los Angeles Lakers", "Golden State Warriors",
    "Miami Heat", "New York Knicks",
    "Philadelphia 76ers", "Brooklyn Nets",
    "Dallas Mavericks", "Memphis Grizzlies",
  ],
  mlb: [
    "Los Angeles Dodgers", "Atlanta Braves",
    "New York Yankees", "Boston Red Sox",
    "Houston Astros", "Texas Rangers",
    "Philadelphia Phillies", "San Diego Padres",
    "Baltimore Orioles", "Tampa Bay Rays",
    "Chicago Cubs", "St. Louis Cardinals",
  ],
  nhl: [
    "Vegas Golden Knights", "Florida Panthers",
    "Boston Bruins", "Toronto Maple Leafs",
    "Edmonton Oilers", "Colorado Avalanche",
    "New York Rangers", "Carolina Hurricanes",
    "Dallas Stars", "Winnipeg Jets",
  ],
  ncaaf: [
    "Georgia Bulldogs", "Michigan Wolverines",
    "Alabama Crimson Tide", "Ohio State Buckeyes",
    "Texas Longhorns", "Oregon Ducks",
    "Florida State Seminoles", "Penn State Nittany Lions",
    "Washington Huskies", "USC Trojans",
  ],
  ncaab: [
    "UConn Huskies", "Purdue Boilermakers",
    "Houston Cougars", "Duke Blue Devils",
    "North Carolina Tar Heels", "Kansas Jayhawks",
    "Arizona Wildcats", "Gonzaga Bulldogs",
    "Tennessee Volunteers", "Kentucky Wildcats",
  ],
  soccer: [
    "Manchester City", "Arsenal",
    "Liverpool", "Manchester United",
    "Chelsea", "Tottenham Hotspur",
    "Newcastle United", "Brighton",
    "Aston Villa", "West Ham United",
  ],
  golf: [
    "Scottie Scheffler", "Rory McIlroy",
    "Jon Rahm", "Viktor Hovland",
    "Xander Schauffele", "Patrick Cantlay",
    "Collin Morikawa", "Brooks Koepka",
    "Jordan Spieth", "Justin Thomas",
  ],
};

// ============ Utility Functions ============

export function formatPeriodName(sportKey: string, periodId: string): string {
  const config = SPORT_CONFIGS[sportKey];
  if (!config) return periodId;
  
  // Handle different period formats
  if (periodId.startsWith("week-")) {
    return `${config.periodPrefix} ${periodId.replace("week-", "")}`;
  }
  if (periodId.startsWith("round-")) {
    return `${config.periodPrefix} ${periodId.replace("round-", "")}`;
  }
  if (periodId.startsWith("day-")) {
    return periodId.replace("day-", "");
  }
  if (periodId.startsWith("matchday-")) {
    return `${config.periodPrefix} ${periodId.replace("matchday-", "")}`;
  }
  
  return periodId;
}

export function getAvailablePeriods(sportKey: string, season: string): string[] {
  const config = SPORT_CONFIGS[sportKey];
  if (!config) return [];
  
  switch (config.periodType) {
    case "week":
      // NFL/NCAAF: 18 weeks regular season + playoffs
      return Array.from({ length: 18 }, (_, i) => `week-${i + 1}`);
    case "round":
      // NCAAB: 6 tournament rounds
      return ["round-64", "round-32", "sweet-16", "elite-8", "final-4", "championship"];
    case "matchday":
      // Soccer: 38 matchdays
      return Array.from({ length: 38 }, (_, i) => `matchday-${i + 1}`);
    case "day":
      // NBA/MLB/NHL: Use date ranges
      return generateDatePeriods(season);
    case "tournament":
      // Golf: Named tournaments
      return ["masters", "pga-championship", "us-open", "the-open"];
    default:
      return [];
  }
}

function generateDatePeriods(season: string): string[] {
  // Generate weekly periods for a season
  const [startYear] = season.split("-").map(Number);
  const periods: string[] = [];
  
  const start = new Date(startYear, 9, 1); // October 1
  const end = new Date(startYear + 1, 5, 30); // June 30
  
  const current = new Date(start);
  let weekNum = 1;
  
  while (current < end) {
    periods.push(`week-${weekNum}`);
    current.setDate(current.getDate() + 7);
    weekNum++;
  }
  
  return periods.slice(0, 30); // Limit to 30 weeks
}

export function determineWinner(event: NormalizedEvent): string | null {
  if (!event.homeScore || !event.awayScore) return null;
  
  if (event.homeScore > event.awayScore) {
    return event.homeTeam || null;
  } else if (event.awayScore > event.homeScore) {
    return event.awayTeam || null;
  }
  
  return "tie";
}
