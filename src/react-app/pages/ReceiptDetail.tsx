import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Shield, ShieldCheck, ShieldAlert, Copy, Check, Loader2, 
  Mail, MessageSquare, Clock, ArrowLeft, Printer, ChevronRight,
  FileText, Award, Fingerprint, Target, Hash, AlertTriangle, RefreshCw
} from "lucide-react";
import { TeamBadge } from "@/react-app/components/ui/team-badge";

import { cn } from "@/react-app/lib/utils";

interface ReceiptData {
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

interface Pick {
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

interface Delivery {
  id: number;
  channel: string;
  destination: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  error?: string;
}

interface ReceiptDetailResponse {
  receipt: ReceiptData;
  picks: Pick[];
  tiebreaker: number | null;
  deliveries: Delivery[];
  access: {
    is_owner: boolean;
    is_pool_admin: boolean;
  };
}

interface VerificationResult {
  is_valid: boolean;
  stored_hash: string;
  computed_hash: string;
  verified_at: string;
}

export function ReceiptDetail() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<ReceiptDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState<"email" | "sms" | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (code) {
      fetchReceipt();
    }
  }, [code]);

  const fetchReceipt = async () => {
    try {
      const response = await fetch(`/api/receipts/${code}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError("Receipt not found");
        } else if (response.status === 403) {
          setError("You don't have access to view this receipt");
        } else {
          setError("Failed to load receipt");
        }
        return;
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError("Failed to load receipt");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyReceipt = async () => {
    if (!code) return;
    setIsVerifying(true);
    setVerification(null);

    try {
      const response = await fetch(`/api/receipts/${code}/verify`);
      if (response.ok) {
        const result = await response.json();
        setVerification(result);
      }
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setIsVerifying(false);
    }
  };

  const requestDelivery = async (channel: "email" | "sms") => {
    if (!code) return;
    setIsSending(channel);
    setSendSuccess(null);

    try {
      const response = await fetch(`/api/receipts/${code}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });

      if (response.ok) {
        const result = await response.json();
        setSendSuccess(result.message);
        fetchReceipt(); // Refresh deliveries
      } else if (response.status === 429) {
        const result = await response.json();
        setSendSuccess(result.error);
      }
    } catch (err) {
      console.error("Delivery request failed:", err);
    } finally {
      setIsSending(null);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "submitted":
        return <Badge className="bg-[hsl(var(--success))] text-white">Active</Badge>;
      case "replaced":
        return <Badge variant="secondary">Replaced</Badge>;
      case "voided":
        return <Badge variant="destructive">Voided</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDeliveryStatus = (delivery: Delivery) => {
    if (delivery.delivered_at) return { label: "Delivered", className: "text-[hsl(var(--success))]", icon: Check };
    if (delivery.failed_at) return { label: "Failed", className: "text-destructive", icon: AlertTriangle };
    if (delivery.sent_at) return { label: "Sent", className: "text-muted-foreground", icon: Clock };
    return { label: "Pending", className: "text-muted-foreground", icon: Clock };
  };

  const getPickResult = (pick: Pick) => {
    if (!pick.event || pick.event.status !== "final") return null;
    if (!pick.pick_value || !pick.event.winner) return null;
    
    const isCorrect = pick.pick_value.toLowerCase() === pick.event.winner.toLowerCase();
    return isCorrect ? "correct" : "incorrect";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold mb-2">{error || "Receipt not found"}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This receipt may have been removed or you may not have permission to view it.
            </p>
            <Link to="/me/receipts">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Receipts
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { receipt, picks, tiebreaker, deliveries, access } = data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Minimal Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link 
            to="/me/receipts" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>My Receipts</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => window.print()} className="text-muted-foreground">
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Document Container */}
      <div className="max-w-2xl mx-auto p-4 py-8 print:p-0">
        <div className="bg-background rounded-xl border shadow-sm overflow-hidden print:shadow-none print:border-0">
          {/* Watermark */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden print:hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.015]">
              <Shield className="h-[500px] w-[500px]" />
            </div>
          </div>

          {/* Document Header */}
          <div className="relative bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border-b px-6 py-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-sm">
                  <Award className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">
                    Pick Submission Receipt
                  </p>
                  <code className="text-2xl font-mono font-bold tracking-wide text-foreground">
                    {receipt.receipt_code}
                  </code>
                </div>
              </div>
              <div className="text-right space-y-2">
                {getStatusBadge(receipt.status)}
                {access.is_pool_admin && !access.is_owner && (
                  <Badge variant="outline" className="block">Admin View</Badge>
                )}
              </div>
            </div>

            {/* Replaced Notice */}
            {receipt.status === "replaced" && receipt.replaced_by && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
                <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    This receipt was superseded by a newer submission
                  </p>
                  <Link 
                    to={`/receipts/${receipt.replaced_by.receipt_code}`}
                    className="text-xs font-medium text-amber-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    View {receipt.replaced_by.receipt_code}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Document Body */}
          <div className="relative px-6 py-6 space-y-8">
            {/* Submission Details */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Submission Record
              </h3>
              <div className="rounded-lg border bg-muted/20 divide-y">
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Pool</span>
                  <span className="text-sm font-medium">{receipt.pool_name}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Sport</span>
                  <span className="text-sm font-medium">{receipt.sport}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Period</span>
                  <span className="text-sm font-medium">{receipt.period_id}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Format</span>
                  <span className="text-sm font-medium capitalize">{receipt.format_key?.replace(/_/g, " ") || "Standard"}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Submitted</span>
                  <span className="text-sm font-mono tabular-nums">{receipt.submitted_at_formatted}</span>
                </div>
              </div>
            </section>

            {/* Picks */}
            {picks.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Target className="h-3.5 w-3.5" />
                  Locked Picks ({picks.length})
                </h3>
                <div className="space-y-2">
                  {picks.map((pick, idx) => {
                    const result = getPickResult(pick);
                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border bg-muted/20",
                          result === "correct" && "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/30",
                          result === "incorrect" && "bg-destructive/5 border-destructive/30"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {pick.confidence_rank && (
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                              {pick.confidence_rank}
                            </div>
                          )}
                          <div className="min-w-0">
                            {pick.pick_value ? (
                              <TeamBadge teamName={pick.pick_value} size="sm" emphasis="selected" />
                            ) : (
                              <span className="text-sm text-muted-foreground italic">Hidden</span>
                            )}
                            {pick.event && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {pick.event.matchup}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {pick.event && (
                            <>
                              {pick.event.status === "final" && pick.event.score && (
                                <p className="text-xs font-mono tabular-nums">{pick.event.score}</p>
                              )}
                              {result && (
                                <Badge 
                                  variant={result === "correct" ? "default" : "destructive"}
                                  className={cn(
                                    "text-[10px] mt-1",
                                    result === "correct" && "bg-[hsl(var(--success))]"
                                  )}
                                >
                                  {result === "correct" ? "Won" : "Lost"}
                                </Badge>
                              )}
                              {pick.event.status !== "final" && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(pick.event.start_at)} · {formatTime(pick.event.start_at)}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {tiebreaker !== null && (
                  <div className="mt-3 p-3 rounded-lg border bg-muted/10 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tiebreaker</span>
                    <span className="text-sm font-bold tabular-nums">{tiebreaker}</span>
                  </div>
                )}
              </section>
            )}

            {/* Cryptographic Proof */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Fingerprint className="h-3.5 w-3.5" />
                Cryptographic Proof
              </h3>
              
              <div className="space-y-3">
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                        SHA-256 Hash
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                      onClick={() => copyToClipboard(receipt.payload_hash, "hash")}
                    >
                      {copiedField === "hash" ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : (
                        <Copy className="h-3 w-3 mr-1" />
                      )}
                      {copiedField === "hash" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <code className="text-xs font-mono text-emerald-400 break-all leading-relaxed block select-all">
                    {receipt.payload_hash}
                  </code>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={verifyReceipt}
                    disabled={isVerifying}
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Shield className="h-4 w-4 mr-2" />
                    )}
                    {isVerifying ? "Verifying..." : "Verify Integrity"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(receipt.receipt_code, "code")}
                  >
                    {copiedField === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                {verification && (
                  <div className={cn(
                    "p-4 rounded-lg border flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                    verification.is_valid 
                      ? "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/30" 
                      : "bg-destructive/5 border-destructive/30"
                  )}>
                    {verification.is_valid ? (
                      <>
                        <div className="h-9 w-9 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0">
                          <ShieldCheck className="h-5 w-5 text-[hsl(var(--success))]" />
                        </div>
                        <div>
                          <p className="font-semibold text-[hsl(var(--success))]">Integrity Verified</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            The cryptographic hash matches. This receipt is authentic and unmodified.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                          <ShieldAlert className="h-5 w-5 text-destructive" />
                        </div>
                        <div>
                          <p className="font-semibold text-destructive">Verification Failed</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Hash mismatch detected. Data integrity cannot be confirmed.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Delivery Confirmations */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                Delivery Confirmations
              </h3>

              {deliveries.length > 0 ? (
                <div className="space-y-2">
                  {deliveries.map((delivery) => {
                    const status = getDeliveryStatus(delivery);
                    const Icon = delivery.channel === "email" ? Mail : MessageSquare;
                    return (
                      <div 
                        key={delivery.id}
                        className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center bg-muted border",
                            status.className
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium capitalize">{delivery.channel}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {delivery.destination}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={delivery.delivered_at ? "default" : delivery.failed_at ? "destructive" : "secondary"}>
                            {status.label}
                          </Badge>
                          {delivery.delivered_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(delivery.delivered_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Send Confirmation Actions */}
              {access.is_owner && (
                <div className={cn(
                  "rounded-lg border p-4 text-center",
                  deliveries.length > 0 ? "mt-3 bg-muted/10" : "bg-muted/20 border-dashed"
                )}>
                  <p className="text-sm text-muted-foreground mb-3">
                    {deliveries.length > 0 ? "Send another confirmation" : "Send yourself a confirmation"}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestDelivery("email")}
                      disabled={isSending !== null}
                    >
                      {isSending === "email" ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Mail className="h-4 w-4 mr-1.5" />
                      )}
                      Email
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestDelivery("sms")}
                      disabled={isSending !== null}
                    >
                      {isSending === "sms" ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <MessageSquare className="h-4 w-4 mr-1.5" />
                      )}
                      SMS
                    </Button>
                  </div>
                  {sendSuccess && (
                    <p className="text-xs text-muted-foreground mt-2 animate-in fade-in">
                      {sendSuccess}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Document Footer */}
          <div className="relative border-t bg-muted/30 px-6 py-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                <span>POOLVAULT Certified Document</span>
              </div>
              <span className="font-mono tabular-nums">
                ID: {receipt.id}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
