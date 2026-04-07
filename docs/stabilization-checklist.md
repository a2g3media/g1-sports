# Page-Data Stabilization Checklist

This document defines stabilization-mode operations after page-data lane rollout.

## Scope and Guardrails

- Keep current route flags enabled as-is:
  - `PAGE_DATA_GAMES_ENABLED`
  - `PAGE_DATA_ODDS_ENABLED`
  - `PAGE_DATA_SPORT_HUB_ENABLED`
  - `PAGE_DATA_GAME_DETAIL_ENABLED`
- Do **not** refactor core route-loading architecture unless metrics breach gates.
- Do **not** modify working page-data endpoints during stabilization.
- Do **not** reintroduce client-side fetch waterfalls.

## Monitoring Cadence

- Quick checks: **2-3 times daily** (start of day, mid-day, end of day).
- Deep check: **1 daily** (full gate + trend review).

### Quick Check (2-3x daily)

- Pull `/api/page-data/metrics`.
- Verify route health for: `games`, `odds`, `sport-hub`, `game-detail`.
- Confirm no rollback thresholds are breached.

### Daily Deep Check (1x daily)

- Run canary gate script:
  - `npm run qa:page-data:gates:canary`
- Run trend comparison:
  - `npm run qa:page-data:trends -- --current <current.json> --baseline <baseline.json>`
- Log status: `stable`, `watch`, or `rollback-candidate`.

## Rollback Thresholds

Use launch-level thresholds as production rollback gates for core lanes:

- Route p95 latency:
  - breach if any core route (`games`, `odds`, `sport-hub`, `game-detail`) is **> 2500ms**
- Cold-path percentage:
  - breach if overall `cold_path_pct` is **> 15%**
- Odds availability at first render:
  - breach if any core route falls **< 92%**
- Combined cache hit rate (`l1 + l2`):
  - breach if combined hit rate falls **< 85%**
- Degraded responses:
  - breach if degraded payload rate is sustained above **2%** for a core route

Operational rule:

- Treat as rollback-candidate if a threshold is breached in **2 consecutive quick checks** or **1 deep check**.
- Roll back with feature flags first; do not hot-refactor core loading during incident response.

## Warm Trigger Instructions

Use warm when precompute appears stale, cold-path rises, or before expected traffic spikes.

Endpoint:

- `POST /api/page-data/warm`

Query params:

- `fresh=1` (optional, force fresh cycle)
- `date=YYYY-MM-DD` (optional, default is today ET)

Examples:

- Default warm cycle:
  - `curl -X POST "https://<host>/api/page-data/warm"`
- Force-fresh warm cycle:
  - `curl -X POST "https://<host>/api/page-data/warm?fresh=1"`
- Date-scoped warm cycle:
  - `curl -X POST "https://<host>/api/page-data/warm?date=2026-04-02"`

Auth:

- `POST /api/page-data/warm` and `GET /api/page-data/metrics` are auth-protected.
- Use the same QA auth method already used by gates (`QA_COOKIE` or `QA_BEARER`).

## Key Metrics to Watch

Primary:

- Route load time: `p50` and `p95` by route
- `cold_path_pct`
- Cache hit: `l1_hit_rate_pct`, `l2_hit_rate_pct`, and combined hit rate
- `odds_availability_pct` (odds at first render)

Secondary:

- `api_calls_p95` per route
- request volume per route (to validate sample quality)
- degraded/partial payload incidence

## Prioritized Backlog (No Implementation Yet)

1. **`/api/page-data/standings`**
   - snapshot-first
   - stale-first
   - partial-safe envelope
2. **`/api/page-data/summary`**
   - snapshot-based summary modules for top-level surfaces
3. **Telemetry dashboard polish**
   - simple health view for route `p50/p95`, cold-path %, cache hit %, odds availability
4. **Docs + ops runbook cleanup**
   - align standard doc, on-call rollback playbook, and warm trigger SOP

## Change Policy During Stabilization

- Allowed:
  - metrics/monitoring updates
  - docs/runbook updates
  - flag-only mitigation
- Not allowed (unless gates are breached):
  - core route loading rewrites
  - endpoint behavior refactors
  - new client-side orchestration logic
