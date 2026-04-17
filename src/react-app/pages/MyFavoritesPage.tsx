import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Calendar, ChevronRight, Sparkles, Star, Trash2, Users } from "lucide-react";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";
import { type FavoriteType, useFavorites } from "@/react-app/hooks/useFavorites";
import { buildPlayerRoute, buildTeamRoute } from "@/react-app/lib/navigationRoutes";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";
import { cn } from "@/react-app/lib/utils";

type AnyRecord = Record<string, unknown>;

function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

function formatStart(value: unknown): string {
  if (!value) return "TBD";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function HoverDeleteButton({
  deleting,
  onClick,
  className,
}: {
  deleting?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={Boolean(deleting)}
      onClick={onClick}
      aria-label={deleting ? "Deleting favorite" : "Remove favorite"}
      title={deleting ? "Deleting..." : "Remove"}
      className={cn(
        "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border text-white/60 opacity-0 transition-all",
        "group-hover:opacity-100 group-focus-within:opacity-100",
        deleting
          ? "cursor-not-allowed border-red-300/20 bg-red-500/10 text-red-200/70 opacity-100"
          : "border-white/12 bg-black/35 hover:border-red-300/35 hover:bg-red-500/20 hover:text-red-100",
        className
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function TeamRow({
  row,
  onDelete,
  deleting,
}: {
  row: AnyRecord;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const teamCode = String(row.team_code || "").toUpperCase();
  const teamName = String(row.team_name || row.entity_id || "Team");
  const sport = String(row.sport || "nba");
  const game = (row.next_game || null) as AnyRecord | null;
  const odds = (row.current_odds || null) as AnyRecord | null;
  const hasOddsValues = Boolean(
    odds &&
    (
      odds.spread_home !== null ||
      odds.total !== null ||
      odds.moneyline_home !== null
    )
  );
  const isLive = Boolean(row.is_live);
  const home = String(game?.home_team || game?.home_team_name || "");
  const away = String(game?.away_team || game?.away_team_name || "");

  return (
    <GlassCard className="group relative p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <TeamLogo teamCode={teamCode} sport={sport} size={34} className="rounded-full" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{teamName}</div>
            <div className="text-xs text-white/50 uppercase">{sport}</div>
          </div>
        </div>
        {isLive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-200">
            <Activity className="h-3 w-3" /> LIVE
          </span>
        )}
      </div>
      <div className="mt-3 text-xs text-white/70">
        {game ? (
          <>
            <div className="truncate">{away} @ {home}</div>
            <div className="mt-1 text-white/45">{formatStart(game.start_time)}</div>
          </>
        ) : (
          <div className="text-white/45">No upcoming game found.</div>
        )}
      </div>
      {odds && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
            <div className="text-white/40">Spread</div>
            <div className="text-white">{String(odds.spread_home ?? "N/A")}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
            <div className="text-white/40">Total</div>
            <div className="text-white">{String(odds.total ?? "N/A")}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
            <div className="text-white/40">ML</div>
            <div className="text-white">{String(odds.moneyline_home ?? "N/A")}</div>
          </div>
        </div>
      )}
      {odds && !hasOddsValues && (
        <div className="mt-2 text-[11px] text-white/45">Odds pending from provider.</div>
      )}
      {onDelete && <HoverDeleteButton deleting={deleting} onClick={onDelete} />}
    </GlassCard>
  );
}

function PlayerRow({
  row,
  onDelete,
  deleting,
}: {
  row: AnyRecord;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const playerName = String(row.player_name || row.entity_id || "Player");
  const teamCode = String(row.team_code || "");
  const sport = String(row.sport || "nba");
  const metadata = (row.metadata && typeof row.metadata === "object") ? (row.metadata as AnyRecord) : {};
  const playerId = String(
    row.player_id ??
      row.playerId ??
      metadata.player_id ??
      metadata.playerId ??
      metadata.athlete_id ??
      metadata.athleteId ??
      metadata.espn_id ??
      metadata.espnId ??
      ""
  ).trim();
  const photoUrl = String(
    row.photo_url ??
      row.photoUrl ??
      metadata.photo_url ??
      metadata.photoUrl ??
      metadata.headshot_url ??
      metadata.headshotUrl ??
      ""
  ).trim();
  const props = Array.isArray(row.props) ? (row.props as AnyRecord[]) : [];
  const topProp = props[0] || null;
  const game = (row.next_game || null) as AnyRecord | null;
  const position = String(row.position || metadata.position || "").trim().toUpperCase();
  const teamName = String(row.team_name || metadata.team_name || "").trim();
  const resolvedPlayerId = resolvePlayerIdForNavigation(playerId, playerName, sport);
  const playerRoute = (() => {
    if (!resolvedPlayerId) return null;
    try {
      return `${buildPlayerRoute(sport, resolvedPlayerId)}?playerName=${encodeURIComponent(playerName)}`;
    } catch {
      return null;
    }
  })();
  const teamRoute = (() => {
    if (!teamCode) return null;
    try {
      return buildTeamRoute(sport, teamCode);
    } catch {
      return null;
    }
  })();

  return (
    <GlassCard className="group relative p-4">
      <Link to={playerRoute || "#"} className={cn("block", playerRoute ? "" : "pointer-events-none")} aria-disabled={!playerRoute}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PlayerPhoto
              playerName={playerName}
              playerId={playerId || undefined}
              photoUrl={photoUrl || undefined}
              sport={sport}
              size={42}
              className="border border-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">{playerName}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase text-white/55">
                {position && (
                  <span className="inline-flex items-center rounded-md border border-cyan-300/30 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-100">
                    {position}
                  </span>
                )}
                <span>{sport}</span>
              </div>
            </div>
          </div>
          {teamCode && teamRoute && (
            <Link
              to={teamRoute}
              onClick={(event) => event.stopPropagation()}
              className="group/teamlogo shrink-0 rounded-xl border border-cyan-300/25 bg-gradient-to-br from-cyan-500/12 to-sky-500/8 p-2.5 shadow-[0_0_20px_rgba(56,189,248,0.16)] transition-all hover:border-cyan-200/45 hover:shadow-[0_0_24px_rgba(56,189,248,0.22)]"
              aria-label={`Open ${teamName || teamCode} team page`}
              title={`Open ${teamName || teamCode}`}
            >
              <TeamLogo
                teamCode={teamCode}
                teamName={teamName || undefined}
                sport={sport}
                size={36}
                className="transition-transform group-hover/teamlogo:scale-105"
              />
            </Link>
          )}
        </div>
        <div className="mt-3 text-xs text-white/70">
          {topProp ? (
            <div className="truncate">
              {String(topProp.prop_type || "Prop")} {String(topProp.line ?? "-")}
            </div>
          ) : (
            <div className="text-white/45">No active props found.</div>
          )}
          <div className="mt-1 text-white/45">
            {game ? formatStart(game.start_time) : "No upcoming game found."}
          </div>
        </div>
      </Link>
      {onDelete && <HoverDeleteButton deleting={deleting} onClick={onDelete} />}
    </GlassCard>
  );
}

function buildFavoritePayloadFromRow(row: AnyRecord, fallbackType?: FavoriteType): {
  type: FavoriteType;
  entity_id: string;
  sport?: string;
  league?: string;
  metadata?: Record<string, unknown>;
} | null {
  const inferredTypeRaw = String(row.kind || row.type || fallbackType || "").trim().toLowerCase();
  const inferredType = (inferredTypeRaw === "team" || inferredTypeRaw === "player" || inferredTypeRaw === "game" || inferredTypeRaw === "market")
    ? (inferredTypeRaw as FavoriteType)
    : null;
  const entityId = String(row.entity_id || "").trim();
  if (!inferredType || !entityId) return null;

  const sport = String(row.sport || "").trim().toLowerCase();
  const league = String(row.league || "").trim();
  const metadataFromRow = (row.metadata && typeof row.metadata === "object")
    ? (row.metadata as Record<string, unknown>)
    : {};
  const metadata = {
    ...metadataFromRow,
    ...(row.team_name ? { team_name: String(row.team_name) } : {}),
    ...(row.team_code ? { team_code: String(row.team_code) } : {}),
    ...(row.player_name ? { player_name: String(row.player_name) } : {}),
  };

  return {
    type: inferredType,
    entity_id: entityId,
    sport: sport || undefined,
    league: league || undefined,
    metadata,
  };
}

export default function MyFavoritesPage() {
  const { fetchDashboard, toggleFavorite } = useFavorites();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<AnyRecord | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchDashboard();
        if (mounted) setDashboard((data || null) as AnyRecord | null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchDashboard]);

  const teams = useMemo(() => (Array.isArray(dashboard?.teams) ? (dashboard?.teams as AnyRecord[]) : []), [dashboard]);
  const players = useMemo(() => (Array.isArray(dashboard?.players) ? (dashboard?.players as AnyRecord[]) : []), [dashboard]);
  const livePriority = useMemo(
    () => (Array.isArray(dashboard?.live_priority) ? (dashboard?.live_priority as AnyRecord[]) : []),
    [dashboard]
  );

  const removeFavoriteRow = async (row: AnyRecord, fallbackType?: FavoriteType) => {
    const payload = buildFavoritePayloadFromRow(row, fallbackType);
    if (!payload) return;
    const key = `${payload.type}:${payload.entity_id}`;
    setDeletingKey(key);
    try {
      await toggleFavorite(payload);
      const data = await fetchDashboard();
      setDashboard((data || null) as AnyRecord | null);
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-300" />
              My Favorites
            </h1>
            <p className="mt-1 text-sm text-white/50">Personalized teams, players, and live priority.</p>
          </div>
          <Link to="/watchboard" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
            Watchboard <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {livePriority.length > 0 && (
          <GlassCard className="p-4 border-emerald-400/20 bg-emerald-500/[0.06]">
            <div className="flex items-center gap-2 text-emerald-200 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              Live Priority ({livePriority.length})
            </div>
            <div className="mt-2 text-xs text-emerald-100/80">
              Favorites with live action are pinned at the top.
            </div>
            <div className="mt-3 space-y-2">
              {livePriority.map((row, idx) => {
                const type = String(row.kind || "").toLowerCase() === "player" ? "player" : "team";
                const entityId = String(row.entity_id || "");
                const rowKey = entityId ? `${type}:${entityId}` : `live-${idx}`;
                const label = type === "player"
                  ? String(row.player_name || row.entity_id || "Player")
                  : String(row.team_name || row.team_code || row.entity_id || "Team");
                const canDelete = Boolean(entityId);
                const deleting = deletingKey === rowKey;
                return (
                  <div key={rowKey} className="group relative flex items-center justify-between gap-3 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white">{label}</div>
                      <div className="text-[11px] uppercase text-emerald-100/70">{type}</div>
                    </div>
                    {canDelete && <HoverDeleteButton deleting={deleting} onClick={() => void removeFavoriteRow(row, type as FavoriteType)} className="right-1.5 top-1.5" />}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="h-4 w-4 text-cyan-300" /> Teams
          </div>
          {loading ? (
            <div className="text-sm text-white/50">Loading teams...</div>
          ) : teams.length === 0 ? (
            <GlassCard className="p-4 text-sm text-white/45">No teams followed yet.</GlassCard>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((row) => (
                <TeamRow
                  key={String(row.id || row.entity_id)}
                  row={row}
                  deleting={deletingKey === `team:${String(row.entity_id || "")}`}
                  onDelete={() => void removeFavoriteRow(row, "team")}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Calendar className="h-4 w-4 text-violet-300" /> Players
          </div>
          {loading ? (
            <div className="text-sm text-white/50">Loading players...</div>
          ) : players.length === 0 ? (
            <GlassCard className="p-4 text-sm text-white/45">No players followed yet.</GlassCard>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {players.map((row) => (
                <PlayerRow
                  key={String(row.id || row.entity_id)}
                  row={row}
                  deleting={deletingKey === `player:${String(row.entity_id || "")}`}
                  onDelete={() => void removeFavoriteRow(row, "player")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
