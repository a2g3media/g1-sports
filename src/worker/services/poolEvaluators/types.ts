/**
 * Universal Pool Evaluator Types
 * Defines the plugin interface for pool-type-specific status evaluation
 */

// Live event data structure
export interface LiveEventData {
  eventId: string;
  eventType: 'GAME' | 'MATCH' | 'FIGHT' | 'RACE';
  sportKey: string;
  status: 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINAL' | 'POSTPONED' | 'CANCELED';
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period?: string;
  clock?: string;
  startTime?: string;
  liveData?: Record<string, unknown>;
}

// User action within a pool
export interface PoolEntryAction {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  eventId: string;
  actionType: string;
  selectionId: string;
  selectionLabel: string;
  confidenceRank?: number;
  isLocked: boolean;
  result?: string;
  metadata?: Record<string, unknown>;
}

// Player status after evaluation
export type PlayerStatus = 
  | 'WINNING'      // Selection is currently winning
  | 'AT_RISK'      // Selection is currently losing, game still live
  | 'TIED'         // Game is tied, still in progress
  | 'SAFE'         // Final win or safe outcome
  | 'ELIMINATED'   // Final loss, eliminated from pool
  | 'PENDING'      // Game hasn't started yet
  | 'PUSHED'       // Game ended in tie/push (no win/loss)
  | 'UNKNOWN';     // Unable to determine status

// Evaluated player with status
export interface EvaluatedPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  selectionId: string;
  selectionLabel: string;
  status: PlayerStatus;
  statusReason?: string;
  confidenceRank?: number;
}

// Grouped impacts by selection
export interface SelectionGroup {
  selectionId: string;
  selectionLabel: string;
  side: 'HOME' | 'AWAY' | 'OTHER';
  players: EvaluatedPlayer[];
  count: number;
}

// Event card with all impacts
export interface LiveEventCard {
  eventId: string;
  eventType: string;
  sportKey: string;
  status: LiveEventData['status'];
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period?: string;
  clock?: string;
  startTime?: string;
  isTied: boolean;
  groupedImpacts: SelectionGroup[];
  totalPlayers: number;
}

// Pool context for evaluators
export interface PoolContext {
  poolId: number;
  poolType: string;
  formatKey: string;
  sportKey: string;
  periodId: string;
  rulesJson?: Record<string, unknown>;
}

/**
 * Pool Evaluator Interface
 * Each pool type implements this to determine player statuses
 */
export interface PoolEvaluator {
  // The pool type this evaluator handles (e.g., 'survivor', 'pickem', 'confidence')
  poolType: string;
  
  // Evaluate a single player's status given event data
  evaluatePlayerStatus(
    action: PoolEntryAction,
    event: LiveEventData,
    context: PoolContext
  ): PlayerStatus;
  
  // Get status reason text (optional)
  getStatusReason?(
    action: PoolEntryAction,
    event: LiveEventData,
    status: PlayerStatus
  ): string;
  
  // Determine which side a selection belongs to
  getSelectionSide(
    selectionId: string,
    event: LiveEventData
  ): 'HOME' | 'AWAY' | 'OTHER';
}

// Registry type for evaluators
export type EvaluatorRegistry = Map<string, PoolEvaluator>;
