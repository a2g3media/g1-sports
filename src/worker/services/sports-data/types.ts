/**
 * Sports Data Engine Types
 * Normalized data models for multi-provider sports data
 */

// ============================================
// ENUMS & CONSTANTS
// ============================================

export type SportKey = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'NCAAB' | 'SOCCER' | 'MMA' | 'GOLF' | 'NASCAR' | 'TENNIS';

export type GameStatus = 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED' | 'CANCELED';

export type RefreshType = 'MASTER' | 'LIVE_MINI';

export type RefreshStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export type PropType = 
  // Football
  | 'PASSING_YARDS' | 'PASSING_TDS' | 'RUSHING_YARDS' | 'RUSHING_TDS' | 'RECEIVING_YARDS' | 'RECEIVING_TDS' 
  | 'RECEPTIONS' | 'INTERCEPTIONS' | 'TURNOVERS'
  // Basketball
  | 'POINTS' | 'REBOUNDS' | 'ASSISTS' | 'STEALS' | 'BLOCKS' | 'THREES'
  | 'PRA' | 'PR' | 'PA' | 'RA' | 'SB' | 'DOUBLE_DOUBLE' | 'TRIPLE_DOUBLE'
  // Baseball
  | 'HITS' | 'RUNS' | 'RBIS' | 'STRIKEOUTS' | 'HOME_RUNS' | 'TOTAL_BASES' | 'STOLEN_BASES' | 'WALKS'
  // Hockey
  | 'GOALS' | 'SHOTS' | 'SAVES' | 'POINTS_NHL'
  | 'OTHER';

// ============================================
// NORMALIZED DATA MODELS
// ============================================

export interface NormalizedGame {
  providerGameId: string;
  sport: SportKey;
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamName: string | null;  // Full team name (e.g., "Cleveland Cavaliers")
  awayTeamName: string | null;  // Full team name (e.g., "Charlotte Hornets")
  startTime: Date;
  status: GameStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  period: string | null;
  clock: string | null;
  venue: string | null;
  channel: string | null;  // TV network broadcasting the game (e.g., "ESPN", "TNT", "NBC")
}

export interface NormalizedOdds {
  providerGameId: string;
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
}

export interface NormalizedProp {
  providerGameId: string;
  playerName: string;
  playerId?: string;
  team: string | null;
  propType: PropType;
  lineValue: number;
  // For TheOddsAPI - used to match props to games by team names
  homeTeam?: string;
  awayTeam?: string;
  // SportsRadar extended fields
  sportsbook?: string;
  oddsAmerican?: number;
  oddsDecimal?: number;
  openLineValue?: number;
  openOddsAmerican?: number;
  trend?: 'up' | 'down';
  marketName?: string;
}

// ============================================
// DATABASE MODELS
// ============================================

export interface DbGame {
  id: number;
  provider_game_id: string;
  sport: string;
  league: string | null;
  home_team: string;
  away_team: string;
  start_time: string;
  status: string;
  score_home: number | null;
  score_away: number | null;
  period: string | null;
  clock: string | null;
  venue: string | null;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOddsCurrent {
  id: number;
  game_id: number;
  spread_home: number | null;
  spread_away: number | null;
  total: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  open_spread: number | null;
  open_total: number | null;
  open_moneyline_home: number | null;
  open_moneyline_away: number | null;
  movement_spread: number | null;
  movement_total: number | null;
  last_updated: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOddsHistory {
  id: number;
  game_id: number;
  spread_home: number | null;
  spread_away: number | null;
  total: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbPropsCurrent {
  id: number;
  game_id: number;
  player_name: string;
  team: string | null;
  prop_type: string;
  line_value: number;
  open_line_value: number | null;
  movement: number | null;
  last_updated: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbPropsHistory {
  id: number;
  game_id: number;
  player_name: string;
  prop_type: string;
  line_value: number;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbRefreshLog {
  id: number;
  refresh_type: string;
  sport: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  games_processed: number;
  odds_updated: number;
  props_updated: number;
  errors: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// PROVIDER INTERFACE
// ============================================

export interface DateRange {
  start: Date;
  end: Date;
}

export interface FetchGamesResult {
  games: NormalizedGame[];
  rawCount: number;
  errors: string[];
}

export interface FetchOddsResult {
  odds: NormalizedOdds[];
  rawCount: number;
  errors: string[];
}

export interface FetchPropsResult {
  props: NormalizedProp[];
  rawCount: number;
  errors: string[];
}

export interface OddsProviderInterface {
  readonly name: string;
  
  fetchGames(sport: SportKey, dateRange: DateRange): Promise<FetchGamesResult>;
  fetchOdds(sport: SportKey, dateRange: DateRange): Promise<FetchOddsResult>;
  fetchProps(sport: SportKey, dateRange: DateRange): Promise<FetchPropsResult>;
  
  // Check if sport is currently in season
  isInSeason(sport: SportKey): Promise<boolean>;
  
  // Get provider capabilities for UI gating
  getCapabilities(): ProviderCapabilities;
}

// ============================================
// REFRESH ORCHESTRATOR TYPES
// ============================================

export interface RefreshResult {
  sport: SportKey;
  refreshType: RefreshType;
  status: RefreshStatus;
  gamesProcessed: number;
  oddsUpdated: number;
  propsUpdated: number;
  durationMs: number;
  errors: string[];
}

export interface RefreshLock {
  isLocked: boolean;
  lockedBy: RefreshType | null;
  lockedAt: Date | null;
}

// Active sports configuration (includes all supported sports with live data)
export const ACTIVE_SPORTS: SportKey[] = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER', 'MMA', 'GOLF'];

// Refresh intervals in milliseconds
export const MASTER_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
export const LIVE_MINI_REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

// Season detection: skip if no games within this window
export const SEASON_WINDOW_DAYS = 7;

// Sport-specific scan windows for full season coverage
// Forward days: how far ahead to scan for scheduled games
// Back days: how far back to include recent/final games
export const SPORT_SCAN_WINDOWS: Record<SportKey, { forwardDays: number; backDays: number }> = {
  // Football: September → February (season + playoffs)
  NFL: { forwardDays: 180, backDays: 14 },
  NCAAF: { forwardDays: 150, backDays: 14 },
  
  // Basketball: October → June (full regular season + playoffs)
  NBA: { forwardDays: 240, backDays: 14 },
  NCAAB: { forwardDays: 150, backDays: 14 },
  
  // Hockey: October → June
  NHL: { forwardDays: 240, backDays: 14 },
  
  // Baseball: March → November (includes postseason)
  MLB: { forwardDays: 240, backDays: 14 },
  
  // Soccer: Full European season (August → May across calendar year)
  SOCCER: { forwardDays: 270, backDays: 14 },
  
  // Golf/MMA/Tennis: Scan 90 days ahead (tournaments scheduled in advance)
  GOLF: { forwardDays: 90, backDays: 7 },
  MMA: { forwardDays: 90, backDays: 7 },
  TENNIS: { forwardDays: 90, backDays: 7 }
};

// ============================================
// PROVIDER CAPABILITIES & CONFIGURATION
// ============================================

/**
 * Provider capabilities interface - defines optional features a data provider may support.
 * This abstraction allows the app to gracefully handle varying subscription levels.
 */
export interface ProviderCapabilities {
  // Core data availability
  hasGames: boolean;
  hasOdds: boolean;
  
  // Props
  hasProps: boolean;
  hasPropsPregame: boolean;
  hasPropsInPlay: boolean;  // Always false for now - explicitly out of scope
  hasPropMovement: boolean;
  propMovementLookbackDays: number;
  
  // Market types
  hasAlternateLines: boolean;
  hasFutures: boolean;
  hasDerivatives: boolean;
  
  // Live data
  hasLiveInGameLines: boolean;
  liveLineLatencyMs: number | null;  // Unknown until confirmed
  
  // Sports support
  supportedSports: SportKey[];
  
  // Media assets (requires licensing confirmation)
  hasPlayerImages: boolean;
  hasTeamLogos: boolean;
  mediaLicenseConfirmed: boolean;
}

/**
 * Provider configuration - runtime flags for enabled features.
 * These can be toggled without code changes based on subscription or licensing status.
 */
export interface ProviderConfig {
  // Feature toggles
  PROPS_ENABLED: boolean;
  PROP_MOVEMENT_ENABLED: boolean;
  ALTERNATE_LINES_ENABLED: boolean;
  FUTURES_ENABLED: boolean;
  
  // Media toggles (default false until rights confirmed in writing)
  PLAYER_IMAGES_ENABLED: boolean;
  TEAM_LOGOS_ENABLED: boolean;
  
  // Sport-specific toggles
  LA_LIGA_ENABLED: boolean;
  MMA_ENABLED: boolean;
  GOLF_ENABLED: boolean;
  
  // Movement tracking
  PROP_MOVEMENT_LOOKBACK_DAYS: number;
  STORE_PROP_SNAPSHOTS: boolean;
}

/**
 * Default provider configuration based on customer's confirmed subscription.
 * Update these flags as capabilities are verified.
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  // Props - CONFIRMED AVAILABLE (pre-game only)
  PROPS_ENABLED: true,
  PROP_MOVEMENT_ENABLED: true,
  PROP_MOVEMENT_LOOKBACK_DAYS: 30,
  STORE_PROP_SNAPSHOTS: true,
  
  // Unknown market types - schema ready, UI shows only if data present
  ALTERNATE_LINES_ENABLED: false,
  FUTURES_ENABLED: false,
  
  // Media - DISABLED until rights confirmed in writing
  PLAYER_IMAGES_ENABLED: false,
  TEAM_LOGOS_ENABLED: false,
  
  // Sports - CONFIRMED AVAILABLE
  LA_LIGA_ENABLED: true,
  MMA_ENABLED: true,
  GOLF_ENABLED: true,
};
