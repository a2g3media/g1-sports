/**
 * Payout Service
 *
 * DB-backed payout management. Uses the pure payout engine for calculations,
 * then persists results to payout_ledger and payout_config tables.
 */

import {
  calculatePayouts,
  calculateHybridPayouts,
  validatePayoutConfig,
  buildPayoutLedger,
  calculateCalcuttaPayouts,
  type StandingsEntry,
  type PayoutConfig,
  type PayoutDistribution,
  type PayoutLineItem,
  type PayoutLedgerEntry,
  type CalcuttaOwnership,
  type CalcuttaPayoutResult,
} from "../../shared/payoutEngine";
import type { PayoutBucket, PayoutPlacement, PayoutSplitMode, PayoutTieMode } from "../../shared/poolRuleConfig";

// ─── Load Payout Config from DB ─────────────────────────────────

export async function loadPayoutConfig(
  db: D1Database,
  leagueId: number,
): Promise<PayoutConfig> {
  const configs = await db.prepare(`
    SELECT bucket_type, total_pool_cents, split_mode, tie_mode, placements_json
    FROM payout_config
    WHERE league_id = ? AND is_active = 1
  `).bind(leagueId).all<{
    bucket_type: string;
    total_pool_cents: number;
    split_mode: string;
    tie_mode: string;
    placements_json: string;
  }>();

  let totalPoolCents = 0;
  const buckets: PayoutBucket[] = [];

  for (const row of configs.results || []) {
    totalPoolCents = Math.max(totalPoolCents, row.total_pool_cents);
    let placements: PayoutPlacement[] = [];
    try {
      placements = JSON.parse(row.placements_json || "[]");
    } catch { /* empty */ }

    buckets.push({
      type: row.bucket_type as PayoutBucket["type"],
      placements,
      split_mode: row.split_mode as PayoutSplitMode,
      tie_mode: row.tie_mode as PayoutTieMode,
    });
  }

  return { total_pool_cents: totalPoolCents, buckets };
}

// ─── Save Payout Config ─────────────────────────────────────────

export async function savePayoutConfig(
  db: D1Database,
  leagueId: number,
  buckets: PayoutBucket[],
  totalPoolCents: number,
): Promise<void> {
  await db.prepare("UPDATE payout_config SET is_active = 0 WHERE league_id = ?").bind(leagueId).run();

  for (const bucket of buckets) {
    await db.prepare(`
      INSERT INTO payout_config (league_id, bucket_type, total_pool_cents, split_mode, tie_mode, placements_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(league_id, bucket_type) DO UPDATE SET
        total_pool_cents = excluded.total_pool_cents,
        split_mode = excluded.split_mode,
        tie_mode = excluded.tie_mode,
        placements_json = excluded.placements_json,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      leagueId,
      bucket.type,
      totalPoolCents,
      bucket.split_mode,
      bucket.tie_mode,
      JSON.stringify(bucket.placements),
    ).run();
  }
}

// ─── Load Standings for Payout ──────────────────────────────────

export async function loadStandingsForPayout(
  db: D1Database,
  leagueId: number,
  periodId?: string,
): Promise<StandingsEntry[]> {
  const query = periodId
    ? `SELECT pes.pool_entry_id as entry_id, pes.user_id, u.display_name,
              pews.points_earned as total_points, pews.correct_picks, pews.rank
       FROM pool_entry_weekly_stats pews
       JOIN pool_entry_stats pes ON pews.pool_entry_id = pes.pool_entry_id
       JOIN users u ON pes.user_id = CAST(u.id AS TEXT)
       WHERE pews.league_id = ? AND pews.period_id = ?
       ORDER BY pews.rank ASC`
    : `SELECT pes.pool_entry_id as entry_id, CAST(pes.user_id AS TEXT) as user_id,
              u.display_name, pes.total_points, pes.correct_picks, 0 as rank
       FROM pool_entry_stats pes
       JOIN users u ON pes.user_id = CAST(u.id AS TEXT)
       WHERE pes.league_id = ?
       ORDER BY pes.total_points DESC`;

  const params: (string | number)[] = [leagueId];
  if (periodId) params.push(periodId);

  const rows = await db.prepare(query).bind(...params).all<{
    entry_id: number;
    user_id: string;
    display_name: string | null;
    total_points: number;
    correct_picks: number;
    rank: number;
  }>();

  return (rows.results || []).map((row, idx) => ({
    entry_id: row.entry_id,
    user_id: row.user_id,
    display_name: row.display_name || `User ${row.user_id.slice(0, 6)}`,
    rank: row.rank || idx + 1,
    total_points: row.total_points,
    correct_picks: row.correct_picks,
  }));
}

// ─── Run Payout Calculation ─────────────────────────────────────

export async function runPayoutCalculation(
  db: D1Database,
  leagueId: number,
  periodId?: string,
  dryRun = false,
): Promise<PayoutDistribution> {
  const config = await loadPayoutConfig(db, leagueId);
  const standings = await loadStandingsForPayout(db, leagueId, periodId);
  const distribution = calculatePayouts(standings, config);

  if (!dryRun && distribution.line_items.length > 0) {
    const ledgerEntries = buildPayoutLedger(leagueId, distribution, periodId);
    for (const entry of ledgerEntries) {
      await db.prepare(`
        INSERT INTO payout_ledger (league_id, entry_id, user_id, bucket_type, period_id, place, amount_cents, is_tie_split, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).bind(
        entry.league_id,
        entry.entry_id,
        entry.user_id,
        entry.bucket_type,
        entry.period_id || null,
        entry.place,
        entry.amount_cents,
        entry.is_tie_split ? 1 : 0,
      ).run();
    }
  }

  return distribution;
}

// ─── Approve / Pay / Void ───────────────────────────────────────

export async function approvePayouts(
  db: D1Database,
  leagueId: number,
  approvedBy: string,
  bucketType?: string,
  periodId?: string,
): Promise<number> {
  let query = "UPDATE payout_ledger SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE league_id = ? AND status = 'pending'";
  const params: (string | number)[] = [approvedBy, leagueId];

  if (bucketType) {
    query += " AND bucket_type = ?";
    params.push(bucketType);
  }
  if (periodId) {
    query += " AND period_id = ?";
    params.push(periodId);
  }

  const result = await db.prepare(query).bind(...params).run();
  return result.meta?.changes || 0;
}

export async function markPayoutsPaid(
  db: D1Database,
  payoutIds: number[],
): Promise<number> {
  if (payoutIds.length === 0) return 0;
  const placeholders = payoutIds.map(() => "?").join(",");
  const result = await db.prepare(
    `UPDATE payout_ledger SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders}) AND status = 'approved'`,
  ).bind(...payoutIds).run();
  return result.meta?.changes || 0;
}

export async function voidPayouts(
  db: D1Database,
  leagueId: number,
  reason: string,
  bucketType?: string,
  periodId?: string,
): Promise<number> {
  let query = "UPDATE payout_ledger SET status = 'voided', void_reason = ?, voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE league_id = ? AND status IN ('pending', 'approved')";
  const params: (string | number)[] = [reason, leagueId];

  if (bucketType) {
    query += " AND bucket_type = ?";
    params.push(bucketType);
  }
  if (periodId) {
    query += " AND period_id = ?";
    params.push(periodId);
  }

  const result = await db.prepare(query).bind(...params).run();
  return result.meta?.changes || 0;
}

// ─── Get Payout Summary ─────────────────────────────────────────

export interface PayoutSummary {
  league_id: number;
  total_pool_cents: number;
  total_distributed_cents: number;
  total_pending_cents: number;
  total_approved_cents: number;
  total_paid_cents: number;
  total_voided_cents: number;
  line_items: PayoutLedgerEntry[];
}

export async function getPayoutSummary(
  db: D1Database,
  leagueId: number,
): Promise<PayoutSummary> {
  const config = await loadPayoutConfig(db, leagueId);

  const ledger = await db.prepare(`
    SELECT id, league_id, entry_id, user_id, bucket_type, period_id, place, amount_cents, is_tie_split, status, created_at
    FROM payout_ledger
    WHERE league_id = ?
    ORDER BY place ASC, created_at ASC
  `).bind(leagueId).all<PayoutLedgerEntry>();

  const items = ledger.results || [];

  return {
    league_id: leagueId,
    total_pool_cents: config.total_pool_cents,
    total_distributed_cents: items.reduce((sum, i) => sum + (i.amount_cents || 0), 0),
    total_pending_cents: items.filter((i) => i.status === "pending").reduce((sum, i) => sum + (i.amount_cents || 0), 0),
    total_approved_cents: items.filter((i) => i.status === "approved").reduce((sum, i) => sum + (i.amount_cents || 0), 0),
    total_paid_cents: items.filter((i) => i.status === "paid").reduce((sum, i) => sum + (i.amount_cents || 0), 0),
    total_voided_cents: items.filter((i) => i.status === "voided").reduce((sum, i) => sum + (i.amount_cents || 0), 0),
    line_items: items,
  };
}

// ─── Calcutta Service ───────────────────────────────────────────

export async function loadCalcuttaOwnerships(
  db: D1Database,
  leagueId: number,
): Promise<CalcuttaOwnership[]> {
  const rows = await db.prepare(`
    SELECT team_id, team_name, user_id, ownership_pct, price_paid_cents
    FROM calcutta_ownerships
    WHERE league_id = ?
    ORDER BY team_id, ownership_pct DESC
  `).bind(leagueId).all<{
    team_id: string;
    team_name: string;
    user_id: string;
    ownership_pct: number;
    price_paid_cents: number;
  }>();

  const ownershipMap = new Map<string, CalcuttaOwnership>();
  for (const row of rows.results || []) {
    let ownership = ownershipMap.get(row.team_id);
    if (!ownership) {
      ownership = { team_id: row.team_id, team_name: row.team_name, owners: [] };
      ownershipMap.set(row.team_id, ownership);
    }
    ownership.owners.push({
      user_id: row.user_id,
      display_name: "",
      ownership_pct: row.ownership_pct,
      price_paid_cents: row.price_paid_cents,
    });
  }

  return Array.from(ownershipMap.values());
}

export async function recordCalcuttaOwnership(
  db: D1Database,
  leagueId: number,
  teamId: string,
  teamName: string,
  userId: string,
  ownershipPct: number,
  pricePaidCents: number,
  acquiredVia: string = "auction",
): Promise<void> {
  await db.prepare(`
    INSERT INTO calcutta_ownerships (league_id, team_id, team_name, user_id, ownership_pct, price_paid_cents, acquired_via)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(league_id, team_id, user_id) DO UPDATE SET
      ownership_pct = excluded.ownership_pct,
      price_paid_cents = excluded.price_paid_cents,
      updated_at = CURRENT_TIMESTAMP
  `).bind(leagueId, teamId, teamName, userId, ownershipPct, pricePaidCents, acquiredVia).run();
}
