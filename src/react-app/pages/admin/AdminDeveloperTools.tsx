import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { useImpersonation, type UserRole } from "@/react-app/contexts/ImpersonationContext";
import { useSuperAdmin } from "@/react-app/contexts/SuperAdminContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Badge } from "@/react-app/components/ui/badge";
import {
  UserCog, Zap, Radio, ExternalLink, Shield, Users, User,
  Play, AlertTriangle, CheckCircle, Loader2, Eye
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

export function AdminDeveloperTools() {
  const { isSuperAdmin } = useSuperAdmin();
  const { isImpersonating, impersonatedUser, startImpersonation, stopImpersonation } = useImpersonation();
  
  const [impersonateUserId, setImpersonateUserId] = useState("");
  const [impersonateRole, setImpersonateRole] = useState<UserRole>("user");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartImpersonation = async () => {
    if (!impersonateUserId.trim()) {
      setError("Please enter a user ID");
      return;
    }

    setIsStarting(true);
    setError(null);

    const success = await startImpersonation(impersonateUserId.trim(), impersonateRole);
    
    if (!success) {
      setError("Failed to start impersonation. Check user ID and try again.");
    }
    
    setIsStarting(false);
  };

  const roleOptions: { value: UserRole; label: string; icon: typeof User; description: string }[] = [
    { 
      value: "user", 
      label: "Regular User", 
      icon: User,
      description: "Standard end-user experience"
    },
    { 
      value: "pool_admin", 
      label: "Pool Admin", 
      icon: Users,
      description: "Pool management capabilities"
    },
    { 
      value: "super_admin", 
      label: "Super Admin", 
      icon: Shield,
      description: "Full platform access"
    },
  ];

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Developer Tools"
        description="Testing, simulation, and impersonation controls"
      />

      <div className="p-6 space-y-6">
        {/* Impersonation Panel */}
        <Card className={cn(
          "overflow-hidden",
          isImpersonating && "ring-2 ring-amber-500"
        )}>
          <CardHeader className={cn(
            isImpersonating 
              ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20"
              : ""
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center",
                isImpersonating
                  ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20"
                  : "bg-gradient-to-br from-violet-500/20 to-purple-500/20"
              )}>
                <UserCog className={cn(
                  "h-5 w-5",
                  isImpersonating ? "text-white" : "text-violet-600 dark:text-violet-400"
                )} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  User Impersonation
                  {isImpersonating && (
                    <Badge className="bg-amber-500 text-white">Active</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Test the app as different user roles without separate logins
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {isImpersonating && impersonatedUser ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        Currently Impersonating
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        <strong>{impersonatedUser.displayName || impersonatedUser.email}</strong>
                        <span className="ml-2 text-xs">({impersonatedUser.id})</span>
                      </p>
                      <div className="mt-2">
                        <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                          {impersonatedUser.role === "user" && "Regular User"}
                          {impersonatedUser.role === "pool_admin" && "Pool Admin"}
                          {impersonatedUser.role === "super_admin" && "Super Admin"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={stopImpersonation}
                    className="flex-1"
                  >
                    Exit Impersonation
                  </Button>
                  <Button asChild className="flex-1">
                    <Link to="/">
                      <Play className="h-4 w-4 mr-2" />
                      View as {impersonatedUser.role === "user" ? "User" : "Pool Admin"}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="userId">User ID</Label>
                  <Input
                    id="userId"
                    placeholder="Enter user ID to impersonate"
                    value={impersonateUserId}
                    onChange={(e) => setImpersonateUserId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Find user IDs in the Users section of the admin panel
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Role to Simulate</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {roleOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setImpersonateRole(option.value)}
                        className={cn(
                          "relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left",
                          "hover:border-primary/50 hover:bg-muted/50",
                          impersonateRole === option.value
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        )}
                      >
                        {impersonateRole === option.value && (
                          <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <CheckCircle className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                        <option.icon className={cn(
                          "h-5 w-5",
                          impersonateRole === option.value ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div>
                          <p className={cn(
                            "text-sm font-medium",
                            impersonateRole === option.value && "text-primary"
                          )}>{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleStartImpersonation}
                  disabled={!impersonateUserId.trim() || isStarting}
                  className="w-full"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <UserCog className="h-4 w-4 mr-2" />
                      Start Impersonation
                    </>
                  )}
                </Button>

                <div className="p-3 rounded-lg bg-muted/50 border border-dashed">
                  <p className="text-xs text-muted-foreground">
                    <strong>Note:</strong> Impersonation allows you to view the app as the selected user
                    would see it. Actions taken while impersonating will be logged. Session ends when
                    you exit or close the browser.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Access Tools */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Quick Access</CardTitle>
                <CardDescription>
                  Testing and simulation controls
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              to="/settings/providers"
              className="flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Zap className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <p className="font-medium">Live Score Providers</p>
                  <p className="text-sm text-muted-foreground">
                    Configure data sources for real-time game scores
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>

            <Link
              to="/demo"
              className="flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Radio className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <p className="font-medium">Demo Control Center</p>
                  <p className="text-sm text-muted-foreground">
                    Simulate game scores, state changes, and threshold events
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </CardContent>
        </Card>

        {/* Current Session Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Super Admin</p>
                <p className="font-medium">{isSuperAdmin ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Impersonating</p>
                <p className="font-medium">{isImpersonating ? "Yes" : "No"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
