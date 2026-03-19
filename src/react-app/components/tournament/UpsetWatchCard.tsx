export function UpsetWatchCard({
  matchup,
  alertLevel,
  reason,
}: {
  matchup: string;
  alertLevel: "low" | "medium" | "high";
  reason: string;
}) {
  const styles = {
    low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    high: "border-red-500/30 bg-red-500/10 text-red-300",
  }[alertLevel];

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide">
        <span>Upset Watch</span>
        <span>{alertLevel} alert</span>
      </div>
      <h4 className="text-sm font-semibold text-white">{matchup}</h4>
      <p className="mt-1 text-xs text-white/75">{reason}</p>
    </div>
  );
}

