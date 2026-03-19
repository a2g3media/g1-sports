import { forwardRef, useEffect, useState, useRef } from "react";
import { cn } from "@/react-app/lib/utils";

// ===== FADE IN ON MOUNT =====
interface FadeInProps extends React.HTMLAttributes<HTMLDivElement> {
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}

export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(
  ({ children, className, delay = 0, duration = 400, direction = "up", ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }, [delay]);

    const directionClasses = {
      up: "translate-y-4",
      down: "-translate-y-4",
      left: "translate-x-4",
      right: "-translate-x-4",
      none: "",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "transition-all ease-out",
          isVisible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${directionClasses[direction]}`,
          className
        )}
        style={{ transitionDuration: `${duration}ms` }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
FadeIn.displayName = "FadeIn";

// ===== STAGGER CONTAINER =====
interface StaggerProps extends React.HTMLAttributes<HTMLDivElement> {
  staggerDelay?: number;
  initialDelay?: number;
}

export const Stagger = forwardRef<HTMLDivElement, StaggerProps>(
  ({ children, className, staggerDelay = 75, initialDelay = 0, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("contents", className)} {...props}>
        {Array.isArray(children)
          ? children.map((child, index) => (
              <FadeIn key={index} delay={initialDelay + index * staggerDelay}>
                {child}
              </FadeIn>
            ))
          : children}
      </div>
    );
  }
);
Stagger.displayName = "Stagger";

// ===== SCALE ON HOVER =====
interface ScaleOnHoverProps extends React.HTMLAttributes<HTMLDivElement> {
  scale?: number;
}

export const ScaleOnHover = forwardRef<HTMLDivElement, ScaleOnHoverProps>(
  ({ children, className, scale = 1.02, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("transition-transform duration-200 ease-out", className)}
        style={{ "--hover-scale": scale } as React.CSSProperties}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = `scale(${scale})`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScaleOnHover.displayName = "ScaleOnHover";

// ===== PRESS FEEDBACK =====
interface PressFeedbackProps extends React.HTMLAttributes<HTMLDivElement> {
  scale?: number;
}

export const PressFeedback = forwardRef<HTMLDivElement, PressFeedbackProps>(
  ({ children, className, scale = 0.97, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "transition-transform duration-100 ease-out cursor-pointer active:scale-[0.97]",
          className
        )}
        style={{ "--press-scale": scale } as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PressFeedback.displayName = "PressFeedback";

// ===== ANIMATE ON SCROLL (VIEWPORT) =====
interface AnimateOnScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  animation?: "fade-up" | "fade-down" | "fade-left" | "fade-right" | "scale" | "blur";
  threshold?: number;
  once?: boolean;
}

export const AnimateOnScroll = forwardRef<HTMLDivElement, AnimateOnScrollProps>(
  ({ children, className, animation = "fade-up", threshold = 0.1, once = true, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once && elementRef.current) {
              observer.unobserve(elementRef.current);
            }
          } else if (!once) {
            setIsVisible(false);
          }
        },
        { threshold }
      );

      if (elementRef.current) {
        observer.observe(elementRef.current);
      }

      return () => observer.disconnect();
    }, [threshold, once]);

    const animationClasses = {
      "fade-up": isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
      "fade-down": isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8",
      "fade-left": isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8",
      "fade-right": isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8",
      scale: isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90",
      blur: isVisible ? "opacity-100 blur-0" : "opacity-0 blur-sm",
    };

    return (
      <div
        ref={(node) => {
          elementRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(
          "transition-all duration-500 ease-out",
          animationClasses[animation],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AnimateOnScroll.displayName = "AnimateOnScroll";

// ===== SHIMMER EFFECT =====
interface ShimmerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
}

export const Shimmer = forwardRef<HTMLDivElement, ShimmerProps>(
  ({ className, width = "100%", height = "1rem", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("skeleton rounded-md", className)}
        style={{ width, height }}
        {...props}
      />
    );
  }
);
Shimmer.displayName = "Shimmer";

// ===== PULSE RING =====
interface PulseRingProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  size?: "sm" | "md" | "lg";
}

export const PulseRing = forwardRef<HTMLDivElement, PulseRingProps>(
  ({ className, color = "primary", size = "md", ...props }, ref) => {
    const sizeClasses = {
      sm: "w-2 h-2",
      md: "w-3 h-3",
      lg: "w-4 h-4",
    };

    return (
      <div ref={ref} className={cn("relative", className)} {...props}>
        <div className={cn(`rounded-full bg-${color}`, sizeClasses[size])} />
        <div
          className={cn(
            `absolute inset-0 rounded-full bg-${color} animate-ping opacity-75`,
            sizeClasses[size]
          )}
        />
      </div>
    );
  }
);
PulseRing.displayName = "PulseRing";

// ===== SUCCESS CHECK =====
interface SuccessCheckProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  show?: boolean;
}

export const SuccessCheck = forwardRef<HTMLDivElement, SuccessCheckProps>(
  ({ className, size = 24, show = true, ...props }, ref) => {
    if (!show) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-[hsl(var(--success))] text-white animate-success-pop",
          className
        )}
        style={{ width: size, height: size }}
        {...props}
      >
        <svg
          width={size * 0.5}
          height={size * 0.5}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 6l3 3 5-6" className="animate-draw" style={{ strokeDasharray: 20, strokeDashoffset: 20, animation: "draw 0.3s ease-out 0.2s forwards" }} />
        </svg>
      </div>
    );
  }
);
SuccessCheck.displayName = "SuccessCheck";

// ===== BOUNCE INDICATOR =====
interface BounceIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  direction: "up" | "down";
  value: number;
}

export const BounceIndicator = forwardRef<HTMLDivElement, BounceIndicatorProps>(
  ({ className, direction, value, ...props }, ref) => {
    const colorClass = direction === "up" ? "text-[hsl(var(--positive))]" : "text-[hsl(var(--negative))]";
    const animationClass = direction === "up" ? "animate-bounce-up" : "animate-bounce-down";

    return (
      <div
        ref={ref}
        className={cn("inline-flex items-center gap-0.5 font-semibold", colorClass, animationClass, className)}
        {...props}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={direction === "down" ? "rotate-180" : ""}
        >
          <path d="M6 2L10 8H2L6 2Z" />
        </svg>
        {Math.abs(value)}
      </div>
    );
  }
);
BounceIndicator.displayName = "BounceIndicator";

// ===== NUMBER COUNTER =====
interface NumberCounterProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}

export const NumberCounter = forwardRef<HTMLSpanElement, NumberCounterProps>(
  ({ className, value, duration = 1000, prefix = "", suffix = "", ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
      const startTime = Date.now();
      const startValue = displayValue;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = 1 - (1 - progress) * (1 - progress);
        const current = Math.round(startValue + (value - startValue) * easeOutQuad);
        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }, [value, duration]);

    return (
      <span ref={ref} className={cn("tabular-nums", className)} {...props}>
        {prefix}{displayValue.toLocaleString()}{suffix}
      </span>
    );
  }
);
NumberCounter.displayName = "NumberCounter";

// ===== FLOATING ELEMENT =====
interface FloatingProps extends React.HTMLAttributes<HTMLDivElement> {
  amplitude?: number;
  duration?: number;
}

export const Floating = forwardRef<HTMLDivElement, FloatingProps>(
  ({ children, className, amplitude = 6, duration = 3, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("animate-float", className)}
        style={{
          "--float-amplitude": `${amplitude}px`,
          animationDuration: `${duration}s`,
        } as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Floating.displayName = "Floating";

// Add CSS for draw animation
const styles = `
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes bounce-up {
  0% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0); }
}

@keyframes bounce-down {
  0% { transform: translateY(0); }
  50% { transform: translateY(6px); }
  100% { transform: translateY(0); }
}

.animate-bounce-up {
  animation: bounce-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.animate-bounce-down {
  animation: bounce-down 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
`;

// Inject styles once
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
