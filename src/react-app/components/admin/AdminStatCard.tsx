
import { cn } from "@/react-app/lib/utils";
import { LucideIcon } from "lucide-react";

interface AdminStatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function AdminStatCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
}: AdminStatCardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-4",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
          {trend && (
            <p
              className={cn(
                "text-xs font-medium mt-1",
                trend.isPositive ? "text-emerald-500" : "text-red-500"
              )}
            >
              {trend.isPositive ? "+" : ""}
              {trend.value}% from last period
            </p>
          )}
        </div>
        {Icon && (
          <div className="h-9 w-9 rounded-lg bg-secondary/80 flex items-center justify-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
