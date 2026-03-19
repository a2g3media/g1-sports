import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import type { BracketMatchup } from "@/react-app/lib/ncaabTournamentData";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";

export function TournamentBracketShell({
  title,
  matchups,
  hotZones,
}: {
  title: string;
  matchups: BracketMatchup[];
  hotZones?: Record<string, { level: "low" | "medium" | "high"; score: number }>;
}) {
  const navigate = useNavigate();
  const regions = useMemo(() => Array.from(new Set(matchups.map((m) => m.region))), [matchups]);
  const rounds = useMemo(() => Array.from(new Set(matchups.map((m) => m.round))), [matchups]);
  const [activeRegion, setActiveRegion] = useState<string>("ALL");
  const [showHotZones, setShowHotZones] = useState(true);
  const filteredMatchups = useMemo(
    () => (activeRegion === "ALL" ? matchups : matchups.filter((m) => m.region === activeRegion)),
    [activeRegion, matchups]
  );
  const roundColumns = useMemo(
    () => rounds.map((round) => ({
      round,
      items: filteredMatchups.filter((m) => m.round === round),
    })),
    [filteredMatchups, rounds]
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <div className="flex gap-2 overflow-x-auto">
          {hotZones && (
            <button
              onClick={() => setShowHotZones((v) => !v)}
              className={`rounded-md px-2 py-1 text-xs ${showHotZones ? "bg-violet-400 text-black" : "bg-white/10 text-white/70"}`}
            >
              Coach G Hot Zones
            </button>
          )}
          <button
            onClick={() => setActiveRegion("ALL")}
            className={`rounded-md px-2 py-1 text-xs ${activeRegion === "ALL" ? "bg-white text-black" : "bg-white/10 text-white/70"}`}
          >
            All Regions
          </button>
          {regions.map((region) => (
            <button
              key={region}
              onClick={() => setActiveRegion(region)}
              className={`rounded-md px-2 py-1 text-xs ${activeRegion === region ? "bg-cyan-300 text-black" : "bg-white/10 text-white/70"}`}
            >
              {region}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-stretch gap-2 transition-all duration-300">
          {roundColumns.map((col, idx) => (
            <div key={col.round} className="flex items-stretch gap-2">
              <div className="w-[280px] rounded-xl border border-white/10 bg-black/20 p-3 transition-all duration-300 hover:border-cyan-300/30">
                <p className="mb-2 text-xs uppercase tracking-wider text-cyan-300">{col.round}</p>
                <div className="space-y-2">
                  {col.items.map((matchup) => {
                    const hot = showHotZones ? hotZones?.[matchup.gameId] : undefined;
                    return (
                      <button
                        key={matchup.id}
                        onClick={() => navigate(toGameDetailPath("ncaab", matchup.gameId))}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2 text-left transition-all duration-200 hover:bg-white/[0.1] hover:border-white/30"
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
                          <span>{matchup.region}</span>
                          {hot && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                                hot.level === "high"
                                  ? "bg-red-500/25 text-red-300"
                                  : hot.level === "medium"
                                    ? "bg-amber-500/25 text-amber-300"
                                    : "bg-emerald-500/25 text-emerald-300"
                              }`}
                            >
                              {hot.level} {hot.score}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-white">
                          {matchup.topSeed ? `#${matchup.topSeed}` : ""} {matchup.topTeam}
                        </div>
                        <div className="text-sm text-white/85">
                          {matchup.bottomSeed ? `#${matchup.bottomSeed}` : ""} {matchup.bottomTeam}
                        </div>
                        {matchup.winner && <div className="mt-1 text-xs text-emerald-300">Adv: {matchup.winner}</div>}
                      </button>
                    );
                  })}
                  {col.items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/10 p-2 text-xs text-white/40">
                      No matchup data for this round/region yet.
                    </div>
                  )}
                </div>
              </div>
              {idx < roundColumns.length - 1 && (
                <div className="hidden w-8 items-center justify-center md:flex">
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-cyan-200/70">
                    <div className="h-8 w-px bg-cyan-300/30" />
                    <span className="text-lg">→</span>
                    <div className="h-8 w-px bg-cyan-300/30" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

