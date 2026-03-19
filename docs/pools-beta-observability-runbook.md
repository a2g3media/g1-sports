# Pools Private Beta Observability Runbook

## Purpose

Run a controlled private beta for pools with strict evidence on stability, scoring integrity, and marketplace trust surfaces before broad release.

## Preconditions

- Feature flags configured for beta cohort:
  - `MARKETPLACE_ENABLED`
  - `LISTING_FEES_ENABLED`
  - `COMMISSIONER_RATINGS_ENABLED`
  - `PUBLIC_POOLS` (if marketplace discoverability is included in beta)
- Local/preview worker is reachable (default expected by scripts: `http://127.0.0.1:8787`).
- Baseline gate scripts pass:
  - `npm run qa:pools:evaluators`
  - `npm run qa:pools:ui`
  - `npm run qa:pools:api`
  - `npm run smoke:pools`
  - `npm run smoke:routes:deep`

## Daily Beta Execution Loop

1. **Pre-window validation**
   - Run `npm run qa:pools:gates`.
   - Capture failures by command and endpoint.
2. **Operational monitor**
   - Run `MONITOR_WINDOWS=4 MONITOR_INTERVAL_MS=1800000 npm run ops:monitor`.
   - Review generated summary file in `docs/`.
3. **Data integrity checks**
   - Verify sample leagues dual-write consistency:
     - pick action count in `picks` matches corresponding `pool_entry_actions`.
   - Verify listing fee ledger integrity:
     - every listed pool with fee event has matching `transaction_ledger` row.
4. **Marketplace trust checks**
   - Submit commissioner rating test flow.
   - Confirm profile aggregate updates (rating average/count) surface in marketplace and pool hub.
5. **Issue triage and burn-down**
   - Log beta issues with severity and route ownership.
   - Prioritize P0/P1 before next beta window.

## Error Budget / SLO Gates

- 5xx error rate <= 2% per monitor window.
- No sustained 429 on core surfaces in two consecutive windows.
- Coach G route latency median <= 2500ms and p95 <= 5000ms.
- Commissioner profile save success >= 99%.
- Zero unresolved scoring-drift incidents between standings and scored picks.

## Exit Criteria

- `qa:pools:gates` passes on 3 consecutive runs.
- No P0 issues open for 72 hours.
- No regression in lock enforcement, event-map eligibility, or scoring calculations.
- Marketplace payload shape remains stable across the beta window.
- Stakeholder sign-off on commissioner trust and listing fee UX.

## Rollback Triggers

- Sustained 5xx breach in two consecutive windows.
- Reproducible scoring drift or lock bypass.
- Listing fee ledger orphan records increase across two checks.
- Marketplace endpoints show unstable contract (missing required keys on 200 responses).
