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
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>{status}</span>;
}

export function TournamentGameCard({ game, from }: { game: TournamentGame; from?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() =>
        navigate(
          from
            ? `${toGameDetailPath("ncaab", game.id)}?from=${encodeURIComponent(from)}`
            : toGameDetailPath("ncaab", game.id)
        )
      }
      className="w-full rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-3 text-left hover:bg-white/[0.1]"
    >
      <div className="mb-2 flex items-center justify-between text-xs text-white/55">
        <span>{game.round}</span>
        <StatusChip status={game.status} />
      </div>
      <div className="text-white">
        <div className="flex items-center justify-between">
          <span>{game.awaySeed ? `#${game.awaySeed}` : ""} {game.awayTeam}</span>
          <span className="font-semibold">{game.awayScore ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{game.homeSeed ? `#${game.homeSeed}` : ""} {game.homeTeam}</span>
          <span className="font-semibold">{game.homeScore ?? "-"}</span>
        </div>
      </div>
      {(game.awayRecord || game.homeRecord) && (
        <div className="mt-2 text-xs text-white/45">
          {game.awayRecord || "--"} / {game.homeRecord || "--"}
        </div>
      )}
      {game.startTime && game.status === "SCHEDULED" && (
        <div className="mt-1 text-xs text-cyan-100/80">
          {new Date(game.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      )}
    </button>
  );
}

