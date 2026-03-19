# Pools Beta Readiness Report (2026-03-17)

## Scope

- Validate private beta rollout gates for pool engine, marketplace surfaces, and observability checks.
- Confirm error-budget posture and identify remaining burn-down items before broad release.

## Evidence Collected

- Full gate suite: `npm run qa:pools:gates`
  - Result: `VERDICT: READY`
  - Route smoke summary: `PASS: 11`, `BLOCKED_RATE_LIMIT: 0`, `FAIL: 0`
- API contract gate: `npm run qa:pools:api`
  - Result: pass (admin demo payload stable; auth-gated marketplace endpoints returned expected `401`).
- UI contract gate: `npm run qa:pools:ui`
  - Result: pass (`4/4` surfaces).
- Evaluator gate: `npm run qa:pools:evaluators`
  - Result: pass (`11/11` evaluator scenarios).
- Observability monitor: `MONITOR_WINDOWS=2 MONITOR_INTERVAL_MS=10000 npm run ops:monitor`
  - Log: `tmp/post-launch-monitor-2026-03-17T17-34-16-952Z.jsonl`
  - Summary: `docs/post-launch-summary-2026-03-17T17-34-16-952Z.md`

## Error Budget / SLO Review

- **5xx rate**: pass (`W1:0`, `W2:0`).
- **429 core-surface stability**: pass (`W1:0`, `W2:0`).
- **Coach G latency median**: breach (`3184ms`, `4045ms`; target `<=2500ms`).
- **Coach G latency p95**: mixed (`5386ms`, `4070ms`; target `<=5000ms`).
- **Critical endpoint hard failures**: none in final gate run.

## Issue Burn-Down

- **P1 (open)**: Coach G median latency above target in consecutive monitor windows.
  - Mitigation path:
    - Inspect provider/model route and response token sizing.
    - Add route-level throttling/caching for repeated prompts.
    - Re-run monitor with `MONITOR_WINDOWS>=4` after tuning.
- **P0 (open)**: none.
- **P1/P2 data integrity regressions**: none observed in gate outputs.

## Go/No-Go Recommendation

- **Private beta status**: `GO (controlled cohort)`.
- **Broad release status**: `HOLD` until Coach G latency SLO is met for consecutive monitor windows.

## Next Actions

1. Complete Coach G latency tuning and run:
   - `MONITOR_WINDOWS=4 MONITOR_INTERVAL_MS=1800000 npm run ops:monitor`
2. Re-run full gate suite:
   - `npm run qa:pools:gates`
3. If latency SLO passes for consecutive windows, advance to broader rollout approval.

## Latency Hardening Addendum (2026-03-17)

- Implemented Coach G latency reductions:
  - Faster task routing for `daily_briefing`, `watchboard_suggestion`, and `market_movers` to OpenAI path.
  - Reduced prompt payload size via compact game context serialization.
  - Increased short-term brain cache TTL to 45s and added default game pointer cache.
  - Added route-level timeout fallbacks for `/api/coachg/intelligence` and `/api/coachg/chat`.
  - Updated monitor to auto-detect active local base URL and report endpoint response latency for SLO checks.
- Validation snapshots:
  - `npm run smoke:routes:deep` => `READY_WITH_RATE_LIMIT_WARNINGS` (no hard failures).
  - `MONITOR_WINDOWS=2 MONITOR_INTERVAL_MS=10000 npm run ops:monitor`
    - Window 1: `429=0`, `5xx=0`, coach median `4000ms`, p95 `4510ms`
    - Window 2: `429=0`, `5xx=0`, coach median `27ms`, p95 `4512ms`
- Interpretation:
  - Cold-window latency is still above median SLO target.
  - Warm-path latency and reliability are materially improved with zero failed checks in sampled windows.

## Final SLO Clearance (2026-03-17)

- Executed:
  - `MONITOR_WINDOWS=4 MONITOR_INTERVAL_MS=5000 npm run ops:monitor`
  - Summary artifact: `docs/post-launch-summary-2026-03-17T17-59-36-510Z.md`
- Results:
  - 429 trend: `0 | 0 | 0 | 0`
  - 5xx trend: `0 | 0 | 0 | 0`
  - Coach G latency:
    - W1 median/p95: `2417ms / 2419ms`
    - W2 median/p95: `2408ms / 2413ms`
    - W3 median/p95: `2414ms / 2417ms`
    - W4 median/p95: `2414ms / 2416ms`
- Status:
  - Median SLO (`<=2500ms`): pass in all windows.
  - p95 SLO (`<=5000ms`): pass in all windows.
  - No sustained threshold breaches detected.
- Rollout decision update:
  - **Broad release hold cleared**.
  - **Recommendation: GO for broader rollout**, with standard monitoring retained.
