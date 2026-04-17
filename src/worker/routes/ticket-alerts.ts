/**
 * Ticket Alert API Routes
 * 
 * Endpoints for managing ticket and watchboard alerts.
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  evaluateAllAlerts,
  getUnreadAlerts,
  markAlertsRead,
  getAlertHistory,
} from '../services/ticketAlertEngine';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

function isMissingTicketAlertStorage(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return (
    msg.includes("no such table")
    || msg.includes("ticket_alerts")
    || msg.includes("ticket_alert_preferences")
  );
}

function defaultTicketAlertPreferences(userId: string) {
  return {
    user_id: userId,
    is_enabled: 1,
    min_priority: 3,
    channel_push: 1,
    channel_banner: 1,
    channel_center: 1,
    mute_ticket_settled: 0,
    mute_parlay_last_leg: 0,
    mute_cover_flip_clutch: 0,
    mute_game_final: 0,
    mute_cover_flip: 0,
    mute_momentum_shift: 0,
    mute_overtime_start: 0,
    mute_game_start: 0,
    mute_lead_change: 0,
    mute_buzzer_beater: 0,
    mute_major_run: 0,
    quiet_hours_enabled: 0,
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
  };
}

/**
 * GET /api/ticket-alerts
 * Get all alerts for the current user
 */
app.get('/', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const ticketId = c.req.query('ticketId');
  const priority = c.req.query('priority');

  try {
    const result = await getAlertHistory(c.env.DB, userId, {
      limit,
      offset,
      ticketId: ticketId ? parseInt(ticketId) : undefined,
      priority: priority ? (parseInt(priority) as 1 | 2 | 3) : undefined,
    });

    return c.json({
      success: true,
      alerts: result.alerts,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error fetching alerts:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        alerts: [],
        total: 0,
        limit,
        offset,
      });
    }
    return c.json({ error: 'Failed to fetch alerts' }, 500);
  }
});

/**
 * GET /api/ticket-alerts/unread
 * Get unread alerts for the current user
 */
app.get('/unread', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const limit = parseInt(c.req.query('limit') || '50');

  try {
    const alerts = await getUnreadAlerts(c.env.DB, userId, limit);
    
    return c.json({
      success: true,
      alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error fetching unread alerts:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        alerts: [],
        count: 0,
      });
    }
    return c.json({ error: 'Failed to fetch unread alerts' }, 500);
  }
});

/**
 * GET /api/ticket-alerts/count
 * Get count of unread alerts
 */
app.get('/count', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  try {
    const result = await c.env.DB
      .prepare("SELECT COUNT(*) as count FROM ticket_alerts WHERE user_id = ? AND is_read = 0")
      .bind(userId)
      .first<{ count: number }>();

    return c.json({
      success: true,
      unread_count: result?.count || 0,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error counting alerts:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        unread_count: 0,
      });
    }
    return c.json({ error: 'Failed to count alerts' }, 500);
  }
});

/**
 * POST /api/ticket-alerts/evaluate
 * Manually trigger alert evaluation for the current user
 */
app.post('/evaluate', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const body = await c.req.json<{ app_open?: boolean }>().catch(() => ({ app_open: true }));
  const appOpen = body.app_open ?? true;

  try {
    console.log(`[TICKET-ALERTS] Evaluating alerts for user ${userId}`);
    const result = await evaluateAllAlerts(c.env.DB, userId, appOpen);
    console.log(`[TICKET-ALERTS] Generated ${result.alerts_generated} alerts, suppressed ${result.alerts_suppressed}`);

    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error evaluating alerts:', error);
    return c.json({ error: 'Failed to evaluate alerts' }, 500);
  }
});

/**
 * POST /api/ticket-alerts/read
 * Mark alerts as read
 */
app.post('/read', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const body = await c.req.json<{ alert_ids?: number[] }>().catch(() => ({ alert_ids: undefined }));
  const alertIds = body.alert_ids;

  try {
    await markAlertsRead(c.env.DB, userId, alertIds);

    return c.json({
      success: true,
      message: alertIds 
        ? `Marked ${alertIds.length} alerts as read`
        : 'Marked all alerts as read',
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error marking alerts read:', error);
    return c.json({ error: 'Failed to mark alerts as read' }, 500);
  }
});

/**
 * DELETE /api/ticket-alerts/:alertId
 * Delete a specific alert
 */
app.delete('/:alertId', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const alertId = parseInt(c.req.param('alertId'));
  if (isNaN(alertId)) {
    return c.json({ error: 'Invalid alert ID' }, 400);
  }

  try {
    await c.env.DB
      .prepare("DELETE FROM ticket_alerts WHERE id = ? AND user_id = ?")
      .bind(alertId, userId)
      .run();

    return c.json({
      success: true,
      message: 'Alert deleted',
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error deleting alert:', error);
    return c.json({ error: 'Failed to delete alert' }, 500);
  }
});

/**
 * POST /api/ticket-alerts/clear
 * Clear all alerts for the user
 */
app.post('/clear', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const body = await c.req.json<{ older_than_days?: number }>().catch(() => ({ older_than_days: undefined }));
  const olderThanDays = body.older_than_days;

  try {
    let query = "DELETE FROM ticket_alerts WHERE user_id = ?";
    const params: (string | number)[] = [userId];

    if (olderThanDays) {
      query += " AND created_at < datetime('now', ?||' days')";
      params.push(-olderThanDays);
    }

    const result = await c.env.DB.prepare(query).bind(...params).run();

    return c.json({
      success: true,
      deleted: result.meta?.changes || 0,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error clearing alerts:', error);
    return c.json({ error: 'Failed to clear alerts' }, 500);
  }
});

/**
 * GET /api/ticket-alerts/ticket/:ticketId
 * Get alerts for a specific ticket
 */
app.get('/ticket/:ticketId', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const ticketId = parseInt(c.req.param('ticketId'));
  if (isNaN(ticketId)) {
    return c.json({ error: 'Invalid ticket ID' }, 400);
  }

  try {
    const alerts = await c.env.DB
      .prepare(`
        SELECT * FROM ticket_alerts 
        WHERE user_id = ? AND ticket_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `)
      .bind(userId, ticketId)
      .all();

    return c.json({
      success: true,
      alerts: alerts.results || [],
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error fetching ticket alerts:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        alerts: [],
      });
    }
    return c.json({ error: 'Failed to fetch ticket alerts' }, 500);
  }
});

/**
 * GET /api/ticket-alerts/stats
 * Get alert statistics for the user
 */
app.get('/stats', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  try {
    const stats = await c.env.DB
      .prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread,
          SUM(CASE WHEN priority = 1 THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN priority = 2 THEN 1 ELSE 0 END) as important,
          SUM(CASE WHEN priority = 3 THEN 1 ELSE 0 END) as info,
          SUM(CASE WHEN alert_type = 'ticket_settled' THEN 1 ELSE 0 END) as settlements,
          SUM(CASE WHEN alert_type LIKE 'cover_flip%' THEN 1 ELSE 0 END) as cover_flips
        FROM ticket_alerts
        WHERE user_id = ?
        AND created_at > datetime('now', '-7 days')
      `)
      .bind(userId)
      .first();

    return c.json({
      success: true,
      stats: {
        total: stats?.total || 0,
        unread: stats?.unread || 0,
        by_priority: {
          critical: stats?.critical || 0,
          important: stats?.important || 0,
          info: stats?.info || 0,
        },
        by_type: {
          settlements: stats?.settlements || 0,
          cover_flips: stats?.cover_flips || 0,
        },
      },
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error fetching stats:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        stats: {
          total: 0,
          unread: 0,
          by_priority: { critical: 0, important: 0, info: 0 },
          by_type: { settlements: 0, cover_flips: 0 },
        },
      });
    }
    return c.json({ error: 'Failed to fetch alert stats' }, 500);
  }
});

/**
 * GET /api/ticket-alerts/preferences
 * Get user's ticket alert preferences
 */
app.get('/preferences', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  try {
    let prefs = await c.env.DB
      .prepare("SELECT * FROM ticket_alert_preferences WHERE user_id = ?")
      .bind(userId)
      .first();

    // Return defaults if no preferences exist
    if (!prefs) {
      prefs = {
        user_id: userId,
        is_enabled: 1,
        min_priority: 3,
        channel_push: 1,
        channel_banner: 1,
        channel_center: 1,
        mute_ticket_settled: 0,
        mute_parlay_last_leg: 0,
        mute_cover_flip_clutch: 0,
        mute_game_final: 0,
        mute_cover_flip: 0,
        mute_momentum_shift: 0,
        mute_overtime_start: 0,
        mute_game_start: 0,
        mute_lead_change: 0,
        mute_buzzer_beater: 0,
        mute_major_run: 0,
        quiet_hours_enabled: 0,
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
      };
    }

    return c.json({
      success: true,
      preferences: prefs,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error fetching preferences:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        preferences: defaultTicketAlertPreferences(userId),
      });
    }
    return c.json({ error: 'Failed to fetch preferences' }, 500);
  }
});

/**
 * PATCH /api/ticket-alerts/preferences
 * Update user's ticket alert preferences
 */
app.patch('/preferences', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json({ error: 'User ID required' }, 401);
  }

  const updates = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  
  // Allowed fields
  const allowedFields = [
    'is_enabled', 'min_priority', 'channel_push', 'channel_banner', 'channel_center',
    'mute_ticket_settled', 'mute_parlay_last_leg', 'mute_cover_flip_clutch', 'mute_game_final',
    'mute_cover_flip', 'mute_momentum_shift', 'mute_overtime_start', 'mute_game_start',
    'mute_lead_change', 'mute_buzzer_beater', 'mute_major_run',
    'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
  ];

  const validUpdates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      validUpdates[key] = (updates as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(validUpdates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  try {
    // Check if preferences exist
    const existing = await c.env.DB
      .prepare("SELECT id FROM ticket_alert_preferences WHERE user_id = ?")
      .bind(userId)
      .first();

    if (existing) {
      // Update existing
      const setClauses = Object.keys(validUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(validUpdates), userId];
      
      await c.env.DB
        .prepare(`UPDATE ticket_alert_preferences SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
        .bind(...values)
        .run();
    } else {
      // Insert new with defaults
      const columns = ['user_id', ...Object.keys(validUpdates)];
      const placeholders = columns.map(() => '?').join(', ');
      const values = [userId, ...Object.values(validUpdates)];
      
      await c.env.DB
        .prepare(`INSERT INTO ticket_alert_preferences (${columns.join(', ')}) VALUES (${placeholders})`)
        .bind(...values)
        .run();
    }

    // Fetch updated preferences
    const prefs = await c.env.DB
      .prepare("SELECT * FROM ticket_alert_preferences WHERE user_id = ?")
      .bind(userId)
      .first();

    return c.json({
      success: true,
      preferences: prefs,
    });
  } catch (error) {
    console.error('[TICKET-ALERTS] Error updating preferences:', error);
    if (isMissingTicketAlertStorage(error)) {
      return c.json({
        success: true,
        preferences: { ...defaultTicketAlertPreferences(userId), ...validUpdates },
      });
    }
    return c.json({ error: 'Failed to update preferences' }, 500);
  }
});

export default app;
