/**
 * QA Hardening Tests — Pool Rule Config + Edge Case + Payout + Scoring Engine
 *
 * Run: npx tsx scripts/qa-hardening-tests.ts
 *
 * Covers:
 * - PoolRuleConfig: defaults, family overrides, admin overrides, validation, serialization
 * - EdgeCaseEngine: ties, pushes, canceled, postponed, missed picks, partial locks, mass elimination, stat corrections
 * - PayoutEngine: equal splits, percentage, tie handling, hybrid, Calcutta, validation
 * - ScoringEngine: pick grading across all templates, period grading, missed pick enforcement
 * - Matrix QA across all pool families
 */

import {
  buildPoolRuleConfig,
  validatePoolRuleConfig,
  serializePoolRuleConfig,
  deserializePoolRuleConfig,
  getAdminSettingsFields,
  type PoolRuleConfig,
} from "../src/shared/poolRuleConfig";

import {
  validatePick,
  handleCanceledGame,
  handlePostponedGame,
  handleTie,
  handlePush,
  handleMissedPick,
  evaluateStatCorrection,
  evaluateMassElimination,
  evaluatePartialLock,
  buildRecalculationPlan,
  type PickValidationInput,
  type PickValidationContext,
} from "../src/shared/edgeCaseEngine";

import {
  calculatePayouts,
  calculateHybridPayouts,
  validatePayoutConfig,
  buildPayoutLedger,
  calculateCalcuttaPayouts,
  type StandingsEntry,
  type PayoutConfig,
} from "../src/shared/payoutEngine";

import { scorePickFromRuleEngine } from "../src/shared/poolRuleEngine";

// ─── Test Harness ───────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function section(name: string): void {
  console.log(`\n━━━ ${name} ━━━`);
}

// ═══════════════════════════════════════════════════════════════
// POOL RULE CONFIG TESTS
// ═══════════════════════════════════════════════════════════════

section("PoolRuleConfig — Defaults");

const pickemConfig = buildPoolRuleConfig("pickem");
assert(pickemConfig.tie_handling === "loss", "pickem tie default = loss");
assert(pickemConfig.missed_pick_behavior === "zero", "pickem missed pick default = zero");
assert(pickemConfig.scoring.points_per_win === 1, "pickem points_per_win default = 1");
assert(pickemConfig.allow_late_joins === false, "pickem late joins default = false");

const atsConfig = buildPoolRuleConfig("ats_pickem");
assert(atsConfig.push_handling === "no_action", "ATS push default = no_action");
assert(atsConfig.scoring.type === "ats", "ATS scoring type = ats");
assert(atsConfig.scoring.push_value === 0, "ATS push value = 0");

const survivorConfig = buildPoolRuleConfig("survivor");
assert(survivorConfig.tie_handling === "loss", "survivor tie default = loss");
assert(survivorConfig.missed_pick_behavior === "loss", "survivor missed pick = loss");
assert(survivorConfig.canceled_survivor_never_eliminates === true, "survivor canceled never eliminates");
assert(survivorConfig.picks_per_period === 1, "survivor picks per period = 1");
assert(survivorConfig.survivor.lives === 1, "survivor default lives = 1");
assert(survivorConfig.survivor.allow_team_reuse === false, "survivor no team reuse");

const streakConfig = buildPoolRuleConfig("streak");
assert(streakConfig.tie_handling === "loss", "streak tie = loss");
assert(streakConfig.missed_pick_behavior === "streak_reset", "streak missed = reset");

const confidenceConfig = buildPoolRuleConfig("confidence");
assert(confidenceConfig.tie_handling === "no_action", "confidence tie = no_action");
assert(confidenceConfig.scoring.confidence_multiplier === true, "confidence multiplier enabled");

const bundleConfig = buildPoolRuleConfig("bundle_pool");
assert(bundleConfig.bundle !== undefined, "bundle config has bundle section");
assert(bundleConfig.bundle!.aggregation === "sum", "bundle aggregation = sum");
assert(bundleConfig.bundle!.overall_leaderboard === true, "bundle overall leaderboard = true");

section("PoolRuleConfig — Admin Overrides");

const overridden = buildPoolRuleConfig("pickem", {
  tie_handling: "win",
  scoring: { points_per_win: 3, upset_bonus: 2 },
  entry: { mode: "optional", max_entries_per_user: 5 },
  allow_late_joins: true,
  drop_worst_periods: 2,
});
assert(overridden.tie_handling === "win", "override tie = win");
assert(overridden.scoring.points_per_win === 3, "override points = 3");
assert(overridden.scoring.upset_bonus === 2, "override upset bonus = 2");
assert(overridden.entry.mode === "optional", "override entry mode = optional");
assert(overridden.entry.max_entries_per_user === 5, "override max entries = 5");
assert(overridden.allow_late_joins === true, "override late joins = true");
assert(overridden.drop_worst_periods === 2, "override drop worst = 2");

const legacyOverride = buildPoolRuleConfig("survivor", {
  tieHandling: "win",
  survivorLives: 3,
  allowTeamReuse: true,
  missedPickBehavior: "auto_pick_favorite",
  pointsPerWin: 5,
});
assert(legacyOverride.tie_handling === "win", "legacy tieHandling → tie_handling");
assert(legacyOverride.survivor.lives === 3, "legacy survivorLives → survivor.lives");
assert(legacyOverride.survivor.allow_team_reuse === true, "legacy allowTeamReuse");
assert(legacyOverride.missed_pick_behavior === "auto_pick_favorite", "legacy missedPickBehavior");

section("PoolRuleConfig — Validation");

const validConfig = buildPoolRuleConfig("pickem");
assert(validatePoolRuleConfig(validConfig).length === 0, "valid config passes");

const invalidEntry = buildPoolRuleConfig("pickem", { entry: { mode: "required", required_entries: 1 } });
const entryErrors = validatePoolRuleConfig(invalidEntry);
assert(entryErrors.length > 0, "required entry with < 2 entries fails validation");

section("PoolRuleConfig — Serialization Round-trip");

const serialized = serializePoolRuleConfig(pickemConfig);
const deserialized = deserializePoolRuleConfig("pickem", serialized);
assert(deserialized.tie_handling === pickemConfig.tie_handling, "round-trip tie_handling");
assert(deserialized.scoring.points_per_win === pickemConfig.scoring.points_per_win, "round-trip points_per_win");

const fromNull = deserializePoolRuleConfig("survivor", null);
assert(fromNull.tie_handling === "loss", "null rules_json falls back to defaults");

section("PoolRuleConfig — Admin Settings Fields");

const pickemFields = getAdminSettingsFields("pickem");
assert(pickemFields.length > 10, "pickem has > 10 admin fields");
const groups = new Set(pickemFields.map((f) => f.group));
assert(groups.has("structure"), "has structure group");
assert(groups.has("rules"), "has rules group");
assert(groups.has("scoring"), "has scoring group");
assert(groups.has("visibility"), "has visibility group");

const survivorFields = getAdminSettingsFields("survivor");
assert(survivorFields.some((f) => f.key === "survivor.lives"), "survivor has lives field");
assert(survivorFields.some((f) => f.key === "survivor.elimination_mode"), "survivor has elimination_mode");

// ═══════════════════════════════════════════════════════════════
// EDGE CASE ENGINE TESTS
// ═══════════════════════════════════════════════════════════════

section("EdgeCase — Tie Handling");

const pickemTie = handleTie(pickemConfig, "pickem");
assert(pickemTie.action === "score_as_loss", "pickem tie → loss");
assert(pickemTie.affects_elimination === false, "pickem tie not elimination");

const survivorTie = handleTie(survivorConfig, "survivor");
assert(survivorTie.action === "eliminate", "survivor tie → eliminate");
assert(survivorTie.affects_elimination === true, "survivor tie affects elimination");

const confTie = handleTie(confidenceConfig, "confidence");
assert(confTie.action === "score_zero", "confidence tie → 0 points");

const winTie = handleTie(buildPoolRuleConfig("pickem", { tie_handling: "win" }), "pickem");
assert(winTie.action === "score_as_win", "override tie=win → score_as_win");

section("EdgeCase — Push Handling");

const atsPush = handlePush(atsConfig);
assert(atsPush.action === "score_zero", "ATS push → 0");

const pushAsWin = handlePush(buildPoolRuleConfig("ats_pickem", { push_handling: "win" }));
assert(pushAsWin.action === "score_as_win", "push override to win");

section("EdgeCase — Canceled Game");

const canceledPreStart = handleCanceledGame(pickemConfig, "pickem", false, false);
assert(canceledPreStart.action === "allow_repick", "canceled pre-start → allow repick");

const canceledPostStart = handleCanceledGame(pickemConfig, "pickem", true, false);
assert(canceledPostStart.action === "stands_for_reschedule", "canceled post-start → stands");

const canceledVoid = handleCanceledGame(pickemConfig, "pickem", true, true);
assert(canceledVoid.action === "no_action", "fully voided → no_action");

const canceledSurvivor = handleCanceledGame(survivorConfig, "survivor", true, true);
assert(canceledSurvivor.action === "no_action", "survivor canceled → never eliminates");
assert(canceledSurvivor.affects_elimination === false, "survivor canceled does not eliminate");

section("EdgeCase — Postponed Game");

const postponedCarry = handlePostponedGame(pickemConfig, "pickem");
assert(postponedCarry.action === "stands_for_reschedule", "postponed default → carry");

const postponedVoid = handlePostponedGame(buildPoolRuleConfig("pickem", { postponed_handling: "void" }), "pickem");
assert(postponedVoid.action === "void_pick", "postponed void → void_pick");

section("EdgeCase — Missed Pick");

const missedPickem = handleMissedPick(pickemConfig, "pickem");
assert(missedPickem.action === "score_zero", "pickem missed → 0 pts");

const missedSurvivor = handleMissedPick(survivorConfig, "survivor");
assert(missedSurvivor.action === "eliminate", "survivor missed → eliminate");
assert(missedSurvivor.affects_elimination === true, "survivor missed affects elimination");

const missedStreak = handleMissedPick(streakConfig, "streak");
assert(missedStreak.action === "streak_reset", "streak missed → reset");

const missedAutoFav = handleMissedPick(buildPoolRuleConfig("pickem", { missed_pick_behavior: "auto_pick_favorite" }), "pickem");
assert(missedAutoFav.action === "auto_pick_favorite", "override missed → auto favorite");

section("EdgeCase — Stat Correction");

const noChange = evaluateStatCorrection({ event_id: "1", old_winner: "NYG", new_winner: "NYG", old_home_score: 24, new_home_score: 24, old_away_score: 17, new_away_score: 17 });
assert(noChange.recalculation_required === false, "no change → no recalc");

const winnerChange = evaluateStatCorrection({ event_id: "1", old_winner: "NYG", new_winner: "DAL", old_home_score: 24, new_home_score: 23, old_away_score: 17, new_away_score: 24 });
assert(winnerChange.recalculation_required === true, "winner change → recalc");
assert(winnerChange.winner_changed === true, "winner_changed flag");

section("EdgeCase — Mass Elimination");

const allEliminated = evaluateMassElimination({ total_entries: 10, entries_to_eliminate: 10, remaining_after: 0 });
assert(allEliminated.action === "split_pot", "all eliminated → split pot");
assert(allEliminated.requires_admin_review === true, "all eliminated needs review");

const oneRemains = evaluateMassElimination({ total_entries: 10, entries_to_eliminate: 9, remaining_after: 1 });
assert(oneRemains.action === "eliminate_partial", "1 remains → partial");

const normalElim = evaluateMassElimination({ total_entries: 100, entries_to_eliminate: 10, remaining_after: 90 });
assert(normalElim.requires_admin_review === false, "10% elim → no review needed");

section("EdgeCase — Partial Lock");

const partialLockGameStart = evaluatePartialLock(
  { events: [{ event_id: "1", started: true, locked: true }, { event_id: "2", started: false, locked: false }, { event_id: "3", started: false, locked: false }] },
  pickemConfig,
);
assert(partialLockGameStart.locked_event_ids.length === 1, "game_start mode: 1 locked");
assert(partialLockGameStart.open_event_ids.length === 2, "game_start mode: 2 open");

const partialLockFirstGame = evaluatePartialLock(
  { events: [{ event_id: "1", started: true, locked: true }, { event_id: "2", started: false, locked: false }] },
  buildPoolRuleConfig("pickem", { pick_lock_time: "first_game" }),
);
assert(partialLockFirstGame.all_locked === true, "first_game mode: all locked when 1 started");

section("EdgeCase — Pick Validation");

const pickCtx: PickValidationContext = {
  config: survivorConfig,
  template: "survivor",
  period_id: "week1",
  existing_picks: [],
  used_teams: ["Chiefs"],
  eligible_event_ids: new Set(["1", "2", "3"]),
  locked_event_ids: new Set(["1"]),
  started_event_ids: new Set(["1"]),
  max_confidence_rank: 16,
};

const validPick = validatePick({ event_id: "2", pick_value: "Bills" }, pickCtx);
assert(validPick.valid === true, "valid survivor pick passes");

const reusedTeam = validatePick({ event_id: "2", pick_value: "Chiefs" }, pickCtx);
assert(reusedTeam.valid === false, "reused team rejected");
assert(reusedTeam.errors.some((e) => e.includes("reuse")), "reuse error message");

const lockedPick = validatePick({ event_id: "1", pick_value: "Eagles" }, pickCtx);
assert(lockedPick.valid === false, "locked event rejected");

const invalidEvent = validatePick({ event_id: "99", pick_value: "Eagles" }, pickCtx);
assert(invalidEvent.valid === false, "invalid event rejected");

section("EdgeCase — Recalculation Plan");

const plan = buildRecalculationPlan({ league_id: 1, trigger: "stat_correction", dry_run: true });
assert(plan.steps.length >= 5, "recalc plan has >= 5 steps");
assert(plan.warnings.some((w) => w.includes("DRY RUN")), "dry run warning");

// ═══════════════════════════════════════════════════════════════
// PAYOUT ENGINE TESTS
// ═══════════════════════════════════════════════════════════════

section("Payout — Basic Distribution");

const standings: StandingsEntry[] = [
  { entry_id: 1, user_id: "u1", display_name: "Alice", rank: 1, total_points: 100, correct_picks: 10 },
  { entry_id: 2, user_id: "u2", display_name: "Bob", rank: 2, total_points: 90, correct_picks: 9 },
  { entry_id: 3, user_id: "u3", display_name: "Charlie", rank: 3, total_points: 80, correct_picks: 8 },
];

const payoutCfg: PayoutConfig = {
  total_pool_cents: 10000,
  buckets: [{
    type: "season",
    placements: [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ],
    split_mode: "percentage",
    tie_mode: "split_no_skip",
  }],
};

const dist = calculatePayouts(standings, payoutCfg);
assert(dist.line_items.length === 3, "3 line items");
assert(dist.line_items[0].amount_cents === 5000, "1st place = $50");
assert(dist.line_items[1].amount_cents === 3000, "2nd place = $30");
assert(dist.line_items[2].amount_cents === 2000, "3rd place = $20");
assert(dist.total_distributed_cents === 10000, "total = pool size");
assert(dist.remainder_cents === 0, "no remainder");

section("Payout — Tie Split (No Skip)");

const tiedStandings: StandingsEntry[] = [
  { entry_id: 1, user_id: "u1", display_name: "Alice", rank: 1, total_points: 100, correct_picks: 10 },
  { entry_id: 2, user_id: "u2", display_name: "Bob", rank: 2, total_points: 100, correct_picks: 10 },
  { entry_id: 3, user_id: "u3", display_name: "Charlie", rank: 3, total_points: 80, correct_picks: 8 },
];

const tieDist = calculatePayouts(tiedStandings, payoutCfg);
const tiedItems = tieDist.line_items.filter((i) => i.is_tie_split);
assert(tiedItems.length === 2, "2 tied items");
const firstTwoTotal = tiedItems.reduce((sum, i) => sum + i.amount_cents, 0);
assert(firstTwoTotal === 8000, "tied 1st+2nd split $80");
assert(tiedItems[0].amount_cents === 4000, "each gets $40");
const thirdPlace = tieDist.line_items.find((i) => !i.is_tie_split);
assert(thirdPlace !== undefined && thirdPlace.amount_cents === 2000, "3rd still gets $20 (no skip)");

section("Payout — Tie Split (Skip Next)");

const skipConfig: PayoutConfig = {
  total_pool_cents: 10000,
  buckets: [{
    type: "season",
    placements: [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ],
    split_mode: "percentage",
    tie_mode: "split_skip_next",
  }],
};

const skipDist = calculatePayouts(tiedStandings, skipConfig);
assert(skipDist.line_items.length >= 2, "at least 2 items for skip");

section("Payout — Validation");

const validPayoutCfg: PayoutConfig = {
  total_pool_cents: 10000,
  buckets: [{ type: "season", placements: [{ place: 1, percentage: 60 }, { place: 2, percentage: 40 }], split_mode: "percentage", tie_mode: "split_no_skip" }],
};
const payoutValidation = validatePayoutConfig(validPayoutCfg);
assert(payoutValidation.valid === true, "valid payout config passes");
assert(payoutValidation.total_percentage === 100, "total percentage = 100");

const overPayoutCfg: PayoutConfig = {
  total_pool_cents: 10000,
  buckets: [{ type: "season", placements: [{ place: 1, percentage: 60 }, { place: 2, percentage: 60 }], split_mode: "percentage", tie_mode: "split_no_skip" }],
};
const overValidation = validatePayoutConfig(overPayoutCfg);
assert(overValidation.valid === false, "120% payout fails");

section("Payout — Ledger Building");

const ledger = buildPayoutLedger(42, dist);
assert(ledger.length === 3, "3 ledger entries");
assert(ledger[0].league_id === 42, "ledger league_id");
assert(ledger[0].status === "pending", "ledger status = pending");

section("Payout — Calcutta");

const ownerships = [
  { team_id: "duke", team_name: "Duke", owners: [
    { user_id: "u1", display_name: "Alice", ownership_pct: 60, price_paid_cents: 6000 },
    { user_id: "u2", display_name: "Bob", ownership_pct: 40, price_paid_cents: 4000 },
  ]},
  { team_id: "unc", team_name: "UNC", owners: [
    { user_id: "u3", display_name: "Charlie", ownership_pct: 100, price_paid_cents: 3000 },
  ]},
];

const roundPayouts = [
  { round: "Final Four", payout_cents: 5000 },
  { round: "Elite Eight", payout_cents: 2000 },
];

const teamResults = [
  { team_id: "duke", highest_round: "Final Four" },
  { team_id: "unc", highest_round: "Elite Eight" },
];

const calcutta = calculateCalcuttaPayouts(ownerships, roundPayouts, teamResults);
assert(calcutta.team_payouts.length === 2, "2 teams paid");
assert(calcutta.total_distributed_cents === 7000, "total calcutta = $70");

const dukePayouts = calcutta.team_payouts.find((t) => t.team_id === "duke")!;
assert(dukePayouts.payout_cents === 5000, "Duke gets $50 FF payout");
const alicePayout = dukePayouts.owner_payouts.find((o) => o.user_id === "u1")!;
assert(alicePayout.amount_cents === 3000, "Alice (60%) gets $30");
const bobPayout = dukePayouts.owner_payouts.find((o) => o.user_id === "u2")!;
assert(bobPayout.amount_cents === 2000, "Bob (40%) gets $20");

section("Payout — Hybrid");

const hybrid = calculateHybridPayouts({
  weekly_standings: standings,
  season_standings: standings,
  weekly_config: { total_pool_cents: 5000, buckets: [{ type: "weekly", placements: [{ place: 1, percentage: 100 }], split_mode: "percentage", tie_mode: "split_no_skip" }] },
  season_config: payoutCfg,
});
assert(hybrid.weekly.line_items.length === 1, "1 weekly winner");
assert(hybrid.season.line_items.length === 3, "3 season payees");
assert(hybrid.combined_items.length === 4, "4 combined items");

// ═══════════════════════════════════════════════════════════════
// SCORING ENGINE (scorePickFromRuleEngine) TESTS
// ═══════════════════════════════════════════════════════════════

section("Scoring — scorePickFromRuleEngine");

assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: true }) === 1, "pickem correct = 1");
assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: false }) === 0, "pickem incorrect = 0");
assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: true, wasTie: true }) === 0, "pickem tie = 0 (loss default)");
assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: true, wasTie: true, settings: { tie_handling: "win" } }) === 1, "pickem tie=win override");
assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: true, wasCanceled: true }) === 0, "canceled = 0");
assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: true, wasPostponed: true }) === 0, "postponed = 0");
assert(scorePickFromRuleEngine({ template: "confidence", isCorrect: true, confidenceRank: 14 }) === 14, "confidence = rank");
assert(scorePickFromRuleEngine({ template: "confidence", isCorrect: true, confidenceRank: 0 }) === 0, "confidence rank 0 = 0");
assert(scorePickFromRuleEngine({ template: "ats_pickem", isCorrect: true, wasPush: true }) === 0, "ATS push = 0");
assert(scorePickFromRuleEngine({ template: "pickem", isCorrect: true, settings: { pointsPerWin: 3 } }) === 3, "override pointsPerWin");

// ═══════════════════════════════════════════════════════════════
// MATRIX QA — All Pool Families × All Edge Cases
// ═══════════════════════════════════════════════════════════════

section("Matrix QA — All Families × Edge Cases");

const families: { template: string; expectedTie: string; expectedMissed: string }[] = [
  { template: "pickem", expectedTie: "score_as_loss", expectedMissed: "score_zero" },
  { template: "ats_pickem", expectedTie: "score_as_loss", expectedMissed: "score_zero" },
  { template: "confidence", expectedTie: "score_zero", expectedMissed: "score_zero" },
  { template: "ats_confidence", expectedTie: "score_zero", expectedMissed: "score_zero" },
  { template: "survivor", expectedTie: "eliminate", expectedMissed: "eliminate" },
  { template: "last_man_standing", expectedTie: "eliminate", expectedMissed: "eliminate" },
  { template: "streak", expectedTie: "score_as_loss", expectedMissed: "streak_reset" },
  { template: "upset_underdog", expectedTie: "score_as_loss", expectedMissed: "score_zero" },
  { template: "squares", expectedTie: "score_zero", expectedMissed: "score_zero" },
  { template: "bracket", expectedTie: "score_zero", expectedMissed: "score_zero" },
  { template: "prop", expectedTie: "score_zero", expectedMissed: "score_zero" },
  { template: "stat_performance", expectedTie: "score_zero", expectedMissed: "score_zero" },
  { template: "bundle_pool", expectedTie: "score_zero", expectedMissed: "score_zero" },
];

for (const family of families) {
  const cfg = buildPoolRuleConfig(family.template);

  const tieResult = handleTie(cfg, family.template);
  assert(tieResult.action === family.expectedTie, `${family.template} tie → ${family.expectedTie}`);

  const missedResult = handleMissedPick(cfg, family.template);
  assert(missedResult.action === family.expectedMissed, `${family.template} missed → ${family.expectedMissed}`);

  const canceledResult = handleCanceledGame(cfg, family.template, false, false);
  assert(canceledResult.action === "allow_repick", `${family.template} canceled pre-start → allow_repick`);

  const voidResult = handleCanceledGame(cfg, family.template, true, true);
  if (family.template === "survivor" || family.template === "last_man_standing") {
    assert(voidResult.affects_elimination === false, `${family.template} void → no elimination`);
  } else {
    assert(voidResult.action === "no_action", `${family.template} void → no_action`);
  }

  const postponedResult = handlePostponedGame(cfg, family.template);
  assert(postponedResult.action === "stands_for_reschedule", `${family.template} postponed → carry`);
}

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length > 0) {
  console.log(`\nFailed tests:`);
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
  process.exit(1);
} else {
  console.log(`\n✓ All tests passed!`);
  process.exit(0);
}
