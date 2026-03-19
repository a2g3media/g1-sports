/**
 * Web Push Service
 * 
 * Push notification service for Cloudflare Workers.
 * Note: The web-push npm package is not compatible with Cloudflare Workers
 * as it requires Node.js crypto APIs. This service stores notifications
 * for polling-based delivery instead.
 */
import { sanitizeCoachGText } from "./coachgCompliance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  type?: string;
  gameId?: string;
  alertId?: string;
  ticketId?: number;
  severity?: string;
  data?: Record<string, unknown>;
}

interface SendResult {
  success: boolean;
  subscriptionId?: number;
  error?: string;
  statusCode?: number;
}

/**
 * Store a notification for polling-based delivery
 * Since web-push doesn't work in Cloudflare Workers, we use the existing
 * pending_push_notifications table for polling delivery
 */
async function storeNotificationForPolling(
  db: D1Database,
  userId: string,
  payload: PushPayload
): Promise<boolean> {
  try {
    await db.prepare(`
      INSERT INTO pending_push_notifications (user_id, type, title, body, url, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      userId,
      payload.type || 'notification',
      payload.title,
      payload.body,
      payload.url || '/',
      JSON.stringify({
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        gameId: payload.gameId,
        alertId: payload.alertId,
        ticketId: payload.ticketId,
        severity: payload.severity,
        ...payload.data
      })
    ).run();
    return true;
  } catch (error) {
    console.error("[WebPush] Failed to store notification for polling:", error);
    return false;
  }
}

/**
 * Send a push notification to all of a user's active subscriptions
 * In Cloudflare Workers, this stores the notification for polling delivery
 */
export async function sendPushToUser(
  db: D1Database,
  _env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string },
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; results: SendResult[] }> {
  // Store notification for polling-based delivery
  const stored = await storeNotificationForPolling(db, userId, payload);
  
  if (stored) {
    console.log(`[WebPush] Stored notification for user ${userId} (polling delivery)`);
    return { 
      sent: 1, 
      failed: 0, 
      results: [{ success: true }] 
    };
  }

  return { 
    sent: 0, 
    failed: 1, 
    results: [{ success: false, error: "Failed to store notification" }] 
  };
}

/**
 * Send a push notification for a ticket alert
 */
export async function sendTicketAlertPush(
  db: D1Database,
  env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string },
  alert: {
    user_id: string;
    alert_type: string;
    priority: number;
    title: string;
    message: string;
    deep_link?: string;
    ticket_id?: number;
    event_id?: string;
  }
): Promise<boolean> {
  const typeToIcon: Record<string, string> = {
    ticket_settled: "🏆",
    parlay_last_leg: "⚡",
    cover_flip_clutch: "🔥",
    cover_flip: "📊",
    game_final: "🏁",
    overtime: "⏰",
    major_run: "🏃",
    lead_change: "↔️",
    game_start: "▶️",
  };

  const icon = typeToIcon[alert.alert_type] || "📱";
  const normalizedTitle = alert.title.toLowerCase().includes("coach g")
    ? alert.title
    : `Coach G Alert: ${alert.title}`;
  const normalizedBody = alert.message.toLowerCase().includes("informational only")
    ? alert.message
    : `${alert.message} Informational only.`;

  const payload: PushPayload = {
    title: `${icon} ${sanitizeCoachGText(normalizedTitle)}`,
    body: sanitizeCoachGText(normalizedBody),
    type: alert.alert_type,
    url: alert.deep_link || "/watchboard",
    ticketId: alert.ticket_id,
    gameId: alert.event_id,
    severity: alert.priority === 1 ? "critical" : alert.priority === 2 ? "high" : "normal",
    tag: `ticket-${alert.ticket_id || "alert"}-${alert.alert_type}`,
  };

  const result = await sendPushToUser(db, env, alert.user_id, payload);
  
  // Update alert delivery status
  if (result.sent > 0) {
    try {
      await db.prepare(`
        UPDATE ticket_alerts 
        SET delivered_push = 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND alert_type = ? AND title = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).bind(alert.user_id, alert.alert_type, alert.title).run();
    } catch (error) {
      console.error("[WebPush] Failed to update alert delivery status:", error);
    }
  }

  return result.sent > 0;
}

/**
 * Get VAPID public key for client subscription
 */
export function getVapidPublicKey(env: { VAPID_PUBLIC_KEY?: string }): string | null {
  return env.VAPID_PUBLIC_KEY || null;
}
