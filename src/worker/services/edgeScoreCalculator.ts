import type { EdgeScoreResult } from "../types/coachg";
import type { CoachGContextPackage } from "../types/context";

export interface EdgeScoreWeights {
  lineMovement: number;
  injuryImpact: number;
  publicImbalance: number;
  sharpMoney: number;
  restAdvantage: number;
  travelFatigue: number;
  recentForm: number;
  headToHead: number;
}

export const DEFAULT_EDGE_SCORE_WEIGHTS: EdgeScoreWeights = {
  lineMovement: 18,
  injuryImpact: 12,
  publicImbalance: 12,
  sharpMoney: 16,
  restAdvantage: 10,
  travelFatigue: 8,
  recentForm: 14,
  headToHead: 10,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseRecord(form: string | null): { wins: number; losses: number } | null {
  if (!form) return null;
  const [w, l] = form.split("-").map((x) => Number(x));
  if (!Number.isFinite(w) || !Number.isFinite(l)) return null;
  return { wins: w, losses: l };
}

function normalizedLineMovement(val: number): number {
  return clamp(Math.abs(val) / 2.5, 0, 1);
}

function normalizedInjuryImpact(packageCtx: CoachGContextPackage): number {
  const high = packageCtx.gameContext?.injuries.filter((i) => i.impact === "high").length || 0;
  const medium = packageCtx.gameContext?.injuries.filter((i) => i.impact === "medium").length || 0;
  return clamp((high * 0.6 + medium * 0.25), 0, 1);
}

function normalizedPublicImbalance(packageCtx: CoachGContextPackage): number {
  const g = packageCtx.gameContext;
  if (!g) return 0;
  const home = Math.abs((g.publicBettingPercentage.home ?? 50) - (g.moneyPercentage.home ?? 50));
  const away = Math.abs((g.publicBettingPercentage.away ?? 50) - (g.moneyPercentage.away ?? 50));
  return clamp(Math.max(home, away) / 30, 0, 1);
}

function normalizedSharpMoney(packageCtx: CoachGContextPackage): number {
  const indicators = packageCtx.marketContext?.sharpIndicators || [];
  return indicators.length > 0 ? clamp(indicators.length / 3, 0, 1) : 0;
}

function normalizedRestAdvantage(packageCtx: CoachGContextPackage): number {
  const g = packageCtx.gameContext;
  if (!g) return 0;
  const home = g.restDays.home ?? 0;
  const away = g.restDays.away ?? 0;
  return clamp(Math.abs(home - away) / 3, 0, 1);
}

function normalizedTravelFatigue(packageCtx: CoachGContextPackage): number {
  const g = packageCtx.gameContext;
  if (!g) return 0;
  const home = g.travelDistance.home ?? 0;
  const away = g.travelDistance.away ?? 0;
  return clamp(Math.abs(home - away) / 1500, 0, 1);
}

function normalizedRecentForm(packageCtx: CoachGContextPackage): number {
  const g = packageCtx.gameContext;
  if (!g) return 0;
  const home = parseRecord(g.recentForm.home);
  const away = parseRecord(g.recentForm.away);
  if (!home || !away) return 0;
  const homeRate = home.wins / Math.max(1, home.wins + home.losses);
  const awayRate = away.wins / Math.max(1, away.wins + away.losses);
  return clamp(Math.abs(homeRate - awayRate), 0, 1);
}

function normalizedHeadToHead(packageCtx: CoachGContextPackage): number {
  return packageCtx.gameContext?.headToHeadHistory ? 0.6 : 0;
}

export function calculateEdgeScore(
  contextPackage: CoachGContextPackage,
  weights: EdgeScoreWeights = DEFAULT_EDGE_SCORE_WEIGHTS
): EdgeScoreResult {
  const g = contextPackage.gameContext;
  if (!g) {
    return { edgeScore: 0, weightedFactors: [] };
  }

  const factors = [
    {
      factor: "line_movement",
      weight: weights.lineMovement,
      value: normalizedLineMovement(g.lineMovement),
      reason: `Absolute move ${g.lineMovement.toFixed(2)} from open`,
    },
    {
      factor: "injury_impact",
      weight: weights.injuryImpact,
      value: normalizedInjuryImpact(contextPackage),
      reason: `${g.injuries.length} tracked injury items`,
    },
    {
      factor: "public_imbalance",
      weight: weights.publicImbalance,
      value: normalizedPublicImbalance(contextPackage),
      reason: "Gap between ticket % and money %",
    },
    {
      factor: "sharp_money",
      weight: weights.sharpMoney,
      value: normalizedSharpMoney(contextPackage),
      reason: `${contextPackage.marketContext?.sharpIndicators.length || 0} sharp indicators`,
    },
    {
      factor: "rest_advantage",
      weight: weights.restAdvantage,
      value: normalizedRestAdvantage(contextPackage),
      reason: "Rest-day differential",
    },
    {
      factor: "travel_fatigue",
      weight: weights.travelFatigue,
      value: normalizedTravelFatigue(contextPackage),
      reason: "Travel distance differential",
    },
    {
      factor: "recent_form",
      weight: weights.recentForm,
      value: normalizedRecentForm(contextPackage),
      reason: "Recent record split differential",
    },
    {
      factor: "head_to_head",
      weight: weights.headToHead,
      value: normalizedHeadToHead(contextPackage),
      reason: "Head-to-head signal availability",
    },
  ];

  const weightedFactors = factors.map((f) => ({
    ...f,
    contribution: Number((f.weight * f.value).toFixed(2)),
  }));
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedSum = weightedFactors.reduce((sum, f) => sum + f.contribution, 0);
  const edgeScore = clamp(Math.round((weightedSum / Math.max(1, totalWeight)) * 100), 0, 100);

  return { edgeScore, weightedFactors };
}
