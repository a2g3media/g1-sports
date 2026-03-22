/**
 * Canonical Pool Rule Configuration Schema
 *
 * Single source of truth for all pool settings.
 * Every field has a deterministic default; every field is admin-overridable.
 * Stored in `leagues.rules_json` as serialized JSON.
 */

import type { PoolTemplateKey } from "./poolTypeCatalog";

// ─── Tie / Push ─────────────────────────────────────────────────
export type TieHandling = "loss" | "win" | "no_action" | "push" | "void";
export type PushHandling = "no_action" | "win" | "loss";
export type DrawHandling = "loss" | "win" | "advance";

// ─── Canceled / Postponed ───────────────────────────────────────
export type CanceledPreStart = "allow_repick" | "void" | "loss";
export type CanceledPostStart = "stands_for_reschedule" | "void" | "loss";
export type CanceledVoid = "no_action" | "loss" | "win";
export type PostponedHandling = "carry" | "void" | "allow_repick";

// ─── Missed Pick ────────────────────────────────────────────────
export type MissedPickBehavior =
  | "zero"
  | "loss"
  | "streak_reset"
  | "auto_pick_favorite"
  | "auto_pick_random"
  | "allow_late";

// ─── Payout ─────────────────────────────────────────────────────
export type PayoutType = "season" | "weekly" | "round" | "per_game";
export type PayoutSplitMode = "equal" | "percentage" | "custom";
export type PayoutTieMode = "split_no_skip" | "split_skip_next" | "custom_redistribution";

export interface PayoutPlacement {
  place: number;
  amount_cents?: number;
  percentage?: number;
  label?: string;
}

export interface PayoutBucket {
  type: PayoutType;
  placements: PayoutPlacement[];
  split_mode: PayoutSplitMode;
  tie_mode: PayoutTieMode;
}

// ─── Scoring ────────────────────────────────────────────────────
export type ScoringType = "straight" | "ats" | "confidence" | "points" | "custom";
export type TiebreakerType = "total_points" | "monday_night" | "none" | "head_to_head";

export interface ScoringConfig {
  type: ScoringType;
  points_per_win: number;
  push_value: number;
  upset_bonus: number;
  blowout_bonus: number;
  exact_margin_bonus: number;
  perfect_week_bonus: number;
  confidence_multiplier: boolean;
  custom_formula?: string;
  tiebreaker: TiebreakerType;
}

// ─── Survivor ───────────────────────────────────────────────────
export type EliminationMode = "one_life" | "multi_life" | "strikes" | "buy_back";

export interface SurvivorConfig {
  lives: number;
  strikes_limit: number;
  allow_team_reuse: boolean;
  buyback_enabled: boolean;
  buyback_start_week: number;
  buyback_end_week: number;
  buyback_fee_cents: number;
  elimination_mode: EliminationMode;
}

// ─── Visibility / Deadlines ─────────────────────────────────────
export type PickLockTime = "game_start" | "first_game" | "custom";
export type PickVisibility = "immediate" | "after_lock" | "after_period";

// ─── Entry ──────────────────────────────────────────────────────
export type EntryMode = "single" | "optional" | "required";

export interface EntryConfig {
  mode: EntryMode;
  max_entries_per_user: number;
  required_entries: number;
  entry_naming: "auto" | "custom";
}

// ─── Bundle ─────────────────────────────────────────────────────
export type BundleAggregation = "sum" | "weighted" | "custom";

export interface BundleConfig {
  child_pool_ids: number[];
  aggregation: BundleAggregation;
  overall_leaderboard: boolean;
  payout_per_pool: Record<number, PayoutBucket[]>;
}

// ─── Calcutta / Auction ─────────────────────────────────────────
export type AuctionType = "live" | "silent_bid" | "fixed_tier";

export interface CalcuttaConfig {
  auction_type: AuctionType;
  fractional_ownership: boolean;
  payout_proportional: boolean;
}

// ─── The Canonical Config ───────────────────────────────────────
export interface PoolRuleConfig {
  // Tie / Push
  tie_handling: TieHandling;
  push_handling: PushHandling;
  draw_handling: DrawHandling;

  // Canceled / Postponed
  canceled_pre_start: CanceledPreStart;
  canceled_post_start: CanceledPostStart;
  canceled_void: CanceledVoid;
  postponed_handling: PostponedHandling;
  canceled_survivor_never_eliminates: boolean;

  // Missed Pick
  missed_pick_behavior: MissedPickBehavior;

  // Deadlines / Visibility
  pick_lock_time: PickLockTime;
  pick_visibility: PickVisibility;
  allow_late_joins: boolean;
  allow_late_picks: boolean;

  // Entry
  entry: EntryConfig;

  // Scoring
  scoring: ScoringConfig;

  // Survivor (only relevant for survivor/lms templates)
  survivor: SurvivorConfig;

  // Payout
  payouts: PayoutBucket[];

  // Bundle (only relevant for bundle_pool template)
  bundle?: BundleConfig;

  // Calcutta (only relevant for calcutta variants)
  calcutta?: CalcuttaConfig;

  // Picks per period
  picks_per_period: number | "all";

  // Drop worst / Best X
  drop_worst_periods: number;
  best_x_periods: number;

  // Leaderboard
  leaderboard_modes: string[];

  // Freeform commissioner text
  custom_rule_text: string;
}

// ─── Defaults by Pool Family ────────────────────────────────────

const BASE_SCORING: ScoringConfig = {
  type: "straight",
  points_per_win: 1,
  push_value: 0,
  upset_bonus: 0,
  blowout_bonus: 0,
  exact_margin_bonus: 0,
  perfect_week_bonus: 0,
  confidence_multiplier: false,
  tiebreaker: "total_points",
};

const BASE_SURVIVOR: SurvivorConfig = {
  lives: 1,
  strikes_limit: 0,
  allow_team_reuse: false,
  buyback_enabled: false,
  buyback_start_week: 0,
  buyback_end_week: 0,
  buyback_fee_cents: 0,
  elimination_mode: "one_life",
};

const BASE_ENTRY: EntryConfig = {
  mode: "single",
  max_entries_per_user: 1,
  required_entries: 1,
  entry_naming: "auto",
};

const BASE_DEFAULTS: PoolRuleConfig = {
  tie_handling: "loss",
  push_handling: "no_action",
  draw_handling: "loss",
  canceled_pre_start: "allow_repick",
  canceled_post_start: "stands_for_reschedule",
  canceled_void: "no_action",
  postponed_handling: "carry",
  canceled_survivor_never_eliminates: true,
  missed_pick_behavior: "zero",
  pick_lock_time: "game_start",
  pick_visibility: "after_lock",
  allow_late_joins: false,
  allow_late_picks: false,
  entry: { ...BASE_ENTRY },
  scoring: { ...BASE_SCORING },
  survivor: { ...BASE_SURVIVOR },
  payouts: [],
  picks_per_period: "all",
  drop_worst_periods: 0,
  best_x_periods: 0,
  leaderboard_modes: ["season"],
  custom_rule_text: "",
};

/**
 * Per-family default overrides on top of BASE_DEFAULTS
 */
const FAMILY_OVERRIDES: Record<string, Partial<PoolRuleConfig>> = {
  pickem: {
    tie_handling: "loss",
    missed_pick_behavior: "zero",
    leaderboard_modes: ["weekly", "season"],
  },
  ats_pickem: {
    tie_handling: "loss",
    push_handling: "no_action",
    missed_pick_behavior: "zero",
    scoring: { ...BASE_SCORING, type: "ats", push_value: 0 },
    leaderboard_modes: ["weekly", "season"],
  },
  confidence: {
    tie_handling: "no_action",
    missed_pick_behavior: "zero",
    scoring: { ...BASE_SCORING, type: "confidence", confidence_multiplier: true },
    leaderboard_modes: ["weekly", "season"],
  },
  ats_confidence: {
    tie_handling: "no_action",
    push_handling: "no_action",
    missed_pick_behavior: "zero",
    scoring: { ...BASE_SCORING, type: "confidence", confidence_multiplier: true },
    leaderboard_modes: ["weekly", "season"],
  },
  survivor: {
    tie_handling: "loss",
    missed_pick_behavior: "loss",
    canceled_survivor_never_eliminates: true,
    picks_per_period: 1,
    leaderboard_modes: ["survival_remaining", "last_alive"],
  },
  last_man_standing: {
    tie_handling: "loss",
    missed_pick_behavior: "loss",
    canceled_survivor_never_eliminates: true,
    picks_per_period: 1,
    leaderboard_modes: ["last_alive", "survival_rank"],
  },
  streak: {
    tie_handling: "loss",
    missed_pick_behavior: "streak_reset",
    leaderboard_modes: ["highest_streak"],
  },
  upset_underdog: {
    tie_handling: "loss",
    missed_pick_behavior: "zero",
    scoring: { ...BASE_SCORING, upset_bonus: 1 },
    leaderboard_modes: ["weekly", "season"],
  },
  squares: {
    tie_handling: "no_action",
    missed_pick_behavior: "zero",
    leaderboard_modes: ["board_results"],
  },
  bracket: {
    tie_handling: "no_action",
    missed_pick_behavior: "zero",
    scoring: { ...BASE_SCORING, type: "points" },
    leaderboard_modes: ["tournament", "round"],
  },
  prop: {
    tie_handling: "no_action",
    missed_pick_behavior: "zero",
    leaderboard_modes: ["weekly", "season"],
  },
  stat_performance: {
    tie_handling: "no_action",
    missed_pick_behavior: "zero",
    leaderboard_modes: ["weekly", "season"],
  },
  bundle_pool: {
    tie_handling: "no_action",
    missed_pick_behavior: "zero",
    bundle: {
      child_pool_ids: [],
      aggregation: "sum",
      overall_leaderboard: true,
      payout_per_pool: {},
    },
    leaderboard_modes: ["child_pool", "overall_bundle"],
  },
};

/**
 * Build the full PoolRuleConfig for a given template with admin overrides merged.
 */
export function buildPoolRuleConfig(
  template: PoolTemplateKey | string,
  adminOverrides?: Partial<PoolRuleConfig> | Record<string, unknown> | null,
): PoolRuleConfig {
  const familyDefaults = FAMILY_OVERRIDES[template] || {};
  const merged: PoolRuleConfig = {
    ...BASE_DEFAULTS,
    ...familyDefaults,
    entry: { ...BASE_ENTRY, ...(familyDefaults.entry || {}) },
    scoring: { ...BASE_SCORING, ...(familyDefaults.scoring || {}) },
    survivor: { ...BASE_SURVIVOR, ...(familyDefaults.survivor || {}) },
    payouts: familyDefaults.payouts || [],
    leaderboard_modes: familyDefaults.leaderboard_modes || BASE_DEFAULTS.leaderboard_modes,
  };

  if (!adminOverrides) return merged;

  const overrides = adminOverrides as Record<string, unknown>;
  const stringKeys: (keyof PoolRuleConfig)[] = [
    "tie_handling", "push_handling", "draw_handling",
    "canceled_pre_start", "canceled_post_start", "canceled_void",
    "postponed_handling", "missed_pick_behavior",
    "pick_lock_time", "pick_visibility", "custom_rule_text",
  ];
  for (const key of stringKeys) {
    if (typeof overrides[key] === "string") {
      (merged as unknown as Record<string, unknown>)[key] = overrides[key];
    }
  }

  const boolKeys: (keyof PoolRuleConfig)[] = [
    "canceled_survivor_never_eliminates",
    "allow_late_joins", "allow_late_picks",
  ];
  for (const key of boolKeys) {
    if (typeof overrides[key] === "boolean") {
      (merged as unknown as Record<string, unknown>)[key] = overrides[key];
    }
  }

  if (overrides.picks_per_period !== undefined) {
    merged.picks_per_period = overrides.picks_per_period === "all" ? "all" : Number(overrides.picks_per_period) || 1;
  }

  if (typeof overrides.drop_worst_periods === "number") merged.drop_worst_periods = overrides.drop_worst_periods;
  if (typeof overrides.best_x_periods === "number") merged.best_x_periods = overrides.best_x_periods;

  if (overrides.entry && typeof overrides.entry === "object") {
    Object.assign(merged.entry, overrides.entry);
  }
  if (overrides.scoring && typeof overrides.scoring === "object") {
    Object.assign(merged.scoring, overrides.scoring);
  }
  if (overrides.survivor && typeof overrides.survivor === "object") {
    Object.assign(merged.survivor, overrides.survivor);
  }
  if (Array.isArray(overrides.payouts)) {
    merged.payouts = overrides.payouts as PayoutBucket[];
  }
  if (overrides.bundle && typeof overrides.bundle === "object") {
    merged.bundle = { ...(merged.bundle || { child_pool_ids: [], aggregation: "sum", overall_leaderboard: true, payout_per_pool: {} }), ...(overrides.bundle as Partial<BundleConfig>) };
  }
  if (overrides.calcutta && typeof overrides.calcutta === "object") {
    merged.calcutta = overrides.calcutta as CalcuttaConfig;
  }
  if (Array.isArray(overrides.leaderboard_modes)) {
    merged.leaderboard_modes = overrides.leaderboard_modes as string[];
  }

  // Legacy field normalization
  if (overrides.tieHandling) merged.tie_handling = overrides.tieHandling as TieHandling;
  if (overrides.tie_handling) merged.tie_handling = overrides.tie_handling as TieHandling;
  if (overrides.missedPickBehavior) merged.missed_pick_behavior = overrides.missedPickBehavior as MissedPickBehavior;
  if (overrides.missed_pick_behavior) merged.missed_pick_behavior = overrides.missed_pick_behavior as MissedPickBehavior;
  if (overrides.allowLateJoins !== undefined) merged.allow_late_joins = Boolean(overrides.allowLateJoins);
  if (overrides.allow_late_joins !== undefined) merged.allow_late_joins = Boolean(overrides.allow_late_joins);
  if (overrides.pointsPerWin !== undefined) merged.scoring.points_per_win = Number(overrides.pointsPerWin) || 1;
  if (overrides.points_per_win !== undefined) merged.scoring.points_per_win = Number(overrides.points_per_win) || 1;
  if (overrides.survivorLives !== undefined) merged.survivor.lives = Number(overrides.survivorLives) || 1;
  if (overrides.lives !== undefined) merged.survivor.lives = Number(overrides.lives) || 1;
  if (overrides.allowTeamReuse !== undefined) merged.survivor.allow_team_reuse = Boolean(overrides.allowTeamReuse);

  // Entry mode normalization
  if (overrides.entryMode) {
    const mode = String(overrides.entryMode);
    if (mode === "single" || mode === "optional" || mode === "required") merged.entry.mode = mode;
  }
  if (overrides.maxEntriesPerUser !== undefined) merged.entry.max_entries_per_user = Number(overrides.maxEntriesPerUser) || 1;
  if (overrides.requiredEntries !== undefined) merged.entry.required_entries = Number(overrides.requiredEntries) || 1;

  return merged;
}

/**
 * Validate a PoolRuleConfig. Returns array of error strings (empty = valid).
 */
export function validatePoolRuleConfig(config: PoolRuleConfig): string[] {
  const errors: string[] = [];

  if (config.entry.mode === "required" && config.entry.required_entries < 2) {
    errors.push("Required entry mode must have required_entries >= 2.");
  }
  if (config.entry.mode === "optional" && config.entry.max_entries_per_user < 2) {
    errors.push("Optional multi-entry mode must allow at least 2 entries.");
  }
  if (config.scoring.points_per_win < 0) {
    errors.push("points_per_win must be non-negative.");
  }
  if (config.survivor.lives < 1) {
    errors.push("Survivor lives must be at least 1.");
  }
  if (config.drop_worst_periods < 0) {
    errors.push("drop_worst_periods must be non-negative.");
  }
  if (config.payouts.length > 0) {
    for (const bucket of config.payouts) {
      if (bucket.placements.length === 0) {
        errors.push(`Payout bucket '${bucket.type}' must have at least one placement.`);
      }
    }
  }

  return errors;
}

/**
 * Serialize a PoolRuleConfig to JSON for storage in rules_json.
 */
export function serializePoolRuleConfig(config: PoolRuleConfig): string {
  return JSON.stringify(config);
}

/**
 * Deserialize rules_json string into a PoolRuleConfig, filling defaults.
 */
export function deserializePoolRuleConfig(
  template: PoolTemplateKey | string,
  rulesJson?: string | null,
): PoolRuleConfig {
  let overrides: Record<string, unknown> = {};
  if (rulesJson) {
    try {
      const parsed = JSON.parse(rulesJson);
      if (parsed && typeof parsed === "object") overrides = parsed;
    } catch {
      // invalid JSON — use defaults
    }
  }
  return buildPoolRuleConfig(template, overrides);
}

/**
 * Get the admin settings groups for the config UI.
 */
export type AdminSettingsGroup = "structure" | "rules" | "scoring" | "payouts" | "visibility";

export interface AdminSettingsField {
  key: string;
  group: AdminSettingsGroup;
  label: string;
  type: "select" | "toggle" | "number" | "text" | "multi_select";
  options?: { value: string; label: string }[];
  default_value: unknown;
}

export function getAdminSettingsFields(template: PoolTemplateKey | string): AdminSettingsField[] {
  const fields: AdminSettingsField[] = [
    // Structure
    { key: "entry.mode", group: "structure", label: "Entry Mode", type: "select", options: [
      { value: "single", label: "Single Entry" },
      { value: "optional", label: "Optional Multiple Entries" },
      { value: "required", label: "Mandatory Multiple Entries" },
    ], default_value: "single" },
    { key: "entry.max_entries_per_user", group: "structure", label: "Max Entries Per User", type: "number", default_value: 1 },
    { key: "entry.required_entries", group: "structure", label: "Required Entries (if mandatory)", type: "number", default_value: 1 },
    { key: "picks_per_period", group: "structure", label: "Picks Per Period", type: "text", default_value: "all" },
    { key: "allow_late_joins", group: "structure", label: "Allow Late Joins", type: "toggle", default_value: false },

    // Rules
    { key: "tie_handling", group: "rules", label: "Tie Handling", type: "select", options: [
      { value: "loss", label: "Tie = Loss" },
      { value: "win", label: "Tie = Win" },
      { value: "no_action", label: "Tie = No Action (0 pts)" },
      { value: "push", label: "Tie = Push" },
      { value: "void", label: "Tie = Void" },
    ], default_value: "loss" },
    { key: "push_handling", group: "rules", label: "Push Handling (ATS)", type: "select", options: [
      { value: "no_action", label: "Push = 0 Points" },
      { value: "win", label: "Push = Win" },
      { value: "loss", label: "Push = Loss" },
    ], default_value: "no_action" },
    { key: "missed_pick_behavior", group: "rules", label: "Missed Pick Behavior", type: "select", options: [
      { value: "zero", label: "0 Points" },
      { value: "loss", label: "Count as Loss" },
      { value: "streak_reset", label: "Reset Streak" },
      { value: "auto_pick_favorite", label: "Auto-Pick Favorite" },
      { value: "auto_pick_random", label: "Auto-Pick Random" },
      { value: "allow_late", label: "Allow Late Submission" },
    ], default_value: "zero" },
    { key: "canceled_pre_start", group: "rules", label: "Canceled Game (Before Start)", type: "select", options: [
      { value: "allow_repick", label: "Allow Repick" },
      { value: "void", label: "Void (No Action)" },
      { value: "loss", label: "Count as Loss" },
    ], default_value: "allow_repick" },
    { key: "canceled_post_start", group: "rules", label: "Canceled Game (After Start)", type: "select", options: [
      { value: "stands_for_reschedule", label: "Stands for Reschedule" },
      { value: "void", label: "Void" },
      { value: "loss", label: "Count as Loss" },
    ], default_value: "stands_for_reschedule" },
    { key: "canceled_void", group: "rules", label: "Fully Canceled Game", type: "select", options: [
      { value: "no_action", label: "No Action (No Win/Loss)" },
      { value: "loss", label: "Count as Loss" },
      { value: "win", label: "Count as Win" },
    ], default_value: "no_action" },
    { key: "allow_late_picks", group: "rules", label: "Allow Late Picks", type: "toggle", default_value: false },
    { key: "drop_worst_periods", group: "rules", label: "Drop Worst Weeks", type: "number", default_value: 0 },
    { key: "best_x_periods", group: "rules", label: "Best X Weeks", type: "number", default_value: 0 },

    // Scoring
    { key: "scoring.type", group: "scoring", label: "Scoring Type", type: "select", options: [
      { value: "straight", label: "Straight Up" },
      { value: "ats", label: "Against the Spread" },
      { value: "confidence", label: "Confidence Ranking" },
      { value: "points", label: "Points Based" },
      { value: "custom", label: "Custom Formula" },
    ], default_value: "straight" },
    { key: "scoring.points_per_win", group: "scoring", label: "Points Per Win", type: "number", default_value: 1 },
    { key: "scoring.push_value", group: "scoring", label: "Push Value (ATS)", type: "number", default_value: 0 },
    { key: "scoring.upset_bonus", group: "scoring", label: "Upset Bonus Points", type: "number", default_value: 0 },
    { key: "scoring.blowout_bonus", group: "scoring", label: "Blowout Bonus Points", type: "number", default_value: 0 },
    { key: "scoring.perfect_week_bonus", group: "scoring", label: "Perfect Week Bonus", type: "number", default_value: 0 },
    { key: "scoring.confidence_multiplier", group: "scoring", label: "Confidence Multiplier", type: "toggle", default_value: false },
    { key: "scoring.tiebreaker", group: "scoring", label: "Tiebreaker Method", type: "select", options: [
      { value: "total_points", label: "Total Points" },
      { value: "monday_night", label: "Monday Night Score" },
      { value: "head_to_head", label: "Head to Head" },
      { value: "none", label: "None" },
    ], default_value: "total_points" },

    // Visibility
    { key: "pick_lock_time", group: "visibility", label: "Pick Lock Time", type: "select", options: [
      { value: "game_start", label: "Individual Game Start" },
      { value: "first_game", label: "First Game of Period" },
      { value: "custom", label: "Custom Deadline" },
    ], default_value: "game_start" },
    { key: "pick_visibility", group: "visibility", label: "Pick Visibility", type: "select", options: [
      { value: "immediate", label: "Immediately Visible" },
      { value: "after_lock", label: "After Lock" },
      { value: "after_period", label: "After Period Ends" },
    ], default_value: "after_lock" },
    { key: "custom_rule_text", group: "visibility", label: "Custom Rule Text", type: "text", default_value: "" },
  ];

  // Survivor-specific fields
  if (template === "survivor" || template === "last_man_standing") {
    fields.push(
      { key: "survivor.lives", group: "rules", label: "Lives", type: "number", default_value: 1 },
      { key: "survivor.allow_team_reuse", group: "rules", label: "Allow Team Reuse", type: "toggle", default_value: false },
      { key: "survivor.buyback_enabled", group: "rules", label: "Buyback Enabled", type: "toggle", default_value: false },
      { key: "survivor.buyback_start_week", group: "rules", label: "Buyback Start Week", type: "number", default_value: 0 },
      { key: "survivor.buyback_end_week", group: "rules", label: "Buyback End Week", type: "number", default_value: 0 },
      { key: "survivor.elimination_mode", group: "rules", label: "Elimination Mode", type: "select", options: [
        { value: "one_life", label: "One Life" },
        { value: "multi_life", label: "Multiple Lives" },
        { value: "strikes", label: "Strikes" },
        { value: "buy_back", label: "Buy Back" },
      ], default_value: "one_life" },
    );
  }

  return fields;
}
