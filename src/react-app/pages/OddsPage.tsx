/**
 * OddsPage - Dedicated Sports Betting Intelligence Terminal
 * Premium market analytics page with AI insights, sharp money signals,
 * value detection, and market movement tracking.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { OddsIntelligenceDashboard } from '@/react-app/components/OddsIntelligenceDashboard';
import { AddToWatchboardModal } from '@/react-app/components/AddToWatchboardModal';
import { useWatchboards } from '@/react-app/hooks/useWatchboards';
import { Loader2, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { fetchJsonCached, getFetchCacheStats, invalidateJsonCache } from '@/react-app/lib/fetchCache';
import { incrementPerfCounter, logPerfSnapshot, startPerfTimer } from '@/react-app/lib/perfTelemetry';
import { OddsTelemetryDebugPanel } from '@/react-app/components/debug/OddsTelemetryDebugPanel';
import { useFeatureFlags } from '@/react-app/hooks/useFeatureFlags';

interface Game {
  id: string;
  gameId?: string;
  hasRealOdds?: boolean;
  sport: string;
  league?: string | null;
  homeTeam: string | { abbr: string; name?: string };
  awayTeam: string | { abbr: string; name?: string };
  homeScore?: number | null;
  awayScore?: number | null;
  status: 'live' | 'scheduled' | 'final' | 'LIVE' | 'SCHEDULED' | 'FINAL';
  period?: string;
  periodLabel?: string;
  clock?: string;
  mlbLiveState?: {
    inningHalf?: string;
    inningNumber?: number;
    inningState?: string;
  } | null;
  startTime?: string;
  channel?: string | null;
  spread?: number;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  odds?: {
    spread?: number;
    spreadOpen?: number;
    total?: number;
    totalOpen?: number;
    mlHome?: number;
    mlAway?: number;
    spread1H?: number;
    total1H?: number;
    ml1HHome?: number;
    ml1HAway?: number;
    spread1P?: number;
    total1P?: number;
    ml1PHome?: number;
    ml1PAway?: number;
    f5?: {
      spread?: {
        home?: number | null;
        away?: number | null;
      };
      total?: number | null;
      moneyline?: {
        home?: number | null;
        away?: number | null;
      };
    };
  };
}

interface TicketHandleSplitRow {
  game_id: string;
  market: 'SPREAD' | 'TOTAL' | 'MONEYLINE';
  side: 'HOME' | 'AWAY' | 'OVER' | 'UNDER';
  tickets_pct: number | null;
  handle_pct: number | null;
  sportsbook?: string | null;
  updated_at?: string | null;
}

interface ProjectionCoverage {
  source: string;
  count: number;
  fallbackReason: string | null;
}

interface ProjectionRow {
  game_id?: string;
  provider_game_id?: string | null;
  sport?: string;
  player_name?: string;
  prop_type?: string;
  line_value?: number;
  projected_value?: number;
  edge_vs_line?: number;
  confidence?: "low" | "medium" | "high";
  movement?: number;
  books_count?: number;
  source?: string;
}

interface OddsSummaryShape {
  spread?: { home_line?: number | null; away_line?: number | null; line?: number | null } | null;
  total?: { line?: number | null } | null;
  moneyline?: { home_price?: number | null; away_price?: number | null } | null;
  first_half?: {
    spread?: { home_line?: number | null; away_line?: number | null } | null;
    total?: { line?: number | null } | null;
    moneyline?: { home_price?: number | null; away_price?: number | null } | null;
  } | null;
  f5?: {
    spread?: { home?: number | null; away?: number | null } | null;
    total?: number | null;
    moneyline?: { home?: number | null; away?: number | null } | null;
  } | null;
  opening_spread?: number | null;
  opening_total?: number | null;
}

function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildOddsDataKey(dateParam: string, sportParam: string): string {
  return `${dateParam}|${String(sportParam || 'ALL').toUpperCase()}`;
}

function buildOddsSlateCacheKey(dateParam: string, sportParam: string): string {
  return `odds:${dateParam}:${String(sportParam || 'ALL').toUpperCase()}`;
}

type OddsPageSlateCacheEntry = {
  games: any[];
  oddsSummaryByGame: Record<string, any>;
  boardSections: OddsBoardSection[];
  updatedAt: number;
};

type LastValidBoardSnapshot = {
  dataKey: string;
  boardKey: string;
  boardSections: OddsBoardSection[];
  games: any[];
  oddsSummaryByGame: Record<string, any>;
  generatedAt: string | null;
  freshnessSource: string | null;
};

type OddsBoardCard = {
  id: string;
  gameId?: string;
  canonicalRouteId?: string;
  sport: string;
  league?: string | null;
  homeTeam: { abbr: string; name?: string } | string;
  awayTeam: { abbr: string; name?: string } | string;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
  period?: string;
  periodLabel?: string;
  clock?: string;
  mlbLiveState?: {
    inningHalf?: string;
    inningNumber?: number | null;
    inningState?: string;
  } | null;
  startTime?: string;
  channel?: string | null;
  odds?: {
    spread?: number | null;
    spreadOpen?: number | null;
    total?: number | null;
    totalOpen?: number | null;
    mlHome?: number | null;
    mlAway?: number | null;
    spread1H?: number | null;
    total1H?: number | null;
    ml1HHome?: number | null;
    ml1HAway?: number | null;
    spread1P?: number | null;
    total1P?: number | null;
    ml1PHome?: number | null;
    ml1PAway?: number | null;
    f5?: {
      spread?: { home?: number | null; away?: number | null } | null;
      total?: number | null;
      moneyline?: { home?: number | null; away?: number | null } | null;
    } | null;
  } | null;
  hasRealOdds?: boolean;
};

type OddsBoardSection = {
  sport: string;
  label: string;
  count: number;
  cards: OddsBoardCard[];
};

const oddsPageSlateCache = new Map<string, OddsPageSlateCacheEntry>();
const ODDS_PAGE_SLATE_CACHE_TTL_MS = 5 * 60 * 1000;

function readOddsPageSlateCache(key: string): OddsPageSlateCacheEntry | null {
  const hit = oddsPageSlateCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.updatedAt > ODDS_PAGE_SLATE_CACHE_TTL_MS) {
    oddsPageSlateCache.delete(key);
    return null;
  }
  return hit;
}

function writeOddsPageSlateCache(
  key: string,
  games: any[],
  oddsSummaryByGame: Record<string, any>,
  boardSections: OddsBoardSection[]
): void {
  if ((!Array.isArray(games) || games.length === 0) && (!Array.isArray(boardSections) || boardSections.length === 0)) return;
  oddsPageSlateCache.set(key, {
    games,
    oddsSummaryByGame: oddsSummaryByGame && typeof oddsSummaryByGame === "object" ? oddsSummaryByGame : {},
    boardSections: Array.isArray(boardSections) ? boardSections : [],
    updatedAt: Date.now(),
  });
}

function shiftDate(date: Date, deltaDays: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return next;
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTeamToken(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildLiveOddsMatchupCandidates(game: any, sport: string): string[] {
  const sportLower = String(sport || '').toLowerCase();
  const plain = (value: unknown): string =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  const nickname = (value: unknown): string => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const parts = raw.split(/\s+/).filter(Boolean);
    return normalizeTeamToken(parts[parts.length - 1] || raw);
  };
  const homeCode = normalizeTeamToken(game?.home_team_code);
  const awayCode = normalizeTeamToken(game?.away_team_code);
  const homeName = normalizeTeamToken(game?.home_team_name || game?.homeTeam || game?.home_team_code);
  const awayName = normalizeTeamToken(game?.away_team_name || game?.awayTeam || game?.away_team_code);
  const homeNamePlain = plain(game?.home_team_name || game?.homeTeam || game?.home_team_code);
  const awayNamePlain = plain(game?.away_team_name || game?.awayTeam || game?.away_team_code);
  const homeNick = nickname(game?.home_team_name || game?.homeTeam);
  const awayNick = nickname(game?.away_team_name || game?.awayTeam);
  const homeNickPlain = plain((String(game?.home_team_name || game?.homeTeam || '').trim().split(/\s+/).filter(Boolean).pop()) || '');
  const awayNickPlain = plain((String(game?.away_team_name || game?.awayTeam || '').trim().split(/\s+/).filter(Boolean).pop()) || '');
  return [
    `${sportLower}|${awayCode}|${homeCode}`,
    `${sportLower}|${awayName}|${homeName}`,
    `${sportLower}|${awayNamePlain}|${homeNamePlain}`,
    `${sportLower}|${awayCode || awayName}|${homeCode || homeName}`,
    `${sportLower}|${awayNick}|${homeNick}`,
    `${sportLower}|${awayNickPlain}|${homeNickPlain}`,
    `${sportLower}|${awayNick || awayCode || awayName}|${homeNick || homeCode || homeName}`,
  ].filter(Boolean);
}

function ymdPart(value: unknown): string {
  const raw = String(value || '');
  if (!raw) return '';
  const iso = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function normalizeOddsGameId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function buildOddsLookupCandidates(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normalizeOddsGameId(v);
    if (n) out.add(n);
  };

  add(raw);
  if (raw.startsWith('sr_')) {
    const parts = raw.split('_');
    const tail = parts.slice(2).join('_');
    if (tail) {
      add(`sr:sport_event:${tail}`);
      add(`sr:sport_event:${tail.replace(/_/g, '-')}`);
      add(`sr:match:${tail}`);
      add(tail);
      add(tail.replace(/_/g, '-'));
    }
  }
  if (raw.startsWith('sr:sport_event:')) {
    const tail = raw.replace('sr:sport_event:', '');
    add(tail);
    add(`sr_${tail.replace(/-/g, '_')}`);
    add(tail.replace(/-/g, '_'));
  }
  if (raw.startsWith('sr:match:')) {
    const tail = raw.replace('sr:match:', '');
    add(tail);
    add(`sr_${tail.replace(/-/g, '_')}`);
  }
  return Array.from(out);
}

function buildOddsMatchKey(home: unknown, away: unknown, startTime: unknown): string {
  const h = normalizeTeamToken(home);
  const a = normalizeTeamToken(away);
  const d = ymdPart(startTime);
  if (!h || !a || !d) return '';
  return `${h}|${a}|${d}`;
}

function buildOddsSummaryMatchLookup(source: Record<string, any>): Record<string, any> {
  const byMatch: Record<string, any> = {};
  for (const summary of Object.values(source || {})) {
    if (!summary || typeof summary !== 'object') continue;
    const game = (summary as any).game || {};
    const keys = [
      buildOddsMatchKey(game?.home_team_code, game?.away_team_code, game?.start_time),
      buildOddsMatchKey(game?.home_team_name, game?.away_team_name, game?.start_time),
      buildOddsMatchKey(game?.home_team_code || game?.home_team_name, game?.away_team_code || game?.away_team_name, game?.start_time),
    ].filter(Boolean);
    if (keys.length === 0) continue;
    for (const key of keys) {
      if (!byMatch[key] || oddsSummaryStrength(summary) >= oddsSummaryStrength(byMatch[key])) {
        byMatch[key] = summary;
      }
    }
  }
  return byMatch;
}

function hasToken(value: unknown, token: string): boolean {
  return String(value || '').toLowerCase().includes(token);
}

function parseMarketNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseMarketOutcomes(markets: any[] | undefined): Partial<OddsSummaryShape> {
  if (!Array.isArray(markets) || markets.length === 0) return {};

  const result: Partial<OddsSummaryShape> = {};
  for (const market of markets) {
    const marketName = String(market?.name || market?.id || market?.key || market?.market || '').toLowerCase();
    const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
    if (!Array.isArray(outcomes) || outcomes.length === 0) continue;

    if (!result.spread && (hasToken(marketName, 'spread') || hasToken(marketName, 'handicap'))) {
      let homeLine: number | undefined;
      let awayLine: number | undefined;
      for (const outcome of outcomes) {
        const outcomeType = String(outcome?.type || outcome?.name || outcome?.key || '').toLowerCase();
        const line = parseMarketNumber(outcome?.line ?? outcome?.handicap ?? outcome?.point ?? outcome?.value);
        if (line === undefined) continue;
        if (hasToken(outcomeType, 'home') || outcomeType === '1') homeLine = line;
        if (hasToken(outcomeType, 'away') || outcomeType === '2') awayLine = line;
      }
      if (homeLine !== undefined || awayLine !== undefined) {
        result.spread = {
          home_line: homeLine ?? (awayLine !== undefined ? -awayLine : undefined),
          away_line: awayLine ?? (homeLine !== undefined ? -homeLine : undefined),
          line: homeLine ?? (awayLine !== undefined ? -awayLine : undefined),
        };
      }
      continue;
    }

    if (!result.total && (hasToken(marketName, 'total') || hasToken(marketName, 'over_under') || hasToken(marketName, 'totals'))) {
      let totalLine: number | undefined;
      for (const outcome of outcomes) {
        totalLine = parseMarketNumber(outcome?.line ?? outcome?.total ?? outcome?.handicap ?? outcome?.value);
        if (totalLine !== undefined) break;
      }
      if (totalLine !== undefined) result.total = { line: totalLine };
      continue;
    }

    if (!result.moneyline && (hasToken(marketName, 'moneyline') || hasToken(marketName, 'winner') || hasToken(marketName, 'match_winner') || marketName === 'h2h')) {
      let homePrice: number | undefined;
      let awayPrice: number | undefined;
      for (const outcome of outcomes) {
        const outcomeType = String(outcome?.type || outcome?.name || outcome?.key || '').toLowerCase();
        const price = parseMarketNumber(outcome?.odds_american ?? outcome?.price ?? outcome?.odds);
        if (price === undefined) continue;
        if (hasToken(outcomeType, 'home') || outcomeType === '1') homePrice = price;
        if (hasToken(outcomeType, 'away') || outcomeType === '2') awayPrice = price;
      }
      if (homePrice !== undefined || awayPrice !== undefined) {
        result.moneyline = { home_price: homePrice, away_price: awayPrice };
      }
    }
  }
  return result;
}

function normalizeOddsSummary(summary: any): OddsSummaryShape | null {
  if (!summary || typeof summary !== 'object') return null;
  const asObj = summary as Record<string, any>;
  const toNum = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const spreadHome = toNum(asObj?.spread?.home_line ?? asObj?.spread?.line ?? asObj?.spread_home ?? asObj?.spreadHome ?? asObj?.spread);
  const spreadAway = toNum(asObj?.spread?.away_line ?? asObj?.spread_away ?? asObj?.spreadAway ?? (spreadHome != null ? -spreadHome : undefined));
  const totalLine = toNum(asObj?.total?.line ?? asObj?.overUnder ?? asObj?.over_under ?? asObj?.total);
  const mlHome = toNum(asObj?.moneyline?.home_price ?? asObj?.moneyline_home ?? asObj?.moneylineHome ?? asObj?.ml_home);
  const mlAway = toNum(asObj?.moneyline?.away_price ?? asObj?.moneyline_away ?? asObj?.moneylineAway ?? asObj?.ml_away);
  const spread1HHome = toNum(asObj?.first_half?.spread?.home_line ?? asObj?.spread_1h_home ?? asObj?.spread1HHome);
  const spread1HAway = toNum(asObj?.first_half?.spread?.away_line ?? asObj?.spread_1h_away ?? asObj?.spread1HAway ?? (spread1HHome != null ? -spread1HHome : undefined));
  const total1H = toNum(asObj?.first_half?.total?.line ?? asObj?.total_1h ?? asObj?.total1H);
  const ml1HHome = toNum(asObj?.first_half?.moneyline?.home_price ?? asObj?.moneyline_1h_home ?? asObj?.moneyline1HHome ?? asObj?.ml1HHome);
  const ml1HAway = toNum(asObj?.first_half?.moneyline?.away_price ?? asObj?.moneyline_1h_away ?? asObj?.moneyline1HAway ?? asObj?.ml1HAway);
  const f5SpreadHome = toNum(asObj?.f5?.spread?.home ?? asObj?.f5SpreadHome ?? asObj?.f5_spread_home);
  const f5SpreadAway = toNum(asObj?.f5?.spread?.away ?? asObj?.f5SpreadAway ?? asObj?.f5_spread_away ?? (f5SpreadHome != null ? -f5SpreadHome : undefined));
  const rawF5Total = toNum(asObj?.f5?.total ?? asObj?.f5Total ?? asObj?.f5_total);
  const rawF5MlHome = toNum(asObj?.f5?.moneyline?.home ?? asObj?.f5MoneylineHome ?? asObj?.f5_moneyline_home);
  const rawF5MlAway = toNum(asObj?.f5?.moneyline?.away ?? asObj?.f5MoneylineAway ?? asObj?.f5_moneyline_away);
  const f5Total = rawF5Total === 0 ? undefined : rawF5Total;
  const f5MlHome = rawF5MlHome === 0 ? undefined : rawF5MlHome;
  const f5MlAway = rawF5MlAway === 0 ? undefined : rawF5MlAway;

  const marketEntries = [
    ...(Array.isArray(asObj?.markets) ? asObj.markets : []),
    ...(Array.isArray(asObj?.bookmakers)
      ? asObj.bookmakers.flatMap((book: any) => (Array.isArray(book?.markets) ? book.markets : []))
      : []),
    ...(Array.isArray(asObj?.books)
      ? asObj.books.flatMap((book: any) => (Array.isArray(book?.markets) ? book.markets : []))
      : []),
  ];
  const extracted = parseMarketOutcomes(marketEntries);

  const normalized: OddsSummaryShape = {
    spread: spreadHome != null || spreadAway != null || extracted.spread
      ? {
          home_line: spreadHome ?? extracted.spread?.home_line,
          away_line: spreadAway ?? extracted.spread?.away_line,
          line: spreadHome ?? extracted.spread?.line,
        }
      : null,
    total: totalLine != null || extracted.total ? { line: totalLine ?? extracted.total?.line } : null,
    moneyline: mlHome != null || mlAway != null || extracted.moneyline
      ? {
          home_price: mlHome ?? extracted.moneyline?.home_price,
          away_price: mlAway ?? extracted.moneyline?.away_price,
        }
      : null,
    first_half:
      spread1HHome != null || spread1HAway != null || total1H != null || ml1HHome != null || ml1HAway != null
        ? {
            spread: spread1HHome != null || spread1HAway != null
              ? { home_line: spread1HHome, away_line: spread1HAway }
              : null,
            total: total1H != null ? { line: total1H } : null,
            moneyline: ml1HHome != null || ml1HAway != null
              ? { home_price: ml1HHome, away_price: ml1HAway }
              : null,
          }
        : null,
    f5:
      f5SpreadHome != null || f5SpreadAway != null || f5Total != null || f5MlHome != null || f5MlAway != null
        ? {
            spread: f5SpreadHome != null || f5SpreadAway != null
              ? { home: f5SpreadHome, away: f5SpreadAway }
              : null,
            total: f5Total ?? null,
            moneyline: f5MlHome != null || f5MlAway != null
              ? { home: f5MlHome, away: f5MlAway }
              : null,
          }
        : null,
    opening_spread: toNum(asObj?.opening_spread ?? asObj?.openSpread ?? asObj?.spread_open),
    opening_total: toNum(asObj?.opening_total ?? asObj?.openTotal ?? asObj?.total_open),
  };

  const hasAny =
    normalized?.spread?.home_line != null ||
    normalized?.spread?.away_line != null ||
    normalized?.total?.line != null ||
    normalized?.moneyline?.home_price != null ||
    normalized?.moneyline?.away_price != null ||
    normalized?.first_half?.spread?.home_line != null ||
    normalized?.first_half?.spread?.away_line != null ||
    normalized?.first_half?.total?.line != null ||
    normalized?.first_half?.moneyline?.home_price != null ||
    normalized?.first_half?.moneyline?.away_price != null ||
    normalized?.f5?.spread?.home != null ||
    normalized?.f5?.spread?.away != null ||
    normalized?.f5?.total != null ||
    normalized?.f5?.moneyline?.home != null ||
    normalized?.f5?.moneyline?.away != null;

  return hasAny ? normalized : null;
}

function buildGameJoinCandidates(game: any): string[] {
  const rawCandidates = [
    game?.id,
    game?.game_id,
    game?.externalId,
    game?.external_id,
    game?.providerGameId,
    game?.provider_game_id,
    game?.eventId,
    game?.event_id,
  ].filter(Boolean);
  return Array.from(new Set(rawCandidates.flatMap((value) => buildOddsLookupCandidates(value))));
}

function oddsSummaryStrength(summary: any): number {
  const normalized = normalizeOddsSummary(summary);
  if (!normalized) return 0;
  let score = 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? 1 : 0);
  score += n(normalized?.spread?.home_line) + n(normalized?.spread?.away_line);
  score += n(normalized?.total?.line);
  score += n(normalized?.moneyline?.home_price) + n(normalized?.moneyline?.away_price);
  score += n(normalized?.first_half?.spread?.home_line) + n(normalized?.first_half?.spread?.away_line);
  score += n(normalized?.first_half?.total?.line);
  score += n(normalized?.first_half?.moneyline?.home_price) + n(normalized?.first_half?.moneyline?.away_price);
  score += n(normalized?.f5?.spread?.home) + n(normalized?.f5?.spread?.away);
  score += n(normalized?.f5?.total);
  score += n(normalized?.f5?.moneyline?.home) + n(normalized?.f5?.moneyline?.away);
  score += n(normalized?.opening_spread) + n(normalized?.opening_total);
  return score;
}

function hasUsableBasketballFirstHalf(summary: any): boolean {
  if (!summary || typeof summary !== 'object') return false;
  const fh = summary.first_half || {};
  const total = Number(fh?.total?.line);
  const mlHome = Number(fh?.moneyline?.home_price);
  const mlAway = Number(fh?.moneyline?.away_price);
  const spreadHome = Number(fh?.spread?.home_line);
  const hasSpread = Number.isFinite(spreadHome);
  const hasTotal = Number.isFinite(total) && total >= 80;
  const hasMl = (Number.isFinite(mlHome) && mlHome !== 0) || (Number.isFinite(mlAway) && mlAway !== 0);
  return hasSpread && hasTotal && hasMl;
}

function hasUsableFullGameOdds(summary: any): boolean {
  if (!summary || typeof summary !== 'object') return false;
  const spreadHome = Number(summary?.spread?.home_line);
  const spreadAway = Number(summary?.spread?.away_line);
  const total = Number(summary?.total?.line);
  const mlHome = Number(summary?.moneyline?.home_price);
  const mlAway = Number(summary?.moneyline?.away_price);
  const hasSpread = Number.isFinite(spreadHome) || Number.isFinite(spreadAway);
  const hasTotal = Number.isFinite(total);
  const hasMl = Number.isFinite(mlHome) || Number.isFinite(mlAway);
  return hasSpread && hasTotal && hasMl;
}

function hasUsableMlbF5Odds(summary: any): boolean {
  if (!summary || typeof summary !== 'object') return false;
  const spreadHome = Number(summary?.f5?.spread?.home);
  const spreadAway = Number(summary?.f5?.spread?.away);
  const total = Number(summary?.f5?.total);
  const mlHome = Number(summary?.f5?.moneyline?.home);
  const mlAway = Number(summary?.f5?.moneyline?.away);
  const hasSpread = Number.isFinite(spreadHome) || Number.isFinite(spreadAway);
  const hasTotal = Number.isFinite(total);
  const hasMl = Number.isFinite(mlHome) || Number.isFinite(mlAway);
  return hasSpread && hasTotal && hasMl;
}

function mergeOddsSummaryRecord(
  prev: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  const merged = { ...prev };
  for (const [key, nextSummary] of Object.entries(incoming)) {
    const nextStrength = oddsSummaryStrength(nextSummary);
    if (nextStrength <= 0) continue;
    const prevSummary = merged[key];
    const prevStrength = oddsSummaryStrength(prevSummary);
    if (!prevSummary || nextStrength >= prevStrength) {
      merged[key] = nextSummary;
    }
  }
  return merged;
}

// Sport filter chips
const SPORT_FILTERS = [
  { key: 'ALL', label: 'All Sports', emoji: '🎯' },
  { key: 'NBA', label: 'NBA', emoji: '🏀' },
  { key: 'NHL', label: 'NHL', emoji: '🏒' },
  { key: 'MLB', label: 'MLB', emoji: '⚾' },
  { key: 'NCAAB', label: 'NCAAB', emoji: '🏀' },
  { key: 'SOCCER', label: 'Soccer', emoji: '⚽' },
];

function normalizeSportForOddsPage(rawSport: unknown, rawLeague?: unknown): string {
  const upper = String(rawSport || '').toUpperCase();
  const league = String(rawLeague || '').toUpperCase();
  const soccerLeagueHints = [
    'UEFA', 'EUROPA', 'CHAMPIONS', 'PREMIER', 'EPL', 'MLS',
    'LA_LIGA', 'LA LIGA', 'SERIE_A', 'SERIE A', 'BUNDES',
    'LIGUE_1', 'LIGUE 1', 'LIGA_MX', 'LIGA MX', 'EREDIVISIE',
    'PRIMEIRA', 'COPA', 'WORLD CUP', 'NATIONS LEAGUE',
  ];
  const hasSoccerLeagueSignal = soccerLeagueHints.some((hint) => league.includes(hint));
  if (upper === 'CBB' || upper === 'NCAAM' || upper === 'NCAA_MEN_BASKETBALL') return 'NCAAB';
  if (upper === 'CFB' || upper === 'NCAAFB' || upper === 'NCAA_FOOTBALL') return 'NCAAF';
  if (upper === 'ICEHOCKEY' || upper === 'HOCKEY') return 'NHL';
  if (upper === 'BASEBALL') return 'MLB';
  if (
    hasSoccerLeagueSignal ||
    upper === 'SOCCER' ||
    upper === 'FOOTBALL_SOCCER' ||
    upper === 'EPL' ||
    upper === 'MLS' ||
    upper === 'UCL' ||
    upper === 'UEFA' ||
    upper === 'EUROPA_LEAGUE' ||
    upper === 'EUROPA-LEAGUE' ||
    upper === 'CHAMPIONS_LEAGUE' ||
    upper === 'CHAMPIONS-LEAGUE' ||
    upper === 'PREMIER_LEAGUE' ||
    upper === 'PREMIER-LEAGUE' ||
    upper === 'LA_LIGA' ||
    upper === 'SERIE_A' ||
    upper === 'BUNDESLIGA' ||
    upper === 'LIGUE_1'
  ) return 'SOCCER';
  if (upper === 'PGA' || upper === 'LIV' || upper === 'DP' || upper === 'GOLF_TOURNAMENT') return 'GOLF';
  if (upper === 'BASKETBALL') {
    if (league.includes('NCAA') || league.includes('NCAAB') || league.includes('CBB')) return 'NCAAB';
    return 'NBA';
  }
  if (upper === 'FOOTBALL') {
    if (league.includes('NCAA') || league.includes('NCAAF') || league.includes('COLLEGE')) return 'NCAAF';
    if (hasSoccerLeagueSignal) return 'SOCCER';
    return 'NFL';
  }
  return upper || 'NBA';
}

function toTimestamp(value: unknown): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function isLiveStatus(value: unknown): boolean {
  const compact = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  return (
    compact === 'live' ||
    compact === 'in_progress' ||
    compact === 'inprogress' ||
    compact.includes('live') ||
    compact.includes('progress') ||
    compact.includes('underway') ||
    compact.includes('ongoing')
  );
}

function shouldIncludeCarryoverGameForToday(game: any, nowMs: number): boolean {
  if (isLiveStatus(game?.status)) return true;
  const startTs = toTimestamp(game?.start_time ?? game?.startTime);
  if (startTs == null) return false;
  const deltaMs = nowMs - startTs;
  // Keep nearby games around UTC date rollover for local "today" view.
  return deltaMs >= (-3 * 60 * 60 * 1000) && deltaMs <= (8 * 60 * 60 * 1000);
}

function normalizeDisplayStatus(value: unknown): 'live' | 'scheduled' | 'final' {
  const compact = String(value || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (compact === 'final' || compact === 'completed' || compact === 'closed' || compact === 'ended') return 'final';
  if (isLiveStatus(compact)) return 'live';
  return 'scheduled';
}

function mapBoardCardToGame(card: OddsBoardCard): Game {
  const homeTeamObj = typeof card.homeTeam === 'string'
    ? { abbr: card.homeTeam, name: card.homeTeam }
    : { abbr: String(card.homeTeam?.abbr || 'TBD'), name: String(card.homeTeam?.name || card.homeTeam?.abbr || 'Home') };
  const awayTeamObj = typeof card.awayTeam === 'string'
    ? { abbr: card.awayTeam, name: card.awayTeam }
    : { abbr: String(card.awayTeam?.abbr || 'TBD'), name: String(card.awayTeam?.name || card.awayTeam?.abbr || 'Away') };

  return {
    id: String(card.id || card.gameId || ''),
    gameId: String(card.gameId || card.id || ''),
    hasRealOdds: Boolean(card.hasRealOdds),
    sport: normalizeSportForOddsPage(card.sport, card.league),
    league: card.league ?? null,
    homeTeam: homeTeamObj,
    awayTeam: awayTeamObj,
    homeScore: toFiniteNumber(card.homeScore ?? null) ?? null,
    awayScore: toFiniteNumber(card.awayScore ?? null) ?? null,
    status: normalizeDisplayStatus(card.status),
    period: card.period || undefined,
    periodLabel: card.periodLabel || undefined,
    clock: card.clock || undefined,
    mlbLiveState: card.mlbLiveState
      ? {
          inningHalf: card.mlbLiveState.inningHalf || undefined,
          inningNumber: card.mlbLiveState.inningNumber ?? undefined,
          inningState: card.mlbLiveState.inningState || undefined,
        }
      : null,
    startTime: card.startTime || undefined,
    channel: card.channel ?? null,
    spread: toFiniteNumber(card.odds?.spread ?? null),
    overUnder: toFiniteNumber(card.odds?.total ?? null),
    moneylineHome: toFiniteNumber(card.odds?.mlHome ?? null),
    moneylineAway: toFiniteNumber(card.odds?.mlAway ?? null),
    odds: {
      spread: toFiniteNumber(card.odds?.spread ?? null),
      spreadOpen: toFiniteNumber(card.odds?.spreadOpen ?? null),
      total: toFiniteNumber(card.odds?.total ?? null),
      totalOpen: toFiniteNumber(card.odds?.totalOpen ?? null),
      mlHome: toFiniteNumber(card.odds?.mlHome ?? null),
      mlAway: toFiniteNumber(card.odds?.mlAway ?? null),
      spread1H: toFiniteNumber(card.odds?.spread1H ?? null),
      total1H: toFiniteNumber(card.odds?.total1H ?? null),
      ml1HHome: toFiniteNumber(card.odds?.ml1HHome ?? null),
      ml1HAway: toFiniteNumber(card.odds?.ml1HAway ?? null),
      spread1P: toFiniteNumber(card.odds?.spread1P ?? card.odds?.spread1H ?? null),
      total1P: toFiniteNumber(card.odds?.total1P ?? card.odds?.total1H ?? null),
      ml1PHome: toFiniteNumber(card.odds?.ml1PHome ?? card.odds?.ml1HHome ?? null),
      ml1PAway: toFiniteNumber(card.odds?.ml1PAway ?? card.odds?.ml1HAway ?? null),
      f5: {
        spread: {
          home: toFiniteNumber(card.odds?.f5?.spread?.home ?? null) ?? null,
          away: toFiniteNumber(card.odds?.f5?.spread?.away ?? null) ?? null,
        },
        total: toFiniteNumber(card.odds?.f5?.total ?? null) ?? null,
        moneyline: {
          home: toFiniteNumber(card.odds?.f5?.moneyline?.home ?? null) ?? null,
          away: toFiniteNumber(card.odds?.f5?.moneyline?.away ?? null) ?? null,
        },
      },
    },
  };
}

export function OddsPage() {
  // Safely access hooks with defensive destructuring
  const watchboardsResult = useWatchboards();
  const boards = watchboardsResult?.boards || [];
  const { flags } = useFeatureFlags();
  
  // Direct fetch for games - same pattern as GamesPage
  const [rawGames, setRawGames] = useState<any[]>([]);
  const [rawProps, setRawProps] = useState<any[]>([]);
  const [boardSections, setBoardSections] = useState<OddsBoardSection[]>([]);
  const [oddsSummaryByGame, setOddsSummaryByGame] = useState<Record<string, {
    spread?: { home_line?: number | null };
    total?: { line?: number | null };
    moneyline?: { home_price?: number | null; away_price?: number | null };
    first_half?: {
      spread?: { home_line?: number | null; away_line?: number | null };
      total?: { line?: number | null };
      moneyline?: { home_price?: number | null; away_price?: number | null };
    };
    opening_spread?: number | null;
    opening_total?: number | null;
  }>>({});
  const [splitFeedByGame, setSplitFeedByGame] = useState<Record<string, TicketHandleSplitRow[]>>({});
  const [projectionFeed, setProjectionFeed] = useState<ProjectionRow[]>([]);
  const [projectionCoverage, setProjectionCoverage] = useState<ProjectionCoverage>({
    source: 'none',
    count: 0,
    fallbackReason: null,
  });
  const [propsLoading, setPropsLoading] = useState(false);
  const [moduleFeedsLoading, setModuleFeedsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [crossKeyFallbackForKey, setCrossKeyFallbackForKey] = useState<string | null>(null);
  const [loadedDataKey, setLoadedDataKey] = useState<string | null>(null);
  const [pendingDataKey, setPendingDataKey] = useState<string | null>(null);
  const [refreshCycleCount, setRefreshCycleCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedSport, setSelectedSport] = useState('ALL');
  const liveRefreshInFlightFastRef = useRef(false);
  const liveRefreshInFlightMlbRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const mountedRef = useRef(true);
  const activeFetchRequestRef = useRef(0);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const requestOwnerRef = useRef<{ id: number; dataKey: string } | null>(null);
  const visibleGamesRef = useRef<any[]>([]);
  const hasRenderedBoardRef = useRef(false);
  const lastValidBoardRef = useRef<LastValidBoardSnapshot | null>(null);
  const firstLoadRetryAttemptsRef = useRef(0);
  const firstLoadRetryTimerRef = useRef<number | null>(null);
  
  useEffect(() => {
    // React strict mode runs effect cleanup/re-run in development.
    // Reset the mounted flag on each setup so async finally blocks can update state.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (firstLoadRetryTimerRef.current != null) {
        window.clearTimeout(firstLoadRetryTimerRef.current);
        firstLoadRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    visibleGamesRef.current = rawGames;
  }, [rawGames]);

  const activeDateParam = useMemo(() => toDateParam(selectedDate), [selectedDate]);
  const activeSportParam = useMemo(
    () => (selectedSport === 'ALL' ? 'ALL' : selectedSport),
    [selectedSport]
  );
  const activeDataKey = useMemo(
    () => buildOddsDataKey(activeDateParam, activeSportParam),
    [activeDateParam, activeSportParam]
  );

  // Fetch all games directly from API
  const fetchGames = useCallback(async () => {
    const requestId = ++activeFetchRequestRef.current;
    const startedAt = performance.now();
    const stopPerf = startPerfTimer('odds.fetch');

    const selectedDateParam = toDateParam(selectedDate);
    const isInitialRenderRequest = visibleGamesRef.current.length === 0;
    const isHistoricalRequest = !isSameLocalDate(selectedDate, new Date());
    const pageDataTimeoutMs = isHistoricalRequest ? 30_000 : 30_000;
    const sportParam = selectedSport === 'ALL' ? 'ALL' : selectedSport;
    const requestDataKey = buildOddsDataKey(selectedDateParam, sportParam);
    const scopedCacheKey = buildOddsSlateCacheKey(selectedDateParam, sportParam);
    const ownsRequest = () =>
      mountedRef.current &&
      requestOwnerRef.current?.id === requestId &&
      requestOwnerRef.current?.dataKey === requestDataKey;
    const commitIfOwned = (commit: () => void) => {
      if (!ownsRequest()) return false;
      commit();
      return true;
    };

    activeFetchAbortRef.current?.abort();
    const abortController = new AbortController();
    activeFetchAbortRef.current = abortController;
    requestOwnerRef.current = { id: requestId, dataKey: requestDataKey };
    let keepBlockingLoaderForRetry = false;

    try {
      const cachedSlate = readOddsPageSlateCache(scopedCacheKey);
      const hasExactKeyCachedBoard = Boolean(
        cachedSlate &&
        Array.isArray(cachedSlate.boardSections) &&
        cachedSlate.boardSections.length > 0
      );

      if (cachedSlate) {
        commitIfOwned(() => {
          if (hasExactKeyCachedBoard) {
            setBoardSections(cachedSlate.boardSections);
            lastValidBoardRef.current = {
              dataKey: requestDataKey,
              boardKey: scopedCacheKey,
              boardSections: cachedSlate.boardSections,
              games: cachedSlate.games,
              oddsSummaryByGame: cachedSlate.oddsSummaryByGame && typeof cachedSlate.oddsSummaryByGame === 'object'
                ? cachedSlate.oddsSummaryByGame
                : {},
              generatedAt: null,
              freshnessSource: 'client-cache',
            };
          }
          setRawGames(cachedSlate.games);
          if (Object.keys(cachedSlate.oddsSummaryByGame).length > 0) {
            setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, cachedSlate.oddsSummaryByGame));
          }
          setLoadedDataKey(requestDataKey);
          setCrossKeyFallbackForKey(null);
          setError(null);
          setLoading(false);
        });
      }

      commitIfOwned(() => {
        setPendingDataKey(requestDataKey);
        setError(null);
        if (crossKeyFallbackForKey !== requestDataKey) {
          setStaleNotice(null);
        }
      });
      console.info("PAGE_DATA_START", { route: "odds", date: selectedDateParam, sport: sportParam });

      const qs = new URLSearchParams({ date: selectedDateParam, sport: sportParam });
      const payload = await fetchJsonCached<any>(`/api/page-data/odds?${qs.toString()}`, {
        cacheKey: `page-data:odds:${selectedDateParam}:${sportParam.toLowerCase()}`,
        ttlMs: isHistoricalRequest ? 15_000 : 0,
        timeoutMs: pageDataTimeoutMs,
        bypassCache: !isHistoricalRequest,
        init: { credentials: 'include', signal: abortController.signal },
      });
      let pageGames = Array.isArray(payload?.games) ? payload.games : [];
      let pageOdds = payload?.oddsSummaryByGame && typeof payload.oddsSummaryByGame === 'object'
        ? payload.oddsSummaryByGame
        : {};
      const pageBoardSections = Array.isArray(payload?.board?.sections)
        ? payload.board.sections
        : [];
      const boardPayloadKey = String(payload?.board?.key || scopedCacheKey);
      const payloadGeneratedAt = String(payload?.board?.generatedAt || payload?.generatedAt || '').trim() || null;
      const payloadFreshnessSource = String(payload?.freshness?.source || '').trim() || null;
      if (isHistoricalRequest && sportParam === 'ALL' && Object.keys(pageOdds).length === 0) {
        const historicalPrimeResults = await Promise.allSettled(
          ['MLB', 'NBA', 'NHL', 'NCAAB', 'SOCCER'].map(async (sport) => {
            const sportQs = new URLSearchParams({ date: selectedDateParam, sport });
            return fetchJsonCached<any>(`/api/page-data/odds?${sportQs.toString()}`, {
              cacheKey: `page-data:odds:${selectedDateParam}:${sport.toLowerCase()}:historical-prime`,
              ttlMs: 15_000,
              timeoutMs: 1_500,
              bypassCache: false,
              init: { credentials: 'include', signal: abortController.signal },
            });
          })
        );
        const mergedPrimeOdds: Record<string, any> = {};
        const mergedPrimeGamesById = new Map<string, any>();
        for (const result of historicalPrimeResults) {
          if (result.status !== 'fulfilled') continue;
          const nextOdds = result.value?.oddsSummaryByGame;
          if (nextOdds && typeof nextOdds === 'object') {
            Object.assign(mergedPrimeOdds, nextOdds);
          }
          const nextGames = Array.isArray(result.value?.games) ? result.value.games : [];
          for (const game of nextGames) {
            const gameId = String(game?.game_id || game?.id || '').trim().toLowerCase();
            if (!gameId) continue;
            mergedPrimeGamesById.set(gameId, game);
          }
        }
        if (Object.keys(mergedPrimeOdds).length > 0) {
          pageOdds = mergeOddsSummaryRecord(pageOdds, mergedPrimeOdds);
        }
        if (pageGames.length === 0 && mergedPrimeGamesById.size > 0) {
          pageGames = Array.from(mergedPrimeGamesById.values());
        }
      }

      if (!ownsRequest()) return;
      hasRenderedBoardRef.current = false;
      if (pageBoardSections.length > 0) {
        setBoardSections(pageBoardSections);
      }
      if (pageGames.length > 0) {
        setRawGames(pageGames);
        hasFetchedRef.current = true;
      }
      if (Object.keys(pageOdds).length > 0) {
        setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, pageOdds));
      }
      setLoadedDataKey(requestDataKey);
      setCrossKeyFallbackForKey(null);
      setStaleNotice(null);
      firstLoadRetryAttemptsRef.current = 0;
      if (firstLoadRetryTimerRef.current != null) {
        window.clearTimeout(firstLoadRetryTimerRef.current);
        firstLoadRetryTimerRef.current = null;
      }
      if (pageBoardSections.length > 0 || pageGames.length > 0 || Object.keys(pageOdds).length > 0) {
        writeOddsPageSlateCache(scopedCacheKey, pageGames, pageOdds, pageBoardSections);
      }
      if (pageBoardSections.length > 0) {
        lastValidBoardRef.current = {
          dataKey: requestDataKey,
          boardKey: boardPayloadKey,
          boardSections: pageBoardSections,
          games: pageGames,
          oddsSummaryByGame: pageOdds && typeof pageOdds === 'object' ? pageOdds : {},
          generatedAt: payloadGeneratedAt,
          freshnessSource: payloadFreshnessSource,
        };
      }

      // Background enrichment path (carryover, ALL fallbacks, odds repair)
      void (async () => {
        if (!ownsRequest()) return;
        if (isSameLocalDate(selectedDate, new Date())) {
          try {
            const nextDateParam = toDateParam(shiftDate(selectedDate, 1));
            const nextQs = new URLSearchParams({ date: nextDateParam, sport: sportParam });
            const nextPayload = await fetchJsonCached<any>(`/api/page-data/odds?${nextQs.toString()}`, {
              cacheKey: `page-data:odds:${nextDateParam}:${sportParam.toLowerCase()}:carryover`,
              ttlMs: 0,
              timeoutMs: isInitialRenderRequest ? 2_000 : 2_700,
              bypassCache: true,
              init: { credentials: 'include', signal: abortController.signal },
            });
            const nextGames = Array.isArray(nextPayload?.games) ? nextPayload.games : [];
            const carryoverGames = nextGames.filter((game: any) => shouldIncludeCarryoverGameForToday(game, Date.now()));
            if (carryoverGames.length > 0) {
              const byId = new Map<string, any>();
              for (const row of pageGames) {
                const key = String(row?.game_id || row?.id || '').trim().toLowerCase();
                if (key) byId.set(key, row);
              }
              for (const row of carryoverGames) {
                const key = String(row?.game_id || row?.id || '').trim().toLowerCase();
                if (!key) continue;
                byId.set(key, row);
              }
              pageGames = Array.from(byId.values());
            }
            const nextOdds = nextPayload?.oddsSummaryByGame && typeof nextPayload.oddsSummaryByGame === 'object'
              ? nextPayload.oddsSummaryByGame
              : {};
            if (Object.keys(nextOdds).length > 0) {
              pageOdds = mergeOddsSummaryRecord(pageOdds, nextOdds);
            }
          } catch {
            // non-fatal carryover path
          }
        }
        if (sportParam === 'ALL' && pageGames.length === 0) {
          const perSportGameResults = await Promise.allSettled(
            ['MLB', 'NBA', 'NHL', 'NCAAB', 'SOCCER'].map((sport) => {
              const sportQs = new URLSearchParams({ date: selectedDateParam, sport });
              return fetchJsonCached<any>(`/api/page-data/odds?${sportQs.toString()}`, {
                cacheKey: `page-data:odds:${selectedDateParam}:${sport.toLowerCase()}:games-fallback`,
                ttlMs: 0,
                timeoutMs: isInitialRenderRequest ? 2_500 : 3_200,
                bypassCache: true,
                init: { credentials: 'include', signal: abortController.signal },
              });
            })
          );
          const mergedGamesById = new Map<string, any>();
          for (const result of perSportGameResults) {
            if (result.status !== 'fulfilled') continue;
            const sportGames = Array.isArray(result.value?.games) ? result.value.games : [];
            for (const game of sportGames) {
              const key = String(game?.game_id || game?.id || '').trim().toLowerCase();
              if (!key) continue;
              mergedGamesById.set(key, game);
            }
          }
          if (mergedGamesById.size > 0) {
            pageGames = Array.from(mergedGamesById.values());
          }
        }
        if (sportParam === 'ALL' && Object.keys(pageOdds).length === 0) {
          const perSportResults = await Promise.allSettled(
            ['MLB', 'NBA', 'NHL'].map((sport) => {
              const sportQs = new URLSearchParams({ date: selectedDateParam, sport });
              return fetchJsonCached<any>(`/api/page-data/odds?${sportQs.toString()}`, {
                cacheKey: `page-data:odds:${selectedDateParam}:${sport.toLowerCase()}`,
                ttlMs: 0,
                timeoutMs: isInitialRenderRequest ? 2_000 : 2_700,
                bypassCache: true,
                init: { credentials: 'include', signal: abortController.signal },
              });
            })
          );
          const merged: Record<string, any> = {};
          for (const result of perSportResults) {
            if (result.status !== 'fulfilled') continue;
            const sportOdds = result.value?.oddsSummaryByGame;
            if (!sportOdds || typeof sportOdds !== 'object') continue;
            Object.assign(merged, sportOdds);
          }
          if (Object.keys(merged).length > 0) pageOdds = merged;
        }
        if (pageGames.length > 0) {
          try {
            const sportsPresent: string[] = Array.from(new Set(
              pageGames
                .map((game: any) => normalizeSportForOddsPage(game?.sport, game?.league))
                .filter(Boolean)
            )) as string[];
            const repairSports: string[] = (sportParam === 'ALL' ? sportsPresent : [sportParam])
              .filter((sport) => ['MLB', 'NBA', 'NHL', 'NCAAB', 'NFL', 'NCAAF', 'SOCCER'].includes(String(sport || '').toUpperCase()));
            const liveOddsMapsBySport: Record<string, Record<string, any>> = {};
            const fetchResults = await Promise.allSettled(repairSports.map(async (repairSport) => {
              const timeoutMs = String(repairSport || '').toUpperCase() === 'MLB' ? 10_000 : 3_500;
              const liveOddsPayload = await fetchJsonCached<any>(`/api/games/odds/${repairSport.toLowerCase()}`, {
                cacheKey: `games-odds:${selectedDateParam}:${repairSport.toLowerCase()}`,
                ttlMs: 3_000,
                timeoutMs,
                init: { credentials: 'include', signal: abortController.signal },
              });
              return {
                sport: repairSport,
                odds: liveOddsPayload?.odds && typeof liveOddsPayload.odds === 'object'
                  ? liveOddsPayload.odds as Record<string, any>
                  : {},
              };
            }));
            for (const result of fetchResults) {
              if (result.status !== 'fulfilled') continue;
              liveOddsMapsBySport[result.value.sport] = result.value.odds;
            }
            if (Object.values(liveOddsMapsBySport).some((map) => Object.keys(map).length > 0)) {
              for (const game of pageGames) {
                const gameSport = normalizeSportForOddsPage(game?.sport, game?.league);
                if (!gameSport) continue;
                const liveOddsMap = liveOddsMapsBySport[gameSport] || {};
                if (Object.keys(liveOddsMap).length === 0) continue;
                const idCandidates = buildGameJoinCandidates(game);
                const matchupCandidates = buildLiveOddsMatchupCandidates(game, gameSport);
                const allCandidates = [...idCandidates, ...matchupCandidates];
                const liveOdds = allCandidates
                  .map((key) => liveOddsMap[key])
                  .find((row) => row && typeof row === 'object');
                if (!liveOdds) continue;

                const existingKeys = idCandidates.filter((key) => pageOdds[key]);
                const targetKeys = Array.from(new Set([
                  ...existingKeys,
                  ...idCandidates.slice(0, 2),
                ])).filter(Boolean);
                if (targetKeys.length === 0) continue;
                const strongestExisting = existingKeys
                  .map((key) => pageOdds[key])
                  .find((summary) => summary && typeof summary === 'object') || { game: { game_id: game?.game_id || game?.id } };

                const toNum = (value: unknown): number | null => {
                  const parsed = Number(value);
                  if (!Number.isFinite(parsed)) return null;
                  if (parsed === 0) return null;
                  return parsed;
                };
                const spreadHome = Number.isFinite(Number(liveOdds?.spread1HHome)) ? Number(liveOdds.spread1HHome) : null;
                const spreadAway = Number.isFinite(Number(liveOdds?.spread1HAway))
                  ? Number(liveOdds.spread1HAway)
                  : (spreadHome != null ? -spreadHome : null);
                const total = Number.isFinite(Number(liveOdds?.total1H)) ? Number(liveOdds.total1H) : null;
                const mlHome = toNum(liveOdds?.moneyline1HHome);
                const mlAway = toNum(liveOdds?.moneyline1HAway);
                const fgSpreadHome = Number.isFinite(Number(liveOdds?.spreadHome)) ? Number(liveOdds.spreadHome) : null;
                const fgSpreadAway = Number.isFinite(Number(liveOdds?.spreadAway))
                  ? Number(liveOdds.spreadAway)
                  : (fgSpreadHome != null ? -fgSpreadHome : null);
                const fgTotal = Number.isFinite(Number(liveOdds?.total)) ? Number(liveOdds.total) : null;
                const fgMlHome = toNum(liveOdds?.moneylineHome);
                const fgMlAway = toNum(liveOdds?.moneylineAway);
                const f5SpreadHome = Number.isFinite(Number(liveOdds?.f5SpreadHome)) ? Number(liveOdds.f5SpreadHome) : null;
                const f5SpreadAway = Number.isFinite(Number(liveOdds?.f5SpreadAway))
                  ? Number(liveOdds.f5SpreadAway)
                  : (f5SpreadHome != null ? -f5SpreadHome : null);
                const f5Total = Number.isFinite(Number(liveOdds?.f5Total)) ? Number(liveOdds.f5Total) : null;
                const f5MlHome = toNum(liveOdds?.f5MoneylineHome);
                const f5MlAway = toNum(liveOdds?.f5MoneylineAway);

                const needsFullGameRepair = !hasUsableFullGameOdds(strongestExisting);
                const needsBasketball1HRepair = (
                  (gameSport === 'NBA' || gameSport === 'NCAAB') &&
                  !hasUsableBasketballFirstHalf(strongestExisting)
                );
                const needsMlbF5Repair = (
                  gameSport === 'MLB' &&
                  !hasUsableMlbF5Odds(strongestExisting)
                );

                if (!needsFullGameRepair && !needsBasketball1HRepair && !needsMlbF5Repair) continue;
                if (
                  fgSpreadHome == null &&
                  fgTotal == null &&
                  fgMlHome == null &&
                  fgMlAway == null &&
                  f5SpreadHome == null &&
                  f5Total == null &&
                  f5MlHome == null &&
                  f5MlAway == null &&
                  spreadHome == null &&
                  total == null &&
                  mlHome == null &&
                  mlAway == null
                ) continue;

                const repairedFirstHalf = {
                  spread: spreadHome == null && spreadAway == null ? null : { home_line: spreadHome, away_line: spreadAway },
                  total: total == null ? null : { line: total },
                  moneyline: mlHome == null && mlAway == null ? null : { home_price: mlHome, away_price: mlAway },
                };
                for (const key of targetKeys) {
                  const base = pageOdds[key] || strongestExisting;
                  pageOdds[key] = {
                    ...base,
                    spread: needsFullGameRepair
                      ? (fgSpreadHome == null && fgSpreadAway == null ? base?.spread ?? null : { home_line: fgSpreadHome, away_line: fgSpreadAway })
                      : (base?.spread ?? null),
                    total: needsFullGameRepair
                      ? (fgTotal == null ? base?.total ?? null : { line: fgTotal })
                      : (base?.total ?? null),
                    moneyline: needsFullGameRepair
                      ? (fgMlHome == null && fgMlAway == null ? base?.moneyline ?? null : { home_price: fgMlHome, away_price: fgMlAway })
                      : (base?.moneyline ?? null),
                    first_half: needsBasketball1HRepair ? repairedFirstHalf : (base?.first_half ?? null),
                    f5: gameSport === 'MLB'
                      ? {
                          spread: needsMlbF5Repair
                            ? (f5SpreadHome == null && f5SpreadAway == null ? (base?.f5?.spread ?? null) : { home: f5SpreadHome, away: f5SpreadAway })
                            : (base?.f5?.spread ?? null),
                          total: needsMlbF5Repair
                            ? (f5Total == null ? (base?.f5?.total ?? null) : f5Total)
                            : (base?.f5?.total ?? null),
                          moneyline: needsMlbF5Repair
                            ? (f5MlHome == null && f5MlAway == null ? (base?.f5?.moneyline ?? null) : { home: f5MlHome, away: f5MlAway })
                            : (base?.f5?.moneyline ?? null),
                        }
                      : (base?.f5 ?? null),
                  };
                }
              }
            }
          } catch {
            // non-fatal odds repair path
          }
        }
        if (!ownsRequest()) return;
        if (pageGames.length > 0) {
          setRawGames(pageGames);
          hasFetchedRef.current = true;
        }
        if (Object.keys(pageOdds).length > 0) {
          setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, pageOdds));
        }
        if (pageBoardSections.length > 0 || pageGames.length > 0 || Object.keys(pageOdds).length > 0) {
          writeOddsPageSlateCache(scopedCacheKey, pageGames, pageOdds, pageBoardSections);
        }
      })();

      if (!ownsRequest()) return;
      if (pageGames.length === 0 && visibleGamesRef.current.length === 0) {
        console.warn("PAGE_DATA_FALLBACK_USED", { route: "odds", reason: "empty_payload_no_existing_data", date: selectedDateParam });
      }
      console.info("PAGE_DATA_SUCCESS", {
        route: "odds",
        date: selectedDateParam,
        games: pageGames.length,
        oddsSummary: Object.keys(pageOdds).length,
        degraded: Boolean(payload?.degraded),
      });
      if (flags.PAGE_DATA_OBSERVABILITY_ENABLED) {
        const loadMs = Math.max(0, Math.round(performance.now() - startedAt));
        void fetch('/api/page-data/telemetry', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            route: 'odds',
            loadMs,
            apiCalls: 1,
            oddsAvailableAtFirstRender: Object.keys(pageOdds).length > 0,
          }),
        }).catch(() => {});
      }
      setPropsLoading(true);
      setModuleFeedsLoading(true);
      const propsQs = new URLSearchParams({
        date: selectedDateParam,
        sport: sportParam,
      });
      const splitIds: string[] = Array.from(
        new Set(
          pageGames
            .slice(0, 14)
            .flatMap((game: any) => buildGameJoinCandidates(game).slice(0, 2))
            .filter(Boolean)
        )
      ) as string[];
      void Promise.allSettled([
        fetchJsonCached<any>(`/api/sports-data/props/today?${propsQs.toString()}`, {
          cacheKey: `odds:props:today:${selectedDateParam}:${sportParam.toLowerCase()}`,
          ttlMs: 20_000,
          timeoutMs: 2_500,
          init: { credentials: 'include', signal: abortController.signal },
        }),
        fetchJsonCached<any>('/api/odds/props/projections?limit=120', {
          cacheKey: `odds:projections:${selectedDateParam}`,
          ttlMs: 20_000,
          timeoutMs: 2_800,
          init: { credentials: 'include', signal: abortController.signal },
        }),
        Promise.allSettled(
          splitIds.map((id) =>
            fetchJsonCached<any>(`/api/odds/splits/${encodeURIComponent(id)}`, {
              cacheKey: `odds:splits:${selectedDateParam}:${id}`,
              ttlMs: 20_000,
              timeoutMs: 2_200,
              init: { credentials: 'include', signal: abortController.signal },
            }).catch(() => null)
          )
        ),
      ])
        .then((results) => {
          if (!ownsRequest()) return;
          const [propsResult, projectionResult, splitResult] = results;

          if (propsResult.status === 'fulfilled') {
            const nextProps = Array.isArray(propsResult.value?.props) ? propsResult.value.props : [];
            setRawProps(nextProps);
          }

          if (projectionResult.status === 'fulfilled') {
            const responseRows = Array.isArray(projectionResult.value?.projections) ? projectionResult.value.projections : [];
            const normalizedRows = responseRows.filter((row: any) => row && typeof row === 'object');
            setProjectionFeed(normalizedRows);
            setProjectionCoverage({
              source: String(projectionResult.value?.source || 'none'),
              count: normalizedRows.length,
              fallbackReason: projectionResult.value?.fallback_reason ?? null,
            });
          }

          if (splitResult.status === 'fulfilled') {
            const nextSplitMap: Record<string, TicketHandleSplitRow[]> = {};
            for (const row of splitResult.value) {
              if (row.status !== 'fulfilled') continue;
              const payload = row.value;
              const rows = Array.isArray(payload?.rows) ? payload.rows : [];
              if (!rows.length) continue;
              const candidateKeys = buildOddsLookupCandidates(payload?.game_id).slice(0, 3);
              for (const key of candidateKeys) {
                nextSplitMap[key] = rows;
              }
            }
            setSplitFeedByGame(nextSplitMap);
          }
        })
        .catch(() => {
          if (!ownsRequest()) return;
          // Keep the last valid module payloads; do not clear on transient errors.
        })
        .finally(() => {
          if (!ownsRequest()) return;
          setPropsLoading(false);
          setModuleFeedsLoading(false);
        });
      return;

    } catch (err) {
      if (!ownsRequest()) return;
      console.error('[OddsPage] Fetch error:', err);
      const msg = String((err as any)?.message || "");
      if (msg.toLowerCase().includes("timeout") || String((err as any)?.name || "") === "AbortError") {
        console.warn("PAGE_DATA_TIMEOUT", { route: "odds", date: selectedDateParam });
      }
      const scopedCached = readOddsPageSlateCache(buildOddsSlateCacheKey(selectedDateParam, sportParam));
      if (scopedCached) {
        if (Array.isArray(scopedCached.boardSections) && scopedCached.boardSections.length > 0) {
          setBoardSections(scopedCached.boardSections);
          lastValidBoardRef.current = {
            dataKey: requestDataKey,
            boardKey: buildOddsSlateCacheKey(selectedDateParam, sportParam),
            boardSections: scopedCached.boardSections,
            games: scopedCached.games,
            oddsSummaryByGame: scopedCached.oddsSummaryByGame && typeof scopedCached.oddsSummaryByGame === 'object'
              ? scopedCached.oddsSummaryByGame
              : {},
            generatedAt: null,
            freshnessSource: 'client-cache',
          };
        }
        setRawGames(scopedCached.games);
        if (Object.keys(scopedCached.oddsSummaryByGame).length > 0) {
          setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, scopedCached.oddsSummaryByGame));
        }
        setLoadedDataKey(requestDataKey);
        setCrossKeyFallbackForKey(null);
        setStaleNotice('Network issue during refresh. Showing last known valid data.');
        hasFetchedRef.current = true;
      } else if (lastValidBoardRef.current && Array.isArray(lastValidBoardRef.current.boardSections) && lastValidBoardRef.current.boardSections.length > 0) {
        const lastValid = lastValidBoardRef.current;
        setBoardSections(lastValid.boardSections);
        setRawGames(lastValid.games);
        if (Object.keys(lastValid.oddsSummaryByGame || {}).length > 0) {
          setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, lastValid.oddsSummaryByGame));
        }
        setCrossKeyFallbackForKey(requestDataKey);
        setStaleNotice('Showing last available board while new board loads.');
        hasFetchedRef.current = true;
      } else if (visibleGamesRef.current.length === 0) {
        const timeoutLike = (
          msg.toLowerCase().includes("timeout") ||
          String((err as any)?.name || "") === "AbortError" ||
          msg.toLowerCase().includes("failed to fetch") ||
          msg.toLowerCase().includes("network")
        );
        const retryableInitialFailure =
          firstLoadRetryAttemptsRef.current < 3 &&
          (
            timeoutLike ||
            String((err as any)?.name || "") !== "AbortError"
          );
        if (retryableInitialFailure) {
          const attempt = firstLoadRetryAttemptsRef.current;
          const retryDelayMs = attempt === 0 ? 1200 : attempt === 1 ? 2500 : 4000;
          firstLoadRetryAttemptsRef.current = attempt + 1;
          if (firstLoadRetryTimerRef.current != null) {
            window.clearTimeout(firstLoadRetryTimerRef.current);
            firstLoadRetryTimerRef.current = null;
          }
          keepBlockingLoaderForRetry = true;
          setError(null);
          setStaleNotice("Network is slow. Retrying odds feed...");
          firstLoadRetryTimerRef.current = window.setTimeout(() => {
            firstLoadRetryTimerRef.current = null;
            if (!mountedRef.current) return;
            void fetchGames();
          }, retryDelayMs);
          console.warn("PAGE_DATA_FALLBACK_USED", {
            route: "odds",
            reason: "request_failed_retrying_initial_load",
            date: selectedDateParam,
            retryAttempt: firstLoadRetryAttemptsRef.current,
          });
        } else {
          setError('Network error loading games');
          console.warn("PAGE_DATA_FALLBACK_USED", { route: "odds", reason: "request_failed_no_existing_data", date: selectedDateParam });
        }
      } else {
        incrementPerfCounter('odds.staleProtected');
        setCrossKeyFallbackForKey(requestDataKey);
        setStaleNotice('Showing last available board while new board loads.');
      }
    } finally {
      if (ownsRequest()) {
        requestOwnerRef.current = null;
        if (activeFetchAbortRef.current === abortController) {
          activeFetchAbortRef.current = null;
        }
        stopPerf();
        console.debug('[OddsPage][fetch-cache]', getFetchCacheStats());
        logPerfSnapshot('OddsPage');
        if (!keepBlockingLoaderForRetry) {
          setPendingDataKey((current) => (current === requestDataKey ? null : current));
          setLoading(false);
        } else {
          setPendingDataKey(requestDataKey);
          setLoading(true);
        }
        setPropsLoading(false);
        setModuleFeedsLoading(false);
        setRefreshCycleCount((v) => v + 1);
      }
    }
  }, [
    crossKeyFallbackForKey,
    flags.PAGE_DATA_OBSERVABILITY_ENABLED,
    selectedDate,
    selectedSport,
  ]);
  
  // Initial fetch
  useEffect(() => {
    fetchGames();
  }, [fetchGames]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [showMoreSections, setShowMoreSections] = useState<Record<string, number>>({});
  
  // Watchboard modal state
  const [watchboardModalOpen, setWatchboardModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  // Transform raw games to Game format
  const games = useMemo<Game[]>(() => {
    if (!rawGames || !Array.isArray(rawGames)) return [];
    const oddsSummaryByMatch = buildOddsSummaryMatchLookup(oddsSummaryByGame);
    
    try {
      return rawGames
        .filter(g => g && typeof g === 'object' && (g.game_id || g.id))
        .map((g) => {
          const sportKey = normalizeSportForOddsPage(g.sport, g.league);
          const homeAbbr = g.home_team_code || 'TBD';
          const awayAbbr = g.away_team_code || 'TBD';
          const candidateIds = buildGameJoinCandidates(g);
          const matchKey = buildOddsMatchKey(
            g.home_team_code || g.home_team_name || g.homeTeamCode || g.homeTeam,
            g.away_team_code || g.away_team_name || g.awayTeamCode || g.awayTeam,
            g.start_time || g.startTime
          );
          const bestCandidateSummary = candidateIds
            .map((candidate) => normalizeOddsSummary(oddsSummaryByGame[candidate]))
            .filter((summary): summary is OddsSummaryShape => Boolean(summary))
            .sort((a, b) => oddsSummaryStrength(b) - oddsSummaryStrength(a))[0];
          const matchSummary = matchKey ? normalizeOddsSummary(oddsSummaryByMatch[matchKey]) : null;
          const summary = bestCandidateSummary || matchSummary;
          const nativeSpread = toFiniteNumber(g?.spread_home ?? g?.spreadHome ?? g?.spread);
          const nativeTotal = toFiniteNumber(g?.total ?? g?.overUnder ?? g?.over_under);
          const nativeMlHome = toFiniteNumber(g?.moneyline_home ?? g?.moneylineHome);
          const nativeMlAway = toFiniteNumber(g?.moneyline_away ?? g?.moneylineAway);
          const nativeSpread1H = toFiniteNumber(g?.spread_1h_home ?? g?.spread1HHome);
          const nativeTotal1H = toFiniteNumber(g?.total_1h ?? g?.total1H);
          const nativeMl1HHome = toFiniteNumber(g?.moneyline_1h_home ?? g?.moneyline1HHome);
          const nativeMl1HAway = toFiniteNumber(g?.moneyline_1h_away ?? g?.moneyline1HAway);
          const nz = (value: number | undefined): number | undefined => (value == null || value === 0 ? undefined : value);
          const isMlbSport = sportKey === 'MLB';
          const summaryPeriodSpread = isMlbSport
            ? (nz(toFiniteNumber(summary?.f5?.spread?.home)) ?? nz(toFiniteNumber(summary?.first_half?.spread?.home_line)))
            : (nz(toFiniteNumber(summary?.first_half?.spread?.home_line)) ?? nz(toFiniteNumber(summary?.f5?.spread?.home)));
          const summaryPeriodSpreadAway = isMlbSport
            ? (nz(toFiniteNumber(summary?.f5?.spread?.away)) ?? nz(toFiniteNumber(summary?.first_half?.spread?.away_line)))
            : (nz(toFiniteNumber(summary?.first_half?.spread?.away_line)) ?? nz(toFiniteNumber(summary?.f5?.spread?.away)));
          const summaryPeriodTotal = isMlbSport
            ? (nz(toFiniteNumber(summary?.f5?.total)) ?? nz(toFiniteNumber(summary?.first_half?.total?.line)))
            : (nz(toFiniteNumber(summary?.first_half?.total?.line)) ?? nz(toFiniteNumber(summary?.f5?.total)));
          const summaryPeriodMlHome = isMlbSport
            ? (nz(toFiniteNumber(summary?.f5?.moneyline?.home)) ?? nz(toFiniteNumber(summary?.first_half?.moneyline?.home_price)))
            : (nz(toFiniteNumber(summary?.first_half?.moneyline?.home_price)) ?? nz(toFiniteNumber(summary?.f5?.moneyline?.home)));
          const summaryPeriodMlAway = isMlbSport
            ? (nz(toFiniteNumber(summary?.f5?.moneyline?.away)) ?? nz(toFiniteNumber(summary?.first_half?.moneyline?.away_price)))
            : (nz(toFiniteNumber(summary?.first_half?.moneyline?.away_price)) ?? nz(toFiniteNumber(summary?.f5?.moneyline?.away)));
          const hasRealOdds = Boolean(
            summary?.spread?.home_line != null ||
            summary?.total?.line != null ||
            summary?.moneyline?.home_price != null ||
            summary?.moneyline?.away_price != null ||
            summary?.first_half?.spread?.home_line != null ||
            summary?.first_half?.spread?.away_line != null ||
            summary?.first_half?.total?.line != null ||
            summary?.first_half?.moneyline?.home_price != null ||
            summary?.first_half?.moneyline?.away_price != null ||
            nativeSpread !== undefined ||
            nativeTotal !== undefined ||
            nativeMlHome !== undefined ||
            nativeMlAway !== undefined ||
            nativeSpread1H !== undefined ||
            nativeTotal1H !== undefined ||
            nativeMl1HHome !== undefined ||
            nativeMl1HAway !== undefined
          );
          
          // Normalize status
          const normalizedStatus = normalizeDisplayStatus(g.status);
          
          return {
            id: g.game_id || g.id || `gen_${sportKey}_${homeAbbr}_${awayAbbr}`,
            gameId: g.game_id || g.id || '',
            hasRealOdds,
            sport: sportKey,
            league: null,
            homeTeam: homeAbbr,
            awayTeam: awayAbbr,
            homeScore: g.home_score ?? null,
            awayScore: g.away_score ?? null,
            status: normalizedStatus as 'live' | 'scheduled' | 'final',
            period: g.period || undefined,
            periodLabel: g.period_label || g.periodLabel || undefined,
            clock: g.clock || undefined,
            mlbLiveState: g.mlbLiveState ?? null,
            startTime: g.start_time || undefined,
            channel: g.channel || null,
            spread: summary?.spread?.home_line ?? nativeSpread,
            overUnder: summary?.total?.line ?? nativeTotal,
            moneylineHome: summary?.moneyline?.home_price ?? nativeMlHome,
            moneylineAway: summary?.moneyline?.away_price ?? nativeMlAway,
            odds: {
              spread: summary?.spread?.home_line ?? nativeSpread,
              spreadOpen: summary?.opening_spread ?? undefined,
              total: summary?.total?.line ?? nativeTotal,
              totalOpen: summary?.opening_total ?? undefined,
              mlHome: summary?.moneyline?.home_price ?? nativeMlHome,
              mlAway: summary?.moneyline?.away_price ?? nativeMlAway,
              spread1H: summaryPeriodSpread ?? nz(nativeSpread1H),
              total1H: summaryPeriodTotal ?? nz(nativeTotal1H),
              ml1HHome: summaryPeriodMlHome ?? nz(nativeMl1HHome),
              ml1HAway: summaryPeriodMlAway ?? nz(nativeMl1HAway),
              spread1P: sportKey === 'NHL' ? (summaryPeriodSpread ?? nz(nativeSpread1H)) : undefined,
              total1P: sportKey === 'NHL' ? (summaryPeriodTotal ?? nz(nativeTotal1H)) : undefined,
              ml1PHome: sportKey === 'NHL' ? (summaryPeriodMlHome ?? nz(nativeMl1HHome)) : undefined,
              ml1PAway: sportKey === 'NHL' ? (summaryPeriodMlAway ?? nz(nativeMl1HAway)) : undefined,
              f5: {
                spread: {
                  home: summaryPeriodSpread ?? nz(nativeSpread1H) ?? null,
                  away: summaryPeriodSpreadAway ?? (nz(nativeSpread1H) != null ? -Number(nz(nativeSpread1H)) : null),
                },
                total: summaryPeriodTotal ?? nz(nativeTotal1H) ?? null,
                moneyline: {
                  home: summaryPeriodMlHome ?? nz(nativeMl1HHome) ?? null,
                  away: summaryPeriodMlAway ?? nz(nativeMl1HAway) ?? null,
                },
              },
            },
          };
        });
    } catch (err) {
      console.error('[OddsPage] Error transforming games:', err);
      return [];
    }
  }, [rawGames, oddsSummaryByGame]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(rawGames.length === 0);
    invalidateJsonCache('odds:games:');
    invalidateJsonCache('odds:slate:');
    invalidateJsonCache('odds:splits:');
    invalidateJsonCache('odds:projections:');
    await fetchGames();
    setRefreshing(false);
  }, [fetchGames, rawGames.length]);

  const refreshLiveCardsBySports = useCallback(async (
    sports: string[],
    visibleLiveGameIds: Set<string>,
    lane: 'fast' | 'mlb',
    timeoutMs: number
  ) => {
    if (!sports.length || visibleLiveGameIds.size === 0) return;
    const inFlightRef = lane === 'mlb' ? liveRefreshInFlightMlbRef : liveRefreshInFlightFastRef;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const dateParam = toDateParam(selectedDate);
      const settled = await Promise.allSettled(
        sports.map(async (sport) => {
          const url = `/api/games?sport=${encodeURIComponent(sport.toLowerCase())}&date=${encodeURIComponent(dateParam)}&fresh=1`;
          const payload = await fetchJsonCached<any>(url, {
            cacheKey: `odds:live-truth:${dateParam}:${sport}:${lane}`,
            ttlMs: 0,
            timeoutMs,
            bypassCache: true,
            init: { credentials: 'include' },
          });
          if (Array.isArray(payload)) return payload;
          return Array.isArray(payload?.games) ? payload.games : [];
        })
      );
      const incomingRows = settled
        .filter((row): row is PromiseFulfilledResult<any[]> => row.status === 'fulfilled')
        .flatMap((row) => row.value);
      const oddsSettled = await Promise.allSettled(
        sports.map(async (sport) => {
          const oddsPayload = await fetchJsonCached<any>(`/api/games/odds/${sport.toLowerCase()}`, {
            cacheKey: `odds:live-map:${dateParam}:${sport}:${lane}`,
            ttlMs: 3_000,
            timeoutMs: String(sport || '').toUpperCase() === 'MLB' ? 10_000 : 3_500,
            init: { credentials: 'include' },
          });
          const oddsMap = oddsPayload?.odds && typeof oddsPayload.odds === 'object'
            ? oddsPayload.odds as Record<string, any>
            : {};
          return { sport, oddsMap };
        })
      );
      const liveOddsMapsBySport: Record<string, Record<string, any>> = {};
      for (const result of oddsSettled) {
        if (result.status !== 'fulfilled') continue;
        liveOddsMapsBySport[String(result.value.sport || '').toUpperCase()] = result.value.oddsMap || {};
      }

      if (!incomingRows.length && Object.values(liveOddsMapsBySport).every((map) => Object.keys(map || {}).length === 0)) {
        return;
      }

      const keyOf = (game: any): string =>
        String(game?.game_id || game?.id || game?.external_id || '').trim().toLowerCase();
      const incomingById = new Map<string, any>();
      const incomingByCandidate = new Map<string, any>();
      for (const row of incomingRows) {
        const key = keyOf(row);
        if (!key) continue;
        incomingById.set(key, row);
        const incomingSport = normalizeSportForOddsPage(row?.sport, row?.league);
        const candidates = [
          ...buildGameJoinCandidates(row),
          ...buildLiveOddsMatchupCandidates(row, incomingSport),
        ];
        for (const candidate of candidates) {
          if (!candidate) continue;
          if (!incomingByCandidate.has(candidate)) {
            incomingByCandidate.set(candidate, row);
          }
        }
      }

      setRawGames((prev) => {
        let changed = false;
        const next = prev.map((existing) => {
          const key = keyOf(existing);
          if (!visibleLiveGameIds.has(key)) return existing;
          const sportKey = normalizeSportForOddsPage(existing?.sport, existing?.league);
          const existingCandidates = [
            ...buildGameJoinCandidates(existing),
            ...buildLiveOddsMatchupCandidates(existing, sportKey),
          ];
          const incoming = incomingById.get(key)
            || existingCandidates
              .map((candidate) => incomingByCandidate.get(candidate))
              .find((row) => row && typeof row === 'object');
          const incomingUpdatedTs = toTimestamp(incoming?.last_updated_at ?? incoming?.updated_at);
          const existingUpdatedTs = toTimestamp(existing?.last_updated_at ?? existing?.updated_at);
          const useIncomingTruth = Boolean(incoming) && (
            incomingUpdatedTs == null ||
            existingUpdatedTs == null ||
            incomingUpdatedTs >= existingUpdatedTs
          );
          const statusTruth = useIncomingTruth ? incoming : null;
          const sportOddsMap = liveOddsMapsBySport[String(sportKey || '').toUpperCase()] || {};
          const oddsCandidates = existingCandidates;
          const liveOdds = oddsCandidates
            .map((candidate) => sportOddsMap[candidate])
            .find((row) => row && typeof row === 'object');
          if (!incoming && !liveOdds) return existing;
          const sportUpper = String(sportKey || "").toUpperCase();
          const periodSpreadHomeLive = sportUpper === "MLB"
            ? (liveOdds?.f5SpreadHome ?? liveOdds?.spread1HHome)
            : (liveOdds?.spread1HHome ?? liveOdds?.f5SpreadHome);
          const periodSpreadAwayLive = sportUpper === "MLB"
            ? (liveOdds?.f5SpreadAway ?? liveOdds?.spread1HAway)
            : (liveOdds?.spread1HAway ?? liveOdds?.f5SpreadAway);
          const periodTotalLive = sportUpper === "MLB"
            ? (liveOdds?.f5Total ?? liveOdds?.total1H)
            : (liveOdds?.total1H ?? liveOdds?.f5Total);
          const periodMlHomeLive = sportUpper === "MLB"
            ? (liveOdds?.f5MoneylineHome ?? liveOdds?.moneyline1HHome)
            : (liveOdds?.moneyline1HHome ?? liveOdds?.f5MoneylineHome);
          const periodMlAwayLive = sportUpper === "MLB"
            ? (liveOdds?.f5MoneylineAway ?? liveOdds?.moneyline1HAway)
            : (liveOdds?.moneyline1HAway ?? liveOdds?.f5MoneylineAway);
          const mergedBase = {
            ...existing,
            status: statusTruth?.status ?? existing?.status,
            period: statusTruth?.period ?? existing?.period ?? null,
            period_label: statusTruth?.period_label ?? statusTruth?.period ?? existing?.period_label ?? existing?.period ?? null,
            clock: statusTruth?.clock ?? existing?.clock ?? null,
            home_score: statusTruth?.home_score ?? existing?.home_score ?? null,
            away_score: statusTruth?.away_score ?? existing?.away_score ?? null,
            last_updated_at: statusTruth?.last_updated_at ?? existing?.last_updated_at ?? null,
            mlbLiveState: statusTruth?.mlbLiveState ?? existing?.mlbLiveState ?? null,
            spread_home: liveOdds?.spreadHome ?? existing?.spread_home ?? existing?.spreadHome ?? existing?.spread ?? null,
            total: liveOdds?.total ?? existing?.total ?? existing?.overUnder ?? null,
            moneyline_home: liveOdds?.moneylineHome ?? existing?.moneyline_home ?? existing?.moneylineHome ?? null,
            moneyline_away: liveOdds?.moneylineAway ?? existing?.moneyline_away ?? existing?.moneylineAway ?? null,
            spread: liveOdds?.spreadHome ?? existing?.spread ?? existing?.spread_home ?? null,
            overUnder: liveOdds?.total ?? existing?.overUnder ?? existing?.total ?? null,
            moneylineHome: liveOdds?.moneylineHome ?? existing?.moneylineHome ?? existing?.moneyline_home ?? null,
            moneylineAway: liveOdds?.moneylineAway ?? existing?.moneylineAway ?? existing?.moneyline_away ?? null,
            spread_1h_home: periodSpreadHomeLive ?? existing?.spread_1h_home ?? existing?.spread1HHome ?? null,
            spread_1h_away: periodSpreadAwayLive ?? existing?.spread_1h_away ?? existing?.spread1HAway ?? null,
            spread1HHome: periodSpreadHomeLive ?? existing?.spread1HHome ?? existing?.spread_1h_home ?? null,
            spread1HAway: periodSpreadAwayLive ?? existing?.spread1HAway ?? existing?.spread_1h_away ?? null,
            total_1h: periodTotalLive ?? existing?.total_1h ?? existing?.total1H ?? null,
            total1H: periodTotalLive ?? existing?.total1H ?? existing?.total_1h ?? null,
            moneyline_1h_home: periodMlHomeLive ?? existing?.moneyline_1h_home ?? existing?.moneyline1HHome ?? null,
            moneyline_1h_away: periodMlAwayLive ?? existing?.moneyline_1h_away ?? existing?.moneyline1HAway ?? null,
            moneyline1HHome: periodMlHomeLive ?? existing?.moneyline1HHome ?? existing?.moneyline_1h_home ?? null,
            moneyline1HAway: periodMlAwayLive ?? existing?.moneyline1HAway ?? existing?.moneyline_1h_away ?? null,
          };
          const mergedStatus = normalizeDisplayStatus(mergedBase.status);
          const merged = {
            ...mergedBase,
            status: mergedStatus,
          };
          if (
            merged.status !== existing.status ||
            merged.period !== existing.period ||
            merged.period_label !== existing.period_label ||
            merged.clock !== existing.clock ||
            merged.home_score !== existing.home_score ||
            merged.away_score !== existing.away_score ||
            merged.last_updated_at !== existing.last_updated_at ||
            JSON.stringify(merged.mlbLiveState ?? null) !== JSON.stringify(existing.mlbLiveState ?? null) ||
            merged.spread_home !== existing.spread_home ||
            merged.total !== existing.total ||
            merged.moneyline_home !== existing.moneyline_home ||
            merged.moneyline_away !== existing.moneyline_away ||
            merged.spread_1h_home !== existing.spread_1h_home ||
            merged.total_1h !== existing.total_1h ||
            merged.moneyline_1h_home !== existing.moneyline_1h_home ||
            merged.moneyline_1h_away !== existing.moneyline_1h_away
          ) {
            changed = true;
          }
          return merged;
        });
        return changed ? next : prev;
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [selectedDate]);

  const hasAnyRealOdds = useMemo(() => games.some((g) => Boolean(g.hasRealOdds)), [games]);

  const groupedBoardSections = useMemo(() => {
    const isCrossKeyFallbackActive = crossKeyFallbackForKey === activeDataKey;
    const applySportFilter = !isCrossKeyFallbackActive;
    const byGameId = new Map<string, Game>();
    for (const g of games) {
      const idKey = String(g.gameId || g.id || '').trim().toLowerCase();
      if (idKey) byGameId.set(idKey, g);
    }

    if (Array.isArray(boardSections) && boardSections.length > 0) {
      return boardSections
        .filter((section) => !applySportFilter || selectedSport === 'ALL' || String(section?.sport || '').toUpperCase() === selectedSport)
        .map((section) => {
          const sectionGames = (Array.isArray(section.cards) ? section.cards : [])
            .map((card) => {
              const key = String(card?.gameId || card?.id || '').trim().toLowerCase();
              const boardGame = mapBoardCardToGame(card);
              const liveGame = byGameId.get(key);
              if (!liveGame) return boardGame;
              const n = (value: unknown): number | null => {
                const num = Number(value);
                return Number.isFinite(num) ? num : null;
              };
              const boardOdds = boardGame.odds || {};
              const liveOdds = liveGame.odds || {};
              const boardPeriodSpread = n((boardOdds as any)?.spread1H);
              const boardPeriodTotal = n((boardOdds as any)?.total1H);
              const boardPeriodMlHome = n((boardOdds as any)?.ml1HHome);
              const boardPeriodMlAway = n((boardOdds as any)?.ml1HAway);
              const mergedOdds = {
                ...liveOdds,
                ...boardOdds,
                spread1H: boardPeriodSpread != null && boardPeriodSpread !== 0
                  ? boardPeriodSpread
                  : (n((liveOdds as any)?.spread1H) ?? null),
                total1H: boardPeriodTotal != null && boardPeriodTotal !== 0
                  ? boardPeriodTotal
                  : (n((liveOdds as any)?.total1H) ?? null),
                ml1HHome: boardPeriodMlHome != null && boardPeriodMlHome !== 0
                  ? boardPeriodMlHome
                  : (n((liveOdds as any)?.ml1HHome) ?? null),
                ml1HAway: boardPeriodMlAway != null && boardPeriodMlAway !== 0
                  ? boardPeriodMlAway
                  : (n((liveOdds as any)?.ml1HAway) ?? null),
              };
              return {
                ...liveGame,
                odds: mergedOdds,
                spread: boardGame.spread ?? liveGame.spread,
                overUnder: boardGame.overUnder ?? liveGame.overUnder,
                moneylineHome: boardGame.moneylineHome ?? liveGame.moneylineHome,
                moneylineAway: boardGame.moneylineAway ?? liveGame.moneylineAway,
              };
            })
            .filter(Boolean);
          return {
            sport: String(section.sport || '').toUpperCase(),
            label: String(section.label || section.sport || 'Sport'),
            count: sectionGames.length,
            games: sectionGames,
          };
        })
        .filter((section) => section.games.length > 0);
    }

    const grouped = new Map<string, Game[]>();
    for (const game of games) {
      const sportKey = String(game?.sport || '').toUpperCase();
      if (!sportKey) continue;
      if (applySportFilter && selectedSport !== 'ALL' && sportKey !== selectedSport) continue;
      const rows = grouped.get(sportKey) || [];
      rows.push(game);
      grouped.set(sportKey, rows);
    }
    const fallbackOrder = SPORT_FILTERS.map((entry) => entry.key).filter((key) => key !== 'ALL');
    const dynamicSports = Array.from(grouped.keys()).filter((sport) => !fallbackOrder.includes(sport)).sort();
    const orderedSports = [...fallbackOrder, ...dynamicSports];
    return orderedSports
      .map((sport) => {
        const sectionGames = grouped.get(sport) || [];
        if (!sectionGames.length) return null;
        return {
          sport,
          label: sport === 'SOCCER' ? 'Soccer' : sport,
          count: sectionGames.length,
          games: sectionGames,
        };
      })
      .filter((section): section is NonNullable<typeof section> => Boolean(section));
  }, [activeDataKey, boardSections, crossKeyFallbackForKey, games, selectedSport]);

  const filteredGames = useMemo(
    () => groupedBoardSections.flatMap((section) => section.games),
    [groupedBoardSections]
  );
  const liveBoardKey = selectedSport === 'ALL' ? 'odds-board-all' : `odds-board-${selectedSport}`;
  const liveDefaultVisibleCount = selectedSport === 'ALL' ? 12 : 10;
  const liveVisibleCount = showMoreSections[liveBoardKey] || liveDefaultVisibleCount;
  const visibleBoardGames = useMemo(
    () => groupedBoardSections.flatMap((section) => section.games.slice(0, liveVisibleCount)),
    [groupedBoardSections, liveVisibleCount]
  );
  const visibleLiveGameIds = useMemo(
    () =>
      new Set(
        visibleBoardGames
          .filter((game) => isLiveStatus(game.status))
          .map((game) => String(game.gameId || game.id || '').trim().toLowerCase())
          .filter(Boolean)
      ),
    [visibleBoardGames]
  );
  const liveLaneSports = useMemo(() => {
    const fast = new Set<string>();
    const mlb = new Set<string>();
    for (const game of visibleBoardGames) {
      const gameId = String(game.gameId || game.id || '').trim().toLowerCase();
      if (!gameId || !visibleLiveGameIds.has(gameId)) continue;
      const sportKey = normalizeSportForOddsPage(game.sport, game.league);
      if (!sportKey) continue;
      if (sportKey === 'MLB') mlb.add('MLB');
      else fast.add(sportKey);
    }
    return {
      fast: Array.from(fast),
      mlb: Array.from(mlb),
    };
  }, [visibleBoardGames, visibleLiveGameIds]);
  useEffect(() => {
    if (!liveLaneSports.fast.length || visibleLiveGameIds.size === 0) return;
    void refreshLiveCardsBySports(liveLaneSports.fast, visibleLiveGameIds, 'fast', 3_500);
    const interval = window.setInterval(() => {
      void refreshLiveCardsBySports(liveLaneSports.fast, visibleLiveGameIds, 'fast', 3_500);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [liveLaneSports.fast.join(','), refreshLiveCardsBySports, visibleLiveGameIds]);
  useEffect(() => {
    if (!liveLaneSports.mlb.length || visibleLiveGameIds.size === 0) return;
    void refreshLiveCardsBySports(liveLaneSports.mlb, visibleLiveGameIds, 'mlb', 12_000);
    const interval = window.setInterval(() => {
      void refreshLiveCardsBySports(liveLaneSports.mlb, visibleLiveGameIds, 'mlb', 12_000);
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [liveLaneSports.mlb.join(','), refreshLiveCardsBySports, visibleLiveGameIds]);
  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (Array.isArray(boardSections) && boardSections.length > 0) {
      for (const section of boardSections) {
        const key = String(section?.sport || '').toUpperCase();
        if (!key) continue;
        counts[key] = (Array.isArray(section?.cards) ? section.cards.length : 0);
      }
    } else {
      for (const game of games) {
        const key = String(game?.sport || '').toUpperCase();
        if (!key) continue;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    counts.ALL = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    return counts;
  }, [boardSections, games]);

  // Check if game is in watchboard - with defensive checks
  const isGameInWatchboard = useCallback((gameId: string) => {
    try {
      if (!boards || !Array.isArray(boards) || boards.length === 0) return false;
      return boards.some((wb: any) => {
        if (!wb || !wb.games || !Array.isArray(wb.games)) return false;
        return wb.games.some((g: any) => g && (g.gameId === gameId || g.id === gameId));
      });
    } catch {
      return false;
    }
  }, [boards]);

  // Handle watchboard click
  const handleWatchboardClick = useCallback((game: Game) => {
    setSelectedGame(game);
    setWatchboardModalOpen(true);
  }, []);

  // Get game summary for modal
  const getGameSummary = (game: Game) => {
    const homeAbbr = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam.abbr;
    const awayAbbr = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam.abbr;
    return `${awayAbbr} @ ${homeAbbr}`;
  };

  // Count live games (case-insensitive)
  const liveCount = useMemo(() => 
    filteredGames.filter(g => {
      return isLiveStatus(g.status);
    }).length
  , [filteredGames]);
  const dashboardSplitFeedByGame = useMemo(() => {
    if (!games.length || !Object.keys(splitFeedByGame).length) return {};
    const next: Record<string, TicketHandleSplitRow[]> = {};
    for (const game of games) {
      const rawGame = rawGames.find((row) => String(row?.game_id || row?.id || '') === game.gameId);
      const keys = rawGame ? buildGameJoinCandidates(rawGame) : buildOddsLookupCandidates(game.gameId || game.id);
      const matchedRows = keys
        .map((key) => splitFeedByGame[key])
        .find((rows) => Array.isArray(rows) && rows.length > 0);
      if (matchedRows) next[game.id] = matchedRows;
    }
    return next;
  }, [games, rawGames, splitFeedByGame]);
  const splitFeedGamesCount = useMemo(
    () => Object.values(dashboardSplitFeedByGame).filter((rows) => Array.isArray(rows) && rows.length > 0).length,
    [dashboardSplitFeedByGame]
  );
  const realOddsGamesCount = useMemo(
    () => games.filter((g) => g.hasRealOdds).length,
    [games]
  );
  const hasCoverageGap = useMemo(
    () => games.length > 0 && realOddsGamesCount === 0,
    [games.length, realOddsGamesCount]
  );
  const selectedDateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [selectedDate]
  );
  const showDebugTelemetry = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const debug = new URLSearchParams(window.location.search).get('debug');
    return debug === 'true' || debug === 'telemetry';
  }, []);
  const debugCoverageThresholdPct = useMemo(() => {
    if (typeof window === 'undefined') return 35;
    const raw = Number(new URLSearchParams(window.location.search).get('cov'));
    if (!Number.isFinite(raw)) return 35;
    return Math.max(5, Math.min(95, Math.round(raw)));
  }, []);

  const isActiveDataKeyLoaded = loadedDataKey === activeDataKey;
  const isActiveDataKeyPending = pendingDataKey === activeDataKey;
  const isCrossKeyFallbackActive = crossKeyFallbackForKey === activeDataKey;
  const exactKeyCachedBoard = readOddsPageSlateCache(buildOddsSlateCacheKey(activeDateParam, activeSportParam));
  const hasExactKeyCachedBoard = Boolean(
    exactKeyCachedBoard &&
    Array.isArray(exactKeyCachedBoard.boardSections) &&
    exactKeyCachedBoard.boardSections.length > 0
  );
  const hasRenderableSections = groupedBoardSections.some((section) => Array.isArray(section.games) && section.games.length > 0);
  const hasExactKeyBoardAvailable = hasExactKeyCachedBoard || (isActiveDataKeyLoaded && hasRenderableSections);
  const hasCrossKeyFallbackBoardAvailable = isCrossKeyFallbackActive && hasRenderableSections;
  const hasAnyRenderableBoard = hasExactKeyBoardAvailable || hasCrossKeyFallbackBoardAvailable;
  if (hasAnyRenderableBoard && !hasRenderedBoardRef.current) {
    hasRenderedBoardRef.current = true;
  }
  const shouldForceBoard = hasRenderedBoardRef.current && hasAnyRenderableBoard;
  const shouldShowBlockingLoader =
    !shouldForceBoard &&
    !hasAnyRenderableBoard &&
    (isActiveDataKeyPending || loading);
  const shouldShowBlockingError =
    !shouldForceBoard &&
    !hasAnyRenderableBoard &&
    Boolean(error);

  if (shouldShowBlockingLoader) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-slate-400 text-sm">Loading market intelligence...</p>
      </div>
    );
  }

  if (shouldShowBlockingError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-slate-200 text-lg font-bold">Failed to Load</p>
        <p className="text-slate-500 text-sm">{error || 'Network error loading games'}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            </div>
            <span className="truncate">Odds Intelligence</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {selectedDateLabel} slate · {filteredGames.length} games · {hasAnyRealOdds ? `${realOddsGamesCount} with verified lines` : 'markets opening'}
            {liveCount > 0 && <span className="text-red-400"> · {liveCount} live</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900/60 p-1">
            <button
              onClick={() => setSelectedDate((prev) => shiftDate(prev, -1))}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Prev
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-2.5 py-1.5 text-xs text-cyan-200 hover:text-cyan-100"
            >
              {selectedDateLabel}
            </button>
            <button
              onClick={() => setSelectedDate((prev) => shiftDate(prev, 1))}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Next
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "p-3 rounded-lg border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95",
              refreshing
                ? "bg-slate-800/50 border-slate-700/50 text-slate-500"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
            )}
          >
            <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Real Data Coverage */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Verified lines: <span className="text-cyan-300 font-semibold">{realOddsGamesCount}</span>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Market depth: <span className="text-emerald-300 font-semibold">{splitFeedGamesCount}</span>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Projection insights: <span className="text-amber-300 font-semibold">{projectionCoverage.count}</span>
        </span>
        {projectionCoverage.source === 'none' && projectionCoverage.fallbackReason && (
          <span className="text-[11px] text-slate-500">
            Projection model is warming up for this slate.
          </span>
        )}
      </div>

      {hasCoverageGap && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] text-amber-300">
            This slate is live, but books have not posted enough lines yet. We will keep updating automatically.
          </p>
        </div>
      )}

      {staleNotice && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
          <p className="text-[11px] text-cyan-200">{staleNotice}</p>
        </div>
      )}
      {showDebugTelemetry && (
        <OddsTelemetryDebugPanel
          pageKey="odds"
          gamesCount={games.length}
          oddsCoverageCount={realOddsGamesCount}
          staleNotice={staleNotice}
          isHydrating={loading || refreshing}
          cycleToken={refreshCycleCount}
          lowCoverageThresholdPct={debugCoverageThresholdPct}
        />
      )}

      {/* Sport Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {SPORT_FILTERS.map(sport => {
          const isActive = selectedSport === sport.key;
          const count = Number(sportCounts[sport.key] || 0);
          
          return (
            <button
              key={sport.key}
              onClick={() => setSelectedSport(sport.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                "min-h-[44px] active:scale-95", // Mobile touch target
                isActive
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-slate-800/40 text-slate-400 border border-slate-700/40 hover:border-slate-600/60 hover:text-slate-300"
              )}
            >
              <span>{sport.emoji}</span>
              <span>{sport.label}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                isActive ? "bg-cyan-500/30 text-cyan-200" : "bg-slate-700/50 text-slate-500"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Dashboard */}
      {filteredGames.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-4 py-16 rounded-2xl border border-slate-800/70 bg-slate-900/30">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-slate-400" />
          </div>
          <div className="space-y-1">
            <p className="text-slate-200 font-semibold">No odds match this view</p>
            <p className="text-slate-500 text-sm">
              Try another sport filter or refresh to pull the latest market feed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedSport !== 'ALL' && (
              <button
                onClick={() => setSelectedSport('ALL')}
                className="px-4 py-2 rounded-lg bg-slate-800/70 text-slate-300 text-sm font-medium hover:bg-slate-700/70 transition-colors"
              >
                View All Sports
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                refreshing
                  ? "bg-cyan-500/10 text-cyan-500 cursor-not-allowed"
                  : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
              )}
            >
              {refreshing ? "Refreshing..." : "Refresh Feed"}
            </button>
          </div>
        </div>
      ) : (
        <OddsIntelligenceDashboard
          games={filteredGames}
          groupedSections={groupedBoardSections}
          propsFeed={rawProps}
          projectionFeed={projectionFeed}
          splitFeedByGame={dashboardSplitFeedByGame}
          isGameInWatchboard={isGameInWatchboard}
          onWatchboardClick={handleWatchboardClick}
          selectedSport={selectedSport}
          showMoreSections={showMoreSections}
          setShowMoreSections={setShowMoreSections}
          modulesLoading={moduleFeedsLoading}
          propsLoading={propsLoading}
        />
      )}

      {/* Watchboard Modal */}
      {selectedGame && (
        <AddToWatchboardModal
          isOpen={watchboardModalOpen}
          onClose={() => {
            setWatchboardModalOpen(false);
            setSelectedGame(null);
          }}
          gameId={selectedGame.id}
          gameSummary={getGameSummary(selectedGame)}
          onSuccess={() => {
            setWatchboardModalOpen(false);
            setSelectedGame(null);
          }}
        />
      )}
    </div>
  );
}

export default OddsPage;
