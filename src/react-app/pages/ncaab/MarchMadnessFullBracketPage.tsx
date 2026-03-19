import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PosterBracketCanvas } from "@/react-app/components/tournament/PosterBracketCanvas";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import {
  buildMarchMadnessMatchupsFromGames,
  buildLiveBracketTree,
  computeUpsetWatch,
  MARCH_MADNESS_GAMES,
  mergeTournamentFeeds,
  resolveNavigableTournamentGameId,
  type TournamentGame,
} from "@/react-app/lib/ncaabTournamentData";
import { getNcaabTournamentState } from "@/react-app/lib/ncaabTournamentSeason";

export default function MarchMadnessFullBracketPage() {
  const navigate = useNavigate();
  const [providerGames, setProviderGames] = useState<unknown[]>([]);

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
      const start = new Date(Date.UTC(year, 2, 16));
      const end = new Date(Date.UTC(year, 3, 9));
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

      const priorityResponses = await Promise.all(priorityDates.map((date) => fetchDateGames(date)));
      for (const group of priorityResponses) {
        commitProviderGames(group);
      }

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
        // Keep fallback dataset when feed fails.
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
  const hotZones = useMemo(
    () =>
      Object.fromEntries(
        games.map((game) => {
          const model = computeUpsetWatch(game);
          return [game.id, { upsetLevel: model.level }] as const;
        })
      ),
    [games]
  );
  const marchMatchups = useMemo(
    () => buildMarchMadnessMatchupsFromGames(games),
    [games]
  );
  const bracketTree = useMemo(
    () => buildLiveBracketTree("march_madness", games, marchMatchups, hotZones),
    [games, marchMatchups, hotZones]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#06080f] via-[#090f1a] to-[#06080f] p-3 md:p-4">
      <div className="mx-auto max-w-[1800px] space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/70">Full Bracket Pager</p>
            <h1 className="text-lg font-black text-white md:text-xl">
              March Madness - {seasonState.currentRoundLabel}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/sports/ncaab/tournament/march-madness")}
              className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100"
            >
              Back To Command Center
            </button>
            <button
              type="button"
              onClick={() => navigate("/sports/ncaab/tournament")}
              className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"
            >
              Back To Tournament Central
            </button>
            <button
              type="button"
              onClick={() => navigate("/sports/ncaab")}
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Back To NCAAB Hub
            </button>
          </div>
        </header>

        <PosterBracketCanvas
          tree={bracketTree}
          onOpenGame={(gameId) => {
            const resolvedGameId = resolveNavigableTournamentGameId(gameId, games, marchMatchups);
            if (!resolvedGameId || /^mm-/.test(resolvedGameId) || /-game-/.test(resolvedGameId) || resolvedGameId.startsWith("placeholder-")) {
              navigate("/games?sport=NCAAB");
              return;
            }
            navigate(`${toGameDetailPath("ncaab", resolvedGameId)}?from=ncaab-march-full`);
          }}
        />
      </div>
    </div>
  );
}

