/**
 * Player Alert Engine
 * 
 * Alert engine for followed players on watchboards.
 * Detects prop hits, pace projections, and performance trends.
 * 
 * Integrates with the existing ticket alert system and shares:
 * - ticket_alerts table (with player_id field)
 * - Push notification infrastructure
 * - Alert state tracking
 */

import { D1Database } from '@cloudflare/workers-types';
import { sendTicketAlertPush } from './webPushService';

function propsPlayerDeepLink(sport: string, _playerName: string, rawPlayerId: string | null | undefined): string {
  const id = String(rawPlayerId ?? "").trim();
  if (!/^\d{4,}$/.test(id)) return "/props";
  const s = String(sport || "nba").toLowerCase();
  return `/props/player/${s}/${encodeURIComponent(id)}`;
}

// ============================================================================
// TYPES
// ============================================================================

export type PlayerAlertPriority = 1 | 2 | 3;
export type PlayerAlertType = 
  | 'prop_hit'           // Player reached their tracked prop line (P1)
  | 'prop_exceeded'      // Player exceeded prop line significantly (P1)
  | 'pace_on_track'      // Mid-game: on pace to hit prop (P2)
  | 'pace_behind'        // Mid-game: falling behind pace (P2)
  | 'pace_ahead'         // Mid-game: ahead of pace (P2)
  | 'hot_streak'         // Player on hot streak (last 3+ games above avg) (P2)
  | 'cold_streak'        // Player on cold streak (P2)
  | 'game_start'         // Followed player's game started (P3)
  | 'double_double'      // Player achieved double-double (P1)
  | 'triple_double';     // Player achieved triple-double (P1)

export interface PlayerAlert {
  user_id: string;
  alert_type: PlayerAlertType;
  priority: PlayerAlertPriority;
  title: string;
  message: string;
  deep_link: string;
  player_id?: string;
  player_name?: string;
  event_id?: string;
  sport?: string;
}

interface WatchboardPlayer {
  id: number;
  watchboard_id: number;
  user_id: string;
  player_name: string;
  player_id: string | null;
  sport: string;
  team: string | null;
  team_abbr: string | null;
  position: string | null;
  prop_type: string | null;
  prop_line: number | null;
  prop_selection: string | null;
  current_stat_value: number | null;
  is_active: number;
}

interface PlayerGameStats {
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  minutes?: number;
  threes?: number;
  // Football
  passing_yards?: number;
  rushing_yards?: number;
  receiving_yards?: number;
  touchdowns?: number;
  // Baseball
  hits?: number;
  home_runs?: number;
  rbis?: number;
  strikeouts?: number;
  // Hockey
  goals?: number;
  shots?: number;
  saves?: number;
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
  quarter?: number;
  half?: number;
}

interface PlayerAlertState {
  id: number;
  user_id: string;
  player_id: string;
  event_id: string | null;
  last_stat_value: number | null;
  last_alert_type: string | null;
  last_alert_at: string | null;
  prop_hit_alerted: number;
  pace_alert_phase: string | null;
}

// ============================================================================
// PRIORITY DEFINITIONS
// ============================================================================

const PRIORITY_MAP: Record<PlayerAlertType, PlayerAlertPriority> = {
  prop_hit: 1,
  prop_exceeded: 1,
  double_double: 1,
  triple_double: 1,
  pace_on_track: 2,
  pace_behind: 2,
  pace_ahead: 2,
  hot_streak: 2,
  cold_streak: 2,
  game_start: 3,
};

// ============================================================================
// THROTTLING CONFIG
// ============================================================================

const THROTTLE_SECONDS: Record<PlayerAlertType, number> = {
  prop_hit: 0,          // Never throttle - only fires once
  prop_exceeded: 300,   // 5 min between "exceeded" alerts
  double_double: 0,     // Never throttle
  triple_double: 0,     // Never throttle
  pace_on_track: 600,   // 10 min between pace alerts
  pace_behind: 300,     // 5 min
  pace_ahead: 600,      // 10 min
  hot_streak: 86400,    // Once per day
  cold_streak: 86400,   // Once per day
  game_start: 0,        // Never throttle
};

// ============================================================================
// PROP TYPE TO STAT MAPPING
// ============================================================================

const PROP_TO_STAT: Record<string, keyof PlayerGameStats> = {
  'POINTS': 'points',
  'REBOUNDS': 'rebounds',
  'ASSISTS': 'assists',
  'STEALS': 'steals',
  'BLOCKS': 'blocks',
  'THREES': 'threes',
  '3PM': 'threes',
  'PRA': 'points', // Will need custom handling for combined stats
  'PR': 'points',
  'PA': 'points',
  'RA': 'rebounds',
  // Football
  'PASSING_YARDS': 'passing_yards',
  'RUSHING_YARDS': 'rushing_yards',
  'RECEIVING_YARDS': 'receiving_yards',
  'TOUCHDOWNS': 'touchdowns',
  // Baseball
  'HITS': 'hits',
  'HOME_RUNS': 'home_runs',
  'RBIS': 'rbis',
  'STRIKEOUTS': 'strikeouts',
  // Hockey
  'GOALS': 'goals',
  'SHOTS': 'shots',
  'SAVES': 'saves',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getGameProgressPercent(game: GameData): number {
  const sport = game.sport?.toUpperCase() || '';
  const period = game.period?.toUpperCase() || '';
  const quarter = game.quarter || 0;
  
  // NBA: 4 quarters, 12 min each = 48 min
  if (sport === 'NBA') {
    if (period.includes('1ST') || quarter === 1) return 0.25;
    if (period.includes('2ND') || quarter === 2) return 0.50;
    if (period.includes('3RD') || quarter === 3) return 0.75;
    if (period.includes('4TH') || quarter === 4) return 0.90;
    if (period.includes('OT')) return 1.0;
    return 0.5; // Default mid-game
  }
  
  // NFL: 4 quarters
  if (sport === 'NFL') {
    if (period.includes('1ST') || quarter === 1) return 0.25;
    if (period.includes('2ND') || quarter === 2) return 0.50;
    if (period.includes('3RD') || quarter === 3) return 0.75;
    if (period.includes('4TH') || quarter === 4) return 0.90;
    if (period.includes('OT')) return 1.0;
    return 0.5;
  }
  
  // NCAAB: 2 halves
  if (sport === 'NCAAB') {
    if (period.includes('1ST') || game.half === 1) return 0.45;
    if (period.includes('2ND') || game.half === 2) return 0.90;
    return 0.5;
  }
  
  // NHL: 3 periods
  if (sport === 'NHL') {
    if (period.includes('1ST')) return 0.33;
    if (period.includes('2ND')) return 0.66;
    if (period.includes('3RD')) return 0.90;
    if (period.includes('OT')) return 1.0;
    return 0.5;
  }
  
  // MLB: 9 innings (use period as inning number)
  if (sport === 'MLB') {
    const inning = parseInt(period) || 5;
    return Math.min(inning / 9, 1.0);
  }
  
  return 0.5; // Default
}

function calculatePaceProjection(
  currentValue: number,
  gameProgress: number,
  propLine: number
): { projected: number; onPace: boolean; margin: number } {
  if (gameProgress <= 0) {
    return { projected: 0, onPace: false, margin: -propLine };
  }
  
  // Project to end of game
  const projected = currentValue / gameProgress;
  const margin = projected - propLine;
  const onPace = projected >= propLine;
  
  return { projected, onPace, margin };
}

function getCombinedStatValue(stats: PlayerGameStats, propType: string): number {
  switch (propType) {
    case 'PRA':
      return (stats.points || 0) + (stats.rebounds || 0) + (stats.assists || 0);
    case 'PR':
      return (stats.points || 0) + (stats.rebounds || 0);
    case 'PA':
      return (stats.points || 0) + (stats.assists || 0);
    case 'RA':
      return (stats.rebounds || 0) + (stats.assists || 0);
    default:
      const statKey = PROP_TO_STAT[propType];
      return statKey ? (stats[statKey] as number) || 0 : 0;
  }
}

function isDoubleDouble(stats: PlayerGameStats): boolean {
  const categories = [
    stats.points || 0,
    stats.rebounds || 0,
    stats.assists || 0,
    stats.steals || 0,
    stats.blocks || 0,
  ];
  return categories.filter(v => v >= 10).length >= 2;
}

function isTripleDouble(stats: PlayerGameStats): boolean {
  const categories = [
    stats.points || 0,
    stats.rebounds || 0,
    stats.assists || 0,
    stats.steals || 0,
    stats.blocks || 0,
  ];
  return categories.filter(v => v >= 10).length >= 3;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

async function getPlayerAlertState(
  db: D1Database,
  userId: string,
  playerId: string,
  eventId?: string
): Promise<PlayerAlertState | null> {
  if (eventId) {
    return await db
      .prepare(`
        SELECT * FROM player_alert_state 
        WHERE user_id = ? AND player_id = ? AND event_id = ?
      `)
      .bind(userId, playerId, eventId)
      .first<PlayerAlertState>();
  }
  
  return await db
    .prepare(`
      SELECT * FROM player_alert_state 
      WHERE user_id = ? AND player_id = ? AND event_id IS NULL
    `)
    .bind(userId, playerId)
    .first<PlayerAlertState>();
}

async function updatePlayerAlertState(
  db: D1Database,
  userId: string,
  playerId: string,
  update: {
    eventId?: string;
    statValue?: number;
    alertType?: string;
    propHitAlerted?: boolean;
    paceAlertPhase?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  
  const existing = await getPlayerAlertState(db, userId, playerId, update.eventId);
  
  if (existing) {
    await db
      .prepare(`
        UPDATE player_alert_state 
        SET last_stat_value = COALESCE(?, last_stat_value),
            last_alert_type = COALESCE(?, last_alert_type),
            last_alert_at = ?,
            prop_hit_alerted = COALESCE(?, prop_hit_alerted),
            pace_alert_phase = COALESCE(?, pace_alert_phase),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        update.statValue ?? null,
        update.alertType ?? null,
        now,
        update.propHitAlerted !== undefined ? (update.propHitAlerted ? 1 : 0) : null,
        update.paceAlertPhase ?? null,
        now,
        existing.id
      )
      .run();
  } else {
    await db
      .prepare(`
        INSERT INTO player_alert_state 
        (user_id, player_id, event_id, last_stat_value, last_alert_type, last_alert_at, 
         prop_hit_alerted, pace_alert_phase, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        playerId,
        update.eventId ?? null,
        update.statValue ?? null,
        update.alertType ?? null,
        now,
        update.propHitAlerted ? 1 : 0,
        update.paceAlertPhase ?? null,
        now,
        now
      )
      .run();
  }
}

// ============================================================================
// THROTTLING
// ============================================================================

async function isPlayerAlertThrottled(
  db: D1Database,
  userId: string,
  playerId: string,
  alertType: PlayerAlertType
): Promise<boolean> {
  const throttleSeconds = THROTTLE_SECONDS[alertType];
  if (throttleSeconds === 0) return false;
  
  const record = await db
    .prepare(`
      SELECT last_sent_at FROM player_alert_throttle 
      WHERE user_id = ? AND player_id = ? AND alert_type = ?
    `)
    .bind(userId, playerId, alertType)
    .first<{ last_sent_at: string }>();
  
  if (!record) return false;
  
  const lastSent = new Date(record.last_sent_at).getTime();
  const now = Date.now();
  
  return (now - lastSent) < throttleSeconds * 1000;
}

async function recordPlayerAlertSent(
  db: D1Database,
  userId: string,
  playerId: string,
  alertType: PlayerAlertType
): Promise<void> {
  const now = new Date().toISOString();
  
  await db
    .prepare(`
      INSERT INTO player_alert_throttle (user_id, player_id, alert_type, last_sent_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, player_id, alert_type) DO UPDATE SET
        last_sent_at = ?,
        updated_at = ?
    `)
    .bind(userId, playerId, alertType, now, now, now, now, now)
    .run();
}

// ============================================================================
// ALERT CREATION
// ============================================================================

let _pushEnv: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string } | null = null;

export function setPlayerAlertEnv(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }): void {
  _pushEnv = env;
}

async function createPlayerAlert(
  db: D1Database,
  alert: PlayerAlert,
  appOpen: boolean
): Promise<number> {
  // Store in ticket_alerts table (shared infrastructure)
  const result = await db
    .prepare(`
      INSERT INTO ticket_alerts 
      (user_id, alert_type, priority, title, message, deep_link, event_id, 
       is_read, delivered_push, delivered_banner, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      alert.user_id,
      alert.alert_type,
      alert.priority,
      alert.title,
      alert.message,
      alert.deep_link,
      alert.event_id ?? null,
      0,
      appOpen ? 1 : 0
    )
    .run();
  
  const alertId = result.meta?.last_row_id ?? 0;
  
  // Send push notification if app is closed and priority is high enough
  if (!appOpen && _pushEnv && (alert.priority === 1 || alert.priority === 2)) {
    try {
      const pushSent = await sendTicketAlertPush(db, _pushEnv, {
        user_id: alert.user_id,
        alert_type: alert.alert_type,
        priority: alert.priority,
        title: alert.title,
        message: alert.message,
        deep_link: alert.deep_link,
        event_id: alert.event_id,
      });
      
      if (pushSent) {
        await db
          .prepare("UPDATE ticket_alerts SET delivered_push = 1 WHERE id = ?")
          .bind(alertId)
          .run();
      }
    } catch (error) {
      console.error("[PlayerAlertEngine] Failed to send push:", error);
    }
  }
  
  return alertId;
}

// ============================================================================
// MAIN EVALUATION ENGINE
// ============================================================================

export interface PlayerEvaluationResult {
  alerts_generated: number;
  alerts_suppressed: number;
  players_evaluated: number;
  alerts: PlayerAlert[];
}

/**
 * Evaluate a single followed player for alerts
 */
async function evaluateFollowedPlayer(
  db: D1Database,
  player: WatchboardPlayer,
  currentStats: PlayerGameStats | null,
  game: GameData | null,
  appOpen: boolean
): Promise<{ alerts: PlayerAlert[]; suppressed: number }> {
  const alerts: PlayerAlert[] = [];
  let suppressed = 0;
  
  const playerId = player.player_id || player.player_name;
  const eventId = game?.provider_game_id ? `sdio_${game.sport.toLowerCase()}_${game.provider_game_id}` : undefined;
  
  // Get previous state
  const state = await getPlayerAlertState(db, player.user_id, playerId, eventId);
  
  // =========================================================================
  // GAME START ALERT
  // =========================================================================
  if (game && game.status === 'IN_PROGRESS' && !state) {
    const alertType: PlayerAlertType = 'game_start';
    
    if (!(await isPlayerAlertThrottled(db, player.user_id, playerId, alertType))) {
      const alert: PlayerAlert = {
        user_id: player.user_id,
        alert_type: alertType,
        priority: PRIORITY_MAP[alertType],
        title: `🏀 ${player.player_name}'s game is live!`,
        message: `${game.away_team} @ ${game.home_team} has started`,
        deep_link: propsPlayerDeepLink(player.sport, player.player_name, player.player_id),
        player_id: playerId,
        player_name: player.player_name,
        event_id: eventId,
        sport: player.sport,
      };
      
      alerts.push(alert);
      await createPlayerAlert(db, alert, appOpen);
      await recordPlayerAlertSent(db, player.user_id, playerId, alertType);
      await updatePlayerAlertState(db, player.user_id, playerId, {
        eventId,
        alertType: alertType,
      });
    } else {
      suppressed++;
    }
  }
  
  // Skip remaining checks if no live stats
  if (!currentStats || !game || game.status !== 'IN_PROGRESS') {
    return { alerts, suppressed };
  }
  
  // =========================================================================
  // PROP HIT ALERT
  // =========================================================================
  if (player.prop_type && player.prop_line !== null) {
    const currentValue = getCombinedStatValue(currentStats, player.prop_type);
    const hitProp = currentValue >= player.prop_line;
    const exceededBy = currentValue - player.prop_line;
    
    // Check if we already alerted for prop hit
    const alreadyAlerted = state?.prop_hit_alerted === 1;
    
    if (hitProp && !alreadyAlerted) {
      const alertType: PlayerAlertType = 'prop_hit';
      
      const alert: PlayerAlert = {
        user_id: player.user_id,
        alert_type: alertType,
        priority: PRIORITY_MAP[alertType],
        title: `🎯 ${player.player_name} HIT ${player.prop_type}!`,
        message: `${currentValue} ${player.prop_type.toLowerCase()} (line was ${player.prop_line})`,
        deep_link: propsPlayerDeepLink(player.sport, player.player_name, player.player_id),
        player_id: playerId,
        player_name: player.player_name,
        event_id: eventId,
        sport: player.sport,
      };
      
      alerts.push(alert);
      await createPlayerAlert(db, alert, appOpen);
      await recordPlayerAlertSent(db, player.user_id, playerId, alertType);
      await updatePlayerAlertState(db, player.user_id, playerId, {
        eventId,
        statValue: currentValue,
        alertType: alertType,
        propHitAlerted: true,
      });
    }
    
    // Check for significantly exceeded (e.g., 20%+ over line)
    if (hitProp && exceededBy >= player.prop_line * 0.2) {
      const alertType: PlayerAlertType = 'prop_exceeded';
      
      if (!(await isPlayerAlertThrottled(db, player.user_id, playerId, alertType))) {
        const alert: PlayerAlert = {
          user_id: player.user_id,
          alert_type: alertType,
          priority: PRIORITY_MAP[alertType],
          title: `🔥 ${player.player_name} CRUSHING IT!`,
          message: `${currentValue} ${player.prop_type.toLowerCase()} — ${exceededBy.toFixed(0)} over the line!`,
          deep_link: propsPlayerDeepLink(player.sport, player.player_name, player.player_id),
          player_id: playerId,
          player_name: player.player_name,
          event_id: eventId,
          sport: player.sport,
        };
        
        alerts.push(alert);
        await createPlayerAlert(db, alert, appOpen);
        await recordPlayerAlertSent(db, player.user_id, playerId, alertType);
      } else {
        suppressed++;
      }
    }
    
    // =========================================================================
    // PACE PROJECTION ALERTS (only if prop not yet hit)
    // =========================================================================
    if (!hitProp) {
      const gameProgress = getGameProgressPercent(game);
      const pace = calculatePaceProjection(currentValue, gameProgress, player.prop_line);
      
      // Determine pace phase
      let pacePhase: 'on_track' | 'ahead' | 'behind';
      if (pace.margin >= player.prop_line * 0.1) {
        pacePhase = 'ahead';
      } else if (pace.margin >= -player.prop_line * 0.1) {
        pacePhase = 'on_track';
      } else {
        pacePhase = 'behind';
      }
      
      // Only alert if phase changed
      if (state?.pace_alert_phase !== pacePhase && gameProgress >= 0.25) {
        let alertType: PlayerAlertType;
        let emoji: string;
        let verb: string;
        
        switch (pacePhase) {
          case 'ahead':
            alertType = 'pace_ahead';
            emoji = '📈';
            verb = 'ahead of pace';
            break;
          case 'behind':
            alertType = 'pace_behind';
            emoji = '📉';
            verb = 'behind pace';
            break;
          default:
            alertType = 'pace_on_track';
            emoji = '✅';
            verb = 'on pace';
        }
        
        if (!(await isPlayerAlertThrottled(db, player.user_id, playerId, alertType))) {
          const alert: PlayerAlert = {
            user_id: player.user_id,
            alert_type: alertType,
            priority: PRIORITY_MAP[alertType],
            title: `${emoji} ${player.player_name} ${verb}`,
            message: `${currentValue} ${player.prop_type.toLowerCase()} — projected ${pace.projected.toFixed(0)} (line: ${player.prop_line})`,
            deep_link: propsPlayerDeepLink(player.sport, player.player_name, player.player_id),
            player_id: playerId,
            player_name: player.player_name,
            event_id: eventId,
            sport: player.sport,
          };
          
          alerts.push(alert);
          await createPlayerAlert(db, alert, appOpen);
          await recordPlayerAlertSent(db, player.user_id, playerId, alertType);
          await updatePlayerAlertState(db, player.user_id, playerId, {
            eventId,
            statValue: currentValue,
            alertType: alertType,
            paceAlertPhase: pacePhase,
          });
        } else {
          suppressed++;
        }
      }
    }
  }
  
  // =========================================================================
  // DOUBLE-DOUBLE / TRIPLE-DOUBLE ALERTS (Basketball only)
  // =========================================================================
  if (['NBA', 'NCAAB'].includes(player.sport.toUpperCase())) {
    const hasTriple = isTripleDouble(currentStats);
    const hasDouble = isDoubleDouble(currentStats);
    
    if (hasTriple && state?.last_alert_type !== 'triple_double') {
      const alertType: PlayerAlertType = 'triple_double';
      
      const alert: PlayerAlert = {
        user_id: player.user_id,
        alert_type: alertType,
        priority: PRIORITY_MAP[alertType],
        title: `👑 TRIPLE-DOUBLE! ${player.player_name}`,
        message: `${currentStats.points}pts / ${currentStats.rebounds}reb / ${currentStats.assists}ast`,
        deep_link: propsPlayerDeepLink(player.sport, player.player_name, player.player_id),
        player_id: playerId,
        player_name: player.player_name,
        event_id: eventId,
        sport: player.sport,
      };
      
      alerts.push(alert);
      await createPlayerAlert(db, alert, appOpen);
      await updatePlayerAlertState(db, player.user_id, playerId, {
        eventId,
        alertType: alertType,
      });
    } else if (hasDouble && !hasTriple && state?.last_alert_type !== 'double_double') {
      const alertType: PlayerAlertType = 'double_double';
      
      const alert: PlayerAlert = {
        user_id: player.user_id,
        alert_type: alertType,
        priority: PRIORITY_MAP[alertType],
        title: `🏅 Double-Double! ${player.player_name}`,
        message: `${currentStats.points}pts / ${currentStats.rebounds}reb / ${currentStats.assists}ast`,
        deep_link: propsPlayerDeepLink(player.sport, player.player_name, player.player_id),
        player_id: playerId,
        player_name: player.player_name,
        event_id: eventId,
        sport: player.sport,
      };
      
      alerts.push(alert);
      await createPlayerAlert(db, alert, appOpen);
      await updatePlayerAlertState(db, player.user_id, playerId, {
        eventId,
        alertType: alertType,
      });
    }
  }
  
  // Update state with current value even if no alert
  await updatePlayerAlertState(db, player.user_id, playerId, {
    eventId,
    statValue: player.prop_type ? getCombinedStatValue(currentStats, player.prop_type) : undefined,
  });
  
  return { alerts, suppressed };
}

/**
 * Evaluate all followed players for a user
 */
export async function evaluateUserFollowedPlayers(
  db: D1Database,
  userId: string,
  appOpen: boolean = false
): Promise<PlayerEvaluationResult> {
  const alerts: PlayerAlert[] = [];
  let alertsSuppressed = 0;
  let playersEvaluated = 0;
  
  // Get all followed players for user
  const players = await db
    .prepare(`
      SELECT * FROM watchboard_players 
      WHERE user_id = ? AND is_active = 1
    `)
    .bind(userId)
    .all<WatchboardPlayer>();
  
  if (!players.results || players.results.length === 0) {
    return { alerts_generated: 0, alerts_suppressed: 0, players_evaluated: 0, alerts: [] };
  }
  
  for (const player of players.results) {
    playersEvaluated++;
    
    // TODO: Fetch live game stats for this player
    // This would query the sdio_player_game_stats table or ESPN API
    // For now, we'll use the current_stat_value from the watchboard_players table
    
    // Build stats object from current tracked value
    const currentStats: PlayerGameStats | null = player.current_stat_value !== null
      ? { [PROP_TO_STAT[player.prop_type || ''] || 'points']: player.current_stat_value }
      : null;
    
    // Find the player's current game
    // TODO: Query sdio_games for a live game matching this player's team
    const game: GameData | null = null; // Placeholder
    
    const result = await evaluateFollowedPlayer(db, player, currentStats, game, appOpen);
    alerts.push(...result.alerts);
    alertsSuppressed += result.suppressed;
  }
  
  return {
    alerts_generated: alerts.length,
    alerts_suppressed: alertsSuppressed,
    players_evaluated: playersEvaluated,
    alerts,
  };
}

/**
 * Evaluate all users with followed players
 */
export async function evaluateAllUsersWithFollowedPlayers(
  db: D1Database,
  env?: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }
): Promise<{ usersEvaluated: number; totalAlerts: number; errors: string[] }> {
  if (env) {
    setPlayerAlertEnv(env);
  }
  
  const errors: string[] = [];
  let totalAlerts = 0;
  
  try {
    // Get all users with active followed players
    const users = await db
      .prepare(`
        SELECT DISTINCT user_id 
        FROM watchboard_players 
        WHERE is_active = 1 AND user_id IS NOT NULL
      `)
      .all<{ user_id: string }>();
    
    if (!users.results || users.results.length === 0) {
      return { usersEvaluated: 0, totalAlerts: 0, errors: [] };
    }
    
    console.log(`[PlayerAlertEngine] Evaluating ${users.results.length} users with followed players`);
    
    const BATCH_SIZE = 10;
    const userIds = users.results.map(u => u.user_id);
    
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(userId => evaluateUserFollowedPlayers(db, userId, false))
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
    
    console.log(`[PlayerAlertEngine] Completed: ${userIds.length} users, ${totalAlerts} alerts`);
    
    return {
      usersEvaluated: userIds.length,
      totalAlerts,
      errors,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[PlayerAlertEngine] Fatal error:`, errMsg);
    errors.push(`Fatal: ${errMsg}`);
    return {
      usersEvaluated: 0,
      totalAlerts,
      errors,
    };
  }
}
