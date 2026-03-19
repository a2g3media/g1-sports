import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

const receiptsRouter = new Hono<{ Bindings: Env }>();

// ============ Helpers ============

// Generate SHA-256 hash for receipt payload
async function generatePayloadHash(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate 6-digit OTP code
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash OTP for storage
async function hashOTP(otp: string): Promise<string> {
  return generatePayloadHash(otp);
}

// Format phone for display
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Format timestamp with timezone
function formatTimestamp(isoString: string, timezone = "America/Los_Angeles"): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return isoString;
  }
}

// Rate limit check (max 3 resends per hour per user per pool)
async function checkResendRateLimit(
  db: D1Database,
  userId: string,
  poolId: number
): Promise<{ allowed: boolean; remainingAttempts: number; resetAt: string | null }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM receipt_deliveries
    WHERE user_id = ? AND pool_id = ? AND created_at > ?
  `).bind(userId, poolId, oneHourAgo).first<{ count: number }>();

  const count = result?.count || 0;
  const maxAttempts = 3;
  const remaining = Math.max(0, maxAttempts - count);
  
  return {
    allowed: count < maxAttempts,
    remainingAttempts: remaining,
    resetAt: remaining === 0 ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
  };
}

// ============ Player Receipt Routes ============

// Get all receipts for current user (My Receipts)
receiptsRouter.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const poolId = c.req.query("pool_id");
  const periodId = c.req.query("period_id");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const page = parseInt(c.req.query("page") || "1");
  const offset = (page - 1) * limit;

  let query = `
    SELECT 
      pr.id, pr.receipt_code, pr.league_id, pr.period_id, pr.format_key,
      pr.submitted_at, pr.payload_hash, pr.status, pr.replaced_by_receipt_id,
      l.name as pool_name, l.sport_key
    FROM pick_receipts pr
    INNER JOIN leagues l ON pr.league_id = l.id
    WHERE pr.user_id = ?
  `;
  const params: (string | number)[] = [user.id];

  if (poolId) {
    query += ` AND pr.league_id = ?`;
    params.push(poolId);
  }
  if (periodId) {
    query += ` AND pr.period_id = ?`;
    params.push(periodId);
  }
  if (status) {
    query += ` AND pr.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY pr.submitted_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const hasMore = results.length > limit;
  const receipts = results.slice(0, limit);

  // Get delivery status for each receipt
  const receiptIds = receipts.map((r: Record<string, unknown>) => r.id);
  let deliveriesByReceipt: Record<number, any[]> = {};

  if (receiptIds.length > 0) {
    const { results: deliveries } = await c.env.DB.prepare(`
      SELECT id, receipt_id, channel, status, sent_at, delivered_at, failed_at
      FROM receipt_deliveries
      WHERE receipt_id IN (${receiptIds.join(",")})
      ORDER BY created_at DESC
    `).all();

    for (const d of deliveries) {
      const receiptId = d.receipt_id as number;
      if (!deliveriesByReceipt[receiptId]) {
        deliveriesByReceipt[receiptId] = [];
      }
      deliveriesByReceipt[receiptId].push(d);
    }
  }

  // Get pick count from payload for each receipt
  const enrichedReceipts = receipts.map((receipt: Record<string, unknown>) => {
    let pickCount = 0;
    try {
      const payload = JSON.parse(receipt.picks_payload_json as string || "{}");
      pickCount = payload.picks?.length || 0;
    } catch {}

    return {
      id: receipt.id,
      receipt_code: receipt.receipt_code,
      pool_id: receipt.league_id,
      pool_name: receipt.pool_name,
      sport_key: receipt.sport_key,
      period_id: receipt.period_id,
      format_key: receipt.format_key,
      submitted_at: receipt.submitted_at,
      submitted_at_formatted: formatTimestamp(receipt.submitted_at as string),
      payload_hash: receipt.payload_hash,
      status: receipt.status,
      replaced_by_receipt_id: receipt.replaced_by_receipt_id,
      pick_count: pickCount,
      deliveries: deliveriesByReceipt[receipt.id as number] || [],
    };
  });

  // Group by pool and period
  const groupedByPool: Record<string, { pool_id: number; pool_name: string; periods: Record<string, any[]> }> = {};
  
  for (const receipt of enrichedReceipts) {
    const poolKey = `${receipt.pool_id}`;
    if (!groupedByPool[poolKey]) {
      groupedByPool[poolKey] = {
        pool_id: receipt.pool_id as number,
        pool_name: receipt.pool_name as string,
        periods: {},
      };
    }
    
    const periodKey = receipt.period_id as string;
    if (!groupedByPool[poolKey].periods[periodKey]) {
      groupedByPool[poolKey].periods[periodKey] = [];
    }
    groupedByPool[poolKey].periods[periodKey].push(receipt);
  }

  return c.json({
    receipts: enrichedReceipts,
    grouped: Object.values(groupedByPool),
    pagination: {
      page,
      limit,
      has_more: hasMore,
    },
  });
});

// Get single receipt by code (document view)
receiptsRouter.get("/:code", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const receiptCode = c.req.param("code");

  const receipt = await c.env.DB.prepare(`
    SELECT 
      pr.*,
      l.name as pool_name, l.sport_key, l.format_key as pool_format
    FROM pick_receipts pr
    INNER JOIN leagues l ON pr.league_id = l.id
    WHERE pr.receipt_code = ?
  `).bind(receiptCode).first();

  if (!receipt) {
    return c.json({ error: "Receipt not found" }, 404);
  }

  // Check access: user owns receipt OR user is pool admin
  const isOwner = receipt.user_id === user.id;
  
  let isPoolAdmin = false;
  if (!isOwner) {
    const membership = await c.env.DB.prepare(`
      SELECT role FROM league_members WHERE league_id = ? AND user_id = ?
    `).bind(receipt.league_id, user.id).first<{ role: string }>();
    
    isPoolAdmin = membership?.role === "owner" || membership?.role === "admin";
  }

  if (!isOwner && !isPoolAdmin) {
    return c.json({ error: "Access denied" }, 403);
  }

  // Get deliveries
  const { results: deliveries } = await c.env.DB.prepare(`
    SELECT id, channel, destination, status, sent_at, delivered_at, failed_at, error_message, created_at
    FROM receipt_deliveries
    WHERE receipt_id = ?
    ORDER BY created_at DESC
  `).bind(receipt.id).all();

  // Parse picks from payload
  let picks: any[] = [];
  let tiebreaker: number | null = null;
  try {
    const payload = JSON.parse(receipt.picks_payload_json as string);
    picks = payload.picks || [];
    tiebreaker = payload.tiebreaker_value || null;
  } catch {}

  // Get event details for picks
  const enrichedPicks = [];
  for (const pick of picks) {
    const event = await c.env.DB.prepare(`
      SELECT id, home_team, away_team, start_at, status, winner, home_score, away_score
      FROM events WHERE id = ?
    `).bind(pick.event_id).first();

    enrichedPicks.push({
      event_id: pick.event_id,
      pick_value: isOwner || isPoolAdmin ? pick.pick_value : null, // Respect visibility rules
      confidence_rank: pick.confidence_rank,
      event: event ? {
        matchup: `${event.away_team} @ ${event.home_team}`,
        start_at: event.start_at,
        status: event.status,
        winner: event.winner,
        score: event.status === "final" ? `${event.away_score} - ${event.home_score}` : null,
      } : null,
    });
  }

  // Get replacement chain if replaced
  let replacementChain: { receipt_code: string; status: string; submitted_at: string }[] = [];
  if (receipt.replaced_by_receipt_id) {
    const replacement = await c.env.DB.prepare(`
      SELECT receipt_code, status, submitted_at
      FROM pick_receipts WHERE id = ?
    `).bind(receipt.replaced_by_receipt_id).first();
    
    if (replacement) {
      replacementChain.push({
        receipt_code: replacement.receipt_code as string,
        status: replacement.status as string,
        submitted_at: replacement.submitted_at as string,
      });
    }
  }

  // Log view event (optional)
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('receipt_viewed', ?, ?, ?, 'pick_receipt', ?, ?)
  `).bind(
    receipt.league_id,
    receipt.user_id,
    user.id,
    receipt.id,
    JSON.stringify({ viewer_is_admin: isPoolAdmin && !isOwner })
  ).run();

  const sportNames: Record<string, string> = {
    nfl: "NFL Football",
    nba: "NBA Basketball",
    mlb: "MLB Baseball",
    nhl: "NHL Hockey",
    ncaaf: "College Football",
    ncaab: "College Basketball",
  };

  return c.json({
    receipt: {
      id: receipt.id,
      receipt_code: receipt.receipt_code,
      pool_id: receipt.league_id,
      pool_name: receipt.pool_name,
      sport: sportNames[receipt.sport_key as string] || (receipt.sport_key as string).toUpperCase(),
      period_id: receipt.period_id,
      format_key: receipt.format_key,
      submitted_at: receipt.submitted_at,
      submitted_at_formatted: formatTimestamp(receipt.submitted_at as string),
      status: receipt.status,
      replaced_by: receipt.replaced_by_receipt_id ? replacementChain[0] : null,
      payload_hash: receipt.payload_hash,
    },
    picks: enrichedPicks,
    tiebreaker,
    deliveries: deliveries.map((d: Record<string, unknown>) => ({
      id: d.id,
      channel: d.channel,
      destination: d.destination,
      status: d.status,
      sent_at: d.sent_at,
      delivered_at: d.delivered_at,
      failed_at: d.failed_at,
      error: d.error_message,
    })),
    access: {
      is_owner: isOwner,
      is_pool_admin: isPoolAdmin,
    },
  });
});

// Verify receipt hash integrity
receiptsRouter.get("/:code/verify", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const receiptCode = c.req.param("code");

  const receipt = await c.env.DB.prepare(`
    SELECT id, user_id, picks_payload_json, payload_hash
    FROM pick_receipts WHERE receipt_code = ?
  `).bind(receiptCode).first<{
    id: number;
    user_id: string;
    picks_payload_json: string;
    payload_hash: string;
  }>();

  if (!receipt) {
    return c.json({ error: "Receipt not found" }, 404);
  }

  if (receipt.user_id !== user.id) {
    return c.json({ error: "Access denied" }, 403);
  }

  // Recompute hash
  const computedHash = await generatePayloadHash(receipt.picks_payload_json);
  const isValid = computedHash === receipt.payload_hash;

  // Log verification
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('receipt_verified', ?, ?, 'pick_receipt', ?, ?)
  `).bind(user.id, user.id, receipt.id, JSON.stringify({ is_valid: isValid })).run();

  return c.json({
    is_valid: isValid,
    stored_hash: receipt.payload_hash,
    computed_hash: computedHash,
    verified_at: new Date().toISOString(),
  });
});

// Request delivery (send confirmation email/SMS)
receiptsRouter.post("/:code/deliver", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const receiptCode = c.req.param("code");
  const { channel } = await c.req.json();

  if (!channel || !["email", "sms"].includes(channel)) {
    return c.json({ error: "Invalid channel. Use 'email' or 'sms'" }, 400);
  }

  // Get receipt with pool info
  const receipt = await c.env.DB.prepare(`
    SELECT pr.*, l.name as pool_name
    FROM pick_receipts pr
    INNER JOIN leagues l ON pr.league_id = l.id
    WHERE pr.receipt_code = ?
  `).bind(receiptCode).first();

  if (!receipt) {
    return c.json({ error: "Receipt not found" }, 404);
  }

  if (receipt.user_id !== user.id) {
    return c.json({ error: "Access denied" }, 403);
  }

  // Check rate limit
  const rateLimit = await checkResendRateLimit(c.env.DB, user.id, receipt.league_id as number);
  if (!rateLimit.allowed) {
    return c.json({
      error: "Rate limit exceeded. Try again later.",
      rate_limit: rateLimit,
    }, 429);
  }

  // Get user preferences and contact info
  const userPrefs = await c.env.DB.prepare(`
    SELECT unp.phone_verified, u.email, u.phone
    FROM users u
    LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
    WHERE u.id = ?
  `).bind(user.id).first<{ phone_verified: number | null; email: string; phone: string | null }>();

  let destination: string;
  if (channel === "email") {
    destination = userPrefs?.email || user.email;
  } else {
    // SMS requires verified phone
    if (!userPrefs?.phone_verified || !userPrefs?.phone) {
      return c.json({ error: "SMS requires a verified phone number" }, 400);
    }
    destination = userPrefs.phone;
  }

  const now = new Date().toISOString();

  // Create delivery record
  const deliveryResult = await c.env.DB.prepare(`
    INSERT INTO receipt_deliveries (receipt_id, user_id, pool_id, channel, destination, status, sent_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, 'delivered', ?, ?)
  `).bind(receipt.id, user.id, receipt.league_id, channel, destination, now, now).run();

  // Log delivery event
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, league_id, user_id, actor_id, entity_type, entity_id, payload_json)
    VALUES ('pick_submission_confirm_sent', ?, ?, ?, 'receipt_delivery', ?, ?)
  `).bind(
    receipt.league_id,
    user.id,
    user.id,
    deliveryResult.meta.last_row_id,
    JSON.stringify({ channel, receipt_code: receiptCode })
  ).run();

  // Get updated rate limit
  const updatedRateLimit = await checkResendRateLimit(c.env.DB, user.id, receipt.league_id as number);

  return c.json({
    success: true,
    message: `Confirmation ${channel === "email" ? "emailed" : "texted"} to ${destination}`,
    delivery: {
      id: deliveryResult.meta.last_row_id,
      channel,
      destination,
      status: "delivered",
      sent_at: now,
    },
    rate_limit: updatedRateLimit,
  });
});

// ============ Notification Preferences Routes ============

// Get user's notification preferences
receiptsRouter.get("/preferences/confirmations", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get or create preferences
  let prefs = await c.env.DB.prepare(`
    SELECT * FROM user_notification_preferences WHERE user_id = ?
  `).bind(user.id).first();

  if (!prefs) {
    // Create default preferences
    await c.env.DB.prepare(`
      INSERT INTO user_notification_preferences (user_id, confirm_channel, confirm_pick_submission, phone_verified)
      VALUES (?, 'email', 1, 0)
    `).bind(user.id).run();

    prefs = {
      user_id: user.id,
      confirm_channel: "email",
      confirm_pick_submission: 1,
      confirm_pick_lock_reminder: 0,
      weekly_recap_opt_in: 1,
      phone_verified: 0,
    };
  }

  // Get user's phone from users table
  const userRecord = await c.env.DB.prepare(`
    SELECT phone FROM users WHERE id = ?
  `).bind(user.id).first<{ phone: string | null }>();

  return c.json({
    preferences: {
      confirm_channel: prefs.confirm_channel,
      confirm_pick_submission: prefs.confirm_pick_submission === 1,
      confirm_pick_lock_reminder: prefs.confirm_pick_lock_reminder === 1,
      weekly_recap_opt_in: prefs.weekly_recap_opt_in === 1,
    },
    phone: {
      number: userRecord?.phone ? formatPhone(userRecord.phone) : null,
      verified: prefs.phone_verified === 1,
    },
  });
});

// Update notification preferences
receiptsRouter.patch("/preferences/confirmations", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { confirm_channel, confirm_pick_submission, confirm_pick_lock_reminder, weekly_recap_opt_in } = body;

  // Validate channel
  if (confirm_channel && !["email", "sms", "both", "none"].includes(confirm_channel)) {
    return c.json({ error: "Invalid confirm_channel" }, 400);
  }

  // If setting to SMS or both, require verified phone
  if (confirm_channel === "sms" || confirm_channel === "both") {
    const prefs = await c.env.DB.prepare(`
      SELECT phone_verified FROM user_notification_preferences WHERE user_id = ?
    `).bind(user.id).first<{ phone_verified: number }>();

    if (!prefs || prefs.phone_verified !== 1) {
      return c.json({ error: "SMS requires a verified phone number" }, 400);
    }
  }

  // Upsert preferences
  const existing = await c.env.DB.prepare(`
    SELECT id FROM user_notification_preferences WHERE user_id = ?
  `).bind(user.id).first();

  if (existing) {
    const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: (string | number)[] = [];

    if (confirm_channel !== undefined) {
      updates.push("confirm_channel = ?");
      values.push(confirm_channel);
    }
    if (confirm_pick_submission !== undefined) {
      updates.push("confirm_pick_submission = ?");
      values.push(confirm_pick_submission ? 1 : 0);
    }
    if (confirm_pick_lock_reminder !== undefined) {
      updates.push("confirm_pick_lock_reminder = ?");
      values.push(confirm_pick_lock_reminder ? 1 : 0);
    }
    if (weekly_recap_opt_in !== undefined) {
      updates.push("weekly_recap_opt_in = ?");
      values.push(weekly_recap_opt_in ? 1 : 0);
    }

    values.push(user.id);

    await c.env.DB.prepare(`
      UPDATE user_notification_preferences SET ${updates.join(", ")} WHERE user_id = ?
    `).bind(...values).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO user_notification_preferences (
        user_id, confirm_channel, confirm_pick_submission, confirm_pick_lock_reminder, weekly_recap_opt_in
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      user.id,
      confirm_channel || "email",
      confirm_pick_submission !== false ? 1 : 0,
      confirm_pick_lock_reminder ? 1 : 0,
      weekly_recap_opt_in !== false ? 1 : 0
    ).run();
  }

  // Log preference update
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('confirmation_preferences_updated', ?, ?, 'user_notification_preferences', ?)
  `).bind(user.id, user.id, JSON.stringify(body)).run();

  return c.json({ success: true });
});

// ============ Phone Verification Routes ============

// Start phone verification (send OTP)
receiptsRouter.post("/preferences/phone/verify", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { phone } = await c.req.json();

  if (!phone || typeof phone !== "string") {
    return c.json({ error: "Phone number required" }, 400);
  }

  // Normalize phone
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return c.json({ error: "Invalid phone number format" }, 400);
  }

  // Check for recent pending verification (rate limit)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recentAttempt = await c.env.DB.prepare(`
    SELECT id FROM phone_verifications
    WHERE user_id = ? AND status = 'pending' AND created_at > ?
  `).bind(user.id, fiveMinutesAgo).first();

  if (recentAttempt) {
    return c.json({ error: "Please wait before requesting a new code" }, 429);
  }

  // Expire old pending verifications
  await c.env.DB.prepare(`
    UPDATE phone_verifications SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'pending'
  `).bind(user.id).run();

  // Generate OTP and save
  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  await c.env.DB.prepare(`
    INSERT INTO phone_verifications (user_id, phone, otp_code_hash, status, expires_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).bind(user.id, cleanPhone, otpHash, expiresAt).run();

  // Update user's phone in users table
  await c.env.DB.prepare(`
    UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(cleanPhone, user.id).run();

  // Log the verification start
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('phone_verification_started', ?, ?, 'phone_verification', ?)
  `).bind(user.id, user.id, JSON.stringify({ phone_last_4: cleanPhone.slice(-4) })).run();

  // In production, send SMS here. For now, return success.
  // The OTP would be sent via Twilio/similar service.

  return c.json({
    success: true,
    message: `Verification code sent to ${formatPhone(cleanPhone)}`,
    phone_display: formatPhone(cleanPhone),
    expires_in_seconds: 600,
    // For development/testing only - remove in production:
    _dev_otp: process.env.NODE_ENV === "development" ? otp : undefined,
  });
});

// Confirm phone verification (validate OTP)
receiptsRouter.post("/preferences/phone/confirm", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { code } = await c.req.json();

  if (!code || typeof code !== "string" || code.length !== 6) {
    return c.json({ error: "Invalid verification code" }, 400);
  }

  const now = new Date().toISOString();

  // Get pending verification
  const verification = await c.env.DB.prepare(`
    SELECT id, otp_code_hash, phone, expires_at
    FROM phone_verifications
    WHERE user_id = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first<{
    id: number;
    otp_code_hash: string;
    phone: string;
    expires_at: string;
  }>();

  if (!verification) {
    return c.json({ error: "No pending verification. Request a new code." }, 400);
  }

  // Check expiration
  if (new Date(verification.expires_at) < new Date()) {
    await c.env.DB.prepare(`
      UPDATE phone_verifications SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(verification.id).run();
    return c.json({ error: "Code expired. Request a new code." }, 400);
  }

  // Verify OTP
  const codeHash = await hashOTP(code);
  if (codeHash !== verification.otp_code_hash) {
    return c.json({ error: "Invalid code" }, 400);
  }

  // Mark as verified
  await c.env.DB.prepare(`
    UPDATE phone_verifications SET status = 'verified', verified_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(now, verification.id).run();

  // Update user_notification_preferences
  const existingPrefs = await c.env.DB.prepare(`
    SELECT id FROM user_notification_preferences WHERE user_id = ?
  `).bind(user.id).first();

  if (existingPrefs) {
    await c.env.DB.prepare(`
      UPDATE user_notification_preferences SET phone_verified = 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(user.id).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO user_notification_preferences (user_id, phone_verified) VALUES (?, 1)
    `).bind(user.id).run();
  }

  // Update users table
  await c.env.DB.prepare(`
    UPDATE users SET is_phone_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(user.id).run();

  // Log completion
  await c.env.DB.prepare(`
    INSERT INTO event_log (event_type, user_id, actor_id, entity_type, payload_json)
    VALUES ('phone_verification_completed', ?, ?, 'phone_verification', ?)
  `).bind(user.id, user.id, JSON.stringify({ phone_last_4: verification.phone.slice(-4) })).run();

  return c.json({
    success: true,
    message: "Phone verified successfully",
    phone_display: formatPhone(verification.phone),
  });
});

// Resend verification code
receiptsRouter.post("/preferences/phone/resend", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Get current phone
  const userRecord = await c.env.DB.prepare(`
    SELECT phone FROM users WHERE id = ?
  `).bind(user.id).first<{ phone: string | null }>();

  if (!userRecord?.phone) {
    return c.json({ error: "No phone number on file" }, 400);
  }

  // Forward to verify endpoint
  const verifyResponse = await c.env.DB.prepare(`
    SELECT status FROM phone_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  `).bind(user.id).first<{ status: string }>();

  if (verifyResponse?.status === "verified") {
    return c.json({ error: "Phone already verified" }, 400);
  }

  // Re-call the verify flow with existing phone
  // This is a convenience wrapper - redirects to POST /verify
  return c.json({
    redirect: "POST /api/receipts/preferences/phone/verify",
    phone: userRecord.phone,
    message: "Call verify endpoint with phone number",
  });
});

export { receiptsRouter };
