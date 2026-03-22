import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useImpersonation, type UserRole } from "@/react-app/contexts/ImpersonationContext";
import {
  LayoutDashboard,
  Users,
  Layers,
  Settings,
  ChevronLeft,
  Shield,
  Loader2,
  Bell,
  History,
  DollarSign,
  ShieldAlert,
  Wallet,
  BookOpen,
  RefreshCw,
  Package,
  Gavel,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { ThemeToggle } from "@/react-app/components/ThemeToggle";
import { ImpersonationBanner, ImpersonationSpacer } from "@/react-app/components/ImpersonationBanner";
import { AccessDenied } from "@/react-app/components/AccessDenied";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/pool-admin", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "My Pools", path: "/pool-admin/pools", icon: <Layers className="h-4 w-4" /> },
  { label: "Members", path: "/pool-admin/members", icon: <Users className="h-4 w-4" /> },
  { label: "Approvals", path: "/pool-admin/approvals", icon: <ShieldAlert className="h-4 w-4" /> },
  { label: "Payments", path: "/pool-admin/payments", icon: <DollarSign className="h-4 w-4" /> },
  { label: "Notifications", path: "/pool-admin/notifications", icon: <Bell className="h-4 w-4" /> },
  { label: "Activity Log", path: "/pool-admin/activity", icon: <History className="h-4 w-4" /> },
  { label: "Payouts", path: "/pool-admin/payouts", icon: <Wallet className="h-4 w-4" /> },
  { label: "Rule Config", path: "/pool-admin/rule-config", icon: <BookOpen className="h-4 w-4" /> },
  { label: "Recalculation", path: "/pool-admin/recalculation", icon: <RefreshCw className="h-4 w-4" /> },
  { label: "Bundles", path: "/pool-admin/bundles", icon: <Package className="h-4 w-4" /> },
  { label: "Calcutta", path: "/pool-admin/calcutta", icon: <Gavel className="h-4 w-4" /> },
  { label: "Settings", path: "/pool-admin/settings", icon: <Settings className="h-4 w-4" /> },
];

function PoolAdminSidebar() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="mr-2 h-8 w-8 p-0"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">Pool Admin</h1>
            <p className="text-xs text-muted-foreground">Manage Your Pools</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/pool-admin"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "hover:bg-secondary/80",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {user?.email?.charAt(0).toUpperCase() || "P"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">
                {user?.email?.split("@")[0] || "Pool Admin"}
              </p>
              <p className="text-[10px] text-muted-foreground">pool_admin</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function PoolAdminAccessDenied() {
  return (
    <AccessDenied
      title="Pool Admin Access Required"
      description="You do not have permission to access the Pool Admin area. This area is for pool administrators who manage one or more pools."
      requiredRole="pool_admin"
      backTo="/"
    />
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Verifying access...</p>
      </div>
    </div>
  );
}

/**
 * Check if user has pool admin access
 * - Demo mode users always have access for testing
 * - Super admins always have access
 * - Pool admins have access
 * - Regular users do not have access (unless impersonating)
 */
function usePoolAdminAccess() {
  const { user, isPending, isDemoMode } = useDemoAuth();
  const { effectiveRole } = useImpersonation();
  
  // Demo mode users get full access for testing
  // In production, this would check actual pool ownership/admin status
  const allowedRoles: UserRole[] = ["super_admin", "pool_admin"];
  const hasAccess = isDemoMode || allowedRoles.includes(effectiveRole);
  
  return {
    hasAccess,
    isLoading: isPending,
    user,
    effectiveRole,
  };
}

export function PoolAdminLayout() {
  const { hasAccess, isLoading } = usePoolAdminAccess();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!hasAccess) {
    return <PoolAdminAccessDenied />;
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <ImpersonationSpacer />
      <PoolAdminSidebar />
      <main className="pl-64">
        <div className="min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
