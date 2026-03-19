/**
 * Feature Lock Component
 * 
 * Displays a locked feature overlay with upgrade prompt.
 * Used to gate premium features based on subscription tier.
 */

import { Lock, Zap, Crown, Shield } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { useGZSubscription } from "@/react-app/hooks/useGZSubscription";
import { useState } from "react";

interface FeatureLockProps {
  featureName: string;
  requiredTier: 'pool_access' | 'scout_pro' | 'scout_elite';
  description?: string;
  children?: React.ReactNode;
  variant?: 'overlay' | 'card' | 'inline';
}

const TIER_INFO: Record<'pool_access' | 'scout_pro' | 'scout_elite', {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  color: string;
  price: string;
}> = {
  pool_access: {
    icon: Shield,
    name: 'Pool Access',
    color: 'text-blue-500',
    price: '$10/year',
  },
  scout_pro: {
    icon: Zap,
    name: 'Scout Pro',
    color: 'text-purple-500',
    price: '$19/month',
  },
  scout_elite: {
    icon: Crown,
    name: 'Scout Elite',
    color: 'text-amber-500',
    price: '$79/month',
  },
};

export function FeatureLock({
  featureName,
  requiredTier,
  description,
  children,
  variant = 'overlay',
}: FeatureLockProps) {
  const { subscription, startTrial } = useGZSubscription();
  const [isStartingTrial, setIsStartingTrial] = useState(false);
  
  const tierInfo = TIER_INFO[requiredTier];
  const TierIcon = tierInfo.icon;

  // Check if this tier offers a trial
  const canTrial = requiredTier === 'scout_pro';

  const handleStartTrial = async () => {
    if (!canTrial) return;
    
    setIsStartingTrial(true);
    const result = await startTrial('scout_pro_monthly_charter');
    
    if (result.success) {
      // Success - subscription hook will update automatically
    } else {
      alert(result.error || 'Failed to start trial');
    }
    setIsStartingTrial(false);
  };

  const handleUpgrade = () => {
    // TODO: Open upgrade modal or redirect to subscription page
    window.location.href = '/settings?tab=subscription';
  };

  if (variant === 'overlay') {
    return (
      <div className="relative">
        {/* Blurred content */}
        <div className="pointer-events-none blur-sm opacity-50">
          {children}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="max-w-md p-6 space-y-4 text-center border-2">
            <div className="flex justify-center">
              <div className={`p-3 rounded-full bg-muted ${tierInfo.color}`}>
                <TierIcon className="h-6 w-6" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{featureName}</h3>
              <p className="text-sm text-muted-foreground">
                {description || `This feature requires ${tierInfo.name}`}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className={tierInfo.color}>
                {tierInfo.name}
              </Badge>
              <span className="text-sm text-muted-foreground">{tierInfo.price}</span>
            </div>

            <div className="flex gap-2">
              {canTrial && !subscription.isTrialing && (
                <Button
                  onClick={handleStartTrial}
                  disabled={isStartingTrial}
                  variant="default"
                  className="flex-1"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isStartingTrial ? 'Starting...' : 'Start 7-Day Trial'}
                </Button>
              )}
              <Button
                onClick={handleUpgrade}
                variant={canTrial ? "outline" : "default"}
                className="flex-1"
              >
                <Lock className="h-4 w-4 mr-2" />
                Upgrade
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className="p-6 space-y-4 text-center border-2">
        <div className="flex justify-center">
          <div className={`p-3 rounded-full bg-muted ${tierInfo.color}`}>
            <TierIcon className="h-6 w-6" />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{featureName}</h3>
          <p className="text-sm text-muted-foreground">
            {description || `This feature requires ${tierInfo.name}`}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className={tierInfo.color}>
            {tierInfo.name}
          </Badge>
          <span className="text-sm text-muted-foreground">{tierInfo.price}</span>
        </div>

        <div className="flex gap-2">
          {canTrial && !subscription.isTrialing && (
            <Button
              onClick={handleStartTrial}
              disabled={isStartingTrial}
              variant="default"
              className="flex-1"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isStartingTrial ? 'Starting...' : 'Start 7-Day Trial'}
            </Button>
          )}
          <Button
            onClick={handleUpgrade}
            variant={canTrial ? "outline" : "default"}
            className="flex-1"
          >
            <Lock className="h-4 w-4 mr-2" />
            Upgrade
          </Button>
        </div>
      </Card>
    );
  }

  // Inline variant
  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded-lg">
      <Lock className={`h-4 w-4 ${tierInfo.color}`} />
      <span className="text-sm text-muted-foreground flex-1">
        {description || `${featureName} requires ${tierInfo.name}`}
      </span>
      <Button onClick={handleUpgrade} size="sm" variant="outline">
        Upgrade
      </Button>
    </div>
  );
}

/**
 * Higher-order component to conditionally lock features
 */
export function withFeatureLock<P extends object>(
  Component: React.ComponentType<P>,
  featureName: string,
  requiredTier: 'pool_access' | 'scout_pro' | 'scout_elite',
  featureCheck: (features: any) => boolean
) {
  return function WrappedComponent(props: P) {
    const { features } = useGZSubscription();
    const hasAccess = featureCheck(features);

    if (!hasAccess) {
      return (
        <FeatureLock
          featureName={featureName}
          requiredTier={requiredTier}
          variant="card"
        />
      );
    }

    return <Component {...props} />;
  };
}
