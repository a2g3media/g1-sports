import { useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, History, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/react-app/components/ui/alert-dialog";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

interface Pool { id: number; name: string; sport_key: string; format_key: string; }
interface RecalcLog { id: number; period_id: string | null; trigger_type: string; triggered_by: string; is_dry_run: number; affected_entries: number; affected_picks: number; status: string; started_at: string; completed_at: string | null; created_at: string; }

export function PoolAdminRecalculation() {
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedPoolId, setSelectedPoolId] = useState(searchParams.get("pool") || "");
  const [periodId, setPeriodId] = useState("");
  const [trigger, setTrigger] = useState("admin_override");
  const [dryRun, setDryRun] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  const headers: HeadersInit = {};
  if (isDemoMode) headers["X-Demo-Mode"] = "true";

  const poolsQuery = useQuery({
    queryKey: ["pool-admin-pools-list-recalc"],
    queryFn: async () => {
      const res = await fetch("/api/pool-admin/pools", { credentials: "include", headers });
      if (!res.ok) return { pools: [] };
      return res.json() as Promise<{ pools: Pool[] }>;
    },
  });

  const logsQuery = useQuery({
    queryKey: ["recalc-log", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/recalculation-log`, { credentials: "include", headers });
      if (!res.ok) return { logs: [] };
      return res.json() as Promise<{ logs: RecalcLog[] }>;
    },
    enabled: !!selectedPoolId,
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/recalculate`, {
        method: "POST", credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId || undefined, trigger, dry_run: dryRun }),
      });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["recalc-log"] }); },
  });

  const pools = poolsQuery.data?.pools || [];
  const logs = logsQuery.data?.logs || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Safe Recalculation</h1>
        <p className="text-slate-400 text-sm mt-1">Re-grade picks, recalculate standings, and handle stat corrections safely.</p>
      </div>

      <div className="flex gap-4 items-end flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-slate-400">Pool</Label>
          <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
            <SelectTrigger className="w-[280px] bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select a pool" /></SelectTrigger>
            <SelectContent>{pools.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400">Period (optional)</Label>
          <Input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="e.g. Week 3" className="w-[180px] bg-slate-800 border-slate-700 text-white" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400">Trigger</Label>
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger className="w-[220px] bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin_override">Admin Override</SelectItem>
              <SelectItem value="stat_correction">Stat Correction</SelectItem>
              <SelectItem value="canceled_game">Canceled Game</SelectItem>
              <SelectItem value="postponed_game">Postponed Game</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedPoolId && <EmptyState icon={RefreshCw} title="Select a Pool" description="Choose a pool to run recalculations." />}

      {selectedPoolId && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-400" /> Run Recalculation</CardTitle>
            <CardDescription>Always preview with dry run first. Live runs update standings and may affect payouts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
              <Label className="text-slate-300">{dryRun ? "Dry Run (preview — no changes)" : "Live Run (applies changes)"}</Label>
              {!dryRun && <Badge variant="destructive">LIVE</Badge>}
            </div>
            <Button
              onClick={() => { if (!dryRun) setShowConfirm(true); else recalcMutation.mutate(); }}
              disabled={recalcMutation.isPending}
              className={dryRun ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"}
            >
              {recalcMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {dryRun ? "Preview Recalculation" : "Execute Recalculation"}
            </Button>

            {recalcMutation.data && (
              <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  {recalcMutation.data.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />}
                  <span className="text-sm font-medium text-white">{recalcMutation.data.success ? "Recalculation Complete" : "Recalculation Failed"}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-slate-400">Entries:</span> <span className="text-white">{recalcMutation.data.affected_entries}</span></div>
                  <div><span className="text-slate-400">Picks:</span> <span className="text-white">{recalcMutation.data.affected_picks}</span></div>
                  <div><span className="text-slate-400">Standings Changed:</span> <span className="text-white">{recalcMutation.data.standings_changed ? "Yes" : "No"}</span></div>
                  <div><span className="text-slate-400">Payout Recalc:</span> <span className="text-white">{recalcMutation.data.payout_recalc_needed ? "Yes" : "No"}</span></div>
                </div>
                {(recalcMutation.data.details || []).map((d: string, i: number) => (
                  <p key={i} className="text-xs text-slate-400">• {d}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><History className="h-5 w-5" /> Recalculation History</CardTitle>
            <CardDescription>{logs.length} records</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-3">Trigger</th>
                    <th className="text-left py-2 px-3">Period</th>
                    <th className="text-left py-2 px-3">Entries</th>
                    <th className="text-left py-2 px-3">Picks</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-700/50 text-slate-300">
                      <td className="py-2 px-3 capitalize">{log.trigger_type.replace(/_/g, " ")}{log.is_dry_run ? <Badge variant="outline" className="ml-2 text-xs border-blue-600 text-blue-400">DRY</Badge> : null}</td>
                      <td className="py-2 px-3">{log.period_id || "All"}</td>
                      <td className="py-2 px-3">{log.affected_entries}</td>
                      <td className="py-2 px-3">{log.affected_picks}</td>
                      <td className="py-2 px-3">
                        <Badge variant={log.status === "complete" ? "default" : log.status === "running" ? "secondary" : "outline"}
                               className={log.status === "complete" ? "bg-emerald-600" : log.status === "running" ? "bg-blue-600" : ""}>
                          {log.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{log.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm Live Recalculation</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will re-grade all picks{periodId ? ` for ${periodId}` : ""} and update standings. This action creates an audit log but cannot be undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { recalcMutation.mutate(); setShowConfirm(false); }}>
              Execute Live Recalculation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PoolAdminRecalculation;
