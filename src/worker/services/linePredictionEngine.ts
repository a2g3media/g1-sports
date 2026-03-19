import type { LinePredictionResult } from "../types/coachg";
import type { CoachGContextPackage } from "../types/context";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function predictLineDirection(contextPackage: CoachGContextPackage): LinePredictionResult {
  const game = contextPackage.gameContext;
  if (!game) {
    return {
      currentLine: null,
      projectedLine: null,
      confidence: 0,
      reasonCodes: ["no_game_context"],
    };
  }

  const current = game.currentLine.spread;
  if (current === null) {
    return {
      currentLine: null,
      projectedLine: null,
      confidence: 0,
      reasonCodes: ["no_current_line"],
    };
  }

  const velocitySignal = clamp(Math.abs(game.lineMovement) / 2, 0, 1);
  const splitGapHome = (game.moneyPercentage.home ?? 50) - (game.publicBettingPercentage.home ?? 50);
  const splitGapAway = (game.moneyPercentage.away ?? 50) - (game.publicBettingPercentage.away ?? 50);
  const splitSignal = clamp(Math.max(Math.abs(splitGapHome), Math.abs(splitGapAway)) / 25, 0, 1);
  const injurySignal = clamp(game.injuries.filter((i) => i.impact === "high").length / 3, 0, 1);
  const sharpSignal = clamp((contextPackage.marketContext?.sharpIndicators.length || 0) / 3, 0, 1);

  const direction = splitGapHome > splitGapAway ? -1 : 1;
  const drift = (velocitySignal * 0.5 + splitSignal * 0.25 + injurySignal * 0.15 + sharpSignal * 0.1) * direction;
  const projectedLine = Number((current + drift).toFixed(2));
  const confidence = clamp(Math.round((velocitySignal * 0.35 + splitSignal * 0.25 + sharpSignal * 0.25 + injurySignal * 0.15) * 100), 0, 100);

  return {
    currentLine: current,
    projectedLine,
    confidence,
    reasonCodes: [
      "line_velocity",
      "public_money_split",
      "injury_news",
      "sharp_signal_presence",
      "market_consensus",
    ],
  };
}
