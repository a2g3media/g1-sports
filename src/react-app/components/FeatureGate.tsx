/**
 * FeatureGate Component
 * 
 * Wraps features that require specific subscription tiers.
 * Shows contextual upgrade prompts when users attempt to access locked features.
 * Designed with premium aesthetic and no dark patterns.
 */

import { ReactNode, useState, useEffect } from "react";
import { 
  trackUpgradePromptShown, 
  trackLockedFeatureClicked 
} from "@/react-app/lib/paywallTracker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Lock, Crown, Zap, Trophy, Shield, Check, Sparkles, ChevronRight 
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { UpgradeModal } from "@/react-app/components/UpgradeModal";
import { InlineFAQ } from "@/react-app/components/PricingFAQ";

export type GatedFeature = 
  | "pick_submission"      // Pool Access required
  | "live_commentary"      // Scout Pro required
  | "proactive_alerts"     // Scout Pro required
  | "multi_game_center"    // Scout Elite required
  | "custom_alerts"        // Scout Elite required
  | "heat_maps"            // Scout Elite required
  | "advanced_filters"     // Scout Elite required
  | "admin_dashboard"      // Admin tier required
  | "unlimited_scout";     // Scout Elite required

interface FeatureGateProps {
  feature: GatedFeature;
  userTier: string;
  children: ReactNode;
  variant?: "inline" | "overlay" | "replace";
  showComparison?: boolean;
}

const FEATURE_CONFIG: Record<GatedFeature, {
  requiredTier: string;
  tierName: string;
  tierPrice: string;
  tierIcon: typeof Crown;
  tierColor: string;
  featureName: string;
  description: string;
  benefits: string[];
  includesPoolAccess?: boolean;
  hasTrial?: boolean;
}> = {
  pick_submission: {
    requiredTier: "pool_access",
    tierName: "Pool Access",
    tierPrice: "$10/year",
    tierIcon: Trophy,
    tierColor: "emerald",
    featureName: "Pick Submissions",
    description: "Join pools and submit your picks to compete with friends",
    benefits: [
      "Submit picks to all pools",
      "Join unlimited pools",
      "Pick confirmation receipts",
      "Full pool participation",
    ],
  },
  live_commentary: {
    requiredTier: "scout_pro",
    tierName: "Coach G Pro",
    tierPrice: "$29/month",
    tierIcon: Zap,
    tierColor: "amber",
    featureName: "Live Commentary",
    description: "Get real-time Coach G analysis as games unfold",
    benefits: [
      "Live game commentary",
      "Period break summaries",
      "Scoring event alerts",
      "100 daily Coach G questions",
    ],
    includesPoolAccess: true,
    hasTrial: true,
  },
  proactive_alerts: {
    requiredTier: "scout_pro",
    tierName: "Coach G Pro",
    tierPrice: "$29/month",
    tierIcon: Zap,
    tierColor: "amber",
    featureName: "Proactive Alerts",
    description: "Coach G watches your watchlist and alerts you to key developments",
    benefits: [
      "Line movement alerts",
      "Injury notifications",
      "Dominant performance alerts",
      "Smart alert bundling",
    ],
    includesPoolAccess: true,
    hasTrial: true,
  },
  unlimited_scout: {
    requiredTier: "scout_elite",
    tierName: "Coach G Elite",
    tierPrice: "$79/month",
    tierIcon: Crown,
    tierColor: "violet",
    featureName: "Unlimited Coach G AI",
    description: "No daily limits on Coach G intelligence",
    benefits: [
      "Unlimited Coach G questions",
      "Priority AI routing",
      "Faster response times",
      "Advanced context retention",
    ],
    includesPoolAccess: true,
  },
  multi_game_center: {
    requiredTier: "scout_elite",
    tierName: "Coach G Elite",
    tierPrice: "$79/month",
    tierIcon: Crown,
    tierColor: "violet",
    featureName: "Multi-Game Command Center",
    description: "Track multiple games simultaneously with advanced views",
    benefits: [
      "Watch up to 8 games at once",
      "Synchronized commentary",
      "Cross-game momentum tracking",
      "Elite-only layouts",
    ],
    includesPoolAccess: true,
  },
  custom_alerts: {
    requiredTier: "scout_elite",
    tierName: "Coach G Elite",
    tierPrice: "$79/month",
    tierIcon: Crown,
    tierColor: "violet",
    featureName: "Custom Alert Builder",
    description: "Create your own alert rules and triggers",
    benefits: [
      "Custom alert conditions",
      "Multi-criteria triggers",
      "Advanced filters",
      "Save alert templates",
    ],
    includesPoolAccess: true,
  },
  heat_maps: {
    requiredTier: "scout_elite",
    tierName: "Coach G Elite",
    tierPrice: "$79/month",
    tierIcon: Crown,
    tierColor: "violet",
    featureName: "League-Wide Heat Maps",
    description: "Visualize trends and patterns across entire leagues",
    benefits: [
      "Visual trend analysis",
      "League-wide patterns",
      "Historical heat maps",
      "Export visualizations",
    ],
    includesPoolAccess: true,
  },
  advanced_filters: {
    requiredTier: "scout_elite",
    tierName: "Coach G Elite",
    tierPrice: "$79/month",
    tierIcon: Crown,
    tierColor: "violet",
    featureName: "Advanced Filters",
    description: "Build complex multi-criteria filters",
    benefits: [
      "Multi-dimensional filtering",
      "Save filter presets",
      "Advanced operators",
      "Export filtered data",
    ],
    includesPoolAccess: true,
  },
  admin_dashboard: {
    requiredTier: "admin_starter",
    tierName: "Admin Starter",
    tierPrice: "$99/year",
    tierIcon: Shield,
    tierColor: "emerald",
    featureName: "Admin Dashboard",
    description: "Manage your own pools with professional tools",
    benefits: [
      "Pool management dashboard",
      "Member administration",
      "Dispute resolution tools",
      "Export member data",
    ],
  },
};

function hasAccess(userTier: string, requiredTier: string): boolean {
  const tierHierarchy = ['free', 'pool_access', 'scout_pro', 'scout_elite'];
  const userLevel = tierHierarchy.indexOf(userTier);
  const requiredLevel = tierHierarchy.indexOf(requiredTier);
  
  // Admin tiers are separate
  if (requiredTier.startsWith('admin')) {
    return userTier === requiredTier || userTier === 'admin_unlimited';
  }
  
  return userLevel >= requiredLevel;
}

function InlineGateWithModal({ 
  config, 
  userTier, 
  onShowModal,
  featureKey,
}: { 
  config: typeof FEATURE_CONFIG[GatedFeature]; 
  userTier: string;
  onShowModal: () => void;
  featureKey: string;
}) {
  const Icon = config.tierIcon;
  
  // Track when gate is shown
  useEffect(() => {
    trackUpgradePromptShown({
      reason: "FEATURE_LOCKED",
      screenName: window.location.pathname,
      featureKey,
      planRequired: config.requiredTier,
      fromTier: userTier,
    });
  }, [featureKey, config.requiredTier, userTier]);
  
  const handleShowModal = () => {
    trackLockedFeatureClicked({
      featureKey,
      planRequired: config.requiredTier,
      screenName: window.location.pathname,
      fromTier: userTier,
    });
    onShowModal();
  };
  const isPoolUser = userTier === 'pool_access';
  const showCredit = isPoolUser && config.includesPoolAccess;
  
  return (
    <div className={cn(
      "p-5 rounded-2xl border-2",
      `border-${config.tierColor}-500/30 bg-${config.tierColor}-50/50 dark:bg-${config.tierColor}-900/10`
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
          `bg-${config.tierColor}-100 dark:bg-${config.tierColor}-900/30`
        )}>
          <Lock className={cn("h-6 w-6", `text-${config.tierColor}-600 dark:text-${config.tierColor}-400`)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{config.featureName}</h3>
            <Badge className={cn(
              `bg-${config.tierColor}-500/20 text-${config.tierColor}-700 dark:text-${config.tierColor}-300`
            )}>
              <Icon className="h-3 w-3 mr-1" />
              {config.tierName}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground mb-3">
            {config.description}
          </p>
          
          <div className="flex items-center gap-3">
            <Button 
              size="sm" 
              onClick={handleShowModal}
              className={cn(
                `bg-${config.tierColor}-500 hover:bg-${config.tierColor}-600 text-white`
              )}
            >
              {config.hasTrial ? "Start Free Trial" : "Upgrade"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            
            <div className="text-sm">
              <span className="font-semibold">{config.tierPrice}</span>
              {showCredit && (
                <span className="text-xs text-muted-foreground ml-2">
                  ($10 Pool credit applied)
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-3">
            <button 
              onClick={handleShowModal}
              className="text-xs text-primary hover:underline"
            >
              Compare all plans →
            </button>
            <InlineFAQ className="hidden sm:flex" />
          </div>
        </div>
      </div>
    </div>
  );
}

function OverlayGateWithModal({ 
  config, 
  onShowModal,
  featureKey,
  userTier,
}: { 
  config: typeof FEATURE_CONFIG[GatedFeature]; 
  onShowModal: () => void;
  featureKey: string;
  userTier: string;
}) {
  const Icon = config.tierIcon;
  
  // Track when overlay gate is shown
  useEffect(() => {
    trackUpgradePromptShown({
      reason: "FEATURE_LOCKED",
      screenName: window.location.pathname,
      featureKey,
      planRequired: config.requiredTier,
      fromTier: userTier,
    });
  }, [featureKey, config.requiredTier, userTier]);
  
  const handleShowModal = () => {
    trackLockedFeatureClicked({
      featureKey,
      planRequired: config.requiredTier,
      screenName: window.location.pathname,
      fromTier: userTier,
    });
    onShowModal();
  };
  
  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center",
              `bg-${config.tierColor}-100 dark:bg-${config.tierColor}-900/30`
            )}>
              <Lock className={cn("h-5 w-5", `text-${config.tierColor}-600 dark:text-${config.tierColor}-400`)} />
            </div>
            <Badge className={cn(
              `bg-${config.tierColor}-500/20 text-${config.tierColor}-700 dark:text-${config.tierColor}-300`
            )}>
              <Icon className="h-3 w-3 mr-1" />
              {config.tierName}
            </Badge>
          </div>
          <CardTitle>{config.featureName}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-2 mb-4">
            {config.benefits.map((benefit, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
          
          {config.includesPoolAccess && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Includes Pool Access</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Full pick submission rights included at no extra cost
              </p>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button onClick={handleShowModal} className="flex-1" size="lg">
              {config.hasTrial ? "Start Free Trial" : `Upgrade to ${config.tierName}`}
            </Button>
          </div>
          
          <button 
            onClick={handleShowModal}
            className="w-full text-center text-xs text-primary hover:underline mt-3"
          >
            Compare all plans →
          </button>
          
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold">{config.tierPrice}</p>
            {config.hasTrial && (
              <p className="text-xs text-muted-foreground">
                7-day free trial • No payment required
              </p>
            )}
          </div>
          
          <div className="mt-4 pt-3 border-t flex justify-center">
            <InlineFAQ />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function FeatureGate({
  feature,
  userTier,
  children,
  variant = "inline",
}: FeatureGateProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const config = FEATURE_CONFIG[feature];
  
  // Check if user has access
  if (hasAccess(userTier, config.requiredTier)) {
    return <>{children}</>;
  }
  
  // Map required tier to modal highlight tier
  const highlightTier = config.requiredTier as "pool_access" | "scout_pro" | "scout_elite";
  
  // Show gate based on variant
  if (variant === "inline") {
    return (
      <>
        <InlineGateWithModal 
          config={config} 
          userTier={userTier} 
          onShowModal={() => setShowUpgradeModal(true)}
          featureKey={feature}
        />
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          currentTier={userTier}
          highlightTier={highlightTier}
          highlightFeature={config.featureName}
          source="feature_gate"
        />
      </>
    );
  }
  
  if (variant === "overlay") {
    return (
      <>
        <div className="relative">
          <div className="pointer-events-none opacity-20 blur-sm">
            {children}
          </div>
          <OverlayGateWithModal 
            config={config} 
            onShowModal={() => setShowUpgradeModal(true)}
            featureKey={feature}
            userTier={userTier}
          />
        </div>
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          currentTier={userTier}
          highlightTier={highlightTier}
          highlightFeature={config.featureName}
          source="feature_gate"
        />
      </>
    );
  }
  
  // Replace variant - just show the gate, no children
  return (
    <>
      <Card>
        <CardContent className="p-6">
          <InlineGateWithModal 
            config={config} 
            userTier={userTier} 
            onShowModal={() => setShowUpgradeModal(true)}
            featureKey={feature}
          />
        </CardContent>
      </Card>
      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        currentTier={userTier}
        highlightTier={highlightTier}
        highlightFeature={config.featureName}
        source="feature_gate"
      />
    </>
  );
}
