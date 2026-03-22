/**
 * Payout Engine
 *
 * Handles all payout calculation, distribution, and tie-splitting logic.
 * Pure functions — no DB access. Operates on resolved standings + config.
 */

import type { PayoutBucket, PayoutPlacement, PayoutSplitMode, PayoutTieMode } from "./poolRuleConfig";

// ─── Input Types ────────────────────────────────────────────────

export interface StandingsEntry {
  entry_id: number;
  user_id: string;
  display_name: string;
  rank: number;
  total_points: number;
  correct_picks: number;
  tiebreaker_value?: number;
}

export interface PayoutConfig {
  total_pool_cents: number;
  buckets: PayoutBucket[];
}

// ─── Output Types ───────────────────────────────────────────────

export interface PayoutLineItem {
  entry_id: number;
  user_id: string;
  display_name: string;
  rank: number;
  place_label: string;
  amount_cents: number;
  source_bucket: string;
  is_tie_split: boolean;
  tied_with: number[];
}

export interface PayoutDistribution {
  line_items: PayoutLineItem[];
  total_distributed_cents: number;
  remainder_cents: number;
  warnings: string[];
}

// ─── Core Engine ────────────────────────────────────────────────

/**
 * Calculate full payout distribution for a pool.
 */
export function calculatePayouts(
  standings: StandingsEntry[],
  config: PayoutConfig,
): PayoutDistribution {
  const lineItems: PayoutLineItem[] = [];
  const warnings: string[] = [];
  let totalDistributed = 0;

  if (standings.length === 0) {
    return { line_items: [], total_distributed_cents: 0, remainder_cents: config.total_pool_cents, warnings: ["No entries to distribute payouts to."] };
  }

  for (const bucket of config.buckets) {
    const bucketItems = distributeBucket(standings, bucket, config.total_pool_cents);
    for (const item of bucketItems.items) {
      lineItems.push({ ...item, source_bucket: bucket.type });
      totalDistributed += item.amount_cents;
    }
    warnings.push(...bucketItems.warnings);
  }

  const remainder = config.total_pool_cents - totalDistributed;
  if (remainder < 0) {
    warnings.push(`Over-distribution detected: ${Math.abs(remainder)} cents over total pool.`);
  }

  return {
    line_items: lineItems,
    total_distributed_cents: totalDistributed,
    remainder_cents: Math.max(0, remainder),
    warnings,
  };
}

// ─── Bucket Distribution ────────────────────────────────────────

interface BucketResult {
  items: Omit<PayoutLineItem, "source_bucket">[];
  warnings: string[];
}

function distributeBucket(
  standings: StandingsEntry[],
  bucket: PayoutBucket,
  totalPoolCents: number,
): BucketResult {
  const items: Omit<PayoutLineItem, "source_bucket">[] = [];
  const warnings: string[] = [];

  const resolvedPlacements = resolvePlacementAmounts(bucket.placements, totalPoolCents, bucket.split_mode);

  const tiedGroups = buildTiedGroups(standings);

  let placementIdx = 0;

  for (const group of tiedGroups) {
    if (placementIdx >= resolvedPlacements.length) break;

    const placesOccupied = group.length;
    const placementsForGroup: { place: number; amount_cents: number; label: string }[] = [];

    for (let i = 0; i < placesOccupied && placementIdx + i < resolvedPlacements.length; i++) {
      placementsForGroup.push(resolvedPlacements[placementIdx + i]);
    }

    if (placementsForGroup.length === 0) break;

    if (group.length === 1) {
      const entry = group[0];
      const placement = placementsForGroup[0];
      items.push({
        entry_id: entry.entry_id,
        user_id: entry.user_id,
        display_name: entry.display_name,
        rank: entry.rank,
        place_label: placement.label,
        amount_cents: placement.amount_cents,
        is_tie_split: false,
        tied_with: [],
      });
    } else {
      const tieResult = handlePayoutTie(group, placementsForGroup, bucket.tie_mode);
      items.push(...tieResult.items);
      warnings.push(...tieResult.warnings);
    }

    if (bucket.tie_mode === "split_skip_next") {
      placementIdx += placesOccupied;
    } else {
      placementIdx += placementsForGroup.length;
    }
  }

  return { items, warnings };
}

// ─── Placement Resolution ───────────────────────────────────────

function resolvePlacementAmounts(
  placements: PayoutPlacement[],
  totalPoolCents: number,
  splitMode: PayoutSplitMode,
): { place: number; amount_cents: number; label: string }[] {
  return placements.map((p) => {
    let amount = 0;
    if (p.amount_cents !== undefined && p.amount_cents > 0) {
      amount = p.amount_cents;
    } else if (p.percentage !== undefined && p.percentage > 0) {
      amount = Math.floor(totalPoolCents * (p.percentage / 100));
    }

    return {
      place: p.place,
      amount_cents: amount,
      label: p.label || ordinalLabel(p.place),
    };
  });
}

// ─── Tied Group Detection ───────────────────────────────────────

function buildTiedGroups(standings: StandingsEntry[]): StandingsEntry[][] {
  const groups: StandingsEntry[][] = [];
  let currentGroup: StandingsEntry[] = [];

  for (const entry of standings) {
    if (currentGroup.length === 0) {
      currentGroup.push(entry);
      continue;
    }

    const prev = currentGroup[0];
    if (entry.total_points === prev.total_points && entry.correct_picks === prev.correct_picks) {
      currentGroup.push(entry);
    } else {
      groups.push(currentGroup);
      currentGroup = [entry];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// ─── Tie Handling ───────────────────────────────────────────────

interface TieResult {
  items: Omit<PayoutLineItem, "source_bucket">[];
  warnings: string[];
}

function handlePayoutTie(
  tiedEntries: StandingsEntry[],
  placements: { place: number; amount_cents: number; label: string }[],
  tieMode: PayoutTieMode,
): TieResult {
  const items: Omit<PayoutLineItem, "source_bucket">[] = [];
  const warnings: string[] = [];
  const tiedIds = tiedEntries.map((e) => e.entry_id);

  if (tieMode === "split_no_skip" || tieMode === "split_skip_next") {
    const totalToSplit = placements.reduce((sum, p) => sum + p.amount_cents, 0);
    const perEntry = Math.floor(totalToSplit / tiedEntries.length);
    const remainder = totalToSplit - perEntry * tiedEntries.length;

    for (let i = 0; i < tiedEntries.length; i++) {
      const entry = tiedEntries[i];
      const extra = i === 0 ? remainder : 0;
      items.push({
        entry_id: entry.entry_id,
        user_id: entry.user_id,
        display_name: entry.display_name,
        rank: entry.rank,
        place_label: `T-${placements[0]?.label || ordinalLabel(entry.rank)}`,
        amount_cents: perEntry + extra,
        is_tie_split: true,
        tied_with: tiedIds.filter((id) => id !== entry.entry_id),
      });
    }

    if (tieMode === "split_no_skip") {
      warnings.push(
        `Tie for ${placements[0]?.label || "position"}: ${tiedEntries.length} entries split $${(totalToSplit / 100).toFixed(2)} evenly. Next paid position follows immediately.`,
      );
    } else {
      warnings.push(
        `Tie for ${placements[0]?.label || "position"}: ${tiedEntries.length} entries split $${(totalToSplit / 100).toFixed(2)} evenly. Next ${tiedEntries.length - 1} position(s) skipped.`,
      );
    }
  } else {
    warnings.push(
      `Custom redistribution requested for ${tiedEntries.length}-way tie at ${placements[0]?.label || "position"}. Admin review required.`,
    );
    for (const entry of tiedEntries) {
      items.push({
        entry_id: entry.entry_id,
        user_id: entry.user_id,
        display_name: entry.display_name,
        rank: entry.rank,
        place_label: `T-${placements[0]?.label || ordinalLabel(entry.rank)}`,
        amount_cents: 0,
        is_tie_split: true,
        tied_with: tiedIds.filter((id) => id !== entry.entry_id),
      });
    }
  }

  return { items, warnings };
}

// ─── Hybrid Payouts ─────────────────────────────────────────────

/**
 * Calculate payouts for a hybrid pool (weekly + season payouts).
 */
export function calculateHybridPayouts(args: {
  weekly_standings: StandingsEntry[];
  season_standings: StandingsEntry[];
  weekly_config: PayoutConfig;
  season_config: PayoutConfig;
}): {
  weekly: PayoutDistribution;
  season: PayoutDistribution;
  combined_items: PayoutLineItem[];
} {
  const weekly = calculatePayouts(args.weekly_standings, args.weekly_config);
  const season = calculatePayouts(args.season_standings, args.season_config);

  return {
    weekly,
    season,
    combined_items: [...weekly.line_items, ...season.line_items],
  };
}

// ─── Payout Validation ──────────────────────────────────────────

export interface PayoutValidationResult {
  valid: boolean;
  errors: string[];
  total_percentage: number;
  total_fixed_cents: number;
}

export function validatePayoutConfig(config: PayoutConfig): PayoutValidationResult {
  const errors: string[] = [];
  let totalPercentage = 0;
  let totalFixedCents = 0;

  for (const bucket of config.buckets) {
    if (bucket.placements.length === 0) {
      errors.push(`Bucket '${bucket.type}' has no placements.`);
      continue;
    }

    const places = new Set<number>();
    for (const p of bucket.placements) {
      if (places.has(p.place)) {
        errors.push(`Duplicate placement ${p.place} in bucket '${bucket.type}'.`);
      }
      places.add(p.place);

      if (p.percentage !== undefined) totalPercentage += p.percentage;
      if (p.amount_cents !== undefined) totalFixedCents += p.amount_cents;
    }
  }

  if (totalPercentage > 100) {
    errors.push(`Total payout percentage exceeds 100% (${totalPercentage}%).`);
  }

  if (totalFixedCents > config.total_pool_cents) {
    errors.push(`Total fixed payouts ($${(totalFixedCents / 100).toFixed(2)}) exceed pool total ($${(config.total_pool_cents / 100).toFixed(2)}).`);
  }

  return {
    valid: errors.length === 0,
    errors,
    total_percentage: totalPercentage,
    total_fixed_cents: totalFixedCents,
  };
}

// ─── Ledger Types ───────────────────────────────────────────────

export interface PayoutLedgerEntry {
  id?: number;
  league_id: number;
  entry_id: number;
  user_id: string;
  bucket_type: string;
  period_id?: string;
  place: number;
  amount_cents: number;
  is_tie_split: boolean;
  status: "pending" | "approved" | "paid" | "voided";
  created_at?: string;
}

/**
 * Build ledger entries from a PayoutDistribution (ready for DB insert).
 */
export function buildPayoutLedger(
  leagueId: number,
  distribution: PayoutDistribution,
  periodId?: string,
): PayoutLedgerEntry[] {
  return distribution.line_items.map((item) => ({
    league_id: leagueId,
    entry_id: item.entry_id,
    user_id: item.user_id,
    bucket_type: item.source_bucket,
    period_id: periodId,
    place: item.rank,
    amount_cents: item.amount_cents,
    is_tie_split: item.is_tie_split,
    status: "pending" as const,
  }));
}

// ─── Calcutta Payout ────────────────────────────────────────────

export interface CalcuttaOwnership {
  team_id: string;
  team_name: string;
  owners: { user_id: string; display_name: string; ownership_pct: number; price_paid_cents: number }[];
}

export interface CalcuttaPayoutResult {
  team_payouts: {
    team_id: string;
    team_name: string;
    round_reached: string;
    payout_cents: number;
    owner_payouts: { user_id: string; display_name: string; amount_cents: number; ownership_pct: number }[];
  }[];
  total_distributed_cents: number;
}

export function calculateCalcuttaPayouts(
  ownerships: CalcuttaOwnership[],
  roundPayouts: { round: string; payout_cents: number }[],
  teamResults: { team_id: string; highest_round: string }[],
): CalcuttaPayoutResult {
  const teamPayouts: CalcuttaPayoutResult["team_payouts"] = [];
  let totalDistributed = 0;

  const roundPayoutMap = new Map(roundPayouts.map((r) => [r.round, r.payout_cents]));

  for (const result of teamResults) {
    const ownership = ownerships.find((o) => o.team_id === result.team_id);
    if (!ownership) continue;

    const teamPayout = roundPayoutMap.get(result.highest_round) || 0;
    if (teamPayout === 0) continue;

    const ownerPayouts = ownership.owners.map((owner) => ({
      user_id: owner.user_id,
      display_name: owner.display_name,
      amount_cents: Math.floor(teamPayout * (owner.ownership_pct / 100)),
      ownership_pct: owner.ownership_pct,
    }));

    const ownerTotal = ownerPayouts.reduce((sum, o) => sum + o.amount_cents, 0);
    const remainder = teamPayout - ownerTotal;
    if (remainder > 0 && ownerPayouts.length > 0) {
      ownerPayouts[0].amount_cents += remainder;
    }

    teamPayouts.push({
      team_id: result.team_id,
      team_name: ownership.team_name,
      round_reached: result.highest_round,
      payout_cents: teamPayout,
      owner_payouts: ownerPayouts,
    });

    totalDistributed += teamPayout;
  }

  return { team_payouts: teamPayouts, total_distributed_cents: totalDistributed };
}

// ─── Helpers ────────────────────────────────────────────────────

function ordinalLabel(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
