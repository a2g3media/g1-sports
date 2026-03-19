import { Loader2, AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/react-app/lib/utils";

interface LoadingStateProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingState({ 
  message = "Loading...", 
  className,
  size = "md" 
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "min-h-[200px]",
    md: "min-h-[400px]",
    lg: "min-h-[60vh]",
  };
  
  const iconSizes = {
    sm: "h-5 w-5",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  return (
    <div className={cn(
      "flex items-center justify-center",
      sizeClasses[size],
      className
    )}>
      <div className="flex flex-col items-center gap-4">
        <Loader2 className={cn("animate-spin text-primary", iconSizes[size])} />
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "network" | "auth";
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load the data. Please try again.",
  onRetry,
  retryLabel = "Try Again",
  className,
  size = "md",
  variant = "default",
}: ErrorStateProps) {
  const sizeClasses = {
    sm: "py-8",
    md: "py-12",
    lg: "py-16 min-h-[60vh]",
  };
  
  const iconSizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  const Icon = variant === "network" ? WifiOff : AlertCircle;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center px-4",
      sizeClasses[size],
      className
    )}>
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-4",
        variant === "default" && "bg-destructive/10",
        variant === "network" && "bg-amber-500/10",
        variant === "auth" && "bg-primary/10"
      )}>
        <Icon className={cn(
          iconSizes[size],
          variant === "default" && "text-destructive",
          variant === "network" && "text-amber-500",
          variant === "auth" && "text-primary"
        )} />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({ message, onRetry, className }: InlineErrorProps) {
  return (
    <div className={cn(
      "rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3",
      className
    )}>
      <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
      <p className="text-sm text-destructive flex-1">{message}</p>
      {onRetry && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onRetry}
          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn(
      "rounded-2xl border bg-card p-5 animate-pulse",
      className
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        </div>
        <div className="h-6 w-16 bg-muted rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
