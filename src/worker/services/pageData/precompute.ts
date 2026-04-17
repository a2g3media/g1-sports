import { getCachedData, makeCacheKey, setCachedData } from "../apiCacheService";
import { ACTIVE_SPORT_CACHE_KEY } from "./cacheConfig";
import { setCounter } from "./rolloutMetrics";

export type WarmFetchResult = {
  ok: boolean;
  status: number;
  body: any;
};

export type WarmFetchFn = (pathWithQuery: string) => Promise<WarmFetchResult>;

const TOP_SPORTS = ["NBA", "NFL", "MLB", "NHL", "NCAAB", "SOCCER"] as const;
const PROFILE_SPORTS = ["NBA", "NFL", "MLB", "NHL", "NCAAB"] as const;
const SEEDED_PLAYER_NAMES: Record<string, string[]> = {
  NBA: [
    "LeBron James",
    "Stephen Curry",
    "Nikola Jokic",
    "Luka Doncic",
    "Shai Gilgeous-Alexander",
    "Jayson Tatum",
    "Giannis Antetokounmpo",
    "Kevin Durant",
    "Damian Lillard",
    "DeMar DeRozan",
  ],
  NFL: [
    "Patrick Mahomes",
    "Josh Allen",
    "Lamar Jackson",
    "Joe Burrow",
    "Jalen Hurts",
    "Christian McCaffrey",
    "Tyreek Hill",
    "Justin Jefferson",
    "CeeDee Lamb",
    "Travis Kelce",
  ],
  MLB: [
    "Shohei Ohtani",
    "Aaron Judge",
    "Mookie Betts",
    "Juan Soto",
    "Ronald Acuna Jr",
    "Freddie Freeman",
    "Bryce Harper",
    "Corey Seager",
  ],
  NHL: [
    "Connor McDavid",
    "Nathan MacKinnon",
    "Auston Matthews",
    "David Pastrnak",
    "Leon Draisaitl",
    "Artemi Panarin",
  ],
  NCAAB: [
    "Cooper Flagg",
    "RJ Luis",
    "Zakai Zeigler",
    "LJ Cryer",
    "Hunter Dickinson",
    "Mark Sears",
  ],
};

export type PageDataWarmLane = "live" | "core" | "depth" | "full";

type SweepCursorState = {
  sportIndex: number;
  teamIndexBySport: Record<string, number>;
};

type PlayerCoverageRegistry = {
  knownPlayerKeys: string[];
  warmedPlayerKeys: string[];
};

const SWEEP_CURSOR_CACHE_KEY = makeCacheKey("page-data-warm", "player-sweep-cursor-v1");
const PLAYER_REGISTRY_CACHE_KEY = makeCacheKey("page-data-warm", "player-coverage-registry-v1");
const REGISTRY_TTL_SECONDS = 30 * 24 * 60 * 60;

function todayEtYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeGameId(value: unknown): string {
  return String(value || "").trim();
}

function normalizePlayerName(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((part) => String(part || "").trim()).filter(Boolean);
    const combined = [first, last].filter(Boolean).join(" ").trim();
    return combined || raw;
  }
  return raw;
}

function buildPlayerNameCandidates(value: string): string[] {
  const raw = normalizePlayerName(value);
  if (!raw) return [];
  const out = new Set<string>([raw]);
  const noPunct = raw.replace(/[.'`]/g, "").trim();
  if (noPunct) out.add(noPunct);
  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((part) => String(part || "").trim()).filter(Boolean);
    const fl = [first, last].filter(Boolean).join(" ").trim();
    if (fl) out.add(fl);
  } else {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const lf = `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`.trim();
      if (lf) out.add(lf);
    }
  }
  const noSuffix = raw.replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, "").replace(/\s+/g, " ").trim();
  if (noSuffix) out.add(noSuffix);
  return Array.from(out);
}

/**
 * Same player-name field coverage as page-data `extractVisiblePlayerNamesBySportFromGames`
 * (props pages, game rows, lineups, pitchers). Emits `SPORT|||Normalized Name` tokens.
 */
function collectPlayerTokensFromGameRows(games: any[]): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const g of Array.isArray(games) ? games : []) {
    const s = String(g?.sport || "").trim().toUpperCase();
    if (!s || s === "ALL") continue;
    const addName = (raw: unknown) => {
      const name = normalizePlayerName(String(raw || ""));
      if (!name) return;
      const tok = `${s}|||${name}`;
      if (seen.has(tok)) return;
      seen.add(tok);
      tokens.push(tok);
    };
    const fromRow = (row: any) => {
      addName(
        row?.player_name ?? row?.playerName ?? row?.full_name ?? row?.display_name ?? row?.name ?? ""
      );
    };
    for (const k of ["home_pitcher", "away_pitcher", "starting_pitcher_home", "starting_pitcher_away"] as const) {
      const v = g?.[k];
      if (typeof v === "string") addName(v);
      else if (v && typeof v === "object") fromRow(v);
    }
    const rowArrays = [
      ...(Array.isArray(g?.props) ? g.props : []),
      ...(Array.isArray(g?.player_props) ? g.player_props : []),
      ...(Array.isArray(g?.featured_props) ? g.featured_props : []),
      ...(Array.isArray(g?.starting_lineups?.home) ? g.starting_lineups.home : []),
      ...(Array.isArray(g?.starting_lineups?.away) ? g.starting_lineups.away : []),
    ];
    for (const row of rowArrays) fromRow(row);
  }
  return tokens;
}

function normalizePlayerKey(sport: string, playerName: string): string {
  const compact = String(playerName || "")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return `${String(sport || "").trim().toUpperCase()}|||${compact}`;
}

function canonicalPlayerIdFromUnknown(id: unknown): string | null {
  const s = String(id ?? "").trim();
  return /^\d{4,}$/.test(s) ? s : null;
}

/** Resolve ESPN id via internal API before page-data/player-profile (name-only page-data is not allowed). */
async function resolveCanonicalPlayerIdForWarm(
  fetchFn: WarmFetchFn,
  sportUpper: string,
  playerName: string
): Promise<string | null> {
  const sport = String(sportUpper || "").trim().toUpperCase();
  const name = String(playerName || "").trim();
  if (!sport || !name) return null;

  const headshotPath = `/api/player/${encodeURIComponent(sport)}/${encodeURIComponent(name)}/headshot`;
  try {
    const res = await fetchFn(headshotPath);
    if (res.ok && res.body && typeof res.body === "object") {
      const j = res.body as { espnId?: string };
      const id = canonicalPlayerIdFromUnknown(j?.espnId);
      if (id) return id;
    }
  } catch {
    // continue
  }

  try {
    const rawPath = `/api/player/${encodeURIComponent(sport)}/${encodeURIComponent(name)}?pageData=1&fast=1`;
    const rawRes = await fetchFn(rawPath);
    if (rawRes.ok && rawRes.body && typeof rawRes.body === "object") {
      const j = rawRes.body as { error?: string; player?: { espnId?: string } };
      if (!j.error) {
        const id = canonicalPlayerIdFromUnknown(j?.player?.espnId);
        if (id) return id;
      }
    }
  } catch {
    // continue
  }

  try {
    const res = await fetchFn(`/api/player/search?q=${encodeURIComponent(name)}&sport=${encodeURIComponent(sport)}`);
    if (!res.ok || !res.body || typeof res.body !== "object") return null;
    const j = res.body as { results?: Array<{ espnId?: string; displayName?: string }> };
    const results = Array.isArray(j?.results) ? j.results : [];
    const lower = name.toLowerCase();
    for (const r of results) {
      const dn = String(r?.displayName || "").trim().toLowerCase();
      if (dn === lower) {
        const id = canonicalPlayerIdFromUnknown(r?.espnId);
        if (id) return id;
      }
    }
    for (const r of results) {
      const dn = String(r?.displayName || "").trim().toLowerCase();
      if (dn.includes(lower) || lower.includes(dn)) {
        const id = canonicalPlayerIdFromUnknown(r?.espnId);
        if (id) return id;
      }
    }
    if (results[0]) {
      return canonicalPlayerIdFromUnknown(results[0].espnId);
    }
  } catch {
    return null;
  }
  return null;
}

function defaultSweepCursorState(): SweepCursorState {
  return {
    sportIndex: 0,
    teamIndexBySport: {},
  };
}

function extractPlayerDisplayNames(body: any): string[] {
  const pools = [
    ...(Array.isArray(body?.roster) ? body.roster : []),
    ...(Array.isArray(body?.team?.roster) ? body.team.roster : []),
    ...(Array.isArray(body?.players) ? body.players : []),
    ...(Array.isArray(body?.team?.players) ? body.team.players : []),
  ];
  const out = new Set<string>();
  for (const row of pools) {
    const raw =
      row?.full_name ||
      row?.player_name ||
      row?.display_name ||
      row?.name ||
      row?.athlete?.full_name ||
      row?.athlete?.display_name ||
      "";
    const normalized = normalizePlayerName(raw);
    if (normalized) out.add(normalized);
  }
  return Array.from(out);
}

async function fetchRecentAndHighTrafficPlayers(
  db: D1Database
): Promise<Array<{ sport: string; playerName: string }>> {
  try {
    const rows = await db
      .prepare(`
        SELECT endpoint, data_json
        FROM api_cache
        WHERE provider = 'player-profile'
          AND expires_at > datetime('now')
        ORDER BY hit_count DESC, updated_at DESC
        LIMIT 220
      `)
      .all<{ endpoint: string; data_json: string }>();
    const out: Array<{ sport: string; playerName: string }> = [];
    const dedup = new Set<string>();
    for (const row of rows.results || []) {
      let sport = "";
      let fallbackName = "";
      const endpoint = String(row.endpoint || "");
      const slash = endpoint.indexOf("/");
      if (slash > 0) {
        sport = endpoint.slice(0, slash).trim().toUpperCase();
        fallbackName = decodeURIComponent(endpoint.slice(slash + 1)).trim();
      }
      let playerName = "";
      try {
        const parsed = JSON.parse(String(row.data_json || "{}"));
        playerName = String(
          parsed?.player?.displayName ||
            parsed?.player?.name ||
            parsed?.player?.full_name ||
            fallbackName
        ).trim();
      } catch {
        playerName = fallbackName;
      }
      playerName = normalizePlayerName(playerName);
      if (!sport || !playerName || !PROFILE_SPORTS.includes(sport as any)) continue;
      const key = `${sport}|||${playerName.toLowerCase()}`;
      if (dedup.has(key)) continue;
      dedup.add(key);
      out.push({ sport, playerName });
      if (out.length >= 160) break;
    }
    return out;
  } catch {
    return [];
  }
}

function isUsableWarmPayload(body: any): boolean {
  const route = String(body?.route || "").trim();
  if (!route) return false;
  if (body?.degraded === true) return false;

  if (route === "games") {
    const games = Array.isArray(body?.games) ? body.games.length : 0;
    const odds = Object.keys(body?.oddsSummaryByGame || {}).length;
    return games > 0 && odds > 0;
  }
  if (route === "odds") {
    const games = Array.isArray(body?.games) ? body.games.length : 0;
    const odds = Object.keys(body?.oddsSummaryByGame || {}).length;
    return games > 0 || odds > 0;
  }
  if (route === "sport-hub") {
    return Array.isArray(body?.games) && body.games.length > 0;
  }
  if (route === "game-detail") {
    return Boolean(body?.game || body?.oddsSummary);
  }
  if (route === "team-profile") {
    const team = body?.data?.profileJson?.team;
    const teamId = String(team?.id || "").trim();
    const teamName = String(team?.name || "").trim();
    if (!teamId && !teamName) return false;
    const standingsTeams = Array.isArray(body?.data?.standingsJson?.teams) ? body.data.standingsJson.teams : [];
    const splits = body?.data?.splitsJson?.splits;
    const record = body?.data?.profileJson?.team?.record;
    const hasRecordNumbers = Number.isFinite(Number(record?.wins)) || Number.isFinite(Number(record?.losses));
    return standingsTeams.length > 0 || Boolean(splits) || hasRecordNumbers;
  }
  if (route === "player-profile") {
    const profile = body?.data?.profile;
    if (!profile?.player) return false;
    const hasGameLog = Array.isArray(profile?.gameLog) && profile.gameLog.length > 0;
    const hasSeason = Boolean(profile?.seasonAverages) && Object.keys(profile.seasonAverages || {}).length > 0;
    const hasMatchup = Boolean(profile?.matchup?.opponent);
    const hasRecent = Array.isArray(profile?.recentPerformance) && profile.recentPerformance.length > 0;
    const hasProps = Array.isArray(profile?.currentProps) && profile.currentProps.length > 0;
    return hasGameLog || hasSeason || hasMatchup || hasRecent || hasProps;
  }

  return false;
}

function isUsableRawPlayerPayload(body: any): boolean {
  if (!body?.player) return false;
  const hasGameLog = Array.isArray(body?.gameLog) && body.gameLog.length > 0;
  const hasSeason = Boolean(body?.seasonAverages) && Object.keys(body.seasonAverages || {}).length > 0;
  const hasMatchup = Boolean(body?.matchup?.opponent);
  const hasRecent = Array.isArray(body?.recentPerformance) && body.recentPerformance.length > 0;
  const hasProps = Array.isArray(body?.currentProps) && body.currentProps.length > 0;
  return hasGameLog || hasSeason || hasMatchup || hasRecent || hasProps;
}

function isCompletePlayerPagePayload(body: any): boolean {
  if (String(body?.route || "") !== "player-profile") return false;
  const profile = body?.data?.profile;
  if (!profile?.player) return false;
  const hasHeader = Boolean(String(profile?.player?.displayName || profile?.player?.name || "").trim());
  const hasTeamContext = Boolean(
    String(profile?.player?.teamName || profile?.player?.teamAbbr || "").trim() || profile?.matchup?.opponent
  );
  const hasRecentStats = (Array.isArray(profile?.gameLog) && profile.gameLog.length > 0)
    || (Array.isArray(profile?.recentPerformance) && profile.recentPerformance.length > 0)
    || (profile?.seasonAverages && Object.keys(profile.seasonAverages).length > 0);
  const hasPropsModule = Array.isArray(profile?.currentProps);
  return hasHeader && hasTeamContext && hasRecentStats && hasPropsModule;
}

export type PageDataWarmSummary = {
  startedAt: string;
  date: string;
  forceFresh: boolean;
  lane: PageDataWarmLane;
  requests: number;
  successes: number;
  failures: number;
  warmedGameDetailCount: number;
  warmedTeamProfileCount: number;
  warmedPlayerProfileCount: number;
  knownPlayers: number;
  warmedKnownPlayers: number;
  warmedPlayerCoveragePct: number;
  longTailAttemptedPlayers: number;
  longTailWarmedPlayers: number;
};

export type ActiveRosterPrebuildSummary = {
  startedAt: string;
  date: string;
  forceFresh: boolean;
  sportsScanned: number;
  activeGamesSeen: number;
  activeTeamsSeen: number;
  teamsAttempted: number;
  teamsWarmed: number;
  playerAttempts: number;
  playerWarmed: number;
  playerFailures: number;
};

export type WarmPlayersForSportParams = {
  fetchFn: WarmFetchFn;
  sport: string;
  playerNames: string[];
  forceFresh?: boolean;
  concurrency?: number;
  maxPlayers?: number;
};

export type WarmPlayersForSportSummary = {
  sport: string;
  attempted: number;
  warmed: number;
  failures: number;
};

export type WarmTeamRosterParams = {
  fetchFn: WarmFetchFn;
  sport: string;
  teamId: string;
  forceFresh?: boolean;
  concurrency?: number;
  maxPlayers?: number;
};

export type WarmTeamRosterSummary = WarmPlayersForSportSummary & {
  teamId: string;
  rosterFetchedOk: boolean;
};

function extractActiveTeamIdsFromGames(games: any[]): string[] {
  const out = new Set<string>();
  for (const game of Array.isArray(games) ? games : []) {
    const values = [
      game?.home_team_id,
      game?.away_team_id,
      game?.homeTeamId,
      game?.awayTeamId,
      game?.home_id,
      game?.away_id,
      game?.home_team_code,
      game?.away_team_code,
      game?.home_alias,
      game?.away_alias,
    ];
    for (const value of values) {
      const id = String(value || "").trim();
      if (id) out.add(id);
    }
  }
  return Array.from(out);
}

/**
 * Full-roster prebuild loop for active teams across profile sports.
 * This is intentionally roster-complete (not props/top-player limited).
 */
export async function runActiveRosterPrebuildCycle(params: {
  fetchFn: WarmFetchFn;
  date?: string;
  forceFresh?: boolean;
}): Promise<ActiveRosterPrebuildSummary> {
  const startedAt = new Date().toISOString();
  const date = (params.date || "").trim() || todayEtYmd();
  const forceFresh = params.forceFresh === true;
  const tabs: Array<"live" | "scores"> = ["live", "scores"];
  const rosterMaxPlayers = 1200;
  const rosterConcurrency = 12;

  const teamTargets = new Set<string>();
  let activeGamesSeen = 0;
  let sportsScanned = 0;

  for (const sport of PROFILE_SPORTS) {
    sportsScanned += 1;
    for (const tab of tabs) {
      const path = `/api/page-data/games?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}&tab=${tab}`;
      const res = await params.fetchFn(path);
      if (!res.ok) continue;
      const games = Array.isArray(res.body?.games) ? res.body.games : [];
      activeGamesSeen += games.length;
      const ids = extractActiveTeamIdsFromGames(games);
      for (const teamId of ids) {
        teamTargets.add(`${sport}|||${teamId}`);
      }
    }
  }

  const targets = Array.from(teamTargets).map((token) => {
    const [sport, teamId] = token.split("|||");
    return { sport, teamId };
  });

  let teamsWarmed = 0;
  let playerAttempts = 0;
  let playerWarmed = 0;
  let playerFailures = 0;

  // Run in bounded parallel chunks to keep pressure high but predictable.
  const chunkSize = 8;
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(
      chunk.map((target) =>
        warmTeamRoster({
          fetchFn: params.fetchFn,
          sport: target.sport,
          teamId: target.teamId,
          forceFresh,
          maxPlayers: rosterMaxPlayers,
          concurrency: rosterConcurrency,
        })
      )
    );
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const summary = result.value;
      playerAttempts += summary.attempted;
      playerWarmed += summary.warmed;
      playerFailures += summary.failures;
      if (summary.rosterFetchedOk && summary.attempted > 0 && summary.failures === 0) {
        teamsWarmed += 1;
      }
    }
  }

  return {
    startedAt,
    date,
    forceFresh,
    sportsScanned,
    activeGamesSeen,
    activeTeamsSeen: targets.length,
    teamsAttempted: targets.length,
    teamsWarmed,
    playerAttempts,
    playerWarmed,
    playerFailures,
  };
}

/**
 * Legacy hook for visible-player prewarm. Document-first architecture: player profiles are built only via
 * `buildPlayerDocument` + queue — page-data `/player-profile` is read-only, so this no longer issues warm GETs.
 */
export async function warmPlayersForSport(params: WarmPlayersForSportParams): Promise<WarmPlayersForSportSummary> {
  const sport = String(params.sport || "").trim().toUpperCase();
  if (!sport || sport === "ALL") {
    return { sport, attempted: 0, warmed: 0, failures: 0 };
  }
  const maxPlayers = Math.max(1, Math.min(12_000, Number(params.maxPlayers ?? 260)));
  const names = Array.from(
    new Set((Array.isArray(params.playerNames) ? params.playerNames : []).map((n) => normalizePlayerName(n)).filter(Boolean))
  ).slice(0, maxPlayers);

  if (names.length === 0) {
    return { sport, attempted: 0, warmed: 0, failures: 0 };
  }

  return { sport, attempted: names.length, warmed: 0, failures: 0 };
}

/**
 * Fetches /api/teams/:sport/:teamId, extracts roster display names, then runs warmPlayersForSport.
 */
export async function warmTeamRoster(params: WarmTeamRosterParams): Promise<WarmTeamRosterSummary> {
  const sport = String(params.sport || "").trim().toUpperCase();
  const teamId = String(params.teamId || "").trim();
  if (!sport || sport === "ALL" || !teamId) {
    return { sport, teamId, rosterFetchedOk: false, attempted: 0, warmed: 0, failures: 0 };
  }

  const rosterRes = await params.fetchFn(`/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}`);
  if (!rosterRes.ok || rosterRes.body == null) {
    return { sport, teamId, rosterFetchedOk: false, attempted: 0, warmed: 0, failures: 1 };
  }

  const rosterNames = extractPlayerDisplayNames(rosterRes.body);
  const inner = await warmPlayersForSport({
    fetchFn: params.fetchFn,
    sport,
    playerNames: rosterNames,
    forceFresh: params.forceFresh,
    concurrency: params.concurrency,
    maxPlayers: params.maxPlayers,
  });

  return {
    sport,
    teamId,
    rosterFetchedOk: true,
    attempted: inner.attempted,
    warmed: inner.warmed,
    failures: inner.failures,
  };
}

export async function runPageDataWarmCycle(params: {
  fetchFn: WarmFetchFn;
  forceFresh?: boolean;
  date?: string;
  lane?: PageDataWarmLane;
  db?: D1Database;
  /** When set (and a profile sport), sweep order prioritizes this league ahead of PROFILE_SPORTS rotation. */
  activeSport?: string;
}): Promise<PageDataWarmSummary> {
  const startedAt = new Date().toISOString();
  const forceFresh = params.forceFresh === true;
  const date = (params.date || "").trim() || todayEtYmd();
  const lane = params.lane || "full";
  const freshSuffix = forceFresh ? "&fresh=1" : "";
  const profileBudgetByLane: Record<
    PageDataWarmLane,
    {
      playersPerSport: number;
      teamsPerSport: number;
      detailLimit: number;
      concurrency: number;
      longTailPlayersPerCycle: number;
      sweepTeamsPerCycle: number;
      recentPriorityPlayers: number;
    }
  > = {
    live: { playersPerSport: 200, teamsPerSport: 52, detailLimit: 56, concurrency: 6, longTailPlayersPerCycle: 360, sweepTeamsPerCycle: 88, recentPriorityPlayers: 260 },
    core: { playersPerSport: 420, teamsPerSport: 130, detailLimit: 160, concurrency: 8, longTailPlayersPerCycle: 1600, sweepTeamsPerCycle: 240, recentPriorityPlayers: 600 },
    depth: { playersPerSport: 780, teamsPerSport: 190, detailLimit: 280, concurrency: 10, longTailPlayersPerCycle: 3600, sweepTeamsPerCycle: 460, recentPriorityPlayers: 960 },
    full: { playersPerSport: 1400, teamsPerSport: 280, detailLimit: 520, concurrency: 12, longTailPlayersPerCycle: 7200, sweepTeamsPerCycle: 720, recentPriorityPlayers: 2000 },
  };
  const budget = profileBudgetByLane[lane];
  const cycleBudgetMsByLane: Record<PageDataWarmLane, number> = {
    live: 120_000,
    core: 320_000,
    depth: 540_000,
    full: 780_000,
  };
  const cycleDeadline = Date.now() + cycleBudgetMsByLane[lane];
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const requests: string[] = [];
  if (lane === "live") {
    requests.push(
      `/api/page-data/games?date=${encodeURIComponent(date)}&sport=ALL&tab=live${freshSuffix}`,
      `/api/page-data/odds?date=${encodeURIComponent(date)}&sport=ALL${freshSuffix}`
    );
  } else {
    requests.push(
      `/api/page-data/games?date=${encodeURIComponent(date)}&sport=ALL&tab=scores${freshSuffix}`,
      `/api/page-data/odds?date=${encodeURIComponent(date)}&sport=ALL${freshSuffix}`,
      ...TOP_SPORTS.map(
        (sport) => `/api/page-data/sport-hub?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}${freshSuffix}`
      )
    );
  }

  const settled = await Promise.allSettled(requests.map((path) => params.fetchFn(path)));
  let successes = 0;
  let failures = 0;
  let gamesPayload: any = null;

  settled.forEach((res, idx) => {
    if (
      res.status !== "fulfilled" ||
      !res.value.ok ||
      !isUsableWarmPayload(res.value.body)
    ) {
      failures += 1;
      return;
    }
    successes += 1;
    if (idx === 0) gamesPayload = res.value.body;
  });

  // Merge scores + live slates so game pages cover everyone on today's board (scheduled + in-progress).
  let gameRows = Array.isArray(gamesPayload?.games) ? gamesPayload.games : [];
  const mergeGamesTab = async (tab: "live" | "scores") => {
    const res = await params.fetchFn(
      `/api/page-data/games?date=${encodeURIComponent(date)}&sport=ALL&tab=${tab}${freshSuffix}`
    );
    if (!res.ok || !Array.isArray(res.body?.games) || res.body.games.length === 0) return false;
    const seen = new Set(gameRows.map((g: any) => normalizeGameId(g?.game_id || g?.id)).filter(Boolean));
    for (const g of res.body.games) {
      const id = normalizeGameId(g?.game_id || g?.id);
      if (id && !seen.has(id)) {
        seen.add(id);
        gameRows.push(g);
      }
    }
    return true;
  };
  if (lane === "live") {
    if (await mergeGamesTab("scores")) successes += 1;
  } else if (gamesPayload) {
    if (await mergeGamesTab("live")) successes += 1;
  }

  // Warm a bounded set of game-detail snapshots from today's games slate.
  const gameIds = gameRows
    .map((g: any) => normalizeGameId(g?.game_id || g?.id))
    .filter(Boolean)
    .slice(0, budget.detailLimit);

  const detailRequests = gameIds.map((gameId) => {
    const sport = String(
      gameRows.find((g: any) => normalizeGameId(g?.game_id || g?.id) === gameId)?.sport || ""
    )
      .trim()
      .toUpperCase();
    const sportPart = sport ? `&sport=${encodeURIComponent(sport)}` : "";
    return `/api/page-data/game-detail?gameId=${encodeURIComponent(gameId)}${sportPart}${freshSuffix}`;
  });

  const detailSettled = await Promise.allSettled(detailRequests.map((path) => params.fetchFn(path)));
  let warmedGameDetailCount = 0;
  const gameDetailPlayerTokens = new Set<string>();
  for (const result of detailSettled) {
    if (result.status === "fulfilled" && result.value.ok && isUsableWarmPayload(result.value.body)) {
      warmedGameDetailCount += 1;
      successes += 1;
    } else {
      failures += 1;
    }
    if (result.status === "fulfilled" && result.value.ok && result.value.body?.game) {
      for (const tok of collectPlayerTokensFromGameRows([result.value.body.game])) {
        gameDetailPlayerTokens.add(tok);
      }
    }
  }

  let sweepCursor = defaultSweepCursorState();
  let coverageRegistry: PlayerCoverageRegistry = { knownPlayerKeys: [], warmedPlayerKeys: [] };
  let activeSportFromCache = "";
  if (params.db) {
    const [cursorCached, coverageCached, activeSportCached] = await Promise.all([
      getCachedData<SweepCursorState>(params.db, SWEEP_CURSOR_CACHE_KEY),
      getCachedData<PlayerCoverageRegistry>(params.db, PLAYER_REGISTRY_CACHE_KEY),
      getCachedData<{ sport?: string }>(params.db, ACTIVE_SPORT_CACHE_KEY),
    ]);
    if (cursorCached) sweepCursor = cursorCached;
    if (coverageCached) coverageRegistry = coverageCached;
    activeSportFromCache = String(activeSportCached?.sport || "").trim().toUpperCase();
  }
  const paramActiveSport = String(params.activeSport || "").trim().toUpperCase();
  const effectiveActiveSport =
    paramActiveSport && PROFILE_SPORTS.includes(paramActiveSport as (typeof PROFILE_SPORTS)[number])
      ? paramActiveSport
      : activeSportFromCache && PROFILE_SPORTS.includes(activeSportFromCache as (typeof PROFILE_SPORTS)[number])
        ? activeSportFromCache
        : "";
  const burstMultiplier = effectiveActiveSport ? 1.35 : 1;
  const effectiveConcurrency = Math.min(10, Math.round(budget.concurrency * burstMultiplier));
  const effectiveLongTailPlayersPerCycle = Math.round(budget.longTailPlayersPerCycle * burstMultiplier);
  const effectiveSweepTeamsPerCycle = Math.round(budget.sweepTeamsPerCycle * burstMultiplier);
  const prioritizedProfileSports = effectiveActiveSport
    ? [
        effectiveActiveSport,
        effectiveActiveSport,
        effectiveActiveSport,
        ...PROFILE_SPORTS.filter((s) => s !== effectiveActiveSport),
      ]
    : [...PROFILE_SPORTS];

  const knownPlayerKeys = new Set<string>(coverageRegistry.knownPlayerKeys || []);
  const warmedPlayerKeys = new Set<string>(coverageRegistry.warmedPlayerKeys || []);

  const playerNameSet = new Set<string>();
  const teamTargets: Array<{ sport: string; teamId: string }> = [];
  const teamTargetDedup = new Set<string>();
  for (const sport of PROFILE_SPORTS) {
    for (const seeded of SEEDED_PLAYER_NAMES[sport] || []) {
      playerNameSet.add(`${sport}|||${seeded}`);
    }
    const propsPath = `/api/sports-data/props/today?sport=${encodeURIComponent(sport)}&limit=${Math.max(2000, budget.playersPerSport * 8)}&offset=0`;
    const standingsPath = `/api/teams/${encodeURIComponent(sport)}/standings`;
    const [propsRes, standingsRes] = await Promise.allSettled([
      params.fetchFn(propsPath),
      params.fetchFn(standingsPath),
    ]);

    if (propsRes.status === "fulfilled" && propsRes.value.ok) {
      const rows = Array.isArray(propsRes.value.body?.props) ? propsRes.value.body.props : [];
      let collectedForSport = 0;
      for (const row of rows) {
        const playerName = normalizePlayerName(row?.player_name);
        if (!playerName) continue;
        playerNameSet.add(`${sport}|||${playerName}`);
        collectedForSport += 1;
        if (collectedForSport >= budget.playersPerSport) break;
      }
      if (rows.length > 0) successes += 1;
      else failures += 1;
    } else {
      failures += 1;
    }

    if (standingsRes.status === "fulfilled" && standingsRes.value.ok) {
      const teams = Array.isArray(standingsRes.value.body?.teams) ? standingsRes.value.body.teams : [];
      for (const row of teams.slice(0, budget.teamsPerSport)) {
        const candidates = [
          String(row?.alias || "").trim().toUpperCase(),
          String(row?.id || "").trim(),
        ].filter(Boolean);
        for (const candidate of candidates) {
          const key = `${sport}|||${candidate.toLowerCase()}`;
          if (teamTargetDedup.has(key)) continue;
          teamTargetDedup.add(key);
          teamTargets.push({ sport, teamId: candidate });
        }
      }
      if (teams.length > 0) successes += 1;
      else failures += 1;
    } else {
      failures += 1;
    }
  }

  for (const tok of gameDetailPlayerTokens) {
    playerNameSet.add(tok);
  }
  for (const g of gameRows) {
    for (const tok of collectPlayerTokensFromGameRows([g])) {
      playerNameSet.add(tok);
    }
  }

  if (params.db) {
    const recentPriority = await fetchRecentAndHighTrafficPlayers(params.db);
    for (const row of recentPriority.slice(0, budget.recentPriorityPlayers)) {
      playerNameSet.add(`${row.sport}|||${row.playerName}`);
    }
  }

  // Rotating long-tail sweep: roster by roster, league by league.
  const longTailPlayerTargets: string[] = [];
  const longTailPlayerDedup = new Set<string>();
  const standingsCache = new Map<string, any[]>();
  let sweepTeamsVisited = 0;
  while (
    sweepTeamsVisited < effectiveSweepTeamsPerCycle &&
    longTailPlayerTargets.length < effectiveLongTailPlayersPerCycle &&
    Date.now() < cycleDeadline
  ) {
    const sport = prioritizedProfileSports[sweepCursor.sportIndex % prioritizedProfileSports.length];
    let teams = standingsCache.get(sport);
    if (!teams) {
      const standingsRes = await params.fetchFn(`/api/teams/${encodeURIComponent(sport)}/standings`);
      teams = standingsRes.ok && Array.isArray(standingsRes.body?.teams) ? standingsRes.body.teams : [];
      standingsCache.set(sport, teams);
    }
    if (!teams || teams.length === 0) {
      sweepCursor.sportIndex = (sweepCursor.sportIndex + 1) % prioritizedProfileSports.length;
      continue;
    }

    const currentTeamIndex = Number(sweepCursor.teamIndexBySport[sport] || 0) % teams.length;
    const team = teams[currentTeamIndex];
    const teamRouteId =
      String(team?.id || "").trim() ||
      String(team?.alias || "").trim() ||
      String(team?.name || "").trim();

    sweepCursor.teamIndexBySport[sport] = (currentTeamIndex + 1) % teams.length;
    sweepCursor.sportIndex = (sweepCursor.sportIndex + 1) % prioritizedProfileSports.length;
    sweepTeamsVisited += 1;
    if (!teamRouteId) continue;

    const rosterRes = await params.fetchFn(
      `/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamRouteId)}`
    );
    if (!rosterRes.ok) continue;
    const rosterNames = extractPlayerDisplayNames(rosterRes.body);
    for (const playerName of rosterNames) {
      const token = `${sport}|||${playerName}`;
      if (!longTailPlayerDedup.has(token)) {
        longTailPlayerDedup.add(token);
        longTailPlayerTargets.push(token);
        if (longTailPlayerTargets.length >= effectiveLongTailPlayersPerCycle) break;
      }
      knownPlayerKeys.add(normalizePlayerKey(sport, playerName));
    }
  }

  const priorityPlayerTargets = Array.from(playerNameSet).slice(
    0,
    budget.playersPerSport * PROFILE_SPORTS.length
  );
  const playerTargets = Array.from(
    new Set<string>([...priorityPlayerTargets, ...longTailPlayerTargets])
  );

  const runLimited = async <T>(items: T[], concurrency: number, worker: (item: T) => Promise<boolean>): Promise<number> => {
    let index = 0;
    let okCount = 0;
    const runnerCount = Math.max(1, concurrency);
    const runners = Array.from({ length: runnerCount }, async () => {
      while (true) {
        if (Date.now() >= cycleDeadline) return;
        const current = index;
        index += 1;
        if (current >= items.length) return;
        try {
          if (await worker(items[current])) okCount += 1;
        } catch {
          // Counted as failure by caller.
        }
      }
    });
    await Promise.all(runners);
    return okCount;
  };

  const longTailWarmedPlayers = 0;
  // Document-first: player profiles are not warmed via page-data; `buildPlayerDocument` + queue only.
  const warmedPlayerProfileCount = await runLimited(playerTargets, effectiveConcurrency, async () => false);

  const warmedTeamProfileCount = await runLimited(teamTargets, effectiveConcurrency, async (target) => {
    const path = `/api/page-data/team-profile?sport=${encodeURIComponent(target.sport)}&teamId=${encodeURIComponent(target.teamId)}${freshSuffix}`;
    const res = await params.fetchFn(path);
    if (!res.ok || !isUsableWarmPayload(res.body)) {
      failures += 1;
      await sleep(120);
      return false;
    }
    successes += 1;
    return true;
  });

  const knownPlayers = knownPlayerKeys.size;
  let warmedKnownPlayers = 0;
  if (knownPlayers > 0) {
    for (const key of knownPlayerKeys) {
      if (warmedPlayerKeys.has(key)) warmedKnownPlayers += 1;
    }
  }
  const warmedPlayerCoveragePct =
    knownPlayers > 0 ? Math.round((warmedKnownPlayers / knownPlayers) * 10_000) / 100 : 0;

  if (params.db) {
    await Promise.allSettled([
      setCachedData(
        params.db,
        SWEEP_CURSOR_CACHE_KEY,
        "page-data-warm",
        "player-sweep-cursor",
        sweepCursor,
        REGISTRY_TTL_SECONDS
      ),
      setCachedData(
        params.db,
        PLAYER_REGISTRY_CACHE_KEY,
        "page-data-warm",
        "player-coverage-registry",
        {
          knownPlayerKeys: Array.from(knownPlayerKeys),
          warmedPlayerKeys: Array.from(warmedPlayerKeys),
        } satisfies PlayerCoverageRegistry,
        REGISTRY_TTL_SECONDS
      ),
    ]);
  }

  setCounter("pageDataPlayerWarmKnown", knownPlayers);
  setCounter("pageDataPlayerWarmWarmed", warmedKnownPlayers);

  return {
    startedAt,
    date,
    forceFresh,
    lane,
    requests:
      requests.length +
      detailRequests.length +
      (PROFILE_SPORTS.length * 2) +
      (playerTargets.length * 2) +
      teamTargets.length,
    successes,
    failures,
    warmedGameDetailCount,
    warmedTeamProfileCount,
    warmedPlayerProfileCount,
    knownPlayers,
    warmedKnownPlayers,
    warmedPlayerCoveragePct,
    longTailAttemptedPlayers: longTailPlayerTargets.length,
    longTailWarmedPlayers,
  };
}

