import { useState } from "react";
import { useAdminMode } from "@/react-app/contexts/AdminModeContext";
import { 
  Settings, Users, Trophy, FileText, 
  ChevronRight, Shield, BarChart3, Lock,
  UserMinus, Crown
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";

interface InlineAdminControlsProps {
  leagueId: number;
  leagueName: string;
  onNavigate: (path: string) => void;
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Inline admin controls that appear on league cards/panels when Admin Mode is active
 */
export function InlineAdminControls({ 
  leagueId, 
  onNavigate, 
  variant = "compact",
  className 
}: InlineAdminControlsProps) {
  const { isAdminMode } = useAdminMode();
  
  if (!isAdminMode) return null;

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
              "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
              "hover:bg-amber-200 dark:hover:bg-amber-900/60",
              "ring-1 ring-amber-300/50 dark:ring-amber-700/50",
              className
            )}
          >
            <Shield className="w-3.5 h-3.5" />
            Admin
            <ChevronRight className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onNavigate(`/leagues/${leagueId}/admin`)}>
            <Settings className="w-4 h-4 mr-2" />
            League Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(`/leagues/${leagueId}/admin?tab=members`)}>
            <Users className="w-4 h-4 mr-2" />
            Manage Members
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(`/leagues/${leagueId}/standings`)}>
            <Trophy className="w-4 h-4 mr-2" />
            View Standings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onNavigate(`/leagues/${leagueId}/admin?tab=audit`)}>
            <FileText className="w-4 h-4 mr-2" />
            Audit Log
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Full variant - expanded inline controls
  return (
    <div className={cn(
      "p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
      className
    )}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Admin Controls</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button 
          onClick={() => onNavigate(`/leagues/${leagueId}/admin`)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-background/50 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
          Settings
        </button>
        <button 
          onClick={() => onNavigate(`/leagues/${leagueId}/admin?tab=members`)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-background/50 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Users className="w-4 h-4 text-muted-foreground" />
          Members
        </button>
        <button 
          onClick={() => onNavigate(`/leagues/${leagueId}/standings`)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-background/50 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          Standings
        </button>
        <button 
          onClick={() => onNavigate(`/leagues/${leagueId}/admin?tab=audit`)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-background/50 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <FileText className="w-4 h-4 text-muted-foreground" />
          Audit Log
        </button>
      </div>
    </div>
  );
}

/**
 * Member action controls - shown inline on member lists when Admin Mode is active
 */
interface MemberAdminActionsProps {
  memberId: number;
  memberName: string;
  currentRole: "owner" | "admin" | "member";
  onRoleChange: (newRole: "admin" | "member") => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function MemberAdminActions({
  memberName,
  currentRole,
  onRoleChange,
  onRemove,
  disabled
}: MemberAdminActionsProps) {
  const { isAdminMode } = useAdminMode();
  const [confirmRemove, setConfirmRemove] = useState(false);
  
  if (!isAdminMode || currentRole === "owner") return null;

  if (confirmRemove) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in">
        <span className="text-xs text-destructive">Remove {memberName}?</span>
        <button
          onClick={() => {
            onRemove();
            setConfirmRemove(false);
          }}
          disabled={disabled}
          className="px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirmRemove(false)}
          className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            disabled={disabled}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <Crown className={cn(
              "w-4 h-4",
              currentRole === "admin" ? "text-amber-500" : "text-muted-foreground"
            )} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem 
            onClick={() => onRoleChange("admin")}
            disabled={currentRole === "admin"}
          >
            <Crown className="w-4 h-4 mr-2 text-amber-500" />
            Make Admin
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onRoleChange("member")}
            disabled={currentRole === "member"}
          >
            <Users className="w-4 h-4 mr-2" />
            Make Member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <button
        onClick={() => setConfirmRemove(true)}
        disabled={disabled}
        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
      >
        <UserMinus className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Quick action floating button - appears in Admin Mode on relevant pages
 */
interface AdminQuickActionProps {
  actions: Array<{
    icon: typeof Settings;
    label: string;
    onClick: () => void;
    variant?: "default" | "warning" | "danger";
  }>;
  className?: string;
}

export function AdminQuickActions({ actions, className }: AdminQuickActionProps) {
  const { isAdminMode } = useAdminMode();
  
  if (!isAdminMode || actions.length === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-20 right-4 z-40 flex flex-col gap-2 items-end",
      "sm:bottom-6",
      className
    )}>
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all",
            "animate-in slide-in-from-right duration-300",
            action.variant === "danger" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            action.variant === "warning" && "bg-amber-500 text-white hover:bg-amber-600",
            !action.variant || action.variant === "default" 
              ? "bg-amber-100 dark:bg-amber-900/80 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900"
              : ""
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <action.icon className="w-4 h-4" />
          <span className="text-sm font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Admin mode banner shown at top of admin-controlled areas
 */
export function AdminModeBanner({ 
  message = "Admin Mode Active",
  className 
}: { 
  message?: string;
  className?: string;
}) {
  const { isAdminMode, disableAdminMode } = useAdminMode();
  
  if (!isAdminMode) return null;

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl",
      "bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30",
      "border border-amber-200 dark:border-amber-800",
      className
    )}>
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{message}</span>
      </div>
      <button
        onClick={disableAdminMode}
        className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
      >
        Exit
      </button>
    </div>
  );
}

/**
 * Locked feature overlay - shown on features that require admin subscription
 */
export function LockedFeatureOverlay({ 
  onUpgradeClick,
  feature = "This feature"
}: { 
  onUpgradeClick: () => void;
  feature?: string;
}) {
  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
      <div className="text-center p-6">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {feature} requires a Pro subscription
        </p>
        <button
          onClick={onUpgradeClick}
          className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}
