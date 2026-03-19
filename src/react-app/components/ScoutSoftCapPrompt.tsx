/**
 * ScoutSoftCapPrompt Component
 * 
 * Shown when free users reach their daily Scout interaction limit.
 * Offers Pro trial with calm, premium messaging (no pressure tactics).
 */

import { Button } from "@/react-app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import { Sparkles, Zap, TrendingUp, Clock, Ban, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ScoutSoftCapPromptProps {
  open: boolean;
  onClose: () => void;
  questionsUsed: number;
  dailyLimit: number;
}

export function ScoutSoftCapPrompt({ 
  open, 
  onClose, 
  questionsUsed, 
  dailyLimit 
}: ScoutSoftCapPromptProps) {
  const navigate = useNavigate();

  const handleStartTrial = () => {
    navigate("/settings?tab=subscription");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/10 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-emerald-500" />
          </div>
          <DialogTitle className="text-center text-xl">
            You've reached today's Scout limit
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            You've used all {questionsUsed} of your {dailyLimit} free questions today.
            Your limit resets at midnight, or upgrade now for 100 daily questions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-6">
          {/* Pro Benefits */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium">100 Questions Per Day</p>
                <p className="text-sm text-muted-foreground">
                  10× more Scout questions than the free tier.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium">Live Game Intelligence</p>
                <p className="text-sm text-muted-foreground">
                  Real-time scoring alerts and period-break analysis.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium">Proactive Alerts</p>
                <p className="text-sm text-muted-foreground">
                  Scout notifies you of important moments automatically.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-2 pt-4">
            <Button 
              onClick={handleStartTrial}
              className="w-full"
              size="lg"
            >
              Start 7-Day Free Trial
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              $29/month after trial. Cancel anytime.
            </p>
          </div>

          <Button 
            onClick={onClose}
            variant="ghost"
            className="w-full"
          >
            Maybe Later
          </Button>
          
          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2">
            <span className="flex items-center gap-1">
              <Ban className="h-3 w-3" />
              No ads
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Cancel anytime
            </span>
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Secure
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
