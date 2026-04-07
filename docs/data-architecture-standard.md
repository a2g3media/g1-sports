# G1 Sports Data Architecture Standard

This document defines the mandatory data-loading standard for all current and future sports surfaces.

## Core Principles

- Frontend does not orchestrate complex multi-stage fallback chains for page assembly.
- Route loads are stale-first by default for non-live content.
- Live and non-live data paths are isolated.
- Expensive fresh provider compute is removed from route-critical user paths.
- Backend owns orchestration, fallback selection, and degraded-mode decisions.

## Canonical Request Model

- One primary page-data request per route family:
  - `/api/page-data/games`
  - `/api/page-data/sport-hub`
  - `/api/page-data/game-detail`
  - `/api/page-data/standings`
- Page-data responses include:
  - normalized page-ready payload
  - freshness metadata
  - degraded/partial metadata
  - source/caching hints

## Freshness Classes

- `static`: long-lived, schedule-only refresh
- `slow`: low-change snapshots, stale-first
- `medium`: route-level default for slates/hubs
- `live`: short TTL and isolated live updates
- `finalizing`: post-game short burst refresh window

## Cache Ownership

- L1: worker isolate memory + inflight dedupe
- L2: D1 snapshot cache (`api_cache`) for page-data payloads
- L3: provider/raw caches and odds maps
- L4: edge/browser cache headers

Page-data endpoints read L1/L2 first and return quickly. L3 is assembly input only.

## Rollout and Guardrails

- Dual-run behind feature flags.
- Mandatory observability:
  - route load p50/p95
  - L1/L2 hit rates
  - cold-path percentage
  - odds-at-first-render
  - API calls per route transition
- Stage promotion requires meeting defined canary and launch thresholds.

### Gate Profiles

Use `/api/page-data/metrics` as the single source of truth and enforce:

- Canary profile (`qa:page-data:gates:canary`)
  - min requests per route (`games`, `odds`, `sport-hub`, `game-detail`): `>= 20`
  - route load p50: `<= 1600ms`
  - route load p95: `<= 3200ms`
  - combined hit rate (`l1 + l2`): `>= 70%`
  - cold path percentage: `<= 35%`
  - odds at first render: `>= 85%`
  - API calls per route p95: `<= 2`

- Launch profile (`qa:page-data:gates:launch`)
  - min requests per route (`games`, `odds`, `sport-hub`, `game-detail`): `>= 50`
  - route load p50: `<= 1200ms`
  - route load p95: `<= 2500ms`
  - combined hit rate (`l1 + l2`): `>= 85%`
  - cold path percentage: `<= 15%`
  - odds at first render: `>= 92%`
  - API calls per route p95: `<= 1.5`

Runbook:

- Canary:
  - `npm run qa:page-data:gates:canary`
- Launch:
  - `npm run qa:page-data:gates:launch`

If metrics endpoint auth is enabled, provide credentials:

- cookie: `QA_COOKIE="session=..." npm run qa:page-data:gates:canary`
- bearer: `QA_BEARER="<token>" npm run qa:page-data:gates:launch`

## Anti-Patterns (Disallowed)

- Browser-side fallback waterfalls for odds/page assembly.
- Full page refreshes triggered by live updates.
- Per-page ad hoc cache key strategies.
- Route load waiting on deep fresh odds compute.
- Multiple independent owners fetching the same page data on mount.

