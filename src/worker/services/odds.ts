/**
 * Odds Service - Provider-Agnostic Odds Engine
 * 
 * Handles fetching, caching, and normalizing odds data from various providers.
 * Currently supports DEMO mode with simulated data.
 * 
 * Key features:
 * - Provider abstraction (swappable vendors)
 * - Multi-book support with consensus calculation
 * - Opening line capture
 * - Snapshot history for line movement
 * - Integration with threshold engine for movement alerts
 */

import type { 
  OddsQuote, 
  OddsOpening, 
  OddsSnapshot, 
  GameOddsSummary,
} from "../../shared/types";

// D1Database type from Cloudflare Workers
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: { changes?: number; last_row_id?: number };
}

// =====================================================
// TYPES & INTERFACES
// =====================================================

export type DataScope = "DEMO" | "PROD";

export interface OddsProviderConfig {
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
}

// Supported bookmaker keys
export const BOOKMAKER_KEYS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "pointsbet",
  "espnbet",
  "bet365",
  "consensus",
] as const;
export type BookmakerKey = typeof BOOKMAKER_KEYS[number];

// Market categories
export const MARKET_CATEGORIES = {
  MAIN: ["SPREAD", "TOTAL", "MONEYLINE"],
  HALF_1: ["SPREAD_1H", "TOTAL_1H", "ML_1H"],
  HALF_2: ["SPREAD_2H", "TOTAL_2H", "ML_2H"],
  PROPS: ["PLAYER_PROP", "TEAM_PROP"],
  ALT: ["ALT_SPREAD", "ALT_TOTAL"],
  LIVE: ["LIVE_SPREAD", "LIVE_TOTAL", "LIVE_ML"],
} as const;

// Cache entry with TTL
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

// In-memory caches
const oddsCache = new Map<string, CacheEntry<OddsQuote[]>>();
const summaryCache = new Map<string, CacheEntry<GameOddsSummary>>();

// Cache TTLs (milliseconds)
const CACHE_TTL = {
  PREGAME_MAIN: 2 * 60 * 1000,      // 2 minutes for main markets
  PREGAME_HALF: 10 * 60 * 1000,     // 10 minutes for half markets
  PREGAME_PROPS: 15 * 60 * 1000,    // 15 minutes for props
  LIVE: 15 * 1000,                   // 15 seconds for live
  SUMMARY: 60 * 1000,                // 1 minute for summaries
} as const;

// Key numbers for spread movement detection
const KEY_NUMBERS = {
  nfl: [3, 7, 10, 14],
  ncaaf: [3, 7, 10, 14],
  nba: [3, 5, 7],
  ncaab: [3, 5, 7],
  mlb: [1.5],
  nhl: [1.5],
  soccer: [0.5, 1, 1.5],
};

// =====================================================
// DEMO DATA GENERATION
// =====================================================

// Demo bookmaker odds variance (how much they differ from consensus)
const BOOK_VARIANCE: Record<string, { line: number; price: number }> = {
  draftkings: { line: 0, price: 0 },
  fanduel: { line: 0, price: 5 },
  betmgm: { line: 0.5, price: -5 },
  caesars: { line: 0, price: 10 },
  pointsbet: { line: -0.5, price: 0 },
  espnbet: { line: 0, price: -10 },
  bet365: { line: 0.5, price: 5 },
};

/**
 * Generate realistic demo odds for a game
 */
export function generateDemoOdds(
  gameId: string,
  sport: string,
  _homeTeam: string,
  _awayTeam: string,
  options: { 
    scope?: DataScope;
    books?: string[];
    includeHalf?: boolean;
  } = {}
): OddsQuote[] {
  const scope = options.scope || "DEMO";
  const books = options.books || ["draftkings", "fanduel", "betmgm", "caesars"];
  const quotes: OddsQuote[] = [];
  
  // Base consensus values (randomized per game)
  const hash = simpleHash(gameId);
  const isHomeUnderdog = hash % 2 === 0;
  
  // Spread: typically -1.5 to -14.5
  const baseSpread = isHomeUnderdog 
    ? 2.5 + (hash % 10) 
    : -(2.5 + (hash % 10));
  
  // Total: sport-specific
  const baseTotal = getBaseTotalBySport(sport, hash);
  
  // Moneyline: derived from spread roughly
  const baseHomeML = spreadToMoneyline(baseSpread);
  const baseAwayML = -baseHomeML + (baseHomeML > 0 ? -20 : 20);
  
  // Generate quotes for each book
  for (const book of books) {
    const variance = BOOK_VARIANCE[book] || { line: 0, price: 0 };
    
    // SPREAD
    const spreadLine = roundToHalf(baseSpread + variance.line);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: book,
      market_key: "SPREAD",
      outcome_key: "HOME",
      line_value: spreadLine,
      price_american: -110 + variance.price,
      price_decimal: americanToDecimal(-110 + variance.price),
      implied_probability: americanToImplied(-110 + variance.price),
      is_live: false,
      source_provider: "demo",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: book,
      market_key: "SPREAD",
      outcome_key: "AWAY",
      line_value: -spreadLine,
      price_american: -110 - variance.price,
      price_decimal: americanToDecimal(-110 - variance.price),
      implied_probability: americanToImplied(-110 - variance.price),
      is_live: false,
      source_provider: "demo",
    });
    
    // TOTAL
    const totalLine = roundToHalf(baseTotal);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: book,
      market_key: "TOTAL",
      outcome_key: "OVER",
      line_value: totalLine,
      price_american: -110 + variance.price,
      price_decimal: americanToDecimal(-110 + variance.price),
      implied_probability: americanToImplied(-110 + variance.price),
      is_live: false,
      source_provider: "demo",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: book,
      market_key: "TOTAL",
      outcome_key: "UNDER",
      line_value: totalLine,
      price_american: -110 - variance.price,
      price_decimal: americanToDecimal(-110 - variance.price),
      implied_probability: americanToImplied(-110 - variance.price),
      is_live: false,
      source_provider: "demo",
    });
    
    // MONEYLINE
    const homeML = baseHomeML + variance.price;
    const awayML = baseAwayML - variance.price;
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: book,
      market_key: "MONEYLINE",
      outcome_key: "HOME",
      line_value: null,
      price_american: homeML,
      price_decimal: americanToDecimal(homeML),
      implied_probability: americanToImplied(homeML),
      is_live: false,
      source_provider: "demo",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: book,
      market_key: "MONEYLINE",
      outcome_key: "AWAY",
      line_value: null,
      price_american: awayML,
      price_decimal: americanToDecimal(awayML),
      implied_probability: americanToImplied(awayML),
      is_live: false,
      source_provider: "demo",
    });
  }
  
  // Add 1H markets if requested
  if (options.includeHalf) {
    const half1Spread = roundToHalf(baseSpread / 2);
    const half1Total = roundToHalf(baseTotal / 2);
    
    for (const book of books.slice(0, 2)) { // Fewer books for half markets
      // 1H SPREAD
      quotes.push({
        data_scope: scope,
        game_id: gameId,
        bookmaker_key: book,
        market_key: "SPREAD_1H",
        outcome_key: "HOME",
        line_value: half1Spread,
        price_american: -110,
        price_decimal: americanToDecimal(-110),
        implied_probability: americanToImplied(-110),
        is_live: false,
        source_provider: "demo",
      });
      quotes.push({
        data_scope: scope,
        game_id: gameId,
        bookmaker_key: book,
        market_key: "SPREAD_1H",
        outcome_key: "AWAY",
        line_value: -half1Spread,
        price_american: -110,
        price_decimal: americanToDecimal(-110),
        implied_probability: americanToImplied(-110),
        is_live: false,
        source_provider: "demo",
      });
      
      // 1H TOTAL
      quotes.push({
        data_scope: scope,
        game_id: gameId,
        bookmaker_key: book,
        market_key: "TOTAL_1H",
        outcome_key: "OVER",
        line_value: half1Total,
        price_american: -110,
        price_decimal: americanToDecimal(-110),
        implied_probability: americanToImplied(-110),
        is_live: false,
        source_provider: "demo",
      });
      quotes.push({
        data_scope: scope,
        game_id: gameId,
        bookmaker_key: book,
        market_key: "TOTAL_1H",
        outcome_key: "UNDER",
        line_value: half1Total,
        price_american: -110,
        price_decimal: americanToDecimal(-110),
        implied_probability: americanToImplied(-110),
        is_live: false,
        source_provider: "demo",
      });
    }
  }
  
  return quotes;
}

/**
 * Generate opening lines from current quotes
 */
export function generateOpeningLines(quotes: OddsQuote[]): OddsOpening[] {
  const openings: OddsOpening[] = [];
  const now = new Date().toISOString();
  
  // Take consensus (first book) as opening
  const consensusQuotes = quotes.filter(q => q.bookmaker_key === "draftkings");
  
  for (const quote of consensusQuotes) {
    openings.push({
      data_scope: quote.data_scope,
      game_id: quote.game_id,
      bookmaker_key: "consensus",
      market_key: quote.market_key,
      outcome_key: quote.outcome_key,
      opening_line_value: quote.line_value,
      opening_price_american: quote.price_american,
      opening_price_decimal: quote.price_decimal,
      opened_at: now,
    });
  }
  
  return openings;
}

// =====================================================
// CONSENSUS CALCULATION
// =====================================================

/**
 * Calculate consensus (median) from multiple book quotes
 */
export function calculateConsensus(quotes: OddsQuote[]): OddsQuote[] {
  const consensus: OddsQuote[] = [];
  
  // Group by market/outcome
  const groups = new Map<string, OddsQuote[]>();
  for (const quote of quotes) {
    const key = `${quote.game_id}:${quote.market_key}:${quote.outcome_key}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(quote);
  }
  
  // Calculate median for each group
  for (const [, groupQuotes] of groups) {
    if (groupQuotes.length === 0) continue;
    
    const first = groupQuotes[0];
    const lines = groupQuotes.map(q => q.line_value).filter(l => l !== null) as number[];
    const prices = groupQuotes.map(q => q.price_american).filter(p => p !== null) as number[];
    
    consensus.push({
      data_scope: first.data_scope,
      game_id: first.game_id,
      bookmaker_key: "consensus",
      market_key: first.market_key,
      outcome_key: first.outcome_key,
      line_value: lines.length > 0 ? median(lines) : null,
      price_american: prices.length > 0 ? Math.round(median(prices)) : null,
      price_decimal: prices.length > 0 ? americanToDecimal(Math.round(median(prices))) : null,
      implied_probability: prices.length > 0 ? americanToImplied(Math.round(median(prices))) : null,
      is_live: first.is_live,
      source_provider: "consensus",
    });
  }
  
  return consensus;
}

// =====================================================
// GAME ODDS SUMMARY (UI-FRIENDLY)
// =====================================================

/**
 * Build a summary for a single game
 */
export function buildGameOddsSummary(
  gameId: string,
  quotes: OddsQuote[],
  opening?: OddsOpening[]
): GameOddsSummary {
  // Get consensus quotes
  const consensus = calculateConsensus(quotes);
  
  // Find consensus values by market
  const findConsensus = (market: string, outcome: string) =>
    consensus.find(q => q.market_key === market && q.outcome_key === outcome);
  
  const spreadHome = findConsensus("SPREAD", "HOME");
  const spreadAway = findConsensus("SPREAD", "AWAY");
  const totalOver = findConsensus("TOTAL", "OVER");
  const totalUnder = findConsensus("TOTAL", "UNDER");
  const mlHome = findConsensus("MONEYLINE", "HOME");
  const mlAway = findConsensus("MONEYLINE", "AWAY");
  const mlDraw = findConsensus("MONEYLINE", "DRAW");
  
  // Find opening values
  const openSpread = opening?.find(o => o.market_key === "SPREAD" && o.outcome_key === "HOME");
  const openTotal = opening?.find(o => o.market_key === "TOTAL" && o.outcome_key === "OVER");
  const openHomeML = opening?.find(o => o.market_key === "MONEYLINE" && o.outcome_key === "HOME");
  
  // Detect movements
  const spreadMoved = openSpread && spreadHome?.line_value !== undefined
    ? Math.abs((spreadHome.line_value || 0) - (openSpread.opening_line_value || 0)) >= 0.5
    : false;
  
  const totalMoved = openTotal && totalOver?.line_value !== undefined
    ? Math.abs((totalOver.line_value || 0) - (openTotal.opening_line_value || 0)) >= 1
    : false;
  
  const favoriteFlipped = openHomeML && mlHome?.price_american != null && openHomeML.opening_price_american != null
    ? (openHomeML.opening_price_american < 0) !== (mlHome.price_american < 0)
    : false;
  
  // Count unique books
  const books = new Set(quotes.map(q => q.bookmaker_key).filter(b => b !== "consensus"));
  
  return {
    game_id: gameId,
    data_scope: quotes[0]?.data_scope || "PROD",
    spread: spreadHome ? {
      home_line: spreadHome.line_value,
      home_price: spreadHome.price_american,
      away_line: spreadAway?.line_value ?? null,
      away_price: spreadAway?.price_american ?? null,
    } : null,
    total: totalOver ? {
      line: totalOver.line_value,
      over_price: totalOver.price_american,
      under_price: totalUnder?.price_american ?? null,
    } : null,
    moneyline: mlHome ? {
      home_price: mlHome.price_american,
      away_price: mlAway?.price_american ?? null,
      draw_price: mlDraw?.price_american ?? null,
    } : null,
    opening_spread: openSpread?.opening_line_value ?? null,
    opening_total: openTotal?.opening_line_value ?? null,
    opening_home_ml: openHomeML?.opening_price_american ?? null,
    spread_moved: spreadMoved,
    total_moved: totalMoved,
    favorite_flipped: favoriteFlipped,
    books_count: books.size,
    last_updated_at: new Date().toISOString(),
  };
}

// =====================================================
// SNAPSHOT MANAGEMENT
// =====================================================

/**
 * Determine if we should capture a snapshot (avoid DB bloat)
 */
export function shouldCaptureSnapshot(
  current: OddsQuote,
  previous: OddsQuote | null,
  sport: string
): boolean {
  if (!previous) return true; // Always capture first
  
  // Line value changed
  if (current.line_value !== previous.line_value) {
    return true;
  }
  
  // Price changed significantly (more than 10 cents)
  if (current.price_american !== null && previous.price_american !== null) {
    if (Math.abs(current.price_american - previous.price_american) >= 10) {
      return true;
    }
  }
  
  // Key number crossed
  if (current.line_value !== null && previous.line_value !== null) {
    const keyNums = KEY_NUMBERS[sport as keyof typeof KEY_NUMBERS] || [];
    for (const key of keyNums) {
      if (
        (previous.line_value < key && current.line_value >= key) ||
        (previous.line_value > -key && current.line_value <= -key) ||
        (previous.line_value >= key && current.line_value < key) ||
        (previous.line_value <= -key && current.line_value > -key)
      ) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Create a snapshot from a quote
 */
export function quoteToSnapshot(quote: OddsQuote): OddsSnapshot {
  return {
    data_scope: quote.data_scope,
    game_id: quote.game_id,
    bookmaker_key: quote.bookmaker_key,
    market_key: quote.market_key,
    outcome_key: quote.outcome_key,
    line_value: quote.line_value,
    price_american: quote.price_american,
    price_decimal: quote.price_decimal,
    is_live: quote.is_live,
    captured_at: new Date().toISOString(),
  };
}

// =====================================================
// ODDS MOVEMENT SIMULATION (DEMO)
// =====================================================

/**
 * Simulate a spread move
 */
export function simulateSpreadMove(
  quotes: OddsQuote[],
  gameId: string,
  delta: number
): OddsQuote[] {
  return quotes.map(q => {
    if (q.game_id !== gameId || q.market_key !== "SPREAD") return q;
    
    const newLine = (q.line_value || 0) + (q.outcome_key === "HOME" ? delta : -delta);
    return {
      ...q,
      line_value: roundToHalf(newLine),
      updated_at: new Date().toISOString(),
    };
  });
}

/**
 * Simulate a total move
 */
export function simulateTotalMove(
  quotes: OddsQuote[],
  gameId: string,
  delta: number
): OddsQuote[] {
  return quotes.map(q => {
    if (q.game_id !== gameId || q.market_key !== "TOTAL") return q;
    
    const newLine = (q.line_value || 0) + delta;
    return {
      ...q,
      line_value: roundToHalf(newLine),
      updated_at: new Date().toISOString(),
    };
  });
}

/**
 * Simulate a favorite flip
 */
export function simulateFavoriteFlip(
  quotes: OddsQuote[],
  gameId: string
): OddsQuote[] {
  return quotes.map(q => {
    if (q.game_id !== gameId) return q;
    
    if (q.market_key === "SPREAD") {
      // Flip the spread
      const newLine = -(q.line_value || 0);
      return {
        ...q,
        line_value: roundToHalf(newLine),
        updated_at: new Date().toISOString(),
      };
    }
    
    if (q.market_key === "MONEYLINE") {
      // Flip the moneyline prices (roughly)
      const price = q.price_american || -110;
      const newPrice = price > 0 ? -(price - 20) : Math.abs(price) + 20;
      return {
        ...q,
        price_american: Math.round(newPrice),
        price_decimal: americanToDecimal(newPrice),
        implied_probability: americanToImplied(newPrice),
        updated_at: new Date().toISOString(),
      };
    }
    
    return q;
  });
}

// =====================================================
// CACHING
// =====================================================

function isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.cachedAt < entry.ttlMs;
}

/**
 * Get cached odds for a game
 */
export function getCachedOdds(gameId: string, scope: DataScope): OddsQuote[] | null {
  const key = `${scope}:${gameId}`;
  const entry = oddsCache.get(key);
  if (isCacheValid(entry)) {
    return entry!.data;
  }
  return null;
}

/**
 * Set cached odds for a game
 */
export function setCachedOdds(gameId: string, scope: DataScope, quotes: OddsQuote[], isLive: boolean): void {
  const key = `${scope}:${gameId}`;
  const ttl = isLive ? CACHE_TTL.LIVE : CACHE_TTL.PREGAME_MAIN;
  oddsCache.set(key, {
    data: quotes,
    cachedAt: Date.now(),
    ttlMs: ttl,
  });
}

/**
 * Clear odds cache
 */
export function clearOddsCache(): void {
  oddsCache.clear();
  summaryCache.clear();
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getBaseTotalBySport(sport: string, hash: number): number {
  const variance = (hash % 10) - 5;
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return 44.5 + variance;
    case "nba":
      return 220.5 + variance * 3;
    case "ncaab":
      return 145.5 + variance * 2;
    case "mlb":
      return 8.5 + variance * 0.3;
    case "nhl":
      return 5.5 + variance * 0.3;
    case "soccer":
      return 2.5 + variance * 0.2;
    default:
      return 44.5 + variance;
  }
}

function spreadToMoneyline(spread: number): number {
  // Rough conversion: spread -3 ≈ -150, spread +3 ≈ +130
  const absSpread = Math.abs(spread);
  const base = 100 + absSpread * 15;
  if (spread < 0) {
    return -Math.round(base);
  } else {
    return Math.round(base - 20);
  }
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function americanToDecimal(american: number): number {
  if (american > 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

function americanToImplied(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// =====================================================
// SNAPSHOT CAPTURE ENGINE
// =====================================================

export interface SnapshotCaptureResult {
  captured: OddsSnapshot[];
  movements: {
    game_id: string;
    market_key: string;
    outcome_key: string;
    previous_line: number | null;
    current_line: number | null;
    previous_price: number | null;
    current_price: number | null;
    crossed_key_number: number | null;
  }[];
}

/**
 * Compare current quotes against previous quotes and capture snapshots
 * for significant movements. Returns snapshots to persist and movement details.
 */
export function captureOddsSnapshots(
  currentQuotes: OddsQuote[],
  previousQuotes: OddsQuote[] | null,
  sport: string
): SnapshotCaptureResult {
  const captured: OddsSnapshot[] = [];
  const movements: SnapshotCaptureResult["movements"] = [];
  
  // Build lookup map for previous quotes
  const prevMap = new Map<string, OddsQuote>();
  if (previousQuotes) {
    for (const q of previousQuotes) {
      const key = `${q.bookmaker_key}:${q.market_key}:${q.outcome_key}`;
      prevMap.set(key, q);
    }
  }
  
  for (const current of currentQuotes) {
    const key = `${current.bookmaker_key}:${current.market_key}:${current.outcome_key}`;
    const previous = prevMap.get(key) || null;
    
    if (shouldCaptureSnapshot(current, previous, sport)) {
      // Create snapshot
      captured.push(quoteToSnapshot(current));
      
      // Track movement details
      const crossedKeyNumber = findCrossedKeyNumber(
        previous?.line_value ?? null,
        current.line_value,
        sport
      );
      
      movements.push({
        game_id: current.game_id,
        market_key: current.market_key,
        outcome_key: current.outcome_key,
        previous_line: previous?.line_value ?? null,
        current_line: current.line_value,
        previous_price: previous?.price_american ?? null,
        current_price: current.price_american,
        crossed_key_number: crossedKeyNumber,
      });
    }
  }
  
  // Also capture consensus snapshots
  const consensus = calculateConsensus(currentQuotes);
  const prevConsensusMap = new Map<string, OddsQuote>();
  if (previousQuotes) {
    const prevConsensus = calculateConsensus(previousQuotes);
    for (const q of prevConsensus) {
      const key = `${q.market_key}:${q.outcome_key}`;
      prevConsensusMap.set(key, q);
    }
  }
  
  for (const c of consensus) {
    const key = `${c.market_key}:${c.outcome_key}`;
    const prev = prevConsensusMap.get(key) || null;
    
    if (shouldCaptureSnapshot(c, prev, sport)) {
      captured.push(quoteToSnapshot(c));
    }
  }
  
  return { captured, movements };
}

/**
 * Find if a key number was crossed between previous and current line
 */
function findCrossedKeyNumber(
  previous: number | null,
  current: number | null,
  sport: string
): number | null {
  if (previous === null || current === null) return null;
  if (previous === current) return null;
  
  const keyNums = KEY_NUMBERS[sport as keyof typeof KEY_NUMBERS] || [];
  
  for (const key of keyNums) {
    // Check positive crossing
    if (
      (previous < key && current >= key) ||
      (previous >= key && current < key)
    ) {
      return key;
    }
    // Check negative crossing
    if (
      (previous > -key && current <= -key) ||
      (previous <= -key && current > -key)
    ) {
      return -key;
    }
  }
  
  return null;
}

/**
 * Persist snapshots to database
 */
export async function persistSnapshots(
  db: D1Database,
  snapshots: OddsSnapshot[]
): Promise<number> {
  if (snapshots.length === 0) return 0;
  
  let inserted = 0;
  
  for (const snap of snapshots) {
    try {
      await db.prepare(`
        INSERT INTO odds_snapshots (
          data_scope, game_id, bookmaker_key, market_key, outcome_key,
          line_value, price_american, price_decimal, is_live, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        snap.data_scope,
        snap.game_id,
        snap.bookmaker_key,
        snap.market_key,
        snap.outcome_key,
        snap.line_value,
        snap.price_american,
        snap.price_decimal,
        snap.is_live ? 1 : 0,
        snap.captured_at
      ).run();
      inserted++;
    } catch (e) {
      console.error("Failed to insert snapshot:", e);
    }
  }
  
  return inserted;
}

/**
 * Fetch snapshots for a game (for line movement chart)
 */
export async function fetchSnapshotsForGame(
  db: D1Database,
  gameId: string,
  options: {
    scope?: DataScope;
    market?: string;
    bookmaker?: string;
    limit?: number;
  } = {}
): Promise<OddsSnapshot[]> {
  const scope = options.scope || "DEMO";
  const limit = options.limit || 100;
  
  let sql = `
    SELECT * FROM odds_snapshots 
    WHERE game_id = ? AND data_scope = ?
  `;
  const params: (string | number)[] = [gameId, scope];
  
  if (options.market) {
    sql += ` AND market_key = ?`;
    params.push(options.market);
  }
  
  if (options.bookmaker) {
    sql += ` AND bookmaker_key = ?`;
    params.push(options.bookmaker);
  }
  
  sql += ` ORDER BY captured_at ASC LIMIT ?`;
  params.push(limit);
  
  const { results } = await db.prepare(sql).bind(...params).all();
  
  return ((results || []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as number,
    data_scope: r.data_scope as string,
    game_id: r.game_id as string,
    bookmaker_key: r.bookmaker_key as string | null,
    market_key: r.market_key as string,
    outcome_key: r.outcome_key as string,
    line_value: r.line_value as number | null,
    price_american: r.price_american as number | null,
    price_decimal: r.price_decimal as number | null,
    is_live: Boolean(r.is_live),
    captured_at: r.captured_at as string,
  }));
}

/**
 * Clean up old snapshots to prevent DB bloat
 */
export async function pruneOldSnapshots(
  db: D1Database,
  daysToKeep: number = 7
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  
  const result = await db.prepare(`
    DELETE FROM odds_snapshots 
    WHERE captured_at < ? 
    AND data_scope = 'DEMO'
  `).bind(cutoff.toISOString()).run();
  
  return result.meta?.changes || 0;
}

// =====================================================
// THRESHOLD ENGINE INTEGRATION
// =====================================================

import { 
  detectSpreadMove, 
  detectTotalMove, 
  detectMLShift,
  type ThresholdEvent 
} from "./thresholdEngine";

export interface OddsMovementThresholdResult {
  events: ThresholdEvent[];
  spreadMovement?: { old: number; new: number; crossed_key: boolean };
  totalMovement?: { old: number; new: number };
  mlFlipped?: boolean;
}

/**
 * Process odds movements through the threshold engine.
 * Call this after refreshing odds to generate "What Just Changed" events.
 */
export async function processOddsMovements(
  db: D1Database,
  gameId: string,
  sport: string,
  currentQuotes: OddsQuote[],
  previousQuotes: OddsQuote[] | null,
  options: {
    dataScope?: DataScope;
    isLive?: boolean;
  } = {}
): Promise<OddsMovementThresholdResult> {
  const dataScope = options.dataScope || "DEMO";
  const isLive = options.isLive || false;
  const events: ThresholdEvent[] = [];
  const result: OddsMovementThresholdResult = { events };
  
  if (!previousQuotes || previousQuotes.length === 0) {
    return result;
  }
  
  // Get consensus values for comparison
  const currentConsensus = calculateConsensus(currentQuotes);
  const previousConsensus = calculateConsensus(previousQuotes);
  
  // Build lookup maps
  const findQuote = (quotes: OddsQuote[], market: string, outcome: string) =>
    quotes.find(q => q.market_key === market && q.outcome_key === outcome);
  
  // --- SPREAD MOVEMENT ---
  const currentSpread = findQuote(currentConsensus, "SPREAD", "HOME");
  const previousSpread = findQuote(previousConsensus, "SPREAD", "HOME");
  
  if (currentSpread?.line_value != null && previousSpread?.line_value != null) {
    const oldSpread = previousSpread.line_value;
    const newSpread = currentSpread.line_value;
    
    if (oldSpread !== newSpread) {
      const gameIdNum = extractGameIdNum(gameId);
      const spreadEvent = await detectSpreadMove(db, {
        dataScope,
        sportType: sport.toUpperCase(),
        gameId: gameIdNum,
        oldSpread,
        newSpread,
        isLive,
        source: "Odds Engine",
      });
      
      if (spreadEvent) {
        events.push(spreadEvent);
        const details = spreadEvent.details_json ? JSON.parse(spreadEvent.details_json) : {};
        result.spreadMovement = {
          old: oldSpread,
          new: newSpread,
          crossed_key: details.crossed_key_number || false,
        };
      }
    }
  }
  
  // --- TOTAL MOVEMENT ---
  const currentTotal = findQuote(currentConsensus, "TOTAL", "OVER");
  const previousTotal = findQuote(previousConsensus, "TOTAL", "OVER");
  
  if (currentTotal?.line_value != null && previousTotal?.line_value != null) {
    const oldTotal = previousTotal.line_value;
    const newTotal = currentTotal.line_value;
    
    if (oldTotal !== newTotal) {
      const gameIdNum = extractGameIdNum(gameId);
      const totalEvent = await detectTotalMove(db, {
        dataScope,
        sportType: sport.toUpperCase(),
        gameId: gameIdNum,
        oldTotal,
        newTotal,
        isLive,
        source: "Odds Engine",
      });
      
      if (totalEvent) {
        events.push(totalEvent);
        result.totalMovement = { old: oldTotal, new: newTotal };
      }
    }
  }
  
  // --- MONEYLINE SHIFT ---
  const currentHomeML = findQuote(currentConsensus, "MONEYLINE", "HOME");
  const previousHomeML = findQuote(previousConsensus, "MONEYLINE", "HOME");
  
  if (currentHomeML?.price_american != null && previousHomeML?.price_american != null) {
    const oldOdds = previousHomeML.price_american;
    const newOdds = currentHomeML.price_american;
    
    // Only process significant ML changes
    const probChange = Math.abs(
      americanToImplied(newOdds) * 100 - americanToImplied(oldOdds) * 100
    );
    
    if (probChange >= 3) { // 3%+ probability swing
      const gameIdNum = extractGameIdNum(gameId);
      const mlEvent = await detectMLShift(db, {
        dataScope,
        sportType: sport.toUpperCase(),
        gameId: gameIdNum,
        teamName: "Home", // Will be replaced with actual team name in full integration
        oldOdds,
        newOdds,
        source: "Odds Engine",
      });
      
      if (mlEvent) {
        events.push(mlEvent);
        result.mlFlipped = (oldOdds > 0 && newOdds < 0) || (oldOdds < 0 && newOdds > 0);
      }
    }
  }
  
  return result;
}

/**
 * Extract numeric game ID from string format (e.g., "nfl-1" -> 1)
 */
function extractGameIdNum(gameId: string): number {
  const parts = gameId.split("-");
  const lastPart = parts[parts.length - 1];
  const num = parseInt(lastPart, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Full odds refresh with threshold detection.
 * This is the main entry point for processing odds updates.
 */
export async function refreshOddsWithThresholds(
  db: D1Database,
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    dataScope?: DataScope;
    isLive?: boolean;
    books?: string[];
  } = {}
): Promise<{
  quotes: OddsQuote[];
  summary: GameOddsSummary;
  thresholdEvents: ThresholdEvent[];
  snapshots: OddsSnapshot[];
}> {
  const dataScope = options.dataScope || "DEMO";
  const isLive = options.isLive || false;
  
  // Get previous quotes from cache
  const previousQuotes = getCachedOdds(gameId, dataScope);
  
  // Generate new quotes (in demo mode)
  const currentQuotes = generateDemoOdds(gameId, sport, homeTeam, awayTeam, {
    scope: dataScope,
    books: options.books,
  });
  
  // Cache new quotes
  setCachedOdds(gameId, dataScope, currentQuotes, isLive);
  
  // Build summary
  const openings = generateOpeningLines(currentQuotes);
  const summary = buildGameOddsSummary(gameId, currentQuotes, openings);
  
  // Capture snapshots for significant movements
  const { captured: snapshots } = captureOddsSnapshots(currentQuotes, previousQuotes, sport);
  
  // Persist snapshots to DB
  if (snapshots.length > 0) {
    await persistSnapshots(db, snapshots);
  }
  
  // Process movements through threshold engine
  const { events: thresholdEvents } = await processOddsMovements(
    db,
    gameId,
    sport,
    currentQuotes,
    previousQuotes,
    { dataScope, isLive }
  );
  
  return {
    quotes: currentQuotes,
    summary,
    thresholdEvents,
    snapshots,
  };
}

export { CACHE_TTL, KEY_NUMBERS };
