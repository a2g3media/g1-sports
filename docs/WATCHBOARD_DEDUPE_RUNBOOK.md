# Watchboard Dedupe Runbook

This runbook merges duplicate watchboards for each user (same board name, case-insensitive), moves all items onto a canonical board, and removes duplicate board shells.

## What It Fixes

- Duplicate board names like repeated `Board 1`
- "Board not found" failures caused by stale/duplicate board IDs
- Home/watchboard page drift after duplicate merges

## Migration

Migration file: `migrations/99.sql`

## Dry Run (Local DB)

```bash
npm run migrate:local:99
```

## Run on Remote

```bash
npm run migrate:remote:99
```

## Post-Run Validation (Remote)

Use `wrangler d1 execute ... --remote --command "<sql>"` with the same DB + config used in package scripts.

### 1) Confirm no duplicate names per user

```sql
SELECT user_id, lower(trim(name)) AS name_key, COUNT(*) AS cnt
FROM watchboards
GROUP BY user_id, lower(trim(name))
HAVING COUNT(*) > 1;
```

Expected: **0 rows**

## Stability Smoke (Local)

After schema/runtime repair, run a watchboard create smoke that validates first + second board creation and cleanup:

```bash
node scripts/qa-page-data-p0-routes.mjs --base http://localhost:5173 --watchboard-smoke --strict
```

If strict mode fails on watchboard smoke, investigate `create-with-game` latency and `home-preview?fast=1` payload health before continuing.

### 2) Confirm one active board per user

```sql
SELECT user_id, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count
FROM watchboards
GROUP BY user_id
HAVING active_count <> 1;
```

Expected: **0 rows**

### 3) Confirm no duplicate games per board

```sql
SELECT watchboard_id, game_id, COUNT(*) AS cnt
FROM watchboard_games
GROUP BY watchboard_id, game_id
HAVING COUNT(*) > 1;
```

Expected: **0 rows**
