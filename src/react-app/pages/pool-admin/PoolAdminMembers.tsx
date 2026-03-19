import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  Filter,
  ChevronDown,
  MoreHorizontal,
  Mail,
  Crown,
  ShieldCheck,
  User,
  UserMinus,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Badge } from "@/react-app/components/ui/badge";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { EmptyState } from "@/react-app/components/ui/empty-state";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";

interface Pool {
  id: number;
  name: string;
  sport_key: string;
  member_count: number;
  pending_approvals?: number;
}

interface Member {
  member_id: number;
  user_id: string;
  name: string | null;
  email: string;
  phone_masked: string | null;
  avatar_url: string | null;
  role: string;
  invite_status: string;
  pick_status: "submitted" | "missing" | "locked";
  last_submission: string | null;
  receipt_count_period: number;
  receipt_count_season: number;
  payment_status: "paid" | "unpaid" | "pending";
  eligibility_status: "eligible" | "ineligible";
  last_active: string | null;
  notes: string | null;
  joined_at: string | null;
  flags: string[];
}

interface MembersResponse {
  members: Member[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  meta: {
    current_period: string;
    next_lock_time: string | null;
    league_info: {
      is_payment_required: boolean;
    };
  };
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3.5 w-3.5 text-amber-500" />,
  admin: <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />,
  member: <User className="h-3.5 w-3.5 text-muted-foreground" />,
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function MemberAvatar({ member }: { member: Member }) {
  const initials = member.name
    ? member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : member.email.slice(0, 2).toUpperCase();

  return (
    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center flex-shrink-0">
      {member.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={member.name || member.email}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {initials}
        </span>
      )}
    </div>
  );
}

function PickStatusBadge({ status }: { status: Member["pick_status"] }) {
  const config = {
    submitted: { label: "Submitted", variant: "default" as const, icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    missing: { label: "Missing", variant: "destructive" as const, icon: AlertCircle, className: "bg-red-500/10 text-red-600 border-red-500/20" },
    locked: { label: "Locked", variant: "secondary" as const, icon: Clock, className: "bg-muted text-muted-foreground" },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function PaymentStatusBadge({ status }: { status: Member["payment_status"] }) {
  const config = {
    paid: { label: "Paid", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    pending: { label: "Pending", icon: Clock, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    unpaid: { label: "Unpaid", icon: XCircle, className: "bg-red-500/10 text-red-600 border-red-500/20" },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function InviteStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    joined: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    invited: { label: "Invited", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    pending_approval: { label: "Pending Approval", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    removed: { label: "Removed", className: "bg-muted text-muted-foreground" },
  };

  const { label, className } = config[status] || config.joined;

  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}

function MemberActions({
  member,
  onRoleChange,
  onRemove,
  onApprove,
  onReject,
}: {
  member: Member;
  onRoleChange: (userId: string, newRole: string) => void;
  onRemove: (userId: string) => void;
  onApprove: (memberId: number) => void;
  onReject: (memberId: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => window.open(`mailto:${member.email}`, "_blank")}
        >
          <Mail className="h-4 w-4 mr-2" />
          Send Email
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {member.invite_status === "pending_approval" && (
          <>
            <DropdownMenuItem onClick={() => onApprove(member.member_id)}>
              <UserCheck className="h-4 w-4 mr-2" />
              Approve Request
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onReject(member.member_id)}
              className="text-red-600 focus:text-red-600"
            >
              <UserX className="h-4 w-4 mr-2" />
              Reject Request
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {member.role !== "owner" && (
          <>
            {member.role === "member" && (
              <DropdownMenuItem onClick={() => onRoleChange(member.user_id, "admin")}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Promote to Admin
              </DropdownMenuItem>
            )}
            {member.role === "admin" && (
              <DropdownMenuItem onClick={() => onRoleChange(member.user_id, "member")}>
                <User className="h-4 w-4 mr-2" />
                Demote to Member
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onRemove(member.user_id)}
              className="text-red-600 focus:text-red-600"
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Remove from Pool
            </DropdownMenuItem>
          </>
        )}
        {member.role === "owner" && (
          <DropdownMenuItem disabled className="text-muted-foreground">
            Owner cannot be modified
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="rounded-lg border">
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PoolAdminMembers() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoAuth();
  const [searchParams] = useSearchParams();
  const inviteStatusFromQuery = searchParams.get("invite_status") || "all";
  const [selectedPoolId, setSelectedPoolId] = useState<string>(searchParams.get("pool") || "all");
  const [search, setSearch] = useState("");
  const [inviteStatusFilter, setInviteStatusFilter] = useState<string>(inviteStatusFromQuery);
  const [pickStatusFilter, setPickStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [membersViewMode, setMembersViewMode] = useState<"all" | "moderation" | "active" | "invited">(
    inviteStatusFromQuery === "pending_approval"
      ? "moderation"
      : inviteStatusFromQuery === "joined"
        ? "active"
        : inviteStatusFromQuery === "invited"
          ? "invited"
          : "all",
  );

  useEffect(() => {
    const nextPool = searchParams.get("pool") || "all";
    const nextInviteStatus = searchParams.get("invite_status") || "all";
    setSelectedPoolId(nextPool);
    setInviteStatusFilter(nextInviteStatus);
    if (nextInviteStatus === "pending_approval") {
      setMembersViewMode("moderation");
    } else if (nextInviteStatus === "joined") {
      setMembersViewMode("active");
    } else if (nextInviteStatus === "invited") {
      setMembersViewMode("invited");
    } else {
      setMembersViewMode("all");
    }
    setPage(1);
  }, [searchParams]);

  // Fetch pools list
  const { data: poolsData, isLoading: poolsLoading } = useQuery({
    queryKey: ["pool-admin-pools", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/my-pools", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch pools");
      return res.json() as Promise<{ pools: Pool[] }>;
    },
  });

  const pools = poolsData?.pools || [];

  // Fetch members for selected pool
  const { data: membersData, isLoading: membersLoading, refetch } = useQuery({
    queryKey: ["pool-admin-members", selectedPoolId, page, inviteStatusFilter, pickStatusFilter, paymentStatusFilter, roleFilter],
    queryFn: async () => {
      if (selectedPoolId === "all") return null;
      const params = new URLSearchParams({ page: String(page), per_page: "25" });
      if (inviteStatusFilter !== "all") params.set("invite_status", inviteStatusFilter);
      if (pickStatusFilter !== "all") params.set("pick_status", pickStatusFilter);
      if (paymentStatusFilter !== "all") params.set("payment_status", paymentStatusFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);

      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/members?${params}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json() as Promise<MembersResponse>;
    },
    enabled: selectedPoolId !== "all",
  });

  // Role change mutation
  const roleChangeMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/members/${userId}/role`, {
        method: "PUT",
        headers,
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to change role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to remove member");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pool-admin-pools"] });
    },
  });

  const approveMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/members/${memberId}/approve`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to approve member request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pool-admin-pools"] });
    },
  });

  const rejectMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/members/${memberId}/reject`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to reject member request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pool-admin-pools"] });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (memberIds: number[]) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const results = await Promise.all(
        memberIds.map(async (memberId) => {
          const res = await fetch(`/api/pool-admin/${selectedPoolId}/members/${memberId}/approve`, {
            method: "POST",
            credentials: "include",
            headers,
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || "Failed to approve one or more join requests");
          }
          return res.json();
        })
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pool-admin-pools"] });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async (memberIds: number[]) => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const results = await Promise.all(
        memberIds.map(async (memberId) => {
          const res = await fetch(`/api/pool-admin/${selectedPoolId}/members/${memberId}/reject`, {
            method: "POST",
            credentials: "include",
            headers,
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || "Failed to reject one or more join requests");
          }
          return res.json();
        })
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pool-admin-pools"] });
    },
  });

  // Filter members by search locally
  const filteredMembers = useMemo(() => {
    if (!membersData?.members) return [];
    if (!search.trim()) return membersData.members;

    const q = search.toLowerCase();
    return membersData.members.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        m.email.toLowerCase().includes(q)
    );
  }, [membersData?.members, search]);

  const selectedPool = pools.find((p) => String(p.id) === selectedPoolId);
  const isPaymentRequired = membersData?.meta?.league_info?.is_payment_required ?? false;
  const currentPeriod = membersData?.meta?.current_period || "Week 1";
  const pendingApprovalMembers = useMemo(
    () => filteredMembers.filter((member) => member.invite_status === "pending_approval"),
    [filteredMembers]
  );

  const applyMembersViewMode = (mode: "all" | "moderation" | "active" | "invited") => {
    setMembersViewMode(mode);
    setPage(1);
    if (mode === "moderation") {
      setInviteStatusFilter("pending_approval");
      return;
    }
    if (mode === "active") {
      setInviteStatusFilter("joined");
      return;
    }
    if (mode === "invited") {
      setInviteStatusFilter("invited");
      return;
    }
    setInviteStatusFilter("all");
  };

  const handleInviteStatusFilterChange = (value: string) => {
    setInviteStatusFilter(value);
    setPage(1);
    if (value === "pending_approval") {
      setMembersViewMode("moderation");
    } else if (value === "joined") {
      setMembersViewMode("active");
    } else if (value === "invited") {
      setMembersViewMode("invited");
    } else if (value === "all") {
      setMembersViewMode("all");
    }
  };

  const handleExport = () => {
    if (!filteredMembers.length) return;
    const headers = ["Name", "Email", "Role", "Status", "Picks", "Payment", "Last Active"];
    const rows = filteredMembers.map((m) => [
      m.name || "",
      m.email,
      ROLE_LABELS[m.role] || m.role,
      m.invite_status,
      m.pick_status,
      m.payment_status,
      m.last_active || "",
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedPool?.name || "pool"}-members.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = poolsLoading || (selectedPoolId !== "all" && membersLoading);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600" />
            Members
          </h1>
          <p className="text-muted-foreground">
            Manage pool members, track picks, and handle payments
          </p>
        </div>
        {selectedPoolId !== "all" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        )}
      </div>

      {/* Pool Selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-64">
          <Select value={selectedPoolId} onValueChange={(v) => { setSelectedPoolId(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select a pool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Select a pool...</SelectItem>
              {pools.map((pool) => (
                <SelectItem key={pool.id} value={String(pool.id)}>
                  {pool.name} ({pool.member_count} members)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPoolId !== "all" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={membersViewMode === "all" ? "default" : "outline"}
                className="h-8"
                onClick={() => applyMembersViewMode("all")}
              >
                All Members
              </Button>
              <Button
                size="sm"
                variant={membersViewMode === "moderation" ? "default" : "outline"}
                className="h-8"
                onClick={() => applyMembersViewMode("moderation")}
              >
                Pending Requests
              </Button>
              <Button
                size="sm"
                variant={membersViewMode === "active" ? "default" : "outline"}
                className="h-8"
                onClick={() => applyMembersViewMode("active")}
              >
                Active
              </Button>
              <Button
                size="sm"
                variant={membersViewMode === "invited" ? "default" : "outline"}
                className="h-8"
                onClick={() => applyMembersViewMode("invited")}
              >
                Invited
              </Button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={inviteStatusFilter} onValueChange={handleInviteStatusFilterChange}>
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="joined">Active</SelectItem>
                      <SelectItem value="invited">Invited</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="removed">Removed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Picks</label>
                  <Select value={pickStatusFilter} onValueChange={setPickStatusFilter}>
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Picks</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isPaymentRequired && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Payment</label>
                    <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                      <SelectTrigger className="mt-1 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Payments</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Role</label>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : selectedPoolId === "all" ? (
        inviteStatusFilter === "pending_approval" ? (
          (() => {
            const approvalQueuePools = pools
              .filter((pool) => Number(pool.pending_approvals || 0) > 0)
              .sort((a, b) => Number(b.pending_approvals || 0) - Number(a.pending_approvals || 0));
            if (!approvalQueuePools.length) {
              return (
                <EmptyState
                  icon={UserCheck}
                  title="Approval queue is clear"
                  description="No pools currently have pending approval requests."
                />
              );
            }
            return (
              <div className="space-y-3">
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
                  <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Cross-pool Approval Queue</p>
                  <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
                    Jump into each pool with pending requests and approve/reject quickly.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {approvalQueuePools.map((pool) => (
                    <div key={`approval-queue-${pool.id}`} className="rounded-lg border bg-card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{pool.name}</p>
                          <p className="text-xs text-muted-foreground">Pool #{pool.id}</p>
                        </div>
                        <Badge className="border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300">
                          {Number(pool.pending_approvals || 0)} pending
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedPoolId(String(pool.id));
                            setInviteStatusFilter("pending_approval");
                            setMembersViewMode("moderation");
                            setPage(1);
                          }}
                        >
                          <UserCheck className="mr-1.5 h-4 w-4" />
                          Open Queue
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        ) : (
          <EmptyState
            icon={Users}
            title="Select a pool"
            description="Choose a pool from the dropdown above to view and manage its members."
          />
        )
      ) : filteredMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members found"
          description={search ? "Try adjusting your search or filters." : "This pool has no members yet."}
        />
      ) : (
        <>
          {pendingApprovalMembers.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    Join Requests
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                    {pendingApprovalMembers.length} pending request{pendingApprovalMembers.length === 1 ? "" : "s"} in current view.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-9"
                    disabled={bulkApproveMutation.isPending || bulkRejectMutation.isPending}
                    onClick={() => bulkApproveMutation.mutate(pendingApprovalMembers.map((m) => m.member_id))}
                  >
                    <UserCheck className="h-4 w-4 mr-1.5" />
                    Approve All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={bulkApproveMutation.isPending || bulkRejectMutation.isPending}
                    onClick={() => {
                      if (confirm(`Reject ${pendingApprovalMembers.length} join request(s)?`)) {
                        bulkRejectMutation.mutate(pendingApprovalMembers.map((m) => m.member_id));
                      }
                    }}
                  >
                    <UserX className="h-4 w-4 mr-1.5" />
                    Reject All
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Period Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              Current Period: <strong className="text-foreground">{currentPeriod}</strong>
            </span>
            <span>•</span>
            <span>
              {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Data Table */}
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Picks</TableHead>
                  {isPaymentRequired && <TableHead>Payment</TableHead>}
                  <TableHead>Last Active</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow key={member.member_id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar member={member} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {member.name || member.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        </div>
                        {member.flags.length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-4 w-4 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <ul className="text-xs space-y-1">
                                  {member.flags.includes("unpaid") && <li>Payment required</li>}
                                  {member.flags.includes("missing_picks") && <li>Missing picks</li>}
                                  {member.flags.includes("pending_invite") && <li>Pending invite</li>}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {ROLE_ICONS[member.role]}
                        <span className="text-sm">{ROLE_LABELS[member.role] || member.role}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <InviteStatusBadge status={member.invite_status} />
                    </TableCell>
                    <TableCell>
                      <PickStatusBadge status={member.pick_status} />
                    </TableCell>
                    {isPaymentRequired && (
                      <TableCell>
                        <PaymentStatusBadge status={member.payment_status} />
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(member.last_active)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <MemberActions
                        member={member}
                        onRoleChange={(userId, newRole) =>
                          roleChangeMutation.mutate({ userId, newRole })
                        }
                        onRemove={(userId) => {
                          if (confirm("Remove this member from the pool?")) {
                            removeMemberMutation.mutate(userId);
                          }
                        }}
                        onApprove={(memberId) => approveMemberMutation.mutate(memberId)}
                        onReject={(memberId) => {
                          if (confirm("Reject this join request?")) {
                            rejectMemberMutation.mutate(memberId);
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {membersData?.pagination && membersData.pagination.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {membersData.pagination.page} of {membersData.pagination.total_pages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= membersData.pagination.total_pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Loading indicators for mutations */}
      {(roleChangeMutation.isPending ||
        removeMemberMutation.isPending ||
        approveMemberMutation.isPending ||
        rejectMemberMutation.isPending ||
        bulkApproveMutation.isPending ||
        bulkRejectMutation.isPending) && (
        <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-4 flex items-center gap-3 shadow-lg border">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Updating...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PoolAdminMembers;
