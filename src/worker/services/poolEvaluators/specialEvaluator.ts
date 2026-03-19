import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { bundleEvaluator } from "./bundleEvaluator";

export const specialEvaluator: PoolEvaluator = {
  poolType: "special",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    return bundleEvaluator.evaluatePlayerStatus(action, event, context);
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const base = bundleEvaluator.getStatusReason?.(action, event, status) || "";
    return base ? `Special format: ${base}` : "Special format evaluation pending";
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return bundleEvaluator.getSelectionSide(selectionId, event);
  },
};
