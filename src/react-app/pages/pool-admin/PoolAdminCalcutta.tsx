import { useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gavel, Plus, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { useSearchParams } from "react-router-dom";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

interface Pool { id: number; name: string; sport_key: string; format_key: string; }
interface Ownership { id: number; team_id: string; team_name: string; user_id: string; display_name: string; ownership_pct: number; price_paid_cents: number; created_at: string; }

export function PoolAdminCalcutta() {
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedPoolId, setSelectedPoolId] = useState(searchParams.get("pool") || "");
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ownershipPct, setOwnershipPct] = useState("100");
  const [pricePaidCents, setPricePaidCents] = useState("0");

  const headers: HeadersInit = {};
  if (isDemoMode) headers["X-Demo-Mode"] = "true";

  const poolsQuery = useQuery({
    queryKey: ["pool-admin-pools-list-calcutta"],
    queryFn: async () => {
      const res = await fetch("/api/pool-admin/pools", { credentials: "include", headers });
      if (!res.ok) return { pools: [] };
      return res.json() as Promise<{ pools: Pool[] }>;
    },
  });

  const ownershipsQuery = useQuery({
    queryKey: ["calcutta-ownerships", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/calcutta/ownerships`, { credentials: "include", headers });
      if (!res.ok) return { ownerships: [] };
      return res.json() as Promise<{ ownerships: Ownership[] }>;
    },
    enabled: !!selectedPoolId,
  });

  const recordMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/pool-admin/${selectedPoolId}/calcutta/record-ownership`, {
        method: "POST", credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId, team_name: teamName,
          user_id: userId, display_name: displayName,
          ownership_pct: Number(ownershipPct), price_paid_cents: Number(pricePaidCents),
        }),
      });
    },
    onSuccess: () => {
      setTeamId(""); setTeamName(""); setUserId(""); setDisplayName(""); setOwnershipPct("100"); setPricePaidCents("0");
      queryClient.invalidateQueries({ queryKey: ["calcutta-ownerships"] });
    },
  });

  const pools = poolsQuery.data?.pools || [];
  const ownerships = ownershipsQuery.data?.ownerships || [];

  const totalAuctionRevenue = ownerships.reduce((sum, o) => sum + o.price_paid_cents, 0);
  const uniqueTeams = new Set(ownerships.map((o) => o.team_id)).size;
  const uniqueOwners = new Set(ownerships.map((o) => o.user_id)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Calcutta Auction Ledger</h1>
        <p className="text-slate-400 text-sm mt-1">Record team ownership from auctions and track fractional ownership.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-slate-400">Pool</Label>
        <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
          <SelectTrigger className="w-[320px] bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select a pool" /></SelectTrigger>
          <SelectContent>
            {pools.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {!selectedPoolId && <EmptyState icon={Gavel} title="Select a Pool" description="Choose a Calcutta pool to manage auction ownership." />}

      {selectedPoolId && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border p-4 bg-emerald-900/30 border-emerald-700/50">
              <p className="text-sm text-slate-400">Auction Revenue</p>
              <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalAuctionRevenue)}</p>
            </div>
            <div className="rounded-xl border p-4 bg-slate-800/50 border-slate-700">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-400">Teams</p><p className="text-2xl font-bold text-white mt-1">{uniqueTeams}</p></div>
                <Gavel className="h-6 w-6 text-slate-400" />
              </div>
            </div>
            <div className="rounded-xl border p-4 bg-slate-800/50 border-slate-700">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-400">Owners</p><p className="text-2xl font-bold text-white mt-1">{uniqueOwners}</p></div>
                <Users className="h-6 w-6 text-slate-400" />
              </div>
            </div>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Record Ownership</CardTitle>
              <CardDescription>Log a team purchase from the auction.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-400">Team ID</Label>
                  <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="e.g. duke" className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400">Team Name</Label>
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Duke Blue Devils" className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400">Owner User ID</Label>
                  <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400">Display Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name" className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400">Ownership %</Label>
                  <Input type="number" value={ownershipPct} onChange={(e) => setOwnershipPct(e.target.value)} className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400">Price Paid (cents)</Label>
                  <Input type="number" value={pricePaidCents} onChange={(e) => setPricePaidCents(e.target.value)} className="bg-slate-900 border-slate-700 text-white" />
                </div>
              </div>
              <Button onClick={() => recordMutation.mutate()} disabled={!teamId || !userId || recordMutation.isPending} className="mt-4 bg-blue-600 hover:bg-blue-700">
                {recordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Record Ownership
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Ownership Ledger</CardTitle>
              <CardDescription>{ownerships.length} record(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {ownerships.length === 0 ? (
                <p className="text-slate-500 text-sm">No auction records yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-3">Team</th>
                        <th className="text-left py-2 px-3">Owner</th>
                        <th className="text-right py-2 px-3">Ownership</th>
                        <th className="text-right py-2 px-3">Price Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerships.map((o) => (
                        <tr key={o.id} className="border-b border-slate-700/50 text-slate-300">
                          <td className="py-2 px-3">
                            <span className="font-medium text-white">{o.team_name}</span>
                            <span className="text-xs text-slate-500 ml-2">{o.team_id}</span>
                          </td>
                          <td className="py-2 px-3">{o.display_name}</td>
                          <td className="py-2 px-3 text-right">{o.ownership_pct}%</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(o.price_paid_cents)}</td>
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
    </div>
  );
}

export default PoolAdminCalcutta;
