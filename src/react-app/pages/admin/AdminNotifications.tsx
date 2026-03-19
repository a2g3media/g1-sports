import { useEffect, useState, useCallback } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/react-app/components/admin/AdminStatCard";
import { AdminStatusBadge } from "@/react-app/components/admin/AdminStatusBadge";
import { Button } from "@/react-app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import {
  Loader2,
  Bell,
  CheckCircle,
  XCircle,
  TrendingUp,
  Mail,
  Smartphone,
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  Clock,
  User,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface ChannelStats {
  channel: string;
  total: number;
  sent: number;
  failed: number;
  rate: number;
}

interface FailedDelivery {
  id: number;
  user_id: string;
  channel: string;
  notification_type: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
  user_email: string | null;
}

interface NotificationsHealthData {
  summary: {
    totalSent: number;
    totalFailed: number;
    deliveryRate: number;
  };
  channelBreakdown: ChannelStats[];
  recentFailures: FailedDelivery[];
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  push: <Smartphone className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  in_app: <Bell className="h-4 w-4" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  push: "Push",
  sms: "SMS",
  in_app: "In-App",
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function AdminNotifications() {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<NotificationsHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState<FailedDelivery | null>(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);

      const response = await fetch("/api/admin/notifications-health", {
        credentials: "include",
        headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch notifications health:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getHealthStatus = () => {
    if (!data) return { status: "unknown", color: "bg-slate-500" };
    const rate = data.summary.deliveryRate;
    if (rate >= 99) return { status: "Excellent", color: "bg-emerald-500" };
    if (rate >= 95) return { status: "Good", color: "bg-emerald-400" };
    if (rate >= 90) return { status: "Fair", color: "bg-amber-500" };
    return { status: "Poor", color: "bg-red-500" };
  };

  const healthStatus = getHealthStatus();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Notifications Health"
        description="Delivery statistics and failure tracking (7-day window)"
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
        {/* Overall Health Banner */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", healthStatus.color)}>
              <Bell className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overall Health</p>
              <p className="text-xl font-semibold">{healthStatus.status}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">
              {data?.summary.deliveryRate || 0}%
            </p>
            <p className="text-sm text-muted-foreground">Delivery Rate</p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            label="Total Sent"
            value={data?.summary.totalSent.toLocaleString() || "0"}
            icon={CheckCircle}
          />
          <AdminStatCard
            label="Total Failed"
            value={data?.summary.totalFailed.toLocaleString() || "0"}
            icon={XCircle}
            className={data?.summary.totalFailed ? "border-red-500/30" : ""}
          />
          <AdminStatCard
            label="Delivery Rate"
            value={`${data?.summary.deliveryRate || 0}%`}
            icon={TrendingUp}
          />
          <AdminStatCard
            label="Channels Active"
            value={data?.channelBreakdown.length || 0}
            icon={Bell}
          />
        </div>

        {/* Channel Breakdown */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-medium">Channel Performance</h3>
          </div>
          
          {data?.channelBreakdown.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No notification data available yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data?.channelBreakdown.map((channel) => (
                <div key={channel.channel} className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center text-muted-foreground">
                      {CHANNEL_ICONS[channel.channel] || <Bell className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {CHANNEL_LABELS[channel.channel] || channel.channel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {channel.total.toLocaleString()} total
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium text-emerald-500 tabular-nums">
                        {channel.sent.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Delivered</p>
                    </div>
                    
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-medium tabular-nums",
                        channel.failed > 0 ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {channel.failed.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                    
                    <div className="w-24 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden max-w-[60px]">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              channel.rate >= 95 ? "bg-emerald-500" :
                              channel.rate >= 90 ? "bg-amber-500" : "bg-red-500"
                            )}
                            style={{ width: `${channel.rate}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium tabular-nums w-12">
                          {channel.rate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Failures */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Recent Failures (24h)
            </h3>
            {data?.recentFailures && data.recentFailures.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {data.recentFailures.length} failure{data.recentFailures.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          
          {!data?.recentFailures || data.recentFailures.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium">No failures in the last 24 hours</p>
              <p className="text-xs text-muted-foreground mt-1">
                All notifications are being delivered successfully.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.recentFailures.map((failure) => (
                <div
                  key={failure.id}
                  className="px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer flex items-center justify-between"
                  onClick={() => setSelectedFailure(failure)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <XCircle className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {failure.user_email || `User ${failure.user_id}`}
                        </span>
                        <AdminStatusBadge status={failure.channel} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {failure.error_message || "Unknown error"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(failure.failed_at || failure.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Failure Detail Dialog */}
      <Dialog open={!!selectedFailure} onOpenChange={() => setSelectedFailure(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Delivery Failure #{selectedFailure?.id}
            </DialogTitle>
          </DialogHeader>

          {selectedFailure && (
            <div className="space-y-6 py-4">
              {/* Error Banner */}
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {selectedFailure.error_message || "No error message recorded"}
                </p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">User</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium truncate">
                      {selectedFailure.user_email || selectedFailure.user_id}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Channel</p>
                  <div className="flex items-center gap-2">
                    {CHANNEL_ICONS[selectedFailure.channel] || <Bell className="h-4 w-4 text-muted-foreground" />}
                    <p className="text-sm font-medium capitalize">
                      {CHANNEL_LABELS[selectedFailure.channel] || selectedFailure.channel}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Notification Type</p>
                  <p className="text-sm font-medium">
                    {selectedFailure.notification_type || "—"}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <AdminStatusBadge status={selectedFailure.status} />
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Timeline</p>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">Created</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(selectedFailure.created_at)}
                      </p>
                    </div>
                  </div>

                  {selectedFailure.sent_at && (
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Bell className="h-3 w-3 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">Sent</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(selectedFailure.sent_at)}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedFailure.failed_at && (
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-red-500/10 flex items-center justify-center">
                        <XCircle className="h-3 w-3 text-red-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(selectedFailure.failed_at)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
