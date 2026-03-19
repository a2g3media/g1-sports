import { 
  Cpu, ShieldCheck, Heart, Sparkles, 
  Ban, Lock, CreditCard, UserCheck,
  Server, Database, Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/react-app/components/ui/card";
import { Separator } from "@/react-app/components/ui/separator";
import { cn } from "@/react-app/lib/utils";

interface TransparencyPoint {
  icon: typeof Cpu;
  title: string;
  description: string;
  details?: string[];
}

const AI_COSTS: TransparencyPoint = {
  icon: Cpu,
  title: "Real AI. Real Costs.",
  description: "Coach G runs on advanced AI models that cost real money per question.",
  details: [
    "Each Coach G response costs us $0.02–0.08 in AI inference",
    "Live game commentary requires continuous model calls",
    "We pay for the AI so you don't see ads"
  ]
};

const INFRASTRUCTURE: TransparencyPoint = {
  icon: Server,
  title: "Always-On Infrastructure",
  description: "Live scores, real-time alerts, and instant responses require serious backend power.",
  details: [
    "Real-time data feeds from multiple sports providers",
    "Global edge servers for fast response times",
    "Push notification infrastructure for instant alerts"
  ]
};

const NO_ADS: TransparencyPoint = {
  icon: Ban,
  title: "Zero Ads. Zero Tracking.",
  description: "We don't run gambling ads. We don't sell your data. Subscriptions keep it that way.",
  details: [
    "No sportsbook affiliate deals",
    "No targeted betting ads following you",
    "Your data stays yours"
  ]
};

const FAIR_PRICING: TransparencyPoint = {
  icon: Heart,
  title: "Fair Pricing, Simple Tiers",
  description: "Free for casual fans. Paid tiers for power users. You choose what fits.",
  details: [
    "Free tier: 10 AI questions daily, live scores",
    "Pool Access: $10/year for unlimited pool participation",
    "Pro/Elite: For serious bettors who want an edge"
  ]
};

const TRUST_POINTS = [
  { icon: UserCheck, text: "Cancel anytime" },
  { icon: Lock, text: "No hidden fees" },
  { icon: ShieldCheck, text: "No data selling" },
  { icon: Ban, text: "No gambling ads" }
];

function TransparencyCard({ point, compact = false }: { point: TransparencyPoint; compact?: boolean }) {
  const Icon = point.icon;
  
  if (compact) {
    return (
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">{point.title}</h4>
          <p className="text-sm text-muted-foreground">{point.description}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-5 rounded-xl bg-muted/30 border border-border/50">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{point.title}</h4>
          <p className="text-sm text-muted-foreground mb-3">{point.description}</p>
          {point.details && (
            <ul className="space-y-1.5">
              {point.details.map((detail, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Full "Why We Charge" section for pricing pages
 */
export function WhyWeChargeSection({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-primary to-violet-500" />
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-primary/20 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>Why We Charge</CardTitle>
            <CardDescription>
              Real AI costs real money. Here's where your subscription goes.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <TransparencyCard point={AI_COSTS} />
          <TransparencyCard point={INFRASTRUCTURE} />
          <TransparencyCard point={NO_ADS} />
          <TransparencyCard point={FAIR_PRICING} />
        </div>
        
        <Separator />
        
        {/* Trust Strip */}
        <div className="flex flex-wrap items-center justify-center gap-6 py-2">
          {TRUST_POINTS.map((point, i) => {
            const Icon = point.icon;
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-emerald-500" />
                <span className="text-muted-foreground">{point.text}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact inline version for embedding in other components
 */
export function WhyWeChargeInline({ className }: { className?: string }) {
  return (
    <div className={cn("p-5 rounded-xl bg-muted/30 border border-border/50", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Why We Charge</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TransparencyCard point={AI_COSTS} compact />
        <TransparencyCard point={NO_ADS} compact />
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border/50">
        {TRUST_POINTS.map((point, i) => {
          const Icon = point.icon;
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <Icon className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-muted-foreground">{point.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Minimal banner for checkout/upgrade flows
 */
export function WhyWeChargeBanner({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-primary/10 border border-emerald-500/20",
      className
    )}>
      <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
        <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Your subscription powers real AI — not ads.</p>
        <p className="text-xs text-muted-foreground">Cancel anytime. No hidden fees. No data selling.</p>
      </div>
    </div>
  );
}

/**
 * Cost breakdown visual for detailed explanations
 */
export function CostBreakdown({ className }: { className?: string }) {
  const costs = [
    { icon: Cpu, label: "AI Inference", pct: 45, color: "bg-violet-500" },
    { icon: Database, label: "Data Feeds", pct: 25, color: "bg-blue-500" },
    { icon: Server, label: "Infrastructure", pct: 20, color: "bg-emerald-500" },
    { icon: Globe, label: "Operations", pct: 10, color: "bg-amber-500" }
  ];
  
  return (
    <div className={cn("p-5 rounded-xl bg-muted/30 border border-border/50", className)}>
      <h4 className="font-semibold mb-4 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        Where Your Subscription Goes
      </h4>
      
      {/* Visual bar */}
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        {costs.map((cost, i) => (
          <div 
            key={i} 
            className={cn(cost.color, "transition-all")} 
            style={{ width: `${cost.pct}%` }}
          />
        ))}
      </div>
      
      {/* Legend */}
      <div className="grid grid-cols-2 gap-3">
        {costs.map((cost, i) => {
          const Icon = cost.icon;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={cn("h-3 w-3 rounded-full", cost.color)} />
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{cost.label}</span>
              <span className="text-sm text-muted-foreground ml-auto">{cost.pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
