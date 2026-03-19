import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const statEvaluator: PoolEvaluator = {
  poolType: "stat",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    const metricKey = String(action.metadata?.metricKey || "");
    const target = toNumber(action.metadata?.targetValue);
    const actual = toNumber(metricKey ? event.liveData?.[metricKey] : null);

    // If this entry is stat-driven and we have metric data, evaluate directly.
    if (metricKey && target !== null && actual !== null) {
      if (event.status === "FINAL") {
        return actual >= target ? "SAFE" : "ELIMINATED";
      }
      if (event.status === "LIVE" || event.status === "HALFTIME") {
        return actual >= target ? "WINNING" : "AT_RISK";
      }
      if (event.status === "SCHEDULED") return "PENDING";
      if (event.status === "POSTPONED" || event.status === "CANCELED") return "PUSHED";
    }

    // Fallback to winner-based status when stat metadata is unavailable.
    return pickemEvaluator.evaluatePlayerStatus(action, event, context);
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const metricKey = String(action.metadata?.metricKey || "");
    const target = toNumber(action.metadata?.targetValue);
    const actual = toNumber(metricKey ? event.liveData?.[metricKey] : null);
    if (metricKey && target !== null && actual !== null) {
      if (status === "SAFE" || status === "WINNING") return `${metricKey}: ${actual} / target ${target}`;
      if (status === "ELIMINATED" || status === "AT_RISK") return `${metricKey}: ${actual} below ${target}`;
    }
    return pickemEvaluator.getStatusReason?.(action, event, status) || "";
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return pickemEvaluator.getSelectionSide(selectionId, event);
  },
};
