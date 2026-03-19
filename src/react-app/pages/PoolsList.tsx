/**
 * Pools Page - Cinematic Premium Design
 * Dark glass cards, rank badges, live indicators
 */

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "@/react-app/config/routes";
import { Search, Plus, UserPlus, Users, Trophy, ChevronRight, Crown, Zap, Medal, AlertTriangle, Compass, Clock3, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { useActiveLeague } from "@/react-app/contexts/ActiveLeagueContext";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";
import { getSport, POOL_FORMATS } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";
import { formatCurrency } from "@/shared/escrow";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { PoolTypeBadgeIcon } from "@/react-app/components/pools/PoolTypeBadgeIcon";

type PoolStatus = "open" | "locked" | "live" | "final";

interface League {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  season: string;
  invite_code: string;
  entry_fee_cents: number;
  is_payment_required: number;
  member_count: number;
  role: string;
  created_at: string;
  state?: string;
  user_rank?: number;
  rules_json?: string;
}

interface MarketplacePool {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  member_count: number;
  entry_fee_cents: number;
  is_featured?: boolean;
  contest?: {
    entry_count?: number;
    entries_max?: number | null;
    lock_at?: string | null;
    prize_pool_cents?: number;
    rules_summary?: string;
    payout_preview?: Array<{ place: string; amount_cents: number }>;
  };
  commissioner?: {
    name?: string;
    rating?: number;
    rating_count?: number;
    verified_host?: boolean;
  };
}

const PREVIEW_MARKETPLACE_POOL: MarketplacePool = {
  id: -9999,
  name: "G1 Elite March Madness $25K Challenge",
  sport_key: "ncaab",
  format_key: "bracket",
  member_count: 188,
  entry_fee_cents: 2500,
  is_featured: true,
  state: "live",
  contest: {
    entry_count: 188,
    entries_max: 300,
    lock_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
    prize_pool_cents: 2500000,
    rules_summary: "Full 64-team bracket with round multipliers, tie-breaker points, and guaranteed top-3 payouts.",
    payout_preview: [
      { place: "1st", amount_cents: 1500000 },
      { place: "2nd", amount_cents: 700000 },
      { place: "3rd", amount_cents: 300000 },
    ],
  },
  commissioner: {
    name: "Coach G Picks",
    rating: 4.9,
    rating_count: 123,
    verified_host: true,
  },
};

function normalizePoolStatus(state?: string): PoolStatus {
  if (state === "open" || state === "locked" || state === "live" || state === "final") return state;
  return "open";
}

function parseRules(rulesJson?: string): Record<string, unknown> {
  if (!rulesJson) return {};
  try {
    return JSON.parse(rulesJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getEntriesMax(rules: Record<string, unknown>): number {
  const candidates = [rules.entriesMax, rules.maxEntries, rules.max_entries, rules.maxParticipants, rules.max_members];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return 300;
}

function getRulesSummary(formatKey: string, rules: Record<string, unknown>): string {
  const explicit = String(rules.rulesSummary || rules.rules_summary || "").trim();
  if (explicit) return explicit.slice(0, 180);
  if (formatKey === "survivor") return "Pick one team each period. Wrong pick can eliminate you.";
  if (formatKey === "bracket") return "Bracket scoring by round with cumulative points.";
  if (formatKey === "confidence") return "Rank picks by confidence for weighted scoring.";
  return "Submit picks each period and climb the standings.";
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

// Cinematic Pool Card
const PoolCard = memo(function PoolCard({
  league,
  onClick,
}: {
  league: League;
  onClick: () => void;
}) {
  const sport = getSport(league.sport_key);
  const format = POOL_FORMATS.find(f => f.key === league.format_key);
  const status = normalizePoolStatus(league.state);
  const isLive = status === "live";
  const rules = parseRules(league.rules_json);
  const entriesMax = getEntriesMax(rules);
  const entryCount = Number(league.member_count || 0);
  const prizePoolCents =
    Number(rules.prizePoolCents || rules.prize_pool_cents || 0) > 0
      ? Number(rules.prizePoolCents || rules.prize_pool_cents || 0)
      : Math.max(0, Number(league.entry_fee_cents || 0) * entryCount);
  const rulesSummary = getRulesSummary(league.format_key, rules);
  const userRank = Number.isFinite(league.user_rank) && Number(league.user_rank) > 0
    ? Number(league.user_rank)
    : null;
  
  const statusConfig = {
    open: { label: "Open", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    locked: { label: "Locked", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    live: { label: "Live", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    final: { label: "Complete", color: "text-white/40", bg: "bg-white/5 border-white/10" },
  };
  
  const { label, color, bg } = statusConfig[status];
  
  const getRankIcon = (rank: number | null) => {
    if (!rank) return null;
    if (rank === 1) return <Crown className="w-3.5 h-3.5 text-yellow-400" />;
    if (rank <= 3) return <Medal className="w-3.5 h-3.5 text-amber-400" />;
    return null;
  };
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-xl overflow-hidden transition-all duration-300",
        "hover:scale-[1.01] hover:shadow-lg",
        isLive && "ring-1 ring-red-500/30"
      )}
    >
      {/* Background */}
      <div className={cn(
        "absolute inset-0",
        isLive 
          ? "bg-gradient-to-br from-[hsl(220,25%,14%)] via-[hsl(220,20%,10%)] to-[hsl(220,25%,8%)]"
          : "bg-[hsl(220,18%,11%)]"
      )} />
      
      {/* Live glow */}
      {isLive && (
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5" />
      )}
      
      {/* Glass effect */}
      <div className="absolute inset-0 bg-white/[0.02]" />
      
      {/* Live indicator strip */}
      {isLive && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500" />
      )}
      
      {/* Content */}
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <PoolTypeBadgeIcon formatKey={league.format_key} />
            
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">{league.name}</h3>
              <p className="text-xs text-white/50">
                {format?.name || league.format_key} • {sport?.abbr || league.sport_key.toUpperCase()}
              </p>
            </div>
          </div>
          
          <ChevronRight className="w-5 h-5 text-white/30 shrink-0 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
        </div>
        
        {/* Stats row */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-4">
            {/* Rank badge */}
            <div className="flex items-center gap-1.5">
              {getRankIcon(userRank)}
              <span className={cn(
                "text-lg font-bold",
                userRank === 1 ? "text-yellow-400" : (userRank && userRank <= 3) ? "text-amber-400" : "text-white"
              )}>
                {userRank ? `#${userRank}` : "—"}
              </span>
              <span className="text-xs text-white/40">of {league.member_count}</span>
            </div>
            
            {/* Players */}
            <div className="flex items-center gap-1 text-sm text-white/50">
              <Users className="w-3.5 h-3.5" />
              <span>{entryCount}/{entriesMax}</span>
            </div>
            
            {/* Entry fee */}
            {league.entry_fee_cents > 0 && (
              <span className="text-sm font-medium text-emerald-400">
                {formatCurrency(league.entry_fee_cents)}
              </span>
            )}
          </div>
          
          {/* Status badge */}
          <span className={cn(
            "text-xs font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
            bg, color
          )}>
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
            {label}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-white/70">
            <span className="text-white/45">Prize: </span>
            <span className="font-semibold text-emerald-300">
              {prizePoolCents > 0 ? formatCurrency(prizePoolCents) : "TBD"}
            </span>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-white/70 truncate">
            <span className="text-white/45">Rules: </span>
            <span className="font-medium">{rulesSummary}</span>
          </div>
        </div>
      </div>
    </button>
  );
});

// Live pools highlight carousel
const LivePoolsHighlight = memo(function LivePoolsHighlight({
  pools,
  onPoolClick,
}: {
  pools: League[];
  onPoolClick: (id: number) => void;
}) {
  if (pools.length === 0) return null;
  
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-red-400" />
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">Live Action</h2>
        <span className="text-xs text-white/40">({pools.length})</span>
      </div>
      
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
        {pools.map(league => {
          const userRank = Number.isFinite(league.user_rank) && Number(league.user_rank) > 0
            ? Number(league.user_rank)
            : null;
          
          return (
            <button
              key={league.id}
              onClick={() => onPoolClick(league.id)}
              className="group shrink-0 w-[200px] rounded-xl overflow-hidden relative"
            >
              {/* Background with red glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,25%,14%)] via-[hsl(0,60%,12%)] to-[hsl(220,25%,8%)]" />
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-transparent to-red-500/5" />
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-500" />
              
              {/* Content */}
              <div className="relative p-3">
                <div className="flex items-center gap-2 mb-2">
                  <PoolTypeBadgeIcon formatKey={league.format_key} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate">{league.name}</h3>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-white">{userRank ? `#${userRank}` : "—"}</span>
                    <span className="text-xs text-white/40">of {league.member_count}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-red-400 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// Loading skeleton
function PoolsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} className="h-[120px] w-full rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

// Cinematic Empty state
function EmptyState() {
  return (
    <div className="text-center py-16 px-4">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">No pools yet</h3>
      <p className="text-sm text-white/50 mb-8 max-w-xs mx-auto">
        Create a pool to compete with friends, or join an existing one with an invite code.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to={ROUTES.CREATE_LEAGUE}>
          <button className="w-full sm:w-auto px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            Create Pool
          </button>
        </Link>
        <Link to={ROUTES.JOIN_LEAGUE}>
          <button className="w-full sm:w-auto px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/15 transition-colors">
            <UserPlus className="w-4 h-4" />
            Join Pool
          </button>
        </Link>
      </div>
    </div>
  );
}

export function PoolsList() {
  const navigate = useNavigate();
  const { leagues: apiLeagues } = useActiveLeague();
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | PoolStatus>("all");
  const [viewMode, setViewMode] = useState<"my" | "marketplace">("my");
  const [isLoading, setIsLoading] = useState(true);
  const [marketplacePools, setMarketplacePools] = useState<MarketplacePool[]>([]);
  const [marketplaceNotice, setMarketplaceNotice] = useState<string | null>(null);
  
  // Load leagues from API
  useEffect(() => {
    if (apiLeagues.length > 0) {
      setIsLoading(false);
    } else {
      const timer = setTimeout(() => setIsLoading(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [apiLeagues]);

  useEffect(() => {
    let cancelled = false;
    if (isFlagsLoading) return () => {};
    if (!flags.MARKETPLACE_ENABLED) {
      setMarketplacePools([]);
      setMarketplaceNotice("Marketplace is disabled by feature flag.");
      return () => {
        cancelled = true;
      };
    }
    if (!flags.PUBLIC_POOLS) {
      setMarketplacePools([]);
      setMarketplaceNotice("Public pools are currently disabled.");
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const res = await fetch("/api/marketplace/pools", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 401) {
              setMarketplaceNotice("Marketplace requires an authenticated session.");
            } else if (res.status === 403) {
              setMarketplaceNotice("Marketplace is blocked by platform feature flags.");
            } else {
              setMarketplaceNotice(`Marketplace unavailable (HTTP ${res.status}).`);
            }
          }
          return;
        }
        const payload = await res.json();
        if (!cancelled) {
          setMarketplacePools(Array.isArray(payload?.pools) ? payload.pools.slice(0, 24) : []);
          setMarketplaceNotice(null);
        }
      } catch {
        if (!cancelled) {
          setMarketplaceNotice("Marketplace is temporarily unavailable.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flags.MARKETPLACE_ENABLED, flags.PUBLIC_POOLS, isFlagsLoading]);
  
  const leagues = apiLeagues as League[];
  const myLeagueIds = useMemo(() => new Set(leagues.map((league) => league.id)), [leagues]);
  const marketplaceDiscoveryPools = useMemo(
    () => marketplacePools.filter((pool) => !myLeagueIds.has(pool.id)),
    [marketplacePools, myLeagueIds],
  );
  const marketplaceMetrics = useMemo(() => {
    const total = marketplaceDiscoveryPools.length;
    const featured = marketplaceDiscoveryPools.filter((p) => p.is_featured).length;
    const live = marketplaceDiscoveryPools.filter((p) => String(p.state || "").toLowerCase() === "live").length;
    const totalSeatsOpen = marketplaceDiscoveryPools.reduce((sum, pool) => {
      const current = Number(pool.contest?.entry_count ?? pool.member_count ?? 0);
      const max = Number(pool.contest?.entries_max ?? 0);
      if (!Number.isFinite(max) || max <= 0) return sum;
      return sum + Math.max(0, max - current);
    }, 0);
    return { total, featured, live, totalSeatsOpen };
  }, [marketplaceDiscoveryPools]);
  const previewMarketplacePools = useMemo(() => {
    if (marketplaceDiscoveryPools.length > 0) return marketplaceDiscoveryPools;
    if (!import.meta.env.DEV) return marketplaceDiscoveryPools;
    // Always render at least one visual reference card in local dev.
    return [PREVIEW_MARKETPLACE_POOL];
  }, [marketplaceDiscoveryPools]);
  
  // Live pools for highlight carousel
  const livePools = useMemo(() => 
    leagues.filter(l => {
      const status = normalizePoolStatus(l.state);
      return status === "live";
    }),
  [leagues]);
  
  // Filter leagues
  const filteredLeagues = useMemo(() => {
    let result = leagues;
    
    if (searchQuery) {
      result = result.filter(l => 
        l.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterStatus !== "all") {
      result = result.filter(l => {
        const status = normalizePoolStatus(l.state);
        return status === filterStatus;
      });
    }
    
    return result;
  }, [leagues, searchQuery, filterStatus]);
  
  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: leagues.length, open: 0, locked: 0, live: 0, final: 0 };
    leagues.forEach(l => {
      const status = normalizePoolStatus(l.state);
      counts[status]++;
    });
    return counts;
  }, [leagues]);
  
  const handlePoolClick = useCallback((leagueId: number) => {
    navigate(ROUTES.POOL_HUB(leagueId));
  }, [navigate]);

  const jumpToMarketplace = useCallback(() => {
    setViewMode("marketplace");
    document.getElementById("marketplace-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#marketplace") return;
    setViewMode("marketplace");
    const timer = window.setTimeout(() => {
      document.getElementById("marketplace-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [marketplaceDiscoveryPools.length, marketplaceNotice]);

  return (
    <div className="min-h-screen pb-24 -mx-4 -mt-4">
      {/* Cinematic background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,7%)] via-[hsl(220,20%,5%)] to-[hsl(220,25%,4%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.05),transparent_60%)]" />
      </div>
      
      <div className="relative z-10">
        {/* Header */}
        <div className="px-4 pt-4 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Pools</h1>
            <p className="text-xs text-white/45 mt-0.5">
              Build your portfolio or discover commissioner-run contests
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={jumpToMarketplace}
              className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-xs font-semibold text-white/90 flex items-center gap-1.5"
            >
              <Compass className="w-4 h-4" />
              Marketplace
            </button>
            <Link to={ROUTES.JOIN_LEAGUE}>
              <button className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors">
                <UserPlus className="w-5 h-5 text-white" />
              </button>
            </Link>
            <Link to={ROUTES.CREATE_LEAGUE}>
              <button className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                <Plus className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="inline-flex w-full rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              onClick={() => setViewMode("my")}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                viewMode === "my" ? "bg-primary text-primary-foreground" : "text-white/65 hover:text-white hover:bg-white/5",
              )}
            >
              My Pools
            </button>
            <button
              onClick={() => setViewMode("marketplace")}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
                viewMode === "marketplace" ? "bg-primary text-primary-foreground" : "text-white/65 hover:text-white hover:bg-white/5",
              )}
            >
              <Sparkles className="w-4 h-4" />
              Marketplace
            </button>
          </div>
        </div>
        
        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              placeholder={viewMode === "marketplace" ? "Search marketplace pools..." : "Search your pools..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>
        </div>
        
        {/* Status filter chips */}
        {viewMode === "my" && leagues.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
              {[
                { key: "all", label: "All" },
                { key: "open", label: "Open" },
                { key: "live", label: "Live" },
                { key: "final", label: "Complete" },
              ].map(({ key, label }) => {
                const hasLive = key === "live" && statusCounts.live > 0;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterStatus(key as typeof filterStatus)}
                    className={cn(
                      "shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                      filterStatus === key 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                    )}
                  >
                    {hasLive && filterStatus !== "live" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    )}
                    {label}
                    {statusCounts[key as keyof typeof statusCounts] > 0 && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        filterStatus === key ? "bg-white/20" : "bg-white/10"
                      )}>
                        {statusCounts[key as keyof typeof statusCounts]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Content */}
        <div className="px-4">
          {viewMode === "marketplace" && (
            <div className="mb-6 scroll-mt-24" id="marketplace-section">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(220,30%,14%)] via-[hsl(220,22%,11%)] to-[hsl(220,18%,9%)] p-4 md:p-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_55%)] pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-white/85">
                    <Compass className="w-4 h-4 text-blue-300" />
                    <h2 className="text-sm font-bold uppercase tracking-wide">Commissioner Marketplace</h2>
                  </div>
                  <p className="mt-1 text-sm text-white/60 max-w-2xl">
                    Discover active commissioner-run contests and join before lock. Built for growth, trust, and conversion.
                  </p>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-white/45">Listed Pools</p>
                      <p className="text-lg font-bold text-white">{marketplaceMetrics.total}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-white/45">Featured</p>
                      <p className="text-lg font-bold text-amber-300">{marketplaceMetrics.featured}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-white/45">Live Now</p>
                      <p className="text-lg font-bold text-red-300">{marketplaceMetrics.live}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-white/45">Open Seats</p>
                      <p className="text-lg font-bold text-emerald-300">{marketplaceMetrics.totalSeatsOpen}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === "marketplace" ? (
            <>
              {previewMarketplacePools.length > 0 && (
                <div className="mb-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-5">
                    {previewMarketplacePools
                      .filter((pool) => pool.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((pool) => {
                        const entryCount = Number(pool.contest?.entry_count ?? pool.member_count ?? 0);
                        const entriesMax = Number(pool.contest?.entries_max ?? 0);
                        const hasMax = Number.isFinite(entriesMax) && entriesMax > 0;
                        const fillPct = hasMax ? Math.max(0, Math.min(100, Math.round((entryCount / entriesMax) * 100))) : null;
                        const isLive = String(pool.state || "").toLowerCase() === "live";
                        return (
                          <button
                            key={`marketplace-${pool.id}`}
                            onClick={() => handlePoolClick(pool.id)}
                            className="group relative rounded-2xl border border-white/12 bg-gradient-to-br from-[hsl(220,22%,13%)] to-[hsl(220,18%,10%)] p-4 text-left hover:border-blue-400/40 hover:shadow-[0_0_0_1px_rgba(96,165,250,0.25)] transition-all"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PoolTypeBadgeIcon formatKey={pool.format_key} />
                                <div className="min-w-0">
                                  <p className="text-base font-semibold text-white truncate">{pool.name}</p>
                                  <p className="text-xs text-white/55 truncate">
                                    {(POOL_FORMATS.find(f => f.key === pool.format_key)?.name || pool.format_key)} • {pool.sport_key.toUpperCase()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {pool.is_featured && (
                                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">FEATURED</span>
                                )}
                                {isLive && (
                                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                    LIVE
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-white/45">Prize Pool</p>
                                <p className="text-sm font-bold text-emerald-300">
                                  {(pool.contest?.prize_pool_cents || 0) > 0 ? formatCurrency(Number(pool.contest?.prize_pool_cents || 0)) : "TBD"}
                                </p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-white/45">Entry Fee</p>
                                <p className="text-sm font-bold text-white">{pool.entry_fee_cents > 0 ? formatCurrency(pool.entry_fee_cents) : "Free"}</p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-white/45">Entries</p>
                                <p className="text-sm font-bold text-white">{hasMax ? `${entryCount}/${entriesMax}` : `${entryCount} players`}</p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-white/45 flex items-center gap-1"><Clock3 className="w-3 h-3" />Lock</p>
                                <p className="text-sm font-bold text-white">{formatLockTime(pool.contest?.lock_at)}</p>
                              </div>
                            </div>

                            {hasMax && (
                              <div className="mt-2.5">
                                <div className="flex items-center justify-between text-[10px] text-white/45 mb-1">
                                  <span>Fill Progress</span>
                                  <span>{fillPct}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
                                    style={{ width: `${fillPct}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {pool.contest?.rules_summary && (
                              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs text-white/75 line-clamp-2">
                                {pool.contest.rules_summary}
                              </p>
                            )}
                            {Array.isArray(pool.contest?.payout_preview) && pool.contest.payout_preview.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {pool.contest.payout_preview.slice(0, 3).map((p) => (
                                  <span
                                    key={`${pool.id}-${p.place}`}
                                    className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
                                  >
                                    {p.place}: {formatCurrency(p.amount_cents)}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="min-w-0 text-xs text-white/55">
                                <span className="truncate inline-flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
                                  {pool.commissioner?.name || "Commissioner"}
                                  {pool.commissioner?.verified_host && (
                                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">
                                      VERIFIED HOST
                                    </span>
                                  )}
                                </span>
                                {typeof pool.commissioner?.rating === "number" && pool.commissioner.rating > 0 && (
                                  <p className="text-[11px] text-white/45 mt-0.5">
                                    {pool.commissioner.rating.toFixed(1)} rating
                                  </p>
                                )}
                              </div>
                              {pool.id < 0 && (
                                <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                                  PREVIEW
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-lg border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-200 group-hover:border-blue-300/40">
                                View Contest
                                <ArrowRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
              {marketplaceNotice && (
                <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />
                  <div>
                    <p className="font-semibold">Marketplace Notice</p>
                    <p className="text-amber-100/80">{marketplaceNotice}</p>
                    <p className="text-amber-100/70 mt-1">
                      For visibility, ensure <span className="font-semibold">PUBLIC_POOLS</span> and <span className="font-semibold">MARKETPLACE_ENABLED</span> are enabled.
                    </p>
                  </div>
                </div>
              )}
              {previewMarketplacePools.length === 0 && !marketplaceNotice && (
                <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                  <Compass className="mx-auto mb-2 h-6 w-6 text-white/45" />
                  <p className="text-sm font-semibold text-white">No listed contests yet</p>
                  <p className="text-xs text-white/55 mt-1">
                    Commissioners can publish pools from admin settings to appear here.
                  </p>
                </div>
              )}
            </>
          ) : isLoading ? (
            <PoolsSkeleton />
          ) : leagues.length === 0 ? (
            <EmptyState />
          ) : filteredLeagues.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-sm text-white/50 mb-3">No pools match your search</p>
              <button 
                onClick={() => { setSearchQuery(""); setFilterStatus("all"); }}
                className="text-sm text-primary font-medium"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Live pools highlight */}
              {livePools.length > 0 && filterStatus === "all" && !searchQuery && (
                <LivePoolsHighlight pools={livePools} onPoolClick={handlePoolClick} />
              )}
              
              {/* All pools section */}
              {filterStatus === "all" && !searchQuery && livePools.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide">All Pools</h2>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredLeagues
                  .filter(l => {
                    // If showing all with live highlight, exclude live pools from main list
                    if (filterStatus === "all" && !searchQuery && livePools.length > 0) {
                      const status = normalizePoolStatus(l.state);
                      return status !== "live";
                    }
                    return true;
                  })
                  .map(league => (
                    <PoolCard
                      key={league.id}
                      league={league}
                      onClick={() => handlePoolClick(league.id)}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
