/**
 * PoolAccessGate Component
 * 
 * Simple, clean gating for pool-related actions.
 * Shows a calm upgrade prompt for Pool Access ($10/year).
 */

import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Trophy, Check, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface PoolAccessGateProps {
  action: "join" | "create" | "submit";
  children: ReactNode;
  variant?: "modal" | "inline" | "replace";
}

const ACTION_CONFIG = {
  join: {
    title: "Pool Access Required",
    description: "Join pools and compete with friends",
    actionVerb: "join this pool",
  },
  create: {
    title: "Pool Access Required",
    description: "Create and manage your own pools",
    actionVerb: "create pools",
  },
  submit: {
    title: "Pool Access Required",
    description: "Submit your picks and track your performance",
    actionVerb: "submit picks",
  },
};

export function PoolAccessGate({ action, children, variant = "replace" }: PoolAccessGateProps) {
  const { subscription, features, loading, isSuperAdmin, effectiveRole } = useSubscription();
  const { isDemoMode } = useDemoAuth();

  // Show loading state
  if (loading) {
    return <>{children}</>;
  }

  // Demo mode users bypass the gate to explore the app
  if (isDemoMode) {
    return <>{children}</>;
  }

  // Super Admin and Pool Admin bypass the gate for create/manage actions
  if (isSuperAdmin || (effectiveRole === 'pool_admin' && action === 'create')) {
    return <>{children}</>;
  }

  // Check if user has pool access via subscription
  const hasPoolAccess = features?.canSubmitPicks || false;
  
  // If they have access, render children
  if (hasPoolAccess) {
    return <>{children}</>;
  }

  const config = ACTION_CONFIG[action];

  // Replace variant: show gate instead of content
  if (variant === "replace") {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-8">
        <Card className="max-w-md border-2">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <Trophy className="h-8 w-8 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl">{config.title}</CardTitle>
            <CardDescription className="text-base">
              {config.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Check className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <span>Unlimited pools. No per-pool fees.</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Check className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <span>One payment covers all pools</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Check className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <span>Pick confirmation receipts</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Check className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <span>Full pool participation</span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-baseline justify-center gap-2 mb-4">
                <span className="text-4xl font-bold">$10</span>
                <span className="text-muted-foreground">/year</span>
              </div>
              
              <Button asChild className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700">
                <Link to="/settings?tab=subscription">
                  Get Pool Access
                </Link>
              </Button>
              
              <p className="text-xs text-center text-muted-foreground mt-3">
                Renews annually. Cancel anytime.
              </p>
            </div>

            {subscription?.tier === 'free' && (
              <div className="pt-4 border-t">
                <p className="text-sm text-center text-muted-foreground">
                  Need more? Scout Pro includes Pool Access plus live commentary and proactive alerts.
                </p>
                <Button asChild variant="outline" className="w-full mt-3">
                  <Link to="/settings?tab=subscription">
                    View All Plans
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Inline variant: show message above content
  if (variant === "inline") {
    return (
      <div className="space-y-4">
        <Card className="border-2 border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 flex-shrink-0">
                <Lock className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold">Pool Access required to {config.actionVerb}</h3>
                  <p className="text-sm text-muted-foreground">$10/year — Unlimited pools. No per-pool fees.</p>
                </div>
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Link to="/settings?tab=subscription">
                    Get Pool Access
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  // Modal variant: overlay on top of content
  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <Card className="max-w-sm border-2 shadow-xl">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <Trophy className="h-6 w-6 text-emerald-500" />
            </div>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>$10/year — Unlimited pools</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
              <Link to="/settings?tab=subscription">
                Get Pool Access
              </Link>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              One payment covers all pools. No per-pool fees.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
