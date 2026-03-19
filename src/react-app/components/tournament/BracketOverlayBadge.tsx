import type { BracketOverlaySignals } from "@/react-app/lib/ncaabTournamentData";

export function BracketOverlayBadge({
  overlays,
}: {
  overlays: BracketOverlaySignals;
}) {
  const badges: { key: string; label: string; className: string }[] = [];
  if (overlays.upsetLevel === "high") badges.push({ key: "upset", label: "UPSET ALERT", className: "bg-red-500/20 text-red-200 border-red-300/35" });
  if (overlays.completedUpset) badges.push({ key: "flame", label: "UPSET COMPLETE", className: "bg-orange-500/20 text-orange-200 border-orange-300/35" });
  if (overlays.closeGame) badges.push({ key: "close", label: "CLOSE GAME", className: "bg-amber-500/20 text-amber-100 border-amber-300/35" });
  if (overlays.cinderella) badges.push({ key: "cinderella", label: "CINDERELLA", className: "bg-violet-500/20 text-violet-200 border-violet-300/35" });
  if (overlays.coachGPick) badges.push({ key: "pick", label: "COACH G PICK", className: "bg-cyan-500/20 text-cyan-100 border-cyan-300/35" });
  if (Number.isFinite(overlays.winProbabilityPct)) badges.push({ key: "wp", label: `WIN ${Math.round(Number(overlays.winProbabilityPct))}%`, className: "bg-emerald-500/20 text-emerald-100 border-emerald-300/35" });
  if (Number.isFinite(overlays.publicPickPct)) badges.push({ key: "public", label: `PUBLIC ${Math.round(Number(overlays.publicPickPct))}%`, className: "bg-slate-500/25 text-slate-100 border-slate-300/35" });

  if (badges.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {badges.slice(0, 4).map((badge) => (
        <span
          key={badge.key}
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

