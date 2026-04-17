# Phase 0 — Player profile observability

## What was added

1. **Structured logs** — Every successful `/api/page-data/player-profile` response logs a line with prefix `[PageData][player-profile][phase0]` and an **`outcome`** (for example `l1_fresh`, `d1_primary`, `fast_lane_id`, `degraded_snapshot_miss`).
2. **Reject scans** — When L1 or D1 had snapshot rows but none passed `shouldAcceptPayload`, a separate log line records `l1_fresh_rejected_snapshots` / `d1_primary_rejected_snapshots` (etc.) with **`firstRejectReason`** (for example `name_only_needs_canonical_id`, `identity_mismatch`).
3. **Histogram** — `recordRouteRenderEvent` records **`loadMs`** for route `player-profile` (used in `/api/page-data/metrics` under `routes["player-profile"].routeLoadMs`).
4. **Counter** — `pageDataPlayerProfileSnapshotRejected` increments when a stored snapshot is skipped; **`derived.snapshotRejectPct`** in metrics is reject count ÷ player-profile requests.

## How to read logs (local)

```bash
# Wrangler tail (production/staging as configured)
npx wrangler tail
```

Filter for `player-profile][phase0` in your log viewer.

## How to read metrics

Authenticated `GET /api/page-data/metrics` returns JSON:

- `counters.pageDataPlayerProfileSnapshotRejected`
- `derived.snapshotRejectPct`
- `routes["player-profile"].routeLoadMs` (p50 / p95 / avg)

## Repeat-navigation check

1. Open a player URL twice in a row (same browser session).
2. First load: note `outcome` (often cold path: `fast_lane_*`, `emergency_hydrate`, or cache hit if pre-warmed).
3. Second load: expect **`l1_fresh`** or **`l1_stale`** / **`d1_*`** if snapshots were written and keys match.

If the second load still hits cold paths, check logs for **`rejected_snapshots`** and **`firstRejectReason`**.
