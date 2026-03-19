/**
 * GZ Sports Subscription Service
 * 
 * Handles subscription tier management, feature access, trials, and upgrade/downgrade logic.
 * Implements the GZ Sports subscription model:
 * - Free: Browse scores, limited Scout
 * - Pool Access ($10/year): Can submit picks
 * - Scout Pro ($19-29/month): Full live intelligence, 7-day trial
 * - Scout Elite ($79/month): Advanced features, unlimited AI
 * - Admin tiers: Pool management features
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

// =====================================================
// TYPES
// =====================================================

export type GZSportsTier = 
  | 'anonymous'           // Not logged in
  | 'free'                // Logged in, no subscription
  | 'pool_access'         // $10/year - can submit picks
  | 'scout_pro'           // $19-29 - full live intelligence
  | 'scout_elite'         // $79 - advanced features
  | 'admin_starter'       // $99/year - 3 pools max
  | 'admin_unlimited';    // $149/year - unlimited pools

export interface UserSubscription {
  userId: string;
  tier: GZSportsTier;
  productKey: string | null;
  billingPeriod: string | null;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  isTrialing: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  downgradeToProductKey: string | null;
}

export interface FeatureAccess {
  // Core access
  canBrowseScores: boolean;
  canViewPools: boolean;
  canSubmitPicks: boolean;
  
  // Scout AI limits
  scoutDailyCap: number;
  hasLiveCommentary: boolean;
  hasProactiveAlerts: boolean;
  aiPriority: 'standard' | 'elevated' | 'priority';
  
  // Elite features
  hasMultiGameCenter: boolean;
  hasCustomAlerts: boolean;
  hasHeatMaps: boolean;
  hasAdvancedFilters: boolean;
  
  // Admin features
  maxPools: number;
  hasAdminDashboard: boolean;
  hasMemberExport: boolean;
  hasDisputeTools: boolean;
  hasAdvancedAnalytics: boolean;
  hasPrioritySupport: boolean;
  
  // Metadata
  includesPoolAccess: boolean;
  trialDays: number | null;
}

// Feature definitions by tier
const TIER_FEATURES: Record<Exclude<GZSportsTier, 'anonymous'>, FeatureAccess> = {
  free: {
    canBrowseScores: true,
    canViewPools: true,
    canSubmitPicks: false,
    scoutDailyCap: 10,
    hasLiveCommentary: false,
    hasProactiveAlerts: false,
    aiPriority: 'standard',
    hasMultiGameCenter: false,
    hasCustomAlerts: false,
    hasHeatMaps: false,
    hasAdvancedFilters: false,
    maxPools: 0,
    hasAdminDashboard: false,
    hasMemberExport: false,
    hasDisputeTools: false,
    hasAdvancedAnalytics: false,
    hasPrioritySupport: false,
    includesPoolAccess: false,
    trialDays: null,
  },
  pool_access: {
    canBrowseScores: true,
    canViewPools: true,
    canSubmitPicks: true,
    scoutDailyCap: 10,
    hasLiveCommentary: false,
    hasProactiveAlerts: false,
    aiPriority: 'standard',
    hasMultiGameCenter: false,
    hasCustomAlerts: false,
    hasHeatMaps: false,
    hasAdvancedFilters: false,
    maxPools: 0,
    hasAdminDashboard: false,
    hasMemberExport: false,
    hasDisputeTools: false,
    hasAdvancedAnalytics: false,
    hasPrioritySupport: false,
    includesPoolAccess: true,
    trialDays: null,
  },
  scout_pro: {
    canBrowseScores: true,
    canViewPools: true,
    canSubmitPicks: true,
    scoutDailyCap: 100,
    hasLiveCommentary: true,
    hasProactiveAlerts: true,
    aiPriority: 'elevated',
    hasMultiGameCenter: false,
    hasCustomAlerts: false,
    hasHeatMaps: false,
    hasAdvancedFilters: false,
    maxPools: 0,
    hasAdminDashboard: false,
    hasMemberExport: false,
    hasDisputeTools: false,
    hasAdvancedAnalytics: false,
    hasPrioritySupport: false,
    includesPoolAccess: true,
    trialDays: 7,
  },
  scout_elite: {
    canBrowseScores: true,
    canViewPools: true,
    canSubmitPicks: true,
    scoutDailyCap: 999999,
    hasLiveCommentary: true,
    hasProactiveAlerts: true,
    aiPriority: 'priority',
    hasMultiGameCenter: true,
    hasCustomAlerts: true,
    hasHeatMaps: true,
    hasAdvancedFilters: true,
    maxPools: 0,
    hasAdminDashboard: false,
    hasMemberExport: false,
    hasDisputeTools: false,
    hasAdvancedAnalytics: false,
    hasPrioritySupport: true,
    includesPoolAccess: true,
    trialDays: null,
  },
  admin_starter: {
    canBrowseScores: true,
    canViewPools: true,
    canSubmitPicks: true,
    scoutDailyCap: 10,
    hasLiveCommentary: false,
    hasProactiveAlerts: false,
    aiPriority: 'standard',
    hasMultiGameCenter: false,
    hasCustomAlerts: false,
    hasHeatMaps: false,
    hasAdvancedFilters: false,
    maxPools: 3,
    hasAdminDashboard: true,
    hasMemberExport: true,
    hasDisputeTools: true,
    hasAdvancedAnalytics: false,
    hasPrioritySupport: false,
    includesPoolAccess: false,
    trialDays: null,
  },
  admin_unlimited: {
    canBrowseScores: true,
    canViewPools: true,
    canSubmitPicks: true,
    scoutDailyCap: 10,
    hasLiveCommentary: false,
    hasProactiveAlerts: false,
    aiPriority: 'standard',
    hasMultiGameCenter: false,
    hasCustomAlerts: false,
    hasHeatMaps: false,
    hasAdvancedFilters: false,
    maxPools: 999999,
    hasAdminDashboard: true,
    hasMemberExport: true,
    hasDisputeTools: true,
    hasAdvancedAnalytics: true,
    hasPrioritySupport: true,
    includesPoolAccess: false,
    trialDays: null,
  },
};

// Anonymous user features (not logged in)
const ANONYMOUS_FEATURES: FeatureAccess = {
  canBrowseScores: true,
  canViewPools: false,
  canSubmitPicks: false,
  scoutDailyCap: 0,
  hasLiveCommentary: false,
  hasProactiveAlerts: false,
  aiPriority: 'standard',
  hasMultiGameCenter: false,
  hasCustomAlerts: false,
  hasHeatMaps: false,
  hasAdvancedFilters: false,
  maxPools: 0,
  hasAdminDashboard: false,
  hasMemberExport: false,
  hasDisputeTools: false,
  hasAdvancedAnalytics: false,
  hasPrioritySupport: false,
  includesPoolAccess: false,
  trialDays: null,
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get feature access for a tier
 */
export function getFeatureAccess(tier: GZSportsTier): FeatureAccess {
  if (tier === 'anonymous') return ANONYMOUS_FEATURES;
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
}

/**
 * Get highest tier from product key
 */
function getProductTier(productKey: string): GZSportsTier {
  if (productKey.startsWith('pool_access')) return 'pool_access';
  if (productKey.startsWith('scout_pro')) return 'scout_pro';
  if (productKey.startsWith('scout_elite')) return 'scout_elite';
  if (productKey.startsWith('admin_starter')) return 'admin_starter';
  if (productKey.startsWith('admin_unlimited')) return 'admin_unlimited';
  return 'free';
}

// =====================================================
// SERVICE FUNCTIONS
// =====================================================

/**
 * Get user's current subscription state
 */
export async function getUserSubscription(
  db: D1Database,
  userId: string | null
): Promise<UserSubscription> {
  // Anonymous user
  if (!userId) {
    return {
      userId: '',
      tier: 'anonymous',
      productKey: null,
      billingPeriod: null,
      status: 'active',
      isTrialing: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      downgradeToProductKey: null,
    };
  }

  // Check for active subscriptions
  const subscriptions = await db.prepare(`
    SELECT 
      product_key,
      status,
      billing_period,
      trial_ends_at,
      current_period_end,
      cancel_at_period_end,
      downgrade_to_product_key
    FROM user_subscriptions
    WHERE user_id = ? 
      AND status IN ('active', 'trialing', 'past_due')
    ORDER BY 
      CASE 
        WHEN product_key LIKE 'admin%' THEN 2
        WHEN product_key LIKE 'scout_elite%' THEN 1
        WHEN product_key LIKE 'scout_pro%' THEN 0
        ELSE -1
      END DESC
    LIMIT 1
  `).bind(userId).all() as { results: Array<{
    product_key: string;
    status: string;
    billing_period: string;
    trial_ends_at: string | null;
    current_period_end: string;
    cancel_at_period_end: number;
    downgrade_to_product_key: string | null;
  }> };

  if (subscriptions.results.length > 0) {
    const sub = subscriptions.results[0];
    const tier = getProductTier(sub.product_key);
    const now = new Date();
    const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const isTrialing = sub.status === 'trialing' || (trialEnd !== null && trialEnd > now);

    return {
      userId,
      tier,
      productKey: sub.product_key,
      billingPeriod: sub.billing_period,
      status: sub.status as any,
      isTrialing,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      downgradeToProductKey: sub.downgrade_to_product_key,
    };
  }

  // No active subscription - free tier
  return {
    userId,
    tier: 'free',
    productKey: null,
    billingPeriod: null,
    status: 'active',
    isTrialing: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    downgradeToProductKey: null,
  };
}

/**
 * Get feature access for a user
 */
export async function getUserFeatureAccess(
  db: D1Database,
  userId: string | null
): Promise<FeatureAccess> {
  if (!userId) {
    return ANONYMOUS_FEATURES;
  }

  const subscription = await getUserSubscription(db, userId);
  
  if (subscription.tier === 'anonymous') {
    return ANONYMOUS_FEATURES;
  }

  return TIER_FEATURES[subscription.tier];
}

/**
 * Check if user has a specific feature
 */
export async function userHasFeature(
  db: D1Database,
  userId: string | null,
  featureCheck: (features: FeatureAccess) => boolean
): Promise<boolean> {
  const features = await getUserFeatureAccess(db, userId);
  return featureCheck(features);
}

/**
 * Start a trial for a user
 */
export async function startTrial(
  db: D1Database,
  userId: string,
  productKey: string
): Promise<{ success: boolean; error?: string }> {
  // Verify product exists and supports trials
  const product = await db.prepare(`
    SELECT features_json
    FROM subscription_products
    WHERE product_key = ? AND is_active = 1
  `).bind(productKey).first() as { features_json: string } | null;

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  const features = JSON.parse(product.features_json);
  if (!features.trial_days) {
    return { success: false, error: 'Product does not support trials' };
  }

  // Check if user already had a trial for this tier
  const tier = getProductTier(productKey);
  const existingTrial = await db.prepare(`
    SELECT id
    FROM user_subscriptions
    WHERE user_id = ?
      AND product_key LIKE ?
      AND trial_ends_at IS NOT NULL
    LIMIT 1
  `).bind(userId, `${tier}%`).first();

  if (existingTrial) {
    return { success: false, error: 'Trial already used for this tier' };
  }

  // Create trial subscription
  const now = new Date();
  const trialEnd = new Date(now.getTime() + features.trial_days * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(trialEnd.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days after trial

  await db.prepare(`
    INSERT INTO user_subscriptions (
      user_id,
      product_key,
      status,
      billing_period,
      trial_ends_at,
      current_period_start,
      current_period_end
    ) VALUES (?, ?, 'trialing', 'monthly', ?, ?, ?)
  `).bind(
    userId,
    productKey,
    trialEnd.toISOString(),
    now.toISOString(),
    periodEnd.toISOString()
  ).run();

  return { success: true };
}

/**
 * Cancel subscription (set to downgrade at period end)
 */
export async function cancelSubscription(
  db: D1Database,
  userId: string,
  downgradeToTier?: 'pool_access' | 'free'
): Promise<{ success: boolean; error?: string }> {
  const subscription = await getUserSubscription(db, userId);

  if (!subscription.productKey) {
    return { success: false, error: 'No active subscription' };
  }

  // Determine downgrade product
  let downgradeProduct: string | null = null;
  if (subscription.tier === 'scout_pro' || subscription.tier === 'scout_elite') {
    // Pro/Elite downgrades to Pool Access by default
    downgradeProduct = downgradeToTier === 'free' ? null : 'pool_access';
  }

  await db.prepare(`
    UPDATE user_subscriptions
    SET 
      cancel_at_period_end = 1,
      downgrade_to_product_key = ?,
      canceled_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status IN ('active', 'trialing')
  `).bind(downgradeProduct, userId).run();

  return { success: true };
}

/**
 * Apply Pool Access credit when upgrading from Pool to Pro
 */
export function calculatePoolAccessCredit(
  poolAccessPeriodEnd: Date | null
): number {
  if (!poolAccessPeriodEnd) return 0;

  const now = new Date();
  if (poolAccessPeriodEnd <= now) return 0;

  // Calculate remaining days
  const remainingDays = Math.ceil(
    (poolAccessPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );

  // Pool Access is $10/year = $0.027/day
  // Round to nearest cent
  return Math.round(remainingDays * 0.027 * 100);
}

export default {
  getUserSubscription,
  getUserFeatureAccess,
  userHasFeature,
  startTrial,
  cancelSubscription,
  calculatePoolAccessCredit,
};
