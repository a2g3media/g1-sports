/**
 * Feature Flag Service
 * Manages global feature flags with database persistence
 * Only Super Admins can modify flags
 */

export interface FeatureFlag {
  id: number;
  flag_key: string;
  is_enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Default feature flags - these are seeded if they don't exist
const DEFAULT_FLAGS: { flag_key: string; is_enabled: boolean; description: string }[] = [
  {
    flag_key: "PUBLIC_POOLS",
    is_enabled: false,
    description: "Allow users to browse and join public pools without an invite. When OFF, pools are invite-only.",
  },
  {
    flag_key: "SPORTS_DEMO_MODE",
    is_enabled: false,
    description: "Show demo/placeholder game data when real API data is unavailable. When OFF (default), only real data is shown.",
  },
  {
    flag_key: "MARKETPLACE_ENABLED",
    is_enabled: false,
    description: "Enable public marketplace browsing, featured listings, and discovery.",
  },
  {
    flag_key: "LISTING_FEES_ENABLED",
    is_enabled: false,
    description: "Enable listing-fee enforcement in marketplace publication flows.",
  },
  {
    flag_key: "COMMISSIONER_RATINGS_ENABLED",
    is_enabled: true,
    description: "Enable commissioner profile ratings and review aggregation.",
  },
  {
    flag_key: "GAME_FAVORITES_ENABLED",
    is_enabled: true,
    description: "Enable game-level favorites action on game detail pages.",
  },
  {
    flag_key: "HOME_FAVORITES_RAIL_ENABLED",
    is_enabled: true,
    description: "Enable compact favorites rail on the dashboard home surface.",
  },
  {
    flag_key: "PREMIUM_SCOUT_FLOW_ENABLED",
    is_enabled: true,
    description: "Enable premium quick-switch navigation overlay on player and team profile pages.",
  },
  {
    flag_key: "PAGE_DATA_GAMES_ENABLED",
    is_enabled: false,
    description: "Enable /api/page-data/games as the primary Games page data contract.",
  },
  {
    flag_key: "PAGE_DATA_OBSERVABILITY_ENABLED",
    is_enabled: true,
    description: "Enable rollout telemetry beacons and backend metrics aggregation for page-data migration.",
  },
  {
    flag_key: "PAGE_DATA_SPORT_HUB_ENABLED",
    is_enabled: false,
    description: "Enable /api/page-data/sport-hub as the primary SportHub page contract.",
  },
  {
    flag_key: "PAGE_DATA_GAME_DETAIL_ENABLED",
    is_enabled: false,
    description: "Enable /api/page-data/game-detail as the primary GameDetail page contract.",
  },
  {
    flag_key: "PAGE_DATA_ODDS_ENABLED",
    is_enabled: false,
    description: "Enable /api/page-data/odds as the primary Odds page contract.",
  },
  {
    flag_key: "PAGE_DATA_ODDS_GAME_ENABLED",
    is_enabled: false,
    description: "Enable page-data contract for OddsGamePage route.",
  },
];

export class FeatureFlagService {
  private storageReady = false;

  constructor(private db: D1Database) {}

  private async ensureStorage(): Promise<void> {
    if (this.storageReady) return;
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flag_key TEXT NOT NULL UNIQUE,
        is_enabled BOOLEAN DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    for (const flag of DEFAULT_FLAGS) {
      await this.db.prepare(`
        INSERT OR IGNORE INTO feature_flags (flag_key, is_enabled, description)
        VALUES (?, ?, ?)
      `).bind(flag.flag_key, flag.is_enabled ? 1 : 0, flag.description).run();
    }
    this.storageReady = true;
  }

  /**
   * Initialize default flags in database
   */
  async seedDefaults(): Promise<void> {
    await this.ensureStorage();
    for (const flag of DEFAULT_FLAGS) {
      await this.db.prepare(`
        INSERT OR IGNORE INTO feature_flags (flag_key, is_enabled, description)
        VALUES (?, ?, ?)
      `).bind(flag.flag_key, flag.is_enabled ? 1 : 0, flag.description).run();
    }
  }

  /**
   * Get all feature flags
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    await this.ensureStorage();
    const { results } = await this.db.prepare(`
      SELECT id, flag_key, is_enabled, description, created_at, updated_at
      FROM feature_flags
      ORDER BY flag_key ASC
    `).all();

    return results.map((r) => ({
      id: r.id as number,
      flag_key: r.flag_key as string,
      is_enabled: r.is_enabled === 1,
      description: r.description as string | null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    }));
  }

  /**
   * Get a single flag by key
   */
  async getFlag(flagKey: string): Promise<FeatureFlag | null> {
    await this.ensureStorage();
    const result = await this.db.prepare(`
      SELECT id, flag_key, is_enabled, description, created_at, updated_at
      FROM feature_flags
      WHERE flag_key = ?
    `).bind(flagKey).first();

    if (!result) return null;

    return {
      id: result.id as number,
      flag_key: result.flag_key as string,
      is_enabled: result.is_enabled === 1,
      description: result.description as string | null,
      created_at: result.created_at as string,
      updated_at: result.updated_at as string,
    };
  }

  /**
   * Check if a flag is enabled
   */
  async isEnabled(flagKey: string): Promise<boolean> {
    const flag = await this.getFlag(flagKey);
    return flag?.is_enabled ?? false;
  }

  /**
   * Set a flag's enabled state
   */
  async setFlag(flagKey: string, isEnabled: boolean): Promise<void> {
    await this.ensureStorage();
    await this.db.prepare(`
      UPDATE feature_flags
      SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE flag_key = ?
    `).bind(isEnabled ? 1 : 0, flagKey).run();
  }

  /**
   * Create or update a flag
   */
  async upsertFlag(flagKey: string, isEnabled: boolean, description?: string): Promise<FeatureFlag> {
    await this.ensureStorage();
    await this.db.prepare(`
      INSERT INTO feature_flags (flag_key, is_enabled, description)
      VALUES (?, ?, ?)
      ON CONFLICT(flag_key) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        description = COALESCE(excluded.description, feature_flags.description),
        updated_at = CURRENT_TIMESTAMP
    `).bind(flagKey, isEnabled ? 1 : 0, description || null).run();

    const flag = await this.getFlag(flagKey);
    return flag!;
  }

  /**
   * Delete a flag
   */
  async deleteFlag(flagKey: string): Promise<void> {
    await this.ensureStorage();
    await this.db.prepare(`
      DELETE FROM feature_flags WHERE flag_key = ?
    `).bind(flagKey).run();
  }
}

/**
 * Quick check if public pools are enabled
 */
export async function isPublicPoolsEnabled(db: D1Database): Promise<boolean> {
  const service = new FeatureFlagService(db);
  return service.isEnabled("PUBLIC_POOLS");
}

/**
 * Quick check if sports demo mode is enabled
 * When OFF (default): Only real API data is shown
 * When ON: Demo data is shown as fallback when real data unavailable
 */
export async function isSportsDemoModeEnabled(db: D1Database): Promise<boolean> {
  const service = new FeatureFlagService(db);
  return service.isEnabled("SPORTS_DEMO_MODE");
}
