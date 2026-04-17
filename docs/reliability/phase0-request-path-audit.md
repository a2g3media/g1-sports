# Phase 0 - Request Path Audit

## Objective

Identify every consumer request path that still performs provider/live assembly, normalization, deep joins, or route-time warming/building.

## Current Conversion Status

- `src/worker/routes/page-data.ts` now has a strict request-path snapshot-read gate (`ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH`) for core families.
- This gate must remain enabled while route families complete canonical key + validator migration.
- Remaining gaps are mostly frontend paths still hitting legacy live endpoints and builder/cadence contracts.

## Consumer Handler Audit Matrix

| Route Family | Handler | File | Current State | Remaining Gap | Priority |
|---|---|---|---|---|---|
| Games | `/api/page-data/games` | `src/worker/routes/page-data.ts` | request path returns L1/L2/last-good/unavailable under strict gate | canonical key migration to gameId-only route snapshots still pending | P0 |
| Odds | `/api/page-data/odds` | `src/worker/routes/page-data.ts` | request path snapshot-read under strict gate | complete B/C layer builder contract + key/validator hardening pending | P0 |
| Sport Hub | `/api/page-data/sport-hub` | `src/worker/routes/page-data.ts` | snapshot-read path present | align canonical key/validator contract to final v2 table | P1 |
| Game Detail | `/api/page-data/game-detail` | `src/worker/routes/page-data.ts` | request path snapshot-read under strict gate | ensure final game usability validator requires complete game shell contract | P0 |
| Team Profile | `/api/page-data/team-profile` | `src/worker/routes/page-data.ts` | request path snapshot-read under strict gate | canonical `teamId` authority and stricter team validators pending | P0 |
| Player Profile | `/api/page-data/player-profile` | `src/worker/routes/page-data.ts` | cache-first read path; no live provider call in handler | remove name-authoritative behavior and enforce canonical `playerId` request contract | P0 |
| League Overview | `/api/page-data/league-overview` | `src/worker/routes/page-data.ts` | request path snapshot-read under strict gate | tighten league snapshot schema and final validator gates | P1 |
| League GameDay | `/api/page-data/league-gameday` | `src/worker/routes/page-data.ts` | request path snapshot-read under strict gate | tighten canonical period keying + validator contract | P1 |
| League Picks | `/api/page-data/league-picks` | `src/worker/routes/page-data.ts` | request path snapshot-read under strict gate | tighten canonical period keying + validator contract | P1 |

## Frontend Request-Path Audit (Consumer Surfaces)

| Surface | File | Current State | Required Conversion |
|---|---|---|---|
| Game detail family | `src/react-app/pages/GameDetailPage.tsx`, `src/react-app/pages/OddsGamePage.tsx` | mixed page-data + legacy `/api/games*` usage | move initial render to route snapshot only |
| Team family | `src/react-app/pages/TeamProfilePage.tsx` | mixed page-data + legacy `/api/games*`/team waterfalls | initial render must consume team route snapshot only |
| Sport-specific hubs | `src/react-app/pages/NHLHubPage.tsx`, `src/react-app/pages/NCAABHubPage.tsx`, `src/react-app/pages/NASCARHubPage.tsx` | legacy `/api/games*` reads remain | migrate to page-data feed snapshots |
| Props/player detail intents | `src/react-app/pages/PlayerPropsPage.tsx`, `src/react-app/pages/PlayerProfilePage.tsx` | route snapshot path present; route-time warm-hint calls removed | complete canonical ID routing and validator hardening |

## Builder-Only Live Assembly (Allowed)

| Handler | File | Role |
|---|---|---|
| `/api/page-data/player-profile/build` | `src/worker/routes/page-data.ts` | builder-only live assembly (must never be user request path dependency) |
| `/api/player/:sport/:playerName` | `src/worker/routes/player-profile.ts` | upstream provider aggregation source for builders only |

## Phase 0 Gate Statement

Phase 0 passes only when:
- converted consumer request handlers are strictly snapshot-read-only,
- converted frontend initial render paths do not depend on live endpoints,
- provider/live assembly remains builder-only.
