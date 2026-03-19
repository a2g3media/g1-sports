
import { cn } from "@/react-app/lib/utils";

type StatusVariant =
  | "active"
  | "inactive"
  | "disabled"
  | "pending"
  | "draft"
  | "deprecated"
  | "paid"
  | "free"
  | "trial"
  | "expired"
  | "completed"
  | "failed"
  | "refunded";

interface AdminStatusBadgeProps {
  status: StatusVariant | string;
  className?: string;
}

const variantStyles: Record<StatusVariant, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  inactive: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  disabled: "bg-red-500/10 text-red-600 dark:text-red-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  draft: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  deprecated: "bg-red-500/10 text-red-600 dark:text-red-400",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  free: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  trial: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  expired: "bg-red-500/10 text-red-600 dark:text-red-400",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  refunded: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AdminStatusBadge({ status, className }: AdminStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as StatusVariant;
  const style = variantStyles[normalizedStatus] || variantStyles.inactive;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide",
        style,
        className
      )}
    >
      {status}
    </span>
  );
}
