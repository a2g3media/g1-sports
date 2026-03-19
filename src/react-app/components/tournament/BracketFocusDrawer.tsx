import type { LiveBracketMatchup } from "@/react-app/lib/ncaabTournamentData";

export function BracketFocusDrawer({
  matchup,
  onOpen,
}: {
  matchup?: LiveBracketMatchup;
  onOpen: (gameId: string) => void;
}) {
  if (!matchup) return null;

  return (
    <div className="rounded-xl border border-cyan-300/25 bg-[#0b1222]/90 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
          {matchup.round} - {matchup.region}
        </p>
        <button
          type="button"
          onClick={() => onOpen(matchup.gameId)}
          className="rounded-md bg-cyan-300 px-2 py-1 text-xs font-bold text-black"
        >
          Open Game
        </button>
      </div>
      <p className="mt-2 text-sm text-white">
        {matchup.topTeam.name} vs {matchup.bottomTeam.name}
      </p>
      <p className="text-xs text-white/70">
        {matchup.statusLabel}
        {matchup.clockLabel ? ` - ${matchup.clockLabel}` : ""}
        {matchup.startTimeLabel ? ` - ${matchup.startTimeLabel}` : ""}
      </p>
    </div>
  );
}

