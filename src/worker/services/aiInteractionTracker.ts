/**
 * AI Interaction Tracker Service
 * 
 * Tracks Scout interactions for free users to implement soft caps
 * and trigger trial offer prompts at appropriate times.
 */

import { getTodayEasternDateString } from "./dateUtils";

export interface AIInteractionStats {
  todayCount: number;
  dailyLimit: number;
  hasReachedLimit: boolean;
  shouldShowTrialOffer: boolean;
  trialOfferAlreadyShown: boolean;
}

const TRIAL_OFFER_THRESHOLD = 3; // Show trial offer after 3 interactions
const FREE_TIER_DAILY_LIMIT = 10; // Free users get 10 Scout questions per day

/**
 * Track a Scout interaction for a user
 */
export async function trackAIInteraction(
  db: D1Database,
  userId: string
): Promise<AIInteractionStats> {
  const today = getTodayEasternDateString();
  
  // Get or create today's tracking record
  const existing = await db
    .prepare(
      `SELECT * FROM ai_interaction_tracking 
       WHERE user_id = ? AND interaction_date = ?`
    )
    .bind(userId, today)
    .first();

  let currentCount: number;
  let trialOfferAlreadyShown: boolean;

  if (existing) {
    // Increment existing record
    currentCount = (existing.interaction_count as number) + 1;
    trialOfferAlreadyShown = existing.trial_offer_shown === 1;
    
    await db
      .prepare(
        `UPDATE ai_interaction_tracking 
         SET interaction_count = ?, 
             last_interaction_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND interaction_date = ?`
      )
      .bind(currentCount, userId, today)
      .run();
  } else {
    // Create new record
    currentCount = 1;
    trialOfferAlreadyShown = false;
    
    await db
      .prepare(
        `INSERT INTO ai_interaction_tracking 
         (user_id, interaction_date, interaction_count, last_interaction_at)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP)`
      )
      .bind(userId, today)
      .run();
  }

  const stats: AIInteractionStats = {
    todayCount: currentCount,
    dailyLimit: FREE_TIER_DAILY_LIMIT,
    hasReachedLimit: currentCount >= FREE_TIER_DAILY_LIMIT,
    shouldShowTrialOffer: currentCount === TRIAL_OFFER_THRESHOLD && !trialOfferAlreadyShown,
    trialOfferAlreadyShown,
  };

  return stats;
}

/**
 * Get current AI interaction stats for a user
 */
export async function getAIInteractionStats(
  db: D1Database,
  userId: string
): Promise<AIInteractionStats> {
  const today = getTodayEasternDateString();
  
  const record = await db
    .prepare(
      `SELECT * FROM ai_interaction_tracking 
       WHERE user_id = ? AND interaction_date = ?`
    )
    .bind(userId, today)
    .first();

  if (!record) {
    return {
      todayCount: 0,
      dailyLimit: FREE_TIER_DAILY_LIMIT,
      hasReachedLimit: false,
      shouldShowTrialOffer: false,
      trialOfferAlreadyShown: false,
    };
  }

  const count = record.interaction_count as number;
  const trialOfferShown = record.trial_offer_shown === 1;

  return {
    todayCount: count,
    dailyLimit: FREE_TIER_DAILY_LIMIT,
    hasReachedLimit: count >= FREE_TIER_DAILY_LIMIT,
    shouldShowTrialOffer: count === TRIAL_OFFER_THRESHOLD && !trialOfferShown,
    trialOfferAlreadyShown: trialOfferShown,
  };
}

/**
 * Mark that trial offer was shown to user
 */
export async function markTrialOfferShown(
  db: D1Database,
  userId: string
): Promise<void> {
  const today = getTodayEasternDateString();
  
  await db
    .prepare(
      `UPDATE ai_interaction_tracking 
       SET trial_offer_shown = 1, 
           trial_offer_shown_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND interaction_date = ?`
    )
    .bind(userId, today)
    .run();
}
