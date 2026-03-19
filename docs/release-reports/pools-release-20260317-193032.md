# Pools Release Report

- Started at: 2026-03-18T02:30:32.331Z
- Total duration: 105.4s
- PASS: 5
- WARN: 1
- FAIL: 0
- Verdict: **READY_WITH_WARNINGS**

## Check Results

- [PASS] `evaluators` (11.1s) - pass
  - Command: `npm run qa:pools:evaluators`
- [PASS] `ui-contract` (10.2s) - pass
  - Command: `npm run qa:pools:ui`
- [PASS] `api-contract` (11.4s) - pass
  - Command: `npm run qa:pools:api`
- [PASS] `join-contract` (11.0s) - pass
  - Command: `npm run qa:pools:join`
- [PASS] `pools-smoke` (10.5s) - pass
  - Command: `npm run smoke:pools`
- [WARN] `routes-deep` (51.2s) - pass with external rate-limit warning
  - Command: `npm run smoke:routes:deep`

## Next Action
- Proceed with release; monitor external provider rate-limit warnings.

