import type { PoolEvaluator, PoolEntryAction, LiveEventData, PoolContext, PlayerStatus } from "./types";
import { pickemEvaluator } from "./pickemEvaluator";

function toDigit(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const digit = Math.abs(Math.trunc(raw)) % 10;
  return Number.isFinite(digit) ? digit : null;
}

function resolveSquareDigits(action: PoolEntryAction): { home: number; away: number } | null {
  const metadata = action.metadata || {};
  const home = toDigit(metadata.homeDigit ?? metadata.home_digit ?? metadata.row_digit);
  const away = toDigit(metadata.awayDigit ?? metadata.away_digit ?? metadata.col_digit);
  if (home === null || away === null) return null;
  return { home, away };
}

export const squaresEvaluator: PoolEvaluator = {
  poolType: "squares",

  evaluatePlayerStatus(action: PoolEntryAction, event: LiveEventData, context: PoolContext): PlayerStatus {
    if (event.status === "SCHEDULED") return "PENDING";
    if (event.status === "POSTPONED" || event.status === "CANCELED") return "PUSHED";

    const digits = resolveSquareDigits(action);
    if (!digits) {
      // Backward compatibility for legacy squares records missing digit metadata.
      return pickemEvaluator.evaluatePlayerStatus(action, event, context);
    }

    const homeScoreDigit = toDigit(event.homeScore);
    const awayScoreDigit = toDigit(event.awayScore);
    const matches =
      homeScoreDigit !== null
      && awayScoreDigit !== null
      && digits.home === homeScoreDigit
      && digits.away === awayScoreDigit;

    if (event.status === "FINAL") {
      return matches ? "SAFE" : "ELIMINATED";
    }
    if (event.status === "LIVE" || event.status === "HALFTIME") {
      return matches ? "WINNING" : "AT_RISK";
    }
    return "UNKNOWN";
  },

  getStatusReason(action: PoolEntryAction, event: LiveEventData, status: PlayerStatus): string {
    const digits = resolveSquareDigits(action);
    const homeScoreDigit = toDigit(event.homeScore);
    const awayScoreDigit = toDigit(event.awayScore);
    const boardCell =
      digits && homeScoreDigit !== null && awayScoreDigit !== null
        ? `board ${digits.home}/${digits.away} vs score ${homeScoreDigit}/${awayScoreDigit}`
        : "square board match pending";

    if (status === "SAFE") return `Winning square hit (${boardCell})`;
    if (status === "ELIMINATED") return `Square miss (${boardCell})`;
    if (status === "WINNING") return `Current score matches your square (${boardCell})`;
    if (status === "AT_RISK") return `Current score misses your square (${boardCell})`;
    if (status === "PENDING") return "Square board is waiting for game start";
    if (status === "PUSHED") return "Square board void due to postponement/cancellation";
    return boardCell;
  },

  getSelectionSide(_selectionId: string, _event: LiveEventData): "HOME" | "AWAY" | "OTHER" {
    return "OTHER";
  },
};
