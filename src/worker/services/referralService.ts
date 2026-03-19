/**
 * Referral Service
 * Handles referral code generation, tracking, and reward logic
 * 
 * Anti-abuse measures:
 * - One code per user (immutable)
 * - Self-referral prevention
 * - One reward per unique paying account
 * - Rewards only after first successful payment
 * - Max 90 bonus days cap (stackable but capped)
 */

// Configuration
const REFERRAL_CODE_LENGTH = 8;
const DAYS_PER_REFERRAL = 7;
const MAX_BONUS_DAYS = 90;

/**
 * Generate a unique, human-readable referral code
 * Format: 8 alphanumeric characters (uppercase, no confusing chars like 0/O, 1/I/L)
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get or create a referral code for a user
 * Codes are immutable once created
 */
export async function getOrCreateReferralCode(
  db: D1Database,
  userId: string
): Promise<{ code: string; isNew: boolean }> {
  // Check for existing code
  const existing = await db.prepare(
    'SELECT referral_code FROM user_referral_codes WHERE user_id = ?'
  ).bind(userId).first<{ referral_code: string }>();

  if (existing) {
    return { code: existing.referral_code, isNew: false };
  }

  // Generate new code with collision check
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateReferralCode();
    const collision = await db.prepare(
      'SELECT id FROM user_referral_codes WHERE referral_code = ?'
    ).bind(code).first();
    
    if (!collision) break;
    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    // Fallback: append user ID suffix
    code = generateReferralCode() + userId.slice(0, 4).toUpperCase();
  }

  // Insert new code
  await db.prepare(
    'INSERT INTO user_referral_codes (user_id, referral_code) VALUES (?, ?)'
  ).bind(userId, code).run();

  return { code, isNew: true };
}

/**
 * Look up a referral code to find the referrer
 */
export async function lookupReferralCode(
  db: D1Database,
  code: string
): Promise<{ userId: string } | null> {
  const result = await db.prepare(
    'SELECT user_id FROM user_referral_codes WHERE referral_code = ?'
  ).bind(code.toUpperCase().trim()).first<{ user_id: string }>();

  return result ? { userId: result.user_id } : null;
}

/**
 * Record a referral when a new user signs up with a code
 * Anti-abuse: Prevents self-referral and duplicate referrals
 */
export async function recordReferral(
  db: D1Database,
  referredUserId: string,
  referralCode: string
): Promise<{ success: boolean; error?: string }> {
  // Look up the referrer
  const referrer = await lookupReferralCode(db, referralCode);
  if (!referrer) {
    return { success: false, error: 'Invalid referral code' };
  }

  // Anti-abuse: Prevent self-referral
  if (referrer.userId === referredUserId) {
    return { success: false, error: 'Cannot use your own referral code' };
  }

  // Check if user was already referred
  const existingReferral = await db.prepare(
    'SELECT id FROM referrals WHERE referred_user_id = ?'
  ).bind(referredUserId).first();

  if (existingReferral) {
    return { success: false, error: 'User already has a referral recorded' };
  }

  // Record the referral (not yet eligible for reward)
  await db.prepare(`
    INSERT INTO referrals (referrer_user_id, referred_user_id, referral_code_used, referred_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(referrer.userId, referredUserId, referralCode.toUpperCase().trim()).run();

  return { success: true };
}

/**
 * Mark a referral as eligible and grant reward when referred user makes first payment
 * This should be called from payment webhook handler
 */
export async function processReferralPayment(
  db: D1Database,
  paidUserId: string
): Promise<{ rewardGranted: boolean; referrerId?: string; daysGranted?: number }> {
  // Find the referral record for this user
  const referral = await db.prepare(`
    SELECT id, referrer_user_id, is_reward_eligible, reward_granted_at
    FROM referrals 
    WHERE referred_user_id = ?
  `).bind(paidUserId).first<{
    id: number;
    referrer_user_id: string;
    is_reward_eligible: number;
    reward_granted_at: string | null;
  }>();

  if (!referral) {
    // User wasn't referred
    return { rewardGranted: false };
  }

  if (referral.reward_granted_at) {
    // Reward already granted (one-time only)
    return { rewardGranted: false };
  }

  // Update referral as eligible and record first payment
  await db.prepare(`
    UPDATE referrals 
    SET is_reward_eligible = 1, 
        first_payment_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(referral.id).run();

  // Grant reward to referrer
  const grantResult = await grantReferralReward(db, referral.referrer_user_id, referral.id);

  return {
    rewardGranted: grantResult.success,
    referrerId: referral.referrer_user_id,
    daysGranted: grantResult.daysGranted
  };
}

/**
 * Grant bonus Pro days to a referrer
 * Stackable but capped at MAX_BONUS_DAYS
 */
async function grantReferralReward(
  db: D1Database,
  userId: string,
  referralId: number
): Promise<{ success: boolean; daysGranted: number; totalDays: number }> {
  // Get or create user bonus days record
  let bonusDays = await db.prepare(
    'SELECT * FROM user_bonus_days WHERE user_id = ?'
  ).bind(userId).first<{
    id: number;
    total_days_earned: number;
    days_remaining: number;
  }>();

  if (!bonusDays) {
    await db.prepare(`
      INSERT INTO user_bonus_days (user_id, total_days_earned, total_days_used, days_remaining)
      VALUES (?, 0, 0, 0)
    `).bind(userId).run();
    
    bonusDays = {
      id: 0,
      total_days_earned: 0,
      days_remaining: 0
    };
  }

  // Calculate days to grant (respect cap)
  const currentTotal = bonusDays.total_days_earned;
  const daysToGrant = Math.min(DAYS_PER_REFERRAL, MAX_BONUS_DAYS - currentTotal);

  if (daysToGrant <= 0) {
    // User has reached the cap
    return { success: false, daysGranted: 0, totalDays: currentTotal };
  }

  const newTotal = currentTotal + daysToGrant;
  const newRemaining = bonusDays.days_remaining + daysToGrant;

  // Update user bonus days
  await db.prepare(`
    UPDATE user_bonus_days 
    SET total_days_earned = ?,
        days_remaining = ?,
        last_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).bind(newTotal, newRemaining, userId).run();

  // Record the reward
  await db.prepare(`
    INSERT INTO referral_rewards (user_id, referral_id, reward_type, days_granted, total_days_after)
    VALUES (?, ?, 'PRO_DAYS', ?, ?)
  `).bind(userId, referralId, daysToGrant, newTotal).run();

  // Mark referral as rewarded
  await db.prepare(`
    UPDATE referrals 
    SET reward_granted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(referralId).run();

  return { success: true, daysGranted: daysToGrant, totalDays: newTotal };
}

/**
 * Get referral stats for a user
 */
export async function getReferralStats(
  db: D1Database,
  userId: string
): Promise<{
  referralCode: string;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalBonusDaysEarned: number;
  bonusDaysRemaining: number;
  recentReferrals: Array<{
    referredAt: string;
    isRewarded: boolean;
  }>;
}> {
  // Get or create referral code
  const { code } = await getOrCreateReferralCode(db, userId);

  // Get referral counts
  const stats = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN reward_granted_at IS NOT NULL THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN reward_granted_at IS NULL THEN 1 ELSE 0 END) as pending
    FROM referrals 
    WHERE referrer_user_id = ?
  `).bind(userId).first<{
    total: number;
    successful: number;
    pending: number;
  }>();

  // Get bonus days balance
  const bonusDays = await db.prepare(
    'SELECT total_days_earned, days_remaining FROM user_bonus_days WHERE user_id = ?'
  ).bind(userId).first<{
    total_days_earned: number;
    days_remaining: number;
  }>();

  // Get recent referrals (last 10)
  const recentResults = await db.prepare(`
    SELECT referred_at, reward_granted_at
    FROM referrals 
    WHERE referrer_user_id = ?
    ORDER BY referred_at DESC
    LIMIT 10
  `).bind(userId).all<{
    referred_at: string;
    reward_granted_at: string | null;
  }>();

  return {
    referralCode: code,
    totalReferrals: stats?.total || 0,
    successfulReferrals: stats?.successful || 0,
    pendingReferrals: stats?.pending || 0,
    totalBonusDaysEarned: bonusDays?.total_days_earned || 0,
    bonusDaysRemaining: bonusDays?.days_remaining || 0,
    recentReferrals: (recentResults.results || []).map(r => ({
      referredAt: r.referred_at,
      isRewarded: r.reward_granted_at !== null
    }))
  };
}

/**
 * Check if a user has bonus days available
 */
export async function checkBonusDays(
  db: D1Database,
  userId: string
): Promise<{ available: boolean; daysRemaining: number }> {
  const bonusDays = await db.prepare(
    'SELECT days_remaining FROM user_bonus_days WHERE user_id = ?'
  ).bind(userId).first<{ days_remaining: number }>();

  const remaining = bonusDays?.days_remaining || 0;
  return { available: remaining > 0, daysRemaining: remaining };
}

/**
 * Use one bonus day (called daily for users with bonus days active)
 */
export async function useBonusDay(
  db: D1Database,
  userId: string
): Promise<{ success: boolean; daysRemaining: number }> {
  const bonusDays = await db.prepare(
    'SELECT days_remaining, total_days_used FROM user_bonus_days WHERE user_id = ?'
  ).bind(userId).first<{
    days_remaining: number;
    total_days_used: number;
  }>();

  if (!bonusDays || bonusDays.days_remaining <= 0) {
    return { success: false, daysRemaining: 0 };
  }

  const newRemaining = bonusDays.days_remaining - 1;
  const newUsed = bonusDays.total_days_used + 1;

  await db.prepare(`
    UPDATE user_bonus_days 
    SET days_remaining = ?,
        total_days_used = ?,
        last_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).bind(newRemaining, newUsed, userId).run();

  return { success: true, daysRemaining: newRemaining };
}

// Export configuration for UI
export const REFERRAL_CONFIG = {
  daysPerReferral: DAYS_PER_REFERRAL,
  maxBonusDays: MAX_BONUS_DAYS,
  codeLength: REFERRAL_CODE_LENGTH
};
