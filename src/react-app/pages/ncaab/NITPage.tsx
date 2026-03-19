import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CoachGTournamentPulse } from "@/react-app/components/tournament/CoachGTournamentPulse";
import { InsightCard } from "@/react-app/components/tournament/InsightCard";
import { LiveScorePills } from "@/react-app/components/tournament/LiveScorePills";
import { TournamentArchivePanel } from "@/react-app/components/tournament/TournamentArchivePanel";
import { TournamentBracketShell } from "@/react-app/components/tournament/TournamentBracketShell";
import { TournamentGameCard } from "@/react-app/components/tournament/TournamentGameCard";
import { TournamentHero } from "@/react-app/components/tournament/TournamentHero";
import {
  computeUpsetWatch,
  NIT_BRACKET_MATCHUPS,
  NIT_GAMES,
  NIT_INSIGHTS,
  mergeTournamentFeeds,
  type TournamentGame,
} from "@/react-app/lib/ncaabTournamentData";
import { getNcaabTournamentState } from "@/react-app/lib/ncaabTournamentSeason";

export default function NITPage() {
  const navigate = useNavigate();
  const [providerGames, setProviderGames] = useState<unknown[]>([]);

  useEffect(() => {
    let active = true;
    const loadGames = async () => {
      try {
        const res = await fetch("/api/games?sport=ncaab", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (!active) return;
        setProviderGames(Array.isArray(payload?.games) ? payload.games : []);
      } catch {
        // Keep fallback data if feed request fails.
      }
    };
    void loadGames();
    const pollId = window.setInterval(() => {
      void loadGames();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, []);

  const seasonState = getNcaabTournamentState();
  const games = useMemo<TournamentGame[]>(
    () => mergeTournamentFeeds(NIT_GAMES, providerGames, "nit"),
    [providerGames]
  );
  const completed = useMemo(() => games.filter((g) => g.status === "FINAL"), [games]);
  const hotZones = useMemo(
    () =>
      Object.fromEntries(
        games.map((g) => {
          const model = computeUpsetWatch(g);
          return [g.id, { level: model.level, score: model.score }] as const;
        })
      ),
    [games]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#090b14] via-[#0d1222] to-[#090b14] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <TournamentHero
          title="NIT"
          subtitle="National Invitation Tournament"
          roundLabel={seasonState.phase === "post_tournament" ? "Final Archived State" : "Current Round"}
          tabs={[
            { key: "bracket", label: "Bracket" },
            { key: "games", label: "Today" },
            { key: "results", label: "Results" },
          ]}
          activeTab="bracket"
          onTabSelect={() => {
            // Keep NIT page lightweight for this release.
          }}
          tone="secondary"
        />
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <button
            type="button"
            onClick={() => navigate("/sports/ncaab/tournament")}
            className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15"
          >
            Back To Tournament Central
          </button>
          <button
            type="button"
            onClick={() => navigate("/sports/ncaab")}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
          >
            Back To NCAAB Hub
          </button>
        </div>

        <CoachGTournamentPulse
          lines={[
            "NIT edge: teams with strong free-throw profiles close better late.",
            "Watch quarterfinal pace shifts after halftime adjustments.",
          ]}
          onAskCoachG={() => navigate("/scout?q=NIT best game angles tonight")}
        />

        <LiveScorePills games={games.filter((g) => g.status !== "FINAL")} />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <TournamentBracketShell title="NIT Bracket" matchups={NIT_BRACKET_MATCHUPS} hotZones={hotZones} />
        </motion.div>

        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-3">
          <h2 className="text-xl font-bold text-white">Today&apos;s NIT Games</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {games.map((game) => (
              <TournamentGameCard key={game.id} game={game} />
            ))}
          </div>
        </motion.section>

        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">NIT Results</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {completed.map((game) => (
                <TournamentGameCard key={`result-${game.id}`} game={game} />
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-2">
          {NIT_INSIGHTS.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </section>

        {seasonState.phase === "post_tournament" && (
          <TournamentArchivePanel
            seasonLabel={`${seasonState.seasonYear} NIT Archive`}
            summary="NIT bracket and final results remain available in archive mode."
            onOpen={() => navigate("/sports/ncaab/tournament")}
          />
        )}
      </div>
    </div>
  );
}

