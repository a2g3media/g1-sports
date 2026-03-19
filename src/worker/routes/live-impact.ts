/**
 * Live Impact API Routes
 * 
 * Endpoints for the Universal Live Sweat Engine
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { authMiddleware } from '@getmocha/users-service/backend';

// Local MochaUser type
type MochaUser = {
  id: string;
  email: string;
  display_name?: string;
  google_sub?: string;
  google_user_data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};
import { getRelevantLiveEvents, syncPoolEntryActionsFromPicks } from '../services/impactEngineService';

// Local Env type for this router
type Env = {
  DB: D1Database;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};

type Variables = {
  user: MochaUser;
};

const DEMO_USER_ID = 'demo_user_1';

// Demo-aware middleware
const liveImpactDemoOrAuthMiddleware = async (
  c: { req: { header: (name: string) => string | undefined }; set: (key: string, value: unknown) => void },
  next: () => Promise<void>,
  authMw: typeof authMiddleware
) => {
  const isDemoMode = c.req.header('X-Demo-Mode') === 'true';
  if (isDemoMode) {
    c.set('user', {
      id: DEMO_USER_ID,
      email: 'demo@example.com',
      display_name: 'Demo User',
      google_sub: '',
      google_user_data: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as MochaUser);
    c.set('isDemoMode', true);
    await next();
    return;
  }
  c.set('isDemoMode', false);
  await authMw(c as Parameters<typeof authMiddleware>[0], next);
};

export const liveImpactRouter = new Hono<{ Bindings: Env; Variables: Variables & { isDemoMode: boolean } }>();

/**
 * GET /api/live-impact/:poolId/:periodId
 * 
 * Get relevant live events for a pool with player impacts
 */
liveImpactRouter.get('/:poolId/:periodId', async (c, next) => {
  await liveImpactDemoOrAuthMiddleware(c, next, authMiddleware);
}, async (c) => {
  const poolId = parseInt(c.req.param('poolId'), 10);
  const periodId = c.req.param('periodId');
  const isDemoMode = c.get('isDemoMode');

  if (isNaN(poolId)) {
    return c.json({ error: 'Invalid pool ID' }, 400);
  }

  if (!periodId) {
    return c.json({ error: 'Period ID required' }, 400);
  }

  try {
    const result = await getRelevantLiveEvents(
      c.env.DB,
      poolId,
      periodId,
      isDemoMode
    );

    return c.json(result);
  } catch (error) {
    console.error('Live impact fetch error:', error);
    return c.json({ error: 'Failed to fetch live impacts' }, 500);
  }
});

/**
 * POST /api/live-impact/:poolId/:periodId/sync
 * 
 * Sync picks from the legacy picks table to pool_entry_actions
 */
liveImpactRouter.post('/:poolId/:periodId/sync', async (c, next) => {
  await liveImpactDemoOrAuthMiddleware(c, next, authMiddleware);
}, async (c) => {
  const poolId = parseInt(c.req.param('poolId'), 10);
  const periodId = c.req.param('periodId');
  const isDemoMode = c.get('isDemoMode');

  if (isDemoMode) {
    return c.json({ synced: 0, message: 'Demo mode - no sync needed' });
  }

  if (isNaN(poolId)) {
    return c.json({ error: 'Invalid pool ID' }, 400);
  }

  try {
    const synced = await syncPoolEntryActionsFromPicks(
      c.env.DB,
      poolId,
      periodId
    );

    return c.json({ synced, message: `Synced ${synced} actions` });
  } catch (error) {
    console.error('Sync error:', error);
    return c.json({ error: 'Failed to sync actions' }, 500);
  }
});

/**
 * GET /api/live-impact/:poolId/periods
 * 
 * Get available periods for a pool
 */
liveImpactRouter.get('/:poolId/periods', async (c, next) => {
  await liveImpactDemoOrAuthMiddleware(c, next, authMiddleware);
}, async (c) => {
  const poolId = parseInt(c.req.param('poolId'), 10);
  const isDemoMode = c.get('isDemoMode');

  if (isNaN(poolId)) {
    return c.json({ error: 'Invalid pool ID' }, 400);
  }

  if (isDemoMode) {
    // Return demo periods
    return c.json({
      periods: [
        { periodId: 'week_1', label: 'Week 1', status: 'FINAL' },
        { periodId: 'week_2', label: 'Week 2', status: 'FINAL' },
        { periodId: 'week_3', label: 'Week 3', status: 'LIVE' },
        { periodId: 'week_4', label: 'Week 4', status: 'UPCOMING' },
      ],
      currentPeriod: 'week_3',
    });
  }

  try {
    // Get unique periods from pool_entry_actions or picks
    const periods = await c.env.DB.prepare(`
      SELECT DISTINCT period_id 
      FROM pool_entry_actions 
      WHERE pool_id = ?
      UNION
      SELECT DISTINCT period_id 
      FROM picks 
      WHERE league_id = ?
      ORDER BY period_id
    `).bind(poolId, poolId).all<{ period_id: string }>();

    const periodList = (periods.results || []).map(p => ({
      periodId: p.period_id,
      label: formatPeriodLabel(p.period_id),
      status: 'UNKNOWN' as const,
    }));

    return c.json({
      periods: periodList,
      currentPeriod: periodList[periodList.length - 1]?.periodId || null,
    });
  } catch (error) {
    console.error('Periods fetch error:', error);
    return c.json({ error: 'Failed to fetch periods' }, 500);
  }
});

// Helper to format period labels
function formatPeriodLabel(periodId: string): string {
  // Handle common formats: week_1, Week1, W1, etc.
  const weekMatch = periodId.match(/week[_\s]?(\d+)/i);
  if (weekMatch) {
    return `Week ${weekMatch[1]}`;
  }

  // Handle round formats
  const roundMatch = periodId.match(/round[_\s]?(\d+)/i);
  if (roundMatch) {
    return `Round ${roundMatch[1]}`;
  }

  // Default: capitalize and replace underscores
  return periodId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default liveImpactRouter;
