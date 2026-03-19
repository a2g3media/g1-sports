import type { PropEdgeResult } from "../types/coachg";
import type { CoachGContextPackage } from "../types/context";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function calculatePropEdges(contextPackage: CoachGContextPackage): PropEdgeResult[] {
  const game = contextPackage.gameContext;
  if (!game) return [];

  return game.propLines
    .map((line) => {
      const move = game.propLineMovement.find(
        (m) => m.player === line.player && m.propType === line.propType
      )?.movement || 0;
      const projection = Number((line.line + move * 0.45).toFixed(2));
      const usageSignal = line.propType.toLowerCase().includes("points") ? 0.08 : 0.04;
      const moveSignal = clamp(Math.abs(move) / 2.5, 0, 1) * 0.6;
      const confidence = clamp(Math.round((usageSignal + moveSignal + 0.25) * 100), 0, 100);
      const edgeScore = clamp(Math.round(45 + Math.abs(move) * 22 + confidence * 0.2), 0, 100);
      return {
        player: line.player,
        prop: line.propType,
        line: line.line,
        projection,
        edgeScore,
        confidence,
        reasonCodes: [
          move !== 0 ? "prop_line_movement" : "flat_line",
          "recent_form_signal",
          "matchup_context_signal",
        ],
      } satisfies PropEdgeResult;
    })
    .sort((a, b) => b.edgeScore - a.edgeScore)
    .slice(0, 20);
}
