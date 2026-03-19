import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/react-app/components/admin/AdminStatCard";
import { AdminStatusBadge } from "@/react-app/components/admin/AdminStatusBadge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  User,
  Activity,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface Transaction {
  id: number;
  league_id: number;
  user_id: string;
  provider: string;
  provider_txn_id: string | null;
  intent_type: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  status: string;
  webhook_payload_hash: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  user_email: string | null;
  user_name: string | null;
  pool_name: string | null;
}

interface LedgerSummary {
  totalCollectedCents: number;
  totalPendingCents: number;
  totalFailedCents: number;
  totalCount: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

const INTENT_LABELS: Record<string, string> = {
  entry_fee: "Entry Fee",
  refund: "Refund",
  payout: "Payout",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

function formatCurrency(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}



export function AdminLedger() {
  const { isDemoMode } = useDemoAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Filters
  const [status, setStatus] = useState<string>("");
  const [poolId, setPoolId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const hasActiveFilters = status || poolId || startDate || endDate;

  const fetchTransactions = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "30",
      });

      if (status) params.append("status", status);
      if (poolId) params.append("pool_id", poolId);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);

      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const response = await fetch(`/api/admin/ledger?${params}`, {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const result = await response.json();
        setTransactions(result.transactions);
        setSummary(result.summary);
        setHasMore(result.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch ledger:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, status, poolId, startDate, endDate, isDemoMode]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const clearFilters = () => {
    setStatus("");
    setPoolId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Payments & Ledger"
        description="Transaction history and payment management"
        actions={
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8"
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {[status, poolId, startDate, endDate].filter(Boolean).length}
              </span>
            )}
          </Button>
        }
      />

      <div className="p-6">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <AdminStatCard
              label="Total Collected"
              value={formatCurrency(summary.totalCollectedCents)}
              icon={DollarSign}
            />
            <AdminStatCard
              label="Pending"
              value={formatCurrency(summary.totalPendingCents)}
              icon={Clock}
              className={summary.totalPendingCents > 0 ? "border-amber-500/30" : ""}
            />
            <AdminStatCard
              label="Failed"
              value={formatCurrency(summary.totalFailedCents)}
              icon={AlertTriangle}
              className={summary.totalFailedCents > 0 ? "border-red-500/30" : ""}
            />
            <AdminStatCard
              label="Net Revenue"
              value={formatCurrency(summary.totalCollectedCents - summary.totalFailedCents)}
              icon={TrendingUp}
            />
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-6 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">Filter Transactions</h3>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Pool ID</Label>
                <Input
                  type="text"
                  className="h-9"
                  placeholder="Filter by pool..."
                  value={poolId}
                  onChange={(e) => { setPoolId(e.target.value); setPage(1); }}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pool
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading transactions...</span>
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <p className="text-center text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? "No transactions match your filters."
                        : "No transactions recorded yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedTransaction(txn)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-muted-foreground">
                        #{txn.id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium truncate max-w-[150px]">
                          {txn.user_name || txn.user_email || `User ${txn.user_id}`}
                        </p>
                        {txn.user_email && txn.user_name && (
                          <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {txn.user_email}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm truncate max-w-[120px]">
                        {txn.pool_name || `Pool #${txn.league_id}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">
                        {INTENT_LABELS[txn.intent_type] || txn.intent_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "text-sm font-medium tabular-nums",
                        txn.intent_type === "refund" && "text-amber-500"
                      )}>
                        {txn.intent_type === "refund" ? "-" : ""}
                        {formatCurrency(txn.amount_cents, txn.currency)}
                      </span>
                      {txn.fee_cents > 0 && (
                        <p className="text-xs text-muted-foreground">
                          +{formatCurrency(txn.fee_cents)} fee
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge status={txn.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm capitalize">{txn.provider}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(txn.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {transactions.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
                className="h-8"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Detail Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Transaction #{selectedTransaction?.id}
              <AdminStatusBadge status={selectedTransaction?.status || ""} />
            </DialogTitle>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-6 py-4">
              {/* Amount Section */}
              <div className="text-center p-4 bg-secondary/30 rounded-lg">
                <p className="text-3xl font-bold tabular-nums">
                  {selectedTransaction.intent_type === "refund" ? "-" : ""}
                  {formatCurrency(selectedTransaction.amount_cents, selectedTransaction.currency)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {INTENT_LABELS[selectedTransaction.intent_type] || selectedTransaction.intent_type}
                </p>
                {selectedTransaction.fee_cents > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Processing fee: {formatCurrency(selectedTransaction.fee_cents)}
                  </p>
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">User</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {selectedTransaction.user_name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedTransaction.user_email}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pool</p>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {selectedTransaction.pool_name || `Pool #${selectedTransaction.league_id}`}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="text-sm font-medium capitalize">
                    {selectedTransaction.provider}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Currency</p>
                  <p className="text-sm font-medium">
                    {selectedTransaction.currency}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">
                    {formatDateTime(selectedTransaction.created_at)}
                  </p>
                </div>

                {selectedTransaction.completed_at && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-sm">
                      {formatDateTime(selectedTransaction.completed_at)}
                    </p>
                  </div>
                )}
              </div>

              {/* Provider Reference */}
              {selectedTransaction.provider_txn_id && (
                <div className="p-3 bg-secondary/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Provider Transaction ID</p>
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-mono">
                      {selectedTransaction.provider_txn_id}
                    </code>
                    <Button variant="ghost" size="sm" className="h-7">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View in {selectedTransaction.provider}
                    </Button>
                  </div>
                </div>
              )}

              {/* Webhook Hash */}
              {selectedTransaction.webhook_payload_hash && (
                <div className="p-3 bg-secondary/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Webhook Payload Hash</p>
                  <code className="text-xs font-mono break-all text-muted-foreground">
                    {selectedTransaction.webhook_payload_hash}
                  </code>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
