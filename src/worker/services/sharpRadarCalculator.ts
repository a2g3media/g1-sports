import type { SharpSignalResult } from "../types/coachg";
import type { CoachGContextPackage } from "../types/context";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hasReverseLineMovement(ctx: CoachGContextPackage): boolean {
  const g = ctx.gameContext;
  if (!g) return false;
  const publicHome = g.publicBettingPercentage.home ?? 50;
  const move = g.lineMovement;
  return (publicHome >= 70 && move > 0) || (publicHome <= 30 && move < 0);
}

function hasSteamMove(ctx: CoachGContextPackage): boolean {
  const g = ctx.gameContext;
  if (!g) return false;
  return Math.abs(g.lineMovement) >= 1.5;
}

function hasPublicMoneyMismatch(ctx: CoachGContextPackage): boolean {
  const g = ctx.gameContext;
  if (!g) return false;
  const homeGap = Math.abs((g.publicBettingPercentage.home ?? 50) - (g.moneyPercentage.home ?? 50));
  const awayGap = Math.abs((g.publicBettingPercentage.away ?? 50) - (g.moneyPercentage.away ?? 50));
  return Math.max(homeGap, awayGap) >= 12;
}

function hasTrapLine(ctx: CoachGContextPackage): boolean {
  const g = ctx.gameContext;
  if (!g) return false;
  const publicHome = g.publicBettingPercentage.home ?? 50;
  return Math.abs(g.lineMovement) >= 1 && (publicHome >= 72 || publicHome <= 28);
}

export function calculateSharpRadar(contextPackage: CoachGContextPackage): SharpSignalResult[] {
  const signals: SharpSignalResult[] = [];

  if (hasReverseLineMovement(contextPackage)) {
    signals.push({
      type: "sharp_money",
      confidence: 82,
      reasonCodes: ["reverse_line_movement", "public_money_divergence"],
      summary: "Reverse line movement vs public tickets.",
      impact: "high",
    });
  }

  if (hasSteamMove(contextPackage)) {
    signals.push({
      type: "steam_move",
      confidence: 76,
      reasonCodes: ["steam_move"],
      summary: "Rapid spread shift indicates possible steam action.",
      impact: "high",
    });
  }

  if (hasPublicMoneyMismatch(contextPackage)) {
    signals.push({
      type: "public_heavy",
      confidence: 70,
      reasonCodes: ["public_money_divergence"],
      summary: "Ticket and money percentages are diverging.",
      impact: "medium",
    });
  }

  if (hasTrapLine(contextPackage)) {
    signals.push({
      type: "trap_line",
      confidence: 64,
      reasonCodes: ["trap_line_shape"],
      summary: "Line shape suggests potential trap setup.",
      impact: "medium",
    });
  }

  return signals
    .map((s) => ({ ...s, confidence: clamp(s.confidence, 0, 100) }))
    .slice(0, 6);
}
