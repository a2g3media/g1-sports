/**
 * ReferralCard - "Refer & Earn" section for Settings page
 * 
 * Shows:
 * - User's unique referral link with copy button
 * - Total referrals count
 * - Total bonus days earned
 * - Pending referrals (signed up but not yet paid)
 * - Recent referral activity
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { 
  Gift, Users, Copy, Check, Clock, Sparkles, 
  Share2, Loader2, Trophy, Calendar
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalBonusDaysEarned: number;
  bonusDaysRemaining: number;
  recentReferrals: Array<{
    referredAt: string;
    isRewarded: boolean;
  }>;
  config: {
    daysPerReferral: number;
    maxBonusDays: number;
  };
  bonusDaysActive: boolean;
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  highlight = false 
}: { 
  icon: typeof Users; 
  label: string; 
  value: string | number;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "p-4 rounded-xl border transition-all",
      highlight 
        ? "border-emerald-500/30 bg-emerald-500/5" 
        : "border-border bg-muted/30"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center",
          highlight ? "bg-emerald-500/10" : "bg-muted"
        )}>
          <Icon className={cn(
            "h-5 w-5",
            highlight ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )} />
        </div>
        <div>
          <p className={cn(
            "text-2xl font-bold",
            highlight && "text-emerald-600 dark:text-emerald-400"
          )}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {subtext && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReferralLinkSection({ 
  code, 
  baseUrl 
}: { 
  code: string; 
  baseUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const referralUrl = `${baseUrl}/signup?ref=${code}`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareReferral = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join GZ Sports",
          text: `Join me on GZ Sports! Use my referral link to sign up:`,
          url: referralUrl
        });
      } catch (err) {
        // User cancelled or share failed - fall back to copy
        copyToClipboard(referralUrl);
      }
    } else {
      copyToClipboard(referralUrl);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Input 
            value={referralUrl}
            readOnly
            className="pr-24 font-mono text-sm bg-muted/50"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(referralUrl)}
              className="h-7 px-2"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <Button 
          onClick={shareReferral}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
        >
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </div>
      
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">Your code:</span>
          <code className="px-2 py-0.5 bg-muted rounded font-mono font-bold">
            {code}
          </code>
        </div>
        <button 
          onClick={() => copyToClipboard(code)}
          className="text-primary hover:underline"
        >
          Copy code only
        </button>
      </div>
    </div>
  );
}

function RecentReferralsList({ 
  referrals 
}: { 
  referrals: Array<{ referredAt: string; isRewarded: boolean }>;
}) {
  if (referrals.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No referrals yet</p>
        <p className="text-xs">Share your link to start earning!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {referrals.map((ref, index) => {
        const date = new Date(ref.referredAt);
        const formattedDate = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        
        return (
          <div 
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                ref.isRewarded ? "bg-emerald-500/10" : "bg-amber-500/10"
              )}>
                {ref.isRewarded ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">
                  Friend #{index + 1}
                </p>
                <p className="text-xs text-muted-foreground">
                  Joined {formattedDate}
                </p>
              </div>
            </div>
            <Badge 
              variant={ref.isRewarded ? "default" : "secondary"}
              className={cn(
                ref.isRewarded && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              )}
            >
              {ref.isRewarded ? "+7 days" : "Pending"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export function ReferralCard() {
  const { user, isDemoMode } = useDemoAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setLoading(false);
      return;
    }
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/referrals/stats");
        if (res.status === 401 || res.status === 403) {
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch referral stats");
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        } else {
          throw new Error(data.error || "Unknown error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load referral data");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isDemoMode, user?.id]);

  const baseUrl = typeof window !== "undefined" 
    ? window.location.origin 
    : "";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Gift className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Refer & Earn
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <Sparkles className="h-3 w-3 mr-1" />
                Free Pro Days
              </Badge>
            </CardTitle>
            <CardDescription>
              Invite friends and earn free Pro days when they upgrade
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        ) : stats ? (
          <>
            {/* How it works */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-500/10">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-500" />
                How it works
              </h4>
              <ol className="text-sm text-muted-foreground space-y-1.5 ml-6 list-decimal">
                <li>Share your unique referral link with friends</li>
                <li>They sign up and upgrade to a paid plan</li>
                <li>You earn <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.config.daysPerReferral} free Pro days</span> per friend</li>
              </ol>
              <p className="text-xs text-muted-foreground/70 mt-2 ml-6">
                Stack up to {stats.config.maxBonusDays} bonus days total
              </p>
            </div>

            {/* Referral Link */}
            <div>
              <h4 className="font-medium text-sm mb-3">Your Referral Link</h4>
              <ReferralLinkSection code={stats.referralCode} baseUrl={baseUrl} />
            </div>

            <Separator />

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard 
                icon={Users}
                label="Total Referrals"
                value={stats.totalReferrals}
              />
              <StatCard 
                icon={Calendar}
                label="Bonus Days Earned"
                value={stats.totalBonusDaysEarned}
                highlight={stats.totalBonusDaysEarned > 0}
              />
            </div>

            {/* Active bonus days banner */}
            {stats.bonusDaysRemaining > 0 && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-medium text-emerald-700 dark:text-emerald-300">
                        {stats.bonusDaysRemaining} bonus days remaining
                      </p>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                        Enjoying free Pro access from referrals!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pending referrals notice */}
            {stats.pendingReferrals > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-amber-700 dark:text-amber-300">
                    <strong>{stats.pendingReferrals}</strong> friend{stats.pendingReferrals !== 1 ? 's' : ''} signed up — waiting for upgrade
                  </span>
                </div>
              </div>
            )}

            {/* Recent referrals */}
            {stats.recentReferrals.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-3">Recent Referrals</h4>
                <RecentReferralsList referrals={stats.recentReferrals} />
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
