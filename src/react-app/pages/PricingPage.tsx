/**
 * PricingPage - Premium cinematic pricing page
 * 
 * Features glass tier cards with glow effects, ambient animations,
 * and premium visual design for maximum conversion.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/react-app/config/routes";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  FeatureComparisonTable, 
  SUBSCRIPTION_TIERS,
} from "@/react-app/components/FeatureComparisonTable";
import { WhyWeChargeSection } from "@/react-app/components/WhyWeCharge";
import { PricingFAQ } from "@/react-app/components/PricingFAQ";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import {
  Sparkles, Shield, Zap, Trophy, Users,
  Check, ArrowRight, MessageSquare, Bell,
  Star, ChevronDown, Crown
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

// =============================================================================
// CINEMATIC BACKGROUND
// =============================================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" 
           style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-amber-500/8 rounded-full blur-[100px] animate-pulse" 
           style={{ animationDuration: '10s', animationDelay: '2s' }} />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-blue-500/8 rounded-full blur-[80px] animate-pulse" 
           style={{ animationDuration: '12s', animationDelay: '4s' }} />
      
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}

// =============================================================================
// VALUE PROPOSITIONS
// =============================================================================

const VALUE_PROPS = [
  {
    icon: MessageSquare,
    title: "AI That Knows Sports",
    description: "Coach G analyzes games, lines, and trends in real-time. Ask anything, get expert-level answers.",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    icon: Bell,
    title: "Never Miss a Move",
    description: "Proactive alerts for line changes, injuries, and weather. We watch so you don't have to.",
    gradient: "from-amber-500 to-orange-500",
  },
  {
    icon: Trophy,
    title: "Pools Made Simple",
    description: "Join unlimited pools with one subscription. No per-pool fees, no hassle.",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    icon: Shield,
    title: "No Ads. No Tracking.",
    description: "We make money from subscriptions, not selling your data. Privacy by design.",
    gradient: "from-violet-500 to-purple-500",
  },
];

// =============================================================================
// TRUST INDICATORS
// =============================================================================

const TRUST_ITEMS = [
  { label: "7-Day Free Trial", sublabel: "on Pro plans" },
  { label: "Cancel Anytime", sublabel: "no contracts" },
  { label: "Charter Pricing", sublabel: "locked forever" },
  { label: "Money-Back Guarantee", sublabel: "first 30 days" },
];

// =============================================================================
// PREMIUM TIER CARD
// =============================================================================

function PremiumTierCard({ 
  tier, 
  currentTier,
  isHighlighted,
  onSelect 
}: { 
  tier: typeof SUBSCRIPTION_TIERS[0];
  currentTier: string;
  isHighlighted?: boolean;
  onSelect: () => void;
}) {
  const Icon = tier.icon;
  const isCurrent = tier.key === currentTier;
  const isPopular = tier.popular;
  
  // Tier-specific glow colors
  const glowColors: Record<string, string> = {
    free: "shadow-slate-500/20",
    pool_access: "shadow-emerald-500/30",
    scout_pro: "shadow-amber-500/40",
    scout_elite: "shadow-purple-500/50",
  };
  
  const borderColors: Record<string, string> = {
    free: "border-slate-700/50",
    pool_access: "border-emerald-500/30",
    scout_pro: "border-amber-500/40",
    scout_elite: "border-purple-500/50",
  };
  
  return (
    <div className={cn(
      "relative group",
      isHighlighted && "scale-105 z-10"
    )}>
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-lg shadow-amber-500/30 px-4 py-1">
            <Star className="h-3 w-3 mr-1 fill-current" />
            Most Popular
          </Badge>
        </div>
      )}
      
      {/* Card glow effect */}
      <div className={cn(
        "absolute -inset-0.5 rounded-2xl bg-gradient-to-b opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm",
        tier.key === "free" && "from-slate-500/30 to-transparent",
        tier.key === "pool_access" && "from-emerald-500/40 to-transparent",
        tier.key === "scout_pro" && "from-amber-500/50 to-transparent",
        tier.key === "scout_elite" && "from-purple-500/60 to-transparent",
      )} />
      
      <div className={cn(
        "relative bg-slate-900/80 backdrop-blur-xl rounded-2xl border overflow-hidden transition-all duration-300",
        "hover:shadow-2xl hover:-translate-y-1",
        borderColors[tier.key] || "border-slate-700/50",
        glowColors[tier.key] || "shadow-slate-500/20",
        isPopular && "ring-2 ring-amber-400/50 shadow-xl shadow-amber-500/20",
        isCurrent && "ring-2 ring-emerald-400/50",
        isHighlighted && "ring-2 ring-primary/50"
      )}>
        {/* Background gradient */}
        <div className={cn(
          "absolute inset-0 opacity-5",
          tier.key === "free" && "bg-gradient-to-br from-slate-400 to-transparent",
          tier.key === "pool_access" && "bg-gradient-to-br from-emerald-400 to-transparent",
          tier.key === "scout_pro" && "bg-gradient-to-br from-amber-400 to-transparent",
          tier.key === "scout_elite" && "bg-gradient-to-br from-purple-400 to-transparent",
        )} />
        
        <div className="relative p-6">
          {/* Icon */}
          <div className={cn(
            "h-14 w-14 rounded-xl flex items-center justify-center mb-5",
            "bg-gradient-to-br shadow-lg",
            tier.key === "free" && "from-slate-600 to-slate-700 shadow-slate-500/20",
            tier.key === "pool_access" && "from-emerald-500 to-emerald-600 shadow-emerald-500/30",
            tier.key === "scout_pro" && "from-amber-500 to-amber-600 shadow-amber-500/30",
            tier.key === "scout_elite" && "from-purple-500 to-purple-600 shadow-purple-500/30",
          )}>
            <Icon className="h-7 w-7 text-white" />
          </div>
          
          {/* Name & tagline */}
          <h3 className="text-xl font-bold text-white mb-1">{tier.name}</h3>
          <p className="text-sm text-slate-400 mb-5 min-h-[40px]">{tier.tagline}</p>
          
          {/* Price */}
          <div className="mb-5">
            <span className="text-4xl font-bold text-white">{tier.price}</span>
            <span className="text-slate-400 ml-1">{tier.period}</span>
          </div>
          
          {/* Trial badge */}
          {tier.trialDays && (
            <Badge className="mb-5 bg-amber-500/15 text-amber-400 border-amber-500/30">
              <Sparkles className="h-3 w-3 mr-1" />
              {tier.trialDays}-day free trial
            </Badge>
          )}
          
          {/* CTA Button */}
          <Button 
            className={cn(
              "w-full h-12 font-semibold transition-all duration-300",
              tier.key === "free" && "bg-slate-700 hover:bg-slate-600 text-white",
              tier.key === "pool_access" && "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25",
              tier.key === "scout_pro" && "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg shadow-amber-500/25",
              tier.key === "scout_elite" && "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white shadow-lg shadow-purple-500/25",
            )}
            onClick={onSelect}
            disabled={isCurrent}
          >
            {isCurrent ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Current Plan
              </>
            ) : tier.trialDays ? (
              <>
                Start Free Trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Get Started
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          
          {/* Quick features */}
          <div className="mt-5 pt-5 border-t border-slate-700/50 space-y-2">
            {tier.key === "free" && (
              <>
                <FeatureItem>Live scores & standings</FeatureItem>
                <FeatureItem>10 AI questions/day</FeatureItem>
                <FeatureItem>Basic game alerts</FeatureItem>
              </>
            )}
            {tier.key === "pool_access" && (
              <>
                <FeatureItem>Everything in Free</FeatureItem>
                <FeatureItem highlight>Unlimited pool access</FeatureItem>
                <FeatureItem>25 AI questions/day</FeatureItem>
              </>
            )}
            {tier.key === "scout_pro" && (
              <>
                <FeatureItem>Everything in Pool Access</FeatureItem>
                <FeatureItem highlight>Live game commentary</FeatureItem>
                <FeatureItem highlight>Real-time alerts</FeatureItem>
                <FeatureItem>100 Coach G questions/day</FeatureItem>
              </>
            )}
            {tier.key === "scout_elite" && (
              <>
                <FeatureItem>Everything in Pro</FeatureItem>
                <FeatureItem highlight>Command Center</FeatureItem>
                <FeatureItem highlight>Custom alert rules</FeatureItem>
                <FeatureItem highlight>Unlimited Coach G</FeatureItem>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check className={cn(
        "h-4 w-4 flex-shrink-0",
        highlight ? "text-emerald-400" : "text-slate-500"
      )} />
      <span className={highlight ? "text-white" : "text-slate-400"}>{children}</span>
    </div>
  );
}

// =============================================================================
// USE CASE SELECTOR
// =============================================================================

type UseCase = "casual" | "pools" | "betting" | "power";

const USE_CASES: { key: UseCase; label: string; recommended: string; reason: string }[] = [
  { 
    key: "casual", 
    label: "Just checking scores", 
    recommended: "free",
    reason: "Free gives you live scores and 10 AI questions daily — perfect for staying updated."
  },
  { 
    key: "pools", 
    label: "Playing in pools", 
    recommended: "pool_access",
    reason: "Pool Access lets you join unlimited pools for less than $1/month."
  },
  { 
    key: "betting", 
    label: "Serious about betting", 
    recommended: "scout_pro",
    reason: "Coach G Pro gives you the edge with live commentary, alerts, and 100 AI questions daily."
  },
  { 
    key: "power", 
    label: "I want everything", 
    recommended: "scout_elite",
    reason: "Coach G Elite unlocks the Command Center, custom alerts, and unlimited AI."
  },
];

function UseCaseSelector({ 
  selected, 
  onSelect 
}: { 
  selected: UseCase | null;
  onSelect: (useCase: UseCase) => void;
}) {
  const selectedCase = USE_CASES.find(uc => uc.key === selected);
  
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 mb-10">
      <h3 className="text-lg font-semibold mb-4 text-center text-white">What brings you here?</h3>
      
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {USE_CASES.map((useCase) => (
          <Button
            key={useCase.key}
            variant={selected === useCase.key ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(useCase.key)}
            className={cn(
              "rounded-full transition-all",
              selected === useCase.key 
                ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500" 
                : "border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white"
            )}
          >
            {useCase.label}
          </Button>
        ))}
      </div>
      
      {selectedCase && (
        <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
          <p className="text-sm text-slate-400 mb-3">{selectedCase.reason}</p>
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 px-4 py-1.5">
            <Crown className="h-3 w-3 mr-1.5" />
            Recommended: {SUBSCRIPTION_TIERS.find(t => t.key === selectedCase.recommended)?.name}
          </Badge>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PricingPage() {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier || "free";
  const [showAdminTiers, setShowAdminTiers] = useState(false);
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  
  const scrollToComparison = () => {
    document.getElementById("full-comparison")?.scrollIntoView({ behavior: "smooth" });
  };

  const highlightedTier = selectedUseCase 
    ? USE_CASES.find(uc => uc.key === selectedUseCase)?.recommended 
    : undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <CinematicBackground />
      
      {/* Hero Section */}
      <section className="relative pt-8 pb-16 sm:pt-16 sm:pb-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <Badge className="mb-4 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
              <Sparkles className="h-3 w-3 mr-1" />
              Charter Member Pricing
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Simple, Transparent Pricing
            </h1>
            
            <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
              No hidden fees. No per-pool charges. Just pick a plan and get started.
            </p>
          </div>
          
          {/* Use Case Selector */}
          <UseCaseSelector 
            selected={selectedUseCase} 
            onSelect={setSelectedUseCase} 
          />
          
          {/* Tier Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4 mb-12">
            {SUBSCRIPTION_TIERS.map((tier) => (
              <PremiumTierCard
                key={tier.key}
                tier={tier}
                currentTier={currentTier}
                isHighlighted={tier.key === highlightedTier}
                onSelect={() => {
                  if (tier.key === currentTier) return;
                  window.location.href = "/settings?tab=subscription";
                }}
              />
            ))}
          </div>
          
          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm">
            {TRUST_ITEMS.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
                <span>
                  <span className="font-medium text-white">{item.label}</span>
                  {" "}<span className="text-slate-500">{item.sublabel}</span>
                </span>
              </div>
            ))}
          </div>
          
          {/* Scroll Indicator */}
          <div className="flex justify-center mt-12">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={scrollToComparison}
              className="text-slate-400 hover:text-white hover:bg-slate-800/50"
            >
              <span>See full comparison</span>
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </section>
      
      {/* Value Propositions */}
      <section className="py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-transparent" />
        
        <div className="relative max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4 text-white">Why GZ Sports?</h2>
          <p className="text-slate-400 text-center mb-12 max-w-xl mx-auto">
            Built for serious sports fans who want an edge without the noise.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUE_PROPS.map((prop, i) => {
              const Icon = prop.icon;
              return (
                <div 
                  key={i} 
                  className="group text-center p-6 rounded-2xl bg-slate-800/30 border border-slate-700/50 hover:border-slate-600/50 transition-all hover:-translate-y-1"
                >
                  <div className={cn(
                    "h-14 w-14 rounded-xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4 shadow-lg transition-transform group-hover:scale-110",
                    prop.gradient
                  )}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="font-semibold mb-2 text-white">{prop.title}</h3>
                  <p className="text-sm text-slate-400">{prop.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      
      {/* Full Feature Comparison */}
      <section id="full-comparison" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2 text-white">Compare All Features</h2>
            <p className="text-slate-400">
              Every feature, every tier, laid out clearly.
            </p>
          </div>
          
          {/* Tier Toggle */}
          <div className="flex justify-center gap-2 mb-8">
            <Button
              variant={!showAdminTiers ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAdminTiers(false)}
              className={cn(
                !showAdminTiers 
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                  : "border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
              )}
            >
              <Users className="h-4 w-4 mr-2" />
              Player Tiers
            </Button>
            <Button
              variant={showAdminTiers ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAdminTiers(true)}
              className={cn(
                showAdminTiers 
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                  : "border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
              )}
            >
              <Shield className="h-4 w-4 mr-2" />
              Admin Tiers
            </Button>
          </div>
          
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-4 sm:p-6 overflow-x-auto">
            <FeatureComparisonTable
              currentTier={currentTier}
              showAdminTiers={showAdminTiers}
              highlightTier={highlightedTier}
            />
          </div>
        </div>
      </section>
      
      {/* Why We Charge */}
      <section className="py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4">
          <WhyWeChargeSection />
        </div>
      </section>
      
      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8 text-white">Frequently Asked Questions</h2>
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <PricingFAQ />
          </div>
        </div>
      </section>
      
      {/* Final CTA */}
      <section className="py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent" />
        
        <div className="relative max-w-2xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 mb-6">
            <Zap className="h-8 w-8 text-white" />
          </div>
          
          <h2 className="text-3xl font-bold mb-4 text-white">Ready to get started?</h2>
          <p className="text-slate-400 mb-8 text-lg">
            Join thousands of sports fans who trust GZ Sports for scores, picks, and AI insights.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={`${ROUTES.SETTINGS}?tab=subscription`}>
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg shadow-amber-500/25 h-14 px-8 text-lg">
                <Zap className="h-5 w-5 mr-2" />
                Start Free Trial
              </Button>
            </Link>
            <Link to={ROUTES.HOME}>
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 h-14 px-8 text-lg">
                Try Free Version
              </Button>
            </Link>
          </div>
          
          <p className="text-sm text-slate-500 mt-6">
            No credit card required for free tier. Cancel anytime.
          </p>
        </div>
      </section>
      
      {/* Legal Links */}
      <footer className="py-10 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-6 text-sm text-slate-500">
          <Link to={ROUTES.PRIVACY} className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <Link to={ROUTES.TERMS} className="hover:text-white transition-colors">
            Terms of Service
          </Link>
          <Link to={ROUTES.WHY_WE_CHARGE} className="hover:text-white transition-colors">
            Why We Charge
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default PricingPage;
