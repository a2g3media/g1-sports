import { Suspense, ComponentType, lazy } from "react";
import { Loader2 } from "lucide-react";
import { RouteErrorBoundary } from "@/react-app/components/ErrorBoundary";
import { 
  DashboardSkeleton, 
  ScoresPageSkeleton,
  CommandCenterSkeleton,
  SettingsSkeleton,
  PoolListSkeleton,
  TableSkeleton,
  SkeletonBlock
} from "@/react-app/components/ui/skeletons";

// Generic loading fallback
function DefaultFallback() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Page-specific loading skeletons
function PageFallback({ skeleton }: { skeleton?: string }) {
  switch (skeleton) {
    case "dashboard":
      return (
        <div className="container mx-auto px-4 py-6">
          <DashboardSkeleton />
        </div>
      );
    case "scores":
      return <ScoresPageSkeleton />;
    case "command-center":
      return <CommandCenterSkeleton />;
    case "settings":
      return (
        <div className="container mx-auto px-4 py-6">
          <SettingsSkeleton />
        </div>
      );
    case "pools":
      return (
        <div className="container mx-auto px-4 py-6">
          <div className="mb-6">
            <SkeletonBlock className="h-8 w-32 mb-2" />
            <SkeletonBlock className="h-4 w-64" />
          </div>
          <PoolListSkeleton count={6} />
        </div>
      );
    case "table":
      return (
        <div className="container mx-auto px-4 py-6">
          <SkeletonBlock className="h-8 w-40 mb-6" />
          <TableSkeleton rows={10} columns={5} />
        </div>
      );
    case "form":
      return (
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <SkeletonBlock className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-32 w-full" />
            <SkeletonBlock className="h-10 w-32" />
          </div>
        </div>
      );
    case "detail":
      return (
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <SkeletonBlock className="h-6 w-6" />
            <SkeletonBlock className="h-8 w-64" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <SkeletonBlock className="h-48 w-full" />
              <SkeletonBlock className="h-32 w-full" />
            </div>
            <div className="space-y-4">
              <SkeletonBlock className="h-40 w-full" />
              <SkeletonBlock className="h-40 w-full" />
            </div>
          </div>
        </div>
      );
    case "admin":
      return (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-9 w-24" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <SkeletonBlock key={i} className="h-24 w-full" />
            ))}
          </div>
          <TableSkeleton rows={8} columns={6} />
        </div>
      );
    default:
      return <DefaultFallback />;
  }
}

// Suspense wrapper for lazy routes with error boundary
export function LazyRoute({ 
  children, 
  skeleton 
}: { 
  children: React.ReactNode;
  skeleton?: string;
}) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageFallback skeleton={skeleton} />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );
}

// Helper to create lazy component with named export
export function lazyLoad<T extends ComponentType<object>>(
  factory: () => Promise<{ default: T } | { [key: string]: T }>,
  exportName?: string
): React.LazyExoticComponent<T> {
  if (exportName) {
    return lazy(() =>
      factory().then((module) => ({
        default: (module as Record<string, T>)[exportName],
      }))
    );
  }
  return lazy(factory as () => Promise<{ default: T }>);
}

// Prefetch a lazy component (call on hover/focus for faster navigation)
export function prefetch(factory: () => Promise<unknown>): void {
  factory();
}
