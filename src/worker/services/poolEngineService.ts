import { getCanonicalEvaluatorPoolType, type PoolTemplateKey } from "../../shared/poolTypeCatalog";
import { scorePickFromRuleEngine } from "../../shared/poolRuleEngine";

export interface LeagueRulesConfig {
  scoringType?: "straight" | "spread" | "points";
  pointsPerWin?: number;
  lockType?: "game_start" | "first_game" | "custom";
  visibilityType?: "immediate" | "after_lock" | "after_period";
  tiebreakerType?: "none" | "total_points" | "monday_night";
  allowLateJoins?: boolean;
  survivorType?: "winner" | "loser" | "ats";
  survivorVariant?: "standard" | "two_life" | "reentry";
  survivorLives?: number;
  survivorReentryFeeCents?: number;
  useSpread?: boolean;
  allow_multiple_entries?: boolean;
  max_entries_per_user?: number;
  entry_package_options?: number[];
  require_payment_before_entry?: boolean;
}

export interface PoolEngineLeagueContext {
  formatKey: string;
  rulesJson?: string | null;
}

export function normalizeFormatKey(formatKey: string): string {
  return formatKey.trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCanonicalPoolType(formatKey: string): string | null {
  const normalized = normalizeFormatKey(formatKey);
  return getCanonicalEvaluatorPoolType(normalized);
}

export function parseLeagueRules(rulesJson?: string | null): LeagueRulesConfig {
  if (!rulesJson) return {};
  try {
    const parsed = JSON.parse(rulesJson);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as LeagueRulesConfig;
  } catch {
    return {};
  }
}

export function pointsForCorrectPick(
  context: PoolEngineLeagueContext,
  confidenceRank?: number | null,
): number {
  const rules = parseLeagueRules(context.rulesJson);
  const poolType = getCanonicalPoolType(context.formatKey) || normalizeFormatKey(context.formatKey);
  const template: PoolTemplateKey | null =
    poolType === "pickem" ||
    poolType === "ats_pickem" ||
    poolType === "confidence" ||
    poolType === "ats_confidence" ||
    poolType === "survivor" ||
    poolType === "squares" ||
    poolType === "bracket" ||
    poolType === "prop" ||
    poolType === "streak" ||
    poolType === "upset_underdog" ||
    poolType === "stat_performance" ||
    poolType === "last_man_standing" ||
    poolType === "bundle_pool"
      ? poolType
      : null;
  return scorePickFromRuleEngine({
    template,
    isCorrect: true,
    confidenceRank,
    settings: rules as Record<string, unknown>,
  });
}

export function isFinalEventStatus(status?: string | null): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === "FINAL" || normalized === "COMPLETED" || normalized === "FINISHED";
}

export function isScheduledEventStatus(status?: string | null): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === "SCHEDULED" || normalized === "NOT_STARTED";
}

export function isPeriodLocked(
  lockType: LeagueRulesConfig["lockType"] | undefined,
  nowIso: string,
  eventStartTimes: string[],
): boolean {
  if (!eventStartTimes.length) return false;
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) return false;
  if (lockType === "first_game") {
    const firstStartMs = Math.min(...eventStartTimes.map((t) => Date.parse(t)).filter(Number.isFinite));
    return Number.isFinite(firstStartMs) && nowMs >= firstStartMs;
  }
  return false;
}
