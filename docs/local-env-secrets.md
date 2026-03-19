# Local Environment and Secrets

This document defines the local secret setup for running the app on macOS with SportsRadar as the primary provider.

## Source of truth

- Worker secrets: `.dev.vars` (local, gitignored)
- Template: `.dev.vars.example` (committed, placeholders only)
- Non-secret Cloudflare bindings come from `wrangler.json`:
  - `DB` (D1)
  - `R2_BUCKET` (R2)
  - `EMAILS` (service binding)

## Environment variable inventory

### Required for core local functionality

- `MOCHA_USERS_SERVICE_API_URL`
- `MOCHA_USERS_SERVICE_API_KEY`
- `SPORTSRADAR_API_KEY`

### Optional with graceful fallback

- `SPORTSRADAR_ODDS_KEY` (falls back to `SPORTSRADAR_API_KEY` in key routes)
- `SPORTSRADAR_GOLF_KEY` (falls back to primary SportsRadar key)
- `SPORTSRADAR_PLAYER_PROPS_KEY` (falls back to primary SportsRadar key)
- `SPORTSRADAR_PROPS_KEY` (legacy alias for props)
- `TICKET_HANDLE_FEED_URL` (enables real ticket/handle split ingestion for `/api/odds/*`)
- `TICKET_HANDLE_FEED_API_KEY` (optional bearer token for split feed)
- `ANTHROPIC_API_KEY` (optional for Coach G model-router Claude lane)
- `GEMINI_API_KEY` (optional for Coach G model-router Gemini lane)
- `OPENAI_API_KEY` (AI routes/features only)
- `FIRECRAWL_API_KEY` (preview enrichment only)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (push notifications only)
- `SPORTSDATAIO_API_KEY`, `SPORTSDATAIO_SPORTSBOOK_GROUP_ID` (legacy compatibility paths)
- `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_NAME` (Coach G video generation)
- `INSTAGRAM_ACCESS_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN` (Coach G social publishing)
- `APP_BASE_URL` (deep links in Coach G captions and owned-channel references)

## Missing report for this machine (current repo state)

Using the current `.dev.vars` created for local setup:

- Missing required values (still placeholders):
  - `MOCHA_USERS_SERVICE_API_URL=REPLACE_ME`
  - `MOCHA_USERS_SERVICE_API_KEY=REPLACE_ME`
  - `SPORTSRADAR_API_KEY=REPLACE_ME`
- Optional values are intentionally empty, which keeps fallback behavior active:
  - `SPORTSRADAR_ODDS_KEY=`
  - `SPORTSRADAR_GOLF_KEY=`
  - `SPORTSRADAR_PLAYER_PROPS_KEY=`
  - `SPORTSRADAR_PROPS_KEY=`
  - `OPENAI_API_KEY=`
  - `FIRECRAWL_API_KEY=`
  - `VAPID_PUBLIC_KEY=`
  - `VAPID_PRIVATE_KEY=`
  - `SPORTSDATAIO_API_KEY=`
  - `SPORTSDATAIO_SPORTSBOOK_GROUP_ID=`

## Graceful fallback behavior

- Missing Mocha auth config now returns clear `503` JSON responses on auth routes instead of brittle downstream failures.
- Missing SportsRadar keys return explicit API errors on SportsRadar-dependent endpoints.
- Missing Firecrawl key skips web scraping in preview flow.
- Missing push VAPID keys returns `503` on push key endpoint (push remains disabled rather than crashing app).
- Empty optional keys in `.dev.vars` prevent accidental invalid outbound API calls.
- Missing Coach G video/avatar/voice vars keeps text published and marks video jobs `retry_pending`.
- Missing platform token(s) skips only the affected platform publish path, without failing the pipeline.

## Local runbook

1. Edit `.dev.vars` and set these first:
   - `MOCHA_USERS_SERVICE_API_URL`
   - `MOCHA_USERS_SERVICE_API_KEY`
   - `SPORTSRADAR_API_KEY`
2. Start dev:
   - `npm run dev`
3. Optional checks:
   - `curl http://localhost:5173/api/teams/test/NBA`
   - `curl http://localhost:5173/api/push/vapid-public-key`
   - `curl http://localhost:5173/api/coachg/admin/pipeline/health -H "X-Demo-Mode: true"`

If AI features are needed, also set `OPENAI_API_KEY` (and optionally `FIRECRAWL_API_KEY`).
