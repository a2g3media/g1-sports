import { 
  Volleyball,
  Circle,
  Flag,
  Shield,
  Gauge
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface Sport {
  key: string;
  name: string;
  icon: LucideIcon;
  abbr: string;
  seasons: string[];
}

export interface PoolFormat {
  key: string;
  name: string;
  description: string;
  supportedSports: string[];
  variants?: PoolVariant[];
}

export interface PoolVariant {
  key: string;
  name: string;
  description: string;
}

// Sport icons using Lucide for professional System Mode aesthetic
export const SPORTS: Sport[] = [
  { key: "nfl", name: "NFL Football", icon: Volleyball, abbr: "NFL", seasons: ["2024-2025", "2025-2026"] },
  { key: "nba", name: "NBA Basketball", icon: Circle, abbr: "NBA", seasons: ["2024-2025", "2025-2026"] },
  { key: "mlb", name: "MLB Baseball", icon: Circle, abbr: "MLB", seasons: ["2024", "2025"] },
  { key: "nhl", name: "NHL Hockey", icon: Circle, abbr: "NHL", seasons: ["2024-2025", "2025-2026"] },
  { key: "ncaaf", name: "College Football", icon: Volleyball, abbr: "NCAAF", seasons: ["2024", "2025"] },
  { key: "ncaab", name: "College Basketball", icon: Circle, abbr: "NCAAB", seasons: ["2024-2025", "2025-2026"] },
  { key: "soccer", name: "Soccer", icon: Circle, abbr: "SOC", seasons: ["2024-2025", "2025-2026"] },
  { key: "golf", name: "Golf", icon: Flag, abbr: "GOLF", seasons: ["2024", "2025"] },
  { key: "mma", name: "UFC / MMA", icon: Shield, abbr: "MMA", seasons: ["2024", "2025"] },
  { key: "nascar", name: "NASCAR", icon: Gauge, abbr: "NASCAR", seasons: ["2024", "2025"] },
];

// Helper to get sport by key
export function getSport(key: string): Sport | undefined {
  return SPORTS.find(s => s.key === key);
}

export const POOL_FORMATS: PoolFormat[] = [
  {
    key: "pickem",
    name: "Pick'em",
    description: "Select winners straight up or against the spread.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf", "mma", "nascar"],
    variants: [
      { key: "straight", name: "Straight Up", description: "Pick the winner outright" },
      { key: "ats", name: "Against the Spread", description: "Pick winners with point spreads" },
    ],
  },
  {
    key: "ats",
    name: "Against the Spread",
    description: "Pick winners against the point spread. Favorites must win by more than the spread.",
    supportedSports: ["nfl", "nba", "ncaaf", "ncaab", "nhl"],
    variants: [
      { key: "standard", name: "Standard ATS", description: "Pick teams to cover the spread each week" },
      { key: "best_bet", name: "Best Bet", description: "Designate one pick as your best bet for double points" },
    ],
  },
  {
    key: "confidence",
    name: "Confidence",
    description: "Rank selections by confidence level. Higher ranks earn more points.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf", "mma", "nascar"],
    variants: [
      { key: "straight", name: "Straight Up", description: "Confidence picks without spreads" },
      { key: "ats", name: "Against the Spread", description: "Confidence picks with spreads" },
    ],
  },
  {
    key: "survivor",
    name: "Survivor",
    description: "Select one team per period. One loss eliminates. No repeat selections.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "mma", "nascar"],
    variants: [
      { key: "winner", name: "Pick Winner", description: "Pick a team to WIN each week. One loss and you're out." },
      { key: "loser", name: "Pick Loser", description: "Pick a team to LOSE each week. If they win, you're out." },
      { key: "ats", name: "ATS Survivor", description: "Pick a team to cover the spread. Miss the spread, you're eliminated." },
      { key: "two_life", name: "Two Lives", description: "You get 2 chances! Survive one loss and keep playing. Second loss eliminates you." },
      { key: "reentry", name: "Re-Entry", description: "Eliminated? Pay the entry fee again to get back in with a fresh start." },
    ],
  },
  {
    key: "bracket",
    name: "Bracket",
    description: "Tournament bracket predictions for playoffs and championships.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf", "mma", "nascar"],
  },
  {
    key: "squares",
    name: "Squares",
    description: "Grid-based pool with randomly assigned numbers. Match final scores to win.",
    supportedSports: ["nfl", "nba", "nhl", "ncaaf", "ncaab", "soccer"],
    variants: [
      { key: "standard", name: "Standard", description: "Classic 10x10 grid with random numbers" },
      { key: "reverse", name: "Reverse", description: "Numbers reverse at halftime" },
    ],
  },
  {
    key: "props",
    name: "Props",
    description: "Predict player and game props. Over/under on stats, yes/no on events.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf", "mma", "nascar"],
    variants: [
      { key: "player", name: "Player Props", description: "Focus on individual player stats like passing yards, points scored" },
      { key: "game", name: "Game Props", description: "Focus on game-level props like total score, first scorer" },
      { key: "mixed", name: "Mixed Props", description: "Combination of player and game props" },
    ],
  },
  {
    key: "streak",
    name: "Streak",
    description: "Build the longest streak of correct picks with reset and max-pick rules.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf", "mma", "nascar"],
  },
  {
    key: "upset",
    name: "Upset / Underdog",
    description: "Pick underdogs to win with fixed, odds-based, or spread-based scoring.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "mma", "nascar"],
  },
  {
    key: "stat",
    name: "Stat Pool",
    description: "Score selections from sport-specific stat categories and player outcomes.",
    supportedSports: ["mlb", "nhl", "soccer", "golf", "mma", "nascar", "nba", "nfl", "ncaab", "ncaaf"],
  },
  {
    key: "special",
    name: "Special Pools",
    description: "One-and-done, beat-the-streak, pick-6, calcutta, and custom special formats.",
    supportedSports: ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "golf", "mma", "nascar"],
    variants: [
      { key: "one_and_done", name: "One-and-Done", description: "Use each pick once across the season." },
      { key: "beat_the_streak", name: "Beat the Streak", description: "Grow streak value with progressive scoring." },
      { key: "pick6", name: "Pick-6", description: "Hit a fixed slate with high-upside payouts." },
      { key: "college_chaos", name: "College Chaos", description: "Upset-heavy format with bonus multipliers." },
    ],
  },
];

// Helper to get format by key
export function getPoolFormat(key: string): PoolFormat | undefined {
  return POOL_FORMATS.find(f => f.key === key);
}

// Helper to get variant display name
export function getVariantName(formatKey: string, variantKey: string): string {
  const format = getPoolFormat(formatKey);
  if (!format?.variants) return "";
  const variant = format.variants.find(v => v.key === variantKey);
  return variant?.name || "";
}

export interface LeagueRules {
  scoringType: "straight" | "spread" | "points";
  pointsPerWin: number;
  lockType: "game_start" | "first_game" | "custom";
  customLockTime?: string;
  visibilityType: "immediate" | "after_lock" | "after_period";
  tiebreakerType: "none" | "total_points" | "monday_night";
  allowLateJoins: boolean;
  // Survivor-specific
  survivorType?: "winner" | "loser" | "ats";
  survivorVariant?: "standard" | "two_life" | "reentry";
  survivorLives?: number; // Number of lives (default 1, or 2 for two_life)
  survivorReentryFeeCents?: number; // Fee for re-entry (defaults to league entry fee)
  // Pick'em/Confidence specific
  useSpread?: boolean;
}

export const DEFAULT_RULES: LeagueRules = {
  scoringType: "straight",
  pointsPerWin: 1,
  lockType: "game_start",
  visibilityType: "after_lock",
  tiebreakerType: "total_points",
  allowLateJoins: true,
};
