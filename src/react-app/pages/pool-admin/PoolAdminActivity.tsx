import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Badge } from "@/react-app/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/react-app/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import {
  Activity,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  UserMinus,
  DollarSign,
  Bell,
  Settings,
  Shield,
  Eye,
  Clock,
  RefreshCw,
  CheckCheck,
  Ban,
} from "lucide-react";

interface ActivityActor {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

interface ActivityItem {
  id: number;
  action_type: string;
  summary: string;
  entity_type: string;
  entity_id: string | number | null;
  details: Record<string, unknown> | null;
  pool_id?: string | number;
  pool_name?: string;
  created_at: string;
  actor: ActivityActor | null;
}

interface Pool {
  id: string | number;
  name: string;
}

interface ActivityResponse {
  activities: ActivityItem[];
  pools: Pool[];
  action_types: string[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// Map action types to icons and colors
const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pool_member_invited: { icon: UserPlus, color: "text-blue-500", label: "Member Invited" },
  pool_member_removed: { icon: UserMinus, color: "text-red-500", label: "Member Removed" },
  invite_resent: { icon: Bell, color: "text-blue-400", label: "Invite Resent" },
  invites_resent_bulk: { icon: Bell, color: "text-blue-400", label: "Bulk Invites Resent" },
  role_changed_manager: { icon: Shield, color: "text-purple-500", label: "Role Changed" },
  payment_verified: { icon: DollarSign, color: "text-green-500", label: "Payment Verified" },
  payment_unverified: { icon: DollarSign, color: "text-orange-500", label: "Payment Unverified" },
  payments_verified_bulk: { icon: DollarSign, color: "text-green-500", label: "Bulk Payments Verified" },
  payments_unverified_bulk: { icon: DollarSign, color: "text-orange-500", label: "Bulk Payments Unverified" },
  reminder_sent: { icon: Bell, color: "text-yellow-500", label: "Reminder Sent" },
  reminders_sent_bulk: { icon: Bell, color: "text-yellow-500", label: "Bulk Reminders Sent" },
  pool_members_approved_bulk: { icon: CheckCheck, color: "text-emerald-500", label: "Bulk Members Approved" },
  pool_members_rejected_bulk: { icon: Ban, color: "text-red-500", label: "Bulk Members Rejected" },
  pool_made_public: { icon: Eye, color: "text-emerald-500", label: "Made Public" },
  pool_made_private: { icon: Eye, color: "text-gray-500", label: "Made Private" },
  phone_revealed: { icon: Eye, color: "text-indigo-500", label: "Phone Revealed" },
  notes_updated: { icon: Settings, color: "text-gray-500", label: "Notes Updated" },
};

const ACTIVITY_QUICK_FILTERS: Array<{ value: string; label: string }> = [
  { value: "pool_members_approved_bulk", label: "Bulk Approvals" },
  { value: "pool_members_rejected_bulk", label: "Bulk Rejections" },
  { value: "pool_member_approved", label: "Single Approvals" },
  { value: "pool_member_rejected", label: "Single Rejections" },
];

function getActionConfig(actionType: string) {
  return ACTION_CONFIG[actionType] || { icon: Activity, color: "text-muted-foreground", label: actionType };
}

function formatActionLabel(actionType: string): string {
  const config = getActionConfig(actionType);
  if (config.label !== actionType) return config.label;
  // Fallback: convert snake_case to Title Case
  return actionType
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const config = getActionConfig(activity.action_type);
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(activity.created_at), { addSuffix: true });
  const fullDate = format(new Date(activity.created_at), "MMM d, yyyy 'at' h:mm a");

  return (
    <div className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors">
      {/* Actor Avatar */}
      <Avatar className="h-10 w-10">
        <AvatarImage src={activity.actor?.avatar_url || undefined} />
        <AvatarFallback className="bg-muted">
          {activity.actor?.name?.charAt(0).toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="font-medium text-sm">{activity.summary}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>by {activity.actor?.name || "System"}</span>
          {activity.pool_name && (
            <>
              <span>•</span>
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                {activity.pool_name}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground" title={fullDate}>
          {timeAgo}
        </p>
        <Badge variant="secondary" className="text-xs mt-1">
          {formatActionLabel(activity.action_type)}
        </Badge>
      </div>
    </div>
  );
}

export function PoolAdminActivity() {
  const { isDemoMode } = useDemoAuth();
  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, error, refetch, isFetching } = useQuery<ActivityResponse>({
    queryKey: ["pool-admin-activity", poolFilter, actionFilter, page, isDemoMode],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      if (poolFilter !== "all") params.set("pool_id", poolFilter);
      if (actionFilter !== "all") params.set("action_type", actionFilter);

      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/activity?${params}`, { headers });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
  });

  // Filter activities by search query (client-side)
  const filteredActivities = data?.activities.filter(activity => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      activity.summary.toLowerCase().includes(q) ||
      activity.actor?.name.toLowerCase().includes(q) ||
      activity.actor?.email.toLowerCase().includes(q) ||
      activity.pool_name?.toLowerCase().includes(q)
    );
  }) || [];

  const totalPages = data ? Math.ceil(data.pagination.total / pageSize) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Activity Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Track all actions and changes across your pools
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Pool Filter */}
            <Select value={poolFilter} onValueChange={(v) => { setPoolFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Pools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pools</SelectItem>
                {data?.pools.map((pool) => (
                  <SelectItem key={pool.id} value={String(pool.id)}>
                    {pool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action Type Filter */}
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Activity className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {data?.action_types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatActionLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">Quick filters</Badge>
            {ACTIVITY_QUICK_FILTERS.map((quick) => (
              <Button
                key={quick.value}
                type="button"
                size="sm"
                variant={actionFilter === quick.value ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setActionFilter(quick.value);
                  setPage(0);
                }}
              >
                {quick.label}
              </Button>
            ))}
            {actionFilter !== "all" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setActionFilter("all");
                  setPage(0);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            {data ? `${data.pagination.total} total events` : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ActivitySkeleton />
          ) : error ? (
            <EmptyState
              icon={Activity}
              title="Failed to load activity"
              description="There was an error loading the activity log. Please try again."
              primaryAction={{ label: "Retry", onClick: () => refetch() }}
            />
          ) : filteredActivities.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity found"
              description={
                searchQuery || poolFilter !== "all" || actionFilter !== "all"
                  ? "Try adjusting your filters to see more results."
                  : "Activity will appear here as you manage your pools."
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data && totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.pagination.has_more}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
