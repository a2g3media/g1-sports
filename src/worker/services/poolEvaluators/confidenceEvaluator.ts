/**
 * Confidence Pool Evaluator (Stub)
 * 
 * Rules:
 * - Pick winners for multiple games
 * - Assign confidence points (1-N) to each pick
 * - Correct picks earn their confidence point value
 * - Highest total points wins
 * 
 * TODO: Full implementation when confidence pools are built
 */

import type {
  PoolEvaluator,
  PoolEntryAction,
  LiveEventData,
  PoolContext,
  PlayerStatus,
} from './types';

function normalizeToken(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function teamAliases(teamName: string): Set<string> {
  const raw = String(teamName || "").trim();
  const aliases = new Set<string>();
  if (!raw) return aliases;
  const parts = raw.split(/\s+/).filter(Boolean);
  const normalized = normalizeToken(raw);
  if (normalized) aliases.add(normalized);
  if (parts.length > 0) {
    const last = normalizeToken(parts[parts.length - 1]);
    if (last) aliases.add(last);
  }
  if (parts.length >= 2) {
    const firstTwo = normalizeToken(`${parts[0][0]}${parts[1][0]}`);
    if (firstTwo) aliases.add(firstTwo);
  }
  if (parts.length === 1) aliases.add(normalizeToken(parts[0].slice(0, 3)));
  return aliases;
}

function resolveSelectionSide(action: PoolEntryAction, event: LiveEventData): 'HOME' | 'AWAY' | 'OTHER' {
  const homeAliases = teamAliases(event.homeTeam);
  const awayAliases = teamAliases(event.awayTeam);
  const selectionCandidates = [
    action.selectionId,
    action.selectionLabel,
    typeof action.metadata?.team === "string" ? action.metadata.team : "",
    typeof action.metadata?.teamName === "string" ? action.metadata.teamName : "",
    typeof action.metadata?.teamAbbr === "string" ? action.metadata.teamAbbr : "",
  ]
    .map((v) => normalizeToken(v))
    .filter(Boolean);

  for (const candidate of selectionCandidates) {
    if (candidate === "home" || candidate === "h") return 'HOME';
    if (candidate === "away" || candidate === "a") return 'AWAY';
    if (homeAliases.has(candidate)) return 'HOME';
    if (awayAliases.has(candidate)) return 'AWAY';
    if ([...homeAliases].some((alias) => alias.includes(candidate) || candidate.includes(alias))) return 'HOME';
    if ([...awayAliases].some((alias) => alias.includes(candidate) || candidate.includes(alias))) return 'AWAY';
  }
  return 'OTHER';
}

export const confidenceEvaluator: PoolEvaluator = {
  poolType: 'confidence',

  evaluatePlayerStatus(
    action: PoolEntryAction,
    event: LiveEventData,
    _context: PoolContext
  ): PlayerStatus {
    const { status, homeScore, awayScore } = event;
    const pickedTeam = action.selectionLabel || action.selectionId;
    
    if (status === 'SCHEDULED') {
      return 'PENDING';
    }
    
    if (status === 'POSTPONED' || status === 'CANCELED') {
      return 'PUSHED';
    }
    
    const side = resolveSelectionSide(action, event);
    const isHome = side === 'HOME';
    const isAway = side === 'AWAY';
    
    if (!isHome && !isAway) {
      return 'UNKNOWN';
    }
    
    const pickedScore = isHome ? homeScore : awayScore;
    const opponentScore = isHome ? awayScore : homeScore;
    const isTied = homeScore === awayScore;
    
    if (status === 'FINAL') {
      if (isTied) {
        return 'PUSHED';
      }
      return pickedScore > opponentScore ? 'SAFE' : 'ELIMINATED';
    }
    
    if (status === 'LIVE' || status === 'HALFTIME') {
      if (isTied) {
        return 'TIED';
      }
      return pickedScore > opponentScore ? 'WINNING' : 'AT_RISK';
    }
    
    return 'UNKNOWN';
  },

  getStatusReason(
    action: PoolEntryAction,
    _event: LiveEventData,
    status: PlayerStatus
  ): string {
    const pickedTeam = action.selectionLabel || action.selectionId;
    const confidence = action.confidenceRank ?? 0;
    
    switch (status) {
      case 'WINNING':
        return `${pickedTeam} leading (${confidence} pts at stake)`;
      case 'AT_RISK':
        return `${pickedTeam} trailing (${confidence} pts at risk)`;
      case 'TIED':
        return `Game tied (${confidence} pts)`;
      case 'SAFE':
        return `+${confidence} pts earned`;
      case 'ELIMINATED':
        return `${confidence} pts lost`;
      case 'PENDING':
        return `${confidence} pts pending`;
      case 'PUSHED':
        return 'Push';
      default:
        return '';
    }
  },

  getSelectionSide(selectionId: string, event: LiveEventData): 'HOME' | 'AWAY' | 'OTHER' {
    return resolveSelectionSide(
      { userId: "", displayName: "", eventId: event.eventId, actionType: "PICK", selectionId, selectionLabel: selectionId, isLocked: true },
      event
    );
  },
};
