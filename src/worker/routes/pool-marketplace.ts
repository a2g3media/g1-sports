import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { isPublicPoolsEnabled } from "../services/featureFlagService";

const poolMarketplaceRouter = new Hono<{ Bindings: Env }>();

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRulesJson(rulesJson: unknown): Record<string, unknown> {
  if (typeof rulesJson !== "string" || !rulesJson.trim()) return {};
  try {
    return JSON.parse(rulesJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getEntriesMax(rules: Record<string, unknown>): number | null {
  const candidates = [
    rules.entriesMax,
    rules.maxEntries,
    rules.max_entries,
    rules.maxParticipants,
    rules.max_members,
  ];
  for (const candidate of candidates) {
    const n = toFiniteNumber(candidate);
    if (n && n > 0) return Math.round(n);
  }
  // Product default for contest-style presentation when commissioner did not configure max.
  return 300;
}

function getPrizePoolCents(
  rules: Record<string, unknown>,
  entryFeeCents: number,
  memberCount: number,
): number {
  const candidates = [
    rules.prizePoolCents,
    rules.prize_pool_cents,
    rules.guaranteedPrizePoolCents,
    rules.guaranteed_prize_pool_cents,
  ];
  for (const candidate of candidates) {
    const n = toFiniteNumber(candidate);
    if (n && n > 0) return Math.round(n);
  }
  if (entryFeeCents > 0 && memberCount > 0) {
    return entryFeeCents * memberCount;
  }
  return 0;
}

function buildRulesSummary(formatKey: string, rules: Record<string, unknown>): string {
  const explicit = String(rules.rulesSummary || rules.rules_summary || "").trim();
  if (explicit) return explicit.slice(0, 220);
  const lockType = String(rules.lockType || "").toLowerCase();
  const visibilityType = String(rules.visibilityType || "").toLowerCase();
  const tiebreaker = String(rules.tiebreakerType || "").toLowerCase();
  const pieces: string[] = [];

  if (formatKey === "survivor") {
    pieces.push("Pick one team each period; wrong pick can eliminate you.");
  } else if (formatKey === "bracket") {
    pieces.push("Bracket format with cumulative scoring by round.");
  } else if (formatKey === "confidence") {
    pieces.push("Rank confidence on picks; higher confidence earns more points.");
  } else {
    pieces.push("Submit picks each period and climb the standings.");
  }

  if (lockType === "first_game") {
    pieces.push("Picks lock at first game start.");
  } else if (lockType === "game_start") {
    pieces.push("Each pick locks at game start.");
  }

  if (visibilityType === "after_lock") {
    pieces.push("Everyone's picks reveal after lock.");
  } else if (visibilityType === "always") {
    pieces.push("Picks are visible immediately.");
  }

  if (tiebreaker === "points" || tiebreaker === "total_points") {
    pieces.push("Ties broken by points.");
  }

  return pieces.slice(0, 3).join(" ");
}

function buildPayoutPreview(
  rules: Record<string, unknown>,
  prizePoolCents: number,
): Array<{ place: string; amount_cents: number }> {
  const raw = Array.isArray(rules.payouts) ? rules.payouts : [];
  const normalized: Array<{ place: string; amount_cents: number }> = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const place = String(row.place || row.rank || row.label || "").trim();
    if (!place) continue;
    const amountCents = toFiniteNumber(row.amount_cents ?? row.amountCents ?? row.cents);
    if (amountCents && amountCents > 0) {
      normalized.push({ place, amount_cents: Math.round(amountCents) });
      continue;
    }
    const pct = toFiniteNumber(row.percent ?? row.percentage ?? row.share);
    if (pct && pct > 0 && prizePoolCents > 0) {
      normalized.push({
        place,
        amount_cents: Math.round((prizePoolCents * pct) / 100),
      });
    }
  }

  if (normalized.length > 0) return normalized.slice(0, 3);
  if (prizePoolCents > 0) return [{ place: "1st", amount_cents: prizePoolCents }];
  return [];
}

function isVerifiedHost(
  rules: Record<string, unknown>,
  ratingCount: number,
  totalPools: number,
): boolean {
  if (rules.verifiedHost === true || rules.verified_host === true) return true;
  // Trust signal fallback until explicit verification workflow is introduced.
  return ratingCount >= 5 || totalPools >= 3;
}

async function isMarketplaceEnabled(db: D1Database): Promise<boolean> {
  const { FeatureFlagService } = await import("../services/featureFlagService");
  const service = new FeatureFlagService(db);
  return service.isEnabled("MARKETPLACE_ENABLED");
}

poolMarketplaceRouter.get("/pools", async (c) => {
  const db = c.env.DB;
  const enabled = await isMarketplaceEnabled(db);
  if (!enabled) {
    return c.json({ error: "Marketplace disabled", feature_flag: "MARKETPLACE_ENABLED" }, 403);
  }

  const publicPoolsEnabled = await isPublicPoolsEnabled(db);
  if (!publicPoolsEnabled) {
    return c.json({ pools: [], categories: [], featured: [] });
  }

  const q = (c.req.query("q") || "").toLowerCase().trim();
  const sportKey = (c.req.query("sport_key") || "").trim();
  const formatKey = (c.req.query("format_key") || "").trim();
  const featuredOnly = c.req.query("featured") === "true";

  let query = `
    SELECT
      l.id,
      l.name,
      l.sport_key,
      l.format_key,
      l.season,
      l.state,
      l.rules_json,
      l.entry_fee_cents,
      l.owner_id,
      (
        SELECT MIN(e.start_at)
        FROM events e
        WHERE e.sport_key = l.sport_key
          AND e.status = 'scheduled'
          AND e.start_at > datetime('now')
      ) as next_lock_at,
      COALESCE(pml.is_featured, 0) as is_featured,
      COALESCE(pml.listing_status, '') as listing_status,
      COALESCE(pml.listing_fee_cents, 0) as listing_fee_cents,
      COALESCE(cp.display_name, u.display_name, 'Commissioner') as commissioner_name,
      COALESCE(cp.avatar_url, u.avatar_url) as commissioner_avatar_url,
      COALESCE(cp.rating_avg, 0) as commissioner_rating,
      COALESCE(cp.rating_count, 0) as commissioner_rating_count,
      COALESCE(cp.total_pools, 0) as commissioner_total_pools,
      (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id AND lm.invite_status = 'joined') as member_count
    FROM leagues l
    JOIN pool_marketplace_listings pml ON pml.league_id = l.id
    LEFT JOIN commissioner_profiles cp ON cp.user_id = l.owner_id
    LEFT JOIN users u ON u.id = l.owner_id
    WHERE l.is_active = 1
      AND l.is_public = 1
      AND pml.listing_status = 'listed'
      AND COALESCE(l.state, 'open') IN ('open', 'locked', 'live')
  `;

  const binds: (string | number)[] = [];
  if (sportKey) {
    query += ` AND l.sport_key = ?`;
    binds.push(sportKey);
  }
  if (formatKey) {
    query += ` AND l.format_key = ?`;
    binds.push(formatKey);
  }
  if (featuredOnly) {
    query += ` AND COALESCE(pml.is_featured, 0) = 1`;
  }
  if (q) {
    query += ` AND (LOWER(l.name) LIKE ? OR LOWER(COALESCE(cp.display_name, u.display_name, '')) LIKE ?)`;
    binds.push(`%${q}%`, `%${q}%`);
  }
  query += ` ORDER BY COALESCE(pml.is_featured, 0) DESC, member_count DESC, l.created_at DESC LIMIT 100`;

  let results: unknown[] = [];
  try {
    const response = await db.prepare(query).bind(...binds).all();
    results = response.results || [];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error || "");
    // Local/dev environments may be missing marketplace tables before migrations.
    // Return a stable empty payload instead of surfacing a 500.
    if (msg.includes("no such table")) {
      return c.json({ pools: [], categories: [], featured: [] });
    }
    throw error;
  }
  const pools = (results || []).map((row) => {
    const rules = parseRulesJson(row.rules_json);
    const memberCount = Number(row.member_count || 0);
    const entryFeeCents = Number(row.entry_fee_cents || 0);
    const entriesMax = getEntriesMax(rules);
    const fillProgress = entriesMax && entriesMax > 0
      ? Math.min(100, Math.round((memberCount / entriesMax) * 100))
      : Math.min(100, Math.round((memberCount / 100) * 100));
    const prizePoolCents = getPrizePoolCents(rules, entryFeeCents, memberCount);
    const payoutPreview = buildPayoutPreview(rules, prizePoolCents);
    const ratingCount = Number(row.commissioner_rating_count || 0);
    const totalPools = Number(row.commissioner_total_pools || 0);

    return {
      id: row.id,
      name: row.name,
      sport_key: row.sport_key,
      format_key: row.format_key,
      season: row.season,
      state: row.state,
      entry_fee_cents: entryFeeCents,
      member_count: memberCount,
      fill_progress: fillProgress,
      is_featured: row.is_featured === 1,
      listing_fee_cents: Number(row.listing_fee_cents || 0),
      commissioner: {
        user_id: row.owner_id,
        name: row.commissioner_name,
        avatar_url: row.commissioner_avatar_url,
        rating: Number(row.commissioner_rating || 0),
        rating_count: ratingCount,
        verified_host: isVerifiedHost(rules, ratingCount, totalPools),
      },
      contest: {
        entry_count: memberCount,
        entries_max: entriesMax,
        lock_at: row.next_lock_at || null,
        prize_pool_cents: prizePoolCents,
        rules_summary: buildRulesSummary(String(row.format_key || ""), rules),
        payout_preview: payoutPreview,
      },
    };
  });

  const categories = Array.from(new Set(pools.map((p) => p.format_key))).sort();
  const featured = pools.filter((p) => p.is_featured);
  return c.json({ pools, categories, featured });
});

poolMarketplaceRouter.get("/pools/:leagueId", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const enabled = await isMarketplaceEnabled(db);
  if (!enabled) {
    return c.json({ error: "Marketplace disabled", feature_flag: "MARKETPLACE_ENABLED" }, 403);
  }

  const leagueId = c.req.param("leagueId");
  const row = await db.prepare(`
    SELECT
      l.id,
      l.name,
      l.sport_key,
      l.format_key,
      l.season,
      l.state,
      l.rules_json,
      l.entry_fee_cents,
      l.owner_id,
      l.is_public,
      (
        SELECT MIN(e.start_at)
        FROM events e
        WHERE e.sport_key = l.sport_key
          AND e.status = 'scheduled'
          AND e.start_at > datetime('now')
      ) as next_lock_at,
      COALESCE(pml.is_featured, 0) as is_featured,
      COALESCE(pml.listing_status, '') as listing_status,
      COALESCE(pml.listing_fee_cents, 0) as listing_fee_cents,
      COALESCE(cp.display_name, u.display_name, 'Commissioner') as commissioner_name,
      COALESCE(cp.avatar_url, u.avatar_url) as commissioner_avatar_url,
      COALESCE(cp.rating_avg, 0) as commissioner_rating,
      COALESCE(cp.rating_count, 0) as commissioner_rating_count,
      COALESCE(cp.total_pools, 0) as commissioner_total_pools,
      (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id AND lm.invite_status = 'joined') as member_count
    FROM leagues l
    LEFT JOIN pool_marketplace_listings pml ON pml.league_id = l.id
    LEFT JOIN commissioner_profiles cp ON cp.user_id = l.owner_id
    LEFT JOIN users u ON u.id = l.owner_id
    WHERE l.id = ? AND l.is_active = 1
    LIMIT 1
  `).bind(leagueId).first();

  if (!row) return c.json({ error: "Pool not found" }, 404);

  const rowRec = row as Record<string, unknown>;
  const listingStatus = String(rowRec.listing_status || "");
  const isPublic = Number(rowRec.is_public || 0) === 1;
  const isListed = listingStatus === "listed";
  const ownerId = String(rowRec.owner_id || "");
  let isMember = false;
  const userId = user?.id ? String(user.id) : "";
  if (userId && ownerId !== userId) {
    const membership = await db.prepare(`
      SELECT 1
      FROM league_members
      WHERE league_id = ? AND user_id = ? AND invite_status != 'removed'
      LIMIT 1
    `).bind(leagueId, userId).first<{ 1: number }>();
    isMember = !!membership;
  }
  const canAccess = (isPublic && isListed) || (!!userId && (ownerId === userId || isMember));
  if (!canAccess) {
    return c.json({ error: "Pool not available in marketplace" }, 404);
  }

  const rules = parseRulesJson(rowRec.rules_json);
  const memberCount = Number(rowRec.member_count || 0);
  const entryFeeCents = Number(rowRec.entry_fee_cents || 0);
  const entriesMax = getEntriesMax(rules);
  const prizePoolCents = getPrizePoolCents(rules, entryFeeCents, memberCount);
  const payoutPreview = buildPayoutPreview(rules, prizePoolCents);
  const ratingCount = Number(rowRec.commissioner_rating_count || 0);
  const totalPools = Number(rowRec.commissioner_total_pools || 0);

  return c.json({
    pool: {
      id: row.id,
      name: row.name,
      sport_key: row.sport_key,
      format_key: row.format_key,
      season: row.season,
      state: row.state,
      entry_fee_cents: entryFeeCents,
      member_count: memberCount,
      is_featured: row.is_featured === 1,
      listing_fee_cents: Number(row.listing_fee_cents || 0),
      commissioner: {
        user_id: row.owner_id,
        name: row.commissioner_name,
        avatar_url: row.commissioner_avatar_url,
        rating: Number(row.commissioner_rating || 0),
        rating_count: ratingCount,
        verified_host: isVerifiedHost(rules, ratingCount, totalPools),
      },
      contest: {
        entry_count: memberCount,
        entries_max: entriesMax,
        lock_at: rowRec.next_lock_at || null,
        prize_pool_cents: prizePoolCents,
        rules_summary: buildRulesSummary(String(row.format_key || ""), rules),
        payout_preview: payoutPreview,
      },
    },
  });
});

poolMarketplaceRouter.get("/commissioners/:userId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = c.env.DB;
  const userId = c.req.param("userId");

  const profile = await db.prepare(`
    SELECT
      cp.user_id,
      cp.display_name,
      cp.avatar_url,
      cp.bio,
      cp.rating_avg,
      cp.rating_count,
      cp.total_pools,
      cp.total_members
    FROM commissioner_profiles cp
    WHERE cp.user_id = ?
  `).bind(userId).first();

  if (!profile) {
    return c.json({
      user_id: userId,
      display_name: "Commissioner",
      rating_avg: 0,
      rating_count: 0,
      total_pools: 0,
      total_members: 0,
    });
  }

  return c.json(profile);
});

poolMarketplaceRouter.get("/commissioners/me", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = c.env.DB;

  const profile = await db.prepare(`
    SELECT user_id, display_name, avatar_url, bio, rating_avg, rating_count, total_pools, total_members
    FROM commissioner_profiles
    WHERE user_id = ?
  `).bind(user.id).first<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    rating_avg: number;
    rating_count: number;
    total_pools: number;
    total_members: number;
  }>();

  if (profile) return c.json(profile);

  const fallback = await db.prepare(`
    SELECT display_name, avatar_url
    FROM users
    WHERE id = ?
  `).bind(user.id).first<{ display_name: string | null; avatar_url: string | null }>();

  return c.json({
    user_id: user.id,
    display_name: fallback?.display_name || "Commissioner",
    avatar_url: fallback?.avatar_url || null,
    bio: null,
    rating_avg: 0,
    rating_count: 0,
    total_pools: 0,
    total_members: 0,
  });
});

poolMarketplaceRouter.patch("/commissioners/me", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = c.env.DB;

  const body = await c.req.json().catch(() => ({}));
  const displayName = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 120) : null;
  const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim().slice(0, 500) : null;
  const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 1000) : null;

  const aggregates = await db.prepare(`
    SELECT
      COALESCE(AVG(cr.rating), 0) as rating_avg,
      COALESCE(COUNT(cr.id), 0) as rating_count,
      COALESCE(COUNT(DISTINCT l.id), 0) as total_pools,
      COALESCE(COUNT(DISTINCT lm.user_id), 0) as total_members
    FROM leagues l
    LEFT JOIN commissioner_ratings cr ON cr.commissioner_user_id = l.owner_id
    LEFT JOIN league_members lm ON lm.league_id = l.id AND lm.invite_status = 'joined'
    WHERE l.owner_id = ?
  `).bind(user.id).first<{ rating_avg: number; rating_count: number; total_pools: number; total_members: number }>();

  await db.prepare(`
    INSERT INTO commissioner_profiles (
      user_id, display_name, avatar_url, bio, rating_avg, rating_count, total_pools, total_members, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, commissioner_profiles.display_name),
      avatar_url = COALESCE(excluded.avatar_url, commissioner_profiles.avatar_url),
      bio = COALESCE(excluded.bio, commissioner_profiles.bio),
      rating_avg = excluded.rating_avg,
      rating_count = excluded.rating_count,
      total_pools = excluded.total_pools,
      total_members = excluded.total_members,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    user.id,
    displayName || user.email?.split("@")[0] || "Commissioner",
    avatarUrl || null,
    bio || null,
    Number(aggregates?.rating_avg || 0),
    Number(aggregates?.rating_count || 0),
    Number(aggregates?.total_pools || 0),
    Number(aggregates?.total_members || 0),
  ).run();

  return c.json({ success: true });
});

poolMarketplaceRouter.post("/pools/:leagueId/rate", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const leagueId = c.req.param("leagueId");
  const db = c.env.DB;
  const { FeatureFlagService } = await import("../services/featureFlagService");
  const flags = new FeatureFlagService(db);
  const ratingsEnabled = await flags.isEnabled("COMMISSIONER_RATINGS_ENABLED");
  if (!ratingsEnabled) {
    return c.json({ error: "Ratings disabled", feature_flag: "COMMISSIONER_RATINGS_ENABLED" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const rating = Number(body.rating);
  const review = typeof body.review === "string" ? body.review.trim().slice(0, 500) : null;

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return c.json({ error: "Rating must be between 1 and 5" }, 400);
  }

  const league = await db.prepare(`SELECT id, owner_id FROM leagues WHERE id = ?`).bind(leagueId).first<{ id: number; owner_id: string }>();
  if (!league) return c.json({ error: "Pool not found" }, 404);
  if (league.owner_id === user.id) return c.json({ error: "Cannot rate your own pool" }, 400);

  await db.prepare(`
    INSERT INTO commissioner_ratings (league_id, commissioner_user_id, rater_user_id, rating, review)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(league_id, rater_user_id) DO UPDATE SET
      rating = excluded.rating,
      review = excluded.review,
      updated_at = CURRENT_TIMESTAMP
  `).bind(league.id, league.owner_id, user.id, rating, review).run();

  // Refresh cached profile aggregates.
  await db.prepare(`
    INSERT INTO commissioner_profiles (
      user_id, display_name, avatar_url, rating_avg, rating_count, total_pools, total_members, updated_at
    )
    SELECT
      l.owner_id,
      COALESCE(u.display_name, 'Commissioner'),
      u.avatar_url,
      COALESCE(AVG(cr.rating), 0),
      COALESCE(COUNT(cr.id), 0),
      COALESCE(COUNT(DISTINCT l.id), 0),
      COALESCE(COUNT(DISTINCT lm.user_id), 0),
      CURRENT_TIMESTAMP
    FROM leagues l
    LEFT JOIN users u ON u.id = l.owner_id
    LEFT JOIN commissioner_ratings cr ON cr.commissioner_user_id = l.owner_id
    LEFT JOIN league_members lm ON lm.league_id = l.id AND lm.invite_status = 'joined'
    WHERE l.owner_id = ?
    GROUP BY l.owner_id, u.display_name, u.avatar_url
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      rating_avg = excluded.rating_avg,
      rating_count = excluded.rating_count,
      total_pools = excluded.total_pools,
      total_members = excluded.total_members,
      updated_at = CURRENT_TIMESTAMP
  `).bind(league.owner_id).run();

  return c.json({ success: true });
});

export { poolMarketplaceRouter };
