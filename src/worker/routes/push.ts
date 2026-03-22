import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { getPendingPushNotifications } from "../services/pushNotifications";
import { getVapidPublicKey } from "../services/webPushService";

type AppBindings = { Bindings: Env };

const pushRouter = new Hono<AppBindings>();

/**
 * GET /api/push/vapid-public-key
 * Get the VAPID public key for client subscription
 */
pushRouter.get("/vapid-public-key", (c) => {
  const env = c.env as { VAPID_PUBLIC_KEY?: string };
  const vapidPublicKey = getVapidPublicKey(env);
  
  if (!vapidPublicKey) {
    return c.json({
      vapidPublicKey: null,
      config_required: true,
      error: "Push notifications not configured",
    });
  }
  
  return c.json({ vapidPublicKey });
});

/**
 * POST /api/push/subscribe
 * Save a push subscription for the current user
 */
pushRouter.post("/subscribe", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const body = await c.req.json();
  const { endpoint, keys } = body;

  if (!endpoint) {
    return c.json({ error: "endpoint is required" }, 400);
  }

  // Check if subscription already exists
  const existing = await db.prepare(`
    SELECT id FROM push_subscriptions WHERE endpoint = ?
  `).bind(endpoint).first<{ id: number }>();

  if (existing) {
    // Update existing subscription
    await db.prepare(`
      UPDATE push_subscriptions 
      SET user_id = ?, keys_p256dh = ?, keys_auth = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      user.id,
      keys?.p256dh || "",
      keys?.auth || "",
      existing.id
    ).run();

    return c.json({ success: true, message: "Subscription updated" });
  }

  // Create new subscription
  await db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    user.id,
    endpoint,
    keys?.p256dh || "",
    keys?.auth || "",
    c.req.header("User-Agent") || ""
  ).run();

  // Enable push channel in preferences
  await db.prepare(`
    INSERT INTO alert_preferences (user_id, channel_push, is_enabled)
    VALUES (?, 1, 1)
    ON CONFLICT(user_id) DO UPDATE SET channel_push = 1, updated_at = CURRENT_TIMESTAMP
  `).bind(user.id).run();

  return c.json({ success: true, message: "Subscription created" });
});

/**
 * POST /api/push/unsubscribe
 * Remove a push subscription
 */
pushRouter.post("/unsubscribe", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const body = await c.req.json();
  const { endpoint } = body;

  if (endpoint) {
    // Deactivate specific subscription
    await db.prepare(`
      UPDATE push_subscriptions 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = ? AND user_id = ?
    `).bind(endpoint, user.id).run();
  } else {
    // Deactivate all subscriptions for user
    await db.prepare(`
      UPDATE push_subscriptions 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(user.id).run();
  }

  return c.json({ success: true });
});

/**
 * GET /api/push/pending
 * Get pending push notifications for polling (fallback for when web-push isn't available)
 */
pushRouter.get("/pending", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const notifications = await getPendingPushNotifications(db, user.id);

  return c.json({ notifications });
});

/**
 * GET /api/push/status
 * Check push notification subscription status for current user
 */
pushRouter.get("/status", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  // Check if user has active subscriptions
  const subscription = await db.prepare(`
    SELECT id, created_at FROM push_subscriptions 
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(user.id).first<{ id: number; created_at: string }>();

  // Check preferences
  const prefs = await db.prepare(`
    SELECT channel_push FROM alert_preferences WHERE user_id = ?
  `).bind(user.id).first<{ channel_push: number }>();

  return c.json({
    subscribed: Boolean(subscription),
    enabled: Boolean(prefs?.channel_push),
    subscriptionDate: subscription?.created_at || null,
  });
});

/**
 * POST /api/push/test
 * Send a test notification to verify push is working
 */
pushRouter.post("/test", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  // Create a test notification that will be picked up by polling
  await db.prepare(`
    INSERT INTO scheduled_notifications (
      user_id, notification_type, title, body, url, scheduled_for, status
    ) VALUES (?, 'line_movement', ?, ?, ?, CURRENT_TIMESTAMP, 'pending')
  `).bind(
    user.id,
    "📊 Test Line Movement Alert",
    "Chiefs -3.5 → -4.5 vs Raiders. Spread moved 1 point toward KC.",
    "/watchlist"
  ).run();

  return c.json({ 
    success: true, 
    message: "Test notification queued",
  });
});

export { pushRouter };
