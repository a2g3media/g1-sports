// @ts-nocheck
import { runCoachGBrain } from "./coachgBrainService";
import { buildCoachGScript } from "./coachgScriptService";
import { enforceInformationalClosing, sanitizeCoachGList, sanitizeCoachGText } from "./coachgCompliance";
import type { FeaturedGameSelection } from "./featuredGameSelectorService";

export interface CoachGAnalysisObject {
  sport: string;
  game_id: string;
  teams: {
    away: string;
    home: string;
  };
  headline: string;
  short_summary: string;
  full_analysis_text: string;
  video_script: string;
  publish_status: "draft" | "published_app" | "published_site" | "published_owned" | "archived";
  created_at: string;
  source_payload_id?: string | null;
}

function toHeadline(featured: FeaturedGameSelection, summary: string): string {
  const base = `${featured.awayTeam} vs ${featured.homeTeam}: ${summary}`;
  const clean = sanitizeCoachGText(base);
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}

function composeAnalysisText(params: {
  summary: string;
  actionableIntel: string[];
  modelNotes: string[];
  lineMovement: string;
  injuryAngle: string;
  paceAngle: string;
}): string {
  const sections = [
    params.summary,
    `Pace and form: ${params.paceAngle}`,
    `Injury context: ${params.injuryAngle}`,
    `Market movement: ${params.lineMovement}`,
    ...params.actionableIntel.slice(0, 3).map((line) => `What bettors are watching: ${line}`),
    ...params.modelNotes.slice(0, 2).map((line) => `Trend note: ${line}`),
  ];
  return enforceInformationalClosing(sanitizeCoachGText(sections.join(" ")));
}

export async function generateCoachGAnalysis(params: {
  db: D1Database;
  env: Env;
  featuredGame: FeaturedGameSelection;
}): Promise<CoachGAnalysisObject> {
  const { db, env, featuredGame } = params;
  const brain = await runCoachGBrain({
    db,
    env,
    userId: null,
    surface: "game",
    gameId: featuredGame.gameId,
    query: "featured game analysis",
  });

  const gameContext = brain.contexts.game_context;
  const summary = sanitizeCoachGText(brain.summary);
  const actionableIntel = sanitizeCoachGList(brain.actionable_intel, 4);
  const modelNotes = sanitizeCoachGList(brain.model_notes, 3);

  const movementText = gameContext
    ? `Current spread ${gameContext.currentLine.spread ?? "N/A"}, total ${gameContext.currentLine.total ?? "N/A"}, with line movement ${gameContext.lineMovement.toFixed(2)}.`
    : "Current market movement is still developing from available book data.";
  const injuryText = gameContext?.injuries?.length
    ? gameContext.injuries.slice(0, 2).map((i) => `${i.name} (${i.status})`).join(", ")
    : "No major confirmed injury edge yet.";
  const paceText = gameContext?.recentForm?.home || gameContext?.recentForm?.away
    ? `${featured.homeTeam} recent form ${gameContext?.recentForm?.home || "N/A"}, ${featured.awayTeam} recent form ${gameContext?.recentForm?.away || "N/A"}.`
    : "Recent form and tempo indicators are balanced heading into this matchup.";

  const fullAnalysis = composeAnalysisText({
    summary,
    actionableIntel,
    modelNotes,
    lineMovement: movementText,
    injuryAngle: injuryText,
    paceAngle: paceText,
  });

  const shortSummary = sanitizeCoachGText(
    `${summary} ${actionableIntel[0] || "Monitor pace, injuries, and line reaction before tip/kickoff."}`
  ).slice(0, 280);

  const headline = toHeadline(featuredGame, shortSummary);
  const videoScript = buildCoachGScript({
    headline,
    shortSummary,
    fullAnalysisText: fullAnalysis,
    homeTeam: featuredGame.homeTeam,
    awayTeam: featuredGame.awayTeam,
    sport: featuredGame.sport,
  });

  return {
    sport: featuredGame.sport,
    game_id: featuredGame.gameId,
    teams: {
      away: featuredGame.awayTeam,
      home: featuredGame.homeTeam,
    },
    headline,
    short_summary: shortSummary,
    full_analysis_text: fullAnalysis,
    video_script: videoScript,
    publish_status: "draft",
    created_at: new Date().toISOString(),
    source_payload_id: brain.intelligence_payload?.id || null,
  };
}

