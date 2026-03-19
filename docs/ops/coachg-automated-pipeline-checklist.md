# Coach G Automated Pipeline Checklist

## Required Runtime Variables

- `HEYGEN_API_KEY`
- `HEYGEN_AVATAR_ID`
- `HEYGEN_VOICE_NAME`
- `INSTAGRAM_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `TIKTOK_ACCESS_TOKEN`
- `APP_BASE_URL`

## Core Services Added

- `src/worker/services/featuredGameSelectorService.ts`
- `src/worker/services/coachgContentFactoryService.ts`
- `src/worker/services/coachgScriptService.ts`
- `src/worker/services/coachgDailyPipelineService.ts`
- `src/worker/services/socialPublisherService.ts`
- `src/worker/services/captionGeneratorService.ts`
- `src/worker/services/coachgFeaturedContentRepository.ts`

## Data Model Additions

- `coachg_featured_items`
- `coachg_social_posts`
- `coachg_pipeline_runs`
- `coachg_pipeline_config`

Migration: `migrations/84.sql`

## Smoke Checks (Pre-Launch)

1. Run pipeline manually:
   - `POST /api/coachg/admin/pipeline/run` with demo header when needed.
2. Verify one featured item per enabled sport:
   - `GET /api/coachg/admin/featured?limit=100`
3. Verify intro style compliance:
   - confirm each `videoScript` starts with `What's up G1, Coach G here.`
4. Verify text-first rendering:
   - open `/intelligence`, confirm featured card appears even if `videoStatus` is pending.
5. Verify social retry path isolation:
   - force one token failure, ensure pipeline completes and failed platform is logged only.
6. Verify health diagnostics:
   - `GET /api/coachg/admin/pipeline/health`

## Rollout Guardrail

- Keep `shadow_mode=true` in `coachg_pipeline_config` for first run in production.
- Flip `shadow_mode=false` only after smoke checks pass.
