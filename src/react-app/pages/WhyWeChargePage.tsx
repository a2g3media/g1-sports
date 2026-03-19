import { ArrowLeft, Sparkles, Cpu, Server, Ban, Heart, ShieldCheck, Lock, UserCheck, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Separator } from "@/react-app/components/ui/separator";
import { CostBreakdown } from "@/react-app/components/WhyWeCharge";

export default function WhyWeChargePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link to="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
        </div>
      </div>
      
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-primary/20 flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Why We Charge</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Real AI costs real money. Your subscription keeps the lights on — and the ads off.
          </p>
        </div>
        
        <Separator />
        
        {/* Main Content */}
        <div className="space-y-8">
          {/* AI Costs */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Cpu className="h-6 w-6 text-violet-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Real AI. Real Costs.</h2>
                <p className="text-muted-foreground">Scout isn't a chatbot with canned responses.</p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p>
                  Every time you ask Scout a question, we run your query through advanced AI models. 
                  These aren't free — each response costs us between <strong>$0.02 and $0.08</strong> in API fees.
                </p>
                <p>
                  Live game commentary is even more intensive. When Scout watches a game for you, 
                  it's making continuous model calls to analyze plays, track momentum, and surface insights in real-time.
                </p>
                <p className="text-muted-foreground text-sm">
                  We absorb these costs so you can get genuine AI analysis — not pre-written templates or simple stat lookups.
                </p>
              </CardContent>
            </Card>
          </section>
          
          {/* Infrastructure */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Server className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Always-On Infrastructure</h2>
                <p className="text-muted-foreground">Live scores need live servers.</p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p>
                  Real-time sports data doesn't come cheap. We pay for premium data feeds that deliver 
                  scores, odds, injuries, and play-by-play across <strong>10+ sports leagues</strong>.
                </p>
                <p>
                  Push notifications require always-on infrastructure. When odds shift or a key player 
                  gets injured, you need to know instantly — not when you happen to open the app.
                </p>
                <p className="text-muted-foreground text-sm">
                  Our global edge servers ensure fast response times whether you're in New York or Tokyo.
                </p>
              </CardContent>
            </Card>
          </section>
          
          {/* No Ads */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Ban className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Zero Ads. Zero Tracking.</h2>
                <p className="text-muted-foreground">Your attention isn't for sale.</p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p>
                  Most sports apps make money from <strong>gambling ads</strong>. They take affiliate deals 
                  from sportsbooks and push you toward riskier bets because that's what pays their bills.
                </p>
                <p>
                  We don't do that. No sportsbook partnerships. No targeted betting ads following you 
                  around the internet. No selling your data to the highest bidder.
                </p>
                <p>
                  When you pay for GZ Sports, you're the customer — not the product. Our incentives 
                  align with yours: <strong>help you make better decisions</strong>, not push you toward more action.
                </p>
              </CardContent>
            </Card>
          </section>
          
          {/* Fair Pricing */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Heart className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Fair Pricing, Simple Tiers</h2>
                <p className="text-muted-foreground">You choose what fits.</p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-slate-500">F</span>
                    </div>
                    <div>
                      <p className="font-medium">Free — $0/forever</p>
                      <p className="text-sm text-muted-foreground">10 Scout questions daily, live scores. Perfect for casual fans.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-emerald-500">P</span>
                    </div>
                    <div>
                      <p className="font-medium">Pool Access — $10/year</p>
                      <p className="text-sm text-muted-foreground">Unlimited pool participation. Less than $1/month.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-amber-500">S</span>
                    </div>
                    <div>
                      <p className="font-medium">Scout Pro — $29/month</p>
                      <p className="text-sm text-muted-foreground">100 daily questions, live commentary, alerts. For serious bettors.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-violet-500">E</span>
                    </div>
                    <div>
                      <p className="font-medium">Scout Elite — $79/month</p>
                      <p className="text-sm text-muted-foreground">Unlimited everything, priority AI, command center. For power users.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
          
          {/* Cost Breakdown */}
          <CostBreakdown />
          
          <Separator />
          
          {/* Trust Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: UserCheck, text: "Cancel anytime", subtext: "No contracts" },
              { icon: Lock, text: "No hidden fees", subtext: "What you see is what you pay" },
              { icon: ShieldCheck, text: "No data selling", subtext: "Your data stays yours" },
              { icon: Ban, text: "No gambling ads", subtext: "Clean experience" }
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="text-center p-4 rounded-xl bg-muted/30 border border-border/50">
                  <Icon className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium text-sm">{item.text}</p>
                  <p className="text-xs text-muted-foreground">{item.subtext}</p>
                </div>
              );
            })}
          </div>
          
          {/* CTA */}
          <div className="text-center space-y-4 py-4">
            <p className="text-lg font-medium">Ready to get started?</p>
            <div className="flex items-center justify-center gap-3">
              <Button asChild variant="outline">
                <Link to="/settings">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Settings
                </Link>
              </Button>
              <Button asChild>
                <Link to="/settings">
                  View Plans
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
