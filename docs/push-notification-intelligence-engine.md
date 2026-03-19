# Push Notification Intelligence Engine

## Overview

The Push Notification Intelligence Engine implements a sophisticated alert delivery system for Scout that balances real-time engagement with user experience through smart bundling, tier enforcement, and rate protection.

## System Architecture

### 1. Bundling Service (`alertBundlingService.ts`)

**Purpose**: Groups multiple alerts from the same game within 60-90 second windows.

**Key Features**:
- Per-game bundling (never across games)
- 60-90 second bundling windows (75s default)
- Automatic bundle flush when window expires
- Maximum 5 alerts per bundle before forced flush

**Bypass Rules** (sent immediately):
- Game-winner alerts
- Period breaks (natural transition points)
- Dominant performances
- Critical severity alerts
- Final score alerts

### 2. Push Notification Service (`pushNotificationService.ts`)

**Purpose**: Smart push delivery with tier enforcement and rate protection.

**Core Responsibilities**:
- Tier-based feature gating
- Push rate limiting per tier
- Alert preference filtering
- Push formatting and delivery
- Suppression logging

### 3. Rate Limiter (`alertRateLimiter.ts`)

**Purpose**: Prevent alert flooding and monitor data freshness.

**Protection Mechanisms**:
- Per-user, per-type hourly limits
- Global per-minute limits (10 pushes/min)
- Global per-hour limits (100 pushes/hour)
- Burst protection (pause if 20 pushes in 5 minutes)
- Cooldown periods for duplicate alerts

## Bundling Strategy

### Game-Level Bundling

**Rule**: Bundle alerts by GAME within 60-90 second windows.

**Example**:
```
12:03:15 PM - Touchdown by Chiefs
12:03:45 PM - Line movement: KC -3.5 → -5.5
12:04:10 PM - Injury: Mahomes questionable

→ Bundled into single push at 12:04:30 PM:
   "Scout: 3 updates"
   "• Touchdown by Chiefs
    • Line moved: Spread
    • Mahomes questionable"
```

### Never Cross-Game Bundling

**Anti-pattern**: Generic "multiple games updated" push

**Correct approach**: Separate pushes per game, each bundled independently

### Window Reset

- Window starts with first bundleable alert
- Window extends with each new alert (up to window duration)
- Window flushes after 75 seconds of inactivity
- Window force-flushes at 5 alerts

## Bypass Rules

These alerts bypass bundling and send immediately:

### 1. Game-Winner Score
```typescript
category: "game_winner"
// Final score that determines winner in close game
```

### 2. Overtime Start
```typescript
category: "overtime_start"
// Game entering overtime period
```

### 3. Final Score
```typescript
category: "final_score"
metadata: { isFinalScore: true }
// Game has ended
```

### 4. Critical Injury
```typescript
category: "critical_injury"
severity: "critical"
// Starter ruled out close to game time
```

### 5. Extreme Line Movement
```typescript
category: "line_movement"
metadata: {
  changeAmount: 5+,  // for spreads
  // OR
  changeAmount: 10+, // for totals
  // OR
  changeAmount: 50+  // for moneyline (cents)
}
```

### 6. Period Breaks
```typescript
category: "period_break"
// End of quarter/period (natural summary point)
```

### 7. Dominant Performances
```typescript
category: "dominant_performance"
// Extraordinary performances (no-hitter, hat trick, etc.)
```

## Push Formatting

### Title Format
```
Scout: [Short Event Headline]
```

**Examples**:
- `Scout: Chiefs win!`
- `Scout: Overtime begins`
- `Scout: Line moved: Spread`
- `Scout: 3 updates`

### Body Format

One short contextual sentence with timestamp when appropriate.

**Examples**:
```
"Mahomes to Kelce, 12-yard TD. Chiefs lead 28-24 (2:47 PM)"

"Line moved from -3.5 to -5.5. Updated at 3:15 PM"

"Final: Chiefs 31, Bills 27. Game ended at 6:32 PM"
```

**Bundled body**:
```
• Touchdown by Chiefs
• Line moved: Spread
• Mahomes questionable
```

## Tier Enforcement

### Anonymous
- **Pushes**: None
- **Limit**: 0/5min

### Free
- **Pushes**: Final scores + game starts (followed teams only)
- **Limit**: 3/5min
- **Categories**: `final_score`, `game_start`
- **Restriction**: Must follow team/game

### Pool Access ($10/year)
- Same as Free tier for alerts
- **Limit**: 3/5min

### Scout Pro ($19-29/month)
- **Pushes**: All scores, period summaries, proactive alerts, live watching
- **Limit**: 20/5min
- **Categories**: All except `custom_trigger`
- **Features**: Full live commentary, bundled alerts

### Scout Elite ($79/month)
- **Pushes**: Everything including custom triggers
- **Limit**: 50/5min
- **Categories**: All
- **Features**: Custom alert triggers, multi-game bundling

### Admin Tiers
- **Limit**: 10/5min
- Admin-specific notifications + standard alerts

## Rate Protection

### Per-Tier Limits (5-minute window)

| Tier | Max Pushes/5min |
|------|----------------|
| Anonymous | 0 |
| Free | 3 |
| Pool Access | 3 |
| Scout Pro | 20 |
| Scout Elite | 50 |
| Admin | 10 |

### Global Limits

- **Per-Minute**: 10 pushes max
- **Per-Hour**: 100 pushes max
- **Burst Protection**: Pause if 20 pushes in 5 minutes (pause for 5 minutes)

### Duplicate Prevention

Cooldown windows by category:
- `SCORING_EVENT`: 30 seconds
- `PERIOD_BREAK`: 5 minutes
- `DOMINANT_PERFORMANCE`: 10 minutes
- `LINE_MOVEMENT`: 3 minutes
- `INJURY`: 1 hour
- `WEATHER`: 30 minutes
- `GAME_STATE`: 1 minute

## Smart Filtering

### User Preferences

Users can set alert delivery mode:
- **`bundled`** (default): Smart bundling, all alerts
- **`every_event`**: No bundling, send everything immediately
- **`finals_only`**: Only final scores and game-winners

### Follow Filtering

Free tier users only receive alerts for:
- Followed teams
- Followed games
- Leagues they're in

Pro/Elite users receive alerts for:
- Everything above
- All games (with smart bundling)
- Custom triggers

### Category Filtering

Users can disable specific categories:
- Line movement
- Injuries
- Weather
- Game state
- Schedule changes

## Suppression Logging

All suppressed pushes are logged with:
- **Reason**: `tier_restricted`, `rate_limited`, `user_preference`, `duplicate`
- **Details**: Why it was suppressed
- **Timestamp**: When it was suppressed
- **Alert data**: Full alert context

**Use cases**:
- Debugging user complaints ("I didn't get an alert")
- Analytics on suppression rates
- Tier conversion triggers ("upgrade to get these alerts")

## Database Tables

### `push_notifications`
Stores all sent pushes:
```sql
- user_id
- title
- body
- data_json (game_id, category, deepLink)
- data_scope
- sent_at
```

### `push_delivery_log`
Tracks successful deliveries:
```sql
- user_id
- alert_id
- game_id
- category
- sent_at
```

### `push_suppression_log`
Tracks suppressed pushes:
```sql
- user_id
- alert_id
- game_id
- category
- reason (tier_restricted, rate_limited, user_preference, duplicate)
- details
- suppressed_at
```

### `data_freshness_log`
Monitors data source freshness:
```sql
- source_name (liveScores, odds, injuries, weather)
- data_scope
- metadata_json
- updated_at
```

## Alert Preference UI Support

The system supports three preference modes:

### 1. Smart Bundled (Default)
```typescript
alert_delivery_mode: "bundled"
```
- Bundles scoring events within 60-90s windows
- Bypass rules apply (game-winners, period breaks, etc.)
- Best for balanced experience

### 2. Every Event
```typescript
alert_delivery_mode: "every_event"
```
- No bundling
- Every alert sends immediately
- Best for power users during live games
- Subject to rate limits

### 3. Finals Only
```typescript
alert_delivery_mode: "finals_only"
```
- Only final scores and game-winners
- No live commentary
- Best for casual fans

## Integration Points

### 1. Alert Creation
```typescript
import { processPushAlert } from "./pushNotificationService";

const alert: PushAlert = {
  id: generateId(),
  userId: user.id,
  gameId: game.id,
  category: "scoring_event",
  severity: "medium",
  title: "Touchdown",
  message: "Mahomes to Kelce, 12-yard TD",
  timestamp: new Date().toISOString(),
  metadata: { team: "KC", score: "28-24" }
};

await processPushAlert(db, alert, dataScope);
```

### 2. Bundled Alerts
```typescript
import { processBundledPush } from "./pushNotificationService";

const alerts: PushAlert[] = [...]; // Array of alerts from same game
await processBundledPush(db, alerts, gameId, userId, dataScope);
```

### 3. Rate Limit Check
```typescript
import { checkRateLimit } from "./alertRateLimiter";

const result = checkRateLimit(userId, "SCORING_EVENT");
if (!result.allowed) {
  console.log(`Rate limited: ${result.reason}`);
}
```

## Summary of Deliverables

✅ **Bundling Window Logic**
- 60-90 second windows per game
- Automatic flush on expiration
- Force flush at 5 alerts

✅ **Bypass Triggers**
- Game-winner, overtime, final score
- Critical injuries, extreme line movements
- Period breaks, dominant performances

✅ **Rate Limiting Strategy**
- Per-tier 5-minute limits
- Global per-minute/per-hour caps
- Burst protection with auto-pause
- Duplicate prevention with cooldowns

✅ **Tier Enforcement Checks**
- Free: Finals only, followed teams
- Pro: All live alerts, 20/5min
- Elite: Custom triggers, 50/5min
- Comprehensive suppression logging

✅ **Alert Preferences UI Support**
- Bundled (smart)
- Every event
- Finals only
- Per-category filtering
