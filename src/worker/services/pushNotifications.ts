/**
 * Push Notification Service
 * 
 * Sends browser push notifications for alerts to users who have
 * enabled push notifications and subscribed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

interface PushSubscription {
  id: number;
  user_id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  is_active: number;
}

interface AlertForPush {
  id: number;
  user_id: string;
  severity: string;
  headline: string;
  body: string | null;
  game_id: string | null;
  deep_link: string | null;
  item_type: string;
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
 * Build push notification payload from an alert
 */
function buildPushPayload(alert: AlertForPush): PushPayload {
  // Choose icon based on severity
  const severityIcons: Record<string, string> = {
    CRITICAL: "🚨",
    IMPACT: "📊",
    INFO: "ℹ️",
  };
  
  const icon = severityIcons[alert.severity] || "📣";
  
  return {
    title: `${icon} ${alert.headline}`,
    body: alert.body || "Tap to view details",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    tag: `alert-${alert.id}`,
    type: "line_movement",
    severity: alert.severity,
    url: alert.deep_link || "/alerts",
    gameId: alert.game_id || undefined,
    alertId: alert.id,
  };
}

/**
 * Send push notifications for newly created alerts
 * 
 * This should be called after alerts are generated to notify users
 * who have push notifications enabled.
 */
export async function sendPushNotificationsForAlerts(
  db: D1Database,
  alertIds: number[],
  scope: string = "PROD"
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (alertIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }
  
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  
  // Get alerts with their user info
  const placeholders = alertIds.map(() => "?").join(",");
  const alertsResult = await db.prepare(`
    SELECT ae.id, ae.user_id, ae.severity, ae.headline, ae.body, ae.game_id, ae.deep_link, ae.item_type
    FROM alert_events ae
    WHERE ae.id IN (${placeholders}) AND ae.data_scope = ?
  `).bind(...alertIds, scope).all();
  
  const alerts = (alertsResult.results || []) as AlertForPush[];
  
  // Group alerts by user
  const alertsByUser = new Map<string, AlertForPush[]>();
  for (const alert of alerts) {
    const userAlerts = alertsByUser.get(alert.user_id) || [];
    userAlerts.push(alert);
    alertsByUser.set(alert.user_id, userAlerts);
  }
  
  // Process each user
  for (const [userId, userAlerts] of alertsByUser) {
    // Check if user has push notifications enabled in preferences
    const prefs = await db.prepare(`
      SELECT channel_push FROM alert_preferences WHERE user_id = ?
    `).bind(userId).first() as { channel_push: number } | null;
    
    if (!prefs || !prefs.channel_push) {
      skipped += userAlerts.length;
      continue;
    }
    
    // Get user's active push subscriptions
    const subscriptionsResult = await db.prepare(`
      SELECT id, endpoint, keys_p256dh, keys_auth
      FROM push_subscriptions
      WHERE user_id = ? AND is_active = 1
    `).bind(userId).all();
    
    const subscriptions = (subscriptionsResult.results || []) as PushSubscription[];
    
    if (subscriptions.length === 0) {
      skipped += userAlerts.length;
      continue;
    }
    
    // Send push for each alert
    for (const alert of userAlerts) {
      const payload = buildPushPayload(alert);
      
      // Note: In production, you would use web-push library to send actual push notifications
      // For now, we'll mark the delivery status and the client will poll or use 
      // the local notification system
      
      try {
        // Update alert delivery status
        await db.prepare(`
          UPDATE alert_events 
          SET delivery_status = 'PUSH_QUEUED', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(alert.id).run();
        
        // Store push notification record for client polling
        await db.prepare(`
          INSERT INTO scheduled_notifications (
            user_id, notification_type, title, body, url, scheduled_for, status
          ) VALUES (?, 'line_movement', ?, ?, ?, CURRENT_TIMESTAMP, 'pending')
        `).bind(
          userId,
          payload.title,
          payload.body,
          payload.url
        ).run();
        
        sent++;
      } catch (err) {
        console.error("Failed to queue push notification:", err);
        failed++;
      }
    }
  }
  
  return { sent, failed, skipped };
}

/**
 * Get pending push notifications for a user
 * The client will poll this endpoint to show local notifications
 */
export async function getPendingPushNotifications(
  db: D1Database,
  userId: string
): Promise<PushPayload[]> {
  const result = await db.prepare(`
    SELECT id, notification_type, title, body, url
    FROM scheduled_notifications
    WHERE user_id = ? AND status = 'pending'
      AND notification_type IN ('line_movement', 'weekly_results')
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(userId).all();
  
  const notifications = (result.results || []) as unknown as Array<{
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
}

/**
 * Check for and send line movement alerts based on odds changes
 * This can be called when odds are updated to detect significant movements
 */
export async function checkLineMovementsAndAlert(
  db: D1Database,
  gameId: string,
  scope: string = "PROD"
): Promise<{ alertsCreated: number }> {
  // Get current and previous odds for the game
  const currentOdds = await db.prepare(`
    SELECT market_key, outcome_key, line_value, price_american
    FROM odds_quotes
    WHERE game_id = ? AND data_scope = ?
    ORDER BY updated_at DESC
  `).bind(gameId, scope).all();
  
  // Opening odds available for future comparison if needed
  // const openingOdds = await db.prepare(`
  //   SELECT market_key, outcome_key, opening_line_value, opening_price_american
  //   FROM odds_opening
  //   WHERE game_id = ? AND data_scope = ?
  // `).bind(gameId, scope).all();
  
  // Get recent snapshots to detect movement
  const recentSnapshots = await db.prepare(`
    SELECT market_key, outcome_key, line_value, price_american, captured_at
    FROM odds_snapshots
    WHERE game_id = ? AND data_scope = ?
      AND captured_at > datetime('now', '-2 hours')
    ORDER BY captured_at DESC
  `).bind(gameId, scope).all();
  
  const current = (currentOdds.results || []) as Array<{
    market_key: string;
    outcome_key: string;
    line_value: number | null;
    price_american: number;
  }>;
  
  const snapshots = (recentSnapshots.results || []) as Array<{
    market_key: string;
    outcome_key: string;
    line_value: number | null;
    price_american: number;
    captured_at: string;
  }>;
  
  if (current.length === 0 || snapshots.length === 0) {
    return { alertsCreated: 0 };
  }
  
  let alertsCreated = 0;
  
  // Group snapshots by market+outcome
  const oldestByKey = new Map<string, { line_value: number | null; price_american: number }>();
  for (const snap of snapshots) {
    const key = `${snap.market_key}-${snap.outcome_key}`;
    if (!oldestByKey.has(key)) {
      oldestByKey.set(key, snap);
    }
  }
  
  // Check for significant movements
  for (const curr of current) {
    const key = `${curr.market_key}-${curr.outcome_key}`;
    const old = oldestByKey.get(key);
    
    if (!old) continue;
    
    let severity: "CRITICAL" | "IMPACT" | "INFO" = "INFO";
    let headline = "";
    let movement = 0;
    
    // Check spread movements
    if (curr.market_key === "spreads" && curr.line_value !== null && old.line_value !== null) {
      movement = Math.abs(curr.line_value - old.line_value);
      if (movement >= 1.5) {
        severity = "CRITICAL";
        headline = `Spread moves ${movement >= 2 ? "significantly" : ""}: ${old.line_value > 0 ? "+" : ""}${old.line_value} → ${curr.line_value > 0 ? "+" : ""}${curr.line_value}`;
      } else if (movement >= 0.5) {
        severity = "IMPACT";
        headline = `Spread moves: ${old.line_value > 0 ? "+" : ""}${old.line_value} → ${curr.line_value > 0 ? "+" : ""}${curr.line_value}`;
      }
    }
    
    // Check total movements
    if (curr.market_key === "totals" && curr.line_value !== null && old.line_value !== null) {
      movement = Math.abs(curr.line_value - old.line_value);
      if (movement >= 2) {
        severity = "CRITICAL";
        headline = `Total moves significantly: ${old.line_value} → ${curr.line_value}`;
      } else if (movement >= 1) {
        severity = "IMPACT";
        headline = `Total moves: ${old.line_value} → ${curr.line_value}`;
      }
    }
    
    // Check moneyline movements (by odds change)
    if (curr.market_key === "h2h") {
      const oddsMovement = Math.abs(curr.price_american - old.price_american);
      if (oddsMovement >= 30) {
        severity = oddsMovement >= 50 ? "CRITICAL" : "IMPACT";
        headline = `Moneyline shifts: ${old.price_american > 0 ? "+" : ""}${old.price_american} → ${curr.price_american > 0 ? "+" : ""}${curr.price_american}`;
      }
    }
    
    if (headline) {
      // Create threshold event for this movement
      await db.prepare(`
        INSERT INTO threshold_events (
          data_scope, sport_type, game_id, event_category, event_type, 
          severity, headline, details_json, rank_score, is_visible
        ) VALUES (?, 'nfl', ?, 'ODDS', 'LINE_MOVE', ?, ?, ?, ?, 1)
      `).bind(
        scope,
        gameId,
        severity,
        headline,
        JSON.stringify({
          market: curr.market_key,
          old_value: old.line_value ?? old.price_american,
          new_value: curr.line_value ?? curr.price_american,
          movement,
        }),
        severity === "CRITICAL" ? 0.9 : severity === "IMPACT" ? 0.7 : 0.4
      ).run();
      
      alertsCreated++;
    }
  }
  
  return { alertsCreated };
}
