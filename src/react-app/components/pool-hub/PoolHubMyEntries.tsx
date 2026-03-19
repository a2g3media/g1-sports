import { useEffect, useMemo, useState } from "react";
import { BarChart3, Calendar, Flame, History, Loader2, Skull, TrendingUp } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  member_count: number;
}

interface PoolHubMyEntriesProps {
  league: League;
}

interface EntryHistoryResponse {
  entries: Array<{
    id: number;
    entryNumber: number;
    entryName: string;
    status: string;
    seasonStats: {
      totalPoints: number;
      correctPicks: number;
      totalPicks: number;
      winPercentage: number;
      currentStreak: number;
      bestStreak: number;
      rank: number | null;
    };
    weeklyTracking: Array<{
      periodId: string;
      pointsEarned: number;
      totalPoints: number;
      rank: number | null;
      rankDelta: number;
      correctPicks: number;
      totalPicks: number;
      winPercentage: number;
    }>;
    elimination: {
      isEliminated: boolean;
      livesRemaining: number | null;
      eliminatedPeriod: string | null;
      reentryFromEntryId: number | null;
    };
    timeline: Array<{
      eventType: string;
      periodId: string | null;
      createdAt: string;
      details: string;
    }>;
    pickDistribution: {
      periodId: string | null;
      items: Array<{
        pickValue: string;
        count: number;
        percentage: number;
        isYourPick: boolean;
      }>;
    };
    weeklyRecap: {
      periodId: string | null;
      topScorer: string | null;
      mostPickedTeam: string | null;
      biggestUpset: string | null;
    };
  }>;
}

export function PoolHubMyEntries({ league }: PoolHubMyEntriesProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<EntryHistoryResponse>({ entries: [] });
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/leagues/${league.id}/my-entries/history`);
        const payload = await res.json().catch(() => ({ entries: [] }));
        if (!res.ok) throw new Error(payload.error || "Failed to load entry history.");
        if (cancelled) return;
        setData(payload as EntryHistoryResponse);
        const firstEntry = (payload as EntryHistoryResponse).entries?.[0];
        setSelectedEntryId(firstEntry?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load entry history.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [league.id]);

  const selectedEntry = useMemo(
    () => data.entries.find((entry) => entry.id === selectedEntryId) || data.entries[0] || null,
    [data.entries, selectedEntryId],
  );

  if (isLoading) {
    return (
      <div className="card-elevated p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading entry history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-elevated p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!selectedEntry) {
    return (
      <div className="card-elevated p-6 text-sm text-muted-foreground">
        No entries available yet.
      </div>
    );
  }

  const latestWeek = selectedEntry.weeklyTracking[selectedEntry.weeklyTracking.length - 1];
  const rankChartPoints = selectedEntry.weeklyTracking
    .filter((week) => typeof week.rank === "number" && Number.isFinite(week.rank))
    .slice(-10);
  const maxRankInChart = rankChartPoints.reduce((max, week) => Math.max(max, Number(week.rank || 0)), 1);

  return (
    <div className="space-y-6 animate-page-enter">
      <div className="card-elevated p-4">
        <p className="text-xs text-muted-foreground mb-2">My Entries</p>
        <div className="flex flex-wrap gap-2">
          {data.entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedEntryId(entry.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                selectedEntry.id === entry.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
              )}
            >
              {entry.entryName}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-elevated p-4">
          <p className="text-xs text-muted-foreground mb-1">Rank</p>
          <p className="text-2xl font-bold">{selectedEntry.seasonStats.rank ?? "-"}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Points</p>
          <p className="text-2xl font-bold">{selectedEntry.seasonStats.totalPoints}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs text-muted-foreground mb-1">Win %</p>
          <p className="text-2xl font-bold">{selectedEntry.seasonStats.winPercentage}%</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs text-muted-foreground mb-1">Current Streak</p>
          <p className="text-2xl font-bold">{selectedEntry.seasonStats.currentStreak}</p>
        </div>
      </div>

      <div className="card-elevated p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Rank Movement
        </h3>
        {rankChartPoints.length < 2 ? (
          <p className="text-sm text-muted-foreground">Need at least two ranked periods to draw movement.</p>
        ) : (
          <div className="space-y-3">
            <svg viewBox="0 0 100 30" className="w-full h-24">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="text-primary"
                points={rankChartPoints
                  .map((week, idx) => {
                    const x = (idx / (rankChartPoints.length - 1)) * 100;
                    const normalized = maxRankInChart > 1 ? (Number(week.rank || 1) - 1) / (maxRankInChart - 1) : 0;
                    const y = 5 + normalized * 20;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{rankChartPoints[0]?.periodId}</span>
              <span>{rankChartPoints[rankChartPoints.length - 1]?.periodId}</span>
            </div>
          </div>
        )}
      </div>

      <div className="card-elevated p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Weekly Tracking
        </h3>
        {selectedEntry.weeklyTracking.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weekly tracking data yet.</p>
        ) : (
          <div className="space-y-2">
            {selectedEntry.weeklyTracking.slice(-8).reverse().map((week) => (
              <div key={week.periodId} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{week.periodId}</p>
                  <p className="text-xs text-muted-foreground">{week.correctPicks}/{week.totalPicks} correct</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{week.pointsEarned} pts</p>
                  <p className="text-xs text-muted-foreground">
                    Rank {week.rank ?? "-"} {week.rankDelta > 0 ? `(+${week.rankDelta})` : week.rankDelta < 0 ? `(${week.rankDelta})` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Pick Distribution ({selectedEntry.pickDistribution.periodId || "N/A"})
          </h3>
          {selectedEntry.pickDistribution.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pick distribution available.</p>
          ) : (
            <div className="space-y-2">
              {selectedEntry.pickDistribution.items.slice(0, 6).map((item) => (
                <div key={item.pickValue} className="flex items-center justify-between text-sm">
                  <span className={cn(item.isYourPick && "font-semibold text-primary")}>{item.pickValue}</span>
                  <span className="text-muted-foreground">{item.count} ({item.percentage}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-elevated p-5">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Weekly Recap
          </h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Period:</span> {selectedEntry.weeklyRecap.periodId || "N/A"}</p>
            <p><span className="text-muted-foreground">Top scorer:</span> {selectedEntry.weeklyRecap.topScorer || "N/A"}</p>
            <p><span className="text-muted-foreground">Most picked team:</span> {selectedEntry.weeklyRecap.mostPickedTeam || "N/A"}</p>
            <p><span className="text-muted-foreground">Biggest upset:</span> {selectedEntry.weeklyRecap.biggestUpset || "N/A"}</p>
          </div>
        </div>
      </div>

      <div className="card-elevated p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <History className="w-4 h-4" />
          Entry Timeline
        </h3>
        {selectedEntry.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No timeline events yet.</p>
        ) : (
          <div className="space-y-2">
            {selectedEntry.timeline.slice(0, 12).map((item, idx) => (
              <div key={`${item.eventType}-${item.periodId || "na"}-${idx}`} className="rounded-lg border border-border/50 px-3 py-2">
                <p className="text-sm font-medium">{item.details}</p>
                <p className="text-xs text-muted-foreground">
                  {item.periodId ? `${item.periodId} • ` : ""}{item.eventType}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-elevated p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Elimination Tracking</h3>
        {selectedEntry.elimination.isEliminated ? (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <Skull className="w-4 h-4" />
            Eliminated {selectedEntry.elimination.eliminatedPeriod ? `in ${selectedEntry.elimination.eliminatedPeriod}` : ""}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <Flame className="w-4 h-4" />
            Active {selectedEntry.elimination.livesRemaining !== null ? `(${selectedEntry.elimination.livesRemaining} lives left)` : ""}
          </div>
        )}
      </div>

      {latestWeek && (
        <p className="text-xs text-muted-foreground">
          Latest tracked period: {latestWeek.periodId}
        </p>
      )}
    </div>
  );
}

