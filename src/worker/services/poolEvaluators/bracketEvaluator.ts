import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

function asBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

function getRoundLabel(action: PoolEntryAction): string {
  const fromMetadata = typeof action.metadata?.round === "string" ? action.metadata.round : "";
  if (fromMetadata.trim()) return fromMetadata.trim();
  return "this round";
}

export const bracketEvaluator: PoolEvaluator = {
  poolType: "bracket",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    const base = pickemEvaluator.evaluatePlayerStatus(action, event, context);
    const eliminationTracking = asBoolean(
      context.rulesJson?.trackElimination ?? context.rulesJson?.track_elimination,
      true,
    );

    // Bracket pools can optionally disable elimination semantics (points-only progression).
    if (!eliminationTracking && base === "ELIMINATED") {
      return "AT_RISK";
    }

    // Bracket final ties are treated as push/no-points unless commissioner overrides elsewhere.
    if (event.status === "FINAL" && event.homeScore === event.awayScore) {
      return "PUSHED";
    }

    return base;
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const round = getRoundLabel(action);
    const base = pickemEvaluator.getStatusReason?.(action, event, status) || "";
    if (!base) return `Bracket pick in ${round} is pending evaluation`;
    if (status === "SAFE") return `${round}: advance earned (${base.toLowerCase()})`;
    if (status === "ELIMINATED") return `${round}: bracket path busted (${base.toLowerCase()})`;
    if (status === "AT_RISK") return `${round}: path under pressure (${base.toLowerCase()})`;
    return `${round}: ${base}`;
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return pickemEvaluator.getSelectionSide(selectionId, event);
  },
};
