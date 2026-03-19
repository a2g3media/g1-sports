import { useEffect, useState, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Button } from "@/react-app/components/ui/button";
import {
  Loader2,
  RefreshCw,
  Brain,
  AlertTriangle,
  TrendingDown,
  UserX,
  CreditCard,
  Bot,
  Flag,
  Activity,
  Sparkles,
  MessageSquare,
  Zap,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface AIUsage {
  persona: string;
  request_count: number;
  error_count: number;
}

interface FlaggedEvent {
  id: number;
  persona: string;
  user_id: number | null;
  league_id: number | null;
  request_text: string;
  response_text: string | null;
  sources_used: string | null;
  flags: string;
  created_at: string;
}

interface InsightItem {
  id: string;
  label: string;
  severity?: string;
}

interface Insight {
  category: string;
  title: string;
  description: string;
  count: number;
  items: InsightItem[];
}

interface AIInsightsData {
  aiUsage: AIUsage[];
  flaggedEvents: FlaggedEvent[];
  insights: Insight[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPersonaIcon(persona: string) {
  switch (persona.toLowerCase()) {
    case "analyst":
      return <Activity className="h-4 w-4" />;
    case "assistant":
      return <MessageSquare className="h-4 w-4" />;
    case "advisor":
      return <Sparkles className="h-4 w-4" />;
    default:
      return <Bot className="h-4 w-4" />;
  }
}

function getInsightIcon(category: string) {
  switch (category) {
    case "pools_at_risk":
      return <TrendingDown className="h-5 w-5" />;
    case "unusual_overrides":
      return <AlertTriangle className="h-5 w-5" />;
    case "stuck_onboarding":
      return <UserX className="h-5 w-5" />;
    case "payment_exceptions":
      return <CreditCard className="h-5 w-5" />;
    default:
      return <Zap className="h-5 w-5" />;
  }
}

function getInsightColor(category: string, count: number) {
  if (count === 0) return "text-muted-foreground";
  switch (category) {
    case "pools_at_risk":
      return "text-amber-600 dark:text-amber-400";
    case "unusual_overrides":
      return "text-orange-600 dark:text-orange-400";
    case "stuck_onboarding":
      return "text-blue-600 dark:text-blue-400";
    case "payment_exceptions":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-primary";
  }
}

export function AdminAIInsights() {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<AIInsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);

      const response = await fetch("/api/admin/ai-insights", {
        credentials: "include",
        headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch AI insights:", error);
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

  const totalRequests = data?.aiUsage?.reduce((sum, u) => sum + u.request_count, 0) || 0;
  const totalErrors = data?.aiUsage?.reduce((sum, u) => sum + u.error_count, 0) || 0;
  const errorRate = totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 10 : 0;

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="AI Insights"
        description="AI-powered platform analysis and usage monitoring"
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
        {/* AI Usage Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalRequests.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">AI Requests (7d)</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                totalErrors > 0 ? "bg-red-500/10" : "bg-emerald-500/10"
              )}>
                <AlertTriangle className={cn(
                  "h-5 w-5",
                  totalErrors > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalErrors}</p>
                <p className="text-xs text-muted-foreground">Errors (7d)</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                errorRate > 5 ? "bg-amber-500/10" : "bg-emerald-500/10"
              )}>
                <Activity className={cn(
                  "h-5 w-5",
                  errorRate > 5 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold">{100 - errorRate}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Personas Usage */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">AI Persona Usage (7 days)</h3>
          </div>

          {!data?.aiUsage || data.aiUsage.length === 0 ? (
            <div className="p-8 text-center">
              <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No AI usage data</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI requests will appear here when users interact with AI features.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.aiUsage.map((usage, index) => {
                const successRate = usage.request_count > 0
                  ? Math.round(((usage.request_count - usage.error_count) / usage.request_count) * 100)
                  : 100;
                const barWidth = totalRequests > 0 ? (usage.request_count / totalRequests) * 100 : 0;

                return (
                  <div key={index} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                          {getPersonaIcon(usage.persona)}
                        </div>
                        <div>
                          <span className="text-sm font-medium capitalize">{usage.persona}</span>
                          <p className="text-xs text-muted-foreground">
                            {usage.request_count.toLocaleString()} requests
                            {usage.error_count > 0 && (
                              <span className="text-red-600 dark:text-red-400 ml-1">
                                ({usage.error_count} errors)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "text-sm font-medium",
                          successRate < 95 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                        )}>
                          {successRate}%
                        </span>
                        <p className="text-xs text-muted-foreground">success</p>
                      </div>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Platform Insights */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Platform Insights</h3>
          </div>

          {!data?.insights || data.insights.length === 0 ? (
            <div className="p-8 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No insights available</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI-generated insights will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {data.insights.map((insight) => (
                <div
                  key={insight.category}
                  className="p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                      insight.count > 0 ? "bg-secondary" : "bg-secondary/50"
                    )}>
                      <span className={getInsightColor(insight.category, insight.count)}>
                        {getInsightIcon(insight.category)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium">{insight.title}</h4>
                        {insight.count > 0 && (
                          <span className={cn(
                            "text-xs font-medium px-1.5 py-0.5 rounded",
                            insight.category === "payment_exceptions"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          )}>
                            {insight.count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {insight.description}
                      </p>
                      {insight.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {insight.items.slice(0, 3).map((item) => (
                            <p key={item.id} className="text-xs text-foreground">
                              • {item.label}
                            </p>
                          ))}
                          {insight.items.length > 3 && (
                            <p className="text-xs text-muted-foreground">
                              +{insight.items.length - 3} more
                            </p>
                          )}
                        </div>
                      )}
                      {insight.count === 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                          ✓ No issues detected
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Flagged AI Events */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Flagged AI Events</h3>
            {data?.flaggedEvents && data.flaggedEvents.length > 0 && (
              <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                {data.flaggedEvents.length}
              </span>
            )}
          </div>

          {!data?.flaggedEvents || data.flaggedEvents.length === 0 ? (
            <div className="p-8 text-center">
              <Flag className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No flagged events</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI events that require review will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.flaggedEvents.map((event) => (
                <div
                  key={event.id}
                  className="px-4 py-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium capitalize">{event.persona}</span>
                        {event.flags && (
                          <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                            {event.flags}
                          </span>
                        )}
                        {event.user_id && (
                          <span className="text-xs text-muted-foreground">
                            User #{event.user_id}
                          </span>
                        )}
                        {event.league_id && (
                          <span className="text-xs text-muted-foreground">
                            Pool #{event.league_id}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {event.request_text}
                      </p>
                      {event.response_text && (
                        <p className="text-xs text-foreground mt-1 line-clamp-2 bg-secondary/50 px-2 py-1 rounded">
                          {event.response_text}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(event.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
