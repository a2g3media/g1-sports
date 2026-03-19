import { BracketConnector } from "@/react-app/components/tournament/BracketConnector";
import { BracketRoundColumn } from "@/react-app/components/tournament/BracketRoundColumn";
import type { BracketViewMode, LiveBracketRegion } from "@/react-app/lib/ncaabTournamentData";

export function BracketRegion({
  region,
  mode,
  selectedTeam,
  highlightedMatchupIds,
  onOpenMatchup,
  onSelectTeam,
  onHoverMatchup,
  onFocusMatchup,
}: {
  region: LiveBracketRegion;
  mode: BracketViewMode;
  selectedTeam?: string | null;
  highlightedMatchupIds: Set<string>;
  onOpenMatchup: (gameId: string) => void;
  onSelectTeam: (teamName: string) => void;
  onHoverMatchup?: (matchupId: string | null) => void;
  onFocusMatchup?: (matchupId: string) => void;
}) {
  const connectorActive = Boolean(selectedTeam) || mode === "classic";
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-white/70">{region.label}</h3>
      <div className="flex min-w-max items-stretch gap-2">
        {region.rounds.map((round, idx) => (
          <div key={`${region.key}-${round.key}`} className="flex items-stretch gap-2">
            <BracketRoundColumn
              round={round}
              mode={mode}
              selectedTeam={selectedTeam}
              highlightedMatchupIds={highlightedMatchupIds}
              onOpenMatchup={onOpenMatchup}
              onSelectTeam={onSelectTeam}
              onHoverMatchup={onHoverMatchup}
              onFocusMatchup={onFocusMatchup}
            />
            {idx < region.rounds.length - 1 && <BracketConnector mode={mode} active={connectorActive} />}
          </div>
        ))}
      </div>
    </section>
  );
}

