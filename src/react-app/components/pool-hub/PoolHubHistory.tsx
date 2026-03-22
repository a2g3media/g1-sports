import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Crown,
  Flame,
  History,
  Loader2,
  Medal,
  Percent,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
}

interface WeekSummary {
  periodId: string;
  totalPicks: number;
  correctPicks: number;
  averageAccuracy: number;
  participantCount: number;
  topScorer: { name: string; points: number } | null;
  mostPopularPick: { value: string; percentage: number } | null;
  biggestUpset: string | null;
  leaderboardSnapshot: Array<{
    rank: number;
    name: string;
    points: number;
    correct: number;
    total: number;
  }>;
  yourSummary: {
    correct: number;
    total: number;
    points: number;
    rank: number | null;
  } | null;
}

interface PoolHistoryResponse {
  league: { id: number; name: string; sport_key: string; format_key: string };
  weeks: WeekSummary[];
  totalPeriods: number;
}

function getPeriodLabel(sportKey: string): string {
  switch (sportKey) {
    case "nfl":
    case "ncaaf":
      return "Week";
    case "nba":
    case "ncaab":
      return "Game Day";
    case "mlb":
      return "Series";
    case "nhl":
      return "Game Day";
    case "golf":
      return "Round";
    case "soccer":
      return "Match Day";
    default:
      return "Period";
  }
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
  return <span className="text-xs text-slate-400 font-mono w-4 text-center">{rank}</span>;
}

export function PoolHubHistory({ league }: { league: League }) {
  const [data, setData] = useState<PoolHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [view, setView] = useState<"week-by-week" | "season-overview">("week-by-week");

  const periodLabel = useMemo(() => getPeriodLabel(league.sport_key), [league.sport_key]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/leagues/${league.id}/pool-history/weeks`, { credentials: "include" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as { error?: string })?.error || "Failed to load pool history");
        if (!cancelled) {
          const payload = json as PoolHistoryResponse;
          setData(payload);
          if (payload.weeks.length > 0) {
            setExpandedPeriod(payload.weeks[payload.weeks.length - 1].periodId);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load pool history");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [league.id]);

  const seasonStats = useMemo(() => {
    if (!data || data.weeks.length === 0) return null;
    const totalPicks = data.weeks.reduce((s, w) => s + w.totalPicks, 0);
    const totalCorrect = data.weeks.reduce((s, w) => s + w.correctPicks, 0);
    const avgAccuracy = totalPicks > 0 ? Math.round((totalCorrect / totalPicks) * 1000) / 10 : 0;
    const avgParticipants = Math.round(data.weeks.reduce((s, w) => s + w.participantCount, 0) / data.weeks.length);
    const bestWeek = [...data.weeks].sort((a, b) => b.averageAccuracy - a.averageAccuracy)[0];
    const worstWeek = [...data.weeks].sort((a, b) => a.averageAccuracy - b.averageAccuracy)[0];
    return { totalPicks, totalCorrect, avgAccuracy, avgParticipants, bestWeek, worstWeek, totalWeeks: data.weeks.length };
  }, [data]);

  if (isLoading) {
    return (
      <div className="card-elevated p-8 flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading pool history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-elevated p-6 text-sm text-amber-400 flex items-center gap-2">
        <History className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (!data || data.weeks.length === 0) {
    return (
      <div className="card-elevated p-8 text-center">
        <History className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white mb-1">No History Yet</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Pool history will appear here after periods are scored. Check back after results are in.
        </p>
      </div>
    );
  }

  const reversedWeeks = [...data.weeks].reverse();

  return (
    <div className="space-y-4 animate-page-enter">
      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("week-by-week")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
            view === "week-by-week"
              ? "bg-gradient-to-br from-white/[0.12] to-white/[0.04] text-white border border-white/[0.15] shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
          )}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          {periodLabel} by {periodLabel}
        </button>
        <button
          onClick={() => setView("season-overview")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
            view === "season-overview"
              ? "bg-gradient-to-br from-white/[0.12] to-white/[0.04] text-white border border-white/[0.15] shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
          )}
        >
          <TrendingUp className="w-4 h-4 inline mr-2" />
          Season Overview
        </button>
      </div>

      {view === "season-overview" && seasonStats && (
        <div className="space-y-4">
          {/* Season Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={`Total ${periodLabel}s`} value={seasonStats.totalWeeks} icon={Calendar} />
            <StatCard label="Total Picks" value={seasonStats.totalPicks.toLocaleString()} icon={Target} />
            <StatCard label="Pool Accuracy" value={`${seasonStats.avgAccuracy}%`} icon={Percent} />
            <StatCard label="Avg Participants" value={seasonStats.avgParticipants} icon={Users} />
          </div>

          {/* Best / Worst Weeks */}
          <div className="grid md:grid-cols-2 gap-3">
            {seasonStats.bestWeek && (
              <div className="card-elevated p-4">
                <p className="text-xs text-emerald-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Best {periodLabel}
                </p>
                <p className="text-lg font-bold text-white">{seasonStats.bestWeek.periodId}</p>
                <p className="text-sm text-slate-400">{seasonStats.bestWeek.averageAccuracy}% accuracy</p>
              </div>
            )}
            {seasonStats.worstWeek && (
              <div className="card-elevated p-4">
                <p className="text-xs text-red-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Toughest {periodLabel}
                </p>
                <p className="text-lg font-bold text-white">{seasonStats.worstWeek.periodId}</p>
                <p className="text-sm text-slate-400">{seasonStats.worstWeek.averageAccuracy}% accuracy</p>
              </div>
            )}
          </div>

          {/* Accuracy Trend Bar */}
          <div className="card-elevated p-5">
            <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Accuracy Trend
            </h3>
            <div className="flex items-end gap-1 h-24">
              {data.weeks.map((w) => {
                const heightPct = Math.max(5, w.averageAccuracy);
                return (
                  <div key={w.periodId} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className={cn(
                        "w-full rounded-t transition-colors",
                        w.averageAccuracy >= 60 ? "bg-emerald-500/70" : w.averageAccuracy >= 40 ? "bg-amber-500/70" : "bg-red-500/70"
                      )}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[9px] text-slate-500 truncate max-w-full">{w.periodId}</span>
                    <div className="absolute -top-8 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                      {w.averageAccuracy}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {view === "week-by-week" && (
        <div className="space-y-2">
          {reversedWeeks.map((week) => {
            const isExpanded = expandedPeriod === week.periodId;
            return (
              <div key={week.periodId} className="card-elevated overflow-hidden transition-all">
                {/* Collapsed Header */}
                <button
                  onClick={() => setExpandedPeriod(isExpanded ? null : week.periodId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-white">{periodLabel} {week.periodId}</p>
                      <p className="text-xs text-slate-400">
                        {week.participantCount} participants &middot; {week.totalPicks} picks
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {week.yourSummary && (
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-white">
                          #{week.yourSummary.rank || "-"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {week.yourSummary.correct}/{week.yourSummary.total}
                        </p>
                      </div>
                    )}
                    <div className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full",
                      week.averageAccuracy >= 60 ? "bg-emerald-500/10 text-emerald-400" :
                      week.averageAccuracy >= 40 ? "bg-amber-500/10 text-amber-400" :
                      "bg-red-500/10 text-red-400"
                    )}>
                      {week.averageAccuracy}%
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-4">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <MiniStat label="Accuracy" value={`${week.averageAccuracy}%`} />
                      <MiniStat
                        label="Top Scorer"
                        value={week.topScorer?.name || "-"}
                        sub={week.topScorer ? `${week.topScorer.points} pts` : undefined}
                      />
                      <MiniStat
                        label="Most Picked"
                        value={week.mostPopularPick?.value || "-"}
                        sub={week.mostPopularPick ? `${week.mostPopularPick.percentage}%` : undefined}
                      />
                    </div>

                    {week.biggestUpset && (
                      <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2 text-sm">
                        <span className="text-amber-400 font-medium">Biggest Upset:</span>{" "}
                        <span className="text-slate-300">{week.biggestUpset}</span>
                      </div>
                    )}

                    {/* Your Summary */}
                    {week.yourSummary && (
                      <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                        <p className="text-xs text-primary font-medium mb-1">Your Performance</p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-white font-semibold">Rank #{week.yourSummary.rank || "-"}</span>
                          <span className="text-slate-400">
                            {week.yourSummary.correct}/{week.yourSummary.total} correct
                          </span>
                          <span className="text-slate-400">{week.yourSummary.points} pts</span>
                        </div>
                      </div>
                    )}

                    {/* Leaderboard Snapshot */}
                    {week.leaderboardSnapshot.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> Leaderboard Snapshot
                        </p>
                        <div className="space-y-1">
                          {week.leaderboardSnapshot.map((entry) => (
                            <div
                              key={entry.rank}
                              className="flex items-center gap-3 rounded-lg px-3 py-1.5 bg-white/[0.02] text-sm"
                            >
                              <RankBadge rank={entry.rank} />
                              <span className="flex-1 text-white truncate">{entry.name}</span>
                              <span className="text-slate-400 text-xs">
                                {entry.correct}/{entry.total}
                              </span>
                              <span className="font-semibold text-white">{entry.points} pts</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="card-elevated p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-xs text-slate-400">{label}</p>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-white truncate">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
