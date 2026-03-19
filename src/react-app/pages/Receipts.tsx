import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/react-app/components/ui/collapsible";
import { 
  FileCheck, ShieldCheck, Loader2, Mail, MessageSquare, 
  ExternalLink, FileText, Award, ChevronDown, ChevronRight,
  Calendar, FolderOpen, Trophy
} from "lucide-react";
import { getSport } from "@/react-app/data/sports";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

import { cn } from "@/react-app/lib/utils";

interface Receipt {
  id: number;
  receipt_code: string;
  pool_id: number;
  pool_name: string;
  sport_key: string;
  format_key: string;
  period_id: string;
  submitted_at: string;
  submitted_at_formatted?: string;
  payload_hash: string;
  status: string;
  pick_count: number;
  deliveries: Delivery[];
}

interface Delivery {
  id: number;
  channel: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
}

interface PoolGroup {
  pool_id: number;
  pool_name: string;
  periods: Record<string, Receipt[]>;
}

type ViewMode = "pool" | "date";
type StatusFilter = "all" | "active" | "replaced";

export function Receipts() {
  const navigate = useNavigate();
  const { user, isDemoMode } = useDemoAuth();
  const authDisabled = isDemoMode || !user?.id;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [grouped, setGrouped] = useState<PoolGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("pool");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedPools, setExpandedPools] = useState<Set<number>>(new Set());
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authDisabled) {
      setIsLoading(false);
      return;
    }
    fetchReceipts();
  }, [authDisabled]);

  // Auto-expand first pool when data loads
  useEffect(() => {
    if (grouped.length > 0 && expandedPools.size === 0) {
      const firstPoolId = grouped[0].pool_id;
      setExpandedPools(new Set([firstPoolId]));
      // Also expand first period of first pool
      const firstPeriod = Object.keys(grouped[0].periods)[0];
      if (firstPeriod) {
        setExpandedPeriods(new Set([`${firstPoolId}-${firstPeriod}`]));
      }
    }
  }, [grouped]);

  const fetchReceipts = async () => {
    try {
      const response = await fetch("/api/receipts");
      if (response.ok) {
        const data = await response.json();
        setReceipts(data.receipts || []);
        setGrouped(data.grouped || []);
      }
    } catch (error) {
      console.error("Failed to fetch receipts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePool = (poolId: number) => {
    const newExpanded = new Set(expandedPools);
    if (newExpanded.has(poolId)) {
      newExpanded.delete(poolId);
    } else {
      newExpanded.add(poolId);
    }
    setExpandedPools(newExpanded);
  };

  const togglePeriod = (poolId: number, periodId: string) => {
    const key = `${poolId}-${periodId}`;
    const newExpanded = new Set(expandedPeriods);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedPeriods(newExpanded);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getSportIconComponent = (sportKey: string) => {
    const sport = getSport(sportKey);
    return sport?.icon || null;
  };

  const getDeliveryIcon = (channel: string) => {
    return channel === "email" ? Mail : MessageSquare;
  };

  const getDeliveryStatus = (delivery: Delivery) => {
    if (delivery.delivered_at) return { color: "text-[hsl(var(--success))]" };
    if (delivery.failed_at) return { color: "text-destructive" };
    return { color: "text-muted-foreground" };
  };

  const getReceiptStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "submitted":
        return <Badge className="bg-[hsl(var(--success))] text-white text-[10px] px-1.5">Active</Badge>;
      case "replaced":
        return <Badge variant="secondary" className="text-[10px] px-1.5">Replaced</Badge>;
      default:
        return null;
    }
  };

  const filterReceipts = (receiptList: Receipt[]) => {
    if (statusFilter === "all") return receiptList;
    if (statusFilter === "active") return receiptList.filter(r => r.status === "active" || r.status === "submitted");
    return receiptList.filter(r => r.status === "replaced");
  };

  // Group by date for date view
  const groupedByDate = receipts.reduce((groups, receipt) => {
    const date = new Date(receipt.submitted_at).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(receipt);
    return groups;
  }, {} as Record<string, Receipt[]>);

  const totalActive = receipts.filter(r => r.status === "active" || r.status === "submitted").length;
  const totalReplaced = receipts.filter(r => r.status === "replaced").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-sm">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Receipts</h1>
            <p className="text-muted-foreground text-sm">
              Cryptographically verified pick submissions
            </p>
          </div>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30">
            <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
            <span className="text-sm font-medium text-[hsl(var(--success))]">{totalActive} active</span>
          </div>
          {totalReplaced > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border">
              <span className="text-sm font-medium text-muted-foreground">{totalReplaced} replaced</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View Mode Toggle */}
        <div className="flex items-center bg-muted rounded-lg p-1">
          <button
            onClick={() => setViewMode("pool")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              viewMode === "pool" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FolderOpen className="h-4 w-4" />
            By Pool
          </button>
          <button
            onClick={() => setViewMode("date")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              viewMode === "date" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="h-4 w-4" />
            By Date
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-muted rounded-lg p-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              statusFilter === "all" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter("active")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              statusFilter === "active" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter("replaced")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              statusFilter === "replaced" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Replaced
          </button>
        </div>
      </div>

      {/* Empty State */}
      {receipts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16">
            <div className="text-center max-w-md mx-auto">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mx-auto mb-6 border">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No receipts yet</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                {authDisabled
                  ? "Receipts are available after sign-in. Once you submit picks in a pool, receipts appear here automatically."
                  : "When you submit picks in a pool, you'll receive an immutable receipt with a cryptographic hash proving when and what you submitted."}
              </p>
              <Link to={authDisabled ? "/login" : "/pools"}>
                <Button>
                  <Trophy className="h-4 w-4 mr-2" />
                  {authDisabled ? "Sign In" : "Browse Pools"}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "pool" ? (
        /* Pool/Period Grouped View */
        <div className="space-y-4">
          {grouped.map((poolGroup) => {
            const isPoolExpanded = expandedPools.has(poolGroup.pool_id);
            const allPeriodReceipts = Object.values(poolGroup.periods).flat();
            const filteredReceipts = filterReceipts(allPeriodReceipts);
            const activeCount = allPeriodReceipts.filter(r => r.status === "active" || r.status === "submitted").length;
            const periodKeys = Object.keys(poolGroup.periods);
            
            if (filteredReceipts.length === 0 && statusFilter !== "all") return null;

            return (
              <Card key={poolGroup.pool_id} className="overflow-hidden">
                {/* Pool Header */}
                <Collapsible open={isPoolExpanded} onOpenChange={() => togglePool(poolGroup.pool_id)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border flex items-center justify-center">
                        {(() => {
                          const SportIcon = getSportIconComponent(allPeriodReceipts[0]?.sport_key || "nfl");
                          return SportIcon ? <SportIcon className="h-5 w-5 text-primary" /> : <Trophy className="h-5 w-5 text-primary" />;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{poolGroup.pool_name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {periodKeys.length} period{periodKeys.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {allPeriodReceipts.length} receipt{allPeriodReceipts.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-[hsl(var(--success))]/5 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
                        {activeCount} active
                      </Badge>
                      {isPoolExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t">
                      {periodKeys.map((periodId) => {
                        const periodReceipts = filterReceipts(poolGroup.periods[periodId]);
                        if (periodReceipts.length === 0) return null;

                        const periodKey = `${poolGroup.pool_id}-${periodId}`;
                        const isPeriodExpanded = expandedPeriods.has(periodKey);
                        
                        return (
                          <Collapsible 
                            key={periodId} 
                            open={isPeriodExpanded} 
                            onOpenChange={() => togglePeriod(poolGroup.pool_id, periodId)}
                          >
                            <CollapsibleTrigger asChild>
                              <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left border-b last:border-b-0">
                                <div className="w-10 flex justify-center">
                                  {isPeriodExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <span className="font-medium text-sm">{periodId}</span>
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  {periodReceipts.length} receipt{periodReceipts.length !== 1 ? "s" : ""}
                                </Badge>
                              </button>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="bg-muted/20">
                                {periodReceipts.map((receipt, index) => (
                                  <ReceiptRow 
                                    key={receipt.id} 
                                    receipt={receipt} 
                                    index={index}
                                    navigate={navigate}
                                    formatTime={formatTime}
                                    formatDate={formatDate}
                                    getReceiptStatusBadge={getReceiptStatusBadge}
                                    getDeliveryIcon={getDeliveryIcon}
                                    getDeliveryStatus={getDeliveryStatus}
                                    compact
                                  />
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Date Grouped View */
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([date, dateReceipts]) => {
            const filteredReceipts = filterReceipts(dateReceipts);
            if (filteredReceipts.length === 0) return null;

            return (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    {date}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                
                <div className="space-y-2">
                  {filteredReceipts.map((receipt, index) => (
                    <ReceiptRow 
                      key={receipt.id} 
                      receipt={receipt} 
                      index={index}
                      navigate={navigate}
                      formatTime={formatTime}
                      formatDate={formatDate}
                      getReceiptStatusBadge={getReceiptStatusBadge}
                      getDeliveryIcon={getDeliveryIcon}
                      getDeliveryStatus={getDeliveryStatus}
                      showPool
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ReceiptRowProps {
  receipt: Receipt;
  index: number;
  navigate: (path: string) => void;
  formatTime: (date: string) => string;
  formatDate: (date: string) => string;
  getReceiptStatusBadge: (status: string) => React.ReactNode;
  getDeliveryIcon: (channel: string) => React.FC<{ className?: string }>;
  getDeliveryStatus: (delivery: Delivery) => { color: string };
  compact?: boolean;
  showPool?: boolean;
}

function ReceiptRow({ 
  receipt, 
  index, 
  navigate, 
  formatTime,
  formatDate,
  getReceiptStatusBadge, 
  getDeliveryIcon, 
  getDeliveryStatus,
  compact,
  showPool,
}: ReceiptRowProps) {
  return (
    <div
      className={cn(
        "group cursor-pointer transition-all duration-200",
        "hover:bg-primary/5 active:scale-[0.995]",
        compact 
          ? "flex items-center gap-4 px-4 py-3 ml-10 border-b last:border-b-0"
          : "flex items-center gap-4 p-4 rounded-lg border bg-gradient-to-r from-background to-muted/20 hover:shadow-sm hover:border-primary/30",
        receipt.status === "replaced" && "opacity-60"
      )}
      style={{ animationDelay: `${index * 30}ms` }}
      onClick={() => navigate(`/receipts/${receipt.receipt_code}`)}
    >
      {/* Document Icon */}
      <div className="relative shrink-0">
        <div className={cn(
          "rounded border-2 border-border bg-background flex flex-col items-center justify-center shadow-sm",
          compact ? "h-10 w-8" : "h-12 w-9"
        )}>
          <FileCheck className={cn("text-muted-foreground", compact ? "h-4 w-4" : "h-5 w-5")} />
        </div>
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center",
          compact ? "h-3.5 w-3.5" : "h-4 w-4",
          (receipt.status === "active" || receipt.status === "submitted") 
            ? "bg-[hsl(var(--success))]" 
            : "bg-muted border"
        )}>
          <ShieldCheck className={cn(
            (receipt.status === "active" || receipt.status === "submitted") ? "text-white" : "text-muted-foreground",
            compact ? "h-2 w-2" : "h-2.5 w-2.5"
          )} />
        </div>
      </div>
      
      {/* Receipt Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className={cn("font-mono font-semibold tracking-wide", compact ? "text-xs" : "text-sm")}>
            {receipt.receipt_code}
          </code>
          {getReceiptStatusBadge(receipt.status)}
        </div>
        {showPool && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {receipt.pool_name} • {receipt.period_id}
          </p>
        )}
        {!showPool && !compact && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {receipt.pick_count} pick{receipt.pick_count !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      
      {/* Timestamp & Delivery */}
      <div className="text-right shrink-0 flex items-center gap-3">
        {receipt.deliveries.length > 0 && (
          <div className="flex items-center gap-1">
            {receipt.deliveries.slice(0, 2).map((d) => {
              const Icon = getDeliveryIcon(d.channel);
              const status = getDeliveryStatus(d);
              return (
                <div
                  key={d.id}
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center bg-muted/50 border",
                    status.color
                  )}
                >
                  <Icon className="h-2.5 w-2.5" />
                </div>
              );
            })}
          </div>
        )}
        <div>
          <p className={cn("font-medium tabular-nums", compact ? "text-xs" : "text-sm")}>
            {formatTime(receipt.submitted_at)}
          </p>
          {!compact && (
            <p className="text-[10px] text-muted-foreground">
              {formatDate(receipt.submitted_at)}
            </p>
          )}
        </div>
      </div>
      
      {/* Expand indicator */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
