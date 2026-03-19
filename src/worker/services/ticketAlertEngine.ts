/**
 * Ticket Alert Engine
 * 
 * Production-grade alert evaluation engine for bet tickets and watchboards.
 * Detects coverage changes, generates prioritized alerts, handles deduplication and throttling.
 * 
 * Powers:
 * - Push notifications (when app closed)
 * - In-app alert center (history log)
 * - Live in-app banner (when app open)
 */

import { D1Database } from '@cloudflare/workers-types';
import { 
  calculateLegStatus, 
  LegStatus, 
  calculateTicketStatus,
} from './legStatusEngine';
import { sendTicketAlertPush } from './webPushService';
import { normalizeCoachGAlertCopy, sanitizeCoachGText } from './coachgCompliance';

// ============================================================================
// TYPES
// ============================================================================

export type AlertPriority = 1 | 2 | 3;
export type AlertType = 
  | 'ticket_settled'       // Ticket won/lost/push (P1)
  | 'parlay_last_leg'      // Parlay final leg is live (P1)
  | 'cover_flip_clutch'    // Cover flip in final 2 minutes (P1)
  | 'game_final'           // Game ended with active leg (P1)
  | 'cover_flip'           // Cover flip mid-game (P2)
  | 'momentum_shift'       // 8-0 run affecting ticket (P2)
  | 'overtime_start'       // Overtime started (P2)
  | 'game_start'           // Tracked game started (P3)
  | 'lead_change'          // Watchboard lead change (P2)
  | 'buzzer_beater'        // Close game finish (P2)
  | 'major_run';           // Big scoring run (P2)

export type CoverState = 'covering' | 'not_covering' | 'pending' | 'won' | 'lost' | 'push';

export interface TicketAlert {
  user_id: string;
  alert_type: AlertType;
  priority: AlertPriority;
  title: string;
  message: string;
  deep_link: string;
  ticket_id?: number;
  event_id?: string;
  leg_id?: number;
}

interface AlertStateRecord {
  id: number;
  user_id: string;
  leg_id: number | null;
  event_id: string | null;
  last_status: string | null;
  last_margin: number | null;
  last_cover_state: string | null;
  last_alert_type: string | null;
  last_alert_at: string | null;
}

interface ThrottleRecord {
  last_sent_at: string;
  count_in_window: number;
}

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

interface BetTicket {
  id: number;
  user_id: string;
  title: string | null;
  status: string;
}

// ============================================================================
// PRIORITY DEFINITIONS
// ============================================================================

const PRIORITY_MAP: Record<AlertType, AlertPriority> = {
  ticket_settled: 1,
  parlay_last_leg: 1,
  cover_flip_clutch: 1,
  game_final: 1,
  cover_flip: 2,
  momentum_shift: 2,
  overtime_start: 2,
  lead_change: 2,
  buzzer_beater: 2,
  major_run: 2,
  game_start: 3,
};

// ============================================================================
// THROTTLING CONFIG
// ============================================================================

const THROTTLE_SECONDS: Record<string, number> = {
  cover_flip: 20,
  cover_flip_clutch: 20,
  lead_change: 20,
  momentum_shift: 45,
  major_run: 45,
  game_start: 60,
  overtime_start: 60,
  default: 20,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function legStatusToCoverState(status: LegStatus): CoverState {
  switch (status) {
    case 'Covering': return 'covering';
    case 'NotCovering': return 'not_covering';
    case 'Pending': return 'pending';
    case 'Won': return 'won';
    case 'Lost': return 'lost';
    case 'Push': return 'push';
    default: return 'pending';
  }
}

function isInFinalMinutes(game: GameData, minutesThreshold = 2): boolean {
  if (!game.period || !game.clock) return false;
  
  const period = game.period.toUpperCase();
  const sport = game.sport.toUpperCase();
  
  // Check if in final period
  const finalPeriods: Record<string, string[]> = {
    NBA: ['4TH', '4', 'OT', 'OVERTIME'],
    NFL: ['4TH', '4', 'OT', 'OVERTIME'],
    NCAAB: ['2ND', '2', 'OT', 'OVERTIME'],
    NHL: ['3RD', '3', 'OT', 'OVERTIME'],
    MLB: ['9TH', '9', '10TH', '11TH', '12TH'],
  };
  
  const isFinalPeriod = finalPeriods[sport]?.some(p => period.includes(p));
  if (!isFinalPeriod) return false;
  
  // Parse clock (format: "2:30" or "0:45")
  const clockMatch = String(game.clock).match(/(\d+):(\d+)/);
  if (!clockMatch) return false;
  
  const minutes = parseInt(clockMatch[1], 10);
  return minutes < minutesThreshold;
}

function formatMargin(margin: number, marketType: string): string {
  if (marketType === 'Spread') {
    return margin > 0 ? `+${margin.toFixed(1)}` : margin.toFixed(1);
  }
  return margin.toFixed(1);
}

function buildCoachGWatchboardMessage(text: string): string {
  return sanitizeCoachGText(`${text} Informational only for the G1 community.`);
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

async function getAlertState(
  db: D1Database,
  userId: string,
  legId?: number,
  eventId?: string
): Promise<AlertStateRecord | null> {
  if (legId) {
    return await db
      .prepare("SELECT * FROM alert_state_tracker WHERE user_id = ? AND leg_id = ?")
      .bind(userId, legId)
      .first<AlertStateRecord>();
  }
  if (eventId) {
    return await db
      .prepare("SELECT * FROM alert_state_tracker WHERE user_id = ? AND event_id = ? AND leg_id IS NULL")
      .bind(userId, eventId)
      .first<AlertStateRecord>();
  }
  return null;
}

async function updateAlertState(
  db: D1Database,
  userId: string,
  update: {
    legId?: number;
    eventId?: string;
    status?: string;
    margin?: number;
    coverState?: string;
    alertType?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  
  if (update.legId) {
    // Check if exists
    const existing = await getAlertState(db, userId, update.legId);
    if (existing) {
      await db
        .prepare(`
          UPDATE alert_state_tracker 
          SET last_status = ?, last_margin = ?, last_cover_state = ?, 
              last_alert_type = ?, last_alert_at = ?, updated_at = ?
          WHERE user_id = ? AND leg_id = ?
        `)
        .bind(
          update.status ?? existing.last_status,
          update.margin ?? existing.last_margin,
          update.coverState ?? existing.last_cover_state,
          update.alertType ?? existing.last_alert_type,
          now,
          now,
          userId,
          update.legId
        )
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO alert_state_tracker 
          (user_id, leg_id, event_id, last_status, last_margin, last_cover_state, last_alert_type, last_alert_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          userId,
          update.legId,
          update.eventId ?? null,
          update.status ?? null,
          update.margin ?? null,
          update.coverState ?? null,
          update.alertType ?? null,
          now,
          now,
          now
        )
        .run();
    }
  } else if (update.eventId) {
    const existing = await getAlertState(db, userId, undefined, update.eventId);
    if (existing) {
      await db
        .prepare(`
          UPDATE alert_state_tracker 
          SET last_status = ?, last_margin = ?, last_cover_state = ?, 
              last_alert_type = ?, last_alert_at = ?, updated_at = ?
          WHERE user_id = ? AND event_id = ? AND leg_id IS NULL
        `)
        .bind(
          update.status ?? existing.last_status,
          update.margin ?? existing.last_margin,
          update.coverState ?? existing.last_cover_state,
          update.alertType ?? existing.last_alert_type,
          now,
          now,
          userId,
          update.eventId
        )
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO alert_state_tracker 
          (user_id, leg_id, event_id, last_status, last_margin, last_cover_state, last_alert_type, last_alert_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          userId,
          null,
          update.eventId,
          update.status ?? null,
          update.margin ?? null,
          update.coverState ?? null,
          update.alertType ?? null,
          now,
          now,
          now
        )
        .run();
    }
  }
}

function shouldAlertForStateChange(
  previousState: AlertStateRecord | null,
  newCoverState: CoverState,
  alertType: AlertType
): boolean {
  // Always alert on first occurrence
  if (!previousState) return true;
  
  // Don't duplicate same alert type for same cover state
  if (previousState.last_cover_state === newCoverState && 
      previousState.last_alert_type === alertType) {
    return false;
  }
  
  return true;
}

// ============================================================================
// THROTTLING
// ============================================================================

async function isThrottled(
  db: D1Database,
  userId: string,
  eventId: string,
  alertCategory: string
): Promise<boolean> {
  const record = await db
    .prepare("SELECT * FROM alert_throttle WHERE user_id = ? AND event_id = ? AND alert_category = ?")
    .bind(userId, eventId, alertCategory)
    .first<ThrottleRecord>();
  
  if (!record) return false;
  
  const throttleSeconds = THROTTLE_SECONDS[alertCategory] ?? THROTTLE_SECONDS.default;
  const lastSent = new Date(record.last_sent_at).getTime();
  const now = Date.now();
  
  return (now - lastSent) < throttleSeconds * 1000;
}

async function recordAlertSent(
  db: D1Database,
  userId: string,
  eventId: string,
  alertCategory: string
): Promise<void> {
  const now = new Date().toISOString();
  
  // Upsert throttle record
  await db
    .prepare(`
      INSERT INTO alert_throttle (user_id, event_id, alert_category, last_sent_at, count_in_window, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id, event_id, alert_category) DO UPDATE SET
        last_sent_at = ?,
        count_in_window = count_in_window + 1,
        updated_at = ?
    `)
    .bind(userId, eventId, alertCategory, now, now, now, now, now)
    .run();
}

// ============================================================================
// ALERT CREATION
// ============================================================================

// Store env reference for push notifications
let _pushEnv: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string } | null = null;

export function setAlertEnv(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }): void {
  _pushEnv = env;
}

async function createAlert(
  db: D1Database,
  alert: TicketAlert,
  appOpen: boolean
): Promise<number> {
  const normalizedCopy = normalizeCoachGAlertCopy({
    title: alert.title,
    body: alert.message,
  });
  const result = await db
    .prepare(`
      INSERT INTO ticket_alerts 
      (user_id, alert_type, priority, title, message, deep_link, ticket_id, event_id, leg_id, 
       is_read, delivered_push, delivered_banner, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      alert.user_id,
      alert.alert_type,
      alert.priority,
      normalizedCopy.title,
      normalizedCopy.body || "",
      alert.deep_link,
      alert.ticket_id ?? null,
      alert.event_id ?? null,
      alert.leg_id ?? null,
      0, // delivered_push - will update after actual send
      appOpen ? 1 : 0  // delivered_banner
    )
    .run();
  
  const alertId = result.meta?.last_row_id ?? 0;
  
  // Send push notification if app is closed and we have env configured
  if (!appOpen && _pushEnv && (alert.priority === 1 || alert.priority === 2)) {
    try {
      const pushSent = await sendTicketAlertPush(db, _pushEnv, {
        user_id: alert.user_id,
        alert_type: alert.alert_type,
        priority: alert.priority,
        title: normalizedCopy.title,
        message: normalizedCopy.body || "",
        deep_link: alert.deep_link,
        ticket_id: alert.ticket_id,
        event_id: alert.event_id,
      });
      
      if (pushSent) {
        // Update delivered_push flag
        await db
          .prepare("UPDATE ticket_alerts SET delivered_push = 1 WHERE id = ?")
          .bind(alertId)
          .run();
      }
    } catch (error) {
      console.error("[TicketAlertEngine] Failed to send push:", error);
    }
  }
  
  return alertId;
}

// ============================================================================
// MAIN EVALUATION ENGINE
// ============================================================================

export interface EvaluationResult {
  alerts_generated: number;
  alerts_suppressed: number;
  legs_evaluated: number;
  tickets_evaluated: number;
  alerts: TicketAlert[];
}

/**
 * Evaluate all active tickets for a user and generate alerts
 */
export async function evaluateUserTickets(
  db: D1Database,
  userId: string,
  appOpen: boolean = false
): Promise<EvaluationResult> {
  const alerts: TicketAlert[] = [];
  let alertsSuppressed = 0;
  let legsEvaluated = 0;
  
  // Get all active tickets for user
  const tickets = await db
    .prepare("SELECT * FROM bet_tickets WHERE user_id = ? AND status = 'active'")
    .bind(userId)
    .all<BetTicket>();
  
  for (const ticket of tickets.results || []) {
    // Get all legs for this ticket
    const legs = await db
      .prepare("SELECT * FROM bet_ticket_legs WHERE ticket_id = ? ORDER BY leg_index ASC")
      .bind(ticket.id)
      .all<BetTicketLeg>();
    
    if (!legs.results || legs.results.length === 0) continue;
    
    const isParlay = legs.results.length > 1;
    const ticketTitle = ticket.title || `Ticket #${ticket.id}`;
    
    // Count legs by status
    const legStatusCounts = {
      pending: 0,
      live: 0,
      won: 0,
      lost: 0,
      push: 0,
    };
    
    // Get game data for all legs
    const eventIds = legs.results
      .filter(l => l.event_id)
      .map(l => l.event_id!);
    
    const gamesMap = new Map<string, GameData>();
    
    if (eventIds.length > 0) {
      const placeholders = eventIds.map(() => '?').join(',');
      const games = await db
        .prepare(`SELECT * FROM sdio_games WHERE provider_game_id IN (${placeholders})`)
        .bind(...eventIds)
        .all<GameData>();
      
      for (const game of games.results || []) {
        gamesMap.set(game.provider_game_id, game);
      }
    }
    
    // Evaluate each leg
    for (const leg of legs.results) {
      legsEvaluated++;
      
      const game = leg.event_id ? gamesMap.get(leg.event_id) || null : null;
      const legResult = calculateLegStatus(leg, game);
      const newCoverState = legStatusToCoverState(legResult.new_status);
      
      // Track status counts
      if (['Pending'].includes(legResult.new_status)) {
        legStatusCounts.pending++;
      } else if (['Covering', 'NotCovering'].includes(legResult.new_status)) {
        legStatusCounts.live++;
      } else if (legResult.new_status === 'Won') {
        legStatusCounts.won++;
      } else if (legResult.new_status === 'Lost') {
        legStatusCounts.lost++;
      } else if (legResult.new_status === 'Push') {
        legStatusCounts.push++;
      }
      
      // Get previous state
      const previousState = await getAlertState(db, userId, leg.id);
      const previousCoverState = previousState?.last_cover_state as CoverState | null;
      
      // Skip if no game or game not started
      if (!game || legResult.new_status === 'Pending') {
        continue;
      }
      
      // Detect cover flip
      if (previousCoverState && 
          previousCoverState !== newCoverState &&
          ['covering', 'not_covering'].includes(previousCoverState) &&
          ['covering', 'not_covering'].includes(newCoverState)) {
        
        const inClutch = isInFinalMinutes(game);
        const alertType: AlertType = inClutch ? 'cover_flip_clutch' : 'cover_flip';
        const eventId = leg.event_id || `ticket_${ticket.id}`;
        
        // Check throttle
        if (await isThrottled(db, userId, eventId, alertType)) {
          alertsSuppressed++;
          continue;
        }
        
        // Check deduplication
        if (!shouldAlertForStateChange(previousState, newCoverState, alertType)) {
          alertsSuppressed++;
          continue;
        }
        
        const coveringNow = newCoverState === 'covering';
        const marginStr = legResult.margin !== null ? formatMargin(legResult.margin, leg.market_type) : '';
        
        const alert: TicketAlert = {
          user_id: userId,
          alert_type: alertType,
          priority: PRIORITY_MAP[alertType],
          title: inClutch 
            ? `🚨 CLUTCH TIME: ${leg.team_or_player}`
            : `${coveringNow ? '✅' : '⚠️'} ${leg.team_or_player} ${coveringNow ? 'now covering' : 'no longer covering'}`,
          message: inClutch
            ? `${leg.team_or_player} ${coveringNow ? 'IS COVERING' : 'LOST THE COVER'} with under 2 min! ${marginStr}`
            : `${leg.market_type} ${leg.user_line_value ?? ''}: Currently ${marginStr}`,
          deep_link: `/watchboard?ticket=${ticket.id}`,
          ticket_id: ticket.id,
          event_id: leg.event_id ?? undefined,
          leg_id: leg.id,
        };
        
        alerts.push(alert);
        await createAlert(db, alert, appOpen);
        await recordAlertSent(db, userId, eventId, alertType);
        await updateAlertState(db, userId, {
          legId: leg.id,
          eventId: leg.event_id ?? undefined,
          status: legResult.new_status,
          margin: legResult.margin ?? undefined,
          coverState: newCoverState,
          alertType,
        });
      } else {
        // Update state tracking even without alert
        await updateAlertState(db, userId, {
          legId: leg.id,
          eventId: leg.event_id ?? undefined,
          status: legResult.new_status,
          margin: legResult.margin ?? undefined,
          coverState: newCoverState,
        });
      }
    }
    
    // Check for parlay last leg
    if (isParlay) {
      const allButOneFinal = legStatusCounts.won + legStatusCounts.push === legs.results.length - 1;
      const oneStillLive = legStatusCounts.live === 1;
      
      if (allButOneFinal && oneStillLive) {
        const liveLeg = legs.results.find(l => {
          const game = l.event_id ? gamesMap.get(l.event_id) : null;
          if (!game) return false;
          const status = calculateLegStatus(l, game);
          return ['Covering', 'NotCovering'].includes(status.new_status);
        });
        
        if (liveLeg) {
          const alertType: AlertType = 'parlay_last_leg';
          const eventId = liveLeg.event_id || `ticket_${ticket.id}`;
          
          if (!(await isThrottled(db, userId, eventId, alertType))) {
            const previousState = await getAlertState(db, userId, liveLeg.id);
            
            if (previousState?.last_alert_type !== 'parlay_last_leg') {
              const alert: TicketAlert = {
                user_id: userId,
                alert_type: alertType,
                priority: PRIORITY_MAP[alertType],
                title: `🎰 PARLAY LAST LEG LIVE!`,
                message: `${ticketTitle}: ${liveLeg.team_or_player} is your final leg!`,
                deep_link: `/watchboard?ticket=${ticket.id}`,
                ticket_id: ticket.id,
                event_id: liveLeg.event_id ?? undefined,
                leg_id: liveLeg.id,
              };
              
              alerts.push(alert);
              await createAlert(db, alert, appOpen);
              await recordAlertSent(db, userId, eventId, alertType);
              await updateAlertState(db, userId, {
                legId: liveLeg.id,
                alertType,
              });
            }
          }
        }
      }
    }
    
    // Check for ticket settlement
    const allFinal = legStatusCounts.live === 0 && legStatusCounts.pending === 0;
    if (allFinal && (legStatusCounts.won > 0 || legStatusCounts.lost > 0)) {
      const newTicketStatus = calculateTicketStatus(
        legs.results.map(l => {
          const game = l.event_id ? gamesMap.get(l.event_id) ?? null : null;
          return calculateLegStatus(l, game).new_status;
        })
      );
      
      if (newTicketStatus !== 'active') {
        const alertType: AlertType = 'ticket_settled';
        
        // Check if we already sent settlement alert
        const existingSettlement = await db
          .prepare("SELECT id FROM ticket_alerts WHERE ticket_id = ? AND alert_type = 'ticket_settled'")
          .bind(ticket.id)
          .first();
        
        if (!existingSettlement) {
          const alert: TicketAlert = {
            user_id: userId,
            alert_type: alertType,
            priority: PRIORITY_MAP[alertType],
            title: newTicketStatus === 'won' 
              ? `🎉 WINNER! ${ticketTitle}`
              : newTicketStatus === 'lost'
              ? `❌ ${ticketTitle} Lost`
              : `➖ ${ticketTitle} Pushed`,
            message: newTicketStatus === 'won'
              ? `All ${legs.results.length} legs hit!`
              : newTicketStatus === 'lost'
              ? `${legStatusCounts.lost} leg(s) lost`
              : `Ticket pushed`,
            deep_link: `/watchboard?ticket=${ticket.id}`,
            ticket_id: ticket.id,
          };
          
          alerts.push(alert);
          await createAlert(db, alert, appOpen);
        }
      }
    }
  }
  
  return {
    alerts_generated: alerts.length,
    alerts_suppressed: alertsSuppressed,
    legs_evaluated: legsEvaluated,
    tickets_evaluated: tickets.results?.length || 0,
    alerts,
  };
}

/**
 * Evaluate watchboard games for non-ticket alerts (lead changes, etc.)
 */
export async function evaluateWatchboardGames(
  db: D1Database,
  userId: string,
  appOpen: boolean = false
): Promise<EvaluationResult> {
  const alerts: TicketAlert[] = [];
  let alertsSuppressed = 0;
  
  // Get user's active watchboards
  const watchboards = await db
    .prepare("SELECT id FROM watchboards WHERE user_id = ? AND is_active = 1")
    .bind(userId)
    .all<{ id: number }>();
  
  if (!watchboards.results || watchboards.results.length === 0) {
    return { alerts_generated: 0, alerts_suppressed: 0, legs_evaluated: 0, tickets_evaluated: 0, alerts: [] };
  }
  
  const boardIds = watchboards.results.map(w => w.id);
  const placeholders = boardIds.map(() => '?').join(',');
  
  // Get all watchboard games
  const watchboardGames = await db
    .prepare(`SELECT DISTINCT game_id FROM watchboard_games WHERE watchboard_id IN (${placeholders})`)
    .bind(...boardIds)
    .all<{ game_id: string }>();
  
  if (!watchboardGames.results || watchboardGames.results.length === 0) {
    return { alerts_generated: 0, alerts_suppressed: 0, legs_evaluated: 0, tickets_evaluated: 0, alerts: [] };
  }
  
  // Get games that are NOT part of any ticket (those are handled by evaluateUserTickets)
  const ticketEventIds = await db
    .prepare(`
      SELECT DISTINCT btl.event_id 
      FROM bet_ticket_legs btl
      JOIN bet_tickets bt ON btl.ticket_id = bt.id
      WHERE bt.user_id = ? AND bt.status = 'active' AND btl.event_id IS NOT NULL
    `)
    .bind(userId)
    .all<{ event_id: string }>();
  
  const ticketEvents = new Set((ticketEventIds.results || []).map(r => r.event_id));
  const nonTicketGames = watchboardGames.results
    .map(g => g.game_id)
    .filter(id => !ticketEvents.has(id));
  
  if (nonTicketGames.length === 0) {
    return { alerts_generated: 0, alerts_suppressed: 0, legs_evaluated: 0, tickets_evaluated: 0, alerts: [] };
  }
  
  // Fetch game data
  const gameIdsForQuery = nonTicketGames.map(id => {
    // Extract provider_game_id from format like "sdio_nba_20023282"
    const parts = id.split('_');
    return parts.length >= 3 ? parts.slice(2).join('_') : id;
  });
  
  const gamePlaceholders = gameIdsForQuery.map(() => '?').join(',');
  const games = await db
    .prepare(`SELECT * FROM sdio_games WHERE provider_game_id IN (${gamePlaceholders})`)
    .bind(...gameIdsForQuery)
    .all<GameData>();
  
  // Evaluate each game for watchboard alerts
  for (const game of games.results || []) {
    const eventId = `sdio_${game.sport.toLowerCase()}_${game.provider_game_id}`;
    const previousState = await getAlertState(db, userId, undefined, eventId);
    
    const homeScore = game.score_home ?? 0;
    const awayScore = game.score_away ?? 0;
    const scoreDiff = homeScore - awayScore;
    const previousMargin = previousState?.last_margin ?? 0;
    
    // Detect lead change
    if (previousMargin !== null && previousMargin !== 0 && scoreDiff !== 0) {
      const leadChanged = (previousMargin > 0 && scoreDiff < 0) || (previousMargin < 0 && scoreDiff > 0);
      
      if (leadChanged) {
        const alertType: AlertType = 'lead_change';
        
        if (await isThrottled(db, userId, eventId, alertType)) {
          alertsSuppressed++;
          continue;
        }
        
        const newLeader = scoreDiff > 0 ? game.home_team : game.away_team;
        
        const alert: TicketAlert = {
          user_id: userId,
          alert_type: alertType,
          priority: PRIORITY_MAP[alertType],
          title: `Coach G Alert: Lead Change`,
          message: buildCoachGWatchboardMessage(
            `What's up G1. ${newLeader} just took the lead in ${game.away_team} at ${game.home_team} (${awayScore}-${homeScore}). Something bettors will notice: pace and possession shifts can drive live market reaction.`
          ),
          deep_link: `/games/${game.sport.toLowerCase()}/${eventId}`,
          event_id: eventId,
        };
        
        alerts.push(alert);
        await createAlert(db, alert, appOpen);
        await recordAlertSent(db, userId, eventId, alertType);
      }
    }
    
    // Detect overtime start
    const period = (game.period || '').toUpperCase();
    const isOvertime = period.includes('OT') || period.includes('OVERTIME');
    const wasOvertime = previousState?.last_status?.toUpperCase().includes('OT');
    
    if (isOvertime && !wasOvertime) {
      const alertType: AlertType = 'overtime_start';
      
      if (!(await isThrottled(db, userId, eventId, alertType))) {
        const alert: TicketAlert = {
          user_id: userId,
          alert_type: alertType,
          priority: PRIORITY_MAP[alertType],
          title: `Coach G Insight: Overtime`,
          message: buildCoachGWatchboardMessage(
            `Interesting matchup here. ${game.away_team} at ${game.home_team} is tied ${homeScore}-${awayScore} and heading to overtime. Watch fatigue, tempo, and late-game execution swings.`
          ),
          deep_link: `/games/${game.sport.toLowerCase()}/${eventId}`,
          event_id: eventId,
        };
        
        alerts.push(alert);
        await createAlert(db, alert, appOpen);
        await recordAlertSent(db, userId, eventId, alertType);
      }
    }
    
    // Update state tracking
    await updateAlertState(db, userId, {
      eventId,
      status: game.status,
      margin: scoreDiff,
    });
  }
  
  return {
    alerts_generated: alerts.length,
    alerts_suppressed: alertsSuppressed,
    legs_evaluated: 0,
    tickets_evaluated: 0,
    alerts,
  };
}

/**
 * Main entry point: evaluate all alerts for a user
 */
export async function evaluateAllAlerts(
  db: D1Database,
  userId: string,
  appOpen: boolean = false
): Promise<EvaluationResult> {
  const ticketResult = await evaluateUserTickets(db, userId, appOpen);
  const watchboardResult = await evaluateWatchboardGames(db, userId, appOpen);
  
  return {
    alerts_generated: ticketResult.alerts_generated + watchboardResult.alerts_generated,
    alerts_suppressed: ticketResult.alerts_suppressed + watchboardResult.alerts_suppressed,
    legs_evaluated: ticketResult.legs_evaluated,
    tickets_evaluated: ticketResult.tickets_evaluated,
    alerts: [...ticketResult.alerts, ...watchboardResult.alerts],
  };
}

/**
 * Get unread alerts for a user
 */
export async function getUnreadAlerts(
  db: D1Database,
  userId: string,
  limit: number = 50
): Promise<TicketAlert[]> {
  const result = await db
    .prepare(`
      SELECT * FROM ticket_alerts 
      WHERE user_id = ? AND is_read = 0 
      ORDER BY priority ASC, created_at DESC 
      LIMIT ?
    `)
    .bind(userId, limit)
    .all();
  
  return (result.results || []) as unknown as TicketAlert[];
}

/**
 * Mark alerts as read
 */
export async function markAlertsRead(
  db: D1Database,
  userId: string,
  alertIds?: number[]
): Promise<void> {
  if (alertIds && alertIds.length > 0) {
    const placeholders = alertIds.map(() => '?').join(',');
    await db
      .prepare(`UPDATE ticket_alerts SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(userId, ...alertIds)
      .run();
  } else {
    await db
      .prepare("UPDATE ticket_alerts SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0")
      .bind(userId)
      .run();
  }
}

/**
 * Evaluate alerts for ALL users with active tickets or watchboards
 * Called automatically after data refreshes
 */
export async function evaluateAllUsersWithActiveTickets(
  db: D1Database,
  env?: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }
): Promise<{ usersEvaluated: number; totalAlerts: number; errors: string[] }> {
  // Set env for push notifications if provided
  if (env) {
    setAlertEnv(env);
  }
  const errors: string[] = [];
  let totalAlerts = 0;
  
  try {
    // Get all users with active tickets
    const ticketUsers = await db
      .prepare(`
        SELECT DISTINCT user_id 
        FROM bet_tickets 
        WHERE status = 'active'
      `)
      .all<{ user_id: string }>();
    
    // Get all users with active watchboards (that have games)
    const watchboardUsers = await db
      .prepare(`
        SELECT DISTINCT w.user_id 
        FROM watchboards w
        JOIN watchboard_games wg ON w.id = wg.watchboard_id
        WHERE w.user_id IS NOT NULL
      `)
      .all<{ user_id: string }>();
    
    // Combine unique user IDs
    const allUserIds = new Set<string>();
    for (const row of ticketUsers.results || []) {
      if (row.user_id) allUserIds.add(row.user_id);
    }
    for (const row of watchboardUsers.results || []) {
      if (row.user_id) allUserIds.add(row.user_id);
    }
    
    console.log(`[AlertEngine] Evaluating alerts for ${allUserIds.size} users`);
    
    // Evaluate each user (limit concurrency to avoid overwhelming DB)
    const userIds = Array.from(allUserIds);
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(userId => evaluateAllAlerts(db, userId, false))
      );
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          totalAlerts += result.value.alerts_generated;
        } else {
          errors.push(`User ${batch[j]}: ${result.reason}`);
        }
      }
    }
    
    console.log(`[AlertEngine] Completed: ${userIds.length} users, ${totalAlerts} alerts generated`);
    
    return {
      usersEvaluated: userIds.length,
      totalAlerts,
      errors,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AlertEngine] Fatal error in batch evaluation:`, errMsg);
    errors.push(`Fatal: ${errMsg}`);
    return {
      usersEvaluated: 0,
      totalAlerts,
      errors,
    };
  }
}

/**
 * Get alert history for a user
 */
export async function getAlertHistory(
  db: D1Database,
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    ticketId?: number;
    priority?: AlertPriority;
  } = {}
): Promise<{ alerts: TicketAlert[]; total: number }> {
  const { limit = 50, offset = 0, ticketId, priority } = options;
  
  let query = "SELECT * FROM ticket_alerts WHERE user_id = ?";
  let countQuery = "SELECT COUNT(*) as count FROM ticket_alerts WHERE user_id = ?";
  const params: (string | number)[] = [userId];
  
  if (ticketId) {
    query += " AND ticket_id = ?";
    countQuery += " AND ticket_id = ?";
    params.push(ticketId);
  }
  
  if (priority) {
    query += " AND priority = ?";
    countQuery += " AND priority = ?";
    params.push(priority);
  }
  
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  
  const [alertsResult, countResult] = await Promise.all([
    db.prepare(query).bind(...params, limit, offset).all(),
    db.prepare(countQuery).bind(...params).first<{ count: number }>(),
  ]);
  
  return {
    alerts: (alertsResult.results || []) as unknown as TicketAlert[],
    total: countResult?.count || 0,
  };
}
