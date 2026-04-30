-- One-time watchboard dedupe + merge.
-- Merges duplicate board names per user (case-insensitive, trimmed),
-- re-homes child rows to canonical boards, de-duplicates child entities,
-- and removes duplicate board shells.

-- 1) Normalize obvious name whitespace.
UPDATE watchboards
SET name = TRIM(name),
    updated_at = CURRENT_TIMESTAMP
WHERE name IS NOT NULL
  AND TRIM(name) <> ''
  AND name <> TRIM(name);

-- 2) Build duplicate -> canonical board mapping.
DROP TABLE IF EXISTS _watchboard_dedupe_map;
CREATE TEMP TABLE _watchboard_dedupe_map AS
WITH ranked AS (
  SELECT
    id,
    user_id,
    LOWER(TRIM(name)) AS name_key,
    is_active,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, LOWER(TRIM(name))
      ORDER BY is_active DESC, datetime(updated_at) DESC, id DESC
    ) AS rn
  FROM watchboards
  WHERE TRIM(COALESCE(name, '')) <> ''
),
canon AS (
  SELECT user_id, name_key, id AS canonical_id
  FROM ranked
  WHERE rn = 1
),
dupes AS (
  SELECT user_id, name_key, id AS duplicate_id
  FROM ranked
  WHERE rn > 1
)
SELECT
  dupes.duplicate_id,
  canon.canonical_id
FROM dupes
JOIN canon
  ON canon.user_id = dupes.user_id
 AND canon.name_key = dupes.name_key
WHERE dupes.duplicate_id <> canon.canonical_id;

-- 3) Preserve pinned game on canonical board when missing.
UPDATE watchboards
SET pinned_game_id = COALESCE(
      NULLIF(TRIM(pinned_game_id), ''),
      (
        SELECT NULLIF(TRIM(wd.pinned_game_id), '')
        FROM watchboards wd
        JOIN _watchboard_dedupe_map m ON m.duplicate_id = wd.id
        WHERE m.canonical_id = watchboards.id
          AND NULLIF(TRIM(wd.pinned_game_id), '') IS NOT NULL
        ORDER BY datetime(wd.updated_at) DESC, wd.id DESC
        LIMIT 1
      )
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT DISTINCT canonical_id FROM _watchboard_dedupe_map);

-- 4) Move all child rows from duplicate boards to canonical boards.
UPDATE watchboard_games
SET watchboard_id = (
      SELECT canonical_id
      FROM _watchboard_dedupe_map m
      WHERE m.duplicate_id = watchboard_games.watchboard_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE watchboard_id IN (SELECT duplicate_id FROM _watchboard_dedupe_map);

UPDATE watchboard_props
SET watchboard_id = (
      SELECT canonical_id
      FROM _watchboard_dedupe_map m
      WHERE m.duplicate_id = watchboard_props.watchboard_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE watchboard_id IN (SELECT duplicate_id FROM _watchboard_dedupe_map);

UPDATE watchboard_players
SET watchboard_id = (
      SELECT canonical_id
      FROM _watchboard_dedupe_map m
      WHERE m.duplicate_id = watchboard_players.watchboard_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE watchboard_id IN (SELECT duplicate_id FROM _watchboard_dedupe_map);

-- 5) De-duplicate child entities now that rows are merged.
-- Games: unique by (watchboard_id, game_id), keep newest.
DELETE FROM watchboard_games
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY watchboard_id, game_id
        ORDER BY datetime(updated_at) DESC, id DESC
      ) AS rn
    FROM watchboard_games
  ) ranked
  WHERE rn > 1
);

-- Props: unique by (watchboard_id, game_id, player_name, prop_type, selection), keep newest.
DELETE FROM watchboard_props
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY watchboard_id, game_id, LOWER(TRIM(player_name)), LOWER(TRIM(prop_type)), LOWER(TRIM(COALESCE(selection, '')))
        ORDER BY datetime(updated_at) DESC, id DESC
      ) AS rn
    FROM watchboard_props
  ) ranked
  WHERE rn > 1
);

-- Players: unique by (watchboard_id, player_name, sport), prefer active/newest.
DELETE FROM watchboard_players
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY watchboard_id, LOWER(TRIM(player_name)), LOWER(TRIM(sport))
        ORDER BY is_active DESC, datetime(updated_at) DESC, id DESC
      ) AS rn
    FROM watchboard_players
  ) ranked
  WHERE rn > 1
);

-- 6) Reindex order columns for stable UI ordering.
DROP TABLE IF EXISTS _watchboard_games_reindex;
CREATE TEMP TABLE _watchboard_games_reindex AS
SELECT
  id,
  ROW_NUMBER() OVER (PARTITION BY watchboard_id ORDER BY order_index ASC, datetime(updated_at) DESC, id DESC) - 1 AS next_order
FROM watchboard_games;

UPDATE watchboard_games
SET order_index = (
      SELECT next_order
      FROM _watchboard_games_reindex r
      WHERE r.id = watchboard_games.id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM _watchboard_games_reindex);

DROP TABLE IF EXISTS _watchboard_props_reindex;
CREATE TEMP TABLE _watchboard_props_reindex AS
SELECT
  id,
  ROW_NUMBER() OVER (PARTITION BY watchboard_id ORDER BY order_index ASC, datetime(updated_at) DESC, id DESC) - 1 AS next_order
FROM watchboard_props;

UPDATE watchboard_props
SET order_index = (
      SELECT next_order
      FROM _watchboard_props_reindex r
      WHERE r.id = watchboard_props.id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM _watchboard_props_reindex);

DROP TABLE IF EXISTS _watchboard_players_reindex;
CREATE TEMP TABLE _watchboard_players_reindex AS
SELECT
  id,
  ROW_NUMBER() OVER (
    PARTITION BY watchboard_id
    ORDER BY is_active DESC, order_index ASC, datetime(updated_at) DESC, id DESC
  ) - 1 AS next_order
FROM watchboard_players;

UPDATE watchboard_players
SET order_index = (
      SELECT next_order
      FROM _watchboard_players_reindex r
      WHERE r.id = watchboard_players.id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM _watchboard_players_reindex);

-- 7) Remove duplicate boards.
DELETE FROM watchboards
WHERE id IN (SELECT duplicate_id FROM _watchboard_dedupe_map);

-- 8) Ensure exactly one active board per user.
DROP TABLE IF EXISTS _watchboard_active_choice;
CREATE TEMP TABLE _watchboard_active_choice AS
WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY is_active DESC, datetime(updated_at) DESC, id DESC
    ) AS rn
  FROM watchboards
)
SELECT user_id, id AS chosen_id
FROM ranked
WHERE rn = 1;

UPDATE watchboards
SET is_active = CASE
      WHEN id = (
        SELECT chosen_id
        FROM _watchboard_active_choice c
        WHERE c.user_id = watchboards.user_id
      ) THEN 1
      ELSE 0
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE user_id IN (SELECT user_id FROM _watchboard_active_choice);

-- 9) Cleanup temp tables.
DROP TABLE IF EXISTS _watchboard_dedupe_map;
DROP TABLE IF EXISTS _watchboard_games_reindex;
DROP TABLE IF EXISTS _watchboard_props_reindex;
DROP TABLE IF EXISTS _watchboard_players_reindex;
DROP TABLE IF EXISTS _watchboard_active_choice;
