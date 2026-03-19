/**
 * TrialBadge Component
 * 
 * Shows a prominent badge when user is on a free trial.
 * Displays countdown and links to subscription management.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Clock, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useSubscription } from "@/react-app/hooks/useSubscription";

interface TrialBadgeProps {
  variant?: "header" | "compact" | "expanded";
  className?: string;
}

export function TrialBadge({ variant = "header", className }: TrialBadgeProps) {
  const { subscription, trialDaysRemaining, loading } = useSubscription();
  const [pulseUrgent, setPulseUrgent] = useState(false);

  // Pulse animation when trial is ending soon
  useEffect(() => {
    if (trialDaysRemaining <= 2 && trialDaysRemaining > 0) {
      setPulseUrgent(true);
    }
  }, [trialDaysRemaining]);

  // Don't show if not trialing or still loading
  if (loading || !subscription?.isTrialing) {
    return null;
  }

  const isUrgent = trialDaysRemaining <= 2;
  const isLastDay = trialDaysRemaining <= 1;

  // Format the trial end date
  const trialEndsAt = subscription.trialEndsAt 
    ? new Date(subscription.trialEndsAt) 
    : null;
  const formattedEndDate = trialEndsAt?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (variant === "compact") {
    return (
      <Link 
        to="/settings?tab=subscription"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
          "hover:scale-105 active:scale-95",
          isUrgent
            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30"
            : "bg-primary/10 text-primary hover:bg-primary/20",
          pulseUrgent && "animate-pulse",
          className
        )}
      >
        <Clock className="h-3 w-3" />
        <span>{trialDaysRemaining}d</span>
      </Link>
    );
  }

  if (variant === "expanded") {
    return (
      <div className={cn(
        "p-4 rounded-xl border transition-all",
        isUrgent
          ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          : "bg-primary/5 border-primary/20",
        className
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            isUrgent 
              ? "bg-amber-100 dark:bg-amber-900/50" 
              : "bg-primary/10"
          )}>
            {isLastDay ? (
              <Sparkles className={cn(
                "h-5 w-5",
                isUrgent ? "text-amber-600 dark:text-amber-400" : "text-primary"
              )} />
            ) : (
              <Clock className={cn(
                "h-5 w-5",
                isUrgent ? "text-amber-600 dark:text-amber-400" : "text-primary"
              )} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "font-semibold",
                isUrgent 
                  ? "text-amber-900 dark:text-amber-100" 
                  : "text-foreground"
              )}>
                {isLastDay 
                  ? "Trial ends today!" 
                  : `${trialDaysRemaining} days left in trial`}
              </span>
            </div>
            <p className={cn(
              "text-sm mb-3",
              isUrgent 
                ? "text-amber-700 dark:text-amber-300" 
                : "text-muted-foreground"
            )}>
              {isLastDay 
                ? "Add a payment method now to keep your Scout Pro features"
                : `Your trial ends ${formattedEndDate}. Enjoy full access to Scout Pro features.`}
            </p>
            
            {/* Progress bar showing time remaining */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Trial started</span>
                <span>{formattedEndDate}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isUrgent 
                      ? "bg-gradient-to-r from-amber-500 to-red-500" 
                      : "bg-gradient-to-r from-primary to-primary/70"
                  )}
                  style={{ width: `${Math.max(5, (7 - trialDaysRemaining) / 7 * 100)}%` }}
                />
              </div>
            </div>

            <Link 
              to="/settings?tab=subscription"
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
                isUrgent 
                  ? "text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
                  : "text-primary hover:text-primary/80"
              )}
            >
              Manage subscription
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Default header variant
  return (
    <Link 
      to="/settings?tab=subscription"
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
        "hover:scale-[1.02] active:scale-98 cursor-pointer",
        isUrgent
          ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-300 border border-amber-300/50 dark:border-amber-700/50"
          : "bg-primary/10 text-primary border border-primary/20",
        pulseUrgent && "animate-pulse",
        className
      )}
    >
      <div className={cn(
        "h-6 w-6 rounded-md flex items-center justify-center",
        isUrgent 
          ? "bg-amber-500/20" 
          : "bg-primary/10"
      )}>
        <Clock className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col items-start leading-none">
        <span className="text-xs font-semibold">
          {isLastDay ? "Last day!" : `${trialDaysRemaining} days left`}
        </span>
        <span className="text-[10px] opacity-70">
          Pro trial
        </span>
      </div>
      <ChevronRight className="h-4 w-4 opacity-50" />
    </Link>
  );
}

/**
 * TrialCountdownCard - Settings page countdown widget
 */
export function TrialCountdownCard() {
  const { subscription, trialDaysRemaining, loading } = useSubscription();

  if (loading || !subscription?.isTrialing) {
    return null;
  }

  const isUrgent = trialDaysRemaining <= 2;
  const trialEndsAt = subscription.trialEndsAt 
    ? new Date(subscription.trialEndsAt) 
    : null;

  // Calculate hours remaining for last day
  const hoursRemaining = trialEndsAt 
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60)))
    : 0;

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-6",
      isUrgent
        ? "bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-red-500/20 border-2 border-amber-400/50"
        : "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20"
    )}>
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-white/5 to-transparent rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center",
              isUrgent 
                ? "bg-amber-500/20" 
                : "bg-primary/10"
            )}>
              <Sparkles className={cn(
                "h-6 w-6",
                isUrgent ? "text-amber-600 dark:text-amber-400" : "text-primary"
              )} />
            </div>
            <div>
              <h3 className={cn(
                "font-bold text-lg",
                isUrgent ? "text-amber-900 dark:text-amber-100" : "text-foreground"
              )}>
                Scout Pro Trial
              </h3>
              <p className="text-sm text-muted-foreground">
                Full access to premium features
              </p>
            </div>
          </div>
        </div>

        {/* Countdown display */}
        <div className="flex items-center gap-4 mb-4">
          <div className={cn(
            "flex-1 p-4 rounded-xl text-center",
            isUrgent 
              ? "bg-amber-500/10" 
              : "bg-background/50"
          )}>
            <div className={cn(
              "text-4xl font-bold tabular-nums",
              isUrgent ? "text-amber-600 dark:text-amber-400" : "text-primary"
            )}>
              {trialDaysRemaining}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
              Days Left
            </div>
          </div>
          
          {trialDaysRemaining <= 1 && (
            <div className={cn(
              "flex-1 p-4 rounded-xl text-center",
              "bg-red-500/10"
            )}>
              <div className="text-4xl font-bold tabular-nums text-red-600 dark:text-red-400">
                {hoursRemaining}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                Hours Left
              </div>
            </div>
          )}
        </div>

        {/* Trial features reminder */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            "100 Scout questions/day",
            "Live game commentary",
            "Proactive alerts",
            "Period summaries"
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                isUrgent ? "bg-amber-500" : "bg-primary"
              )} />
              <span className="text-muted-foreground">{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex gap-3">
          <Link 
            to="/settings?tab=subscription"
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all",
              isUrgent
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            )}
          >
            <Sparkles className="h-4 w-4" />
            Add Payment Method
          </Link>
        </div>

        {/* Trial end date */}
        <p className="text-center text-xs text-muted-foreground mt-3">
          Trial ends {trialEndsAt?.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
