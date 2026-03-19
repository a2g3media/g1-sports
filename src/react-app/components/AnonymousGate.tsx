/**
 * AnonymousGate Component
 * 
 * Handles gating for anonymous users attempting to access premium features.
 * Shows premium login prompts with calm, non-aggressive messaging.
 */

import { ReactNode } from "react";
import { Button } from "@/react-app/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import { Sparkles, Lock, ChevronRight } from "lucide-react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface AnonymousGateProps {
  feature: "scout" | "follow" | "alerts" | "pools" | "picks";
  children: ReactNode;
  variant?: "inline" | "modal";
  onClose?: () => void;
}

const FEATURE_MESSAGES = {
  scout: {
    icon: Sparkles,
    title: "Sign in to activate Scout",
    description: "Scout is your personal AI sports intelligence assistant. Get instant answers, live insights, and personalized alerts for your teams and games.",
  },
  follow: {
    icon: Lock,
    title: "Sign in to follow teams",
    description: "Create your personalized sports feed by following your favorite teams. Get tailored updates and insights delivered directly to you.",
  },
  alerts: {
    icon: Lock,
    title: "Sign in to enable alerts",
    description: "Never miss important moments. Get intelligent notifications for scoring plays, injuries, line movements, and breaking news.",
  },
  pools: {
    icon: Lock,
    title: "Sign in to join pools",
    description: "Compete with friends in pick'em pools, survivor leagues, and more. Track your performance and climb the leaderboards.",
  },
  picks: {
    icon: Lock,
    title: "Sign in to submit picks",
    description: "Make your predictions and track your performance over time. Join the GZ Sports community and compete with confidence.",
  },
};

export function AnonymousGate({ 
  feature, 
  children, 
  variant = "modal",
  onClose 
}: AnonymousGateProps) {
  const { user, redirectToLogin } = useDemoAuth();
  const config = FEATURE_MESSAGES[feature];
  const Icon = config.icon;

  // If user is authenticated, show the children
  if (user) {
    return <>{children}</>;
  }

  // Inline variant - show a compact gate
  if (variant === "inline") {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-20 blur-sm select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-6 max-w-sm text-center shadow-lg">
            <Icon className="h-8 w-8 mx-auto mb-3 text-primary" />
            <h3 className="font-semibold mb-2">{config.title}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {config.description}
            </p>
            <Button 
              onClick={() => redirectToLogin()}
              className="w-full"
            >
              Sign In
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Modal variant - show a dialog
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{config.title}</DialogTitle>
          <DialogDescription className="text-center pt-2">
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-4">
          <Button 
            onClick={() => redirectToLogin()}
            className="w-full"
            size="lg"
          >
            Continue with Google
          </Button>
          <Button 
            onClick={() => redirectToLogin()}
            variant="outline"
            className="w-full"
            size="lg"
          >
            Continue with Apple
          </Button>
          <Button 
            onClick={() => redirectToLogin()}
            variant="ghost"
            className="w-full"
            size="lg"
          >
            Continue with Email
          </Button>
        </div>
        <p className="text-xs text-center text-muted-foreground pt-4">
          Free to browse. Sign in to interact.
        </p>
      </DialogContent>
    </Dialog>
  );
}
