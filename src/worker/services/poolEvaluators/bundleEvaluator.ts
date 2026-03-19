import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

type BundleChildStatus = "SAFE" | "ELIMINATED" | "WINNING" | "AT_RISK" | "TIED" | "PENDING" | "PUSHED" | "UNKNOWN";

function normalizeChildStatus(value: unknown): BundleChildStatus {
  const raw = String(value || "").trim().toUpperCase();
  if (
    raw === "SAFE"
    || raw === "ELIMINATED"
    || raw === "WINNING"
    || raw === "AT_RISK"
    || raw === "TIED"
    || raw === "PENDING"
    || raw === "PUSHED"
  ) {
    return raw;
  }
  return "UNKNOWN";
}

function collectChildStatuses(action: PoolEntryAction): BundleChildStatus[] {
  const metadata = action.metadata || {};
  const statuses = metadata.childStatuses ?? metadata.child_statuses;
  if (!Array.isArray(statuses)) return [];
  return statuses.map(normalizeChildStatus);
}

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

export const bundleEvaluator: PoolEvaluator = {
  poolType: "bundle",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    const childStatuses = collectChildStatuses(action);
    const requireAllChildren = asBoolean(
      context.rulesJson?.require_all_children_safe ?? context.rulesJson?.requireAllChildrenSafe,
      true,
    );

    if (childStatuses.length > 0) {
      const safeCount = childStatuses.filter((s) => s === "SAFE").length;
      const eliminatedCount = childStatuses.filter((s) => s === "ELIMINATED").length;
      const liveRiskCount = childStatuses.filter((s) => s === "AT_RISK" || s === "WINNING" || s === "TIED").length;
      const pendingCount = childStatuses.filter((s) => s === "PENDING").length;

      if (requireAllChildren && eliminatedCount > 0) return "ELIMINATED";
      if (!requireAllChildren && safeCount > 0 && eliminatedCount === 0 && liveRiskCount === 0 && pendingCount === 0) {
        return "SAFE";
      }
      if (safeCount === childStatuses.length && childStatuses.length > 0) return "SAFE";
      if (liveRiskCount > 0) return "AT_RISK";
      if (pendingCount > 0) return "PENDING";
      if (eliminatedCount > 0) return "ELIMINATED";
    }

    // Fallback to winner-based logic for bundle entries without child snapshots.
    return pickemEvaluator.evaluatePlayerStatus(action, event, context);
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const childStatuses = collectChildStatuses(action);
    if (childStatuses.length > 0) {
      const safe = childStatuses.filter((s) => s === "SAFE").length;
      const eliminated = childStatuses.filter((s) => s === "ELIMINATED").length;
      const atRisk = childStatuses.filter((s) => s === "AT_RISK").length;
      const pending = childStatuses.filter((s) => s === "PENDING").length;
      if (status === "SAFE") return `Bundle cleared: ${safe}/${childStatuses.length} child pools graded safe`;
      if (status === "ELIMINATED") return `Bundle failed: ${eliminated} child pool result(s) eliminated`;
      if (status === "AT_RISK") return `Bundle in play: ${atRisk} child pool result(s) at risk`;
      if (status === "PENDING") return `Bundle waiting on ${pending} child pool result(s)`;
    }
    const base = pickemEvaluator.getStatusReason?.(action, event, status) || "";
    return base ? `Bundle fallback: ${base}` : "Bundle status pending";
  },

  getSelectionSide(selectionId: string, event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return pickemEvaluator.getSelectionSide(selectionId, event);
  },
};
