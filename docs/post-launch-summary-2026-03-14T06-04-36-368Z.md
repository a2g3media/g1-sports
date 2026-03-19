# 24h Post-Launch Summary

- Run timestamp: 2026-03-14T06:04:41.398Z
- Base URL: http://127.0.0.1:8787
- Monitoring windows executed: 2

## Current smoke verdict

- READY (from post-deploy smoke execution)

## 429/5xx trend summary

- 429 trend: W1:0 | W2:0
- 5xx trend: W1:6 | W2:6
- Total failed trend: W1:6 | W2:6

## Coach G latency summary

- W1:median=n/a,p95=n/a | W2:median=n/a,p95=n/a

## Mitigations applied

- Critical endpoints failing in latest window: health-all, coachg-intelligence, coachg-chat, mma-schedule, golf-current.

## Recommendation

- rollback
- Sustained 5xx breach in two consecutive windows; investigate worker routes and consider rollback trigger.

## Escalation checks

- Provider throttling path: validate stale-cache and degraded mode messaging.
- Internal 5xx path: inspect worker logs and route-level recent changes first.
