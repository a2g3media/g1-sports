# Pre-Launch QA Report
Generated: Pre-launch audit phase

## Executive Summary

Comprehensive edge case testing completed across authentication, monetization, leaderboard, share feature, SEO/PWA, performance, and error handling.

**Overall Status: ✅ READY FOR LAUNCH** (with 1 critical fix applied)

---

## Critical Issues (Must Fix)

### ✅ FIXED: Share Routes Conflict
**Severity**: Critical  
**Location**: `src/worker/routes/shares.ts`  
**Issue**: The `/stats/me` route was defined AFTER `/:shareId` dynamic route. Since Hono matches routes in order, requests to `/api/shares/stats/me` were being captured by the `/:shareId` route, with "stats" interpreted as a shareId parameter.  
**Fix**: Moved `/stats/me` route BEFORE the dynamic `/:shareId` route.  
**Status**: ✅ FIXED

---

## Medium Issues (Monitor)

### 1. AI Cap - Multiple Tab Edge Case
**Severity**: Medium  
**Location**: `FloatingAIAvatar.tsx` lines 417-455  
**Issue**: AI cap check happens twice (before send + after track). A user with multiple tabs open could theoretically send requests from multiple tabs before the cap updates.  
**Mitigation**: Server-side tracking in `/api/ai/track-interaction` is the source of truth. Client-side check is only UX optimization.  
**Risk**: Low - worst case is 1-2 extra AI calls  
**Recommendation**: Acceptable for launch, consider server-side rate limiting for v2

### 2. Leaderboard Tie Handling
**Severity**: Medium  
**Location**: `leaderboardService.ts` ORDER BY clause  
**Issue**: Ties in win percentage, profit, and wins are not deterministically resolved (no `user_id` or `created_at` tiebreaker).  
**Impact**: Two users with identical stats could swap positions between queries.  
**Recommendation**: Add `user_id ASC` as final tiebreaker in future update

### 3. Weekly Leaderboard - Rolling Window
**Severity**: Medium (UX expectation)  
**Location**: `leaderboardService.ts` `getPeriodDateRange()`  
**Issue**: "Weekly" leaderboard uses rolling 7-day window, not calendar week reset (e.g., Sunday-Saturday).  
**Impact**: May not match user expectations of "this week's leaders"  
**Recommendation**: Document behavior or add calendar week option in v2

### 4. Service Worker Cache Name
**Severity**: Low  
**Location**: `public/sw.js` line 1  
**Issue**: Cache name is still `'poolvault-v1'` instead of `'gz-sports-v1'`  
**Impact**: Cosmetic only - functionality unaffected  
**Recommendation**: Update for consistency (fix included below)

---

## Low Issues (Acceptable)

### 1. Manifest Icon Sizes
**Severity**: Low  
**Location**: `public/manifest.json`  
**Issue**: All icon sizes point to the same image URL  
**Impact**: Browsers typically resize appropriately, but not ideal  
**Recommendation**: Generate properly sized icons for v2

### 2. Error Boundary Monitoring
**Severity**: Low  
**Location**: `ErrorBoundary.tsx`  
**Issue**: Logs errors to console but no external monitoring service integration  
**Impact**: Errors in production may go unnoticed  
**Recommendation**: Add Sentry or similar in v2

### 3. Share Deletion/Expiration
**Severity**: Low  
**Location**: `shareService.ts`  
**Issue**: No mechanism to delete or expire shared content  
**Impact**: Shared takes persist indefinitely  
**Recommendation**: Add 90-day auto-expiration in v2

---

## QA Verification Results

### 1. Authentication ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| Signup with referral | ✅ PASS | `recordReferral()` validates code before recording |
| Signup without referral | ✅ PASS | Standard flow unaffected |
| Self-referral prevention | ✅ PASS | Checked in `recordReferral()` |
| Invalid referral code | ✅ PASS | Returns error "Invalid referral code" |
| Session validation | ✅ PASS | authMiddleware validates via Mocha service |

### 2. Monetization ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| AI cap at limit | ✅ PASS | `hasReachedLimit` check + `trackAiCapHit()` |
| Upgrade mid-session | ✅ PASS | `refresh()` function updates features |
| Referral reward timing | ✅ PASS | `processReferralPayment()` only on checkout |
| Bonus day cap (90 days) | ✅ PASS | `MAX_BONUS_DAYS` constant enforced |
| One reward per referral | ✅ PASS | `reward_granted_at` prevents duplicates |

### 3. Leaderboard ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| Privacy toggle ON | ✅ PASS | User visible in rankings |
| Privacy toggle OFF | ✅ PASS | User excluded but sees own stats |
| Default visibility | ✅ PASS | Defaults to visible (ON) |
| User outside top 100 | ✅ PASS | `currentUserEntry` fetched separately |
| Minimum picks requirement | ✅ PASS | `HAVING total_picks >= 5` |

### 4. Share Feature ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| Share link without login | ✅ PASS | Public endpoint, CTA shows login |
| Share with deleted content | ✅ PASS | 404 with friendly message |
| View count increment | ✅ PASS | Async, non-blocking |
| Conversion tracking | ✅ PASS | `share_conversion_signup` event |
| Share length limit | ✅ PASS | 2000 char max enforced |

### 5. SEO + PWA ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| Meta tags on share page | ✅ PASS | `useDocumentMeta` hook sets OG tags |
| Manifest loads | ✅ PASS | Valid JSON, all required fields |
| Service worker API caching | ✅ PASS | Network-only for `/api/` routes |
| Offline fallback | ✅ PASS | Returns 503 with JSON error |

### 6. Performance ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| Skeleton loading states | ✅ PASS | Dashboard, CommandCenter, Scores covered |
| AI call optimization | ✅ PASS | `useAICallOptimizer` with debounce + dedup |
| Response caching | ✅ PASS | `responseCache.ts` with TTL presets |
| Database indexes | ✅ PASS | 48 indexes across 20 tables |

### 7. Error Handling ✅
| Test Case | Result | Notes |
|-----------|--------|-------|
| API failure | ✅ PASS | ErrorBoundary catches, shows retry UI |
| Section-level errors | ✅ PASS | `SectionErrorBoundary` for isolated failures |
| Scout API failure | ✅ PASS | Persona-specific fallback messages |
| Network offline | ✅ PASS | Service worker returns 503 gracefully |

---

## Monetization & Referral Protection Confirmation

### Referral System Security ✅
- ✅ Self-referral prevented (`referrer.userId !== referredUserId`)
- ✅ Duplicate referral prevented (unique constraint check)
- ✅ Reward only after payment (`processReferralPayment()` in checkout)
- ✅ One-time reward (`reward_granted_at IS NULL` check)
- ✅ Bonus day cap enforced (90 days max)

### AI Cap Enforcement ✅
- ✅ Server-side tracking is source of truth
- ✅ `ai_interaction_tracking` table records all calls
- ✅ `FREE_TIER_DAILY_LIMIT` enforced in `aiInteractionTracker.ts`
- ✅ Paywall tracking via `trackAiCapHit()`

### Subscription Integrity ✅
- ✅ Feature access derived from subscription tier
- ✅ Trial expiration handled
- ✅ Downgrade enforcement at period end

---

## Fixes Applied This Session

1. **Share Routes Order** (CRITICAL) - Fixed route ordering in `shares.ts`
2. **Service Worker Cache Name** - Updated from "poolvault-v1" to "gz-sports-v1"

---

## Recommendations for Post-Launch

1. Add Sentry or similar error monitoring
2. Generate proper PWA icon sizes
3. Add calendar week option for leaderboards
4. Implement share expiration (90-day cleanup)
5. Add deterministic tiebreaker to leaderboard queries
