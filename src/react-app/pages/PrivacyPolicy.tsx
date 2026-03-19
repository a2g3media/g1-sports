/**
 * Privacy Policy Page
 * 
 * Placeholder structured content for privacy policy.
 * Sections cover all key areas for a sports app with AI features.
 */

import { Link } from "react-router-dom";
import { Shield, ArrowLeft, Mail, Database, Bot, CreditCard, Users, XCircle } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent } from "@/react-app/components/ui/card";
import { Separator } from "@/react-app/components/ui/separator";

interface PolicySection {
  id: string;
  title: string;
  icon: typeof Shield;
  content: string[];
}

const POLICY_SECTIONS: PolicySection[] = [
  {
    id: "data-collection",
    title: "Data Collection",
    icon: Database,
    content: [
      "We collect information you provide when creating an account, including your email address and display name.",
      "When you use Google Sign-In, we receive your name, email, and profile picture from Google.",
      "We collect usage data including pages viewed, features used, and interactions with the Coach G AI assistant.",
      "Device information such as browser type, operating system, and IP address may be collected for security and analytics.",
      "We use cookies and similar technologies to maintain your session and remember your preferences.",
    ],
  },
  {
    id: "ai-usage",
    title: "AI Usage & Data",
    icon: Bot,
    content: [
      "Our Coach G AI assistant processes your questions to provide sports insights and commentary.",
      "Conversations with Coach G may be used to improve our AI models and service quality.",
      "We do not share your individual conversations with third parties for marketing purposes.",
      "AI-generated insights are for informational purposes only and should not be considered betting advice.",
      "You can request deletion of your AI conversation history through your account settings.",
    ],
  },
  {
    id: "payment-processing",
    title: "Payment Processing",
    icon: CreditCard,
    content: [
      "Payment processing is handled by secure third-party providers (e.g., Stripe).",
      "We do not store your full credit card number, CVV, or other sensitive payment details on our servers.",
      "Transaction history and subscription status are stored to manage your account.",
      "Billing information such as name and billing address may be collected for payment processing.",
      "Refund requests are processed according to our cancellation policy.",
    ],
  },
  {
    id: "referral-program",
    title: "Referral Program",
    icon: Users,
    content: [
      "When you participate in our referral program, we track referral codes and successful referrals.",
      "We store information about who referred you and who you have referred.",
      "Referral rewards are processed automatically when conditions are met.",
      "Referral data is used to prevent abuse and ensure fair distribution of rewards.",
      "You can view your referral statistics in your account settings.",
    ],
  },
  {
    id: "cancellation",
    title: "Cancellation & Data Deletion",
    icon: XCircle,
    content: [
      "You can cancel your subscription at any time through your account settings.",
      "Upon cancellation, you retain access until the end of your current billing period.",
      "You may request deletion of your account and associated data by contacting support.",
      "Some data may be retained for legal compliance, fraud prevention, or legitimate business purposes.",
      "Pool participation history may be retained in aggregate form for pool integrity.",
    ],
  },
];

export function PrivacyPolicy() {
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
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Privacy Policy</h1>
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
              GZ Sports ("we," "our," or "us") is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, disclose, and safeguard your 
              information when you use our sports intelligence platform and services.
            </p>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-4">Contents</h2>
            <nav className="space-y-2">
              {POLICY_SECTIONS.map((section) => (
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

        {/* Policy Sections */}
        <div className="space-y-6">
          {POLICY_SECTIONS.map((section) => (
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
              If you have questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm">
                <span className="font-medium">Email:</span>{" "}
                <a href="mailto:privacy@gzsports.app" className="text-primary hover:underline">
                  privacy@gzsports.app
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
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
