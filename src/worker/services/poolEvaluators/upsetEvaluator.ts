import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

function isUnderdogSelection(action: PoolEntryAction): boolean {
  const metadata = action.metadata || {};
  const odds = Number((metadata.odds as number | string | undefined) ?? NaN);
  const spread = Number((metadata.spread as number | string | undefined) ?? NaN);
  if (Number.isFinite(odds)) return odds > 0;
  if (Number.isFinite(spread)) return spread > 0;
  return true;
}

export const upsetEvaluator: PoolEvaluator = {
  poolType: "upset",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    if (!isUnderdogSelection(action) && event.status === "FINAL") {
      return "ELIMINATED";
    }
    return pickemEvaluator.evaluatePlayerStatus(action, event, context);
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    if (!isUnderdogSelection(action) && event.status === "FINAL") {
      return "Invalid upset pick (favorite selected)";
    }
    const base = pickemEvaluator.getStatusReason?.(action, event, status) || "";
    if (!base) return "Upset status pending";
    return `Upset pool: ${base}`;
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return pickemEvaluator.getSelectionSide(selectionId, event);
  },
};
