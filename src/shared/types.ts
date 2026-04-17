import z from "zod";

// =====================================================
// GAME / LIVE SCORES TYPES
// =====================================================

export const GameStatusEnum = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "FINAL",
  "POSTPONED",
  "CANCELED",
]);
export type GameStatus = z.infer<typeof GameStatusEnum>;

export const GameSchema = z.object({
  // Identifiers
  game_id: z.string(), // Internal ID (provider_id mapped to our system)
  external_id: z.string().optional(), // Provider's external ID
  
  // Sport/League info
  sport: z.string(), // nfl, nba, mlb, nhl, ncaaf, ncaab, soccer, golf
  league: z.string(), // NFL, NBA, etc.
  season: z.string().optional(), // 2024-2025
  week: z.string().optional(), // Week 14, Matchday 18, Round 3
  
  // Timing
  start_time: z.string(), // ISO timestamp
  status: GameStatusEnum,
  
  // Period/Clock (normalized)
  period: z.number().optional(), // 1, 2, 3, 4 for quarters; 1-9+ for innings
  period_number: z.number().optional(), // Numeric period (alias for period)
  period_label: z.string().optional(), // "1st", "2nd", "3rd Quarter", "Top 5th"
  clock: z.string().optional(), // "8:42", "2:15"
  is_halftime: z.boolean().optional(),
  is_overtime: z.boolean().optional(),
  
  // Teams
  home_team_code: z.string(), // "KC", "LAL", etc.
  home_team_name: z.string(), // "Chiefs", "Lakers", etc.
  home_team_abbr: z.string().optional(), // Short abbr like "KC"
  away_team_code: z.string(),
  away_team_name: z.string(),
  away_team_abbr: z.string().optional(), // Short abbr like "BUF"
  
  // Scores
  home_score: z.number().optional(),
  away_score: z.number().optional(),
  
  // Metadata
  venue: z.string().optional(),
  broadcast: z.string().optional(), // "CBS", "ESPN"
  last_updated_at: z.string(), // ISO timestamp
  source_provider: z.string().optional(), // "demo", "espn", "sportradar"
  
  // Odds (from provider)
  spread: z.number().optional(), // Home team spread (e.g., -3.5)
  spreadAway: z.number().optional(), // Away team spread (e.g., +3.5)
  overUnder: z.number().optional(), // Total points (e.g., 220.5)
  moneylineHome: z.number().optional(), // Home ML (e.g., -150)
  moneylineAway: z.number().optional(), // Away ML (e.g., +130)
  // Optional motorsports-specific fields.
  winner_name: z.string().optional(),
  race_results: z.array(z.object({
    position: z.number(),
    driver_name: z.string(),
    driver_code: z.string().optional(),
    points: z.number().optional(),
    status: z.string().optional(),
  })).optional(),
  probable_away_pitcher_name: z.string().optional(),
  probable_away_pitcher_record: z.string().optional(),
  probable_home_pitcher_name: z.string().optional(),
  probable_home_pitcher_record: z.string().optional(),
  probable_pitchers: z.object({
    away: z.object({
      name: z.string(),
      record: z.string().optional(),
    }).optional(),
    home: z.object({
      name: z.string(),
      record: z.string().optional(),
    }).optional(),
  }).optional(),
  mlbLiveState: z.object({
    inningNumber: z.number().nullable(),
    inningHalf: z.enum(["top", "bottom"]).nullable(),
    outs: z.number().nullable(),
    balls: z.number().nullable(),
    strikes: z.number().nullable(),
    runnersOnBase: z.object({
      first: z.boolean(),
      second: z.boolean(),
      third: z.boolean(),
    }).nullable(),
    currentBatter: z.object({
      name: z.string().nullable(),
      handedness: z.string().nullable(),
    }).nullable(),
    currentPitcher: z.object({
      name: z.string().nullable(),
      handedness: z.string().nullable(),
    }).nullable(),
    lastPlay: z.object({
      type: z.string().nullable(),
      player: z.string().nullable(),
      text: z.string().nullable(),
      timestamp: z.string().nullable(),
    }).nullable(),
  }).optional(),
  mlbPregameState: z.object({
    probableHomePitcher: z.object({
      name: z.string().nullable(),
      handedness: z.string().nullable(),
      era: z.string().nullable(),
      last5: z.string().nullable(),
    }).nullable(),
    probableAwayPitcher: z.object({
      name: z.string().nullable(),
      handedness: z.string().nullable(),
      era: z.string().nullable(),
      last5: z.string().nullable(),
    }).nullable(),
  }).optional(),
});

export type Game = z.infer<typeof GameSchema>;

// Sportsbook odds (multi-book support)
export const SportsbookOddsSchema = z.object({
  sportsbook: z.string(), // "DraftKings", "FanDuel", "BetMGM", etc.
  spreadHome: z.number().nullable(),
  spreadAway: z.number().nullable(),
  total: z.number().nullable(),
  moneylineHome: z.number().nullable(),
  moneylineAway: z.number().nullable(),
  updatedAt: z.string().optional(),
});

export type SportsbookOdds = z.infer<typeof SportsbookOddsSchema>;

export const GameOddsResponseSchema = z.object({
  gameId: z.string(),
  sport: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  startTime: z.string(),
  consensus: SportsbookOddsSchema.optional(), // Average/consensus line
  sportsbooks: z.array(SportsbookOddsSchema),
  lastUpdated: z.string(),
});

export type GameOddsResponse = z.infer<typeof GameOddsResponseSchema>;

// Lightweight score update payload
export const GameScoreUpdateSchema = z.object({
  game_id: z.string(),
  status: GameStatusEnum,
  period: z.number().optional(),
  period_label: z.string().optional(),
  clock: z.string().optional(),
  home_score: z.number().optional(),
  away_score: z.number().optional(),
  last_updated_at: z.string(),
});

export type GameScoreUpdate = z.infer<typeof GameScoreUpdateSchema>;

// Provider abstraction interface types
export const ScheduleRequestSchema = z.object({
  sport: z.string(),
  start_date: z.string(),
  end_date: z.string().optional(),
});

export type ScheduleRequest = z.infer<typeof ScheduleRequestSchema>;

// =====================================================
// ODDS ENGINE TYPES
// =====================================================

// Market categories
export const OddsMarketCategoryEnum = z.enum([
  "MAIN",   // Spread, Total, Moneyline
  "HALF",   // 1H/2H lines
  "PROP",   // Player/Team props
  "ALT",    // Alternate lines
  "LIVE",   // Live betting
]);
export type OddsMarketCategory = z.infer<typeof OddsMarketCategoryEnum>;

// Market keys
export const OddsMarketKeyEnum = z.enum([
  // Main markets
  "SPREAD",
  "TOTAL",
  "MONEYLINE",
  // First half
  "SPREAD_1H",
  "TOTAL_1H",
  "ML_1H",
  // Second half
  "SPREAD_2H",
  "TOTAL_2H",
  "ML_2H",
  // Props (future)
  "PLAYER_PROP",
  "TEAM_PROP",
  // Alt lines
  "ALT_SPREAD",
  "ALT_TOTAL",
  // Live
  "LIVE_SPREAD",
  "LIVE_TOTAL",
  "LIVE_ML",
]);
export type OddsMarketKey = z.infer<typeof OddsMarketKeyEnum>;

// Outcome keys (side of the bet)
export const OddsOutcomeKeyEnum = z.enum([
  "HOME",
  "AWAY",
  "OVER",
  "UNDER",
  "DRAW",
  // For props, this will be extended dynamically
]);
export type OddsOutcomeKey = z.infer<typeof OddsOutcomeKeyEnum>;

// Bookmaker schema
export const BookmakerSchema = z.object({
  id: z.number().optional(),
  key: z.string(),
  name: z.string(),
  region: z.string().default("us"),
  is_active: z.boolean().default(true),
  priority: z.number().default(100),
});
export type Bookmaker = z.infer<typeof BookmakerSchema>;

// Market reference
export const OddsMarketSchema = z.object({
  id: z.number().optional(),
  market_key: z.string(),
  display_name: z.string(),
  category: OddsMarketCategoryEnum,
  sort_order: z.number().default(100),
  is_enabled: z.boolean().default(true),
});
export type OddsMarket = z.infer<typeof OddsMarketSchema>;

// Current odds quote (one book, one market, one outcome)
export const OddsQuoteSchema = z.object({
  id: z.number().optional(),
  data_scope: z.string().default("PROD"),
  game_id: z.string(),
  bookmaker_key: z.string(),
  market_key: z.string(),
  outcome_key: z.string(),
  line_value: z.number().nullable(), // Spread points or total points
  price_american: z.number().nullable(), // -110, +150
  price_decimal: z.number().nullable(), // 1.91, 2.50
  implied_probability: z.number().nullable(), // 0.524
  is_live: z.boolean().default(false),
  source_provider: z.string().nullable(),
  updated_at: z.string().optional(),
});
export type OddsQuote = z.infer<typeof OddsQuoteSchema>;

// Opening line (captured once)
export const OddsOpeningSchema = z.object({
  id: z.number().optional(),
  data_scope: z.string().default("PROD"),
  game_id: z.string(),
  bookmaker_key: z.string(),
  market_key: z.string(),
  outcome_key: z.string(),
  opening_line_value: z.number().nullable(),
  opening_price_american: z.number().nullable(),
  opening_price_decimal: z.number().nullable(),
  opened_at: z.string().optional(),
});
export type OddsOpening = z.infer<typeof OddsOpeningSchema>;

// Snapshot for line history
export const OddsSnapshotSchema = z.object({
  id: z.number().optional(),
  data_scope: z.string().default("PROD"),
  game_id: z.string(),
  bookmaker_key: z.string().nullable(), // null = consensus
  market_key: z.string(),
  outcome_key: z.string(),
  line_value: z.number().nullable(),
  price_american: z.number().nullable(),
  price_decimal: z.number().nullable(),
  is_live: z.boolean().default(false),
  captured_at: z.string(),
});
export type OddsSnapshot = z.infer<typeof OddsSnapshotSchema>;

// Aggregated view for UI - one game's odds summary
export const GameOddsSummarySchema = z.object({
  game_id: z.string(),
  data_scope: z.string().default("PROD"),
  
  // Current consensus lines
  spread: z.object({
    home_line: z.number().nullable(),
    home_price: z.number().nullable(),
    away_line: z.number().nullable(),
    away_price: z.number().nullable(),
  }).nullable(),
  
  total: z.object({
    line: z.number().nullable(),
    over_price: z.number().nullable(),
    under_price: z.number().nullable(),
  }).nullable(),
  
  moneyline: z.object({
    home_price: z.number().nullable(),
    away_price: z.number().nullable(),
    draw_price: z.number().nullable(),
  }).nullable(),
  
  // Opening lines for comparison
  opening_spread: z.number().nullable(),
  opening_total: z.number().nullable(),
  opening_home_ml: z.number().nullable(),
  
  // Movement indicators
  spread_moved: z.boolean().default(false),
  total_moved: z.boolean().default(false),
  favorite_flipped: z.boolean().default(false),
  
  // Metadata
  books_count: z.number().default(0),
  last_updated_at: z.string().nullable(),
});
export type GameOddsSummary = z.infer<typeof GameOddsSummarySchema>;

// Request to fetch odds
export const OddsFetchRequestSchema = z.object({
  game_id: z.string().optional(),
  game_ids: z.array(z.string()).optional(),
  sport: z.string().optional(),
  markets: z.array(z.string()).optional(),
  books: z.array(z.string()).optional(),
  is_live: z.boolean().optional(),
  include_opening: z.boolean().default(true),
});
export type OddsFetchRequest = z.infer<typeof OddsFetchRequestSchema>;

// Line movement entry for display
export const LineMovementSchema = z.object({
  timestamp: z.string(),
  line_value: z.number().nullable(),
  price: z.number().nullable(),
  bookmaker_key: z.string().nullable(),
  is_live: z.boolean().default(false),
});
export type LineMovement = z.infer<typeof LineMovementSchema>;

// =====================================================
// PICKS TRACKER TYPES
// =====================================================

// Pick type (what kind of bet)
export const TrackerPickTypeEnum = z.enum([
  "SPREAD",
  "TOTAL",
  "MONEYLINE",
]);
export type TrackerPickType = z.infer<typeof TrackerPickTypeEnum>;

// Pick side (which side of the bet)
export const TrackerPickSideEnum = z.enum([
  "HOME",
  "AWAY",
  "OVER",
  "UNDER",
]);
export type TrackerPickSide = z.infer<typeof TrackerPickSideEnum>;

// Pick result
export const TrackerPickResultEnum = z.enum([
  "PENDING",
  "WIN",
  "LOSS",
  "PUSH",
  "VOID",
]);
export type TrackerPickResult = z.infer<typeof TrackerPickResultEnum>;

// Full pick schema
export const TrackerPickSchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  data_scope: z.string().default("PROD"),
  
  // Game reference
  game_id: z.string(),
  sport_key: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  game_start_time: z.string(), // ISO timestamp
  
  // Pick details
  pick_type: TrackerPickTypeEnum,
  pick_side: TrackerPickSideEnum,
  line_value: z.number().nullable(), // Spread or total line
  odds_american: z.number(), // -110, +150
  odds_decimal: z.number(), // 1.91, 2.50
  
  // Stake
  stake_units: z.number().default(1.0),
  stake_amount_cents: z.number().nullable(),
  
  // Result
  result: TrackerPickResultEnum.default("PENDING"),
  result_profit_units: z.number().nullable(),
  result_profit_cents: z.number().nullable(),
  
  // Metadata
  notes: z.string().nullable(),
  is_graded: z.boolean().default(false),
  graded_at: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type TrackerPick = z.infer<typeof TrackerPickSchema>;

// Create pick input (subset of fields)
export const CreateTrackerPickSchema = z.object({
  game_id: z.string(),
  sport_key: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  game_start_time: z.string(),
  pick_type: TrackerPickTypeEnum,
  pick_side: TrackerPickSideEnum,
  line_value: z.number().nullable().optional(),
  odds_american: z.number(),
  stake_units: z.number().default(1.0),
  stake_amount_cents: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateTrackerPick = z.infer<typeof CreateTrackerPickSchema>;

// Grade pick input
export const GradeTrackerPickSchema = z.object({
  pick_id: z.number(),
  result: z.enum(["WIN", "LOSS", "PUSH", "VOID"]),
});
export type GradeTrackerPick = z.infer<typeof GradeTrackerPickSchema>;

// Stats summary
export const TrackerStatsSchema = z.object({
  total_picks: z.number(),
  wins: z.number(),
  losses: z.number(),
  pushes: z.number(),
  pending: z.number(),
  win_rate: z.number(), // Percentage 0-100
  roi: z.number(), // Percentage
  units_wagered: z.number(),
  units_profit: z.number(),
  current_streak: z.number(), // Positive for wins, negative for losses
  best_streak: z.number(),
  worst_streak: z.number(),
});
export type TrackerStats = z.infer<typeof TrackerStatsSchema>;

// Filter/query options
export const TrackerPicksQuerySchema = z.object({
  sport_key: z.string().optional(),
  pick_type: TrackerPickTypeEnum.optional(),
  result: TrackerPickResultEnum.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  limit: z.number().default(50),
  offset: z.number().default(0),
});
export type TrackerPicksQuery = z.infer<typeof TrackerPicksQuerySchema>;

// =====================================================
// WATCHLIST / LINE ALERTS TYPES
// =====================================================

// Watchlist entry schema
export const WatchlistEntrySchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  data_scope: z.string().default("PROD"),
  game_id: z.string(),
  sport_key: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  game_start_time: z.string(),
  watch_spread: z.boolean().default(true),
  watch_total: z.boolean().default(true),
  watch_moneyline: z.boolean().default(true),
  spread_alert_threshold: z.number().default(0.5),
  total_alert_threshold: z.number().default(0.5),
  ml_alert_threshold: z.number().default(10),
  initial_spread: z.number().nullable(),
  initial_total: z.number().nullable(),
  initial_home_ml: z.number().nullable(),
  has_unread_alert: z.boolean().default(false),
  last_alert_at: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;

// Add to watchlist input
export const AddToWatchlistSchema = z.object({
  game_id: z.string(),
  sport_key: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  game_start_time: z.string(),
  watch_spread: z.boolean().default(true),
  watch_total: z.boolean().default(true),
  watch_moneyline: z.boolean().default(true),
  initial_spread: z.number().nullable().optional(),
  initial_total: z.number().nullable().optional(),
  initial_home_ml: z.number().nullable().optional(),
});
export type AddToWatchlist = z.infer<typeof AddToWatchlistSchema>;

// Line movement alert
export const LineAlertSchema = z.object({
  market: z.enum(["SPREAD", "TOTAL", "MONEYLINE"]),
  direction: z.enum(["UP", "DOWN"]),
  old_value: z.number(),
  new_value: z.number(),
  change: z.number(),
  timestamp: z.string(),
  significance: z.enum(["MINOR", "NOTABLE", "MAJOR"]),
});
export type LineAlert = z.infer<typeof LineAlertSchema>;

// Watchlist entry with current odds and alerts
export const WatchlistEntryWithOddsSchema = WatchlistEntrySchema.extend({
  current_spread: z.number().nullable(),
  current_total: z.number().nullable(),
  current_home_ml: z.number().nullable(),
  spread_movement: z.number().nullable(), // Positive = line went up
  total_movement: z.number().nullable(),
  ml_movement: z.number().nullable(),
  alerts: z.array(LineAlertSchema),
  game_status: z.string().optional(),
  home_score: z.number().nullable().optional(),
  away_score: z.number().nullable().optional(),
});
export type WatchlistEntryWithOdds = z.infer<typeof WatchlistEntryWithOddsSchema>;

// =====================================================
// WATCHLIST SYSTEM TYPES (Comprehensive)
// =====================================================

// Item types that can be followed
export const WatchlistItemTypeEnum = z.enum([
  "GAME",
  "TEAM",
  "LEAGUE",
  "POOL",
  "SPORT",
]);
export type WatchlistItemType = z.infer<typeof WatchlistItemTypeEnum>;

// Watchlist collection
export const WatchlistSchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  name: z.string().default("My Watchlist"),
  is_default: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Watchlist = z.infer<typeof WatchlistSchema>;

// Watchlist item (polymorphic follow)
export const WatchlistItemSchema = z.object({
  id: z.number().optional(),
  watchlist_id: z.number(),
  user_id: z.string(),
  item_type: WatchlistItemTypeEnum,
  item_id: z.string(),
  sport_type: z.string().nullable(),
  display_name: z.string().nullable(),
  metadata_json: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;

// Create watchlist item input
export const CreateWatchlistItemSchema = z.object({
  item_type: WatchlistItemTypeEnum,
  item_id: z.string(),
  sport_type: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  metadata: z.record(z.any()).optional(), // Arbitrary metadata
});
export type CreateWatchlistItem = z.infer<typeof CreateWatchlistItemSchema>;

// =====================================================
// ALERT CENTER TYPES
// =====================================================

// Alert severity
export const AlertSeverityEnum = z.enum([
  "INFO",
  "IMPACT",
  "CRITICAL",
]);
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

// Alert delivery status
export const AlertDeliveryStatusEnum = z.enum([
  "IN_APP_ONLY",
  "PUSH_QUEUED",
  "PUSH_SENT",
  "PUSH_FAILED",
]);
export type AlertDeliveryStatus = z.infer<typeof AlertDeliveryStatusEnum>;

// Alert event (user-facing alert)
export const AlertEventSchema = z.object({
  id: z.number().optional(),
  data_scope: z.string().default("PROD"),
  user_id: z.string(),
  threshold_event_id: z.number().nullable(),
  game_id: z.string().nullable(),
  pool_id: z.number().nullable(),
  item_type: WatchlistItemTypeEnum,
  item_id: z.string(),
  severity: AlertSeverityEnum,
  headline: z.string().max(120),
  body: z.string().max(240).nullable(),
  context_label: z.string().nullable(), // "NFL • DAL@PHI • Week 3"
  deep_link: z.string().nullable(), // "/intel/game/123"
  dedupe_key: z.string(),
  read_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  delivery_status: AlertDeliveryStatusEnum.default("IN_APP_ONLY"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type AlertEvent = z.infer<typeof AlertEventSchema>;

// Alert event with computed fields for UI
export const AlertEventDisplaySchema = AlertEventSchema.extend({
  time_ago: z.string(), // "2m ago"
  is_read: z.boolean(),
  is_dismissed: z.boolean(),
});
export type AlertEventDisplay = z.infer<typeof AlertEventDisplaySchema>;

// Alert sensitivity levels
export const AlertSensitivityEnum = z.enum([
  "CALM",       // Only CRITICAL + top IMPACT
  "STANDARD",   // CRITICAL + IMPACT
  "AGGRESSIVE", // Include INFO + more frequent IMPACT
]);
export type AlertSensitivity = z.infer<typeof AlertSensitivityEnum>;

// Alert preferences
export const AlertPreferencesSchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  is_enabled: z.boolean().default(true),
  sensitivity: AlertSensitivityEnum.default("CALM"),
  severity_minimum: AlertSeverityEnum.default("IMPACT"),
  channel_in_app: z.boolean().default(true),
  channel_push: z.boolean().default(false),
  channel_email: z.boolean().default(false),
  channel_sms: z.boolean().default(false),
  quiet_hours_enabled: z.boolean().default(true),
  quiet_hours_start: z.string().default("22:00"),
  quiet_hours_end: z.string().default("07:00"),
  per_item_overrides_json: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type AlertPreferences = z.infer<typeof AlertPreferencesSchema>;

// Update alert preferences input
export const UpdateAlertPreferencesSchema = z.object({
  is_enabled: z.boolean().optional(),
  sensitivity: AlertSensitivityEnum.optional(),
  severity_minimum: AlertSeverityEnum.optional(),
  channel_in_app: z.boolean().optional(),
  channel_push: z.boolean().optional(),
  channel_email: z.boolean().optional(),
  channel_sms: z.boolean().optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional(),
});
export type UpdateAlertPreferences = z.infer<typeof UpdateAlertPreferencesSchema>;

// Alert filter options
export const AlertFilterEnum = z.enum([
  "ALL",
  "CRITICAL",
  "IMPACT",
  "POOLS",
  "GAMES",
  "INJURIES",
  "ODDS",
]);
export type AlertFilter = z.infer<typeof AlertFilterEnum>;

// Alert events query
export const AlertEventsQuerySchema = z.object({
  filter: AlertFilterEnum.optional(),
  unread_only: z.boolean().optional(),
  limit: z.number().default(50),
  offset: z.number().default(0),
});
export type AlertEventsQuery = z.infer<typeof AlertEventsQuerySchema>;

// Alert counts for badge
export const AlertCountsSchema = z.object({
  total_unread: z.number(),
  critical_unread: z.number(),
  impact_unread: z.number(),
  info_unread: z.number(),
});
export type AlertCounts = z.infer<typeof AlertCountsSchema>;

// =====================================================
// LEGACY TYPES REFERENCE
// =====================================================

/**
 * Types shared between the client and server go here.
 *
 * For example, we can add zod schemas for API input validation, and derive types from them:
 *
 * export const TodoSchema = z.object({
 *   id: z.number(),
 *   name: z.string(),
 *   completed: z.number().int(), // 0 or 1
 * })
 *
 * export type TodoType = z.infer<typeof TodoSchema>;
 */
