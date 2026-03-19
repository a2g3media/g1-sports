/**
 * PricingFAQ Component
 * 
 * Answers common questions about pricing, billing, and subscriptions.
 * Reduces friction and builds trust with clear, honest answers.
 */

import { useState } from "react";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { ChevronDown, HelpCircle, CreditCard, Ban, Shield, Clock, Gift, Smartphone } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
  icon: typeof HelpCircle;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Why do you charge for premium features?",
    answer: "We use advanced AI models (like GPT-4) that cost us money per request. Free tiers have limited AI access, while paid tiers give you more questions and real-time analysis. Your subscription keeps the lights on and funds ongoing development.",
    icon: HelpCircle,
  },
  {
    question: "Do you run ads?",
    answer: "No ads, ever. We're 100% subscription-funded. Your data is never sold to advertisers, and you'll never see banner ads or sponsored content cluttering your experience.",
    icon: Ban,
  },
  {
    question: "Can I cancel anytime?",
    answer: "Absolutely. Cancel with one tap in Settings → Subscription. You'll keep access until the end of your billing period, and we won't charge you again. No cancellation fees, no guilt trips.",
    icon: Clock,
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards through secure Stripe processing. Your card details never touch our servers—Stripe handles everything.",
    icon: CreditCard,
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use industry-standard encryption, never store passwords in plain text, and don't share your personal information with third parties. Your picks and pool data are private to you and your pool members.",
    icon: Shield,
  },
  {
    question: "What's Charter Member pricing?",
    answer: "Early supporters lock in founding rates forever. Even when prices increase after launch, charter members keep their original rate for life. It's our way of thanking early adopters.",
    icon: Gift,
  },
  {
    question: "Can I use this on mobile?",
    answer: "Yes! GZ Sports is fully responsive and works great on phones and tablets. Just visit the site in your mobile browser—no app download needed.",
    icon: Smartphone,
  },
];

interface PricingFAQProps {
  compact?: boolean;
  maxItems?: number;
  className?: string;
}

export function PricingFAQ({ compact = false, maxItems, className }: PricingFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  
  const items = maxItems ? FAQ_ITEMS.slice(0, maxItems) : FAQ_ITEMS;
  
  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <h4 className="text-sm font-semibold text-muted-foreground mb-3">Common Questions</h4>
        {items.map((item, index) => {
          const Icon = item.icon;
          const isOpen = openIndex === index;
          
          return (
            <button
              key={index}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="w-full text-left"
            >
              <div className={cn(
                "p-3 rounded-lg border transition-all",
                isOpen ? "bg-muted/50 border-primary/30" : "bg-background hover:bg-muted/30"
              )}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1">{item.question}</span>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )} />
                </div>
                {isOpen && (
                  <p className="text-sm text-muted-foreground mt-2 pl-6">
                    {item.answer}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }
  
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Frequently Asked Questions</h3>
        </div>
        
        <div className="space-y-3">
          {items.map((item, index) => {
            const Icon = item.icon;
            const isOpen = openIndex === index;
            
            return (
              <button
                key={index}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full text-left"
              >
                <div className={cn(
                  "p-4 rounded-xl border-2 transition-all",
                  isOpen 
                    ? "bg-primary/5 border-primary/30" 
                    : "bg-muted/30 border-transparent hover:border-border"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      isOpen ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Icon className={cn(
                        "h-4 w-4",
                        isOpen ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <span className={cn(
                      "font-medium flex-1",
                      isOpen && "text-primary"
                    )}>
                      {item.question}
                    </span>
                    <ChevronDown className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform",
                      isOpen && "rotate-180 text-primary"
                    )} />
                  </div>
                  
                  {isOpen && (
                    <div className="mt-3 pl-11">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Inline FAQ for quick answers in upgrade modals
 */
export function InlineFAQ({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="flex items-center gap-1">
        <Ban className="h-3 w-3" />
        No ads, ever
      </span>
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Cancel anytime
      </span>
      <span className="flex items-center gap-1">
        <Shield className="h-3 w-3" />
        Secure payments
      </span>
    </div>
  );
}
