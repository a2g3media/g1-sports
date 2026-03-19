# Pools Rollout Checklist

## Feature Flags

- `MARKETPLACE_ENABLED`: controls marketplace discovery APIs and UI cards.
- `LISTING_FEES_ENABLED`: controls whether listing fees are enforced in marketplace listing updates.
- `COMMISSIONER_RATINGS_ENABLED`: controls commissioner rating collection and profile surfacing.
- `PUBLIC_POOLS`: prerequisite for public marketplace discoverability.

## Engine Integrity Gates

- Run command: `npm run qa:pools:evaluators`
- Pick submission dual-writes to `picks` and `pool_entry_actions`.
- `pool_event_map` eligibility enforcement validates event universe when configured.
- Lock checks enforce `first_game` period lock and per-event start lock.
- Scoring uses shared points logic for confidence vs non-confidence templates.

## API Smoke

- Run command: `npm run smoke:pools`
- Run command: `npm run smoke:routes:deep`
- Run command: `npm run qa:pools:api`
- `GET /api/pool-admin/my-pools`
- `GET /api/pool-admin/:leagueId/members`
- `PUT /api/pool-admin/:leagueId/event-map`
- `GET /api/pool-admin/:leagueId/event-map`
- `PATCH /api/pool-admin/:leagueId/marketplace-listing`
- `GET /api/pool-admin/:leagueId/marketplace-listing-fees`
- `GET /api/pool-admin/:leagueId/join-requirements`
- `PATCH /api/pool-admin/:leagueId/join-requirements`
- `POST /api/pool-admin/:leagueId/members/:memberId/approve`
- `POST /api/pool-admin/:leagueId/members/:memberId/reject`
- `GET /api/marketplace/pools`
- `GET /api/marketplace/commissioners/me`
- `GET /api/marketplace/commissioners/:userId`
- `PATCH /api/marketplace/commissioners/me`
- `POST /api/marketplace/pools/:leagueId/rate`

## UI Smoke

- Run command: `npm run qa:pools:ui`
- Run command: `npm run qa:pools:join`
- Pools list renders differentiated template icons.
- Pool hub header icon matches template type.
- Create pool format step renders template icon variants.
- Marketplace cards render only when marketplace endpoint returns results.
- Join rules toggles render in settings and "Current behavior preview" updates live.

## Telemetry Gates

- Run command: `npm run ops:monitor`
- Confirm 5xx error rate <= 2% in each monitoring window.
- Confirm no sustained 429 on core surfaces for two consecutive windows.
- Confirm Coach G route latency median <= 2500ms and p95 <= 5000ms.
- Escalate to rollback if sustained critical endpoint hard failures are detected.

## One Command Gate

- Run command: `npm run qa:pools:gates`
- Run command: `npm run qa:pools:release` for a concise PASS/WARN/FAIL release verdict.
- Run command: `npm run qa:pools:release:report` to generate a timestamped release report artifact in `docs/release-reports/`.
- Requires local worker availability (default `SMOKE_BASE_URL=http://127.0.0.1:8787`).
- Beta operations guide: `docs/pools-beta-observability-runbook.md`

## Beta Exit Criteria

- No lock regressions in pick submit for 3 consecutive cycles.
- No scoring drift between standings and scored picks.
- Marketplace browse and rating endpoints return stable payload shape.
- Error-rate and latency dashboards remain within SLO for one week.
- Commissioner profile save success rate >= 99% across beta traffic.
- Listing fee ledger rows reconcile to listing updates with zero orphan records.
- `npm run qa:pools:gates` passes on three consecutive pre-release runs.
