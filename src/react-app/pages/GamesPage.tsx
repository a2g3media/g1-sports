/**
 * GamesPage - TODAY COMMAND CENTER
 * Premium watchboard layout: compact header, sport quick-jump, games by league
 */

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { RefreshCw, AlertCircle, ChevronDown, X, Zap, Star, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { LivePulseTicker } from '@/react-app/components/LivePulseTicker';
import { ApprovedScoreCardGame } from '@/react-app/components/ApprovedScoreCard';
import { CompactGameTile } from '@/react-app/components/CompactGameTile';
import { OddsIntelligenceDashboard } from '@/react-app/components/OddsIntelligenceDashboard';
import { useGlobalAI } from '@/react-app/components/GlobalAIProvider';
import { AVAILABLE_SPORTS } from '@/react-app/hooks/useScoreboard';
import { useWatchboards } from '@/react-app/hooks/useWatchboards';
// Direct fetch instead of useDataHub for reliability
import AddToWatchboardModal from '@/react-app/components/AddToWatchboardModal';
import { cn } from '@/react-app/lib/utils';
import { toGameDetailPath, toOddsGamePath } from '@/react-app/lib/gameRoutes';
import { fetchJsonCached, getFetchCacheStats } from '@/react-app/lib/fetchCache';
import { incrementPerfCounter, logPerfSnapshot, startPerfTimer } from '@/react-app/lib/perfTelemetry';
import { OddsTelemetryDebugPanel } from '@/react-app/components/debug/OddsTelemetryDebugPanel';
import { generateCoachWhisper as _generateCoachWhisper } from '@/react-app/lib/coachWhisper';
import { useFeatureFlags } from '@/react-app/hooks/useFeatureFlags';
import FavoriteEntityButton from '@/react-app/components/FavoriteEntityButton';
import { useFavorites } from '@/react-app/hooks/useFavorites';
// getTeamLogoUrl imported via teamLogos but unused currently
// import { getTeamLogoUrl } from '@/react-app/lib/teamLogos';

type StatusFilter = 'all' | 'live' | 'scheduled' | 'final';
type CommandTab = 'scores' | 'odds' | 'props';

// ============================================
// DATE-BASED GAMES CACHE - Instant date switching
// ============================================
const GAMES_CACHE_VERSION = 'v2';
const GAMES_CACHE_TTL = 120000; // 2 minutes - fresh enough for instant display

interface DateCachedGames {
  games: any[];
  timestamp: number;
}

function getDateCacheKey(dateStr: string, sport: string = 'ALL', includeOdds: boolean = false): string {
  return `gz_games_${GAMES_CACHE_VERSION}_${sport.toUpperCase()}_${includeOdds ? 'odds1' : 'odds0'}_${dateStr}`;
}

function loadCachedGamesForDate(
  dateStr: string,
  sport: string = 'ALL',
  maxAgeMs: number = GAMES_CACHE_TTL,
  includeOdds: boolean = false
): any[] | null {
  try {
    const cached = localStorage.getItem(getDateCacheKey(dateStr, sport, includeOdds));
    if (!cached) return null;
    const data: DateCachedGames = JSON.parse(cached);
    if (Date.now() - data.timestamp < maxAgeMs) {
      return data.games;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedGamesForDate(dateStr: string, games: any[], sport: string = 'ALL', includeOdds: boolean = false): void {
  try {
    const data: DateCachedGames = { games, timestamp: Date.now() };
    localStorage.setItem(getDateCacheKey(dateStr, sport, includeOdds), JSON.stringify(data));
    
    // Clean up old date caches (keep only last 20 entries across sports)
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('gz_games_'));
    if (allKeys.length > 20) {
      // Sort by key (older dates first) and remove oldest
      allKeys.sort();
      const keysToRemove = allKeys.slice(0, allKeys.length - 20);
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  } catch {
    // localStorage might be full or disabled
  }
}

type RouteSlateCacheEntry = {
  games: any[];
  updatedAt: number;
};

const routeSlateCache = new Map<string, RouteSlateCacheEntry>();
const ROUTE_SLATE_CACHE_TTL_MS = 5 * 60 * 1000;

function getRouteSlateCacheKey(dateStr: string, sport: string): string {
  return `${String(sport || 'ALL').toUpperCase()}|${dateStr}`;
}

function readRouteSlateCache(key: string, maxAgeMs = ROUTE_SLATE_CACHE_TTL_MS): any[] | null {
  const hit = routeSlateCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.updatedAt > maxAgeMs) {
    routeSlateCache.delete(key);
    return null;
  }
  return hit.games;
}

function writeRouteSlateCache(key: string, games: any[]): void {
  if (!Array.isArray(games) || games.length === 0) return;
  routeSlateCache.set(key, { games, updatedAt: Date.now() });
}

// Date utilities
const formatDateYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateYYYYMMDD = (str: string): Date | null => {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  if (isNaN(date.getTime())) return null;
  return date;
};

const getDateLabel = (date: Date, today: Date): string => {
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  const todayCopy = new Date(today);
  todayCopy.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((compareDate.getTime() - todayCopy.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const normalizeOddsGameId = (value: unknown): string => String(value || "").trim().toLowerCase();

const buildOddsLookupCandidates = (value: unknown): string[] => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normalizeOddsGameId(v);
    if (n) out.add(n);
  };
  add(raw);
  if (raw.startsWith("sr_")) {
    const parts = raw.split("_");
    const tail = parts.slice(2).join("_");
    if (tail) {
      add(`sr:sport_event:${tail.replace(/_/g, "-")}`);
      add(`sr:sport_event:${tail}`);
      add(`sr:match:${tail}`);
      add(tail);
      add(tail.replace(/_/g, "-"));
    }
  }
  if (raw.startsWith("sr:sport_event:")) {
    const tail = raw.replace("sr:sport_event:", "");
    add(tail);
    add(`sr_${tail.replace(/-/g, "_")}`);
    add(tail.replace(/-/g, "_"));
  }
  if (raw.startsWith("sr:match:")) {
    const tail = raw.replace("sr:match:", "");
    add(tail);
    add(`sr_${tail.replace(/-/g, "_")}`);
  }
  return Array.from(out);
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const oddsSummaryStrength = (summary: any): number => {
  if (!summary || typeof summary !== 'object') return 0;
  let score = 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? 1 : 0);
  score += n(summary?.spread?.home_line);
  score += n(summary?.total?.line);
  score += n(summary?.moneyline?.home_price) + n(summary?.moneyline?.away_price);
  score += n(summary?.first_half?.spread?.home_line) + n(summary?.first_half?.spread?.away_line);
  score += n(summary?.first_half?.total?.line);
  score += n(summary?.first_half?.moneyline?.home_price) + n(summary?.first_half?.moneyline?.away_price);
  score += n(summary?.opening_spread) + n(summary?.opening_total);
  return score;
};

const mergeOddsSummaryRecord = (
  prev: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> => {
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
};

const hasRenderableOddsSummary = (summary: any): boolean => oddsSummaryStrength(summary) > 0;

function getOddsSummaryCacheKey(dateStr: string): string {
  return `games:lastSummary:${dateStr}`;
}

function loadCachedOddsSummary(dateStr: string): Record<string, any> | null {
  try {
    const raw = sessionStorage.getItem(getOddsSummaryCacheKey(dateStr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveCachedOddsSummary(dateStr: string, summaries: Record<string, any>): void {
  try {
    const trimmed = Object.fromEntries(
      Object.entries(summaries)
        .filter(([, summary]) => hasRenderableOddsSummary(summary))
        .slice(0, 800)
    );
    sessionStorage.setItem(getOddsSummaryCacheKey(dateStr), JSON.stringify(trimmed));
  } catch {
    // ignore cache write failures
  }
}

const normalizeTeamToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const ymdPart = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const buildOddsMatchKey = (sport: unknown, home: unknown, away: unknown, startTime: unknown): string | null => {
  const s = String(sport || "").trim().toUpperCase();
  const h = normalizeTeamToken(home);
  const a = normalizeTeamToken(away);
  const d = ymdPart(startTime);
  if (!s || !h || !a) return null;
  return `match::${s}|${h}|${a}|${d || "nodate"}`;
};

const getGamesApiPath = (dateStr: string, sport: string, includeOdds: boolean = false): string => {
  const params = new URLSearchParams({ date: dateStr, includeOdds: includeOdds ? "1" : "0" });
  const normalizedSport = String(sport || "").trim().toUpperCase();
  if (normalizedSport && normalizedSport !== 'ALL') params.set('sport', normalizedSport);
  return `/api/games?${params.toString()}`;
};

// Sport validation - ALL is special, fetches from all sports
const validSportKeys = ['ALL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'SOCCER', 'MMA', 'GOLF'] as const;
type ExtendedSportKey = typeof validSportKeys[number];
const isValidSport = (s: string | null): s is ExtendedSportKey => 
  s !== null && (validSportKeys as readonly string[]).includes(s as typeof validSportKeys[number]);

// Sports list for dropdown - ALL first, PROPS special (navigates to /props page)
const DROPDOWN_SPORTS = [
  { key: 'ALL', label: 'All Sports', emoji: '🏆' },
  { key: 'NBA', label: 'NBA', emoji: '🏀' },
  { key: 'MLB', label: 'MLB', emoji: '⚾' },
  { key: 'NHL', label: 'NHL', emoji: '🏒' },
  { key: 'NCAAB', label: 'NCAAB', emoji: '🏀' },
  { key: 'SOCCER', label: 'Soccer', emoji: '⚽' },
  { key: 'MMA', label: 'MMA/UFC', emoji: '🥊' },
  { key: 'GOLF', label: 'Golf/PGA', emoji: '⛳' },
  { key: 'PROPS', label: 'Player Props', emoji: '🎯' },
] as const;

// National TV networks - games on these are considered Prime Time
const NATIONAL_TV_NETWORKS = [
  'ABC', 'ESPN', 'ESPN2', 'FOX', 'NBC', 'CBS', 'TNT', 'TBS', 
  'NFL NETWORK', 'NBA TV', 'MLB NETWORK', 'NHL NETWORK',
  'FS1', 'NBCSN', 'USA', 'PEACOCK', 'AMAZON', 'PRIME', 'ESPN+'
];

const isNationalTV = (channel: string | null | undefined): boolean => {
  if (!channel) return false;
  const ch = channel.toUpperCase();
  return NATIONAL_TV_NETWORKS.some(network => ch.includes(network));
};

// OddsCell - Premium sportsbook-style odds button (reserved for future table view)
// @ts-ignore - reserved for future use
interface _OddsCellProps {
  value: string | number | null | undefined;
  color: 'cyan' | 'amber' | 'emerald';
  isFavorite?: boolean;
}

// @ts-ignore - reserved for future use
const _OddsCell = ({ value, color, isFavorite }: _OddsCellProps) => {
  if (!value) {
    return (
      <div className="h-7 flex items-center justify-center">
        <span className="text-slate-600 text-xs">—</span>
      </div>
    );
  }
  
  const colorClasses = {
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20',
    emerald: isFavorite 
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25' 
      : 'bg-slate-700/30 border-slate-600/30 text-slate-300 hover:bg-slate-600/40',
  };
  
  return (
    <div className={cn(
      "h-7 px-2 flex items-center justify-center rounded border transition-colors cursor-pointer",
      colorClasses[color]
    )}>
      <span className="text-[11px] font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
};

// Soccer league options - available feed groupings
// @ts-ignore - reserved for future use
const _SOCCER_LEAGUES = [
  { code: 'ALL', label: 'All Leagues' },
  { code: 'EPL', label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { code: 'ESP', label: '🇪🇸 La Liga' },
  { code: 'MLS', label: '🇺🇸 MLS' },
  { code: 'UCL', label: '🏆 Champions League' },
] as const;

// NCAAB conference options (v2)
// @ts-ignore - reserved for future use
const _NCAAB_CONFERENCES = [
  { code: 'ALL', label: 'All Conferences' },
  { code: 'TOP25', label: '⭐ Top 25' },
  { code: 'ACC', label: 'ACC' },
  { code: 'BIG10', label: 'Big Ten' },
  { code: 'BIG12', label: 'Big 12' },
  { code: 'SEC', label: 'SEC' },
  { code: 'BIGEAST', label: 'Big East' },
  { code: 'PAC12', label: 'Pac-12' },
  { code: 'AAC', label: 'AAC' },
  { code: 'MWC', label: 'Mountain West' },
  { code: 'WCC', label: 'WCC' },
  { code: 'A10', label: 'Atlantic 10' },
  { code: 'CUSA', label: 'C-USA' },
  { code: 'MAC', label: 'MAC' },
  { code: 'SUNBELT', label: 'Sun Belt' },
  { code: 'SOCON', label: 'SoCon' },
  { code: 'IVY', label: 'Ivy League' },
  { code: 'MEAC', label: 'MEAC' },
  { code: 'SWAC', label: 'SWAC' },
  { code: 'MAAC', label: 'MAAC' },
  { code: 'HORIZON', label: 'Horizon' },
  { code: 'MVC', label: 'Missouri Valley' },
  { code: 'OVC', label: 'Ohio Valley' },
  { code: 'WAC', label: 'WAC' },
  { code: 'ASUN', label: 'ASUN' },
  { code: 'BIG SKY', label: 'Big Sky' },
  { code: 'CAA', label: 'CAA' },
  { code: 'SUMMIT', label: 'Summit' },
] as const;

// NCAAF conference options (Power 5 + Group of 5 + FCS)
// @ts-ignore - reserved for future use
const _NCAAF_CONFERENCES = [
  { code: 'ALL', label: 'All Conferences' },
  { code: 'TOP25', label: '⭐ Top 25' },
  // Power 5
  { code: 'ACC', label: 'ACC' },
  { code: 'BIG10', label: 'Big Ten' },
  { code: 'BIG12', label: 'Big 12' },
  { code: 'SEC', label: 'SEC' },
  { code: 'PAC12', label: 'Pac-12' },
  // Group of 5
  { code: 'AAC', label: 'AAC' },
  { code: 'MWC', label: 'Mountain West' },
  { code: 'CUSA', label: 'C-USA' },
  { code: 'MAC', label: 'MAC' },
  { code: 'SUNBELT', label: 'Sun Belt' },
  // FCS
  { code: 'CAA', label: 'CAA' },
  { code: 'MVFC', label: 'MO Valley (FCS)' },
  { code: 'BIG SKY', label: 'Big Sky' },
  { code: 'SOCON', label: 'SoCon' },
  { code: 'IVY', label: 'Ivy League' },
  { code: 'MEAC', label: 'MEAC' },
  { code: 'SWAC', label: 'SWAC' },
  { code: 'OVC', label: 'Ohio Valley' },
  { code: 'PATRIOT', label: 'Patriot' },
  { code: 'PIONEER', label: 'Pioneer' },
] as const;

// Sport Quick-Jump Chips (horizontal strip)
const SPORT_CHIPS = [
  { key: 'ALL', label: 'All' },
  { key: 'NBA', label: 'NBA' },
  { key: 'NHL', label: 'NHL' },
  { key: 'MLB', label: 'MLB' },
  { key: 'NCAAB', label: 'NCAAB' },
  { key: 'SOCCER', label: 'Soccer' },
  { key: 'MMA', label: 'MMA' },
  { key: 'GOLF', label: 'Golf' },
] as const;

function SportQuickJump({ 
  selected, 
  onSelect,
  sportCounts,
}: { 
  selected: ExtendedSportKey; 
  onSelect: (sport: ExtendedSportKey) => void;
  sportCounts: Record<string, number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  return (
    <div className="relative">
      <div 
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {SPORT_CHIPS.map((sport) => {
          const count = sport.key === 'ALL' 
            ? Object.values(sportCounts).reduce((a, b) => a + b, 0)
            : sportCounts[sport.key] || 0;
          const isSelected = selected === sport.key;
          
          return (
            <button
              key={sport.key}
              onClick={() => onSelect(sport.key as ExtendedSportKey)}
              className={cn(
                "group relative flex h-8 items-center gap-1 overflow-hidden rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap transition-all duration-200",
                "border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] active:scale-[0.995]",
                isSelected
                  ? "border-cyan-300/35 bg-cyan-500/14 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                  : "hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
              )}
            >
              <span>{sport.label}</span>
              {count > 0 && (
                <span className={cn(
                  "min-w-[18px] rounded-full border px-1.5 py-0.5 text-center text-[10px]",
                  isSelected
                    ? "border-cyan-300/35 bg-cyan-500/20 text-cyan-100"
                    : "border-white/12 bg-white/[0.03] text-[#9CA3AF]"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Date Modal Component
function DatePickerModal({ 
  isOpen, 
  onClose, 
  selected, 
  onSelect,
  today 
}: { 
  isOpen: boolean;
  onClose: () => void;
  selected: Date;
  onSelect: (date: Date) => void;
  today: Date;
}) {
  const [calendarDate, setCalendarDate] = useState(selected);
  
  // Quick pick options
  const quickPicks = [
    { label: 'Yesterday', date: addDays(today, -1) },
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
  ];
  
  // Next 7 days (excluding yesterday, today, tomorrow)
  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 2)).slice(0, 4);
  
  // Calendar helpers
  const calendarMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = calendarMonth.getDay();
  const monthLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const handleDateSelect = (date: Date) => {
    onSelect(date);
    onClose();
  };
  
  const prevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };
  
  const nextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-lg font-semibold text-white">Select Date</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Quick Picks */}
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Quick Select</p>
          <div className="flex gap-2">
            {quickPicks.map((pick) => {
              const isSelected = formatDateYYYYMMDD(selected) === formatDateYYYYMMDD(pick.date);
              return (
                <button
                  key={pick.label}
                  onClick={() => handleDateSelect(pick.date)}
                  className={cn(
                    "flex-1 py-3 sm:py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] active:scale-95",
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  {pick.label}
                </button>
              );
            })}
          </div>
          
          {/* Next 4 days */}
          <div className="flex gap-2 mt-2">
            {next7Days.map((date) => {
              const isSelected = formatDateYYYYMMDD(selected) === formatDateYYYYMMDD(date);
              const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <button
                  key={formatDateYYYYMMDD(date)}
                  onClick={() => handleDateSelect(date)}
                  className={cn(
                    "flex-1 py-2.5 sm:py-2 rounded-lg text-xs font-medium transition-all min-h-[40px] sm:min-h-0 active:scale-95",
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                  )}
                >
                  {label.split(',')[0]}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Calendar */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronDown className="w-5 h-5 rotate-90" />
            </button>
            <span className="text-sm font-medium text-white">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronDown className="w-5 h-5 -rotate-90" />
            </button>
          </div>
          
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="text-center text-xs text-slate-500 py-1">
                {day}
              </div>
            ))}
          </div>
          
          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before first of month */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-11 sm:h-9" />
            ))}
            
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
              const isSelected = formatDateYYYYMMDD(selected) === formatDateYYYYMMDD(date);
              const isToday = formatDateYYYYMMDD(today) === formatDateYYYYMMDD(date);
              
              return (
                <button
                  key={day}
                  onClick={() => handleDateSelect(date)}
                  className={cn(
                    "h-11 sm:h-9 rounded-lg text-sm font-medium transition-all active:scale-95",
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : isToday
                        ? "bg-slate-700 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function GamesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { openChat } = useGlobalAI();
  const { flags } = useFeatureFlags();
  const { isFavorite } = useFavorites();
  
  // Watchboard integration - with defensive checks
  const watchboardsResult = useWatchboards();
  const activeBoard = watchboardsResult?.activeBoard || null;
  
  // Pre-compute watchboard game IDs as Set for O(1) lookup (instant sport switching)
  const watchboardGameIdsSet = useMemo(() => {
    if (!activeBoard) return new Set<string>();
    const gameIds = (activeBoard as any).gameIds || [];
    return new Set<string>(gameIds);
  }, [activeBoard]);
  
  // Fast O(1) lookup function
  const isGameInWatchboard = useCallback((gameId: string): boolean => {
    return watchboardGameIdsSet.has(gameId);
  }, [watchboardGameIdsSet]);
  
  const [watchboardModal, setWatchboardModal] = useState<{ 
    open: boolean; 
    gameId: string; 
    gameSummary: string 
  }>({ open: false, gameId: '', gameSummary: '' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // @ts-ignore - reserved for watchboard integration
  const _handleWatchClick = (game: ApprovedScoreCardGame) => {
    const awayName = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
    const homeName = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
    const summary = `${awayName} @ ${homeName}`;
    setWatchboardModal({ open: true, gameId: game.id, gameSummary: summary });
  };
  
  // Date picker modal state
  const [dateModalOpen, setDateModalOpen] = useState(false);
  
  // Today reference - use user's local timezone
  // "Today" should be based on the user's device time, not forced to Eastern
  const today = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  
  // State initialized from URL (check window.location as fallback for iframe)
  // Default to 'ALL' for the best landing experience
  const [selectedSport, setSelectedSportState] = useState<ExtendedSportKey>(() => {
    // Try React Router first, then window.location.search as fallback
    let paramSport = searchParams.get('sport')?.toUpperCase();
    if (!paramSport) {
      const urlParams = new URLSearchParams(window.location.search);
      paramSport = urlParams.get('sport')?.toUpperCase() || undefined;
    }
    const normalized = paramSport === 'CBB' ? 'NCAAB' : paramSport === 'CFB' ? 'NCAAF' : paramSport;
    return (normalized && isValidSport(normalized)) ? (normalized as ExtendedSportKey) : 'ALL';
  });
  const [selectedDate, setSelectedDateState] = useState<Date>(() => {
    let dateStr = searchParams.get('date');
    if (!dateStr) {
      const urlParams = new URLSearchParams(window.location.search);
      dateStr = urlParams.get('date');
    }
    if (dateStr) {
      const parsed = parseDateYYYYMMDD(dateStr);
      if (parsed) return parsed;
    }
    return today;
  });
  
  // Sync state when URL changes
  useLayoutEffect(() => {
    // Try React Router first, then window.location.search as fallback
    let paramSport = searchParams.get('sport')?.toUpperCase();
    if (!paramSport) {
      const urlParams = new URLSearchParams(window.location.search);
      paramSport = urlParams.get('sport')?.toUpperCase() || undefined;
    }
    const normalized = paramSport === 'CBB' ? 'NCAAB' : paramSport === 'CFB' ? 'NCAAF' : paramSport;
    const sport = (normalized && isValidSport(normalized)) ? (normalized as ExtendedSportKey) : 'ALL';
    
    let dateStr = searchParams.get('date');
    if (!dateStr) {
      const urlParams = new URLSearchParams(window.location.search);
      dateStr = urlParams.get('date');
    }
    let date = today;
    if (dateStr) {
      const parsed = parseDateYYYYMMDD(dateStr);
      if (parsed) date = parsed;
    }
    
    setSelectedSportState(sport);
    setSelectedDateState(date);
  }, [searchParams, today]);
  
  // Mocha preview iframe workaround: re-check URL params periodically
  // (iframe may set URL params after initial React mount)
  useEffect(() => {
    const checkUrlParams = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paramSport = urlParams.get('sport')?.toUpperCase();
      const paramDate = urlParams.get('date');
      
      if (paramSport) {
        const normalized = paramSport === 'CBB' ? 'NCAAB' : paramSport === 'CFB' ? 'NCAAF' : paramSport;
        if (normalized && isValidSport(normalized)) {
          setSelectedSportState(prev => prev !== normalized ? normalized : prev);
        }
      }
      if (paramDate) {
        const parsed = parseDateYYYYMMDD(paramDate);
        if (parsed) {
          setSelectedDateState(prev => {
            if (formatDateYYYYMMDD(prev) !== formatDateYYYYMMDD(parsed)) return parsed;
            return prev;
          });
        }
      }
    };
    
    // Check at multiple intervals to handle various iframe timing scenarios
    // Extended timing for Mocha preview iframe which may delay URL param availability
    const timers = [0, 50, 150, 300, 500, 1000].map(delay => setTimeout(checkUrlParams, delay));
    return () => timers.forEach(t => clearTimeout(t));
  }, []); // Only run once on mount
  
  // Status filter - default to 'all' to show CompactGameTile grid
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [hasAutoFallback, setHasAutoFallback] = useState(false);
  // Read initial tab from URL params (supports /games?tab=odds from nav)
  const [activeTab, setActiveTab] = useState<CommandTab>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam === 'odds' || tabParam === 'props') return tabParam;
    return 'scores';
  });
  // Grid view removed - was causing crashes with 79+ MicroGameTile renders
  
  // Soccer league filter (only shown when sport is SOCCER)
  const [leagueFilter, setLeagueFilter] = useState<string>(() => {
    // Read initial league from URL params
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('league')?.toUpperCase() || 'ALL';
  });
  
  // NCAAB conference filter (only shown when sport is NCAAB)
  const [conferenceFilter, setConferenceFilter] = useState<string>(() => {
    // Read initial conference from URL params
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('conf')?.toUpperCase() || 'ALL';
  });
  
  // Direct fetch for games - same pattern as SportHubPage (which works correctly)
  const [rawGames, setRawGames] = useState<any[]>([]);
  const [oddsSummaryByGame, setOddsSummaryByGame] = useState<Record<string, {
    spread?: { home_line?: number | null };
    total?: { line?: number | null };
    moneyline?: { home_price?: number | null; away_price?: number | null };
    first_half?: {
      spread?: { home_line?: number | null };
      total?: { line?: number | null };
      moneyline?: { home_price?: number | null; away_price?: number | null };
    };
  }>>({});
  const [hubLoading, setHubLoading] = useState(true); // Only true on very first load
  // Removed isDateSwitching - now shows clear loading screen on date switch
  const [hubError, setHubError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef<{
    dateToFetch?: Date;
    forceRefresh: boolean;
    sportToFetch: ExtendedSportKey;
    includeOdds: boolean;
  } | null>(null);
  const currentDateRef = useRef<string>(''); // Track which date is currently displayed
  const currentGamesRef = useRef<any[]>([]);
  const mountedRef = useRef(true);
  const [oddsHydrating, setOddsHydrating] = useState(false);
  const oddsAutoRecoveryAttemptRef = useRef<string>('');
  
  useEffect(() => {
    // React strict mode runs effect cleanup/re-run in development.
    // Reset mounted so async fetch handlers can still commit state.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentGamesRef.current = rawGames;
  }, [rawGames]);
  
  // Fetch all games directly from API with date parameter
  // Uses cache for instant display, then fetches fresh data in background
  const fetchGames = useCallback(async (
    dateToFetch?: Date,
    forceRefresh = false,
    sportToFetch: ExtendedSportKey = 'ALL',
    includeOdds = false
  ) => {
    const fetchWithTimeout = async (input: string, timeoutMs = 8000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };
    const sleep = async (ms: number) => {
      if (ms <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, ms));
    };
    const readGamesWithRetry = async (
      path: string,
      timeoutMs = 8000,
      attempts = 3,
      retryDelaysMs: number[] = [1200, 2600],
      retryOnEmpty = false
    ): Promise<any[] | null> => {
      let lastResult: any[] | null = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const res = await fetchWithTimeout(path, timeoutMs);
          if (res.ok) {
            const data = await res.json();
            const games = Array.isArray(data?.games) ? data.games : [];
            if (games.length > 0) return games;
            if (!retryOnEmpty) return games;
            lastResult = games;
          }
        } catch {
          // Retry on transient failures.
        }
        if (attempt < attempts - 1) {
          await sleep(retryDelaysMs[attempt] ?? retryDelaysMs[retryDelaysMs.length - 1] ?? 0);
        }
      }
      return lastResult;
    };

    const dateStr = dateToFetch ? formatDateYYYYMMDD(dateToFetch) : formatDateYYYYMMDD(new Date());
    const todayStr = formatDateYYYYMMDD(new Date());
    const sportKey = (sportToFetch || 'ALL').toUpperCase();
    const isDateSwitch = Boolean(currentDateRef.current && currentDateRef.current !== dateStr);
    const allowDateAgnosticRescue = !isDateSwitch && sportKey === 'ALL' && dateStr === todayStr;
    const includeOddsForGames = false;
    const routeCacheKey = getRouteSlateCacheKey(dateStr, sportKey);
    const gamesPath = getGamesApiPath(dateStr, sportKey, includeOddsForGames);
    const hasOdds = (game: any): boolean => (
      game?.spread != null ||
      game?.overUnder != null ||
      game?.moneylineHome != null ||
      game?.moneylineAway != null ||
      game?.spread_home != null ||
      game?.total != null ||
      game?.moneyline_home != null ||
      game?.moneyline_away != null
    );
    const mergeGamesById = (rows: any[]): any[] => {
      const byId = new Map<string, any>();
      for (const row of rows) {
        const key = String(row?.game_id || row?.id || "").trim();
        if (!key) continue;
        const prev = byId.get(key);
        if (!prev) {
          byId.set(key, row);
          continue;
        }
        if (!hasOdds(prev) && hasOdds(row)) {
          byId.set(key, { ...prev, ...row });
        } else {
          byId.set(key, { ...row, ...prev });
        }
      }
      return Array.from(byId.values());
    };
    const countSports = (rows: any[]): number =>
      new Set(
        (Array.isArray(rows) ? rows : [])
          .map((g: any) => String(g?.sport || "").toUpperCase().trim())
          .filter((s: string) => s.length > 0)
      ).size;
    const shouldRejectCollapsedAllSportsPayload = (rows: any[]): boolean => {
      if (sportKey !== 'ALL') return false;
      const nextSports = countSports(rows);
      if (nextSports >= 2) return false;
      const currentSports = countSports(currentGamesRef.current);
      return currentSports >= 2;
    };
    const fetchGamesPayload = async (): Promise<any[] | null> => {
      const primaryAttempts = sportKey === 'ALL' ? 3 : 1;
      const primaryTimeoutMs = sportKey === 'ALL' ? 7000 : 3500;
      const primary = await readGamesWithRetry(gamesPath, primaryTimeoutMs, primaryAttempts, [1200, 2600], sportKey === 'ALL');
      if (Array.isArray(primary) && primary.length > 0) return primary;

      if (sportKey !== 'ALL') {
        return primary;
      }

      // Fallback to per-sport fanout only when all-sports feed is empty.
      const scopedSports = ['NBA', 'NHL', 'MLB', 'NCAAB', 'SOCCER', 'MMA', 'GOLF'] as const;
      const responses = await Promise.allSettled(
        scopedSports.map((scopedSport) => readGamesWithRetry(getGamesApiPath(dateStr, scopedSport, false), 5000, 1, [0], false))
      );
      const merged = mergeGamesById(
        responses
          .filter((r): r is PromiseFulfilledResult<any[] | null> => r.status === 'fulfilled')
          .flatMap((r) => (Array.isArray(r.value) ? r.value : []))
      );
      if (merged.length > 0) return merged;

      const noDateFallback = await readGamesWithRetry('/api/games?includeOdds=0', 9000, 2, [1200], true);
      return Array.isArray(noDateFallback) ? noDateFallback : [];
    };
    const rescueAllSportsGames = async (): Promise<any[] | null> =>
      readGamesWithRetry('/api/games?includeOdds=0', 12000, 3, [1200, 2400], true);

    // Never show a previous-date slate under the newly selected date.
    // If no cache exists for the requested date, clear list and show loading immediately.
    if (isDateSwitch) {
      const hasRouteCacheForDate = Boolean(readRouteSlateCache(routeCacheKey, ROUTE_SLATE_CACHE_TTL_MS)?.length);
      const hasLocalCacheForDate = Boolean(loadCachedGamesForDate(dateStr, sportKey, 15 * 60 * 1000, includeOddsForGames)?.length);
      if (!hasRouteCacheForDate && !hasLocalCacheForDate) {
        setRawGames([]);
        setHubLoading(true);
      }
    }
    
    // Check in-memory route cache first for instant in-session revisits.
    if (!forceRefresh) {
      const routeCachedGames = readRouteSlateCache(routeCacheKey, ROUTE_SLATE_CACHE_TTL_MS);
      if (routeCachedGames && routeCachedGames.length > 0) {
        setRawGames(routeCachedGames);
        setHubLoading(false);
        currentDateRef.current = dateStr;
        hasFetchedRef.current = true;
      }
    }

    // Check cache first for instant display (unless force refresh)
    if (!forceRefresh) {
      const cachedGames = loadCachedGamesForDate(dateStr, sportKey, GAMES_CACHE_TTL, includeOddsForGames);
      if (cachedGames && cachedGames.length > 0) {
        const shouldSkipCollapsedCache =
          sportKey === 'ALL' &&
          countSports(cachedGames) < 2 &&
          countSports(currentGamesRef.current) >= 2;
        if (!shouldSkipCollapsedCache) {
          setRawGames(cachedGames);
          setHubLoading(false);
          currentDateRef.current = dateStr;
          hasFetchedRef.current = true;
        }
        
        // If cache is fresh enough, don't fetch again
        // (loadCachedGamesForDate already checks TTL)
        // But still fetch in background to update cache
        if (!isFetchingRef.current) {
          isFetchingRef.current = true;
          // Background fetch - don't set loading state
          fetchGamesPayload()
            .then((gamesArray) => {
              if (gamesArray && gamesArray.length > 0) {
                if (shouldRejectCollapsedAllSportsPayload(gamesArray)) return;
                setRawGames(gamesArray);
                writeRouteSlateCache(routeCacheKey, gamesArray);
                saveCachedGamesForDate(dateStr, gamesArray, sportKey, includeOddsForGames);
              }
            })
            .catch(() => {})
            .finally(() => { isFetchingRef.current = false; });
        }
        if (!(
          sportKey === 'ALL' &&
          countSports(cachedGames) < 2 &&
          countSports(currentGamesRef.current) >= 2
        )) {
          return;
        }
      }
    }

    // Use stale cache to avoid blank/sluggish UX while network catches up.
    const staleCachedGames = loadCachedGamesForDate(dateStr, sportKey, 15 * 60 * 1000, includeOddsForGames);
    if (!forceRefresh && staleCachedGames && staleCachedGames.length > 0) {
      const shouldSkipCollapsedStaleCache =
        sportKey === 'ALL' &&
        countSports(staleCachedGames) < 2 &&
        countSports(currentGamesRef.current) >= 2;
      if (!shouldSkipCollapsedStaleCache) {
        setRawGames(staleCachedGames);
        setHubLoading(false);
        currentDateRef.current = dateStr;
        hasFetchedRef.current = true;
      }
    }
    
    // No cache - fetch with clear loading state
    if (isFetchingRef.current) {
      pendingFetchRef.current = { dateToFetch, forceRefresh, sportToFetch, includeOdds };
      // On date switches, keep loading state so users don't see stale previous-date slate.
      if (isDateSwitch) {
        setRawGames([]);
        setHubLoading(true);
      } else if (!hasFetchedRef.current) {
        // Prevent indefinite loading when overlapping requests occur.
        setHubLoading(false);
      }
      return;
    }
    isFetchingRef.current = true;
    const stopPerf = startPerfTimer('games.fetch');
    
    try {
      setHubError(null);
      setStaleNotice(null);
      // Keep current slate visible while refreshing unless nothing is loaded yet.
      setHubLoading(currentGamesRef.current.length === 0);
      
      const gamesArray = await fetchGamesPayload();
      if (Array.isArray(gamesArray)) {
        if (gamesArray.length > 0) {
          if (!shouldRejectCollapsedAllSportsPayload(gamesArray)) {
            setRawGames(gamesArray);
            currentDateRef.current = dateStr;
            writeRouteSlateCache(routeCacheKey, gamesArray);
            saveCachedGamesForDate(dateStr, gamesArray, sportKey, includeOddsForGames);
            hasFetchedRef.current = true;
            setStaleNotice(null);
          }
        } else if (isDateSwitch) {
          setRawGames([]);
          setHubError(null);
          setStaleNotice(null);
          hasFetchedRef.current = true;
        } else if (currentGamesRef.current.length > 0) {
          incrementPerfCounter('games.staleProtected');
          setStaleNotice('Refreshing schedule feed - showing last known valid slate.');
        } else {
          const routeFallback = readRouteSlateCache(routeCacheKey, ROUTE_SLATE_CACHE_TTL_MS);
          if (routeFallback && routeFallback.length > 0) {
            setRawGames(routeFallback);
            setStaleNotice('Refreshing schedule feed - showing last known valid slate.');
            hasFetchedRef.current = true;
          } else if (allowDateAgnosticRescue) {
            const rescue = await rescueAllSportsGames();
            if (Array.isArray(rescue) && rescue.length > 0) {
              setRawGames(rescue);
              writeRouteSlateCache(routeCacheKey, rescue);
              saveCachedGamesForDate(dateStr, rescue, 'ALL', includeOddsForGames);
              setStaleNotice('Using last available all-sports slate while the date feed refreshes.');
              hasFetchedRef.current = true;
            } else {
              setHubError('No games available yet for this slate');
            }
          } else {
            setRawGames([]);
            setHubError('No games available for selected date');
            setStaleNotice(null);
          }
        }
      } else {
        if (isDateSwitch) {
          setRawGames([]);
          setHubError('Failed to load selected date');
          setStaleNotice(null);
        } else if (currentGamesRef.current.length === 0) {
          const routeFallback = readRouteSlateCache(routeCacheKey, ROUTE_SLATE_CACHE_TTL_MS);
          if (routeFallback && routeFallback.length > 0) {
            setRawGames(routeFallback);
            setStaleNotice('Refreshing schedule feed - showing last known valid slate.');
            hasFetchedRef.current = true;
          } else if (allowDateAgnosticRescue) {
            const rescue = await rescueAllSportsGames();
            if (Array.isArray(rescue) && rescue.length > 0) {
              setRawGames(rescue);
              writeRouteSlateCache(routeCacheKey, rescue);
              saveCachedGamesForDate(dateStr, rescue, 'ALL', includeOddsForGames);
              setStaleNotice('Using last available all-sports slate while the date feed refreshes.');
              hasFetchedRef.current = true;
            } else {
              setHubError('Failed to load games');
            }
          } else {
            setRawGames([]);
            setHubError('Failed to load selected date');
            setStaleNotice(null);
          }
        } else {
          incrementPerfCounter('games.staleProtected');
          setStaleNotice('Refreshing schedule feed - showing last known valid slate.');
        }
      }
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      console.error('[GamesPage] Fetch error:', err);
      if (isDateSwitch) {
        setRawGames([]);
        setHubError('Network error loading selected date');
        setStaleNotice(null);
      } else if (currentGamesRef.current.length === 0) {
        const routeFallback = readRouteSlateCache(routeCacheKey, ROUTE_SLATE_CACHE_TTL_MS);
        if (routeFallback && routeFallback.length > 0) {
          setRawGames(routeFallback);
          setStaleNotice('Network issue - showing last known valid slate while we retry.');
          hasFetchedRef.current = true;
        } else if (allowDateAgnosticRescue) {
          const rescue = await rescueAllSportsGames();
          if (Array.isArray(rescue) && rescue.length > 0) {
            setRawGames(rescue);
            writeRouteSlateCache(routeCacheKey, rescue);
            saveCachedGamesForDate(dateStr, rescue, 'ALL', includeOddsForGames);
            setStaleNotice('Using last available all-sports slate while connectivity stabilizes.');
            hasFetchedRef.current = true;
          } else {
            setHubError('Network error loading games');
          }
        } else {
          setRawGames([]);
          setHubError('Network error loading selected date');
          setStaleNotice(null);
        }
      } else {
        incrementPerfCounter('games.staleProtected');
        setStaleNotice('Network issue - showing last known valid slate while we retry.');
      }
    } finally {
      stopPerf();
      console.debug('[GamesPage][fetch-cache]', getFetchCacheStats());
      logPerfSnapshot('GamesPage');
      // Always release fetch lock, even during strict-mode effect cleanup cycles.
      isFetchingRef.current = false;
      currentDateRef.current = dateStr;
      if (mountedRef.current) {
        setHubLoading(false);
        setRefreshCycleCount((v) => v + 1);
      }
      const pending = pendingFetchRef.current;
      if (pending) {
        pendingFetchRef.current = null;
        void fetchGames(pending.dateToFetch, pending.forceRefresh, pending.sportToFetch, pending.includeOdds);
      }
    }
  }, []);
  
  // Pre-fetch adjacent dates in background for instant switching
  const prefetchAdjacentDates = useCallback((baseDate: Date, sportToFetch: ExtendedSportKey = 'ALL') => {
    const sportKey = (sportToFetch || 'ALL').toUpperCase();
    const yesterday = new Date(baseDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const datesToPrefetch = [yesterday, tomorrow];
    
    // Stagger prefetch requests to avoid overwhelming the API
    datesToPrefetch.forEach((date, index) => {
      const dateStr = formatDateYYYYMMDD(date);
      // Skip if already cached
      const cached = loadCachedGamesForDate(dateStr, sportKey, GAMES_CACHE_TTL, false);
      if (cached && cached.length > 0) return;
      
      // Prefetch with delay to not compete with main request
      setTimeout(() => {
        fetchJsonCached<any>(getGamesApiPath(dateStr, sportKey, false), {
          cacheKey: `games:prefetch:${sportKey}:${dateStr}`,
          ttlMs: 10000,
          timeoutMs: 7000,
        })
          .then((data) => {
            if (data?.games) {
              saveCachedGamesForDate(dateStr, data.games, sportKey, false);
            }
          })
          .catch(() => {});
      }, 2000 + (index * 1500)); // 2s delay, then 1.5s between requests
    });
  }, []);
  
  // Initial fetch and refetch when date changes
  useEffect(() => {
    fetchGames(selectedDate, false, selectedSport, activeTab === 'odds');
  }, [activeTab, fetchGames, selectedDate, selectedSport]);
  
  // Pre-fetch adjacent dates after initial load completes
  useEffect(() => {
    if (!hubLoading && rawGames.length > 0 && selectedDate && selectedSport !== 'ALL') {
      prefetchAdjacentDates(selectedDate, selectedSport);
    }
  }, [hubLoading, rawGames.length, selectedDate, selectedSport, prefetchAdjacentDates]);

  const selectedDateStr = useMemo(() => formatDateYYYYMMDD(selectedDate), [selectedDate]);

  useEffect(() => {
    const cached = loadCachedOddsSummary(selectedDateStr);
    if (!cached || Object.keys(cached).length === 0) return;
    setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, cached));
  }, [selectedDateStr]);

  useEffect(() => {
    if (rawGames.length === 0) return;

    const hasRawOdds = (game: any): boolean =>
      game?.spread != null ||
      game?.spread_home != null ||
      game?.overUnder != null ||
      game?.total != null ||
      game?.moneylineHome != null ||
      game?.moneylineAway != null ||
      game?.moneyline_home != null ||
      game?.moneyline_away != null;

    const hasSummaryOdds = (game: any): boolean => {
      const gameId = String(game?.game_id || game?.id || '').trim();
      const idSummary = buildOddsLookupCandidates(gameId)
        .map((candidate) => oddsSummaryByGame[candidate])
        .find((summary) => hasRenderableOddsSummary(summary));
      if (idSummary) return true;
      const sportKey = String(game?.sport || '').toUpperCase();
      const matchupCandidates = [
        buildOddsMatchKey(sportKey, game?.home_team_code, game?.away_team_code, game?.start_time),
        buildOddsMatchKey(sportKey, game?.home_team_name, game?.away_team_name, game?.start_time),
        buildOddsMatchKey(sportKey, game?.home_team_code || game?.home_team_name, game?.away_team_code || game?.away_team_name, game?.start_time),
      ].filter((key): key is string => Boolean(key));
      return matchupCandidates.some((candidate) => hasRenderableOddsSummary(oddsSummaryByGame[candidate]));
    };

    const coverageCount = rawGames.reduce((count, game) => count + ((hasRawOdds(game) || hasSummaryOdds(game)) ? 1 : 0), 0);
    const coverageRatio = rawGames.length > 0 ? coverageCount / rawGames.length : 0;
    const shouldHydrate =
      activeTab === 'odds' ||
      coverageRatio < 0.6;

    if (!shouldHydrate) return;
    incrementPerfCounter('games.guardrail.coverageHydration');

    let cancelled = false;
    setOddsHydrating(true);
    void (async () => {
      try {
        const byId: Record<string, {
          spread?: { home_line?: number | null };
          total?: { line?: number | null };
          moneyline?: { home_price?: number | null; away_price?: number | null };
          first_half?: {
            spread?: { home_line?: number | null };
            total?: { line?: number | null };
            moneyline?: { home_price?: number | null; away_price?: number | null };
          };
          game?: {
            game_id?: string;
            sport?: string;
            home_team_code?: string;
            away_team_code?: string;
            home_team_name?: string;
            away_team_name?: string;
            start_time?: string;
          };
        }> = {};

        const addSummary = (s: any) => {
          const nextStrength = oddsSummaryStrength(s);
          if (nextStrength <= 0) return;

          const gameId = String(s?.game?.game_id || s?.game_id || s?.game?.id || '').trim();
          if (gameId) {
            for (const candidate of buildOddsLookupCandidates(gameId)) {
              const prevSummary = byId[candidate];
              if (!prevSummary || nextStrength >= oddsSummaryStrength(prevSummary)) {
                byId[candidate] = s;
              }
            }
          }
          const summarySport = String(s?.game?.sport || '').trim().toUpperCase();
          const summaryHomeCode = String(s?.game?.home_team_code || '').trim();
          const summaryAwayCode = String(s?.game?.away_team_code || '').trim();
          const summaryHomeName = String(s?.game?.home_team_name || '').trim();
          const summaryAwayName = String(s?.game?.away_team_name || '').trim();
          const summaryStart = String(s?.game?.start_time || '').trim();
          const matchKeys = [
            buildOddsMatchKey(summarySport, summaryHomeCode, summaryAwayCode, summaryStart),
            buildOddsMatchKey(summarySport, summaryHomeName, summaryAwayName, summaryStart),
            buildOddsMatchKey(summarySport, summaryHomeCode || summaryHomeName, summaryAwayCode || summaryAwayName, summaryStart),
            buildOddsMatchKey(summarySport, summaryHomeCode, summaryAwayCode, ''),
            buildOddsMatchKey(summarySport, summaryHomeName, summaryAwayName, ''),
          ].filter((key): key is string => Boolean(key));
          for (const key of matchKeys) {
            const prevSummary = byId[key];
            if (!prevSummary || nextStrength >= oddsSummaryStrength(prevSummary)) {
              byId[key] = s;
            }
          }
        };

        const requestedIds = rawGames
          .map((g: any) => String(g?.game_id || g?.id || '').trim())
          .filter((id: string) => id.length > 0)
          .slice(0, 80);

        // Primary path: batch odds summaries by game ids (single bundled path, chunked).
        const chunks: string[][] = [];
        for (let i = 0; i < requestedIds.length; i += 30) {
          chunks.push(requestedIds.slice(i, i + 30));
        }

        const chunkResponses = await Promise.allSettled(
          chunks.map(async (chunkIds, idx) => {
            const qs = new URLSearchParams({
              game_ids: chunkIds.join(','),
              scope: 'PROD',
              date: selectedDateStr,
            });
            const payload = await fetchJsonCached<any>(`/api/odds/slate?${qs.toString()}`, {
              cacheKey: `games:odds:slate:chunk:${selectedDateStr}:${idx}:${chunkIds.join('|')}`,
              ttlMs: 6000,
              timeoutMs: 12000,
              init: { credentials: 'include' },
            });
            return Array.isArray(payload?.summaries) ? payload.summaries : [];
          })
        );

        for (const response of chunkResponses) {
          if (response.status !== 'fulfilled') continue;
          for (const s of response.value) addSummary(s);
        }

        // Fallback path: if bundled coverage is weak, fan out by sport once.
        const sports = Array.from(new Set(
          rawGames
            .map((g: any) => String(g?.sport || '').toUpperCase().trim())
            .filter((s: string) => s.length > 0)
        ));
        const coveredRequested = requestedIds.filter((id) => Boolean(byId[id])).length;
        const needsSportFallback = sports.length > 0 && coveredRequested < Math.min(requestedIds.length, 10) / 2;

        if (needsSportFallback) {
          incrementPerfCounter('games.guardrail.sportFallback');
          const responses = await Promise.allSettled(
            sports.map(async (sport) => {
              const qs = new URLSearchParams({ sport, scope: 'PROD', date: selectedDateStr });
              const payload = await fetchJsonCached<any>(`/api/odds/slate?${qs.toString()}`, {
                cacheKey: `games:odds:slate:sport:${sport}:${selectedDateStr}`,
                ttlMs: 6000,
                timeoutMs: 12000,
                init: { credentials: 'include' },
              });
              return Array.isArray(payload?.summaries) ? payload.summaries : [];
            })
          );
          for (const response of responses) {
            if (response.status !== 'fulfilled') continue;
            for (const s of response.value) addSummary(s);
          }
        }

        // Last-resort fallback: per-game summary when slate payloads are weak.
        const coveredAfterSlate = requestedIds.filter((id) => Boolean(byId[id])).length;
        if (coveredAfterSlate < Math.max(1, Math.floor(requestedIds.length * 0.6))) {
          incrementPerfCounter('games.guardrail.perGameFallback');
          const unresolvedIds = requestedIds.filter((id) => !byId[id]).slice(0, 24);
          const summaryResponses = await Promise.allSettled(
            unresolvedIds.map(async (id) => {
              const payload = await fetchJsonCached<any>(`/api/odds/summary/${encodeURIComponent(id)}?scope=PROD`, {
                cacheKey: `games:odds:summary:${id}`,
                ttlMs: 6000,
                timeoutMs: 5000,
                init: { credentials: 'include' },
              });
              return payload || null;
            })
          );
          for (const response of summaryResponses) {
            if (response.status !== 'fulfilled' || !response.value) continue;
            addSummary(response.value);
          }
        }

        if (!cancelled && Object.keys(byId).length > 0) {
          setOddsSummaryByGame((prev) => {
            const merged = mergeOddsSummaryRecord(prev, byId);
            saveCachedOddsSummary(selectedDateStr, merged);
            return merged;
          });
        }
      } catch {
        // Keep existing odds summary on background failure.
      } finally {
        if (!cancelled) setOddsHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, rawGames, selectedDateStr]);
  
  // Refresh function - force bypass cache
  const hubRefresh = useCallback(async () => {
    await fetchGames(selectedDate, true, selectedSport, activeTab === 'odds'); // forceRefresh = true
  }, [activeTab, fetchGames, selectedDate, selectedSport]);
  
  // Transform raw API games to LiveGame-like format
  const hubGames = useMemo(() => {
    return rawGames.map((game: any) => {
      const sportKey = (game.sport || 'NBA').toUpperCase();
        const gameId = game.game_id || game.id || `gen_${sportKey}_${game.home_team_code}_${game.away_team_code}_${game.start_time}`;
        const idSummary = buildOddsLookupCandidates(gameId)
          .map((candidate) => oddsSummaryByGame[candidate])
          .find(Boolean);
        const matchupCandidates = [
          buildOddsMatchKey(sportKey, game.home_team_code, game.away_team_code, game.start_time),
          buildOddsMatchKey(sportKey, game.home_team_name, game.away_team_name, game.start_time),
          buildOddsMatchKey(sportKey, game.home_team_code || game.home_team_name, game.away_team_code || game.away_team_name, game.start_time),
          buildOddsMatchKey(sportKey, game.home_team_code, game.away_team_code, ""),
          buildOddsMatchKey(sportKey, game.home_team_name, game.away_team_name, ""),
        ].filter((key): key is string => Boolean(key));
        const matchupSummary = matchupCandidates.map((candidate) => oddsSummaryByGame[candidate]).find(Boolean);
        const summary = idSummary || matchupSummary;
      return {
        id: gameId,
        sport: sportKey,
        homeTeam: {
          name: game.home_team_name || game.home_team_code || 'TBD',
          abbreviation: game.home_team_code || 'TBD',
          score: game.home_score ?? null,
        },
        awayTeam: {
          name: game.away_team_name || game.away_team_code || 'TBD',
          abbreviation: game.away_team_code || 'TBD',
          score: game.away_score ?? null,
        },
        status: game.status || 'SCHEDULED',
        period: game.period || null,
        clock: game.clock || null,
        startTime: game.start_time || null,
        channel: game.channel || null,
        isOvertime: game.is_overtime || false,
        odds: {
          spreadHome: toFiniteNumberOrNull(summary?.spread?.home_line ?? game.spread_home ?? game.spread),
          total: toFiniteNumberOrNull(summary?.total?.line ?? game.total ?? game.overUnder),
          moneylineHome: toFiniteNumberOrNull(summary?.moneyline?.home_price ?? game.moneyline_home ?? game.moneylineHome),
          moneylineAway: toFiniteNumberOrNull(summary?.moneyline?.away_price ?? game.moneyline_away ?? game.moneylineAway),
          spread1HHome: toFiniteNumberOrNull(summary?.first_half?.spread?.home_line ?? game.spread_1h_home ?? game.spread1HHome),
          total1H: toFiniteNumberOrNull(summary?.first_half?.total?.line ?? game.total_1h ?? game.total1H),
          moneyline1HHome: toFiniteNumberOrNull(summary?.first_half?.moneyline?.home_price ?? game.moneyline_1h_home ?? game.moneyline1HHome),
          moneyline1HAway: toFiniteNumberOrNull(summary?.first_half?.moneyline?.away_price ?? game.moneyline_1h_away ?? game.moneyline1HAway),
        },
      };
    });
  }, [rawGames, oddsSummaryByGame]);
  
  // Data state
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const [refreshCycleCount, setRefreshCycleCount] = useState(0);
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

  // NCAAB/NCAAF team data for conference/ranking filtering
  type TeamLookup = Record<string, { conference?: string; apRank?: number | null }>;
  const [ncaabTeamLookup] = useState<TeamLookup>({});
  const [ncaafTeamLookup] = useState<TeamLookup>({});
  
  // Pagination state - how many games to show per section
  const [showMoreSections, setShowMoreSections] = useState<Record<string, number>>({});
  
  // Use refs for values that shouldn't trigger refetch loops
  const statusFilterRef = useRef(statusFilter);
  const hasAutoFallbackRef = useRef(hasAutoFallback);
  
  // Keep refs in sync
  useEffect(() => { statusFilterRef.current = statusFilter; }, [statusFilter]);
  useEffect(() => { hasAutoFallbackRef.current = hasAutoFallback; }, [hasAutoFallback]);

  // Transform hub games to ApprovedScoreCardGame format with defensive checks
  const games = useMemo<ApprovedScoreCardGame[]>(() => {
    if (!hubGames || !Array.isArray(hubGames) || hubGames.length === 0) return [];
    
    const currentNcaabLookup = ncaabTeamLookup;
    const currentNcaafLookup = ncaafTeamLookup;
    
    try {
      return hubGames
        .filter(g => g && typeof g === 'object' && g.id) // Filter out invalid entries
        .map((g) => {
          // Safely extract team info
          const homeTeam = g.homeTeam || {};
          const awayTeam = g.awayTeam || {};
          const homeAbbr = typeof homeTeam === 'string' ? homeTeam : (homeTeam.abbreviation || homeTeam.name || 'TBD');
          const awayAbbr = typeof awayTeam === 'string' ? awayTeam : (awayTeam.abbreviation || awayTeam.name || 'TBD');
          const homeName = typeof homeTeam === 'string' ? homeTeam : (homeTeam.name || homeAbbr);
          const awayName = typeof awayTeam === 'string' ? awayTeam : (awayTeam.name || awayAbbr);
          const homeScore = typeof homeTeam === 'object' ? (homeTeam.score ?? null) : null;
          const awayScore = typeof awayTeam === 'object' ? (awayTeam.score ?? null) : null;
          
          // Generate consistent public betting percentages based on game id
          const gameIdHash = String(g.id || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
          const homePercent = 45 + (gameIdHash % 20); // 45-64%
          const awayPercent = 100 - homePercent;
          
          // Get NCAAB/NCAAF rankings from team lookup
          const sport = g.sport || '';
          const teamLookup = sport === 'NCAAF' ? currentNcaafLookup : currentNcaabLookup;
          const homeRank = teamLookup[homeAbbr]?.apRank ?? null;
          const awayRank = teamLookup[awayAbbr]?.apRank ?? null;
          
          // Safely determine status
          const rawStatus = g.status || 'SCHEDULED';
          const statusStr = typeof rawStatus === 'string' ? rawStatus : 'SCHEDULED';
          const normalizedStatus = (statusStr === 'IN_PROGRESS' ? 'LIVE' : statusStr) as 'LIVE' | 'FINAL' | 'SCHEDULED';
          
          return {
            id: g.id || `game-${Math.random()}`,
            gameId: g.id || '',
            sport: g.sport || 'NBA',
            league: undefined,
            homeTeam: {
              abbr: homeAbbr,
              name: homeName,
              rank: homeRank ?? undefined,
            },
            awayTeam: {
              abbr: awayAbbr,
              name: awayName,
              rank: awayRank ?? undefined,
            },
            homeScore,
            awayScore,
            status: normalizedStatus,
            startTime: g.startTime || undefined,
            period: g.period || undefined,
            clock: g.clock || undefined,
            spread: g.odds?.spreadHome ?? undefined,
            overUnder: g.odds?.total ?? undefined,
            moneylineHome: g.odds?.moneylineHome ?? undefined,
            moneylineAway: g.odds?.moneylineAway ?? undefined,
            odds: {
              spread: g.odds?.spreadHome ?? undefined,
              spreadHome: g.odds?.spreadHome ?? undefined,
              total: g.odds?.total ?? undefined,
              overUnder: g.odds?.total ?? undefined,
              mlHome: g.odds?.moneylineHome ?? undefined,
              homeML: g.odds?.moneylineHome ?? undefined,
              mlAway: g.odds?.moneylineAway ?? undefined,
              awayML: g.odds?.moneylineAway ?? undefined,
              spread1HHome: g.odds?.spread1HHome ?? undefined,
              total1H: g.odds?.total1H ?? undefined,
              moneyline1HHome: g.odds?.moneyline1HHome ?? undefined,
              moneyline1HAway: g.odds?.moneyline1HAway ?? undefined,
            },
            publicBetting: {
              homePercent,
              awayPercent,
              totalBets: Math.floor(1000 + (gameIdHash % 5000)),
            },
            trending: (gameIdHash % 10) > 7,
          };
        });
    } catch (err) {
      console.error('[GamesPage] Error transforming games:', err);
      return [];
    }
  }, [hubGames, ncaabTeamLookup, ncaafTeamLookup]);

  const realOddsGameCount = useMemo(() => {
    return games.reduce((count, game) => {
      const hasOdds =
        game.spread != null ||
        game.overUnder != null ||
        game.moneylineHome != null ||
        game.moneylineAway != null ||
        game.odds?.spread != null ||
        game.odds?.total != null ||
        game.odds?.mlHome != null ||
        game.odds?.mlAway != null;
      return count + (hasOdds ? 1 : 0);
    }, 0);
  }, [games]);

  useEffect(() => {
    if (hubLoading || refreshing || oddsHydrating) return;
    if (games.length === 0) return;
    if (realOddsGameCount > 0) return;
    const recoveryKey = `${selectedDateStr}|${selectedSport}|${activeTab}`;
    if (oddsAutoRecoveryAttemptRef.current === recoveryKey) return;
    oddsAutoRecoveryAttemptRef.current = recoveryKey;
    const timer = window.setTimeout(() => {
      incrementPerfCounter('games.guardrail.autoRecovery');
      void hubRefresh();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    games.length,
    hubLoading,
    hubRefresh,
    oddsHydrating,
    realOddsGameCount,
    refreshing,
    selectedDateStr,
    selectedSport,
  ]);

  const loading = hubLoading;
  const error = hubError;

  // Update URL and state
  const setSelectedSport = useCallback((sport: ExtendedSportKey) => {
    setSelectedSportState(sport);
    const params = new URLSearchParams(searchParams);
    params.set('sport', sport);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);
  
  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date);
    const params = new URLSearchParams(searchParams);
    params.set('date', formatDateYYYYMMDD(date));
    setSearchParams(params, { replace: true });
    setStatusFilter('live');
    setHasAutoFallback(false);
  }, [searchParams, setSearchParams]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await hubRefresh();
    setLastFetchAt(new Date());
    setRefreshing(false);
  }, [hubRefresh]);

  // NCAAB/NCAAF prefetch endpoint is not guaranteed in all local envs.
  // Keep lookups empty when unavailable to avoid repeated 404 noise.

  // Auto-fallback: if filter is 'live' but no live games, switch to 'all'
  useEffect(() => {
    if (hasAutoFallback) return; // Already did auto-fallback
    
    const liveCount = games.filter(g => 
      (g.status || '').toString().toLowerCase() === 'live'
    ).length;
    
    if (liveCount === 0 && statusFilter === 'live') {
      setStatusFilter('all');
      setHasAutoFallback(true);
    }
  }, [games, statusFilter, hasAutoFallback]);

  // Filter and group games - add early return for empty games
  const { liveGames, scheduledGames, finalGames, filteredCount } = useMemo(() => {
    if (games.length === 0) {
      return { liveGames: [], scheduledGames: [], finalGames: [], filteredCount: 0 };
    }
    
    // Performance optimization: limit total games processed
    const gamesToProcess = games.slice(0, 200);
    // API is already date-scoped, so avoid re-filtering by date on the client.
    let filtered = gamesToProcess;

    // MAIN SPORT FILTER - apply if not "ALL"
    if (selectedSport !== 'ALL') {
      filtered = filtered.filter(g => {
        const gameSport = (g.sport || '').toUpperCase();
        return gameSport === selectedSport;
      });
    }
    
    // Apply league filter for soccer
    if (selectedSport === 'SOCCER' && leagueFilter !== 'ALL') {
      filtered = filtered.filter(g => g.league === leagueFilter);
    }
    
    // Apply conference filter for NCAAB using team lookup
    if (selectedSport === 'NCAAB' && conferenceFilter !== 'ALL') {
      // Conference code to name mapping
      const confCodeToName: Record<string, string[]> = {
        'ACC': ['Atlantic Coast'],
        'BIG10': ['Big Ten'],
        'BIG12': ['Big 12'],
        'SEC': ['SEC', 'Southeastern'],
        'BIGEAST': ['Big East'],
        'PAC12': ['Pac-12'],
        'AAC': ['American', 'AAC'],
        'MWC': ['Mountain West'],
        'WCC': ['West Coast'],
        'A10': ['Atlantic 10'],
        'CUSA': ['Conference USA', 'C-USA'],
        'MAC': ['Mid-American'],
        'SUNBELT': ['Sun Belt'],
        'SOCON': ['Southern'],
        'IVY': ['Ivy'],
        'MEAC': ['Mid-Eastern'],
        'SWAC': ['Southwestern'],
        'MAAC': ['Metro Atlantic', 'MAAC'],
        'HORIZON': ['Horizon'],
        'MVC': ['Missouri Valley'],
        'OVC': ['Ohio Valley'],
        'WAC': ['Western Athletic', 'WAC'],
        'ASUN': ['ASUN', 'Atlantic Sun'],
        'BIG SKY': ['Big Sky'],
        'CAA': ['Colonial', 'CAA'],
        'SUMMIT': ['Summit'],
      };
      
      // Helper to get team abbr from game
      const getTeamAbbr = (team: string | { name?: string; abbreviation?: string; abbr?: string } | null | undefined): string => {
        if (!team) return '';
        if (typeof team === 'string') return team.toUpperCase();
        return (team.abbreviation || team.abbr || team.name || '').toUpperCase();
      };

      
      if (conferenceFilter === 'TOP25') {
        // Filter to games where at least one team is AP-ranked
        filtered = filtered.filter(g => {
          const homeAbbr = getTeamAbbr(g.homeTeam);
          const awayAbbr = getTeamAbbr(g.awayTeam);
          const homeInfo = ncaabTeamLookup[homeAbbr];
          const awayInfo = ncaabTeamLookup[awayAbbr];
          return (homeInfo?.apRank != null) || (awayInfo?.apRank != null);
        });
      } else {
        // Filter by conference
        const confNames = confCodeToName[conferenceFilter] || [];
        filtered = filtered.filter(g => {
          const homeAbbr = getTeamAbbr(g.homeTeam);
          const awayAbbr = getTeamAbbr(g.awayTeam);
          const homeConf = ncaabTeamLookup[homeAbbr]?.conference || '';
          const awayConf = ncaabTeamLookup[awayAbbr]?.conference || '';
          // Match if either team is in the selected conference
          return confNames.some(name => 
            homeConf.toLowerCase().includes(name.toLowerCase()) ||
            awayConf.toLowerCase().includes(name.toLowerCase())
          );
        });
      }
    }
    
    // NCAAF conference filter removed - off season
    
    if (activeTab !== 'odds' && statusFilter !== 'all') {
      filtered = filtered.filter(g => {
        const status = (g.status || '').toString().toLowerCase();
        if (statusFilter === 'live') {
          return status === 'live' || status === 'in_progress';
        }
        return status === statusFilter;
      });
    }
    
    const live = filtered.filter(g => {
      const s = (g.status || '').toString().toLowerCase();
      return s === 'live' || s === 'in_progress';
    });
    const scheduled = filtered.filter(g => (g.status || '').toString().toLowerCase() === 'scheduled');
    const final = filtered.filter(g => (g.status || '').toString().toLowerCase() === 'final');
    
    scheduled.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aTime - bTime;
    });
    
    final.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return bTime - aTime;
    });
    
    return { liveGames: live, scheduledGames: scheduled, finalGames: final, filteredCount: filtered.length };
  }, [games, statusFilter, selectedSport, leagueFilter, conferenceFilter, ncaabTeamLookup, ncaafTeamLookup, activeTab]);

  // Status counts (same date filter as sections so tab counts match displayed games)
  const statusCounts = useMemo(() => {
    if (games.length === 0) return { all: 0, live: 0, scheduled: 0, final: 0 };
    return {
      all: games.length,
      live: games.filter(g => {
        const s = (g.status || '').toString().toLowerCase();
        return s === 'live' || s === 'in_progress';
      }).length,
      scheduled: games.filter(g => (g.status || '').toString().toLowerCase() === 'scheduled').length,
      final: games.filter(g => (g.status || '').toString().toLowerCase() === 'final').length,
    };
  }, [games]);

  // Sport counts for quick-jump strip (same date filter as displayed games)
  const sportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach(g => {
      const sport = (g.sport || '').toUpperCase();
      counts[sport] = (counts[sport] || 0) + 1;
    });
    return counts;
  }, [games]);

  // Watchboard games - games that are in the user's active watchboard
  const watchboardGames = useMemo(() => {
    if (!activeBoard || games.length === 0) return [];
    // activeBoard has gameIds as string[] from the hook
    const watchboardGameIds = new Set((activeBoard as any).gameIds || []);
    if (watchboardGameIds.size === 0) return [];
    return games.filter(g => watchboardGameIds.has(g.id) || watchboardGameIds.has(g.gameId || ''));
  }, [games, activeBoard]);

  // Prime Time games - upcoming games on national TV
  const primeTimeGames = useMemo(() => {
    if (scheduledGames.length === 0) return [];
    return scheduledGames.filter(g => isNationalTV((g as any).channel || (g as any).broadcast));
  }, [scheduledGames]);

  // Upcoming games that are NOT prime time (to avoid duplicates)
  const regularScheduledGames = useMemo(() => {
    if (scheduledGames.length === 0 || primeTimeGames.length === 0) return scheduledGames;
    const primeTimeIds = new Set(primeTimeGames.map(g => g.id));
    return scheduledGames.filter(g => !primeTimeIds.has(g.id));
  }, [scheduledGames, primeTimeGames]);

  // Coach G Picks - DISABLED for performance - expensive whisper calculations
  // Limited to 3 games for performance
  const coachGPicks = useMemo((): ApprovedScoreCardGame[] => {
    return []; // Disabled for performance
    /* 
    const allActiveGames = [...liveGames, ...scheduledGames];
    // Early return for performance - only process first 10 games max
    const gamesToCheck = allActiveGames.slice(0, 10);
    
    return gamesToCheck.filter(game => {
      const homeTeam = typeof game.homeTeam === 'string' 
        ? { code: game.homeTeam, name: game.homeTeam, score: 0 }
        : { code: game.homeTeam.abbr, name: (game.homeTeam as any).name || game.homeTeam.abbr, score: (game.homeTeam as any).score || 0, record: (game.homeTeam as any).record };
      const awayTeam = typeof game.awayTeam === 'string'
        ? { code: game.awayTeam, name: game.awayTeam, score: 0 }
        : { code: game.awayTeam.abbr, name: (game.awayTeam as any).name || game.awayTeam.abbr, score: (game.awayTeam as any).score || 0, record: (game.awayTeam as any).record };
      
      const whisper = generateCoachWhisper({
        homeTeam,
        awayTeam,
        status: game.status === 'live' ? 'LIVE' : game.status === 'final' ? 'FINAL' : 'SCHEDULED',
        period: game.period,
        clock: game.clock,
        spread: game.spread,
        channel: (game as any).channel || (game as any).broadcast
      });
      
      // Only include games with bullish or alert sentiment
      return whisper && (whisper.sentiment === 'bullish' || whisper.sentiment === 'alert');
    }).slice(0, 3); // Limit to top 3 picks
    */
  }, []); // Empty array - always returns empty anyway

  // Handlers
  const handleGameClick = useCallback((game: ApprovedScoreCardGame, forceOdds?: boolean) => {
    const gameId = game.gameId || game.id;
    const sport = (game.sport || 'NBA').toLowerCase();
    // Route to odds page when on odds tab, otherwise match page
    const route = (forceOdds || activeTab === 'odds') 
      ? toOddsGamePath(sport, gameId)
      : toGameDetailPath(sport, gameId);
    navigate(route);
  }, [navigate, activeTab]);

  // @ts-ignore - reserved for coach integration
  const _handleCoachClick = useCallback((game: ApprovedScoreCardGame) => {
    const homeTeam = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam.abbr;
    const awayTeam = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam.abbr;
    openChat(`Tell me about the ${awayTeam} vs ${homeTeam} game`);
  }, [openChat]);

  // @ts-ignore - reserved for future use
  const _lastUpdateText = useMemo(() => {
    if (!lastFetchAt) return null;
    const diffMs = new Date().getTime() - lastFetchAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1m ago';
    return `${diffMins}m ago`;
  }, [lastFetchAt]);

  const sportConfig = AVAILABLE_SPORTS.find(s => s.key === selectedSport);
  const dateLabel = getDateLabel(selectedDate, today);
  const navDateLabel = dateLabel === "Today"
    ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : dateLabel;
  const sectionShellClass = "rounded-[14px] border border-white/[0.05] bg-[#16202B] p-4 md:p-5 shadow-[0_10px_24px_rgba(0,0,0,0.30)]";
  const sectionHeaderClass = "mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-3 py-1.5 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
  const showMoreBtnClass = "mt-4 w-full rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-4 py-2.5 text-[12px] font-semibold text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]";
  const sportGroupHeaderClass = "mb-4 flex items-center justify-between rounded-[12px] border border-white/[0.06] bg-[#121821]/95 px-4 py-3 backdrop-blur-xl shadow-[0_10px_22px_rgba(0,0,0,0.26)]";
  const sportGroupHubBtnClass = "inline-flex items-center gap-1 rounded-md border border-white/[0.05] bg-white/5 px-2 py-1 text-xs text-[#9CA3AF] transition-colors hover:text-[#E5E7EB]";

  // Group games by sport for ALL view - memoized for performance
  const groupGamesBySport = useMemo(() => {
    return (sectionGames: ApprovedScoreCardGame[]) => {
      const groups: Record<string, ApprovedScoreCardGame[]> = {};
      for (const game of sectionGames) {
        const sport = (game.sport || 'OTHER').toUpperCase();
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(game);
      }
      // Sort sports by priority (most popular first)
      const sportOrder = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB', 'NCAAF', 'SOCCER', 'MMA', 'GOLF'];
      return Object.entries(groups).sort((a, b) => {
        const aIdx = sportOrder.indexOf(a[0]);
        const bIdx = sportOrder.indexOf(b[0]);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });
    };
  }, []);

  const renderCompactGameTile = useCallback((game: ApprovedScoreCardGame, forceInWatchboard?: boolean) => {
    const home = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.name || game.homeTeam?.abbr || 'Home';
    const away = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.name || game.awayTeam?.abbr || 'Away';
    const favoriteEnabled = Boolean(flags.GAME_FAVORITES_ENABLED);
    const gameIsFavorite = favoriteEnabled ? isFavorite('game', game.id) : false;
    return (
      <div key={game.id} className="relative">
        {favoriteEnabled && (
          <div className="absolute right-2 top-2 z-20">
            <FavoriteEntityButton
              type="game"
              entityId={game.id}
              sport={String(game.sport || '').toLowerCase()}
              metadata={{
                game_id: game.id,
                home_team: home,
                away_team: away,
                sport: String(game.sport || '').toLowerCase(),
              }}
              compact
              className="border-slate-600/50 bg-slate-950/70 hover:bg-slate-900/85"
            />
          </div>
        )}
        <CompactGameTile
          game={{
            id: game.id,
            sport: game.sport,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            status: game.status,
            period: game.period,
            clock: game.clock,
            startTime: game.startTime,
            channel: game.channel,
            spread: game.spread ?? game.odds?.spread ?? null,
            overUnder: game.overUnder ?? game.odds?.total ?? null,
            mlHome: game.moneylineHome ?? game.odds?.mlHome ?? null,
            mlAway: game.moneylineAway ?? game.odds?.mlAway ?? null,
            spread1H: game.odds?.spread1HHome ?? null,
            total1H: game.odds?.total1H ?? null,
            ml1HHome: game.odds?.moneyline1HHome ?? null,
            ml1HAway: game.odds?.moneyline1HAway ?? null,
          }}
          onClick={() => handleGameClick(game)}
          isInWatchboard={forceInWatchboard ?? isGameInWatchboard(game.id)}
          isFavorite={gameIsFavorite}
        />
      </div>
    );
  }, [flags.GAME_FAVORITES_ENABLED, handleGameClick, isFavorite, isGameInWatchboard]);

  // Special section for watchboard games with enhanced styling
  const renderWatchboardSection = () => {
    if (watchboardGames.length === 0) return null;
    
    const INITIAL_SHOW = 8;
    const sectionKey = 'watchboard-section';
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = watchboardGames.length > showCount;
    const displayGames = watchboardGames.slice(0, showCount);
    
    return (
      <div id="watchboard-section" className="mb-12 first:mt-0 mt-10">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-cyan-200">
              <Star className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">Your Watchboard</span>
            </div>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-500/14 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
              {watchboardGames.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game, true))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: watchboardGames.length }))}
              className={showMoreBtnClass}
            >
              Show {watchboardGames.length - showCount} More Watchboard Games
            </button>
          )}
        </div>
      </div>
    );
  };

  // Enhanced Live section with glowing border
  const renderLiveSection = (sectionGames: ApprovedScoreCardGame[]) => {
    if (sectionGames.length === 0) return null;

    const INITIAL_SHOW = 8;
    const sectionKey = 'live-section';

    // When viewing ALL sports, group games by sport
    if (selectedSport === 'ALL') {
      const groupedBySport = groupGamesBySport(sectionGames);
      return (
        <div className="mb-12 first:mt-0 mt-10" id="live-section">
          <div className={sectionShellClass}>
            <div className={sectionHeaderClass}>
              <div className="flex items-center gap-2 text-red-300">
                <div className="relative">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 bg-red-400 rounded-full animate-ping" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide">Live Now</span>
              </div>
              <span className="rounded-full border border-red-300/30 bg-red-500/14 px-2 py-0.5 text-[10px] font-semibold text-red-100 animate-pulse">
                {sectionGames.length}
              </span>
            </div>
            {groupedBySport.map(([sport, sportGames]) => {
              const sportInfo = DROPDOWN_SPORTS.find(s => s.key === sport);
              const sportSectionKey = `${sectionKey}-${sport}`;
              const sportShowCount = showMoreSections[sportSectionKey] || INITIAL_SHOW;
              const sportHasMore = sportGames.length > sportShowCount;
              const displayGames = sportGames.slice(0, sportShowCount);

              return (
                <div key={sport} id={`league-${sport.toLowerCase()}`} className="mb-8 last:mb-0">
                  <div className={sportGroupHeaderClass}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#16202B] text-[11px] font-semibold text-slate-300">
                        {String(sportInfo?.label || sport).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold tracking-tight text-[#F3F4F6]">{sportInfo?.label || sport}</span>
                        <span className="text-[11px] text-slate-400">Live</span>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {sportGames.length} game{sportGames.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => navigate(`/sports/${sport.toLowerCase()}`)}
                      className={sportGroupHubBtnClass}
                    >
                      View Hub <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {displayGames.map((game) => renderCompactGameTile(game))}
                  </div>
                  {sportHasMore && (
                    <button
                      onClick={() => setShowMoreSections(prev => ({ ...prev, [sportSectionKey]: sportGames.length }))}
                      className={showMoreBtnClass}
                    >
                      Show {sportGames.length - sportShowCount} More Live {sportInfo?.label || sport} Games
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-12 mt-10 first:mt-0" id="live-section">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-red-300">
              <div className="relative">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-2 h-2 bg-red-400 rounded-full animate-ping" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">Live Now</span>
            </div>
            <span className="rounded-full border border-red-300/30 bg-red-500/14 px-2 py-0.5 text-[10px] font-semibold text-red-100 animate-pulse">
              {sectionGames.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {sectionGames.map((game) => renderCompactGameTile(game))}
          </div>
        </div>
      </div>
    );
  };

  // Render Prime Time section - national TV games with gold styling
  const renderPrimeTimeSection = () => {
    if (primeTimeGames.length === 0) return null;
    
    const INITIAL_SHOW = 8;
    const sectionKey = 'prime-section';
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = primeTimeGames.length > showCount;
    const displayGames = primeTimeGames.slice(0, showCount);
    
    return (
      <div id="prime-section" className="mb-10">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-amber-200">
              <span className="text-xs font-semibold uppercase tracking-wide">Prime Time</span>
            </div>
            <span className="rounded-full border border-amber-300/30 bg-amber-500/14 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
              {primeTimeGames.length} on TV
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: primeTimeGames.length }))}
              className={showMoreBtnClass}
            >
              Show {primeTimeGames.length - showCount} More Prime Time Games
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderCoachGPicksSection = () => {
    if (coachGPicks.length === 0) return null;
    
    const INITIAL_SHOW = 8;
    const sectionKey = 'coachg-section';
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = coachGPicks.length > showCount;
    const displayGames = coachGPicks.slice(0, showCount);
    
    return (
      <div id="coachg-section" className="mb-10">
        <div className={sectionShellClass}>
          <div className={sectionHeaderClass}>
            <div className="flex items-center gap-2 text-violet-200">
              <Star className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">Coach G Picks</span>
            </div>
            <span className="rounded-full border border-violet-300/30 bg-violet-500/14 px-2 py-0.5 text-[10px] font-semibold text-violet-100">
              {coachGPicks.length} hot takes
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: coachGPicks.length }))}
              className={showMoreBtnClass}
            >
              Show {coachGPicks.length - showCount} More Coach G Picks
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (title: string, sectionGames: ApprovedScoreCardGame[], statusClass: string, sectionId?: string) => {
    if (sectionGames.length === 0) return null;
    
    const INITIAL_SHOW = 8; // Show 12 games initially (6 rows in 2-col grid)
    const sectionKey = sectionId || title.toLowerCase();
    const showCount = showMoreSections[sectionKey] || INITIAL_SHOW;
    const hasMore = sectionGames.length > showCount;
    
    // When viewing ALL sports, group games by sport within each section
    if (selectedSport === 'ALL') {
      const groupedBySport = groupGamesBySport(sectionGames);
      return (
        <div id={sectionId} className="mb-12 mt-10 first:mt-0">
          <div className={sectionShellClass}>
            <div className={cn(sectionHeaderClass, statusClass)}>
              <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {sectionGames.length}
              </span>
            </div>
            {groupedBySport.map(([sport, sportGames]) => {
            const sportInfo = DROPDOWN_SPORTS.find(s => s.key === sport);
            const sportSectionKey = `${sectionKey}-${sport}`;
            const sportShowCount = showMoreSections[sportSectionKey] || INITIAL_SHOW;
            const sportHasMore = sportGames.length > sportShowCount;
            const displayGames = sportGames.slice(0, sportShowCount);
            
            return (
              <div key={sport} id={`${sectionId}-${sport.toLowerCase()}`} className="mb-8 last:mb-0">
                {/* Enhanced League Section Header - Sticky */}
                <div className={sportGroupHeaderClass}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#16202B] text-[11px] font-semibold text-slate-300">
                      {String(sportInfo?.label || sport).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold tracking-tight text-[#F3F4F6]">{sportInfo?.label || sport}</span>
                      <span className="text-[11px] text-slate-400">Slate</span>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {sportGames.length} game{sportGames.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/sports/${sport.toLowerCase()}`)}
                    className={sportGroupHubBtnClass}
                  >
                    View Hub <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {displayGames.map((game) => renderCompactGameTile(game))}
                </div>
                {sportHasMore && (
                  <button
                    onClick={() => setShowMoreSections(prev => ({ ...prev, [sportSectionKey]: sportGames.length }))}
                    className={showMoreBtnClass}
                  >
                    Show {sportGames.length - sportShowCount} More {sportInfo?.label || sport} Games
                  </button>
                )}
              </div>
            );
            })}
          </div>
        </div>
      );
    }
    
    const displayGames = sectionGames.slice(0, showCount);
    
    return (
      <div id={sectionId} className="mb-12 mt-10 first:mt-0">
        <div className={sectionShellClass}>
          <div className={cn(sectionHeaderClass, statusClass)}>
            <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              {sectionGames.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {displayGames.map((game) => renderCompactGameTile(game))}
          </div>
          {hasMore && (
            <button
              onClick={() => setShowMoreSections(prev => ({ ...prev, [sectionKey]: sectionGames.length }))}
              className={showMoreBtnClass}
            >
              Show {sectionGames.length - showCount} More Games
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080B10]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#080B10] via-[#0C1118] to-[#080B10]" />
      <div className="pointer-events-none absolute left-1/4 top-0 h-[30rem] w-[30rem] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 top-6 h-[26rem] w-[26rem] rounded-full bg-violet-500/[0.03] blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(12,17,24,0)_0%,#080B10_78%)]" />
      {/* Live Pulse Ticker - shows live scores scrolling */}
      <LivePulseTicker 
        games={games} 
        onLabelClick={() => {
          document.getElementById('live-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      
      {/* COMPACT COMMAND CENTER HEADER */}
      <div className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#121821]/92 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4">
          {/* Top Row: Title + Date + Actions */}
          <div className="flex items-center justify-between gap-3 py-3">
            {/* Title */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Zap className="w-4 h-4 text-[#D1D5DB]" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold tracking-tight text-white">Command Center</h1>
                <button 
                  onClick={() => setDateModalOpen(true)}
                  className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-cyan-300"
                >
                  <span>{dateLabel}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={cn(
                  "h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100",
                  refreshing && "opacity-50"
                )}
              >
                <RefreshCw className={cn("mx-auto h-4 w-4", refreshing && "animate-spin")} />
              </button>
              
              {/* Settings */}
              <button
                onClick={() => navigate('/settings')}
                className="h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
              >
                <Settings className="mx-auto h-4 w-4" />
              </button>

              {/* Coach G quick entry */}
              <button
                onClick={() => navigate('/coach')}
                className="flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-violet-300/30 hover:bg-violet-500/10 hover:text-violet-100"
              >
                <img
                  src="/assets/coachg/coach-g-avatar.png?v=2"
                  alt="Coach G"
                  className="h-5 w-5 rounded-full border border-violet-300/35 object-cover"
                />
                <span className="hidden text-[10px] font-semibold tracking-wide sm:inline">Coach G</span>
              </button>
            </div>
          </div>
          
          {/* Sport Quick-Jump Strip */}
          <div className="pb-3">
            <SportQuickJump 
              selected={selectedSport}
              onSelect={async (sport) => {
                if (sport === 'MMA') {
                  try {
                    const res = await fetch('/api/mma/next');
                    if (res.ok) {
                      const data = await res.json();
                      if (data.gameId) {
                        navigate(toGameDetailPath('mma', data.gameId));
                        return;
                      }
                    }
                  } catch (err) {
                    console.error('Failed to fetch next UFC event:', err);
                  }
                }
                if (sport === 'GOLF') {
                  try {
                    const res = await fetch('/api/sports-data/sportsradar/golf/next');
                    if (res.ok) {
                      const data = await res.json();
                      if (data.gameId) {
                        navigate(toGameDetailPath('golf', data.gameId));
                        return;
                      }
                    }
                  } catch (err) {
                    console.error('Failed to fetch next PGA tournament:', err);
                  }
                }
                setSelectedSport(sport);
                setLeagueFilter('ALL');
                setConferenceFilter('ALL');
              }}
              sportCounts={sportCounts}
            />
          </div>
          
          {/* Tab Strip + Status Controls */}
          <div className="flex flex-wrap items-center gap-2.5 border-t border-white/[0.05] pb-3 pt-2">
            <div className="inline-flex items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
            {([
              { key: 'scores', label: 'Scores' },
              { key: 'odds', label: 'Odds' },
              { key: 'props', label: 'Props' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "h-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200",
                  activeTab === key
                    ? "border-cyan-300/35 bg-cyan-500/14 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                    : "hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
                )}
              >
                {label}
              </button>
            ))}
            </div>

            <div className="inline-flex items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                className="h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100"
                aria-label="Previous date"
              >
                <ChevronLeft className="mx-auto h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDateModalOpen(true)}
                className="flex h-8 items-center rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2.5 text-[11px] font-medium tracking-[0.02em] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
              >
                {navDateLabel}
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="flex h-8 items-center rounded-full border border-cyan-300/30 bg-cyan-500/12 px-2 text-[11px] font-medium text-cyan-100 transition-all duration-200 hover:border-cyan-200/45 hover:bg-cyan-500/18"
              >
                Today
              </button>
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                className="h-8 w-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-emerald-300/30 hover:bg-emerald-500/10 hover:text-emerald-100"
                aria-label="Next date"
              >
                <ChevronRight className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
            
            {/* Status Filter */}
            <div className="ml-auto inline-flex flex-wrap items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 text-[10px] font-medium backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
              {(['all', 'live', 'scheduled', 'final'] as StatusFilter[]).map((status) => {
                const labels: Record<StatusFilter, string> = { all: 'All', live: 'Live', scheduled: 'Soon', final: 'Final' };
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "h-8 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2.5 tracking-[0.06em] text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200",
                      statusFilter === status
                        ? "border-cyan-300/35 bg-cyan-500/14 text-cyan-100 shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                        : "hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
                    )}
                  >
                    {labels[status]}
                    {statusCounts[status] > 0 && (
                      <span className="ml-1 opacity-70">{statusCounts[status]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* THIN DIVIDER */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-8 pt-5">
        {/* SCORES TAB CONTENT */}
        {staleNotice && (
          <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
            <p className="text-[11px] text-cyan-200">{staleNotice}</p>
          </div>
        )}
        {showDebugTelemetry && (
          <div className="mb-4">
            <OddsTelemetryDebugPanel
              pageKey="games"
              gamesCount={games.length}
              oddsCoverageCount={realOddsGameCount}
              staleNotice={staleNotice}
              isHydrating={loading || refreshing || oddsHydrating}
              cycleToken={refreshCycleCount}
              lowCoverageThresholdPct={debugCoverageThresholdPct}
            />
          </div>
        )}

        {activeTab === 'scores' && (
          <>
            {/* Loading - only on very first load when no games exist */}
            {loading && games.length === 0 && (
              <div className="rounded-2xl border border-cyan-500/20 bg-[#121821] p-6 md:p-8">
                <div className="mb-4 flex items-center gap-2 text-cyan-200">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <p className="text-sm font-medium">Syncing live slate...</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`games-skeleton-${idx}`} className="h-24 animate-pulse rounded-xl border border-slate-700/40 bg-slate-900/70" />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-12 text-center">
                <AlertCircle className="mb-3 h-6 w-6 text-red-300" />
                <p className="mb-2 text-sm font-semibold text-red-100">Unable to load games</p>
                <p className="mb-4 max-w-xl text-xs text-red-200/80">{error}</p>
                <button
                  onClick={() => hubRefresh()}
                  disabled={loading}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm transition-colors",
                    loading
                      ? "cursor-not-allowed border-slate-700/40 bg-slate-800/40 text-slate-500"
                      : "border-red-300/30 bg-slate-900/70 text-red-100 hover:bg-slate-800/80"
                  )}
                >
                  {loading ? "Retrying..." : "Try Again"}
                </button>
              </div>
            )}

            {/* Empty - No games for date - show helpful message */}
            {!loading && !error && games.length === 0 && rawGames.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/30 bg-[#121821] px-6 py-20 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700/30 bg-slate-800/50 text-sm font-semibold tracking-wide text-slate-300">
                  {String(sportConfig?.label || selectedSport || "ALL").slice(0, 3).toUpperCase()}
                </div>
                <p className="mb-2 text-base font-semibold text-slate-100">
                  No {selectedSport === 'ALL' ? '' : (sportConfig?.label || selectedSport) + ' '}games {dateLabel.toLowerCase()}
                </p>
                <p className="mb-6 text-sm text-slate-400">
                  {selectedSport === 'ALL' 
                    ? "No games scheduled across any sport for this date"
                    : "Try viewing All Sports or selecting a different date"
                  }
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {selectedSport !== 'ALL' && (
                    <button
                      onClick={() => setSelectedSport('ALL' as ExtendedSportKey)}
                      className="rounded-lg border border-cyan-500/35 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/30"
                    >
                      View All Sports
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                    className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70"
                  >
                    Check Tomorrow →
                  </button>
                </div>
              </div>
            )}

            {/* Games - List View */}
            {!error && filteredCount > 0 && (
              <div>
                {statusFilter === 'all' ? (
                  <>
                    {renderWatchboardSection()}
                    {renderLiveSection(liveGames)}
                    {renderCoachGPicksSection()}
                    {renderPrimeTimeSection()}
                    {renderSection('Upcoming', regularScheduledGames, 'text-slate-400', 'upcoming-section')}
                    {renderSection('Final', finalGames, 'text-slate-500', 'final-section')}
                  </>
                ) : (
                  (() => {
                    const FILTERED_INITIAL_SHOW = 16;
                    const filterKey = `filtered-${statusFilter}`;
                    const allFilteredGames = statusFilter === 'live' ? liveGames : 
                      statusFilter === 'scheduled' ? scheduledGames : finalGames;
                    const showCount = showMoreSections[filterKey] || FILTERED_INITIAL_SHOW;
                    const displayGames = allFilteredGames.slice(0, showCount);
                    const hasMore = allFilteredGames.length > showCount;
                    
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {displayGames.map((game) => {
                            const home = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.name || game.homeTeam?.abbr || 'Home';
                            const away = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.name || game.awayTeam?.abbr || 'Away';
                            const favoriteEnabled = Boolean(flags.GAME_FAVORITES_ENABLED);
                            const gameIsFavorite = favoriteEnabled ? isFavorite('game', game.id) : false;
                            return (
                              <div key={game.id} className="relative">
                                {favoriteEnabled && (
                                  <div className="absolute right-2 top-2 z-20">
                                    <FavoriteEntityButton
                                      type="game"
                                      entityId={game.id}
                                      sport={String(game.sport || '').toLowerCase()}
                                      metadata={{
                                        game_id: game.id,
                                        home_team: home,
                                        away_team: away,
                                        sport: String(game.sport || '').toLowerCase(),
                                      }}
                                      compact
                                      className="border-slate-600/50 bg-slate-950/70 hover:bg-slate-900/85"
                                    />
                                  </div>
                                )}
                                <CompactGameTile
                                  game={{
                                    id: game.id,
                                    sport: game.sport,
                                    homeTeam: game.homeTeam,
                                    awayTeam: game.awayTeam,
                                    homeScore: game.homeScore,
                                    awayScore: game.awayScore,
                                    status: game.status,
                                    period: game.period,
                                    clock: game.clock,
                                    startTime: game.startTime,
                                    channel: game.channel,
                                    spread: game.spread ?? game.odds?.spread ?? null,
                                    overUnder: game.overUnder ?? game.odds?.total ?? null,
                                    mlHome: game.moneylineHome ?? game.odds?.mlHome ?? null,
                                    mlAway: game.moneylineAway ?? game.odds?.mlAway ?? null,
                                    spread1H: game.odds?.spread1HHome ?? null,
                                    total1H: game.odds?.total1H ?? null,
                                    ml1HHome: game.odds?.moneyline1HHome ?? null,
                                    ml1HAway: game.odds?.moneyline1HAway ?? null,
                                  }}
                                  onClick={() => handleGameClick(game)}
                                  isInWatchboard={isGameInWatchboard(game.id)}
                                  isFavorite={gameIsFavorite}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {hasMore && (
                          <button
                            onClick={() => setShowMoreSections(prev => ({ 
                              ...prev, 
                              [filterKey]: showCount + 16 
                            }))}
                            className="mt-4 w-full py-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-700/50 text-slate-400 text-sm font-medium transition-colors border border-slate-700/30"
                          >
                            Show More ({allFilteredGames.length - showCount} remaining)
                          </button>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            )}

        {/* No games in filtered view */}
        {!error && games.length > 0 && filteredCount === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/30 bg-[#121821] px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700/30 bg-slate-800/40">
              <AlertCircle className="w-6 h-6 text-slate-500" />
            </div>
            <p className="mb-2 text-sm font-medium text-slate-200">
              {conferenceFilter !== 'ALL' 
                ? `No ${conferenceFilter === 'TOP25' ? 'Top 25' : conferenceFilter} games found`
                : `No ${statusFilter === 'scheduled' ? 'upcoming' : statusFilter === 'all' ? 'matching' : statusFilter} games`
              }
            </p>
            <p className="mb-5 text-xs text-slate-400">
              {conferenceFilter !== 'ALL' 
                ? `Try viewing all conferences or changing the date`
                : `${games.length} total games available with different filters`
              }
            </p>
            {conferenceFilter !== 'ALL' ? (
              <button
                onClick={() => setConferenceFilter('ALL')}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70"
              >
                View All Conferences
              </button>
            ) : (
              <button
                onClick={() => setStatusFilter('all')}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70"
              >
                Show All {games.length} Games
              </button>
            )}
          </div>
        )}

        {/* Footer count */}
        {filteredCount > 0 && (
          <div className="mt-12 pt-6 border-t border-slate-800/30 text-center">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {filteredCount} game{filteredCount !== 1 ? 's' : ''} • {dateLabel}
            </span>
          </div>
        )}
          </>
        )}

        {/* ODDS TAB CONTENT - Sports Betting Intelligence Terminal */}
        {activeTab === 'odds' && (
          <div className="space-y-4 py-2">
            {((loading || oddsHydrating) && games.length === 0) ? (
              <div className="rounded-2xl border border-amber-500/20 bg-[#121821] p-6 md:p-8">
                <div className="mb-4 flex items-center gap-2 text-amber-200">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <p className="text-sm font-medium">Loading market intelligence...</p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`odds-skeleton-${idx}`} className="h-24 animate-pulse rounded-xl border border-slate-700/40 bg-slate-900/70" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <OddsIntelligenceDashboard
                  games={games}
                  isGameInWatchboard={isGameInWatchboard}
                  onWatchboardClick={(game) => {
                    const awayName = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
                    const homeName = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
                    setWatchboardModal({ open: true, gameId: game.id, gameSummary: `${awayName} @ ${homeName}` });
                  }}
                  selectedSport={selectedSport}
                  showMoreSections={showMoreSections}
                  setShowMoreSections={setShowMoreSections}
                />
              </div>
            )}
          </div>
        )}


        {/* PROPS TAB CONTENT */}
        {activeTab === 'props' && (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <div>
                <p className="font-semibold text-emerald-100">Player Props is live</p>
                <p className="text-sm text-emerald-200/80">
                  Open the full props board or jump into props for a specific game.
                </p>
              </div>
              <button
                onClick={() => navigate('/props')}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-500/30"
              >
                Open Player Props Board
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {games.slice(0, 9).map((game) => {
                const awayName = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam?.abbr || 'Away';
                const homeName = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam?.abbr || 'Home';
                return (
                  <button
                    key={`props-${game.id}`}
                    onClick={() => navigate(`/lines/${game.id}/props`)}
                    className="text-left rounded-xl border border-slate-700/40 bg-slate-900/50 p-3 transition-colors hover:border-emerald-500/30 hover:bg-slate-800/65"
                  >
                    <p className="text-sm font-semibold text-slate-100">{awayName} @ {homeName}</p>
                    <p className="mt-1 text-xs text-emerald-300/90">View game props</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      
      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        selected={selectedDate}
        onSelect={setSelectedDate}
        today={today}
      />
      
      {/* Add to Watchboard Modal */}
      <AddToWatchboardModal
        isOpen={watchboardModal.open}
        onClose={() => setWatchboardModal({ open: false, gameId: '', gameSummary: '' })}
        gameId={watchboardModal.gameId}
        gameSummary={watchboardModal.gameSummary}
        onSuccess={(boardName) => {
          setToast({ message: `Added to ${boardName}`, type: 'success' });
          setTimeout(() => setToast(null), 2500);
        }}
        onError={(error) => {
          setToast({ message: error, type: 'error' });
          setTimeout(() => setToast(null), 2500);
        }}
      />
      
      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium z-[100] ${
          toast.type === 'success' 
            ? 'bg-emerald-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default GamesPage;
