import { useEffect, useMemo, useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Users, Minus, DollarSign, Skull, Clock3 } from "lucide-react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { getDemoStandingsForLeague, DEMO_ACTIVITY_ITEMS } from "@/react-app/data/demo-leagues";
import { formatCurrency } from "@/shared/escrow";
import { cn } from "@/react-app/lib/utils";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  entry_fee_cents: number;
  member_count: number;
  role: string;
  rules_json?: string;
  rule_engine_snapshot?: {
    ui?: {
      overlay_rules?: string[];
      full_rules?: string[];
      inline_messages?: string[];
    };
  } | null;
}

interface TimeContext {
  periodLabel: string;
  periodNumber: number | string;
  status: "open" | "locked" | "live" | "final";
  lockTime: Date;
  timeUntilLock: number;
}

interface PoolHubOverviewProps {
  league: League;
  timeContext: TimeContext | null;
}

interface MarketplaceContestInfo {
  entry_count?: number;
  entries_max?: number | null;
  lock_at?: string | null;
  prize_pool_cents?: number;
  rules_summary?: string;
  payout_preview?: Array<{ place: string; amount_cents: number }>;
}

function parseRules(rulesJson?: string): Record<string, unknown> {
  if (!rulesJson) return {};
  try {
    return JSON.parse(rulesJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatLockTime(value?: string | null): string {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelativeTime(seed: number): string {
  const times = ["Just now", "5 minutes ago", "1 hour ago", "2 hours ago", "Yesterday", "2 days ago"];
  return times[seed % times.length];
}

export function PoolHubOverview({ league, timeContext }: PoolHubOverviewProps) {
  const { isDemoMode } = useDemoAuth();
  const [commissionerInfo, setCommissionerInfo] = useState<{
    userId: string;
    name: string;
    rating: number;
    ratingCount: number;
    verifiedHost: boolean;
  } | null>(null);
  const [contestInfo, setContestInfo] = useState<MarketplaceContestInfo | null>(null);
  const [ratingPending, setRatingPending] = useState(false);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  
  const isSurvivor = league.format_key === "survivor" || 
                     league.format_key === "survivor_reentry";
  const overlayRules = league.rule_engine_snapshot?.ui?.overlay_rules ?? [];
  const inlineRuleMessages = league.rule_engine_snapshot?.ui?.inline_messages ?? [];
  
  // Get standings data - use demo data in demo mode
  const standings = useMemo(() => {
    if (isDemoMode) {
      const demoStandings = getDemoStandingsForLeague(league.id);
      const currentUser = demoStandings.find(s => s.is_current_user);
      const leader = demoStandings[0];
      
      if (currentUser) {
        return {
          rank: currentUser.rank,
          totalPlayers: demoStandings.length,
          delta: currentUser.previous_rank ? currentUser.previous_rank - currentUser.rank : 0,
          pointsBehindLeader: currentUser.rank === 1 ? 0 : (leader?.total_points || 0) - currentUser.total_points,
          weeklyPoints: Math.floor(currentUser.total_points / 10),
          totalPoints: currentUser.total_points,
          isEliminated: currentUser.is_eliminated || false,
        };
      }
    }
    
    // Fallback mock data
    const rank = Math.floor(Math.random() * Math.min(10, league.member_count || 1)) + 1;
    const totalPlayers = league.member_count || 1;
    const delta = Math.floor(Math.random() * 7) - 3;
    const pointsBehindLeader = rank === 1 ? 0 : Math.floor(Math.random() * 15) + 1;
    const weeklyPoints = Math.floor(Math.random() * 10) + 5;
    const totalPoints = Math.floor(Math.random() * 100) + 50;
    
    return { rank, totalPlayers, delta, pointsBehindLeader, weeklyPoints, totalPoints, isEliminated: false };
  }, [league.id, league.member_count, isDemoMode]);

  // Recent pool activity - use demo data in demo mode
  const recentActivity = useMemo(() => {
    if (isDemoMode) {
      return DEMO_ACTIVITY_ITEMS.slice(0, 3).map(item => ({
        id: item.id,
        message: item.message,
        time: getRelativeTime(item.id),
      }));
    }
    return [
      { id: 1, message: "Mike submitted picks", time: "2 hours ago" },
      { id: 2, message: "Sarah joined the pool", time: "Yesterday" },
      { id: 3, message: "Week 14 results finalized", time: "2 days ago" },
    ];
  }, [isDemoMode]);

  useEffect(() => {
    const localRules = parseRules(league.rules_json);
    const entriesMaxRaw = Number(
      localRules.entriesMax || localRules.maxEntries || localRules.max_entries || localRules.maxParticipants || localRules.max_members || 300,
    );
    const entriesMax = Number.isFinite(entriesMaxRaw) && entriesMaxRaw > 0 ? Math.round(entriesMaxRaw) : 300;
    const prizePoolRaw = Number(localRules.prizePoolCents || localRules.prize_pool_cents || 0);
    const prizePoolCents = prizePoolRaw > 0 ? prizePoolRaw : Math.max(0, Number(league.entry_fee_cents || 0) * Number(league.member_count || 0));
    const rulesSummary = String(localRules.rulesSummary || localRules.rules_summary || "").trim();

    setContestInfo({
      entry_count: Number(league.member_count || 0),
      entries_max: entriesMax,
      lock_at: null,
      prize_pool_cents: prizePoolCents,
      rules_summary: rulesSummary || undefined,
      payout_preview: Array.isArray(localRules.payouts) ? (localRules.payouts as Array<{ place: string; amount_cents: number }>) : [],
    });

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/marketplace/pools/${league.id}`, { credentials: "include" });
        if (!res.ok) return;
        const payload = await res.json();
        const commissioner = payload?.pool?.commissioner;
        const contest = payload?.pool?.contest;
        if (cancelled) return;
        if (commissioner) {
          setCommissionerInfo({
            userId: String(commissioner.user_id || ""),
            name: String(commissioner.name || "Commissioner"),
            rating: Number(commissioner.rating || 0),
            ratingCount: Number(commissioner.rating_count || 0),
            verifiedHost: commissioner.verified_host === true,
          });
        }
        if (contest && !cancelled) {
          setContestInfo({
            entry_count: Number(contest.entry_count || 0),
            entries_max: Number.isFinite(Number(contest.entries_max)) ? Number(contest.entries_max) : null,
            lock_at: typeof contest.lock_at === "string" ? contest.lock_at : null,
            prize_pool_cents: Number(contest.prize_pool_cents || 0),
            rules_summary: typeof contest.rules_summary === "string" ? contest.rules_summary : "",
            payout_preview: Array.isArray(contest.payout_preview) ? contest.payout_preview : [],
          });
        }
      } catch {
        // Marketplace can be feature-gated; ignore quietly.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [league.id, league.entry_fee_cents, league.member_count, league.rules_json]);

  async function submitCommissionerRating(value: number) {
    if (!Number.isFinite(value) || value < 1 || value > 5) return;
    try {
      setRatingPending(true);
      setRatingMessage(null);
      const res = await fetch(`/api/marketplace/pools/${league.id}/rate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { "X-Demo-Mode": "true" } : {}) },
        body: JSON.stringify({ rating: value }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRatingMessage(payload.error || "Unable to submit rating right now.");
        return;
      }
      setRatingMessage("Rating submitted.");
      setCommissionerInfo((prev) =>
        prev
          ? { ...prev, ratingCount: prev.ratingCount + 1, rating: prev.rating > 0 ? (prev.rating + value) / 2 : value }
          : prev,
      );
    } finally {
      setRatingPending(false);
    }
  }

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Your Standing Card */}
      <div className="card-elevated p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">Your Standing</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Rank / Survivor Status */}
          <div className={cn(
            "text-center p-4 rounded-xl",
            standings.isEliminated ? "bg-red-500/10" : "bg-primary/5"
          )}>
            {isSurvivor && standings.isEliminated ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Skull className="w-5 h-5 text-red-500" />
                  <span className="text-2xl font-bold text-red-500">OUT</span>
                </div>
                <p className="text-xs text-muted-foreground">Eliminated</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Trophy className={cn(
                    "w-5 h-5",
                    standings.rank === 1 ? "text-amber-500" : 
                    standings.rank <= 3 ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="text-3xl font-bold">{standings.rank}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  of {standings.totalPlayers}
                </p>
              </>
            )}
          </div>
          
          {/* This Week Change */}
          <div className="text-center p-4 rounded-xl bg-muted/50">
            <div className="flex items-center justify-center gap-1 mb-1">
              {standings.delta > 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : standings.delta < 0 ? (
                <TrendingDown className="w-4 h-4 text-red-500" />
              ) : (
                <Minus className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={cn(
                "text-xl font-semibold",
                standings.delta > 0 ? "text-green-500" : 
                standings.delta < 0 ? "text-red-500" : "text-muted-foreground"
              )}>
                {standings.delta > 0 ? `+${standings.delta}` : standings.delta}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">This {timeContext?.periodLabel || "Week"}</p>
          </div>
          
          {/* Behind Leader */}
          <div className="text-center p-4 rounded-xl bg-muted/50">
            <div className="text-xl font-semibold mb-1">
              {standings.pointsBehindLeader === 0 ? (
                <span className="text-amber-500">Leader!</span>
              ) : (
                <span>-{standings.pointsBehindLeader}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Behind Leader</p>
          </div>
          
          {/* Total Points */}
          <div className="text-center p-4 rounded-xl bg-muted/50">
            <div className="text-xl font-semibold mb-1">{standings.totalPoints}</div>
            <p className="text-xs text-muted-foreground">Total Points</p>
          </div>
        </div>
      </div>
      
      {/* Pool Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{league.member_count}</div>
              <div className="text-xs text-muted-foreground">Pool Size</div>
            </div>
          </div>
        </div>
        
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {league.entry_fee_cents > 0 
                  ? formatCurrency(league.entry_fee_cents * league.member_count)
                  : "Free"
                }
              </div>
              <div className="text-xs text-muted-foreground">
                {league.entry_fee_cents > 0 ? "Prize Pool" : "Entry Fee"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {contestInfo && (
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Contest Snapshot</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Prize Pool</p>
              <p className="text-sm font-semibold">
                {(contestInfo.prize_pool_cents || 0) > 0
                  ? formatCurrency(Number(contestInfo.prize_pool_cents || 0))
                  : "TBD"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Entry Fee</p>
              <p className="text-sm font-semibold">
                {league.entry_fee_cents > 0 ? formatCurrency(league.entry_fee_cents) : "Free"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Entries</p>
              <p className="text-sm font-semibold">
                {contestInfo.entry_count ?? league.member_count}/{contestInfo.entries_max ?? "—"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />Lock</p>
              <p className="text-sm font-semibold">{formatLockTime(contestInfo.lock_at)}</p>
            </div>
          </div>
          {contestInfo.rules_summary && (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">Rules</p>
              <p className="text-sm">{contestInfo.rules_summary}</p>
            </div>
          )}
          {Array.isArray(contestInfo.payout_preview) && contestInfo.payout_preview.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <p className="text-xs text-emerald-200/80 mb-1">Top payouts</p>
              <div className="flex flex-wrap gap-2">
                {contestInfo.payout_preview.slice(0, 3).map((row) => (
                  <span key={`${row.place}-${row.amount_cents}`} className="text-xs font-semibold text-emerald-200">
                    {row.place}: {formatCurrency(row.amount_cents)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {overlayRules.length > 0 && (
          <div className="card-elevated p-5 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Rule Snapshot</h3>
            <div className="flex flex-wrap gap-2">
              {overlayRules.map((rule) => (
                <span
                  key={rule}
                  className="rounded-full px-3 py-1 text-xs border border-primary/20 bg-primary/10 text-primary"
                >
                  {rule}
                </span>
              ))}
            </div>
            {inlineRuleMessages.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-1">Live tips</p>
                  <div className="space-y-1">
                    {inlineRuleMessages.slice(0, 2).map((tip) => (
                      <p key={tip} className="text-sm">
                        {tip}
                      </p>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      
      {/* Recent Activity */}
      <div className="card-elevated p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.map(activity => (
            <div 
              key={activity.id}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <span className="text-sm">{activity.message}</span>
              <span className="text-xs text-muted-foreground">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>

      {commissionerInfo && (
        <div className="card-elevated p-5">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Commissioner Trust</h3>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{commissionerInfo.name}</p>
              <p className="text-xs text-muted-foreground">
                {commissionerInfo.rating > 0 ? `${commissionerInfo.rating.toFixed(1)} average` : "No ratings yet"} •{" "}
                {commissionerInfo.ratingCount} rating{commissionerInfo.ratingCount === 1 ? "" : "s"}
                {commissionerInfo.verifiedHost ? " • Verified host" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  disabled={ratingPending}
                  onClick={() => submitCommissionerRating(n)}
                  className={cn(
                    "h-7 w-7 rounded-md text-xs font-semibold transition-colors",
                    "bg-muted hover:bg-primary/20",
                  )}
                  title={`Rate ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {ratingMessage && <p className="text-xs text-muted-foreground mt-2">{ratingMessage}</p>}
        </div>
      )}
    </div>
  );
}
