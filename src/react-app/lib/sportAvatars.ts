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

const SPORT_AVATARS: Record<string, SportAvatarConfig> = {
  nba: {
    src: "/assets/sports/nba-ball-photo.png",
    fallbackSrc: "/assets/sports/nba-ball-ai.svg",
    alt: "Basketball",
    glowClass: "shadow-[0_0_26px_rgba(251,146,60,0.35)]",
  },
  nfl: {
    src: "/assets/sports/nfl-ball-photo.png",
    fallbackSrc: "/assets/sports/nfl-ball-ai.svg",
    alt: "Football",
    glowClass: "shadow-[0_0_26px_rgba(110,231,183,0.3)]",
  },
  mlb: {
    src: "/assets/sports/mlb-ball-photo.png",
    fallbackSrc: "/assets/sports/mlb-ball-ai.svg",
    alt: "Baseball",
    glowClass: "shadow-[0_0_26px_rgba(248,113,113,0.32)]",
  },
  nhl: {
    src: "/assets/sports/nhl-puck-photo.png",
    fallbackSrc: "/assets/sports/nhl-puck-ai.svg",
    alt: "Hockey puck",
    glowClass: "shadow-[0_0_26px_rgba(103,232,249,0.3)]",
  },
  ncaaf: {
    src: "/assets/sports/ncaaf-ball-photo.png",
    fallbackSrc: "/assets/sports/ncaaf-ball-ai.svg",
    alt: "College football",
    glowClass: "shadow-[0_0_26px_rgba(252,211,77,0.3)]",
  },
  ncaab: {
    src: "/assets/sports/ncaab-ball-photo.png",
    fallbackSrc: "/assets/sports/ncaab-ball-ai.svg",
    alt: "College basketball",
    glowClass: "shadow-[0_0_26px_rgba(147,197,253,0.3)]",
  },
  soccer: {
    src: "/assets/sports/soccer-ball-photo.png",
    fallbackSrc: "/assets/sports/soccer-ball-ai.svg",
    alt: "Soccer ball",
    glowClass: "shadow-[0_0_26px_rgba(52,211,153,0.3)]",
  },
  golf: {
    src: "/assets/sports/golf-ball-photo.png",
    fallbackSrc: "/assets/sports/golf-ball-ai.svg",
    alt: "Golf ball",
    glowClass: "shadow-[0_0_26px_rgba(45,212,191,0.3)]",
  },
  mma: {
    src: "/assets/sports/mma-ufc-gloves-photo.png",
    fallbackSrc: "/assets/sports/mma-gloves-photo.png",
    alt: "UFC gloves",
    glowClass: "shadow-[0_0_26px_rgba(251,113,133,0.32)]",
  },
};

export function getSportAvatarConfig(sportKey: string): SportAvatarConfig {
  if (!sportKey) return DEFAULT_SPORT_AVATAR;
  return SPORT_AVATARS[sportKey.toLowerCase()] ?? DEFAULT_SPORT_AVATAR;
}
