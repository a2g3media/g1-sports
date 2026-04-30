/**
 * HOMEPAGE LOCKED
 * Do not change behavior/order/render rules without explicit approval.
 * Homepage stability rules:
 * - exactly 3 Games Today cards
 * - soccer + White Sox logo stability
 * - static sport icon row behavior
 * - watchboards render immediately and stay synced on Home
 * - no flicker / no late visual swapping
 */
import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/react-app/lib/utils";
import {
  HOMEPAGE_ICON_ROW_STATIC,
  HOMEPAGE_NO_RUNTIME_ICON_SWAP,
  HOMEPAGE_STATIC_ICON_SOURCES,
} from "@/react-app/lib/homeLockRules";

// Homepage quick-access chips with premium sport avatars.
const SPORTS = [
  { key: "nba", label: "NBA", accent: "text-orange-300" },
  { key: "nfl", label: "NFL", accent: "text-green-300" },
  { key: "mlb", label: "MLB", accent: "text-red-300" },
  { key: "nhl", label: "NHL", accent: "text-cyan-300" },
  { key: "ncaaf", label: "NCAAF", accent: "text-amber-300" },
  { key: "ncaab", label: "NCAAB", accent: "text-blue-300" },
  { key: "soccer", label: "Soccer", accent: "text-emerald-300" },
  { key: "golf", label: "Golf", accent: "text-teal-300" },
  { key: "mma", label: "MMA", accent: "text-rose-300" },
];

const STATIC_HOME_SPORT_CHIPS = SPORTS.map((sport) => ({
  ...sport,
  avatarSrc: HOMEPAGE_STATIC_ICON_SOURCES[sport.key as keyof typeof HOMEPAGE_STATIC_ICON_SOURCES] || "",
  avatarAlt: `${sport.label} icon`,
}));

function StaticSportChipIcon({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label: string;
}) {
  const defaultSrc = "/assets/sports/default-ball-ai.svg?v=20260422";
  const [currentSrc, setCurrentSrc] = React.useState(src);
  const [fallbackTried, setFallbackTried] = React.useState(false);
  const [renderTextFallback, setRenderTextFallback] = React.useState(false);

  React.useEffect(() => {
    setCurrentSrc(src);
    setFallbackTried(false);
    setRenderTextFallback(false);
  }, [src]);

  if (renderTextFallback) {
    return (
      <div
        className="h-full w-full rounded-full border border-white/20 bg-white/10 flex items-center justify-center text-[10px] font-bold uppercase text-white/75"
        aria-label={`${label} fallback icon`}
      >
        {label.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      onError={() => {
        if (!fallbackTried && currentSrc !== defaultSrc) {
          setFallbackTried(true);
          setCurrentSrc(defaultSrc);
          return;
        }
        setRenderTextFallback(true);
      }}
      data-home-icon-static={HOMEPAGE_ICON_ROW_STATIC ? "true" : "false"}
      data-home-icon-runtime-swap={HOMEPAGE_NO_RUNTIME_ICON_SWAP ? "disabled" : "enabled"}
      width={96}
      height={96}
      className="h-full w-full object-contain"
    />
  );
}

function normalizeSportKey(value: string | null | undefined): string {
  const key = String(value || "").toLowerCase().trim();
  if (key === "cbb" || key === "ncaam") return "ncaab";
  if (key === "cfb" || key === "ncaafb") return "ncaaf";
  return key;
}

export function SportQuickAccess({ activeSportKey }: { activeSportKey?: string | null }) {
  const activeKey = normalizeSportKey(activeSportKey);
  const chips = STATIC_HOME_SPORT_CHIPS;

  return (
    <section className="mb-5 lg:mb-6">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 md:flex md:flex-wrap md:justify-center md:gap-5 lg:gap-6">
        {chips.map((sport) => {
          const isActive = activeKey === sport.key;
          const sportHref = sport.key === "golf" ? "/sports" : `/sports/${sport.key}`;

          return (
            <Link
              key={sport.key}
              to={sportHref}
              className={cn(
                "group relative flex-shrink-0 flex flex-col items-center gap-2 pb-1",
                "min-w-[72px] md:min-w-0",
                "hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 ease-out",
                isActive && "-translate-y-0.5 after:absolute after:left-1/2 after:-translate-x-1/2 after:-bottom-0.5 after:h-[2px] after:w-8 after:rounded-full after:bg-gradient-to-r after:from-cyan-300 after:to-blue-500 after:shadow-[0_0_12px_rgba(56,189,248,0.35)]"
              )}
            >
              <div
                className={cn(
                  "relative flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full",
                  "group-hover:scale-[1.03] transition-transform duration-300 ease-out",
                  isActive && "scale-[1.04] bg-white/[0.04]"
                )}
              >
                <StaticSportChipIcon
                  src={sport.avatarSrc}
                  alt={sport.avatarAlt}
                  label={sport.label}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] md:text-[11px] font-bold uppercase tracking-wider transition-all",
                  sport.accent,
                  isActive && "text-white"
                )}
              >
                {sport.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default React.memo(SportQuickAccess);
