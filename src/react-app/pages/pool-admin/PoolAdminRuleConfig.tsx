import { useState, useEffect } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Save, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { EmptyState } from "@/react-app/components/ui/empty-state";
import { useSearchParams } from "react-router-dom";

interface AdminField {
  key: string; group: string; label: string;
  type: "select" | "toggle" | "number" | "text" | "multi_select";
  options?: { value: string; label: string }[];
  default_value: unknown;
}
interface FieldGroups { structure: AdminField[]; rules: AdminField[]; scoring: AdminField[]; payouts: AdminField[]; visibility: AdminField[]; }
interface Pool { id: number; name: string; sport_key: string; format_key: string; }

const GROUP_META: Record<string, { label: string; icon: string }> = {
  structure: { label: "Structure", icon: "🏗" },
  rules: { label: "Rules", icon: "📋" },
  scoring: { label: "Scoring", icon: "🎯" },
  payouts: { label: "Payouts", icon: "💰" },
  visibility: { label: "Visibility", icon: "👁" },
};

export function PoolAdminRuleConfig() {
  const { isDemoMode } = useDemoAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedPoolId, setSelectedPoolId] = useState(searchParams.get("pool") || "");
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["structure", "rules", "scoring"]));
  const [saveSuccess, setSaveSuccess] = useState(false);

  const headers: HeadersInit = {};
  if (isDemoMode) headers["X-Demo-Mode"] = "true";

  const poolsQuery = useQuery({
    queryKey: ["pool-admin-pools-list-rc"],
    queryFn: async () => {
      const res = await fetch("/api/pool-admin/pools", { credentials: "include", headers });
      if (!res.ok) return { pools: [] };
      return res.json() as Promise<{ pools: Pool[] }>;
    },
  });

  const configQuery = useQuery({
    queryKey: ["rule-config", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/rule-config`, { credentials: "include", headers });
      if (!res.ok) return null;
      return res.json() as Promise<{ config: Record<string, unknown>; fields: AdminField[]; validation_errors: string[]; template: string }>;
    },
    enabled: !!selectedPoolId,
  });

  const fieldsQuery = useQuery({
    queryKey: ["admin-fields", selectedPoolId],
    queryFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/admin-settings-fields`, { credentials: "include", headers });
      if (!res.ok) return null;
      return res.json() as Promise<{ groups: FieldGroups; template: string }>;
    },
    enabled: !!selectedPoolId,
  });

  useEffect(() => {
    if (configQuery.data?.config) {
      setLocalConfig(flattenConfig(configQuery.data.config));
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pool-admin/${selectedPoolId}/rule-config`, {
        method: "PUT", credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(unflattenConfig(localConfig)),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) { setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }
      queryClient.invalidateQueries({ queryKey: ["rule-config"] });
    },
  });

  const pools = poolsQuery.data?.pools || [];
  const groups = fieldsQuery.data?.groups;
  const validationErrors = configQuery.data?.validation_errors || [];

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => { const next = new Set(prev); if (next.has(group)) next.delete(group); else next.add(group); return next; });
  }

  function setFieldValue(key: string, value: unknown) {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pool Rule Configuration</h1>
          <p className="text-slate-400 text-sm mt-1">Full admin control over every pool setting — grouped by category.</p>
        </div>
        {selectedPoolId && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : saveSuccess ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {saveSuccess ? "Saved!" : "Save Config"}
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-slate-400">Pool</Label>
        <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
          <SelectTrigger className="w-[320px] bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select a pool" /></SelectTrigger>
          <SelectContent>
            {pools.map((p: Pool) => (<SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.format_key})</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {!selectedPoolId && <EmptyState icon={Settings} title="Select a Pool" description="Choose a pool to configure its rules." />}

      {validationErrors.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
          <p className="text-red-400 font-medium text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Validation Issues</p>
          <ul className="mt-2 space-y-1">{validationErrors.map((e, i) => (<li key={i} className="text-red-300 text-xs">• {e}</li>))}</ul>
        </div>
      )}

      {groups && Object.entries(groups).map(([groupKey, fields]: [string, AdminField[]]) => {
        if (!fields || fields.length === 0) return null;
        const meta = GROUP_META[groupKey] || { label: groupKey, icon: "⚙" };
        const isExpanded = expandedGroups.has(groupKey);
        return (
          <Card key={groupKey} className="bg-slate-800/50 border-slate-700">
            <CardHeader className="cursor-pointer" onClick={() => toggleGroup(groupKey)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.icon}</span>
                  <CardTitle className="text-white">{meta.label}</CardTitle>
                  <Badge variant="outline" className="text-slate-400 border-slate-600">{fields.length} settings</Badge>
                </div>
                {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent className="space-y-4">
                {fields.map((field: AdminField) => (
                  <div key={field.key} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                    <Label className="text-slate-300 text-sm">{field.label}</Label>
                    {field.type === "toggle" ? (
                      <Switch checked={Boolean(localConfig[field.key] ?? field.default_value)} onCheckedChange={(v) => setFieldValue(field.key, v)} />
                    ) : field.type === "select" && field.options ? (
                      <Select value={String(localConfig[field.key] ?? field.default_value)} onValueChange={(v) => setFieldValue(field.key, v)}>
                        <SelectTrigger className="w-[220px] bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent>{field.options.map((o: { value: string; label: string }) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : field.type === "number" ? (
                      <Input type="number" value={String(localConfig[field.key] ?? field.default_value)} onChange={(e) => setFieldValue(field.key, Number(e.target.value))} className="w-[120px] bg-slate-900 border-slate-700 text-white" />
                    ) : (
                      <Input value={String(localConfig[field.key] ?? field.default_value ?? "")} onChange={(e) => setFieldValue(field.key, e.target.value)} className="w-[220px] bg-slate-900 border-slate-700 text-white" />
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}

      {configQuery.data?.template && (
        <div className="text-xs text-slate-500 text-right">Template: {configQuery.data.template}</div>
      )}
    </div>
  );
}

function flattenConfig(config: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenConfig(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function unflattenConfig(flat: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== "object") current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

export default PoolAdminRuleConfig;
