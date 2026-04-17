# Phase 0 - Handler Conversion List

## Conversion Rule

For every handler listed below after conversion:
- Request path is read-only snapshot path.
- Provider/live assembly on request path is prohibited.
- If fresh snapshot missing, return last-good snapshot.
- If both missing, return explicit safe fallback (no live provider build on click).

## Current Execution Status

- Backend request handlers listed below are now gated by strict snapshot-read mode in `src/worker/routes/page-data.ts`.
- Remaining work is canonical key normalization and full frontend surface cleanup of legacy live endpoints.

## Phase 1 - Player Routes

| Task ID | Handler | File | Target State | Status |
|---|---|---|---|
| FR-01-001 | `/api/page-data/player-profile` | `src/worker/routes/page-data.ts` | Read-only snapshot read + validate + return (or last-good/safe fallback). No `readJsonWithBudget` provider path. | in progress (canonical `playerId` enforcement next) |
| FR-01-002 | Player page initial load path | `src/react-app/pages/PlayerProfilePage.tsx`, `src/react-app/pages/UniversalPlayerPage.tsx` | Single page-data request path only; no route-level provider fallback fanout. | in progress |

## Phase 2 - Team Routes

| Task ID | Handler | File | Target State | Status |
|---|---|---|---|
| FR-02-001 | `/api/page-data/team-profile` | `src/worker/routes/page-data.ts` | Read-only snapshot path only; remove request-time profile/schedule/stats/standings/games/injuries/splits assembly. | completed (strict gate enabled) |
| FR-02-002 | Team page initial load path | `src/react-app/pages/TeamProfilePage.tsx` | Single page-data request path only; no request-time waterfall fallback chains. | in progress |

## Phase 3 - Game Routes

| Task ID | Handler | File | Target State | Status |
|---|---|---|---|
| FR-03-001 | `/api/page-data/game-detail` | `src/worker/routes/page-data.ts` | Read-only snapshot path only; no provider/live assembly in route handler. | completed (strict gate enabled) |
| FR-03-002 | Game detail page initial load path | `src/react-app/pages/GameDetailPage.tsx` | Single page-data request path; no multi-stage mount-time fanout. | in progress |

## Phase 4 - Home/Games Feeds

| Task ID | Handler | File | Target State | Status |
|---|---|---|---|
| FR-04-001 | `/api/page-data/games` (includes home feed source) | `src/worker/routes/page-data.ts`, `src/react-app/hooks/useDataHub.tsx` | Read-only snapshot path only; no request-time live slate build. | completed (strict gate enabled) |
| FR-04-002 | Home + Games initial load paths | `src/react-app/pages/Dashboard.tsx`, `src/react-app/pages/GamesPage.tsx` | Snapshot-first read only for first render; no mount-time provider assembly. | in progress |

## Phase 5 - Odds + Remaining Consumer Routes

| Task ID | Handler | File | Target State | Status |
|---|---|---|---|
| FR-05-001 | `/api/page-data/odds` | `src/worker/routes/page-data.ts` | Read-only snapshot path only; no request-time deep odds build on click. | completed (strict gate enabled) |
| FR-05-002 | `/api/page-data/sport-hub` | `src/worker/routes/page-data.ts` | Read-only snapshot path only. | completed (strict gate enabled) |
| FR-05-003 | `/api/page-data/league-overview` | `src/worker/routes/page-data.ts` | Read-only snapshot path only. | completed (strict gate enabled) |
| FR-05-004 | `/api/page-data/league-gameday` | `src/worker/routes/page-data.ts` | Read-only snapshot path only. | completed (strict gate enabled) |
| FR-05-005 | `/api/page-data/league-picks` | `src/worker/routes/page-data.ts` | Read-only snapshot path only. | completed (strict gate enabled) |
| FR-05-006 | Corresponding frontend load paths | relevant consumer pages using above routes | Single page-data request path, no request-time fanout assembly. | in progress |

## Supporting Infrastructure (Builder-Side Only)

| Item | File | Role |
|---|---|---|
| `runPageDataWarmCycle` | `src/worker/services/pageData/precompute.ts` | Primary precompute scheduler for snapshot builds |
| `warmPlayersForSport` | `src/worker/services/pageData/precompute.ts` | Player snapshot builder path |
| `warmTeamRoster` | `src/worker/services/pageData/precompute.ts` | Team-triggered player builder path |
| `/api/page-data/warm-internal` | `src/worker/index.ts` | Internal trigger endpoint for build lanes |
| `handleScheduled` | `src/worker/index.ts` | Continuous scheduled builder cadence |

## Enforcement Checklist Per Converted Handler

- [ ] No provider/live `fetch` or `readJsonWithBudget` on request path
- [ ] Snapshot validation gate applied before return
- [ ] Last-good fallback path applied
- [ ] Empty/wrong-identity snapshots rejected
