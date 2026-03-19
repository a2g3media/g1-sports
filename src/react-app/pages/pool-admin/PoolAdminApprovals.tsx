import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock3,
  AlertTriangle,
  ArrowRight,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Input } from "@/react-app/components/ui/input";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import { EmptyState } from "@/react-app/components/ui/empty-state";

type ApprovalRequest = {
  member_id: number;
  league_id: number;
  pool_name: string;
  sport_key: string;
  user_id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
  invite_status: string;
  requested_at: string;
  age_hours: number;
  age_bucket: "new" | "aging" | "urgent";
};

type ApprovalResponse = {
  requests: ApprovalRequest[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  summary: {
    total: number;
    new: number;
    aging: number;
    urgent: number;
    by_sport: Record<string, number>;
  };
};

function ageBadgeClass(bucket: ApprovalRequest["age_bucket"]): string {
  if (bucket === "urgent") return "bg-red-500/10 text-red-600 border-red-500/20";
  if (bucket === "aging") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
}

function ageLabel(ageHours: number): string {
  if (ageHours < 1) return "just now";
  if (ageHours < 24) return `${ageHours}h`;
  const days = Math.floor(ageHours / 24);
  return `${days}d`;
}

function ApprovalSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="rounded-lg border p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-8 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PoolAdminApprovals() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending_approval");
  const [ageBucketFilter, setAgeBucketFilter] = useState("all");
  const [bulkDraftAction, setBulkDraftAction] = useState<"approve" | "reject" | null>(null);
  const [scheduledRejectRows, setScheduledRejectRows] = useState<ApprovalRequest[]>([]);
  const [scheduledRejectCountdown, setScheduledRejectCountdown] = useState(0);
  const rejectTimerRef = useRef<number | null>(null);

  const queueQuery = useQuery({
    queryKey: ["pool-admin-approvals-queue", page, search, sportFilter, statusFilter, ageBucketFilter, isDemoMode],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: "25",
        sport: sportFilter,
        status: statusFilter,
        age_bucket: ageBucketFilter,
      });
      if (search.trim()) params.set("search", search.trim());
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/approvals/queue?${params.toString()}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch approvals queue");
      return res.json() as Promise<ApprovalResponse>;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ leagueId, memberId }: { leagueId: number; memberId: number }) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/approve`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to approve request");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-approvals-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ leagueId, memberId }: { leagueId: number; memberId: number }) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/reject`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to reject request");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-approvals-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
    },
  });

  const bulkModerationMutation = useMutation({
    mutationFn: async (payload: { action: "approve" | "reject"; rows?: ApprovalRequest[] }) => {
      const action = payload.action;
      const pendingRows = payload.rows && payload.rows.length > 0
        ? payload.rows
        : queue.filter((row) => row.invite_status === "pending_approval");
      if (!pendingRows.length) return { processed: 0, succeeded: 0, failed: 0 };
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const results = await Promise.all(
        pendingRows.map(async (row) => {
          const endpoint = action === "approve" ? "approve" : "reject";
          const res = await fetch(`/api/pool-admin/${row.league_id}/members/${row.member_id}/${endpoint}`, {
            method: "POST",
            credentials: "include",
            headers,
          });
          return { ok: res.ok, row };
        }),
      );

      const succeededRows = results.filter((r) => r.ok).map((r) => r.row);
      const failedRows = results.filter((r) => !r.ok).map((r) => r.row);
      const succeeded = succeededRows.length;
      const failed = failedRows.length;

      // Best-effort audit event for each bulk moderation run.
      await fetch("/api/pool-admin/approvals/bulk-audit", {
        method: "POST",
        credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          filters: {
            sport: sportFilter,
            status: statusFilter,
            age_bucket: ageBucketFilter,
            search: search.trim(),
          },
          processed_count: pendingRows.length,
          succeeded_count: succeeded,
          failed_count: failed,
          attempted_rows: pendingRows.map((row) => ({
            league_id: row.league_id,
            member_id: row.member_id,
            user_id: row.user_id,
          })),
          succeeded_member_ids: succeededRows.map((row) => row.member_id),
          failed_member_ids: failedRows.map((row) => row.member_id),
        }),
      }).catch(() => undefined);

      return {
        processed: pendingRows.length,
        succeeded,
        failed,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-approvals-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      void queryClient.invalidateQueries({ queryKey: ["pool-admin", "my-pools"] });
      setBulkDraftAction(null);
      setScheduledRejectRows([]);
      setScheduledRejectCountdown(0);
    },
  });

  const queue = queueQuery.data?.requests || [];
  const summary = queueQuery.data?.summary;
  const pagination = queueQuery.data?.pagination;
  const sports = useMemo(() => Object.keys(summary?.by_sport || {}).sort(), [summary?.by_sport]);
  const pendingRowsInView = useMemo(
    () => queue.filter((row) => row.invite_status === "pending_approval"),
    [queue],
  );
  const isBusy = approveMutation.isPending || rejectMutation.isPending || bulkModerationMutation.isPending;
  const pendingInView = pendingRowsInView.length;
  const showStickySafetyBar = bulkDraftAction !== null || (scheduledRejectRows.length > 0 && scheduledRejectCountdown > 0);

  useEffect(() => {
    if (pendingInView === 0 && bulkDraftAction) {
      setBulkDraftAction(null);
    }
  }, [pendingInView, bulkDraftAction]);

  useEffect(() => {
    return () => {
      if (rejectTimerRef.current) {
        window.clearInterval(rejectTimerRef.current);
        rejectTimerRef.current = null;
      }
    };
  }, []);

  const exportRowsToCsv = (rows: ApprovalRequest[], actionLabel: "approve" | "reject") => {
    if (!rows.length) return;
    const headers = ["Member Name", "Email", "Pool", "Sport", "Age (hours)", "Requested At", "Action"];
    const escapeCsv = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    const lines = rows.map((row) => [
      row.name || "",
      row.email,
      row.pool_name,
      row.sport_key.toUpperCase(),
      String(row.age_hours),
      row.requested_at,
      actionLabel,
    ].map(escapeCsv).join(","));
    const csv = [headers.map(escapeCsv).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `approval-dry-run-${actionLabel}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const undoScheduledReject = () => {
    if (rejectTimerRef.current) {
      window.clearInterval(rejectTimerRef.current);
      rejectTimerRef.current = null;
    }
    setScheduledRejectRows([]);
    setScheduledRejectCountdown(0);
  };

  const scheduleRejectWithUndoWindow = (rows: ApprovalRequest[]) => {
    if (!rows.length) return;
    undoScheduledReject();
    setScheduledRejectRows(rows);
    setScheduledRejectCountdown(10);
    setBulkDraftAction(null);

    let ticks = 10;
    rejectTimerRef.current = window.setInterval(() => {
      ticks -= 1;
      setScheduledRejectCountdown(ticks);
      if (ticks <= 0) {
        undoScheduledReject();
        bulkModerationMutation.mutate({ action: "reject", rows: rows.slice() });
      }
    }, 1000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-violet-600" />
            Approvals
          </h1>
          <p className="text-muted-foreground">Central moderation queue across all of your pools.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queueQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Queue
        </Button>
      </div>

      {showStickySafetyBar && (
        <div className="sticky top-0 z-20 rounded-lg border border-red-500/30 bg-red-500/10 p-3 backdrop-blur supports-[backdrop-filter]:bg-red-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {bulkDraftAction && (
                <>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Bulk {bulkDraftAction} is staged for {pendingInView} request{pendingInView === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-red-700/80 dark:text-red-300/80">
                    Review the dry-run details below before confirming.
                  </p>
                </>
              )}
              {!bulkDraftAction && scheduledRejectRows.length > 0 && scheduledRejectCountdown > 0 && (
                <>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Bulk reject queued: {scheduledRejectRows.length} request{scheduledRejectRows.length === 1 ? "" : "s"} in {scheduledRejectCountdown}s
                  </p>
                  <p className="text-xs text-red-700/80 dark:text-red-300/80">
                    Tap Undo to cancel before execution.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {bulkDraftAction && (
                <Button size="sm" variant="outline" onClick={() => setBulkDraftAction(null)}>
                  Clear Staged Action
                </Button>
              )}
              {!bulkDraftAction && scheduledRejectRows.length > 0 && scheduledRejectCountdown > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/10"
                  onClick={undoScheduledReject}
                >
                  Undo Reject
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {queueQuery.isLoading ? (
        <ApprovalSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-violet-700 dark:text-violet-300">Pending Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary?.total || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-700 dark:text-amber-300">Needs Attention</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{(summary?.aging || 0) + (summary?.urgent || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{summary?.urgent || 0} urgent</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-emerald-700 dark:text-emerald-300">Fresh Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{summary?.new || 0}</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full md:w-72">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, email, pool"
                className="pl-9"
              />
            </div>
            <Select value={sportFilter} onValueChange={(v) => { setSportFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sports</SelectItem>
                {sports.map((sport) => (
                  <SelectItem key={sport} value={sport}>
                    {sport.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="joined">Joined</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ageBucketFilter} onValueChange={(v) => { setAgeBucketFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Age" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ages</SelectItem>
                <SelectItem value="new">New (&lt;24h)</SelectItem>
                <SelectItem value="aging">Aging (1-3d)</SelectItem>
                <SelectItem value="urgent">Urgent (&gt;3d)</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2 w-full md:w-auto">
              <Button
                size="sm"
                disabled={isBusy || pendingInView === 0}
                onClick={() => {
                  setBulkDraftAction("approve");
                }}
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                Approve All In View
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-500/30 hover:bg-red-500/10"
                disabled={isBusy || pendingInView === 0}
                onClick={() => {
                  setBulkDraftAction("reject");
                }}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Reject All In View
              </Button>
            </div>
          </div>

          {bulkDraftAction && pendingRowsInView.length > 0 && (
            <Card className={bulkDraftAction === "approve" ? "border-emerald-500/30" : "border-red-500/30"}>
              <CardHeader className="pb-2">
                <CardTitle className={bulkDraftAction === "approve" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>
                  Dry-Run Preview: {bulkDraftAction === "approve" ? "Approve" : "Reject"} {pendingRowsInView.length} request{pendingRowsInView.length === 1 ? "" : "s"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Review the impacted members below. This action will apply only to rows currently in this filtered view.
                </p>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Sport</TableHead>
                        <TableHead>Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRowsInView.map((row) => (
                        <TableRow key={`dry-run-${row.league_id}-${row.member_id}`}>
                          <TableCell>
                            <p className="font-medium">{row.name || row.email}</p>
                            <p className="text-xs text-muted-foreground">{row.email}</p>
                          </TableCell>
                          <TableCell>{row.pool_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.sport_key.toUpperCase()}</Badge>
                          </TableCell>
                          <TableCell>{ageLabel(row.age_hours)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={isBusy}
                    variant={bulkDraftAction === "approve" ? "default" : "destructive"}
                    onClick={() => {
                      if (bulkDraftAction === "approve") {
                        bulkModerationMutation.mutate({ action: "approve" });
                        return;
                      }
                      scheduleRejectWithUndoWindow(pendingRowsInView);
                    }}
                  >
                    {bulkDraftAction === "approve" ? (
                      <>
                        <CheckCheck className="h-4 w-4 mr-1.5" />
                        Confirm Approve All
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-1.5" />
                        Confirm Reject All
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isBusy || pendingRowsInView.length === 0}
                    onClick={() => exportRowsToCsv(pendingRowsInView, bulkDraftAction)}
                  >
                    Export Impact CSV
                  </Button>
                  <Button variant="outline" disabled={isBusy} onClick={() => setBulkDraftAction(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {scheduledRejectRows.length > 0 && scheduledRejectCountdown > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Reject queued for {scheduledRejectRows.length} request{scheduledRejectRows.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-red-700/80 dark:text-red-300/80">
                    Executing in {scheduledRejectCountdown}s. Undo to cancel.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/10"
                  onClick={undoScheduledReject}
                >
                  Undo Reject
                </Button>
              </CardContent>
            </Card>
          )}

          {bulkModerationMutation.isPending && (
            <p className="text-sm text-cyan-700 dark:text-cyan-300">
              Running bulk moderation for {pendingInView} request(s)...
            </p>
          )}
          {bulkModerationMutation.isSuccess && bulkModerationMutation.data && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Bulk moderation finished: {bulkModerationMutation.data.succeeded}/{bulkModerationMutation.data.processed} succeeded
              {bulkModerationMutation.data.failed > 0 ? ` (${bulkModerationMutation.data.failed} failed)` : ""}.
            </p>
          )}

          {queue.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Approval queue is clear"
              description="No requests matched your current filters."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Pool</TableHead>
                      <TableHead>Sport</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((request) => (
                      <TableRow key={`${request.league_id}-${request.member_id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{request.name || request.email}</p>
                            <p className="text-xs text-muted-foreground">{request.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => navigate(`/pool-admin/members?pool=${request.league_id}&invite_status=pending_approval`)}
                          >
                            <p className="font-medium">{request.pool_name}</p>
                            <p className="text-xs text-muted-foreground">Pool #{request.league_id}</p>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{request.sport_key.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {request.invite_status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ageBadgeClass(request.age_bucket)}>
                            {request.age_bucket === "urgent" ? (
                              <AlertTriangle className="h-3 w-3 mr-1" />
                            ) : (
                              <Clock3 className="h-3 w-3 mr-1" />
                            )}
                            {ageLabel(request.age_hours)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {request.invite_status === "pending_approval" ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => approveMutation.mutate({ leagueId: request.league_id, memberId: request.member_id })}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-500/30 hover:bg-red-500/10"
                                  disabled={isBusy}
                                  onClick={() => rejectMutation.mutate({ leagueId: request.league_id, memberId: request.member_id })}
                                >
                                  <XCircle className="h-4 w-4 mr-1.5" />
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/pool-admin/members?pool=${request.league_id}`)}
                              >
                                Open Pool
                                <ArrowRight className="h-4 w-4 ml-1.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {pagination?.page || 1} of {pagination?.total_pages || 1} ({pagination?.total || 0} requests)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination || pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination || pagination.page >= pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
