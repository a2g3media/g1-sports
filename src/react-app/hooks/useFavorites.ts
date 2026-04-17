import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

export type FavoriteType = "team" | "player" | "game" | "market";

export interface FavoriteEntity {
  id: number;
  type: FavoriteType;
  entity_id: string;
  sport: string | null;
  league: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface FavoritesDashboard {
  teams: Array<Record<string, unknown> | FavoriteEntity>;
  players: Array<Record<string, unknown> | FavoriteEntity>;
  live_priority: Array<Record<string, unknown>>;
  counts: { total: number; teams: number; players: number; live: number };
}

const LOCAL_FAVORITES_KEY = "gz-local-favorites-v1";
const FAVORITES_ENRICH_TIMEOUT_MS = 2200;

function normalizeToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamToken(value: unknown): string {
  return normalizeToken(value)
    .replace(/\b(fc|cf|sc|ac|afc|cfc|club)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEasternYmdWithOffset(offsetDays: number): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function buildUpcomingDateWindow(daysAhead = 14): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    dates.push(getEasternYmdWithOffset(offset));
  }
  return dates;
}

async function fetchJsonWithTimeout<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...(init || {}),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => null)) as T | null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function useFavorites(type?: FavoriteType) {
  const { user } = useDemoAuth();
  const isAuthed = Boolean(user?.id);
  const [favorites, setFavorites] = useState<FavoriteEntity[]>([]);
  const [loading, setLoading] = useState(true);

  const userHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (user?.id) headers["x-user-id"] = String(user.id);
    return headers;
  }, [user?.id]);

  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed as FavoriteEntity[];
    } catch {
      return [];
    }
  }, []);

  const saveLocal = useCallback((items: FavoriteEntity[]) => {
    try {
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(items));
    } catch {
      // no-op
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAuthed) {
        const local = loadLocal();
        setFavorites(type ? local.filter((f) => f.type === type) : local);
        return;
      }
      const query = type ? `?type=${type}` : "";
      const res = await fetch(`/api/favorites${query}`, { headers: userHeaders });
      if (!res.ok) return;
      const payload = await res.json();
      setFavorites(Array.isArray(payload.favorites) ? payload.favorites : []);
    } finally {
      setLoading(false);
    }
  }, [isAuthed, loadLocal, type, userHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isFavorite = useCallback(
    (favoriteType: FavoriteType, entityId: string) =>
      favorites.some((f) => f.type === favoriteType && String(f.entity_id) === String(entityId)),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (payload: {
      type: FavoriteType;
      entity_id: string;
      sport?: string;
      league?: string;
      metadata?: Record<string, unknown>;
    }): Promise<boolean> => {
      if (!isAuthed) {
        const local = loadLocal();
        const existingIdx = local.findIndex(
          (f) => f.type === payload.type && String(f.entity_id) === String(payload.entity_id)
        );
        if (existingIdx >= 0) {
          const next = [...local];
          next.splice(existingIdx, 1);
          saveLocal(next);
          setFavorites(type ? next.filter((f) => f.type === type) : next);
          return false;
        }
        const record: FavoriteEntity = {
          id: Date.now(),
          type: payload.type,
          entity_id: payload.entity_id,
          sport: payload.sport || null,
          league: payload.league || null,
          metadata: payload.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const next = [record, ...local];
        saveLocal(next);
        setFavorites(type ? next.filter((f) => f.type === type) : next);
        return true;
      }

      const currentlyFavorite = isFavorite(payload.type, payload.entity_id);
      setFavorites((prev) => {
        if (currentlyFavorite) {
          return prev.filter((f) => !(f.type === payload.type && String(f.entity_id) === String(payload.entity_id)));
        }
        return [
          {
            id: Date.now(),
            type: payload.type,
            entity_id: payload.entity_id,
            sport: payload.sport || null,
            league: payload.league || null,
            metadata: payload.metadata || {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ];
      });

      try {
        const res = await fetch("/api/favorites/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...userHeaders },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          await refresh();
          return currentlyFavorite;
        }
        const data = await res.json();
        return Boolean(data.is_favorite);
      } catch {
        await refresh();
        return currentlyFavorite;
      }
    },
    [isAuthed, isFavorite, loadLocal, refresh, saveLocal, type, userHeaders]
  );

  const fetchDashboard = useCallback(async (): Promise<FavoritesDashboard | null> => {
    const buildDashboardFromLocal = (items: FavoriteEntity[]): FavoritesDashboard => ({
      teams: items.filter((f) => f.type === "team"),
      players: items.filter((f) => f.type === "player"),
      live_priority: [],
      counts: {
        total: items.length,
        teams: items.filter((f) => f.type === "team").length,
        players: items.filter((f) => f.type === "player").length,
        live: 0,
      },
    });

    const mergeDashboards = (primary: FavoritesDashboard, fallback: FavoritesDashboard): FavoritesDashboard => {
      const dedupe = (rows: Array<Record<string, unknown> | FavoriteEntity>) => {
        const seen = new Set<string>();
        return rows.filter((row) => {
          const record = row as Record<string, unknown>;
          const key = `${String(record.type || "")}:${String(record.entity_id || "")}`.toLowerCase();
          if (!key || key === ":") return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      const mergedTeams = dedupe([...(primary.teams || []), ...(fallback.teams || [])]);
      const mergedPlayers = dedupe([...(primary.players || []), ...(fallback.players || [])]);
      const mergedLive = Array.isArray(primary.live_priority) && primary.live_priority.length > 0
        ? primary.live_priority
        : fallback.live_priority;
      return {
        teams: mergedTeams,
        players: mergedPlayers,
        live_priority: mergedLive,
        counts: {
          total: mergedTeams.length + mergedPlayers.length,
          teams: mergedTeams.length,
          players: mergedPlayers.length,
          live: Array.isArray(mergedLive) ? mergedLive.length : 0,
        },
      };
    };

    const enrichDashboard = async (
      source: FavoritesDashboard,
      totalCountOverride?: number
    ): Promise<FavoritesDashboard> => {
      const teams = Array.isArray(source?.teams) ? source.teams : [];
      const players = Array.isArray(source?.players) ? source.players : [];
      const livePriority: Array<Record<string, unknown>> = [];
      const resolveSport = (value: unknown): string => String(value || "").trim().toUpperCase();
      const resolveStatusPriority = (status: unknown): number => {
        const s = String(status || "").toUpperCase();
        if (s === "LIVE" || s === "IN_PROGRESS") return 0;
        if (s === "SCHEDULED" || s === "PRE" || s === "PREGAME" || s === "NOT_STARTED") return 1;
        return 2;
      };
      const dates = buildUpcomingDateWindow(14);
      const gamesByDate = await Promise.all(
        dates.map(async (date) => {
          const pageData = await fetchJsonWithTimeout<{ games?: Array<Record<string, unknown>> }>(
            `/api/page-data/games?date=${encodeURIComponent(date)}&sport=ALL&tab=scores`,
            { credentials: "include" },
            FAVORITES_ENRICH_TIMEOUT_MS
          );
          const gameRows = Array.isArray(pageData?.games) ? pageData.games : [];
          if (gameRows.length > 0) return gameRows as Array<Record<string, unknown>>;
          const gamesPayload = await fetchJsonWithTimeout<{ games?: Array<Record<string, unknown>> }>(
            `/api/games?date=${encodeURIComponent(date)}&sport=ALL&includeOdds=0`,
            { credentials: "include" },
            FAVORITES_ENRICH_TIMEOUT_MS
          );
          return (Array.isArray(gamesPayload?.games) ? gamesPayload.games : []) as Array<Record<string, unknown>>;
        })
      );
      const games = gamesByDate.flat();

      const selectTeamGame = (params: { teamCode?: string; teamName?: string; sport?: string }) => {
        const sport = resolveSport(params.sport);
        const code = String(params.teamCode || "").trim().toUpperCase();
        const teamNameToken = normalizeToken(params.teamName);
        const teamNameNormalized = normalizeTeamToken(params.teamName);
        const candidates = games.filter((g) => {
          const gs = resolveSport(g?.sport);
          if (sport && gs && gs !== sport) return false;
          const homeCode = String(g?.home_team_code || g?.home_team || "").trim().toUpperCase();
          const awayCode = String(g?.away_team_code || g?.away_team || "").trim().toUpperCase();
          const homeName = normalizeToken(g?.home_team_name || g?.home_team || "");
          const awayName = normalizeToken(g?.away_team_name || g?.away_team || "");
          const homeNameNormalized = normalizeTeamToken(g?.home_team_name || g?.home_team || "");
          const awayNameNormalized = normalizeTeamToken(g?.away_team_name || g?.away_team || "");
          const codeMatch = Boolean(code) && (homeCode === code || awayCode === code);
          const nameMatch =
            Boolean(teamNameToken) &&
            (homeName.includes(teamNameToken) ||
              awayName.includes(teamNameToken) ||
              teamNameToken.includes(homeName) ||
              teamNameToken.includes(awayName));
          const normalizedNameMatch =
            Boolean(teamNameNormalized) &&
            (homeNameNormalized.includes(teamNameNormalized) ||
              awayNameNormalized.includes(teamNameNormalized) ||
              teamNameNormalized.includes(homeNameNormalized) ||
              teamNameNormalized.includes(awayNameNormalized));
          return codeMatch || nameMatch || normalizedNameMatch;
        });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => {
          const aPriority = resolveStatusPriority(a?.status);
          const bPriority = resolveStatusPriority(b?.status);
          if (aPriority !== bPriority) return aPriority - bPriority;
          const aTime = new Date(String(a?.start_time || a?.startTime || "")).getTime();
          const bTime = new Date(String(b?.start_time || b?.startTime || "")).getTime();
          return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER);
        });
        return candidates[0] || null;
      };

      const teamCards = teams.map((team) => {
        const teamRecord = team as Record<string, unknown>;
        const metadata = (teamRecord.metadata && typeof teamRecord.metadata === "object")
          ? (teamRecord.metadata as Record<string, unknown>)
          : {};
        const teamCode = String(teamRecord.team_code || metadata.team_code || metadata.team_abbr || "").trim().toUpperCase();
        const teamName = String(teamRecord.team_name || metadata.team_name || teamRecord.entity_id || "").trim();
        const sport = String(teamRecord.sport || metadata.sport || "").trim().toLowerCase();
        const existingNextGame = (teamRecord.next_game && typeof teamRecord.next_game === "object")
          ? (teamRecord.next_game as Record<string, unknown>)
          : null;
        const nextGame = existingNextGame || selectTeamGame({ teamCode, teamName, sport });
        const live = Boolean(nextGame && ["LIVE", "IN_PROGRESS"].includes(String(nextGame.status || "").toUpperCase()));
        if (live) {
          livePriority.push({
            kind: "team",
            entity_id: teamRecord.entity_id,
            team_code: teamCode || null,
            team_name: teamName || teamRecord.entity_id,
            game: nextGame,
          });
        }
        return {
          ...teamRecord,
          metadata,
          team_code: teamCode,
          team_name: teamName || teamRecord.entity_id,
          next_game: nextGame || null,
          current_odds: teamRecord.current_odds || null,
          is_live: live,
        };
      });

      const propsByGameId = new Map<string, Array<Record<string, unknown>>>();
      const oddsSummaryByGameId = new Map<string, Record<string, unknown> | null>();
      const playerSnapshotByKey = new Map<string, Record<string, unknown> | null>();
      const playerSearchByKey = new Map<string, Record<string, unknown> | null>();
      const fetchPropsForGame = async (gameId: string): Promise<Array<Record<string, unknown>>> => {
        if (!gameId) return [];
        if (propsByGameId.has(gameId)) return propsByGameId.get(gameId) || [];
        const propsPayload = await fetchJsonWithTimeout<{ props?: Array<Record<string, unknown>> }>(
          `/api/games/${encodeURIComponent(gameId)}/props`,
          { credentials: "include" },
          FAVORITES_ENRICH_TIMEOUT_MS
        );
        const rows = (Array.isArray(propsPayload?.props) ? propsPayload.props : []) as Array<Record<string, unknown>>;
        propsByGameId.set(gameId, rows);
        return rows;
      };
      const fetchOddsSummaryForGame = async (gameId: string): Promise<Record<string, unknown> | null> => {
        if (!gameId) return null;
        if (oddsSummaryByGameId.has(gameId)) return oddsSummaryByGameId.get(gameId) || null;
        const oddsPayload = await fetchJsonWithTimeout<Record<string, unknown>>(
          `/api/odds/summary/${encodeURIComponent(gameId)}`,
          { credentials: "include" },
          FAVORITES_ENRICH_TIMEOUT_MS
        );
        if (!oddsPayload || typeof oddsPayload !== "object") {
          oddsSummaryByGameId.set(gameId, null);
          return null;
        }
        const spread = (oddsPayload.spread && typeof oddsPayload.spread === "object")
          ? (oddsPayload.spread as Record<string, unknown>)
          : null;
        const total = (oddsPayload.total && typeof oddsPayload.total === "object")
          ? (oddsPayload.total as Record<string, unknown>)
          : null;
        const moneyline = (oddsPayload.moneyline && typeof oddsPayload.moneyline === "object")
          ? (oddsPayload.moneyline as Record<string, unknown>)
          : null;
        const normalized = {
          spread_home: spread?.home_line ?? null,
          spread_away: spread?.away_line ?? null,
          total: total?.line ?? null,
          moneyline_home: moneyline?.home_price ?? null,
          moneyline_away: moneyline?.away_price ?? null,
          books_count: Number(oddsPayload.books_count ?? 0),
          source: String(oddsPayload.source || ""),
          fallback_type: String(oddsPayload.fallback_type || ""),
          degraded: Boolean(oddsPayload.degraded),
        };
        oddsSummaryByGameId.set(gameId, normalized);
        return normalized;
      };
      const fetchPlayerSnapshot = async (sport: string, playerName: string): Promise<Record<string, unknown> | null> => {
        const safeName = String(playerName || "").trim();
        if (!safeName) return null;
        const safeSport = String(sport || "").trim().toUpperCase();
        const key = `${safeSport}:${safeName.toLowerCase()}`;
        if (playerSnapshotByKey.has(key)) return playerSnapshotByKey.get(key) || null;
        const payload = await fetchJsonWithTimeout<Record<string, unknown>>(
          `/api/player/${encodeURIComponent(safeSport)}/${encodeURIComponent(safeName)}`,
          { credentials: "include" },
          FAVORITES_ENRICH_TIMEOUT_MS
        );
        const basePlayer = (payload?.player && typeof payload.player === "object")
          ? (payload.player as Record<string, unknown>)
          : ((payload && typeof payload === "object") ? (payload as Record<string, unknown>) : null);
        const baseTeamAbbr = String(basePlayer?.teamAbbr ?? basePlayer?.team_code ?? "").trim().toUpperCase();
        if (basePlayer && baseTeamAbbr) {
          playerSnapshotByKey.set(key, basePlayer);
          return basePlayer;
        }
        if (playerSearchByKey.has(key)) {
          const cachedSearch = playerSearchByKey.get(key) || null;
          const merged = basePlayer || cachedSearch;
          playerSnapshotByKey.set(key, merged || null);
          return merged || null;
        }
        const searchPayload = await fetchJsonWithTimeout<Record<string, unknown>>(
          `/api/player/search?q=${encodeURIComponent(safeName)}&sport=${encodeURIComponent(safeSport)}`,
          { credentials: "include" },
          FAVORITES_ENRICH_TIMEOUT_MS
        );
        const searchRows = Array.isArray(searchPayload?.results)
          ? (searchPayload?.results as Array<Record<string, unknown>>)
          : [];
        const normalizedSafeName = normalizeToken(safeName);
        const exact = searchRows.find((row) => normalizeToken(row.displayName || row.name || "") === normalizedSafeName) || searchRows[0] || null;
        const searchPlayer = exact
          ? {
            id: String(exact.espnId || exact.id || "").trim() || undefined,
            espnId: String(exact.espnId || exact.id || "").trim() || undefined,
            displayName: String(exact.displayName || exact.name || safeName).trim(),
            teamAbbr: String(exact.teamAbbr || exact.team_code || "").trim().toUpperCase(),
            teamName: String(exact.teamName || exact.team_name || "").trim(),
            headshotUrl: String(exact.headshotUrl || exact.photo_url || "").trim(),
            sport: safeSport,
            position: String(exact.position || "").trim(),
          } as Record<string, unknown>
          : null;
        playerSearchByKey.set(key, searchPlayer);
        const merged = {
          ...(basePlayer || {}),
          ...(searchPlayer || {}),
          ...(basePlayer?.headshotUrl ? { headshotUrl: basePlayer.headshotUrl } : {}),
          ...(basePlayer?.position ? { position: basePlayer.position } : {}),
        } as Record<string, unknown>;
        const finalPlayer = Object.keys(merged).length > 0 ? merged : null;
        playerSnapshotByKey.set(key, finalPlayer);
        return finalPlayer;
      };

      const teamCardsWithOdds = await Promise.all(
        teamCards.map(async (teamRecord) => {
          const nextGame = (teamRecord.next_game && typeof teamRecord.next_game === "object")
            ? (teamRecord.next_game as Record<string, unknown>)
            : null;
          const gameId = String(nextGame?.id || nextGame?.game_id || "").trim();
          const odds = gameId ? await fetchOddsSummaryForGame(gameId) : null;
          return {
            ...teamRecord,
            current_odds: odds || {
              spread_home: null,
              spread_away: null,
              total: null,
              moneyline_home: null,
              moneyline_away: null,
              books_count: 0,
              source: "none",
              fallback_type: gameId ? "no_coverage" : "no_game",
              degraded: true,
            },
          };
        })
      );

      const playerCards = await Promise.all(
        players.map(async (player) => {
          const playerRecord = player as Record<string, unknown>;
          const metadata = (playerRecord.metadata && typeof playerRecord.metadata === "object")
            ? (playerRecord.metadata as Record<string, unknown>)
            : {};
          const playerName = String(playerRecord.player_name || metadata.player_name || playerRecord.entity_id || "").trim();
          const teamCode = String(playerRecord.team_code || metadata.team_code || metadata.team_abbr || "").trim().toUpperCase();
          const sport = String(playerRecord.sport || metadata.sport || "").trim().toLowerCase();
          const existingNextGame = (playerRecord.next_game && typeof playerRecord.next_game === "object")
            ? (playerRecord.next_game as Record<string, unknown>)
            : null;
          const nextGame = existingNextGame || selectTeamGame({ teamCode, teamName: String(metadata.team_name || ""), sport });
          const live = Boolean(nextGame && ["LIVE", "IN_PROGRESS"].includes(String(nextGame.status || "").toUpperCase()));
          const playerId = String(
            playerRecord.player_id ??
              playerRecord.playerId ??
              metadata.player_id ??
              metadata.playerId ??
              metadata.athlete_id ??
              metadata.athleteId ??
              metadata.espn_id ??
              metadata.espnId ??
              ""
          ).trim();
          let props: Array<Record<string, unknown>> = Array.isArray(playerRecord.props)
            ? (playerRecord.props as Array<Record<string, unknown>>)
            : [];
          const playerSnapshot = await fetchPlayerSnapshot(sport, playerName);
          const snapshotPlayerId = String(
            playerSnapshot?.id ??
              playerSnapshot?.espnId ??
              playerSnapshot?.headshotPlayerId ??
              ""
          ).trim();
          const snapshotHeadshotUrl = String(
            playerSnapshot?.headshotUrl ??
              playerSnapshot?.photo_url ??
              playerSnapshot?.photoUrl ??
              ""
          ).trim();
          const snapshotTeamAbbr = String(playerSnapshot?.teamAbbr ?? "").trim().toUpperCase();
          const snapshotPosition = String(playerSnapshot?.position ?? "").trim().toUpperCase();
          const snapshotTeamName = String(playerSnapshot?.teamName ?? "").trim();
          if (props.length === 0) {
            const gameId = String(nextGame?.id || nextGame?.game_id || "").trim();
            if (gameId) {
              const allProps = await fetchPropsForGame(gameId);
              const nameToken = normalizeToken(playerName);
              props = allProps
                .filter((row) => {
                  const rowPlayerId = String(
                    row.player_id ?? row.playerId ?? row.espn_player_id ?? row.athlete_id ?? row.athleteId ?? ""
                  ).trim();
                  if (playerId && rowPlayerId && rowPlayerId === playerId) return true;
                  const rowName = normalizeToken(row?.player_name || row?.playerName || "");
                  return nameToken ? rowName === nameToken || rowName.includes(nameToken) || nameToken.includes(rowName) : false;
                })
                .slice(0, 3);
            }
          }
          const resolvedPhotoId = String(
            props[0]?.espn_player_id ??
              props[0]?.player_id ??
              props[0]?.playerId ??
              snapshotPlayerId ??
              playerId
          ).trim();
          if (live) {
            livePriority.push({
              kind: "player",
              entity_id: playerRecord.entity_id,
              player_name: playerName || playerRecord.entity_id,
              team_code: teamCode || null,
              game: nextGame || null,
            });
          }
          return {
            ...playerRecord,
            metadata: {
              ...metadata,
              ...(snapshotHeadshotUrl ? { photo_url: snapshotHeadshotUrl, headshot_url: snapshotHeadshotUrl } : {}),
              ...(snapshotTeamAbbr ? { team_code: snapshotTeamAbbr } : {}),
              ...(snapshotTeamName ? { team_name: snapshotTeamName } : {}),
              ...(snapshotPosition ? { position: snapshotPosition } : {}),
              ...(resolvedPhotoId ? { espn_id: resolvedPhotoId, player_id: resolvedPhotoId } : {}),
            },
            player_name: playerName || playerRecord.entity_id,
            team_code: snapshotTeamAbbr || teamCode || null,
            team_name: snapshotTeamName || String(playerRecord.team_name || metadata.team_name || "").trim() || null,
            position: snapshotPosition || String(playerRecord.position || metadata.position || "").trim().toUpperCase() || null,
            next_game: nextGame || null,
            props,
            is_live: live,
            ...(snapshotHeadshotUrl ? { photo_url: snapshotHeadshotUrl } : {}),
            ...(resolvedPhotoId ? { player_id: resolvedPhotoId } : {}),
          };
        })
      );

      return {
        teams: teamCardsWithOdds,
        players: playerCards,
        live_priority: livePriority.length > 0 ? livePriority : (Array.isArray(source?.live_priority) ? source.live_priority : []),
        counts: {
          total: typeof totalCountOverride === "number" ? totalCountOverride : Number(source?.counts?.total || teamCards.length + playerCards.length),
          teams: teamCards.length,
          players: playerCards.length,
          live: livePriority.length,
        },
      };
    };

    if (!isAuthed) {
      const local = loadLocal();
      const baseDashboard = buildDashboardFromLocal(local);
      return enrichDashboard(baseDashboard, local.length);
    }
    const res = await fetch("/api/favorites/dashboard", { headers: userHeaders });
    if (!res.ok) return null;
    const base = (await res.json()) as FavoritesDashboard;
    const local = loadLocal();
    if (local.length > 0) {
      const localDashboard = buildDashboardFromLocal(local);
      const baseCount = Number(base?.counts?.total || 0);
      const baseTeams = Array.isArray(base?.teams) ? base.teams.length : 0;
      const basePlayers = Array.isArray(base?.players) ? base.players.length : 0;
      const looksEmpty = baseCount === 0 && baseTeams === 0 && basePlayers === 0;
      const merged = looksEmpty ? localDashboard : mergeDashboards(base, localDashboard);
      return enrichDashboard(merged);
    }
    return enrichDashboard(base);
  }, [isAuthed, loadLocal, userHeaders]);

  return { favorites, loading, refresh, toggleFavorite, isFavorite, fetchDashboard };
}
