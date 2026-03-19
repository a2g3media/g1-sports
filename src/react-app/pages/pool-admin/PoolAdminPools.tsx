import { useQuery } from "@tanstack/react-query";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Input } from "@/react-app/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { 
  Plus, 
  Search, 
  Users, 
  DollarSign, 
  Clock, 
  Trophy,
  MoreHorizontal,
  Settings,
  UserPlus,
  Bell,
  BarChart3,
  Copy,
  ExternalLink,
  Shield,
  Globe,
  Lock,
  AlertCircle,
  CheckCircle2,
  Pause
} from "lucide-react";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

interface Pool {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  entry_fee_cents: number;
  is_payment_required: boolean;
  is_public: boolean;
  invite_code: string;
  user_role: string;
  status: "active" | "upcoming" | "completed";
  current_period: string;
  member_count: number;
  pending_invites: number;
  pending_approvals?: number;
  members_submitted: number;
  pending_payments: number;
  created_at: string;
}

interface PoolsResponse {
  pools: Pool[];
  totals: {
    pools: number;
    active_pools: number;
    total_members: number;
    pending_payments: number;
    pending_invites: number;
    pending_approvals?: number;
    total_submitted: number;
  };
}

function getLaunchHealth(pool: Pool): {
  score: number;
  label: "Healthy" | "Watch" | "At Risk";
  colorClass: string;
} {
  const unresolvedMissingPicks = Math.max(0, (pool.member_count || 0) - (pool.members_submitted || 0));
  const unresolvedInvites = Math.max(0, pool.pending_invites || 0);
  const unresolvedApprovals = Math.max(0, pool.pending_approvals || 0);
  const unresolvedPayments = Math.max(0, pool.pending_payments || 0);
  const issuePoints =
    unresolvedMissingPicks * 4
    + unresolvedInvites * 6
    + unresolvedApprovals * 7
    + unresolvedPayments * 8
    + (pool.status === "upcoming" ? 8 : 0)
    + (pool.status === "completed" ? 12 : 0);
  const score = Math.max(0, 100 - Math.min(100, issuePoints));
  if (score >= 80) {
    return {
      score,
      label: "Healthy",
      colorClass: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    };
  }
  if (score >= 55) {
    return {
      score,
      label: "Watch",
      colorClass: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10",
    };
  }
  return {
    score,
    label: "At Risk",
    colorClass: "text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10",
  };
}

const SPORT_LABELS: Record<string, string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  soccer: "Soccer",
  ncaaf: "College Football",
  ncaab: "College Basketball",
  golf: "Golf",
  tennis: "Tennis",
  mma: "MMA",
};

const FORMAT_LABELS: Record<string, string> = {
  weekly_picks: "Weekly Picks",
  survivor: "Survivor",
  season_long: "Season Long",
  bracket: "Bracket",
  props: "Props",
  confidence: "Confidence",
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function PoolCard({ pool }: { pool: Pool }) {
  const [isListingBusy, setIsListingBusy] = useState(false);
  const launchHealth = getLaunchHealth(pool);
  const pendingApprovals = Math.max(0, pool.pending_approvals || 0);

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${pool.invite_code}`;
    navigator.clipboard.writeText(link);
  };

  const statusConfig = {
    active: { label: "Active", variant: "default" as const, icon: CheckCircle2 },
    upcoming: { label: "Upcoming", variant: "secondary" as const, icon: Clock },
    completed: { label: "Completed", variant: "outline" as const, icon: Pause },
  };

  const status = statusConfig[pool.status];
  const StatusIcon = status.icon;

  const hasIssues = pool.pending_payments > 0 || pool.pending_invites > 0 || pendingApprovals > 0;

  const updateMarketplaceListing = async (listingStatus: "listed" | "hidden") => {
    try {
      setIsListingBusy(true);
      await fetch(`/api/pool-admin/${pool.id}/marketplace-listing`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_status: listingStatus,
          category_key: pool.format_key,
          is_featured: false,
          listing_fee_cents: 0,
        }),
      });
    } finally {
      setIsListingBusy(false);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">{pool.name}</CardTitle>
              {pool.user_role === "owner" && (
                <Badge variant="outline" className="shrink-0">
                  <Shield className="h-3 w-3 mr-1" />
                  Owner
                </Badge>
              )}
            </div>
            <CardDescription className="flex items-center gap-2 flex-wrap">
              <span>{SPORT_LABELS[pool.sport_key] || pool.sport_key}</span>
              <span>•</span>
              <span>{FORMAT_LABELS[pool.format_key] || pool.format_key}</span>
              {pool.is_public ? (
                <Badge variant="outline" className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  Public
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Private
                </Badge>
              )}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/pool-admin/members?pool=${pool.id}${pendingApprovals > 0 ? "&invite_status=pending_approval" : ""}`}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Members
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/pool-admin/payments?pool=${pool.id}`}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  View Payments
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/pool-admin/notifications?pool=${pool.id}`}>
                  <Bell className="h-4 w-4 mr-2" />
                  Send Notification
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={copyInviteLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Invite Link
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/pools/${pool.id}`} target="_blank">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Pool Page
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isListingBusy} onClick={() => updateMarketplaceListing("listed")}>
                <Globe className="h-4 w-4 mr-2" />
                Publish to Marketplace
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isListingBusy} onClick={() => updateMarketplaceListing("hidden")}>
                <Lock className="h-4 w-4 mr-2" />
                Hide from Marketplace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={`/pool-admin/settings?pool=${pool.id}`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Pool Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status and Period */}
        <div className="flex items-center justify-between">
          <Badge variant={status.variant} className="gap-1">
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px]", launchHealth.colorClass)}>
              {launchHealth.label} {launchHealth.score}
            </Badge>
            <span className="text-sm text-muted-foreground">{pool.current_period}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Members</span>
            </div>
            <p className="text-xl font-semibold">{pool.member_count}</p>
            {pool.pending_invites > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                +{pool.pending_invites} pending
              </p>
            )}
            {pendingApprovals > 0 && (
              <p className="text-xs text-violet-600 mt-0.5">
                +{pendingApprovals} approvals
              </p>
            )}
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Trophy className="h-4 w-4" />
              <span className="text-xs">Picks In</span>
            </div>
            <p className="text-xl font-semibold">
              {pool.members_submitted}/{pool.member_count}
            </p>
            {pool.member_count > 0 && pool.members_submitted < pool.member_count && (
              <p className="text-xs text-amber-600 mt-0.5">
                {pool.member_count - pool.members_submitted} missing
              </p>
            )}
          </div>

          {pool.is_payment_required && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs">Entry Fee</span>
              </div>
              <p className="text-xl font-semibold">{formatCurrency(pool.entry_fee_cents)}</p>
              {pool.pending_payments > 0 && (
                <p className="text-xs text-red-600 mt-0.5">
                  {pool.pending_payments} unpaid
                </p>
              )}
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Created</span>
            </div>
            <p className="text-sm font-medium">
              {formatDistanceToNow(new Date(pool.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Attention Banner */}
        {hasIssues && (
          <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-700 dark:text-amber-400">
              {pool.pending_payments > 0 && `${pool.pending_payments} unpaid`}
              {pool.pending_payments > 0 && pool.pending_invites > 0 && " • "}
              {pool.pending_invites > 0 && `${pool.pending_invites} pending invites`}
              {(pool.pending_payments > 0 || pool.pending_invites > 0) && pendingApprovals > 0 && " • "}
              {pendingApprovals > 0 && `${pendingApprovals} pending approvals`}
            </span>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:flex gap-2 pt-2">
          <Button asChild variant="outline" size="sm" className="h-10 flex-1">
            <Link to={`/pool-admin/members?pool=${pool.id}`}>
              <Users className="h-4 w-4 mr-1" />
              Members
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-10 flex-1">
            <Link to={`/pools/${pool.id}/standings`}>
              <BarChart3 className="h-4 w-4 mr-1" />
              Standings
            </Link>
          </Button>
          <Button onClick={copyInviteLink} variant="outline" size="sm" className="h-10 col-span-2 sm:col-span-1">
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PoolCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-9" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PoolAdminPools() {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [isBulkUpdatingMarketplace, setIsBulkUpdatingMarketplace] = useState(false);
  const { isDemoMode } = useDemoAuth();
  const fromTour = Boolean((location.state as { fromTour?: boolean } | null)?.fromTour);

  const { data, isLoading, error, refetch } = useQuery<PoolsResponse>({
    queryKey: ["pool-admin-pools", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/my-pools", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch pools");
      return res.json();
    },
  });

  const pools = useMemo(() => data?.pools || [], [data?.pools]);
  const totals = data?.totals;

  // Get unique sports for filter
  const sports = useMemo(() => {
    const sportSet = new Set(pools.map(p => p.sport_key));
    return Array.from(sportSet);
  }, [pools]);

  // Filter pools
  const filteredPools = useMemo(() => {
    return pools.filter(pool => {
      // Search filter
      if (search && !pool.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // Status filter
      if (statusFilter !== "all" && pool.status !== statusFilter) {
        return false;
      }
      // Sport filter
      if (sportFilter !== "all" && pool.sport_key !== sportFilter) {
        return false;
      }
      return true;
    });
  }, [pools, search, statusFilter, sportFilter]);

  // Group by status
  const activeGroups = useMemo(() => {
    const active = filteredPools.filter(p => p.status === "active");
    const upcoming = filteredPools.filter(p => p.status === "upcoming");
    const completed = filteredPools.filter(p => p.status === "completed");
    return { active, upcoming, completed };
  }, [filteredPools]);

  const bulkUpdateMarketplace = async (listingStatus: "listed" | "hidden") => {
    if (filteredPools.length === 0) return;
    try {
      setIsBulkUpdatingMarketplace(true);
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      await Promise.all(
        filteredPools.map((pool) =>
          fetch(`/api/pool-admin/${pool.id}/marketplace-listing`, {
            method: "PATCH",
            credentials: "include",
            headers,
            body: JSON.stringify({
              listing_status: listingStatus,
              category_key: pool.format_key,
              is_featured: false,
              listing_fee_cents: 0,
            }),
          })
        )
      );
      await refetch();
    } finally {
      setIsBulkUpdatingMarketplace(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          title="Failed to load pools"
          description="There was an error loading your pools. Please try again."
          primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Pools</h1>
          <div className="mt-1">
            <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
              Demo Walkthrough - Step 3 of 3
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Manage every pool you own or administer from one command center
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto h-10">
          <Link to="/create-league">
            <Plus className="h-4 w-4 mr-2" />
            Create Pool
          </Link>
        </Button>
      </div>

      {fromTour && (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-300">Tour Complete - Pool Created</p>
              <p className="text-xs text-emerald-100/90">
                You just completed the guided path from templates to a live managed pool.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button asChild size="sm" className="h-9 w-full sm:w-auto">
                <Link to="/create-league?sport=nfl&format=pickem&tour=1">Run Tour Again</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
                <Link to="/pools">Open Marketplace</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 bg-card/80 shadow-sm lg:shadow-md">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Admin Flow</p>
            <p className="text-xs text-muted-foreground">
              1) Pick a template, 2) create/publish pools, 3) invite members and track payments.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
              <Link to="/admin/pool-types">Template Gallery</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
              <Link to="/pool-admin/dashboard">Admin Dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
              <Link to="/pools">Marketplace View</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {!isLoading && totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4 border-border/70">
            <div className="text-sm text-muted-foreground">Total Pools</div>
            <div className="text-xl sm:text-2xl font-bold">{totals.pools}</div>
          </Card>
          <Card className="p-4 border-border/70">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-xl sm:text-2xl font-bold text-green-600">{totals.active_pools}</div>
          </Card>
          <Card className="p-4 border-border/70">
            <div className="text-sm text-muted-foreground">Total Members</div>
            <div className="text-xl sm:text-2xl font-bold">{totals.total_members}</div>
          </Card>
          <Card className="p-4 border-border/70">
            <div className="text-sm text-muted-foreground">Pending Invites</div>
            <div className="text-xl sm:text-2xl font-bold text-amber-600">{totals.pending_invites}</div>
          </Card>
          <Card className="p-4 border-border/70">
            <div className="text-sm text-muted-foreground">Unpaid</div>
            <div className="text-xl sm:text-2xl font-bold text-red-600">{totals.pending_payments}</div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_170px_170px] gap-3">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sportFilter} onValueChange={setSportFilter}>
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Sport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sports</SelectItem>
            {sports.map(sport => (
              <SelectItem key={sport} value={sport}>
                {SPORT_LABELS[sport] || sport}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && filteredPools.length > 0 && (
        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Bulk Marketplace Actions</p>
              <p className="text-xs text-muted-foreground">
                Apply to {filteredPools.length} currently visible pool{filteredPools.length === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full"
                disabled={isBulkUpdatingMarketplace}
                onClick={() => bulkUpdateMarketplace("listed")}
              >
                Publish Visible
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full"
                disabled={isBulkUpdatingMarketplace}
                onClick={() => bulkUpdateMarketplace("hidden")}
              >
                Hide Visible
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <PoolCardSkeleton />
          <PoolCardSkeleton />
          <PoolCardSkeleton />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && pools.length === 0 && (
        <EmptyState
          title="No pools yet"
          description="You haven't created or been made admin of any pools yet."
          primaryAction={{ label: "Create Your First Pool", href: "/create-league" }}
        />
      )}

      {/* Filtered Empty State */}
      {!isLoading && pools.length > 0 && filteredPools.length === 0 && (
        <EmptyState
          title="No matching pools"
          description="No pools match your current filters."
          primaryAction={{ label: "Clear Filters", onClick: () => {
            setSearch("");
            setStatusFilter("all");
            setSportFilter("all");
          }}}
        />
      )}

      {/* Pool Groups */}
      {!isLoading && filteredPools.length > 0 && (
        <div className="space-y-8">
          {/* Active Pools */}
          {activeGroups.active.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Active Pools
                <Badge variant="secondary">{activeGroups.active.length}</Badge>
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGroups.active.map(pool => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Pools */}
          {activeGroups.upcoming.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Upcoming Pools
                <Badge variant="secondary">{activeGroups.upcoming.length}</Badge>
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGroups.upcoming.map(pool => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Pools */}
          {activeGroups.completed.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Pause className="h-5 w-5 text-muted-foreground" />
                Completed Pools
                <Badge variant="secondary">{activeGroups.completed.length}</Badge>
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGroups.completed.map(pool => (
                  <PoolCard key={pool.id} pool={pool} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
