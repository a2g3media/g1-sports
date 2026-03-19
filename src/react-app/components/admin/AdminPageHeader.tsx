import React from "react";
import { cn } from "@/react-app/lib/utils";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function AdminPageHeader({
  title,
  description,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        "min-h-16 px-4 sm:px-6 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground truncate sm:whitespace-normal">{description}</p>
        )}
      </div>
      {actions && <div className="w-full sm:w-auto flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}
