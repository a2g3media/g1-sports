import { ShieldX, ArrowLeft, Home } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";

interface AccessDeniedProps {
  /** Title shown in the access denied message */
  title?: string;
  /** Description explaining why access was denied */
  description?: string;
  /** The required role to access this resource */
  requiredRole?: "super_admin" | "pool_admin" | "player";
  /** Where the "Go Back" button should navigate (defaults to browser history) */
  backTo?: string;
  /** Additional CSS classes */
  className?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  pool_admin: "Pool Admin",
  player: "Player",
};

export function AccessDenied({
  title = "Access Denied",
  description = "You don't have permission to access this page.",
  requiredRole,
  backTo,
  className,
}: AccessDeniedProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={cn(
      "min-h-[60vh] flex flex-col items-center justify-center p-8 text-center",
      className
    )}>
      <div className="max-w-md space-y-6">
        {/* Icon */}
        <div className="mx-auto h-20 w-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldX className="h-10 w-10 text-destructive" />
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          
          {requiredRole && (
            <p className="text-sm text-muted-foreground mt-2">
              Required role: <span className="font-medium text-foreground">{ROLE_LABELS[requiredRole] || requiredRole}</span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline access denied for use within cards or sections
 */
export function AccessDeniedInline({
  message = "You don't have permission to view this content.",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20",
      className
    )}>
      <ShieldX className="h-5 w-5 text-destructive flex-shrink-0" />
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}
