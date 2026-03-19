/**
 * UpgradeModal Component
 * 
 * Premium upgrade modal with tier comparison grid.
 * Shows clear feature comparison across all tiers with elegant design.
 */

import { useState, useEffect, useRef } from "react";
import { 
  trackUpgradePromptShown, 
  trackUpgradeCtaClicked, 
  trackPaywallDismissed 
} from "@/react-app/lib/paywallTracker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/react-app/components/ui/dialog";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Crown, Zap, Trophy, Users, Check, X, Sparkles, 
  ChevronRight, Star, MessageSquare, Bell, Eye, 
  LayoutGrid, Sliders, Clock
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useNavigate } from "react-router-dom";
import { InlineFAQ } from "@/react-app/components/PricingFAQ";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: string;
  highlightTier?: "pool_access" | "scout_pro" | "scout_elite";
  highlightFeature?: string;
  source?: string;
}

interface TierInfo {
  key: string;
  name: string;
  price: string;
  period: string;
  icon: typeof Crown;
  color: string;
  bgClass: string;
  borderClass: string;
  buttonClass: string;
  popular?: boolean;
  trialDays?: number;
}

const TIERS: TierInfo[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Users,
    color: "text-slate-500",
    bgClass: "bg-slate-500/10",
    borderClass: "border-slate-500/30",
    buttonClass: "bg-slate-500 hover:bg-slate-600",
  },
  {
    key: "pool_access",
    name: "Pool Access",
    price: "$10",
    period: "/year",
    icon: Trophy,
    color: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/30",
    buttonClass: "bg-emerald-500 hover:bg-emerald-600",
  },
  {
    key: "scout_pro",
    name: "Coach G Pro",
    price: "$29",
    period: "/month",
    icon: Zap,
    color: "text-amber-500",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
    buttonClass: "bg-amber-500 hover:bg-amber-600",
    popular: true,
    trialDays: 7,
  },
  {
    key: "scout_elite",
    name: "Coach G Elite",
    price: "$79",
    period: "/month",
    icon: Crown,
    color: "text-violet-500",
    bgClass: "bg-violet-500/10",
    borderClass: "border-violet-500/30",
    buttonClass: "bg-violet-500 hover:bg-violet-600",
  },
];

interface FeatureRow {
  name: string;
  icon: typeof Check;
  description?: string;
  values: Record<string, boolean | string>;
  highlight?: boolean;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    name: "Live Scoreboards",
    icon: Eye,
    values: { free: true, pool_access: true, scout_pro: true, scout_elite: true },
  },
  {
    name: "Coach G AI Questions",
    icon: MessageSquare,
    description: "Daily limit",
    values: { free: "10/day", pool_access: "10/day", scout_pro: "100/day", scout_elite: "Unlimited" },
  },
  {
    name: "Pool Participation",
    icon: Trophy,
    description: "Join & submit picks",
    values: { free: false, pool_access: true, scout_pro: true, scout_elite: true },
  },
  {
    name: "Live Commentary",
    icon: MessageSquare,
    description: "Real-time game analysis",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Proactive Alerts",
    icon: Bell,
    description: "Line moves, injuries",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Period Summaries",
    icon: Clock,
    description: "Halftime, quarter breaks",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Command Center",
    icon: LayoutGrid,
    description: "Multi-game view",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "Custom Alerts",
    icon: Sliders,
    description: "Build your own rules",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "Priority AI",
    icon: Sparkles,
    description: "Faster, smarter responses",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
];

function FeatureValue({ value, tierColor }: { value: boolean | string; tierColor: string }) {
  if (typeof value === "string") {
    return (
      <span className={cn(
        "text-sm font-medium",
        value === "Unlimited" ? "text-violet-500" : "text-foreground"
      )}>
        {value}
      </span>
    );
  }
  
  if (value) {
    return <Check className={cn("h-5 w-5", tierColor)} />;
  }
  
  return <X className="h-5 w-5 text-muted-foreground/30" />;
}

export function UpgradeModal({
  open,
  onOpenChange,
  currentTier,
  highlightTier,
  highlightFeature,
  source,
}: UpgradeModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const hasTrackedOpen = useRef(false);
  
  const tierIndex = TIERS.findIndex(t => t.key === currentTier);
  
  // Track when modal opens
  useEffect(() => {
    if (open && !hasTrackedOpen.current) {
      hasTrackedOpen.current = true;
      trackUpgradePromptShown({
        reason: highlightFeature ? "FEATURE_LOCKED" : "PLAN_REQUIRED",
        screenName: source || "upgrade_modal",
        featureKey: highlightFeature,
        planRequired: highlightTier,
        fromTier: currentTier,
      });
    }
    if (!open) {
      hasTrackedOpen.current = false;
    }
  }, [open, highlightFeature, highlightTier, currentTier, source]);
  
  // Handle modal close with tracking
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && open) {
      // Modal is being closed
      trackPaywallDismissed({
        reason: highlightFeature ? "FEATURE_LOCKED" : "PLAN_REQUIRED",
        screenName: source || "upgrade_modal",
        featureKey: highlightFeature,
      });
    }
    onOpenChange(newOpen);
  };
  
  const handleSelectTier = async (tierKey: string) => {
    setLoading(tierKey);
    
    // Track CTA click
    trackUpgradeCtaClicked({
      reason: highlightFeature ? "FEATURE_LOCKED" : "PLAN_REQUIRED",
      screenName: source || "upgrade_modal",
      featureKey: highlightFeature,
      toTier: tierKey,
    });
    
    try {
      // Track upgrade trigger (legacy)
      await fetch("/api/upgrade/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromTier: currentTier,
          toTier: tierKey,
          triggerSource: source || "upgrade_modal",
          triggerFeature: highlightFeature,
        }),
      });
      
      // Navigate to settings subscription tab
      onOpenChange(false);
      navigate("/settings?tab=subscription");
    } catch (err) {
      console.error("Failed to track upgrade:", err);
      navigate("/settings?tab=subscription");
    } finally {
      setLoading(null);
    }
  };
  
  // Get recommended tier
  const recommendedTier = highlightTier || 
    (currentTier === "free" ? "scout_pro" : 
     currentTier === "pool_access" ? "scout_pro" : "scout_elite");
  
  // Mark features to highlight
  const featuresWithHighlight = FEATURE_ROWS.map(row => ({
    ...row,
    highlight: highlightFeature && row.name.toLowerCase().includes(highlightFeature.toLowerCase()),
  }));
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
          <DialogHeader className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Unlock More with GZ Sports</DialogTitle>
                <DialogDescription>
                  Compare plans and find the right fit for your sports experience
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        
        {/* Tier Headers */}
        <div className="px-6">
          <div className="grid grid-cols-5 gap-3 py-4 border-b">
            {/* Empty cell for feature column */}
            <div className="flex items-end pb-2">
              <span className="text-sm font-medium text-muted-foreground">Features</span>
            </div>
            
            {TIERS.map((tier) => {
              const Icon = tier.icon;
              const isCurrent = tier.key === currentTier;
              const isRecommended = tier.key === recommendedTier && !isCurrent;
              const isHighlighted = tier.key === highlightTier;
              
              return (
                <div
                  key={tier.key}
                  className={cn(
                    "relative flex flex-col items-center p-4 rounded-xl transition-all",
                    isCurrent && "bg-muted/50 border-2 border-primary/50",
                    isHighlighted && !isCurrent && "bg-primary/5 border-2 border-primary",
                    isRecommended && !isHighlighted && "ring-2 ring-amber-400/50",
                    !isCurrent && !isHighlighted && !isRecommended && "hover:bg-muted/30"
                  )}
                >
                  {tier.popular && !isCurrent && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-white text-[10px] font-semibold rounded-full flex items-center gap-0.5">
                      <Star className="h-2.5 w-2.5" />
                      Popular
                    </div>
                  )}
                  
                  {isCurrent && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full">
                      Current
                    </div>
                  )}
                  
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center mb-2",
                    tier.bgClass
                  )}>
                    <Icon className={cn("h-5 w-5", tier.color)} />
                  </div>
                  
                  <h3 className="font-semibold text-sm">{tier.name}</h3>
                  
                  <div className="mt-1">
                    <span className="text-lg font-bold">{tier.price}</span>
                    <span className="text-xs text-muted-foreground">{tier.period}</span>
                  </div>
                  
                  {tier.trialDays && !isCurrent && (
                    <Badge variant="secondary" className="mt-2 text-[10px]">
                      {tier.trialDays}-day trial
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Feature Comparison Grid */}
        <div className="px-6 py-2">
          {featuresWithHighlight.map((row, i) => {
            const Icon = row.icon;
            
            return (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-5 gap-3 py-3 border-b border-border/50 transition-colors",
                  row.highlight && "bg-primary/5 -mx-6 px-6 border-primary/20"
                )}
              >
                {/* Feature name */}
                <div className="flex items-center gap-2">
                  <Icon className={cn(
                    "h-4 w-4 shrink-0",
                    row.highlight ? "text-primary" : "text-muted-foreground"
                  )} />
                  <div>
                    <p className={cn(
                      "text-sm font-medium",
                      row.highlight && "text-primary"
                    )}>
                      {row.name}
                    </p>
                    {row.description && (
                      <p className="text-xs text-muted-foreground">{row.description}</p>
                    )}
                  </div>
                </div>
                
                {/* Values for each tier */}
                {TIERS.map((tier) => (
                  <div
                    key={tier.key}
                    className="flex items-center justify-center"
                  >
                    <FeatureValue value={row.values[tier.key]} tierColor={tier.color} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        
        {/* CTA Row */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t p-6">
          <div className="grid grid-cols-5 gap-3">
            {/* Empty cell */}
            <div />
            
            {TIERS.map((tier) => {
              const isCurrent = tier.key === currentTier;
              const canUpgrade = TIERS.findIndex(t => t.key === tier.key) > tierIndex;
              const isRecommended = tier.key === recommendedTier;
              
              if (isCurrent) {
                return (
                  <Button key={tier.key} variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                );
              }
              
              if (!canUpgrade) {
                return <div key={tier.key} />;
              }
              
              return (
                <Button
                  key={tier.key}
                  onClick={() => handleSelectTier(tier.key)}
                  disabled={loading === tier.key}
                  className={cn(
                    "w-full text-white",
                    isRecommended ? "bg-primary hover:bg-primary/90" : tier.buttonClass
                  )}
                >
                  {loading === tier.key ? (
                    "..."
                  ) : tier.trialDays ? (
                    <>Try Free</>
                  ) : (
                    <>Upgrade</>
                  )}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              );
            })}
          </div>
          
          {/* Charter pricing notice */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Charter member pricing — lock in these rates forever</span>
          </div>
          
          {/* Trust indicators */}
          <div className="mt-3 flex justify-center">
            <InlineFAQ />
          </div>
          
          {/* Legal links */}
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            By upgrading, you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground">Terms</a>
            {" "}and{" "}
            <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick upgrade prompt for inline use
 */
export function UpgradePrompt({
  feature,
  requiredTier,
  currentTier,
  compact = false,
}: {
  feature: string;
  requiredTier: "pool_access" | "scout_pro" | "scout_elite";
  currentTier: string;
  compact?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  
  const tierInfo = TIERS.find(t => t.key === requiredTier);
  if (!tierInfo) return null;
  
  const Icon = tierInfo.icon;
  
  if (compact) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
            tierInfo.bgClass,
            tierInfo.color,
            "hover:opacity-80"
          )}
        >
          <Icon className="h-3 w-3" />
          {tierInfo.name}
        </button>
        
        <UpgradeModal
          open={showModal}
          onOpenChange={setShowModal}
          currentTier={currentTier}
          highlightTier={requiredTier}
          highlightFeature={feature}
          source="inline_prompt"
        />
      </>
    );
  }
  
  return (
    <>
      <div className={cn(
        "flex items-center gap-3 p-4 rounded-xl border-2",
        tierInfo.borderClass,
        tierInfo.bgClass
      )}>
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          "bg-white dark:bg-background"
        )}>
          <Icon className={cn("h-5 w-5", tierInfo.color)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{feature} requires {tierInfo.name}</p>
          <p className="text-xs text-muted-foreground">
            {tierInfo.price}{tierInfo.period} • {tierInfo.trialDays ? `${tierInfo.trialDays}-day free trial` : "Instant access"}
          </p>
        </div>
        
        <Button
          onClick={() => setShowModal(true)}
          size="sm"
          className={cn("text-white shrink-0", tierInfo.buttonClass)}
        >
          {tierInfo.trialDays ? "Try Free" : "Upgrade"}
        </Button>
      </div>
      
      <UpgradeModal
        open={showModal}
        onOpenChange={setShowModal}
        currentTier={currentTier}
        highlightTier={requiredTier}
        highlightFeature={feature}
        source="inline_prompt"
      />
    </>
  );
}
