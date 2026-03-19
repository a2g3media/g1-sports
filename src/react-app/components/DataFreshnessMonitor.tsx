import { useState, useEffect, useCallback } from "react";
import { 
  Activity, 
  Database, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";

interface FreshnessSource {
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

interface FreshnessSummary {
  total: number;
  live: number;
  fresh: number;
  warning: number;
  stale: number;
  critical: number;
  unknown: number;
  healthScore: number;
}

interface FreshnessAlert {
  id: number;
  sourceKey: string;
  alertType: string;
  severity: "info" | "warning" | "critical";
  headline: string;
  details?: string;
  isResolved: boolean;
  createdAt: string;
}

interface FreshnessData {
  sources: FreshnessSource[];
  summary: FreshnessSummary;
  newAlerts: FreshnessAlert[];
  monitoredCount: number;
  checkedAt: string;
}

// Status badge component with enhanced visuals
function StatusBadge({ status }: { status: FreshnessSource["status"] }) {
  const config = {
    live: { icon: Zap, color: "bg-green-500", textColor: "text-green-500", label: "Live", glow: "shadow-green-500/30" },
    fresh: { icon: CheckCircle, color: "bg-blue-500", textColor: "text-blue-500", label: "Fresh", glow: "shadow-blue-500/20" },
    warning: { icon: Clock, color: "bg-amber-500", textColor: "text-amber-500", label: "Warning", glow: "shadow-amber-500/20" },
    stale: { icon: AlertTriangle, color: "bg-orange-500", textColor: "text-orange-500", label: "Stale", glow: "shadow-orange-500/20" },
    critical: { icon: AlertTriangle, color: "bg-red-500", textColor: "text-red-500", label: "Critical", glow: "shadow-red-500/30" },
    unknown: { icon: Info, color: "bg-gray-500", textColor: "text-gray-500", label: "Unknown", glow: "" },
  };
  
  const { icon: Icon, color, textColor, label, glow } = config[status];
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
      `${textColor}`,
      status === "live" && "bg-green-500/15 shadow-sm",
      status === "fresh" && "bg-blue-500/10",
      status === "warning" && "bg-amber-500/10",
      status === "stale" && "bg-orange-500/10",
      status === "critical" && "bg-red-500/15 animate-pulse shadow-sm",
      status === "unknown" && "bg-gray-500/10",
      glow
    )}>
      {status === "live" ? (
        <span className="relative flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", color)} />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
        </span>
      ) : (
        <span className={cn("w-2 h-2 rounded-full", color)} />
      )}
      <Icon className="w-3.5 h-3.5" />
      <span className="font-semibold tracking-wide">{label}</span>
    </span>
  );
}

// Health score gauge with animated ring
function HealthGauge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 90) return "text-green-500";
    if (s >= 70) return "text-blue-500";
    if (s >= 50) return "text-amber-500";
    if (s >= 30) return "text-orange-500";
    return "text-red-500";
  };
  
  const getGradient = (s: number) => {
    if (s >= 90) return "from-green-500 to-emerald-500";
    if (s >= 70) return "from-blue-500 to-cyan-500";
    if (s >= 50) return "from-amber-500 to-yellow-500";
    if (s >= 30) return "from-orange-500 to-amber-500";
    return "from-red-500 to-rose-500";
  };

  const getStrokeColor = (s: number) => {
    if (s >= 90) return "#22c55e";
    if (s >= 70) return "#3b82f6";
    if (s >= 50) return "#f59e0b";
    if (s >= 30) return "#f97316";
    return "#ef4444";
  };

  // SVG circle properties
  const size = 96;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  return (
    <div className="relative flex items-center justify-center">
      <div className="relative w-24 h-24">
        {/* Background circle */}
        <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {/* Animated progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getStrokeColor(score)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${getStrokeColor(score)}40)` }}
          />
        </svg>
        
        {/* Glow effect */}
        <div 
          className={cn(
            "absolute inset-3 rounded-full bg-gradient-to-br opacity-15 blur-sm",
            getGradient(score)
          )} 
        />
        
        {/* Score display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={cn("text-3xl font-bold tabular-nums", getColor(score))}>
              {score}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Health
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Summary stat card
function StatCard({ label, value, icon: Icon, variant }: { 
  label: string; 
  value: number; 
  icon: React.ElementType;
  variant: "success" | "info" | "warning" | "danger" | "muted";
}) {
  const colors = {
    success: "text-green-500 bg-green-500/10",
    info: "text-blue-500 bg-blue-500/10",
    warning: "text-amber-500 bg-amber-500/10",
    danger: "text-red-500 bg-red-500/10",
    muted: "text-muted-foreground bg-muted/50",
  };
  
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg",
      colors[variant]
    )}>
      <Icon className="w-5 h-5" />
      <div>
        <div className="text-lg font-semibold">{value}</div>
        <div className="text-xs opacity-70">{label}</div>
      </div>
    </div>
  );
}

// Alert item component
function AlertItem({ 
  alert, 
  onResolve 
}: { 
  alert: FreshnessAlert; 
  onResolve: (id: number) => void;
}) {
  const severityConfig = {
    info: { icon: Info, color: "border-blue-500/30 bg-blue-500/5" },
    warning: { icon: AlertTriangle, color: "border-amber-500/30 bg-amber-500/5" },
    critical: { icon: AlertTriangle, color: "border-red-500/30 bg-red-500/5 animate-pulse" },
  };
  
  const { icon: Icon, color } = severityConfig[alert.severity];
  
  return (
    <div className={cn("border rounded-lg p-3 flex items-start gap-3", color)}>
      <Icon className={cn(
        "w-5 h-5 mt-0.5 shrink-0",
        alert.severity === "critical" ? "text-red-500" : 
        alert.severity === "warning" ? "text-amber-500" : "text-blue-500"
      )} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground">{alert.headline}</div>
        {alert.details && (
          <div className="text-xs text-muted-foreground mt-1">{alert.details}</div>
        )}
        <div className="text-[10px] text-muted-foreground/60 mt-2">
          {new Date(alert.createdAt).toLocaleString()}
        </div>
      </div>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => onResolve(alert.id)}
        className="shrink-0 h-8 px-2 text-xs"
      >
        Resolve
      </Button>
    </div>
  );
}

// Source row component with improved layout
function SourceRow({ source }: { source: FreshnessSource }) {
  const formatAge = (minutes: number | null) => {
    if (minutes === null) return "Unknown";
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  };

  const getAgeColor = (minutes: number | null) => {
    if (minutes === null) return "text-muted-foreground";
    if (minutes < 5) return "text-green-500";
    if (minutes < 30) return "text-blue-500";
    if (minutes < 60) return "text-amber-500";
    return "text-orange-500";
  };
  
  return (
    <div className={cn(
      "group flex items-center justify-between py-3 px-4 rounded-xl",
      "bg-gradient-to-r from-muted/40 to-muted/20 hover:from-muted/60 hover:to-muted/40",
      "border border-transparent hover:border-border/50 transition-all duration-200",
      source.isCritical && source.status === "critical" && "from-red-500/10 to-red-500/5 border-red-500/30 hover:border-red-500/50"
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
          source.status === "live" ? "bg-green-500/10 text-green-500" :
          source.status === "fresh" ? "bg-blue-500/10 text-blue-500" :
          source.status === "critical" ? "bg-red-500/10 text-red-500" :
          "bg-muted text-muted-foreground"
        )}>
          <Database className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{source.sourceName}</span>
            {source.isCritical && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wide">
                Critical
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="tabular-nums">{source.recordCount.toLocaleString()} records</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>{source.category}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className={cn(
            "text-xs font-medium tabular-nums flex items-center gap-1",
            getAgeColor(source.ageMinutes)
          )}>
            <Clock className="w-3 h-3" />
            {formatAge(source.ageMinutes)}
          </div>
        </div>
        <StatusBadge status={source.status} />
      </div>
    </div>
  );
}

export function DataFreshnessMonitor() {
  const [data, setData] = useState<FreshnessData | null>(null);
  const [alerts, setAlerts] = useState<FreshnessAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllSources, setShowAllSources] = useState(false);
  
  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      
      const [statusRes, alertsRes] = await Promise.all([
        fetch("/api/freshness/status", { credentials: "include" }),
        fetch("/api/freshness/alerts", { credentials: "include" }),
      ]);
      
      if (!statusRes.ok || !alertsRes.ok) {
        throw new Error("Failed to fetch freshness data");
      }
      
      const statusData = await statusRes.json();
      const alertsData = await alertsRes.json();
      
      if (statusData.success) {
        setData(statusData.data);
      }
      if (alertsData.success) {
        setAlerts(alertsData.data.alerts || []);
      }
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);
  
  const handleResolveAlert = async (alertId: number) => {
    try {
      const res = await fetch(`/api/freshness/alerts/${alertId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolvedBy: "manual" }),
      });
      
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      }
    } catch (err) {
      console.error("Failed to resolve alert:", err);
    }
  };
  
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
          <span className="ml-2 text-muted-foreground">Loading freshness data...</span>
        </div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <div className="text-sm text-muted-foreground mb-4">
            {error || "Failed to load freshness data"}
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  const { sources, summary } = data;
  const criticalSources = sources.filter(s => s.isCritical);
  const nonCriticalSources = sources.filter(s => !s.isCritical);
  const displaySources = showAllSources ? sources : criticalSources;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Data Freshness Monitor
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoring {summary.total} Scout data sources
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>
      
      {/* Health Overview */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <HealthGauge score={summary.healthScore} />
          
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Live" value={summary.live} icon={Zap} variant="success" />
            <StatCard label="Fresh" value={summary.fresh} icon={CheckCircle} variant="info" />
            <StatCard label="Warning" value={summary.warning} icon={Clock} variant="warning" />
            <StatCard label="Stale" value={summary.stale} icon={AlertTriangle} variant="warning" />
            <StatCard label="Critical" value={summary.critical} icon={AlertTriangle} variant="danger" />
            <StatCard label="Unknown" value={summary.unknown} icon={Info} variant="muted" />
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground text-center">
          Last checked: {new Date(data.checkedAt).toLocaleString()}
        </div>
      </div>
      
      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-amber-500" />
            <h3 className="font-medium">Active Alerts ({alerts.length})</h3>
          </div>
          <div className="space-y-3">
            {alerts.map(alert => (
              <AlertItem 
                key={alert.id} 
                alert={alert} 
                onResolve={handleResolveAlert}
              />
            ))}
          </div>
        </div>
      )}
      
      {alerts.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <BellOff className="w-5 h-5" />
          <span>No active alerts. All monitored sources are within thresholds.</span>
        </div>
      )}
      
      {/* Data Sources */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2">
            <Database className="w-5 h-5 text-muted-foreground" />
            {showAllSources ? "All Sources" : "Critical Sources"}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllSources(!showAllSources)}
            className="text-xs"
          >
            {showAllSources ? (
              <>
                Show Critical Only
                <ChevronUp className="w-4 h-4 ml-1" />
              </>
            ) : (
              <>
                Show All ({nonCriticalSources.length} more)
                <ChevronDown className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
        
        <div className="space-y-2">
          {displaySources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No {showAllSources ? "" : "critical "}sources to display
            </div>
          ) : (
            displaySources.map(source => (
              <SourceRow key={source.sourceKey} source={source} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
