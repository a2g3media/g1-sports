import { useNavigate } from "react-router-dom";
import { X, Users, Zap, Shield, ChevronRight } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface WhyGZModalProps {
  open: boolean;
  onClose: () => void;
}

const VALUE_CARDS = [
  {
    icon: Shield,
    title: "Office Pools First",
    description: "Survivor, Pick'em, Confidence, and Standings — built specifically for the weekly office pool experience.",
    color: "emerald",
  },
  {
    icon: Zap,
    title: "Live + Smart",
    description: "Live scores, line movement context, and pool impact insights so you always know where you stand.",
    color: "blue",
  },
  {
    icon: Users,
    title: "Built for Groups",
    description: "Private pools, easy invites, leaderboards, and weekly flow designed for your league.",
    color: "amber",
  },
];

export function WhyGZModal({ open, onClose }: WhyGZModalProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const handleCreatePool = () => {
    onClose();
    navigate("/pools/create");
  };

  const handleBrowsePools = () => {
    onClose();
    navigate("/pools");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={cn(
        "relative w-full max-w-lg",
        "bg-gradient-to-br from-slate-900/98 via-slate-800/95 to-slate-900/98",
        "border border-white/10",
        "rounded-2xl overflow-hidden",
        "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_80px_rgba(59,130,246,0.1)]",
        "animate-in fade-in-0 zoom-in-95 duration-200"
      )}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-white/5">
          <h2 className="text-xl font-bold text-white">Why GZ Sports</h2>
          <p className="mt-1 text-sm text-white/50">The command center for office pools</p>
        </div>
        
        {/* Value Cards */}
        <div className="px-6 py-5 space-y-3">
          {VALUE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={cn(
                  "relative p-4 rounded-xl",
                  "bg-white/[0.03] border border-white/[0.06]",
                  "hover:bg-white/[0.05] hover:border-white/[0.08]",
                  "transition-all duration-200"
                )}
              >
                <div className="flex items-start gap-3.5">
                  <div className={cn(
                    "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                    card.color === "emerald" && "bg-emerald-500/15 text-emerald-400",
                    card.color === "blue" && "bg-blue-500/15 text-blue-400",
                    card.color === "amber" && "bg-amber-500/15 text-amber-400"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">{card.title}</h3>
                    <p className="mt-0.5 text-xs text-white/50 leading-relaxed">{card.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* CTAs */}
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={handleCreatePool}
            className={cn(
              "flex-1 h-11 rounded-xl",
              "bg-primary hover:bg-primary/90",
              "text-white text-sm font-semibold",
              "flex items-center justify-center gap-2",
              "shadow-[0_4px_20px_rgba(59,130,246,0.3)]",
              "hover:shadow-[0_6px_30px_rgba(59,130,246,0.4)]",
              "hover:-translate-y-0.5",
              "transition-all duration-200"
            )}
          >
            Create a Pool
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleBrowsePools}
            className={cn(
              "flex-1 h-11 rounded-xl",
              "bg-white/5 hover:bg-white/10",
              "border border-white/10 hover:border-white/20",
              "text-white/80 hover:text-white text-sm font-medium",
              "flex items-center justify-center",
              "transition-all duration-200"
            )}
          >
            Browse Pools
          </button>
        </div>
      </div>
    </div>
  );
}
