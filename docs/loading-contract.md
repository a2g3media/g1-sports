# Loading Contract

This contract defines how page-level data loaders must behave.

## Required Behavior

- Keep last known usable data visible during transient failures.
- Retry transient request failures before surfacing blocking errors.
- Show blocking error states only when retries are exhausted and no usable data exists.
- Prefer cached or seeded data for first paint, then refresh in background.
- Guard async commits using request generation checks and abort signaling.

## Standard Hook

- New page-level fetch flows must use `useSafeDataLoader` (or a wrapper built on top of it).
- `useSafeDataLoader` owns retry, timeout, stale-protection, and in-memory last-success cache.

## Scope Guardrail

- The locked Odds engine is out of scope for this contract unless separately approved.
