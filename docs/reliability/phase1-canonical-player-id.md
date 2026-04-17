# Phase 1 — Canonical player id in navigation and fetches

## Behavior

- **`canonicalPlayerIdQueryParam`** ([`navigationRoutes.ts`](../../src/react-app/lib/navigationRoutes.ts)) — returns a numeric ESPN-style id (`^\d{4,}$`) for use in `?playerId=` and cache keys; otherwise `undefined`.
- **Player profile route** — After the profile loads with a usable `espnId`, the app **`replace`** navigates to the same path with **`?playerId=<id>`**, so reloads and client cache keys (`player-profile:v2:...:id`) match server `buildPlayerProfileCacheKeyCandidates` id keys.
- **Inbound links** — Search, team roster, hub leaders, watchboard, NHL/NCAAB hub mocks, team scout rail, and Odds game roster prefetch pass **`canonicalPlayerIdQueryParam(...)`** into `buildPlayerRoute` or profile API URLs when an id is available.

## Verify

1. Open a player by **name only** (no query). After data loads, the URL should gain **`?playerId=`** without a full page reload.
2. Second navigation to the same player should hit **L1/D1** with stable identity (see Phase 0 logs).
