import { useImpersonation } from "@/react-app/contexts/ImpersonationContext";
import { UserCog, X } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";

/**
 * ImpersonationBanner - Shows when super admin is viewing as another user/role
 * Displays at the top of the screen with a button to exit impersonation
 */
export function ImpersonationBanner() {
  const { isImpersonating, impersonatedUser, stopImpersonation } = useImpersonation();

  if (!isImpersonating || !impersonatedUser) {
    return null;
  }

  const roleLabels = {
    user: "Regular User",
    pool_admin: "Pool Admin",
    super_admin: "Super Admin",
  };

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-[100] px-4 py-2",
      "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
      "shadow-lg"
    )}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
            <UserCog className="h-4 w-4" />
          </div>
          <div className="text-sm">
            <span className="font-medium">Viewing as:</span>{" "}
            <span className="font-bold">
              {impersonatedUser.displayName || impersonatedUser.email}
            </span>
            <span className="ml-2 px-2 py-0.5 rounded bg-white/20 text-xs font-medium">
              {roleLabels[impersonatedUser.role]}
            </span>
          </div>
        </div>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={stopImpersonation}
          className="text-white hover:bg-white/20 hover:text-white gap-1.5"
        >
          <X className="h-4 w-4" />
          Exit Impersonation
        </Button>
      </div>
    </div>
  );
}

/**
 * Spacer component to push content below the banner when impersonating
 */
export function ImpersonationSpacer() {
  const { isImpersonating } = useImpersonation();
  
  if (!isImpersonating) return null;
  
  return <div className="h-12" />;
}
