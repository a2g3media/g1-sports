import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  X,
  Receipt,
  Shield,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  Clock,
  Loader2,
  Copy,
  Check,
  FileText,
  ExternalLink,
  AlertTriangle,
  Hash,
  Target,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

interface ReceiptPick {
  event_id: number;
  pick_value: string | null;
  confidence_rank?: number;
  event?: {
    matchup: string;
    start_at: string;
    status: string;
    winner?: string;
    score?: string | null;
  } | null;
}

interface ReceiptDetail {
  id: number;
  receipt_code: string;
  pool_id: number;
  pool_name: string;
  sport: string;
  period_id: string;
  format_key: string;
  submitted_at: string;
  submitted_at_formatted: string;
  status: string;
  payload_hash: string;
  replaced_by?: {
    receipt_code: string;
    status: string;
    submitted_at: string;
  } | null;
}

interface AdminReceiptViewerProps {
  leagueId: string;
  memberId: number;
  memberName: string;
  onClose: () => void;
}

interface ReceiptSummary {
  id: number;
  receipt_code: string;
  period_id: string;
  submitted_at: string;
  status: string;
  pick_count: number;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
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
  return formatDateTime(dateStr);
}

function ReceiptCard({
  receipt,
  isExpanded,
  onToggle,
}: {
  receipt: ReceiptSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [detail, setDetail] = useState<{
    receipt: ReceiptDetail;
    picks: ReceiptPick[];
    tiebreaker: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    if (isExpanded && !detail) {
      fetchDetail();
    }
  }, [isExpanded]);

  const fetchDetail = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/receipts/${receipt.receipt_code}`);
      if (response.ok) {
        const data = await response.json();
        setDetail(data);
      }
    } catch (err) {
      console.error("Failed to fetch receipt detail:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyHash = () => {
    if (detail?.receipt.payload_hash) {
      navigator.clipboard.writeText(detail.receipt.payload_hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "submitted":
        return <Badge className="bg-[hsl(var(--success))] text-white text-[10px]">Active</Badge>;
      case "replaced":
        return <Badge variant="secondary" className="text-[10px]">Replaced</Badge>;
      case "voided":
        return <Badge variant="destructive" className="text-[10px]">Voided</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const getPickResult = (pick: ReceiptPick) => {
    if (!pick.event || pick.event.status !== "final") return null;
    if (!pick.pick_value || !pick.event.winner) return null;
    const isCorrect = pick.pick_value.toLowerCase() === pick.event.winner.toLowerCase();
    return isCorrect ? "correct" : "incorrect";
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            receipt.status === "active" || receipt.status === "submitted"
              ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
              : receipt.status === "replaced"
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/10 text-destructive"
          )}>
            <Receipt className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm font-medium">{receipt.receipt_code}</code>
              {getStatusBadge(receipt.status)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {receipt.period_id} · {receipt.pick_count} picks · {formatRelativeTime(receipt.submitted_at)}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t bg-muted/20">
          {isLoading ? (
            <div className="p-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="p-4 space-y-4">
              {/* Superseded Notice */}
              {detail.receipt.status === "replaced" && detail.receipt.replaced_by && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Superseded by newer submission
                    </p>
                    <code className="text-xs font-mono text-amber-600">
                      {detail.receipt.replaced_by.receipt_code}
                    </code>
                  </div>
                </div>
              )}

              {/* Submission Time */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Submitted: {detail.receipt.submitted_at_formatted}</span>
              </div>

              {/* Picks */}
              {detail.picks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Target className="h-3 w-3" />
                    Picks ({detail.picks.length})
                  </h4>
                  <div className="space-y-1.5">
                    {detail.picks.map((pick, idx) => {
                      const result = getPickResult(pick);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-lg border bg-background/50",
                            result === "correct" && "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5",
                            result === "incorrect" && "border-destructive/30 bg-destructive/5"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {pick.confidence_rank && (
                              <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                {pick.confidence_rank}
                              </div>
                            )}
                            <div className="min-w-0">
                              {pick.pick_value ? (
                                <TeamBadge teamName={pick.pick_value} size="sm" emphasis="selected" />
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Pick data unavailable</span>
                              )}
                              {pick.event && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                  {pick.event.matchup}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            {pick.event?.status === "final" && pick.event?.score && (
                              <p className="text-[10px] font-mono tabular-nums text-muted-foreground">
                                {pick.event.score}
                              </p>
                            )}
                            {result && (
                              <Badge
                                variant={result === "correct" ? "default" : "destructive"}
                                className={cn(
                                  "text-[9px] px-1.5 py-0",
                                  result === "correct" && "bg-[hsl(var(--success))]"
                                )}
                              >
                                {result === "correct" ? "Won" : "Lost"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {detail.tiebreaker !== null && (
                    <div className="flex items-center justify-between p-2 rounded-lg border bg-background/50 text-xs">
                      <span className="text-muted-foreground">Tiebreaker</span>
                      <span className="font-bold tabular-nums">{detail.tiebreaker}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Cryptographic Hash */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Hash className="h-3 w-3" />
                  Cryptographic Proof
                </h4>
                <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                      SHA-256 Hash
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800"
                      onClick={copyHash}
                    >
                      {copiedHash ? <Check className="h-2.5 w-2.5 mr-1" /> : <Copy className="h-2.5 w-2.5 mr-1" />}
                      {copiedHash ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <code className="text-[10px] font-mono text-emerald-400 break-all leading-relaxed block">
                    {detail.receipt.payload_hash}
                  </code>
                </div>
              </div>

              {/* View Full Receipt */}
              <div className="pt-2 border-t">
                <Link
                  to={`/receipts/${receipt.receipt_code}`}
                  target="_blank"
                  className="flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Full Receipt Document
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <AlertTriangle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Failed to load receipt details</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminReceiptViewer({
  leagueId,
  memberId,
  memberName,
  onClose,
}: AdminReceiptViewerProps) {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);

  useEffect(() => {
    fetchReceipts();
  }, [leagueId, memberId]);

  const fetchReceipts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/pool-admin/${leagueId}/members/${memberId}/receipts`);
      if (!response.ok) {
        if (response.status === 403) {
          setError("You don't have permission to view these receipts");
        } else {
          setError("Failed to load receipts");
        }
        return;
      }
      const data = await response.json();
      setReceipts(data.receipts || []);
      // Auto-expand the first (most recent) receipt
      if (data.receipts?.length > 0) {
        setExpandedReceipt(data.receipts[0].receipt_code);
      }
    } catch (err) {
      setError("Failed to load receipts");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleReceipt = (code: string) => {
    setExpandedReceipt(expandedReceipt === code ? null : code);
  };

  // Group receipts by period
  const receiptsByPeriod: Record<string, ReceiptSummary[]> = {};
  for (const receipt of receipts) {
    if (!receiptsByPeriod[receipt.period_id]) {
      receiptsByPeriod[receipt.period_id] = [];
    }
    receiptsByPeriod[receipt.period_id].push(receipt);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Drawer */}
      <div
        className="relative w-full max-w-lg h-full bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Pick Receipts</h2>
              <p className="text-xs text-muted-foreground">
                {memberName} • Admin View
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Admin Notice */}
        <div className="px-4 py-3 bg-amber-500/5 border-b flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Read-only admin access for dispute resolution
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No receipts found</p>
              <p className="text-xs text-muted-foreground mt-1">
                This member hasn't submitted any picks yet
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(receiptsByPeriod).map(([period, periodReceipts]) => (
                <div key={period}>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {period}
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {periodReceipts.length} receipt{periodReceipts.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {periodReceipts.map((receipt) => (
                      <ReceiptCard
                        key={receipt.id}
                        receipt={receipt}
                        isExpanded={expandedReceipt === receipt.receipt_code}
                        onToggle={() => toggleReceipt(receipt.receipt_code)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>All receipts are cryptographically verified</span>
            </div>
            <span className="font-mono">{receipts.length} total</span>
          </div>
        </div>
      </div>
    </div>
  );
}
