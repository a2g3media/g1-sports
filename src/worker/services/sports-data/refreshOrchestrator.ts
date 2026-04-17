/**
 * Sports Data Refresh Orchestrator
 * Handles MASTER (4hr) and LIVE_MINI (20min) refresh cycles
 * 
 * PRODUCTION ONLY - No demo/dummy data injection
 * Uses findActiveSlateDate to locate real games
 */

import { D1Database } from '@cloudflare/workers-types';
import {
  OddsProviderInterface,
  SportKey,
  RefreshType,
  RefreshResult,
  NormalizedGame,
  NormalizedOdds,
  NormalizedProp,
  DbOddsCurrent,
  DbPropsCurrent,
  ACTIVE_SPORTS,
  SEASON_WINDOW_DAYS,
  SPORT_SCAN_WINDOWS
} from './types';
import { evaluateAllUsersWithActiveTickets } from '../ticketAlertEngine';
import { evaluateAllUsersWithFollowedPlayers } from '../playerAlertEngine';
// SportsRadar for props integration
import { getSportsRadarProvider } from './sportsRadarProvider';
import {
  findActiveSlateDate,
  fetchOddsForDate,
  sdioDateToISO,
  ActiveSlateResult
} from './activeSlateService';
import { resolveCanonicalPlayerIdFromPayload } from '../../../shared/espnAthleteIdLookup';
import { insertHistoricalPropSnapshot } from '../historicalLines/snapshotStore';

// Production pipeline only - NO demo data

// ============================================
// REFRESH LOCK (prevents overlapping refreshes)
// ============================================

let refreshLock: { type: RefreshType; startedAt: Date } | null = null;

function acquireLock(type: RefreshType): boolean {
  if (refreshLock) {
    // Allow if existing lock is stale (> 10 minutes)
    const lockAge = Date.now() - refreshLock.startedAt.getTime();
    if (lockAge < 10 * 60 * 1000) {
      console.log(`[Refresh] Lock held by ${refreshLock.type}, cannot acquire for ${type}`);
      return false;
    }
    console.log(`[Refresh] Stale lock detected, releasing`);
  }
  refreshLock = { type, startedAt: new Date() };
  return true;
}

function releaseLock(): void {
  refreshLock = null;
}

function isLocked(): { locked: boolean; by: RefreshType | null } {
  if (!refreshLock) return { locked: false, by: null };
  return { locked: true, by: refreshLock.type };
}

// ============================================
// DATABASE OPERATIONS
// ============================================

async function upsertGame(db: D1Database, game: NormalizedGame): Promise<number | null> {
  try {
    // Check if game exists
    const existing = await db
      .prepare('SELECT id FROM sdio_games WHERE provider_game_id = ? AND sport = ?')
      .bind(game.providerGameId, game.sport)
      .first<{ id: number }>();
    
    const now = new Date().toISOString();
    
    if (existing) {
      // Update existing game
      await db.prepare(`
        UPDATE sdio_games SET
          home_team = ?, away_team = ?, home_team_name = ?, away_team_name = ?,
          start_time = ?, status = ?, score_home = ?, score_away = ?, 
          period = ?, clock = ?, venue = ?, last_sync = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        game.homeTeam, game.awayTeam, game.homeTeamName, game.awayTeamName,
        game.startTime.toISOString(), game.status,
        game.scoreHome, game.scoreAway, game.period, game.clock,
        game.venue, now, now, existing.id
      ).run();
      return existing.id;
    } else {
      // Insert new game
      const result = await db.prepare(`
        INSERT INTO sdio_games (
          provider_game_id, sport, league, home_team, away_team, home_team_name, away_team_name,
          start_time, status, score_home, score_away, period, clock, venue, last_sync,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        game.providerGameId, game.sport, game.league, game.homeTeam, game.awayTeam,
        game.homeTeamName, game.awayTeamName,
        game.startTime.toISOString(), game.status, game.scoreHome, game.scoreAway,
        game.period, game.clock, game.venue, now, now, now
      ).run();
      return result.meta?.last_row_id ?? null;
    }
  } catch (error) {
    console.error(`[Refresh] Error upserting game ${game.providerGameId}:`, error);
    return null;
  }
}

async function getGameIdByProviderId(db: D1Database, providerGameId: string, sport: string): Promise<number | null> {
  // Normalize sport to uppercase to match storage format
  const normalizedSport = sport.toUpperCase();
  const result = await db
    .prepare('SELECT id FROM sdio_games WHERE provider_game_id = ? AND sport = ?')
    .bind(providerGameId, normalizedSport)
    .first<{ id: number }>();
  return result?.id ?? null;
}

async function upsertOdds(
  db: D1Database,
  gameId: number,
  odds: NormalizedOdds,
  sport: string
): Promise<{ updated: boolean; historyRecorded: boolean }> {
  const now = new Date().toISOString();
  let updated = false;
  let historyRecorded = false;
  
  try {
    // Get current odds
    const current = await db
      .prepare('SELECT * FROM sdio_odds_current WHERE game_id = ?')
      .bind(gameId)
      .first<DbOddsCurrent>();
    
    // Get provider game ID for line_history
    const gameInfo = await db
      .prepare('SELECT provider_game_id FROM sdio_games WHERE id = ?')
      .bind(gameId)
      .first<{ provider_game_id: string }>();
    const providerGameId = gameInfo?.provider_game_id || String(gameId);
    
    if (!current) {
      // First time seeing odds for this game - insert with open values
      await db.prepare(`
        INSERT INTO sdio_odds_current (
          game_id, spread_home, spread_away, total, moneyline_home, moneyline_away,
          open_spread, open_total, open_moneyline_home, open_moneyline_away,
          movement_spread, movement_total, last_updated, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
      `).bind(
        gameId, odds.spreadHome, odds.spreadAway, odds.total,
        odds.moneylineHome, odds.moneylineAway,
        odds.spreadHome, odds.total, odds.moneylineHome, odds.moneylineAway,
        now, now, now
      ).run();
      
      // Record initial odds in history
      await db.prepare(`
        INSERT INTO sdio_odds_history (
          game_id, spread_home, spread_away, total, moneyline_home, moneyline_away,
          recorded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        gameId, odds.spreadHome, odds.spreadAway, odds.total,
        odds.moneylineHome, odds.moneylineAway, now, now, now
      ).run();
      
      // Record opening lines in line_history
      if (odds.spreadHome !== null) {
        await db.prepare(`
          INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
          VALUES (?, ?, 'spread', ?, ?, 'SportsRadar/provider', ?, ?)
        `).bind(providerGameId, sport, odds.spreadHome, now, now, now).run();
      }
      if (odds.total !== null) {
        await db.prepare(`
          INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
          VALUES (?, ?, 'total', ?, ?, 'SportsRadar/provider', ?, ?)
        `).bind(providerGameId, sport, odds.total, now, now, now).run();
      }
      if (odds.moneylineHome !== null) {
        await db.prepare(`
          INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
          VALUES (?, ?, 'moneyline', ?, ?, 'SportsRadar/provider', ?, ?)
        `).bind(providerGameId, sport, odds.moneylineHome, now, now, now).run();
      }
      
      updated = true;
      historyRecorded = true;
    } else {
      // Check if any value changed
      const spreadChanged = current.spread_home !== odds.spreadHome;
      const totalChanged = current.total !== odds.total;
      const mlChanged = current.moneyline_home !== odds.moneylineHome;
      const changed = spreadChanged || current.spread_away !== odds.spreadAway || 
        totalChanged || mlChanged || current.moneyline_away !== odds.moneylineAway;
      
      if (changed) {
        // Calculate movement from opening values
        const movementSpread = odds.spreadHome !== null && current.open_spread !== null
          ? odds.spreadHome - current.open_spread
          : null;
        const movementTotal = odds.total !== null && current.open_total !== null
          ? odds.total - current.open_total
          : null;
        
        // Update current odds
        await db.prepare(`
          UPDATE sdio_odds_current SET
            spread_home = ?, spread_away = ?, total = ?,
            moneyline_home = ?, moneyline_away = ?,
            movement_spread = ?, movement_total = ?,
            last_updated = ?, updated_at = ?
          WHERE game_id = ?
        `).bind(
          odds.spreadHome, odds.spreadAway, odds.total,
          odds.moneylineHome, odds.moneylineAway,
          movementSpread, movementTotal, now, now, gameId
        ).run();
        
        // Append to history
        await db.prepare(`
          INSERT INTO sdio_odds_history (
            game_id, spread_home, spread_away, total, moneyline_home, moneyline_away,
            recorded_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          gameId, odds.spreadHome, odds.spreadAway, odds.total,
          odds.moneylineHome, odds.moneylineAway, now, now, now
        ).run();
        
        // Record line changes to line_history (only if value actually changed)
        if (spreadChanged && odds.spreadHome !== null) {
          await db.prepare(`
            INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
            VALUES (?, ?, 'spread', ?, ?, 'SportsRadar/provider', ?, ?)
          `).bind(providerGameId, sport, odds.spreadHome, now, now, now).run();
        }
        if (totalChanged && odds.total !== null) {
          await db.prepare(`
            INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
            VALUES (?, ?, 'total', ?, ?, 'SportsRadar/provider', ?, ?)
          `).bind(providerGameId, sport, odds.total, now, now, now).run();
        }
        if (mlChanged && odds.moneylineHome !== null) {
          await db.prepare(`
            INSERT INTO line_history (game_id, sport, market_type, value, timestamp, source, created_at, updated_at)
            VALUES (?, ?, 'moneyline', ?, ?, 'SportsRadar/provider', ?, ?)
          `).bind(providerGameId, sport, odds.moneylineHome, now, now, now).run();
        }
        
        updated = true;
        historyRecorded = true;
      }
    }
    
    return { updated, historyRecorded };
  } catch (error) {
    console.error(`[Refresh] Error upserting odds for game ${gameId}:`, error);
    return { updated: false, historyRecorded: false };
  }
}

async function upsertProp(
  db: D1Database,
  gameId: number,
  prop: NormalizedProp
): Promise<{ updated: boolean; historyRecorded: boolean }> {
  const now = new Date().toISOString();
  let updated = false;
  let historyRecorded = false;
  
  try {
    const gameCtx = await db
      .prepare(`
        SELECT provider_game_id, sport, league, home_team_name, away_team_name, home_team, away_team, start_time
        FROM sdio_games
        WHERE id = ?
      `)
      .bind(gameId)
      .first<{
        provider_game_id: string | null;
        sport: string | null;
        league: string | null;
        home_team_name: string | null;
        away_team_name: string | null;
        home_team: string | null;
        away_team: string | null;
        start_time: string | null;
      }>();
    await insertHistoricalPropSnapshot(db, {
      sport: String(gameCtx?.sport || "").toUpperCase() || "NBA",
      league: gameCtx?.league || null,
      eventId: gameCtx?.provider_game_id || null,
      gameId: gameCtx?.provider_game_id || String(gameId),
      gameStartTime: gameCtx?.start_time || null,
      playerName: prop.playerName,
      playerProviderId: resolveCanonicalPlayerIdFromPayload(prop.playerName, String(gameCtx?.sport || "").toUpperCase() || "NBA"),
      teamName: prop.team || gameCtx?.home_team_name || gameCtx?.home_team || null,
      opponentTeamName: gameCtx?.away_team_name || gameCtx?.away_team || null,
      statType: prop.propType,
      marketType: prop.propType,
      lineValue: prop.lineValue,
      capturedAt: now,
      rawPayload: prop,
      sportsbook: "consensus",
    });

    // Get current prop
    const current = await db
      .prepare('SELECT * FROM sdio_props_current WHERE game_id = ? AND player_name = ? AND prop_type = ?')
      .bind(gameId, prop.playerName, prop.propType)
      .first<DbPropsCurrent>();
    
    if (!current) {
      // First time seeing this prop
      await db.prepare(`
        INSERT INTO sdio_props_current (
          game_id, player_name, team, prop_type, line_value,
          open_line_value, movement, last_updated, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).bind(
        gameId, prop.playerName, prop.team, prop.propType, prop.lineValue,
        prop.lineValue, now, now, now
      ).run();
      
      // Record in history
      await db.prepare(`
        INSERT INTO sdio_props_history (
          game_id, player_name, prop_type, line_value, recorded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(gameId, prop.playerName, prop.propType, prop.lineValue, now, now, now).run();
      
      updated = true;
      historyRecorded = true;
    } else if (current.line_value !== prop.lineValue) {
      // Line changed
      const movement = current.open_line_value !== null
        ? prop.lineValue - current.open_line_value
        : null;
      
      await db.prepare(`
        UPDATE sdio_props_current SET
          team = ?, line_value = ?, movement = ?, last_updated = ?, updated_at = ?
        WHERE id = ?
      `).bind(prop.team, prop.lineValue, movement, now, now, current.id).run();
      
      // Record in history
      await db.prepare(`
        INSERT INTO sdio_props_history (
          game_id, player_name, prop_type, line_value, recorded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(gameId, prop.playerName, prop.propType, prop.lineValue, now, now, now).run();
      
      updated = true;
      historyRecorded = true;
    }
    
    return { updated, historyRecorded };
  } catch (error) {
    console.error(`[Refresh] Error upserting prop:`, error);
    return { updated: false, historyRecorded: false };
  }
}

async function logRefresh(
  db: D1Database,
  type: RefreshType,
  sport: SportKey,
  result: Partial<RefreshResult>
): Promise<number | null> {
  const now = new Date().toISOString();
  try {
    const res = await db.prepare(`
      INSERT INTO sdio_refresh_logs (
        refresh_type, sport, started_at, completed_at, status,
        games_processed, odds_updated, props_updated, errors,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      type, sport, result.durationMs ? now : now, 
      result.status === 'COMPLETED' || result.status === 'FAILED' ? now : null,
      result.status || 'RUNNING',
      result.gamesProcessed || 0,
      result.oddsUpdated || 0,
      result.propsUpdated || 0,
      result.errors?.length ? JSON.stringify(result.errors) : null,
      now, now
    ).run();
    return res.meta?.last_row_id ?? null;
  } catch (error) {
    console.error(`[Refresh] Error logging refresh:`, error);
    return null;
  }
}

async function updateRefreshLog(
  db: D1Database,
  logId: number,
  result: Partial<RefreshResult>
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db.prepare(`
      UPDATE sdio_refresh_logs SET
        completed_at = ?, status = ?, games_processed = ?,
        odds_updated = ?, props_updated = ?, errors = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      now, result.status, result.gamesProcessed,
      result.oddsUpdated, result.propsUpdated,
      result.errors?.length ? JSON.stringify(result.errors) : null,
      now, logId
    ).run();
  } catch (error) {
    console.error(`[Refresh] Error updating refresh log:`, error);
  }
}

// ============================================
// MASTER REFRESH (Every 4 Hours)
// Uses findActiveSlateDate to locate real games
// ============================================

export async function runMasterRefresh(
  db: D1Database,
  provider: OddsProviderInterface,
  apiKey?: string,
  _theOddsApiKey?: string,
  env?: { 
    VAPID_PUBLIC_KEY?: string; 
    VAPID_PRIVATE_KEY?: string;
    SPORTSRADAR_API_KEY?: string;
    SPORTSRADAR_PROPS_KEY?: string;
    SPORTSRADAR_GOLF_KEY?: string;
    SPORTSRADAR_PLAYER_PROPS_KEY?: string;
  }
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  
  if (!acquireLock('MASTER')) {
    console.log('[Refresh] Master refresh blocked by existing lock');
    return results;
  }
  
  try {
    console.log('[Refresh] Starting MASTER refresh cycle with active slate detection');
    
    for (const sport of ACTIVE_SPORTS) {
      const startTime = Date.now();
      const errors: string[] = [];
      let gamesProcessed = 0;
      let oddsUpdated = 0;
      let propsUpdated = 0;
      let dateUsed: string | null = null;
      
      // Create log entry
      const logId = await logRefresh(db, 'MASTER', sport, { status: 'RUNNING' });
      
      try {
        // STEP 1: Find active slate date (scans API for a date with games)
        // Skip active slate for Golf/MMA - they use specialized endpoints (Tournaments/Fights)
        console.log(`[Refresh] ${sport}: Finding active slate date...`);
        
        let slateResult: ActiveSlateResult | null = null;
        
        // If we have an API key, use the new active slate finder
        // Skip for GOLF and MMA - they don't use GamesByDate endpoint
        if (apiKey && sport !== 'GOLF' && sport !== 'MMA') {
          slateResult = await findActiveSlateDate(sport, apiKey);
          
          if (slateResult.error) {
            const skipReason = `${slateResult.error.type}: ${slateResult.error.message}`;
            console.log(`[Refresh] ${sport}: ${skipReason}`);
            errors.push(skipReason);
            console.log(`[Refresh] ${sport}: ${skipReason}, but will still attempt props fetch`);
            // Don't set dateUsed - will fall back to provider method
          } else {
            dateUsed = slateResult.dateUsed;
            console.log(`[Refresh] ${sport}: Found ${slateResult.gamesCount} games on ${dateUsed}`);
          }
        }
        
        // If no API key or no date found, fall back to provider method
        if (!dateUsed) {
          console.log(`[Refresh] ${sport}: Using provider fetchGames method`);
          const now = new Date();
          // Use sport-specific scan window for full season coverage
          const sportWindow = SPORT_SCAN_WINDOWS[sport] || { forwardDays: SEASON_WINDOW_DAYS, backDays: 7 };
          const startDate = new Date(now.getTime() - sportWindow.backDays * 24 * 60 * 60 * 1000);
          const endDate = new Date(now.getTime() + sportWindow.forwardDays * 24 * 60 * 60 * 1000);
          const dateRange = { start: startDate, end: endDate };
          
          const gamesResult = await provider.fetchGames(sport, dateRange);
          
          if (gamesResult.games.length === 0) {
            console.log(`[Refresh] ${sport}: No games returned from API, but will still try props`);
            errors.push('No games available from API');
            // Don't continue - let STEP 4 run to attempt props fetch
          } else {
            // Process games from provider (only if we have games)
            errors.push(...gamesResult.errors);
            for (const game of gamesResult.games) {
              const gameId = await upsertGame(db, game);
              if (gameId) gamesProcessed++;
            }
            
            // Fetch odds using provider
            const oddsResult = await provider.fetchOdds(sport, dateRange);
            errors.push(...oddsResult.errors);
            for (const odds of oddsResult.odds) {
              const gameId = await getGameIdByProviderId(db, odds.providerGameId, sport);
              if (gameId) {
                const result = await upsertOdds(db, gameId, odds, sport);
                if (result.updated) oddsUpdated++;
              }
            }
          }
        } else {
          // STEP 2: Fetch and upsert games for the found date
          // We already have games from the slate result, fetch full details
          const now = new Date();
          // Use sport-specific scan window for full season coverage
          const sportWindow = SPORT_SCAN_WINDOWS[sport] || { forwardDays: 7, backDays: 7 };
          const startDate = new Date(now.getTime() - sportWindow.backDays * 24 * 60 * 60 * 1000);
          const endDate = new Date(now.getTime() + sportWindow.forwardDays * 24 * 60 * 60 * 1000);
          const dateRange = { start: startDate, end: endDate };
          
          console.log(`[Refresh] Fetching full game data for ${sport} on ${dateUsed}`);
          const gamesResult = await provider.fetchGames(sport, dateRange);
          
          console.log(`[Refresh] ${sport}: API returned ${gamesResult.games.length} games`);
          errors.push(...gamesResult.errors);
          
          for (const game of gamesResult.games) {
            const gameId = await upsertGame(db, game);
            if (gameId) gamesProcessed++;
          }
          
          // STEP 3: Fetch and upsert odds for the same date
          console.log(`[Refresh] Fetching odds for ${sport} on ${dateUsed}`);
          const isoDate = sdioDateToISO(dateUsed);
          const oddsResult = await fetchOddsForDate(sport, isoDate, apiKey!);
          
          if (oddsResult.error) {
            errors.push(`Odds: ${oddsResult.error}`);
          } else {
            console.log(`[Refresh] ${sport}: Odds API returned ${oddsResult.odds.length} records`);
            
            let oddsProcessed = 0;
            let oddsSkippedNoId = 0;
            let oddsSkippedNoOdds = 0;
            let oddsSkippedNoGameMatch = 0;
            
            for (const gameOdds of oddsResult.odds) {
              // API returns PascalCase: GlobalGameId (not GlobalGameID)
              const providerGameId = String(
                gameOdds.GlobalGameId || gameOdds.GlobalGameID || 
                gameOdds.GameId || gameOdds.GameID || ''
              );
              
              if (!providerGameId) {
                oddsSkippedNoId++;
                continue;
              }
              
              const pregame = gameOdds.PregameOdds?.[0] || gameOdds.LiveOdds?.[0];
              
              if (!pregame) {
                oddsSkippedNoOdds++;
                continue;
              }
              
              const gameId = await getGameIdByProviderId(db, providerGameId, sport);
              if (!gameId) {
                oddsSkippedNoGameMatch++;
                continue;
              }
              
              const odds: NormalizedOdds = {
                providerGameId,
                spreadHome: pregame.HomePointSpread ?? null,
                spreadAway: pregame.AwayPointSpread ?? null,
                total: pregame.OverUnder ?? null,
                moneylineHome: pregame.HomeMoneyLine ?? null,
                moneylineAway: pregame.AwayMoneyLine ?? null
              };
              const result = await upsertOdds(db, gameId, odds, sport);
              if (result.updated) {
                oddsUpdated++;
                oddsProcessed++;
              }
            }
            
            console.log(`[Refresh] ${sport} odds summary: processed=${oddsProcessed}, skippedNoId=${oddsSkippedNoId}, skippedNoOdds=${oddsSkippedNoOdds}, skippedNoGameMatch=${oddsSkippedNoGameMatch}`);
          }
        }
        
        // STEP 4: Fetch and upsert props for each game (by game ID, not by date)
        console.log(`[Refresh] STEP 4: Fetching props by game ID for ${sport}`);
        try {
          // Get upcoming/scheduled games for this sport from the database
          const upcomingGames = await db.prepare(`
            SELECT id, provider_game_id 
            FROM sdio_games 
            WHERE sport = ? 
              AND status IN ('SCHEDULED', 'Scheduled', 'scheduled', 'InProgress', 'in_progress', 'live')
              AND start_time > datetime('now', '-1 day')
              AND start_time < datetime('now', '+3 days')
            ORDER BY start_time ASC
            LIMIT 20
          `).bind(sport).all();
          
          const gamesList = upcomingGames.results || [];
          console.log(`[Refresh] ${sport}: Found ${gamesList.length} upcoming games for props fetch`);
          
          let propsMatched = 0;
          let propsUnmatched = 0;
          
          // Fetch props for each game (limit to prevent rate limiting)
          for (const gameRow of gamesList.slice(0, 10)) {
            const providerGameId = String(gameRow.provider_game_id);
            const dbGameId = gameRow.id as number;
            
            // Use the new per-game props fetch method
            const sdioProvider = provider as any;
            if (typeof sdioProvider.fetchPropsForGame === 'function') {
              const propsResult = await sdioProvider.fetchPropsForGame(sport, providerGameId);
              
              if (propsResult.props.length > 0) {
                console.log(`[Refresh] ${sport} game ${providerGameId}: Got ${propsResult.props.length} props`);
                
                for (const prop of propsResult.props) {
                  const result = await upsertProp(db, dbGameId, prop);
                  if (result.updated) propsUpdated++;
                  propsMatched++;
                }
              }
              
              errors.push(...propsResult.errors);
            }
          }
          
          console.log(`[Refresh] ${sport}: Props fetch complete - ${propsUpdated} props updated across ${gamesList.length} games`);
          
          // Keep the old code path for compatibility with other providers
          const now = new Date();
          const dateRange = { start: now, end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
          const propsResult = await provider.fetchProps(sport, dateRange);
          
          for (const prop of propsResult.props) {
            const gameId = await getGameIdByProviderId(db, prop.providerGameId, sport);
            
            if (gameId) {
              const result = await upsertProp(db, gameId, prop);
              if (result.updated) propsUpdated++;
              propsMatched++;
            } else {
              propsUnmatched++;
              // Log first few unmatched for debugging
              if (propsUnmatched <= 3) {
                console.log(`[Refresh] ${sport}: No game match for prop providerGameId: ${prop.providerGameId}, player: ${prop.playerName}`);
              }
            }
          }
          
          console.log(`[Refresh] ${sport}: Props summary - matched: ${propsMatched}, unmatched: ${propsUnmatched}, updated: ${propsUpdated}`);
        } catch (propsErr) {
          // Props are optional - don't fail the whole refresh
          errors.push(`Props error: ${propsErr instanceof Error ? propsErr.message : String(propsErr)}`);
        }
        
        // STEP 4B: Fetch props from SportsRadar Player Props API (if API key available)
        // Uses the dedicated Player Props API (trial) which has better coverage
        const playerPropsKey = env?.SPORTSRADAR_PLAYER_PROPS_KEY || env?.SPORTSRADAR_API_KEY;
        if (playerPropsKey && ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB', 'NCAAF'].includes(sport)) {
          console.log(`[Refresh] STEP 4B: Fetching SportsRadar Player Props for ${sport}`);
          try {
            // Build game mapping from our database: "hometeam_awayteam" -> providerGameId
            const upcomingGamesForMapping = await db.prepare(`
              SELECT provider_game_id, home_team, away_team 
              FROM sdio_games 
              WHERE sport = ? 
                AND status IN ('SCHEDULED', 'Scheduled', 'scheduled', 'InProgress', 'in_progress', 'live')
                AND start_time > datetime('now', '-1 day')
                AND start_time < datetime('now', '+3 days')
            `).bind(sport).all();
            
            const gameMapping = new Map<string, string>();
            for (const row of (upcomingGamesForMapping.results || [])) {
              const home = String(row.home_team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const away = String(row.away_team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const provId = String(row.provider_game_id);
              if (home && away && provId) {
                gameMapping.set(`${home}_${away}`, provId);
              }
            }
            
            console.log(`[Refresh] ${sport}: Built game mapping with ${gameMapping.size} entries`);
            
            // Fetch props using the Player Props API (competition-level endpoint)
            const srGolfKey = env?.SPORTSRADAR_GOLF_KEY || playerPropsKey;
            const srProvider = getSportsRadarProvider(srGolfKey, playerPropsKey);
            const srResult = await srProvider.fetchPlayerPropsByCompetition(
              sport as any,
              playerPropsKey,
              gameMapping
            );
            
            if (srResult.errors.length > 0) {
              errors.push(...srResult.errors.slice(0, 3)); // Limit error count
            }
            
            // Upsert SportsRadar props
            let srPropsUpdated = 0;
            for (const prop of srResult.props) {
              const gameId = await getGameIdByProviderId(db, prop.providerGameId, sport);
              if (gameId) {
                const result = await upsertProp(db, gameId, prop);
                if (result.updated) srPropsUpdated++;
              }
            }
            
            console.log(`[Refresh] ${sport}: SportsRadar Player Props - ${srResult.rawEvents} events, ${srResult.props.length} props fetched, ${srPropsUpdated} updated`);
            propsUpdated += srPropsUpdated;
            
          } catch (srErr) {
            const srErrMsg = srErr instanceof Error ? srErr.message : String(srErr);
            errors.push(`SportsRadar Player Props error: ${srErrMsg}`);
            console.error(`[Refresh] ${sport}: SportsRadar Player Props error:`, srErr);
          }
        }
        
        // Update log
        const finalResult: RefreshResult = {
          sport,
          refreshType: 'MASTER',
          status: 'COMPLETED',
          gamesProcessed,
          oddsUpdated,
          propsUpdated,
          durationMs: Date.now() - startTime,
          errors
        };
        
        if (logId) await updateRefreshLog(db, logId, finalResult);
        results.push(finalResult);
        
        console.log(`[Refresh] ${sport} complete: ${gamesProcessed} games, ${oddsUpdated} odds, ${propsUpdated} props (date: ${dateUsed || 'provider-default'})`);
        
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Fatal error: ${errMsg}`);
        
        const failedResult: RefreshResult = {
          sport,
          refreshType: 'MASTER',
          status: 'FAILED',
          gamesProcessed,
          oddsUpdated,
          propsUpdated,
          durationMs: Date.now() - startTime,
          errors
        };
        
        if (logId) await updateRefreshLog(db, logId, failedResult);
        results.push(failedResult);
      }
    }
    
    // After all sports refreshed, evaluate ticket alerts for all users
    try {
      console.log('[Refresh] Running ticket alert evaluation...');
      const alertResult = await evaluateAllUsersWithActiveTickets(db, env);
      console.log(`[Refresh] Alert evaluation: ${alertResult.usersEvaluated} users, ${alertResult.totalAlerts} alerts`);
    } catch (alertErr) {
      console.error('[Refresh] Alert evaluation error:', alertErr);
    }
    
    // Evaluate player alerts for all users with followed players
    try {
      console.log('[Refresh] Running player alert evaluation...');
      const playerAlertResult = await evaluateAllUsersWithFollowedPlayers(db, env);
      console.log(`[Refresh] Player alert evaluation: ${playerAlertResult.usersEvaluated} users, ${playerAlertResult.totalAlerts} alerts`);
    } catch (playerAlertErr) {
      console.error('[Refresh] Player alert evaluation error:', playerAlertErr);
    }
    
    return results;
  } finally {
    releaseLock();
  }
}

// ============================================
// LIVE MINI REFRESH (Every 20 Minutes)
// ============================================

export async function runLiveMiniRefresh(
  db: D1Database,
  provider: OddsProviderInterface,
  env?: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  const lockStatus = isLocked();
  
  if (lockStatus.locked && lockStatus.by === 'MASTER') {
    console.log('[Refresh] Live mini refresh blocked - MASTER refresh in progress');
    return results;
  }
  
  if (!acquireLock('LIVE_MINI')) {
    console.log('[Refresh] Live mini refresh blocked by existing lock');
    return results;
  }
  
  try {
    console.log('[Refresh] Starting LIVE_MINI refresh cycle');
    
    // Get all sports with live games
    const liveGames = await db
      .prepare("SELECT DISTINCT sport FROM sdio_games WHERE status = 'LIVE'")
      .all<{ sport: string }>();
    
    const liveSports = new Set(liveGames.results?.map(g => g.sport as SportKey) || []);
    
    if (liveSports.size === 0) {
      console.log('[Refresh] No live games, skipping mini refresh');
      return results;
    }
    
    for (const sport of liveSports) {
      const startTime = Date.now();
      const errors: string[] = [];
      let oddsUpdated = 0;
      
      const logId = await logRefresh(db, 'LIVE_MINI', sport, { status: 'RUNNING' });
      
      try {
        // Only fetch odds for today (live games)
        const now = new Date();
        const dateRange = { start: now, end: now };
        
        console.log(`[Refresh] Fetching live odds for ${sport}`);
        const oddsResult = await provider.fetchOdds(sport, dateRange);
        errors.push(...oddsResult.errors);
        
        // Only update odds for games that are currently LIVE
        const liveGameIds = await db
          .prepare("SELECT id, provider_game_id FROM sdio_games WHERE sport = ? AND status = 'LIVE'")
          .bind(sport)
          .all<{ id: number; provider_game_id: string }>();
        
        const liveGameMap = new Map(
          liveGameIds.results?.map(g => [g.provider_game_id, g.id]) || []
        );
        
        for (const odds of oddsResult.odds) {
          const gameId = liveGameMap.get(odds.providerGameId);
          if (gameId) {
            const result = await upsertOdds(db, gameId, odds, sport);
            if (result.updated) oddsUpdated++;
          }
        }
        
        const finalResult: RefreshResult = {
          sport,
          refreshType: 'LIVE_MINI',
          status: 'COMPLETED',
          gamesProcessed: liveGameMap.size,
          oddsUpdated,
          propsUpdated: 0, // Mini refresh doesn't update props
          durationMs: Date.now() - startTime,
          errors
        };
        
        if (logId) await updateRefreshLog(db, logId, finalResult);
        results.push(finalResult);
        
        console.log(`[Refresh] ${sport} live mini complete: ${oddsUpdated} odds updated`);
        
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Fatal error: ${errMsg}`);
        
        if (logId) {
          await updateRefreshLog(db, logId, {
            status: 'FAILED',
            gamesProcessed: 0,
            oddsUpdated,
            propsUpdated: 0,
            errors
          });
        }
        
        results.push({
          sport,
          refreshType: 'LIVE_MINI',
          status: 'FAILED',
          gamesProcessed: 0,
          oddsUpdated,
          propsUpdated: 0,
          durationMs: Date.now() - startTime,
          errors
        });
      }
    }
    
    // After live games refreshed, evaluate ticket alerts for all users
    if (results.length > 0) {
      try {
        console.log('[Refresh] Running ticket alert evaluation after live update...');
        const alertResult = await evaluateAllUsersWithActiveTickets(db, env);
        console.log(`[Refresh] Alert evaluation: ${alertResult.usersEvaluated} users, ${alertResult.totalAlerts} alerts`);
      } catch (alertErr) {
        console.error('[Refresh] Alert evaluation error:', alertErr);
      }
      
      // Evaluate player alerts for all users with followed players
      try {
        console.log('[Refresh] Running player alert evaluation after live update...');
        const playerAlertResult = await evaluateAllUsersWithFollowedPlayers(db, env);
        console.log(`[Refresh] Player alert evaluation: ${playerAlertResult.usersEvaluated} users, ${playerAlertResult.totalAlerts} alerts`);
      } catch (playerAlertErr) {
        console.error('[Refresh] Player alert evaluation error:', playerAlertErr);
      }
    }
    
    return results;
  } finally {
    releaseLock();
  }
}

// ============================================
// EXPORTS
// ============================================

export { isLocked, ACTIVE_SPORTS };
