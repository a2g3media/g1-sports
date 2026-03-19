import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

type PropOperator = "over" | "under" | "yes" | "no" | "eq" | "gte" | "lte";

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOperator(value: unknown): PropOperator {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "over" || raw === "o") return "over";
  if (raw === "under" || raw === "u") return "under";
  if (raw === "yes" || raw === "y") return "yes";
  if (raw === "no" || raw === "n") return "no";
  if (raw === "gte" || raw === ">=") return "gte";
  if (raw === "lte" || raw === "<=") return "lte";
  return "eq";
}

function evaluateProp(operator: PropOperator, actual: number, line: number): boolean {
  if (operator === "over" || operator === "gte") return actual > line || (operator === "gte" && actual >= line);
  if (operator === "under" || operator === "lte") return actual < line || (operator === "lte" && actual <= line);
  if (operator === "yes") return actual >= 1;
  if (operator === "no") return actual <= 0;
  return actual === line;
}

function getPropState(action: PoolEntryAction, event: LiveEventData): {
  valid: boolean;
  metricKey: string;
  operator: PropOperator;
  line: number | null;
  actual: number | null;
} {
  const metadata = action.metadata || {};
  const metricKey = String(metadata.metricKey || metadata.propKey || metadata.marketKey || "").trim();
  const operator = normalizeOperator(metadata.operator ?? metadata.pickType ?? action.selectionId);
  const line = toNumber(metadata.line ?? metadata.threshold ?? metadata.targetValue);
  const actual = metricKey ? toNumber(event.liveData?.[metricKey]) : null;
  return {
    valid: Boolean(metricKey && actual !== null && (line !== null || operator === "yes" || operator === "no")),
    metricKey,
    operator,
    line,
    actual,
  };
}

export const propsEvaluator: PoolEvaluator = {
  poolType: "props",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    if (event.status === "SCHEDULED") return "PENDING";
    if (event.status === "POSTPONED" || event.status === "CANCELED") return "PUSHED";

    const propState = getPropState(action, event);
    if (!propState.valid || propState.actual === null) {
      // Fallback for legacy prop entries that are still winner-based.
      return pickemEvaluator.evaluatePlayerStatus(action, event, context);
    }

    const line = propState.line ?? 0;
    const isHit = evaluateProp(propState.operator, propState.actual, line);

    if (event.status === "FINAL") {
      return isHit ? "SAFE" : "ELIMINATED";
    }
    if (event.status === "LIVE" || event.status === "HALFTIME") {
      return isHit ? "WINNING" : "AT_RISK";
    }
    return "UNKNOWN";
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const propState = getPropState(action, event);
    if (propState.valid && propState.actual !== null) {
      const linePart = propState.line === null ? "" : ` ${propState.operator.toUpperCase()} ${propState.line}`;
      const detail = `${propState.metricKey}${linePart} (actual ${propState.actual})`;
      if (status === "SAFE") return `Prop hit: ${detail}`;
      if (status === "ELIMINATED") return `Prop missed: ${detail}`;
      if (status === "WINNING") return `Prop currently on track: ${detail}`;
      if (status === "AT_RISK") return `Prop currently behind line: ${detail}`;
      return detail;
    }
    return pickemEvaluator.getStatusReason?.(action, event, status) || "Prop evaluation pending";
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return pickemEvaluator.getSelectionSide(selectionId, event);
  },
};
