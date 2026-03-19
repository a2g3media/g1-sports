import { useEffect, useState, useMemo, useCallback } from "react";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/react-app/components/admin/AdminStatCard";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import {
  Users,
  Brain,
  Coins,
  Bell,
  ShieldOff,
  Cpu,
  RefreshCw,
  DollarSign,
  Zap,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";

// Types
interface TierMetric {
  tier: string;
  count: number;
  percentage: number;
}

interface AIMetric {
  tier: string;
  requests: number;
  avgTokens: number;
  estimatedCost: number;
}

interface PushMetric {
  tier: string;
  sent: number;
  suppressed: number;
  bundled: number;
  blockedByCaps: number;
  deliveryRate: number;
}

interface ConversionStep {
  from: string;
  to: string;
  count: number;
  rate: number;
}

interface RevenueMetric {
  tier: string;
  mrr: number;
  userCount: number;
  arpu: number;
}

interface HeavyUser {
  userId: string;
  email: string;
  tier: string;
  aiRequests24h: number;
  tokenUsage24h: number;
  estimatedCost: number;
}

interface MetricsData {
  usersByTier: TierMetric[];
  aiMetrics: AIMetric[];
  pushMetrics: PushMetric[];
  conversionFunnel: ConversionStep[];
  revenueByTier: RevenueMetric[];
  heavyUsers: HeavyUser[];
  totals: {
    totalUsers: number;
    activeUsers24h: number;
    totalAIRequests24h: number;
    totalPushSent24h: number;
    totalMRR: number;
    estimatedAICost24h: number;
  };
}

// Tier colors
const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-500",
  pool_access: "bg-blue-500",
  pro: "bg-emerald-500",
  elite: "bg-amber-500",
  admin: "bg-violet-500",
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pool_access: "Pool Access",
  pro: "Pro",
  elite: "Elite",
  admin: "Admin",
};

export function AdminMetrics() {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<"overview" | "ai" | "push" | "funnel">("overview");

  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";
      
      const response = await fetch("/api/admin/metrics", {
        credentials: "include",
        headers,
      });
      if (response.ok) {
        const result = await response.json();
        setData(result);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchMetrics();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Mock data for development
  const mockData = useMemo<MetricsData>(() => ({
    usersByTier: [
      { tier: "free", count: 1250, percentage: 62.5 },
      { tier: "pool_access", count: 380, percentage: 19 },
      { tier: "pro", count: 290, percentage: 14.5 },
      { tier: "elite", count: 75, percentage: 3.75 },
      { tier: "admin", count: 5, percentage: 0.25 },
    ],
    aiMetrics: [
      { tier: "free", requests: 1850, avgTokens: 450, estimatedCost: 8.32 },
      { tier: "pool_access", requests: 2200, avgTokens: 520, estimatedCost: 11.44 },
      { tier: "pro", requests: 4800, avgTokens: 680, estimatedCost: 32.64 },
      { tier: "elite", requests: 3200, avgTokens: 920, estimatedCost: 29.44 },
    ],
    pushMetrics: [
      { tier: "free", sent: 450, suppressed: 1200, bundled: 380, blockedByCaps: 820, deliveryRate: 94.2 },
      { tier: "pool_access", sent: 920, suppressed: 180, bundled: 450, blockedByCaps: 120, deliveryRate: 96.1 },
      { tier: "pro", sent: 2400, suppressed: 80, bundled: 680, blockedByCaps: 45, deliveryRate: 97.8 },
      { tier: "elite", sent: 1850, suppressed: 20, bundled: 420, blockedByCaps: 12, deliveryRate: 98.9 },
    ],
    conversionFunnel: [
      { from: "free", to: "pool_access", count: 45, rate: 3.6 },
      { from: "free", to: "pro", count: 28, rate: 2.24 },
      { from: "pool_access", to: "pro", count: 18, rate: 4.74 },
      { from: "pro", to: "elite", count: 12, rate: 4.14 },
    ],
    revenueByTier: [
      { tier: "pool_access", mrr: 316.67, userCount: 380, arpu: 0.83 },
      { tier: "pro", mrr: 8410, userCount: 290, arpu: 29 },
      { tier: "elite", mrr: 5925, userCount: 75, arpu: 79 },
    ],
    heavyUsers: [
      { userId: "u_123", email: "power@example.com", tier: "elite", aiRequests24h: 245, tokenUsage24h: 185000, estimatedCost: 4.62 },
      { userId: "u_456", email: "heavy@example.com", tier: "pro", aiRequests24h: 189, tokenUsage24h: 142000, estimatedCost: 3.55 },
      { userId: "u_789", email: "active@example.com", tier: "elite", aiRequests24h: 156, tokenUsage24h: 128000, estimatedCost: 3.20 },
    ],
    totals: {
      totalUsers: 2000,
      activeUsers24h: 680,
      totalAIRequests24h: 12050,
      totalPushSent24h: 5620,
      totalMRR: 14651.67,
      estimatedAICost24h: 81.84,
    },
  }), []);

  const displayData = data || mockData;

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Analytics & Metrics"
        description="Platform performance, costs, and conversion tracking"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMetrics}
            disabled={isLoading}
            className="h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Top-level KPIs */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Platform Overview (24h)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <AdminStatCard
              label="Total Users"
              value={displayData.totals.totalUsers.toLocaleString()}
              icon={Users}
            />
            <AdminStatCard
              label="Active (24h)"
              value={displayData.totals.activeUsers24h.toLocaleString()}
              icon={Zap}
            />
            <AdminStatCard
              label="AI Requests"
              value={displayData.totals.totalAIRequests24h.toLocaleString()}
              icon={Brain}
            />
            <AdminStatCard
              label="Push Sent"
              value={displayData.totals.totalPushSent24h.toLocaleString()}
              icon={Bell}
            />
            <AdminStatCard
              label="MRR"
              value={`$${displayData.totals.totalMRR.toLocaleString()}`}
              icon={DollarSign}
            />
            <AdminStatCard
              label="AI Cost (24h)"
              value={`$${displayData.totals.estimatedAICost24h.toFixed(2)}`}
              icon={Coins}
            />
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
          {[
            { id: "overview", label: "Users by Tier" },
            { id: "ai", label: "AI & Costs" },
            { id: "push", label: "Push Metrics" },
            { id: "funnel", label: "Conversion" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Users by Tier */}
        {activeTab === "overview" && (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Active Users by Tier
            </h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tier</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Users</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">%</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayData.usersByTier.map((tier) => (
                    <tr key={tier.tier}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-2.5 w-2.5 rounded-full", TIER_COLORS[tier.tier])} />
                          <span className="text-sm font-medium">{TIER_LABELS[tier.tier]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{tier.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">{tier.percentage}%</td>
                      <td className="px-4 py-3">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden w-32">
                          <div 
                            className={cn("h-full rounded-full", TIER_COLORS[tier.tier])}
                            style={{ width: `${tier.percentage}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* AI Cost Monitor */}
        {activeTab === "ai" && (
          <div className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                AI Usage by Tier (24h)
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tier</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Requests</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Avg Tokens</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Est. Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Cost/Request</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayData.aiMetrics.map((metric) => (
                      <tr key={metric.tier}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2.5 w-2.5 rounded-full", TIER_COLORS[metric.tier])} />
                            <span className="text-sm font-medium">{TIER_LABELS[metric.tier]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{metric.requests.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{metric.avgTokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums font-medium">${metric.estimatedCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                          ${(metric.estimatedCost / metric.requests).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Heavy Users */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Heavy Users (Top AI Consumers)
                </h2>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tier</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Requests (24h)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Tokens</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayData.heavyUsers.map((user) => (
                      <tr key={user.userId}>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium">{user.email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2 w-2 rounded-full", TIER_COLORS[user.tier])} />
                            <span className="text-sm">{TIER_LABELS[user.tier]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{user.aiRequests24h}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{user.tokenUsage24h.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-amber-500">
                          ${user.estimatedCost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* Push Metrics */}
        {activeTab === "push" && (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Push Notification Metrics (24h)
            </h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tier</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Sent</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Suppressed</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Bundled</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Blocked (Caps)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Delivery %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayData.pushMetrics.map((metric) => (
                    <tr key={metric.tier}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-2.5 w-2.5 rounded-full", TIER_COLORS[metric.tier])} />
                          <span className="text-sm font-medium">{TIER_LABELS[metric.tier]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{metric.sent.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-orange-500">{metric.suppressed.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-blue-500">{metric.bundled.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-red-500">{metric.blockedByCaps.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "text-sm tabular-nums font-medium",
                          metric.deliveryRate >= 97 ? "text-emerald-500" :
                          metric.deliveryRate >= 95 ? "text-amber-500" : "text-red-500"
                        )}>
                          {metric.deliveryRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Push Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-muted-foreground uppercase">Total Sent</span>
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {displayData.pushMetrics.reduce((sum, m) => sum + m.sent, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldOff className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground uppercase">Suppressed</span>
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {displayData.pushMetrics.reduce((sum, m) => sum + m.suppressed, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground uppercase">Bundled</span>
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {displayData.pushMetrics.reduce((sum, m) => sum + m.bundled, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground uppercase">Blocked</span>
                </div>
                <p className="text-2xl font-semibold tabular-nums">
                  {displayData.pushMetrics.reduce((sum, m) => sum + m.blockedByCaps, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Conversion Funnel */}
        {activeTab === "funnel" && (
          <div className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Conversion Funnel (30d)
              </h2>
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {displayData.conversionFunnel.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn("h-3 w-3 rounded-full", TIER_COLORS[step.from])} />
                          <span className="text-sm font-medium">{TIER_LABELS[step.from]}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="text-center mt-1">
                          <p className="text-lg font-semibold text-emerald-500">{step.count}</p>
                          <p className="text-xs text-muted-foreground">{step.rate}%</p>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn("h-3 w-3 rounded-full", TIER_COLORS[step.to])} />
                          <span className="text-sm font-medium">{TIER_LABELS[step.to]}</span>
                        </div>
                      </div>
                      {i < displayData.conversionFunnel.length - 1 && (
                        <div className="h-8 w-px bg-border mx-4" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Revenue by Tier */}
            <section className="space-y-4">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Revenue by Tier
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tier</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">MRR</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Users</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">ARPU</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayData.revenueByTier.map((rev) => (
                      <tr key={rev.tier}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2.5 w-2.5 rounded-full", TIER_COLORS[rev.tier])} />
                            <span className="text-sm font-medium">{TIER_LABELS[rev.tier]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-emerald-500">
                          ${rev.mrr.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{rev.userCount}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">${rev.arpu.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="bg-secondary/30">
                      <td className="px-4 py-3 text-sm font-semibold">Total</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-emerald-500">
                        ${displayData.totals.totalMRR.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold">
                        {displayData.revenueByTier.reduce((sum, r) => sum + r.userCount, 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Last refreshed: {lastRefresh.toLocaleTimeString()} • Auto-refreshes every 60s
          </p>
        </div>
      </div>
    </div>
  );
}
