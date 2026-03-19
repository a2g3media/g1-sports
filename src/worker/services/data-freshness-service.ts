// Data Freshness Monitoring Service
// Tracks staleness of Scout data sources and generates alerts

export interface DataSource {
  key: string;
  name: string;
  category: "schedule" | "odds" | "injuries" | "weather" | "scores" | "user_data" | "system";
  checkQuery?: string;
  timestampColumn?: string;
  isCritical?: boolean;
  staleThresholdMinutes: number;
  warningThresholdMinutes: number;
}

// Define monitored data sources
export const MONITORED_SOURCES: DataSource[] = [
  {
    key: "events_schedule",
    name: "Game Schedule",
    category: "schedule",
    checkQuery: "SELECT MAX(updated_at) as last_update, COUNT(*) as count FROM events",
    timestampColumn: "updated_at",
    isCritical: true,
    staleThresholdMinutes: 60,
    warningThresholdMinutes: 30,
  },
  {
    key: "odds_quotes",
    name: "Odds Quotes",
    category: "odds",
    checkQuery: "SELECT MAX(updated_at) as last_update, COUNT(*) as count FROM odds_quotes",
    timestampColumn: "updated_at",
    isCritical: true,
    staleThresholdMinutes: 15,
    warningThresholdMinutes: 5,
  },
  {
    key: "odds_snapshots",
    name: "Odds History",
    category: "odds",
    checkQuery: "SELECT MAX(captured_at) as last_update, COUNT(*) as count FROM odds_snapshots",
    timestampColumn: "captured_at",
    isCritical: false,
    staleThresholdMinutes: 30,
    warningThresholdMinutes: 15,
  },
  {
    key: "threshold_events",
    name: "Intel Alerts",
    category: "system",
    checkQuery: "SELECT MAX(created_at) as last_update, COUNT(*) as count FROM threshold_events WHERE is_visible = 1",
    timestampColumn: "created_at",
    isCritical: false,
    staleThresholdMinutes: 120,
    warningThresholdMinutes: 60,
  },
  {
    key: "picks_submissions",
    name: "Pick Submissions",
    category: "user_data",
    checkQuery: "SELECT MAX(created_at) as last_update, COUNT(*) as count FROM picks",
    timestampColumn: "created_at",
    isCritical: false,
    staleThresholdMinutes: 1440, // 24 hours - user activity
    warningThresholdMinutes: 720,
  },
  {
    key: "ai_interactions",
    name: "AI Chat Logs",
    category: "system",
    checkQuery: "SELECT MAX(created_at) as last_update, COUNT(*) as count FROM ai_event_log",
    timestampColumn: "created_at",
    isCritical: false,
    staleThresholdMinutes: 1440,
    warningThresholdMinutes: 720,
  },
];

export type FreshnessStatus = "live" | "fresh" | "warning" | "stale" | "critical" | "unknown";

export interface FreshnessResult {
  sourceKey: string;
  sourceName: string;
  category: string;
  status: FreshnessStatus;
  lastUpdate: string | null;
  recordCount: number;
  ageMinutes: number | null;
  isCritical: boolean;
  message: string;
}

export interface FreshnessAlert {
  id?: number;
  sourceKey: string;
  alertType: "stale_data" | "no_data" | "fetch_error" | "recovered";
  severity: "info" | "warning" | "critical";
  headline: string;
  details?: string | null;
  isResolved: boolean;
  createdAt: string;
}

// Calculate freshness status based on age
function calculateStatus(
  ageMinutes: number | null,
  source: DataSource
): FreshnessStatus {
  if (ageMinutes === null) return "unknown";
  if (ageMinutes <= 2) return "live";
  if (ageMinutes <= source.warningThresholdMinutes) return "fresh";
  if (ageMinutes <= source.staleThresholdMinutes) return "warning";
  if (source.isCritical) return "critical";
  return "stale";
}

// Check freshness of a single data source
export async function checkSourceFreshness(
  db: D1Database,
  source: DataSource
): Promise<FreshnessResult> {
  const startTime = Date.now();
  
  try {
    if (!source.checkQuery) {
      return {
        sourceKey: source.key,
        sourceName: source.name,
        category: source.category,
        status: "unknown",
        lastUpdate: null,
        recordCount: 0,
        ageMinutes: null,
        isCritical: source.isCritical || false,
        message: "No check query defined",
      };
    }
    
    const result = await db.prepare(source.checkQuery).first<{
      last_update: string | null;
      count: number;
    }>();
    
    const latencyMs = Date.now() - startTime;
    const lastUpdate = result?.last_update;
    const recordCount = result?.count || 0;
    
    let ageMinutes: number | null = null;
    if (lastUpdate) {
      const lastUpdateDate = new Date(lastUpdate);
      const now = new Date();
      ageMinutes = Math.floor((now.getTime() - lastUpdateDate.getTime()) / 60000);
    }
    
    const status = calculateStatus(ageMinutes, source);
    
    // Update tracking table
    await db.prepare(`
      INSERT INTO data_source_freshness (source_key, source_name, category, last_successful_fetch, last_fetch_attempt, record_count, freshness_status, avg_latency_ms, is_critical, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_key) DO UPDATE SET
        last_successful_fetch = excluded.last_successful_fetch,
        last_fetch_attempt = CURRENT_TIMESTAMP,
        record_count = excluded.record_count,
        freshness_status = excluded.freshness_status,
        avg_latency_ms = excluded.avg_latency_ms,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      source.key,
      source.name,
      source.category,
      lastUpdate ?? null,
      recordCount,
      status,
      latencyMs,
      source.isCritical ? 1 : 0
    ).run();
    
    // Generate message
    let message = "";
    if (status === "live") message = "Data is live and current";
    else if (status === "fresh") message = `Updated ${ageMinutes} minutes ago`;
    else if (status === "warning") message = `Data is ${ageMinutes} minutes old - approaching staleness`;
    else if (status === "stale") message = `Data is stale (${ageMinutes} minutes old)`;
    else if (status === "critical") message = `CRITICAL: Data is ${ageMinutes} minutes old`;
    else message = "Unable to determine freshness";
    
    return {
      sourceKey: source.key,
      sourceName: source.name,
      category: source.category,
      status,
      lastUpdate: lastUpdate ?? null,
      recordCount,
      ageMinutes,
      isCritical: source.isCritical || false,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Log error in tracking table
    await db.prepare(`
      INSERT INTO data_source_freshness (source_key, source_name, category, last_fetch_attempt, freshness_status, error_message, is_critical, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'unknown', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_key) DO UPDATE SET
        last_fetch_attempt = CURRENT_TIMESTAMP,
        freshness_status = 'unknown',
        error_message = excluded.error_message,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      source.key,
      source.name,
      source.category,
      errorMessage,
      source.isCritical ? 1 : 0
    ).run();
    
    return {
      sourceKey: source.key,
      sourceName: source.name,
      category: source.category,
      status: "unknown",
      lastUpdate: null,
      recordCount: 0,
      ageMinutes: null,
      isCritical: source.isCritical || false,
      message: `Error checking source: ${errorMessage}`,
    };
  }
}

// Check all monitored sources
export async function checkAllSourcesFreshness(
  db: D1Database
): Promise<{
  results: FreshnessResult[];
  summary: {
    total: number;
    live: number;
    fresh: number;
    warning: number;
    stale: number;
    critical: number;
    unknown: number;
    healthScore: number;
  };
  generatedAlerts: FreshnessAlert[];
}> {
  const results: FreshnessResult[] = [];
  const generatedAlerts: FreshnessAlert[] = [];
  
  for (const source of MONITORED_SOURCES) {
    const result = await checkSourceFreshness(db, source);
    results.push(result);
    
    // Generate alerts for problematic sources
    if (result.status === "critical" || result.status === "stale") {
      const alert = await createAlertIfNeeded(db, result);
      if (alert) generatedAlerts.push(alert);
    } else if (result.status === "fresh" || result.status === "live") {
      // Auto-resolve alerts for recovered sources
      await resolveAlertsForSource(db, result.sourceKey, "auto");
    }
  }
  
  // Calculate summary
  const summary = {
    total: results.length,
    live: results.filter(r => r.status === "live").length,
    fresh: results.filter(r => r.status === "fresh").length,
    warning: results.filter(r => r.status === "warning").length,
    stale: results.filter(r => r.status === "stale").length,
    critical: results.filter(r => r.status === "critical").length,
    unknown: results.filter(r => r.status === "unknown").length,
    healthScore: 0,
  };
  
  // Calculate health score (0-100)
  const weights = { live: 100, fresh: 90, warning: 60, stale: 30, critical: 0, unknown: 50 };
  const criticalSources = results.filter(r => r.isCritical);
  if (criticalSources.length > 0) {
    summary.healthScore = Math.round(
      criticalSources.reduce((sum, r) => sum + weights[r.status], 0) / criticalSources.length
    );
  } else {
    summary.healthScore = Math.round(
      results.reduce((sum, r) => sum + weights[r.status], 0) / results.length
    );
  }
  
  return { results, summary, generatedAlerts };
}

// Create alert if one doesn't already exist for this issue
async function createAlertIfNeeded(
  db: D1Database,
  result: FreshnessResult
): Promise<FreshnessAlert | null> {
  // Check for existing unresolved alert
  const existing = await db.prepare(`
    SELECT id FROM data_freshness_alerts 
    WHERE source_key = ? AND alert_type = 'stale_data' AND is_resolved = 0
  `).bind(result.sourceKey).first();
  
  if (existing) return null;
  
  const alert: FreshnessAlert = {
    sourceKey: result.sourceKey,
    alertType: result.recordCount === 0 ? "no_data" : "stale_data",
    severity: result.status === "critical" ? "critical" : "warning",
    headline: result.status === "critical" 
      ? `Critical: ${result.sourceName} data is stale`
      : `${result.sourceName} data is becoming stale`,
    details: result.message || null,
    isResolved: false,
    createdAt: new Date().toISOString(),
  };
  
  const insertResult = await db.prepare(`
    INSERT INTO data_freshness_alerts (source_key, alert_type, severity, headline, details, is_resolved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    alert.sourceKey,
    alert.alertType,
    alert.severity,
    alert.headline,
    alert.details
  ).run();
  
  alert.id = insertResult.meta.last_row_id as number;
  return alert;
}

// Resolve alerts when source recovers
async function resolveAlertsForSource(
  db: D1Database,
  sourceKey: string,
  resolvedBy: string
): Promise<void> {
  await db.prepare(`
    UPDATE data_freshness_alerts 
    SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE source_key = ? AND is_resolved = 0
  `).bind(resolvedBy, sourceKey).run();
}

// Get active alerts
export async function getActiveAlerts(db: D1Database): Promise<FreshnessAlert[]> {
  const { results } = await db.prepare(`
    SELECT * FROM data_freshness_alerts 
    WHERE is_resolved = 0 
    ORDER BY 
      CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      created_at DESC
  `).all();
  
  return results.map((r: any) => ({
    id: r.id,
    sourceKey: r.source_key,
    alertType: r.alert_type,
    severity: r.severity,
    headline: r.headline,
    details: r.details ?? null,
    isResolved: r.is_resolved === 1,
    createdAt: r.created_at,
  }));
}

// Get freshness history for a source
export async function getSourceHistory(
  db: D1Database,
  sourceKey: string
): Promise<any> {
  const current = await db.prepare(`
    SELECT * FROM data_source_freshness WHERE source_key = ?
  `).bind(sourceKey).first();
  
  const recentAlerts = await db.prepare(`
    SELECT * FROM data_freshness_alerts 
    WHERE source_key = ? 
    ORDER BY created_at DESC 
    LIMIT 10
  `).bind(sourceKey).all();
  
  return {
    current,
    recentAlerts: recentAlerts.results,
  };
}

// Manual alert resolution
export async function resolveAlert(
  db: D1Database,
  alertId: number,
  resolvedBy: string
): Promise<void> {
  await db.prepare(`
    UPDATE data_freshness_alerts 
    SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(resolvedBy, alertId).run();
}
