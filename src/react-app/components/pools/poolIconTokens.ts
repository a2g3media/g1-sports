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

export function getPoolIconToken(formatKey: string): PoolIconToken {
  const normalized = String(formatKey || "").toLowerCase();
  if (TOKENS[normalized]) return TOKENS[normalized];
  if (normalized.includes("survivor")) return TOKENS.survivor;
  if (normalized.includes("pick")) return TOKENS.pickem;
  if (normalized.includes("confidence")) return TOKENS.confidence;
  if (normalized.includes("streak")) return TOKENS.streak;
  if (normalized.includes("upset") || normalized.includes("underdog")) return TOKENS.upset;
  return DEFAULT_TOKEN;
}
