/**
 * Scout Live Watch Push Notification Service
 * 
 * Sends push notifications for Scout Live Watch alerts (scoring events,
 * period breaks, dominant performances) to users who have enabled
 * Scout Live Watch push notifications.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

interface ScoutAlert {
  id: number;
  user_id: string;
  severity: string;
  headline: string;
  body: string;
  game_id: string | null;
  deep_link: string | null;
  category: string;
  source_type: string;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  type: string;
  severity?: string;
  url?: string;
  gameId?: string;
  alertId?: number;
}

/**
 * Build push notification payload from a Scout alert
 */
function buildScoutPushPayload(alert: ScoutAlert): PushPayload {
  // Choose icon based on alert category and severity
  let icon = "⚾";
  
  if (alert.source_type === "LIVE_SCORES") {
    const severityIcons: Record<string, string> = {
      IMPACT: "🔥",
      NOTICE: "📊",
      INFO: "ℹ️",
    };
    icon = severityIcons[alert.severity] || "📣";
  }
  
  return {
    title: `${icon} ${alert.headline}`,
    body: alert.body || "Tap to view details",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    tag: `scout-alert-${alert.id}`,
    type: "scout_live_watch",
    severity: alert.severity,
    url: alert.deep_link || `/game/${alert.game_id}`,
    gameId: alert.game_id || undefined,
    alertId: alert.id,
  };
}

/**
 * Check if user has Scout Live Watch push notifications enabled
 */
async function userHasPushEnabled(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<boolean> {
  try {
    // Check if user has Scout Live Watch enabled
    const liveWatchPrefs = await db.prepare(`
      SELECT enabled, push_enabled 
      FROM scout_live_watch_preferences
      WHERE user_id = ? AND data_scope = ?
    `).bind(userId, dataScope).first() as { enabled: number; push_enabled: number } | null;
    
    if (!liveWatchPrefs || !liveWatchPrefs.enabled || !liveWatchPrefs.push_enabled) {
      return false;
    }
    
    // Check if user has general push notifications enabled
    const alertPrefs = await db.prepare(`
      SELECT channel_push 
      FROM scout_alert_preferences 
      WHERE user_id = ?
    `).bind(userId).first() as { channel_push: number } | null;
    
    if (!alertPrefs || !alertPrefs.channel_push) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error checking push enabled status:", error);
    return false;
  }
}

/**
 * Send push notifications for Scout Live Watch alerts
 * 
 * This should be called after Scout Live Watch alerts are created
 * to notify users who have push notifications enabled.
 */
export async function sendScoutLiveWatchPushNotifications(
  db: D1Database,
  alertIds: number[],
  dataScope: DataScope
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (alertIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }
  
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  
  try {
    // Get alerts with their details
    const placeholders = alertIds.map(() => "?").join(",");
    const alertsResult = await db.prepare(`
      SELECT 
        id, user_id, severity, headline, body, 
        game_id, deep_link, category, source_type
      FROM scout_alerts
      WHERE id IN (${placeholders}) AND data_scope = ?
    `).bind(...alertIds, dataScope).all();
    
    const alerts = (alertsResult.results || []) as ScoutAlert[];
    
    // Group alerts by user
    const alertsByUser = new Map<string, ScoutAlert[]>();
    for (const alert of alerts) {
      const userAlerts = alertsByUser.get(alert.user_id) || [];
      userAlerts.push(alert);
      alertsByUser.set(alert.user_id, userAlerts);
    }
    
    // Process each user
    for (const [userId, userAlerts] of alertsByUser) {
      // Check if user has Scout Live Watch push enabled
      const pushEnabled = await userHasPushEnabled(db, userId, dataScope);
      
      if (!pushEnabled) {
        skipped += userAlerts.length;
        continue;
      }
      
      // Get user's active push subscriptions
      const subscriptionsResult = await db.prepare(`
        SELECT id, endpoint, keys_p256dh, keys_auth
        FROM push_subscriptions
        WHERE user_id = ? AND is_active = 1
      `).bind(userId).all();
      
      const subscriptions = subscriptionsResult.results || [];
      
      if (subscriptions.length === 0) {
        skipped += userAlerts.length;
        continue;
      }
      
      // Send push for each alert
      for (const alert of userAlerts) {
        const payload = buildScoutPushPayload(alert);
        
        try {
          // Store push notification record for client polling
          await db.prepare(`
            INSERT INTO scheduled_notifications (
              user_id, notification_type, title, body, url, 
              scheduled_for, status, data_scope
            ) VALUES (?, 'scout_live_watch', ?, ?, ?, CURRENT_TIMESTAMP, 'pending', ?)
          `).bind(
            userId,
            payload.title,
            payload.body,
            payload.url,
            dataScope
          ).run();
          
          // Mark alert as push delivered
          await db.prepare(`
            UPDATE scout_alerts 
            SET push_sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(alert.id).run();
          
          sent++;
          
          // Log successful push delivery
          await db.prepare(`
            INSERT INTO event_log (event_type, entity_type, entity_id, payload_json, data_scope)
            VALUES ('scout_push_sent', 'scout_alert', ?, ?, ?)
          `).bind(
            String(alert.id),
            JSON.stringify({
              userId,
              alertId: alert.id,
              headline: alert.headline,
            }),
            dataScope
          ).run();
          
        } catch (err) {
          console.error("Failed to queue Scout Live Watch push notification:", err);
          failed++;
        }
      }
    }
    
    // Log summary
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('scout_push_batch_processed', 'scout_live_watch', ?, ?)
    `).bind(
      JSON.stringify({ sent, failed, skipped, totalAlerts: alertIds.length }),
      dataScope
    ).run();
    
  } catch (error) {
    console.error("Error sending Scout Live Watch push notifications:", error);
    return { sent: 0, failed: alertIds.length, skipped: 0 };
  }
  
  return { sent, failed, skipped };
}

/**
 * Send push notification for a single Scout alert
 */
export async function sendSingleScoutPushNotification(
  db: D1Database,
  alertId: number,
  dataScope: DataScope
): Promise<boolean> {
  const result = await sendScoutLiveWatchPushNotifications(db, [alertId], dataScope);
  return result.sent > 0;
}

/**
 * Get pending Scout Live Watch notifications for a user
 * The client polls this endpoint to show local notifications
 */
export async function getPendingScoutLiveWatchNotifications(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<PushPayload[]> {
  try {
    const result = await db.prepare(`
      SELECT id, notification_type, title, body, url
      FROM scheduled_notifications
      WHERE user_id = ? 
        AND data_scope = ?
        AND status = 'pending' 
        AND notification_type = 'scout_live_watch'
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(userId, dataScope).all();
    
    const notifications = (result.results || []) as Array<{
      id: number;
      notification_type: string;
      title: string;
      body: string;
      url: string;
    }>;
    
    // Mark as delivered
    if (notifications.length > 0) {
      const ids = notifications.map(n => n.id);
      const placeholders = ids.map(() => "?").join(",");
      await db.prepare(`
        UPDATE scheduled_notifications 
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
        WHERE id IN (${placeholders})
      `).bind(...ids).run();
    }
    
    return notifications.map(n => ({
      title: n.title,
      body: n.body,
      type: n.notification_type,
      url: n.url,
    }));
  } catch (error) {
    console.error("Error getting pending Scout notifications:", error);
    return [];
  }
}

/**
 * Get push notification statistics for Scout Live Watch
 */
export async function getScoutPushStats(
  db: D1Database,
  dataScope: DataScope,
  hoursBack: number = 24
): Promise<{
  totalSent: number;
  totalPending: number;
  byType: Array<{ type: string; count: number }>;
}> {
  try {
    const sentResult = await db.prepare(`
      SELECT COUNT(*) as count
      FROM scheduled_notifications
      WHERE data_scope = ?
        AND notification_type = 'scout_live_watch'
        AND status = 'sent'
        AND sent_at > datetime('now', '-${hoursBack} hours')
    `).bind(dataScope).first() as { count: number } | null;
    
    const pendingResult = await db.prepare(`
      SELECT COUNT(*) as count
      FROM scheduled_notifications
      WHERE data_scope = ?
        AND notification_type = 'scout_live_watch'
        AND status = 'pending'
    `).bind(dataScope).first() as { count: number } | null;
    
    return {
      totalSent: sentResult?.count || 0,
      totalPending: pendingResult?.count || 0,
      byType: [], // Could be expanded to track by alert type
    };
  } catch (error) {
    console.error("Error getting Scout push stats:", error);
    return { totalSent: 0, totalPending: 0, byType: [] };
  }
}
