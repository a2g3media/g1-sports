/**
 * Leg Status Engine
 * 
 * Calculates bet leg coverage status based on live game data.
 * Uses USER's line value (not current market line) to determine coverage.
 * 
 * Status progression:
 * - Pending: Game hasn't started
 * - Covering: Currently winning (in-progress games)
 * - NotCovering: Currently losing (in-progress games)
 * - Won: Final result - bet won
 * - Lost: Final result - bet lost
 * - Push: Final result - exact tie on the line
 */

import { D1Database } from '@cloudflare/workers-types';

// Types
export type LegStatus = 'Pending' | 'Covering' | 'NotCovering' | 'Won' | 'Lost' | 'Push';
export type TicketStatus = 'draft' | 'active' | 'won' | 'lost' | 'partial' | 'push' | 'void';

interface BetTicketLeg {
  id: number;
  ticket_id: number;
  leg_index: number;
  sport: string | null;
  league: string | null;
  event_id: string | null;
  team_or_player: string;
  opponent_or_context: string | null;
  market_type: string;
  side: string | null;
  user_line_value: number | null;
  user_odds: number | null;
  leg_status: string;
}

interface GameData {
  provider_game_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  status: string;
  score_home: number | null;
  score_away: number | null;
  period: string | null;
  clock: string | null;
}

interface LegCoverageResult {
  leg_id: number;
  previous_status: string;
  new_status: LegStatus;
  changed: boolean;
  current_value: number | null;
  margin: number | null;
  game_status: string | null;
  details: string;
}

// Game status normalization
const GAME_STATUS_MAP: Record<string, 'scheduled' | 'in_progress' | 'final'> = {
  'SCHEDULED': 'scheduled',
  'Scheduled': 'scheduled',
  'scheduled': 'scheduled',
  'PRE_GAME': 'scheduled',
  'PreGame': 'scheduled',
  
  'IN_PROGRESS': 'in_progress',
  'InProgress': 'in_progress',
  'in_progress': 'in_progress',
  'LIVE': 'in_progress',
  'Live': 'in_progress',
  'live': 'in_progress',
  '1ST_QUARTER': 'in_progress',
  '2ND_QUARTER': 'in_progress',
  '3RD_QUARTER': 'in_progress',
  '4TH_QUARTER': 'in_progress',
  '1ST_HALF': 'in_progress',
  '2ND_HALF': 'in_progress',
  'HALFTIME': 'in_progress',
  'Halftime': 'in_progress',
  'OVERTIME': 'in_progress',
  
  'FINAL': 'final',
  'Final': 'final',
  'final': 'final',
  'COMPLETED': 'final',
  'Completed': 'final',
  'F': 'final',
  'F/OT': 'final',
};

function normalizeGameStatus(status: string | null): 'scheduled' | 'in_progress' | 'final' | 'unknown' {
  if (!status) return 'unknown';
  return GAME_STATUS_MAP[status] || 'unknown';
}

/**
 * Calculate leg status for a spread bet
 */
function calculateSpreadStatus(
  leg: BetTicketLeg,
  game: GameData,
  gamePhase: 'in_progress' | 'final'
): { status: LegStatus; currentValue: number; margin: number; details: string } {
  const homeScore = game.score_home ?? 0;
  const awayScore = game.score_away ?? 0;
  const scoreDiff = homeScore - awayScore; // Positive = home winning
  const userLine = leg.user_line_value ?? 0;
  
  let actualMargin: number;
  let coverMargin: number;
  let details: string;
  
  if (leg.side === 'home') {
    // Home team bet: scoreDiff + userLine > 0 means covering
    // Example: Home -3.5, scoreDiff = +5 → 5 + (-3.5) = 1.5 > 0 ✓
    // Example: Home +3.5, scoreDiff = -2 → -2 + 3.5 = 1.5 > 0 ✓
    actualMargin = scoreDiff;
    coverMargin = scoreDiff + userLine;
    details = `Home ${homeScore}-${awayScore} (margin: ${scoreDiff > 0 ? '+' : ''}${scoreDiff}, need ${userLine > 0 ? '+' : ''}${-userLine})`;
  } else {
    // Away team bet: -scoreDiff + userLine > 0 means covering
    // Example: Away +3.5, scoreDiff = +2 → -2 + 3.5 = 1.5 > 0 ✓
    actualMargin = -scoreDiff;
    coverMargin = -scoreDiff + userLine;
    details = `Away ${awayScore}-${homeScore} (margin: ${-scoreDiff > 0 ? '+' : ''}${-scoreDiff}, need ${userLine > 0 ? '+' : ''}${-userLine})`;
  }
  
  if (gamePhase === 'final') {
    if (coverMargin > 0) {
      return { status: 'Won', currentValue: actualMargin, margin: coverMargin, details };
    } else if (coverMargin < 0) {
      return { status: 'Lost', currentValue: actualMargin, margin: coverMargin, details };
    } else {
      return { status: 'Push', currentValue: actualMargin, margin: coverMargin, details };
    }
  } else {
    // In progress
    if (coverMargin > 0) {
      return { status: 'Covering', currentValue: actualMargin, margin: coverMargin, details };
    } else if (coverMargin < 0) {
      return { status: 'NotCovering', currentValue: actualMargin, margin: coverMargin, details };
    } else {
      return { status: 'Covering', currentValue: actualMargin, margin: coverMargin, details }; // Tied on line = still alive
    }
  }
}

/**
 * Calculate leg status for a total (over/under) bet
 */
function calculateTotalStatus(
  leg: BetTicketLeg,
  game: GameData,
  gamePhase: 'in_progress' | 'final'
): { status: LegStatus; currentValue: number; margin: number; details: string } {
  const homeScore = game.score_home ?? 0;
  const awayScore = game.score_away ?? 0;
  const totalPoints = homeScore + awayScore;
  const userLine = leg.user_line_value ?? 0;
  
  let margin: number;
  let details: string;
  
  if (leg.side === 'over') {
    margin = totalPoints - userLine;
    details = `Total: ${totalPoints} points (need >${userLine} for Over)`;
  } else {
    margin = userLine - totalPoints;
    details = `Total: ${totalPoints} points (need <${userLine} for Under)`;
  }
  
  if (gamePhase === 'final') {
    if (margin > 0) {
      return { status: 'Won', currentValue: totalPoints, margin, details };
    } else if (margin < 0) {
      return { status: 'Lost', currentValue: totalPoints, margin, details };
    } else {
      return { status: 'Push', currentValue: totalPoints, margin, details };
    }
  } else {
    if (margin > 0) {
      return { status: 'Covering', currentValue: totalPoints, margin, details };
    } else if (margin < 0) {
      return { status: 'NotCovering', currentValue: totalPoints, margin, details };
    } else {
      return { status: leg.side === 'over' ? 'NotCovering' : 'Covering', currentValue: totalPoints, margin, details };
    }
  }
}

/**
 * Calculate leg status for a moneyline bet
 */
function calculateMoneylineStatus(
  leg: BetTicketLeg,
  game: GameData,
  gamePhase: 'in_progress' | 'final'
): { status: LegStatus; currentValue: number; margin: number; details: string } {
  const homeScore = game.score_home ?? 0;
  const awayScore = game.score_away ?? 0;
  const scoreDiff = homeScore - awayScore;
  
  let isWinning: boolean;
  let details: string;
  
  if (leg.side === 'home') {
    isWinning = scoreDiff > 0;
    details = `Home ${homeScore}-${awayScore} (${scoreDiff > 0 ? 'leading' : scoreDiff < 0 ? 'trailing' : 'tied'})`;
  } else {
    isWinning = scoreDiff < 0;
    details = `Away ${awayScore}-${homeScore} (${-scoreDiff > 0 ? 'leading' : -scoreDiff < 0 ? 'trailing' : 'tied'})`;
  }
  
  if (gamePhase === 'final') {
    if (scoreDiff === 0) {
      // Tie in regulation - depends on sport (NFL regular season can tie, most others go to OT)
      // For now, treat as Push
      return { status: 'Push', currentValue: scoreDiff, margin: 0, details };
    }
    return { status: isWinning ? 'Won' : 'Lost', currentValue: scoreDiff, margin: scoreDiff, details };
  } else {
    if (scoreDiff === 0) {
      return { status: 'Pending', currentValue: 0, margin: 0, details }; // Tied = pending
    }
    return { status: isWinning ? 'Covering' : 'NotCovering', currentValue: scoreDiff, margin: scoreDiff, details };
  }
}

/**
 * Calculate leg status for a single leg
 */
export function calculateLegStatus(
  leg: BetTicketLeg,
  game: GameData | null
): LegCoverageResult {
  const previousStatus = leg.leg_status;
  
  // No game data - stay pending
  if (!game) {
    return {
      leg_id: leg.id,
      previous_status: previousStatus,
      new_status: 'Pending',
      changed: previousStatus !== 'Pending',
      current_value: null,
      margin: null,
      game_status: null,
      details: 'Game data not available',
    };
  }
  
  const gamePhase = normalizeGameStatus(game.status);
  
  // Game hasn't started yet
  if (gamePhase === 'scheduled') {
    return {
      leg_id: leg.id,
      previous_status: previousStatus,
      new_status: 'Pending',
      changed: previousStatus !== 'Pending',
      current_value: null,
      margin: null,
      game_status: game.status,
      details: 'Game has not started',
    };
  }
  
  // Unknown status - keep current
  if (gamePhase === 'unknown') {
    return {
      leg_id: leg.id,
      previous_status: previousStatus,
      new_status: previousStatus as LegStatus,
      changed: false,
      current_value: null,
      margin: null,
      game_status: game.status,
      details: `Unknown game status: ${game.status}`,
    };
  }
  
  // Calculate based on market type
  let result: { status: LegStatus; currentValue: number; margin: number; details: string };
  
  switch (leg.market_type) {
    case 'Spread':
      result = calculateSpreadStatus(leg, game, gamePhase);
      break;
    case 'Total':
      result = calculateTotalStatus(leg, game, gamePhase);
      break;
    case 'Moneyline':
      result = calculateMoneylineStatus(leg, game, gamePhase);
      break;
    case 'Player Prop':
      // Player props require different data source - mark as pending for now
      result = {
        status: 'Pending',
        currentValue: 0,
        margin: 0,
        details: 'Player prop tracking not yet implemented',
      };
      break;
    default:
      result = {
        status: 'Pending',
        currentValue: 0,
        margin: 0,
        details: `Unknown market type: ${leg.market_type}`,
      };
  }
  
  return {
    leg_id: leg.id,
    previous_status: previousStatus,
    new_status: result.status,
    changed: previousStatus !== result.status,
    current_value: result.currentValue,
    margin: result.margin,
    game_status: game.status,
    details: result.details,
  };
}

/**
 * Calculate overall ticket status from leg statuses
 */
export function calculateTicketStatus(legStatuses: LegStatus[]): TicketStatus {
  if (legStatuses.length === 0) return 'active';
  
  const finalStatuses = ['Won', 'Lost', 'Push'];
  const allFinal = legStatuses.every(s => finalStatuses.includes(s));
  
  if (!allFinal) {
    // At least one leg still in progress or pending
    return 'active';
  }
  
  // All legs are final - calculate ticket result
  const wonCount = legStatuses.filter(s => s === 'Won').length;
  const lostCount = legStatuses.filter(s => s === 'Lost').length;
  const pushCount = legStatuses.filter(s => s === 'Push').length;
  
  if (lostCount > 0) {
    // Any loss = ticket lost (for parlays)
    return 'lost';
  }
  
  if (pushCount === legStatuses.length) {
    // All pushes = ticket push
    return 'push';
  }
  
  if (wonCount + pushCount === legStatuses.length) {
    // All won or pushed = ticket won (pushes reduce payout but still win)
    return 'won';
  }
  
  // Mixed result
  return 'partial';
}

/**
 * Process all legs for a ticket and update statuses
 */
export async function processTicketLegs(
  db: D1Database,
  ticketId: number
): Promise<{
  ticket_id: number;
  legs_processed: number;
  legs_changed: number;
  ticket_status_changed: boolean;
  new_ticket_status: TicketStatus;
  results: LegCoverageResult[];
}> {
  // Get all legs for this ticket
  const legs = await db
    .prepare("SELECT * FROM bet_ticket_legs WHERE ticket_id = ? ORDER BY leg_index ASC")
    .bind(ticketId)
    .all<BetTicketLeg>();
  
  if (!legs.results || legs.results.length === 0) {
    return {
      ticket_id: ticketId,
      legs_processed: 0,
      legs_changed: 0,
      ticket_status_changed: false,
      new_ticket_status: 'active',
      results: [],
    };
  }
  
  // Get game data for all legs with event_ids
  const eventIds = legs.results
    .filter(l => l.event_id)
    .map(l => l.event_id!);
  
  const gamesMap = new Map<string, GameData>();
  
  if (eventIds.length > 0) {
    // Fetch all games in one query
    const placeholders = eventIds.map(() => '?').join(',');
    const games = await db
      .prepare(`SELECT * FROM sdio_games WHERE provider_game_id IN (${placeholders})`)
      .bind(...eventIds)
      .all<GameData>();
    
    for (const game of games.results || []) {
      gamesMap.set(game.provider_game_id, game);
    }
  }
  
  // Calculate status for each leg
  const results: LegCoverageResult[] = [];
  let legsChanged = 0;
  
  for (const leg of legs.results) {
    const game = leg.event_id ? gamesMap.get(leg.event_id) || null : null;
    const result = calculateLegStatus(leg, game);
    results.push(result);
    
    if (result.changed) {
      legsChanged++;
      // Update leg status in database
      await db
        .prepare("UPDATE bet_ticket_legs SET leg_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(result.new_status, leg.id)
        .run();
    }
  }
  
  // Calculate and update ticket status
  const newLegStatuses = results.map(r => r.new_status);
  const newTicketStatus = calculateTicketStatus(newLegStatuses);
  
  // Get current ticket status
  const ticket = await db
    .prepare("SELECT status FROM bet_tickets WHERE id = ?")
    .bind(ticketId)
    .first<{ status: string }>();
  
  const ticketStatusChanged = ticket?.status !== newTicketStatus && ticket?.status !== 'draft';
  
  if (ticketStatusChanged) {
    await db
      .prepare("UPDATE bet_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(newTicketStatus, ticketId)
      .run();
  }
  
  return {
    ticket_id: ticketId,
    legs_processed: results.length,
    legs_changed: legsChanged,
    ticket_status_changed: ticketStatusChanged,
    new_ticket_status: newTicketStatus,
    results,
  };
}

/**
 * Process all active tickets for a user
 */
export async function processUserTickets(
  db: D1Database,
  userId: string
): Promise<{
  user_id: string;
  tickets_processed: number;
  total_legs_changed: number;
  results: Array<{
    ticket_id: number;
    legs_processed: number;
    legs_changed: number;
    new_status: TicketStatus;
  }>;
}> {
  // Get all active tickets for user
  const tickets = await db
    .prepare("SELECT id FROM bet_tickets WHERE user_id = ? AND status = 'active'")
    .bind(userId)
    .all<{ id: number }>();
  
  const results: Array<{
    ticket_id: number;
    legs_processed: number;
    legs_changed: number;
    new_status: TicketStatus;
  }> = [];
  
  let totalLegsChanged = 0;
  
  for (const ticket of tickets.results || []) {
    const result = await processTicketLegs(db, ticket.id);
    totalLegsChanged += result.legs_changed;
    results.push({
      ticket_id: ticket.id,
      legs_processed: result.legs_processed,
      legs_changed: result.legs_changed,
      new_status: result.new_ticket_status,
    });
  }
  
  return {
    user_id: userId,
    tickets_processed: results.length,
    total_legs_changed: totalLegsChanged,
    results,
  };
}

/**
 * Process all active tickets (for background refresh)
 */
export async function processAllActiveTickets(
  db: D1Database
): Promise<{
  tickets_processed: number;
  total_legs_changed: number;
  tickets_settled: number;
}> {
  // Get all active tickets
  const tickets = await db
    .prepare("SELECT id FROM bet_tickets WHERE status = 'active'")
    .all<{ id: number }>();
  
  let totalLegsChanged = 0;
  let ticketsSettled = 0;
  
  for (const ticket of tickets.results || []) {
    const result = await processTicketLegs(db, ticket.id);
    totalLegsChanged += result.legs_changed;
    if (result.ticket_status_changed && result.new_ticket_status !== 'active') {
      ticketsSettled++;
    }
  }
  
  return {
    tickets_processed: tickets.results?.length || 0,
    total_legs_changed: totalLegsChanged,
    tickets_settled: ticketsSettled,
  };
}
