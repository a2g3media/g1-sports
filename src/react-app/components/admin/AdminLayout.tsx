import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/react-app/contexts/SuperAdminContext";
import { useImpersonation } from "@/react-app/contexts/ImpersonationContext";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { ImpersonationBanner, ImpersonationSpacer } from "@/react-app/components/ImpersonationBanner";
import {
  LayoutDashboard,
  Users,
  Layers,
  Library,
  Wallet,
  Bell,
  History,
  Sparkles,
  Megaphone,
  Settings,
  ChevronLeft,
  Shield,
  Loader2,
  AlertTriangle,
  Bot,
  BarChart3,
  Wrench,
  Flag,
  RefreshCw,
  Activity,
  Radio,
  Video,
} from "lucide-react";
import { ViewAsRoleSwitcher } from "./ViewAsRoleSwitcher";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import { ThemeToggle } from "@/react-app/components/ThemeToggle";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Overview", path: "/admin", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Analytics", path: "/admin/metrics", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Users", path: "/admin/users", icon: <Users className="h-4 w-4" /> },
  { label: "Pools", path: "/admin/pools", icon: <Layers className="h-4 w-4" /> },
  { label: "Pool Type Library", path: "/admin/pool-types", icon: <Library className="h-4 w-4" /> },
  { label: "Payments & Ledger", path: "/admin/ledger", icon: <Wallet className="h-4 w-4" /> },
  { label: "Notifications Health", path: "/admin/notifications", icon: <Bell className="h-4 w-4" /> },
  { label: "Audit Timeline", path: "/admin/audit", icon: <History className="h-4 w-4" /> },
  { label: "AI Insights", path: "/admin/ai-insights", icon: <Sparkles className="h-4 w-4" /> },
  { label: "Coach G QA", path: "/admin/coach-qa", icon: <Bot className="h-4 w-4" /> },
  { label: "Marketing", path: "/admin/marketing", icon: <Megaphone className="h-4 w-4" /> },
  { label: "Developer Tools", path: "/admin/developer-tools", icon: <Wrench className="h-4 w-4" /> },
  { label: "Feature Flags", path: "/admin/feature-flags", icon: <Flag className="h-4 w-4" /> },
  { label: "Data Providers", path: "/admin/providers", icon: <Radio className="h-4 w-4" /> },
  { label: "Sports Data Engine", path: "/admin/sports-data", icon: <RefreshCw className="h-4 w-4" /> },
  { label: "API Health Check", path: "/admin/api-health", icon: <Activity className="h-4 w-4" /> },
  { label: "Coach G Video Ops", path: "/admin/video-ops", icon: <Video className="h-4 w-4" /> },
  { label: "Settings", path: "/admin/settings", icon: <Settings className="h-4 w-4" /> },
];

function AdminSidebar() {
  const navigate = useNavigate();
  const { platformUser } = useSuperAdmin();

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
          <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Control Plane</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/admin"}
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
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {platformUser?.email?.charAt(0).toUpperCase() || "A"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">
                {platformUser?.display_name || platformUser?.email?.split("@")[0] || "Admin"}
              </p>
              <p className="text-[10px] text-muted-foreground">super_admin</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-sm text-muted-foreground mb-6">
            You do not have permission to access the Super Admin area.
            This area is restricted to platform administrators only.
          </p>
          <Button onClick={() => navigate("/")} className="w-full">
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
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

export function AdminLayout() {
  const { isLoading, isSuperAdmin } = useSuperAdmin();
  const { effectiveRole } = useImpersonation();
  const { isDemoMode } = useDemoAuth();

  if (isLoading) {
    return <LoadingState />;
  }

  // Allow demo mode OR super_admin role access
  if (!isDemoMode && effectiveRole !== "super_admin" && !isSuperAdmin) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <ImpersonationSpacer />
      <AdminSidebar />
      <main className="pl-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex h-full items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Platform Administration
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <ViewAsRoleSwitcher />
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => window.location.reload()}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <div className="min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
