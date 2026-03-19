import { cn } from "@/react-app/lib/utils";
import { useState } from "react";
import { X } from "lucide-react";

interface ScoutAvatarProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  isWatching?: boolean;
  isTyping?: boolean;
  hasNewInsight?: boolean;
  onClick?: () => void;
  className?: string;
  confidence?: number;
}

/**
 * Scout Avatar - Italian Sports Coach Character
 * 
 * STYLE:
 * - Heavy build, Italian-looking coach
 * - Forward-facing cap
 * - Thick beard
 * - Black tracksuit (Adidas-style, no logo)
 * - Gold watch (Rolex-style, no logo)
 * - Calm, confident, friendly sharp bettor energy
 * - Semi-cartoon/stylized but realistic
 */
export function ScoutAvatar({
  size = "md",
  isWatching = false,
  isTyping = false,
  hasNewInsight = false,
  onClick,
  className,
}: ScoutAvatarProps) {
  const sizeClasses = {
    xs: "w-6 h-6",
    sm: "w-9 h-9",
    md: "w-11 h-11",
    lg: "w-14 h-14",
    xl: "w-20 h-20",
  };

  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className={cn(
        "relative group",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Minimal soft edge glow */}
      {hasNewInsight && (
        <div
          className="absolute inset-[-1px] rounded-full bg-amber-400/15 transition-opacity duration-500"
          style={{ filter: 'blur(4px)' }}
        />
      )}

      {/* Main avatar container */}
      <div
        className={cn(
          sizeClasses[size],
          "relative rounded-full overflow-hidden",
          "border border-white/10",
          "shadow-[0_2px_12px_rgba(0,0,0,0.4)]",
          "transition-all duration-300",
          onClick && "group-hover:border-white/20 group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
          onClick && "group-active:scale-95"
        )}
      >
        {/* Scout Avatar Image */}
        <img
          src="https://019c4e67-936a-785b-b7d9-4779ded1f51c.mochausercontent.com/image.png_2488.png"
          alt="Scout"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Status indicator - subtle green dot */}
      {(isWatching || hasNewInsight) && !isTyping && (
        <span className={cn(
          "absolute rounded-full",
          size === "xs" && "bottom-0 right-0 w-1.5 h-1.5",
          size === "sm" && "bottom-0 right-0 w-2 h-2",
          size === "md" && "-bottom-0.5 -right-0.5 w-2.5 h-2.5",
          size === "lg" && "-bottom-0.5 -right-0.5 w-3 h-3",
          size === "xl" && "-bottom-1 -right-1 w-3.5 h-3.5",
        )}>
          <span 
            className="absolute inset-0 rounded-full bg-emerald-400/40" 
            style={{ 
              animation: 'pulse 2.5s ease-in-out infinite',
              filter: 'blur(2px)'
            }} 
          />
          <span className="absolute inset-[1px] rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
        </span>
      )}

      {/* Typing indicator */}
      {isTyping && (
        <div className={cn(
          "absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5",
          size === "xs" && "-bottom-2",
          size === "sm" && "-bottom-2.5",
          size === "md" && "-bottom-3",
          size === "lg" && "-bottom-3.5",
          size === "xl" && "-bottom-4",
        )}>
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.9s" }} />
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.9s" }} />
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.9s" }} />
        </div>
      )}
    </Component>
  );
}

/**
 * Scout Avatar with inline label
 */
export function ScoutAvatarWithConfidence({
  size = "sm",
  confidence,
  isWatching = false,
  hasNewInsight = false,
  onClick,
  className,
}: Omit<ScoutAvatarProps, 'isTyping'>) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 group",
        onClick && "cursor-pointer",
        className
      )}
    >
      <ScoutAvatar
        size={size}
        isWatching={isWatching}
        hasNewInsight={hasNewInsight}
      />
      <span className="text-[11px] text-white/50 font-medium">
        Scout
        {confidence !== undefined && (
          <span className="text-white/40"> • {confidence}%</span>
        )}
      </span>
    </button>
  );
}

/**
 * Scout Avatar Icon - For navigation (simplified silhouette)
 */
export function ScoutAvatarIcon({ 
  className,
  active = false,
}: { 
  className?: string;
  active?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      {active && (
        <div className="absolute inset-[-2px] rounded-full bg-amber-400/10 blur-sm" />
      )}
      
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-full h-full relative"
      >
        <defs>
          <linearGradient id="navCoachGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={active ? "#94a3b8" : "currentColor"} stopOpacity={active ? "1" : "0.4"} />
            <stop offset="100%" stopColor={active ? "#64748b" : "currentColor"} stopOpacity={active ? "0.8" : "0.3"} />
          </linearGradient>
        </defs>
        
        <circle 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="url(#navCoachGrad)" 
          strokeWidth="1.5"
          fill="none"
          opacity={active ? 1 : 0.5}
        />
        
        <g opacity={active ? 1 : 0.45}>
          {/* Head with cap */}
          <ellipse cx="12" cy="9.5" rx="4" ry="4.5" fill={active ? "#d4a574" : "currentColor"} opacity={active ? 0.8 : 0.35} />
          
          {/* Forward cap */}
          <path 
            d="M8 8 C8 6 10 5 12 5 C14 5 16 6 16 8 L15.5 9 Q12 8.5 8.5 9 Z"
            fill={active ? "#2d2d2d" : "currentColor"}
            opacity={active ? 0.85 : 0.4}
          />
          
          {/* Beard */}
          <path 
            d="M9 10 Q9 13 12 14 Q15 13 15 10"
            fill={active ? "#2a2218" : "currentColor"}
            opacity={active ? 0.6 : 0.3}
          />
          
          {/* Tracksuit shoulders */}
          <path 
            d="M5 19 Q5 15.5 12 14 Q19 15.5 19 19" 
            fill={active ? "#1a1a1a" : "currentColor"}
            opacity={active ? 0.8 : 0.35}
          />
          
          {/* Stripes hint */}
          <path d="M7 19 L8 15" fill="none" stroke={active ? "rgba(255,255,255,0.5)" : "currentColor"} strokeWidth="0.5" opacity={active ? 1 : 0.2} />
          <path d="M17 19 L16 15" fill="none" stroke={active ? "rgba(255,255,255,0.5)" : "currentColor"} strokeWidth="0.5" opacity={active ? 1 : 0.2} />
        </g>
      </svg>
    </div>
  );
}

/**
 * Scout Bottom Modal
 */
export function ScoutModal({
  isOpen,
  onClose,
  insight,
  confidence,
}: {
  isOpen: boolean;
  onClose: () => void;
  insight?: string;
  confidence?: number;
}) {
  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-gradient-to-b from-slate-800 to-slate-900",
        "border-t border-white/10",
        "rounded-t-2xl",
        "shadow-[0_-8px_40px_rgba(0,0,0,0.5)]",
        "animate-in slide-in-from-bottom duration-300",
        "max-h-[60vh] overflow-hidden"
      )}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        
        <div className="flex items-center justify-between px-5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <ScoutAvatar size="lg" hasNewInsight />
            <div>
              <h3 className="text-lg font-semibold text-white">Scout</h3>
              {confidence !== undefined && (
                <p className="text-xs text-white/40 font-medium">{confidence}% confidence</p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>
        
        <div className="p-5">
          <p className="text-sm text-white/60 leading-relaxed">
            <span className="text-white/80 font-medium">Here's what I'm seeing…</span>
          </p>
          {insight && (
            <p className="mt-3 text-sm text-white/70 leading-relaxed">
              {insight}
            </p>
          )}
        </div>
        
        <div className="h-6" />
      </div>
    </>
  );
}

/**
 * Scout Avatar with modal integration
 */
export function ScoutAvatarInteractive({
  size = "sm",
  confidence,
  insight,
  isWatching = false,
  hasNewInsight = false,
  className,
}: ScoutAvatarProps & { insight?: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <ScoutAvatarWithConfidence
        size={size}
        confidence={confidence}
        isWatching={isWatching}
        hasNewInsight={hasNewInsight}
        onClick={() => setIsModalOpen(true)}
        className={className}
      />
      <ScoutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        insight={insight}
        confidence={confidence}
      />
    </>
  );
}

/**
 * Scout Avatar with label (legacy support)
 */
export function ScoutAvatarLabel({
  size = "sm",
  label = "Scout",
  isWatching = false,
  isTyping = false,
  hasNewInsight = false,
  confidence,
  onClick,
  className,
}: ScoutAvatarProps & { label?: string }) {
  const Component = onClick ? "button" : "div";
  
  return (
    <Component
      onClick={onClick}
      className={cn(
        "flex items-center gap-2",
        onClick && "cursor-pointer group",
        className
      )}
    >
      <ScoutAvatar
        size={size}
        isWatching={isWatching}
        isTyping={isTyping}
        hasNewInsight={hasNewInsight}
      />
      <span className={cn(
        "text-[11px] font-medium text-white/50",
        onClick && "group-hover:text-white/70 transition-colors"
      )}>
        {label}
        {confidence !== undefined && (
          <span className="text-white/35"> ({confidence}%)</span>
        )}
      </span>
      {isTyping && (
        <span className="text-[9px] text-white/25">analyzing</span>
      )}
    </Component>
  );
}
