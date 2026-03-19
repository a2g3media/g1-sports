import React from "react";
import { cn } from "@/react-app/lib/utils";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

type HealthStatus = "OK" | "DEGRADED" | "DOWN";

interface AdminHealthIndicatorProps {
  label: string;
  status: HealthStatus;
  detail?: string | number;
  className?: string;
}

const statusConfig: Record<
  HealthStatus,
  { icon: React.ReactNode; color: string; bgColor: string }
> = {
  OK: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  DEGRADED: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  DOWN: {
    icon: <XCircle className="h-4 w-4" />,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

export function AdminHealthIndicator({
  label,
  status,
  detail,
  className,
}: AdminHealthIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", config.bgColor, config.color)}>
          {config.icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {detail !== undefined && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {detail}
          </span>
        )}
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded",
            config.bgColor,
            config.color
          )}
        >
          {status}
        </span>
      </div>
    </div>
  );
}
