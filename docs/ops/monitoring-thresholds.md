# Post-Launch Monitoring and Alert Thresholds

## Cadence

- First 2 hours: check every 15-30 minutes.
- Until 24 hours: check hourly.
- Health probe endpoint: `/api/health/all`.

## Metrics To Track Each Window

- API `429` count.
- API `5xx` count and `5xx` percentage.
- Coach G latency (median and p95) from route latency fields or response timing.

## Sustained Alert Conditions

Trigger alert when condition persists for **2 consecutive windows**:

- `5xx` > 2% of sampled requests, or critical endpoint continuously failing.
- `429` sustained on core surfaces (`/api/mma/*`, `/api/golf/*`, `/api/coachg/*`) for more than 10 minutes.
- Coach G latency regression:
  - median > 2.5s for 15+ minutes, or
  - p95 > 5s.

## Escalation Order

1. Provider throttling path (SportsRadar): verify degraded mode expectations and stale-cache behavior.
2. Internal fault path (`5xx`): inspect worker logs and route-level recent changes.
3. If unresolved and user impact continues: execute rollback protocol.
