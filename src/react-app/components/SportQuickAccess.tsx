import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/react-app/lib/utils";
import {
  Activity,
  Calendar,
  Flame,
  Shield,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { getSportAvatarConfig } from "@/react-app/lib/sportAvatars";

// Homepage quick-access chips with realistic sport avatar treatment.
const SPORTS = [
  { key: "nba", label: "NBA", fallbackIcon: Zap, accent: "text-orange-300", border: "border-orange-400/35", bg: "from-orange-500/18 via-orange-500/8 to-orange-500/4" },
  { key: "nfl", label: "NFL", fallbackIcon: Shield, accent: "text-green-300", border: "border-green-400/35", bg: "from-green-500/18 via-green-500/8 to-green-500/4" },
  { key: "mlb", label: "MLB", fallbackIcon: Target, accent: "text-red-300", border: "border-red-400/35", bg: "from-red-500/18 via-red-500/8 to-red-500/4" },
  { key: "nhl", label: "NHL", fallbackIcon: Shield, accent: "text-cyan-300", border: "border-cyan-400/35", bg: "from-cyan-500/18 via-cyan-500/8 to-cyan-500/4" },
  { key: "ncaaf", label: "NCAAF", fallbackIcon: Calendar, accent: "text-amber-300", border: "border-amber-400/35", bg: "from-amber-500/18 via-amber-500/8 to-amber-500/4" },
  { key: "ncaab", label: "NCAAB", fallbackIcon: Activity, accent: "text-blue-300", border: "border-blue-400/35", bg: "from-blue-500/18 via-blue-500/8 to-blue-500/4" },
  { key: "soccer", label: "Soccer", fallbackIcon: Users, accent: "text-emerald-300", border: "border-emerald-400/35", bg: "from-emerald-500/18 via-emerald-500/8 to-emerald-500/4" },
  { key: "golf", label: "Golf", fallbackIcon: Trophy, accent: "text-teal-300", border: "border-teal-400/35", bg: "from-teal-500/18 via-teal-500/8 to-teal-500/4" },
  { key: "mma", label: "MMA", fallbackIcon: Flame, accent: "text-rose-300", border: "border-rose-400/35", bg: "from-rose-500/18 via-rose-500/8 to-rose-500/4" },
];

function normalizeSportKey(value: string | null | undefined): string {
  const key = String(value || "").toLowerCase().trim();
  if (key === "cbb" || key === "ncaam") return "ncaab";
  if (key === "cfb" || key === "ncaafb") return "ncaaf";
  return key;
}

export function SportQuickAccess({ activeSportKey }: { activeSportKey?: string | null }) {
  const [avatarFailures, setAvatarFailures] = useState<Record<string, number>>({});
  const activeKey = normalizeSportKey(activeSportKey);

  const avatarData = useMemo(
    () =>
      SPORTS.map((sport) => ({
        ...sport,
        avatar: getSportAvatarConfig(sport.key),
      })),
    []
  );

  useEffect(() => {
    // Warm photo avatars immediately so pills paint fast.
    for (const sport of avatarData) {
      const primary = new Image();
      primary.decoding = 'async';
      primary.src = sport.avatar.src;
    }
  }, [avatarData]);

  const markAvatarFailure = (sportKey: string) => {
    setAvatarFailures((current) => ({
      ...current,
      [sportKey]: (current[sportKey] ?? 0) + 1,
    }));
  };

  return (
    <section className="mb-5 lg:mb-6">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 md:flex md:flex-wrap md:justify-center md:gap-5 lg:gap-6">
        {avatarData.map((sport) => {
          const isActive = activeKey === sport.key;
          const failureCount = avatarFailures[sport.key] ?? 0;
          const showFallbackIcon = failureCount > 0;
          const imageSrc = sport.avatar.src;
          const FallbackIcon = sport.fallbackIcon;

          return (
            <Link
              key={sport.key}
              to={`/sports/${sport.key}`}
              className={cn(
                "group flex-shrink-0 flex flex-col items-center gap-2",
                "min-w-[72px] md:min-w-0",
                "hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200",
                isActive && "-translate-y-0.5"
              )}
            >
              <div
                className={cn(
                  "relative flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full",
                  "group-hover:scale-[1.06] transition-transform duration-200",
                  isActive && "scale-[1.08] bg-white/[0.04] ring-2 ring-primary/50 shadow-[0_0_26px_rgba(59,130,246,0.25)]"
                )}
              >
                {!showFallbackIcon ? (
                  <img
                    src={imageSrc}
                    alt={sport.avatar.alt}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    width={96}
                    height={96}
                    className="h-full w-full object-contain"
                    onError={() => markAvatarFailure(sport.key)}
                  />
                ) : (
                  <FallbackIcon className={cn("h-10 w-10 md:h-12 md:w-12", sport.accent)} />
                )}
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
