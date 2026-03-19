import { useState, useMemo } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Download,
  Mail,
  MoreHorizontal,
  AlertTriangle,
  TrendingUp,
  Users,

} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Badge } from "@/react-app/components/ui/badge";
import { Checkbox } from "@/react-app/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { formatDistanceToNow, format } from "date-fns";

interface Payment {
  member_id: number;
  user_id: string;
  pool_id: number;
  pool_name: string;
  sport_key: string;
  entry_fee_cents: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  is_paid: boolean;
  paid_at: string | null;
  joined_at: string | null;
}

interface PaymentsSummary {
  total: number;
  paid: number;
  unpaid: number;
  collected_cents: number;
  outstanding_cents: number;
}

interface Pool {
  id: number;
  name: string;
  sport_key: string;
  entry_fee_cents: number;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variants = {
    default: "bg-slate-800/50 border-slate-700",
    success: "bg-emerald-900/30 border-emerald-700/50",
    warning: "bg-amber-900/30 border-amber-700/50",
    danger: "bg-red-900/30 border-red-700/50",
  };

  const iconVariants = {
    default: "text-slate-400",
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-red-400",
  };

  return (
    <div className={`rounded-xl border p-4 ${variants[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-lg bg-slate-800/50 ${iconVariants[variant]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function PaymentRow({
  payment,
  isSelected,
  onSelect,
  onUpdatePayment,
  showPoolName = false,
}: {
  payment: Payment;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onUpdatePayment: (memberId: number, poolId: number, isPaid: boolean) => void;
  showPoolName?: boolean;
}) {
  const initials = payment.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          className="border-slate-600"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {payment.avatar_url ? (
            <img
              src={payment.avatar_url}
              alt={payment.display_name}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-sm font-medium">
              {initials}
            </div>
          )}
          <div>
            <p className="font-medium text-white">{payment.display_name}</p>
            <p className="text-xs text-slate-400">{payment.email}</p>
          </div>
        </div>
      </td>
      {showPoolName && (
        <td className="px-4 py-3">
          <div>
            <p className="text-white">{payment.pool_name}</p>
            <p className="text-xs text-slate-400 uppercase">{payment.sport_key}</p>
          </div>
        </td>
      )}
      <td className="px-4 py-3">
        <span className="text-white font-medium">
          {formatCurrency(payment.entry_fee_cents)}
        </span>
      </td>
      <td className="px-4 py-3">
        {payment.is_paid ? (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Paid
          </Badge>
        ) : (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Unpaid
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm">
        {payment.is_paid && payment.paid_at
          ? format(new Date(payment.paid_at), "MMM d, yyyy")
          : payment.joined_at
          ? `Joined ${formatDistanceToNow(new Date(payment.joined_at), { addSuffix: true })}`
          : "—"}
      </td>
      <td className="px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700">
            {payment.is_paid ? (
              <DropdownMenuItem
                onClick={() => onUpdatePayment(payment.member_id, payment.pool_id, false)}
                className="text-amber-400 hover:bg-slate-800"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Mark Unpaid
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => onUpdatePayment(payment.member_id, payment.pool_id, true)}
                className="text-emerald-400 hover:bg-slate-800"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Paid
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem className="text-slate-300 hover:bg-slate-800">
              <Mail className="h-4 w-4 mr-2" />
              Send Reminder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

export default function PoolAdminPayments() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [selectedPool, setSelectedPool] = useState<string>("all");
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());

  // Fetch payments data
  const { data, isLoading, error } = useQuery({
    queryKey: ["pool-admin-payments", statusFilter, selectedPool, isDemoMode],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (selectedPool !== "all") params.set("pool_id", selectedPool);

      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/payments?${params.toString()}`, { headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payments");
      return res.json() as Promise<{
        payments: Payment[];
        summary: PaymentsSummary;
      }>;
    },
  });

  // Fetch pools for filter dropdown
  const { data: poolsData } = useQuery({
    queryKey: ["pool-admin-my-pools", isDemoMode],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch("/api/pool-admin/my-pools", { headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pools");
      const data = await res.json();
      return data.pools as Pool[];
    },
  });

  // Update payment mutation
  const updatePaymentMutation = useMutation({
    mutationFn: async ({
      memberId,
      poolId,
      isPaid,
    }: {
      memberId: number;
      poolId: number;
      isPaid: boolean;
    }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${poolId}/members/${memberId}/payment`, {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({ is_paid: isPaid }),
      });
      if (!res.ok) throw new Error("Failed to update payment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-payments"] });
      setSelectedMembers(new Set());
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ memberIds, poolId, isPaid }: { memberIds: number[]; poolId: number; isPaid: boolean }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      const res = await fetch(`/api/pool-admin/${poolId}/payments/bulk`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ member_ids: memberIds, is_paid: isPaid }),
      });
      if (!res.ok) throw new Error("Failed to update payments");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool-admin-payments"] });
      setSelectedMembers(new Set());
    },
  });

  // Filter payments
  const filteredPayments = useMemo(() => {
    if (!data?.payments) return [];

    return data.payments.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.pool_name.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [data?.payments, searchQuery]);

  // Get unique pools from payments for bulk actions
  const selectedPayments = filteredPayments.filter((p) => selectedMembers.has(p.member_id));
  const selectedPoolIds = [...new Set(selectedPayments.map((p) => p.pool_id))];
  const canBulkUpdate = selectedPoolIds.length === 1; // Can only bulk update within same pool

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMembers(new Set(filteredPayments.map((p) => p.member_id)));
    } else {
      setSelectedMembers(new Set());
    }
  };

  const handleBulkMarkPaid = () => {
    if (!canBulkUpdate) return;
    const poolId = selectedPoolIds[0];
    const memberIds = selectedPayments.map((p) => p.member_id);
    bulkUpdateMutation.mutate({ memberIds, poolId, isPaid: true });
  };

  const handleBulkMarkUnpaid = () => {
    if (!canBulkUpdate) return;
    const poolId = selectedPoolIds[0];
    const memberIds = selectedPayments.map((p) => p.member_id);
    bulkUpdateMutation.mutate({ memberIds, poolId, isPaid: false });
  };

  const exportToCSV = () => {
    if (!filteredPayments.length) return;

    const headers = ["Name", "Email", "Pool", "Sport", "Entry Fee", "Status", "Paid Date", "Joined Date"];
    const rows = filteredPayments.map((p) => [
      p.display_name,
      p.email,
      p.pool_name,
      p.sport_key.toUpperCase(),
      formatCurrency(p.entry_fee_cents),
      p.is_paid ? "Paid" : "Unpaid",
      p.paid_at ? format(new Date(p.paid_at), "yyyy-MM-dd") : "",
      p.joined_at ? format(new Date(p.joined_at), "yyyy-MM-dd") : "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 bg-slate-800" />
          ))}
        </div>
        <Skeleton className="h-96 bg-slate-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-900/20 border border-red-700/50 p-6 text-center">
        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Payments</h3>
        <p className="text-slate-400">Please try refreshing the page</p>
      </div>
    );
  }

  const summary = data?.summary || { total: 0, paid: 0, unpaid: 0, collected_cents: 0, outstanding_cents: 0 };
  const paidPools = poolsData?.filter((p) => p.entry_fee_cents > 0) || [];

  if (paidPools.length === 0) {
    return (
      <EmptyState
        icon={DollarSign}
        title="No Paid Pools"
        description="You don't have any pools with entry fees yet. Create a pool with an entry fee to start tracking payments."
        primaryAction={{
          label: "Create Pool",
          href: "/pools/create",
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-slate-400 mt-1">Track and manage entry fee payments across your pools</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportToCSV}
          className="border-slate-600 text-slate-300"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Members"
          value={summary.total}
          subValue={`Across ${paidPools.length} pool${paidPools.length !== 1 ? "s" : ""}`}
          icon={Users}
        />
        <StatCard
          label="Paid"
          value={summary.paid}
          subValue={`${summary.total > 0 ? Math.round((summary.paid / summary.total) * 100) : 0}% collection rate`}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          label="Unpaid"
          value={summary.unpaid}
          subValue={summary.unpaid > 0 ? "Needs attention" : "All caught up!"}
          icon={summary.unpaid > 0 ? AlertTriangle : CheckCircle2}
          variant={summary.unpaid > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Collected"
          value={formatCurrency(summary.collected_cents)}
          subValue={`${formatCurrency(summary.outstanding_cents)} outstanding`}
          icon={TrendingUp}
          variant={summary.outstanding_cents > 0 ? "warning" : "success"}
        />
      </div>

      {/* Outstanding Alert */}
      {summary.unpaid > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-center gap-4">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-amber-200">
              {summary.unpaid} member{summary.unpaid !== 1 ? "s" : ""} still need to pay
            </p>
            <p className="text-sm text-amber-300/70">
              {formatCurrency(summary.outstanding_cents)} in outstanding entry fees
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-600 text-amber-300 hover:bg-amber-900/30"
            onClick={() => setStatusFilter("unpaid")}
          >
            View Unpaid
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, or pool..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-800 border-slate-700 text-white"
          />
        </div>
        <Select value={selectedPool} onValueChange={setSelectedPool}>
          <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="All Pools" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all">All Pools</SelectItem>
            {paidPools.map((pool) => (
              <SelectItem key={pool.id} value={String(pool.id)}>
                {pool.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "paid" | "unpaid")}>
          <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 text-white">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid Only</SelectItem>
            <SelectItem value="unpaid">Unpaid Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selectedMembers.size > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 flex items-center gap-4">
          <span className="text-sm text-slate-300">
            {selectedMembers.size} selected
          </span>
          {canBulkUpdate ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkMarkPaid}
                disabled={bulkUpdateMutation.isPending}
                className="border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Mark Paid
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkMarkUnpaid}
                disabled={bulkUpdateMutation.isPending}
                className="border-amber-600 text-amber-400 hover:bg-amber-900/30"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Mark Unpaid
              </Button>
            </>
          ) : (
            <span className="text-xs text-slate-500">
              Select members from one pool to use bulk actions
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedMembers(new Set())}
            className="ml-auto text-slate-400"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Payments Table */}
      {filteredPayments.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="No Payments Found"
          description={
            searchQuery
              ? "No members match your search criteria"
              : statusFilter === "unpaid"
              ? "All members have paid their entry fees!"
              : "No payment records found"
          }
        />
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="px-4 py-3 text-left">
                    <Checkbox
                      checked={
                        filteredPayments.length > 0 &&
                        selectedMembers.size === filteredPayments.length
                      }
                      onCheckedChange={handleSelectAll}
                      className="border-slate-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Member
                  </th>
                  {selectedPool === "all" && (
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                      Pool
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Entry Fee
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <PaymentRow
                    key={`${payment.pool_id}-${payment.member_id}`}
                    payment={payment}
                    isSelected={selectedMembers.has(payment.member_id)}
                    onSelect={(checked) => {
                      const next = new Set(selectedMembers);
                      if (checked) {
                        next.add(payment.member_id);
                      } else {
                        next.delete(payment.member_id);
                      }
                      setSelectedMembers(next);
                    }}
                    onUpdatePayment={(memberId, poolId, isPaid) =>
                      updatePaymentMutation.mutate({ memberId, poolId, isPaid })
                    }
                    showPoolName={selectedPool === "all"}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
