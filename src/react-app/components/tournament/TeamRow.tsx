import { TeamLogo } from "@/react-app/components/TeamLogo";
import type { LiveBracketTeam } from "@/react-app/lib/ncaabTournamentData";
import { cn } from "@/react-app/lib/utils";

export function TeamRow({
  team,
  onSelect,
  selected,
  muted,
}: {
  team: LiveBracketTeam;
  onSelect: (teamName: string) => void;
  selected?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(team.name);
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
        team.isWinner ? "border-emerald-300/55 bg-emerald-400/10" : "border-white/10 bg-white/[0.03]",
        selected && "border-cyan-300/70 bg-cyan-500/10",
        muted && "opacity-55"
      )}
      aria-label={`Highlight ${team.name} bracket path`}
    >
      <TeamLogo teamCode={team.logoCode} sport="ncaab" size={21} winnerGlow={Boolean(team.isWinner)} />
      <span className="w-6 text-center font-mono text-[11px] font-semibold tabular-nums text-cyan-200/90">
        {team.seed ? `#${team.seed}` : "--"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold leading-none text-white">{team.shortName}</p>
        {team.record && <p className="mt-0.5 truncate text-[10px] leading-none text-white/50">{team.record}</p>}
      </div>
      <span className="w-7 text-right font-mono text-sm font-black tabular-nums text-white">
        {Number.isFinite(team.score) ? team.score : "-"}
      </span>
    </button>
  );
}

