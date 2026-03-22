import { useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2, Loader2, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Badge } from "@/react-app/components/ui/badge";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { useSearchParams } from "react-router-dom";

interface Pool { id: number; name: string; sport_key: string; format_key: string; }
interface ChildPool { child_league_id: number; weight: number; is_active: number; name: string; sport_key: string; format_key: string; }

export function PoolAdminBundles() {
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedPoolId, setSelectedPoolId] = useState(searchParams.get("pool") || "");
  const [childLeagueId, setChildLeagueId] = useState("");
  const [weight, setWeight] = useState("1.0");

  const headers: HeadersInit = {};
  if (isDemoMode) headers["X-Demo-Mode"] = "true";

  const poolsQuery = useQuery({
    queryKey: ["pool-admin-pools-list-bundles"],
    queryFn: async () => {
      const res = await fetch("/api/pool-admin/pools", { credentials: "include", headers });
      if (!res.ok) return { pools: [] };
      return res.json() as Promise<{ pools: Pool[] }>;
    },
  });

  const childrenQuery = useQuery({
    queryKey: ["bundle-children", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/bundle/children`, { credentials: "include", headers });
      if (!res.ok) return { children: [] };
      return res.json() as Promise<{ children: ChildPool[] }>;
    },
    enabled: !!selectedPoolId,
  });

  const leaderboardQuery = useQuery({
    queryKey: ["bundle-leaderboard", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/leaderboard?view=bundle`, { credentials: "include", headers });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedPoolId,
  });

  const addChildMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/pool-admin/${selectedPoolId}/bundle/add-child`, {
        method: "POST", credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ child_league_id: Number(childLeagueId), weight: Number(weight) }),
      });
    },
    onSuccess: () => { setChildLeagueId(""); queryClient.invalidateQueries({ queryKey: ["bundle-children"] }); },
  });

  const removeChildMutation = useMutation({
    mutationFn: async (childId: number) => {
      await fetch(`/api/pool-admin/${selectedPoolId}/bundle/remove-child`, {
        method: "DELETE", credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ child_league_id: childId }),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bundle-children"] }); },
  });

  const pools = poolsQuery.data?.pools || [];
  const bundlePools = pools.filter((p) => p.format_key === "bundle_pool" || p.format_key === "bundle_pool_master");
  const children = childrenQuery.data?.children || [];
  const leaderboard = leaderboardQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Bundle Pool Management</h1>
        <p className="text-slate-400 text-sm mt-1">Manage child pools, weights, and overall bundle leaderboard.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-slate-400">Bundle Pool</Label>
        <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
          <SelectTrigger className="w-[320px] bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select a bundle pool" /></SelectTrigger>
          <SelectContent>
            {bundlePools.length > 0 ? bundlePools.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))
              : pools.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {!selectedPoolId && <EmptyState icon={Layers} title="Select a Bundle Pool" description="Choose a bundle pool to manage its child pools." />}

      {selectedPoolId && (
        <>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Child Pools</CardTitle>
              <CardDescription>{children.length} linked pool(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {children.length === 0 ? (
                <p className="text-slate-500 text-sm">No child pools linked yet. Add one below.</p>
              ) : (
                <div className="space-y-2">
                  {children.map((child) => (
                    <div key={child.child_league_id} className="flex items-center justify-between bg-slate-900 rounded-lg p-3 border border-slate-700/50">
                      <div>
                        <p className="text-white font-medium">{child.name}</p>
                        <p className="text-xs text-slate-400">{child.sport_key} • {child.format_key} • Weight: {child.weight}x</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={child.is_active ? "default" : "outline"} className={child.is_active ? "bg-emerald-600" : ""}>{child.is_active ? "Active" : "Inactive"}</Badge>
                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => removeChildMutation.mutate(child.child_league_id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 items-end pt-4 border-t border-slate-700">
                <div className="space-y-1.5 flex-1">
                  <Label className="text-slate-400">Child Pool ID</Label>
                  <Input value={childLeagueId} onChange={(e) => setChildLeagueId(e.target.value)} placeholder="Pool ID" className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5 w-[100px]">
                  <Label className="text-slate-400">Weight</Label>
                  <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <Button onClick={() => addChildMutation.mutate()} disabled={!childLeagueId || addChildMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {addChildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {leaderboard?.entries && leaderboard.entries.length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /> Bundle Leaderboard</CardTitle>
                <CardDescription>Overall standings (SUM of child pool scores)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-3">Rank</th>
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-right py-2 px-3">Total Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.entries.map((entry: { rank: number; display_name: string; total_points: number; is_current_user: boolean }, i: number) => (
                        <tr key={i} className={`border-b border-slate-700/50 ${entry.is_current_user ? "bg-blue-900/20" : "text-slate-300"}`}>
                          <td className="py-2 px-3 font-mono">{entry.rank}</td>
                          <td className="py-2 px-3">{entry.display_name}</td>
                          <td className="py-2 px-3 text-right font-mono">{entry.total_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default PoolAdminBundles;
