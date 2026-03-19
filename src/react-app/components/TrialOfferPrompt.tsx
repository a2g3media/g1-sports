/**
 * TrialOfferPrompt Component
 * 
 * Shown to free users after 2-3 Scout interactions.
 * Calm, premium messaging without countdown pressure tactics.
 */

import { Button } from "@/react-app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import { Sparkles, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TrialOfferPromptProps {
  open: boolean;
  onClose: () => void;
  questionsAsked: number;
}

export function TrialOfferPrompt({ 
  open, 
  onClose,
  questionsAsked 
}: TrialOfferPromptProps) {
  const navigate = useNavigate();

  const handleStartTrial = () => {
    navigate("/settings?tab=subscription");
    onClose();
  };

  const handleDismiss = () => {
    // Mark that user dismissed this prompt
    localStorage.setItem("gz_trial_offer_dismissed", Date.now().toString());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleDismiss}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <DialogTitle className="text-center text-xl">
            You're getting the hang of Scout
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            You've asked {questionsAsked} questions. Scout Pro unlocks unlimited access 
            plus real-time game intelligence and proactive alerts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-6">
          {/* Pro Benefits */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" />
              <p className="text-sm">Unlimited Scout questions</p>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" />
              <p className="text-sm">Live scoring event commentary</p>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" />
              <p className="text-sm">Period-break analysis</p>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" />
              <p className="text-sm">Dominant performance alerts</p>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" />
              <p className="text-sm">Includes Pool Access ($10 value)</p>
            </div>
          </div>

          {/* Trial Offer */}
          <div className="text-center py-2">
            <p className="text-2xl font-bold">Try it free for 7 days</p>
            <p className="text-sm text-muted-foreground mt-1">
              Then $29/month. Cancel anytime.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-2">
            <Button 
              onClick={handleStartTrial}
              className="w-full"
              size="lg"
            >
              Start Free Trial
            </Button>
            <Button 
              onClick={handleDismiss}
              variant="ghost"
              className="w-full"
            >
              Continue with Free
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
