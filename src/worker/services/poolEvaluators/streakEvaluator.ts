import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

export const streakEvaluator: PoolEvaluator = {
  poolType: "streak",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    return pickemEvaluator.evaluatePlayerStatus(action, event, context);
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const base = pickemEvaluator.getStatusReason?.(action, event, status) || "";
    if (!base) return "Streak result pending";
    if (status === "SAFE") return `Streak alive: ${base}`;
    if (status === "ELIMINATED") return `Streak broken: ${base}`;
    return base;
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return pickemEvaluator.getSelectionSide(selectionId, event);
  },
};
