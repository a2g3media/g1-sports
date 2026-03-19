import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import type { TournamentGame } from "@/react-app/lib/ncaabTournamentData";
import { useNavigate } from "react-router-dom";

function StatusChip({ status }: { status: TournamentGame["status"] }) {
  const tone =
    status === "LIVE"
      ? "bg-red-500/25 text-red-200 border-red-400/40"
      : status === "FINAL"
        ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/35"
        : "bg-cyan-500/20 text-cyan-100 border-cyan-300/35";
  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>{status}</span>;
}

export function LiveScorePills({ games }: { games: TournamentGame[] }) {
  const navigate = useNavigate();
  if (games.length === 0) return null;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-2">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => navigate(toGameDetailPath("ncaab", game.id))}
            className="min-w-[220px] rounded-xl border border-white/15 bg-gradient-to-br from-[#141a2d] to-[#0f1220] px-3 py-2 text-left hover:bg-white/[0.12]"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-white/60">
              <span className="truncate">{game.round}</span>
              <div className="flex items-center gap-1">
                {game.status === "LIVE" && <span className="h-1.5 w-1.5 rounded-full bg-red-300 animate-pulse" />}
                <StatusChip status={game.status} />
              </div>
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{game.awaySeed ? `#${game.awaySeed} ` : ""}{game.awayTeam.slice(0, 3).toUpperCase()}</span>
                <span>{game.awayScore ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{game.homeSeed ? `#${game.homeSeed} ` : ""}{game.homeTeam.slice(0, 3).toUpperCase()}</span>
                <span>{game.homeScore ?? "-"}</span>
              </div>
            </div>
            {(game.awayRecord || game.homeRecord) && (
              <div className="mt-1 text-[11px] text-white/45">
                {game.awayRecord || "--"} vs {game.homeRecord || "--"}
              </div>
            )}
            {game.startTime && game.status !== "LIVE" && (
              <div className="mt-1 text-[11px] text-white/45">
                {new Date(game.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </div>
            )}
            {game.startTime && game.status === "LIVE" && (
              <div className="mt-1 text-[11px] text-red-200/80">
                Live now
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

