import { cn } from "@/react-app/lib/utils";
import { getPoolIconToken } from "./poolIconTokens";

export function PoolTypeBadgeIcon({
  formatKey,
  poolTypeKey,
  sportKey,
  size = "md",
}: {
  formatKey: string;
  poolTypeKey?: string;
  sportKey?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const token = getPoolIconToken(formatKey, { poolTypeKey, sportKey });
  const Icon = token.icon;
  const sizeClass =
    size === "sm" ? "w-9 h-9" : size === "lg" ? "w-14 h-14" : size === "xl" ? "w-16 h-16" : "w-11 h-11";
  const iconSizeClass =
    size === "sm" ? "w-4.5 h-4.5" : size === "lg" ? "w-7 h-7" : size === "xl" ? "w-8 h-8" : "w-5.5 h-5.5";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0 rounded-xl overflow-hidden",
        sizeClass,
        token.glowClass,
      )}
      aria-label={`${token.label} icon`}
      title={token.label}
    >
      {/* Outer ring */}
      <div className={cn("absolute inset-0 rounded-xl bg-gradient-to-br", token.frameClass)} />
      {/* Main plate */}
      <div className={cn("absolute inset-[2px] rounded-[10px] bg-gradient-to-br", token.panelClass)} />
      {/* Subtle split for energy */}
      <div className="absolute inset-[2px] rounded-[10px] bg-[linear-gradient(140deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.26)_43%,rgba(0,0,0,0.48)_100%)]" />
      {/* Top sheen */}
      <div className="absolute inset-[2px] rounded-[10px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.22),transparent_48%)]" />

      {/* Icon medallion */}
      <div className="relative flex h-[58%] w-[58%] items-center justify-center rounded-full border border-white/35 bg-black/32 shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
        <Icon className={cn("relative", iconSizeClass, token.glyphClass)} />
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-[3px] left-1/2 h-[2px] w-[52%] -translate-x-1/2 rounded-full bg-white/30" />
    </div>
  );
}
