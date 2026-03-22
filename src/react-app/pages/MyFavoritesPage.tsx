import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Calendar, ChevronRight, Sparkles, Star, Users } from "lucide-react";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";
import { useFavorites } from "@/react-app/hooks/useFavorites";
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

function TeamRow({ row }: { row: AnyRecord }) {
  const teamCode = String(row.team_code || "").toUpperCase();
  const teamName = String(row.team_name || row.entity_id || "Team");
  const sport = String(row.sport || "nba");
  const game = (row.next_game || null) as AnyRecord | null;
  const odds = (row.current_odds || null) as AnyRecord | null;
  const isLive = Boolean(row.is_live);
  const home = String(game?.home_team || game?.home_team_name || "");
  const away = String(game?.away_team || game?.away_team_name || "");

  return (
    <GlassCard className="p-4">
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
          <div className="text-white/45">Next game syncing...</div>
        )}
      </div>
      {odds && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
            <div className="text-white/40">Spread</div>
            <div className="text-white">{String(odds.spread_home ?? "-")}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
            <div className="text-white/40">Total</div>
            <div className="text-white">{String(odds.total ?? "-")}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
            <div className="text-white/40">ML</div>
            <div className="text-white">{String(odds.moneyline_home ?? "-")}</div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function PlayerRow({ row }: { row: AnyRecord }) {
  const playerName = String(row.player_name || row.entity_id || "Player");
  const teamCode = String(row.team_code || "");
  const sport = String(row.sport || "nba");
  const props = Array.isArray(row.props) ? (row.props as AnyRecord[]) : [];
  const topProp = props[0] || null;
  const game = (row.next_game || null) as AnyRecord | null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <PlayerPhoto playerName={playerName} sport={sport} size={34} className="border border-white/10" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{playerName}</div>
          <div className="text-xs text-white/50 uppercase">{sport} {teamCode ? `• ${teamCode}` : ""}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-white/70">
        {topProp ? (
          <div className="truncate">
            {String(topProp.prop_type || "Prop")} {String(topProp.line ?? "-")}
          </div>
        ) : (
          <div className="text-white/45">Props syncing...</div>
        )}
        <div className="mt-1 text-white/45">
          {game ? formatStart(game.start_time) : "Next game syncing..."}
        </div>
      </div>
    </GlassCard>
  );
}

export default function MyFavoritesPage() {
  const { fetchDashboard } = useFavorites();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<AnyRecord | null>(null);

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
                <TeamRow key={String(row.id || row.entity_id)} row={row} />
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
                <PlayerRow key={String(row.id || row.entity_id)} row={row} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
