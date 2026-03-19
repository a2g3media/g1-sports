import { sanitizeCoachGText } from "./coachgCompliance";

export interface CaptionSource {
  headline: string;
  shortSummary: string;
  sport: string;
  gameId: string;
  appBaseUrl?: string;
}

function trimForPlatform(text: string, maxChars: number): string {
  const clean = sanitizeCoachGText(text);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 3)}...`;
}

function appLink(baseUrl: string | undefined, gameId: string): string {
  if (!baseUrl) return "";
  const safeBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${safeBase}/games/${encodeURIComponent(gameId)}`;
}

export function buildInstagramCaption(input: CaptionSource): string {
  const link = appLink(input.appBaseUrl, input.gameId);
  const text = [
    "What's up G1. Coach G is watching this matchup closely.",
    input.headline,
    input.shortSummary,
    "Informational only for the G1 community.",
    "#G1Sports #CoachG #SportsIntel",
    link,
  ]
    .filter(Boolean)
    .join(" ");
  return trimForPlatform(text, 2000);
}

export function buildFacebookCaption(input: CaptionSource): string {
  const link = appLink(input.appBaseUrl, input.gameId);
  const text = [
    "What's up G1, Coach G here.",
    input.headline,
    input.shortSummary,
    "Watch pace, injuries, and market movement as this game approaches.",
    "Informational only.",
    link,
  ]
    .filter(Boolean)
    .join(" ");
  return trimForPlatform(text, 5000);
}

export function buildTikTokCaption(input: CaptionSource): string {
  const text = [
    "What's up G1, Coach G here.",
    input.headline,
    "Informational only.",
    "#CoachG #G1Sports #GameBreakdown",
  ].join(" ");
  return trimForPlatform(text, 300);
}

