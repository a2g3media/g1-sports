import { useState } from "react";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Button } from "@/react-app/components/ui/button";
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Database, Key, Zap } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface SportsRadarResult {
  status: "PASS" | "FAIL" | "PARTIAL";
  apiKeyPresent: boolean;
  oddsKeyPresent: boolean;
  propsKeyPresent: boolean;
  dbTotals: {
    games: number;
    odds: number;
    props: number;
    lastGameSync: string | null;
    lastOddsUpdate: string | null;
  };
}

interface OpenAIResult {
  status: "PASS" | "FAIL";
  apiKeyPresent: boolean;
  responseTimeMs: number;
  model?: string;
  error?: string;
}

interface FixItem {
  severity: "critical" | "warning" | "info";
  category: string;
  issue: string;
  fix: string;
}

interface HealthResponse {
  timestamp: string;
  sportsRadar: SportsRadarResult;
  openAI: OpenAIResult;
  fixChecklist: FixItem[];
}

function StatusPill({ status }: { status: "PASS" | "FAIL" | "PARTIAL" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        status === "PASS"
          ? "bg-emerald-500/20 text-emerald-400"
          : status === "PARTIAL"
            ? "bg-yellow-500/20 text-yellow-400"
            : "bg-red-500/20 text-red-400"
      )}
    >
      {status === "PASS" ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

export default function AdminApiHealth() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/health/all", {
        headers: { "Content-Type": "application/json", "X-Demo-Mode": "true" },
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Health request failed (${res.status})`);
      }
      const data = (await res.json()) as HealthResponse;
      setResults(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="API Health"
        description="Validate SportsRadar/provider and OpenAI connectivity."
      />

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={loading}>
          {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
          Run Health Check
        </Button>
        {results?.timestamp && (
          <span className="text-xs text-muted-foreground">Last run: {new Date(results.timestamp).toLocaleString()}</span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {results && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Database className="h-4 w-4 text-blue-400" />
                  SportsRadar / Provider
                </div>
                <StatusPill status={results.sportsRadar.status} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>API key: {results.sportsRadar.apiKeyPresent ? "configured" : "missing"}</p>
                <p>Odds key: {results.sportsRadar.oddsKeyPresent ? "configured" : "missing"}</p>
                <p>Props key: {results.sportsRadar.propsKeyPresent ? "configured" : "missing"}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                <p>DB games: {results.sportsRadar.dbTotals.games}</p>
                <p>DB odds: {results.sportsRadar.dbTotals.odds}</p>
                <p>DB props: {results.sportsRadar.dbTotals.props}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Key className="h-4 w-4 text-emerald-400" />
                  OpenAI
                </div>
                <StatusPill status={results.openAI.status === "PASS" ? "PASS" : "FAIL"} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>API key: {results.openAI.apiKeyPresent ? "configured" : "missing"}</p>
                <p>Response time: {results.openAI.responseTimeMs} ms</p>
                <p>Model: {results.openAI.model || "n/a"}</p>
                {results.openAI.error && <p className="text-red-300">Error: {results.openAI.error}</p>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              Fix Checklist
            </div>
            {results.fixChecklist.length === 0 ? (
              <p className="text-sm text-emerald-400">No issues detected.</p>
            ) : (
              <div className="space-y-2">
                {results.fixChecklist.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{item.category}</p>
                    <p className="text-muted-foreground">{item.issue}</p>
                    <p className="text-xs mt-1 text-blue-300">{item.fix}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
