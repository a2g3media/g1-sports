import { enforceInformationalClosing, sanitizeCoachGText } from "./coachgCompliance";

export interface CoachGScriptInput {
  headline: string;
  shortSummary: string;
  fullAnalysisText: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
}

function trimToWordRange(text: string, minWords = 70, maxWords = 115): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords && words.length >= minWords) return text.trim();
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ").trim()}.`;
}

export function buildCoachGScript(input: CoachGScriptInput): string {
  const lines = [
    "What's up G1, Coach G here.",
    `Let's break down ${input.awayTeam} at ${input.homeTeam}.`,
    input.headline,
    input.shortSummary,
    `What I'm watching most in this ${input.sport.toUpperCase()} matchup is pace, injury context, and live market reaction.`,
    "Stay locked in to pregame updates and in-game momentum swings. Informational only for the G1 community.",
  ]
    .map((line) => sanitizeCoachGText(line))
    .filter((line) => line.length > 0);

  const script = trimToWordRange(lines.join(" "));
  return enforceInformationalClosing(script);
}

