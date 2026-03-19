/**
 * Terms of Service Page
 * 
 * Placeholder structured content for terms of service.
 * Sections cover all key areas for a sports app with subscriptions.
 */

import { Link } from "react-router-dom";
import { ScrollText, ArrowLeft, Mail, FileCheck, Scale, CreditCard, Users, AlertTriangle, Bot } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Separator } from "@/react-app/components/ui/separator";

interface TermsSection {
  id: string;
  title: string;
  icon: typeof ScrollText;
  content: string[];
}

const TERMS_SECTIONS: TermsSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    icon: FileCheck,
    content: [
      "By accessing or using GZ Sports, you agree to be bound by these Terms of Service.",
      "If you do not agree to these terms, you may not access or use our services.",
      "We reserve the right to update these terms at any time. Continued use constitutes acceptance of changes.",
      "You must be at least 18 years old to use our services.",
      "You are responsible for maintaining the confidentiality of your account credentials.",
    ],
  },
  {
    id: "ai-usage",
    title: "AI Usage & Disclaimers",
    icon: Bot,
    content: [
      "Coach G AI provides sports information and insights for entertainment and informational purposes only.",
      "AI-generated content should not be considered professional betting advice or financial guidance.",
      "We make no guarantees about the accuracy, completeness, or reliability of AI-generated insights.",
      "You are solely responsible for any decisions made based on information provided by our AI.",
      "We are not liable for any losses incurred from following AI-generated suggestions or analysis.",
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions & Payments",
    icon: CreditCard,
    content: [
      "Paid subscriptions are billed in advance on a recurring basis (monthly or annually).",
      "Prices are subject to change with reasonable notice to existing subscribers.",
      "Free trials convert to paid subscriptions unless cancelled before the trial ends.",
      "You authorize us to charge your payment method for all fees due.",
      "Failed payments may result in suspension of premium features.",
    ],
  },
  {
    id: "cancellation",
    title: "Cancellation & Refunds",
    icon: AlertTriangle,
    content: [
      "You may cancel your subscription at any time through your account settings.",
      "Cancellation takes effect at the end of your current billing period.",
      "No partial refunds are provided for unused portions of a billing period.",
      "Refunds may be issued at our discretion for billing errors or technical issues.",
      "Annual subscriptions may be eligible for pro-rata refunds within 30 days of purchase.",
    ],
  },
  {
    id: "referrals",
    title: "Referral Program",
    icon: Users,
    content: [
      "Referral rewards are earned when a referred user completes their first paid transaction.",
      "Self-referrals and fraudulent referrals are prohibited and will result in forfeiture of rewards.",
      "We reserve the right to modify or terminate the referral program at any time.",
      "Referral bonus days are capped at 90 days maximum per user.",
      "Abuse of the referral system may result in account suspension.",
    ],
  },
  {
    id: "conduct",
    title: "User Conduct",
    icon: Scale,
    content: [
      "You agree not to use our services for any illegal or unauthorized purpose.",
      "You may not attempt to gain unauthorized access to our systems or other users' accounts.",
      "Harassment, abuse, or threatening behavior toward other users is prohibited.",
      "You may not resell, redistribute, or commercially exploit our services without permission.",
      "We reserve the right to suspend or terminate accounts that violate these terms.",
    ],
  },
];

export function TermsOfService() {
  const lastUpdated = "January 2025";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to App
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <ScrollText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Terms of Service</h1>
              <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Introduction */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-muted-foreground leading-relaxed">
              Welcome to GZ Sports. These Terms of Service ("Terms") govern your access to and use 
              of our sports intelligence platform, including our website, mobile applications, 
              Scout AI assistant, and related services (collectively, the "Services").
            </p>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-4">Contents</h2>
            <nav className="space-y-2">
              {TERMS_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <section.icon className="h-4 w-4" />
                  {section.title}
                </a>
              ))}
              <a
                href="#contact"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                Contact Information
              </a>
            </nav>
          </CardContent>
        </Card>

        {/* Terms Sections */}
        <div className="space-y-6">
          {TERMS_SECTIONS.map((section) => (
            <Card key={section.id} id={section.id} className="scroll-mt-8">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                </div>
                <ul className="space-y-3">
                  {section.content.map((item, index) => (
                    <li key={index} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="text-primary mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator className="my-8" />

        {/* Contact Section */}
        <Card id="contact" className="scroll-mt-8">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Contact Information</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm">
                <span className="font-medium">Email:</span>{" "}
                <a href="mailto:legal@gzsports.app" className="text-primary hover:underline">
                  legal@gzsports.app
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <span>•</span>
          <Link to="/" className="hover:text-foreground transition-colors">
            Back to App
          </Link>
        </div>
      </main>
    </div>
  );
}
