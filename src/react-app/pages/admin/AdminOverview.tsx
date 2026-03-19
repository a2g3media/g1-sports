import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/react-app/components/admin/AdminStatCard";
import { AdminHealthIndicator } from "@/react-app/components/admin/AdminHealthIndicator";
import {
  Users,
  Layers,
  Activity,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface OverviewData {
  totalUsers: number;
  activeUsers7d: number;
  totalPools: number;
  activePools: number;
  poolsBySport: { sport: string; count: number }[];
  avgPoolSize: number;
  subscriptionBreakdown: {
    free: number;
    trial: number;
    paid: number;
    expired: number;
  };
  health: {
    sportsDataFeeds: { status: "OK" | "DEGRADED" | "DOWN"; delayedCount: number };
    pushNotifications: { status: "OK" | "DEGRADED" | "DOWN"; failureCount: number };
    escrowWebhooks: { status: "OK" | "DEGRADED" | "DOWN"; failureCount: number };
    appErrors: { count24h: number };
  };
}

export function AdminOverview() {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchOverview = useCallback(async () => {
    try {
      setIsLoading(true);
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      
      const response = await fetch("/api/admin/overview", {
        credentials: "include",
        headers,
      });
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch overview:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Overview"
        description="Platform executive health dashboard"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOverview}
            disabled={isLoading}
            className="h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Key Metrics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminStatCard
              label="Total Users"
              value={data?.totalUsers?.toLocaleString() || "—"}
              icon={Users}
            />
            <AdminStatCard
              label="Active Users (7d)"
              value={data?.activeUsers7d?.toLocaleString() || "—"}
              icon={Activity}
            />
            <AdminStatCard
              label="Total Pools"
              value={data?.totalPools?.toLocaleString() || "—"}
              icon={Layers}
            />
            <AdminStatCard
              label="Active Pools"
              value={data?.activePools?.toLocaleString() || "—"}
              icon={TrendingUp}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pools by Sport */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Pools by Sport
            </h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {isLoading || !data?.poolsBySport?.length ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {isLoading ? "Loading..." : "No pool data available"}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Sport
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.poolsBySport.map((item) => (
                      <tr key={item.sport}>
                        <td className="px-4 py-2.5 text-sm font-medium">
                          {item.sport || "Unknown"}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                          {item.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Subscription Breakdown */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Subscription Status
            </h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {isLoading || !data?.subscriptionBreakdown ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {isLoading ? "Loading..." : "No subscription data"}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Users
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-4 py-2.5 text-sm font-medium">Free</td>
                      <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                        {data.subscriptionBreakdown.free}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-sm font-medium">Trial</td>
                      <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                        {data.subscriptionBreakdown.trial}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-sm font-medium">Paid</td>
                      <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                        {data.subscriptionBreakdown.paid}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-sm font-medium">Expired</td>
                      <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                        {data.subscriptionBreakdown.expired}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* System Health */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            System Health
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AdminHealthIndicator
              label="Sports Data Feeds"
              status={data?.health?.sportsDataFeeds?.status || "OK"}
              detail={
                data?.health?.sportsDataFeeds?.delayedCount
                  ? `${data.health.sportsDataFeeds.delayedCount} delayed`
                  : undefined
              }
            />
            <AdminHealthIndicator
              label="Push Notifications"
              status={data?.health?.pushNotifications?.status || "OK"}
              detail={
                data?.health?.pushNotifications?.failureCount
                  ? `${data.health.pushNotifications.failureCount} failures`
                  : undefined
              }
            />
            <AdminHealthIndicator
              label="Escrow Webhooks"
              status={data?.health?.escrowWebhooks?.status || "OK"}
              detail={
                data?.health?.escrowWebhooks?.failureCount
                  ? `${data.health.escrowWebhooks.failureCount} failures`
                  : undefined
              }
            />
            <AdminHealthIndicator
              label="App Errors (24h)"
              status={
                (data?.health?.appErrors?.count24h || 0) > 50
                  ? "DEGRADED"
                  : (data?.health?.appErrors?.count24h || 0) > 100
                  ? "DOWN"
                  : "OK"
              }
              detail={data?.health?.appErrors?.count24h || 0}
            />
          </div>
        </section>

        {/* Footer */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Last refreshed: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}
