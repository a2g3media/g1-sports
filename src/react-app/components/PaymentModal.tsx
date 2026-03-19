import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/react-app/components/ui/dialog";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  CreditCard, 
  Wallet, 
  Smartphone, 
  CheckCircle2, 
  Loader2,
  ExternalLink,
  Shield,
  AlertCircle,
  Clock
} from "lucide-react";
import { formatCurrency, ESCROW_PROVIDERS, type EscrowProvider } from "@/shared/escrow";
import { cn } from "@/react-app/lib/utils";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueId: number;
  leagueName: string;
  entryFeeCents: number;
  onPaymentComplete?: () => void;
}

interface PaymentIntent {
  transactionId: number;
  providerTxnId: string;
  provider: EscrowProvider;
  amountCents: number;
  currency: string;
  status: string;
  redirectUrl: string | null;
  message: string;
}

type PaymentStage = "select" | "processing" | "pending" | "success" | "error";

const providerIcons: Record<EscrowProvider, React.ReactNode> = {
  stripe: <CreditCard className="h-5 w-5" />,
  paypal: <Wallet className="h-5 w-5" />,
  venmo: <Smartphone className="h-5 w-5" />,
  manual: <CheckCircle2 className="h-5 w-5" />,
};

export function PaymentModal({
  isOpen,
  onClose,
  leagueId,
  leagueName,
  entryFeeCents,
  onPaymentComplete,
}: PaymentModalProps) {
  const [stage, setStage] = useState<PaymentStage>("select");
  const [selectedProvider, setSelectedProvider] = useState<EscrowProvider | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectProvider = async (provider: EscrowProvider) => {
    setSelectedProvider(provider);
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/leagues/${leagueId}/payments/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider,
          intentType: "entry_fee",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment");
      }

      setPaymentIntent(data);

      if (provider === "manual") {
        // Manual payments go to pending review
        setStage("pending");
      } else if (data.redirectUrl) {
        // External providers - show processing then simulate redirect
        setStage("processing");
        // In production, this would redirect to the payment provider
        // For demo, we simulate a successful payment after a delay
        setTimeout(() => {
          simulateWebhook(data.providerTxnId, provider);
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setStage("error");
    } finally {
      setIsLoading(false);
    }
  };

  const simulateWebhook = async (providerTxnId: string, provider: EscrowProvider) => {
    // Simulate webhook callback for demo purposes
    try {
      const response = await fetch(`/api/webhooks/escrow/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerTxnId,
          status: "completed",
          signature: "demo_signature",
        }),
      });

      if (response.ok) {
        setStage("success");
        onPaymentComplete?.();
      } else {
        setStage("error");
        setError("Payment verification failed");
      }
    } catch {
      setStage("error");
      setError("Payment verification failed");
    }
  };

  const handleClose = () => {
    if (stage === "processing") return; // Don't allow close during processing
    setStage("select");
    setSelectedProvider(null);
    setPaymentIntent(null);
    setError("");
    onClose();
  };

  const handleTryAgain = () => {
    setStage("select");
    setSelectedProvider(null);
    setPaymentIntent(null);
    setError("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {/* Provider Selection */}
        {stage === "select" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Pay Entry Fee
              </DialogTitle>
              <DialogDescription>
                Select a payment method to join {leagueName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Amount Display */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-center">
                <p className="text-sm text-muted-foreground mb-1">Entry Fee</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(entryFeeCents)}
                </p>
              </div>

              {/* Provider Options */}
              <div className="space-y-2">
                {(Object.entries(ESCROW_PROVIDERS) as [EscrowProvider, typeof ESCROW_PROVIDERS[EscrowProvider]][]).map(
                  ([key, provider]) => (
                    <button
                      key={key}
                      onClick={() => handleSelectProvider(key)}
                      disabled={isLoading}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-lg border transition-all",
                        "hover:border-primary/50 hover:bg-primary/5",
                        selectedProvider === key && isLoading
                          ? "border-primary bg-primary/5"
                          : "border-border",
                        "disabled:opacity-50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        key === "stripe" && "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
                        key === "paypal" && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
                        key === "venmo" && "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
                        key === "manual" && "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                      )}>
                        {providerIcons[key]}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>
                      {selectedProvider === key && isLoading && (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      )}
                      {provider.isExternal && (
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  )
                )}
              </div>

              {/* Security Note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  POOLVAULT tracks payment eligibility only. Funds are processed 
                  through secure external providers. Your payment information is 
                  never stored by POOLVAULT.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Processing State */}
        {stage === "processing" && (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Processing Payment</h3>
              <p className="text-muted-foreground mt-1">
                Connecting to {selectedProvider && ESCROW_PROVIDERS[selectedProvider].name}...
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Please don't close this window
            </p>
          </div>
        )}

        {/* Pending Manual Review */}
        {stage === "pending" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Payment Pending Review
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm">
                  Your manual payment request has been submitted. A league admin 
                  will verify your payment and mark it as complete.
                </p>
              </div>
              {paymentIntent && (
                <div className="p-3 rounded-lg bg-muted space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(paymentIntent.amountCents)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference:</span>
                    <code className="text-xs">{paymentIntent.providerTxnId}</code>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Share this reference number with your league admin as proof of payment intent.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Success State */}
        {stage === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Payment Complete!</h3>
              <p className="text-muted-foreground mt-1">
                Your entry fee has been verified. You're now eligible to make picks!
              </p>
            </div>
            {paymentIntent && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-mono font-medium text-green-600">
                    {formatCurrency(paymentIntent.amountCents)}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter className="sm:justify-center">
              <Button onClick={handleClose} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Continue to League
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Error State */}
        {stage === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Payment Failed
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="text-sm">{error}</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleTryAgain}>
                Try Again
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Payment status badge for use in other components
export function PaymentStatusBadge({ 
  isVerified, 
  isPending,
  compact = false 
}: { 
  isVerified: boolean; 
  isPending?: boolean;
  compact?: boolean;
}) {
  if (isVerified) {
    return (
      <Badge variant="default" className={cn("gap-1 bg-green-600", compact && "text-xs px-1.5 py-0")}>
        <CheckCircle2 className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
        {!compact && "Paid"}
      </Badge>
    );
  }

  if (isPending) {
    return (
      <Badge variant="secondary" className={cn("gap-1", compact && "text-xs px-1.5 py-0")}>
        <Clock className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
        {!compact && "Pending"}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1 text-amber-600 border-amber-300", compact && "text-xs px-1.5 py-0")}>
      <AlertCircle className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
      {!compact && "Unpaid"}
    </Badge>
  );
}
