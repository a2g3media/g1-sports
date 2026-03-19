import { useState, useEffect } from "react";
import { Activity, ChevronRight, Zap, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";
import { Link } from "react-router-dom";

interface FreshnessStatus {
  healthScore: number;
  live: number;
  fresh: number;
  warning: number;
  stale: number;
  critical: number;
  total: number;
}

export function GlobalFreshnessIndicator({ className }: { className?: string }) {
  const [status, setStatus] = useState<FreshnessStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/freshness/status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setStatus(data.data.summary);
          }
        }
      } catch {
        // Silently fail for background indicator
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    // Refresh every 60 seconds
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !status) return null;

  const getStatusConfig = (score: number) => {
    if (score >= 90) return { 
      color: "text-green-500", 
      bg: "bg-green-500/10", 
      border: "border-green-500/30",
      label: "Excellent",
      icon: Zap
    };
    if (score >= 70) return { 
      color: "text-blue-500", 
      bg: "bg-blue-500/10", 
      border: "border-blue-500/30",
      label: "Good",
      icon: Activity
    };
    if (score >= 50) return { 
      color: "text-amber-500", 
      bg: "bg-amber-500/10", 
      border: "border-amber-500/30",
      label: "Fair",
      icon: Clock
    };
    return { 
      color: "text-red-500", 
      bg: "bg-red-500/10", 
      border: "border-red-500/30",
      label: "Poor",
      icon: AlertTriangle
    };
  };

  const config = getStatusConfig(status.healthScore);
  const Icon = config.icon;
  const hasIssues = status.critical > 0 || status.stale > 0;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Link
            to="/admin/scout-qa"
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              "border transition-all hover:scale-105",
              config.bg,
              config.border,
              config.color,
              hasIssues && "animate-pulse",
              className
            )}
          >
            {status.healthScore >= 90 ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
            ) : (
              <Icon className="w-3 h-3" />
            )}
            <span className="tabular-nums font-semibold">{status.healthScore}</span>
            <ChevronRight className="w-3 h-3 opacity-50" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="w-64">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Data Health</span>
              <span className={cn("font-bold", config.color)}>
                {config.label} ({status.healthScore}%)
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-green-500/10">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Live</span>
                <span className="ml-auto font-medium">{status.live}</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-500/10">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">Fresh</span>
                <span className="ml-auto font-medium">{status.fresh}</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-500/10">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Warning</span>
                <span className="ml-auto font-medium">{status.warning}</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Critical</span>
                <span className="ml-auto font-medium">{status.critical}</span>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground text-center pt-1 border-t border-border/50">
              Click to view full freshness dashboard
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compact version for tight spaces
export function CompactFreshnessIndicator({ className }: { className?: string }) {
  const [healthScore, setHealthScore] = useState<number | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/freshness/status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setHealthScore(data.data.summary.healthScore);
          }
        }
      } catch {
        // Silently fail
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (healthScore === null) return null;

  const getColor = (score: number) => {
    if (score >= 90) return "bg-green-500";
    if (score >= 70) return "bg-blue-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1", className)}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              getColor(healthScore),
              healthScore >= 90 && "animate-pulse"
            )} />
            <span className="text-[10px] text-muted-foreground tabular-nums">{healthScore}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Data health: {healthScore}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
