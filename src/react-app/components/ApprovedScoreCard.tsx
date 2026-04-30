/**
 * HOMEPAGE LOCKED
 * Do not change behavior/order/render rules without explicit approval.
 * Homepage stability rules:
 * - exactly 3 Games Today cards
 * - soccer + White Sox logo stability
 * - static sport icon row behavior
 * - watchboards render immediately and stay synced on Home
 * - no flicker / no late visual swapping
 */
import { memo, useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/react-app/lib/utils';
import { getTeamOrCountryLogoUrl } from '@/react-app/lib/teamLogos';
import { PlayerPhoto } from '@/react-app/components/PlayerPhoto';
import { Plus, Check, ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { GameContextChip } from './GameContextChip';
import { CoachGExternalLinkIcon } from './CoachGExternalLinkIcon';
import FavoriteEntityButton from '@/react-app/components/FavoriteEntityButton';
import { useFeatureFlags } from '@/react-app/hooks/useFeatureFlags';
import { useFavorites } from '@/react-app/hooks/useFavorites';
import {
  HOMEPAGE_TARGETED_LOGO_PRIORITY,
  homeLockDevLog,
  resolveHomeTeamLogo,
} from '@/react-app/lib/homeLockRules';

// ====================
// GAME STATE SYSTEM
// ====================

export type GameState = 'LIVE' | 'UPCOMING' | 'FINAL';
export type WinnerSide = 'home' | 'away' | 'tied' | 'none';

export interface GameStateInfo {
  state: GameState;
  winnerSide: WinnerSide;  // For FINAL games
  leaderSide: WinnerSide;  // For LIVE games
}

/** Compute game state and winner/leader info */
export function computeGameState(
  status: string,
  homeScore: number | null,
  awayScore: number | null
): GameStateInfo {
  const normalizedStatus = (status || '').toLowerCase();
  
  let state: GameState = 'UPCOMING';
  if (normalizedStatus === 'live' || normalizedStatus === 'in_progress') {
    state = 'LIVE';
  } else if (normalizedStatus === 'final' || normalizedStatus === 'completed' || normalizedStatus === 'closed') {
    state = 'FINAL';
  }
  
  const home = homeScore ?? 0;
  const away = awayScore ?? 0;
  
  let winnerSide: WinnerSide = 'none';
  let leaderSide: WinnerSide = 'none';
  
  if (state === 'FINAL') {
    if (home > away) winnerSide = 'home';
    else if (away > home) winnerSide = 'away';
    else winnerSide = 'tied';
  } else if (state === 'LIVE') {
    if (home > away) leaderSide = 'home';
    else if (away > home) leaderSide = 'away';
    else leaderSide = 'tied';
  }
  
  return { state, winnerSide, leaderSide };
}

// ====================
// TYPES
// ====================

export interface TeamDisplayInfo {
  fullName: string;
  record: string;
}

export interface ApprovedScoreCardGame {
  id: string;
  gameId?: string;
  sport: string;
  league?: string | null; // For soccer: EPL, MLS, UCL
  homeTeam: string | { abbr: string; name?: string };
  awayTeam: string | { abbr: string; name?: string };
  homeScore: number | null;
  awayScore: number | null;
  status: 'LIVE' | 'SCHEDULED' | 'FINAL' | 'live' | 'scheduled' | 'final';
  period?: string;
  clock?: string;
  startTime?: string;
  possession?: 'home' | 'away';
  // Rankings (for NCAAB Top 25)
  homeRank?: number | null;
  awayRank?: number | null;
  // Odds
  spread?: number;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  // Line movement (stored but not displayed in simplified card)
  spreadOpen?: number;
  totalOpen?: number;
  // Coach G insight
  coachSignal?: 'edge' | 'watch' | 'noise';
  predictorText?: string;
  // Public betting %
  publicBetHome?: number;
  publicBetAway?: number;
  // Nested odds object (alternative format)
  odds?: {
    spread?: number;
    spreadHome?: number;
    spreadAway?: number;
    openSpread?: number;
    total?: number;
    openTotal?: number;
    mlHome?: number;
    mlAway?: number;
    spread1HHome?: number;
    spread1HAway?: number;
    total1H?: number;
    moneyline1HHome?: number;
    moneyline1HAway?: number;
    f5?: {
      spread?: {
        home?: number;
        away?: number;
      };
      total?: number;
      moneyline?: {
        home?: number;
        away?: number;
      };
    };
  };
  // TV broadcast channel
  channel?: string | null;
  // Overtime indicator
  isOvertime?: boolean;
  probableAwayPitcher?: { name: string; record?: string };
  probableHomePitcher?: { name: string; record?: string };
  inningNumber?: number | null;
  inningHalf?: string | null;
  inningState?: string | null;
  mlbLiveState?: {
    inningNumber?: number | null;
    inningHalf?: string | null;
  } | null;
}

interface ApprovedScoreCardProps {
  game: ApprovedScoreCardGame;
  onCoachClick?: () => void;
  onClick?: () => void;
  onWatchClick?: () => void;
  isInWatchboard?: boolean;
  quickAction?: ReactNode;
  className?: string;
  mode?: 'compact' | 'detail';
  visualPreset?: 'default' | 'hub';
  teamInfo?: {
    home?: TeamDisplayInfo;
    away?: TeamDisplayInfo;
  };
}

// ====================
// CONSTANTS
// ====================

const SPORT_ICONS: Record<string, string> = {
  NFL: '🏈',
  NBA: '🏀',
  NHL: '🏒',
  MLB: '⚾',
  NCAAF: '🏈',
  NCAAB: '🏀',
  CBB: '🏀',
  CFB: '🏈',
  SOCCER: '⚽',
  MLS: '⚽',
  EPL: '⚽',
  UCL: '⚽',
};

// Soccer league display names and badges
const SOCCER_LEAGUE_LABELS: Record<string, string> = {
  EPL: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 EPL',
  MLS: '🇺🇸 MLS',
  UCL: '🏆 UCL',
};

// TV Network logos (ESPN CDN)
const NETWORK_LOGOS: Record<string, string> = {
  // Major broadcast networks
  'ESPN': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/espn.png&w=40&h=40',
  'ESPN2': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/espn2.png&w=40&h=40',
  'ESPN+': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/espn_plus.png&w=40&h=40',
  'ABC': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/abc.png&w=40&h=40',
  'TNT': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/tnt.png&w=40&h=40',
  'TBS': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/tbs.png&w=40&h=40',
  'FOX': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/fox.png&w=40&h=40',
  'FS1': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/fs1.png&w=40&h=40',
  'FS2': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/fs2.png&w=40&h=40',
  'CBS': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/cbs.png&w=40&h=40',
  'CBSSN': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/cbssn.png&w=40&h=40',
  'NBC': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nbc.png&w=40&h=40',
  'NBCSN': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nbcsn.png&w=40&h=40',
  'USA': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/usa.png&w=40&h=40',
  'PEACOCK': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/peacock.png&w=40&h=40',
  // Sports-specific networks
  'NFL NETWORK': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl_network.png&w=40&h=40',
  'NFLN': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl_network.png&w=40&h=40',
  'NBA TV': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba_tv.png&w=40&h=40',
  'NBATV': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba_tv.png&w=40&h=40',
  'MLB NETWORK': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mlb_network.png&w=40&h=40',
  'MLBN': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mlb_network.png&w=40&h=40',
  'NHL NETWORK': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nhl_network.png&w=40&h=40',
  // Regional sports networks
  'BALLY': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/bally.png&w=40&h=40',
  // Streaming
  'AMAZON': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/amazon.png&w=40&h=40',
  'PRIME VIDEO': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/amazon.png&w=40&h=40',
  'APPLE TV+': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/apple_tv.png&w=40&h=40',
  'APPLE TV': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/apple_tv.png&w=40&h=40',
};

/** Get network logo URL or null if not found */
function getNetworkLogoUrl(channel: string): string | null {
  const normalized = channel.toUpperCase().trim();
  return NETWORK_LOGOS[normalized] || null;
}

/** Get display label for sport/league (handles soccer leagues specially) */
function getSportDisplayLabel(sport: string, league?: string | null): string {
  const sportUpper = sport.toUpperCase();
  
  // For soccer, show the league badge if available
  if (sportUpper === 'SOCCER' && league) {
    const leagueUpper = league.toUpperCase();
    if (SOCCER_LEAGUE_LABELS[leagueUpper]) {
      return SOCCER_LEAGUE_LABELS[leagueUpper];
    }
    // Fallback: show league with soccer emoji
    return `⚽ ${leagueUpper}`;
  }
  
  // Default: sport icon + sport name
  const icon = SPORT_ICONS[sportUpper] || '🏆';
  return `${icon} ${sportUpper}`;
}

const COACH_G_AVATAR = '/assets/coachg/coach-g-avatar.png';

type LiveCardGlowPreset = 'subtle' | 'medium' | 'broadcast';

// Single lock point for live-card emphasis. Change this one value to tune the vibe.
const LIVE_CARD_GLOW_PRESET: LiveCardGlowPreset = 'broadcast';

const LIVE_CARD_GLOW_CLASSES: Record<
  LiveCardGlowPreset,
  { ring: string; border: string; aura: string }
> = {
  subtle: {
    ring: 'ring-1 ring-amber-300/25',
    border: 'border border-amber-300/30 opacity-80',
    aura: 'shadow-[0_0_22px_2px_rgba(252,211,77,0.18)] opacity-75',
  },
  medium: {
    ring: 'ring-1 ring-amber-300/35',
    border: 'border border-amber-300/40',
    aura: 'shadow-[0_0_34px_4px_rgba(252,211,77,0.28)]',
  },
  broadcast: {
    ring: 'ring-2 ring-amber-300/70',
    border: 'border-2 border-amber-300/70',
    aura: 'shadow-[0_0_62px_14px_rgba(251,191,36,0.52)]',
  },
};

// ====================
// TRANSFORM UTILITIES
// ====================

/** Transform LiveGame from useLiveGames hook to ApprovedScoreCardGame */
export function transformLiveGameToCard(game: {
  id: string;
  sport: string;
  league?: string | null;
  homeTeam: { name: string; abbreviation: string; score: number; logo?: string };
  awayTeam: { name: string; abbreviation: string; score: number; logo?: string };
  period: string;
  clock: string;
  status: string;
  startTime?: string;
  hasCoachInsight?: boolean;
  community?: { homePercent: number; awayPercent: number };
  channel?: string | null;
  normalizedOdds?: {
    spread: number | null;
    total: number | null;
    homeML: number | null;
    awayML: number | null;
  } | null;
}): ApprovedScoreCardGame {
  const debugFlag = '__homeNormalizedOddsLogged__';
  if (typeof window !== 'undefined' && !(window as any)[debugFlag]) {
    (window as any)[debugFlag] = true;
    console.log('NORMALIZED_ODDS', game.normalizedOdds ?? null);
  }
  const normalized = game.normalizedOdds ?? null;
  const resolvedSpread = normalized?.spread ?? undefined;
  const resolvedTotal = normalized?.total ?? undefined;
  const resolvedMlHome = normalized?.homeML ?? undefined;
  const resolvedMlAway = normalized?.awayML ?? undefined;

  return {
    id: game.id,
    sport: game.sport,
    league: game.league || null,
    homeTeam: { abbr: game.homeTeam.abbreviation, name: game.homeTeam.name },
    awayTeam: { abbr: game.awayTeam.abbreviation, name: game.awayTeam.name },
    homeScore: game.homeTeam.score,
    awayScore: game.awayTeam.score,
    status: game.status === 'IN_PROGRESS' ? 'LIVE' : (game.status as 'LIVE' | 'SCHEDULED' | 'FINAL'),
    period: game.period,
    clock: game.clock,
    startTime: game.startTime,
    channel: game.channel || null,
    spread: resolvedSpread ?? undefined,
    overUnder: resolvedTotal ?? undefined,
    moneylineHome: resolvedMlHome ?? undefined,
    moneylineAway: resolvedMlAway ?? undefined,
    homeLogoUrl: game.homeTeam.logo || null,
    awayLogoUrl: game.awayTeam.logo || null,
    coachSignal: game.hasCoachInsight ? 'edge' : undefined,
    publicBetHome: game.community?.homePercent,
    publicBetAway: game.community?.awayPercent,
  };
}

// ====================
// HELPERS
// ====================

function getTeamAbbr(team: string | { abbr: string; name?: string }): string {
  return typeof team === 'string' ? team : team.abbr;
}

function getTeamName(team: string | { abbr: string; name?: string }): string {
  return typeof team === 'string' ? team : (team.name || team.abbr);
}

function formatStartTime(startTime: string | undefined): string {
  if (!startTime) return '';
  try {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) return '';
    const timeLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    return isToday ? timeLabel : `${dateLabel} • ${timeLabel}`;
  } catch {
    return '';
  }
}

function formatStartDateTimeParts(startTime: string | undefined): { date: string; time: string; isToday: boolean } | null {
  if (!startTime) return null;
  try {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      isToday,
    };
  } catch {
    return null;
  }
}

function formatFinalDateLabel(startTime: string | undefined): string {
  if (!startTime) return 'FINAL';
  try {
    const date = new Date(startTime);
    if (Number.isNaN(date.getTime())) return 'FINAL';
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `FINAL • ${formattedDate}`;
  } catch {
    return 'FINAL';
  }
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function parseMlbInningDisplay(period?: string, clock?: string): string | null {
  const raw = `${period || ''} ${clock || ''}`.trim();
  if (!raw) return null;

  const shortMatch = raw.match(/\b([TtBb])\s*[- ]?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (shortMatch) {
    const side = shortMatch[1].toUpperCase() === 'T' ? 'Top' : 'Bot';
    const inning = Number(shortMatch[2]);
    return `${side} ${ordinalSuffix(inning)}`;
  }

  const sideMatch = raw.match(/\b(top|bot|bottom|mid|middle|end)\b(?:\s+of(?:\s+the)?|\s+the)?[\s:-]*(\d{1,2})(?:st|nd|rd|th)?/i);
  if (sideMatch) {
    const sideRaw = sideMatch[1].toLowerCase();
    const side =
      sideRaw === 'bottom' ? 'Bot'
      : sideRaw === 'middle' ? 'Mid'
      : sideRaw.charAt(0).toUpperCase() + sideRaw.slice(1);
    const inning = Number(sideMatch[2]);
    return `${side} ${ordinalSuffix(inning)}`;
  }

  const inningOnly = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(inning|inn|in)\b/i);
  if (inningOnly) {
    const inning = Number(inningOnly[1]);
    return `${ordinalSuffix(inning)} Inning`;
  }

  // Provider fallback: many MLB feeds expose bare inning number ("2") plus
  // a meaningless clock ("0:00"). Never show basketball-style clocks for MLB.
  const numericPeriod = String(period || '').trim().match(/^(\d{1,2})$/);
  if (numericPeriod) {
    const inning = Number(numericPeriod[1]);
    if (Number.isFinite(inning) && inning > 0) {
      return `${ordinalSuffix(inning)} Inning`;
    }
  }

  return null;
}

function parseSoccerHalfLabel(period?: string, clock?: string): '1H' | '2H' | null {
  const source = `${period || ''} ${clock || ''}`.toLowerCase();
  if (!source.trim()) return null;
  if (/\b(1h|1st|first)\b/.test(source)) return '1H';
  if (/\b(2h|2nd|second)\b/.test(source)) return '2H';
  return null;
}

function parseSoccerMinuteFromText(value?: string): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/active/i.test(raw)) return null;

  // Common soccer minute forms: "67'", "67", "67:12"
  const minuteMatch = raw.match(/\b(\d{1,3})(?:\+(\d{1,2}))?\s*'?/);
  if (minuteMatch) {
    const base = Number(minuteMatch[1]);
    if (Number.isFinite(base)) {
      const extra = minuteMatch[2] ? Number(minuteMatch[2]) : 0;
      return base + (Number.isFinite(extra) ? extra : 0);
    }
  }

  return null;
}

function parseSoccerClockWithSeconds(value?: string): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || /active/i.test(raw)) return null;

  // Keep exact mm:ss/mmm:ss when present (e.g. 67:12, 105:03)
  const mmss = raw.match(/\b(\d{1,3}):([0-5]\d)\b/);
  if (!mmss) return null;
  return `${mmss[1]}:${mmss[2]}`;
}

function estimateSoccerMinuteFromStart(startTime?: string): { minute: number; half: '1H' | '2H' } | null {
  if (!startTime) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;

  const elapsed = Math.floor((Date.now() - start.getTime()) / 60000);
  if (elapsed < 0) return null;

  // Roughly account for halftime break (~15m) after minute 45.
  const minute = elapsed <= 45 ? Math.max(1, elapsed) : Math.max(46, elapsed - 15);
  return { minute, half: minute <= 45 ? '1H' : '2H' };
}

function formatSoccerLiveDisplay(period?: string, clock?: string, startTime?: string): string | null {
  const combined = `${period || ''} ${clock || ''}`.toLowerCase();
  if (/\bhalftime\b|\bhalf[- ]?time\b|\bht\b/.test(combined)) return 'Halftime';

  const clockWithSeconds =
    parseSoccerClockWithSeconds(clock) ??
    parseSoccerClockWithSeconds(period);

  const parsedMinute =
    parseSoccerMinuteFromText(clock) ??
    parseSoccerMinuteFromText(period);

  const parsedHalf = parseSoccerHalfLabel(period, clock);

  if (clockWithSeconds) {
    if (parsedHalf) return `${clockWithSeconds} • ${parsedHalf}`;
    return clockWithSeconds;
  }

  if (parsedMinute != null) {
    const minuteText = parsedMinute > 90 ? `90+${parsedMinute - 90}'` : `${parsedMinute}'`;
    if (parsedHalf) return `${minuteText} • ${parsedHalf}`;
    return minuteText;
  }

  const estimate = estimateSoccerMinuteFromStart(startTime);
  if (estimate) {
    const minuteText = estimate.minute > 90 ? `90+${estimate.minute - 90}'` : `${estimate.minute}'`;
    return `${minuteText} • ${estimate.half}`;
  }

  return null;
}

// ====================
// SUB-COMPONENTS
// ====================

/** Red LIVE pill with slow breathing pulse (not fast ping) */
const LivePill = memo(function LivePill() {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 animate-live-pill-fill motion-reduce:animate-none">
      <span className="relative flex h-2 w-2">
        {/* Slow breathing animation - subtle, not flashing */}
        <span 
          className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60"
          style={{ animation: 'breathe 2.5s ease-in-out infinite' }}
        />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Live</span>
    </div>
  );
});

/** FINAL — VERIFIED badge with transition animation */
const FinalVerifiedBadge = memo(function FinalVerifiedBadge({ isOvertime }: { isOvertime?: boolean }) {
  return (
    <div className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-600/50 animate-badge-enter">
      <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.08em]">
        {isOvertime ? 'Final/OT — Verified' : 'Final — Verified'}
      </span>
    </div>
  );
});

/** UPCOMING badge */
const UpcomingBadge = memo(function UpcomingBadge() {
  return (
    <div className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/30">
      <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wide">
        Upcoming
      </span>
    </div>
  );
});

/** DRAW badge for tied soccer finals */
const DrawBadge = memo(function DrawBadge() {
  return (
    <div className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-300/60 shadow-[0_0_18px_rgba(34,211,238,0.35)] animate-badge-enter">
      <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-[0.08em]">
        Draw
      </span>
    </div>
  );
});

/** Team icon with logo support - soft circular glass, falls back to abbreviation */
const TeamIcon = memo(function TeamIcon({ 
  abbr, 
  teamName,
  sport,
  league,
  directLogoUrl,
  hasPossession,
  isFinalWinner,
  sizePreset = 'default',
}: { 
  abbr: string; 
  teamName?: string;
  sport?: string;
  league?: string | null;
  directLogoUrl?: string | null;
  hasPossession?: boolean;
  isFinalWinner?: boolean;
  sizePreset?: 'default' | 'hub';
}) {
  const isGolf = (sport || '').toUpperCase() === 'GOLF';
  const [imgError, setImgError] = useState(false);
  const inlineLogo = String(directLogoUrl || '').trim() || null;
  const mappedLogo = sport ? getTeamOrCountryLogoUrl(abbr, sport, league, { teamName }) : null;
  const resolvedLogo = resolveHomeTeamLogo({
    abbr,
    teamName,
    sport,
    mappedLogo,
    inlineLogo,
  });
  useEffect(() => {
    if (!resolvedLogo.isSoccer && !resolvedLogo.isWhiteSox) return;
    homeLockDevLog("logo path chosen for soccer/white sox", {
      abbr,
      teamName: teamName || null,
      sport: sport || null,
      hasMappedLogo: Boolean(mappedLogo),
      hasInlineLogo: Boolean(inlineLogo),
      chosen: resolvedLogo.logoSrc,
    });
  }, [abbr, inlineLogo, mappedLogo, resolvedLogo.isSoccer, resolvedLogo.isWhiteSox, resolvedLogo.logoSrc, sport, teamName]);
  const logoSrc = resolvedLogo.logoSrc;
  const showLogo = logoSrc && !imgError;
  const usesHubSizing = sizePreset === 'hub';
  const iconWrap = usesHubSizing ? "w-16 h-16 sm:w-20 sm:h-20" : "w-14 h-14 sm:w-16 sm:h-16";
  const badgeClasses = cn(
    `${iconWrap} rounded-full flex items-center justify-center transition-all duration-300`,
    showLogo
      ? "bg-transparent ring-0 shadow-none"
      : "bg-white/[0.05] ring-1 ring-white/[0.12] shadow-[0_8px_18px_rgba(0,0,0,0.4)]",
    isFinalWinner && "ring-2 ring-emerald-300/90 shadow-[0_0_22px_rgba(16,185,129,0.85),0_0_42px_rgba(16,185,129,0.55)]"
  );
  
  return (
    <div 
      className={cn(
        `relative ${iconWrap} flex items-center justify-center transition-all duration-300`,
        isFinalWinner && "scale-110",
        hasPossession && "ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-900"
      )}
    >
      <div className={badgeClasses}>
        {isGolf ? (
          <PlayerPhoto
            playerName={teamName || abbr}
            sport="golf"
            size={usesHubSizing ? 66 : 54}
            className="w-[92%] h-[92%]"
          />
        ) : showLogo ? (
          <img 
            src={logoSrc} 
            alt={abbr}
            className={cn(
              "w-[92%] h-[92%] object-contain saturate-[1.08] contrast-[1.05] brightness-[1.01] [filter:drop-shadow(0_12px_21px_rgba(0,0,0,0.62))_drop-shadow(0_0_1px_rgba(255,255,255,0.72))]"
            )}
            onError={() => {
              if (!resolvedLogo.suppressImgErrorFallback) {
                setImgError(true);
              }
            }}
          />
        ) : (
          <span className={cn(
            "text-sm sm:text-base font-extrabold text-slate-200 tracking-wide"
          )}>
            {abbr.slice(0, 3)}
          </span>
        )}
      </div>
      {hasPossession && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" />
      )}
      {(resolvedLogo.isSoccer || resolvedLogo.isWhiteSox) && (
        <span className="sr-only">{HOMEPAGE_TARGETED_LOGO_PRIORITY}</span>
      )}
    </div>
  );
});

/** Team display: icon, abbreviation, score (vertically stacked) */
const TeamBlock = memo(function TeamBlock({ 
  abbr, 
  teamName,
  score, 
  gameState,
  isWinner,
  isLoser,
  isLeader,
  hasPossession,
  sport,
  league,
  logoUrl,
  rank,
  sizePreset = 'default',
}: { 
  abbr: string; 
  teamName?: string;
  score: number | null; 
  gameState: GameState;
  isWinner: boolean;   // For FINAL games - this team won
  isLoser: boolean;    // For FINAL games - this team lost
  isLeader: boolean;   // For LIVE games
  hasPossession?: boolean;
  sport?: string;
  league?: string | null;
  logoUrl?: string | null;
  rank?: number | null; // NCAAB Top 25 ranking
  sizePreset?: 'default' | 'hub';
}) {
  const isFinal = gameState === 'FINAL';
  const isLive = gameState === 'LIVE';
  const isUpcoming = gameState === 'UPCOMING';
  
  // Track score changes for flash animation
  const prevScoreRef = useRef<number | null>(score);
  const [isFlashing, setIsFlashing] = useState(false);
  
  useEffect(() => {
    // Only flash if score increased during a live game
    if (isLive && score !== null && prevScoreRef.current !== null && score > prevScoreRef.current) {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 800);
      return () => clearTimeout(timer);
    }
    prevScoreRef.current = score;
  }, [score, isLive]);
  
  // Score styling based on state
  const getScoreClasses = () => {
    const base = "text-[32px] sm:text-[38px] font-[800] tabular-nums leading-none tracking-tight transition-all duration-300";
    
    if (isUpcoming) {
      return cn(base, "text-white/85");
    }
    
    if (isFinal) {
      if (isWinner) {
        // WINNER: Bright neon green (#00FF7F) + strong glow effect
        return cn(base, "text-[#00FF7F]", "drop-shadow-[0_0_12px_rgba(0,255,127,0.7)]", "drop-shadow-[0_0_24px_rgba(0,255,127,0.4)]");
      } else if (isLoser) {
        // LOSER: Muted dark red - dull, defeated look
        return cn(base, "text-[#6B2C2C] opacity-75");
      } else {
        // TIED: White (no winner/loser styling)
        return cn(base, "text-white");
      }
    }
    
    if (isLive) {
      if (isLeader) {
        // Leading: subtle green emphasis
        return cn(base, "text-emerald-400 brightness-110");
      } else {
        // Trailing or tied: neutral white (NOT red during live)
        return cn(base, "text-white");
      }
    }
    
    return cn(base, "text-white");
  };
  
  // Abbreviation styling
  const getAbbrClasses = () => {
    if (isFinal) {
      if (isWinner) return "text-[#00FF7F]";
      if (isLoser) return "text-[#6B2C2C]/70";
      return "text-white"; // tied
    }
    if (isLive) {
      return isLeader ? "text-white" : "text-slate-400";
    }
    return "text-white/80";
  };
  
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[86px] sm:min-w-[102px]">
      {/* Team icon with logo for supported sports */}
      <TeamIcon
        abbr={abbr}
        teamName={teamName}
        sport={sport}
        league={league}
        directLogoUrl={logoUrl}
        hasPossession={hasPossession}
        isFinalWinner={isFinal && isWinner}
        sizePreset={sizePreset}
      />
      
      {/* Team abbreviation with optional rank */}
      <span className={cn("text-sm sm:text-base font-bold flex items-center gap-1", getAbbrClasses())}>
        {rank && rank <= 25 && (
          <span className="text-xs font-bold text-amber-400">#{rank}</span>
        )}
        {abbr}
      </span>
      
      {/* BIG score number - state-dependent styling */}
      <span className={cn(getScoreClasses(), isFlashing && "animate-score-flash")}>
        {score ?? '—'}
      </span>
    </div>
  );
});

/** Gold vs Blue public betting percentage bar - enhanced contrast */
const PublicBetBar = memo(function PublicBetBar({ 
  homePercent, 
  awayPercent,
  homeTeam,
  awayTeam,
  isFinal
}: { 
  homePercent?: number;
  awayPercent?: number;
  homeTeam: string;
  awayTeam: string;
  isFinal?: boolean;
}) {
  if (homePercent === undefined && awayPercent === undefined) return null;
  
  const home = homePercent ?? (100 - (awayPercent ?? 50));
  const away = awayPercent ?? (100 - home);
  
  return (
    <div className="space-y-1.5">
      {/* Percentage labels - brighter for contrast */}
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          "font-bold brightness-110",
          isFinal ? "text-blue-400/80" : "text-blue-400"
        )}>{away}%</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
          {isFinal ? 'Final Split' : 'Public'}
        </span>
        <span className={cn(
          "font-bold brightness-110",
          isFinal ? "text-amber-400/80" : "text-amber-400"
        )}>{home}%</span>
      </div>
      {/* Gold vs Blue bar - "locked" appearance for FINAL (no motion transition) */}
      <div className="h-2.5 rounded-full bg-slate-900/80 overflow-hidden flex shadow-inner">
        <div 
          className={cn(
            "h-full bg-gradient-to-r from-blue-500 to-blue-400",
            isFinal ? "" : "transition-all duration-500"
          )}
          style={{ width: `${away}%` }}
        />
        <div 
          className={cn(
            "h-full bg-gradient-to-r from-amber-500 to-amber-400",
            isFinal ? "" : "transition-all duration-500"
          )}
          style={{ width: `${home}%` }}
        />
      </div>
      {/* Team labels below bar */}
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>{awayTeam}</span>
        <span>{homeTeam}</span>
      </div>
    </div>
  );
});

/** Coach G avatar button */
const CoachGAvatar = memo(function CoachGAvatar({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="relative group flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label="Ask Coach G about this game"
    >
      <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20 transition-all duration-200 group-hover:border-emerald-400 group-hover:scale-110 group-active:scale-95">
        <img 
          src={COACH_G_AVATAR} 
          alt="Coach G" 
          className="w-full h-full object-cover"
        />
      </div>
      <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-emerald-500/20 p-0.5">
        <CoachGExternalLinkIcon />
      </span>
    </button>
  );
});

/** + Watch button for adding to watchboard */
const WatchButton = memo(function WatchButton({ 
  onClick, 
  isInWatchboard 
}: { 
  onClick?: () => void;
  isInWatchboard?: boolean;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 min-h-[44px] sm:min-h-0",
        isInWatchboard
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
          : "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 hover:border-blue-400/50 active:scale-95"
      )}
      aria-label={isInWatchboard ? "In watchboard, add to another" : "Add to Watchboard"}
    >
      {isInWatchboard ? (
        <>
          <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span>In Watchboard</span>
        </>
      ) : (
        <>
          <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span>Watch</span>
        </>
      )}
    </button>
  );
});

/** Expanded Stats Section for Live Games */
const ExpandedStatsSection = memo(function ExpandedStatsSection({
  game,
  homeTeam,
  awayTeam,
}: {
  game: ApprovedScoreCardGame;
  homeTeam: string;
  awayTeam: string;
}) {
  // Line movement indicators
  const spreadOpen = game.spreadOpen ?? game.odds?.openSpread;
  const spreadCurrent = game.spread ?? game.odds?.spread;
  const totalOpen = game.totalOpen ?? game.odds?.openTotal;
  const totalCurrent = game.overUnder ?? game.odds?.total;
  
  const hasSpreadMovement = spreadOpen !== undefined && spreadCurrent !== undefined && spreadOpen !== spreadCurrent;
  const hasTotalMovement = totalOpen !== undefined && totalCurrent !== undefined && totalOpen !== totalCurrent;
  
  const getMovementIcon = (open: number, current: number) => {
    if (current > open) return <TrendingUp className="w-3 h-3 text-emerald-400" />;
    if (current < open) return <TrendingDown className="w-3 h-3 text-red-400" />;
    return <Minus className="w-3 h-3 text-slate-500" />;
  };
  
  const formatSpreadValue = (val: number) => val > 0 ? `+${val}` : `${val}`;

  return (
    <div className="px-3 py-3 bg-slate-900/50 border-t border-slate-700/50">
      {/* Line Movement Section */}
      {(hasSpreadMovement || hasTotalMovement) && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">
            Line Movement
          </div>
          <div className="grid grid-cols-2 gap-2">
            {hasSpreadMovement && (
              <div className="bg-slate-800/60 rounded-lg px-2.5 py-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Spread</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">{formatSpreadValue(spreadOpen!)}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-sm font-bold text-white">{formatSpreadValue(spreadCurrent!)}</span>
                    {getMovementIcon(spreadOpen!, spreadCurrent!)}
                  </div>
                </div>
              </div>
            )}
            {hasTotalMovement && (
              <div className="bg-slate-800/60 rounded-lg px-2.5 py-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Total</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">{totalOpen}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-sm font-bold text-white">{totalCurrent}</span>
                    {getMovementIcon(totalOpen!, totalCurrent!)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-800/40 rounded-lg py-2 px-1">
          <div className="text-lg font-bold text-white">{game.awayScore ?? 0}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">{awayTeam}</div>
        </div>
        <div className="bg-slate-800/40 rounded-lg py-2 px-1 flex flex-col items-center justify-center">
          <div className="text-xs text-amber-400 font-medium">{game.period || 'Live'}</div>
          {game.clock && (
            <div className="text-sm font-bold text-white">{game.clock}</div>
          )}
        </div>
        <div className="bg-slate-800/40 rounded-lg py-2 px-1">
          <div className="text-lg font-bold text-white">{game.homeScore ?? 0}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">{homeTeam}</div>
        </div>
      </div>
      
      {/* Tap for more hint */}
      <div className="mt-3 text-center">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          Tap again for full game details
        </span>
      </div>
    </div>
  );
});

// ====================
// MAIN COMPONENT - LOCKED DESIGN
// ====================

export const ApprovedScoreCard = memo(function ApprovedScoreCard({ 
  game, 
  onCoachClick,
  onClick,
  onWatchClick,
  isInWatchboard,
  quickAction,
  className,
  mode = 'detail',
  visualPreset = 'default',
}: ApprovedScoreCardProps) {
  const { flags } = useFeatureFlags();
  const { isFavorite } = useFavorites();
  const [isExpanded, setIsExpanded] = useState(false);
  const homeTeam = getTeamAbbr(game.homeTeam);
  const awayTeam = getTeamAbbr(game.awayTeam);
  const homeTeamName = getTeamName(game.homeTeam);
  const awayTeamName = getTeamName(game.awayTeam);
  
  // Use centralized game state system
  const { state: gameState, winnerSide, leaderSide } = computeGameState(
    game.status,
    game.homeScore,
    game.awayScore
  );
  
  const isLive = gameState === 'LIVE';
  const isScheduled = gameState === 'UPCOMING';
  const isFinal = gameState === 'FINAL';
  const gameIsFavorite = flags.GAME_FAVORITES_ENABLED ? isFavorite('game', game.id) : false;
  const isCompact = mode === 'compact';
  const isHubPreset = visualPreset === 'hub';
  const isSoccer = (game.sport || '').toUpperCase() === 'SOCCER';
  const isSoccerDraw = isSoccer
    && isFinal
    && typeof game.homeScore === 'number'
    && typeof game.awayScore === 'number'
    && game.homeScore === game.awayScore;
  
  // Debug mode: show ?debug=true in URL
  const isDebugMode = typeof window !== 'undefined' && window.location.search.includes('debug=true');
  
  // Winner/leader detection for styling
  const homeIsWinner = winnerSide === 'home';
  const awayIsWinner = winnerSide === 'away';
  const homeIsLoser = winnerSide === 'away'; // Home loses if away wins
  const awayIsLoser = winnerSide === 'home'; // Away loses if home wins
  const homeIsLeader = leaderSide === 'home';
  const awayIsLeader = leaderSide === 'away';
  
  const hasPublicBets = game.publicBetHome !== undefined || game.publicBetAway !== undefined;
  const showPredictor = !isCompact && Boolean(game.predictorText);
  const showPublicBets = !isCompact && hasPublicBets;
  const scheduledDateTimeParts = isScheduled ? formatStartDateTimeParts(game.startTime) : null;
  
  // Period/clock display for dark pill
  const getPeriodDisplay = () => {
    if (isScheduled) {
      const label = formatStartTime(game.startTime);
      if (!game.startTime) return label;
      const start = new Date(game.startTime);
      if (Number.isNaN(start.getTime())) return label;
      const now = Date.now();
      // If provider still says SCHEDULED after start time, surface that clearly.
      if (start.getTime() < now - 15 * 60 * 1000) {
        return `Started ${label}`;
      }
      return label;
    }
    if (isFinal) return formatFinalDateLabel(game.startTime);
    if (isLive) {
      if ((game.sport || '').toUpperCase() === 'SOCCER') {
        const soccerDisplay = formatSoccerLiveDisplay(
          game.period != null ? String(game.period) : undefined,
          game.clock != null ? String(game.clock) : undefined,
          game.startTime
        );
        if (soccerDisplay) return soccerDisplay;
      }
      if ((game.sport || '').toUpperCase() === 'MLB') {
        const mlbDisplay = parseMlbInningDisplay(
          game.period != null ? String(game.period) : undefined,
          game.clock != null ? String(game.clock) : undefined
        );
        if (mlbDisplay) return mlbDisplay;
      }
      const parts: string[] = [];
      if (game.period) parts.push(game.period);
      // Validate clock - exclude null, undefined, empty, or invalid 'null:null' values
      // Convert to string first since clock might be a number
      const clockStr = game.clock != null ? String(game.clock) : '';
      if (clockStr && clockStr !== 'null:null' && !clockStr.toLowerCase().includes('null')) {
        parts.push(clockStr);
      }
      if (game.possession) parts.push(game.possession === 'home' ? homeTeam : awayTeam);
      if (parts.length > 0) return parts.join(' • ');
      return 'Live';
    }
    return '';
  };
  
  // Card surface varies by state
  const getCardSurfaceClasses = () => {
    if (isSoccerDraw) {
      // DRAW: brighter full-card treatment so tied soccer finals stand out.
      return "bg-gradient-to-b from-cyan-500/20 via-slate-750/95 to-slate-900/95 border border-cyan-300/60";
    }
    if (isFinal) {
      // FINAL: Darker, settled, no glow effects
      return "bg-gradient-to-b from-slate-750/90 to-slate-850/95 border border-slate-700/40";
    }
    if (isLive) {
      if (isHubPreset) {
        return "bg-gradient-to-b from-[#1A2638]/98 via-[#121C2D]/98 to-[#0E1624]/98 border border-cyan-400/25";
      }
      // LIVE: Premium look, brighter
      return "bg-gradient-to-b from-slate-700/95 to-slate-800/98 border border-slate-600/30";
    }
    // UPCOMING: Match live card language for visual consistency in Games Today.
    if (isHubPreset) {
      return "bg-gradient-to-b from-[#172235]/98 via-[#111A2A]/98 to-[#0C1422]/98 border border-cyan-400/20";
    }
    return "bg-gradient-to-b from-slate-700/95 to-slate-800/98 border border-slate-600/30";
  };
  
  // Handle card click - toggle expansion for live games first, then navigate
  const handleCardClick = () => {
    if (isCompact) {
      onClick?.();
      return;
    }
    if (isLive && !isExpanded) {
      // First tap on live game: expand to show stats
      setIsExpanded(true);
    } else {
      // Second tap on expanded live game, or any tap on non-live: navigate
      onClick?.();
    }
  };

  const liveGlowClasses = LIVE_CARD_GLOW_CLASSES[LIVE_CARD_GLOW_PRESET];
  
  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300",
        // State-dependent card surface
        getCardSurfaceClasses(),
        // Deeper shadow for elevated floating effect
        "shadow-2xl shadow-black/60",
        "hover:border-slate-500/50 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]",
        // LIVE: subtle whole-card pulse treatment for stronger visibility.
        isLive && liveGlowClasses.ring,
        isLive && gameIsFavorite && "ring-2 ring-amber-300/60 shadow-[0_0_40px_rgba(251,191,36,0.24)]",
        // FINAL games have slightly increased edge contrast
        isFinal && "ring-1 ring-slate-700/30",
        isSoccerDraw && "ring-2 ring-cyan-300/70 shadow-[0_0_34px_rgba(34,211,238,0.45)]",
        isCompact && "h-full",
        className
      )}
    >
      {isLive && (
        <>
          <div
            className={cn(
              "pointer-events-none absolute inset-0 rounded-xl motion-reduce:animate-none",
              LIVE_CARD_GLOW_PRESET === 'broadcast' ? "animate-live-border-flash" : "animate-live-glow",
              liveGlowClasses.border
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-0 rounded-xl animate-pulse-glow motion-reduce:animate-none",
              liveGlowClasses.aura
            )}
          />
        </>
      )}
      {/* Subtle top-edge highlight for depth perception */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {/* Secondary inner glow */}
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-slate-400/10 to-transparent" />
      {/* ===== TOP ROW: State badge + League + Network + Coach G avatar ===== */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
          {/* State-specific badge with consistent position */}
          {isLive && <LivePill />}
          {isFinal && (isSoccerDraw ? <DrawBadge /> : <FinalVerifiedBadge isOvertime={game.isOvertime} />)}
          {isScheduled && <UpcomingBadge />}
          
          <span className="text-sm text-slate-300 font-bold">
            {getSportDisplayLabel(game.sport, game.league)}
          </span>
          
          {/* Expand indicator for live games */}
          {isLive && !isCompact && (
            <ChevronDown 
              className={cn(
                "w-4 h-4 text-amber-400 transition-transform duration-300",
                isExpanded && "rotate-180"
              )} 
            />
          )}
          
          {/* TV Network badge */}
          {game.channel && (
            <>
              <span className="text-slate-600">•</span>
              {getNetworkLogoUrl(game.channel) ? (
                <img 
                  src={getNetworkLogoUrl(game.channel)!} 
                  alt={game.channel}
                  className="h-4 w-auto object-contain opacity-80"
                  onError={(e) => {
                    // Fallback to text if image fails
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <span className={cn(
                "text-xs text-slate-500 font-medium uppercase tracking-wide max-w-[108px] truncate",
                getNetworkLogoUrl(game.channel) && "hidden"
              )}>
                {game.channel}
              </span>
            </>
          )}
        </div>
        <div className={cn("flex items-center gap-2 shrink-0", isCompact && "gap-1")}>
          {quickAction || (
            flags.GAME_FAVORITES_ENABLED && (
              <FavoriteEntityButton
                type="game"
                entityId={game.id}
                sport={String(game.sport || "").toLowerCase()}
                league={game.league || undefined}
                metadata={{
                  game_id: game.id,
                  home_team: homeTeamName,
                  away_team: awayTeamName,
                  home_code: homeTeam,
                  away_code: awayTeam,
                  status: game.status,
                }}
                compact
                className={cn(
                  "border-slate-600/60 bg-slate-950/70 hover:bg-slate-900/90",
                  gameIsFavorite && "border-amber-300/50 bg-amber-500/15 text-amber-200"
                )}
              />
            )
          )}
          {/* Game Context Chip - shows key betting signals */}
          {!isCompact && game.gameId && (
            <GameContextChip gameId={game.gameId} sport={game.sport} homeTeam={homeTeamName} awayTeam={awayTeamName} />
          )}
          {!isCompact && onWatchClick && (
            <WatchButton onClick={onWatchClick} isInWatchboard={isInWatchboard} />
          )}
          {!isCompact && <CoachGAvatar onClick={onCoachClick} />}
        </div>
      </div>
      
      {/* ===== SECOND ROW: Period • Time • Possession in dark pill ===== */}
      {getPeriodDisplay() && (
        <div className="flex justify-center pb-2">
          <div className={cn(
            "px-3 py-1 rounded-full",
            "bg-slate-800 border border-slate-700",
          )}>
            {isScheduled && scheduledDateTimeParts ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-200">
                  {scheduledDateTimeParts.isToday
                    ? scheduledDateTimeParts.time
                    : `${scheduledDateTimeParts.date} • ${scheduledDateTimeParts.time}`}
                </span>
              </span>
            ) : (
              <span className={cn(
                "text-sm font-medium",
                isLive ? "text-amber-400" : "text-slate-400"
              )}>
                {getPeriodDisplay()}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* ===== CENTER: Teams & BIG Scores ===== */}
      <div className="px-3 py-1.5">
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {/* Away Team */}
          <TeamBlock 
            abbr={awayTeam} 
            teamName={awayTeamName}
            logoUrl={game.awayLogoUrl}
            score={game.awayScore} 
            gameState={gameState}
            isWinner={awayIsWinner}
            isLoser={awayIsLoser}
            isLeader={awayIsLeader}
            hasPossession={game.possession === 'away'}
            sport={game.sport}
            league={game.league}
            rank={game.awayRank}
            sizePreset={isHubPreset ? 'hub' : 'default'}
          />
          
          {/* Centered @ */}
          <span className="text-xl sm:text-2xl font-bold text-slate-600">@</span>
          
          {/* Home Team */}
          <TeamBlock 
            abbr={homeTeam} 
            teamName={homeTeamName}
            logoUrl={game.homeLogoUrl}
            score={game.homeScore} 
            gameState={gameState}
            isWinner={homeIsWinner}
            isLoser={homeIsLoser}
            isLeader={homeIsLeader}
            hasPossession={game.possession === 'home'}
            sport={game.sport}
            league={game.league}
            rank={game.homeRank}
            sizePreset={isHubPreset ? 'hub' : 'default'}
          />
        </div>
      </div>
      
      {/* ===== DIVIDER ===== */}
      {showPredictor && (
        <div className="mx-3 border-t border-slate-700/50" />
      )}
      
      {/* ===== PREDICTION LINE: Green centered text ===== */}
      {showPredictor && (
        <div className="px-3 py-2 text-center">
          <span className="text-sm font-medium text-emerald-400">
            {game.predictorText}
          </span>
        </div>
      )}
      
      {/* ===== DIVIDER ===== */}
      {showPublicBets && (
        <div className="mx-3 border-t border-slate-700/50" />
      )}
      
      {/* ===== BOTTOM: Gold vs Blue percentage bar ===== */}
      {showPublicBets && (
        <div className="px-3 py-2">
          <PublicBetBar 
            homePercent={game.publicBetHome}
            awayPercent={game.publicBetAway}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            isFinal={gameState === 'FINAL'}
          />
        </div>
      )}
      
      {/* ===== EXPANDED STATS SECTION (Live games only) ===== */}
      {isLive && isExpanded && !isCompact && (
        <ExpandedStatsSection 
          game={game}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
        />
      )}
      
      {/* Live game bottom accent */}
      {isLive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
      )}
      
      {/* Debug mode: show winner/loser info when ?debug=true */}
      {isDebugMode && (
        <div className="px-4 py-2 text-xs font-mono text-slate-500 bg-slate-900/50 border-t border-slate-700/50">
          <div>gameState: {gameState} | winnerSide: {winnerSide} | leaderSide: {leaderSide}</div>
          <div>home: {game.homeScore} {homeIsWinner ? '✓WIN' : ''}{homeIsLoser ? '✗LOSE' : ''} | away: {game.awayScore} {awayIsWinner ? '✓WIN' : ''}{awayIsLoser ? '✗LOSE' : ''}</div>
        </div>
      )}
    </div>
  );
});

export default ApprovedScoreCard;
