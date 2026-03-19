import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/react-app/components/ui/dialog";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Shield, Lock, Check, AlertTriangle, Fingerprint, 
  Clock, FileCheck, Sparkles, Copy, Mail, MessageSquare,
  ExternalLink, RefreshCw, CheckCircle2
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface Pick {
  event_id: number;
  pick_value: string;
  confidence_rank?: number;
}

interface DeliveryStatus {
  channel: string;
  status: string;
}

interface SubmissionResult {
  receiptCode: string;
  hash: string;
  isUpdate?: boolean;
  previousReceiptCode?: string;
  deliveries?: DeliveryStatus[];
}

interface SubmitConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<SubmissionResult | null>;
  picks: Pick[];
  periodId: string;
  leagueName: string;
  tiebreaker?: string;
}

type Stage = "review" | "processing" | "stamping" | "complete" | "error";

// Impact particles that burst from stamp center
const impactParticles = [
  { angle: 0, distance: 80, delay: 0 },
  { angle: 45, distance: 90, delay: 0.02 },
  { angle: 90, distance: 75, delay: 0.04 },
  { angle: 135, distance: 85, delay: 0.06 },
  { angle: 180, distance: 80, delay: 0.08 },
  { angle: 225, distance: 90, delay: 0.1 },
  { angle: 270, distance: 75, delay: 0.12 },
  { angle: 315, distance: 85, delay: 0.14 },
  { angle: 22, distance: 100, delay: 0.03 },
  { angle: 67, distance: 95, delay: 0.07 },
  { angle: 112, distance: 100, delay: 0.11 },
  { angle: 157, distance: 95, delay: 0.05 },
  { angle: 202, distance: 100, delay: 0.09 },
  { angle: 247, distance: 95, delay: 0.13 },
  { angle: 292, distance: 100, delay: 0.01 },
  { angle: 337, distance: 95, delay: 0.15 },
];

// Sparkle positions around the stamp
const sparklePositions = [
  { x: -65, y: -45, delay: 0.2, size: 14 },
  { x: 55, y: -55, delay: 0.25, size: 12 },
  { x: 75, y: 15, delay: 0.3, size: 16 },
  { x: -75, y: 25, delay: 0.35, size: 13 },
  { x: 45, y: 65, delay: 0.4, size: 15 },
  { x: -55, y: 55, delay: 0.45, size: 11 },
  { x: 0, y: -75, delay: 0.22, size: 14 },
  { x: 65, y: -25, delay: 0.28, size: 12 },
];

function ImpactParticle({ angle, distance, delay }: { angle: number; distance: number; delay: number }) {
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * distance;
  const y = Math.sin(rad) * distance;
  
  return (
    <div
      className="absolute w-2 h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 animate-impact-particle"
      style={{
        left: "50%",
        top: "50%",
        "--particle-x": `${x}px`,
        "--particle-y": `${y}px`,
        animationDelay: `${delay}s`,
      } as React.CSSProperties}
    />
  );
}

function Sparkle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  return (
    <div
      className="absolute animate-sparkle pointer-events-none"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        animationDelay: `${delay}s`,
      }}
    >
      <Sparkles 
        className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" 
        style={{ width: size, height: size }}
      />
    </div>
  );
}

function ReceiptCodeDisplay({ code, animate }: { code: string; animate: boolean }) {
  if (!animate) {
    return (
      <span className="font-mono text-3xl font-bold tracking-widest">
        {code}
      </span>
    );
  }

  return (
    <div className="flex justify-center gap-0.5">
      {code.split("").map((char, i) => (
        <span
          key={i}
          className={cn(
            "font-mono text-3xl font-bold inline-block",
            char === "-" ? "text-muted-foreground mx-1" : "text-emerald-600 dark:text-emerald-400"
          )}
          style={{
            animation: `char-reveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.6 + 0.05 * i}s forwards`,
            opacity: 0,
          }}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

function OfficialStamp({ showParticles }: { showParticles: boolean }) {
  return (
    <div className="relative">
      {/* Impact particles */}
      {showParticles && impactParticles.map((p, i) => (
        <ImpactParticle key={i} {...p} />
      ))}
      
      {/* Expanding shockwave rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-36 h-36 rounded-full border-2 border-emerald-500/60 animate-shockwave" />
        <div className="absolute w-36 h-36 rounded-full border border-emerald-400/40 animate-shockwave" style={{ animationDelay: "0.1s" }} />
        <div className="absolute w-36 h-36 rounded-full border border-emerald-300/20 animate-shockwave" style={{ animationDelay: "0.2s" }} />
      </div>
      
      {/* Sparkles */}
      {showParticles && sparklePositions.map((pos, i) => (
        <Sparkle key={i} {...pos} />
      ))}
      
      {/* Main stamp body */}
      <div className="relative animate-stamp-drop">
        {/* Outer decorative ring */}
        <div className="absolute -inset-4 rounded-full border-2 border-dashed border-emerald-400/40 animate-spin-slow" />
        
        {/* Stamp shadow (appears on impact) */}
        <div className="absolute inset-0 rounded-full bg-emerald-900/20 blur-xl animate-stamp-shadow" />
        
        {/* Main stamp circle */}
        <div className="relative w-36 h-36 rounded-full border-[5px] border-emerald-500 bg-gradient-to-br from-background via-background to-emerald-50/30 dark:to-emerald-950/30 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.3)] animate-stamp-glow">
          {/* Inner ring */}
          <div className="absolute inset-2 rounded-full border-2 border-emerald-400/50" />
          
          {/* Stamp content */}
          <div className="text-center relative z-10">
            {/* Animated checkmark */}
            <svg className="h-12 w-12 mx-auto mb-0.5" viewBox="0 0 24 24" fill="none">
              <circle 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="hsl(142 71% 45%)" 
                strokeWidth="1.5" 
                strokeDasharray="63"
                className="animate-circle-draw"
                fill="none"
              />
              <path 
                d="M7 12.5l3 3 7-7" 
                stroke="hsl(142 71% 45%)" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="animate-draw-check"
              />
            </svg>
            <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] block">
              Official
            </span>
          </div>
          
          {/* Notch details */}
          {[0, 90, 180, 270].map((angle) => (
            <div 
              key={angle}
              className="absolute w-1.5 h-3 bg-emerald-500 rounded-full"
              style={{
                left: "50%",
                top: "50%",
                transform: `rotate(${angle}deg) translateY(-66px) translateX(-50%)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DeliveryStatusIndicator({ deliveries }: { deliveries: DeliveryStatus[] }) {
  if (!deliveries || deliveries.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        Confirmation Delivery
      </span>
      <div className="flex flex-wrap gap-2">
        {deliveries.map((delivery, idx) => {
          const Icon = delivery.channel === 'email' ? Mail : MessageSquare;
          const isPending = delivery.status === 'pending';
          const isSent = delivery.status === 'sent' || delivery.status === 'delivered';
          
          return (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
                isPending && "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
                isSent && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
              )}
            >
              <Icon className={cn(
                "h-4 w-4",
                isPending && "text-amber-600 dark:text-amber-400",
                isSent && "text-emerald-600 dark:text-emerald-400"
              )} />
              <span className="capitalize font-medium">
                {delivery.channel}
              </span>
              {isPending && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Sending
                </span>
              )}
              {isSent && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Sent
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SubmitConfirmation({
  isOpen,
  onClose,
  onConfirm,
  picks,
  periodId,
  leagueName,
  tiebreaker,
}: SubmitConfirmationProps) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("review");
  const [receiptCode, setReceiptCode] = useState("");
  const [hash, setHash] = useState("");
  const [isUpdate, setIsUpdate] = useState(false);
  const [previousReceiptCode, setPreviousReceiptCode] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryStatus[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [showParticles, setShowParticles] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submittedAt] = useState(() => new Date());

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStage("review");
      setReceiptCode("");
      setHash("");
      setIsUpdate(false);
      setPreviousReceiptCode(null);
      setDeliveries([]);
      setError("");
      setProgress(0);
      setShowParticles(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Progress animation during processing
  useEffect(() => {
    if (stage === "processing") {
      const interval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 92));
      }, 150);
      return () => clearInterval(interval);
    }
  }, [stage]);

  // Trigger particles after stamp lands
  useEffect(() => {
    if (stage === "stamping") {
      // Particles appear when stamp "impacts"
      const timer = setTimeout(() => setShowParticles(true), 350);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  const handleConfirm = async () => {
    setStage("processing");
    setProgress(0);

    // Minimum processing time for deliberate feel
    const minDelay = new Promise(resolve => setTimeout(resolve, 1800));
    
    try {
      const [result] = await Promise.all([onConfirm(), minDelay]);
      
      if (result) {
        setReceiptCode(result.receiptCode);
        setHash(result.hash);
        setIsUpdate(result.isUpdate || false);
        setPreviousReceiptCode(result.previousReceiptCode || null);
        setDeliveries(result.deliveries || []);
        setProgress(100);
        
        // Brief pause at 100% before stamp
        await new Promise(resolve => setTimeout(resolve, 300));
        setStage("stamping");
        
        // Stamp animation duration then complete
        await new Promise(resolve => setTimeout(resolve, 2200));
        setStage("complete");
      } else {
        throw new Error("Failed to submit picks");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setStage("error");
    }
  };

  const handleClose = () => {
    if (stage === "processing" || stage === "stamping") return;
    onClose();
  };

  const copyReceiptCode = useCallback(() => {
    navigator.clipboard.writeText(receiptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [receiptCode]);

  const handleViewReceipt = () => {
    onClose();
    navigate(`/receipts/${receiptCode}`);
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className={cn(
          "sm:max-w-md overflow-hidden",
          stage === "stamping" && "animate-dialog-shake"
        )}
      >
        {/* Review Stage */}
        {stage === "review" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4 ring-4 ring-amber-200/50 dark:ring-amber-800/30">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold">Confirm Your Picks</h2>
              <p className="text-muted-foreground mt-1">
                This will lock in your selections
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 space-y-3 border border-border/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">League</span>
                <span className="font-medium">{leagueName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Period</span>
                <span className="font-medium">{periodId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Picks</span>
                <span className="font-medium">{picks.length} selection{picks.length !== 1 ? "s" : ""}</span>
              </div>
              {tiebreaker && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tiebreaker</span>
                  <span className="font-medium">{tiebreaker} pts</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/50">
              <Lock className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Your picks will be cryptographically sealed with a SHA-256 hash. 
                You can submit multiple times before lock—only your most recent valid submission counts.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Go Back
              </Button>
              <Button onClick={handleConfirm} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Shield className="h-4 w-4" />
                Lock In Picks
              </Button>
            </div>
          </div>
        )}

        {/* Processing Stage */}
        {stage === "processing" && (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 relative">
                <Fingerprint className="h-10 w-10 text-primary animate-pulse-subtle" />
                {/* Scanning effect */}
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-transparent animate-scan-line" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-primary/20 animate-ping-slow" />
              </div>
              <h2 className="text-xl font-bold">Securing Your Picks</h2>
              <p className="text-muted-foreground mt-1">
                Generating cryptographic seal...
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-2 px-2">
              <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 bg-[length:200%_100%] animate-shimmer transition-all duration-300 ease-out relative rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="animate-pulse">
                  {progress < 25 && "Validating selections..."}
                  {progress >= 25 && progress < 50 && "Computing hash..."}
                  {progress >= 50 && progress < 75 && "Generating receipt..."}
                  {progress >= 75 && progress < 95 && "Sealing submission..."}
                  {progress >= 95 && "Finalizing..."}
                </span>
                <span className="font-mono font-medium">{Math.round(progress)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 animate-spin" style={{ animationDuration: "3s" }} />
              <span>Please wait, do not close this window</span>
            </div>
          </div>
        )}

        {/* Stamping Stage - The dramatic moment */}
        {stage === "stamping" && (
          <div className="py-8 flex flex-col items-center justify-center min-h-[380px] relative overflow-visible">
            {/* Background flash on impact */}
            <div className="absolute inset-0 bg-emerald-500/10 animate-impact-flash rounded-lg" />
            
            {/* Radial glow */}
            <div 
              className="absolute inset-0 opacity-60"
              style={{
                background: "radial-gradient(circle at center, hsl(142 71% 45% / 0.15) 0%, transparent 70%)",
              }}
            />
            
            {/* Main stamp */}
            <OfficialStamp showParticles={showParticles} />

            {/* Receipt code preview */}
            <div className="mt-10 text-center animate-fade-in-up" style={{ animationDelay: "0.6s", opacity: 0 }}>
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-2 font-medium">
                Receipt Code
              </p>
              <ReceiptCodeDisplay code={receiptCode} animate={true} />
            </div>
          </div>
        )}

        {/* Complete Stage - Enhanced Stamp Card */}
        {stage === "complete" && (
          <div className="space-y-5">
            {/* Header */}
            <div className="text-center animate-fade-in-up">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4 ring-4 ring-emerald-200/50 dark:ring-emerald-800/30 animate-scale-bounce-in">
                <FileCheck className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-emerald-600">Picks Recorded</h2>
              <p className="text-muted-foreground mt-1">
                {isUpdate 
                  ? "Your previous submission has been replaced"
                  : "Your selections have been cryptographically sealed"
                }
              </p>
            </div>

            {/* Update Notice */}
            {isUpdate && previousReceiptCode && (
              <div 
                className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 animate-fade-in-up"
                style={{ animationDelay: "0.05s" }}
              >
                <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="text-sm">
                  <span className="text-amber-700 dark:text-amber-300">Previous receipt </span>
                  <span className="font-mono text-amber-600 dark:text-amber-400">{previousReceiptCode}</span>
                  <span className="text-amber-700 dark:text-amber-300"> has been superseded</span>
                </div>
              </div>
            )}

            {/* Receipt Stamp Card */}
            <div 
              className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-5 border-2 border-slate-200 dark:border-slate-700 space-y-4 relative overflow-hidden animate-fade-in-up"
              style={{ animationDelay: "0.1s" }}
            >
              {/* Subtle pattern overlay */}
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath fill-rule='evenodd' d='M0 0h20v20H0V0zm10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0-1a6 6 0 1 0 0-12 6 6 0 0 0 0 12z'/%3E%3C/g%3E%3C/svg%3E")`,
              }} />
              
              <div className="flex items-center justify-between relative">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Receipt Code
                </span>
                <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="h-3 w-3" />
                  Immutable
                </Badge>
              </div>
              
              <div className="relative">
                <div className="font-mono text-2xl font-bold tracking-widest text-center py-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                  {receiptCode}
                </div>
                <button
                  onClick={copyReceiptCode}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                  title="Copy receipt code"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{formatTimestamp(submittedAt)}</span>
              </div>

              {/* Delivery Status */}
              <DeliveryStatusIndicator deliveries={deliveries} />

              {/* Hash */}
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  SHA-256 Hash
                </span>
                <p className="font-mono text-[10px] leading-relaxed break-all text-muted-foreground bg-slate-100 dark:bg-slate-800 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                  {hash}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-3 border-t border-slate-200 dark:border-slate-700">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                <span>
                  {picks.length} pick{picks.length !== 1 ? "s" : ""} • {periodId} • {leagueName}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              <Button 
                variant="outline" 
                onClick={handleViewReceipt} 
                className="flex-1 gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View Receipt
              </Button>
              <Button 
                onClick={handleClose} 
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Check className="h-4 w-4" />
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Error Stage */}
        {stage === "error" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4 ring-4 ring-destructive/20">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-destructive">Submission Failed</h2>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleConfirm} className="flex-1">
                Try Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
