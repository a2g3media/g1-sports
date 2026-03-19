/**
 * FeatureComparisonTable Component
 * 
 * Standalone feature comparison table for pricing pages, marketing, etc.
 * Shows all subscription tiers with their features in a clean grid.
 * Responsive: table on desktop, cards on mobile.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/react-app/components/ui/card";
import {
  Crown, Zap, Trophy, Users, Check, X, Sparkles, Star,
  MessageSquare, Bell, Eye, LayoutGrid, Sliders, Clock,
  Shield, FileText, BarChart3, Headphones, ChevronRight
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

// =============================================================================
// TIER DEFINITIONS
// =============================================================================

export interface TierDefinition {
  key: string;
  name: string;
  tagline: string;
  price: string;
  period: string;
  yearlyPrice?: string;
  icon: typeof Crown;
  color: string;
  bgColor: string;
  borderColor: string;
  buttonClass: string;
  popular?: boolean;
  trialDays?: number;
}

export const SUBSCRIPTION_TIERS: TierDefinition[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Perfect for casual fans who want live scores",
    price: "$0",
    period: "forever",
    icon: Users,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/30",
    buttonClass: "bg-slate-600 hover:bg-slate-700",
  },
  {
    key: "pool_access",
    name: "Pool Access",
    tagline: "For pool players who want to submit picks everywhere",
    price: "$10",
    period: "/year",
    yearlyPrice: "$10/year",
    icon: Trophy,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700",
  },
  {
    key: "scout_pro",
    name: "Coach G Pro",
    tagline: "For serious bettors who want an edge",
    price: "$29",
    period: "/month",
    yearlyPrice: "$290/year",
    icon: Zap,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    buttonClass: "bg-amber-500 hover:bg-amber-600",
    popular: true,
    trialDays: 7,
  },
  {
    key: "scout_elite",
    name: "Coach G Elite",
    tagline: "For power users who want unlimited everything",
    price: "$79",
    period: "/month",
    yearlyPrice: "$790/year",
    icon: Crown,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    buttonClass: "bg-violet-600 hover:bg-violet-700",
  },
];

export const ADMIN_TIERS: TierDefinition[] = [
  {
    key: "admin_starter",
    name: "Admin Starter",
    tagline: "Run up to 3 pools",
    price: "$99",
    period: "/year",
    icon: Shield,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700",
  },
  {
    key: "admin_unlimited",
    name: "Admin Unlimited",
    tagline: "Unlimited pools + advanced tools",
    price: "$149",
    period: "/year",
    icon: Shield,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700",
    popular: true,
  },
];

// =============================================================================
// FEATURE DEFINITIONS
// =============================================================================

export interface FeatureDefinition {
  name: string;
  description?: string;
  icon: typeof Check;
  category: "core" | "scout" | "elite" | "admin";
  values: Record<string, boolean | string | number>;
}

export const FEATURES: FeatureDefinition[] = [
  // Core features
  {
    name: "Live Scoreboards",
    description: "All sports, real-time",
    icon: Eye,
    category: "core",
    values: { free: true, pool_access: true, scout_pro: true, scout_elite: true },
  },
  {
    name: "Coach G AI Questions",
    description: "Daily limit",
    icon: MessageSquare,
    category: "core",
    values: { free: "10/day", pool_access: "10/day", scout_pro: "100/day", scout_elite: "Unlimited" },
  },
  {
    name: "View Public Pools",
    description: "Browse active pools",
    icon: Trophy,
    category: "core",
    values: { free: true, pool_access: true, scout_pro: true, scout_elite: true },
  },
  {
    name: "Submit Picks",
    description: "Join and participate in pools",
    icon: FileText,
    category: "core",
    values: { free: false, pool_access: true, scout_pro: true, scout_elite: true },
  },
  {
    name: "Unlimited Pool Access",
    description: "Join any number of pools",
    icon: Trophy,
    category: "core",
    values: { free: false, pool_access: true, scout_pro: true, scout_elite: true },
  },
  {
    name: "Pick Confirmation Receipts",
    description: "Immutable proof of picks",
    icon: FileText,
    category: "core",
    values: { free: false, pool_access: true, scout_pro: true, scout_elite: true },
  },
  
  // Scout features
  {
    name: "Live Game Commentary",
    description: "Real-time AI analysis",
    icon: MessageSquare,
    category: "scout",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Proactive Alerts",
    description: "Line moves, injuries, weather",
    icon: Bell,
    category: "scout",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Period Break Summaries",
    description: "Halftime & quarter recaps",
    icon: Clock,
    category: "scout",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Dominant Performance Alerts",
    description: "Standout player notifications",
    icon: Star,
    category: "scout",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  {
    name: "Coach G Memory",
    description: "Personalized AI responses",
    icon: Sparkles,
    category: "scout",
    values: { free: false, pool_access: false, scout_pro: true, scout_elite: true },
  },
  
  // Elite features
  {
    name: "Multi-Game Command Center",
    description: "Watch multiple games at once",
    icon: LayoutGrid,
    category: "elite",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "Custom Alert Builder",
    description: "Create your own alert rules",
    icon: Sliders,
    category: "elite",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "League Heat Maps",
    description: "Visual pick distribution",
    icon: BarChart3,
    category: "elite",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "Advanced Filters",
    description: "Deep data exploration",
    icon: Sliders,
    category: "elite",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "Priority AI Routing",
    description: "Faster, smarter responses",
    icon: Zap,
    category: "elite",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
  {
    name: "Priority Support",
    description: "Direct access to team",
    icon: Headphones,
    category: "elite",
    values: { free: false, pool_access: false, scout_pro: false, scout_elite: true },
  },
];

export const ADMIN_FEATURES: FeatureDefinition[] = [
  {
    name: "Number of Pools",
    icon: Trophy,
    category: "admin",
    values: { admin_starter: "Up to 3", admin_unlimited: "Unlimited" },
  },
  {
    name: "Admin Dashboard",
    icon: LayoutGrid,
    category: "admin",
    values: { admin_starter: true, admin_unlimited: true },
  },
  {
    name: "Member Export Tools",
    icon: FileText,
    category: "admin",
    values: { admin_starter: true, admin_unlimited: true },
  },
  {
    name: "Dispute Resolution",
    icon: Shield,
    category: "admin",
    values: { admin_starter: true, admin_unlimited: true },
  },
  {
    name: "Advanced Analytics",
    icon: BarChart3,
    category: "admin",
    values: { admin_starter: false, admin_unlimited: true },
  },
  {
    name: "Priority Support",
    icon: Headphones,
    category: "admin",
    values: { admin_starter: false, admin_unlimited: true },
  },
];

// =============================================================================
// FEATURE VALUE RENDERER
// =============================================================================

function FeatureValue({ 
  value
}: { 
  value: boolean | string | number;
}) {
  if (typeof value === "string") {
    const isUnlimited = value.toLowerCase() === "unlimited";
    return (
      <span className={cn(
        "text-sm font-semibold",
        isUnlimited ? "text-violet-600 dark:text-violet-400" : "text-foreground"
      )}>
        {value}
      </span>
    );
  }
  
  if (typeof value === "number") {
    return <span className="text-sm font-semibold">{value}</span>;
  }
  
  if (value === true) {
    return (
      <div className={cn("h-6 w-6 rounded-full flex items-center justify-center", "bg-emerald-500/10")}>
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }
  
  return (
    <div className="h-6 w-6 rounded-full flex items-center justify-center bg-muted/50">
      <X className="h-4 w-4 text-muted-foreground/40" />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface FeatureComparisonTableProps {
  currentTier?: string;
  showAdminTiers?: boolean;
  highlightTier?: string;
  showCTA?: boolean;
  compact?: boolean;
  className?: string;
}

export function FeatureComparisonTable({
  currentTier = "free",
  showAdminTiers = false,
  highlightTier,
  showCTA = true,
  compact = false,
  className,
}: FeatureComparisonTableProps) {
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);
  
  const tiers = showAdminTiers ? ADMIN_TIERS : SUBSCRIPTION_TIERS;
  const features = showAdminTiers ? ADMIN_FEATURES : FEATURES;
  
  // Group features by category
  const coreFeatures = features.filter(f => f.category === "core");
  const scoutFeatures = features.filter(f => f.category === "scout");
  const eliteFeatures = features.filter(f => f.category === "elite");
  const adminFeatures = features.filter(f => f.category === "admin");
  
  const featureGroups = showAdminTiers 
    ? [{ name: "Admin Features", features: adminFeatures }]
    : [
        { name: "Core Features", features: coreFeatures },
        { name: "Coach G Pro", features: scoutFeatures },
        { name: "Coach G Elite", features: eliteFeatures },
      ];

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          {/* Tier Headers */}
          <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: `minmax(240px, 1.5fr) repeat(${tiers.length}, 1fr)` }}>
            <div className="p-6 flex items-end">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Compare Plans
              </span>
            </div>
            
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const isCurrent = tier.key === currentTier;
              const isHighlighted = tier.key === highlightTier;
              const isHovered = tier.key === hoveredTier;
              
              return (
                <div
                  key={tier.key}
                  className={cn(
                    "p-6 text-center transition-all border-l",
                    isCurrent && "bg-primary/5",
                    isHighlighted && "bg-primary/10",
                    isHovered && !isCurrent && !isHighlighted && "bg-muted/50"
                  )}
                  onMouseEnter={() => setHoveredTier(tier.key)}
                  onMouseLeave={() => setHoveredTier(null)}
                >
                  {/* Badges */}
                  <div className="h-6 mb-2">
                    {tier.popular && !isCurrent && (
                      <Badge className="bg-amber-500 text-white border-0">
                        <Star className="h-3 w-3 mr-1" />
                        Most Popular
                      </Badge>
                    )}
                    {isCurrent && (
                      <Badge variant="secondary" className="bg-primary/20 text-primary">
                        <Check className="h-3 w-3 mr-1" />
                        Current
                      </Badge>
                    )}
                  </div>
                  
                  {/* Icon & Name */}
                  <div className={cn(
                    "h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-3",
                    tier.bgColor
                  )}>
                    <Icon className={cn("h-7 w-7", tier.color)} />
                  </div>
                  
                  <h3 className="font-bold text-lg mb-1">{tier.name}</h3>
                  
                  {!compact && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {tier.tagline}
                    </p>
                  )}
                  
                  {/* Price */}
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    <span className="text-sm text-muted-foreground">{tier.period}</span>
                  </div>
                  
                  {tier.trialDays && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-2">
                      {tier.trialDays}-day free trial
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Feature Groups */}
          {featureGroups.map((group) => (
            <div key={group.name}>
              {/* Group Header */}
              <div 
                className="grid bg-muted/50 border-b" 
                style={{ gridTemplateColumns: `minmax(240px, 1.5fr) repeat(${tiers.length}, 1fr)` }}
              >
                <div className="p-4 font-semibold text-sm text-muted-foreground">
                  {group.name}
                </div>
                {tiers.map((tier) => (
                  <div key={tier.key} className="p-4 border-l" />
                ))}
              </div>
              
              {/* Features */}
              {group.features.map((feature, i) => {
                const Icon = feature.icon;
                
                return (
                  <div
                    key={i}
                    className="grid border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    style={{ gridTemplateColumns: `minmax(240px, 1.5fr) repeat(${tiers.length}, 1fr)` }}
                  >
                    <div className="p-4 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{feature.name}</p>
                        {feature.description && (
                          <p className="text-xs text-muted-foreground">{feature.description}</p>
                        )}
                      </div>
                    </div>
                    
                    {tiers.map((tier) => (
                      <div
                        key={tier.key}
                        className={cn(
                          "p-4 flex items-center justify-center border-l",
                          tier.key === currentTier && "bg-primary/5",
                          tier.key === highlightTier && "bg-primary/10"
                        )}
                      >
                        <FeatureValue value={feature.values[tier.key]} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
          
          {/* CTA Row */}
          {showCTA && (
            <div 
              className="grid border-t bg-muted/20" 
              style={{ gridTemplateColumns: `minmax(240px, 1.5fr) repeat(${tiers.length}, 1fr)` }}
            >
              <div className="p-6" />
              {tiers.map((tier) => {
                const isCurrent = tier.key === currentTier;
                const tierIndex = tiers.findIndex(t => t.key === tier.key);
                const currentIndex = tiers.findIndex(t => t.key === currentTier);
                const canUpgrade = tierIndex > currentIndex;
                
                return (
                  <div key={tier.key} className="p-6 flex items-center justify-center border-l">
                    {isCurrent ? (
                      <Button variant="outline" disabled className="w-full max-w-[160px]">
                        Current Plan
                      </Button>
                    ) : canUpgrade ? (
                      <Link to="/settings?tab=subscription" className="w-full max-w-[160px]">
                        <Button className={cn("w-full text-white", tier.buttonClass)}>
                          {tier.trialDays ? "Start Trial" : "Upgrade"}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const isCurrent = tier.key === currentTier;
          const isHighlighted = tier.key === highlightTier;
          const tierIndex = tiers.findIndex(t => t.key === tier.key);
          const currentIndex = tiers.findIndex(t => t.key === currentTier);
          const canUpgrade = tierIndex > currentIndex;
          
          return (
            <Card
              key={tier.key}
              className={cn(
                "overflow-hidden transition-all",
                isCurrent && "ring-2 ring-primary",
                isHighlighted && !isCurrent && "ring-2 ring-primary/50",
                tier.popular && !isCurrent && "ring-2 ring-amber-400"
              )}
            >
              {/* Card Header */}
              <CardHeader className={cn("pb-4", tier.bgColor)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-background/80 flex items-center justify-center">
                      <Icon className={cn("h-6 w-6", tier.color)} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{tier.name}</h3>
                      <p className="text-sm text-muted-foreground">{tier.tagline}</p>
                    </div>
                  </div>
                  
                  {tier.popular && !isCurrent && (
                    <Badge className="bg-amber-500 text-white border-0">
                      <Star className="h-3 w-3 mr-1" />
                      Popular
                    </Badge>
                  )}
                  {isCurrent && (
                    <Badge variant="secondary">Current</Badge>
                  )}
                </div>
                
                <div className="mt-4">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground">{tier.period}</span>
                  {tier.trialDays && (
                    <span className="ml-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
                      • {tier.trialDays}-day trial
                    </span>
                  )}
                </div>
              </CardHeader>
              
              {/* Features */}
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {features.map((feature, i) => {
                    const value = feature.values[tier.key];
                    const hasFeature = value === true || (typeof value === "string" && value !== "0");
                    
                    if (!hasFeature && compact) return null;
                    
                    return (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <span className={cn(
                          "text-sm",
                          hasFeature ? "text-foreground" : "text-muted-foreground/60"
                        )}>
                          {feature.name}
                        </span>
                        <FeatureValue value={value} />
                      </div>
                    );
                  })}
                </div>
                
                {/* CTA */}
                {showCTA && (
                  <div className="mt-6">
                    {isCurrent ? (
                      <Button variant="outline" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : canUpgrade ? (
                      <Link to="/settings?tab=subscription">
                        <Button className={cn("w-full text-white", tier.buttonClass)}>
                          {tier.trialDays ? "Start Free Trial" : "Upgrade"}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Charter Pricing Note */}
      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>Charter member pricing — lock in these rates forever</span>
      </div>
    </div>
  );
}

// =============================================================================
// MINI COMPARISON (for inline use)
// =============================================================================

interface MiniComparisonProps {
  tiers?: string[];
  features?: string[];
  currentTier?: string;
  className?: string;
}

export function MiniComparison({
  tiers = ["scout_pro", "scout_elite"],
  features = ["Scout AI Questions", "Live Game Commentary", "Custom Alert Builder"],
  className,
}: MiniComparisonProps) {
  const selectedTiers = SUBSCRIPTION_TIERS.filter(t => tiers.includes(t.key));
  const selectedFeatures = FEATURES.filter(f => features.includes(f.name));
  
  return (
    <div className={cn("rounded-xl border overflow-hidden", className)}>
      {/* Header */}
      <div className="grid bg-muted/50 border-b" style={{ gridTemplateColumns: `1.5fr repeat(${selectedTiers.length}, 1fr)` }}>
        <div className="p-3 text-xs font-semibold text-muted-foreground uppercase">
          Feature
        </div>
        {selectedTiers.map((tier) => (
          <div key={tier.key} className="p-3 text-center border-l">
            <span className={cn("text-xs font-semibold", tier.color)}>{tier.name}</span>
          </div>
        ))}
      </div>
      
      {/* Features */}
      {selectedFeatures.map((feature, i) => (
        <div 
          key={i}
          className="grid border-b last:border-b-0"
          style={{ gridTemplateColumns: `1.5fr repeat(${selectedTiers.length}, 1fr)` }}
        >
          <div className="p-3 text-sm">{feature.name}</div>
          {selectedTiers.map((tier) => (
            <div key={tier.key} className="p-3 flex items-center justify-center border-l">
              <FeatureValue value={feature.values[tier.key]} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
