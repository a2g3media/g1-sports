import { MatchupNode } from "@/react-app/components/tournament/MatchupNode";
import type { BracketViewMode, LiveBracketRound } from "@/react-app/lib/ncaabTournamentData";

export function BracketRoundColumn({
  round,
  mode,
  selectedTeam,
  highlightedMatchupIds,
  onOpenMatchup,
  onSelectTeam,
  onHoverMatchup,
  onFocusMatchup,
}: {
  round: LiveBracketRound;
  mode: BracketViewMode;
  selectedTeam?: string | null;
  highlightedMatchupIds: Set<string>;
  onOpenMatchup: (gameId: string) => void;
  onSelectTeam: (teamName: string) => void;
  onHoverMatchup?: (matchupId: string | null) => void;
  onFocusMatchup?: (matchupId: string) => void;
}) {
  return (
    <div className="w-[280px] rounded-xl border border-white/10 bg-black/25 p-2.5 md:w-[296px]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">{round.label}</p>
      <div className="space-y-2.5">
        {round.matchups.map((matchup) => (
          <MatchupNode
            key={matchup.id}
            matchup={matchup}
            mode={mode}
            selectedTeam={selectedTeam}
            highlighted={highlightedMatchupIds.has(matchup.id)}
            onOpenMatchup={onOpenMatchup}
            onSelectTeam={onSelectTeam}
            onHover={onHoverMatchup}
            onFocus={onFocusMatchup}
          />
        ))}
      </div>
    </div>
  );
}

