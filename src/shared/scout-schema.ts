// Scout Structured Output Schema
// All Scout responses must conform to this schema for reliable UI rendering

export type ScoutIntent = 
  | "schedule"      // Game schedules by date/sport/league
  | "score"         // Live or final scores
  | "standings"     // League/division standings
  | "h2h"           // Head-to-head history
  | "injuries"      // Injury reports
  | "weather"       // Weather conditions for outdoor games
  | "lines"         // Lines/odds context (informational)
  | "stats"         // Team or player statistics
  | "rules"         // Pool rules, league rules, glossary
  | "picks"         // User's picks and history
  | "receipts"      // Pick submission receipts
  | "entity"        // Entity lookup/resolution
  | "form"          // Team recent form
  | "mixed"         // Multiple intents combined
  | "general";      // General conversation

export interface ScoutSource {
  sourceName: string;
  lastUpdated: string;  // ISO timestamp
  dataFreshness: "live" | "recent" | "stale" | "unknown";
  // Enhanced display fields (populated by buildStructuredResponse)
  displayTimestamp?: string;   // Human-readable: "Sat, Jan 15, 2:30 PM"
  relativeTime?: string;       // "5 minutes ago", "2 hours ago"
  isStale?: boolean;           // True if data is >30 minutes old
  ageMinutes?: number;         // Minutes since last update
  freshnessWarning?: string;   // Warning message if data is old
}

export interface ScoutTableColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
}

export interface ScoutTable {
  title: string;
  columns: ScoutTableColumn[];
  rows: Record<string, string | number | null>[];
  footnote?: string;
}

export interface ScoutRecommendedAction {
  label: string;
  route: string;
  description?: string;
}

export interface ScoutResponse {
  // Classification
  intent: ScoutIntent;
  
  // Main content
  answerSummary: string;
  keyPoints: string[];
  
  // Structured data (optional based on intent)
  tables?: ScoutTable[];
  
  // Data provenance
  sourcesUsed: ScoutSource[];
  asOf: string;  // ISO timestamp of response generation
  asOfDisplay?: string;  // Human-readable response timestamp
  dataTimestamp?: string;  // ISO timestamp of most recent data source
  dataTimestampDisplay?: string;  // "As of Sat, Jan 15, 2:30 PM (5 minutes ago)"
  
  // Navigation helpers
  recommendedNextActions: ScoutRecommendedAction[];
  
  // Safety compliance
  complianceNote?: string;  // Present if user asked for betting advice
  
  // Metadata for logging
  toolsCalled: string[];
  isBettingAdviceRequest: boolean;
  bettingAdviceFlags: string[];
}

// OpenAI JSON Schema for structured outputs
export const SCOUT_RESPONSE_SCHEMA = {
  name: "scout_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["schedule", "score", "standings", "h2h", "injuries", "weather", "lines", "stats", "rules", "picks", "receipts", "entity", "form", "mixed", "general"],
        description: "The primary intent/category of the user's question"
      },
      answerSummary: {
        type: "string",
        description: "A concise 1-2 sentence summary answering the user's question"
      },
      keyPoints: {
        type: "array",
        items: { type: "string" },
        description: "Bullet points with key information, facts, or context"
      },
      tables: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  label: { type: "string" },
                  align: { type: ["string", "null"], enum: ["left", "center", "right", null] }
                },
                required: ["key", "label"],
                additionalProperties: false
              }
            },
            rows: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            },
            footnote: { type: ["string", "null"] }
          },
          required: ["title", "columns", "rows"],
          additionalProperties: false
        },
        description: "Structured tables for schedules, standings, stats, etc."
      },
      sourcesUsed: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceName: { type: "string" },
            lastUpdated: { type: "string" },
            dataFreshness: { type: "string", enum: ["live", "recent", "stale", "unknown"] }
          },
          required: ["sourceName", "lastUpdated", "dataFreshness"],
          additionalProperties: false
        },
        description: "Data sources used to answer the question"
      },
      asOf: {
        type: "string",
        description: "ISO timestamp when this response was generated"
      },
      recommendedNextActions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            route: { type: "string" },
            description: { type: ["string", "null"] }
          },
          required: ["label", "route"],
          additionalProperties: false
        },
        description: "Suggested next steps or app pages to visit"
      },
      complianceNote: {
        type: ["string", "null"],
        description: "Safety note if user asked for betting advice"
      }
    },
    required: ["intent", "answerSummary", "keyPoints", "sourcesUsed", "asOf", "recommendedNextActions"],
    additionalProperties: false
  }
} as const;

// Entity types for resolution
export type EntityType = "team" | "player" | "event" | "league" | "venue" | "competition";

export interface ResolvedEntity {
  type: EntityType;
  id: string | number;
  name: string;
  aliases: string[];
  sport: string;
  league?: string;
  metadata?: Record<string, unknown>;
}

// Knowledge base article for RAG
export interface KnowledgeBaseArticle {
  id: string;
  category: "rules" | "glossary" | "pool_format" | "league_rules" | "app_help";
  title: string;
  content: string;
  sport?: string;
  league?: string;
  keywords: string[];
  lastUpdated: string;
}

// Competition format types
export type CompetitionFormat = "league" | "knockout" | "group_knockout" | "cup";

export interface SoccerCompetition {
  key: string;
  name: string;
  shortName: string;
  country: string;
  format: CompetitionFormat;
  tier: 1 | 2 | 3;  // 1 = top flight domestic, 2 = continental, 3 = international
  hasGroupStage?: boolean;
  knockoutRounds?: string[];
  tieBreakers: string[];  // Order of tie-break criteria
  aliases: string[];
}

// Comprehensive soccer competition registry
export const SOCCER_COMPETITIONS: SoccerCompetition[] = [
  // Top 5 European Leagues
  {
    key: "soccer_epl",
    name: "English Premier League",
    shortName: "EPL",
    country: "England",
    format: "league",
    tier: 1,
    tieBreakers: ["goal_difference", "goals_scored", "h2h_points", "h2h_gd"],
    aliases: ["premier league", "epl", "english premier league", "prem", "bpl"]
  },
  {
    key: "soccer_spain_la_liga",
    name: "La Liga",
    shortName: "La Liga",
    country: "Spain",
    format: "league",
    tier: 1,
    tieBreakers: ["h2h_points", "h2h_gd", "goal_difference", "goals_scored"],
    aliases: ["la liga", "laliga", "spanish league", "primera division", "spain"]
  },
  {
    key: "soccer_germany_bundesliga",
    name: "Bundesliga",
    shortName: "Bundesliga",
    country: "Germany",
    format: "league",
    tier: 1,
    tieBreakers: ["goal_difference", "goals_scored", "h2h_points", "away_goals"],
    aliases: ["bundesliga", "german league", "germany", "buli"]
  },
  {
    key: "soccer_italy_serie_a",
    name: "Serie A",
    shortName: "Serie A",
    country: "Italy",
    format: "league",
    tier: 1,
    tieBreakers: ["h2h_points", "h2h_gd", "goal_difference", "goals_scored"],
    aliases: ["serie a", "italian league", "italy", "calcio"]
  },
  {
    key: "soccer_france_ligue_one",
    name: "Ligue 1",
    shortName: "Ligue 1",
    country: "France",
    format: "league",
    tier: 1,
    tieBreakers: ["goal_difference", "goals_scored", "h2h_points"],
    aliases: ["ligue 1", "ligue1", "french league", "france", "ligue un"]
  },
  // UEFA Competitions
  {
    key: "soccer_uefa_champs_league",
    name: "UEFA Champions League",
    shortName: "UCL",
    country: "Europe",
    format: "group_knockout",
    tier: 2,
    hasGroupStage: true,
    knockoutRounds: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["h2h_points", "h2h_gd", "h2h_away_goals", "goal_difference", "goals_scored", "away_goals"],
    aliases: ["champions league", "ucl", "cl", "european cup"]
  },
  {
    key: "soccer_uefa_europa_league",
    name: "UEFA Europa League",
    shortName: "UEL",
    country: "Europe",
    format: "group_knockout",
    tier: 2,
    hasGroupStage: true,
    knockoutRounds: ["Knockout Round Playoffs", "Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["h2h_points", "h2h_gd", "h2h_away_goals", "goal_difference", "goals_scored", "away_goals"],
    aliases: ["europa league", "uel", "uefa cup", "europa"]
  },
  {
    key: "soccer_uefa_conference_league",
    name: "UEFA Conference League",
    shortName: "UECL",
    country: "Europe",
    format: "group_knockout",
    tier: 2,
    hasGroupStage: true,
    knockoutRounds: ["Knockout Round Playoffs", "Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["h2h_points", "h2h_gd", "h2h_away_goals", "goal_difference", "goals_scored"],
    aliases: ["conference league", "uecl", "europa conference"]
  },
  // Americas
  {
    key: "soccer_usa_mls",
    name: "Major League Soccer",
    shortName: "MLS",
    country: "USA/Canada",
    format: "league",
    tier: 1,
    tieBreakers: ["total_wins", "goal_difference", "goals_scored", "away_goals"],
    aliases: ["mls", "major league soccer", "american soccer"]
  },
  {
    key: "soccer_brazil_serie_a",
    name: "Brasileirão Série A",
    shortName: "Brasileirão",
    country: "Brazil",
    format: "league",
    tier: 1,
    tieBreakers: ["total_wins", "goal_difference", "goals_scored"],
    aliases: ["brasileirao", "brazilian league", "brazil", "serie a brazil"]
  },
  {
    key: "soccer_argentina_primera",
    name: "Argentine Primera División",
    shortName: "Liga Argentina",
    country: "Argentina",
    format: "league",
    tier: 1,
    tieBreakers: ["goal_difference", "goals_scored"],
    aliases: ["argentine league", "argentina primera", "liga argentina"]
  },
  {
    key: "soccer_conmebol_libertadores",
    name: "Copa Libertadores",
    shortName: "Libertadores",
    country: "South America",
    format: "group_knockout",
    tier: 2,
    hasGroupStage: true,
    knockoutRounds: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["goal_difference", "goals_scored", "away_goals"],
    aliases: ["libertadores", "copa libertadores", "south american champions league"]
  },
  // Other European
  {
    key: "soccer_netherlands_eredivisie",
    name: "Eredivisie",
    shortName: "Eredivisie",
    country: "Netherlands",
    format: "league",
    tier: 1,
    tieBreakers: ["goal_difference", "goals_scored"],
    aliases: ["eredivisie", "dutch league", "netherlands"]
  },
  {
    key: "soccer_portugal_primeira_liga",
    name: "Primeira Liga",
    shortName: "Liga Portugal",
    country: "Portugal",
    format: "league",
    tier: 1,
    tieBreakers: ["h2h_points", "goal_difference", "goals_scored"],
    aliases: ["primeira liga", "portuguese league", "portugal", "liga portugal"]
  },
  // International Tournaments
  {
    key: "soccer_fifa_world_cup",
    name: "FIFA World Cup",
    shortName: "World Cup",
    country: "International",
    format: "group_knockout",
    tier: 3,
    hasGroupStage: true,
    knockoutRounds: ["Round of 16", "Quarter-finals", "Semi-finals", "Third Place", "Final"],
    tieBreakers: ["goal_difference", "goals_scored", "fair_play", "drawing_lots"],
    aliases: ["world cup", "fifa world cup", "wc"]
  },
  {
    key: "soccer_uefa_euro",
    name: "UEFA European Championship",
    shortName: "Euro",
    country: "Europe",
    format: "group_knockout",
    tier: 3,
    hasGroupStage: true,
    knockoutRounds: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["h2h_points", "h2h_gd", "goal_difference", "goals_scored"],
    aliases: ["euro", "european championship", "euros", "uefa euro"]
  },
  {
    key: "soccer_conmebol_copa_america",
    name: "Copa América",
    shortName: "Copa América",
    country: "South America",
    format: "group_knockout",
    tier: 3,
    hasGroupStage: true,
    knockoutRounds: ["Quarter-finals", "Semi-finals", "Third Place", "Final"],
    tieBreakers: ["goal_difference", "goals_scored", "fair_play"],
    aliases: ["copa america", "copa américa", "south american championship"]
  },
  {
    key: "soccer_concacaf_gold_cup",
    name: "CONCACAF Gold Cup",
    shortName: "Gold Cup",
    country: "North America",
    format: "group_knockout",
    tier: 3,
    hasGroupStage: true,
    knockoutRounds: ["Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["goal_difference", "goals_scored"],
    aliases: ["gold cup", "concacaf gold cup"]
  },
  {
    key: "soccer_afc_asian_cup",
    name: "AFC Asian Cup",
    shortName: "Asian Cup",
    country: "Asia",
    format: "group_knockout",
    tier: 3,
    hasGroupStage: true,
    knockoutRounds: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["goal_difference", "goals_scored", "fair_play"],
    aliases: ["asian cup", "afc asian cup"]
  },
  {
    key: "soccer_caf_afcon",
    name: "Africa Cup of Nations",
    shortName: "AFCON",
    country: "Africa",
    format: "group_knockout",
    tier: 3,
    hasGroupStage: true,
    knockoutRounds: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: ["goal_difference", "goals_scored", "fair_play"],
    aliases: ["afcon", "africa cup of nations", "african cup"]
  },
  // Domestic Cups
  {
    key: "soccer_england_fa_cup",
    name: "FA Cup",
    shortName: "FA Cup",
    country: "England",
    format: "knockout",
    tier: 1,
    knockoutRounds: ["First Round", "Second Round", "Third Round", "Fourth Round", "Fifth Round", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: [],
    aliases: ["fa cup", "english cup", "the cup"]
  },
  {
    key: "soccer_spain_copa_del_rey",
    name: "Copa del Rey",
    shortName: "Copa del Rey",
    country: "Spain",
    format: "knockout",
    tier: 1,
    knockoutRounds: ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"],
    tieBreakers: [],
    aliases: ["copa del rey", "spanish cup", "kings cup"]
  },
];

// Sports and leagues supported - Universal All-Sports Coverage
export const SUPPORTED_SPORTS = [
  // ==========================================
  // AMERICAN FOOTBALL
  // ==========================================
  { key: "americanfootball_nfl", name: "NFL", sport: "football", priority: 1, aliases: ["nfl", "national football league", "pro football"] },
  { key: "americanfootball_nfl_preseason", name: "NFL Preseason", sport: "football", priority: 3, aliases: ["nfl preseason"] },
  { key: "americanfootball_ncaaf", name: "NCAA Football", sport: "football", priority: 1, aliases: ["college football", "ncaaf", "cfb", "ncaa football"] },
  { key: "americanfootball_nfl_super_bowl", name: "Super Bowl", sport: "football", priority: 1, aliases: ["super bowl", "superbowl"] },
  { key: "americanfootball_cfl", name: "CFL", sport: "football", priority: 3, aliases: ["cfl", "canadian football"] },
  { key: "americanfootball_xfl", name: "XFL", sport: "football", priority: 3, aliases: ["xfl"] },
  { key: "americanfootball_usfl", name: "USFL", sport: "football", priority: 3, aliases: ["usfl"] },
  
  // ==========================================
  // BASKETBALL
  // ==========================================
  { key: "basketball_nba", name: "NBA", sport: "basketball", priority: 1, aliases: ["nba", "national basketball association", "pro basketball"] },
  { key: "basketball_nba_preseason", name: "NBA Preseason", sport: "basketball", priority: 3, aliases: ["nba preseason"] },
  { key: "basketball_ncaab", name: "NCAA Basketball (Men's)", sport: "basketball", priority: 1, aliases: ["college basketball", "ncaab", "march madness", "ncaa basketball"] },
  { key: "basketball_ncaaw", name: "NCAA Basketball (Women's)", sport: "basketball", priority: 2, aliases: ["women's college basketball", "ncaaw"] },
  { key: "basketball_wnba", name: "WNBA", sport: "basketball", priority: 2, aliases: ["wnba", "women's nba"] },
  { key: "basketball_nba_finals", name: "NBA Finals", sport: "basketball", priority: 1, aliases: ["nba finals"] },
  { key: "basketball_euroleague", name: "EuroLeague", sport: "basketball", priority: 3, aliases: ["euroleague", "european basketball"] },
  { key: "basketball_nba_g_league", name: "NBA G League", sport: "basketball", priority: 3, aliases: ["g league", "nba g league"] },
  
  // ==========================================
  // BASEBALL
  // ==========================================
  { key: "baseball_mlb", name: "MLB", sport: "baseball", priority: 1, aliases: ["mlb", "major league baseball", "pro baseball"] },
  { key: "baseball_mlb_preseason", name: "MLB Spring Training", sport: "baseball", priority: 3, aliases: ["spring training"] },
  { key: "baseball_mlb_world_series", name: "World Series", sport: "baseball", priority: 1, aliases: ["world series"] },
  { key: "baseball_ncaa", name: "NCAA Baseball", sport: "baseball", priority: 3, aliases: ["college baseball", "college world series"] },
  { key: "baseball_npb", name: "NPB (Japan)", sport: "baseball", priority: 3, aliases: ["npb", "japanese baseball", "nippon"] },
  { key: "baseball_kbo", name: "KBO (Korea)", sport: "baseball", priority: 3, aliases: ["kbo", "korean baseball"] },
  
  // ==========================================
  // HOCKEY
  // ==========================================
  { key: "icehockey_nhl", name: "NHL", sport: "hockey", priority: 1, aliases: ["nhl", "national hockey league", "pro hockey"] },
  { key: "icehockey_nhl_preseason", name: "NHL Preseason", sport: "hockey", priority: 3, aliases: ["nhl preseason"] },
  { key: "icehockey_nhl_stanley_cup", name: "Stanley Cup Playoffs", sport: "hockey", priority: 1, aliases: ["stanley cup", "nhl playoffs"] },
  { key: "icehockey_ncaa", name: "NCAA Hockey", sport: "hockey", priority: 3, aliases: ["college hockey", "frozen four"] },
  { key: "icehockey_khl", name: "KHL", sport: "hockey", priority: 3, aliases: ["khl", "russian hockey"] },
  { key: "icehockey_shl", name: "SHL (Sweden)", sport: "hockey", priority: 3, aliases: ["shl", "swedish hockey"] },
  
  // ==========================================
  // SOCCER - Top Leagues
  // ==========================================
  { key: "soccer_epl", name: "English Premier League", sport: "soccer", priority: 1, aliases: ["premier league", "epl", "prem", "english premier league"] },
  { key: "soccer_spain_la_liga", name: "La Liga", sport: "soccer", priority: 1, aliases: ["la liga", "laliga", "spanish league"] },
  { key: "soccer_italy_serie_a", name: "Serie A", sport: "soccer", priority: 1, aliases: ["serie a", "italian league", "calcio"] },
  { key: "soccer_germany_bundesliga", name: "Bundesliga", sport: "soccer", priority: 1, aliases: ["bundesliga", "german league"] },
  { key: "soccer_france_ligue_one", name: "Ligue 1", sport: "soccer", priority: 1, aliases: ["ligue 1", "french league"] },
  
  // Soccer - UEFA Competitions
  { key: "soccer_uefa_champs_league", name: "UEFA Champions League", sport: "soccer", priority: 1, aliases: ["champions league", "ucl", "cl"] },
  { key: "soccer_uefa_europa_league", name: "UEFA Europa League", sport: "soccer", priority: 2, aliases: ["europa league", "uel"] },
  { key: "soccer_uefa_conference_league", name: "UEFA Conference League", sport: "soccer", priority: 2, aliases: ["conference league", "uecl"] },
  { key: "soccer_uefa_nations_league", name: "UEFA Nations League", sport: "soccer", priority: 2, aliases: ["nations league"] },
  
  // Soccer - Americas
  { key: "soccer_usa_mls", name: "MLS", sport: "soccer", priority: 2, aliases: ["mls", "major league soccer"] },
  { key: "soccer_mexico_liga_mx", name: "Liga MX", sport: "soccer", priority: 2, aliases: ["liga mx", "mexican league"] },
  { key: "soccer_brazil_serie_a", name: "Brasileirão", sport: "soccer", priority: 2, aliases: ["brasileirao", "brazilian league"] },
  { key: "soccer_argentina_primera", name: "Liga Argentina", sport: "soccer", priority: 2, aliases: ["argentine league", "argentina"] },
  { key: "soccer_conmebol_libertadores", name: "Copa Libertadores", sport: "soccer", priority: 2, aliases: ["libertadores", "copa libertadores"] },
  
  // Soccer - International
  { key: "soccer_fifa_world_cup", name: "FIFA World Cup", sport: "soccer", priority: 1, aliases: ["world cup", "fifa world cup"] },
  { key: "soccer_fifa_world_cup_women", name: "FIFA Women's World Cup", sport: "soccer", priority: 1, aliases: ["women's world cup"] },
  { key: "soccer_uefa_euro", name: "UEFA Euro", sport: "soccer", priority: 1, aliases: ["euro", "euros", "european championship"] },
  { key: "soccer_conmebol_copa_america", name: "Copa América", sport: "soccer", priority: 2, aliases: ["copa america"] },
  { key: "soccer_concacaf_gold_cup", name: "CONCACAF Gold Cup", sport: "soccer", priority: 2, aliases: ["gold cup"] },
  { key: "soccer_caf_afcon", name: "Africa Cup of Nations", sport: "soccer", priority: 2, aliases: ["afcon", "africa cup"] },
  
  // Soccer - Other European
  { key: "soccer_netherlands_eredivisie", name: "Eredivisie", sport: "soccer", priority: 3, aliases: ["eredivisie", "dutch league"] },
  { key: "soccer_portugal_primeira_liga", name: "Liga Portugal", sport: "soccer", priority: 3, aliases: ["primeira liga", "portuguese league"] },
  { key: "soccer_scotland_premiership", name: "Scottish Premiership", sport: "soccer", priority: 3, aliases: ["scottish premiership", "spfl"] },
  { key: "soccer_belgium_first_div", name: "Belgian Pro League", sport: "soccer", priority: 3, aliases: ["belgian league"] },
  { key: "soccer_turkey_super_lig", name: "Turkish Süper Lig", sport: "soccer", priority: 3, aliases: ["super lig", "turkish league"] },
  
  // Soccer - Domestic Cups
  { key: "soccer_england_fa_cup", name: "FA Cup", sport: "soccer", priority: 2, aliases: ["fa cup", "english cup"] },
  { key: "soccer_england_efl_cup", name: "EFL Cup", sport: "soccer", priority: 3, aliases: ["league cup", "carabao cup", "efl cup"] },
  { key: "soccer_spain_copa_del_rey", name: "Copa del Rey", sport: "soccer", priority: 2, aliases: ["copa del rey", "spanish cup"] },
  { key: "soccer_germany_dfb_pokal", name: "DFB-Pokal", sport: "soccer", priority: 2, aliases: ["dfb pokal", "german cup"] },
  { key: "soccer_italy_coppa_italia", name: "Coppa Italia", sport: "soccer", priority: 2, aliases: ["coppa italia", "italian cup"] },
  { key: "soccer_france_coupe_de_france", name: "Coupe de France", sport: "soccer", priority: 3, aliases: ["coupe de france", "french cup"] },
  
  // ==========================================
  // COMBAT SPORTS - UFC/MMA
  // ==========================================
  { key: "mma_ufc", name: "UFC", sport: "mma", priority: 1, aliases: ["ufc", "ultimate fighting championship"] },
  { key: "mma_bellator", name: "Bellator MMA", sport: "mma", priority: 2, aliases: ["bellator"] },
  { key: "mma_pfl", name: "PFL", sport: "mma", priority: 2, aliases: ["pfl", "professional fighters league"] },
  { key: "mma_one_championship", name: "ONE Championship", sport: "mma", priority: 2, aliases: ["one fc", "one championship"] },
  
  // Combat Sports - Boxing
  { key: "boxing_heavyweight", name: "Boxing - Heavyweight", sport: "boxing", priority: 1, aliases: ["heavyweight boxing"] },
  { key: "boxing_cruiserweight", name: "Boxing - Cruiserweight", sport: "boxing", priority: 2, aliases: ["cruiserweight boxing"] },
  { key: "boxing_light_heavyweight", name: "Boxing - Light Heavyweight", sport: "boxing", priority: 2, aliases: ["light heavyweight boxing"] },
  { key: "boxing_middleweight", name: "Boxing - Middleweight", sport: "boxing", priority: 2, aliases: ["middleweight boxing"] },
  { key: "boxing_welterweight", name: "Boxing - Welterweight", sport: "boxing", priority: 2, aliases: ["welterweight boxing"] },
  { key: "boxing_lightweight", name: "Boxing - Lightweight", sport: "boxing", priority: 2, aliases: ["lightweight boxing"] },
  { key: "boxing_featherweight", name: "Boxing - Featherweight", sport: "boxing", priority: 2, aliases: ["featherweight boxing"] },
  { key: "boxing_bantamweight", name: "Boxing - Bantamweight", sport: "boxing", priority: 2, aliases: ["bantamweight boxing"] },
  
  // ==========================================
  // MOTORSPORTS
  // ==========================================
  { key: "motorsport_f1", name: "Formula 1", sport: "motorsport", priority: 1, aliases: ["f1", "formula 1", "formula one"] },
  { key: "motorsport_f2", name: "Formula 2", sport: "motorsport", priority: 3, aliases: ["f2", "formula 2"] },
  { key: "motorsport_f3", name: "Formula 3", sport: "motorsport", priority: 3, aliases: ["f3", "formula 3"] },
  { key: "motorsport_nascar_cup", name: "NASCAR Cup Series", sport: "motorsport", priority: 1, aliases: ["nascar", "nascar cup", "cup series"] },
  { key: "motorsport_nascar_xfinity", name: "NASCAR Xfinity Series", sport: "motorsport", priority: 3, aliases: ["xfinity series", "xfinity"] },
  { key: "motorsport_nascar_trucks", name: "NASCAR Truck Series", sport: "motorsport", priority: 3, aliases: ["truck series", "camping world truck"] },
  { key: "motorsport_indycar", name: "IndyCar Series", sport: "motorsport", priority: 2, aliases: ["indycar", "indy car", "indy 500"] },
  { key: "motorsport_motogp", name: "MotoGP", sport: "motorsport", priority: 2, aliases: ["motogp", "moto gp", "motorcycle racing"] },
  { key: "motorsport_moto2", name: "Moto2", sport: "motorsport", priority: 3, aliases: ["moto2"] },
  { key: "motorsport_moto3", name: "Moto3", sport: "motorsport", priority: 3, aliases: ["moto3"] },
  { key: "motorsport_wec", name: "World Endurance Championship", sport: "motorsport", priority: 3, aliases: ["wec", "le mans", "endurance racing"] },
  { key: "motorsport_wrc", name: "World Rally Championship", sport: "motorsport", priority: 3, aliases: ["wrc", "rally", "rallying"] },
  { key: "motorsport_supercars", name: "Supercars Championship", sport: "motorsport", priority: 3, aliases: ["supercars", "v8 supercars"] },
  { key: "motorsport_formula_e", name: "Formula E", sport: "motorsport", priority: 3, aliases: ["formula e", "fe"] },
  
  // ==========================================
  // TENNIS
  // ==========================================
  { key: "tennis_atp", name: "ATP Tour", sport: "tennis", priority: 1, aliases: ["atp", "atp tour", "mens tennis"] },
  { key: "tennis_wta", name: "WTA Tour", sport: "tennis", priority: 1, aliases: ["wta", "wta tour", "womens tennis"] },
  { key: "tennis_australian_open", name: "Australian Open", sport: "tennis", priority: 1, aliases: ["australian open", "aus open"] },
  { key: "tennis_french_open", name: "French Open", sport: "tennis", priority: 1, aliases: ["french open", "roland garros"] },
  { key: "tennis_wimbledon", name: "Wimbledon", sport: "tennis", priority: 1, aliases: ["wimbledon"] },
  { key: "tennis_us_open", name: "US Open", sport: "tennis", priority: 1, aliases: ["us open", "us open tennis"] },
  { key: "tennis_atp_finals", name: "ATP Finals", sport: "tennis", priority: 2, aliases: ["atp finals", "tour finals"] },
  { key: "tennis_wta_finals", name: "WTA Finals", sport: "tennis", priority: 2, aliases: ["wta finals"] },
  { key: "tennis_davis_cup", name: "Davis Cup", sport: "tennis", priority: 2, aliases: ["davis cup"] },
  { key: "tennis_billie_jean_king_cup", name: "Billie Jean King Cup", sport: "tennis", priority: 2, aliases: ["billie jean king cup", "fed cup"] },
  { key: "tennis_indian_wells", name: "Indian Wells Masters", sport: "tennis", priority: 2, aliases: ["indian wells", "bnp paribas open"] },
  { key: "tennis_miami_open", name: "Miami Open", sport: "tennis", priority: 2, aliases: ["miami open"] },
  
  // ==========================================
  // GOLF
  // ==========================================
  { key: "golf_pga", name: "PGA Tour", sport: "golf", priority: 1, aliases: ["pga", "pga tour"] },
  { key: "golf_lpga", name: "LPGA Tour", sport: "golf", priority: 2, aliases: ["lpga", "lpga tour", "womens golf"] },
  { key: "golf_european_tour", name: "DP World Tour", sport: "golf", priority: 2, aliases: ["european tour", "dp world tour"] },
  { key: "golf_liv", name: "LIV Golf", sport: "golf", priority: 2, aliases: ["liv", "liv golf"] },
  { key: "golf_masters", name: "The Masters", sport: "golf", priority: 1, aliases: ["masters", "the masters", "augusta"] },
  { key: "golf_pga_championship", name: "PGA Championship", sport: "golf", priority: 1, aliases: ["pga championship"] },
  { key: "golf_us_open", name: "U.S. Open (Golf)", sport: "golf", priority: 1, aliases: ["us open golf"] },
  { key: "golf_open_championship", name: "The Open Championship", sport: "golf", priority: 1, aliases: ["the open", "british open", "open championship"] },
  { key: "golf_ryder_cup", name: "Ryder Cup", sport: "golf", priority: 1, aliases: ["ryder cup"] },
  { key: "golf_presidents_cup", name: "Presidents Cup", sport: "golf", priority: 2, aliases: ["presidents cup"] },
  { key: "golf_fedex_cup", name: "FedEx Cup Playoffs", sport: "golf", priority: 2, aliases: ["fedex cup", "tour championship"] },
  
  // ==========================================
  // OTHER SPORTS
  // ==========================================
  // Rugby
  { key: "rugby_six_nations", name: "Six Nations", sport: "rugby", priority: 2, aliases: ["six nations", "6 nations"] },
  { key: "rugby_world_cup", name: "Rugby World Cup", sport: "rugby", priority: 2, aliases: ["rugby world cup"] },
  { key: "rugby_premiership", name: "Premiership Rugby", sport: "rugby", priority: 3, aliases: ["premiership rugby", "english rugby"] },
  { key: "rugby_top14", name: "Top 14", sport: "rugby", priority: 3, aliases: ["top 14", "french rugby"] },
  
  // Cricket
  { key: "cricket_ipl", name: "Indian Premier League", sport: "cricket", priority: 2, aliases: ["ipl", "indian premier league"] },
  { key: "cricket_bbl", name: "Big Bash League", sport: "cricket", priority: 3, aliases: ["big bash", "bbl"] },
  { key: "cricket_world_cup", name: "Cricket World Cup", sport: "cricket", priority: 2, aliases: ["cricket world cup"] },
  { key: "cricket_t20_world_cup", name: "T20 World Cup", sport: "cricket", priority: 2, aliases: ["t20 world cup"] },
  { key: "cricket_ashes", name: "The Ashes", sport: "cricket", priority: 2, aliases: ["ashes", "the ashes"] },
  
  // Cycling
  { key: "cycling_tour_de_france", name: "Tour de France", sport: "cycling", priority: 2, aliases: ["tour de france", "tdf"] },
  { key: "cycling_giro", name: "Giro d'Italia", sport: "cycling", priority: 2, aliases: ["giro", "giro d'italia"] },
  { key: "cycling_vuelta", name: "Vuelta a España", sport: "cycling", priority: 2, aliases: ["vuelta", "vuelta a espana"] },
  
  // Olympics & Multi-sport
  { key: "olympics_summer", name: "Summer Olympics", sport: "olympics", priority: 1, aliases: ["olympics", "summer olympics", "summer games"] },
  { key: "olympics_winter", name: "Winter Olympics", sport: "olympics", priority: 1, aliases: ["winter olympics", "winter games"] },
  
  // Esports
  { key: "esports_league_of_legends", name: "League of Legends", sport: "esports", priority: 3, aliases: ["lol", "league of legends"] },
  { key: "esports_csgo", name: "Counter-Strike", sport: "esports", priority: 3, aliases: ["cs2", "csgo", "counter strike"] },
  { key: "esports_dota2", name: "Dota 2", sport: "esports", priority: 3, aliases: ["dota", "dota 2"] },
  { key: "esports_valorant", name: "Valorant", sport: "esports", priority: 3, aliases: ["valorant"] },
] as const;

export type SportKey = typeof SUPPORTED_SPORTS[number]["key"];

// Helper to get competition config by key
export function getCompetitionConfig(key: string): SoccerCompetition | undefined {
  return SOCCER_COMPETITIONS.find(c => c.key === key);
}

// Helper to find competition by alias
export function findCompetitionByAlias(query: string): SoccerCompetition | undefined {
  const lower = query.toLowerCase().trim();
  return SOCCER_COMPETITIONS.find(c => 
    c.key === lower ||
    c.name.toLowerCase() === lower ||
    c.shortName.toLowerCase() === lower ||
    c.aliases.some(a => a === lower || lower.includes(a))
  );
}

// Helper to detect if a match is in knockout stage
export function isKnockoutMatch(competition: SoccerCompetition, round?: string): boolean {
  if (competition.format === "knockout") return true;
  if (competition.format === "group_knockout" && round) {
    return competition.knockoutRounds?.some(kr => 
      round.toLowerCase().includes(kr.toLowerCase())
    ) || false;
  }
  return false;
}

// Helper to format timestamps for display
export function formatAsOf(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
}

// Helper to determine data freshness
export function getDataFreshness(lastUpdated: string): ScoutSource["dataFreshness"] {
  const date = new Date(lastUpdated);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 5) return "live";
  if (diffMins < 60) return "recent";
  if (diffMins < 1440) return "stale";
  return "unknown";
}

// Match Context Detection Types
export type MatchStage = 
  | "league"           // Regular league match
  | "group_stage"      // Group stage of tournament
  | "knockout_playoffs"// Playoff round (early knockout)
  | "round_of_32"
  | "round_of_16"
  | "quarter_finals"
  | "semi_finals"
  | "third_place"
  | "final"
  | "first_round"      // Early cup rounds
  | "second_round"
  | "third_round"
  | "fourth_round"
  | "fifth_round"
  | "unknown";

export type MatchSignificance = 
  | "regular"          // Normal match
  | "title_decider"    // Could decide championship
  | "relegation_battle"// Relegation implications
  | "promotion_battle" // Promotion playoffs
  | "top_4_race"       // Champions League qualification
  | "europa_race"      // Europa League qualification
  | "derby"            // Local derby
  | "rivalry"          // Historic rivalry
  | "cup_final"        // Cup competition final
  | "elimination"      // Knockout elimination match
  | "must_win";        // Team must win to advance/stay up

export interface MatchContext {
  competition: {
    key: string;
    name: string;
    shortName: string;
    format: CompetitionFormat;
    country: string;
  };
  stage: MatchStage;
  stageName: string;          // Human readable stage name
  isKnockout: boolean;        // Is this a knockout match?
  isTwoLegged: boolean;       // Is this part of a two-leg tie?
  legNumber?: 1 | 2;          // Which leg (if applicable)
  aggregateScore?: string;    // Aggregate score (if second leg)
  significance: MatchSignificance[];
  significanceNotes: string[];
  isNeutralVenue: boolean;
  extraTimeAllowed: boolean;  // Can go to extra time?
  awayGoalsRule: boolean;     // Does away goals rule apply?
  tieBreakers: string[];      // How ties are broken
}

// Known derbies and rivalries
export const SOCCER_RIVALRIES: { teams: [string, string]; type: "derby" | "rivalry"; name: string }[] = [
  // English derbies
  { teams: ["Liverpool", "Everton"], type: "derby", name: "Merseyside Derby" },
  { teams: ["Liverpool", "Manchester United"], type: "rivalry", name: "North West Derby" },
  { teams: ["Manchester United", "Manchester City"], type: "derby", name: "Manchester Derby" },
  { teams: ["Arsenal", "Tottenham"], type: "derby", name: "North London Derby" },
  { teams: ["Chelsea", "Tottenham"], type: "rivalry", name: "London Derby" },
  { teams: ["Chelsea", "Arsenal"], type: "rivalry", name: "London Derby" },
  { teams: ["West Ham", "Tottenham"], type: "derby", name: "London Derby" },
  { teams: ["Newcastle", "Sunderland"], type: "derby", name: "Tyne-Wear Derby" },
  { teams: ["Aston Villa", "Birmingham"], type: "derby", name: "Second City Derby" },
  
  // Spanish derbies
  { teams: ["Real Madrid", "Barcelona"], type: "rivalry", name: "El Clásico" },
  { teams: ["Real Madrid", "Atletico Madrid"], type: "derby", name: "Madrid Derby" },
  { teams: ["Barcelona", "Espanyol"], type: "derby", name: "Catalan Derby" },
  { teams: ["Sevilla", "Real Betis"], type: "derby", name: "Seville Derby" },
  { teams: ["Athletic Bilbao", "Real Sociedad"], type: "derby", name: "Basque Derby" },
  
  // Italian derbies
  { teams: ["AC Milan", "Inter Milan"], type: "derby", name: "Derby della Madonnina" },
  { teams: ["Juventus", "Inter Milan"], type: "rivalry", name: "Derby d'Italia" },
  { teams: ["Roma", "Lazio"], type: "derby", name: "Derby della Capitale" },
  { teams: ["Juventus", "Torino"], type: "derby", name: "Derby della Mole" },
  { teams: ["Genoa", "Sampdoria"], type: "derby", name: "Derby della Lanterna" },
  
  // German derbies
  { teams: ["Borussia Dortmund", "Schalke"], type: "derby", name: "Revierderby" },
  { teams: ["Bayern Munich", "Borussia Dortmund"], type: "rivalry", name: "Der Klassiker" },
  { teams: ["Bayern Munich", "1860 Munich"], type: "derby", name: "Munich Derby" },
  { teams: ["Hamburg", "Werder Bremen"], type: "derby", name: "Nordderby" },
  
  // French derbies
  { teams: ["Paris Saint-Germain", "Marseille"], type: "rivalry", name: "Le Classique" },
  { teams: ["Lyon", "Saint-Etienne"], type: "derby", name: "Derby Rhône-Alpes" },
  
  // Scottish derbies
  { teams: ["Celtic", "Rangers"], type: "derby", name: "Old Firm Derby" },
  
  // Portuguese derbies
  { teams: ["Benfica", "Sporting"], type: "derby", name: "Lisbon Derby" },
  { teams: ["Benfica", "Porto"], type: "rivalry", name: "O Clássico" },
  
  // Dutch derbies
  { teams: ["Ajax", "Feyenoord"], type: "derby", name: "De Klassieker" },
  { teams: ["Ajax", "PSV"], type: "rivalry", name: "De Topper" },
  
  // South American
  { teams: ["Boca Juniors", "River Plate"], type: "derby", name: "Superclásico" },
  { teams: ["Flamengo", "Fluminense"], type: "derby", name: "Fla-Flu" },
  { teams: ["Corinthians", "Palmeiras"], type: "derby", name: "Derby Paulista" },
  
  // MLS
  { teams: ["LA Galaxy", "LAFC"], type: "derby", name: "El Tráfico" },
  { teams: ["New York Red Bulls", "NYCFC"], type: "derby", name: "Hudson River Derby" },
  { teams: ["Seattle Sounders", "Portland Timbers"], type: "derby", name: "Cascadia Cup" },
];

// Detect match stage from competition and round info
export function detectMatchStage(
  competition: SoccerCompetition,
  roundName?: string,
  periodId?: string
): { stage: MatchStage; stageName: string } {
  const round = (roundName || periodId || "").toLowerCase();
  
  // Pure knockout competitions
  if (competition.format === "knockout") {
    if (round.includes("final") && !round.includes("semi") && !round.includes("quarter")) {
      return { stage: "final", stageName: "Final" };
    }
    if (round.includes("semi")) {
      return { stage: "semi_finals", stageName: "Semi-finals" };
    }
    if (round.includes("quarter")) {
      return { stage: "quarter_finals", stageName: "Quarter-finals" };
    }
    if (round.includes("16") || round.includes("last 16") || round.includes("last sixteen")) {
      return { stage: "round_of_16", stageName: "Round of 16" };
    }
    if (round.includes("32")) {
      return { stage: "round_of_32", stageName: "Round of 32" };
    }
    if (round.includes("fifth")) {
      return { stage: "fifth_round", stageName: "Fifth Round" };
    }
    if (round.includes("fourth")) {
      return { stage: "fourth_round", stageName: "Fourth Round" };
    }
    if (round.includes("third")) {
      return { stage: "third_round", stageName: "Third Round" };
    }
    if (round.includes("second")) {
      return { stage: "second_round", stageName: "Second Round" };
    }
    if (round.includes("first")) {
      return { stage: "first_round", stageName: "First Round" };
    }
    return { stage: "knockout_playoffs", stageName: "Knockout Round" };
  }
  
  // Group + knockout competitions (UCL, World Cup, etc.)
  if (competition.format === "group_knockout") {
    if (round.includes("group")) {
      return { stage: "group_stage", stageName: "Group Stage" };
    }
    if (round.includes("final") && !round.includes("semi") && !round.includes("quarter")) {
      return { stage: "final", stageName: "Final" };
    }
    if (round.includes("third place") || round.includes("3rd place")) {
      return { stage: "third_place", stageName: "Third Place Play-off" };
    }
    if (round.includes("semi")) {
      return { stage: "semi_finals", stageName: "Semi-finals" };
    }
    if (round.includes("quarter")) {
      return { stage: "quarter_finals", stageName: "Quarter-finals" };
    }
    if (round.includes("16") || round.includes("last 16")) {
      return { stage: "round_of_16", stageName: "Round of 16" };
    }
    if (round.includes("playoff") || round.includes("play-off")) {
      return { stage: "knockout_playoffs", stageName: "Knockout Playoffs" };
    }
    // Default to group stage if no round info
    return { stage: "group_stage", stageName: "Group Stage" };
  }
  
  // Pure league competition
  return { stage: "league", stageName: "League Match" };
}

// Check if two teams have a known rivalry
export function detectRivalry(
  homeTeam: string,
  awayTeam: string
): { isDerby: boolean; isRivalry: boolean; name?: string } {
  const home = homeTeam.toLowerCase();
  const away = awayTeam.toLowerCase();
  
  for (const rivalry of SOCCER_RIVALRIES) {
    const team1 = rivalry.teams[0].toLowerCase();
    const team2 = rivalry.teams[1].toLowerCase();
    
    if ((home.includes(team1) || team1.includes(home)) && 
        (away.includes(team2) || team2.includes(away))) {
      return {
        isDerby: rivalry.type === "derby",
        isRivalry: rivalry.type === "rivalry",
        name: rivalry.name
      };
    }
    if ((home.includes(team2) || team2.includes(home)) && 
        (away.includes(team1) || team1.includes(away))) {
      return {
        isDerby: rivalry.type === "derby",
        isRivalry: rivalry.type === "rivalry",
        name: rivalry.name
      };
    }
  }
  
  return { isDerby: false, isRivalry: false };
}

// Build full match context
export function buildMatchContext(
  homeTeam: string,
  awayTeam: string,
  sportKey: string,
  roundName?: string,
  periodId?: string,
  homeStanding?: number,
  awayStanding?: number,
  totalTeams?: number
): MatchContext {
  // Find competition config
  const competition = SOCCER_COMPETITIONS.find(c => c.key === sportKey) || {
    key: sportKey,
    name: sportKey,
    shortName: sportKey,
    country: "Unknown",
    format: "league" as CompetitionFormat,
    tier: 1 as const,
    tieBreakers: [],
    aliases: []
  };
  
  // Detect stage
  const { stage, stageName } = detectMatchStage(competition, roundName, periodId);
  const isKnockout = stage !== "league" && stage !== "group_stage";
  
  // Check for two-legged tie (UCL knockouts, etc.)
  const isTwoLegged = isKnockout && 
    (competition.key.includes("champs_league") || 
     competition.key.includes("europa") ||
     competition.key.includes("libertadores")) &&
    stage !== "final";
  
  // Detect rivalry
  const rivalry = detectRivalry(homeTeam, awayTeam);
  
  // Build significance array
  const significance: MatchSignificance[] = [];
  const significanceNotes: string[] = [];
  
  if (rivalry.isDerby) {
    significance.push("derby");
    significanceNotes.push(`${rivalry.name}`);
  } else if (rivalry.isRivalry) {
    significance.push("rivalry");
    significanceNotes.push(`${rivalry.name}`);
  }
  
  if (stage === "final") {
    significance.push("cup_final");
    significanceNotes.push(`${competition.shortName} Final`);
  } else if (isKnockout) {
    significance.push("elimination");
    significanceNotes.push("Winner advances, loser eliminated");
  }
  
  // League position significance (if standings provided)
  if (competition.format === "league" && homeStanding && awayStanding && totalTeams) {
    // Title race (top 2)
    if (homeStanding <= 2 || awayStanding <= 2) {
      significance.push("title_decider");
      significanceNotes.push("Title race implications");
    }
    // Top 4 race (CL spots)
    else if (homeStanding <= 5 || awayStanding <= 5) {
      significance.push("top_4_race");
      significanceNotes.push("Champions League qualification battle");
    }
    // Europa race (top 7)
    else if (homeStanding <= 7 || awayStanding <= 7) {
      significance.push("europa_race");
      significanceNotes.push("European qualification race");
    }
    // Relegation battle (bottom 3)
    if (homeStanding >= totalTeams - 2 || awayStanding >= totalTeams - 2) {
      significance.push("relegation_battle");
      significanceNotes.push("Relegation battle");
    }
  }
  
  if (significance.length === 0) {
    significance.push("regular");
  }
  
  return {
    competition: {
      key: competition.key,
      name: competition.name,
      shortName: competition.shortName,
      format: competition.format,
      country: competition.country
    },
    stage,
    stageName,
    isKnockout,
    isTwoLegged,
    significance,
    significanceNotes,
    isNeutralVenue: stage === "final", // Finals often at neutral venue
    extraTimeAllowed: isKnockout,
    awayGoalsRule: false, // UEFA removed this in 2021
    tieBreakers: competition.tieBreakers
  };
}

// ==========================================
// COMBAT SPORTS - Weight Classes & Definitions
// ==========================================

export type CombatSport = "mma" | "boxing";

export interface WeightClass {
  key: string;
  name: string;
  sport: CombatSport;
  upperLimit: number;  // in pounds
  lowerLimit?: number; // optional lower bound
  aliases: string[];
}

// UFC/MMA Weight Classes (in pounds)
export const MMA_WEIGHT_CLASSES: WeightClass[] = [
  { key: "strawweight", name: "Strawweight", sport: "mma", upperLimit: 115, aliases: ["straw", "115"] },
  { key: "flyweight", name: "Flyweight", sport: "mma", upperLimit: 125, aliases: ["fly", "125"] },
  { key: "bantamweight", name: "Bantamweight", sport: "mma", upperLimit: 135, aliases: ["bantam", "135"] },
  { key: "featherweight", name: "Featherweight", sport: "mma", upperLimit: 145, aliases: ["feather", "145"] },
  { key: "lightweight", name: "Lightweight", sport: "mma", upperLimit: 155, aliases: ["light", "155"] },
  { key: "welterweight", name: "Welterweight", sport: "mma", upperLimit: 170, aliases: ["welter", "170"] },
  { key: "middleweight", name: "Middleweight", sport: "mma", upperLimit: 185, aliases: ["middle", "185"] },
  { key: "light_heavyweight", name: "Light Heavyweight", sport: "mma", upperLimit: 205, aliases: ["lhw", "light heavy", "205"] },
  { key: "heavyweight", name: "Heavyweight", sport: "mma", upperLimit: 265, aliases: ["heavy", "hw", "265"] },
];

// Boxing Weight Classes (in pounds)
export const BOXING_WEIGHT_CLASSES: WeightClass[] = [
  { key: "minimumweight", name: "Minimumweight", sport: "boxing", upperLimit: 105, aliases: ["strawweight", "mini fly", "105"] },
  { key: "light_flyweight", name: "Light Flyweight", sport: "boxing", upperLimit: 108, aliases: ["junior flyweight", "108"] },
  { key: "flyweight", name: "Flyweight", sport: "boxing", upperLimit: 112, aliases: ["fly", "112"] },
  { key: "super_flyweight", name: "Super Flyweight", sport: "boxing", upperLimit: 115, aliases: ["junior bantamweight", "115"] },
  { key: "bantamweight", name: "Bantamweight", sport: "boxing", upperLimit: 118, aliases: ["bantam", "118"] },
  { key: "super_bantamweight", name: "Super Bantamweight", sport: "boxing", upperLimit: 122, aliases: ["junior featherweight", "122"] },
  { key: "featherweight", name: "Featherweight", sport: "boxing", upperLimit: 126, aliases: ["feather", "126"] },
  { key: "super_featherweight", name: "Super Featherweight", sport: "boxing", upperLimit: 130, aliases: ["junior lightweight", "130"] },
  { key: "lightweight", name: "Lightweight", sport: "boxing", upperLimit: 135, aliases: ["light", "135"] },
  { key: "super_lightweight", name: "Super Lightweight", sport: "boxing", upperLimit: 140, aliases: ["junior welterweight", "140"] },
  { key: "welterweight", name: "Welterweight", sport: "boxing", upperLimit: 147, aliases: ["welter", "147"] },
  { key: "super_welterweight", name: "Super Welterweight", sport: "boxing", upperLimit: 154, aliases: ["junior middleweight", "154"] },
  { key: "middleweight", name: "Middleweight", sport: "boxing", upperLimit: 160, aliases: ["middle", "160"] },
  { key: "super_middleweight", name: "Super Middleweight", sport: "boxing", upperLimit: 168, aliases: ["168"] },
  { key: "light_heavyweight", name: "Light Heavyweight", sport: "boxing", upperLimit: 175, aliases: ["lhw", "175"] },
  { key: "cruiserweight", name: "Cruiserweight", sport: "boxing", upperLimit: 200, aliases: ["cruiser", "200"] },
  { key: "heavyweight", name: "Heavyweight", sport: "boxing", upperLimit: 999, aliases: ["heavy", "hw", "unlimited"] },
];

// Fight card bout types
export type BoutType = 
  | "main_event"       // Headline fight
  | "co_main"          // Co-main event
  | "main_card"        // Main card fight
  | "prelim"           // Preliminary card
  | "early_prelim"     // Early prelims
  | "title_fight"      // Championship fight
  | "title_eliminator" // Number one contender fight
  | "catchweight";     // Non-standard weight

export interface FightBout {
  boutOrder: number;           // Position on card (1 = main event)
  boutType: BoutType;
  weightClass: string;
  weightLimit?: number;
  isTitleFight: boolean;
  titleType?: string;          // "UFC Lightweight Championship", "WBC Heavyweight Title"
  rounds: number;              // 3 or 5 for MMA, varies for boxing
  fighter1: {
    name: string;
    nickname?: string;
    record?: string;           // "23-5-0"
    country?: string;
    ranking?: number;          // UFC ranking in division
    isChampion?: boolean;
  };
  fighter2: {
    name: string;
    nickname?: string;
    record?: string;
    country?: string;
    ranking?: number;
    isChampion?: boolean;
  };
  result?: {
    winner?: string;
    method?: string;           // "KO/TKO", "Submission", "Decision", etc.
    round?: number;
    time?: string;             // "2:34"
  };
}

export interface FightCard {
  eventId: string | number;
  eventName: string;           // "UFC 300: Pereira vs Hill"
  promotion: string;           // "UFC", "Bellator", "PFL", "Boxing"
  date: string;
  venue?: string;
  location?: string;           // "Las Vegas, Nevada"
  broadcastInfo?: string;      // "ESPN+ PPV"
  status: "scheduled" | "live" | "completed" | "cancelled";
  mainEvent?: FightBout;
  bouts: FightBout[];
  totalBouts: number;
}

// Helper to find weight class by name or weight
export function findWeightClass(query: string, sport: CombatSport = "mma"): WeightClass | undefined {
  const classes = sport === "boxing" ? BOXING_WEIGHT_CLASSES : MMA_WEIGHT_CLASSES;
  const lower = query.toLowerCase().trim();
  
  // Try exact match first
  const exact = classes.find(wc => 
    wc.key === lower ||
    wc.name.toLowerCase() === lower ||
    wc.aliases.some(a => a === lower)
  );
  if (exact) return exact;
  
  // Try partial match
  return classes.find(wc =>
    wc.name.toLowerCase().includes(lower) ||
    lower.includes(wc.key) ||
    wc.aliases.some(a => lower.includes(a) || a.includes(lower))
  );
}

// Helper to get weight class from weight (pounds)
export function getWeightClassByWeight(weight: number, sport: CombatSport = "mma"): WeightClass | undefined {
  const classes = sport === "boxing" ? BOXING_WEIGHT_CLASSES : MMA_WEIGHT_CLASSES;
  // Find the smallest weight class that can accommodate this weight
  const sorted = [...classes].sort((a, b) => a.upperLimit - b.upperLimit);
  return sorted.find(wc => weight <= wc.upperLimit);
}

// Parse fight result method into standardized format
export function parseResultMethod(method: string): { category: string; detail: string } {
  const lower = method.toLowerCase();
  
  if (lower.includes("ko") || lower.includes("knockout") || lower.includes("tko")) {
    return { category: "KO/TKO", detail: method };
  }
  if (lower.includes("sub") || lower.includes("submission") || lower.includes("choke") || lower.includes("armbar")) {
    return { category: "Submission", detail: method };
  }
  if (lower.includes("dec") || lower.includes("decision")) {
    if (lower.includes("unanimous") || lower.includes("ud")) {
      return { category: "Decision", detail: "Unanimous Decision" };
    }
    if (lower.includes("split") || lower.includes("sd")) {
      return { category: "Decision", detail: "Split Decision" };
    }
    if (lower.includes("majority") || lower.includes("md")) {
      return { category: "Decision", detail: "Majority Decision" };
    }
    return { category: "Decision", detail: method };
  }
  if (lower.includes("draw")) {
    return { category: "Draw", detail: method };
  }
  if (lower.includes("nc") || lower.includes("no contest")) {
    return { category: "No Contest", detail: method };
  }
  if (lower.includes("dq") || lower.includes("disqualification")) {
    return { category: "DQ", detail: "Disqualification" };
  }
  
  return { category: "Other", detail: method };
}

// Format fighter record nicely
export function formatFighterRecord(wins: number, losses: number, draws: number = 0, noContests: number = 0): string {
  let record = `${wins}-${losses}`;
  if (draws > 0) record += `-${draws}`;
  if (noContests > 0) record += ` (${noContests} NC)`;
  return record;
}

// ==========================================
// TENNIS - Tours, Rankings, Tournaments
// ==========================================

export type TennisTour = "atp" | "wta" | "itf" | "grand_slam";
export type TennisSurface = "hard" | "clay" | "grass" | "carpet" | "indoor_hard";
export type TennisRoundName = 
  | "qualifying"
  | "first_round" | "second_round" | "third_round" | "fourth_round"
  | "round_of_128" | "round_of_64" | "round_of_32" | "round_of_16"
  | "quarter_finals" | "semi_finals" | "final";

export interface TennisTournament {
  key: string;
  name: string;
  shortName: string;
  tour: TennisTour;
  category: "grand_slam" | "masters_1000" | "atp_500" | "atp_250" | "wta_1000" | "wta_500" | "wta_250";
  surface: TennisSurface;
  location: string;
  country: string;
  prizeMoneyUSD?: number;
  rankingPoints: number;  // Winner points
  drawSize: number;       // Main draw size
  aliases: string[];
}

// Major tennis tournaments
export const TENNIS_TOURNAMENTS: TennisTournament[] = [
  // Grand Slams
  { key: "tennis_australian_open", name: "Australian Open", shortName: "AO", tour: "grand_slam", category: "grand_slam", surface: "hard", location: "Melbourne", country: "Australia", rankingPoints: 2000, drawSize: 128, aliases: ["aus open", "australian open", "melbourne"] },
  { key: "tennis_french_open", name: "French Open", shortName: "RG", tour: "grand_slam", category: "grand_slam", surface: "clay", location: "Paris", country: "France", rankingPoints: 2000, drawSize: 128, aliases: ["roland garros", "french open", "rg"] },
  { key: "tennis_wimbledon", name: "Wimbledon", shortName: "Wimbledon", tour: "grand_slam", category: "grand_slam", surface: "grass", location: "London", country: "UK", rankingPoints: 2000, drawSize: 128, aliases: ["wimbledon", "the championships"] },
  { key: "tennis_us_open", name: "US Open", shortName: "USO", tour: "grand_slam", category: "grand_slam", surface: "hard", location: "New York", country: "USA", rankingPoints: 2000, drawSize: 128, aliases: ["us open", "uso", "flushing meadows"] },
  
  // ATP Masters 1000
  { key: "tennis_indian_wells", name: "Indian Wells Masters", shortName: "IW", tour: "atp", category: "masters_1000", surface: "hard", location: "Indian Wells", country: "USA", rankingPoints: 1000, drawSize: 96, aliases: ["indian wells", "bnp paribas open"] },
  { key: "tennis_miami_open", name: "Miami Open", shortName: "Miami", tour: "atp", category: "masters_1000", surface: "hard", location: "Miami", country: "USA", rankingPoints: 1000, drawSize: 96, aliases: ["miami open", "miami masters"] },
  { key: "tennis_monte_carlo", name: "Monte-Carlo Masters", shortName: "MC", tour: "atp", category: "masters_1000", surface: "clay", location: "Monte Carlo", country: "Monaco", rankingPoints: 1000, drawSize: 56, aliases: ["monte carlo", "rolex masters"] },
  { key: "tennis_madrid_open", name: "Madrid Open", shortName: "Madrid", tour: "atp", category: "masters_1000", surface: "clay", location: "Madrid", country: "Spain", rankingPoints: 1000, drawSize: 56, aliases: ["madrid open", "mutua madrid"] },
  { key: "tennis_rome", name: "Italian Open", shortName: "Rome", tour: "atp", category: "masters_1000", surface: "clay", location: "Rome", country: "Italy", rankingPoints: 1000, drawSize: 56, aliases: ["rome masters", "italian open", "internazionali"] },
  { key: "tennis_canadian_open", name: "Canadian Open", shortName: "Canada", tour: "atp", category: "masters_1000", surface: "hard", location: "Toronto/Montreal", country: "Canada", rankingPoints: 1000, drawSize: 56, aliases: ["canadian open", "rogers cup"] },
  { key: "tennis_cincinnati", name: "Cincinnati Masters", shortName: "Cincy", tour: "atp", category: "masters_1000", surface: "hard", location: "Cincinnati", country: "USA", rankingPoints: 1000, drawSize: 56, aliases: ["cincinnati", "western & southern open"] },
  { key: "tennis_shanghai", name: "Shanghai Masters", shortName: "Shanghai", tour: "atp", category: "masters_1000", surface: "hard", location: "Shanghai", country: "China", rankingPoints: 1000, drawSize: 96, aliases: ["shanghai masters", "rolex shanghai"] },
  { key: "tennis_paris", name: "Paris Masters", shortName: "Paris", tour: "atp", category: "masters_1000", surface: "indoor_hard", location: "Paris", country: "France", rankingPoints: 1000, drawSize: 48, aliases: ["paris masters", "rolex paris masters"] },
];

export interface TennisPlayer {
  name: string;
  country: string;
  countryCode: string;
  ranking: number;
  points: number;
  age?: number;
  turnedPro?: number;
  careerTitles?: number;
  grandSlamTitles?: number;
  highestRanking?: number;
  currentStreak?: string;  // "W5" or "L2"
}

export interface TennisMatch {
  tournamentKey: string;
  tournamentName: string;
  round: TennisRoundName;
  roundDisplay: string;
  surface: TennisSurface;
  player1: TennisPlayer;
  player2: TennisPlayer;
  scheduledTime?: string;
  court?: string;
  status: "scheduled" | "live" | "completed" | "walkover" | "retired";
  score?: {
    sets: Array<{ p1: number; p2: number; tiebreak?: { p1: number; p2: number } }>;
    currentSet?: number;
    currentGame?: { p1: number; p2: number };
    serving?: 1 | 2;
  };
  winner?: string;
  matchDuration?: string;
}

export interface TennisDraw {
  tournamentKey: string;
  tournamentName: string;
  tour: TennisTour;
  surface: TennisSurface;
  drawSize: number;
  matches: TennisMatch[];
  quarterFinals?: TennisMatch[];
  semiFinals?: TennisMatch[];
  final?: TennisMatch;
}

// Helper to find tennis tournament
export function findTennisTournament(query: string): TennisTournament | undefined {
  const lower = query.toLowerCase().trim();
  return TENNIS_TOURNAMENTS.find(t =>
    t.key === lower ||
    t.name.toLowerCase().includes(lower) ||
    t.shortName.toLowerCase() === lower ||
    t.aliases.some(a => a.includes(lower) || lower.includes(a))
  );
}

// Convert round name to display string
export function formatTennisRound(round: TennisRoundName): string {
  const roundNames: Record<TennisRoundName, string> = {
    qualifying: "Qualifying",
    first_round: "1st Round",
    second_round: "2nd Round",
    third_round: "3rd Round",
    fourth_round: "4th Round",
    round_of_128: "R128",
    round_of_64: "R64",
    round_of_32: "R32",
    round_of_16: "R16",
    quarter_finals: "Quarter-finals",
    semi_finals: "Semi-finals",
    final: "Final",
  };
  return roundNames[round] || round;
}

// ==========================================
// GOLF - Tours, Rankings, Tournaments
// ==========================================

export type GolfTour = "pga" | "lpga" | "european" | "liv" | "champions";
export type GolfMajor = "masters" | "pga_championship" | "us_open" | "open_championship";

export interface GolfTournament {
  key: string;
  name: string;
  shortName: string;
  tour: GolfTour;
  isMajor: boolean;
  fedexCupPoints?: number;  // PGA Tour
  raceToDBPoints?: number;  // DP World Tour
  location: string;
  course: string;
  country: string;
  par: number;
  purseUSD?: number;
  aliases: string[];
}

// Major golf tournaments
export const GOLF_TOURNAMENTS: GolfTournament[] = [
  // Majors
  { key: "golf_masters", name: "The Masters", shortName: "Masters", tour: "pga", isMajor: true, fedexCupPoints: 600, location: "Augusta", course: "Augusta National", country: "USA", par: 72, purseUSD: 18000000, aliases: ["masters", "the masters", "augusta"] },
  { key: "golf_pga_championship", name: "PGA Championship", shortName: "PGA", tour: "pga", isMajor: true, fedexCupPoints: 600, location: "Varies", course: "Varies", country: "USA", par: 72, purseUSD: 17500000, aliases: ["pga championship", "pga"] },
  { key: "golf_us_open", name: "U.S. Open", shortName: "US Open", tour: "pga", isMajor: true, fedexCupPoints: 600, location: "Varies", course: "Varies", country: "USA", par: 70, purseUSD: 21500000, aliases: ["us open", "u.s. open", "usga"] },
  { key: "golf_open_championship", name: "The Open Championship", shortName: "The Open", tour: "pga", isMajor: true, fedexCupPoints: 600, location: "Varies", course: "Varies", country: "UK", par: 72, purseUSD: 17000000, aliases: ["the open", "british open", "open championship"] },
  
  // Signature PGA Events
  { key: "golf_players", name: "The Players Championship", shortName: "Players", tour: "pga", isMajor: false, fedexCupPoints: 600, location: "Ponte Vedra Beach", course: "TPC Sawgrass", country: "USA", par: 72, purseUSD: 25000000, aliases: ["players championship", "the players", "tpc sawgrass"] },
  { key: "golf_memorial", name: "Memorial Tournament", shortName: "Memorial", tour: "pga", isMajor: false, fedexCupPoints: 550, location: "Dublin, OH", course: "Muirfield Village", country: "USA", par: 72, purseUSD: 20000000, aliases: ["memorial", "memorial tournament", "muirfield"] },
  { key: "golf_genesis", name: "Genesis Invitational", shortName: "Genesis", tour: "pga", isMajor: false, fedexCupPoints: 550, location: "Pacific Palisades", course: "Riviera Country Club", country: "USA", par: 71, purseUSD: 20000000, aliases: ["genesis", "riviera"] },
  { key: "golf_arnold_palmer", name: "Arnold Palmer Invitational", shortName: "API", tour: "pga", isMajor: false, fedexCupPoints: 550, location: "Orlando", course: "Bay Hill", country: "USA", par: 72, purseUSD: 20000000, aliases: ["arnold palmer", "bay hill", "api"] },
  
  // Team Events
  { key: "golf_ryder_cup", name: "Ryder Cup", shortName: "Ryder Cup", tour: "pga", isMajor: false, location: "Varies", course: "Varies", country: "Alternates", par: 72, aliases: ["ryder cup"] },
  { key: "golf_presidents_cup", name: "Presidents Cup", shortName: "Presidents Cup", tour: "pga", isMajor: false, location: "Varies", course: "Varies", country: "Alternates", par: 72, aliases: ["presidents cup"] },
  
  // FedEx Cup Playoffs
  { key: "golf_tour_championship", name: "Tour Championship", shortName: "Tour Champ", tour: "pga", isMajor: false, fedexCupPoints: 2000, location: "Atlanta", course: "East Lake", country: "USA", par: 70, purseUSD: 100000000, aliases: ["tour championship", "east lake", "fedex cup final"] },
];

export interface GolfPlayer {
  name: string;
  country: string;
  countryCode: string;
  worldRanking: number;
  fedexCupRank?: number;
  fedexCupPoints?: number;
  earnings?: number;
  wins?: number;
  majorWins?: number;
  scoringAverage?: number;
  drivingDistance?: number;
  greensInReg?: number;
}

export interface GolfLeaderboardEntry {
  position: number | string;  // Can be "T5" for ties
  player: GolfPlayer;
  roundScores: number[];      // [-3, -2, 1, -4] relative to par
  totalScore: number;         // Relative to par (-8)
  thruHole?: number | "F";    // Current hole or "F" for finished
  today?: number;             // Today's score relative to par
  strokes?: number;           // Total strokes
  holesPlayed: number;
  isCut?: boolean;
  isWithdrawn?: boolean;
}

export interface GolfLeaderboard {
  tournamentKey: string;
  tournamentName: string;
  tour: GolfTour;
  round: 1 | 2 | 3 | 4;
  status: "not_started" | "round_1" | "round_2" | "round_3" | "round_4" | "final" | "playoff";
  cutLine?: number;           // Score to make cut
  coursePar: number;
  entries: GolfLeaderboardEntry[];
  weather?: {
    conditions: string;
    wind: string;
    temperature: number;
  };
}

// Helper to find golf tournament
export function findGolfTournament(query: string): GolfTournament | undefined {
  const lower = query.toLowerCase().trim();
  return GOLF_TOURNAMENTS.find(t =>
    t.key === lower ||
    t.name.toLowerCase().includes(lower) ||
    t.shortName.toLowerCase() === lower ||
    t.aliases.some(a => a.includes(lower) || lower.includes(a))
  );
}

// Format golf score relative to par
export function formatGolfScore(score: number): string {
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return score.toString();
}

// Format golf position with ties
export function formatGolfPosition(pos: number, isTied: boolean): string {
  if (isTied) return `T${pos}`;
  return pos.toString();
}

// ==========================================
// MOTORSPORTS - Series, Races, Standings
// ==========================================

export type MotorsportSeries = "f1" | "nascar_cup" | "nascar_xfinity" | "nascar_trucks" | "indycar" | "motogp" | "formula_e" | "wec";
export type RaceSessionType = "practice_1" | "practice_2" | "practice_3" | "qualifying" | "sprint_qualifying" | "sprint" | "race";

export interface MotorsportTrack {
  key: string;
  name: string;
  shortName: string;
  location: string;
  country: string;
  lengthKm: number;
  lengthMiles: number;
  laps: number;           // Race laps
  turns: number;
  trackType: "road" | "street" | "oval" | "tri_oval" | "mixed";
  lapRecord?: {
    time: string;
    driver: string;
    year: number;
  };
  aliases: string[];
}

export interface MotorsportDriver {
  name: string;
  number: number;
  team: string;
  country: string;
  countryCode: string;
  championshipPoints: number;
  championshipPosition: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps?: number;
  isRookie?: boolean;
}

export interface MotorsportTeam {
  name: string;
  shortName: string;
  country: string;
  drivers: string[];
  constructorPoints?: number;  // F1
  ownerPoints?: number;        // NASCAR
  championshipPosition: number;
  wins: number;
  engine?: string;             // F1 power unit supplier
  chassis?: string;            // Car model
}

export interface MotorsportRace {
  key: string;
  name: string;
  shortName: string;
  series: MotorsportSeries;
  round: number;
  season: number;
  track: MotorsportTrack;
  scheduledDate: string;
  status: "scheduled" | "practice" | "qualifying" | "sprint" | "racing" | "completed" | "postponed" | "cancelled";
  sessions: {
    type: RaceSessionType;
    scheduledTime: string;
    status: "scheduled" | "live" | "completed";
  }[];
  weather?: {
    conditions: string;
    temperature: number;
    trackTemperature?: number;
    rainChance?: number;
  };
}

export interface QualifyingResult {
  position: number;
  driver: MotorsportDriver;
  team: string;
  q1Time?: string;
  q2Time?: string;
  q3Time?: string;
  bestTime: string;
  gap?: string;          // Gap to pole
  laps: number;
  isKnockedOut?: boolean;
}

export interface RaceResult {
  position: number;
  driver: MotorsportDriver;
  team: string;
  lapsCompleted: number;
  timeOrGap: string;     // Race time or gap to leader
  gridPosition: number;
  positionsGained: number;
  points: number;
  fastestLap?: boolean;
  status: "finished" | "dnf" | "dsq" | "dns" | "retired";
  pitStops?: number;
  retirementReason?: string;
}

export interface MotorsportStandings {
  series: MotorsportSeries;
  season: number;
  asOf: string;
  driverStandings: {
    position: number;
    driver: string;
    team: string;
    points: number;
    wins: number;
    podiums: number;
    behindLeader: number;
    nationality: string;
  }[];
  constructorStandings?: {  // F1 only
    position: number;
    team: string;
    points: number;
    wins: number;
    behindLeader: number;
  }[];
  ownerStandings?: {        // NASCAR only
    position: number;
    owner: string;
    points: number;
  }[];
}

// Major motorsport tracks
export const MOTORSPORT_TRACKS: MotorsportTrack[] = [
  // F1 Tracks
  { key: "monaco", name: "Circuit de Monaco", shortName: "Monaco", location: "Monte Carlo", country: "Monaco", lengthKm: 3.337, lengthMiles: 2.074, laps: 78, turns: 19, trackType: "street", aliases: ["monaco", "monte carlo"] },
  { key: "monza", name: "Autodromo Nazionale Monza", shortName: "Monza", location: "Monza", country: "Italy", lengthKm: 5.793, lengthMiles: 3.600, laps: 53, turns: 11, trackType: "road", aliases: ["monza", "italian gp"] },
  { key: "silverstone", name: "Silverstone Circuit", shortName: "Silverstone", location: "Silverstone", country: "UK", lengthKm: 5.891, lengthMiles: 3.661, laps: 52, turns: 18, trackType: "road", aliases: ["silverstone", "british gp"] },
  { key: "spa", name: "Circuit de Spa-Francorchamps", shortName: "Spa", location: "Stavelot", country: "Belgium", lengthKm: 7.004, lengthMiles: 4.352, laps: 44, turns: 19, trackType: "road", aliases: ["spa", "belgian gp", "spa-francorchamps"] },
  { key: "suzuka", name: "Suzuka International Racing Course", shortName: "Suzuka", location: "Suzuka", country: "Japan", lengthKm: 5.807, lengthMiles: 3.608, laps: 53, turns: 18, trackType: "road", aliases: ["suzuka", "japanese gp"] },
  { key: "cota", name: "Circuit of the Americas", shortName: "COTA", location: "Austin", country: "USA", lengthKm: 5.513, lengthMiles: 3.426, laps: 56, turns: 20, trackType: "road", aliases: ["cota", "austin", "us gp"] },
  { key: "miami", name: "Miami International Autodrome", shortName: "Miami", location: "Miami Gardens", country: "USA", lengthKm: 5.412, lengthMiles: 3.363, laps: 57, turns: 19, trackType: "street", aliases: ["miami gp", "miami"] },
  { key: "las_vegas", name: "Las Vegas Street Circuit", shortName: "Las Vegas", location: "Las Vegas", country: "USA", lengthKm: 6.201, lengthMiles: 3.853, laps: 50, turns: 17, trackType: "street", aliases: ["las vegas gp", "vegas"] },
  
  // NASCAR Tracks
  { key: "daytona", name: "Daytona International Speedway", shortName: "Daytona", location: "Daytona Beach", country: "USA", lengthKm: 4.023, lengthMiles: 2.5, laps: 200, turns: 4, trackType: "tri_oval", aliases: ["daytona", "daytona 500"] },
  { key: "talladega", name: "Talladega Superspeedway", shortName: "Talladega", location: "Lincoln", country: "USA", lengthKm: 4.281, lengthMiles: 2.66, laps: 188, turns: 4, trackType: "tri_oval", aliases: ["talladega", "dega"] },
  { key: "charlotte", name: "Charlotte Motor Speedway", shortName: "Charlotte", location: "Concord", country: "USA", lengthKm: 2.414, lengthMiles: 1.5, laps: 400, turns: 4, trackType: "tri_oval", aliases: ["charlotte", "coca-cola 600"] },
  { key: "bristol", name: "Bristol Motor Speedway", shortName: "Bristol", location: "Bristol", country: "USA", lengthKm: 0.859, lengthMiles: 0.533, laps: 500, turns: 4, trackType: "oval", aliases: ["bristol", "thunder valley"] },
  { key: "martinsville", name: "Martinsville Speedway", shortName: "Martinsville", location: "Ridgeway", country: "USA", lengthKm: 0.847, lengthMiles: 0.526, laps: 500, turns: 4, trackType: "oval", aliases: ["martinsville"] },
  
  // IndyCar Tracks
  { key: "indianapolis", name: "Indianapolis Motor Speedway", shortName: "Indy", location: "Speedway", country: "USA", lengthKm: 4.023, lengthMiles: 2.5, laps: 200, turns: 4, trackType: "oval", aliases: ["indy", "indianapolis", "indy 500", "brickyard"] },
  { key: "long_beach", name: "Streets of Long Beach", shortName: "Long Beach", location: "Long Beach", country: "USA", lengthKm: 3.167, lengthMiles: 1.968, laps: 85, turns: 11, trackType: "street", aliases: ["long beach", "acura gp"] },
  { key: "st_pete", name: "Streets of St. Petersburg", shortName: "St. Pete", location: "St. Petersburg", country: "USA", lengthKm: 2.897, lengthMiles: 1.8, laps: 100, turns: 14, trackType: "street", aliases: ["st pete", "st. petersburg"] },
];

// Helper to find motorsport track
export function findMotorsportTrack(query: string): MotorsportTrack | undefined {
  const lower = query.toLowerCase().trim();
  return MOTORSPORT_TRACKS.find(t =>
    t.key === lower ||
    t.name.toLowerCase().includes(lower) ||
    t.shortName.toLowerCase() === lower ||
    t.aliases.some(a => a.includes(lower) || lower.includes(a))
  );
}

// Format lap time (mm:ss.xxx)
export function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return mins > 0 ? `${mins}:${secs.padStart(6, '0')}` : secs;
}

// Format gap to leader
export function formatGap(gap: number, isLaps: boolean = false): string {
  if (isLaps) return `+${gap} ${gap === 1 ? 'lap' : 'laps'}`;
  if (gap < 60) return `+${gap.toFixed(3)}s`;
  const mins = Math.floor(gap / 60);
  const secs = (gap % 60).toFixed(3);
  return `+${mins}:${secs.padStart(6, '0')}`;
}

// Get series display name
export function getSeriesName(series: MotorsportSeries): string {
  const names: Record<MotorsportSeries, string> = {
    f1: "Formula 1",
    nascar_cup: "NASCAR Cup Series",
    nascar_xfinity: "NASCAR Xfinity Series",
    nascar_trucks: "NASCAR Craftsman Truck Series",
    indycar: "NTT IndyCar Series",
    motogp: "MotoGP",
    formula_e: "Formula E",
    wec: "World Endurance Championship",
  };
  return names[series] || series.toUpperCase();
}

// Soccer-specific tie-breaker explanation
export function getTieBreakerExplanation(competition: SoccerCompetition): string {
  const explanations: Record<string, string> = {
    "goal_difference": "Goal Difference (GD)",
    "goals_scored": "Goals Scored (GF)",
    "h2h_points": "Head-to-Head Points",
    "h2h_gd": "Head-to-Head Goal Difference",
    "h2h_away_goals": "Head-to-Head Away Goals",
    "away_goals": "Away Goals Scored",
    "total_wins": "Total Wins",
    "fair_play": "Fair Play Points",
    "drawing_lots": "Drawing of Lots",
  };
  
  return competition.tieBreakers
    .map((tb, i) => `${i + 1}. ${explanations[tb] || tb}`)
    .join("\n");
}
