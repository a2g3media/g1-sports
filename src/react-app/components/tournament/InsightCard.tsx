import type { TournamentInsight } from "@/react-app/lib/ncaabTournamentData";

export function InsightCard({ insight }: { insight: TournamentInsight }) {
  return (
    <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="uppercase tracking-wide text-violet-200">{insight.type.replace("_", " ")}</span>
        <span className="text-violet-300">{insight.confidence}%</span>
      </div>
      <h4 className="text-sm font-semibold text-white">{insight.headline}</h4>
      <p className="mt-1 text-xs text-white/70">{insight.rationale}</p>
    </div>
  );
}

