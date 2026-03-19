# 24h Post-Launch Summary

- Run timestamp: 2026-03-17T17:35:17.244Z
- Base URL: http://localhost:5173
- Monitoring windows executed: 2

## Current smoke verdict

- READY (from post-deploy smoke execution)

## 429/5xx trend summary

- 429 trend: W1:0 | W2:0
- 5xx trend: W1:0 | W2:0
- Total failed trend: W1:0 | W2:0

## Coach G latency summary

- W1:median=3184ms,p95=5386ms | W2:median=4045ms,p95=4070ms

## Mitigations applied

- No mitigations needed in latest window.

## Recommendation

- monitor-only
- Coach G latency breach in two consecutive windows; inspect provider/model route and throttle expensive calls.

## Escalation checks

- Provider throttling path: validate stale-cache and degraded mode messaging.
- Internal 5xx path: inspect worker logs and route-level recent changes first.
