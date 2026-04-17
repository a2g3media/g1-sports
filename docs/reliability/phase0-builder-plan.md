# Phase 0 - Builder Matrix and Queue Budget Plan

## Builder-Side Principle

All heavy work is builder-only:
- provider fetch
- normalization
- deep joins
- route shaping
- write validation
- snapshot persistence

Converted request handlers are read/validate/return only.

## Queue Priority Model

Priority order (highest to lowest):
1. user requests
2. fast cadence route snapshots (home/games/game/odds active slate)
3. active-slate team route snapshots
4. active-slate player route snapshots
5. slow global base/entity sweeps

Each priority has one lane with hard caps.

## Queue and Concurrency Budget (Initial)

| Lane | Work Type | Max Concurrency | Max Work Items/Cycle | Backoff Trigger | Backoff Action |
|---|---|---:|---:|---|---|
| `user` | request path | N/A (foreground) | N/A | p95 request latency > SLO or elevated 5xx | immediately pause all non-user lanes |
| `fast` | home/games/game/odds active snapshots | 8 | 120 | p95 > threshold 2 windows | reduce to concurrency 5, cap 80 |
| `team-active` | active-slate team route snapshots | 7 | 90 | p95 > threshold 2 windows | reduce to concurrency 4, cap 50 |
| `player-active` | active-slate player route snapshots | 5 | 120 | p95 > threshold 2 windows | reduce to concurrency 3, cap 60 |
| `slow-sweep` | global base snapshots | 5 | 200 | any sustained pressure or errors | pause lane first, resume on recovery |

Global hard guardrails:
- no lane may exceed concurrency 10,
- only one lane advances at a time when pressure mode is active,
- no unbounded fanout; every enqueue is bounded by per-cycle cap.

## Builder Matrix by Route Family

| Route Family | Builder Sources | Build Key | Cadence | Lane | Write Validation | Read Validation |
|---|---|---|---|---|---|---|
| Player Base (A) | provider player profile/stats/logs + ID resolution | `pd:base:v2:player:{sport}:{playerId}` | slow rolling | `slow-sweep` | canonical `playerId` match, meaningful content required | identity + required module gate |
| Team Base (A) | provider team profile/roster/core stats | `pd:base:v2:team:{sport}:{teamId}` | slow rolling | `slow-sweep` | canonical `teamId` match, header + roster/core required | identity + header/core gate |
| Game Base (B) | game schedule/status/teams/odds context | `pd:base:v2:game:{sport}:{gameId}` | fast for live/upcoming, medium for non-live | `fast` | canonical `gameId` match, game shell required | identity + shell gate |
| Player Route (C) | player base + game base + props context | `pd:snap:v2:player-route:{sport}:{playerId}` | medium (active slate) | `player-active` | no wrong identity, no empty success | no degraded/empty masquerading as success |
| Team Route (C) | team base + game/base context | `pd:snap:v2:team-route:{sport}:{teamId}` | medium (active slate) | `team-active` | roster index or core module required | header + roster/core gate |
| Game Route (C) | game base + route modules | `pd:snap:v2:game:{sport}:{gameId}` | fast active/live | `fast` | game shell completeness required | completeness + identity gate |
| Home/Games (C) | game base + feed ordering | `pd:snap:v2:home:*` / `pd:snap:v2:games:*` | fast | `fast` | non-empty active feed or explicit no-games metadata | reject empty success for active slate |
| Odds (C) | odds/game base slices | `pd:snap:v2:odds:*` | fast | `fast` | valid scope and game mapping | reject empty success when games exist |
| Sport Hub (C) | game base + feed modules | `pd:snap:v2:sport-hub:*` | medium | `team-active` (shared) | required hub modules present | reject empty active-slate success |
| League routes (C) | league/events/picks/payment modules | `pd:snap:v2:league-*` | medium | `team-active` (shared) | league + period coherence | reject partial empty success |

## Failure and Last-Good Rules

- Never overwrite `last-good` with rejected snapshots.
- Rejected writes increment typed counters (`wrong_identity`, `empty_payload`, `missing_required_modules`).
- On build failure: keep prior good snapshot and emit rejection/failure metrics.
- On repeated failure for same key: exponential backoff with capped retries.

## Existing Implementation Surfaces

- `src/worker/services/pageData/precompute.ts`
- `src/worker/index.ts` scheduled and warm internal entrypoints
- `src/worker/routes/page-data.ts` build endpoints and validators

## Phase 0 Acceptance Criteria

- lane caps are explicit and enforceable,
- request-priority backoff behavior is codified,
- each route family has canonical key + cadence + lane + validation rules.
