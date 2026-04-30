export type SportAvatarConfig = {
  src: string;
  fallbackSrc?: string;
  alt: string;
  glowClass: string;
};

const DEFAULT_SPORT_AVATAR: SportAvatarConfig = {
  src: "/assets/sports/default-ball-ai.svg",
  alt: "Sport ball avatar",
  glowClass: "shadow-[0_0_26px_rgba(255,255,255,0.18)]",
};

const SPORT_ICON_VERSION = "20260422";
const withIconVersion = (src: string): string =>
  src.includes("?") ? `${src}&v=${SPORT_ICON_VERSION}` : `${src}?v=${SPORT_ICON_VERSION}`;

const SPORT_AVATARS: Record<string, SportAvatarConfig> = {
  nba: {
    src: withIconVersion("/assets/sports/nba-ball-ai.svg"),
    fallbackSrc: "/assets/sports/nba-ball-ai.svg",
    alt: "Basketball",
    glowClass: "shadow-[0_0_26px_rgba(251,146,60,0.35)]",
  },
  nfl: {
    src: withIconVersion("/assets/sports/nfl-ball-ai.svg"),
    fallbackSrc: "/assets/sports/nfl-ball-ai.svg",
    alt: "Football",
    glowClass: "shadow-[0_0_26px_rgba(110,231,183,0.3)]",
  },
  mlb: {
    src: withIconVersion("/assets/sports/mlb-ball-ai.svg"),
    fallbackSrc: "/assets/sports/mlb-ball-ai.svg",
    alt: "Baseball",
    glowClass: "shadow-[0_0_26px_rgba(248,113,113,0.32)]",
  },
  nhl: {
    src: withIconVersion("/assets/sports/nhl-puck-ai.svg"),
    fallbackSrc: "/assets/sports/nhl-puck-ai.svg",
    alt: "Hockey puck",
    glowClass: "shadow-[0_0_26px_rgba(103,232,249,0.3)]",
  },
  ncaaf: {
    src: withIconVersion("/assets/sports/ncaaf-ball-ai.svg"),
    fallbackSrc: "/assets/sports/ncaaf-ball-ai.svg",
    alt: "College football",
    glowClass: "shadow-[0_0_26px_rgba(252,211,77,0.3)]",
  },
  ncaab: {
    src: withIconVersion("/assets/sports/ncaab-ball-ai.svg"),
    fallbackSrc: "/assets/sports/ncaab-ball-ai.svg",
    alt: "College basketball",
    glowClass: "shadow-[0_0_26px_rgba(147,197,253,0.3)]",
  },
  soccer: {
    src: withIconVersion("/assets/sports/soccer-ball-ai.svg"),
    fallbackSrc: "/assets/sports/soccer-ball-ai.svg",
    alt: "Soccer ball",
    glowClass: "shadow-[0_0_26px_rgba(52,211,153,0.3)]",
  },
  golf: {
    src: withIconVersion("/assets/sports/golf-ball-ai.svg"),
    fallbackSrc: "/assets/sports/golf-ball-ai.svg",
    alt: "Golf ball",
    glowClass: "shadow-[0_0_26px_rgba(45,212,191,0.3)]",
  },
  mma: {
    src: withIconVersion("/assets/sports/mma-gloves-ai.svg"),
    fallbackSrc: "/assets/sports/mma-gloves-ai.svg",
    alt: "UFC gloves",
    glowClass: "shadow-[0_0_26px_rgba(251,113,133,0.32)]",
  },
};

export function getSportAvatarConfig(sportKey: string): SportAvatarConfig {
  if (!sportKey) return DEFAULT_SPORT_AVATAR;
  return SPORT_AVATARS[sportKey.toLowerCase()] ?? DEFAULT_SPORT_AVATAR;
}
