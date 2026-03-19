import type { BracketViewMode } from "@/react-app/lib/ncaabTournamentData";

export function TournamentViewModeToggle({
  value,
  onChange,
}: {
  value: BracketViewMode;
  onChange: (mode: BracketViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/15 bg-black/35 p-1">
      <button
        type="button"
        onClick={() => onChange("classic")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          value === "classic" ? "bg-amber-200 text-black" : "text-white/75 hover:text-white"
        }`}
        aria-pressed={value === "classic"}
      >
        Classic Bracket
      </button>
      <button
        type="button"
        onClick={() => onChange("standard")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          value === "standard" ? "bg-white text-black" : "text-white/75 hover:text-white"
        }`}
        aria-pressed={value === "standard"}
      >
        Hybrid
      </button>
      <button
        type="button"
        onClick={() => onChange("live")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          value === "live" ? "bg-cyan-300 text-black" : "text-white/75 hover:text-white"
        }`}
        aria-pressed={value === "live"}
      >
        Live Bracket
      </button>
    </div>
  );
}

