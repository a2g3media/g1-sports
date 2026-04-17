# Historical Line Archive Runbook

## 1) Apply schema

```bash
wrangler d1 execute 019ce56b-b0ff-7056-a2d5-613f9cde7650 --local --file=migrations/96.sql
```

Remote:

```bash
wrangler d1 execute 019ce56b-b0ff-7056-a2d5-613f9cde7650 --remote --file=migrations/96.sql --config=wrangler.d1.migrations.json
```

## 2) Start worker locally

```bash
npm run dev
```

## 3) Start archive ingestion loop (admin route)

```bash
curl -X POST "http://localhost:5173/api/sports-data/archive/loop/start"
```

Set interval and sport enablement (non-active sports remain scaffolded/disabled by default):

```bash
curl -X POST "http://localhost:5173/api/sports-data/archive/loop/config" \
  -H "content-type: application/json" \
  -d '{
    "intervalSeconds": 20,
    "sports": {
      "NBA": true,
      "NFL": true,
      "MLB": true,
      "NHL": true,
      "SOCCER": true,
      "NCAAB": true,
      "NCAAF": true,
      "GOLF": false,
      "MMA": false,
      "BOXING": false,
      "TENNIS": false,
      "NASCAR": false
    }
  }'
```

Run one manual cycle:

```bash
curl -X POST "http://localhost:5173/api/sports-data/archive/loop/tick"
```

Status:

```bash
curl "http://localhost:5173/api/sports-data/archive/loop/status"
```

## 4) Manual verified-line lock job

```bash
curl -X POST "http://localhost:5173/api/sports-data/archive/lock-verified" \
  -H "content-type: application/json" \
  -d '{"sport":"NHL"}'
```

## 5) Manual grading job

```bash
curl -X POST "http://localhost:5173/api/sports-data/archive/grade-lines" \
  -H "content-type: application/json" \
  -d '{"sport":"NHL"}'
```

## 6) Verification SQL

Snapshots ingestion volume:

```sql
SELECT sport, COUNT(*) AS snapshot_count
FROM historical_prop_snapshots
GROUP BY sport
ORDER BY snapshot_count DESC;
```

Verified locked rows (one row per sport+game+player+stat):

```sql
SELECT sport, game_id, player_internal_id, stat_type, verified_line_value, locked_at
FROM historical_verified_lines
ORDER BY datetime(locked_at) DESC
LIMIT 100;
```

Grades:

```sql
SELECT sport, game_id, player_internal_id, stat_type, verified_line_value, actual_stat_value, grade_result, graded_at
FROM historical_line_grades
ORDER BY datetime(graded_at) DESC
LIMIT 100;
```

Guardrail checks:

```sql
-- must be zero
SELECT sport, game_id, player_internal_id, stat_type, COUNT(*) c
FROM historical_verified_lines
GROUP BY sport, game_id, player_internal_id, stat_type
HAVING c > 1;
```

## 7) Automated checks

```bash
npm run qa:historical:archive
```
