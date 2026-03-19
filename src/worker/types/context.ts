export type SportKey =
  | "nba"
  | "mlb"
  | "nhl"
  | "ncaab"
  | "soccer"
  | "nascar"
  | "mma"
  | "unknown";

export interface ScoreContext {
  home: number | null;
  away: number | null;
}

export interface InjuryContextItem {
  entityType: "team" | "player";
  entityId: string;
  name: string;
  status: string;
  impact: "low" | "medium" | "high";
  source?: string;
  updatedAt?: string;
}

export interface LineContext {
  spread: number | null;
  total: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
}

export interface GameContext {
  gameId: string;
  sport: SportKey | string;
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  startTime: string | null;
  status: string | null;
  score: ScoreContext;
  spread: number | null;
  moneyline: { home: number | null; away: number | null };
  total: number | null;
  openingLine: LineContext;
  currentLine: LineContext;
  lineMovement: number;
  publicBettingPercentage: { home: number | null; away: number | null };
  moneyPercentage: { home: number | null; away: number | null };
  injuries: InjuryContextItem[];
  projectedLineups: string[];
  restDays: { home: number | null; away: number | null };
  travelDistance: { home: number | null; away: number | null };
  backToBack: { home: boolean; away: boolean };
  recentForm: { home: string | null; away: string | null };
  headToHeadHistory: string | null;
  weather: string | null;
  newsBriefs: string[];
  propLines: Array<{
    player: string;
    teamId: string | null;
    teamName: string | null;
    propType: string;
    line: number;
    openLine: number | null;
  }>;
  propLineMovement: Array<{
    player: string;
    propType: string;
    movement: number;
  }>;
  sourceRefs: string[];
  freshness: {
    generatedAt: string;
    dataAgeMinutes: number | null;
    isStale: boolean;
  };
}

export interface TeamContext {
  teamId: string;
  sport: SportKey | string;
  name: string;
  standings: string | null;
  recentForm: string | null;
  injuries: InjuryContextItem[];
  homeAwaySplits: string | null;
  scheduleDensity: string | null;
  streaks: string | null;
  teamTrends: string[];
}

export interface PlayerContext {
  playerId: string;
  sport: SportKey | string;
  teamId: string | null;
  status: string | null;
  recentGames: string[];
  seasonStats: string[];
  matchupSplits: string[];
  injuryStatus: string | null;
  projectedProps: Array<{ propType: string; line: number }>;
  propHistory: Array<{ propType: string; movement: number }>;
  usageTrend: string | null;
  minutesTrend: string | null;
}

export interface MarketContext {
  marketId: string;
  gameId: string;
  currentOdds: LineContext;
  openingOdds: LineContext;
  movementHistory: Array<{ at: string; spread: number | null; total: number | null }>;
  publicBetting: { home: number | null; away: number | null };
  moneySplits: { home: number | null; away: number | null };
  sportsbookComparisons: string[];
  sharpIndicators: string[];
}

export interface UserContext {
  userId: string | null;
  favoriteTeams: string[];
  favoriteSports: string[];
  trackedPlayers: string[];
  watchboards: string[];
  preferredMarkets: string[];
  riskProfile: string | null;
  engagementHistory: string[];
}

export interface CoachGContextPackage {
  gameContext: GameContext | null;
  teamContext: TeamContext[];
  playerContext: PlayerContext[];
  marketContext: MarketContext | null;
  userContext: UserContext;
}
