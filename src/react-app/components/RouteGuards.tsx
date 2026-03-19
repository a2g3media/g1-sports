import { Navigate } from "react-router-dom";
import { useSuperAdmin } from "@/react-app/contexts/SuperAdminContext";
import { useImpersonation, type UserRole } from "@/react-app/contexts/ImpersonationContext";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Loader2 } from "lucide-react";
import { AccessDenied } from "@/react-app/components/AccessDenied";

interface RouteGuardProps {
  children: React.ReactNode;
  requiredRole: UserRole;
  fallbackPath?: string;
}

/**
 * SuperAdminRoute - Only accessible to super admins (real or via dev login)
 */
export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isLoading } = useSuperAdmin();
  const { effectiveRole } = useImpersonation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Check effectiveRole which includes dev login role
  if (effectiveRole !== "super_admin") {
    return (
      <AccessDenied
        title="Super Admin Access Required"
        description="This area requires Super Admin privileges. If you believe you should have access, please contact the platform administrator."
        requiredRole="super_admin"
        backTo="/"
      />
    );
  }

  return <>{children}</>;
}

/**
 * PoolAdminRoute - Accessible to pool admins and super admins
 * When impersonating as pool_admin, allows access
 * Demo mode users also get access for testing
 */
export function PoolAdminRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, isLoading } = useSuperAdmin();
  const { effectiveRole, isImpersonating } = useImpersonation();
  const { isDemoMode } = useDemoAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Demo mode users get pool admin access for testing
  // Super admins can access (unless impersonating as regular user)
  const hasAccess = 
    isDemoMode ||
    (isSuperAdmin && !isImpersonating) || 
    effectiveRole === "pool_admin" || 
    effectiveRole === "super_admin";

  if (!hasAccess) {
    return (
      <AccessDenied
        title="Pool Admin Access Required"
        description="This area is only accessible to Pool Administrators. You need to be an admin of at least one pool to access this area."
        requiredRole="pool_admin"
        backTo="/pools"
      />
    );
  }

  return <>{children}</>;
}

/**
 * RoleBasedRoute - Generic route guard for any role requirement
 */
export function RoleBasedRoute({ children, requiredRole, fallbackPath = "/" }: RouteGuardProps) {
  const { isSuperAdmin: _isSuperAdmin, isLoading } = useSuperAdmin();
  const { effectiveRole } = useImpersonation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Role hierarchy: super_admin > pool_admin > user
  const roleHierarchy: Record<UserRole, number> = {
    user: 0,
    pool_admin: 1,
    super_admin: 2,
  };

  const hasAccess = roleHierarchy[effectiveRole] >= roleHierarchy[requiredRole];

  if (!hasAccess) {
    return <Navigate to={fallbackPath} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
