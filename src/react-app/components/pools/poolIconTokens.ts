import {
  Shield,
  TrendingUp,
  Grid3X3,
  ListChecks,
  Flame,
  Siren,
  BarChart3,
  Trophy,
  Ticket,
  Medal,
  Zap,
  GitBranch,
  Crosshair,
  Crown,
  ShieldAlert,
  Swords,
  Dice5,
  Goal,
  Volleyball,
  Dumbbell,
  CarFront,
  CircleDollarSign,
  Sigma,
  Sparkles,
  type LucideProps,
  type LucideIcon,
} from "lucide-react";
import type { FC } from "react";

export interface PoolIconToken {
  key: string;
  label: string;
  icon: LucideIcon | FC<LucideProps>;
  frameClass: string;
  panelClass: string;
  glyphClass: string;
  glowClass: string;
}

type PoolIconContext = {
  poolTypeKey?: string;
  sportKey?: string;
};

const DEFAULT_TOKEN: PoolIconToken = {
  key: "default",
  label: "Pool",
  icon: Trophy,
  frameClass: "from-zinc-300 via-zinc-100 to-zinc-400",
  panelClass: "from-zinc-600 via-zinc-800 to-black",
  glyphClass: "text-zinc-100",
  glowClass: "shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_20px_rgba(0,0,0,0.45)]",
};

const TOKENS: Record<string, PoolIconToken> = {
  pickem: {
    key: "pickem",
    label: "Pick'em",
    icon: Ticket,
    frameClass: "from-sky-300 via-white to-blue-500",
    panelClass: "from-sky-500 via-blue-700 to-slate-950",
    glyphClass: "text-sky-100",
    glowClass: "shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_10px_20px_rgba(3,105,161,0.4)]",
  },
  ats: {
    key: "ats",
    label: "ATS",
    icon: TrendingUp,
    frameClass: "from-emerald-300 via-white to-lime-400",
    panelClass: "from-emerald-500 via-emerald-700 to-black",
    glyphClass: "text-emerald-100",
    glowClass: "shadow-[0_0_0_1px_rgba(74,222,128,0.35),0_10px_20px_rgba(22,163,74,0.4)]",
  },
  confidence: {
    key: "confidence",
    label: "Confidence",
    icon: Medal,
    frameClass: "from-yellow-300 via-white to-amber-500",
    panelClass: "from-amber-500 via-orange-700 to-black",
    glyphClass: "text-amber-50",
    glowClass: "shadow-[0_0_0_1px_rgba(250,204,21,0.35),0_10px_20px_rgba(245,158,11,0.38)]",
  },
  survivor: {
    key: "survivor",
    label: "Survivor",
    icon: Shield,
    frameClass: "from-red-300 via-white to-rose-500",
    panelClass: "from-red-500 via-rose-700 to-black",
    glyphClass: "text-red-100",
    glowClass: "shadow-[0_0_0_1px_rgba(251,113,133,0.35),0_10px_20px_rgba(225,29,72,0.38)]",
  },
  bracket: {
    key: "bracket",
    label: "Bracket",
    icon: GitBranch,
    frameClass: "from-violet-300 via-white to-violet-500",
    panelClass: "from-violet-500 via-indigo-700 to-black",
    glyphClass: "text-violet-100",
    glowClass: "shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_10px_20px_rgba(99,102,241,0.38)]",
  },
  squares: {
    key: "squares",
    label: "Squares",
    icon: Grid3X3,
    frameClass: "from-fuchsia-300 via-white to-fuchsia-500",
    panelClass: "from-fuchsia-500 via-purple-700 to-black",
    glyphClass: "text-fuchsia-100",
    glowClass: "shadow-[0_0_0_1px_rgba(232,121,249,0.35),0_10px_20px_rgba(147,51,234,0.38)]",
  },
  props: {
    key: "props",
    label: "Props",
    icon: ListChecks,
    frameClass: "from-cyan-300 via-white to-cyan-500",
    panelClass: "from-cyan-500 via-blue-700 to-black",
    glyphClass: "text-cyan-100",
    glowClass: "shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_10px_20px_rgba(14,116,144,0.38)]",
  },
  streak: {
    key: "streak",
    label: "Streak",
    icon: Flame,
    frameClass: "from-orange-300 via-white to-orange-500",
    panelClass: "from-orange-500 via-red-700 to-black",
    glyphClass: "text-orange-100",
    glowClass: "shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_10px_20px_rgba(234,88,12,0.38)]",
  },
  upset: {
    key: "upset",
    label: "Upset",
    icon: Siren,
    frameClass: "from-rose-300 via-white to-rose-500",
    panelClass: "from-rose-500 via-red-700 to-black",
    glyphClass: "text-rose-100",
    glowClass: "shadow-[0_0_0_1px_rgba(251,113,133,0.35),0_10px_20px_rgba(190,24,93,0.38)]",
  },
  stat: {
    key: "stat",
    label: "Stat",
    icon: BarChart3,
    frameClass: "from-indigo-300 via-white to-indigo-500",
    panelClass: "from-indigo-500 via-blue-700 to-black",
    glyphClass: "text-indigo-100",
    glowClass: "shadow-[0_0_0_1px_rgba(129,140,248,0.35),0_10px_20px_rgba(79,70,229,0.38)]",
  },
  special: {
    key: "special",
    label: "Special",
    icon: Zap,
    frameClass: "from-pink-300 via-white to-pink-500",
    panelClass: "from-pink-500 via-purple-700 to-black",
    glyphClass: "text-pink-100",
    glowClass: "shadow-[0_0_0_1px_rgba(244,114,182,0.35),0_10px_20px_rgba(168,85,247,0.38)]",
  },
};

const SPORT_PANEL_CLASSES: Array<{ match: string; panelClass: string; frameClass: string; glyphClass: string }> = [
  {
    match: "americanfootball_",
    panelClass: "from-red-500 via-rose-700 to-black",
    frameClass: "from-red-300 via-white to-amber-500",
    glyphClass: "text-red-100",
  },
  {
    match: "basketball_",
    panelClass: "from-orange-500 via-amber-700 to-black",
    frameClass: "from-orange-300 via-white to-yellow-500",
    glyphClass: "text-orange-100",
  },
  {
    match: "baseball_",
    panelClass: "from-sky-500 via-blue-700 to-black",
    frameClass: "from-sky-300 via-white to-red-400",
    glyphClass: "text-sky-100",
  },
  {
    match: "icehockey_",
    panelClass: "from-cyan-500 via-blue-700 to-black",
    frameClass: "from-cyan-200 via-white to-indigo-400",
    glyphClass: "text-cyan-100",
  },
  {
    match: "soccer_",
    panelClass: "from-emerald-500 via-green-700 to-black",
    frameClass: "from-emerald-300 via-white to-lime-400",
    glyphClass: "text-emerald-100",
  },
  {
    match: "golf_",
    panelClass: "from-lime-500 via-emerald-700 to-black",
    frameClass: "from-lime-300 via-white to-yellow-400",
    glyphClass: "text-lime-100",
  },
  {
    match: "mma_",
    panelClass: "from-rose-500 via-red-700 to-black",
    frameClass: "from-rose-300 via-white to-orange-400",
    glyphClass: "text-rose-100",
  },
  {
    match: "nascar_",
    panelClass: "from-yellow-500 via-orange-700 to-black",
    frameClass: "from-yellow-300 via-white to-red-400",
    glyphClass: "text-yellow-100",
  },
];

const ICON_VARIANTS_BY_TEMPLATE: Record<string, Array<LucideIcon | FC<LucideProps>>> = {
  pickem: [Ticket, Crosshair, CircleDollarSign],
  ats: [TrendingUp, Sigma, Swords],
  confidence: [Medal, Crown, Trophy],
  survivor: [Shield, ShieldAlert, Flame],
  bracket: [GitBranch, Sparkles, Trophy],
  squares: [Grid3X3, Dice5, CircleDollarSign],
  props: [ListChecks, Dumbbell, Goal],
  streak: [Flame, Zap, Volleyball],
  upset: [Siren, Swords, Zap],
  stat: [BarChart3, Sigma, TrendingUp],
  special: [Zap, Sparkles, CarFront],
};

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getPoolIconToken(formatKey: string, context?: PoolIconContext): PoolIconToken {
  const normalized = String(formatKey || "").toLowerCase();
  const baseToken = TOKENS[normalized]
    || (normalized.includes("survivor")
      ? TOKENS.survivor
      : normalized.includes("pick")
      ? TOKENS.pickem
      : normalized.includes("confidence")
      ? TOKENS.confidence
      : normalized.includes("streak")
      ? TOKENS.streak
      : (normalized.includes("upset") || normalized.includes("underdog"))
      ? TOKENS.upset
      : DEFAULT_TOKEN);

  const keySeed = `${context?.poolTypeKey || ""}|${context?.sportKey || ""}|${normalized}`;
  const poolHash = hashString(keySeed);
  const iconPool = ICON_VARIANTS_BY_TEMPLATE[baseToken.key] || [baseToken.icon];
  const icon = iconPool[poolHash % iconPool.length] || baseToken.icon;

  const sportKey = String(context?.sportKey || "").toLowerCase();
  const sportPalette = SPORT_PANEL_CLASSES.find((entry) => sportKey.startsWith(entry.match));

  return {
    ...baseToken,
    icon,
    panelClass: sportPalette?.panelClass || baseToken.panelClass,
    frameClass: sportPalette?.frameClass || baseToken.frameClass,
    glyphClass: sportPalette?.glyphClass || baseToken.glyphClass,
  };
}
