import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  UserPlus,
  Bell,
  Mail,
  Eye,
  Trash2,
  Shield,
  UserCog,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Receipt,
  Activity,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Checkbox } from "@/react-app/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { InviteMembersModal } from "@/react-app/components/pool-admin/InviteMembersModal";
import { SendReminderModal } from "@/react-app/components/pool-admin/SendReminderModal";
import { BulkActionsBar } from "@/react-app/components/pool-admin/BulkActionsBar";
import { MemberDetailDrawer } from "@/react-app/components/pool-admin/MemberDetailDrawer";
import { AdminReceiptViewer } from "@/react-app/components/pool-admin/AdminReceiptViewer";

// Types
interface PoolMember {
  member_id: number;
  user_id: string;
  name: string | null;
  email: string;
  phone_masked: string | null;
  avatar_url: string | null;
  role: "owner" | "admin" | "member";
  invite_status: "invited" | "joined" | "declined" | "removed";
  pick_status: "submitted" | "missing" | "locked";
  last_submission: string | null;
  receipt_count_period: number;
  receipt_count_season: number;
  payment_status: "paid" | "unpaid" | "pending";
  eligibility_status: "eligible" | "ineligible";
  last_active: string | null;
  notes: string | null;
  invited_at: string | null;
  joined_at: string | null;
  notification_email: boolean;
  notification_sms: boolean;
  flags: string[];
}

interface MembersResponse {
  members: PoolMember[];
  pagination: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
  stats: {
    total: number;
    joined: number;
    invited: number;
    submitted: number;
    missing_picks: number;
    paid: number;
    unpaid: number;
    eligible: number;
  };
  context: {
    current_period: string;
    next_lock_time: string | null;
    is_payment_required: boolean;
    entry_fee_cents: number;
  };
}

interface Pool {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  invite_code?: string;
}

// Filter chip component
function FilterChip({
  label,
  value,
  options,
  onChange,
  onClear,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            value
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-secondary text-muted-foreground hover:bg-secondary/80"
          )}
        >
          {selectedOption ? selectedOption.label : label}
          {value ? (
            <X
              className="w-3 h-3 cursor-pointer hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[150px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              "flex items-center gap-2",
              value === option.value && "bg-primary/10"
            )}
          >
            {value === option.value && <Check className="w-3 h-3" />}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Status badge components
function PickStatusBadge({ status }: { status: string }) {
  const config = {
    submitted: { icon: CheckCircle2, className: "bg-green-500/10 text-green-600" },
    missing: { icon: XCircle, className: "bg-red-500/10 text-red-500" },
    locked: { icon: Clock, className: "bg-amber-500/10 text-amber-600" },
  }[status] || { icon: Clock, className: "bg-muted text-muted-foreground" };

  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", config.className)}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config = {
    paid: { icon: CheckCircle2, className: "bg-green-500/10 text-green-600" },
    unpaid: { icon: XCircle, className: "bg-red-500/10 text-red-500" },
    pending: { icon: Clock, className: "bg-amber-500/10 text-amber-600" },
  }[status] || { icon: Clock, className: "bg-muted text-muted-foreground" };

  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", config.className)}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const config = {
    owner: { icon: Shield, className: "bg-amber-500/10 text-amber-600" },
    admin: { icon: Shield, className: "bg-purple-500/10 text-purple-600" },
    member: { icon: null, className: "bg-muted text-muted-foreground" },
  }[role] || { icon: null, className: "bg-muted text-muted-foreground" };

  const Icon = config.icon;

  if (role === "member") return null;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", config.className)}>
      {Icon && <Icon className="w-3 h-3" />}
      {role}
    </span>
  );
}

function InviteStatusBadge({ status }: { status: string }) {
  const config = {
    joined: { className: "bg-green-500/10 text-green-600" },
    invited: { className: "bg-blue-500/10 text-blue-600" },
    declined: { className: "bg-red-500/10 text-red-500" },
    removed: { className: "bg-muted text-muted-foreground line-through" },
  }[status] || { className: "bg-muted text-muted-foreground" };

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", config.className)}>
      {status}
    </span>
  );
}

// Format time helpers
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PoolAdminMembers() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  // Data state
  const [pool, setPool] = useState<Pool | null>(null);
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [stats, setStats] = useState<MembersResponse["stats"] | null>(null);
  const [context, setContext] = useState<MembersResponse["context"] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, per_page: 25, total_count: 0, total_pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [revealedPhones, setRevealedPhones] = useState<Map<number, string>>(new Map());

  // Filters
  const [inviteStatusFilter, setInviteStatusFilter] = useState<string | null>(null);
  const [pickStatusFilter, setPickStatusFilter] = useState<string | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(null);
  const [eligibilityFilter, setEligibilityFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<number | null>(null);
  const [receiptViewerMember, setReceiptViewerMember] = useState<{ id: number; name: string } | null>(null);

  // Fetch pool info
  useEffect(() => {
    async function fetchPool() {
      try {
        const res = await fetch(`/api/leagues/${leagueId}`);
        if (res.ok) {
          const data = await res.json();
          setPool(data);
        }
      } catch (e) {
        console.error("Failed to fetch pool", e);
      }
    }
    fetchPool();
  }, [leagueId]);

  // Fetch members
  const fetchMembers = useCallback(async () => {
    if (!leagueId) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        per_page: String(pagination.per_page),
        sort_by: sortBy,
        sort_dir: sortDir,
      });

      if (searchQuery) params.set("search", searchQuery);
      if (inviteStatusFilter) params.set("invite_status", inviteStatusFilter);
      if (pickStatusFilter) params.set("pick_status", pickStatusFilter);
      if (paymentStatusFilter) params.set("payment_status", paymentStatusFilter);
      if (eligibilityFilter) params.set("eligibility", eligibilityFilter);
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/pool-admin/${leagueId}/members?${params}`);
      
      if (!res.ok) {
        if (res.status === 403) {
          setError("You don't have admin access to this pool");
        } else {
          setError("Failed to load members");
        }
        return;
      }

      const data: MembersResponse = await res.json();
      setMembers(data.members);
      setStats(data.stats);
      setContext(data.context);
      setPagination(data.pagination);
    } catch (e) {
      console.error("Failed to fetch members", e);
      setError("Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, pagination.page, pagination.per_page, sortBy, sortDir, searchQuery, inviteStatusFilter, pickStatusFilter, paymentStatusFilter, eligibilityFilter, roleFilter]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Toggle sort
  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedMembers.size === members.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(members.map((m) => m.member_id)));
    }
  };

  const toggleSelectMember = (memberId: number) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  // Phone reveal
  const revealPhone = async (memberId: number) => {
    try {
      const res = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/reveal-phone`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedPhones((prev) => new Map(prev).set(memberId, data.phone || "Not set"));
      }
    } catch (e) {
      console.error("Failed to reveal phone", e);
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    setInviteStatusFilter(null);
    setPickStatusFilter(null);
    setPaymentStatusFilter(null);
    setEligibilityFilter(null);
    setRoleFilter(null);
    setSearchQuery("");
  };

  const hasActiveFilters = inviteStatusFilter || pickStatusFilter || paymentStatusFilter || eligibilityFilter || roleFilter || searchQuery;

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  if (error && error.includes("admin access")) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
            <button onClick={() => navigate(-1)} className="hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{pool?.name || "Pool"}</span>
            <span>/</span>
            <span>Admin</span>
            <span>/</span>
            <span className="text-foreground">Members</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Members
              </h1>
              {context && (
                <p className="text-sm text-muted-foreground mt-1">
                  {context.current_period}
                  {context.next_lock_time && (
                    <> • Lock: {formatDateTime(context.next_lock_time)}</>
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReminderModal(true)}
                disabled={selectedMembers.size === 0}
              >
                <Bell className="w-4 h-4 mr-1.5" />
                Send Reminder
              </Button>
              <Button size="sm" onClick={() => setShowInviteModal(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" />
                Invite Members
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-green-600">{stats.joined}</p>
              <p className="text-xs text-muted-foreground">Joined</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-blue-600">{stats.invited}</p>
              <p className="text-xs text-muted-foreground">Invited</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-green-600">{stats.submitted}</p>
              <p className="text-xs text-muted-foreground">Submitted</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-red-500">{stats.missing_picks}</p>
              <p className="text-xs text-muted-foreground">Missing</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-green-600">{stats.paid}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-amber-600">{stats.unpaid}</p>
              <p className="text-xs text-muted-foreground">Unpaid</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-green-600">{stats.eligible}</p>
              <p className="text-xs text-muted-foreground">Eligible</p>
            </div>
          </div>
        )}

        {/* Filters & Search */}
        <div className="bg-card border border-border rounded-xl mb-4">
          <div className="p-4 flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search name, email, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-secondary/50 border-transparent focus:border-border"
              />
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              
              <FilterChip
                label="Invite Status"
                value={inviteStatusFilter}
                onChange={setInviteStatusFilter}
                onClear={() => setInviteStatusFilter(null)}
                options={[
                  { value: "joined", label: "Joined" },
                  { value: "invited", label: "Invited" },
                  { value: "declined", label: "Declined" },
                  { value: "removed", label: "Removed" },
                ]}
              />

              <FilterChip
                label="Pick Status"
                value={pickStatusFilter}
                onChange={setPickStatusFilter}
                onClear={() => setPickStatusFilter(null)}
                options={[
                  { value: "submitted", label: "Submitted" },
                  { value: "missing", label: "Missing" },
                  { value: "locked", label: "Locked" },
                ]}
              />

              <FilterChip
                label="Payment"
                value={paymentStatusFilter}
                onChange={setPaymentStatusFilter}
                onClear={() => setPaymentStatusFilter(null)}
                options={[
                  { value: "paid", label: "Paid" },
                  { value: "unpaid", label: "Unpaid" },
                  { value: "pending", label: "Pending" },
                ]}
              />

              <FilterChip
                label="Eligibility"
                value={eligibilityFilter}
                onChange={setEligibilityFilter}
                onClear={() => setEligibilityFilter(null)}
                options={[
                  { value: "eligible", label: "Eligible" },
                  { value: "ineligible", label: "Ineligible" },
                ]}
              />

              <FilterChip
                label="Role"
                value={roleFilter}
                onChange={setRoleFilter}
                onClear={() => setRoleFilter(null)}
                options={[
                  { value: "owner", label: "Owner" },
                  { value: "admin", label: "Admin" },
                  { value: "member", label: "Member" },
                ]}
              />

              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectedMembers.size > 0 && leagueId && (
            <BulkActionsBar
              selectedCount={selectedMembers.size}
              selectedMemberIds={[...selectedMembers]}
              leagueId={leagueId}
              onClearSelection={() => setSelectedMembers(new Set())}
              onSendReminder={() => setShowReminderModal(true)}
              onResendInvites={async () => {
                try {
                  await fetch(`/api/pool-admin/${leagueId}/bulk/resend-invites`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ member_ids: [...selectedMembers] }),
                  });
                  fetchMembers();
                  setSelectedMembers(new Set());
                } catch (e) {
                  console.error("Failed to resend invites", e);
                }
              }}
              onSuccess={() => fetchMembers()}
            />
          )}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={members.length > 0 && selectedMembers.size === members.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("name")}
                  >
                    <span className="flex items-center gap-1">
                      Name <SortIcon column="name" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("pick_status")}
                  >
                    <span className="flex items-center gap-1">
                      Picks <SortIcon column="pick_status" />
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("last_submission")}
                  >
                    <span className="flex items-center gap-1">
                      Last Submit <SortIcon column="last_submission" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Receipts
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("payment_status")}
                  >
                    <span className="flex items-center gap-1">
                      Payment <SortIcon column="payment_status" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Eligible
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => toggleSort("last_active")}
                  >
                    <span className="flex items-center gap-1">
                      Last Active <SortIcon column="last_active" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Flags
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading members...</span>
                      </div>
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12">
                      <div className="text-center">
                        <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No members found</p>
                        {hasActiveFilters && (
                          <button
                            onClick={clearAllFilters}
                            className="text-sm text-primary mt-2 hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr
                      key={member.member_id}
                      className={cn(
                        "transition-colors hover:bg-secondary/30",
                        selectedMembers.has(member.member_id) && "bg-primary/5"
                      )}
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedMembers.has(member.member_id)}
                          onCheckedChange={() => toggleSelectMember(member.member_id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                            {member.name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {member.name || member.email.split("@")[0]}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {member.email}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {revealedPhones.has(member.member_id) ? (
                          <span className="font-mono text-xs">
                            {revealedPhones.get(member.member_id)}
                          </span>
                        ) : member.phone_masked ? (
                          <button
                            onClick={() => revealPhone(member.member_id)}
                            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          >
                            <span className="font-mono text-xs">{member.phone_masked}</span>
                            <Eye className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={member.role} />
                        {member.role === "member" && (
                          <span className="text-xs text-muted-foreground">member</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <InviteStatusBadge status={member.invite_status} />
                      </td>
                      <td className="px-4 py-3">
                        <PickStatusBadge status={member.pick_status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatRelativeTime(member.last_submission)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setReceiptViewerMember({
                            id: member.member_id,
                            name: member.name || member.email.split("@")[0],
                          })}
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                          title="View receipts for dispute resolution"
                        >
                          <Receipt className="w-3 h-3" />
                          {member.receipt_count_period}/{member.receipt_count_season}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={member.payment_status} />
                      </td>
                      <td className="px-4 py-3">
                        {member.eligibility_status === "eligible" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatRelativeTime(member.last_active)}
                      </td>
                      <td className="px-4 py-3">
                        {member.flags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {member.flags.includes("unpaid") && (
                              <span title="Unpaid">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              </span>
                            )}
                            {member.flags.includes("missing_picks") && (
                              <span title="Missing picks">
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                              </span>
                            )}
                            {member.flags.includes("pending_invite") && (
                              <span title="Pending invite">
                                <Clock className="w-3.5 h-3.5 text-blue-500" />
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setSelectedMemberDetail(member.member_id)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Member
                            </DropdownMenuItem>
                            {member.invite_status === "invited" && (
                              <DropdownMenuItem>
                                <Mail className="w-4 h-4 mr-2" />
                                Resend Invite
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem>
                              <Bell className="w-4 h-4 mr-2" />
                              Send Reminder
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {member.role !== "owner" && (
                              <>
                                <DropdownMenuItem>
                                  <UserCog className="w-4 h-4 mr-2" />
                                  {member.role === "admin" ? "Demote to Member" : "Promote to Manager"}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onClick={() => setReceiptViewerMember({
                                id: member.member_id,
                                name: member.name || member.email.split("@")[0],
                              })}>
                              <Receipt className="w-4 h-4 mr-2" />
                              View Receipts
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Activity className="w-4 h-4 mr-2" />
                              View Activity
                            </DropdownMenuItem>
                            {member.role !== "owner" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-500">
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Remove Member
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {(pagination.page - 1) * pagination.per_page + 1}-
                  {Math.min(pagination.page * pagination.per_page, pagination.total_count)} of{" "}
                  {pagination.total_count}
                </span>
                <select
                  value={pagination.per_page}
                  onChange={(e) =>
                    setPagination((prev) => ({ ...prev, per_page: Number(e.target.value), page: 1 }))
                  }
                  className="bg-secondary rounded px-2 py-1 text-xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.total_pages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals would go here - will be added in next tasks */}
      {showInviteModal && leagueId && (
        <InviteMembersModal
          leagueId={leagueId}
          poolName={pool?.name || "Pool"}
          inviteCode={pool?.invite_code}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => fetchMembers()}
        />
      )}

      {showReminderModal && leagueId && (
        <SendReminderModal
          leagueId={leagueId}
          poolName={pool?.name || "Pool"}
          selectedMemberIds={[...selectedMembers]}
          stats={stats || undefined}
          onClose={() => setShowReminderModal(false)}
          onSuccess={() => {
            fetchMembers();
            setSelectedMembers(new Set());
          }}
        />
      )}

      {selectedMemberDetail && leagueId && (
        <MemberDetailDrawer
          memberId={selectedMemberDetail}
          leagueId={leagueId}
          onClose={() => setSelectedMemberDetail(null)}
          onNotesSaved={() => fetchMembers()}
        />
      )}

      {receiptViewerMember && leagueId && (
        <AdminReceiptViewer
          leagueId={leagueId}
          memberId={receiptViewerMember.id}
          memberName={receiptViewerMember.name}
          onClose={() => setReceiptViewerMember(null)}
        />
      )}
    </div>
  );
}
