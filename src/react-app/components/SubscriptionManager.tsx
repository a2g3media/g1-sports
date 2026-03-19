import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { 
  Crown, Zap, Shield, Users, Trophy, Clock, AlertTriangle,
  Check, X, Loader2, Sparkles, ChevronRight, Calendar, Star
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { PricingFAQ, InlineFAQ } from "@/react-app/components/PricingFAQ";
import { WhyWeChargeBanner } from "@/react-app/components/WhyWeCharge";

interface Subscription {
  userId: string;
  tier: string;
  productKey: string | null;
  billingPeriod: string | null;
  status: "active" | "trialing" | "past_due" | "canceled" | "expired";
  isTrialing: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  downgradeToProductKey: string | null;
}

interface TierDefinition {
  key: string;
  name: string;
  tagline: string;
  price: string;
  period: string;
  icon: typeof Crown;
  color: string;
  bgGradient: string;
  popular?: boolean;
  features: string[];
  limitations?: string[];
}

const TIERS: TierDefinition[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Perfect for casual fans who want live scores",
    price: "$0",
    period: "forever",
    icon: Users,
    color: "text-slate-600 dark:text-slate-400",
    bgGradient: "from-slate-500/10 to-zinc-500/10",
    features: [
      "Live scoreboards for all sports",
      "10 Coach G questions per day",
      "View public pools",
    ],
    limitations: [
      "Cannot submit picks",
      "No live commentary",
      "No proactive alerts",
    ],
  },
  {
    key: "pool_access",
    name: "Pool Access",
    tagline: "For pool players — one price, unlimited pools",
    price: "$10",
    period: "/year",
    icon: Trophy,
    color: "text-emerald-600 dark:text-emerald-400",
    bgGradient: "from-emerald-500/20 to-teal-500/20",
    features: [
      "Everything in Free",
      "Submit picks to unlimited pools",
      "Join any pool instantly",
      "Pick confirmation receipts",
      "Less than $1/month",
    ],
  },
  {
    key: "scout_pro",
    name: "Coach G Pro",
    tagline: "For serious bettors who want an edge",
    price: "$29",
    period: "/month",
    icon: Zap,
    color: "text-amber-600 dark:text-amber-400",
    bgGradient: "from-amber-500/20 to-orange-500/20",
    popular: true,
    features: [
      "Everything in Pool Access",
      "100 Coach G questions per day",
      "Live game commentary",
      "Line move & injury alerts",
      "Period break summaries",
      "7-day free trial included",
    ],
  },
  {
    key: "scout_elite",
    name: "Coach G Elite",
    tagline: "For power users — unlimited everything",
    price: "$79",
    period: "/month",
    icon: Crown,
    color: "text-violet-600 dark:text-violet-400",
    bgGradient: "from-violet-500/20 to-purple-500/20",
    features: [
      "Everything in Scout Pro",
      "Unlimited Scout AI questions",
      "Multi-game command center",
      "Custom alert builder",
      "Priority AI (faster responses)",
      "Priority support",
    ],
  },
];

function TierCard({
  tier,
  current,
  isTrialing,
  onSelect,
  loading,
}: {
  tier: TierDefinition;
  current: boolean;
  isTrialing: boolean;
  onSelect: () => void;
  loading: boolean;
}) {
  const Icon = tier.icon;
  const isFreeTier = tier.key === "free";
  const isUpgrade = !current && !isFreeTier;
  
  return (
    <div
      className={cn(
        "relative flex flex-col p-5 rounded-2xl border-2 transition-all duration-200",
        current
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/50 hover:shadow-md",
        tier.popular && !current && "ring-2 ring-amber-400/50"
      )}
    >
      {tier.popular && !current && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-500 text-white text-xs font-semibold rounded-full flex items-center gap-1">
          <Star className="h-3 w-3" />
          Most Popular
        </div>
      )}
      
      {current && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full flex items-center gap-1">
          <Check className="h-3 w-3" />
          {isTrialing ? "Trial Active" : "Current Plan"}
        </div>
      )}
      
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          "h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
          tier.bgGradient
        )}>
          <Icon className={cn("h-6 w-6", tier.color)} />
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold">{tier.price}</span>
          <span className="text-sm text-muted-foreground">{tier.period}</span>
        </div>
      </div>
      
      <h3 className="text-lg font-semibold mb-1">{tier.name}</h3>
      <p className="text-sm text-muted-foreground mb-4">{tier.tagline}</p>
      
      <div className="flex-1 space-y-2 mb-4">
        {tier.features.map((feature, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>{feature}</span>
          </div>
        ))}
        {tier.limitations?.map((limitation, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <X className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
            <span>{limitation}</span>
          </div>
        ))}
      </div>
      
      <Button
        onClick={onSelect}
        disabled={current || loading}
        variant={current ? "outline" : isUpgrade ? "default" : "outline"}
        className={cn(
          "w-full",
          tier.popular && !current && "bg-amber-500 hover:bg-amber-600 text-white"
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : current ? (
          "Current Plan"
        ) : isUpgrade ? (
          <>
            {tier.key === "scout_pro" ? "Start Free Trial" : "Upgrade"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </>
        ) : (
          "Downgrade"
        )}
      </Button>
    </div>
  );
}

export function SubscriptionManager() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const res = await fetch("/api/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.error("Failed to load subscription:", err);
      setError("Failed to load subscription status");
    } finally {
      setLoading(false);
    }
  };

  const handleTierSelect = async (tierKey: string) => {
    if (!subscription) return;
    
    setActionLoading(tierKey);
    setError(null);
    
    try {
      // For scout_pro, start a trial
      if (tierKey === "scout_pro" && subscription.tier === "free") {
        const res = await fetch("/api/subscription/trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productKey: "scout_pro_monthly" }),
        });
        
        if (res.ok) {
          await loadSubscription();
        } else {
          const data = await res.json();
          setError(data.error || "Failed to start trial");
        }
      } else {
        // For other tiers, redirect to checkout (simulated)
        const res = await fetch("/api/subscription/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productKey: `${tierKey}_monthly` }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.checkoutUrl) {
            // In production, redirect to Stripe
            // window.location.href = data.checkoutUrl;
            // For demo, just reload
            await loadSubscription();
          }
        } else {
          const data = await res.json();
          setError(data.error || "Failed to process upgrade");
        }
      }
    } catch (err) {
      console.error("Tier selection failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription?.productKey) return;
    
    // Confirm cancellation
    const tierName = TIERS.find(t => t.key === subscription.tier)?.name || subscription.tier;
    if (!confirm(
      `Cancel ${tierName}?\n\n` +
      `You'll retain access until ${formatDate(subscription.currentPeriodEnd)}.\n` +
      (subscription.tier === "scout_pro" || subscription.tier === "scout_elite"
        ? "You'll automatically move to Pool Access ($10/year) to keep pick submission rights."
        : "Your picks and pool memberships will remain, but you won't be able to submit new picks.")
    )) {
      return;
    }
    
    setActionLoading("cancel");
    setError(null);
    
    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
      });
      
      if (res.ok) {
        await loadSubscription();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to cancel subscription");
      }
    } catch (err) {
      console.error("Cancel failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setActionLoading("reactivate");
    setError(null);
    
    try {
      const res = await fetch("/api/subscription/reactivate", {
        method: "POST",
      });
      
      if (res.ok) {
        await loadSubscription();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to reactivate subscription");
      }
    } catch (err) {
      console.error("Reactivate failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const getTrialDaysRemaining = () => {
    if (!subscription?.trialEndsAt) return 0;
    const end = new Date(subscription.trialEndsAt);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const currentTier = TIERS.find((t) => t.key === subscription?.tier) || TIERS[0];
  const trialDays = getTrialDaysRemaining();

  return (
    <div className="space-y-6">
      {/* Current Status Card */}
      <Card className="overflow-hidden">
        <div className={cn(
          "h-2",
          subscription?.isTrialing 
            ? "bg-gradient-to-r from-amber-400 to-orange-500"
            : subscription?.tier === "scout_elite"
            ? "bg-gradient-to-r from-violet-500 to-purple-600"
            : subscription?.tier === "scout_pro"
            ? "bg-gradient-to-r from-amber-500 to-orange-500"
            : "bg-gradient-to-r from-emerald-500 to-teal-500"
        )} />
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className={cn(
              "h-14 w-14 rounded-2xl flex items-center justify-center bg-gradient-to-br",
              currentTier.bgGradient
            )}>
              <currentTier.icon className={cn("h-7 w-7", currentTier.color)} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{currentTier.name}</CardTitle>
                {subscription?.isTrialing && (
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Clock className="h-3 w-3 mr-1" />
                    Trial: {trialDays} days left
                  </Badge>
                )}
                {subscription?.status === "past_due" && (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Payment Due
                  </Badge>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <Badge variant="secondary">
                    Cancels {formatDate(subscription.currentPeriodEnd)}
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                {currentTier.tagline}
              </CardDescription>
            </div>
            {subscription?.productKey && !subscription?.cancelAtPeriodEnd && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelSubscription}
                disabled={actionLoading === "cancel"}
                className="text-muted-foreground hover:text-destructive hover:border-destructive"
              >
                {actionLoading === "cancel" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Cancel Plan"
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subscription?.isTrialing && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    Your trial ends {formatDate(subscription.trialEndsAt)}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                    Add a payment method to continue after your trial. You won't be charged until the trial ends.
                  </p>
                </div>
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
                  Add Payment
                </Button>
              </div>
            </div>
          )}
          
          {subscription?.cancelAtPeriodEnd && (
            <div className="p-4 rounded-xl bg-muted/50 border border-border mb-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Your subscription ends {formatDate(subscription.currentPeriodEnd)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {subscription.downgradeToProductKey === "pool_access"
                      ? "You'll automatically move to Pool Access ($10/year). You'll keep pick submission rights but lose Coach G Pro features."
                      : subscription.downgradeToProductKey === "free"
                      ? "You'll move to the Free tier. Your picks and pool memberships will remain, but you won't be able to submit new picks."
                      : "You'll lose access to premium features when this period ends."}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleReactivate}
                  disabled={actionLoading === "reactivate"}
                >
                  {actionLoading === "reactivate" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Reactivate"
                  )}
                </Button>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-xl bg-muted/50">
              <p className="text-2xl font-bold">{currentTier.key === "scout_elite" ? "∞" : currentTier.key === "scout_pro" ? "100" : "10"}</p>
              <p className="text-xs text-muted-foreground">Daily Coach G questions</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <p className="text-2xl font-bold flex items-center justify-center">
                {(subscription?.tier === "scout_pro" || subscription?.tier === "scout_elite") ? (
                  <Check className="h-6 w-6 text-emerald-500" />
                ) : (
                  <X className="h-6 w-6 text-muted-foreground/50" />
                )}
              </p>
              <p className="text-xs text-muted-foreground">Live commentary</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <p className="text-2xl font-bold flex items-center justify-center">
                {(subscription?.tier === "scout_pro" || subscription?.tier === "scout_elite") ? (
                  <Check className="h-6 w-6 text-emerald-500" />
                ) : (
                  <X className="h-6 w-6 text-muted-foreground/50" />
                )}
              </p>
              <p className="text-xs text-muted-foreground">Proactive alerts</p>
            </div>
          </div>
          
          {subscription?.currentPeriodEnd && !subscription?.isTrialing && !subscription?.cancelAtPeriodEnd && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Next billing date:</span>
                  <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>
                </div>
                <a 
                  href="#" 
                  className="text-sm text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    alert("In production, this would open your App Store subscription management.");
                  }}
                >
                  Manage in App Store
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Tier Selection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">All Plans</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.key}
              tier={tier}
              current={subscription?.tier === tier.key}
              isTrialing={subscription?.isTrialing || false}
              onSelect={() => handleTierSelect(tier.key)}
              loading={actionLoading === tier.key}
            />
          ))}
        </div>
      </div>

      {/* Admin Tiers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle>Pool Admin Plans</CardTitle>
              <CardDescription>
                Run your own pools with advanced management tools
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-5 rounded-xl border-2 border-border hover:border-emerald-500/50 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold">Admin Starter</h4>
                  <p className="text-sm text-muted-foreground">Up to 3 pools</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold">$99</span>
                  <span className="text-sm text-muted-foreground">/year</span>
                </div>
              </div>
              <div className="space-y-1.5 text-sm mb-4">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Admin dashboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Member export tools</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Dispute resolution</span>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                Get Started
              </Button>
            </div>
            
            <div className="p-5 rounded-xl border-2 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10 hover:border-emerald-500/50 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    Admin Unlimited
                    <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px]">
                      Best Value
                    </Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground">Unlimited pools</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold">$149</span>
                  <span className="text-sm text-muted-foreground">/year</span>
                </div>
              </div>
              <div className="space-y-1.5 text-sm mb-4">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Everything in Starter</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Advanced analytics</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Priority support</span>
                </div>
              </div>
              <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                Get Started
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Charter Pricing Notice */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border border-primary/20">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-1">Charter Member Pricing</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Lock in these founding member rates forever. Prices will increase after launch, 
              but charter members keep their rate for life.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Price locked forever</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Charter member badge</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Early access to features</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Why We Charge */}
      <WhyWeChargeBanner />
      <div className="text-center">
        <a 
          href="/why-we-charge" 
          className="text-sm text-primary hover:underline"
        >
          Learn more about why we charge →
        </a>
      </div>
      
      {/* FAQ Section */}
      <PricingFAQ maxItems={5} />
      
      {/* Trust Indicators */}
      <div className="flex justify-center">
        <InlineFAQ />
      </div>
      
      {/* Legal Links */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-4 border-t">
        <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
        <span>•</span>
        <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
      </div>
    </div>
  );
}
