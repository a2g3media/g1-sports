import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  X, ChevronRight, ChevronLeft, Sparkles,
  LayoutGrid, Upload, Brain, TrendingUp, Bell, Check
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

const ONBOARDING_KEY = "gz_onboarding_complete";
const ONBOARDING_VERSION = "1"; // Increment to re-show onboarding after major updates

function safeGetOnboardingValue(): string | null {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return null;
  }
}

function safeSetOnboardingValue(value: string): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function safeClearOnboardingValue(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

interface OnboardingStep {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  accentColor: string;
  route?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    icon: Sparkles,
    title: "Welcome to GZ Sports",
    subtitle: "Your AI-Powered Sports Companion",
    description: "Track your bets, get intelligent insights, and never miss a crucial moment. Let's show you around.",
    features: [
      "Real-time game tracking",
      "AI-powered betting insights", 
      "Smart alerts when your picks are in play"
    ],
    accentColor: "primary",
  },
  {
    id: "watchboards",
    icon: LayoutGrid,
    title: "Watchboards",
    subtitle: "Your Personal Command Center",
    description: "Create watchboards to track all your active bets in one place. See live scores, coverage status, and get instant updates.",
    features: [
      "Track multiple parlays at once",
      "Live score updates every 30 seconds",
      "Visual coverage indicators"
    ],
    accentColor: "emerald",
    route: "/watchboard",
  },
  {
    id: "bet-upload",
    icon: Upload,
    title: "Bet Ticket Upload",
    subtitle: "Snap, Upload, Track",
    description: "Take a photo of your bet slip and our AI will automatically parse all your picks. No manual entry needed.",
    features: [
      "AI-powered ticket parsing",
      "Auto-creates watchboard",
      "Tracks spread coverage in real-time"
    ],
    accentColor: "blue",
    route: "/bet/upload",
  },
  {
    id: "coach-g",
    icon: Brain,
    title: "Coach G",
    subtitle: "Your AI Betting Mentor",
    description: "Get personalized insights, line movement analysis, and sharp action alerts. Coach G watches the market so you don't have to.",
    features: [
      "Line movement explanations",
      "Sharp vs public money analysis",
      "Game-specific recommendations"
    ],
    accentColor: "violet",
    route: "/coach",
  },
  {
    id: "performance",
    icon: TrendingUp,
    title: "Performance Tracker",
    subtitle: "Know Your Numbers",
    description: "Track your win rate, ROI, and betting patterns over time. Identify your strengths and improve your strategy.",
    features: [
      "Win/loss tracking by sport",
      "ROI and unit analysis",
      "Streak and trend detection"
    ],
    accentColor: "cyan",
    route: "/performance",
  },
  {
    id: "alerts",
    icon: Bell,
    title: "Smart Alerts",
    subtitle: "Never Miss a Moment",
    description: "Get notified when your picks start covering, when lines move, or when games go to overtime. Customize what matters to you.",
    features: [
      "Push notifications for critical moments",
      "In-app banners for live updates",
      "Fully customizable preferences"
    ],
    accentColor: "amber",
    route: "/settings",
  },
];

const ACCENT_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  primary: {
    bg: "bg-primary/20",
    border: "border-primary/30",
    text: "text-primary",
    glow: "shadow-[0_0_60px_rgba(59,130,246,0.3)]",
  },
  emerald: {
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    glow: "shadow-[0_0_60px_rgba(16,185,129,0.3)]",
  },
  blue: {
    bg: "bg-blue-500/20",
    border: "border-blue-500/30",
    text: "text-blue-400",
    glow: "shadow-[0_0_60px_rgba(59,130,246,0.3)]",
  },
  violet: {
    bg: "bg-violet-500/20",
    border: "border-violet-500/30",
    text: "text-violet-400",
    glow: "shadow-[0_0_60px_rgba(139,92,246,0.3)]",
  },
  cyan: {
    bg: "bg-cyan-500/20",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    glow: "shadow-[0_0_60px_rgba(6,182,212,0.3)]",
  },
  amber: {
    bg: "bg-amber-500/20",
    border: "border-amber-500/30",
    text: "text-amber-400",
    glow: "shadow-[0_0_60px_rgba(245,158,11,0.3)]",
  },
};

export function useOnboarding() {
  const [shouldShow, setShouldShow] = useState(false);
  
  useEffect(() => {
    const stored = safeGetOnboardingValue();
    if (stored !== ONBOARDING_VERSION) {
      setShouldShow(true);
    }
  }, []);
  
  const complete = useCallback(() => {
    safeSetOnboardingValue(ONBOARDING_VERSION);
    setShouldShow(false);
  }, []);
  
  const reset = useCallback(() => {
    safeClearOnboardingValue();
    setShouldShow(true);
  }, []);
  
  return { shouldShow, complete, reset };
}

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  
  const step = ONBOARDING_STEPS[currentStep];
  const colors = ACCENT_COLORS[step.accentColor];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const isFirstStep = currentStep === 0;
  
  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };
  
  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };
  
  const handleComplete = () => {
    setIsExiting(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  };
  
  const handleSkip = () => {
    handleComplete();
  };
  
  const handleTryFeature = () => {
    if (step.route) {
      handleComplete();
      navigate(step.route);
    }
  };
  
  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "Escape") {
        handleSkip();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, isLastStep]);
  
  const Icon = step.icon;
  
  return (
    <div 
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center p-4",
        "bg-black/80 backdrop-blur-xl",
        "transition-opacity duration-300",
        isExiting ? "opacity-0" : "opacity-100"
      )}
    >
      {/* Ambient glow */}
      <div 
        className={cn(
          "absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[600px] h-[600px] rounded-full blur-[120px] opacity-30 transition-all duration-500",
          step.accentColor === "primary" && "bg-primary",
          step.accentColor === "emerald" && "bg-emerald-500",
          step.accentColor === "blue" && "bg-blue-500",
          step.accentColor === "violet" && "bg-violet-500",
          step.accentColor === "cyan" && "bg-cyan-500",
          step.accentColor === "amber" && "bg-amber-500",
        )}
      />
      
      {/* Modal */}
      <div 
        className={cn(
          "relative w-full max-w-lg",
          "bg-gradient-to-b from-slate-900/98 via-slate-800/95 to-slate-900/98",
          "border border-white/10 rounded-3xl",
          "overflow-hidden",
          colors.glow,
          "transform transition-all duration-300",
          isExiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* Step indicator */}
        <div className="absolute top-4 left-4 z-10">
          <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider">
            {currentStep + 1} / {ONBOARDING_STEPS.length}
          </span>
        </div>
        
        {/* Content */}
        <div className="p-8 pt-14">
          {/* Icon */}
          <div className={cn(
            "w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center",
            colors.bg, colors.border, "border",
            "shadow-lg"
          )}>
            <Icon className={cn("w-10 h-10", colors.text)} />
          </div>
          
          {/* Title */}
          <h2 className={cn(
            "text-2xl font-black text-center mb-2",
            colors.text
          )}>
            {step.title}
          </h2>
          
          {/* Subtitle */}
          <p className="text-sm font-semibold text-white/50 text-center mb-4">
            {step.subtitle}
          </p>
          
          {/* Description */}
          <p className="text-[15px] text-white/70 text-center leading-relaxed mb-6">
            {step.description}
          </p>
          
          {/* Features list */}
          <div className="space-y-3 mb-8">
            {step.features.map((feature, i) => (
              <div 
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]"
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                  colors.bg
                )}>
                  <Check className={cn("w-3 h-3", colors.text)} />
                </div>
                <span className="text-sm text-white/60">{feature}</span>
              </div>
            ))}
          </div>
          
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {ONBOARDING_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-200",
                  i === currentStep 
                    ? cn("w-6", colors.bg.replace("/20", "/60"))
                    : "bg-white/20 hover:bg-white/30"
                )}
              />
            ))}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Back button */}
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="flex-1 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80 font-semibold transition-all flex items-center justify-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            
            {/* Try it button (if route available and not first step) */}
            {step.route && !isFirstStep && (
              <button
                onClick={handleTryFeature}
                className={cn(
                  "flex-1 h-12 rounded-xl border font-semibold transition-all flex items-center justify-center gap-2",
                  colors.bg, colors.border, colors.text,
                  "hover:opacity-80"
                )}
              >
                Try It
              </button>
            )}
            
            {/* Next/Finish button */}
            <button
              onClick={handleNext}
              className={cn(
                "flex-1 h-12 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group",
                isLastStep 
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                  : "bg-primary hover:bg-primary/90 text-white"
              )}
            >
              {isLastStep ? "Get Started" : "Next"}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
          
          {/* Skip link */}
          {!isLastStep && (
            <button
              onClick={handleSkip}
              className="w-full mt-4 text-[12px] text-white/30 hover:text-white/50 transition-colors"
            >
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
