/**
 * Scout Live Watch Output Formatter
 * 
 * Converts alert trigger data into standardized Scout Live Watch JSON output format.
 * All outputs include required fields: timestamps, sources, compliance notes, key points.
 */

import type {
  ScoutLiveWatchOutput,
  ScoringEventOutput,
  PeriodSummaryOutput,
  DominantPerformanceOutput,
  DataSource,
  ScoreState,
} from "../../../shared/types/scoutLiveWatch";

import {
  createScoutLiveWatchOutput,
  createDataSource,
  createScoreState,
  withComplianceNote,
  withMetadata,
} from "../../../shared/types/scoutLiveWatch";

import type { ScoringEvent } from "./scoringEventTrigger";
import type { PeriodBreakSummary } from "./periodBreakSummaryTrigger";
import type { DominantPerformance } from "./dominantPerformanceTrigger";
import { sanitizeCoachGText } from "../coachgCompliance";

// ============================================================================
// Scoring Event Formatting
// ============================================================================

/**
 * Extract league from sport string
 */
function extractLeague(sport: string): string {
  const s = sport.toUpperCase();
  if (s.includes('NFL')) return 'NFL';
  if (s.includes('NBA')) return 'NBA';
  if (s.includes('WNBA')) return 'WNBA';
  if (s.includes('MLB')) return 'MLB';
  if (s.includes('NHL')) return 'NHL';
  if (s.includes('MLS')) return 'MLS';
  if (s.includes('EPL') || s.includes('PREMIER')) return 'EPL';
  if (s.includes('NCAA')) return 'NCAA';
  return sport;
}

/**
 * Extract sport name from sport string
 */
function extractSportName(sport: string): string {
  if (sport.toLowerCase().includes('football')) return 'Football';
  if (sport.toLowerCase().includes('basketball')) return 'Basketball';
  if (sport.toLowerCase().includes('baseball')) return 'Baseball';
  if (sport.toLowerCase().includes('hockey')) return 'Hockey';
  if (sport.toLowerCase().includes('soccer')) return 'Soccer';
  return sport;
}

/**
 * Generate key points for scoring event
 */
function generateScoringEventKeyPoints(event: ScoringEvent): string[] {
  const keyPoints: string[] = [];
  const stats = event.stats || {};
  
  // Drive stats (NFL)
  if (stats.yardsOnDrive && stats.playsOnDrive) {
    keyPoints.push(`${stats.yardsOnDrive}-yard drive in ${stats.playsOnDrive} plays`);
  }
  
  // Momentum
  if (stats.scoringStreak && stats.scoringStreak >= 2) {
    keyPoints.push(`${event.scoringTeam} on a ${stats.scoringStreak}-score run`);
  }
  
  // Lead context
  const scoreDiff = Math.abs(event.homeScore - event.awayScore);
  const leader = event.homeScore > event.awayScore ? event.homeTeam : event.awayTeam;
  if (scoreDiff > 0) {
    keyPoints.push(`${leader} leads by ${scoreDiff} in ${event.period}`);
  } else {
    keyPoints.push(`Game tied at ${event.homeScore} in ${event.period}`);
  }
  
  // Market context (if available)
  if (stats.liveLineMovement) {
    const { previousLine, currentLine, asOf } = stats.liveLineMovement;
    const movement = currentLine > previousLine ? "+" : "";
    keyPoints.push(`Line moved from ${previousLine} to ${movement}${currentLine} (as of ${asOf})`);
  }
  
  return keyPoints;
}

/**
 * Determine points scored from event type
 */
function getPointsScored(eventType: string): number {
  switch (eventType) {
    case 'TOUCHDOWN': return 6;
    case 'FIELD_GOAL': return 3;
    case 'THREE_POINTER': return 3;
    case 'TWO_POINTER': return 2;
    case 'SAFETY': return 2;
    case 'EXTRA_POINT': return 1;
    case 'FREE_THROW': return 1;
    case 'GOAL':
    case 'POWER_PLAY_GOAL':
    case 'SHORT_HANDED_GOAL':
    case 'EMPTY_NET_GOAL':
    case 'SOCCER_GOAL':
    case 'PENALTY_GOAL':
    case 'RUN_SCORED':
    case 'HOME_RUN':
      return 1;
    default:
      return 1;
  }
}

function withCoachGVoicePrefix(commentary: string): string {
  const normalized = sanitizeCoachGText(commentary || "");
  if (normalized.toLowerCase().startsWith("coach g insight:")) return normalized;
  return sanitizeCoachGText(`Coach G Insight: ${normalized}`);
}

/**
 * Convert ScoringEvent to ScoringEventOutput
 */
export function formatScoringEventOutput(
  event: ScoringEvent,
  commentary: string,
  momentum: 'SURGE' | 'STEADY' | 'NEUTRAL'
): ScoringEventOutput {
  const league = extractLeague(event.sport);
  const sport = extractSportName(event.sport);
  const keyPoints = generateScoringEventKeyPoints(event);
  
  const scoreState: ScoreState = createScoreState(
    event.homeTeam,
    event.awayTeam,
    event.homeScore,
    event.awayScore,
    event.period,
    'IN_PROGRESS',
    event.timeRemaining
  );
  
  const sources: DataSource[] = [
    createDataSource('Live Scores Feed', event.detectedAt, {
      confidence: 95,
      dataPoints: ['score', 'game_state', 'period'],
    }),
  ];
  
  const baseOutput = createScoutLiveWatchOutput(
    'SCORE',
    sport,
    league,
    event.gameId,
    withCoachGVoicePrefix(commentary),
    keyPoints,
    scoreState,
    sources
  );
  
  const outputWithCompliance = withComplianceNote(baseOutput);
  
  const scoringEventOutput: ScoringEventOutput = {
    ...outputWithCompliance,
    alert_type: 'SCORE',
    scoring_details: {
      scoring_team: event.scoringTeam,
      event_type: event.eventType,
      player_name: event.playerName,
      points_scored: getPointsScored(event.eventType),
      momentum_indicator: momentum,
    },
  };
  
  // Add metadata
  const tags: string[] = [event.eventType.toLowerCase()];
  if (momentum === 'SURGE') tags.push('momentum_shift');
  
  return withMetadata(scoringEventOutput, {
    severity: momentum === 'SURGE' ? 'IMPACT' : 'NOTICE',
    tags,
    related_teams: [event.homeTeam, event.awayTeam],
    related_players: event.playerName ? [event.playerName] : undefined,
  }) as ScoringEventOutput;
}

// ============================================================================
// Period Summary Formatting
// ============================================================================

/**
 * Generate key points for period summary
 */
function generatePeriodSummaryKeyPoints(period: PeriodBreakSummary): string[] {
  const keyPoints: string[] = [];
  
  // Add score state
  if (period.homeScore === 0 && period.awayScore === 0) {
    keyPoints.push('Scoreless period');
  } else {
    keyPoints.push(`Score: ${period.awayTeam} ${period.awayScore}, ${period.homeTeam} ${period.homeScore}`);
  }
  
  // Add notable stats (limit to most important)
  if (period.stats) {
    const importantStats = Object.entries(period.stats)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 3);
    
    importantStats.forEach(([key, value]) => {
      const label = key.replace(/_/g, ' ');
      keyPoints.push(`${label}: ${value}`);
    });
  }
  
  return keyPoints;
}

/**
 * Convert PeriodBreakSummary to PeriodSummaryOutput
 */
export function formatPeriodSummaryOutput(
  period: PeriodBreakSummary,
  commentary: string
): PeriodSummaryOutput {
  const league = extractLeague(period.sport);
  const sport = extractSportName(period.sport);
  const keyPoints = generatePeriodSummaryKeyPoints(period);
  
  const scoreState: ScoreState = createScoreState(
    period.homeTeam,
    period.awayTeam,
    period.homeScore,
    period.awayScore,
    period.period,
    'IN_PROGRESS'
  );
  
  const sources: DataSource[] = [
    createDataSource('Live Scores Feed', period.detectedAt, {
      confidence: 95,
      dataPoints: ['score', 'period_stats'],
    }),
  ];
  
  const baseOutput = createScoutLiveWatchOutput(
    'PERIOD_SUMMARY',
    sport,
    league,
    period.gameId,
    withCoachGVoicePrefix(commentary),
    keyPoints,
    scoreState,
    sources
  );
  
  const outputWithCompliance = withComplianceNote(baseOutput);
  
  // Convert stats to notable_stats format
  const notable_stats = period.stats
    ? Object.entries(period.stats).map(([label, value]) => ({
        label,
        value: String(value),
      }))
    : [];
  
  const isScoreless = period.homeScore === 0 && period.awayScore === 0;
  
  const periodSummaryOutput: PeriodSummaryOutput = {
    ...outputWithCompliance,
    alert_type: 'PERIOD_SUMMARY',
    period_details: {
      period_name: period.period,
      is_scoreless: isScoreless,
      dominant_unit: undefined,
      notable_stats,
      what_to_watch_next: "Something bettors will notice: watch game pace, foul/penalty pressure, and live line reaction. Informational only.",
    },
  };
  
  return withMetadata(periodSummaryOutput, {
    severity: 'INFO',
    tags: ['period_summary', isScoreless ? 'scoreless' : 'scored'],
    related_teams: [period.homeTeam, period.awayTeam],
  }) as PeriodSummaryOutput;
}

// ============================================================================
// Dominant Performance Formatting
// ============================================================================

/**
 * Generate key points for dominant performance
 */
function generateDominantPerformanceKeyPoints(performance: DominantPerformance): string[] {
  const keyPoints: string[] = [];
  
  // Add stats
  if (performance.stats) {
    Object.entries(performance.stats)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 4)
      .forEach(([key, value]) => {
        const label = key.replace(/_/g, ' ');
        keyPoints.push(`${label}: ${value}`);
      });
  }
  
  return keyPoints;
}

/**
 * Convert DominantPerformance to DominantPerformanceOutput
 */
export function formatDominantPerformanceOutput(
  performance: DominantPerformance,
  commentary: string
): DominantPerformanceOutput {
  const league = extractLeague(performance.sport);
  const sport = extractSportName(performance.sport);
  const keyPoints = generateDominantPerformanceKeyPoints(performance);
  
  const scoreState: ScoreState = createScoreState(
    performance.homeTeam,
    performance.awayTeam,
    0, // DominantPerformance doesn't track scores
    0,
    performance.period || '',
    'IN_PROGRESS'
  );
  
  const sources: DataSource[] = [
    createDataSource('Live Stats Feed', performance.detectedAt, {
      confidence: 98,
      dataPoints: ['player_stats', 'team_stats'],
    }),
  ];
  
  const baseOutput = createScoutLiveWatchOutput(
    'DOMINANCE',
    sport,
    league,
    performance.gameId,
    withCoachGVoicePrefix(commentary),
    keyPoints,
    scoreState,
    sources
  );
  
  const outputWithCompliance = withComplianceNote(baseOutput);
  
  // Convert stats to array format
  const current_stats = performance.stats
    ? Object.entries(performance.stats).map(([label, value]) => ({
        label,
        value: typeof value === 'number' ? value : String(value),
      }))
    : [];
  
  const entity = performance.playerName || performance.teamKey || performance.homeTeam;
  
  const dominantPerformanceOutput: DominantPerformanceOutput = {
    ...outputWithCompliance,
    alert_type: 'DOMINANCE',
    performance_details: {
      performance_type: performance.performanceType,
      entity,
      threshold_crossed: `${performance.performanceType} detected`,
      current_stats,
      context: `${entity} showing exceptional performance as of ${performance.period || 'current period'}.`,
    },
  };
  
  return withMetadata(dominantPerformanceOutput, {
    severity: 'IMPACT',
    tags: ['dominant_performance', performance.performanceType.toLowerCase()],
    related_teams: [performance.homeTeam, performance.awayTeam],
    related_players: performance.playerName ? [performance.playerName] : undefined,
  }) as DominantPerformanceOutput;
}

// ============================================================================
// Generic Formatter
// ============================================================================

/**
 * Format any alert type to structured output
 */
export function formatScoutLiveWatchAlert(
  alertType: 'SCORE' | 'PERIOD_SUMMARY' | 'DOMINANCE',
  data: ScoringEvent | PeriodBreakSummary | DominantPerformance,
  commentary: string,
  additionalData?: Record<string, unknown>
): ScoutLiveWatchOutput {
  switch (alertType) {
    case 'SCORE':
      return formatScoringEventOutput(
        data as ScoringEvent,
        commentary,
        (additionalData?.momentum as 'SURGE' | 'STEADY' | 'NEUTRAL') || 'NEUTRAL'
      );
    
    case 'PERIOD_SUMMARY':
      return formatPeriodSummaryOutput(
        data as PeriodBreakSummary,
        commentary
      );
    
    case 'DOMINANCE':
      return formatDominantPerformanceOutput(
        data as DominantPerformance,
        commentary
      );
    
    default:
      throw new Error(`Unknown alert type: ${alertType}`);
  }
}
