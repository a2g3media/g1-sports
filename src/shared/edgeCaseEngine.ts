/**
 * Edge Case Enforcement Engine
 *
 * Deterministic handlers for every edge case in pool play.
 * Pure functions — no DB access. Receives resolved config + event state, returns actions.
 */

import type { PoolRuleConfig, MissedPickBehavior, TieHandling } from "./poolRuleConfig";

// ─── Event Status ───────────────────────────────────────────────

export type GameStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "final"
  | "postponed"
  | "canceled"
  | "suspended"
  | "delayed"
  | "stat_correction";

// ─── Action Results ─────────────────────────────────────────────

export type EdgeAction =
  | "allow"
  | "reject"
  | "void_pick"
  | "allow_repick"
  | "score_as_loss"
  | "score_as_win"
  | "score_zero"
  | "streak_reset"
  | "auto_pick_favorite"
  | "auto_pick_random"
  | "stands_for_reschedule"
  | "eliminate"
  | "safe"
  | "recalculate"
  | "no_action";

export interface EdgeCaseResult {
  action: EdgeAction;
  reason: string;
  requires_recalculation: boolean;
  affects_elimination: boolean;
}

// ─── Pick Validation ────────────────────────────────────────────

export interface PickValidationInput {
  event_id: string;
  pick_value: string;
  confidence_rank?: number;
  entry_id?: number;
}

export interface PickValidationContext {
  config: PoolRuleConfig;
  template: string;
  period_id: string;
  existing_picks: PickValidationInput[];
  used_teams: string[];
  eligible_event_ids: Set<string>;
  locked_event_ids: Set<string>;
  started_event_ids: Set<string>;
  max_confidence_rank: number;
}

export interface PickValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePick(
  pick: PickValidationInput,
  ctx: PickValidationContext,
): PickValidationResult {
  const errors: string[] = [];

  if (!pick.event_id || !pick.pick_value) {
    errors.push("Pick must include event_id and pick_value.");
  }

  if (!ctx.eligible_event_ids.has(pick.event_id)) {
    errors.push(`Event ${pick.event_id} is not eligible for period ${ctx.period_id}.`);
  }

  if (ctx.locked_event_ids.has(pick.event_id) && !ctx.config.allow_late_picks) {
    errors.push(`Event ${pick.event_id} is locked — picks are no longer accepted.`);
  }

  if (ctx.started_event_ids.has(pick.event_id) && !ctx.config.allow_late_picks) {
    errors.push(`Event ${pick.event_id} has already started.`);
  }

  const duplicateEvent = ctx.existing_picks.find(
    (p) => p.event_id === pick.event_id && p.entry_id === pick.entry_id,
  );
  if (duplicateEvent) {
    errors.push(`Duplicate pick for event ${pick.event_id}.`);
  }

  if (
    (ctx.template === "survivor" || ctx.template === "last_man_standing") &&
    !ctx.config.survivor.allow_team_reuse
  ) {
    const normalizedPick = pick.pick_value.trim().toLowerCase();
    if (ctx.used_teams.some((t) => t.trim().toLowerCase() === normalizedPick)) {
      errors.push(`Team "${pick.pick_value}" has already been used and cannot be reused.`);
    }
  }

  if (
    (ctx.template === "confidence" || ctx.template === "ats_confidence") &&
    pick.confidence_rank !== undefined
  ) {
    if (pick.confidence_rank < 1 || pick.confidence_rank > ctx.max_confidence_rank) {
      errors.push(`Confidence rank must be between 1 and ${ctx.max_confidence_rank}.`);
    }
    const duplicateRank = ctx.existing_picks.find(
      (p) => p.confidence_rank === pick.confidence_rank && p.entry_id === pick.entry_id,
    );
    if (duplicateRank) {
      errors.push(`Confidence rank ${pick.confidence_rank} is already assigned.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Canceled Game Handling ─────────────────────────────────────

export function handleCanceledGame(
  config: PoolRuleConfig,
  template: string,
  gameStarted: boolean,
  isFullyVoided: boolean,
): EdgeCaseResult {
  if (isFullyVoided) {
    if ((template === "survivor" || template === "last_man_standing") && config.canceled_survivor_never_eliminates) {
      return {
        action: "no_action",
        reason: "Fully canceled game — survivor entries are never eliminated by canceled games.",
        requires_recalculation: true,
        affects_elimination: false,
      };
    }
    const voidAction = config.canceled_void;
    return {
      action: voidAction === "loss" ? "score_as_loss" : voidAction === "win" ? "score_as_win" : "no_action",
      reason: `Fully canceled game — ${voidAction} applied.`,
      requires_recalculation: true,
      affects_elimination: voidAction === "loss",
    };
  }

  if (!gameStarted) {
    return {
      action: config.canceled_pre_start === "allow_repick" ? "allow_repick" : config.canceled_pre_start === "void" ? "void_pick" : "score_as_loss",
      reason: `Game canceled before start — ${config.canceled_pre_start} applied.`,
      requires_recalculation: true,
      affects_elimination: config.canceled_pre_start === "loss",
    };
  }

  if (config.canceled_post_start === "stands_for_reschedule") {
    return {
      action: "stands_for_reschedule",
      reason: "Game canceled after start — pick stands for rescheduled game.",
      requires_recalculation: false,
      affects_elimination: false,
    };
  }

  return {
    action: config.canceled_post_start === "void" ? "void_pick" : "score_as_loss",
    reason: `Game canceled after start — ${config.canceled_post_start} applied.`,
    requires_recalculation: true,
    affects_elimination: config.canceled_post_start === "loss",
  };
}

// ─── Postponed Game Handling ────────────────────────────────────

export function handlePostponedGame(
  config: PoolRuleConfig,
  template: string,
): EdgeCaseResult {
  if (config.postponed_handling === "carry") {
    return {
      action: "stands_for_reschedule",
      reason: "Postponed game — pick carries to rescheduled date.",
      requires_recalculation: false,
      affects_elimination: false,
    };
  }
  if (config.postponed_handling === "allow_repick") {
    return {
      action: "allow_repick",
      reason: "Postponed game — repick allowed.",
      requires_recalculation: true,
      affects_elimination: false,
    };
  }
  return {
    action: "void_pick",
    reason: "Postponed game — pick voided.",
    requires_recalculation: true,
    affects_elimination: false,
  };
}

// ─── Tie / Push Handling ────────────────────────────────────────

export function handleTie(
  config: PoolRuleConfig,
  template: string,
): EdgeCaseResult {
  const handling = config.tie_handling;

  if (handling === "loss") {
    const isSurvivor = template === "survivor" || template === "last_man_standing";
    return {
      action: isSurvivor ? "eliminate" : "score_as_loss",
      reason: "Tie counts as a loss.",
      requires_recalculation: false,
      affects_elimination: isSurvivor,
    };
  }
  if (handling === "win") {
    return {
      action: template === "survivor" || template === "last_man_standing" ? "safe" : "score_as_win",
      reason: "Tie counts as a win.",
      requires_recalculation: false,
      affects_elimination: false,
    };
  }
  return {
    action: "score_zero",
    reason: "Tie results in 0 points (no action).",
    requires_recalculation: false,
    affects_elimination: false,
  };
}

export function handlePush(config: PoolRuleConfig): EdgeCaseResult {
  if (config.push_handling === "win") {
    return { action: "score_as_win", reason: "Push counts as a win.", requires_recalculation: false, affects_elimination: false };
  }
  if (config.push_handling === "loss") {
    return { action: "score_as_loss", reason: "Push counts as a loss.", requires_recalculation: false, affects_elimination: true };
  }
  return { action: "score_zero", reason: "Push = 0 points.", requires_recalculation: false, affects_elimination: false };
}

// ─── Missed Pick Handling ───────────────────────────────────────

export function handleMissedPick(
  config: PoolRuleConfig,
  template: string,
): EdgeCaseResult {
  const behavior = config.missed_pick_behavior;

  switch (behavior) {
    case "loss":
      return {
        action: template === "survivor" || template === "last_man_standing" ? "eliminate" : "score_as_loss",
        reason: "Missed pick treated as loss.",
        requires_recalculation: false,
        affects_elimination: template === "survivor" || template === "last_man_standing",
      };
    case "streak_reset":
      return {
        action: "streak_reset",
        reason: "Missed pick resets streak to 0.",
        requires_recalculation: false,
        affects_elimination: false,
      };
    case "auto_pick_favorite":
      return {
        action: "auto_pick_favorite",
        reason: "Missed pick — auto-picking the favorite.",
        requires_recalculation: true,
        affects_elimination: false,
      };
    case "auto_pick_random":
      return {
        action: "auto_pick_random",
        reason: "Missed pick — auto-picking randomly.",
        requires_recalculation: true,
        affects_elimination: false,
      };
    case "allow_late":
      return {
        action: "allow",
        reason: "Late picks are allowed.",
        requires_recalculation: false,
        affects_elimination: false,
      };
    case "zero":
    default:
      return {
        action: "score_zero",
        reason: "Missed pick = 0 points.",
        requires_recalculation: false,
        affects_elimination: false,
      };
  }
}

// ─── Stat Correction Handling ───────────────────────────────────

export interface StatCorrectionInput {
  event_id: string;
  old_winner: string;
  new_winner: string;
  old_home_score: number;
  new_home_score: number;
  old_away_score: number;
  new_away_score: number;
}

export interface StatCorrectionResult {
  recalculation_required: boolean;
  affected_picks: string[];
  winner_changed: boolean;
  score_changed: boolean;
  reason: string;
}

export function evaluateStatCorrection(input: StatCorrectionInput): StatCorrectionResult {
  const winnerChanged = input.old_winner !== input.new_winner;
  const scoreChanged = input.old_home_score !== input.new_home_score || input.old_away_score !== input.new_away_score;

  return {
    recalculation_required: winnerChanged || scoreChanged,
    affected_picks: [],
    winner_changed: winnerChanged,
    score_changed: scoreChanged,
    reason: winnerChanged
      ? `Winner changed from ${input.old_winner} to ${input.new_winner}. Full recalculation required.`
      : scoreChanged
        ? `Score updated. Tiebreaker recalculation may be needed.`
        : "No material change.",
  };
}

// ─── Mass Elimination (Survivor) ────────────────────────────────

export interface MassEliminationInput {
  total_entries: number;
  entries_to_eliminate: number;
  remaining_after: number;
}

export type MassEliminationAction = "eliminate_all" | "eliminate_partial" | "extend_week" | "split_pot";

export interface MassEliminationResult {
  action: MassEliminationAction;
  reason: string;
  requires_admin_review: boolean;
}

export function evaluateMassElimination(input: MassEliminationInput): MassEliminationResult {
  if (input.remaining_after === 0) {
    return {
      action: "split_pot",
      reason: `All ${input.total_entries} remaining entries eliminated in same week. Prize pool split equally among eliminated entries.`,
      requires_admin_review: true,
    };
  }

  if (input.remaining_after === 1) {
    return {
      action: "eliminate_partial",
      reason: `${input.entries_to_eliminate} entries eliminated. 1 entry survives — pool winner declared.`,
      requires_admin_review: false,
    };
  }

  const eliminationRatio = input.entries_to_eliminate / input.total_entries;
  if (eliminationRatio > 0.8) {
    return {
      action: "eliminate_partial",
      reason: `${input.entries_to_eliminate} of ${input.total_entries} entries eliminated (${Math.round(eliminationRatio * 100)}%). ${input.remaining_after} remain. Commissioner may want to review.`,
      requires_admin_review: true,
    };
  }

  return {
    action: "eliminate_partial",
    reason: `${input.entries_to_eliminate} entries eliminated. ${input.remaining_after} entries remain.`,
    requires_admin_review: false,
  };
}

// ─── Partial Lock Handling ──────────────────────────────────────

export interface PartialLockInput {
  events: { event_id: string; started: boolean; locked: boolean }[];
}

export interface PartialLockResult {
  locked_event_ids: string[];
  open_event_ids: string[];
  all_locked: boolean;
  message: string;
}

export function evaluatePartialLock(
  input: PartialLockInput,
  config: PoolRuleConfig,
): PartialLockResult {
  if (config.pick_lock_time === "first_game") {
    const anyStarted = input.events.some((e) => e.started);
    if (anyStarted) {
      return {
        locked_event_ids: input.events.map((e) => e.event_id),
        open_event_ids: [],
        all_locked: true,
        message: "All picks locked — first game has started.",
      };
    }
    return {
      locked_event_ids: [],
      open_event_ids: input.events.map((e) => e.event_id),
      all_locked: false,
      message: "All picks open — no games started yet.",
    };
  }

  const locked = input.events.filter((e) => e.started || e.locked).map((e) => e.event_id);
  const open = input.events.filter((e) => !e.started && !e.locked).map((e) => e.event_id);

  return {
    locked_event_ids: locked,
    open_event_ids: open,
    all_locked: open.length === 0,
    message: open.length === 0
      ? "All picks locked."
      : `${locked.length} game(s) locked, ${open.length} still open.`,
  };
}

// ─── Safe Recalculation ─────────────────────────────────────────

export interface RecalculationRequest {
  league_id: number;
  period_id?: string;
  trigger: "stat_correction" | "canceled_game" | "postponed_game" | "admin_override" | "payout_tie";
  dry_run: boolean;
}

export interface RecalculationPlan {
  steps: string[];
  affected_entries: number;
  estimated_picks: number;
  requires_payout_recalc: boolean;
  warnings: string[];
}

export function buildRecalculationPlan(request: RecalculationRequest): RecalculationPlan {
  const steps: string[] = [];
  const warnings: string[] = [];

  steps.push("1. Snapshot current standings (backup).");
  steps.push("2. Re-grade all picks for affected period(s).");
  steps.push("3. Recalculate entry stats (points, streaks, win%).");
  steps.push("4. Recalculate weekly stats and ranks.");
  steps.push("5. Update leaderboard positions and rank deltas.");

  if (request.trigger === "stat_correction") {
    steps.push("6. Evaluate survivor/elimination status changes.");
    warnings.push("Stat corrections may reverse eliminations — review manually.");
  }

  if (request.trigger === "canceled_game") {
    steps.push("6. Apply canceled game policy to affected picks.");
    steps.push("7. Check for repick eligibility.");
  }

  const requiresPayout = request.trigger === "stat_correction" || request.trigger === "payout_tie";
  if (requiresPayout) {
    steps.push(`${steps.length + 1}. Recalculate payout distribution.`);
  }

  if (request.dry_run) {
    warnings.push("DRY RUN — no changes will be persisted.");
  }

  return {
    steps,
    affected_entries: 0,
    estimated_picks: 0,
    requires_payout_recalc: requiresPayout,
    warnings,
  };
}
