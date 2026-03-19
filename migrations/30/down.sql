
DROP INDEX idx_league_members_role;
DROP INDEX idx_league_members_invite_status;

ALTER TABLE league_members DROP COLUMN invited_by_user_id;
ALTER TABLE league_members DROP COLUMN notes;
ALTER TABLE league_members DROP COLUMN last_active_at;
ALTER TABLE league_members DROP COLUMN removed_at;
ALTER TABLE league_members DROP COLUMN joined_at;
ALTER TABLE league_members DROP COLUMN invited_at;
ALTER TABLE league_members DROP COLUMN invite_status;
