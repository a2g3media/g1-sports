# Phase 0 - Release Gates (Pass/Fail)

## Rule Zero

Converted consumer request path must be snapshot read-only.

Fail immediately if any converted route performs provider/live assembly on request path.

## Mandatory Metrics

- `SNAPSHOT_HIT`
- `SNAPSHOT_MISS`
- `LAST_GOOD_USED`
- `SNAPSHOT_UNAVAILABLE`
- `ROUTE_RESPONSE_MS`
- `SNAPSHOT_BUILD_MS`
- `WRONG_IDENTITY_REJECTED`
- `EMPTY_PAYLOAD_REJECTED`
- `REFRESH_IMPROVED_ROUTE`
- `REQUEST_PATH_PROVIDER_CALL_COUNT`

## Test Matrix (Canary + Pre-Prod)

| Gate ID | Probe | Pass Condition |
|---|---|---|
| RG-001 | cold player top-N | first click usable, no refresh needed |
| RG-002 | warm player top-N | equal-or-better than cold; no degraded regression |
| RG-003 | cold team top-N | first click usable, no refresh needed |
| RG-004 | warm team top-N | equal-or-better than cold; no degraded regression |
| RG-005 | cold game active/upcoming top-N | first click usable, no refresh needed |
| RG-006 | warm game active/upcoming top-N | equal-or-better than cold; no degraded regression |
| RG-007 | home feed | active dates render real slate or explicit no-games metadata |
| RG-008 | games feed | no empty success payload for active dates |
| RG-009 | odds feed | no empty success payload when games exist |
| RG-010 | identity invariants | served canonical identity exactly matches requested identity |
| RG-011 | empty/degraded invariants | empty-shaped/degraded fake success never accepted as usable |
| RG-012 | request-path purity | `REQUEST_PATH_PROVIDER_CALL_COUNT == 0` for converted families |
| RG-013 | refresh delta | `REFRESH_IMPROVED_ROUTE == 0` for converted families |
| RG-014 | load safety | background builders do not regress request p95/p99 SLOs |

## Stop-Ship Conditions

Immediate stop-ship if any of:
- provider/live assembly appears on converted request path,
- wrong identity served,
- empty/degraded fake success served as valid,
- refresh improves completeness for converted family.

Rollout block thresholds:
- `REFRESH_IMPROVED_ROUTE > 0%`,
- wrong identity rate `> 0`,
- empty success rate `> 0`,
- converted route `REQUEST_PATH_PROVIDER_CALL_COUNT > 0`.

## Evidence Template (Required for Phase Promotion)

Attach the following for each phase:

1. Probe report (cold + warm)
   - sample list IDs
   - first-click usable result table
   - degraded/unavailable counts
2. Metrics snapshot
   - all mandatory metrics over gate window
   - p50/p95/p99 request latency
3. Request-path purity audit
   - grep/signature proof that converted handlers have no provider/live call sites
4. Validator proof
   - wrong-identity and empty payload rejection counters
5. Sign-off checklist
   - Backend
   - Frontend
   - QA
   - Ops

## Promotion Rule

- advance to next phase only when all gates pass.
- if any gate fails, freeze promotion and fix only current phase; rerun full matrix.
