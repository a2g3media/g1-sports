import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/react-app/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/react-app/components/ui/alert-dialog";
import { 
  Layers, 
  Users, 
  DollarSign, 
  TrendingUp,
  AlertCircle,
  Plus,
  ArrowRight,
  Bell,
  Activity,
  Trophy,
  Target,
  Clock,
  Mail,
  CheckCircle2,
  TriangleAlert,
  ShieldAlert,
  FileText,
  ExternalLink,
  Database,
  Loader2,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Link } from "react-router-dom";
import { PoolAdminCoachGCopilot } from "@/react-app/pages/pool-admin/PoolAdminCoachGCopilot";

interface PoolData {
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
  pools: PoolData[];
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

type BulkCopilotAction = "approve_all_pending" | "remind_missing_picks" | "remind_unpaid_members";

function getLaunchHealth(pool: PoolData): {
  score: number;
  label: "Healthy" | "Watch" | "At Risk";
  colorClass: string;
  summary: string;
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
      summary: "Launch posture is strong",
    };
  }
  if (score >= 55) {
    return {
      score,
      label: "Watch",
      colorClass: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10",
      summary: "A few blockers need follow-up",
    };
  }
  return {
    score,
    label: "At Risk",
    colorClass: "text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10",
    summary: "Critical admin actions needed",
  };
}

type ReleaseVerdict = "READY" | "READY_WITH_WARNINGS" | "BLOCKED" | "UNKNOWN";

type ReleaseSummary = {
  available: boolean;
  verdict: ReleaseVerdict;
  pass: number;
  warn: number;
  fail: number;
  duration: string;
  startedAt: string;
  error?: string;
};

type DashboardActivityItem = {
  id: number;
  action_type: string;
  summary: string;
  details: Record<string, unknown> | null;
  pool_id?: string | number | null;
  pool_name?: string | null;
  created_at: string;
  actor: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
};

type DashboardActivityResponse = {
  activities: DashboardActivityItem[];
};

type LastBulkModerationSnapshot = {
  last: DashboardActivityItem | null;
  runsLast24h: number;
};

type BackfillEntryEventsResult = {
  success: boolean;
  dryRun: boolean;
  targetUserId: number | null;
  entriesProcessed: number;
  entryCreatedInserted: number;
  picksSubmittedInserted: number;
  pickScoredInserted: number;
};

type BackfillEntryEventsMutationResult = BackfillEntryEventsResult & {
  poolId: string;
};

// Map format keys to display names
const formatLabels: Record<string, string> = {
  survivor: "Survivor",
  ats: "Against the Spread",
  bracket: "Bracket",
  squares: "Squares",
  props: "Props",
  pickem: "Pick'em",
};

// Map sport keys to display names
const sportLabels: Record<string, string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ncaaf: "College Football",
  ncaab: "College Basketball",
  soccer: "Soccer",
};

function parseReleaseSummaryMarkdown(markdown: string): ReleaseSummary {
  const pickNumber = (label: string): number => {
    const match = markdown.match(new RegExp(`- ${label}:\\s*(\\d+)`, "i"));
    return match ? Number(match[1]) : 0;
  };
  const pickText = (label: string): string => {
    const match = markdown.match(new RegExp(`- ${label}:\\s*(.+)`, "i"));
    return match ? String(match[1]).trim() : "";
  };

  const verdictMatch = markdown.match(/- Verdict:\s*\*\*([A-Z_]+)\*\*/);
  const rawVerdict = verdictMatch?.[1];
  const verdict: ReleaseVerdict =
    rawVerdict === "READY" || rawVerdict === "READY_WITH_WARNINGS" || rawVerdict === "BLOCKED"
      ? rawVerdict
      : "UNKNOWN";

  return {
    available: true,
    verdict,
    pass: pickNumber("PASS"),
    warn: pickNumber("WARN"),
    fail: pickNumber("FAIL"),
    duration: pickText("Total duration"),
    startedAt: pickText("Started at"),
  };
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  color = "primary",
  loading = false,
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: typeof Layers;
  trend?: { value: number; label: string };
  color?: "primary" | "emerald" | "amber" | "blue";
  loading?: boolean;
}) {
  const colorClasses = {
    primary: "from-primary/20 to-primary/5 text-primary",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400",
    blue: "from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-400",
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-12 w-12 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  +{trend.value}%
                </span>
                <span className="text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn(
            "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center",
            colorClasses[color]
          )}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PoolCard({ pool }: { pool: PoolData }) {
  const navigate = useNavigate();
  
  const statusConfig = {
    active: { label: "Active", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    upcoming: { label: "Upcoming", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    completed: { label: "Completed", color: "bg-muted text-muted-foreground" },
  };

  const missingPicks = pool.member_count - pool.members_submitted;
  const pendingApprovals = Math.max(0, pool.pending_approvals || 0);
  const launchHealth = getLaunchHealth(pool);

  return (
    <Card 
      className="hover:border-primary/30 transition-colors cursor-pointer group" 
      onClick={() => navigate(`/pools/${pool.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {pool.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {formatLabels[pool.format_key] || pool.format_key} • {sportLabels[pool.sport_key] || pool.sport_key}
            </p>
          </div>
          <Badge variant="secondary" className={cn("text-[10px] ml-2 shrink-0", statusConfig[pool.status].color)}>
            {statusConfig[pool.status].label}
          </Badge>
        </div>

        {pool.current_period && pool.status === "active" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
            <Clock className="h-3 w-3" />
            <span>{pool.current_period}</span>
          </div>
        )}

        <div className="mb-3 rounded-lg border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Launch Health</p>
            <Badge variant="outline" className={cn("text-[10px]", launchHealth.colorClass)}>
              {launchHealth.label} {launchHealth.score}
            </Badge>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                launchHealth.score >= 80
                  ? "bg-emerald-500"
                  : launchHealth.score >= 55
                    ? "bg-amber-500"
                    : "bg-red-500"
              )}
              style={{ width: `${launchHealth.score}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{launchHealth.summary}</p>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-lg font-bold">{pool.member_count}</p>
            <p className="text-[10px] text-muted-foreground">Members</p>
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            missingPicks > 0 && pool.status === "active" ? "bg-blue-500/10" : "bg-muted/50"
          )}>
            <p className={cn(
              "text-lg font-bold",
              missingPicks > 0 && pool.status === "active" && "text-blue-600 dark:text-blue-400"
            )}>
              {pool.members_submitted}
            </p>
            <p className="text-[10px] text-muted-foreground">Submitted</p>
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            pool.pending_payments > 0 ? "bg-amber-500/10" : "bg-muted/50"
          )}>
            <p className={cn(
              "text-lg font-bold",
              pool.pending_payments > 0 && "text-amber-600 dark:text-amber-400"
            )}>
              {pool.pending_payments}
            </p>
            <p className="text-[10px] text-muted-foreground">Unpaid</p>
          </div>
        </div>

        {pool.pending_invites > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span>{pool.pending_invites} pending invite{pool.pending_invites !== 1 ? "s" : ""}</span>
          </div>
        )}
        {pendingApprovals > 0 && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-3 w-3" />
            <span>{pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PoolCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PoolAdminDashboard() {
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [selectedBackfillPoolId, setSelectedBackfillPoolId] = useState("");
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState<BackfillEntryEventsResult | null>(null);
  const [backfillPreviewPoolId, setBackfillPreviewPoolId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PoolsResponse>({
    queryKey: ["pool-admin", "my-pools", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/my-pools", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to load pools");
      return res.json();
    },
  });

  const releaseStatus = useQuery<ReleaseSummary>({
    queryKey: ["pool-admin", "release-status"],
    queryFn: async () => {
      const res = await fetch("/docs/release-reports/latest-pools-release.md", {
        cache: "no-store",
      });
      if (!res.ok) {
        return {
          available: false,
          verdict: "UNKNOWN",
          pass: 0,
          warn: 0,
          fail: 0,
          duration: "",
          startedAt: "",
          error: "No release report found yet",
        } satisfies ReleaseSummary;
      }
      const markdown = await res.text();
      return parseReleaseSummaryMarkdown(markdown);
    },
    refetchInterval: 60_000,
  });

  const lastBulkModerationQuery = useQuery<LastBulkModerationSnapshot>({
    queryKey: ["pool-admin", "last-bulk-moderation", isDemoMode],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: "25",
        offset: "0",
      });
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/activity?${params.toString()}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) return { last: null, runsLast24h: 0 };
      const payload = (await res.json()) as DashboardActivityResponse;
      const candidates = (payload.activities || []).filter((item) =>
        item.action_type === "pool_members_approved_bulk" || item.action_type === "pool_members_rejected_bulk",
      );
      if (!candidates.length) return { last: null, runsLast24h: 0 };
      const sorted = candidates.sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime;
      });
      const now = Date.now();
      const runsLast24h = sorted.filter(
        (item) => now - new Date(item.created_at).getTime() <= 24 * 60 * 60 * 1000,
      ).length;
      return { last: sorted[0] || null, runsLast24h };
    },
    refetchInterval: 30_000,
  });

  const lastBackfillActivityQuery = useQuery<DashboardActivityItem | null>({
    queryKey: ["pool-admin", "last-entry-backfill", isDemoMode],
    queryFn: async () => {
      const params = new URLSearchParams({
        action_type: "pool_entry_events_backfilled",
        limit: "10",
        offset: "0",
      });
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/activity?${params.toString()}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as DashboardActivityResponse;
      const rows = (payload.activities || [])
        .filter((item) => item.action_type === "pool_entry_events_backfilled")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return rows[0] || null;
    },
    refetchInterval: 30_000,
  });

  const pools = data?.pools || [];
  const totals = data?.totals;
  const release = releaseStatus.data;
  const lastBulkModeration = lastBulkModerationQuery.data?.last || null;
  const bulkRunsLast24h = Number(lastBulkModerationQuery.data?.runsLast24h || 0);

  const activePools = pools.filter(p => p.status === "active");
  const backfillTargetPools = pools.filter((pool) => pool.status !== "completed");
  const effectiveBackfillPoolId = selectedBackfillPoolId || String(backfillTargetPools[0]?.id || "");
  const upcomingPools = pools.filter(p => p.status === "upcoming");
  const criticalPools = pools.filter((pool) => getLaunchHealth(pool).score < 55).length;
  const totalPendingApprovals = Number(totals?.pending_approvals || 0);
  const lastBulkActionLabel =
    lastBulkModeration?.action_type === "pool_members_approved_bulk"
      ? "Bulk approvals"
      : lastBulkModeration?.action_type === "pool_members_rejected_bulk"
        ? "Bulk rejections"
        : "Bulk moderation";
  const lastBulkDetails = (lastBulkModeration?.details || {}) as Record<string, unknown>;
  const lastBulkSucceeded = Number(lastBulkDetails.succeeded_count || 0);
  const lastBulkFailed = Number(lastBulkDetails.failed_count || 0);
  const lastBulkProcessed = Number(lastBulkDetails.processed_count || 0);
  const lastBulkWhen = lastBulkModeration?.created_at
    ? new Date(lastBulkModeration.created_at).toLocaleString()
    : "";
  const lastBackfillActivity = lastBackfillActivityQuery.data;
  const lastBackfillDetails = (lastBackfillActivity?.details || {}) as Record<string, unknown>;
  const lastBackfillPoolName = lastBackfillActivity?.pool_name || "Unknown pool";
  const lastBackfillWhen = lastBackfillActivity?.created_at
    ? new Date(lastBackfillActivity.created_at).toLocaleString()
    : "";
  const lastBackfillInserted = Number(lastBackfillDetails.entryCreatedInserted || 0)
    + Number(lastBackfillDetails.picksSubmittedInserted || 0)
    + Number(lastBackfillDetails.pickScoredInserted || 0);
  const moderationLoadLevel: "quiet" | "normal" | "high" =
    bulkRunsLast24h >= 8 ? "high" : bulkRunsLast24h >= 3 ? "normal" : "quiet";
  const moderationLoadBadgeClass =
    moderationLoadLevel === "high"
      ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
      : moderationLoadLevel === "normal"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";

  const runBulkCopilotAction = useMutation({
    mutationFn: async (action: BulkCopilotAction) => {
      const targetPools = pools.filter((pool) => pool.status !== "completed");
      if (!targetPools.length) {
        return { action, pools_touched: 0, affected_count: 0 };
      }
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const responses = await Promise.all(
        targetPools.map(async (pool) => {
          const res = await fetch(`/api/pool-admin/${pool.id}/copilot/action`, {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({ action, confirm: true }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            return { ok: false, poolId: pool.id, affected: 0 };
          }
          return { ok: true, poolId: pool.id, affected: Number(payload.affected_count || 0) };
        }),
      );

      const affectedCount = responses.reduce((sum, row) => sum + row.affected, 0);
      const poolsTouched = responses.filter((row) => row.ok).length;
      return { action, pools_touched: poolsTouched, affected_count: affectedCount };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
    },
  });

  const retryAutomationAcrossPools = useMutation({
    mutationFn: async () => {
      const targetPools = pools.filter((pool) => pool.status !== "completed");
      if (!targetPools.length) return { pools_touched: 0, retried_count: 0 };
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const responses = await Promise.all(
        targetPools.map(async (pool) => {
          const res = await fetch(`/api/pool-admin/${pool.id}/copilot/automation/retry-failed`, {
            method: "POST",
            credentials: "include",
            headers,
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) return { ok: false, retried: 0 };
          return { ok: true, retried: Number(payload.retried_count || 0) };
        }),
      );
      return {
        pools_touched: responses.filter((row) => row.ok).length,
        retried_count: responses.reduce((sum, row) => sum + row.retried, 0),
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
    },
  });

  const backfillEntryEvents = useMutation({
    mutationFn: async (opts: { poolId: string; dryRun: boolean }) => {
      if (!opts.poolId) throw new Error("Select a pool first.");
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/leagues/${opts.poolId}/backfill-entry-events`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ dryRun: opts.dryRun }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to run backfill.");
      return {
        ...(payload as BackfillEntryEventsResult),
        poolId: opts.poolId,
      } as BackfillEntryEventsMutationResult;
    },
    onSuccess: (result) => {
      if (result.dryRun) {
        setBackfillPreview(result);
        setBackfillPreviewPoolId(result.poolId);
      } else {
        setBackfillConfirmOpen(false);
        setBackfillPreview(null);
        setBackfillPreviewPoolId(null);
        void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
        void queryClient.invalidateQueries({ queryKey: ["pool-admin", "last-entry-backfill"] });
      }
    },
  });

  const selectedBackfillPoolName = useMemo(() => {
    const selected = backfillTargetPools.find((pool) => String(pool.id) === effectiveBackfillPoolId);
    return selected?.name || "selected pool";
  }, [backfillTargetPools, effectiveBackfillPoolId]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pool Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage your pools, members, and payments
          </p>
        </div>
        <Button onClick={() => navigate("/create-league")} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Pool
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Admin Command Center</p>
              <p className="text-sm text-muted-foreground">
                Templates define pool structure. Created pools are the active leagues you manage.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/pool-types">Manage Templates</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/pool-admin/pools">Manage Created Pools</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/create-league">Create Pool</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-500/20 bg-slate-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            Release Status
          </CardTitle>
          <CardDescription>
            Latest Pools QA release verdict from automated report output.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {releaseStatus.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : release?.available ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    release.verdict === "READY" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    release.verdict === "READY_WITH_WARNINGS" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    release.verdict === "BLOCKED" && "bg-destructive/10 text-destructive",
                    release.verdict === "UNKNOWN" && "bg-muted text-muted-foreground",
                  )}
                >
                  {release.verdict === "READY" && <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  {release.verdict === "READY_WITH_WARNINGS" && <TriangleAlert className="h-3.5 w-3.5 mr-1" />}
                  {release.verdict === "BLOCKED" && <ShieldAlert className="h-3.5 w-3.5 mr-1" />}
                  {release.verdict}
                </Badge>
                <Badge variant="outline">PASS {release.pass}</Badge>
                <Badge variant="outline">WARN {release.warn}</Badge>
                <Badge variant="outline">FAIL {release.fail}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Started: {release.startedAt || "Unknown"} • Duration: {release.duration || "Unknown"}
              </p>
              <div>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href="/docs/release-reports/latest-pools-release.md" target="_blank" rel="noreferrer">
                    View full report
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {release?.error || "Release report not available yet."}
              </p>
              <p className="text-xs text-muted-foreground">
                Run <code>npm run qa:pools:release:report</code> to generate the latest release status artifact.
              </p>
              <div>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href="/docs/release-reports/latest-pools-release.md" target="_blank" rel="noreferrer">
                    Try open report
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Pools"
          value={totals?.pools || 0}
          subtitle={`${totals?.active_pools || 0} active`}
          icon={Layers}
          color="primary"
          loading={isLoading}
        />
        <StatCard
          title="Total Members"
          value={totals?.total_members || 0}
          subtitle="Across all pools"
          icon={Users}
          color="blue"
          loading={isLoading}
        />
        <StatCard
          title="Pending Payments"
          value={totals?.pending_payments || 0}
          subtitle={totals?.pending_payments === 0 ? "All caught up!" : "Needs attention"}
          icon={DollarSign}
          color={totals?.pending_payments && totals.pending_payments > 0 ? "amber" : "emerald"}
          loading={isLoading}
        />
        <StatCard
          title="Picks Submitted"
          value={totals?.total_submitted || 0}
          subtitle="This period"
          icon={Target}
          color="emerald"
          loading={isLoading}
        />
      </div>

      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Bulk Commissioner Speed Actions
          </CardTitle>
          <CardDescription>
            Run one action across all non-completed pools to clear bottlenecks quickly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={runBulkCopilotAction.isPending || pools.length === 0}
              onClick={() => runBulkCopilotAction.mutate("approve_all_pending")}
            >
              Approve All Pending
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={runBulkCopilotAction.isPending || pools.length === 0}
              onClick={() => runBulkCopilotAction.mutate("remind_missing_picks")}
            >
              Remind Missing Picks
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={runBulkCopilotAction.isPending || pools.length === 0}
              onClick={() => runBulkCopilotAction.mutate("remind_unpaid_members")}
            >
              Remind Unpaid Members
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={retryAutomationAcrossPools.isPending || pools.length === 0}
              onClick={() => retryAutomationAcrossPools.mutate()}
            >
              Retry Failed Automation Queue
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pools monitored: {pools.length} total • {criticalPools} at-risk health states.
          </p>
          {runBulkCopilotAction.isPending && (
            <p className="text-xs text-cyan-700 dark:text-cyan-300">Running bulk action across pools...</p>
          )}
          {runBulkCopilotAction.isSuccess && runBulkCopilotAction.data && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Completed {runBulkCopilotAction.data.action} across {runBulkCopilotAction.data.pools_touched} pool(s);
              affected members: {runBulkCopilotAction.data.affected_count}.
            </p>
          )}
          {runBulkCopilotAction.isError && (
            <p className="text-xs text-destructive">Bulk action failed. Please retry.</p>
          )}
          {retryAutomationAcrossPools.isPending && (
            <p className="text-xs text-cyan-700 dark:text-cyan-300">Retrying failed automation deliveries across pools...</p>
          )}
          {retryAutomationAcrossPools.isSuccess && retryAutomationAcrossPools.data && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Retried {retryAutomationAcrossPools.data.retried_count} failed queue item(s) across{" "}
              {retryAutomationAcrossPools.data.pools_touched} pool(s).
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-teal-500/20 bg-teal-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Entry History Backfill
          </CardTitle>
          <CardDescription>
            Quick maintenance action to seed missing entry timeline events for legacy pools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="w-full md:max-w-xs">
              <Select
                value={effectiveBackfillPoolId}
                onValueChange={(value) => {
                  setSelectedBackfillPoolId(value);
                  setBackfillPreview(null);
                  setBackfillPreviewPoolId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select pool" />
                </SelectTrigger>
                <SelectContent>
                  {backfillTargetPools.map((pool) => (
                    <SelectItem key={pool.id} value={String(pool.id)}>
                      {pool.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={backfillEntryEvents.isPending || !effectiveBackfillPoolId}
                onClick={() => backfillEntryEvents.mutate({ poolId: effectiveBackfillPoolId, dryRun: true })}
              >
                {backfillEntryEvents.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Dry Run
              </Button>
              <Button
                size="sm"
                disabled={
                  backfillEntryEvents.isPending
                  || !effectiveBackfillPoolId
                  || !backfillPreview
                  || backfillPreviewPoolId !== effectiveBackfillPoolId
                }
                onClick={() => setBackfillConfirmOpen(true)}
              >
                Apply Backfill
              </Button>
            </div>
          </div>
          {backfillPreview && backfillPreviewPoolId === effectiveBackfillPoolId ? (
            <div className="rounded-md border border-teal-500/20 bg-background/60 px-3 py-2 text-xs space-y-1">
              <p className="text-muted-foreground">Dry-run preview</p>
              <p>
                Entries {backfillPreview.entriesProcessed} • entry_created +{backfillPreview.entryCreatedInserted} •
                picks_submitted +{backfillPreview.picksSubmittedInserted} • pick_scored +{backfillPreview.pickScoredInserted}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Run dry-run first to preview insert counts before applying.
            </p>
          )}
          {lastBackfillActivityQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading last backfill run...</p>
          ) : lastBackfillActivity ? (
            <div className="rounded-md border border-teal-500/20 bg-background/60 px-3 py-2 text-xs space-y-1">
              <p className="text-muted-foreground">Last run</p>
              <p>
                {lastBackfillPoolName} • {lastBackfillWhen}
              </p>
              <p>
                Rows inserted {lastBackfillInserted} • by {lastBackfillActivity.actor?.name || "Unknown"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No backfill run has been logged yet.</p>
          )}
          {backfillEntryEvents.isError && (
            <p className="text-xs text-destructive">{(backfillEntryEvents.error as Error).message}</p>
          )}
          {backfillEntryEvents.isSuccess && backfillEntryEvents.data && !backfillEntryEvents.data.dryRun && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Backfill completed for {selectedBackfillPoolName}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Last Bulk Moderation Action
          </CardTitle>
          <CardDescription>
            Most recent cross-pool approval/rejection run captured by audit logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {lastBulkModerationQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : lastBulkModeration ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    lastBulkModeration.action_type === "pool_members_approved_bulk"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-500/10 text-red-700 dark:text-red-300",
                  )}
                >
                  {lastBulkActionLabel}
                </Badge>
                <Badge variant="outline">Processed {lastBulkProcessed}</Badge>
                <Badge variant="outline">Succeeded {lastBulkSucceeded}</Badge>
                <Badge variant="outline">Failed {lastBulkFailed}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className={moderationLoadBadgeClass}>
                        {bulkRunsLast24h} bulk run{bulkRunsLast24h === 1 ? "" : "s"} in 24h • {moderationLoadLevel}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Thresholds: quiet &lt; 3, normal 3-7, high &gt;= 8 (last 24h).</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">
                By {lastBulkModeration.actor?.name || "Unknown"} on {lastBulkWhen}
              </p>
              <p className="text-sm">{lastBulkModeration.summary}</p>
              <div>
                <Button variant="outline" size="sm" onClick={() => navigate("/pool-admin/activity")}>
                  Open Activity Log
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No bulk moderation actions logged yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Alerts Section */}
      {totals && totals.pending_payments > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  {totals.pending_payments} pending payment{totals.pending_payments !== 1 ? "s" : ""} require attention
                </p>
                <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                  Review and approve member payments to keep pools running smoothly
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 shrink-0"
                onClick={() => navigate("/pool-admin/payments")}
              >
                Review Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {totals && totals.pending_invites > 0 && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-blue-700 dark:text-blue-300">
                  {totals.pending_invites} pending invite{totals.pending_invites !== 1 ? "s" : ""} awaiting response
                </p>
                <p className="text-sm text-blue-600/80 dark:text-blue-400/80">
                  Some invited members haven't joined yet. Consider sending a reminder.
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 shrink-0"
                onClick={() => navigate("/pool-admin/members")}
              >
                View Members
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {totalPendingApprovals > 0 && (
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-violet-700 dark:text-violet-300">
                  {totalPendingApprovals} pending approval request{totalPendingApprovals !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-violet-600/80 dark:text-violet-400/80">
                  Members are waiting on commissioner approval before they can enter pools.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 shrink-0"
                onClick={() => navigate("/pool-admin/approvals")}
              >
                Open Approval Queue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coach G Copilot */}
      {pools.length > 0 && (
        <PoolAdminCoachGCopilot
          pools={pools.map((pool) => ({
            id: pool.id,
            name: pool.name,
            status: pool.status,
          }))}
          isDemoMode={isDemoMode}
        />
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-destructive text-sm">Failed to load pools. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {/* Active Pools */}
      {(isLoading || activePools.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-600" />
                <div>
                  <CardTitle className="text-lg">Active Pools</CardTitle>
                  <CardDescription>
                    Currently running pools
                  </CardDescription>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-1"
                onClick={() => navigate("/pool-admin/pools")}
              >
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                <>
                  <PoolCardSkeleton />
                  <PoolCardSkeleton />
                  <PoolCardSkeleton />
                </>
              ) : (
                activePools.map(pool => (
                  <PoolCard key={pool.id} pool={pool} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Pools */}
      {upcomingPools.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle className="text-lg">Upcoming Pools</CardTitle>
                <CardDescription>
                  Pools that haven't started yet
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingPools.map(pool => (
                <PoolCard key={pool.id} pool={pool} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && pools.length === 0 && !error && (
        <EmptyState
          icon={Layers}
          title="No pools yet"
          description="Create your first pool to start managing members and tracking picks."
          primaryAction={{
            label: "Create Your First Pool",
            href: "/create-league"
          }}
        />
      )}

      {/* Quick Actions */}
      {pools.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate("/pool-admin/members")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium">Manage Members</p>
                <p className="text-xs text-muted-foreground">Invite, remove, or message</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate("/pool-admin/notifications")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium">Send Announcements</p>
                <p className="text-xs text-muted-foreground">Notify pool members</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate("/pool-admin/activity")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-medium">Activity Log</p>
                <p className="text-xs text-muted-foreground">View recent actions</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={backfillConfirmOpen} onOpenChange={setBackfillConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Backfill for {selectedBackfillPoolName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This writes missing `entry_created`, `picks_submitted`, and `pick_scored` timeline events for historical data.
              Existing event rows are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfillEntryEvents.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!effectiveBackfillPoolId) return;
                backfillEntryEvents.mutate({ poolId: effectiveBackfillPoolId, dryRun: false });
              }}
              disabled={backfillEntryEvents.isPending || !effectiveBackfillPoolId}
            >
              {backfillEntryEvents.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Apply Backfill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
