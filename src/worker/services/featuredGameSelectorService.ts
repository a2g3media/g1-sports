type QueryResults<T> = { results?: T[] };

export interface FeaturedGameSelectionInput {
  db: D1Database;
  dateKey?: string;
  enabledSports?: string[];
  perSport?: number;
}

export interface FeaturedGameSelection {
  sport: string;
  gameId: string;
  gamePk: number | null;
  homeTeam: string;
  awayTeam: string;
  league: string | null;
  startTime: string | null;
  score: number;
  factors: {
    movementScore: number;
    newsScore: number;
    propsScore: number;
    marketScore: number;
    timingScore: number;
  };
}

interface CandidateRow {
  id: number;
  provider_game_id: string | null;
  sport: string | null;
  league: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team: string | null;
  away_team: string | null;
  start_time: string | null;
  movement_spread: number | null;
  movement_total: number | null;
  odds_snapshots: number | null;
  props_count: number | null;
  preview_word_count: number | null;
  preview_updated_at: string | null;
}

function normalizeSport(value: string | null | undefined): string {
  if (!value) return "unknown";
  return value.trim().toLowerCase();
}

function buildDateKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function toNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function calculateTimingScore(startTime: string | null): number {
  if (!startTime) return 0.2;
  const ts = new Date(startTime).getTime();
  if (Number.isNaN(ts)) return 0.2;
  const diffHours = Math.abs((ts - Date.now()) / 3_600_000);
  if (diffHours <= 6) return 1;
  if (diffHours <= 18) return 0.8;
  if (diffHours <= 36) return 0.55;
  return 0.25;
}

function scoreCandidate(row: CandidateRow): FeaturedGameSelection["factors"] & { total: number } {
  const movementSpread = Math.abs(toNumber(row.movement_spread));
  const movementTotal = Math.abs(toNumber(row.movement_total));
  const movementScore = Math.min(1, (movementSpread * 0.6 + movementTotal * 0.3) / 4);

  const previewWords = Math.max(0, toNumber(row.preview_word_count));
  const newsScore = Math.min(1, previewWords / 1200);

  const propsCount = Math.max(0, toNumber(row.props_count));
  const propsScore = Math.min(1, propsCount / 40);

  const snapshotCount = Math.max(0, toNumber(row.odds_snapshots));
  const marketScore = Math.min(1, snapshotCount / 30);

  const timingScore = calculateTimingScore(row.start_time);

  const total =
    movementScore * 0.30 +
    newsScore * 0.25 +
    propsScore * 0.20 +
    marketScore * 0.15 +
    timingScore * 0.10;

  return {
    movementScore,
    newsScore,
    propsScore,
    marketScore,
    timingScore,
    total: Number(total.toFixed(4)),
  };
}

export async function selectFeaturedGamesBySport(input: FeaturedGameSelectionInput): Promise<FeaturedGameSelection[]> {
  const { db } = input;
  const perSport = Math.max(1, Math.min(3, Number(input.perSport || 1)));
  const enabledSports = (input.enabledSports || []).map((s) => s.toLowerCase());
  const dateKey = input.dateKey || buildDateKey();

  const localToday = await db.prepare(`
    SELECT
      g.id,
      g.provider_game_id,
      g.sport,
      g.league,
      g.home_team_name,
      g.away_team_name,
      g.home_team,
      g.away_team,
      g.start_time,
      o.movement_spread,
      o.movement_total,
      (
        SELECT COUNT(*)
        FROM sdio_odds_history h
        WHERE h.game_id = g.id
          AND h.recorded_at >= datetime('now', '-24 hours')
      ) AS odds_snapshots,
      (
        SELECT COUNT(*)
        FROM sdio_props_current p
        WHERE p.game_id = g.id
      ) AS props_count,
      (
        SELECT word_count
        FROM coach_g_previews cp
        WHERE cp.game_id = CAST(g.provider_game_id AS TEXT)
        LIMIT 1
      ) AS preview_word_count,
      (
        SELECT updated_at
        FROM coach_g_previews cp
        WHERE cp.game_id = CAST(g.provider_game_id AS TEXT)
        LIMIT 1
      ) AS preview_updated_at
    FROM sdio_games g
    LEFT JOIN sdio_odds_current o ON o.game_id = g.id
    WHERE g.provider_game_id IS NOT NULL
      AND DATE(g.start_time, 'localtime') = DATE('now', 'localtime')
    ORDER BY g.start_time ASC
    LIMIT 500
  `).all<QueryResults<CandidateRow>>();

  const fallbackUpcoming = await db.prepare(`
    SELECT
      g.id,
      g.provider_game_id,
      g.sport,
      g.league,
      g.home_team_name,
      g.away_team_name,
      g.home_team,
      g.away_team,
      g.start_time,
      o.movement_spread,
      o.movement_total,
      (
        SELECT COUNT(*)
        FROM sdio_odds_history h
        WHERE h.game_id = g.id
          AND h.recorded_at >= datetime('now', '-24 hours')
      ) AS odds_snapshots,
      (
        SELECT COUNT(*)
        FROM sdio_props_current p
        WHERE p.game_id = g.id
      ) AS props_count,
      (
        SELECT word_count
        FROM coach_g_previews cp
        WHERE cp.game_id = CAST(g.provider_game_id AS TEXT)
        LIMIT 1
      ) AS preview_word_count,
      (
        SELECT updated_at
        FROM coach_g_previews cp
        WHERE cp.game_id = CAST(g.provider_game_id AS TEXT)
        LIMIT 1
      ) AS preview_updated_at
    FROM sdio_games g
    LEFT JOIN sdio_odds_current o ON o.game_id = g.id
    WHERE g.provider_game_id IS NOT NULL
      AND g.start_time >= datetime('now', '-3 hours')
      AND g.start_time <= datetime('now', '+36 hours')
    ORDER BY g.start_time ASC
    LIMIT 500
  `).all<QueryResults<CandidateRow>>();

  const recentFallback = await db.prepare(`
    SELECT
      g.id,
      g.provider_game_id,
      g.sport,
      g.league,
      g.home_team_name,
      g.away_team_name,
      g.home_team,
      g.away_team,
      g.start_time,
      o.movement_spread,
      o.movement_total,
      (
        SELECT COUNT(*)
        FROM sdio_odds_history h
        WHERE h.game_id = g.id
          AND h.recorded_at >= datetime('now', '-24 hours')
      ) AS odds_snapshots,
      (
        SELECT COUNT(*)
        FROM sdio_props_current p
        WHERE p.game_id = g.id
      ) AS props_count,
      (
        SELECT word_count
        FROM coach_g_previews cp
        WHERE cp.game_id = CAST(g.provider_game_id AS TEXT)
        LIMIT 1
      ) AS preview_word_count,
      (
        SELECT updated_at
        FROM coach_g_previews cp
        WHERE cp.game_id = CAST(g.provider_game_id AS TEXT)
        LIMIT 1
      ) AS preview_updated_at
    FROM sdio_games g
    LEFT JOIN sdio_odds_current o ON o.game_id = g.id
    WHERE g.provider_game_id IS NOT NULL
    ORDER BY g.start_time DESC
    LIMIT 300
  `).all<QueryResults<CandidateRow>>();

  const preferredSet = (localToday.results || []).length > 0
    ? (localToday.results || [])
    : (fallbackUpcoming.results || []).length > 0
      ? (fallbackUpcoming.results || [])
      : (recentFallback.results || []);

  const ranked: FeaturedGameSelection[] = preferredSet
    .filter((row) => Boolean(row.provider_game_id))
    .map((row) => {
      const factors = scoreCandidate(row);
      const sport = normalizeSport(row.sport);
      return {
        sport,
        gameId: String(row.provider_game_id || ""),
        gamePk: Number.isFinite(row.id) ? Number(row.id) : null,
        homeTeam: String(row.home_team_name || row.home_team || "Home"),
        awayTeam: String(row.away_team_name || row.away_team || "Away"),
        league: row.league || null,
        startTime: row.start_time || null,
        score: factors.total,
        factors: {
          movementScore: factors.movementScore,
          newsScore: factors.newsScore,
          propsScore: factors.propsScore,
          marketScore: factors.marketScore,
          timingScore: factors.timingScore,
        },
      };
    })
    .filter((row) => row.gameId.length > 0)
    .filter((row) => enabledSports.length === 0 || enabledSports.includes(row.sport))
    .sort((a, b) => b.score - a.score);

  const chosen: FeaturedGameSelection[] = [];
  const bySport = new Map<string, number>();
  for (const item of ranked) {
    const key = item.sport;
    const count = bySport.get(key) || 0;
    if (count >= perSport) continue;
    if (!dateKey || dateKey.length > 0) {
      chosen.push(item);
      bySport.set(key, count + 1);
    }
  }

  return chosen;
}

