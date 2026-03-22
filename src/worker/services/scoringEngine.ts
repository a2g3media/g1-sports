/**
 * Scoring Engine Service
 *
 * Deterministic pick grading using the canonical PoolRuleConfig.
 * Handles all edge cases: ties, pushes, canceled, postponed, missed, stat corrections.
 */

import {
  deserializePoolRuleConfig,
  type PoolRuleConfig,
} from "../../shared/poolRuleConfig";
import {
  handleCanceledGame,
  handlePostponedGame,
  handleTie,
  handlePush,
  handleMissedPick,
  evaluateStatCorrection,
  evaluatePartialLock,
  evaluateMassElimination,
  type EdgeAction,
  type StatCorrectionInput,
} from "../../shared/edgeCaseEngine";

// ─── Types ──────────────────────────────────────────────────────

export interface PickGradeInput {
  pick_id: number;
  entry_id: number;
  user_id: string;
  event_id: number;
  pick_value: string;
  confidence_rank: number | null;
  event_status: string;
  event_started: boolean;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  winner: string | null;
  spread: number | null;
}

export interface PickGradeResult {
  pick_id: number;
  entry_id: number;
  points: number;
  result: "win" | "loss" | "push" | "void" | "pending" | "no_action";
  edge_action: EdgeAction;
  reason: string;
  affects_elimination: boolean;
}

export interface PeriodGradeResult {
  period_id: string;
  graded_picks: PickGradeResult[];
  total_points: number;
  correct_count: number;
  loss_count: number;
  push_count: number;
  void_count: number;
  missed_count: number;
  entries_to_eliminate: number[];
  warnings: string[];
}

// ─── Core Grading ───────────────────────────────────────────────

export function gradePick(
  pick: PickGradeInput,
  config: PoolRuleConfig,
  template: string,
): PickGradeResult {
  const status = (pick.event_status || "").toUpperCase();

  if (status === "SCHEDULED" || status === "NOT_STARTED") {
    return { pick_id: pick.pick_id, entry_id: pick.entry_id, points: 0, result: "pending", edge_action: "allow", reason: "Game not started.", affects_elimination: false };
  }

  if (status === "CANCELED" || status === "CANCELLED") {
    const cancelResult = handleCanceledGame(config, template, pick.event_started, true);
    return {
      pick_id: pick.pick_id,
      entry_id: pick.entry_id,
      points: cancelResult.action === "score_as_win" ? config.scoring.points_per_win : 0,
      result: cancelResult.action === "score_as_win" ? "win" : cancelResult.action === "score_as_loss" ? "loss" : "void",
      edge_action: cancelResult.action,
      reason: cancelResult.reason,
      affects_elimination: cancelResult.affects_elimination,
    };
  }

  if (status === "POSTPONED" || status === "DELAYED") {
    const postponedResult = handlePostponedGame(config, template);
    return {
      pick_id: pick.pick_id,
      entry_id: pick.entry_id,
      points: 0,
      result: postponedResult.action === "stands_for_reschedule" ? "pending" : "void",
      edge_action: postponedResult.action,
      reason: postponedResult.reason,
      affects_elimination: false,
    };
  }

  if (status !== "FINAL" && status !== "COMPLETED") {
    return { pick_id: pick.pick_id, entry_id: pick.entry_id, points: 0, result: "pending", edge_action: "allow", reason: "Game in progress.", affects_elimination: false };
  }

  const homeScore = pick.home_score ?? 0;
  const awayScore = pick.away_score ?? 0;
  const isTied = homeScore === awayScore;
  const pickNorm = (pick.pick_value || "").trim().toLowerCase();
  const homeNorm = (pick.home_team || "").trim().toLowerCase();
  const awayNorm = (pick.away_team || "").trim().toLowerCase();
  const isHomePick = pickNorm === "home" || pickNorm === homeNorm || homeNorm.includes(pickNorm) || pickNorm.includes(homeNorm.split(/\s+/).pop() || "");
  const isAwayPick = !isHomePick;

  if (config.scoring.type === "ats" && pick.spread !== null) {
    const adjustedScore = isHomePick ? homeScore + pick.spread : awayScore + pick.spread;
    const opponentScore = isHomePick ? awayScore : homeScore;
    const isPush = adjustedScore === opponentScore;

    if (isPush) {
      const pushResult = handlePush(config);
      return {
        pick_id: pick.pick_id,
        entry_id: pick.entry_id,
        points: config.scoring.push_value,
        result: "push",
        edge_action: pushResult.action,
        reason: pushResult.reason,
        affects_elimination: pushResult.affects_elimination,
      };
    }

    const covered = adjustedScore > opponentScore;
    return gradeCorrectIncorrect(pick, config, template, covered);
  }

  if (isTied) {
    const tieResult = handleTie(config, template);
    return {
      pick_id: pick.pick_id,
      entry_id: pick.entry_id,
      points: tieResult.action === "score_as_win" ? scoreForWin(pick, config) : 0,
      result: tieResult.action === "score_as_win" ? "win" : tieResult.action === "score_as_loss" || tieResult.action === "eliminate" ? "loss" : "push",
      edge_action: tieResult.action,
      reason: tieResult.reason,
      affects_elimination: tieResult.affects_elimination,
    };
  }

  const pickedScore = isHomePick ? homeScore : awayScore;
  const opponentScore = isHomePick ? awayScore : homeScore;
  const isCorrect = pickedScore > opponentScore;

  return gradeCorrectIncorrect(pick, config, template, isCorrect);
}

function gradeCorrectIncorrect(
  pick: PickGradeInput,
  config: PoolRuleConfig,
  template: string,
  isCorrect: boolean,
): PickGradeResult {
  if (isCorrect) {
    return {
      pick_id: pick.pick_id,
      entry_id: pick.entry_id,
      points: scoreForWin(pick, config),
      result: "win",
      edge_action: template === "survivor" || template === "last_man_standing" ? "safe" : "allow",
      reason: "Correct pick.",
      affects_elimination: false,
    };
  }

  const isSurvivor = template === "survivor" || template === "last_man_standing";
  return {
    pick_id: pick.pick_id,
    entry_id: pick.entry_id,
    points: 0,
    result: "loss",
    edge_action: isSurvivor ? "eliminate" : "score_as_loss",
    reason: isSurvivor ? "Incorrect pick — elimination." : "Incorrect pick.",
    affects_elimination: isSurvivor,
  };
}

function scoreForWin(pick: PickGradeInput, config: PoolRuleConfig): number {
  if (config.scoring.type === "confidence" && pick.confidence_rank) {
    return pick.confidence_rank;
  }
  let points = config.scoring.points_per_win;
  if (config.scoring.upset_bonus > 0 && pick.spread !== null && pick.spread > 3) {
    points += config.scoring.upset_bonus;
  }
  return points;
}

// ─── Period Grading ─────────────────────────────────────────────

export function gradePeriod(
  picks: PickGradeInput[],
  config: PoolRuleConfig,
  template: string,
  periodId: string,
  expectedPickCount: number,
): PeriodGradeResult {
  const graded: PickGradeResult[] = [];
  const warnings: string[] = [];
  const entriesToEliminate: number[] = [];

  for (const pick of picks) {
    const result = gradePick(pick, config, template);
    graded.push(result);
  }

  const entryIds = new Set(picks.map((p) => p.entry_id));
  for (const entryId of entryIds) {
    const entryPicks = graded.filter((g) => g.entry_id === entryId);
    const missedCount = Math.max(0, expectedPickCount - entryPicks.length);

    if (missedCount > 0) {
      const missedResult = handleMissedPick(config, template);
      if (missedResult.affects_elimination) {
        entriesToEliminate.push(entryId);
        warnings.push(`Entry ${entryId} missed ${missedCount} pick(s) — ${missedResult.reason}`);
      }
    }

    if (entryPicks.some((p) => p.affects_elimination)) {
      if (!entriesToEliminate.includes(entryId)) {
        entriesToEliminate.push(entryId);
      }
    }
  }

  if (entriesToEliminate.length > 0 && (template === "survivor" || template === "last_man_standing")) {
    const massResult = evaluateMassElimination({
      total_entries: entryIds.size,
      entries_to_eliminate: entriesToEliminate.length,
      remaining_after: entryIds.size - entriesToEliminate.length,
    });
    if (massResult.requires_admin_review) {
      warnings.push(massResult.reason);
    }
  }

  const totalPoints = graded.reduce((sum, g) => sum + g.points, 0);
  const correct = graded.filter((g) => g.result === "win").length;
  const losses = graded.filter((g) => g.result === "loss").length;
  const pushes = graded.filter((g) => g.result === "push").length;
  const voids = graded.filter((g) => g.result === "void").length;
  const missed = Math.max(0, (expectedPickCount * entryIds.size) - picks.length);

  return {
    period_id: periodId,
    graded_picks: graded,
    total_points: totalPoints,
    correct_count: correct,
    loss_count: losses,
    push_count: pushes,
    void_count: voids,
    missed_count: missed,
    entries_to_eliminate: entriesToEliminate,
    warnings,
  };
}

// ─── Safe Recalculation Service ─────────────────────────────────

export interface RecalculationJob {
  league_id: number;
  period_id?: string;
  trigger: "stat_correction" | "canceled_game" | "postponed_game" | "admin_override";
  dry_run: boolean;
  triggered_by: string;
}

export interface RecalculationResult {
  success: boolean;
  affected_entries: number;
  affected_picks: number;
  standings_changed: boolean;
  eliminations_changed: boolean;
  payout_recalc_needed: boolean;
  snapshot_id?: number;
  details: string[];
}

export async function executeRecalculation(
  env: Env,
  job: RecalculationJob,
): Promise<RecalculationResult> {
  const details: string[] = [];
  let affectedEntries = 0;
  let affectedPicks = 0;
  let standingsChanged = false;
  let eliminationsChanged = false;

  const league = await env.DB.prepare("SELECT id, format_key, rules_json FROM leagues WHERE id = ?")
    .bind(job.league_id).first<{ id: number; format_key: string; rules_json: string | null }>();

  if (!league) {
    return { success: false, affected_entries: 0, affected_picks: 0, standings_changed: false, eliminations_changed: false, payout_recalc_needed: false, details: ["League not found."] };
  }

  const config = deserializePoolRuleConfig(league.format_key, league.rules_json);
  details.push(`Config resolved for template: ${league.format_key}`);

  const logId = await env.DB.prepare(
    `INSERT INTO recalculation_log (league_id, period_id, trigger_type, triggered_by, is_dry_run, status, started_at)
     VALUES (?, ?, ?, ?, ?, 'running', CURRENT_TIMESTAMP)`,
  ).bind(job.league_id, job.period_id || null, job.trigger, job.triggered_by, job.dry_run ? 1 : 0).run();

  const snapshotId = logId.meta?.last_row_id;

  const periodFilter = job.period_id ? "AND p.period_id = ?" : "";
  const periodParams: (string | number)[] = [job.league_id];
  if (job.period_id) periodParams.push(job.period_id);

  const picksToRegrade = await env.DB.prepare(`
    SELECT p.id as pick_id, p.entry_id, p.user_id, p.event_id, p.pick_value, p.confidence_rank, p.period_id,
           p.is_correct as previous_is_correct, p.points_earned as previous_points_earned,
           e.status as event_status, e.home_team, e.away_team, e.home_score, e.away_score,
           e.final_result as winner, e.start_at, e.spread
    FROM picks p
    JOIN events e ON p.event_id = e.id
    WHERE p.league_id = ? ${periodFilter}
  `).bind(...periodParams).all<{
    pick_id: number; entry_id: number | null; user_id: string; event_id: number; period_id: string;
    pick_value: string; confidence_rank: number | null;
    previous_is_correct: number | null; previous_points_earned: number | null;
    event_status: string; home_team: string; away_team: string;
    home_score: number | null; away_score: number | null; winner: string | null; start_at: string; spread: number | null;
  }>();

  const picks = picksToRegrade.results || [];
  affectedPicks = picks.length;
  details.push(`Found ${affectedPicks} picks to regrade.`);

  const gradeInputs: PickGradeInput[] = picks.map((p) => ({
    pick_id: p.pick_id,
    entry_id: p.entry_id || 0,
    user_id: p.user_id,
    event_id: p.event_id,
    pick_value: p.pick_value,
    confidence_rank: p.confidence_rank,
    event_status: p.event_status || "scheduled",
    event_started: Boolean(p.start_at && new Date(p.start_at) < new Date()),
    home_team: p.home_team || "",
    away_team: p.away_team || "",
    home_score: p.home_score,
    away_score: p.away_score,
    winner: p.winner,
    spread: p.spread,
  }));

  const entryIds = new Set(gradeInputs.map((g) => g.entry_id));
  affectedEntries = entryIds.size;

  const resultsByPickId = new Map<number, PickGradeResult>();
  for (const gradeInput of gradeInputs) {
    const result = gradePick(gradeInput, config, league.format_key);
    resultsByPickId.set(gradeInput.pick_id, result);

    if (result.result !== "pending") {
      standingsChanged = true;
    }
    if (result.affects_elimination) {
      eliminationsChanged = true;
    }
  }

  if (!job.dry_run) {
    for (const pick of picks) {
      const result = resultsByPickId.get(pick.pick_id);
      if (!result || result.result === "pending") continue;
      const nextIsCorrect = result.result === "win" ? 1 : 0;
      const nextPointsEarned = result.points;

      if (pick.previous_is_correct !== nextIsCorrect || Number(pick.previous_points_earned || 0) !== Number(nextPointsEarned || 0)) {
        await env.DB.prepare(`
          UPDATE picks
          SET is_correct = ?, points_earned = ?, is_locked = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(nextIsCorrect, nextPointsEarned, pick.pick_id).run();
      }
    }

    await recomputeDerivedLeagueStats(env.DB, job.league_id);
    details.push("Rebuilt pool_entry_stats, pool_entry_weekly_stats, and standings_history.");
  }

  details.push(`Graded ${affectedPicks} picks across ${affectedEntries} entries.`);
  if (standingsChanged) details.push("Standings have changed.");
  if (eliminationsChanged) details.push("Elimination statuses have changed.");

  await env.DB.prepare(
    `UPDATE recalculation_log SET status = ?, completed_at = CURRENT_TIMESTAMP,
     affected_entries = ?, affected_picks = ?, result_json = ?
     WHERE id = ?`,
  ).bind(
    job.dry_run ? "dry_run_complete" : "complete",
    affectedEntries, affectedPicks,
    JSON.stringify({ standings_changed: standingsChanged, eliminations_changed: eliminationsChanged }),
    snapshotId || 0,
  ).run();

  return {
    success: true,
    affected_entries: affectedEntries,
    affected_picks: affectedPicks,
    standings_changed: standingsChanged,
    eliminations_changed: eliminationsChanged,
    payout_recalc_needed: standingsChanged,
    snapshot_id: snapshotId || undefined,
    details,
  };
}

async function recomputeDerivedLeagueStats(db: D1Database, leagueId: number): Promise<void> {
  const entryRowsResult = await db.prepare(`
    SELECT pe.id as entry_id, pe.user_id
    FROM pool_entries pe
    INNER JOIN league_members lm
      ON lm.league_id = pe.league_id AND lm.user_id = pe.user_id
    WHERE pe.league_id = ? AND lm.invite_status = 'joined'
  `).bind(leagueId).all<{ entry_id: number; user_id: number }>();
  const entryRows = entryRowsResult.results || [];
  if (entryRows.length === 0) return;

  const pickRowsResult = await db.prepare(`
    SELECT
      p.id as pick_id,
      p.entry_id,
      p.user_id,
      p.period_id,
      p.is_correct,
      p.points_earned,
      p.created_at
    FROM picks p
    INNER JOIN events e ON e.id = p.event_id
    WHERE p.league_id = ?
      AND p.entry_id IS NOT NULL
      AND UPPER(e.status) IN ('FINAL','FINAL_OT','COMPLETED','CANCELED','CANCELLED','POSTPONED','DELAYED')
    ORDER BY p.period_id ASC, p.created_at ASC, p.id ASC
  `).bind(leagueId).all<{
    pick_id: number;
    entry_id: number;
    user_id: number;
    period_id: string;
    is_correct: number | null;
    points_earned: number | null;
    created_at: string | null;
  }>();
  const pickRows = pickRowsResult.results || [];

  type Aggregate = {
    entry_id: number;
    user_id: number;
    total_points: number;
    correct_picks: number;
    total_picks: number;
    longest_win_streak: number;
    current_win_streak: number;
  };

  const aggregateByEntry = new Map<number, Aggregate>();
  for (const entry of entryRows) {
    aggregateByEntry.set(entry.entry_id, {
      entry_id: entry.entry_id,
      user_id: entry.user_id,
      total_points: 0,
      correct_picks: 0,
      total_picks: 0,
      longest_win_streak: 0,
      current_win_streak: 0,
    });
  }

  const picksByEntry = new Map<number, typeof pickRows>();
  for (const row of pickRows) {
    if (!picksByEntry.has(row.entry_id)) picksByEntry.set(row.entry_id, []);
    picksByEntry.get(row.entry_id)!.push(row);
  }

  for (const [entryId, rows] of picksByEntry.entries()) {
    const agg = aggregateByEntry.get(entryId);
    if (!agg) continue;
    let streak = 0;
    let longest = 0;
    for (const row of rows) {
      if (row.is_correct === null) continue;
      agg.total_picks += 1;
      if (row.is_correct === 1) {
        agg.correct_picks += 1;
        agg.total_points += Number(row.points_earned || 0);
        streak += 1;
        if (streak > longest) longest = streak;
      } else {
        streak = 0;
      }
    }
    agg.current_win_streak = streak;
    agg.longest_win_streak = longest;
  }

  await db.prepare(`DELETE FROM pool_entry_stats WHERE league_id = ?`).bind(leagueId).run();
  for (const agg of aggregateByEntry.values()) {
    const winPct = agg.total_picks > 0 ? Math.round((agg.correct_picks / agg.total_picks) * 1000) / 10 : 0;
    await db.prepare(`
      INSERT INTO pool_entry_stats (
        pool_entry_id, league_id, user_id, total_points, correct_picks, total_picks,
        win_percentage, longest_win_streak, current_win_streak, is_eliminated, updated_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      agg.entry_id,
      leagueId,
      agg.user_id,
      agg.total_points,
      agg.correct_picks,
      agg.total_picks,
      winPct,
      agg.longest_win_streak,
      agg.current_win_streak,
    ).run();
  }

  const periods = Array.from(new Set(pickRows.map((r) => r.period_id))).filter(Boolean);
  const periodOrder = periods.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const runningByEntry = new Map<number, { total_points: number; correct_picks: number; total_picks: number }>();
  const previousRankByEntry = new Map<number, number>();

  await db.prepare(`DELETE FROM pool_entry_weekly_stats WHERE league_id = ?`).bind(leagueId).run();
  await db.prepare(`DELETE FROM standings_history WHERE league_id = ?`).bind(leagueId).run();

  for (const periodId of periodOrder) {
    const rows = pickRows.filter((r) => r.period_id === periodId && r.is_correct !== null);
    const periodByEntry = new Map<number, { user_id: number; points_earned: number; correct_picks: number; total_picks: number }>();
    for (const row of rows) {
      const prior = periodByEntry.get(row.entry_id) || {
        user_id: row.user_id,
        points_earned: 0,
        correct_picks: 0,
        total_picks: 0,
      };
      prior.total_picks += 1;
      if (row.is_correct === 1) {
        prior.correct_picks += 1;
        prior.points_earned += Number(row.points_earned || 0);
      }
      periodByEntry.set(row.entry_id, prior);
    }

    const ranked = Array.from(aggregateByEntry.values()).map((agg) => {
      const currentPeriod = periodByEntry.get(agg.entry_id) || {
        user_id: agg.user_id,
        points_earned: 0,
        correct_picks: 0,
        total_picks: 0,
      };
      const running = runningByEntry.get(agg.entry_id) || { total_points: 0, correct_picks: 0, total_picks: 0 };
      running.total_points += currentPeriod.points_earned;
      running.correct_picks += currentPeriod.correct_picks;
      running.total_picks += currentPeriod.total_picks;
      runningByEntry.set(agg.entry_id, running);
      return {
        entry_id: agg.entry_id,
        user_id: agg.user_id,
        points_earned: currentPeriod.points_earned,
        correct_picks: running.correct_picks,
        total_picks: running.total_picks,
        total_points: running.total_points,
        win_percentage: running.total_picks > 0 ? Math.round((running.correct_picks / running.total_picks) * 1000) / 10 : 0,
      };
    }).sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.win_percentage !== a.win_percentage) return b.win_percentage - a.win_percentage;
      return b.correct_picks - a.correct_picks;
    });

    for (let i = 0; i < ranked.length; i += 1) {
      const row = ranked[i];
      const rank = i + 1;
      const previousRank = previousRankByEntry.get(row.entry_id) ?? rank;
      const rankDelta = previousRank - rank;
      previousRankByEntry.set(row.entry_id, rank);

      await db.prepare(`
        INSERT INTO pool_entry_weekly_stats (
          pool_entry_id, league_id, user_id, period_id, rank, rank_delta, points_earned, total_points,
          correct_picks, total_picks, win_percentage, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        row.entry_id,
        leagueId,
        row.user_id,
        periodId,
        rank,
        rankDelta,
        row.points_earned,
        row.total_points,
        row.correct_picks,
        row.total_picks,
        row.win_percentage,
      ).run();

      await db.prepare(`
        INSERT INTO standings_history (
          league_id, user_id, period_id, rank, total_points, correct_picks, total_picks, win_percentage, entry_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        leagueId,
        row.user_id,
        periodId,
        rank,
        row.total_points,
        row.correct_picks,
        row.total_picks,
        row.win_percentage,
        row.entry_id,
      ).run();
    }
  }
}
