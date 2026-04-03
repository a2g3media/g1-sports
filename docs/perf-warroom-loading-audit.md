# Performance + Loading War-Room Audit

## Scope
This document tracks route-level loading behavior, request fanout, current bottlenecks, and hardening changes applied during the war-room.

## Route Request Surface (Current)

Measured from key route source files using static call-site scan (`fetch(...)` + `fetchJsonCached(...)`):

- `src/react-app/pages/Dashboard.tsx`: 1 call-site
- `src/react-app/hooks/useDataHub.tsx`: 2 call-sites
- `src/react-app/pages/GamesPage.tsx`: 7 call-sites
- `src/react-app/pages/OddsPage.tsx`: 5 call-sites
- `src/react-app/pages/PlayerPropsPage.tsx`: 2 call-sites
- `src/react-app/pages/GameDetailPage.tsx`: 21 call-sites

Notes:
- `GameDetailPage` remains the heaviest route-level request surface.
- `Dashboard` is thin but depends on `DataHub` fanout endpoints and strict relevance filters.

## Critical Findings

### 1) Home page false-empty condition (fixed)

Observed behavior:
- `/api/games` returned valid game rows.
- Home route sometimes rendered no games.

Root cause:
- `isRelevantHomepageGame()` in `useDataHub` used a strict scheduled window (`-1h / +12h`).
- Around early ET hours, same-day evening games were filtered out.

Fixes applied:
- Expanded scheduled relevance window to `-2h / +24h`.
- Added guardrail fallback: if strict filtering yields empty but upstream has valid rows, publish a bounded near-term fallback slate.

### 2) Valid data overwrite risk in DataHub (fixed)

Observed risk:
- Consolidated refresh cycle could overwrite visible games with empty payloads.

Fixes applied:
- Added stale-protection in `fetchAllData()`:
  - never replace visible games with empty refresh if prior valid slate exists.
  - preserve last-known-valid slate on transient games fetch failures.

### 3) Duplicate/overlapping DataHub refresh cycles (fixed)

Observed risk:
- Manual refresh and polling could overlap.

Fixes applied:
- Added in-flight deduping for `fetchAllData()` so concurrent triggers share one cycle.

### 4) Missing observability for route feed timing (improved)

Fixes applied:
- Added `[DataHub][perf]` timing log per cycle:
  - total cycle duration
  - per-feed timing (`games`, `watchboards`, `alerts`)
  - effective games count used
  - active backoff multiplier

## Backend/Env Health Risks still present

From local dev logs:
- repeated D1 schema mismatches (`odds_opening` missing `opening_price_decimal`)
- missing tables in local env (`sdio_games`, `ticket_alerts`)
- noisy provider failures for some sports (e.g. NASCAR feed errors)

Impact:
- increased tail latency and intermittent partial payloads.
- raises probability of transient empty/stale client responses.

## Priority Next Steps

1. Consolidate page-bundle endpoints for high-traffic routes:
   - Home
n   - Games
   - Odds
   - Game Detail

2. Move to shared query-key cache contract across client pages:
   - route-level cache + request dedupe + stale-while-revalidate.

3. Isolate live widgets from shell payload refresh:
   - no full tree rerenders on live ticks.

4. Add per-route request counters and duplicate call telemetry in client runtime:
   - route transition start/end timing
   - request count by route
   - cache hit/miss ratio

5. Normalize local D1 schema parity so fallback paths are not constantly invoked under errors.

## Stability Rule
Never overwrite valid rendered data with empty, transient, timeout, or malformed refresh payloads.
