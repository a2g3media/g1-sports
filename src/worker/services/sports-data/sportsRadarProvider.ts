/**
 * SportsRadar Provider Implementation
 * Handles Golf and Player Props via SportsRadar APIs
 * 
 * API Products:
 * - Golf v3: Tournament schedules, leaderboards, player data
 * - Odds Comparison Live Odds v2: Player props across sports
 */

import {
  OddsProviderInterface,
  SportKey,
  DateRange,
  FetchGamesResult,
  FetchOddsResult,
  FetchPropsResult,
  NormalizedGame,
  NormalizedProp,
  GameStatus,
  PropType,
  ProviderCapabilities
} from './types';
import { formatDateInTimeZoneYMD } from '../dateUtils';

// ============================================
// CONFIGURATION
// ============================================

interface SportsRadarConfig {
  golfApiKey: string | null;
  propsApiKey: string | null;
  accessLevel: 'trial' | 'production';
  language: string;
}

// ============================================
// RATE LIMIT STATE (per-request, not queue-based)
// ============================================

// Note: Cloudflare Workers are stateless - module variables reset between requests
// So we use simple retry logic with exponential backoff, not persistent queues

// API Base URLs
const GOLF_API_BASE = 'https://api.sportradar.com/golf';
const ODDS_COMPARISON_BASE = 'https://api.sportradar.com/oddscomparison-liveodds';
const PLAYER_PROPS_BASE = 'https://api.sportradar.com/oddscomparison-player-props';

function buildPlayerPropsUrls(
  language: string,
  pathSuffix: string,
  preferredAccessLevel: 'trial' | 'production'
): string[] {
  // Player Props is provisioned on a specific environment; use the configured access level only.
  return [`${PLAYER_PROPS_BASE}/${preferredAccessLevel}/v2/${language}/${pathSuffix}`];
}

// Team Data API Base URLs (production access)
const TEAM_API_BASES: Record<string, { base: string; version: string }> = {
  'NBA': { base: 'https://api.sportradar.com/nba/production', version: 'v8' },
  'NFL': { base: 'https://api.sportradar.com/nfl/production', version: 'v7' },
  'MLB': { base: 'https://api.sportradar.com/mlb/production', version: 'v7' },
  'NHL': { base: 'https://api.sportradar.com/nhl/production', version: 'v7' },
  'NCAAB': { base: 'https://api.sportradar.com/ncaamb/production', version: 'v8' },
  'NCAAF': { base: 'https://api.sportradar.com/ncaafb/production', version: 'v7' },
};

// Soccer API Base URLs - try production first, fallback to trial
const SOCCER_API_BASES = [
  'https://api.sportradar.com/soccer/production/v4',
  'https://api.sportradar.com/soccer/trial/v4'
];

// ============================================
// SOCCER COMPETITION IDS (SportsRadar URNs)
// ============================================

export const SOCCER_COMPETITIONS: Record<string, { id: string; name: string; country: string; type: 'league' | 'cup' | 'international' }> = {
  // Top 5 European Leagues
  'premier-league': { id: 'sr:competition:17', name: 'Premier League', country: 'England', type: 'league' },
  'la-liga': { id: 'sr:competition:8', name: 'La Liga', country: 'Spain', type: 'league' },
  'serie-a': { id: 'sr:competition:23', name: 'Serie A', country: 'Italy', type: 'league' },
  'bundesliga': { id: 'sr:competition:35', name: 'Bundesliga', country: 'Germany', type: 'league' },
  'ligue-1': { id: 'sr:competition:34', name: 'Ligue 1', country: 'France', type: 'league' },
  
  // Other European Leagues
  'eredivisie': { id: 'sr:competition:37', name: 'Eredivisie', country: 'Netherlands', type: 'league' },
  'primeira-liga': { id: 'sr:competition:238', name: 'Primeira Liga', country: 'Portugal', type: 'league' },
  'scottish-premiership': { id: 'sr:competition:36', name: 'Scottish Premiership', country: 'Scotland', type: 'league' },
  'belgian-pro-league': { id: 'sr:competition:38', name: 'Belgian Pro League', country: 'Belgium', type: 'league' },
  'super-lig': { id: 'sr:competition:52', name: 'Süper Lig', country: 'Turkey', type: 'league' },
  
  // Americas
  'mls': { id: 'sr:competition:242', name: 'MLS', country: 'USA', type: 'league' },
  'liga-mx': { id: 'sr:competition:352', name: 'Liga MX', country: 'Mexico', type: 'league' },
  'brasileirao': { id: 'sr:competition:325', name: 'Brasileirão Série A', country: 'Brazil', type: 'league' },
  'argentina-primera': { id: 'sr:competition:155', name: 'Liga Profesional', country: 'Argentina', type: 'league' },
  
  // UEFA Club Competitions
  'champions-league': { id: 'sr:competition:7', name: 'UEFA Champions League', country: 'Europe', type: 'cup' },
  'europa-league': { id: 'sr:competition:679', name: 'UEFA Europa League', country: 'Europe', type: 'cup' },
  'conference-league': { id: 'sr:competition:17015', name: 'UEFA Conference League', country: 'Europe', type: 'cup' },
  
  // South American Club
  'copa-libertadores': { id: 'sr:competition:384', name: 'Copa Libertadores', country: 'South America', type: 'cup' },
  'copa-sudamericana': { id: 'sr:competition:480', name: 'Copa Sudamericana', country: 'South America', type: 'cup' },
  
  // CONCACAF Club
  'concacaf-champions-cup': { id: 'sr:competition:385', name: 'CONCACAF Champions Cup', country: 'North America', type: 'cup' },
  
  // Domestic Cups
  'fa-cup': { id: 'sr:competition:24', name: 'FA Cup', country: 'England', type: 'cup' },
  'efl-cup': { id: 'sr:competition:21', name: 'EFL Cup', country: 'England', type: 'cup' },
  'copa-del-rey': { id: 'sr:competition:329', name: 'Copa del Rey', country: 'Spain', type: 'cup' },
  'coppa-italia': { id: 'sr:competition:328', name: 'Coppa Italia', country: 'Italy', type: 'cup' },
  'dfb-pokal': { id: 'sr:competition:211', name: 'DFB-Pokal', country: 'Germany', type: 'cup' },
  'coupe-de-france': { id: 'sr:competition:330', name: 'Coupe de France', country: 'France', type: 'cup' },
  'us-open-cup': { id: 'sr:competition:379', name: 'US Open Cup', country: 'USA', type: 'cup' },
  
  // International Tournaments
  'world-cup': { id: 'sr:competition:16', name: 'FIFA World Cup', country: 'International', type: 'international' },
  'world-cup-qualifiers-europe': { id: 'sr:competition:28', name: 'World Cup Qualifiers - Europe', country: 'Europe', type: 'international' },
  'world-cup-qualifiers-conmebol': { id: 'sr:competition:27', name: 'World Cup Qualifiers - CONMEBOL', country: 'South America', type: 'international' },
  'world-cup-qualifiers-concacaf': { id: 'sr:competition:29', name: 'World Cup Qualifiers - CONCACAF', country: 'North America', type: 'international' },
  'euros': { id: 'sr:competition:1', name: 'UEFA European Championship', country: 'Europe', type: 'international' },
  'copa-america': { id: 'sr:competition:133', name: 'Copa América', country: 'South America', type: 'international' },
  'gold-cup': { id: 'sr:competition:140', name: 'CONCACAF Gold Cup', country: 'North America', type: 'international' },
  'nations-league-uefa': { id: 'sr:competition:18657', name: 'UEFA Nations League', country: 'Europe', type: 'international' },
  'nations-league-concacaf': { id: 'sr:competition:20925', name: 'CONCACAF Nations League', country: 'North America', type: 'international' },
  'africa-cup': { id: 'sr:competition:270', name: 'Africa Cup of Nations', country: 'Africa', type: 'international' },
  'asian-cup': { id: 'sr:competition:264', name: 'AFC Asian Cup', country: 'Asia', type: 'international' },
  'club-world-cup': { id: 'sr:competition:381', name: 'FIFA Club World Cup', country: 'International', type: 'cup' },
};

// Competition IDs for SportsRadar Player Props API
// Competition IDs for Odds Comparison products (player-props, prematch, liveodds).
// These differ from the Sports Data API competition IDs.
// Verified against live odds API 2026-03-20.
const COMPETITION_IDS: Record<string, string[]> = {
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

// ============================================
// SEASON ID CACHE (fetched dynamically from API)
// No hardcoded IDs - always fetch current season from SportsRadar
// ============================================

// Season cache TTL: 24 hours (seasons don't change frequently)
const SEASON_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// In-memory seasons cache (per-request lifecycle, but also uses api_cache table)
const seasonsCache: Map<string, { seasonId: string; fetchedAt: number }> = new Map();

// ============================================
// PROVIDER HEALTH TRACKING
// ============================================

export interface SportsRadarHealth {
  golfApiConfigured: boolean;
  propsApiConfigured: boolean;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  lastSuccessfulCall: string | null;
  lastError: string | null;
  lastErrorTime: string | null;
}

let providerHealth: SportsRadarHealth = {
  golfApiConfigured: false,
  propsApiConfigured: false,
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  lastSuccessfulCall: null,
  lastError: null,
  lastErrorTime: null
};

export function getSportsRadarHealth(): SportsRadarHealth {
  return { ...providerHealth };
}

// ============================================
// PROP TYPE MAPPING
// ============================================

// Map SportsRadar market names to our normalized PropType
// Normalized format: lowercase with non-alphanumeric replaced by underscores
const PROP_TYPE_MAP: Record<string, PropType> = {
  // SportsRadar exact formats (with "incl. overtime" suffix)
  'total_points__incl__overtime_': 'POINTS',
  'total_rebounds__incl__overtime_': 'REBOUNDS',
  'total_assists__incl__overtime_': 'ASSISTS',
  'total_steals__incl__overtime_': 'STEALS',
  'total_blocks__incl__overtime_': 'BLOCKS',
  'total_3_point_field_goals__incl__overtime_': 'THREES',
  'total_turnovers__incl__overtime_': 'TURNOVERS',
  'total_points_rebounds_assists__incl__overtime_': 'PRA',
  'total_points_rebounds__incl__overtime_': 'PR',
  'total_points_assists__incl__overtime_': 'PA',
  'total_rebounds_assists__incl__overtime_': 'RA',
  'total_steals_blocks__incl__overtime_': 'SB',
  'double_double__incl__overtime_': 'DOUBLE_DOUBLE',
  'triple_double__incl__overtime_': 'TRIPLE_DOUBLE',
  
  // SportsRadar "extra overtime" formats (NHL and some NBA games)
  'total_points__incl__extra_overtime_': 'POINTS',
  'total_assists__incl__extra_overtime_': 'ASSISTS',
  'total_rebounds__incl__extra_overtime_': 'REBOUNDS',
  'total_steals__incl__extra_overtime_': 'STEALS',
  'total_blocks__incl__extra_overtime_': 'BLOCKS',
  'total_shots__incl__extra_overtime_': 'SHOTS',
  'total_saves__incl__extra_overtime_': 'SAVES',
  'total_power_play_points__incl__extra_overtime_': 'POINTS_NHL',
  'total_points_plus_rebounds__incl__extra_overtime_': 'PR',
  'total_points_plus_assists__incl__extra_overtime_': 'PA',
  'total_rebounds_plus_assists__incl__extra_overtime_': 'RA',
  'total_points_plus_assists_plus_rebounds__incl__extra_overtime_': 'PRA',
  
  // Basketball - various SportsRadar formats
  'points': 'POINTS',
  'points_total_': 'POINTS',
  'player_points': 'POINTS',
  'total_points': 'POINTS',
  'points_scored': 'POINTS',
  
  'rebounds': 'REBOUNDS',
  'rebounds_total_': 'REBOUNDS',
  'player_rebounds': 'REBOUNDS',
  'total_rebounds': 'REBOUNDS',
  
  'assists': 'ASSISTS',
  'assists_total_': 'ASSISTS',
  'player_assists': 'ASSISTS',
  'total_assists': 'ASSISTS',
  
  'steals': 'STEALS',
  'player_steals': 'STEALS',
  
  'blocks': 'BLOCKS',
  'player_blocks': 'BLOCKS',
  'blocked_shots': 'BLOCKS',
  
  'three_point_field_goals_made': 'THREES',
  '3pt_made': 'THREES',
  '3_point_field_goals_made': 'THREES',
  '3_pointers_made': 'THREES',
  'threes_made': 'THREES',
  'three_pointers': 'THREES',
  'made_threes': 'THREES',
  
  // Basketball combos
  'pts_reb_ast': 'PRA',
  'pts___reb___ast': 'PRA',
  'points_rebounds_assists': 'PRA',
  'points___rebounds___assists': 'PRA',
  'pts_reb': 'PR',
  'pts___reb': 'PR',
  'points_rebounds': 'PR',
  'points___rebounds': 'PR',
  'pts_ast': 'PA',
  'pts___ast': 'PA',
  'points_assists': 'PA',
  'points___assists': 'PA',
  'reb_ast': 'RA',
  'reb___ast': 'RA',
  'rebounds_assists': 'RA',
  'rebounds___assists': 'RA',
  'double_double': 'PRA', // Map to combo stat
  'triple_double': 'PRA',
  
  // Football
  'passing_yards': 'PASSING_YARDS',
  'pass_yards': 'PASSING_YARDS',
  'player_passing_yards': 'PASSING_YARDS',
  'passing_touchdowns': 'PASSING_TDS',
  'pass_tds': 'PASSING_TDS',
  'player_passing_touchdowns': 'PASSING_TDS',
  'rushing_yards': 'RUSHING_YARDS',
  'rush_yards': 'RUSHING_YARDS',
  'player_rushing_yards': 'RUSHING_YARDS',
  'receiving_yards': 'RECEIVING_YARDS',
  'rec_yards': 'RECEIVING_YARDS',
  'player_receiving_yards': 'RECEIVING_YARDS',
  'receptions': 'RECEPTIONS',
  'catches': 'RECEPTIONS',
  'player_receptions': 'RECEPTIONS',
  'interceptions': 'INTERCEPTIONS',
  'player_interceptions': 'INTERCEPTIONS',
  'rushing_touchdowns': 'RUSHING_TDS',
  'rush_tds': 'RUSHING_TDS',
  'receiving_touchdowns': 'RECEIVING_TDS',
  'rec_tds': 'RECEIVING_TDS',
  'anytime_touchdown_scorer': 'RUSHING_TDS',
  
  // Baseball
  'hits': 'HITS',
  'player_hits': 'HITS',
  'total_bases': 'TOTAL_BASES',
  'player_total_bases': 'TOTAL_BASES',
  'runs': 'RUNS',
  'runs_scored': 'RUNS',
  'player_runs': 'RUNS',
  'rbis': 'RBIS',
  'runs_batted_in': 'RBIS',
  'player_rbis': 'RBIS',
  'strikeouts': 'STRIKEOUTS',
  'strikeouts_pitched': 'STRIKEOUTS',
  'pitcher_strikeouts': 'STRIKEOUTS',
  'player_strikeouts': 'STRIKEOUTS',
  'home_runs': 'HOME_RUNS',
  'player_home_runs': 'HOME_RUNS',
  'to_hit_a_home_run': 'HOME_RUNS',
  'stolen_bases': 'STOLEN_BASES',
  'player_stolen_bases': 'STOLEN_BASES',
  'walks': 'WALKS',
  'bases_on_balls': 'WALKS',
  'hits_runs_rbis': 'HITS', // Combined to primary
  
  // Hockey
  'goals': 'GOALS',
  'player_goals': 'GOALS',
  'goals_scored': 'GOALS',
  'shots': 'SHOTS',
  'shots_on_goal': 'SHOTS',
  'player_shots': 'SHOTS',
  'saves': 'SAVES',
  'goalie_saves': 'SAVES',
  'player_saves': 'SAVES',
  'points_nhl': 'POINTS_NHL',
  'hockey_points': 'POINTS_NHL',
  'goals_assists': 'POINTS_NHL',
  
  // Generic fallbacks
  'over': 'OTHER',
  'under': 'OTHER',
};

// Track unknown market names for debugging
const unknownMarkets = new Set<string>();

function mapPropType(marketName: string): PropType {
  const normalized = marketName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const mapped = PROP_TYPE_MAP[normalized];
  
  if (!mapped && normalized && normalized !== 'over' && normalized !== 'under') {
    // Log unknown market names for future mapping
    if (!unknownMarkets.has(normalized)) {
      unknownMarkets.add(normalized);
      console.log(`[SportsRadar] Unknown market type: "${marketName}" -> normalized: "${normalized}"`);
    }
  }
  
  return mapped || 'OTHER';
}

export function getUnknownMarkets(): string[] {
  return Array.from(unknownMarkets);
}

// ============================================
// STATUS MAPPING
// ============================================

function normalizeStatus(srStatus: string | null | undefined): GameStatus {
  if (!srStatus) return 'SCHEDULED';
  
  const status = srStatus.toLowerCase();
  
  if (status.includes('live') || status.includes('inprogress') || status === 'in_progress') {
    return 'LIVE';
  }
  if (status.includes('closed') || status.includes('complete') || status === 'final') {
    return 'FINAL';
  }
  if (status.includes('postponed') || status.includes('delayed')) {
    return 'POSTPONED';
  }
  if (status.includes('cancelled') || status.includes('canceled')) {
    return 'CANCELED';
  }
  
  return 'SCHEDULED';
}

// ============================================
// SPORTSRADAR PROVIDER CLASS
// ============================================

export class SportsRadarProvider implements OddsProviderInterface {
  readonly name = 'SportsRadar';
  
  private config: SportsRadarConfig;
  
  constructor(golfApiKey: string | null, propsApiKey: string | null) {
    this.config = {
      golfApiKey,
      propsApiKey,
      accessLevel: 'production', // Customer has production access
      language: 'en'
    };
    
    providerHealth.golfApiConfigured = !!golfApiKey;
    providerHealth.propsApiConfigured = !!propsApiKey;
    
    console.log(`[SportsRadar] Initialized - Golf: ${!!golfApiKey}, Props: ${!!propsApiKey}`);
  }
  
  // ============================================
  // CORE INTERFACE METHODS
  // ============================================
  
  async fetchGames(sport: SportKey, dateRange: DateRange): Promise<FetchGamesResult> {
    if (sport === 'GOLF') {
      return this.fetchGolfTournaments(dateRange);
    }
    
    // For other sports, this provider does not fetch game schedules directly.
    // SportsRadar is currently used here for Golf + Props workflows.
    return { games: [], rawCount: 0, errors: [] };
  }
  
  async fetchOdds(sport: SportKey, _dateRange: DateRange): Promise<FetchOddsResult> {
    // SportsRadar odds API is used for props workflows in this implementation.
    // Regular game odds are handled elsewhere in the provider chain.
    console.log(`[SportsRadar] fetchOdds called for ${sport} - delegated to provider chain`);
    return { odds: [], rawCount: 0, errors: [] };
  }
  
  async fetchProps(sport: SportKey, dateRange: DateRange): Promise<FetchPropsResult> {
    if (!this.config.propsApiKey) {
      return { 
        props: [], 
        rawCount: 0, 
        errors: ['SportsRadar props API key not configured'] 
      };
    }
    
    return this.fetchPlayerProps(sport, dateRange);
  }
  
  async isInSeason(sport: SportKey): Promise<boolean> {
    // Golf is always "in season" (tournaments year-round)
    if (sport === 'GOLF') return true;
    
    // For other sports, in-season checks are handled via provider chain.
    return true;
  }
  
  getCapabilities(): ProviderCapabilities {
    return {
      hasGames: true, // Golf only
      hasOdds: false, // Odds handling lives in other provider services
      hasProps: !!this.config.propsApiKey,
      hasPropsPregame: !!this.config.propsApiKey,
      hasPropsInPlay: false, // Not using live props
      hasPropMovement: false, // Movement tracked via history
      propMovementLookbackDays: 0,
      hasAlternateLines: false,
      hasFutures: false,
      hasDerivatives: false,
      hasLiveInGameLines: true, // SportsRadar has live odds
      liveLineLatencyMs: 1000, // SportsRadar is fast
      supportedSports: ['GOLF'], // Primary support
      hasPlayerImages: false,
      hasTeamLogos: false,
      mediaLicenseConfirmed: false
    };
  }
  
  // ============================================
  // GOLF TOURNAMENT METHODS
  // ============================================
  
  /**
   * Fetch Golf tournaments from SportsRadar Golf API v3
   * Endpoint: /golf/{access_level}/v3/{language_code}/schedules/{year}/tournaments/schedule.json
   */
  private async fetchGolfTournaments(dateRange: DateRange): Promise<FetchGamesResult> {
    const errors: string[] = [];
    const games: NormalizedGame[] = [];
    let totalRawCount = 0;
    
    if (!this.config.golfApiKey) {
      return { 
        games, 
        rawCount: 0, 
        errors: ['SportsRadar Golf API key not configured'] 
      };
    }
    
    try {
      const year = dateRange.start.getFullYear();
      
      // Try PGA Tour schedule
      // URL format: /golf/{access_level}/{tour}/v3/{language}/{year}/tournaments/schedule.json
      const url = `${GOLF_API_BASE}/${this.config.accessLevel}/pga/v3/${this.config.language}/${year}/tournaments/schedule.json?api_key=${this.config.golfApiKey}`;
      
      console.log(`[SportsRadar] Fetching Golf tournaments for PGA ${year}`);
      
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const errorMsg = `Golf API: HTTP ${response.status}`;
        errors.push(errorMsg);
        console.log(`[SportsRadar] Golf fetch failed: ${errorMsg}`);
        
        // Log for debugging
        providerHealth.lastError = errorMsg;
        providerHealth.lastErrorTime = new Date().toISOString();
        providerHealth.failedCalls++;
        
        return { games, rawCount: 0, errors };
      }
      
      const data = await response.json() as any;
      const tournaments = data.tournaments || [];
      totalRawCount = tournaments.length;
      
      console.log(`[SportsRadar] Got ${tournaments.length} Golf tournaments`);
      
      for (const tournament of tournaments) {
        try {
          const startDate = tournament.start_date ? new Date(tournament.start_date) : null;
          const endDate = tournament.end_date ? new Date(tournament.end_date) : null;
          
          // Filter to date range
          if (!startDate || startDate > dateRange.end) continue;
          if (endDate && endDate < dateRange.start) continue;
          
          games.push({
            providerGameId: `sr_golf_${tournament.id}`,
            sport: 'GOLF',
            league: 'PGA',
            homeTeam: 'PGA',
            awayTeam: 'PGA',
            homeTeamName: tournament.name || 'PGA Tournament',
            awayTeamName: null,
            startTime: startDate,
            status: normalizeStatus(tournament.status),
            scoreHome: null,
            scoreAway: null,
            period: null,
            clock: null,
            venue: tournament.venue?.name || tournament.course?.name || null,
            channel: tournament.coverage || null
          });
        } catch (err) {
          errors.push(`Error normalizing tournament ${tournament.id}: ${err}`);
        }
      }
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      console.log(`[SportsRadar] Total Golf tournaments in range: ${games.length}`);
      return { games, rawCount: totalRawCount, errors };
      
    } catch (err) {
      const errorMsg = `Golf Exception: ${err}`;
      errors.push(errorMsg);
      providerHealth.lastError = errorMsg;
      providerHealth.lastErrorTime = new Date().toISOString();
      providerHealth.failedCalls++;
      
      return { games, rawCount: 0, errors };
    }
  }
  
  /**
   * Fetch Golf leaderboard for a specific tournament
   * Endpoint: /golf/{access_level}/v3/{language_code}/tournaments/{tournament_id}/leaderboard.json
   */
  async fetchGolfLeaderboard(tournamentId: string): Promise<{
    tournament: any;
    leaderboard: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    if (!this.config.golfApiKey) {
      return { 
        tournament: null, 
        leaderboard: [], 
        errors: ['SportsRadar Golf API key not configured'] 
      };
    }
    
    try {
      // Extract the raw tournament ID (remove sr_golf_ prefix if present)
      const rawId = tournamentId.replace('sr_golf_', '');
      
      // URL format: /golf/{access_level}/{tour}/v3/{language}/{season_year}/tournaments/{tournament_id}/leaderboard.json
      const currentYear = new Date().getFullYear();
      const url = `${GOLF_API_BASE}/${this.config.accessLevel}/pga/v3/${this.config.language}/${currentYear}/tournaments/${rawId}/leaderboard.json?api_key=${this.config.golfApiKey}`;
      
      console.log(`[SportsRadar] Fetching Golf leaderboard for ${rawId}`);
      
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const errorMsg = `Golf Leaderboard: HTTP ${response.status}`;
        errors.push(errorMsg);
        return { tournament: null, leaderboard: [], errors };
      }
      
      const data = await response.json() as any;
      
      return {
        tournament: {
          id: data.id,
          name: data.name,
          status: data.status,
          start_date: data.start_date,
          end_date: data.end_date,
          venue: data.venue,
          course: data.course,
          purse: data.purse,
          winning_share: data.winning_share,
          currency: data.currency,
          points_label: data.points_label
        },
        leaderboard: data.leaderboard || [],
        errors
      };
      
    } catch (err) {
      errors.push(`Leaderboard Exception: ${err}`);
      return { tournament: null, leaderboard: [], errors };
    }
  }
  
  // ============================================
  // SOCCER API METHODS
  // ============================================

  /**
   * Fetch competition seasons to get current season ID
   * Soccer v4 API requires season-based endpoints for standings
   */
  async fetchSoccerSeasons(competitionId: string, apiKey: string): Promise<{
    seasons: any[];
    currentSeasonId: string | null;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    // Check in-memory cache (24 hour TTL - seasons don't change often)
    const cached = seasonsCache.get(competitionId);
    if (cached && Date.now() - cached.fetchedAt < SEASON_CACHE_TTL_MS) {
      console.log(`[SportsRadar] Using cached season ID for ${competitionId}: ${cached.seasonId}`);
      return { seasons: [], currentSeasonId: cached.seasonId, errors: [] };
    }
    
    try {
      let response: Response | null = null;
      
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/competitions/${competitionId}/seasons.json?api_key=${apiKey}`;
        console.log(`[SportsRadar] Fetching seasons for: ${competitionId}`);
        
        response = await this.fetchWithRetry(url);
        if (response.ok) break;
      }
      
      if (!response || !response.ok) {
        errors.push(`Failed to fetch seasons: HTTP ${response?.status || 0}`);
        return { seasons: [], currentSeasonId: null, errors };
      }
      
      const data = await response.json() as any;
      const seasons = data.seasons || [];
      
      console.log(`[SportsRadar] Found ${seasons.length} seasons for ${competitionId}`);
      
      // Find the current active season
      const now = new Date();
      const currentYear = now.getFullYear();
      
      // Strategy 1: Find season where we're between start and end dates
      let currentSeason = seasons.find((s: any) => {
        const start = new Date(s.start_date);
        const end = new Date(s.end_date);
        return start <= now && end >= now;
      });
      
      // Strategy 2: Find most recent season that has started (for leagues that just started)
      if (!currentSeason) {
        const startedSeasons = seasons
          .filter((s: any) => new Date(s.start_date) <= now)
          .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
        currentSeason = startedSeasons[0];
      }
      
      // Strategy 3: Find season matching current year pattern (e.g., "2025-26" or "2026")
      if (!currentSeason) {
        const yearPattern = `${currentYear}`;
        const prevYearPattern = `${currentYear - 1}`;
        currentSeason = seasons.find((s: any) => {
          const name = (s.name || s.year || '').toString();
          return name.includes(yearPattern) || name.includes(`${prevYearPattern}/${yearPattern.slice(2)}`);
        });
      }
      
      // Strategy 4: Fallback to first season in list (usually most recent)
      if (!currentSeason && seasons.length > 0) {
        currentSeason = seasons[0];
      }
      
      if (currentSeason?.id) {
        console.log(`[SportsRadar] Selected season: ${currentSeason.name || currentSeason.id} for ${competitionId}`);
        seasonsCache.set(competitionId, { seasonId: currentSeason.id, fetchedAt: Date.now() });
      }
      
      return {
        seasons,
        currentSeasonId: currentSeason?.id || null,
        errors
      };
      
    } catch (err) {
      errors.push(`Seasons Exception: ${err}`);
      return { seasons: [], currentSeasonId: null, errors };
    }
  }

  /**
   * Fetch Soccer standings/league table
   * Soccer v4 API: First get season ID, then fetch /seasons/{season_id}/standings.json
   */
  async fetchSoccerStandings(competitionKey: string, apiKey: string): Promise<{
    competition: any;
    season: any;
    standings: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const competition = SOCCER_COMPETITIONS[competitionKey];
    if (!competition) {
      return { competition: null, season: null, standings: [], errors: [`Unknown competition: ${competitionKey}`] };
    }
    
    try {
      // Step 1: Get current season ID
      const seasonsResult = await this.fetchSoccerSeasons(competition.id, apiKey);
      if (seasonsResult.errors.length > 0) {
        errors.push(...seasonsResult.errors);
      }
      
      const seasonId = seasonsResult.currentSeasonId;
      if (!seasonId) {
        errors.push('No current season found for competition');
        return { competition: null, season: null, standings: [], errors };
      }
      
      console.log(`[SportsRadar] Using season: ${seasonId} for ${competition.name}`);
      
      // Step 2: Fetch standings using season ID
      let response: Response | null = null;
      let lastStatus = 0;
      
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/seasons/${seasonId}/standings.json?api_key=${apiKey}`;
        
        console.log(`[SportsRadar] Fetching Soccer standings: ${baseUrl}`);
        
        response = await this.fetchWithRetry(url);
        lastStatus = response.status;
        
        if (response.ok) {
          console.log(`[SportsRadar] Soccer standings working with: ${baseUrl}`);
          break;
        }
        
        console.log(`[SportsRadar] Soccer standings ${baseUrl} returned ${response.status}`);
      }
      
      if (!response || !response.ok) {
        const errorMsg = `Soccer Standings API: HTTP ${lastStatus} - API may not be available for your subscription`;
        errors.push(errorMsg);
        providerHealth.lastError = errorMsg;
        providerHealth.lastErrorTime = new Date().toISOString();
        return { competition: null, season: null, standings: [], errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      // Parse standings - structure varies by competition type
      const standings: any[] = [];
      const standingsData = data.standings || [];
      
      for (const group of standingsData) {
        const groupName = group.name || group.group?.name || 'League';
        const groupType = group.type || 'total'; // total, home, away
        
        // Only include 'total' standings by default
        if (groupType !== 'total') continue;
        
        const teams = group.groups?.[0]?.standings || group.standings || [];
        
        for (const team of teams) {
          standings.push({
            rank: team.rank || team.position,
            teamId: team.competitor?.id,
            teamName: team.competitor?.name,
            teamAbbreviation: team.competitor?.abbreviation,
            teamCountry: team.competitor?.country,
            played: team.played || team.matches_played || 0,
            wins: team.win || team.wins || 0,
            draws: team.draw || team.draws || 0,
            losses: team.loss || team.losses || 0,
            goalsFor: team.goals_for || team.scored || 0,
            goalsAgainst: team.goals_against || team.conceded || 0,
            goalDifference: team.goal_diff || (team.goals_for - team.goals_against) || 0,
            points: team.points || 0,
            form: team.form || null, // Recent form (W-D-L-W-W)
            groupName,
            // Qualification status
            currentOutcome: team.current_outcome || null,
            // Additional stats
            homeRecord: team.home ? `${team.home.win}-${team.home.draw}-${team.home.loss}` : null,
            awayRecord: team.away ? `${team.away.win}-${team.away.draw}-${team.away.loss}` : null
          });
        }
      }
      
      return {
        competition: {
          id: data.competition?.id || competition.id,
          name: data.competition?.name || competition.name,
          country: competition.country,
          type: competition.type
        },
        season: data.season ? {
          id: data.season.id,
          name: data.season.name,
          startDate: data.season.start_date,
          endDate: data.season.end_date,
          year: data.season.year
        } : null,
        standings,
        errors
      };
      
    } catch (err) {
      errors.push(`Soccer Standings Exception: ${err}`);
      providerHealth.lastError = String(err);
      providerHealth.lastErrorTime = new Date().toISOString();
      return { competition: null, season: null, standings: [], errors };
    }
  }

  /**
   * Fetch Soccer top scorers and assists leaders
   * Soccer v4 API: Uses /seasons/{season_id}/leaders.json
   */
  async fetchSoccerLeaders(competitionKey: string, apiKey: string): Promise<{
    competition: any;
    season: any;
    topScorers: any[];
    topAssists: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const competition = SOCCER_COMPETITIONS[competitionKey];
    if (!competition) {
      return { competition: null, season: null, topScorers: [], topAssists: [], errors: [`Unknown competition: ${competitionKey}`] };
    }
    
    try {
      // Step 1: Get current season ID
      const seasonsResult = await this.fetchSoccerSeasons(competition.id, apiKey);
      if (seasonsResult.errors.length > 0) {
        errors.push(...seasonsResult.errors);
      }
      
      const seasonId = seasonsResult.currentSeasonId;
      if (!seasonId) {
        errors.push('No current season found for competition');
        return { competition: null, season: null, topScorers: [], topAssists: [], errors };
      }
      
      // Step 2: Fetch leaders using season ID
      let response: Response | null = null;
      let lastStatus = 0;
      
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/seasons/${seasonId}/leaders.json?api_key=${apiKey}`;
        
        console.log(`[SportsRadar] Trying Soccer leaders: ${baseUrl} for ${competition.name}`);
        
        response = await this.fetchWithRetry(url);
        lastStatus = response.status;
        
        if (response.ok) break;
      }
      
      if (!response || !response.ok) {
        const errorMsg = `Soccer Leaders API: HTTP ${lastStatus}`;
        errors.push(errorMsg);
        return { competition: null, season: null, topScorers: [], topAssists: [], errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      const topScorers: any[] = [];
      const topAssists: any[] = [];
      
      // Parse leaders - SportsRadar Soccer v4 structure:
      // lists[].type + leaders[].rank + leaders[].players[].{id,name,competitors[].{id,name,abbreviation,datapoints[]}}
      const lists = data.lists || [];
      
      for (const list of lists) {
        const category = (list.type || '').toLowerCase();
        const isGoals = category === 'goals';
        const isAssists = category === 'assists';
        
        if (!isGoals && !isAssists) continue;
        
        const leaders = list.leaders || [];
        
        for (const leader of leaders.slice(0, 25)) {
          const rank = leader.rank || 0;
          const players = leader.players || [];
          
          for (const player of players) {
            // Get player's team info and stats from competitors array
            const competitor = player.competitors?.[0];
            const datapoints = competitor?.datapoints || [];
            
            // Extract stat values from datapoints
            let goals = 0, assists = 0, matches = 0;
            for (const dp of datapoints) {
              if (dp.type === 'goals') goals = dp.value || 0;
              if (dp.type === 'assists') assists = dp.value || 0;
              if (dp.type === 'matches_played' || dp.type === 'played') matches = dp.value || 0;
            }
            
            const entry = {
              rank,
              playerId: player.id,
              playerName: player.name,
              teamId: competitor?.id,
              teamName: competitor?.name,
              teamAbbr: competitor?.abbreviation,
              nationality: player.nationality || null,
              goals,
              assists,
              matches,
              minutesPlayed: null,
              penalties: null,
              goalsPerMatch: matches > 0 && goals > 0 ? (goals / matches).toFixed(2) : null
            };
            
            if (entry.playerName) {
              if (isGoals) {
                topScorers.push(entry);
              } else {
                topAssists.push(entry);
              }
            }
          }
        }
      }
      
      return {
        competition: {
          id: data.competition?.id || competition.id,
          name: data.competition?.name || competition.name,
          country: competition.country,
          type: competition.type
        },
        season: data.season ? {
          id: data.season.id,
          name: data.season.name,
          year: data.season.year
        } : null,
        topScorers,
        topAssists,
        errors
      };
      
    } catch (err) {
      errors.push(`Soccer Leaders Exception: ${err}`);
      return { competition: null, season: null, topScorers: [], topAssists: [], errors };
    }
  }

  /**
   * Fetch Soccer competition schedule/fixtures
   * Soccer v4 API: Uses /seasons/{season_id}/schedules.json
   */
  async fetchSoccerSchedule(competitionKey: string, apiKey: string): Promise<{
    competition: any;
    season: any;
    matches: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const competition = SOCCER_COMPETITIONS[competitionKey];
    if (!competition) {
      return { competition: null, season: null, matches: [], errors: [`Unknown competition: ${competitionKey}`] };
    }
    
    try {
      // Step 1: Get current season ID
      const seasonsResult = await this.fetchSoccerSeasons(competition.id, apiKey);
      if (seasonsResult.errors.length > 0) {
        errors.push(...seasonsResult.errors);
      }
      
      const seasonId = seasonsResult.currentSeasonId;
      if (!seasonId) {
        errors.push('No current season found for competition');
        return { competition: null, season: null, matches: [], errors };
      }
      
      // Step 2: Fetch schedule using season ID
      let response: Response | null = null;
      let lastStatus = 0;
      
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/seasons/${seasonId}/schedules.json?api_key=${apiKey}`;
        
        console.log(`[SportsRadar] Trying Soccer schedule: ${baseUrl} for ${competition.name}`);
        
        response = await this.fetchWithRetry(url);
        lastStatus = response.status;
        
        if (response.ok) break;
      }
      
      if (!response || !response.ok) {
        const errorMsg = `Soccer Schedule API: HTTP ${lastStatus}`;
        errors.push(errorMsg);
        return { competition: null, season: null, matches: [], errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      const matches: any[] = [];
      const events = data.schedules || data.sport_events || [];
      
      for (const event of events) {
        const sportEvent = event.sport_event || event;
        const sportEventStatus = event.sport_event_status || {};
        const competitors = sportEvent.competitors || [];
        const home = competitors.find((c: any) => c.qualifier === 'home');
        const away = competitors.find((c: any) => c.qualifier === 'away');
        
        matches.push({
          eventId: sportEvent.id,
          startTime: sportEvent.start_time ? new Date(sportEvent.start_time) : null,
          status: normalizeStatus(sportEventStatus.status || sportEvent.status),
          venue: sportEvent.venue?.name || null,
          round: sportEvent.sport_event_context?.round?.name || sportEvent.round?.name || null,
          matchday: sportEvent.sport_event_context?.round?.number || null,
          
          homeTeamId: home?.id,
          homeTeamName: home?.name,
          homeTeamAbbreviation: home?.abbreviation,
          homeScore: sportEventStatus.home_score ?? null,
          
          awayTeamId: away?.id,
          awayTeamName: away?.name,
          awayTeamAbbreviation: away?.abbreviation,
          awayScore: sportEventStatus.away_score ?? null,
          
          // Period scores
          periodScores: sportEventStatus.period_scores || null,
          
          // Match winner
          winner: sportEventStatus.winner_id || null
        });
      }
      
      return {
        competition: {
          id: data.competition?.id || competition.id,
          name: data.competition?.name || competition.name,
          country: competition.country,
          type: competition.type
        },
        season: data.season ? {
          id: data.season.id,
          name: data.season.name,
          year: data.season.year
        } : null,
        matches,
        errors
      };
      
    } catch (err) {
      errors.push(`Soccer Schedule Exception: ${err}`);
      return { competition: null, season: null, matches: [], errors };
    }
  }

  /**
   * Fetch Soccer match details including lineups, stats, and play-by-play
   * Endpoint: /soccer/{access_level}/v4/en/sport_events/{event_id}/summary.json
   */
  async fetchSoccerMatchDetail(eventId: string, apiKey: string): Promise<{
    match: any;
    lineups: { home: any[]; away: any[] };
    statistics: any;
    timeline: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      // Fetch from multiple endpoints in parallel
      let summaryData: any = null;
      let timelineData: any = null;
      let lineupsData: any = null;
      let workingBaseUrl: string | null = null;
      
      // Try each base URL until one works for summary
      for (const baseUrl of SOCCER_API_BASES) {
        const summaryUrl = `${baseUrl}/en/sport_events/${eventId}/summary.json?api_key=${apiKey}`;
        
        console.log(`[SportsRadar] Trying Soccer match summary: ${baseUrl} for ${eventId}`);
        
        const summaryResponse = await this.fetchWithRetry(summaryUrl);
        
        if (summaryResponse.ok) {
          summaryData = await summaryResponse.json();
          workingBaseUrl = baseUrl;
          console.log(`[SportsRadar] Summary successful with ${baseUrl}`);
          break;
        }
      }
      
      if (!summaryData || !workingBaseUrl) {
        const errorMsg = `Soccer Match Detail API: All base URLs failed`;
        errors.push(errorMsg);
        return { match: null, lineups: { home: [], away: [] }, statistics: null, timeline: [], errors };
      }
      
      // Now fetch timeline and lineups from the working base URL
      const [timelineResponse, lineupsResponse] = await Promise.all([
        this.fetchWithRetry(`${workingBaseUrl}/en/sport_events/${eventId}/timeline.json?api_key=${apiKey}`).catch(() => null),
        this.fetchWithRetry(`${workingBaseUrl}/en/sport_events/${eventId}/lineups.json?api_key=${apiKey}`).catch(() => null)
      ]);
      
      if (timelineResponse && timelineResponse.ok) {
        timelineData = await timelineResponse.json();
        console.log(`[SportsRadar] Timeline fetched successfully`);
      } else {
        console.log(`[SportsRadar] Timeline not available (may not exist for scheduled matches)`);
      }
      
      if (lineupsResponse && lineupsResponse.ok) {
        lineupsData = await lineupsResponse.json();
        console.log(`[SportsRadar] Lineups fetched successfully for ${eventId}`);
        console.log(`[SportsRadar] Lineups response keys:`, JSON.stringify(Object.keys(lineupsData || {})));
        
        // Log the actual structure to debug
        if (lineupsData) {
          if (lineupsData.lineups && Array.isArray(lineupsData.lineups)) {
            console.log(`[SportsRadar] Found lineups array with ${lineupsData.lineups.length} items`);
            if (lineupsData.lineups.length > 0 && lineupsData.lineups[0]) {
              const sample = JSON.stringify(lineupsData.lineups[0]);
              console.log(`[SportsRadar] First lineup sample:`, sample !== undefined ? sample.substring(0, 300) : 'undefined');
            }
          }
          if (lineupsData.sport_event_competitors && Array.isArray(lineupsData.sport_event_competitors)) {
            console.log(`[SportsRadar] Found sport_event_competitors with ${lineupsData.sport_event_competitors.length} items`);
          }
          if (lineupsData.sport_event_lineups && Array.isArray(lineupsData.sport_event_lineups)) {
            console.log(`[SportsRadar] Found sport_event_lineups with ${lineupsData.sport_event_lineups.length} items`);
            if (lineupsData.sport_event_lineups.length > 0 && lineupsData.sport_event_lineups[0]) {
              const sample = JSON.stringify(lineupsData.sport_event_lineups[0]);
              console.log(`[SportsRadar] First sport_event_lineup sample:`, sample !== undefined ? sample.substring(0, 300) : 'undefined');
            }
          }
          // Log full structure if small enough
          const fullJson = JSON.stringify(lineupsData);
          if (fullJson !== undefined && fullJson.length < 2000) {
            console.log(`[SportsRadar] Full lineups data:`, fullJson);
          }
        }
      } else {
        const status = lineupsResponse?.status || 'no response';
        console.log(`[SportsRadar] Lineups not available for ${eventId} (status: ${status})`);
      }
      
      const data = summaryData;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      const sportEvent = data.sport_event || {};
      const status = data.sport_event_status || {};
      const stats = data.statistics || {};
      const competitors = sportEvent.competitors || [];
      const home = competitors.find((c: any) => c.qualifier === 'home');
      const away = competitors.find((c: any) => c.qualifier === 'away');
      
      // Parse lineups - prefer dedicated lineups endpoint, fallback to summary
      const homeLineup: any[] = [];
      const awayLineup: any[] = [];
      
      try {
        // Safety check: ensure lineups data is valid before iterating
        let lineupsArray: any[] = [];
        
        if (lineupsData && typeof lineupsData === 'object') {
          // Try different possible structures from SportsRadar lineups endpoint
          // NEW: Primary structure - lineups.competitors[] (most common from SportsRadar)
          if (lineupsData.lineups && Array.isArray(lineupsData.lineups.competitors)) {
            lineupsArray = lineupsData.lineups.competitors;
            console.log(`[SportsRadar] Using lineups.competitors array (${lineupsArray.length} teams)`);
            if (lineupsArray.length > 0 && lineupsArray[0]) {
              console.log(`[SportsRadar] First competitor keys:`, Object.keys(lineupsArray[0]));
              console.log(`[SportsRadar] First competitor has ${lineupsArray[0].players?.length || 0} players`);
            }
          } else if (Array.isArray(lineupsData.lineups)) {
            // Fallback: lineups as direct array
            lineupsArray = lineupsData.lineups;
            console.log(`[SportsRadar] Using lineups array (${lineupsArray.length} teams)`);
            if (lineupsArray.length > 0 && lineupsArray[0]) {
              console.log(`[SportsRadar] First lineup keys:`, Object.keys(lineupsArray[0]));
            }
          } else if (lineupsData.sport_event_lineups && Array.isArray(lineupsData.sport_event_lineups)) {
            lineupsArray = lineupsData.sport_event_lineups;
            console.log(`[SportsRadar] Using sport_event_lineups array (${lineupsArray.length} teams)`);
          } else if (lineupsData.sport_event_competitors && Array.isArray(lineupsData.sport_event_competitors)) {
            lineupsArray = lineupsData.sport_event_competitors;
            console.log(`[SportsRadar] Using sport_event_competitors array (${lineupsArray.length} teams)`);
          } else if (Array.isArray(lineupsData)) {
            lineupsArray = lineupsData;
            console.log(`[SportsRadar] Using root array (${lineupsArray.length} items)`);
          } else {
            console.log(`[SportsRadar] No recognized lineup structure found`);
          }
        }
        
        if (lineupsArray && lineupsArray.length > 0) {
          console.log(`[SportsRadar] Processing ${lineupsArray.length} lineups`);
          // Use dedicated lineups endpoint data
          for (const lineup of lineupsArray) {
            if (!lineup || typeof lineup !== 'object') {
              console.log(`[SportsRadar] Skipping invalid lineup entry`);
              continue;
            }
            
            const isHome = lineup.qualifier === 'home';
            const players = Array.isArray(lineup.players) ? lineup.players : [];
            
            console.log(`[SportsRadar] Lineup qualifier: ${lineup.qualifier}, has players array: ${Array.isArray(lineup.players)}, players count: ${players.length}`);
            
            for (const player of players) {
              if (!player || typeof player !== 'object') continue;
              
              const playerData = {
                playerId: player.id || null,
                name: player.name || 'Unknown',
                jerseyNumber: player.jersey_number || null,
                position: player.type || player.position || 'Unknown',
                starter: player.starter || false,
                captain: player.captain || false,
                substituted: player.substituted || false,
                substitutedIn: player.substituted_in || null,
                substitutedOut: player.substituted_out || null,
                // Stats from match
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                minutesPlayed: null
              };
              
              if (isHome) {
                homeLineup.push(playerData);
              } else {
                awayLineup.push(playerData);
              }
            }
          }
          console.log(`[SportsRadar] Parsed lineups - home: ${homeLineup.length}, away: ${awayLineup.length}`);
        } else {
          console.log(`[SportsRadar] No lineups in dedicated endpoint, falling back to summary data`);
          // Fallback to summary data if lineups endpoint not available
          for (const competitor of competitors) {
            if (!competitor || typeof competitor !== 'object') continue;
            
            const players = Array.isArray(competitor.players) ? competitor.players : [];
            const isHome = competitor.qualifier === 'home';
            
            console.log(`[SportsRadar] Summary fallback - processing ${isHome ? 'home' : 'away'} with ${players.length} players`);
            
            for (const player of players) {
              if (!player || typeof player !== 'object') continue;
              
              const playerData = {
                playerId: player.id || null,
                name: player.name || 'Unknown',
                jerseyNumber: player.jersey_number || null,
                position: player.type || player.position || 'Unknown',
                starter: player.starter || false,
                captain: player.captain || false,
                substituted: player.substituted || false,
                substitutedIn: player.substituted_in || null,
                substitutedOut: player.substituted_out || null,
                // Stats
                goals: player.statistics?.goals || 0,
                assists: player.statistics?.assists || 0,
                yellowCards: player.statistics?.yellow_cards || 0,
                redCards: player.statistics?.red_cards || 0,
                minutesPlayed: player.statistics?.minutes_played || null
              };
              
              if (isHome) {
                homeLineup.push(playerData);
              } else {
                awayLineup.push(playerData);
              }
            }
          }
          console.log(`[SportsRadar] Summary fallback complete - home: ${homeLineup.length}, away: ${awayLineup.length}`);
        }
      } catch (lineupsError) {
        console.error('[SportsRadar] Error parsing lineups:', lineupsError);
        errors.push(`Lineups parsing failed: ${String(lineupsError)}`);
        // Continue with empty lineups rather than crashing
      }
      
      // Helper to convert "Lastname, Firstname" to "Firstname Lastname"
      const formatPlayerName = (name: string | null | undefined): string | null => {
        if (!name) return null;
        if (name.includes(', ')) {
          const [last, first] = name.split(', ');
          return `${first} ${last}`;
        }
        return name;
      };
      
      // Parse timeline/play-by-play - prefer dedicated timeline endpoint
      const timeline: any[] = [];
      const timelineEvents = timelineData?.timeline || data.timeline || [];
      
      for (const event of timelineEvents) {
        // Extract player name - handle multiple possible structures
        // SportsRadar uses event.players array with {type: "scorer"|"assist", name: "..."}
        let playerName = null;
        let playerId = null;
        let assistName = null;
        let assistPlayerId = null;
        
        // Check for players array first (SportsRadar v4 format)
        if (event.players && Array.isArray(event.players) && event.players.length > 0) {
          // For goals: look for explicit scorer/assist types
          const scorer = event.players.find((p: any) => p.type === 'scorer');
          const assister = event.players.find((p: any) => p.type === 'assist');
          
          if (scorer) {
            playerName = formatPlayerName(scorer.name);
            playerId = scorer.id;
          } else {
            // For cards/other events: players array has no type, use first player
            const firstPlayer = event.players[0];
            if (firstPlayer && firstPlayer.name) {
              playerName = formatPlayerName(firstPlayer.name);
              playerId = firstPlayer.id;
            }
          }
          if (assister) {
            assistName = formatPlayerName(assister.name);
            assistPlayerId = assister.id;
          }
        }
        
        // Fallback to event.player object (older format)
        if (!playerName && event.player) {
          if (typeof event.player === 'string') {
            playerName = formatPlayerName(event.player);
          } else if (event.player.name) {
            playerName = formatPlayerName(event.player.name);
            playerId = event.player.id;
          } else if (event.player.full_name) {
            playerName = formatPlayerName(event.player.full_name);
            playerId = event.player.id;
          }
        }
        
        // Fallback for assist (older format)
        if (!assistName && event.assist) {
          if (typeof event.assist === 'string') {
            assistName = formatPlayerName(event.assist);
          } else if (event.assist.name) {
            assistName = formatPlayerName(event.assist.name);
            assistPlayerId = event.assist.id;
          } else if (event.assist.full_name) {
            assistName = formatPlayerName(event.assist.full_name);
            assistPlayerId = event.assist.id;
          }
        }
        
        // Extract substitution player names - also check players array
        let playerInName = null;
        let playerOutName = null;
        
        // Check players array for substitution (SportsRadar v4)
        if (event.players && Array.isArray(event.players)) {
          const playerIn = event.players.find((p: any) => p.type === 'substituted_in');
          const playerOut = event.players.find((p: any) => p.type === 'substituted_out');
          if (playerIn) playerInName = formatPlayerName(playerIn.name);
          if (playerOut) playerOutName = formatPlayerName(playerOut.name);
        }
        
        // Fallback to event.player_in/out (older format)
        if (!playerInName && event.player_in) {
          if (typeof event.player_in === 'string') {
            playerInName = formatPlayerName(event.player_in);
          } else if (event.player_in.name) {
            playerInName = formatPlayerName(event.player_in.name);
          }
        }
        if (!playerOutName && event.player_out) {
          if (typeof event.player_out === 'string') {
            playerOutName = formatPlayerName(event.player_out);
          } else if (event.player_out.name) {
            playerOutName = formatPlayerName(event.player_out.name);
          }
        }
        
        timeline.push({
          id: event.id,
          type: event.type, // goal, yellow_card, red_card, substitution, etc.
          time: event.match_time,
          period: event.period,
          team: event.competitor === 'home' ? home?.name : away?.name,
          teamQualifier: event.competitor,
          player: playerName,
          playerId: playerId,
          assistPlayer: assistName,
          assistPlayerId: assistPlayerId,
          // Goal details
          goalType: event.goal_type, // penalty, own_goal, header, etc.
          homeScore: event.home_score,
          awayScore: event.away_score,
          // Card details
          cardType: event.card_type,
          // Sub details
          playerIn: playerInName,
          playerOut: playerOutName
        });
      }
      
      return {
        match: {
          eventId: sportEvent.id,
          startTime: sportEvent.start_time ? new Date(sportEvent.start_time) : null,
          status: normalizeStatus(status.status),
          venue: sportEvent.venue?.name,
          attendance: status.attendance,
          referee: sportEvent.referee?.name,
          
          homeTeam: {
            id: home?.id,
            name: home?.name,
            abbreviation: home?.abbreviation,
            country: home?.country
          },
          awayTeam: {
            id: away?.id,
            name: away?.name,
            abbreviation: away?.abbreviation,
            country: away?.country
          },
          
          homeScore: status.home_score,
          awayScore: status.away_score,
          
          // Period scores
          halfTimeScore: status.period_scores?.find((p: any) => p.type === 'regular_period' && p.number === 1) 
            ? `${status.period_scores[0].home_score}-${status.period_scores[0].away_score}` : null,
          
          // Match time
          clock: status.match_time || status.clock || null,
          period: status.period || null
        },
        lineups: { home: homeLineup, away: awayLineup },
        statistics: {
          home: stats.totals?.competitors?.find((c: any) => c.qualifier === 'home')?.statistics || {},
          away: stats.totals?.competitors?.find((c: any) => c.qualifier === 'away')?.statistics || {}
        },
        timeline,
        errors
      };
      
    } catch (err) {
      errors.push(`Soccer Match Detail Exception: ${err}`);
      return { match: null, lineups: { home: [], away: [] }, statistics: null, timeline: [], errors };
    }
  }

  /**
   * List all available soccer competitions
   */
  getSoccerCompetitions(): Array<{ key: string; name: string; country: string; type: string }> {
    return Object.entries(SOCCER_COMPETITIONS).map(([key, comp]) => ({
      key,
      name: comp.name,
      country: comp.country,
      type: comp.type
    }));
  }

  /**
   * Fetch Soccer team profile with squad, venue, and recent results
   * Endpoint: /soccer/{access_level}/v4/en/competitors/{competitor_id}/profile.json
   */
  async fetchSoccerTeamProfile(teamId: string, apiKey: string): Promise<{
    team: {
      id: string;
      name: string;
      abbreviation: string;
      country: string;
      countryCode: string;
      foundedYear: number | null;
      venue: { id: string; name: string; city: string; capacity: number } | null;
      manager: { id: string; name: string; nationality: string } | null;
      jerseys: { type: string; base: string; number: string; sleeve: string }[];
    } | null;
    players: {
      id: string;
      name: string;
      jerseyNumber: number | null;
      position: string;
      nationality: string;
      dateOfBirth: string | null;
      height: number | null;
      weight: number | null;
    }[];
    recentResults: {
      eventId: string;
      date: string;
      competition: string;
      homeTeam: { id: string; name: string };
      awayTeam: { id: string; name: string };
      homeScore: number | null;
      awayScore: number | null;
      isHome: boolean;
      result: 'W' | 'D' | 'L' | null;
    }[];
    upcomingFixtures: {
      eventId: string;
      date: string;
      competition: string;
      homeTeam: { id: string; name: string };
      awayTeam: { id: string; name: string };
      isHome: boolean;
    }[];
    leagueStanding: {
      leagueName: string;
      leagueId: string;
      position: number;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      points: number;
      form: string | null;
    } | null;
    seasonStats: {
      goalsScored: number;
      goalsConceded: number;
      cleanSheets: number;
      matchesPlayed: number;
    } | null;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      // Fetch team profile
      let profileResponse: Response | null = null;
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/competitors/${teamId}/profile.json?api_key=${apiKey}`;
        console.log(`[SportsRadar] Fetching Soccer team profile: ${teamId}`);
        profileResponse = await this.fetchWithRetry(url);
        if (profileResponse.ok) break;
      }
      
      if (!profileResponse || !profileResponse.ok) {
        errors.push(`Team Profile API: HTTP ${profileResponse?.status || 0}`);
        return { team: null, players: [], recentResults: [], upcomingFixtures: [], leagueStanding: null, seasonStats: null, errors };
      }
      
      const profileData = await profileResponse.json() as any;
      const competitor = profileData.competitor || {};
      
      // Parse team info
      const team = {
        id: competitor.id,
        name: competitor.name,
        abbreviation: competitor.abbreviation || '',
        country: competitor.country,
        countryCode: competitor.country_code || '',
        foundedYear: competitor.founded ? parseInt(competitor.founded, 10) : null,
        venue: competitor.venue ? {
          id: competitor.venue.id,
          name: competitor.venue.name,
          city: competitor.venue.city_name || competitor.venue.city || '',
          capacity: competitor.venue.capacity || 0
        } : null,
        manager: competitor.manager ? {
          id: competitor.manager.id,
          name: competitor.manager.name,
          nationality: competitor.manager.nationality || ''
        } : null,
        jerseys: (competitor.jerseys || []).map((j: any) => ({
          type: j.type,
          base: j.base,
          number: j.number,
          sleeve: j.sleeve
        }))
      };
      
      // Determine team's primary competition from profile categories
      let primaryCompetitionId: string | null = null;
      let primaryCompetitionName: string | null = null;
      const categories = competitor.categories || profileData.categories || [];
      for (const cat of categories) {
        if (cat.id && cat.name) {
          // Use first league-type competition found
          primaryCompetitionId = cat.id;
          primaryCompetitionName = cat.name;
          break;
        }
      }
      // Fallback: check sport_event_context from summaries later
      
      // Parse players/squad
      const players = (profileData.players || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        jerseyNumber: p.jersey_number ?? null,
        position: p.type || p.position || 'Unknown',
        nationality: p.nationality || '',
        dateOfBirth: p.date_of_birth || null,
        height: p.height ?? null,
        weight: p.weight ?? null
      }));
      
      // Fetch team results/schedule (last 30 days and next 30 days)
      let summariesResponse: Response | null = null;
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/competitors/${teamId}/summaries.json?api_key=${apiKey}`;
        console.log(`[SportsRadar] Fetching Soccer team summaries: ${teamId}`);
        summariesResponse = await this.fetchWithRetry(url);
        if (summariesResponse.ok) break;
      }
      
      const recentResults: any[] = [];
      const upcomingFixtures: any[] = [];
      
      if (summariesResponse?.ok) {
        const summariesData = await summariesResponse.json() as any;
        const summaries = summariesData.summaries || [];
        const now = new Date();
        
        for (const s of summaries) {
          const sportEvent = s.sport_event || {};
          const status = s.sport_event_status || {};
          const eventDate = new Date(sportEvent.start_time);
          const competitors = sportEvent.competitors || [];
          
          const home = competitors.find((c: any) => c.qualifier === 'home');
          const away = competitors.find((c: any) => c.qualifier === 'away');
          const isHome = home?.id === teamId;
          
          const fixture = {
            eventId: sportEvent.id,
            date: sportEvent.start_time,
            competition: sportEvent.sport_event_context?.competition?.name || 'Unknown',
            homeTeam: { id: home?.id || '', name: home?.name || 'TBD' },
            awayTeam: { id: away?.id || '', name: away?.name || 'TBD' },
            isHome
          };
          
          if (status.status === 'closed' || status.status === 'ended') {
            // Past match - add result
            const homeScore = status.home_score ?? null;
            const awayScore = status.away_score ?? null;
            let result: 'W' | 'D' | 'L' | null = null;
            
            if (homeScore !== null && awayScore !== null) {
              const teamScore = isHome ? homeScore : awayScore;
              const oppScore = isHome ? awayScore : homeScore;
              if (teamScore > oppScore) result = 'W';
              else if (teamScore < oppScore) result = 'L';
              else result = 'D';
            }
            
            recentResults.push({ ...fixture, homeScore, awayScore, result });
          } else if (eventDate > now) {
            // Upcoming fixture
            upcomingFixtures.push(fixture);
          }
        }
      }
      
      // Sort results (most recent first) and fixtures (soonest first)
      recentResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      upcomingFixtures.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Determine primary league from recent results if not found in profile
      if (!primaryCompetitionId && recentResults.length > 0) {
        // Find most common competition in results
        const compCounts: Record<string, number> = {};
        for (const r of recentResults) {
          if (r.competition && r.competition !== 'Unknown') {
            compCounts[r.competition] = (compCounts[r.competition] || 0) + 1;
          }
        }
        const mostCommon = Object.entries(compCounts).sort((a, b) => b[1] - a[1])[0];
        if (mostCommon) {
          primaryCompetitionName = mostCommon[0];
        }
      }
      
      // Try to fetch standings for team's primary league
      let leagueStanding: any = null;
      
      // Map common competition names to our SOCCER_COMPETITIONS keys
      const COMP_NAME_MAP: Record<string, string> = {
        'Premier League': 'premier-league',
        'LaLiga': 'la-liga',
        'La Liga': 'la-liga',
        'Serie A': 'serie-a',
        'Bundesliga': 'bundesliga',
        'Ligue 1': 'ligue-1',
        'MLS': 'mls',
        'Liga MX': 'liga-mx',
        'UEFA Champions League': 'champions-league',
        'Champions League': 'champions-league',
        'UEFA Europa League': 'europa-league',
        'Europa League': 'europa-league',
        'Eredivisie': 'eredivisie',
        'Primeira Liga': 'primeira-liga',
        'Scottish Premiership': 'scottish-premiership',
        'Championship': 'championship'
      };
      
      if (primaryCompetitionName) {
        const compKey = COMP_NAME_MAP[primaryCompetitionName];
        if (compKey && SOCCER_COMPETITIONS[compKey]) {
          try {
            console.log(`[SportsRadar] Fetching standings for ${primaryCompetitionName} to get team position`);
            const standingsResult = await this.fetchSoccerStandings(compKey, apiKey);
            if (standingsResult.standings.length > 0) {
              const teamStanding = standingsResult.standings.find((s: any) => s.teamId === teamId);
              if (teamStanding) {
                leagueStanding = {
                  leagueName: primaryCompetitionName,
                  leagueId: SOCCER_COMPETITIONS[compKey].id,
                  position: teamStanding.rank,
                  played: teamStanding.played,
                  wins: teamStanding.wins,
                  draws: teamStanding.draws,
                  losses: teamStanding.losses,
                  goalsFor: teamStanding.goalsFor,
                  goalsAgainst: teamStanding.goalsAgainst,
                  goalDifference: teamStanding.goalDifference,
                  points: teamStanding.points,
                  form: teamStanding.form
                };
              }
            }
          } catch (standingsErr) {
            console.log(`[SportsRadar] Could not fetch standings: ${standingsErr}`);
          }
        }
      }
      
      // Calculate season stats from results
      let seasonStats: any = null;
      if (recentResults.length > 0) {
        let goalsScored = 0;
        let goalsConceded = 0;
        let cleanSheets = 0;
        
        for (const r of recentResults) {
          if (r.homeScore !== null && r.awayScore !== null) {
            const scored = r.isHome ? r.homeScore : r.awayScore;
            const conceded = r.isHome ? r.awayScore : r.homeScore;
            goalsScored += scored;
            goalsConceded += conceded;
            if (conceded === 0) cleanSheets++;
          }
        }
        
        seasonStats = {
          goalsScored,
          goalsConceded,
          cleanSheets,
          matchesPlayed: recentResults.length
        };
      }
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      return {
        team,
        players,
        recentResults: recentResults.slice(0, 15), // Last 15 matches
        upcomingFixtures: upcomingFixtures.slice(0, 10), // Next 10 fixtures
        leagueStanding,
        seasonStats,
        errors
      };
      
    } catch (err) {
      errors.push(`Soccer Team Profile Exception: ${err}`);
      return { team: null, players: [], recentResults: [], upcomingFixtures: [], leagueStanding: null, seasonStats: null, errors };
    }
  }

  /**
   * Fetch Soccer team's full season schedule (results + upcoming fixtures)
   * Uses /competitors/{teamId}/schedule.json for full schedule
   */
  async fetchSoccerTeamSeasonSchedule(teamId: string, apiKey: string): Promise<{
    results: any[];
    upcoming: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const results: any[] = [];
    const upcoming: any[] = [];
    
    try {
      // Step 1: Fetch team profile to get their primary competition
      let profileResponse: Response | null = null;
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/competitors/${teamId}/profile.json?api_key=${apiKey}`;
        console.log(`[SportsRadar] Fetching team profile for schedule: ${teamId}`);
        profileResponse = await this.fetchWithRetry(url);
        if (profileResponse.ok) break;
      }
      
      if (!profileResponse?.ok) {
        errors.push(`Team profile API returned ${profileResponse?.status || 'unknown error'}`);
        return { results, upcoming, errors };
      }
      
      const profileData = await profileResponse.json() as any;
      const competitor = profileData.competitor || {};
      
      // Find primary competition from profile categories
      const categories = competitor.categories || profileData.categories || [];
      let primaryCompetitionId: string | null = null;
      
      for (const cat of categories) {
        if (cat.id) {
          primaryCompetitionId = cat.id;
          break;
        }
      }
      
      // Fallback: Try to infer competition from SOCCER_COMPETITIONS based on country
      if (!primaryCompetitionId && competitor.country_code) {
        const countryMap: Record<string, string> = {
          'ENG': 'sr:competition:17', // Premier League
          'ESP': 'sr:competition:8',  // La Liga
          'ITA': 'sr:competition:23', // Serie A
          'GER': 'sr:competition:35', // Bundesliga
          'FRA': 'sr:competition:34', // Ligue 1
          'NED': 'sr:competition:37', // Eredivisie
          'POR': 'sr:competition:238', // Primeira Liga
          'USA': 'sr:competition:242', // MLS
        };
        primaryCompetitionId = countryMap[competitor.country_code] || null;
      }
      
      if (!primaryCompetitionId) {
        errors.push('Could not determine team\'s primary competition');
        return { results, upcoming, errors };
      }
      
      // Step 2: Get current season for the competition
      const seasonsResult = await this.fetchSoccerSeasons(primaryCompetitionId, apiKey);
      if (seasonsResult.errors.length > 0) {
        errors.push(...seasonsResult.errors);
      }
      
      const seasonId = seasonsResult.currentSeasonId;
      if (!seasonId) {
        errors.push('No current season found for competition');
        return { results, upcoming, errors };
      }
      
      // Step 3: Fetch full season schedule
      let scheduleResponse: Response | null = null;
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/seasons/${seasonId}/schedules.json?api_key=${apiKey}`;
        console.log(`[SportsRadar] Fetching full season schedule: ${seasonId} for team ${teamId}`);
        scheduleResponse = await this.fetchWithRetry(url);
        if (scheduleResponse.ok) break;
      }
      
      if (!scheduleResponse?.ok) {
        errors.push(`Schedule API returned ${scheduleResponse?.status || 'unknown error'}`);
        return { results, upcoming, errors };
      }
      
      const scheduleData = await scheduleResponse.json() as any;
      const schedules = scheduleData.schedules || scheduleData.sport_events || [];
      
      // Step 4: Filter for matches involving this team
      for (const item of schedules) {
        const sportEvent = item.sport_event || item;
        const status = item.sport_event_status || sportEvent.sport_event_status || {};
        const competitors = sportEvent.competitors || [];
        
        const home = competitors.find((c: any) => c.qualifier === 'home');
        const away = competitors.find((c: any) => c.qualifier === 'away');
        
        // Only include matches where this team is playing
        const isHome = home?.id === teamId;
        const isAway = away?.id === teamId;
        if (!isHome && !isAway) continue;
        
        const match = {
          eventId: sportEvent.id,
          date: sportEvent.start_time,
          competition: sportEvent.sport_event_context?.competition?.name || 'Unknown',
          round: sportEvent.sport_event_context?.round?.name || sportEvent.sport_event_context?.stage?.phase || null,
          venue: sportEvent.venue?.name || null,
          homeTeam: { 
            id: home?.id || '', 
            name: home?.name || 'TBD',
            abbreviation: home?.abbreviation || ''
          },
          awayTeam: { 
            id: away?.id || '', 
            name: away?.name || 'TBD',
            abbreviation: away?.abbreviation || ''
          },
          isHome,
          homeScore: status.home_score ?? null,
          awayScore: status.away_score ?? null,
          status: status.status || 'not_started',
          matchStatus: status.match_status || null
        };
        
        // Determine if completed (past) or upcoming
        const isCompleted = ['closed', 'ended', 'complete', 'aet', 'ap'].includes(status.status?.toLowerCase() || '');
        const isLive = ['live', 'inprogress', '1st_half', '2nd_half', 'halftime'].includes(status.status?.toLowerCase() || '');
        
        if (isCompleted) {
          // Calculate result for this team
          const homeScore = match.homeScore ?? 0;
          const awayScore = match.awayScore ?? 0;
          let result: 'W' | 'D' | 'L' | null = null;
          
          if (match.homeScore !== null && match.awayScore !== null) {
            if (isHome) {
              result = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
            } else {
              result = awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'D';
            }
          }
          
          results.push({ ...match, result });
        } else if (isLive) {
          // Live matches go to upcoming but marked as live
          upcoming.push({ ...match, isLive: true });
        } else {
          // Future match
          upcoming.push({ ...match, isLive: false });
        }
      }
      
      // Sort results: most recent first
      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Sort upcoming: soonest first
      upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      console.log(`[SportsRadar] Team ${teamId} season schedule: ${results.length} results, ${upcoming.length} upcoming`);
      
      return { results, upcoming, errors };
      
    } catch (err) {
      errors.push(`Schedule fetch error: ${err}`);
      return { results, upcoming, errors };
    }
  }

  /**
   * Fetch head-to-head history between two soccer teams
   * Endpoint: /soccer/{access_level}/v4/en/competitors/{id}/versus/{id}/summaries.json
   */
  async fetchSoccerH2H(team1Id: string, team2Id: string, apiKey: string): Promise<{
    meetings: any[];
    totals: { team1Wins: number; team2Wins: number; draws: number; team1Goals: number; team2Goals: number };
    team1: { id: string; name: string } | null;
    team2: { id: string; name: string } | null;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      let response: Response | null = null;
      let lastStatus = 0;
      
      // Try each base URL until one works
      for (const baseUrl of SOCCER_API_BASES) {
        const url = `${baseUrl}/en/competitors/${team1Id}/versus/${team2Id}/summaries.json?api_key=${apiKey}`;
        
        console.log(`[SportsRadar] Fetching Soccer H2H: ${team1Id} vs ${team2Id}`);
        
        response = await this.fetchWithRetry(url);
        lastStatus = response.status;
        
        if (response.ok) break;
      }
      
      if (!response || !response.ok) {
        const errorMsg = `Soccer H2H API: HTTP ${lastStatus}`;
        errors.push(errorMsg);
        return { meetings: [], totals: { team1Wins: 0, team2Wins: 0, draws: 0, team1Goals: 0, team2Goals: 0 }, team1: null, team2: null, errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      // Parse competitors
      const competitors = data.competitors || [];
      const team1Data = competitors.find((c: any) => c.id === team1Id);
      const team2Data = competitors.find((c: any) => c.id === team2Id);
      
      // Parse meetings
      const meetings: any[] = [];
      const summaries = data.summaries || data.last_meetings || [];
      
      let team1Wins = 0;
      let team2Wins = 0;
      let draws = 0;
      let team1Goals = 0;
      let team2Goals = 0;
      
      for (const summary of summaries) {
        const sportEvent = summary.sport_event || {};
        const status = summary.sport_event_status || {};
        const eventCompetitors = sportEvent.competitors || [];
        
        const home = eventCompetitors.find((c: any) => c.qualifier === 'home');
        const away = eventCompetitors.find((c: any) => c.qualifier === 'away');
        
        const homeScore = status.home_score ?? null;
        const awayScore = status.away_score ?? null;
        
        // Determine winner
        let winner: 'home' | 'away' | 'draw' | null = null;
        if (homeScore !== null && awayScore !== null) {
          if (homeScore > awayScore) winner = 'home';
          else if (awayScore > homeScore) winner = 'away';
          else winner = 'draw';
          
          // Track totals
          const isTeam1Home = home?.id === team1Id;
          if (winner === 'draw') {
            draws++;
          } else if ((winner === 'home' && isTeam1Home) || (winner === 'away' && !isTeam1Home)) {
            team1Wins++;
          } else {
            team2Wins++;
          }
          
          team1Goals += isTeam1Home ? homeScore : awayScore;
          team2Goals += isTeam1Home ? awayScore : homeScore;
        }
        
        meetings.push({
          eventId: sportEvent.id,
          date: sportEvent.start_time,
          competition: sportEvent.sport_event_context?.competition?.name || 
                       sportEvent.season?.competition_id || 'Unknown',
          venue: sportEvent.venue?.name,
          
          homeTeam: {
            id: home?.id,
            name: home?.name
          },
          awayTeam: {
            id: away?.id,
            name: away?.name
          },
          
          homeScore,
          awayScore,
          winner
        });
      }
      
      return {
        meetings: meetings.sort((a, b) => 
          new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        ),
        totals: { team1Wins, team2Wins, draws, team1Goals, team2Goals },
        team1: team1Data ? { id: team1Data.id, name: team1Data.name } : null,
        team2: team2Data ? { id: team2Data.id, name: team2Data.name } : null,
        errors
      };
      
    } catch (err) {
      errors.push(`Soccer H2H Exception: ${err}`);
      return { meetings: [], totals: { team1Wins: 0, team2Wins: 0, draws: 0, team1Goals: 0, team2Goals: 0 }, team1: null, team2: null, errors };
    }
  }

  // ============================================
  // TEAM DATA METHODS
  // ============================================
  
  /**
   * Fetch team profile from SportsRadar
   * Includes team info, venue, and roster
   */
  async fetchTeamProfile(sport: SportKey, teamId: string, apiKey: string): Promise<{
    team: any;
    roster: any[];
    venue: any;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const sportConfig = TEAM_API_BASES[sport];
    if (!sportConfig) {
      return { team: null, roster: [], venue: null, errors: [`No team API config for ${sport}`] };
    }
    
    try {
      // URL: /{sport}/production/{version}/en/teams/{team_id}/profile.json
      const url = `${sportConfig.base}/${sportConfig.version}/en/teams/${teamId}/profile.json?api_key=${apiKey}`;
      
      console.log(`[SportsRadar] Fetching team profile for ${sport} team ${teamId}`);
      
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const errorMsg = `Team Profile API: HTTP ${response.status}`;
        errors.push(errorMsg);
        providerHealth.lastError = errorMsg;
        providerHealth.lastErrorTime = new Date().toISOString();
        return { team: null, roster: [], venue: null, errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      return {
        team: {
          id: data.id,
          name: data.name,
          market: data.market, // City name
          alias: data.alias, // Abbreviation
          conference: data.conference?.name || data.conference?.alias,
          division: data.division?.name || data.division?.alias,
          record: data.record || null,
          logo: data.logo || null
        },
        roster: (data.players || []).map((p: any) => ({
          id: p.id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          firstName: p.first_name,
          lastName: p.last_name,
          position: p.position || p.primary_position,
          jerseyNumber: p.jersey_number,
          height: p.height,
          weight: p.weight,
          birthdate: p.birthdate,
          college: p.college,
          rookie: p.rookie_year === new Date().getFullYear(),
          status: p.status,
          headshot: p.headshot || null
        })),
        venue: data.venue ? {
          id: data.venue.id,
          name: data.venue.name,
          city: data.venue.city,
          state: data.venue.state,
          country: data.venue.country,
          capacity: data.venue.capacity,
          surface: data.venue.surface,
          roof_type: data.venue.roof_type
        } : null,
        errors
      };
      
    } catch (err) {
      errors.push(`Team Profile Exception: ${err}`);
      providerHealth.lastError = String(err);
      providerHealth.lastErrorTime = new Date().toISOString();
      return { team: null, roster: [], venue: null, errors };
    }
  }
  
  /**
   * Fetch standings for a sport/season
   */
  async fetchStandings(sport: SportKey, apiKey: string, season?: number): Promise<{
    conferences: any[];
    divisions: any[];
    teams: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const sportConfig = TEAM_API_BASES[sport];
    if (!sportConfig) {
      return { conferences: [], divisions: [], teams: [], errors: [`No team API config for ${sport}`] };
    }
    
    try {
      // For NBA/NHL/MLB, current season spans two years (2024-2025 season)
      // SportsRadar uses the starting year (e.g., 2024 for 2024-2025 season)
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      // NBA/NHL start in October, so before October use previous year
      // MLB starts in March, so before March use previous year
      let year = season;
      if (!year) {
        if (sport === 'MLB') {
          year = currentMonth < 3 ? currentYear - 1 : currentYear;
        } else {
          // NBA, NHL, NFL, NCAAB, NCAAF - seasons start in fall
          year = currentMonth < 9 ? currentYear - 1 : currentYear;
        }
      }
      
      const yearCandidates = Array.from(
        new Set(
          [year, (year as number) - 1, (year as number) + 1].filter(
            (candidate): candidate is number => Number.isFinite(candidate)
          )
        )
      );

      let data: any = null;
      for (const candidateYear of yearCandidates) {
        const url = `${sportConfig.base}/${sportConfig.version}/en/seasons/${candidateYear}/REG/standings.json?api_key=${apiKey}`;
        console.log(
          `[SportsRadar] Fetching standings for ${sport} season ${candidateYear}:`,
          url.replace(/api_key=.*/, 'api_key=***')
        );
        const response = await this.fetchWithRetry(url);
        if (response.ok) {
          data = await response.json() as any;
          break;
        }
        errors.push(`Standings API ${candidateYear}: HTTP ${response.status}`);
      }
      if (!data) {
        return { conferences: [], divisions: [], teams: [], errors };
      }
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      // Parse standings structure (varies by sport)
      const conferences: any[] = [];
      const divisions: any[] = [];
      const teams: any[] = [];
      
      // NBA/NFL/NHL structure: conferences -> divisions -> teams
      if (data.conferences) {
        for (const conf of data.conferences) {
          conferences.push({
            id: conf.id,
            name: conf.name,
            alias: conf.alias
          });
          
          const confDivisions = conf.divisions || [];
          for (const div of confDivisions) {
            divisions.push({
              id: div.id,
              name: div.name,
              alias: div.alias,
              conferenceId: conf.id,
              conferenceName: conf.name
            });
            
            const divTeams = div.teams || [];
            for (const team of divTeams) {
              teams.push(this.normalizeStandingsTeam(team, conf, div, sport));
            }
          }
        }
      }
      
      // MLB structure: leagues -> divisions -> teams
      if (data.leagues) {
        for (const league of data.leagues) {
          conferences.push({
            id: league.id,
            name: league.name,
            alias: league.alias
          });
          
          const leagueDivisions = league.divisions || [];
          for (const div of leagueDivisions) {
            divisions.push({
              id: div.id,
              name: div.name,
              alias: div.alias,
              conferenceId: league.id,
              conferenceName: league.name
            });
            
            const divTeams = div.teams || [];
            for (const team of divTeams) {
              teams.push(this.normalizeStandingsTeam(team, league, div, sport));
            }
          }
        }
      }
      
      // NCAAB/NCAAF structure: divisions (D1, D2, etc) -> conferences -> teams
      if (data.divisions && !data.conferences && !data.leagues) {
        for (const division of data.divisions) {
          const divConfs = division.conferences || [];
          for (const conf of divConfs) {
            conferences.push({
              id: conf.id,
              name: conf.name,
              alias: conf.alias
            });
            
            const confTeams = conf.teams || [];
            for (const team of confTeams) {
              teams.push(this.normalizeStandingsTeam(team, conf, null, sport));
            }
          }
        }
      }
      
      return { conferences, divisions, teams, errors };
      
    } catch (err) {
      errors.push(`Standings Exception: ${err}`);
      return { conferences: [], divisions: [], teams: [], errors };
    }
  }
  
  /**
   * Normalize team standings data across different sport formats
   */
  private normalizeStandingsTeam(team: any, conference: any, division: any, sport: SportKey): any {
    const record = team.record || team.overall || {};
    const confRecord = team.conference || team.in_conference || {};
    const homeRecord = team.home || {};
    const awayRecord = team.away || team.road || {};
    
    return {
      id: team.id,
      name: team.name,
      market: team.market,
      alias: team.alias,
      sport,
      conferenceId: conference?.id,
      conferenceName: conference?.name || conference?.alias,
      divisionId: division?.id,
      divisionName: division?.name || division?.alias,
      
      // Overall record
      wins: record.wins ?? team.wins ?? 0,
      losses: record.losses ?? team.losses ?? 0,
      ties: record.ties ?? team.ties,
      winPct: record.win_pct ?? (record.wins / Math.max(1, record.wins + record.losses)),
      
      // Conference record
      confWins: confRecord.wins ?? 0,
      confLosses: confRecord.losses ?? 0,
      
      // Home/Away record
      homeWins: homeRecord.wins ?? 0,
      homeLosses: homeRecord.losses ?? 0,
      awayWins: awayRecord.wins ?? 0,
      awayLosses: awayRecord.losses ?? 0,
      
      // Standings info
      rank: team.rank ?? team.seed ?? null,
      gamesBack: team.games_back ?? team.games_behind ?? null,
      streak: team.streak?.length ? `${team.streak.kind === 'win' ? 'W' : 'L'}${team.streak.length}` : null,
      lastTen: team.last_10 ? `${team.last_10.wins}-${team.last_10.losses}` : null,
      
      // Sport-specific stats
      pointsFor: team.points_for ?? team.scoring?.runs ?? null,
      pointsAgainst: team.points_against ?? team.scoring?.runs_against ?? null,
      pointDiff: team.point_diff ?? (team.points_for && team.points_against ? team.points_for - team.points_against : null),
      
      // Playoff info
      clinched: team.clinched || null,
      eliminated: team.eliminated || false
    };
  }
  
  /**
   * Fetch team schedule
   */
  async fetchTeamSchedule(sport: SportKey, teamId: string, apiKey: string, season?: number): Promise<{
    games: any[];
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const sportConfig = TEAM_API_BASES[sport];
    if (!sportConfig) {
      return { games: [], errors: [`No team API config for ${sport}`] };
    }
    
    try {
      void season; // Season filtering could be added later
      // URL: /{sport}/production/{version}/en/teams/{team_id}/schedule.json
      const url = `${sportConfig.base}/${sportConfig.version}/en/teams/${teamId}/schedule.json?api_key=${apiKey}`;
      
      console.log(`[SportsRadar] Fetching schedule for ${sport} team ${teamId}`);
      
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const errorMsg = `Team Schedule API: HTTP ${response.status}`;
        errors.push(errorMsg);
        return { games: [], errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      const games: any[] = [];
      const rawGames = data.games || [];
      
      for (const game of rawGames) {
        try {
          const home = game.home || {};
          const away = game.away || {};
          const parseScore = (...values: unknown[]): number | null => {
            for (const value of values) {
              const n = Number(value);
              if (Number.isFinite(n)) return n;
            }
            return null;
          };
          
          games.push({
            id: game.id,
            scheduledTime: game.scheduled ? new Date(game.scheduled) : null,
            status: normalizeStatus(game.status),
            venue: game.venue?.name || null,
            broadcast: game.broadcast?.network || null,
            
            // Teams
            homeTeamId: home.id,
            homeTeamName: home.name,
            homeTeamAlias: home.alias,
            homeTeamMarket: home.market,
            homeScore: parseScore(
              home.points,
              home.runs,
              game.home_points,
              game.home_score,
              game.scoring?.home_points,
              game.summary?.home?.points
            ),
            
            awayTeamId: away.id,
            awayTeamName: away.name,
            awayTeamAlias: away.alias,
            awayTeamMarket: away.market,
            awayScore: parseScore(
              away.points,
              away.runs,
              game.away_points,
              game.away_score,
              game.scoring?.away_points,
              game.summary?.away?.points
            ),
            
            // Is this team home or away?
            isHome: home.id === teamId
          });
        } catch (err) {
          errors.push(`Error parsing game: ${err}`);
        }
      }
      
      return { games, errors };
      
    } catch (err) {
      errors.push(`Team Schedule Exception: ${err}`);
      return { games: [], errors };
    }
  }
  
  /**
   * Fetch team season statistics
   */
  async fetchTeamStats(sport: SportKey, teamId: string, apiKey: string, season?: number): Promise<{
    stats: any;
    rankings: any;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const sportConfig = TEAM_API_BASES[sport];
    if (!sportConfig) {
      return { stats: null, rankings: null, errors: [`No team API config for ${sport}`] };
    }
    
    try {
      const year = season || new Date().getFullYear();
      // URL: /{sport}/production/{version}/en/seasons/{year}/REG/teams/{team_id}/statistics.json
      const url = `${sportConfig.base}/${sportConfig.version}/en/seasons/${year}/REG/teams/${teamId}/statistics.json?api_key=${apiKey}`;
      
      console.log(`[SportsRadar] Fetching stats for ${sport} team ${teamId}`);
      
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const errorMsg = `Team Stats API: HTTP ${response.status}`;
        errors.push(errorMsg);
        return { stats: null, rankings: null, errors };
      }
      
      const data = await response.json() as any;
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      
      // Extract sport-specific stats
      const stats = this.normalizeTeamStats(data, sport);
      const rankings = this.extractRankings(data, sport);
      
      return { stats, rankings, errors };
      
    } catch (err) {
      errors.push(`Team Stats Exception: ${err}`);
      return { stats: null, rankings: null, errors };
    }
  }
  
  /**
   * Normalize team statistics across different sport formats
   */
  private normalizeTeamStats(data: any, sport: SportKey): any {
    const own = data.own_record || data.team || data.statistics || data;
    const opp = data.opponents || data.opponent || {};
    
    switch (sport) {
      case 'NBA':
      case 'NCAAB':
        return {
          gamesPlayed: own.games_played || 0,
          // Offense
          pointsPerGame: own.average?.points || own.points?.avg || 0,
          assistsPerGame: own.average?.assists || own.assists?.avg || 0,
          reboundsPerGame: own.average?.rebounds || own.rebounds?.avg || 0,
          fieldGoalPct: own.field_goals_made && own.field_goals_att 
            ? (own.field_goals_made / own.field_goals_att * 100).toFixed(1) 
            : own.field_goals_pct || 0,
          threePointPct: own.three_points_made && own.three_points_att
            ? (own.three_points_made / own.three_points_att * 100).toFixed(1)
            : own.three_points_pct || 0,
          freeThrowPct: own.free_throws_made && own.free_throws_att
            ? (own.free_throws_made / own.free_throws_att * 100).toFixed(1)
            : own.free_throws_pct || 0,
          turnoversPerGame: own.average?.turnovers || own.turnovers?.avg || 0,
          stealsPerGame: own.average?.steals || own.steals?.avg || 0,
          blocksPerGame: own.average?.blocks || own.blocks?.avg || 0,
          // Defense
          oppPointsPerGame: opp.average?.points || opp.points?.avg || 0
        };
        
      case 'NFL':
      case 'NCAAF':
        return {
          gamesPlayed: own.games_played || 0,
          // Offense
          pointsPerGame: own.scoring?.points_per_game || 0,
          totalYardsPerGame: own.total?.yards_per_game || 0,
          passingYardsPerGame: own.passing?.yards_per_game || 0,
          rushingYardsPerGame: own.rushing?.yards_per_game || 0,
          turnovers: own.turnovers?.total || 0,
          thirdDownPct: own.efficiency?.third_down_pct || 0,
          redZonePct: own.efficiency?.red_zone_pct || 0,
          // Defense
          oppPointsPerGame: opp.scoring?.points_per_game || 0,
          sacks: own.defense?.sacks || 0,
          interceptions: own.defense?.interceptions || 0
        };
        
      case 'MLB':
        return {
          gamesPlayed: own.games_played || 0,
          // Batting
          battingAvg: own.batting?.average || 0,
          runs: own.batting?.runs || 0,
          homeRuns: own.batting?.home_runs || 0,
          rbi: own.batting?.rbi || 0,
          stolenBases: own.batting?.stolen_bases || 0,
          onBasePct: own.batting?.obp || 0,
          sluggingPct: own.batting?.slg || 0,
          ops: own.batting?.ops || 0,
          // Pitching
          era: own.pitching?.era || 0,
          whip: own.pitching?.whip || 0,
          strikeouts: own.pitching?.strikeouts || 0,
          walks: own.pitching?.walks || 0,
          saves: own.pitching?.saves || 0
        };
        
      case 'NHL':
        return {
          gamesPlayed: own.games_played || 0,
          // Offense
          goalsPerGame: own.scoring?.goals_per_game || 0,
          shotsPerGame: own.shooting?.shots_per_game || 0,
          shootingPct: own.shooting?.pct || 0,
          powerPlayPct: own.special_teams?.power_play_pct || 0,
          // Defense
          goalsAgainstPerGame: opp.scoring?.goals_per_game || own.goaltending?.goals_against_avg || 0,
          savePct: own.goaltending?.save_pct || 0,
          penaltyKillPct: own.special_teams?.penalty_kill_pct || 0,
          // Other
          faceoffPct: own.faceoffs?.win_pct || 0
        };
        
      default:
        return own;
    }
  }
  
  /**
   * Extract rankings from team stats response
   */
  private extractRankings(data: any, _sport: SportKey): any {
    // SportsRadar sometimes includes rankings in the response
    const rankings = data.rankings || {};
    
    return {
      overall: rankings.overall || null,
      offense: rankings.offense || rankings.offensive || null,
      defense: rankings.defense || rankings.defensive || null,
      conference: rankings.conference || null
    };
  }
  
  // ============================================
  // PLAYER PROPS METHODS
  // ============================================
  
  /**
   * Fetch player props from SportsRadar Odds Comparison API
   * Endpoint: /oddscomparison-liveodds/{access_level}/v2/{language_code}/sport_events/{sport_event_id}/players_props.json
   * 
   * Note: We need sport_event_ids from another game source in the provider chain.
   * This method fetches props for games we already know about
   */
  private async fetchPlayerProps(sport: SportKey, _dateRange: DateRange): Promise<FetchPropsResult> {
    const errors: string[] = [];
    const props: NormalizedProp[] = [];
    let totalRawCount = 0;
    
    if (!this.config.propsApiKey) {
      return { props, rawCount: 0, errors: ['Props API key not configured'] };
    }
    
    // We'll fetch props per game - this method is called by the orchestrator
    // which provides game IDs. For now, return empty and implement game-level fetch.
    console.log(`[SportsRadar] fetchPlayerProps called for ${sport} - use fetchPropsForGame for specific games`);
    
    return { props, rawCount: totalRawCount, errors };
  }
  
  /**
   * Fetch player props for a specific game/event
   * This is the primary method - called with sport_event_id from our database
   */
  async fetchPropsForGame(sportEventId: string, _sport: SportKey): Promise<FetchPropsResult> {
    const errors: string[] = [];
    const props: NormalizedProp[] = [];
    
    if (!this.config.propsApiKey) {
      return { props, rawCount: 0, errors: ['Props API key not configured'] };
    }
    
    try {
      // SportsRadar uses URN format for event IDs: sr:sport_event:12345
      // We need to map our game IDs to SportsRadar URNs
      // For now, try the ID directly and also with common prefixes
      
      const url = `${ODDS_COMPARISON_BASE}/${this.config.accessLevel}/v2/${this.config.language}/sport_events/${sportEventId}/players_props.json?api_key=${this.config.propsApiKey}`;
      
      console.log(`[SportsRadar] Fetching props for event ${sportEventId}`);
      
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        const errorMsg = `Props API: HTTP ${response.status} for ${sportEventId}`;
        errors.push(errorMsg);
        providerHealth.failedCalls++;
        providerHealth.lastError = errorMsg;
        providerHealth.lastErrorTime = new Date().toISOString();
        
        return { props, rawCount: 0, errors };
      }
      
      const data = await response.json() as any;
      
      // Parse SportsRadar props response
      const markets = data.players_props || data.markets || [];
      const rawCount = markets.length;
      
      for (const market of markets) {
        try {
          const playerName = market.player?.name || market.participant?.name || 'Unknown';
          const team = market.player?.team?.name || market.team?.name || null;
          const propType = mapPropType(market.market_type || market.type || '');
          
          // Get the line value from outcomes
          const outcomes = market.outcomes || market.selections || [];
          const overOutcome = outcomes.find((o: any) => 
            o.type?.toLowerCase().includes('over') || 
            o.name?.toLowerCase().includes('over')
          );
          
          const lineValue = overOutcome?.line || market.line || market.total || 0;
          
          if (playerName && lineValue > 0) {
            props.push({
              providerGameId: sportEventId,
              playerName,
              team,
              propType,
              lineValue
            });
          }
        } catch (err) {
          errors.push(`Error parsing prop: ${err}`);
        }
      }
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      providerHealth.totalCalls++;
      
      console.log(`[SportsRadar] Got ${props.length} props for event ${sportEventId}`);
      
      return { props, rawCount, errors };
      
    } catch (err) {
      const errorMsg = `Props Exception for ${sportEventId}: ${err}`;
      errors.push(errorMsg);
      providerHealth.failedCalls++;
      providerHealth.lastError = errorMsg;
      providerHealth.lastErrorTime = new Date().toISOString();
      
      return { props, rawCount: 0, errors };
    }
  }
  
  // ============================================
  // UTILITY METHODS
  // ============================================
  
  /**
   * Simple fetch with retry and exponential backoff
   * No queue - Cloudflare Workers are stateless so queues don't persist
   * Instead, rely on the caching layer (apiCacheService) to prevent duplicate calls
   */
  private async fetchWithRetry(url: string, maxRetries: number = 2): Promise<Response> {
    let lastError: Error | null = null;
    const TIMEOUT_MS = 15000; // 15 second timeout
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        providerHealth.totalCalls++;
        
        // Create AbortController for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Handle rate limiting (429) with exponential backoff
        if (response.status === 429) {
          if (attempt < maxRetries) {
            // Exponential backoff: 3s, 6s
            const waitMs = 3000 * Math.pow(2, attempt);
            console.log(`[SportsRadar] Rate limited (429), waiting ${waitMs/1000}s before retry ${attempt + 1}/${maxRetries}`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          // Return error response after retries exhausted
          return response;
        }
        
        // Don't retry on other 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          return response;
        }
        
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < maxRetries) {
          console.log(`[SportsRadar] Retry ${attempt + 1}/${maxRetries} after ${response.status}`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        
        return response;
        
      } catch (err) {
        lastError = err as Error;
        
        // Check if this was a timeout (AbortError)
        const isTimeout = lastError.name === 'AbortError' || lastError.message?.includes('abort');
        if (isTimeout) {
          console.log(`[SportsRadar] Request timeout after ${TIMEOUT_MS}ms, attempt ${attempt + 1}/${maxRetries + 1}`);
          providerHealth.failedCalls++;
        }
        
        if (attempt < maxRetries) {
          console.log(`[SportsRadar] Retry ${attempt + 1}/${maxRetries} after error: ${err}`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }
  
  // ============================================
  // TEST/DEBUG ENDPOINTS
  // ============================================
  
  /**
   * Test Golf API connectivity
   */
  async testGolfApi(): Promise<{
    success: boolean;
    status: number | null;
    data: any;
    error: string | null;
  }> {
    if (!this.config.golfApiKey) {
      return { success: false, status: null, data: null, error: 'Golf API key not configured' };
    }
    
    try {
      const year = new Date().getFullYear();
      const url = `${GOLF_API_BASE}/${this.config.accessLevel}/v3/${this.config.language}/schedules/pga/${year}/tournaments/schedule.json?api_key=${this.config.golfApiKey}`;
      
      const response = await fetch(url);
      const status = response.status;
      
      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (_e) { /* ignore */ }
        return { success: false, status, data: null, error: `HTTP ${status}: ${errorText.substring(0, 200)}` };
      }
      
      const data = await response.json() as { tournaments?: { name?: string }[]; season?: { year?: number } };
      return { 
        success: true, 
        status, 
        data: {
          tournamentsCount: data.tournaments?.length || 0,
          firstTournament: data.tournaments?.[0]?.name || null,
          season: data.season?.year || year
        }, 
        error: null 
      };
      
    } catch (err) {
      return { success: false, status: null, data: null, error: String(err) };
    }
  }
  
  /**
   * Test Props API connectivity with a sample event ID
   */
  async testPropsApi(sampleEventId?: string): Promise<{
    success: boolean;
    status: number | null;
    data: any;
    error: string | null;
  }> {
    if (!this.config.propsApiKey) {
      return { success: false, status: null, data: null, error: 'Props API key not configured' };
    }
    
    // Use a sample event ID or a test endpoint
    const eventId = sampleEventId || 'sr:sport_event:1234567'; // Placeholder
    
    try {
      const urls = buildPlayerPropsUrls(
        this.config.language,
        `sport_events/${eventId}/players_props.json?api_key=${this.config.propsApiKey}`,
        this.config.accessLevel
      );
      let response: Response | null = null;
      let status: number | null = null;
      for (const url of urls) {
        const current = await fetch(url);
        status = current.status;
        if (current.ok) {
          response = current;
          break;
        }
      }
      if (!response || !response.ok) {
        let errorText = '';
        try {
          if (response) errorText = await response.text();
        } catch (_e) { /* ignore */ }
        
        // 404 might just mean no props for this event, not necessarily an error
        if (status === 404) {
          return { 
            success: true, 
            status, 
            data: { message: 'API accessible, no props for this event (expected for test ID)' }, 
            error: null 
          };
        }
        
        return { success: false, status, data: null, error: `HTTP ${status}: ${errorText.substring(0, 200)}` };
      }
      
      const data = await response.json() as { players_props?: unknown[]; markets?: unknown[] };
      return { 
        success: true, 
        status: response.status, 
        data: {
          propsCount: data.players_props?.length || data.markets?.length || 0
        }, 
        error: null 
      };
      
    } catch (err) {
      return { success: false, status: null, data: null, error: String(err) };
    }
  }
  
  /**
   * Fetch player props by competition using the Player Props API
   * Endpoint: /oddscomparison-player-props/{access_level}/v2/en/competitions/{competition_id}/players_props.json
   * 
   * This fetches ALL player props for a sport's competition (more efficient than per-game)
   */
  async fetchPlayerPropsByCompetition(
    sport: SportKey,
    playerPropsApiKey: string,
    gameMapping?: Map<string, string> // Optional: map SportsRadar team names to our game IDs
  ): Promise<{
    props: NormalizedProp[];
    rawEvents: number;
    rawProps: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const props: NormalizedProp[] = [];
    
    const competitionIds = COMPETITION_IDS[sport];
    if (!competitionIds || competitionIds.length === 0) {
      errors.push(`No competition ID mapping for ${sport}`);
      return { props, rawEvents: 0, rawProps: 0, errors };
    }
    
    try {
      // Iterate through all mapped competition IDs and aggregate events.
      // Some sports (NCAAB/NCAAF) can have data split across multiple comps.
      let lastErrorText = '';
      const aggregatedEvents: any[] = [];
      const seenEventIds = new Set<string>();
      for (const competitionId of competitionIds) {
        console.log(`[SportsRadar] Fetching player props for ${sport} competition ${competitionId}`);

        const urls = buildPlayerPropsUrls(
          'en',
          `competitions/${competitionId}/players_props.json?api_key=${playerPropsApiKey}`,
          this.config.accessLevel
        );
        let response: Response | null = null;
        for (const url of urls) {
          const current = await this.fetchWithRetry(url);
          if (current.ok) {
            response = current;
            break;
          }
          const body = await current.text().catch(() => '');
          lastErrorText = `HTTP ${current.status} - ${body.substring(0, 200)}`;
        }
        if (!response) {
          errors.push(`Player Props API ${competitionId}: ${lastErrorText || 'No successful endpoint response'}`);
          continue;
        }

        try {
          const data = await response.json() as any;
          const sportEvents = data.competition_sport_events_players_props || [];
          for (const eventData of sportEvents) {
            const eventId = String(eventData?.sport_event?.id || '');
            if (!eventId || seenEventIds.has(eventId)) continue;
            seenEventIds.add(eventId);
            aggregatedEvents.push(eventData);
          }
          console.log(`[SportsRadar] ${sport} ${competitionId}: ${sportEvents.length} events (${aggregatedEvents.length} unique aggregated)`);
        } catch (parseErr) {
          errors.push(`Player Props API ${competitionId}: parse error ${String(parseErr)}`);
        }
      }

      if (aggregatedEvents.length === 0) {
        const errorMsg = `Player Props API: ${lastErrorText || 'No successful endpoint response'}`;
        errors.push(errorMsg);
        providerHealth.failedCalls++;
        providerHealth.lastError = errorMsg;
        providerHealth.lastErrorTime = new Date().toISOString();
        return { props, rawEvents: 0, rawProps: 0, errors };
      }

      // Response structure: competition_sport_events_players_props[]
      const sportEvents = aggregatedEvents;
      let rawPropsCount = 0;
      
      console.log(`[SportsRadar] Got ${sportEvents.length} events with player props`);
      
      for (const eventData of sportEvents) {
        try {
          const sportEvent = eventData.sport_event;
          const playersProps = eventData.players_props || [];
          
          if (!sportEvent?.id) continue;
          
          // Extract team names for matching to our games
          const competitors = sportEvent.competitors || [];
          const homeTeam = competitors.find((c: any) => c.qualifier === 'home');
          const awayTeam = competitors.find((c: any) => c.qualifier === 'away');
          
          const homeTeamName = homeTeam?.name || homeTeam?.abbreviation || '';
          const awayTeamName = awayTeam?.name || awayTeam?.abbreviation || '';
          
          // Try to match to our game ID if mapping provided
          let ourGameId = sportEvent.id; // Default to SR event ID
          
          if (gameMapping) {
            const normalizedHome = homeTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normalizedAway = awayTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // Try direct match
            const key1 = `${normalizedHome}_${normalizedAway}`;
            const key2 = `${normalizedAway}_${normalizedHome}`;
            
            if (gameMapping.has(key1)) {
              ourGameId = gameMapping.get(key1)!;
            } else if (gameMapping.has(key2)) {
              ourGameId = gameMapping.get(key2)!;
            } else {
              // Try partial match
              for (const [mapKey, gameId] of gameMapping.entries()) {
                if (mapKey.includes(normalizedHome) || mapKey.includes(normalizedAway)) {
                  ourGameId = gameId;
                  break;
                }
              }
            }
          }
          
          // Process each player's props
          for (const playerData of playersProps) {
            const player = playerData.player;
            const playerName = player?.name || 'Unknown';
            const playerId = player?.id || null;
            const competitorId = player?.competitor_id;
            
            // Determine player's team
            let playerTeam: string | null = null;
            if (competitorId && homeTeam?.id === competitorId) {
              playerTeam = homeTeamName;
            } else if (competitorId && awayTeam?.id === competitorId) {
              playerTeam = awayTeamName;
            }
            
            // Process each market (prop type)
            const markets = playerData.markets || [];
            for (const market of markets) {
              // Debug: Log raw market fields to identify correct field name
              if (rawPropsCount === 0) {
                console.log('[SportsRadar] Sample market fields:', Object.keys(market));
                console.log('[SportsRadar] Sample market data:', JSON.stringify(market).substring(0, 500));
              }
              const marketName = market.name || market.market_name || market.type || market.market_type || '';
              const propType = mapPropType(marketName);
              
              // Process each book's outcomes
              const books = market.books || [];
              for (const book of books) {
                const bookName = book.name || book.id || 'Unknown';
                const outcomes = book.outcomes || [];
                
                for (const outcome of outcomes) {
                  rawPropsCount++;
                  
                  const lineValue = parseFloat(outcome.total || outcome.handicap || '0');
                  if (lineValue <= 0) continue;
                  
                  // Only capture "over" outcomes (under is implied)
                  const outcomeType = outcome.type?.toLowerCase() || '';
                  if (outcomeType === 'under') continue;
                  
                  const oddsAmerican = outcome.odds_american || null;
                  const oddsDecimal = parseFloat(outcome.odds_decimal || '0') || null;
                  const openOdds = outcome.open_odds_american || null;
                  const openTotal = parseFloat(outcome.open_total || '0') || null;
                  const trend = outcome.trend || null; // 'up' or 'down'
                  
                  props.push({
                    providerGameId: ourGameId,
                    playerName,
                    playerId: playerId || undefined,
                    team: playerTeam,
                    propType,
                    lineValue,
                    sportsbook: bookName,
                    oddsAmerican: oddsAmerican ? parseInt(oddsAmerican, 10) : undefined,
                    oddsDecimal: oddsDecimal || undefined,
                    openLineValue: openTotal || undefined,
                    openOddsAmerican: openOdds ? parseInt(openOdds, 10) : undefined,
                    trend: trend as 'up' | 'down' | undefined,
                    marketName
                  });
                }
              }
            }
          }
        } catch (err) {
          errors.push(`Error parsing event props: ${err}`);
        }
      }
      
      providerHealth.successfulCalls++;
      providerHealth.lastSuccessfulCall = new Date().toISOString();
      providerHealth.totalCalls++;
      
      console.log(`[SportsRadar] Processed ${props.length} props from ${sportEvents.length} events (${rawPropsCount} raw)`);
      
      return { props, rawEvents: sportEvents.length, rawProps: rawPropsCount, errors };
      
    } catch (err) {
      const errorMsg = `Player Props Exception for ${sport}: ${err}`;
      errors.push(errorMsg);
      providerHealth.failedCalls++;
      providerHealth.lastError = errorMsg;
      providerHealth.lastErrorTime = new Date().toISOString();
      
      return { props, rawEvents: 0, rawProps: 0, errors };
    }
  }
  
  /**
   * Wrapper for fetchPlayerPropsByCompetition used by routes
   * Returns format expected by /api/sports-data/sportsradar/competition-props/:sport
   */
  async fetchCompetitionProps(
    sport: SportKey,
    playerPropsApiKey: string,
    gameMapping?: Map<string, string>
  ): Promise<{
    props: NormalizedProp[];
    eventsProcessed: number;
    errors: string[];
  }> {
    const result = await this.fetchPlayerPropsByCompetition(sport, playerPropsApiKey, gameMapping);
    return {
      props: result.props,
      eventsProcessed: result.rawEvents,
      errors: result.errors
    };
  }
  
  /**
   * Test Player Props API connectivity
   */
  async testPlayerPropsApi(
    sport: SportKey,
    playerPropsApiKey: string
  ): Promise<{
    success: boolean;
    status: number | null;
    data: any;
    error: string | null;
  }> {
    const competitionIds = COMPETITION_IDS[sport];
    if (!competitionIds || competitionIds.length === 0) {
      return { success: false, status: null, data: null, error: `No competition ID for ${sport}` };
    }
    
    try {
      console.log(`[SportsRadar] Testing Player Props API for ${sport}`);

      let response: Response | null = null;
      let status: number | null = null;
      for (const competitionId of competitionIds) {
        const urls = buildPlayerPropsUrls(
          'en',
          `competitions/${competitionId}/players_props.json?api_key=${playerPropsApiKey}`,
          this.config.accessLevel
        );
        for (const url of urls) {
          const current = await fetch(url, {
            headers: { 'Accept': 'application/json' }
          });
          status = current.status;
          if (current.ok) {
            response = current;
            break;
          }
        }
        if (response) break;
      }

      if (!response || !response.ok) {
        let errorText = '';
        try {
          if (response) errorText = await response.text();
        } catch (_e) { /* ignore */ }
        
        return { 
          success: false, 
          status, 
          data: null, 
          error: `HTTP ${status}: ${errorText.substring(0, 300)}` 
        };
      }
      
      const data = await response.json() as any;
      const events = data.competition_sport_events_players_props || [];
      
      // Count total props across all events
      let totalProps = 0;
      let totalPlayers = 0;
      const eventSummaries: Array<{ teams: string; players: number; props: number }> = [];
      
      for (const event of events.slice(0, 5)) { // Summarize first 5 events
        const sportEvent = event.sport_event;
        const playersProps = event.players_props || [];
        
        const competitors = sportEvent?.competitors || [];
        const home = competitors.find((c: any) => c.qualifier === 'home')?.name || '?';
        const away = competitors.find((c: any) => c.qualifier === 'away')?.name || '?';
        
        let eventPropsCount = 0;
        for (const pp of playersProps) {
          const markets = pp.markets || [];
          for (const m of markets) {
            const books = m.books || [];
            for (const b of books) {
              eventPropsCount += (b.outcomes || []).length;
            }
          }
        }
        
        totalPlayers += playersProps.length;
        totalProps += eventPropsCount;
        
        eventSummaries.push({
          teams: `${away} @ ${home}`,
          players: playersProps.length,
          props: eventPropsCount
        });
      }
      
      return {
        success: true,
        status: response.status,
        data: {
          totalEvents: events.length,
          totalPlayers,
          totalProps,
          sampleEvents: eventSummaries
        },
        error: null
      };
      
    } catch (err) {
      return { success: false, status: null, data: null, error: String(err) };
    }
  }
}

// ============================================
// DAILY SCHEDULE & BATCH PROPS METHODS
// ============================================

// Sport ID mapping for SportsRadar Odds Comparison API
const SPORTSRADAR_SPORT_IDS: Record<string, string> = {
  'NBA': 'sr:sport:2',      // Basketball
  'NFL': 'sr:sport:16',     // American Football
  'MLB': 'sr:sport:3',      // Baseball
  'NHL': 'sr:sport:4',      // Ice Hockey
  'NCAAB': 'sr:sport:2',    // Basketball (college)
  'NCAAF': 'sr:sport:16',   // American Football (college)
  'SOCCER': 'sr:sport:1',   // Soccer
  'MMA': 'sr:sport:117',    // MMA
  'TENNIS': 'sr:sport:5',   // Tennis
};

/**
 * Fetch daily schedule from SportsRadar Odds Comparison API
 * This gives us sport_event_ids we can use to fetch props
 */
export async function fetchDailySchedule(
  propsApiKey: string,
  sport: SportKey,
  date: Date
): Promise<{
  events: Array<{
    eventId: string;
    homeTeam: string;
    awayTeam: string;
    startTime: Date;
    status: string;
  }>;
  errors: string[];
}> {
  const errors: string[] = [];
  const events: Array<{
    eventId: string;
    homeTeam: string;
    awayTeam: string;
    startTime: Date;
    status: string;
  }> = [];
  
  const sportId = SPORTSRADAR_SPORT_IDS[sport];
  if (!sportId) {
    errors.push(`No SportsRadar sport ID mapping for ${sport}`);
    return { events, errors };
  }
  
  // Format date as YYYY-MM-DD in Eastern time for schedule endpoints.
  const dateStr = formatDateInTimeZoneYMD(date, "America/New_York");
  
  // SportsRadar Odds Comparison daily schedule endpoint
  // Format: /oddscomparison-liveodds/{access_level}/v2/{language}/schedules/{date}/schedule.json
  const url = `${ODDS_COMPARISON_BASE}/production/v2/en/schedules/${dateStr}/schedule.json?api_key=${propsApiKey}`;
  
  console.log(`[SportsRadar] Fetching daily schedule for ${dateStr}`);
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      // Try sport-specific endpoint instead
      const sportUrl = `${ODDS_COMPARISON_BASE}/production/v2/en/sports/${sportId}/schedules/${dateStr}/schedule.json?api_key=${propsApiKey}`;
      console.log(`[SportsRadar] Trying sport-specific schedule: ${sport}`);
      
      const sportResponse = await fetch(sportUrl, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!sportResponse.ok) {
        errors.push(`Schedule API: HTTP ${sportResponse.status}`);
        return { events, errors };
      }
      
      const sportData = await sportResponse.json() as any;
      const sportEvents = sportData.sport_events || sportData.schedule?.sport_events || [];
      
      for (const event of sportEvents) {
        try {
          const competitors = event.competitors || [];
          const home = competitors.find((c: any) => c.qualifier === 'home');
          const away = competitors.find((c: any) => c.qualifier === 'away');
          
          if (event.id && (home || away)) {
            events.push({
              eventId: event.id,
              homeTeam: home?.name || home?.abbreviation || 'Unknown',
              awayTeam: away?.name || away?.abbreviation || 'Unknown',
              startTime: event.scheduled ? new Date(event.scheduled) : new Date(),
              status: event.status || 'scheduled'
            });
          }
        } catch (err) {
          // Skip malformed events
        }
      }
      
      console.log(`[SportsRadar] Found ${events.length} ${sport} events from sport-specific endpoint`);
      return { events, errors };
    }
    
    const data = await response.json() as any;
    const allEvents = data.sport_events || data.schedule?.sport_events || [];
    
    // Filter to just our sport
    for (const event of allEvents) {
      try {
        // Check if this event matches our sport
        const eventSport = event.sport?.id || event.tournament?.sport?.id;
        if (eventSport && eventSport !== sportId) continue;
        
        const competitors = event.competitors || [];
        const home = competitors.find((c: any) => c.qualifier === 'home');
        const away = competitors.find((c: any) => c.qualifier === 'away');
        
        if (event.id && (home || away)) {
          events.push({
            eventId: event.id,
            homeTeam: home?.name || home?.abbreviation || 'Unknown',
            awayTeam: away?.name || away?.abbreviation || 'Unknown',
            startTime: event.scheduled ? new Date(event.scheduled) : new Date(),
            status: event.status || 'scheduled'
          });
        }
      } catch (err) {
        // Skip malformed events
      }
    }
    
    console.log(`[SportsRadar] Found ${events.length} ${sport} events for ${dateStr}`);
    return { events, errors };
    
  } catch (err) {
    errors.push(`Schedule fetch error: ${err}`);
    return { events, errors };
  }
}

/**
 * Fetch props for all daily events and match to our games by team names
 * Returns props with our providerGameId filled in where we can match
 */
export async function fetchDailyProps(
  provider: SportsRadarProvider,
  propsApiKey: string,
  sport: SportKey,
  date: Date,
  gameMapping: Map<string, string> // Map of "hometeam_awayteam" -> providerGameId
): Promise<FetchPropsResult> {
  const errors: string[] = [];
  const props: NormalizedProp[] = [];
  let totalRawCount = 0;
  
  // Step 1: Get daily schedule to find event IDs
  const schedule = await fetchDailySchedule(propsApiKey, sport, date);
  errors.push(...schedule.errors);
  
  if (schedule.events.length === 0) {
    console.log(`[SportsRadar] No schedule events found for ${sport}; falling back to competition props feed`);
    try {
      const competitionFallback = await provider.fetchCompetitionProps(sport, propsApiKey, gameMapping);
      errors.push(...competitionFallback.errors);
      return {
        props: competitionFallback.props,
        rawCount: competitionFallback.props.length,
        errors,
      };
    } catch (err) {
      errors.push(`Competition props fallback failed: ${err}`);
      return { props, rawCount: 0, errors };
    }
  }
  
  console.log(`[SportsRadar] Fetching props for ${schedule.events.length} ${sport} events`);
  
  // Step 2: Fetch props for each matched event.
  // Keep a high safety ceiling instead of an aggressive low cap so props
  // coverage does not get artificially truncated on busy slates.
  const MAX_EVENTS_PER_REFRESH = 80;
  const eventsToFetch = schedule.events.filter((event) => {
    const normalizedHome = event.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedAway = event.awayTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key1 = `${normalizedHome}_${normalizedAway}`;
    const key2 = `${normalizedAway}_${normalizedHome}`;
    if (gameMapping.has(key1) || gameMapping.has(key2)) return true;
    for (const [mapKey] of gameMapping.entries()) {
      if (mapKey.includes(normalizedHome) || mapKey.includes(normalizedAway)) return true;
    }
    return false;
  }).slice(0, MAX_EVENTS_PER_REFRESH);
  
  for (const event of eventsToFetch) {
    try {
      // Try to match this event to our games
      const normalizedHome = event.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedAway = event.awayTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Try various matching strategies
      let ourGameId: string | null = null;
      
      // Direct match
      const key1 = `${normalizedHome}_${normalizedAway}`;
      if (gameMapping.has(key1)) {
        ourGameId = gameMapping.get(key1)!;
      }
      
      // Try reversed (sometimes home/away is swapped)
      const key2 = `${normalizedAway}_${normalizedHome}`;
      if (!ourGameId && gameMapping.has(key2)) {
        ourGameId = gameMapping.get(key2)!;
      }
      
      // Try partial matches (just team name without city)
      if (!ourGameId) {
        for (const [mapKey, gameId] of gameMapping.entries()) {
          if (mapKey.includes(normalizedHome) || mapKey.includes(normalizedAway)) {
            ourGameId = gameId;
            break;
          }
        }
      }
      
      if (!ourGameId) {
        // Can't match this event to our games, skip
        continue;
      }
      
      // Fetch props for this event
      const result = await provider.fetchPropsForGame(event.eventId, sport);
      totalRawCount += result.rawCount;
      errors.push(...result.errors);
      
      // Add props with our game ID
      for (const prop of result.props) {
        props.push({
          ...prop,
          providerGameId: ourGameId
        });
      }
      
      // Small delay between API calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 120));
      
    } catch (err) {
      errors.push(`Error fetching props for event ${event.eventId}: ${err}`);
    }
  }
  
  console.log(`[SportsRadar] Fetched ${props.length} props for ${sport}`);
  return { props, rawCount: totalRawCount, errors };
}

// ============================================
// SINGLETON INSTANCE FACTORY
// ============================================

let instance: SportsRadarProvider | null = null;

export function getSportsRadarProvider(
  golfApiKey: string | null,
  propsApiKey: string | null
): SportsRadarProvider {
  if (!instance || 
      (golfApiKey && !providerHealth.golfApiConfigured) || 
      (propsApiKey && !providerHealth.propsApiConfigured)) {
    instance = new SportsRadarProvider(golfApiKey, propsApiKey);
  }
  return instance;
}

export function resetSportsRadarProvider(): void {
  instance = null;
  providerHealth = {
    golfApiConfigured: false,
    propsApiConfigured: false,
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    lastSuccessfulCall: null,
    lastError: null,
    lastErrorTime: null
  };
}

// ============================================
// D1 CACHED WRAPPERS
// ============================================

import { 
  cachedFetch, 
  API_CACHE_TTL, 
  getCacheStats as getApiCacheStats,
  clearExpiredCache 
} from '../apiCacheService';

/**
 * Cached version of fetchPlayerPropsByCompetition
 * Caches props data for 5 minutes
 */
export async function fetchPropsCached(
  db: D1Database,
  provider: SportsRadarProvider,
  sport: SportKey,
  playerPropsApiKey: string
): Promise<{
  props: NormalizedProp[];
  rawEvents: number;
  rawProps: number;
  errors: string[];
  fromCache: boolean;
}> {
  const result = await cachedFetch(
    db,
    'sportsradar',
    `props/${sport}`,
    API_CACHE_TTL.SR_PROPS,
    () => provider.fetchPlayerPropsByCompetition(sport, playerPropsApiKey)
  );
  
  return { ...result.data, fromCache: result.fromCache };
}

/**
 * Cached version of fetchStandings
 * Caches standings for 15 minutes
 */
export async function fetchStandingsCached(
  db: D1Database,
  sport: SportKey,
  apiKey: string,
  season?: number
): Promise<{
  teams: any[];
  conferences: any[];
  divisions: any[];
  errors: string[];
  fromCache: boolean;
}> {
  const provider = getSportsRadarProvider(apiKey, null);
  const result = await cachedFetch(
    db,
    'sportsradar',
    `standings/${sport}/${season || 'current'}`,
    API_CACHE_TTL.SR_STANDINGS,
    () => provider.fetchStandings(sport, apiKey, season)
  );
  
  return { ...result.data, fromCache: result.fromCache };
}

/**
 * Cached version of fetchTeamProfile
 * Caches team profile for 1 hour
 */
export async function fetchTeamProfileCached(
  db: D1Database,
  sport: SportKey,
  teamId: string,
  apiKey: string
): Promise<{
  team: any;
  roster: any[];
  venue: any;
  errors: string[];
  fromCache: boolean;
}> {
  const provider = getSportsRadarProvider(apiKey, null);
  const result = await cachedFetch(
    db,
    'sportsradar',
    `team/${sport}/${teamId}`,
    API_CACHE_TTL.SR_TEAM_PROFILE,
    () => provider.fetchTeamProfile(sport, teamId, apiKey)
  );
  
  return { ...result.data, fromCache: result.fromCache };
}

/**
 * Cached version of fetchGolfLeaderboard
 * Caches leaderboard for 2 minutes (live data)
 */
export async function fetchGolfLeaderboardCached(
  db: D1Database,
  provider: SportsRadarProvider,
  tournamentId: string
): Promise<{
  tournament: any;
  leaderboard: any[];
  errors: string[];
  fromCache: boolean;
}> {
  const result = await cachedFetch(
    db,
    'sportsradar',
    `golf/leaderboard/${tournamentId}`,
    API_CACHE_TTL.SR_GOLF_LEADERBOARD,
    () => provider.fetchGolfLeaderboard(tournamentId)
  );
  
  return { ...result.data, fromCache: result.fromCache };
}

/**
 * Export cache stats function for monitoring
 */
export async function getSportsRadarCacheStats(db: D1Database) {
  return getApiCacheStats(db);
}

/**
 * Clear expired cache entries
 */
export async function cleanupCache(db: D1Database): Promise<number> {
  return clearExpiredCache(db);
}
