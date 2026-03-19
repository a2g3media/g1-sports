import { cn } from "@/react-app/lib/utils";
import { useState } from "react";
import { X } from "lucide-react";

/**
 * Coach G Presence States
 * - idle: Default calm state, no animation
 * - monitoring: Live games active, exposure high - subtle breathing glow
 * - alert: Rank change, rival pass, sharp flip - pulse + notification dot
 */
type PresenceState = "idle" | "monitoring" | "alert";

interface CoachGAvatarProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  presence?: PresenceState;
  isTyping?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Coach G Avatar - Italian Sports Coach Character
 * 
 * PERSONALITY:
 * - Mentor-like but direct
 * - Calm, strategic, old-school energy
 * - Never dramatic, never hype
 * - Speaks when it matters
 * 
 * VISUAL STATES:
 * - Idle: No glow, calm
 * - Monitoring: Subtle soft blue breathing glow (4-5s cycle)
 * - Alert: Quick pulse, blue notification dot
 */
export function CoachGAvatar({
  size = "md",
  presence = "monitoring",
  isTyping = false,
  onClick,
  className,
}: CoachGAvatarProps) {
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
      {/* Monitoring state - subtle breathing glow */}
      {presence === "monitoring" && (
        <div
          className="absolute inset-[-2px] rounded-full border border-cyan-300/35 bg-cyan-300/8 animate-coach-breathing"
        />
      )}
      
      {/* Alert state - pulse glow */}
      {presence === "alert" && (
        <div
          className="absolute inset-[-3px] rounded-full bg-blue-400/20 animate-coach-pulse"
        />
      )}

      {/* Main avatar container */}
      <div
        className={cn(
          sizeClasses[size],
          "relative rounded-full overflow-hidden",
          "border border-white/[0.05]",
          "shadow-[0_2px_12px_rgba(0,0,0,0.4)]",
          "transition-all duration-300",
          onClick && "group-hover:border-white/[0.10] group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
          onClick && "group-active:scale-95"
        )}
      >
        {/* Coach G Avatar Image */}
        <img
          src="/assets/coachg/coach-g-avatar.png?v=2"
          alt="Coach G"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Online status indicator - small green dot (only when not idle) */}
      {presence !== "idle" && !isTyping && (
        <span className={cn(
          "absolute rounded-full",
          size === "xs" && "bottom-0 right-0 w-1.5 h-1.5",
          size === "sm" && "bottom-0 right-0 w-2 h-2",
          size === "md" && "-bottom-0.5 -right-0.5 w-2.5 h-2.5",
          size === "lg" && "-bottom-0.5 -right-0.5 w-3 h-3",
          size === "xl" && "-bottom-1 -right-1 w-3.5 h-3.5",
        )}>
          <span className="absolute inset-[1px] rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
        </span>
      )}
      
      {/* Alert notification dot - blue */}
      {presence === "alert" && !isTyping && (
        <span className={cn(
          "absolute rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]",
          size === "xs" && "-top-0.5 -right-0.5 w-1.5 h-1.5",
          size === "sm" && "-top-0.5 -right-0.5 w-2 h-2",
          size === "md" && "-top-1 -right-1 w-2.5 h-2.5",
          size === "lg" && "-top-1 -right-1 w-3 h-3",
          size === "xl" && "-top-1.5 -right-1.5 w-3.5 h-3.5",
        )} />
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
 * Coach G Avatar with label - NO confidence percentages
 */
export function CoachGAvatarWithLabel({
  size = "sm",
  presence = "idle",
  onClick,
  className,
}: Omit<CoachGAvatarProps, 'isTyping'>) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 group",
        onClick && "cursor-pointer",
        className
      )}
    >
      <CoachGAvatar
        size={size}
        presence={presence}
      />
      <span className="text-[11px] font-medium text-[#9CA3AF] transition-colors group-hover:text-[#E5E7EB]">
        Coach G
      </span>
    </button>
  );
}

/**
 * Coach G Avatar Icon - For navigation (simplified silhouette)
 */
export function CoachGAvatarIcon({ 
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
 * Coach G Bottom Modal - Slide-in banner for high impact events
 */
export function CoachGModal({
  isOpen,
  onClose,
  insight,
}: {
  isOpen: boolean;
  onClose: () => void;
  insight?: string;
}) {
  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-50 animate-in fade-in duration-200 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-[radial-gradient(circle_at_15%_0%,rgba(56,189,248,0.10),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(139,92,246,0.10),transparent_38%),linear-gradient(180deg,#16202B,#121821)]",
        "border-t border-white/[0.05]",
        "rounded-t-2xl",
        "shadow-[0_-8px_40px_rgba(0,0,0,0.5)]",
        "animate-in slide-in-from-bottom duration-300",
        "max-h-[60vh] overflow-hidden"
      )}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-white/20 shadow-[0_0_10px_rgba(56,189,248,0.22)]" />
        </div>
        
        <div className="flex items-center justify-between border-b border-white/[0.05] px-5 pb-4">
          <div className="flex items-center gap-3">
            <CoachGAvatar size="lg" presence="alert" />
            <div>
              <h3 className="text-lg font-semibold text-[#E5E7EB]">Coach G</h3>
              <p className="text-xs font-medium text-[#6B7280]">Watching the market</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-white/5"
          >
            <X className="h-5 w-5 text-[#6B7280]" />
          </button>
        </div>
        
        <div className="p-5">
          {insight && (
            <p className="text-sm leading-relaxed text-[#9CA3AF]">
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
 * Coach G Avatar with modal integration
 */
export function CoachGAvatarInteractive({
  size = "sm",
  insight,
  presence = "idle",
  className,
}: CoachGAvatarProps & { insight?: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <CoachGAvatarWithLabel
        size={size}
        presence={presence}
        onClick={() => setIsModalOpen(true)}
        className={className}
      />
      <CoachGModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        insight={insight}
      />
    </>
  );
}

/**
 * Coach G Avatar with label (alternate style)
 */
export function CoachGAvatarLabel({
  size = "sm",
  label = "Coach G",
  presence = "idle",
  isTyping = false,
  onClick,
  className,
}: CoachGAvatarProps & { label?: string }) {
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
      <CoachGAvatar
        size={size}
        presence={presence}
        isTyping={isTyping}
      />
      <span className={cn(
        "text-[11px] font-medium text-[#9CA3AF]",
        onClick && "transition-colors group-hover:text-[#E5E7EB]"
      )}>
        {label}
      </span>
      {isTyping && (
        <span className="text-[9px] text-[#6B7280]">analyzing</span>
      )}
    </Component>
  );
}

// Legacy exports for backward compatibility during migration
export { 
  CoachGAvatar as ScoutAvatar,
  CoachGAvatarWithLabel as ScoutAvatarWithConfidence,
  CoachGAvatarIcon as ScoutAvatarIcon,
  CoachGModal as ScoutModal,
  CoachGAvatarInteractive as ScoutAvatarInteractive,
  CoachGAvatarLabel as ScoutAvatarLabel,
};
