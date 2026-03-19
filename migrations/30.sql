
ALTER TABLE league_members ADD COLUMN invite_status TEXT DEFAULT 'joined';
ALTER TABLE league_members ADD COLUMN invited_at DATETIME;
ALTER TABLE league_members ADD COLUMN joined_at DATETIME;
ALTER TABLE league_members ADD COLUMN removed_at DATETIME;
ALTER TABLE league_members ADD COLUMN last_active_at DATETIME;
ALTER TABLE league_members ADD COLUMN notes TEXT;
ALTER TABLE league_members ADD COLUMN invited_by_user_id INTEGER;

CREATE INDEX idx_league_members_invite_status ON league_members(league_id, invite_status);
CREATE INDEX idx_league_members_role ON league_members(league_id, role);
