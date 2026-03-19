import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImpersonation, type UserRole } from "@/react-app/contexts/ImpersonationContext";
import { useSuperAdmin } from "@/react-app/contexts/SuperAdminContext";
import { Button } from "@/react-app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Eye, 
  Shield, 
  Users, 
  User, 
  ChevronDown,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface RoleOption {
  role: UserRole;
  label: string;
  description: string;
  icon: typeof Shield;
  color: string;
}

const roleOptions: RoleOption[] = [
  {
    role: "super_admin",
    label: "Super Admin",
    description: "Full platform access",
    icon: Shield,
    color: "text-muted-foreground",
  },
  {
    role: "pool_admin",
    label: "Pool Admin",
    description: "Manage owned pools only",
    icon: Users,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  {
    role: "user",
    label: "Player",
    description: "Standard user experience",
    icon: User,
    color: "text-blue-600 dark:text-blue-400",
  },
];

// Demo test accounts for quick impersonation
const testAccounts = [
  { id: "test-pool-admin", email: "test_pool_admin@demo.local", role: "pool_admin" as UserRole, label: "Test Pool Admin" },
  { id: "test-player", email: "test_player@demo.local", role: "user" as UserRole, label: "Test Player" },
];

export function ViewAsRoleSwitcher() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useSuperAdmin();
  const { 
    isImpersonating, 
    impersonatedUser, 
    effectiveRole, 
    startImpersonation, 
    stopImpersonation 
  } = useImpersonation();
  const [isLoading, setIsLoading] = useState(false);

  // Only show for super admins
  if (!isSuperAdmin) {
    return null;
  }

  const currentRole = roleOptions.find(r => r.role === effectiveRole) || roleOptions[0];

  const handleRoleSwitch = async (role: UserRole) => {
    if (role === "super_admin") {
      stopImpersonation();
      return;
    }

    setIsLoading(true);
    try {
      // Find the test account for this role
      const testAccount = testAccounts.find(a => a.role === role);
      if (testAccount) {
        await startImpersonation(testAccount.id, role);
        // Navigate to appropriate area
        if (role === "pool_admin") {
          navigate("/pool-admin");
        } else {
          navigate("/");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestAccountSwitch = async (account: typeof testAccounts[0]) => {
    setIsLoading(true);
    try {
      await startImpersonation(account.id, account.role);
      if (account.role === "pool_admin") {
        navigate("/pool-admin");
      } else {
        navigate("/");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            "gap-2 h-9",
            isImpersonating && "border-amber-500/50 bg-amber-500/5"
          )}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">View as:</span>
              <Badge 
                variant="secondary" 
                className={cn("text-[10px] font-semibold", currentRole.color)}
              >
                {currentRole.label}
              </Badge>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch role perspective
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Role Options */}
        {roleOptions.map((option) => {
          const Icon = option.icon;
          const isActive = effectiveRole === option.role;
          
          return (
            <DropdownMenuItem
              key={option.role}
              onClick={() => handleRoleSwitch(option.role)}
              className={cn(
                "flex items-center gap-3 py-2.5 cursor-pointer",
                isActive && "bg-secondary"
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center",
                isActive ? "bg-primary/10" : "bg-muted"
              )}>
                <Icon className={cn("h-4 w-4", option.color)} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              {isActive && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Quick test accounts
        </DropdownMenuLabel>
        
        {/* Test Accounts */}
        {testAccounts.map((account) => {
          const isActive = isImpersonating && impersonatedUser?.id === account.id;
          
          return (
            <DropdownMenuItem
              key={account.id}
              onClick={() => handleTestAccountSwitch(account)}
              className={cn(
                "flex items-center gap-3 py-2 cursor-pointer",
                isActive && "bg-secondary"
              )}
            >
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                {account.label.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm">{account.label}</p>
                <p className="text-[10px] text-muted-foreground">{account.email}</p>
              </div>
              {isActive && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}

        {isImpersonating && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={stopImpersonation}
              className="text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400"
            >
              Exit Impersonation
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
