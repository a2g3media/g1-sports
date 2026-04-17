import { fetchGamesWithFallback } from "../providers";
import { fetchGamePlayerProps } from "../sportsRadarOddsService";
import { getTodayEasternDateString } from "../dateUtils";
import { insertHistoricalPropSnapshot } from "./snapshotStore";
import { normalizeHistoricalSport, type HistoricalSportKey } from "../../../shared/historicalStatTypeRegistry";
import { runHistoricalArchivePostIngestionJobs } from "./jobCoordinator";
import { resolveCanonicalPlayerIdFromPayload } from "../../../shared/espnAthleteIdLookup";

type Bindings = {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
  SPORTSRADAR_PLAYER_PROPS_KEY?: string;
  SPORTSRADAR_PROPS_KEY?: string;
};

type LoopConfig = {
  enabled: boolean;
  intervalSeconds: number;
  sports: Record<HistoricalSportKey, boolean>;
};

type LoopStats = {
  lastRunAt: string | null;
  lastError: string | null;
  capturedSnapshots: number;
  processedGames: number;
  processedProps: number;
  verifiedLinesLocked: number;
  gradedLines: number;
};

const PROVIDER_SPORT_MAP: Partial<Record<HistoricalSportKey, "nba" | "nfl" | "mlb" | "nhl" | "ncaab" | "ncaaf" | "soccer">> = {
  NBA: "nba",
  NFL: "nfl",
  MLB: "mlb",
  NHL: "nhl",
  NCAAB: "ncaab",
  NCAAF: "ncaaf",
  SOCCER: "soccer",
};

const DEFAULT_CONFIG: LoopConfig = {
  enabled: false,
  intervalSeconds: 20,
  sports: {
    NBA: true,
    NFL: true,
    MLB: true,
    NHL: true,
    SOCCER: true,
    NCAAB: true,
    NCAAF: true,
    GOLF: false,
    MMA: false,
    BOXING: false,
    TENNIS: false,
    NASCAR: false,
  },
};

const DEFAULT_STATS: LoopStats = {
  lastRunAt: null,
  lastError: null,
  capturedSnapshots: 0,
  processedGames: 0,
  processedProps: 0,
  verifiedLinesLocked: 0,
  gradedLines: 0,
};

type IngestionPropRow = {
  player_name: string;
  player_id?: string | null;
  team?: string | null;
  prop_type: string;
  line: number;
  over_odds?: number | null;
  under_odds?: number | null;
  sportsbook?: string | null;
};

function normalizeMatchToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function readCurrentPropsForProviderGame(params: {
  db: D1Database;
  sport: string;
  providerGameId: string;
}): Promise<IngestionPropRow[]> {
  const rows = await params.db.prepare(`
    SELECT
      p.player_name,
      p.team,
      p.prop_type,
      p.line_value,
      NULL AS over_odds,
      NULL AS under_odds,
      'current_store' AS sportsbook
    FROM sdio_props_current p
    JOIN sdio_games g ON g.id = p.game_id
    WHERE UPPER(COALESCE(g.sport, '')) = ?
      AND g.provider_game_id = ?
      AND p.line_value IS NOT NULL
  `).bind(String(params.sport || "").toUpperCase(), params.providerGameId).all<{
    player_name: string;
    team: string | null;
    prop_type: string;
    line_value: number;
    over_odds: number | null;
    under_odds: number | null;
    sportsbook: string | null;
  }>();

  return (rows.results || [])
    .map((row) => ({
      player_name: String(row.player_name || "").trim(),
      team: row.team,
      prop_type: String(row.prop_type || "").trim(),
      line: Number(row.line_value),
      over_odds: row.over_odds ?? null,
      under_odds: row.under_odds ?? null,
      sportsbook: row.sportsbook ?? "current_store",
    }))
    .filter((row) => row.player_name && row.prop_type && Number.isFinite(row.line));
}

async function resolveSportradarProviderGameIdFromLocalStore(params: {
  db: D1Database;
  sport: string;
  gameStartTime: string | null;
  homeTeam: string;
  awayTeam: string;
}): Promise<string | null> {
  const homeToken = normalizeMatchToken(params.homeTeam);
  const awayToken = normalizeMatchToken(params.awayTeam);
  if (!homeToken || !awayToken || !params.gameStartTime) return null;

  const rows = await params.db.prepare(`
    SELECT
      provider_game_id,
      start_time,
      COALESCE(home_team_name, home_team, '') AS home_name,
      COALESCE(away_team_name, away_team, '') AS away_name
    FROM sdio_games
    WHERE UPPER(COALESCE(sport, '')) = ?
      AND provider_game_id LIKE 'sr:sport_event:%'
      AND start_time IS NOT NULL
    ORDER BY ABS(strftime('%s', start_time) - strftime('%s', ?)) ASC
    LIMIT 40
  `).bind(String(params.sport || "").toUpperCase(), params.gameStartTime).all<{
    provider_game_id: string;
    start_time: string;
    home_name: string;
    away_name: string;
  }>();

  let best: { score: number; providerGameId: string } | null = null;
  for (const row of rows.results || []) {
    const rowHome = normalizeMatchToken(row.home_name);
    const rowAway = normalizeMatchToken(row.away_name);
    const homeMatch = rowHome.includes(homeToken) || homeToken.includes(rowHome);
    const awayMatch = rowAway.includes(awayToken) || awayToken.includes(rowAway);
    const crossHomeMatch = rowHome.includes(awayToken) || awayToken.includes(rowHome);
    const crossAwayMatch = rowAway.includes(homeToken) || homeToken.includes(rowAway);
    const exactPair = homeMatch && awayMatch;
    const swappedPair = crossHomeMatch && crossAwayMatch;
    if (!exactPair && !swappedPair) continue;
    const score = exactPair ? 2 : 1;
    if (!best || score > best.score) {
      best = { score, providerGameId: String(row.provider_game_id || "").trim() };
      if (score === 2) break;
    }
  }
  return best?.providerGameId || null;
}

async function runIngestionCycle(env: Bindings, config: LoopConfig): Promise<LoopStats> {
  const key = env.SPORTSRADAR_PLAYER_PROPS_KEY || env.SPORTSRADAR_PROPS_KEY || env.SPORTSRADAR_API_KEY;
  if (!env.DB || !key) {
    return {
      ...DEFAULT_STATS,
      lastRunAt: new Date().toISOString(),
      lastError: "missing_db_or_props_key",
    };
  }

  let capturedSnapshots = 0;
  let processedGames = 0;
  let processedProps = 0;
  let verifiedLinesLocked = 0;
  let gradedLines = 0;
  const today = getTodayEasternDateString();
  const providerRawCounts: Record<string, number> = {};
  const normalizedCounts: Record<string, number> = {};
  const snapshotAttemptCounts: Record<string, number> = {};

  for (const [sportRaw, enabled] of Object.entries(config.sports)) {
    if (!enabled) continue;
    const sport = normalizeHistoricalSport(sportRaw);
    if (!sport) continue;
    const providerSport = PROVIDER_SPORT_MAP[sport];
    if (!providerSport) continue; // scaffolded sports stay disabled until adapter exists

    const feed = await fetchGamesWithFallback(providerSport, { date: today });
    const games = Array.isArray(feed.data) ? feed.data : [];
    for (const game of games) {
      processedGames += 1;
      const providerGameId = String(game?.game_id || "").trim();
      if (!providerGameId) continue;
      const home = String(game?.home_team_name || game?.home_team_code || "").trim();
      const away = String(game?.away_team_name || game?.away_team_code || "").trim();
      const start = String(game?.start_time || "").trim() || null;
      const league = String(game?.league || sport).trim() || sport;

      const providerProps = await fetchGamePlayerProps(
        providerGameId,
        providerSport,
        home,
        away,
        key,
        String(game?.status || "SCHEDULED")
      );
      providerRawCounts[sport] = (providerRawCounts[sport] || 0) + (Array.isArray(providerProps) ? providerProps.length : 0);
      let props: IngestionPropRow[] = Array.isArray(providerProps) ? providerProps : [];
      // Providers currently return ESPN IDs for some slates. When per-event SportsRadar lookups
      // cannot resolve these IDs, ingest from the already-refreshed live props store for the exact game.
      if (props.length === 0 && providerGameId.startsWith("espn_")) {
        const mappedProviderGameId = await resolveSportradarProviderGameIdFromLocalStore({
          db: env.DB,
          sport,
          gameStartTime: start,
          homeTeam: home,
          awayTeam: away,
        });
        props = await readCurrentPropsForProviderGame({
          db: env.DB,
          sport,
          providerGameId: mappedProviderGameId || providerGameId,
        });
      }
      normalizedCounts[sport] = (normalizedCounts[sport] || 0) + props.length;
      if (!Array.isArray(props) || props.length === 0) continue;

      for (const row of props) {
        processedProps += 1;
        const lineValue = Number(row?.line);
        if (!Number.isFinite(lineValue)) continue;
        const resolvedPlayerProviderId =
          String(row?.player_id || "").trim() ||
          resolveCanonicalPlayerIdFromPayload(String(row?.player_name || ""), String(sport || "").toUpperCase()) ||
          null;
        const result = await insertHistoricalPropSnapshot(env.DB, {
          sport,
          league,
          eventId: providerGameId,
          gameId: providerGameId,
          gameStartTime: start,
          playerName: String(row?.player_name || "").trim() || null,
          playerProviderId: resolvedPlayerProviderId,
          teamName: home || null,
          opponentTeamName: away || null,
          statType: String(row?.prop_type || "").trim(),
          marketType: String(row?.prop_type || "").trim(),
          lineValue,
          overPrice: Number.isFinite(Number(row?.over_odds)) ? Number(row.over_odds) : null,
          underPrice: Number.isFinite(Number(row?.under_odds)) ? Number(row.under_odds) : null,
          sportsbook: String(row?.sportsbook || "").trim() || "unknown",
          capturedAt: new Date().toISOString(),
          rawPayload: row,
        });
        snapshotAttemptCounts[sport] = (snapshotAttemptCounts[sport] || 0) + 1;
        if (result.inserted) capturedSnapshots += 1;
      }
    }
  }

  console.log("[historicalLines] ingestion stage counts", {
    providerRawCounts,
    normalizedCounts,
    snapshotAttemptCounts,
    capturedSnapshots,
  });

  const jobs = await runHistoricalArchivePostIngestionJobs({
    db: env.DB,
    runKey: `do:${new Date().toISOString().slice(0, 16)}`,
  });
  verifiedLinesLocked = jobs.metrics.verifiedLinesLocked;
  gradedLines = jobs.metrics.gradedLines;

  return {
    lastRunAt: new Date().toISOString(),
    lastError: null,
    capturedSnapshots,
    processedGames,
    processedProps,
    verifiedLinesLocked,
    gradedLines,
  };
}

export class HistoricalIngestionLoopDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Bindings
  ) {}

  private async getConfig(): Promise<LoopConfig> {
    const stored = await this.state.storage.get<LoopConfig>("config");
    return {
      ...DEFAULT_CONFIG,
      ...(stored || {}),
      sports: {
        ...DEFAULT_CONFIG.sports,
        ...(stored?.sports || {}),
      },
    };
  }

  private async setConfig(partial: Partial<LoopConfig>): Promise<LoopConfig> {
    const current = await this.getConfig();
    const next: LoopConfig = {
      ...current,
      ...partial,
      sports: {
        ...current.sports,
        ...(partial.sports || {}),
      },
    };
    await this.state.storage.put("config", next);
    return next;
  }

  private async setStats(stats: LoopStats): Promise<void> {
    await this.state.storage.put("stats", stats);
  }

  private async getStats(): Promise<LoopStats> {
    return (await this.state.storage.get<LoopStats>("stats")) || DEFAULT_STATS;
  }

  private async scheduleNext(config: LoopConfig): Promise<void> {
    if (!config.enabled) return;
    const next = Date.now() + Math.max(10, config.intervalSeconds) * 1000;
    await this.state.storage.setAlarm(next);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname.endsWith("/status")) {
      const [config, stats] = await Promise.all([this.getConfig(), this.getStats()]);
      return Response.json({ ok: true, config, stats });
    }

    if (pathname.endsWith("/start")) {
      const config = await this.setConfig({ enabled: true });
      await this.scheduleNext(config);
      return Response.json({ ok: true, config });
    }

    if (pathname.endsWith("/stop")) {
      const config = await this.setConfig({ enabled: false });
      await this.state.storage.deleteAlarm();
      return Response.json({ ok: true, config });
    }

    if (pathname.endsWith("/config") && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as Partial<LoopConfig>;
      const config = await this.setConfig({
        intervalSeconds: Number.isFinite(Number(body.intervalSeconds))
          ? Math.max(10, Number(body.intervalSeconds))
          : undefined,
        sports: body.sports,
      });
      if (config.enabled) await this.scheduleNext(config);
      return Response.json({ ok: true, config });
    }

    if (pathname.endsWith("/tick")) {
      const config = await this.getConfig();
      const stats = await runIngestionCycle(this.env, config);
      await this.setStats(stats);
      return Response.json({ ok: true, stats });
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  async alarm(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled) return;
    try {
      const stats = await runIngestionCycle(this.env, config);
      await this.setStats(stats);
    } catch (error) {
      await this.setStats({
        ...(await this.getStats()),
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.scheduleNext(config);
    }
  }
}
