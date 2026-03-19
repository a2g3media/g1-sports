ALTER TABLE coachg_featured_items ADD COLUMN lane TEXT NOT NULL DEFAULT 'game_content';
ALTER TABLE coachg_featured_items ADD COLUMN content_type TEXT NOT NULL DEFAULT 'game_preview';
ALTER TABLE coachg_featured_items ADD COLUMN source_ref_type TEXT;
ALTER TABLE coachg_featured_items ADD COLUMN source_ref_id TEXT;
ALTER TABLE coachg_featured_items ADD COLUMN full_text TEXT;
ALTER TABLE coachg_featured_items ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'needs_review';
ALTER TABLE coachg_featured_items ADD COLUMN publish_destinations TEXT NOT NULL DEFAULT '["game_page","homepage_featured","social_optional"]';

CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_lane ON coachg_featured_items(lane);
CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_content_type ON coachg_featured_items(content_type);
CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_approval_status ON coachg_featured_items(approval_status);
