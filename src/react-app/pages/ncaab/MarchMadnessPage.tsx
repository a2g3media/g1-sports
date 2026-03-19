import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CinderellaTracker } from "@/react-app/components/tournament/CinderellaTracker";
import { CoachGTournamentPulse } from "@/react-app/components/tournament/CoachGTournamentPulse";
import { InsightCard } from "@/react-app/components/tournament/InsightCard";
import { LiveBracketCanvas } from "@/react-app/components/tournament/LiveBracketCanvas";
import { LiveScorePills } from "@/react-app/components/tournament/LiveScorePills";
import { TournamentArchivePanel } from "@/react-app/components/tournament/TournamentArchivePanel";
import { TournamentGameCard } from "@/react-app/components/tournament/TournamentGameCard";
import { UpsetWatchCard } from "@/react-app/components/tournament/UpsetWatchCard";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import {
  buildMarchMadnessMatchupsFromGames,
  buildLiveBracketTree,
  computeUpsetWatch,
  type BracketViewMode,
  MARCH_INSIGHTS,
  MARCH_MADNESS_GAMES,
  mergeTournamentFeeds,
  resolveNavigableTournamentGameId,
  type TournamentGame,
} from "@/react-app/lib/ncaabTournamentData";
import { getNcaabTournamentState } from "@/react-app/lib/ncaabTournamentSeason";

export default function MarchMadnessPage() {
  const navigate = useNavigate();
  const [providerGames, setProviderGames] = useState<unknown[]>([]);
  const [viewMode, setViewMode] = useState<BracketViewMode>("live");

  useEffect(() => {
    let active = true;
    const CACHE_KEY = "march_madness_provider_games_v1";
    const dedupeGames = (rows: unknown[]): unknown[] => {
      const out: unknown[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const g = (row || {}) as Record<string, unknown>;
        const key = String(g.game_id || g.id || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
      return out;
    };
    const commitProviderGames = (rows: unknown[]) => {
      if (!active || rows.length === 0) return;
      setProviderGames((prev) => {
        const merged = dedupeGames([...prev, ...rows]);
        try {
          window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        } catch {
          // Non-fatal cache write.
        }
        return merged;
      });
    };

    const buildWindowDates = (): string[] => {
      const now = new Date();
      const year = now.getFullYear();
      const start = new Date(Date.UTC(year, 2, 16)); // Mar 16
      const end = new Date(Date.UTC(year, 3, 9)); // Apr 9
      const dates: string[] = [];
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${day}`);
      }
      return dates;
    };

    const buildPriorityDates = (): string[] => {
      const now = new Date();
      const year = now.getFullYear();
      // Prioritize the heaviest visual rounds first.
      return [
        `${year}-03-19`,
        `${year}-03-20`,
        `${year}-03-21`,
        `${year}-03-22`,
        `${year}-03-17`,
        `${year}-03-18`,
      ];
    };

    const fetchDateGames = async (date: string): Promise<unknown[]> => {
      try {
        const res = await fetch(`/api/games?sport=ncaab&includeOdds=0&date=${encodeURIComponent(date)}`, { cache: "no-store" });
        if (!res.ok) return [];
        const payload = await res.json();
        return Array.isArray(payload?.games) ? payload.games : [];
      } catch {
        return [];
      }
    };

    const loadWindowGames = async () => {
      const allDates = buildWindowDates();
      const priorityDates = buildPriorityDates();
      const prioritySet = new Set(priorityDates);
      const remainingDates = allDates.filter((d) => !prioritySet.has(d));

      // First paint: fetch high-value dates immediately.
      const priorityResponses = await Promise.all(priorityDates.map((date) => fetchDateGames(date)));
      for (const group of priorityResponses) {
        commitProviderGames(group);
      }

      // Backfill the rest in batches and stream into state.
      for (let i = 0; i < remainingDates.length; i += 6) {
        const slice = remainingDates.slice(i, i + 6);
        const responses = await Promise.all(slice.map((date) => fetchDateGames(date)));
        for (const group of responses) {
          commitProviderGames(group);
        }
      }
    };

    const loadGames = async () => {
      try {
        try {
          const cached = window.sessionStorage.getItem(CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setProviderGames(dedupeGames(parsed));
            }
          }
        } catch {
          // Cache read failure is non-fatal.
        }

        const res = await fetch("/api/games?sport=ncaab&includeOdds=0", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (!active) return;
        const todayGames = Array.isArray(payload?.games) ? payload.games : [];
        commitProviderGames(todayGames);
        await loadWindowGames();
      } catch {
        // Keep fallback tournament dataset.
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
    () => mergeTournamentFeeds(MARCH_MADNESS_GAMES, providerGames, "march_madness"),
    [providerGames]
  );
  const liveOrUpcoming = useMemo(
    () => games.filter((g) => g.status === "LIVE" || g.status === "SCHEDULED"),
    [games]
  );
  const finalGames = useMemo(() => games.filter((g) => g.status === "FINAL"), [games]);
  const upsetModels = useMemo(
    () =>
      games.map((game) => ({
        game,
        model: computeUpsetWatch(game),
      })),
    [games]
  );
  const hotZones = useMemo(
    () =>
      Object.fromEntries(
        upsetModels.map(({ game, model }) => [
          game.id,
          { upsetLevel: model.level },
        ])
      ),
    [upsetModels]
  );
  const marchMatchups = useMemo(
    () => buildMarchMadnessMatchupsFromGames(games),
    [games]
  );
  const bracketTree = useMemo(
    () =>
      buildLiveBracketTree("march_madness", games, marchMatchups, hotZones),
    [games, marchMatchups, hotZones]
  );
  const cinderellas = useMemo(
    () =>
      games
        .filter((g) => (g.awaySeed ?? 99) >= 11 || (g.homeSeed ?? 99) >= 11)
        .slice(0, 6)
        .map((g) => {
          const candidateAway = (g.awaySeed ?? 0) >= 11;
          const team = candidateAway ? g.awayTeam : g.homeTeam;
          const seed = candidateAway ? (g.awaySeed ?? 11) : (g.homeSeed ?? 11);
          return { team, seed, roundReached: g.round };
        }),
    [games]
  );
  const pulseLines = useMemo(() => {
    const sorted = [...upsetModels].sort((a, b) => b.model.score - a.model.score);
    const top = sorted[0];
    const second = sorted[1];
    const lines: string[] = [];
    if (top) lines.push(`Highest upset pressure: ${top.game.awayTeam} vs ${top.game.homeTeam} (${top.model.level.toUpperCase()})`);
    if (second) lines.push(`Watchlist game: ${second.game.awayTeam} vs ${second.game.homeTeam} (${second.model.level.toUpperCase()})`);
    lines.push(`Round context: ${seasonState.currentRoundLabel} focus on tempo swings and late-game free throws.`);
    return lines;
  }, [upsetModels, seasonState.currentRoundLabel]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080a14] via-[#0b1020] to-[#080a14] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="sticky top-14 z-30 rounded-xl border border-white/10 bg-black/55 p-2 backdrop-blur-md">
          <LiveScorePills games={liveOrUpcoming} />
        </div>

        <header className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">March Madness Live Bracket</p>
              <h1 className="text-2xl font-black text-white md:text-3xl">Tournament Command Canvas</h1>
              <p className="text-sm text-white/70">{seasonState.currentRoundLabel} - live tournament visualization with interactive paths and Coach G overlays.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <button
                type="button"
                onClick={() => navigate("/sports/ncaab/tournament/march-madness/full")}
                className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
              >
                Open Full Bracket Pager
              </button>
            </div>
          </div>
        </header>

        <LiveBracketCanvas
          tree={bracketTree}
          mode={viewMode}
          onModeChange={setViewMode}
          onOpenGame={(gameId) => {
            const resolvedGameId = resolveNavigableTournamentGameId(gameId, games, marchMatchups);
            if (!resolvedGameId || /^mm-/.test(resolvedGameId) || /-game-/.test(resolvedGameId) || resolvedGameId.startsWith("placeholder-")) {
              navigate("/games?sport=NCAAB");
              return;
            }
            navigate(`${toGameDetailPath("ncaab", resolvedGameId)}?from=ncaab-march-command`);
          }}
        />

        <CoachGTournamentPulse
          lines={pulseLines}
          onAskCoachG={() => navigate("/scout?q=March Madness upset watch and bracket hot zones")}
        />

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          <h2 className="text-lg font-bold text-white">Today&apos;s Tournament Games</h2>
          {games.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/15 bg-black/25 p-3 text-sm text-white/70">
              Live tournament games are not available yet from the provider feed.
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {games.map((game) => (
              <TournamentGameCard key={game.id} game={game} from="ncaab-march-command" />
            ))}
          </div>
          {finalGames.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Recently Completed</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {finalGames.map((game) => (
                  <TournamentGameCard key={`final-${game.id}`} game={game} from="ncaab-march-command" />
                ))}
              </div>
            </div>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid gap-3 md:grid-cols-2"
        >
          {MARCH_INSIGHTS.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </motion.section>

        <section className="grid gap-3 md:grid-cols-2">
          {upsetModels.slice(0, 6).map(({ game, model }) => (
            <UpsetWatchCard
              key={`upset-${game.id}`}
              matchup={`${game.awayTeam} vs ${game.homeTeam}`}
              alertLevel={model.level}
              reason={model.reason}
            />
          ))}
        </section>

        <CinderellaTracker teams={cinderellas.length > 0 ? cinderellas : [
          { team: "No lower-seeded teams identified yet", seed: 0, roundReached: seasonState.currentRoundLabel },
        ]} />

        {seasonState.phase === "post_tournament" && (
          <TournamentArchivePanel
            seasonLabel={`${seasonState.seasonYear} Tournament Archive`}
            summary={`Final state preserved. Completed games: ${finalGames.length}.`}
            onOpen={() => navigate("/sports/ncaab/tournament/march-madness/full")}
          />
        )}
      </div>
    </div>
  );
}

