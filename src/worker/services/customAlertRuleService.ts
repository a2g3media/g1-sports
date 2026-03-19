/**
 * Custom Alert Rule Service
 * Manages Elite user custom alert rules with sport-aware triggers
 * 
 * Type Convention: All IDs (ruleId, userId) are STRINGS for API/DB consistency
 */

// D1Database type from Cloudflare Workers
type D1Database = Env["DB"];

// Trigger type definitions with sport-specific presets
export const TRIGGER_TYPES = {
  SCORE_EVENT: {
    key: "SCORE_EVENT",
    label: "Scoring Event",
    description: "Alert on scores (every or major only)",
    sports: ["NFL", "NBA", "MLB", "NHL", "SOCCER", "NCAAF", "NCAAB"],
    configSchema: {
      majorOnly: { type: "boolean", default: true, label: "Major scores only" },
    },
  },
  PERIOD_BREAK: {
    key: "PERIOD_BREAK",
    label: "Period/Quarter End",
    description: "Summary at period breaks",
    sports: ["NFL", "NBA", "NHL", "SOCCER", "NCAAF", "NCAAB"],
    configSchema: {},
  },
  FINAL_SCORE: {
    key: "FINAL_SCORE",
    label: "Final Score",
    description: "Game completion alert",
    sports: ["NFL", "NBA", "MLB", "NHL", "SOCCER", "NCAAF", "NCAAB"],
    configSchema: {},
  },
  LINE_MOVEMENT: {
    key: "LINE_MOVEMENT",
    label: "Line Movement",
    description: "Significant odds shifts",
    sports: ["NFL", "NBA", "MLB", "NHL", "SOCCER", "NCAAF", "NCAAB"],
    configSchema: {
      thresholdPoints: { type: "number", default: 1.5, label: "Minimum point swing", min: 0.5, max: 5, step: 0.5 },
      timeWindowMinutes: { type: "number", default: 10, label: "Time window (minutes)", min: 5, max: 60 },
    },
  },
  INJURY: {
    key: "INJURY",
    label: "Injury Status",
    description: "Confirmed injury updates",
    sports: ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB"],
    configSchema: {
      confirmedOnly: { type: "boolean", default: true, label: "Confirmed injuries only" },
      starPlayersOnly: { type: "boolean", default: false, label: "Star players only" },
    },
  },
  WEATHER: {
    key: "WEATHER",
    label: "Weather Alert",
    description: "Game-impacting weather conditions",
    sports: ["NFL", "MLB", "SOCCER", "NCAAF"],
    configSchema: {
      windThresholdMph: { type: "number", default: 15, label: "Wind threshold (mph)", min: 10, max: 30 },
      rainThreshold: { type: "boolean", default: true, label: "Alert on rain/snow" },
    },
  },
  DOMINANT_PERFORMANCE: {
    key: "DOMINANT_PERFORMANCE",
    label: "Dominant Performance",
    description: "Exceptional player/team performance",
    sports: ["NFL", "NBA", "MLB", "NHL", "SOCCER"],
    configSchema: {},
  },
} as const;

// Sport-specific dominant performance presets
export const DOMINANT_PRESETS = {
  MLB: [
    { key: "no_hitter_watch", label: "No-Hitter Watch", description: "Pitcher with no hits through 5+ innings" },
    { key: "strikeout_pace", label: "High Strikeout Pace", description: "6+ Ks through 3 innings" },
    { key: "pitcher_scratch", label: "Pitcher Scratch", description: "Scheduled starter scratched" },
  ],
  NBA: [
    { key: "scoring_eruption", label: "Scoring Eruption", description: "12+ points in a quarter" },
    { key: "foul_trouble", label: "Foul Trouble", description: "Star player in foul trouble" },
    { key: "usage_spike", label: "Usage Spike", description: "Unusually high usage rate" },
  ],
  NFL: [
    { key: "red_zone_efficiency", label: "Red Zone Efficiency", description: "Perfect or terrible red zone performance" },
    { key: "turnover_burst", label: "Turnover Burst", description: "Multiple turnovers in short span" },
    { key: "pressure_spike", label: "Pressure Rate Spike", description: "Defensive pressure surge" },
  ],
  NHL: [
    { key: "shutout_watch", label: "Shutout Watch", description: "Goalie shutout through 2 periods" },
    { key: "multi_goal_player", label: "Multi-Goal Player", description: "2+ goals by single player" },
  ],
  SOCCER: [
    { key: "red_card", label: "Red Card", description: "Player sent off" },
    { key: "xg_swing", label: "xG Swing", description: "Large expected goals differential" },
    { key: "late_goal", label: "Late Goal", description: "Goal in final 15 minutes" },
  ],
} as const;

export interface CustomAlertRule {
  id: string; // STRING - converted from DB numeric ID at boundary
  user_id: string;
  data_scope: string;
  name: string;
  description: string | null;
  scope_type: string;
  scope_ids: string | null;
  scope_sports: string | null;
  trigger_type: string;
  trigger_config_json: string;
  threshold_value: number | null;
  time_window_minutes: number | null;
  is_bundled: number;
  max_per_game_per_hour: number;
  push_enabled: number;
  in_app_enabled: number;
  quiet_hours_enabled: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  is_active: number;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

// Internal DB row type (numeric id)
interface CustomAlertRuleRow {
  id: number;
  user_id: string;
  data_scope: string;
  name: string;
  description: string | null;
  scope_type: string;
  scope_ids: string | null;
  scope_sports: string | null;
  trigger_type: string;
  trigger_config_json: string;
  threshold_value: number | null;
  time_window_minutes: number | null;
  is_bundled: number;
  max_per_game_per_hour: number;
  push_enabled: number;
  in_app_enabled: number;
  quiet_hours_enabled: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  is_active: number;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

// Convert DB row to API model (numeric id -> string)
function toApiModel(row: CustomAlertRuleRow): CustomAlertRule {
  return {
    ...row,
    id: String(row.id),
  };
}

export interface CreateRuleInput {
  name: string;
  description?: string;
  scopeType: "WATCHLIST" | "LEAGUE" | "TEAM" | "PLAYER";
  scopeIds?: string[];
  scopeSports?: string[];
  triggerType: keyof typeof TRIGGER_TYPES;
  triggerConfig: Record<string, unknown>;
  thresholdValue?: number;
  timeWindowMinutes?: number;
  isBundled?: boolean;
  maxPerGamePerHour?: number;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface UpdateRuleInput extends Partial<CreateRuleInput> {
  isActive?: boolean;
}

export async function createRule(
  db: D1Database,
  userId: string,
  input: CreateRuleInput,
  dataScope = "PROD"
): Promise<CustomAlertRule> {
  const result = await db
    .prepare(
      `INSERT INTO custom_alert_rules (
        user_id, data_scope, name, description, scope_type, scope_ids, scope_sports,
        trigger_type, trigger_config_json, threshold_value, time_window_minutes,
        is_bundled, max_per_game_per_hour, push_enabled, in_app_enabled,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`
    )
    .bind(
      userId,
      dataScope,
      input.name,
      input.description || null,
      input.scopeType,
      input.scopeIds ? JSON.stringify(input.scopeIds) : null,
      input.scopeSports ? JSON.stringify(input.scopeSports) : null,
      input.triggerType,
      JSON.stringify(input.triggerConfig || {}),
      input.thresholdValue ?? null,
      input.timeWindowMinutes ?? null,
      input.isBundled !== false ? 1 : 0,
      input.maxPerGamePerHour ?? 3,
      input.pushEnabled !== false ? 1 : 0,
      input.inAppEnabled !== false ? 1 : 0,
      input.quietHoursEnabled ? 1 : 0,
      input.quietHoursStart || null,
      input.quietHoursEnd || null
    )
    .first<CustomAlertRuleRow>();

  if (!result) {
    throw new Error("Failed to create rule");
  }

  return toApiModel(result);
}

export async function updateRule(
  db: D1Database,
  userId: string,
  ruleId: string,
  input: UpdateRuleInput
): Promise<CustomAlertRule | null> {
  const numericRuleId = parseInt(ruleId, 10);
  
  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push("description = ?");
    values.push(input.description);
  }
  if (input.scopeType !== undefined) {
    updates.push("scope_type = ?");
    values.push(input.scopeType);
  }
  if (input.scopeIds !== undefined) {
    updates.push("scope_ids = ?");
    values.push(JSON.stringify(input.scopeIds));
  }
  if (input.scopeSports !== undefined) {
    updates.push("scope_sports = ?");
    values.push(JSON.stringify(input.scopeSports));
  }
  if (input.triggerType !== undefined) {
    updates.push("trigger_type = ?");
    values.push(input.triggerType);
  }
  if (input.triggerConfig !== undefined) {
    updates.push("trigger_config_json = ?");
    values.push(JSON.stringify(input.triggerConfig));
  }
  if (input.thresholdValue !== undefined) {
    updates.push("threshold_value = ?");
    values.push(input.thresholdValue);
  }
  if (input.timeWindowMinutes !== undefined) {
    updates.push("time_window_minutes = ?");
    values.push(input.timeWindowMinutes);
  }
  if (input.isBundled !== undefined) {
    updates.push("is_bundled = ?");
    values.push(input.isBundled ? 1 : 0);
  }
  if (input.maxPerGamePerHour !== undefined) {
    updates.push("max_per_game_per_hour = ?");
    values.push(input.maxPerGamePerHour);
  }
  if (input.pushEnabled !== undefined) {
    updates.push("push_enabled = ?");
    values.push(input.pushEnabled ? 1 : 0);
  }
  if (input.inAppEnabled !== undefined) {
    updates.push("in_app_enabled = ?");
    values.push(input.inAppEnabled ? 1 : 0);
  }
  if (input.quietHoursEnabled !== undefined) {
    updates.push("quiet_hours_enabled = ?");
    values.push(input.quietHoursEnabled ? 1 : 0);
  }
  if (input.quietHoursStart !== undefined) {
    updates.push("quiet_hours_start = ?");
    values.push(input.quietHoursStart);
  }
  if (input.quietHoursEnd !== undefined) {
    updates.push("quiet_hours_end = ?");
    values.push(input.quietHoursEnd);
  }
  if (input.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return getRuleById(db, userId, ruleId);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(numericRuleId, userId);

  const result = await db
    .prepare(
      `UPDATE custom_alert_rules SET ${updates.join(", ")} WHERE id = ? AND user_id = ? RETURNING *`
    )
    .bind(...values)
    .first<CustomAlertRuleRow>();

  return result ? toApiModel(result) : null;
}

export async function deleteRule(
  db: D1Database,
  userId: string,
  ruleId: string
): Promise<boolean> {
  const numericRuleId = parseInt(ruleId, 10);
  const result = await db
    .prepare("DELETE FROM custom_alert_rules WHERE id = ? AND user_id = ?")
    .bind(numericRuleId, userId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function getRuleById(
  db: D1Database,
  userId: string,
  ruleId: string
): Promise<CustomAlertRule | null> {
  const numericRuleId = parseInt(ruleId, 10);
  const result = await db
    .prepare("SELECT * FROM custom_alert_rules WHERE id = ? AND user_id = ?")
    .bind(numericRuleId, userId)
    .first<CustomAlertRuleRow>();

  return result ? toApiModel(result) : null;
}

export async function getUserRules(
  db: D1Database,
  userId: string,
  dataScope = "PROD",
  activeOnly = false
): Promise<CustomAlertRule[]> {
  const query = activeOnly
    ? "SELECT * FROM custom_alert_rules WHERE user_id = ? AND data_scope = ? AND is_active = 1 ORDER BY created_at DESC"
    : "SELECT * FROM custom_alert_rules WHERE user_id = ? AND data_scope = ? ORDER BY created_at DESC";

  const result = await db.prepare(query).bind(userId, dataScope).all<CustomAlertRuleRow>();
  return (result.results || []).map(toApiModel);
}

export async function toggleRuleActive(
  db: D1Database,
  userId: string,
  ruleId: string
): Promise<CustomAlertRule | null> {
  const numericRuleId = parseInt(ruleId, 10);
  
  // First get current state
  const current = await db
    .prepare("SELECT is_active FROM custom_alert_rules WHERE id = ? AND user_id = ?")
    .bind(numericRuleId, userId)
    .first<{ is_active: number }>();
  
  if (!current) return null;
  
  const newActive = current.is_active === 1 ? 0 : 1;
  
  const result = await db
    .prepare(
      `UPDATE custom_alert_rules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? RETURNING *`
    )
    .bind(newActive, numericRuleId, userId)
    .first<CustomAlertRuleRow>();

  return result ? toApiModel(result) : null;
}

export async function duplicateRule(
  db: D1Database,
  userId: string,
  ruleId: string
): Promise<CustomAlertRule | null> {
  const original = await getRuleById(db, userId, ruleId);
  if (!original) return null;

  return createRule(db, userId, {
    name: `${original.name} (Copy)`,
    description: original.description || undefined,
    scopeType: original.scope_type as CreateRuleInput["scopeType"],
    scopeIds: original.scope_ids ? JSON.parse(original.scope_ids) : undefined,
    scopeSports: original.scope_sports ? JSON.parse(original.scope_sports) : undefined,
    triggerType: original.trigger_type as keyof typeof TRIGGER_TYPES,
    triggerConfig: JSON.parse(original.trigger_config_json || "{}"),
    thresholdValue: original.threshold_value ?? undefined,
    timeWindowMinutes: original.time_window_minutes ?? undefined,
    isBundled: original.is_bundled === 1,
    maxPerGamePerHour: original.max_per_game_per_hour,
    pushEnabled: original.push_enabled === 1,
    inAppEnabled: original.in_app_enabled === 1,
    quietHoursEnabled: original.quiet_hours_enabled === 1,
    quietHoursStart: original.quiet_hours_start ?? undefined,
    quietHoursEnd: original.quiet_hours_end ?? undefined,
  }, original.data_scope);
}

export async function recordRuleTrigger(
  db: D1Database,
  ruleId: string,
  userId: string,
  gameId: string | null,
  triggerData: Record<string, unknown>,
  alertId: number | null,
  wasBundled: boolean,
  wasSuppressed: boolean,
  suppressionReason?: string,
  dataScope = "PROD"
): Promise<void> {
  const numericRuleId = parseInt(ruleId, 10);
  
  // Insert trigger log
  await db
    .prepare(
      `INSERT INTO custom_alert_rule_triggers (
        rule_id, user_id, data_scope, game_id, trigger_data_json,
        alert_id, was_bundled, was_suppressed, suppression_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      numericRuleId,
      userId,
      dataScope,
      gameId,
      JSON.stringify(triggerData),
      alertId,
      wasBundled ? 1 : 0,
      wasSuppressed ? 1 : 0,
      suppressionReason || null
    )
    .run();

  // Update rule trigger count and timestamp
  await db
    .prepare(
      `UPDATE custom_alert_rules SET 
        trigger_count = trigger_count + 1,
        last_triggered_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    )
    .bind(numericRuleId)
    .run();
}

export async function getRuleTriggerHistory(
  db: D1Database,
  userId: string,
  ruleId: string,
  limit = 20
): Promise<Array<{
  id: string;
  game_id: string | null;
  trigger_data_json: string;
  was_bundled: number;
  was_suppressed: number;
  suppression_reason: string | null;
  triggered_at: string;
}>> {
  const numericRuleId = parseInt(ruleId, 10);
  const result = await db
    .prepare(
      `SELECT id, game_id, trigger_data_json, was_bundled, was_suppressed, suppression_reason, triggered_at
       FROM custom_alert_rule_triggers
       WHERE rule_id = ? AND user_id = ?
       ORDER BY triggered_at DESC
       LIMIT ?`
    )
    .bind(numericRuleId, userId, limit)
    .all();

  return (result.results || []).map((row: unknown) => {
    const r = row as { id: number; game_id: string | null; trigger_data_json: string; was_bundled: number; was_suppressed: number; suppression_reason: string | null; triggered_at: string };
    return {
      ...r,
      id: String(r.id),
    };
  });
}

// Get trigger types available for a specific sport
export function getTriggerTypesForSport(sport: string): Array<{
  key: string;
  label: string;
  description: string;
  configSchema: Record<string, unknown>;
}> {
  return Object.values(TRIGGER_TYPES)
    .filter((t) => t.sports.includes(sport as never))
    .map((t) => ({
      key: t.key,
      label: t.label,
      description: t.description,
      configSchema: t.configSchema,
    }));
}

// Get dominant performance presets for a sport
export function getDominantPresetsForSport(
  sport: string
): Array<{ key: string; label: string; description: string }> {
  const presets = DOMINANT_PRESETS[sport as keyof typeof DOMINANT_PRESETS];
  if (!presets) return [];
  return presets.map(p => ({ key: p.key, label: p.label, description: p.description }));
}
