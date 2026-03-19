import { useEffect, useState, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Button } from "@/react-app/components/ui/button";
import {
  Loader2,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  Clock,
  Database,
  CheckCircle,
  HelpCircle,
  Zap,
  Activity,
  Target,
  Search,
  Flag,
  Eye,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface ToolMetrics {
  toolName: string;
  callCount: number;
  avgLatencyMs: number;
  errorCount: number;
  lastUsed: string | null;
}

interface RecentQuestion {
  id: number;
  userId: number | null;
  leagueId: number | null;
  requestText: string;
  responseText: string | null;
  sourcesUsed: string | null;
  flags: string | null;
  createdAt: string;
  wasAnswered: boolean;
}

interface FreshnessStatus {
  sourceKey: string;
  sourceName: string;
  category: string;
  status: "live" | "fresh" | "warning" | "stale" | "critical" | "unknown";
  lastUpdate: string | null;
  recordCount: number;
  ageMinutes: number | null;
  isCritical: boolean;
  message: string;
}

interface ScoutQAData {
  summary: {
    totalQuestions7d: number;
    answeredCount: number;
    unansweredCount: number;
    flaggedCount: number;
    avgResponseTimeMs: number;
    hallucationFlags: number;
  };
  toolMetrics: ToolMetrics[];
  recentQuestions: RecentQuestion[];
  unansweredQuestions: RecentQuestion[];
  flaggedQuestions: RecentQuestion[];
  dataFreshness: {
    results: FreshnessStatus[];
    summary: {
      total: number;
      live: number;
      fresh: number;
      warning: number;
      stale: number;
      critical: number;
      healthScore: number;
    };
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusColor(status: string) {
  switch (status) {
    case "live":
      return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10";
    case "fresh":
      return "text-blue-600 dark:text-blue-400 bg-blue-500/10";
    case "warning":
      return "text-amber-600 dark:text-amber-400 bg-amber-500/10";
    case "stale":
      return "text-orange-600 dark:text-orange-400 bg-orange-500/10";
    case "critical":
      return "text-red-600 dark:text-red-400 bg-red-500/10";
    default:
      return "text-muted-foreground bg-secondary";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "live":
    case "fresh":
      return <CheckCircle className="h-3.5 w-3.5" />;
    case "warning":
      return <Clock className="h-3.5 w-3.5" />;
    case "stale":
    case "critical":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5" />;
  }
}

export function AdminScoutQA() {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<ScoutQAData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "unanswered" | "flagged">("recent");

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);

      const headers: HeadersInit = {};
      if (isDemoMode) {
        headers["X-Demo-Mode"] = "true";
      }

      const response = await fetch("/api/admin/scout-qa", {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch Scout QA data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const answerRate = data?.summary?.totalQuestions7d
    ? Math.round((data.summary.answeredCount / data.summary.totalQuestions7d) * 100)
    : 100;

  const questions =
    activeTab === "unanswered"
      ? data?.unansweredQuestions
      : activeTab === "flagged"
        ? data?.flaggedQuestions
        : data?.recentQuestions;

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Scout QA"
        description="Monitor Scout AI quality, tool performance, and data freshness"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary?.totalQuestions7d?.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">Questions (7d)</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                answerRate >= 90 ? "bg-emerald-500/10" : answerRate >= 70 ? "bg-amber-500/10" : "bg-red-500/10"
              )}>
                <Target className={cn(
                  "h-5 w-5",
                  answerRate >= 90 ? "text-emerald-600 dark:text-emerald-400" : answerRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold">{answerRate}%</p>
                <p className="text-xs text-muted-foreground">Answer Rate</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                (data?.summary?.unansweredCount || 0) === 0 ? "bg-emerald-500/10" : "bg-amber-500/10"
              )}>
                <HelpCircle className={cn(
                  "h-5 w-5",
                  (data?.summary?.unansweredCount || 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary?.unansweredCount || 0}</p>
                <p className="text-xs text-muted-foreground">Unanswered</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                (data?.summary?.flaggedCount || 0) === 0 ? "bg-emerald-500/10" : "bg-red-500/10"
              )}>
                <Flag className={cn(
                  "h-5 w-5",
                  (data?.summary?.flaggedCount || 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary?.flaggedCount || 0}</p>
                <p className="text-xs text-muted-foreground">Flagged</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatLatency(data?.summary?.avgResponseTimeMs || 0)}</p>
                <p className="text-xs text-muted-foreground">Avg Response</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Data Freshness */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Data Feed Freshness</h3>
              </div>
              {data?.dataFreshness?.summary && (
                <div className={cn(
                  "text-xs font-medium px-2 py-1 rounded-full",
                  data.dataFreshness.summary.healthScore >= 80
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : data.dataFreshness.summary.healthScore >= 50
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                )}>
                  Health: {data.dataFreshness.summary.healthScore}%
                </div>
              )}
            </div>

            {!data?.dataFreshness?.results?.length ? (
              <div className="p-8 text-center">
                <Database className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No data sources monitored</p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
                {data.dataFreshness.results.map((source) => (
                  <div key={source.sourceKey} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "flex items-center justify-center h-6 w-6 rounded-full",
                          getStatusColor(source.status)
                        )}>
                          {getStatusIcon(source.status)}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{source.sourceName}</p>
                          <p className="text-xs text-muted-foreground">{source.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded capitalize",
                          getStatusColor(source.status)
                        )}>
                          {source.status}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {source.ageMinutes !== null ? `${source.ageMinutes}m ago` : "Unknown"}
                        </p>
                      </div>
                    </div>
                    {source.isCritical && source.status !== "live" && source.status !== "fresh" && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Critical data source
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tool Performance */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Tool Performance (7d)</h3>
            </div>

            {!data?.toolMetrics?.length ? (
              <div className="p-8 text-center">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No tool usage data</p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
                {data.toolMetrics.map((tool) => {
                  const errorRate = tool.callCount > 0 ? (tool.errorCount / tool.callCount) * 100 : 0;
                  return (
                    <div key={tool.toolName} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium font-mono">{tool.toolName}</span>
                        <span className="text-xs text-muted-foreground">
                          {tool.callCount.toLocaleString()} calls
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted-foreground">
                          Avg: <span className="text-foreground font-medium">{formatLatency(tool.avgLatencyMs)}</span>
                        </span>
                        <span className={cn(
                          errorRate > 5 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                        )}>
                          Errors: <span className="font-medium">{tool.errorCount}</span>
                          {errorRate > 0 && <span className="ml-1">({errorRate.toFixed(1)}%)</span>}
                        </span>
                      </div>
                      {/* Latency bar */}
                      <div className="h-1.5 bg-secondary rounded-full mt-2 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            tool.avgLatencyMs < 500 ? "bg-emerald-500" : tool.avgLatencyMs < 1500 ? "bg-amber-500" : "bg-red-500"
                          )}
                          style={{ width: `${Math.min((tool.avgLatencyMs / 3000) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Questions Section */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab("recent")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  activeTab === "recent"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Search className="h-4 w-4" />
                Recent
                {data?.recentQuestions && (
                  <span className="text-xs bg-secondary/80 px-1.5 rounded">{data.recentQuestions.length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("unanswered")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  activeTab === "unanswered"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <HelpCircle className="h-4 w-4" />
                Unanswered
                {(data?.unansweredQuestions?.length || 0) > 0 && (
                  <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 rounded font-medium">
                    {data?.unansweredQuestions?.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("flagged")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  activeTab === "flagged"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Flag className="h-4 w-4" />
                Flagged
                {(data?.flaggedQuestions?.length || 0) > 0 && (
                  <span className="text-xs bg-red-500/20 text-red-600 dark:text-red-400 px-1.5 rounded font-medium">
                    {data?.flaggedQuestions?.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {!questions?.length ? (
            <div className="p-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">
                {activeTab === "unanswered"
                  ? "No unanswered questions"
                  : activeTab === "flagged"
                    ? "No flagged questions"
                    : "No recent questions"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeTab === "unanswered"
                  ? "All questions have been answered"
                  : activeTab === "flagged"
                    ? "No quality issues detected"
                    : "Questions will appear here when users interact with Scout"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {questions.map((q) => (
                <div key={q.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {q.userId && (
                          <span className="text-xs text-muted-foreground">User #{q.userId}</span>
                        )}
                        {q.leagueId && (
                          <span className="text-xs text-muted-foreground">Pool #{q.leagueId}</span>
                        )}
                        {!q.wasAnswered && (
                          <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                            Unanswered
                          </span>
                        )}
                        {q.flags && (
                          <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                            {q.flags}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{q.requestText}</p>
                      {q.responseText && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 bg-secondary/50 px-2 py-1 rounded">
                          {q.responseText}
                        </p>
                      )}
                      {q.sourcesUsed && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            Sources: {q.sourcesUsed}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {formatDate(q.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Health Score Legend */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3">Status Legend</h4>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className={cn("flex items-center justify-center h-5 w-5 rounded-full", getStatusColor("live"))}>
                {getStatusIcon("live")}
              </span>
              <span>Live (&lt;2m)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("flex items-center justify-center h-5 w-5 rounded-full", getStatusColor("fresh"))}>
                {getStatusIcon("fresh")}
              </span>
              <span>Fresh</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("flex items-center justify-center h-5 w-5 rounded-full", getStatusColor("warning"))}>
                {getStatusIcon("warning")}
              </span>
              <span>Warning</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("flex items-center justify-center h-5 w-5 rounded-full", getStatusColor("stale"))}>
                {getStatusIcon("stale")}
              </span>
              <span>Stale</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("flex items-center justify-center h-5 w-5 rounded-full", getStatusColor("critical"))}>
                {getStatusIcon("critical")}
              </span>
              <span>Critical</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
