import { BracketOverlayBadge } from "@/react-app/components/tournament/BracketOverlayBadge";
import { TeamRow } from "@/react-app/components/tournament/TeamRow";
import type { BracketViewMode, LiveBracketMatchup } from "@/react-app/lib/ncaabTournamentData";
import { cn } from "@/react-app/lib/utils";

function statusClass(matchup: LiveBracketMatchup, mode: BracketViewMode): string {
  if (matchup.state === "overtime") {
    return mode === "live"
      ? "border-fuchsia-300/70 bg-fuchsia-500/10 shadow-[0_0_34px_rgba(217,70,239,0.22)]"
      : "border-fuchsia-300/40 bg-fuchsia-500/5";
  }
  if (matchup.state === "live" || matchup.state === "overtime") {
    return mode === "live"
      ? "border-cyan-300/60 bg-cyan-500/10 shadow-[0_0_30px_rgba(56,189,248,0.2)]"
      : "border-cyan-300/35 bg-cyan-500/5";
  }
  if (matchup.state === "final") return "border-emerald-300/35 bg-emerald-500/5";
  return "border-white/10 bg-white/[0.03]";
}

export function MatchupNode({
  matchup,
  mode,
  selectedTeam,
  highlighted,
  onOpenMatchup,
  onSelectTeam,
  onHover,
  onFocus,
}: {
  matchup: LiveBracketMatchup;
  mode: BracketViewMode;
  selectedTeam?: string | null;
  highlighted?: boolean;
  onOpenMatchup: (gameId: string) => void;
  onSelectTeam: (teamName: string) => void;
  onHover?: (matchupId: string | null) => void;
  onFocus?: (matchupId: string) => void;
}) {
  const isClassic = mode === "classic";
  const topSelected = Boolean(selectedTeam) && matchup.topTeam.name === selectedTeam;
  const bottomSelected = Boolean(selectedTeam) && matchup.bottomTeam.name === selectedTeam;
  const label = matchup.state === "upcoming"
    ? matchup.startTimeLabel || matchup.statusLabel
    : matchup.clockLabel
      ? `${matchup.statusLabel} ${matchup.clockLabel}`
      : matchup.statusLabel;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenMatchup(matchup.gameId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenMatchup(matchup.gameId);
        }
      }}
      onMouseEnter={() => onHover?.(matchup.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "w-full rounded-xl border p-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
        isClassic && "rounded-md border-white/20 bg-[#111625]",
        statusClass(matchup, mode),
        highlighted && "ring-2 ring-cyan-300/60",
        (matchup.state === "live" || matchup.state === "overtime") && mode === "live" && "motion-safe:animate-pulse"
      )}
      aria-label={`Open ${matchup.topTeam.name} versus ${matchup.bottomTeam.name}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
          {matchup.region} - {matchup.round}
        </p>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide",
              matchup.state === "live" || matchup.state === "overtime"
                ? "bg-red-500/20 text-red-200"
                : matchup.state === "final"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-white/10 text-white/70"
            )}
          >
            {label}
          </span>
          {!isClassic && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocus?.(matchup.id);
              }}
              className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/70 hover:text-white"
              aria-label={`Quick view ${matchup.topTeam.name} versus ${matchup.bottomTeam.name}`}
            >
              Info
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <TeamRow
          team={matchup.topTeam}
          onSelect={onSelectTeam}
          selected={topSelected}
          muted={Boolean(matchup.winnerName) && !matchup.topTeam.isWinner}
        />
        <TeamRow
          team={matchup.bottomTeam}
          onSelect={onSelectTeam}
          selected={bottomSelected}
          muted={Boolean(matchup.winnerName) && !matchup.bottomTeam.isWinner}
        />
      </div>
      {!isClassic && <BracketOverlayBadge overlays={matchup.overlays} />}
    </div>
  );
}

