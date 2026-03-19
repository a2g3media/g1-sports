import type {
  CoachGContextPackage,
  GameContext,
  MarketContext,
  PlayerContext,
  TeamContext,
  UserContext,
} from "../types/context";
import { fetchGameWithFallback } from "./providers";

type Db = D1Database;

interface SplitRow {
  market: string;
  side: string;
  tickets_pct: number | null;
  handle_pct: number | null;
}
interface SplitApiRow {
  market?: unknown;
  market_key?: unknown;
  side?: unknown;
  outcome?: unknown;
  tickets_pct?: unknown;
  ticket_pct?: unknown;
  bets_pct?: unknown;
  handle_pct?: unknown;
  money_pct?: unknown;
  stake_pct?: unknown;
}
interface GameRow {
  id: string | number;
  provider_game_id?: string | null;
  sport?: string | null;
  league?: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_code?: string | null;
  away_team_code?: string | null;
  start_time?: string | null;
  status?: string | null;
  home_score?: number | string | null;
  away_score?: number | string | null;
}
interface OddsRow {
  spread_home?: number | string | null;
  spread_away?: number | string | null;
  total?: number | string | null;
  moneyline_home?: number | string | null;
  moneyline_away?: number | string | null;
  open_spread?: number | string | null;
}
interface PropRow {
  player_name?: string | null;
  prop_type?: string | null;
  line_value?: number | string | null;
  open_line_value?: number | string | null;
  team?: string | null;
}
interface RecentGameRow {
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_score?: number | string | null;
  away_score?: number | string | null;
}
interface PreviewRow {
  preview_content?: string | null;
  updated_at?: string | null;
}
interface UserSettingRow {
  setting_key?: string | null;
  setting_value?: string | null;
}
type QueryResults<T> = { results?: T[] };
type SnapshotRow = {
  market_key?: string | null;
  outcome_key?: string | null;
  line_value?: number | string | null;
  price_american?: number | string | null;
  captured_at?: string | null;
};
type OpeningRow = {
  market_key?: string | null;
  outcome_key?: string | null;
  opening_line?: number | string | null;
  opening_price?: number | string | null;
};

const CONTEXT_TTL_MS = 30 * 1000;

type CacheEntry<T> = { at: number; value: T };
const gameCache = new Map<string, CacheEntry<GameContext | null>>();
const userCache = new Map<string, CacheEntry<UserContext>>();
const SPORT_HINTS: Record<string, string> = {
  nba: "NBA",
  nfl: "NFL",
  mlb: "MLB",
  nhl: "NHL",
  ncaab: "NCAAB",
  ncaaf: "NCAAF",
  soccer: "SOCCER",
};

function toNum(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CONTEXT_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

async function fetchSplits(env: Env, gameId: string): Promise<SplitRow[]> {
  if (!env.TICKET_HANDLE_FEED_URL) return [];
  try {
    const url = new URL(env.TICKET_HANDLE_FEED_URL);
    url.searchParams.set("game_id", gameId);
    const headers: HeadersInit = { Accept: "application/json" };
    if (env.TICKET_HANDLE_FEED_API_KEY) {
      headers.Authorization = `Bearer ${env.TICKET_HANDLE_FEED_API_KEY}`;
    }
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) return [];
    const payload = await res.json() as unknown;
    const payloadObj = (typeof payload === "object" && payload !== null)
      ? payload as Record<string, unknown>
      : {};
    const rows = Array.isArray(payload)
      ? payload as SplitApiRow[]
      : Array.isArray(payloadObj.rows)
        ? payloadObj.rows as SplitApiRow[]
        : Array.isArray(payloadObj.splits)
          ? payloadObj.splits as SplitApiRow[]
          : [];
    return rows.map((r) => ({
      market: String(r.market || r.market_key || ""),
      side: String(r.side || r.outcome || ""),
      tickets_pct: toNum(r.tickets_pct ?? r.ticket_pct ?? r.bets_pct),
      handle_pct: toNum(r.handle_pct ?? r.money_pct ?? r.stake_pct),
    }));
  } catch {
    return [];
  }
}

function mapSport(raw: unknown): string {
  return String(raw || "unknown").toLowerCase();
}

function buildGameIdCandidates(gameId: string): string[] {
  const raw = String(gameId || "").trim();
  if (!raw) return [];
  const candidates = new Set<string>([raw]);

  const parts = raw.split("_").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    candidates.add(parts[parts.length - 1]);
    candidates.add(parts.slice(-2).join("_"));
  }

  const colonParts = raw.split(":").map((p) => p.trim()).filter(Boolean);
  if (colonParts.length >= 2) {
    candidates.add(colonParts[colonParts.length - 1]);
  }

  return Array.from(candidates).filter(Boolean).slice(0, 6);
}

function parseSportHint(gameId: string, query?: string): string | null {
  const fromId = String(gameId || "").toLowerCase();
  for (const [token, sport] of Object.entries(SPORT_HINTS)) {
    if (fromId.startsWith(`sr_${token}_`) || fromId.includes(`_${token}_`)) return sport;
  }
  const q = String(query || "").toLowerCase();
  for (const [token, sport] of Object.entries(SPORT_HINTS)) {
    if (q.includes(token)) return sport;
  }
  return null;
}

function parseMatchupTokens(query?: string): { away: string; home: string } | null {
  const raw = String(query || "").trim();
  if (!raw) return null;
  const m = raw.match(/([a-z0-9 .'-]{2,30})\s*(?:@| at | vs | versus )\s*([a-z0-9 .'-]{2,30})/i);
  if (!m) return null;
  const clean = (v: string) => v.replace(/\s+/g, " ").trim();
  const away = clean(m[1] || "");
  const home = clean(m[2] || "");
  if (!away || !home) return null;
  return { away, home };
}

function parseSharpIndicators(splits: SplitRow[]): string[] {
  const indicators: string[] = [];
  for (const row of splits) {
    const tickets = row.tickets_pct ?? 50;
    const handle = row.handle_pct ?? 50;
    const gap = handle - tickets;
    if (Math.abs(gap) >= 10) {
      indicators.push(`money_ticket_gap:${row.side.toLowerCase()}`);
    }
    if (tickets >= 75 && handle <= 45) {
      indicators.push(`public_heavy:${row.side.toLowerCase()}`);
    }
  }
  return Array.from(new Set(indicators));
}

function inferGameCandidatesByQuery(query?: string): string[] {
  const tokens = String(query || "")
    .split(/\s+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length >= 2 && t.length <= 5);
  return Array.from(new Set(tokens)).slice(0, 6);
}

async function resolveProviderGame(idCandidates: string[], query?: string): Promise<{
  providerGame: any | null;
  requestedGameId: string | null;
  providerFallbackReason: string | null;
}> {
  let providerFallbackReason: string | null = null;
  for (const id of idCandidates) {
    try {
      const result = await fetchGameWithFallback(id);
      if (result.data?.game) {
        return {
          providerGame: result.data.game,
          requestedGameId: id,
          providerFallbackReason: null,
        };
      }
      if (result.error) providerFallbackReason = result.error;
    } catch (err) {
      providerFallbackReason = String(err);
    }
  }
  const matchupHints = inferGameCandidatesByQuery(query);
  for (const hint of matchupHints) {
    try {
      const result = await fetchGameWithFallback(hint);
      if (result.data?.game) {
        return {
          providerGame: result.data.game,
          requestedGameId: hint,
          providerFallbackReason: null,
        };
      }
      if (result.error) providerFallbackReason = result.error;
    } catch (err) {
      providerFallbackReason = String(err);
    }
  }
  return { providerGame: null, requestedGameId: null, providerFallbackReason };
}

async function readOddsFromSnapshotTables(db: Db, providerGameId: string): Promise<{
  spreadHome: number | null;
  total: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  openSpread: number | null;
}> {
  let spreadHome: number | null = null;
  let total: number | null = null;
  let moneylineHome: number | null = null;
  let moneylineAway: number | null = null;
  let openSpread: number | null = null;

  try {
    const currentRows = await db.prepare(`
      SELECT market_key, outcome_key, line_value, price_american, captured_at
      FROM odds_snapshots
      WHERE game_id = ?
      ORDER BY captured_at DESC
      LIMIT 120
    `).bind(providerGameId).all() as QueryResults<SnapshotRow>;
    const firstByMarketOutcome = new Map<string, SnapshotRow>();
    for (const row of currentRows.results || []) {
      const key = `${String(row.market_key || "").toUpperCase()}:${String(row.outcome_key || "").toUpperCase()}`;
      if (!firstByMarketOutcome.has(key)) {
        firstByMarketOutcome.set(key, row);
      }
    }
    spreadHome = toNum(firstByMarketOutcome.get("SPREAD:HOME")?.line_value);
    total = toNum(firstByMarketOutcome.get("TOTAL:OVER")?.line_value);
    moneylineHome = toNum(firstByMarketOutcome.get("MONEYLINE:HOME")?.price_american);
    moneylineAway = toNum(firstByMarketOutcome.get("MONEYLINE:AWAY")?.price_american);
  } catch {
    // Optional enrichment - ignore.
  }

  try {
    const openingRows = await db.prepare(`
      SELECT market_key, outcome_key, opening_line, opening_price
      FROM odds_opening
      WHERE game_id = ?
    `).bind(providerGameId).all() as QueryResults<OpeningRow>;
    const openByMarketOutcome = new Map<string, OpeningRow>();
    for (const row of openingRows.results || []) {
      const key = `${String(row.market_key || "").toUpperCase()}:${String(row.outcome_key || "").toUpperCase()}`;
      openByMarketOutcome.set(key, row);
    }
    openSpread = toNum(openByMarketOutcome.get("SPREAD:HOME")?.opening_line);
  } catch {
    // Optional enrichment - ignore.
  }

  return {
    spreadHome,
    total,
    moneylineHome,
    moneylineAway,
    openSpread,
  };
}

function deriveHistory(recentRows: RecentGameRow[], teamName: string): string | null {
  let wins = 0;
  let games = 0;
  for (const row of recentRows) {
    const involvesTeam = row.home_team_name === teamName || row.away_team_name === teamName;
    if (!involvesTeam) continue;
    games += 1;
    const homeWon = Number(row.home_score) > Number(row.away_score);
    const teamWon = row.home_team_name === teamName ? homeWon : !homeWon;
    if (teamWon) wins += 1;
  }
  if (games === 0) return null;
  return `${wins}-${Math.max(0, games - wins)}`;
}

function extractPreviewBriefs(previewContent: string | null | undefined): string[] {
  if (!previewContent) return [];
  try {
    const parsed = JSON.parse(previewContent) as Record<string, unknown>;
    const sections = [
      parsed.matchupStory,
      parsed.keyNumbers,
      parsed.playerSpotlight,
      parsed.bettingInsight,
      parsed.riskAssessment,
    ];
    return sections
      .map((v) => (typeof v === "string" ? v : ""))
      .map((v) => v.replace(/\s+/g, " ").trim())
      .filter((v) => v.length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function getGameContext(
  db: Db,
  env: Env,
  gameId: string,
  query?: string
): Promise<GameContext | null> {
  const cacheKey = `${String(gameId || "").trim()}::${String(query || "").trim()}`;
  const cached = fromCache(gameCache, cacheKey);
  if (cached !== null) return cached;

  const idCandidates = buildGameIdCandidates(gameId);
  const primary = idCandidates[0] || gameId;
  const alt1 = idCandidates[1] || primary;
  const alt2 = idCandidates[2] || primary;
  const alt3 = idCandidates[3] || primary;
  const tail = idCandidates[idCandidates.length - 1] || primary;

  const providerResolved = await resolveProviderGame(idCandidates, query);
  const providerGame = providerResolved.providerGame;
  if (providerGame) {
    const canonicalProviderGameId = String(providerGame.game_id || primary);
    const snapshotOdds = await readOddsFromSnapshotTables(db, canonicalProviderGameId);
    const preview = await db.prepare(`
      SELECT preview_content, updated_at
      FROM coach_g_previews
      WHERE game_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(canonicalProviderGameId).first<PreviewRow>();
    const splits = await fetchSplits(env, canonicalProviderGameId);
    const homeSplit = splits.find((r) => r.side.toUpperCase().includes("HOME"));
    const awaySplit = splits.find((r) => r.side.toUpperCase().includes("AWAY"));

    const homeName = String(providerGame.home_team_name || providerGame.home_team_code || "HOME");
    const awayName = String(providerGame.away_team_name || providerGame.away_team_code || "AWAY");
    const sport = mapSport(providerGame.sport);

    const recentRows = await db.prepare(`
      SELECT
        home_team_name,
        away_team_name,
        score_home AS home_score,
        score_away AS away_score
      FROM sdio_games
      WHERE sport = ? AND (home_team_name = ? OR away_team_name = ? OR home_team_name = ? OR away_team_name = ?)
        AND score_home IS NOT NULL AND score_away IS NOT NULL
      ORDER BY start_time DESC
      LIMIT 30
    `).bind(
      sport.toUpperCase(),
      homeName,
      homeName,
      awayName,
      awayName
    ).all() as QueryResults<RecentGameRow>;

    const h2hRows = await db.prepare(`
      SELECT
        home_team_name,
        away_team_name,
        score_home AS home_score,
        score_away AS away_score
      FROM sdio_games
      WHERE ((home_team_name = ? AND away_team_name = ?) OR (home_team_name = ? AND away_team_name = ?))
        AND score_home IS NOT NULL AND score_away IS NOT NULL
      ORDER BY start_time DESC
      LIMIT 5
    `).bind(
      homeName,
      awayName,
      awayName,
      homeName
    ).all() as QueryResults<RecentGameRow>;

    const h2hTotal = Array.isArray(h2hRows.results) ? h2hRows.results.length : 0;
    let h2hHomeWins = 0;
    for (const row of (h2hRows.results || [])) {
      const homeWon = Number(row.home_score) > Number(row.away_score);
      const coachHomeWon = homeWon
        ? row.home_team_name === homeName
        : row.away_team_name === homeName;
      if (coachHomeWon) h2hHomeWins += 1;
    }

    const spread = snapshotOdds.spreadHome;
    const openingSpread = snapshotOdds.openSpread;
    const lineMovement = spread !== null && openingSpread !== null ? Number((spread - openingSpread).toFixed(2)) : 0;
    const startMs = providerGame.start_time ? new Date(String(providerGame.start_time)).getTime() : NaN;
    const dataAgeMinutes = Number.isFinite(startMs) ? Math.max(0, Math.round((Date.now() - startMs) / 60000)) : null;

    const builtFromProvider: GameContext = {
      gameId: canonicalProviderGameId,
      sport,
      league: providerGame.league ? String(providerGame.league) : null,
      homeTeam: homeName,
      awayTeam: awayName,
      startTime: providerGame.start_time ? String(providerGame.start_time) : null,
      status: providerGame.status ? String(providerGame.status) : null,
      score: {
        home: toNum(providerGame.home_score),
        away: toNum(providerGame.away_score),
      },
      spread,
      moneyline: {
        home: snapshotOdds.moneylineHome,
        away: snapshotOdds.moneylineAway,
      },
      total: snapshotOdds.total,
      openingLine: {
        spread: openingSpread,
        total: snapshotOdds.total,
        moneylineHome: snapshotOdds.moneylineHome,
        moneylineAway: snapshotOdds.moneylineAway,
      },
      currentLine: {
        spread,
        total: snapshotOdds.total,
        moneylineHome: snapshotOdds.moneylineHome,
        moneylineAway: snapshotOdds.moneylineAway,
      },
      lineMovement,
      publicBettingPercentage: {
        home: homeSplit?.tickets_pct ?? null,
        away: awaySplit?.tickets_pct ?? null,
      },
      moneyPercentage: {
        home: homeSplit?.handle_pct ?? null,
        away: awaySplit?.handle_pct ?? null,
      },
      injuries: [],
      projectedLineups: [],
      restDays: { home: null, away: null },
      travelDistance: { home: null, away: null },
      backToBack: { home: false, away: false },
      recentForm: {
        home: deriveHistory(recentRows?.results || [], homeName),
        away: deriveHistory(recentRows?.results || [], awayName),
      },
      headToHeadHistory:
        h2hTotal > 0 ? `${homeName} ${h2hHomeWins}-${h2hTotal - h2hHomeWins} last ${h2hTotal}` : null,
      weather: null,
      newsBriefs: extractPreviewBriefs(preview?.preview_content),
      propLines: [],
      propLineMovement: [],
      sourceRefs: [
        "providers_live_game_feed",
        "odds_snapshots",
        "odds_opening",
        "ticket_handle_feed",
        providerResolved.providerFallbackReason ? `provider_fallback:${providerResolved.providerFallbackReason}` : "provider_primary",
      ],
      freshness: {
        generatedAt: new Date().toISOString(),
        dataAgeMinutes,
        isStale: dataAgeMinutes !== null ? dataAgeMinutes > 30 : false,
      },
    };
    gameCache.set(cacheKey, { at: Date.now(), value: builtFromProvider });
    return builtFromProvider;
  }

  let game = await db.prepare(`
    SELECT
      id,
      provider_game_id,
      sport,
      league,
      home_team_name,
      away_team_name,
      start_time,
      status,
      score_home AS home_score,
      score_away AS away_score
    FROM sdio_games
    WHERE provider_game_id IN (?, ?, ?, ?)
      OR CAST(id AS TEXT) IN (?, ?, ?, ?)
      OR provider_game_id LIKE ?
    LIMIT 1
  `).bind(primary, alt1, alt2, alt3, primary, alt1, alt2, alt3, `%${tail}`).first<GameRow>();
  if (!game) {
    const matchup = parseMatchupTokens(query);
    if (matchup) {
      const sportHint = parseSportHint(gameId, query);
      const awayLike = `%${matchup.away.toUpperCase()}%`;
      const homeLike = `%${matchup.home.toUpperCase()}%`;
      const reverseAwayLike = `%${matchup.home.toUpperCase()}%`;
      const reverseHomeLike = `%${matchup.away.toUpperCase()}%`;
      game = await db.prepare(`
        SELECT
          id,
          provider_game_id,
          sport,
          league,
          home_team_name,
          away_team_name,
          start_time,
          status,
          score_home AS home_score,
          score_away AS away_score
        FROM sdio_games
        WHERE (? IS NULL OR UPPER(sport) = ?)
          AND start_time >= datetime('now', '-36 hours')
          AND start_time <= datetime('now', '+36 hours')
          AND (
            (
              UPPER(COALESCE(away_team_name, '')) LIKE ?
              AND UPPER(COALESCE(home_team_name, '')) LIKE ?
            ) OR (
              UPPER(COALESCE(away_team_name, '')) LIKE ?
              AND UPPER(COALESCE(home_team_name, '')) LIKE ?
            ) OR (
              UPPER(COALESCE(away_team, '')) LIKE ?
              AND UPPER(COALESCE(home_team, '')) LIKE ?
            ) OR (
              UPPER(COALESCE(away_team, '')) LIKE ?
              AND UPPER(COALESCE(home_team, '')) LIKE ?
            )
          )
        ORDER BY ABS(strftime('%s', start_time) - strftime('%s', 'now')) ASC
        LIMIT 1
      `).bind(
        sportHint,
        sportHint,
        awayLike,
        homeLike,
        reverseAwayLike,
        reverseHomeLike,
        awayLike,
        homeLike,
        reverseAwayLike,
        reverseHomeLike
      ).first<GameRow>();
    }
  }
  if (!game) {
    gameCache.set(cacheKey, { at: Date.now(), value: null });
    return null;
  }

  const dbGameId = Number(game.id);
  const odds = await db.prepare(`
    SELECT spread_home, spread_away, total, moneyline_home, moneyline_away, open_spread
    FROM sdio_odds_current
    WHERE game_id = ?
    LIMIT 1
  `).bind(dbGameId).first<OddsRow>();

  const propsRows = await db.prepare(`
    SELECT player_name, prop_type, line_value, open_line_value, team
    FROM sdio_props_current
    WHERE game_id = ?
    ORDER BY ABS(COALESCE(line_value, 0) - COALESCE(open_line_value, line_value, 0)) DESC
    LIMIT 40
  `).bind(dbGameId).all() as QueryResults<PropRow>;

  const recentRows = await db.prepare(`
    SELECT
      home_team_name,
      away_team_name,
      score_home AS home_score,
      score_away AS away_score
    FROM sdio_games
    WHERE sport = ? AND (home_team_name = ? OR away_team_name = ? OR home_team_name = ? OR away_team_name = ?)
      AND score_home IS NOT NULL AND score_away IS NOT NULL
    ORDER BY start_time DESC
    LIMIT 30
  `).bind(
    game.sport,
    game.home_team_name,
    game.home_team_name,
    game.away_team_name,
    game.away_team_name
  ).all() as QueryResults<RecentGameRow>;

  const h2hRows = await db.prepare(`
    SELECT
      home_team_name,
      away_team_name,
      score_home AS home_score,
      score_away AS away_score
    FROM sdio_games
    WHERE ((home_team_name = ? AND away_team_name = ?) OR (home_team_name = ? AND away_team_name = ?))
      AND score_home IS NOT NULL AND score_away IS NOT NULL
    ORDER BY start_time DESC
    LIMIT 5
  `).bind(
    game.home_team_name,
    game.away_team_name,
    game.away_team_name,
    game.home_team_name
  ).all() as QueryResults<RecentGameRow>;

  const preview = await db.prepare(`
    SELECT preview_content, updated_at
    FROM coach_g_previews
    WHERE game_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(String(game.provider_game_id || game.id)).first<PreviewRow>();

  const splits = await fetchSplits(env, String(game.provider_game_id || game.id));
  const homeSplit = splits.find((r) => r.side.toUpperCase().includes("HOME"));
  const awaySplit = splits.find((r) => r.side.toUpperCase().includes("AWAY"));

  const spread = toNum(odds?.spread_home);
  const openingSpread = toNum(odds?.open_spread);
  const lineMovement = spread !== null && openingSpread !== null ? Number((spread - openingSpread).toFixed(2)) : 0;

  const propLines = (propsRows.results || [])
    .map((r) => ({
      player: String(r.player_name || ""),
      teamId: r.team ? String(r.team) : null,
      teamName: r.team ? String(r.team) : null,
      propType: String(r.prop_type || "OTHER"),
      line: Number(r.line_value || 0),
      openLine: toNum(r.open_line_value),
    }))
    .filter((row) => row.player && Number.isFinite(row.line));

  const propLineMovement = propLines
    .map((r) => ({
      player: r.player,
      propType: r.propType,
      movement: r.openLine !== null ? Number((r.line - r.openLine).toFixed(2)) : 0,
    }))
    .filter((r) => Math.abs(r.movement) > 0);

  const startMs = game.start_time ? new Date(String(game.start_time)).getTime() : NaN;
  const dataAgeMinutes = Number.isFinite(startMs) ? Math.max(0, Math.round((Date.now() - startMs) / 60000)) : null;

  const homeRecent = deriveHistory(recentRows?.results || [], String(game.home_team_name || game.home_team_code || ""));
  const awayRecent = deriveHistory(recentRows?.results || [], String(game.away_team_name || game.away_team_code || ""));

  const h2hTotal = Array.isArray(h2hRows.results) ? h2hRows.results.length : 0;
  let h2hHomeWins = 0;
  for (const row of (h2hRows.results || [])) {
    const homeWon = Number(row.home_score) > Number(row.away_score);
    const coachHomeWon = homeWon
      ? row.home_team_name === game.home_team_name
      : row.away_team_name === game.home_team_name;
    if (coachHomeWon) h2hHomeWins += 1;
  }

  const built: GameContext = {
    gameId: String(game.provider_game_id || game.id),
    sport: mapSport(game.sport),
    league: game.league ? String(game.league) : null,
    homeTeam: String(game.home_team_name || game.home_team_code || "HOME"),
    awayTeam: String(game.away_team_name || game.away_team_code || "AWAY"),
    startTime: game.start_time ? String(game.start_time) : null,
    status: game.status ? String(game.status) : null,
    score: {
      home: toNum(game.home_score),
      away: toNum(game.away_score),
    },
    spread,
    moneyline: {
      home: toNum(odds?.moneyline_home),
      away: toNum(odds?.moneyline_away),
    },
    total: toNum(odds?.total),
    openingLine: {
      spread: openingSpread,
      total: toNum(odds?.total),
      moneylineHome: toNum(odds?.moneyline_home),
      moneylineAway: toNum(odds?.moneyline_away),
    },
    currentLine: {
      spread,
      total: toNum(odds?.total),
      moneylineHome: toNum(odds?.moneyline_home),
      moneylineAway: toNum(odds?.moneyline_away),
    },
    lineMovement,
    publicBettingPercentage: {
      home: homeSplit?.tickets_pct ?? null,
      away: awaySplit?.tickets_pct ?? null,
    },
    moneyPercentage: {
      home: homeSplit?.handle_pct ?? null,
      away: awaySplit?.handle_pct ?? null,
    },
    injuries: [],
    projectedLineups: [],
    restDays: { home: null, away: null },
    travelDistance: { home: null, away: null },
    backToBack: { home: false, away: false },
    recentForm: { home: homeRecent, away: awayRecent },
    headToHeadHistory:
      h2hTotal > 0 ? `${game.home_team_name} ${h2hHomeWins}-${h2hTotal - h2hHomeWins} last ${h2hTotal}` : null,
    weather: null,
    newsBriefs: extractPreviewBriefs(preview?.preview_content),
    propLines,
    propLineMovement,
    sourceRefs: ["sdio_games", "sdio_odds_current", "sdio_props_current", "ticket_handle_feed"],
    freshness: {
      generatedAt: new Date().toISOString(),
      dataAgeMinutes,
      isStale: dataAgeMinutes !== null ? dataAgeMinutes > 30 : false,
    },
  };
  gameCache.set(cacheKey, { at: Date.now(), value: built });
  return built;
}

export async function getTeamContext(gameContext: GameContext): Promise<TeamContext[]> {
  return [
    {
      teamId: gameContext.homeTeam,
      sport: gameContext.sport,
      name: gameContext.homeTeam,
      standings: null,
      recentForm: gameContext.recentForm.home,
      injuries: gameContext.injuries.filter((i) => i.entityId === gameContext.homeTeam),
      homeAwaySplits: null,
      scheduleDensity: null,
      streaks: null,
      teamTrends: [],
    },
    {
      teamId: gameContext.awayTeam,
      sport: gameContext.sport,
      name: gameContext.awayTeam,
      standings: null,
      recentForm: gameContext.recentForm.away,
      injuries: gameContext.injuries.filter((i) => i.entityId === gameContext.awayTeam),
      homeAwaySplits: null,
      scheduleDensity: null,
      streaks: null,
      teamTrends: [],
    },
  ];
}

export async function getPlayerContext(gameContext: GameContext): Promise<PlayerContext[]> {
  return gameContext.propLines.slice(0, 20).map((line) => {
    const movement = gameContext.propLineMovement.find((m) => m.player === line.player && m.propType === line.propType);
    return {
      playerId: line.player,
      sport: gameContext.sport,
      teamId: line.teamId,
      status: null,
      recentGames: [],
      seasonStats: [],
      matchupSplits: [],
      injuryStatus: null,
      projectedProps: [{ propType: line.propType, line: line.line }],
      propHistory: [{ propType: line.propType, movement: movement?.movement || 0 }],
      usageTrend: null,
      minutesTrend: null,
    };
  });
}

export async function getMarketContext(gameContext: GameContext): Promise<MarketContext> {
  const movementHistory = [
    {
      at: gameContext.freshness.generatedAt,
      spread: gameContext.currentLine.spread,
      total: gameContext.currentLine.total,
    },
  ];
  return {
    marketId: `market:${gameContext.gameId}`,
    gameId: gameContext.gameId,
    currentOdds: gameContext.currentLine,
    openingOdds: gameContext.openingLine,
    movementHistory,
    publicBetting: gameContext.publicBettingPercentage,
    moneySplits: gameContext.moneyPercentage,
    sportsbookComparisons: [],
    sharpIndicators: parseSharpIndicators(
      [
        {
          market: "spread",
          side: "home",
          tickets_pct: gameContext.publicBettingPercentage.home,
          handle_pct: gameContext.moneyPercentage.home,
        },
        {
          market: "spread",
          side: "away",
          tickets_pct: gameContext.publicBettingPercentage.away,
          handle_pct: gameContext.moneyPercentage.away,
        },
      ]
    ),
  };
}

export async function getUserContext(db: Db, userId: string | null): Promise<UserContext> {
  const key = String(userId || "anonymous");
  const cached = fromCache(userCache, key);
  if (cached) return cached;

  if (!userId) {
    const anon: UserContext = {
      userId: null,
      favoriteTeams: [],
      favoriteSports: [],
      trackedPlayers: [],
      watchboards: [],
      preferredMarkets: [],
      riskProfile: null,
      engagementHistory: [],
    };
    userCache.set(key, { at: Date.now(), value: anon });
    return anon;
  }

  const settings = await db.prepare(`
    SELECT setting_key, setting_value
    FROM user_settings
    WHERE user_id = ? AND data_scope = 'PROD'
      AND setting_key IN ('favorite_sports', 'followed_teams', 'followed_players')
  `).bind(userId).all() as QueryResults<UserSettingRow>;

  const map = new Map<string, string>();
  for (const row of (settings.results || [])) {
    map.set(String(row.setting_key), String(row.setting_value || "[]"));
  }

  const parse = (k: string): string[] => {
    try {
      const parsed = JSON.parse(map.get(k) || "[]");
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  };

  const built: UserContext = {
    userId,
    favoriteTeams: parse("followed_teams"),
    favoriteSports: parse("favorite_sports"),
    trackedPlayers: parse("followed_players"),
    watchboards: [],
    preferredMarkets: ["spread", "moneyline", "total", "props"],
    riskProfile: null,
    engagementHistory: [],
  };
  userCache.set(key, { at: Date.now(), value: built });
  return built;
}

export async function buildContextPackage(params: {
  db: Db;
  env: Env;
  userId: string | null;
  gameId?: string;
  query?: string;
}): Promise<CoachGContextPackage> {
  const { db, env, userId, gameId, query } = params;
  const gameContext = gameId ? await getGameContext(db, env, gameId, query) : null;
  const [userContext, teamContext, playerContext, marketContext] = await Promise.all([
    getUserContext(db, userId),
    gameContext ? getTeamContext(gameContext) : Promise.resolve([]),
    gameContext ? getPlayerContext(gameContext) : Promise.resolve([]),
    gameContext ? getMarketContext(gameContext) : Promise.resolve(null),
  ]);

  return {
    gameContext,
    teamContext,
    playerContext,
    marketContext,
    userContext,
  };
}
