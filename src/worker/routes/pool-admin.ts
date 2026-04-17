// @ts-nocheck
import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { logAuditEvent } from "../middleware/rbac";
import type { Context, Next } from "hono";

const poolAdminRouter = new Hono<{ Bindings: Env }>();

// Demo mode constants
const DEMO_USER_ID = "demo-user-123";

// Demo or auth middleware
async function poolAdminDemoOrAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    c.set("user", { 
      id: DEMO_USER_ID, 
      email: "demo@example.com",
      google_sub: "demo",
      google_user_data: {
        email: "demo@example.com",
        email_verified: true,
        sub: "demo"
      },
      last_signed_in_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    return next();
  }
  return authMiddleware(c, next);
}

// Demo data generators
function getDemoPools() {
  return {
    pools: [
      {
        id: 1,
        name: "Office NFL Survivor 2024",
        sport_key: "nfl",
        format_key: "survivor",
        entry_fee_cents: 2500,
        is_payment_required: true,
        is_public: false,
        invite_code: "ABC123",
        user_role: "owner",
        status: "active",
        current_period: "Week 2",
        member_count: 12,
        pending_invites: 3,
        pending_approvals: 2,
        members_submitted: 8,
        pending_payments: 2,
        created_at: "2024-08-15T10:00:00Z",
      },
      {
        id: 2,
        name: "March Madness Bracket Challenge",
        sport_key: "ncaab",
        format_key: "bracket",
        entry_fee_cents: 5000,
        is_payment_required: true,
        is_public: true,
        invite_code: "MAR2024",
        user_role: "admin",
        status: "upcoming",
        current_period: "Round 1",
        member_count: 24,
        pending_invites: 5,
        pending_approvals: 3,
        members_submitted: 0,
        pending_payments: 8,
        created_at: "2024-02-01T10:00:00Z",
      },
    ],
    totals: {
      pools: 2,
      active_pools: 1,
      total_members: 36,
      pending_payments: 10,
      pending_invites: 8,
      pending_approvals: 5,
      total_submitted: 8,
    },
  };
}

function getDemoMembers() {
  return {
    members: [
      {
        member_id: 1,
        user_id: "user-1",
        name: "John Smith",
        email: "john@example.com",
        phone_masked: "***-***-1234",
        avatar_url: null,
        role: "member",
        invite_status: "joined",
        pick_status: "submitted",
        last_submission: "2024-02-10T14:30:00Z",
        receipt_count_period: 1,
        receipt_count_season: 3,
        payment_status: "paid",
        eligibility_status: "eligible",
        last_active: "2024-02-10T14:30:00Z",
        notes: null,
        invited_at: null,
        joined_at: "2024-01-15T10:00:00Z",
        notification_email: true,
        notification_sms: false,
        flags: [],
      },
      {
        member_id: 2,
        user_id: "user-2",
        name: "Jane Doe",
        email: "jane@example.com",
        phone_masked: "***-***-5678",
        avatar_url: null,
        role: "member",
        invite_status: "joined",
        pick_status: "missing",
        last_submission: null,
        receipt_count_period: 0,
        receipt_count_season: 2,
        payment_status: "unpaid",
        eligibility_status: "ineligible",
        last_active: "2024-02-08T09:00:00Z",
        notes: "Reminder sent",
        invited_at: null,
        joined_at: "2024-01-20T10:00:00Z",
        notification_email: true,
        notification_sms: true,
        flags: ["unpaid", "missing_picks"],
      },
    ],
    pagination: { page: 1, per_page: 25, total_count: 2, total_pages: 1 },
    stats: { total: 2, joined: 2, invited: 0, submitted: 1, missing_picks: 1, paid: 1, unpaid: 1, eligible: 1 },
    context: { current_period: "Week 2", next_lock_time: "2024-02-11T13:00:00Z", is_payment_required: true, entry_fee_cents: 2500 },
  };
}

function getDemoPayments() {
  return {
    payments: [
      { member_id: 1, user_id: "user-1", pool_id: 1, pool_name: "Office NFL Survivor", sport_key: "nfl", entry_fee_cents: 2500, display_name: "John Smith", email: "john@example.com", avatar_url: null, role: "member", is_paid: true, paid_at: "2024-01-16T10:00:00Z", joined_at: "2024-01-15T10:00:00Z" },
      { member_id: 2, user_id: "user-2", pool_id: 1, pool_name: "Office NFL Survivor", sport_key: "nfl", entry_fee_cents: 2500, display_name: "Jane Doe", email: "jane@example.com", avatar_url: null, role: "member", is_paid: false, paid_at: null, joined_at: "2024-01-20T10:00:00Z" },
    ],
    transactions: [],
    summary: { total: 2, paid: 1, unpaid: 1, collected_cents: 2500, outstanding_cents: 2500 },
  };
}

function getDemoActivity() {
  return {
    activities: [
      { id: 1, action_type: "pick_submitted", summary: "John submitted picks for Week 2", entity_type: "pick", entity_id: "1", details: { period: "Week 2" }, pool_id: 1, pool_name: "Office NFL Survivor", created_at: "2024-02-10T14:30:00Z", actor: { id: "user-1", name: "John Smith", email: "john@example.com", avatar_url: null } },
      { id: 2, action_type: "payment_verified", summary: "Payment verified for John Smith", entity_type: "member", entity_id: "1", details: {}, pool_id: 1, pool_name: "Office NFL Survivor", created_at: "2024-01-16T10:00:00Z", actor: { id: DEMO_USER_ID, name: "Pool Admin", email: "admin@example.com", avatar_url: null } },
    ],
    pools: [{ id: 1, name: "Office NFL Survivor" }],
    action_types: ["pick_submitted", "payment_verified", "member_joined"],
    pagination: { total: 2, limit: 50, offset: 0, has_more: false },
  };
}

function getDemoApprovalQueue() {
  const requests = [
    {
      member_id: 301,
      league_id: 1,
      pool_name: "Office NFL Survivor 2024",
      sport_key: "nfl",
      user_id: "user-77",
      name: "Alex Carter",
      email: "alex@example.com",
      avatar_url: null,
      role: "member",
      invite_status: "pending_approval",
      requested_at: "2024-08-30T10:00:00Z",
      age_hours: 3,
      age_bucket: "new",
    },
    {
      member_id: 302,
      league_id: 2,
      pool_name: "March Madness Bracket Challenge",
      sport_key: "ncaab",
      user_id: "user-88",
      name: "Taylor Reed",
      email: "taylor@example.com",
      avatar_url: null,
      role: "member",
      invite_status: "pending_approval",
      requested_at: "2024-08-28T14:00:00Z",
      age_hours: 49,
      age_bucket: "aging",
    },
    {
      member_id: 303,
      league_id: 2,
      pool_name: "March Madness Bracket Challenge",
      sport_key: "ncaab",
      user_id: "user-93",
      name: "Jordan Banks",
      email: "jordan@example.com",
      avatar_url: null,
      role: "member",
      invite_status: "pending_approval",
      requested_at: "2024-08-25T09:30:00Z",
      age_hours: 122,
      age_bucket: "urgent",
    },
  ];

  return {
    requests,
    pagination: {
      page: 1,
      per_page: 25,
      total: requests.length,
      total_pages: 1,
    },
    summary: {
      total: requests.length,
      new: requests.filter((r) => r.age_bucket === "new").length,
      aging: requests.filter((r) => r.age_bucket === "aging").length,
      urgent: requests.filter((r) => r.age_bucket === "urgent").length,
      by_sport: {
        nfl: requests.filter((r) => r.sport_key === "nfl").length,
        ncaab: requests.filter((r) => r.sport_key === "ncaab").length,
      },
    },
  };
}

// Helper: Check if user is pool admin for this league
async function checkPoolAdmin(
  db: D1Database,
  leagueId: string | number,
  userId: string
): Promise<{ isAdmin: boolean; role: string | null }> {
  const membership = await db.prepare(`
    SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, userId).first<{ role: string }>();

  if (!membership) {
    return { isAdmin: false, role: null };
  }

  const isAdmin = ["owner", "admin"].includes(membership.role);
  return { isAdmin, role: membership.role };
}

// Helper: Mask phone number
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  // Keep only last 4 digits visible: ***-***-1234
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 4) return "***";
  return `***-***-${cleaned.slice(-4)}`;
}

function parseJoinRequirementsFromRules(rulesJson: string | null | undefined): {
  joinApprovalRequired: boolean;
  requireJoinEmail: boolean;
  requireJoinPhone: boolean;
  joinAutoApproveWhenProfileComplete: boolean;
  joinNotifyAdminsOnRequest: boolean;
  joinNotifyUsersOnStatusChange: boolean;
  weeklyRankRecapEnabled: boolean;
  weeklyRankRecapPushEnabled: boolean;
} {
  if (!rulesJson) {
    return {
      joinApprovalRequired: false,
      requireJoinEmail: false,
      requireJoinPhone: false,
      joinAutoApproveWhenProfileComplete: false,
      joinNotifyAdminsOnRequest: true,
      joinNotifyUsersOnStatusChange: true,
      weeklyRankRecapEnabled: true,
      weeklyRankRecapPushEnabled: true,
    };
  }
  try {
    const parsed = JSON.parse(rulesJson) as Record<string, unknown>;
    return {
      joinApprovalRequired: parsed.joinApprovalRequired === true,
      requireJoinEmail: parsed.requireJoinEmail === true,
      requireJoinPhone: parsed.requireJoinPhone === true,
      joinAutoApproveWhenProfileComplete: parsed.joinAutoApproveWhenProfileComplete === true,
      joinNotifyAdminsOnRequest: parsed.joinNotifyAdminsOnRequest !== false,
      joinNotifyUsersOnStatusChange: parsed.joinNotifyUsersOnStatusChange !== false,
      weeklyRankRecapEnabled: parsed.weeklyRankRecapEnabled !== false,
      weeklyRankRecapPushEnabled: parsed.weeklyRankRecapPushEnabled !== false,
    };
  } catch {
    return {
      joinApprovalRequired: false,
      requireJoinEmail: false,
      requireJoinPhone: false,
      joinAutoApproveWhenProfileComplete: false,
      joinNotifyAdminsOnRequest: true,
      joinNotifyUsersOnStatusChange: true,
      weeklyRankRecapEnabled: true,
      weeklyRankRecapPushEnabled: true,
    };
  }
}

function parseCopilotAutomationFromRules(rulesJson: string | null | undefined): {
  morningBriefEnabled: boolean;
  morningBriefHourLocal: number;
  preLockNudgeEnabled: boolean;
  periodWrapEnabled: boolean;
} {
  if (!rulesJson) {
    return {
      morningBriefEnabled: true,
      morningBriefHourLocal: 8,
      preLockNudgeEnabled: true,
      periodWrapEnabled: true,
    };
  }

  try {
    const parsed = JSON.parse(rulesJson) as Record<string, unknown>;
    const rawHour = Number(parsed.copilotMorningBriefHourLocal);
    const normalizedHour = Number.isFinite(rawHour)
      ? Math.max(0, Math.min(23, Math.floor(rawHour)))
      : 8;

    return {
      morningBriefEnabled: parsed.copilotMorningBriefEnabled !== false,
      morningBriefHourLocal: normalizedHour,
      preLockNudgeEnabled: parsed.copilotPreLockNudgeEnabled !== false,
      periodWrapEnabled: parsed.copilotPeriodWrapEnabled !== false,
    };
  } catch {
    return {
      morningBriefEnabled: true,
      morningBriefHourLocal: 8,
      preLockNudgeEnabled: true,
      periodWrapEnabled: true,
    };
  }
}

type ActivationCheckKey =
  | "tie_handling"
  | "missed_picks"
  | "canceled_games"
  | "payout_structure"
  | "weekly_prizes"
  | "multi_entry"
  | "event_map";

type ActivationCheck = {
  key: ActivationCheckKey;
  label: string;
  done: boolean;
  hint?: string;
};

function hasAnyKey(source: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

async function evaluateActivationReadiness(
  db: D1Database,
  leagueId: string | number,
  rulesJson: string | null | undefined,
): Promise<{
  checks: ActivationCheck[];
  missing: ActivationCheck[];
  complete: boolean;
}> {
  const parsedRules = (() => {
    if (!rulesJson) return {} as Record<string, unknown>;
    try {
      const parsed = JSON.parse(rulesJson);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const eventMapRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM pool_event_map
    WHERE pool_id = ?
  `).bind(leagueId).first<{ count: number }>();

  const payoutRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM payout_config
    WHERE league_id = ? AND is_active = 1
  `).bind(leagueId).first<{ count: number }>();

  const hasTieHandling = hasAnyKey(parsedRules, ["tie_handling", "tieHandling", "push_handling", "pushHandling"]);
  const hasMissedPickHandling = hasAnyKey(parsedRules, ["missed_pick_behavior", "missedPickBehavior", "missedPickPolicy"]);
  const hasCanceledGameHandling = hasAnyKey(parsedRules, [
    "canceled_pre_start",
    "canceled_post_start",
    "canceled_void",
    "postponed_handling",
    "canceledGameHandling",
  ]);
  const hasWeeklyPrizeConfig = hasAnyKey(parsedRules, ["weeklyRankRecapEnabled", "weekly_prizes_enabled", "weeklyPayoutsEnabled"]);
  const hasMultiEntryConfig =
    hasAnyKey(parsedRules, ["entry", "entryMode", "allowMultipleEntries", "maxEntriesPerUser", "requiredEntries"]) &&
    (typeof parsedRules.entry !== "object" || parsedRules.entry !== null
      ? true
      : hasAnyKey(parsedRules.entry as Record<string, unknown>, ["mode", "max_entries_per_user", "required_entries", "entry_naming"]));

  const checks: ActivationCheck[] = [
    {
      key: "tie_handling",
      label: "Tie handling configured",
      done: hasTieHandling,
      hint: "Set tie handling in Rule Config before publishing.",
    },
    {
      key: "missed_picks",
      label: "Missed pick behavior configured",
      done: hasMissedPickHandling,
      hint: "Set missed pick behavior in Rule Config before publishing.",
    },
    {
      key: "canceled_games",
      label: "Canceled/postponed game behavior configured",
      done: hasCanceledGameHandling,
      hint: "Set canceled/postponed game behavior in Rule Config before publishing.",
    },
    {
      key: "payout_structure",
      label: "Payout structure configured",
      done: Number(payoutRow?.count || 0) > 0,
      hint: "Configure payouts in the Payouts tab before publishing.",
    },
    {
      key: "weekly_prizes",
      label: "Weekly prize/recap policy configured",
      done: hasWeeklyPrizeConfig,
      hint: "Configure weekly recap/prize policy in Settings before publishing.",
    },
    {
      key: "multi_entry",
      label: "Multi-entry settings configured",
      done: hasMultiEntryConfig,
      hint: "Configure entry mode and limits in Rule Config before publishing.",
    },
    {
      key: "event_map",
      label: "Event eligibility map configured",
      done: Number(eventMapRow?.count || 0) > 0,
      hint: "Set event eligibility map for the current period before publishing.",
    },
  ];

  const missing = checks.filter((check) => !check.done);
  return { checks, missing, complete: missing.length === 0 };
}

async function createInAppNotification(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  body: string,
  url: string,
  metadata?: Record<string, unknown>
) {
  await db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, url, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    type,
    title,
    body,
    url,
    metadata ? JSON.stringify(metadata) : null
  ).run();
}

async function queuePushNotification(
  db: D1Database,
  userId: string,
  notificationType: string,
  title: string,
  body: string,
  url: string,
  leagueId?: number,
) {
  await db.prepare(`
    INSERT INTO scheduled_notifications (
      user_id, league_id, notification_type, title, body, url, scheduled_for, status
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending')
  `).bind(
    userId,
    leagueId ?? null,
    notificationType,
    title,
    body,
    url,
  ).run();
}

// ============ My Pools API ============

// Get all pools the user owns or administers
poolAdminRouter.get("/my-pools", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Return demo data in demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json(getDemoPools());
  }

  const db = c.env.DB;

  // Get all pools where user is owner or admin
  const { results: pools } = await db.prepare(`
    SELECT 
      l.id,
      l.name,
      l.sport_key,
      l.format_key,
      l.entry_fee_cents,
      l.is_payment_required,
      l.is_active,
      l.is_public,
      l.invite_code,
      l.created_at,
      lm.role as user_role,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id AND invite_status = 'joined') as member_count,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id AND invite_status = 'invited') as pending_invites,
      (SELECT COUNT(*) FROM league_members WHERE league_id = l.id AND invite_status = 'pending_approval') as pending_approvals
    FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND lm.role IN ('owner', 'admin') AND lm.invite_status != 'removed'
    ORDER BY l.created_at DESC
  `).bind(user.id).all();

  // Get current period and pick stats for each pool
  const now = new Date().toISOString();
  const poolsWithStats = await Promise.all(pools.map(async (pool) => {
    // Get current period
    const periodResult = await db.prepare(`
      SELECT period_id FROM events 
      WHERE sport_key = ? AND start_at > ?
      ORDER BY start_at ASC LIMIT 1
    `).bind(pool.sport_key, now).first<{ period_id: string }>();
    const currentPeriod = periodResult?.period_id || "Week 1";

    // Get pick stats for current period
    const pickStats = await db.prepare(`
      SELECT 
        (SELECT COUNT(DISTINCT user_id) FROM picks WHERE league_id = ? AND period_id = ?) as members_submitted,
        (SELECT COUNT(*) FROM league_members WHERE league_id = ? AND invite_status = 'joined') as total_members,
        (SELECT COUNT(*) FROM league_members WHERE league_id = ? AND is_payment_verified = 0 AND invite_status = 'joined') as pending_payments
    `).bind(pool.id, currentPeriod, pool.id, pool.id).first<{
      members_submitted: number;
      total_members: number;
      pending_payments: number;
    }>();

    // Determine pool status
    let status: "active" | "upcoming" | "completed" = "active";
    if (!pool.is_active) {
      status = "completed";
    } else {
      // Check if any games have started
      const hasStarted = await db.prepare(`
        SELECT COUNT(*) as count FROM events 
        WHERE sport_key = ? AND status != 'scheduled'
      `).bind(pool.sport_key).first<{ count: number }>();
      if (!hasStarted || hasStarted.count === 0) {
        status = "upcoming";
      }
    }

    return {
      id: pool.id,
      name: pool.name,
      sport_key: pool.sport_key,
      format_key: pool.format_key,
      entry_fee_cents: pool.entry_fee_cents,
      is_payment_required: pool.is_payment_required === 1,
      is_public: pool.is_public === 1,
      invite_code: pool.invite_code,
      user_role: pool.user_role,
      status,
      current_period: currentPeriod,
      member_count: pool.member_count || 0,
      pending_invites: pool.pending_invites || 0,
      pending_approvals: pool.pending_approvals || 0,
      members_submitted: pickStats?.members_submitted || 0,
      pending_payments: pool.is_payment_required === 1 ? (pickStats?.pending_payments || 0) : 0,
      created_at: pool.created_at,
    };
  }));

  // Calculate totals
  const totals = {
    pools: poolsWithStats.length,
    active_pools: poolsWithStats.filter(p => p.status === "active").length,
    total_members: poolsWithStats.reduce((sum, p) => sum + (Number(p.member_count) || 0), 0),
    pending_payments: poolsWithStats.reduce((sum, p) => sum + (Number(p.pending_payments) || 0), 0),
    pending_invites: poolsWithStats.reduce((sum, p) => sum + (Number(p.pending_invites) || 0), 0),
    pending_approvals: poolsWithStats.reduce((sum, p) => sum + (Number((p as Record<string, unknown>).pending_approvals) || 0), 0),
    total_submitted: poolsWithStats.reduce((sum, p) => sum + (Number(p.members_submitted) || 0), 0),
  };

  return c.json({ pools: poolsWithStats, totals });
});

// Cross-pool approval queue for commissioners
poolAdminRouter.get("/approvals/queue", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json(getDemoApprovalQueue());
  }

  const db = c.env.DB;
  const qPage = Number(c.req.query("page") || "1");
  const qPerPage = Number(c.req.query("per_page") || "25");
  const page = Number.isFinite(qPage) && qPage > 0 ? Math.trunc(qPage) : 1;
  const perPage = Math.min(Math.max(Number.isFinite(qPerPage) ? Math.trunc(qPerPage) : 25, 1), 100);
  const offset = (page - 1) * perPage;
  const sport = String(c.req.query("sport") || "all").trim().toLowerCase();
  const status = String(c.req.query("status") || "pending_approval").trim().toLowerCase();
  const ageBucket = String(c.req.query("age_bucket") || "all").trim().toLowerCase();
  const search = String(c.req.query("search") || "").trim().toLowerCase();

  let baseQuery = `
    SELECT
      lm.id as member_id,
      lm.league_id,
      l.name as pool_name,
      l.sport_key,
      lm.user_id,
      lm.role,
      lm.invite_status,
      lm.invited_at,
      lm.created_at as member_created_at,
      u.display_name,
      u.email,
      u.avatar_url
    FROM league_members lm
    JOIN leagues l ON l.id = lm.league_id
    JOIN league_members admin_link ON admin_link.league_id = l.id AND admin_link.user_id = ?
    LEFT JOIN users u ON u.id = lm.user_id
    WHERE admin_link.role IN ('owner', 'admin')
      AND lm.user_id != ?
  `;
  const params: (string | number)[] = [user.id, user.id];

  if (status !== "all") {
    baseQuery += " AND lm.invite_status = ?";
    params.push(status);
  }
  if (sport !== "all") {
    baseQuery += " AND l.sport_key = ?";
    params.push(sport);
  }

  const { results } = await db.prepare(baseQuery).bind(...params).all();
  const nowMs = Date.now();
  const asRows = (results || []).map((row) => {
    const r = row as Record<string, unknown>;
    const requestedAt = String(r.invited_at || r.member_created_at || "");
    const requestedMs = requestedAt ? new Date(requestedAt).getTime() : nowMs;
    const ageHours = Math.max(0, Math.floor((nowMs - requestedMs) / 3600000));
    const bucket = ageHours <= 24 ? "new" : ageHours <= 72 ? "aging" : "urgent";
    return {
      member_id: Number(r.member_id || 0),
      league_id: Number(r.league_id || 0),
      pool_name: String(r.pool_name || ""),
      sport_key: String(r.sport_key || ""),
      user_id: String(r.user_id || ""),
      name: (r.display_name as string | null) || null,
      email: String(r.email || ""),
      avatar_url: (r.avatar_url as string | null) || null,
      role: String(r.role || "member"),
      invite_status: String(r.invite_status || "pending_approval"),
      requested_at: requestedAt || new Date(nowMs).toISOString(),
      age_hours: ageHours,
      age_bucket: bucket,
    };
  });

  let filteredRows = asRows;
  if (ageBucket !== "all") {
    filteredRows = filteredRows.filter((row) => row.age_bucket === ageBucket);
  }
  if (search) {
    filteredRows = filteredRows.filter((row) =>
      (row.name && row.name.toLowerCase().includes(search))
      || row.email.toLowerCase().includes(search)
      || row.pool_name.toLowerCase().includes(search)
    );
  }

  filteredRows.sort((a, b) => b.age_hours - a.age_hours);

  const total = filteredRows.length;
  const paged = filteredRows.slice(offset, offset + perPage);
  const bySport: Record<string, number> = {};
  for (const row of filteredRows) {
    bySport[row.sport_key] = (bySport[row.sport_key] || 0) + 1;
  }

  return c.json({
    requests: paged,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    },
    summary: {
      total,
      new: filteredRows.filter((r) => r.age_bucket === "new").length,
      aging: filteredRows.filter((r) => r.age_bucket === "aging").length,
      urgent: filteredRows.filter((r) => r.age_bucket === "urgent").length,
      by_sport: bySport,
    },
  });
});

// ============ Pool Members API ============

// Get members for a pool with derived fields (spreadsheet-powerful view)
poolAdminRouter.get("/:leagueId/members", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Return demo data in demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json(getDemoMembers());
  }

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  // Check pool admin access
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Query params
  const search = c.req.query("search")?.toLowerCase() || "";
  const inviteStatus = c.req.query("invite_status");
  const pickStatus = c.req.query("pick_status");
  const paymentStatus = c.req.query("payment_status");
  const eligibility = c.req.query("eligibility");
  const memberRole = c.req.query("role");
  const sortBy = c.req.query("sort_by") || "name";
  const sortDir = c.req.query("sort_dir") === "desc" ? "DESC" : "ASC";
  const page = parseInt(c.req.query("page") || "1");
  const perPage = Math.min(parseInt(c.req.query("per_page") || "25"), 100);
  const offset = (page - 1) * perPage;

  // Get league info for current period detection
  const league = await db.prepare(`
    SELECT id, sport_key, format_key, entry_fee_cents, is_payment_required, rules_json
    FROM leagues WHERE id = ?
  `).bind(leagueId).first<{
    id: number;
    sport_key: string;
    format_key: string;
    entry_fee_cents: number;
    is_payment_required: number;
    rules_json: string;
  }>();

  if (!league) {
    return c.json({ error: "Pool not found" }, 404);
  }

  // Detect current period (first upcoming game's period)
  const now = new Date().toISOString();
  const currentPeriodResult = await db.prepare(`
    SELECT period_id FROM events
    WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC LIMIT 1
  `).bind(league.sport_key, now).first<{ period_id: string }>();

  const currentPeriod = currentPeriodResult?.period_id || "Week 1";

  // Get first lock time for current period
  const lockTimeResult = await db.prepare(`
    SELECT MIN(start_at) as first_lock FROM events
    WHERE sport_key = ? AND period_id = ? AND status = 'scheduled'
  `).bind(league.sport_key, currentPeriod).first<{ first_lock: string | null }>();

  const nextLockTime = lockTimeResult?.first_lock || null;

  // Base query for members with derived fields
  let baseQuery = `
    SELECT 
      lm.id as member_id,
      lm.user_id,
      lm.role,
      lm.invite_status,
      lm.is_payment_verified,
      lm.notes,
      lm.invited_at,
      lm.joined_at,
      lm.removed_at,
      lm.last_active_at as member_last_active,
      lm.created_at as member_created_at,
      u.display_name,
      u.email,
      u.phone,
      u.last_active_at as user_last_active,
      u.avatar_url,
      u.notification_email,
      u.notification_sms
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ?
  `;

  const params: (string | number)[] = [leagueId];

  // Apply filters
  if (inviteStatus) {
    baseQuery += ` AND lm.invite_status = ?`;
    params.push(inviteStatus);
  }
  if (memberRole) {
    baseQuery += ` AND lm.role = ?`;
    params.push(memberRole);
  }

  // Get all matching members first (for derived field calculation)
  const { results: allMembers } = await db.prepare(baseQuery).bind(...params).all();

  // Get pick data for current period
  const { results: currentPicks } = await db.prepare(`
    SELECT p.user_id, COUNT(*) as pick_count, MAX(p.created_at) as last_submission
    FROM picks p
    WHERE p.league_id = ? AND p.period_id = ?
    GROUP BY p.user_id
  `).bind(leagueId, currentPeriod).all();

  const picksByUser: Record<string, { count: number; lastSubmission: string }> = {};
  for (const pick of currentPicks) {
    picksByUser[pick.user_id as string] = {
      count: pick.pick_count as number,
      lastSubmission: pick.last_submission as string,
    };
  }

  // Get receipt counts for season
  const { results: seasonReceipts } = await db.prepare(`
    SELECT user_id, COUNT(*) as receipt_count
    FROM pick_receipts
    WHERE league_id = ?
    GROUP BY user_id
  `).bind(leagueId).all();

  const receiptsByUser: Record<string, number> = {};
  for (const r of seasonReceipts) {
    receiptsByUser[r.user_id as string] = r.receipt_count as number;
  }

  // Get receipt counts for current period
  const { results: periodReceipts } = await db.prepare(`
    SELECT user_id, COUNT(*) as receipt_count
    FROM pick_receipts
    WHERE league_id = ? AND period_id = ?
    GROUP BY user_id
  `).bind(leagueId, currentPeriod).all();

  const periodReceiptsByUser: Record<string, number> = {};
  for (const r of periodReceipts) {
    periodReceiptsByUser[r.user_id as string] = r.receipt_count as number;
  }

  // Get payment status from ledger
  const { results: payments } = await db.prepare(`
    SELECT user_id, status
    FROM transaction_ledger
    WHERE league_id = ? AND intent_type = 'entry_fee'
    ORDER BY created_at DESC
  `).bind(leagueId).all();

  const paymentStatusByUser: Record<string, string> = {};
  for (const p of payments) {
    if (!paymentStatusByUser[p.user_id as string]) {
      paymentStatusByUser[p.user_id as string] = p.status as string;
    }
  }

  // Get event count for current period (to determine if locked)
  const eventCountResult = await db.prepare(`
    SELECT COUNT(*) as total, 
           SUM(CASE WHEN status != 'scheduled' OR start_at <= ? THEN 1 ELSE 0 END) as locked
    FROM events
    WHERE sport_key = ? AND period_id = ?
  `).bind(now, league.sport_key, currentPeriod).first<{ total: number; locked: number }>();

  const allLocked = eventCountResult && eventCountResult.total > 0 && 
    eventCountResult.locked === eventCountResult.total;

  // Enrich members with derived fields
  interface EnrichedMember {
    member_id: number;
    user_id: string;
    name: string | null;
    email: string;
    phone_masked: string | null;
    phone_raw: string | null;
    avatar_url: string | null;
    role: string;
    invite_status: string;
    pick_status: "submitted" | "missing" | "locked";
    last_submission: string | null;
    receipt_count_period: number;
    receipt_count_season: number;
    payment_status: "paid" | "unpaid" | "pending";
    eligibility_status: "eligible" | "ineligible";
    last_active: string | null;
    notes: string | null;
    invited_at: string | null;
    joined_at: string | null;
    notification_email: boolean;
    notification_sms: boolean;
    flags: string[];
  }

  const enrichedMembers: EnrichedMember[] = allMembers.map((m) => {
    const userId = m.user_id as string;
    const pickData = picksByUser[userId];
    const hasSubmitted = pickData && pickData.count > 0;
    
    // Determine pick status
    let pickStatusVal: "submitted" | "missing" | "locked";
    if (allLocked) {
      pickStatusVal = hasSubmitted ? "submitted" : "locked";
    } else {
      pickStatusVal = hasSubmitted ? "submitted" : "missing";
    }

    // Payment status
    const ledgerStatus = paymentStatusByUser[userId];
    let paymentStatusVal: "paid" | "unpaid" | "pending";
    if (m.is_payment_verified === 1) {
      paymentStatusVal = "paid";
    } else if (ledgerStatus === "pending" || ledgerStatus === "processing") {
      paymentStatusVal = "pending";
    } else {
      paymentStatusVal = "unpaid";
    }

    // Eligibility (based on payment + picks)
    const isEligible = !league.is_payment_required || paymentStatusVal === "paid";

    // Flags for attention items
    const flags: string[] = [];
    if (paymentStatusVal === "unpaid" && league.is_payment_required) {
      flags.push("unpaid");
    }
    if (pickStatusVal === "missing") {
      flags.push("missing_picks");
    }
    if (m.invite_status === "invited") {
      flags.push("pending_invite");
    }

    return {
      member_id: m.member_id as number,
      user_id: userId,
      name: m.display_name as string | null,
      email: m.email as string || "",
      phone_masked: maskPhone(m.phone as string | null),
      phone_raw: m.phone as string | null,
      avatar_url: m.avatar_url as string | null,
      role: m.role as string,
      invite_status: (m.invite_status as string) || "joined",
      pick_status: pickStatusVal,
      last_submission: pickData?.lastSubmission || null,
      receipt_count_period: periodReceiptsByUser[userId] || 0,
      receipt_count_season: receiptsByUser[userId] || 0,
      payment_status: paymentStatusVal,
      eligibility_status: isEligible ? "eligible" : "ineligible",
      last_active: (m.member_last_active || m.user_last_active) as string | null,
      notes: m.notes as string | null,
      invited_at: m.invited_at as string | null,
      joined_at: (m.joined_at || m.member_created_at) as string | null,
      notification_email: m.notification_email === 1,
      notification_sms: m.notification_sms === 1,
      flags,
    };
  });

  // Apply search filter
  let filtered = enrichedMembers;
  if (search) {
    filtered = filtered.filter((m) => 
      (m.name && m.name.toLowerCase().includes(search)) ||
      m.email.toLowerCase().includes(search) ||
      (m.phone_raw && m.phone_raw.includes(search))
    );
  }

  // Apply status filters
  if (pickStatus) {
    filtered = filtered.filter((m) => m.pick_status === pickStatus);
  }
  if (paymentStatus) {
    filtered = filtered.filter((m) => m.payment_status === paymentStatus);
  }
  if (eligibility) {
    filtered = filtered.filter((m) => m.eligibility_status === eligibility);
  }

  // Sort
  const sortKey = sortBy as keyof EnrichedMember;
  filtered.sort((a, b) => {
    const aVal = a[sortKey] ?? "";
    const bVal = b[sortKey] ?? "";
    if (aVal < bVal) return sortDir === "ASC" ? -1 : 1;
    if (aVal > bVal) return sortDir === "ASC" ? 1 : -1;
    return 0;
  });

  const totalCount = filtered.length;
  const paginatedMembers = filtered.slice(offset, offset + perPage);

  // Strip raw phone from response (use reveal endpoint to get it)
  const members = paginatedMembers.map((m) => {
    const rest = { ...m };
    delete (rest as { phone_raw?: string | null }).phone_raw;
    return rest;
  });

  // Get summary stats
  const stats = {
    total: enrichedMembers.length,
    joined: enrichedMembers.filter((m) => m.invite_status === "joined").length,
    invited: enrichedMembers.filter((m) => m.invite_status === "invited").length,
    submitted: enrichedMembers.filter((m) => m.pick_status === "submitted").length,
    missing_picks: enrichedMembers.filter((m) => m.pick_status === "missing").length,
    paid: enrichedMembers.filter((m) => m.payment_status === "paid").length,
    unpaid: enrichedMembers.filter((m) => m.payment_status === "unpaid").length,
    eligible: enrichedMembers.filter((m) => m.eligibility_status === "eligible").length,
  };

  return c.json({
    members,
    pagination: {
      page,
      per_page: perPage,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / perPage),
    },
    stats,
    context: {
      current_period: currentPeriod,
      next_lock_time: nextLockTime,
      is_payment_required: league.is_payment_required === 1,
      entry_fee_cents: league.entry_fee_cents,
    },
  });
});

// Get/update join requirements (approval + required fields) for a pool
poolAdminRouter.get("/:leagueId/join-requirements", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT id, name, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ id: number; name: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const joinRequirements = parseJoinRequirementsFromRules(league.rules_json);
  return c.json({ league_id: Number(leagueId), ...joinRequirements });
});

poolAdminRouter.patch("/:leagueId/join-requirements", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const joinApprovalRequired = body.joinApprovalRequired === true;
  const requireJoinEmail = body.requireJoinEmail === true;
  const requireJoinPhone = body.requireJoinPhone === true;
  const joinAutoApproveWhenProfileComplete = body.joinAutoApproveWhenProfileComplete === true;
  const joinNotifyAdminsOnRequest = body.joinNotifyAdminsOnRequest !== false;
  const joinNotifyUsersOnStatusChange = body.joinNotifyUsersOnStatusChange !== false;
  const weeklyRankRecapEnabled = body.weeklyRankRecapEnabled !== false;
  const weeklyRankRecapPushEnabled = body.weeklyRankRecapPushEnabled !== false;

  const league = await db.prepare(`
    SELECT id, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ id: number; rules_json: string | null }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  let existingRules: Record<string, unknown> = {};
  if (league.rules_json) {
    try {
      existingRules = JSON.parse(league.rules_json) as Record<string, unknown>;
    } catch {
      existingRules = {};
    }
  }

  const updatedRules = {
    ...existingRules,
    joinApprovalRequired,
    requireJoinEmail,
    requireJoinPhone,
    joinAutoApproveWhenProfileComplete,
    joinNotifyAdminsOnRequest,
    joinNotifyUsersOnStatusChange,
    weeklyRankRecapEnabled,
    weeklyRankRecapPushEnabled,
  };

  await db.prepare(`
    UPDATE leagues
    SET rules_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(JSON.stringify(updatedRules), leagueId).run();

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "join_requirements_updated",
    summary: "Updated join approval/contact requirements",
    detailsJson: {
      league_id: leagueId,
      joinApprovalRequired,
      requireJoinEmail,
      requireJoinPhone,
      joinAutoApproveWhenProfileComplete,
      joinNotifyAdminsOnRequest,
      joinNotifyUsersOnStatusChange,
      weeklyRankRecapEnabled,
      weeklyRankRecapPushEnabled,
    },
  });

  return c.json({
    success: true,
    league_id: Number(leagueId),
    joinApprovalRequired,
    requireJoinEmail,
    requireJoinPhone,
    joinAutoApproveWhenProfileComplete,
    joinNotifyAdminsOnRequest,
    joinNotifyUsersOnStatusChange,
    weeklyRankRecapEnabled,
    weeklyRankRecapPushEnabled,
  });
});

// Coach G Copilot: pool health summary for commissioner command center
poolAdminRouter.get("/:leagueId/copilot/summary", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (isDemoMode) {
    return c.json({
      league_id: Number(leagueId),
      league_name: "Office NFL Survivor 2024",
      current_period: "Week 2",
      next_lock_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      urgency: "critical",
      coach_message: "You have members missing picks before lock. Send reminders now and clear pending approvals.",
      stats: {
        joined_members: 12,
        missing_picks: 4,
        unpaid_members: 2,
        payment_pending_members: 1,
        pending_invites: 3,
        pending_approvals: 2,
      },
      flags: {
        joinApprovalRequired: true,
        requireJoinEmail: true,
        requireJoinPhone: false,
        weeklyRankRecapEnabled: true,
        weeklyRankRecapPushEnabled: true,
        listedInMarketplace: false,
      },
      checklist: [
        { id: "missing-picks", label: "Send missing-pick reminders", status: "todo" },
        { id: "pending-approvals", label: "Review pending join approvals", status: "todo" },
        { id: "unpaid-members", label: "Follow up unpaid members", status: "todo" },
      ],
      suggestions: [
        {
          action: "remind_missing_picks",
          title: "Send missing-pick reminders",
          reason: "Members are missing picks before lock and may lose eligibility.",
          confidence: "high",
          impact: "high",
        },
        {
          action: "approve_all_pending",
          title: "Approve pending join requests",
          reason: "Pending approvals are blocking member onboarding.",
          confidence: "high",
          impact: "medium",
        },
        {
          action: "remind_unpaid_members",
          title: "Remind unpaid members",
          reason: "Unpaid entries can create scoring and payout friction.",
          confidence: "medium",
          impact: "medium",
        },
      ],
    });
  }

  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT id, name, sport_key, is_payment_required, rules_json
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{
    id: number;
    name: string;
    sport_key: string;
    is_payment_required: number;
    rules_json: string | null;
  }>();

  if (!league) return c.json({ error: "Pool not found" }, 404);

  const now = new Date().toISOString();
  const currentPeriodRow = await db.prepare(`
    SELECT period_id
    FROM events
    WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC
    LIMIT 1
  `).bind(league.sport_key, now).first<{ period_id: string }>();
  const currentPeriod = currentPeriodRow?.period_id || "Current";

  const nextLockRow = await db.prepare(`
    SELECT MIN(start_at) AS first_lock
    FROM events
    WHERE sport_key = ? AND period_id = ? AND status = 'scheduled'
  `).bind(league.sport_key, currentPeriod).first<{ first_lock: string | null }>();
  const nextLockTime = nextLockRow?.first_lock || null;

  const joinedRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM league_members
    WHERE league_id = ? AND invite_status = 'joined'
  `).bind(leagueId).first<{ count: number }>();
  const joinedMembers = Number(joinedRow?.count || 0);

  const pendingInvitesRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM league_members
    WHERE league_id = ? AND invite_status = 'invited'
  `).bind(leagueId).first<{ count: number }>();
  const pendingInvites = Number(pendingInvitesRow?.count || 0);

  const pendingApprovalsRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM league_members
    WHERE league_id = ? AND invite_status = 'pending_approval'
  `).bind(leagueId).first<{ count: number }>();
  const pendingApprovals = Number(pendingApprovalsRow?.count || 0);

  const missingPicksRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM league_members lm
    LEFT JOIN (
      SELECT DISTINCT user_id
      FROM picks
      WHERE league_id = ? AND period_id = ?
    ) p ON p.user_id = lm.user_id
    WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
  `).bind(leagueId, currentPeriod, leagueId).first<{ count: number }>();
  const missingPicks = Number(missingPicksRow?.count || 0);

  let unpaidMembers = 0;
  let paymentPendingMembers = 0;
  if (league.is_payment_required === 1) {
    const { results: paymentRows } = await db.prepare(`
      SELECT
        lm.user_id,
        lm.is_payment_verified,
        (
          SELECT tl.status
          FROM transaction_ledger tl
          WHERE tl.league_id = lm.league_id
            AND CAST(tl.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
            AND tl.intent_type = 'entry_fee'
          ORDER BY tl.created_at DESC
          LIMIT 1
        ) AS ledger_status
      FROM league_members lm
      WHERE lm.league_id = ? AND lm.invite_status = 'joined'
    `).bind(leagueId).all();

    for (const row of (paymentRows || []) as Array<Record<string, unknown>>) {
      if (Number(row.is_payment_verified || 0) === 1) continue;
      const ledgerStatus = String(row.ledger_status || "");
      if (ledgerStatus === "pending" || ledgerStatus === "processing") {
        paymentPendingMembers += 1;
      } else {
        unpaidMembers += 1;
      }
    }
  }

  const listingRow = await db.prepare(`
    SELECT listing_status
    FROM pool_marketplace_listings
    WHERE league_id = ?
    LIMIT 1
  `).bind(leagueId).first<{ listing_status: string | null }>();
  const listedInMarketplace = listingRow?.listing_status === "listed";

  const joinRules = parseJoinRequirementsFromRules(league.rules_json);

  const hoursToLock = nextLockTime
    ? Math.max(0, (new Date(nextLockTime).getTime() - Date.now()) / 3600000)
    : null;
  const urgency: "critical" | "attention" | "healthy" =
    (missingPicks > 0 && hoursToLock !== null && hoursToLock <= 12) ||
    pendingApprovals > 0 ||
    unpaidMembers > 0
      ? "critical"
      : (missingPicks > 0 || pendingInvites > 0 || paymentPendingMembers > 0)
      ? "attention"
      : "healthy";

  const coachMessage =
    urgency === "critical"
      ? "High-priority admin tasks detected. Resolve approvals/unpaid members and send pick reminders before lock."
      : urgency === "attention"
      ? "Pool health is decent, but a few member actions still need follow-up."
      : "Pool operations look healthy. Keep weekly recaps and reminders consistent.";

  const checklist = [
    { id: "missing-picks", label: "Send missing-pick reminders", status: missingPicks > 0 ? "todo" : "done" },
    { id: "pending-approvals", label: "Resolve pending join approvals", status: pendingApprovals > 0 ? "todo" : "done" },
    { id: "unpaid-members", label: "Follow up unpaid members", status: unpaidMembers > 0 ? "todo" : "done" },
    { id: "weekly-recap", label: "Confirm weekly recap notifications", status: joinRules.weeklyRankRecapEnabled ? "done" : "todo" },
  ];

  const suggestions: Array<{
    action: "remind_missing_picks" | "remind_unpaid_members" | "approve_all_pending";
    title: string;
    reason: string;
    confidence: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
  }> = [];

  if (missingPicks > 0) {
    suggestions.push({
      action: "remind_missing_picks",
      title: "Send missing-pick reminders",
      reason: `Coach G detected ${missingPicks} member${missingPicks === 1 ? "" : "s"} without picks in ${currentPeriod}.`,
      confidence: nextLockTime ? "high" : "medium",
      impact: missingPicks >= 3 ? "high" : "medium",
    });
  }

  if (pendingApprovals > 0) {
    suggestions.push({
      action: "approve_all_pending",
      title: "Approve pending join requests",
      reason: `${pendingApprovals} request${pendingApprovals === 1 ? "" : "s"} are waiting for commissioner approval.`,
      confidence: "high",
      impact: pendingApprovals >= 3 ? "high" : "medium",
    });
  }

  if (unpaidMembers > 0) {
    suggestions.push({
      action: "remind_unpaid_members",
      title: "Remind unpaid members",
      reason: `${unpaidMembers} joined member${unpaidMembers === 1 ? "" : "s"} are still unpaid.`,
      confidence: "medium",
      impact: unpaidMembers >= 3 ? "high" : "medium",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      action: "remind_missing_picks",
      title: "Keep proactive reminders active",
      reason: "Pool health is stable; proactive reminders help keep submission rates high.",
      confidence: "low",
      impact: "low",
    });
  }

  return c.json({
    league_id: Number(leagueId),
    league_name: league.name,
    current_period: currentPeriod,
    next_lock_time: nextLockTime,
    urgency,
    coach_message: coachMessage,
    stats: {
      joined_members: joinedMembers,
      missing_picks: missingPicks,
      unpaid_members: unpaidMembers,
      payment_pending_members: paymentPendingMembers,
      pending_invites: pendingInvites,
      pending_approvals: pendingApprovals,
    },
    flags: {
      joinApprovalRequired: joinRules.joinApprovalRequired,
      requireJoinEmail: joinRules.requireJoinEmail,
      requireJoinPhone: joinRules.requireJoinPhone,
      weeklyRankRecapEnabled: joinRules.weeklyRankRecapEnabled,
      weeklyRankRecapPushEnabled: joinRules.weeklyRankRecapPushEnabled,
      listedInMarketplace,
    },
    checklist,
    suggestions,
  });
});

// Coach G Copilot: one-click commissioner actions
poolAdminRouter.post("/:leagueId/copilot/action", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  const body = await c.req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const confirm = body.confirm === true;

  const validActions = new Set([
    "remind_missing_picks",
    "remind_unpaid_members",
    "approve_all_pending",
  ]);
  if (!validActions.has(action)) {
    return c.json({ error: "Unsupported copilot action" }, 400);
  }
  if (!confirm) {
    return c.json({
      error: "Confirmation required for copilot action",
      requires_confirmation: true,
    }, 400);
  }

  if (isDemoMode) {
    const simulatedCounts: Record<string, number> = {
      remind_missing_picks: 4,
      remind_unpaid_members: 2,
      approve_all_pending: 2,
    };
    return c.json({
      success: true,
      action,
      affected_count: simulatedCounts[action] || 0,
      message: "Coach G demo action completed.",
    });
  }

  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT id, name, sport_key, is_payment_required, rules_json
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{
    id: number;
    name: string;
    sport_key: string;
    is_payment_required: number;
    rules_json: string | null;
  }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const nowIso = new Date().toISOString();
  let affectedCount = 0;
  let message = "No action taken.";

  if (action === "remind_missing_picks") {
    const currentPeriodRow = await db.prepare(`
      SELECT period_id
      FROM events
      WHERE sport_key = ? AND start_at > ?
      ORDER BY start_at ASC
      LIMIT 1
    `).bind(league.sport_key, nowIso).first<{ period_id: string }>();
    const currentPeriod = currentPeriodRow?.period_id || "Current";

    const { results } = await db.prepare(`
      SELECT lm.user_id
      FROM league_members lm
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM picks
        WHERE league_id = ? AND period_id = ?
      ) p ON p.user_id = lm.user_id
      WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
    `).bind(leagueId, currentPeriod, leagueId).all();

    for (const row of (results || []) as Array<Record<string, unknown>>) {
      const targetUserId = String(row.user_id || "");
      if (!targetUserId) continue;
      await createInAppNotification(
        db,
        targetUserId,
        "pool_activity",
        "⏰ Pick reminder from Coach G",
        `${league.name}: your picks for ${currentPeriod} are still missing. Submit before lock.`,
        `/pools/${leagueId}`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_copilot",
        },
      );
      affectedCount += 1;
    }
    message = affectedCount > 0
      ? `Sent missing-pick reminders to ${affectedCount} member${affectedCount === 1 ? "" : "s"}.`
      : "No missing-pick reminders were needed.";
  }

  if (action === "remind_unpaid_members") {
    const { results } = await db.prepare(`
      SELECT lm.user_id
      FROM league_members lm
      WHERE lm.league_id = ?
        AND lm.invite_status = 'joined'
        AND COALESCE(lm.is_payment_verified, 0) = 0
    `).bind(leagueId).all();

    for (const row of (results || []) as Array<Record<string, unknown>>) {
      const targetUserId = String(row.user_id || "");
      if (!targetUserId) continue;
      await createInAppNotification(
        db,
        targetUserId,
        "pool_activity",
        "💳 Payment reminder from Coach G",
        `${league.name}: your entry payment is still pending. Complete payment to stay eligible.`,
        `/pools/${leagueId}`,
        {
          league_id: Number(leagueId),
          source: "coachg_copilot",
          reminder_type: "unpaid_entry",
        },
      );
      affectedCount += 1;
    }
    message = affectedCount > 0
      ? `Sent unpaid reminders to ${affectedCount} member${affectedCount === 1 ? "" : "s"}.`
      : "No unpaid reminders were needed.";
  }

  if (action === "approve_all_pending") {
    const joinRules = parseJoinRequirementsFromRules(league.rules_json);
    const { results } = await db.prepare(`
      SELECT id, user_id
      FROM league_members
      WHERE league_id = ? AND invite_status = 'pending_approval'
    `).bind(leagueId).all();

    for (const row of (results || []) as Array<Record<string, unknown>>) {
      const memberId = Number(row.id || 0);
      const targetUserId = String(row.user_id || "");
      if (!memberId || !targetUserId) continue;
      await db.prepare(`
        UPDATE league_members
        SET invite_status = 'joined', joined_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(nowIso, memberId).run();
      if (joinRules.joinNotifyUsersOnStatusChange) {
        await createInAppNotification(
          db,
          targetUserId,
          "league_invite",
          "Join request approved",
          `Your request to join ${league.name} has been approved by a commissioner.`,
          `/pools/${leagueId}`,
          { league_id: Number(leagueId), status: "approved", source: "coachg_copilot" },
        );
      }
      affectedCount += 1;
    }
    message = affectedCount > 0
      ? `Approved ${affectedCount} pending join request${affectedCount === 1 ? "" : "s"}.`
      : "No pending join requests to approve.";
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "coachg_copilot_action",
    summary: `Coach G copilot action executed: ${action}`,
    detailsJson: {
      league_id: Number(leagueId),
      action,
      affected_count: affectedCount,
    },
  });

  return c.json({
    success: true,
    action,
    affected_count: affectedCount,
    message,
  });
});

// Coach G Copilot: intent-aware admin chat with structured action plan
poolAdminRouter.post("/:leagueId/copilot/chat", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  const body = await c.req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return c.json({ error: "Message is required" }, 400);
  }

  type CopilotState = {
    leagueName: string;
    currentPeriod: string;
    nextLockTime: string | null;
    missingPicks: number;
    unpaidMembers: number;
    pendingApprovals: number;
    pendingInvites: number;
    joinApprovalRequired: boolean;
    weeklyRankRecapEnabled: boolean;
    listedInMarketplace: boolean;
  };

  let state: CopilotState;

  if (isDemoMode) {
    state = {
      leagueName: "Office NFL Survivor 2024",
      currentPeriod: "Week 2",
      nextLockTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      missingPicks: 4,
      unpaidMembers: 2,
      pendingApprovals: 2,
      pendingInvites: 3,
      joinApprovalRequired: true,
      weeklyRankRecapEnabled: true,
      listedInMarketplace: false,
    };
  } else {
    const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
    if (!isAdmin) {
      return c.json({ error: "Pool admin access required" }, 403);
    }

    const league = await db.prepare(`
      SELECT id, name, sport_key, is_payment_required, rules_json
      FROM leagues
      WHERE id = ?
    `).bind(leagueId).first<{
      id: number;
      name: string;
      sport_key: string;
      is_payment_required: number;
      rules_json: string | null;
    }>();
    if (!league) return c.json({ error: "Pool not found" }, 404);

    const now = new Date().toISOString();
    const currentPeriodRow = await db.prepare(`
      SELECT period_id
      FROM events
      WHERE sport_key = ? AND start_at > ?
      ORDER BY start_at ASC
      LIMIT 1
    `).bind(league.sport_key, now).first<{ period_id: string }>();
    const currentPeriod = currentPeriodRow?.period_id || "Current";

    const nextLockRow = await db.prepare(`
      SELECT MIN(start_at) AS first_lock
      FROM events
      WHERE sport_key = ? AND period_id = ? AND status = 'scheduled'
    `).bind(league.sport_key, currentPeriod).first<{ first_lock: string | null }>();
    const nextLockTime = nextLockRow?.first_lock || null;

    const pendingInvitesRow = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM league_members
      WHERE league_id = ? AND invite_status = 'invited'
    `).bind(leagueId).first<{ count: number }>();
    const pendingInvites = Number(pendingInvitesRow?.count || 0);

    const pendingApprovalsRow = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM league_members
      WHERE league_id = ? AND invite_status = 'pending_approval'
    `).bind(leagueId).first<{ count: number }>();
    const pendingApprovals = Number(pendingApprovalsRow?.count || 0);

    const missingPicksRow = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM league_members lm
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM picks
        WHERE league_id = ? AND period_id = ?
      ) p ON p.user_id = lm.user_id
      WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
    `).bind(leagueId, currentPeriod, leagueId).first<{ count: number }>();
    const missingPicks = Number(missingPicksRow?.count || 0);

    let unpaidMembers = 0;
    if (league.is_payment_required === 1) {
      const { results: paymentRows } = await db.prepare(`
        SELECT
          lm.user_id,
          lm.is_payment_verified,
          (
            SELECT tl.status
            FROM transaction_ledger tl
            WHERE tl.league_id = lm.league_id
              AND CAST(tl.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
              AND tl.intent_type = 'entry_fee'
            ORDER BY tl.created_at DESC
            LIMIT 1
          ) AS ledger_status
        FROM league_members lm
        WHERE lm.league_id = ? AND lm.invite_status = 'joined'
      `).bind(leagueId).all();

      for (const row of (paymentRows || []) as Array<Record<string, unknown>>) {
        if (Number(row.is_payment_verified || 0) === 1) continue;
        const ledgerStatus = String(row.ledger_status || "");
        if (ledgerStatus !== "pending" && ledgerStatus !== "processing") {
          unpaidMembers += 1;
        }
      }
    }

    const listingRow = await db.prepare(`
      SELECT listing_status
      FROM pool_marketplace_listings
      WHERE league_id = ?
      LIMIT 1
    `).bind(leagueId).first<{ listing_status: string | null }>();
    const listedInMarketplace = listingRow?.listing_status === "listed";
    const joinRules = parseJoinRequirementsFromRules(league.rules_json);

    state = {
      leagueName: league.name,
      currentPeriod,
      nextLockTime,
      missingPicks,
      unpaidMembers,
      pendingApprovals,
      pendingInvites,
      joinApprovalRequired: joinRules.joinApprovalRequired,
      weeklyRankRecapEnabled: joinRules.weeklyRankRecapEnabled,
      listedInMarketplace,
    };
  }

  const text = message.toLowerCase();
  const asksMissing = /missing|no picks|didn'?t pick|not submitted|submission/.test(text);
  const asksUnpaid = /unpaid|payment|paid|entry fee/.test(text);
  const asksApprovals = /approve|approval|pending request|join request/.test(text);
  const asksLock = /lock|deadline|before lock|countdown/.test(text);
  const asksMarketplace = /marketplace|listed|listing|public pool/.test(text);
  const asksRecap = /recap|weekly|notification|push/.test(text);
  const asksPlan = /plan|what should i do|next steps|checklist|run down|todo/.test(text);

  const actionPlan: string[] = [];
  const suggestedActions: Array<{
    action: "remind_missing_picks" | "remind_unpaid_members" | "approve_all_pending";
    title: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  }> = [];

  if (asksMissing || asksPlan || (!asksUnpaid && !asksApprovals && !asksLock && !asksMarketplace && !asksRecap)) {
    if (state.missingPicks > 0) {
      actionPlan.push(`${state.missingPicks} member(s) still missing picks for ${state.currentPeriod}.`);
      suggestedActions.push({
        action: "remind_missing_picks",
        title: "Run missing-pick reminders",
        reason: "Missing picks can cause lock misses and scoring disputes.",
        confidence: "high",
      });
    } else {
      actionPlan.push(`No missing picks detected for ${state.currentPeriod}.`);
    }
  }

  if (asksUnpaid || asksPlan) {
    if (state.unpaidMembers > 0) {
      actionPlan.push(`${state.unpaidMembers} member(s) are unpaid and may be ineligible.`);
      suggestedActions.push({
        action: "remind_unpaid_members",
        title: "Run unpaid reminders",
        reason: "Unpaid members can block clean payouts and eligibility rules.",
        confidence: "medium",
      });
    } else {
      actionPlan.push("No unpaid members detected right now.");
    }
  }

  if (asksApprovals || asksPlan) {
    if (state.pendingApprovals > 0) {
      actionPlan.push(`${state.pendingApprovals} join request(s) are waiting for commissioner approval.`);
      suggestedActions.push({
        action: "approve_all_pending",
        title: "Approve pending join requests",
        reason: "Pending requests delay member onboarding and engagement.",
        confidence: "high",
      });
    } else {
      actionPlan.push("No pending join approvals at the moment.");
    }
  }

  if (asksLock || asksPlan) {
    actionPlan.push(
      state.nextLockTime
        ? `Next lock is ${new Date(state.nextLockTime).toLocaleString()}. Prioritize reminders before lock.`
        : "No upcoming lock time found. Check event mapping for this pool."
    );
  }

  if (asksMarketplace || asksPlan) {
    actionPlan.push(
      state.listedInMarketplace
        ? "Pool is currently listed in marketplace."
        : "Pool is hidden from marketplace; publish when contest details are finalized."
    );
  }

  if (asksRecap || asksPlan) {
    actionPlan.push(
      state.weeklyRankRecapEnabled
        ? "Weekly recap notifications are enabled."
        : "Weekly recap notifications are disabled; turn on to improve engagement."
    );
  }

  if (!actionPlan.length) {
    actionPlan.push("Pool health snapshot is stable. I can run a focused plan for missing picks, payments, or approvals.");
  }

  // De-duplicate actions by action key
  const dedupedActions = suggestedActions.filter((item, idx, arr) => arr.findIndex((x) => x.action === item.action) === idx);

  const response = [
    `Commissioner briefing for ${state.leagueName}:`,
    ...actionPlan.map((line) => `- ${line}`),
    dedupedActions.length
      ? "Use the run buttons below to execute with confirmation."
      : "No immediate one-click actions needed from this request.",
  ].join("\n");

  return c.json({
    response,
    action_plan: actionPlan,
    suggested_actions: dedupedActions,
    context: {
      league_name: state.leagueName,
      current_period: state.currentPeriod,
      next_lock_time: state.nextLockTime,
      missing_picks: state.missingPicks,
      unpaid_members: state.unpaidMembers,
      pending_approvals: state.pendingApprovals,
      pending_invites: state.pendingInvites,
      join_approval_required: state.joinApprovalRequired,
      weekly_rank_recap_enabled: state.weeklyRankRecapEnabled,
      listed_in_marketplace: state.listedInMarketplace,
    },
  });
});

// Coach G Copilot: automation settings for daily briefing / nudges / wraps
poolAdminRouter.get("/:leagueId/copilot/automation", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (isDemoMode) {
    return c.json({
      league_id: Number(leagueId),
      morningBriefEnabled: true,
      morningBriefHourLocal: 8,
      preLockNudgeEnabled: true,
      periodWrapEnabled: true,
    });
  }

  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT rules_json
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{ rules_json: string | null }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const settings = parseCopilotAutomationFromRules(league.rules_json);
  return c.json({
    league_id: Number(leagueId),
    ...settings,
  });
});

poolAdminRouter.patch("/:leagueId/copilot/automation", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  const body = await c.req.json().catch(() => ({}));

  const morningBriefEnabled = body.morningBriefEnabled !== false;
  const preLockNudgeEnabled = body.preLockNudgeEnabled !== false;
  const periodWrapEnabled = body.periodWrapEnabled !== false;
  const parsedHour = Number(body.morningBriefHourLocal);
  const morningBriefHourLocal = Number.isFinite(parsedHour)
    ? Math.max(0, Math.min(23, Math.floor(parsedHour)))
    : 8;

  if (isDemoMode) {
    return c.json({
      success: true,
      league_id: Number(leagueId),
      morningBriefEnabled,
      morningBriefHourLocal,
      preLockNudgeEnabled,
      periodWrapEnabled,
    });
  }

  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT id, rules_json
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{ id: number; rules_json: string | null }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  let existingRules: Record<string, unknown> = {};
  if (league.rules_json) {
    try {
      existingRules = JSON.parse(league.rules_json) as Record<string, unknown>;
    } catch {
      existingRules = {};
    }
  }

  const nextRules = {
    ...existingRules,
    copilotMorningBriefEnabled: morningBriefEnabled,
    copilotMorningBriefHourLocal: morningBriefHourLocal,
    copilotPreLockNudgeEnabled: preLockNudgeEnabled,
    copilotPeriodWrapEnabled: periodWrapEnabled,
  };

  await db.prepare(`
    UPDATE leagues
    SET rules_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(JSON.stringify(nextRules), leagueId).run();

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "coachg_copilot_automation_updated",
    summary: "Updated Coach G Copilot automation settings",
    detailsJson: {
      league_id: Number(leagueId),
      morningBriefEnabled,
      morningBriefHourLocal,
      preLockNudgeEnabled,
      periodWrapEnabled,
    },
  });

  return c.json({
    success: true,
    league_id: Number(leagueId),
    morningBriefEnabled,
    morningBriefHourLocal,
    preLockNudgeEnabled,
    periodWrapEnabled,
  });
});

// Coach G Copilot: test-run automation broadcasts
poolAdminRouter.post("/:leagueId/copilot/automation/test", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  const body = await c.req.json().catch(() => ({}));
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const selfOnly = body.selfOnly === true;

  if (!["morning", "prelock", "wrap"].includes(type)) {
    return c.json({ error: "Invalid automation test type" }, 400);
  }

  if (isDemoMode) {
    const demoCounts: Record<string, number> = {
      morning: selfOnly ? 1 : 2,
      prelock: selfOnly ? 1 : 4,
      wrap: selfOnly ? 1 : 8,
    };
    return c.json({
      success: true,
      type,
      self_only: selfOnly,
      sent_count: demoCounts[type] || 0,
      message: "Coach G automation demo broadcast completed.",
    });
  }

  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT id, name, sport_key, is_payment_required
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{
    id: number;
    name: string;
    sport_key: string;
    is_payment_required: number;
  }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const now = new Date().toISOString();
  const currentPeriodRow = await db.prepare(`
    SELECT period_id
    FROM events
    WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC
    LIMIT 1
  `).bind(league.sport_key, now).first<{ period_id: string }>();
  const currentPeriod = currentPeriodRow?.period_id || "Current";

  let recipients: string[] = [];
  let sentCount = 0;

  if (type === "morning") {
    const { results } = await db.prepare(`
      SELECT DISTINCT user_id
      FROM league_members
      WHERE league_id = ? AND role IN ('owner', 'admin') AND invite_status = 'joined'
    `).bind(leagueId).all();
    recipients = (results || []).map((r) => String((r as Record<string, unknown>).user_id || "")).filter(Boolean);
    if (selfOnly) recipients = recipients.filter((id) => id === user.id);

    const missingPicksRow = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM league_members lm
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM picks
        WHERE league_id = ? AND period_id = ?
      ) p ON p.user_id = lm.user_id
      WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
    `).bind(leagueId, currentPeriod, leagueId).first<{ count: number }>();
    const missingPicks = Number(missingPicksRow?.count || 0);

    for (const userId of recipients) {
      await createInAppNotification(
        db,
        userId,
        "pool_activity",
        "☀️ Coach G Morning Briefing",
        `${league.name}: ${missingPicks} member(s) are missing picks for ${currentPeriod}.`,
        `/pool-admin/members?pool=${leagueId}`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_automation_morning",
        },
      );
      sentCount += 1;
    }
  }

  if (type === "prelock") {
    const { results: missingRows } = await db.prepare(`
      SELECT lm.user_id
      FROM league_members lm
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM picks
        WHERE league_id = ? AND period_id = ?
      ) p ON p.user_id = lm.user_id
      WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
    `).bind(leagueId, currentPeriod, leagueId).all();

    const target = new Set(
      (missingRows || [])
        .map((r) => String((r as Record<string, unknown>).user_id || ""))
        .filter(Boolean),
    );

    if (league.is_payment_required === 1) {
      const { results: unpaidRows } = await db.prepare(`
        SELECT user_id
        FROM league_members
        WHERE league_id = ? AND invite_status = 'joined' AND COALESCE(is_payment_verified, 0) = 0
      `).bind(leagueId).all();
      for (const row of unpaidRows || []) {
        const userId = String((row as Record<string, unknown>).user_id || "");
        if (userId) target.add(userId);
      }
    }

    recipients = Array.from(target);
    if (selfOnly) recipients = recipients.filter((id) => id === user.id);

    for (const userId of recipients) {
      await createInAppNotification(
        db,
        userId,
        "pool_activity",
        "🚨 Coach G Pre-Lock Alert",
        `${league.name}: finalize your picks/payment before ${currentPeriod} lock.`,
        `/pools/${leagueId}`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_automation_prelock",
        },
      );
      sentCount += 1;
    }
  }

  if (type === "wrap") {
    const { results } = await db.prepare(`
      SELECT user_id
      FROM league_members
      WHERE league_id = ? AND invite_status = 'joined'
    `).bind(leagueId).all();
    recipients = (results || []).map((r) => String((r as Record<string, unknown>).user_id || "")).filter(Boolean);
    if (selfOnly) recipients = recipients.filter((id) => id === user.id);

    for (const userId of recipients) {
      await createInAppNotification(
        db,
        userId,
        "weekly_results",
        "🏁 Coach G Period Wrap",
        `${league.name}: period wrap is ready. Check standings and trend updates.`,
        `/leagues/${leagueId}/standings`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_automation_wrap",
        },
      );
      sentCount += 1;
    }
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "coachg_copilot_automation_test",
    summary: `Ran Coach G automation test: ${type}`,
    detailsJson: {
      league_id: Number(leagueId),
      type,
      self_only: selfOnly,
      sent_count: sentCount,
    },
  });

  return c.json({
    success: true,
    type,
    self_only: selfOnly,
    sent_count: sentCount,
    message: "Coach G automation broadcast completed.",
  });
});

// Coach G Copilot: run automation dispatch now for full audience
poolAdminRouter.post("/:leagueId/copilot/automation/dispatch", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  const body = await c.req.json().catch(() => ({}));
  const type = typeof body.type === "string" ? body.type.trim() : "";

  if (!["morning", "prelock", "wrap"].includes(type)) {
    return c.json({ error: "Invalid automation dispatch type" }, 400);
  }

  if (isDemoMode) {
    const demoCounts: Record<string, number> = {
      morning: 2,
      prelock: 4,
      wrap: 8,
    };
    return c.json({
      success: true,
      type,
      sent_count: demoCounts[type] || 0,
      message: "Coach G automation dispatch completed (demo).",
    });
  }

  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT id, name, sport_key, is_payment_required
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{
    id: number;
    name: string;
    sport_key: string;
    is_payment_required: number;
  }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const now = new Date().toISOString();
  const currentPeriodRow = await db.prepare(`
    SELECT period_id
    FROM events
    WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC
    LIMIT 1
  `).bind(league.sport_key, now).first<{ period_id: string }>();
  const currentPeriod = currentPeriodRow?.period_id || "Current";

  let recipients: string[] = [];
  let sentCount = 0;

  if (type === "morning") {
    const { results } = await db.prepare(`
      SELECT DISTINCT user_id
      FROM league_members
      WHERE league_id = ? AND role IN ('owner', 'admin') AND invite_status = 'joined'
    `).bind(leagueId).all();
    recipients = (results || []).map((r) => String((r as Record<string, unknown>).user_id || "")).filter(Boolean);

    const missingPicksRow = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM league_members lm
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM picks
        WHERE league_id = ? AND period_id = ?
      ) p ON p.user_id = lm.user_id
      WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
    `).bind(leagueId, currentPeriod, leagueId).first<{ count: number }>();
    const missingPicks = Number(missingPicksRow?.count || 0);

    for (const userId of recipients) {
      await createInAppNotification(
        db,
        userId,
        "pool_activity",
        "☀️ Coach G Morning Briefing",
        `${league.name}: ${missingPicks} member(s) are missing picks for ${currentPeriod}.`,
        `/pool-admin/members?pool=${leagueId}`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_automation_morning_dispatch",
        },
      );
      sentCount += 1;
    }
  }

  if (type === "prelock") {
    const { results: missingRows } = await db.prepare(`
      SELECT lm.user_id
      FROM league_members lm
      LEFT JOIN (
        SELECT DISTINCT user_id
        FROM picks
        WHERE league_id = ? AND period_id = ?
      ) p ON p.user_id = lm.user_id
      WHERE lm.league_id = ? AND lm.invite_status = 'joined' AND p.user_id IS NULL
    `).bind(leagueId, currentPeriod, leagueId).all();

    const target = new Set(
      (missingRows || [])
        .map((r) => String((r as Record<string, unknown>).user_id || ""))
        .filter(Boolean),
    );

    if (league.is_payment_required === 1) {
      const { results: unpaidRows } = await db.prepare(`
        SELECT user_id
        FROM league_members
        WHERE league_id = ? AND invite_status = 'joined' AND COALESCE(is_payment_verified, 0) = 0
      `).bind(leagueId).all();
      for (const row of unpaidRows || []) {
        const userId = String((row as Record<string, unknown>).user_id || "");
        if (userId) target.add(userId);
      }
    }

    recipients = Array.from(target);

    for (const userId of recipients) {
      await createInAppNotification(
        db,
        userId,
        "pool_activity",
        "🚨 Coach G Pre-Lock Alert",
        `${league.name}: finalize your picks/payment before ${currentPeriod} lock.`,
        `/pools/${leagueId}`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_automation_prelock_dispatch",
        },
      );
      sentCount += 1;
    }
  }

  if (type === "wrap") {
    const { results } = await db.prepare(`
      SELECT user_id
      FROM league_members
      WHERE league_id = ? AND invite_status = 'joined'
    `).bind(leagueId).all();
    recipients = (results || []).map((r) => String((r as Record<string, unknown>).user_id || "")).filter(Boolean);

    for (const userId of recipients) {
      await createInAppNotification(
        db,
        userId,
        "weekly_results",
        "🏁 Coach G Period Wrap",
        `${league.name}: period wrap is ready. Check standings and trend updates.`,
        `/leagues/${leagueId}/standings`,
        {
          league_id: Number(leagueId),
          period_id: currentPeriod,
          source: "coachg_automation_wrap_dispatch",
        },
      );
      sentCount += 1;
    }
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "coachg_copilot_automation_dispatch",
    summary: `Ran Coach G automation dispatch: ${type}`,
    detailsJson: {
      league_id: Number(leagueId),
      type,
      sent_count: sentCount,
    },
  });

  return c.json({
    success: true,
    type,
    sent_count: sentCount,
    message: "Coach G automation dispatch completed.",
  });
});

// Coach G Copilot: automation delivery status + telemetry
poolAdminRouter.get("/:leagueId/copilot/automation/status", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (isDemoMode) {
    const now = new Date();
    const nextMorning = new Date(now);
    nextMorning.setHours(8, 0, 0, 0);
    if (nextMorning.getTime() <= now.getTime()) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }
    const demoTelemetry = {
      queued_pending: 5,
      sent_last_24h: 42,
      failed_last_24h: 1,
      retryable_failed: 1,
    };
    const demoFailureRate = demoTelemetry.sent_last_24h > 0
      ? demoTelemetry.failed_last_24h / demoTelemetry.sent_last_24h
      : 0;
    const demoHealthState: "green" | "yellow" | "red" =
      demoFailureRate > 0.12 || demoTelemetry.retryable_failed >= 8
        ? "red"
        : demoFailureRate > 0.05 || demoTelemetry.retryable_failed >= 3
        ? "yellow"
        : "green";
    const demoHealthScore =
      demoHealthState === "green" ? 92 : demoHealthState === "yellow" ? 74 : 48;
    const demoSentPrior24h = 36;
    const demoFailedPrior24h = 2;
    const demoRetryablePrior = 3;
    return c.json({
      league_id: Number(leagueId),
      last_runs: {
        morning: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        prelock: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
        wrap: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      },
      next_runs: {
        morning: nextMorning.toISOString(),
        prelock: new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString(),
        wrap: new Date(Date.now() + 1000 * 60 * 60 * 7).toISOString(),
      },
      telemetry: demoTelemetry,
      reliability: {
        health_state: demoHealthState,
        health_score: demoHealthScore,
        failure_rate_24h: Number((demoFailureRate * 100).toFixed(2)),
        sla_target_failure_rate: 2,
        trends: {
          sent_delta_vs_prior_24h: demoTelemetry.sent_last_24h - demoSentPrior24h,
          failed_delta_vs_prior_24h: demoTelemetry.failed_last_24h - demoFailedPrior24h,
          retryable_delta_vs_prior_24h: demoTelemetry.retryable_failed - demoRetryablePrior,
        },
        note:
          demoHealthState === "green"
            ? "Automation is healthy and within SLO."
            : demoHealthState === "yellow"
            ? "Automation is stable but trending toward warning."
            : "Automation reliability is degraded; prioritize retry and queue cleanup.",
      },
    });
  }

  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT sport_key, rules_json
    FROM leagues
    WHERE id = ?
  `).bind(leagueId).first<{ sport_key: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const settings = parseCopilotAutomationFromRules(league.rules_json);

  const now = new Date();
  const nowIso = now.toISOString();
  const nextMorning = new Date(now);
  nextMorning.setHours(settings.morningBriefHourLocal, 0, 0, 0);
  if (nextMorning.getTime() <= now.getTime()) {
    nextMorning.setDate(nextMorning.getDate() + 1);
  }

  const nextLockRow = await db.prepare(`
    SELECT MIN(start_at) AS next_lock
    FROM events
    WHERE sport_key = ? AND start_at > ? AND status = 'scheduled'
  `).bind(league.sport_key, nowIso).first<{ next_lock: string | null }>();
  const nextLock = nextLockRow?.next_lock || null;
  const wrapNext = nextLock ? new Date(new Date(nextLock).getTime() + 2 * 60 * 60 * 1000).toISOString() : null;

  const morningLastRow = await db.prepare(`
    SELECT MAX(created_at) AS last_run
    FROM event_log
    WHERE entity_type = 'league' AND entity_id = ?
      AND action_type IN ('coachg_copilot_automation_test', 'coachg_copilot_automation_dispatch')
      AND summary LIKE '%morning%'
  `).bind(Number(leagueId)).first<{ last_run: string | null }>();
  const prelockLastRow = await db.prepare(`
    SELECT MAX(created_at) AS last_run
    FROM event_log
    WHERE entity_type = 'league' AND entity_id = ?
      AND action_type IN ('coachg_copilot_automation_test', 'coachg_copilot_automation_dispatch')
      AND summary LIKE '%prelock%'
  `).bind(Number(leagueId)).first<{ last_run: string | null }>();
  const wrapLastRow = await db.prepare(`
    SELECT MAX(created_at) AS last_run
    FROM event_log
    WHERE entity_type = 'league' AND entity_id = ?
      AND action_type IN ('coachg_copilot_automation_test', 'coachg_copilot_automation_dispatch')
      AND summary LIKE '%wrap%'
  `).bind(Number(leagueId)).first<{ last_run: string | null }>();

  const queuedPendingRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'pending'
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();
  const sent24hRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'sent'
      AND COALESCE(sent_at, updated_at, created_at) >= datetime('now', '-24 hours')
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();
  const sentPrior24hRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'sent'
      AND COALESCE(sent_at, updated_at, created_at) >= datetime('now', '-48 hours')
      AND COALESCE(sent_at, updated_at, created_at) < datetime('now', '-24 hours')
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();
  const failed24hRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'failed'
      AND COALESCE(updated_at, created_at) >= datetime('now', '-24 hours')
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();
  const failedPrior24hRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'failed'
      AND COALESCE(updated_at, created_at) >= datetime('now', '-48 hours')
      AND COALESCE(updated_at, created_at) < datetime('now', '-24 hours')
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();
  const retryableFailedRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'failed'
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();
  const retryablePrior24hRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'failed'
      AND COALESCE(updated_at, created_at) >= datetime('now', '-48 hours')
      AND COALESCE(updated_at, created_at) < datetime('now', '-24 hours')
      AND notification_type IN ('pool_activity', 'weekly_results')
  `).bind(leagueId).first<{ count: number }>();

  const telemetry = {
    queued_pending: Number(queuedPendingRow?.count || 0),
    sent_last_24h: Number(sent24hRow?.count || 0),
    failed_last_24h: Number(failed24hRow?.count || 0),
    retryable_failed: Number(retryableFailedRow?.count || 0),
  };
  const failureRate = telemetry.sent_last_24h > 0
    ? telemetry.failed_last_24h / telemetry.sent_last_24h
    : 0;
  const healthState: "green" | "yellow" | "red" =
    failureRate > 0.12 || telemetry.retryable_failed >= 8
      ? "red"
      : failureRate > 0.05 || telemetry.retryable_failed >= 3
      ? "yellow"
      : "green";
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100
          - failureRate * 140
          - telemetry.retryable_failed * 3
          - Math.min(telemetry.queued_pending, 50) * 0.6,
      ),
    ),
  );
  const sentDeltaVsPrior = telemetry.sent_last_24h - Number(sentPrior24hRow?.count || 0);
  const failedDeltaVsPrior = telemetry.failed_last_24h - Number(failedPrior24hRow?.count || 0);
  const retryableDeltaVsPrior = telemetry.retryable_failed - Number(retryablePrior24hRow?.count || 0);

  return c.json({
    league_id: Number(leagueId),
    last_runs: {
      morning: morningLastRow?.last_run || null,
      prelock: prelockLastRow?.last_run || null,
      wrap: wrapLastRow?.last_run || null,
    },
    next_runs: {
      morning: settings.morningBriefEnabled ? nextMorning.toISOString() : null,
      prelock: settings.preLockNudgeEnabled ? nextLock : null,
      wrap: settings.periodWrapEnabled ? wrapNext : null,
    },
    telemetry,
    reliability: {
      health_state: healthState,
      health_score: healthScore,
      failure_rate_24h: Number((failureRate * 100).toFixed(2)),
      sla_target_failure_rate: 2,
      trends: {
        sent_delta_vs_prior_24h: sentDeltaVsPrior,
        failed_delta_vs_prior_24h: failedDeltaVsPrior,
        retryable_delta_vs_prior_24h: retryableDeltaVsPrior,
      },
      note:
        healthState === "green"
          ? "Automation is healthy and within SLO."
          : healthState === "yellow"
          ? "Automation is stable but trending toward warning."
          : "Automation reliability is degraded; prioritize retry and queue cleanup.",
    },
  });
});

// Coach G Copilot: retry failed queued deliveries
poolAdminRouter.post("/:leagueId/copilot/automation/retry-failed", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  if (isDemoMode) {
    return c.json({
      success: true,
      retried_count: 1,
      message: "Retried failed notifications in demo mode.",
    });
  }

  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const { results } = await db.prepare(`
    SELECT id
    FROM scheduled_notifications
    WHERE league_id = ? AND status = 'failed'
      AND notification_type IN ('pool_activity', 'weekly_results')
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT 200
  `).bind(leagueId).all();

  const ids = (results || []).map((r) => Number((r as Record<string, unknown>).id || 0)).filter((n) => n > 0);
  if (!ids.length) {
    return c.json({
      success: true,
      retried_count: 0,
      message: "No failed notifications to retry.",
    });
  }

  const placeholders = ids.map(() => "?").join(", ");
  await db.prepare(`
    UPDATE scheduled_notifications
    SET status = 'pending', scheduled_for = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders})
  `).bind(...ids).run();

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "coachg_copilot_retry_failed_notifications",
    summary: `Retried ${ids.length} failed Coach G automation notifications`,
    detailsJson: {
      league_id: Number(leagueId),
      retried_count: ids.length,
    },
  });

  return c.json({
    success: true,
    retried_count: ids.length,
    message: "Failed notifications moved back to pending queue.",
  });
});

// Admin test broadcast for weekly rank recap (dry-run by default)
poolAdminRouter.post("/:leagueId/weekly-rank-recap/test", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const send = body.send === true;
  const selfOnly = body.selfOnly === true;
  const periodId = typeof body.periodId === "string" && body.periodId.trim() ? body.periodId.trim() : "Current Week";

  const league = await db.prepare(`
    SELECT id, name, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ id: number; name: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);

  const rules = parseJoinRequirementsFromRules(league.rules_json);
  const standingsUrl = `/leagues/${leagueId}/standings?period=${encodeURIComponent(periodId)}`;

  const { results: audienceRows } = await db.prepare(`
    SELECT
      lm.user_id,
      u.notification_results,
      u.notification_prefs_json,
      (
        SELECT us.setting_value
        FROM user_settings us
        WHERE CAST(us.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
          AND us.setting_key = 'notification_preferences'
        ORDER BY us.updated_at DESC
        LIMIT 1
      ) as notification_settings_json,
      COALESCE(ap.channel_push, 0) as channel_push,
      EXISTS(
        SELECT 1
        FROM push_subscriptions ps
        WHERE CAST(ps.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
          AND ps.is_active = 1
      ) as has_push_subscription
    FROM league_members lm
    LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(lm.user_id AS TEXT)
    LEFT JOIN alert_preferences ap ON CAST(ap.user_id AS TEXT) = CAST(lm.user_id AS TEXT)
    WHERE lm.league_id = ? AND lm.invite_status = 'joined'
  `).bind(leagueId).all();

  let inAppEligible = 0;
  let pushEligible = 0;
  let sentInApp = 0;
  let sentPush = 0;
  const totalJoinedMembers = (audienceRows || []).length;

  for (const row of audienceRows || []) {
    const rec = row as Record<string, unknown>;
    const targetUserId = String(rec.user_id ?? "");
    if (!targetUserId) continue;
    if (selfOnly && targetUserId !== user.id) continue;

    const weeklyResultsEnabled = Number(rec.notification_results ?? 0) === 1;
    let poolActivityEnabled = false;
    let weeklyRankRecapEnabled = false;
    if (typeof rec.notification_settings_json === "string" && rec.notification_settings_json.trim()) {
      try {
        const parsed = JSON.parse(rec.notification_settings_json) as Record<string, unknown>;
        poolActivityEnabled = parsed.poolActivity === true;
        weeklyRankRecapEnabled = parsed.weeklyRankRecap === true;
      } catch {
        poolActivityEnabled = false;
        weeklyRankRecapEnabled = false;
      }
    }
    if (!poolActivityEnabled && typeof rec.notification_prefs_json === "string" && rec.notification_prefs_json.trim()) {
      try {
        const parsed = JSON.parse(rec.notification_prefs_json) as Record<string, unknown>;
        poolActivityEnabled = parsed.poolActivity === true;
      } catch {
        poolActivityEnabled = false;
      }
    }

    const shouldSendInApp = rules.weeklyRankRecapEnabled && (weeklyResultsEnabled || poolActivityEnabled || weeklyRankRecapEnabled);
    const channelPushEnabled = Number(rec.channel_push ?? 0) === 1;
    const hasPushSubscription = Number(rec.has_push_subscription ?? 0) === 1;
    const shouldSendPush = rules.weeklyRankRecapPushEnabled && shouldSendInApp && channelPushEnabled && hasPushSubscription;

    if (shouldSendInApp) inAppEligible++;
    if (shouldSendPush) pushEligible++;

    if (send && shouldSendInApp) {
      const title = "🏆 Weekly Pool Recap (Test)";
      const bodyText = `Test broadcast: your weekly standings recap for ${league.name} is ready.`;
      await createInAppNotification(
        db,
        targetUserId,
        "weekly_results",
        title,
        bodyText,
        standingsUrl,
        {
          league_id: Number(leagueId),
          period_id: periodId,
          category: "weekly_standings_recap_test",
          source: "pool_admin_test_broadcast",
        },
      );
      sentInApp++;

      if (shouldSendPush) {
        const existingPush = await db.prepare(`
          SELECT id
          FROM scheduled_notifications
          WHERE user_id = ? AND league_id = ? AND notification_type = 'weekly_results' AND url = ?
            AND status IN ('pending', 'sent')
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(targetUserId, Number(leagueId), standingsUrl).first<{ id: number }>();
        if (!existingPush) {
          await queuePushNotification(
            db,
            targetUserId,
            "weekly_results",
            title,
            bodyText,
            standingsUrl,
            Number(leagueId),
          );
          sentPush++;
        }
      }
    }
  }

  if (send) {
    await logAuditEvent(db, {
      actorUserId: user.id,
      actorRole: role || "pool_admin",
      entityType: "league",
      entityId: Number(leagueId),
      actionType: "weekly_rank_recap_test_broadcast",
      summary: selfOnly ? "Sent self-only weekly rank recap test" : "Sent test weekly rank recap broadcast",
      detailsJson: {
        league_id: Number(leagueId),
        period_id: periodId,
        self_only: selfOnly,
        sent_in_app: sentInApp,
        sent_push: sentPush,
        eligible_in_app: inAppEligible,
        eligible_push: pushEligible,
      },
    });
  }

  return c.json({
    success: true,
    dry_run: !send,
    self_only: selfOnly,
    league_id: Number(leagueId),
    period_id: periodId,
    rules: {
      weeklyRankRecapEnabled: rules.weeklyRankRecapEnabled,
      weeklyRankRecapPushEnabled: rules.weeklyRankRecapPushEnabled,
    },
    audience: {
      joined_members: totalJoinedMembers,
      in_app_eligible: inAppEligible,
      push_eligible: pushEligible,
    },
    delivery: send
      ? { in_app_sent: sentInApp, push_sent: sentPush }
      : { in_app_sent: 0, push_sent: 0 },
    sample: {
      title: "🏆 Weekly Pool Recap (Test)",
      body: `Test broadcast: your weekly standings recap for ${league.name} is ready.`,
      url: standingsUrl,
    },
  });
});

// Reveal phone number for a member (logged action)
poolAdminRouter.post("/:leagueId/members/:memberId/reveal-phone", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get member's phone
  const member = await db.prepare(`
    SELECT lm.user_id, u.phone, u.display_name, u.email
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{
    user_id: string;
    phone: string | null;
    display_name: string | null;
    email: string;
  }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  // Log the reveal action
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league_member",
    entityId: memberId,
    actionType: "phone_revealed",
    summary: `Phone number revealed for ${member.display_name || member.email}`,
    detailsJson: { league_id: leagueId, target_user_id: member.user_id },
  });

  return c.json({ phone: member.phone });
});

// Get member detail (drawer view)
poolAdminRouter.get("/:leagueId/members/:memberId/detail", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get member with user info
  const member = await db.prepare(`
    SELECT 
      lm.id as member_id,
      lm.user_id,
      lm.role,
      lm.invite_status,
      lm.is_payment_verified,
      lm.notes,
      lm.invited_at,
      lm.joined_at,
      lm.created_at,
      u.display_name,
      u.email,
      u.avatar_url,
      u.last_active_at
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  // Get league for context
  const league = await db.prepare(`
    SELECT is_payment_required, entry_fee_cents, sport_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ is_payment_required: number; entry_fee_cents: number; sport_key: string }>();

  // Get current period
  const now = new Date().toISOString();
  const periodResult = await db.prepare(`
    SELECT period_id FROM events WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC LIMIT 1
  `).bind(league?.sport_key || "nfl", now).first<{ period_id: string }>();
  const currentPeriod = periodResult?.period_id || "Week 1";

  // Get recent receipts (last 10)
  const { results: receipts } = await db.prepare(`
    SELECT 
      pr.id, pr.receipt_code, pr.period_id, pr.submitted_at, pr.status,
      (SELECT COUNT(*) FROM picks WHERE receipt_id = pr.id) as pick_count
    FROM pick_receipts pr
    WHERE pr.user_id = ? AND pr.league_id = ?
    ORDER BY pr.submitted_at DESC
    LIMIT 10
  `).bind(member.user_id, leagueId).all();

  // Get recent audit events (last 10)
  const { results: auditEvents } = await db.prepare(`
    SELECT id, event_type, payload_json, reason, created_at
    FROM event_log
    WHERE league_id = ? AND (user_id = ? OR actor_id = ?)
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(leagueId, member.user_id, member.user_id).all();

  // Get payment status
  const payment = await db.prepare(`
    SELECT status, amount_cents, created_at
    FROM transaction_ledger
    WHERE league_id = ? AND user_id = ? AND intent_type = 'entry_fee'
    ORDER BY created_at DESC LIMIT 1
  `).bind(leagueId, member.user_id).first();

  // Calculate eligibility
  let paymentStatus: "paid" | "unpaid" | "pending" = "unpaid";
  if (member.is_payment_verified === 1) {
    paymentStatus = "paid";
  } else if (payment?.status === "pending" || payment?.status === "processing") {
    paymentStatus = "pending";
  }

  const isEligible = !league?.is_payment_required || paymentStatus === "paid";

  // Get pick status for current period
  const currentPick = await db.prepare(`
    SELECT COUNT(*) as count FROM picks
    WHERE user_id = ? AND league_id = ? AND period_id = ?
  `).bind(member.user_id, leagueId, currentPeriod).first<{ count: number }>();

  const hasCurrentPicks = (currentPick?.count || 0) > 0;

  return c.json({
    member: {
      id: member.member_id,
      user_id: member.user_id,
      name: member.display_name,
      email: member.email,
      avatar_url: member.avatar_url,
      role: member.role,
      invite_status: member.invite_status || "joined",
      invited_at: member.invited_at,
      joined_at: member.joined_at || member.created_at,
      notes: member.notes,
      last_active: member.last_active_at,
    },
    status: {
      payment: paymentStatus,
      eligibility: isEligible ? "eligible" : "ineligible",
      eligibility_reason: isEligible
        ? "Member is eligible to participate"
        : "Payment required for eligibility",
      has_current_picks: hasCurrentPicks,
      current_period: currentPeriod,
    },
    receipts: receipts.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      code: r.receipt_code as string,
      period: r.period_id as string,
      submitted_at: r.submitted_at as string,
      status: r.status as string,
      pick_count: (r.pick_count as number) || 0,
    })),
    audit_events: auditEvents.map((e) => ({
      id: e.id,
      type: e.event_type,
      summary: e.reason,
      payload: e.payload_json ? JSON.parse(e.payload_json as string) : null,
      created_at: e.created_at,
    })),
    context: {
      is_payment_required: league?.is_payment_required === 1,
      entry_fee_cents: league?.entry_fee_cents || 0,
    },
  });
});

// Update member role (promote/demote manager)
poolAdminRouter.patch("/:leagueId/members/:memberId/role", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const { role: newRole } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role: actorRole } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Validate role
  if (!["member", "admin"].includes(newRole)) {
    return c.json({ error: "Invalid role. Use 'member' or 'admin'" }, 400);
  }

  // Get target member
  const member = await db.prepare(`
    SELECT lm.user_id, lm.role, u.display_name, u.email
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{
    user_id: string;
    role: string;
    display_name: string | null;
    email: string;
  }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  // Can't change owner role
  if (member.role === "owner") {
    return c.json({ error: "Cannot change owner role" }, 400);
  }

  // Can't change to owner
  if (newRole === "owner") {
    return c.json({ error: "Cannot promote to owner" }, 400);
  }

  const oldRole = member.role;

  // Update role
  await db.prepare(`
    UPDATE league_members SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(newRole, memberId).run();

  // Log audit event
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: actorRole || "pool_admin",
    entityType: "league_member",
    entityId: memberId,
    actionType: "role_changed_manager",
    summary: `Role changed from ${oldRole} to ${newRole} for ${member.display_name || member.email}`,
    detailsJson: { 
      league_id: leagueId, 
      target_user_id: member.user_id,
      old_role: oldRole,
      new_role: newRole 
    },
  });

  return c.json({ success: true, old_role: oldRole, new_role: newRole });
});

// Approve pending member join request
poolAdminRouter.post("/:leagueId/members/:memberId/approve", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  const { isAdmin, role: actorRole } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const member = await db.prepare(`
    SELECT lm.user_id, lm.invite_status, u.display_name, u.email
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{
    user_id: string;
    invite_status: string;
    display_name: string | null;
    email: string;
  }>();

  if (!member) return c.json({ error: "Member not found" }, 404);
  if (member.invite_status !== "pending_approval") {
    return c.json({ error: "Member is not awaiting approval" }, 400);
  }

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE league_members
    SET invite_status = 'joined', joined_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(now, memberId).run();

  const league = await db.prepare(`
    SELECT name, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; rules_json: string | null }>();
  const joinRules = parseJoinRequirementsFromRules(league?.rules_json);

  if (joinRules.joinNotifyUsersOnStatusChange) {
    await createInAppNotification(
      db,
      member.user_id,
      "league_invite",
      "Join request approved",
      `Your request to join ${league?.name || "the pool"} has been approved.`,
      `/pools/${leagueId}`,
      { league_id: Number(leagueId), status: "approved" }
    );
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: actorRole || "pool_admin",
    entityType: "league_member",
    entityId: Number(memberId),
    actionType: "pool_member_approved",
    summary: `Approved join request for ${member.display_name || member.email}`,
    detailsJson: { league_id: leagueId, target_user_id: member.user_id },
  });

  return c.json({ success: true, member_id: Number(memberId), invite_status: "joined" });
});

// Reject pending member join request
poolAdminRouter.post("/:leagueId/members/:memberId/reject", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  const { isAdmin, role: actorRole } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const member = await db.prepare(`
    SELECT lm.user_id, lm.invite_status, u.display_name, u.email
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{
    user_id: string;
    invite_status: string;
    display_name: string | null;
    email: string;
  }>();

  if (!member) return c.json({ error: "Member not found" }, 404);
  if (member.invite_status !== "pending_approval") {
    return c.json({ error: "Member is not awaiting approval" }, 400);
  }

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE league_members
    SET invite_status = 'removed', removed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(now, memberId).run();

  const league = await db.prepare(`
    SELECT name, rules_json FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; rules_json: string | null }>();
  const joinRules = parseJoinRequirementsFromRules(league?.rules_json);

  if (joinRules.joinNotifyUsersOnStatusChange) {
    await createInAppNotification(
      db,
      member.user_id,
      "league_invite",
      "Join request declined",
      `Your request to join ${league?.name || "this pool"} was declined by a commissioner.`,
      "/join",
      { league_id: Number(leagueId), status: "rejected" }
    );
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: actorRole || "pool_admin",
    entityType: "league_member",
    entityId: Number(memberId),
    actionType: "pool_member_rejected",
    summary: `Rejected join request for ${member.display_name || member.email}`,
    detailsJson: { league_id: leagueId, target_user_id: member.user_id },
  });

  return c.json({ success: true, member_id: Number(memberId), invite_status: "removed" });
});

// Remove member from pool
poolAdminRouter.delete("/:leagueId/members/:memberId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const { reason } = await c.req.json().catch(() => ({ reason: "" }));
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role: actorRole } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get target member
  const member = await db.prepare(`
    SELECT lm.user_id, lm.role, u.display_name, u.email
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{
    user_id: string;
    role: string;
    display_name: string | null;
    email: string;
  }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  // Can't remove owner
  if (member.role === "owner") {
    return c.json({ error: "Cannot remove pool owner" }, 400);
  }

  const now = new Date().toISOString();

  // Soft remove - update invite_status to 'removed'
  await db.prepare(`
    UPDATE league_members 
    SET invite_status = 'removed', removed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(now, memberId).run();

  // Log audit event
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: actorRole || "pool_admin",
    entityType: "league_member",
    entityId: memberId,
    actionType: "pool_member_removed",
    summary: `Removed ${member.display_name || member.email} from pool`,
    detailsJson: { 
      league_id: leagueId, 
      target_user_id: member.user_id,
      reason: reason || "Removed by admin"
    },
  });

  return c.json({ success: true });
});

// Update member notes
poolAdminRouter.patch("/:leagueId/members/:memberId/notes", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const { notes } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Update notes
  await db.prepare(`
    UPDATE league_members SET notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND league_id = ?
  `).bind(notes || null, memberId, leagueId).run();

  return c.json({ success: true });
});

// ============ Invites API ============

// ============ Event Mapping API (Phase 2 multi-sport/mixed-league support) ============

poolAdminRouter.get("/:leagueId/event-map", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const periodId = c.req.query("period_id");
  const db = c.env.DB;

  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  let query = `
    SELECT pool_id, period_id, event_id, event_type, sport_key, home_team, away_team, start_time, is_required, metadata_json
    FROM pool_event_map
    WHERE pool_id = ?
  `;
  const binds: (string | number)[] = [leagueId];
  if (periodId) {
    query += " AND period_id = ?";
    binds.push(periodId);
  }
  query += " ORDER BY period_id ASC, start_time ASC";

  const { results } = await db.prepare(query).bind(...binds).all();
  return c.json({
    mappings: (results || []).map((row) => ({
      ...row,
      is_required: row.is_required === 1,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : null,
    })),
  });
});

poolAdminRouter.put("/:leagueId/event-map", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const periodId = String(body.period_id || "");
  const events = Array.isArray(body.events) ? body.events : [];
  if (!periodId) return c.json({ error: "period_id is required" }, 400);
  if (!events.length) return c.json({ error: "events must be a non-empty array" }, 400);

  await db.prepare(`
    DELETE FROM pool_event_map WHERE pool_id = ? AND period_id = ?
  `).bind(leagueId, periodId).run();

  for (const event of events) {
    if (!event?.event_id || !event?.sport_key) continue;
    await db.prepare(`
      INSERT INTO pool_event_map (
        pool_id, period_id, event_id, event_type, sport_key, home_team, away_team, start_time, is_required, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      leagueId,
      periodId,
      String(event.event_id),
      String(event.event_type || "GAME"),
      String(event.sport_key),
      typeof event.home_team === "string" ? event.home_team : null,
      typeof event.away_team === "string" ? event.away_team : null,
      typeof event.start_time === "string" ? event.start_time : null,
      event.is_required ? 1 : 0,
      JSON.stringify({
        leagueKey: event.league_key || null,
        mixedLeague: !!event.mixed_league,
        source: "pool_admin_event_map",
      }),
    ).run();
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "pool_event_map_updated",
    summary: `Updated event map for ${periodId}`,
    detailsJson: { league_id: leagueId, period_id: periodId, event_count: events.length },
  });

  return c.json({ success: true, period_id: periodId, event_count: events.length });
});

// Invite members to pool
poolAdminRouter.post("/:leagueId/invites", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const { invites } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  if (!Array.isArray(invites) || invites.length === 0) {
    return c.json({ error: "Invites array required" }, 400);
  }

  // Get league info
  const league = await db.prepare(`
    SELECT name, invite_code FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; invite_code: string }>();

  if (!league) {
    return c.json({ error: "Pool not found" }, 404);
  }

  const now = new Date().toISOString();
  const results: { email: string; status: string; error?: string }[] = [];

  for (const invite of invites) {
    const { email, name, phone } = invite;

    if (!email || typeof email !== "string") {
      results.push({ email: email || "unknown", status: "error", error: "Invalid email" });
      continue;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    let userId: string | null = null;
    const existingUser = await db.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(normalizedEmail).first<{ id: string }>();

    if (existingUser) {
      userId = existingUser.id;
      
      // Check if already a member
      const existingMember = await db.prepare(`
        SELECT id, invite_status FROM league_members WHERE league_id = ? AND user_id = ?
      `).bind(leagueId, userId).first<{ id: number; invite_status: string }>();

      if (existingMember) {
        if (existingMember.invite_status === "removed") {
          // Re-invite removed member
          await db.prepare(`
            UPDATE league_members 
            SET invite_status = 'invited', invited_at = ?, invited_by_user_id = ?, 
                removed_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(now, user.id, existingMember.id).run();
          results.push({ email: normalizedEmail, status: "reinvited" });
        } else {
          results.push({ email: normalizedEmail, status: "already_member" });
        }
        continue;
      }
    } else {
      // Create placeholder user record
      const userResult = await db.prepare(`
        INSERT INTO users (email, display_name, phone, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(normalizedEmail, name || null, phone || null).run();
      userId = String(userResult.meta.last_row_id);
    }

    // Create member with invited status
    await db.prepare(`
      INSERT INTO league_members (league_id, user_id, role, invite_status, invited_at, invited_by_user_id)
      VALUES (?, ?, 'member', 'invited', ?, ?)
    `).bind(leagueId, userId, now, user.id).run();

    results.push({ email: normalizedEmail, status: "invited" });

    // Log the invite
    await logAuditEvent(db, {
      actorUserId: user.id,
      actorRole: role || "pool_admin",
      entityType: "league_member",
      actionType: "pool_member_invited",
      summary: `Invited ${name || normalizedEmail} to pool`,
      detailsJson: { 
        league_id: leagueId, 
        invited_email: normalizedEmail,
        invited_name: name,
      },
    });
  }

  return c.json({ 
    success: true, 
    results,
    invite_link: `${c.req.url.split("/api")[0]}/join/${league.invite_code}`,
  });
});

// Resend invite
poolAdminRouter.post("/:leagueId/members/:memberId/resend-invite", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get member
  const member = await db.prepare(`
    SELECT lm.user_id, lm.invite_status, u.email, u.display_name
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{
    user_id: string;
    invite_status: string;
    email: string;
    display_name: string | null;
  }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (member.invite_status !== "invited") {
    return c.json({ error: "Member is not in invited status" }, 400);
  }

  // Log the resend
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league_member",
    entityId: memberId,
    actionType: "invite_resent",
    summary: `Resent invite to ${member.display_name || member.email}`,
    detailsJson: { league_id: leagueId, target_user_id: member.user_id },
  });

  return c.json({ success: true, email: member.email });
});

// ============ Reminders API ============

// Get reminder history across all admin pools
poolAdminRouter.get("/reminders/history", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = c.env.DB;

  // Get all pools user owns/admins
  const { results: pools } = await db.prepare(`
    SELECT DISTINCT l.id, l.name
    FROM leagues l
    LEFT JOIN league_members lm ON l.id = lm.league_id
    WHERE l.owner_id = ? OR (lm.user_id = ? AND lm.role IN ('owner', 'admin'))
  `).bind(user.id, user.id).all();

  if (pools.length === 0) {
    return c.json({ reminders: [], summary: { total: 0, this_week: 0, recipients_total: 0 } });
  }

  const poolIds = pools.map(p => p.id);
  const poolMap = Object.fromEntries(pools.map(p => [p.id, p.name]));

  // Get reminder history
  const { results: reminders } = await db.prepare(`
    SELECT rs.*, rt.name as template_name, u.display_name as sender_name, u.email as sender_email
    FROM reminder_sends rs
    LEFT JOIN reminder_templates rt ON rs.template_id = rt.id
    LEFT JOIN users u ON rs.sender_user_id = u.id
    WHERE rs.league_id IN (${poolIds.map(() => "?").join(",")})
    ORDER BY rs.created_at DESC
    LIMIT 100
  `).bind(...poolIds).all();

  // Calculate summary
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeek = reminders.filter(r => (r.created_at as string) > weekAgo).length;
  const recipientsTotal = reminders.reduce((sum, r) => sum + (Number(r.recipient_count) || 0), 0);

  return c.json({
    reminders: reminders.map(r => ({
      ...r,
      pool_name: poolMap[r.league_id as number] || "Unknown Pool",
    })),
    summary: {
      total: reminders.length,
      this_week: thisWeek,
      recipients_total: recipientsTotal,
    },
  });
});

// Get all reminder templates (no pool context needed)
poolAdminRouter.get("/reminder-templates", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = c.env.DB;

  const { results } = await db.prepare(`
    SELECT id, template_key, name, subject, body, target_group, channels, is_active
    FROM reminder_templates
    WHERE is_active = 1
    ORDER BY name ASC
  `).all();

  return c.json({ templates: results });
});

// Get reminder templates
poolAdminRouter.get("/:leagueId/reminder-templates", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const { results } = await db.prepare(`
    SELECT id, template_key, name, subject, body, target_group, channels, is_active
    FROM reminder_templates
    WHERE is_active = 1
    ORDER BY name ASC
  `).all();

  return c.json({ templates: results });
});

// Send reminder
poolAdminRouter.post("/:leagueId/reminders", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const { template_id, target_group, target_user_ids, channels, subject, body } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get league info
  const league = await db.prepare(`
    SELECT name, sport_key FROM leagues WHERE id = ?
  `).bind(leagueId).first<{ name: string; sport_key: string }>();

  if (!league) {
    return c.json({ error: "Pool not found" }, 404);
  }

  // Get current period
  const now = new Date().toISOString();
  const periodResult = await db.prepare(`
    SELECT period_id FROM events WHERE sport_key = ? AND start_at > ?
    ORDER BY start_at ASC LIMIT 1
  `).bind(league.sport_key, now).first<{ period_id: string }>();
  const currentPeriod = periodResult?.period_id || "Week 1";

  // Determine target users
  let targetUsers: { user_id: string; email: string; name: string | null }[] = [];

  if (target_user_ids && Array.isArray(target_user_ids) && target_user_ids.length > 0) {
    // Specific users selected
    const { results } = await db.prepare(`
      SELECT lm.user_id, u.email, u.display_name as name
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? AND lm.user_id IN (${target_user_ids.map(() => "?").join(",")})
        AND lm.invite_status != 'removed'
    `).bind(leagueId, ...target_user_ids).all();
    targetUsers = results as typeof targetUsers;
  } else if (target_group) {
    // Group-based targeting
    let groupQuery = `
      SELECT lm.user_id, u.email, u.display_name as name
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? AND lm.invite_status != 'removed'
    `;

    if (target_group === "missing_picks") {
      // Members who haven't submitted picks for current period
      groupQuery += ` AND lm.user_id NOT IN (
        SELECT DISTINCT user_id FROM picks WHERE league_id = ? AND period_id = ?
      )`;
      const { results } = await db.prepare(groupQuery).bind(leagueId, leagueId, currentPeriod).all();
      targetUsers = results as typeof targetUsers;
    } else if (target_group === "unpaid") {
      groupQuery += ` AND lm.is_payment_verified = 0`;
      const { results } = await db.prepare(groupQuery).bind(leagueId).all();
      targetUsers = results as typeof targetUsers;
    } else if (target_group === "invited") {
      groupQuery += ` AND lm.invite_status = 'invited'`;
      const { results } = await db.prepare(groupQuery).bind(leagueId).all();
      targetUsers = results as typeof targetUsers;
    } else {
      // All members
      const { results } = await db.prepare(groupQuery).bind(leagueId).all();
      targetUsers = results as typeof targetUsers;
    }
  }

  if (targetUsers.length === 0) {
    return c.json({ error: "No recipients match the target criteria" }, 400);
  }

  // Get template if provided
  let finalSubject = subject;
  let finalBody = body;
  let templateKey: string | null = null;

  if (template_id) {
    const template = await db.prepare(`
      SELECT template_key, subject, body FROM reminder_templates WHERE id = ?
    `).bind(template_id).first<{ template_key: string; subject: string; body: string }>();

    if (template) {
      templateKey = template.template_key;
      finalSubject = finalSubject || template.subject;
      finalBody = finalBody || template.body;
    }
  }

  // Replace template variables
  finalSubject = finalSubject?.replace("{pool_name}", league.name) || "Reminder from your pool";
  finalBody = finalBody?.replace("{pool_name}", league.name) || "This is a reminder from your pool commissioner.";

  // Record the reminder send
  const sendResult = await db.prepare(`
    INSERT INTO reminder_sends (league_id, template_id, sender_user_id, target_group, target_user_ids, channel, subject, body, recipient_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    leagueId,
    template_id || null,
    user.id,
    target_group || "custom",
    JSON.stringify(targetUsers.map((u) => u.user_id)),
    channels || "email",
    finalSubject,
    finalBody,
    targetUsers.length
  ).run();

  // Log audit event
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "reminder_send",
    entityId: sendResult.meta.last_row_id,
    actionType: targetUsers.length > 1 ? "reminders_sent_bulk" : "reminder_sent",
    summary: `Sent reminder to ${targetUsers.length} recipient(s)`,
    detailsJson: {
      league_id: leagueId,
      template_key: templateKey,
      target_group,
      recipient_count: targetUsers.length,
      recipient_ids: targetUsers.map((u) => u.user_id),
    },
  });

  return c.json({
    success: true,
    recipients_count: targetUsers.length,
    recipients: targetUsers.map((u) => ({ email: u.email, name: u.name })),
  });
});

// ============ Bulk Actions API ============

// Bulk send reminder
poolAdminRouter.post("/:leagueId/bulk/send-reminder", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const { member_ids } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return c.json({ error: "Member IDs required" }, 400);
  }

  // Forward to reminders endpoint
  return c.json({ 
    success: true, 
    message: "Use POST /reminders with target_user_ids for bulk sends" 
  });
});

// Bulk resend invites
poolAdminRouter.post("/:leagueId/bulk/resend-invites", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const { member_ids } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return c.json({ error: "Member IDs required" }, 400);
  }

  // Get members in invited status
  const { results: members } = await db.prepare(`
    SELECT lm.id, lm.user_id, u.email, u.display_name
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ? AND lm.id IN (${member_ids.map(() => "?").join(",")})
      AND lm.invite_status = 'invited'
  `).bind(leagueId, ...member_ids).all();

  // Log bulk action
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: leagueId,
    actionType: "invites_resent_bulk",
    summary: `Resent ${members.length} invites`,
    detailsJson: {
      league_id: leagueId,
      member_ids: members.map((m) => m.id),
    },
  });

  return c.json({
    success: true,
    resent_count: members.length,
    emails: members.map((m) => m.email),
  });
});

// Cross-pool bulk approvals audit entry
poolAdminRouter.post("/approvals/bulk-audit", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json({ success: true, audited: true, mode: "demo" });
  }

  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "").trim().toLowerCase();
  const filters = (body.filters && typeof body.filters === "object") ? body.filters : {};
  const processedCount = Number(body.processed_count || 0);
  const succeededCount = Number(body.succeeded_count || 0);
  const failedCount = Number(body.failed_count || 0);

  if (action !== "approve" && action !== "reject") {
    return c.json({ error: "Invalid action. Must be 'approve' or 'reject'." }, 400);
  }

  const attemptedRows = Array.isArray(body.attempted_rows) ? body.attempted_rows : [];
  type AttemptedRow = { league_id: number; member_id: number; user_id?: string };
  const normalizedRows: AttemptedRow[] = attemptedRows
    .map((row) => {
      const raw = row as Record<string, unknown>;
      return {
        league_id: Number(raw.league_id || 0),
        member_id: Number(raw.member_id || 0),
        user_id: typeof raw.user_id === "string" ? raw.user_id : undefined,
      };
    })
    .filter((row) => row.league_id > 0 && row.member_id > 0);

  const uniqueLeagueIds = Array.from(new Set(normalizedRows.map((row) => row.league_id)));
  if (uniqueLeagueIds.length === 0) {
    return c.json({ error: "No attempted rows supplied for audit." }, 400);
  }
  for (const leagueId of uniqueLeagueIds) {
    const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
    if (!isAdmin) {
      return c.json({ error: `Pool admin access required for league ${leagueId}` }, 403);
    }
  }

  const { results: roles } = await db.prepare(`
    SELECT role, league_id
    FROM league_members
    WHERE user_id = ? AND league_id IN (${uniqueLeagueIds.map(() => "?").join(",")})
  `).bind(user.id, ...uniqueLeagueIds).all();
  const actorRole = (roles?.[0] as Record<string, unknown> | undefined)?.role as string | undefined;

  const actionType = action === "approve" ? "pool_members_approved_bulk" : "pool_members_rejected_bulk";
  const summary = `${action === "approve" ? "Approved" : "Rejected"} ${succeededCount} member request(s) in bulk`;

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: actorRole || "pool_admin",
    entityType: "league",
    entityId: uniqueLeagueIds[0] || 0,
    actionType,
    summary,
    detailsJson: {
      action,
      filters,
      processed_count: processedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
      affected_member_ids: normalizedRows.map((row) => row.member_id),
      affected_user_ids: normalizedRows.map((row) => row.user_id).filter((value) => typeof value === "string"),
      league_ids: uniqueLeagueIds,
      attempted_rows: normalizedRows,
    },
  });

  return c.json({ success: true, audited: true });
});

// Get member receipts (read-only view)
poolAdminRouter.get("/:leagueId/members/:memberId/receipts", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get member's user_id
  const member = await db.prepare(`
    SELECT user_id FROM league_members WHERE id = ? AND league_id = ?
  `).bind(memberId, leagueId).first<{ user_id: string }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  // Get receipts
  const { results } = await db.prepare(`
    SELECT 
      pr.id, pr.receipt_code, pr.period_id, pr.submitted_at, pr.status,
      (SELECT COUNT(*) FROM picks WHERE receipt_id = pr.id) as pick_count
    FROM pick_receipts pr
    WHERE pr.user_id = ? AND pr.league_id = ?
    ORDER BY pr.submitted_at DESC
    LIMIT 20
  `).bind(member.user_id, leagueId).all();

  return c.json({ receipts: results });
});

// Get member activity (audit events for this member in this pool)
poolAdminRouter.get("/:leagueId/members/:memberId/activity", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get member's user_id
  const member = await db.prepare(`
    SELECT user_id FROM league_members WHERE id = ? AND league_id = ?
  `).bind(memberId, leagueId).first<{ user_id: string }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  // Get activity
  const { results } = await db.prepare(`
    SELECT id, event_type, payload_json, reason, created_at
    FROM event_log
    WHERE league_id = ? AND (user_id = ? OR actor_id = ?)
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(leagueId, member.user_id, member.user_id).all();

  return c.json({
    events: results.map((e) => ({
      id: e.id,
      type: e.event_type,
      summary: e.reason,
      payload: e.payload_json ? JSON.parse(e.payload_json as string) : null,
      created_at: e.created_at,
    })),
  });
});

// ============ Activity Log API ============

// Get activity log for a single pool
poolAdminRouter.get("/:leagueId/activity", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Return demo data in demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    const demoActivity = getDemoActivity();
    return c.json({
      activities: demoActivity.activities,
      action_types: demoActivity.action_types,
      pagination: demoActivity.pagination,
    });
  }

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Query params
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const actionType = c.req.query("action_type");

  // Build action type filter
  let actionFilter = "";
  if (actionType && actionType !== "all") {
    actionFilter = "AND e.event_type = ?";
  }

  // Get activity from event_log where league_id is in payload
  const query = `
    SELECT 
      e.id,
      e.event_type,
      e.actor_id,
      e.entity_type,
      e.entity_id,
      e.payload_json,
      e.reason as summary,
      e.created_at,
      u.display_name as actor_name,
      u.email as actor_email,
      u.avatar_url as actor_avatar
    FROM event_log e
    LEFT JOIN users u ON e.actor_id = u.id
    WHERE e.payload_json LIKE '%"league_id":"' || ? || '"%'
       OR e.payload_json LIKE '%"league_id":' || ? || '%'
    ${actionFilter}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const bindParams = actionType && actionType !== "all" 
    ? [leagueId, leagueId, actionType, limit, offset]
    : [leagueId, leagueId, limit, offset];

  const { results } = await db.prepare(query).bind(...bindParams).all();

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total FROM event_log e
    WHERE e.payload_json LIKE '%"league_id":"' || ? || '"%'
       OR e.payload_json LIKE '%"league_id":' || ? || '%'
    ${actionFilter}
  `;
  const countParams = actionType && actionType !== "all"
    ? [leagueId, leagueId, actionType]
    : [leagueId, leagueId];
  const countResult = await db.prepare(countQuery).bind(...countParams).first<{ total: number }>();

  // Get distinct action types for filter dropdown
  const { results: actionTypes } = await db.prepare(`
    SELECT DISTINCT event_type FROM event_log
    WHERE payload_json LIKE '%"league_id":"' || ? || '"%'
       OR payload_json LIKE '%"league_id":' || ? || '%'
    ORDER BY event_type
  `).bind(leagueId, leagueId).all();

  return c.json({
    activities: results.map((e) => ({
      id: e.id,
      action_type: e.event_type,
      summary: e.summary,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      details: e.payload_json ? JSON.parse(e.payload_json as string) : null,
      created_at: e.created_at,
      actor: e.actor_id ? {
        id: e.actor_id,
        name: e.actor_name || (e.actor_email as string | null)?.split("@")[0] || "Unknown",
        email: e.actor_email,
        avatar_url: e.actor_avatar,
      } : null,
    })),
    action_types: actionTypes.map((a) => a.event_type),
    pagination: {
      total: countResult?.total || 0,
      limit,
      offset,
      has_more: offset + limit < (countResult?.total || 0),
    },
  });
});

// Get activity log across all pools user administers
poolAdminRouter.get("/activity", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Return demo data in demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json(getDemoActivity());
  }

  const db = c.env.DB;
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const poolId = c.req.query("pool_id");
  const actionType = c.req.query("action_type");

  // Get all pools where user is owner or admin
  const { results: adminPools } = await db.prepare(`
    SELECT l.id, l.name FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND lm.role IN ('owner', 'admin')
  `).bind(user.id).all();

  if (adminPools.length === 0) {
    return c.json({ 
      activities: [], 
      pools: [],
      action_types: [],
      pagination: { total: 0, limit, offset, has_more: false } 
    });
  }

  const poolIds = poolId ? [poolId] : adminPools.map(p => p.id);
  
  // Build the LIKE conditions for all pool IDs
  const likeConditions = poolIds.map(() => 
    `(e.payload_json LIKE '%"league_id":"' || ? || '"%' OR e.payload_json LIKE '%"league_id":' || ? || '%')`
  ).join(" OR ");

  // Build action type filter
  let actionFilter = "";
  const actionBinds: (string | number)[] = [];
  if (actionType && actionType !== "all") {
    actionFilter = "AND e.event_type = ?";
    actionBinds.push(actionType);
  }

  // Flatten pool IDs (each needs to appear twice in LIKE conditions)
  const poolBinds = poolIds.flatMap(id => [id, id]);

  const query = `
    SELECT 
      e.id,
      e.event_type,
      e.actor_id,
      e.entity_type,
      e.entity_id,
      e.payload_json,
      e.reason as summary,
      e.created_at,
      u.display_name as actor_name,
      u.email as actor_email,
      u.avatar_url as actor_avatar
    FROM event_log e
    LEFT JOIN users u ON e.actor_id = u.id
    WHERE (${likeConditions})
    ${actionFilter}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await db.prepare(query).bind(
    ...poolBinds, 
    ...actionBinds, 
    limit, 
    offset
  ).all();

  // Get total count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM event_log e
    WHERE (${likeConditions})
    ${actionFilter}
  `).bind(...poolBinds, ...actionBinds).first<{ total: number }>();

  // Get distinct action types
  const { results: actionTypes } = await db.prepare(`
    SELECT DISTINCT event_type FROM event_log
    WHERE (${likeConditions})
    ORDER BY event_type
  `).bind(...poolBinds).all();

  // Extract league_id from each activity and map to pool name
  const poolMap = new Map(adminPools.map(p => [String(p.id), p.name]));

  return c.json({
    activities: results.map((e) => {
      const details = e.payload_json ? JSON.parse(e.payload_json as string) : null;
      const activityPoolId = details?.league_id;
      return {
        id: e.id,
        action_type: e.event_type,
        summary: e.summary,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        details,
        pool_id: activityPoolId,
        pool_name: activityPoolId ? poolMap.get(String(activityPoolId)) : null,
        created_at: e.created_at,
        actor: e.actor_id ? {
          id: e.actor_id,
          name: e.actor_name || (e.actor_email as string | null)?.split("@")[0] || "Unknown",
          email: e.actor_email,
          avatar_url: e.actor_avatar,
        } : null,
      };
    }),
    pools: adminPools.map(p => ({ id: p.id, name: p.name })),
    action_types: actionTypes.map((a) => a.event_type),
    pagination: {
      total: countResult?.total || 0,
      limit,
      offset,
      has_more: offset + limit < (countResult?.total || 0),
    },
  });
});

// ============ Payments API ============

// Get all payments across all pools the user administers
poolAdminRouter.get("/payments", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Return demo data in demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json(getDemoPayments());
  }

  const db = c.env.DB;
  const status = c.req.query("status"); // 'paid', 'unpaid', 'all'
  const poolId = c.req.query("pool_id");

  // Get all pools where user is owner or admin
  const { results: adminPools } = await db.prepare(`
    SELECT l.id FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = ? AND lm.role IN ('owner', 'admin') AND l.is_payment_required = 1
  `).bind(user.id).all();

  if (adminPools.length === 0) {
    return c.json({ payments: [], summary: { total: 0, paid: 0, unpaid: 0, collected: 0, outstanding: 0 } });
  }

  const poolIds = poolId ? [poolId] : adminPools.map(p => p.id);
  const poolPlaceholders = poolIds.map(() => "?").join(",");

  // Build status filter
  let statusFilter = "";
  if (status === "paid") {
    statusFilter = "AND lm.is_payment_verified = 1";
  } else if (status === "unpaid") {
    statusFilter = "AND lm.is_payment_verified = 0";
  }

  // Get member payments with pool info
  const { results: payments } = await db.prepare(`
    SELECT 
      lm.id as member_id,
      lm.user_id,
      lm.league_id as pool_id,
      lm.role,
      lm.is_payment_verified,
      lm.payment_verified_at,
      lm.invite_status,
      lm.joined_at,
      l.name as pool_name,
      l.sport_key,
      l.entry_fee_cents,
      u.display_name,
      u.email,
      u.avatar_url
    FROM league_members lm
    JOIN leagues l ON lm.league_id = l.id
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id IN (${poolPlaceholders})
      AND lm.invite_status = 'joined'
      AND lm.role NOT IN ('owner', 'admin')
      ${statusFilter}
    ORDER BY lm.is_payment_verified ASC, l.name ASC, u.display_name ASC
  `).bind(...poolIds).all();

  // Get transaction history
  const { results: transactions } = await db.prepare(`
    SELECT 
      tl.id,
      tl.league_id as pool_id,
      tl.user_id,
      tl.amount_cents,
      tl.status,
      tl.provider,
      tl.completed_at,
      tl.created_at,
      u.display_name,
      u.email,
      l.name as pool_name
    FROM transaction_ledger tl
    JOIN leagues l ON tl.league_id = l.id
    LEFT JOIN users u ON tl.user_id = u.id
    WHERE tl.league_id IN (${poolPlaceholders})
    ORDER BY tl.created_at DESC
    LIMIT 100
  `).bind(...poolIds).all();

  // Calculate summary
  const paid = payments.filter(p => p.is_payment_verified).length;
  const unpaid = payments.filter(p => !p.is_payment_verified).length;
  const collected = payments
    .filter(p => p.is_payment_verified)
    .reduce((sum, p) => sum + Number(p.entry_fee_cents || 0), 0);
  const outstanding = payments
    .filter(p => !p.is_payment_verified)
    .reduce((sum, p) => sum + Number(p.entry_fee_cents || 0), 0);

  return c.json({
    payments: payments.map(p => ({
      member_id: p.member_id,
      user_id: p.user_id,
      pool_id: p.pool_id,
      pool_name: p.pool_name,
      sport_key: p.sport_key,
      entry_fee_cents: p.entry_fee_cents,
      display_name: p.display_name || (p.email as string | null)?.split("@")[0] || "Unknown",
      email: p.email,
      avatar_url: p.avatar_url,
      role: p.role,
      is_paid: !!p.is_payment_verified,
      paid_at: p.payment_verified_at,
      joined_at: p.joined_at,
    })),
    transactions,
    summary: {
      total: payments.length,
      paid,
      unpaid,
      collected_cents: collected,
      outstanding_cents: outstanding,
    },
  });
});

// Get payments for a specific pool
poolAdminRouter.get("/:leagueId/payments", poolAdminDemoOrAuthMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Return demo data in demo mode
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return c.json({
      pool: { id: 1, name: "Office NFL Survivor", sport_key: "nfl", entry_fee_cents: 2500, is_payment_required: 1 },
      members: getDemoPayments().payments,
      transactions: [],
      summary: getDemoPayments().summary,
    });
  }

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get pool info
  const pool = await db.prepare(`
    SELECT id, name, sport_key, entry_fee_cents, is_payment_required
    FROM leagues WHERE id = ?
  `).bind(leagueId).first();

  if (!pool) {
    return c.json({ error: "Pool not found" }, 404);
  }

  // Get all members (except owner/admins)
  const { results: members } = await db.prepare(`
    SELECT 
      lm.id as member_id,
      lm.user_id,
      lm.role,
      lm.is_payment_verified,
      lm.payment_verified_at,
      lm.joined_at,
      lm.notes,
      u.display_name,
      u.email,
      u.avatar_url
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ? AND lm.invite_status = 'joined'
    ORDER BY lm.is_payment_verified ASC, u.display_name ASC
  `).bind(leagueId).all();

  // Get transactions for this pool
  const { results: transactions } = await db.prepare(`
    SELECT 
      tl.id,
      tl.user_id,
      tl.amount_cents,
      tl.status,
      tl.provider,
      tl.completed_at,
      tl.created_at
    FROM transaction_ledger tl
    WHERE tl.league_id = ?
    ORDER BY tl.created_at DESC
  `).bind(leagueId).all();

  const paid = members.filter(m => m.is_payment_verified && m.role !== 'owner' && m.role !== 'admin').length;
  const unpaid = members.filter(m => !m.is_payment_verified && m.role !== 'owner' && m.role !== 'admin').length;

  return c.json({
    pool: {
      id: pool.id,
      name: pool.name,
      sport_key: pool.sport_key,
      entry_fee_cents: pool.entry_fee_cents,
      is_payment_required: pool.is_payment_required,
    },
    members: members.map(m => ({
      member_id: m.member_id,
      user_id: m.user_id,
      display_name: m.display_name || (m.email as string | null)?.split("@")[0] || "Unknown",
      email: m.email,
      avatar_url: m.avatar_url,
      role: m.role,
      is_paid: !!m.is_payment_verified,
      paid_at: m.payment_verified_at,
      joined_at: m.joined_at,
      notes: m.notes,
    })),
    transactions,
    summary: {
      total_members: members.filter(m => m.role !== 'owner' && m.role !== 'admin').length,
      paid,
      unpaid,
      collected_cents: paid * Number(pool.entry_fee_cents || 0),
      outstanding_cents: unpaid * Number(pool.entry_fee_cents || 0),
    },
  });
});

// Update payment status for a member
poolAdminRouter.patch("/:leagueId/members/:memberId/payment", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const memberId = c.req.param("memberId");
  const { is_paid, notes } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  // Get member info for logging
  const member = await db.prepare(`
    SELECT lm.user_id, u.display_name, u.email
    FROM league_members lm
    LEFT JOIN users u ON lm.user_id = u.id
    WHERE lm.id = ? AND lm.league_id = ?
  `).bind(memberId, leagueId).first<{ user_id: string; display_name: string | null; email: string }>();

  if (!member) {
    return c.json({ error: "Member not found" }, 404);
  }

  const now = new Date().toISOString();

  // Update payment status
  await db.prepare(`
    UPDATE league_members 
    SET is_payment_verified = ?, 
        payment_verified_at = ?,
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND league_id = ?
  `).bind(
    is_paid ? 1 : 0,
    is_paid ? now : null,
    notes || null,
    memberId,
    leagueId
  ).run();

  // Log the change
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league_member",
    entityId: Number(memberId),
    actionType: is_paid ? "payment_verified" : "payment_unverified",
    summary: `${is_paid ? "Verified" : "Unverified"} payment for ${member.display_name || member.email}`,
    detailsJson: {
      league_id: leagueId,
      member_id: memberId,
      target_user_id: member.user_id,
      is_paid,
      notes,
    },
  });

  return c.json({ success: true, is_paid, paid_at: is_paid ? now : null });
});

// Bulk update payment status
poolAdminRouter.post("/:leagueId/payments/bulk", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const { member_ids, is_paid } = await c.req.json();
  const db = c.env.DB;

  // Check pool admin
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return c.json({ error: "Member IDs required" }, 400);
  }

  const now = new Date().toISOString();
  const placeholders = member_ids.map(() => "?").join(",");

  // Update all members
  await db.prepare(`
    UPDATE league_members 
    SET is_payment_verified = ?, 
        payment_verified_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders}) AND league_id = ?
  `).bind(is_paid ? 1 : 0, is_paid ? now : null, ...member_ids, leagueId).run();

  // Log the bulk action
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: is_paid ? "payments_verified_bulk" : "payments_unverified_bulk",
    summary: `${is_paid ? "Verified" : "Unverified"} ${member_ids.length} payments`,
    detailsJson: {
      league_id: leagueId,
      member_ids,
      is_paid,
    },
  });

  return c.json({ success: true, updated_count: member_ids.length });
});

// ============ Pool Visibility Settings ============

// Update marketplace listing settings for a pool (feature-flag aware)
poolAdminRouter.get("/:leagueId/marketplace-listing", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const league = await db.prepare(`
    SELECT rules_json
    FROM leagues
    WHERE id = ?
    LIMIT 1
  `).bind(leagueId).first<{ rules_json: string | null }>();
  if (!league) {
    return c.json({ error: "Pool not found" }, 404);
  }
  const activationReadiness = await evaluateActivationReadiness(db, leagueId, league.rules_json);

  const listing = await db.prepare(`
    SELECT league_id, listing_status, category_key, is_featured, listing_fee_cents, listed_at, updated_at
    FROM pool_marketplace_listings
    WHERE league_id = ?
  `).bind(leagueId).first<{
    league_id: number;
    listing_status: string;
    category_key: string | null;
    is_featured: number;
    listing_fee_cents: number;
    listed_at: string | null;
    updated_at: string;
  }>();

  if (!listing) {
    return c.json({
      listing: {
        league_id: Number(leagueId),
        listing_status: "hidden",
        category_key: null,
        is_featured: false,
        listing_fee_cents: 0,
        listed_at: null,
      },
      activation_readiness: activationReadiness,
    });
  }

  return c.json({
    listing: {
      ...listing,
      is_featured: listing.is_featured === 1,
    },
    activation_readiness: activationReadiness,
  });
});

// Update marketplace listing settings for a pool (feature-flag aware)
poolAdminRouter.patch("/:leagueId/marketplace-listing", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const listingStatus = typeof body.listing_status === "string" ? body.listing_status : "listed";
  const categoryKey = typeof body.category_key === "string" ? body.category_key : null;
  const isFeatured = body.is_featured ? 1 : 0;
  const listingFeeCents = Number(body.listing_fee_cents || 0);

  const { FeatureFlagService } = await import("../services/featureFlagService");
  const flags = new FeatureFlagService(db);
  const marketplaceEnabled = await flags.isEnabled("MARKETPLACE_ENABLED");
  if (!marketplaceEnabled) {
    return c.json({ error: "Marketplace is disabled", feature_flag: "MARKETPLACE_ENABLED" }, 403);
  }

  const listingFeesEnabled = await flags.isEnabled("LISTING_FEES_ENABLED");
  const effectiveFee = listingFeesEnabled ? Math.max(0, Math.round(listingFeeCents)) : 0;

  const leagueVisibility = await db.prepare(`
      SELECT is_public, rules_json
      FROM leagues
      WHERE id = ?
      LIMIT 1
    `).bind(leagueId).first<{ is_public: number; rules_json: string | null }>();
    if (!leagueVisibility) {
      return c.json({ error: "Pool not found" }, 404);
    }

  if (listingStatus === "listed") {
    if (Number(leagueVisibility.is_public || 0) !== 1) {
      return c.json({
        error: "Pool must be public before it can be listed in marketplace.",
        requires_public_pool: true,
      }, 400);
    }

    const activationReadiness = await evaluateActivationReadiness(db, leagueId, leagueVisibility.rules_json);
    if (!activationReadiness.complete) {
      return c.json({
        error: "Pool configuration is incomplete. Complete required admin configuration before publishing.",
        requires_configuration: true,
        activation_readiness: activationReadiness,
      }, 400);
    }
  }

  await db.prepare(`
    INSERT INTO pool_marketplace_listings (league_id, listing_status, category_key, is_featured, listing_fee_cents, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(league_id) DO UPDATE SET
      listing_status = excluded.listing_status,
      category_key = excluded.category_key,
      is_featured = excluded.is_featured,
      listing_fee_cents = excluded.listing_fee_cents,
      updated_at = CURRENT_TIMESTAMP
  `).bind(leagueId, listingStatus, categoryKey, isFeatured, effectiveFee).run();

  if (listingFeesEnabled && effectiveFee > 0 && listingStatus === "listed") {
    const existingFee = await db.prepare(`
      SELECT id
      FROM transaction_ledger
      WHERE league_id = ? AND user_id = ? AND intent_type = 'listing_fee' AND status IN ('pending', 'processing', 'completed')
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(leagueId, user.id).first<{ id: number }>();

    if (!existingFee) {
      await db.prepare(`
        INSERT INTO transaction_ledger (
          league_id, user_id, provider, provider_txn_id, intent_type, amount_cents, fee_cents, currency, status, completed_at, created_at, updated_at
        ) VALUES (?, ?, 'internal', ?, 'listing_fee', ?, 0, 'USD', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        leagueId,
        user.id,
        `listing_fee_${leagueId}_${Date.now()}`,
        effectiveFee,
      ).run();
    }
  }

  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "pool_admin",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: "marketplace_listing_updated",
    summary: `Marketplace listing updated (${listingStatus})`,
    detailsJson: {
      league_id: leagueId,
      listing_status: listingStatus,
      category_key: categoryKey,
      is_featured: isFeatured === 1,
      listing_fee_cents: effectiveFee,
    },
  });

  return c.json({
    success: true,
    listing: {
      league_id: Number(leagueId),
      listing_status: listingStatus,
      category_key: categoryKey,
      is_featured: isFeatured === 1,
      listing_fee_cents: effectiveFee,
    },
  });
});

poolAdminRouter.get("/:leagueId/marketplace-listing-fees", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const { results } = await db.prepare(`
    SELECT id, amount_cents, status, provider, provider_txn_id, completed_at, created_at
    FROM transaction_ledger
    WHERE league_id = ? AND intent_type = 'listing_fee'
    ORDER BY created_at DESC
    LIMIT 25
  `).bind(leagueId).all();

  return c.json({
    fees: (results || []).map((row) => ({
      ...row,
      amount_cents: Number(row.amount_cents || 0),
    })),
  });
});

// Toggle pool public/private status (requires PUBLIC_POOLS flag to be enabled)
poolAdminRouter.patch("/:leagueId/visibility", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  // Check pool admin access
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) {
    return c.json({ error: "Pool admin access required" }, 403);
  }

  const { isPublic } = await c.req.json();

  // Check if PUBLIC_POOLS flag is enabled
  const { isPublicPoolsEnabled } = await import("../services/featureFlagService");
  const publicPoolsEnabled = await isPublicPoolsEnabled(db);

  if (isPublic && !publicPoolsEnabled) {
    return c.json({ 
      error: "Public pools are disabled by platform settings. All pools must remain invite-only.",
      feature_flag: "PUBLIC_POOLS",
      enabled: false 
    }, 403);
  }

  // Update the pool's visibility
  await db.prepare(`
    UPDATE leagues SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(isPublic ? 1 : 0, leagueId).run();

  // Log the change
  await logAuditEvent(db, {
    actorUserId: user.id,
    actorRole: role || "member",
    entityType: "league",
    entityId: Number(leagueId),
    actionType: isPublic ? "pool_made_public" : "pool_made_private",
    summary: isPublic ? "Pool made public" : "Pool made private",
    detailsJson: { is_public: isPublic, changed_by_role: role },
  });

  return c.json({ 
    success: true, 
    is_public: isPublic,
    message: isPublic ? "Pool is now public and discoverable" : "Pool is now private (invite-only)"
  });
});

// ═══════════════════════════════════════════════════════════════
// PAYOUT ENGINE ROUTES
// ═══════════════════════════════════════════════════════════════

import {
  loadPayoutConfig,
  savePayoutConfig,
  runPayoutCalculation,
  approvePayouts,
  markPayoutsPaid,
  voidPayouts,
  getPayoutSummary,
  recordCalcuttaOwnership,
  loadCalcuttaOwnerships,
} from "../services/payoutService";
import {
  getAdminSettingsFields,
  deserializePoolRuleConfig,
  serializePoolRuleConfig,
  buildPoolRuleConfig,
  validatePoolRuleConfig,
  type AdminSettingsGroup,
} from "../../shared/poolRuleConfig";
import { executeRecalculation } from "../services/scoringEngine";
import {
  getWeeklyLeaderboard,
  getSeasonLeaderboard,
  getSurvivalLeaderboard,
  getBundleLeaderboard,
} from "../services/poolLeaderboardService";

// GET /:leagueId/payouts — Get payout summary
poolAdminRouter.get("/:leagueId/payouts", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const summary = await getPayoutSummary(db, Number(leagueId));
  return c.json(summary);
});

// GET /:leagueId/payouts/config — Get payout config
poolAdminRouter.get("/:leagueId/payouts/config", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const config = await loadPayoutConfig(db, Number(leagueId));
  return c.json(config);
});

// PUT /:leagueId/payouts/config — Save payout config
poolAdminRouter.put("/:leagueId/payouts/config", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { buckets, total_pool_cents } = await c.req.json();
  if (!Array.isArray(buckets)) return c.json({ error: "buckets must be an array" }, 400);

  await savePayoutConfig(db, Number(leagueId), buckets, Number(total_pool_cents) || 0);
  await logAuditEvent(db, {
    actorUserId: user.id, actorRole: role || "admin",
    entityType: "league", entityId: Number(leagueId),
    actionType: "payout_config_updated",
    summary: `Payout config updated: ${buckets.length} bucket(s)`,
    detailsJson: { buckets_count: buckets.length, total_pool_cents },
  });

  return c.json({ success: true });
});

// POST /:leagueId/payouts/calculate — Run payout calculation
poolAdminRouter.post("/:leagueId/payouts/calculate", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { period_id, dry_run } = await c.req.json();
  const distribution = await runPayoutCalculation(db, Number(leagueId), period_id, dry_run !== false);
  return c.json(distribution);
});

// POST /:leagueId/payouts/approve — Approve pending payouts
poolAdminRouter.post("/:leagueId/payouts/approve", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { bucket_type, period_id } = await c.req.json();
  const count = await approvePayouts(db, Number(leagueId), String(user.id), bucket_type, period_id);

  await logAuditEvent(db, {
    actorUserId: user.id, actorRole: role || "admin",
    entityType: "league", entityId: Number(leagueId),
    actionType: "payouts_approved", summary: `${count} payout(s) approved`,
    detailsJson: { count, bucket_type, period_id },
  });

  return c.json({ success: true, approved_count: count });
});

// POST /:leagueId/payouts/mark-paid — Mark payouts as paid
poolAdminRouter.post("/:leagueId/payouts/mark-paid", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { payout_ids } = await c.req.json();
  if (!Array.isArray(payout_ids)) return c.json({ error: "payout_ids must be an array" }, 400);

  const count = await markPayoutsPaid(db, payout_ids);
  return c.json({ success: true, paid_count: count });
});

// POST /:leagueId/payouts/void — Void payouts
poolAdminRouter.post("/:leagueId/payouts/void", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { reason, bucket_type, period_id } = await c.req.json();
  const count = await voidPayouts(db, Number(leagueId), reason || "Admin voided", bucket_type, period_id);

  await logAuditEvent(db, {
    actorUserId: user.id, actorRole: role || "admin",
    entityType: "league", entityId: Number(leagueId),
    actionType: "payouts_voided", summary: `${count} payout(s) voided`,
    detailsJson: { count, reason, bucket_type, period_id },
  });

  return c.json({ success: true, voided_count: count });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN CONFIG ENGINE ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /:leagueId/rule-config — Get full resolved rule config
poolAdminRouter.get("/:leagueId/rule-config", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const league = await db.prepare("SELECT format_key, rules_json FROM leagues WHERE id = ?").bind(leagueId).first<{ format_key: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "League not found" }, 404);

  const config = deserializePoolRuleConfig(league.format_key, league.rules_json);
  const fields = getAdminSettingsFields(league.format_key);
  const validation = validatePoolRuleConfig(config);

  return c.json({ config, fields, validation_errors: validation, template: league.format_key });
});

// PUT /:leagueId/rule-config — Update rule config
poolAdminRouter.put("/:leagueId/rule-config", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const league = await db.prepare("SELECT format_key, rules_json FROM leagues WHERE id = ?").bind(leagueId).first<{ format_key: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "League not found" }, 404);

  const overrides = await c.req.json();
  const newConfig = buildPoolRuleConfig(league.format_key, overrides);
  const errors = validatePoolRuleConfig(newConfig);

  if (errors.length > 0) {
    return c.json({ error: "Validation failed", validation_errors: errors }, 400);
  }

  await db.prepare("UPDATE leagues SET rules_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(serializePoolRuleConfig(newConfig), leagueId).run();

  await logAuditEvent(db, {
    actorUserId: user.id, actorRole: role || "admin",
    entityType: "league", entityId: Number(leagueId),
    actionType: "rule_config_updated", summary: "Pool rule config updated",
    detailsJson: { changed_keys: Object.keys(overrides) },
  });

  return c.json({ success: true, config: newConfig });
});

// GET /:leagueId/admin-settings-fields — Get grouped admin fields
poolAdminRouter.get("/:leagueId/admin-settings-fields", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const league = await db.prepare("SELECT format_key FROM leagues WHERE id = ?").bind(leagueId).first<{ format_key: string }>();
  if (!league) return c.json({ error: "League not found" }, 404);

  const fields = getAdminSettingsFields(league.format_key);
  const groups: Record<AdminSettingsGroup, typeof fields> = {
    structure: fields.filter((f) => f.group === "structure"),
    rules: fields.filter((f) => f.group === "rules"),
    scoring: fields.filter((f) => f.group === "scoring"),
    payouts: fields.filter((f) => f.group === "payouts"),
    visibility: fields.filter((f) => f.group === "visibility"),
  };

  return c.json({ groups, template: league.format_key });
});

// ═══════════════════════════════════════════════════════════════
// RECALCULATION ROUTES
// ═══════════════════════════════════════════════════════════════

// POST /:leagueId/recalculate — Safe recalculation
poolAdminRouter.post("/:leagueId/recalculate", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin, role } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { period_id, trigger, dry_run } = await c.req.json();

  const result = await executeRecalculation(c.env, {
    league_id: Number(leagueId),
    period_id: period_id || undefined,
    trigger: trigger || "admin_override",
    dry_run: dry_run !== false,
    triggered_by: String(user.id),
  });

  if (!dry_run) {
    await logAuditEvent(db, {
      actorUserId: user.id, actorRole: role || "admin",
      entityType: "league", entityId: Number(leagueId),
      actionType: "recalculation_executed",
      summary: `Recalculation: ${result.affected_picks} picks, ${result.affected_entries} entries`,
      detailsJson: result,
    });
  }

  return c.json(result);
});

// GET /:leagueId/recalculation-log — View recalculation history
poolAdminRouter.get("/:leagueId/recalculation-log", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const logs = await db.prepare(`
    SELECT id, period_id, trigger_type, triggered_by, is_dry_run, affected_entries, affected_picks, status, started_at, completed_at, created_at
    FROM recalculation_log
    WHERE league_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(leagueId).all();

  return c.json({ logs: logs.results || [] });
});

// ═══════════════════════════════════════════════════════════════
// POOL LEADERBOARD ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /:leagueId/leaderboard — Multi-view leaderboard
poolAdminRouter.get("/:leagueId/leaderboard", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  const view = c.req.query("view") || "season";
  const periodId = c.req.query("period_id") || "";
  const limit = Number(c.req.query("limit")) || 100;

  const league = await db.prepare("SELECT format_key, rules_json FROM leagues WHERE id = ?").bind(leagueId).first<{ format_key: string; rules_json: string | null }>();
  if (!league) return c.json({ error: "League not found" }, 404);

  const config = deserializePoolRuleConfig(league.format_key, league.rules_json);
  const userId = String(user.id);

  switch (view) {
    case "weekly":
      if (!periodId) return c.json({ error: "period_id required for weekly view" }, 400);
      return c.json(await getWeeklyLeaderboard(db, Number(leagueId), periodId, userId, limit));
    case "survival":
      return c.json(await getSurvivalLeaderboard(db, Number(leagueId), userId, limit));
    case "bundle":
      return c.json(await getBundleLeaderboard(db, Number(leagueId), userId, limit));
    case "season":
    default:
      return c.json(await getSeasonLeaderboard(db, Number(leagueId), userId, config.drop_worst_periods, config.best_x_periods, limit));
  }
});

// ═══════════════════════════════════════════════════════════════
// CALCUTTA ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /:leagueId/calcutta/ownerships — Get ownership ledger
poolAdminRouter.get("/:leagueId/calcutta/ownerships", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  const ownerships = await loadCalcuttaOwnerships(db, Number(leagueId));
  return c.json({ ownerships });
});

// POST /:leagueId/calcutta/record-ownership — Record an auction result
poolAdminRouter.post("/:leagueId/calcutta/record-ownership", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { team_id, team_name, user_id, ownership_pct, price_paid_cents, acquired_via } = await c.req.json();
  if (!team_id || !user_id) return c.json({ error: "team_id and user_id required" }, 400);

  await recordCalcuttaOwnership(
    db, Number(leagueId), team_id, team_name || team_id,
    user_id, Number(ownership_pct) || 100, Number(price_paid_cents) || 0,
    acquired_via || "auction",
  );

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// BUNDLE POOL ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /:leagueId/bundle/children — Get child pools
poolAdminRouter.get("/:leagueId/bundle/children", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;

  const children = await db.prepare(`
    SELECT bp.child_league_id, bp.weight, bp.is_active,
           l.name, l.sport_key, l.format_key
    FROM bundle_pools bp
    JOIN leagues l ON bp.child_league_id = l.id
    WHERE bp.parent_league_id = ?
    ORDER BY bp.child_league_id
  `).bind(leagueId).all();

  return c.json({ children: children.results || [] });
});

// POST /:leagueId/bundle/add-child — Add a child pool to bundle
poolAdminRouter.post("/:leagueId/bundle/add-child", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { child_league_id, weight } = await c.req.json();
  if (!child_league_id) return c.json({ error: "child_league_id required" }, 400);

  await db.prepare(`
    INSERT INTO bundle_pools (parent_league_id, child_league_id, weight)
    VALUES (?, ?, ?)
    ON CONFLICT(parent_league_id, child_league_id) DO UPDATE SET weight = excluded.weight, is_active = 1
  `).bind(leagueId, child_league_id, Number(weight) || 1.0).run();

  return c.json({ success: true });
});

// DELETE /:leagueId/bundle/remove-child — Remove a child pool
poolAdminRouter.delete("/:leagueId/bundle/remove-child", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { isAdmin } = await checkPoolAdmin(db, leagueId, user.id);
  if (!isAdmin) return c.json({ error: "Pool admin access required" }, 403);

  const { child_league_id } = await c.req.json();
  if (!child_league_id) return c.json({ error: "child_league_id required" }, 400);

  await db.prepare(`UPDATE bundle_pools SET is_active = 0 WHERE parent_league_id = ? AND child_league_id = ?`)
    .bind(leagueId, child_league_id).run();

  return c.json({ success: true });
});

export { poolAdminRouter };
