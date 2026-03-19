import type { PoolTemplateKey } from "./poolTypeCatalog";

export type BaseRuleEngineKey =
  | "pickem"
  | "survivor"
  | "confidence"
  | "squares"
  | "bracket"
  | "prop"
  | "streak"
  | "stat";

export interface RuleItem {
  key: string;
  text: string;
}

export interface PoolRulesPayload {
  system_rules: RuleItem[];
  commissioner_rules: RuleItem[];
  dynamic_rules: RuleItem[];
}

export interface PoolRuleUiPayload {
  overlay_rules: string[];
  full_rules: string[];
  inline_messages: string[];
}

export interface PoolRuleEngineOutput {
  engine: BaseRuleEngineKey;
  mode: string;
  pool_rules: PoolRulesPayload;
  ui: PoolRuleUiPayload;
}

export interface RuleUserState {
  currentPeriod?: string;
  picksSubmittedCount?: number;
  eligibleEventsCount?: number;
  missedPicksCount?: number;
  duplicatePickCount?: number;
  invalidSelectionCount?: number;
  canceledGamesCount?: number;
  postponedGamesCount?: number;
  tiedGamesCount?: number;
  lateEntry?: boolean;
  isEliminated?: boolean;
  livesRemaining?: number;
  totalLives?: number;
  usedSelections?: string[];
  maxStreak?: number;
  currentStreak?: number;
}

export interface RuleEngineInput {
  template: PoolTemplateKey | null;
  scheduleType: string[];
  settings: Record<string, unknown>;
  userState: RuleUserState;
}

export interface PickSubmissionShape {
  event_id: number | string;
  pick_value: string;
  confidence_rank?: number | null;
}

export function validateRuleEngineSubmission(args: {
  picks: PickSubmissionShape[];
  eligibleEventIds?: Set<string>;
  restrictDuplicateTeam?: boolean;
  requireConfidenceUniqueness?: boolean;
}): string[] {
  const errors: string[] = [];
  const eventIdSet = new Set<string>();
  const selectionSet = new Set<string>();
  const confidenceSet = new Set<number>();

  for (const pick of args.picks) {
    const eventId = String(pick.event_id);
    const selection = String(pick.pick_value || "").trim().toLowerCase();
    if (!eventId || !selection) {
      errors.push("Each pick must include event_id and pick_value.");
      continue;
    }
    if (eventIdSet.has(eventId)) {
      errors.push(`Duplicate event selection: ${eventId}.`);
    }
    eventIdSet.add(eventId);

    if (args.eligibleEventIds && args.eligibleEventIds.size > 0 && !args.eligibleEventIds.has(eventId)) {
      errors.push(`Event ${eventId} is not eligible for this pool period.`);
    }

    if (args.restrictDuplicateTeam && selectionSet.has(selection)) {
      errors.push(`Duplicate team selection is not allowed: ${pick.pick_value}.`);
    }
    selectionSet.add(selection);

    if (args.requireConfidenceUniqueness && Number.isFinite(Number(pick.confidence_rank))) {
      const rank = Number(pick.confidence_rank);
      if (confidenceSet.has(rank)) {
        errors.push(`Confidence rank ${rank} is duplicated.`);
      }
      confidenceSet.add(rank);
    }
  }

  return errors;
}

export function scorePickFromRuleEngine(args: {
  template: PoolTemplateKey | null;
  isCorrect: boolean;
  confidenceRank?: number | null;
  settings?: Record<string, unknown>;
  wasTie?: boolean;
  wasCanceled?: boolean;
  wasPostponed?: boolean;
}): number {
  const settings = args.settings || {};
  if (args.wasCanceled || args.wasPostponed) return 0;
  if (!args.isCorrect) return 0;
  if (args.wasTie) {
    const tieHandling = String(settings.tieHandling || settings.tie_handling || "push").toLowerCase();
    if (tieHandling === "loss" || tieHandling === "zero") return 0;
  }

  const pointsPerWin = asNumber(settings.pointsPerWin ?? settings.points_per_win, 1);
  const engine = toBaseEngine(args.template);
  if (engine === "confidence") {
    const rank = Number(args.confidenceRank || 0);
    return Number.isFinite(rank) && rank > 0 ? rank : 0;
  }
  return pointsPerWin;
}

function toBaseEngine(template: PoolTemplateKey | null): BaseRuleEngineKey {
  switch (template) {
    case "pickem":
    case "ats_pickem":
    case "upset_underdog":
      return "pickem";
    case "survivor":
    case "last_man_standing":
      return "survivor";
    case "confidence":
    case "ats_confidence":
      return "confidence";
    case "squares":
      return "squares";
    case "bracket":
      return "bracket";
    case "prop":
      return "prop";
    case "streak":
      return "streak";
    case "stat_performance":
    case "bundle_pool":
    default:
      return "stat";
  }
}

function pickMode(scheduleType: string[], fallback: string): string {
  if (scheduleType.includes("tournament")) return "tournament";
  if (scheduleType.includes("daily")) return "daily";
  if (scheduleType.includes("season_long")) return "season";
  if (scheduleType.includes("weekly")) return "weekly";
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") return value === 1;
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtPlural(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function buildEdgeCaseRules(settings: Record<string, unknown>): RuleItem[] {
  const tieHandling = String(settings.tieHandling || settings.tie_handling || "push").toLowerCase();
  const canceledHandling = String(settings.canceledGameHandling || settings.canceled_game_handling || "void").toLowerCase();
  const postponedHandling = String(settings.postponedGameHandling || settings.postponed_game_handling || "carry").toLowerCase();
  const missedHandling = String(settings.missedPickBehavior || settings.missed_pick_behavior || "zero").toLowerCase();
  const lateEntryAllowed = asBoolean(settings.allowLateJoins ?? settings.allow_late_joins, false);

  return [
    { key: "edge_ties", text: `Ties are scored using '${tieHandling}' handling.` },
    { key: "edge_canceled", text: `Canceled games use '${canceledHandling}' handling.` },
    { key: "edge_postponed", text: `Postponed games use '${postponedHandling}' handling.` },
    { key: "edge_missed", text: `Missed picks use '${missedHandling}' handling.` },
    { key: "edge_late_entries", text: lateEntryAllowed ? "Late entries are allowed (commissioner rules apply)." : "Late entries are not allowed." },
  ];
}

function buildPickemRules(input: RuleEngineInput): PoolRulesPayload {
  const picksPerPeriod = asNumber(input.settings.picksPerPeriod ?? input.settings.numberOfPicks, 1);
  const pointsPerWin = asNumber(input.settings.pointsPerWin ?? input.settings.points_per_win, 1);
  const bonusEnabled = asBoolean(input.settings.enableBonusRules ?? input.settings.bonus_rules, false);
  const mode = pickMode(input.scheduleType, "weekly");

  const system_rules: RuleItem[] = [
    { key: "pickem_pick_count", text: `Pick ${fmtPlural(picksPerPeriod, "game", "games")} per ${mode} period.` },
    { key: "pickem_scoring", text: `Correct pick scoring: ${pointsPerWin} point${pointsPerWin === 1 ? "" : "s"} per correct selection.` },
    { key: "pickem_missed", text: "Missed picks are scored according to commissioner missed-pick behavior." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "pickem_tie", text: `Tie handling is set to '${String(input.settings.tieHandling || input.settings.tie_handling || "push")}'.` },
    { key: "pickem_bonus", text: bonusEnabled ? "Bonus scoring is enabled." : "Bonus scoring is disabled." },
    { key: "pickem_duplicate", text: "Duplicate picks in a restricted period are rejected." },
  ];
  const dynamic_rules: RuleItem[] = [];
  if ((input.userState.missedPicksCount || 0) > 0) {
    dynamic_rules.push({ key: "pickem_dynamic_missed", text: `You currently have ${input.userState.missedPicksCount} missed pick${(input.userState.missedPicksCount || 0) === 1 ? "" : "s"} this period.` });
  }
  if ((input.userState.duplicatePickCount || 0) > 0) {
    dynamic_rules.push({ key: "pickem_dynamic_duplicate", text: `${input.userState.duplicatePickCount} duplicate selection${(input.userState.duplicatePickCount || 0) === 1 ? "" : "s"} need correction.` });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildSurvivorRules(input: RuleEngineInput): PoolRulesPayload {
  const lives = asNumber(input.settings.survivorLives ?? input.settings.lives, 1);
  const reuseAllowed = asBoolean(input.settings.allowTeamReuse ?? input.settings.reuse, false);
  const buybackStart = asNumber(input.settings.buybackStartWeek ?? input.settings.buyback_start_week, 0);
  const buybackEnd = asNumber(input.settings.buybackEndWeek ?? input.settings.buyback_end_week, 0);
  const mode = pickMode(input.scheduleType, "weekly");

  const system_rules: RuleItem[] = [
    { key: "survivor_pick_count", text: `Pick 1 team per ${mode} period.` },
    { key: "survivor_elimination", text: "Win = advance, loss = life lost / elimination based on lives remaining." },
    { key: "survivor_reuse", text: reuseAllowed ? "Team reuse is allowed." : "A previously used team cannot be selected again." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "survivor_lives", text: `Total lives: ${lives}.` },
    { key: "survivor_buyback", text: buybackStart > 0 && buybackEnd >= buybackStart ? `Buyback window: weeks ${buybackStart}-${buybackEnd}.` : "Buyback is disabled." },
    { key: "survivor_tie", text: `Tie behavior is '${String(input.settings.tieHandling || input.settings.tie_handling || "loss")}'.` },
  ];
  const dynamic_rules: RuleItem[] = [];
  if (typeof input.userState.livesRemaining === "number") {
    dynamic_rules.push({
      key: "survivor_dynamic_lives",
      text: `You have ${fmtPlural(input.userState.livesRemaining, "life", "lives")} remaining.`,
    });
  }
  if (input.userState.isEliminated) {
    dynamic_rules.push({ key: "survivor_dynamic_eliminated", text: "You are currently eliminated from this pool." });
  }
  if (!reuseAllowed && (input.userState.usedSelections || []).length > 0) {
    dynamic_rules.push({
      key: "survivor_dynamic_reuse_block",
      text: `You cannot reuse ${input.userState.usedSelections!.length} previously selected team${input.userState.usedSelections!.length === 1 ? "" : "s"}.`,
    });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildConfidenceRules(input: RuleEngineInput): PoolRulesPayload {
  const perfectWeekBonus = asNumber(input.settings.perfectWeekBonus ?? input.settings.perfect_week_bonus, 0);
  const multiplierEnabled = asBoolean(input.settings.enableMultiplier ?? input.settings.enable_multiplier, true);
  const system_rules: RuleItem[] = [
    { key: "confidence_rank", text: "Assign a unique confidence rank to each pick." },
    { key: "confidence_score", text: "Correct picks score their confidence value." },
    { key: "confidence_unique", text: "Duplicate confidence ranks are invalid." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "confidence_multiplier", text: multiplierEnabled ? "Confidence multiplier logic is enabled." : "Confidence multiplier logic is disabled." },
    { key: "confidence_perfect_bonus", text: perfectWeekBonus > 0 ? `Perfect week bonus: ${perfectWeekBonus} points.` : "Perfect week bonus is disabled." },
    { key: "confidence_ties", text: `Tie handling is '${String(input.settings.tieHandling || "push")}'.` },
  ];
  const dynamic_rules: RuleItem[] = [];
  if ((input.userState.invalidSelectionCount || 0) > 0) {
    dynamic_rules.push({ key: "confidence_invalid", text: `You have ${input.userState.invalidSelectionCount} invalid confidence assignment${(input.userState.invalidSelectionCount || 0) === 1 ? "" : "s"}.` });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildSquaresRules(input: RuleEngineInput): PoolRulesPayload {
  const mode = pickMode(input.scheduleType, "single_game");
  const perUserCap = asNumber(input.settings.maxSquaresPerUser ?? input.settings.max_squares_per_user, 0);
  const system_rules: RuleItem[] = [
    { key: "squares_grid", text: "Squares are mapped on a 10x10 score grid." },
    { key: "squares_numbers", text: "Row/column numbers are assigned after lock based on commissioner settings." },
    { key: "squares_payout", text: "Payout triggers when live/final score digits match a claimed square." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "squares_mode", text: `Squares mode is '${mode}'.` },
    { key: "squares_cap", text: perUserCap > 0 ? `Per-user square cap: ${perUserCap}.` : "Per-user square cap is not enforced." },
    { key: "squares_tournament_loop", text: mode === "tournament" ? "Tournament loop mode is enabled." : "Tournament loop mode is disabled." },
  ];
  const dynamic_rules: RuleItem[] = [];
  if ((input.userState.canceledGamesCount || 0) > 0) {
    dynamic_rules.push({ key: "squares_canceled", text: `${input.userState.canceledGamesCount} game${(input.userState.canceledGamesCount || 0) === 1 ? " has" : "s have"} cancellation handling applied.` });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildBracketRules(input: RuleEngineInput): PoolRulesPayload {
  const pointsMode = String(input.settings.roundWeightingMode || input.settings.round_weighting_mode || "escalating");
  const eliminationMode = asBoolean(input.settings.trackElimination ?? input.settings.track_elimination, true);
  const system_rules: RuleItem[] = [
    { key: "bracket_progression", text: "Bracket picks advance by round progression." },
    { key: "bracket_scaling", text: "Round points scale by stage based on the configured weighting mode." },
    { key: "bracket_scoring", text: "Only completed round outcomes are scored." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "bracket_weighting", text: `Round weighting mode: '${pointsMode}'.` },
    { key: "bracket_elimination", text: eliminationMode ? "Elimination tracking is enabled." : "Elimination tracking is disabled." },
    { key: "bracket_ties", text: `Tournament tie rule: '${String(input.settings.tieHandling || "championship_tiebreaker")}'.` },
  ];
  const dynamic_rules: RuleItem[] = [];
  if (input.userState.isEliminated) {
    dynamic_rules.push({ key: "bracket_eliminated", text: "Your bracket can no longer produce a winning path." });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildPropRules(input: RuleEngineInput): PoolRulesPayload {
  const allowPartial = asBoolean(input.settings.allowPartialSubmissions ?? input.settings.allow_partial_submissions, true);
  const system_rules: RuleItem[] = [
    { key: "prop_validation", text: "Each prop answer is validated against allowed answer choices." },
    { key: "prop_scoring", text: "Scoring is applied per question after result finalization." },
    { key: "prop_partial", text: allowPartial ? "Partial submissions are accepted and scored on answered questions." : "Partial submissions are not allowed." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "prop_per_question", text: `Base points per question: ${asNumber(input.settings.pointsPerQuestion ?? input.settings.points_per_question, 1)}.` },
    { key: "prop_late", text: `Late submission handling: '${String(input.settings.lateSubmissionBehavior || "blocked")}'.` },
    { key: "prop_ties", text: `Tie handling: '${String(input.settings.tieHandling || "push")}'.` },
  ];
  const dynamic_rules: RuleItem[] = [];
  if ((input.userState.missedPicksCount || 0) > 0) {
    dynamic_rules.push({ key: "prop_missing", text: `${input.userState.missedPicksCount} prop question${(input.userState.missedPicksCount || 0) === 1 ? "" : "s"} remain unanswered.` });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildStreakRules(input: RuleEngineInput): PoolRulesPayload {
  const resetOnLoss = asBoolean(input.settings.resetOnLoss ?? input.settings.reset_on_loss, true);
  const system_rules: RuleItem[] = [
    { key: "streak_increment", text: "Correct picks increment your streak by 1." },
    { key: "streak_reset", text: resetOnLoss ? "An incorrect pick resets your current streak." : "Incorrect picks do not reset your current streak." },
    { key: "streak_max", text: "Maximum streak is tracked for standings and tiebreakers." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "streak_mode", text: `Streak mode: '${pickMode(input.scheduleType, "weekly")}'.` },
    { key: "streak_scoring", text: `Streak scoring multiplier: ${asNumber(input.settings.streakMultiplier ?? input.settings.streak_multiplier, 1)}x.` },
    { key: "streak_missed", text: `Missed pick behavior: '${String(input.settings.missedPickBehavior || "reset")}'.` },
  ];
  const dynamic_rules: RuleItem[] = [];
  if (typeof input.userState.currentStreak === "number") {
    dynamic_rules.push({ key: "streak_current", text: `Current streak: ${input.userState.currentStreak}.` });
  }
  if (typeof input.userState.maxStreak === "number") {
    dynamic_rules.push({ key: "streak_max_dynamic", text: `Best streak so far: ${input.userState.maxStreak}.` });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildStatRules(input: RuleEngineInput): PoolRulesPayload {
  const system_rules: RuleItem[] = [
    { key: "stat_tracking", text: "Tracked stats are aggregated per player/team and period." },
    { key: "stat_scoring", text: "Standings are scored from configured stat formula weights." },
    { key: "stat_updates", text: "Live/final stat corrections automatically reflow standings." },
  ];
  const commissioner_rules: RuleItem[] = [
    { key: "stat_scope", text: `Stat scope: '${String(input.settings.statScope || input.settings.stat_scope || "player")}'.` },
    { key: "stat_formula", text: `Scoring formula mode: '${String(input.settings.scoringFormula || input.settings.scoring_formula || "sum")}'.` },
    { key: "stat_ties", text: `Tie handling: '${String(input.settings.tieHandling || "shared_place")}'.` },
  ];
  const dynamic_rules: RuleItem[] = [];
  if ((input.userState.invalidSelectionCount || 0) > 0) {
    dynamic_rules.push({ key: "stat_invalid", text: `${input.userState.invalidSelectionCount} selection${(input.userState.invalidSelectionCount || 0) === 1 ? "" : "s"} are invalid for this scoring period.` });
  }
  return { system_rules, commissioner_rules, dynamic_rules };
}

function buildRuleSet(input: RuleEngineInput, engine: BaseRuleEngineKey): PoolRulesPayload {
  switch (engine) {
    case "pickem":
      return buildPickemRules(input);
    case "survivor":
      return buildSurvivorRules(input);
    case "confidence":
      return buildConfidenceRules(input);
    case "squares":
      return buildSquaresRules(input);
    case "bracket":
      return buildBracketRules(input);
    case "prop":
      return buildPropRules(input);
    case "streak":
      return buildStreakRules(input);
    case "stat":
    default:
      return buildStatRules(input);
  }
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function generatePoolRuleEngineOutput(input: RuleEngineInput): PoolRuleEngineOutput {
  const engine = toBaseEngine(input.template);
  const mode = pickMode(input.scheduleType, "weekly");
  const engineRules = buildRuleSet(input, engine);
  const edgeCaseRules = buildEdgeCaseRules(input.settings);
  const system_rules = dedupe([...engineRules.system_rules.map((r) => r.text), ...edgeCaseRules.map((r) => r.text)]).map((text, idx) => ({
    key: `system_${idx + 1}`,
    text,
  }));
  const commissioner_rules = dedupe(engineRules.commissioner_rules.map((r) => r.text)).map((text, idx) => ({
    key: `commissioner_${idx + 1}`,
    text,
  }));
  const dynamic_rules = dedupe(engineRules.dynamic_rules.map((r) => r.text)).map((text, idx) => ({
    key: `dynamic_${idx + 1}`,
    text,
  }));

  const overlay_rules = dedupe([
    system_rules[0]?.text || "",
    commissioner_rules[0]?.text || "",
    dynamic_rules[0]?.text || "",
  ]).slice(0, 3);
  const full_rules = [...system_rules, ...commissioner_rules, ...dynamic_rules].map((item) => item.text);
  const inline_messages = dedupe([
    dynamic_rules[0]?.text || "",
    (input.userState.invalidSelectionCount || 0) > 0
      ? "Some selections are invalid and must be fixed before lock."
      : "",
    (input.userState.missedPicksCount || 0) > 0
      ? "You still have unsubmitted picks for this period."
      : "",
    input.userState.lateEntry ? "Late-entry rules are active for your account." : "",
  ]).slice(0, 4);

  return {
    engine,
    mode,
    pool_rules: {
      system_rules,
      commissioner_rules,
      dynamic_rules,
    },
    ui: {
      overlay_rules,
      full_rules,
      inline_messages,
    },
  };
}
