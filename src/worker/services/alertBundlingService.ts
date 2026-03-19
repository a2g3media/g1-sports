/**
 * Alert Bundling Service
 * 
 * Groups multiple alerts from the same game within 60-90 second windows.
 * Game-winner alerts bypass bundling and are sent immediately.
 * 
 * BUNDLING STRATEGY:
 * - Alerts from same game within 60-90s window → bundled into single notification
 * - Game-winner alerts → bypass bundling, sent immediately, flush pending bundles
 * - Period breaks → bypass bundling (marks natural transition point)
 * - Dominant performances → bypass bundling (significant moments)
 * - Line movements, injuries, weather → eligible for bundling
 * 
 * BENEFITS:
 * - Reduces notification fatigue during high-action games
 * - Preserves urgency for game-winner moments
 * - Natural batching around period breaks
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;
import { normalizeCoachGAlertCopy } from "./coachgCompliance";

export type DataScope = "DEMO" | "PROD";

export type AlertPriority = "immediate" | "bundleable";

export interface PendingAlert {
  id: string;
  gameId: string;
  userId: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  priority: AlertPriority;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AlertBundle {
  gameId: string;
  userId: string;
  alerts: PendingAlert[];
  firstAlertAt: string;
  lastAlertAt: string;
  windowExpiresAt: string;
}

// In-memory bundle storage (per worker instance)
// In production, this should be stored in Durable Objects or KV for persistence
const bundleStore = new Map<string, AlertBundle>();

// Bundling configuration
const BUNDLING_WINDOW_MS = 75000; // 75 seconds (midpoint of 60-90s range)
const MAX_BUNDLE_SIZE = 5; // Flush if bundle reaches 5 alerts

/**
 * Categories that bypass bundling (always sent immediately)
 */
const IMMEDIATE_CATEGORIES = [
  "game_winner",
  "period_break",
  "dominant_performance",
  "critical_injury", // Starters ruled out close to game time
];

/**
 * Determine if an alert should bypass bundling
 */
function shouldBypassBundling(
  category: string,
  severity: string,
  metadata?: Record<string, unknown>
): boolean {
  // Game-winner alerts always bypass
  if (IMMEDIATE_CATEGORIES.includes(category)) {
    return true;
  }
  
  // High severity alerts bypass
  if (severity === "critical") {
    return true;
  }
  
  // Final score alerts bypass
  if (metadata?.isFinalScore) {
    return true;
  }
  
  return false;
}

/**
 * Generate unique bundle key for game + user combination
 */
function getBundleKey(gameId: string, userId: string): string {
  return `${gameId}:${userId}`;
}

/**
 * Add alert to bundle or send immediately
 */
export async function processAlertForBundling(
  db: D1Database,
  alert: PendingAlert,
  dataScope: DataScope = "PROD"
): Promise<{
  bundled: boolean;
  sentImmediately: boolean;
  bundleSize?: number;
}> {
  const bypass = shouldBypassBundling(
    alert.category,
    alert.severity,
    alert.metadata
  );
  
  // Immediate alerts: flush any existing bundle for this game+user, then send
  if (bypass) {
    await flushBundle(db, alert.gameId, alert.userId, dataScope);
    await sendAlert(db, alert, dataScope);
    return { bundled: false, sentImmediately: true };
  }
  
  // Bundleable alerts: add to bundle
  const bundleKey = getBundleKey(alert.gameId, alert.userId);
  const now = new Date();
  
  let bundle = bundleStore.get(bundleKey);
  
  if (!bundle) {
    // Create new bundle
    const expiresAt = new Date(now.getTime() + BUNDLING_WINDOW_MS);
    bundle = {
      gameId: alert.gameId,
      userId: alert.userId,
      alerts: [alert],
      firstAlertAt: alert.createdAt,
      lastAlertAt: alert.createdAt,
      windowExpiresAt: expiresAt.toISOString(),
    };
    bundleStore.set(bundleKey, bundle);
    
    // Schedule bundle flush
    setTimeout(() => {
      flushBundle(db, alert.gameId, alert.userId, dataScope);
    }, BUNDLING_WINDOW_MS);
    
    return { bundled: true, sentImmediately: false, bundleSize: 1 };
  }
  
  // Check if bundle window has expired
  const expiresAt = new Date(bundle.windowExpiresAt);
  if (now > expiresAt) {
    // Flush expired bundle and create new one
    await flushBundle(db, alert.gameId, alert.userId, dataScope);
    return processAlertForBundling(db, alert, dataScope);
  }
  
  // Add to existing bundle
  bundle.alerts.push(alert);
  bundle.lastAlertAt = alert.createdAt;
  
  // Flush if bundle is full
  if (bundle.alerts.length >= MAX_BUNDLE_SIZE) {
    await flushBundle(db, alert.gameId, alert.userId, dataScope);
    return { bundled: true, sentImmediately: true, bundleSize: bundle.alerts.length };
  }
  
  return { bundled: true, sentImmediately: false, bundleSize: bundle.alerts.length };
}

/**
 * Flush a bundle and send as combined alert
 */
async function flushBundle(
  db: D1Database,
  gameId: string,
  userId: string,
  dataScope: DataScope
): Promise<void> {
  const bundleKey = getBundleKey(gameId, userId);
  const bundle = bundleStore.get(bundleKey);
  
  if (!bundle || bundle.alerts.length === 0) {
    return;
  }
  
  // Remove from store
  bundleStore.delete(bundleKey);
  
  // If only one alert, send it directly
  if (bundle.alerts.length === 1) {
    await sendAlert(db, bundle.alerts[0], dataScope);
    return;
  }
  
  // Create bundled alert
  const bundledAlert = createBundledAlert(bundle);
  await sendAlert(db, bundledAlert, dataScope);
  
  // Log bundle
  await db.prepare(`
    INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
    VALUES ('alert_bundle_flushed', 'alert_bundling', ?, ?)
  `).bind(
    JSON.stringify({
      gameId,
      userId,
      alertCount: bundle.alerts.length,
      categories: bundle.alerts.map(a => a.category),
      windowDuration: new Date(bundle.lastAlertAt).getTime() - new Date(bundle.firstAlertAt).getTime(),
    }),
    dataScope
  ).run();
}

/**
 * Create a single bundled alert from multiple alerts
 */
function createBundledAlert(bundle: AlertBundle): PendingAlert {
  const gameId = bundle.gameId;
  const alertCount = bundle.alerts.length;
  
  // Determine highest severity
  const severities = ["critical", "high", "medium", "low"];
  let highestSeverity = "low";
  for (const severity of severities) {
    if (bundle.alerts.some(a => a.severity === severity)) {
      highestSeverity = severity;
      break;
    }
  }
  
  // Build combined message
  const categories = [...new Set(bundle.alerts.map(a => a.category))];
  const categoryText = categories.length === 1 
    ? categories[0].replace(/_/g, " ")
    : "multiple updates";
  
  const title = `${alertCount} ${categoryText}`;
  
  // List individual alerts
  const messages = bundle.alerts.map(a => `• ${a.message}`);
  const message = messages.join("\n");
  
  return {
    id: `bundle_${bundle.gameId}_${bundle.userId}_${Date.now()}`,
    gameId,
    userId: bundle.userId,
    category: "bundled_alerts",
    severity: highestSeverity,
    title,
    message,
    priority: "bundleable",
    createdAt: bundle.lastAlertAt,
    metadata: {
      isBundled: true,
      alertCount,
      categories,
      firstAlertAt: bundle.firstAlertAt,
      lastAlertAt: bundle.lastAlertAt,
    },
  };
}

/**
 * Send an alert (bundled or individual)
 */
async function sendAlert(
  db: D1Database,
  alert: PendingAlert,
  dataScope: DataScope
): Promise<void> {
  const normalized = normalizeCoachGAlertCopy({
    title: alert.title,
    body: alert.message,
  });
  // Insert into scout_alerts table
  await db.prepare(`
    INSERT INTO scout_alerts (
      user_id, game_id, category, severity,
      title, message, metadata_json,
      data_scope, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    alert.userId,
    alert.gameId,
    alert.category,
    alert.severity,
    normalized.title,
    normalized.body || "",
    JSON.stringify(alert.metadata || {}),
    dataScope,
    alert.createdAt
  ).run();
  
  // Log alert sent
  await db.prepare(`
    INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
    VALUES ('alert_sent', 'alert_delivery', ?, ?)
  `).bind(
    JSON.stringify({
      alertId: alert.id,
      userId: alert.userId,
      gameId: alert.gameId,
      category: alert.category,
      isBundled: alert.metadata?.isBundled || false,
    }),
    dataScope
  ).run();
}

/**
 * Get current bundle statistics (for monitoring/debugging)
 */
export function getBundleStats(): {
  activeBundles: number;
  bundlesByGame: Record<string, number>;
  totalPendingAlerts: number;
} {
  const bundlesByGame: Record<string, number> = {};
  let totalPendingAlerts = 0;
  
  for (const [, bundle] of bundleStore.entries()) {
    bundlesByGame[bundle.gameId] = (bundlesByGame[bundle.gameId] || 0) + 1;
    totalPendingAlerts += bundle.alerts.length;
  }
  
  return {
    activeBundles: bundleStore.size,
    bundlesByGame,
    totalPendingAlerts,
  };
}

/**
 * Flush all bundles (for cleanup/shutdown)
 */
export async function flushAllBundles(
  db: D1Database,
  dataScope: DataScope = "PROD"
): Promise<number> {
  let flushed = 0;
  
  for (const [, bundle] of bundleStore.entries()) {
    await flushBundle(db, bundle.gameId, bundle.userId, dataScope);
    flushed++;
  }
  
  return flushed;
}

/**
 * Clean up expired bundles (fallback if setTimeout fails)
 */
export async function cleanupExpiredBundles(
  db: D1Database,
  dataScope: DataScope = "PROD"
): Promise<number> {
  const now = new Date();
  let cleaned = 0;
  
  for (const [, bundle] of bundleStore.entries()) {
    const expiresAt = new Date(bundle.windowExpiresAt);
    if (now > expiresAt) {
      await flushBundle(db, bundle.gameId, bundle.userId, dataScope);
      cleaned++;
    }
  }
  
  return cleaned;
}
