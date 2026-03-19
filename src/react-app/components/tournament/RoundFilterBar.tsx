export function RoundFilterBar({
  rounds,
  regions,
  activeRound,
  activeRegion,
  onRoundChange,
  onRegionChange,
  onQuickJump,
}: {
  rounds: string[];
  regions: string[];
  activeRound: string;
  activeRegion: string;
  onRoundChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onQuickJump: (target: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
          Round
          <select
            value={activeRound}
            onChange={(e) => onRoundChange(e.target.value)}
            className="ml-2 rounded-md border border-white/15 bg-black/60 px-2 py-1 text-xs text-white"
          >
            <option value="ALL">All</option>
            {rounds.map((round) => (
              <option key={round} value={round}>
                {round}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
          Region
          <select
            value={activeRegion}
            onChange={(e) => onRegionChange(e.target.value)}
            className="ml-2 rounded-md border border-white/15 bg-black/60 px-2 py-1 text-xs text-white"
          >
            <option value="ALL">All</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex flex-wrap gap-1">
          <button type="button" onClick={() => onQuickJump("final-four")} className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:text-white">
            Final Four
          </button>
          <button type="button" onClick={() => onQuickJump("championship")} className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:text-white">
            Championship
          </button>
        </div>
      </div>
    </div>
  );
}

