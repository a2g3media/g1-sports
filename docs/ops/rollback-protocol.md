# Rollback Protocol

Use this protocol when launch quality drops below runbook thresholds.

## Trigger Conditions

- `smoke:quick` or `smoke:routes:deep` returns `NO_GO` after mitigation attempt.
- Core endpoints show sustained user-impacting `5xx` failures.
- Coach G becomes unavailable across core surfaces.

## Restore Path

1. Deploy previous known-good release snapshot (SHA/config pairing).
2. Re-apply known-good Cloudflare secrets if they changed.
3. Re-run verification gates:
   - `npm run smoke:quick`
   - `npm run smoke:routes:deep`
4. Validate critical product paths:
   - `/api/coachg/chat`
   - `/api/coachg/intelligence`
   - `/api/mma/next`
   - `/api/mma/schedule`
   - `/api/mma/event/:id`
   - `/api/golf/current`
   - `/api/golf/leaderboard/:id`

## Validation Commands

```bash
npm run smoke:quick
npm run smoke:routes:deep
```

## Decision Rule

- If both gates return `READY`: keep rollback release live and continue hourly monitoring.
- If `NO_GO` persists: escalate to incident response and freeze feature deploys.
