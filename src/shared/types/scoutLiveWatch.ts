/**
 * Scout Live Watch - Structured JSON Output Format
 * 
 * All Scout Live Watch alerts must use this standardized format
 * to ensure consistency, compliance, and quality across all alert types.
 * 
 * Requirements:
 * - Timestamps with timezone info
 * - Data source attribution
 * - Compliance notes when needed
 * - Structured key points for easy parsing
 * - Optional visual components
 */

// ============================================================================
// Alert Types
// ============================================================================

export type ScoutLiveAlertType = 
  | 'SCORE'              // Scoring event (touchdown, goal, basket, etc.)
  | 'PERIOD_SUMMARY'     // Period/quarter/inning break summary
  | 'DOMINANCE'          // Dominant performance watch
  | 'GAME_STATE'         // Game state change (start, final, OT, etc.)
  | 'MOMENTUM_SHIFT';    // Significant momentum change

// ============================================================================
// Structured Output Format
// ============================================================================

export interface ScoutLiveWatchOutput {
  // Core identifiers
  alert_type: ScoutLiveAlertType;
  sport: string;
  league: string;
  event_id: string;
  
  // Content
  summary: string;                    // Main commentary/headline
  key_points: string[];               // Bulleted insights
  
  // Game state
  score_state: ScoreState;
  
  // Visual components (optional)
  visuals?: VisualComponent[];
  
  // Source attribution (required)
  sources_used: DataSource[];
  
  // Timestamp (required)
  as_of: string;                      // ISO 8601 with timezone
  
  // Compliance (when needed)
  compliance_note?: string;
  
  // Additional metadata
  metadata?: {
    severity?: 'INFO' | 'NOTICE' | 'IMPACT' | 'CRITICAL';
    tags?: string[];
    related_players?: string[];
    related_teams?: string[];
  };
}

// ============================================================================
// Score State
// ============================================================================

export interface ScoreState {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  period: string;                     // "Q1", "3rd Inning", "1st Half", etc.
  time_remaining?: string;
  game_status: GameStatus;
}

export type GameStatus = 
  | 'PREGAME'
  | 'IN_PROGRESS'
  | 'HALFTIME'
  | 'FINAL'
  | 'OVERTIME'
  | 'DELAYED'
  | 'POSTPONED';

// ============================================================================
// Visual Components
// ============================================================================

export type VisualComponentType = 
  | 'SCORE_CARD'         // Current score display
  | 'TIMELINE'           // Scoring timeline
  | 'STAT_COMPARISON'    // Team/player stats
  | 'MOMENTUM_CHART'     // Momentum visualization
  | 'PLAY_DIAGRAM';      // Play visualization

export interface VisualComponent {
  type: VisualComponentType;
  data: Record<string, unknown>;
  display_priority?: number;  // 1 = highest
}

// ============================================================================
// Data Sources
// ============================================================================

export interface DataSource {
  source: string;                     // "ESPN API", "OddsAPI", "Live Scores Feed"
  last_updated: string;               // ISO 8601
  confidence?: number;                // 0-100
  data_points?: string[];             // What data came from this source
}

// ============================================================================
// Alert Type-Specific Structures
// ============================================================================

/**
 * Scoring Event Output
 */
export interface ScoringEventOutput extends ScoutLiveWatchOutput {
  alert_type: 'SCORE';
  scoring_details: {
    scoring_team: string;
    event_type: string;               // "TOUCHDOWN", "THREE_POINTER", "GOAL", etc.
    player_name?: string;
    points_scored: number;
    momentum_indicator: 'SURGE' | 'STEADY' | 'NEUTRAL';
  };
}

/**
 * Period Summary Output
 */
export interface PeriodSummaryOutput extends ScoutLiveWatchOutput {
  alert_type: 'PERIOD_SUMMARY';
  period_details: {
    period_name: string;              // "End of Q1", "Halftime", "End of 3rd"
    is_scoreless: boolean;
    dominant_unit?: string;           // "Ravens defense", "Padres pitching"
    notable_stats: {
      label: string;
      value: string;
    }[];
    what_to_watch_next: string;       // Non-predictive, informational
  };
}

/**
 * Dominant Performance Output
 */
export interface DominantPerformanceOutput extends ScoutLiveWatchOutput {
  alert_type: 'DOMINANCE';
  performance_details: {
    performance_type: string;         // "NO_HITTER_WATCH", "DEFENSIVE_DOMINANCE", etc.
    entity: string;                   // Team or player name
    threshold_crossed: string;        // What milestone was reached
    current_stats: {
      label: string;
      value: string | number;
    }[];
    context: string;                  // Why this is notable
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a basic structured output with required fields
 */
export function createScoutLiveWatchOutput(
  alertType: ScoutLiveAlertType,
  sport: string,
  league: string,
  eventId: string,
  summary: string,
  keyPoints: string[],
  scoreState: ScoreState,
  sourcesUsed: DataSource[]
): ScoutLiveWatchOutput {
  return {
    alert_type: alertType,
    sport,
    league,
    event_id: eventId,
    summary,
    key_points: keyPoints,
    score_state: scoreState,
    sources_used: sourcesUsed,
    as_of: new Date().toISOString(),
  };
}

/**
 * Add compliance note to output
 */
export function withComplianceNote(
  output: ScoutLiveWatchOutput,
  note?: string
): ScoutLiveWatchOutput {
  const defaultNote = "Scout provides informational commentary only. Not betting advice.";
  return {
    ...output,
    compliance_note: note || defaultNote,
  };
}

/**
 * Add visual components to output
 */
export function withVisuals(
  output: ScoutLiveWatchOutput,
  visuals: VisualComponent[]
): ScoutLiveWatchOutput {
  return {
    ...output,
    visuals,
  };
}

/**
 * Add metadata to output
 */
export function withMetadata(
  output: ScoutLiveWatchOutput,
  metadata: NonNullable<ScoutLiveWatchOutput['metadata']>
): ScoutLiveWatchOutput {
  return {
    ...output,
    metadata: {
      ...output.metadata,
      ...metadata,
    },
  };
}

/**
 * Create a data source entry
 */
export function createDataSource(
  source: string,
  lastUpdated: string | Date = new Date(),
  options?: {
    confidence?: number;
    dataPoints?: string[];
  }
): DataSource {
  return {
    source,
    last_updated: typeof lastUpdated === 'string' ? lastUpdated : lastUpdated.toISOString(),
    confidence: options?.confidence,
    data_points: options?.dataPoints,
  };
}

/**
 * Create a score state object
 */
export function createScoreState(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  period: string,
  gameStatus: GameStatus = 'IN_PROGRESS',
  timeRemaining?: string
): ScoreState {
  return {
    home_team: homeTeam,
    away_team: awayTeam,
    home_score: homeScore,
    away_score: awayScore,
    period,
    time_remaining: timeRemaining,
    game_status: gameStatus,
  };
}

/**
 * Create a visual component
 */
export function createVisualComponent(
  type: VisualComponentType,
  data: Record<string, unknown>,
  displayPriority?: number
): VisualComponent {
  return {
    type,
    data,
    display_priority: displayPriority,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a Scout Live Watch output
 */
export function validateScoutLiveWatchOutput(
  output: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!output || typeof output !== 'object') {
    errors.push('Output must be an object');
    return { valid: false, errors };
  }
  
  const o = output as Partial<ScoutLiveWatchOutput>;
  
  // Required fields
  if (!o.alert_type) errors.push('Missing alert_type');
  if (!o.sport) errors.push('Missing sport');
  if (!o.league) errors.push('Missing league');
  if (!o.event_id) errors.push('Missing event_id');
  if (!o.summary) errors.push('Missing summary');
  if (!o.key_points || !Array.isArray(o.key_points)) errors.push('Missing or invalid key_points');
  if (!o.score_state) errors.push('Missing score_state');
  if (!o.sources_used || !Array.isArray(o.sources_used)) errors.push('Missing or invalid sources_used');
  if (!o.as_of) errors.push('Missing as_of timestamp');
  
  // Validate sources_used has at least one source
  if (o.sources_used && Array.isArray(o.sources_used) && o.sources_used.length === 0) {
    errors.push('sources_used must contain at least one data source');
  }
  
  // Validate as_of is valid ISO 8601
  if (o.as_of) {
    const date = new Date(o.as_of);
    if (isNaN(date.getTime())) {
      errors.push('as_of must be a valid ISO 8601 timestamp');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize to JSON string with pretty formatting
 */
export function serializeScoutLiveWatchOutput(
  output: ScoutLiveWatchOutput,
  pretty = true
): string {
  return JSON.stringify(output, null, pretty ? 2 : 0);
}

/**
 * Parse from JSON string
 */
export function parseScoutLiveWatchOutput(
  json: string
): ScoutLiveWatchOutput {
  return JSON.parse(json) as ScoutLiveWatchOutput;
}

// ============================================================================
// Example Outputs
// ============================================================================

/**
 * Generate example scoring event output
 */
export function generateExampleScoringEventOutput(): ScoringEventOutput {
  return {
    alert_type: 'SCORE',
    sport: 'Football',
    league: 'NFL',
    event_id: 'game_12345',
    summary: 'Ravens touchdown! Baltimore 21, San Francisco 14.',
    key_points: [
      '75-yard drive in 8 plays',
      'Ravens on a 2-score run',
      'Baltimore leads by 7 in Q2',
    ],
    score_state: createScoreState('Ravens', '49ers', 21, 14, 'Q2', 'IN_PROGRESS', '8:42'),
    scoring_details: {
      scoring_team: 'Ravens',
      event_type: 'TOUCHDOWN',
      player_name: 'Lamar Jackson',
      points_scored: 6,
      momentum_indicator: 'SURGE',
    },
    sources_used: [
      createDataSource('ESPN Live Scores', new Date(), {
        confidence: 95,
        dataPoints: ['score', 'game_state', 'drive_stats'],
      }),
    ],
    as_of: new Date().toISOString(),
    compliance_note: 'Scout provides informational commentary only. Not betting advice.',
    metadata: {
      severity: 'IMPACT',
      tags: ['touchdown', 'scoring_run', 'momentum_shift'],
      related_teams: ['Ravens', '49ers'],
      related_players: ['Lamar Jackson'],
    },
  };
}

/**
 * Generate example period summary output
 */
export function generateExamplePeriodSummaryOutput(): PeriodSummaryOutput {
  return {
    alert_type: 'PERIOD_SUMMARY',
    sport: 'Football',
    league: 'NFL',
    event_id: 'game_12345',
    summary: 'End of Q1 — scoreless. Ravens defense limited SF to 45 yards.',
    key_points: [
      'Ravens defense: 45 total yards allowed',
      '3 three-and-outs forced',
      'Weather has shifted play-calling toward run-heavy approach',
    ],
    score_state: createScoreState('Ravens', '49ers', 0, 0, 'End of Q1', 'IN_PROGRESS'),
    period_details: {
      period_name: 'End of Q1',
      is_scoreless: true,
      dominant_unit: 'Ravens defense',
      notable_stats: [
        { label: 'Total yards allowed', value: '45' },
        { label: 'Third down conversions', value: '0/3' },
        { label: 'Time of possession', value: '9:12 SF, 5:48 BAL' },
      ],
      what_to_watch_next: 'Weather conditions expected to persist. Focus on ground game efficiency.',
    },
    sources_used: [
      createDataSource('ESPN Live Scores', new Date(), { confidence: 95 }),
      createDataSource('Weather API', new Date(), { confidence: 90 }),
    ],
    as_of: new Date().toISOString(),
    compliance_note: 'Scout provides informational commentary only. Not betting advice.',
    metadata: {
      severity: 'INFO',
      tags: ['period_summary', 'defensive_performance', 'weather_impact'],
      related_teams: ['Ravens', '49ers'],
    },
  };
}

/**
 * Generate example dominant performance output
 */
export function generateExampleDominantPerformanceOutput(): DominantPerformanceOutput {
  return {
    alert_type: 'DOMINANCE',
    sport: 'Baseball',
    league: 'MLB',
    event_id: 'game_67890',
    summary: 'No-hitter watch begins: Padres starter has 6 strikeouts, no hits allowed.',
    key_points: [
      'Pitch count remains low (52 through 5 innings)',
      'Facing minimum batters (1 walk, 1 error)',
      'Last no-hitter in this stadium: 2019',
    ],
    score_state: createScoreState('Padres', 'Dodgers', 2, 0, 'End of 5th', 'IN_PROGRESS'),
    performance_details: {
      performance_type: 'NO_HITTER_WATCH',
      entity: 'Padres starting pitcher',
      threshold_crossed: 'No hits through 5 innings',
      current_stats: [
        { label: 'Hits allowed', value: 0 },
        { label: 'Strikeouts', value: 6 },
        { label: 'Walks', value: 1 },
        { label: 'Pitch count', value: 52 },
      ],
      context: 'Efficient outing with minimal baserunners. Pitch count suggests ability to complete game.',
    },
    sources_used: [
      createDataSource('MLB Stats API', new Date(), {
        confidence: 98,
        dataPoints: ['pitch_by_pitch', 'box_score'],
      }),
    ],
    as_of: new Date().toISOString(),
    compliance_note: 'Scout provides informational commentary only. Not betting advice.',
    metadata: {
      severity: 'IMPACT',
      tags: ['no_hitter_watch', 'dominant_pitching', 'milestone'],
      related_teams: ['Padres', 'Dodgers'],
    },
  };
}
