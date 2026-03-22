import { useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, CheckCircle2, XCircle, Clock, Calculator,
  ArrowRight, AlertTriangle, Loader2, Ban,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/react-app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/react-app/components/ui/alert-dialog";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { useSearchParams } from "react-router-dom";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

interface Pool { id: number; name: string; sport_key: string; format_key: string; }
interface PayoutLineItem {
  id: number; entry_id: number; user_id: string; bucket_type: string;
  period_id: string | null; place: number; amount_cents: number;
  is_tie_split: number; status: string; created_at: string;
}
interface PayoutSummary {
  league_id: number; total_pool_cents: number; total_distributed_cents: number;
  total_pending_cents: number; total_approved_cents: number;
  total_paid_cents: number; total_voided_cents: number;
  line_items: PayoutLineItem[];
}

function StatCard({ label, value, icon: Icon, variant = "default" }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const v = { default: "bg-slate-800/50 border-slate-700", success: "bg-emerald-900/30 border-emerald-700/50", warning: "bg-amber-900/30 border-amber-700/50", danger: "bg-red-900/30 border-red-700/50" };
  const iv = { default: "text-slate-400", success: "text-emerald-400", warning: "text-amber-400", danger: "text-red-400" };
  return (
    <div className={`rounded-xl border p-4 ${v[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg bg-slate-800/50 ${iv[variant]}`}><Icon className="h-6 w-6" /></div>
      </div>
    </div>
  );
}

export function PoolAdminPayouts() {
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedPoolId, setSelectedPoolId] = useState(searchParams.get("pool") || "");
  const [dryRun, setDryRun] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{ type: string; label: string } | null>(null);
  const [periodId, setPeriodId] = useState("");

  const headers: HeadersInit = {};
  if (isDemoMode) headers["X-Demo-Mode"] = "true";

  const poolsQuery = useQuery({
    queryKey: ["pool-admin-pools-list"],
    queryFn: async () => {
      const res = await fetch("/api/pool-admin/pools", { credentials: "include", headers });
      if (!res.ok) return { pools: [] };
      return res.json() as Promise<{ pools: Pool[] }>;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["payout-summary", selectedPoolId],
    queryFn: async () => {
      if (!selectedPoolId) return null;
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/payouts`, { credentials: "include", headers });
      if (!res.ok) return null;
      return res.json() as Promise<PayoutSummary>;
    },
    enabled: !!selectedPoolId,
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/payouts/calculate`, {
        method: "POST", credentials: "include", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId || undefined, dry_run: dryRun }),
      });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payout-summary"] }); },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/payouts/approve`, {
        method: "POST", credentials: "include", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId || undefined }),
      });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payout-summary"] }); },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/payouts/void`, {
        method: "POST", credentials: "include", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin voided via dashboard", period_id: periodId || undefined }),
      });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payout-summary"] }); },
  });

  const summary = summaryQuery.data;
  const pools = poolsQuery.data?.pools || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Payout Management</h1>
        <p className="text-slate-400 text-sm mt-1">Configure, calculate, approve, and track payouts for your pools.</p>
      </div>

      <div className="flex gap-4 items-end flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-slate-400">Pool</Label>
          <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
            <SelectTrigger className="w-[280px] bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select a pool" /></SelectTrigger>
            <SelectContent>
              {pools.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400">Period (optional)</Label>
          <Input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="e.g. Week 1" className="w-[180px] bg-slate-800 border-slate-700 text-white" />
        </div>
      </div>

      {!selectedPoolId && (
        <EmptyState icon={DollarSign} title="Select a Pool" description="Choose a pool above to manage its payouts." />
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total Pool" value={formatCurrency(summary.total_pool_cents)} icon={DollarSign} />
            <StatCard label="Pending" value={formatCurrency(summary.total_pending_cents)} icon={Clock} variant="warning" />
            <StatCard label="Approved" value={formatCurrency(summary.total_approved_cents)} icon={CheckCircle2} variant="success" />
            <StatCard label="Paid" value={formatCurrency(summary.total_paid_cents)} icon={ArrowRight} variant="success" />
            <StatCard label="Voided" value={formatCurrency(summary.total_voided_cents)} icon={XCircle} variant="danger" />
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Actions</CardTitle>
              <CardDescription>Run calculations, approve pending payouts, or void.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={dryRun} onCheckedChange={setDryRun} />
                  <Label className="text-slate-300">{dryRun ? "Dry Run (preview only)" : "Live Run (writes to ledger)"}</Label>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {calculateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  {dryRun ? "Preview Payouts" : "Calculate & Save"}
                </Button>
                <Button onClick={() => setConfirmAction({ type: "approve", label: "Approve all pending payouts?" })} variant="outline" className="border-emerald-600 text-emerald-400 hover:bg-emerald-900/30">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Approve Pending
                </Button>
                <Button onClick={() => setConfirmAction({ type: "void", label: "Void all pending/approved payouts?" })} variant="outline" className="border-red-600 text-red-400 hover:bg-red-900/30">
                  <Ban className="h-4 w-4 mr-2" /> Void All
                </Button>
              </div>
              {calculateMutation.data && (
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-300 font-medium mb-2">{dryRun ? "Preview Result" : "Calculation Result"}</p>
                  <p className="text-sm text-slate-400">
                    {calculateMutation.data.line_items?.length || 0} payee(s) — {formatCurrency(calculateMutation.data.total_distributed_cents || 0)} distributed
                  </p>
                  {(calculateMutation.data.warnings || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {(calculateMutation.data.warnings as string[]).map((w: string, i: number) => (
                        <p key={i} className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Payout Ledger</CardTitle>
              <CardDescription>{summary.line_items.length} record(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.line_items.length === 0 ? (
                <p className="text-slate-500 text-sm">No payouts recorded yet. Run a calculation first.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-3">Place</th>
                        <th className="text-left py-2 px-3">Entry</th>
                        <th className="text-left py-2 px-3">Bucket</th>
                        <th className="text-left py-2 px-3">Period</th>
                        <th className="text-right py-2 px-3">Amount</th>
                        <th className="text-left py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.line_items.map((item) => (
                        <tr key={item.id} className="border-b border-slate-700/50 text-slate-300">
                          <td className="py-2 px-3">{item.place}</td>
                          <td className="py-2 px-3">#{item.entry_id}{item.is_tie_split ? <Badge variant="outline" className="ml-2 text-xs border-amber-600 text-amber-400">TIE</Badge> : null}</td>
                          <td className="py-2 px-3 capitalize">{item.bucket_type}</td>
                          <td className="py-2 px-3">{item.period_id || "—"}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(item.amount_cents)}</td>
                          <td className="py-2 px-3">
                            <Badge variant={item.status === "paid" ? "default" : item.status === "approved" ? "secondary" : item.status === "voided" ? "destructive" : "outline"}
                                   className={item.status === "paid" ? "bg-emerald-600" : item.status === "approved" ? "bg-blue-600" : ""}>
                              {item.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm Action</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">{confirmAction?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "void" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
              onClick={() => {
                if (confirmAction?.type === "approve") approveMutation.mutate();
                if (confirmAction?.type === "void") voidMutation.mutate();
                setConfirmAction(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PoolAdminPayouts;
