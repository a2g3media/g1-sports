/**
 * Universal Impact Engine Service
 * 
 * Fetches relevant live events for a pool and evaluates player impacts
 * using the pool-type-specific evaluator plugin system.
 */

import type { D1Database } from '@cloudflare/workers-types';
import {
  getEvaluator,
  getPoolTypeFromFormat,
  type LiveEventData,
  type PoolEntryAction,
  type PoolContext,
  type LiveEventCard,
  type SelectionGroup,
  type EvaluatedPlayer,
} from './poolEvaluators';

// Demo game data for testing
const DEMO_LIVE_EVENTS: LiveEventData[] = [
  {
    eventId: 'demo_nfl_1',
    eventType: 'GAME',
    sportKey: 'NFL',
    status: 'LIVE',
    homeTeam: 'Chiefs',
    awayTeam: 'Bills',
    homeScore: 24,
    awayScore: 21,
    period: '4th',
    clock: '5:42',
  },
  {
    eventId: 'demo_nfl_2',
    eventType: 'GAME',
    sportKey: 'NFL',
    status: 'LIVE',
    homeTeam: 'Eagles',
    awayTeam: 'Cowboys',
    homeScore: 17,
    awayScore: 17,
    period: '3rd',
    clock: '8:15',
  },
  {
    eventId: 'demo_nfl_3',
    eventType: 'GAME',
    sportKey: 'NFL',
    status: 'FINAL',
    homeTeam: 'Ravens',
    awayTeam: 'Bengals',
    homeScore: 31,
    awayScore: 24,
  },
  {
    eventId: 'demo_nfl_4',
    eventType: 'GAME',
    sportKey: 'NFL',
    status: 'SCHEDULED',
    homeTeam: '49ers',
    awayTeam: 'Seahawks',
    homeScore: 0,
    awayScore: 0,
    startTime: new Date(Date.now() + 3600000).toISOString(),
  },
];

// Demo pool members with their picks
const DEMO_POOL_ACTIONS: PoolEntryAction[] = [
  { userId: 'demo_1', displayName: 'Mike S.', eventId: 'demo_nfl_1', actionType: 'PICK', selectionId: 'Chiefs', selectionLabel: 'Kansas City Chiefs', isLocked: true },
  { userId: 'demo_2', displayName: 'Sarah J.', eventId: 'demo_nfl_1', actionType: 'PICK', selectionId: 'Bills', selectionLabel: 'Buffalo Bills', isLocked: true },
  { userId: 'demo_3', displayName: 'Tom B.', eventId: 'demo_nfl_1', actionType: 'PICK', selectionId: 'Chiefs', selectionLabel: 'Kansas City Chiefs', isLocked: true },
  { userId: 'demo_4', displayName: 'Lisa K.', eventId: 'demo_nfl_2', actionType: 'PICK', selectionId: 'Eagles', selectionLabel: 'Philadelphia Eagles', isLocked: true },
  { userId: 'demo_5', displayName: 'Chris D.', eventId: 'demo_nfl_2', actionType: 'PICK', selectionId: 'Cowboys', selectionLabel: 'Dallas Cowboys', isLocked: true },
  { userId: 'demo_6', displayName: 'Amy R.', eventId: 'demo_nfl_2', actionType: 'PICK', selectionId: 'Eagles', selectionLabel: 'Philadelphia Eagles', isLocked: true },
  { userId: 'demo_7', displayName: 'Dave M.', eventId: 'demo_nfl_3', actionType: 'PICK', selectionId: 'Ravens', selectionLabel: 'Baltimore Ravens', isLocked: true },
  { userId: 'demo_8', displayName: 'Jen P.', eventId: 'demo_nfl_3', actionType: 'PICK', selectionId: 'Bengals', selectionLabel: 'Cincinnati Bengals', isLocked: true },
  { userId: 'demo_9', displayName: 'Rob W.', eventId: 'demo_nfl_4', actionType: 'PICK', selectionId: '49ers', selectionLabel: 'San Francisco 49ers', isLocked: true },
];

/**
 * Fetch pool context from database
 */
async function getPoolContext(
  db: D1Database,
  poolId: number,
  periodId: string
): Promise<PoolContext | null> {
  const pool = await db.prepare(`
    SELECT id, sport_key, format_key, rules_json
    FROM leagues
    WHERE id = ?
  `).bind(poolId).first<{
    id: number;
    sport_key: string;
    format_key: string;
    rules_json: string | null;
  }>();

  if (!pool) return null;

  const poolType = getPoolTypeFromFormat(pool.format_key);

  return {
    poolId: pool.id,
    poolType,
    formatKey: pool.format_key,
    sportKey: pool.sport_key,
    periodId,
    rulesJson: pool.rules_json ? JSON.parse(pool.rules_json) : undefined,
  };
}

/**
 * Fetch entry actions for a pool/period from database
 */
async function getPoolEntryActions(
  db: D1Database,
  poolId: number,
  periodId: string
): Promise<PoolEntryAction[]> {
  // First try the new pool_entry_actions table
  const actions = await db.prepare(`
    SELECT 
      pea.user_id,
      pea.entry_id,
      pea.event_id,
      pea.action_type,
      pea.selection_id,
      pea.selection_label,
      pea.confidence_rank,
      pea.is_locked,
      pea.result,
      pea.metadata_json,
      u.display_name,
      u.avatar_url,
      pe.entry_name,
      pe.entry_number
    FROM pool_entry_actions pea
    LEFT JOIN users u ON u.id = pea.user_id
    LEFT JOIN pool_entries pe ON pe.id = pea.entry_id
    WHERE pea.pool_id = ? AND pea.period_id = ?
  `).bind(poolId, periodId).all<{
    user_id: string;
    entry_id: number | null;
    event_id: string;
    action_type: string;
    selection_id: string;
    selection_label: string | null;
    confidence_rank: number | null;
    is_locked: number;
    result: string | null;
    metadata_json: string | null;
    display_name: string | null;
    avatar_url: string | null;
    entry_name: string | null;
    entry_number: number | null;
  }>();

  if (actions.results && actions.results.length > 0) {
    return actions.results.map(a => ({
      userId: a.user_id,
      displayName:
        `${a.display_name || `User ${a.user_id.slice(-4)}`}${a.entry_id ? ` (${a.entry_name || `Entry ${a.entry_number || a.entry_id}`})` : ""}`,
      avatarUrl: a.avatar_url || undefined,
      eventId: a.event_id,
      actionType: a.action_type,
      selectionId: a.selection_id,
      selectionLabel: a.selection_label || a.selection_id,
      confidenceRank: a.confidence_rank ?? undefined,
      isLocked: a.is_locked === 1,
      result: a.result || undefined,
      metadata: a.metadata_json ? JSON.parse(a.metadata_json) : undefined,
    }));
  }

  // Fallback: try the legacy picks table
  const picks = await db.prepare(`
    SELECT 
      p.user_id,
      p.entry_id,
      p.event_id,
      p.pick_value,
      p.confidence_rank,
      p.is_locked,
      u.display_name,
      u.avatar_url,
      pe.entry_name,
      pe.entry_number
    FROM picks p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN pool_entries pe ON pe.id = p.entry_id
    WHERE p.league_id = ? AND p.period_id = ?
  `).bind(poolId, periodId).all<{
    user_id: number;
    entry_id: number | null;
    event_id: number;
    pick_value: string;
    confidence_rank: number | null;
    is_locked: number;
    display_name: string | null;
    avatar_url: string | null;
    entry_name: string | null;
    entry_number: number | null;
  }>();

  return (picks.results || []).map(p => ({
    userId: String(p.user_id),
    displayName:
      `${p.display_name || `User ${String(p.user_id).slice(-4)}`}${p.entry_id ? ` (${p.entry_name || `Entry ${p.entry_number || p.entry_id}`})` : ""}`,
    avatarUrl: p.avatar_url || undefined,
    eventId: String(p.event_id),
    actionType: 'PICK',
    selectionId: p.pick_value,
    selectionLabel: p.pick_value,
    confidenceRank: p.confidence_rank ?? undefined,
    isLocked: p.is_locked === 1,
  }));
}

/**
 * Fetch live event data from database
 */
async function getLiveEventData(
  db: D1Database,
  eventIds: string[]
): Promise<Map<string, LiveEventData>> {
  const eventMap = new Map<string, LiveEventData>();
  
  if (eventIds.length === 0) return eventMap;

  // Try sdio_games table first
  const placeholders = eventIds.map(() => '?').join(',');
  const games = await db.prepare(`
    SELECT 
      provider_game_id,
      sport,
      home_team,
      away_team,
      status,
      score_home,
      score_away,
      period,
      clock,
      start_time
    FROM sdio_games
    WHERE provider_game_id IN (${placeholders})
  `).bind(...eventIds).all<{
    provider_game_id: string;
    sport: string;
    home_team: string;
    away_team: string;
    status: string;
    score_home: number | null;
    score_away: number | null;
    period: string | null;
    clock: string | null;
    start_time: string;
  }>();

  for (const g of games.results || []) {
    eventMap.set(g.provider_game_id, {
      eventId: g.provider_game_id,
      eventType: 'GAME',
      sportKey: g.sport,
      status: mapGameStatus(g.status),
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      homeScore: g.score_home ?? 0,
      awayScore: g.score_away ?? 0,
      period: g.period ?? undefined,
      clock: g.clock ?? undefined,
      startTime: g.start_time,
    });
  }

  // Also try events table for legacy data
  const events = await db.prepare(`
    SELECT 
      id,
      external_id,
      sport_key,
      home_team,
      away_team,
      status,
      home_score,
      away_score,
      start_at
    FROM events
    WHERE id IN (${placeholders}) OR external_id IN (${placeholders})
  `).bind(...eventIds, ...eventIds).all<{
    id: number;
    external_id: string | null;
    sport_key: string;
    home_team: string;
    away_team: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    start_at: string;
  }>();

  for (const e of events.results || []) {
    const key = e.external_id || String(e.id);
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        eventId: key,
        eventType: 'GAME',
        sportKey: e.sport_key,
        status: mapGameStatus(e.status),
        homeTeam: e.home_team,
        awayTeam: e.away_team,
        homeScore: e.home_score ?? 0,
        awayScore: e.away_score ?? 0,
        startTime: e.start_at,
      });
    }
  }

  return eventMap;
}

/**
 * Map database status to LiveEventData status
 */
function mapGameStatus(
  status: string
): LiveEventData['status'] {
  const s = status?.toUpperCase() || 'SCHEDULED';
  
  if (s === 'LIVE' || s === 'IN_PROGRESS' || s === 'INPROGRESS') return 'LIVE';
  if (s === 'HALFTIME' || s === 'HALF') return 'HALFTIME';
  if (s === 'FINAL' || s === 'FINISHED' || s === 'COMPLETED') return 'FINAL';
  if (s === 'POSTPONED' || s === 'DELAYED') return 'POSTPONED';
  if (s === 'CANCELED' || s === 'CANCELLED') return 'CANCELED';
  
  return 'SCHEDULED';
}

/**
 * Build live event cards with grouped impacts
 */
function buildEventCards(
  events: LiveEventData[],
  actions: PoolEntryAction[],
  context: PoolContext
): LiveEventCard[] {
  const evaluator = getEvaluator(context.poolType);
  if (!evaluator) {
    console.warn(`No evaluator found for pool type: ${context.poolType}`);
    return [];
  }

  // Group actions by event
  const actionsByEvent = new Map<string, PoolEntryAction[]>();
  for (const action of actions) {
    const existing = actionsByEvent.get(action.eventId) || [];
    existing.push(action);
    actionsByEvent.set(action.eventId, existing);
  }

  const cards: LiveEventCard[] = [];

  for (const event of events) {
    const eventActions = actionsByEvent.get(event.eventId);
    if (!eventActions || eventActions.length === 0) continue;

    // Evaluate each player and group by selection
    const selectionGroups = new Map<string, SelectionGroup>();
    
    for (const action of eventActions) {
      const status = evaluator.evaluatePlayerStatus(action, event, context);
      const side = evaluator.getSelectionSide(action.selectionId, event);
      
      const evaluatedPlayer: EvaluatedPlayer = {
        userId: action.userId,
        displayName: action.displayName,
        avatarUrl: action.avatarUrl,
        selectionId: action.selectionId,
        selectionLabel: action.selectionLabel,
        status,
        statusReason: evaluator.getStatusReason?.(action, event, status),
        confidenceRank: action.confidenceRank,
      };

      const key = action.selectionId;
      if (!selectionGroups.has(key)) {
        selectionGroups.set(key, {
          selectionId: action.selectionId,
          selectionLabel: action.selectionLabel,
          side,
          players: [],
          count: 0,
        });
      }

      const group = selectionGroups.get(key)!;
      group.players.push(evaluatedPlayer);
      group.count++;
    }

    // Sort groups: HOME first, then AWAY, then OTHER
    const sortedGroups = Array.from(selectionGroups.values()).sort((a, b) => {
      const order = { HOME: 0, AWAY: 1, OTHER: 2 };
      return order[a.side] - order[b.side];
    });

    cards.push({
      eventId: event.eventId,
      eventType: event.eventType,
      sportKey: event.sportKey,
      status: event.status,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      period: event.period,
      clock: event.clock,
      startTime: event.startTime,
      isTied: event.homeScore === event.awayScore && event.status !== 'SCHEDULED',
      groupedImpacts: sortedGroups,
      totalPlayers: eventActions.length,
    });
  }

  // Sort cards: LIVE first, then FINAL, then SCHEDULED
  return cards.sort((a, b) => {
    const order = { LIVE: 0, HALFTIME: 1, FINAL: 2, SCHEDULED: 3, POSTPONED: 4, CANCELED: 5 };
    return (order[a.status] ?? 99) - (order[b.status] ?? 99);
  });
}

/**
 * Main function: Get relevant live events for a pool
 */
export async function getRelevantLiveEvents(
  db: D1Database,
  poolId: number,
  periodId: string,
  isDemoMode = false
): Promise<{
  cards: LiveEventCard[];
  poolContext: PoolContext | null;
  hasActions: boolean;
  hasLiveEvents: boolean;
}> {
  // Demo mode returns mock data
  if (isDemoMode) {
    return getDemoLiveEvents(poolId, periodId);
  }

  // Get pool context
  const poolContext = await getPoolContext(db, poolId, periodId);
  if (!poolContext) {
    return { cards: [], poolContext: null, hasActions: false, hasLiveEvents: false };
  }

  // Get all entry actions for this pool/period
  const actions = await getPoolEntryActions(db, poolId, periodId);
  if (actions.length === 0) {
    return { cards: [], poolContext, hasActions: false, hasLiveEvents: false };
  }

  // Get unique event IDs
  const eventIds = [...new Set(actions.map(a => a.eventId))];

  // Fetch live event data
  const eventDataMap = await getLiveEventData(db, eventIds);
  const events = Array.from(eventDataMap.values());

  if (events.length === 0) {
    return { cards: [], poolContext, hasActions: true, hasLiveEvents: false };
  }

  // Build event cards with impacts
  const cards = buildEventCards(events, actions, poolContext);
  const hasLiveEvents = cards.some(c => c.status === 'LIVE' || c.status === 'HALFTIME');

  return { cards, poolContext, hasActions: true, hasLiveEvents };
}

/**
 * Demo mode data for testing
 */
function getDemoLiveEvents(
  poolId: number,
  periodId: string
): {
  cards: LiveEventCard[];
  poolContext: PoolContext;
  hasActions: boolean;
  hasLiveEvents: boolean;
} {
  const poolContext: PoolContext = {
    poolId,
    poolType: 'survivor',
    formatKey: 'survivor',
    sportKey: 'NFL',
    periodId,
  };

  const cards = buildEventCards(DEMO_LIVE_EVENTS, DEMO_POOL_ACTIONS, poolContext);
  const hasLiveEvents = cards.some(c => c.status === 'LIVE' || c.status === 'HALFTIME');

  return { cards, poolContext, hasActions: true, hasLiveEvents };
}

/**
 * Sync pool entry actions from picks table
 * Call this to migrate existing picks to the new unified table
 */
export async function syncPoolEntryActionsFromPicks(
  db: D1Database,
  poolId: number,
  periodId: string
): Promise<number> {
  const result = await db.prepare(`
    INSERT OR REPLACE INTO pool_entry_actions 
    (pool_id, period_id, user_id, entry_id, event_id, action_type, selection_id, selection_label, confidence_rank, is_locked, locked_at)
    SELECT 
      league_id,
      period_id,
      CAST(user_id AS TEXT),
      entry_id,
      CAST(event_id AS TEXT),
      'PICK',
      pick_value,
      pick_value,
      confidence_rank,
      is_locked,
      locked_at
    FROM picks
    WHERE league_id = ? AND period_id = ?
  `).bind(poolId, periodId).run();

  return result.meta.changes ?? 0;
}
