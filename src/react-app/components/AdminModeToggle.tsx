import { useAdminMode } from "@/react-app/contexts/AdminModeContext";
import { Switch } from "@/react-app/components/ui/switch";
import { Shield, Lock, Crown, Sparkles } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { UpgradeModal } from "./UpgradeModal";

interface AdminModeToggleProps {
  variant?: "full" | "compact" | "minimal";
  className?: string;
}

export function AdminModeToggle({ variant = "full", className }: AdminModeToggleProps) {
  const { 
    isAdminMode, 
    hasAdminSubscription, 
    toggleAdminMode,
    isUpgradeModalOpen,
    closeUpgradeModal,
    simulateUpgrade: _simulateUpgrade
  } = useAdminMode();

  // Render upgrade modal at top level
  const upgradeModal = (
    <UpgradeModal 
      open={isUpgradeModalOpen} 
      onOpenChange={closeUpgradeModal}
      currentTier="FREE"
    />
  );

  if (!hasAdminSubscription) {
    // Show locked state with upgrade prompt
    if (variant === "minimal") {
      return (
        <>
          <button
            onClick={toggleAdminMode}
            className={cn("flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors", className)}
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="text-xs">Admin</span>
          </button>
          {upgradeModal}
        </>
      );
    }
    
    if (variant === "compact") {
      return (
        <>
          <button
            onClick={toggleAdminMode}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-xs font-medium group",
              "bg-gradient-to-r from-amber-100/50 to-orange-100/50 dark:from-amber-900/20 dark:to-orange-900/20",
              "hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-900/30 dark:hover:to-orange-900/30",
              "border border-amber-200/50 dark:border-amber-800/50",
              className
            )}
          >
            <Lock className="h-3.5 w-3.5 text-amber-600/70 dark:text-amber-400/70" />
            <span className="text-amber-700/70 dark:text-amber-300/70">Admin</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/20 text-amber-600 dark:text-amber-400">
              Pro
            </span>
          </button>
          {upgradeModal}
        </>
      );
    }
    
    // Full variant - locked card
    return (
      <>
        <button
          onClick={toggleAdminMode}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group",
            "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10",
            "hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-900/20 dark:hover:to-orange-900/20",
            "border border-amber-200/50 dark:border-amber-800/50",
            className
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Admin Mode</p>
              <Lock className="w-3 h-3 text-amber-600/60 dark:text-amber-400/60" />
            </div>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
              Unlock with Pro subscription
            </p>
          </div>
          <Sparkles className="w-4 h-4 text-amber-500/50 group-hover:text-amber-500 transition-colors" />
        </button>
        {upgradeModal}
      </>
    );
  }

  // Has subscription - show toggle
  if (variant === "minimal") {
    return (
      <button
        onClick={toggleAdminMode}
        className={cn(
          "flex items-center gap-1.5 transition-all text-xs font-medium",
          isAdminMode ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-foreground",
          className
        )}
      >
        <Shield className="h-3.5 w-3.5" />
        <span>Admin</span>
        {isAdminMode && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        onClick={toggleAdminMode}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-xs font-medium",
          isAdminMode 
            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300/50 dark:ring-amber-700/50" 
            : "text-muted-foreground hover:bg-secondary",
          className
        )}
      >
        <Shield className={cn("h-3.5 w-3.5", isAdminMode && "text-amber-600 dark:text-amber-400")} />
        <span>Admin</span>
        {isAdminMode && (
          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        )}
      </button>
    );
  }

  // Full variant with switch
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
      isAdminMode 
        ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 ring-1 ring-amber-200 dark:ring-amber-800" 
        : "bg-secondary/50 hover:bg-secondary/70",
      className
    )}>
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
        isAdminMode 
          ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20" 
          : "bg-muted"
      )}>
        <Shield className={cn(
          "w-5 h-5 transition-colors",
          isAdminMode ? "text-white" : "text-muted-foreground"
        )} />
      </div>
      <div className="flex-1">
        <p className={cn(
          "text-sm font-semibold transition-colors",
          isAdminMode ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        )}>
          Admin Mode
        </p>
        <p className="text-xs text-muted-foreground">
          {isAdminMode ? "Controls visible" : "Click to enable"}
        </p>
      </div>
      <Switch
        checked={isAdminMode}
        onCheckedChange={toggleAdminMode}
        className={cn(
          isAdminMode && "data-[state=checked]:bg-amber-500"
        )}
      />
    </div>
  );
}

/**
 * Indicator shown in header when Admin Mode is active
 */
export function AdminModeIndicator() {
  const { isAdminMode } = useAdminMode();
  
  if (!isAdminMode) return null;
  
  return (
    <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 z-[100] animate-pulse" />
  );
}

/**
 * Small inline indicator showing admin mode is active
 */
export function AdminModeChip({ className }: { className?: string }) {
  const { isAdminMode, disableAdminMode } = useAdminMode();
  
  if (!isAdminMode) return null;
  
  return (
    <button
      onClick={disableAdminMode}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
        "hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors",
        className
      )}
    >
      <Shield className="w-3 h-3" />
      Admin Mode
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
    </button>
  );
}
