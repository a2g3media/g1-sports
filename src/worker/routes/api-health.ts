/**
 * API Health Check Routes
 * Admin-only diagnostics for SportsRadar/provider + OpenAI connectivity.
 */

import { Hono } from 'hono';
import { authMiddleware } from '@getmocha/users-service/backend';
import OpenAI from 'openai';

type Bindings = {
  DB: any;
  OPENAI_API_KEY?: string;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_ODDS_KEY?: string;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
  SPORTSRADAR_PROPS_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

interface SportsRadarResult {
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  apiKeyPresent: boolean;
  oddsKeyPresent: boolean;
  propsKeyPresent: boolean;
  liveOddsProbe: {
    ok: boolean;
    httpStatus: number | null;
    error: string | null;
  };
  dbTotals: {
    games: number;
    odds: number;
    props: number;
    lastGameSync: string | null;
    lastOddsUpdate: string | null;
  };
}

interface OpenAIResult {
  status: 'PASS' | 'FAIL';
  apiKeyPresent: boolean;
  responseTimeMs: number;
  model?: string;
  error?: string;
  httpStatus?: number;
}

interface FixItem {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  issue: string;
  fix: string;
}

async function isAdmin(c: any): Promise<boolean> {
  const user = c.get('user');
  if (!user) return false;
  try {
    const dbUser = await c.env.DB.prepare('SELECT roles FROM users WHERE id = ?').bind(user.id).first();
    if (!dbUser?.roles) return false;
    const roles = JSON.parse(dbUser.roles);
    return roles.includes('admin') || roles.includes('developer');
  } catch {
    return false;
  }
}

function isDemoMode(c: any): boolean {
  return c.req.header('X-Demo-Mode') === 'true';
}

async function demoOrAuthMiddleware(c: any, next: () => Promise<void>) {
  if (isDemoMode(c)) {
    await next();
    return;
  }
  await authMiddleware(c, next);
}

function buildFixChecklist(sportsRadar: SportsRadarResult, openAI: OpenAIResult): FixItem[] {
  const fixes: FixItem[] = [];
  if (!sportsRadar.apiKeyPresent) {
    fixes.push({
      severity: 'critical',
      category: 'SportsRadar',
      issue: 'SPORTSRADAR_API_KEY is missing',
      fix: 'Set SPORTSRADAR_API_KEY in environment secrets and redeploy.',
    });
  }
  if (!sportsRadar.oddsKeyPresent) {
    fixes.push({
      severity: 'warning',
      category: 'SportsRadar Odds',
      issue: 'No SportsRadar key available for odds endpoints',
      fix: 'Set SPORTSRADAR_API_KEY (or SPORTSRADAR_ODDS_KEY override) with odds entitlement.',
    });
  }
  if (sportsRadar.apiKeyPresent && !sportsRadar.liveOddsProbe.ok) {
    fixes.push({
      severity: 'warning',
      category: 'SportsRadar Odds',
      issue: `Production live odds probe failed${sportsRadar.liveOddsProbe.httpStatus ? ` (${sportsRadar.liveOddsProbe.httpStatus})` : ''}`,
      fix: 'Verify account entitlement for oddscomparison-liveodds/production/v2 and endpoint path with SportsRadar support.',
    });
  }
  if (!openAI.apiKeyPresent) {
    fixes.push({
      severity: 'critical',
      category: 'OpenAI',
      issue: 'OPENAI_API_KEY is missing',
      fix: 'Set OPENAI_API_KEY in environment secrets and redeploy.',
    });
  } else if (openAI.status === 'FAIL') {
    fixes.push({
      severity: 'warning',
      category: 'OpenAI',
      issue: openAI.error || 'OpenAI test failed',
      fix: 'Verify key validity, billing, and provider availability.',
    });
  }
  if (sportsRadar.dbTotals.games === 0) {
    fixes.push({
      severity: 'warning',
      category: 'Provider Hydration',
      issue: 'No games in local database',
      fix: 'Run /api/sports-data/refresh/master or /api/sports-data/refresh/manual.',
    });
  }
  return fixes;
}

async function testSportsRadar(c: any): Promise<SportsRadarResult> {
  const apiKeyPresent = Boolean(c.env.SPORTSRADAR_API_KEY);
  // SportsRadar commonly uses one master key with product entitlements.
  const oddsKeyPresent = Boolean(c.env.SPORTSRADAR_ODDS_KEY || c.env.SPORTSRADAR_API_KEY);
  const propsKeyPresent = Boolean(
    c.env.SPORTSRADAR_PROPS_KEY || c.env.SPORTSRADAR_PLAYER_PROPS_KEY || c.env.SPORTSRADAR_API_KEY
  );
  const oddsProbeUrl = c.env.SPORTSRADAR_API_KEY
    ? `https://api.sportradar.com/oddscomparison-liveodds/production/v2/en/sports.xml?api_key=${c.env.SPORTSRADAR_API_KEY}`
    : null;
  let liveOddsProbe: SportsRadarResult['liveOddsProbe'] = {
    ok: false,
    httpStatus: null,
    error: null,
  };

  if (oddsProbeUrl) {
    try {
      const probeRes = await fetch(oddsProbeUrl, { headers: { Accept: 'application/xml' } });
      liveOddsProbe = {
        ok: probeRes.ok,
        httpStatus: probeRes.status,
        error: probeRes.ok ? null : `HTTP ${probeRes.status}`,
      };
    } catch (err: any) {
      liveOddsProbe = {
        ok: false,
        httpStatus: null,
        error: err?.message || String(err),
      };
    }
  }

  const dbTotals = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sdio_games) AS games,
      (SELECT COUNT(*) FROM sdio_odds_current) AS odds,
      (SELECT COUNT(*) FROM sdio_props_current) AS props,
      (SELECT MAX(last_sync) FROM sdio_games) AS lastGameSync,
      (SELECT MAX(last_updated) FROM sdio_odds_current) AS lastOddsUpdate
  `).first<{
    games: number;
    odds: number;
    props: number;
    lastGameSync: string | null;
    lastOddsUpdate: string | null;
  }>();

  let status: SportsRadarResult['status'] = 'FAIL';
  if (apiKeyPresent && (dbTotals?.games || 0) > 0) status = 'PASS';
  else if (apiKeyPresent || oddsKeyPresent || propsKeyPresent) status = 'PARTIAL';

  return {
    status,
    apiKeyPresent,
    oddsKeyPresent,
    propsKeyPresent,
    liveOddsProbe,
    dbTotals: {
      games: dbTotals?.games || 0,
      odds: dbTotals?.odds || 0,
      props: dbTotals?.props || 0,
      lastGameSync: dbTotals?.lastGameSync || null,
      lastOddsUpdate: dbTotals?.lastOddsUpdate || null,
    },
  };
}

async function testOpenAI(c: any): Promise<OpenAIResult> {
  if (!c.env.OPENAI_API_KEY) {
    return { status: 'FAIL', apiKeyPresent: false, responseTimeMs: 0, error: 'OPENAI_API_KEY is missing' };
  }
  const started = Date.now();
  try {
    const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });
    const model = 'gpt-4o-mini';
    await client.responses.create({
      model,
      input: 'healthcheck',
      max_output_tokens: 16,
    });
    return {
      status: 'PASS',
      apiKeyPresent: true,
      responseTimeMs: Date.now() - started,
      model,
    };
  } catch (error: any) {
    return {
      status: 'FAIL',
      apiKeyPresent: true,
      responseTimeMs: Date.now() - started,
      model: 'gpt-4o-mini',
      error: error?.message || String(error),
      httpStatus: Number(error?.status || 0) || undefined,
    };
  }
}

app.get('/all', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  const sportsRadar = await testSportsRadar(c);
  const openAI = await testOpenAI(c);
  return c.json({
    timestamp: new Date().toISOString(),
    sportsRadar,
    openAI,
    fixChecklist: buildFixChecklist(sportsRadar, openAI),
  });
});

app.get('/sportsradar', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return c.json(await testSportsRadar(c));
});

app.get('/openai', demoOrAuthMiddleware, async (c) => {
  if (!isDemoMode(c) && !(await isAdmin(c))) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return c.json(await testOpenAI(c));
});

export default app;
