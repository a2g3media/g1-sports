/**
 * Alert Trigger Engines
 * 
 * These modules detect significant events and create Scout alerts
 * for users who have opted in to notifications.
 */

// Re-export with explicit naming to avoid conflicts
export type { DataScope } from "./lineMovementTrigger";

export {
  analyzeLineMovement,
  createLineMovementAlert,
  getUsersForLineMovementAlerts,
  insertLineMovementAlert,
  triggerLineMovementAlerts,
  triggerLineMovementAlertsBatch,
  generateDemoLineMovement,
  type LineMovement,
  type LineMovementAlert,
  type LineMovementTriggerResult,
  type MarketType,
} from "./lineMovementTrigger";

export {
  analyzeInjuryUpdate,
  createInjuryAlert,
  getUsersForInjuryAlerts,
  insertInjuryAlert,
  triggerInjuryAlerts,
  triggerInjuryAlertsBatch,
  generateDemoInjuryUpdate,
  type InjuryUpdate,
  type InjuryAlert,
  type InjuryTriggerResult,
  type InjuryStatus,
  type ImpactRating,
} from "./injuryTrigger";

export {
  calculateWeatherImpact,
  createWeatherAlert,
  getUsersForWeatherAlerts,
  insertWeatherAlert,
  triggerWeatherAlerts,
  generateDemoWeatherConditions,
  type WeatherConditions,
  type WeatherAlert,
  type WeatherTriggerResult,
} from "./weatherTrigger";

export {
  analyzeGameStateChange,
  createGameStateAlert,
  getUsersForGameStateAlerts,
  insertGameStateAlert,
  triggerGameStateAlerts,
  generateDemoGameStateChange,
  type GameStateChange,
  type GameStateAlert,
  type GameStateTriggerResult,
} from "./gameStateTrigger";

export {
  createLockReminderAlert,
  createScheduleChangeAlert,
  insertScheduleAlert,
  getUsersNeedingLockReminders,
  getUsersForScheduleChangeAlerts,
  triggerLockReminderAlerts,
  triggerScheduleChangeAlerts,
  generateDemoLockReminder,
  generateDemoScheduleChange,
  type LockReminder,
  type ScheduleChange,
  type ScheduleAlert,
  type LockReminderTriggerResult,
  type ScheduleChangeTriggerResult,
} from "./scheduleTrigger";

export {
  analyzeDominantPerformance,
  createDominantPerformanceAlert,
  getUsersForDominantPerformanceAlerts,
  insertDominantPerformanceAlert,
  triggerDominantPerformanceAlerts,
  triggerDominantPerformanceAlertsBatch,
  generateDemoDominantPerformance,
  generateDemoPerformanceScenarios,
  type DominantPerformance,
  type DominantPerformanceAlert,
  type DominantPerformanceTriggerResult,
  type PerformanceType,
} from "./dominantPerformanceTrigger";

export {
  analyzePeriodBreak,
  createPeriodBreakAlert,
  getUsersForPeriodBreakAlerts,
  insertPeriodBreakAlert,
  triggerPeriodBreakAlerts,
  triggerPeriodBreakAlertsBatch,
  generateDemoPeriodBreak,
  generateDemoPeriodBreakScenarios,
  type PeriodBreakSummary,
  type PeriodBreakAlert,
  type PeriodBreakTriggerResult,
} from "./periodBreakSummaryTrigger";

export {
  analyzeMomentum,
  generateScoringCommentary,
  determineSeverity,
  createScoringEventAlert,
  getUsersForScoringEventAlerts,
  insertScoringEventAlert,
  triggerScoringEventAlerts,
  triggerScoringEventAlertsBatch,
  generateDemoScoringEvent,
  generateDemoScoringEventScenarios,
  type ScoringEvent,
  type ScoringEventAlert,
  type ScoringEventTriggerResult,
  type ScoringEventType,
} from "./scoringEventTrigger";
