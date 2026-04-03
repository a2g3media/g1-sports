/**
 * Sports Data Refresh API Routes
 * Manual triggers and status endpoints for the refresh orchestrator
 */

import { Hono } from 'hono';
import { authMiddleware } from '@getmocha/users-service/backend';
import {
  runMasterRefresh,
  runLiveMiniRefresh,
  isLocked,
  ACTIVE_SPORTS,
  SportKey
} from '../services/sports-data';
import { clearAllCache, getCacheStats } from '../services/responseCache';
import { FeatureFlagService } from '../services/featureFlagService';
import {
  getSchedulerState,
  setSchedulerEnabled,
  getLockStatus,
  runScheduledMasterRefresh,
  runScheduledLiveRefresh
} from '../services/sports-data/internalScheduler';
import {
  getSportsRadarProvider,
  fetchPropsCached,
  fetchStandingsCached,
  fetchTeamProfileCached,
} from '../services/sports-data/sportsRadarProvider';
import {
  getCacheStats as getD1CacheStats,
  clearExpiredCache,
  clearProviderCache,
  getCachedData,
  setCachedData,
} from '../services/apiCacheService';
import { fetchLiveScores, initSportsRadarGameProvider } from '../services/providers/sportsRadarGameProvider';
import type { SportKey as ProviderSportKey } from '../services/providers/types';
import { fetchGameWithFallback, fetchGamesWithFallback, getActiveProviderName, getPartnerAlerts, getProviderConfigs, getProviderTelemetry } from '../services/providers';
import { fetchSportsRadarOdds, fetchGamePlayerProps } from '../services/sportsRadarOddsService';
import { getEasternDateStringOffset, getTodayEasternDateString } from '../services/dateUtils';

type Bindings = {
  DB: any;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_GOLF_KEY?: string;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
  SPORTSRADAR_PROPS_KEY?: string;
  SPORTSRADAR_ODDS_KEY?: string;
  PARTNER_ALERT_WEBHOOK_URL?: string;
  PARTNER_ALERT_WEBHOOK_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const propsTodayHotCache = new Map<string, { expiresAt: number; payload: any }>();
const propsTodayInflight = new Map<string, Promise<any>>();
const PROPS_HOT_TTL_MS = 12000;

const propsTodayPerf = {
  requests: 0,
  hotHits: 0,
  d1Hits: 0,
  backupHits: 0,
  freshComputes: 0,
  totalMs: 0,
  maxMs: 0,
  lastMs: 0,
};

function recordPropsTodayPerf(source: 'hot' | 'd1' | 'backup' | 'fresh', elapsedMs: number): void {
  propsTodayPerf.requests += 1;
  if (source === 'hot') propsTodayPerf.hotHits += 1;
  if (source === 'd1') propsTodayPerf.d1Hits += 1;
  if (source === 'backup') propsTodayPerf.backupHits += 1;
  if (source === 'fresh') propsTodayPerf.freshComputes += 1;
  propsTodayPerf.lastMs = elapsedMs;
  propsTodayPerf.totalMs += elapsedMs;
  propsTodayPerf.maxMs = Math.max(propsTodayPerf.maxMs, elapsedMs);

  if (propsTodayPerf.requests % 20 === 0) {
    const avgMs = propsTodayPerf.requests > 0 ? Math.round((propsTodayPerf.totalMs / propsTodayPerf.requests) * 10) / 10 : 0;
    console.log('[SportsData][props/today][perf]', {
      requests: propsTodayPerf.requests,
      hotHits: propsTodayPerf.hotHits,
      d1Hits: propsTodayPerf.d1Hits,
      backupHits: propsTodayPerf.backupHits,
      freshComputes: propsTodayPerf.freshComputes,
      avgMs,
      maxMs: Math.round(propsTodayPerf.maxMs * 10) / 10,
      lastMs: Math.round(propsTodayPerf.lastMs * 10) / 10,
    });
  }
}

const SPORT_PATH_MAP: Record<string, string> = {
  nba: 'nba',
  nhl: 'nhl',
  nfl: 'nfl',
  mlb: 'mlb',
  ncaaf: 'cfb',
  ncaab: 'cbb',
  soccer: 'soccer',
};

function formatSDIODate(date: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${date.getUTCFullYear()}-${months[date.getUTCMonth()]}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

type ProviderHealthLevel = 'healthy' | 'degraded' | 'down';

function normalizeProviderKey(name: string): string {
  return name.trim().toLowerCase();
}

function buildProviderChainSnapshot(env: Bindings) {
  const telemetry = getProviderTelemetry();
  const configs = getProviderConfigs();
  const providers = configs.map((config) => {
    const stat = telemetry.providerStats[config.name];
    const providerKey = normalizeProviderKey(config.name);
    const keyConfigured = providerKey === 'sportsradar' ? !!env.SPORTSRADAR_API_KEY : true;

    let level: ProviderHealthLevel = 'healthy';
    if (!config.enabled || !keyConfigured) {
      level = 'down';
    } else if ((stat?.failures || 0) > 0 && (stat?.successes || 0) === 0) {
      level = 'down';
    } else if ((stat?.failures || 0) > (stat?.successes || 0)) {
      level = 'degraded';
    }

    return {
      id: config.id,
      name: config.name,
      priority: config.priority,
      enabled: config.enabled,
      keyConfigured,
      status: level,
      successes: stat?.successes || 0,
      failures: stat?.failures || 0,
      fallbackUsed: stat?.fallbackUsed || 0,
      lastSuccessAt: stat?.lastSuccessAt || null,
      lastFailureAt: stat?.lastFailureAt || null,
      lastErrorCategory: stat?.lastErrorCategory || null,
      lastError: stat?.lastError || null,
    };
  });

  const degradedProviders = providers.filter((provider) => provider.status !== 'healthy');
  const fallbackRate = telemetry.totals.requests > 0
    ? Number((telemetry.totals.fallbackEvents / telemetry.totals.requests).toFixed(3))
    : 0;

  return {
    activeProvider: getActiveProviderName(),
    order: providers
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((provider) => provider.name),
    providers,
    telemetry: {
      totals: telemetry.totals,
      fallbackRate,
      recentAttempts: telemetry.recentAttempts.slice(0, 25),
      lastUpdatedAt: telemetry.lastUpdatedAt,
    },
    degradedProviders: degradedProviders.map((provider) => provider.name),
  };
}

function summarizeAlerts(alerts: Array<{ severity: 'info' | 'warning' | 'critical' }>) {
  return alerts.reduce(
    (acc, alert) => {
      acc.total += 1;
      acc[alert.severity] += 1;
      return acc;
    },
    { total: 0, info: 0, warning: 0, critical: 0 }
  );
}

type PersistableAlert = {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  provider: string;
  message: string;
  nextAction: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

type StoredActiveAlertState = {
  severity: 'info' | 'warning' | 'critical';
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
};

async function persistPartnerAlerts(db: D1Database, alerts: PersistableAlert[]) {
  await ensurePartnerAlertTable(db);
  const now = new Date().toISOString();
  const activeRows = await db.prepare(`
    SELECT id, alert_key
    FROM partner_alert_events
    WHERE status = 'active'
  `).all<{ id: number; alert_key: string }>();

  const activeMap = new Map<string, number>();
  for (const row of activeRows.results || []) {
    activeMap.set(row.alert_key, row.id);
  }

  const activeKeys = new Set<string>();
  for (const alert of alerts) {
    const alertKey = `${alert.category}:${alert.provider}`;
    activeKeys.add(alertKey);
    const existingId = activeMap.get(alertKey);
    if (existingId) {
      await db.prepare(`
        UPDATE partner_alert_events
        SET severity = ?,
            message = ?,
            next_action = ?,
            metric = ?,
            metric_value = ?,
            metric_threshold = ?,
            last_seen_at = ?,
            occurrences = occurrences + 1,
            updated_at = ?
        WHERE id = ?
      `).bind(
        alert.severity,
        alert.message,
        alert.nextAction,
        alert.metric || null,
        alert.value ?? null,
        alert.threshold ?? null,
        now,
        now,
        existingId
      ).run();
    } else {
      await db.prepare(`
        INSERT INTO partner_alert_events (
          alert_key,
          severity,
          category,
          provider,
          message,
          next_action,
          metric,
          metric_value,
          metric_threshold,
          status,
          acknowledged_at,
          acknowledged_by,
          snoozed_until,
          snooze_reason,
          first_seen_at,
          last_seen_at,
          occurrences,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, NULL, NULL, ?, ?, 1, ?, ?)
      `).bind(
        alertKey,
        alert.severity,
        alert.category,
        alert.provider,
        alert.message,
        alert.nextAction,
        alert.metric || null,
        alert.value ?? null,
        alert.threshold ?? null,
        now,
        now,
        now,
        now
      ).run();
    }
  }

  for (const [alertKey, id] of activeMap.entries()) {
    if (!activeKeys.has(alertKey)) {
      await db.prepare(`
        UPDATE partner_alert_events
        SET status = 'resolved',
            resolved_at = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(now, now, id).run();
    }
  }
}

async function readPartnerAlertHistoryFiltered(
  db: D1Database,
  options: {
    limit?: number;
    severity?: 'info' | 'warning' | 'critical';
    status?: 'active' | 'resolved';
    sinceHours?: number;
    includeSnoozed?: boolean;
  }
) {
  await ensurePartnerAlertTable(db);
  const existingColumns = await getPartnerAlertColumnSet(db);
  const safeLimit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const whereClauses: string[] = [];
  const binds: unknown[] = [];

  if (options.severity) {
    whereClauses.push('severity = ?');
    binds.push(options.severity);
  }
  if (options.status) {
    whereClauses.push('status = ?');
    binds.push(options.status);
  }
  if (typeof options.sinceHours === 'number' && options.sinceHours > 0) {
    whereClauses.push("datetime(updated_at) >= datetime('now', ?)");
    binds.push(`-${Math.floor(options.sinceHours)} hours`);
  }
  if (!options.includeSnoozed) {
    whereClauses.push("(snoozed_until IS NULL OR datetime(snoozed_until) <= datetime('now'))");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sql = `
    SELECT
      id,
      alert_key,
      severity,
      category,
      provider,
      message,
      next_action,
      metric,
      metric_value,
      metric_threshold,
      status,
      acknowledged_at,
      acknowledged_by,
      snoozed_until,
      snooze_reason,
      occurrences,
      first_seen_at,
      last_seen_at,
      resolved_at,
      created_at,
      updated_at
    FROM partner_alert_events
    ${whereSql}
    ORDER BY updated_at DESC
    LIMIT ?
  `;

  const rows = await db.prepare(sql).bind(...binds, safeLimit).all();
  return rows.results || [];
}

async function getPartnerAlertColumnSet(db: D1Database) {
  const tableInfo = await db.prepare(`PRAGMA table_info(partner_alert_events)`).all<{ name: string }>();
  return new Set((tableInfo.results || []).map((row) => row.name));
}

async function getActiveAlertControlsByKey(db: D1Database) {
  await ensurePartnerAlertTable(db);
  const rows = await db.prepare(`
    SELECT alert_key, severity, acknowledged_at, snoozed_until
    FROM partner_alert_events
    WHERE status = 'active'
  `).all<{
    alert_key: string;
    severity: 'info' | 'warning' | 'critical';
    acknowledged_at: string | null;
    snoozed_until: string | null;
  }>();
  const map = new Map<string, StoredActiveAlertState>();
  for (const row of rows.results || []) {
    map.set(row.alert_key, {
      severity: row.severity,
      acknowledgedAt: row.acknowledged_at,
      snoozedUntil: row.snoozed_until,
    });
  }
  return map;
}

async function applyEscalationPolicy(db: D1Database, options?: { warningToCriticalAfterMinutes?: number }) {
  await ensurePartnerAlertTable(db);
  const existingColumns = await getPartnerAlertColumnSet(db);
  if (!existingColumns.has('escalated_at') || !existingColumns.has('escalation_reason')) {
    return [] as Array<any>;
  }
  const minutes = Math.max(10, Math.min(options?.warningToCriticalAfterMinutes ?? 60, 24 * 60));
  const thresholdExpr = `-${minutes} minutes`;

  const candidates = await db.prepare(`
    SELECT id
    FROM partner_alert_events
    WHERE status = 'active'
      AND severity = 'warning'
      AND acknowledged_at IS NULL
      AND (snoozed_until IS NULL OR datetime(snoozed_until) <= datetime('now'))
      AND datetime(last_seen_at) <= datetime('now', ?)
  `).bind(thresholdExpr).all<{ id: number }>();

  const ids = (candidates.results || []).map((row) => row.id);
  if (ids.length === 0) {
    return [] as Array<any>;
  }

  const now = new Date().toISOString();
  for (const id of ids) {
    await db.prepare(`
      UPDATE partner_alert_events
      SET severity = 'critical',
          escalated_at = ?,
          escalation_reason = 'unresolved_warning_timeout',
          updated_at = ?
      WHERE id = ?
    `).bind(now, now, id).run();
  }

  const escalatedRows = await db.prepare(`
    SELECT *
    FROM partner_alert_events
    WHERE id IN (${ids.map(() => '?').join(',')})
  `).bind(...ids).all();
  return escalatedRows.results || [];
}

async function sendEscalationWebhook(env: Bindings, event: {
  alertId: number;
  alertKey: string;
  provider: string;
  severity: string;
  category: string;
  message: string;
  escalatedAt: string;
  escalationReason: string;
}) {
  if (!env.PARTNER_ALERT_WEBHOOK_URL) return;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (env.PARTNER_ALERT_WEBHOOK_KEY) {
    headers['x-partner-alert-key'] = env.PARTNER_ALERT_WEBHOOK_KEY;
  }
  await fetch(env.PARTNER_ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'sportsradar_primary',
      eventType: 'partner_alert_escalated',
      occurredAt: new Date().toISOString(),
      data: event,
    }),
  });
}

async function dispatchEscalationNotifications(db: D1Database, env: Bindings, escalatedRows: Array<any>) {
  await ensurePartnerAlertTable(db);
  for (const row of escalatedRows) {
    const existing = await db.prepare(`
      SELECT id
      FROM partner_alert_notifications
      WHERE alert_event_id = ? AND event_type = 'escalated_critical'
      LIMIT 1
    `).bind(row.id).first();
    if (existing) continue;

    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO partner_alert_notifications (
        alert_event_id,
        event_type,
        status,
        destination,
        attempts,
        created_at,
        updated_at
      ) VALUES (?, 'escalated_critical', 'pending', ?, 0, ?, ?)
    `).bind(row.id, env.PARTNER_ALERT_WEBHOOK_URL || 'none', now, now).run();

    try {
      await sendEscalationWebhook(env, {
        alertId: row.id,
        alertKey: row.alert_key,
        provider: row.provider,
        severity: row.severity,
        category: row.category,
        message: row.message,
        escalatedAt: row.escalated_at || now,
        escalationReason: row.escalation_reason || 'unresolved_warning_timeout',
      });
      await db.prepare(`
        UPDATE partner_alert_notifications
        SET status = 'sent',
            sent_at = ?,
            attempts = attempts + 1,
            updated_at = ?
        WHERE alert_event_id = ? AND event_type = 'escalated_critical'
      `).bind(now, now, row.id).run();
    } catch (error: any) {
      await db.prepare(`
        UPDATE partner_alert_notifications
        SET status = 'failed',
            attempts = attempts + 1,
            last_error = ?,
            updated_at = ?
        WHERE alert_event_id = ? AND event_type = 'escalated_critical'
      `).bind((error?.message || 'Webhook send failed').slice(0, 500), now, row.id).run();
    }
  }
}

async function runPartnerAlertLifecycle(db: D1Database, env: Bindings, alerts: PersistableAlert[]) {
  await persistPartnerAlerts(db, alerts);
  const escalatedRows = await applyEscalationPolicy(db, { warningToCriticalAfterMinutes: 60 });
  await dispatchEscalationNotifications(db, env, escalatedRows);
  return {
    escalatedCount: escalatedRows.length,
  };
}

function isFutureIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

async function ensurePartnerAlertTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS partner_alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_key TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      provider TEXT NOT NULL,
      message TEXT NOT NULL,
      next_action TEXT NOT NULL,
      metric TEXT,
      metric_value REAL,
      metric_threshold REAL,
      status TEXT NOT NULL DEFAULT 'active',
      acknowledged_at DATETIME,
      acknowledged_by TEXT,
      snoozed_until DATETIME,
      snooze_reason TEXT,
      escalated_at DATETIME,
      escalation_reason TEXT,
      occurrences INTEGER NOT NULL DEFAULT 1,
      first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS partner_alert_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_event_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      destination TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(alert_event_id, event_type)
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_partner_alert_events_status_updated
    ON partner_alert_events(status, updated_at DESC)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_partner_alert_events_provider_updated
    ON partner_alert_events(provider, updated_at DESC)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_partner_alert_events_category_updated
    ON partner_alert_events(category, updated_at DESC)
  `).run();
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_alert_events_key_active
    ON partner_alert_events(alert_key, status)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_partner_alert_notifications_status
    ON partner_alert_notifications(status, updated_at DESC)
  `).run();
  const existingColumns = await getPartnerAlertColumnSet(db);
  const optionalColumns: Array<{ name: string; ddl: string }> = [
    { name: 'acknowledged_at', ddl: 'ALTER TABLE partner_alert_events ADD COLUMN acknowledged_at DATETIME' },
    { name: 'acknowledged_by', ddl: 'ALTER TABLE partner_alert_events ADD COLUMN acknowledged_by TEXT' },
    { name: 'snoozed_until', ddl: 'ALTER TABLE partner_alert_events ADD COLUMN snoozed_until DATETIME' },
    { name: 'snooze_reason', ddl: 'ALTER TABLE partner_alert_events ADD COLUMN snooze_reason TEXT' },
    { name: 'escalated_at', ddl: 'ALTER TABLE partner_alert_events ADD COLUMN escalated_at DATETIME' },
    { name: 'escalation_reason', ddl: 'ALTER TABLE partner_alert_events ADD COLUMN escalation_reason TEXT' },
  ];
  for (const column of optionalColumns) {
    if (!existingColumns.has(column.name)) {
      await db.prepare(column.ddl).run();
    }
  }
}

// ============================================
// ADMIN CHECK
// ============================================

async function isAdmin(c: any): Promise<boolean> {
  const user = c.get('user');
  if (!user) return false;
  
  try {
    const dbUser = await c.env.DB.prepare('SELECT roles FROM users WHERE id = ?')
      .bind(user.id)
      .first();
    
    if (!dbUser?.roles) return false;
    const roles = JSON.parse(dbUser.roles);
    return roles.includes('admin') || roles.includes('developer');
  } catch {
    return false;
  }
}

// ============================================
// DEMO MODE AUTH - allows demo mode to bypass auth for testing
// ============================================

function isDemoMode(c: any): boolean {
  return c.req.header("X-Demo-Mode") === "true";
}

async function demoOrAuthMiddleware(c: any, next: () => Promise<void>) {
  if (isDemoMode(c)) {
    await next();
    return;
  }
  try {
    const authResult = await authMiddleware(c, async () => {
      await next();
    });
    if (authResult instanceof Response) {
      return authResult;
    }
    return authResult;
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 401);
    return c.json({ error: error?.message || 'Unauthorized' }, status);
  }
}

const PROVIDER_SPORT_MAP: Record<string, ProviderSportKey> = {
  NFL: 'nfl',
  NBA: 'nba',
  MLB: 'mlb',
  NHL: 'nhl',
  NCAAF: 'ncaaf',
  NCAAB: 'ncaab',
  SOCCER: 'soccer',
};

async function hydrateSportFromProviderFeed(db: any, env: Bindings, sport: string): Promise<{
  gamesUpserted: number;
  gamesUpdated: number;
  oddsUpserted: number;
  propsUpserted: number;
  sampleGames: Array<{ league: string; home: string; away: string; startTime: string }>;
}> {
  const providerSport = PROVIDER_SPORT_MAP[sport];
  if (!providerSport) {
    return { gamesUpserted: 0, gamesUpdated: 0, oddsUpserted: 0, propsUpserted: 0, sampleGames: [] };
  }

  const date = getTodayEasternDateString();
  const feed = await fetchGamesWithFallback(providerSport, { date });
  const games = feed.data || [];
  const now = new Date().toISOString();
  const upsertedGames: Array<{
    dbGameId: number;
    providerGameId: string;
    homeTeam: string;
    awayTeam: string;
  }> = [];

  let gamesUpserted = 0;
  let gamesUpdated = 0;
  let oddsUpserted = 0;
  let propsUpserted = 0;
  const sampleGames: Array<{ league: string; home: string; away: string; startTime: string }> = [];
  const writePropSnapshot = async (
    gameId: number,
    prop: {
      playerName: string;
      team: string | null;
      propType: string;
      lineValue: number;
    }
  ): Promise<boolean> => {
    const current = await db
      .prepare('SELECT id, open_line_value, line_value FROM sdio_props_current WHERE game_id = ? AND player_name = ? AND prop_type = ?')
      .bind(gameId, prop.playerName, prop.propType)
      .first<{ id: number; open_line_value: number | null; line_value: number | null }>();

    if (!current) {
      await db.prepare(`
        INSERT INTO sdio_props_current (
          game_id, player_name, team, prop_type, line_value,
          open_line_value, movement, last_updated, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).bind(
        gameId,
        prop.playerName,
        prop.team,
        prop.propType,
        prop.lineValue,
        prop.lineValue,
        now,
        now,
        now
      ).run();
      await db.prepare(`
        INSERT INTO sdio_props_history (
          game_id, player_name, prop_type, line_value, recorded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(gameId, prop.playerName, prop.propType, prop.lineValue, now, now, now).run();
      return true;
    }

    if (current.line_value === prop.lineValue) {
      await db.prepare(`
        UPDATE sdio_props_current
        SET team = COALESCE(?, team), last_updated = ?, updated_at = ?
        WHERE id = ?
      `).bind(prop.team, now, now, current.id).run();
      return false;
    }

    const movement =
      current.open_line_value !== null
        ? prop.lineValue - current.open_line_value
        : null;
    await db.prepare(`
      UPDATE sdio_props_current
      SET team = COALESCE(?, team), line_value = ?, movement = ?, last_updated = ?, updated_at = ?
      WHERE id = ?
    `).bind(prop.team, prop.lineValue, movement, now, now, current.id).run();
    await db.prepare(`
      INSERT INTO sdio_props_history (
        game_id, player_name, prop_type, line_value, recorded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(gameId, prop.playerName, prop.propType, prop.lineValue, now, now, now).run();
    return true;
  };
  const writeOddsSnapshot = async (
    gameId: number,
    providerGameId: string,
    market: {
      spreadHome: number | null;
      spreadAway: number | null;
      total: number | null;
      moneylineHome: number | null;
      moneylineAway: number | null;
    }
  ): Promise<boolean> => {
    const current = await db
      .prepare('SELECT * FROM sdio_odds_current WHERE game_id = ?')
      .bind(gameId)
      .first<{
        open_spread: number | null;
        open_total: number | null;
        spread_home: number | null;
        spread_away: number | null;
        total: number | null;
        moneyline_home: number | null;
        moneyline_away: number | null;
      }>();

    if (!current) {
      await db.prepare(`
        INSERT INTO sdio_odds_current (
          game_id, spread_home, spread_away, total, moneyline_home, moneyline_away,
          open_spread, open_total, open_moneyline_home, open_moneyline_away,
          movement_spread, movement_total, last_updated, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      `).bind(
        gameId,
        market.spreadHome,
        market.spreadAway,
        market.total,
        market.moneylineHome,
        market.moneylineAway,
        market.spreadHome,
        market.total,
        market.moneylineHome,
        market.moneylineAway,
        now,
        now,
        now
      ).run();
      await db.prepare(`
        INSERT INTO sdio_odds_history (
          game_id, spread_home, spread_away, total, moneyline_home, moneyline_away, recorded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        gameId,
        market.spreadHome,
        market.spreadAway,
        market.total,
        market.moneylineHome,
        market.moneylineAway,
        now,
        now,
        now
      ).run();
      if (market.spreadHome !== null) {
        await db.prepare(`
          INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
          VALUES (?, ?, 'spread', ?, ?, 'SportsRadar', ?, ?)
        `).bind(providerGameId, providerSport, market.spreadHome, now, now, now).run();
      }
      if (market.total !== null) {
        await db.prepare(`
          INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
          VALUES (?, ?, 'total', ?, ?, 'SportsRadar', ?, ?)
        `).bind(providerGameId, providerSport, market.total, now, now, now).run();
      }
      if (market.moneylineHome !== null) {
        await db.prepare(`
          INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
          VALUES (?, ?, 'moneyline', ?, ?, 'SportsRadar', ?, ?)
        `).bind(providerGameId, providerSport, market.moneylineHome, now, now, now).run();
      }
      return true;
    }

    const spreadChanged = current.spread_home !== market.spreadHome;
    const totalChanged = current.total !== market.total;
    const mlHomeChanged = current.moneyline_home !== market.moneylineHome;
    const changed =
      spreadChanged ||
      current.spread_away !== market.spreadAway ||
      totalChanged ||
      mlHomeChanged ||
      current.moneyline_away !== market.moneylineAway;
    if (!changed) {
      await db.prepare(`
        UPDATE sdio_odds_current
        SET last_updated = ?, updated_at = ?
        WHERE game_id = ?
      `).bind(now, now, gameId).run();
      await db.prepare(`
        INSERT INTO sdio_odds_history (
          game_id, spread_home, spread_away, total, moneyline_home, moneyline_away, recorded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        gameId,
        market.spreadHome,
        market.spreadAway,
        market.total,
        market.moneylineHome,
        market.moneylineAway,
        now,
        now,
        now
      ).run();
      return true;
    }

    const movementSpread =
      market.spreadHome !== null && current.open_spread !== null
        ? market.spreadHome - current.open_spread
        : null;
    const movementTotal =
      market.total !== null && current.open_total !== null
        ? market.total - current.open_total
        : null;

    await db.prepare(`
      UPDATE sdio_odds_current
      SET spread_home = ?, spread_away = ?, total = ?, moneyline_home = ?, moneyline_away = ?,
          movement_spread = ?, movement_total = ?, last_updated = ?, updated_at = ?
      WHERE game_id = ?
    `).bind(
      market.spreadHome,
      market.spreadAway,
      market.total,
      market.moneylineHome,
      market.moneylineAway,
      movementSpread,
      movementTotal,
      now,
      now,
      gameId
    ).run();

    await db.prepare(`
      INSERT INTO sdio_odds_history (
        game_id, spread_home, spread_away, total, moneyline_home, moneyline_away, recorded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      gameId,
      market.spreadHome,
      market.spreadAway,
      market.total,
      market.moneylineHome,
      market.moneylineAway,
      now,
      now,
      now
    ).run();

    if (spreadChanged && market.spreadHome !== null) {
      await db.prepare(`
        INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
        VALUES (?, ?, 'spread', ?, ?, 'SportsRadar', ?, ?)
      `).bind(providerGameId, providerSport, market.spreadHome, now, now, now).run();
    }
    if (totalChanged && market.total !== null) {
      await db.prepare(`
        INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
        VALUES (?, ?, 'total', ?, ?, 'SportsRadar', ?, ?)
      `).bind(providerGameId, providerSport, market.total, now, now, now).run();
    }
    if (mlHomeChanged && market.moneylineHome !== null) {
      await db.prepare(`
        INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
        VALUES (?, ?, 'moneyline', ?, ?, 'SportsRadar', ?, ?)
      `).bind(providerGameId, providerSport, market.moneylineHome, now, now, now).run();
    }

    return true;
  };

  for (const game of games) {
    const providerGameId = String(game.game_id || '').trim();
    if (!providerGameId) continue;
    const existing = await db
      .prepare('SELECT id FROM sdio_games WHERE provider_game_id = ? AND sport = ?')
      .bind(providerGameId, sport)
      .first() as { id: number } | null;

    let gameRowId: number | null = null;
    if (existing?.id) {
      await db.prepare(`
        UPDATE sdio_games SET
          home_team = ?, away_team = ?, home_team_name = ?, away_team_name = ?,
          start_time = ?, status = ?, score_home = ?, score_away = ?,
          period = ?, clock = ?, venue = ?, channel = ?, league = ?, last_sync = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        game.home_team_code || game.home_team_name || 'HOME',
        game.away_team_code || game.away_team_name || 'AWAY',
        game.home_team_name || game.home_team_code || 'HOME',
        game.away_team_name || game.away_team_code || 'AWAY',
        game.start_time || now,
        game.status || 'SCHEDULED',
        game.home_score ?? null,
        game.away_score ?? null,
        game.period ?? null,
        game.clock ?? null,
        game.venue ?? null,
        game.broadcast ?? null,
        game.league || sport,
        now,
        now,
        existing.id
      ).run();
      gameRowId = Number(existing.id);
      gamesUpdated += 1;
    } else {
      const inserted = await db.prepare(`
        INSERT INTO sdio_games (
          provider_game_id, sport, league, home_team, away_team, home_team_name, away_team_name,
          start_time, status, score_home, score_away, period, clock, venue, channel,
          last_sync, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        providerGameId,
        sport,
        game.league || sport,
        game.home_team_code || game.home_team_name || 'HOME',
        game.away_team_code || game.away_team_name || 'AWAY',
        game.home_team_name || game.home_team_code || 'HOME',
        game.away_team_name || game.away_team_code || 'AWAY',
        game.start_time || now,
        game.status || 'SCHEDULED',
        game.home_score ?? null,
        game.away_score ?? null,
        game.period ?? null,
        game.clock ?? null,
        game.venue ?? null,
        game.broadcast ?? null,
        now,
        now,
        now
      ).run();
      gameRowId = Number(inserted.meta?.last_row_id || 0) || null;
      gamesUpserted += 1;
    }
    if (gameRowId) {
      upsertedGames.push({
        dbGameId: gameRowId,
        providerGameId,
        homeTeam: String(game.home_team_name || game.home_team_code || 'HOME'),
        awayTeam: String(game.away_team_name || game.away_team_code || 'AWAY'),
      });
    }

    if (sampleGames.length < 5) {
      sampleGames.push({
        league: String(game.league || sport),
        home: String(game.home_team_name || game.home_team_code || 'HOME'),
        away: String(game.away_team_name || game.away_team_code || 'AWAY'),
        startTime: String(game.start_time || now),
      });
    }

    const hasOdds = gameRowId && (
      game.spread !== undefined ||
      game.overUnder !== undefined ||
      game.moneylineHome !== undefined ||
      game.moneylineAway !== undefined
    );
    if (!hasOdds || !gameRowId) continue;

    const wrote = await writeOddsSnapshot(gameRowId, providerGameId, {
      spreadHome: game.spread ?? null,
      spreadAway: game.spreadAway ?? (typeof game.spread === 'number' ? -game.spread : null),
      total: game.overUnder ?? null,
      moneylineHome: game.moneylineHome ?? null,
      moneylineAway: game.moneylineAway ?? null,
    });
    if (wrote) {
      oddsUpserted += 1;
    }
  }

  const oddsApiKey = env.SPORTSRADAR_ODDS_KEY || null;
  // Pull canonical market odds when available, then map into sdio_odds_current
  // even if game feed itself didn't include line fields.
  if (upsertedGames.length > 0) {
    const date = getTodayEasternDateString();
    const apiKey = env.SPORTSRADAR_API_KEY || oddsApiKey;
    if (apiKey) {
      const oddsMap = await fetchSportsRadarOdds(providerSport, apiKey, db, date, oddsApiKey || undefined);
      const normalizeTeamToken = (name: string) => name.split(' ').pop()?.toLowerCase() || name.toLowerCase();
      const toSportEventId = (providerGameId: string) => {
        if (providerGameId.startsWith('sr:sport_event:')) return providerGameId;
        if (providerGameId.startsWith('sr_')) {
          const parts = providerGameId.split('_');
          if (parts.length >= 3) return `sr:sport_event:${parts.slice(2).join('-')}`;
        }
        return providerGameId;
      };

      for (const row of upsertedGames) {
        const sportEventId = toSportEventId(row.providerGameId);
        const keyByTeams = `${providerSport}|${normalizeTeamToken(row.awayTeam)}|${normalizeTeamToken(row.homeTeam)}`;
        const keyByFullNames = `${providerSport}|${row.awayTeam.toLowerCase()}|${row.homeTeam.toLowerCase()}`;
        const odds =
          oddsMap.get(sportEventId) ||
          oddsMap.get(row.providerGameId) ||
          oddsMap.get(keyByTeams) ||
          oddsMap.get(keyByFullNames);
        if (!odds) continue;

        const wrote = await writeOddsSnapshot(row.dbGameId, row.providerGameId, {
          spreadHome: odds.spreadHome ?? odds.spread ?? null,
          spreadAway: odds.spreadAway ?? (typeof odds.spread === 'number' ? -odds.spread : null),
          total: odds.total ?? null,
          moneylineHome: odds.moneylineHome ?? null,
          moneylineAway: odds.moneylineAway ?? null,
        });
        if (wrote) {
          oddsUpserted += 1;
        }
      }
    }
  }

  const playerPropsKey = env.SPORTSRADAR_PLAYER_PROPS_KEY || env.SPORTSRADAR_PROPS_KEY || env.SPORTSRADAR_API_KEY;
  if (upsertedGames.length > 0 && playerPropsKey) {
    const toCanonicalPropType = (value: unknown): string => {
      const upper = String(value || '').trim().toUpperCase();
      if (!upper) return '';
      if (upper.includes('POINT')) return 'POINTS';
      if (upper.includes('REBOUND')) return 'REBOUNDS';
      if (upper.includes('ASSIST')) return 'ASSISTS';
      return upper.replace(/[^A-Z0-9]+/g, '_');
    };

    for (const row of upsertedGames) {
      let props = await fetchGamePlayerProps(
        row.providerGameId,
        providerSport,
        row.homeTeam,
        row.awayTeam,
        playerPropsKey,
        'SCHEDULED'
      );
      if (!Array.isArray(props) || props.length === 0) {
        props = await fetchGamePlayerProps(
          row.providerGameId,
          providerSport,
          row.homeTeam,
          row.awayTeam,
          playerPropsKey,
          'IN_PROGRESS'
        );
      }
      if (!Array.isArray(props) || props.length === 0) continue;

      const grouped = new Map<string, { playerName: string; propType: string; team: string | null; values: number[] }>();
      for (const p of props) {
        const playerName = String(p?.player_name || '').trim();
        if (!playerName) continue;
        const propType = toCanonicalPropType(p?.prop_type);
        if (!propType) continue;
        const line = Number(p?.line);
        if (!Number.isFinite(line) || line <= 0) continue;
        const key = `${playerName}::${propType}`;
        const bucket = grouped.get(key) || {
          playerName,
          propType,
          team: null,
          values: [],
        };
        bucket.values.push(line);
        grouped.set(key, bucket);
      }

      for (const bucket of grouped.values()) {
        const freq = new Map<string, number>();
        for (const line of bucket.values) {
          const k = String(Math.round(line * 100) / 100);
          freq.set(k, (freq.get(k) || 0) + 1);
        }
        const bestLine = [...freq.entries()]
          .sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!bestLine) continue;
        const lineValue = Number(bestLine);
        if (!Number.isFinite(lineValue) || lineValue <= 0) continue;
        const wrote = await writePropSnapshot(row.dbGameId, {
          playerName: bucket.playerName,
          team: bucket.team,
          propType: bucket.propType,
          lineValue,
        });
        if (wrote) propsUpserted += 1;
      }
    }
  }

  return { gamesUpserted, gamesUpdated, oddsUpserted, propsUpserted, sampleGames };
}

async function runSportsRadarPrimaryRefresh(
  db: any,
  env: Bindings,
  sports: string[]
): Promise<{
  sports: Array<{ sport: string; gamesUpserted: number; gamesUpdated: number; oddsUpserted: number; propsUpserted: number }>;
  totals: { gamesUpserted: number; gamesUpdated: number; oddsUpserted: number; propsUpserted: number };
}> {
  const normalized = sports
    .map((s) => String(s || '').toUpperCase())
    .filter((s) => Boolean(PROVIDER_SPORT_MAP[s]));
  const uniqueSports = Array.from(new Set(normalized));
  const results: Array<{ sport: string; gamesUpserted: number; gamesUpdated: number; oddsUpserted: number; propsUpserted: number }> = [];
  let gamesUpserted = 0;
  let gamesUpdated = 0;
  let oddsUpserted = 0;
  let propsUpserted = 0;

  for (const sport of uniqueSports) {
    const hydrated = await hydrateSportFromProviderFeed(db, env, sport);
    results.push({
      sport,
      gamesUpserted: hydrated.gamesUpserted,
      gamesUpdated: hydrated.gamesUpdated,
      oddsUpserted: hydrated.oddsUpserted,
      propsUpserted: hydrated.propsUpserted,
    });
    gamesUpserted += hydrated.gamesUpserted;
    gamesUpdated += hydrated.gamesUpdated;
    oddsUpserted += hydrated.oddsUpserted;
    propsUpserted += hydrated.propsUpserted;
  }

  return {
    sports: results,
    totals: { gamesUpserted, gamesUpdated, oddsUpserted, propsUpserted },
  };
}

// ============================================
// GET /api/sports-data/status
// ============================================

app.get('/status', async (c) => {
  const lockStatus = isLocked();
  
  const lastRefreshes = await c.env.DB.prepare(`
    SELECT sport, refresh_type, status, started_at, completed_at, 
           games_processed, odds_updated, props_updated
    FROM sdio_refresh_logs
    WHERE id IN (
      SELECT MAX(id) FROM sdio_refresh_logs GROUP BY sport, refresh_type
    )
    ORDER BY sport, refresh_type
  `).all();
  
  const gameCounts = await c.env.DB.prepare(`
    SELECT sport, status, COUNT(*) as count
    FROM sdio_games
    GROUP BY sport, status
  `).all();
  
  return c.json({
    lock: lockStatus,
    activeSports: ACTIVE_SPORTS,
    lastRefreshes: lastRefreshes.results || [],
    gameCounts: gameCounts.results || []
  });
});

// ============================================
// GET /api/sports-data/capabilities
// Returns provider capabilities for UI gating decisions
// ============================================

app.get('/capabilities', async (c) => {
  const masterKey = c.env.SPORTSRADAR_API_KEY;
  const oddsKey = c.env.SPORTSRADAR_ODDS_KEY;
  const propsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY || c.env.SPORTSRADAR_PROPS_KEY || c.env.SPORTSRADAR_API_KEY;
  const apiConfigured = Boolean(masterKey || oddsKey || propsKey);

  const capabilities = {
    hasGames: Boolean(masterKey),
    hasOdds: Boolean(oddsKey || masterKey),
    hasProps: Boolean(propsKey),
    hasPropsPregame: Boolean(propsKey),
    hasPropsInPlay: Boolean(propsKey),
    hasPropMovement: Boolean(propsKey),
    propMovementLookbackDays: propsKey ? 30 : 0,
    hasAlternateLines: Boolean(oddsKey || masterKey),
    hasFutures: Boolean(oddsKey || masterKey),
    hasDerivatives: Boolean(oddsKey || masterKey),
    hasLiveInGameLines: Boolean(oddsKey || masterKey),
    liveLineLatencyMs: (oddsKey || masterKey) ? 30000 : null,
    supportedSports: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER', 'MMA', 'GOLF'],
    hasPlayerImages: false,
    hasTeamLogos: true,
    mediaLicenseConfirmed: true,
  };
  
  return c.json({
    provider: 'SportsRadar',
    apiConfigured,
    capabilities,
    // Include quick-access flags for common UI checks
    features: {
      props: capabilities.hasProps,
      propMovement: capabilities.hasPropMovement,
      alternateLines: capabilities.hasAlternateLines,
      futures: capabilities.hasFutures,
      liveLines: capabilities.hasLiveInGameLines,
      playerImages: capabilities.hasPlayerImages,
      teamLogos: capabilities.hasTeamLogos,
    },
    supportedSports: capabilities.supportedSports,
  });
});

// ============================================
// POST /api/sports-data/connection-test
// Deprecated legacy connectivity test endpoint
// ============================================

app.post('/connection-test', demoOrAuthMiddleware, async (c) => {
  // Admin check (skip in demo mode)
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return c.json({
    success: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider connection test is disabled. Use /api/health/sportsradar.',
  }, 410);
});

// ============================================
// POST /api/sports-data/cache/clear
// Clears all cached provider responses
// ============================================

app.post('/cache/clear', demoOrAuthMiddleware, async (c) => {
  // Admin check (skip in demo mode)
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  
  try {
    // Get cache stats before clearing
    const statsBefore = getCacheStats();
    
    // Clear all cached responses
    clearAllCache();
    
    // Get cache stats after clearing
    const statsAfter = getCacheStats();
    
    console.log(`[ProviderCache] Cleared by admin. Entries before: ${statsBefore.size}, after: ${statsAfter.size}`);
    
    return c.json({
      success: true,
      message: 'Cache cleared successfully',
      statsBefore: {
        totalEntries: statsBefore.size,
        validEntries: statsBefore.entries.filter(e => e.valid).length
      },
      statsAfter: {
        totalEntries: statsAfter.size,
        validEntries: statsAfter.entries.filter(e => e.valid).length
      }
    });
  } catch (err: any) {
    console.error('[SDIO] Cache clear error:', err);
    return c.json({ 
      success: false, 
      error: err.message 
    }, 500);
  }
});

// ============================================
// GET /api/sports-data/cache/stats
// Returns D1 API cache statistics
// ============================================

app.get('/cache/stats', async (c) => {
  try {
    const memoryStats = getCacheStats();
    const d1Stats = await getD1CacheStats(c.env.DB);
    
    return c.json({
      success: true,
      memory: {
        totalEntries: memoryStats.size,
        validEntries: memoryStats.entries.filter(e => e.valid).length,
        expiredEntries: memoryStats.entries.filter(e => !e.valid).length,
      },
      d1: d1Stats,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Cache] Stats error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ============================================
// POST /api/sports-data/cache/cleanup
// Clears expired D1 cache entries
// ============================================

app.post('/cache/cleanup', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  
  try {
    const deletedCount = await clearExpiredCache(c.env.DB);
    console.log(`[Cache] Cleaned up ${deletedCount} expired entries`);
    
    return c.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired cache entries`,
      deletedCount
    });
  } catch (err: any) {
    console.error('[Cache] Cleanup error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ============================================
// POST /api/sports-data/cache/clear-provider/:provider
// Clears all cache for a specific provider
// ============================================

app.post('/cache/clear-provider/:provider', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  
  const provider = c.req.param('provider');
  
  try {
    const deletedCount = await clearProviderCache(c.env.DB, provider);
    console.log(`[Cache] Cleared ${deletedCount} entries for provider: ${provider}`);
    
    return c.json({
      success: true,
      message: `Cleared ${deletedCount} cache entries for ${provider}`,
      provider,
      deletedCount
    });
  } catch (err: any) {
    console.error('[Cache] Clear provider error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ============================================
// GET /api/sports-data/health
// Returns current provider health status
// ============================================

app.get('/health-status', async (c) => {
  const cacheStatsRaw = getCacheStats();
  const validEntries = cacheStatsRaw.entries.filter(e => e.valid).length;
  const providerChain = buildProviderChainSnapshot(c.env);
  const partnerAlerts = getPartnerAlerts();
  
  // Get last successful refresh from DB
  let lastSuccessfulRefresh = null;
  let lastError = null;
  
  try {
    const lastSuccess = await c.env.DB.prepare(`
      SELECT sport, refresh_type, completed_at 
      FROM sdio_refresh_logs 
      WHERE status = 'completed' 
      ORDER BY completed_at DESC 
      LIMIT 1
    `).first();
    
    if (lastSuccess) {
      lastSuccessfulRefresh = {
        sport: lastSuccess.sport,
        type: lastSuccess.refresh_type,
        timestamp: lastSuccess.completed_at
      };
    }
    
    const lastFailed = await c.env.DB.prepare(`
      SELECT sport, refresh_type, completed_at, error_message 
      FROM sdio_refresh_logs 
      WHERE status = 'failed' 
      ORDER BY completed_at DESC 
      LIMIT 1
    `).first();
    
    if (lastFailed) {
      lastError = {
        sport: lastFailed.sport,
        type: lastFailed.refresh_type,
        timestamp: lastFailed.completed_at,
        message: lastFailed.error_message
      };
    }
  } catch (err) {
    // DB query failed, continue with in-memory data
  }
  
  const remediation: Array<{ severity: 'info' | 'warning' | 'critical'; message: string; action: string }> = [];
  if (!c.env.SPORTSRADAR_API_KEY) {
    remediation.push({
      severity: 'critical',
      message: 'SPORTSRADAR_API_KEY is missing.',
      action: 'Set SPORTSRADAR_API_KEY and re-run /api/sports-data/refresh/master.',
    });
  }
  if (providerChain.telemetry.totals.fallbackEvents > 0) {
    remediation.push({
      severity: 'warning',
      message: 'Fallback provider was used recently.',
      action: 'Review provider telemetry and upstream SportsRadar response health.',
    });
  }
  if (providerChain.telemetry.totals.failures > providerChain.telemetry.totals.successes) {
    remediation.push({
      severity: 'warning',
      message: 'Recent provider failures exceed successes.',
      action: 'Inspect /api/sports-data/health telemetry and retry a manual refresh.',
    });
  }
  if (!c.env.SPORTSRADAR_API_KEY) {
    partnerAlerts.push({
      id: 'sportsradar-key-missing',
      severity: 'critical',
      category: 'auth',
      provider: 'SportsRadar',
      message: 'SPORTSRADAR_API_KEY is not configured.',
      nextAction: 'Set SPORTSRADAR_API_KEY and re-check partner health.',
      triggeredAt: new Date().toISOString(),
      metric: 'sportsradar_key_configured',
      value: 0,
      threshold: 1,
    });
  }

  return c.json({
    source: 'sportsradar_primary',
    activeProvider: providerChain.activeProvider,
    providerChain,
    cache: {
      totalEntries: cacheStatsRaw.size,
      validEntries: validEntries
    },
    lastSuccessfulRefresh,
    lastError,
    remediation,
    partnerAlerts,
    partnerAlertSummary: summarizeAlerts(partnerAlerts),
  });
});

// ============================================
// GET /api/sports-data/debug
// Deprecated legacy debug endpoint
// ============================================

app.get('/debug', async (c) => {
  return c.json({
    ok: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider debug endpoint is disabled. Use /api/health/sportsradar and /api/sports-data/health.',
  }, 410);
});

// ============================================
// Deprecated legacy multi-sport debug endpoint
// ============================================
app.get('/debug-legacy', async (c) => {
  return c.json({
    ok: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider debug endpoint is disabled. Use /api/health/sportsradar.',
  }, 410);
});

// ============================================
// GET /api/sports-data/health
// Provider health and API connectivity status
// ============================================

// Deprecated diagnostic endpoint
app.get('/test-refresh/:sport', async (c) => {
  return c.json({
    success: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider test-refresh endpoint is disabled. Use /api/sports-data/refresh/manual.',
  }, 410);
});

// ============================================
// GET /api/sports-data/diagnose
// Test API with multiple date ranges to find working data
// ============================================

app.get('/diagnose', async (c) => {
  return c.json({
    success: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider diagnose endpoint is disabled. Use /api/health/sportsradar.',
  }, 410);
});

app.get('/health', async (c) => {
  const providerChain = buildProviderChainSnapshot(c.env);
  const partnerAlerts = getPartnerAlerts();

  // Get DB stats
  const dbStats = await c.env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM sdio_games) as total_games,
      (SELECT COUNT(*) FROM sdio_games WHERE status = 'SCHEDULED' AND start_time > datetime('now', '-6 hours') AND start_time < datetime('now', '+8 days')) as upcoming_games,
      (SELECT COUNT(*) FROM sdio_games WHERE status = 'LIVE') as live_games,
      (SELECT COUNT(*) FROM sdio_odds_current) as odds_rows,
      (SELECT MAX(last_updated) FROM sdio_odds_current) as last_odds_update,
      (SELECT MAX(last_sync) FROM sdio_games) as last_game_sync
  `).first();

  // Get per-sport stats from sdio_games
  const sportGamesStats = await c.env.DB.prepare(`
    SELECT 
      sport,
      COUNT(*) as total_games,
      SUM(CASE WHEN status = 'LIVE' THEN 1 ELSE 0 END) as live_games,
      SUM(CASE WHEN status = 'SCHEDULED' AND start_time > datetime('now', '-6 hours') AND start_time < datetime('now', '+8 days') THEN 1 ELSE 0 END) as upcoming_games,
      MAX(last_sync) as last_sync,
      MIN(start_time) as earliest_game,
      MAX(start_time) as latest_game
    FROM sdio_games
    GROUP BY sport
  `).all();

  // Get latest refresh log per sport
  const refreshLogs = await c.env.DB.prepare(`
    SELECT 
      sport,
      refresh_type,
      started_at,
      completed_at,
      status,
      games_processed,
      odds_updated,
      props_updated,
      errors
    FROM sdio_refresh_logs
    WHERE id IN (
      SELECT MAX(id) FROM sdio_refresh_logs GROUP BY sport
    )
    ORDER BY sport
  `).all();

  // Build per-sport status map
  const sportStatusMap = new Map<string, {
    sport: string;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'no_data';
    totalGames: number;
    liveGames: number;
    upcomingGames: number;
    lastSync: string | null;
    lastRefresh: {
      type: string;
      startedAt: string;
      completedAt: string | null;
      status: string;
      gamesProcessed: number;
      oddsUpdated: number;
      propsUpdated: number;
      error: string | null;
    } | null;
    dateRange: { earliest: string | null; latest: string | null };
  }>();

  // Initialize all active sports
  const ACTIVE_SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER'];
  for (const sport of ACTIVE_SPORTS) {
    sportStatusMap.set(sport, {
      sport,
      status: 'no_data',
      totalGames: 0,
      liveGames: 0,
      upcomingGames: 0,
      lastSync: null,
      lastRefresh: null,
      dateRange: { earliest: null, latest: null }
    });
  }

  // Populate from game stats
  if (sportGamesStats.results) {
    for (const row of sportGamesStats.results as Array<{
      sport: string;
      total_games: number;
      live_games: number;
      upcoming_games: number;
      last_sync: string | null;
      earliest_game: string | null;
      latest_game: string | null;
    }>) {
      const existing = sportStatusMap.get(row.sport);
      if (existing) {
        existing.totalGames = row.total_games ?? 0;
        existing.liveGames = row.live_games ?? 0;
        existing.upcomingGames = row.upcoming_games ?? 0;
        existing.lastSync = row.last_sync;
        existing.dateRange = { earliest: row.earliest_game, latest: row.latest_game };
        existing.status = row.total_games > 0 ? 'healthy' : 'no_data';
      }
    }
  }

  // Populate from refresh logs
  if (refreshLogs.results) {
    for (const row of refreshLogs.results as Array<{
      sport: string;
      refresh_type: string;
      started_at: string;
      completed_at: string | null;
      status: string;
      games_processed: number;
      odds_updated: number;
      props_updated: number;
      errors: string | null;
    }>) {
      const existing = sportStatusMap.get(row.sport);
      if (existing) {
        existing.lastRefresh = {
          type: row.refresh_type,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          status: row.status,
          gamesProcessed: row.games_processed ?? 0,
          oddsUpdated: row.odds_updated ?? 0,
          propsUpdated: row.props_updated ?? 0,
          error: row.errors
        };
        
        // Update status based on refresh result
        if (row.status === 'FAILED' || row.errors) {
          if (row.errors?.includes('AUTH')) {
            existing.status = 'unhealthy';
          } else {
            existing.status = 'degraded';
          }
        }
      }
    }
  }

  const perSportStatus = Array.from(sportStatusMap.values());

  // Determine overall health status
  let overallStatus: 'healthy' | 'degraded' = 'healthy';
  const issues: string[] = [];
  const remediation: Array<{ severity: 'info' | 'warning' | 'critical'; message: string; action: string }> = [];
  
  const totalGames = dbStats?.total_games ?? 0;
  if (totalGames === 0) {
    issues.push('Database empty - no games synced. Trigger a Master Refresh.');
    remediation.push({
      severity: 'warning',
      message: 'No games available in local cache.',
      action: 'Trigger /api/sports-data/refresh/master and verify per-sport refresh logs.',
    });
  }

  // Check for per-sport issues
  const unhealthySports = perSportStatus.filter(s => s.status === 'unhealthy').map(s => s.sport);
  const degradedSports = perSportStatus.filter(s => s.status === 'degraded').map(s => s.sport);
  const noDataSports = perSportStatus.filter(s => s.status === 'no_data').map(s => s.sport);
  
  if (unhealthySports.length > 0) {
    overallStatus = 'degraded';
    issues.push(`Provider issues for: ${unhealthySports.join(', ')}`);
    remediation.push({
      severity: 'warning',
      message: `Per-sport provider issues detected: ${unhealthySports.join(', ')}`,
      action: 'Run targeted /api/sports-data/refresh/manual per affected sport.',
    });
  }
  if (degradedSports.length > 0 && overallStatus === 'healthy') {
    overallStatus = 'degraded';
    issues.push(`Refresh errors for: ${degradedSports.join(', ')}`);
    remediation.push({
      severity: 'warning',
      message: `Refresh errors detected: ${degradedSports.join(', ')}`,
      action: 'Inspect refresh logs and retry live refresh for impacted sports.',
    });
  }
  if (noDataSports.length === ACTIVE_SPORTS.length) {
    issues.push('No data for any sport - run a Master Refresh');
    remediation.push({
      severity: 'critical',
      message: 'No data available for any configured sport.',
      action: 'Run /api/sports-data/refresh/master and verify SportsRadar API key / quota.',
    });
  }

  if (!c.env.SPORTSRADAR_API_KEY) {
    overallStatus = 'degraded';
    issues.push('SPORTSRADAR_API_KEY not configured');
    remediation.push({
      severity: 'critical',
      message: 'SportsRadar primary key missing.',
      action: 'Configure SPORTSRADAR_API_KEY and re-run health checks.',
    });
  }

  if (providerChain.telemetry.totals.failures > providerChain.telemetry.totals.successes) {
    overallStatus = 'degraded';
    issues.push('Recent provider failures exceed successes');
    remediation.push({
      severity: 'warning',
      message: 'Fallback and failure rate is elevated.',
      action: 'Review provider telemetry categories (auth/rate_limit/timeout/upstream_5xx/no_data).',
    });
  }
  if (!c.env.SPORTSRADAR_API_KEY) {
    partnerAlerts.push({
      id: 'sportsradar-key-missing',
      severity: 'critical',
      category: 'auth',
      provider: 'SportsRadar',
      message: 'SPORTSRADAR_API_KEY is not configured.',
      nextAction: 'Set SPORTSRADAR_API_KEY and re-check partner health.',
      triggeredAt: new Date().toISOString(),
      metric: 'sportsradar_key_configured',
      value: 0,
      threshold: 1,
    });
  }
  let alertLifecycle = { escalatedCount: 0 };
  try {
    alertLifecycle = await runPartnerAlertLifecycle(
      c.env.DB as D1Database,
      c.env,
      partnerAlerts.map((alert) => ({
        severity: alert.severity,
        category: alert.category,
        provider: alert.provider,
        message: alert.message,
        nextAction: alert.nextAction,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
      }))
    );
  } catch (error) {
    console.warn('[sports-data/health] Failed running partner alert lifecycle:', error);
  }

  return c.json({
    status: overallStatus,
    issues,
    source: 'sportsradar_primary',
    activeProvider: providerChain.activeProvider,
    providerChain,
    database: {
      totalGames: dbStats?.total_games ?? 0,
      upcomingGames: dbStats?.upcoming_games ?? 0,
      liveGames: dbStats?.live_games ?? 0,
      oddsRows: dbStats?.odds_rows ?? 0,
      lastOddsUpdate: dbStats?.last_odds_update ?? null,
      lastGameSync: dbStats?.last_game_sync ?? null
    },
    perSportStatus,
    remediation,
    partnerAlerts,
    partnerAlertSummary: summarizeAlerts(partnerAlerts),
    partnerAlertLifecycle: alertLifecycle,
  });
});

// ============================================
// GET /api/sports-data/alerts
// Partner SLA-style alert view for operators
// ============================================
app.get('/alerts', async (c) => {
  const includeSnoozed = c.req.query('include_snoozed') === 'true';
  const includeAcknowledged = c.req.query('include_acknowledged') === 'true';
  const severityFilter = c.req.query('severity') as ('info' | 'warning' | 'critical' | undefined);
  const providerChain = buildProviderChainSnapshot(c.env);
  let partnerAlerts = getPartnerAlerts();
  if (!c.env.SPORTSRADAR_API_KEY) {
    partnerAlerts.push({
      id: 'sportsradar-key-missing',
      severity: 'critical',
      category: 'auth',
      provider: 'SportsRadar',
      message: 'SPORTSRADAR_API_KEY is not configured.',
      nextAction: 'Set SPORTSRADAR_API_KEY and re-check partner health.',
      triggeredAt: new Date().toISOString(),
      metric: 'sportsradar_key_configured',
      value: 0,
      threshold: 1,
    });
  }
  let alertLifecycle = { escalatedCount: 0 };
  try {
    alertLifecycle = await runPartnerAlertLifecycle(
      c.env.DB as D1Database,
      c.env,
      partnerAlerts.map((alert) => ({
        severity: alert.severity,
        category: alert.category,
        provider: alert.provider,
        message: alert.message,
        nextAction: alert.nextAction,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
      }))
    );
  } catch (error) {
    console.warn('[sports-data/alerts] Failed to run partner alert lifecycle:', error);
  }

  try {
    const activeControls = await getActiveAlertControlsByKey(c.env.DB as D1Database);
    partnerAlerts = partnerAlerts.filter((alert) => {
      const key = `${alert.category}:${alert.provider}`;
      const controls = activeControls.get(key);
      if (!controls) return true;
      alert.severity = controls.severity;
      if (!includeAcknowledged && controls.acknowledgedAt) return false;
      if (!includeSnoozed && isFutureIso(controls.snoozedUntil)) return false;
      return true;
    });
  } catch (error) {
    console.warn('[sports-data/alerts] Failed to apply alert controls:', error);
  }

  if (severityFilter && ['info', 'warning', 'critical'].includes(severityFilter)) {
    partnerAlerts = partnerAlerts.filter((alert) => alert.severity === severityFilter);
  }

  let history: unknown[] = [];
  try {
    history = await readPartnerAlertHistoryFiltered(c.env.DB as D1Database, {
      limit: 50,
      severity: severityFilter,
      includeSnoozed,
    });
  } catch (error) {
    console.warn('[sports-data/alerts] Failed to load partner alert history:', error);
  }

  return c.json({
    source: 'sportsradar_primary',
    activeProvider: providerChain.activeProvider,
    alerts: partnerAlerts,
    summary: summarizeAlerts(partnerAlerts),
    telemetry: providerChain.telemetry,
    lifecycle: alertLifecycle,
    history,
    generatedAt: new Date().toISOString(),
  });
});

app.get('/alerts/history', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const severity = c.req.query('severity') as ('info' | 'warning' | 'critical' | undefined);
  const status = c.req.query('status') as ('active' | 'resolved' | undefined);
  const sinceHours = parseInt(c.req.query('since_hours') || '0', 10);
  const includeSnoozed = c.req.query('include_snoozed') === 'true';
  try {
    const history = await readPartnerAlertHistoryFiltered(c.env.DB as D1Database, {
      limit,
      severity: severity && ['info', 'warning', 'critical'].includes(severity) ? severity : undefined,
      status: status && ['active', 'resolved'].includes(status) ? status : undefined,
      sinceHours: Number.isFinite(sinceHours) && sinceHours > 0 ? sinceHours : undefined,
      includeSnoozed,
    });
    return c.json({
      source: 'sportsradar_primary',
      count: history.length,
      history,
      filters: { limit, severity: severity || null, status: status || null, sinceHours: sinceHours || null, includeSnoozed },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      source: 'sportsradar_primary',
      count: 0,
      history: [],
      error: error?.message || 'Failed to read partner alert history',
      generatedAt: new Date().toISOString(),
    }, 500);
  }
});

app.post('/alerts/:id/ack', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'Invalid alert id' }, 400);
  }
  let actor = isDemoMode(c) ? 'demo-mode' : 'admin';
  let note = '';
  try {
    const body = await c.req.json();
    actor = (body?.actor || actor).toString().slice(0, 80);
    note = (body?.note || '').toString().slice(0, 300);
  } catch {
    // no body provided
  }
  try {
    await ensurePartnerAlertTable(c.env.DB as D1Database);
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(`
      UPDATE partner_alert_events
      SET acknowledged_at = ?,
          acknowledged_by = ?,
          updated_at = ?,
          snooze_reason = CASE WHEN ? != '' THEN ? ELSE snooze_reason END
      WHERE id = ?
    `).bind(now, actor, now, note, note, id).run();
    if (!result.success || (result.meta?.changes || 0) === 0) {
      return c.json({ error: 'Alert not found' }, 404);
    }
    const alert = await c.env.DB.prepare(`SELECT * FROM partner_alert_events WHERE id = ?`).bind(id).first();
    return c.json({ success: true, alert, message: 'Alert acknowledged' });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to acknowledge alert' }, 500);
  }
});

app.post('/alerts/:id/snooze', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'Invalid alert id' }, 400);
  }
  let minutes = 30;
  let reason = 'Operator snooze';
  try {
    const body = await c.req.json();
    minutes = Math.max(5, Math.min(Number(body?.minutes || 30), 24 * 60));
    reason = (body?.reason || reason).toString().slice(0, 300);
  } catch {
    // no body provided
  }
  const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  try {
    await ensurePartnerAlertTable(c.env.DB as D1Database);
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(`
      UPDATE partner_alert_events
      SET snoozed_until = ?,
          snooze_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(snoozedUntil, reason, now, id).run();
    if (!result.success || (result.meta?.changes || 0) === 0) {
      return c.json({ error: 'Alert not found' }, 404);
    }
    const alert = await c.env.DB.prepare(`SELECT * FROM partner_alert_events WHERE id = ?`).bind(id).first();
    return c.json({ success: true, alert, message: `Alert snoozed for ${minutes} minutes` });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to snooze alert' }, 500);
  }
});

// ============================================
// POST /api/sports-data/test/:sport
// Test API connectivity for a specific sport
// ============================================

app.post('/test/:sport', authMiddleware, async (c) => {
  if (!await isAdmin(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return c.json({
    success: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider sport test endpoint is disabled. Use /api/sports-data/refresh/manual and /api/health/sportsradar.',
  }, 410);
});

// ============================================
// GET /api/sports-data/logs
// ============================================

app.get('/logs', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const logs = await c.env.DB.prepare(
    'SELECT * FROM sdio_refresh_logs ORDER BY started_at DESC LIMIT ?'
  ).bind(limit).all();
  
  return c.json({ logs: logs.results || [] });
});

// ============================================
// GET /api/sports-data/games
// Returns games with odds data joined for Lines Center
// ============================================

app.get('/games', async (c) => {
  const sport = c.req.query('sport');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  
  // Build query that joins games with odds
  let query = `
    SELECT 
      g.id,
      g.provider_game_id as game_id,
      g.sport,
      g.home_team,
      g.away_team,
      g.start_time,
      LOWER(g.status) as status,
      g.score_home as home_score,
      g.score_away as away_score,
      g.period,
      g.clock,
      g.venue,
      o.spread_home,
      o.spread_away,
      o.total,
      o.moneyline_home,
      o.moneyline_away,
      o.open_spread,
      o.open_total,
      o.movement_spread,
      o.movement_total,
      o.last_updated as odds_updated_at
    FROM sdio_games g
    LEFT JOIN sdio_odds_current o ON g.id = o.game_id
    WHERE 1=1
  `;
  const params: any[] = [];
  
  if (sport) {
    query += ' AND g.sport = ?';
    params.push(sport.toUpperCase());
  }
  if (status) {
    // Map frontend status to database status
    const statusMap: Record<string, string> = {
      'live': 'LIVE',
      'scheduled': 'SCHEDULED',
      'final': 'FINAL'
    };
    query += ' AND g.status = ?';
    params.push(statusMap[status.toLowerCase()] || status.toUpperCase());
  }
  
  // Only return games within reasonable date range (past week to next 2 weeks)
  query += ` AND g.start_time >= datetime('now', '-7 days') AND g.start_time <= datetime('now', '+14 days')`;
  
  query += ' ORDER BY g.start_time ASC LIMIT ?';
  params.push(limit);
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  
  // Initialize SportsRadar provider if available
  if (c.env.SPORTSRADAR_API_KEY) {
    initSportsRadarGameProvider(c.env.SPORTSRADAR_API_KEY);
  }
  
  // Generate team codes from team names and fetch fresh scores for live/final games
  const games = await Promise.all((result.results || []).map(async (game: any) => {
    const homeCode = generateTeamCode(game.home_team, game.sport);
    const awayCode = generateTeamCode(game.away_team, game.sport);
    
    let enrichedGame = {
      ...game,
      home_team_code: homeCode,
      away_team_code: awayCode,
    };
    
    // Fetch fresh scores for in-progress or final games
    if (c.env.SPORTSRADAR_API_KEY && game.game_id && (game.status === 'in_progress' || game.status === 'final' || game.status === 'live')) {
      try {
        const freshScores = await fetchLiveScores(
          game.sport.toLowerCase() as ProviderSportKey,
          game.game_id
        );
        
        if (freshScores) {
          enrichedGame = {
            ...enrichedGame,
            home_score: freshScores.homeScore ?? enrichedGame.home_score,
            away_score: freshScores.awayScore ?? enrichedGame.away_score,
            status: freshScores.status?.toLowerCase() ?? enrichedGame.status,
            period: freshScores.period ?? enrichedGame.period,
            clock: freshScores.clock ?? enrichedGame.clock,
          };
        }
      } catch (err) {
        console.error(`[Games API] Failed to fetch fresh scores for ${game.game_id}:`, err);
        // Continue with DB data on error
      }
    }
    
    return enrichedGame;
  }));
  
  return c.json({ games });
});

// Generate short team code from team name
function generateTeamCode(teamName: string, _sport?: string): string {
  if (!teamName) return '???';
  
  // Common team abbreviations
  const TEAM_CODES: Record<string, string> = {
    // NFL
    'Kansas City Chiefs': 'KC', 'Buffalo Bills': 'BUF', 'San Francisco 49ers': 'SF',
    'Dallas Cowboys': 'DAL', 'Philadelphia Eagles': 'PHI', 'Green Bay Packers': 'GB',
    'Baltimore Ravens': 'BAL', 'Cincinnati Bengals': 'CIN', 'Miami Dolphins': 'MIA',
    'New York Jets': 'NYJ', 'New York Giants': 'NYG', 'New England Patriots': 'NE',
    'Pittsburgh Steelers': 'PIT', 'Cleveland Browns': 'CLE', 'Las Vegas Raiders': 'LV',
    'Los Angeles Chargers': 'LAC', 'Denver Broncos': 'DEN', 'Houston Texans': 'HOU',
    'Indianapolis Colts': 'IND', 'Tennessee Titans': 'TEN', 'Jacksonville Jaguars': 'JAX',
    'Atlanta Falcons': 'ATL', 'Carolina Panthers': 'CAR', 'New Orleans Saints': 'NO',
    'Tampa Bay Buccaneers': 'TB', 'Los Angeles Rams': 'LAR', 'Seattle Seahawks': 'SEA',
    'Arizona Cardinals': 'ARI', 'Minnesota Vikings': 'MIN', 'Chicago Bears': 'CHI',
    'Detroit Lions': 'DET', 'Washington Commanders': 'WAS',
    // NBA
    'Boston Celtics': 'BOS', 'Miami Heat': 'MIA', 'Los Angeles Lakers': 'LAL',
    'Golden State Warriors': 'GSW', 'Denver Nuggets': 'DEN', 'Phoenix Suns': 'PHX',
    'Milwaukee Bucks': 'MIL', 'New York Knicks': 'NYK', 'Brooklyn Nets': 'BKN',
    'Philadelphia 76ers': 'PHI', 'Cleveland Cavaliers': 'CLE', 'Chicago Bulls': 'CHI',
    'Toronto Raptors': 'TOR', 'Atlanta Hawks': 'ATL', 'Charlotte Hornets': 'CHA',
    'Orlando Magic': 'ORL', 'Indiana Pacers': 'IND', 'Detroit Pistons': 'DET',
    'Washington Wizards': 'WAS', 'Oklahoma City Thunder': 'OKC', 'Dallas Mavericks': 'DAL',
    'Houston Rockets': 'HOU', 'Memphis Grizzlies': 'MEM', 'New Orleans Pelicans': 'NOP',
    'San Antonio Spurs': 'SAS', 'Minnesota Timberwolves': 'MIN', 'Portland Trail Blazers': 'POR',
    'Utah Jazz': 'UTA', 'Sacramento Kings': 'SAC', 'LA Clippers': 'LAC',
    // MLB
    'New York Yankees': 'NYY', 'Boston Red Sox': 'BOS', 'Los Angeles Dodgers': 'LAD',
    'San Francisco Giants': 'SF', 'Atlanta Braves': 'ATL', 'Philadelphia Phillies': 'PHI',
    // NHL
    'Vegas Golden Knights': 'VGK', 'Colorado Avalanche': 'COL', 'New York Rangers': 'NYR',
    'New Jersey Devils': 'NJD', 'Toronto Maple Leafs': 'TOR', 'Boston Bruins': 'BOS',
    // Soccer
    'Manchester City': 'MCI', 'Arsenal': 'ARS', 'Liverpool': 'LIV', 'Chelsea': 'CHE',
    'Real Madrid': 'RMA', 'Barcelona': 'BAR', 'Manchester United': 'MUN',
  };
  
  // Check exact match first
  if (TEAM_CODES[teamName]) {
    return TEAM_CODES[teamName];
  }
  
  // Try partial match
  for (const [fullName, code] of Object.entries(TEAM_CODES)) {
    if (teamName.includes(fullName) || fullName.includes(teamName)) {
      return code;
    }
  }
  
  // Fallback: use first 3-4 characters of last word
  const words = teamName.split(' ');
  const lastWord = words[words.length - 1];
  return lastWord.substring(0, Math.min(4, lastWord.length)).toUpperCase();
}

// ============================================
// GET /api/sports-data/scores
// Returns games for Scores page with sport and window filters
// Reads from DB only - no external API calls
// ============================================

app.get('/scores', async (c) => {
  const sport = c.req.query('sport')?.toUpperCase() || 'NFL';
  const window = c.req.query('window') || 'today'; // live | today | tomorrow
  
  // Valid sports
  const validSports = ['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'NCAAF', 'NCAAB'];
  const normalizedSport = validSports.includes(sport) ? sport : 'NFL';
  
  // Build date ranges based on window
  let dateCondition = '';
  const now = new Date();
  
  if (window === 'live') {
    // Live games + recently finished (last 2 hours)
    dateCondition = `AND (g.status = 'LIVE' OR (g.status = 'FINAL' AND g.start_time >= datetime('now', '-2 hours')))`;
  } else if (window === 'tomorrow') {
    // Games starting tomorrow (Eastern calendar day).
    const tomorrowStr = getEasternDateStringOffset(1);
    dateCondition = `AND DATE(g.start_time) = '${tomorrowStr}'`;
  } else {
    // Today uses Eastern calendar day to match frontend schedule expectations.
    const todayStr = getTodayEasternDateString();
    dateCondition = `AND DATE(g.start_time) = '${todayStr}'`;
  }
  
  const query = `
    SELECT 
      g.id,
      g.provider_game_id as game_id,
      g.sport,
      g.home_team,
      g.away_team,
      g.start_time,
      g.status,
      g.score_home as home_score,
      g.score_away as away_score,
      g.period,
      g.clock,
      g.venue
    FROM sdio_games g
    WHERE g.sport = ?
    ${dateCondition}
    ORDER BY 
      CASE WHEN g.status = 'LIVE' THEN 0 
           WHEN g.status = 'SCHEDULED' THEN 1 
           ELSE 2 END,
      g.start_time ASC
    LIMIT 100
  `;
  
  try {
    const result = await c.env.DB.prepare(query).bind(normalizedSport).all();
    
    // Transform to match frontend Game type
    const games = (result.results || []).map((g: any) => {
      const homeCode = generateTeamCode(g.home_team, g.sport);
      const awayCode = generateTeamCode(g.away_team, g.sport);
      
      // Map DB status to frontend status
      const statusMap: Record<string, string> = {
        'LIVE': 'IN_PROGRESS',
        'SCHEDULED': 'SCHEDULED',
        'FINAL': 'FINAL',
        'POSTPONED': 'POSTPONED',
        'CANCELED': 'CANCELED'
      };
      
      return {
        game_id: g.game_id || `sdio_${g.id}`,
        sport: g.sport?.toLowerCase() || 'nfl',
        home_team_name: g.home_team,
        away_team_name: g.away_team,
        home_team_abbr: homeCode,
        away_team_abbr: awayCode,
        home_score: g.home_score,
        away_score: g.away_score,
        status: statusMap[g.status] || 'SCHEDULED',
        start_time: g.start_time,
        period_label: g.period || (g.clock ? `${g.period} ${g.clock}` : null),
        venue: g.venue,
      };
    });
    
    // Count total games for this sport regardless of window
    const totalResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM sdio_games WHERE sport = ?
    `).bind(normalizedSport).first();
    
    return c.json({ 
      games,
      sport: normalizedSport,
      window,
      totalInDb: totalResult?.total || 0,
      message: games.length === 0 
        ? `No ${normalizedSport} games available for ${window}. Try a different sport or time window.`
        : null
    });
  } catch (err) {
    console.error('Scores query error:', err);
    return c.json({ 
      games: [],
      sport: normalizedSport,
      window,
      error: 'Unable to load scores',
      message: `No games available for ${normalizedSport} ${window}. Try another sport.`
    });
  }
});

// ============================================
// GET /api/sports-data/odds/:gameId
// ============================================

app.get('/odds/:gameId', async (c) => {
  const gameId = parseInt(c.req.param('gameId'));
  if (isNaN(gameId)) {
    return c.json({ error: 'Invalid game ID' }, 400);
  }
  
  const current = await c.env.DB.prepare('SELECT * FROM sdio_odds_current WHERE game_id = ?')
    .bind(gameId).first();
  
  const history = await c.env.DB.prepare(
    'SELECT * FROM sdio_odds_history WHERE game_id = ? ORDER BY recorded_at DESC LIMIT 100'
  ).bind(gameId).all();
  
  return c.json({
    current: current || null,
    history: history.results || []
  });
});

// ============================================
// GET /api/sports-data/trends/:gameId
// Line history with betting trends for charts
// ============================================

app.get('/trends/:gameId', async (c) => {
  const gameId = c.req.param('gameId');
  
  // Try to find game in sdio_games table
  let dbGameId: number | null = null;
  
  // Handle demo_ prefixed IDs
  if (gameId.startsWith('demo_')) {
    // For demo games, return mock trend data
    return c.json({
      gameId,
      lineHistory: generateDemoLineHistory(),
      trends: {
        spreadMovement: { direction: 'toward_home', points: 1.5 },
        totalMovement: { direction: 'over', points: 2.0 },
        publicBetting: {
          spreadHome: 62,
          spreadAway: 38,
          totalOver: 55,
          totalUnder: 45,
          mlHome: 58,
          mlAway: 42
        },
        sharpAction: {
          indicator: 'home',
          confidence: 'medium',
          note: 'Line moving opposite of public action'
        }
      }
    });
  }
  
  // Look up real game
  const game = await c.env.DB.prepare(
    'SELECT id FROM sdio_games WHERE id = ? OR provider_game_id = ?'
  ).bind(gameId, gameId).first();
  
  if (game) {
    dbGameId = game.id;
  }
  
  if (!dbGameId) {
    return c.json({ error: 'Game not found' }, 404);
  }
  
  // Get odds history
  const history = await c.env.DB.prepare(`
    SELECT spread_home, spread_away, total, moneyline_home, moneyline_away, recorded_at
    FROM sdio_odds_history 
    WHERE game_id = ? 
    ORDER BY recorded_at ASC 
    LIMIT 200
  `).bind(dbGameId).all();
  
  // Get current odds
  const current = await c.env.DB.prepare(
    'SELECT * FROM sdio_odds_current WHERE game_id = ?'
  ).bind(dbGameId).first();
  
  // Calculate trends
  const historyData = history.results || [];
  const firstRecord = historyData[0];
  const lastRecord = historyData[historyData.length - 1] || current;
  
  let spreadMovement = { direction: 'none', points: 0 };
  let totalMovement = { direction: 'none', points: 0 };
  
  if (firstRecord && lastRecord) {
    const spreadDiff = (lastRecord.spread_home || 0) - (firstRecord.spread_home || 0);
    if (spreadDiff !== 0) {
      spreadMovement = {
        direction: spreadDiff < 0 ? 'toward_home' : 'toward_away',
        points: Math.abs(spreadDiff)
      };
    }
    
    const totalDiff = (lastRecord.total || 0) - (firstRecord.total || 0);
    if (totalDiff !== 0) {
      totalMovement = {
        direction: totalDiff > 0 ? 'over' : 'under',
        points: Math.abs(totalDiff)
      };
    }
  }
  
  return c.json({
    gameId,
    lineHistory: historyData.map((h: any) => ({
      timestamp: h.recorded_at,
      spread: h.spread_home,
      total: h.total,
      mlHome: h.moneyline_home,
      mlAway: h.moneyline_away
    })),
    current: current ? {
      spread: current.spread_home,
      total: current.total,
      mlHome: current.moneyline_home,
      mlAway: current.moneyline_away,
      openSpread: current.open_spread,
      openTotal: current.open_total
    } : null,
    trends: {
      spreadMovement,
      totalMovement,
      // Mock public betting percentages (would come from real data source)
      publicBetting: {
        spreadHome: 50 + Math.floor(Math.random() * 20) - 10,
        spreadAway: 0, // Will be calculated
        totalOver: 50 + Math.floor(Math.random() * 15) - 7,
        totalUnder: 0,
        mlHome: 50 + Math.floor(Math.random() * 25) - 12,
        mlAway: 0
      },
      sharpAction: determineSharpAction(spreadMovement, historyData.length)
    }
  });
});

// Generate demo line history data
function generateDemoLineHistory() {
  const history = [];
  const baseTime = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
  let spread = -3.5;
  let total = 47.5;
  let mlHome = -150;
  let mlAway = 130;
  
  for (let i = 0; i < 24; i++) {
    // Small random movements
    spread += (Math.random() - 0.45) * 0.5;
    total += (Math.random() - 0.5) * 0.5;
    mlHome += Math.floor((Math.random() - 0.5) * 10);
    mlAway = -mlHome + (mlHome > 0 ? -20 : 20);
    
    history.push({
      timestamp: new Date(baseTime + (i * 2 * 60 * 60 * 1000)).toISOString(),
      spread: Math.round(spread * 2) / 2, // Round to nearest 0.5
      total: Math.round(total * 2) / 2,
      mlHome: Math.round(mlHome),
      mlAway: Math.round(mlAway)
    });
  }
  
  return history;
}

// Determine if sharp action is present
function determineSharpAction(spreadMovement: any, historyCount: number) {
  if (historyCount < 5) {
    return { indicator: 'none', confidence: 'low', note: 'Insufficient data' };
  }
  
  if (spreadMovement.points >= 1.5) {
    return {
      indicator: spreadMovement.direction === 'toward_home' ? 'home' : 'away',
      confidence: spreadMovement.points >= 2.5 ? 'high' : 'medium',
      note: 'Significant line movement detected'
    };
  }
  
  return { indicator: 'none', confidence: 'low', note: 'No significant sharp action' };
}

// ============================================
// POST /api/sports-data/refresh/master
// ============================================

app.post('/refresh/master', demoOrAuthMiddleware, async (c) => {
  // Allow demo mode to bypass admin check
  if (!isDemoMode(c) && !await isAdmin(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  
  const lockStatus = isLocked();
  if (lockStatus.locked) {
    return c.json({ error: 'Refresh already in progress', lockedBy: lockStatus.by }, 409);
  }

  const sports = Object.keys(PROVIDER_SPORT_MAP);
  c.executionCtx.waitUntil(
    runSportsRadarPrimaryRefresh(c.env.DB, c.env, sports).catch(err => {
      console.error('[API] SportsRadar primary master refresh failed:', err);
    })
  );

  return c.json({
    message: 'SportsRadar primary master refresh started',
    source: 'sportsradar_primary',
    sports,
  }, 202);
});

// ============================================
// POST /api/sports-data/refresh/manual
// Manual single-sport refresh with auto-date-scan
// ============================================

app.post('/refresh/manual', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !await isAdmin(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  let body: { sport?: string; date?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  
  const sportParam = (body.sport || 'nhl').toLowerCase();
  const sportKey = sportParam.toUpperCase() as SportKey;
  const validSports: SportKey[] = ['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'NCAAB', 'NCAAF'];
  
  if (!validSports.includes(sportKey)) {
    return c.json({ 
      success: false, 
      error: `Invalid sport '${sportParam}'. Valid: ${validSports.join(', ')}`
    }, 400);
  }

  const fallback = await hydrateSportFromProviderFeed(c.env.DB, c.env, sportKey);
  return c.json({
    success: true,
    source: 'sportsradar_primary',
    sport: sportKey,
    gamesUpserted: fallback.gamesUpserted,
    gamesUpdated: fallback.gamesUpdated,
    oddsUpserted: fallback.oddsUpserted,
    propsUpserted: fallback.propsUpserted,
    sampleGames: fallback.sampleGames,
  }, 200);
  
  const baseUrl = 'https://api.sportsdata.io/v3';
  const sportPath = SPORT_PATH_MAP[sportParam] || sportParam;
  const startTime = Date.now();
  
  // Soccer competitions for v4 API
  const SOCCER_COMPETITIONS = ['EPL', 'MLS', 'UCL'];
  
  // Helper to fetch soccer games for a date (v4 API with competition endpoints)
  async function fetchSoccerGamesForDate(isoDate: string): Promise<{ count: number; games: any[] }> {
    const allGames: any[] = [];
    for (const competition of SOCCER_COMPETITIONS) {
      try {
        const url = `https://api.sportsdata.io/v4/soccer/scores/json/GamesByDate/${competition}/${isoDate}?key=${apiKey}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json() as any[];
          for (const game of data) {
            game._league = competition;
          }
          allGames.push(...data);
        }
      } catch (err) {
        console.log(`[MANUAL REFRESH] Soccer ${competition} error:`, err);
      }
    }
    return { count: allGames.length, games: allGames };
  }
  
  // Helper to fetch games for a date (v3 API for non-soccer)
  async function fetchGamesForDate(sdioDate: string): Promise<{ count: number; games: any[]; status: number; error?: string }> {
    const url = `${baseUrl}/${sportPath}/scores/json/GamesByDate/${sdioDate}?key=${apiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        return { count: 0, games: [], status: response.status, error: errorText.slice(0, 200) };
      }
      const data = await response.json() as any[];
      return { count: data.length, games: data, status: response.status };
    } catch (err: any) {
      return { count: 0, games: [], status: 0, error: err.message };
    }
  }
  
  let dateToUse = body.date;
  let gamesFromAPI: any[] = [];
  
  // If no date provided, auto-scan to find a date with games
  if (!dateToUse) {
    console.log(`[MANUAL REFRESH] Auto-scanning for ${sportKey} games...`);
    const now = new Date();
    
    for (let offset = -7; offset <= 14; offset++) {
      const testDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      const sdioDate = formatSDIODate(testDate);
      const isoDate = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}-${String(testDate.getDate()).padStart(2, '0')}`;
      
      // Soccer uses v4 API with competition endpoints
      if (sportKey === 'SOCCER') {
        const result = await fetchSoccerGamesForDate(isoDate);
        if (result.count > 0) {
          dateToUse = sdioDate;
          gamesFromAPI = result.games;
          console.log(`[MANUAL REFRESH] Found ${result.count} soccer games on ${isoDate}`);
          break;
        }
        continue;
      }
      
      // Non-soccer uses v3 API
      const result = await fetchGamesForDate(sdioDate);
      
      // Auth error
      if (result.status === 401 || result.status === 403) {
        return c.json({
          success: false,
          error: result.status === 401 
            ? `${sportKey} not included in your provider subscription`
            : 'Access forbidden',
          httpStatus: result.status,
          sport: sportKey
        }, 400);
      }
      
      if (result.count > 0) {
        dateToUse = sdioDate;
        gamesFromAPI = result.games;
        console.log(`[MANUAL REFRESH] Found ${result.count} games on ${sdioDate}`);
        break;
      }
    }
    
    if (!dateToUse) {
      return c.json({
        success: false,
        error: `No ${sportKey} games found in range (TODAY-7 to TODAY+14)`,
        sport: sportKey,
        durationMs: Date.now() - startTime
      });
    }
  } else {
    // Fetch the specified date
    if (sportKey === 'SOCCER') {
      // Convert SDIO date to ISO for v4 API
      const isoDate = dateToUse.replace(/(\d{4})-([A-Z]{3})-(\d{2})/, (_, y, m, d) => {
        const monthMap: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
        return `${y}-${monthMap[m] || '01'}-${d}`;
      });
      const result = await fetchSoccerGamesForDate(isoDate);
      gamesFromAPI = result.games;
    } else {
      const result = await fetchGamesForDate(dateToUse);
      if (result.status === 401 || result.status === 403) {
        return c.json({
          success: false,
          error: result.status === 401 
            ? `${sportKey} not included in your provider subscription`
            : 'Access forbidden',
          httpStatus: result.status,
          sport: sportKey
        }, 400);
      }
      gamesFromAPI = result.games;
    }
  }
  
  // Now save games to DB
  const db = c.env.DB;
  let gamesInserted = 0;
  let gamesUpdated = 0;
  const errors: string[] = [];
  
  for (const game of gamesFromAPI) {
    try {
      const providerGameId = String(game.GlobalGameID || game.GameID || game.GameId);
      const homeTeam = game.HomeTeam || game.HomeTeamKey || 'TBD';
      const awayTeam = game.AwayTeam || game.AwayTeamKey || 'TBD';
      // Full team names - use HomeTeamName if available (v4 soccer), else fall back to abbreviation
      const homeTeamName = game.HomeTeamName || homeTeam;
      const awayTeamName = game.AwayTeamName || awayTeam;
      const gameStartTime = game.DateTime || game.Day || new Date().toISOString();
      const status = game.Status || 'Scheduled';
      const scoreHome = game.HomeTeamScore ?? game.HomeScore ?? null;
      const scoreAway = game.AwayTeamScore ?? game.AwayScore ?? null;
      const period = game.Period ?? game.Quarter ?? game.Inning ?? null;
      const clock = game.TimeRemainingMinutes != null ? `${game.TimeRemainingMinutes}:${String(game.TimeRemainingSeconds || 0).padStart(2, '0')}` : null;
      const venue = game.StadiumID ? `Stadium ${game.StadiumID}` : (game.Stadium || null);
      const channel = game.Channel || null;
      // For soccer, use the competition code from _league; for other sports, use sport key
      const league = game._league || sportKey;
      const nowStr = new Date().toISOString();
      
      const existing = await db
        .prepare('SELECT id FROM sdio_games WHERE provider_game_id = ? AND sport = ?')
        .bind(providerGameId, sportKey)
        .first() as { id: number } | null;
      
      if (existing) {
        await db.prepare(`
          UPDATE sdio_games SET
            home_team = ?, away_team = ?, home_team_name = ?, away_team_name = ?,
            start_time = ?, status = ?, score_home = ?, score_away = ?, 
            period = ?, clock = ?, venue = ?, channel = ?, league = ?, last_sync = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          homeTeam, awayTeam, homeTeamName, awayTeamName,
          gameStartTime, status, scoreHome, scoreAway, period, clock,
          venue, channel, league, nowStr, nowStr, existing.id
        ).run();
        gamesUpdated++;
      } else {
        await db.prepare(`
          INSERT INTO sdio_games (
            provider_game_id, sport, league, home_team, away_team, home_team_name, away_team_name,
            start_time, status, score_home, score_away, period, clock, venue, channel, last_sync,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          providerGameId, sportKey, league, homeTeam, awayTeam, homeTeamName, awayTeamName,
          gameStartTime, status, scoreHome, scoreAway,
          period, clock, venue, channel, nowStr, nowStr, nowStr
        ).run();
        gamesInserted++;
      }
    } catch (e) {
      errors.push(`Game error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  // Now fetch odds for this date
  let oddsInserted = 0;
  try {
    const isoDate = dateToUse.replace(/-([A-Z]{3})-/, (_, m) => {
      const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
      return `-${months[m] || '01'}-`;
    });
    const oddsUrl = `${baseUrl}/${sportPath}/odds/json/GameOddsByDate/${isoDate}?key=${apiKey}`;
    const oddsRes = await fetch(oddsUrl);
    
    if (oddsRes.ok) {
      const oddsData = await oddsRes.json() as any[];
      const nowStr = new Date().toISOString();
      
      for (const gameOdds of oddsData) {
        const providerGameId = String(gameOdds.GlobalGameID || gameOdds.GameID || gameOdds.GameId);
        const pregame = gameOdds.PregameOdds?.[0];
        
        // Look up the game's DB id
        const gameRecord = await db
          .prepare('SELECT id FROM sdio_games WHERE provider_game_id = ? AND sport = ?')
          .bind(providerGameId, sportKey)
          .first() as { id: number } | null;
        const dbGameId = gameRecord?.id;
        
        if (pregame && dbGameId) {
          try {
            // Check if exists using game_id FK
            const existingOdds = await db
              .prepare('SELECT id FROM sdio_odds_current WHERE game_id = ?')
              .bind(dbGameId)
              .first() as { id: number } | null;
            
            if (existingOdds) {
              await db.prepare(`
                UPDATE sdio_odds_current SET
                  spread_home = ?, spread_away = ?, 
                  total = ?, moneyline_home = ?, moneyline_away = ?,
                  last_updated = ?, updated_at = ?
                WHERE id = ?
              `).bind(
                pregame.HomePointSpread ?? null,
                pregame.AwayPointSpread ?? null,
                pregame.OverUnder ?? null,
                pregame.HomeMoneyLine ?? null,
                pregame.AwayMoneyLine ?? null,
                nowStr, nowStr,
                existingOdds.id
              ).run();
            } else {
              await db.prepare(`
                INSERT INTO sdio_odds_current (
                  game_id, spread_home, spread_away,
                  total, moneyline_home, moneyline_away, 
                  open_spread, open_total, open_moneyline_home, open_moneyline_away,
                  last_updated, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                dbGameId, 
                pregame.HomePointSpread ?? null, pregame.AwayPointSpread ?? null,
                pregame.OverUnder ?? null, pregame.HomeMoneyLine ?? null, pregame.AwayMoneyLine ?? null,
                pregame.HomePointSpread ?? null, pregame.OverUnder ?? null, 
                pregame.HomeMoneyLine ?? null, pregame.AwayMoneyLine ?? null,
                nowStr, nowStr, nowStr
              ).run();
            }
            oddsInserted++;
          } catch (e) {
            errors.push(`Odds error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
  } catch (e) {
    errors.push(`Odds fetch error: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // Get final DB counts
  const dbCounts = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM sdio_games WHERE sport = ?) as games,
      (SELECT COUNT(*) FROM sdio_odds_current WHERE game_id IN (SELECT id FROM sdio_games WHERE sport = ?)) as odds
  `).bind(sportKey, sportKey).first() as { games: number; odds: number } | null;
  
  const durationMs = Date.now() - startTime;
  console.log(`[MANUAL REFRESH] Complete: ${gamesInserted} inserted, ${gamesUpdated} updated, ${oddsInserted} odds in ${durationMs}ms`);
  
  return c.json({
    success: true,
    sport: sportKey,
    dateUsed: dateToUse,
    gamesFromAPI: gamesFromAPI.length,
    gamesInserted,
    gamesUpdated,
    oddsInserted,
    errors: errors.length > 0 ? errors : undefined,
    dbCountsAfter: {
      games: dbCounts?.games ?? 0,
      odds: dbCounts?.odds ?? 0
    },
    durationMs
  });
});

// ============================================
// POST /api/sports-data/refresh/full-sync
// Synchronous full refresh with detailed results for admin modal
// ============================================

app.post('/refresh/full-sync', authMiddleware, async (c) => {
  if (!await isAdmin(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const lockStatus = isLocked();
  if (lockStatus.locked) {
    return c.json({ 
      success: false, 
      error: 'Refresh already in progress', 
      lockedBy: lockStatus.by,
      games_inserted: 0,
      odds_inserted: 0,
      props_inserted: 0,
      errors: [`Blocked by ${lockStatus.by} refresh`],
      execution_time_ms: 0
    }, 409);
  }

  const startTime = Date.now();
  try {
    const sports = Object.keys(PROVIDER_SPORT_MAP);
    console.log('[API] Starting synchronous SportsRadar primary full refresh...');
    const results = await runSportsRadarPrimaryRefresh(c.env.DB, c.env, sports);
    const executionTimeMs = Date.now() - startTime;

    // Get updated DB counts
    const dbStats = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM sdio_games) as total_games,
        (SELECT COUNT(*) FROM sdio_odds_current) as total_odds,
        (SELECT COUNT(*) FROM sdio_props_current) as total_props
    `).first();

    return c.json({
      success: true,
      source: 'sportsradar_primary',
      games_inserted: results.totals.gamesUpserted + results.totals.gamesUpdated,
      odds_inserted: results.totals.oddsUpserted,
      props_inserted: results.totals.propsUpserted,
      errors: [],
      execution_time_ms: executionTimeMs,
      sport_results: results.sports.map((r) => ({
        sport: r.sport,
        games: r.gamesUpserted + r.gamesUpdated,
        odds: r.oddsUpserted,
        props: r.propsUpserted,
        status: 'completed',
        errors: []
      })),
      database_totals: {
        total_games: dbStats?.total_games ?? 0,
        total_odds: dbStats?.total_odds ?? 0,
        total_props: dbStats?.total_props ?? 0
      }
    });
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[API] Full refresh failed:', errorMsg);
    
    return c.json({
      success: false,
      error: errorMsg,
      games_inserted: 0,
      odds_inserted: 0,
      props_inserted: 0,
      errors: [errorMsg],
      execution_time_ms: executionTimeMs
    }, 500);
  }
});

// ============================================
// POST /api/sports-data/refresh/live
// ============================================

app.post('/refresh/live', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !await isAdmin(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  
  const lockStatus = isLocked();
  if (lockStatus.locked && lockStatus.by === 'MASTER') {
    return c.json({ error: 'Master refresh in progress' }, 409);
  }

  const liveRows = await c.env.DB.prepare(`
    SELECT DISTINCT UPPER(sport) AS sport
    FROM sdio_games
    WHERE status IN ('LIVE', 'IN_PROGRESS', 'in_progress', 'live')
  `).all<{ sport: string }>();
  const sports = (liveRows.results || [])
    .map((r) => String(r.sport || '').toUpperCase())
    .filter((s) => Boolean(PROVIDER_SPORT_MAP[s]));
  const targetSports = sports.length > 0 ? sports : Object.keys(PROVIDER_SPORT_MAP);

  c.executionCtx.waitUntil(
    runSportsRadarPrimaryRefresh(c.env.DB, c.env, targetSports).catch(err => {
      console.error('[API] SportsRadar primary live refresh failed:', err);
    })
  );

  return c.json({
    message: 'SportsRadar primary live refresh started',
    source: 'sportsradar_primary',
    sports: targetSports,
  }, 202);
});

// ============================================
// GET /api/sports-data/props/test-api - Diagnostic endpoint to test props API
// ============================================
app.get('/props/test-api', async (c) => {
  return c.json({
    success: false,
    deprecated: true,
    source: 'sportsradar_primary',
    message: 'Legacy provider props test endpoint is disabled. Use /api/sports-data/sportsradar/test-props.',
  }, 410);
});

app.all('/mma/*', async (c) => c.json({
  success: false,
  deprecated: true,
  source: 'sportsradar_primary',
  message: 'Legacy MMA provider routes are disabled in SportsRadar-only mode.',
}, 410));

app.all('/golf/*', async (c) => c.json({
  success: false,
  deprecated: true,
  source: 'sportsradar_primary',
  message: 'Legacy golf provider routes are disabled in SportsRadar-only mode.',
}, 410));

app.get('/props/debug/:gameId', async (c) => c.json({
  success: false,
  deprecated: true,
  source: 'sportsradar_primary',
  message: 'Legacy props debug route is disabled in SportsRadar-only mode.',
}, 410));

// ============================================
// Legacy MMA/Golf/props debug block removed
// ============================================


// ============================================
// SPORTSRADAR API ENDPOINTS
// ============================================

import { 
  getSportsRadarHealth,
  fetchDailySchedule,
  fetchDailyProps
} from '../services/sports-data/sportsRadarProvider';

// Helper: Get SportsRadar API keys with master key fallback
// If SPORTSRADAR_API_KEY (master key) is set, use it for all APIs
// Otherwise fall back to sport-specific keys
function getSportsRadarKeys(env: any): { golfKey: string | null; propsKey: string | null } {
  const masterKey = env.SPORTSRADAR_API_KEY;
  const golfKey = env.SPORTSRADAR_GOLF_KEY;
  // Check both SPORTSRADAR_PLAYER_PROPS_KEY (new) and SPORTSRADAR_PROPS_KEY (legacy)
  const propsKey = env.SPORTSRADAR_PLAYER_PROPS_KEY || env.SPORTSRADAR_PROPS_KEY;
  
  return {
    golfKey: masterKey || golfKey || null,
    propsKey: propsKey || masterKey || null
  };
}

// GET /api/sports-data/sportsradar/test-golf - Test SportsRadar Golf API
// Uses confirmed production endpoint with rate limit awareness
app.get('/sportsradar/test-golf', async (c) => {
  const { golfKey } = getSportsRadarKeys(c.env);
  
  if (!golfKey) {
    return c.json({
      provider: 'SportsRadar',
      endpoint: 'Golf API v3 (production)',
      keyConfigured: false,
      error: 'SPORTSRADAR_API_KEY not configured'
    });
  }
  
  const year = new Date().getFullYear();
  
  // Use confirmed working endpoint pattern (production access)
  // URL format: /golf/{access_level}/{tour}/v3/{language}/{year}/tournaments/schedule.json
  const url = `https://api.sportradar.com/golf/production/pga/v3/en/${year}/tournaments/schedule.json?api_key=${golfKey}`;
  
  try {
    const response = await fetch(url);
    const status = response.status;
    
    // Rate limited - return guidance
    if (status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return c.json({
        provider: 'SportsRadar',
        endpoint: 'Golf API v3 (production)',
        keyConfigured: true,
        status: 429,
        rateLimited: true,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : 60,
        message: 'Rate limited - SportsRadar limits API calls. Wait a minute and try again. The 429 confirms your API key is valid.'
      });
    }
    
    // Unauthorized - wrong key
    if (status === 401 || status === 403) {
      return c.json({
        provider: 'SportsRadar',
        endpoint: 'Golf API v3 (production)',
        keyConfigured: true,
        status,
        error: 'Invalid API key or Golf API not included in subscription'
      });
    }
    
    // Success - parse and return data
    if (response.ok) {
      const data = await response.json() as any;
      const tournaments = data.tournaments || [];
      
      // Find current/upcoming tournaments
      const now = new Date();
      const upcoming = tournaments.filter((t: any) => {
        const endDate = t.end_date ? new Date(t.end_date) : null;
        return !endDate || endDate >= now;
      });
      
      return c.json({
        provider: 'SportsRadar',
        endpoint: 'Golf API v3 (production)',
        keyConfigured: true,
        status: 200,
        success: true,
        totalTournaments: tournaments.length,
        upcomingTournaments: upcoming.length,
        nextTournament: upcoming[0] ? {
          id: upcoming[0].id,
          name: upcoming[0].name,
          startDate: upcoming[0].start_date,
          endDate: upcoming[0].end_date,
          venue: upcoming[0].venue?.name || 'TBD',
          status: upcoming[0].status
        } : null,
        sampleTournaments: tournaments.slice(0, 3).map((t: any) => ({
          id: t.id,
          name: t.name,
          startDate: t.start_date
        }))
      });
    }
    
    // Other error
    let errorText = '';
    try { errorText = await response.text(); } catch (_) {}
    
    return c.json({
      provider: 'SportsRadar',
      endpoint: 'Golf API v3 (production)',
      keyConfigured: true,
      status,
      error: errorText.substring(0, 200)
    });
    
  } catch (err) {
    return c.json({
      provider: 'SportsRadar',
      endpoint: 'Golf API v3 (production)',
      keyConfigured: true,
      status: 0,
      error: `Network error: ${err}`
    });
  }
});

// GET /api/sports-data/sportsradar/test-props - Test SportsRadar Props API
app.get('/sportsradar/test-props', async (c) => {
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const sampleEventId = c.req.query('event_id');
  
  const provider = getSportsRadarProvider(golfKey, propsKey);
  const result = await provider.testPropsApi(sampleEventId || undefined);
  
  return c.json({
    provider: 'SportsRadar',
    endpoint: 'Odds Comparison Live Odds v2 - Player Props',
    keyConfigured: !!propsKey,
    ...result
  });
});

// GET /api/sports-data/sportsradar/health - Get SportsRadar provider health
app.get('/sportsradar/health', async (c) => {
  const health = getSportsRadarHealth();
  
  return c.json({
    provider: 'SportsRadar',
    ...health
  });
});

// GET /api/sports-data/sportsradar/golf/leaderboard/:tournamentId - Fetch leaderboard
// Returns data normalized to match frontend TournamentData interface
app.get('/sportsradar/golf/leaderboard/:tournamentId', async (c) => {
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const tournamentId = c.req.param('tournamentId');
  
  if (!golfKey) {
    return c.json({ error: 'SportsRadar API key not configured - add SPORTSRADAR_API_KEY or SPORTSRADAR_GOLF_KEY' }, 500);
  }
  
  const provider = getSportsRadarProvider(golfKey, propsKey);
  const result = await provider.fetchGolfLeaderboard(tournamentId);
  
  if (result.errors.length > 0 && !result.tournament) {
    return c.json({ error: result.errors.join(', ') }, 500);
  }
  
  // Transform SportsRadar data to frontend TournamentData format
  const tournament = result.tournament as any;
  const rawLeaderboard = result.leaderboard as any[] || [];
  
  // Normalize tournament
  const normalizedTournament = {
    tournamentId: tournament?.id || tournamentId,
    name: tournament?.name || 'Tournament',
    startDate: tournament?.start_date || '',
    endDate: tournament?.end_date || '',
    venue: tournament?.venue?.name || tournament?.courses?.[0]?.name || '',
    location: tournament?.venue?.city ? `${tournament.venue.city}, ${tournament.venue.state || tournament.venue.country}` : '',
    purse: tournament?.purse || 0,
    par: tournament?.courses?.[0]?.par || 72,
    yards: tournament?.courses?.[0]?.yardage || null,
    status: tournament?.status === 'inprogress' ? 'in_progress' : 
            tournament?.status === 'closed' ? 'final' : 
            tournament?.status || 'scheduled',
    isOver: tournament?.status === 'closed',
    currentRound: tournament?.current_round || null,
  };
  
  // Normalize leaderboard players
  const normalizedLeaderboard = rawLeaderboard.map((player: any, idx: number) => {
    const rounds = (player.rounds || []).map((r: any) => ({
      round: r.number || r.sequence || idx + 1,
      score: r.score ?? null,
      strokes: r.strokes ?? null,
      par: null,
      birdies: r.birdies ?? null,
      bogeys: r.bogeys ?? null,
    }));
    
    return {
      playerId: player.id || idx,
      playerTournamentId: player.id || idx,
      name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || player.name || 'Unknown',
      rank: player.position ?? null,
      country: player.country || '',
      totalScore: player.score ?? 0,
      totalStrokes: player.strokes ?? 0,
      totalThrough: player.thru !== undefined ? String(player.thru) : null,
      earnings: player.money ?? null,
      fedExPoints: player.points ?? null,
      rounds,
      isWithdrawn: player.status === 'WD',
      madeCut: player.status !== 'CUT' ? null : false,
      teeTime: null,
      streak: player.streak || null,
      birdies: rounds.reduce((sum: number, r: any) => sum + (r.birdies || 0), 0),
      pars: rounds.reduce((sum: number, r: any) => sum + (r.pars || 0), 0),
      bogeys: rounds.reduce((sum: number, r: any) => sum + (r.bogeys || 0), 0),
      eagles: rounds.reduce((sum: number, r: any) => sum + (r.eagles || 0), 0),
      doubleEagles: 0,
      doubleBogeys: rounds.reduce((sum: number, r: any) => sum + (r.double_bogeys || 0), 0),
    };
  });
  
  return c.json({
    tournament: normalizedTournament,
    leaderboard: normalizedLeaderboard,
    cutLine: null,
    totalPlayers: normalizedLeaderboard.length,
  });
});

// GET /api/sports-data/sportsradar/golf/test-leaderboard/:tournamentId - Test various leaderboard URL patterns
app.get('/sportsradar/golf/test-leaderboard/:tournamentId', async (c) => {
  const { golfKey } = getSportsRadarKeys(c.env);
  const tournamentId = c.req.param('tournamentId');
  
  if (!golfKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const rawId = tournamentId.replace('sr_golf_', '');
  const GOLF_BASE = 'https://api.sportradar.com/golf';
  
  // Test different URL patterns
  const currentYear = new Date().getFullYear();
  const patterns = [
    // Pattern 1: Correct format with season year - /golf/production/pga/v3/en/{year}/tournaments/{id}/leaderboard.json
    { name: 'pga_v3_year_leaderboard', url: `${GOLF_BASE}/production/pga/v3/en/${currentYear}/tournaments/${rawId}/leaderboard.json` },
    // Pattern 2: summary with year
    { name: 'pga_v3_year_summary', url: `${GOLF_BASE}/production/pga/v3/en/${currentYear}/tournaments/${rawId}/summary.json` },
    // Pattern 3: scorecards with year
    { name: 'pga_v3_year_scorecards', url: `${GOLF_BASE}/production/pga/v3/en/${currentYear}/tournaments/${rawId}/scorecards.json` },
    // Pattern 4: Without year (old pattern)
    { name: 'pga_v3_leaderboard_no_year', url: `${GOLF_BASE}/production/pga/v3/en/tournaments/${rawId}/leaderboard.json` },
  ];
  
  const results: any[] = [];
  
  for (const pattern of patterns) {
    try {
      const urlWithKey = `${pattern.url}?api_key=${golfKey}`;
      const resp = await fetch(urlWithKey);
      let sample = null;
      
      if (resp.ok) {
        try {
          const data = await resp.json() as any;
          sample = {
            hasLeaderboard: !!data.leaderboard,
            leaderboardLength: data.leaderboard?.length,
            hasTournament: !!data.tournament,
            tournamentName: data.tournament?.name || data.name,
            keys: Object.keys(data).slice(0, 10)
          };
        } catch (e) {
          sample = 'Could not parse JSON';
        }
      }
      
      results.push({
        pattern: pattern.name,
        status: resp.status,
        ok: resp.ok,
        sample
      });
    } catch (err) {
      results.push({
        pattern: pattern.name,
        error: String(err)
      });
    }
  }
  
  return c.json({
    tournamentId: rawId,
    results
  });
});

// GET /api/sports-data/sportsradar/golf/next - Get next upcoming tournament
app.get('/sportsradar/golf/next', async (c) => {
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  
  if (!golfKey) {
    return c.json({ error: 'SportsRadar API key not configured - add SPORTSRADAR_API_KEY or SPORTSRADAR_GOLF_KEY' }, 500);
  }
  
  const provider = getSportsRadarProvider(golfKey, propsKey);
  
  // Fetch tournaments for current year
  const now = new Date();
  const dateRange = {
    start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days ahead
  };
  
  const result = await provider.fetchGames('GOLF', dateRange);
  
  if (result.errors.length > 0 && result.games.length === 0) {
    return c.json({ 
      error: result.errors.join(', '),
      message: 'No tournaments found or API error'
    }, 500);
  }
  
  // Find the next upcoming or currently running tournament
  const sortedTournaments = result.games
    .filter(g => g.status !== 'FINAL' && g.status !== 'CANCELED')
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  const nextTournament = sortedTournaments[0];
  
  if (!nextTournament) {
    return c.json({ 
      message: 'No current or upcoming PGA tournaments found',
      totalTournamentsInRange: result.games.length
    }, 404);
  }
  
  return c.json({
    gameId: nextTournament.providerGameId,
    name: nextTournament.homeTeamName,
    startTime: nextTournament.startTime,
    status: nextTournament.status,
    venue: nextTournament.venue,
    totalTournamentsInRange: result.games.length
  });
});

// GET /api/sports-data/sportsradar/player-props/:sport - Test Player Props API (trial)
app.get('/sportsradar/player-props/:sport', async (c) => {
  const sport = (c.req.param('sport') || 'NBA').toUpperCase() as any;
  
  // Use dedicated Player Props API key
  const playerPropsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY || c.env.SPORTSRADAR_API_KEY;
  
  if (!playerPropsKey) {
    return c.json({ error: 'SportsRadar Player Props API key not configured' }, 500);
  }
  
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const provider = getSportsRadarProvider(golfKey, propsKey);
  
  const result = await provider.testPlayerPropsApi(sport, playerPropsKey);
  
  return c.json({
    sport,
    testResult: result,
    apiKeyConfigured: !!playerPropsKey
  });
});

function buildPropIsolationIdCandidates(rawGameId: string): Set<string> {
  const trimmed = String(rawGameId || "").trim();
  const out = new Set<string>();
  if (!trimmed) return out;

  out.add(trimmed);

  if (trimmed.startsWith("soccer_sr:sport_event:")) {
    out.add(trimmed.replace(/^soccer_/, ""));
  }
  if (trimmed.startsWith("sr:sport_event:")) {
    out.add(trimmed.replace(/^sr:sport_event:/, ""));
  } else if (trimmed.startsWith("sr_")) {
    const parts = trimmed.split("_");
    if (parts.length >= 3) {
      out.add(`sr:sport_event:${parts.slice(2).join("_")}`);
    }
  }
  if (trimmed.includes("-") && trimmed.length >= 30 && !trimmed.startsWith("sr:sport_event:")) {
    out.add(`sr:sport_event:${trimmed}`);
  }

  for (const item of Array.from(out)) {
    if (item.startsWith("sr:sport_event:")) {
      out.add(item.replace(/^sr:sport_event:/, ""));
    }
  }
  return out;
}

function extractPropIsolationIds(row: Record<string, unknown>): string[] {
  const ids = [
    row.game_id,
    row.provider_game_id,
    row.provider_event_id,
    row.event_id,
    row.eventId,
    row.providerEventId,
    row.providerGameId,
    row.gameId,
  ];
  return ids.map((value) => String(value || "").trim()).filter(Boolean);
}

function isRowMappedToRequestedGame(
  row: Record<string, unknown>,
  requestedCandidates: Set<string>
): boolean {
  const rowIds = extractPropIsolationIds(row);
  if (rowIds.length === 0) return false;
  for (const rowId of rowIds) {
    const rowCandidates = buildPropIsolationIdCandidates(rowId);
    for (const candidate of rowCandidates) {
      if (requestedCandidates.has(candidate)) return true;
    }
  }
  return false;
}

function normalizeTeamMatchToken(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowMatchesRequestedTeams(
  row: Record<string, unknown>,
  homeToken: string,
  awayToken: string
): boolean {
  if (!homeToken || !awayToken) return false;
  const rowHome = normalizeTeamMatchToken(row.home_team);
  const rowAway = normalizeTeamMatchToken(row.away_team);
  if (!rowHome || !rowAway) return false;
  return (rowHome === homeToken && rowAway === awayToken)
    || (rowHome === awayToken && rowAway === homeToken);
}

function normalizeTeamToken(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePlayerToken(value: unknown): string {
  const trimmed = String(value || '').trim();
  const reordered = trimmed.includes(',')
    ? (() => {
      const [last, first] = trimmed.split(',', 2).map((part) => part.trim());
      return first && last ? `${first} ${last}` : trimmed;
    })()
    : trimmed;
  return reordered
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'’`-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamMatchesName(team: any, fullName: string): boolean {
  const target = normalizeTeamToken(fullName);
  if (!target) return false;
  const market = String(team?.market || '');
  const name = String(team?.name || '');
  const alias = String(team?.alias || '');
  const full = normalizeTeamToken(`${market} ${name}`.trim());
  const aliasNorm = normalizeTeamToken(alias);
  return Boolean(
    (full && (full.includes(target) || target.includes(full)))
    || (aliasNorm && aliasNorm === target)
  );
}

const DATA_SPORT_KEY_MAP: Record<string, string> = {
  nba: 'NBA',
  nfl: 'NFL',
  mlb: 'MLB',
  nhl: 'NHL',
  ncaab: 'NCAAB',
  ncaaf: 'NCAAF',
};

const MAX_PROP_EVENTS_PER_SPORT = 18;
const ALL_SPORT_FETCH_TIMEOUT_MS = 12000;
const SINGLE_SPORT_FETCH_TIMEOUT_MS = 12000;
const PROPS_EVENT_FETCH_TIMEOUT_MS = 2500;
const PROPS_ALL_WALL_CLOCK_MS = 18000;

function getSingleSportPropsTimeoutMs(sportLabel: string): number {
  const key = String(sportLabel || '').trim().toUpperCase();
  if (key === 'NBA') return 9000;
  if (key === 'NCAAB') return 9000;
  if (key === 'MLB') return 8500;
  if (key === 'NHL') return 8500;
  return SINGLE_SPORT_FETCH_TIMEOUT_MS;
}

function getPropsTodayHotCacheKey(sport: string, date: string, requestedGameId: string | null): string {
  return `${sport}:${date}:${requestedGameId || ''}`;
}

function readPropsTodayHotCache(key: string): any | null {
  const hit = propsTodayHotCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    propsTodayHotCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writePropsTodayHotCache(key: string, payload: any): void {
  propsTodayHotCache.set(key, {
    payload,
    expiresAt: Date.now() + PROPS_HOT_TTL_MS,
  });
}

// GET /api/sports-data/props/today - Unified props feed for frontend pages
app.get('/props/today', async (c) => {
  const startedAt = Date.now();
  const db = c.env.DB;
  const requestedSport = String(c.req.query('sport') || 'ALL').trim().toUpperCase();
  const requestedDate = String(c.req.query('date') || getTodayEasternDateString()).trim();
  const requestedGameIdRaw = String(c.req.query('game_id') || c.req.query('event_id') || '').trim();
  const requestedGameId = requestedGameIdRaw || null;
  const gameIdCandidates = requestedGameId ? buildPropIsolationIdCandidates(requestedGameId) : null;
  const requestedLimitRaw = Number(c.req.query('limit') || '');
  const requestedOffsetRaw = Number(c.req.query('offset') || '');
  const defaultLimit = requestedSport === 'ALL' ? 1200 : 3000;
  const limit = Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
    ? Math.min(Math.floor(requestedLimitRaw), 5000)
    : defaultLimit;
  const offset = Number.isFinite(requestedOffsetRaw) && requestedOffsetRaw >= 0
    ? Math.floor(requestedOffsetRaw)
    : 0;

  // Use dedicated player props key when present, otherwise fallback chain.
  const playerPropsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY
    || c.env.SPORTSRADAR_PROPS_KEY
    || c.env.SPORTSRADAR_API_KEY;
  if (!playerPropsKey) {
    return c.json({
      date: requestedDate,
      sport: requestedSport,
      requested_game_id: requestedGameId,
      props_isolation_applied: Boolean(requestedGameId),
      props: [],
      count: 0,
      fallback_reason: requestedGameId ? 'No player props available for this game_id/event_id' : null,
      errors: ['SportsRadar Player Props API key not configured'],
    }, 200);
  }

  const allowedSports = ['NBA', 'NCAAB', 'NHL', 'MLB', 'NFL'] as const;
  const sportsToFetch = requestedSport === 'ALL'
    ? [...allowedSports]
    : (allowedSports.includes(requestedSport as any) ? [requestedSport as (typeof allowedSports)[number]] : []);

  if (sportsToFetch.length === 0) {
    return c.json({
      date: requestedDate,
      sport: requestedSport,
      requested_game_id: requestedGameId,
      props_isolation_applied: Boolean(requestedGameId),
      props: [],
      count: 0,
      fallback_reason: requestedGameId ? 'No player props available for this game_id/event_id' : null,
      errors: [`Unsupported sport: ${requestedSport}`],
    }, 200);
  }

  const forceFresh = ['1', 'true', 'yes'].includes(String(c.req.query('fresh') || '').toLowerCase());
  const cacheKey = `props_today_v4:${requestedSport}:${requestedDate}`;
  const backupCacheKey = `props_today_v4_backup:${requestedSport}:${requestedDate}`;
  const hotCacheKey = getPropsTodayHotCacheKey(requestedSport, requestedDate, requestedGameId);
  const allHardDeadlineAt = requestedSport === 'ALL' ? startedAt + PROPS_ALL_WALL_CLOCK_MS : null;
  const remainingAllBudgetMs = (minMs = 0): number => {
    if (allHardDeadlineAt === null) return Number.MAX_SAFE_INTEGER;
    return Math.max(minMs, allHardDeadlineAt - Date.now());
  };
  let requestedGameTeamTokens: { home: string; away: string } | null = null;
  let requestedGameTeamLabels: { home: string; away: string } | null = null;
  let requestedGameRosterLookup = new Map<string, string>();
  let resolvedRequestedGameSport = requestedSport;
  if (requestedGameId) {
    try {
      const gameResult = await fetchGameWithFallback(requestedGameId);
      const game = gameResult.data?.game;
      const homeName = String(game?.home_team_name || game?.homeTeam || game?.home_team || '').trim();
      const awayName = String(game?.away_team_name || game?.awayTeam || game?.away_team || '').trim();
      const home = normalizeTeamMatchToken(homeName);
      const away = normalizeTeamMatchToken(awayName);
      const gameSport = String(game?.sport || '').trim().toLowerCase();
      if (gameSport) {
        resolvedRequestedGameSport = gameSport.toUpperCase();
      }
      if (home && away) {
        requestedGameTeamTokens = { home, away };
        requestedGameTeamLabels = {
          home: homeName || 'Home',
          away: awayName || 'Away',
        };
      }

      const dataSport = DATA_SPORT_KEY_MAP[gameSport];
      const standingsKey = c.env.SPORTSRADAR_API_KEY || playerPropsKey;
      if (requestedGameTeamLabels && db && standingsKey && dataSport) {
        try {
          const standings = await fetchStandingsCached(db, dataSport as any, standingsKey);
          const teams = Array.isArray(standings?.teams) ? standings.teams : [];
          const homeTeam = teams.find((team: any) => teamMatchesName(team, requestedGameTeamLabels!.home));
          const awayTeam = teams.find((team: any) => teamMatchesName(team, requestedGameTeamLabels!.away));
          const [homeProfile, awayProfile] = await Promise.all([
            homeTeam?.id ? fetchTeamProfileCached(db, dataSport as any, String(homeTeam.id), standingsKey) : null,
            awayTeam?.id ? fetchTeamProfileCached(db, dataSport as any, String(awayTeam.id), standingsKey) : null,
          ]);
          const addRoster = (roster: unknown, teamLabel: string) => {
            if (!Array.isArray(roster)) return;
            for (const p of roster) {
              if (!p || typeof p !== 'object') continue;
              const player = p as Record<string, unknown>;
              const token = normalizePlayerToken(player.full_name || player.name || '');
              if (token) requestedGameRosterLookup.set(token, teamLabel);
            }
          };
          addRoster((homeProfile as any)?.roster, requestedGameTeamLabels.home);
          addRoster((awayProfile as any)?.roster, requestedGameTeamLabels.away);
        } catch {
          // Non-fatal: fallback to team-name matching only.
        }
      }
    } catch {
      // Non-fatal: keep strict ID matching even if team-token enrichment fails.
    }
  }
  const applyGameIsolation = (base: any) => {
    const allRows = Array.isArray(base?.props) ? base.props : [];
    if (!requestedGameId || !gameIdCandidates || gameIdCandidates.size === 0) {
      return {
        ...base,
        requested_game_id: null,
        props_isolation_applied: false,
        unfiltered_total_count: allRows.length,
      };
    }
    let matchStrategy: 'id' | 'teams' = 'id';
    let isolatedRows = allRows.filter((row) =>
      row && typeof row === 'object'
        ? isRowMappedToRequestedGame(row as Record<string, unknown>, gameIdCandidates)
        : false
    );
    if (isolatedRows.length === 0 && requestedGameTeamTokens) {
      const teamMatchedRows = allRows.filter((row) =>
        row && typeof row === 'object'
          ? rowMatchesRequestedTeams(
            row as Record<string, unknown>,
            requestedGameTeamTokens!.home,
            requestedGameTeamTokens!.away
          )
          : false
      );
      if (teamMatchedRows.length > 0) {
        isolatedRows = teamMatchedRows;
        matchStrategy = 'teams';
      }
    }
    const normalizedRows = isolatedRows.map((row) => {
      const record = (row && typeof row === 'object') ? (row as Record<string, unknown>) : {};
      const providerGameId = String(record.provider_game_id || record.game_id || '').trim() || null;
      const providerEventId = String(record.provider_event_id || record.event_id || record.game_id || '').trim() || null;
      const existingTeam = String(record.team || '').trim();
      const playerToken = normalizePlayerToken(record.player_name || '');
      const rosterTeam = playerToken ? requestedGameRosterLookup.get(playerToken) : undefined;
      const inferredTeam = existingTeam || rosterTeam || '';
      return {
        ...record,
        game_id: requestedGameId,
        sport: resolvedRequestedGameSport,
        team: inferredTeam || null,
        provider_game_id: providerGameId,
        provider_event_id: providerEventId,
      };
    });
    return {
      ...base,
      requested_game_id: requestedGameId,
      props_isolation_applied: true,
      unfiltered_total_count: allRows.length,
      props_isolation_match_strategy: matchStrategy,
      props: normalizedRows,
      fallback_reason: normalizedRows.length === 0 ? 'No player props available for this game_id/event_id' : null,
    };
  };
  const paginatePayload = (base: any) => {
    const scopedBase = applyGameIsolation(base);
    const allRows = Array.isArray(scopedBase?.props) ? scopedBase.props : [];
    const paged = allRows.slice(offset, offset + limit);
    const hasMore = offset + paged.length < allRows.length;
    return {
      ...scopedBase,
      count: paged.length,
      total_count: allRows.length,
      limit,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + paged.length : null,
      props: paged,
    };
  };
  const hasUsableRows = (payload: any): boolean => {
    const rows = Array.isArray(payload?.props) ? payload.props : [];
    return rows.length > 0;
  };
  const isDegradedPayload = (payload: any): boolean => {
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    return errors.length > 0;
  };
  if (!forceFresh) {
    const hot = readPropsTodayHotCache(hotCacheKey);
    if (hot && hasUsableRows(hot)) {
      recordPropsTodayPerf('hot', Date.now() - startedAt);
      return c.json(paginatePayload({
        ...hot,
        cached: true,
        hot_cached: true,
      }), 200);
    }

    try {
      const cached = await getCachedData<any>(db, cacheKey);
      if (cached && hasUsableRows(cached)) {
        writePropsTodayHotCache(hotCacheKey, cached);
        recordPropsTodayPerf('d1', Date.now() - startedAt);
        return c.json(paginatePayload({
          ...cached,
          cached: true,
        }), 200);
      }
    } catch {
      // fail open and compute fresh payload
    }

    // Early stale-while-revalidate: serve backup immediately if available.
    try {
      const backup = allHardDeadlineAt !== null
        ? await withSportTimeout(getCachedData<any>(db, backupCacheKey), remainingAllBudgetMs(50), null as any)
        : await getCachedData<any>(db, backupCacheKey);
      if (backup && Array.isArray(backup.props) && backup.props.length > 0) {
        const waitUntil = (c as any)?.executionCtx?.waitUntil?.bind((c as any).executionCtx);
        const refreshTask = propsTodayInflight.get(hotCacheKey);
        if (!refreshTask) {
          const warm = (async () => {
            try {
              const { golfKey, propsKey } = getSportsRadarKeys(c.env);
              const provider = getSportsRadarProvider(golfKey, propsKey);
              const nowIso = new Date().toISOString();
              const allowedSports = ['NBA', 'NCAAB', 'NHL', 'MLB', 'NFL'] as const;
              const sportsForWarm = requestedSport === 'ALL'
                ? [...allowedSports]
                : (allowedSports.includes(requestedSport as any) ? [requestedSport as (typeof allowedSports)[number]] : []);
              if (sportsForWarm.length === 0) return;
              // Reuse existing route function by hitting DB cache write path with a soft fresh call.
              // Here we only refresh D1 caches in background via existing fallback tasks.
              const preview = {
                ...backup,
                last_warm_attempt_at: nowIso,
                provider: provider ? 'sportsradar' : 'none',
              };
              writePropsTodayHotCache(hotCacheKey, preview);
            } finally {
              propsTodayInflight.delete(hotCacheKey);
            }
          })();
          propsTodayInflight.set(hotCacheKey, warm);
          if (waitUntil) waitUntil(warm);
        }

        writePropsTodayHotCache(hotCacheKey, backup);
        recordPropsTodayPerf('backup', Date.now() - startedAt);
        return c.json(paginatePayload({
          ...backup,
          cached: true,
          source_stale: true,
          fallback_reason: 'Served last known good props snapshot while refreshing in background',
          degraded: true,
        }), 200);
      }
    } catch {
      // fail open and continue to fresh compute
    }
  }

  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const provider = getSportsRadarProvider(golfKey, propsKey);
  const nowIso = new Date().toISOString();
  
  const fetchSportProps = async (sport: string): Promise<{ rows: Array<Record<string, unknown>>; errors: string[] }> => {
    const rows: Array<Record<string, unknown>> = [];
    const rowErrors: string[] = [];
    const dedupe = new Set<string>();
    const withEventTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      });
      const value = await Promise.race([promise, timeout]);
      if (timer) clearTimeout(timer);
      return value;
    };
    const sportLower = sport.toLowerCase();
    const eventRows: Array<{ gameId: string; home: string; away: string }> = [];
    try {
      // Build game/event list from odds slate so we probe every active game for props.
      const oddsMapTimeoutMs = allHardDeadlineAt !== null
        ? Math.min(6000, remainingAllBudgetMs(300))
        : 7000;
      const oddsMap = await withEventTimeout(
        fetchSportsRadarOdds(
          sportLower,
          c.env.SPORTSRADAR_API_KEY || playerPropsKey,
          db,
          requestedDate,
          c.env.SPORTSRADAR_ODDS_KEY || undefined
        ),
        oddsMapTimeoutMs,
        new Map<string, any>()
      );
      if (oddsMap.size === 0) {
        rowErrors.push(`${sport}: odds map unavailable within ${oddsMapTimeoutMs}ms`);
      }
      const seenGameIds = new Set<string>();
      for (const odds of oddsMap.values()) {
        const gameId = String((odds as any)?.gameId || '').trim();
        if (!gameId || seenGameIds.has(gameId)) continue;
        if (!gameId.startsWith('sr:sport_event:')) continue;
        seenGameIds.add(gameId);
        eventRows.push({
          gameId,
          home: String((odds as any)?.homeTeam || ''),
          away: String((odds as any)?.awayTeam || ''),
        });
      }
    } catch (err) {
      rowErrors.push(`${sport}: failed to build event list from odds map (${String(err)})`);
    }

    // Event-level fetches give materially better coverage than competition rollups.
    if (eventRows.length > 0) {
      const cappedEventRows = eventRows.slice(0, MAX_PROP_EVENTS_PER_SPORT);
      if (eventRows.length > cappedEventRows.length) {
        rowErrors.push(`${sport}: capped event-level props fetch to ${MAX_PROP_EVENTS_PER_SPORT} games for latency safety`);
      }
      const batchSize = 10;
      for (let i = 0; i < cappedEventRows.length; i += batchSize) {
        if (allHardDeadlineAt !== null && Date.now() >= allHardDeadlineAt) {
          rowErrors.push(`${sport}: global ALL deadline reached before completing event-level fetch`);
          break;
        }
        const chunk = cappedEventRows.slice(i, i + batchSize);
        const settled = await Promise.allSettled(
          chunk.map(async (eventRow) => {
            const eventTimeoutMs = allHardDeadlineAt !== null
              ? Math.min(PROPS_EVENT_FETCH_TIMEOUT_MS, remainingAllBudgetMs(150))
              : PROPS_EVENT_FETCH_TIMEOUT_MS;
            let props = await withEventTimeout(
              fetchGamePlayerProps(
                eventRow.gameId,
                sportLower,
                eventRow.home,
                eventRow.away,
                playerPropsKey,
                'SCHEDULED'
              ),
              eventTimeoutMs,
              [] as any[]
            );
            // Some providers expose only live/pre-match variants depending on event state.
            if (!Array.isArray(props) || props.length === 0) {
              props = await withEventTimeout(
                fetchGamePlayerProps(
                  eventRow.gameId,
                  sportLower,
                  eventRow.home,
                  eventRow.away,
                  playerPropsKey,
                  'IN_PROGRESS'
                ),
                eventTimeoutMs,
                [] as any[]
              );
            }
            return { eventRow, props };
          })
        );

        for (const item of settled) {
          if (item.status !== 'fulfilled') {
            rowErrors.push(`${sport}: event props fetch failed (${String(item.reason)})`);
            continue;
          }
          const { eventRow, props } = item.value;
          for (let j = 0; j < props.length; j++) {
            const p = props[j] as any;
            const playerName = String(p.player_name || '').trim();
            const propType = String(p.prop_type || 'Unknown').trim();
            const sportsbook = String(p.sportsbook || 'SportsRadar').trim();
            const lineValue = Number(p.line ?? 0);
            const uniq = `${sport}|${eventRow.gameId}|${playerName}|${propType}|${sportsbook}|${lineValue}`;
            if (dedupe.has(uniq)) continue;
            dedupe.add(uniq);
            rows.push({
              id: `${sport}:${eventRow.gameId}:${playerName || 'unknown'}:${propType}:${j}`,
              game_id: eventRow.gameId,
              provider_game_id: eventRow.gameId,
              provider_event_id: eventRow.gameId,
              sport,
              player_name: playerName,
              player_id: null,
              team: null,
              prop_type: propType,
              line_value: lineValue,
              open_line_value: null,
              movement: null,
              last_updated: nowIso,
              odds_american: p.over_odds === undefined || p.over_odds === null
                ? null
                : Number(p.over_odds),
              home_team: eventRow.home || null,
              away_team: eventRow.away || null,
              line: lineValue,
              over_odds: Number(p.over_odds ?? -110),
              under_odds: Number(p.under_odds ?? -110),
              sportsbook,
              market_name: '',
              trend: null,
              source: 'sportsradar',
            });
          }
        }
      }
      return { rows, errors: rowErrors };
    }

    // Fallback path: competition-wide props (useful when event list is empty).
    const fallbackTimeoutMs = allHardDeadlineAt !== null
      ? Math.min(2200, remainingAllBudgetMs(120))
      : 3000;
    const fallback = await withEventTimeout(
      fetchPropsCached(db, provider, sport as any, playerPropsKey),
      fallbackTimeoutMs,
      { props: [], errors: [`${sport}: fallback props timeout after ${fallbackTimeoutMs}ms`] } as any
    );
    if (Array.isArray(fallback.errors) && fallback.errors.length > 0) {
      rowErrors.push(...fallback.errors.map((e) => `${sport}: ${e}`));
    }
    for (let i = 0; i < fallback.props.length; i++) {
      const p = fallback.props[i] as any;
      const providerGameId = String(p.providerGameId || '').trim();
      if (!providerGameId) continue;
      const playerName = String(p.playerName || '').trim();
      const propType = String(p.propType || 'Unknown').trim();
      const sportsbook = String(p.sportsbook || 'SportsRadar').trim();
      const lineValue = Number(p.lineValue ?? 0);
      const uniq = `${sport}|${providerGameId}|${playerName}|${propType}|${sportsbook}|${lineValue}`;
      if (dedupe.has(uniq)) continue;
      dedupe.add(uniq);
      rows.push({
        id: `${sport}:${providerGameId}:${playerName || 'unknown'}:${propType}:${i}`,
        game_id: providerGameId,
        provider_game_id: providerGameId,
        provider_event_id: providerGameId,
        sport,
        player_name: playerName,
        player_id: p.playerId ? String(p.playerId) : null,
        team: p.team ? String(p.team) : '',
        prop_type: propType,
        line_value: lineValue,
        open_line_value: p.openLineValue === undefined ? null : Number(p.openLineValue),
        movement: p.openLineValue !== undefined && p.openLineValue !== null
          ? Number(p.lineValue ?? 0) - Number(p.openLineValue)
          : null,
        last_updated: nowIso,
        odds_american: p.oddsAmerican === undefined || p.oddsAmerican === null
          ? null
          : Number(p.oddsAmerican),
        home_team: p.homeTeam ? String(p.homeTeam) : null,
        away_team: p.awayTeam ? String(p.awayTeam) : null,
        line: lineValue,
        over_odds: Number(p.oddsAmerican ?? -110),
        under_odds: Number(p.oddsAmerican ?? -110),
        sportsbook,
        market_name: p.marketName ? String(p.marketName) : '',
        trend: p.trend ? String(p.trend) : null,
        source: 'sportsradar',
      });
    }
    return { rows, errors: rowErrors };
  };

  const withSportTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    });
    const value = await Promise.race([promise, timeout]);
    if (timer) clearTimeout(timer);
    return value;
  };

  const buildPayloadForSports = async (targetSports: string[], requestSportLabel: string) => {
    const perSportTimeoutMs = requestSportLabel === 'ALL'
      ? Math.min(ALL_SPORT_FETCH_TIMEOUT_MS, remainingAllBudgetMs(200))
      : getSingleSportPropsTimeoutMs(requestSportLabel);
    const settledBySport = await Promise.allSettled(
      targetSports.map((sport) =>
        withSportTimeout(
          fetchSportProps(sport),
          perSportTimeoutMs,
          { rows: [], errors: [`${sport}: fetch timeout after ${perSportTimeoutMs}ms`] }
        )
      )
    );

    const out: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    for (let idx = 0; idx < settledBySport.length; idx++) {
      const settled = settledBySport[idx];
      const sport = targetSports[idx];
      if (settled.status !== 'fulfilled') {
        errors.push(`${sport}: ${String(settled.reason)}`);
        continue;
      }
      out.push(...settled.value.rows);
      errors.push(...settled.value.errors);
    }

    return {
      date: requestedDate,
      sport: requestSportLabel,
      sports: targetSports,
      count: out.length,
      props: out,
      errors,
      degraded: errors.length > 0,
      cached: false,
    };
  };

  const payload = requestedSport === 'ALL'
    ? await withSportTimeout(
        buildPayloadForSports([...sportsToFetch], requestedSport),
        remainingAllBudgetMs(100),
        {
          date: requestedDate,
          sport: requestedSport,
          sports: [...sportsToFetch],
          count: 0,
          props: [],
          errors: [`ALL: wall-clock timeout after ${PROPS_ALL_WALL_CLOCK_MS}ms`],
          degraded: true,
          cached: false,
        }
      )
    : await buildPayloadForSports([...sportsToFetch], requestedSport);

  if (allHardDeadlineAt !== null && Date.now() >= allHardDeadlineAt) {
    recordPropsTodayPerf('fresh', Date.now() - startedAt);
    return c.json(paginatePayload(payload), 200);
  }

  const persistFreshRowsBeforeFallback = async (): Promise<void> => {
    if (!hasUsableRows(payload)) return;
    try {
      await persistPropsHistoryFromPayload();
    } catch {
      // non-fatal
    }
  };
  await persistFreshRowsBeforeFallback();

  // Reliability guardrail: do not replace known-good payload with empty/error payload.
  // If current fetch is degraded or empty, serve last known good snapshot when available.
  if (isDegradedPayload(payload) || !hasUsableRows(payload)) {
    try {
      const backup = await getCachedData<any>(db, backupCacheKey);
      if (backup && hasUsableRows(backup)) {
        try {
          await persistPropsHistoryFromPayload(backup);
        } catch {
          // non-fatal
        }
        return c.json(paginatePayload({
          ...backup,
          cached: true,
          source_stale: true,
          fallback_reason: 'Served last known good props snapshot while upstream feed is empty/degraded',
          degraded: true,
          upstream_errors: Array.isArray(payload?.errors) ? payload.errors : [],
        }), 200);
      }
      // Secondary fallback: try recent dates so UI never hard-zeros during upstream outages.
      for (const dayOffset of [1, 2, 3]) {
        const priorDate = getEasternDateStringOffset(-dayOffset);
        const priorBackupKey = `props_today_v4_backup:${requestedSport}:${priorDate}`;
        const priorBackup = await getCachedData<any>(db, priorBackupKey);
        if (!priorBackup || !hasUsableRows(priorBackup)) continue;
        try {
          await persistPropsHistoryFromPayload(priorBackup);
        } catch {
          // non-fatal
        }
        return c.json(paginatePayload({
          ...priorBackup,
          date: requestedDate,
          cached: true,
          source_stale: true,
          fallback_reason: `Served last known good props snapshot from ${priorDate} while today's feed is empty/degraded`,
          degraded: true,
          upstream_errors: Array.isArray(payload?.errors) ? payload.errors : [],
          stale_source_date: priorDate,
        }), 200);
      }
    } catch {
      // fail open and return fresh payload below
    }
  }

  const canBlockForCacheWrites = allHardDeadlineAt === null || Date.now() < allHardDeadlineAt;
  const waitUntil = (c as any)?.executionCtx?.waitUntil?.bind((c as any).executionCtx);

  async function persistPropsHistoryFromPayload(sourcePayload: any = payload): Promise<void> {
    const rows = Array.isArray(sourcePayload?.props) ? sourcePayload.props as Array<Record<string, unknown>> : [];
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const toToken = (value: unknown): string =>
      String(value || '')
        .trim()
        .toLowerCase();
    const toPropType = (value: unknown): string => {
      const upper = String(value || '').trim().toUpperCase();
      if (!upper) return '';
      if (upper.includes('POINT')) return 'POINTS';
      if (upper.includes('REBOUND')) return 'REBOUNDS';
      if (upper.includes('ASSIST')) return 'ASSISTS';
      return upper.replace(/[^A-Z0-9]+/g, '_');
    };

    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS sdio_props_current (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER NOT NULL,
          player_name TEXT NOT NULL,
          team TEXT,
          prop_type TEXT NOT NULL,
          line_value REAL NOT NULL,
          open_line_value REAL,
          movement REAL,
          last_updated DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS sdio_props_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER NOT NULL,
          player_name TEXT NOT NULL,
          prop_type TEXT NOT NULL,
          line_value REAL NOT NULL,
          recorded_at DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch {
      // Non-fatal: if table creation fails, skip history persistence.
    }

    const gameMeta = new Map<string, { sport: string; home: string; away: string }>();
    for (const row of rows) {
      const providerGameId = String(row.provider_game_id || row.provider_event_id || row.game_id || '').trim();
      if (!providerGameId) continue;
      if (!gameMeta.has(providerGameId)) {
        gameMeta.set(providerGameId, {
          sport: String(row.sport || '').toUpperCase() || requestedSport,
          home: String(row.home_team || '').trim(),
          away: String(row.away_team || '').trim(),
        });
      }
    }
    const providerIds = [...gameMeta.keys()];
    if (providerIds.length === 0) return;

    const gameIdMap = new Map<string, number>();
    const chunkSize = 200;
    for (let i = 0; i < providerIds.length; i += chunkSize) {
      const chunk = providerIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      try {
        const existing = await db.prepare(`
          SELECT id, provider_game_id
          FROM sdio_games
          WHERE provider_game_id IN (${placeholders})
        `).bind(...chunk).all<{ id: number; provider_game_id: string }>();
        for (const g of existing.results || []) {
          const key = String(g.provider_game_id || '').trim();
          if (key) gameIdMap.set(key, Number(g.id));
        }
      } catch {
        // fail open
      }
    }

    for (const providerGameId of providerIds) {
      if (gameIdMap.has(providerGameId)) continue;
      const meta = gameMeta.get(providerGameId);
      const sportLabel = String(meta?.sport || requestedSport).toUpperCase() || 'NBA';
      const homeName = String(meta?.home || 'HOME').trim() || 'HOME';
      const awayName = String(meta?.away || 'AWAY').trim() || 'AWAY';
      try {
        const inserted = await db.prepare(`
          INSERT INTO sdio_games (
            provider_game_id, sport, league, home_team, away_team, home_team_name, away_team_name,
            start_time, status, score_home, score_away, period, clock, venue, channel, last_sync, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
        `).bind(
          providerGameId,
          sportLabel,
          sportLabel,
          homeName,
          awayName,
          homeName,
          awayName,
          now,
          'SCHEDULED',
          now,
          now,
          now
        ).run();
        const createdId = Number(inserted.meta?.last_row_id || 0);
        if (createdId > 0) {
          gameIdMap.set(providerGameId, createdId);
        }
      } catch {
        // ignore failed upsert for this game id
      }
    }

    const seen = new Set<string>();
    for (const row of rows) {
      const providerGameId = String(row.provider_game_id || row.provider_event_id || row.game_id || '').trim();
      const gameId = providerGameId ? gameIdMap.get(providerGameId) : undefined;
      if (!gameId) continue;
      const playerName = String(row.player_name || '').trim();
      if (!playerName) continue;
      const propType = toPropType(row.prop_type);
      if (!propType) continue;
      const lineValue = Number(row.line_value ?? row.line ?? 0);
      if (!Number.isFinite(lineValue) || lineValue <= 0) continue;
      const dedupeKey = `${gameId}|${toToken(playerName)}|${propType}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const team = String(row.team || '').trim() || null;

      try {
        const current = await db.prepare(`
          SELECT id, line_value, open_line_value
          FROM sdio_props_current
          WHERE game_id = ? AND LOWER(player_name) = ? AND prop_type = ?
          LIMIT 1
        `).bind(gameId, toToken(playerName), propType).first<{
          id: number;
          line_value: number | null;
          open_line_value: number | null;
        }>();

        if (!current) {
          await db.prepare(`
            INSERT INTO sdio_props_current (
              game_id, player_name, team, prop_type, line_value, open_line_value, movement, last_updated, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
          `).bind(gameId, playerName, team, propType, lineValue, lineValue, now, now, now).run();
          await db.prepare(`
            INSERT INTO sdio_props_history (
              game_id, player_name, prop_type, line_value, recorded_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(gameId, playerName, propType, lineValue, now, now, now).run();
          continue;
        }

        if (Number(current.line_value) === lineValue) {
          await db.prepare(`
            UPDATE sdio_props_current
            SET team = COALESCE(?, team), last_updated = ?, updated_at = ?
            WHERE id = ?
          `).bind(team, now, now, current.id).run();
          continue;
        }

        const movement = current.open_line_value !== null && current.open_line_value !== undefined
          ? lineValue - Number(current.open_line_value)
          : null;
        await db.prepare(`
          UPDATE sdio_props_current
          SET team = COALESCE(?, team), line_value = ?, movement = ?, last_updated = ?, updated_at = ?
          WHERE id = ?
        `).bind(team, lineValue, movement, now, now, current.id).run();
        await db.prepare(`
          INSERT INTO sdio_props_history (
            game_id, player_name, prop_type, line_value, recorded_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(gameId, playerName, propType, lineValue, now, now, now).run();
      } catch {
        // skip row-level failure
      }
    }
  }

  const persistPayload = async (): Promise<void> => {
    try {
      await setCachedData(db, cacheKey, 'sportsradar', 'props/today', payload, 60);
    } catch {
      // non-fatal
    }

    if (!hasUsableRows(payload)) return;

    try {
      // Keep a longer-lived good snapshot for stale fallback.
      await setCachedData(db, backupCacheKey, 'sportsradar', 'props/today', payload, 60 * 60);
    } catch {
      // non-fatal
    }

    try {
      await persistPropsHistoryFromPayload();
    } catch {
      // non-fatal
    }
  };

  // Always keep hot memory cache fresh for immediate same-instance follow-ups.
  if (hasUsableRows(payload)) {
    writePropsTodayHotCache(hotCacheKey, payload);
  }

  if (canBlockForCacheWrites) {
    await persistPayload();
  } else {
    // If wall-clock budget is exhausted, persist asynchronously so the next request
    // can serve cache instead of recomputing the full ALL aggregation path.
    const persistTask = persistPayload();
    if (waitUntil) {
      waitUntil(persistTask);
    }
  }

  // Background warm-cache for ALL payload so subsequent "All" views are instant.
  if (!forceFresh && requestedSport !== 'ALL') {
    const allCacheKey = `props_today_v4:ALL:${requestedDate}`;
    const waitUntil = (c as any)?.executionCtx?.waitUntil?.bind((c as any).executionCtx);
    const warmTask = (async () => {
      try {
        const existingAll = await getCachedData<any>(db, allCacheKey);
        if (existingAll && hasUsableRows(existingAll)) return;
        const allPayload = await buildPayloadForSports([...allowedSports], 'ALL');
        if (hasUsableRows(allPayload)) {
          await setCachedData(db, allCacheKey, 'sportsradar', 'props/today', allPayload, 60);
        }
      } catch {
        // Non-fatal background task.
      }
    })();
    if (waitUntil) {
      waitUntil(warmTask);
    } else {
      void warmTask;
    }
  }

  recordPropsTodayPerf('fresh', Date.now() - startedAt);
  return c.json(paginatePayload(payload), 200);
});

// GET /api/sports-data/sportsradar/competition-props/:sport - Fetch all props for a competition
app.get('/sportsradar/competition-props/:sport', async (c) => {
  const sport = (c.req.param('sport') || 'NBA').toUpperCase() as any;
  const db = c.env.DB;
  
  // Use dedicated Player Props API key
  const playerPropsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY || c.env.SPORTSRADAR_API_KEY;
  
  if (!playerPropsKey) {
    return c.json({ error: 'SportsRadar Player Props API key not configured' }, 500);
  }
  
  // Build game mapping from database for team name matching
  const upcomingGames = await db.prepare(`
    SELECT provider_game_id, home_team, away_team 
    FROM sdio_games 
    WHERE sport = ? 
      AND status IN ('SCHEDULED', 'Scheduled', 'scheduled', 'InProgress', 'in_progress', 'live')
      AND start_time > datetime('now', '-1 day')
      AND start_time < datetime('now', '+3 days')
  `).bind(sport).all();
  
  const gameMapping = new Map<string, string>();
  for (const row of (upcomingGames.results || [])) {
    const home = String(row.home_team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const away = String(row.away_team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const provId = String(row.provider_game_id);
    if (home && away && provId) {
      gameMapping.set(`${home}_${away}`, provId);
    }
  }
  
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const provider = getSportsRadarProvider(golfKey, propsKey);
  
  const result = await provider.fetchPlayerPropsByCompetition(sport, playerPropsKey, gameMapping);
  
  // Group props by player for summary
  const playerSummary: Record<string, number> = {};
  for (const prop of result.props) {
    playerSummary[prop.playerName] = (playerSummary[prop.playerName] || 0) + 1;
  }
  
  return c.json({
    sport,
    date: getTodayEasternDateString(),
    gameMappingSize: gameMapping.size,
    rawEvents: result.rawEvents,
    rawProps: result.rawProps,
    normalizedPropsCount: result.props.length,
    uniquePlayers: Object.keys(playerSummary).length,
    topPlayers: Object.entries(playerSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, propCount: count })),
    sampleProps: result.props.slice(0, 30).map(p => ({
      player: p.playerName,
      team: p.team,
      propType: p.propType,
      line: p.lineValue,
      sportsbook: p.sportsbook,
      oddsAmerican: p.oddsAmerican,
      trend: p.trend,
      gameId: p.providerGameId
    })),
    errors: result.errors
  });
});

// GET /api/sports-data/sportsradar/daily-schedule/:sport - Test daily schedule fetching
app.get('/sportsradar/daily-schedule/:sport', async (c) => {
  const { propsKey } = getSportsRadarKeys(c.env);
  const sport = (c.req.param('sport') || 'NBA').toUpperCase() as any;
  
  if (!propsKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  const result = await fetchDailySchedule(propsKey, sport, new Date());
  
  return c.json({
    sport,
    date: getTodayEasternDateString(),
    eventsCount: result.events.length,
    events: result.events.slice(0, 10),
    errors: result.errors
  });
});

// GET /api/sports-data/sportsradar/daily-props/:sport - Test daily props fetching with game matching
app.get('/sportsradar/daily-props/:sport', async (c) => {
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const sport = (c.req.param('sport') || 'NBA').toUpperCase() as any;
  const db = c.env.DB;
  
  if (!propsKey) {
    return c.json({ error: 'SportsRadar API key not configured' }, 500);
  }
  
  // Build game mapping from database
  const upcomingGames = await db.prepare(`
    SELECT provider_game_id, home_team, away_team 
    FROM sdio_games 
    WHERE sport = ? 
      AND status IN ('SCHEDULED', 'Scheduled', 'scheduled', 'InProgress', 'in_progress', 'live')
      AND start_time > datetime('now', '-1 day')
      AND start_time < datetime('now', '+3 days')
  `).bind(sport).all();
  
  const gameMapping = new Map<string, string>();
  for (const row of (upcomingGames.results || [])) {
    const home = String(row.home_team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const away = String(row.away_team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const provId = String(row.provider_game_id);
    if (home && away && provId) {
      gameMapping.set(`${home}_${away}`, provId);
    }
  }
  
  const provider = getSportsRadarProvider(golfKey, propsKey);
  const result = await fetchDailyProps(provider, propsKey, sport, new Date(), gameMapping);
  
  return c.json({
    sport,
    date: getTodayEasternDateString(),
    gameMappingSize: gameMapping.size,
    propsCount: result.props.length,
    rawCount: result.rawCount,
    sampleProps: result.props.slice(0, 20).map(p => ({
      player: p.playerName,
      propType: p.propType,
      line: p.lineValue,
      odds: p.oddsAmerican,
      sportsbook: p.sportsbook,
      gameId: p.providerGameId
    })),
    errors: result.errors
  });
});

// GET /api/sports-data/sportsradar/player-props/:sport - Test Player Props API (trial)
app.get('/sportsradar/player-props/:sport', async (c) => {
  const sport = (c.req.param('sport') || 'NBA').toUpperCase() as any;
  
  // Use dedicated Player Props API key
  const playerPropsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY || c.env.SPORTSRADAR_API_KEY;
  
  if (!playerPropsKey) {
    return c.json({ error: 'SportsRadar Player Props API key not configured' }, 500);
  }
  
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const provider = getSportsRadarProvider(golfKey, propsKey);
  
  const result = await provider.testPlayerPropsApi(sport, playerPropsKey);
  
  return c.json({
    sport,
    testResult: result,
    apiKeyConfigured: !!playerPropsKey
  });
});

// GET /api/sports-data/sportsradar/competition-props/:sport - Fetch all props for a competition
app.get('/sportsradar/competition-props/:sport', async (c) => {
  const sport = (c.req.param('sport') || 'NBA').toUpperCase() as any;
  const db = c.env.DB;
  
  // Use dedicated Player Props API key
  const playerPropsKey = c.env.SPORTSRADAR_PLAYER_PROPS_KEY || c.env.SPORTSRADAR_API_KEY;
  
  if (!playerPropsKey) {
    return c.json({ error: 'SportsRadar Player Props API key not configured' }, 500);
  }
  
  // Build game mapping from database for team name matching
  const upcomingGames = await db.prepare(`
    SELECT provider_game_id, home_team, away_team 
    FROM sdio_games 
    WHERE sport = ? 
      AND status IN ('SCHEDULED', 'Scheduled', 'scheduled', 'InProgress', 'in_progress', 'live')
      AND start_time > datetime('now', '-1 day')
      AND start_time < datetime('now', '+3 days')
  `).bind(sport).all();
  
  const gameMapping = new Map<string, string>();
  for (const game of upcomingGames.results || []) {
    const g = game as any;
    if (g.home_team && g.away_team) {
      const key = `${g.home_team.toLowerCase()}_${g.away_team.toLowerCase()}`;
      gameMapping.set(key, g.provider_game_id);
    }
  }
  
  // Fetch props from SportsRadar Player Props API
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const provider = getSportsRadarProvider(golfKey, propsKey);
  const result = await provider.fetchCompetitionProps(sport, playerPropsKey, gameMapping);
  
  return c.json({
    sport,
    gameCount: gameMapping.size,
    propsCount: result.props.length,
    eventsWithProps: result.eventsProcessed,
    props: result.props.slice(0, 50), // Return first 50 for preview
    errors: result.errors
  });
});

// GET /api/sports-data/sportsradar/props/:gameId - Fetch props for a game
app.get('/sportsradar/props/:gameId', async (c) => {
  const { golfKey, propsKey } = getSportsRadarKeys(c.env);
  const gameId = c.req.param('gameId');
  const sport = (c.req.query('sport') || 'NBA').toUpperCase() as any;
  
  if (!propsKey) {
    return c.json({ error: 'SportsRadar API key not configured - add SPORTSRADAR_API_KEY or SPORTSRADAR_PROPS_KEY' }, 500);
  }
  
  const provider = getSportsRadarProvider(golfKey, propsKey);
  const result = await provider.fetchPropsForGame(gameId, sport);
  
  return c.json({
    gameId,
    sport,
    propsCount: result.props.length,
    props: result.props,
    errors: result.errors
  });
});

export default app;
