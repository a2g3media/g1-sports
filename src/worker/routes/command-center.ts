import { Hono } from "hono";

type AppBindings = { Bindings: Env };

const commandCenter = new Hono<AppBindings>();

// Default preferences
const DEFAULT_PREFERENCES = {
  is_enabled: true,
  categories: {
    line_movement: true,
    injury: true,
    game_state: true,
    props: true,
    schedule: true,
    betting_edge: false,
  },
  threshold_line_movement: 0.5,
  threshold_score_run: 10,
};

// Helper to get user ID from cookie or header
async function getUserId(c: any): Promise<string | null> {
  const userId = c.req.header("x-user-id");
  if (userId) return userId;
  
  // Try to get from auth
  const authCookie = c.req.header("cookie");
  if (!authCookie) return null;
  
  return null;
}

// GET /api/command-center/alert-preferences
commandCenter.get("/alert-preferences", async (c) => {
  try {
    const userId = await getUserId(c);
    
    if (!userId) {
      // Return defaults for unauthenticated users
      return c.json(DEFAULT_PREFERENCES);
    }

    const db = c.env.DB;
    
    // Check if user has saved preferences in user_settings
    const result = await db.prepare(`
      SELECT setting_value FROM user_settings
      WHERE user_id = ? AND setting_key = 'command_center_alerts'
      LIMIT 1
    `).bind(userId).first<{ setting_value: string }>();

    if (result?.setting_value) {
      try {
        const prefs = JSON.parse(result.setting_value);
        return c.json({ ...DEFAULT_PREFERENCES, ...prefs });
      } catch {
        return c.json(DEFAULT_PREFERENCES);
      }
    }

    return c.json(DEFAULT_PREFERENCES);
  } catch (error) {
    console.error("Error fetching command center preferences:", error);
    return c.json(DEFAULT_PREFERENCES);
  }
});

// PATCH /api/command-center/alert-preferences
commandCenter.patch("/alert-preferences", async (c) => {
  try {
    const userId = await getUserId(c);
    
    if (!userId) {
      // For unauthenticated users, just return what they sent (client stores locally)
      const body = await c.req.json();
      return c.json(body);
    }

    const body = await c.req.json();
    const db = c.env.DB;
    const now = new Date().toISOString();

    // Upsert preferences into user_settings table
    await db.prepare(`
      INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
      VALUES (?, 'command_center_alerts', ?, 'PROD', ?, ?)
      ON CONFLICT(user_id, setting_key, data_scope) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      JSON.stringify(body),
      now,
      now
    ).run();

    return c.json(body);
  } catch (error) {
    console.error("Error saving command center preferences:", error);
    return c.json({ error: "Failed to save preferences" }, 500);
  }
});

export { commandCenter };
