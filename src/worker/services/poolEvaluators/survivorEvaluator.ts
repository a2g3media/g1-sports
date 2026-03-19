/**
 * Survivor Pool Evaluator
 * 
 * Rules:
 * - Pick one team per week
 * - If your team wins, you survive
 * - If your team loses, you're eliminated
 * - Ties typically count as survival (configurable)
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
    const firstLast = normalizeToken(`${parts[0][0]}${parts[parts.length - 1][0]}`);
    if (firstLast) aliases.add(firstLast);
  }
  if (parts.length === 1) {
    aliases.add(normalizeToken(parts[0].slice(0, 3)));
  }
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

export const survivorEvaluator: PoolEvaluator = {
  poolType: 'survivor',

  evaluatePlayerStatus(
    action: PoolEntryAction,
    event: LiveEventData,
    context: PoolContext
  ): PlayerStatus {
    const { status, homeTeam, awayTeam, homeScore, awayScore } = event;
    const pickedTeam = action.selectionLabel || action.selectionId;
    
    // Game hasn't started
    if (status === 'SCHEDULED') {
      return 'PENDING';
    }
    
    // Game postponed or canceled
    if (status === 'POSTPONED' || status === 'CANCELED') {
      return 'PUSHED';
    }
    
    // Determine if picked team is home or away (supports home/away tokens and abbreviations).
    const side = resolveSelectionSide(action, event);
    const isHome = side === 'HOME';
    const isAway = side === 'AWAY';
    
    // If we can't determine the team, mark unknown
    if (!isHome && !isAway) {
      return 'UNKNOWN';
    }
    
    const pickedScore = isHome ? homeScore : awayScore;
    const opponentScore = isHome ? awayScore : homeScore;
    const isTied = homeScore === awayScore;
    
    // Game is final
    if (status === 'FINAL') {
      if (isTied) {
        // Ties typically count as survival in survivor pools
        const tiesEliminateRule = context.rulesJson?.tiesEliminate ?? false;
        return tiesEliminateRule ? 'ELIMINATED' : 'SAFE';
      }
      return pickedScore > opponentScore ? 'SAFE' : 'ELIMINATED';
    }
    
    // Game is live (including halftime)
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
    event: LiveEventData,
    status: PlayerStatus
  ): string {
    const { homeScore, awayScore } = event;
    const pickedTeam = action.selectionLabel || action.selectionId;
    
    switch (status) {
      case 'WINNING':
        return `${pickedTeam} leading ${homeScore}-${awayScore}`;
      case 'AT_RISK':
        return `${pickedTeam} trailing ${homeScore}-${awayScore}`;
      case 'TIED':
        return `Game tied ${homeScore}-${awayScore}`;
      case 'SAFE':
        return `${pickedTeam} won`;
      case 'ELIMINATED':
        return `${pickedTeam} lost`;
      case 'PENDING':
        return 'Game not started';
      case 'PUSHED':
        return 'Game postponed/canceled';
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
