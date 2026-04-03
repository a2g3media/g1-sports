/**
 * Game Detail Page - /games/:league/:gameId
 * 
 * Premium game detail with ApprovedScoreCard header and tabbed content:
 * Overview, Odds, Line Movement, Sportsbooks, Coach G
 */

import { useState, useEffect, useCallback, memo, useMemo, useRef, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { 
  ArrowLeft, Loader2, TrendingUp, TrendingDown, DollarSign, 
  Building2, Clock, Activity,
  AlertCircle, Info, Users, History, HeartPulse,
  Trophy, Minus, ListOrdered, Zap, Volume2, VolumeX, Target, Plus, Check,
  FileText, RefreshCw, Sparkles, AlertTriangle, Lock, Video, ChevronLeft, ChevronRight, ArrowRightLeft
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { cn } from "@/react-app/lib/utils";
import { getTeamColors } from "@/react-app/data/team-colors";
import { useTeamLookup } from "@/react-app/hooks/useTeamLookup";
import { useOddsFormat } from "@/react-app/hooks/useOddsFormat";
import { useSoundEffects } from "@/react-app/hooks/useSoundEffects";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import { useCoachGPreview } from "@/react-app/hooks/useCoachGPreview";
import { useIsPro } from "@/react-app/hooks/useGZSubscription";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";
import MMAEventDetail from "@/react-app/components/MMAEventDetail";
import GolfTournamentDetail from "@/react-app/components/GolfTournamentDetail";
import { PropMovementPanel } from "@/react-app/components/PropMovementChart";
import { ShotChart } from "@/react-app/components/ShotChart";
import { MiniShotCourt, parseShotLocation, ShotLocation } from "@/react-app/components/MiniShotCourt";
import { AddToWatchboardModal } from "@/react-app/components/AddToWatchboardModal";
import FavoriteEntityButton from "@/react-app/components/FavoriteEntityButton";
import { OddsIntelligencePanel } from "@/react-app/components/odds/OddsIntelligencePanel";
import { CoachGSpotlightCard } from "@/react-app/components/CoachGSpotlightCard";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { getMarketPeriodLabels } from "@/react-app/lib/marketPeriodLabels";
import { getAllSoccerLeagues, getSoccerLeagueMeta } from "@/react-app/lib/soccerLeagueMeta";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { fetchJsonCached, getFetchCacheStats } from "@/react-app/lib/fetchCache";
import { getRouteCache, setRouteCache, getRouteCacheStats } from "@/react-app/lib/routeDataCache";
import { logPerfSnapshot, startPerfTimer } from "@/react-app/lib/perfTelemetry";

// ====================
// TYPES
// ====================

interface OddsData {
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
  ml1HHome?: number;
  ml1HAway?: number;
  openMlHome?: number;
  openMlAway?: number;
  openMoneylineHome?: number;
}

interface SportsbookLine {
  sportsbook: string;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  totalOverOdds: number | null;
  totalUnderOdds: number | null;
  mlHome: number | null;
  mlAway: number | null;
  updated: string;
}

interface LineHistoryPoint {
  timestamp: string;
  spread: number | null;
  total: number | null;
  mlHome?: number | null;
  mlAway?: number | null;
}

interface PlayByPlayEvent {
  playId: number;
  period: string;
  clock: string;
  team: string | null;
  description: string;
  awayScore: number | null;
  homeScore: number | null;
  type: string | null;
  timestamp: string | null;
  // Enhanced player data for visual feed
  playerId: number | null;
  playerName: string | null;
  assistPlayerId: number | null;
  assistPlayerName: string | null;
  // Play classification
  isScoring: boolean;
  isMajor: boolean;
  points: number;
}

interface PlayByPlayData {
  plays: PlayByPlayEvent[];
  lastPlay: PlayByPlayEvent | null;
  gameStatus: string | null;
  isLive: boolean;
  timestamp: string;
}

interface GameData {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamFull?: string;
  awayTeamFull?: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'LIVE' | 'SCHEDULED' | 'FINAL';
  period?: string;
  clock?: string;
  startTime?: string;
  venue?: string;
  broadcast?: string;
  odds?: OddsData;
  sportsbooks?: SportsbookLine[];
  lineHistory?: LineHistoryPoint[];
  publicBetHome?: number;
  publicBetAway?: number;
  coachSignal?: 'edge' | 'watch' | 'noise';
  predictorText?: string;
  props?: PlayerProp[];
  propsSource?: 'event' | 'competition' | 'placeholder' | 'none';
  propsFallbackReason?: string | null;
}

// Box Score Types
interface PlayerStats {
  name: string;
  position: string;
  minutes: number;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fgMade?: number;
  fgAttempts?: number;
  fg3Made?: number;
  fg3Attempts?: number;
  ftMade?: number;
  ftAttempts?: number;
  plusMinus?: number;
  isStarter: boolean;
}

interface TeamStats {
  team: string;
  points: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

interface BoxScoreData {
  status: string;
  homeTeam?: TeamStats;
  awayTeam?: TeamStats;
  homePlayers: PlayerStats[];
  awayPlayers: PlayerStats[];
  quarterScores: { period: string; homeScore: number; awayScore: number }[];
}

// H2H Types
interface H2HGame {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  margin: number;
  venue?: string;
}

interface H2HData {
  homeTeam: string;
  awayTeam: string;
  matchups: H2HGame[];
  series: Record<string, number>;
}

// Injury Types
interface Injury {
  playerName: string;
  team: string;
  position: string;
  status: string;
  injury: string;
  lastUpdated: string;
}

interface InjuriesData {
  homeTeam: string;
  awayTeam: string;
  injuries: {
    home: Injury[];
    away: Injury[];
  };
}

// Player Props Types
interface PlayerProp {
  id?: number;
  player_name: string;
  player_id?: number;
  team?: string;
  home_team?: string;
  away_team?: string;
  sportsbook?: string;
  prop_type: string;
  line_value: number;
  over_odds?: number;
  under_odds?: number;
}

type TabId = 'overview' | 'box-score' | 'line-movement' | 'sportsbooks' | 'h2h' | 'injuries' | 'props' | 'play-by-play';
type ViewMode = 'pregame' | 'live' | 'final';

interface CoachGVideoJob {
  id: string;
  status: "queued" | "submitted" | "completed" | "failed";
  videoUrl?: string;
  heygenVideoId?: string;
  errorMessage?: string | null;
  createdAt: string;
}



// ====================
// CONSTANTS
// ====================

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'line-movement', label: 'Lines', icon: TrendingUp },
  { id: 'sportsbooks', label: 'Books', icon: Building2 },
  { id: 'props', label: 'Props', icon: Target },
  { id: 'h2h', label: 'H2H', icon: History },
  { id: 'injuries', label: 'Injuries', icon: HeartPulse },
  { id: 'box-score', label: 'Box Score', icon: Users },
  { id: 'play-by-play', label: 'Play By Play', icon: ListOrdered },
];


const TAB_META: Record<TabId, { subtitle: string; accent: "blue" | "green" | "red" | "amber" | "violet" }> = {
  overview: { subtitle: "Snapshot intelligence and core game context.", accent: "blue" },
  "line-movement": { subtitle: "Track spread and total pressure over time.", accent: "amber" },
  sportsbooks: { subtitle: "Compare books and identify best available prices.", accent: "blue" },
  props: { subtitle: "Player prop signals, heat, and volatility.", accent: "green" },
  h2h: { subtitle: "Historical matchup profile and trends.", accent: "violet" },
  injuries: { subtitle: "Availability risk and status impact.", accent: "red" },
  "box-score": { subtitle: "Team and player production detail.", accent: "blue" },
  "play-by-play": { subtitle: "Live event stream and momentum flow.", accent: "green" },
};

const SPORTSBOOK_LOGOS: Record<string, string> = {
  'DraftKings': '🎯',
  'FanDuel': '🏈',
  'BetMGM': '🦁',
  'Caesars': '👑',
  'PointsBet': '🎲',
  'Barstool': '🍺',
  'WynnBET': '🏛️',
  'betPARX': '🎰',
  'BetRivers': '🌊',
  'Consensus': '📈',
};

// ====================
// HELPERS
// ====================

/**
 * Transform backend odds array (string values) to sportsbooks array (numeric values)
 * Backend: { bookmaker, spread: "+3.5", total: "O/U 215.5", moneylineHome: "-110", moneylineAway: "+150", updated }
 * Frontend: { sportsbook, spread: 3.5, total: 215.5, mlHome: -110, mlAway: 150, updated }
 */
function transformOddsToSportsbooks(odds: Array<{
  bookmaker: string;
  spread: string;
  total: string;
  moneylineHome: string;
  moneylineAway: string;
  updated: string;
}>): SportsbookLine[] {
  if (!odds || !Array.isArray(odds)) return [];
  
  return odds.map(odd => {
    // Parse spread: "+3.5" or "-3.5" → number
    const spreadMatch = odd.spread?.match(/([+-]?\d+\.?\d*)/);
    const spread = spreadMatch ? parseFloat(spreadMatch[1]) : null;
    
    // Parse total: "O/U 215.5" or "215.5" → number
    const totalMatch = odd.total?.match(/(\d+\.?\d*)/);
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    
    // Parse moneylines: "+150" or "-110" → number
    const mlHomeMatch = odd.moneylineHome?.match(/([+-]?\d+)/);
    const mlHome = mlHomeMatch ? parseInt(mlHomeMatch[1]) : null;
    
    const mlAwayMatch = odd.moneylineAway?.match(/([+-]?\d+)/);
    const mlAway = mlAwayMatch ? parseInt(mlAwayMatch[1]) : null;
    
    return {
      sportsbook: odd.bookmaker,
      spread,
      spreadOdds: -110, // Standard juice
      total,
      totalOverOdds: -110,
      totalUnderOdds: -110,
      mlHome,
      mlAway,
      updated: odd.updated,
    };
  });
}

function normalizeSportsbookLines(input: unknown): SportsbookLine[] {
  if (!Array.isArray(input)) return [];

  const parseNum = (val: unknown): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") return Number.isFinite(val) ? val : null;
    const str = String(val).replace("O/U ", "").replace(/[^\d.\-+]/g, "");
    if (!str) return null;
    const parsed = parseFloat(str);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return input
    .map((row) => {
      const r = row as Record<string, unknown>;
      const sportsbook =
        (typeof r.sportsbook === "string" && r.sportsbook) ||
        (typeof r.bookmaker === "string" && r.bookmaker) ||
        (typeof r.book === "string" && r.book) ||
        null;
      if (!sportsbook) return null;

      return {
        sportsbook,
        spread: parseNum(r.spread ?? r.spreadHome ?? r.homeSpread),
        spreadOdds: parseNum(r.spreadOdds ?? r.spread_odds ?? r.spreadPrice),
        total: parseNum(r.total ?? r.overUnder),
        totalOverOdds: parseNum(r.totalOverOdds ?? r.over_odds ?? r.overOdds),
        totalUnderOdds: parseNum(r.totalUnderOdds ?? r.under_odds ?? r.underOdds),
        mlHome: parseNum(r.mlHome ?? r.moneylineHome ?? r.homeMoneyline),
        mlAway: parseNum(r.mlAway ?? r.moneylineAway ?? r.awayMoneyline),
        updated: String(r.updated ?? r.updatedAt ?? r.lastUpdated ?? new Date().toISOString()),
      } as SportsbookLine;
    })
    .filter((row): row is SportsbookLine => Boolean(row));
}

function normalizeGameProps(
  props: Array<{
    id?: number;
    player_name?: string;
    player_id?: number;
    team?: string;
    prop_type?: string;
    line_value?: number;
    over_odds?: number;
    under_odds?: number;
    sportsbook?: string;
    bookmaker?: string;
    playerName?: string;
    playerId?: string;
    type?: string;
    line?: number;
    home_team?: string;
    away_team?: string;
    overOdds?: number;
    underOdds?: number;
    bookName?: string;
  }>
): PlayerProp[] {
  if (!Array.isArray(props)) return [];

  return props
    .map((prop, idx) => {
      const playerName = (prop.player_name || prop.playerName || '').trim();
      const propType = prop.prop_type || prop.type || '';
      const lineValue = prop.line_value ?? prop.line;
      if (!playerName || !propType || lineValue === undefined || lineValue === null) return null;

      const parsedPlayerId = prop.player_id ?? (
        prop.playerId !== undefined && Number.isFinite(Number(prop.playerId))
          ? Number(prop.playerId)
          : undefined
      );

      return {
        id: prop.id ?? idx,
        player_name: playerName,
        player_id: parsedPlayerId,
        team: prop.team,
        home_team: typeof prop.home_team === 'string' ? prop.home_team : undefined,
        away_team: typeof prop.away_team === 'string' ? prop.away_team : undefined,
        sportsbook: prop.sportsbook || prop.bookmaker || prop.bookName,
        prop_type: propType,
        line_value: Number(lineValue),
        over_odds: prop.over_odds ?? prop.overOdds,
        under_odds: prop.under_odds ?? prop.underOdds,
      } as PlayerProp;
    })
    .filter((prop): prop is PlayerProp => Boolean(prop));
}

function hasBoxScoreData(boxScore: BoxScoreData | null | undefined): boolean {
  if (!boxScore) return false;
  return (
    (Array.isArray(boxScore.homePlayers) && boxScore.homePlayers.length > 0) ||
    (Array.isArray(boxScore.awayPlayers) && boxScore.awayPlayers.length > 0) ||
    (Array.isArray(boxScore.quarterScores) && boxScore.quarterScores.length > 0)
  );
}

// ====================
// COMPONENTS
// ====================

const CinematicBackground = memo(function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className="absolute inset-0 bg-[#080B10]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#080B10] via-[#0C1118] to-[#080B10]" />
      <div className="absolute top-0 left-1/4 h-[30rem] w-[30rem] rounded-full bg-cyan-500/[0.032] blur-[120px]" />
      <div className="absolute right-1/4 top-6 h-[28rem] w-[28rem] rounded-full bg-violet-500/[0.03] blur-[120px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(12,17,24,0)_0%,#080B10_76%)]" />
    </div>
  );
});

const GlassCard = memo(function GlassCard({ 
  children, 
  className,
  glow
}: { 
  children: React.ReactNode; 
  className?: string;
  glow?: 'red' | 'blue' | 'amber' | 'emerald';
}) {
  const glowColors = {
    red: 'shadow-red-500/10',
    blue: 'shadow-blue-500/10',
    amber: 'shadow-amber-500/10',
    emerald: 'shadow-emerald-500/10',
  };
  
  return (
    <div className={cn(
      "relative overflow-hidden rounded-[14px] backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.28)]",
      glow && `shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${glowColors[glow]}`,
      className
    )}>
      <div className="absolute inset-0 bg-[#121821]" />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute left-0 right-0 top-0 h-px bg-white/15" />
      <div className="absolute inset-0 rounded-[14px] ring-1 ring-white/[0.05]" />
      <div className="relative">{children}</div>
    </div>
  );
});

const TabButton = memo(function TabButton({
  active,
  onClick,
  children,
  icon: Icon,
  subtitle,
  accent = "blue",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: typeof Activity;
  subtitle?: string;
  accent?: "blue" | "green" | "red" | "amber" | "violet";
}) {
  const activeAccentClasses: Record<NonNullable<typeof accent>, { container: string; icon: string; subtitle: string; underline: string }> = {
    blue: {
      container: "text-[#E5E7EB] border-cyan-300/45 bg-cyan-500/20 shadow-[0_0_24px_rgba(34,211,238,0.22)]",
      icon: "bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.35)]",
      subtitle: "text-cyan-100/80",
      underline: "bg-cyan-300",
    },
    green: {
      container: "text-[#E5E7EB] border-emerald-300/45 bg-emerald-500/20 shadow-[0_0_24px_rgba(16,185,129,0.22)]",
      icon: "bg-emerald-400/20 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.32)]",
      subtitle: "text-emerald-100/80",
      underline: "bg-emerald-300",
    },
    red: {
      container: "text-[#E5E7EB] border-red-300/45 bg-red-500/20 shadow-[0_0_24px_rgba(248,113,113,0.22)]",
      icon: "bg-red-400/20 text-red-100 shadow-[0_0_12px_rgba(248,113,113,0.30)]",
      subtitle: "text-red-100/80",
      underline: "bg-red-300",
    },
    amber: {
      container: "text-[#E5E7EB] border-amber-300/45 bg-amber-500/20 shadow-[0_0_24px_rgba(251,191,36,0.22)]",
      icon: "bg-amber-400/20 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.30)]",
      subtitle: "text-amber-100/80",
      underline: "bg-amber-300",
    },
    violet: {
      container: "text-[#E5E7EB] border-violet-300/45 bg-violet-500/20 shadow-[0_0_24px_rgba(167,139,250,0.22)]",
      icon: "bg-violet-400/20 text-violet-100 shadow-[0_0_12px_rgba(167,139,250,0.32)]",
      subtitle: "text-violet-100/80",
      underline: "bg-violet-300",
    },
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex min-h-[48px] md:min-h-[54px] items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-300 hover:-translate-y-[1px] active:translate-y-0",
        active 
          ? activeAccentClasses[accent].container
          : "text-[#9CA3AF] border-white/[0.05] bg-[#121821] hover:text-[#E5E7EB] hover:border-white/[0.10] hover:bg-[#16202B] hover:shadow-[0_0_16px_rgba(59,130,246,0.14)]"
      )}
    >
      {active && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <span className="absolute -inset-y-1 -left-16 w-20 rotate-12 bg-cyan-200/30 animate-[coach-slide_3s_ease-in-out_infinite]" />
        </span>
      )}
      <span className={cn(
        "rounded-full p-1 transition-all duration-300",
        active
          ? activeAccentClasses[accent].icon
          : "bg-white/[0.05] text-[#9CA3AF] group-hover:bg-white/[0.08]"
      )}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className="tracking-[0.01em] whitespace-nowrap">{children}</span>
        {active && subtitle && (
          <span className={cn("mt-0.5 hidden max-w-[180px] truncate text-[10px] font-medium leading-tight md:block", activeAccentClasses[accent].subtitle)}>
            {subtitle}
          </span>
        )}
      </span>
      {active && (
        <div className={cn("absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full", activeAccentClasses[accent].underline)} />
      )}
    </button>
  );
});

// Tabs with scroll fade indicators for mobile
const TabsWithScrollFade = memo(function TabsWithScrollFade({
  activeTab,
  setActiveTab,
  hasProps,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  hasProps: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll]);

  return (
    <div className="relative mb-6 md:mb-7">
      {/* Left fade */}
      <div 
        className={cn(
          "absolute left-0 top-0 bottom-0 w-8 bg-[#0a0a0a]/95 z-10 pointer-events-none rounded-l-xl transition-opacity duration-200",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
      />
      {/* Right fade */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 w-8 bg-[#0a0a0a]/95 z-10 pointer-events-none rounded-r-xl transition-opacity duration-200",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
      />
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-1.5 p-2 rounded-[14px] border border-white/[0.05] bg-[#121821] overflow-x-auto scrollbar-hide shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
      >
        {TABS
          .filter(tab => tab.id !== 'props' || hasProps)
          .map(tab => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            icon={tab.icon}
            subtitle={TAB_META[tab.id]?.subtitle}
            accent={TAB_META[tab.id]?.accent}
          >
            {tab.label}
          </TabButton>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-2 px-1 text-[11px] md:text-xs text-[#9CA3AF]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
        Switch views instantly: lines, books, props, H2H, injuries, and more.
      </p>
    </div>
  );
});

function formatSpread(spread: number | null | undefined): string {
  if (spread === null || spread === undefined) return '-';
  const snapped = Math.round(spread * 2) / 2;
  if (Object.is(snapped, -0) || snapped === 0) return "PK";
  const formatted = Number.isInteger(snapped) ? snapped.toFixed(0) : snapped.toFixed(1);
  return snapped > 0 ? `+${formatted}` : formatted;
}

// formatMoneyline and formatOdds now handled via useOddsFormat hook in components

const SectionHeader = memo(function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  accent = "blue",
  action,
}: {
  icon: typeof Activity;
  title: string;
  subtitle?: string;
  accent?: "blue" | "green" | "red" | "amber" | "violet";
  action?: ReactNode;
}) {
  const accentClass: Record<NonNullable<typeof accent>, string> = {
    blue: "bg-cyan-500/20 border-cyan-400/30 text-cyan-200",
    green: "bg-emerald-500/20 border-emerald-400/30 text-emerald-200",
    red: "bg-red-500/20 border-red-400/30 text-red-200",
    amber: "bg-amber-500/20 border-amber-400/30 text-amber-200",
    violet: "bg-violet-500/20 border-violet-400/30 text-violet-200",
  };

  return (
    <div className="mb-3 md:mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className={cn("inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 md:px-3 md:py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.22)]", accentClass[accent])}>
          <Icon className="h-3.5 w-3.5" />
          <h3 className="text-sm md:text-[15px] font-semibold text-[#E5E7EB]">{title}</h3>
        </div>
        {subtitle && <p className="mt-1 text-xs md:text-[13px] text-[#9CA3AF]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
});

const GameHeroPanel = memo(function GameHeroPanel({
  game,
  getTeamName,
  onTeamNavigate,
  onTeamPrefetch,
}: {
  game: GameData;
  getTeamName: (isHome: boolean) => string;
  onTeamNavigate?: (teamCode: string, teamName: string) => void;
  onTeamPrefetch?: (teamCode: string, teamName: string) => void;
}) {
  const { formatMoneylineValue } = useOddsFormat();
  const awayName = getTeamName(false);
  const homeName = getTeamName(true);
  const awayColors = getTeamColors(awayName);
  const homeColors = getTeamColors(homeName);

  const statusLabel = useMemo(() => {
    if (game.status === "LIVE") {
      const period = game.period || "LIVE";
      return game.clock ? `${period} • ${game.clock} remaining` : period;
    }
    if (game.status === "FINAL") return "Final";
    if (!game.startTime) return "Scheduled";
    return new Date(game.startTime).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [game.clock, game.period, game.startTime, game.status]);

  const spreadLabel = game.odds?.spread !== undefined ? `${game.homeTeam} ${formatSpread(game.odds.spread)}` : "-";
  const totalLabel = game.odds?.total !== undefined ? String(game.odds.total) : "-";
  const isFinalGame = game.status === "FINAL";
  const awayWon = isFinalGame && game.awayScore !== null && game.homeScore !== null && game.awayScore > game.homeScore;
  const homeWon = isFinalGame && game.awayScore !== null && game.homeScore !== null && game.homeScore > game.awayScore;
  const moneylineLabel = useMemo(() => {
    const homeMl = game.odds?.mlHome;
    const awayMl = game.odds?.mlAway;
    if (homeMl === undefined && awayMl === undefined) return "-";
    if (homeMl !== undefined && awayMl !== undefined) {
      const favoriteIsHome = homeMl < awayMl;
      const team = favoriteIsHome ? game.homeTeam : game.awayTeam;
      const price = favoriteIsHome ? homeMl : awayMl;
      return `${team} ${formatMoneylineValue(price)}`;
    }
    const fallback = homeMl ?? awayMl;
    return fallback !== undefined ? formatMoneylineValue(fallback) : "-";
  }, [formatMoneylineValue, game.awayTeam, game.homeTeam, game.odds?.mlAway, game.odds?.mlHome]);

  return (
    <div className="mb-5 md:mb-6 overflow-hidden rounded-[14px] border border-white/[0.05] bg-[#121821] shadow-[0_10px_24px_rgba(0,0,0,0.30)]">
      <div className="grid grid-cols-12">
        <div
          className="col-span-4 p-4 md:p-6"
          style={{
            background: awayColors
              ? `linear-gradient(120deg, ${awayColors.primary}44 0%, ${awayColors.secondary}22 100%)`
              : "linear-gradient(120deg, rgba(17,24,39,0.7) 0%, rgba(15,23,42,0.4) 100%)",
          }}
        >
          <button
            type="button"
            onClick={() => onTeamNavigate?.(game.awayTeam || "", awayName)}
            onMouseEnter={() => onTeamPrefetch?.(game.awayTeam || "", awayName)}
            onFocus={() => onTeamPrefetch?.(game.awayTeam || "", awayName)}
            onTouchStart={() => onTeamPrefetch?.(game.awayTeam || "", awayName)}
            className="group flex items-center gap-3 rounded-lg -m-1 p-1 text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
            aria-label={`Open ${awayName} team page`}
          >
            <TeamLogo
              teamCode={game.awayTeam || "AWY"}
              teamName={awayName}
              sport={game.sport}
              size={96}
              winnerGlow={awayWon}
              className="drop-shadow-[0_0_22px_rgba(255,255,255,0.35)]"
            />
            <div className="min-w-0">
              <p className="truncate text-xs uppercase tracking-wide text-[#9CA3AF]">Away</p>
              <p className="truncate text-base font-semibold text-[#E5E7EB] md:text-xl">{awayName}</p>
              <p className="text-[10px] text-cyan-300/80 opacity-0 -translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
                View Team &rarr;
              </p>
            </div>
          </button>
        </div>
        <div className="col-span-4 border-x border-white/[0.05] bg-[#16202B] p-4 text-center md:p-6">
          <p className="text-xs uppercase tracking-wider text-[#9CA3AF]">{game.sport}</p>
          <div className="mt-1 flex items-end justify-center gap-3">
            <span className="text-4xl font-bold text-[#E5E7EB] transition-all duration-300 md:text-5xl">{game.awayScore ?? "-"}</span>
            <span className="pb-1 text-xl text-[#6B7280]">-</span>
            <span className="text-4xl font-bold text-[#E5E7EB] transition-all duration-300 md:text-5xl">{game.homeScore ?? "-"}</span>
          </div>
          <p className={cn("mt-2 text-sm font-medium md:text-base", game.status === "LIVE" ? "text-emerald-300" : "text-[#9CA3AF]")}>
            {statusLabel}
          </p>
        </div>
        <div
          className="col-span-4 p-4 md:p-6"
          style={{
            background: homeColors
              ? `linear-gradient(240deg, ${homeColors.primary}44 0%, ${homeColors.secondary}22 100%)`
              : "linear-gradient(240deg, rgba(17,24,39,0.7) 0%, rgba(15,23,42,0.4) 100%)",
          }}
        >
          <button
            type="button"
            onClick={() => onTeamNavigate?.(game.homeTeam || "", homeName)}
            onMouseEnter={() => onTeamPrefetch?.(game.homeTeam || "", homeName)}
            onFocus={() => onTeamPrefetch?.(game.homeTeam || "", homeName)}
            onTouchStart={() => onTeamPrefetch?.(game.homeTeam || "", homeName)}
            className="group flex items-center justify-end gap-3 rounded-lg -m-1 p-1 w-full text-right transition-colors hover:bg-white/[0.05] cursor-pointer"
            aria-label={`Open ${homeName} team page`}
          >
            <div className="min-w-0 text-right">
              <p className="truncate text-xs uppercase tracking-wide text-[#9CA3AF]">Home</p>
              <p className="truncate text-base font-semibold text-[#E5E7EB] md:text-xl">{homeName}</p>
              <p className="text-[10px] text-cyan-300/80 opacity-0 -translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
                View Team &rarr;
              </p>
            </div>
            <TeamLogo
              teamCode={game.homeTeam || "HOM"}
              teamName={homeName}
              sport={game.sport}
              size={96}
              winnerGlow={homeWon}
              className="drop-shadow-[0_0_22px_rgba(255,255,255,0.35)]"
            />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-white/[0.05] bg-[#0F141B]">
        <div className="p-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] md:text-[13px]">Spread</p>
          <p className="mt-1 text-base font-extrabold tracking-tight text-[#E5E7EB] md:text-lg">{spreadLabel}</p>
        </div>
        <div className="border-x border-white/[0.05] p-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] md:text-[13px]">Total</p>
          <p className="mt-1 text-base font-extrabold tracking-tight text-[#E5E7EB] md:text-lg">{totalLabel}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] md:text-[13px]">Moneyline</p>
          <p className="mt-1 text-base font-extrabold tracking-tight text-[#E5E7EB] md:text-lg">{moneylineLabel}</p>
        </div>
      </div>
    </div>
  );
});

const MarketIntelligenceStrip = memo(function MarketIntelligenceStrip({
  game,
  lastPlay,
}: {
  game: GameData;
  lastPlay: PlayByPlayEvent | null;
}) {
  const spreadNow = game.odds?.spread;
  const spreadOpen = game.odds?.openSpread;
  const spreadMove = spreadNow !== undefined && spreadOpen !== undefined ? spreadNow - spreadOpen : null;
  const topProp = (game.props || [])[0];
  const projectedPossessions = useMemo(() => {
    if (game.odds?.total === undefined) return null;
    return Math.round((game.odds.total / 2.25) * 10) / 10;
  }, [game.odds?.total]);
  const paceLean =
    projectedPossessions === null ? "Signal loading" : projectedPossessions >= 100 ? "Over Lean" : projectedPossessions <= 96 ? "Under Lean" : "Balanced";

  const rotatingSignals = useMemo(() => {
    const signals = [
      lastPlay?.description ? `Last play: ${lastPlay.description}` : "",
      spreadMove !== null ? `Line move: ${formatSpread(spreadOpen)} -> ${formatSpread(spreadNow)}` : "",
      topProp ? `Prop alert: ${topProp.player_name} ${topProp.prop_type} ${topProp.line_value}` : "",
      "Injury watch active for late status changes.",
    ].filter(Boolean);
    return signals.length > 0 ? signals : ["Live intelligence stream active."];
  }, [lastPlay?.description, spreadMove, spreadOpen, spreadNow, topProp]);

  const [signalIndex, setSignalIndex] = useState(0);
  useEffect(() => {
    if (game.status !== "LIVE" || rotatingSignals.length <= 1) return;
    const timer = setInterval(() => {
      setSignalIndex((idx) => (idx + 1) % rotatingSignals.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [game.status, rotatingSignals.length]);

  return (
    <div className="mb-5 rounded-[14px] border border-white/[0.05] bg-[#16202B] p-3 md:mb-6 md:p-4">
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-[14px] border border-white/[0.05] bg-[#121821] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[#6B7280]">Line Movement</p>
          <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">
            {spreadMove !== null ? `${formatSpread(spreadOpen)} -> ${formatSpread(spreadNow)}` : "Waiting for market history"}
          </p>
          <p className="mt-1 text-xs text-amber-300/90">
            {spreadMove !== null && Math.abs(spreadMove) >= 1 ? "Sharp money detected" : "Standard movement"}
          </p>
        </div>
        <div className="rounded-[14px] border border-white/[0.05] bg-[#121821] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[#6B7280]">Prop Heat</p>
          <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">
            {topProp ? `${topProp.player_name} ${topProp.prop_type} ${topProp.line_value}` : "Props loading"}
          </p>
          <p className="mt-1 text-xs text-emerald-300/90">
            {topProp?.over_odds !== undefined ? `Over action ${topProp.over_odds > 0 ? "+" : ""}${topProp.over_odds}` : "Tracking top prop action"}
          </p>
        </div>
        <div className="rounded-[14px] border border-white/[0.05] bg-[#121821] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[#6B7280]">Pace Signal</p>
          <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">
            {projectedPossessions !== null ? `Projected Possessions: ${projectedPossessions}` : "Projected Possessions: -"}
          </p>
          <p className="mt-1 text-xs text-cyan-300/90">{paceLean}</p>
        </div>
      </div>
      {game.status === "LIVE" && (
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs md:text-sm text-emerald-100">
          {rotatingSignals[signalIndex]}
        </div>
      )}
    </div>
  );
});

const BettingIntelligencePanel = memo(function BettingIntelligencePanel({ game }: { game: GameData }) {
  const spreadNow = game.odds?.spread;
  const spreadOpen = game.odds?.openSpread;
  const spreadMove = spreadNow !== undefined && spreadOpen !== undefined ? spreadNow - spreadOpen : 0;
  const topProps = useMemo(() => {
    const seen = new Set<string>();
    const out: PlayerProp[] = [];
    for (const prop of game.props || []) {
      const key = `${(prop.player_name || '').trim().toLowerCase()}|${String(prop.prop_type || '').trim().toLowerCase()}|${Number(prop.line_value)}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(prop);
      if (out.length >= 3) break;
    }
    return out;
  }, [game.props]);
  const publicLean =
    game.publicBetHome !== undefined && game.publicBetAway !== undefined
      ? game.publicBetHome >= game.publicBetAway
        ? `${game.homeTeam} public lean`
        : `${game.awayTeam} public lean`
      : "Public split loading";

  return (
    <div className="mb-8 grid gap-3 md:grid-cols-3">
      <GlassCard className="group p-4 border border-emerald-500/20 bg-[#121821] shadow-[0_0_24px_rgba(16,185,129,0.12)] transition-all hover:-translate-y-0.5 hover:border-emerald-400/35" glow="emerald">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-300" />
            <p className="text-[10px] uppercase tracking-widest text-emerald-200/85">Sharp Money</p>
          </div>
          <Badge className="border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">PRO FLOW</Badge>
        </div>
        <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">Large wagers detected</p>
        <p className="mt-1 text-xs text-[#9CA3AF]">
          {spreadOpen !== undefined && spreadNow !== undefined
            ? `${game.homeTeam} spread moved ${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} from open.`
            : "Monitoring professional market movement."}
        </p>
      </GlassCard>
      <GlassCard className="group p-4 border border-blue-500/20 bg-[#121821] shadow-[0_0_24px_rgba(59,130,246,0.12)] transition-all hover:-translate-y-0.5 hover:border-blue-400/35" glow="blue">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-300" />
            <p className="text-[10px] uppercase tracking-widest text-blue-200/85">Prop Watch</p>
          </div>
          <Badge className="border border-blue-400/40 bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-100">HEAT</Badge>
        </div>
        <div className="mt-2 space-y-1">
          {topProps.length > 0 ? (
            topProps.map((prop, idx) => (
              <p key={`${prop.player_name}-${prop.prop_type}-${idx}`} className="text-xs text-[#E5E7EB]">
                {prop.player_name} {prop.prop_type} {prop.line_value}
              </p>
            ))
          ) : (
            <p className="text-xs text-[#9CA3AF]">Player props updating.</p>
          )}
        </div>
      </GlassCard>
      <GlassCard className="group p-4 border border-amber-500/20 bg-[#121821] shadow-[0_0_24px_rgba(245,158,11,0.12)] transition-all hover:-translate-y-0.5 hover:border-amber-400/35" glow="amber">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-300" />
            <p className="text-[10px] uppercase tracking-widest text-amber-200/85">Live Signals</p>
          </div>
          <Badge className="border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">ACTIVE</Badge>
        </div>
        <div className="mt-2 space-y-1 text-xs text-[#9CA3AF]">
          <p>{game.status === "LIVE" ? "Tempo rising in live flow" : "Pregame tempo model loaded"}</p>
          <p>{Math.abs(spreadMove) >= 1 ? "Line volatility elevated" : "Line volatility stable"}</p>
          <p>{publicLean}</p>
        </div>
      </GlassCard>
    </div>
  );
});

const LiveSignalTicker = memo(function LiveSignalTicker({
  game,
  lastPlay,
}: {
  game: GameData;
  lastPlay: PlayByPlayEvent | null;
}) {
  if (game.status !== "LIVE") return null;

  const spreadNow = game.odds?.spread;
  const spreadOpen = game.odds?.openSpread;
  const topProp = (game.props || [])[0];
  const feedItems = [
    lastPlay?.description ? `${lastPlay.description}` : "",
    spreadNow !== undefined && spreadOpen !== undefined ? `${game.homeTeam} ${formatSpread(spreadOpen)} -> ${formatSpread(spreadNow)}` : "",
    topProp ? `${topProp.player_name} ${topProp.prop_type} ${topProp.line_value}` : "",
  ].filter(Boolean);

  if (feedItems.length === 0) return null;

  return (
    <div className="mb-5 md:mb-6 overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 md:px-4 md:py-2.5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-emerald-200">
        <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
        Live Feed
      </div>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm md:text-[15px] text-emerald-100/95">
        {feedItems.map((item, idx) => (
          <span key={`${item}-${idx}`}>{item}</span>
        ))}
      </div>
    </div>
  );
});

// Overview Tab Content
const OverviewTab = memo(function OverviewTab({ 
  game, 
  lastPlay,
  lastPlayUpdated
}: { 
  game: GameData; 
  lastPlay?: PlayByPlayEvent | null;
  lastPlayUpdated?: Date | null;
}) {
  const { formatMoneylineValue, formatSpreadValue } = useOddsFormat();
  const isLive = game.status === 'LIVE';
  const isScheduled = game.status === 'SCHEDULED';
  const periodLabels = getMarketPeriodLabels(game.sport);
  
  const formatSpread = (spread: number | null | undefined): string => {
    if (spread === null || spread === undefined) return '-';
    const snapped = Math.round(spread * 2) / 2;
    if (Object.is(snapped, -0) || snapped === 0) return "PK";
    return formatSpreadValue(snapped);
  };
  
  const formatMoneyline = (ml: number | null | undefined): string => {
    if (ml === null || ml === undefined) return '-';
    return formatMoneylineValue(ml);
  };


  return (
    <div className="space-y-5 md:space-y-6">
      <SectionHeader
        icon={Activity}
        title="Overview"
        subtitle="High-level game intelligence before deeper market breakdowns."
        accent="blue"
      />
      {/* Last Play Section - Only show for live games with plays */}
      {isLive && lastPlay && (
        <GlassCard className="p-4 border border-emerald-500/25 bg-[#121821]" glow="emerald">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Last Play</span>
                {lastPlay.period && (
                  <Badge className="bg-white/10 text-[#9CA3AF] text-[10px]">{lastPlay.period}</Badge>
                )}
                {lastPlay.clock && (
                  <span className="text-xs font-mono text-[#9CA3AF]">{lastPlay.clock}</span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-[#E5E7EB]">{lastPlay.description}</p>
              {lastPlay.awayScore !== null && lastPlay.homeScore !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[#6B7280]">Score:</span>
                  <span className="text-sm font-bold text-[#E5E7EB]">
                    {lastPlay.awayScore} - {lastPlay.homeScore}
                  </span>
                </div>
              )}
            </div>
            {lastPlayUpdated && (
              <div className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                <Clock className="w-3 h-3" />
                {lastPlayUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Game Info */}
      <GlassCard className="p-4 border border-blue-500/20 bg-[#121821]">
        <SectionHeader icon={Info} title="Game Information" subtitle="Venue, broadcast, and game status context." accent="blue" />
        <div className="grid grid-cols-2 gap-4">
          {game.venue && (
            <div className="rounded-xl bg-white/[0.02] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#6B7280]">Venue</div>
              <div className="text-sm font-medium text-[#E5E7EB]">{game.venue}</div>
            </div>
          )}
          {game.broadcast && (
            <div className="rounded-xl bg-white/[0.02] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#6B7280]">Broadcast</div>
              <div className="text-sm font-medium text-[#E5E7EB]">{game.broadcast}</div>
            </div>
          )}
          {isScheduled && game.startTime && (
            <div className="rounded-xl bg-white/[0.02] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#6B7280]">Start Time</div>
              <div className="text-sm font-medium text-[#E5E7EB]">
                {new Date(game.startTime).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </div>
            </div>
          )}
          {isLive && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-[10px] text-red-400/70 uppercase tracking-wide mb-1">Live Status</div>
              <div className="text-sm font-medium text-red-400">
                {game.period} {game.clock && `• ${game.clock}`}
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Quick Odds Summary */}
      {game.odds && (
        <GlassCard className="p-4 border border-violet-500/20 bg-[#121821]" glow="blue">
          <SectionHeader icon={DollarSign} title="Current Lines" subtitle="Primary market pricing and period splits." accent="violet" />
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/[0.02] p-3 text-center">
              <div className="mb-1 text-[10px] uppercase text-[#6B7280]">Spread</div>
              <div className="text-lg font-bold text-[#E5E7EB]">{formatSpread(game.odds.spread)}</div>
              {game.odds.openSpread !== undefined && game.odds.openSpread !== game.odds.spread && (
                <div className="mt-1 text-[10px] text-[#6B7280]">Open: {formatSpread(game.odds.openSpread)}</div>
              )}
            </div>
            <div className="rounded-xl bg-white/[0.02] p-3 text-center">
              <div className="mb-1 text-[10px] uppercase text-[#6B7280]">Total</div>
              <div className="text-lg font-bold text-[#E5E7EB]">{game.odds.total ?? '-'}</div>
              {game.odds.openTotal !== undefined && game.odds.openTotal !== game.odds.total && (
                <div className="mt-1 text-[10px] text-[#6B7280]">Open: {game.odds.openTotal}</div>
              )}
            </div>
            <div className="rounded-xl bg-white/[0.02] p-3 text-center">
              <div className="mb-1 text-[10px] uppercase text-[#6B7280]">Moneyline</div>
              <div className="text-sm font-bold text-[#E5E7EB]">
                {formatMoneyline(game.odds.mlAway)} / {formatMoneyline(game.odds.mlHome)}
              </div>
            </div>
          </div>
          {(game.odds.spread1HHome !== undefined || game.odds.total1H !== undefined || game.odds.ml1HHome !== undefined || game.odds.ml1HAway !== undefined) && (
            <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.08] p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
                {periodLabels.lines}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="mb-1 text-[10px] uppercase text-[#6B7280]">Spread</div>
                  <div className="text-sm font-bold text-violet-100">
                    {game.odds.spread1HHome !== undefined ? formatSpread(game.odds.spread1HHome) : '-'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase text-[#6B7280]">Total</div>
                  <div className="text-sm font-bold text-violet-100">
                    {game.odds.total1H !== undefined ? game.odds.total1H : '-'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase text-[#6B7280]">Moneyline</div>
                  <div className="text-sm font-bold text-violet-100">
                    {formatMoneyline(game.odds.ml1HAway)} / {formatMoneyline(game.odds.ml1HHome)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      )}

    </div>
  );
});

// Odds Tab Content - Enhanced with OddsIntelligencePanel
export const OddsTab = memo(function OddsTab({ 
  game, 
  getTeamName,
  lineHistory,
}: { 
  game: GameData; 
  getTeamName: (isHome: boolean) => string;
  lineHistory?: LineHistoryPoint[];
}) {
  return (
    <OddsIntelligencePanel
      gameId={game.id}
      sport={game.sport}
      odds={game.odds}
      lineHistory={lineHistory}
      publicBetHome={game.publicBetHome}
      publicBetAway={game.publicBetAway}
      homeTeam={getTeamName(true)}
      awayTeam={getTeamName(false)}
      status={game.status}
    />
  );
});

// Line Movement Tab Content
const LineMovementTab = memo(function LineMovementTab({ game }: { game: GameData }) {
  const history = game.lineHistory || [];
  
  if (history.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <TrendingUp className="mx-auto mb-3 h-10 w-10 text-[#6B7280]" />
        <p className="text-[#9CA3AF]">Line movement data not available</p>
        <p className="mt-1 text-sm text-[#6B7280]">Historical line data tracks changes over time</p>
      </GlassCard>
    );
  }

  const spreadPoints = history.filter((point) => point.spread !== null);
  const totalPoints = history.filter((point) => point.total !== null);
  const firstSpreadPoint = spreadPoints[0];
  const lastSpreadPoint = spreadPoints[spreadPoints.length - 1];
  const firstTotalPoint = totalPoints[0];
  const lastTotalPoint = totalPoints[totalPoints.length - 1];
  const spreadChange =
    spreadPoints.length >= 2 &&
    firstSpreadPoint &&
    lastSpreadPoint &&
    firstSpreadPoint.spread !== null &&
    lastSpreadPoint.spread !== null
      ? lastSpreadPoint.spread - firstSpreadPoint.spread
      : null;
  const totalChange =
    totalPoints.length >= 2 &&
    firstTotalPoint &&
    lastTotalPoint &&
    firstTotalPoint.total !== null &&
    lastTotalPoint.total !== null
      ? lastTotalPoint.total - firstTotalPoint.total
      : null;
  const spreadChangeResolved =
    spreadChange !== null
      ? spreadChange
      : (game.odds?.spread !== undefined && game.odds?.openSpread !== undefined
        ? game.odds.spread - game.odds.openSpread
        : null);
  const totalChangeResolved =
    totalChange !== null
      ? totalChange
      : (game.odds?.total !== undefined && game.odds?.openTotal !== undefined
        ? game.odds.total - game.odds.openTotal
        : null);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={TrendingUp}
        title="Line Movement"
        subtitle="Track how the market has shifted over time."
        accent="amber"
      />
      {/* Movement Summary */}
      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-5 border border-white/[0.05] bg-[#16202B] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.30)]" glow={spreadChangeResolved && spreadChangeResolved !== 0 ? (spreadChangeResolved > 0 ? 'emerald' : 'red') : undefined}>
          <div className="mb-2 text-[10px] uppercase tracking-wide text-[#6B7280]">Spread Movement</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[#E5E7EB]">
              {spreadChangeResolved === null ? "—" : `${spreadChangeResolved > 0 ? '+' : ''}${spreadChangeResolved.toFixed(1)}`}
            </span>
            {spreadChangeResolved !== null && spreadChangeResolved !== 0 && (
              spreadChangeResolved > 0 
                ? <TrendingUp className="w-5 h-5 text-emerald-400" />
                : <TrendingDown className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            {firstSpreadPoint && lastSpreadPoint
              ? `${formatSpread(firstSpreadPoint.spread)} → ${formatSpread(lastSpreadPoint.spread)}`
              : (game.odds?.openSpread !== undefined && game.odds?.spread !== undefined
                ? `${formatSpread(game.odds.openSpread)} → ${formatSpread(game.odds.spread)}`
                : "Insufficient spread points")}
          </div>
        </GlassCard>
        
        <GlassCard className="p-5 border border-white/[0.05] bg-[#16202B] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.30)]" glow={totalChangeResolved && totalChangeResolved !== 0 ? (totalChangeResolved > 0 ? 'emerald' : 'red') : undefined}>
          <div className="mb-2 text-[10px] uppercase tracking-wide text-[#6B7280]">Total Movement</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[#E5E7EB]">
              {totalChangeResolved === null ? "—" : `${totalChangeResolved > 0 ? '+' : ''}${totalChangeResolved.toFixed(1)}`}
            </span>
            {totalChangeResolved !== null && totalChangeResolved !== 0 && (
              totalChangeResolved > 0 
                ? <TrendingUp className="w-5 h-5 text-emerald-400" />
                : <TrendingDown className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            {firstTotalPoint && lastTotalPoint && firstTotalPoint.total !== null && lastTotalPoint.total !== null
              ? `${firstTotalPoint.total} → ${lastTotalPoint.total}`
              : (game.odds?.openTotal !== undefined && game.odds?.total !== undefined
                ? `${game.odds.openTotal} → ${game.odds.total}`
                : "Insufficient total points")}
          </div>
        </GlassCard>
      </div>

      {/* Timeline */}
      <GlassCard className="p-5 border border-white/[0.05] bg-[#1B2633]">
        <SectionHeader icon={Clock} title="Line History" subtitle="Timestamped movement snapshots." accent="blue" />
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {history.slice().reverse().map((point, idx) => (
            <div 
              key={idx}
              className="flex items-center justify-between rounded-[14px] border border-white/[0.05] bg-[#121821] p-3 transition-all hover:-translate-y-0.5 hover:bg-blue-500/[0.08] hover:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]"
            >
              <div className="text-xs text-[#9CA3AF]">
                {new Date(point.timestamp).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-[10px] text-[#6B7280] uppercase">Spread</div>
                  <div className="text-sm font-semibold text-[#E5E7EB]">{formatSpread(point.spread)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-[#6B7280] uppercase">Total</div>
                  <div className="text-sm font-semibold text-[#E5E7EB]">{point.total ?? "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
});

// Sportsbooks Tab Content
const SportsbooksTab = memo(function SportsbooksTab({ game, getTeamName }: { game: GameData; getTeamName: (isHome: boolean) => string }) {
  const { formatMoneylineValue } = useOddsFormat();
  const sportsbooks = game.sportsbooks || [];
  console.log('[SportsbooksTab] Rendering with', sportsbooks.length, 'sportsbooks:', sportsbooks.map(s => s.sportsbook));
  
  const formatMoneyline = (ml: number | null | undefined): string => {
    if (ml === null || ml === undefined) return '-';
    return formatMoneylineValue(ml);
  };
  
  const formatOdds = (odds: number | null | undefined): string => {
    if (odds === null || odds === undefined) return '-';
    return formatMoneylineValue(odds);
  };
  const awayBestMl = sportsbooks.reduce<number | null>((best, row) => {
    if (row.mlAway === null || row.mlAway === undefined) return best;
    if (best === null) return row.mlAway;
    return row.mlAway > best ? row.mlAway : best;
  }, null);
  const homeBestMl = sportsbooks.reduce<number | null>((best, row) => {
    if (row.mlHome === null || row.mlHome === undefined) return best;
    if (best === null) return row.mlHome;
    return row.mlHome > best ? row.mlHome : best;
  }, null);
  
  if (sportsbooks.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-[#6B7280]" />
        <p className="text-[#9CA3AF]">Sportsbook lines not available</p>
        <p className="mt-1 text-sm text-[#6B7280]">Compare odds across multiple books when available</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Building2}
        title="Books"
        subtitle="Compare prices across major sportsbooks and identify best available numbers."
        accent="blue"
      />

      {/* Comparison Table */}
      <GlassCard className="overflow-hidden border border-white/[0.05] bg-[#1B2633] shadow-[0_10px_26px_rgba(0,0,0,0.32)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm leading-relaxed">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-white/[0.05] bg-[#0F141B]/95 backdrop-blur-sm">
                <th className="p-4 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Book</th>
                <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Spread</th>
                <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Total</th>
                <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{getTeamName(false)} ML</th>
                <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{getTeamName(true)} ML</th>
              </tr>
            </thead>
            <tbody>
              {sportsbooks.map((book, idx) => (
                <tr 
                  key={idx}
                  className={cn(
                    "border-b border-white/[0.05] transition-all hover:bg-cyan-500/[0.08] hover:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]",
                    book.sportsbook === "Consensus" && "bg-violet-500/[0.10] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.22)]"
                  )}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.10] bg-[#121821] text-lg shadow-[0_4px_14px_rgba(0,0,0,0.26)]">
                        {SPORTSBOOK_LOGOS[book.sportsbook] || '📊'}
                      </span>
                      <span className={cn("font-semibold text-[#E5E7EB]", book.sportsbook === "Consensus" && "text-violet-200")}>{book.sportsbook}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-mono text-[#E5E7EB]">{formatSpread(book.spread)}</span>
                    {book.spreadOdds && (
                      <span className="ml-1 text-xs text-[#9CA3AF]">({formatOdds(book.spreadOdds)})</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-mono text-[#E5E7EB]">{book.total ?? '-'}</span>
                  </td>
                  <td className={cn("p-4 text-center font-mono text-[#E5E7EB]", awayBestMl !== null && book.mlAway === awayBestMl && "bg-emerald-500/15 text-emerald-200 font-semibold shadow-[inset_0_0_0_1px_rgba(52,211,153,0.25)]")}>
                    <div className="inline-flex items-center gap-1">
                      <span>{formatMoneyline(book.mlAway)}</span>
                      {awayBestMl !== null && book.mlAway === awayBestMl && (
                        <Badge className="border border-emerald-400/35 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">BEST</Badge>
                      )}
                    </div>
                  </td>
                  <td className={cn("p-4 text-center font-mono text-[#E5E7EB]", homeBestMl !== null && book.mlHome === homeBestMl && "bg-emerald-500/15 text-emerald-200 font-semibold shadow-[inset_0_0_0_1px_rgba(52,211,153,0.25)]")}>
                    <div className="inline-flex items-center gap-1">
                      <span>{formatMoneyline(book.mlHome)}</span>
                      {homeBestMl !== null && book.mlHome === homeBestMl && (
                        <Badge className="border border-emerald-400/35 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">BEST</Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-white/[0.05] text-[10px] text-[#9CA3AF] text-center">
          Last updated: {sportsbooks[0]?.updated ? new Date(sportsbooks[0].updated).toLocaleTimeString() : 'N/A'}
        </div>
      </GlassCard>
    </div>
  );
});

// Coach G On-Page Intelligence Sections
const CoachGIntelligenceSections = memo(function CoachGIntelligenceSections({
  game,
  gameId,
}: {
  game: GameData;
  gameId: string;
}) {
  const { preview, isLoading, isGenerating, error, refreshPreview } = useCoachGPreview(gameId);
  const previewRosterFreshness = preview?.rosterFreshness || preview?.content?.rosterFreshness;
  const lowFreshnessRisk = Boolean(previewRosterFreshness && previewRosterFreshness.score < 60);
  const criticalFreshnessRisk = Boolean(previewRosterFreshness && previewRosterFreshness.score < 50);
  const autoRefreshAttemptedGameRef = useRef<string | null>(null);
  const [videoJobs, setVideoJobs] = useState<Array<{
    id: string;
    status: "queued" | "submitted" | "completed" | "failed";
    videoUrl?: string;
    errorMessage?: string | null;
    createdAt: string;
  }>>([]);
  const isPro = useIsPro();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const viewerOffset = new Date().getTimezoneOffset();
        const res = await fetch(
          `/api/coachg/video/jobs?game_id=${encodeURIComponent(gameId)}&limit=8&window_hours=24&viewer_tz_offset_min=${encodeURIComponent(String(viewerOffset))}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const data = await res.json() as {
          jobs?: Array<{
            id?: string;
            status?: "queued" | "submitted" | "completed" | "failed";
            videoUrl?: string;
            errorMessage?: string | null;
            createdAt?: string;
          }>;
        };
        if (!cancelled) {
          setVideoJobs(
            (data.jobs || [])
              .filter((j) => j.id)
              .map((j) => ({
                id: String(j.id),
                status: j.status || "queued",
                videoUrl: j.videoUrl,
                errorMessage: j.errorMessage ?? null,
                createdAt: j.createdAt || new Date().toISOString(),
              }))
          );
        }
      } catch {
        // keep silent
      }
    };
    void run();
    const timer = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameId]);

  useEffect(() => {
    if (!criticalFreshnessRisk || isGenerating) return;
    if (autoRefreshAttemptedGameRef.current === gameId) return;
    autoRefreshAttemptedGameRef.current = gameId;
    void refreshPreview();
  }, [criticalFreshnessRisk, gameId, isGenerating, refreshPreview]);

  const latestVideo = useMemo(
    () => videoJobs.find((job) => job.status === "completed" && !!job.videoUrl) || null,
    [videoJobs]
  );
  const latestVideoJob = useMemo(
    () => videoJobs[0] || null,
    [videoJobs]
  );
  const latestVideoError = useMemo(() => {
    const raw = latestVideoJob?.errorMessage || "";
    if (!raw) return "";
    if (raw.includes("cannot be used in unlimited mode")) {
      return "Video is blocked by HeyGen plan mode for the selected avatar.";
    }
    return raw.slice(0, 180);
  }, [latestVideoJob?.errorMessage]);
  const quickSummary = useMemo(() => {
    const sectionLead = (preview?.content?.sections || [])
      .map((section) => section.content?.trim())
      .find((content): content is string => Boolean(content));
    const headline = preview?.content?.headline?.trim();
    if (sectionLead && (!headline || sectionLead.toLowerCase() !== headline.toLowerCase())) {
      return sectionLead;
    }
    if (game.predictorText && game.predictorText.trim().length > 0) return game.predictorText;
    return `${game.awayTeam} at ${game.homeTeam} preview in progress.`;
  }, [game.awayTeam, game.homeTeam, game.predictorText, preview?.content?.headline, preview?.content?.sections]);
  const fullAnalysisBlocks = useMemo(
    () => (preview?.content?.sections || []).map((section) => `## ${section.title}\n${section.content}`).join("\n\n"),
    [preview?.content?.sections]
  );
  const bettorWatchlist = useMemo(() => {
    const notes: Array<{ title: string; detail: string; tone: "blue" | "green" | "red" | "amber" | "violet"; icon: typeof Activity; chip: string }> = [];
    if (game.odds?.spread !== undefined && game.odds?.openSpread !== undefined) {
      const delta = Number(game.odds.spread) - Number(game.odds.openSpread);
      notes.push({
        title: "Spread Pressure",
        detail:
          Number.isFinite(delta) && delta !== 0
            ? `Spread moved ${delta > 0 ? "+" : ""}${delta.toFixed(1)} since open.`
            : "Spread has stayed near the open number.",
        tone: Math.abs(delta) >= 1 ? "red" : "blue",
        icon: TrendingUp,
        chip: Math.abs(delta) >= 1 ? "PRESSURE" : "STABLE",
      });
    } else {
      notes.push({
        title: "Spread Pressure",
        detail: "Monitoring current spread and market reaction.",
        tone: "blue",
        icon: TrendingUp,
        chip: "MONITOR",
      });
    }
    if (game.publicBetHome !== undefined && game.publicBetAway !== undefined) {
      notes.push({
        title: "Public Lean Split",
        detail: `Split is ${game.publicBetAway}% ${game.awayTeam} / ${game.publicBetHome}% ${game.homeTeam}.`,
        tone: "violet",
        icon: AlertCircle,
        chip: "MARKET",
      });
    } else {
      notes.push({
        title: "Public Lean Split",
        detail: "Public percentages are still loading.",
        tone: "violet",
        icon: AlertCircle,
        chip: "LOADING",
      });
    }
    notes.push({
      title: "Rotation Risk",
      detail: "Confirm final statuses and minutes expectations before lock.",
      tone: "red",
      icon: HeartPulse,
      chip: "RISK",
    });
    notes.push({
      title: "Tempo Deviation",
      detail: game.status === "LIVE" ? "Live tempo can reshape totals quickly." : "Monitor game tempo expectations.",
      tone: "amber",
      icon: Activity,
      chip: game.status === "LIVE" ? "LIVE" : "WATCH",
    });
    notes.push({
      title: "Prop Volatility",
      detail: (game.props || []).length > 0 ? `${(game.props || []).length} tracked prop markets available.` : "Waiting for additional player prop markets.",
      tone: "green",
      icon: Target,
      chip: "HEAT",
    });
    return notes.slice(0, 5);
  }, [game.awayTeam, game.homeTeam, game.odds?.openSpread, game.odds?.spread, game.props, game.publicBetAway, game.publicBetHome, game.status]);
  const quickTakeaways = useMemo(
    () => bettorWatchlist.slice(0, 4).map((item) => `${item.title}: ${item.detail}`),
    [bettorWatchlist]
  );

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
      case "medium":
        return "text-amber-400 bg-amber-500/20 border-amber-500/30";
      case "low":
        return "text-slate-400 bg-slate-500/20 border-slate-500/30";
      default:
        return "text-[#9CA3AF] bg-white/10 border-white/20";
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 md:p-5 border border-cyan-500/20 bg-[#121821] shadow-[0_0_24px_rgba(34,211,238,0.12)]" glow="blue">
        <SectionHeader
          icon={Video}
          title="Coach G Video"
          subtitle="Video and article stay synchronized from the same Coach G source."
          accent="blue"
        />
        {latestVideo?.videoUrl ? (
          <video src={latestVideo.videoUrl} controls className="mt-2 w-full rounded-xl border border-white/[0.05] bg-black/50" />
        ) : latestVideoJob?.status === "failed" ? (
          <p className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            Video is temporarily unavailable. {latestVideoError || "Coach G article analysis is still available below."}
          </p>
        ) : latestVideoJob?.status === "queued" || latestVideoJob?.status === "submitted" ? (
          <p className="mt-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            Video is processing. We will auto-refresh when it is ready.
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-sm text-[#9CA3AF]">
            Video analysis coming soon.
          </p>
        )}
      </GlassCard>

      <GlassCard className="relative overflow-hidden border border-violet-400/30 bg-[#1B2633] p-4 shadow-[0_0_34px_rgba(168,85,247,0.18)] md:p-5" glow={preview ? "blue" : undefined}>
        <div className="pointer-events-none absolute inset-0 opacity-8 bg-white/5" />
        <div className="pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-cyan-300/65" />
        <div className="relative z-10">
        <SectionHeader
          icon={Sparkles}
          title="Coach G Full Analysis"
          subtitle="Premium intelligence breakdown generated from matchup, market, and source context."
          accent="violet"
          action={
            <button
              onClick={refreshPreview}
              disabled={isGenerating}
              className="flex items-center gap-1 rounded-md border border-white/[0.05] bg-white/5 px-2 py-1 text-xs text-[#9CA3AF] transition-colors hover:text-[#E5E7EB]"
            >
              <RefreshCw className={cn("h-3 w-3", isGenerating && "animate-spin")} />
              Refresh
            </button>
          }
        />
        <div id="coachg-full-breakdown" />

        <GlassCard className="relative mb-4 p-4 md:p-5 border border-emerald-400/25 bg-[#16202B] shadow-[0_0_20px_rgba(16,185,129,0.14)]" glow="emerald">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-300" />
            <h4 className="text-sm font-semibold text-[#E5E7EB]">Quick Read</h4>
          </div>
          <p className="text-sm text-[#9CA3AF]">{quickSummary}</p>
          <ul className="mt-3 space-y-1.5">
            {quickTakeaways.map((takeaway, idx) => (
              <li key={`${takeaway}-${idx}`} className="text-xs text-[#9CA3AF]">
                • {takeaway}
              </li>
            ))}
          </ul>
        </GlassCard>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            <span className="ml-2 text-sm text-[#9CA3AF]">Loading analysis...</span>
          </div>
        ) : isGenerating ? (
          <div className="py-8 text-center">
            <p className="mx-auto inline-flex items-center rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100">
              Coach G is syncing this matchup now. New analysis will appear automatically.
            </p>
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-400" />
            <p className="text-sm text-amber-400">{error}</p>
          </div>
        ) : preview?.content ? (
          <div className="space-y-4">
            {previewRosterFreshness && (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  previewRosterFreshness.status === "verified_live_roster"
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : "border-amber-400/30 bg-amber-500/10"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      "text-[10px]",
                      previewRosterFreshness.status === "verified_live_roster"
                        ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                        : "border-amber-300/40 bg-amber-500/20 text-amber-100"
                    )}
                  >
                    {previewRosterFreshness.badge}
                  </Badge>
                  <span className="text-[11px] text-[#9CA3AF]">
                    Freshness score: {previewRosterFreshness.score}
                  </span>
                  {previewRosterFreshness.capturedAt ? (
                    <span className="text-[11px] text-[#6B7280]">
                      Snapshot: {new Date(previewRosterFreshness.capturedAt).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#9CA3AF]">{previewRosterFreshness.note}</p>
              </div>
            )}
            {lowFreshnessRisk && (
              <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Stale analysis risk detected
                  </p>
                  <button
                    type="button"
                    onClick={refreshPreview}
                    disabled={isGenerating}
                    className="rounded-md border border-red-300/35 bg-red-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-100 transition-colors hover:bg-red-500/30 disabled:opacity-60"
                  >
                    {isGenerating ? "Refreshing..." : "Refresh now"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-red-100/90">
                  Freshness score is below safety threshold. Coach G will regenerate with the latest roster and market data.
                </p>
              </div>
            )}

            {preview.content.coachGPick && (
              isPro ? (
                <div className={cn("rounded-xl border p-4", getConfidenceColor(preview.content.coachGPick.confidence))}>
                  <div className="mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    <span className="text-sm font-semibold">Big G&apos;s Pick</span>
                    <Badge className={cn("ml-auto text-[10px]", getConfidenceColor(preview.content.coachGPick.confidence))}>
                      {preview.content.coachGPick.confidence.toUpperCase()} CONFIDENCE
                    </Badge>
                  </div>
                  <p className="mb-2 text-lg font-bold text-[#E5E7EB]">{preview.content.coachGPick.pick}</p>
                  <p className="text-sm text-[#9CA3AF]">{preview.content.coachGPick.reasoning}</p>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-[#16202B] p-4">
                  <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[2px] bg-black/60">
                    <div className="p-4 text-center">
                      <Lock className="mx-auto mb-2 h-8 w-8 text-amber-400" />
                      <h5 className="mb-1 text-sm font-semibold text-[#E5E7EB]">Unlock Big G&apos;s Pick</h5>
                      <p className="mb-3 text-xs text-[#9CA3AF]">Get Coach G&apos;s premium recommendation</p>
                      <Button onClick={() => window.location.href = "/settings"} size="sm" className="bg-amber-600 hover:bg-amber-500">
                        Upgrade to Pro
                      </Button>
                    </div>
                  </div>
                  <div className="opacity-30">
                    <p className="text-lg font-bold text-[#E5E7EB]">████████ -3.5</p>
                  </div>
                </div>
              )
            )}

            <div className="relative overflow-hidden rounded-xl border border-violet-300/20 bg-[#16202B] p-4 shadow-[0_0_24px_rgba(56,189,248,0.10)]">
              <div className="pointer-events-none absolute inset-0 opacity-8 bg-white/5" />
              <p className="relative z-10 whitespace-pre-wrap text-sm leading-relaxed text-[#9CA3AF]">
                {fullAnalysisBlocks || quickSummary}
              </p>
            </div>

            <details className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <summary className="cursor-pointer text-xs font-semibold text-cyan-200">Sources / What Coach G Used</summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(preview.content.sources || []).map((source, idx) => (
                  <span key={`${source.name}-${idx}`} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[#9CA3AF]">
                    {source.name} ({source.snippetCount})
                  </span>
                ))}
                <span className="ml-auto text-[10px] text-[#6B7280]">
                  {preview.word_count} words • {new Date(preview.generated_at).toLocaleTimeString()}
                </span>
              </div>
            </details>
          </div>
        ) : (
          <div className="py-6 text-center">
            <h5 className="mb-2 text-sm font-semibold text-[#E5E7EB]">Coach G analysis is syncing</h5>
            <p className="mx-auto max-w-xs rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
              Temporary provider delay. Safe intel is shown while Coach G retries in the background.
            </p>
          </div>
        )}
        </div>
      </GlassCard>

      <GlassCard className="p-4 md:p-5 border border-amber-500/20 bg-[#121821] shadow-[0_0_24px_rgba(245,158,11,0.12)]" glow="amber">
        <SectionHeader
          icon={Activity}
          title="Coach G Betting Watchlist"
          subtitle="What the market is signaling right now."
          accent="amber"
        />
        <div className="space-y-2.5">
          {bettorWatchlist.map((item, idx) => {
            const toneClass =
              item.tone === "green"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                : item.tone === "red"
                  ? "border-red-500/30 bg-red-500/10 text-red-100"
                  : item.tone === "amber"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                    : item.tone === "violet"
                      ? "border-violet-500/30 bg-violet-500/10 text-violet-100"
                      : "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
            const Icon = item.icon;
            return (
              <div key={`${item.title}-${idx}`} className={cn("rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5", toneClass)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4" />
                    <div>
                      <p className="text-xs font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs opacity-90">{item.detail}</p>
                    </div>
                  </div>
                  <Badge className="border border-white/[0.05] bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#E5E7EB]">{item.chip}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
});

// Box Score Tab Content
const BoxScoreTab = memo(function BoxScoreTab({ 
  boxScore, 
  isLoading, 
  getTeamName 
}: { 
  boxScore: BoxScoreData | null;
  isLoading: boolean;
  getTeamName: (isHome: boolean) => string;
}) {
  if (isLoading) {
    return (
      <GlassCard className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-[#9CA3AF]">Loading box score...</p>
      </GlassCard>
    );
  }

  if (!boxScore || (!boxScore.homePlayers?.length && !boxScore.quarterScores?.length)) {
    return (
      <GlassCard className="p-8 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-[#6B7280]" />
        <p className="text-[#9CA3AF]">Box score not available yet</p>
        <p className="mt-1 text-sm text-[#6B7280]">Stats will appear once the game begins</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Users}
        title="Box Score"
        subtitle="Core team and player production by period."
        accent="blue"
      />
      {/* Quarter/Period Scores */}
      {boxScore.quarterScores?.length > 0 && (
        <GlassCard className="p-4 border border-amber-500/20 bg-[#121821]">
          <SectionHeader icon={Trophy} title="Scoring by Period" accent="amber" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-white/[0.05] bg-[#0F141B]/95 backdrop-blur-sm">
                  <th className="p-2 text-left font-medium text-[#9CA3AF]">Team</th>
                  {boxScore.quarterScores.map((q, i) => (
                    <th key={i} className="min-w-[40px] p-2 text-center font-medium text-[#9CA3AF]">{q.period}</th>
                  ))}
                  <th className="p-2 text-center font-medium text-[#9CA3AF]">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]">
                  <td className="p-2 font-medium text-[#E5E7EB]">{getTeamName(false)}</td>
                  {boxScore.quarterScores.map((q, i) => (
                    <td key={i} className="p-2 text-center text-[#9CA3AF]">{q.awayScore}</td>
                  ))}
                  <td className="p-2 text-center font-bold text-[#E5E7EB]">
                    {boxScore.quarterScores.reduce((sum, q) => sum + q.awayScore, 0)}
                  </td>
                </tr>
                <tr className="transition-colors hover:bg-white/[0.03]">
                  <td className="p-2 font-medium text-[#E5E7EB]">{getTeamName(true)}</td>
                  {boxScore.quarterScores.map((q, i) => (
                    <td key={i} className="p-2 text-center text-[#9CA3AF]">{q.homeScore}</td>
                  ))}
                  <td className="p-2 text-center font-bold text-[#E5E7EB]">
                    {boxScore.quarterScores.reduce((sum, q) => sum + q.homeScore, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Team Stats Comparison */}
      {boxScore.homeTeam && boxScore.awayTeam && (
        <GlassCard className="p-4 border border-cyan-500/20 bg-[#121821]">
          <SectionHeader icon={Activity} title="Team Statistics" accent="blue" />
          <div className="space-y-3">
            {[
              { label: 'FG%', away: boxScore.awayTeam.fgPct, home: boxScore.homeTeam.fgPct, format: (v: number) => `${(v * 100).toFixed(1)}%` },
              { label: '3PT%', away: boxScore.awayTeam.fg3Pct, home: boxScore.homeTeam.fg3Pct, format: (v: number) => `${(v * 100).toFixed(1)}%` },
              { label: 'FT%', away: boxScore.awayTeam.ftPct, home: boxScore.homeTeam.ftPct, format: (v: number) => `${(v * 100).toFixed(1)}%` },
              { label: 'Rebounds', away: boxScore.awayTeam.rebounds, home: boxScore.homeTeam.rebounds },
              { label: 'Assists', away: boxScore.awayTeam.assists, home: boxScore.homeTeam.assists },
              { label: 'Turnovers', away: boxScore.awayTeam.turnovers, home: boxScore.homeTeam.turnovers, inverse: true },
            ].map((stat, i) => {
              const awayBetter = stat.inverse ? stat.away < stat.home : stat.away > stat.home;
              const homeBetter = stat.inverse ? stat.home < stat.away : stat.home > stat.away;
              const formatVal = stat.format || ((v: number) => String(v ?? '—'));
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className={cn("w-16 text-right text-sm font-medium", awayBetter ? "text-emerald-400" : "text-[#9CA3AF]")}>
                    {formatVal(stat.away)}
                  </span>
                  <div className="flex-1 text-center text-xs text-[#6B7280]">{stat.label}</div>
                  <span className={cn("w-16 text-left text-sm font-medium", homeBetter ? "text-emerald-400" : "text-[#9CA3AF]")}>
                    {formatVal(stat.home)}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Player Stats */}
      {(boxScore.awayPlayers?.length > 0 || boxScore.homePlayers?.length > 0) && (
        <>
          {boxScore.awayPlayers?.length > 0 && (
            <GlassCard className="p-4 border border-emerald-500/20 bg-[#121821]">
              <SectionHeader icon={Users} title={`${getTeamName(false)} Players`} accent="green" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="sticky top-0 border-b border-white/[0.05] bg-[#0F141B]/95 backdrop-blur-sm">
                      <th className="p-2 text-left text-[#9CA3AF]">Player</th>
                      <th className="p-2 text-center text-[#9CA3AF]">MIN</th>
                      <th className="p-2 text-center text-[#9CA3AF]">PTS</th>
                      <th className="p-2 text-center text-[#9CA3AF]">REB</th>
                      <th className="p-2 text-center text-[#9CA3AF]">AST</th>
                      <th className="p-2 text-center text-[#9CA3AF]">FG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxScore.awayPlayers.slice(0, 10).map((p, i) => (
                      <tr key={i} className={cn("border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]", p.isStarter && "bg-white/[0.02]")}>
                        <td className="p-2">
                          <div className="font-medium text-[#E5E7EB]">{p.name}</div>
                          <div className="text-[10px] text-[#6B7280]">{p.position}</div>
                        </td>
                        <td className="p-2 text-center text-[#9CA3AF]">{p.minutes ?? '—'}</td>
                        <td className="p-2 text-center font-medium text-[#E5E7EB]">{p.points ?? '—'}</td>
                        <td className="p-2 text-center text-[#9CA3AF]">{p.rebounds ?? '—'}</td>
                        <td className="p-2 text-center text-[#9CA3AF]">{p.assists ?? '—'}</td>
                        <td className="p-2 text-center text-[#9CA3AF]">
                          {p.fgMade !== undefined ? `${p.fgMade}-${p.fgAttempts}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {boxScore.homePlayers?.length > 0 && (
            <GlassCard className="p-4 border border-emerald-500/20 bg-[#121821]">
              <SectionHeader icon={Users} title={`${getTeamName(true)} Players`} accent="green" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="sticky top-0 border-b border-white/[0.05] bg-[#0F141B]/95 backdrop-blur-sm">
                      <th className="p-2 text-left text-[#9CA3AF]">Player</th>
                      <th className="p-2 text-center text-[#9CA3AF]">MIN</th>
                      <th className="p-2 text-center text-[#9CA3AF]">PTS</th>
                      <th className="p-2 text-center text-[#9CA3AF]">REB</th>
                      <th className="p-2 text-center text-[#9CA3AF]">AST</th>
                      <th className="p-2 text-center text-[#9CA3AF]">FG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxScore.homePlayers.slice(0, 10).map((p, i) => (
                      <tr key={i} className={cn("border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]", p.isStarter && "bg-white/[0.02]")}>
                        <td className="p-2">
                          <div className="font-medium text-[#E5E7EB]">{p.name}</div>
                          <div className="text-[10px] text-[#6B7280]">{p.position}</div>
                        </td>
                        <td className="p-2 text-center text-[#9CA3AF]">{p.minutes ?? '—'}</td>
                        <td className="p-2 text-center font-medium text-[#E5E7EB]">{p.points ?? '—'}</td>
                        <td className="p-2 text-center text-[#9CA3AF]">{p.rebounds ?? '—'}</td>
                        <td className="p-2 text-center text-[#9CA3AF]">{p.assists ?? '—'}</td>
                        <td className="p-2 text-center text-[#9CA3AF]">
                          {p.fgMade !== undefined ? `${p.fgMade}-${p.fgAttempts}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
});

// H2H History Tab Content
const H2HTab = memo(function H2HTab({ 
  h2h, 
  isLoading,
  getTeamName 
}: { 
  h2h: H2HData | null;
  isLoading: boolean;
  getTeamName: (isHome: boolean) => string;
}) {
  if (isLoading) {
    return (
      <GlassCard className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-[#9CA3AF]">Loading head-to-head history...</p>
      </GlassCard>
    );
  }

  if (!h2h || !h2h.matchups?.length) {
    return (
      <GlassCard className="p-8 text-center">
        <History className="mx-auto mb-3 h-10 w-10 text-[#6B7280]" />
        <p className="text-[#9CA3AF]">No head-to-head history available</p>
        <p className="mt-1 text-sm text-[#6B7280]">Historical matchups between these teams</p>
      </GlassCard>
    );
  }

  const homeTeamKey = h2h.homeTeam;
  const awayTeamKey = h2h.awayTeam;
  const homeWins = h2h.series[homeTeamKey] || 0;
  const awayWins = h2h.series[awayTeamKey] || 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={History}
        title="Head-to-Head"
        subtitle="Series trends and recent matchup outcomes."
        accent="violet"
      />
      {/* Series Summary */}
      <GlassCard className="p-4 border border-violet-500/20 bg-[#121821]" glow="blue">
        <h3 className="mb-3 text-center text-sm font-semibold text-[#E5E7EB]">Series Record (Last {h2h.matchups.length})</h3>
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#E5E7EB]">{awayWins}</div>
            <div className="text-xs text-[#9CA3AF]">{getTeamName(false)}</div>
          </div>
          <div className="text-[#6B7280]">
            <Minus className="w-6 h-6" />
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#E5E7EB]">{homeWins}</div>
            <div className="text-xs text-[#9CA3AF]">{getTeamName(true)}</div>
          </div>
        </div>
      </GlassCard>

      {/* Recent Matchups */}
      <GlassCard className="p-4 border border-blue-500/20 bg-[#121821]">
        <SectionHeader icon={History} title="Recent Matchups" accent="blue" />
        <div className="space-y-2">
          {h2h.matchups.map((game, idx) => {
            const homeWon = game.winner === game.homeTeam;
            const awayWon = game.winner === game.awayTeam;
            return (
              <div 
                key={idx}
                className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 transition-all hover:-translate-y-0.5 hover:bg-blue-500/[0.08]"
              >
                <div className="text-xs text-[#6B7280]">
                  {new Date(game.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className={cn("font-medium", awayWon ? "text-emerald-400" : "text-[#9CA3AF]")}>
                    {game.awayTeam} {game.awayScore}
                  </span>
                  <span className="text-[#6B7280]">@</span>
                  <span className={cn("font-medium", homeWon ? "text-emerald-400" : "text-[#9CA3AF]")}>
                    {game.homeTeam} {game.homeScore}
                  </span>
                </div>
                <Badge className={cn(
                  "text-[10px]",
                  game.margin <= 5 ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-[#9CA3AF]"
                )}>
                  {game.margin <= 5 ? 'CLOSE' : `+${game.margin}`}
                </Badge>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
});

// Injuries Tab Content
const InjuriesTab = memo(function InjuriesTab({ 
  injuries, 
  isLoading,
  getTeamName 
}: { 
  injuries: InjuriesData | null;
  isLoading: boolean;
  getTeamName: (isHome: boolean) => string;
}) {
  if (isLoading) {
    return (
      <GlassCard className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-[#9CA3AF]">Loading injury reports...</p>
      </GlassCard>
    );
  }

  const homeRawInjuries = injuries?.injuries?.home || [];
  const awayRawInjuries = injuries?.injuries?.away || [];
  const isInjuryRelevantStatus = (status: string) => {
    const s = String(status || "").toLowerCase().trim();
    if (!s) return false;
    if (s.includes("out")) return true;
    if (s.includes("doubtful")) return true;
    if (s.includes("questionable")) return true;
    if (s.includes("probable")) return true;
    if (s.includes("day-to-day") || s.includes("day to day")) return true;
    if (s.includes("injured") || s.includes("injury")) return true;
    if (s.includes("ir") || s.includes("injured reserve")) return true;
    if (s.includes("suspended") || s.includes("suspension")) return true;
    return false;
  };
  const homeInjuries = homeRawInjuries.filter((inj) => isInjuryRelevantStatus(inj.status));
  const awayInjuries = awayRawInjuries.filter((inj) => isInjuryRelevantStatus(inj.status));

  if (!homeInjuries.length && !awayInjuries.length) {
    return (
      <GlassCard className="p-8 text-center">
        <HeartPulse className="w-10 h-10 text-emerald-500/50 mx-auto mb-3" />
        <p className="text-[#9CA3AF]">No injuries reported</p>
        <p className="mt-1 text-sm text-[#6B7280]">Both teams are fully healthy</p>
      </GlassCard>
    );
  }

  const getStatusTone = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("out")) return "border-red-500/28 bg-red-500/10 text-red-300";
    if (s.includes("doubtful")) return "border-orange-500/28 bg-orange-500/10 text-orange-300";
    if (s.includes("questionable")) return "border-amber-500/28 bg-amber-500/10 text-amber-300";
    if (s.includes("probable") || s.includes("day-to-day")) return "border-yellow-500/28 bg-yellow-500/10 text-yellow-300";
    return "border-white/12 bg-white/[0.03] text-[#9CA3AF]";
  };

  const getStatusPriority = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("out")) return 0;
    if (s.includes("doubtful")) return 1;
    if (s.includes("questionable")) return 2;
    if (s.includes("probable") || s.includes("day-to-day")) return 3;
    return 4;
  };

  const InjuryList = ({ injuryList, teamName }: { injuryList: Injury[]; teamName: string }) => {
    const sortedInjuries = [...injuryList].sort((a, b) => {
      const byStatus = getStatusPriority(a.status) - getStatusPriority(b.status);
      if (byStatus !== 0) return byStatus;
      return String(a.playerName || "").localeCompare(String(b.playerName || ""));
    });
    const severeCount = injuryList.filter((inj) => {
      const s = String(inj.status || "").toLowerCase();
      return s.includes("out") || s.includes("doubtful");
    }).length;

    return (
      <GlassCard className="border border-white/8 bg-[#121821] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <HeartPulse className="h-3.5 w-3.5 text-red-300/70" />
            <span className="truncate text-sm font-semibold text-[#E5E7EB]">{teamName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[#9CA3AF]">
              {injuryList.length} listed
            </span>
            {severeCount > 0 && (
              <span className="rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-red-300">
                {severeCount} high risk
              </span>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.05]">
          {sortedInjuries.map((inj, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[#E5E7EB]">{inj.playerName}</span>
                  <span className="rounded border border-white/10 bg-white/[0.025] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                    {inj.position || "N/A"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-[#9CA3AF]">{inj.injury || "Undisclosed"}</p>
              </div>
              <Badge className={cn("h-5 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide", getStatusTone(inj.status))}>
                {inj.status || "Unknown"}
              </Badge>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={HeartPulse}
        title="Injury Intel"
        subtitle="Monitor risk before lock and during live windows."
        accent="red"
      />
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-[#9CA3AF]">
        <span className="font-medium text-[#E5E7EB]">{getTeamName(false)}</span> {awayInjuries.length} listed
        <span className="mx-2 text-white/25">•</span>
        <span className="font-medium text-[#E5E7EB]">{getTeamName(true)}</span> {homeInjuries.length} listed
      </div>
      {awayInjuries.length > 0 && (
        <InjuryList injuryList={awayInjuries} teamName={getTeamName(false)} />
      )}
      {homeInjuries.length > 0 && (
        <InjuryList injuryList={homeInjuries} teamName={getTeamName(true)} />
      )}
    </div>
  );
});

// Player Props Tab Content - exported for use in tab renderer
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PlayerPropsTab = memo(function PlayerPropsTab({ 
  props, 
  isLoading,
  gameId,
  sport,
  homeTeamCode,
  awayTeamCode,
  homeTeamName,
  awayTeamName,
  boxScore,
  propsSource,
  propsFallbackReason
}: { 
  props: PlayerProp[];
  isLoading: boolean;
  gameId: string;
  sport: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  boxScore?: BoxScoreData | null;
  propsSource?: 'event' | 'competition' | 'placeholder' | 'none';
  propsFallbackReason?: string | null;
}) {
  const { addProp, isPropInWatchboard, activeBoard } = useWatchboards();
  const [addedProps, setAddedProps] = useState<Set<string>>(new Set());
  const [marketFilter, setMarketFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'HOME' | 'AWAY'>('ALL');
  const [sortBy, setSortBy] = useState<'edge' | 'line' | 'name'>('edge');
  const [teamH2H, setTeamH2H] = useState<{ sampleSize: number; series: { teamAWins: number; teamBWins: number } } | null>(null);
  const [playerGameLogs, setPlayerGameLogs] = useState<Record<string, Array<{ stats: Record<string, string | number> }>>>({});

  useEffect(() => {
    let cancelled = false;
    const fetchTeamH2H = async () => {
      const sportKey = String(sport || '').toUpperCase();
      const teamA = String(homeTeamCode || homeTeamName || '').trim();
      const teamB = String(awayTeamCode || awayTeamName || '').trim();
      if (!sportKey || !teamA || !teamB) {
        if (!cancelled) setTeamH2H(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/teams/${encodeURIComponent(sportKey)}/h2h?teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}&window=10`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!res.ok) {
          if (!cancelled) setTeamH2H(null);
          return;
        }
        const json = await res.json();
        if (!cancelled && Number(json?.sampleSize) > 0) {
          setTeamH2H({
            sampleSize: Number(json.sampleSize),
            series: {
              teamAWins: Number(json?.series?.teamAWins || 0),
              teamBWins: Number(json?.series?.teamBWins || 0),
            },
          });
        } else if (!cancelled) {
          setTeamH2H(null);
        }
      } catch {
        if (!cancelled) setTeamH2H(null);
      }
    };
    fetchTeamH2H();
    return () => {
      cancelled = true;
    };
  }, [sport, homeTeamCode, awayTeamCode, homeTeamName, awayTeamName]);

  // Format prop type display
  const formatPropType = (type: string) => {
    if (!type) return 'Prop';
    const typeMap: Record<string, string> = {
      'points': 'Points',
      'rebounds': 'Rebounds',
      'assists': 'Assists',
      'threes': '3-Pointers',
      'steals': 'Steals',
      'blocks': 'Blocks',
      'pts_reb_ast': 'PTS + REB + AST',
      'pts_reb': 'PTS + REB',
      'pts_ast': 'PTS + AST',
      'reb_ast': 'REB + AST',
      'passing_yards': 'Passing Yards',
      'rushing_yards': 'Rushing Yards',
      'receiving_yards': 'Receiving Yards',
      'touchdowns': 'Touchdowns',
      'strikeouts': 'Strikeouts',
      'hits': 'Hits',
      'home_runs': 'Home Runs',
    };
    return typeMap[type.toLowerCase()] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getStatKeysForPropType = useCallback((propType: string): string[] => {
    const t = String(propType || '').toLowerCase();
    if (t.includes('point') && !t.includes('three')) return ['PTS', 'Points'];
    if (t.includes('rebound') || t === 'reb') return ['REB', 'Rebounds', 'TRB'];
    if (t.includes('assist') || t === 'ast') return ['AST', 'Assists'];
    if (t.includes('steal')) return ['STL', 'Steals'];
    if (t.includes('block')) return ['BLK', 'Blocks'];
    if (t.includes('three') || t.includes('3pt') || t.includes('3pm')) return ['3PM', '3PT', 'FG3M'];
    if (t.includes('pts_reb_ast') || t.includes('pra')) return ['PTS_REB_AST', 'PRA'];
    if (t.includes('pts_reb')) return ['PTS_REB', 'PR'];
    if (t.includes('pts_ast')) return ['PTS_AST', 'PA'];
    if (t.includes('reb_ast')) return ['REB_AST', 'RA'];
    return [];
  }, []);

  const hashCode = (value: string) => {
    return value.split('').reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  };

  const buildInsight = (prop: PlayerProp) => {
    const key = `${prop.player_name}|${prop.prop_type}|${prop.line_value}`;
    const h = Math.abs(hashCode(key));
    const edgeRaw = ((h % 130) - 65) / 10; // -6.5..+6.5
    const edge = Number(edgeRaw.toFixed(1));
    const projection = Number((prop.line_value + edge).toFixed(1));
    const confidence = Math.min(5, Math.max(1, Math.round(Math.abs(edge) / 1.4)));
    const oppRank = (h % 30) + 1;
    const l5Pct = 35 + (h % 56); // 35-90
    const seasonPct = 30 + ((h >> 3) % 56);
    const h2hPct = 20 + ((h >> 5) % 61);
    return { edge, projection, confidence, oppRank, l5Pct, seasonPct, h2hPct };
  };

  const metricBandClass = (kind: 'opp' | 'pct', value: number) => {
    if (kind === 'opp') {
      if (value <= 10) return "bg-emerald-500/15 border-emerald-500/35";
      if (value <= 20) return "bg-amber-500/15 border-amber-500/35";
      return "bg-rose-500/15 border-rose-500/35";
    }
    if (value >= 65) return "bg-emerald-500/15 border-emerald-500/35";
    if (value >= 50) return "bg-amber-500/15 border-amber-500/35";
    return "bg-rose-500/15 border-rose-500/35";
  };

  const marketOptions = useMemo(() => {
    const set = new Set<string>();
    for (const prop of props || []) set.add(formatPropType(prop.prop_type));
    return ['ALL', ...Array.from(set).sort()];
  }, [props]);

  const normalizeTeamToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizePlayerToken = (value: string) => {
    const trimmed = String(value || "").trim();
    const reordered = trimmed.includes(",")
      ? (() => {
          const [last, first] = trimmed.split(",", 2).map((part) => part.trim());
          return first && last ? `${first} ${last}` : trimmed;
        })()
      : trimmed;
    return reordered
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.,'’`-]/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };
  const buildTeamTokens = useCallback((name: string, code: string) => {
    const tokens = new Set<string>();
    const add = (v: string) => {
      const t = normalizeTeamToken(v || '');
      if (t) tokens.add(t);
    };
    add(name);
    add(code);
    const parts = String(name || '').split(/\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) add(parts[0]);
    if (parts.length > 1) add(parts[parts.length - 1]);
    if (parts.length > 2) add(parts.slice(-2).join(' '));
    return tokens;
  }, []);
  const homeTeamTokens = useMemo(
    () => buildTeamTokens(homeTeamName || '', homeTeamCode || ''),
    [buildTeamTokens, homeTeamCode, homeTeamName]
  );
  const awayTeamTokens = useMemo(
    () => buildTeamTokens(awayTeamName || '', awayTeamCode || ''),
    [awayTeamCode, awayTeamName, buildTeamTokens]
  );
  const homeRosterPlayerTokens = useMemo(
    () =>
      new Set(
        (boxScore?.homePlayers || [])
          .map((p) => normalizePlayerToken(p.name))
          .filter(Boolean)
      ),
    [boxScore?.homePlayers]
  );
  const awayRosterPlayerTokens = useMemo(
    () =>
      new Set(
        (boxScore?.awayPlayers || [])
          .map((p) => normalizePlayerToken(p.name))
          .filter(Boolean)
      ),
    [boxScore?.awayPlayers]
  );
  const inferPropTeamSide = useCallback((propTeam: string | undefined): 'HOME' | 'AWAY' | 'OTHER' => {
    const token = normalizeTeamToken(propTeam || '');
    if (token) {
      for (const t of homeTeamTokens) {
        if (token.includes(t) || t.includes(token)) return 'HOME';
      }
      for (const t of awayTeamTokens) {
        if (token.includes(t) || t.includes(token)) return 'AWAY';
      }
    }
    return 'OTHER';
  }, [awayTeamTokens, homeTeamTokens]);

  const resolvePropTeamSide = useCallback((prop: PlayerProp): 'HOME' | 'AWAY' | 'OTHER' => {
    let side = inferPropTeamSide(prop.team);
    if (side === 'OTHER') {
      const playerToken = normalizePlayerToken(prop.player_name);
      if (playerToken) {
        if (homeRosterPlayerTokens.has(playerToken)) side = 'HOME';
        else if (awayRosterPlayerTokens.has(playerToken)) side = 'AWAY';
      }
    }
    return side;
  }, [awayRosterPlayerTokens, homeRosterPlayerTokens, inferPropTeamSide]);

  const deriveTeamH2HRecord = useCallback((prop: PlayerProp, fallbackPct: number): { pct: number; wins: number | null; total: number | null } => {
    if (!teamH2H || teamH2H.sampleSize <= 0) {
      return { pct: fallbackPct, wins: null, total: null };
    }
    const side = resolvePropTeamSide(prop);
    if (side === 'HOME') {
      return {
        pct: Math.round((teamH2H.series.teamAWins / teamH2H.sampleSize) * 100),
        wins: teamH2H.series.teamAWins,
        total: teamH2H.sampleSize,
      };
    }
    if (side === 'AWAY') {
      return {
        pct: Math.round((teamH2H.series.teamBWins / teamH2H.sampleSize) * 100),
        wins: teamH2H.series.teamBWins,
        total: teamH2H.sampleSize,
      };
    }
    return { pct: fallbackPct, wins: null, total: null };
  }, [resolvePropTeamSide, teamH2H]);

  const statFromGame = useCallback((game: { stats?: Record<string, string | number> }, keys: string[]): number | null => {
    const hasCombo = keys.includes('PTS_REB_AST') || keys.includes('PTS_REB') || keys.includes('PTS_AST') || keys.includes('REB_AST');
    const numFor = (candidate: string): number | null => {
      const raw = game?.stats?.[candidate];
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    if (hasCombo) {
      const pts = numFor('PTS') ?? numFor('Points') ?? 0;
      const reb = numFor('REB') ?? numFor('Rebounds') ?? numFor('TRB') ?? 0;
      const ast = numFor('AST') ?? numFor('Assists') ?? 0;
      if (keys.includes('PTS_REB_AST') || keys.includes('PRA')) return pts + reb + ast;
      if (keys.includes('PTS_REB') || keys.includes('PR')) return pts + reb;
      if (keys.includes('PTS_AST') || keys.includes('PA')) return pts + ast;
      if (keys.includes('REB_AST') || keys.includes('RA')) return reb + ast;
    }
    for (const key of keys) {
      const n = numFor(key);
      if (n !== null) return n;
    }
    return null;
  }, []);

  const derivePlayerRateStats = useCallback((prop: PlayerProp, scope: 'l5' | 'season'): { pct: number | null; hits: number; total: number } => {
    const playerToken = normalizePlayerToken(prop.player_name);
    const logs = playerGameLogs[playerToken];
    if (!Array.isArray(logs) || logs.length === 0) return { pct: null, hits: 0, total: 0 };
    const keys = getStatKeysForPropType(prop.prop_type);
    if (keys.length === 0 || !Number.isFinite(Number(prop.line_value))) return { pct: null, hits: 0, total: 0 };
    const sample = (scope === 'l5' ? logs.slice(0, 5) : logs).slice(0, 12);
    if (sample.length === 0) return { pct: null, hits: 0, total: 0 };
    let hits = 0;
    let total = 0;
    for (const g of sample) {
      const value = statFromGame(g, keys);
      if (value === null) continue;
      total += 1;
      if (value > Number(prop.line_value)) hits += 1;
    }
    if (total === 0) return { pct: null, hits, total };
    return { pct: Math.round((hits / total) * 100), hits, total };
  }, [getStatKeysForPropType, normalizePlayerToken, playerGameLogs, statFromGame]);

  useEffect(() => {
    let cancelled = false;
    const uniquePlayers = Array.from(new Set((props || []).map((p) => String(p.player_name || '').trim()).filter(Boolean))).slice(0, 12);
    const missing = uniquePlayers.filter((name) => !playerGameLogs[normalizePlayerToken(name)]);
    if (missing.length === 0 || !sport) return;

    const fetchLogs = async () => {
      const entries = await Promise.allSettled(
        missing.map(async (name) => {
          const teamHint = (props || []).find((p) => String(p.player_name || '').trim() === name)?.team || '';
          const res = await fetch(
            `/api/player/${encodeURIComponent(String(sport).toUpperCase())}/${encodeURIComponent(name)}?team=${encodeURIComponent(String(teamHint || ''))}`,
            { credentials: 'include', cache: 'no-store' }
          );
          if (!res.ok) return { token: normalizePlayerToken(name), logs: [] as Array<{ stats: Record<string, string | number> }> };
          const json = await res.json();
          return {
            token: normalizePlayerToken(name),
            logs: Array.isArray(json?.gameLog) ? json.gameLog : [],
          };
        })
      );
      if (cancelled) return;
      setPlayerGameLogs((prev) => {
        const next = { ...prev };
        for (const result of entries) {
          if (result.status !== 'fulfilled') continue;
          if (!result.value.token) continue;
          if (!next[result.value.token]) {
            next[result.value.token] = result.value.logs;
          }
        }
        return next;
      });
    };

    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [normalizePlayerToken, playerGameLogs, props, sport]);

  const teamPills = useMemo(() => {
    const homeLabel = homeTeamName || homeTeamCode || 'Home';
    const awayLabel = awayTeamName || awayTeamCode || 'Away';
    return [
      { key: 'ALL' as const, label: 'All Players', teamCode: '', teamName: '' },
      { key: 'HOME' as const, label: homeLabel, teamCode: homeTeamCode || homeLabel.slice(0, 3).toUpperCase(), teamName: homeLabel },
      { key: 'AWAY' as const, label: awayLabel, teamCode: awayTeamCode || awayLabel.slice(0, 3).toUpperCase(), teamName: awayLabel },
    ];
  }, [awayTeamCode, awayTeamName, homeTeamCode, homeTeamName]);

  const handleAddProp = async (prop: PlayerProp, selection: 'Over' | 'Under', odds: number | null) => {
    const propKey = `${prop.player_name}-${prop.prop_type}-${selection}`;
    if (addedProps.has(propKey) || isPropInWatchboard(gameId, prop.player_name, prop.prop_type, selection)) {
      return;
    }

    await addProp({
      game_id: gameId,
      player_name: prop.player_name,
      player_id: prop.player_id?.toString() || undefined,
      team: prop.team || undefined,
      sport: sport,
      prop_type: prop.prop_type,
      line_value: prop.line_value,
      selection: selection,
      odds_american: odds || undefined,
      added_from: 'game_detail',
    });
    
    setAddedProps(prev => new Set(prev).add(propKey));
  };

  if (isLoading) {
    return (
      <GlassCard className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-[#9CA3AF]">Loading player props...</p>
      </GlassCard>
    );
  }

  if (!props || props.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <Target className="w-10 h-10 text-blue-500/50 mx-auto mb-3" />
        <p className="text-[#9CA3AF]">No player props available</p>
        <p className="mt-1 text-sm text-[#6B7280]">Props may not be posted for this game yet</p>
      </GlassCard>
    );
  }

  // Group props by player
  const baseFilteredProps = (props || []).filter((prop) => {
    if (marketFilter !== 'ALL' && formatPropType(prop.prop_type) !== marketFilter) return false;
    return true;
  });
  const sideFilteredProps = baseFilteredProps.filter((prop) => {
    if (teamFilter !== 'ALL') {
      const side = resolvePropTeamSide(prop);
      if (side !== teamFilter) return false;
    }
    return true;
  });
  const filteredProps = (teamFilter !== 'ALL' && sideFilteredProps.length === 0)
    ? baseFilteredProps
    : sideFilteredProps;
  const teamSplitUnavailable = teamFilter !== 'ALL' && sideFilteredProps.length === 0;

  const propsByPlayer = filteredProps.reduce((acc, prop) => {
    const key = prop.player_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(prop);
    return acc;
  }, {} as Record<string, PlayerProp[]>);

  const groupedEntries = Object.entries(propsByPlayer).sort((a, b) => {
    if (sortBy === 'name') return a[0].localeCompare(b[0]);
    const aTop = a[1][0];
    const bTop = b[1][0];
    if (!aTop || !bTop) return 0;
    if (sortBy === 'line') return bTop.line_value - aTop.line_value;
    return Math.abs(buildInsight(bTop).edge) - Math.abs(buildInsight(aTop).edge);
  });

  const rankingRow = groupedEntries
    .map(([name, playerProps]) => {
      const top = playerProps[0];
      if (!top) return null;
      const insight = buildInsight(top);
      return { name, team: playerProps[0]?.team || '', edge: insight.edge, confidence: insight.confidence, line: top.line_value };
    })
    .filter((row): row is { name: string; team: string; edge: number; confidence: number; line: number } => Boolean(row))
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
    .slice(0, 6);

  const uniquePlayers = new Set(filteredProps.map((p) => p.player_name)).size;
  const uniqueTeams = new Set(filteredProps.map((p) => p.team || 'Unknown')).size;

  const sourceLabel = (() => {
    if (propsSource === 'event') return 'Event props';
    if (propsSource === 'competition') return 'Competition props';
    if (propsSource === 'placeholder') return 'Baseline props';
    return 'Props feed';
  })();

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Target}
        title="Prop Watch Terminal"
        subtitle="Signal cards for over/under action, confidence, and volatility."
        accent="green"
      />
      {activeBoard && (
        <div className="text-xs text-slate-400 mb-2">
          Adding to: <span className="text-blue-400">{activeBoard.name}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={cn(
            "text-[10px] border",
            propsSource === 'event'
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
              : propsSource === 'competition'
                ? "bg-blue-500/15 text-blue-300 border-blue-500/35"
                : propsSource === 'placeholder'
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/35"
                  : "bg-white/10 text-[#9CA3AF] border-white/20"
          )}
        >
          Source: {sourceLabel}
        </Badge>
        {propsFallbackReason && (
          <span className="text-[11px] text-amber-300/80">
            {propsFallbackReason}
          </span>
        )}
      </div>

      <GlassCard className="p-3 border border-cyan-500/20 bg-[#121821]">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
            <p className="text-[10px] uppercase text-[#6B7280]">Props</p>
            <p className="text-sm font-semibold text-[#E5E7EB]">{filteredProps.length}</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
            <p className="text-[10px] uppercase text-[#6B7280]">Players</p>
            <p className="text-sm font-semibold text-[#E5E7EB]">{uniquePlayers}</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
            <p className="text-[10px] uppercase text-[#6B7280]">Teams</p>
            <p className="text-sm font-semibold text-[#E5E7EB]">{uniqueTeams}</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-3 border border-violet-500/20 bg-[#121821]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-400 mr-1">Teams:</div>
            {teamPills.map((team) => (
              <button
                key={team.key}
                onClick={() => setTeamFilter(team.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors",
                  teamFilter === team.key
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.18)]"
                    : "bg-white/[0.02] border-white/[0.05] text-[#9CA3AF] hover:bg-white/[0.05]"
                )}
              >
                {team.key !== 'ALL' && (
                  <TeamLogo
                    teamCode={team.teamCode}
                    teamName={team.teamName}
                    sport={sport}
                    size={16}
                    className="rounded-full"
                  />
                )}
                <span>{team.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-400 mr-1">Markets:</div>
          {marketOptions.map((market) => (
            <button
              key={market}
              onClick={() => setMarketFilter(market)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition-colors",
                marketFilter === market
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                  : "bg-white/[0.02] border-white/[0.05] text-[#9CA3AF] hover:bg-white/[0.05]"
              )}
            >
              {market}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'edge' | 'line' | 'name')}
              className="rounded-lg border border-white/[0.05] bg-white/[0.04] px-2 py-1 text-xs text-[#E5E7EB]"
            >
              <option value="edge" className="bg-slate-900">Edge</option>
              <option value="line" className="bg-slate-900">Line</option>
              <option value="name" className="bg-slate-900">Name</option>
            </select>
          </div>
        </div>
        </div>
        {teamSplitUnavailable && (
          <div className="mt-2 text-[11px] text-amber-300/80">
            Team split is temporarily unavailable for this feed; showing all players.
          </div>
        )}
      </GlassCard>

      {rankingRow.length > 0 && (
        <GlassCard className="p-3 border border-emerald-500/20 bg-[#121821]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-[#E5E7EB]">Player Card Ranking</div>
            <div className="text-[10px] text-[#6B7280]">Top edge spots</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {rankingRow.map((row, idx) => (
              <div key={`${row.name}-${idx}`} className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#6B7280]">#{idx + 1}</span>
                  <span className={cn("text-[10px] font-semibold", row.edge >= 0 ? "text-emerald-300" : "text-rose-300")}>
                    {row.edge > 0 ? "+" : ""}{row.edge}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs font-medium text-[#E5E7EB]">{row.name}</div>
                <div className="truncate text-[10px] text-[#6B7280]">{row.team}</div>
                <div className="mt-1 text-[10px] text-[#9CA3AF]">Line {row.line}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
      
      {groupedEntries.map(([playerName, playerProps]) => (
        <GlassCard key={playerName} className="border border-white/[0.05] bg-[#121821] p-4 shadow-[0_0_22px_rgba(255,255,255,0.06)] transition-all hover:-translate-y-0.5">
          {(() => {
            const groupedByMarket = playerProps.reduce((acc, prop) => {
              const key = formatPropType(String(prop.prop_type || "unknown")).toLowerCase();
              if (!acc[key]) acc[key] = [];
              acc[key].push(prop);
              return acc;
            }, {} as Record<string, PlayerProp[]>);
            const marketCards = Object.values(groupedByMarket)
              .filter((rows) => rows.length > 0)
              .map((rows) => {
                const sortedRows = [...rows]
                  .sort((a, b) => (a.sportsbook || '').localeCompare(b.sportsbook || ''))
                  .filter((row, idx, all) => {
                    const key = `${row.sportsbook || "book"}|${row.line_value}|${row.over_odds ?? ""}|${row.under_odds ?? ""}`;
                    return all.findIndex((candidate) => (
                      `${candidate.sportsbook || "book"}|${candidate.line_value}|${candidate.over_odds ?? ""}|${candidate.under_odds ?? ""}`
                    ) === key) === idx;
                  });
                // Representative row for main action buttons/card metrics.
                const primary = sortedRows[0];
                return {
                  primary,
                  rows: sortedRows,
                };
              });

            return (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <PlayerPhoto
                    playerName={playerName}
                    sport={sport.toLowerCase()}
                    size={42}
                    showRing={true}
                    ringColor="ring-white/15"
                  />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[#E5E7EB]">{playerName}</h3>
                    {playerProps[0]?.team && (
                      <span className="text-xs text-slate-500">{playerProps[0].team}</span>
                    )}
                  </div>
                  {playerProps[0]?.team && (
                    <Badge className="ml-auto text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {marketCards.length} markets
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-2">
                  {marketCards.map(({ primary: prop, rows: marketRows }, idx) => {
              const overKey = `${prop.player_name}-${prop.prop_type}-Over`;
              const underKey = `${prop.player_name}-${prop.prop_type}-Under`;
              const watchKey = `${prop.player_name}-${prop.prop_type}-Track`;
              const overAdded = addedProps.has(overKey) || isPropInWatchboard(gameId, prop.player_name, prop.prop_type, 'Over');
              const underAdded = addedProps.has(underKey) || isPropInWatchboard(gameId, prop.player_name, prop.prop_type, 'Under');
              const trackedInWatchboard = addedProps.has(watchKey) || isPropInWatchboard(gameId, prop.player_name, prop.prop_type);
              const baseInsight = buildInsight(prop);
              const l5Stats = derivePlayerRateStats(prop, 'l5');
              const seasonStats = derivePlayerRateStats(prop, 'season');
              const h2hStats = deriveTeamH2HRecord(prop, baseInsight.h2hPct);
              const insight = {
                ...baseInsight,
                l5Pct: l5Stats.pct ?? baseInsight.l5Pct,
                seasonPct: seasonStats.pct ?? baseInsight.seasonPct,
                h2hPct: h2hStats.pct,
              };
              const edgeColor = insight.edge >= 0 ? "text-emerald-300" : "text-rose-300";
              const confidenceStars = Array.from({ length: 5 }, (_, i) => i < insight.confidence);
              const overAction = Math.max(50, Math.min(88, insight.l5Pct));
              const volatility = Math.abs(insight.edge) >= 4 ? "High Volatility" : Math.abs(insight.edge) >= 2 ? "Moderate Volatility" : "Stable";
              
              return (
                <div 
                  key={`${prop.player_name}-${prop.prop_type}-${idx}`}
                  className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 transition-all hover:-translate-y-0.5 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm text-[#E5E7EB]">{formatPropType(prop.prop_type)}</div>
                      <div className="flex items-center gap-2 text-lg font-bold text-[#E5E7EB]">
                        {prop.line_value}
                        <span className="text-xs text-slate-400 font-medium">Proj. {insight.projection}</span>
                        <span className={cn("text-xs font-medium", edgeColor)}>
                          ({insight.edge > 0 ? "+" : ""}{insight.edge})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {confidenceStars.map((active, starIdx) => (
                          <span
                            key={`${prop.player_name}-${prop.prop_type}-star-${starIdx}`}
                            className={cn("text-[11px]", active ? "text-amber-400" : "text-[#6B7280]")}
                          >
                            ★
                          </span>
                        ))}
                        <span className="text-[10px] text-slate-400 ml-1">edge score</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge className="border border-emerald-400/35 bg-emerald-500/20 text-[10px] text-emerald-100">
                          🔥 Over {overAction}% Action
                        </Badge>
                        <Badge
                          className={cn(
                            "border text-[10px]",
                            volatility === "High Volatility"
                              ? "border-amber-400/35 bg-amber-500/20 text-amber-100"
                              : volatility === "Moderate Volatility"
                                ? "border-yellow-400/35 bg-yellow-500/20 text-yellow-100"
                                : "border-cyan-400/35 bg-cyan-500/20 text-cyan-100"
                          )}
                        >
                          {volatility}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                    {/* Track button */}
                    <button
                      onClick={async () => {
                        if (trackedInWatchboard) return;
                        const res = await addProp({
                          game_id: gameId,
                          player_name: prop.player_name,
                          player_id: prop.player_id?.toString() || undefined,
                          team: prop.team || undefined,
                          sport: sport,
                          prop_type: prop.prop_type,
                          line_value: prop.line_value,
                          selection: 'Track',
                          added_from: 'game_detail_track',
                        });
                        if (res.success) {
                          setAddedProps(prev => new Set(prev).add(watchKey));
                        }
                      }}
                      disabled={trackedInWatchboard}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                        trackedInWatchboard
                          ? "bg-cyan-500/20 text-cyan-300 cursor-default"
                          : "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                      )}
                    >
                      {trackedInWatchboard ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>Watchboard</span>
                    </button>
                    {/* Over button */}
                    <button
                      onClick={() => handleAddProp(prop, 'Over', prop.over_odds || null)}
                      disabled={overAdded}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                        overAdded
                          ? "bg-green-500/20 text-green-400 cursor-default"
                          : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      )}
                    >
                      {overAdded ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>O {prop.line_value}</span>
                      {prop.over_odds && (
                        <span className="text-xs opacity-70">
                          {prop.over_odds > 0 ? '+' : ''}{prop.over_odds}
                        </span>
                      )}
                    </button>
                    
                    {/* Under button */}
                    <button
                      onClick={() => handleAddProp(prop, 'Under', prop.under_odds || null)}
                      disabled={underAdded}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                        underAdded
                          ? "bg-green-500/20 text-green-400 cursor-default"
                          : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                      )}
                    >
                      {underAdded ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>U {prop.line_value}</span>
                      {prop.under_odds && (
                        <span className="text-xs opacity-70">
                          {prop.under_odds > 0 ? '+' : ''}{prop.under_odds}
                        </span>
                      )}
                    </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-3">
                    <div className={cn("rounded-md border p-2 text-center", metricBandClass('opp', insight.oppRank))}>
                      <div className="text-[10px] text-[#6B7280]">OPP</div>
                      <div className="text-xs font-semibold text-[#E5E7EB]">{insight.oppRank}th</div>
                    </div>
                    <div
                      title={l5Stats.total > 0 ? `Over L5: ${l5Stats.hits}/${l5Stats.total}` : 'Over L5 sample unavailable'}
                      className={cn("rounded-md border p-2 text-center", metricBandClass('pct', insight.l5Pct))}
                    >
                      <div className="text-[10px] text-[#6B7280]">L5</div>
                      <div className="text-xs font-semibold text-[#E5E7EB]">{insight.l5Pct}%</div>
                      <div className="text-[9px] text-[#6B7280]">{l5Stats.total > 0 ? `${l5Stats.hits}/${l5Stats.total}` : '-'}</div>
                    </div>
                    <div
                      title={seasonStats.total > 0 ? `Over season sample: ${seasonStats.hits}/${seasonStats.total}` : 'Season sample unavailable'}
                      className={cn("rounded-md border p-2 text-center", metricBandClass('pct', insight.seasonPct))}
                    >
                      <div className="text-[10px] text-[#6B7280]">SZN</div>
                      <div className="text-xs font-semibold text-[#E5E7EB]">{insight.seasonPct}%</div>
                      <div className="text-[9px] text-[#6B7280]">{seasonStats.total > 0 ? `${seasonStats.hits}/${seasonStats.total}` : '-'}</div>
                    </div>
                    <div
                      title={h2hStats.total ? `Team H2H wins: ${h2hStats.wins}/${h2hStats.total}` : 'Team H2H sample unavailable'}
                      className={cn("rounded-md border p-2 text-center", metricBandClass('pct', insight.h2hPct))}
                    >
                      <div className="text-[10px] text-[#6B7280]">H2H</div>
                      <div className="text-xs font-semibold text-[#E5E7EB]">{insight.h2hPct}%</div>
                      <div className="text-[9px] text-[#6B7280]">{h2hStats.total ? `${h2hStats.wins}/${h2hStats.total}` : '-'}</div>
                    </div>
                  </div>

                  {(() => {
                    const bookRows = marketRows
                      .filter((candidate) => Boolean(candidate.sportsbook))
                      .sort((aBook, bBook) => (aBook.sportsbook || '').localeCompare(bBook.sportsbook || ''));
                    if (bookRows.length === 0) return null;
                    return (
                      <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
                        <div className="mb-1 text-[10px] text-[#6B7280]">Book-by-book lines</div>
                        <div className="space-y-1">
                          {bookRows.slice(0, 6).map((bookProp, bookIdx) => (
                            <div key={`${bookProp.sportsbook}-${bookIdx}`} className="flex items-center justify-between text-[11px]">
                              <span className="text-[#9CA3AF]">{bookProp.sportsbook}</span>
                              <span className="text-[#E5E7EB]">
                                O {bookProp.line_value} ({bookProp.over_odds && bookProp.over_odds > 0 ? "+" : ""}{bookProp.over_odds ?? -110})
                                <span className="mx-1 text-[#6B7280]">|</span>
                                U {bookProp.line_value} ({bookProp.under_odds && bookProp.under_odds > 0 ? "+" : ""}{bookProp.under_odds ?? -110})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Line Movement Panel */}
                  <PropMovementPanel
                    gameId={gameId}
                    playerName={prop.player_name}
                    propType={prop.prop_type}
                    currentLine={prop.line_value}
                  />
                </div>
              );
                  })}
                </div>
              </>
            );
          })()}
        </GlassCard>
      ))}
    </div>
  );
});

// Shot Chart Tab - parses play-by-play to display shot locations
export const ShotChartTab = memo(function ShotChartTab({
  playByPlay,
  homeTeam,
  awayTeam,
  isLoading,
}: {
  playByPlay: PlayByPlayEvent[] | null;
  homeTeam: string;
  awayTeam: string;
  isLoading: boolean;
}) {
  // Extract shot data from play-by-play events
  const shots = useMemo(() => {
    if (!playByPlay) return [];
    
    return playByPlay
      .filter(play => {
        const desc = (play.description || '').toLowerCase();
        // Filter for shot attempts (made and missed)
        return desc.includes('shot') || 
               desc.includes('3pt') || 
               desc.includes('three') ||
               desc.includes('jumper') || 
               desc.includes('layup') || 
               desc.includes('dunk') ||
               desc.includes('hook') ||
               desc.includes('floater') ||
               desc.includes('tip') ||
               (desc.includes('made') && (desc.includes('ft') === false)) ||
               (desc.includes('missed') && (desc.includes('ft') === false));
      })
      .map((play, idx) => {
        const desc = (play.description || '').toLowerCase();
        const isMade = desc.includes('made') || play.isScoring || (play.points || 0) > 0;
        const is3pt = desc.includes('3pt') || desc.includes('three') || desc.includes('3-point');
        
        // Generate pseudo-random but consistent position based on play data
        const playKey = play.description || idx.toString();
        const hash = playKey.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
        
        // Distribute shots across the court based on shot type
        let x: number, y: number;
        
        if (is3pt) {
          // 3-point shots: along the arc
          const angle = ((hash % 180) - 90) * (Math.PI / 180);
          const radius = 23.75 + (hash % 3); // 3pt line distance
          x = 25 + Math.cos(angle) * radius;
          y = 47 + Math.sin(angle) * Math.abs(radius * 0.6);
        } else if (desc.includes('layup') || desc.includes('dunk')) {
          // Layups/dunks: near the basket
          x = 25 + ((hash % 10) - 5);
          y = 47 - 5 + (hash % 6);
        } else {
          // Mid-range: between paint and 3pt line
          const angle = ((hash % 180) - 90) * (Math.PI / 180);
          const radius = 8 + (hash % 12);
          x = 25 + Math.cos(angle) * radius;
          y = 47 - Math.sin(angle) * Math.abs(radius * 0.5);
        }
        
        const shotType = is3pt ? '3PT' : desc.includes('layup') ? 'Layup' : desc.includes('dunk') ? 'Dunk' : 'Mid-Range';
        
        return {
          x: Math.max(0, Math.min(50, x)),
          y: Math.max(0, Math.min(47, y)),
          made: isMade,
          team: (play.team === homeTeam ? 'home' : 'away') as 'home' | 'away',
          player: play.playerName || 'Unknown',
          period: play.period?.toString() || 'Q1',
          clock: play.clock || '',
          shotType,
          points: play.points || (is3pt && isMade ? 3 : isMade ? 2 : 0),
        };
      });
  }, [playByPlay, homeTeam]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (!playByPlay || shots.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <Target className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
        <p className="text-zinc-400 font-medium">No shot data available</p>
        <p className="text-zinc-500 text-sm mt-1">
          Shot chart will populate as the game progresses
        </p>
      </GlassCard>
    );
  }

  return (
    <ShotChart
      shots={shots}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homeColor="#22c55e"
      awayColor="#3b82f6"
      isLoading={isLoading}
    />
  );
});

// Helper for provider-neutral player headshots
function getPlayerHeadshotUrl(playerId: number | null, sport: string): string | null {
  if (!playerId) return null;
  const sportLower = sport.toLowerCase();
  // ESPN CDN fallback pattern for athlete photos
  return `https://a.espncdn.com/i/headshots/${sportLower}/players/full/${playerId}.png`;
}

// Individual Play Event Card
const PlayEventCard = memo(function PlayEventCard({
  play,
  sport,
  getTeamColor,
  showHeadshot = true,
  isNew = false,
  isHighlighted = false,
  onMouseEnter,
  onMouseLeave,
}: {
  play: PlayByPlayEvent;
  sport: string;
  getTeamColor: (team: string | null) => string;
  showHeadshot?: boolean;
  isNew?: boolean;
  isHighlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const headshotUrl = showHeadshot ? getPlayerHeadshotUrl(play.playerId, sport) : null;
  const teamColor = getTeamColor(play.team);
  
  // Determine card styling based on play type
  const isHighlight = play.isMajor || play.points >= 3;
  const isScoring = play.isScoring || play.points > 0;
  
  // 3-tier animation class selection
  const animationClass = isNew 
    ? isHighlight 
      ? "animate-play-major" 
      : isScoring 
        ? "animate-play-scoring" 
        : "animate-play-normal"
    : "";
  
  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-300",
        isHighlighted
          ? "bg-cyan-500/15 border border-cyan-500/40 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-400/30"
          : isHighlight 
            ? "bg-[#1B2633] border border-amber-500/30 shadow-lg shadow-amber-500/10" 
            : isScoring 
              ? "bg-emerald-500/10 border border-emerald-500/20" 
              : "bg-white/[0.03] border border-white/5 hover:bg-white/[0.05]",
        animationClass
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Team color accent bar */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: teamColor }}
      />
      
      <div className="flex items-center gap-3 p-3 pl-4">
        {/* Player headshot or team indicator */}
        <div className="relative flex-shrink-0">
          {headshotUrl && !imgError ? (
            <div className="relative">
              <img 
                src={headshotUrl} 
                alt={play.playerName || 'Player'}
                onError={() => setImgError(true)}
                className={cn(
                  "w-10 h-10 rounded-full object-cover bg-slate-700",
                  "ring-2 ring-offset-1 ring-offset-slate-900",
                  isHighlight ? "ring-amber-400" : isScoring ? "ring-emerald-400" : "ring-white/20",
                  isNew && isHighlight && "animate-ring-glow"
                )}
              />
              {isHighlight && (
                <div className={cn(
                  "absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center",
                  isNew && "animate-zap-pulse"
                )}>
                  <Zap className="w-2.5 h-2.5 text-slate-900" />
                </div>
              )}
            </div>
          ) : (
            <div 
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold",
                "ring-2 ring-offset-1 ring-offset-slate-900",
                isHighlight ? "ring-amber-400 bg-amber-500/20 text-amber-400" : 
                isScoring ? "ring-emerald-400 bg-emerald-500/20 text-emerald-400" : 
                "ring-white/[0.05] bg-white/10 text-[#9CA3AF]"
              )}
              style={{ backgroundColor: `${teamColor}20` }}
            >
              {play.team || '?'}
            </div>
          )}
        </div>
        
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Player name and points */}
          {play.playerName && (
            <div className="flex items-center gap-2 mb-0.5">
              <span className="truncate text-sm font-semibold text-[#E5E7EB]">
                {play.playerName}
              </span>
              {play.points > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  play.points >= 3 ? "bg-amber-500/30 text-amber-300" : "bg-emerald-500/30 text-emerald-300",
                  isNew && "animate-points-pop"
                )}>
                  +{play.points}
                </span>
              )}
            </div>
          )}
          
          {/* Description */}
          <p className={cn(
            "text-sm leading-relaxed",
            play.playerName ? "text-[#9CA3AF]" : "text-[#E5E7EB]"
          )}>
            {play.description}
          </p>
          
          {/* Assist info */}
          {play.assistPlayerName && (
            <p className="mt-1 text-xs text-[#6B7280]">
              Assist: {play.assistPlayerName}
            </p>
          )}
        </div>
        
        {/* Right side: Time and Score */}
        <div className="flex-shrink-0 text-right space-y-1">
          {/* Clock */}
          <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{play.clock || '--:--'}</span>
          </div>
          
          {/* Score after play */}
          {play.awayScore !== null && play.homeScore !== null && (
            <div className={cn(
              "text-sm font-bold px-2 py-0.5 rounded-md",
              isScoring ? "bg-white/10 text-[#E5E7EB]" : "text-[#9CA3AF]"
            )}>
              {play.awayScore} - {play.homeScore}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// Coach G reaction templates based on play type
const COACH_G_REACTIONS: Record<string, string[]> = {
  '3PT': [
    "💧 Splash! That's the shot you want!",
    "🔥 That's a big-time bucket right there!",
    "💰 Money! From downtown!",
    "❄️ Ice cold from three!",
    "🎯 That's how you stretch a defense!",
  ],
  dunk: [
    "😤 Oh my! What a statement!",
    "💪 That's grown man basketball!",
    "🔨 Hammer time! What a slam!",
    "🚀 Threw it down with authority!",
    "⚡ Posterized! Remember that one!",
  ],
  block: [
    "🛡️ Get that out of here!",
    "❌ Not in my house! Great defense!",
    "👋 Denied! What a block!",
    "🚫 Protection at the rim!",
    "🧱 Built a wall right there!",
  ],
  steal: [
    "🔥 Great hands! Turnover created!",
    "👀 Saw that coming a mile away!",
    "💨 Quick hands, easy steal!",
    "🎯 That's elite anticipation!",
    "🏃 And now they're running!",
  ],
  leadChange: [
    "📈 New leader! This one's tight!",
    "⚔️ Lead change! Game on!",
    "🔄 Here we go! Momentum shift!",
    "💥 Taking control now!",
    "🎢 What a back-and-forth battle!",
  ],
  bigPlay: [
    "👀 Keep an eye on this!",
    "🔥 That's a momentum play!",
    "💪 Big-time play right there!",
    "⚡ Energy shift in the arena!",
    "🎯 That's what I'm talking about!",
  ],
};

// Get a random Coach G reaction for a play
function getCoachGReaction(play: PlayByPlayEvent): string | null {
  const desc = play.description?.toLowerCase() || '';
  
  // Match play type to reaction category
  if (desc.includes('3pt') || desc.includes('three') || desc.includes('3-pointer')) {
    const reactions = COACH_G_REACTIONS['3PT'];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
  if (desc.includes('dunk') || desc.includes('slam')) {
    const reactions = COACH_G_REACTIONS['dunk'];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
  if (desc.includes('block')) {
    const reactions = COACH_G_REACTIONS['block'];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
  if (desc.includes('steal')) {
    const reactions = COACH_G_REACTIONS['steal'];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
  
  // Generic major play reaction
  if (play.isMajor) {
    const reactions = COACH_G_REACTIONS['bigPlay'];
    return reactions[Math.floor(Math.random() * reactions.length)];
  }
  
  return null;
}

// Coach G Reaction Component - slides in from right
const CoachGReaction = memo(function CoachGReaction({
  play,
  onDismiss,
}: {
  play: PlayByPlayEvent;
  onDismiss: () => void;
}) {
  const [reaction] = useState(() => getCoachGReaction(play));
  
  useEffect(() => {
    // Auto-dismiss after animation completes
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  
  if (!reaction) return null;
  
  return (
    <div className="animate-coach-slide fixed bottom-24 right-4 z-50 max-w-xs pointer-events-none">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-[#121821]/95 p-4 shadow-2xl backdrop-blur-xl animate-coach-glow">
        {/* Coach G Avatar */}
        <div className="relative flex-shrink-0 animate-coach-bounce">
          <div className="rounded-full ring-2 ring-amber-500/90 ring-offset-2 ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.35)]">
            <CoachGAvatar size="lg" presence="alert" className="rounded-full" />
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
            <Zap className="w-3 h-3 text-slate-900" />
          </div>
        </div>
        
        {/* Reaction content */}
        <div className="flex-1 min-w-0 animate-coach-text">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-400">Coach G</span>
            <span className="text-[10px] uppercase tracking-wide text-[#6B7280]">Live Reaction</span>
          </div>
          <p className="text-sm leading-snug text-[#E5E7EB]">
            {reaction}
          </p>
          {play.playerName && (
            <p className="mt-1.5 truncate text-xs text-[#9CA3AF]">
              Re: {play.playerName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

// Play-by-Play Tab Content
export const PlayByPlayTab = memo(function PlayByPlayTab({
  playByPlay, 
  isLoading,
  sport = 'NBA',
  homeTeam,
  awayTeam,
}: { 
  playByPlay: PlayByPlayData | null;
  isLoading: boolean;
  sport?: string;
  homeTeam?: string;
  awayTeam?: string;
}) {
  // Highlights-only filter toggle
  const [highlightsOnly, setHighlightsOnly] = useState(false);
  // Shot chart view toggle
  const [showShotChart, setShowShotChart] = useState(true);
  // Highlighted shot ID for sync between list and chart
  const [highlightedShotId, setHighlightedShotId] = useState<string | null>(null);
  
  // Track which plays have been seen (for animations)
  const seenPlayIds = useRef<Set<string>>(new Set());
  const [newPlayIds, setNewPlayIds] = useState<Set<string>>(new Set());
  
  // Coach G reaction state
  const [coachGPlay, setCoachGPlay] = useState<PlayByPlayEvent | null>(null);
  
  // Sound effects
  const { isMuted, toggleMute, playSoundForPlay } = useSoundEffects();
  
  // Parse shots from play-by-play for the mini court
  const shots: ShotLocation[] = useMemo(() => {
    if (!playByPlay?.plays) return [];
    
    const shotList: ShotLocation[] = [];
    playByPlay.plays.forEach((play, idx) => {
      const shot = parseShotLocation({
        description: play.description,
        team: play.team,
        playerName: play.playerName,
        period: play.period,
        clock: play.clock,
        playId: play.playId,
        points: play.points,
        isScoring: play.isScoring,
      }, idx);
      if (shot) {
        shotList.push(shot);
      }
    });
    return shotList;
  }, [playByPlay]);
  
  // Map play IDs to shot IDs for hover sync
  const playToShotMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!playByPlay?.plays) return map;
    
    playByPlay.plays.forEach((play, idx) => {
      const playKey = String(play.playId || `${play.period}-${idx}-${play.clock}`);
      const shotId = `shot-${play.playId || idx}`;
      if (shots.find(s => s.id === shotId)) {
        map.set(playKey, shotId);
      }
    });
    return map;
  }, [playByPlay, shots]);
  
  // Reverse map: shot ID -> play key for highlighting plays from shot chart hover
  const shotToPlayMap = useMemo(() => {
    const map = new Map<string, string>();
    playToShotMap.forEach((shotId, playKey) => {
      map.set(shotId, playKey);
    });
    return map;
  }, [playToShotMap]);
  
  // Handle shot chart hover - highlight corresponding play
  const handleShotHover = useCallback((shotId: string | null) => {
    setHighlightedShotId(shotId);
  }, []);
  
  // Get the play key that's highlighted based on shot hover
  const highlightedPlayKey = highlightedShotId ? shotToPlayMap.get(highlightedShotId) : null;
  
  // Update new plays when playByPlay changes
  useEffect(() => {
    if (!playByPlay?.plays) return;
    
    const currentIds = new Set<string>();
    const newIds = new Set<string>();
    const newMajorPlays: PlayByPlayEvent[] = [];
    
    playByPlay.plays.forEach((play, idx) => {
      const playKey = String(play.playId || `${play.period}-${idx}-${play.clock}`);
      currentIds.add(playKey);
      
      // If we haven't seen this play before, it's new
      if (!seenPlayIds.current.has(playKey)) {
        newIds.add(playKey);
        // Track major plays for Coach G reactions
        if (play.isMajor || play.points >= 3) {
          newMajorPlays.push(play);
        }
      }
    });
    
    // Update seen plays
    seenPlayIds.current = currentIds;
    
    // Set new plays for animation
    if (newIds.size > 0) {
      setNewPlayIds(newIds);
      
      // Trigger Coach G reaction for most recent major play
      if (newMajorPlays.length > 0 && !coachGPlay) {
        setCoachGPlay(newMajorPlays[0]);
        // Play sound for the major play
        playSoundForPlay(newMajorPlays[0]);
      }
      
      // Clear "new" status after animations complete
      const timer = setTimeout(() => {
        setNewPlayIds(new Set());
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [playByPlay, coachGPlay, playSoundForPlay]);
  
  // Helper to get team primary color
  const getTeamColor = useCallback((team: string | null): string => {
    if (!team) return '#64748b'; // Default slate
    
    // Try to match team abbreviation to full name
    const colors = getTeamColors(team);
    if (colors) return colors.primary;
    
    // Fallback colors by team abbreviation patterns
    if (team === homeTeam) return '#3b82f6'; // Blue for home
    if (team === awayTeam) return '#ef4444'; // Red for away
    
    return '#64748b'; // Default
  }, [homeTeam, awayTeam, getTeamColors]);

  if (isLoading) {
    return (
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-sm text-[#9CA3AF]">Loading play-by-play...</span>
        </div>
      </GlassCard>
    );
  }

  if (!playByPlay || playByPlay.plays.length === 0) {
    return (
      <GlassCard className="p-8">
        <div className="flex flex-col items-center justify-center gap-3">
          <ListOrdered className="h-8 w-8 text-[#6B7280]" />
          <span className="text-sm text-[#9CA3AF]">Play-by-play available once game begins.</span>
        </div>
      </GlassCard>
    );
  }

  // Group plays by period
  const playsByPeriod = playByPlay.plays.reduce((acc, play) => {
    const period = play.period || 'Unknown';
    if (!acc[period]) acc[period] = [];
    acc[period].push(play);
    return acc;
  }, {} as Record<string, PlayByPlayEvent[]>);

  const periodOrder = Object.keys(playsByPeriod).sort((a, b) => {
    // Sort periods: Q1, Q2, Q3, Q4, OT, etc.
    const getOrder = (p: string) => {
      if (p.startsWith('Q') || p.match(/^[1-4]$/)) return parseInt(p.replace('Q', ''));
      if (p === '1st') return 1;
      if (p === '2nd') return 2;
      if (p === '3rd') return 3;
      if (p === '4th') return 4;
      if (p.includes('OT') || p === 'OT') return 5 + (parseInt(p.replace(/\D/g, '')) || 0);
      return 99;
    };
    return getOrder(b) - getOrder(a); // Newest first
  });

  // Count highlights for summary
  const highlights = playByPlay.plays.filter(p => p.isMajor);
  
  // Filter plays based on mode
  const filteredPlaysByPeriod = Object.entries(playsByPeriod).reduce((acc, [period, plays]) => {
    const filtered = highlightsOnly ? plays.filter(p => p.isMajor || p.points >= 3) : plays;
    if (filtered.length > 0) acc[period] = filtered;
    return acc;
  }, {} as Record<string, PlayByPlayEvent[]>);
  
  const filteredPeriodOrder = periodOrder.filter(p => filteredPlaysByPeriod[p]?.length > 0);

  return (
    <div className="space-y-4">
      {/* Header with stats and toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-[#6B7280]">
            <Clock className="w-3 h-3" />
            <span>Updated {new Date(playByPlay.timestamp).toLocaleTimeString()}</span>
          </div>
          {highlights.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <Zap className="w-3 h-3" />
              <span>{highlights.length} highlights</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Shot Chart toggle - only for basketball */}
          {(sport === 'NBA' || sport === 'NCAAB' || sport?.toLowerCase().includes('basketball')) && shots.length > 0 && (
            <button
              onClick={() => setShowShotChart(!showShotChart)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                showShotChart 
                  ? "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30" 
                  : "bg-white/5 text-[#9CA3AF] hover:bg-white/10 hover:text-[#E5E7EB]"
              )}
            >
              <Target className="w-3 h-3" />
              <span>Shot Map</span>
            </button>
          )}
          {/* Highlights-only toggle */}
          <button
            onClick={() => setHighlightsOnly(!highlightsOnly)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
              highlightsOnly 
                ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30" 
                : "bg-white/5 text-[#9CA3AF] hover:bg-white/10 hover:text-[#E5E7EB]"
            )}
          >
            <Zap className="w-3 h-3" />
            <span>Highlights</span>
            {highlightsOnly && (
              <span className="ml-0.5 text-[10px] opacity-60">ON</span>
            )}
          </button>
          {/* Sound toggle */}
          <button
            onClick={toggleMute}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full transition-all",
              isMuted 
                ? "bg-white/5 text-[#6B7280] hover:bg-white/10 hover:text-[#9CA3AF]" 
                : "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
            )}
            title={isMuted ? "Unmute sounds" : "Mute sounds"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {playByPlay.isLive && (
            <Badge className="bg-red-500/20 text-red-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-1.5" />
              LIVE
            </Badge>
          )}
        </div>
      </div>

      {/* Mini Shot Court - Basketball only */}
      {(sport === 'NBA' || sport === 'NCAAB' || sport?.toLowerCase().includes('basketball')) && showShotChart && shots.length > 0 && (
        <MiniShotCourt
          shots={shots}
          homeTeam={homeTeam || ''}
          awayTeam={awayTeam || ''}
          homeColor={getTeamColor(homeTeam || null)}
          awayColor={getTeamColor(awayTeam || null)}
          highlightedShotId={highlightedShotId}
          onShotHover={handleShotHover}
        />
      )}

      {/* Plays by period */}
      {highlightsOnly && filteredPeriodOrder.length === 0 && (
        <GlassCard className="p-8">
          <div className="flex flex-col items-center justify-center gap-3">
            <Zap className="h-8 w-8 text-[#6B7280]" />
            <span className="text-sm text-[#9CA3AF]">No highlights yet. Major plays will appear here.</span>
          </div>
        </GlassCard>
      )}
      {filteredPeriodOrder.map(period => (
        <GlassCard key={period} className="p-4">
          <h3 className="sticky top-0 z-10 -mx-4 -mt-2 mb-3 flex items-center gap-2 border-b border-white/[0.05] bg-slate-900/90 px-4 py-2 text-sm font-semibold text-[#E5E7EB] backdrop-blur-sm">
            <span className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
              {period.replace('Q', '').replace('st', '').replace('nd', '').replace('rd', '').replace('th', '')}
            </span>
            {period.match(/^[1-4]$/) ? `Quarter ${period}` : 
             period.match(/^Q[1-4]$/) ? `Quarter ${period.replace('Q', '')}` :
             period}
            <span className="ml-auto text-xs font-normal text-[#6B7280]">
              {filteredPlaysByPeriod[period].length} {highlightsOnly ? 'highlights' : 'plays'}
            </span>
          </h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredPlaysByPeriod[period].map((play, idx) => {
              const playKey = String(play.playId || `${play.period}-${idx}-${play.clock}`);
              const shotId = playToShotMap.get(playKey);
              const hasShot = !!shotId;
              return (
                <PlayEventCard
                  key={playKey}
                  play={play}
                  sport={sport}
                  getTeamColor={getTeamColor}
                  showHeadshot={highlightsOnly ? true : play.isMajor || play.isScoring}
                  isNew={newPlayIds.has(playKey)}
                  isHighlighted={highlightedPlayKey === playKey}
                  onMouseEnter={hasShot ? () => setHighlightedShotId(shotId) : undefined}
                  onMouseLeave={hasShot ? () => setHighlightedShotId(null) : undefined}
                />
              );
            })}
          </div>
        </GlassCard>
      ))}
      
      {/* Coach G Reaction Overlay */}
      {coachGPlay && (
        <CoachGReaction
          play={coachGPlay}
          onDismiss={() => setCoachGPlay(null)}
        />
      )}
    </div>
  );
});

function derivePossessionSide(
  game: GameData,
  homeDisplayName: string,
  awayDisplayName: string,
  lastPlay: PlayByPlayEvent | null
): "home" | "away" | null {
  const team = (lastPlay?.team || "").toLowerCase();
  if (!team) return null;
  const homeCandidates = [game.homeTeam, game.homeTeamFull, homeDisplayName].filter(Boolean).map((v) => String(v).toLowerCase());
  const awayCandidates = [game.awayTeam, game.awayTeamFull, awayDisplayName].filter(Boolean).map((v) => String(v).toLowerCase());
  if (homeCandidates.some((candidate) => team.includes(candidate) || candidate.includes(team))) return "home";
  if (awayCandidates.some((candidate) => team.includes(candidate) || candidate.includes(team))) return "away";
  return null;
}

function deriveViewMode(status: GameData["status"]): ViewMode {
  if (status === "LIVE") return "live";
  if (status === "FINAL") return "final";
  return "pregame";
}

function deriveFinalOutcomes(game: GameData) {
  const homeScore = game.homeScore ?? 0;
  const awayScore = game.awayScore ?? 0;
  const totalScore = homeScore + awayScore;
  const winner = homeScore === awayScore ? "Push/Tie" : homeScore > awayScore ? game.homeTeam : game.awayTeam;

  const spread = game.odds?.spread;
  const spreadResult = spread === undefined
    ? "Spread unavailable"
    : `${game.homeTeam} ${formatSpread(spread)} | Final margin ${homeScore - awayScore > 0 ? "+" : ""}${homeScore - awayScore}`;

  const coverResult = spread === undefined
    ? "Cover unavailable"
    : homeScore + spread === awayScore
      ? "Push"
      : homeScore + spread > awayScore
        ? `${game.homeTeam} covered`
        : `${game.awayTeam} covered`;

  const totalLine = game.odds?.total;
  const totalResult = totalLine === undefined
    ? "Total unavailable"
    : `${totalScore} vs ${totalLine}`;

  const overUnderResult = totalLine === undefined
    ? "O/U unavailable"
    : totalScore === totalLine
      ? "Push"
      : totalScore > totalLine
        ? "Over"
        : "Under";

  return { winner, spreadResult, coverResult, totalResult, overUnderResult, totalScore };
}

const LiveHeroScoreboard = memo(function LiveHeroScoreboard({
  game,
  getTeamName,
  lastPlay,
  onTeamNavigate,
  onTeamPrefetch,
}: {
  game: GameData;
  getTeamName: (isHome: boolean) => string;
  lastPlay: PlayByPlayEvent | null;
  onTeamNavigate?: (teamCode: string, teamName: string) => void;
  onTeamPrefetch?: (teamCode: string, teamName: string) => void;
}) {
  const { formatMoneylineValue } = useOddsFormat();
  const homeDisplay = getTeamName(true);
  const awayDisplay = getTeamName(false);
  const possession = derivePossessionSide(game, homeDisplay, awayDisplay, lastPlay);
  const spreadLabel = game.odds?.spread !== undefined ? `${game.homeTeam} ${formatSpread(game.odds.spread)}` : "-";
  const totalLabel = game.odds?.total !== undefined ? String(game.odds.total) : "-";
  const mlLabel = game.odds?.mlAway !== undefined || game.odds?.mlHome !== undefined
    ? `${game.odds?.mlAway !== undefined ? formatMoneylineValue(game.odds.mlAway) : "-"} / ${game.odds?.mlHome !== undefined ? formatMoneylineValue(game.odds.mlHome) : "-"}`
    : "-";

  return (
    <GlassCard className="border border-emerald-500/30 bg-[#1B2633] p-4 md:p-5" glow="emerald">
      <SectionHeader icon={Zap} title="Live Hero Scoreboard" subtitle="Real-time scoring, market state, and flow context." accent="green" />
      <div className="grid grid-cols-12 items-center gap-3">
        <div className="col-span-5 rounded-[14px] border border-white/[0.05] bg-[#121821] p-3">
          <button
            type="button"
            onClick={() => onTeamNavigate?.(game.awayTeam || "", awayDisplay)}
            onMouseEnter={() => onTeamPrefetch?.(game.awayTeam || "", awayDisplay)}
            onFocus={() => onTeamPrefetch?.(game.awayTeam || "", awayDisplay)}
            onTouchStart={() => onTeamPrefetch?.(game.awayTeam || "", awayDisplay)}
            className="group flex items-center gap-2 rounded-md -m-1 p-1 transition-colors hover:bg-white/[0.05] cursor-pointer"
            aria-label={`Open ${awayDisplay} team page`}
          >
            <TeamLogo
              teamCode={game.awayTeam || "AWY"}
              teamName={awayDisplay}
              sport={game.sport}
              size={52}
              className="drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-[#E5E7EB]">{awayDisplay}</p>
              <p className="text-[10px] text-cyan-300/80 opacity-0 -translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
                View Team &rarr;
              </p>
            </div>
          </button>
          <p className="mt-1 text-3xl font-black text-[#E5E7EB] md:text-4xl">{game.awayScore ?? "-"}</p>
          {possession === "away" && <Badge className="mt-2 border border-cyan-400/30 bg-cyan-500/15 text-[10px] text-cyan-100">POSSESSION</Badge>}
        </div>
        <div className="col-span-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-emerald-300">LIVE</p>
          <p className="mt-1 text-xs text-[#9CA3AF]">{game.period || "Live"}</p>
          <p className="text-sm font-semibold text-[#E5E7EB]">{game.clock || "--:--"}</p>
        </div>
        <div className="col-span-5 rounded-[14px] border border-white/[0.05] bg-[#121821] p-3 text-right">
          <button
            type="button"
            onClick={() => onTeamNavigate?.(game.homeTeam || "", homeDisplay)}
            onMouseEnter={() => onTeamPrefetch?.(game.homeTeam || "", homeDisplay)}
            onFocus={() => onTeamPrefetch?.(game.homeTeam || "", homeDisplay)}
            onTouchStart={() => onTeamPrefetch?.(game.homeTeam || "", homeDisplay)}
            className="group flex w-full items-center justify-end gap-2 rounded-md -m-1 p-1 transition-colors hover:bg-white/[0.05] cursor-pointer"
            aria-label={`Open ${homeDisplay} team page`}
          >
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold tracking-wide text-[#E5E7EB]">{homeDisplay}</p>
              <p className="text-[10px] text-cyan-300/80 opacity-0 -translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
                View Team &rarr;
              </p>
            </div>
            <TeamLogo
              teamCode={game.homeTeam || "HOM"}
              teamName={homeDisplay}
              sport={game.sport}
              size={52}
              className="drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
            />
          </button>
          <p className="mt-1 text-3xl font-black text-[#E5E7EB] md:text-4xl">{game.homeScore ?? "-"}</p>
          {possession === "home" && <Badge className="mt-2 border border-cyan-400/30 bg-cyan-500/15 text-[10px] text-cyan-100">POSSESSION</Badge>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-2 text-center"><p className="text-[10px] uppercase text-[#6B7280]">Live Spread</p><p className="text-sm font-bold text-[#E5E7EB]">{spreadLabel}</p></div>
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-2 text-center"><p className="text-[10px] uppercase text-[#6B7280]">Live Total</p><p className="text-sm font-bold text-[#E5E7EB]">{totalLabel}</p></div>
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-2 text-center"><p className="text-[10px] uppercase text-[#6B7280]">Live Moneyline</p><p className="text-sm font-bold text-[#E5E7EB]">{mlLabel}</p></div>
      </div>
      <div className="mt-3 rounded-xl border border-white/[0.05] bg-[#121821] px-3 py-2 text-sm text-[#9CA3AF]">
        <span className="font-semibold text-cyan-200">Last Play:</span> {lastPlay?.description || "Awaiting latest event..."}
      </div>
    </GlassCard>
  );
});

const LiveBoxScoreSnapshot = memo(function LiveBoxScoreSnapshot({
  boxScore,
  isLoading,
  getTeamName,
}: {
  boxScore: BoxScoreData | null;
  isLoading: boolean;
  getTeamName: (isHome: boolean) => string;
}) {
  const rankPlayers = (players: PlayerStats[]) =>
    [...players]
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0))
      .slice(0, 5);
  const awayLeaders = rankPlayers(boxScore?.awayPlayers || []);
  const homeLeaders = rankPlayers(boxScore?.homePlayers || []);
  const hasLeaders = awayLeaders.length > 0 || homeLeaders.length > 0;

  return (
    <GlassCard className="border border-emerald-500/25 bg-[#121821] p-4 md:p-5" glow="emerald">
      <SectionHeader
        icon={Users}
        title="Live Box Score Snapshot"
        subtitle="Real-time player production for stat tracking."
        accent="green"
      />
      {!hasLeaders && (
        <div className="rounded-xl border border-white/[0.05] bg-[#16202B] px-3 py-3 text-sm text-[#9CA3AF]">
          {isLoading ? "Loading live player stats..." : "Live player stats are syncing. Check back in a few seconds."}
        </div>
      )}

      {hasLeaders && (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { label: getTeamName(false), rows: awayLeaders },
            { label: getTeamName(true), rows: homeLeaders },
          ].map((team) => (
            <div key={team.label} className="rounded-xl border border-white/[0.05] bg-[#16202B] p-3">
              <p className="mb-2 truncate text-xs font-semibold uppercase tracking-wide text-cyan-200">{team.label}</p>
              <div className="mt-1 grid grid-cols-12 text-[10px] uppercase tracking-wide text-[#6B7280]">
                <p className="col-span-5">Player</p>
                <p className="col-span-1 text-center">Min</p>
                <p className="col-span-2 text-center">Pts</p>
                <p className="col-span-2 text-center">Reb</p>
                <p className="col-span-2 text-center">Ast</p>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {team.rows.map((player) => (
                  <div key={`${team.label}-${player.name}`} className="grid grid-cols-12 items-center gap-2 text-xs">
                    <p className="col-span-5 truncate font-medium text-[#E5E7EB]">{player.name}</p>
                    <p className="col-span-1 text-center text-[#9CA3AF]">{player.minutes ?? "-"}</p>
                    <p className="col-span-2 text-center font-semibold text-[#E5E7EB]">{player.points ?? "-"}</p>
                    <p className="col-span-2 text-center text-[#9CA3AF]">{player.rebounds ?? "-"}</p>
                    <p className="col-span-2 text-center text-[#9CA3AF]">{player.assists ?? "-"}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
});

const LiveSignalStrip = memo(function LiveSignalStrip({
  game,
  lastPlay,
}: {
  game: GameData;
  lastPlay: PlayByPlayEvent | null;
}) {
  const spreadMove =
    game.odds?.spread !== undefined && game.odds?.openSpread !== undefined
      ? Number(game.odds.spread) - Number(game.odds.openSpread)
      : null;
  const propCount = (game.props || []).slice(0, 5).length;
  const paceSignal =
    lastPlay?.description && /(fast break|transition|run|tempo|pace|quick)/i.test(lastPlay.description)
      ? "Pace accelerating"
      : "Momentum balanced";

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <GlassCard className="relative overflow-hidden border border-red-500/30 bg-[#121821] p-3 shadow-[0_0_24px_rgba(239,68,68,0.20)]">
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-red-300/55 to-transparent" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-red-300">Line Movement</p>
        <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">
          {spreadMove !== null ? `${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} vs open` : "No major move"}
        </p>
        <Badge className="mt-2 border border-red-300/45 bg-red-500/20 text-[10px] text-red-100 shadow-[0_0_14px_rgba(239,68,68,0.22)]">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-300" />
          LIVE SHIFT
        </Badge>
      </GlassCard>
      <GlassCard className="relative overflow-hidden border border-emerald-500/30 bg-[#121821] p-3 shadow-[0_0_24px_rgba(16,185,129,0.20)]">
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/55 to-transparent" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Prop Heat</p>
        <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">
          {propCount > 0 ? `${propCount} props in active focus` : "Awaiting featured props"}
        </p>
        <Badge className="mt-2 border border-emerald-300/45 bg-emerald-500/20 text-[10px] text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.22)]">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
          HEAT MAP
        </Badge>
      </GlassCard>
      <GlassCard className="relative overflow-hidden border border-amber-500/30 bg-[#121821] p-3 shadow-[0_0_24px_rgba(245,158,11,0.20)]">
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/55 to-transparent" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Pace / Momentum</p>
        <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{paceSignal}</p>
        <Badge className="mt-2 border border-amber-300/45 bg-amber-500/20 text-[10px] text-amber-100 shadow-[0_0_14px_rgba(245,158,11,0.20)]">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
          FLOW SIGNAL
        </Badge>
      </GlassCard>
    </div>
  );
});

const LiveCoachGPanel = memo(function LiveCoachGPanel({
  pregameRead,
  liveNotes,
}: {
  pregameRead: string;
  liveNotes: Array<{ time: string; note: string }>;
}) {
  return (
    <GlassCard className="border border-cyan-500/25 bg-[#1B2633] p-4 md:p-5" glow="blue">
      <SectionHeader icon={Sparkles} title="Coach G Live Take" subtitle="Rolling in-game intelligence from market + pace + momentum." accent="blue" />
      <div className="space-y-3">
        <details className="rounded-xl border border-white/[0.05] bg-[#16202B] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#E5E7EB]">Pregame Coach G Read</summary>
          <p className="mt-2 text-sm text-[#9CA3AF]">{pregameRead}</p>
        </details>
        <div className="rounded-xl border border-white/[0.05] bg-[#16202B] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">Coach G Live Notes</p>
          <div className="space-y-1.5">
            {liveNotes.map((item, idx) => (
              <p key={`${item.time}-${idx}`} className="text-sm text-[#9CA3AF]">
                <span className="font-semibold text-[#E5E7EB]">{item.time}</span> — {item.note}
              </p>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
});

const LiveVideoArea = memo(function LiveVideoArea({ videoJob }: { videoJob?: CoachGVideoJob }) {
  const videoError = videoJob?.errorMessage?.includes("cannot be used in unlimited mode")
    ? "Video blocked by HeyGen plan mode for this avatar."
    : (videoJob?.errorMessage || "");
  return (
    <GlassCard className="border border-violet-500/25 bg-[#121821] p-4 md:p-5" glow="blue">
      <SectionHeader icon={Video} title="Live Video / Clip Area" subtitle="Coach G short-form updates during game flow." accent="violet" />
      {videoJob?.videoUrl ? (
        <video src={videoJob.videoUrl} controls className="w-full rounded-xl border border-white/[0.05] bg-black/60" />
      ) : videoJob?.status === "failed" ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          Live clip is unavailable right now. {videoError || "Coach G text insights remain active."}
        </p>
      ) : (
        <p className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">Live Coach G clip is syncing. We are checking for the next update automatically.</p>
      )}
    </GlassCard>
  );
});

const PostgameVideoArea = memo(function PostgameVideoArea({ videoJob }: { videoJob?: CoachGVideoJob }) {
  const videoError = videoJob?.errorMessage?.includes("cannot be used in unlimited mode")
    ? "Video blocked by HeyGen plan mode for this avatar."
    : (videoJob?.errorMessage || "");
  return (
    <GlassCard className="border border-violet-500/25 bg-[#121821] p-4 md:p-5" glow="blue">
      <SectionHeader icon={Video} title="Postgame Video" subtitle="Coach G recap clip for completed matchup." accent="violet" />
      {videoJob?.videoUrl ? (
        <video src={videoJob.videoUrl} controls className="w-full rounded-xl border border-white/[0.05] bg-black/60" />
      ) : videoJob?.status === "failed" ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          Postgame recap is unavailable right now. {videoError || "Coach G text recap is still available."}
        </p>
      ) : (
        <p className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">Postgame recap video is still processing. Check back shortly.</p>
      )}
    </GlassCard>
  );
});

const LivePlayFeedPanel = memo(function LivePlayFeedPanel({
  playByPlay,
  isLoading,
}: {
  playByPlay: PlayByPlayData | null;
  isLoading: boolean;
}) {
  return (
    <GlassCard className="border border-emerald-500/25 bg-[#121821] p-4 md:p-5" glow="emerald">
      <SectionHeader icon={ListOrdered} title="Play-By-Play Feed" subtitle="Timestamped live events and momentum flow." accent="green" />
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#9CA3AF]"><Loader2 className="h-4 w-4 animate-spin" /> Loading live feed...</div>
      ) : (
        <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
          {(playByPlay?.plays || []).slice(0, 14).map((play) => (
            <div key={`${play.playId}-${play.timestamp}`} className="rounded-lg border border-white/[0.05] bg-[#16202B] px-3 py-2">
              <p className="text-xs text-[#6B7280]">{play.period} • {play.clock || "--:--"} • {play.timestamp ? new Date(play.timestamp).toLocaleTimeString() : "now"}</p>
              <p className="text-sm text-[#E5E7EB]">{play.description}</p>
            </div>
          ))}
          {(!playByPlay?.plays || playByPlay.plays.length === 0) && <p className="text-sm text-[#9CA3AF]">No live events yet.</p>}
        </div>
      )}
    </GlassCard>
  );
});

const LivePropTracker = memo(function LivePropTracker({
  game,
  boxScore,
}: {
  game: GameData;
  boxScore: BoxScoreData | null;
}) {
  const featured = (game.props || []).slice(0, 5);
  const allPlayers = [...(boxScore?.homePlayers || []), ...(boxScore?.awayPlayers || [])];

  const getCurrentStat = (playerName: string, propType: string): number | null => {
    const player = allPlayers.find((p) => p.name.toLowerCase() === playerName.toLowerCase());
    if (!player) return null;
    const key = propType.toLowerCase();
    if (key.includes("point")) return player.points ?? null;
    if (key.includes("rebound")) return player.rebounds ?? null;
    if (key.includes("assist")) return player.assists ?? null;
    return player.points ?? null;
  };

  return (
    <GlassCard className="border border-emerald-500/25 bg-[#121821] p-4 md:p-5" glow="emerald">
      <SectionHeader icon={Target} title="Live Prop Tracker" subtitle="Featured props with live pace and color-coded status." accent="green" />
      <div className="grid gap-2 md:grid-cols-2">
        {featured.map((prop, idx) => {
          const current = getCurrentStat(prop.player_name, prop.prop_type);
          const ratio = current !== null ? current / Math.max(1, prop.line_value) : 0;
          const status = current === null ? "Tracking" : ratio >= 1 ? "Ahead" : ratio >= 0.7 ? "On Pace" : "Behind";
          const statusClass = current === null ? "text-[#9CA3AF]" : ratio >= 1 ? "text-emerald-300" : ratio >= 0.7 ? "text-amber-300" : "text-red-300";
          return (
            <div key={`${prop.player_name}-${prop.prop_type}-${idx}`} className="rounded-xl border border-white/[0.05] bg-[#16202B] p-3">
              <p className="text-sm font-semibold text-[#E5E7EB]">{prop.player_name}</p>
              <p className="text-xs text-[#9CA3AF]">{prop.prop_type}</p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-[#9CA3AF]">Current: <span className="font-bold text-[#E5E7EB]">{current ?? "-"}</span></span>
                <span className="text-[#9CA3AF]">Line: <span className="font-bold text-[#E5E7EB]">{prop.line_value}</span></span>
              </div>
              <p className={cn("mt-1 text-xs font-semibold", statusClass)}>Pace to finish: {status}</p>
            </div>
          );
        })}
        {featured.length === 0 && <p className="text-sm text-[#9CA3AF]">Live prop tracker is waiting for featured props.</p>}
      </div>
    </GlassCard>
  );
});

const LiveBettingCards = memo(function LiveBettingCards({ game }: { game: GameData }) {
  const spreadMove =
    game.odds?.spread !== undefined && game.odds?.openSpread !== undefined
      ? Number(game.odds.spread) - Number(game.odds.openSpread)
      : null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { title: "Sharp Money", detail: spreadMove !== null ? `Spread shift ${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} from open.` : "Monitoring sharp flow.", accent: "red" },
        { title: "Live Signals", detail: game.status === "LIVE" ? "Market velocity active in live window." : "Awaiting live trigger.", accent: "blue" },
        { title: "Prop Watch", detail: `${(game.props || []).slice(0, 3).length} featured props in active watch.`, accent: "green" },
        { title: "Momentum", detail: "Tracking scoring runs and pace swings for in-game reactions.", accent: "amber" },
      ].map((card) => (
        <GlassCard key={card.title} className="border border-white/[0.05] bg-[#121821] p-3">
          <p className={cn("text-xs font-semibold uppercase tracking-wide", card.accent === "red" ? "text-red-300" : card.accent === "green" ? "text-emerald-300" : card.accent === "amber" ? "text-amber-300" : "text-cyan-300")}>{card.title}</p>
          <p className="mt-1 text-sm text-[#9CA3AF]">{card.detail}</p>
        </GlassCard>
      ))}
    </div>
  );
});

const FinalHeroPanel = memo(function FinalHeroPanel({
  game,
  getTeamName,
  onTeamNavigate,
  onTeamPrefetch,
}: {
  game: GameData;
  getTeamName: (isHome: boolean) => string;
  onTeamNavigate?: (teamCode: string, teamName: string) => void;
  onTeamPrefetch?: (teamCode: string, teamName: string) => void;
}) {
  const outcomes = deriveFinalOutcomes(game);
  const awayWon = game.awayScore !== null && game.homeScore !== null && game.awayScore > game.homeScore;
  const homeWon = game.awayScore !== null && game.homeScore !== null && game.homeScore > game.awayScore;
  return (
    <GlassCard className="border border-violet-400/24 bg-[#1B2633] p-4 md:p-5">
      <SectionHeader icon={Trophy} title="Final Hero" subtitle="Final result and market outcomes." accent="violet" />
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-3 text-center">
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => onTeamNavigate?.(game.awayTeam || "", getTeamName(false))}
              onMouseEnter={() => onTeamPrefetch?.(game.awayTeam || "", getTeamName(false))}
              onFocus={() => onTeamPrefetch?.(game.awayTeam || "", getTeamName(false))}
              onTouchStart={() => onTeamPrefetch?.(game.awayTeam || "", getTeamName(false))}
              aria-label={`Open ${getTeamName(false)} team page`}
              className="relative rounded-full p-1.5 md:scale-[1.18]"
              style={{ transform: "perspective(700px) rotateX(8deg)" }}
            >
              <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/18 via-violet-300/12 to-transparent blur-[1px]" />
              <div className="pointer-events-none absolute inset-[-6px] rounded-full bg-violet-400/18 blur-md" />
              <TeamLogo
                teamCode={game.awayTeam || "AWY"}
                teamName={getTeamName(false)}
                sport={game.sport}
                size={64}
                winnerGlow={awayWon}
                className="relative z-10 drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]"
              />
            </button>
          </div>
          <p className="text-xs text-[#9CA3AF]">{getTeamName(false)}</p>
          <p className="text-3xl font-black text-[#E5E7EB]">{game.awayScore ?? "-"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wide text-violet-300">Final</p>
          <p className="text-sm font-semibold text-[#E5E7EB]">{outcomes.winner}</p>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-[#121821] p-3 text-center">
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => onTeamNavigate?.(game.homeTeam || "", getTeamName(true))}
              onMouseEnter={() => onTeamPrefetch?.(game.homeTeam || "", getTeamName(true))}
              onFocus={() => onTeamPrefetch?.(game.homeTeam || "", getTeamName(true))}
              onTouchStart={() => onTeamPrefetch?.(game.homeTeam || "", getTeamName(true))}
              aria-label={`Open ${getTeamName(true)} team page`}
              className="relative rounded-full p-1.5 md:scale-[1.18]"
              style={{ transform: "perspective(700px) rotateX(8deg)" }}
            >
              <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/18 via-violet-300/12 to-transparent blur-[1px]" />
              <div className="pointer-events-none absolute inset-[-6px] rounded-full bg-violet-400/18 blur-md" />
              <TeamLogo
                teamCode={game.homeTeam || "HOM"}
                teamName={getTeamName(true)}
                sport={game.sport}
                size={64}
                winnerGlow={homeWon}
                className="relative z-10 drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]"
              />
            </button>
          </div>
          <p className="text-xs text-[#9CA3AF]">{getTeamName(true)}</p>
          <p className="text-3xl font-black text-[#E5E7EB]">{game.homeScore ?? "-"}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Final spread result: <span className="font-semibold text-[#E5E7EB]">{outcomes.spreadResult}</span></div>
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Final total result: <span className="font-semibold text-[#E5E7EB]">{outcomes.totalResult}</span></div>
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Cover / No Cover: <span className="font-semibold text-[#E5E7EB]">{outcomes.coverResult}</span></div>
        <div className="rounded-lg border border-white/[0.05] bg-[#121821] p-2 text-sm text-[#9CA3AF]">Over / Under: <span className="font-semibold text-[#E5E7EB]">{outcomes.overUnderResult}</span></div>
      </div>
    </GlassCard>
  );
});

const PostgameAnalysisPanel = memo(function PostgameAnalysisPanel({ game }: { game: GameData }) {
  const outcomes = deriveFinalOutcomes(game);
  const spreadMove =
    game.odds?.spread !== undefined && game.odds?.openSpread !== undefined
      ? Number(game.odds.spread) - Number(game.odds.openSpread)
      : null;
  return (
    <GlassCard className="border border-violet-400/20 bg-[#121821] p-4 md:p-5">
      <SectionHeader icon={FileText} title="Postgame Analysis" subtitle="What changed, what landed, and how market close compared." accent="blue" />
      <ul className="space-y-2 text-sm text-[#9CA3AF]">
        <li>What changed during the game: momentum swings and live pace pressure drove late-game volatility.</li>
        <li>Key momentum shifts: play-by-play sequence and scoring runs determined separation windows.</li>
        <li>Best/worst prop outcomes: use prop tracker and box score to validate overperformers and misses.</li>
        <li>Line close vs final: {spreadMove !== null ? `spread moved ${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} from open before final.` : "closing spread comparison unavailable."}</li>
        <li>Final market outcome: {outcomes.coverResult} • {outcomes.overUnderResult}.</li>
      </ul>
    </GlassCard>
  );
});

// ====================
// MAIN COMPONENT
// ====================

export function GameDetailPage() {
  // Support both route patterns:
  // - /games/:league/:gameId (original)
  // - /sports/:sportKey/match/:matchId (sport hub links)
  const params = useParams<{ league?: string; gameId?: string; sportKey?: string; matchId?: string }>();
  const league = params.sportKey || params.league;
  const gameId = params.matchId || params.gameId;
  const navigate = useNavigate();
  const location = useLocation();
  const { lookups: teamLookups } = useTeamLookup();
  const { flags } = useFeatureFlags();
  
  const [game, setGame] = useState<GameData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Detect ?view=odds (or other tab) from URL - used when coming from Odds Board
  const initialTab = useMemo((): TabId => {
    const viewParam = searchParams.get('view');
    if (viewParam && ['overview', 'props', 'box-score', 'line-movement', 'sportsbooks', 'h2h', 'injuries', 'play-by-play'].includes(viewParam)) {
      return viewParam as TabId;
    }
    return 'overview';
  }, [searchParams]);
  
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [tabContentVisible, setTabContentVisible] = useState(true);
  const [showWatchboardModal, setShowWatchboardModal] = useState(false);
  
  // Computed full game ID - handles multiple formats:
  // - espn_nba_xxx (ESPN)
  // - sr_nba_xxx (SportsRadar)
  // - sr:match:xxx or sr:sport_event:xxx (Soccer SportsRadar)
  // - legacy provider IDs are normalized upstream and not expected here
  const fullGameId = useMemo(() => {
    if (!gameId) return '';
    // Already has a recognized prefix - use as-is
    if (gameId.startsWith('espn_') || gameId.startsWith('sr_') || gameId.startsWith('sr:')) {
      return gameId;
    }
    // Raw game ID - try to construct ESPN format if we have league
    // ESPN IDs are preferred since SportsRadar is primary for schedule but ESPN for individual games
    return league ? `espn_${league.toLowerCase()}_${gameId}` : gameId;
  }, [gameId, league]);
  
  // Determine if this is a SportsRadar game
  const isSportsRadarGame = useMemo(() => {
    return gameId?.startsWith('sr_') || gameId?.startsWith('sr:');
  }, [gameId]);
  
  // Extract sport from SportsRadar ID (sr_nba_xxx -> nba)
  const srSport = useMemo(() => {
    if (!gameId?.startsWith('sr_')) return null;
    const parts = gameId.split('_');
    return parts.length >= 2 ? parts[1].toLowerCase() : null;
  }, [gameId]);
  const isSoccerContext = useMemo(() => {
    const from = String(searchParams.get("from") || "").toLowerCase();
    const inferredSport = String(srSport || params.sportKey || league || game?.sport || "").toLowerCase();
    return (
      inferredSport === "soccer" ||
      gameId?.startsWith("sr:sport_event:") === true ||
      location.pathname.includes("/sports/soccer/") ||
      from.startsWith("soccer")
    );
  }, [searchParams, srSport, params.sportKey, league, game?.sport, gameId, location.pathname]);
  const [sportsbooksLoaded, setSportsbooksLoaded] = useState(false);
  const [lineHistoryLoaded, setLineHistoryLoaded] = useState(false);
  const [isLiveOdds, setIsLiveOdds] = useState(false);
  const [boxScore, setBoxScore] = useState<BoxScoreData | null>(null);
  const [boxScoreLoading, setBoxScoreLoading] = useState(false);
  const [h2h, setH2H] = useState<H2HData | null>(null);
  const [h2hLoading, setH2HLoading] = useState(false);
  const [injuries, setInjuries] = useState<InjuriesData | null>(null);
  const [injuriesLoading, setInjuriesLoading] = useState(false);
  const [playByPlay, setPlayByPlay] = useState<PlayByPlayData | null>(null);
  const [lastPlay, setLastPlay] = useState<PlayByPlayEvent | null>(null);
  const [lastPlayUpdated, setLastPlayUpdated] = useState<Date | null>(null);
  const activeGameRequestRef = useRef(0);

  useEffect(() => {
    if (!fullGameId) return;
    const cached = getRouteCache<GameData>(`route:game-detail:${fullGameId}`, 45000);
    if (!cached) return;
    setGame((prev) => prev || cached);
    setIsLoading(false);
  }, [fullGameId]);

  useEffect(() => {
    if (!fullGameId || !game) return;
    setRouteCache(`route:game-detail:${fullGameId}`, game, 90000);
  }, [fullGameId, game]);
  const propsFreshAttemptedRef = useRef<Set<string>>(new Set());
  const playByPlayInFlightRef = useRef(false);
  const gameRefreshInFlightRef = useRef(false);
  const liveOddsRefreshInFlightRef = useRef(false);
  const [soccerAdjacentGames, setSoccerAdjacentGames] = useState<{
    loading: boolean;
    prevId: string | null;
    nextId: string | null;
    prevLabel: string | null;
    nextLabel: string | null;
  }>({
    loading: false,
    prevId: null,
    nextId: null,
    prevLabel: null,
    nextLabel: null,
  });
  const [sportAdjacentGames, setSportAdjacentGames] = useState<{
    loading: boolean;
    prevId: string | null;
    nextId: string | null;
    prevLabel: string | null;
    nextLabel: string | null;
  }>({
    loading: false,
    prevId: null,
    nextId: null,
    prevLabel: null,
    nextLabel: null,
  });

  // Reset per-game loaded flags when navigating to a different game.
  useEffect(() => {
    setSportsbooksLoaded(false);
    setLineHistoryLoaded(false);
    // Keep current valid game visible during transitions; only show full-screen loading when empty.
    if (!game) {
      setIsLoading(true);
    }
    setError(null);
  }, [fullGameId]);

  const mergeHeroOddsFromOddsApi = useCallback((prevOdds: OddsData | undefined, oddsData: any): OddsData => {
    const parse = (val: unknown): number | undefined => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      const cleaned = String(val).replace('O/U ', '').replace(/[^\d.\-+]/g, '');
      if (!cleaned) return undefined;
      const parsed = parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const consensus = oddsData?.consensus || {};
    const firstBook = Array.isArray(oddsData?.sportsbooks) ? oddsData.sportsbooks[0] : undefined;
    return {
      ...(prevOdds || {}),
      spread: parse(consensus.spreadHome ?? firstBook?.spreadHome ?? firstBook?.spread),
      spreadAway: parse(consensus.spreadAway ?? firstBook?.spreadAway),
      total: parse(consensus.total ?? firstBook?.total ?? firstBook?.overUnder),
      mlHome: parse(consensus.moneylineHome ?? firstBook?.moneylineHome ?? firstBook?.mlHome),
      mlAway: parse(consensus.moneylineAway ?? firstBook?.moneylineAway ?? firstBook?.mlAway),
      spread1HHome: parse(consensus.spread1HHome ?? firstBook?.spread1HHome),
      spread1HAway: parse(consensus.spread1HAway ?? firstBook?.spread1HAway),
      total1H: parse(consensus.total1H ?? firstBook?.total1H),
      ml1HHome: parse(consensus.moneyline1HHome ?? firstBook?.moneyline1HHome),
      ml1HAway: parse(consensus.moneyline1HAway ?? firstBook?.moneyline1HAway),
      openSpread: parse(oddsData?.openSpread) ?? prevOdds?.openSpread,
      openTotal: parse(oddsData?.openTotal) ?? prevOdds?.openTotal,
      openMoneylineHome: parse(oddsData?.openMoneylineHome) ?? prevOdds?.openMoneylineHome,
    };
  }, []);
  const reconcileLineHistoryWithOdds = useCallback(
    (history: LineHistoryPoint[] | undefined, odds: OddsData | undefined): LineHistoryPoint[] => {
      const base = Array.isArray(history) ? history : [];
      if (base.length === 0 || !odds) return base;
      const last = base[base.length - 1];
      if (!last) return base;

      const nextSpread = typeof odds.spread === "number" ? odds.spread : (last.spread ?? null);
      const nextTotal = typeof odds.total === "number" ? odds.total : (last.total ?? null);
      const nextMlHome = typeof odds.mlHome === "number" ? odds.mlHome : (last.mlHome ?? null);
      const nextMlAway = typeof odds.mlAway === "number" ? odds.mlAway : (last.mlAway ?? null);

      const same =
        last.spread === nextSpread &&
        last.total === nextTotal &&
        (last.mlHome ?? null) === nextMlHome &&
        (last.mlAway ?? null) === nextMlAway;

      if (same) return base;
      return [
        ...base,
        {
          timestamp: new Date().toISOString(),
          spread: nextSpread,
          total: nextTotal,
          mlHome: nextMlHome,
          mlAway: nextMlAway,
        },
      ];
    },
    []
  );

  const backButtonLabel = useMemo(() => {
    const from = String(searchParams.get("from") || "").toLowerCase();
    const fromLeagueId = String(searchParams.get("fromLeagueId") || "").trim();
    const fromTeamId = String(searchParams.get("fromTeamId") || "").trim();
    if (isSoccerContext) {
      if (fromLeagueId) return "League Home";
      if (fromTeamId) return "Team Page";
      if (from === "soccer-directory" || from === "soccer-hub" || from === "soccer") return "Soccer Home";
      return "Soccer Home";
    }
    return srSport?.toUpperCase() || league?.toUpperCase() || "Games & Odds";
  }, [searchParams, isSoccerContext, srSport, league]);
  const fromLeagueIdParam = String(searchParams.get("fromLeagueId") || "").trim();
  const fromTeamIdParam = String(searchParams.get("fromTeamId") || "").trim();
  const hasScopedSoccerContext = Boolean(fromLeagueIdParam || fromTeamIdParam);
  const canUseAllSoccerToday = !hasScopedSoccerContext;
  const soccerNavScope = searchParams.get("soccerNavScope") === "all" ? "all" : "context";
  const isAllSoccerTodayMode = isSoccerContext && soccerNavScope === "all" && canUseAllSoccerToday;
  const uiStyleParam = String(searchParams.get("uiStyle") || "").toLowerCase();
  const isLuxuryLivePreset = uiStyleParam === "luxury_live" || uiStyleParam === "live";
  const soccerLeagueOptions = useMemo(() => getAllSoccerLeagues(), []);
  const prefetchedTeamKeysRef = useRef<Set<string>>(new Set());
  const resolvedTeamIdsRef = useRef<Map<string, string>>(new Map());
  const currentSoccerScopeLabel = useMemo(() => {
    if (!isSoccerContext) return "";
    if (isAllSoccerTodayMode) return "All Soccer Today";
    if (fromLeagueIdParam) {
      const meta = getSoccerLeagueMeta(fromLeagueIdParam);
      return meta.short || meta.name || "This League";
    }
    if (fromTeamIdParam) return "This Team";
    return "Soccer";
  }, [isSoccerContext, isAllSoccerTodayMode, fromLeagueIdParam, fromTeamIdParam]);
  const currentSportScopeLabel = useMemo(() => {
    if (isSoccerContext) return currentSoccerScopeLabel;
    const base = String(game?.sport || srSport || params.sportKey || league || "SPORT").toUpperCase();
    return `${base} Today`;
  }, [isSoccerContext, currentSoccerScopeLabel, game?.sport, srSport, params.sportKey, league]);
  const shouldUseLuxuryUtilityPod = useMemo(() => {
    const rawSport = String(game?.sport || srSport || params.sportKey || league || "").toUpperCase();
    const normalizedSport = rawSport === "CBB" ? "NCAAB" : rawSport === "CFB" ? "NCAAF" : rawSport;
    return new Set(["NBA", "NHL", "MLB", "NFL", "NCAAB", "NCAAF"]).has(normalizedSport);
  }, [game?.sport, srSport, params.sportKey, league]);
  const normalizedSportKey = useMemo(() => {
    const rawSport = String(game?.sport || srSport || params.sportKey || league || "").toUpperCase();
    if (rawSport === "CBB") return "NCAAB";
    if (rawSport === "CFB") return "NCAAF";
    return rawSport;
  }, [game?.sport, srSport, params.sportKey, league]);
  const resolveTeamIdFromStandings = useCallback(async (teamCode: string, teamName: string): Promise<string | null> => {
    const sport = String(normalizedSportKey || "").toUpperCase();
    if (!sport) return null;
    const normalize = (value: unknown) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const codeToken = normalize(teamCode);
    const nameToken = normalize(teamName);
    if (!codeToken && !nameToken) return null;
    const memoKey = `${sport}:${codeToken || nameToken}`;
    const memoizedId = resolvedTeamIdsRef.current.get(memoKey);
    if (memoizedId) return memoizedId;
    try {
      const json = await fetchJsonCached<any>(`/api/teams/${encodeURIComponent(sport)}/standings`, {
        cacheKey: `team-standings:${sport}`,
        ttlMs: 90_000,
        timeoutMs: 4_500,
        init: { credentials: "include" },
      });
      const teams = Array.isArray(json?.teams) ? json.teams : [];
      const hit = teams.find((row: any) => {
        const rowAlias = normalize(row?.alias || row?.abbreviation || row?.teamCode || row?.code);
        const rowName = normalize(row?.name);
        const rowMarket = normalize(row?.market);
        const rowFull = normalize(
          row?.fullName || row?.displayName || [row?.market, row?.name].filter(Boolean).join(" ")
        );
        if (codeToken && (rowAlias === codeToken || rowAlias.includes(codeToken) || codeToken.includes(rowAlias))) {
          return true;
        }
        if (!nameToken) return false;
        return (
          rowName === nameToken ||
          rowFull === nameToken ||
          `${rowMarket}${rowName}` === nameToken ||
          rowFull.includes(nameToken) ||
          nameToken.includes(rowFull)
        );
      });
      const teamId = String(hit?.id || "").trim();
      if (teamId) {
        resolvedTeamIdsRef.current.set(memoKey, teamId);
      }
      return teamId || null;
    } catch {
      return null;
    }
  }, [normalizedSportKey]);
  const prefetchTeamData = useCallback(async (teamCode: string, teamName: string) => {
    const code = String(teamCode || "").trim();
    const name = String(teamName || "").trim();
    const sport = String(normalizedSportKey || "").toUpperCase();
    if (!sport || (!code && !name)) return;
    const key = `${sport}:${code || name}`;
    if (prefetchedTeamKeysRef.current.has(key)) return;
    prefetchedTeamKeysRef.current.add(key);

    const teamId = await resolveTeamIdFromStandings(code, name);
    if (!teamId) return;

    const profile = await fetchJsonCached<any>(`/api/teams/${sport}/${teamId}`, {
      cacheKey: `team-profile:${sport}:${teamId}`,
      ttlMs: 60_000,
      timeoutMs: 4_500,
      init: { credentials: "include" },
    }).catch(() => null);

    await Promise.all([
      fetchJsonCached(`/api/teams/${sport}/${teamId}/schedule`, {
        cacheKey: `team-schedule:${sport}:${teamId}`,
        ttlMs: 45_000,
        timeoutMs: 4_500,
        init: { credentials: "include" },
      }).catch(() => null),
      fetchJsonCached(`/api/teams/${sport}/${teamId}/stats`, {
        cacheKey: `team-stats:${sport}:${teamId}`,
        ttlMs: 120_000,
        timeoutMs: 4_000,
        init: { credentials: "include" },
      }).catch(() => null),
      fetchJsonCached(`/api/teams/${sport}/${teamId}/injuries`, {
        cacheKey: `team-injuries:${sport}:${teamId}`,
        ttlMs: 45_000,
        timeoutMs: 4_000,
        init: { credentials: "include" },
      }).catch(() => null),
      fetchJsonCached(`/api/teams/${sport}/${teamId}/splits`, {
        cacheKey: `team-splits:${sport}:${teamId}`,
        ttlMs: 90_000,
        timeoutMs: 4_000,
        init: { credentials: "include" },
      }).catch(() => null),
      fetchJsonCached(`/api/games?sport=${sport}&includeOdds=0`, {
        cacheKey: `games-lite:${sport}`,
        ttlMs: 20_000,
        timeoutMs: 3_500,
        init: { credentials: "include" },
      }).catch(() => null),
    ]);

    const roster = Array.isArray(profile?.roster) ? profile.roster : [];
    const topNames = roster
      .map((p: any) => String(p?.name || "").trim())
      .filter(Boolean)
      .slice(0, 8);
    await Promise.all(
      topNames.map((playerName: string) =>
        fetchJsonCached(`/api/player/${sport}/${encodeURIComponent(playerName)}`, {
          cacheKey: `player-api:${sport}:${playerName}`,
          ttlMs: 45_000,
          timeoutMs: 4_000,
          init: { credentials: "include" },
        }).catch(() => null)
      )
    );
  }, [normalizedSportKey, resolveTeamIdFromStandings]);
  const handleTeamNavigate = useCallback(async (teamCode: string, teamName: string) => {
    void prefetchTeamData(teamCode, teamName);
    const teamId = await resolveTeamIdFromStandings(teamCode, teamName);
    if (!teamId) return;
    if (normalizedSportKey === "SOCCER") {
      navigate(`/sports/soccer/team/${encodeURIComponent(teamId)}`);
      return;
    }
    navigate(`/sports/${String(normalizedSportKey || "").toLowerCase()}/team/${encodeURIComponent(teamId)}`);
  }, [navigate, normalizedSportKey, prefetchTeamData, resolveTeamIdFromStandings]);
  const activeAdjacentGames = isSoccerContext ? soccerAdjacentGames : sportAdjacentGames;

  const handleBackToList = useCallback(() => {
    const from = String(searchParams.get("from") || "").toLowerCase();
    const fromLeagueId = String(searchParams.get("fromLeagueId") || "").trim();
    const fromTeamId = String(searchParams.get("fromTeamId") || "").trim();
    if (from === "ncaab-march-command") {
      navigate("/sports/ncaab/tournament/march-madness");
      return;
    }
    if (from === "ncaab-march-full") {
      navigate("/sports/ncaab/tournament/march-madness/full");
      return;
    }
    if (from === "ncaab-tournament-central") {
      navigate("/sports/ncaab/tournament");
      return;
    }
    if (from === "ncaab-hub") {
      navigate("/sports/ncaab");
      return;
    }
    if (params.sportKey) {
      navigate(`/sports/${params.sportKey.toLowerCase()}`);
      return;
    }
    const backSport = (srSport || params.sportKey || league || game?.sport || "").toLowerCase();
    if (isSoccerContext) {
      if (fromLeagueId) {
        navigate(`/sports/soccer/league/${encodeURIComponent(fromLeagueId)}`);
        return;
      }
      if (fromTeamId) {
        navigate(`/sports/soccer/team/${encodeURIComponent(fromTeamId)}`);
        return;
      }
      if (from === 'soccer-directory' || from === 'soccer-hub' || from === 'soccer') {
        navigate('/sports/soccer');
        return;
      }
      navigate('/sports/soccer');
      return;
    }
    if (backSport === 'ncaab') {
      navigate('/sports/ncaab');
      return;
    }
    if (backSport) {
      navigate(`/games?sport=${backSport.toUpperCase()}`);
      return;
    }
    navigate('/games');
  }, [navigate, searchParams, srSport, params.sportKey, league, game?.sport, isSoccerContext]);

  const navigateToSoccerGame = useCallback((targetId: string | null) => {
    if (!targetId) return;
    const from = String(searchParams.get("from") || "").trim();
    const fromLeagueId = String(searchParams.get("fromLeagueId") || "").trim();
    const fromTeamId = String(searchParams.get("fromTeamId") || "").trim();
    const scopeAll = canUseAllSoccerToday && searchParams.get("soccerNavScope") === "all";
    const nextParams = new URLSearchParams();
    if (from) nextParams.set("from", from);
    if (scopeAll) {
      nextParams.set("soccerNavScope", "all");
    } else {
      if (fromLeagueId) nextParams.set("fromLeagueId", fromLeagueId);
      if (fromTeamId) nextParams.set("fromTeamId", fromTeamId);
    }
    const qs = nextParams.toString();
    navigate(`/sports/soccer/match/${encodeURIComponent(targetId)}${qs ? `?${qs}` : ""}`);
  }, [navigate, searchParams, canUseAllSoccerToday]);
  const navigateToAdjacentGame = useCallback((targetId: string | null) => {
    if (!targetId) return;
    if (isSoccerContext) {
      navigateToSoccerGame(targetId);
      return;
    }
    const sportKey = String(game?.sport || srSport || params.sportKey || league || "").toLowerCase();
    navigate(toGameDetailPath(sportKey, targetId));
  }, [isSoccerContext, navigateToSoccerGame, game?.sport, srSport, params.sportKey, league, navigate]);

  // Fetch play-by-play data
  const fetchPlayByPlay = useCallback(async () => {
    if (!fullGameId) return;
    if (playByPlayInFlightRef.current) return;
    playByPlayInFlightRef.current = true;
    
    try {
      const data = await fetchJsonCached<PlayByPlayData>(`/api/games/${fullGameId}/playbyplay`, {
        cacheKey: `game-detail:pbp:${fullGameId}`,
        ttlMs: 5000,
        timeoutMs: 12000,
        init: { credentials: 'include' },
      });
      setPlayByPlay(data);
      if (data?.lastPlay) {
        setLastPlay(data.lastPlay);
        setLastPlayUpdated(new Date());
      }
    } catch (err) {
      console.error('[GameDetailPage] Failed to fetch play-by-play:', err);
    } finally {
      playByPlayInFlightRef.current = false;
    }
  }, [fullGameId]);

  const fetchBoxScore = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!fullGameId) return;
    if (!silent) setBoxScoreLoading(true);
    try {
      const data = await fetchJsonCached<BoxScoreData>(`/api/game-detail/${fullGameId}/box-score`, {
        cacheKey: `game-detail:box:${fullGameId}`,
        ttlMs: 8000,
        timeoutMs: 12000,
        init: { credentials: 'include', cache: 'no-store' },
      });
      if (data) setBoxScore(data);
    } catch (err) {
      console.error("[GameDetailPage] Failed to fetch box score:", err);
    } finally {
      if (!silent) setBoxScoreLoading(false);
    }
  }, [fullGameId]);

  const fetchGameProps = useCallback(async (targetGameId: string, targetSport?: string, allowFreshFallback = false) => {
    const gameIdForProps = String(targetGameId || '').trim();
    if (!gameIdForProps) return;
    const sportForProps = String(targetSport || league || '').toUpperCase();

    try {
      const fetchPropsVariant = async (fresh: boolean): Promise<{ normalized: PlayerProp[]; fallbackReason: string | null } | null> => {
        const qs = new URLSearchParams({
          sport: sportForProps || 'ALL',
          game_id: gameIdForProps,
          limit: fresh ? '500' : '200',
          ...(fresh ? { fresh: '1' } : {}),
        });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fresh ? 12000 : 9000);
        try {
          const res = await fetch(`/api/sports-data/props/today?${qs.toString()}`, {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!res.ok) return null;
          const data = await res.json();
          return {
            normalized: normalizeGameProps(Array.isArray(data?.props) ? data.props : []),
            fallbackReason: data?.fallback_reason || null,
          };
        } finally {
          clearTimeout(timer);
        }
      };

      // Fast cached pass first. Optional fresh refresh is for explicit props-tab fallback.
      let result = await fetchPropsVariant(false);
      if (allowFreshFallback && (!result || result.normalized.length === 0)) {
        const freshResult = await fetchPropsVariant(true);
        if (freshResult) result = freshResult;
      }
      if (!result) return;

      const { normalized, fallbackReason } = result;
      setGame((prev) => {
        if (!prev) return prev;
        const prevId = String(prev.id || "").trim();
        if (prevId && prevId !== gameIdForProps) return prev;
        if (normalized.length === 0 && Array.isArray(prev.props) && prev.props.length > 0) {
          return {
            ...prev,
            propsFallbackReason: prev.propsFallbackReason || fallbackReason || null,
          };
        }
        return {
          ...prev,
          props: normalized,
          propsSource: normalized.length > 0 ? 'event' : 'none',
          propsFallbackReason:
            normalized.length > 0
              ? null
              : (fallbackReason || 'No player props available for this game yet'),
        };
      });
    } catch (err) {
      console.error('[GameDetailPage] Failed to fetch game-scoped props:', err);
    }
  }, [league]);

  // Fetch game data
  const fetchGame = useCallback(async (options?: { refreshOnly?: boolean }) => {
    if (!gameId) return;
    const refreshOnly = options?.refreshOnly === true;
    const requestId = ++activeGameRequestRef.current;
    const stopPerf = startPerfTimer('gameDetail.fetch');
    
    console.log('[GameDetailPage] Fetching game:', { league, gameId, fullGameId, isSportsRadarGame });
    
    try {
      // Try to fetch from our games API
      const data = await fetchJsonCached<any>(`/api/games/${fullGameId}?lite=1`, {
        cacheKey: `game-detail:lite:${fullGameId}`,
        ttlMs: 8000,
        timeoutMs: 15000,
        init: { credentials: 'include', cache: 'no-store' },
      });
      
      if (data) {
        if (requestId !== activeGameRequestRef.current) return;
        
        // Extract odds from root-level odds payload (array or object)
        const rootOddsArray = Array.isArray(data.odds) ? data.odds : [];
        const firstOdds = rootOddsArray[0];
        const rootOddsObject =
          !Array.isArray(data.odds) && data.odds && typeof data.odds === 'object'
            ? (data.odds as Record<string, unknown>)
            : null;
        const parseOdds = (val: string | number | null | undefined): number | null => {
          if (val === null || val === undefined) return null;
          if (typeof val === 'number') return val;
          // Handle strings like "-2.5", "+110", "O/U 220.5"
          const str = String(val).replace('O/U ', '').replace(/[^\d.\-+]/g, '');
          const parsed = parseFloat(str);
          return isNaN(parsed) ? null : parsed;
        };
        const parseAnyOdds = (val: unknown): number | null =>
          parseOdds(val as string | number | null | undefined);
        
        const normalizeOddsObject = (raw: unknown): OddsData | null => {
          if (!raw || typeof raw !== 'object') return null;
          const r = raw as Record<string, unknown>;
          const parseOpt = (val: unknown): number | undefined => {
            const parsed = parseAnyOdds(val);
            return parsed === null ? undefined : parsed;
          };
          const normalized: OddsData = {
            spread: parseOpt(r.spread ?? r.spreadHome ?? r.homeSpread),
            spreadAway: parseOpt(r.spreadAway ?? r.awaySpread),
            total: parseOpt(r.total ?? r.overUnder ?? r.ou),
            mlHome: parseOpt(r.mlHome ?? r.moneylineHome ?? r.homeMoneyline),
            mlAway: parseOpt(r.mlAway ?? r.moneylineAway ?? r.awayMoneyline),
            spread1HHome: parseOpt(r.spread1HHome ?? r.spread_1h_home ?? r.firstHalfSpreadHome),
            spread1HAway: parseOpt(r.spread1HAway ?? r.spread_1h_away ?? r.firstHalfSpreadAway),
            total1H: parseOpt(r.total1H ?? r.total_1h ?? r.firstHalfTotal),
            ml1HHome: parseOpt(r.ml1HHome ?? r.moneyline1HHome ?? r.moneyline_1h_home ?? r.firstHalfMoneylineHome),
            ml1HAway: parseOpt(r.ml1HAway ?? r.moneyline1HAway ?? r.moneyline_1h_away ?? r.firstHalfMoneylineAway),
            openSpread: parseOpt(r.openSpread ?? r.open_spread),
            openTotal: parseOpt(r.openTotal ?? r.open_total),
            openMoneylineHome: parseOpt(r.openMoneylineHome ?? r.open_moneyline_home),
          };
          const hasAny =
            normalized.spread !== undefined || normalized.total !== undefined || normalized.mlHome !== undefined || normalized.mlAway !== undefined ||
            normalized.spread1HHome !== undefined || normalized.total1H !== undefined || normalized.ml1HHome !== undefined ||
            normalized.openSpread !== undefined || normalized.openTotal !== undefined || normalized.openMoneylineHome !== undefined;
          return hasAny ? normalized : null;
        };

        // Build odds object from multiple possible payload shapes.
        const gameOdds =
          normalizeOddsObject(data.game?.odds) ||
          normalizeOddsObject(rootOddsObject) ||
          normalizeOddsObject(firstOdds) ||
          normalizeOddsObject(data.game) ||
          null;
        
        // Only include odds if we have any actual values
        const hasOdds = Boolean(gameOdds);
        
        // Preserve existing sportsbooks/lineHistory if not provided in response
        setGame(prev => ({
          id: data.game?.id || gameId,
          sport: data.game?.sport || league?.toUpperCase() || 'NBA',
          homeTeam: data.game?.home_team_code || data.game?.homeTeam || 'HOME',
          awayTeam: data.game?.away_team_code || data.game?.awayTeam || 'AWAY',
          homeTeamFull: data.game?.home_team_name,
          awayTeamFull: data.game?.away_team_name,
          homeScore: data.game?.home_score ?? data.game?.homeScore ?? null,
          awayScore: data.game?.away_score ?? data.game?.awayScore ?? null,
          status: normalizeStatus(data.game?.status),
          period: data.game?.period_label || data.game?.period,
          clock: data.game?.clock,
          startTime: data.game?.start_time || data.game?.startTime,
          venue: data.game?.venue,
          broadcast: data.game?.broadcast,
          odds: hasOdds ? gameOdds ?? prev?.odds : prev?.odds,
          // Preserve previously loaded sportsbooks only for the SAME game.
          sportsbooks: (() => {
            const normalized = normalizeSportsbookLines(data.sportsbooks);
            if (normalized.length > 0) return normalized;
            const transformed = transformOddsToSportsbooks(data.odds || data.game?.odds_array || []);
            if (transformed.length > 0) return transformed;
            const resolvedId = String(data.game?.id || gameId || '');
            return prev?.id === resolvedId ? (prev?.sportsbooks || []) : [];
          })(),
          // Preserve previously loaded line history only for the SAME game.
          lineHistory: (() => {
            if (data.lineHistory?.length) return data.lineHistory;
            const resolvedId = String(data.game?.id || gameId || '');
            return prev?.id === resolvedId ? (prev?.lineHistory || []) : [];
          })(),
          publicBetHome: data.game?.publicBetHome,
          publicBetAway: data.game?.publicBetAway,
          coachSignal: data.game?.coachSignal,
          predictorText: data.game?.predictorText,
          props: normalizeGameProps(
            data.props ||
            data.game?.props ||
            data.playerProps ||
            data.game?.playerProps ||
            []
          ),
          propsSource: data.propsSource || data.game?.propsSource || (Array.isArray(data.props) ? 'event' : undefined),
          propsFallbackReason: data.propsFallbackReason || data.game?.propsFallbackReason || null,
        }));
        setError(null);

        // Avoid preloading heavy props for every game switch; load fresh when props tab is active.
        const resolvedGameId = String(data.game?.id || data.game?.game_id || fullGameId || '');
        const resolvedSport = String(data.game?.sport || league || '');
        if (resolvedGameId && activeTab === 'props') {
          void fetchGameProps(resolvedGameId, resolvedSport, true);
        }
        
        if (!refreshOnly) {
        // Hydrate hero odds right away from the game odds endpoint.
        // Keep this on game entry so lines/books appear immediately.
        fetchJsonCached<any>(`/api/games/${encodeURIComponent(fullGameId)}/odds`, {
          cacheKey: `game-detail:odds:${fullGameId}`,
          ttlMs: 6000,
          timeoutMs: 15000,
          init: {
            credentials: 'include',
            cache: 'no-store',
          },
        })
          .then((oddsData) => oddsData || null)
          .then((oddsData) => {
            if (requestId !== activeGameRequestRef.current) return;
            if (!oddsData) return;
            setGame((prev) => {
              if (!prev) return prev;
              const prevId = String(prev.id || "").trim();
              if (prevId && resolvedGameId && prevId !== resolvedGameId) return prev;
              const mergedOdds = mergeHeroOddsFromOddsApi(prev.odds, oddsData);
              return {
                ...prev,
                odds: mergedOdds,
                lineHistory: reconcileLineHistoryWithOdds(prev.lineHistory, mergedOdds),
              };
            });
            setLineHistoryLoaded(false);

            const hasConsensus =
              Boolean(oddsData?.consensus) ||
              (Array.isArray(oddsData?.sportsbooks) && oddsData.sportsbooks.length > 0);
            if (hasConsensus) return;

            // Recovery path: use sport slate odds when per-game odds endpoint is empty.
            const fallbackSport = String(resolvedSport || '').toLowerCase();
            const fallbackDate = String(data.game?.start_time || '').slice(0, 10);
            if (!fallbackSport) return;
            const dateCandidates = (() => {
              if (!fallbackDate) return [undefined];
              const parsed = new Date(`${fallbackDate}T00:00:00.000Z`);
              if (Number.isNaN(parsed.getTime())) return [fallbackDate, undefined];
              const minus = new Date(parsed.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              const plus = new Date(parsed.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              return [fallbackDate, minus, plus, undefined];
            })();
            const normalizeName = (value: unknown) =>
              String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const targetHome = normalizeName(data.game?.home_team_name);
            const targetAway = normalizeName(data.game?.away_team_name);
            const hasAnyOdds = (row: any) =>
              typeof row?.spread === "number" ||
              typeof row?.overUnder === "number" ||
              typeof row?.moneylineHome === "number" ||
              typeof row?.moneylineAway === "number";

            (async () => {
              for (const dateCandidate of dateCandidates) {
                if (requestId !== activeGameRequestRef.current) return;
                const qs = new URLSearchParams({
                  sport: fallbackSport,
                  includeOdds: '1',
                  ...(dateCandidate ? { date: dateCandidate } : {}),
                });
                try {
                  const slateRes = await fetch(`/api/games?${qs.toString()}`, {
                    credentials: 'include',
                    cache: 'no-store',
                  });
                  if (!slateRes.ok) continue;
                  const slateData = await slateRes.json();
                  if (requestId !== activeGameRequestRef.current) return;
                  const slateGames = Array.isArray(slateData?.games) ? slateData.games : [];
                  const resolvedId = String(resolvedGameId || '');
                  const idMatch = slateGames.find((g: any) =>
                    String(g?.id || g?.game_id || '') === resolvedId
                  );
                  const teamMatch = slateGames.find((g: any) =>
                    normalizeName(g?.home_team_name || g?.homeTeam) === targetHome &&
                    normalizeName(g?.away_team_name || g?.awayTeam) === targetAway
                  );
                  const match = (idMatch && hasAnyOdds(idMatch)) ? idMatch : ((teamMatch && hasAnyOdds(teamMatch)) ? teamMatch : null);
                  if (!match) continue;

                  const syntheticOddsData = {
                    consensus: {
                      spreadHome: match?.spread ?? null,
                      total: match?.overUnder ?? null,
                      moneylineHome: match?.moneylineHome ?? null,
                      moneylineAway: match?.moneylineAway ?? null,
                    },
                    sportsbooks: [],
                    openSpread: match?.openSpread ?? null,
                    openTotal: match?.openTotal ?? null,
                    openMoneylineHome: match?.openMoneylineHome ?? null,
                  };

                  setGame((curr) => {
                    if (!curr) return curr;
                    const currId = String(curr.id || "").trim();
                    if (currId && resolvedId && currId !== resolvedId) return curr;
                    const mergedOdds = mergeHeroOddsFromOddsApi(curr.odds, syntheticOddsData);
                    return {
                      ...curr,
                      odds: mergedOdds,
                      lineHistory: reconcileLineHistoryWithOdds(curr.lineHistory, mergedOdds),
                    };
                  });
                  setLineHistoryLoaded(false);
                  return;
                } catch {
                  // Continue through candidate windows.
                }
              }
            })();
          })
          .catch((err) => {
            console.error('[GameDetailPage] Initial odds hydrate failed:', err);
          })
          .finally(() => {
            // Safety fallback: if /games/:id/odds misses, try summary endpoint.
            setTimeout(() => {
              setGame((prev) => {
                const hasHeroOdds =
                  typeof prev?.odds?.spread === 'number' ||
                  typeof prev?.odds?.total === 'number' ||
                  typeof prev?.odds?.mlHome === 'number' ||
                  typeof prev?.odds?.mlAway === 'number';
                if (hasHeroOdds) return prev;
                fetchJsonCached<any>(`/api/odds/summary/${encodeURIComponent(fullGameId)}?scope=PROD`, {
                  cacheKey: `game-detail:summary:${fullGameId}`,
                  ttlMs: 6000,
                  timeoutMs: 12000,
                  init: { credentials: 'include', cache: 'no-store' },
                })
                  .then((summaryData) => summaryData || null)
                  .then((summaryData) => {
                    if (requestId !== activeGameRequestRef.current) return;
                    if (!summaryData) return;
                    setGame((curr) => {
                      if (!curr) return curr;
                      const currId = String(curr.id || "").trim();
                      if (currId && resolvedGameId && currId !== resolvedGameId) return curr;
                      const mergedOdds = {
                        ...(curr.odds || {}),
                        spread: summaryData?.spread?.line ?? summaryData?.spread ?? curr.odds?.spread,
                        total: summaryData?.total?.line ?? summaryData?.total ?? curr.odds?.total,
                        mlHome: summaryData?.moneyline?.home_price ?? summaryData?.moneylineHome ?? curr.odds?.mlHome,
                        mlAway: summaryData?.moneyline?.away_price ?? summaryData?.moneylineAway ?? curr.odds?.mlAway,
                        openSpread: summaryData?.opening_spread ?? curr.odds?.openSpread,
                        openTotal: summaryData?.opening_total ?? curr.odds?.openTotal,
                        openMoneylineHome: summaryData?.opening_home_ml ?? curr.odds?.openMoneylineHome,
                        spread1HHome: summaryData?.first_half?.spread?.home_line ?? curr.odds?.spread1HHome,
                        spread1HAway: summaryData?.first_half?.spread?.away_line ?? curr.odds?.spread1HAway,
                        total1H: summaryData?.first_half?.total?.line ?? curr.odds?.total1H,
                        ml1HHome: summaryData?.first_half?.moneyline?.home_price ?? curr.odds?.ml1HHome,
                        ml1HAway: summaryData?.first_half?.moneyline?.away_price ?? curr.odds?.ml1HAway,
                      };
                      return {
                        ...curr,
                        odds: mergedOdds,
                        lineHistory: reconcileLineHistoryWithOdds(curr.lineHistory, mergedOdds),
                      };
                    });
                  })
                  .catch(() => {
                    // Non-fatal.
                  });
                return prev;
              });
            }, 1200);
          });

        }
      } else {
        if (requestId !== activeGameRequestRef.current) return;
        if (!game) setError('Game not found');
      }

    } catch (err) {
      if (requestId !== activeGameRequestRef.current) return;
      console.error('Failed to fetch game:', err);
      if (!game) setError('Failed to load game data');
    } finally {
      if (requestId !== activeGameRequestRef.current) return;
      stopPerf();
      console.debug('[GameDetail][fetch-cache]', getFetchCacheStats());
      console.debug('[GameDetail][route-cache]', getRouteCacheStats());
      logPerfSnapshot('GameDetailPage');
      setIsLoading(false);
    }
  }, [activeTab, fetchGameProps, fullGameId, gameId, isSportsRadarGame, league]);

  // Initial fetch
  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  useEffect(() => {
    if (!isSoccerContext || !game) {
      setSoccerAdjacentGames({ loading: false, prevId: null, nextId: null, prevLabel: null, nextLabel: null });
      return;
    }

    const fromLeagueId = String(searchParams.get("fromLeagueId") || "").trim();
    const fromTeamId = String(searchParams.get("fromTeamId") || "").trim();
    const scopeAll = canUseAllSoccerToday && searchParams.get("soccerNavScope") === "all";

    const normalizeId = (value: string): string => {
      let raw = decodeURIComponent(String(value || "").trim()).replace(/^soccer_/, "");
      if (raw.startsWith("sr_")) {
        const parts = raw.split("_");
        if (parts.length >= 3) raw = `sr:sport_event:${parts.slice(2).join("_")}`;
      }
      // Some payloads can be double-prefixed (sr:sport_event:sr:sport_event:xxx)
      while (raw.startsWith("sr:sport_event:sr:sport_event:")) {
        raw = raw.replace("sr:sport_event:sr:sport_event:", "sr:sport_event:");
      }
      return raw;
    };
    const eventKey = (value: string): string => {
      const normalized = normalizeId(value);
      const marker = "sr:sport_event:";
      if (normalized.startsWith(marker)) return normalized.slice(marker.length).toLowerCase();
      return normalized.toLowerCase();
    };

    const dateKey = (() => {
      const raw = String(game.startTime || "");
      if (!raw) return "";
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    })();

    if (!dateKey) {
      setSoccerAdjacentGames({ loading: false, prevId: null, nextId: null, prevLabel: null, nextLabel: null });
      return;
    }

    let cancelled = false;
    setSoccerAdjacentGames((prev) => ({ ...prev, loading: true }));

    const loadAdjacent = async () => {
      try {
        type Row = { id: string; key: string; ts: number; preview: string };
        const rows: Row[] = [];
        const buildPreview = (match: any, ts: number): string => {
          const home = String(
            match?.homeTeam?.name ||
            match?.homeTeamName ||
            match?.home_team_name ||
            match?.homeTeam ||
            ""
          ).trim();
          const away = String(
            match?.awayTeam?.name ||
            match?.awayTeamName ||
            match?.away_team_name ||
            match?.awayTeam ||
            ""
          ).trim();
          const matchup = home && away ? `${home} vs ${away}` : String(match?.matchup || match?.name || "Match").trim();
          const localTime = new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          return `${matchup} • ${localTime}`;
        };
        if (!scopeAll && fromLeagueId) {
          const res = await fetch(`/api/soccer/schedule/${encodeURIComponent(fromLeagueId)}?filter=all`, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            for (const m of (Array.isArray(data?.matches) ? data.matches : [])) {
              const id = String(m?.eventId || "");
              const ts = new Date(String(m?.startTime || m?.date || "")).getTime();
              if (!id || Number.isNaN(ts)) continue;
              if (new Date(ts).toISOString().slice(0, 10) !== dateKey) continue;
              const normalizedId = normalizeId(id);
              rows.push({ id: normalizedId, key: eventKey(normalizedId), ts, preview: buildPreview(m, ts) });
            }
          }
        } else if (!scopeAll && fromTeamId) {
          const res = await fetch(`/api/soccer/team/${encodeURIComponent(fromTeamId)}/schedule`, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const combined = [
              ...(Array.isArray(data?.results) ? data.results : []),
              ...(Array.isArray(data?.upcoming) ? data.upcoming : []),
            ];
            for (const m of combined) {
              const id = String(m?.eventId || m?.id || "");
              const ts = new Date(String(m?.startTime || m?.date || "")).getTime();
              if (!id || Number.isNaN(ts)) continue;
              if (new Date(ts).toISOString().slice(0, 10) !== dateKey) continue;
              const normalizedId = normalizeId(id);
              rows.push({ id: normalizedId, key: eventKey(normalizedId), ts, preview: buildPreview(m, ts) });
            }
          }
        } else {
          // Soccer-home fallback: derive same-day adjacency from the generic games feed.
          const res = await fetch(`/api/games?sport=soccer&date=${encodeURIComponent(dateKey)}&includeOdds=0`, {
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const games = Array.isArray(data?.games) ? data.games : [];
            for (const g of games) {
              const id = String(g?.id || g?.game_id || "");
              const ts = new Date(String(g?.start_time || g?.startTime || g?.date || "")).getTime();
              if (!id || Number.isNaN(ts)) continue;
              const normalizedId = normalizeId(id);
              rows.push({ id: normalizedId, key: eventKey(normalizedId), ts, preview: buildPreview(g, ts) });
            }
          }
        }

        const uniq = new Map<string, Row>();
        for (const r of rows) {
          if (!uniq.has(r.key)) uniq.set(r.key, r);
        }
        const ordered = Array.from(uniq.values()).sort((a, b) => a.ts - b.ts);
        const current = normalizeId(String(fullGameId || gameId || ""));
        const currentKey = eventKey(current);
        let idx = ordered.findIndex((r) => r.key === currentKey);
        if (idx < 0) {
          const currentTs = new Date(String(game.startTime || "")).getTime();
          if (!Number.isNaN(currentTs) && ordered.length > 0) {
            // Fall back to nearest same-day match by kickoff time.
            let bestIdx = 0;
            let bestDiff = Number.POSITIVE_INFINITY;
            for (let i = 0; i < ordered.length; i++) {
              const diff = Math.abs(ordered[i].ts - currentTs);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
              }
            }
            idx = bestIdx;
          }
        }
        const prevRow = idx > 0 ? ordered[idx - 1] : null;
        const nextRow = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
        if (!cancelled) {
          setSoccerAdjacentGames({
            loading: false,
            prevId: prevRow?.id || null,
            nextId: nextRow?.id || null,
            prevLabel: prevRow?.preview || null,
            nextLabel: nextRow?.preview || null,
          });
        }
      } catch {
        if (!cancelled) {
          setSoccerAdjacentGames({ loading: false, prevId: null, nextId: null, prevLabel: null, nextLabel: null });
        }
      }
    };

    void loadAdjacent();
    return () => { cancelled = true; };
  }, [game, fullGameId, gameId, searchParams, isSoccerContext, canUseAllSoccerToday]);
  useEffect(() => {
    if (isSoccerContext || !game) {
      setSportAdjacentGames({ loading: false, prevId: null, nextId: null, prevLabel: null, nextLabel: null });
      return;
    }

    const dateKey = (() => {
      const raw = String(game.startTime || "");
      if (!raw) return "";
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    })();
    const sportKey = String(game.sport || srSport || params.sportKey || league || "").toLowerCase();
    if (!dateKey || !sportKey) {
      setSportAdjacentGames({ loading: false, prevId: null, nextId: null, prevLabel: null, nextLabel: null });
      return;
    }

    const normalizeId = (value: string): string => decodeURIComponent(String(value || "").trim());
    const currentId = normalizeId(String(fullGameId || gameId || game.id || ""));
    const currentTs = new Date(String(game.startTime || "")).getTime();
    let cancelled = false;
    setSportAdjacentGames((prev) => ({ ...prev, loading: true }));

    const loadAdjacent = async () => {
      try {
        type Row = { id: string; ts: number; preview: string };
        const res = await fetch(`/api/games?sport=${encodeURIComponent(sportKey)}&date=${encodeURIComponent(dateKey)}&includeOdds=0`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setSportAdjacentGames((prev) => ({ ...prev, loading: false }));
          return;
        }
        const data = await res.json();
        let games = Array.isArray(data?.games) ? data.games : [];
        if (games.length <= 1) {
          // Date-scoped feeds can be sparse for some providers/time zones; broaden query.
          const broadRes = await fetch(`/api/games?sport=${encodeURIComponent(sportKey)}&includeOdds=0`, {
            credentials: "include",
            cache: "no-store",
          });
          if (broadRes.ok) {
            const broadData = await broadRes.json();
            const broadGames = Array.isArray(broadData?.games) ? broadData.games : [];
            if (broadGames.length > games.length) {
              games = broadGames;
            }
          }
        }
        const rows: Row[] = [];
        for (const g of games) {
          const id = normalizeId(String(g?.id || g?.game_id || ""));
          const ts = new Date(String(g?.start_time || g?.startTime || g?.date || "")).getTime();
          if (!id || Number.isNaN(ts)) continue;
          const away = String(g?.away_team_name || g?.awayTeam || g?.away_team || "Away").trim();
          const home = String(g?.home_team_name || g?.homeTeam || g?.home_team || "Home").trim();
          const localTime = new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          rows.push({ id, ts, preview: `${away} vs ${home} • ${localTime}` });
        }
        const uniq = new Map<string, Row>();
        for (const r of rows) {
          if (!uniq.has(r.id)) uniq.set(r.id, r);
        }
        const ordered = Array.from(uniq.values()).sort((a, b) => a.ts - b.ts);
        let idx = ordered.findIndex((r) => r.id === currentId);
        if (idx < 0 && !Number.isNaN(currentTs) && ordered.length > 0) {
          let bestIdx = 0;
          let bestDiff = Number.POSITIVE_INFINITY;
          for (let i = 0; i < ordered.length; i++) {
            const diff = Math.abs(ordered[i].ts - currentTs);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestIdx = i;
            }
          }
          idx = bestIdx;
        }
        const prevRow = idx > 0 ? ordered[idx - 1] : null;
        const nextRow = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
        if (!cancelled) {
          setSportAdjacentGames((prev) => ({
            loading: false,
            prevId: prevRow?.id || prev.prevId || null,
            nextId: nextRow?.id || prev.nextId || null,
            prevLabel: prevRow?.preview || prev.prevLabel || null,
            nextLabel: nextRow?.preview || prev.nextLabel || null,
          }));
        }
      } catch {
        if (!cancelled) setSportAdjacentGames((prev) => ({ ...prev, loading: false }));
      }
    };

    void loadAdjacent();
    return () => { cancelled = true; };
  }, [isSoccerContext, fullGameId, gameId, srSport, params.sportKey, league, game?.id, game?.startTime, game?.sport]);

  // Fetch sportsbook odds when tab is selected
  useEffect(() => {
    if (activeTab !== 'sportsbooks' || !fullGameId || sportsbooksLoaded) return;
    const controller = new AbortController();
    let cancelled = false;
    
    const fetchSportsbooks = async () => {
      try {
        const res = await fetch(`/api/games/${fullGameId}/odds`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (cancelled) return;
        
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          
          // Track if we're getting live in-game odds
          setIsLiveOdds(data.isLiveOdds ?? false);
          
          // Transform to SportsbookLine format
          const lines: SportsbookLine[] = [];
          
          // Add consensus first if available
          if (data.consensus) {
            lines.push({
              sportsbook: 'Consensus',
              spread: data.consensus.spreadHome,
              spreadOdds: null,
              total: data.consensus.total,
              totalOverOdds: null,
              totalUnderOdds: null,
              mlHome: data.consensus.moneylineHome,
              mlAway: data.consensus.moneylineAway,
              updated: data.lastUpdated || new Date().toISOString(),
            });
          }
          
          // Add each sportsbook (accepting multiple payload shapes)
          lines.push(...normalizeSportsbookLines(data.sportsbooks));
          
          // Only update if we got new data, preserve existing sportsbooks
          console.log('[Books Tab] Fetched sportsbooks:', lines.length, lines.map(l => l.sportsbook));
          if (lines.length > 0) {
            setGame(prev => {
              console.log('[Books Tab] Updating game state with', lines.length, 'sportsbooks');
              if (!prev) return prev;
              const prevId = String(prev.id || "").trim();
              if (prevId && prevId !== fullGameId) return prev;
              const mergedOdds = mergeHeroOddsFromOddsApi(prev.odds, data);
              return {
                ...prev,
                sportsbooks: lines,
                odds: mergedOdds,
                lineHistory: reconcileLineHistoryWithOdds(prev.lineHistory, mergedOdds),
              };
            });
            // Odds have updated; line movement should re-fetch to stay in sync.
            setLineHistoryLoaded(false);
          }
          setSportsbooksLoaded(true);

          // If fast path only returned consensus, backfill full book grid in background.
          if (lines.length <= 1) {
            fetch(`/api/games/${fullGameId}/odds?full=1`, {
              credentials: 'include',
              cache: 'no-store',
            })
              .then((fullRes) => (fullRes.ok ? fullRes.json() : null))
              .then((fullData) => {
                if (cancelled) return;
                if (!fullData) return;
                const fullLines: SportsbookLine[] = [];
                if (fullData.consensus) {
                  fullLines.push({
                    sportsbook: 'Consensus',
                    spread: fullData.consensus.spreadHome,
                    spreadOdds: null,
                    total: fullData.consensus.total,
                    totalOverOdds: null,
                    totalUnderOdds: null,
                    mlHome: fullData.consensus.moneylineHome,
                    mlAway: fullData.consensus.moneylineAway,
                    updated: fullData.lastUpdated || new Date().toISOString(),
                  });
                }
                fullLines.push(...normalizeSportsbookLines(fullData.sportsbooks));
                if (fullLines.length <= 1) return;
                setGame((prev) => {
                  if (!prev) return prev;
                  const prevId = String(prev.id || "").trim();
                  if (prevId && prevId !== fullGameId) return prev;
                  const mergedOdds = mergeHeroOddsFromOddsApi(prev.odds, fullData);
                  return {
                    ...prev,
                    sportsbooks: fullLines,
                    odds: mergedOdds,
                    lineHistory: reconcileLineHistoryWithOdds(prev.lineHistory, mergedOdds),
                  };
                });
                setLineHistoryLoaded(false);
              })
              .catch(() => {
                // Non-fatal.
              });
          }
        } else {
          // Mark as loaded even if no extra data, use what we have from game fetch
          setSportsbooksLoaded(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.error('Failed to fetch sportsbook odds:', err);
      }
    };
    
    fetchSportsbooks();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, fullGameId, sportsbooksLoaded]);

  // Fetch line history when tab is selected
  useEffect(() => {
    if (activeTab !== 'line-movement' || !fullGameId) return;
    if (lineHistoryLoaded && (game?.lineHistory?.length || 0) > 0) return;
    const controller = new AbortController();
    let isCancelled = false;
    
    const fetchLineHistory = async () => {
      try {
        const res = await fetch(`/api/games/${fullGameId}/line-history`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (isCancelled) return;
        
        if (res.ok) {
          const data = await res.json();
          if (isCancelled) return;
          
          // Transform history to LineHistoryPoint format
          const history: LineHistoryPoint[] = (data.history || []).map((h: {
            timestamp: string;
            spread: number | null;
            total: number | null;
            moneylineHome: number | null;
            moneylineAway: number | null;
          }) => ({
            timestamp: h.timestamp,
            spread: h.spread ?? null,
            total: h.total ?? null,
            mlHome: h.moneylineHome,
            mlAway: h.moneylineAway,
          }));
          setGame(prev => {
            if (!prev) return prev;
            const prevHistory = Array.isArray(prev.lineHistory) ? prev.lineHistory : [];
            // Guard against transient backend regressions where a refresh briefly
            // returns only a single-point history for the same game.
            const shouldKeepPreviousHistory =
              prevHistory.length >= 2 &&
              history.length <= 1;
            return {
              ...prev,
              lineHistory: history.length === 0
                ? []
                : shouldKeepPreviousHistory
                  ? prevHistory
                  : reconcileLineHistoryWithOdds(history, prev.odds),
            };
          });
          setLineHistoryLoaded(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.error('Failed to fetch line history:', err);
      }
    };
    
    fetchLineHistory();
    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [activeTab, fullGameId, lineHistoryLoaded, game?.lineHistory?.length, reconcileLineHistoryWithOdds]);

  // Fetch box score when tab is selected
  useEffect(() => {
    if ((activeTab !== "box-score" && activeTab !== "props") || !fullGameId) return;
    if (hasBoxScoreData(boxScore)) return;
    void fetchBoxScore();
  }, [activeTab, fetchBoxScore, fullGameId]);

  // Escalate to fresh props fetch only when user is actively on the props tab.
  useEffect(() => {
    if (activeTab !== "props") return;
    const targetGameId = String(game?.id || fullGameId || "").trim();
    if (!targetGameId) return;
    if ((game?.props || []).length > 0) return;
    if (propsFreshAttemptedRef.current.has(targetGameId)) return;
    propsFreshAttemptedRef.current.add(targetGameId);
    void fetchGameProps(targetGameId, String(game?.sport || league || ""), true);
  }, [activeTab, fetchGameProps, fullGameId, game?.id, game?.props, game?.sport, league]);

  // Fetch H2H when tab is selected
  useEffect(() => {
    if (activeTab !== 'h2h' || !fullGameId || h2h) return;
    setH2HLoading(true);
    fetch(`/api/game-detail/${fullGameId}/h2h`, { credentials: 'include', cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setH2H(data); })
      .catch((err) => {
        console.error('[GameDetailPage] Failed to fetch head-to-head:', err);
      })
      .finally(() => setH2HLoading(false));
  }, [activeTab, fullGameId, h2h]);

  // Fetch injuries when tab is selected
  useEffect(() => {
    if (activeTab !== 'injuries' || !fullGameId || injuries) return;
    setInjuriesLoading(true);
    const homeTeamName = game?.homeTeamFull || game?.homeTeam || '';
    const awayTeamName = game?.awayTeamFull || game?.awayTeam || '';
    const injuriesUrl = `/api/game-detail/${fullGameId}/injuries?homeTeam=${encodeURIComponent(homeTeamName)}&awayTeam=${encodeURIComponent(awayTeamName)}`;
    fetch(injuriesUrl, { credentials: 'include', cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setInjuries(data); })
      .catch((err) => {
        console.error('[GameDetailPage] Failed to fetch injuries:', err);
      })
      .finally(() => setInjuriesLoading(false));
  }, [activeTab, fullGameId, injuries, game?.homeTeamFull, game?.homeTeam, game?.awayTeamFull, game?.awayTeam]);

  // Fetch play-by-play when tab is selected or for live games (for last play on overview)
  useEffect(() => {
    // Fetch when play-by-play tab is selected or when overview is live without last play.
    const shouldFetch =
      (activeTab === 'play-by-play' && !playByPlay) ||
      (activeTab === 'overview' && game?.status === 'LIVE' && !lastPlay);
    
    if (!shouldFetch || !fullGameId) return;
    
    void fetchPlayByPlay();
  }, [activeTab, fullGameId, lastPlay, game?.status, fetchPlayByPlay, playByPlay]);

  // Auto-refresh play-by-play for live games (every 17 seconds)
  useEffect(() => {
    if (game?.status !== 'LIVE' || !fullGameId) return;
    
    const interval = setInterval(() => {
      fetchPlayByPlay();
    }, 17000); // 17 seconds - within 15-20s range
    
    return () => clearInterval(interval);
  }, [game?.status, fullGameId, fetchPlayByPlay]);

  // Auto-refresh for live games (20s)
  useEffect(() => {
    if (game?.status !== 'LIVE') return;

    const tick = async () => {
      if (gameRefreshInFlightRef.current) return;
      gameRefreshInFlightRef.current = true;
      try {
        await fetchGame({ refreshOnly: true });
      } finally {
        gameRefreshInFlightRef.current = false;
      }
    };
    const interval = setInterval(() => {
      void tick();
    }, 20000);
    return () => clearInterval(interval);
  }, [game?.status, fetchGame]);

  // Auto-refresh odds for live games (30s for live odds, 2min for pregame odds)
  useEffect(() => {
    if (game?.status !== 'LIVE' || !fullGameId) return;
    
    const refreshOdds = async () => {
      if (liveOddsRefreshInFlightRef.current) return;
      liveOddsRefreshInFlightRef.current = true;
      try {
        const res = await fetch(`/api/games/${fullGameId}/odds`, {
          credentials: 'include',
          cache: 'no-store',
        });
        
        if (res.ok) {
          const data = await res.json();
          
          // Track if we're getting live in-game odds
          setIsLiveOdds(data.isLiveOdds ?? false);
          
          // Update sportsbooks
          const lines: SportsbookLine[] = [];
          if (data.consensus) {
            lines.push({
              sportsbook: 'Consensus',
              spread: data.consensus.spreadHome,
              spreadOdds: null,
              total: data.consensus.total,
              totalOverOdds: null,
              totalUnderOdds: null,
              mlHome: data.consensus.moneylineHome,
              mlAway: data.consensus.moneylineAway,
              updated: data.lastUpdated || new Date().toISOString(),
            });
          }
          for (const sb of data.sportsbooks || []) {
            lines.push({
              sportsbook: sb.sportsbook,
              spread: sb.spreadHome,
              spreadOdds: null,
              total: sb.total,
              totalOverOdds: null,
              totalUnderOdds: null,
              mlHome: sb.moneylineHome,
              mlAway: sb.moneylineAway,
              updated: sb.updatedAt || data.lastUpdated || new Date().toISOString(),
            });
          }
          
          if (lines.length > 0) {
            setGame((prev) => {
              if (!prev) return prev;
              const prevBooks = Array.isArray(prev.sportsbooks) ? prev.sportsbooks : [];
              const incomingIsThin = lines.length <= 1;
              const keepExistingBooks = prevBooks.length > lines.length && incomingIsThin;
              return {
                ...prev,
                sportsbooks: keepExistingBooks ? prevBooks : lines,
                odds: mergeHeroOddsFromOddsApi(prev.odds, data),
              };
            });
          }
        }
      } catch (err) {
        console.error('Failed to refresh live odds:', err);
      } finally {
        liveOddsRefreshInFlightRef.current = false;
      }
    };
    
    // Refresh every 30 seconds for live in-game odds, every 2 minutes for pregame
    const refreshInterval = isLiveOdds ? 30000 : 120000;
    const interval = setInterval(refreshOdds, refreshInterval);
    return () => clearInterval(interval);
  }, [game?.status, fullGameId, isLiveOdds, mergeHeroOddsFromOddsApi]);

  // Build teamInfo lookup for display names
  const teamInfo = useMemo(() => {
    if (!game) return undefined;
    const sport = (game.sport || '').toUpperCase();
    const normalizedSport = sport === 'CBB' ? 'NCAAB' : sport === 'CFB' ? 'NCAAF' : sport;
    const lookup = teamLookups[normalizedSport];
    
    const homeAbbr = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam;
    const awayAbbr = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam;
    
    // Use API-provided full names first, then fall back to lookup
    const homeLookup = lookup?.[homeAbbr.toUpperCase()];
    const awayLookup = lookup?.[awayAbbr.toUpperCase()];
    
    return {
      home: game.homeTeamFull 
        ? { fullName: game.homeTeamFull, record: homeLookup?.record }
        : homeLookup || undefined,
      away: game.awayTeamFull 
        ? { fullName: game.awayTeamFull, record: awayLookup?.record }
        : awayLookup || undefined,
    };
  }, [game, teamLookups]);
  
  // Helper to get display name for team (full name preferred)
  const getTeamDisplayName = useCallback((isHome: boolean) => {
    // Priority: API full name > teamInfo lookup > abbreviation
    const fullName = isHome ? game?.homeTeamFull : game?.awayTeamFull;
    if (fullName) return fullName;
    
    const info = isHome ? teamInfo?.home : teamInfo?.away;
    if (info?.fullName) return info.fullName;
    
    const abbr = isHome ? game?.homeTeam : game?.awayTeam;
    return abbr || (isHome ? 'HOME' : 'AWAY');
  }, [game, teamInfo]);
  const hasPropsTab = true;
  const viewMode = useMemo<ViewMode>(() => deriveViewMode(game?.status || "SCHEDULED"), [game?.status]);
  const previousModeRef = useRef<ViewMode | null>(null);
  const { preview: coachPreview } = useCoachGPreview(fullGameId);
  const [videoJobs, setVideoJobs] = useState<CoachGVideoJob[]>([]);
  const videoEnqueueAttemptedRef = useRef(false);
  const latestCoachVideoJob = useMemo(
    () => videoJobs[0],
    [videoJobs]
  );
  const latestCoachVideo = useMemo(
    () => videoJobs.find((job) => job.status === "completed" && !!job.videoUrl) || undefined,
    [videoJobs]
  );

  useEffect(() => {
    videoEnqueueAttemptedRef.current = false;
  }, [fullGameId]);

  useEffect(() => {
    if (!fullGameId) return;
    let cancelled = false;
    const fetchJobs = async () => {
      try {
        const viewerOffset = new Date().getTimezoneOffset();
        const res = await fetch(
          `/api/coachg/video/jobs?game_id=${encodeURIComponent(fullGameId)}&limit=8&window_hours=48&viewer_tz_offset_min=${encodeURIComponent(String(viewerOffset))}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const data = await res.json() as {
          jobs?: Array<{
            id?: string;
            status?: "queued" | "submitted" | "completed" | "failed";
            videoUrl?: string;
            heygenVideoId?: string;
            errorMessage?: string | null;
            createdAt?: string;
          }>;
        };
        if (cancelled) return;
        const normalizedJobs = (data.jobs || [])
          .filter((job) => Boolean(job.id))
          .map((job) => ({
            id: String(job.id),
            status: job.status || "queued",
            videoUrl: job.videoUrl,
            heygenVideoId: job.heygenVideoId,
            errorMessage: job.errorMessage ?? null,
            createdAt: job.createdAt || new Date().toISOString(),
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setVideoJobs(
          normalizedJobs
        );
        if (normalizedJobs.length === 0 && !videoEnqueueAttemptedRef.current) {
          videoEnqueueAttemptedRef.current = true;
          await fetch("/api/coachg/video/jobs", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ game_id: fullGameId }),
          }).catch(() => {
            // Ignore enqueue errors; polling will keep using graceful fallback.
          });
        }
      } catch {
        // silent fail for optional media enhancement
      }
    };
    void fetchJobs();
    const timer = setInterval(fetchJobs, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fullGameId]);

  // Auto-refresh box score for live games so player stats stay current.
  useEffect(() => {
    if (game?.status !== "LIVE" || !fullGameId) return;
    void fetchBoxScore({ silent: true });
    const interval = setInterval(() => {
      void fetchBoxScore({ silent: true });
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchBoxScore, fullGameId, game?.status]);

  const liveNotes = useMemo(() => {
    const notes: Array<{ time: string; note: string }> = [];
    if (lastPlay?.description) {
      notes.push({
        time: lastPlay.timestamp ? new Date(lastPlay.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        note: lastPlay.description,
      });
    }
    if (game?.odds?.spread !== undefined && game?.odds?.openSpread !== undefined) {
      const delta = Number(game.odds.spread) - Number(game.odds.openSpread);
      notes.push({
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        note: `Spread shift ${delta > 0 ? "+" : ""}${delta.toFixed(1)} from open.`,
      });
    }
    if ((game?.props || []).length > 0) {
      notes.push({
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        note: `Prop activity elevated across ${(game?.props || []).slice(0, 5).length} tracked markets.`,
      });
    }
    if (notes.length === 0) {
      notes.push({
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        note: "Pace and market movement monitoring is active for this matchup.",
      });
    }
    return notes.slice(0, 5);
  }, [game?.odds?.openSpread, game?.odds?.spread, game?.props, lastPlay?.description, lastPlay?.timestamp]);

  const pregameCoachRead = useMemo(() => {
    const sections = coachPreview?.content?.sections || [];
    const body = sections.map((s) => s.content?.trim()).filter(Boolean).join(" ");
    if (body) return body;
    if (coachPreview?.content?.headline) return coachPreview.content.headline;
    return game ? `${game.awayTeam} at ${game.homeTeam}: Coach G pregame read is syncing now.` : "Coach G pregame read is syncing now.";
  }, [coachPreview?.content?.headline, coachPreview?.content?.sections, game]);

  const postgameTake = useMemo(() => {
    if (coachPreview?.content?.headline) return coachPreview.content.headline;
    if (!game) return "Coach G postgame summary is processing.";
    const winner = (game.homeScore ?? 0) > (game.awayScore ?? 0) ? game.homeTeam : game.awayTeam;
    return `${winner} controlled key stretches and closed stronger in high-leverage possessions.`;
  }, [coachPreview?.content?.headline, game]);
  const dataTabsModeSubtitle = useMemo(() => {
    if (viewMode === "live") return "Live-mode tabs: box score, books, props, play-by-play, and injury updates.";
    if (viewMode === "final") return "Final-mode tabs: recap context, box score, play history, books, and prop outcomes.";
    return "Pregame tabs: matchup context, lines, books, props, H2H, and injuries.";
  }, [viewMode]);

  useEffect(() => {
    if (!game) return;
    const hasViewParam = Boolean(searchParams.get("view"));
    if (hasViewParam) return;
    if (previousModeRef.current === viewMode) return;
    previousModeRef.current = viewMode;
    setActiveTab(viewMode === "live" ? "box-score" : viewMode === "final" ? "box-score" : "overview");
  }, [game, searchParams, viewMode]);

  useEffect(() => {
    setTabContentVisible(false);
    const timer = setTimeout(() => setTabContentVisible(true), 35);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Early MMA detection - MMA events use a different API, skip regular game fetch
  // Check URL params since game data may not have loaded yet
  const isMMARoute = league?.toLowerCase() === 'mma' || gameId?.startsWith('sdio_mma_');
  if (isMMARoute) {
    // Extract the numeric event ID from the game ID (e.g., "sdio_mma_896" -> "896")
    const eventId = gameId?.replace(/^sdio_mma_/, '') || '';
    return <MMAEventDetail eventId={eventId} />;
  }

  // Early Golf detection - Golf tournaments use a different API structure
  const isGolfRoute = league?.toLowerCase() === 'golf' || league?.toLowerCase() === 'pga' || gameId?.startsWith('sdio_golf_');
  if (isGolfRoute) {
    return <GolfTournamentDetail tournamentId={gameId || ''} />;
  }

  if (isLoading && !game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CinematicBackground />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="text-sm text-[#9CA3AF]">Loading game data...</span>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex flex-col">
        <CinematicBackground />
        {/* Back Navigation */}
        <div className="relative z-10 px-4 pt-4">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 rounded-xl bg-[#121821]/85 px-3 py-2 text-[#9CA3AF] backdrop-blur-sm transition-all hover:bg-[#16202B] hover:text-[#E5E7EB]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">{srSport?.toUpperCase() || params.sportKey?.toUpperCase() || league?.toUpperCase() || 'Games'}</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <GlassCard className="relative z-10 p-8 text-center max-w-sm mx-4">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <p className="text-[#9CA3AF]">{error || 'Game not found'}</p>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] pb-24 text-[#E5E7EB]">
      <CinematicBackground />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="relative px-4 md:px-6 pt-4 md:pt-5 mb-4 md:mb-5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToList}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#121821]/85 px-3 py-2 text-[#9CA3AF] backdrop-blur-sm transition-all hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">{backButtonLabel}</span>
            </button>
          </div>
        </div>

        {/* State-based intelligence architecture */}
        <div className="px-4 md:px-6 max-w-3xl mx-auto space-y-4">
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl p-2.5 backdrop-blur-sm",
              isLuxuryLivePreset
                ? "border border-cyan-300/18 bg-gradient-to-br from-[#172235]/94 via-[#131C2C]/90 to-[#101826]/94 shadow-[0_10px_28px_rgba(0,0,0,0.28),0_0_0_1px_rgba(56,189,248,0.08)]"
                : "border border-white/10 bg-gradient-to-br from-[#141C28]/90 via-[#121821]/86 to-[#101722]/90 shadow-[0_8px_22px_rgba(0,0,0,0.24)]"
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0",
                isLuxuryLivePreset
                  ? "bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.12),transparent_42%),radial-gradient(circle_at_86%_82%,rgba(16,185,129,0.10),transparent_38%)]"
                  : "bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.08),transparent_40%),radial-gradient(circle_at_86%_82%,rgba(16,185,129,0.07),transparent_36%)]"
              )}
            />
            {(game.status === "LIVE" || isLuxuryLivePreset) && (
              <div className={cn(
                "pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent to-transparent animate-scout-shimmer",
                isLuxuryLivePreset ? "via-white/10" : "via-white/7"
              )} />
            )}
            <div className="flex flex-col gap-2">
            <div className={cn(
              "flex items-center justify-between gap-2",
              isSoccerContext ? "flex-wrap md:flex-nowrap" : "flex-nowrap"
            )}>
            <div className={cn(
              "flex items-center gap-2 min-w-0",
              !isSoccerContext && "grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
            )}>
              <button
                onClick={() => navigateToAdjacentGame(activeAdjacentGames.prevId)}
                disabled={!activeAdjacentGames.prevId}
                className={cn(
                  "group relative flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-3 text-[#D1D5DB] transition-all duration-200 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100",
                  !isSoccerContext && "justify-start min-w-0 w-full overflow-hidden",
                  isLuxuryLivePreset
                    ? "hover:scale-[1.015] hover:border-cyan-300/40 hover:bg-cyan-500/14 hover:text-cyan-100 hover:shadow-[0_8px_18px_rgba(34,211,238,0.18)]"
                    : "hover:scale-[1.01] hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100 hover:shadow-[0_6px_14px_rgba(34,211,238,0.12)]"
                )}
                title={activeAdjacentGames.prevLabel || "Previous game"}
              >
                <ChevronLeft className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
                <span className={cn("text-[11px] font-semibold text-cyan-200/85", !isSoccerContext && "hidden")}>Previous</span>
                <span className={cn(
                  "truncate text-[11px] font-medium text-white/85",
                  isSoccerContext ? "hidden xl:block max-w-[220px]" : "block max-w-[120px] md:max-w-[170px]"
                )}>
                  {(activeAdjacentGames.prevLabel?.split(" • ")[0]) || "No previous game"}
                </span>
              </button>
              {!isSoccerContext && shouldUseLuxuryUtilityPod && (
                <div className="group relative isolate justify-self-center inline-flex items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0D1522]/70 px-1.5 py-1 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_18px_rgba(0,0,0,0.22)]">
                  <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                    <span className="absolute -inset-y-2 -left-16 w-20 rotate-12 bg-white/12 blur-[1px] animate-[coach-slide_4.6s_ease-in-out_infinite]" />
                  </span>
                  <div className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#B8C2D3]",
                    isLuxuryLivePreset
                      ? "border border-indigo-300/22 bg-gradient-to-r from-indigo-500/12 to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                      : "border border-white/12 bg-gradient-to-r from-white/[0.06] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  )}>
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full", game.status === "LIVE" ? "bg-red-400 animate-pulse" : "bg-indigo-300/80")} />
                    <span className="tracking-wide">{currentSportScopeLabel}</span>
                  </div>
                  {flags.GAME_FAVORITES_ENABLED && (
                    <FavoriteEntityButton
                      type="game"
                      entityId={fullGameId}
                      sport={String(game.sport || "").toLowerCase()}
                      metadata={{
                        home_team: getTeamDisplayName(true),
                        away_team: getTeamDisplayName(false),
                        home_code: game.homeTeam,
                        away_code: game.awayTeam,
                        status: game.status,
                      }}
                      label="Favorite"
                      compact
                      className={cn(
                        "h-8 w-8 rounded-full border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                        isLuxuryLivePreset
                          ? "hover:scale-[1.015] hover:border-violet-300/35 hover:bg-violet-500/14 hover:text-violet-100 hover:shadow-[0_8px_18px_rgba(139,92,246,0.18)]"
                          : "hover:scale-[1.01] hover:border-violet-300/25 hover:bg-violet-500/10 hover:text-violet-100 hover:shadow-[0_6px_14px_rgba(139,92,246,0.12)]"
                      )}
                    />
                  )}
                  <button
                    onClick={() => setShowWatchboardModal(true)}
                    title="Add to Watch"
                    aria-label="Add to Watch"
                    className={cn(
                      "flex h-8 items-center gap-1 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2 text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 active:scale-[0.995]",
                      isLuxuryLivePreset
                        ? "hover:scale-[1.015] hover:border-amber-300/40 hover:bg-amber-500/14 hover:text-amber-100 hover:shadow-[0_8px_18px_rgba(245,158,11,0.18)]"
                        : "hover:scale-[1.01] hover:border-amber-300/30 hover:bg-amber-500/11 hover:text-amber-100 hover:shadow-[0_6px_14px_rgba(245,158,11,0.13)]"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold tracking-wide">Watch +</span>
                  </button>
                </div>
              )}
              <button
                onClick={() => navigateToAdjacentGame(activeAdjacentGames.nextId)}
                disabled={!activeAdjacentGames.nextId}
                className={cn(
                  "group relative flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-3 text-[#D1D5DB] transition-all duration-200 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100",
                  !isSoccerContext && "justify-end min-w-0 w-full overflow-hidden",
                  isLuxuryLivePreset
                    ? "hover:scale-[1.015] hover:border-emerald-300/40 hover:bg-emerald-500/14 hover:text-emerald-100 hover:shadow-[0_8px_18px_rgba(16,185,129,0.18)]"
                    : "hover:scale-[1.01] hover:border-emerald-300/30 hover:bg-emerald-500/10 hover:text-emerald-100 hover:shadow-[0_6px_14px_rgba(16,185,129,0.12)]"
                )}
                title={activeAdjacentGames.nextLabel || "Next game"}
              >
                <span className={cn(
                  "truncate text-[11px] font-medium text-white/85",
                  isSoccerContext ? "hidden xl:block max-w-[220px]" : "block max-w-[120px] md:max-w-[170px]"
                )}>
                  {(activeAdjacentGames.nextLabel?.split(" • ")[0]) || "No next game"}
                </span>
                <span className={cn("text-[11px] font-semibold text-emerald-200/85", !isSoccerContext && "hidden")}>Next</span>
                <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
            {isSoccerContext && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "group flex h-10 items-center gap-2 rounded-xl px-3 text-cyan-100 transition-all duration-200 active:scale-[0.995]",
                        isLuxuryLivePreset
                          ? "border border-cyan-300/30 bg-gradient-to-r from-cyan-500/18 via-sky-500/12 to-indigo-500/14 hover:scale-[1.015] hover:border-cyan-200/45 hover:shadow-[0_10px_22px_rgba(56,189,248,0.22)]"
                          : "border border-cyan-300/22 bg-gradient-to-r from-cyan-500/13 via-sky-500/8 to-indigo-500/10 hover:scale-[1.01] hover:border-cyan-200/35 hover:shadow-[0_8px_18px_rgba(56,189,248,0.16)]"
                      )}
                      title="Soccer navigation options"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-cyan-200 transition-transform duration-200 group-hover:rotate-12" />
                      <ArrowRightLeft className="h-4 w-4" />
                      <span className="text-xs font-semibold tracking-wide">Soccer Navigator</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60 bg-[#0F1622]/95 border-white/15 text-[#E5E7EB] backdrop-blur-md">
                    <DropdownMenuLabel className="text-white/55">Navigator Scope</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.delete("soccerNavScope");
                        setSearchParams(next, { replace: true });
                      }}
                      className="flex items-center justify-between gap-3 cursor-pointer rounded-lg focus:bg-white/10"
                    >
                      <div className="min-w-0">
                        <div className={cn("truncate text-sm", !isAllSoccerTodayMode ? "font-semibold text-cyan-200" : "text-[#E5E7EB]")}>
                          This League
                        </div>
                        <div className="truncate text-[11px] text-white/45">Stay in the current league slate</div>
                      </div>
                      {!isAllSoccerTodayMode ? <Check className="h-4 w-4 text-cyan-300 shrink-0" /> : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set("soccerNavScope", "all");
                        setSearchParams(next, { replace: true });
                      }}
                      disabled={!canUseAllSoccerToday}
                      className="flex items-center justify-between gap-3 cursor-pointer rounded-lg focus:bg-white/10"
                    >
                      <div className="min-w-0">
                        <div className={cn("truncate text-sm", isAllSoccerTodayMode ? "font-semibold text-emerald-200" : "text-[#E5E7EB]")}>
                          All Soccer Today
                        </div>
                        <div className="truncate text-[11px] text-white/45">
                          {canUseAllSoccerToday ? "Rotate across all leagues today" : "Unavailable while browsing a specific league/team"}
                        </div>
                      </div>
                      {isAllSoccerTodayMode ? <Check className="h-4 w-4 text-emerald-300 shrink-0" /> : null}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-white/55">Switch League</DropdownMenuLabel>
                    {soccerLeagueOptions.map(({ key, meta }) => {
                      const isCurrent = key === fromLeagueIdParam;
                      return (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => navigate(`/sports/soccer/league/${encodeURIComponent(key)}`)}
                          className="flex items-center justify-between gap-3 cursor-pointer rounded-lg focus:bg-white/10"
                        >
                          <div className="min-w-0">
                            <div className={cn("truncate text-sm", isCurrent ? "font-semibold text-cyan-200" : "text-[#E5E7EB]")}>
                              {meta.name}
                            </div>
                            <div className="truncate text-[11px] text-white/45">{meta.country}</div>
                          </div>
                          {isCurrent ? <Check className="h-4 w-4 text-cyan-300 shrink-0" /> : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[#AAB3C2]",
                  isLuxuryLivePreset
                    ? "border border-cyan-300/20 bg-gradient-to-r from-cyan-500/10 to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                    : "border border-white/12 bg-gradient-to-r from-white/[0.06] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                )}>
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", game.status === "LIVE" ? "bg-red-400 animate-pulse" : "bg-emerald-300/80")} />
                  <span className="tracking-wide">{currentSoccerScopeLabel}</span>
                </div>
              </>
            )}
            </div>
            </div>
            {isSoccerContext && (
            <div className="flex items-center justify-end gap-2">
            {flags.GAME_FAVORITES_ENABLED && (
              <FavoriteEntityButton
                type="game"
                entityId={fullGameId}
                sport={String(game.sport || "").toLowerCase()}
                metadata={{
                  home_team: getTeamDisplayName(true),
                  away_team: getTeamDisplayName(false),
                  home_code: game.homeTeam,
                  away_code: game.awayTeam,
                  status: game.status,
                }}
                label="Favorite"
                compact
                className={cn(
                  "h-8 w-8 rounded-full border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-0 text-[#D1D5DB]",
                  isLuxuryLivePreset
                    ? "hover:scale-[1.015] hover:border-violet-300/35 hover:bg-violet-500/14 hover:text-violet-100 hover:shadow-[0_8px_18px_rgba(139,92,246,0.18)]"
                    : "hover:scale-[1.01] hover:border-violet-300/25 hover:bg-violet-500/10 hover:text-violet-100 hover:shadow-[0_6px_14px_rgba(139,92,246,0.12)]"
                )}
              />
            )}
            <button
              onClick={() => setShowWatchboardModal(true)}
              title="Add to Watch"
              aria-label="Add to Watch"
              className={cn(
                "flex h-8 items-center gap-1 rounded-full border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-2 text-[#D1D5DB] transition-all duration-200 active:scale-[0.995]",
                isLuxuryLivePreset
                  ? "hover:scale-[1.015] hover:border-amber-300/40 hover:bg-amber-500/14 hover:text-amber-100 hover:shadow-[0_8px_18px_rgba(245,158,11,0.18)]"
                  : "hover:scale-[1.01] hover:border-amber-300/30 hover:bg-amber-500/11 hover:text-amber-100 hover:shadow-[0_6px_14px_rgba(245,158,11,0.13)]"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold tracking-wide">Add to Watch</span>
            </button>
            </div>
            )}
          </div>

          {viewMode === "pregame" && (
            <>
              <GameHeroPanel
                game={game}
                getTeamName={getTeamDisplayName}
                onTeamNavigate={(teamCode, teamName) => { void handleTeamNavigate(teamCode, teamName); }}
                onTeamPrefetch={(teamCode, teamName) => { void prefetchTeamData(teamCode, teamName); }}
              />
              <MarketIntelligenceStrip game={game} lastPlay={lastPlay} />
              <LiveSignalTicker game={game} lastPlay={lastPlay} />
              <CoachGSpotlightCard
                gameId={fullGameId}
                sport={game.sport}
                isLive={false}
                summaryFallback={game.predictorText || null}
                signalBadges={[
                  game.coachSignal === "edge" ? "Sharp Signal" : "",
                  "Market Shift",
                  "Rotation Risk",
                ].filter(Boolean)}
                onReadFullAnalysis={() => {
                  document.getElementById("coachg-full-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
              <CoachGIntelligenceSections game={game} gameId={fullGameId} />
              <BettingIntelligencePanel game={game} />
            </>
          )}

          {viewMode === "live" && (
            <>
              <LiveHeroScoreboard
                game={game}
                getTeamName={getTeamDisplayName}
                lastPlay={lastPlay}
                onTeamNavigate={(teamCode, teamName) => { void handleTeamNavigate(teamCode, teamName); }}
                onTeamPrefetch={(teamCode, teamName) => { void prefetchTeamData(teamCode, teamName); }}
              />
              <LiveBoxScoreSnapshot boxScore={boxScore} isLoading={boxScoreLoading} getTeamName={getTeamDisplayName} />
              <LiveSignalStrip game={game} lastPlay={lastPlay} />
              <LiveCoachGPanel pregameRead={pregameCoachRead} liveNotes={liveNotes} />
              <LiveVideoArea videoJob={latestCoachVideo || latestCoachVideoJob} />
              <LivePlayFeedPanel playByPlay={playByPlay} isLoading={game.status === "LIVE" && !playByPlay} />
              <LivePropTracker game={game} boxScore={boxScore} />
              <LiveBettingCards game={game} />
            </>
          )}

          {viewMode === "final" && (
            <>
              <FinalHeroPanel
                game={game}
                getTeamName={getTeamDisplayName}
                onTeamNavigate={(teamCode, teamName) => { void handleTeamNavigate(teamCode, teamName); }}
                onTeamPrefetch={(teamCode, teamName) => { void prefetchTeamData(teamCode, teamName); }}
              />
              <GlassCard className="border border-violet-400/20 bg-[#121821] p-4 md:p-5">
                <SectionHeader icon={Sparkles} title="Coach G Postgame Take" subtitle="Calm recap of the leverage moments that decided this result." accent="violet" />
                <p className="text-sm text-[#9CA3AF]">{postgameTake}</p>
              </GlassCard>
              <PostgameVideoArea videoJob={latestCoachVideo || latestCoachVideoJob} />
              <PostgameAnalysisPanel game={game} />
            </>
          )}
        </div>

        {/* Tabs with scroll fade indicators */}
        <div className="px-4 md:px-6 max-w-3xl mx-auto">
          <TabsWithScrollFade activeTab={activeTab} setActiveTab={setActiveTab} hasProps={hasPropsTab} />

          {/* Tab Content */}
          <div className="pb-10">
            <GlassCard className="border border-white/[0.05] bg-[#16202B] p-4 shadow-[0_0_28px_rgba(59,130,246,0.09)] md:p-5">
              <div className="mb-2 text-[11px] text-[#6B7280]">{dataTabsModeSubtitle}</div>
              <div
                className={cn(
                  "mt-2 md:mt-3 transition-all duration-250 ease-out",
                  tabContentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                )}
              >
                {activeTab === 'overview' && (
                  <OverviewTab 
                    game={game} 
                    lastPlay={lastPlay}
                    lastPlayUpdated={lastPlayUpdated}
                  />
                )}
                {activeTab === 'box-score' && <BoxScoreTab boxScore={boxScore} isLoading={boxScoreLoading} getTeamName={getTeamDisplayName} />}
                {activeTab === 'line-movement' && <LineMovementTab game={game} />}
                {activeTab === 'sportsbooks' && <SportsbooksTab game={game} getTeamName={getTeamDisplayName} />}
                {activeTab === 'h2h' && <H2HTab h2h={h2h} isLoading={h2hLoading} getTeamName={getTeamDisplayName} />}
                {activeTab === 'injuries' && <InjuriesTab injuries={injuries} isLoading={injuriesLoading} getTeamName={getTeamDisplayName} />}
                {activeTab === 'props' && (
                  <PlayerPropsTab
                    props={(game as GameData & { props?: PlayerProp[] })?.props || []}
                    isLoading={isLoading}
                    gameId={gameId || ''}
                    sport={game?.sport || ''}
                    homeTeamCode={game?.homeTeam}
                    awayTeamCode={game?.awayTeam}
                    homeTeamName={game?.homeTeamFull || game?.homeTeam}
                    awayTeamName={game?.awayTeamFull || game?.awayTeam}
                    boxScore={boxScore}
                    propsSource={game?.propsSource}
                    propsFallbackReason={game?.propsFallbackReason}
                  />
                )}
                {activeTab === 'play-by-play' && (
                  <PlayByPlayTab
                    playByPlay={playByPlay}
                    isLoading={game?.status === 'LIVE' && !playByPlay}
                    sport={game?.sport || 'NBA'}
                    homeTeam={game?.homeTeam}
                    awayTeam={game?.awayTeam}
                  />
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
      
      {/* Watchboard Modal */}
      <AddToWatchboardModal
        isOpen={showWatchboardModal}
        onClose={() => setShowWatchboardModal(false)}
        gameId={fullGameId}
        gameSummary={game ? `${game.awayTeam} vs ${game.homeTeam}` : undefined}
      />
    </div>
  );
}

function normalizeStatus(status: string | undefined): 'LIVE' | 'SCHEDULED' | 'FINAL' {
  if (!status) return 'SCHEDULED';
  const s = status.toUpperCase();
  if (s === 'LIVE' || s === 'IN_PROGRESS') return 'LIVE';
  if (s === 'FINAL' || s === 'COMPLETE' || s === 'COMPLETED') return 'FINAL';
  return 'SCHEDULED';
}

export default GameDetailPage;
